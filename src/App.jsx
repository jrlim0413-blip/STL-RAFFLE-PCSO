import React, { useEffect, useState } from 'react';
import LandingPage from './components/LandingPage';
import AdminDashboard from './components/AdminDashboard';
import { readApiResponse } from './utils/apiResponse';
import { ArrowLeft, Gift, ShieldCheck } from 'lucide-react';

const EMPTY_STATS = { total: 0, eligible: 0, flagged: 0, activeKiosks: 0 };
const DEFAULT_SETTINGS = {
  campaignName: 'STL Raffle',
  campaignUrl: '',
  announcement: 'STL Community Raffle: six rice prizes for six winners.',
  prizeDescription: 'Five winners receive 5 kg of rice each. The sixth and final winner receives 25 kg.'
};

export default function App() {
  const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin';
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [pageSettings, setPageSettings] = useState(DEFAULT_SETTINGS);
  const [loadError, setLoadError] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminAuthorized, setAdminAuthorized] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState('');

  const fetchEntries = async (passcode) => {
    try {
      const response = await fetch('/api/entries', {
        headers: { 'x-admin-passcode': passcode }
      });
      const data = await readApiResponse(response, 'Could not load raffle entries.');
      setEntries(data.data || []);
      setStats(data.stats || EMPTY_STATS);
      setLoadError('');
      return true;
    } catch (error) {
      console.error('Failed to load raffle entries:', error);
      setLoadError(error.message || 'Could not load raffle entries. Please try refreshing.');
      return false;
    }
  };

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await readApiResponse(response, 'Could not load campaign settings.');
      if (data.settings) setPageSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    } catch (error) {
      console.error('Failed to load campaign settings:', error);
      setLoadError(error.message || 'Could not load campaign settings. Please try refreshing.');
    }
  };

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    setAdminLoginError('');
    try {
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: adminPasscode })
      });
      await readApiResponse(response, 'Could not sign in to the admin dashboard.');
      if (!(await fetchEntries(adminPasscode))) {
        throw new Error('Could not load the admin dashboard.');
      }
      setAdminAuthorized(true);
    } catch (error) {
      setAdminLoginError(error.message || 'Could not sign in to the admin dashboard.');
    }
  };

  const handleUpdateSettings = async (updates) => {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-passcode': adminPasscode },
      body: JSON.stringify(updates)
    });
    const data = await readApiResponse(response, 'Could not save campaign settings.');
    setPageSettings({ ...DEFAULT_SETTINGS, ...data.settings });
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {isAdmin && (
        <>
          <div className="bg-blue-700 text-white text-xs py-2 px-4 text-center font-semibold">
            {pageSettings.announcement}
          </div>
          <header className="bg-white border-b border-slate-200 sticky top-0 z-50 px-4 py-3 shadow-sm">
            <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
              <a href="/" className="flex items-center gap-3 text-left">
                <span className="w-11 h-11 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center">
                  <Gift className="w-6 h-6" />
                </span>
                <span>
                  <span className="block font-extrabold uppercase tracking-wide text-slate-900">
                    {pageSettings.campaignName}
                  </span>
                  <span className="block text-xs text-slate-500">Raffle campaign portal</span>
                </span>
              </a>
              <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700">
                <ArrowLeft className="w-4 h-4" />
                Back to campaign
              </a>
            </div>
          </header>
        </>
      )}

      {loadError && (
        <p role="alert" className="bg-red-50 text-red-800 px-4 py-2 text-sm text-center">
          {loadError}
        </p>
      )}

      <main className="flex-1">
        {isAdmin ? (
          adminAuthorized ? (
            <AdminDashboard
              entries={entries}
              stats={stats}
              pageSettings={pageSettings}
              adminPasscode={adminPasscode}
              onUpdateSettings={handleUpdateSettings}
              onRefresh={() => fetchEntries(adminPasscode)}
            />
          ) : (
            <section className="max-w-md mx-auto px-4 py-16">
              <form onSubmit={handleAdminLogin} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-7 h-7 text-blue-700" />
                  <div>
                    <h1 className="text-xl font-black">Organizer access</h1>
                    <p className="text-sm text-slate-500">Enter the organizer passcode to continue.</p>
                  </div>
                </div>
                {adminLoginError && <p role="alert" className="text-sm text-red-700">{adminLoginError}</p>}
                <input
                  type="password"
                  value={adminPasscode}
                  onChange={(event) => setAdminPasscode(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5"
                  aria-label="Organizer passcode"
                />
                <button type="submit" className="w-full bg-blue-700 text-white rounded-lg px-4 py-3 font-bold">
                  Open admin console
                </button>
              </form>
            </section>
          )
        ) : (
          <LandingPage
            pageSettings={pageSettings}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-5 px-4 text-center text-xs text-slate-500">
        <p>
          Independent raffle campaign. Not affiliated with or endorsed by any social platform or
          government agency. This site will never ask for your social media password.
        </p>
        <p className="mt-2">
          <a href="/privacy.html" className="underline hover:text-slate-800">Privacy notice</a>
          {' · '}
          <a href="/data-deletion.html" className="underline hover:text-slate-800">Request data deletion</a>
        </p>
      </footer>
    </div>
  );
}
