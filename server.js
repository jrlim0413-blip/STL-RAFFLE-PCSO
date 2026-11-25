import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '';
const DATA_DIR = path.join(__dirname, 'data');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DRAW_FILE = path.join(DATA_DIR, 'draw.json');
const PROOFS_DIR = path.join(DATA_DIR, 'proofs');
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

app.use(cors());
app.use(express.json({ limit: '20mb' }));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PROOFS_DIR)) fs.mkdirSync(PROOFS_DIR, { recursive: true });

const DEFAULT_SETTINGS = {
  campaignName: 'STL Raffle',
  campaignUrl: '',
  announcement: 'STL Community Raffle: six rice prizes for six winners.',
  prizeDescription: 'Five winners receive 5 kg of rice each. The sixth and final winner receives 25 kg.'
};

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

function readEntries() {
  return readJsonFile(ENTRIES_FILE, []);
}

function writeEntries(entries) {
  writeJsonFile(ENTRIES_FILE, entries);
}

function readSettings() {
  return { ...DEFAULT_SETTINGS, ...readJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS) };
}

function writeSettings(settings) {
  writeJsonFile(SETTINGS_FILE, settings);
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

function decodeProof(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl || '');
  if (!match) throw new Error('Each proof must be a PNG, JPEG, or WebP screenshot.');

  const [, mimeType, encoded] = match;
  const image = Buffer.from(encoded, 'base64');
  if (!image.length || image.length > MAX_PROOF_SIZE || image.toString('base64') !== encoded) {
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

app.get('/api/settings', (req, res) => {
  res.json({ success: true, settings: readSettings() });
});

app.post('/api/settings', requireAdmin, (req, res) => {
  const body = req.body || {};
  const current = readSettings();
  const updates = {};
  for (const field of ['campaignName', 'campaignUrl', 'announcement', 'prizeDescription']) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string') {
        return res.status(400).json({ success: false, error: `${field} must be text.` });
      }
      updates[field] = body[field].trim();
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
  writeSettings(settings);
  res.json({ success: true, settings });
});

app.get('/api/entries', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const entries = readEntries();
  const eligible = entries.filter((entry) => entry.status === 'Eligible').length;
  const flagged = entries.length - eligible;
  const activeKiosks = new Set(entries.map((entry) => entry.kiosk).filter(Boolean)).size;

  res.json({
    success: true,
    data: entries,
    stats: { total: entries.length, eligible, flagged, activeKiosks }
  });
});

app.get('/api/proofs/:filename', requireAdmin, (req, res) => {
  if (!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(req.params.filename)) {
    return res.status(404).json({ success: false, error: 'Proof not found.' });
  }
  const proofPath = path.join(PROOFS_DIR, req.params.filename);
  if (!fs.existsSync(proofPath)) return res.status(404).json({ success: false, error: 'Proof not found.' });
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.type(path.extname(proofPath));
  res.sendFile(proofPath);
});

