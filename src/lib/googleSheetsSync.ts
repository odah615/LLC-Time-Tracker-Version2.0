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
 * LLC TIME TRACKER — Version 2 GOOGLE APPS SCRIPT WEBHOOK (MERGED + PATCHED)
 *
 * Paste this as the ENTIRE Code.gs of the Version 2 project (select all, replace).
 * Script Properties are kept separately and are not affected:
 * - LLCTRACKERV2_SPREADSHEET_ID
 * - LLCTRACKERV2_SHARED_SECRET
 *
 * After pasting: Save, run setupTextColumns() then repairBadDurations() once,
 * then Deploy > Manage deployments > pencil > Version: New version > Deploy.
 */

var PROHIBITED_SPREADSHEET_IDS = [
  "1h8ssmDEcV-PMGlkpOzfQCtlRpnoT0CBQQveT3e4wPfA", // V1 Live
  "1deaDnCKXjQeoke9PGiMOPgqovno1MhiIlEH8zm4cjBs"  // Original Sandbox
];

var TZ = "Asia/Manila";
var MAX_SESSION_SECONDS = 16 * 3600;

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getLLCTRACKERV2Spreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = (props.getProperty("LLCTRACKERV2_SPREADSHEET_ID") || "${spreadsheetId || ''}").trim();

  if (!sheetId) {
    throw new Error(
      "Configuration Error: LLCTRACKERV2_SPREADSHEET_ID Script Property is not set in Apps Script. " +
      "Version 2 requires an explicit LLCTRACKERV2_SPREADSHEET_ID to isolate production spreadsheet data."
    );
  }

  if (PROHIBITED_SPREADSHEET_IDS.indexOf(sheetId) !== -1) {
    throw new Error(
      "Access denied: this spreadsheet belongs to V1 Live or the original Sandbox. " +
      "Version 2 must use its dedicated spreadsheet."
    );
  }

  return SpreadsheetApp.openById(sheetId);
}

function doGet(e) {
  return jsonResponse({
    status: "SUCCESS",
    service: "LLC-Time-Tracker-Version-2",
    message: "Version 2 Apps Script Webhook is active. Data queries are restricted to authenticated POST actions.",
    timestamp: new Date().toISOString()
  });
}

function asText_(v, kind) {
  if (v instanceof Date) {
    if (kind === "date") return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
    return v.toISOString();
  }
  return String(v === null || v === undefined ? "" : v).trim();
}

function forceTextColumns_(sheet, firstCol, numCols) {
  sheet.getRange(1, firstCol, sheet.getMaxRows(), numCols).setNumberFormat("@");
}

function sanitizeDuration_(reported, startTxt, endTxt, existing) {
  var d = Number(reported);
  if (!isFinite(d) || d < 0) d = Number(existing) || 0;
  var s = Date.parse(startTxt);
  var e = endTxt ? Date.parse(endTxt) : Date.now();
  if (!isNaN(s) && !isNaN(e)) {
    var span = Math.max(0, Math.round((e - s) / 1000));
    if (d > span + 60) d = span;
  }
  return Math.min(Math.round(d), MAX_SESSION_SECONDS);
}

function getEmployeeDirectoryCols(empSheet) {
  var defaultHeaders = [
    "Employee Code", "Username", "Full Name", "Email", "Role", "Designation",
    "Date Hired", "Monthly Rate", "Hourly Rate", "Team Leader", "Screenshot Monitored",
    "Activity Monitored", "Account Status", "Masked Password",
    "AccountPassword", "mustChangePassword"
  ];

  if (empSheet.getLastRow() === 0) {
    empSheet.appendRow(defaultHeaders);
    formatHeaderRow(empSheet, defaultHeaders.length);
  }

  function normalizeHeader_(value) {
    return String(value || "").trim().toLowerCase().replace(/\\s+/g, " ");
  }

  function readHeaderMap_() {
    var count = Math.max(empSheet.getLastColumn(), 1);
    var values = empSheet.getRange(1, 1, 1, count).getValues()[0];
    var map = {};
    for (var i = 0; i < values.length; i++) {
      var key = normalizeHeader_(values[i]);
      if (key) map[key] = i + 1;
    }
    return map;
  }

  function ensureHeader_(canonical, aliases) {
    var map = readHeaderMap_();
    for (var i = 0; i < aliases.length; i++) {
      var key = normalizeHeader_(aliases[i]);
      if (map[key]) return map[key];
    }
    var nextCol = Math.max(empSheet.getLastColumn(), 0) + 1;
    empSheet.getRange(1, nextCol).setValue(canonical);
    return nextCol;
  }

  ensureHeader_("AccountPassword", ["accountpassword", "account password", "currentpassword", "current password", "password"]);
  ensureHeader_("mustChangePassword", ["mustchangepassword", "must change password"]);

  var colMap = readHeaderMap_();
  var codeCol = colMap["employee code"] || colMap["code"] || colMap["employeecode"] || 1;
  var userCol = colMap["username"] || colMap["user name"] || 2;
  var nameCol = colMap["full name"] || colMap["name"] || colMap["employee name"] || 3;
  var emailCol = colMap["email"] || colMap["email address"] || 4;
  var roleCol = colMap["role"] || colMap["user role"] || 5;
  var desigCol = colMap["designation"] || 6;
  var hiredCol = colMap["date hired"] || colMap["date joined"] || colMap["join date"] || 7;
  var monthlyCol = colMap["monthly rate"] || colMap["monthly rate (₱)"] || 8;
  var hourlyCol = colMap["hourly rate"] || colMap["hourly rate (₱)"] || 9;
  var tlCol = colMap["team leader"] || colMap["team leader id"] || colMap["supervisor"] || 10;
  var scrCol = colMap["screenshot monitored"] || 11;
  var actCol = colMap["activity monitored"] || 12;
  var statusCol = colMap["account status"] || colMap["status"] || 13;
  var maskedPwCol = colMap["masked password"] || colMap["account password (masked)"] || 14;
  var pwCol = colMap["accountpassword"] || colMap["account password"] || colMap["currentpassword"] || colMap["current password"] || colMap["password"];
  var mustChangeCol = colMap["mustchangepassword"] || colMap["must change password"];

  return {
    codeCol: codeCol,
    userCol: userCol,
    nameCol: nameCol,
    emailCol: emailCol,
    roleCol: roleCol,
    desigCol: desigCol,
    hiredCol: hiredCol,
    monthlyCol: monthlyCol,
    hourlyCol: hourlyCol,
    tlCol: tlCol,
    scrCol: scrCol,
    actCol: actCol,
    statusCol: statusCol,
    maskedPwCol: maskedPwCol,
    pwCol: pwCol,
    mustChangeCol: mustChangeCol,
    totalCols: Math.max(empSheet.getLastColumn(), pwCol, mustChangeCol)
  };
}

function normalizeEmployeeCodeKey_(value) {
  var key = String(value || "").trim();
  if (!key) return "";
  if (key.toLowerCase().indexOf("usr-") === 0) {
    key = key.substring(4);
    if (key.toLowerCase() === "superadmin-red") key = "SuperAdmin";
  }
  return key.toUpperCase();
}

function doPost(e) {
  var skipLock = false;
  try {
    var act = String(JSON.parse(e.postData.contents).action || "").toUpperCase();
    skipLock = act.indexOf("GET_") === 0 || act === "AUTH_LOGIN";
  } catch (parseErr) {}

  if (skipLock) return handlePost_(e);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (lockErr) {
    return jsonResponse({ status: "ERROR", code: "BUSY", message: "Server busy, please retry." });
  }
  try {
    return handlePost_(e);
  } finally {
    lock.releaseLock();
  }
}

function normalizeLogDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, TZ, "yyyy-MM-dd");
  var txt = String(value || "").trim();
  var match = txt.match(/^(\\d{4}-\\d{2}-\\d{2})/);
  if (match) return match[1];
  var parsed = Date.parse(txt);
  if (!isNaN(parsed)) return Utilities.formatDate(new Date(parsed), TZ, "yyyy-MM-dd");
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd");
}

function formatSummaryDuration_(seconds) {
  var safe = Math.max(0, Math.round(Number(seconds) || 0));
  return Math.floor(safe / 3600) + "h " + Math.floor((safe % 3600) / 60) + "m";
}

function upsertTimeMirrorRow_(ss, tabName, rowData) {
  var headers = [
    "Session ID", "Employee Code", "Employee Name", "Designation", "Task Category",
    "Date", "Start Time", "End Time", "Duration (Seconds)", "Total Time",
    "Idle Deductions (Mins)", "Mouse Avg %", "Keyboard Avg %", "Status", "Notes"
  ];
  var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    formatHeaderRow(sheet, headers.length);
  }
  forceTextColumns_(sheet, 6, 3);
  var key = String(rowData[0] || "").trim();
  if (!key) return;
  var targetRow = -1;
  var last = sheet.getLastRow();
  if (last > 1) {
    var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0] || "").trim() === key) { targetRow = i + 2; break; }
    }
  }
  if (targetRow > 0) sheet.getRange(targetRow, 1, 1, headers.length).setValues([rowData]);
  else sheet.appendRow(rowData);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 12, sheet.getLastRow() - 1, 2).setNumberFormat('0"%"');
}

