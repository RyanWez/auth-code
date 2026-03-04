import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Plus, ScanLine, Trash2, QrCode, Copy, Check,
  KeyRound, X, ChevronDown, Lock, Unlock, LogOut, Users, Loader2, GripVertical
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  type OTPAccount, type NewAccount,
  generateCode, parseMigrationUrl, parseOtpauthUrl
} from './lib/migration';
import { saveAccounts, loadAccounts, saveSharedAccounts, loadSharedAccounts, subscribeToSharedAccounts, getCachedAccounts } from './lib/storage';
import { useAuth } from './lib/auth';
import Scanner from './components/Scanner';
import ExportModal from './components/ExportModal';
import LoginPage from './components/LoginPage';
import AdminPanel from './components/AdminPanel';

// ── Helpers ────────────────────────────────────────────────────────────────

function getAvatarColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16',
    '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
    '#6366f1', '#8b5cf6', '#a855f7', '#ec4899',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function formatCode(code: string): string {
  if (code.length === 8) return `${code.slice(0, 4)} ${code.slice(4)}`;
  if (code.length === 6) return `${code.slice(0, 3)} ${code.slice(3)}`;
  return code;
}

// ── AccountCard Component ──────────────────────────────────────────────────

function AccountCard({
  account,
  timeLeft,
  progress,
  onDelete,
  onExport,
  readOnly = false,
  dragListeners,
  dragAttributes,
}: {
  account: OTPAccount;
  timeLeft: number;
  progress: number;
  onDelete: (id: string) => void;
  onExport: (account: OTPAccount) => void;
  readOnly?: boolean;
  dragListeners?: any;
  dragAttributes?: any;
}) {
  const [code, setCode] = useState(() => generateCode(account));
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const prevPeriodRef = useRef(Math.floor(Date.now() / ((account.period || 30) * 1000)));

  // Regenerate code when period changes
  useEffect(() => {
    const period = account.period || 30;
    const currentPeriod = Math.floor(Date.now() / (period * 1000));
    if (currentPeriod !== prevPeriodRef.current) {
      prevPeriodRef.current = currentPeriod;
      setCode(generateCode(account));
    }
  }, [account, timeLeft]);

  // Generate initial code
  useEffect(() => {
    setCode(generateCode(account));
  }, [account]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleDelete = () => {
    if (confirmDelete) {
      onDelete(account.id);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  const circumference = 2 * Math.PI * 14;
  const isLow = timeLeft <= 5;
  const displayName = account.issuer || account.name || 'Unknown';

  return (
    <div className="group relative bg-gray-900/50 hover:bg-gray-900/80 border border-gray-800/50 hover:border-gray-700/60 rounded-xl transition-all duration-200 animate-fade-in-up">
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-3">
          {/* Drag Handle (if not readonly and no active search) */}
          {!readOnly && dragListeners && (
            <div
              {...dragAttributes}
              {...dragListeners}
              className="mt-2.5 cursor-grab active:cursor-grabbing text-gray-600 hover:text-white transition-colors touch-none"
            >
              <GripVertical size={16} />
            </div>
          )}

          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5"
            style={{ backgroundColor: getAvatarColor(displayName) + '22', color: getAvatarColor(displayName) }}
          >
            {displayName[0]?.toUpperCase() || '?'}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                  {account.issuer || 'No Issuer'}
                </p>
                <p className="text-xs text-gray-500 truncate">{account.name}</p>
              </div>

              {/* Actions toggle — only for non-readOnly */}
              {!readOnly && (
                <button
                  onClick={() => setShowActions(!showActions)}
                  className="p-1 rounded-md text-gray-600 hover:text-gray-400 hover:bg-gray-800/60 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <ChevronDown size={16} className={`transition-transform ${showActions ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>

            {/* Code */}
            <div className="flex items-center gap-3 mt-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 group/code"
                title="Click to copy"
              >
                <span className={`font-mono text-2xl font-bold tracking-[0.15em] transition-colors ${isLow ? 'text-orange-400' : 'text-white'
                  }`}>
                  {formatCode(code)}
                </span>
                <span className="opacity-0 group-hover/code:opacity-100 transition-opacity">
                  {copied ? (
                    <Check size={16} className="text-emerald-400" />
                  ) : (
                    <Copy size={16} className="text-gray-500" />
                  )}
                </span>
              </button>

              <div className="ml-auto shrink-0">
                {/* Circular Timer */}
                <svg width="36" height="36" viewBox="0 0 36 36" className="block">
                  <circle
                    cx="18" cy="18" r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-gray-800/60"
                  />
                  <circle
                    cx="18" cy="18" r="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * progress}
                    className={isLow ? 'text-orange-500' : 'text-indigo-500'}
                    transform="rotate(-90 18 18)"
                  />
                  <text
                    x="18" y="18"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`text-[10px] font-bold fill-current ${isLow ? 'text-orange-400' : 'text-gray-400'}`}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {timeLeft}
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons — only for non-readOnly */}
        {!readOnly && showActions && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800/40 animate-fade-in">
            <button
              onClick={() => { onExport(account); setShowActions(false); }}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-gray-800/40 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <QrCode size={13} />
              Export QR
            </button>
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-gray-400 hover:text-white bg-gray-800/40 hover:bg-gray-800 rounded-lg transition-colors"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
            <button
              onClick={handleDelete}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${confirmDelete
                ? 'text-white bg-red-600 hover:bg-red-500'
                : 'text-gray-400 hover:text-red-400 bg-gray-800/40 hover:bg-red-500/10'
                }`}
            >
              <Trash2 size={13} />
              {confirmDelete ? 'Confirm' : 'Delete'}
            </button>
          </div>
        )}

        {/* Copied Toast */}
        {copied && (
          <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-xs font-medium px-2.5 py-1 rounded-lg animate-toast">
            Copied!
          </div>
        )}
      </div>
    </div>
  );
}

// ── AddAccountModal Component ──────────────────────────────────────────────

function AddAccountModal({
  onAdd,
  onClose,
}: {
  onAdd: (account: NewAccount) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [secret, setSecret] = useState('');
  const [algorithm, setAlgorithm] = useState<'SHA1' | 'SHA256' | 'SHA512'>('SHA1');
  const [digits, setDigits] = useState(6);
  const [period, setPeriod] = useState(30);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
    if (!cleanSecret) {
      setError('Secret key is required');
      return;
    }

    if (!/^[A-Z2-7]+=*$/.test(cleanSecret)) {
      setError('Invalid Base32 secret. Use only A-Z and 2-7.');
      return;
    }

    onAdd({
      name: name.trim() || 'Unknown Account',
      issuer: issuer.trim(),
      secretBase32: cleanSecret,
      algorithm,
      digits,
      type: 'totp',
      counter: 0,
      period,
    });
  };

  const inputClass =
    'w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-colors';
  const labelClass = 'text-xs font-medium text-gray-400 mb-1 block';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm bg-[#0f1019] border border-gray-800/60 rounded-2xl shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800/60">
          <div className="flex items-center gap-2.5">
            <KeyRound size={20} className="text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Add Account</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={labelClass}>Issuer (optional)</label>
            <input
              type="text"
              value={issuer}
              onChange={e => setIssuer(e.target.value)}
              placeholder="Google, GitHub, etc."
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Account Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="user@example.com"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Secret Key (Base32) *</label>
            <input
              type="text"
              value={secret}
              onChange={e => { setSecret(e.target.value); setError(null); }}
              placeholder="JBSWY3DPEHPK3PXP"
              className={`${inputClass} font-mono tracking-wide`}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Algorithm</label>
              <select
                value={algorithm}
                onChange={e => setAlgorithm(e.target.value as 'SHA1' | 'SHA256' | 'SHA512')}
                className={inputClass}
              >
                <option value="SHA1">SHA-1</option>
                <option value="SHA256">SHA-256</option>
                <option value="SHA512">SHA-512</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Digits</label>
              <select
                value={digits}
                onChange={e => setDigits(Number(e.target.value))}
                className={inputClass}
              >
                <option value={6}>6</option>
                <option value={8}>8</option>
              </select>
            </div>

            <div>
              <label className={labelClass}>Period</label>
              <select
                value={period}
                onChange={e => setPeriod(Number(e.target.value))}
                className={inputClass}
              >
                <option value={30}>30s</option>
                <option value={60}>60s</option>
                <option value={90}>90s</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Add Account
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Toast Component ────────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error' | 'info'; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  const colors = {
    success: 'bg-emerald-500/90 border-emerald-400/30',
    error: 'bg-red-500/90 border-red-400/30',
    info: 'bg-indigo-500/90 border-indigo-400/30',
  };

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-white text-sm font-medium shadow-xl border animate-toast ${colors[type]}`}>
      {message}
    </div>
  );
}

// ── SortableAccountWrapper ───────────────────────────────────────────────────

function SortableAccountWrapper({ account, timeLeft, progress, onDelete, onExport, readOnly }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  if (isDragging) {
    return (
      <div ref={setNodeRef} style={style} className="opacity-40 scale-95 border-2 border-dashed border-indigo-500/40 bg-indigo-500/5 rounded-xl transition-all duration-200 pointer-events-none">
        <div className="invisible">
          <AccountCard account={account} timeLeft={timeLeft} progress={progress} onDelete={onDelete} onExport={onExport} readOnly={readOnly} />
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}>
      <AccountCard
        account={account}
        timeLeft={timeLeft}
        progress={progress}
        onDelete={onDelete}
        onExport={onExport}
        readOnly={readOnly}
        dragListeners={listeners}
        dragAttributes={attributes}
      />
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────

export default function App() {
  const { user, role, loading: authLoading, logout } = useAuth();

  const cachedAccounts = getCachedAccounts();
  const [accounts, setAccounts] = useState<OTPAccount[]>(cachedAccounts);
  const [showScanner, setShowScanner] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [exportAccount, setExportAccount] = useState<OTPAccount | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [loaded, setLoaded] = useState(cachedAccounts.length > 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const isSuperAdmin = role === 'super_admin';
  const isReadOnly = role === 'user';

  // Sortable sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 150, tolerance: 5 }, // brief delay distinguishes click from drag
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load accounts on mount — refresh from Supabase in background
  useEffect(() => {
    if (!user || !role) return;

    const load = async () => {
      // Try loading from shared Supabase
      const shared = await loadSharedAccounts();
      if (shared.length > 0) {
        setAccounts(shared);
      } else if (isSuperAdmin) {
        // Fallback: Super Admin may have local-only data from before
        const local = await loadAccounts();
        setAccounts(local);
        if (local.length > 0) {
          await saveSharedAccounts(local);
        }
      }
      setLoaded(true);
    };

    load();
  }, [user, role, isSuperAdmin]);

  // Realtime subscription for regular users — live updates when Super Admin changes accounts
  useEffect(() => {
    if (!user || !role) return;

    const unsub = subscribeToSharedAccounts((updatedAccounts) => {
      setAccounts(updatedAccounts);
    });

    return () => unsub();
  }, [user, role]);

  // Timer
  useEffect(() => {
    const update = () => {
      const now = Date.now() / 1000;
      const remaining = Math.ceil(30 - (now % 30));
      const prog = (now % 30) / 30;
      setTimeLeft(remaining);
      setProgress(prog);
    };

    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, []);

  // Save accounts when they change — Super Admin saves to both local + shared Supabase
  const persistAccounts = useCallback(async (newAccounts: OTPAccount[]) => {
    setAccounts(newAccounts);
    if (isSuperAdmin) {
      saveAccounts(newAccounts);       // Local encrypted backup
      const ok = await saveSharedAccounts(newAccounts); // Shared Supabase for all users
      if (!ok) {
        setToast({ message: 'Cloud sync failed — check Supabase SQL setup', type: 'error' });
      }
    }
  }, [isSuperAdmin]);

  // Show toast
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  // Import accounts from scanner
  const handleImport = useCallback((newAccounts: NewAccount[]) => {
    const accountsWithIds: OTPAccount[] = newAccounts.map(a => ({
      ...a,
      id: crypto.randomUUID(),
    }));

    // Check for duplicates
    const existing = new Set(accounts.map(a => `${a.issuer}:${a.name}:${a.secretBase32}`));
    const unique = accountsWithIds.filter(a => !existing.has(`${a.issuer}:${a.name}:${a.secretBase32}`));

    if (unique.length === 0) {
      showToast('All accounts already exist', 'info');
    } else {
      const updated = [...accounts, ...unique];
      persistAccounts(updated);
      showToast(`Imported ${unique.length} account${unique.length > 1 ? 's' : ''}`, 'success');
    }

    setShowScanner(false);
  }, [accounts, persistAccounts, showToast]);

  // Add manual account
  const handleAddAccount = useCallback((account: NewAccount) => {
    const newAccount: OTPAccount = {
      ...account,
      id: crypto.randomUUID(),
    };
    const updated = [...accounts, newAccount];
    persistAccounts(updated);
    showToast('Account added successfully', 'success');
    setShowAddModal(false);
  }, [accounts, persistAccounts, showToast]);

  // Delete account
  const handleDeleteAccount = useCallback((id: string) => {
    const updated = accounts.filter(a => a.id !== id);
    persistAccounts(updated);
    showToast('Account deleted', 'info');
  }, [accounts, persistAccounts, showToast]);

  // Handle paste event for quick import (only for super admin)
  useEffect(() => {
    if (isReadOnly) return;

    const handlePaste = (e: ClipboardEvent) => {
      if (showScanner || showAddModal || exportAccount) return;
      const text = e.clipboardData?.getData('text')?.trim();
      if (!text) return;

      if (text.startsWith('otpauth-migration://')) {
        e.preventDefault();
        try {
          const decoded = parseMigrationUrl(text);
          handleImport(decoded);
        } catch (err) {
          showToast(err instanceof Error ? err.message : 'Failed to import', 'error');
        }
      } else if (text.startsWith('otpauth://')) {
        e.preventDefault();
        const account = parseOtpauthUrl(text);
        if (account) {
          handleImport([account]);
        } else {
          showToast('Failed to parse otpauth URL', 'error');
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isReadOnly, showScanner, showAddModal, exportAccount, handleImport, showToast]);

  // Filter accounts
  const filteredAccounts = searchQuery
    ? accounts.filter(a =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.issuer.toLowerCase().includes(searchQuery.toLowerCase())
    )
    : accounts;

  // Handle Drag & Drop events
  const handleDragStart = useCallback((event: DragEndEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = accounts.findIndex((i) => i.id === active.id);
      const newIndex = accounts.findIndex((i) => i.id === over.id);
      const newItems = arrayMove(accounts, oldIndex, newIndex);
      persistAccounts(newItems);
    }
  }, [accounts, persistAccounts]);

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null);
  }, []);

  const dropAnimationConfig = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: {
        active: {
          opacity: '0.4',
        },
      },
    }),
  };

  // ── Auth Loading State ───────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#06060e] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-14 h-14 bg-indigo-600/15 border border-indigo-500/20 rounded-2xl flex items-center justify-center">
            <Shield size={28} className="text-indigo-400" />
          </div>
          <Loader2 size={24} className="text-indigo-400 animate-spin" />
        </div>
      </div>
    );
  }

  // ── Not Logged In ────────────────────────────────────────────────────────
  if (!user || !role) {
    return <LoginPage />;
  }

  // ── Main App (Authenticated) ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#06060e] text-white">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-indigo-600/5 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <header className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600/15 border border-indigo-500/20 rounded-xl flex items-center justify-center">
                <Shield size={22} className="text-indigo-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">Auth Vault</h1>
                <p className="text-xs text-gray-500">
                  {isSuperAdmin ? (
                    <span className="text-amber-400/80">Super Admin</span>
                  ) : (
                    <span>{user.email}</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Admin-only buttons */}
              {isSuperAdmin && (
                <>
                  <button
                    onClick={() => setShowAdminPanel(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/20 text-amber-400 hover:text-amber-300 text-xs font-medium rounded-lg transition-all"
                    title="Admin Panel"
                  >
                    <Users size={15} />
                    <span className="hidden sm:inline">Admin</span>
                  </button>
                  <button
                    onClick={() => setShowScanner(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/15 hover:bg-indigo-600/25 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 text-xs font-medium rounded-lg transition-all"
                    title="Import from QR code"
                  >
                    <ScanLine size={15} />
                    <span className="hidden sm:inline">Import</span>
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/40 text-gray-400 hover:text-white text-xs font-medium rounded-lg transition-all"
                    title="Add account manually"
                  >
                    <Plus size={15} />
                    <span className="hidden sm:inline">Add</span>
                  </button>
                </>
              )}

              {/* Logout button */}
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-800/40 hover:bg-red-600/15 border border-gray-700/30 hover:border-red-500/20 text-gray-500 hover:text-red-400 text-xs font-medium rounded-lg transition-all"
                title="Sign out"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </header>

        {/* Encryption Badge */}
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-emerald-500/5 border border-emerald-500/15 rounded-lg">
          <Lock size={13} className="text-emerald-500" />
          <span className="text-xs text-emerald-400/80">
            {isSuperAdmin
              ? `AES-256-GCM encrypted storage • ${accounts.length} account${accounts.length !== 1 ? 's' : ''}`
              : `${accounts.length} account${accounts.length !== 1 ? 's' : ''} • View & Copy only`
            }
          </span>
        </div>

        {/* Search */}
        {accounts.length > 3 && (
          <div className="mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search accounts..."
              className="w-full bg-gray-900/40 border border-gray-800/50 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 transition-all"
            />
          </div>
        )}

        {/* Account List */}
        {loaded && accounts.length > 0 && (
          <div className="space-y-2.5">
            {searchQuery || isReadOnly ? (
              // Non-sortable list when searching or if the user is read-only
              filteredAccounts.map((account, index) => (
                <div key={account.id} style={{ animationDelay: `${index * 50}ms` }}>
                  <AccountCard
                    account={account}
                    timeLeft={timeLeft}
                    progress={progress}
                    onDelete={handleDeleteAccount}
                    onExport={setExportAccount}
                    readOnly={isReadOnly}
                  />
                </div>
              ))
            ) : (
              // Sortable list when not searching and user is Super Admin
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
              >
                <SortableContext items={accounts.map(a => a.id)} strategy={verticalListSortingStrategy}>
                  {accounts.map((account) => (
                    <SortableAccountWrapper
                      key={account.id}
                      account={account}
                      timeLeft={timeLeft}
                      progress={progress}
                      onDelete={handleDeleteAccount}
                      onExport={setExportAccount}
                      readOnly={isReadOnly}
                    />
                  ))}
                </SortableContext>

                <DragOverlay dropAnimation={dropAnimationConfig}>
                  {activeDragId ? (
                    <div className="shadow-2xl shadow-indigo-600/30 ring-2 ring-indigo-500/60 rounded-xl scale-[1.03] cursor-grabbing transition-transform" style={{ filter: 'brightness(1.1)' }}>
                      <AccountCard
                        account={accounts.find(a => a.id === activeDragId)!}
                        timeLeft={timeLeft}
                        progress={progress}
                        onDelete={handleDeleteAccount}
                        onExport={setExportAccount}
                        readOnly={isReadOnly}
                        dragListeners={null}
                        dragAttributes={null}
                      />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}

            {filteredAccounts.length === 0 && searchQuery && (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500">No accounts match "{searchQuery}"</p>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {loaded && accounts.length === 0 && (
          <div className="text-center py-16 animate-fade-in-up">
            <div className="w-20 h-20 bg-gray-900/60 border border-gray-800/50 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <Unlock size={36} className="text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold text-gray-300 mb-2">No accounts yet</h3>
            {isSuperAdmin ? (
              <>
                <p className="text-sm text-gray-500 max-w-xs mx-auto mb-6 leading-relaxed">
                  Import accounts from Google Authenticator or add them manually to get started.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => setShowScanner(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
                  >
                    <ScanLine size={18} />
                    Import QR Code
                  </button>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gray-800/60 hover:bg-gray-800 border border-gray-700/40 text-gray-300 text-sm font-medium rounded-xl transition-colors"
                  >
                    <Plus size={18} />
                    Add Manually
                  </button>
                </div>
                <div className="mt-8 p-4 bg-gray-900/30 border border-gray-800/30 rounded-xl max-w-sm mx-auto">
                  <h4 className="text-xs font-semibold text-gray-400 mb-2">💡 Quick Import</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    You can also paste an <code className="text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded">otpauth-migration://</code> or{' '}
                    <code className="text-indigo-400 bg-indigo-500/10 px-1 py-0.5 rounded">otpauth://</code> URL anywhere on this page to import accounts instantly.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
                No accounts have been assigned to you yet. Contact your administrator.
              </p>
            )}
          </div>
        )}

        {/* Footer */}
        {accounts.length > 0 && (
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-600">
              {isSuperAdmin
                ? 'Codes refresh every 30 seconds • Click code to copy • Paste URLs to quick-import'
                : 'Codes refresh every 30 seconds • Click code to copy'
              }
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      {showScanner && isSuperAdmin && (
        <Scanner onImport={handleImport} onClose={() => setShowScanner(false)} />
      )}

      {showAddModal && isSuperAdmin && (
        <AddAccountModal onAdd={handleAddAccount} onClose={() => setShowAddModal(false)} />
      )}

      {exportAccount && isSuperAdmin && (
        <ExportModal account={exportAccount} onClose={() => setExportAccount(null)} />
      )}

      {showAdminPanel && isSuperAdmin && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onDismiss={dismissToast}
        />
      )}
    </div>
  );
}
