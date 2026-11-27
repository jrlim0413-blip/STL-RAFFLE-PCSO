import React, { useEffect, useState } from 'react';
import { Award, Check, CheckCircle2, Clock, Copy, Download, ExternalLink, FileText, Loader2, Pencil, QrCode, RotateCcw, Search, Settings, Share2, Sparkles, Trash2, Trophy, Users } from 'lucide-react';
import { readApiResponse } from '../utils/apiResponse';
import { fromManilaDateTimeInput, toManilaDateTimeInput } from '../utils/entrySchedule';
import ShareModal from './ShareModal';
import RaffleRoulette from './RaffleRoulette';

function formatProofLabel(pageKey) {
  if (!pageKey) return 'Proof';
  if (pageKey === 'melquiades') return 'Mel Robles';
  if (pageKey === 'pcso') return 'PCSO';
  if (pageKey === 'situation-report') return 'SitRep';
  if (pageKey.startsWith('task_')) {
    const clean = pageKey.replace('_', ' ').replace('engagement', '').trim();
    return clean.toUpperCase();
  }
  return pageKey.replace('engagement', '').trim();
}

function settingsDraft(source) {
  return {
    ...source,
    entryStartAt: toManilaDateTimeInput(source.entryStartAt),
    entryEndAt: toManilaDateTimeInput(source.entryEndAt)
  };
}