function rebuildDailySummaryRow_(ss, workDate, employeeCode, defaultEmpInfo) {
  var summary = ss.getSheetByName("Daily_Summary") || ss.insertSheet("Daily_Summary");
  var headers = [
    "Date", "Employee Code", "Employee Name", "Designation", "Tasks Worked On",
    "First Clock-In (Manila)", "Last Clock-Out (Manila)", "Gross Tracked Shift",
    "Total Idle / Breaks", "Net Productive Work", "Duration (Seconds)",
    "Avg Activity %", "Shift Status", "Log Entries"
  ];
  if (summary.getLastRow() === 0) {
    summary.appendRow(headers);
    formatHeaderRow(summary, headers.length);
  }

  var canonical = ss.getSheetByName("Time_Logs");
  var matched = [];
  if (canonical && canonical.getLastRow() > 1) {
    var source = canonical.getRange(2, 1, canonical.getLastRow() - 1, 16).getValues();
    for (var i = 0; i < source.length; i++) {
      var rowId = String(source[i][0] || "").trim().toLowerCase();
      if (rowId.indexOf("live-") === 0) continue;
      var rowDate = normalizeLogDate_(source[i][5]);
      var rowCode = String(source[i][1] || "").trim().toUpperCase();
      if (rowDate === workDate && rowCode === String(employeeCode || "").trim().toUpperCase()) matched.push(source[i]);
    }
  }

  var employeeName = (defaultEmpInfo && defaultEmpInfo.name) || "";
  var designation = (defaultEmpInfo && defaultEmpInfo.designation) || "Agent";
  var firstStart = (defaultEmpInfo && defaultEmpInfo.firstCheckin) || "";

  if (!employeeName) {
    var empSheet = ss.getSheetByName("Employee_Directory");
    if (empSheet && empSheet.getLastRow() > 1) {
      var cols = getEmployeeDirectoryCols(empSheet);
      var eRows = empSheet.getRange(2, 1, empSheet.getLastRow() - 1, cols.totalCols).getValues();
      for (var eI = 0; eI < eRows.length; eI++) {
        if (String(eRows[eI][cols.codeCol - 1] || "").trim().toUpperCase() === String(employeeCode || "").trim().toUpperCase()) {
          employeeName = String(eRows[eI][cols.nameCol - 1] || "").trim();
          designation = String(eRows[eI][cols.desigCol - 1] || "Agent").trim();
          break;
        }
      }
    }
  }

  var totalSeconds = 0, idleMinutes = 0, activityTotal = 0, activityCount = 0;
  var tasks = {}, inProgress = false;
  var lastEnd = "", firstKey = null, lastKey = null;

  if (matched.length > 0) {
    matched.forEach(function(r) {
      employeeName = employeeName || String(r[2] || "").trim();
      designation = designation || String(r[4] || "").trim();
      var task = String(r[14] || "").trim();
      if (task) tasks[task] = true;
      totalSeconds += Math.max(0, Number(r[8]) || 0);
      idleMinutes += Math.max(0, Number(r[10]) || 0);
      [r[11], r[12]].forEach(function(v) {
        var n = Number(v);
        if (v !== "" && v !== null && v !== undefined && isFinite(n)) { activityTotal += n; activityCount++; }
      });
      var start = String(r[6] || "").trim();
      var end = String(r[7] || "").trim();
      var startParsed = Date.parse(start); if (isNaN(startParsed)) startParsed = start;
      var endParsed = Date.parse(end); if (isNaN(endParsed)) endParsed = end;
      if (start && (firstKey === null || startParsed < firstKey)) { firstKey = startParsed; firstStart = start; }
      if (end && (lastKey === null || endParsed > lastKey)) { lastKey = endParsed; lastEnd = end; }
      var status = String(r[13] || "").toLowerCase();
      if (!end || /active|running|tracking|in progress/.test(status)) inProgress = true;
    });
  }

  totalSeconds = Math.min(Math.round(totalSeconds), 24 * 3600);
  var idleSeconds = Math.round(idleMinutes * 60);
  var summaryRow = [
    workDate, String(employeeCode || "").trim().toUpperCase(), employeeName || "Employee", designation || "Agent",
    Object.keys(tasks).join(", "), firstStart, lastEnd,
    formatSummaryDuration_(totalSeconds), formatSummaryDuration_(idleSeconds),
    formatSummaryDuration_(Math.max(0, totalSeconds - idleSeconds)), totalSeconds,
    activityCount ? Math.round(activityTotal / activityCount) : 0,
    inProgress ? "In Progress" : (matched.length > 0 ? "Completed" : "In Progress"), matched.length
  ];
  var target = -1, last = summary.getLastRow();
  if (last > 1) {
    var keys = summary.getRange(2, 1, last - 1, 2).getValues();
    for (var j = 0; j < keys.length; j++) {
      if (normalizeLogDate_(keys[j][0]) === workDate && String(keys[j][1] || "").trim().toUpperCase() === String(employeeCode || "").trim().toUpperCase()) { target = j + 2; break; }
    }
  }
  if (target > 0) {
    if (matched.length === 0) {
      summary.deleteRow(target);
    } else {
      summary.getRange(target, 1, 1, headers.length).setValues([summaryRow]);
    }
  } else if (matched.length > 0) {
    summary.appendRow(summaryRow);
  }
  if (summary.getLastRow() > 1) summary.getRange(2, 12, summary.getLastRow() - 1, 1).setNumberFormat('0"%"');
}

function formatDetailedDuration_(seconds) {
  var s = Math.max(0, Math.round(Number(seconds) || 0));
  var h = Math.floor(s / 3600);
  var m = Math.floor((s % 3600) / 60);
  var sec = s % 60;
  if (h > 0) return h + "h " + m + "m " + sec + "s";
  return m + "m " + sec + "s";
}

function upsertLivePresenceRow_(ss, p) {
  p = p || {};
  var sh = ss.getSheetByName("Live_Presence") || ss.insertSheet("Live_Presence");
  var headers = [
    "Employee Code", "Employee Name", "System Role", "Designation", "Platform Mode",
    "Live Presence Status", "Current Active Task", "Current Application", "Shift Hours Today",
    "First Check-in (Manila)", "Device Timezone", "Last Active Heartbeat (Manila)", "Last Heartbeat (ISO)"
  ];
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    formatHeaderRow(sh, headers.length);
  }
  var code = String(p.employeeCode || p.employee_code || "").trim().toUpperCase();
  if (!code) code = normalizeEmployeeCodeKey_(p.userId || p.id || "");
  if (!code) return { success: false, message: "Missing employeeCode for Live_Presence." };

  var rawStatus = String(p.status || p.statusLabel || "").toLowerCase();
  var explicitOffline = p.isOnline === false || p.isOnline === "false" || rawStatus.indexOf("offline") >= 0;
  var isTracking = p.isTracking === true || String(p.isTracking).toLowerCase() === "true";
  var isPaused = p.isPaused === true || String(p.isPaused).toLowerCase() === "true";
  var presenceStatus = explicitOffline ? "Offline" : (isTracking ? (isPaused ? "Paused" : "Tracking Active") : "Online Standby");
  var iso = String(p.lastHeartbeat || p.lastHeartbeatISO || new Date().toISOString()).trim();
  var stamp = new Date(iso);
  if (isNaN(stamp.getTime())) { stamp = new Date(); iso = stamp.toISOString(); }
  var name = String(p.userName || p.employeeName || p.name || "Employee").trim();
  var role = String(p.userRole || p.role || "agent").trim();
  var designation = String(p.designation || "Agent").trim();
  var platform = String(p.platformMode || p.loginPlatform || "").trim();
  if (!platform || platform === "software") platform = "Desktop Tracker";
  else if (platform === "webapp") platform = "Web Portal";
  var task = explicitOffline ? "Idle" : String(p.currentTask || p.task || "Idle").trim();
  var app = explicitOffline ? "None / Offline" : String(p.currentApp || p.currentApplication || "").trim();
  var shiftToday = String(p.totalTodayFormatted || p.shiftHoursToday || formatSummaryDuration_(p.elapsedSeconds || 0)).trim();
  var firstCheckin = String(p.firstCheckin || p.firstCheckIn || "").trim();
  var timezone = String(p.timezone || p.deviceTimezone || "Asia/Manila").trim();
  var row = [
    code, name, role, designation, platform, presenceStatus, task, app, shiftToday,
    firstCheckin, timezone, Utilities.formatDate(stamp, TZ, "yyyy-MM-dd HH:mm:ss"), iso
  ];

  var target = -1;
  var last = sh.getLastRow();
  var existingFirstCheckin = "";
  if (last > 1) {
    var codes = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < codes.length; i++) {
      if (String(codes[i][0] || "").trim().toUpperCase() === code) {
        target = i + 2;
        existingFirstCheckin = String(sh.getRange(target, 10).getValue() || "").trim();
        break;
      }
    }
  }

  // Preserve original first check-in timestamp when updating existing employee
  if (existingFirstCheckin) {
    firstCheckin = existingFirstCheckin;
    row[9] = firstCheckin;
  }

  if (target > 0) sh.getRange(target, 1, 1, headers.length).setValues([row]);
  else sh.appendRow(row);

  // Guarantee Daily_Summary row exists even before any time logs are saved
  var todayManila = Utilities.formatDate(stamp, TZ, "yyyy-MM-dd");
  rebuildDailySummaryRow_(ss, todayManila, code, { name: name, designation: designation, firstCheckin: firstCheckin });

  return { success: true, employeeCode: code, status: presenceStatus };
}

function rebuildWeeklyMonthlySummaries_(ss) {
  var sh = ss.getSheetByName("Time_Logs");
  var records = [];
  if (sh && sh.getLastRow() > 1) {
    var data = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues();
    data.forEach(function(r) {
      var id = String(r[0] || "").trim();
      var code = String(r[1] || "").trim().toUpperCase();
      var date = normalizeLogDate_(r[5]);
      if (!id || id.toLowerCase().indexOf("live-") === 0 || !code || !date) return;
      var seconds = Math.max(0, Math.min(Number(r[8]) || 0, MAX_SESSION_SECONDS));
      var idle = Math.max(0, Number(r[10]) || 0);
      var activityVals = [r[11], r[12]].map(function(v) { return Number(v); }).filter(function(v) { return isFinite(v); });
      var activity = activityVals.length ? activityVals.reduce(function(a, b) { return a + b; }, 0) / activityVals.length : null;
      var dateObj = new Date(date + "T12:00:00+08:00");
      var utcDay = new Date(Date.UTC(dateObj.getUTCFullYear(), dateObj.getUTCMonth(), dateObj.getUTCDate()));
      var dayOfWeek = utcDay.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      utcDay.setUTCDate(utcDay.getUTCDate() - dayOfWeek); // Distance back to Sunday
      var weekStart = Utilities.formatDate(utcDay, TZ, "yyyy-MM-dd");
      utcDay.setUTCDate(utcDay.getUTCDate() + 6); // Distance forward to Saturday
      var weekEnd = Utilities.formatDate(utcDay, TZ, "yyyy-MM-dd");
      records.push({
        employeeCode: code,
        name: String(r[2] || "").trim(),
        designation: String(r[4] || "Agent").trim(),
        date: date,
        week: weekStart + " to " + weekEnd,
        month: date.slice(0, 7),
        task: String(r[14] || "Work").trim(),
        seconds: seconds,
        idleMinutes: idle,
        activity: activity
      });
    });
  }

  var weekly = {}, monthly = {};
  function accumulate(map, key, rec) {
    if (!map[key]) map[key] = { period: key.split("|")[0], code: rec.employeeCode, name: rec.name, designation: rec.designation, tasks: {}, days: {}, seconds: 0, idleMinutes: 0, activitySum: 0, activityCount: 0 };
    var g = map[key];
    g.name = g.name || rec.name;
    g.designation = g.designation || rec.designation;
    g.tasks[rec.task] = true;
    g.days[rec.date] = true;
    g.seconds += rec.seconds;
    g.idleMinutes += rec.idleMinutes;
    if (rec.activity !== null) { g.activitySum += rec.activity; g.activityCount++; }
  }
  records.forEach(function(r) {
    accumulate(weekly, r.week + "|" + r.employeeCode, r);
    accumulate(monthly, r.month + "|" + r.employeeCode, r);
  });
  function round2(n) { return Math.round(n * 100) / 100; }
  function writeDerived(tabName, headers, groups, isWeekly) {
    var target = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    if (target.getLastRow() === 0) { target.appendRow(headers); formatHeaderRow(target, headers.length); }
    if (target.getLastRow() > 1) target.getRange(2, 1, target.getLastRow() - 1, Math.max(target.getLastColumn(), headers.length)).clearContent();
    var keys = Object.keys(groups).sort();
    var rows = keys.map(function(k) {
      var g = groups[k];
      var hours = g.seconds / 3600;
      var idleHours = g.idleMinutes / 60;
      var averageActivity = g.activityCount ? round2(g.activitySum / g.activityCount) : "";
      if (isWeekly) {
        return [g.period, g.code, g.name, g.designation, Object.keys(g.tasks).sort().join(", "), Object.keys(g.days).length,
          round2(hours), round2(idleHours), round2(Math.max(0, hours - idleHours)), "", "", averageActivity];
      }
      return [g.period, g.code, g.name, g.designation, Object.keys(g.tasks).sort().join(", "), Object.keys(g.days).length,
        round2(hours), round2(idleHours), round2(Math.max(0, hours - idleHours)), averageActivity];
    });
    if (rows.length) target.getRange(2, 1, rows.length, headers.length).setValues(rows);
    if (target.getLastRow() > 1) {
      var count = target.getLastRow() - 1;
      target.getRange(2, headers.length, count, 1).setNumberFormat('0"%"');
    }
  }
  writeDerived("Weekly_Summary", ["Week Period (Sun-Sat)", "Employee Code", "Employee Name", "Designation", "Tasks Breakdown", "Days Rendered", "Gross Tracked Hours", "Total Idle / Breaks", "Net Productive Work", "Regular Hours", "Overtime Hours", "Avg Activity %"], weekly, true);
  writeDerived("Monthly_Summary", ["Month Period", "Employee Code", "Employee Name", "Designation", "Primary Tasks", "Total Days Rendered", "Gross Tracked Hours", "Total Idle / Breaks", "Net Productive Work", "Avg Activity %"], monthly, false);
}

