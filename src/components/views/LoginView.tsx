import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { User } from '../../types';
import { maskPassword } from '../../lib/googleSheetsSync';
import { downloadWordDocInstructions } from '../../lib/docGenerator';
import { downloadDesktopSoftwarePackage } from '../../lib/desktopDownloader';
import {
  Clock,
  Globe,
  Laptop,
  Eye,
  EyeOff,
  Download,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  IdCard,
  ExternalLink,
  HelpCircle,
  KeyRound,
  ShieldCheck,
  FileSpreadsheet,
  Check,
  X,
  WifiOff,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const {
    login,
    sessionExpiredReason,
    clearSessionExpiredReason,
  } = useApp();

  const isSoftwareEnv = typeof window !== 'undefined' && (
    window.location.search.includes('mode=desktop') ||
    window.location.search.includes('appMode=desktop') ||
    window.location.search.includes('source=software') ||
    window.location.search.includes('mode=software') ||
    navigator.userAgent.includes('Electron') ||
    (window as any).isElectronApp === true ||
    Boolean((window as any).electronAPI)
  );

  const currentWebUrl = typeof window !== 'undefined' && window.location.origin
    ? window.location.origin
    : '';

  const [employeeCodeInput, setEmployeeCodeInput] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadOS, setDownloadOS] = useState<'windows' | 'mac' | 'linux'>('windows');

  const [pendingPasswordChangeUser, setPendingPasswordChangeUser] = useState<User | null>(null);
  const [pendingToken, setPendingToken] = useState<string>('');
  const [newUniquePassword, setNewUniquePassword] = useState<string>('');
  const [confirmUniquePassword, setConfirmUniquePassword] = useState<string>('');
  const [showNewPass, setShowNewPass] = useState<boolean>(false);
  const [showConfirmPass, setShowConfirmPass] = useState<boolean>(false);
  const [firstTimeError, setFirstTimeError] = useState<string>('');
  const [isSavingPassword, setIsSavingPassword] = useState<boolean>(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanCode = employeeCodeInput.trim();
    if (!cleanCode) {
      setErrorMsg('Please enter your Username or Employee Code.');
      return;
    }
    if (!password) {
      setErrorMsg('Please enter your account password.');
      return;
    }

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrCode: cleanCode, password }),
      });
      const data: any = await resp.json().catch(() => null);

      if (resp.ok && data && data.success && data.user) {
        const matchedUser: User = data.user;
        const token = data.token || '';
        if (token) {
          localStorage.setItem('trackpulse_token', token);
        }
        if (data.mustChangePassword) {
          setPendingPasswordChangeUser(matchedUser);
          setPendingToken(token);
          setNewUniquePassword('');
          setConfirmUniquePassword('');
          setFirstTimeError('');
          return;
        }
        const resolvedMode: 'webapp' | 'software' = isSoftwareEnv ? 'software' : 'webapp';
        login(matchedUser, resolvedMode, token);
        return;
      }
      setErrorMsg(data?.error || 'Login rejected: Invalid credentials.');
    } catch (err: any) {
      setErrorMsg(`Unable to connect to authentication server (${err?.message || 'Network error'}). Please try again.`);
    }
  };

  const handleSaveUniquePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirstTimeError('');
    if (!pendingPasswordChangeUser) return;

    const trimmed = newUniquePassword.trim();
    const confirmTrimmed = confirmUniquePassword.trim();

    if (trimmed.length < 6) {
      setFirstTimeError('Password must be at least 6 characters long.');
      return;
    }
    if (
      trimmed.toLowerCase() === 'password123!' ||
      trimmed.toLowerCase() === 'password123' ||
      trimmed.toLowerCase() === 'password'
    ) {
      setFirstTimeError('You cannot use default "Password123!" as your password. Please enter a custom password.');
      return;
    }
    if (trimmed !== confirmTrimmed) {
      setFirstTimeError('Passwords do not match. Please re-type your confirmation password.');
      return;
    }

    setIsSavingPassword(true);
    try {
      const activeToken = pendingToken || localStorage.getItem('trackpulse_token') || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

      const resp = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: pendingPasswordChangeUser.id,
          newPassword: trimmed,
          currentPassword: password,
        }),
      });
      const data: any = await resp.json().catch(() => null);

      if (resp.ok && data && data.success) {
        setIsSavingPassword(false);
        setPendingPasswordChangeUser(null);
        setPendingToken('');
        const resolvedMode: 'webapp' | 'software' = isSoftwareEnv ? 'software' : 'webapp';
        login(pendingPasswordChangeUser, resolvedMode, activeToken);
        return;
      }
      setFirstTimeError(data?.error || 'Password update could not be verified. Please try again.');
    } catch (err: any) {
      setFirstTimeError(`Network error updating password: ${err?.message || err}`);
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 flex flex-col justify-between selection:bg-blue-500 selection:text-white relative overflow-hidden font-sans">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 relative z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-white tracking-tight">LLC-Time-Tracker-V2</span>
                <span className="bg-blue-500/20 border border-blue-400/30 text-blue-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                  v2.0
                </span>
              </div>
              <p className="text-xs text-slate-400">Agent Time & Activity Tracking System</p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col items-center justify-center relative z-10">
        {isSoftwareEnv && (
          <div className="w-full max-w-xl mb-4 p-3 rounded-2xl bg-indigo-950/80 border border-indigo-500/30 text-indigo-200 text-xs flex items-center justify-between gap-2 shadow-lg">
            <div className="flex items-center gap-2 font-semibold">
              <Laptop className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Running in LLC-Time-Tracker-V2 Desktop Software Mode</span>
            </div>
            <a
              href={currentWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] bg-indigo-900 hover:bg-indigo-800 text-white font-bold px-3 py-1.5 rounded-lg border border-indigo-400/30 flex items-center gap-1 shrink-0"
            >
              <Globe className="w-3 h-3 text-sky-300" />
              <span>Web Portal</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        <div className="w-full max-w-xl bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative">
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {isSoftwareEnv ? (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Laptop className="w-3 h-3 text-emerald-400" />
                    DESKTOP TRACKER SOFTWARE
                  </span>
                ) : (
                  <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Globe className="w-3 h-3 text-blue-400" />
                    WEBSITE DASHBOARD PORTAL
                  </span>
                )}
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                {isSoftwareEnv ? 'Sign In to LLC-Time-Tracker-V2 Desktop' : 'Sign In to LLC-Time-Tracker-V2 Dashboard'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {isSoftwareEnv
                  ? 'Desktop Client: Sign in to clock in, pick your task, and track live activity & shifts.'
                  : 'Website Portal: Sign in to view live dashboards, team logs, timesheets, and reports.'}
              </p>
            </div>
          </div>

          {sessionExpiredReason === 'inactivity_10min' && (
            <div className="mb-5 p-3.5 rounded-xl bg-amber-950/80 border border-amber-600/80 text-amber-200 text-xs font-medium flex items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Your Web Portal session expired after <strong>10 minutes of inactivity</strong>. Please sign in again.</span>
              </div>
              <button
                type="button"
                onClick={clearSessionExpiredReason}
                className="text-amber-400 hover:text-amber-200 text-[10px] font-bold underline px-1 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-950/80 border border-red-700/80 text-red-200 text-xs font-medium flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-300">
                  Username or Employee Code
                </label>
                <span className="text-[10px] text-slate-400 font-mono">e.g. jdavid or 0001</span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={employeeCodeInput}
                  onChange={(e) => {
                    setEmployeeCodeInput(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="Enter your Username or Employee Code..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-4 pr-10 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-mono"
                  required
                />
                <IdCard className="w-4 h-4 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold text-slate-300">Account Password</label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setErrorMsg('');
                  }}
                  placeholder="Enter your account password..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-4 pr-10 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 font-mono transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className={`w-full py-3.5 px-6 rounded-xl font-extrabold text-xs sm:text-sm text-white shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isSoftwareEnv
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-700/30'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
              }`}
            >
              <span>
                {isSoftwareEnv
                  ? 'Sign In to Time Tracker'
                  : 'Sign In to LLC-Time-Tracker-V2'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            {isSoftwareEnv ? (
              <a
                href={currentWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-sky-400 hover:text-sky-300 font-bold underline flex items-center gap-1.5 shrink-0"
              >
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>Open LLC-Time-Tracker-V2 Web Portal in Browser</span>
                <ExternalLink className="w-3 h-3 text-sky-400" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setShowDownloadModal(true)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Laptop className="w-3.5 h-3.5 text-emerald-400" />
                <span>Download Desktop App & Installation Guide</span>
                <Download className="w-3 h-3 text-emerald-400" />
              </button>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4 relative z-10 text-center text-xs text-slate-400">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; {new Date().getFullYear()} LLC-Time-Tracker-V2. All rights reserved.</span>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Server Online
            </span>
          </div>
        </div>
      </footer>

      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-slate-800">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Download LLC-Time-Tracker-V2 Software</h3>
                  <p className="text-xs text-slate-500">Standalone Desktop Application</p>
                </div>
              </div>
              <button
                onClick={() => setShowDownloadModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                onClick={() => setDownloadOS('windows')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  downloadOS === 'windows'
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Windows OS
              </button>
              <button
                onClick={() => setDownloadOS('mac')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  downloadOS === 'mac'
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                macOS (Apple)
              </button>
              <button
                onClick={() => setDownloadOS('linux')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  downloadOS === 'linux'
                    ? 'bg-white text-amber-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Linux OS
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-4 rounded-xl border border-emerald-400 bg-emerald-50/80 hover:bg-emerald-50 transition-all space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-950 flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-700" /> Option 1: Instant Native Desktop Launcher
                  </span>
                  <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full">
                    RECOMMENDED
                  </span>
                </div>
                <button
                  onClick={() => {
                    downloadDesktopSoftwarePackage(downloadOS, 'instant_launcher');
                    setShowDownloadModal(false);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
                >
                  <Download className="w-4 h-4" /> Download Instant Launcher
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setShowDownloadModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPasswordChangeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 text-slate-800">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-lg shadow-indigo-500/25 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-lg leading-tight">
                    Set Your Unique Password
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    First-Time Login Security Setup
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingPasswordChangeUser(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
                title="Cancel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900 text-sm truncate">
                    {pendingPasswordChangeUser.name}
                  </h4>
                  <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                    #{pendingPasswordChangeUser.employeeCode}
                  </span>
                </div>
              </div>
            </div>

            {firstTimeError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{firstTimeError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUniquePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Create New Unique Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    value={newUniquePassword}
                    onChange={(e) => {
                      setNewUniquePassword(e.target.value);
                      setFirstTimeError('');
                    }}
                    placeholder="Enter your new secret password (min 6 characters)..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pr-11 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-900"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    value={confirmUniquePassword}
                    onChange={(e) => {
                      setConfirmUniquePassword(e.target.value);
                      setFirstTimeError('');
                    }}
                    placeholder="Re-type your new password to confirm..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 pr-11 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-slate-900"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPendingPasswordChangeUser(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingPassword || !newUniquePassword.trim()}
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-500/25 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingPassword ? 'Saving Password...' : 'Save Password & Sign In'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
