import { AuditLog, TimeLog, User, PayrollRecord, DailyAttendanceLog, IdleLog, LeaveRequest, UserPresence } from '../types';
import { generateUniqueUsername, isPlaceholderName, deduplicateUsers, resolveCanonicalEmployee } from './userUtils';
import { getManilaDateString } from './dateUtils';

export const PROHIBITED_PRODUCTION_MARKERS = [
  'AKfycbyKGMOWV0u5xcv_lOKBk6LXpbjrlgZiuqtCs3_HbqjekoJZdXpdfA_1kDjP7H0ulLsw3Q',
  '1h8ssmDEcV-PMGlkpOzfQCtlRpnoT0CBQQveT3e4wPfA',
];

export const isProhibitedProductionTarget = (target?: string | null): boolean => {
  if (!target) return false;
  const str = String(target);
  return PROHIBITED_PRODUCTION_MARKERS.some((m) => str.includes(m));
};

export const DEFAULT_SPREADSHEET_ID = '';
export const DEFAULT_SPREADSHEET_URL = '';
export const DEFAULT_WEBHOOK_URL = '';

export const getAuthHeaders = (extraHeaders: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = { ...extraHeaders };
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('trackpulse_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
};

export const normalizeWorkDate = (rawDate?: any, fallbackDate?: string): string => {
  if (!rawDate && !fallbackDate) {
    return getManilaDateString();
  }
  const str = String(rawDate || '').trim();
  if (str.includes('1899')) {
    return fallbackDate ? normalizeWorkDate(fallbackDate) : getManilaDateString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const isoDate = str.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      return isoDate;
    }
  }
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    january: '01', february: '02', march: '03', april: '04', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
  };
  const textMonthMatch = str.match(/(?:[A-Za-z]+,?\s+)?([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/i);
  if (textMonthMatch) {
    const mStr = textMonthMatch[1].toLowerCase();
    const day = textMonthMatch[2].padStart(2, '0');
    const year = textMonthMatch[3];
    const month = monthMap[mStr] || monthMap[mStr.slice(0, 3)];
    if (month && Number(year) >= 2000) {
      return `${year}-${month}-${day}`;
    }
  }
  if (str.includes('/') || (str.includes('-') && !str.startsWith('1899'))) {
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4 && Number(parts[0]) >= 2000) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      if (parts[2].length === 4 && Number(parts[2]) >= 2000) {
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        const y = parts[2];
        if (p0 > 12) {
          return `${y}-${String(p1).padStart(2, '0')}-${String(p0).padStart(2, '0')}`;
        }
        return `${y}-${String(p0).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
      }
    }
  }
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    if (serial >= 30000 && serial <= 60000) {
      const utcMs = (serial - 25569) * 86400 * 1000;
      const d = new Date(utcMs);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (fallbackDate) {
    return normalizeWorkDate(fallbackDate);
  }
  return getManilaDateString();
};

export const normalizeTimeValue = (rawTime?: any, fallbackDefault?: string): string => {
  if (rawTime === null || rawTime === undefined) {
    return fallbackDefault || '';
  }
  const str = String(rawTime).trim();
  if (!str) return fallbackDefault || '';
  if (
    str.toLowerCase().includes('running') ||
    str.toLowerCase().includes('in progress') ||
    str.toLowerCase().includes('active live')
  ) {
    return 'Running Live';
  }
  const ampmMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)/i);
  if (ampmMatch) {
    const hh = parseInt(ampmMatch[1], 10);
    const mm = ampmMatch[2];
    const ss = ampmMatch[3];
    const modifier = ampmMatch[4].toUpperCase().replace(/\./g, '');
    return ss ? `${hh}:${mm}:${ss} ${modifier}` : `${hh}:${mm} ${modifier}`;
  }
  const gmtTimeMatch = str.match(/(?:1899|\d{4})[^\d]+(\d{1,2}):(\d{2}):(\d{2})/);
  if (gmtTimeMatch) {
    const hours = parseInt(gmtTimeMatch[1], 10);
    const mins = gmtTimeMatch[2];
    const secs = gmtTimeMatch[3];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${mins}:${secs} ${ampm}`;
  }
  const time24Match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (time24Match) {
    const hours = parseInt(time24Match[1], 10);
    const mins = time24Match[2];
    const secs = time24Match[3];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return secs ? `${hours12}:${mins}:${secs} ${ampm}` : `${hours12}:${mins} ${ampm}`;
  }
  if (/^\d{1,2}:\d{2}(?::\d{2})?\s*(AM|PM)$/i.test(str)) {
    return str;
  }
  if (str.includes('T')) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const hours = d.getHours();
        const mins = String(d.getMinutes()).padStart(2, '0');
        const secs = String(d.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hours12 = hours % 12 || 12;
        return `${hours12}:${mins}:${secs} ${ampm}`;
      }
    } catch {}
  }
  return str;
};

