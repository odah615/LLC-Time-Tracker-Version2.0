import { User } from '../types';

export const capitalizeWords = (str: string): string => {
  if (!str) return '';
  return str
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
};

export const CANONICAL_EMPLOYEE_DIRECTORY: Record<string, { name: string; username: string; email: string; role: 'admin' | 'trainer' | 'agent' | 'team_lead'; designation: string }> = {
  'SUPERADMIN': { name: 'Admin', username: 'admin', email: 'admin@llc.com', role: 'admin', designation: 'Admin' },
  'LLC-0003': { name: 'Pia', username: 'trainer', email: 'piaodahcam@gmail.com', role: 'trainer', designation: 'Trainer' },
  'LLC-0023': { name: 'Juan David', username: 'jdavid', email: 'jdavid@gmail.com', role: 'agent', designation: 'Outbound Agent' },
};

/**
 * Resolves a user's canonical Full Name and verified details by checking
 * employee code, username, ID, or email against the authoritative roster.
 */
export const resolveCanonicalEmployee = (input?: {
  employeeCode?: string;
  name?: string;
  username?: string;
  email?: string;
  id?: string;
} | string | null): { code: string; name: string; username: string; email: string; role: 'admin' | 'trainer' | 'agent' | 'team_lead'; designation: string } | null => {
  if (!input) return null;
  let rawCode = '';
  let rawUser = '';
  let rawNameOriginal = '';
  let rawEmail = '';
  let rawId = '';

  if (typeof input === 'string') {
    const s = input.trim();
    if (/^LLC[-_]?\d+/i.test(s)) {
      rawCode = s.toUpperCase();
    } else if (s.includes('@')) {
      rawEmail = s.toLowerCase();
    } else {
      rawUser = s.toLowerCase();
      rawNameOriginal = s;
      rawId = s.toLowerCase();
    }
  } else {
    rawCode = (input.employeeCode || '').toUpperCase().trim();
    rawUser = (input.username || '').toLowerCase().trim();
    rawNameOriginal = (input.name || '').trim();
    rawEmail = (input.email || '').toLowerCase().trim();
    rawId = (input.id || '').toLowerCase().trim();
  }

  const rawNameLower = rawNameOriginal.toLowerCase();
  const numCode = rawCode.replace(/^[A-Z\-_]+/, '');

  const ALIAS_MAP: Record<string, string> = {
    'pdelin': 'LLC-0003',
  };

  const aliasTarget = ALIAS_MAP[rawUser] || ALIAS_MAP[rawCode.toLowerCase()] || ALIAS_MAP[rawEmail.split('@')[0]];
  if (aliasTarget && CANONICAL_EMPLOYEE_DIRECTORY[aliasTarget]) {
    return { code: aliasTarget, ...CANONICAL_EMPLOYEE_DIRECTORY[aliasTarget] };
  }

  for (const [code, info] of Object.entries(CANONICAL_EMPLOYEE_DIRECTORY)) {
    const infoNum = code.replace(/^[A-Z\-_]+/, '');
    const codeMatch = (rawCode && rawCode === code) || (numCode && infoNum && numCode === infoNum);
    const userMatch = rawUser && rawUser === info.username.toLowerCase();
    const nameMatch = rawNameLower && (rawNameLower === info.name.toLowerCase() || rawNameLower.includes(info.name.toLowerCase()) || info.name.toLowerCase().includes(rawNameLower));
    const emailMatch = rawEmail && rawEmail === info.email.toLowerCase();
    const idMatch = rawId && (rawId.includes(code.toLowerCase()) || rawId.includes(info.username.toLowerCase()));

    if (codeMatch || userMatch || nameMatch || emailMatch || idMatch) {
      return { code, ...info };
    }
  }

  const rawTokens = [rawUser, rawCode.toLowerCase(), rawNameLower].filter(Boolean);
  for (const [code, info] of Object.entries(CANONICAL_EMPLOYEE_DIRECTORY)) {
    const nameLower = info.name.toLowerCase();
    const nameParts = nameLower.split(/\s+/);
    for (const tok of rawTokens) {
      if (tok.length >= 4 && (nameLower.includes(tok) || nameParts.some((p) => p === tok || p.startsWith(tok) || tok.startsWith(p)))) {
        return { code, ...info };
      }
    }
  }

  if (numCode && /^LLC[-_]?\d+/i.test(rawCode)) {
    const cleanCode = `LLC-${numCode.padStart(4, '0')}`;
    const cleanName = capitalizeWords(rawNameOriginal || rawUser || cleanCode);
    const cleanUser = rawUser || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return {
      code: cleanCode,
      name: cleanName,
      username: cleanUser,
      email: rawEmail || `${cleanUser}@llctimetracker.com`,
      role: 'agent',
      designation: 'Outbound Agent',
    };
  }

  if (rawNameOriginal) {
    const cleanName = capitalizeWords(rawNameOriginal);
    const cleanUser = rawUser || cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return {
      code: rawCode || 'LLC-0000',
      name: cleanName,
      username: cleanUser,
      email: rawEmail || `${cleanUser}@llctimetracker.com`,
      role: 'agent',
      designation: 'Outbound Agent',
    };
  }

  return null;
};

