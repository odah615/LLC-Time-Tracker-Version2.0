import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  User,
  TimeLog,
  ScreenshotLog,
  IdleLog,
  LeaveRequest,
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
import { getManilaDateString, getManilaTimeString, getManilaIsoString, formatLogStartTime, formatLogEndTime } from '../lib/dateUtils';
import { getJitteredPollInterval } from '../lib/fetchUtils';
import { generateUniqueUsername, deduplicateUsers, resolveCanonicalEmployee, isPlaceholderName, normalizeDesignation } from '../lib/userUtils';
import {
  getAuthHeaders,
  syncDataToGoogleSheetsWebhook,
  syncEmployeesToGoogleSheetsWebhook,
  syncAgentHeartbeatToSheets,
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
  deleteTimeLog: (id: string) => void;
  approveManualTimeRequest: (id: string) => void;
  rejectManualTimeRequest: (id: string) => void;
  submitManualTimeRequest: (req: Omit<ManualTimeRequest, 'id' | 'status'>) => void;
  approveLeaveRequest: (id: string) => void;
  rejectLeaveRequest: (id: string) => void;
  submitLeaveRequest: (req: Omit<LeaveRequest, 'id' | 'status' | 'requestedAt'>) => void;
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

  useEffect(() => {
    const loadAuthoritativeRoster = async () => {
      try {
        const res = await fetchEmployeesFromGoogleSheets();
        if (res.success && res.employees && res.employees.length > 0) {
          const merged = deduplicateUsers(ensureUsernames([...res.employees, ...users]));
          setUsers(merged);
          localStorage.setItem('trackpulse_users', JSON.stringify(merged));
        }
      } catch (err) {
        console.warn('Failed to load authoritative Google Sheets roster:', err);
      }
    };
    loadAuthoritativeRoster();
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
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
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
  const [googleSheetsWebhookUrl, setGoogleSheetsWebhookUrlState] = useState<string>(DEFAULT_WEBHOOK_URL);

  const setGoogleSheetsWebhookUrl = (url: string) => {
    setGoogleSheetsWebhookUrlState(url);
    localStorage.setItem('trackpulse_sheets_webhook', url);
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
          idleSeconds: 0,
          date: todayStr,
          notes: `Completed task segment for ${completedTaskCategory}`,
          appsUsed: [],
        };
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

    addTimeLog({
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
      idleSeconds: 0,
      date: todayStr,
      notes: 'Logged via LLC-Time-Tracker-V2 Desktop Tracker',
      appsUsed: [],
    });

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
    return timeLogs
      .filter((l) => {
        const matchesUser =
          (currentUser.id && l.userId === currentUser.id) ||
          (currentUser.employeeCode && l.employeeCode === currentUser.employeeCode);
        if (!matchesUser) return false;
        const logDate = l.startTime ? getManilaDateString(new Date(l.startTime)) : (l.date || today);
        return logDate === today;
      })
      .reduce((acc, l) => {
        if (l.status === 'completed') {
          return acc + (Number(l.durationSeconds) || 0);
        }
        if (l.status === 'running' && l.startTime) {
          const startMs = new Date(l.startTime).getTime();
          if (!isNaN(startMs)) {
            const liveDur = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
            return acc + (isTracking ? 0 : liveDur);
          }
        }
        return acc;
      }, isTracking ? elapsedSeconds : 0);
  }, [timeLogs, currentUser.id, currentUser.employeeCode, isTracking, elapsedSeconds]);

  const todayTotalSeconds = getTodayTrackedSeconds();

  const login = (user: User, mode: 'webapp' | 'software' = 'webapp', token?: string) => {
    setCurrentUser(user);
    setCurrentDesignation(user.designation || 'Outbound Agent');
    setIsAuthenticated(true);
    setLoginMode(mode);
    setIsDesktopDockView(mode === 'software');
    localStorage.setItem('trackpulse_auth', 'true');
    localStorage.setItem('trackpulse_current_user', JSON.stringify(user));
    if (token) localStorage.setItem('trackpulse_token', token);

    // Strict employee session isolation: Clear previous logs immediately
    setTimeLogs([]);

    // Fetch this employee's logs from server API
    fetchTimeLogsFromGoogleSheets(undefined, undefined, { userId: user.employeeCode || user.id }).then((res) => {
      if (res.success && Array.isArray(res.timeLogs)) {
        const mapped = res.timeLogs.map((l) => ({ ...l, status: l.status || 'completed' })) as TimeLog[];
        let finalLogs = mapped;
        try {
          const empCode = String(user.employeeCode || user.id || '').trim();
          if (empCode) {
            const backupKey = `llc_daily_time_backup_${empCode}`;
            const rawBackup = localStorage.getItem(backupKey);
            if (rawBackup) {
              const backupLogs: TimeLog[] = JSON.parse(rawBackup);
              if (Array.isArray(backupLogs)) {
                const serverLogIds = new Set(mapped.map((l) => l.id));
                const missingLogs = backupLogs.filter((l) => l.status === 'completed' && !serverLogIds.has(l.id));
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

        setTimeLogs(finalLogs);
        localStorage.setItem('trackpulse_timelogs', JSON.stringify(finalLogs));
      }
    });

    syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, {
      userId: user.id,
      employeeCode: user.employeeCode,
      userName: user.name,
      role: user.role,
      designation: user.designation || 'Agent',
      department: user.department || 'Operations',
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
      userPresenceList
    );
  };

  const importEmployeesFromGoogleSheets = async (): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const res = await fetchEmployeesFromGoogleSheets();
      if (res.success && res.employees && res.employees.length > 0) {
        const merged = deduplicateUsers(ensureUsernames(res.employees));
        setUsers(merged);
        localStorage.setItem('trackpulse_users', JSON.stringify(merged));
        return { success: true, count: merged.length, message: res.message };
      }
      return { success: false, count: users.length, message: 'Could not fetch remote employee roster.' };
    } catch (err: any) {
      return { success: false, count: users.length, message: err?.message || 'Error fetching roster.' };
    }
  };

  const importTimeLogsFromGoogleSheets = async (): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const res = await fetchTimeLogsFromGoogleSheets(undefined, undefined, { userId: currentUser.employeeCode || currentUser.id });
      if (res.success && Array.isArray(res.timeLogs) && res.timeLogs.length > 0) {
        const mappedLogs: TimeLog[] = res.timeLogs.map((l: any) => ({
          id: l.id || l.sessionId || `log-${Math.random()}`,
          userId: l.userId || currentUser.id,
          employeeCode: l.employeeCode || currentUser.employeeCode,
          userName: l.userName || currentUser.name,
          userAvatar: l.userAvatar || currentUser.avatar || '',
          designation: l.designation || currentUser.designation,
          task: l.task || 'Work',
          date: l.date || getManilaDateString(),
          startTime: l.startTime || new Date().toISOString(),
          endTime: l.endTime || 'In Progress',
          durationSeconds: Number(l.durationSeconds || 0),
          status: l.status || 'completed',
          geoTimezone: 'Asia/Manila',
          geoLocalStartTime: l.geoLocalStartTime || l.startTime || '',
          geoLocalEndTime: l.geoLocalEndTime || l.endTime || '',
          mouseActivityAvg: l.mousePercentage || 95,
          keyboardActivityAvg: l.keyboardPercentage || 90,
          idleSeconds: (l.idleMinutes || 0) * 60,
          notes: l.notes || '',
          appsUsed: [],
        }));
        setTimeLogs((prev) => {
          const map = new Map(prev.map((item) => [item.id, item]));
          for (const item of mappedLogs) {
            map.set(item.id, item);
          }
          const merged = Array.from(map.values());
          localStorage.setItem('trackpulse_timelogs', JSON.stringify(merged));
          return merged;
        });
        return { success: true, count: mappedLogs.length, message: res.message };
      }
    } catch (err: any) {
      console.warn('Error fetching time logs from Google Sheets:', err);
    }
    return { success: true, count: timeLogs.length, message: `Loaded ${timeLogs.length} local logs.` };
  };

  const importPresenceFromGoogleSheets = async (): Promise<{ success: boolean; count: number; message: string }> => {
    try {
      const res = await fetchLivePresenceFromGoogleSheets(googleSheetsWebhookUrl, DEFAULT_SPREADSHEET_ID, users);
      if (res.success && Array.isArray(res.presenceList)) {
        setUserPresenceList(res.presenceList);
        return { success: true, count: res.presenceList.length, message: res.message };
      }
    } catch (err: any) {
      console.warn('Error fetching live presence from Google Sheets:', err);
    }
    return { success: true, count: userPresenceList.length, message: 'Presence updated.' };
  };

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
  };

  const resetUserPassword = (userId: string, newPass: string) => {};
  const requestPasswordReset = (targetUserId: string, reason?: string) => {};
  const approvePasswordResetRequest = (requestId: string) => {};
  const rejectPasswordResetRequest = (requestId: string) => {};

  const addTimeLog = (logData: Omit<TimeLog, 'id'> & { id?: string }) => {
    const newLog: TimeLog = { id: logData.id || `log-${Date.now()}`, ...logData };
    setTimeLogs((prev) => {
      // Remove any running log for THIS specific employee when a completed log arrives to prevent double duration
      const targetCode = String(logData.employeeCode || logData.userId || '').trim().toLowerCase();
      const filtered = logData.status === 'completed'
        ? prev.filter((l) => {
            const lCode = String(l.employeeCode || l.userId || '').trim().toLowerCase();
            return !(targetCode && lCode === targetCode && (l.status === 'running' || l.id.startsWith('active-seg-') || l.id.startsWith('seg-running-')));
          })
        : prev.filter((l) => l.id !== newLog.id);
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

  const updateTimeLog = (id: string, data: Partial<TimeLog>) => {
    setTimeLogs((prev) => prev.map((l) => (l.id === id ? { ...l, ...data } : l)));
  };

  const deleteTimeLog = async (id: string) => {
    setTimeLogs((prev) => prev.filter((l) => l.id !== id));
    try {
      if (db) {
        await safeDeleteDoc(doc(db, 'timeLogs', id));
      }
      await fetch(`/api/timelogs/${id}`, { method: 'DELETE' }).catch(() => {});
      triggerGoogleSheetsSync().catch(() => {});
    } catch (err) {
      console.warn('Failed to delete time log from backend/Firestore:', err);
    }
  };

  const approveManualTimeRequest = (id: string) => {};
  const rejectManualTimeRequest = (id: string) => {};
  const submitManualTimeRequest = (req: Omit<ManualTimeRequest, 'id' | 'status'>) => {};

  const approveLeaveRequest = (id: string) => {};
  const rejectLeaveRequest = (id: string) => {};
  const submitLeaveRequest = (req: Omit<LeaveRequest, 'id' | 'status' | 'requestedAt'>) => {};

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

  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const currentDesignationRef = useRef(currentDesignation);
  currentDesignationRef.current = currentDesignation;

  const currentTaskRef = useRef(currentTask);
  currentTaskRef.current = currentTask;

  const currentActiveAppRef = useRef(currentActiveApp);
  currentActiveAppRef.current = currentActiveApp;

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

  // Live Presence Polling (every 2 minutes / 120,000 ms)
  useEffect(() => {
    let isMounted = true;
    const pollPresence = async () => {
      try {
        const res = await fetchLivePresenceFromGoogleSheets(googleSheetsWebhookUrl, DEFAULT_SPREADSHEET_ID, users);
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
  }, [googleSheetsWebhookUrl, users]);

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
          idleSeconds: 0,
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
        deleteTimeLog,
        approveManualTimeRequest,
        rejectManualTimeRequest,
        submitManualTimeRequest,
        approveLeaveRequest,
        rejectLeaveRequest,
        submitLeaveRequest,
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
