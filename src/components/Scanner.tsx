import { useState, useRef, useEffect, useCallback } from 'react';
import jsQR from 'jsqr';
import { Camera, Upload, Link, X, AlertCircle, Loader2 } from 'lucide-react';
import { parseMigrationUrl, parseOtpauthUrl, type NewAccount } from '../lib/migration';

type ScanMode = 'upload' | 'camera' | 'paste';

interface ScannerProps {
  onImport: (accounts: NewAccount[]) => void;
  onClose: () => void;
}

export default function Scanner({ onImport, onClose }: ScannerProps) {
  const [mode, setMode] = useState<ScanMode>('upload');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pasteUrl, setPasteUrl] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [processing, setProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);

  // Process QR data
  const processQrData = useCallback((data: string) => {
    setError(null);
    setProcessing(true);

    try {
      if (data.startsWith('otpauth-migration://')) {
        const accounts = parseMigrationUrl(data);
        onImport(accounts);
        return;
      }

      if (data.startsWith('otpauth://')) {
        const account = parseOtpauthUrl(data);
        if (account) {
          onImport([account]);
          return;
        }
        throw new Error('Failed to parse otpauth URL');
      }

      throw new Error('Unrecognized QR code format. Expected otpauth-migration:// or otpauth:// URL.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process QR code');
      setProcessing(false);
    }
  }, [onImport]);

  // Scan image data for QR codes
  const scanImageData = useCallback((imageData: ImageData): boolean => {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    });
    if (code && code.data) {
      processQrData(code.data);
      return true;
    }
    return false;
  }, [processQrData]);

  // ── Camera Scanning ──────────────────────────────────────────────────────

  useEffect(() => {
    if (mode !== 'camera') return;

    let animFrameId: number;
    let mounted = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
          scanningRef.current = true;

          const scanFrame = () => {
            if (!scanningRef.current || !videoRef.current || !canvasRef.current) return;

            const video = videoRef.current;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
              animFrameId = requestAnimationFrame(scanFrame);
              return;
            }

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = scanImageData(imageData);

            if (!found) {
              animFrameId = requestAnimationFrame(scanFrame);
            }
          };

          animFrameId = requestAnimationFrame(scanFrame);
        }
      } catch {
        if (mounted) {
          setError('Camera access denied. Please allow camera access or try uploading an image.');
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
      scanningRef.current = false;
      cancelAnimationFrame(animFrameId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
    };
  }, [mode, scanImageData]);

  // ── Image Upload ─────────────────────────────────────────────────────────

  const handleImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setError(null);
    setProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          setError('Failed to process image');
          setProcessing(false);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = scanImageData(imageData);
        if (!found) {
          setError('No QR code found in image. Make sure the QR code is clearly visible.');
          setProcessing(false);
        }
      };
      img.onerror = () => {
        setError('Failed to load image');
        setProcessing(false);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // ── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  // ── Paste URL ────────────────────────────────────────────────────────────

  const handlePasteImport = () => {
    const url = pasteUrl.trim();
    if (!url) {
      setError('Please enter a URL');
      return;
    }
    processQrData(url);
  };

  // ── Tab Config ───────────────────────────────────────────────────────────

  const tabs: { id: ScanMode; icon: React.ReactNode; label: string }[] = [
    { id: 'upload', icon: <Upload size={16} />, label: 'Upload' },
    { id: 'camera', icon: <Camera size={16} />, label: 'Camera' },
    { id: 'paste', icon: <Link size={16} />, label: 'Paste URL' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
         style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md bg-[#0f1019] border border-gray-800/60 rounded-2xl shadow-2xl animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60">
          <h2 className="text-lg font-semibold text-white">Import Accounts</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800/60">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setMode(tab.id); setError(null); setProcessing(false); }}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                mode === tab.id
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Upload Mode */}
          {mode === 'upload' && (
            <div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-gray-700/60 hover:border-gray-600 bg-gray-900/40'
                }`}
              >
                <div className="w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <Upload size={24} className="text-indigo-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-300">
                    Drop QR code image here or click to browse
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Supports PNG, JPG, and other image formats
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                }}
              />
            </div>
          )}

          {/* Camera Mode */}
          {mode === 'camera' && (
            <div>
              <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  playsInline
                  muted
                />
                <canvas ref={canvasRef} className="hidden" />

                {cameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Scanning overlay */}
                    <div className="w-48 h-48 border-2 border-indigo-400/60 rounded-2xl relative">
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
                    </div>
                  </div>
                )}

                {!cameraActive && !error && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={32} className="text-indigo-400 animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center mt-3">
                Point your camera at a Google Authenticator export QR code
              </p>
            </div>
          )}

          {/* Paste URL Mode */}
          {mode === 'paste' && (
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-400 mb-1.5 block">
                  Migration URL
                </label>
                <textarea
                  value={pasteUrl}
                  onChange={e => { setPasteUrl(e.target.value); setError(null); }}
                  placeholder="otpauth-migration://offline?data=... or otpauth://totp/..."
                  rows={4}
                  className="w-full bg-gray-900/60 border border-gray-700/60 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 resize-none font-mono"
                />
              </div>
              <button
                onClick={handlePasteImport}
                disabled={!pasteUrl.trim() || processing}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {processing ? 'Processing...' : 'Import'}
              </button>
              <p className="text-xs text-gray-500">
                Paste a Google Authenticator export URL or a standard otpauth:// URI
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <AlertCircle size={18} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
