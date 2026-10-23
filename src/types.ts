export type UserRole = 'agent' | 'team_lead' | 'trainer' | 'hr' | 'payroll' | 'admin' | 'va_admin' | 'qa' | 'writer';

export const ALLOWED_DESIGNATIONS = [
  'Outbound Agent',
  'Inbound Agent',
  'Team Leader',
  'Trainer',
  'Admin',
  'QA Specialist',
  'Writer',
  'HR',
  'Payroll Officer',
] as const;

export type StandardDesignation = typeof ALLOWED_DESIGNATIONS[number];

export type Designation =
  | 'Outbound Agent'
  | 'Inbound Agent'
  | 'Team Leader'
  | 'Trainer'
  | 'Admin'
  | 'QA Specialist'
  | 'Writer'
  | 'HR'
  | 'Payroll Officer'
  | 'Agent' // Legacy fallback
  | string;

export type TaskCategory = string;

export interface RolePermissions {
  canEditEmployees: boolean; // CRUD create/edit/delete employee profiles
  canAssignTeamLeader: boolean; // Assign or reassign Team Leader to team members
  canViewActivityLogs: boolean; // View employee hardware activity timeline & window titles
  canViewScreenshots: boolean; // View employee visual desktop screenshot captures
  canViewTimesheets: boolean; // View, audit and approve employee timesheets
  canViewPayroll: boolean; // View payroll calculations, rates, and compensation
  canManageTasks: boolean; // Add/edit designations and task categories
  canManageRoles: boolean; // Master permission control (Super Admin)
  canSyncSheets: boolean; // Manage Google Apps Script & webhook database sync
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  designation: Designation;
  avatar: string;
  hourlyRate: number;
  monthlyRate?: number;
  geoTimezone: string; // e.g. 'America/Toronto'
  geoCity: string; // e.g. 'Toronto, Canada'
  teamId?: string;
  joinDate: string;
  employeeCode: string;
  username?: string; // Formatted unique username: e.g. first initial + first 4 letters of last name (or 5+ if duplicate)
  department: string;
  status?: 'active' | 'inactive';
  teamLeaderId?: string; // ID of assigned Team Leader or Trainer
  stealthMonitored?: boolean; // Combined surveillance flag
  screenshotMonitored?: boolean; // Separate Screenshot Monitor toggle
  activityMonitored?: boolean; // Separate Activity Monitor toggle
  idleTrackingEnabled?: boolean; // Separate Idle Detection toggle per agent
  isSecretBackup?: boolean; // Hidden emergency backup admin account (does not appear in public lists)
  password?: string; // Account password
  passwordHash?: string; // Secure PBKDF2 cryptographic hash stored on backend
  isPasswordChanged?: 'YES' | 'NO'; // Authoritative password change state
  mustChangePassword?: boolean; // If true, requires user to change password on first login
  customPermissions?: Partial<RolePermissions>; // Optional user-level permission overrides
}

export interface WorldClockItem {
  id: string;
  label: string;
  timezone: string;
  city: string;
  countryCode: string;
  isAgentGeo?: boolean;
}

export interface AppUsage {
  appName: string;
  icon: string;
  durationSeconds: number;
  category: 'productive' | 'neutral' | 'unproductive';
}

export interface ActivityMetric {
  timestamp: string; // HH:mm:ss
  keyboardPercent: number;
  mousePercent: number;
  activeApp: string;
}

export interface TimeLog {
  id: string;
  sessionId?: string; // Authoritative Tracking Session ID
  loginSessionId?: string; // Associated Application Login Session ID
  loginTime?: string; // Application login timestamp (separate from task startTime)
  userId: string;
  employeeCode?: string;
  userName: string;
  userAvatar: string;
  designation: Designation;
  task: TaskCategory;
  startTime: string; // ISO string
  endTime?: string; // ISO string
  durationSeconds: number;
  status: 'running' | 'completed' | 'paused' | 'idle' | 'interrupted';
  geoTimezone: string;
  geoLocalStartTime: string; // formatted time e.g. "06:12 AM"
  geoLocalEndTime?: string; // formatted time e.g. "08:12 AM"
  mouseActivityAvg: number; // 0 - 100%
  keyboardActivityAvg: number; // 0 - 100%
  appsUsed: AppUsage[];
  idleSeconds: number;
  date: string; // YYYY-MM-DD
  isLate?: boolean;
  lateReason?: string;
  notes?: string;
}

export interface ScreenshotLog {
  id: string;
  timeLogId: string;
  userId: string;
  userName: string;
  employeeCode?: string;
  userEmail?: string;
  department?: string;
  designation?: string;
  date?: string; // YYYY-MM-DD for querying
  timestamp: string; // Display time e.g. "11:00 AM EST"
  capturedAtIso?: string; // ISO 8601 string for precise DB filtering
  imageUrl: string;
  activityPercent: number;
  mouseActivityPercent?: number;
  keyboardActivityPercent?: number;
  activeApp: string;
  flagged?: boolean;
  isBlurred?: boolean;
  isNew?: boolean;
  lowActivityAlert?: boolean; // When activity is low / tired / inactive (<45%)
  resolution?: string;
  syncedToDatabase?: boolean;
}