export const parseDurationSeconds = (
  rawDuration?: any,
  formattedTotalTime?: any,
  startTime?: any,
  endTime?: any
): number => {
  if (rawDuration !== undefined && rawDuration !== null && rawDuration !== '') {
    const isDateObj = rawDuration instanceof Date || Object.prototype.toString.call(rawDuration) === '[object Date]';
    if (isDateObj) {
      try {
        const sheetEpoch = new Date(1899, 11, 30, 0, 0, 0);
        const yr = rawDuration.getFullYear();
        if (yr === 1899) {
          const ms = rawDuration.getTime() - sheetEpoch.getTime();
          const secs = Math.round(ms / 1000);
          if (!isNaN(secs) && secs > 0 && secs < 604800) return secs;
        } else if (yr >= 1900 && yr <= 2010) {
          const days = Math.round((rawDuration.getTime() - sheetEpoch.getTime()) / (86400 * 1000));
          if (!isNaN(days) && days > 0 && days < 604800) return days;
        }
      } catch (e) {}
    } else {
      if (typeof rawDuration === 'number' && !isNaN(rawDuration)) {
        const n = Math.floor(rawDuration);
        if (n > 0 && n < 604800) return n;
      }
      const rawStr = String(rawDuration).trim();
      const cleanDigits = rawStr.replace(/,/g, '');
      if (/^\d+$/.test(cleanDigits)) {
        const parsed = parseInt(cleanDigits, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed < 604800) return parsed;
      }
    }
  }

  if (formattedTotalTime !== undefined && formattedTotalTime !== null && formattedTotalTime !== '') {
    const text = String(formattedTotalTime).trim().toLowerCase();
    const hMatch = text.match(/(\d+)\s*h(?:ours?|rs?)?/);
    const mMatch = text.match(/(\d+)\s*m(?:inutes?|ins?)?/);
    const sMatch = text.match(/(\d+)\s*s(?:econds?|ecs?)?/);
    if (hMatch || mMatch || sMatch) {
      const hours = hMatch ? parseInt(hMatch[1], 10) : 0;
      const mins = mMatch ? parseInt(mMatch[1], 10) : 0;
      const secs = sMatch ? parseInt(sMatch[1], 10) : 0;
      const total = hours * 3600 + mins * 60 + secs;
      if (total > 0 && total < 604800) return total;
    }
    const colonMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (colonMatch) {
      const p1 = parseInt(colonMatch[1], 10);
      const p2 = parseInt(colonMatch[2], 10);
      const p3 = colonMatch[3] !== undefined ? parseInt(colonMatch[3], 10) : undefined;
      if (p3 !== undefined) {
        const total = p1 * 3600 + p2 * 60 + p3;
        if (total > 0 && total < 604800) return total;
      } else {
        const total = p1 * 60 + p2;
        if (total > 0 && total < 604800) return total;
      }
    }
  }

  return 0;
};