/**
 * Generates a clean, unique username from an employee name.
 */
export const generateUniqueUsername = (
  name: string,
  existingUsers: User[] = [],
  excludeUserId?: string
): string => {
  if (!name || !name.trim()) return `user${Math.floor(1000 + Math.random() * 9000)}`;

  const words = name.trim().toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z]/g, '')).filter(Boolean);
  let base = '';
  if (words.length === 0) {
    base = 'user';
  } else if (words.length === 1) {
    base = words[0].slice(0, 5);
  } else {
    const firstName = words[0];
    const lastName = words[words.length - 1];
    const firstInitial = firstName.charAt(0);
    const lastFour = lastName.slice(0, 4);
    base = `${firstInitial}${lastFour}`;
  }

  const takenUsernames = new Set(
    existingUsers
      .filter((u) => !excludeUserId || u.id !== excludeUserId)
      .map((u) => (u.username || '').toLowerCase().trim())
      .filter(Boolean)
  );

  let candidate = base;
  let counter = 1;
  while (takenUsernames.has(candidate)) {
    candidate = `${base}${counter}`;
    counter++;
  }

  return candidate;
};

/**
 * Checks if an employee name or username is a placeholder/dummy name
 */
export const isPlaceholderName = (name?: string, username?: string, employeeCode?: string): boolean => {
  if (!name && !username) return true;
  const cleanName = (name || '').trim();
  const cleanUser = (username || '').trim();
  const cleanCode = (employeeCode || '').trim().toUpperCase();

  if (
    cleanName.toLowerCase() === 'agent_admin' ||
    cleanName.toLowerCase() === 'agent admin' ||
    cleanName.toLowerCase() === 'team_leader1' ||
    cleanName.toLowerCase() === 'team leader 1' ||
    cleanUser.toLowerCase() === 'agentadm' ||
    cleanUser.toLowerCase() === 'teamlead' ||
    cleanCode === 'LLC-0001' ||
    cleanCode === 'LLC-0002'
  ) {
    return true;
  }

  const isGenericAgent = /^Agent[_\s\-]?\d+$/i.test(cleanName) || /^Agent[_\s\-]?\d+$/i.test(cleanUser);
  const isGenericTrainee = /^Trainee[_\s\-]?\d+$/i.test(cleanName) || /^Trainee[_\s\-]?\d+$/i.test(cleanUser);
  const isGenericEmployee = /^Employee[_\s\-]?\d+$/i.test(cleanName) || /^Employee[_\s\-]?LLC/i.test(cleanName);
  const isGenericUser = /^User[_\s\-]?\d+$/i.test(cleanName);

  return isGenericAgent || isGenericTrainee || isGenericEmployee || isGenericUser;
};

/**
 * Universally deduplicates and purges redundant/dummy users
 */
