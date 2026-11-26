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
    assert.equal(settings.settings.entryStartAt, '');
    assert.equal(settings.settings.entryEndAt, '');
    assert.equal(settingsResponse.status, 200);

    const login = await fetch(`${baseUrl}/api/admin/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: adminPasscode })
    });
    assert.equal(login.status, 200);
    const headers = { 'x-admin-passcode': adminPasscode };

    const invalidTaskUrl = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ postUrl: 'https://example.com/not-a-facebook-post' })
    });
    assert.equal(invalidTaskUrl.status, 400);

    const taskResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postUrl: 'https://www.facebook.com/example/posts/123',
        instruction: 'Like the post and leave a comment.',
        suggestedComment: 'Thanks for sharing!'
      })
    });
    assert.equal(taskResponse.status, 201);
    const taskData = await taskResponse.json();
    assert.equal(taskData.task.id, 'task_01');
    assert.equal(taskData.settings.engagementTasks.length, 1);
    const publicTaskResponse = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}`);
    assert.equal(publicTaskResponse.status, 200);
    assert.equal((await publicTaskResponse.json()).task.suggestedComment, 'Thanks for sharing!');

    const updatedTaskResponse = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postUrl: 'https://www.facebook.com/reel/1234567890123456',
        instruction: 'Updated task instruction',
        suggestedComment: 'Updated comment'
      })
    });
    assert.equal(updatedTaskResponse.status, 200);
    const updatedTaskResult = await updatedTaskResponse.json();
    assert.equal(updatedTaskResult.task.postUrl, 'https://www.facebook.com/reel/1234567890123456');
    assert.equal(updatedTaskResult.task.instruction, 'Updated task instruction');
    assert.equal(updatedTaskResult.task.suggestedComment, 'Updated comment');

    const invalidSchedule = await fetch(`${baseUrl}/api/settings`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryStartAt: new Date(Date.now() + 3600000).toISOString() })
    });
    assert.equal(invalidSchedule.status, 400);

    const futureStart = new Date(Date.now() + 3600000).toISOString();
    const futureEnd = new Date(Date.now() + 7200000).toISOString();
    const scheduleResponse = await fetch(`${baseUrl}/api/settings`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryStartAt: futureStart, entryEndAt: futureEnd })
    });
    assert.equal(scheduleResponse.status, 200);

    const earlyEntry = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(earlyEntry.status, 409);
    assert.match((await earlyEntry.json()).error, /not open yet/i);

    const earlyProofUpload = await fetch(`${baseUrl}/api/proofs/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: png
    });
    assert.equal(earlyProofUpload.status, 409);

    const activeSchedule = await fetch(`${baseUrl}/api/settings`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryStartAt: new Date(Date.now() - 60000).toISOString(),
        entryEndAt: new Date(Date.now() + 3600000).toISOString()
      })
    });
    assert.equal(activeSchedule.status, 200);

    const missingRequiredFields = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: 'Required field test', contact: '55501099', consent: true })
    });
    assert.equal(missingRequiredFields.status, 400);
    assert.match((await missingRequiredFields.json()).error, /agent username.*supervisor name/i);

    const invalidSupervisor = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Invalid supervisor test',
        contact: '55501098',
        agentUsername: 'invalid-supervisor-test',
        supervisorName: 'Not on the list',
        consent: true
      })
    });
    assert.equal(invalidSupervisor.status, 400);
    assert.match((await invalidSupervisor.json()).error, /valid supervisor/i);

    const singleNameEntry = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Juan',
        contact: '55501099',
        agentUsername: 'single-name-agent',
        supervisorName: 'SPVR JED',
        consent: true
      })
    });
    assert.equal(singleNameEntry.status, 400);
    assert.match((await singleNameEntry.json()).error, /buong pangalan/i);

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
          agentUsername: `test-agent-${index}`,
          supervisorName: 'SPVR JED',
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
        agentUsername: 'duplicate-agent',
        supervisorName: 'SPVR JED',
        consent: true,
        proofScreenshots: uploads
      })
    });
    assert.equal(duplicateEntry.status, 409);

    const taskVerification = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: 'test-agent-0' })
    });
    assert.equal(taskVerification.status, 200);

    const unknownTaskReference = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: 'not-an-entry' })
    });
    assert.equal(unknownTaskReference.status, 404);

    const taskProofResponse = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}/proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'x-entry-reference': 'test-agent-0'
      },
      body: png
    });
    assert.equal(taskProofResponse.status, 201);
    const proof = await taskProofResponse.json();
    const taskCompletion = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: 'test-agent-0', proof })
    });
    assert.equal(taskCompletion.status, 201);

    const duplicateTaskCompletion = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: 'test-agent-0', proof })
    });
    assert.equal(duplicateTaskCompletion.status, 409);

    const entriesResponse = await fetch(`${baseUrl}/api/entries`, { headers });
    const entriesResult = await entriesResponse.json();
    const entries = entriesResult.data;
    assert.equal(entries.length, 6);
    assert.equal(entriesResult.stats.activeAgents, 6);
    const participant = entries.find((entry) => entry.agent === 'Test participant 0');
    assert.equal(participant.agentUsername, 'test-agent-0');
    assert.equal(participant.supervisorName, 'SPVR JED');
    assert.equal(participant.tasksCompleted, 1);
    assert.equal(participant.totalTasks, 1);
    assert.equal(participant.engagementProofs.length, 1);
    assert.equal(participant.engagementProofs[0].filename, proof.filename);
    const tickets = entries.map((entry) => entry.ticket);
    assert.equal(new Set(tickets).size, entries.length);
    for (const ticket of tickets) assert.match(ticket, /^STL-\d{8}-\d{6}$/);

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

    const csvResponse = await fetch(`${baseUrl}/api/export`, { headers });
    assert.equal(csvResponse.status, 200);
    const csv = await csvResponse.text();
    assert.match(csv, /"Agent Username","Supervisor Name","Participant Name"/);
    assert.match(csv, /"test-agent-0","SPVR JED","Test participant 0"/);

    const closedSchedule = await fetch(`${baseUrl}/api/settings`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entryStartAt: new Date(Date.now() - 7200000).toISOString(),
        entryEndAt: new Date(Date.now() - 1000).toISOString()
      })
    });
    assert.equal(closedSchedule.status, 200);

    const lateEntry = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(lateEntry.status, 409);
    assert.match((await lateEntry.json()).error, /period is closed/i);
  } finally {
    if (server.exitCode === null) server.kill();
    await serverClosed;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