export const maskPassword = (pwd?: string): string => {
  if (!pwd) return 'Pass****';
  const clean = pwd.trim();
  if (clean.length <= 4) {
    return clean.slice(0, 2) + '****';
  }
  const visiblePart = clean.slice(0, 4);
  const starCount = Math.max(4, clean.length - 4);
  const maskedPart = '*'.repeat(starCount);
  return `${visiblePart}${maskedPart}`;
};

export const formatTotalTime = (totalSeconds: number | string | undefined | null): string => {
  const secs = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  } else if (m > 0) {
    return `${m}m ${s}s`;
  } else {
    return `${s}s`;
  }
};

export const isValidWebhookUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim();
  if (!clean.startsWith('https://')) return false;
  if (isProhibitedProductionTarget(clean)) {
    return false;
  }
  if (
    clean.includes('...') ||
    clean.includes('YOUR_') ||
    clean.includes('example.com') ||
    clean.includes('<') ||
    clean.includes('>') ||
    clean.length < 25
  ) {
    return false;
  }
  return true;
};

export const SPREADSHEET_SCHEMA = [
  {
    tabName: 'Live_Presence',
    description: 'Real-time live roster tab showing every agent/trainee live status, platform mode (Desktop App vs Web Portal), live tracking timer, active task, today total hours, first check-in, and device timezone.',
    headers: [
      'Employee Code',
      'Employee Name',
      'System Role',
      'Designation',
      'Platform Mode',
      'Live Presence Status',
      'Current Active Task',
      'Current Application',
      'Shift Hours Today',
      'First Check-In (Manila GMT+8)',
      'Device Timezone',
      'Last Active Heartbeat (Manila GMT+8)',
      'Last Heartbeat (ISO)',
    ],
  },
  {
    tabName: 'Time_Logs',
    description: 'Master time tracker log for all work sessions from Desktop App & Web Portal, tasks, start/end timestamps in Manila time (GMT+8), duration in raw seconds, human-readable total time, and live status.',
    headers: [
      'Session ID',
      'Employee Code',
      'Employee Name',
      'Designation',
      'Task Category',
      'Date',
      'Start Time (Manila GMT+8)',
      'End Time (Manila GMT+8)',
      'Duration (Seconds)',
      'Total Time',
      'Idle Deductions (Mins)',
      'Mouse Avg %',
      'Keyboard Avg %',
      'Status',
      'Notes',
    ],
  },
  {
    tabName: 'Employee_Directory',
    description: 'Master employee roster with all active/registered staff, updated automatically on additions, edits, and deletions.',
    headers: [
      'Employee Code',
      'Username',
      'Full Name',
      'Work Email',
      'System Role',
      'Designation',
      'Date Hired',
      'Monthly Rate (PHP)',
      'Hourly Rate (PHP)',
      'Assigned Supervisor',
      'Screenshot Monitored',
      'Activity Monitored',
      'Status',
      'Account Password (Masked)',
    ],
  },
  {
    tabName: 'Daily_Summary',
    description: 'Instant Executive Daily Timesheet Summary - pre-calculated total shift hours, break deductions, and net productive rendered time per agent per day.',
    headers: [
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
    ],
  },
];

export const generateAppsScriptCode = (spreadsheetId: string = DEFAULT_SPREADSHEET_ID) => {
  return `/**
 * LLC-TIME-TRACKER-V2 GOOGLE APPS SCRIPT WEBHOOK
 * System: LLC-Time-Tracker-V2
 */
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "SUCCESS",
    service: "LLC-Time-Tracker-V2",
    message: "LLC-Time-Tracker-V2 Webhook is active.",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: "SUCCESS",
    service: "LLC-Time-Tracker-V2",
    message: "Action received."
  })).setMimeType(ContentService.MimeType.JSON);
}
`;
};