app.post('/api/submit', (req, res) => {
  const body = req.body || {};
  for (const field of ['agent', 'contact', 'kiosk']) {
    if (body[field] !== undefined && typeof body[field] !== 'string') {
      return res.status(400).json({ success: false, error: `${field} must be text.` });
    }
  }
  const agent = (body.agent || '').trim();
  const contact = (body.contact || '').trim();
  const kiosk = (body.kiosk || '').trim();
  if (!agent || !contact) {
    return res.status(400).json({ success: false, error: 'Name and contact number are required.' });
  }
  if (body.consent !== true) {
    return res.status(400).json({ success: false, error: 'Consent is required to store raffle entry details and screenshot proofs.' });
  }
  if (agent.length > 100 || contact.length > 40 || kiosk.length > 100) {
    return res.status(400).json({ success: false, error: 'One or more fields exceed the allowed length.' });
  }

  const entries = readEntries();
  const normalizedContact = contact.replace(/\D/g, '');
  if (!normalizedContact) {
    return res.status(400).json({ success: false, error: 'Contact number must contain at least one digit.' });
  }
  if (entries.some((entry) => (entry.contact || '').replace(/\D/g, '') === normalizedContact)) {
    return res.status(409).json({ success: false, error: 'An entry with this contact number already exists.' });
  }

  if (!Array.isArray(body.proofScreenshots) || body.proofScreenshots.length !== 3) {
    return res.status(400).json({ success: false, error: 'Upload one screenshot for each of the three pages.' });
  }

  let decodedProofs;
  try {
    const seenPages = new Set();
    decodedProofs = body.proofScreenshots.map((proof) => {
      if (!proof || !PROOF_PAGES.has(proof.pageKey) || seenPages.has(proof.pageKey)) {
        throw new Error('Upload one screenshot for each of the three required pages.');
      }
      seenPages.add(proof.pageKey);
      return { pageKey: proof.pageKey, ...decodeProof(proof.dataUrl) };
    });
    if (seenPages.size !== PROOF_PAGES.size) {
      throw new Error('Upload one screenshot for each of the three required pages.');
    }
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }

  let ticket;
  do {
    ticket = `STL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
  } while (entries.some((entry) => entry.ticket === ticket));

  const savedProofPaths = [];
  let proofs;
  const entry = {
    ticket,
    kiosk,
    agent,
    contact,
    proofs: [],
    time: new Date().toISOString(),
    status: 'Review'
  };
  try {
    proofs = decodedProofs.map(({ pageKey, image, extension, mimeType }) => {
      const filename = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
      const proofPath = path.join(PROOFS_DIR, filename);
      fs.writeFileSync(proofPath, image, { flag: 'wx' });
      savedProofPaths.push(proofPath);
      return { pageKey, filename, mimeType };
    });
    entry.proofs = proofs;
    entries.unshift(entry);
    writeEntries(entries);
  } catch (error) {
    for (const proofPath of savedProofPaths) {
      if (fs.existsSync(proofPath)) fs.unlinkSync(proofPath);
    }
    console.error('Unable to save raffle entry or screenshot proofs:', error);
    return res.status(500).json({ success: false, error: 'Unable to save the entry and screenshots. Please retry.' });
  }
  res.status(201).json({ success: true, ticket: entry });
});

app.post('/api/entries/:ticket/toggle', requireAdmin, (req, res) => {
  const entries = readEntries();
  const entry = entries.find((item) => item.ticket === req.params.ticket);
  if (!entry) return res.status(404).json({ success: false, error: 'Ticket not found.' });

  entry.status = entry.status === 'Eligible' ? 'Review' : 'Eligible';
  writeEntries(entries);
  res.json({ success: true, updated: entry });
});

app.get('/api/draw', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const draw = readJsonFile(DRAW_FILE, { results: [] });
  const nextRound = draw.results.length + 1;
  res.json({
    success: true,
    results: draw.results,
    nextRound: nextRound <= 6 ? nextRound : null,
    nextPrize: nextRound <= 5 ? '5 kg rice' : nextRound === 6 ? '25 kg rice' : null
  });
});

app.post('/api/draw', requireAdmin, (req, res) => {
  const draw = readJsonFile(DRAW_FILE, { results: [] });
  const nextRound = draw.results.length + 1;
  if (nextRound > 6) {
    return res.status(409).json({ success: false, error: 'All six raffle prizes have already been drawn.' });
  }

  const previousWinners = new Set(draw.results.map((result) => result.winner.ticket));
  const eligible = readEntries().filter((entry) =>
    entry.status === 'Eligible' && !previousWinners.has(entry.ticket)
  );
  const remainingWinners = 7 - nextRound;
  if (eligible.length < remainingWinners) {
    return res.status(400).json({
      success: false,
      error: `At least ${remainingWinners} unique eligible entries are needed to continue the six-winner draw.`
    });
  }

  const selected = eligible[Math.floor(Math.random() * eligible.length)];
  const result = {
    round: nextRound,
    prize: nextRound === 6 ? '25 kg rice' : '5 kg rice',
    winner: selected,
    drawnAt: new Date().toISOString()
  };
  draw.results.push(result);
  writeJsonFile(DRAW_FILE, draw);
  res.json({
    success: true,
    ...result,
    results: draw.results,
    nextRound: nextRound < 6 ? nextRound + 1 : null,
    nextPrize: nextRound < 5 ? '5 kg rice' : nextRound === 5 ? '25 kg rice' : null
  });
});

app.get('/api/export', requireAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const entries = readEntries();
  const columns = ['Ticket Code', 'Branch or Outlet', 'Name', 'Contact Number', 'Proof Pages', 'Timestamp', 'Status'];
  const rows = entries.map((entry) =>
    [
      entry.ticket,
      entry.kiosk,
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
});

const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Raffle backend running at http://localhost:${PORT}`);
});
