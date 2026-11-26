import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  QrCode, 
  Share2, 
  Smartphone, 
  Download, 
  MessageCircle, 
  Sparkles, 
  Send 
} from 'lucide-react';

function FacebookIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}

export default function ShareModal({ onClose, customUrl = '' }) {
  const [activeTab, setActiveTab] = useState('choice'); // 'choice', 'qr', 'link'
  const [copied, setCopied] = useState(false);
  
  // Siguraduhing laging sa LANDING PAGE (/) pupunta ang share link, hindi sa /admin
  const getLandingUrl = () => {
    if (customUrl) return customUrl;
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/`;
    }
    return 'https://stl-raffle-campaign.vercel.app/';
  };
  const shareUrl = getLandingUrl();
  const shareTitle = '🌾 STL Community Rice Raffle | Manalo ng 5kg & 25kg Bigas!';
  const shareDescription = 'Sumali sa opisyal na STL Community Rice Raffle! 6 Maswerteng Winners ng Bigas (5kg at 25kg). I-click ang link o i-scan ang QR code gamit ang phone camera para mag-proceed sa browser at makuha ang iyong raffle ticket!';

  // QR Code generator URL (350x350 high quality, 10 margin)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(shareUrl)}&margin=12&format=png`;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  const handleDownloadQr = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'stl-raffle-qrcode.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // Direct open fallback if blob download is blocked
      window.open(qrCodeUrl, '_blank');
    }
  };

  const shareToFacebook = () => {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareTitle)}`;
    window.open(fbUrl, '_blank', 'width=600,height=500');
  };

  const shareToMessenger = () => {
    const messengerUrl = `fb-messenger://share/?link=${encodeURIComponent(shareUrl)}`;
    window.open(messengerUrl, '_blank');
  };

  const shareToTelegram = () => {
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
    window.open(tgUrl, '_blank');
  };

  const shareToWhatsApp = () => {
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareTitle} ${shareUrl}`)}`;
    window.open(waUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-blue-900 via-blue-800 to-red-700 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md shadow-inner text-amber-300">
              <Share2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-black tracking-tight sm:text-xl flex items-center gap-2">
                I-share ang Landing Page
                <span className="text-[10px] bg-amber-400 text-blue-950 px-2 py-0.5 rounded-full font-black uppercase tracking-wider">
                  2 Choices
                </span>
              </h2>
              <p className="text-xs text-blue-100 font-medium">
                Pumili: I-scan ang QR code o Pindutin ang direct link para mag-proceed sa browser
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            title="Isara"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* DUAL CHOICE OPTIONS BANNER */}
          <div>
            <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Pumili ng Paraan para I-share o Salihan:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Option 1: QR Code Card */}
              <button
                type="button"
                onClick={() => setActiveTab('qr')}
                className={`flex flex-col text-left p-4 rounded-2xl border-2 transition-all ${
                  activeTab === 'qr'
                    ? 'border-blue-600 bg-blue-50/60 shadow-md ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`p-2.5 rounded-xl ${activeTab === 'qr' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <QrCode className="w-6 h-6" />
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                      Option A
                    </span>
                    <h3 className="text-sm font-black text-slate-900 mt-0.5">I-scan ang QR Code</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                  Gamitin ang camera ng cellphone. Itapat lang sa QR code at kusang bubukas ang raffle portal sa mobile browser.
                </p>
              </button>

              {/* Option 2: Direct Link Card */}
              <button
                type="button"
                onClick={() => setActiveTab('link')}
                className={`flex flex-col text-left p-4 rounded-2xl border-2 transition-all ${
                  activeTab === 'link'
                    ? 'border-emerald-600 bg-emerald-50/60 shadow-md ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`p-2.5 rounded-xl ${activeTab === 'link' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                    <ExternalLink className="w-6 h-6" />
                  </span>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      Option B
                    </span>
                    <h3 className="text-sm font-black text-slate-900 mt-0.5">Pindutin / Kopyahin ang Link</h3>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                  1-click copy ng link para mai-paste sa Facebook, Messenger, Viber, o pindutin para magbukas agad sa browser.
                </p>
              </button>
            </div>
          </div>

          {/* TAB 1: QR CODE DISPLAY SECTION */}
          {(activeTab === 'qr' || activeTab === 'choice') && (
            <div className="rounded-2xl border border-blue-200 bg-gradient-to-b from-blue-50/50 to-white p-5">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* QR Image Box */}
                <div className="relative group shrink-0">
                  <div className="p-3 bg-white rounded-2xl shadow-md border-2 border-blue-600/30">
                    <img
                      src={qrCodeUrl}
                      alt="STL Raffle QR Code"
                      className="w-48 h-48 sm:w-44 sm:h-44 object-contain rounded-lg"
                      loading="lazy"
                    />
                  </div>
                  <span className="absolute -bottom-2 -right-2 bg-amber-400 text-blue-950 text-[10px] font-black px-2 py-0.5 rounded-md shadow-sm border border-amber-500">
                    HD QR
                  </span>
                </div>

                {/* Instructions & Download Button */}
                <div className="flex-1 text-center sm:text-left space-y-3">
                  <div>
                    <h4 className="text-base font-black text-slate-900 flex items-center justify-center sm:justify-start gap-2">
                      <Smartphone className="w-4 h-4 text-blue-700" />
                      Paano gamitin ang QR Code:
                    </h4>
                    <ol className="text-xs text-slate-600 mt-2 space-y-1.5 list-decimal list-inside font-medium leading-relaxed">
                      <li>Buksan ang <strong>Camera</strong> ng iyong smartphone.</li>
                      <li>Itapat ang camera sa QR code sa kaliwa.</li>
                      <li>Pindutin ang lalabas na yellow o blue link notification para mag-proceed diretso sa browser!</li>
                    </ol>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                    <button
                      type="button"
                      onClick={handleDownloadQr}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-800 shadow-sm transition"
                    >
                      <Download className="w-4 h-4" />
                      I-download ang QR Image (PNG)
                    </button>
                    <button
                      type="button"
                      onClick={() => window.open(shareUrl, '_blank')}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Subukan sa Browser
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LINK COPY & SOCIAL SHARE SECTION */}
          {(activeTab === 'link' || activeTab === 'choice') && (
            <div className="rounded-2xl border border-emerald-200 bg-gradient-to-b from-emerald-50/40 to-white p-5 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Direct Landing Page URL:
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      readOnly
                      value={shareUrl}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-3 text-xs sm:text-sm font-mono text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-black shadow-sm transition ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Nakopya na!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Kopyahin ang Link
                      </>
                    )}
                  </button>
                </div>
                {copied && (
                  <p className="text-xs font-bold text-emerald-700 mt-2 flex items-center gap-1.5 animate-fadeIn">
                    <Check className="w-4 h-4" />
                    Matagumpay na nakopya! Pwede mo na i-paste sa Facebook, Messenger, Viber o SMS.
                  </p>
                )}
              </div>

              {/* Direct Social Media Sharing Buttons */}
              <div className="pt-2 border-t border-emerald-100">
                <p className="text-xs font-bold text-slate-600 mb-2.5">
                  O I-share nang Diretso sa:
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={shareToFacebook}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1877F2] text-white text-xs font-bold hover:bg-[#166fe5] transition shadow-sm"
                  >
                    <FacebookIcon className="w-3.5 h-3.5" /> Facebook
                  </button>
                  <button
                    type="button"
                    onClick={shareToMessenger}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00B2FF] to-[#006AFF] text-white text-xs font-bold hover:opacity-95 transition shadow-sm"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Messenger
                  </button>
                  <button
                    type="button"
                    onClick={shareToTelegram}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#229ED9] text-white text-xs font-bold hover:bg-[#1f8ec4] transition shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" /> Telegram
                  </button>
                  <button
                    type="button"
                    onClick={shareToWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#25D366] text-white text-xs font-bold hover:bg-[#20ba5a] transition shadow-sm"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => window.open(shareUrl, '_blank')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition ml-auto"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Buksan sa Browser
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* REALISTIC SOCIAL MEDIA PREVIEW SIMULATION CARD */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Live Link Preview (Lalabas pag ipinaste mo sa Facebook / Messenger):
              </span>
              <span className="text-[11px] font-bold text-slate-400">
                May Kasamang Image &amp; Description
              </span>
            </div>

            {/* Mock Facebook / Social Post Card */}
            <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-md transition hover:shadow-lg">
              {/* Enticing Banner Image */}
              <div className="relative aspect-[16/9] w-full bg-slate-900 overflow-hidden">
                <img
                  src="/images/share-preview.jpg"
                  alt="STL Community Rice Raffle"
                  className="w-full h-full object-cover object-center"
                />
                <div className="absolute top-3 left-3 bg-blue-700 text-white text-[11px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider shadow-md border border-white/40 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-300 animate-ping" />
                  STL Raffle
                </div>
                <div className="absolute bottom-3 right-3 bg-black/75 backdrop-blur-md text-amber-300 text-xs font-extrabold px-3 py-1 rounded-lg border border-amber-400/30 shadow-md">
                  🌾 5kg &amp; 25kg Rice Prizes
                </div>
              </div>

              {/* Rich Link Meta Info */}
              <div className="p-4 bg-slate-50 border-t border-slate-200">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {typeof window !== 'undefined' ? window.location.hostname.toUpperCase() : 'STL-COMMUNITY-RAFFLE.COM'}
                </p>
                <h4 className="mt-1 text-sm sm:text-base font-black text-slate-950 leading-snug line-clamp-2">
                  🌾 STL Community Rice Raffle | 6 Maswerteng Winners ng Bigas!
                </h4>
                <p className="mt-1 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  Sumali sa opisyal na STL Community Rice Raffle! May tsansang manalo ng 5kg at 25kg na bigas. I-scan ang QR code o pindutin ang link para mag-proceed sa portal!
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 font-medium">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Verified Open Graph &amp; Twitter Card tags enabled.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition"
          >
            Isara
          </button>
        </div>
      </div>
    </div>
  );
}
