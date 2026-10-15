import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const SYNC_BRIDGE_FILE = path.join(process.cwd(), '.sync_bridge.json');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `pbkdf2:sha512:10000:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHashOrPlain?: string): boolean {
  if (!storedHashOrPlain) return false;
  const trimmed = storedHashOrPlain.trim();
  if (trimmed.startsWith('pbkdf2:')) {
    const parts = trimmed.split(':');
    if (parts.length === 5) {
      const iterations = parseInt(parts[2], 10);
      const salt = parts[3];
      const originalHash = parts[4];
      const computed = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex');
      return computed === originalHash;
    }
  }
  return trimmed === password;
}

export function sanitizeUser(user: any): any {
  if (!user || typeof user !== 'object') return null;
  const { password, passwordHash, ...safe } = user;
  return safe;
}

const DEFAULT_DESIGNATION_TASKS: Record<string, string[]> = {
  'Outbound Agent/Team': [
    'Data Entry & Market Research',
    'Email Reachout',
    'Follow-up',
    'Training',
    'Team Meeting',
    'Coaching',
  ],
  'Inbound Agent/Team': [
    'Email Interaction',
    'Training',
    'Team Meeting',
    'Coaching',
  ],
  'Agent': [
    'Data Entry & Market Research',
    'Email Reachout',
    'Email Interaction',
    'Follow-up',
    'Training',
    'Team Meeting',
    'Coaching',
  ],
  'Team Leader': [
    'Team Supervision',
    'Team Meeting',
    'Training',
    'Coaching',
    'QA Review',
    'On Shift',
  ],
  'Trainer': [
    'Training',
    'Coaching',
    'Team Meeting',
    'QA Review',
    'On Shift',
  ],
  'Admin': [
    'System Ops Review',
    'On Shift',
  ],
  'Super Admin': [
    'System Ops Review',
    'On Shift',
  ],
  'QA Specialist': [
    'QA Email Audit',
    'Other QA Reviews',
    'QA Coaching',
  ],
  'Writer': [
    'Content Writing',
    'Team Meeting',
    'On Shift',
  ],
  'HR': [
    'Team Meeting',
    'HR & Recruitment',
    'Payroll Task',
    'On Shift',
  ],
  'Payroll Officer': [
    'Payroll Task',
    'On Shift',
    'Team Meeting',
  ],
};

const DEFAULT_ROLE_PERMISSIONS: Record<string, any> = {
  admin: {
    canEditEmployees: true,
    canAssignTeamLeader: true,
    canViewActivityLogs: true,
    canViewScreenshots: true,
    canViewTimesheets: true,
    canViewPayroll: true,
    canManageTasks: true,
    canManageRoles: true,
    canSyncSheets: true,
  },
  trainer: {
    canEditEmployees: true,
    canAssignTeamLeader: true,
    canViewActivityLogs: true,
    canViewScreenshots: true,
    canViewTimesheets: true,
    canViewPayroll: false,
    canManageTasks: true,
    canManageRoles: false,
    canSyncSheets: false,
  },
  team_lead: {
    canEditEmployees: false,
    canAssignTeamLeader: true,
    canViewActivityLogs: true,
    canViewScreenshots: true,
    canViewTimesheets: true,
    canViewPayroll: false,
    canManageTasks: false,
    canManageRoles: false,
    canSyncSheets: false,
  },
  hr: {
    canEditEmployees: true,
    canAssignTeamLeader: false,
    canViewActivityLogs: false,
    canViewScreenshots: false,
    canViewTimesheets: true,
    canViewPayroll: false,
    canManageTasks: false,
    canManageRoles: false,
    canSyncSheets: false,
  },
  payroll: {
    canEditEmployees: false,
    canAssignTeamLeader: false,
    canViewActivityLogs: false,
    canViewScreenshots: false,
    canViewTimesheets: true,
    canViewPayroll: true,
    canManageTasks: false,
    canManageRoles: false,
    canSyncSheets: false,
  },
  agent: {
    canEditEmployees: false,
    canAssignTeamLeader: false,
    canViewActivityLogs: false,
    canViewScreenshots: false,
    canViewTimesheets: false,
    canViewPayroll: false,
    canManageTasks: false,
    canManageRoles: false,
    canSyncSheets: false,
  },
};

interface BridgeData {
  presence: Record<string, any>;
  timelogs: any[];
  users: any[];
  attendance: any[];
  auditlogs: any[];
  tasks: Record<string, string[]>;
  permissions: Record<string, any>;
  config: { webhookUrl?: string; spreadsheetId?: string };
}

let bridgeState: BridgeData = {
  presence: {},
  timelogs: [],
  users: [],
  attendance: [],
  auditlogs: [],
  tasks: DEFAULT_DESIGNATION_TASKS,
  permissions: DEFAULT_ROLE_PERMISSIONS,
  config: {
    webhookUrl: process.env.APPS_SCRIPT_URL || '',
    spreadsheetId: '',
  },
};

try {
  if (fs.existsSync(SYNC_BRIDGE_FILE)) {
    const raw = fs.readFileSync(SYNC_BRIDGE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      bridgeState = {
        presence: parsed.presence || {},
        timelogs: Array.isArray(parsed.timelogs) ? parsed.timelogs : [],
        users: Array.isArray(parsed.users) ? parsed.users : [],
        attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
        auditlogs: Array.isArray(parsed.auditlogs) ? parsed.auditlogs : [],
        tasks: parsed.tasks || DEFAULT_DESIGNATION_TASKS,
        permissions: parsed.permissions || DEFAULT_ROLE_PERMISSIONS,
        config: parsed.config || { webhookUrl: '', spreadsheetId: '' },
      };
    }
  }
} catch (e) {
  console.warn('[Bridge] Error loading bridge file:', e);
}

let saveDebounceTimer: any = null;
const persistBridgeState = () => {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    try {
      fs.writeFileSync(SYNC_BRIDGE_FILE, JSON.stringify(bridgeState, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[Bridge] Error saving bridge file:', e);
    }
  }, 1000);
};

const cleanStalePresence = () => {
  const now = Date.now();
  let changed = false;
  for (const [userId, p] of Object.entries(bridgeState.presence)) {
    if (p && p.isOnline) {
      const lastHbMs = p.lastHeartbeat ? new Date(p.lastHeartbeat).getTime() : 0;
      const timeoutMs = p.isTracking ? 180000 : 90000;
      if (lastHbMs > 0 && now - lastHbMs > timeoutMs) {
        bridgeState.presence[userId] = {
          ...p,
          isOnline: false,
          status: 'offline',
          isTracking: false,
          isPaused: false,
          currentTask: 'Shift Concluded',
          currentApp: 'None',
        };
        changed = true;
      }
    }
  }
  if (changed) persistBridgeState();
};
setInterval(cleanStalePresence, 10000);

app.get('/api/health', (req, res) => {
  cleanStalePresence();
  const onlineCount = Object.values(bridgeState.presence).filter((p: any) => p?.isOnline).length;
  const trackingCount = Object.values(bridgeState.presence).filter((p: any) => p?.isOnline && p?.isTracking).length;
  res.json({
    status: 'ok',
    app: 'LLC-Time-Tracker-V2',
    serverTime: new Date().toISOString(),
    onlineUsers: onlineCount,
    trackingUsers: trackingCount,
    totalRegisteredUsers: bridgeState.users.length,
    timelogsCount: bridgeState.timelogs.length,
  });
});

app.post('/api/auth/login', (req, res) => {
  const { usernameOrCode, password } = req.body || {};
  if (!usernameOrCode || !password) {
    return res.status(400).json({ success: false, error: 'Username/Code and password are required' });
  }
  const query = String(usernameOrCode).trim().toLowerCase();
  const cleanDigits = query.replace(/\D/g, '');
  const foundUser = bridgeState.users.find((u) => {
    const uCode = String(u.employeeCode || '').toLowerCase();
    const uUser = String(u.username || '').toLowerCase();
    const uDigits = uCode.replace(/\D/g, '');
    if (uCode === query || uUser === query) return true;
    if (cleanDigits && uDigits && uDigits === cleanDigits) return true;
    if (u.id?.toLowerCase() === query || u.email?.toLowerCase() === query) return true;
    return false;
  });

  if (!foundUser) {
    if (query === 'admin' || query === 'superadmin') {
      const defaultAdmin = {
        id: 'usr-superadmin-red',
        name: 'Admin',
        username: 'admin',
        employeeCode: 'SuperAdmin',
        email: 'admin@llc.com',
        role: 'admin',
        designation: 'Admin',
        mustChangePassword: false,
      };
      if (password === 'AdminpassW0rd123!' || password === 'Password123!') {
        return res.json({
          success: true,
          user: defaultAdmin,
          mustChangePassword: false,
          isPasswordChanged: 'YES',
        });
      }
    }
    return res.status(401).json({ success: false, error: `Account not found for "${usernameOrCode}"` });
  }

  const isRootAdmin =
    foundUser.role === 'admin' ||
    foundUser.employeeCode?.toLowerCase() === 'superadmin' ||
    foundUser.id === 'usr-superadmin-red';

  const storedHash = foundUser.passwordHash || (foundUser.password ? hashPassword(foundUser.password) : '');
  const isPwChanged = foundUser.isPasswordChanged === 'YES';

  let isValid = false;
  if (isPwChanged) {
    isValid = verifyPassword(password, storedHash) || (foundUser.password ? password === foundUser.password : false);
  } else {
    isValid =
      password === 'Password123!' ||
      verifyPassword(password, storedHash) ||
      (foundUser.password ? password === foundUser.password : false) ||
      (isRootAdmin && (password === 'AdminpassW0rd123!' || password === 'AdminpassWord123!' || password === 'SUPERADMIN2026'));
  }

  if (!isValid) {
    return res.status(401).json({ success: false, error: 'Incorrect password.' });
  }

  const mustChange = !isRootAdmin && (!isPwChanged || password === 'Password123!' || foundUser.mustChangePassword);

  res.json({
    success: true,
    user: sanitizeUser(foundUser),
    mustChangePassword: !!mustChange,
    isPasswordChanged: isPwChanged ? 'YES' : 'NO',
  });
});

app.post('/api/auth/change-password', (req, res) => {
  const { userId, newPassword } = req.body || {};
  if (!userId || !newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    return res.status(400).json({ success: false, error: 'Valid userId and new password (min 6 characters) are required.' });
  }
  const trimmed = newPassword.trim();
  const userIdx = bridgeState.users.findIndex((u) => u.id === userId);
  if (userIdx === -1) {
    return res.status(404).json({ success: false, error: 'User account not found.' });
  }
  const newHash = hashPassword(trimmed);
  const existing = bridgeState.users[userIdx];
  const updatedUser = {
    ...existing,
    passwordHash: newHash,
    isPasswordChanged: 'YES' as const,
    mustChangePassword: false,
  };
  delete updatedUser.password;
  bridgeState.users[userIdx] = updatedUser;
  persistBridgeState();

  res.json({
    success: true,
    message: 'Password successfully updated.',
    user: sanitizeUser(updatedUser),
  });
});

app.get('/api/tasks', (req, res) => {
  res.json(bridgeState.tasks || DEFAULT_DESIGNATION_TASKS);
});

app.post('/api/tasks', (req, res) => {
  if (req.body && typeof req.body === 'object') {
    bridgeState.tasks = { ...bridgeState.tasks, ...req.body };
    persistBridgeState();
    return res.json({ success: true, tasks: bridgeState.tasks });
  }
  res.status(400).json({ error: 'Invalid tasks payload' });
});

app.get('/api/permissions', (req, res) => {
  res.json(bridgeState.permissions || DEFAULT_ROLE_PERMISSIONS);
});

app.post('/api/permissions', (req, res) => {
  if (req.body && typeof req.body === 'object') {
    bridgeState.permissions = { ...bridgeState.permissions, ...req.body };
    persistBridgeState();
    return res.json({ success: true, permissions: bridgeState.permissions });
  }
  res.status(400).json({ error: 'Invalid permissions payload' });
});

app.get('/api/config', (req, res) => {
  res.json(bridgeState.config);
});

app.post('/api/config', (req, res) => {
  if (req.body && typeof req.body === 'object') {
    bridgeState.config = {
      ...bridgeState.config,
      ...req.body,
    };
    persistBridgeState();
  }
  res.json({ success: true, config: bridgeState.config });
});

app.get('/api/presence', (req, res) => {
  cleanStalePresence();
  res.json({ success: true, presence: Object.values(bridgeState.presence) });
});

app.post('/api/presence', (req, res) => {
  const p = req.body;
  if (!p || !p.userId) {
    return res.status(400).json({ error: 'Missing userId in presence payload' });
  }
  const existing = bridgeState.presence[p.userId] || {};
  bridgeState.presence[p.userId] = {
    ...existing,
    ...p,
    lastHeartbeat: p.lastHeartbeat || new Date().toISOString(),
  };
  persistBridgeState();
  res.json({ success: true, presence: bridgeState.presence[p.userId] });
});

app.get('/api/timelogs', (req, res) => {
  res.json({ success: true, timeLogs: bridgeState.timelogs });
});

app.post('/api/timelogs', (req, res) => {
  const incoming = req.body;
  if (Array.isArray(incoming)) {
    const map = new Map<string, any>(bridgeState.timelogs.map((l) => [l.id, l]));
    for (const rawLog of incoming) {
      if (rawLog && rawLog.id) {
        map.set(rawLog.id, rawLog);
      }
    }
    bridgeState.timelogs = Array.from(map.values());
    persistBridgeState();
    return res.json({ success: true, count: bridgeState.timelogs.length });
  } else if (incoming && incoming.id) {
    const map = new Map<string, any>(bridgeState.timelogs.map((l) => [l.id, l]));
    map.set(incoming.id, incoming);
    bridgeState.timelogs = Array.from(map.values());
    persistBridgeState();
    return res.json({ success: true, log: incoming });
  }
  res.status(400).json({ error: 'Invalid timelog payload' });
});

app.get('/api/users', (req, res) => {
  const sanitized = bridgeState.users.map((u) => sanitizeUser(u));
  res.json(sanitized);
});

app.post('/api/users', (req, res) => {
  const incoming = req.body;
  if (Array.isArray(incoming)) {
    const map = new Map<string, any>(bridgeState.users.map((u) => [u.id, u]));
    for (const rawU of incoming) {
      if (rawU && rawU.id) {
        map.set(rawU.id, rawU);
      }
    }
    bridgeState.users = Array.from(map.values());
    persistBridgeState();
    return res.json({ success: true, count: bridgeState.users.length });
  } else if (incoming && incoming.id) {
    const map = new Map<string, any>(bridgeState.users.map((u) => [u.id, u]));
    map.set(incoming.id, incoming);
    bridgeState.users = Array.from(map.values());
    persistBridgeState();
    return res.json({ success: true, user: sanitizeUser(incoming) });
  }
  res.status(400).json({ error: 'Invalid user payload' });
});

app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        watch: {
          ignored: ['**/.sync_bridge.json'],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LLC-Time-Tracker-V2 Central Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
