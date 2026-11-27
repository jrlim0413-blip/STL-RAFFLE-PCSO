import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.RAFFLE_SKIP_ENV_FILE !== '1') {
  for (const envFile of [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', 'src', '.env')
  ]) {
    try {
      process.loadEnvFile(envFile);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
const DATA_DIR = process.env.RAFFLE_DATA_DIR || path.join(__dirname, '..', 'data');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DRAW_FILE = path.join(DATA_DIR, 'draw.json');
const TASK_COMPLETIONS_FILE = path.join(DATA_DIR, 'task-completions.json');
const LIVE_VIEWERS_FILE = path.join(DATA_DIR, 'live-viewers.json');
const PROOFS_DIR = path.join(DATA_DIR, 'proofs');
const LIVE_VIEWER_TTL_MS = 45000;
const viewerStatsCache = new Map();
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (Boolean(supabaseUrl) !== Boolean(supabaseServiceRoleKey)) {
  throw new Error('Set both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or leave both unset for local storage.');
}
if (process.env.VERCEL && !supabaseUrl) {
  throw new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for persistent raffle storage on Vercel.');
}

const supabase = supabaseUrl
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;
const entriesBucket = process.env.SUPABASE_ENTRIES_BUCKET || 'raffle-entries';
const proofsBucket = process.env.SUPABASE_PROOFS_BUCKET || 'raffle-proofs';

if (!supabase) {
  fs.mkdirSync(PROOFS_DIR, { recursive: true });
}

function readJsonFile(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonFile(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function throwIfError(error, operation) {
  if (error) {
    const wrapped = new Error(`${operation}: ${error.message}`);
    wrapped.code = error.code;
    throw wrapped;
  }
}

function raffleError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hasParticipantDetails(entry) {
  return Boolean(
    entry &&
    typeof entry === 'object' &&
    typeof entry.ticket === 'string' &&
    typeof entry.agent === 'string' &&
    typeof entry.contact === 'string' &&
    Array.isArray(entry.proofs)
  );
}

function entryObjectPath(ticket) {
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9-]+$/.test(ticket)) {
    throw new Error('Invalid raffle ticket code.');
  }
  return `entries/${ticket}.json`;
}

function hashContact(contact) {
  return crypto
    .createHmac('sha256', supabaseServiceRoleKey)
    .update(contact.replace(/\D/g, ''))
    .digest('hex');
}

async function downloadEntry(ticket) {
  const { data, error } = await supabase.storage
    .from(entriesBucket)
    .download(entryObjectPath(ticket));
  if (error?.statusCode === '404') return null;
  throwIfError(error, 'Could not load participant details from private storage');
  const entry = JSON.parse(await data.text());
  if (!hasParticipantDetails(entry) || entry.ticket !== ticket) {
    throw new Error('Stored participant details are invalid.');
  }
  return entry;
}

async function getEntryDetails(row) {
  if (hasParticipantDetails(row.data)) return row.data;
  const storedEntry = await downloadEntry(row.ticket);
  if (!storedEntry) {
    throw new Error(`Participant details for ticket ${row.ticket} were not found in private storage.`);
  }
  return {
    ...storedEntry,
    status: row.data?.status || storedEntry.status,
    time: row.data?.time || storedEntry.time
  };
}

async function getEntryByTicket(ticket) {
  if (!supabase) {
    const entries = readJsonFile(ENTRIES_FILE, []);
    return entries.find((entry) => entry.ticket === ticket) || null;
  }
  const { data, error } = await supabase
    .from('raffle_entries')
    .select('ticket, data')
    .eq('ticket', ticket)
    .maybeSingle();
  throwIfError(error, 'Could not load raffle entry');
  return data ? getEntryDetails(data) : null;
}

async function hydrateDrawResults(results) {
  if (!results.length) return results;
  const entries = await listEntries();
  const entriesByTicket = new Map(entries.map((entry) => [entry.ticket, entry]));
  return results.map((result) => {
    const winner = entriesByTicket.get(result.winner?.ticket);
    if (!winner) {
      throw new Error(`Participant details for draw winner ${result.winner?.ticket || ''} were not found.`);
    }
    return { ...result, winner };
  });
}

async function getSettings(defaultSettings) {
  if (!supabase) return { ...defaultSettings, ...readJsonFile(SETTINGS_FILE, defaultSettings) };
  const { data, error } = await supabase
    .from('raffle_settings')
    .select('settings')
    .eq('id', 1)
    .maybeSingle();
  throwIfError(error, 'Could not load campaign settings');
  return { ...defaultSettings, ...(data?.settings || {}) };
}

async function saveSettings(settings) {
  if (!supabase) {
    writeJsonFile(SETTINGS_FILE, settings);
    return;
  }
  const { error } = await supabase
    .from('raffle_settings')
    .upsert({ id: 1, settings }, { onConflict: 'id' });
  throwIfError(error, 'Could not save campaign settings');
}

async function listEntries() {
  if (!supabase) return readJsonFile(ENTRIES_FILE, []);
  const { data, error } = await supabase
    .from('raffle_entries')
    .select('ticket, data')
    .order('created_at', { ascending: false });
  throwIfError(error, 'Could not load raffle entries');
  return Promise.all(data.map((row) => getEntryDetails(row)));
}

function parseTaskProofs(proofFilename) {
  if (typeof proofFilename !== 'string' || !proofFilename.trim()) return [];
  const trimmed = proofFilename.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item && typeof item.filename === 'string');
      }
    } catch {
      // Fallback to single legacy proof string
    }
  }
  return [{ actionKey: 'engagement', filename: trimmed }];
}