function refreshStalePresenceRows_(ss) {
  var sh = ss.getSheetByName("Live_Presence");
  if (!sh || sh.getLastRow() <= 1) return;
  var now = Date.now();
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues();
  for (var i = 0; i < rows.length; i++) {
    var status = String(rows[i][5] || "").toLowerCase();
    if (!status || status === "offline") continue;
    var hb = String(rows[i][12] || rows[i][11] || "").trim();
    var ms = Date.parse(hb);
    if (!isNaN(ms) && now - ms <= 180000) continue;
    var rowNo = i + 2;
    sh.getRange(rowNo, 6, 1, 3).setValues([["Offline", "Idle", "None / Offline"]]);
  }
}

function handlePost_(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var expectedSecret = (props.getProperty("LLCTRACKERV2_SHARED_SECRET") || "LLCTrackerV2SecretKey2026").trim();

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({
        status: "ERROR",
        code: "EMPTY_PAYLOAD",
        message: "Empty post body payload."
      });
    }

    var data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({
        status: "ERROR",
        code: "INVALID_JSON",
        message: "Malformed JSON payload in request body."
      });
    }

    var providedSecret = String(data.secret || data.sharedSecret || (e.parameter && e.parameter.secret) || "").trim();
    if (expectedSecret && providedSecret && providedSecret !== expectedSecret) {
      return jsonResponse({
        status: "ERROR",
        code: "UNAUTHORIZED",
        message: "Unauthorized: Invalid or missing shared secret."
      });
    }

    var ss = getLLCTRACKERV2Spreadsheet();
    var action = String(data.action || "").toUpperCase().trim();

    if (action === "AUTH_LOGIN" || action === "VERIFY_CREDENTIALS") {
      var query = String(data.usernameOrCode || data.username || data.user || "").trim();
      var inputPassword = String(data.password || "");

      if (!query || !inputPassword) {
        return jsonResponse({
          status: "ERROR",
          code: "MISSING_CREDENTIALS",
          message: "Username/Code and password are required."
        });
      }

      var empSheet = ss.getSheetByName("Employee_Directory");
      if (!empSheet || empSheet.getLastRow() <= 1) {
        return jsonResponse({
          status: "ERROR",
          code: "USER_NOT_FOUND",
          message: "Employee_Directory is empty or uninitialized."
        });
      }

      var cols = getEmployeeDirectoryCols(empSheet);
      var maxCols = cols.totalCols;
      var lastRow = empSheet.getLastRow();
      var rows = empSheet.getRange(2, 1, lastRow - 1, maxCols).getValues();

      var cleanQuery = query.toLowerCase().replace(/^@/, "").trim();
      var foundRowIdx = -1;
      var foundEmp = null;

      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        var rCode = String(row[cols.codeCol - 1] || "").trim().toUpperCase();
        var rUser = String(row[cols.userCol - 1] || "").trim().toLowerCase();
        var queryAsCode = normalizeEmployeeCodeKey_(query);

        if (rUser === cleanQuery || rCode === cleanQuery.toUpperCase() || rCode === queryAsCode) {
          foundRowIdx = r + 2;
          foundEmp = row;
          break;
        }
      }

      if (foundRowIdx === -1 || !foundEmp) {
        return jsonResponse({
          status: "ERROR",
          code: "USER_NOT_FOUND",
          message: "Account not found for \\"" + query + "\\"."
        });
      }

      var empStatus = String(foundEmp[cols.statusCol - 1] || "active").toLowerCase().trim();
      if (empStatus === "inactive") {
        return jsonResponse({
          status: "ERROR",
          code: "USER_INACTIVE",
          message: "Account is inactive."
        });
      }

      var rawMustChange = foundEmp[cols.mustChangeCol - 1];
      var mustChange = (typeof rawMustChange === "boolean")
        ? rawMustChange
        : (String(rawMustChange).toUpperCase() === "TRUE" || String(rawMustChange).toUpperCase() === "YES");

      var storedPassword = String(foundEmp[cols.pwCol - 1] || "").trim();
      if (!storedPassword) {
        return jsonResponse({
          status: "ERROR",
          code: "PASSWORD_NOT_SET",
          message: "No password is stored for this account. Ask an administrator to set a temporary password."
        });
      }

      var isMatch = (inputPassword === storedPassword);

      if (!isMatch) {
        return jsonResponse({
          status: "ERROR",
          code: "INVALID_CREDENTIALS",
          message: "Incorrect password."
        });
      }

      var userPayload = {
        id: String(foundEmp[cols.codeCol - 1] || "").trim(),
        employeeCode: String(foundEmp[cols.codeCol - 1] || "").trim(),
        username: String(foundEmp[cols.userCol - 1] || "").trim(),
        name: String(foundEmp[cols.nameCol - 1] || "").trim(),
        email: String(foundEmp[cols.emailCol - 1] || "").trim(),
        role: String(foundEmp[cols.roleCol - 1] || "agent").trim(),
        designation: String(foundEmp[cols.desigCol - 1] || "Agent").trim(),
        status: empStatus,
        joinDate: asText_(foundEmp[cols.hiredCol - 1], "date"),
        monthlyRate: Number(foundEmp[cols.monthlyCol - 1] || 0),
        hourlyRate: Number(foundEmp[cols.hourlyCol - 1] || 0),
        teamLeaderId: String(foundEmp[cols.tlCol - 1] || "").trim(),
        screenshotMonitored: String(foundEmp[cols.scrCol - 1]).toUpperCase() === "YES",
        activityMonitored: String(foundEmp[cols.actCol - 1]).toUpperCase() === "YES",
        mustChangePassword: mustChange,
        isPasswordChanged: mustChange ? "NO" : "YES"
      };

      upsertLivePresenceRow_(ss, {
        employeeCode: userPayload.employeeCode,
        userId: userPayload.id,
        userName: userPayload.name,
        userRole: userPayload.role,
        designation: userPayload.designation,
        platformMode: data.platformMode || data.loginPlatform || (data.mode === "software" ? "Desktop Tracker" : "Web Portal"),
        isOnline: true,
        isTracking: false,
        currentTask: "Idle",
        currentApp: data.mode === "software" ? "LLC Desktop Tracker" : "Web Portal",
        firstCheckin: new Date().toISOString(),
        timezone: data.timezone || "Asia/Manila",
        lastHeartbeat: new Date().toISOString()
      });

      return jsonResponse({
        status: "SUCCESS",
        valid: true,
        mustChangePassword: mustChange,
        user: userPayload
      });
    }

    if (action === "UPDATE_PASSWORD") {
      var targetUserId = String(data.userId || "").trim();
      var targetEmpCode = String(data.employeeCode || "").trim().toUpperCase();
      var targetUsername = String(data.username || "").trim().toLowerCase();
      var targetCodeFromId = normalizeEmployeeCodeKey_(targetUserId);
      var newPlainPassword = String(data.newPassword || data.password || data.accountPassword || data.passwordHash || "").trim();

      if (!newPlainPassword) {
        return jsonResponse({ status: "ERROR", message: "Missing new password in update payload." });
      }

      var empSheet = ss.getSheetByName("Employee_Directory") || ss.insertSheet("Employee_Directory");
      var cols = getEmployeeDirectoryCols(empSheet);
      var lastRow = empSheet.getLastRow();
      var rows = lastRow > 1 ? empSheet.getRange(2, 1, lastRow - 1, cols.totalCols).getValues() : [];

      var foundRowIdx = -1;
      for (var j = 0; j < rows.length; j++) {
        var rCode = String(rows[j][cols.codeCol - 1] || "").trim().toUpperCase();
        var rUser = String(rows[j][cols.userCol - 1] || "").trim().toLowerCase();

        if (
          (targetEmpCode && rCode === targetEmpCode) ||
          (targetCodeFromId && rCode === targetCodeFromId) ||
          (targetUserId && rUser === targetUserId.toLowerCase()) ||
          (targetUsername && rUser === targetUsername)
        ) {
          foundRowIdx = j + 2;
          break;
        }
      }

      if (foundRowIdx === -1) {
        return jsonResponse({
          status: "ERROR",
          code: "USER_NOT_FOUND",
          message: "Employee account not found in Employee_Directory for password update."
        });
      }

      empSheet.getRange(foundRowIdx, cols.pwCol).setValue(newPlainPassword);
      empSheet.getRange(foundRowIdx, cols.mustChangeCol).setValue(false);

      SpreadsheetApp.flush();
      var checkPw = String(empSheet.getRange(foundRowIdx, cols.pwCol).getValue() || "");
      var checkMustRaw = empSheet.getRange(foundRowIdx, cols.mustChangeCol).getValue();
      var checkMust = (checkMustRaw === false || String(checkMustRaw).trim().toLowerCase() === "false");
      if (checkPw !== newPlainPassword || !checkMust) {
        return jsonResponse({
          status: "ERROR",
          code: "PASSWORD_UPDATE_VERIFY_FAILED",
          action: "UPDATE_PASSWORD",
          message: "Password update was written but the saved password or mustChangePassword flag did not verify."
        });
      }

      return jsonResponse({
        status: "SUCCESS",
        action: "UPDATE_PASSWORD",
        userId: targetUserId,
        message: "Password and mustChangePassword verified in Employee_Directory.",
        verified: true
      });
    }

    if (action === "ADMIN_RESET_PASSWORD") {
      var rsUserId = String(data.userId || "").trim();
      var rsEmpCode = String(data.employeeCode || "").trim().toUpperCase() || normalizeEmployeeCodeKey_(rsUserId);
      var rsUsername = String(data.username || "").trim().toLowerCase() || rsUserId.toLowerCase();
      var rsTemp = String(data.temporaryPassword || "").trim();

      if ((!rsUserId && !rsEmpCode && !rsUsername) || !rsTemp) {
        return jsonResponse({ status: "ERROR", message: "An employeeCode/username and temporaryPassword are required." });
      }

      var rsSheet = ss.getSheetByName("Employee_Directory");
      if (!rsSheet) {
        return jsonResponse({ status: "ERROR", code: "USER_NOT_FOUND", message: "Employee_Directory not found." });
      }

      var rsCols = getEmployeeDirectoryCols(rsSheet);
      var rsLast = rsSheet.getLastRow();
      if (rsLast > 1) {
        var rsRows = rsSheet.getRange(2, 1, rsLast - 1, rsCols.totalCols).getValues();
        for (var rsI = 0; rsI < rsRows.length; rsI++) {
          var rsCode = String(rsRows[rsI][rsCols.codeCol - 1] || "").trim().toUpperCase();
          var rsUser = String(rsRows[rsI][rsCols.userCol - 1] || "").trim().toLowerCase();
          if ((rsEmpCode && rsCode === rsEmpCode) || (rsUsername && rsUser === rsUsername)) {
            var rsRowNumber = rsI + 2;
            rsSheet.getRange(rsRowNumber, rsCols.pwCol).setValue(rsTemp);
            rsSheet.getRange(rsRowNumber, rsCols.mustChangeCol).setValue(true);
            SpreadsheetApp.flush();
            var savedTemp = String(rsSheet.getRange(rsRowNumber, rsCols.pwCol).getValue() || "");
            var savedFlag = rsSheet.getRange(rsRowNumber, rsCols.mustChangeCol).getValue();
            if (savedTemp !== rsTemp || !(savedFlag === true || String(savedFlag).toLowerCase() === "true")) {
              return jsonResponse({ status: "ERROR", code: "PASSWORD_RESET_VERIFY_FAILED", message: "Temporary password reset did not verify in Employee_Directory." });
            }
            return jsonResponse({ status: "SUCCESS", action: "ADMIN_RESET_PASSWORD", employeeCode: rsCode, verified: true });
          }
        }
      }
      return jsonResponse({ status: "ERROR", code: "USER_NOT_FOUND", message: "Employee not found by Employee Code or username." });
    }

    if (action === "HEARTBEAT_UPDATE" || action === "SYNC_PRESENCE") {
      var presenceList = [];
      if (Array.isArray(data.presence)) presenceList = data.presence;
      else if (data.presence && typeof data.presence === "object") presenceList = [data.presence];
      else if (data.employeeCode || data.userId) presenceList = [data];

      var results = [];
      presenceList.forEach(function(p) {
        results.push(upsertLivePresenceRow_(ss, p));
      });
      SpreadsheetApp.flush();
      var failed = results.filter(function(r) { return !r.success; });
      if (failed.length) return jsonResponse({ status: "ERROR", action: action, message: failed[0].message, count: presenceList.length });
      return jsonResponse({ status: "SUCCESS", action: "HEARTBEAT_UPDATE", count: presenceList.length });
    }

    if (action === "SYNC_TIMELOGS" || action === "BATCH_TIMELOGS" || action === "SYNC_ALL") {
      var logs = data.timeLogs || data.logs || (Array.isArray(data) ? data : []);
      if (!Array.isArray(logs)) logs = logs ? [logs] : [];

      var timeLogsSheet = ss.getSheetByName("Time_Logs") || ss.insertSheet("Time_Logs");

      if (timeLogsSheet.getLastRow() === 0) {
        timeLogsSheet.appendRow([
          "Session ID", "Employee Code", "Employee Name", "Role", "Designation",
          "Date (YYYY-MM-DD)", "Start Time", "End Time", "Duration (Seconds)", "Total Time",
          "Idle Minutes", "Mouse %", "Keyboard %", "Status", "Task", "User ID"
        ]);
        formatHeaderRow(timeLogsSheet, 16);
      }

      forceTextColumns_(timeLogsSheet, 6, 3);
      if (timeLogsSheet.getLastRow() > 1) timeLogsSheet.getRange(2, 12, timeLogsSheet.getLastRow() - 1, 2).setNumberFormat('0"%"');

      var existingMap = {};
      var existingDurations = {};
      var affectedDailyKeys = {};
      var mirrorRowsWritten = 0;

      if (timeLogsSheet.getLastRow() > 1) {
        var existingData = timeLogsSheet.getRange(2, 1, timeLogsSheet.getLastRow() - 1, 16).getValues();
        for (var k = 0; k < existingData.length; k++) {
          var idStr = String(existingData[k][0] || "").trim();
          if (idStr) {
            existingMap[idStr] = k + 2;
            existingDurations[idStr] = Number(existingData[k][8] || 0);
          }
        }
      }

      for (var l = 0; l < logs.length; l++) {
        var log = logs[l];
        var sId = String(log.segmentId || log.id || log.sessionId || "").trim();
        if (!sId) continue;
        if (sId.toLowerCase().indexOf("live-") === 0) {
          upsertLivePresenceRow_(ss, {
            employeeCode: log.employeeCode,
            userId: log.userId || log.employeeCode,
            userName: log.userName || log.employeeName,
            userRole: log.actorRole || log.role || "agent",
            designation: log.designation || "Agent",
            platformMode: "Desktop Tracker",
            isOnline: true,
            isTracking: true,
            isPaused: false,
            currentTask: log.task || "Work",
            currentApp: log.currentApp || "LLC Desktop Tracker",
            elapsedSeconds: log.durationSeconds,
            firstCheckin: log.startTime || "",
            timezone: log.timezone || "Asia/Manila",
            lastHeartbeat: log.lastHeartbeat || new Date().toISOString()
          });
          continue;
        }

        var safeDuration = sanitizeDuration_(log.durationSeconds, log.startTime, log.endTime, existingDurations[sId]);
        if (existingDurations[sId] && safeDuration === 0 && log.status === "completed") {
          safeDuration = Math.min(existingDurations[sId], MAX_SESSION_SECONDS);
        }

        var lRow = [
          sId,
          String(log.employeeCode || "").trim(),
          String(log.userName || log.employeeName || "").trim(),
          String(log.actorRole || log.role || "agent").trim(),
          String(log.designation || "Agent").trim(),
          String(log.date || Utilities.formatDate(new Date(), "Asia/Manila", "yyyy-MM-dd")).trim(),
          String(log.startTime || "").trim(),
          String(log.endTime || "").trim(),
          safeDuration,
          (function() {
            var supplied = String(log.totalTime || log.durationFormatted || "").trim();
            return (!supplied || /^0(?:h\\s*)?0m(?:\\s*0s)?$/i.test(supplied)) ? formatDetailedDuration_(safeDuration) : supplied;
          })(),
          Number(log.idleMinutes || 0),
          Number(log.mousePercentage !== undefined ? log.mousePercentage : (log.mouseActivityAvg !== undefined ? log.mouseActivityAvg : 95)),
          Number(log.keyboardPercentage !== undefined ? log.keyboardPercentage : (log.keyboardActivityAvg !== undefined ? log.keyboardActivityAvg : 95)),
          String(log.status || "completed").trim(),
          String(log.task || "Work").trim(),
          String(log.userId || "").trim()
        ];

        if (existingMap[sId]) {
          timeLogsSheet.getRange(existingMap[sId], 1, 1, 16).setValues([lRow]);
        } else {
          timeLogsSheet.appendRow(lRow);
          existingMap[sId] = timeLogsSheet.getLastRow();
          existingDurations[sId] = safeDuration;
        }

        mirrorRowsWritten++;
        var cleanDate = normalizeLogDate_(lRow[5]);
        var cleanCode = String(lRow[1] || "").trim();
        if (cleanDate && cleanCode) affectedDailyKeys[cleanDate + "|" + cleanCode.toUpperCase()] = { date: cleanDate, employeeCode: cleanCode };
      }

      Object.keys(affectedDailyKeys).forEach(function(key) {
        var item = affectedDailyKeys[key];
        rebuildDailySummaryRow_(ss, item.date, item.employeeCode);
      });
      SpreadsheetApp.flush();

      return jsonResponse({
        status: "SUCCESS",
        action: action,
        received: logs.length,
        timeLogsPersisted: mirrorRowsWritten,
        sheetsUpdated: ["Time_Logs", "Daily_Summary"]
      });
    }

    if (action === "DELETE_TIMELOG" || action === "DELETE_LOG") {
      var targetId = String(data.logId || data.id || data.sessionId || "").trim();
      var timeLogsSheet = ss.getSheetByName("Time_Logs");
      var deletedCount = 0;
      var affectedDailyKeys = {};

      var targetEmp = String(data.employeeCode || data.userId || "").trim().toLowerCase();
      var targetDate = String(data.date || "").trim();
      var normTargetDate = targetDate ? normalizeLogDate_(targetDate) : "";
      var targetTask = String(data.task || "").trim().toLowerCase();
      var targetDur = Number(data.durationSeconds || 0);

      if (targetId && targetId.indexOf("log-") === 0) {
        var parts = targetId.split("-");
        if (parts.length >= 4) {
          if (!targetEmp && parts[1]) targetEmp = parts[1].toLowerCase();
          if (!normTargetDate && parts.length >= 5 && parts[2].length === 4) {
            normTargetDate = parts[2] + "-" + parts[3] + "-" + parts[4];
          }
        }
      }

      if (timeLogsSheet && timeLogsSheet.getLastRow() > 1) {
        var existingData = timeLogsSheet.getRange(2, 1, timeLogsSheet.getLastRow() - 1, 16).getValues();
        for (var dk = existingData.length - 1; dk >= 0; dk--) {
          var idStr = String(existingData[dk][0] || "").trim();
          var userIdStr = String(existingData[dk][15] || "").trim();
          var rowEmpCode = String(existingData[dk][1] || "").trim();
          var rowDate = normalizeLogDate_(existingData[dk][5]);
          var rowTask = String(existingData[dk][14] || "").trim().toLowerCase();
          var rowDur = Number(existingData[dk][8] || 0);

          var isIdMatch = Boolean(targetId) && (
            idStr === targetId ||
            idStr.toLowerCase() === targetId.toLowerCase() ||
            userIdStr === targetId ||
            (idStr.length >= 4 && targetId.indexOf(idStr) !== -1) ||
            (targetId.length >= 4 && idStr.indexOf(targetId) !== -1)
          );

          var normRowEmp = normalizeEmployeeCodeKey_(rowEmpCode);
          var normTargetEmp = normalizeEmployeeCodeKey_(targetEmp);

          var isEmpMatch = Boolean(targetEmp) && (
            rowEmpCode.toLowerCase() === targetEmp ||
            userIdStr.toLowerCase() === targetEmp ||
            (normRowEmp && normTargetEmp && normRowEmp === normTargetEmp)
          );

          var isDateMatch = Boolean(normTargetDate || targetDate) && (
            rowDate === normTargetDate ||
            rowDate === targetDate ||
            (targetDate && rowDate && (rowDate.indexOf(targetDate) !== -1 || targetDate.indexOf(rowDate) !== -1))
          );

          var isTaskMatch = !targetTask || rowTask === targetTask || rowTask.indexOf(targetTask) !== -1 || targetTask.indexOf(rowTask) !== -1;
          var isDurMatch = !targetDur || Math.abs(rowDur - targetDur) < 30 || Math.abs(rowDur * 3600 - targetDur) < 30 || Math.abs(rowDur - targetDur / 3600) < 0.1;

          var rowStatus = String(existingData[dk][12] || "").trim().toLowerCase();
          var rowEndTime = String(existingData[dk][7] || "").trim().toLowerCase();
          var isRunningRow = rowStatus === "running" || rowEndTime.indexOf("progress") !== -1 || rowEndTime.indexOf("running") !== -1;

          var isMetaMatch = isEmpMatch && isDateMatch && (isTaskMatch && isDurMatch || isRunningRow);

          if (isIdMatch || isMetaMatch) {
            timeLogsSheet.deleteRow(dk + 2);
            deletedCount++;

            if (rowDate && rowEmpCode) {
              affectedDailyKeys[rowDate + "|" + rowEmpCode.toUpperCase()] = { date: rowDate, employeeCode: rowEmpCode };
            }
          }
        }
      }

      Object.keys(affectedDailyKeys).forEach(function(key) {
        var item = affectedDailyKeys[key];
        rebuildDailySummaryRow_(ss, item.date, item.employeeCode);
      });

      if (deletedCount > 0 || Object.keys(affectedDailyKeys).length > 0) {
        rebuildWeeklyMonthlySummaries_(ss);
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        status: "SUCCESS",
        action: action,
        deletedId: targetId,
        deletedRows: deletedCount,
        sheetsUpdated: ["Time_Logs", "Daily_Summary", "Weekly_Summary", "Monthly_Summary"]
      });
    }

    if (action === "UPDATE_TIMELOG" || action === "EDIT_TIMELOG") {
      var logItem = data.log || data.timeLog || data;
      var targetId = String(logItem.id || logItem.logId || logItem.sessionId || data.logId || data.id || "").trim();
      var timeLogsSheet = ss.getSheetByName("Time_Logs");
      var updatedCount = 0;
      var affectedDailyKeys = {};

      if (timeLogsSheet && timeLogsSheet.getLastRow() > 1) {
        var existingData = timeLogsSheet.getRange(2, 1, timeLogsSheet.getLastRow() - 1, 16).getValues();
        var empCode = String(logItem.employeeCode || logItem.userId || data.employeeCode || data.userId || "").trim().toUpperCase();
        var workDate = normalizeLogDate_(logItem.date || logItem.startTime || data.date);
        var newTask = String(logItem.task || data.task || "").trim();
        var newStart = String(logItem.startTime || data.startTime || "").trim();
        var newEnd = String(logItem.endTime || data.endTime || "").trim();
        var newDurSec = Number(logItem.durationSeconds || data.durationSeconds || 0);
        var newNotes = String(logItem.notes || data.notes || "").trim();

        for (var uI = 0; uI < existingData.length; uI++) {
          var rowId = String(existingData[uI][0] || "").trim();
          var rowCode = String(existingData[uI][1] || "").trim().toUpperCase();
          var rowDate = normalizeLogDate_(existingData[uI][5]);
          var rowTask = String(existingData[uI][14] || "").trim();
          var rowStart = String(existingData[uI][6] || "").trim();

          var isIdMatch = Boolean(targetId) && (
            rowId.toLowerCase() === targetId.toLowerCase() ||
            targetId.toLowerCase().indexOf(rowId.toLowerCase()) !== -1 ||
            rowId.toLowerCase().indexOf(targetId.toLowerCase()) !== -1
          );

          var isMultiCriteriaMatch = Boolean(empCode && workDate) && (rowCode === empCode && rowDate === workDate) && (
            (!newTask || rowTask.toLowerCase() === newTask.toLowerCase() || rowTask.toLowerCase().indexOf(newTask.toLowerCase()) !== -1) &&
            (!newStart || rowStart === newStart || rowStart.indexOf(newStart) !== -1 || newStart.indexOf(rowStart) !== -1)
          );

          var isMatch = isIdMatch || isMultiCriteriaMatch;

          if (isMatch) {
            var rowNum = uI + 2;
            if (newTask) timeLogsSheet.getRange(rowNum, 15).setValue(newTask);
            if (newStart) timeLogsSheet.getRange(rowNum, 7).setValue(newStart);
            if (newEnd) timeLogsSheet.getRange(rowNum, 8).setValue(newEnd);
            if (newDurSec > 0) {
              timeLogsSheet.getRange(rowNum, 9).setValue(newDurSec);
              timeLogsSheet.getRange(rowNum, 10).setValue(formatDetailedDuration_(newDurSec));
            }

            updatedCount++;
            affectedDailyKeys[rowDate + "|" + rowCode] = { date: rowDate, employeeCode: rowCode };
            if (workDate && empCode) affectedDailyKeys[workDate + "|" + empCode] = { date: workDate, employeeCode: empCode };
            break;
          }
        }
      }

      Object.keys(affectedDailyKeys).forEach(function(key) {
        var item = affectedDailyKeys[key];
        rebuildDailySummaryRow_(ss, item.date, item.employeeCode);
      });

      if (updatedCount > 0 || Object.keys(affectedDailyKeys).length > 0) {
        rebuildWeeklyMonthlySummaries_(ss);
      }

      SpreadsheetApp.flush();

      return jsonResponse({
        status: "SUCCESS",
        action: action,
        updatedRows: updatedCount,
        sheetsUpdated: ["Time_Logs", "Daily_Summary", "Weekly_Summary", "Monthly_Summary"]
      });
    }

    if (action === "SYNC_USERS" || action === "SYNC_EMPLOYEES" || action === "ADD_EMPLOYEE" || action === "UPDATE_EMPLOYEE") {
      var users = data.users || data.employees || (data.user ? [data.user] : (data.employee ? [data.employee] : ((data.employeeCode || data.username || data.name || data.fullName) ? [data] : [])));
      if (!Array.isArray(users)) users = [users];
      if (!users.length) {
        return jsonResponse({ status: "ERROR", action: action, code: "MISSING_EMPLOYEE_PAYLOAD", message: "UPDATE_EMPLOYEE requires an employee object, user object, or employee fields in the request body." });
      }

      var empSheet = ss.getSheetByName("Employee_Directory") || ss.insertSheet("Employee_Directory");
      var cols = getEmployeeDirectoryCols(empSheet);

      var existingEmpMap = {};
      if (empSheet.getLastRow() > 1) {
        var eData = empSheet.getRange(2, 1, empSheet.getLastRow() - 1, cols.totalCols).getValues();
        for (var m = 0; m < eData.length; m++) {
          var codeStr = String(eData[m][cols.codeCol - 1] || "").trim().toUpperCase();
          var uStr = String(eData[m][cols.userCol - 1] || "").trim().toLowerCase();
          var rowNum = m + 2;
          if (codeStr) existingEmpMap[codeStr] = rowNum;
          if (uStr) existingEmpMap[uStr] = rowNum;
        }
      }

      for (var n = 0; n < users.length; n++) {
        var u = users[n];
        var eCode = String(u.employeeCode || "").trim().toUpperCase();
        var uId = String(u.id || "").trim();
        var legacyIdAsCode = normalizeEmployeeCodeKey_(uId);
        var uName = String(u.username || "").trim().toLowerCase();

        var targetRow = (eCode && existingEmpMap[eCode]) || (legacyIdAsCode && existingEmpMap[legacyIdAsCode]) || (uName && existingEmpMap[uName]) || -1;

        if (targetRow !== -1) {
          if (eCode) empSheet.getRange(targetRow, cols.codeCol).setValue(eCode);
          if (uName) empSheet.getRange(targetRow, cols.userCol).setValue(uName);
          if (u.name !== undefined && String(u.name).trim()) empSheet.getRange(targetRow, cols.nameCol).setValue(String(u.name).trim());
          if (u.email !== undefined) empSheet.getRange(targetRow, cols.emailCol).setValue(String(u.email || "").trim());
          if (u.role !== undefined && String(u.role).trim()) empSheet.getRange(targetRow, cols.roleCol).setValue(String(u.role).trim());
          if (u.designation !== undefined && String(u.designation).trim()) empSheet.getRange(targetRow, cols.desigCol).setValue(String(u.designation).trim());
          if (u.joinDate) empSheet.getRange(targetRow, cols.hiredCol).setValue(String(u.joinDate).trim());
          if (u.monthlyRate !== undefined) empSheet.getRange(targetRow, cols.monthlyCol).setValue(Number(u.monthlyRate || 0));
          if (u.hourlyRate !== undefined) empSheet.getRange(targetRow, cols.hourlyCol).setValue(Number(u.hourlyRate || 0));
          if (u.teamLeaderId !== undefined) empSheet.getRange(targetRow, cols.tlCol).setValue(String(u.teamLeaderId || "").trim());
          if (u.screenshotMonitored !== undefined) empSheet.getRange(targetRow, cols.scrCol).setValue(u.screenshotMonitored ? "YES" : "NO");
          if (u.activityMonitored !== undefined) empSheet.getRange(targetRow, cols.actCol).setValue(u.activityMonitored ? "YES" : "NO");
          if (u.status !== undefined) empSheet.getRange(targetRow, cols.statusCol).setValue(String(u.status || "active").trim());
        } else {
          var newRowArray = new Array(cols.totalCols);
          for (var c = 0; c < cols.totalCols; c++) newRowArray[c] = "";

          newRowArray[cols.codeCol - 1] = eCode || "N/A";
          newRowArray[cols.userCol - 1] = String(u.username || "").trim().toLowerCase();
          newRowArray[cols.nameCol - 1] = String(u.name || "").trim();
          newRowArray[cols.emailCol - 1] = String(u.email || "").trim();
          newRowArray[cols.roleCol - 1] = String(u.role || "agent").trim();
          newRowArray[cols.desigCol - 1] = String(u.designation || "Agent").trim();
          newRowArray[cols.hiredCol - 1] = String(u.joinDate || "2024-01-01").trim();
          newRowArray[cols.monthlyCol - 1] = Number(u.monthlyRate || 0);
          newRowArray[cols.hourlyRate - 1] = Number(u.hourlyRate || 0);
          newRowArray[cols.tlCol - 1] = String(u.teamLeaderId || "").trim();
          newRowArray[cols.scrCol - 1] = u.screenshotMonitored ? "YES" : "NO";
          newRowArray[cols.actCol - 1] = u.activityMonitored ? "YES" : "NO";
          newRowArray[cols.statusCol - 1] = String(u.status || "active").trim();
          newRowArray[cols.maskedPwCol - 1] = "********";
          newRowArray[cols.pwCol - 1] = String(u.accountPassword || u.password || "Password123!").trim();
          newRowArray[cols.mustChangeCol - 1] = (u.mustChangePassword !== undefined) ? Boolean(u.mustChangePassword) : true;

          empSheet.appendRow(newRowArray);
          var newEmpRow = empSheet.getLastRow();
          if (eCode) existingEmpMap[eCode] = newEmpRow;
          if (uName) existingEmpMap[uName] = newEmpRow;
        }
      }

      SpreadsheetApp.flush();
      return jsonResponse({ status: "SUCCESS", action: action, count: users.length });
    }

    if (action === "SYNC_ATTENDANCE" || action === "RECORD_ATTENDANCE") {
      var attendances = data.attendance || (Array.isArray(data) ? data : []);
      if (!Array.isArray(attendances) && typeof attendances === "object") {
        attendances = [attendances];
      }

      var attSheet = ss.getSheetByName("Daily_Attendance") || ss.insertSheet("Daily_Attendance");
      if (attSheet.getLastRow() === 0) {
        attSheet.appendRow(["Log ID", "Date", "User ID", "Employee Code", "Employee Name", "Role", "First Check-in", "Last Check-out", "Total Duration", "Shift Status"]);
        formatHeaderRow(attSheet, 10);
      }
      forceTextColumns_(attSheet, 2, 1);
      forceTextColumns_(attSheet, 7, 2);

      var attMap = {};
      if (attSheet.getLastRow() > 1) {
        var attData = attSheet.getRange(2, 1, attSheet.getLastRow() - 1, 3).getValues();
        for (var ai = 0; ai < attData.length; ai++) {
          var logId = String(attData[ai][0] || "").trim();
          var dt = asText_(attData[ai][1], "date");
          var usr = String(attData[ai][2] || "").trim();
          if (logId) attMap[logId] = ai + 2;
          if (usr && dt) attMap[usr + "_" + dt] = ai + 2;
        }
      }

      for (var aj = 0; aj < attendances.length; aj++) {
        var a = attendances[aj];
        var aId = String(a.id || a.logId || "").trim();
        var aUser = String(a.userId || "").trim();
        var aDate = String(a.date || Utilities.formatDate(new Date(), "Asia/Manila", "yyyy-MM-dd")).trim();
        var attRowIdx = (aId && attMap[aId]) || (aUser && aDate && attMap[aUser + "_" + aDate]) || -1;

        var aRow = [
          aId || ("ATT-" + aUser + "-" + aDate),
          aDate,
          aUser,
          String(a.employeeCode || "").trim(),
          String(a.name || a.employeeName || "").trim(),
          String(a.role || "agent").trim(),
          String(a.firstCheckin || a.firstCheckIn || "").trim(),
          String(a.lastCheckout || a.lastCheckOut || "").trim(),
          String(a.totalDuration || a.durationFormatted || "").trim(),
          String(a.shiftStatus || a.status || "Completed").trim()
        ];

        if (attRowIdx !== -1) {
          attSheet.getRange(attRowIdx, 1, 1, 10).setValues([aRow]);
        } else {
          attSheet.appendRow(aRow);
          var newAttRow = attSheet.getLastRow();
          if (aId) attMap[aId] = newAttRow;
          if (aUser && aDate) attMap[aUser + "_" + aDate] = newAttRow;
        }
      }

      return jsonResponse({ status: "SUCCESS", action: "SYNC_ATTENDANCE", count: attendances.length });
    }

    if (action === "LOG_AUDIT" || action === "SYNC_AUDITLOGS") {
      var auditList = data.logs || data.auditlogs || (data.log ? [data.log] : []);
      var auditSheet = ss.getSheetByName("Audit_Logs") || ss.insertSheet("Audit_Logs");
      if (auditSheet.getLastRow() === 0) {
        auditSheet.appendRow(["Log ID", "Timestamp (ISO)", "Category", "Actor ID", "Actor Name", "Actor Role", "Action Details", "IP / Device"]);
        formatHeaderRow(auditSheet, 8);
      }

      for (var al = 0; al < auditList.length; al++) {
        var aud = auditList[al];
        auditSheet.appendRow([
          aud.id || ("AUD-" + Date.now()),
          aud.timestamp || new Date().toISOString(),
          aud.category || "GENERAL",
          aud.actorId || "",
          aud.actorName || "",
          aud.actorRole || "",
          aud.actionDetails || aud.action || "",
          aud.ip || aud.device || ""
        ]);
      }

      return jsonResponse({ status: "SUCCESS", action: "LOG_AUDIT", count: auditList.length });
    }

    if (action === "GET_ALL" || action === "READ_ALL") {
      refreshStalePresenceRows_(ss);
      return jsonResponse({
        status: "SUCCESS",
        action: action,
        employees: readEmployees(ss, false),
        timeLogs: readTimeLogs(ss, data),
        presence: readPresence(ss),
        attendance: readAttendance(ss),
        designationTasks: readDesignationTasks(ss)
      });
    }

    if (action === "GET_DESIGNATION_TASKS") {
      return jsonResponse({
        status: "SUCCESS",
        action: action,
        designationTasks: readDesignationTasks(ss)
      });
    }

    if (action === "SYNC_DESIGNATION_TASKS") {
      var dTasksObj = data.designationTasks || data.tasks || {};
      var dtSheet = ss.getSheetByName("Designation_Tasks") || ss.getSheetByName("designation_dtask") || ss.insertSheet("Designation_Tasks");
      if (dtSheet.getLastRow() === 0) {
        dtSheet.appendRow(["Designation Name", "Allowed Tracking Tasks (Comma Separated)", "Total Tasks Count", "Last Updated (ISO)"]);
        formatHeaderRow(dtSheet, 4);
      }
      var existingRowMap = {};
      if (dtSheet.getLastRow() > 1) {
        var dtVals = dtSheet.getRange(2, 1, dtSheet.getLastRow() - 1, 1).getValues();
        for (var dI = 0; dI < dtVals.length; dI++) {
          var dName = String(dtVals[dI][0] || "").trim();
          if (dName) existingRowMap[dName.toLowerCase()] = dI + 2;
        }
      }
      var nowIso = new Date().toISOString();
      var keys = Object.keys(dTasksObj);
      for (var k = 0; k < keys.length; k++) {
        var desigKey = keys[k];
        var tasksArr = Array.isArray(dTasksObj[desigKey]) ? dTasksObj[desigKey] : [];
        var commaTasks = tasksArr.join(", ");
        var rowIdx = existingRowMap[desigKey.toLowerCase()];
        var rowData = [desigKey, commaTasks, tasksArr.length, nowIso];
        if (rowIdx) {
          dtSheet.getRange(rowIdx, 1, 1, 4).setValues([rowData]);
        } else {
          dtSheet.appendRow(rowData);
          existingRowMap[desigKey.toLowerCase()] = dtSheet.getLastRow();
        }
      }
      return jsonResponse({ status: "SUCCESS", action: action, count: keys.length });
    }

    if (action === "GET_AUTH_EMPLOYEES") {
      return jsonResponse({
        status: "SUCCESS",
        action: "GET_AUTH_EMPLOYEES",
        employees: readEmployees(ss, true)
      });
    }

    if (action === "GET_EMPLOYEES") {
      return jsonResponse({
        status: "SUCCESS",
        action: "GET_EMPLOYEES",
        employees: readEmployees(ss, false)
      });
    }

    if (action === "GET_TIMELOGS") {
      return jsonResponse({
        status: "SUCCESS",
        action: "GET_TIMELOGS",
        timeLogs: readTimeLogs(ss, data)
      });
    }

    if (action === "GET_PRESENCE") {
      refreshStalePresenceRows_(ss);
      return jsonResponse({
        status: "SUCCESS",
        action: "GET_PRESENCE",
        presence: readPresence(ss)
      });
    }

    if (action === "GET_ATTENDANCE") {
      return jsonResponse({
        status: "SUCCESS",
        action: "GET_ATTENDANCE",
        attendance: readAttendance(ss)
      });
    }

    if (action === "GET_DAILY_SUMMARY") {
      return jsonResponse({
        status: "SUCCESS",
        action: action,
        summaries: readDailySummaries(ss, data)
      });
    }

    if (action === "ENSURE_DAILY_SUMMARY") {
      var workDate = normalizeLogDate_(data.date || new Date());
      var empCode = String(data.employeeCode || data.userId || "").trim().toUpperCase();
      if (empCode) {
        rebuildDailySummaryRow_(ss, workDate, empCode, {
          name: String(data.userName || data.name || "").trim(),
          designation: String(data.designation || "Agent").trim(),
          firstCheckin: String(data.firstCheckin || "").trim()
        });
        SpreadsheetApp.flush();
      }
      return jsonResponse({ status: "SUCCESS", action: action, employeeCode: empCode, date: workDate });
    }

    if (action === "GET_WEEKLY_SUMMARY") {
      return jsonResponse({
        status: "SUCCESS",
        action: action,
        weeklySummaries: readWeeklySummaries(ss, data)
      });
    }

    if (action === "GET_MONTHLY_SUMMARY") {
      return jsonResponse({
        status: "SUCCESS",
        action: action,
        monthlySummaries: readMonthlySummaries(ss, data)
      });
    }

    return jsonResponse({ status: "ERROR", code: "UNKNOWN_ACTION", message: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse({ status: "ERROR", error: err.message || err.toString() });
  }
}

