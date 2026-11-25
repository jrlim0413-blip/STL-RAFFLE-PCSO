import React, { useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Gift, ShieldCheck, Ticket, Upload } from 'lucide-react';

const PROOF_PAGES = [
  {
    id: 'melquiades',
    name: 'Melquiades "Mel" Robles',
    url: 'https://www.facebook.com/profile.php?id=61564884082252'
  },
  {
    id: 'pcso',
    name: 'PCSO',
    url: 'https://www.facebook.com/pcsoofficialsocialmedia'
  },
  {
    id: 'situation-report',
    name: 'The Situation Report',
    url: 'https://www.facebook.com/SituationReportPH'
  }
];

const EMPTY_FORM = { agent: '', contact: '', kiosk: '' };
const MAX_FILE_SIZE = 4 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export default function LandingPage({ pageSettings }) {
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [proofFiles, setProofFiles] = useState({});
  const [generatedTicket, setGeneratedTicket] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [consent, setConsent] = useState(false);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleProofChange = (pageId, file) => {
    setError('');
    setProofFiles((previous) => ({ ...previous, [pageId]: null }));
    if (!file) {
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Upload screenshots as PNG, JPG, or WebP images.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('Each screenshot must be no larger than 4 MB.');
      return;
    }
    setProofFiles((previous) => ({ ...previous, [pageId]: file }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const proofScreenshots = [];
      for (const page of PROOF_PAGES) {
        const file = proofFiles[page.id];
        if (!file) throw new Error(`Please upload a screenshot for ${page.name}.`);
        const uploadResponse = await fetch('/api/proofs/upload', {
          method: 'POST',
          headers: { 'Content-Type': file.type },
          body: file
        });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || `Could not upload the screenshot for ${page.name}.`);
        }
        proofScreenshots.push({ pageKey: page.id, filename: uploadData.filename });
      }

      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, consent, proofScreenshots })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit your entry.');
      setGeneratedTicket(data.ticket);
      setFormData(EMPTY_FORM);
      setProofFiles({});
      setConsent(false);
    } catch (submitError) {
      console.error('Raffle entry submission failed:', submitError);
      setError(submitError.message || 'Could not submit your entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyTicket = async () => {
    if (!generatedTicket?.ticket) return;
    try {
      await navigator.clipboard.writeText(generatedTicket.ticket);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (copyError) {
      console.error('Could not copy ticket code:', copyError);
      setError('Could not copy the ticket code. Please select and copy it manually.');
    }
  };

  return (
    <div className="pb-16">
      <div className="bg-gradient-to-r from-blue-950 via-blue-800 to-blue-950 text-white px-4 py-2 text-center text-xs font-bold">
        STL ang organizer ng raffle na ito. Hindi ito sponsored o endorsed ng PCSO o ng mga naka-link na page.
      </div>

      <section className="relative overflow-hidden bg-white border-b border-slate-200 px-4 py-12 sm:py-16">
        <div className="absolute -top-20 right-0 w-80 h-80 bg-amber-100 rounded-full blur-3xl opacity-70 pointer-events-none" />
        <div className="relative max-w-5xl mx-auto">
          <div className="flex items-center justify-center gap-5 mb-8">
            <img src="/images/stl-logo.png" alt="STL" className="w-20 h-20 sm:w-24 sm:h-24 object-contain" />
            <div className="h-14 border-l border-slate-200" />
            <img src="/images/lucky-betplay-logo.png" alt="Lucky Betplay Corporation" className="w-36 h-20 sm:w-48 sm:h-24 object-contain" />
          </div>
          <div className="text-center">
            <span className="inline-flex items-center gap-2 bg-amber-100 text-amber-900 border border-amber-300 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wide">
              <Gift className="w-4 h-4" />
              Community Rice Raffle
            </span>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight mt-5 text-slate-950">
              {pageSettings.campaignName || 'STL Raffle'}
            </h1>
            <p className="text-slate-600 mt-4 max-w-2xl mx-auto">
              Follow the three pages below, engage genuinely with their posts, and submit one screenshot
              from each page to receive your raffle ticket.
            </p>
            <p className="text-sm font-bold text-blue-900 mt-3">
              Six winners: five winners of 5 kg rice, followed by one final winner of 25 kg rice.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
            {PROOF_PAGES.map((page, index) => (
              <article key={page.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col">
                <span className="text-xs font-black text-blue-700 uppercase">Page {index + 1}</span>
                <h2 className="font-extrabold text-slate-900 mt-2">{page.name}</h2>
                <p className="text-xs text-slate-500 mt-1 flex-1">
                  Follow the page and engage naturally with its campaign-related posts.
                </p>
                <a
                  href={page.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 mt-4 rounded-lg bg-blue-700 hover:bg-blue-800 text-white px-3 py-2.5 text-sm font-bold"
                >
                  Open page <ExternalLink className="w-4 h-4" />
                </a>
              </article>
            ))}
          </div>

          <div className="mt-8 rounded-2xl bg-blue-50 border border-blue-200 p-5">
            <h2 className="font-black text-blue-950">Six rice prizes, in draw order</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <div className="rounded-xl bg-white border border-blue-100 p-4">
                <span className="text-xs uppercase font-bold text-blue-700">Draws 1-5</span>
                <p className="font-extrabold text-slate-900 mt-1">5 winners receive 5 kg rice each</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <span className="text-xs uppercase font-bold text-amber-800">Draw 6 - final draw</span>
                <p className="font-extrabold text-slate-900 mt-1">1 winner receives 25 kg rice</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white border border-slate-200 rounded-3xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-800 to-blue-950 text-white p-6 sm:p-8 text-center">
            <span className="text-xs bg-amber-300 text-slate-950 px-3 py-1 rounded-full font-black uppercase">
              Entry and ticket
            </span>
            <h2 className="text-2xl font-black mt-3">Submit your three screenshots</h2>
            <p className="text-sm text-blue-100 mt-2">
              Upload one screenshot for each page. Your ticket appears after all three are submitted.
            </p>
          </div>

          {generatedTicket ? (
            <div className="p-6 sm:p-8 text-center space-y-5">
              <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
              <div>
                <h3 className="text-2xl font-black text-slate-900">Ticket generated</h3>
                <p className="text-sm text-slate-600 mt-1">
                  The organizer will review your proof before approving the entry. Screenshot this ticket
                  and keep it with your three page screenshots.
                </p>
              </div>
              <div className="max-w-md mx-auto rounded-2xl border-2 border-amber-400 bg-amber-50 p-6">
                <div className="flex items-center justify-center gap-2 text-blue-900 font-black uppercase text-xs">
                  <Ticket className="w-4 h-4" /> STL Raffle Ticket
                </div>
                <p className="font-mono font-black text-3xl sm:text-4xl text-blue-800 mt-3">{generatedTicket.ticket}</p>
                <p className="text-sm font-bold text-slate-700 mt-3">{generatedTicket.agent}</p>
                <p className="text-xs text-slate-600 mt-1">Keep this ticket screenshot as proof when claiming a prize.</p>
              </div>
              <button type="button" onClick={copyTicket} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700">
                <Copy className="w-4 h-4" /> {copied ? 'Copied' : 'Copy ticket number'}
              </button>
              <div>
                <button
                  type="button"
                  onClick={() => setGeneratedTicket(null)}
                  className="px-5 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-bold"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
              {error && (
                <p role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">
                  {error}
                </p>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block text-sm font-bold">
                  Name <span className="text-red-600">*</span>
                  <input
                    name="agent"
                    value={formData.agent}
                    onChange={handleInputChange}
                    required
                    maxLength="100"
                    autoComplete="name"
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Contact number <span className="text-red-600">*</span>
                  <input
                    name="contact"
                    type="tel"
                    value={formData.contact}
                    onChange={handleInputChange}
                    required
                    maxLength="40"
                    autoComplete="tel"
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal"
                  />
                </label>
              </div>

              <label className="block text-sm font-bold">
                Branch or outlet (optional)
                <input
                  name="kiosk"
                  value={formData.kiosk}
                  onChange={handleInputChange}
                  maxLength="100"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2.5 font-normal"
                />
              </label>

              <div className="space-y-3">
                <h3 className="font-black text-slate-900">Required screenshot proofs</h3>
                {PROOF_PAGES.map((page) => (
                  <label key={page.id} className="block rounded-xl border border-slate-200 p-4">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <Upload className="w-4 h-4 text-blue-700" />
                      {page.name} screenshot <span className="text-red-600">*</span>
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      required
                      onChange={(event) => handleProofChange(page.id, event.target.files?.[0])}
                      className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-bold file:text-blue-800"
                    />
                    <span className="block text-xs text-slate-500 mt-1">
                      {proofFiles[page.id]?.name || 'PNG, JPG, or WebP; up to 4 MB.'}
                    </span>
                  </label>
                ))}
              </div>

              <label className="flex items-start gap-3 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  required
                  className="mt-0.5"
                />
                <span>
                  I agree that STL may store my name, contact number, and uploaded screenshots to
                  administer this independent raffle and verify a claim. I understand the raffle is
                  not sponsored or endorsed by PCSO or the linked pages.
                </span>
              </label>

              <p className="text-xs text-slate-500">
                Your screenshots are stored privately for the organizer. Never upload passwords,
                one-time codes, or private messages.
              </p>
              <button
                type="submit"
                disabled={isSubmitting || !consent}
                className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 font-black px-5 py-3 rounded-xl shadow-sm"
              >
                {isSubmitting ? 'Uploading proofs and generating ticket…' : 'Submit proofs and generate ticket'}
              </button>
            </form>
          )}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p>
            Independent raffle organized by STL. PCSO and the linked pages are featured as promotion
            pages only; they do not sponsor or endorse this raffle. No social account login is used.
          </p>
        </div>
        <p className="text-center text-xs text-slate-500 mt-4">
          Draw order: five 5-kg rice winners first, then one 25-kg rice winner in the final draw.
          Keep your ticket screenshot and proof screenshots to claim.
        </p>
      </section>
    </div>
  );
}
