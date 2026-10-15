import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { RolePermissions, User } from '../../types';
import { UserAvatar } from '../UserAvatar';
import {
  Shield,
  ShieldCheck,
  X,
  Users,
  UserCheck,
  Settings,
  Eye,
  Camera,
  Activity,
  DollarSign,
  Layers,
  FileSpreadsheet,
  Zap,
  Sparkles,
  Search,
  Plus,
  Trash2,
  AlertCircle,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RolePermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PermissionDefinition {
  key: keyof RolePermissions;
  label: string;
  description: string;
  icon: any;
  color: string;
}

const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: 'canEditEmployees',
    label: 'Employee Directory CRUD',
    description: 'Add new employees, edit personal info, credentials, and delete profiles',
    icon: Users,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
  },
  {
    key: 'canAssignTeamLeader',
    label: 'Team Leader Assignment',
    description: 'Assign or reassign team leaders and trainers to agents',
    icon: UserCheck,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
  },
  {
    key: 'canViewActivityLogs',
    label: 'Activity Monitors',
    description: 'View real-time hardware activity, mouse/keyboard metrics, and active window titles',
    icon: Activity,
    color: 'text-amber-600 bg-amber-50 border-amber-200',
  },
  {
    key: 'canViewScreenshots',
    label: 'Screenshot Captures',
    description: 'View automated desktop screenshot timelines and blurred screen captures',
    icon: Camera,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
  },
  {
    key: 'canViewTimesheets',
    label: 'Timesheets & Approvals',
    description: 'View team time logs, audit shifts, and approve manual time & leave requests',
    icon: Eye,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  },
  {
    key: 'canViewPayroll',
    label: 'Payroll & Rates',
    description: 'Access payroll calculations, hourly rates, deductions, and payouts',
    icon: DollarSign,
    color: 'text-teal-600 bg-teal-50 border-teal-200',
  },
  {
    key: 'canManageTasks',
    label: 'Designation & Task Manager',
    description: 'Create and edit designations and configure custom task options',
    icon: Layers,
    color: 'text-cyan-600 bg-cyan-50 border-cyan-200',
  },
  {
    key: 'canSyncSheets',
    label: 'Google Sheets & Webhooks',
    description: 'Configure central Google Apps Script integration and trigger sync',
    icon: FileSpreadsheet,
    color: 'text-rose-600 bg-rose-50 border-rose-200',
  },
];

interface StandardRole {
  id: string;
  label: string;
  badge: string;
  isCustom?: boolean;
}

const BASE_ROLES: StandardRole[] = [
  { id: 'trainer', label: 'Trainer', badge: 'Manager Rights' },
  { id: 'team_lead', label: 'Team Leader', badge: 'Supervisor' },
  { id: 'admin', label: 'Admin', badge: 'Full Admin' },
  { id: 'qa', label: 'QA Specialist', badge: 'Audit & Reviews' },
  { id: 'writer', label: 'Writer', badge: 'Content Staff' },
  { id: 'hr', label: 'HR', badge: 'Personnel' },
  { id: 'payroll', label: 'Payroll Officer', badge: 'Finance' },
  { id: 'agent', label: 'Agent', badge: 'Standard User' },
];

