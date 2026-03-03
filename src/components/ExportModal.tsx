import { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, QrCode } from 'lucide-react';
import { getOtpauthUri, type OTPAccount } from '../lib/migration';

interface ExportModalProps {
  account: OTPAccount;
  onClose: () => void;
}

export default function ExportModal({ account, onClose }: ExportModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const uri = getOtpauthUri(account);

  useEffect(() => {
    QRCode.toDataURL(uri, {
      width: 280,
      margin: 2,
      color: {
        dark: '#ffffffff',
        light: '#00000000',
      },
      errorCorrectionLevel: 'M',
    }).then(setQrDataUrl).catch(console.error);
  }, [uri]);

  const handleCopyUri = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-[#0f1019] border border-gray-800/60 rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60">
          <div className="flex items-center gap-2.5">
            <QrCode size={20} className="text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Export Account</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col items-center">
          {/* Account Info */}
          <div className="text-center mb-4">
            <p className="text-sm font-semibold text-white">
              {account.issuer || 'Unknown'}
            </p>
            <p className="text-xs text-gray-400">{account.name}</p>
          </div>

          {/* QR Code */}
          <div className="bg-white/5 border border-gray-700/40 rounded-xl p-4 mb-5">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code" className="w-64 h-64" />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          {/* URI */}
          <div className="w-full">
            <label className="text-xs font-medium text-gray-500 mb-1 block">otpauth:// URI</label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={uri}
                className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-300 font-mono truncate focus:outline-none"
              />
              <button
                onClick={handleCopyUri}
                className="shrink-0 px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700/50 rounded-lg text-sm text-gray-300 transition-colors flex items-center gap-1.5"
              >
                {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center mt-4">
            Scan this QR code with any authenticator app to import this account.
          </p>
        </div>
      </div>
    </div>
  );
}
