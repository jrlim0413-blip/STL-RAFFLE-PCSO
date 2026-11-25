import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const adminPasscode = 'test-organizer-passcode';
const png = Buffer.from('89504e470d0a1a0a-test-image', 'hex');

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(data));
}

test('Supabase entries store full participant details in a private bucket', { timeout: 30000 }, async () => {
  const objects = new Map();
  const entries = new Map();
  const taskCompletions = new Map();
  let drawResults = [];
  let settingsRow = null;
  const storageServer = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/storage/v1/object/list/raffle-proofs') {
      const options = JSON.parse((await readBody(request)).toString('utf8'));
      const proofNames = [...objects.keys()]
        .filter((key) => key.startsWith('raffle-proofs/'))
        .map((key) => key.slice('raffle-proofs/'.length))
        .filter((name) => name.includes(options.search || ''));
      return sendJson(response, 200, proofNames.map((name) => ({ name })));
    }

    if (url.pathname.startsWith('/storage/v1/object/')) {
      const objectPath = decodeURIComponent(url.pathname.slice('/storage/v1/object/'.length));
      const key = objectPath;
      if (request.method === 'GET') {
        const content = objects.get(key);
        if (!content) return sendJson(response, 404, { statusCode: '404', error: 'Not found' });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        return response.end(content);
      }
      if (request.method === 'DELETE') {
        objects.delete(key);
        return sendJson(response, 200, []);
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        const content = await readBody(request);
        objects.set(key, content);
        return sendJson(response, 200, { Key: key });
      }
    }

    if (url.pathname === '/rest/v1/raffle_entries' && request.method === 'GET') {
      const filter = url.searchParams.get('normalized_contact');
      const values = filter?.match(/^in\.\((.*)\)$/)?.[1]
        .split(',')
        .map((value) => value.replace(/^"|"$/g, ''));
      const rows = [...entries.values()].filter((row) =>
        !values || values.includes(row.normalized_contact)
      );
      return sendJson(response, 200, rows);
    }
    if (url.pathname === '/rest/v1/raffle_settings' && request.method === 'GET') {
      return sendJson(response, 200, settingsRow ? [settingsRow] : []);
    }
    if (url.pathname === '/rest/v1/raffle_settings' && request.method === 'POST') {
      const body = JSON.parse((await readBody(request)).toString('utf8'));
      settingsRow = body;
      response.writeHead(201);
      return response.end();
    }
    if (url.pathname === '/rest/v1/raffle_task_completions' && request.method === 'GET') {
      const ticket = url.searchParams.get('ticket')?.replace(/^eq\./, '');
      const taskId = url.searchParams.get('task_id')?.replace(/^eq\./, '');
      const rows = [...taskCompletions.values()].filter((row) =>
        (!ticket || row.ticket === ticket) && (!taskId || row.task_id === taskId)
      );
      return sendJson(response, 200, rows);
    }
    if (url.pathname === '/rest/v1/raffle_task_completions' && request.method === 'POST') {
      const body = JSON.parse((await readBody(request)).toString('utf8'));
      const rows = Array.isArray(body) ? body : [body];
      const created = rows.map((row) => ({
        ...row,
        completed_at: new Date().toISOString()
      }));
      if (created.some((row) => taskCompletions.has(`${row.ticket}:${row.task_id}`))) {
        return sendJson(response, 409, { code: '23505', message: 'duplicate task completion' });
      }
      for (const row of created) taskCompletions.set(`${row.ticket}:${row.task_id}`, row);
      return sendJson(response, 201, created.length === 1 ? created[0] : created);
    }
    if (url.pathname === '/rest/v1/raffle_entries' && request.method === 'POST') {
      const body = JSON.parse((await readBody(request)).toString('utf8'));
      const rows = Array.isArray(body) ? body : [body];
      for (const row of rows) entries.set(row.ticket, { ...row, created_at: new Date().toISOString() });
      response.writeHead(201);
      return response.end();
    }
    if (url.pathname === '/rest/v1/raffle_entries' && request.method === 'PATCH') {
      const body = JSON.parse((await readBody(request)).toString('utf8'));
      const ticket = url.searchParams.get('ticket')?.replace(/^eq\./, '');
      const row = entries.get(ticket);
      if (row) entries.set(ticket, { ...row, ...body });
      response.writeHead(204);
      return response.end();
    }
    if (url.pathname === '/rest/v1/raffle_draw_state' && request.method === 'GET') {
      return sendJson(response, 200, { id: 1, results: drawResults });
    }
    if (url.pathname === '/rest/v1/raffle_draw_state' && request.method === 'PATCH') {
      const body = JSON.parse((await readBody(request)).toString('utf8'));
      drawResults = body.results;
      response.writeHead(204);
      return response.end();
    }

    sendJson(response, 404, { message: `Unhandled mock Supabase request: ${request.method} ${url.pathname}` });
  });
  storageServer.listen(0, '127.0.0.1');
  await once(storageServer, 'listening');
  const supabasePort = storageServer.address().port;
  const port = await unusedPort();
  const childEnv = {
    ...process.env,
    PORT: String(port),
    ADMIN_PASSCODE: adminPasscode,
    SUPABASE_URL: `http://127.0.0.1:${supabasePort}`,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    SUPABASE_ENTRIES_BUCKET: 'raffle-entries',
    SUPABASE_PROOFS_BUCKET: 'raffle-proofs',
    RAFFLE_SKIP_ENV_FILE: '1'
  };
  delete childEnv.VERCEL;

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

    const proofs = [];
    for (const pageKey of ['melquiades', 'pcso', 'situation-report']) {
      const response = await fetch(`${baseUrl}/api/proofs/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: png
      });
      assert.equal(response.status, 201);
      proofs.push({ pageKey, filename: (await response.json()).filename });
    }

    const submit = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Bucket Test Participant',
        contact: '55501099',
        agentUsername: 'bucket-test-agent',
        supervisorName: 'SPVR CARL',
        consent: true,
        proofScreenshots: proofs
      })
    });
    assert.equal(submit.status, 201);
    const { ticket } = await submit.json();
    assert.match(ticket.ticket, /^STL-\d{8}-\d{6}$/);

    const storedRow = entries.get(ticket.ticket);
    assert.deepEqual(Object.keys(storedRow.data).sort(), ['status', 'ticket', 'time']);
    assert.match(storedRow.normalized_contact, /^[a-f0-9]{64}$/);
    assert.notEqual(storedRow.normalized_contact, '55501099');

    const objectKey = `raffle-entries/entries/${ticket.ticket}.json`;
    const storedEntry = JSON.parse(objects.get(objectKey).toString('utf8'));
    assert.equal(storedEntry.agent, 'Bucket Test Participant');
    assert.equal(storedEntry.contact, '55501099');
    assert.equal(storedEntry.agentUsername, 'bucket-test-agent');
    assert.equal(storedEntry.supervisorName, 'SPVR CARL');
    assert.equal(storedEntry.proofs.length, 3);

    const taskResponse = await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-passcode': adminPasscode
      },
      body: JSON.stringify({ postUrl: 'https://www.facebook.com/example/posts/456' })
    });
    assert.equal(taskResponse.status, 201);
    const task = (await taskResponse.json()).task;

    const engagementProofResponse = await fetch(`${baseUrl}/api/tasks/${task.id}/proof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/png',
        'x-entry-reference': 'bucket-test-agent'
      },
      body: png
    });
    assert.equal(engagementProofResponse.status, 201);
    const engagementProof = await engagementProofResponse.json();
    const completionResponse = await fetch(`${baseUrl}/api/tasks/${task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference: 'bucket-test-agent', proof: engagementProof })
    });
    assert.equal(completionResponse.status, 201);
    assert.equal(taskCompletions.size, 1);

    const anotherSubmit = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Another Bucket Participant',
        contact: '55501100',
        agentUsername: 'another-bucket-agent',
        supervisorName: 'SPVR MOLLY',
        consent: true,
        proofScreenshots: proofs
      })
    });
    assert.equal(anotherSubmit.status, 201);

    const duplicateSubmit = await fetch(`${baseUrl}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'Duplicate Bucket Participant',
        contact: '555-010-99',
        agentUsername: 'duplicate-bucket-agent',
        supervisorName: 'SPVR NYOR',
        consent: true,
        proofScreenshots: proofs
      })
    });
    assert.equal(duplicateSubmit.status, 409);

    const entriesResponse = await fetch(`${baseUrl}/api/entries`, {
      headers: { 'x-admin-passcode': adminPasscode }
    });
    assert.equal(entriesResponse.status, 200);
    const storedEntries = (await entriesResponse.json()).data;
    assert.equal(storedEntries.length, 2);
    assert.ok(storedEntries.some((entry) => entry.agent === 'Bucket Test Participant' && entry.contact === '55501099'));
    const storedParticipant = storedEntries.find((entry) => entry.agent === 'Bucket Test Participant');
    assert.equal(storedParticipant.tasksCompleted, 1);
    assert.equal(storedParticipant.totalTasks, 1);

    drawResults = [{
      round: 1,
      prize: '5 kg rice',
      winner: storedEntry,
      drawnAt: new Date().toISOString()
    }];
    const migration = spawn(process.execPath, ['scripts/migrateEntriesToStorage.js'], {
      cwd: root,
      env: childEnv
    });
    const migrationClosed = new Promise((resolve) => migration.once('close', resolve));
    let migrationOutput = '';
    migration.stdout.on('data', (chunk) => { migrationOutput += chunk; });
    migration.stderr.on('data', (chunk) => { migrationOutput += chunk; });
    let migrationTimer;
    const migrationCode = await Promise.race([
      migrationClosed,
      new Promise((resolve) => { migrationTimer = setTimeout(() => resolve(null), 10000); })
    ]);
    clearTimeout(migrationTimer);
    if (migrationCode === null) {
      migration.kill();
      await migrationClosed;
    }
    assert.equal(migrationCode, 0, migrationOutput);
    assert.deepEqual(Object.keys(drawResults[0].winner), ['ticket']);

    const drawResponse = await fetch(`${baseUrl}/api/draw`, {
      headers: { 'x-admin-passcode': adminPasscode }
    });
    assert.equal(drawResponse.status, 200);
    const hydratedDraw = (await drawResponse.json()).results;
    assert.equal(hydratedDraw[0].winner.agent, 'Bucket Test Participant');
  } finally {
    if (server.exitCode === null) server.kill();
    await serverClosed;
    await new Promise((resolve, reject) =>
      storageServer.close((error) => error ? reject(error) : resolve())
    );
  }
});
