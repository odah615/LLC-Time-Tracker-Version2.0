import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { AuditLog, AuditActionCategory, User } from '../../types';
import {
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_SPREADSHEET_URL,
  SPREADSHEET_SCHEMA,
  generateAppsScriptCode,
  downloadTableCSV,
} from '../../lib/googleSheetsSync';
import { formatLogStartTime, formatLogEndTime, formatTotalTime } from '../../lib/dateUtils';
import {
  ShieldAlert,
  FileSpreadsheet,
  Download,
  Copy,
  Check,
  Search,
  Filter,
  ExternalLink,
  Code2,
  RefreshCw,
  LogIn,
  LogOut,
  Timer,
  Activity,
  PauseCircle,
  ShieldCheck,
  Laptop,
  Globe,
  Sliders,
  ArrowRight,
  Sparkles,
  Layers,
} from 'lucide-react';

type LogTabType = 'login' | 'logout' | 'idle' | 'active' | 'inactive' | 'admin' | 'all';

export const AuditLogsView: React.FC = () => {
  const {
    auditLogs,
    timeLogs,
    users,
    idleLogs,
    googleSheetsWebhookUrl,
    setGoogleSheetsWebhookUrl,
    triggerGoogleSheetsSync,
    importEmployeesFromGoogleSheets,
    importTimeLogsFromGoogleSheets,
  } = useApp();

  const [activeTab, setActiveTab] = useState<LogTabType>('login');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAppsScriptModal, setShowAppsScriptModal] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPullingLogs, setIsPullingLogs] = useState(false);
  const [webhookInput, setWebhookInput] = useState(googleSheetsWebhookUrl || '');
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => {
      map.set(u.id, u);
      map.set(u.name.toLowerCase(), u);
    });
    return map;
  }, [users]);

  const loginLogs = useMemo(() => {
    return auditLogs.filter(
      (l) => l.category === 'Login' || l.details.toLowerCase().includes('signed in')
    );
  }, [auditLogs]);

  const logoutLogs = useMemo(() => {
    return auditLogs.filter(
      (l) =>
        l.category === 'Logout' ||
        l.details.toLowerCase().includes('signed out') ||
        l.details.toLowerCase().includes('session expired') ||
        l.details.toLowerCase().includes('inactivity')
    );
  }, [auditLogs]);

  const adminAuditLogs = useMemo(() => {
    return auditLogs.filter(
      (l) =>
        l.category !== 'Login' &&
        l.category !== 'Logout' &&
        l.category !== 'Clock In' &&
        l.category !== 'Clock Out'
    );
  }, [auditLogs]);

  const filteredLoginLogs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return loginLogs.filter(
      (l) =>
        l.actorName.toLowerCase().includes(term) ||
        l.details.toLowerCase().includes(term) ||
        l.dateFormatted.toLowerCase().includes(term)
    );
  }, [loginLogs, searchTerm]);

  const filteredLogoutLogs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return logoutLogs.filter(
      (l) =>
        l.actorName.toLowerCase().includes(term) ||
        l.details.toLowerCase().includes(term) ||
        l.dateFormatted.toLowerCase().includes(term)
    );
  }, [logoutLogs, searchTerm]);

  const filteredIdleLogs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return idleLogs.filter(
      (i) =>
        i.userName.toLowerCase().includes(term) ||
        i.task.toLowerCase().includes(term) ||
        i.reason.toLowerCase().includes(term) ||
        i.timestamp.toLowerCase().includes(term)
    );
  }, [idleLogs, searchTerm]);

  const filteredActiveLogs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return timeLogs.filter(
      (t) =>
        t.userName.toLowerCase().includes(term) ||
        t.task.toLowerCase().includes(term) ||
        t.designation.toLowerCase().includes(term) ||
        t.date.toLowerCase().includes(term)
    );
  }, [timeLogs, searchTerm]);

  const filteredAdminAuditLogs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return adminAuditLogs.filter((l) => {
      const matchesSearch =
        l.actorName.toLowerCase().includes(term) ||
        (l.targetEmployeeName && l.targetEmployeeName.toLowerCase().includes(term)) ||
        l.details.toLowerCase().includes(term) ||
        l.category.toLowerCase().includes(term);
      const matchesCategory = selectedCategory === 'all' || l.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [adminAuditLogs, searchTerm, selectedCategory]);

  const filteredAllLogs = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return auditLogs.filter((l) => {
      const matchesSearch =
        l.actorName.toLowerCase().includes(term) ||
        (l.targetEmployeeName && l.targetEmployeeName.toLowerCase().includes(term)) ||
        l.details.toLowerCase().includes(term) ||
        l.category.toLowerCase().includes(term);
      const matchesCategory = selectedCategory === 'all' || l.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [auditLogs, searchTerm, selectedCategory]);

  const categoriesList: AuditActionCategory[] = [
    'Role Change',
    'Supervisor Reassign',
    'Screenshot Monitor Toggle',
    'Activity Monitor Toggle',
    'Password Reset',
    'Employee Added',
    'Employee Updated',
    'Employee Deleted',
    'Manual Time Approved',
    'Manual Time Rejected',
    'Leave Request Approved',
    'Leave Request Rejected',
    'Payroll Processed',
  ];

  const handleCopyAppsScript = () => {
    const code = generateAppsScriptCode(DEFAULT_SPREADSHEET_ID);
    navigator.clipboard.writeText(code);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 3000);
  };

  const handleExportCurrentTabCSV = () => {
    switch (activeTab) {
      case 'login': {
        const rows = loginLogs.map((l) => {
          const usr = userMap.get(l.actorId) || userMap.get(l.actorName.toLowerCase());
          const mode = l.details.includes('Desktop') ? 'Desktop Software App' : 'Web Portal';
          return [
            l.id,
            l.timestamp,
            l.dateFormatted,
            usr?.employeeCode || 'N/A',
            l.actorName,
            l.actorRole,
            usr?.designation || 'Agent',
            mode,
            usr?.geoCity ? `${usr.geoCity} (${usr.geoTimezone})` : 'Toronto, Canada (America/Toronto)',
            'Authenticated (Active)',
          ];
        });
        const headers = SPREADSHEET_SCHEMA.find((s) => s.tabName === 'Login_Logs')?.headers || [];
        downloadTableCSV('Login_Logs', headers, rows);
        break;
      }
      case 'logout': {
        const rows = logoutLogs.map((l) => {
          const usr = userMap.get(l.actorId) || userMap.get(l.actorName.toLowerCase());
          return [
            l.id,
            l.timestamp,
            l.dateFormatted,
            usr?.employeeCode || 'N/A',
            l.actorName,
            l.actorRole,
            usr?.designation || 'Agent',
            'Manual Sign Out / Shift End',
            l.details,
            'Logged Out (Complete)',
          ];
        });
        const headers = SPREADSHEET_SCHEMA.find((s) => s.tabName === 'Logout_Logs')?.headers || [];
        downloadTableCSV('Logout_Logs', headers, rows);
        break;
      }
      case 'idle': {
        const rows = idleLogs.map((i) => {
          const usr = userMap.get(i.userId) || userMap.get(i.userName.toLowerCase());
          return [
            i.id,
            i.timestamp,
            usr?.employeeCode || 'N/A',
            i.userName,
            i.durationMinutes,
            `-${i.deductedFromShiftMinutes || i.durationMinutes} mins`,
            `+${i.requiredExtensionMinutes || i.durationMinutes} mins`,
            i.task,
            i.reason,
            i.status,
          ];
        });
        const headers = SPREADSHEET_SCHEMA.find((s) => s.tabName === 'Idle_Logs')?.headers || [];
        downloadTableCSV('Idle_Logs', headers, rows);
        break;
      }
      case 'active': {
        const rows = timeLogs.map((t) => {
          const usr = userMap.get(t.userId) || userMap.get(t.userName.toLowerCase());
          return [
            t.id,
            usr?.employeeCode || 'N/A',
            t.userName,
            t.designation,
            t.task,
            t.date,
            t.geoLocalStartTime || formatLogStartTime(t.startTime, 'Asia/Manila'),
            t.endTime === 'Running Live' || !t.endTime ? 'Running Live' : (t.geoLocalEndTime || formatLogEndTime(t.endTime, 'Asia/Manila')),
            t.durationSeconds,
            formatTotalTime(t.durationSeconds),
            t.idleSeconds ? `${Math.round(t.idleSeconds / 60)} mins` : '0 mins',
            `${t.mouseActivityAvg}%`,
            `${t.keyboardActivityAvg}%`,
            t.status,
            t.notes || '',
          ];
        });
        const headers = SPREADSHEET_SCHEMA.find((s) => s.tabName === 'Time_Logs')?.headers || [];
        downloadTableCSV('Active_Logs', headers, rows);
        break;
      }
      case 'admin':
      case 'all': {
        const targetList = activeTab === 'admin' ? adminAuditLogs : auditLogs;
        const rows = targetList.map((l) => [
          l.id,
          l.timestamp,
          l.dateFormatted,
          l.actorName,
          l.actorRole,
          l.category,
          l.targetEmployeeName || 'N/A',
          l.fromValue || '-',
          l.toValue || '-',
          l.details,
        ]);
        const headers = ['Audit ID', 'Timestamp (ISO)', 'Formatted Date', 'Actor Name', 'Actor Role', 'Action Category', 'Affected Employee', 'Previous Value', 'New Value', 'Action Details'];
        downloadTableCSV(activeTab === 'admin' ? 'Admin_Audit_Logs' : 'System_Audit_Logs', headers, rows);
        break;
      }
    }
    setSyncSuccessMsg(`Exported ${activeTab.toUpperCase()} logs to CSV successfully!`);
    setTimeout(() => setSyncSuccessMsg(''), 4000);
  };

  const getCategoryBadgeColor = (cat: AuditActionCategory) => {
    switch (cat) {
      case 'Role Change':
      case 'Supervisor Reassign':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Screenshot Monitor Toggle':
      case 'Activity Monitor Toggle':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Password Reset':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Employee Added':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Employee Deleted':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold mb-3">
              <ShieldAlert className="w-3.5 h-3.5 text-indigo-400" />
              LLC-Time-Tracker-V2 System Audit Trail
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              System Logs & Audit Trail
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl">
              Cleanly separated into dedicated tabs for Login Logs, Logout Logs, Idle Logs, Active Work Sessions, Inactivity Events, and Admin Governance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowAppsScriptModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <Code2 className="w-4 h-4" />
              Google Apps Script Code
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Company Google Spreadsheet Database</h3>
                <span className={`px-2.5 py-0.5 rounded-full font-semibold text-xs border ${
                  googleSheetsWebhookUrl ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200'
                }`}>
                  {googleSheetsWebhookUrl ? '✓ WEBHOOK CONNECTED' : '⚠️ WEBHOOK URL NEEDED FOR AUTO-SYNC'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {syncSuccessMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            {syncSuccessMsg}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveTab('login')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'login'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Login Logs</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'login' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
              }`}
            >
              {loginLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('logout')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'logout'
                ? 'bg-slate-800 text-white shadow-md shadow-slate-800/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <LogOut className="w-4 h-4" />
            <span>Logout Logs</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'logout' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {logoutLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('idle')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'idle'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Timer className="w-4 h-4" />
            <span>Idle Logs</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'idle' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
              }`}
            >
              {idleLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('active')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'active'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Active Logs</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'active' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {timeLogs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('admin')}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Admin Audit Logs</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'admin' ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              {adminAuditLogs.length}
            </span>
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Search ${activeTab.toUpperCase()} logs...`}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
        <button
          onClick={handleExportCurrentTabCSV}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all shrink-0 ml-auto cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-indigo-600" />
          Export {activeTab.toUpperCase()} CSV
        </button>
      </div>

      {activeTab === 'login' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-blue-900 text-blue-100 font-bold border-b border-blue-800">
                  <th className="py-3.5 px-4">Log ID</th>
                  <th className="py-3.5 px-4">Date & Timestamp</th>
                  <th className="py-3.5 px-4">Employee Name & Role</th>
                  <th className="py-3.5 px-4">Platform Mode</th>
                  <th className="py-3.5 px-4">Session Details</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredLoginLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No login log records found matching search.
                    </td>
                  </tr>
                ) : (
                  filteredLoginLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {log.id}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap font-medium">
                        {log.dateFormatted || log.timestamp}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{log.actorName}</div>
                        <div className="text-[10px] text-slate-500 capitalize">{log.actorRole}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold text-[11px] bg-blue-50 text-blue-700 border border-blue-200">
                          {log.details.includes('Desktop') ? 'Desktop App' : 'Web Portal'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs">{log.details}</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                          AUTHENTICATED
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAppsScriptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-950 font-extrabold text-lg">
                <Code2 className="w-5 h-5 text-indigo-600" />
                LLC-Time-Tracker-V2 Apps Script Template
              </div>
              <button
                onClick={() => setShowAppsScriptModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <div className="relative bg-slate-950 rounded-xl p-4 overflow-x-auto text-emerald-400 font-mono text-xs max-h-60 border border-slate-800">
              <pre>{generateAppsScriptCode(DEFAULT_SPREADSHEET_ID)}</pre>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAppsScriptModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Close
              </button>
              <button
                onClick={handleCopyAppsScript}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
              >
                {scriptCopied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                {scriptCopied ? 'Code Copied!' : 'Copy Script Code'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