export const fetchEmployeesFromGoogleSheets = async (
  webhookUrl?: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  existingUsers: User[] = []
): Promise<{ success: boolean; employees: User[]; count: number; message: string }> => {
  try {
    const proxyRes = await fetch('/api/users', {
      headers: getAuthHeaders(),
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          success: true,
          employees: deduplicateUsers(data),
          count: data.length,
          message: `Successfully loaded ${data.length} employee accounts from Google Sheets!`,
        };
      }
    }
  } catch (e) {
    console.warn('[SHEETS SYNC] /api/users fetch warning:', e);
  }
  return {
    success: false,
    employees: [],
    count: 0,
    message: 'Unable to fetch employees from Google Sheets via /api/users.',
  };
};

export const syncDataToGoogleSheetsWebhook = async (
  webhookUrl: string,
  timeLogs: TimeLog[],
  users: User[],
  auditLogs: AuditLog[],
  payrollRecords: PayrollRecord[],
  dailyAttendanceLogs: DailyAttendanceLog[] = [],
  idleLogs: IdleLog[] = [],
  leaveRequests: LeaveRequest[] = [],
  designationTasks?: Record<string, string[]>,
  rolePermissions?: Record<string, import('../types').RolePermissions>,
  activeSessions?: TimeLog[],
  userPresenceList?: UserPresence[]
): Promise<{ success: boolean; message: string }> => {
  if (!webhookUrl || !webhookUrl.trim()) {
    return {
      success: false,
      message: 'No Google Sheets Webhook URL configured.',
    };
  }
  const cleanUrl = webhookUrl.trim();
  try {
    const safeUsers = users.filter((u) => !u.isSecretBackup);
    const combinedLogs = activeSessions && activeSessions.length > 0
      ? [...activeSessions, ...timeLogs]
      : timeLogs;

    const payload = {
      action: 'SYNC_ALL',
      timeLogs: combinedLogs,
      users: safeUsers,
      auditLogs,
      payrollRecords,
      dailyAttendanceLogs,
      idleLogs,
      leaveRequests,
      designationTasks: designationTasks || {},
      rolePermissions: rolePermissions || {},
      userPresenceList: userPresenceList || [],
      syncedAt: new Date().toISOString(),
    };

    const proxyRes = await fetch('/api/sync-sheets', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ webhookUrl: cleanUrl, payload }),
    });
    if (proxyRes.ok) {
      const pData: any = await proxyRes.json();
      if (pData && pData.success && pData.result?.status !== 'ERROR') {
        return {
          success: true,
          message: 'Successfully synchronized all logs and database tables to Google Sheets!',
        };
      }
    }
    return {
      success: false,
      message: 'Failed to sync with Google Sheets via server proxy.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to connect to Google Sheets webhook: ${err?.message || 'Network unreachable'}.`,
    };
  }
};

export const syncEmployeesToGoogleSheetsWebhook = async (
  webhookUrl: string,
  users: User[]
): Promise<{ success: boolean; message: string; count?: number }> => {
  if (!webhookUrl || !webhookUrl.trim()) {
    return {
      success: false,
      message: 'No Google Sheets Webhook URL configured.',
    };
  }
  const cleanUrl = webhookUrl.trim();
  try {
    const safeUsers = users.filter((u) => !u.isSecretBackup);
    const payload = {
      action: 'SYNC_EMPLOYEES',
      users: safeUsers,
      syncedAt: new Date().toISOString(),
    };
    const proxyRes = await fetch('/api/sync-sheets', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ webhookUrl: cleanUrl, payload }),
    });
    if (proxyRes.ok) {
      const result: any = await proxyRes.json();
      return {
        success: true,
        count: result?.result?.count || safeUsers.length,
        message: `Successfully synchronized ${result?.result?.count || safeUsers.length} employees to Employee_Directory.`,
      };
    }
    return {
      success: false,
      message: 'Server proxy rejected employee sync.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Failed to synchronize Employee_Directory.',
    };
  }
};

