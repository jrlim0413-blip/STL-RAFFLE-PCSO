// Web Audio API Synthesizer for realistic clicking ticks, celebratory fanfare, confetti, and AI announcer playback

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

function speakWithBrowserVoice(text, gender = 'male') {
  if (!text || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices() || [];

    const filipinoVoices = voices.filter((v) => /fil|tl-PH|en-PH/i.test(v.lang));
    const pool = filipinoVoices.length ? filipinoVoices : voices;
    const genderHint = gender === 'female'
      ? /blessica|female|woman|maria|samantha|ava|zira|aria|jenny|natural/i
      : /angelo|male|man|guy|daniel|david|ryan|andrew|natural/i;

    const chosen = pool.find((v) => /natural|online|google/i.test(v.name) && genderHint.test(v.name))
      || pool.find((v) => genderHint.test(v.name))
      || pool.find((v) => /natural|google/i.test(v.name))
      || pool[0];

    if (chosen) {
      utterance.voice = chosen;
      utterance.lang = chosen.lang;
    } else {
      utterance.lang = 'fil-PH';
    }
    utterance.rate = 0.98;
    utterance.pitch = gender === 'female' ? 1.05 : 0.95;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Ignore browser speech errors
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
      await audio.play();
      return { played: true, mode: 'cloud' };
    }

    const data = await response.json();
    if (data?.text) {
      speakWithBrowserVoice(data.text, gender);
      return { played: true, mode: 'browser', text: data.text };
    }
  } catch {
    // Autoplay blocked or network error
  }
  return { played: false };
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
