import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Gift, ShieldCheck, Ticket, Upload, Users } from 'lucide-react';
import { readApiResponse } from '../utils/apiResponse';

const PROOF_PAGES = [
  {
    id: 'melquiades',
    name: 'Melquiades "Mel" Robles',
    image: '/images/pages/melquiades-mel-robles.jpg',
    url: 'https://www.facebook.com/profile.php?id=61564884082252'
  },
  {
    id: 'pcso',
    name: 'PCSO',
    image: '/images/pages/pcso.jpg',
    url: 'https://www.facebook.com/pcsoofficialsocialmedia'
  },
  {
    id: 'situation-report',
    name: 'The Situation Report',
    image: '/images/pages/situation-report.jpg',
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
        const uploadData = await readApiResponse(uploadResponse, `Could not upload the screenshot for ${page.name}.`);
        proofScreenshots.push({ pageKey: page.id, filename: uploadData.filename });
      }

      const response = await fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, consent, proofScreenshots })
      });
      const data = await readApiResponse(response, 'Could not submit your entry.');
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
    <div className="bg-white pb-16">
      <div className="border-b border-blue-100 bg-blue-50/70 px-4 py-2.5">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 text-center text-xs font-semibold text-blue-950">
          <ShieldCheck className="h-4 w-4 shrink-0 text-blue-700" />
          <span>Independent STL raffle. Not sponsored or endorsed by PCSO or the linked pages.</span>
        </div>
      </div>

      <section className="relative overflow-hidden border-b border-slate-200 bg-white px-4 py-10 sm:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-blue-50" />
        <div className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-amber-50/70" />
        <div className="relative mx-auto max-w-7xl">
          <header className="mb-10 flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <img src="/images/stl-logo.png" alt="STL" className="h-14 w-14 object-contain sm:h-16 sm:w-16" />
              <span className="h-10 border-l border-slate-200" />
              <img
                src="/images/lucky-betplay-logo.png"
                alt="Lucky Betplay Corporation"
                className="h-12 w-28 object-contain sm:h-14 sm:w-36"
              />
            </div>
            <a
              href="#entry-form"
              className="hidden items-center gap-2 rounded-full border border-blue-200 bg-white px-5 py-2.5 text-sm font-bold text-blue-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 sm:inline-flex"
            >
              Join the raffle <ArrowRight className="h-4 w-4" />
            </a>
          </header>

          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-amber-900">
                <Gift className="h-4 w-4 text-amber-700" />
                Community rice raffle
              </span>
              <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                {pageSettings.campaignName || 'STL Raffle'}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                Join the community, show your support for three pages, and get your raffle ticket ready
                for a chance to take home rice prizes.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#entry-form"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  Enter the raffle <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50"
                >
                  See how it works
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-3 text-sm">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200">
                  <Users className="h-4 w-4 text-blue-700" />
                  6 winners
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-200">
                  <Upload className="h-4 w-4 text-blue-700" />
                  3 screenshot proofs
                </div>
              </div>
            </div>

            <aside className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-700">The prizes</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                    Six chances to win
                  </h2>
                </div>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm ring-1 ring-slate-200">
                  <Gift className="h-6 w-6" />
                </span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-blue-100 bg-white p-5">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-blue-700">Draws 1–5</span>
                  <p className="mt-3 text-3xl font-black text-slate-950">5 kg</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">of rice for each of 5 winners</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-amber-800">Final draw</span>
                  <p className="mt-3 text-3xl font-black text-slate-950">25 kg</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600">of rice for 1 final winner</p>
                </div>
              </div>
              <p className="mt-5 border-t border-slate-200 pt-4 text-sm leading-6 text-slate-600">
                Winners are drawn in order: five 5-kg prizes first, then the 25-kg prize last.
              </p>
            </aside>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-8 bg-white px-4 py-14 sm:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-700">Simple to join</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Your ticket starts with three pages
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              Follow each page, engage with its posts, and upload one screenshot per page as proof.
            </p>
          </div>

          <div className="mt-9 grid gap-4 md:grid-cols-3">
            {PROOF_PAGES.map((page, index) => (
              <article key={page.id} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
                <div className="relative aspect-video bg-slate-100">
                  <img
                    src={page.image}
                    alt={`Screenshot of ${page.name} Facebook page`}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover object-center"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-sm font-black text-blue-800">
                      0{index + 1}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Required page</span>
                  </div>
                  <h3 className="mt-5 text-lg font-extrabold text-slate-950">{page.name}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">
                    Follow the page and engage naturally with its campaign-related posts. Take a screenshot to upload below.
                  </p>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 transition hover:bg-blue-100"
                  >
                    Visit page <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="entry-form" className="scroll-mt-6 border-y border-slate-200 bg-slate-50 px-4 py-14 sm:py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div className="lg:pt-4">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-blue-700">Entry and ticket</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Ready to join?
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-6 text-slate-600 sm:text-base">
              Complete your details and add a screenshot for each of the three pages. Your ticket will
              appear once your entry is submitted.
            </p>

            <ol className="mt-7 space-y-4">
              {[
                'Follow each of the three pages.',
                'Engage genuinely with their posts.',
                'Take one screenshot per page.',
                'Submit your details and keep your ticket screenshot.'
              ].map((step, index) => (
                <li key={step} className="flex items-start gap-3 text-sm font-semibold text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-blue-800 ring-1 ring-blue-200">
                    {index + 1}
                  </span>
                  <span className="pt-1">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-blue-100 bg-white p-4 text-sm leading-6 text-slate-600">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
              <p>
                Your entry details and screenshots are stored privately for organizer review. Never upload passwords,
                one-time codes, or private messages.
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5 sm:px-8">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <Ticket className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-black text-slate-950">Get your raffle ticket</h3>
                  <p className="mt-0.5 text-sm text-slate-500">All three screenshots are required.</p>
                </div>
              </div>
            </div>

            {generatedTicket ? (
              <div className="space-y-5 p-6 text-center sm:p-8">
                <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
                <div>
                  <h3 className="text-2xl font-black text-slate-950">Ticket generated</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The organizer will review your proof. Screenshot this ticket and keep it with your
                    three page screenshots for your claim.
                  </p>
                </div>
                <div className="mx-auto max-w-md overflow-hidden rounded-2xl border border-blue-200 bg-white text-left shadow-md">
                  <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-blue-950 via-blue-800 to-blue-700 px-5 py-4 text-white">
                    <div className="flex items-center gap-3">
                      <img src="/images/stl-logo.png" alt="STL" className="h-11 w-11 rounded-lg bg-white p-1 object-contain" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">STL Community Raffle</p>
                        <p className="mt-1 text-sm font-black uppercase tracking-wide">Entry ticket</p>
                      </div>
                    </div>
                    <Ticket className="h-6 w-6 shrink-0 text-amber-300" />
                  </div>
                  <div className="p-5">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-blue-700">Unique ticket code</p>
                    <p className="mt-2 break-all font-mono text-2xl font-black tracking-wide text-slate-950 sm:text-3xl">
                      {generatedTicket.ticket}
                    </p>
                    <div className="my-4 border-t-2 border-dashed border-slate-200" />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Participant</p>
                        <p className="mt-1 break-words text-sm font-bold text-slate-900">{generatedTicket.agent}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Issue date</p>
                        <p className="mt-1 font-mono text-sm font-bold text-slate-900">{generatedTicket.ticket.split('-')[1]}</p>
                      </div>
                    </div>
                    <p className="mt-4 text-xs leading-5 text-slate-600">
                      Save this ticket screenshot as proof when claiming a prize.
                    </p>
                  </div>
                </div>
                <button type="button" onClick={copyTicket} className="inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900">
                  <Copy className="h-4 w-4" /> {copied ? 'Copied' : 'Copy ticket number'}
                </button>
                <div>
                  <button
                    type="button"
                    onClick={() => setGeneratedTicket(null)}
                    className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5 p-6 sm:p-8">
                {error && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {error}
                  </p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-bold text-slate-800">
                    Name <span className="text-red-600">*</span>
                    <input
                      name="agent"
                      value={formData.agent}
                      onChange={handleInputChange}
                      required
                      maxLength="100"
                      autoComplete="name"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-sm font-bold text-slate-800">
                    Contact number <span className="text-red-600">*</span>
                    <input
                      name="contact"
                      type="tel"
                      value={formData.contact}
                      onChange={handleInputChange}
                      required
                      maxLength="40"
                      autoComplete="tel"
                      className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </label>
                </div>

                <label className="block text-sm font-bold text-slate-800">
                  Branch or outlet <span className="font-normal text-slate-500">(optional)</span>
                  <input
                    name="kiosk"
                    value={formData.kiosk}
                    onChange={handleInputChange}
                    maxLength="100"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>

                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">Screenshot proofs</h4>
                    <p className="mt-1 text-xs text-slate-500">PNG, JPG, or WebP. Maximum 4 MB each.</p>
                  </div>
                  {PROOF_PAGES.map((page, index) => (
                    <label key={page.id} className="block rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-blue-200">
                      <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-black text-blue-800 ring-1 ring-slate-200">
                          0{index + 1}
                        </span>
                        {page.name} <span className="text-red-600">*</span>
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        required
                        onChange={(event) => handleProofChange(page.id, event.target.files?.[0])}
                        className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-blue-800"
                      />
                      <span className="mt-2 block text-xs text-slate-500">
                        {proofFiles[page.id]?.name || 'Choose a screenshot for this page.'}
                      </span>
                    </label>
                  ))}
                </div>

                <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                    required
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                  />
                  <span>
                    I agree that STL may store my name, contact number, and uploaded screenshots to
                    administer this independent raffle and verify a claim. I understand the raffle is
                    not sponsored or endorsed by PCSO or the linked pages.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting || !consent}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? 'Uploading proofs and generating ticket…' : 'Submit proofs and get my ticket'}
                  {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
