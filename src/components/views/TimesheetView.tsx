import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { getManilaDateString, formatTotalTime } from '../../lib/dateUtils';
import { DEFAULT_SPREADSHEET_ID, DEFAULT_SPREADSHEET_URL, generateAppsScriptCode } from '../../lib/googleSheetsSync';
import {
  Calendar,
  Trash2,
  Edit3,
  Clock,
  Plus,
  FileSpreadsheet,
  Layers,
  BarChart3,
  CheckCircle2,
  Coffee,
  ListFilter,
  PieChart as PieIcon,
  Search,
  User,
  ShieldCheck,
  X,
  Users,
  Play,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Check,
  Copy,
  AlertTriangle,
  Code,
  Download,
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
import { TASK_LIST } from '../../data/initialData';
import { TimeLog } from '../../types';
import { UserAvatar } from '../UserAvatar';
import { resolveCanonicalEmployee } from '../../lib/userUtils';
import { EditTimeLogModal } from '../modals/EditTimeLogModal';

interface TimesheetViewProps {
  onOpenManualModal: () => void;
  isPersonalOnly?: boolean;
}

type ViewTabMode = 'daily' | 'weekly' | 'monthly' | 'summary';

export const TimesheetView: React.FC<TimesheetViewProps> = ({
  onOpenManualModal,
  isPersonalOnly = false,
}) => {
  const {
    timeLogs,
    users,
    userPresenceList,
    dailyAttendanceLogs,
    currentUser,
    deleteTimeLog,
    formatDuration,
    isTracking,
    isPaused,
    currentTask,
    elapsedSeconds,
    googleSheetsWebhookUrl,
    setGoogleSheetsWebhookUrl,
    triggerGoogleSheetsSync,
    importTimeLogsFromGoogleSheets,
  } = useApp();

  const isPersonalView =
    isPersonalOnly ||
    currentUser.role === 'agent' ||
    currentUser.role === 'team_lead';

  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [showWebhookSetup, setShowWebhookSetup] = useState(false);
  const [webhookInputVal, setWebhookInputVal] = useState(googleSheetsWebhookUrl || '');
  const [copiedScript, setCopiedScript] = useState(false);
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null);

  useEffect(() => {
    setWebhookInputVal(googleSheetsWebhookUrl || '');
  }, [googleSheetsWebhookUrl]);

  useEffect(() => {
    let isMounted = true;
    let isRefreshing = false;
    const performRefresh = async () => {
      if (isRefreshing) return;
      isRefreshing = true;
      try {
        await importTimeLogsFromGoogleSheets();
      } catch (err) {
        console.warn('[TimesheetView] Google Sheets 60s background refresh notice:', err);
      } finally {
        if (isMounted) {
          isRefreshing = false;
        }
      }
    };
    performRefresh();
    const interval = setInterval(() => {
      if (isMounted && !isRefreshing) {
        performRefresh();
      }
    }, 120000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [importTimeLogsFromGoogleSheets]);

  const handleManualSheetsSync = async () => {
    setIsSyncingSheets(true);
    setSyncStatusMsg('Pushing all timesheets & shift records to Google Sheets...');
    const res = await triggerGoogleSheetsSync(webhookInputVal.trim() || googleSheetsWebhookUrl);
    setIsSyncingSheets(false);
    if (res && res.success) {
      setSyncStatusMsg(`✓ ${res.message || 'Successfully recorded timesheets into Google Sheets!'}`);
      setTimeout(() => setSyncStatusMsg(null), 8000);
    } else {
      setSyncStatusMsg(`Sync notice: ${res?.message || 'Check Apps Script Webhook URL'}`);
    }
  };

  const handleSaveWebhook = async () => {
    if (!webhookInputVal.trim() || webhookInputVal.includes('...') || !webhookInputVal.trim().startsWith('https://')) {
      setSyncStatusMsg('Please enter a valid Google Apps Script Web App URL ending in /exec');
      return;
    }
    setGoogleSheetsWebhookUrl(webhookInputVal.trim());
    setIsSyncingSheets(true);
    setSyncStatusMsg('Saving Webhook & testing Google Sheets sync...');
    const res = await triggerGoogleSheetsSync(webhookInputVal.trim());
    setIsSyncingSheets(false);
    if (res && res.success) {
      setSyncStatusMsg('✓ Connected! Timesheets are now actively streaming to Google Sheets.');
      setShowWebhookSetup(false);
      setTimeout(() => setSyncStatusMsg(null), 8000);
    } else {
      setSyncStatusMsg(`Sync attempted: ${res?.message || 'Please verify Apps Script permissions'}`);
    }
  };

  const [viewTab, setViewTab] = useState<ViewTabMode>('daily');
  const [selectedTaskFilter, setSelectedTaskFilter] = useState<string>('ALL');
  const [agentSearch, setAgentSearch] = useState<string>('');

  const todayStr = getManilaDateString();
  const [anchorDate, setAnchorDate] = useState<string>(todayStr);

  const getSundaySaturday = (refDateStr: string) => {
    const refDate = new Date(refDateStr || todayStr);
    const dayOfWeek = refDate.getDay(); // 0 = Sunday, 6 = Saturday
    const sunday = new Date(refDate);
    sunday.setDate(refDate.getDate() - dayOfWeek);
    const saturday = new Date(sunday);
    saturday.setDate(sunday.getDate() + 6);
    return {
      start: getManilaDateString(sunday),
      end: getManilaDateString(saturday),
    };
  };

  const initialWeek = getSundaySaturday(todayStr);
  const [weekStartDate, setWeekStartDate] = useState<string>(initialWeek.start);
  const [weekEndDate, setWeekEndDate] = useState<string>(initialWeek.end);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const YEAR_OPTIONS = Array.from({ length: 7 }, (_, i) => currentYear - 3 + i);

  const formatDateDDMMYYYY = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const formatHoursMins = (totalSeconds: number, includeSeconds = false): string => {
    if (!totalSeconds || totalSeconds <= 0) return includeSeconds ? '0h 0m 0s' : '0h 0m';
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);
    if (includeSeconds) {
      if (h === 0) return `${m}m ${s}s`;
      return `${h}h ${m}m ${s}s`;
    }
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const normalizeDate = (rawDate?: string, startTimeIso?: string): string => {
    // If rawDate is already a clean YYYY-MM-DD date without T, use it directly
    if (rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim()) && !rawDate.includes('T')) {
      return rawDate.trim();
    }
    // If we have an ISO string, parse it to Manila Local Date (Asia/Manila)
    const isoString = startTimeIso || (rawDate && rawDate.includes('T') ? rawDate : '');
    if (isoString) {
      const parsed = new Date(isoString);
      if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000) {
        return getManilaDateString(parsed);
      }
    }
    const candidate = String(rawDate || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000) {
      return getManilaDateString(parsed);
    }
    return candidate;
  };

  const allAvailableLogs = useMemo(() => {
    const list: TimeLog[] = [...timeLogs];
    const today = getManilaDateString();

    users.forEach((u) => {
      const isCurrentActiveUser = Boolean(
        isTracking &&
        currentUser &&
        (
          currentUser.id === u.id ||
          (currentUser.employeeCode && u.employeeCode && currentUser.employeeCode.toUpperCase() === u.employeeCode.toUpperCase()) ||
          (currentUser.name && u.name && currentUser.name.toLowerCase().trim() === u.name.toLowerCase().trim())
        )
      );

      const presence = userPresenceList.find(
        (p) =>
          p.userId === u.id ||
          (p.employeeCode &&
            u.employeeCode &&
            p.employeeCode.toUpperCase() === u.employeeCode.toUpperCase()) ||
          (p.userName &&
            u.name &&
            p.userName.toLowerCase().trim() === u.name.toLowerCase().trim())
      );

      const isUserTracking =
        isCurrentActiveUser ||
        presence?.isTracking === true;

      if (!isUserTracking) return;

      const runningIndex = list.findIndex(
        (l) =>
          (l.userId === u.id ||
            ((l as any).employeeCode &&
              (l as any).employeeCode === u.employeeCode)) &&
          normalizeDate(l.date, l.startTime) === today &&
          (l.status === 'running' ||
            l.endTime === 'Running Live' ||
            l.endTime === 'In Progress (Live)')
      );

      const existingRunningLog = runningIndex >= 0 ? list[runningIndex] : undefined;
      const persistedDuration = Math.max(0, Number(existingRunningLog?.durationSeconds) || 0);
      const presenceDuration = Math.max(0, Number(presence?.elapsedSeconds) || 0);

      let liveElapsed = 0;
      if (isCurrentActiveUser) {
        liveElapsed = Math.max(elapsedSeconds, persistedDuration);
      } else if (presenceDuration > 0 && presenceDuration > persistedDuration) {
        liveElapsed = presenceDuration;
      } else if (persistedDuration > 0) {
        liveElapsed = persistedDuration;
      } else {
        liveElapsed = presenceDuration;
      }

      const activeTask = isCurrentActiveUser
        ? (currentTask || 'Active Shift')
        : (presence?.currentTask || existingRunningLog?.task || 'Active Shift');

      const liveStartTime =
        existingRunningLog?.startTime ||
        presence?.startTime ||
        new Date(Date.now() - liveElapsed * 1000).toISOString();

      const liveLog: TimeLog = {
        id:
          runningIndex >= 0
            ? list[runningIndex].id
            : `live-ongoing-${u.id}-${today}`,
        userId: u.id,
        userName: u.name,
        userAvatar: u.avatar || '',
        designation: u.designation || 'Agent',
        task: activeTask,
        date: today,
        startTime:
          runningIndex >= 0
            ? (list[runningIndex].startTime || liveStartTime)
            : liveStartTime,
        endTime: 'In Progress (Live)',
        durationSeconds: liveElapsed,
        status: 'running',
        geoTimezone: u.geoTimezone || 'Asia/Manila',
        geoLocalStartTime: new Date(
          runningIndex >= 0
            ? (list[runningIndex].startTime || liveStartTime)
            : liveStartTime
        ).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        }),
        appsUsed: [],
        idleSeconds:
          presence?.idleDeductionSeconds ||
          (existingRunningLog?.idleSeconds || 0),
        mouseActivityAvg: presence?.mouseActivity ?? existingRunningLog?.mouseActivityAvg ?? 95,
        keyboardActivityAvg: presence?.keyboardActivity ?? existingRunningLog?.keyboardActivityAvg ?? 95,
        notes: existingRunningLog?.notes || 'Live Active Shift',
      };

      if (runningIndex >= 0) {
        list[runningIndex] = {
          ...list[runningIndex],
          ...liveLog,
          durationSeconds: Math.max(persistedDuration, liveElapsed),
        };
      } else {
        list.unshift(liveLog);
      }
    });

    return list;
  }, [
    timeLogs,
    users,
    userPresenceList,
    dailyAttendanceLogs,
    currentUser,
    isTracking,
    currentTask,
    elapsedSeconds,
  ]);

  const isLogInPeriod = (logDateStr: string, mode: ViewTabMode, startTimeIso?: string) => {
    const normalized = normalizeDate(logDateStr, startTimeIso);
    if (!normalized) return true;
    if (mode === 'daily') {
      return normalized === anchorDate;
    }
    if (mode === 'weekly') {
      if (!weekStartDate || !weekEndDate) return true;
      return normalized >= weekStartDate && normalized <= weekEndDate;
    }
    if (mode === 'monthly') {
      const monthPadded = String(selectedMonth + 1).padStart(2, '0');
      const targetPrefix = `${selectedYear}-${monthPadded}`;
      return normalized.startsWith(targetPrefix);
    }
    return true;
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
      const w = getSundaySaturday(anchorDate || todayStr);
      setWeekStartDate(w.start);
      setWeekEndDate(w.end);
    }
  };

  const filteredLogs = useMemo(() => {
    return allAvailableLogs
      .filter((log) => {
        if (isPersonalView || currentUser.role === 'agent') {
          const uCode = (currentUser.employeeCode || '').trim().toUpperCase();
          const uId = (currentUser.id || '').trim().toLowerCase();
          const uName = (currentUser.name || '').trim().toLowerCase();
          const logEmpCode = ((log as any).employeeCode || '').trim().toUpperCase();
          const logUId = (log.userId || '').trim().toLowerCase();
          const logUName = (log.userName || '').trim().toLowerCase();

          const matchesByCode = Boolean(uCode && logEmpCode && uCode === logEmpCode);
          const matchesById = Boolean(uId && logUId && uId === logUId);
          const matchesByName = Boolean(uName && logUName && uName === logUName);

          const canonicalLogUser = resolveCanonicalEmployee(logEmpCode || logUName || logUId);
          const canonicalCurrent = resolveCanonicalEmployee(uCode || uName || uId);
          const matchesCanonical = Boolean(
            canonicalLogUser && canonicalCurrent && canonicalLogUser.code === canonicalCurrent.code
          );

          const matchesUser = matchesByCode || matchesById || matchesByName || matchesCanonical;
          if (!matchesUser) return false;
        }

        const matchesPeriod = isLogInPeriod(log.date, viewTab, log.startTime);
        const matchesTask = selectedTaskFilter === 'ALL' || log.task === selectedTaskFilter;
        const query = agentSearch.trim().toLowerCase();
        const matchesSearch =
          isPersonalView ||
          !query ||
          log.userName.toLowerCase().includes(query) ||
          log.designation.toLowerCase().includes(query) ||
          log.userId.toLowerCase().includes(query);

        return matchesPeriod && matchesTask && matchesSearch;
      })
      .sort((a, b) => {
        const getTs = (l: TimeLog) => {
          if (l.startTime && !isNaN(Date.parse(l.startTime))) return new Date(l.startTime).getTime();
          if (l.date && !isNaN(Date.parse(l.date))) return new Date(l.date).getTime();
          return 0;
        };
        return getTs(b) - getTs(a);
      });
  }, [
    allAvailableLogs,
    currentUser,
    isPersonalView,
    viewTab,
    anchorDate,
    weekStartDate,
    weekEndDate,
    selectedMonth,
    selectedYear,
    selectedTaskFilter,
    agentSearch,
  ]);

  const periodFinalizedLogs = useMemo(
    () =>
      filteredLogs.filter(
        (log) =>
          log.status !== 'running' &&
          log.endTime !== 'Running Live' &&
          log.endTime !== 'In Progress (Live)'
      ),
    [filteredLogs]
  );

  const taskCategoryBreakdown = useMemo(() => {
    const map: Record<string, { seconds: number; count: number }> = {};
    filteredLogs.forEach((log) => {
      const taskName = log.task || 'Unspecified Task';
      const duration = Number(log.durationSeconds) || 0;
      if (!map[taskName]) {
        map[taskName] = { seconds: 0, count: 0 };
      }
      map[taskName].seconds += duration;
      map[taskName].count += 1;
    });
    return Object.entries(map).sort((a, b) => b[1].seconds - a[1].seconds);
  }, [filteredLogs]);

  const livePeriodSession = useMemo(() => {
    const today = getManilaDateString();
    if (!isLogInPeriod(today, viewTab)) {
      return {
        durationSeconds: 0,
        idleSeconds: 0,
        activity: 0,
      };
    }
    const currentUserId = (currentUser.id || '').trim().toLowerCase();
    const currentEmployeeCode = (currentUser.employeeCode || '').trim().toLowerCase();
    const currentName = (currentUser.name || '').trim().toLowerCase();

    const presence = userPresenceList.find((p) => {
      const pUserId = String(p.userId || '').trim().toLowerCase();
      const pCode = String(p.employeeCode || '').trim().toLowerCase();
      const pName = String(p.userName || '').trim().toLowerCase();
      return (
        (currentUserId && pUserId === currentUserId) ||
        (currentEmployeeCode && (pCode === currentEmployeeCode || pUserId === currentEmployeeCode)) ||
        (currentName && pName && pName === currentName)
      );
    });

    const liveLog = filteredLogs.find(
      (log) =>
        (log.status === 'running' ||
          log.endTime === 'Running Live' ||
          log.endTime === 'In Progress (Live)') &&
        (
          String(log.userId || '').trim().toLowerCase() === currentUserId ||
          (currentEmployeeCode &&
            (String((log as any).employeeCode || '').trim().toLowerCase() === currentEmployeeCode ||
             String(log.userId || '').trim().toLowerCase() === currentEmployeeCode)) ||
          (currentName && String(log.userName || '').trim().toLowerCase() === currentName)
        )
    );

    const isCurrentlyActive = Boolean(
      isTracking ||
      (presence && presence.isTracking === true) ||
      (liveLog && (liveLog.status === 'running' || liveLog.endTime === 'Running Live'))
    );

    const runningSeconds = isCurrentlyActive
      ? (isTracking
          ? Math.max(0, elapsedSeconds || 0)
          : Math.max(
              0,
              Number(liveLog?.durationSeconds || 0),
              Number(presence?.elapsedSeconds || 0)
            ))
      : 0;

    const idleSeconds = isCurrentlyActive
      ? Math.max(
          0,
          Number(
            presence?.idleDeductionSeconds ||
              (liveLog as any)?.idleSeconds ||
              0
          )
        )
      : 0;

    const activity = Math.round(
      (
        Number(presence?.mouseActivity ?? liveLog?.mouseActivityAvg ?? 95) +
        Number(presence?.keyboardActivity ?? liveLog?.keyboardActivityAvg ?? 90)
      ) / 2
    );

    return {
      durationSeconds: runningSeconds,
      idleSeconds,
      activity,
    };
  }, [
    filteredLogs,
    userPresenceList,
    currentUser,
    isTracking,
    elapsedSeconds,
    viewTab,
  ]);

  const totalGrossSeconds = useMemo(
    () =>
      periodFinalizedLogs.reduce(
        (acc, l) => acc + Math.max(0, Number(l.durationSeconds) || 0),
        0
      ) + livePeriodSession.durationSeconds,
    [periodFinalizedLogs, livePeriodSession.durationSeconds]
  );

  const totalIdleSeconds = useMemo(
    () =>
      periodFinalizedLogs.reduce(
        (acc, l) => acc + Math.max(0, Number(l.idleSeconds) || 0),
        0
      ) + livePeriodSession.idleSeconds,
    [periodFinalizedLogs, livePeriodSession.idleSeconds]
  );

  const totalNetSeconds = Math.max(0, totalGrossSeconds - totalIdleSeconds);
  const avgActivityScore = useMemo(() => {
    const finalizedCount = periodFinalizedLogs.length;
    const finalizedScore =
      periodFinalizedLogs.reduce(
        (acc, l) => acc + (Number(l.mouseActivityAvg) + Number(l.keyboardActivityAvg)) / 2,
        0
      );
    const totalScore =
      finalizedScore +
      (livePeriodSession.durationSeconds > 0 ? livePeriodSession.activity : 0);
    const count =
      finalizedCount +
      (livePeriodSession.durationSeconds > 0 ? 1 : 0);
    return count > 0 ? Math.round(totalScore / count) : 0;
  }, [periodFinalizedLogs, livePeriodSession]);

  const userSummaryList = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string;
        userName: string;
        userAvatar: string;
        designation: string;
        grossSeconds: number;
        idleSeconds: number;
        netSeconds: number;
        avgActivity: number;
        logCount: number;
      }
    >();

    filteredLogs.forEach((log) => {
      const existing = map.get(log.userId) || {
        userId: log.userId,
        userName: log.userName,
        userAvatar: log.userAvatar,
        designation: log.designation,
        grossSeconds: 0,
        idleSeconds: 0,
        netSeconds: 0,
        avgActivity: 0,
        logCount: 0,
      };
      const logAvgAct = Math.round((log.mouseActivityAvg + log.keyboardActivityAvg) / 2);
      existing.grossSeconds += log.durationSeconds;
      existing.idleSeconds += log.idleSeconds || 0;
      existing.netSeconds = Math.max(0, existing.grossSeconds - existing.idleSeconds);
      existing.avgActivity = Math.round(
        (existing.avgActivity * existing.logCount + logAvgAct) / (existing.logCount + 1)
      );
      existing.logCount += 1;
      map.set(log.userId, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.netSeconds - a.netSeconds);
  }, [filteredLogs]);

  const [summaryPage, setSummaryPage] = useState(1);
  const summaryPageSize = 10;
  useEffect(() => {
    setSummaryPage(1);
  }, [viewTab, selectedTaskFilter, agentSearch, anchorDate, weekStartDate, weekEndDate, selectedMonth, selectedYear]);

  const totalSummaryPages = Math.ceil(userSummaryList.length / summaryPageSize) || 1;
  const safeSummaryPage = Math.min(summaryPage, totalSummaryPages);
  const paginatedUserSummaryList = useMemo(() => {
    const start = (safeSummaryPage - 1) * summaryPageSize;
    return userSummaryList.slice(start, start + summaryPageSize);
  }, [userSummaryList, safeSummaryPage, summaryPageSize]);

  const [logsPage, setLogsPage] = useState(1);
  const logsPageSize = 10;
  useEffect(() => {
    setLogsPage(1);
  }, [viewTab, selectedTaskFilter, agentSearch, anchorDate, weekStartDate, weekEndDate, selectedMonth, selectedYear]);

  const totalLogsPages = Math.ceil(filteredLogs.length / logsPageSize) || 1;
  const safeLogsPage = Math.min(logsPage, totalLogsPages);
  const paginatedLogs = useMemo(() => {
    const start = (safeLogsPage - 1) * logsPageSize;
    return filteredLogs.slice(start, start + logsPageSize);
  }, [filteredLogs, safeLogsPage, logsPageSize]);

  const taskBreakdownList = useMemo(() => {
    const map = new Map<
      string,
      {
        taskName: string;
        durationSeconds: number;
        logCount: number;
        avgActivity: number;
      }
    >();
    let cumulativeTrackedSec = 0;
    filteredLogs.forEach((log) => {
      cumulativeTrackedSec += log.durationSeconds;
      const existing = map.get(log.task) || {
        taskName: log.task,
        durationSeconds: 0,
        logCount: 0,
        avgActivity: 0,
      };
      const logAvgAct = Math.round((log.mouseActivityAvg + log.keyboardActivityAvg) / 2);
      existing.durationSeconds += log.durationSeconds;
      existing.avgActivity = Math.round(
        (existing.avgActivity * existing.logCount + logAvgAct) / (existing.logCount + 1)
      );
      existing.logCount += 1;
      map.set(log.task, existing);
    });

    if (totalIdleSeconds > 0) {
      map.set('System Idle / Break Time', {
        taskName: 'System Idle / Break Time',
        durationSeconds: totalIdleSeconds,
        logCount: 0,
        avgActivity: 0,
      });
    }

    const result: {
      taskName: string;
      durationSeconds: number;
      percentage: number;
      logCount: number;
      avgActivity: number;
    }[] = [];
    const grandTotalSec = Math.max(1, cumulativeTrackedSec + totalIdleSeconds);
    map.forEach((value) => {
      const pct = Math.round((value.durationSeconds / grandTotalSec) * 100);
      result.push({
        ...value,
        percentage: pct,
      });
    });
    return result.sort((a, b) => b.durationSeconds - a.durationSeconds);
  }, [filteredLogs, totalIdleSeconds]);

  const timesheetChartData = useMemo(() => {
    if (filteredLogs.length > 0) {
      const map: Record<string, { name: string; trackedHours: number; idleHours: number }> = {};
      filteredLogs.forEach((log) => {
        const rawKey = isPersonalView ? formatDateDDMMYYYY(log.date) : log.task;
        const shortKey = rawKey.length > 18 ? rawKey.substring(0, 18) + '...' : rawKey;
        if (!map[shortKey]) {
          map[shortKey] = { name: shortKey, trackedHours: 0, idleHours: 0 };
        }
        map[shortKey].trackedHours += log.durationSeconds / 3600;
        map[shortKey].idleHours += (log.idleSeconds || 0) / 3600;
      });
      return Object.values(map).map((item) => ({
        ...item,
        trackedHours: Number(item.trackedHours.toFixed(1)),
        idleHours: Number(item.idleHours.toFixed(1)),
      }));
    }
    return [];
  }, [filteredLogs, isPersonalView]);

  const handleExportCSV = () => {
    const headers = [
      'Log ID',
      'User Name',
      'Designation',
      'Task',
      'Date',
      'GEO Start Time',
      'Duration (Seconds)',
      'Total Time',
      'Idle Sec',
      'Net Recorded Sec',
      'Activity Score %',
      'Notes',
    ];
    const rows = filteredLogs.map((l) => [
      l.id,
      `"${l.userName}"`,
      `"${l.designation}"`,
      `"${l.task}"`,
      l.date,
      `"${l.geoLocalStartTime}"`,
      l.durationSeconds,
      `"${formatTotalTime(l.durationSeconds)}"`,
      l.idleSeconds || 0,
      Math.max(0, l.durationSeconds - (l.idleSeconds || 0)),
      Math.round((l.mouseActivityAvg + l.keyboardActivityAvg) / 2),
      `"${l.notes || ''}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `LLC_Time_Tracker_V2_${isPersonalView ? 'My_Personal' : 'Team'}_Timesheet_${getPeriodLabel().replace(/[^a-zA-Z0-9]/g, '_')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const dailySummaryList = useMemo(() => {
    const groups = new Map<string, TimeLog[]>();
    filteredLogs.forEach((l) => {
      const d = l.date || (l.startTime ? l.startTime.split('T')[0] : todayStr);
      const empCode = (l as any).employeeCode || l.userId || 'UNKNOWN';
      const key = `${d}__${empCode}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(l);
    });

    return Array.from(groups.entries()).map(([key, logs]) => {
      const [logDate, empCode] = key.split('__');
      const first = logs[0];
      const tasks = Array.from(new Set(logs.map((l) => l.task).filter(Boolean))).join(', ');

      // Filter out duplicate running segments: keep completed logs + only the single latest running segment
      const completedLogs = logs.filter((l) => l.status === 'completed');
      const runningLogs = logs.filter((l) => l.status === 'running' || l.endTime === 'Running Live');
      const latestRunningLog = runningLogs.length > 0 ? runningLogs[runningLogs.length - 1] : null;

      const consolidatedLogs = latestRunningLog ? [...completedLogs, latestRunningLog] : completedLogs;
      const logsForTiming = consolidatedLogs.length > 0 ? consolidatedLogs : logs;

      const sorted = [...logsForTiming].sort((a, b) => {
        const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
        const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
        return ta - tb;
      });
      const earliest = sorted[0];
      const latest = sorted[sorted.length - 1];

      const isRunning = logs.some((l) => l.status === 'running' || l.endTime === 'Running Live');
      const firstClockIn = earliest?.geoLocalStartTime || earliest?.startTime || '09:00:00 AM';
      const lastClockOut = isRunning ? 'Running Live' : (latest?.geoLocalEndTime || latest?.endTime || '05:00:00 PM');

      const grossSec = consolidatedLogs.reduce((acc, l) => acc + Math.max(0, Number(l.durationSeconds) || 0), 0);
      const idleSec = consolidatedLogs.reduce((acc, l) => acc + Math.max(0, Number(l.idleSeconds) || 0), 0);
      const netSec = Math.max(0, grossSec - idleSec);

      const avgAct = Math.round(
        consolidatedLogs.reduce((acc, l) => acc + (Number(l.mouseActivityAvg || 95) + Number(l.keyboardActivityAvg || 90)) / 2, 0) /
          (consolidatedLogs.length || 1)
      );

      return {
        date: logDate,
        employeeCode: empCode,
        employeeName: first?.userName || empCode,
        designation: first?.designation || 'Agent',
        tasksWorkedOn: tasks || 'Active Shift',
        firstClockIn,
        lastClockOut,
        grossTrackedShift: formatTotalTime(grossSec),
        totalIdleBreaks: formatTotalTime(idleSec),
        netProductiveWork: formatTotalTime(netSec),
        durationSeconds: netSec,
        avgActivity: `${avgAct}%`,
        shiftStatus: isRunning ? 'Active Shift' : 'Shift Completed',
        logEntries: consolidatedLogs.length,
      };
    });
  }, [filteredLogs, todayStr]);

  const handleExportDailySummaryCSV = () => {
    const headers = [
      'Date',
      'Employee Code',
      'Employee Name',
      'Designation',
      'Tasks Worked On',
      'First Clock-In (Manila GMT+8)',
      'Last Clock-Out (Manila GMT+8)',
      'Gross Tracked Shift',
      'Total Idle / Breaks',
      'Net Productive Work',
      'Duration (Seconds)',
      'Avg Activity %',
      'Shift Status',
      'Log Entries',
    ];
    const rows = dailySummaryList.map((s) => [
      s.date,
      `"${s.employeeCode}"`,
      `"${s.employeeName}"`,
      `"${s.designation}"`,
      `"${s.tasksWorkedOn}"`,
      `"${s.firstClockIn}"`,
      `"${s.lastClockOut}"`,
      `"${s.grossTrackedShift}"`,
      `"${s.totalIdleBreaks}"`,
      `"${s.netProductiveWork}"`,
      s.durationSeconds,
      `"${s.avgActivity}"`,
      `"${s.shiftStatus}"`,
      s.logEntries,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `LLC_Time_Tracker_V2_Daily_Summary_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const canSearchAgents = currentUser.role !== 'agent';

  return (
    <div id="timesheet-view" className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              {isPersonalView ? (
                <>
                  <User className="w-6 h-6 text-emerald-600" /> My Personal Timesheet
                </>
              ) : (
                <>
                  <Calendar className="w-6 h-6 text-blue-600" /> Timesheets & Shift Records
                </>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isPersonalView
                ? `View and manage your personal time logs, tracked work sessions, and task history for ${currentUser.name}.`
                : 'Monitor, review, and export employee shift logs, task activities, and time tracking data across Daily, Weekly, and Monthly periods.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(currentUser.role === 'admin' || currentUser.role === 'va_admin' || (currentUser.employeeCode || '').toLowerCase().includes('admin') || (currentUser.employeeCode || '').toLowerCase().includes('super') || currentUser.id === 'usr-superadmin-red') && !isPersonalView && (
              <button
                onClick={onOpenManualModal}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 transition-all shadow-md hover:shadow-blue-200 cursor-pointer border border-blue-500 active:scale-95"
                title="Super Admin Direct Manual Timesheet Entry"
              >
                <Plus className="w-4 h-4" />
                <span>+ Manual Entry Timesheet</span>
              </button>
            )}
            {currentUser.role !== 'agent' && currentUser.role !== 'team_lead' && !isPersonalView && (
              <>
                <button
                  onClick={handleManualSheetsSync}
                  disabled={isSyncingSheets}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  title="Force sync all timesheets, shift records, and daily summaries to Google Sheets"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingSheets ? 'animate-spin' : ''}`} />
                  <span>{isSyncingSheets ? 'Syncing Sheets...' : 'Push to Google Sheets'}</span>
                </button>
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-xs flex items-center gap-2 transition-all shadow-sm cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Export CSV
                </button>
              </>
            )}
          </div>
        </div>

        {syncStatusMsg && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>{syncStatusMsg}</span>
            </div>
            <button
              onClick={() => setSyncStatusMsg(null)}
              className="text-blue-500 hover:text-blue-700 text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {isPersonalView ? (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 border border-slate-700 rounded-2xl p-6 text-white shadow-lg space-y-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-700/80">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-white">
                  {currentUser.name} – Personal Timesheet
                </h3>
                <span className="bg-emerald-500 text-slate-950 text-[10px] px-2.5 py-0.5 rounded-full font-extrabold flex items-center gap-1 uppercase">
                  <ShieldCheck className="w-3 h-3" /> {currentUser.role.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                {currentUser.employeeCode || 'LLC-0001'} • {currentUser.designation} • {currentUser.department || 'Operations'}
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-800/80 border border-slate-700 text-emerald-400 px-3 py-1.5 rounded-xl flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              {viewTab.toUpperCase()} Period: {getPeriodLabel()}
            </span>
          </div>

          {isTracking && (
            <div className="bg-emerald-950/80 border border-emerald-500/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-inner">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <Play className="w-5 h-5 fill-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-emerald-300">Live Active Session Tracking Right Now</span>
                    <span className="bg-emerald-500/30 text-emerald-200 border border-emerald-400/50 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                      {isPaused ? 'PAUSED' : 'RECORDING'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Currently tracking task: <strong className="text-white">"{currentTask || 'General'}"</strong> on Desktop App.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider block">Live Session Elapsed</span>
                <span className="font-mono text-2xl font-black text-white">{formatDuration(elapsedSeconds)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-800/60 border border-slate-700 p-3.5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider">Total Logged Time</span>
                {isTracking && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded-full uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
                  </span>
                )}
              </div>
              <div className="font-mono text-xl font-bold text-white mt-1">
                {formatHoursMins(totalGrossSeconds, isTracking)}
              </div>
              <span className="text-[10px] text-slate-400">
                Gross tracked shift time
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Total Idle / Break Time</span>
              <div className="font-mono text-xl font-bold text-amber-400 mt-1">{formatHoursMins(totalIdleSeconds)}</div>
              <span className="text-[10px] text-slate-400">System detected idle pauses</span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 p-3.5 rounded-xl">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Net Recorded Time</span>
                {isTracking && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded-full uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> ACTIVE
                  </span>
                )}
              </div>
              <div className="font-mono text-2xl font-black text-emerald-400 mt-1">
                {formatHoursMins(totalNetSeconds, isTracking)}
              </div>
              <span className="text-[10px] text-emerald-300 font-semibold">
                Net Active Work Time
              </span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700 p-3.5 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider">Avg Activity Rating</span>
              <div className="font-mono text-xl font-bold text-purple-300 mt-1">{avgActivityScore}%</div>
              <span className="text-[10px] text-slate-400">Mouse & Keyboard activity</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Team Hours</span>
              <div className="font-mono text-lg font-extrabold text-slate-900">{formatHoursMins(totalGrossSeconds)}</div>
              <span className="text-[10px] text-slate-500">Gross tracked shift time</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <Coffee className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Idle / Breaks</span>
              <div className="font-mono text-lg font-extrabold text-amber-600">{formatHoursMins(totalIdleSeconds)}</div>
              <span className="text-[10px] text-slate-500">System idle deductions</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Net Work Recorded</span>
              <div className="font-mono text-xl font-black text-emerald-700">{formatHoursMins(totalNetSeconds)}</div>
              <span className="text-[10px] text-emerald-600 font-semibold">Net Active Work</span>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="p-3 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Active Staff Listed</span>
              <div className="font-mono text-lg font-extrabold text-slate-900">{userSummaryList.length}</div>
              <span className="text-[10px] text-slate-500">Staff with logs in period</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="shrink-0 flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => handleTabSwitch('daily')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                viewTab === 'daily'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Daily View
            </button>
            <button
              onClick={() => handleTabSwitch('weekly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                viewTab === 'weekly'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Weekly View
            </button>
            <button
              onClick={() => handleTabSwitch('monthly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                viewTab === 'monthly'
                  ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Monthly View
            </button>
            {!isPersonalView && (
              <button
                onClick={() => handleTabSwitch('summary')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  viewTab === 'summary'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daily Summary (Spreadsheet)
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Date / Month Filter Controls */}
            {viewTab === 'daily' && (
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    const parts = anchorDate.split('-').map(Number);
                    const d = new Date(parts[0], parts[1] - 1, parts[2] - 1);
                    setAnchorDate(getManilaDateString(d));
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </button>

                <div className="flex items-center gap-1 px-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-500">Date:</span>
                  <input
                    type="date"
                    value={anchorDate}
                    onChange={(e) => e.target.value && setAnchorDate(e.target.value)}
                    className="bg-transparent text-slate-800 text-xs font-bold focus:outline-none cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const parts = anchorDate.split('-').map(Number);
                    const d = new Date(parts[0], parts[1] - 1, parts[2] + 1);
                    setAnchorDate(getManilaDateString(d));
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Next Day"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {anchorDate !== todayStr && (
                  <button
                    type="button"
                    onClick={() => setAnchorDate(todayStr)}
                    className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-2 py-1 rounded-lg transition-all cursor-pointer shadow-2xs ml-0.5"
                    title="Reset to Today"
                  >
                    Today
                  </button>
                )}
              </div>
            )}

            {viewTab === 'weekly' && (
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    const sParts = weekStartDate.split('-').map(Number);
                    const eParts = weekEndDate.split('-').map(Number);
                    const s = new Date(sParts[0], sParts[1] - 1, sParts[2] - 7);
                    const e = new Date(eParts[0], eParts[1] - 1, eParts[2] - 7);
                    setWeekStartDate(getManilaDateString(s));
                    setWeekEndDate(getManilaDateString(e));
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Previous Week"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Prev Week</span>
                </button>

                <div className="flex items-center gap-1.5 px-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-500">From:</span>
                  <input
                    type="date"
                    value={weekStartDate}
                    onChange={(e) => e.target.value && setWeekStartDate(e.target.value)}
                    className="bg-transparent text-slate-800 text-xs font-bold focus:outline-none cursor-pointer"
                  />
                  <span className="text-[11px] font-bold text-slate-500">To:</span>
                  <input
                    type="date"
                    value={weekEndDate}
                    onChange={(e) => e.target.value && setWeekEndDate(e.target.value)}
                    className="bg-transparent text-slate-800 text-xs font-bold focus:outline-none cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const sParts = weekStartDate.split('-').map(Number);
                    const eParts = weekEndDate.split('-').map(Number);
                    const s = new Date(sParts[0], sParts[1] - 1, sParts[2] + 7);
                    const e = new Date(eParts[0], eParts[1] - 1, eParts[2] + 7);
                    setWeekStartDate(getManilaDateString(s));
                    setWeekEndDate(getManilaDateString(e));
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Next Week"
                >
                  <span className="hidden sm:inline">Next Week</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const w = getSundaySaturday(todayStr);
                    setWeekStartDate(w.start);
                    setWeekEndDate(w.end);
                  }}
                  className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-2 py-1 rounded-lg transition-all cursor-pointer shadow-2xs ml-0.5"
                  title="This Week"
                >
                  This Week
                </button>
              </div>
            )}

            {viewTab === 'monthly' && (
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-1.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedMonth === 0) {
                      setSelectedMonth(11);
                      setSelectedYear((y) => y - 1);
                    } else {
                      setSelectedMonth((m) => m - 1);
                    }
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Prev Month</span>
                </button>

                <div className="flex items-center gap-1.5 px-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="bg-transparent text-slate-800 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    {MONTH_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="bg-transparent text-slate-800 text-xs font-bold focus:outline-none cursor-pointer"
                  >
                    {YEAR_OPTIONS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedMonth === 11) {
                      setSelectedMonth(0);
                      setSelectedYear((y) => y + 1);
                    } else {
                      setSelectedMonth((m) => m + 1);
                    }
                  }}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Next Month"
                >
                  <span className="hidden sm:inline">Next Month</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setSelectedMonth(now.getMonth());
                    setSelectedYear(now.getFullYear());
                  }}
                  className="text-[10px] bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-2 py-1 rounded-lg transition-all cursor-pointer shadow-2xs ml-0.5"
                  title="This Month"
                >
                  This Month
                </button>
              </div>
            )}

            {!isPersonalView && canSearchAgents && (
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 w-36 sm:w-44 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-all shadow-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Search Agent..."
                  className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none w-full"
                />
                {agentSearch && (
                  <button
                    type="button"
                    onClick={() => setAgentSearch('')}
                    className="p-0.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
              <ListFilter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedTaskFilter}
                onChange={(e) => setSelectedTaskFilter(e.target.value)}
                className="bg-transparent text-slate-800 text-xs font-medium focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Tasks - Filter</option>
                {TASK_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {viewTab === 'summary' ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Google Sheets Daily_Summary Worksheet ({dailySummaryList.length} Staff Days)
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Executive daily aggregates matching the Google Spreadsheet schema with net productive hours and shift status.
              </p>
            </div>
            <button
              onClick={handleExportDailySummaryCSV}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" /> Export Daily Summary CSV
            </button>
          </div>
          {dailySummaryList.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No daily summaries available for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-100/70 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Employee Code</th>
                    <th className="py-3 px-4">Employee Name</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4">Tasks Worked On</th>
                    <th className="py-3 px-4">First Clock-In</th>
                    <th className="py-3 px-4">Last Clock-Out</th>
                    <th className="py-3 px-4">Gross Tracked</th>
                    <th className="py-3 px-4">Total Idle/Breaks</th>
                    <th className="py-3 px-4 text-emerald-700">Net Productive Work</th>
                    <th className="py-3 px-4">Duration (s)</th>
                    <th className="py-3 px-4">Avg Activity</th>
                    <th className="py-3 px-4">Shift Status</th>
                    <th className="py-3 px-4">Logs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {dailySummaryList.map((row, idx) => (
                    <tr key={`${row.date}-${row.employeeCode}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-700">{row.date}</td>
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">{row.employeeCode}</td>
                      <td className="py-3 px-4 font-semibold text-slate-900">{row.employeeName}</td>
                      <td className="py-3 px-4 text-slate-600">{row.designation}</td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate" title={row.tasksWorkedOn}>{row.tasksWorkedOn}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">{row.firstClockIn}</td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {row.lastClockOut === 'Running Live' ? (
                          <span className="text-emerald-600 font-bold animate-pulse">Running Live</span>
                        ) : (
                          row.lastClockOut
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">{row.grossTrackedShift}</td>
                      <td className="py-3 px-4 font-mono text-amber-600 font-semibold">{row.totalIdleBreaks}</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-700">
                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-mono font-bold">
                          {row.netProductiveWork}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{row.durationSeconds}s</td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600">{row.avgActivity}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          row.shiftStatus === 'Active Shift'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {row.shiftStatus}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-center font-semibold text-slate-600">{row.logEntries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 3: Personal Task Category Breakdown */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-blue-600" />
                <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                  Personal Task Category Breakdown ({getPeriodLabel()})
                </h4>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {taskCategoryBreakdown.length} Active Task Categories
              </span>
            </div>

            {taskCategoryBreakdown.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">
                No task category data available for this timeframe.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                {taskCategoryBreakdown.map(([taskName, stats]) => {
                  const percentOfTotal = totalGrossSeconds > 0
                    ? Math.round((stats.seconds / totalGrossSeconds) * 100)
                    : 0;
                  return (
                    <div
                      key={taskName}
                      className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center justify-between hover:border-blue-300 transition-all shadow-2xs"
                    >
                      <div className="space-y-0.5 max-w-[70%]">
                        <span className="text-xs font-bold text-slate-900 block truncate" title={taskName}>
                          {taskName}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {stats.count} {stats.count === 1 ? 'session' : 'sessions'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-sm font-extrabold text-blue-700 block">
                          {formatHoursMins(stats.seconds)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded">
                          {percentOfTotal}% of period
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: My Detailed Session Logs */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider">
                {isPersonalView ? 'My Detailed Session Logs' : 'Detailed Itemized Session Logs'} ({filteredLogs.length} Entries)
              </h4>
            </div>
          {filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No itemized logs match your filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/50 text-slate-500 font-bold uppercase tracking-wider">
                  <tr>
                    {!isPersonalView && <th className="py-3 px-4">Agent</th>}
                    <th className="py-3 px-4">Task Category</th>
                    <th className="py-3 px-4">Date & Start Time</th>
                    <th className="py-3 px-4">End Time</th>
                    <th className="py-3 px-4">Duration (s)</th>
                    <th className="py-3 px-4 text-slate-800">Total Time</th>
                    <th className="py-3 px-4">Activity Score</th>
                    <th className="py-3 px-4">Notes</th>
                      {!isPersonalView && (currentUser.role === 'admin' || currentUser.role === 'va_admin' || currentUser.role === 'team_lead' || (currentUser.employeeCode || '').toLowerCase().includes('admin')) && (
                        <th className="py-3 px-4 text-right">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {paginatedLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        {!isPersonalView && (
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {log.userName}
                          </td>
                        )}
                        <td className="py-3 px-4 font-semibold text-blue-700">
                          {log.task}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {log.date} • {log.geoLocalStartTime || '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {log.endTime === 'Running Live' ||
                          log.endTime === 'In Progress (Live)' ||
                          log.status === 'running'
                            ? 'Running Live'
                            : (log.geoLocalEndTime || '—')}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {log.durationSeconds}s
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          <span className="bg-blue-50 text-blue-800 border border-blue-200/60 px-2 py-0.5 rounded font-mono font-bold">
                            {formatTotalTime(log.durationSeconds)}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-600">
                          {Math.round((log.mouseActivityAvg + log.keyboardActivityAvg) / 2)}%
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={log.notes}>
                          {log.notes || 'Automated session log'}
                        </td>
                        {!isPersonalView && (currentUser.role === 'admin' || currentUser.role === 'va_admin' || currentUser.role === 'team_lead' || (currentUser.employeeCode || '').toLowerCase().includes('admin')) && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setEditingLog(log);
                                }}
                                className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-200 transition-all cursor-pointer"
                                title="Edit entry (Admin / TL)"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {(currentUser.role === 'admin' || currentUser.role === 'va_admin' || (currentUser.employeeCode || '').toLowerCase().includes('admin')) && (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    deleteTimeLog(log.id);
                                  }}
                                  className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all cursor-pointer"
                                  title="Delete entry (Super Admin Only)"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <EditTimeLogModal
        isOpen={Boolean(editingLog)}
        onClose={() => setEditingLog(null)}
        log={editingLog}
      />
    </div>
  );
};
