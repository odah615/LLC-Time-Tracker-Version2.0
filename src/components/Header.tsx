import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WorldClockWidget } from './WorldClockWidget';
import {
  Clock,
  LayoutDashboard,
  Calendar,
  Camera,
  FileText,
  Coins,
  UserCheck,
  User as UserIcon,
  Download,
  Laptop,
  FileSpreadsheet,
  Layers,
  Shield,
  Database,
  AlertTriangle,
  RotateCcw,
  LogOut,
  ExternalLink,
  Code,
  CheckCircle2,
  Check,
  Copy,
  Trash2,
} from 'lucide-react';
import { UserRole } from '../types';
import { getGoogleAppsScriptTemplate, downloadTableCSV, DEFAULT_SPREADSHEET_ID, DEFAULT_SPREADSHEET_URL } from '../lib/googleSheetsSync';
import { formatTotalTime } from '../lib/dateUtils';
import { downloadDesktopSoftwarePackage, DesktopOS } from '../lib/desktopDownloader';
import { downloadWordDocInstructions } from '../lib/docGenerator';
import { UserAvatar } from './UserAvatar';
import { TaskDesignationManagerModal } from './modals/TaskDesignationManagerModal';
import { RolePermissionsModal } from './modals/RolePermissionsModal';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab }) => {
  const {
    currentUser,
    users,
    timeLogs,
    payrollRecords,
    isDesktopDockView,
    setIsDesktopDockView,
    loginMode,
    isSessionWarningActive,
    webSessionWarningCountdown,
    refreshWebSession,
    logout,
    googleSheetsWebhookUrl,
    setGoogleSheetsWebhookUrl,
    isAutoSyncToSheetsEnabled,
    setIsAutoSyncToSheetsEnabled,
    triggerGoogleSheetsSync,
    importEmployeesFromGoogleSheets,
    hasPermission,
    storageEngineMode,
    setStorageEngineMode,
    resetDatabaseToFreshState,
  } = useApp();

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showSheetsModal, setShowSheetsModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showTaskManagerModal, setShowTaskManagerModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [sheetsWebhookInput, setSheetsWebhookInput] = useState(googleSheetsWebhookUrl);
  const [syncingSheets, setSyncingSheets] = useState(false);
  const [importingSheets, setImportingSheets] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [showScriptDetails, setShowScriptDetails] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);

  const isSuperAdmin =
    currentUser.employeeCode?.toLowerCase() === 'superadmin' ||
    currentUser.id === 'usr-superadmin-red' ||
    currentUser.id === 'usr-superadmin-root' ||
    currentUser.email === 'admin@llc.com';

  const [headerSelectedOS, setHeaderSelectedOS] = useState<DesktopOS>('windows');

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Admin</span>;
      case 'va_admin':
        return <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">VA Admin</span>;
      case 'team_lead':
        return <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Team Lead</span>;
      case 'trainer':
        return <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Trainer</span>;
      case 'hr':
        return <span className="bg-purple-500/20 text-purple-300 border border-purple-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">HR</span>;
      case 'payroll':
        return <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Payroll</span>;
      default:
        return <span className="bg-slate-500/20 text-slate-300 border border-slate-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">Agent</span>;
    }
  };

  return (
    <header className="bg-[#0F172A] border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-md">
      <WorldClockWidget />

      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-white shadow-sm">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-white">LLC-Time-Tracker-V2</span>
              <span className="bg-blue-600/20 border border-blue-500/40 text-blue-400 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                v2.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Agent Time & Productivity Management</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto py-1 bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
          </button>

          {(currentUser.role !== 'agent' || hasPermission('canViewTimesheets')) && (
            <button
              onClick={() => setActiveTab('timesheet')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeTab === 'timesheet'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Timesheet</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('my_timesheet')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'my_timesheet'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <UserIcon className="w-4 h-4 text-emerald-400" />
            <span>My Timesheet</span>
          </button>

          {(currentUser.role === 'admin' || hasPermission('canViewActivityLogs') || hasPermission('canViewScreenshots')) && (
            <button
              onClick={() => setActiveTab('activity')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeTab === 'activity'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Activity Logs & Screenshots</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
              activeTab === 'requests'
                ? 'bg-blue-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Leave Requests</span>
          </button>

          {(currentUser.role === 'hr' || currentUser.role === 'admin' || currentUser.role === 'va_admin' || currentUser.role === 'trainer' || hasPermission('canEditEmployees') || hasPermission('canAssignTeamLeader')) && (
            <button
              onClick={() => setActiveTab('employees')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeTab === 'employees'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Employee Directory</span>
            </button>
          )}

          {(currentUser.role === 'payroll' || currentUser.role === 'admin' || currentUser.role === 'va_admin' || hasPermission('canViewPayroll')) && (
            <button
              onClick={() => setActiveTab('payroll')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeTab === 'payroll'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>Payroll</span>
            </button>
          )}

          {(currentUser.role === 'admin' || currentUser.role === 'va_admin' || hasPermission('canSyncSheets')) && (
            <button
              onClick={() => setActiveTab('audit_sheets')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeTab === 'audit_sheets'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Audit Logs & Sheets</span>
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2.5">
          {(currentUser.role === 'admin' || isSuperAdmin || hasPermission('canManageTasks')) && (
            <button
              onClick={() => setShowTaskManagerModal(true)}
              className="p-2 px-2.5 rounded-xl bg-blue-950 hover:bg-blue-900 border border-blue-700/70 text-blue-300 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Configure Role Designations & Task Dropdown Options"
            >
              <Layers className="w-4 h-4 text-blue-400" />
              <span className="hidden xl:inline">Task Options</span>
            </button>
          )}

          {isSuperAdmin && (
            <button
              onClick={() => setShowPermissionsModal(true)}
              className="p-2 px-2.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/70 text-indigo-300 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Open Designation and Permissions Control (Super Admin Only)"
            >
              <Shield className="w-4 h-4 text-indigo-400" />
              <span className="hidden xl:inline">Permissions</span>
            </button>
          )}

          {loginMode === 'webapp' && (
            <button
              onClick={refreshWebSession}
              title={
                isSessionWarningActive
                  ? `Inactivity Warning: No activity detected for 5 minutes. Web session will auto-logout in ${Math.floor(webSessionWarningCountdown / 60)}:${String(webSessionWarningCountdown % 60).padStart(2, '0')}. Click to refresh session now.`
                  : 'Web Portal Session: Active. Auto-logout occurs after 10 minutes of complete inactivity. Click to refresh session.'
              }
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono transition-all ${
                isSessionWarningActive
                  ? 'bg-amber-950/90 border-amber-500 text-amber-300 animate-pulse shadow-lg shadow-amber-500/20'
                  : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
              }`}
            >
              <Clock
                className={`w-3.5 h-3.5 ${
                  isSessionWarningActive ? 'text-amber-400 animate-bounce' : 'text-emerald-400'
                }`}
              />
              <span className="text-[11px] font-semibold">
                {isSessionWarningActive ? (
                  <span>
                    Expiring:{' '}
                    <span className="font-bold text-amber-300">
                      {Math.floor(webSessionWarningCountdown / 60)}:
                      {String(webSessionWarningCountdown % 60).padStart(2, '0')}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Session: Active</span>
                  </span>
                )}
              </span>
            </button>
          )}

          <div className="flex items-center gap-2.5 bg-slate-800/80 border border-slate-700 p-1.5 px-3 rounded-xl select-none">
            <UserAvatar name={currentUser.name} role={currentUser.role} size="md" />
            <div className="text-left hidden md:block">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-xs text-white">{currentUser.name}</span>
                {getRoleBadge(currentUser.role)}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-slate-400">
                <span>{currentUser.employeeCode}</span>
                <span>•</span>
                <span>{currentUser.designation}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => currentUser.role === 'admin' ? setShowSheetsModal(true) : null}
            className="p-1.5 px-3 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/40 text-blue-300 flex items-center gap-1.5 text-xs font-semibold transition-colors shadow-sm cursor-pointer"
            title="High-Capacity Server Bridge Active: Zero Firestore quota limits. Unlimited throughput for 100+ agents with real-time Google Sheets sync."
          >
            <Database className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">
              100+ Agent Unlimited Bridge
            </span>
          </button>

          {currentUser.role === 'admin' && (
            <button
              onClick={() => setShowSheetsModal(true)}
              className="p-2 px-3 rounded-xl bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/80 text-emerald-300 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Open Google Sheets Database & Auto-Sync Settings"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span className="hidden sm:inline">Google Sheets Sync</span>
            </button>
          )}

          <button
            onClick={() => setShowDownloadModal(true)}
            className="p-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Download Standalone Software Package (.bat / .sh)"
          >
            <Download className="w-4 h-4 text-blue-400" />
            <span className="hidden md:inline">Download Software</span>
          </button>

          <button
            onClick={() => logout()}
            className="p-2 rounded-xl bg-slate-800 hover:bg-red-950/80 hover:text-red-300 border border-slate-700 text-slate-400 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            title="Log Out of System"
          >
            <LogOut className="w-4 h-4 text-red-400" />
            <span className="hidden lg:inline">Log Out</span>
          </button>
        </div>
      </div>

      {showDownloadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-slate-800">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">LLC-Time-Tracker-V2 Desktop Software</h3>
                  <p className="text-xs text-slate-500">Cross-Platform Standalone App for Windows, macOS & Linux</p>
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
                onClick={() => setHeaderSelectedOS('windows')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  headerSelectedOS === 'windows'
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Windows OS
              </button>
              <button
                onClick={() => setHeaderSelectedOS('mac')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  headerSelectedOS === 'mac'
                    ? 'bg-white text-indigo-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                macOS (Apple)
              </button>
              <button
                onClick={() => setHeaderSelectedOS('linux')}
                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  headerSelectedOS === 'linux'
                    ? 'bg-white text-amber-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Linux OS
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-4 rounded-xl border border-emerald-400 bg-emerald-50/80 hover:bg-emerald-50 transition-all space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-950 flex items-center gap-2">
                    <Download className="w-4 h-4 text-emerald-700" /> Option 1: Instant Native Desktop Launcher (100% Safe)
                  </span>
                  <span className="text-[10px] bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full">
                    RECOMMENDED • 0-INSTALL
                  </span>
                </div>
                <p className="text-[11px] text-emerald-900 leading-relaxed">
                  {headerSelectedOS === 'windows'
                    ? 'Launches in dedicated borderless desktop app window via Microsoft-signed Edge/Chrome runtime. 100% immune to Windows 11 Smart App Control & Application Control Policy blocks. Zero installation needed!'
                    : 'Launches standalone native desktop application window instantly with 0 setup.'}
                </p>
                <button
                  onClick={() => {
                    downloadDesktopSoftwarePackage(headerSelectedOS, 'instant_launcher');
                    setShowDownloadModal(false);
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
                >
                  <Download className="w-4 h-4" /> Download Instant {headerSelectedOS === 'windows' ? 'Windows Launcher (.bat)' : headerSelectedOS === 'mac' ? 'Mac Launcher (.command)' : 'Linux Launcher (.sh)'}
                </button>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 transition-all space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-indigo-600" /> Option 2: Electron Standalone Builder Package
                  </span>
                  <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2 py-0.5 rounded">
                    .EXE BUILDER
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Packages the full standalone Node/Electron executable.
                </p>
                <button
                  onClick={() => {
                    downloadDesktopSoftwarePackage(headerSelectedOS, 'electron_builder');
                    setShowDownloadModal(false);
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> Download Full Builder Package (.bat)
                </button>
              </div>

              <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-800 text-[11px]">User Guide & Login Demo Document</div>
                    <div className="text-[10px] text-slate-500">Microsoft Word (.doc) with all demo credentials & setup steps</div>
                  </div>
                </div>
                <button
                  onClick={() => downloadWordDocInstructions()}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 shadow-sm transition-all"
                  title="Download complete documentation as Microsoft Word Document (.doc)"
                >
                  <Download className="w-3 h-3" />
                  <span>Download .DOC</span>
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => downloadWordDocInstructions()}
                className="px-3 py-1.5 rounded-xl text-blue-600 hover:bg-blue-50 text-xs font-semibold flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export Word Guide</span>
              </button>
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

      {showSheetsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-slate-800">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-md">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Google Sheets Database Live Sync</h3>
                  <p className="text-xs text-slate-500">LLC-Time-Tracker-V2 Master Sheet Integration</p>
                </div>
              </div>
              <button
                onClick={() => setShowSheetsModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-blue-600" /> Google Apps Script Webhook URL
                  </label>
                  <button
                    onClick={() => setShowScriptDetails(!showScriptDetails)}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                  >
                    {showScriptDetails ? 'Hide Setup Code ▲' : '▶ How to get Webhook URL'}
                  </button>
                </div>

                {showScriptDetails && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-slate-700 space-y-2 text-[11px] leading-relaxed">
                    <p className="font-bold text-blue-900">How to activate automatic Google Sheets sync:</p>
                    <ol className="list-decimal pl-4 space-y-1 text-slate-700">
                      <li>Open your Google Sheet, click <b>Extensions</b> → <b>Apps Script</b>.</li>
                      <li>Delete all existing text in the editor and click the button below to copy the webhook script.</li>
                      <li>Paste the script and click <b>Save</b>.</li>
                      <li>Click <b>Deploy</b> → <b>New deployment</b> → Select <b>Web app</b>.</li>
                      <li>Set <i>Execute as:</i> <b>Me</b>, and <i>Who has access:</i> <b>Anyone</b> → Click <b>Deploy</b>.</li>
                      <li>Copy the resulting Web App URL (ends with <code>/exec</code>) and paste it below!</li>
                    </ol>
                    <button
                      onClick={() => {
                        const scriptCode = getGoogleAppsScriptTemplate(DEFAULT_SPREADSHEET_ID);
                        navigator.clipboard.writeText(scriptCode);
                        setCopiedScript(true);
                        setTimeout(() => setCopiedScript(false), 4000);
                      }}
                      className="mt-2 w-full py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      {copiedScript ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedScript ? '✓ Copied Apps Script Code!' : 'Copy Apps Script Webhook Code'}</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={sheetsWebhookInput}
                    onChange={(e) => setSheetsWebhookInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-1 bg-white border border-slate-300 rounded-xl p-2 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    disabled={syncingSheets || importingSheets}
                    onClick={async () => {
                      if (!sheetsWebhookInput.trim() || sheetsWebhookInput.includes('...') || !sheetsWebhookInput.trim().startsWith('https://')) {
                        setSyncStatusMsg('Please paste your actual deployed Web App URL');
                        return;
                      }
                      setGoogleSheetsWebhookUrl(sheetsWebhookInput.trim());
                      setSyncingSheets(true);
                      setSyncStatusMsg('Connecting to Google Sheets...');
                      const res = await triggerGoogleSheetsSync(sheetsWebhookInput.trim());
                      setSyncingSheets(false);
                      if (res && res.success) {
                        setSyncStatusMsg('✓ Successfully pushed and synchronized all tables to Google Sheets!');
                      } else {
                        setSyncStatusMsg(`Sync attempted: ${res?.message || 'Check Apps Script permissions'}.`);
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shrink-0 shadow-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{syncingSheets ? 'Pushing...' : 'Push to Sheets'}</span>
                  </button>
                </div>

                {syncStatusMsg && (
                  <p className="text-[11px] font-medium text-emerald-700 bg-emerald-50 p-2 rounded-lg border border-emerald-200">
                    {syncStatusMsg}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800 text-[11px] flex items-center gap-1">
                      Background Auto-Refresh
                    </span>
                    <p className="text-[10px] text-slate-500 max-w-[280px]">
                      {isAutoSyncToSheetsEnabled
                        ? 'Active – auto-pushes data to Google Sheets periodically.'
                        : 'Disabled (Quiet Mode)'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAutoSyncToSheetsEnabled(!isAutoSyncToSheetsEnabled)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm ${
                      isAutoSyncToSheetsEnabled
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
                    }`}
                  >
                    {isAutoSyncToSheetsEnabled ? 'Auto-Sync: ON' : 'Auto-Sync: OFF (Quiet)'}
                  </button>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="p-4 rounded-xl border border-red-200 bg-red-50/50 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-red-900">System Reset & Clean Slate</h4>
                        <p className="text-[11px] text-red-700">Wipe all time logs, daily summaries, and reset shift sessions</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowResetModal(true)}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset Everything
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-end">
              <button
                onClick={() => setShowSheetsModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showResetModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 text-slate-800">
          <div className="bg-white border border-red-200 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Full System Reset</h3>
                <p className="text-xs text-slate-500">This action will restore a completely clean slate</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                disabled={isResetting}
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={isResetting}
                onClick={async () => {
                  setIsResetting(true);
                  try {
                    await resetDatabaseToFreshState();
                    setShowResetModal(false);
                    setShowSheetsModal(false);
                  } finally {
                    setIsResetting(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-2 shadow-sm disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <RotateCcw className="w-3.5 h-3.5 animate-spin" /> Resetting System...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" /> Yes, Reset Everything
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <TaskDesignationManagerModal
        isOpen={showTaskManagerModal}
        onClose={() => setShowTaskManagerModal(false)}
      />

      <RolePermissionsModal
        isOpen={showPermissionsModal}
        onClose={() => setShowPermissionsModal(false)}
      />
    </header>
  );
};
