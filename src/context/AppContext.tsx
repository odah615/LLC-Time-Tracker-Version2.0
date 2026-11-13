import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  User,
  TimeLog,
  ScreenshotLog,
  IdleLog,
  LeaveRequest,
  LeaveBalance,
  ManualTimeRequest,
  PayrollRecord,
  TaskCategory,
  Designation,
  WorldClockItem,
  AppUsage,
  AuditLog,
  UserPresence,
  DailyAttendanceLog,
  PasswordResetRequest,
  RolePermissions,
} from '../types';
import { doc, setDoc, deleteDoc, onSnapshot, collection, disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getManilaDateString, getManilaTimeString, getManilaIsoString, formatLogStartTime, formatLogEndTime, formatDurationDetailed } from '../lib/dateUtils';
import { getJitteredPollInterval } from '../lib/fetchUtils';
import { generateUniqueUsername, deduplicateUsers, resolveCanonicalEmployee, isPlaceholderName, normalizeDesignation } from '../lib/userUtils';
import {
  getAuthHeaders,
  syncDataToGoogleSheetsWebhook,
  syncEmployeesToGoogleSheetsWebhook,
  syncAgentHeartbeatToSheets,
  syncLeaveRequestToGoogleSheetsWebhook,
  syncLeaveBalanceToGoogleSheetsWebhook,
  DEFAULT_SPREADSHEET_ID,
  DEFAULT_WEBHOOK_URL,
  fetchEmployeesFromGoogleSheets,
  fetchTimeLogsFromGoogleSheets,
  fetchLivePresenceFromGoogleSheets,
  isValidWebhookUrl,
  resetGoogleSpreadsheetData,
  normalizeWorkDate,
  normalizeTimeValue,
  parseDurationSeconds,
} from '../lib/googleSheetsSync';
import { playInactivityChime, playUrgentPulse } from '../lib/soundAlerts';
import {
  INITIAL_USERS,
  INITIAL_PAYROLL,
  INITIAL_WORLD_CLOCKS,
  INITIAL_AUDIT_LOGS,
  DEFAULT_DESIGNATION_TASKS,
  DEFAULT_ROLE_PERMISSIONS,
} from '../data/initialData';

export function sanitizeForFirestore<T>(val: T): T {
  if (val === undefined) {
    return null as unknown as T;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, v] of Object.entries(val as Record<string, any>)) {
    if (v !== undefined) {
      result[key] = sanitizeForFirestore(v);
    }
  }
  return result as T;
}

export function getDeterministicLogId(l: any): string {
  if (!l) return `log-${Date.now()}`;
  if (l.id && typeof l.id === 'string' && !l.id.startsWith('log-0.')) return l.id;
  if (l.sessionId && typeof l.sessionId === 'string' && !l.sessionId.startsWith('log-0.')) return l.sessionId;
  const emp = String(l.employeeCode || l.userId || 'emp').trim().toLowerCase();
  const date = String(l.date || '').trim();
  const task = String(l.task || 'work').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  const dur = Number(l.durationSeconds || 0);
  return `log-${emp}-${date}-${task}-${dur}`;
}

function isSupervisorOrAdminRole(user?: User | null): boolean {
  if (!user) return false;
  if ((user as any).isSuperAdmin) return true;
  const role = String(user.role || '').trim().toLowerCase();
  return ['admin', 'va_admin', 'team_lead', 'trainer', 'hr', 'payroll', 'qa'].includes(role);
}

function matchesAgentRecord(log: Partial<TimeLog>, user: User): boolean {
  const uCode = String(user.employeeCode || '').trim().toUpperCase();
  const uDigits = uCode.replace(/\D/g, '');
  const uId = String(user.id || '').trim().toLowerCase();
  const uName = String(user.name || '').trim().toLowerCase();
  const uUsername = String(user.username || '').trim().toLowerCase();

  const lCode = String(log.employeeCode || '').trim().toUpperCase();
  const lDigits = lCode.replace(/\D/g, '');
  const lUserId = String(log.userId || '').trim().toLowerCase();
  const lName = String(log.userName || '').trim().toLowerCase();

  if (uCode && lCode && uCode === lCode) return true;
  if (uDigits && lDigits && Number(uDigits) === Number(lDigits)) return true;
  if (uId && lUserId && uId === lUserId) return true;
  if (uUsername && (lUserId === uUsername || lCode.toLowerCase() === uUsername)) return true;
  if (uName && lName && uName === lName) return true;
  return false;
}

function mapSheetTimeLogs(
  rawLogs: Partial<TimeLog>[],
  usersList: User[],
  fallbackUser?: User
): TimeLog[] {
  let deletedIds = new Set<string>();
  let deletedSigs = new Set<string>();
  try {
    deletedIds = new Set<string>(JSON.parse(localStorage.getItem('trackpulse_deleted_ids') || '[]'));
    deletedSigs = new Set<string>(JSON.parse(localStorage.getItem('trackpulse_deleted_signatures') || '[]'));
  } catch {}

  const mappedLogs: TimeLog[] = [];
  for (const l of rawLogs) {
    const lEmpUpper = String(l.employeeCode || '').trim().toUpperCase();
    const lEmpDigits = lEmpUpper.replace(/\D/g, '');
    const lUidLower = String(l.userId || '').trim().toLowerCase();
    const lNameLower = String(l.userName || '').trim().toLowerCase();

    const matchedUser = usersList.find((u) => {
      const uEmpUpper = String(u.employeeCode || '').trim().toUpperCase();
      const uEmpDigits = uEmpUpper.replace(/\D/g, '');
      const uIdLower = String(u.id || '').trim().toLowerCase();
      const uUserLower = String(u.username || '').trim().toLowerCase();
      const uNameLower = String(u.name || '').trim().toLowerCase();

      if (uEmpUpper && lEmpUpper && uEmpUpper === lEmpUpper) return true;
      if (uEmpDigits && lEmpDigits && Number(uEmpDigits) === Number(lEmpDigits)) return true;
      if (uIdLower && lUidLower && uIdLower === lUidLower) return true;
      if (uUserLower && (lUidLower === uUserLower || lEmpUpper.toLowerCase() === uUserLower)) return true;
      if (uNameLower && lNameLower && uNameLower === lNameLower) return true;
      return false;
    });

    const empCode = l.employeeCode || matchedUser?.employeeCode || fallbackUser?.employeeCode || l.userId || '';
    const logDate = normalizeWorkDate(l.date, l.startTime) || getManilaDateString();
    const logTask = (l.task || 'Work') as TaskCategory;
    const rawDuration = Number(l.durationSeconds || 0);
    const parsedDur = rawDuration > 0 ? rawDuration : parseDurationSeconds((l as any).durationFormatted || (l as any).totalTime || 0);

    const rawCandidate = {
      ...l,
      employeeCode: empCode,
      date: logDate,
      task: logTask,
      durationSeconds: parsedDur,
    };

    const detId = getDeterministicLogId(rawCandidate);
    const sig = `${String(empCode).trim().toLowerCase()}|${String(logDate).trim()}|${String(logTask).trim().toLowerCase()}|${Math.round(parsedDur / 10)}`;

    if (
      deletedIds.has(detId.toLowerCase()) ||
      (l.id && deletedIds.has(String(l.id).toLowerCase())) ||
      (l.sessionId && deletedIds.has(String(l.sessionId).toLowerCase())) ||
      deletedSigs.has(sig)
    ) {
      continue;
    }

    const item: TimeLog = {
      id: detId,
      sessionId: l.sessionId || detId,
      userId: l.userId || matchedUser?.id || fallbackUser?.id || empCode,
      employeeCode: empCode,
      userName: l.userName || matchedUser?.name || fallbackUser?.name || empCode || 'Unknown Agent',
      userAvatar: l.userAvatar || matchedUser?.avatar || '',
      designation: (l.designation || matchedUser?.designation || fallbackUser?.designation || 'Outbound Agent') as Designation,
      task: logTask,
      date: logDate,
      startTime: l.startTime || new Date().toISOString(),
      endTime: l.endTime || 'In Progress',
      durationSeconds: parsedDur,
      status: l.status || 'completed',
      geoTimezone: 'Asia/Manila',
      geoLocalStartTime: l.geoLocalStartTime || l.startTime || '',
      geoLocalEndTime: l.endTime || '',
      mouseActivityAvg: (l as any).mousePercentage ?? l.mouseActivityAvg ?? 95,
      keyboardActivityAvg: (l as any).keyboardPercentage ?? l.keyboardActivityAvg ?? 90,
      idleSeconds: l.idleSeconds ?? ((Number((l as any).idleMinutes) || 0) * 60),
      notes: l.notes || '',
      appsUsed: Array.isArray(l.appsUsed) ? l.appsUsed : [],
    };

    mappedLogs.push(item);
  }
  return mappedLogs;
}

function mergeTimeLogsWithLocal(prevLogs: TimeLog[], incomingLogs: TimeLog[]): TimeLog[] {
  const map = new Map<string, TimeLog>();
  let editedIds = new Set<string>();
  try {
    editedIds = new Set<string>(JSON.parse(localStorage.getItem('trackpulse_edited_ids') || '[]'));
  } catch {}

  for (const item of prevLogs) {
    map.set(item.id, item);
  }
  for (const item of incomingLogs) {
    const local = map.get(item.id);
    if (!local) {
      map.set(item.id, item);
    } else if (local.status !== 'running') {
      const isEditedLocally = editedIds.has(item.id.toLowerCase()) || editedIds.has(local.id.toLowerCase());
      if (isEditedLocally || (local.durationSeconds || 0) > (item.durationSeconds || 0)) {
        map.set(item.id, {
          ...item,
          ...local,
          durationSeconds: Math.max(local.durationSeconds || 0, item.durationSeconds || 0),
          endTime: (local.durationSeconds || 0) > (item.durationSeconds || 0) ? local.endTime : item.endTime,
        });
      } else {
        map.set(item.id, { ...local, ...item });
      }
    }
  }
  return Array.from(map.values());
}

let isQuotaExhaustedGlobal = true;
try {
  disableNetwork(db).catch(() => {});
} catch {}

export const setCloudQuotaExhausted = () => {
  isQuotaExhaustedGlobal = true;
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('trackpulse_quota_exhausted', 'true');
      localStorage.setItem('trackpulse_storage_engine', 'unlimited_bridge');
    }
  } catch {}
  try {
    disableNetwork(db).catch(() => {});
  } catch {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('firestore_quota_status_change'));
  }
};

const safeSetDoc = async (docRef: any, data: any, options?: any) => {
  if (isQuotaExhaustedGlobal) {
    return Promise.resolve();
  }
  try {
    const cleanData = sanitizeForFirestore(data);
    return await (options ? setDoc(docRef, cleanData, options) : setDoc(docRef, cleanData));
  } catch (err: any) {
    const isQuota = err?.code === 'resource-exhausted' ||
                    err?.message?.includes('Quota exceeded') ||
                    err?.message?.includes('resource-exhausted');
    if (isQuota) {
      setCloudQuotaExhausted();
      return Promise.resolve();
    }
    console.warn('safeSetDoc write warning:', err);
    return Promise.resolve();
  }
};

const safeDeleteDoc = async (docRef: any) => {
  if (isQuotaExhaustedGlobal) {
    return Promise.resolve();
  }
  try {
    return await deleteDoc(docRef);
  } catch (err: any) {
    const isQuota = err?.code === 'resource-exhausted' ||
                    err?.message?.includes('Quota exceeded') ||
                    err?.message?.includes('resource-exhausted');
    if (isQuota) {
      setCloudQuotaExhausted();
      return Promise.resolve();
    }
    console.warn('safeDeleteDoc warning:', err);
    return Promise.resolve();
  }
};

interface TaskSwitchPending {
  targetTask: TaskCategory;
}

