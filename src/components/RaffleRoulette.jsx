import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Gift,
  Loader2,
  Maximize2,
  Mic,
  Minimize2,
  Radio,
  RotateCcw,
  Sparkles,
  Square,
  Trophy,
  Volume2,
  VolumeX,
  Flame,
  Users,
  Ticket,
  X
} from 'lucide-react';
import RouletteWheelCanvas from './RouletteWheelCanvas';
import { launchConfetti, playAnnouncerVoice, sfx, stopAllAnnouncements } from '../utils/raffleAudio';

export default function RaffleRoulette({
  entries = [],
  nextRound,
  nextPrize,
  drawResults = [],
  campaignName = 'STL Community Rice Raffle',
  publicLiveUrl = 'https://stl-raffle-campaign.vercel.app/live',
  voiceInfo = null,
  initialVoiceGender = 'male',
  adminPasscode,
  onDrawComplete,
  onResetDraw,
  onError
}) {
  const [spinPhase, setSpinPhase] = useState('idle'); // 'idle' | 'spinning' | 'stopping'
  const [rotation, setRotation] = useState(0);
  const [currentWinner, setCurrentWinner] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceGender, setVoiceGender] = useState(initialVoiceGender || 'male');
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [copiedLiveLink, setCopiedLiveLink] = useState(false);
  const [ticketFormat, setTicketFormat] = useState('last6'); // 'last6' (huling 6 digits) o 'full' (buong ticket)
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [winningSliceOverride, setWinningSliceOverride] = useState(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetNote, setResetNote] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [exportingFormat, setExportingFormat] = useState('');
  const canvasRef = useRef(null);
  const wheelRef = useRef(null);
  const rotationRef = useRef(0);
  const rafRef = useRef(null);
  const lastSliceRef = useRef(-1);
  const isSpinning = spinPhase !== 'idle';

  useEffect(() => {
    if (initialVoiceGender === 'male' || initialVoiceGender === 'female') {
      setVoiceGender(initialVoiceGender);
    }
  }, [initialVoiceGender]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && isLiveMode && !showResetModal) {
        setIsLiveMode(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLiveMode, showResetModal]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopAllAnnouncements();
    };
  }, []);

  const handleExportWinners = async (format) => {
    if (!drawResults.length) return;
    setExportingFormat(format);
    try {
      const { exportWinnersReport } = await import('../utils/exportReports');
      await exportWinnersReport(format, drawResults, {
        campaignName,
        batchLabel: `Kasalukuyang Draw (${drawResults.length} of 6)`
      });
    } catch (exportErr) {
      if (onError) onError(exportErr.message || 'Hindi ma-download ang listahan ng mga nanalo.');
    } finally {
      setExportingFormat('');
    }
  };

  const handleConfirmReset = async (event) => {
    if (event) event.preventDefault();
    setIsResetting(true);
    try {
      const response = await fetch('/api/draw/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminPasscode
        },
        body: JSON.stringify({ note: resetNote })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Hindi ma-reset ang draw.');
      setShowResetModal(false);
      setResetNote('');
      setCurrentWinner(null);
      setShowCelebration(false);
      if (onResetDraw) onResetDraw(data);
    } catch (err) {
      if (onError) onError(err.message || 'Error sa pag-reset ng draw.');
    } finally {
      setIsResetting(false);
    }
  };

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

  // Up to 16 display segments for visual aesthetic
  const baseDisplayItems = eligibleEntries.slice(0, 16);
  const displayItems = winningSliceOverride && baseDisplayItems.length > 0
    ? [winningSliceOverride, ...baseDisplayItems.slice(1)]
    : baseDisplayItems;
  const sliceAngle = displayItems.length > 0 ? 360 / displayItems.length : 360;

  // Toggle sound
  const toggleSound = () => {
    const nextEnabled = !soundEnabled;
    sfx.muted = !nextEnabled;
    if (!nextEnabled) {
      stopAllAnnouncements();
    }
    setSoundEnabled(nextEnabled);
  };

  const syncLiveState = async (payload) => {
    try {
      await fetch('/api/draw/live-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminPasscode
        },
        body: JSON.stringify(payload)
      });
    } catch {
      // Do not interrupt admin draw controls if spectator sync fails
    }
  };

  const handleSyncVoiceGender = async (nextGender) => {
    setVoiceGender(nextGender);
    await syncLiveState({ voiceGender: nextGender });
  };

  const handleTestVoice = async () => {
    if (isTestingVoice) return;
    setIsTestingVoice(true);
    try {
      sfx.muted = !soundEnabled;
      sfx.init();
      await playAnnouncerVoice({
        kind: 'test',
        gender: voiceGender,
        headers: { 'x-admin-passcode': adminPasscode },
        enabled: true
      });
    } finally {
      setIsTestingVoice(false);
    }
  };

  const handleCopyLiveLink = async () => {
    const targetUrl = publicLiveUrl || `${window.location.origin}/live`;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopiedLiveLink(true);
      setTimeout(() => setCopiedLiveLink(false), 2500);
    } catch {
      if (onError) onError(`Live Viewer Link: ${targetUrl}`);
    }
  };

  const applyWheelAngle = (angle, pitch = 1.05) => {
    rotationRef.current = angle;
    if (wheelRef.current) {
      wheelRef.current.style.transform = `rotate(${angle}deg)`;
    }
    if (sliceAngle > 0) {
      const sliceIndex = Math.floor(angle / sliceAngle);
      if (sliceIndex !== lastSliceRef.current) {
        lastSliceRef.current = sliceIndex;
        sfx.playTick(pitch);
      }
    }
  };

  // Phase 1: Admin starts continuous spin (runs until admin clicks Stop)
  const handleStartDraw = () => {
    if (spinPhase !== 'idle') return;
    const remainingDraws = 7 - nextRound;
    if (!nextRound || eligibleEntries.length < remainingDraws) {
      if (onError) {
        onError(`Kailangan ng kahit ${remainingDraws} kwalipikadong entries para ituloy ang 6-winner draw.`);
      }
      return;
    }

    sfx.muted = !soundEnabled;
    sfx.init();
    setWinningSliceOverride(null);
    setShowCelebration(false);
    setCurrentWinner(null);
    setSpinPhase('spinning');

    const wheelTickets = baseDisplayItems.map((item) => item.ticket);
    syncLiveState({
      phase: 'spinning',
      round: nextRound,
      prize: nextRound === 6 ? '25 kg rice' : '5 kg rice',
      wheelTickets,
      eligibleCount: eligibleEntries.length,
      voiceGender
    });

    if (soundEnabled && voiceEnabled) {
      playAnnouncerVoice({
        kind: 'spin',
        round: nextRound,
        gender: voiceGender,
        enabled: true
      });
    }

    let lastTime = performance.now();
    const spinSpeed = 1080; // degrees per second (3 rotations/sec)

    const tickFrame = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      applyWheelAngle(rotationRef.current + spinSpeed * dt, 1.1);
      rafRef.current = requestAnimationFrame(tickFrame);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tickFrame);
  };

  // Optional cancel while still freely spinning (before choosing winner)
  const handleCancelSpin = () => {
    if (spinPhase !== 'spinning') return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setRotation(rotationRef.current);
    setSpinPhase('idle');
    stopAllAnnouncements();
    syncLiveState({
      phase: 'idle',
      round: nextRound,
      prize: nextRound === 6 ? '25 kg rice' : '5 kg rice',
      wheelTickets: baseDisplayItems.map((item) => item.ticket),
      eligibleCount: eligibleEntries.length,
      voiceGender
    });
  };

  // Phase 2: Admin stops the wheel at their discretion & draws the official winner
  const handleStopDraw = async () => {
    if (spinPhase !== 'spinning') return;
    setSpinPhase('stopping');

    try {
      const response = await fetch('/api/draw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminPasscode
        },
        body: JSON.stringify({ voiceGender })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Hindi matapos ang draw.');

      const winningTicket = data.winner.ticket;
      let winningIndex = baseDisplayItems.findIndex((item) => item.ticket === winningTicket);
      if (winningIndex === -1) {
        winningIndex = 0;
        setWinningSliceOverride(data.winner);
      }

      // Stop continuous spin loop and smoothly decelerate onto 12 o'clock pointer (270 deg in SVG)
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const currentSliceAngle = baseDisplayItems.length > 0 ? 360 / baseDisplayItems.length : 360;
      const targetSegmentAngle = winningIndex * currentSliceAngle + currentSliceAngle / 2;
      const desiredMod = ((270 - targetSegmentAngle) % 360 + 360) % 360;
      const startAngle = rotationRef.current;
      const currentMod = ((startAngle % 360) + 360) % 360;
      const alignDelta = (desiredMod - currentMod + 360) % 360;
      const totalDelta = 360 * 4 + alignDelta; // 4 full dramatic slow-down turns
      const finalAngle = startAngle + totalDelta;
      const decelDuration = 4000; // 4 seconds smooth ease-out stop
      const startTime = performance.now();

      const decelerateFrame = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / decelDuration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        const angle = startAngle + totalDelta * eased;
        const pitch = 1.1 - progress * 0.35;
        applyWheelAngle(angle, pitch);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(decelerateFrame);
        } else {
          rafRef.current = null;
          setRotation(finalAngle);
          setSpinPhase('idle');
          setCurrentWinner(data);
          setShowCelebration(true);
          sfx.playFanfare();
          launchConfetti(canvasRef.current);

          if (soundEnabled && voiceEnabled) {
            playAnnouncerVoice({
              kind: 'winner',
              round: data.round,
              ticket: data.winner.ticket,
              gender: voiceGender,
              enabled: true
            });
          }

          if (onDrawComplete) {
            onDrawComplete(data);
          }
        }
      };

      rafRef.current = requestAnimationFrame(decelerateFrame);
    } catch (err) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      setRotation(rotationRef.current);
      setSpinPhase('idle');
      syncLiveState({ phase: 'idle', voiceGender });
      if (onError) onError(err.message || 'May naganap na error sa pag-draw.');
    }
  };

  return (
    <div className={isLiveMode
      ? 'fixed inset-0 z-[75] overflow-y-auto bg-gradient-to-b from-slate-950 via-blue-950 to-slate-900 p-4 sm:p-8 text-white'
      : 'relative overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-slate-950 via-blue-950 to-slate-900 p-6 sm:p-8 text-white shadow-2xl'
    }>
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
              LIVE STL RAFFLE &amp; ROLETTA
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              STL Six-Winner Live Draw
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

          {/* Copy Public Live Spectator Link (/live) */}
          <button
            type="button"
            onClick={handleCopyLiveLink}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
              copiedLiveLink
                ? 'border-emerald-400 bg-emerald-500 text-white'
                : 'border-sky-400/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
            }`}
            title="Kopyahin ang link ng Live Spectator Page para ipaste sa lahat ng GC"
          >
            {copiedLiveLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLiveLink ? 'Nakopya ang Live Link!' : 'Copy Live Link (/live)'}</span>
          </button>

          {/* Live View Presentation Mode Button (Ideal for Messenger GC Screen Share) */}
          <button
            type="button"
            onClick={() => setIsLiveMode(!isLiveMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
              isLiveMode
                ? 'border-red-400/50 bg-red-600/80 text-white hover:bg-red-600'
                : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
            }`}
            title="I-fullscreen para malinis ang pag-Share Screen sa Messenger GC"
          >
            {isLiveMode ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isLiveMode ? 'Exit Live View' : 'Live View (Screen Share)'}</span>
          </button>

          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-bold text-amber-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>{eligibleEntries.length} Kwalipikadong Entries</span>
          </div>
        </div>

        {/* AI Voice Announcer & Live Spectator Control Bar */}
        <div className="w-full mt-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-sky-300">
              <Radio className={`w-3.5 h-3.5 ${isSpinning ? 'text-red-400 animate-pulse' : 'text-sky-400'}`} />
              Live Broadcast Sync:
            </span>
            <a
              href={publicLiveUrl || '/live'}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-sky-400/60 text-sky-200 hover:text-white font-semibold"
            >
              {publicLiveUrl || '/live'}
            </a>
            {voiceInfo?.label ? (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                  voiceInfo.configured
                    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                }`}
              >
                {voiceInfo.label}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setVoiceEnabled((prev) => {
                if (prev) stopAllAnnouncements();
                return !prev;
              })}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-xs font-bold transition ${
                voiceEnabled
                  ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                  : 'border-white/20 bg-white/10 text-slate-400 hover:bg-white/15'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{voiceEnabled ? 'AI Voice: ON' : 'AI Voice: OFF'}</span>
            </button>

            <div className="inline-flex rounded-lg border border-white/15 bg-slate-900/70 p-0.5 text-xs font-bold">
              <button
                type="button"
                disabled={isSpinning}
                onClick={() => handleSyncVoiceGender('male')}
                className={`px-2.5 py-1 rounded-md transition disabled:opacity-50 ${
                  voiceGender === 'male' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                Lalaki
              </button>
              <button
                type="button"
                disabled={isSpinning}
                onClick={() => handleSyncVoiceGender('female')}
                className={`px-2.5 py-1 rounded-md transition disabled:opacity-50 ${
                  voiceGender === 'female' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:text-white'
                }`}
              >
                Babae
              </button>
            </div>

            <button
              type="button"
              disabled={isTestingVoice}
              onClick={handleTestVoice}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-amber-400/40 bg-amber-500/15 text-xs font-bold text-amber-200 hover:bg-amber-500/25 transition disabled:opacity-50"
            >
              {isTestingVoice ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Volume2 className="w-3.5 h-3.5" />}
              <span>{isTestingVoice ? 'Pinapatugtog…' : 'Test Voice'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Current Round Prize Announcement Banner */}
      <div className="my-6 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-400/10 to-red-500/20 p-4 text-center">
        <p className="text-xs font-black uppercase tracking-widest text-amber-300">
          {nextRound ? `Kasalukuyang STL Bunutan: Draw #${nextRound} of 6` : 'Tapos na ang Lahat ng 6 Draws!'}
        </p>
        <div className="mt-1 flex items-center justify-center gap-2">
          <Gift className="h-6 w-6 text-yellow-300 animate-bounce" />
          <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            {nextPrize ? (
              <span className={nextRound === 6 ? 'text-amber-300 underline decoration-red-500 font-extrabold' : ''}>
                {nextPrize.toUpperCase()} {nextRound === 6 ? '★ GRAND FINAL PRIZE ★' : 'STL COMMUNITY PRIZE'}
              </span>
            ) : (
              'Lahat ng 6 Premyo ay Matagumpay nang Nabunot'
            )}
          </h3>
        </div>
      </div>

      {/* MAIN STL ROLETTA ARENA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-4">

        {/* LEFT / CENTER: THE ROULETTE WHEEL */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center relative">
          <RouletteWheelCanvas
            wheelRef={wheelRef}
            rotationAngle={isSpinning ? rotationRef.current : rotation}
            tickets={displayItems.map((item) => item.ticket)}
            ticketFormat={ticketFormat}
          />

          {/* Admin Spin & Stop Action Controls */}
          <div className="mt-8 flex flex-col items-center gap-2.5">
            {spinPhase === 'spinning' ? (
              <>
                <button
                  type="button"
                  onClick={handleStopDraw}
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider bg-gradient-to-r from-red-600 via-rose-600 to-amber-500 hover:brightness-110 text-white shadow-[0_0_35px_rgba(239,68,68,0.75)] transition transform hover:scale-105 active:scale-95 animate-pulse"
                >
                  <Square className="w-5 h-5 fill-white" />
                  <span>Ihinto ang Roletta! (Stop &amp; Bunot)</span>
                </button>
                <button
                  type="button"
                  onClick={handleCancelSpin}
                  className="text-xs font-semibold text-slate-300 hover:text-white underline transition"
                >
                  Kanselahin ang pag-ikot
                </button>
              </>
            ) : spinPhase === 'stopping' ? (
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider bg-amber-600 text-white cursor-not-allowed shadow-2xl animate-pulse"
              >
                <RotateCcw className="w-6 h-6 animate-spin text-white" />
                <span>Pinipigilan… Humanda na!</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartDraw}
                disabled={!nextRound || eligibleEntries.length === 0}
                className={`inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-base sm:text-lg font-black uppercase tracking-wider shadow-2xl transition transform active:scale-95 ${
                  nextRound && eligibleEntries.length > 0
                    ? 'bg-gradient-to-r from-red-600 via-amber-500 to-yellow-400 hover:brightness-110 text-slate-950 hover:scale-105 shadow-[0_0_30px_rgba(245,158,11,0.6)]'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                }`}
              >
                {nextRound ? (
                  <>
                    <Sparkles className="w-6 h-6 text-red-950" />
                    <span>Paikutin ang Roletta (Draw #{nextRound})</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-6 h-6" />
                    <span>Lahat ng Draw ay Kumpleto Na</span>
                  </>
                )}
              </button>
            )}
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
                    <p className="font-bold text-white">
                      {isLiveMode && currentWinner.winner.contact?.length >= 5
                        ? `${currentWinner.winner.contact.slice(0, 2)}••••••${currentWinner.winner.contact.slice(-3)}`
                        : currentWinner.winner.contact}
                    </p>
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

          {/* DOWNLOAD WINNERS AS PDF / WORD / CSV WHENEVER AT LEAST 1 WINNER EXISTS */}
          {drawResults.length > 0 && (
            <div className="rounded-2xl border border-white/15 bg-slate-900/90 p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                  I-download ang Listahan ng Nanalo
                </p>
                <span className="text-[11px] text-slate-400 font-semibold">
                  {drawResults.length}/6 Nabunot
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { format: 'pdf', label: 'PDF (.pdf)', style: 'bg-rose-600 hover:bg-rose-700 text-white' },
                  { format: 'docx', label: 'Word (.docx)', style: 'bg-blue-600 hover:bg-blue-700 text-white' },
                  { format: 'csv', label: 'Excel (.csv)', style: 'bg-white/10 hover:bg-white/20 border border-white/20 text-white' }
                ].map((btn) => (
                  <button
                    key={btn.format}
                    type="button"
                    disabled={Boolean(exportingFormat)}
                    onClick={() => handleExportWinners(btn.format)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold shadow-sm transition disabled:opacity-50 ${btn.style}`}
                  >
                    {exportingFormat === btn.format ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : btn.format === 'csv' ? (
                      <Download className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{btn.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CELEBRATION / ACTIONS WHEN ALL DRAWS ARE COMPLETED */}
          {drawResults.length === 6 && (
            <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-950/90 via-slate-900 to-slate-900 p-4 text-white shadow-xl space-y-3 animate-fadeIn">
              <div className="flex items-center gap-2 text-amber-300 font-extrabold text-sm">
                <Trophy className="w-5 h-5 text-yellow-400 shrink-0" />
                <span>Kumpleto na ang Lahat ng 6 Rounds ng Draw!</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Naipamahagi na ang limang 5kg at isang 25kg bigas. I-archive sa kasaysayan at i-reset ang draw para sa susunod na session.
              </p>
              <button
                type="button"
                onClick={() => {
                  setResetNote(`Draw Batch - ${new Date().toLocaleDateString('en-PH')}`);
                  setShowResetModal(true);
                }}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3.5 py-2.5 text-xs font-black text-slate-950 shadow-md transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>I-save sa History at I-reset ang Draw</span>
              </button>
            </div>
          )}

          {/* OPTIONAL EARLY RESET BUTTON (IF DRAW IS IN PROGRESS BUT NEEDS TO RESTART) */}
          {drawResults.length > 0 && drawResults.length < 6 && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => {
                  setResetNote(`Partial Reset - ${new Date().toLocaleDateString('en-PH')}`);
                  setShowResetModal(true);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-amber-300 underline transition"
              >
                <RotateCcw className="w-3 h-3" />
                <span>I-reset ang kasalukuyang draw</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* CONFIRMATION MODAL FOR RESET & ARCHIVE */}
      {showResetModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4 text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-blue-950 font-black text-base">
                <RotateCcw className="w-5 h-5 text-amber-500" />
                <span>I-archive at I-reset ang Draw</span>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <p>
                Ang kasalukuyang <strong>{drawResults.length} nanalo</strong> ay awtomatikong mase-save sa <strong>Draw History Archive</strong> upang magkaroon kayo ng permanenteng talaan ng mga nanalo bago ito i-reset.
              </p>
              <p>
                Pagkatapos i-reset, babalik sa <strong>Round 1 (5 kg rice)</strong> ang roulette at magagamit muli para sa susunod na batch ng draw.
              </p>
            </div>

            <form onSubmit={handleConfirmReset} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Pangalan o Note para sa Batch na ito (Opsyonal):
                </label>
                <input
                  value={resetNote}
                  onChange={(e) => setResetNote(e.target.value)}
                  placeholder={`Draw Batch - ${new Date().toLocaleDateString('en-PH')}`}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  disabled={isResetting}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Kanselahin
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-4 py-2 text-xs font-black text-slate-950 shadow transition disabled:opacity-50"
                >
                  {isResetting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sine-save at ini-reset…</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Kumpirmahin ang Pag-Reset</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