function mapTaskCompletion(row) {
  const rawProof = row.proof_filename || row.proofFilename;
  return {
    ticket: row.ticket,
    taskId: row.task_id || row.taskId,
    completedAt: row.completed_at || row.completedAt,
    proofFilename: rawProof,
    proofs: parseTaskProofs(rawProof)
  };
}

async function listTaskCompletions() {
  if (!supabase) return readJsonFile(TASK_COMPLETIONS_FILE, []);
  const { data, error } = await supabase
    .from('raffle_task_completions')
    .select('ticket, task_id, completed_at, proof_filename');
  throwIfError(error, 'Could not load engagement task completions');
  return data.map(mapTaskCompletion);
}

async function getTaskCompletion(ticket, taskId) {
  if (!supabase) {
    return readJsonFile(TASK_COMPLETIONS_FILE, [])
      .find((completion) => completion.ticket === ticket && completion.taskId === taskId) || null;
  }
  const { data, error } = await supabase
    .from('raffle_task_completions')
    .select('ticket, task_id, completed_at, proof_filename')
    .eq('ticket', ticket)
    .eq('task_id', taskId)
    .maybeSingle();
  throwIfError(error, 'Could not check engagement task completion');
  return data ? mapTaskCompletion(data) : null;
}

async function createTaskCompletion(ticket, taskId, proofValue) {
  const serializedProof = Array.isArray(proofValue)
    ? JSON.stringify(proofValue.map((item) => ({ actionKey: item.actionKey, filename: item.filename })))
    : proofValue;

  if (!supabase) {
    const completions = readJsonFile(TASK_COMPLETIONS_FILE, []);
    if (completions.some((completion) => completion.ticket === ticket && completion.taskId === taskId)) {
      throw raffleError(409, 'This engagement task has already been submitted for this ticket.');
    }
    const completion = {
      ticket,
      taskId,
      completedAt: new Date().toISOString(),
      proofFilename: serializedProof,
      proofs: parseTaskProofs(serializedProof)
    };
    completions.push(completion);
    writeJsonFile(TASK_COMPLETIONS_FILE, completions);
    return completion;
  }

  const { data, error } = await supabase
    .from('raffle_task_completions')
    .insert({ ticket, task_id: taskId, proof_filename: serializedProof })
    .select('ticket, task_id, completed_at, proof_filename')
    .single();
  if (error?.code === '23505') {
    throw raffleError(409, 'This engagement task has already been submitted for this ticket.');
  }
  throwIfError(error, 'Could not save engagement task completion');
  return mapTaskCompletion(data);
}

async function uploadProof({ image, mimeType, extension }) {
  const filename = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
  if (!supabase) {
    fs.writeFileSync(path.join(PROOFS_DIR, filename), image, { flag: 'wx' });
    return filename;
  }
  const { error } = await supabase.storage
    .from(proofsBucket)
    .upload(filename, image, { contentType: mimeType, upsert: false });
  throwIfError(error, 'Could not store screenshot proof');
  return filename;
}

async function proofExists(filename) {
  if (!supabase) return fs.existsSync(path.join(PROOFS_DIR, filename));
  const { data, error } = await supabase.storage
    .from(proofsBucket)
    .list('', { limit: 1, search: filename });
  throwIfError(error, 'Could not verify screenshot proof');
  return data.some((object) => object.name === filename);
}

