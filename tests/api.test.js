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

test('Vercel routes /live through the live page handler', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const liveRewrite = vercelConfig.rewrites.find((rewrite) => rewrite.source === '/live');
  assert.equal(liveRewrite?.destination, '/api/live-og');
});

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
  delete childEnv.GOOGLE_TTS_API_KEY;
  delete childEnv.AZURE_SPEECH_KEY;
  delete childEnv.ELEVENLABS_API_KEY;

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

    const adlibResponse = await fetch(`${baseUrl}/api/draw/announce?kind=adlib&index=0`);
    assert.equal(adlibResponse.status, 200);
    const adlibData = await adlibResponse.json();
    assert.equal(adlibData.mode, 'browser');
    assert.match(adlibData.text, /Sino kaya ang maswerte ngayon/);
    const invalidAdlibResponse = await fetch(`${baseUrl}/api/draw/announce?kind=adlib&index=30`);
    assert.equal(invalidAdlibResponse.status, 400);

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

    const createdTickets = [];
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
      createdTickets.push((await response.json()).ticket.ticket);
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

    // Test 3-proof upload requirement (React, Comment, Share) for participant 1 using ticketOnly
    const ticket1 = createdTickets[1];
    const actionUploads = [];
    for (const actionKey of ['react', 'comment', 'share']) {
      const upRes = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}/proof`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/png',
          'x-entry-reference': ticket1
        },
        body: png
      });
      assert.equal(upRes.status, 201);
      actionUploads.push({ actionKey, ...(await upRes.json()) });
    }

    const partialProofSubmission = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: ticket1,
        proofs: actionUploads.slice(0, 2),
        ticketOnly: true
      })
    });
    assert.equal(partialProofSubmission.status, 400);

    const fullThreeProofSubmission = await fetch(`${baseUrl}/api/tasks/${taskData.task.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reference: ticket1,
        proofs: actionUploads,
        ticketOnly: true
      })
    });
    assert.equal(fullThreeProofSubmission.status, 201);

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

    const participant1 = entries.find((entry) => entry.ticket === ticket1);
    assert.equal(participant1.tasksCompleted, 1);
    assert.equal(participant1.engagementProofs.length, 3);
    assert.deepEqual(
      participant1.engagementProofs.map((item) => item.pageKey),
      ['task_01 react', 'task_01 comment', 'task_01 share']
    );
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

    const liveStateUpdate = await fetch(`${baseUrl}/api/draw/live-state`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phase: 'spinning',
        round: 1,
        prize: '5 kg rice',
        wheelTickets: tickets.slice(0, 6),
        eligibleCount: 6,
        voiceGender: 'female'
      })
    });
    assert.equal(liveStateUpdate.status, 200);

    const publicLiveDuringSpin = await fetch(`${baseUrl}/api/draw/live`);
    assert.equal(publicLiveDuringSpin.status, 200);
    const liveSpinPayload = await publicLiveDuringSpin.json();
    assert.equal(liveSpinPayload.liveState.phase, 'spinning');
    assert.equal(liveSpinPayload.liveState.voiceGender, 'female');
    assert.deepEqual(liveSpinPayload.liveState.wheelTickets, tickets.slice(0, 6));

    const announceSpinResponse = await fetch(`${baseUrl}/api/draw/announce?kind=spin&round=1&gender=female`);
    assert.equal(announceSpinResponse.status, 200);
    const announceSpinPayload = await announceSpinResponse.json();
    assert.equal(announceSpinPayload.mode, 'browser');
    assert.match(announceSpinPayload.text, /Draw number 1/);

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

    const publicLiveWinnersResponse = await fetch(`${baseUrl}/api/draw/live`);
    assert.equal(publicLiveWinnersResponse.status, 200);
    const publicLiveWinners = await publicLiveWinnersResponse.json();
    assert.equal(publicLiveWinners.liveState.phase, 'winner');
    assert.equal(publicLiveWinners.results.length, 6);
    for (const item of publicLiveWinners.results) {
      assert.equal('contact' in item.winner, false);
      assert.equal('proofs' in item.winner, false);
    }

    const badViewerPing = await fetch(`${baseUrl}/api/draw/live-ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerId: 'bad!' })
    });
    assert.equal(badViewerPing.status, 400);

    const pingOne = await fetch(`${baseUrl}/api/draw/live-ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerId: 'agent_viewer_01', firstJoin: true })
    });
    assert.equal(pingOne.status, 200);
    const pingOneData = await pingOne.json();
    assert.equal(pingOneData.activeViewers, 1);
    assert.equal(pingOneData.totalViewers, 1);

    const pingTwo = await fetch(`${baseUrl}/api/draw/live-ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerId: 'agent_viewer_02', firstJoin: true })
    });
    assert.equal(pingTwo.status, 200);
    const pingTwoData = await pingTwo.json();
    assert.equal(pingTwoData.activeViewers, 2);
    assert.equal(pingTwoData.totalViewers, 2);

    const adminDrawWithViewers = await fetch(`${baseUrl}/api/draw`, { headers });
    assert.equal(adminDrawWithViewers.status, 200);
    const adminDrawPayload = await adminDrawWithViewers.json();
    assert.equal(adminDrawPayload.viewerStats.activeViewers, 2);
    assert.equal(adminDrawPayload.viewerStats.totalViewers, 2);

    const leaveOne = await fetch(`${baseUrl}/api/draw/live-ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ viewerId: 'agent_viewer_01', leave: true })
    });
    assert.equal(leaveOne.status, 200);
    const leaveOneData = await leaveOne.json();
    assert.equal(leaveOneData.activeViewers, 1);
    assert.equal(leaveOneData.totalViewers, 2);

    const unauthorizedTestVoice = await fetch(`${baseUrl}/api/draw/announce?kind=test`);
    assert.equal(unauthorizedTestVoice.status, 401);

    const adminTestVoice = await fetch(`${baseUrl}/api/draw/announce?kind=test&gender=male`, { headers });
    assert.equal(adminTestVoice.status, 200);
    assert.equal((await adminTestVoice.json()).mode, 'browser');

    const invalidWinnerAnnounce = await fetch(`${baseUrl}/api/draw/announce?kind=winner&round=1&ticket=STL-00000000-000000`);
    assert.equal(invalidWinnerAnnounce.status, 404);

    const validWinnerAnnounce = await fetch(
      `${baseUrl}/api/draw/announce?kind=winner&round=1&ticket=${encodeURIComponent(winners[0])}&gender=male`
    );
    assert.equal(validWinnerAnnounce.status, 200);
    const winnerAnnounceData = await validWinnerAnnounce.json();
    assert.equal(winnerAnnounceData.mode, 'browser');
    assert.match(winnerAnnounceData.text, new RegExp(winners[0].slice(-6).split('').join(' ')));

    const exportWinnersResponse = await fetch(`${baseUrl}/api/draw/export-winners`, { headers });
    assert.equal(exportWinnersResponse.status, 200);
    const winnersCsv = await exportWinnersResponse.text();
    assert.match(winnersCsv, /"Round","Prize","Winning Ticket"/);

    const resetDrawResponse = await fetch(`${baseUrl}/api/draw/reset`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'Batch 1 Test' })
    });
    assert.equal(resetDrawResponse.status, 200);
    const resetData = await resetDrawResponse.json();
    assert.equal(resetData.nextRound, 1);
    assert.equal(resetData.results.length, 0);

    const publicLiveAfterReset = await fetch(`${baseUrl}/api/draw/live`);
    assert.equal(publicLiveAfterReset.status, 200);
    const resetLivePayload = await publicLiveAfterReset.json();
    assert.equal(resetLivePayload.liveState.phase, 'idle');
    assert.equal(resetLivePayload.results.length, 0);
    assert.equal(resetLivePayload.viewerStats.activeViewers, 0);
    assert.equal(resetLivePayload.viewerStats.totalViewers, 0);
    assert.equal(resetData.archived.totalWinners, 6);

    const historyResponse = await fetch(`${baseUrl}/api/draw/history`, { headers });
    assert.equal(historyResponse.status, 200);
    const historyData = await historyResponse.json();
    assert.equal(historyData.history.length, 1);
    assert.equal(historyData.history[0].results.length, 6);

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

