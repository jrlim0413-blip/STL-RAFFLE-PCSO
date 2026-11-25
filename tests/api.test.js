import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readApiResponse } from '../src/utils/apiResponse.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const adminPasscode = 'test-organizer-passcode';
const png = Buffer.from('89504e470d0a1a0a-test-image', 'hex');
const proofPages = ['melquiades', 'pcso', 'situation-report'];

test('HTML 404 API responses produce a useful message instead of a JSON parse error', async () => {
  const response = new Response('The page could not be found', {
    status: 404,
    headers: { 'Content-Type': 'text/html' }
  });
  await assert.rejects(
    readApiResponse(response, 'Could not sign in to the admin dashboard.'),
    /API route was not found/
  );
});

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

test('local API persists entries, private proofs, settings, and ordered draws', { timeout: 30000 }, async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stl-raffle-api-'));
  const port = await unusedPort();
  const childEnv = {
    ...process.env,
    PORT: String(port),
    ADMIN_PASSCODE: adminPasscode,
    RAFFLE_DATA_DIR: dataDir,
    RAFFLE_SKIP_ENV_FILE: '1'
  };
  delete childEnv.SUPABASE_URL;
  delete childEnv.SUPABASE_SERVICE_ROLE_KEY;

  const server = spawn(process.execPath, ['server.js'], { cwd: root, env: childEnv });
  const serverClosed = new Promise((resolve) => server.once('close', resolve));
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`API process exited early:\n${output}`);
      try {
        const response = await fetch(`${baseUrl}/api/settings`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(ready, true, `API did not start:\n${output}`);

    const settingsResponse = await fetch(`${baseUrl}/api/settings`);
    const settings = await settingsResponse.json();
    assert.equal(settings.settings.campaignName, 'STL Raffle');
    assert.equal(settingsResponse.status, 200);

    const uploads = [];
    for (const pageKey of proofPages) {
      const response = await fetch(`${baseUrl}/api/proofs/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: png
      });
      assert.equal(response.status, 201);
      uploads.push({ pageKey, filename: (await response.json()).filename });
    }

    const privateProofResponse = await fetch(`${baseUrl}/api/proofs/${uploads[0].filename}`);
    assert.equal(privateProofResponse.status, 401);

    for (let index = 0; index < 6; index += 1) {
      const response = await fetch(`${baseUrl}/api/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent: `Test participant ${index}`,
          contact: `555010${index}`,
          kiosk: 'API test',
          consent: true,
          proofScreenshots: uploads
        })
      });
      assert.equal(response.status, 201);
    }

    const duplicateEntry = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Duplicate participant',
        contact: '5550100',
        kiosk: 'API test',
        consent: true,
        proofScreenshots: uploads
      })
    });
    assert.equal(duplicateEntry.status, 409);

    const login = await fetch(`${baseUrl}/api/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: adminPasscode })
    });
    assert.equal(login.status, 200);

    const headers = { 'x-admin-passcode': adminPasscode };
    const entriesResponse = await fetch(`${baseUrl}/api/entries`, { headers });
    const entries = (await entriesResponse.json()).data;
    assert.equal(entries.length, 6);

    const proofResponse = await fetch(`${baseUrl}/api/proofs/${uploads[0].filename}`, { headers });
    assert.equal(proofResponse.status, 200);
    assert.equal(Buffer.from(await proofResponse.arrayBuffer()).toString('hex'), png.toString('hex'));

    for (const entry of entries) {
      const response = await fetch(`${baseUrl}/api/entries/${encodeURIComponent(entry.ticket)}/toggle`, {
        method: 'POST',
        headers
      });
      assert.equal(response.status, 200);
    }

    const winners = [];
    const prizes = [];
    for (let round = 0; round < 6; round += 1) {
      const response = await fetch(`${baseUrl}/api/draw`, { method: 'POST', headers });
      assert.equal(response.status, 200);
      const result = await response.json();
      winners.push(result.winner.ticket);
      prizes.push(result.prize);
    }
    assert.equal(new Set(winners).size, 6);
    assert.deepEqual(prizes, [
      '5 kg rice', '5 kg rice', '5 kg rice',
      '5 kg rice', '5 kg rice', '25 kg rice'
    ]);
  } finally {
    if (server.exitCode === null) server.kill();
    await serverClosed;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
