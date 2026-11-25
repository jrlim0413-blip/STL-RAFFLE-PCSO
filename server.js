import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
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
} from './lib/raffleStore.js';
import { getEntrySchedule } from './src/utils/entrySchedule.js';
import { SUPERVISOR_NAMES } from './src/utils/supervisors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '';
const MAX_PROOF_SIZE = 4 * 1024 * 1024;
const ADMIN_AUTH_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_AUTH_MAX_FAILURES = 5;
const PROOF_PAGES = new Set(['melquiades', 'pcso', 'situation-report']);
const adminAuthFailures = new Map();
const IMAGE_TYPES = {
  'image/png': { extension: 'png', signature: '89504e470d0a1a0a' },
  'image/jpeg': { extension: 'jpg', signature: 'ffd8ff' },
  'image/webp': { extension: 'webp', signature: null }
};
const PROOF_MIME_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

app.use(cors());
app.post(
  '/api/proofs/upload',
  express.raw({ type: ['image/png', 'image/jpeg', 'image/webp'], limit: '4mb' }),
  asyncRoute(async (req, res) => {
    const windowError = await getEntryWindowError();
    if (windowError) {
      return res.status(windowError.status).json({ success: false, error: windowError.error });
    }
    const mimeType = req.get('content-type');
    let decoded;
    try {
      decoded = decodeProof(req.body, mimeType);
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const filename = await uploadProof(decoded);
    res.status(201).json({ success: true, filename });
  })
);
app.use(express.json({ limit: '100kb' }));

const DEFAULT_SETTINGS = {
  campaignName: 'STL Raffle',
  campaignUrl: '',
  announcement: 'STL Community Raffle: six rice prizes for six winners.',
  prizeDescription: 'Five winners receive 5 kg of rice each. The sixth and final winner receives 25 kg.',
  entryStartAt: '',
  entryEndAt: ''
};

async function getEntryWindowError() {
  const settings = await getSettings(DEFAULT_SETTINGS);
  const { state } = getEntrySchedule(settings.entryStartAt, settings.entryEndAt);
  if (state === 'upcoming') return { status: 409, error: 'Entries are not open yet.' };
  if (state === 'ended') return { status: 409, error: 'The raffle entry period is closed.' };
  if (state === 'invalid') {
    return { status: 503, error: 'The entry schedule is invalid. Please contact the organizer.' };
  }
  return null;
}

function isAdminPasscodeValid(candidate) {
  if (typeof candidate !== 'string' || ADMIN_PASSCODE.length < 12) return false;
  const expectedBuffer = Buffer.from(ADMIN_PASSCODE);
  const candidateBuffer = Buffer.from(candidate);
  return candidateBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(candidateBuffer, expectedBuffer);
}

function requireAdmin(req, res, next) {
  if (ADMIN_PASSCODE.length < 12) {
    return res.status(503).json({
      success: false,
      error: 'Admin access is not configured. Set ADMIN_PASSCODE to at least 12 characters.'
    });
  }
  if (!isAdminPasscodeValid(req.get('x-admin-passcode'))) {
    return res.status(401).json({ success: false, error: 'Organizer passcode is incorrect or missing.' });
  }
  next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function generateTicketCode() {
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date()).map(({ type, value }) => [type, value])
  );
  const numericDate = `${dateParts.year}${dateParts.month}${dateParts.day}`;
  const uniqueNumber = crypto.randomInt(100000, 1000000);
  return `STL-${numericDate}-${uniqueNumber}`;
}

function decodeProof(image, mimeType) {
  if (!Buffer.isBuffer(image) || !IMAGE_TYPES[mimeType]) {
    throw new Error('Each proof must be a PNG, JPEG, or WebP screenshot.');
  }
  if (!image.length || image.length > MAX_PROOF_SIZE) {
    throw new Error('Each screenshot must be no larger than 4 MB.');
  }

  const { signature } = IMAGE_TYPES[mimeType];
  if (signature && !image.subarray(0, signature.length / 2).toString('hex').startsWith(signature)) {
    throw new Error('A screenshot file does not match its declared image type.');
  }
  if (mimeType === 'image/webp' &&
      (image.toString('ascii', 0, 4) !== 'RIFF' || image.toString('ascii', 8, 12) !== 'WEBP')) {
    throw new Error('A screenshot file does not match its declared image type.');
  }
  return { image, mimeType, extension: IMAGE_TYPES[mimeType].extension };
}