export default function AdminDashboard({
  entries = [],
  stats = {},
  pageSettings,
  adminPasscode,
  onUpdateSettings,
  onSettingsChange,
  onRefresh
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [spinTicket, setSpinTicket] = useState('RAFFLE-????');
  const [drawResults, setDrawResults] = useState([]);
  const [nextRound, setNextRound] = useState(1);
  const [nextPrize, setNextPrize] = useState('5 kg rice');
  const [settings, setSettings] = useState(() => settingsDraft(pageSettings));
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeProof, setActiveProof] = useState(null);
  const [taskPostUrl, setTaskPostUrl] = useState('');
  const [taskInstruction, setTaskInstruction] = useState('');
  const [suggestedComment, setSuggestedComment] = useState('');
  const [taskLink, setTaskLink] = useState('');
  const [copiedTaskId, setCopiedTaskId] = useState('');
  const [copiedTaskMsgId, setCopiedTaskMsgId] = useState('');
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedShareMessage, setCopiedShareMessage] = useState(false);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editPostUrl, setEditPostUrl] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [editSuggestedComment, setEditSuggestedComment] = useState('');
  const [isUpdatingTask, setIsUpdatingTask] = useState(false);
  const [exportingKey, setExportingKey] = useState('');

  useEffect(() => setSettings(settingsDraft(pageSettings)), [pageSettings]);
  useEffect(() => {
    let active = true;
    fetch('/api/draw', { headers: { 'x-admin-passcode': adminPasscode } })
      .then(async (response) => {
        const data = await readApiResponse(response, 'Could not load draw results.');
        if (!active) return;
        setDrawResults(data.results || []);
        setNextRound(data.nextRound);
        setNextPrize(data.nextPrize);
        if (data.results?.length) {
          setWinner(data.results[data.results.length - 1]);
          setSpinTicket(data.results[data.results.length - 1].winner.ticket);
        }
      })
      .catch((drawError) => {
        if (active) setError(drawError.message || 'Could not load draw results.');
      });
    return () => { active = false; };
  }, [adminPasscode]);
  useEffect(() => () => {
    if (activeProof?.url) URL.revokeObjectURL(activeProof.url);
  }, [activeProof]);

  const filteredEntries = entries.filter((entry) =>
    [entry.agentUsername, entry.supervisorName, entry.agent, entry.contact, entry.ticket]
      .join(' ')
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  const updateSetting = (event) => {
    const { name, value } = event.target;
    setSettings((previous) => ({ ...previous, [name]: value }));
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setError('');
    const updatedSettings = { ...settings };
    for (const field of ['entryStartAt', 'entryEndAt']) {
      updatedSettings[field] = fromManilaDateTimeInput(settings[field]);
      if (settings[field] && !updatedSettings[field]) {
        setError('Please enter valid opening and closing dates in Philippines time.');
        return;
      }
    }
    try {
      await onUpdateSettings(updatedSettings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (saveError) {
      setError(saveError.message || 'Could not save campaign settings.');
    }
  };

  const createEngagementTask = async (event) => {
    event.preventDefault();
    setError('');
    setIsCreatingTask(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminPasscode
        },
        body: JSON.stringify({
          postUrl: taskPostUrl,
          instruction: taskInstruction,
          suggestedComment
        })
      });
      const data = await readApiResponse(response, 'Could not create engagement task.');
      setSettings(settingsDraft(data.settings));
      onSettingsChange(data.settings);
      setTaskLink(`${getPublicBaseUrl()}/?task=${encodeURIComponent(data.task.id)}`);
      setTaskPostUrl('');
      setTaskInstruction('');
      setSuggestedComment('');
    } catch (taskError) {
      setError(taskError.message || 'Could not create engagement task.');
    } finally {
      setIsCreatingTask(false);
    }
  };

  const startEditTask = (task) => {
    setEditingTaskId(task.id);
    setEditPostUrl(task.postUrl || '');
    setEditInstruction(task.instruction || '');
    setEditSuggestedComment(task.suggestedComment || '');
    setError('');
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setEditPostUrl('');
    setEditInstruction('');
    setEditSuggestedComment('');
  };

  const saveEditedTask = async (event) => {
    event.preventDefault();
    if (!editingTaskId) return;
    setIsUpdatingTask(true);
    setError('');
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(editingTaskId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-passcode': adminPasscode
        },
        body: JSON.stringify({
          postUrl: editPostUrl,
          instruction: editInstruction,
          suggestedComment: editSuggestedComment
        })
      });
      const data = await readApiResponse(response, 'Could not update engagement task.');
      setSettings(settingsDraft(data.settings));
      onSettingsChange(data.settings);
      cancelEditTask();
    } catch (updateError) {
      setError(updateError.message || 'Could not update engagement task.');
    } finally {
      setIsUpdatingTask(false);
    }
  };

  const deleteTask = async (taskId) => {
    if (!window.confirm(`Sigurado ka bang nais mong tanggalin ang task na "${taskId}"?`)) return;
    setError('');
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: 'DELETE',
        headers: {
          'x-admin-passcode': adminPasscode
        }
      });
      const data = await readApiResponse(response, 'Could not delete engagement task.');
      setSettings(settingsDraft(data.settings));
      onSettingsChange(data.settings);
      if (editingTaskId === taskId) cancelEditTask();
    } catch (deleteError) {
      setError(deleteError.message || 'Could not delete engagement task.');
    }
  };

  const handleDrawReset = (resetData) => {
    setWinner(null);
    setDrawResults([]);
    setNextRound(1);
    setNextPrize('5 kg rice');
    if (resetData?.archived) {
      fetch('/api/settings', { headers: { 'x-admin-passcode': adminPasscode } })
        .then((res) => res.json())
        .then((data) => {
          if (data?.settings) {
            setSettings(settingsDraft(data.settings));
            onSettingsChange(data.settings);
          }
        })
        .catch(() => {});
    }
    onRefresh();
  };

  const getPublicBaseUrl = () => {
    if (typeof window !== 'undefined') {
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'https://stl-raffle-campaign.vercel.app';
      }
      return window.location.origin;
    }
    return 'https://stl-raffle-campaign.vercel.app';
  };

  const copyToClipboard = async (text, setSuccess) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      if (typeof setSuccess === 'function') {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const officialShareUrl = `${getPublicBaseUrl()}/?ref=share`;
  const officialShareMessage = `🌾 STL COMMUNITY RICE RAFFLE 🌾\n6 Maswerteng Mananalo ng Bigas (5kg & 25kg)!\nSumali sa raffle at makuha ang iyong ticket dito:\n👉 ${officialShareUrl}`;

  const copyTaskLink = async (taskId) => {
    setError('');
    try {
      const link = `${getPublicBaseUrl()}/?task=${encodeURIComponent(taskId)}`;
      await copyToClipboard(link, () => {
        setCopiedTaskId(taskId);
        setTimeout(() => setCopiedTaskId(''), 2000);
      });
    } catch (copyError) {
      setError(copyError.message || 'Could not copy the engagement task link.');
    }
  };

  const copyTaskMessage = async (task) => {
    setError('');
    try {
      const link = `${getPublicBaseUrl()}/?task=${encodeURIComponent(task.id)}`;
      const msg = `🎯 BAGONG ENGAGEMENT TASK!\n\n📌 Paano gawin:\n1. I-click ang link: ${link}\n2. I-input ang iyong Ticket Number bago mag-engage.\n3. Sundin ang tagubilin at i-upload ang screenshot proof para sa karagdagang tsansa sa raffle!${task.instruction ? `\n\n📝 Paalala: ${task.instruction}` : ''}`;
      await copyToClipboard(msg, () => {
        setCopiedTaskMsgId(task.id);
        setTimeout(() => setCopiedTaskMsgId(''), 2500);
      });
    } catch (copyError) {
      setError(copyError.message || 'Could not copy the task message.');
    }
  };

  const toggleStatus = async (ticket) => {
    setError('');
    try {
      const response = await fetch(`/api/entries/${encodeURIComponent(ticket)}/toggle`, {
        method: 'POST',
        headers: { 'x-admin-passcode': adminPasscode }
      });
      await readApiResponse(response, 'Could not update entry status.');
      onRefresh();
    } catch (toggleError) {
      setError(toggleError.message || 'Could not update entry status.');
    }
  };

  const runRaffleDraw = () => {
    const previousWinners = new Set(drawResults.map((result) => result.winner.ticket));
    const eligible = entries.filter((entry) => entry.status === 'Eligible' && !previousWinners.has(entry.ticket));
    const remainingDraws = 7 - nextRound;
    if (!nextRound || eligible.length < remainingDraws) {
      setError(`At least ${remainingDraws} unique eligible entries are needed to continue the six-winner draw.`);
      return;
    }

    setError('');
    setWinner(null);
    setIsSpinning(true);
    let count = 0;
    const interval = setInterval(async () => {
      setSpinTicket(eligible[Math.floor(Math.random() * eligible.length)].ticket);
      count += 1;
      if (count < 20) return;

      clearInterval(interval);
      try {
        const response = await fetch('/api/draw', {
          method: 'POST',
          headers: { 'x-admin-passcode': adminPasscode }
        });
        const data = await readApiResponse(response, 'Could not draw a winner.');
        setWinner(data);
        setSpinTicket(data.winner.ticket);
        setDrawResults(data.results);
        setNextRound(data.nextRound);
        setNextPrize(data.nextPrize);
      } catch (drawError) {
        setError(drawError.message || 'Could not draw a winner.');
      } finally {
        setIsSpinning(false);
      }
    }, 100);
  };

  const downloadCsv = async () => {
    setError('');
    setExportingKey('entries-csv');
    try {
      const response = await fetch('/api/export', {
        headers: { 'x-admin-passcode': adminPasscode }
      });
      if (!response.ok) await readApiResponse(response, 'Could not export entries.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'raffle-entries.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) {
      setError(exportError.message || 'Could not export entries.');
    } finally {
      setExportingKey('');
    }
  };

  const handleExportEntries = async (format) => {
    if (!entries.length) {
      setError('Walang entries na maaring i-export.');
      return;
    }
    setError('');
    const key = `entries-${format}`;
    setExportingKey(key);
    try {
      const { exportEntriesReport } = await import('../utils/exportReports');
      await exportEntriesReport(format, entries, {
        campaignName: settings.campaignName || 'STL Community Rice Raffle'
      });
    } catch (exportError) {
      setError(exportError.message || 'Hindi ma-export ang talaan ng mga kalahok.');
    } finally {
      setExportingKey('');
    }
  };

  const handleExportBatch = async (format, batch, index) => {
    const batchResults = batch?.results || [];
    if (!batchResults.length) return;
    setError('');
    const key = `${batch.id || index}-${format}`;
    setExportingKey(key);
    try {
      const { exportWinnersReport } = await import('../utils/exportReports');
      await exportWinnersReport(format, batchResults, {
        campaignName: settings.campaignName || 'STL Community Rice Raffle',
        batchLabel: batch.note || `Batch #${batch.batchNumber || index + 1}`,
        savedAt: batch.savedAt
      });
    } catch (exportError) {
      setError(exportError.message || 'Hindi ma-export ang mga nanalo sa batch na ito.');
    } finally {
      setExportingKey('');
    }
  };

  const viewProof = async (proof) => {
    setError('');
    try {
      const response = await fetch(`/api/proofs/${encodeURIComponent(proof.filename)}`, {
        headers: { 'x-admin-passcode': adminPasscode }
      });
      if (!response.ok) throw new Error('Could not load screenshot proof.');
      const url = URL.createObjectURL(await response.blob());
      setActiveProof({ url, pageKey: proof.pageKey });
    } catch (proofError) {
      setError(proofError.message || 'Could not load screenshot proof.');
    }
  };

  const closeProof = () => {
    if (activeProof?.url) URL.revokeObjectURL(activeProof.url);
    setActiveProof(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Raffle administration</p>
          <h1 className="text-3xl font-black text-slate-900">Campaign dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowShareModal(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold shadow-sm transition">
            <Share2 className="w-4 h-4" /> Share & QR Code
          </button>
          <button onClick={onRefresh} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white text-sm font-bold hover:bg-slate-50 transition">
            <RotateCcw className="w-4 h-4" /> Refresh
          </button>
          <button
            type="button"
            disabled={Boolean(exportingKey)}
            onClick={() => handleExportEntries('pdf')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-sm transition disabled:opacity-50"
            title="I-download ang lahat ng kalahok bilang PDF"
          >
            {exportingKey === 'entries-pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span>PDF</span>
          </button>
          <button
            type="button"
            disabled={Boolean(exportingKey)}
            onClick={() => handleExportEntries('docx')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-sm transition disabled:opacity-50"
            title="I-download ang lahat ng kalahok bilang Word (.docx)"
          >
            {exportingKey === 'entries-docx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            <span>Word</span>
          </button>
          <button
            type="button"
            disabled={Boolean(exportingKey)}
            onClick={downloadCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition disabled:opacity-50"
          >
            {exportingKey === 'entries-csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* OPISYAL NA SHARE CARD PARA SA MESSENGER / FACEBOOK / GC */}
      <section className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white rounded-2xl p-5 sm:p-6 shadow-xl border border-emerald-500/30">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider border border-emerald-400/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Opisyal na Share Link &amp; Messenger Post
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Ready-to-Paste sa Messenger &amp; Group Chat
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl">
              I-copy ang opisyal na link o ang kumpletong mensahe para siguradong mag-appear ang litrato ng bigas at raffle banner pagka-paste sa Messenger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowShareModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-bold border border-slate-700 shadow-sm transition"
            >
              <QrCode className="w-4 h-4 text-emerald-400" />
              Buksan ang QR Modal
            </button>
            <a
              href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(officialShareUrl)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 text-xs font-bold border border-blue-500/40 transition"
              title="I-refresh ang cache ng Facebook kung sakaling hindi agad lumabas ang litrato"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              I-refresh FB Cache
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Link and Action Buttons */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 bg-slate-950/70 border border-slate-700/60 rounded-xl px-3.5 py-2.5 flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 shrink-0">Link:</span>
            <input
              type="text"
              readOnly
              value={officialShareUrl}
              className="w-full bg-transparent text-xs sm:text-sm font-mono text-emerald-200 font-semibold focus:outline-none select-all"
            />
          </div>

          <div className="md:col-span-6 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => copyToClipboard(officialShareUrl, setCopiedShareLink)}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-md transition ${
                copiedShareLink
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {copiedShareLink ? (
                <>
                  <Check className="w-4 h-4" />
                  Nakopya ang Link!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Kopyahin ang Link
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => copyToClipboard(officialShareMessage, setCopiedShareMessage)}
              className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-md transition ${
                copiedShareMessage
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              {copiedShareMessage ? (
                <>
                  <Check className="w-4 h-4" />
                  Nakopya ang Mensahe!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Kopyahin ang Mensahe (Pang-GC)
                </>
              )}
            </button>
          </div>
        </div>

        {/* Tip Box */}
        <div className="mt-4 p-3 rounded-xl bg-slate-800/80 border border-slate-700/70 text-xs text-slate-300 flex items-start gap-2.5">
          <span className="text-base leading-none">💡</span>
          <div className="leading-relaxed">
            <strong className="text-amber-300">Tip sa Messenger:</strong> Pagka-paste ng link sa chat box, <strong>maghintay ng 1 hanggang 2 segundo</strong> bago pindutin ang Send upang kusang lumitaw ang litrato ng Bigas at Official Banner! Kung hindi agad lumitaw dahil sa lumang cache ng Facebook, i-click lamang ang <em>&quot;I-refresh FB Cache&quot;</em> sa itaas at pindutin ang <strong>&quot;Scrape Again&quot;</strong>.
          </div>
        </div>
      </section>

      {error && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="Total entries" value={stats.total ?? entries.length} icon={<Users className="w-4 h-4" />} />
        <Metric label="Eligible" value={stats.eligible ?? entries.filter((e) => e.status === 'Eligible').length} icon={<Award className="w-4 h-4" />} />
        <Metric label="Needs review" value={stats.flagged ?? entries.filter((e) => e.status !== 'Eligible').length} icon={<Settings className="w-4 h-4" />} />
        <Metric label="Agent usernames" value={stats.activeAgents ?? 0} icon={<Settings className="w-4 h-4" />} />
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <h2 className="font-black text-lg">Campaign settings</h2>
            <span className="text-sm font-bold text-blue-700">Show / hide</span>
          </summary>
          <form onSubmit={saveSettings} className="mt-5 grid md:grid-cols-2 gap-4">
          <Field label="Campaign name">
            <input name="campaignName" value={settings.campaignName || ''} onChange={updateSetting} required maxLength="120" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal" />
          </Field>
          <Field label="Prize description">
            <input name="prizeDescription" value={settings.prizeDescription || ''} onChange={updateSetting} maxLength="240" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal" />
          </Field>
          <Field label="Campaign details link (optional)">
            <input name="campaignUrl" type="url" value={settings.campaignUrl || ''} onChange={updateSetting} placeholder="https://example.com/campaign" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal" />
          </Field>
          <Field label="Announcement">
            <input name="announcement" value={settings.announcement || ''} onChange={updateSetting} maxLength="240" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal" />
          </Field>
          <Field label="Entries open (Philippines time)">
            <input
              name="entryStartAt"
              type="datetime-local"
              value={settings.entryStartAt || ''}
              onChange={updateSetting}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal"
            />
          </Field>
          <Field label="Entries close (Philippines time)">
            <input
              name="entryEndAt"
              type="datetime-local"
              value={settings.entryEndAt || ''}
              onChange={updateSetting}
              min={settings.entryStartAt || undefined}
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal"
            />
          </Field>
          <p className="md:col-span-2 -mt-2 text-xs text-slate-500">
            Set both dates and times, or leave both empty to keep entries open without a schedule. Times use Asia/Manila (UTC+8).
          </p>
          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Use only campaign details and links you are authorized to publish. This app does not connect to social accounts.
            </p>
            <button type="submit" className="shrink-0 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-bold">Save settings</button>
          </div>
          {settingsSaved && <p className="md:col-span-2 text-sm text-emerald-700">Settings saved.</p>}
          </form>
        </details>
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="font-black text-lg">Daily Engagement / Task Generator</h2>
          <p className="mt-1 text-sm text-slate-500">
            Create a task link for a Facebook post. Each ticket can submit one screenshot for each task.
          </p>
        </div>
        <form onSubmit={createEngagementTask} className="grid md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <Field label="Facebook Post URL">
              <input
                type="url"
                value={taskPostUrl}
                onChange={(event) => setTaskPostUrl(event.target.value)}
                required
                maxLength="2048"
                placeholder="https://www.facebook.com/..."
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal"
              />
            </Field>
          </div>
          <Field label="Instruction (optional)">
            <textarea
              value={taskInstruction}
              onChange={(event) => setTaskInstruction(event.target.value)}
              maxLength="500"
              rows="3"
              placeholder="Explain what agents should do on this post."
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal"
            />
          </Field>
          <Field label="Suggested comment (optional)">
            <textarea
              value={suggestedComment}
              onChange={(event) => setSuggestedComment(event.target.value)}
              maxLength="500"
              rows="3"
              placeholder="Optional comment agents can copy."
              className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal"
            />
          </Field>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={isCreatingTask}
              className="rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-bold disabled:opacity-50"
            >
              {isCreatingTask ? 'Generating link…' : 'Generate task link'}
            </button>
          </div>
        </form>
        {taskLink && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <a href={taskLink} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all text-sm font-semibold text-emerald-900 underline">
              {taskLink}
            </a>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => copyTaskLink(new URL(taskLink).searchParams.get('task'))}
                className="shrink-0 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-2 text-xs font-bold text-white transition"
              >
                Copy Link
              </button>
              <button
                type="button"
                onClick={() => {
                  const taskId = new URL(taskLink).searchParams.get('task');
                  const msg = `🎯 BAGONG ENGAGEMENT TASK!\n\n📌 Paano gawin:\n1. I-click ang link: ${taskLink}\n2. I-input ang iyong Ticket Number bago mag-engage.\n3. Sundin ang tagubilin at i-upload ang screenshot proof para sa raffle!`;
                  copyToClipboard(msg);
                }}
                className="shrink-0 rounded-lg bg-amber-500 hover:bg-amber-600 px-3 py-2 text-xs font-black text-slate-950 transition"
              >
                Copy Mensahe (GC)
              </button>
            </div>
          </div>
        )}
        {Array.isArray(settings.engagementTasks) && settings.engagementTasks.length > 0 && (
          <div className="mt-6 border-t border-slate-200 pt-5">
            <h3 className="font-bold text-slate-900">Generated tasks</h3>
            <ul className="mt-3 space-y-3">
              {settings.engagementTasks.map((task) => (
                <li key={task.id} className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
                  {editingTaskId === task.id ? (
                    <form onSubmit={saveEditedTask} className="space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                        <span className="font-mono text-xs font-black text-blue-900 bg-blue-100 px-2 py-0.5 rounded">
                          I-edit ang {task.id}
                        </span>
                        <span className="text-xs text-slate-500">I-update ang impormasyon ng task</span>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700">
                          Facebook Post URL <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="url"
                          value={editPostUrl}
                          onChange={(e) => setEditPostUrl(e.target.value)}
                          required
                          maxLength="2048"
                          placeholder="https://www.facebook.com/..."
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700">Instruction (opsyonal)</label>
                          <textarea
                            value={editInstruction}
                            onChange={(e) => setEditInstruction(e.target.value)}
                            maxLength="500"
                            rows="2"
                            placeholder="Tagubilin para sa mga agent..."
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700">Suggested comment (opsyonal)</label>
                          <textarea
                            value={editSuggestedComment}
                            onChange={(e) => setEditSuggestedComment(e.target.value)}
                            maxLength="500"
                            rows="2"
                            placeholder="Mungkahi na komento..."
                            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-normal focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={isUpdatingTask}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50 transition"
                        >
                          {isUpdatingTask ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>Sine-save…</span>
                            </>
                          ) : (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              <span>I-save ang Pagbabago</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditTask}
                          disabled={isUpdatingTask}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          Kanselahin
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-bold text-blue-800">{task.id}</p>
                          {task.updatedAt && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              (Na-edit kamakailan)
                            </span>
                          )}
                        </div>
                        <a href={task.postUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-slate-600 underline hover:text-blue-700">
                          {task.postUrl}
                        </a>
                        {task.instruction && <p className="mt-2 text-xs text-slate-600"><span className="font-semibold text-slate-700">Instruction:</span> {task.instruction}</p>}
                        {task.suggestedComment && <p className="mt-1 text-xs text-slate-600"><span className="font-semibold text-slate-700">Suggested comment:</span> {task.suggestedComment}</p>}
                      </div>
                      <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditTask(task)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition"
                        >
                          <Pencil className="w-3.5 h-3.5 text-amber-700" />
                          <span>I-edit ang Task</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => copyTaskLink(task.id)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-50 transition"
                        >
                          {copiedTaskId === task.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Nakopya ang Link</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Kopyahin ang Link</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyTaskMessage(task)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 px-3 py-1.5 text-xs font-black shadow-sm transition"
                        >
                          {copiedTaskMsgId === task.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Nakopya ang Mensahe</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Kopyahin Mensahe (GC)</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTask(task.id)}
                          title="Tanggalin ang task na ito"
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 transition"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                          <span>Tanggalin</span>
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-4 text-xs leading-5 text-emerald-800 font-bold flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Nakadepende ang eligibility sa engagement task: Kapag natapos at na-verify ang task ng kalahok, saka pa lamang sila magiging 'Eligible' at masasama sa raffle draw.</span>
        </p>
      </section>

      {/* PCSO-Style Lotto Tambiolo & Roulette Wheel Section */}
      <section id="raffle-draw">
        <RaffleRoulette
          entries={entries}
          nextRound={nextRound}
          nextPrize={nextPrize}
          drawResults={drawResults}
          campaignName={settings.campaignName || 'STL Community Rice Raffle'}
          adminPasscode={adminPasscode}
          onDrawComplete={(winnerData) => {
            setWinner(winnerData);
            setDrawResults(winnerData.results || []);
            setNextRound(winnerData.nextRound);
            setNextPrize(winnerData.nextPrize);
            onRefresh();
          }}
          onResetDraw={handleDrawReset}
          onError={(err) => setError(err)}
        />
      </section>

      {/* DRAW HISTORY ARCHIVES SECTION */}
      {Array.isArray(settings.drawHistory) && settings.drawHistory.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="font-black text-lg flex items-center gap-2 text-slate-900">
                <Trophy className="w-5 h-5 text-amber-500" />
                <span>Kasaysayan ng mga Nakaraang Draw (Draw History Archive)</span>
                <span className="text-xs bg-amber-100 text-amber-900 font-extrabold px-2.5 py-0.5 rounded-full border border-amber-300">
                  {settings.drawHistory.length} {settings.drawHistory.length === 1 ? 'Batch' : 'Batches'}
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Ligtas na naka-archive ang mga nakaraang draw rounds upang magkaroon kayo ng permanenteng talaan ng mga nanalo bawat draw batch.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {settings.drawHistory.map((batch, index) => (
              <details key={batch.id || index} className="group rounded-xl border border-slate-200 bg-slate-50/70 overflow-hidden">
                <summary className="flex cursor-pointer items-center justify-between p-4 font-bold text-slate-800 hover:bg-slate-100/70 transition select-none">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-xs font-black text-slate-950">
                      #{batch.batchNumber || index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-extrabold text-slate-900">{batch.note || `Draw Batch #${batch.batchNumber || index + 1}`}</p>
                      <p className="text-[11px] font-normal text-slate-500">
                        Petsa: {batch.savedAt ? new Date(batch.savedAt).toLocaleString('en-PH') : '—'} • {batch.totalWinners || batch.results?.length || 0} Nanalo
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-blue-700 font-semibold group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>

                <div className="border-t border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-600">I-download ang rekord ng batch na ito:</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { format: 'pdf', label: 'PDF (.pdf)', style: 'bg-rose-600 hover:bg-rose-700 text-white' },
                        { format: 'docx', label: 'Word (.docx)', style: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
                        { format: 'csv', label: 'Excel (.csv)', style: 'bg-slate-700 hover:bg-slate-800 text-white' }
                      ].map((btn) => {
                        const isThisExporting = exportingKey === `${batch.id || index}-${btn.format}`;
                        return (
                          <button
                            key={btn.format}
                            type="button"
                            disabled={Boolean(exportingKey)}
                            onClick={() => handleExportBatch(btn.format, batch, index)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold shadow-xs transition disabled:opacity-50 ${btn.style}`}
                          >
                            {isThisExporting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : btn.format === 'csv' ? (
                              <Download className="w-3.5 h-3.5" />
                            ) : (
                              <FileText className="w-3.5 h-3.5" />
                            )}
                            <span>{btn.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[650px]">
                      <thead className="bg-slate-100/80 text-slate-600 font-black uppercase text-[10px] tracking-wider">
                        <tr>
                          <th className="p-2.5">Round</th>
                          <th className="p-2.5">Premyo</th>
                          <th className="p-2.5">Ticket Code</th>
                          <th className="p-2.5">Huling 6</th>
                          <th className="p-2.5">Pangalan</th>
                          <th className="p-2.5">Contact Number</th>
                          <th className="p-2.5">Supervisor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(batch.results || []).map((res) => (
                          <tr key={res.round} className="hover:bg-slate-50">
                            <td className="p-2.5 font-bold text-blue-800">Round {res.round}</td>
                            <td className="p-2.5 font-extrabold text-amber-700">{res.prize}</td>
                            <td className="p-2.5 font-mono font-bold text-slate-800">{res.winner?.ticket}</td>
                            <td className="p-2.5 font-mono font-black text-amber-900 bg-amber-50 px-2 py-0.5 rounded inline-block my-1 border border-amber-200">
                              {res.winner?.ticket ? res.winner.ticket.slice(-6) : '—'}
                            </td>
                            <td className="p-2.5 font-bold text-slate-900">{res.winner?.agent}</td>
                            <td className="p-2.5 font-mono text-slate-600">{res.winner?.contact}</td>
                            <td className="p-2.5 text-slate-700">{res.winner?.supervisorName || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ENTRY LIST TABLE SECTION - SPACIOUS, ELEGANT, HIGH READABILITY */}
      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/50">
          <div>
            <h2 className="font-black text-lg flex items-center gap-2 text-slate-900">
              <span>Talaan ng mga Kalahok (Entry List)</span>
              <span className="text-[11px] bg-blue-100 text-blue-800 font-extrabold px-2.5 py-0.5 rounded-full border border-blue-300">
                Auto-Detection
              </span>
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Awtomatikong sinusuri kung kwalipikado (eligible) ang kalahok batay sa pagkumpleto ng lahat ng takdang gawain.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-sm transition"
              title="I-refresh ang eligibility ng mga kalahok"
            >
              <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
              <span>Sync Status</span>
            </button>
            <label className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Hanapin ang kalahok o ticket…"
                className="w-48 sm:w-64 rounded-xl border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs font-medium outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition shadow-sm"
              />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[1100px] border-collapse">
            <thead className="bg-slate-100/80 text-slate-600 border-b border-slate-200 text-[11px] font-black uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5 w-48">Ticket Number</th>
                <th className="px-4 py-3.5 w-44">Pangalan (Full Name)</th>
                <th className="px-4 py-3.5 w-32">Contact Number</th>
                <th className="px-4 py-3.5 w-32">Agent Username</th>
                <th className="px-4 py-3.5 w-36">Supervisor</th>
                <th className="px-4 py-3.5 min-w-[220px]">Mga Patunay (Proofs)</th>
                <th className="px-4 py-3.5 w-24 text-center">Tasks</th>
                <th className="px-4 py-3.5 w-32 text-center">Status</th>
                <th className="px-4 py-3.5 w-44 text-right pr-6">Aksyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredEntries.length ? filteredEntries.map((entry) => {
                const totalTasks = entry.totalTasks ?? 0;
                const tasksCompleted = entry.tasksCompleted ?? 0;
                const isAllTasksDone = totalTasks > 0 && tasksCompleted >= totalTasks;
                const isPendingTasks = totalTasks > 0 && tasksCompleted < totalTasks;

                const pageProofs = entry.proofs || [];
                const taskProofs = entry.engagementProofs || [];

                return (
                  <tr key={entry.ticket} className="hover:bg-blue-50/40 transition-colors">
                    {/* Ticket */}
                    <td className="px-4 py-3.5 align-middle">
                      <span className="font-mono font-bold text-blue-900 bg-blue-50/80 border border-blue-200/90 px-2 py-0.5 rounded text-xs inline-block">
                        {entry.ticket}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono block mt-1">
                        Huling 6: <strong className="text-slate-800 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded font-black">{entry.ticket.slice(-6)}</strong>
                      </span>
                    </td>

                    {/* Full Name */}
                    <td className="px-4 py-3.5 align-middle font-bold text-slate-900 text-sm">
                      {entry.agent}
                    </td>

                    {/* Contact */}
                    <td className="px-4 py-3.5 align-middle font-mono text-xs text-slate-600">
                      {entry.contact}
                    </td>

                    {/* Agent Username */}
                    <td className="px-4 py-3.5 align-middle">
                      {entry.agentUsername ? (
                        <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded inline-block">
                          {entry.agentUsername}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Supervisor */}
                    <td className="px-4 py-3.5 align-middle font-semibold text-slate-800 text-xs">
                      {entry.supervisorName || '—'}
                    </td>

                    {/* Proof Reference */}
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {pageProofs.map((proof) => (
                          <button
                            key={proof.filename}
                            type="button"
                            onClick={() => viewProof(proof)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[11px] font-semibold text-blue-800 transition"
                            title={`Tingnan ang patunay para sa ${formatProofLabel(proof.pageKey)}`}
                          >
                            <FileText className="w-3 h-3 text-blue-600 shrink-0" />
                            <span>{formatProofLabel(proof.pageKey)}</span>
                          </button>
                        ))}
                        {taskProofs.map((proof) => (
                          <button
                            key={proof.filename}
                            type="button"
                            onClick={() => viewProof(proof)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 hover:bg-purple-100 border border-purple-200 text-[11px] font-semibold text-purple-800 transition"
                            title={`Tingnan ang patunay para sa ${formatProofLabel(proof.pageKey)}`}
                          >
                            <Sparkles className="w-3 h-3 text-purple-600 shrink-0" />
                            <span>{formatProofLabel(proof.pageKey)}</span>
                          </button>
                        ))}
                        {!pageProofs.length && !taskProofs.length && (
                          <span className="text-slate-400 italic">Walang patunay</span>
                        )}
                      </div>
                    </td>

                    {/* Tasks Completed */}
                    <td className="px-4 py-3.5 align-middle text-center">
                      <span className={`inline-flex items-center justify-center font-mono text-xs font-black px-2.5 py-0.5 rounded-full border ${
                        isAllTasksDone
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isPendingTasks
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {tasksCompleted}/{totalTasks}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3.5 align-middle text-center whitespace-nowrap">
                      {isAllTasksDone ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Eligible</span>
                        </span>
                      ) : isPendingTasks ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-sm">
                          <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>Kulang sa Task</span>
                        </span>
                      ) : entry.status === 'Eligible' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
                          <span>Eligible</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                          <span>Pending Review</span>
                        </span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-4 py-3.5 align-middle whitespace-nowrap text-right pr-6">
                      {isAllTasksDone ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Kumpleto ({tasksCompleted}/{totalTasks})
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleStatus(entry.ticket)}
                            className="text-[11px] font-medium text-slate-400 hover:text-slate-800 underline transition"
                            title="I-manual override ang status kung kailangan"
                          >
                            Manual Override
                          </button>
                        </div>
                      ) : isPendingTasks ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Kulang ({tasksCompleted}/{totalTasks})
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleStatus(entry.ticket)}
                            className="text-[11px] text-blue-700 font-bold hover:underline transition"
                          >
                            {entry.status === 'Eligible' ? 'Mark for review' : 'Force eligible'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[11px] font-semibold text-slate-500">
                            {entry.status === 'Eligible' ? 'Kwalipikado' : 'For Review'}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleStatus(entry.ticket)}
                            className="text-[11px] text-blue-700 font-bold hover:underline transition"
                          >
                            {entry.status === 'Eligible' ? 'Mark for review' : 'Force eligible'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500 font-medium" colSpan="9">
                    Walang natagpuang entries na tumutugma sa inyong paghahanap.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {activeProof && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot proof"
          className="fixed inset-0 z-50 bg-slate-950/80 p-4 flex items-center justify-center"
          onClick={closeProof}
        >
          <div className="bg-white rounded-xl p-3 max-w-4xl max-h-[90vh]" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 mb-2">
              <p className="font-bold">{activeProof.pageKey} proof</p>
              <button type="button" onClick={closeProof} className="text-sm font-bold text-blue-700">Close</button>
            </div>
            <img src={activeProof.url} alt={`${activeProof.pageKey} screenshot proof`} className="max-w-full max-h-[80vh] object-contain" />
          </div>
        </div>
      )}

      {showShareModal && (
        <ShareModal
          onClose={() => setShowShareModal(false)}
          customUrl={officialShareUrl}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between text-xs uppercase font-bold text-slate-500">
        {label}{icon}
      </div>
      <div className="text-3xl font-black mt-2">{value}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}
