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
const PROOFS_DIR = path.join(DATA_DIR, 'proofs');
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
    .select('data')
    .order('created_at', { ascending: false });
  throwIfError(error, 'Could not load raffle entries');
  return data.map((row) => row.data);
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

  const { error } = await supabase.from('raffle_entries').insert({
    ticket: entry.ticket,
    normalized_contact: entry.contact.replace(/\D/g, ''),
    data: entry
  });
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
  return data.entry;
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
  const results = data.results || [];
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
    const previousWinners = new Set(draw.results.map((result) => result.winner.ticket));
    const eligible = entries.filter((entry) =>
      entry.status === 'Eligible' && !previousWinners.has(entry.ticket)
    );
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
  return data;
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

export {
  createEntry,
  drawNext,
  getDraw,
  getProof,
  getSettings,
  listEntries,
  proofExists,
  saveSettings,
  toggleEntry,
  uploadProof
};
