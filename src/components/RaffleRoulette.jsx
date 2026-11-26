import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Gift,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  Flame,
  Users,
  Ticket
} from 'lucide-react';

// Web Audio API Synthesizer for realistic clicking ticks and triumphant fanfare
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
      this.ctx.resume();
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
    } catch (e) {
      // Ignore audio error if browser blocks autoplay
    }
  }

  playFanfare() {
    if (this.muted) return;
    try {
      this.init();
      if (!this.ctx) return;
      const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99]; // C4, E4, G4, C5, E5, G5
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
    } catch (e) { }
  }
}

const sfx = new SoundFX();

export default function RaffleRoulette({
  entries = [],
  nextRound,
  nextPrize,
  drawResults = [],
  adminPasscode,
  onDrawComplete,
  onError
}) {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [currentWinner, setCurrentWinner] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [ticketFormat, setTicketFormat] = useState('last6'); // 'last6' (huling 6 digits) o 'full' (buong ticket)
  const canvasRef = useRef(null);
  const wheelRef = useRef(null);

  // Strict eligibility: Nakadepende kung na-complete ang LAHAT ng active tasks
  const previousWinnerTickets = new Set(drawResults.map((r) => r.winner.ticket));
  const eligibleEntries = entries.filter((e) => {
    if (previousWinnerTickets.has(e.ticket)) return false;
    // Kung may engagement tasks, kailangan nakumpleto ang LAHAT ng active tasks para maging eligible
    if (e.totalTasks > 0) {
      return (e.tasksCompleted || 0) >= e.totalTasks;
    }
    return e.status === 'Eligible';
  });

  // Colors for roulette wheel segments (PCSO / Lottery vibrant festive theme)
  const segmentColors = [
    '#1e3a8a', // Royal Blue
    '#dc2626', // Vibrant Red
    '#eab308', // Gold Yellow
    '#059669', // Emerald Green
    '#7c3aed', // Purple
    '#ea580c', // Orange
    '#0284c7', // Sky Blue
    '#be123c', // Rose Red
  ];

  // Up to 16 display segments for visual aesthetic
  const displayItems = eligibleEntries.slice(0, 16);
  const sliceAngle = displayItems.length > 0 ? 360 / displayItems.length : 360;

  // Toggle sound
  const toggleSound = () => {
    sfx.muted = soundEnabled;
    setSoundEnabled(!soundEnabled);
  };

  // Run the full physical roulette draw
  const handleStartDraw = async () => {
    const remainingDraws = 7 - nextRound;
    if (!nextRound || eligibleEntries.length < remainingDraws) {
      if (onError) {
        onError(`Kailangan ng kahit ${remainingDraws} kwalipikadong entries para ituloy ang 6-winner draw.`);
      }
      return;
    }

    sfx.init();
    setIsSpinning(true);
    setShowCelebration(false);
    setCurrentWinner(null);

    try {
      // Execute the draw API call
      const response = await fetch('/api/draw', {
        method: 'POST',
        headers: { 'x-admin-passcode': adminPasscode }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Hindi matapos ang draw.');

      // Calculate winning ticket's segment
      const winningTicket = data.winner.ticket;
      let winningIndex = displayItems.findIndex((item) => item.ticket === winningTicket);
      if (winningIndex === -1) winningIndex = 0;

      // Realistic Physics: 6 to 9 full spins + exact target angle to pointer at 12 o'clock
      const fullSpins = 360 * 7; // 7 full rotations
      const targetSegmentAngle = winningIndex * sliceAngle + sliceAngle / 2;
      // Wheel spins clockwise, indicator is at top (270 deg / -90 deg)
      const targetRotation = rotation + fullSpins + (360 - targetSegmentAngle);

      // Play audio ticks during acceleration and deceleration
      let tickCount = 0;
      const totalTicks = 45;
      const startSpinTime = Date.now();
      const spinDuration = 4500; // 4.5 seconds

      const tickInterval = setInterval(() => {
        const elapsed = Date.now() - startSpinTime;
        if (elapsed >= spinDuration) {
          clearInterval(tickInterval);
        } else {
          // Play click sound
          const progress = elapsed / spinDuration;
          const pitch = 1.2 - progress * 0.4;
          sfx.playTick(pitch);
          tickCount++;
        }
      }, 95);

      // Trigger visual wheel rotation
      setRotation(targetRotation);

      // When rotation completes
      setTimeout(() => {
        clearInterval(tickInterval);
        setIsSpinning(false);
        setCurrentWinner(data);
        setShowCelebration(true);
        sfx.playFanfare();
        triggerConfetti();

        if (onDrawComplete) {
          onDrawComplete(data);
        }
      }, spinDuration);

    } catch (err) {
      setIsSpinning(false);
      if (onError) onError(err.message || 'May naganap na error sa pag-draw.');
    }
  };

  // Realistic confetti burst on canvas
  const triggerConfetti = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement.offsetWidth;
    canvas.height = canvas.parentElement.offsetHeight;

    const particles = [];
    const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6'];

    for (let i = 0; i < 90; i++) {
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
        p.vy += 0.35; // gravity
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

      frame++;
      if (active && frame < 120) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    requestAnimationFrame(animate);
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-slate-950 via-blue-950 to-slate-900 p-6 sm:p-8 text-white shadow-2xl">
      {/* Confetti Overlay Canvas */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-30 h-full w-full"
      />

      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-blue-950 font-black shadow-lg">
            <Trophy className="h-6 w-6" />
          </span>
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
              LIVE LOTTO TAMBIOLO &amp; ROLLETA
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Six-Winner Live Raffle Draw
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-red-600 text-white font-extrabold uppercase animate-pulse">
                <Flame className="w-3.5 h-3.5" /> LIVE
              </span>
            </h2>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Format Toggle Button: Last 6 vs Full Ticket */}
          <button
            type="button"
            onClick={() => setTicketFormat(ticketFormat === 'last6' ? 'full' : 'last6')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-400/30 bg-amber-500/10 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
            title="Pindutin para magpalit: Huling 6 Characters o Buong Ticket"
          >
            <Ticket className="w-3.5 h-3.5 text-amber-400" />
            <span>{ticketFormat === 'last6' ? 'Display: Huling 6 Digits' : 'Display: Buong Ticket Code'}</span>
          </button>

          {/* Sound Toggle Button */}
          <button
            type="button"
            onClick={toggleSound}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/20 bg-white/10 text-xs font-bold text-slate-200 hover:bg-white/20 transition"
            title={soundEnabled ? 'I-mute ang tunog' : 'I-on ang tunog'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            <span>{soundEnabled ? 'Audio ON' : 'Muted'}</span>
          </button>

          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>{eligibleEntries.length} Kwalipikadong Entries</span>
          </div>
        </div>
      </div>

      {/* Current Round Prize Announcement Banner */}
      <div className="my-6 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-400/10 to-red-500/20 p-4 text-center">
        <p className="text-xs font-black uppercase tracking-widest text-amber-300">
          {nextRound ? `Kasalukuyang Bunutan: Draw #${nextRound} of 6` : 'Tapos na ang Lahat ng 6 Draws!'}
        </p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <Gift className="h-6 w-6 text-yellow-300 animate-bounce" />
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {nextPrize ? (
              <span className={nextRound === 6 ? 'text-amber-300 underline decoration-red-500 font-extrabold' : ''}>
                {nextPrize.toUpperCase()} {nextRound === 6 ? '★ GRAND FINAL PRIZE ★' : 'COMMUNITY PRIZE'}
              </span>
            ) : (
              'Lahat ng 6 Premyo ay Matagumpay nang Nabunot'
            )}
          </h3>
        </div>
      </div>

      {/* MAIN ROULETTE & TAMBIOLO ARENA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-4">

        {/* LEFT / CENTER: THE ROULETTE WHEEL */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center relative">

          {/* Top Indicator Arrow Pin pointing down */}
          <div className="relative z-20 -mb-4 flex flex-col items-center">
            <div className="w-6 h-8 bg-gradient-to-b from-amber-300 to-red-600 clip-triangle shadow-xl drop-shadow-[0_4px_8px_rgba(239,68,68,0.8)] animate-pulse" />
          </div>

          {/* Golden Outer LED Rim */}
          <div className="relative p-4 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-300 to-amber-700 shadow-[0_0_50px_rgba(245,158,11,0.4)] border-4 border-amber-400">
            {/* Blinking Perimeter Lights */}
            <div className="absolute inset-2 rounded-full border-2 border-dashed border-white/40 pointer-events-none animate-spin-slow" />

            {/* Spinning SVG Roulette Wheel */}
            <div
              ref={wheelRef}
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: isSpinning
                  ? 'transform 4.5s cubic-bezier(0.12, 0.95, 0.22, 1)'
                  : 'none'
              }}
              className="relative w-72 h-72 sm:w-96 sm:h-96 rounded-full overflow-hidden shadow-2xl border-4 border-slate-950"
            >
              <svg viewBox="0 0 400 400" className="w-full h-full">
                {displayItems.length > 0 ? (
                  displayItems.map((entry, index) => {
                    const startAngle = index * sliceAngle;
                    const endAngle = (index + 1) * sliceAngle;
                    const x1 = 200 + 200 * Math.cos((startAngle * Math.PI) / 180);
                    const y1 = 200 + 200 * Math.sin((startAngle * Math.PI) / 180);
                    const x2 = 200 + 200 * Math.cos((endAngle * Math.PI) / 180);
                    const y2 = 200 + 200 * Math.sin((endAngle * Math.PI) / 180);
                    const pathData = `M200,200 L${x1},${y1} A200,200 0 0,1 ${x2},${y2} Z`;
                    const midAngle = startAngle + sliceAngle / 2;
                    const textX = 200 + 130 * Math.cos((midAngle * Math.PI) / 180);
                    const textY = 200 + 130 * Math.sin((midAngle * Math.PI) / 180);
                    const color = segmentColors[index % segmentColors.length];
                    const ticketText = ticketFormat === 'last6'
                      ? entry.ticket.slice(-6)
                      : entry.ticket;
                    const fontSize = ticketFormat === 'last6'
                      ? (displayItems.length > 10 ? '12' : '14')
                      : (displayItems.length > 10 ? '8.5' : '10');

                    return (
                      <g key={entry.ticket}>
                        <path d={pathData} fill={color} stroke="#ffffff" strokeWidth="1.5" />
                        <text
                          x={textX}
                          y={textY}
                          fill="#ffffff"
                          fontSize={fontSize}
                          fontWeight="900"
                          fontFamily="monospace"
                          textAnchor="middle"
                          dominantBaseline="central"
                          transform={`rotate(${midAngle + 90}, ${textX}, ${textY})`}
                          className="drop-shadow-md select-none"
                        >
                          {ticketText}
                        </text>
                      </g>
                    );
                  })
                ) : (
                  <circle cx="200" cy="200" r="200" fill="#1e293b" />
                )}
              </svg>

              {/* Center 3D Golden Spinner Hub */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-amber-600 via-yellow-200 to-amber-700 border-4 border-white shadow-2xl flex flex-col items-center justify-center text-blue-950 font-black">
                  <span className="text-[10px] tracking-widest uppercase text-blue-900 font-extrabold">STL</span>
                  <span className="text-xs sm:text-sm font-black">RAFFLE</span>
                  <Sparkles className="w-3.5 h-3.5 text-amber-800" />
                </div>
              </div>
            </div>
          </div>

          {/* Action Button: Paikutin ang Rolleta */}
          <div className="mt-8">
            <button
              type="button"
              onClick={handleStartDraw}
              disabled={isSpinning || !nextRound || eligibleEntries.length === 0}
              className={`inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider shadow-2xl transition transform active:scale-95 ${isSpinning
                  ? 'bg-amber-600 text-white cursor-not-allowed animate-pulse'
                  : nextRound && eligibleEntries.length > 0
                    ? 'bg-gradient-to-r from-red-600 via-amber-500 to-yellow-400 hover:brightness-110 text-slate-950 hover:scale-105 shadow-[0_0_30px_rgba(245,158,11,0.6)]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
            >
              {isSpinning ? (
                <>
                  <RotateCcw className="w-6 h-6 animate-spin text-white" />
                  Umiikot ang Rolleta...
                </>
              ) : nextRound ? (
                <>
                  <Sparkles className="w-6 h-6 text-red-950" />
                  Paikutin ang Rolleta (Draw #{nextRound})
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-6 h-6" />
                  Lahat ng Draw ay Kumpleto Na
                </>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT: LIVE DRAW RESULTS & REAL-TIME WINNER CARD */}
        <div className="lg:col-span-5 space-y-4">

          {/* WINNER SPOTLIGHT CARD (When a winner is drawn) */}
          {currentWinner && showCelebration && (
            <div className="rounded-2xl border-2 border-yellow-400 bg-gradient-to-br from-yellow-500/30 via-red-500/20 to-slate-900 p-5 shadow-2xl animate-fadeIn">
              <div className="flex items-center justify-between border-b border-yellow-400/30 pb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400 text-blue-950 font-black text-xs uppercase tracking-wider">
                  <Trophy className="w-4 h-4 text-blue-950" />
                  Opisyal na Nanalo! (Draw #{currentWinner.round})
                </span>
                <span className="text-xs font-black text-amber-300">
                  {currentWinner.prize}
                </span>
              </div>

              <div className="mt-4 space-y-2.5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Winning Ticket Code:</p>
                  <p className="font-mono text-2xl sm:text-3xl font-black text-yellow-300 tracking-wider">
                    {currentWinner.winner.ticket}
                  </p>
                  <p className="text-xs text-amber-300 font-bold mt-1 flex items-center gap-1.5">
                    Huling 6 Characters: <span className="font-mono bg-yellow-400/20 text-yellow-200 px-2 py-0.5 rounded font-black border border-yellow-400/30">{currentWinner.winner.ticket.slice(-6)}</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                  <div>
                    <p className="text-slate-400">Pangalan:</p>
                    <p className="font-bold text-white text-sm">{currentWinner.winner.agent}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Contact Number:</p>
                    <p className="font-bold text-white">{currentWinner.winner.contact}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Agent Username:</p>
                    <p className="font-mono font-bold text-amber-300">{currentWinner.winner.agentUsername || '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Supervisor:</p>
                    <p className="font-bold text-white">{currentWinner.winner.supervisorName || '—'}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LIST OF 6 DRAW ROUNDS */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 backdrop-blur-md">
            <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center justify-between">
              <span>Opisyal na Talaan ng 6 Winners</span>
              <span className="text-amber-400 font-bold">{drawResults.length}/6 Nabunot</span>
            </h4>

            <div className="mt-3 space-y-2">
              {[1, 2, 3, 4, 5, 6].map((roundNum) => {
                const result = drawResults.find((r) => r.round === roundNum);
                const isCurrent = nextRound === roundNum;
                const isFinal = roundNum === 6;

                return (
                  <div
                    key={roundNum}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs transition ${result
                        ? 'border-emerald-500/50 bg-emerald-950/30 text-white'
                        : isCurrent
                          ? 'border-yellow-400 bg-yellow-500/10 text-yellow-200 font-bold'
                          : 'border-white/5 bg-white/5 text-slate-400'
                      }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[11px] ${result ? 'bg-emerald-500 text-slate-950' : isCurrent ? 'bg-yellow-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}>
                        {roundNum}
                      </span>
                      <div>
                        <p className="font-bold text-white">
                          Draw #{roundNum} — {isFinal ? '25 kg Bigas (Grand Final)' : '5 kg Bigas'}
                        </p>
                        {result && (
                          <p className="text-[11px] text-emerald-300 font-medium">
                            {result.winner.agent} — <span className="font-mono font-bold text-white">{result.winner.ticket}</span> (Huling 6: <strong className="font-mono text-yellow-300">{result.winner.ticket.slice(-6)}</strong>)
                          </p>
                        )}
                      </div>
                    </div>

                    <div>
                      {result ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Panalo
                        </span>
                      ) : isCurrent ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-black text-yellow-300 animate-pulse">
                          Kasalukuyan
                        </span>
                      ) : (
                        <span className="text-slate-500">Pending</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
