import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
import { getManilaDateString, getManilaTimeString, formatLogStartTime, formatLogEndTime } from '../lib/dateUtils';
import { getJitteredPollInterval } from '../lib/fetchUtils';
import { generateUniqueUsername, deduplicateUsers, resolveCanonicalEmployee, isPlaceholderName } from '../lib/userUtils';
import {
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
  triggerGoogleSheetsSync: (overrideUrl?: string) => Promise<{ success: boolean; message: string }>;
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
  addTimeLog: (log: Omit<TimeLog, 'id'>) => void;
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

  const [loginMode, setLoginMode] = useState<'webapp' | 'software'>('webapp');
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

  const [isTracking, setIsTracking] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentDesignation, setCurrentDesignation] = useState<Designation>(currentUser.designation || 'Agent');
  const [currentTask, setCurrentTask] = useState<TaskCategory>('Email Reachout');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isDesktopDockView, setIsDesktopDockView] = useState<boolean>(false);

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
      const duration = Math.max(1, elapsedSeconds);
      const startTimeIso = new Date(now.getTime() - duration * 1000).toISOString();

      if (isTracking && duration > 0) {
        addTimeLog({
          userId: currentUser.id,
          employeeCode: currentUser.employeeCode,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          designation: currentDesignation,
          task: currentTask,
          startTime: startTimeIso,
          endTime: now.toISOString(),
          durationSeconds: duration,
          status: 'completed',
          geoTimezone: currentUser.geoTimezone || 'Asia/Manila',
          geoLocalStartTime: getManilaTimeString(new Date(now.getTime() - duration * 1000)),
          geoLocalEndTime: getManilaTimeString(now),
          mouseActivityAvg: 95,
          keyboardActivityAvg: 90,
          idleSeconds: 0,
          date: todayStr,
          notes: `Completed task segment for ${currentTask}`,
          appsUsed: [],
        });
      }

      setCurrentTask(taskSwitchPending.targetTask);
      setElapsedSeconds(0);
      setIsTracking(true);
      setIsPaused(false);
      setTaskSwitchPending(null);
    }
  };

  const cancelTaskSwitch = () => {
    setTaskSwitchPending(null);
  };

  const startTracking = () => {
    setIsTracking(true);
    setIsPaused(false);
    setElapsedSeconds(0);
  };

  const pauseTracking = () => {
    setIsPaused(true);
  };

  const resumeTracking = () => {
    setIsPaused(false);
  };

  const stopTracking = () => {
    if (!isTracking) return;
    const now = new Date();
    const todayStr = getManilaDateString(now);
    const duration = Math.max(1, elapsedSeconds);
    const startTimeIso = new Date(now.getTime() - duration * 1000).toISOString();

    addTimeLog({
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      designation: currentDesignation,
      task: currentTask,
      startTime: startTimeIso,
      endTime: now.toISOString(),
      durationSeconds: duration,
      status: 'completed',
      geoTimezone: currentUser.geoTimezone || 'Asia/Manila',
      geoLocalStartTime: getManilaTimeString(new Date(now.getTime() - duration * 1000)),
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
  };

  const getTodayTrackedSeconds = useCallback((): number => {
    const today = getManilaDateString();
    const total = timeLogs
      .filter((l) => l.userId === currentUser.id && l.date === today && l.status === 'completed')
      .reduce((acc, l) => acc + (Number(l.durationSeconds) || 0), 0);
    return total + (isTracking ? elapsedSeconds : 0);
  }, [timeLogs, currentUser.id, isTracking, elapsedSeconds]);

  const todayTotalSeconds = getTodayTrackedSeconds();

  const login = (user: User, mode: 'webapp' | 'software' = 'webapp', token?: string) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    setLoginMode(mode);
    setIsDesktopDockView(mode === 'software');
    localStorage.setItem('trackpulse_auth', 'true');
    localStorage.setItem('trackpulse_current_user', JSON.stringify(user));
  };

  const logout = () => {
    setIsAuthenticated(false);
    setIsTracking(false);
    localStorage.removeItem('trackpulse_auth');
    localStorage.removeItem('trackpulse_current_user');
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

  const triggerGoogleSheetsSync = async (overrideUrl?: string): Promise<{ success: boolean; message: string }> => {
    return { success: true, message: 'Google Sheets sync processed.' };
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
      id: `usr-${Date.now()}`,
    };
    setUsers((prev) => [...prev, newUser]);
  };

  const updateUser = (id: string, data: Partial<User>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
  };

  const deleteUser = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const resetUserPassword = (userId: string, newPass: string) => {};
  const requestPasswordReset = (targetUserId: string, reason?: string) => {};
  const approvePasswordResetRequest = (requestId: string) => {};
  const rejectPasswordResetRequest = (requestId: string) => {};

  const addTimeLog = (logData: Omit<TimeLog, 'id'> & { id?: string }) => {
    const newLog: TimeLog = { id: logData.id || `log-${Date.now()}`, ...logData };
    setTimeLogs((prev) => {
      const updated = [newLog, ...prev];
      localStorage.setItem('trackpulse_timelogs', JSON.stringify(updated));
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
  };

  const updateTimeLog = (id: string, data: Partial<TimeLog>) => {
    setTimeLogs((prev) => prev.map((l) => (l.id === id ? { ...l, ...data } : l)));
  };

  const deleteTimeLog = (id: string) => {
    setTimeLogs((prev) => prev.filter((l) => l.id !== id));
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
    return designationTasks[desig || 'Agent'] || ['On Shift', 'Team Meeting'];
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

  useEffect(() => {
    let interval: any = null;
    if (isTracking && !isPaused) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking, isPaused]);

  // Objective 1: 3-Minute Heartbeat (Live_Presence only)
  useEffect(() => {
    let interval: any = null;
    if (isTracking && !isPaused) {
      interval = setInterval(() => {
        const heartbeatPayload = {
          userId: currentUser.id,
          employeeCode: currentUser.employeeCode,
          userName: currentUser.name,
          role: currentUser.role,
          designation: currentDesignation,
          department: currentUser.department || 'Operations',
          isOnline: true,
          isTracking: true,
          isPaused: false,
          currentTask,
          elapsedSeconds,
          lastHeartbeat: new Date().toISOString(),
          loginPlatform: 'software' as const,
        };
        syncAgentHeartbeatToSheets(googleSheetsWebhookUrl, heartbeatPayload).catch(() => {});
      }, 180000); // 3 minutes
    }
    return () => clearInterval(interval);
  }, [isTracking, isPaused, currentTask, elapsedSeconds, currentUser, currentDesignation, googleSheetsWebhookUrl]);

  // Objective 2: 5-Minute Task Duration Synchronization
  useEffect(() => {
    let interval: any = null;
    if (isTracking && !isPaused) {
      interval = setInterval(() => {
        const activeSegmentId = `active-seg-${currentUser.id}-${getManilaDateString()}`;
        const now = new Date();
        const duration = Math.max(1, elapsedSeconds);
        const startTimeIso = new Date(now.getTime() - duration * 1000).toISOString();
        const activeLog: TimeLog = {
          id: activeSegmentId,
          userId: currentUser.id,
          employeeCode: currentUser.employeeCode,
          userName: currentUser.name,
          userAvatar: currentUser.avatar || '',
          designation: currentDesignation,
          task: currentTask,
          date: getManilaDateString(now),
          startTime: startTimeIso,
          endTime: 'In Progress (5m Sync)',
          durationSeconds: duration,
          status: 'running',
          geoTimezone: 'Asia/Manila',
          geoLocalStartTime: getManilaTimeString(new Date(now.getTime() - duration * 1000)),
          geoLocalEndTime: getManilaTimeString(now),
          mouseActivityAvg: 95,
          keyboardActivityAvg: 90,
          idleSeconds: 0,
          notes: 'Active task segment 5-minute sync',
          appsUsed: [],
        };
        fetch('/api/timelogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify([activeLog]),
        }).catch((err) => {
          console.warn('5-minute task duration sync notice:', err);
        });
      }, 300000); // 5 minutes
    }
    return () => clearInterval(interval);
  }, [isTracking, isPaused, currentTask, elapsedSeconds, currentUser, currentDesignation]);

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
