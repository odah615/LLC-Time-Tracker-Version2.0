import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { getManilaDateString } from '../../lib/dateUtils';
import {
  Camera,
  MousePointer,
  Keyboard,
  Monitor,
  Trash2,
  Maximize2,
  AlertTriangle,
  Clock,
  Filter,
  Search,
  Globe,
  FileText,
  MessageSquare,
  Video,
  Calendar,
  X,
  BarChart3,
  ShieldCheck,
  Users,
  ChevronLeft,
  ChevronRight,
  Lock,
  Eye,
  EyeOff,
  Shield,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { ScreenshotLog, User } from '../../types';
import { ConfirmationModal } from '../modals/ConfirmationModal';

type ViewTabMode = 'daily' | 'weekly' | 'monthly';

export const ActivityLogsView: React.FC = () => {
  const {
    screenshots,
    idleLogs,
    timeLogs,
    currentUser,
    users,
    updateUser,
    deleteScreenshot,
    toggleScreenshotBlur,
    setBulkIdleTracking,
  } = useApp();

  const handleToggleIdleTrackingPrompt = (usr: User, currentVal?: boolean) => {
    const isCurrentlyOn = currentVal === true;
    const fromVal = isCurrentlyOn ? 'Idle Detection ON' : 'Idle Detection OFF';
    const toVal = !isCurrentlyOn ? 'Idle Detection ON' : 'Idle Detection OFF';
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Idle Detection Setting',
      description: `Are you sure you want to turn ${isCurrentlyOn ? 'OFF' : 'ON'} 10-minute / screen-lock idle detection for ${usr.name}?`,
      employeeName: usr.name,
      employeeCode: usr.employeeCode,
      fromValue: fromVal,
      toValue: toVal,
      confirmText: `Yes, Turn ${!isCurrentlyOn ? 'ON' : 'OFF'}`,
      variant: 'warning',
      action: () => {
        updateUser(usr.id, { idleTrackingEnabled: !isCurrentlyOn });
      },
    });
  };

  const handleBulkIdlePrompt = (enable: boolean) => {
    setConfirmModal({
      isOpen: true,
      title: `Confirm Bulk Idle Detection ${enable ? 'ENABLE' : 'DISABLE'}`,
      description: `Are you sure you want to turn ${enable ? 'ON' : 'OFF'} idle detection for ALL staff members?`,
      confirmText: `Yes, Turn ${enable ? 'ON' : 'OFF'} for All`,
      variant: enable ? 'warning' : 'danger',
      action: () => {
        setBulkIdleTracking(enable);
      },
    });
  };

  const todayStr = getManilaDateString();
  const [selectedImage, setSelectedImage] = useState<ScreenshotLog | null>(null);
  const [viewTab, setViewTab] = useState<ViewTabMode>('daily');
  const [anchorDate, setAnchorDate] = useState<string>(todayStr);
  const [screenshotFilter, setScreenshotFilter] = useState<'all' | 'low_activity' | 'blurred'>('all');
  const [hoveredScrId, setHoveredScrId] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title?: string;
    description?: string;
    employeeName?: string;
    employeeCode?: string;
    fromValue?: string;
    toValue?: string;
    confirmText?: string;
    variant?: 'warning' | 'danger' | 'info';
    action?: () => void;
  }>({ isOpen: false });

  const handleToggleScreenshotPrompt = (usr: User, currentVal?: boolean) => {
    const isCurrentlyOn = currentVal === true;
    const fromVal = isCurrentlyOn ? 'Screenshot Monitoring ON' : 'Screenshot Monitoring OFF';
    const toVal = !isCurrentlyOn ? 'Screenshot Monitoring ON' : 'Screenshot Monitoring OFF';
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Screenshot Surveillance Change',
      description: `Are you sure you want to turn ${isCurrentlyOn ? 'OFF' : 'ON'} automated desktop screenshot capture for ${usr.name}?`,
      employeeName: usr.name,
      employeeCode: usr.employeeCode,
      fromValue: fromVal,
      toValue: toVal,
      confirmText: `Yes, Turn ${!isCurrentlyOn ? 'ON' : 'OFF'}`,
      variant: 'warning',
      action: () => {
        updateUser(usr.id, { screenshotMonitored: !isCurrentlyOn });
      },
    });
  };

  const handleToggleActivityPrompt = (usr: User, currentVal?: boolean) => {
    const isCurrentlyOn = currentVal === true;
    const fromVal = isCurrentlyOn ? 'Activity Monitoring ON' : 'Activity Monitoring OFF';
    const toVal = !isCurrentlyOn ? 'Activity Monitoring ON' : 'Activity Monitoring OFF';
    setConfirmModal({
      isOpen: true,
      title: 'Confirm Activity Monitoring Change',
      description: `Are you sure you want to turn ${isCurrentlyOn ? 'OFF' : 'ON'} mouse and keyboard activity level tracking for ${usr.name}?`,
      employeeName: usr.name,
      employeeCode: usr.employeeCode,
      fromValue: fromVal,
      toValue: toVal,
      confirmText: `Yes, Turn ${!isCurrentlyOn ? 'ON' : 'OFF'}`,
      variant: 'warning',
      action: () => {
        updateUser(usr.id, { activityMonitored: !isCurrentlyOn });
      },
    });
  };

  const getMondayFriday = (refDateStr: string) => {
    const refDate = new Date(refDateStr || todayStr);
    const dayOfWeek = refDate.getDay();
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(refDate);
    monday.setDate(refDate.getDate() + distanceToMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return {
      start: getManilaDateString(monday),
      end: getManilaDateString(friday),
    };
  };

  const initialWeek = getMondayFriday(todayStr);
  const [weekStartDate, setWeekStartDate] = useState<string>(initialWeek.start);
  const [weekEndDate, setWeekEndDate] = useState<string>(initialWeek.end);

  const currentYear = 2026;
  const currentMonth = 7;
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => 2026 - 3 + i);

  const formatDateDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const getPeriodLabel = () => {
    if (viewTab === 'daily') {
      return formatDateDDMMYYYY(anchorDate);
    }
    if (viewTab === 'weekly') {
      return `${formatDateDDMMYYYY(weekStartDate)} - ${formatDateDDMMYYYY(weekEndDate)}`;
    }
    if (viewTab === 'monthly') {
      return `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    }
    return '';
  };

  const handleTabSwitch = (newMode: ViewTabMode) => {
    setViewTab(newMode);
    if (newMode === 'weekly' && (!weekStartDate || !weekEndDate)) {
      const w = getMondayFriday(anchorDate || '2026-08-10');
      setWeekStartDate(w.start);
      setWeekEndDate(w.end);
    }
  };

  const [userFilter, setUserFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const isAgentOnly = currentUser.role === 'agent';
  const effectiveFilter = isAgentOnly ? currentUser.id : userFilter;

  const isLogInPeriod = (logDateStr: string, mode: ViewTabMode) => {
    if (!logDateStr) return false;
    if (mode === 'daily') {
      return logDateStr === anchorDate;
    }
    if (mode === 'weekly') {
      if (!weekStartDate || !weekEndDate) return true;
      return logDateStr >= weekStartDate && logDateStr <= weekEndDate;
    }
    if (mode === 'monthly') {
      const monthPadded = String(selectedMonth + 1).padStart(2, '0');
      const targetPrefix = `${selectedYear}-${monthPadded}`;
      return logDateStr.startsWith(targetPrefix);
    }
    return true;
  };

  const getScreenshotDate = (scr: ScreenshotLog): string => {
    const relatedTimeLog = timeLogs.find((t) => t.id === scr.timeLogId);
    return relatedTimeLog ? relatedTimeLog.date : '2026-08-10';
  };

  const filteredScreenshots = useMemo(() => {
    return screenshots.filter((s) => {
      if (effectiveFilter !== 'ALL' && s.userId !== effectiveFilter) {
        return false;
      }
      const scrDate = getScreenshotDate(s);
      if (!isLogInPeriod(scrDate, viewTab)) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const matchesUser = s.userName.toLowerCase().includes(q);
        const matchesApp = s.activeApp.toLowerCase().includes(q);
        if (!matchesUser && !matchesApp) return false;
      }
      if (screenshotFilter === 'low_activity') {
        const isLow = s.lowActivityAlert || s.activityPercent < 45;
        if (!isLow) return false;
      } else if (screenshotFilter === 'blurred') {
        if (!s.isBlurred) return false;
      }
      return true;
    });
  }, [screenshots, timeLogs, effectiveFilter, anchorDate, weekStartDate, weekEndDate, selectedMonth, selectedYear, viewTab, searchQuery, screenshotFilter]);

  const avgActivity = useMemo(() => {
    if (filteredScreenshots.length === 0) return 85;
    const total = filteredScreenshots.reduce((acc, s) => acc + s.activityPercent, 0);
    return Math.round(total / filteredScreenshots.length);
  }, [filteredScreenshots]);

  const [surveillancePage, setSurveillancePage] = useState(1);
  const surveillancePageSize = 5;
  const visibleSurveillanceUsers = useMemo(() => users.filter((u) => !u.isSecretBackup), [users]);
  const totalSurveillancePages = Math.ceil(visibleSurveillanceUsers.length / surveillancePageSize) || 1;
  const safeSurveillancePage = Math.min(surveillancePage, totalSurveillancePages);
  const paginatedSurveillanceUsers = useMemo(() => {
    const start = (safeSurveillancePage - 1) * surveillancePageSize;
    return visibleSurveillanceUsers.slice(start, start + surveillancePageSize);
  }, [visibleSurveillanceUsers, safeSurveillancePage, surveillancePageSize]);

  const getUserIdleTimeStr = (userId: string) => {
    const userIdleSec = idleLogs
      .filter((i) => i.userId === userId)
      .reduce((acc, i) => acc + (i.durationMinutes * 60), 0);
    if (userIdleSec === 0) return '0m Idle';
    const hrs = Math.floor(userIdleSec / 3600);
    const mins = Math.floor((userIdleSec % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m Idle`;
    }
    return `${mins}m Idle`;
  };

  const activityChartData = useMemo(() => {
    if (filteredScreenshots.length > 0) {
      const userMap: Record<string, { name: string; activity: number; mouse: number; keyboard: number; count: number }> = {};
      filteredScreenshots.forEach((scr) => {
        const shortName = scr.userName.split(' ')[0] || scr.userName;
        if (!userMap[shortName]) {
          userMap[shortName] = { name: shortName, activity: 0, mouse: 0, keyboard: 0, count: 0 };
        }
        userMap[shortName].activity += scr.activityPercent;
        userMap[shortName].mouse += (scr as any).mouseClicks || scr.mouseActivityPercent || 0;
        userMap[shortName].keyboard += (scr as any).keyboardStrokes || scr.keyboardActivityPercent || 0;
        userMap[shortName].count += 1;
      });
      return Object.values(userMap).map((item) => ({
        name: item.name,
        avgActivity: Math.round(item.activity / item.count),
        totalClicks: item.mouse,
        totalKeystrokes: item.keyboard,
      }));
    } else {
      return [
        { name: 'Alex', avgActivity: 92, totalClicks: 1450, totalKeystrokes: 3200 },
        { name: 'David', avgActivity: 88, totalClicks: 1200, totalKeystrokes: 2800 },
      ];
    }
  }, [filteredScreenshots]);

  return (
    <div id="activity-logs-view" className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Camera className="w-6 h-6 text-blue-600" /> Activity Monitoring & Screenshots Vault
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Realtime keyboard/mouse activity metrics, desktop window tracking, and visual screenshot timeline.
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Activity Level & Peripheral Input Chart
            </h3>
            <p className="text-xs text-slate-500">
              Average activity score percentage recorded per team member
            </p>
          </div>
          <span className="text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-lg">
            Period: {getPeriodLabel()}
          </span>
        </div>
        <div className="h-60 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activityChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="avgActivity" name="Average Activity %" fill="#2563eb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {!isAgentOnly && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Employee Directory – Surveillance & Monitoring Controls
              </h3>
              <p className="text-xs text-slate-500">
                Toggles for Screenshot Captures and Keyboard/Mouse Activity Monitoring.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleBulkIdlePrompt(true)}
                className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>Turn ON Idle for ALL</span>
              </button>
              <button
                type="button"
                onClick={() => handleBulkIdlePrompt(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>Turn OFF Idle for ALL</span>
              </button>
              <span className="text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1 rounded-lg">
                Showing {paginatedSurveillanceUsers.length} of {users.length} Staff
              </span>
            </div>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Role & Designation</th>
                  <th className="py-3 px-4 text-center">Screenshot Monitoring</th>
                  <th className="py-3 px-4 text-center">Activity Monitoring</th>
                  <th className="py-3 px-4 text-center">Idle Detection (10m / Screen Lock)</th>
                  <th className="py-3 px-4 text-right">Idle Time Tracked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {paginatedSurveillanceUsers.map((usr) => {
                  const isScreenshotOn = usr.screenshotMonitored === true;
                  const isActivityOn = usr.activityMonitored === true;
                  const isIdleOn = usr.idleTrackingEnabled === true;
                  return (
                    <tr key={usr.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <div className="font-bold text-slate-900">{usr.name}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{usr.employeeCode || 'LLC-0001'}</div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{usr.designation}</div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">{usr.role}</span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleScreenshotPrompt(usr, isScreenshotOn)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                            isScreenshotOn
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>{isScreenshotOn ? 'Screenshots ON' : 'Screenshots OFF'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleActivityPrompt(usr, isActivityOn)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                            isActivityOn
                              ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                              : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          <MousePointer className="w-3.5 h-3.5" />
                          <span>{isActivityOn ? 'Activity ON' : 'Activity OFF'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleToggleIdleTrackingPrompt(usr, isIdleOn)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                            isIdleOn
                              ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 font-extrabold shadow-sm'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          <span>{isIdleOn ? 'Idle Detection ON' : 'Idle Detection OFF'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="font-mono font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          {getUserIdleTimeStr(usr.id)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500 font-medium">
              Page {safeSurveillancePage} of {totalSurveillancePages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSurveillancePage((p) => Math.max(1, p - 1))}
                disabled={safeSurveillancePage <= 1}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                onClick={() => setSurveillancePage((p) => Math.min(totalSurveillancePages, p + 1))}
                disabled={safeSurveillancePage >= totalSurveillancePages}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-xs font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 backdrop-blur-md p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-slate-900">{selectedImage.userName}</h3>
                  <span className="text-xs font-mono font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                    {selectedImage.timestamp}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedImage(null)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm cursor-pointer transition-all"
              >
                Close Window
              </button>
            </div>
            <div className="relative rounded-xl overflow-hidden border border-slate-300 bg-slate-950 max-h-[60vh] flex items-center justify-center">
              <img
                src={selectedImage.imageUrl}
                alt={selectedImage.activeApp}
                className="max-h-[60vh] object-contain w-full"
              />
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ isOpen: false })}
        onConfirm={() => {
          if (confirmModal.action) confirmModal.action();
        }}
        title={confirmModal.title}
        description={confirmModal.description}
        employeeName={confirmModal.employeeName}
        employeeCode={confirmModal.employeeCode}
        fromValue={confirmModal.fromValue}
        toValue={confirmModal.toValue}
        confirmText={confirmModal.confirmText}
        variant={confirmModal.variant}
      />
    </div>
  );
};
