import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { User, UserRole, Designation, ALLOWED_DESIGNATIONS } from '../../types';
import { Users, X, Check, Lock, KeyRound, Eye, EyeOff, RefreshCw, Calendar, BadgeCheck } from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';
import { generateUniqueUsername, resolveSupervisor } from '../../lib/userUtils';

interface EmployeeCrudModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingUser: User | null;
}

export const getNextEmployeeCode = (existingUsers: User[]): string => {
  let maxNum = 0;
  existingUsers.forEach((u) => {
    if (!u.employeeCode) return;
    const clean = u.employeeCode.replace(/^#/, '').trim();
    const match = clean.match(/(?:LLC-?|#)?(\d+)/i);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });
  const nextNum = maxNum + 1;
  return `LLC-${nextNum.toString().padStart(4, '0')}`;
};

export const EmployeeCrudModal: React.FC<EmployeeCrudModalProps> = ({
  isOpen,
  onClose,
  editingUser,
}) => {
  const { users, addUser, updateUser, currentUser, addAuditLog, designationList } = useApp();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>('agent');
  const [designation, setDesignation] = useState<string>('Outbound Agent');
  const [monthlyRate, setMonthlyRate] = useState<number>(0);
  const [geoCity, setGeoCity] = useState('Manila, Philippines');
  const [geoTimezone, setGeoTimezone] = useState('Asia/Manila');
  const [employeeCode, setEmployeeCode] = useState('LLC-0001');
  const [joinDate, setJoinDate] = useState('2020-01-01');
  const [teamLeaderId, setTeamLeaderId] = useState<string>('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [avatar, setAvatar] = useState(
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250'
  );

  const getSelectedSupervisorValue = (tlId?: string) => {
    if (!tlId) return '';
    const resolved = resolveSupervisor(tlId, users);
    if (resolved) {
      return resolved.username || resolved.id;
    }
    return tlId;
  };

  const allowedDesignationOptions = Array.from(
    new Set([...ALLOWED_DESIGNATIONS, ...(designationList || []), designation].filter(Boolean))
  );

  const eligibleSupervisors = users.filter((u) => {
    if (u.isSecretBackup) return false;
    const r = (u.role || '').toLowerCase();
    const d = (u.designation || '').toLowerCase();
    const isLead = r === 'team_lead' || d.includes('team lead') || d.includes('team leader');
    const isTrainer = r === 'trainer' || d.includes('trainer');
    const isAdmin = r === 'admin' || r === 'va_admin' || d.includes('admin');
    return isLead || isTrainer || isAdmin;
  });

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let pass = 'LLC-';
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(pass);
  };

  useEffect(() => {
    if (editingUser) {
      setName(editingUser.name);
      setUsername(
        editingUser.username ||
          generateUniqueUsername(editingUser.name, users, editingUser.id)
      );
      setEmail(editingUser.email);
      setPassword(editingUser.password || 'Password123!');
      setRole(editingUser.role);
      setDesignation(editingUser.designation || 'Outbound Agent');
      setMonthlyRate(editingUser.monthlyRate !== undefined ? editingUser.monthlyRate : 0);
      setGeoCity(editingUser.geoCity || 'Manila, Philippines');
      setGeoTimezone(editingUser.geoTimezone || 'Asia/Manila');
      setEmployeeCode(editingUser.employeeCode);
      setJoinDate(editingUser.joinDate || '2020-01-01');
      setTeamLeaderId(getSelectedSupervisorValue(editingUser.teamLeaderId));
      setStatus(editingUser.status || 'active');
      setAvatar(editingUser.avatar);
    } else {
      setName('');
      setUsername('');
      setEmail('');
      setPassword('Password123!');
      setRole('agent');
      setDesignation('Outbound Agent');
      setMonthlyRate(0);
      setGeoCity('Manila, Philippines');
      setGeoTimezone('Asia/Manila');
      setEmployeeCode(getNextEmployeeCode(users));
      setJoinDate('2020-01-01');
      setTeamLeaderId('');
      setStatus('active');
      setAvatar(
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250'
      );
    }
  }, [editingUser, isOpen, users]);

  const isEditingSuperAdmin = editingUser
    ? editingUser.employeeCode?.toLowerCase() === 'superadmin' ||
      editingUser.id === 'usr-superadmin-red' ||
      editingUser.id === 'usr-superadmin-root' ||
      editingUser.email === 'admin@llc.com' ||
      (editingUser.role === 'admin' && editingUser.employeeCode === 'SuperAdmin')
    : false;

  const [showConfirm, setShowConfirm] = useState(false);

  if (!isOpen) return null;

  const executeSave = () => {
    const mRate = Number(monthlyRate) >= 0 ? Number(monthlyRate) : 0;
    const calcHourly = mRate > 0 ? Number((mRate / 160).toFixed(2)) : 0;
    const finalJoinDate = joinDate.trim() || '2020-01-01';
    const finalRole = isEditingSuperAdmin ? 'admin' : role;
    const finalDesignation = isEditingSuperAdmin ? 'Admin' : designation;
    const finalEmployeeCode = isEditingSuperAdmin ? 'SuperAdmin' : (employeeCode.trim() || getNextEmployeeCode(users));
    const finalUsername = isEditingSuperAdmin
      ? 'admin'
      : (username.trim().toLowerCase() || generateUniqueUsername(name, users, editingUser?.id));

    if (editingUser) {
      updateUser(editingUser.id, {
        name,
        username: finalUsername,
        email,
        role: finalRole,
        designation: finalDesignation,
        monthlyRate: mRate,
        hourlyRate: calcHourly,
        geoCity,
        geoTimezone,
        employeeCode: finalEmployeeCode,
        joinDate: finalJoinDate,
        teamLeaderId: isEditingSuperAdmin ? undefined : teamLeaderId || undefined,
        status,
        avatar,
      });
      addAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        category: 'Employee Updated',
        targetEmployeeId: editingUser.id,
        targetEmployeeName: name,
        fromValue: editingUser.role,
        toValue: finalRole,
        details: `Updated employee record for ${name} (@${finalUsername} / ${finalEmployeeCode}). Hired: ${finalJoinDate}. Profile synchronized.`,
      });
    } else {
      addUser({
        name,
        username: finalUsername,
        email,
        role: finalRole,
        designation: finalDesignation,
        monthlyRate: mRate,
        hourlyRate: calcHourly,
        geoCity,
        geoTimezone,
        employeeCode: finalEmployeeCode,
        teamLeaderId: teamLeaderId || undefined,
        status,
        avatar,
        joinDate: finalJoinDate,
        screenshotMonitored: false,
        activityMonitored: false,
        department: finalDesignation.includes('Sales')
          ? 'Sales & Outreach'
          : finalDesignation.includes('QA')
          ? 'Quality Assurance'
          : finalDesignation.includes('HR')
          ? 'Human Resources'
          : finalDesignation.includes('Payroll')
          ? 'Finance & Payroll'
          : 'Operations',
      });
      addAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        category: 'Employee Added',
        targetEmployeeName: name,
        fromValue: 'Unregistered',
        toValue: `${role.toUpperCase()} (${designation})`,
        details: `Registered new employee ${name} (@${finalUsername} / ${finalEmployeeCode}) as ${designation}. Date Hired: ${finalJoinDate}. Assigned initial credentials.`,
      });
    }

    setShowConfirm(false);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;
    setShowConfirm(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-slate-800">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            {editingUser ? 'Edit Employee Details' : 'Add New Employee / Team Member'}
          </h3>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Full Name</label>
              <input
                type="text"
                placeholder="e.g. Juan David"
                value={name}
                onChange={(e) => {
                  const val = e.target.value;
                  setName(val);
                  if (!editingUser) {
                    setUsername(generateUniqueUsername(val, users));
                  }
                }}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Email Address (Login)</label>
              <input
                type="email"
                placeholder="user@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-700 font-semibold flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-blue-600" /> Username (Login ID)
                </label>
                <button
                  type="button"
                  onClick={() => setUsername(generateUniqueUsername(name, users, editingUser?.id))}
                  className="text-[11px] text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Auto
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-xs">@</span>
                <input
                  type="text"
                  placeholder="e.g. jdavid or jdavi"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 pl-7 focus:ring-2 focus:ring-blue-500 font-mono font-bold text-xs"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center gap-1.5">
                <BadgeCheck className="w-3.5 h-3.5 text-blue-600" /> Employee Code
              </label>
              <input
                type="text"
                placeholder="e.g. LLC-0001"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-slate-700 font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-blue-600" /> Account Login Password
              </label>
              <button
                type="button"
                onClick={generateRandomPassword}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Auto-Generate
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Assign login password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 pr-10 focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                <span>System Role</span>
                {isEditingSuperAdmin && (
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Locked
                  </span>
                )}
              </label>
              <select
                value={isEditingSuperAdmin ? 'admin' : role}
                disabled={isEditingSuperAdmin}
                onChange={(e) => {
                  const newRole = e.target.value as UserRole;
                  setRole(newRole);
                  if (newRole === 'agent') setDesignation('Agent');
                  else if (newRole === 'team_lead') setDesignation('Team Leader');
                  else if (newRole === 'trainer') setDesignation('Trainer');
                  else if (newRole === 'qa') setDesignation('QA Specialist');
                  else if (newRole === 'writer') setDesignation('Writer');
                  else if (newRole === 'hr') setDesignation('HR');
                  else if (newRole === 'payroll') setDesignation('Payroll Officer');
                  else if (newRole === 'va_admin') setDesignation('Admin');
                  else if (newRole === 'admin') setDesignation('Admin');
                }}
                className={`w-full border rounded-xl p-2.5 font-medium transition-all ${
                  isEditingSuperAdmin
                    ? 'bg-slate-100/90 border-slate-300 text-slate-500 cursor-not-allowed select-none shadow-none font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500'
                }`}
              >
                <option value="agent">Agent</option>
                <option value="team_lead">Team Leader</option>
                <option value="trainer">Trainer</option>
                <option value="qa">QA Specialist</option>
                <option value="writer">Writer</option>
                <option value="hr">HR</option>
                <option value="payroll">Payroll Officer</option>
                <option value="va_admin">VA Admin</option>
                <option value="admin">Main Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center justify-between">
                <span>Designation</span>
                {isEditingSuperAdmin && (
                  <span className="text-[10px] text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> Locked
                  </span>
                )}
              </label>
              <select
                value={isEditingSuperAdmin ? 'Admin' : designation}
                disabled={isEditingSuperAdmin}
                onChange={(e) => setDesignation(e.target.value)}
                className={`w-full border rounded-xl p-2.5 font-medium transition-all ${
                  isEditingSuperAdmin
                    ? 'bg-slate-100/90 border-slate-300 text-slate-500 cursor-not-allowed select-none shadow-none font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500'
                }`}
              >
                {allowedDesignationOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Assigned Team Leader / Supervisor</label>
              <select
                value={isEditingSuperAdmin ? '' : getSelectedSupervisorValue(teamLeaderId)}
                disabled={isEditingSuperAdmin}
                onChange={(e) => setTeamLeaderId(e.target.value)}
                className={`w-full border rounded-xl p-2.5 font-medium transition-all ${
                  isEditingSuperAdmin
                    ? 'bg-slate-100 border-slate-300 text-slate-400 cursor-not-allowed select-none'
                    : 'bg-slate-50 border-slate-200 text-slate-800 focus:ring-2 focus:ring-blue-500'
                }`}
              >
                <option value="">{isEditingSuperAdmin ? 'Executive Board (No Supervisor)' : 'None / Direct Executive'}</option>
                {!isEditingSuperAdmin &&
                  eligibleSupervisors.map((tl) => (
                    <option key={tl.id} value={tl.username || tl.id}>
                      {tl.name} ({tl.designation || (tl.role === 'admin' ? 'Admin' : tl.role === 'team_lead' ? 'Team Leader' : 'Trainer')})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Employment Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Monthly Rate (PHP)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={monthlyRate}
                onChange={(e) => setMonthlyRate(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-600" /> Date Hired
              </label>
              <input
                type="date"
                value={joinDate}
                onChange={(e) => setJoinDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-mono font-medium"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" /> {editingUser ? 'Save Changes' : 'Create Employee'}
            </button>
          </div>
        </form>

        <ConfirmationModal
          isOpen={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={executeSave}
          title={editingUser ? 'Confirm Employee Information Update' : 'Confirm New Employee Creation'}
          description={
            editingUser
              ? `Are you sure you want to save modifications to the employee profile for ${name}?`
              : `Are you sure you want to register ${name} (${role.toUpperCase()}) into the organization system?`
          }
          employeeName={name}
          employeeCode={employeeCode}
          fromValue={editingUser ? editingUser.role.toUpperCase() : 'New Account'}
          toValue={role.toUpperCase()}
          confirmText={editingUser ? 'Yes, Save Changes' : 'Yes, Create Employee'}
          variant="info"
        />
      </div>
    </div>
  );
};
