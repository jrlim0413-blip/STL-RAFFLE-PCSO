// Web Audio API Synthesizer for realistic clicking ticks, celebratory fanfare, confetti, and AI announcer playback
import { SPIN_ADLIBS } from '../../lib/spinAdlibs.js';

class SoundFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  playTick(pitchModifier = 1) {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600 * pitchModifier, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, this.ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.045);
    } catch {
      // Ignore audio errors if browser blocks autoplay
    }
  }

  playFanfare() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const start = this.ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.3, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + 0.85);
      });
    } catch {
      // Ignore audio errors
    }
  }
}

export const sfx = new SoundFX();

let activeAudioElement = null;
let activeAudioUrl = null;

export function stopAllAnnouncements() {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch {
      // Ignore
    }
    activeAudioElement = null;
  }
  if (activeAudioUrl) {
    URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}

let voicePreloadAttached = false;

export function preloadBrowserVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || voicePreloadAttached) return;
  voicePreloadAttached = true;
  try {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', () => {
      window.speechSynthesis.getVoices();
    });
  } catch {
    // Ignore browser voice preload errors
  }
}

preloadBrowserVoices();

export async function tryUnlockAudio() {
  preloadBrowserVoices();
  sfx.muted = false;
  sfx.init();
  if (sfx.ctx && sfx.ctx.state === 'suspended') {
    try {
      await sfx.ctx.resume();
    } catch {
      // Blocked until user interaction
    }
  }
  return !sfx.ctx || sfx.ctx.state === 'running';
}

function getAvailableVoicesAsync(timeoutMs = 250) {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve([]);
      return;
    }
    const existing = window.speechSynthesis.getVoices() || [];
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener?.('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices() || []);
    };
    window.speechSynthesis.addEventListener?.('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });
}

function pickBestBrowserVoice(voices, gender = 'male') {
  if (!voices.length) return null;
  const genderHint = gender === 'female'
    ? /blessica|female|woman|maria|samantha|ava|zira|aria|jenny|alice|rachel|natural/i
    : /angelo|male|man|guy|daniel|david|ryan|andrew|george|adam|natural/i;
  const isNatural = (v) => /natural|online|neural|google|enhanced|premium/i.test(v.name || '');
  const isFilipino = (v) => /^(fil|tl)(-|$)/i.test(v.lang || '') || /filipino|tagalog|blessica|angelo/i.test(v.name || '');
  const isPhEnglish = (v) => /^en-PH/i.test(v.lang || '');

  const filipinoVoices = voices.filter(isFilipino);
  const phEnglishVoices = voices.filter(isPhEnglish);

  return filipinoVoices.find((v) => isNatural(v) && genderHint.test(v.name))
    || filipinoVoices.find(isNatural)
    || filipinoVoices.find((v) => genderHint.test(v.name))
    || filipinoVoices[0]
    || phEnglishVoices.find((v) => isNatural(v) && genderHint.test(v.name))
    || phEnglishVoices[0]
    || voices.find((v) => isNatural(v) && genderHint.test(v.name))
    || voices.find((v) => genderHint.test(v.name))
    || voices[0];
}

async function speakWithBrowserVoice(text, gender = 'male') {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return { played: false, blocked: false };
  }
  try {
    const voices = await getAvailableVoicesAsync(250);
    const chosen = pickBestBrowserVoice(voices, gender);
    const isNativeFilipino = Boolean(
      chosen && (/^(fil|tl)(-|$)/i.test(chosen.lang || '') || /filipino|tagalog/i.test(chosen.name || ''))
    );
    const spokenText = isNativeFilipino
      ? text.replace(/\bS-T-L\b/g, 'STL')
      : text.replace(/\bS-T-L\b/g, 'es ti el');

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    } else {
      utterance.lang = 'fil-PH';
    }
    utterance.rate = isNativeFilipino ? 0.99 : 0.94;
    utterance.pitch = gender === 'female' ? 1.06 : 0.94;

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      utterance.onstart = () => finish({ played: true, mode: 'browser', text });
      utterance.onerror = (event) => {
        const errCode = event?.error || '';
        finish({ played: false, blocked: errCode === 'not-allowed' || errCode === 'audio-busy' });
      };
      window.speechSynthesis.speak(utterance);
      setTimeout(() => finish({ played: true, mode: 'browser', text }), 400);
    });
  } catch {
    return { played: false, blocked: false };
  }
}

