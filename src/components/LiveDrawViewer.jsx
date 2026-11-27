import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Flame,
  Gift,
  Radio,
  Sparkles,
  Ticket,
  Trophy,
  Users,
  Volume2,
  VolumeX
} from 'lucide-react';
import RouletteWheelCanvas from './RouletteWheelCanvas';
import {
  launchConfetti,
  playAnnouncerVoice,
  preloadBrowserVoices,
  sfx,
  stopAllAnnouncements,
  tryUnlockAudio
} from '../utils/raffleAudio';

function getOrCreateViewerId() {
  try {
    let id = sessionStorage.getItem('stl_live_viewer_id');
    if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().replace(/-/g, '')
        : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('stl_live_viewer_id', id);
    }
    return id;
  } catch {
    return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Public read-only Live Spectator page for agents watching across GCs (/live or ?live=1).
 */
export default function LiveDrawViewer({ pageSettings }) {
  const [liveData, setLiveData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [ticketFormat, setTicketFormat] = useState('last6');
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [spinPhase, setSpinPhase] = useState('idle'); // 'idle' | 'spinning' | 'stopping'
  const [rotation, setRotation] = useState(0);
  const [currentWinner, setCurrentWinner] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [winningSliceOverride, setWinningSliceOverride] = useState('');
  const [viewerStats, setViewerStats] = useState({ activeViewers: 1, totalViewers: 1, viewerEpoch: 'default' });

  const canvasRef = useRef(null);
  const wheelRef = useRef(null);
  const rotationRef = useRef(0);
  const rafRef = useRef(null);
  const lastSliceRef = useRef(-1);
  const knownWinnerCountRef = useRef(null);
  const spinPhaseRef = useRef('idle');
  const announcedSpinSeqRef = useRef(0);
  const audioConfigRef = useRef({ enabled: true, unlocked: false });
  const viewerIdRef = useRef(getOrCreateViewerId());
  const registeredEpochRef = useRef('');

  useEffect(() => {
    audioConfigRef.current = { enabled: soundEnabled, unlocked: audioUnlocked };
    sfx.muted = !soundEnabled;
  }, [soundEnabled, audioUnlocked]);

  useEffect(() => {
    preloadBrowserVoices();
    tryUnlockAudio().then((allowed) => {
      if (allowed) {
        setAudioUnlocked(true);
      }
    });
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopAllAnnouncements();
    };
  }, []);

  const unlockAudio = useCallback((silent = false) => {
    sfx.muted = false;
    sfx.init();
    if (sfx.ctx && sfx.ctx.state === 'suspended') {
      sfx.ctx.resume().catch(() => {});
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const primer = new SpeechSynthesisUtterance('');
        primer.volume = 0;
        window.speechSynthesis.speak(primer);
      } catch {
        // Ignore primer errors
      }
    }
    setSoundEnabled(true);
    setAudioUnlocked(true);
    if (!silent) {
      sfx.playTick(1.1);
    }
  }, []);

  // Auto-unlock audio on the very first tap/touch/click anywhere on the screen
  useEffect(() => {
    if (audioUnlocked || !soundEnabled) return undefined;
    const handleFirstGesture = () => {
      unlockAudio(true);
    };
    window.addEventListener('pointerdown', handleFirstGesture, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', handleFirstGesture, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture, { capture: true });
      window.removeEventListener('keydown', handleFirstGesture, { capture: true });
    };
  }, [audioUnlocked, soundEnabled, unlockAudio]);

  // Live viewer heartbeat so Admin & viewers see how many agents are watching
  useEffect(() => {
    let active = true;
    const viewerId = viewerIdRef.current;

    const sendHeartbeat = async (leave = false) => {
      try {
        if (leave) {
          const payload = JSON.stringify({ viewerId, leave: true });
          if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            const sent = navigator.sendBeacon(
              '/api/draw/live-ping',
              new Blob([payload], { type: 'application/json' })
            );
            if (sent) return;
          }
          await fetch('/api/draw/live-ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true
          });
          return;
        }

        const currentEpoch = liveData?.liveState?.viewerEpoch || viewerStats.viewerEpoch || 'default';
        const firstJoin = registeredEpochRef.current !== currentEpoch;
        const response = await fetch('/api/draw/live-ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewerId, firstJoin })
        });
        if (!response.ok || !active) return;
        const data = await response.json();
        if (active && data?.success) {
          registeredEpochRef.current = data.viewerEpoch || currentEpoch;
          setViewerStats({
            activeViewers: data.activeViewers ?? 1,
            totalViewers: data.totalViewers ?? 1,
            viewerEpoch: data.viewerEpoch || currentEpoch
          });
        }
      } catch {
        // Ignore transient ping errors
      }
    };

    sendHeartbeat(false);
    const interval = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        sendHeartbeat(false);
      }
    }, 18000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat(false);
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [liveData?.liveState?.viewerEpoch]);

  // Send leave signal only when actually closing/unmounting the Live Viewer page
  useEffect(() => {
    const sendLeave = () => {
      const payload = JSON.stringify({ viewerId: viewerIdRef.current, leave: true });
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
          if (navigator.sendBeacon('/api/draw/live-ping', new Blob([payload], { type: 'application/json' }))) {
            return;
          }
        }
        fetch('/api/draw/live-ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }
    };
    window.addEventListener('pagehide', sendLeave);
    return () => {
      window.removeEventListener('pagehide', sendLeave);
      sendLeave();
    };
  }, []);

  const results = liveData?.results || [];
  const liveState = liveData?.liveState || {};
  const rawTickets = liveState.wheelTickets || [];
  const displayTickets = winningSliceOverride && rawTickets.length > 0
    ? [winningSliceOverride, ...rawTickets.slice(1)]
    : (rawTickets.length > 0 ? rawTickets : results.map((r) => r.winner?.ticket).filter(Boolean));
  const sliceAngle = displayTickets.length > 0 ? 360 / displayTickets.length : 360;

  const applyWheelAngle = (angle, pitch = 1.05, ticketsCount = displayTickets.length) => {
    rotationRef.current = angle;
    if (wheelRef.current) {
      wheelRef.current.style.transform = `rotate(${angle}deg)`;
    }
    const curSliceAngle = ticketsCount > 0 ? 360 / ticketsCount : 360;
    const sliceIndex = Math.floor(angle / curSliceAngle);
    if (sliceIndex !== lastSliceRef.current) {
      lastSliceRef.current = sliceIndex;
      if (audioConfigRef.current.enabled) {
        sfx.playTick(pitch);
        if (sfx.ctx?.state === 'running' && !audioConfigRef.current.unlocked) {
          setAudioUnlocked(true);
        }
      }
    }
  };

  const startSpectatorSpin = (ticketsCount, stateSnapshot) => {
    if (spinPhaseRef.current === 'spinning') return;
    spinPhaseRef.current = 'spinning';
    setSpinPhase('spinning');
    setWinningSliceOverride('');
    setShowCelebration(false);
    setCurrentWinner(null);

    let lastTime = performance.now();
    const spinSpeed = 1080;

    const frameLoop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      applyWheelAngle(rotationRef.current + spinSpeed * dt, 1.1, ticketsCount);
      rafRef.current = requestAnimationFrame(frameLoop);
    };

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(frameLoop);

    if (stateSnapshot.seq !== announcedSpinSeqRef.current && audioConfigRef.current.enabled) {
      announcedSpinSeqRef.current = stateSnapshot.seq;
      playAnnouncerVoice({
        kind: 'spin',
        round: stateSnapshot.round,
        gender: stateSnapshot.voiceGender || 'male',
        enabled: true
      }).then((res) => {
        if (res?.played) setAudioUnlocked(true);
      });
    }
  };

  const stopSpectatorOnWinner = (latestResult, ticketList, voiceGender) => {
    spinPhaseRef.current = 'stopping';
    setSpinPhase('stopping');

    let winningIndex = ticketList.indexOf(latestResult.winner?.ticket);
    if (winningIndex === -1 && ticketList.length > 0) {
      winningIndex = 0;
      setWinningSliceOverride(latestResult.winner?.ticket || '');
    } else if (ticketList.length === 0) {
      winningIndex = 0;
      setWinningSliceOverride(latestResult.winner?.ticket || '');
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const effectiveLen = Math.max(ticketList.length, 1);
    const curSliceAngle = 360 / effectiveLen;
    const targetSegmentAngle = winningIndex * curSliceAngle + curSliceAngle / 2;
    const desiredMod = ((270 - targetSegmentAngle) % 360 + 360) % 360;
    const startAngle = rotationRef.current;
    const currentMod = ((startAngle % 360) + 360) % 360;
    const alignDelta = (desiredMod - currentMod + 360) % 360;
    const totalDelta = 360 * 3 + alignDelta;
    const finalAngle = startAngle + totalDelta;
    const decelDuration = 3500;
    const startTime = performance.now();

    const decelerate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / decelDuration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      applyWheelAngle(startAngle + totalDelta * eased, 1.1 - progress * 0.35, effectiveLen);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(decelerate);
      } else {
        rafRef.current = null;
        spinPhaseRef.current = 'idle';
        setSpinPhase('idle');
        setRotation(finalAngle);
        setCurrentWinner(latestResult);
        setShowCelebration(true);
        if (audioConfigRef.current.enabled) {
          sfx.playFanfare();
          playAnnouncerVoice({
            kind: 'winner',
            round: latestResult.round,
            ticket: latestResult.winner?.ticket,
            gender: voiceGender || 'male',
            enabled: true
          }).then((res) => {
            if (res?.played) setAudioUnlocked(true);
          });
        }
        launchConfetti(canvasRef.current);
      }
    };

    rafRef.current = requestAnimationFrame(decelerate);
  };

  useEffect(() => {
    let active = true;

    const pollLive = async () => {
      try {
        const response = await fetch('/api/draw/live', { cache: 'no-store' });
        const data = await response.json();
        if (!active || !response.ok) return;

        setLoadError('');
        setLiveData(data);
        if (data.viewerStats) {
          setViewerStats(data.viewerStats);
        }

        const nextResults = data.results || [];
        const nextLive = data.liveState || {};
        const ticketsPool = Array.isArray(nextLive.wheelTickets) && nextLive.wheelTickets.length > 0
          ? nextLive.wheelTickets
          : nextResults.map((r) => r.winner?.ticket).filter(Boolean);

        // Initial load: do not replay old winner animations
        if (knownWinnerCountRef.current === null) {
          knownWinnerCountRef.current = nextResults.length;
          if (nextResults.length > 0) {
            setCurrentWinner(nextResults[nextResults.length - 1]);
          }
          if (nextLive.phase === 'spinning') {
            startSpectatorSpin(ticketsPool.length, nextLive);
          }
          return;
        }

        // Draw was reset
        if (nextResults.length < knownWinnerCountRef.current) {
          knownWinnerCountRef.current = nextResults.length;
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          spinPhaseRef.current = 'idle';
          setSpinPhase('idle');
          setCurrentWinner(null);
          setShowCelebration(false);
          setWinningSliceOverride('');
          stopAllAnnouncements();
          return;
        }

        // New winner drawn -> trigger synced slowdown + reveal + AI Voice
        if (nextResults.length > knownWinnerCountRef.current) {
          knownWinnerCountRef.current = nextResults.length;
          const latestWinner = nextResults[nextResults.length - 1];
          stopSpectatorOnWinner(latestWinner, ticketsPool, nextLive.voiceGender);
          return;
        }

        // Phase transitions (idle <-> spinning) without a new winner yet
        if (nextLive.phase === 'spinning' && spinPhaseRef.current === 'idle') {
          startSpectatorSpin(ticketsPool.length, nextLive);
        } else if (nextLive.phase === 'idle' && spinPhaseRef.current === 'spinning') {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          spinPhaseRef.current = 'idle';
          setSpinPhase('idle');
          setRotation(rotationRef.current);
          stopAllAnnouncements();
        }
      } catch {
        if (active) setLoadError('Sinusubukang kumonekta muli sa live draw…');
      }
    };

    pollLive();
    const timer = setInterval(pollLive, 1200);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const campaignTitle = liveData?.campaignName || pageSettings?.campaignName || 'STL Community Rice Raffle';
  const nextRound = liveState.nextRound;
  const nextPrize = liveState.nextPrize;

  return (
    <div className="min-h-screen bg-slate-950 text-white py-5 px-3 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Audio Unlock Prompt for Mobile / Messenger Browser */}
        {!audioUnlocked ? (
          <div
            onClick={() => unlockAudio(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') unlockAudio(false); }}
            className="cursor-pointer rounded-2xl border-2 border-amber-400 bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-red-500/20 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg hover:brightness-110 transition"
          >
            <div className="flex items-center gap-3 text-center sm:text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-slate-950 font-black animate-bounce">
                <Volume2 className="w-5 h-5" />
              </span>
              <div>
                <p className="text-sm font-black text-amber-300">
                  I-tap kahit saan sa screen upang marinig ang Live AI Voice &amp; Roletta!
                </p>
                <p className="text-xs text-slate-300">
                  Naka-mute ng browser ang tunog pagkabukas ng link—isang tap lang sa screen ay aandar na ito agad.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                unlockAudio(false);
              }}
              className="shrink-0 rounded-xl bg-amber-400 hover:bg-amber-300 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-md transition transform active:scale-95"
            >
              I-on Agad 🔊
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 px-4 py-2 text-xs">
            <span className="flex items-center gap-2 font-bold text-emerald-300">
              <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
              Live AI Voice &amp; Audio: {soundEnabled ? 'AKTIBO' : 'Naka-Mute'}
            </span>
            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1 font-bold text-white hover:bg-white/20 transition"
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
              <span>{soundEnabled ? 'I-mute' : 'I-unmute'}</span>
            </button>
          </div>
        )}

        {loadError && (
          <p role="status" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 text-center">
            {loadError}
          </p>
        )}

        {/* Main Spectator Arena */}
        <div className="relative overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-b from-slate-950 via-blue-950 to-slate-900 p-5 sm:p-8 shadow-2xl">
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 z-30 h-full w-full"
          />

          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-300 text-blue-950 font-black shadow-lg">
                <Trophy className="h-6 w-6" />
              </span>
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  {campaignTitle} • LIVE SPECTATOR VIEW
                </span>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  STL Six-Winner Live Draw
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-red-600 text-white font-extrabold uppercase animate-pulse">
                    <Flame className="w-3.5 h-3.5" /> LIVE
                  </span>
                </h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 flex items-center gap-1.5"
                title={`Kabuuang nanood sa draw na ito: ${viewerStats.totalViewers}`}
              >
                <Eye className="w-3.5 h-3.5 text-emerald-300" />
                <span>{viewerStats.activeViewers} Nanonood Live</span>
              </div>
              <button
                type="button"
                onClick={() => setTicketFormat(ticketFormat === 'last6' ? 'full' : 'last6')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-400/30 bg-amber-500/10 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
              >
                <Ticket className="w-3.5 h-3.5 text-amber-400" />
                <span>{ticketFormat === 'last6' ? 'Display: Huling 6 Digits' : 'Display: Buong Ticket'}</span>
              </button>
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                <span>{liveState.eligibleCount || displayTickets.length} Entries sa Roletta</span>
              </div>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Raffle Page</span>
              </a>
            </div>
          </div>

          {/* Round Banner */}
          <div className="my-5 rounded-2xl border border-amber-400/40 bg-gradient-to-r from-amber-500/20 via-yellow-400/10 to-red-500/20 p-4 text-center">
            <p className="text-xs font-black uppercase tracking-widest text-amber-300">
              {spinPhase === 'spinning'
                ? `🔥 Umiikot na ang STL Roletta — Draw #${liveState.round || nextRound || 1} of 6!`
                : spinPhase === 'stopping'
                  ? '⏳ Humihinto na ang Roletta… Abangan ang nanalo!'
                  : nextRound
                    ? `Susunod na Bunutan: Draw #${nextRound} of 6`
                    : 'Tapos na ang Lahat ng 6 Draws!'}
            </p>
            <div className="mt-1 flex items-center justify-center gap-2">
              <Gift className="h-6 w-6 text-yellow-300 animate-bounce" />
              <h2 className="text-xl sm:text-3xl font-black tracking-tight text-white">
                {nextPrize ? (
                  <span className={nextRound === 6 ? 'text-amber-300 underline decoration-red-500 font-extrabold' : ''}>
                    {nextPrize.toUpperCase()} {nextRound === 6 ? '★ GRAND FINAL PRIZE ★' : 'STL COMMUNITY PRIZE'}
                  </span>
                ) : (
                  'Lahat ng 6 Premyo ay Matagumpay nang Nabunot'
                )}
              </h2>
            </div>
          </div>

          {/* Arena Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-2">
            <div className="lg:col-span-7 flex flex-col items-center justify-center">
              <RouletteWheelCanvas
                wheelRef={wheelRef}
                rotationAngle={spinPhase !== 'idle' ? rotationRef.current : rotation}
                tickets={displayTickets}
                ticketFormat={ticketFormat}
              />

              <div className="mt-6 text-center">
                {spinPhase === 'spinning' ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-600/30 px-5 py-2 text-sm font-black uppercase tracking-wider text-white animate-pulse">
                    <Sparkles className="w-4 h-4 text-yellow-300" />
                    Umiikot ang Roletta… Hinihintay ang paghinto ng Admin!
                  </span>
                ) : spinPhase === 'stopping' ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-amber-500/20 px-5 py-2 text-sm font-black uppercase tracking-wider text-amber-200 animate-pulse">
                    Humihinto na… Good luck sa lahat!
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300">
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    Naka-sync nang live sa Admin — awtomatikong gagalaw ang roletta pagpindot ng Admin.
                  </span>
                )}
              </div>
            </div>

            {/* Right: Winner Spotlight & Winners List (Privacy-safe, no phone numbers) */}
            <div className="lg:col-span-5 space-y-4">
              {currentWinner && (
                <div className={`rounded-2xl border-2 border-yellow-400 bg-gradient-to-br from-yellow-500/30 via-red-500/20 to-slate-900 p-5 shadow-2xl ${showCelebration ? 'animate-fadeIn' : ''}`}>
                  <div className="flex items-center justify-between border-b border-yellow-400/30 pb-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-400 text-blue-950 font-black text-xs uppercase tracking-wider">
                      <Trophy className="w-4 h-4 text-blue-950" />
                      Nanalo sa Draw #{currentWinner.round}!
                    </span>
                    <span className="text-xs font-black text-amber-300">{currentWinner.prize}</span>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Winning Ticket Code:</p>
                      <p className="font-mono text-2xl font-black text-yellow-300 tracking-wider">
                        {currentWinner.winner?.ticket}
                      </p>
                      <p className="text-xs text-amber-300 font-bold mt-1 flex items-center gap-1.5">
                        Huling 6 Digits:
                        <span className="font-mono bg-yellow-400/20 text-yellow-200 px-2 py-0.5 rounded font-black border border-yellow-400/30">
                          {currentWinner.winner?.ticket?.slice(-6)}
                        </span>
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10 text-xs">
                      <div className="col-span-2">
                        <p className="text-slate-400">Pangalan:</p>
                        <p className="font-bold text-white text-base">{currentWinner.winner?.agent}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Agent Username:</p>
                        <p className="font-mono font-bold text-amber-300">{currentWinner.winner?.agentUsername || '—'}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Supervisor:</p>
                        <p className="font-bold text-white">{currentWinner.winner?.supervisorName || '—'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 backdrop-blur-md">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center justify-between">
                  <span>Opisyal na Talaan ng 6 Winners</span>
                  <span className="text-amber-400 font-bold">{results.length}/6 Nabunot</span>
                </h3>

                <div className="mt-3 space-y-2">
                  {[1, 2, 3, 4, 5, 6].map((roundNum) => {
                    const result = results.find((r) => r.round === roundNum);
                    const isCurrent = nextRound === roundNum;
                    const isFinal = roundNum === 6;

                    return (
                      <div
                        key={roundNum}
                        className={`flex items-center justify-between p-3 rounded-xl border text-xs transition ${
                          result
                            ? 'border-emerald-500/50 bg-emerald-950/30 text-white'
                            : isCurrent
                              ? 'border-yellow-400 bg-yellow-500/10 text-yellow-200 font-bold'
                              : 'border-white/5 bg-white/5 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-[11px] ${
                            result ? 'bg-emerald-500 text-slate-950' : isCurrent ? 'bg-yellow-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {roundNum}
                          </span>
                          <div>
                            <p className="font-bold text-white">
                              Draw #{roundNum} — {isFinal ? '25 kg Bigas (Grand Final)' : '5 kg Bigas'}
                            </p>
                            {result && (
                              <p className="text-[11px] text-emerald-300 font-medium">
                                {result.winner?.agent} — <span className="font-mono font-bold text-white">{result.winner?.ticket}</span> (Huling 6: <strong className="font-mono text-yellow-300">{result.winner?.ticket?.slice(-6)}</strong>)
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
                              Susunod
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
      </div>
    </div>
  );
}