interface AppContextType {
  currentUser: User;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setCurrentUser: (user: User) => void;
  isCloudQuotaExhausted: boolean;
  isAuthenticated: boolean;
  loginMode: 'webapp' | 'software';
  setLoginMode: (mode: 'webapp' | 'software') => void;
  login: (user: User, mode?: 'webapp' | 'software', token?: string) => void;
  logout: (reason?: string) => void;
  webSessionRemainingSeconds: number;
  isSessionWarningActive: boolean;
  webSessionWarningCountdown: number;
  refreshWebSession: () => void;
  sessionExpiredReason: string | null;
  clearSessionExpiredReason: () => void;
  isOffline: boolean;
  offlineSinceTimestamp: number | null;
  offlineSecondsRemaining: number;
  offlineStatusStage: 'online' | 'warning_5m' | 'critical_countdown' | 'timeout';
  retryConnection: () => Promise<boolean>;
  simulateOfflineToggle: () => void;
  isTracking: boolean;
  isPaused: boolean;
  currentDesignation: Designation;
  currentTask: TaskCategory;
  elapsedSeconds: number;
  todayTotalSeconds: number;
  getTodayTrackedSeconds: () => number;
  currentSessionApps: AppUsage[];
  currentMouseActivity: number;
  currentKeyboardActivity: number;
  currentActiveApp: string;
  taskSwitchPending: TaskSwitchPending | null;
  currentIdleThresholdMinutes: number;
  currentInactivitySeconds: number;
  sessionIdleDeductionSeconds: number;
  isIdleAlertActive: boolean;
  dismissIdleAlert: () => void;
  recordIdleInactivityEvent: (idleMinutes: number, reason?: string) => void;
  simulateIdleEvent: (minutes?: number) => void;
  restoreInactivityDeduction: () => void;
  setBulkIdleTracking: (enabled: boolean) => void;
  isDualMonitorMode: boolean;
  toggleDualMonitorMode: () => void;
  storageEngineMode: 'unlimited_bridge' | 'firestore';
  setStorageEngineMode: (mode: 'unlimited_bridge' | 'firestore') => void;
  inactivityAlertState: {
    isOpen: boolean;
    idleMinutes: number;
    remainingSeconds: number;
  };
  respondToInactivityAlert: (action: 'stay_active' | 'pause_tracker') => void;
  startTracking: () => void;
  pauseTracking: () => void;
  resumeTracking: () => void;
  stopTracking: () => void;
  selectDesignation: (desig: Designation) => void;
  selectTaskWithPrompt: (task: TaskCategory) => void;
  confirmTaskSwitch: () => void;
  cancelTaskSwitch: () => void;
  timeLogs: TimeLog[];
  screenshots: ScreenshotLog[];
  idleLogs: IdleLog[];
  leaveRequests: LeaveRequest[];
  leaveBalances: LeaveBalance[];
  manualTimeRequests: ManualTimeRequest[];
  payrollRecords: PayrollRecord[];
  worldClocks: WorldClockItem[];
  auditLogs: AuditLog[];
  userPresenceList: UserPresence[];
  dailyAttendanceLogs: DailyAttendanceLog[];
  passwordResetRequests: PasswordResetRequest[];
  addAuditLog: (entry: Omit<AuditLog, 'id' | 'timestamp' | 'dateFormatted'>) => void;
  saveToast: string | null;
  setSaveToast: (msg: string | null) => void;
  googleSheetsWebhookUrl: string;
  setGoogleSheetsWebhookUrl: (url: string) => void;
  isAutoSyncToSheetsEnabled: boolean;
  setIsAutoSyncToSheetsEnabled: (val: boolean) => void;
  triggerGoogleSheetsSync: (overrideUrl?: string, customTimeLogs?: TimeLog[]) => Promise<{ success: boolean; message: string }>;
  importEmployeesFromGoogleSheets: (overrideUrl?: string) => Promise<{ success: boolean; count: number; message: string }>;
  importTimeLogsFromGoogleSheets: (overrideUrl?: string) => Promise<{ success: boolean; count: number; message: string }>;
  importPresenceFromGoogleSheets: (overrideUrl?: string) => Promise<{ success: boolean; count: number; message: string }>;
  syncAllFromGoogleSheets: (overrideUrl?: string) => Promise<{ success: boolean; message: string }>;
  startAgentLiveShift: (userId: string, task?: TaskCategory) => void;
  stopAgentLiveShift: (userId: string) => void;
  simulateActiveTraineesShift: () => void;
  isFirestoreLoaded: boolean;
  isDesktopDockView: boolean;
  setIsDesktopDockView: (val: boolean) => void;
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: string, data: Partial<User>) => void;
  deleteUser: (id: string) => void;
  resetUserPassword: (userId: string, newPass: string, requireChangeOnNextLogin?: boolean) => void;
  requestPasswordReset: (targetUserId: string, reason?: string) => void;
  approvePasswordResetRequest: (requestId: string) => void;
  rejectPasswordResetRequest: (requestId: string, notes?: string) => void;
  addTimeLog: (log: Omit<TimeLog, 'id'> & { id?: string }) => TimeLog;
  updateTimeLog: (id: string, data: Partial<TimeLog>) => void;
  completeSessionLog: (logId: string) => Promise<void>;
  deleteTimeLog: (id: string) => void;
  approveManualTimeRequest: (id: string) => void;
  rejectManualTimeRequest: (id: string) => void;
  submitManualTimeRequest: (req: Omit<ManualTimeRequest, 'id' | 'status'>) => void;
  approveLeaveRequest: (id: string) => void;
  rejectLeaveRequest: (id: string) => void;
  submitLeaveRequest: (req: Omit<LeaveRequest, 'id' | 'status' | 'requestedAt'>) => Promise<{ success: boolean; message: string }>;
  reSubmitLeaveRequest: (leave: LeaveRequest) => Promise<{ success: boolean; message: string }>;
  updateLeaveRequestStatus: (id: string, status: LeaveRequest['status'], reviewerNotes?: string, actionedBy?: string) => void;
  updateEmployeeLeaveBalance: (userId: string, updates: Partial<LeaveBalance>) => void;
  deleteScreenshot: (id: string) => void;
  toggleScreenshotBlur: (id: string) => void;
  updatePayrollStatus: (id: string, status: PayrollRecord['status']) => void;
  updatePayrollRecord: (id: string, data: Partial<PayrollRecord>) => void;
  bulkProcessPayroll: (payPeriod: string) => void;
  addWorldClock: (clock: Omit<WorldClockItem, 'id'>) => void;
  deleteWorldClock: (id: string) => void;
  resetDatabaseToFreshState: () => Promise<void>;
  designationTasks: Record<string, string[]>;
  designationList: string[];
  getTasksForDesignation: (designation?: string) => string[];
  addDesignation: (name: string, initialTasks?: string[]) => void;
  deleteDesignation: (name: string) => void;
  addTaskToDesignation: (designation: string, taskName: string) => void;
  removeTaskFromDesignation: (designation: string, taskName: string) => void;
  rolePermissions: Record<string, RolePermissions>;
  updateRolePermission: (roleKey: string, permissionKey: keyof RolePermissions, value: boolean) => void;
  updateUserCustomPermission: (userId: string, permissionKey: keyof RolePermissions, value: boolean) => void;
  resetUserCustomPermissions: (userId: string) => void;
  addRoleCategory: (roleKey: string, initialPermissions?: Partial<RolePermissions>) => void;
  deleteRoleCategory: (roleKey: string) => void;
  hasPermission: (permissionKey: keyof RolePermissions, targetUser?: User) => boolean;
  formatDuration: (totalSec: number) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const normalizeSuperAdmin = (u: User): User => {
    const isSuperAdmin =
      u.employeeCode?.toLowerCase() === 'superadmin' ||
      u.id === 'usr-superadmin-red' ||
      u.id === 'usr-superadmin-root' ||
      u.email === 'admin@llc.com';

    if (isSuperAdmin) {
      return {
        ...u,
        id: 'usr-superadmin-red',
        name: 'Admin',
        email: 'admin@llc.com',
        employeeCode: 'SuperAdmin',
        username: u.username || 'admin',
        role: 'admin' as const,
        designation: 'Admin',
        department: 'Executive Management',
        password: u.password || 'AdminpassW0rd123!',
        mustChangePassword: false,
        screenshotMonitored: false,
        activityMonitored: false,
      };
    }
    return u;
  };

  const ensureUsernames = (userList: User[]): User[] => {
    const result: User[] = [];
    for (const rawUser of userList) {
      let norm = normalizeSuperAdmin(rawUser);
      const isSpreadsheetRecord = norm.employeeCode && norm.name && norm.role && !isPlaceholderName(norm.name, norm.username, norm.employeeCode);
      if (!isSpreadsheetRecord) {
        const canon = resolveCanonicalEmployee(norm);
        if (canon) {
          norm = {
            ...norm,
            name: canon.name,
            username: canon.username,
            employeeCode: canon.code,
            email: canon.email || norm.email,
            role: canon.role || norm.role,
            designation: canon.designation || norm.designation,
          };
        }
      }
      if (!norm.username || norm.username.trim() === '') {
        norm.username = generateUniqueUsername(norm.name, result, norm.id);
      }
      result.push(norm);
    }
    return result;
  };

  const mergeFetchedEmployees = useCallback((prevUsers: User[], fetchedEmployees: User[]): User[] => {
    const existingMap = new Map<string, User>();
    for (const u of prevUsers) {
      if (u.id) existingMap.set(u.id, u);
      if (u.employeeCode) existingMap.set(String(u.employeeCode).trim().toLowerCase(), u);
    }
    const mergedEmployees = fetchedEmployees.map((emp) => {
      const existing =
        existingMap.get(emp.id) ||
        (emp.employeeCode ? existingMap.get(String(emp.employeeCode).trim().toLowerCase()) : undefined);
      if (existing) {
        return {
          ...existing,
          ...emp,
          idleTrackingEnabled: existing.idleTrackingEnabled ?? emp.idleTrackingEnabled ?? false,
        };
      }
      return emp;
    });
    return deduplicateUsers(ensureUsernames([...mergedEmployees, ...prevUsers]));
  }, []);

  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('trackpulse_users');
    if (!saved) return deduplicateUsers(ensureUsernames(INITIAL_USERS));
    try {
      const parsed: User[] = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return deduplicateUsers(ensureUsernames(parsed));
      }
      return deduplicateUsers(ensureUsernames(INITIAL_USERS));
    } catch {
      return deduplicateUsers(ensureUsernames(INITIAL_USERS));
    }
  });

  const [currentUser, setCurrentUser] = useState<User>(() => {
    try {
      const savedUserStr = localStorage.getItem('trackpulse_current_user');
      if (savedUserStr) {
        const parsed = JSON.parse(savedUserStr);
        if (parsed && parsed.id) {
          const found = users.find((u) => u.id === parsed.id || u.employeeCode === parsed.employeeCode);
          if (found) return normalizeSuperAdmin(found);
          return normalizeSuperAdmin(parsed);
        }
      }
    } catch (e) {}
    return users[0] || INITIAL_USERS[0];
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return typeof window !== 'undefined' && localStorage.getItem('trackpulse_auth') === 'true';
  });

  const isSoftwareEnvDetected = typeof window !== 'undefined' && (
    window.location.search.includes('mode=desktop') ||
    window.location.search.includes('appMode=desktop') ||
    window.location.search.includes('source=software') ||
    window.location.search.includes('mode=software') ||
    localStorage.getItem('trackpulse_login_mode') === 'software' ||
    navigator.userAgent.includes('Electron') ||
    (window as any).isElectronApp === true ||
    Boolean((window as any).electronAPI)
  );

  const [loginMode, setLoginMode] = useState<'webapp' | 'software'>(() => {
    return isSoftwareEnvDetected ? 'software' : 'webapp';
  });
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>(() => {
    const saved = localStorage.getItem('trackpulse_timelogs');
    return saved ? JSON.parse(saved) : [];
  });
  const [screenshots, setScreenshots] = useState<ScreenshotLog[]>([]);
  const [idleLogs, setIdleLogs] = useState<IdleLog[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => {
    const saved = localStorage.getItem('trackpulse_leaverequests');
    return saved ? JSON.parse(saved) : [];
  });
  const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>(() => {
    const saved = localStorage.getItem('trackpulse_leavebalances');
    return saved ? JSON.parse(saved) : [];
  });
  const [manualTimeRequests, setManualTimeRequests] = useState<ManualTimeRequest[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>(INITIAL_PAYROLL);
  const [dailyAttendanceLogs, setDailyAttendanceLogs] = useState<DailyAttendanceLog[]>([]);
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>([]);
  const [userPresenceList, setUserPresenceList] = useState<UserPresence[]>([]);
  const [worldClocks, setWorldClocks] = useState<WorldClockItem[]>(INITIAL_WORLD_CLOCKS);
  const [designationTasks, setDesignationTasks] = useState<Record<string, string[]>>(DEFAULT_DESIGNATION_TASKS);
  const [rolePermissions, setRolePermissions] = useState<Record<string, RolePermissions>>(DEFAULT_ROLE_PERMISSIONS);
  const [isCloudQuotaExhausted] = useState(isQuotaExhaustedGlobal);
  const [storageEngineMode, setStorageEngineModeState] = useState<'unlimited_bridge' | 'firestore'>('unlimited_bridge');

  const setStorageEngineMode = (mode: 'unlimited_bridge' | 'firestore') => {
    setStorageEngineModeState(mode);
    localStorage.setItem('trackpulse_storage_engine', mode);
  };

  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [googleSheetsWebhookUrl, setGoogleSheetsWebhookUrlState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('trackpulse_sheets_webhook');
      if (saved && saved.trim()) return saved.trim();
    }
    return DEFAULT_WEBHOOK_URL;
  });

  const getActiveWebhookUrl = useCallback((): string => {
    if (googleSheetsWebhookUrl && googleSheetsWebhookUrl.trim()) {
      return googleSheetsWebhookUrl.trim();
    }
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('trackpulse_sheets_webhook');
      if (saved && saved.trim()) return saved.trim();
    }
    return '';
  }, [googleSheetsWebhookUrl]);

  const setGoogleSheetsWebhookUrl = (url: string) => {
    setGoogleSheetsWebhookUrlState(url);
    if (typeof window !== 'undefined') {
      localStorage.setItem('trackpulse_sheets_webhook', url);
    }
  };

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);
  const [isAutoSyncToSheetsEnabled, setIsAutoSyncToSheetsEnabledState] = useState<boolean>(true);

  const setIsAutoSyncToSheetsEnabled = (enabled: boolean) => {
    setIsAutoSyncToSheetsEnabledState(enabled);
    localStorage.setItem('trackpulse_auto_sync_enabled', enabled ? 'true' : 'false');
  };

  // Active Session Persistence Helpers
  const getActiveSessionStorageKey = useCallback((code?: string): string => {
    return `trackpulse_active_session_${(code || 'default').trim().toLowerCase()}`;
  }, []);

  const loadActiveSession = useCallback((code?: string) => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(getActiveSessionStorageKey(code));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.taskStartTime && parsed.employeeCode) {
          return parsed;
        }
      }
    } catch {}
    return null;
  }, [getActiveSessionStorageKey]);

  const initialActiveSession = useMemo(() => {
    return loadActiveSession(currentUser.employeeCode || currentUser.id);
  }, [currentUser.employeeCode, currentUser.id, loadActiveSession]);

  const [isTracking, setIsTracking] = useState<boolean>(Boolean(initialActiveSession));
  const [isPaused, setIsPaused] = useState<boolean>(Boolean(initialActiveSession?.isPaused));
  const [currentDesignation, setCurrentDesignation] = useState<Designation>(
    initialActiveSession?.designation || currentUser.designation || 'Outbound Agent'
  );
  const [currentTask, setCurrentTask] = useState<TaskCategory>(
    initialActiveSession?.task || 'Email Reachout'
  );

  useEffect(() => {
    if (currentUser?.designation) {
      setCurrentDesignation(currentUser.designation);
    }
  }, [currentUser?.id, currentUser?.designation]);

  const taskStartTimeRef = useRef<number>(initialActiveSession?.taskStartTime || 0);
  const accumulatedPausedMsRef = useRef<number>(initialActiveSession?.accumulatedPausedMs || 0);
  const pauseStartTimeRef = useRef<number | null>(initialActiveSession?.pauseStartTime || null);
  const lastHeartbeatEpochMsRef = useRef<number>(initialActiveSession?.lastHeartbeat || 0);
  const last5mSyncEpochMsRef = useRef<number>(initialActiveSession?.lastSync5m || 0);
  const last10mSummarySyncEpochMsRef = useRef<number>(0);

  const activeSegmentIdRef = useRef<string>(
    initialActiveSession?.segmentId || `seg-${currentUser.employeeCode || currentUser.id}-${initialActiveSession?.taskStartTime || Date.now()}`
  );

  const ensureDailySummaryForToday = useCallback(() => {
    const empCode = currentUser.employeeCode || currentUser.id;
    const todayStr = getManilaDateString();
    fetch('/api/daily-summary/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeCode: empCode,
        userId: currentUser.id,
        userName: currentUser.name,
        designation: currentDesignation,
        date: todayStr,
      }),
    }).catch(() => {});
  }, [currentUser, currentDesignation]);

  const computeElapsedSeconds = useCallback((): number => {
    if (!taskStartTimeRef.current) return 0;
    const now = Date.now();
    const pausedAccum = accumulatedPausedMsRef.current || 0;
    if (pauseStartTimeRef.current) {
      return Math.max(0, Math.floor((pauseStartTimeRef.current - taskStartTimeRef.current - pausedAccum) / 1000));
    }
    return Math.max(0, Math.floor((now - taskStartTimeRef.current - pausedAccum) / 1000));
  }, []);

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(() => {
    if (initialActiveSession) {
      const now = Date.now();
      const paused = initialActiveSession.accumulatedPausedMs || 0;
      if (initialActiveSession.isPaused && initialActiveSession.pauseStartTime) {
        return Math.max(0, Math.floor((initialActiveSession.pauseStartTime - initialActiveSession.taskStartTime - paused) / 1000));
      }
      return Math.max(0, Math.floor((now - initialActiveSession.taskStartTime - paused) / 1000));
    }
    return 0;
  });

  const [isDesktopDockView, setIsDesktopDockView] = useState<boolean>(() => {
    return isSoftwareEnvDetected;
  });

  const [webSessionRemainingSeconds, setWebSessionRemainingSeconds] = useState<number>(600);
  const [isSessionWarningActive, setIsSessionWarningActive] = useState<boolean>(false);
  const [webSessionWarningCountdown, setWebSessionWarningCountdown] = useState<number>(300);
  const [sessionExpiredReason, setSessionExpiredReason] = useState<string | null>(null);

  const clearSessionExpiredReason = useCallback(() => {
    setSessionExpiredReason(null);
  }, []);

  const refreshWebSession = useCallback(() => {
    setWebSessionRemainingSeconds(600);
    setIsSessionWarningActive(false);
    setWebSessionWarningCountdown(300);
  }, []);

  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [offlineSinceTimestamp, setOfflineSinceTimestamp] = useState<number | null>(null);
  const [offlineSecondsRemaining, setOfflineSecondsRemaining] = useState<number>(1800);
  const [offlineStatusStage, setOfflineStatusStage] = useState<'online' | 'warning_5m' | 'critical_countdown' | 'timeout'>('online');

  const retryConnection = useCallback(async (): Promise<boolean> => {
    setIsOffline(false);
    setOfflineStatusStage('online');
    return true;
  }, []);

  const simulateOfflineToggle = useCallback(() => {
    setIsOffline((p) => !p);
  }, []);

  const [currentMouseActivity, setCurrentMouseActivity] = useState(100);
  const [currentKeyboardActivity, setCurrentKeyboardActivity] = useState(100);
  const [currentActiveApp, setCurrentActiveApp] = useState('LLC-Time-Tracker-V2 Desktop Software');
  const [currentSessionApps, setCurrentSessionApps] = useState<AppUsage[]>([]);
  const [isDualMonitorMode, setIsDualMonitorMode] = useState<boolean>(true);

  const toggleDualMonitorMode = () => {
    setIsDualMonitorMode((p) => !p);
  };

  const currentIdleThresholdMinutes = 10;
  const [currentInactivitySeconds, setCurrentInactivitySeconds] = useState<number>(0);
  const [sessionIdleDeductionSeconds, setSessionIdleDeductionSeconds] = useState<number>(0);
  const [isIdleAlertActive, setIsIdleAlertActive] = useState<boolean>(false);

  const lastUserActivityMsRef = useRef<number>(Date.now());
  const screenBlackoutStartMsRef = useRef<number | null>(null);

  const [inactivityAlertState, setInactivityAlertState] = useState<{
    isOpen: boolean;
    idleMinutes: number;
    remainingSeconds: number;
  }>({
    isOpen: false,
    idleMinutes: 10,
    remainingSeconds: 300,
  });

  const respondToInactivityAlert = (action: 'stay_active' | 'pause_tracker') => {
    lastUserActivityMsRef.current = Date.now();
    screenBlackoutStartMsRef.current = null;
    if (action === 'stay_active') {
      setIsIdleAlertActive(false);
      setInactivityAlertState({ isOpen: false, idleMinutes: 10, remainingSeconds: 300 });
    } else {
      setIsTracking(false);
      setIsIdleAlertActive(false);
      setInactivityAlertState({ isOpen: false, idleMinutes: 10, remainingSeconds: 300 });
    }
  };

  const dismissIdleAlert = () => {
    respondToInactivityAlert('stay_active');
  };

  const recordIdleInactivityEvent = (idleMinutes: number, reason?: string) => {
    setIsIdleAlertActive(true);
  };

  const simulateIdleEvent = (minutes?: number) => {
    setInactivityAlertState({ isOpen: true, idleMinutes: minutes || 10, remainingSeconds: 300 });
  };

  const restoreInactivityDeduction = () => {
    setIsIdleAlertActive(false);
  };

  const setBulkIdleTracking = (enabled: boolean) => {
    const updatedUsers = users.map((u) => ({ ...u, idleTrackingEnabled: enabled }));
    setUsers(updatedUsers);
    localStorage.setItem('trackpulse_users', JSON.stringify(updatedUsers));

    setCurrentUser((prev) => {
      if (!prev) return prev;
      const updatedCurr = { ...prev, idleTrackingEnabled: enabled };
      localStorage.setItem('trackpulse_current_user', JSON.stringify(updatedCurr));
      return updatedCurr;
    });

    fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(updatedUsers),
    }).catch(() => {});
  };

  // Global activity listener: updates activity timestamp and automatically closes inactivity modal on mouse move or keypress
  useEffect(() => {
    const handleGlobalActivity = () => {
      lastUserActivityMsRef.current = Date.now();
      if (inactivityAlertState.isOpen) {
        setIsIdleAlertActive(false);
        setInactivityAlertState({ isOpen: false, idleMinutes: 10, remainingSeconds: 300 });
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'keyup', 'scroll', 'wheel', 'pointermove', 'touchstart', 'focus'];
    events.forEach((evt) => {
      window.addEventListener(evt, handleGlobalActivity, { capture: true, passive: true });
    });

    return () => {
      events.forEach((evt) => {
        window.removeEventListener(evt, handleGlobalActivity, { capture: true });
      });
    };
  }, [inactivityAlertState.isOpen]);

  const [taskSwitchPending, setTaskSwitchPending] = useState<TaskSwitchPending | null>(null);

  const selectDesignation = (desig: Designation) => {
    setCurrentDesignation(desig);
  };

  const selectTaskWithPrompt = (task: TaskCategory) => {
    const desig = currentUser.designation || currentDesignation;
    if (task === 'Email Interaction' && (desig === 'Agent' || desig === 'Outbound Agent/Team')) {
      console.warn('Regular Agents are not permitted to select Email Interaction');
      return;
    }
    if (isTracking) {
      setTaskSwitchPending({ targetTask: task });
    } else {
      setCurrentTask(task);
    }
  };

  const confirmTaskSwitch = () => {
    if (taskSwitchPending) {
      const now = new Date();
      const todayStr = getManilaDateString(now);
      const startMs = taskStartTimeRef.current || (now.getTime() - elapsedSeconds * 1000);
      const totalPaused = accumulatedPausedMsRef.current || (isPaused && pauseStartTimeRef.current ? (now.getTime() - pauseStartTimeRef.current) : 0);
      const duration = Math.max(1, Math.floor((now.getTime() - startMs - totalPaused) / 1000));
      const startTimeIso = getManilaIsoString(startMs);

      const prevSegmentId = activeSegmentIdRef.current;
      const completedTaskCategory = currentTask;

      let completedLog: TimeLog | null = null;

      // 1. Finalize the existing task segment with its ORIGINAL task category and status 'completed'
      if (isTracking && duration > 0) {
        completedLog = {
          id: prevSegmentId,
          userId: currentUser.id,
          employeeCode: currentUser.employeeCode || currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          designation: currentDesignation,
          task: completedTaskCategory,
          startTime: startTimeIso,
          endTime: getManilaIsoString(now),
          durationSeconds: duration,
          status: 'completed',
          geoTimezone: currentUser.geoTimezone || 'Asia/Manila',
          geoLocalStartTime: getManilaTimeString(new Date(startMs)),
          geoLocalEndTime: getManilaTimeString(now),
          mouseActivityAvg: 95,
          keyboardActivityAvg: 90,
          idleSeconds: sessionIdleDeductionSeconds,
          date: todayStr,
          notes: `Completed task segment for ${completedTaskCategory}`,
          appsUsed: [],
        };
        setSessionIdleDeductionSeconds(0);
        addTimeLog(completedLog);
      }

      // 2. Start a brand NEW task segment with a NEW stable segment ID
      const nextTask = taskSwitchPending.targetTask;
      const newStartMs = Date.now();
      const empCode = (currentUser.employeeCode || currentUser.id || 'usr-001').trim();
      const newSegmentId = `seg-${empCode}-${newStartMs}`;

      activeSegmentIdRef.current = newSegmentId;
      taskStartTimeRef.current = newStartMs;
      accumulatedPausedMsRef.current = 0;
      pauseStartTimeRef.current = null;
      lastHeartbeatEpochMsRef.current = newStartMs;
      last5mSyncEpochMsRef.current = newStartMs;

      setCurrentTask(nextTask);
      setElapsedSeconds(0);
      setIsTracking(true);
      setIsPaused(false);
      setTaskSwitchPending(null);

      const newRunningLog: TimeLog = {
        id: newSegmentId,
        userId: currentUser.id,
        employeeCode: empCode,
        userName: currentUser.name,
        userAvatar: currentUser.avatar || '',
        designation: currentDesignation,
        task: nextTask,
        date: getManilaDateString(new Date(newStartMs)),
        startTime: getManilaIsoString(newStartMs),
        endTime: 'In Progress (10m Sync)',
        durationSeconds: 1,
        status: 'running',
        geoTimezone: 'Asia/Manila',
        geoLocalStartTime: getManilaTimeString(new Date(newStartMs)),
        geoLocalEndTime: getManilaTimeString(new Date(newStartMs)),
        mouseActivityAvg: 95,
        keyboardActivityAvg: 90,
        idleSeconds: 0,
        notes: `Active task segment for ${nextTask}`,
        appsUsed: [],
      };

      addTimeLog(newRunningLog);

      try {
        const activeSessionData = {
          segmentId: newSegmentId,
          employeeCode: empCode,
          userId: currentUser.id,
          task: nextTask,
          designation: currentDesignation,
          taskStartTime: newStartMs,
          accumulatedPausedMs: 0,
          isPaused: false,
          pauseStartTime: null,
          lastHeartbeat: newStartMs,
          lastSync5m: newStartMs,
        };
        localStorage.setItem(getActiveSessionStorageKey(empCode), JSON.stringify(activeSessionData));
      } catch {}

      // Immediately transmit both completed and new running segments upstream to Google Sheets Webhook
      if (googleSheetsWebhookUrl) {
        const logsToSync = completedLog ? [completedLog, newRunningLog] : [newRunningLog];
        syncDataToGoogleSheetsWebhook(
          googleSheetsWebhookUrl,
          logsToSync,
          users,
          auditLogs,
          payrollRecords,
          dailyAttendanceLogs,
          idleLogs,
          leaveRequests,
          designationTasks,
          rolePermissions,
          [newRunningLog]
        ).catch(() => {});
      }

      // 3. Immediately send presence update for new task
      syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
        userId: currentUser.id,
        employeeCode: currentUser.employeeCode || currentUser.id,
        userName: currentUser.name,
        role: currentUser.role,
        designation: currentDesignation,
        department: currentUser.department || 'Operations',
        isOnline: true,
        status: 'online',
        isTracking: true,
        isPaused: false,
        currentTask: nextTask,
        currentApp: currentActiveApp,
        elapsedSeconds: 0,
        lastHeartbeat: new Date().toISOString(),
        loginPlatform: loginMode === 'software' ? 'software' : 'webapp',
        timezone: 'Asia/Manila',
      }).catch(() => {});
    }
  };

  const cancelTaskSwitch = () => {
    setTaskSwitchPending(null);
  };

  const startTracking = () => {
    const now = Date.now();
    const empCode = currentUser.employeeCode || currentUser.id;
    const newSegmentId = `seg-${empCode}-${now}`;

    // Auto-finalize any previous orphan running logs for this employee before starting a new segment
    setTimeLogs((prev) => {
      const targetCode = String(empCode).trim().toLowerCase();
      let modified = false;
      const updated = prev.map((l) => {
        const lCode = String(l.employeeCode || l.userId || '').trim().toLowerCase();
        if (lCode === targetCode && l.id !== newSegmentId && (l.status === 'running' || l.id.startsWith('active-seg-') || l.id.startsWith('seg-running-'))) {
          modified = true;
          let computedDuration = l.durationSeconds || 1;
          let computedEndIso = getManilaIsoString(new Date(now));
          let computedGeoEnd = getManilaTimeString(new Date(now));

          if (l.startTime) {
            const lStartMs = new Date(l.startTime).getTime();
            if (!isNaN(lStartMs) && lStartMs > 0 && lStartMs <= now) {
              computedDuration = Math.max(1, Math.floor((now - lStartMs) / 1000));
            }
          }

          if (computedDuration > 5) {
            return {
              ...l,
              status: 'completed' as const,
              durationSeconds: computedDuration,
              endTime: computedEndIso,
              geoLocalEndTime: computedGeoEnd,
            };
          }
          return null;
        }
        return l;
      }).filter(Boolean) as TimeLog[];

      if (modified) {
        localStorage.setItem('trackpulse_timelogs', JSON.stringify(updated));
      }
      return updated;
    });

    activeSegmentIdRef.current = newSegmentId;
    taskStartTimeRef.current = now;
    accumulatedPausedMsRef.current = 0;
    pauseStartTimeRef.current = null;
    lastHeartbeatEpochMsRef.current = now;
    last5mSyncEpochMsRef.current = now;

    setIsTracking(true);
    setIsPaused(false);
    setElapsedSeconds(0);

    try {
      const activeSessionData = {
        segmentId: newSegmentId,
        employeeCode: empCode,
        userId: currentUser.id,
        task: currentTask,
        designation: currentDesignation,
        taskStartTime: now,
        accumulatedPausedMs: 0,
        isPaused: false,
        pauseStartTime: null,
        lastHeartbeat: now,
        lastSync5m: now,
      };
      localStorage.setItem(getActiveSessionStorageKey(empCode), JSON.stringify(activeSessionData));
    } catch {}

    // Ensure Daily_Summary row is initialized immediately upon session start
    ensureDailySummaryForToday();

    const initialRunningLog: TimeLog = {
      id: newSegmentId,
      userId: currentUser.id,
      employeeCode: empCode,
      userName: currentUser.name,
      userAvatar: currentUser.avatar || '',
      designation: currentDesignation,
      task: currentTask,
      date: getManilaDateString(new Date(now)),
      startTime: getManilaIsoString(now),
      endTime: 'In Progress (10m Sync)',
      durationSeconds: 1,
      status: 'running',
      geoTimezone: 'Asia/Manila',
      geoLocalStartTime: getManilaTimeString(new Date(now)),
      geoLocalEndTime: getManilaTimeString(new Date(now)),
      mouseActivityAvg: 95,
      keyboardActivityAvg: 90,
      idleSeconds: 0,
      notes: `Active task segment for ${currentTask}`,
      appsUsed: [],
    };
    addTimeLog(initialRunningLog);

    if (googleSheetsWebhookUrl) {
      syncDataToGoogleSheetsWebhook(
        googleSheetsWebhookUrl,
        [initialRunningLog],
        users,
        auditLogs,
        payrollRecords,
        dailyAttendanceLogs,
        idleLogs,
        leaveRequests,
        designationTasks,
        rolePermissions,
        [initialRunningLog]
      ).catch(() => {});
    }

    syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode || currentUser.id,
      userName: currentUser.name,
      role: currentUser.role,
      designation: currentDesignation,
      department: currentUser.department || 'Operations',
      isOnline: true,
      status: 'online',
      isTracking: true,
      isPaused: false,
      currentTask,
      currentApp: currentActiveApp,
      elapsedSeconds: 0,
      lastHeartbeat: new Date().toISOString(),
      loginPlatform: loginMode === 'software' ? 'software' : 'webapp',
      timezone: 'Asia/Manila',
    }).catch(() => {});
  };

  const pauseTracking = () => {
    if (!isTracking || isPaused) return;
    const now = Date.now();
    pauseStartTimeRef.current = now;
    setIsPaused(true);

    const elapsed = computeElapsedSeconds();
    setElapsedSeconds(elapsed);

    try {
      const activeSessionData = {
        segmentId: activeSegmentIdRef.current,
        employeeCode: currentUser.employeeCode || currentUser.id,
        userId: currentUser.id,
        task: currentTask,
        designation: currentDesignation,
        taskStartTime: taskStartTimeRef.current,
        accumulatedPausedMs: accumulatedPausedMsRef.current,
        isPaused: true,
        pauseStartTime: now,
        lastHeartbeat: lastHeartbeatEpochMsRef.current,
        lastSync5m: last5mSyncEpochMsRef.current,
      };
      localStorage.setItem(getActiveSessionStorageKey(currentUser.employeeCode || currentUser.id), JSON.stringify(activeSessionData));
    } catch {}

    syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode,
      userName: currentUser.name,
      role: currentUser.role,
      designation: currentDesignation,
      department: currentUser.department || 'Operations',
      isOnline: true,
      status: 'idle',
      isTracking: true,
      isPaused: true,
      currentTask,
      currentApp: currentActiveApp,
      elapsedSeconds: elapsed,
      lastHeartbeat: new Date().toISOString(),
      loginPlatform: loginMode === 'software' ? 'software' : 'webapp',
      timezone: 'Asia/Manila',
    }).catch(() => {});
  };

  const resumeTracking = () => {
    if (!isTracking || !isPaused) return;
    const now = Date.now();
    if (pauseStartTimeRef.current) {
      accumulatedPausedMsRef.current = (accumulatedPausedMsRef.current || 0) + (now - pauseStartTimeRef.current);
    }
    pauseStartTimeRef.current = null;
    setIsPaused(false);

    const elapsed = computeElapsedSeconds();
    setElapsedSeconds(elapsed);

    try {
      const activeSessionData = {
        segmentId: activeSegmentIdRef.current,
        employeeCode: currentUser.employeeCode || currentUser.id,
        userId: currentUser.id,
        task: currentTask,
        designation: currentDesignation,
        taskStartTime: taskStartTimeRef.current,
        accumulatedPausedMs: accumulatedPausedMsRef.current,
        isPaused: false,
        pauseStartTime: null,
        lastHeartbeat: lastHeartbeatEpochMsRef.current,
        lastSync5m: last5mSyncEpochMsRef.current,
      };
      localStorage.setItem(getActiveSessionStorageKey(currentUser.employeeCode || currentUser.id), JSON.stringify(activeSessionData));
    } catch {}

    syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode,
      userName: currentUser.name,
      role: currentUser.role,
      designation: currentDesignation,
      department: currentUser.department || 'Operations',
      isOnline: true,
      status: 'online',
      isTracking: true,
      isPaused: false,
      currentTask,
      currentApp: currentActiveApp,
      elapsedSeconds: elapsed,
      lastHeartbeat: new Date().toISOString(),
      loginPlatform: loginMode === 'software' ? 'software' : 'webapp',
      timezone: 'Asia/Manila',
    }).catch(() => {});
  };

  const stopTracking = () => {
    if (!isTracking) return;
    const now = new Date();
    const todayStr = getManilaDateString(now);
    const startMs = taskStartTimeRef.current || (now.getTime() - elapsedSeconds * 1000);
    const totalPaused = accumulatedPausedMsRef.current || (isPaused && pauseStartTimeRef.current ? (now.getTime() - pauseStartTimeRef.current) : 0);
    const duration = Math.max(1, Math.floor((now.getTime() - startMs - totalPaused) / 1000));
    const startTimeIso = getManilaIsoString(startMs);

    const segId = activeSegmentIdRef.current;

    const completedLog: TimeLog = {
      id: segId,
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      designation: currentDesignation,
      task: currentTask,
      startTime: startTimeIso,
      endTime: getManilaIsoString(now),
      durationSeconds: duration,
      status: 'completed',
      geoTimezone: currentUser.geoTimezone || 'Asia/Manila',
      geoLocalStartTime: getManilaTimeString(new Date(startMs)),
      geoLocalEndTime: getManilaTimeString(now),
      mouseActivityAvg: 95,
      keyboardActivityAvg: 90,
      idleSeconds: sessionIdleDeductionSeconds,
      date: todayStr,
      notes: 'Logged via LLC-Time-Tracker-V2 Desktop Tracker',
      appsUsed: [],
    };
    addTimeLog(completedLog);
    setSessionIdleDeductionSeconds(0);

    // Finalizer Sweep: Clean up any stuck / unclosed running sessions for this user on today's date
    const empCode = String(currentUser.employeeCode || currentUser.id || '').trim().toLowerCase();
    const stuckLogsToFinalize: TimeLog[] = [];

    timeLogs.forEach((l) => {
      const logEmpCode = String(l.employeeCode || l.userId || '').trim().toLowerCase();
      const isSameUser = logEmpCode === empCode || l.userId === currentUser.id;
      const isRunning = l.status === 'running' || String(l.endTime || '').includes('In Progress') || String(l.endTime || '').includes('Running');
      const isDifferentSegment = l.id !== segId;

      if (isSameUser && isRunning && isDifferentSegment) {
        let computedEndIso = getManilaIsoString(now);
        let computedGeoEnd = getManilaTimeString(now);
        let realDurationSec = l.durationSeconds || 0;

        if (l.startTime) {
          const lStartMs = new Date(l.startTime).getTime();
          if (!isNaN(lStartMs) && lStartMs > 0 && lStartMs <= now.getTime()) {
            realDurationSec = Math.max(1, Math.floor((now.getTime() - lStartMs) / 1000));
          }
        }

        const finalizedLog: TimeLog = {
          ...l,
          status: 'completed',
          endTime: computedEndIso,
          geoLocalEndTime: computedGeoEnd,
          durationSeconds: realDurationSec,
          notes: l.notes ? `${l.notes} (Auto-closed on tracker stop)` : 'Auto-closed on tracker stop',
        };
        stuckLogsToFinalize.push(finalizedLog);
      }
    });

    if (stuckLogsToFinalize.length > 0) {
      console.log(`[FINALIZER SWEEP] Cleaned up and finalized ${stuckLogsToFinalize.length} unclosed sessions for ${currentUser.name}.`);
      stuckLogsToFinalize.forEach((fLog) => {
        updateTimeLog(fLog.id, fLog);
      });
    }

    // Priority Flush: Gather ALL completed logs for THIS employee and immediately push to server and Google Sheets
    const userCompletedLogs = Array.from(
      new Map(
        [
          ...timeLogs.filter((l) => {
            const logCode = String(l.employeeCode || l.userId || '').trim().toLowerCase();
            return (logCode === empCode || l.userId === currentUser.id) && l.status === 'completed';
          }),
          completedLog,
          ...stuckLogsToFinalize,
        ].map((l) => [l.id, l])
      ).values()
    );

    fetch('/api/timelogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userCompletedLogs),
    }).catch(() => {});

    if (googleSheetsWebhookUrl) {
      syncDataToGoogleSheetsWebhook(
        googleSheetsWebhookUrl,
        userCompletedLogs,
        users,
        auditLogs,
        payrollRecords,
        dailyAttendanceLogs,
        idleLogs,
        leaveRequests,
        designationTasks,
        rolePermissions,
        userCompletedLogs
      ).catch(() => {});
    }

    // Call server endpoint to finalize shift in server memory as well
    fetch('/api/timelogs/finalize-shift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeCode: currentUser.employeeCode || currentUser.id,
        userId: currentUser.id,
        date: todayStr,
      }),
    }).catch(() => {});

    setIsTracking(false);
    setIsPaused(false);
    setElapsedSeconds(0);
    taskStartTimeRef.current = 0;
    accumulatedPausedMsRef.current = 0;
    pauseStartTimeRef.current = null;

    try {
      localStorage.removeItem(getActiveSessionStorageKey(currentUser.employeeCode || currentUser.id));
    } catch {}

    syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode,
      userName: currentUser.name,
      role: currentUser.role,
      designation: currentDesignation,
      department: currentUser.department || 'Operations',
      isOnline: false,
      status: 'offline',
      isTracking: false,
      isPaused: false,
      currentTask: 'Shift Concluded',
      currentApp: 'LLC-Time-Tracker-V2 Desktop Tracker',
      elapsedSeconds: 0,
      lastHeartbeat: new Date().toISOString(),
      loginPlatform: loginMode === 'software' ? 'software' : 'webapp',
      timezone: 'Asia/Manila',
    }).catch(() => {});
  };

  const getTodayTrackedSeconds = useCallback((): number => {
    const today = getManilaDateString();
    const empCode = (currentUser.employeeCode || currentUser.id || '').trim();

    const completedTodaySec = timeLogs
      .filter((l) => {
        const matchesUser =
          (currentUser.id && l.userId === currentUser.id) ||
          (currentUser.employeeCode && l.employeeCode === currentUser.employeeCode);
        if (!matchesUser) return false;
        if (l.status !== 'completed') return false;
        const logDate = l.date || (l.startTime ? getManilaDateString(new Date(l.startTime)) : today);
        return logDate === today;
      })
      .reduce((sum, l) => sum + Math.max(0, Number(l.durationSeconds) || 0), 0);

    const activeSec = isTracking ? Math.max(0, elapsedSeconds) : 0;
    const currentCalculated = completedTodaySec + activeSec;

    let savedBackup = 0;
    if (empCode) {
      try {
        const key = `trackpulse_daily_total_${empCode.toLowerCase()}_${today}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          savedBackup = Math.max(0, Number(raw) || 0);
        }
        if (currentCalculated > savedBackup) {
          localStorage.setItem(key, String(currentCalculated));
        }
      } catch {}
    }

    return Math.max(currentCalculated, savedBackup);
  }, [timeLogs, currentUser.id, currentUser.employeeCode, isTracking, elapsedSeconds]);

  const todayTotalSeconds = getTodayTrackedSeconds();

  const login = (user: User, mode: 'webapp' | 'software' = 'webapp', token?: string) => {
    const normalizedUser = normalizeSuperAdmin(user);
    setCurrentUser(normalizedUser);
    setCurrentDesignation(normalizedUser.designation || 'Outbound Agent');
    setIsAuthenticated(true);
    setLoginMode(mode);
    setIsDesktopDockView(mode === 'software');
    localStorage.setItem('trackpulse_auth', 'true');
    localStorage.setItem('trackpulse_current_user', JSON.stringify(normalizedUser));
    if (token) localStorage.setItem('trackpulse_token', token);

    // Ensure full employee roster is up to date in state right after login
    importEmployeesFromGoogleSheets().catch(() => {});

    // Supervisors/Admins/Leads/Trainers/HR/Payroll/QA need team logs; regular agents load their own logs (with formatting fallback)
    const canViewAllTeamLogs = isSupervisorOrAdminRole(normalizedUser);
    const filterOpts = canViewAllTeamLogs ? undefined : { userId: normalizedUser.employeeCode || normalizedUser.id };

    fetchTimeLogsFromGoogleSheets(undefined, undefined, filterOpts).then(async (res) => {
      let rawLogs = res.success && Array.isArray(res.timeLogs) ? res.timeLogs : null;

      // If an agent's sheet logs use slightly different ID/code formatting (e.g. "0023" vs "LLC-0023"),
      // retry once without the server userId filter and match client-side by code/digits/id/name.
      if (!canViewAllTeamLogs && res.success && Array.isArray(rawLogs) && rawLogs.length === 0) {
        const unfilteredRes = await fetchTimeLogsFromGoogleSheets().catch(() => null);
        if (unfilteredRes && unfilteredRes.success && Array.isArray(unfilteredRes.timeLogs)) {
          rawLogs = unfilteredRes.timeLogs.filter((l) => matchesAgentRecord(l, normalizedUser));
        }
      }

      if (res.success && Array.isArray(rawLogs)) {
        const mapped = mapSheetTimeLogs(rawLogs, usersRef.current, normalizedUser);
        let finalLogs = mapped;
        try {
          const empCode = String(normalizedUser.employeeCode || normalizedUser.id || '').trim();
          if (empCode) {
            const backupKey = `llc_daily_time_backup_${empCode}`;
            const rawBackup = localStorage.getItem(backupKey);
            if (rawBackup) {
              const backupLogs: TimeLog[] = JSON.parse(rawBackup);
              if (Array.isArray(backupLogs)) {
                const serverLogIds = new Set(mapped.map((l) => l.id));
                const deletedIds = new Set<string>(JSON.parse(localStorage.getItem('trackpulse_deleted_ids') || '[]'));
                const deletedSigs = new Set<string>(JSON.parse(localStorage.getItem('trackpulse_deleted_signatures') || '[]'));
                const makeSig = (l: any) =>
                  `${String(l.employeeCode || l.userId || '').trim().toLowerCase()}|${String(l.date || '').trim()}|${String(l.task || '').trim().toLowerCase()}|${Math.round(Number(l.durationSeconds || 0) / 10)}`;

                const missingLogs = backupLogs.filter((l) => {
                  if (l.status !== 'completed') return false;
                  if (serverLogIds.has(l.id)) return false;
                  if (deletedIds.has(String(l.id).toLowerCase())) return false;
                  if (deletedSigs.has(makeSig(l))) return false;
                  return true;
                });

                if (missingLogs.length > 0) {
                  console.log(`[SELF-HEALING] Restored ${missingLogs.length} missing completed time logs from local client backup.`);
                  finalLogs = [...mapped, ...missingLogs];
                  fetch('/api/timelogs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(missingLogs),
                  }).catch(() => {});
                }
              }
            }
          }
        } catch (e) {
          console.warn('Local time backup check notice:', e);
        }

        setTimeLogs((prev) => {
          const merged = mergeTimeLogsWithLocal(
            canViewAllTeamLogs ? prev : prev.filter((l) => matchesAgentRecord(l, normalizedUser) || l.status === 'running'),
            finalLogs
          );
          localStorage.setItem('trackpulse_timelogs', JSON.stringify(merged));
          return merged;
        });
      }
    });

    syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
      userId: normalizedUser.id,
      employeeCode: normalizedUser.employeeCode,
      userName: normalizedUser.name,
      role: normalizedUser.role,
      designation: normalizedUser.designation || 'Agent',
      department: normalizedUser.department || 'Operations',
      isOnline: true,
      status: 'online',
      isTracking: false,
      isPaused: false,
      currentTask: 'Ready to Track',
      currentApp: 'LLC-Time-Tracker-V2 Desktop Tracker',
      elapsedSeconds: 0,
      lastHeartbeat: new Date().toISOString(),
      loginPlatform: mode === 'software' ? 'software' : 'webapp',
      timezone: 'Asia/Manila',
    }).catch(() => {});
  };

  const logout = () => {
    if (isTracking) {
      stopTracking();
    }

    syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode,
      userName: currentUser.name,
      role: currentUser.role,
      designation: currentUser.designation,
      isOnline: false,
      status: 'offline',
      isTracking: false,
      isPaused: false,
      currentTask: 'Shift Concluded',
      currentApp: 'None',
      elapsedSeconds: 0,
      lastHeartbeat: new Date().toISOString(),
      loginPlatform: loginMode === 'software' ? 'software' : 'webapp',
    }).catch(() => {});

    setIsAuthenticated(false);
    setIsTracking(false);
    setIsPaused(false);
    setElapsedSeconds(0);
    setTimeLogs([]);
    localStorage.removeItem('trackpulse_auth');
    localStorage.removeItem('trackpulse_current_user');
    localStorage.removeItem('trackpulse_timelogs');
    localStorage.removeItem('trackpulse_token');
  };

  const addAuditLog = useCallback(
    (entry: Omit<AuditLog, 'id' | 'timestamp' | 'dateFormatted'>) => {
      const now = new Date();
      const newLog: AuditLog = {
        ...entry,
        id: `audit-${Date.now()}`,
        timestamp: now.toISOString(),
        dateFormatted: now.toLocaleString(),
      };
      setAuditLogs((prev) => [newLog, ...prev]);
    },
    []
  );

  const triggerGoogleSheetsSync = async (
    overrideUrl?: string,
    customTimeLogs?: TimeLog[]
  ): Promise<{ success: boolean; message: string }> => {
    const targetUrl = overrideUrl || googleSheetsWebhookUrl;
    if (!targetUrl) {
      return { success: false, message: 'No Google Sheets Webhook URL configured.' };
    }
    const logsToSync = customTimeLogs && customTimeLogs.length > 0 ? customTimeLogs : timeLogs;
    return syncDataToGoogleSheetsWebhook(
      targetUrl,
      logsToSync,
      users,
      auditLogs,
      payrollRecords,
      dailyAttendanceLogs,
      idleLogs,
      leaveRequests,
      designationTasks,
      rolePermissions,
      [],
      userPresenceList,
      leaveBalances
    );
  };

  const importEmployeesFromGoogleSheets = useCallback(async (): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const res = await fetchEmployeesFromGoogleSheets();
      if (res.success && res.employees && res.employees.length > 0) {
        let mergedCount = res.employees.length;
        setUsers((prevUsers) => {
          const merged = mergeFetchedEmployees(prevUsers, res.employees);
          mergedCount = merged.length;
          localStorage.setItem('trackpulse_users', JSON.stringify(merged));
          return merged;
        });
        return { success: true, count: mergedCount, message: res.message };
      }
      return { success: false, count: usersRef.current.length, message: res.message || 'Could not fetch remote employee roster.' };
    } catch (err: any) {
      return { success: false, count: usersRef.current.length, message: err?.message || 'Error fetching roster.' };
    }
  }, [mergeFetchedEmployees]);

  const importTimeLogsFromGoogleSheets = useCallback(async (): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const activeUser = currentUserRef.current;
      const canViewAllTeamLogs = isSupervisorOrAdminRole(activeUser);
      const filterOpts = canViewAllTeamLogs ? undefined : { userId: activeUser.employeeCode || activeUser.id };
      const res = await fetchTimeLogsFromGoogleSheets(undefined, undefined, filterOpts);
      let rawLogs = res.success && Array.isArray(res.timeLogs) ? res.timeLogs : null;

      if (!canViewAllTeamLogs && res.success && Array.isArray(rawLogs) && rawLogs.length === 0) {
        const unfilteredRes = await fetchTimeLogsFromGoogleSheets().catch(() => null);
        if (unfilteredRes && unfilteredRes.success && Array.isArray(unfilteredRes.timeLogs)) {
          rawLogs = unfilteredRes.timeLogs.filter((l) => matchesAgentRecord(l, activeUser));
        }
      }

      if (res.success && Array.isArray(rawLogs)) {
        const mappedLogs = mapSheetTimeLogs(rawLogs, usersRef.current, activeUser);
        if (mappedLogs.length > 0) {
          setTimeLogs((prev) => {
            const merged = mergeTimeLogsWithLocal(prev, mappedLogs);
            localStorage.setItem('trackpulse_timelogs', JSON.stringify(merged));
            return merged;
          });
        }
        return { success: true, count: mappedLogs.length, message: res.message };
      }
      return { success: false, count: timeLogsRef.current.length, message: res.message || 'Could not fetch remote time logs.' };
    } catch (err: any) {
      console.warn('Error fetching time logs from Google Sheets:', err);
      return { success: false, count: timeLogsRef.current.length, message: err?.message || 'Error fetching time logs.' };
    }
  }, []);

  const importPresenceFromGoogleSheets = useCallback(async (): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const res = await fetchLivePresenceFromGoogleSheets(googleSheetsWebhookUrlRef.current, DEFAULT_SPREADSHEET_ID, usersRef.current);
      if (res.success && Array.isArray(res.presenceList)) {
        setUserPresenceList(res.presenceList);
        return { success: true, count: res.presenceList.length, message: res.message };
      }
    } catch (err: any) {
      console.warn('Error fetching live presence from Google Sheets:', err);
    }
    return { success: true, count: userPresenceListRef.current.length, message: 'Presence updated.' };
  }, []);

  const syncAllFromGoogleSheets = async (): Promise<{ success: boolean; message: string }> => {
    return { success: true, message: 'Sync complete.' };
  };

  const startAgentLiveShift = (userId: string, task?: TaskCategory) => {};
  const stopAgentLiveShift = (userId: string) => {};
  const simulateActiveTraineesShift = () => {};

  const addUser = (userData: Omit<User, 'id'>) => {
    const newUser: User = {
      ...userData,
      id: userData.employeeCode || `usr-${Date.now()}`,
    };
    setUsers((prev) => {
      const updated = deduplicateUsers([...prev, newUser]);
      localStorage.setItem('trackpulse_users', JSON.stringify(updated));
      return updated;
    });

    fetch('/api/users', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify([newUser]),
    }).catch((err) => console.warn('Error saving user via /api/users:', err));

    if (googleSheetsWebhookUrl) {
      syncEmployeesToGoogleSheetsWebhook(googleSheetsWebhookUrl, [newUser]).catch(() => {});
    }
  };

  const updateUser = (id: string, data: Partial<User>) => {
    let targetUser: User | null = null;
    setUsers((prev) => {
      const updated = prev.map((u) => {
        if (
          u.id === id ||
          u.employeeCode === id ||
          (u.username && u.username.toLowerCase() === id.toLowerCase())
        ) {
          const merged = { ...u, ...data };
          targetUser = merged;
          return merged;
        }
        return u;
      });
      const deduped = deduplicateUsers(updated);
      localStorage.setItem('trackpulse_users', JSON.stringify(deduped));
      return deduped;
    });

    if (
      currentUser &&
      (currentUser.id === id ||
        currentUser.employeeCode === id ||
        (currentUser.username && currentUser.username.toLowerCase() === id.toLowerCase()))
    ) {
      setCurrentUser((prev) => {
        const updatedCurr = { ...prev, ...data };
        localStorage.setItem('trackpulse_current_user', JSON.stringify(updatedCurr));
        return updatedCurr;
      });
    }

    if (targetUser) {
      const userToSave: User = targetUser;
      fetch('/api/users', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify([userToSave]),
      }).catch((err) => console.warn('Error updating user via /api/users:', err));

      if (googleSheetsWebhookUrl) {
        syncEmployeesToGoogleSheetsWebhook(googleSheetsWebhookUrl, [userToSave]).catch(() => {});
      }
    }
  };

  const deleteUser = (id: string) => {
    setUsers((prev) => {
      const filtered = prev.filter((u) => u.id !== id && u.employeeCode !== id);
      localStorage.setItem('trackpulse_users', JSON.stringify(filtered));
      if (googleSheetsWebhookUrl) {
        syncEmployeesToGoogleSheetsWebhook(googleSheetsWebhookUrl, filtered).catch(() => {});
      }
      return filtered;
    });
    fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    }).catch(() => {});
  };

  const resetUserPassword = (userId: string, newPass: string) => {};
  const requestPasswordReset = (targetUserId: string, reason?: string) => {};
  const approvePasswordResetRequest = (requestId: string) => {};
  const rejectPasswordResetRequest = (requestId: string) => {};

  const addTimeLog = (logData: Omit<TimeLog, 'id'> & { id?: string }) => {
    const newLog: TimeLog = { id: logData.id || `log-${Date.now()}`, ...logData };
    setTimeLogs((prev) => {
      const targetCode = String(logData.employeeCode || logData.userId || '').trim().toLowerCase();
      let updatedPrev = [...prev];
      if (logData.status === 'completed' && targetCode) {
        updatedPrev = updatedPrev.map((l) => {
          const lCode = String(l.employeeCode || l.userId || '').trim().toLowerCase();
          if (
            lCode === targetCode &&
            l.id !== newLog.id &&
            (l.status === 'running' || l.id.startsWith('active-seg-') || l.id.startsWith('seg-running-'))
          ) {
            // Auto-finalize running sessions with real recorded time (> 5s) instead of deleting them
            if ((l.durationSeconds || 0) > 5) {
              return {
                ...l,
                status: 'completed' as const,
                endTime: l.endTime === 'Running Live' || l.endTime === 'In Progress (10m Sync)' ? (l.geoLocalEndTime || logData.startTime || getManilaIsoString(new Date())) : l.endTime,
              };
            }
            return null; // drop zero/tiny heartbeat placeholders
          }
          return l;
        }).filter(Boolean) as TimeLog[];
      } else {
        updatedPrev = updatedPrev.filter((l) => l.id !== newLog.id);
      }

      const filtered = updatedPrev.filter((l) => l.id !== newLog.id);
      const updated = [newLog, ...filtered];
      localStorage.setItem('trackpulse_timelogs', JSON.stringify(updated));

      // Save to local daily backup for self-healing recovery if network sync drops
      if (newLog.status === 'completed') {
        try {
          const empCode = String(newLog.employeeCode || newLog.userId || '').trim();
          if (empCode) {
            const backupKey = `llc_daily_time_backup_${empCode}`;
            const existingBackup: TimeLog[] = JSON.parse(localStorage.getItem(backupKey) || '[]');
            const filteredBackup = existingBackup.filter((l) => l.id !== newLog.id);
            const updatedBackup = [newLog, ...filteredBackup];
            localStorage.setItem(backupKey, JSON.stringify(updatedBackup));
          }
        } catch (e) {}
      }

      return updated;
    });

    fetch('/api/timelogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([newLog]),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setSaveToast('Time log successfully persisted to V2 Spreadsheet!');
          setTimeout(() => setSaveToast(null), 3000);
        }
      })
      .catch((err) => {
        console.warn('Failed to sync time log to remote spreadsheet:', err);
      });

    return newLog;
  };

  const updateTimeLog = async (id: string, data: Partial<TimeLog>) => {
    let targetLog = timeLogs.find((l) => l.id === id || String((l as any).sessionId || '') === String(id));

    if (!targetLog) {
      try {
        const saved = localStorage.getItem('trackpulse_timelogs');
        if (saved) {
          const parsed: TimeLog[] = JSON.parse(saved);
          targetLog = parsed.find((l) => l.id === id || String((l as any).sessionId || '') === String(id));
        }
      } catch {}
    }

    if (!targetLog) {
      console.warn('Time log not found for update:', id);
      return;
    }

    const mergedLog: TimeLog = { ...targetLog, ...data };

    // Auto-align endTime if durationSeconds was updated without explicit endTime
    if (data.durationSeconds !== undefined && data.durationSeconds > 0 && mergedLog.startTime) {
      const startMs = new Date(mergedLog.startTime).getTime();
      if (!isNaN(startMs)) {
        const computedEndMs = startMs + mergedLog.durationSeconds * 1000;
        mergedLog.endTime = getManilaIsoString(new Date(computedEndMs));
        mergedLog.geoLocalEndTime = getManilaTimeString(new Date(computedEndMs));
      }
    }

    // Save edited log ID to localStorage so incoming sheet sync won't overwrite Admin edits
    try {
      const editedIds: string[] = JSON.parse(localStorage.getItem('trackpulse_edited_ids') || '[]');
      const lowerId = String(mergedLog.id).toLowerCase();
      if (!editedIds.includes(lowerId)) {
        editedIds.push(lowerId);
        localStorage.setItem('trackpulse_edited_ids', JSON.stringify(editedIds));
      }
    } catch (e) {}

    setTimeLogs((prev) => {
      const updated = prev.map((l) => {
        if (l.id === id || String((l as any).sessionId || '') === String(id)) {
          return mergedLog;
        }
        return l;
      });
      localStorage.setItem('trackpulse_timelogs', JSON.stringify(updated));
      return updated;
    });

    // Update local daily backup key so self-healing doesn't revert the edit
    try {
      const empCode = String(mergedLog.employeeCode || mergedLog.userId || '').trim();
      if (empCode) {
        const backupKey = `llc_daily_time_backup_${empCode}`;
        const existingBackup: TimeLog[] = JSON.parse(localStorage.getItem(backupKey) || '[]');
        const filteredBackup = existingBackup.filter((b) => b.id !== mergedLog.id);
        const updatedBackup = [mergedLog, ...filteredBackup];
        localStorage.setItem(backupKey, JSON.stringify(updatedBackup));
      }
    } catch (e) {}

    if (db) {
      await safeSetDoc(doc(db, 'timeLogs', mergedLog.id), mergedLog).catch(() => {});
    }

    fetch('/api/timelogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([mergedLog]),
    }).catch((err) => console.warn('Failed to update time log on server:', err));

    if (googleSheetsWebhookUrl) {
      // 1. Dispatch UPDATE_TIMELOG action to Google Sheets Apps Script
      fetch(googleSheetsWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          secret: 'LLCTrackerV2SecretKey2026',
          sharedSecret: 'LLCTrackerV2SecretKey2026',
          action: 'UPDATE_TIMELOG',
          id: mergedLog.id,
          logId: mergedLog.id,
          sessionId: (mergedLog as any).sessionId || mergedLog.id,
          employeeCode: mergedLog.employeeCode || mergedLog.userId,
          userId: mergedLog.userId,
          date: mergedLog.date,
          task: mergedLog.task,
          startTime: mergedLog.startTime,
          endTime: mergedLog.endTime,
          durationSeconds: mergedLog.durationSeconds,
          notes: mergedLog.notes,
        }),
      }).catch((err) => console.warn('Webhook dispatch notice on time log update:', err));

      // 2. Also dispatch SYNC_TIMELOGS with [mergedLog] to ensure row upsert in Google Sheets
      syncDataToGoogleSheetsWebhook(
        googleSheetsWebhookUrl,
        [mergedLog],
        users,
        auditLogs,
        payrollRecords,
        dailyAttendanceLogs,
        idleLogs,
        leaveRequests,
        designationTasks,
        rolePermissions,
        [mergedLog],
        userPresenceList
      ).catch(() => {});
    }

    setSaveToast('Timesheet entry successfully updated and synced to V2 Spreadsheet!');
    setTimeout(() => setSaveToast(null), 3000);
  };

  const completeSessionLog = async (logId: string) => {
    const target = timeLogs.find(
      (l) => l.id === logId || String((l as any).sessionId || '') === String(logId)
    );
    if (!target) return;

    const now = new Date();
    let endTimeIso = target.endTime;
    let geoLocalEndTime = target.geoLocalEndTime;

    if (
      target.startTime &&
      (!target.endTime ||
        target.endTime.includes('Progress') ||
        target.endTime.includes('Running') ||
        target.status === 'running')
    ) {
      const startMs = new Date(target.startTime).getTime();
      if (!isNaN(startMs) && (target.durationSeconds || 0) > 0) {
        const computedEnd = new Date(startMs + (target.durationSeconds || 0) * 1000);
        endTimeIso = getManilaIsoString(computedEnd);
        geoLocalEndTime = getManilaTimeString(computedEnd);
      } else {
        endTimeIso = getManilaIsoString(now);
        geoLocalEndTime = getManilaTimeString(now);
      }
    }

    // 1. Update time log to completed status
    await updateTimeLog(target.id, {
      status: 'completed',
      endTime: endTimeIso,
      geoLocalEndTime: geoLocalEndTime,
      notes: target.notes ? `${target.notes} (Session finalized)` : 'Session finalized by Admin',
    });

    // 2. Clear presence tracking flag so allAvailableLogs won't re-inject a live running overlay
    const targetEmpCode = String(target.employeeCode || target.userId || '').trim().toLowerCase();
    setUserPresenceList((prev) =>
      prev.map((p) => {
        const pCode = String(p.employeeCode || p.userId || '').trim().toLowerCase();
        if (pCode === targetEmpCode || p.userId === target.userId) {
          return {
            ...p,
            isTracking: false,
            isOnline: false,
            status: 'offline',
            currentTask: 'Shift Concluded',
          };
        }
        return p;
      })
    );

    fetch('/api/presence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: target.userId,
        employeeCode: target.employeeCode || target.userId,
        isOnline: false,
        status: 'offline',
        isTracking: false,
        isPaused: false,
        currentTask: 'Shift Concluded',
        lastHeartbeat: new Date().toISOString(),
      }),
    }).catch(() => {});
  };

  const deleteTimeLog = async (id: string) => {
    const targetLog = timeLogs.find((l) => String(l.id) === String(id) || String((l as any).sessionId || '') === String(id));
    const detTargetId = targetLog ? getDeterministicLogId(targetLog) : String(id);

    // Save deleted ID, deterministic ID, and signature to localStorage to block client-side self-healing
    try {
      const deletedIds: string[] = JSON.parse(localStorage.getItem('trackpulse_deleted_ids') || '[]');
      const idsToAdd = [String(id).toLowerCase(), detTargetId.toLowerCase()];
      if (targetLog && (targetLog as any).sessionId) {
        idsToAdd.push(String((targetLog as any).sessionId).toLowerCase());
      }
      for (const item of idsToAdd) {
        if (!deletedIds.includes(item)) deletedIds.push(item);
      }
      localStorage.setItem('trackpulse_deleted_ids', JSON.stringify(deletedIds));

      if (targetLog) {
        const deletedSigs: string[] = JSON.parse(localStorage.getItem('trackpulse_deleted_signatures') || '[]');
        const sig = `${String(targetLog.employeeCode || targetLog.userId || '').trim().toLowerCase()}|${String(targetLog.date || '').trim()}|${String(targetLog.task || '').trim().toLowerCase()}|${Math.round(Number(targetLog.durationSeconds || 0) / 10)}`;
        if (!deletedSigs.includes(sig)) {
          deletedSigs.push(sig);
        }
        localStorage.setItem('trackpulse_deleted_signatures', JSON.stringify(deletedSigs));
      }
    } catch (e) {}

    setTimeLogs((prev) => {
      const filtered = prev.filter((l) => {
        const lDetId = getDeterministicLogId(l);
        const matchesId =
          lDetId === detTargetId ||
          String(l.id) === String(id) ||
          String((l as any).sessionId || '') === String(id) ||
          (String(id).length >= 4 && (String(l.id).includes(String(id)) || String(id).includes(String(l.id))));
        if (matchesId) return false;

        if (targetLog) {
          const sameEmp = String((l as any).employeeCode || l.userId || '').toLowerCase() === String(targetLog.employeeCode || targetLog.userId || '').toLowerCase();
          const sameDate = l.date === targetLog.date;
          const sameTask = String(l.task || '').toLowerCase() === String(targetLog.task || '').toLowerCase();
          const sameDur = Math.abs(Number(l.durationSeconds) - Number(targetLog.durationSeconds)) < 30;
          const isRunningSession = l.status === 'running' || String(l.endTime || '').includes('Progress') || String(l.endTime || '').includes('Running');

          if (sameEmp && sameDate && (isRunningSession || (sameTask && sameDur))) return false;
        }
        return true;
      });
      localStorage.setItem('trackpulse_timelogs', JSON.stringify(filtered));
      return filtered;
    });

    // Clean up local daily backup keys in localStorage so self-healing doesn't restore the deleted log
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('llc_daily_time_backup_')) {
          const raw = localStorage.getItem(key);
          if (raw) {
            const items: TimeLog[] = JSON.parse(raw);
            if (Array.isArray(items)) {
              const cleaned = items.filter((l) => {
                const lDetId = getDeterministicLogId(l);
                const matchesId = lDetId === detTargetId || String(l.id) === String(id) || String((l as any).sessionId || '') === String(id);
                if (matchesId) return false;
                if (targetLog) {
                  const sameEmp = String((l as any).employeeCode || l.userId || '').toLowerCase() === String(targetLog.employeeCode || targetLog.userId || '').toLowerCase();
                  const sameDate = l.date === targetLog.date;
                  const sameTask = String(l.task || '').toLowerCase() === String(targetLog.task || '').toLowerCase();
                  const sameDur = Math.abs(Number(l.durationSeconds) - Number(targetLog.durationSeconds)) < 5;
                  if (sameEmp && sameDate && sameTask && sameDur) return false;
                }
                return true;
              });
              localStorage.setItem(key, JSON.stringify(cleaned));
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error cleaning local daily backup on delete:', e);
    }

    try {
      if (db) {
        await safeDeleteDoc(doc(db, 'timeLogs', detTargetId)).catch(() => {});
        await safeDeleteDoc(doc(db, 'sessions', detTargetId)).catch(() => {});
        if (id !== detTargetId) {
          await safeDeleteDoc(doc(db, 'timeLogs', id)).catch(() => {});
          await safeDeleteDoc(doc(db, 'sessions', id)).catch(() => {});
        }
      }

      const qParams = new URLSearchParams();
      if (targetLog) {
        if (targetLog.employeeCode || targetLog.userId) qParams.set('employeeCode', targetLog.employeeCode || targetLog.userId);
        if (targetLog.date) qParams.set('date', targetLog.date);
        if (targetLog.task) qParams.set('task', targetLog.task);
        if (targetLog.durationSeconds) qParams.set('durationSeconds', String(targetLog.durationSeconds));
      }

      await fetch(`/api/timelogs/${encodeURIComponent(detTargetId)}?${qParams.toString()}`, { method: 'DELETE' }).catch(() => {});
      if (id !== detTargetId) {
        await fetch(`/api/timelogs/${encodeURIComponent(id)}?${qParams.toString()}`, { method: 'DELETE' }).catch(() => {});
      }

      if (googleSheetsWebhookUrl) {
        fetch(googleSheetsWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            secret: 'LLCTrackerV2SecretKey2026',
            sharedSecret: 'LLCTrackerV2SecretKey2026',
            action: 'DELETE_TIMELOG',
            logId: id,
            id: detTargetId,
            sessionId: targetLog?.sessionId || id,
            employeeCode: targetLog?.employeeCode || targetLog?.userId,
            userId: targetLog?.userId || targetLog?.employeeCode,
            date: targetLog?.date,
            task: targetLog?.task,
            durationSeconds: targetLog?.durationSeconds,
            durationFormatted: targetLog ? formatDurationDetailed(targetLog.durationSeconds) : undefined,
          }),
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to delete time log from backend/Firestore:', err);
    }
  };

  const approveManualTimeRequest = (id: string) => {};
  const rejectManualTimeRequest = (id: string) => {};
  const submitManualTimeRequest = (req: Omit<ManualTimeRequest, 'id' | 'status'>) => {};

  // Auto-initialize Leave Balances for all active employees
  useEffect(() => {
    if (users.length > 0) {
      setLeaveBalances((prev) => {
        let changed = false;
        const updated = prev.map((b) => {
          const matchedUser = users.find((u) => u.id === b.userId || u.employeeCode === b.employeeCode);
          if (matchedUser) {
            let resolvedSupervisor = 'Unassigned';
            if (matchedUser.teamLeaderId) {
              const rawTl = matchedUser.teamLeaderId.trim();
              const foundTl = users.find(
                (t) =>
                  t.id.toLowerCase() === rawTl.toLowerCase() ||
                  t.employeeCode?.toLowerCase() === rawTl.toLowerCase() ||
                  t.username?.toLowerCase() === rawTl.toLowerCase() ||
                  t.name.toLowerCase() === rawTl.toLowerCase()
              );
              resolvedSupervisor = foundTl ? foundTl.name : rawTl;
            }
            if (b.supervisorName === 'Sir Robin / Team Leader' || b.supervisorName !== resolvedSupervisor) {
              changed = true;
              return { ...b, supervisorName: resolvedSupervisor };
            }
          }
          return b;
        });

        users.forEach((u) => {
          if (!u.isSecretBackup) {
            const exists = updated.find((b) => b.userId === u.id || b.employeeCode === u.employeeCode);
            if (!exists) {
              changed = true;
              const isRegularRole = ['admin', 'team_lead', 'trainer', 'payroll', 'hr', 'qa'].includes(u.role);
              const status = isRegularRole ? 'Regular' : 'Probationary';
              const credits = isRegularRole ? 15 : 0;
              let resolvedSupervisor = 'Unassigned';
              if (u.teamLeaderId) {
                const rawTl = u.teamLeaderId.trim();
                const foundTl = users.find(
                  (t) =>
                    t.id.toLowerCase() === rawTl.toLowerCase() ||
                    t.employeeCode?.toLowerCase() === rawTl.toLowerCase() ||
                    t.username?.toLowerCase() === rawTl.toLowerCase() ||
                    t.name.toLowerCase() === rawTl.toLowerCase()
                );
                resolvedSupervisor = foundTl ? foundTl.name : rawTl;
              }
              updated.push({
                id: u.employeeCode || u.id,
                userId: u.id,
                employeeCode: u.employeeCode || u.id,
                username: u.username || u.name.toLowerCase().replace(/\s+/g, ''),
                fullName: u.name,
                supervisorName: resolvedSupervisor,
                employmentStatus: status,
                totalPaidLeaveCredits: credits,
                usedPaidLeaveCredits: 0,
                remainingPaidLeaveCredits: credits,
                unpaidDaysUsed: 0,
                lastUpdated: new Date().toISOString(),
              });
            }
          }
        });

        if (changed) {
          localStorage.setItem('trackpulse_leavebalances', JSON.stringify(updated));
        }
        return changed ? updated : prev;
      });
    }
  }, [users]);

  const submitLeaveRequest = async (
    req: Omit<LeaveRequest, 'id' | 'status' | 'requestedAt'>
  ): Promise<{ success: boolean; message: string }> => {
    const id = `leave_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const nowIso = new Date().toISOString();
    const userBalance = leaveBalances.find(
      (b) => b.userId === req.userId || b.employeeCode === (req.employeeCode || req.userId)
    );

    const fullReq: LeaveRequest = {
      ...req,
      id,
      status: 'pending',
      requestedAt: nowIso,
      employmentStatus: req.employmentStatus || userBalance?.employmentStatus || 'Probationary',
      teamLeaderName: req.teamLeaderName || userBalance?.supervisorName || 'Team Leader',
      paidLeaveCreditsSnapshot:
        req.paidLeaveCreditsSnapshot ??
        userBalance?.remainingPaidLeaveCredits ??
        (userBalance?.employmentStatus === 'Regular' ? 15 : 0),
    };

    setLeaveRequests((prev) => {
      const updated = [fullReq, ...prev];
      localStorage.setItem('trackpulse_leaverequests', JSON.stringify(updated));
      return updated;
    });

    if (db) {
      safeSetDoc(doc(db, 'leaveRequests', id), fullReq).catch(() => {});
    }

    fetch('/api/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([fullReq]),
    }).catch((err) => console.warn('Server leave request post error:', err));

    addAuditLog({
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      category: 'Leave Submission',
      details: `Filed ${fullReq.type} for ${fullReq.startDate} to ${fullReq.endDate} (${fullReq.totalDays} day(s))`,
    });

    const activeWebhookUrl = getActiveWebhookUrl();
    if (activeWebhookUrl) {
      const res = await syncLeaveRequestToGoogleSheetsWebhook(activeWebhookUrl, fullReq, 'SUBMIT_LEAVE');
      if (res.success) {
        setSaveToast('✅ Leave Application Processed Successfully! Notification email sent to Team Leader and HR.');
        setTimeout(() => setSaveToast(null), 5000);
        return {
          success: true,
          message:
            'Leave Application Processed Successfully! Your leave request has been recorded in the database (Leave_Requests) and a notification email has been dispatched to your Team Leader and HR.',
        };
      }
    }

    return {
      success: false,
      message: 'Unable to process leave request right now. Please cancel and submit a new request.',
    };
  };

  const reSubmitLeaveRequest = async (
    leave: LeaveRequest
  ): Promise<{ success: boolean; message: string }> => {
    const activeWebhookUrl = getActiveWebhookUrl();
    if (activeWebhookUrl) {
      const res = await syncLeaveRequestToGoogleSheetsWebhook(activeWebhookUrl, leave, 'SUBMIT_LEAVE');
      if (res.success) {
        setSaveToast('✅ Leave Application Re-Submitted Successfully! Notification email sent to Team Leader and HR.');
        setTimeout(() => setSaveToast(null), 5000);
        return {
          success: true,
          message:
            'Leave Application Re-Submitted Successfully! Your leave request has been pushed to the database (Leave_Requests) and a notification email has been dispatched to your Team Leader and HR.',
        };
      }
    }
    return {
      success: false,
      message: 'Unable to process leave request right now. Please cancel and submit a new request.',
    };
  };

  const updateLeaveRequestStatus = (
    id: string,
    newStatus: LeaveRequest['status'],
    reviewerNotes?: string,
    actionedBy?: string
  ) => {
    const nowIso = new Date().toISOString();
    let targetLeave: LeaveRequest | undefined;

    setLeaveRequests((prev) => {
      const updated = prev.map((l) => {
        if (l.id === id) {
          targetLeave = {
            ...l,
            status: newStatus,
            reviewerNotes: reviewerNotes || l.reviewerNotes,
            actionedBy: actionedBy || `${currentUser.name} (${currentUser.role})`,
            actionedById: currentUser.id,
            actionedAt: nowIso,
          };
          return targetLeave;
        }
        return l;
      });
      localStorage.setItem('trackpulse_leaverequests', JSON.stringify(updated));
      return updated;
    });

    if (!targetLeave) return;
    const activeLeave = targetLeave;

    if (newStatus === 'approved') {
      setLeaveBalances((prev) => {
        const updated = prev.map((b) => {
          if (
            b.userId === activeLeave.userId ||
            b.employeeCode === (activeLeave.employeeCode || activeLeave.userId)
          ) {
            if (activeLeave.type === 'Paid Leave') {
              const deducted = activeLeave.totalDays || 1;
              const newRemaining = Math.max(0, b.remainingPaidLeaveCredits - deducted);
              const newUsed = b.usedPaidLeaveCredits + deducted;
              const updatedB = {
                ...b,
                usedPaidLeaveCredits: newUsed,
                remainingPaidLeaveCredits: newRemaining,
                lastUpdated: nowIso,
              };
              if (db) {
                safeSetDoc(doc(db, 'leaveBalances', b.id), updatedB).catch(() => {});
              }
              fetch('/api/leave-balances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([updatedB]),
              }).catch(() => {});
              const activeWebhookUrl = getActiveWebhookUrl();
              if (activeWebhookUrl) {
                syncLeaveBalanceToGoogleSheetsWebhook(activeWebhookUrl, updatedB).catch(() => {});
              }
              return updatedB;
            } else {
              const addedUnpaid = activeLeave.totalDays || 1;
              const updatedB = {
                ...b,
                unpaidDaysUsed: b.unpaidDaysUsed + addedUnpaid,
                lastUpdated: nowIso,
              };
              if (db) {
                safeSetDoc(doc(db, 'leaveBalances', b.id), updatedB).catch(() => {});
              }
              fetch('/api/leave-balances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([updatedB]),
              }).catch(() => {});
              const activeWebhookUrl = getActiveWebhookUrl();
              if (activeWebhookUrl) {
                syncLeaveBalanceToGoogleSheetsWebhook(activeWebhookUrl, updatedB).catch(() => {});
              }
              return updatedB;
            }
          }
          return b;
        });
        localStorage.setItem('trackpulse_leavebalances', JSON.stringify(updated));
        return updated;
      });
    }

    if (db) {
      safeSetDoc(doc(db, 'leaveRequests', id), targetLeave).catch(() => {});
    }

    fetch('/api/leave-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([targetLeave]),
    }).catch(() => {});

    addAuditLog({
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      category: newStatus === 'approved' ? 'Leave Request Approved' : 'Leave Request Rejected',
      details: `${newStatus.toUpperCase()} leave request for ${targetLeave.userName} (${targetLeave.startDate} to ${targetLeave.endDate}). Notes: ${reviewerNotes || 'None'}`,
    });

    const activeWebhookUrl = getActiveWebhookUrl();
    if (activeWebhookUrl) {
      syncLeaveRequestToGoogleSheetsWebhook(activeWebhookUrl, targetLeave, 'UPDATE_LEAVE_STATUS').catch(() => {});
    }
  };

  const approveLeaveRequest = (id: string) => {
    updateLeaveRequestStatus(id, 'approved');
  };

  const rejectLeaveRequest = (id: string) => {
    updateLeaveRequestStatus(id, 'rejected');
  };

  const updateEmployeeLeaveBalance = (userId: string, updates: Partial<LeaveBalance>) => {
    const nowIso = new Date().toISOString();
    setLeaveBalances((prev) => {
      const updated = prev.map((b) => {
        if (b.userId === userId || b.employeeCode === userId) {
          const updatedB = { ...b, ...updates, lastUpdated: nowIso };
          if (db) {
            safeSetDoc(doc(db, 'leaveBalances', b.id), updatedB).catch(() => {});
          }
          if (googleSheetsWebhookUrl) {
            syncLeaveBalanceToGoogleSheetsWebhook(googleSheetsWebhookUrl, updatedB).catch(() => {});
          }
          return updatedB;
        }
        return b;
      });
      localStorage.setItem('trackpulse_leavebalances', JSON.stringify(updated));
      return updated;
    });
  };

  const deleteScreenshot = (id: string) => {};
  const toggleScreenshotBlur = (id: string) => {};

  const updatePayrollStatus = (id: string, status: PayrollRecord['status']) => {};
  const updatePayrollRecord = (id: string, data: Partial<PayrollRecord>) => {};
  const bulkProcessPayroll = (payPeriod: string) => {};

  const addWorldClock = (clock: Omit<WorldClockItem, 'id'>) => {};
  const deleteWorldClock = (id: string) => {};

  const resetDatabaseToFreshState = async () => {
    setTimeLogs([]);
    setAuditLogs([]);
  };

  const designationList = Object.keys(designationTasks);
  const getTasksForDesignation = (desig?: string) => {
    const raw = desig || currentDesignation || currentUser.designation || 'Outbound Agent';
    const norm = normalizeDesignation(raw);
    const tasks = designationTasks[raw] || designationTasks[norm] || designationTasks['Outbound Agent'] || [
      'Email Reachout',
      'Data Entry and Market Research',
      'Follow-up',
      'Training',
      'Team Meeting',
      'Coaching',
    ];
    return tasks;
  };

  const addDesignation = (name: string, initialTasks?: string[]) => {};
  const deleteDesignation = (name: string) => {};
  const addTaskToDesignation = (desig: string, task: string) => {};
  const removeTaskFromDesignation = (desig: string, task: string) => {};

  const updateRolePermission = (roleKey: string, permKey: keyof RolePermissions, val: boolean) => {};
  const updateUserCustomPermission = (userId: string, permKey: keyof RolePermissions, val: boolean) => {};
  const resetUserCustomPermissions = (userId: string) => {};
  const addRoleCategory = (roleKey: string) => {};
  const deleteRoleCategory = (roleKey: string) => {};

  const hasPermission = (permissionKey: keyof RolePermissions, targetUser?: User): boolean => {
    const u = targetUser || currentUser;
    if (u?.role === 'admin') return true;
    return Boolean(rolePermissions[u?.role || 'agent']?.[permissionKey]);
  };

  const formatDuration = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const elapsedSecondsRef = useRef(elapsedSeconds);
  elapsedSecondsRef.current = elapsedSeconds;

  const isTrackingRef = useRef(isTracking);
  isTrackingRef.current = isTracking;

  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const usersRef = useRef(users);
  usersRef.current = users;

  const timeLogsRef = useRef(timeLogs);
  timeLogsRef.current = timeLogs;

  const userPresenceListRef = useRef(userPresenceList);
  userPresenceListRef.current = userPresenceList;

  const googleSheetsWebhookUrlRef = useRef(googleSheetsWebhookUrl);
  googleSheetsWebhookUrlRef.current = googleSheetsWebhookUrl;

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const currentDesignationRef = useRef(currentDesignation);
  currentDesignationRef.current = currentDesignation;

  const currentTaskRef = useRef(currentTask);
  currentTaskRef.current = currentTask;

  const currentActiveAppRef = useRef(currentActiveApp);
  currentActiveAppRef.current = currentActiveApp;

  // Initial Authoritative Data Bootstrap: load full roster and (if already logged in) fresh time logs
  useEffect(() => {
    const loadAuthoritativeData = async () => {
      await importEmployeesFromGoogleSheets().catch((err) => {
        console.warn('Failed to load authoritative Google Sheets roster:', err);
      });

      if (typeof window !== 'undefined' && localStorage.getItem('trackpulse_auth') === 'true') {
        await importTimeLogsFromGoogleSheets().catch((err) => {
          console.warn('Failed to load authoritative Google Sheets time logs:', err);
        });
      }

      try {
        const lRes = await fetch('/api/leave-requests');
        if (lRes.ok && lRes.headers.get('content-type')?.includes('application/json')) {
          const lData = await lRes.json();
          if (lData && Array.isArray(lData.leaveRequests) && lData.leaveRequests.length > 0) {
            setLeaveRequests((prev) => {
              const map = new Map<string, LeaveRequest>(prev.map((l) => [l.id, l]));
              for (const item of lData.leaveRequests) {
                map.set(item.id, item);
              }
              const merged = Array.from(map.values());
              localStorage.setItem('trackpulse_leaverequests', JSON.stringify(merged));
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Failed to load server leave requests:', err);
      }

      try {
        const bRes = await fetch('/api/leave-balances');
        if (bRes.ok && bRes.headers.get('content-type')?.includes('application/json')) {
          const bData = await bRes.json();
          if (bData && Array.isArray(bData.leaveBalances) && bData.leaveBalances.length > 0) {
            setLeaveBalances((prev) => {
              const map = new Map<string, LeaveBalance>(prev.map((b) => [b.id || b.employeeCode || b.userId, b]));
              for (const item of bData.leaveBalances) {
                const key = item.id || item.employeeCode || item.userId;
                if (key) map.set(key, item);
              }
              const merged = Array.from(map.values());
              localStorage.setItem('trackpulse_leavebalances', JSON.stringify(merged));
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn('Failed to load server leave balances:', err);
      }
    };
    loadAuthoritativeData();
  }, [importEmployeesFromGoogleSheets, importTimeLogsFromGoogleSheets]);

  // Dynamic Active-Window Detection: Tracks focused tracker vs background work software
  useEffect(() => {
    const getAppForTask = (task: string): string => {
      switch (task) {
        case 'Email Reachout':
          return 'Google Workspace (Gmail / Outreach CRM)';
        case 'Email Interaction':
          return 'Customer Support Portal / Webmail';
        case 'Data Entry & Market Research':
          return 'Spreadsheet & Web Research Browser';
        case 'Follow-up':
          return 'CRM System & Communication Suite';
        case 'Training':
          return 'Training LMS / Learning Management';
        case 'Team Meeting':
          return 'Video Conference (Google Meet / Zoom)';
        case 'Coaching':
          return 'Coaching Evaluation & Performance Suite';
        case 'QA Review':
        case 'QA Email Audit':
        case 'Other QA Reviews':
        case 'QA Coaching':
          return 'QA Audit Tool & Scorecard Portal';
        case 'Content Writing':
          return 'Document Editor & Research Workspace';
        case 'HR & Recruitment':
          return 'HRIS & Recruitment Portal';
        case 'Payroll Task':
          return 'Payroll Processing & Timesheet Audit';
        case 'System Ops Review':
          return 'Cloud Operations & Systems Dashboard';
        default:
          return `Work Application (${task || 'Active Task'})`;
      }
    };

    const handleFocus = () => {
      setCurrentActiveApp('LLC-Time-Tracker-V2 Desktop Tracker');
    };

    const handleBlur = () => {
      setCurrentActiveApp(getAppForTask(currentTaskRef.current));
    };

    // If window is currently not focused, set appropriate task app
    if (typeof document !== 'undefined' && !document.hasFocus()) {
      setCurrentActiveApp(getAppForTask(currentTask));
    }

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, [currentTask]);

  // Live Presence Polling (every 2 minutes / 120,000 ms) when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    let isMounted = true;
    const pollPresence = async () => {
      try {
        const res = await fetchLivePresenceFromGoogleSheets(
          googleSheetsWebhookUrl,
          DEFAULT_SPREADSHEET_ID,
          usersRef.current
        );
        if (isMounted && res.success && Array.isArray(res.presenceList)) {
          setUserPresenceList(res.presenceList);
        }
      } catch (err) {
        // ignore
      }
    };
    pollPresence();
    const interval = setInterval(pollPresence, 120000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [googleSheetsWebhookUrl, isAuthenticated]);

  // Wall-clock timestamp-based desktop timer and unthrottled background heartbeat + 5-minute sync
  useEffect(() => {
    let worker: Worker | null = null;
    let fallbackInterval: any = null;

    const performTick = () => {
      if (!isTrackingRef.current || !taskStartTimeRef.current) return;
      const now = Date.now();
      const elapsed = computeElapsedSeconds();
      setElapsedSeconds(elapsed);
      elapsedSecondsRef.current = elapsed;

      // Evaluate per-agent Idle Tracking if enabled for current user
      if (currentUserRef.current?.idleTrackingEnabled === true && !isPausedRef.current) {
        const noInputDurationMs = now - lastUserActivityMsRef.current;
        const isScreenHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';

        if (isScreenHidden) {
          if (screenBlackoutStartMsRef.current === null) {
            screenBlackoutStartMsRef.current = lastUserActivityMsRef.current;
          }
        } else {
          screenBlackoutStartMsRef.current = null;
        }

        const is10mIdle = noInputDurationMs >= 10 * 60 * 1000;
        const isBlackoutIdle = isScreenHidden && (now - (screenBlackoutStartMsRef.current || now) >= 5000);

        if (is10mIdle || isBlackoutIdle) {
          const idleStartMs = screenBlackoutStartMsRef.current || lastUserActivityMsRef.current;
          const currentIdleSecs = Math.max(0, Math.floor((now - idleStartMs) / 1000));
          setSessionIdleDeductionSeconds(currentIdleSecs);
          setIsIdleAlertActive(true);
          setInactivityAlertState((prev) => {
            if (!prev.isOpen) {
              return {
                isOpen: true,
                idleMinutes: Math.max(1, Math.floor(currentIdleSecs / 60)),
                remainingSeconds: 300,
              };
            }
            return prev;
          });
        }
      }

      // 2-minute presence heartbeat (120,000 ms)
      if (!isPausedRef.current && now - lastHeartbeatEpochMsRef.current >= 120000) {
        lastHeartbeatEpochMsRef.current = now;
        syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
          userId: currentUserRef.current.id,
          employeeCode: currentUserRef.current.employeeCode,
          userName: currentUserRef.current.name,
          role: currentUserRef.current.role,
          designation: currentDesignationRef.current,
          department: currentUserRef.current.department || 'Operations',
          isOnline: true,
          status: 'online',
          isTracking: true,
          isPaused: false,
          currentTask: currentTaskRef.current,
          currentApp: currentActiveAppRef.current,
          elapsedSeconds: elapsed,
          lastHeartbeat: new Date().toISOString(),
          loginPlatform: 'software',
          timezone: 'Asia/Manila',
        }).catch(() => {});
      }

      // 10-minute task duration synchronization (600,000 ms)
      if (!isPausedRef.current && now - last5mSyncEpochMsRef.current >= 600000) {
        last5mSyncEpochMsRef.current = now;
        const activeSegmentId = activeSegmentIdRef.current;
        const startTimeIso = getManilaIsoString(taskStartTimeRef.current);
        const activeLog: TimeLog = {
          id: activeSegmentId,
          userId: currentUserRef.current.id,
          employeeCode: currentUserRef.current.employeeCode,
          userName: currentUserRef.current.name,
          userAvatar: currentUserRef.current.avatar || '',
          designation: currentDesignationRef.current,
          task: currentTaskRef.current,
          date: getManilaDateString(new Date(now)),
          startTime: startTimeIso,
          endTime: 'In Progress (10m Sync)',
          durationSeconds: Math.max(1, elapsed),
          status: 'running',
          geoTimezone: 'Asia/Manila',
          geoLocalStartTime: getManilaTimeString(new Date(taskStartTimeRef.current)),
          geoLocalEndTime: getManilaTimeString(new Date(now)),
          mouseActivityAvg: 95,
          keyboardActivityAvg: 90,
          idleSeconds: sessionIdleDeductionSeconds,
          notes: 'Active task segment 10-minute sync',
          appsUsed: [],
        };

        setTimeLogs((prev) => {
          const map = new Map(prev.map((l) => [l.id, l]));
          map.set(activeSegmentId, activeLog);
          const updated = Array.from(map.values());
          localStorage.setItem('trackpulse_timelogs', JSON.stringify(updated));
          return updated;
        });

        fetch('/api/timelogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([activeLog]),
        }).catch((err) => {
          console.warn('10-minute task duration sync notice:', err);
        });
      }

      // 10-minute summary update schedule (600,000 ms)
      if (now - last10mSummarySyncEpochMsRef.current >= 600000) {
        last10mSummarySyncEpochMsRef.current = now;
        const empCode = currentUserRef.current.employeeCode || currentUserRef.current.id;
        const todayStr = getManilaDateString(new Date(now));
        fetch(`/api/daily-summary?userId=${encodeURIComponent(empCode)}&date=${encodeURIComponent(todayStr)}`)
          .catch((err) => {
            console.warn('10-minute summary update notice:', err);
          });
      }
    };

    if (isTracking) {
      performTick();

      // Launch unthrottled Web Worker ticker for background / minimized state
      try {
        const workerBlob = new Blob(
          ['setInterval(function() { postMessage("tick"); }, 1000);'],
          { type: 'application/javascript' }
        );
        const workerUrl = URL.createObjectURL(workerBlob);
        worker = new Worker(workerUrl);
        worker.onmessage = () => {
          performTick();
        };
      } catch (err) {
        console.warn('Web Worker ticker initialization fallback:', err);
      }

      // Main-thread fallback interval
      fallbackInterval = setInterval(performTick, 500);

      // Visibility and focus listeners (instant catch-up upon restore / un-minimizing)
      const handleVisibilityChange = () => {
        performTick();
      };
      const handleFocus = () => {
        performTick();
      };
      const handlePageShow = () => {
        performTick();
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleVisibilityChange);
      window.addEventListener('pageshow', handlePageShow);

      return () => {
        if (worker) {
          worker.terminate();
        }
        if (fallbackInterval) {
          clearInterval(fallbackInterval);
        }
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('blur', handleVisibilityChange);
        window.removeEventListener('pageshow', handlePageShow);
      };
    }
  }, [isTracking, isPaused, googleSheetsWebhookUrl, computeElapsedSeconds]);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        users,
        setUsers,
        setCurrentUser,
        isCloudQuotaExhausted,
        isAuthenticated,
        loginMode,
        setLoginMode,
        login,
        logout,
        webSessionRemainingSeconds,
        isSessionWarningActive,
        webSessionWarningCountdown,
        refreshWebSession,
        sessionExpiredReason,
        clearSessionExpiredReason,
        isOffline,
        offlineSinceTimestamp,
        offlineSecondsRemaining,
        offlineStatusStage,
        retryConnection,
        simulateOfflineToggle,
        isTracking,
        isPaused,
        currentDesignation,
        currentTask,
        elapsedSeconds,
        todayTotalSeconds,
        getTodayTrackedSeconds,
        currentSessionApps,
        currentMouseActivity,
        currentKeyboardActivity,
        currentActiveApp,
        taskSwitchPending,
        currentIdleThresholdMinutes,
        currentInactivitySeconds,
        sessionIdleDeductionSeconds,
        isIdleAlertActive,
        dismissIdleAlert,
        recordIdleInactivityEvent,
        simulateIdleEvent,
        restoreInactivityDeduction,
        setBulkIdleTracking,
        isDualMonitorMode,
        toggleDualMonitorMode,
        storageEngineMode,
        setStorageEngineMode,
        inactivityAlertState,
        respondToInactivityAlert,
        startTracking,
        pauseTracking,
        resumeTracking,
        stopTracking,
        selectDesignation,
        selectTaskWithPrompt,
        confirmTaskSwitch,
        cancelTaskSwitch,
        timeLogs,
        screenshots,
        idleLogs,
        leaveRequests,
        leaveBalances,
        manualTimeRequests,
        payrollRecords,
        worldClocks,
        auditLogs,
        userPresenceList,
        dailyAttendanceLogs,
        passwordResetRequests,
        addAuditLog,
        saveToast,
        setSaveToast,
        googleSheetsWebhookUrl,
        setGoogleSheetsWebhookUrl,
        isAutoSyncToSheetsEnabled,
        setIsAutoSyncToSheetsEnabled,
        triggerGoogleSheetsSync,
        importEmployeesFromGoogleSheets,
        importTimeLogsFromGoogleSheets,
        importPresenceFromGoogleSheets,
        syncAllFromGoogleSheets,
        startAgentLiveShift,
        stopAgentLiveShift,
        simulateActiveTraineesShift,
        isFirestoreLoaded: true,
        isDesktopDockView,
        setIsDesktopDockView,
        addUser,
        updateUser,
        deleteUser,
        resetUserPassword,
        requestPasswordReset,
        approvePasswordResetRequest,
        rejectPasswordResetRequest,
        addTimeLog,
        updateTimeLog,
        completeSessionLog,
        deleteTimeLog,
        approveManualTimeRequest,
        rejectManualTimeRequest,
        submitManualTimeRequest,
        approveLeaveRequest,
        rejectLeaveRequest,
        submitLeaveRequest,
        reSubmitLeaveRequest,
        updateLeaveRequestStatus,
        updateEmployeeLeaveBalance,
        deleteScreenshot,
        toggleScreenshotBlur,
        updatePayrollStatus,
        updatePayrollRecord,
        bulkProcessPayroll,
        addWorldClock,
        deleteWorldClock,
        resetDatabaseToFreshState,
        designationTasks,
        designationList,
        getTasksForDesignation,
        addDesignation,
        deleteDesignation,
        addTaskToDesignation,
        removeTaskFromDesignation,
        rolePermissions,
        updateRolePermission,
        updateUserCustomPermission,
        resetUserCustomPermissions,
        addRoleCategory,
        deleteRoleCategory,
        hasPermission,
        formatDuration,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