export interface IdleLog {
  id: string;
  userId: string;
  userName: string;
  timestamp: string;
  durationMinutes: number;
  task: TaskCategory;
  reason: string;
  status: 'logged' | 'reviewed' | 'waived';
  deductedFromShiftMinutes?: number;
  requiredExtensionMinutes?: number;
  syncedToGoogleSheets?: boolean;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  userName: string;
  type: 'Sick Leave' | 'Vacation' | 'Emergency' | 'Unpaid' | string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  availableLeaveCredits?: number;
}

export interface ManualTimeRequest {
  id: string;
  userId: string;
  userName: string;
  date: string;
  startTime: string;
  endTime: string;
  task: TaskCategory;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

export type AuditActionCategory =
  | 'Role Change'
  | 'Supervisor Reassign'
  | 'Supervisor Assignment'
  | 'User Management'
  | 'Screenshot Monitor Toggle'
  | 'Activity Monitor Toggle'
  | 'Password Reset'
  | 'Security'
  | 'Employee Added'
  | 'Employee Updated'
  | 'Employee Deleted'
  | 'Clock In'
  | 'Clock Out'
  | 'Login'
  | 'Logout'
  | 'Time Entry Created'
  | 'Time Entry Edit'
  | 'Time Entry Deleted'
  | 'Manual Time Approved'
  | 'Manual Time Rejected'
  | 'Manual Time Approval'
  | 'Manual Time Submission'
  | 'Leave Approval'
  | 'Leave Rejected'
  | 'Leave Submission'
  | 'Leave Request Approved'
  | 'Leave Request Rejected'
  | 'Payroll Processed'
  | 'Payroll Update'
  | string;

export interface AuditLog {
  id: string;
  timestamp: string; // ISO string e.g. "2026-08-13T00:45:00.000Z"
  dateFormatted: string; // e.g. "Aug 13, 2026 00:45:00"
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  category: AuditActionCategory;
  targetEmployeeId?: string;
  targetEmployeeName?: string;
  fromValue?: string;
  toValue?: string;
  details: string;
}

export interface PayrollRecord {
  id: string;
  userId: string;
  userName: string;
  employeeCode: string;
  designation: Designation;
  monthlyRate?: number;
  dailyRate?: number;
  hourlyRate: number;
  totalTrackedHours: number;
  regularHours: number;
  overtimeHours: number;
  missingHours?: number;
  expectedHours?: number;
  missingDeductions?: number;
  lateDeductions: number;
  grossPay: number;
  incentiveBonus?: number;
  netPay: number;
  payPeriod: string;
  status: 'pending' | 'processing' | 'paid';
  paidDate?: string;
  remarks?: string;
}

export interface UserPresence {
  userId: string;
  userName: string;
  role: UserRole;
  designation: Designation;
  employeeCode: string;
  department: string;
  teamLeaderId?: string;
  isOnline: boolean;
  status: 'online' | 'idle' | 'offline';
  sessionId?: string; // Current Active Tracking Session ID
  currentTask?: string;
  currentApp?: string;
  mouseActivity?: number;
  keyboardActivity?: number;
  elapsedSeconds?: number;
  startTime?: string;
  idleDeductionSeconds?: number;
  isTracking?: boolean;
  isPaused?: boolean;
  lastHeartbeat: string; // ISO string
  loginTime?: string; // ISO string of shift start
  loginPlatform?: 'software' | 'webapp';
}

export interface DailyAttendanceLog {
  id: string;
  userId: string;
  userName: string;
  employeeCode: string;
  date: string; // YYYY-MM-DD
  firstLoginTime: string; // e.g. "08:00:15 AM"
  lastLogoutTime?: string; // e.g. "05:00:00 PM"
  totalLoggedSeconds: number;
  totalLoggedHours: number;
  totalIdleDeductionsMinutes?: number;
  requiredExtensionMinutes?: number;
  status: 'present' | 'late' | 'half-day' | 'on-leave' | 'absent';
  syncedToGoogleSheets?: boolean;
}

export interface PasswordResetRequest {
  id: string;
  requestedByUserId: string;
  requestedByUserName: string;
  requestedByUserRole: UserRole;
  targetUserId: string;
  targetUserName: string;
  targetUserCode: string;
  timestamp: string; // ISO string
  dateFormatted: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface UserSessionLog {
  id: string;
  userId: string;
  userName: string;
  employeeCode: string;
  userEmail?: string;
  role: UserRole;
  designation?: Designation;
  platform: 'webapp' | 'software';
  loginTimestamp: string; // ISO string
  loginTimeFormatted: string;
  lastActiveTimestamp: string; // ISO string
  logoutTimestamp?: string; // ISO string
  logoutTimeFormatted?: string;
  sessionDurationMinutes?: number;
  logoutReason?: 'manual' | 'session_timeout_10min' | 'browser_closed' | 'shift_ended' | 'active';
  ipAddress?: string;
  location?: string;
  syncedToGoogleSheets?: boolean;
}