function readEmployees(ss, includeAuthCredentials) {
  var empSheet = ss.getSheetByName("Employee_Directory");
  if (!empSheet || empSheet.getLastRow() <= 1) return [];

  var cols = getEmployeeDirectoryCols(empSheet);
  var maxCols = cols.totalCols;
  var eValues = empSheet.getRange(2, 1, empSheet.getLastRow() - 1, maxCols).getValues();

  return eValues.map(function(r) {
    var rawMustChange = r[cols.mustChangeCol - 1];
    var mustChange = (typeof rawMustChange === "boolean")
      ? rawMustChange
      : (String(rawMustChange).toUpperCase() === "TRUE" || String(rawMustChange).toUpperCase() === "YES");

    var emp = {
      employeeCode: String(r[cols.codeCol - 1] || "").trim(),
      username: String(r[cols.userCol - 1] || "").trim(),
      name: String(r[cols.nameCol - 1] || "").trim(),
      email: String(r[cols.emailCol - 1] || "").trim(),
      role: String(r[cols.roleCol - 1] || "agent").trim(),
      designation: String(r[cols.desigCol - 1] || "Agent").trim(),
      joinDate: asText_(r[cols.hiredCol - 1], "date"),
      monthlyRate: Number(r[cols.monthlyCol - 1] || 0),
      hourlyRate: Number(r[cols.hourlyCol - 1] || 0),
      teamLeaderId: String(r[cols.tlCol - 1] || "").trim(),
      screenshotMonitored: String(r[cols.scrCol - 1]).toUpperCase() === "YES",
      activityMonitored: String(r[cols.actCol - 1]).toUpperCase() === "YES",
      status: String(r[cols.statusCol - 1] || "active").trim(),
      id: String(r[cols.codeCol - 1] || "").trim(),
      mustChangePassword: mustChange,
      isPasswordChanged: mustChange ? "NO" : "YES"
    };

    if (includeAuthCredentials) {
      emp.accountPassword = String(r[cols.pwCol - 1] || "").trim();
    }

    return emp;
  });
}