async function createEntry(entry) {
  if (!supabase) {
    const entries = readJsonFile(ENTRIES_FILE, []);
    const normalizedContact = entry.contact.replace(/\D/g, '');
    if (entries.some((item) => item.contact.replace(/\D/g, '') === normalizedContact)) {
      throw raffleError(409, 'An entry with this contact number already exists.');
    }
    if (entries.some((item) => item.ticket === entry.ticket)) {
      const error = new Error('Ticket code already exists.');
      error.code = '23505';
      throw error;
    }
    entries.unshift(entry);
    writeJsonFile(ENTRIES_FILE, entries);
    return;
  }

  const normalizedContact = entry.contact.replace(/\D/g, '');
  const contactHash = hashContact(entry.contact);
  const { data: matchingEntries, error: contactLookupError } = await supabase
    .from('raffle_entries')
    .select('ticket')
    .in('normalized_contact', [normalizedContact, contactHash])
    .limit(1);
  throwIfError(contactLookupError, 'Could not check for duplicate raffle entries');
  if (matchingEntries.length) {
    throw raffleError(409, 'An entry with this contact number already exists.');
  }

  const objectPath = entryObjectPath(entry.ticket);
  const { error: storageError } = await supabase.storage
    .from(entriesBucket)
    .upload(objectPath, Buffer.from(JSON.stringify(entry)), {
      contentType: 'application/json',
      upsert: false
    });
  if (storageError) {
    if (
      Number(storageError.statusCode) === 409 ||
      /already exists/i.test(storageError.message || '')
    ) {
      const error = new Error('Ticket code already exists.');
      error.code = '23505';
      throw error;
    }
    throwIfError(storageError, 'Could not store participant details');
  }

  const { error } = await supabase.from('raffle_entries').insert({
    ticket: entry.ticket,
    normalized_contact: contactHash,
    data: { ticket: entry.ticket, status: entry.status, time: entry.time }
  });
  if (error) {
    const { error: cleanupError } = await supabase.storage
      .from(entriesBucket)
      .remove([objectPath]);
    if (cleanupError) {
      console.error('Could not remove unlinked participant details from private storage:', cleanupError);
    }
  }
  if (error?.code === '23505' && error.message.includes('normalized_contact')) {
    throw raffleError(409, 'An entry with this contact number already exists.');
  }
  throwIfError(error, 'Could not save raffle entry');
}

async function toggleEntry(ticket) {
  if (!supabase) {
    const entries = readJsonFile(ENTRIES_FILE, []);
    const entry = entries.find((item) => item.ticket === ticket);
    if (!entry) return null;
    entry.status = entry.status === 'Eligible' ? 'Review' : 'Eligible';
    writeJsonFile(ENTRIES_FILE, entries);
    return entry;
  }
  const { data, error } = await supabase.rpc('toggle_raffle_entry_status', { p_ticket: ticket });
  throwIfError(error, 'Could not update raffle entry');
  if (!data?.success) return null;
  const entry = await getEntryByTicket(ticket);
  if (!entry) return null;
  return { ...entry, status: data.entry.status };
}

async function getDraw() {
  if (!supabase) {
    const draw = readJsonFile(DRAW_FILE, { results: [] });
    const nextRound = draw.results.length + 1;
    return {
      results: draw.results,
      nextRound: nextRound <= 6 ? nextRound : null,
      nextPrize: nextRound <= 5 ? '5 kg rice' : nextRound === 6 ? '25 kg rice' : null
    };
  }
  const { data, error } = await supabase
    .from('raffle_draw_state')
    .select('results')
    .eq('id', 1)
    .single();
  throwIfError(error, 'Could not load raffle draw');
  const results = await hydrateDrawResults(data.results || []);
  const nextRound = results.length + 1;
  return {
    results,
    nextRound: nextRound <= 6 ? nextRound : null,
    nextPrize: nextRound <= 5 ? '5 kg rice' : nextRound === 6 ? '25 kg rice' : null
  };
}