export interface AgentHeartbeatPayload {
  userId: string;
  employeeCode?: string;
  userName: string;
  sessionId?: string;
  loginSessionId?: string;
  role?: string;
  designation?: string;
  department?: string;
  teamLeaderId?: string;
  platformMode?: string;
  status?: 'online' | 'idle' | 'offline';
  statusLabel?: string;
  isOnline?: boolean;
  isTracking?: boolean;
  isPaused?: boolean;
  elapsedSeconds?: number;
  currentTask?: string;
  currentApp?: string;
  loginPlatform?: 'software' | 'webapp';
  firstCheckin?: string;
  timezone?: string;
  lastHeartbeat?: string;
  mouseActivity?: number;
  keyboardActivity?: number;
}

export const syncAgentHeartbeatToSheets = async (
  webhookUrl: string,
  heartbeat: AgentHeartbeatPayload
): Promise<{ success: boolean; message: string; result?: any }> => {
  try {
    const res = await fetch('/api/presence', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        ...heartbeat,
        lastHeartbeat: heartbeat.lastHeartbeat || new Date().toISOString(),
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: 'Presence recorded successfully.',
        result: data,
      };
    }
  } catch (err: any) {
    console.warn('[SHEETS HEARTBEAT] Presence transmission notice:', err?.message || err);
  }
  return {
    success: false,
    message: 'Failed to transmit presence update.',
  };
};

export const fetchTimeLogsFromGoogleSheets = async (
  webhookUrl?: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  options?: { userId?: string; days?: number; since?: string }
): Promise<{ success: boolean; timeLogs: Partial<TimeLog>[]; message: string }> => {
  try {
    const params = new URLSearchParams();
    if (options?.userId) params.set('userId', options.userId);
    if (options?.days) params.set('days', String(options.days));
    if (options?.since) params.set('since', options.since);
    const proxyRes = await fetch(`/api/timelogs?${params.toString()}`, {
      headers: getAuthHeaders(),
    });
    if (proxyRes.ok) {
      const data: any = await proxyRes.json();
      if (data && Array.isArray(data.timeLogs)) {
        return {
          success: true,
          timeLogs: data.timeLogs,
          message: `Successfully loaded ${data.timeLogs.length} time logs.`,
        };
      }
    }
  } catch (err: any) {
    console.warn('Failed to fetch time logs via /api/timelogs:', err?.message || err);
  }
  return {
    success: false,
    timeLogs: [],
    message: 'Could not load time logs from server API.',
  };
};

export const fetchLivePresenceFromGoogleSheets = async (
  webhookUrl?: string,
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID,
  existingUsers: User[] = []
): Promise<{ success: boolean; presenceList: UserPresence[]; message: string }> => {
  try {
    const proxyRes = await fetch('/api/presence', {
      headers: getAuthHeaders(),
    });
    if (proxyRes.ok) {
      const data: any = await proxyRes.json();
      if (data) {
        const list = Array.isArray(data) ? data : (Array.isArray(data.presence) ? data.presence : []);
        return {
          success: true,
          presenceList: list,
          message: `Successfully loaded ${list.length} live presence records.`,
        };
      }
    }
  } catch (err: any) {
    console.warn('Fetch live presence via /api/presence notice:', err?.message || err);
  }
  return {
    success: false,
    presenceList: [],
    message: 'Could not extract live presence from server API.',
  };
};

export const downloadTableCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
  const csvContent = [
    headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const resetGoogleSpreadsheetData = async (
  webhookUrl: string
): Promise<{ success: boolean; message: string }> => {
  try {
    const payload = { action: 'RESET_ALL' };
    const res = await fetch('/api/sync-sheets', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ webhookUrl, payload }),
    });
    if (res.ok) {
      const json: any = await res.json();
      return {
        success: true,
        message: json.message || 'Google Sheets data tables reset successfully!',
      };
    }
    return {
      success: false,
      message: 'Failed to dispatch reset command.',
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to reset Google Sheets: ${err?.message || 'Network error'}`,
    };
  }
};

export const getGoogleAppsScriptTemplate = generateAppsScriptCode;