function csvCell(value) {
  const text = String(value ?? '');
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

app.post('/api/admin/session', (req, res) => {
  if (ADMIN_PASSCODE.length < 12) {
    return res.status(503).json({
      success: false,
      error: 'Admin access is not configured. Set ADMIN_PASSCODE to at least 12 characters.'
    });
  }
  const now = Date.now();
  for (const [ip, attempt] of adminAuthFailures) {
    if (now - attempt.startedAt >= ADMIN_AUTH_WINDOW_MS) adminAuthFailures.delete(ip);
  }
  const ip = req.ip;
  const currentAttempt = adminAuthFailures.get(ip);
  if (currentAttempt && currentAttempt.failures >= ADMIN_AUTH_MAX_FAILURES) {
    res.set('Retry-After', String(Math.ceil((currentAttempt.startedAt + ADMIN_AUTH_WINDOW_MS - now) / 1000)));
    return res.status(429).json({ success: false, error: 'Too many attempts. Try again in 15 minutes.' });
  }
  if (!isAdminPasscodeValid(req.body?.passcode)) {
    const attempt = currentAttempt || { startedAt: now, failures: 0 };
    attempt.failures += 1;
    adminAuthFailures.set(ip, attempt);
    return res.status(401).json({ success: false, error: 'Organizer passcode is incorrect.' });
  }
  adminAuthFailures.delete(ip);
  res.json({ success: true });
});

app.get('/api/settings', asyncRoute(async (req, res) => {
  res.json({ success: true, settings: await getSettings(DEFAULT_SETTINGS) });
}));

app.post('/api/settings', requireAdmin, asyncRoute(async (req, res) => {
  const body = req.body || {};
  const current = await getSettings(DEFAULT_SETTINGS);
  const updates = {};
  for (const field of ['campaignName', 'campaignUrl', 'announcement', 'prizeDescription']) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string') {
        return res.status(400).json({ success: false, error: `${field} must be text.` });
      }
      updates[field] = body[field].trim();
    }
  }
  for (const field of ['entryStartAt', 'entryEndAt']) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string') {
        return res.status(400).json({ success: false, error: `${field} must be a date or empty.` });
      }
      const value = body[field].trim();
      if (value) {
        const timestamp = Date.parse(value);
        if (!Number.isFinite(timestamp)) {
          return res.status(400).json({ success: false, error: `${field} must be a valid date.` });
        }
        updates[field] = new Date(timestamp).toISOString();
      } else {
        updates[field] = '';
      }
    }
  }
  if (!updates.campaignName && body.campaignName !== undefined) {
    return res.status(400).json({ success: false, error: 'Campaign name is required.' });
  }
  if (updates.campaignUrl) {
    try {
      const url = new URL(updates.campaignUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol.');
    } catch {
      return res.status(400).json({ success: false, error: 'Campaign link must be a valid HTTP or HTTPS URL.' });
    }
  }

  const settings = { ...current, ...updates };
  if (getEntrySchedule(settings.entryStartAt, settings.entryEndAt).state === 'invalid') {
    return res.status(400).json({
      success: false,
      error: 'Set both entry dates and make sure the closing time is after the opening time.'
    });
  }
  await saveSettings(settings);
  res.json({ success: true, settings });
}));

app.get('/api/entries', requireAdmin, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const entries = await listEntries();
  const eligible = entries.filter((entry) => entry.status === 'Eligible').length;
  const flagged = entries.length - eligible;
  const activeAgents = new Set(entries.map((entry) => entry.agentUsername).filter(Boolean)).size;

  res.json({
    success: true,
    data: entries,
    stats: { total: entries.length, eligible, flagged, activeAgents }
  });
}));

app.get('/api/proofs/:filename', requireAdmin, asyncRoute(async (req, res) => {
  if (!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(req.params.filename)) {
    return res.status(404).json({ success: false, error: 'Proof not found.' });
  }
  const proof = await getProof(req.params.filename);
  if (!proof) return res.status(404).json({ success: false, error: 'Proof not found.' });
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(path.extname(req.params.filename));
  res.send(proof);
}));

