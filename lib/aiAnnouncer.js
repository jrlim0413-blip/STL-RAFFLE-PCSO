const AUDIO_CACHE_LIMIT = 80;
const audioCache = new Map();

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getCache(key) {
  if (!audioCache.has(key)) return null;
  const entry = audioCache.get(key);
  audioCache.delete(key);
  audioCache.set(key, entry);
  return entry;
}

function setCache(key, buffer) {
  if (audioCache.has(key)) audioCache.delete(key);
  audioCache.set(key, buffer);
  if (audioCache.size > AUDIO_CACHE_LIMIT) {
    const oldestKey = audioCache.keys().next().value;
    audioCache.delete(oldestKey);
  }
}

export function getVoiceProviderInfo() {
  if (process.env.GOOGLE_TTS_API_KEY) {
    return {
      configured: true,
      provider: 'google',
      label: 'Google Cloud Neural2 (1M chars/mo Free)'
    };
  }
  if (process.env.AZURE_SPEECH_KEY) {
    return {
      configured: true,
      provider: 'azure',
      label: 'Microsoft Azure Filipino Neural (500k chars/mo Free)'
    };
  }
  return {
    configured: false,
    provider: 'browser',
    label: 'Device Voice Fallback (Walang API key)'
  };
}

export function buildAnnouncementText({ kind, round, prize, winnerName, ticket }) {
  const roundNum = Number(round) || 1;
  const cleanPrize = String(prize || '').toLowerCase().includes('25')
    ? "dalawampu't limang kilong bigas"
    : 'limang kilong bigas';

  if (kind === 'test') {
    return 'Magandang araw mga ka-S-T-L! Handa na ang ating opisyal na boses para sa live raffle draw.';
  }

  if (kind === 'spin') {
    if (roundNum === 6) {
      return `Heto na ang Grand Final Draw! Umiikot na ang S-T-L roletta para sa ${cleanPrize}. Good luck sa lahat!`;
    }
    return `Mga ka-S-T-L! Umiikot na ang roletta para sa Draw number ${roundNum}, ${cleanPrize}. Abangan kung kaninong ticket ang hihinto!`;
  }

  if (kind === 'winner') {
    const safeName = String(winnerName || 'Maswerteng Kalahok')
      .replace(/[<>&"]/g, '')
      .trim()
      .slice(0, 80);
    const last6 = String(ticket || '').slice(-6);
    const spacedDigits = last6 ? last6.split('').join(' ') : '';
    if (roundNum === 6) {
      return `Palakpakan natin ang ating Grand Final Winner! Ang nanalo ng ${cleanPrize} sa Draw number 6 ay si ${safeName}! May huling anim na digit: ${spacedDigits}. Congratulations!`;
    }
    return `Congratulations! Ang nanalo sa Draw number ${roundNum} para sa ${cleanPrize} ay si ${safeName}! Huling anim na digit: ${spacedDigits}.`;
  }

  if (kind === 'complete') {
    return 'Kumpleto na ang lahat ng anim na nanalo sa ating S-T-L Community Rice Raffle! Maraming salamat sa inyong paglahok!';
  }

  return '';
}

async function synthesizeGoogleTts(text, gender) {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) return null;

  const preferredTier = process.env.GOOGLE_TTS_VOICE_TIER === 'WaveNet' ? 'WaveNet' : 'Neural2';
  const candidates = gender === 'female'
    ? (preferredTier === 'WaveNet' ? ['fil-PH-Wavenet-B', 'fil-PH-Neural2-A'] : ['fil-PH-Neural2-A', 'fil-PH-Wavenet-B'])
    : (preferredTier === 'WaveNet' ? ['fil-PH-Wavenet-C', 'fil-PH-Neural2-D'] : ['fil-PH-Neural2-D', 'fil-PH-Wavenet-C']);

  for (const voiceName of candidates) {
    try {
      const response = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text },
            voice: {
              languageCode: 'fil-PH',
              name: voiceName
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: 1.03,
              pitch: 0.0
            }
          })
        }
      );
      if (!response.ok) continue;
      const data = await response.json();
      if (data?.audioContent) {
        return Buffer.from(data.audioContent, 'base64');
      }
    } catch {
      // Try next voice candidate
    }
  }
  return null;
}

async function synthesizeAzureTts(text, gender) {
  const apiKey = process.env.AZURE_SPEECH_KEY;
  if (!apiKey) return null;

  const region = process.env.AZURE_SPEECH_REGION || 'southeastasia';
  const voiceName = gender === 'female' ? 'fil-PH-BlessicaNeural' : 'fil-PH-AngeloNeural';
  const ssml = `<speak version="1.0" xml:lang="fil-PH"><voice xml:lang="fil-PH" name="${voiceName}"><prosody rate="+4%">${escapeXml(text)}</prosody></voice></speak>`;

  try {
    const response = await fetch(
      `https://${encodeURIComponent(region)}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
          'User-Agent': 'stl-raffle-announcer'
        },
        body: ssml
      }
    );
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export async function synthesizeAnnouncementAudio(text, gender = 'male') {
  if (!text) return null;
  const safeGender = gender === 'female' ? 'female' : 'male';
  const cacheKey = `${safeGender}:${text}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  let audioBuffer = await synthesizeGoogleTts(text, safeGender);
  if (!audioBuffer) {
    audioBuffer = await synthesizeAzureTts(text, safeGender);
  }

  if (audioBuffer && audioBuffer.length > 0) {
    setCache(cacheKey, audioBuffer);
    return audioBuffer;
  }
  return null;
}