export const RolePermissionsModal: React.FC<RolePermissionsModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    users,
    rolePermissions,
    updateRolePermission,
    updateUserCustomPermission,
    resetUserCustomPermissions,
    addRoleCategory,
    deleteRoleCategory,
    hasPermission,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles');
  const [selectedRole, setSelectedRole] = useState<string>('trainer');
  const [selectedUserId, setSelectedUserId] = useState<string>(
    users.find((u) => u.role === 'trainer')?.id || users[0]?.id || ''
  );
  const [searchUserQuery, setSearchUserQuery] = useState<string>('');

  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleBadge, setNewRoleBadge] = useState('Custom Role');
  const [newRoleTemplate, setNewRoleTemplate] = useState<string>('agent');

  const [confirmPrompt, setConfirmPrompt] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    confirmVariant?: 'danger' | 'primary' | 'warning';
    onConfirm: () => void;
  } | null>(null);

  if (!isOpen) return null;

  const isSuperAdmin =
    currentUser.employeeCode?.toLowerCase() === 'superadmin' ||
    currentUser.id === 'usr-superadmin-red' ||
    currentUser.id === 'usr-superadmin-root' ||
    currentUser.email === 'admin@llc.com';

  if (!isSuperAdmin) {
    return (
      <div
        id="role-permissions-modal"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto mb-3">
            <Shield className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-base text-slate-900">Super Admin Access Only</h3>
          <p className="text-xs text-slate-500 mt-1">
            Designation and Permissions Control is restricted exclusively to the Super Admin.
          </p>
          <button
            onClick={onClose}
            className="mt-5 w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const allRoles: StandardRole[] = [
    ...BASE_ROLES,
    ...Object.keys(rolePermissions)
      .filter((k) => !BASE_ROLES.some((br) => br.id.toLowerCase() === k.toLowerCase()))
      .map((k) => ({
        id: k,
        label: k.charAt(0).toUpperCase() + k.slice(1),
        badge: 'Custom Category',
        isCustom: true,
      })),
  ];

  const currentRoleObj = allRoles.find((r) => r.id === selectedRole) || {
    id: selectedRole,
    label: selectedRole,
    badge: 'Role',
  };

  const assignedEmployeesForRole = users.filter((u) => {
    const roleMatch = u.role?.toLowerCase() === selectedRole.toLowerCase();
    const desigMatch = u.designation?.toLowerCase() === currentRoleObj.label.toLowerCase() ||
      u.designation?.toLowerCase() === selectedRole.toLowerCase();
    return roleMatch || desigMatch;
  });

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.employeeCode.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.designation.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchUserQuery.toLowerCase())
  );

  const handleGrantTrainerPreset = () => {
    setConfirmPrompt({
      isOpen: true,
      title: 'Apply Manager Rights Preset to Trainer?',
      message:
        'This will grant the Trainer role full Employee Directory CRUD, Team Leader assignment, Screenshot & Activity monitoring, Timesheet approvals, and Task management powers. This change will be logged to Audit Logs and synchronized immediately to the Google Sheets Database.',
      confirmLabel: 'Apply Preset & Sync',
      confirmVariant: 'primary',
      onConfirm: () => {
        updateRolePermission('trainer', 'canEditEmployees', true);
        updateRolePermission('trainer', 'canAssignTeamLeader', true);
        updateRolePermission('trainer', 'canViewActivityLogs', true);
        updateRolePermission('trainer', 'canViewScreenshots', true);
        updateRolePermission('trainer', 'canViewTimesheets', true);
        updateRolePermission('trainer', 'canManageTasks', true);
        setConfirmPrompt(null);
      },
    });
  };

  const handleCreateRoleCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newRoleName.trim();
    if (!trimmed) return;
    const templatePerms = rolePermissions[newRoleTemplate] || {};
    addRoleCategory(trimmed, templatePerms);
    setSelectedRole(trimmed);
    setNewRoleName('');
    setShowAddRoleModal(false);
  };

  const handleDeleteRolePrompt = (role: StandardRole) => {
    const userCount = users.filter((u) => {
      const roleMatch = u.role?.toLowerCase() === role.id.toLowerCase();
      const desigMatch =
        u.designation?.toLowerCase() === role.label.toLowerCase() ||
        u.designation?.toLowerCase() === role.id.toLowerCase();
      return roleMatch || desigMatch;
    }).length;

    const warningNotice =
      userCount > 0
        ? ` Note: There are currently ${userCount} employee(s) assigned to this role; they will continue to have standard base access.`
        : '';

    setConfirmPrompt({
      isOpen: true,
      title: `Delete Role / Category "${role.label}"?`,
      message: `Are you sure you want to delete this role/category? Its permission matrix will be permanently deleted.${warningNotice} This action will be automatically recorded in Audit Logs and updated in your Google Spreadsheet Database.`,
      confirmLabel: 'Delete Role & Sync',
      confirmVariant: 'danger',
      onConfirm: () => {
        deleteRoleCategory(role.id);
        if (selectedRole === role.id) {
          setSelectedRole('trainer');
        }
        setConfirmPrompt(null);
      },
    });
  };

  const handleResetUserPrompt = (target: User) => {
    setConfirmPrompt({
      isOpen: true,
      title: `Reset Overrides for ${target.name}?`,
      message: `This will clear all individual custom permission overrides and restore this employee to their base designation defaults. This change will be logged in Audit Logs and synchronized to the Google Sheets Database.`,
      confirmLabel: 'Reset to Defaults & Sync',
      confirmVariant: 'warning',
      onConfirm: () => {
        resetUserCustomPermissions(target.id);
        setConfirmPrompt(null);
      },
    });
  };

  return (
    <div
      id="designation-permissions-control-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800"
      >
        <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base text-white">
                  Designation and Permissions Control
                </h2>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                  Super Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Configure role/category permissions matrices and manage granular individual user overrides
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('roles')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'roles'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Roles & Categories ({allRoles.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'users'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Individual Employee Overrides ({users.length})</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'roles' && (
              <>
                <button
                  onClick={() => setShowAddRoleModal(true)}
                  className="text-xs px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-300 font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5 text-indigo-600" />
                  <span>+ Add Role / Category</span>
                </button>
                <button
                  onClick={handleGrantTrainerPreset}
                  className="text-xs px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm"
                  title="Grant Trainer role full Employee CRUD, Team Leader assignment, and Screenshot/Activity monitoring rights"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
                  <span>Preset: Grant Trainer Full Manager Powers</span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden min-h-[460px]">
          <div className="md:col-span-4 border-r border-slate-200 bg-slate-50 flex flex-col p-4 space-y-3 overflow-y-auto">
            {activeTab === 'roles' ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                    Select Role / Category
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-200/70 px-2 py-0.5 rounded-full">
                    {allRoles.length} total
                  </span>
                </div>
                <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
                  {allRoles.map((r) => {
                    const isSelected = r.id === selectedRole;
                    const userCount = users.filter((u) => {
                      const roleMatch = u.role?.toLowerCase() === r.id.toLowerCase();
                      const desigMatch = u.designation?.toLowerCase() === r.label.toLowerCase() ||
                        u.designation?.toLowerCase() === r.id.toLowerCase();
                      return roleMatch || desigMatch;
                    }).length;
                    return (
                      <div
                        key={r.id}
                        onClick={() => setSelectedRole(r.id)}
                        className={`p-3 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center justify-between group ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
                        }`}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold">{r.label}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                                isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {userCount} {userCount === 1 ? 'user' : 'users'}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] ${
                              isSelected ? 'text-indigo-200' : 'text-slate-400'
                            }`}
                          >
                            key: {r.id}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                              isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {r.badge}
                          </span>
                          {r.isCustom ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRolePrompt(r);
                              }}
                              className={`p-1.5 rounded-lg transition-all ${
                                isSelected
                                  ? 'hover:bg-red-500 text-indigo-200 hover:text-white bg-indigo-700/60'
                                  : 'hover:bg-red-50 text-slate-400 hover:text-red-600 bg-slate-50 border border-slate-200/60'
                              }`}
                              title={`Delete custom role "${r.label}"`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            r.id !== 'admin' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteRolePrompt(r);
                                }}
                                className={`p-1.5 rounded-lg transition-all opacity-40 hover:opacity-100 ${
                                  isSelected
                                    ? 'hover:bg-red-500 text-indigo-200 hover:text-white'
                                    : 'hover:bg-red-50 text-slate-400 hover:text-red-600'
                                }`}
                                title={`Delete / remove role category "${r.label}"`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    Select Employee ({filteredUsers.length})
                  </span>
                </div>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search employee name, designation, code..."
                    value={searchUserQuery}
                    onChange={(e) => setSearchUserQuery(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1 overflow-y-auto flex-1 pr-1">
                  {filteredUsers.map((u) => {
                    const isSelected = u.id === selectedUserId;
                    const hasOverrides = u.customPermissions && Object.keys(u.customPermissions).length > 0;
                    return (
                      <div
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className={`p-2.5 rounded-xl text-xs font-semibold cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-200/70 border border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <UserAvatar name={u.name} role={u.role} size="xs" />
                          <div className="truncate">
                            <span className="font-bold truncate block">{u.name}</span>
                            <span
                              className={`text-[10px] block ${
                                isSelected ? 'text-indigo-200' : 'text-slate-500'
                              }`}
                            >
                              {u.designation} (#{u.employeeCode})
                            </span>
                          </div>
                        </div>
                        {hasOverrides && (
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                              isSelected ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-800 border border-amber-200'
                            }`}
                            title="This employee has custom permission overrides"
                          >
                            Override
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          <div className="md:col-span-8 flex flex-col p-6 space-y-4 overflow-y-auto bg-white">
            {activeTab === 'roles' ? (
              <>
                <div className="pb-3 border-b border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                        <span>Role Permissions Matrix:</span>
                        <span className="text-indigo-600 font-extrabold text-base">
                          {currentRoleObj.label}
                        </span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-mono font-bold">
                          {currentRoleObj.badge}
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        These permissions automatically apply to all employees assigned to this role or designation.
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Assigned Employees ({assignedEmployeesForRole.length})</span>
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Automatically detected from system directory
                      </span>
                    </div>
                    {assignedEmployeesForRole.length === 0 ? (
                      <div className="p-2.5 bg-white border border-dashed border-slate-300 rounded-lg text-center text-slate-400 text-xs">
                        <p className="italic">No employees currently assigned to this role / designation.</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto pr-1">
                        {assignedEmployeesForRole.map((emp) => {
                          const hasCustom = emp.customPermissions && Object.keys(emp.customPermissions).length > 0;
                          return (
                            <div
                              key={emp.id}
                              className="flex items-center gap-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs hover:border-indigo-300 transition-colors"
                            >
                              <UserAvatar name={emp.name} role={emp.role} size="xs" />
                              <div className="text-left">
                                <span className="font-bold text-xs text-slate-800 block leading-tight">
                                  {emp.name}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  #{emp.employeeCode}
                                </span>
                              </div>
                              {hasCustom && (
                                <span className="text-[8px] bg-amber-100 text-amber-800 font-bold px-1 rounded">
                                  Custom
                                </span>
                              )}
                              <button
                                onClick={() => {
                                  setSelectedUserId(emp.id);
                                  setActiveTab('users');
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100"
                                title={`Inspect individual overrides for ${emp.name}`}
                              >
                                <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                  {PERMISSION_DEFINITIONS.map((perm) => {
                    const Icon = perm.icon;
                    const roleObj = rolePermissions[selectedRole];
                    const isGranted = Boolean(roleObj && roleObj[perm.key]);
                    return (
                      <div
                        key={perm.key}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all flex items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${perm.color}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-slate-900">{perm.label}</span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                                  isGranted
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {isGranted ? 'GRANTED' : 'RESTRICTED'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                              {perm.description}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => updateRolePermission(selectedRole, perm.key, !isGranted)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                            isGranted ? 'bg-emerald-600' : 'bg-slate-300'
                          }`}
                        >
                          <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              isGranted ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {selectedUser ? (
                  <>
                    <div className="pb-3 border-b border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={selectedUser.name} role={selectedUser.role} size="lg" />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-slate-900">{selectedUser.name}</h3>
                            <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-bold uppercase">
                              {selectedUser.role}
                            </span>
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
                              {selectedUser.designation}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Employee #{selectedUser.employeeCode} &bull; {selectedUser.email}
                          </p>
                        </div>
                      </div>
                      {selectedUser.customPermissions &&
                        Object.keys(selectedUser.customPermissions).length > 0 && (
                          <button
                            onClick={() => handleResetUserPrompt(selectedUser)}
                            className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all"
                            title="Remove all custom overrides and revert to base designation defaults"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                            <span>Reset to Role Defaults</span>
                          </button>
                        )}
                    </div>
                    <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                      {PERMISSION_DEFINITIONS.map((perm) => {
                        const Icon = perm.icon;
                        const isGranted = hasPermission(perm.key, selectedUser);
                        const isOverridden =
                          selectedUser.customPermissions &&
                          selectedUser.customPermissions[perm.key] !== undefined;
                        return (
                          <div
                            key={perm.key}
                            className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                              isOverridden
                                ? 'bg-amber-50/40 border-amber-200'
                                : 'bg-slate-50/50 hover:bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${perm.color}`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-xs text-slate-900">{perm.label}</span>
                                  <span
                                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                                      isGranted
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}
                                  >
                                    {isGranted ? 'GRANTED' : 'RESTRICTED'}
                                  </span>
                                  {isOverridden && (
                                    <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-200">
                                      Custom Override
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-500 leading-snug mt-0.5">
                                  {perm.description}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                updateUserCustomPermission(selectedUser.id, perm.key, !isGranted)
                              }
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${
                                isGranted ? 'bg-emerald-600' : 'bg-slate-300'
                              }`}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                  isGranted ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="p-8 text-center text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">Select an employee from the left column to view and edit individual overrides.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Role-Based Access Control (RBAC) System &bull; LLC-Time-Tracker-V2</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-sm"
          >
            Done
          </button>
        </div>

        <AnimatePresence>
          {showAddRoleModal && (
            <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 text-slate-800"
              >
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900">Add Role / Category</h3>
                  </div>
                  <button
                    onClick={() => setShowAddRoleModal(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <form onSubmit={handleCreateRoleCategory} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Role / Category Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Operations Supervisor, Auditor, Team Assistant"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Department / Badge Tag
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Operations, Quality, Finance, Custom"
                      value={newRoleBadge}
                      onChange={(e) => setNewRoleBadge(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Initial Template Permissions Preset
                    </label>
                    <select
                      value={newRoleTemplate}
                      onChange={(e) => setNewRoleTemplate(e.target.value)}
                      className="w-full text-xs bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="agent">Clone from Agent (Restricted standard user)</option>
                      <option value="trainer">Clone from Trainer (Manager rights, CRUD & monitoring)</option>
                      <option value="team_lead">Clone from Team Leader (Supervisor rights)</option>
                      <option value="qa">Clone from QA Specialist (Auditing & review)</option>
                      <option value="hr">Clone from HR (Employee CRUD & Timesheets)</option>
                      <option value="payroll">Clone from Payroll Officer (Payroll & Timesheets)</option>
                      <option value="admin">Clone from Admin (Full access)</option>
                    </select>
                  </div>
                  <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAddRoleModal(false)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                    >
                      Create Role / Category
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {confirmPrompt && confirmPrompt.isOpen && (
            <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 text-slate-800"
              >
                <div className="flex items-start gap-3.5 mb-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      confirmPrompt.confirmVariant === 'danger'
                        ? 'bg-rose-50 border-rose-200 text-rose-600'
                        : confirmPrompt.confirmVariant === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-600'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-600'
                    }`}
                  >
                    {confirmPrompt.confirmVariant === 'danger' ? (
                      <Trash2 className="w-5 h-5" />
                    ) : confirmPrompt.confirmVariant === 'warning' ? (
                      <AlertCircle className="w-5 h-5" />
                    ) : (
                      <ShieldCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 leading-snug">
                      {confirmPrompt.title}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                      {confirmPrompt.message}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setConfirmPrompt(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmPrompt.onConfirm}
                    className={`px-4 py-2 rounded-xl text-white text-xs font-bold shadow-sm transition-all ${
                      confirmPrompt.confirmVariant === 'danger'
                        ? 'bg-red-600 hover:bg-red-700'
                        : confirmPrompt.confirmVariant === 'warning'
                        ? 'bg-amber-600 hover:bg-amber-700'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {confirmPrompt.confirmLabel}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