/**
 * Plays an AI neural announcer voice clip from /api/draw/announce (cached MP3),
 * gracefully falling back to browser SpeechSynthesis if no cloud TTS key is configured.
 */
export async function playAnnouncerVoice({
  kind,
  round,
  ticket = '',
  adlibIndex,
  gender = 'male',
  headers = {},
  enabled = true
}) {
  if (!enabled || !kind) return { played: false };
  stopAllAnnouncements();

  const params = new URLSearchParams({
    kind,
    gender: gender === 'female' ? 'female' : 'male'
  });
  if (round) params.set('round', String(round));
  if (ticket) params.set('ticket', ticket);
  if (Number.isInteger(adlibIndex)) params.set('index', String(adlibIndex));

  try {
    const response = await fetch(`/api/draw/announce?${params.toString()}`, { headers });
    if (!response.ok) return { played: false };

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('audio/')) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      activeAudioUrl = url;
      activeAudioElement = audio;
      const cleanup = () => {
        if (activeAudioUrl === url) {
          URL.revokeObjectURL(url);
          activeAudioUrl = null;
          activeAudioElement = null;
        }
      };
      audio.addEventListener('ended', cleanup, { once: true });
      audio.addEventListener('error', cleanup, { once: true });
      try {
        await audio.play();
        return { played: true, mode: 'cloud' };
      } catch (playErr) {
        cleanup();
        return {
          played: false,
          blocked: playErr?.name === 'NotAllowedError'
        };
      }
    }

    const data = await response.json();
    if (data?.text) {
      return await speakWithBrowserVoice(data.text, gender);
    }
  } catch {
    // Autoplay blocked or network error
  }
  return { played: false };
}

// Track used ad-lib indices per spin session (resets when all used)
let _adlibUsedIndices = new Set();

/**
 * Picks a random unused ad-lib line and plays it with cloud TTS or browser fallback.
 * @param {string} gender - 'male' | 'female'
 * @returns {Promise<boolean>} true if speech started
 */
export async function playSpinAdlib(gender = 'male') {
  if (typeof window === 'undefined') return false;
  // Don't interrupt active announcer voice (cloud TTS audio element)
  if (activeAudioElement && !activeAudioElement.paused) return false;

  // Reset pool if all used
  if (_adlibUsedIndices.size >= SPIN_ADLIBS.length) {
    _adlibUsedIndices = new Set();
  }

  // Pick a random unused index
  let idx;
  let attempts = 0;
  do {
    idx = Math.floor(Math.random() * SPIN_ADLIBS.length);
    attempts += 1;
  } while (_adlibUsedIndices.has(idx) && attempts < SPIN_ADLIBS.length * 3);

  _adlibUsedIndices.add(idx);
  const line = SPIN_ADLIBS[idx];

  try {
    const result = await playAnnouncerVoice({
      kind: 'adlib',
      adlibIndex: idx,
      gender
    });
    if (result?.played || result?.mode === 'browser') return result?.played ?? false;
    if (!('speechSynthesis' in window) || window.speechSynthesis.speaking) return false;
    const browserResult = await speakWithBrowserVoice(line, gender);
    return browserResult?.played ?? false;
  } catch {
    return false;
  }
}

/**
 * Resets the ad-lib used-indices pool (call when spin ends or new round starts).
 */
export function resetAdlibPool() {
  _adlibUsedIndices = new Set();
}

/**
 * Triggers celebratory confetti animation on a canvas overlay element.
 */
export function launchConfetti(canvas) {
  if (!canvas || !canvas.parentElement) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = canvas.parentElement.offsetWidth;
  canvas.height = canvas.parentElement.offsetHeight;

  const particles = [];
  const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6'];

  for (let i = 0; i < 90; i += 1) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 16,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      vr: (Math.random() - 0.5) * 12,
      alpha: 1
    });
  }

  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.35;
      p.rotation += p.vr;
      p.alpha -= 0.012;

      if (p.alpha > 0) {
        active = true;
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }
    });

    frame += 1;
    if (active && frame < 120) {
      requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };
  requestAnimationFrame(animate);
}