async function drawNext() {
  if (!supabase) {
    const draw = readJsonFile(DRAW_FILE, { results: [] });
    const nextRound = draw.results.length + 1;
    if (nextRound > 6) throw raffleError(409, 'All six raffle prizes have already been drawn.');

    const entries = readJsonFile(ENTRIES_FILE, []);
    const completions = readJsonFile(TASK_COMPLETIONS_FILE, []);
    const settings = await getSettings({});
    const activeTaskIds = new Set(
      (Array.isArray(settings.engagementTasks) ? settings.engagementTasks : []).map((t) => t.id)
    );
    const totalTasks = activeTaskIds.size;
    const completionsByTicket = new Map();
    for (const completion of completions) {
      if (totalTasks > 0 && !activeTaskIds.has(completion.taskId)) continue;
      completionsByTicket.set(
        completion.ticket,
        (completionsByTicket.get(completion.ticket) || 0) + 1
      );
    }
    const previousWinners = new Set(draw.results.map((result) => result.winner.ticket));
    // Eligibility strictly depends on completing ALL active engagement tasks (or manual override)
    const eligible = entries.filter((entry) => {
      if (previousWinners.has(entry.ticket)) return false;
      if (totalTasks > 0) {
        const completedCount = completionsByTicket.get(entry.ticket) || 0;
        return completedCount >= totalTasks || entry.status === 'Eligible';
      }
      return entry.status === 'Eligible';
    });
    const remainingWinners = 7 - nextRound;
    if (eligible.length < remainingWinners) {
      throw raffleError(400, `At least ${remainingWinners} unique eligible entries are needed to continue the six-winner draw.`);
    }
    const result = {
      round: nextRound,
      prize: nextRound === 6 ? '25 kg rice' : '5 kg rice',
      winner: eligible[Math.floor(Math.random() * eligible.length)],
      drawnAt: new Date().toISOString()
    };
    draw.results.push(result);
    writeJsonFile(DRAW_FILE, draw);
    return {
      ...result,
      results: draw.results,
      nextRound: nextRound < 6 ? nextRound + 1 : null,
      nextPrize: nextRound < 5 ? '5 kg rice' : nextRound === 5 ? '25 kg rice' : null
    };
  }

  const { data, error } = await supabase.rpc('draw_next_raffle_winner');
  throwIfError(error, 'Could not draw raffle winner');
  if (!data?.success) throw raffleError(data?.status || 500, data?.error || 'Could not draw raffle winner.');
  const results = await hydrateDrawResults(data.results || []);
  const winner = results.find((result) => result.round === data.round)?.winner;
  if (!winner) throw new Error('Could not load the raffle winner details from private storage.');
  return { ...data, winner, results };
}

async function resetDraw(archiveNote = '') {
  const currentSettings = await getSettings({});
  const existingHistory = Array.isArray(currentSettings.drawHistory) ? currentSettings.drawHistory : [];

  let currentResults = [];
  if (!supabase) {
    const draw = readJsonFile(DRAW_FILE, { results: [] });
    currentResults = Array.isArray(draw.results) ? draw.results : [];
    writeJsonFile(DRAW_FILE, { results: [] });
  } else {
    const { data: drawState, error: readError } = await supabase
      .from('raffle_draw_state')
      .select('results')
      .eq('id', 1)
      .single();
    throwIfError(readError, 'Could not read raffle draw state');
    currentResults = await hydrateDrawResults(drawState?.results || []);
    const { error: resetError } = await supabase
      .from('raffle_draw_state')
      .update({ results: [] })
      .eq('id', 1);
    throwIfError(resetError, 'Could not reset raffle draw in database');
  }

  let newArchive = null;
  const resetLiveState = {
    phase: 'idle',
    round: 1,
    prize: '5 kg rice',
    winnerTicket: '',
    winnerName: '',
    nextRound: 1,
    nextPrize: '5 kg rice',
    voiceGender: currentSettings.liveDrawState?.voiceGender || 'male',
    publicResults: [],
    wheelTickets: currentSettings.liveDrawState?.wheelTickets || [],
    eligibleCount: currentSettings.liveDrawState?.eligibleCount || 0,
    viewerEpoch: String(Date.now()),
    updatedAt: new Date().toISOString(),
    seq: (currentSettings.liveDrawState?.seq || 0) + 1
  };
  viewerStatsCache.clear();

  if (currentResults.length > 0) {
    const batchNumber = existingHistory.length + 1;
    newArchive = {
      id: `draw_batch_${batchNumber}_${Date.now()}`,
      batchNumber,
      note: typeof archiveNote === 'string' && archiveNote.trim() ? archiveNote.trim() : `Draw Batch #${batchNumber}`,
      savedAt: new Date().toISOString(),
      results: currentResults,
      totalWinners: currentResults.length
    };
    const updatedHistory = [newArchive, ...existingHistory];
    await saveSettings({ ...currentSettings, drawHistory: updatedHistory, liveDrawState: resetLiveState });
  } else {
    await saveSettings({ ...currentSettings, liveDrawState: resetLiveState });
  }

  return {
    success: true,
    archived: newArchive,
    results: [],
    nextRound: 1,
    nextPrize: '5 kg rice'
  };
}

