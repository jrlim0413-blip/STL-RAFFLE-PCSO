import React, { useEffect, useState } from 'react';
import { Award, Download, RotateCcw, Search, Settings, Users } from 'lucide-react';

export default function AdminDashboard({ entries = [], stats = {}, pageSettings, adminPasscode, onUpdateSettings, onRefresh }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSpinning, setIsSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [spinTicket, setSpinTicket] = useState('RAFFLE-????');
  const [drawResults, setDrawResults] = useState([]);
  const [nextRound, setNextRound] = useState(1);
  const [nextPrize, setNextPrize] = useState('5 kg rice');
  const [settings, setSettings] = useState(pageSettings);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [error, setError] = useState('');
  const [activeProof, setActiveProof] = useState(null);

  useEffect(() => setSettings(pageSettings), [pageSettings]);
  useEffect(() => {
    let active = true;
    fetch('/api/draw', { headers: { 'x-admin-passcode': adminPasscode } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load draw results.');
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
    [entry.kiosk, entry.agent, entry.contact, entry.ticket]
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
    try {
      await onUpdateSettings(settings);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (saveError) {
      setError(saveError.message || 'Could not save campaign settings.');
    }
  };

  const toggleStatus = async (ticket) => {
    setError('');
    try {
      const response = await fetch(`/api/entries/${encodeURIComponent(ticket)}/toggle`, {
        method: 'POST',
        headers: { 'x-admin-passcode': adminPasscode }
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update entry status.');
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
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not draw a winner.');
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
    try {
      const response = await fetch('/api/export', {
        headers: { 'x-admin-passcode': adminPasscode }
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Could not export entries.');
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'raffle-entries.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError.message || 'Could not export entries.');
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
        <div className="flex gap-2">
          <button onClick={onRefresh} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border bg-white text-sm font-bold">
            <RotateCcw className="w-4 h-4" /> Refresh
          </button>
          <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
          {error}
        </p>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Metric label="Total entries" value={stats.total ?? entries.length} icon={<Users className="w-4 h-4" />} />
        <Metric label="Eligible" value={stats.eligible ?? entries.filter((e) => e.status === 'Eligible').length} icon={<Award className="w-4 h-4" />} />
        <Metric label="Needs review" value={stats.flagged ?? entries.filter((e) => e.status !== 'Eligible').length} icon={<Settings className="w-4 h-4" />} />
        <Metric label="Branches" value={stats.activeKiosks ?? 0} icon={<Settings className="w-4 h-4" />} />
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <h2 className="font-black text-lg mb-4">Campaign settings</h2>
        <form onSubmit={saveSettings} className="grid md:grid-cols-2 gap-4">
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
          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Use only campaign details and links you are authorized to publish. This app does not connect to social accounts.
            </p>
            <button type="submit" className="shrink-0 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-bold">Save settings</button>
          </div>
          {settingsSaved && <p className="md:col-span-2 text-sm text-emerald-700">Settings saved.</p>}
        </form>
      </section>

      <section id="raffle-draw" className="bg-amber-100 border border-amber-300 rounded-2xl p-6 text-center">
        <h2 className="text-xl font-black">Six-winner raffle draw</h2>
        <p className="text-sm text-slate-700 mt-1">
          {nextRound ? `Draw ${nextRound} of 6: ${nextPrize}` : 'All six prizes have been drawn.'}
        </p>
        <p className="font-mono text-3xl font-black text-blue-800 my-4">{spinTicket}</p>
        {winner && (
          <p className="text-sm font-bold text-emerald-800 mb-4">
            Draw {winner.round}: {winner.winner.agent} · {winner.winner.contact} · {winner.prize}
          </p>
        )}
        <button onClick={runRaffleDraw} disabled={isSpinning || !nextRound} className="rounded-lg bg-slate-900 text-white px-5 py-3 font-bold disabled:opacity-50">
          {isSpinning ? 'Drawing…' : nextRound ? `Draw #${nextRound} - ${nextPrize}` : 'Draw complete'}
        </button>
        {drawResults.length > 0 && (
          <ol className="max-w-lg mx-auto mt-5 text-left space-y-2">
            {drawResults.map((result) => (
              <li key={result.round} className="bg-white/70 rounded-lg px-3 py-2 text-sm">
                <strong>Draw {result.round} - {result.prize}:</strong> {result.winner.agent} ({result.winner.ticket})
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-5 flex flex-wrap items-center justify-between gap-3 border-b">
          <div>
            <h2 className="font-black text-lg">Entry list</h2>
            <p className="text-sm text-slate-500">Review entries and mark eligibility before the draw.</p>
          </div>
          <label className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search entries" className="border rounded-lg pl-9 pr-3 py-2 text-sm" />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="p-3">Ticket</th><th className="p-3">Name</th><th className="p-3">Contact</th>
                <th className="p-3">Branch</th><th className="p-3">Proof reference</th><th className="p-3">Status</th><th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEntries.length ? filteredEntries.map((entry) => (
                <tr key={entry.ticket}>
                  <td className="p-3 font-mono font-bold text-blue-700">{entry.ticket}</td>
                  <td className="p-3">{entry.agent}</td>
                  <td className="p-3">{entry.contact}</td>
                  <td className="p-3">{entry.kiosk || '—'}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      {(entry.proofs || []).map((proof) => (
                        <button
                          key={proof.filename}
                          type="button"
                          onClick={() => viewProof(proof)}
                          className="text-blue-700 font-bold hover:underline"
                        >
                          {proof.pageKey}
                        </button>
                      ))}
                      {!entry.proofs?.length && '—'}
                    </div>
                  </td>
                  <td className="p-3">{entry.status}</td>
                  <td className="p-3">
                    <button onClick={() => toggleStatus(entry.ticket)} className="text-blue-700 font-bold hover:underline">
                      {entry.status === 'Eligible' ? 'Mark for review' : 'Mark eligible'}
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td className="p-6 text-center text-slate-500" colSpan="7">No entries found.</td></tr>
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