function readTimeLogs(ss, opts) {
  var logSheet = ss.getSheetByName("Time_Logs");
  if (!logSheet || logSheet.getLastRow() <= 1) return [];
  opts = opts || {};
  var days = Number(opts.days) || 45;
  var since = opts.since
    ? String(opts.since)
    : Utilities.formatDate(new Date(Date.now() - days * 86400000), TZ, "yyyy-MM-dd");
  var wantUser = String(opts.userId || "").trim();

  var values = logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 16).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var date = asText_(r[5], "date");
    if (date && date < since) continue;

    if (wantUser) {
      var storedUserKey = String(r[15] || "").trim();
      var rowEmployeeCode = String(r[1] || "").trim();
      var canonicalWanted = normalizeEmployeeCodeKey_(wantUser);
      if (storedUserKey !== wantUser && rowEmployeeCode.toUpperCase() !== canonicalWanted && normalizeEmployeeCodeKey_(storedUserKey) !== canonicalWanted) continue;
    }

    out.push({
      id: String(r[0] || "").trim(),
      sessionId: String(r[0] || "").trim(),
      employeeCode: String(r[1] || "").trim(),
      userName: String(r[2] || "").trim(),
      role: String(r[3] || "").trim(),
      designation: String(r[4] || "").trim(),
      date: date,
      startTime: asText_(r[6]),
      endTime: asText_(r[7]),
      durationSeconds: Math.min(Number(r[8] || 0), MAX_SESSION_SECONDS),
      totalTime: String(r[9] || "").trim(),
      idleMinutes: Number(r[10] || 0),
      mousePercentage: Number(r[11] || 95),
      keyboardPercentage: Number(r[12] || 95),
      status: String(r[13] || "completed").trim(),
      task: String(r[14] || "").trim(),
      userId: String(r[15] || "").trim()
    });
  }
  return out;
}

