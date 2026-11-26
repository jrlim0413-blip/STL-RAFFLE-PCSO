import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, Copy, ExternalLink, Loader2, Trash2, Upload, X } from 'lucide-react';
import { readApiResponse } from '../utils/apiResponse';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE = 4 * 1024 * 1024;

export default function EngagementTaskModal({ taskId, onClose }) {
  const [task, setTask] = useState(null);
  const [reference, setReference] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [taskUploadProgress, setTaskUploadProgress] = useState({ step: 0, total: 2, message: '' });
  const previewUrlRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [copiedComment, setCopiedComment] = useState(false);
  const [verifiedReference, setVerifiedReference] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/tasks/${encodeURIComponent(taskId)}`)
      .then(async (response) => {
        const data = await readApiResponse(response, 'Could not load this engagement task.');
        if (active) setTask(data.task);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Could not load this engagement task.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [taskId]);

  const verifyReference = async (event) => {
    event.preventDefault();
    setError('');
    const cleanTicket = reference.trim().toUpperCase();

    // STRICT CHECK: Dapat Ticket Number (STL-...) lamang! Hindi dapat mag-proceed kung hindi ticket number.
    if (!cleanTicket.startsWith('STL-')) {
      setError('Maling Ticket Number! Tanging opisyal na Ticket Number (halimbawa: STL-20261125-123456) lamang ang tinatanggap. Hindi maaaring mag-proceed kung hindi Ticket Number.');
      return;
    }

    setIsVerifying(true);
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: cleanTicket, ticketOnly: true })
      });
      await readApiResponse(response, 'Hindi ma-verify ang inyong Ticket Number.');
      setVerifiedReference(cleanTicket);
    } catch (verificationError) {
      setError(verificationError.message || 'Hindi ma-verify ang inyong Ticket Number.');
    } finally {
      setIsVerifying(false);
    }
  };

  const copySuggestedComment = async () => {
    setError('');
    try {
      await navigator.clipboard.writeText(task.suggestedComment);
      setCopiedComment(true);
      setTimeout(() => setCopiedComment(false), 2000);
    } catch (copyError) {
      setError(copyError.message || 'Could not copy the suggested comment.');
    }
  };

  const handleProofSelect = (file) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (!file) {
      setProofFile(null);
      setProofPreview(null);
      setIsPreviewLoading(false);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE) {
      setProofFile(null);
      setProofPreview(null);
      setIsPreviewLoading(false);
      setError('Pumili ng PNG, JPG, o WebP screenshot na hindi lalagpas sa 4 MB.');
      return;
    }

    setError('');
    setIsPreviewLoading(true);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setProofPreview(url);
    setProofFile(file);

    // Instant micro-load for smooth, zero-lag rendering
    setTimeout(() => {
      setIsPreviewLoading(false);
    }, 120);
  };

  const handleRemoveProof = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setProofFile(null);
    setProofPreview(null);
    setIsPreviewLoading(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!proofFile) {
      setError('Paki-upload ang isang screenshot proof ng inyong engagement sa post.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    setTaskUploadProgress({ step: 1, total: 2, message: 'Ina-upload ang inyong screenshot proof…' });

    try {
      const ticketToSubmit = verifiedReference || reference.trim().toUpperCase();
      const uploadResponse = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/proof`, {
        method: 'POST',
        headers: {
          'Content-Type': proofFile.type,
          'x-entry-reference': ticketToSubmit
        },
        body: proofFile
      });
      const proof = await readApiResponse(uploadResponse, 'Could not upload your task screenshot.');

      setTaskUploadProgress({ step: 2, total: 2, message: 'Sinusuri at itinatala ang inyong daily engagement task…' });

      const completionResponse = await fetch(`/api/tasks/${encodeURIComponent(task.id)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: ticketToSubmit, proof, ticketOnly: true })
      });
      const result = await readApiResponse(completionResponse, 'Could not submit your task proof.');
      setSubmissionResult(result);
      setSubmitted(true);
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setProofFile(null);
      setProofPreview(null);
    } catch (submitError) {
      setError(submitError.message || 'Could not submit your task proof. Please try again.');
    } finally {
      setIsSubmitting(false);
      setTaskUploadProgress({ step: 0, total: 2, message: '' });
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-3 sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="engagement-task-title"
        className="my-auto w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 bg-gradient-to-r from-blue-950 to-blue-700 px-5 py-5 text-white sm:px-7">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-blue-100">Daily Engagement Check</p>
            <h2 id="engagement-task-title" className="mt-1 text-xl font-black sm:text-2xl">
              {task?.id || 'Engagement task'}
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close task" className="rounded-lg p-2 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-5 sm:p-7">
          {isLoading && <p role="status" className="text-sm text-slate-600">Loading task…</p>}
          {!isLoading && !task && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error || 'This engagement task link is not available.'}
            </p>
          )}
          {task && (
            <>
              {task.instruction && <p className="text-sm leading-6 text-slate-700">{task.instruction}</p>}
              {!verifiedReference ? (
                <form onSubmit={verifyReference} className="space-y-4">
                  <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/80 p-4 text-xs text-blue-950 space-y-1.5 shadow-sm">
                    <p className="font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      📌 Paalala Bago Mag-Engage:
                    </p>
                    <p className="leading-relaxed font-medium">
                      Kailangang <strong>i-input muna ang inyong Ticket Number</strong> (na nakuha ninyo matapos i-follow at i-upload ang 3 opisyal na pages) bago magbukas ang post link para mai-record ang inyong engagement task proof.
                    </p>
                  </div>

                  <label className="block text-sm font-bold text-slate-800">
                    Opisyal na Ticket Number
                    <span className="ml-1 text-red-600">*</span>
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      I-type ang inyong opisyal na Ticket Number (halimbawa: STL-20261125-123456). Hindi maaaring mag-proceed kung hindi Ticket Number.
                    </span>
                    <input
                      value={reference}
                      onChange={(event) => {
                        setReference(event.target.value.toUpperCase());
                        if (error) setError('');
                      }}
                      required
                      maxLength="40"
                      autoComplete="off"
                      placeholder="STL-20261125-123456"
                      className="mt-2 w-full rounded-xl border border-slate-300 px-3.5 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 font-mono text-sm uppercase tracking-wider"
                    />
                  </label>
                  {error && (
                    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 font-medium">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={isVerifying || !reference.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-3.5 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm transition"
                  >
                    {isVerifying ? 'Kasalukuyang Vine-verify ang Ticket…' : 'I-verify ang Ticket Number Bago Mag-Proceed'}
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Na-verify ang Ticket Number:</p>
                        <p className="text-sm font-mono font-black text-emerald-950">{verifiedReference}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setVerifiedReference('');
                        handleRemoveProof();
                        setError('');
                      }}
                      className="text-xs font-bold text-emerald-800 underline hover:text-emerald-950"
                    >
                      Palitan
                    </button>
                  </div>
                  <a
                    href={task.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 py-4 text-base font-extrabold text-white hover:bg-blue-800"
                  >
                    Open Facebook Post <ExternalLink className="h-5 w-5" />
                  </a>

                  {task.suggestedComment && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">Suggested comment</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{task.suggestedComment}</p>
                      <button
                        type="button"
                        onClick={copySuggestedComment}
                        className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-900"
                      >
                        <Copy className="h-4 w-4" /> {copiedComment ? 'Copied' : 'Copy Suggested Comment'}
                      </button>
                    </div>
                  )}

                  {submitted ? (
                    <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                      <p className="mt-2 font-bold text-emerald-900">Proof submitted successfully.</p>
                      <p className="mt-1 text-sm text-emerald-800">
                        {submissionResult?.message || 'Naitala ang iyong submission. Siguraduhing makumpleto ang lahat ng daily tasks para maging kwalipikado sa raffle.'}
                      </p>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-bold text-slate-800">
                          Screenshot proof <span className="text-red-600">*</span>
                          <span className="mt-1 block text-xs font-normal text-slate-500">PNG, JPG, o WebP; maximum 4 MB.</span>
                          <input
                            key={verifiedReference}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            required={!proofFile}
                            disabled={isSubmitting}
                            onChange={(event) => handleProofSelect(event.target.files?.[0])}
                            className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-700 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-blue-800 file:cursor-pointer disabled:opacity-50"
                          />
                        </label>

                        {/* Loading animation while screenshot preview renders */}
                        {isPreviewLoading && (
                          <div className="flex items-center gap-2.5 rounded-xl border border-blue-200 bg-blue-50/80 p-3 text-xs text-blue-900 animate-pulse">
                            <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
                            <span className="font-semibold">Ipinapakita ang preview ng screenshot nang mabilis…</span>
                          </div>
                        )}

                        {/* Instant smooth thumbnail preview */}
                        {!isPreviewLoading && proofPreview && (
                          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5 shadow-sm">
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-emerald-300 bg-white">
                              <img
                                src={proofPreview}
                                alt="Task Screenshot Proof"
                                className="h-full w-full object-cover transition hover:scale-105"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                <span className="truncate">Handa na ang screenshot proof</span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] font-mono text-slate-700">
                                {proofFile?.name}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                {proofFile ? `${(proofFile.size / (1024 * 1024)).toFixed(2)} MB • Handa nang i-submit` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={handleRemoveProof}
                              disabled={isSubmitting}
                              title="Alisin o palitan ang screenshot"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Loading animation card while submitting */}
                      {isSubmitting && (
                        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/90 p-4 text-center space-y-2.5 shadow-sm">
                          <div className="flex items-center justify-center gap-2 text-emerald-900">
                            <Loader2 className="h-6 w-6 animate-spin text-emerald-700" />
                            <span className="font-extrabold text-sm">Pinoproseso ang inyong task submission…</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs font-bold text-emerald-900 px-1">
                              <span>Hakbang {taskUploadProgress.step} ng {taskUploadProgress.total}</span>
                              <span>{Math.round((taskUploadProgress.step / taskUploadProgress.total) * 100)}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-emerald-200">
                              <div
                                className="h-full bg-emerald-600 transition-all duration-300 ease-out"
                                style={{ width: `${(taskUploadProgress.step / taskUploadProgress.total) * 100}%` }}
                              />
                            </div>
                          </div>
                          <p className="text-xs font-medium text-emerald-800 animate-pulse">
                            {taskUploadProgress.message}
                          </p>
                        </div>
                      )}

                      {error && (
                        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                          {error}
                        </p>
                      )}
                      <button
                        type="submit"
                        disabled={isSubmitting || !proofFile}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3.5 text-sm font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 shadow-sm transition"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{taskUploadProgress.message || 'Kasalukuyang isinusumite…'}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4" />
                            <span>Submit screenshot proof</span>
                            <ArrowUpRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