test('AI announcer detects ElevenLabs no-card option and synthesizes Flash v2.5 audio', async () => {
  const { getVoiceProviderInfo, synthesizeAnnouncementAudio } = await import('../lib/aiAnnouncer.js');
  const prevGoogle = process.env.GOOGLE_TTS_API_KEY;
  const prevAzure = process.env.AZURE_SPEECH_KEY;
  const prevEleven = process.env.ELEVENLABS_API_KEY;
  const originalFetch = globalThis.fetch;

  try {
    delete process.env.GOOGLE_TTS_API_KEY;
    delete process.env.AZURE_SPEECH_KEY;
    process.env.ELEVENLABS_API_KEY = 'xi-test-no-card-key';

    const info = getVoiceProviderInfo();
    assert.equal(info.configured, true);
    assert.equal(info.provider, 'elevenlabs');

    const captured = [];
    globalThis.fetch = async (url, init) => {
      captured.push({ url, init });
      return new Response(Buffer.from('ID3-mock-mp3-elevenlabs'), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    };

    const audio = await synthesizeAnnouncementAudio('Unit test ElevenLabs voice', 'female');
    assert.equal(audio.toString(), 'ID3-mock-mp3-elevenlabs');
    assert.equal(captured.length, 1);
    assert.match(captured[0].url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\//);
    assert.equal(captured[0].init.headers['xi-api-key'], 'xi-test-no-card-key');
    const sentBody = JSON.parse(captured[0].init.body);
    assert.equal(sentBody.model_id, 'eleven_flash_v2_5');
  } finally {
    globalThis.fetch = originalFetch;
    if (prevGoogle === undefined) delete process.env.GOOGLE_TTS_API_KEY;
    else process.env.GOOGLE_TTS_API_KEY = prevGoogle;
    if (prevAzure === undefined) delete process.env.AZURE_SPEECH_KEY;
    else process.env.AZURE_SPEECH_KEY = prevAzure;
    if (prevEleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = prevEleven;
  }
});

test('spin ad-libs prefer ElevenLabs when configured alongside other providers', async () => {
  const { synthesizeAnnouncementAudio } = await import('../lib/aiAnnouncer.js');
  const previousKeys = {
    google: process.env.GOOGLE_TTS_API_KEY,
    azure: process.env.AZURE_SPEECH_KEY,
    eleven: process.env.ELEVENLABS_API_KEY
  };
  const originalFetch = globalThis.fetch;
  try {
    process.env.GOOGLE_TTS_API_KEY = 'google-test-key';
    process.env.AZURE_SPEECH_KEY = 'azure-test-key';
    process.env.ELEVENLABS_API_KEY = 'xi-test-preferred-key';

    let capturedRequest;
    globalThis.fetch = async (url, init) => {
      capturedRequest = { url, init };
      return new Response(Buffer.from('ID3-preferred-elevenlabs'), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' }
      });
    };

    const audio = await synthesizeAnnouncementAudio(
      'Unique spin ad-lib for ElevenLabs preference test.',
      'male',
      { preferElevenLabs: true }
    );
    assert.equal(audio.toString(), 'ID3-preferred-elevenlabs');
    assert.match(capturedRequest.url, /^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\//);
    assert.equal(capturedRequest.init.headers['xi-api-key'], 'xi-test-preferred-key');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousKeys.google === undefined) delete process.env.GOOGLE_TTS_API_KEY;
    else process.env.GOOGLE_TTS_API_KEY = previousKeys.google;
    if (previousKeys.azure === undefined) delete process.env.AZURE_SPEECH_KEY;
    else process.env.AZURE_SPEECH_KEY = previousKeys.azure;
    if (previousKeys.eleven === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = previousKeys.eleven;
  }
});