function readPresence(ss) {
  var presSheet = ss.getSheetByName("Live_Presence");
  if (!presSheet || presSheet.getLastRow() <= 1) return [];
  var pValues = presSheet.getRange(2, 1, presSheet.getLastRow() - 1, 13).getValues();
  return pValues.map(function(r) {
    var code = String(r[0] || "").trim();
    return {
      employeeCode: code,
      userName: String(r[1] || "").trim(),
      userRole: String(r[2] || "").trim(),
      role: String(r[2] || "").trim(),
      designation: String(r[3] || "").trim(),
      loginPlatform: String(r[4] || "").trim(),
      platformMode: String(r[4] || "").trim(),
      status: String(r[5] || "").trim(),
      currentTask: String(r[6] || "").trim(),
      currentApp: String(r[7] || "").trim(),
      elapsedTimeFormatted: String(r[8] || "").trim(),
      totalTodayFormatted: String(r[8] || "").trim(),
      firstCheckin: asText_(r[9]),
      timezone: String(r[10] || "").trim(),
      lastHeartbeat: asText_(r[12]),
      userId: code
    };
  });
}

function readAttendance(ss) {
  var attSheet = ss.getSheetByName("Daily_Attendance");
  if (!attSheet || attSheet.getLastRow() <= 1) return [];

  var aValues = attSheet.getRange(2, 1, attSheet.getLastRow() - 1, 10).getValues();
  return aValues.map(function(r) {
    return {
      id: String(r[0] || "").trim(),
      date: asText_(r[1], "date"),
      userId: String(r[2] || "").trim(),
      employeeCode: String(r[3] || "").trim(),
      name: String(r[4] || "").trim(),
      role: String(r[5] || "").trim(),
      firstCheckin: asText_(r[6]),
      lastCheckout: asText_(r[7]),
      totalDuration: String(r[8] || "").trim(),
      shiftStatus: String(r[9] || "").trim()
    };
  });
}