export const deduplicateUsers = (rawUsers: User[]): User[] => {
  if (!Array.isArray(rawUsers) || rawUsers.length === 0) return [];

  const nameMap = new Map<string, number>();
  const codeMap = new Map<string, number>();
  const numCodeMap = new Map<string, number>();
  const emailMap = new Map<string, number>();
  const userMap = new Map<string, number>();
  const idMap = new Map<string, number>();
  const result: User[] = [];

  for (const u of rawUsers) {
    if (!u) continue;

    const isSuperAdmin =
      u.employeeCode?.toLowerCase() === 'superadmin' ||
      u.id === 'usr-superadmin-red' ||
      u.id === 'usr-superadmin-root' ||
      u.email?.toLowerCase() === 'admin@llc.com' ||
      (u.role === 'admin' && (u.name === 'Admin' || u.name === 'Red'));

    if (isSuperAdmin) {
      const existingAdminIdx = result.findIndex(
        (x) => x.employeeCode?.toLowerCase() === 'superadmin' || x.id === 'usr-superadmin-red'
      );
      const canonicalAdmin: User = {
        ...u,
        id: 'usr-superadmin-red',
        employeeCode: 'SuperAdmin',
        email: 'admin@llc.com',
        name: u.name === 'Red' ? 'Red' : 'Admin',
        role: 'admin',
        designation: 'Admin',
        username: u.username || 'admin',
        geoTimezone: u.geoTimezone || 'Asia/Manila',
        geoCity: u.geoCity || 'Manila, Philippines',
        password: u.password || 'AdminpassW0rd123!',
      };

      if (existingAdminIdx >= 0) {
        result[existingAdminIdx] = { ...result[existingAdminIdx], ...canonicalAdmin };
      } else {
        result.unshift(canonicalAdmin);
      }
      continue;
    }

    const isTrainer =
      u.employeeCode?.toUpperCase() === 'LLC-0003' ||
      u.email?.toLowerCase() === 'piaodahcam@gmail.com' ||
      u.id === 'usr-llc-0003' ||
      u.name?.toLowerCase().trim() === 'pia' ||
      (u.designation?.toLowerCase().includes('trainer') && u.role === 'trainer');

    if (isTrainer) {
      const existingTrainerIdx = result.findIndex(
        (x) =>
          x.employeeCode?.toUpperCase() === 'LLC-0003' ||
          x.email?.toLowerCase() === 'piaodahcam@gmail.com' ||
          x.id === 'usr-llc-0003' ||
          x.name?.toLowerCase().trim() === 'pia'
      );
      const canonicalTrainer: User = {
        ...u,
        id: 'usr-llc-0003',
        employeeCode: 'LLC-0003',
        email: 'piaodahcam@gmail.com',
        name: 'Pia',
        role: 'trainer',
        designation: 'Trainer',
        username: 'trainer',
        department: 'Training',
        geoTimezone: u.geoTimezone || 'Asia/Manila',
        geoCity: u.geoCity || 'Manila, Philippines',
      };

      if (existingTrainerIdx >= 0) {
        result[existingTrainerIdx] = { ...result[existingTrainerIdx], ...canonicalTrainer };
      } else {
        result.push(canonicalTrainer);
      }
      continue;
    }

    if (isPlaceholderName(u.name, u.username, u.employeeCode)) {
      continue;
    }

    const originalInputName = u.name ? capitalizeWords(u.name) : '';
    const canonical = resolveCanonicalEmployee(u);
    let effectiveUser: User = { ...u, name: originalInputName || u.name };
    if (canonical) {
      effectiveUser = {
        ...effectiveUser,
        name: originalInputName || canonical.name || effectiveUser.name,
        username: canonical.username || effectiveUser.username,
        employeeCode: canonical.code || effectiveUser.employeeCode,
        email: canonical.email || effectiveUser.email,
        role: u.role || canonical.role,
        designation: u.designation || canonical.designation || 'Outbound Agent',
      };
    }

    const normName = (effectiveUser.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const normCode = (effectiveUser.employeeCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    const numOnlyCode = normCode.replace(/^[A-Z]+/, '');
    const normEmail = (effectiveUser.email || '').toLowerCase().trim();
    const normUsername = (effectiveUser.username || '').toLowerCase().trim();
    const rawId = (effectiveUser.id || '').trim();

    let existingIndex = -1;
    if (normCode && codeMap.has(normCode)) {
      existingIndex = codeMap.get(normCode)!;
    } else if (numOnlyCode && numCodeMap.has(numOnlyCode)) {
      existingIndex = numCodeMap.get(numOnlyCode)!;
    } else if (normUsername && userMap.has(normUsername)) {
      existingIndex = userMap.get(normUsername)!;
    } else if (normEmail && emailMap.has(normEmail)) {
      existingIndex = emailMap.get(normEmail)!;
    } else if (normName && nameMap.has(normName)) {
      existingIndex = nameMap.get(normName)!;
    } else if (rawId && idMap.has(rawId)) {
      existingIndex = idMap.get(rawId)!;
    }

    if (existingIndex >= 0) {
      const existing = result[existingIndex];
      const existingCanon = resolveCanonicalEmployee(existing);
      const rawChosenName = (effectiveUser.name && effectiveUser.name !== effectiveUser.username)
        ? effectiveUser.name
        : (existing.name && existing.name !== existing.username ? existing.name : canonical?.name || existingCanon?.name || '');
      const chosenName = capitalizeWords(rawChosenName);
      const chosenUsername = canonical?.username || existingCanon?.username || effectiveUser.username || existing.username;
      const chosenCode = canonical?.code || existingCanon?.code || effectiveUser.employeeCode || existing.employeeCode;

      const existingHasRealPassword =
        !!existing.password &&
        existing.password.trim() !== '' &&
        existing.password !== 'Password123!';
      const incomingHasRealPassword =
        !!effectiveUser.password &&
        effectiveUser.password.trim() !== '' &&
        effectiveUser.password !== 'Password123!';

      const merged: User = {
        ...existing,
        ...effectiveUser,
        name: chosenName,
        employeeCode: chosenCode,
        username: chosenUsername,
        email: effectiveUser.email || existing.email || canonical?.email || '',
        role: effectiveUser.role || existing.role || 'agent',
        designation: effectiveUser.designation || existing.designation || 'Outbound Agent',
        department: effectiveUser.department || existing.department || 'Operations',
        teamLeaderId: effectiveUser.teamLeaderId !== undefined ? effectiveUser.teamLeaderId : existing.teamLeaderId,
        password:
          existingHasRealPassword
            ? existing.password
            : incomingHasRealPassword
              ? effectiveUser.password
              : 'Password123!',
        passwordHash:
          existing.passwordHash || effectiveUser.passwordHash,
        isPasswordChanged:
          existingHasRealPassword || existing.isPasswordChanged === 'YES' || effectiveUser.isPasswordChanged === 'YES'
            ? 'YES'
            : (existing.isPasswordChanged || effectiveUser.isPasswordChanged || 'NO'),
        mustChangePassword:
          existingHasRealPassword || existing.isPasswordChanged === 'YES' || effectiveUser.isPasswordChanged === 'YES'
            ? false
            : effectiveUser.mustChangePassword !== undefined
              ? effectiveUser.mustChangePassword
              : (existing.mustChangePassword ?? true),
        customPermissions:
          existing.customPermissions || effectiveUser.customPermissions,
        avatar:
          existing.avatar || effectiveUser.avatar,
      };

      result[existingIndex] = merged;
      const mergedName = (merged.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const mergedCode = (merged.employeeCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
      const mergedNumCode = mergedCode.replace(/^[A-Z]+/, '');
      const mergedEmail = (merged.email || '').toLowerCase().trim();
      const mergedUsername = (merged.username || '').toLowerCase().trim();
      const mergedId = (merged.id || '').trim();

      if (mergedName) nameMap.set(mergedName, existingIndex);
      if (mergedCode) codeMap.set(mergedCode, existingIndex);
      if (mergedNumCode) numCodeMap.set(mergedNumCode, existingIndex);
      if (mergedEmail) emailMap.set(mergedEmail, existingIndex);
      if (mergedUsername) userMap.set(mergedUsername, existingIndex);
      if (mergedId) idMap.set(mergedId, existingIndex);
    } else {
      const newIndex = result.length;
      result.push(effectiveUser);
      if (normName) nameMap.set(normName, newIndex);
      if (normCode) codeMap.set(normCode, newIndex);
      if (numOnlyCode) numCodeMap.set(numOnlyCode, newIndex);
      if (normEmail) emailMap.set(normEmail, newIndex);
      if (normUsername) userMap.set(normUsername, newIndex);
      if (rawId) idMap.set(rawId, newIndex);
    }
  }

  return result;
};

/**
 * Validates a plaintext password against a stored plaintext password or PBKDF2 hash.
 */
export const verifyLocalPassword = async (
  password: string,
  storedHashOrPlain?: string
): Promise<boolean> => {
  if (!storedHashOrPlain || !password) return false;
  const trimmed = storedHashOrPlain.trim();
  if (trimmed.startsWith('pbkdf2:')) {
    const parts = trimmed.split(':');
    if (parts.length === 5) {
      const iterations = parseInt(parts[2], 10);
      const saltHex = parts[3];
      const originalHash = parts[4];
      try {
        const enc = new TextEncoder();
        const subtle = typeof window !== 'undefined' && window.crypto?.subtle ? window.crypto.subtle : globalThis.crypto?.subtle;
        if (!subtle) return false;
        const keyMat = await subtle.importKey(
          'raw',
          enc.encode(password),
          { name: 'PBKDF2' },
          false,
          ['deriveBits']
        );
        const derivedBits = await subtle.deriveBits(
          {
            name: 'PBKDF2',
            salt: enc.encode(saltHex),
            iterations,
            hash: 'SHA-512',
          },
          keyMat,
          512
        );
        const computedHex = Array.from(new Uint8Array(derivedBits))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        return computedHex === originalHash;
      } catch {
        return false;
      }
    }
  }
  return trimmed === password;
};

/**
 * Resolves an Assigned Supervisor reference (which may be username, employee code,
 * legacy usr-id, or formatted name) to the authoritative supervisor User record.
 */
export const resolveSupervisor = (
  rawSupervisor: string | undefined | null,
  allUsers: User[]
): User | null => {
  if (!rawSupervisor) return null;
  const raw = String(rawSupervisor).trim();
  if (!raw || raw.toLowerCase() === 'none' || raw.toLowerCase().includes('direct executive') || raw.toLowerCase().includes('executive board')) {
    return null;
  }

  const rawLower = raw.toLowerCase();
  const rawUpper = raw.toUpperCase();

  // 1. Exact match on username
  const byUsername = allUsers.find((u) => u.username && u.username.toLowerCase() === rawLower);
  if (byUsername) return byUsername;

  // 2. Exact match on employeeCode (e.g. LLC-0025, LLC-0003, SuperAdmin)
  const byCode = allUsers.find((u) => u.employeeCode && u.employeeCode.toUpperCase() === rawUpper);
  if (byCode) return byCode;

  // 3. Exact match on ID (e.g. usr-1791811080947, usr-llc-0003, usr-superadmin-red)
  const byId = allUsers.find((u) => u.id === raw);
  if (byId) return byId;

  // 4. Match on name
  const byName = allUsers.find((u) => u.name && u.name.toLowerCase() === rawLower);
  if (byName) return byName;

  // 5. Check if raw contains an employee code (e.g. "LLC-0025" inside a string or "usr-llc-0025")
  const codeMatch = raw.match(/LLC[-_]?\d+/i);
  if (codeMatch) {
    const extracted = codeMatch[0].toUpperCase().replace('_', '-');
    const byExtractedCode = allUsers.find((u) => u.employeeCode && u.employeeCode.toUpperCase() === extracted);
    if (byExtractedCode) return byExtractedCode;
  }

  // 6. Check common legacy IDs
  if (rawLower.includes('superadmin') || rawLower === 'usr-superadmin-red') {
    return allUsers.find((u) => u.role === 'admin' || u.employeeCode?.toUpperCase() === 'SUPERADMIN') || null;
  }
  if (rawLower.includes('usr-llc-0003') || rawLower.includes('pia')) {
    return allUsers.find((u) => u.employeeCode?.toUpperCase() === 'LLC-0003' || u.username === 'trainer') || null;
  }
  if (rawLower.includes('usr-1791811080947') || rawLower.includes('mpolo') || rawLower.includes('marco polo')) {
    return allUsers.find((u) => u.username === 'mpolo' || u.employeeCode?.toUpperCase() === 'LLC-0025') || null;
  }

  return null;
};

/**
 * Returns the canonical username of the assigned supervisor, or empty string if unassigned.
 */
export const getSupervisorUsername = (
  rawSupervisor: string | undefined | null,
  allUsers: User[]
): string => {
  const supervisor = resolveSupervisor(rawSupervisor, allUsers);
  if (supervisor) {
    return supervisor.username || supervisor.name;
  }
  if (!rawSupervisor) return '';
  const clean = String(rawSupervisor).trim();
  if (clean.toLowerCase() === 'none' || clean.toLowerCase().includes('direct') || clean.toLowerCase().includes('executive')) {
    return '';
  }
  return clean;
};

/**
 * Determines whether an employee is assigned to a specific supervisor (or is the supervisor themselves).
 */
export const isEmployeeAssignedToSupervisor = (
  emp: User,
  supervisor: User,
  allUsers: User[]
): boolean => {
  // A supervisor always sees themselves
  if (
    emp.id === supervisor.id ||
    (emp.employeeCode && supervisor.employeeCode && emp.employeeCode.toUpperCase() === supervisor.employeeCode.toUpperCase()) ||
    (emp.username && supervisor.username && emp.username.toLowerCase() === supervisor.username.toLowerCase())
  ) {
    return true;
  }

  if (!emp.teamLeaderId) {
    return false;
  }

  const resolved = resolveSupervisor(emp.teamLeaderId, allUsers);
  if (!resolved) {
    // Fallback: check raw string match against supervisor's identity fields
    const raw = emp.teamLeaderId.trim();
    if (supervisor.username && raw.toLowerCase() === supervisor.username.toLowerCase()) return true;
    if (supervisor.employeeCode && raw.toUpperCase() === supervisor.employeeCode.toUpperCase()) return true;
    if (supervisor.id && raw === supervisor.id) return true;
    if (supervisor.name && raw.toLowerCase() === supervisor.name.toLowerCase()) return true;
    return false;
  }

  return Boolean(
    resolved.id === supervisor.id ||
    (resolved.username && supervisor.username && resolved.username.toLowerCase() === supervisor.username.toLowerCase()) ||
    (resolved.employeeCode && supervisor.employeeCode && resolved.employeeCode.toUpperCase() === supervisor.employeeCode.toUpperCase())
  );
};

/**
 * Normalizes legacy designations to the 5 standardized options.
 */
export const normalizeDesignation = (raw?: string | null): string => {
  if (!raw) return 'Outbound Agent';
  const clean = raw.trim();
  if (/^outbound/i.test(clean)) return 'Outbound Agent';
  if (/^inbound/i.test(clean)) return 'Inbound Agent';
  if (/^team\s*lead/i.test(clean)) return 'Team Leader';
  if (/^trainer/i.test(clean)) return 'Trainer';
  if (/^super\s*admin/i.test(clean) || /^admin/i.test(clean)) return 'Admin';
  if (/^qa/i.test(clean)) return 'QA Specialist';
  if (/^writer/i.test(clean)) return 'Writer';
  if (/^hr/i.test(clean)) return 'HR';
  if (/^payroll/i.test(clean)) return 'Payroll Officer';
  return clean;
};

/**
 * Returns true if an employee's designation is legacy/ambiguous and requires manual review.
 */
export const isAmbiguousLegacyDesignation = (designation?: string | null): boolean => {
  if (!designation) return true;
  const clean = designation.trim();
  return clean === 'Agent' || clean === 'Outbound Agent/Team' || clean === 'Inbound Agent/Team';
};