async function getProof(filename) {
  if (!supabase) {
    const proofPath = path.join(PROOFS_DIR, filename);
    if (!fs.existsSync(proofPath)) return null;
    return fs.readFileSync(proofPath);
  }
  const { data, error } = await supabase.storage.from(proofsBucket).download(filename);
  if (error?.statusCode === '404') return null;
  throwIfError(error, 'Could not load screenshot proof');
  return Buffer.from(await data.arrayBuffer());
}

async function migrateEntryDetailsToBucket() {
  if (!supabase) {
    throw new Error('Configure Supabase before migrating participant records to private storage.');
  }

  const pageSize = 100;
  let offset = 0;
  let migratedEntries = 0;
  while (true) {
    const { data, error } = await supabase
      .from('raffle_entries')
      .select('ticket, data, created_at')
      .order('created_at', { ascending: true })
      .order('ticket', { ascending: true })
      .range(offset, offset + pageSize - 1);
    throwIfError(error, 'Could not read entries for private storage migration');
    if (!data.length) break;

    for (const row of data) {
      const objectPath = entryObjectPath(row.ticket);
      let entry = row.data;
      if (!hasParticipantDetails(entry)) {
        entry = await downloadEntry(row.ticket);
        if (!entry) {
          throw new Error(`Cannot migrate ticket ${row.ticket}: participant details are missing.`);
        }
      } else {
        const { error: uploadError } = await supabase.storage
          .from(entriesBucket)
          .upload(objectPath, Buffer.from(JSON.stringify(entry)), {
            contentType: 'application/json',
            upsert: true
          });
        throwIfError(uploadError, 'Could not copy participant details to private storage');
      }

      const verifiedEntry = await downloadEntry(row.ticket);
      if (!verifiedEntry || JSON.stringify(verifiedEntry) !== JSON.stringify(entry)) {
        throw new Error(`Could not verify migrated participant details for ticket ${row.ticket}.`);
      }

      const metadata = {
        ticket: row.ticket,
        status: row.data?.status || verifiedEntry.status || 'Review',
        time: row.data?.time || verifiedEntry.time || row.created_at
      };
      const { error: updateError } = await supabase
        .from('raffle_entries')
        .update({
          normalized_contact: hashContact(verifiedEntry.contact),
          data: metadata
        })
        .eq('ticket', row.ticket);
      throwIfError(updateError, 'Could not minimize participant data in the database');
      migratedEntries += 1;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const { data: drawState, error: drawError } = await supabase
    .from('raffle_draw_state')
    .select('results')
    .eq('id', 1)
    .single();
  throwIfError(drawError, 'Could not read raffle draw state for private storage migration');
  const results = (drawState.results || []).map((result) => {
    const ticket = result.winner?.ticket;
    if (typeof ticket !== 'string') {
      throw new Error('Cannot migrate draw history because a winner ticket is missing.');
    }
    return { ...result, winner: { ticket } };
  });
  const { error: updateDrawError } = await supabase
    .from('raffle_draw_state')
    .update({ results })
    .eq('id', 1);
  throwIfError(updateDrawError, 'Could not minimize winner details in the database');

  return migratedEntries;
}

function sanitizeEpoch(epoch) {
  return String(epoch || 'default').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'default';
}

function sanitizeViewerId(viewerId) {
  const cleaned = String(viewerId || '').trim();
  return /^[a-zA-Z0-9_-]{8,64}$/.test(cleaned) ? cleaned : '';
}

async function getLiveViewerStats(epoch = 'default') {
  const safeEpoch = sanitizeEpoch(epoch);
  const now = Date.now();
  const cached = viewerStatsCache.get(safeEpoch);
  if (cached && now - cached.at < 2500) {
    return cached.stats;
  }

  if (!supabase) {
    const store = readJsonFile(LIVE_VIEWERS_FILE, {});
    const epochData = store[safeEpoch] || { active: {}, seen: {} };
    const activeEntries = epochData.active || {};
    let activeViewers = 0;
    let changed = false;
    for (const [id, ts] of Object.entries(activeEntries)) {
      if (typeof ts === 'number' && now - ts <= LIVE_VIEWER_TTL_MS) {
        activeViewers += 1;
      } else {
        delete activeEntries[id];
        changed = true;
      }
    }
    if (changed) {
      store[safeEpoch] = { active: activeEntries, seen: epochData.seen || {} };
      writeJsonFile(LIVE_VIEWERS_FILE, store);
    }
    const seenCount = Object.keys(epochData.seen || {}).length;
    const stats = {
      activeViewers,
      totalViewers: Math.max(activeViewers, seenCount),
      viewerEpoch: safeEpoch
    };
    viewerStatsCache.set(safeEpoch, { at: now, stats });
    return stats;
  }

  const activePrefix = `live-viewers-active/${safeEpoch}`;
  const seenPrefix = `live-viewers-seen/${safeEpoch}`;
  try {
    const [activeRes, seenRes] = await Promise.all([
      supabase.storage.from(entriesBucket).list(activePrefix, { limit: 1000 }),
      supabase.storage.from(entriesBucket).list(seenPrefix, { limit: 1000 })
    ]);
    throwIfError(activeRes.error, 'Could not list active viewers');
    throwIfError(seenRes.error, 'Could not list session viewers');

    const activeViewers = (activeRes.data || []).filter((item) => {
      if (!item?.name?.endsWith('.json')) return false;
      const updatedMs = Date.parse(item.updated_at || item.created_at || '');
      return Number.isFinite(updatedMs) && now - updatedMs <= LIVE_VIEWER_TTL_MS;
    }).length;
    const seenCount = (seenRes.data || []).filter((item) => item?.name?.endsWith('.json')).length;
    const stats = {
      activeViewers,
      totalViewers: Math.max(activeViewers, seenCount),
      viewerEpoch: safeEpoch
    };
    viewerStatsCache.set(safeEpoch, { at: now, stats });
    return stats;
  } catch (err) {
    console.warn('Unable to read live viewer stats:', err.message);
    return { activeViewers: 0, totalViewers: 0, viewerEpoch: safeEpoch };
  }
}

async function recordLiveViewerPing({ viewerId, epoch = 'default', leave = false, firstJoin = false }) {
  const safeId = sanitizeViewerId(viewerId);
  if (!safeId) throw raffleError(400, 'Invalid viewer session ID.');
  const safeEpoch = sanitizeEpoch(epoch);
  const now = Date.now();
  viewerStatsCache.delete(safeEpoch);

  if (!supabase) {
    const store = readJsonFile(LIVE_VIEWERS_FILE, {});
    const epochData = store[safeEpoch] || { active: {}, seen: {} };
    if (leave) {
      delete epochData.active[safeId];
    } else {
      epochData.active[safeId] = now;
      if (firstJoin || !epochData.seen[safeId]) {
        epochData.seen[safeId] = true;
      }
    }
    const prunedStore = { [safeEpoch]: epochData };
    for (const key of Object.keys(store)) {
      if (key !== safeEpoch && Object.keys(prunedStore).length < 5) {
        prunedStore[key] = store[key];
      }
    }
    writeJsonFile(LIVE_VIEWERS_FILE, prunedStore);
    return getLiveViewerStats(safeEpoch);
  }

  const activePath = `live-viewers-active/${safeEpoch}/${safeId}.json`;
  const seenPath = `live-viewers-seen/${safeEpoch}/${safeId}.json`;

  if (leave) {
    await supabase.storage.from(entriesBucket).remove([activePath]).catch(() => {});
  } else {
    const { error: activeError } = await supabase.storage
      .from(entriesBucket)
      .upload(activePath, Buffer.from(JSON.stringify({ ts: now })), {
        contentType: 'application/json',
        upsert: true
      });
    throwIfError(activeError, 'Could not record active viewer heartbeat');

    if (firstJoin) {
      const { error: seenError } = await supabase.storage
        .from(entriesBucket)
        .upload(seenPath, Buffer.from(JSON.stringify({ joinedAt: new Date(now).toISOString() })), {
          contentType: 'application/json',
          upsert: true
        });
      throwIfError(seenError, 'Could not record viewer session');
    }
  }

  return getLiveViewerStats(safeEpoch);
}

export {
  createEntry,
  drawNext,
  getDraw,
  getLiveViewerStats,
  getProof,
  getSettings,
  getTaskCompletion,
  listEntries,
  listTaskCompletions,
  migrateEntryDetailsToBucket,
  proofExists,
  recordLiveViewerPing,
  resetDraw,
  saveSettings,
  createTaskCompletion,
  toggleEntry,
  uploadProof
};