function readDailySummaries(ss, opts) {
  var sheet = ss.getSheetByName("Daily_Summary");
  if (!sheet || sheet.getLastRow() <= 1) return [];
  opts = opts || {};
  var filterDate = opts.date ? String(opts.date).trim() : "";
  var filterUser = opts.userId ? normalizeEmployeeCodeKey_(opts.userId) : "";

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var rowDate = asText_(r[0], "date");
    var rowCode = String(r[1] || "").trim().toUpperCase();

    if (filterDate && rowDate !== filterDate) continue;
    if (filterUser && rowCode !== filterUser) continue;

    out.push({
      date: rowDate,
      employeeCode: rowCode,
      employeeName: String(r[2] || "").trim(),
      designation: String(r[3] || "").trim(),
      tasksWorkedOn: String(r[4] || "").trim(),
      firstClockIn: asText_(r[5]),
      lastClockOut: asText_(r[6]),
      grossTrackedShift: String(r[7] || "").trim(),
      totalIdleBreaks: String(r[8] || "").trim(),
      netProductiveWork: String(r[9] || "").trim(),
      grossSeconds: Number(r[10] || 0),
      durationSeconds: Number(r[10] || 0),
      avgActivity: String(r[11] || "0%"),
      shiftStatus: String(r[12] || "").trim(),
      logEntries: Number(r[13] || 0)
    });
  }
  return out;
}

function readWeeklySummaries(ss, opts) {
  var sheet = ss.getSheetByName("Weekly_Summary");
  if (!sheet || sheet.getLastRow() <= 1) return [];
  opts = opts || {};
  var filterUser = opts.userId ? normalizeEmployeeCodeKey_(opts.userId) : "";

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var rowCode = String(r[1] || "").trim().toUpperCase();
    if (filterUser && rowCode !== filterUser) continue;

    var weekPeriod = String(r[0] || "").trim();
    var parts = weekPeriod.split(" to ");
    out.push({
      weekPeriod: weekPeriod,
      weekStart: parts[0] || "",
      weekEnd: parts[1] || "",
      employeeCode: rowCode,
      employeeName: String(r[2] || "").trim(),
      designation: String(r[3] || "").trim(),
      tasksBreakdown: String(r[4] || "").trim(),
      daysRendered: Number(r[5] || 0),
      grossTracked: String(r[6] || "").trim(),
      totalIdleBreaks: String(r[7] || "").trim(),
      netProductiveWork: String(r[8] || "").trim(),
      regularHours: String(r[9] || "").trim(),
      overtimeHours: String(r[10] || "").trim(),
      avgActivity: String(r[11] || "0%")
    });
  }
  return out;
}

function readMonthlySummaries(ss, opts) {
  var sheet = ss.getSheetByName("Monthly_Summary");
  if (!sheet || sheet.getLastRow() <= 1) return [];
  opts = opts || {};
  var filterUser = opts.userId ? normalizeEmployeeCodeKey_(opts.userId) : "";

  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var rowCode = String(r[1] || "").trim().toUpperCase();
    if (filterUser && rowCode !== filterUser) continue;

    out.push({
      monthPeriod: String(r[0] || "").trim(),
      employeeCode: rowCode,
      employeeName: String(r[2] || "").trim(),
      designation: String(r[3] || "").trim(),
      primaryTasks: String(r[4] || "").trim(),
      totalDaysRendered: Number(r[5] || 0),
      grossTrackedHours: String(r[6] || "").trim(),
      totalIdleBreaks: String(r[7] || "").trim(),
      netProductiveWork: String(r[8] || "").trim(),
      avgActivity: String(r[9] || "0%")
    });
  }
}

function readDesignationTasks(ss) {
  var dtSheet = ss.getSheetByName("Designation_Tasks") || ss.getSheetByName("designation_dtask") || ss.getSheetByName("Designation_Task");
  if (!dtSheet || dtSheet.getLastRow() <= 1) return null;

  var values = dtSheet.getRange(2, 1, dtSheet.getLastRow() - 1, 4).getValues();
  var out = {};
  for (var i = 0; i < values.length; i++) {
    var desig = String(values[i][0] || "").trim();
    if (!desig) continue;
    var rawTasks = String(values[i][1] || "").trim();
    var taskArray = rawTasks
      ? rawTasks.split(",").map(function(t) { return t.trim(); }).filter(Boolean)
      : [];
    out[desig] = taskArray;
  }
  return out;
}

function formatHeaderRow(sheet, numColumns) {
  sheet.getRange(1, 1, 1, numColumns)
    .setFontWeight("bold")
    .setBackground("#0f172a")
    .setFontColor("#ffffff");
  sheet.setFrozenRows(1);
}

function setupTextColumns() {
  var ss = getLLCTRACKERV2Spreadsheet();
  var t = ss.getSheetByName("Time_Logs");
  if (t) forceTextColumns_(t, 6, 3);
  var a = ss.getSheetByName("Daily_Attendance");
  if (a) { forceTextColumns_(a, 2, 1); forceTextColumns_(a, 7, 2); }
  var p = ss.getSheetByName("Live_Presence");
  if (p) { forceTextColumns_(p, 9, 1); forceTextColumns_(p, 12, 1); }
  var au = ss.getSheetByName("Audit_Logs");
  if (au) forceTextColumns_(au, 2, 1);
  var e = ss.getSheetByName("Employee_Directory");
  if (e) forceTextColumns_(e, 7, 1);
  Logger.log("Text columns set.");
}

function repairBadDurations() {
  var ss = getLLCTRACKERV2Spreadsheet();
  var sh = ss.getSheetByName("Time_Logs");
  if (!sh || sh.getLastRow() <= 1) return;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 16).getValues();
  var fixed = 0;
  for (var i = 0; i < v.length; i++) {
    var d = Number(v[i][8]) || 0;
    var clean = sanitizeDuration_(d, asText_(v[i][6]), asText_(v[i][7]), 0);
    if (clean !== d) {
      sh.getRange(i + 2, 9).setValue(clean);
      sh.getRange(i + 2, 10).setValue(
        Math.floor(clean / 3600) + "h " + Math.floor((clean % 3600) / 60) + "m " + (clean % 60) + "s"
      );
      fixed++;
    }
  }
  Logger.log("Repaired " + fixed + " rows.");
}

function createAllTabsNow() {
  var ss = getLLCTRACKERV2Spreadsheet();
  var tabs = [
    { name: "Live_Presence", headers: ["Employee Code", "Employee Name", "User Role", "Designation", "Current Status", "Active Task", "Elapsed Time", "Total Today Time", "First Check-in", "Device Timezone", "Platform Mode", "Last Heartbeat", "User ID"] },
    { name: "Time_Logs", headers: ["Session ID", "Employee Code", "Employee Name", "Role", "Designation", "Date (YYYY-MM-DD)", "Start Time", "End Time", "Duration (Seconds)", "Total Time", "Idle Minutes", "Mouse %", "Keyboard %", "Status", "Task", "User ID"] },
    { name: "Employee_Directory", headers: ["Employee Code", "Username", "Full Name", "Email", "Role", "Designation", "Date Hired", "Monthly Rate", "Hourly Rate", "Team Leader", "Screenshot Monitored", "Activity Monitored", "Account Status", "Masked Password", "AccountPassword", "mustChangePassword"] },
    { name: "Daily_Attendance", headers: ["Log ID", "Date", "User ID", "Employee Code", "Employee Name", "Role", "First Check-in", "Last Check-out", "Total Duration", "Shift Status"] },
    { name: "Audit_Logs", headers: ["Log ID", "Timestamp (ISO)", "Category", "Actor ID", "Actor Name", "Actor Role", "Action Details", "IP / Device"] },
    { name: "Designation_Tasks", headers: ["Designation Name", "Allowed Tracking Tasks (Comma Separated)", "Total Tasks Count", "Last Updated (ISO)"] },
  ];

  tabs.forEach(function(t) {
    var sheet = ss.getSheetByName(t.name) || ss.insertSheet(t.name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(t.headers);
      formatHeaderRow(sheet, t.headers.length);
    }
  });

  var dtSheet = ss.getSheetByName("Designation_Tasks");
  if (dtSheet && dtSheet.getLastRow() === 1) {
    var nowIso = new Date().toISOString();
    var defaultDtRows = [
      ["Outbound Agent", "Data Entry & Market Research, Email Reachout, Follow-up, Training, Team Meeting, Coaching", 6, nowIso],
      ["Team Leader", "Team Supervision, Team Meeting, Training, Coaching, QA Review, On Shift", 6, nowIso],
      ["Trainer", "Training, Coaching, Team Meeting, QA Review, On Shift", 5, nowIso],
      ["Admin", "System Ops Review, On Shift", 2, nowIso],
      ["QA Specialist", "QA Email Audit, Other QA Reviews, QA Coaching", 3, nowIso],
      ["Writer", "Content Writing, Team Meeting, On Shift", 3, nowIso],
      ["HR", "Team Meeting, HR & Recruitment, On Shift", 3, nowIso],
      ["Payroll Officer", "Payroll task, On Shift, Team Meeting", 3, nowIso],
      ["Inbound Agent", "Data Entry & Market Research, Email Interaction, Training, Team Meeting, Coaching", 5, nowIso]
    ];
    defaultDtRows.forEach(function(r) { dtSheet.appendRow(r); });
  }

  var empSheet = ss.getSheetByName("Employee_Directory");
  if (empSheet && empSheet.getLastRow() === 1) {
    empSheet.appendRow([
      "SuperAdmin", "admin", "Admin", "admin@llc.com", "admin", "Admin",
      "2024-01-01", 0, 0, "", "NO", "NO", "active", "********",
      "AdminpassW0rd123!", false
    ]);
    empSheet.appendRow([
      "LLC-0003", "trainer", "Pia", "piaodahcam@gmail.com", "trainer", "Trainer",
      "2020-01-01", 0, 0, "", "NO", "NO", "active", "********",
      "Password123!", true
    ]);
    empSheet.appendRow([
      "LLC-0023", "jdavid", "Juan David", "jdavid@gmail.com", "agent", "Agent",
      "2024-01-01", 0, 0, "usr-llc-0003", "NO", "NO", "active", "********",
      "Password123!", true
    ]);
  }

  SpreadsheetApp.flush();
  Logger.log("Initialized Version 2 Spreadsheet tabs with authoritative Employee_Directory successfully!");
}