app.post('/api/submit', asyncRoute(async (req, res) => {
  const initialWindowError = await getEntryWindowError();
  if (initialWindowError) {
    return res.status(initialWindowError.status).json({ success: false, error: initialWindowError.error });
  }

  const body = req.body || {};
  for (const field of ['agent', 'contact', 'agentUsername', 'supervisorName']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      return res.status(400).json({ success: false, error: `${field} must be text.` });
    }
  }
  const agent = (body.agent || '').trim();
  const contact = (body.contact || '').trim();
  const agentUsername = (body.agentUsername || '').trim();
  const supervisorName = (body.supervisorName || '').trim();
  if (!agent || !contact || !agentUsername || !supervisorName) {
    return res.status(400).json({
      success: false,
      error: 'Name, contact number, agent username, and supervisor name are required.'
    });
  }
  if (!SUPERVISOR_NAMES.includes(supervisorName)) {
    return res.status(400).json({ success: false, error: 'Select a valid supervisor name.' });
  }
  if (body.consent !== true) {
    return res.status(400).json({ success: false, error: 'Consent is required to store raffle entry details and screenshot proofs.' });
  }
  if (agent.length > 100 || contact.length > 40 || agentUsername.length > 100 || supervisorName.length > 100) {
    return res.status(400).json({ success: false, error: 'One or more fields exceed the allowed length.' });
  }

  const normalizedContact = contact.replace(/\D/g, '');
  if (!normalizedContact) {
    return res.status(400).json({ success: false, error: 'Contact number must contain at least one digit.' });
  }
  if (!Array.isArray(body.proofScreenshots) || body.proofScreenshots.length !== 3) {
    return res.status(400).json({ success: false, error: 'Upload one screenshot for each of the three pages.' });
  }

  const seenPages = new Set();
  for (const proof of body.proofScreenshots) {
    if (!proof || !PROOF_PAGES.has(proof.pageKey) || seenPages.has(proof.pageKey) ||
        typeof proof.filename !== 'string' || !/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(proof.filename)) {
      return res.status(400).json({ success: false, error: 'Upload one screenshot for each of the three required pages.' });
    }
    seenPages.add(proof.pageKey);
    if (!(await proofExists(proof.filename))) {
      return res.status(400).json({ success: false, error: 'A screenshot upload could not be found. Please upload it again.' });
    }
  }
  if (seenPages.size !== PROOF_PAGES.size) {
    return res.status(400).json({ success: false, error: 'Upload one screenshot for each of the three required pages.' });
  }

  let ticket;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const currentWindowError = await getEntryWindowError();
    if (currentWindowError) {
      return res.status(currentWindowError.status).json({ success: false, error: currentWindowError.error });
    }
    const candidate = generateTicketCode();
    try {
      const entry = {
        ticket: candidate,
        agentUsername,
        supervisorName,
        agent,
        contact,
        proofs: body.proofScreenshots.map(({ pageKey, filename }) => ({
          pageKey,
          filename,
          mimeType: PROOF_MIME_TYPES[path.extname(filename)]
        })),
        time: new Date().toISOString(),
        status: 'Review'
      };
      await createEntry(entry);
      ticket = entry;
      break;
    } catch (error) {
      if (error.status === 409) {
        return res.status(409).json({ success: false, error: error.message });
      }
      if (error.code === '23505' && attempt < 19) continue;
      console.error('Unable to save raffle entry:', error);
      return res.status(500).json({ success: false, error: 'Unable to save the entry. Please retry.' });
    }
  }
  if (!ticket) {
    return res.status(500).json({ success: false, error: 'Could not generate a unique ticket. Please retry.' });
  }
  res.status(201).json({ success: true, ticket });
}));

app.post('/api/entries/:ticket/toggle', requireAdmin, asyncRoute(async (req, res) => {
  const entry = await toggleEntry(req.params.ticket);
  if (!entry) return res.status(404).json({ success: false, error: 'Ticket not found.' });

  res.json({ success: true, updated: entry });
}));

app.get('/api/draw', requireAdmin, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...(await getDraw()) });
}));

app.post('/api/draw', requireAdmin, asyncRoute(async (req, res) => {
  const result = await drawNext();
  res.json({ success: true, ...result });
}));

app.get('/api/export', requireAdmin, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const entries = await listEntries();
  const columns = [
    'Ticket Code', 'Agent Username', 'Supervisor Name', 'Participant Name',
    'Contact Number', 'Proof Pages', 'Timestamp', 'Status'
  ];
  const rows = entries.map((entry) =>
    [
      entry.ticket,
      entry.agentUsername,
      entry.supervisorName,
      entry.agent,
      entry.contact,
      (entry.proofs || []).map((proof) => proof.pageKey).join('; '),
      entry.time,
      entry.status
    ].map(csvCell).join(',')
  );
  const csv = [columns.map(csvCell).join(','), ...rows].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=raffle-entries.csv');
  res.send(csv);
}));

const distPath = path.join(__dirname, 'dist');
if (!process.env.VERCEL && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.use((error, req, res, next) => {
  console.error('Raffle API request failed:', error);
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({
    success: false,
    error: status === 500 ? 'A server error occurred. Please try again.' : error.message
  });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Raffle backend running at http://localhost:${PORT}`);
  });
}

export default app;