/**
 * Custom Top Menu for Google Sheets
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu("LLC Time Tracker")
      .addItem("1-Click: Reformat All Dates & Timestamps (Manila Time)", "reformatAllTimestampsManila")
      .addItem("1-Click: Clean Up & Auto-Close Stuck Sessions", "autoCloseStuckSessions")
      .addItem("1-Click: Rebuild All Summaries (Daily, Weekly, Monthly)", "rebuildAllSummariesManual")
      .addSeparator()
      .addItem("⚙️ Set Up Manual Edit/Delete Auto-Sync Trigger", "setupSpreadsheetChangeTrigger")
      .addItem("⚙️ Set Up Daily 11:50 PM Auto-Cleanup Trigger", "setupDailyAutoCleanupTrigger")
      .addToUi();
  } catch (err) {
    Logger.log("onOpen menu notice: " + err);
  }
}

/**
 * Rebuild all Daily, Weekly, and Monthly Summaries from Time_Logs
 */
function rebuildAllSummariesFromTimeLogs_(ss) {
  var canonical = ss.getSheetByName("Time_Logs");
  var uniquePairs = {};
  if (canonical && canonical.getLastRow() > 1) {
    var source = canonical.getRange(2, 1, canonical.getLastRow() - 1, 16).getValues();
    for (var i = 0; i < source.length; i++) {
      var idStr = String(source[i][0] || "").trim().toLowerCase();
      if (idStr.indexOf("live-") === 0) continue;
      var empCode = String(source[i][1] || "").trim().toUpperCase();
      var workDate = normalizeLogDate_(source[i][5]);
      if (empCode && workDate) {
        uniquePairs[workDate + "|" + empCode] = { date: workDate, employeeCode: empCode };
      }
    }
  }

  var dailySheet = ss.getSheetByName("Daily_Summary");
  if (dailySheet && dailySheet.getLastRow() > 1) {
    var existingDaily = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, 2).getValues();
    for (var d = 0; d < existingDaily.length; d++) {
      var dDate = normalizeLogDate_(existingDaily[d][0]);
      var dCode = String(existingDaily[d][1] || "").trim().toUpperCase();
      if (dDate && dCode) {
        uniquePairs[dDate + "|" + dCode] = { date: dDate, employeeCode: dCode };
      }
    }
  }

  Object.keys(uniquePairs).forEach(function(key) {
    var item = uniquePairs[key];
    rebuildDailySummaryRow_(ss, item.date, item.employeeCode);
  });

  rebuildWeeklyMonthlySummaries_(ss);
}

function rebuildAllSummariesManual() {
  var ss = getLLCTRACKERV2Spreadsheet();
  rebuildAllSummariesFromTimeLogs_(ss);
  try {
    SpreadsheetApp.getUi().alert("Successfully recalculated and rebuilt all Daily, Weekly, and Monthly Summaries!");
  } catch (e) {
    Logger.log("Successfully rebuilt all summaries.");
  }
}

/**
 * Automated Spreadsheet Change Trigger
 * Listens for manual row deletions, inserts, and cell edits in Google Sheets UI
 */
function onChange(e) {
  try {
    if (!e) return;
    var ss = getLLCTRACKERV2Spreadsheet();
    var activeSheet = ss.getActiveSheet();
    var activeSheetName = activeSheet ? activeSheet.getName() : "";

    if (activeSheetName === "Time_Logs" || e.changeType === "REMOVE_ROW" || e.changeType === "REMOVE_GRID" || e.changeType === "EDIT") {
      rebuildAllSummariesFromTimeLogs_(ss);
    }
  } catch (err) {
    Logger.log("onChange trigger notice: " + err);
  }
}

function setupSpreadsheetChangeTrigger() {
  var ss = getLLCTRACKERV2Spreadsheet();
  var triggers = ScriptApp.getUserTriggers(ss);
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onChange") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("onChange")
    .forSpreadsheet(ss)
    .onChange()
    .create();

  try {
    SpreadsheetApp.getUi().alert("Auto-Sync Trigger successfully set up! Manual row deletes/edits in Google Sheets will now auto-recalculate Daily Summaries.");
  } catch (e) {}
}

/**
 * 1-Click Reformat All Dates & Timestamps to Manila Local Time (Asia/Manila)
 */
function reformatAllTimestampsManila() {
  var ss = getLLCTRACKERV2Spreadsheet();
  var sh = ss.getSheetByName("Time_Logs");
  if (!sh || sh.getLastRow() <= 1) return;

  var range = sh.getRange(2, 6, sh.getLastRow() - 1, 3);
  var values = range.getValues();
  var updated = 0;

  for (var i = 0; i < values.length; i++) {
    var rawStart = values[i][1];
    var rawEnd = values[i][2];

    if (rawStart) {
      var dStart = new Date(rawStart);
      if (!isNaN(dStart.getTime())) {
        values[i][1] = Utilities.formatDate(dStart, "Asia/Manila", "yyyy-MM-dd hh:mm:ss a");
        values[i][0] = Utilities.formatDate(dStart, "Asia/Manila", "yyyy-MM-dd");
      }
    }

    if (rawEnd && rawEnd !== "In Progress" && String(rawEnd).indexOf("In Progress") === -1) {
      var dEnd = new Date(rawEnd);
      if (!isNaN(dEnd.getTime())) {
        values[i][2] = Utilities.formatDate(dEnd, "Asia/Manila", "yyyy-MM-dd hh:mm:ss a");
      }
    }
    updated++;
  }

  range.setNumberFormat("@");
  range.setValues(values);
  try {
    SpreadsheetApp.getUi().alert("Successfully reformatted " + updated + " rows into Manila Local Time (Asia/Manila)!");
  } catch (e) {
    Logger.log("Reformatted " + updated + " rows.");
  }
}

/**
 * Clean Up & Auto-Close Stuck Sessions
 */
function autoCloseStuckSessions() {
  var ss = getLLCTRACKERV2Spreadsheet();
  var sh = ss.getSheetByName("Time_Logs");
  var cleanedCount = 0;
  var affectedDailyKeys = {};

  if (sh && sh.getLastRow() > 1) {
    var lastRow = sh.getLastRow();
    var data = sh.getRange(2, 1, lastRow - 1, 16).getValues();

    for (var i = 0; i < data.length; i++) {
      var status = String(data[i][13] || "").toLowerCase().trim();
      var startTimeStr = data[i][6];
      var grossSec = Number(data[i][8]) || 0;
      var dateStr = normalizeLogDate_(data[i][5]);
      var empCode = String(data[i][1] || "").trim().toUpperCase();

      if (status === "running" || status.indexOf("in progress") !== -1) {
        var startTime = new Date(startTimeStr);
        if (!isNaN(startTime.getTime())) {
          var calculatedEndMs = startTime.getTime() + (grossSec > 0 ? grossSec * 1000 : 0);
          var endDate = new Date(calculatedEndMs);

          var formattedEndTime = Utilities.formatDate(endDate, "Asia/Manila", "yyyy-MM-dd hh:mm:ss a");
          var durStr = Math.floor(grossSec / 3600) + "h " +
                       Math.floor((grossSec % 3600) / 60) + "m " +
                       (grossSec % 60) + "s";

          sh.getRange(i + 2, 8).setValue(formattedEndTime);
          sh.getRange(i + 2, 9).setValue(grossSec);
          sh.getRange(i + 2, 10).setValue(durStr);
          sh.getRange(i + 2, 14).setValue("completed");
          cleanedCount++;

          if (dateStr && empCode) {
            affectedDailyKeys[dateStr + "|" + empCode] = { date: dateStr, employeeCode: empCode };
          }
        }
      }
    }
  }

  // Also check Daily_Summary tab for any stuck "In Progress" rows
  var dailySheet = ss.getSheetByName("Daily_Summary");
  if (dailySheet && dailySheet.getLastRow() > 1) {
    var dData = dailySheet.getRange(2, 1, dailySheet.getLastRow() - 1, 14).getValues();
    var todayManila = Utilities.formatDate(new Date(), "Asia/Manila", "yyyy-MM-dd");
    for (var d = 0; d < dData.length; d++) {
      var dDate = normalizeLogDate_(dData[d][0]);
      var dCode = String(dData[d][1] || "").trim().toUpperCase();
      var dStatus = String(dData[d][12] || "").trim().toLowerCase();
      if ((dStatus === "in progress" && dDate < todayManila) || affectedDailyKeys[dDate + "|" + dCode]) {
        affectedDailyKeys[dDate + "|" + dCode] = { date: dDate, employeeCode: dCode };
      }
    }
  }

  Object.keys(affectedDailyKeys).forEach(function(key) {
    var item = affectedDailyKeys[key];
    rebuildDailySummaryRow_(ss, item.date, item.employeeCode);
  });

  if (cleanedCount > 0 || Object.keys(affectedDailyKeys).length > 0) {
    rebuildWeeklyMonthlySummaries_(ss);
  }

  try {
    SpreadsheetApp.getUi().alert("Cleaned up and auto-closed " + cleanedCount + " stuck running sessions and updated Daily Summaries!");
  } catch (e) {
    Logger.log("Cleaned up " + cleanedCount + " sessions.");
  }
  return cleanedCount;
}

/**
 * Configure Daily 11:50 PM Trigger
 */
function setupDailyAutoCleanupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "autoCloseStuckSessions") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("autoCloseStuckSessions")
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();

  try {
    SpreadsheetApp.getUi().alert("Daily 11:50 PM Auto-Cleanup Trigger successfully configured!");
  } catch (e) {}
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
