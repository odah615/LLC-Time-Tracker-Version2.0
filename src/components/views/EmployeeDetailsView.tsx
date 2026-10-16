import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  syncEmployeesToGoogleSheetsWebhook,
  generateAppsScriptCode,
} from '../../lib/googleSheetsSync';
import {
  Search,
  Filter,
  UserCheck,
  UserPlus,
  Edit,
  Building2,
  MapPin,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  ArrowDownCircle,
  ArrowUpCircle,
  KeyRound,
  Lock,
  Unlock,
  Send,
  Eye,
  EyeOff,
  Clock,
  Check,
  X,
  Link2,
  Code,
  Copy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { User, PasswordResetRequest } from '../../types';
import { UserAvatar } from '../UserAvatar';
import { PasswordResetModal } from '../modals/PasswordResetModal';
import { maskPassword } from '../../lib/googleSheetsSync';
import { resolveSupervisor } from '../../lib/userUtils';

interface EmployeeDetailsViewProps {
  onOpenAddUserModal: () => void;
  onEditUser: (user: User) => void;
}

export const EmployeeDetailsView: React.FC<EmployeeDetailsViewProps> = ({
  onOpenAddUserModal,
  onEditUser,
}) => {
  const {
    users,
    currentUser,
    updateUser,
    resetUserPassword,
    passwordResetRequests,
    requestPasswordReset,
    approvePasswordResetRequest,
    rejectPasswordResetRequest,
    triggerGoogleSheetsSync,
    importEmployeesFromGoogleSheets,
    googleSheetsWebhookUrl,
    setGoogleSheetsWebhookUrl,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isSyncingSheets, setIsSyncingSheets] = useState(false);
  const [isPullingSheets, setIsPullingSheets] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [showWebhookBanner, setShowWebhookBanner] = useState(false);
  const [webhookInputVal, setWebhookInputVal] = useState(googleSheetsWebhookUrl || '');
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    setWebhookInputVal(googleSheetsWebhookUrl || '');
  }, [googleSheetsWebhookUrl]);

  const [resetModalUser, setResetModalUser] = useState<User | null>(null);
  const [requestModalUser, setRequestModalUser] = useState<User | null>(null);
  const [requestReason, setRequestReason] = useState('Employee forgot password / needs reset to default');
  const [showAdminDecryptedPasswords, setShowAdminDecryptedPasswords] = useState(false);
  const isAdmin = currentUser.role === 'admin' || currentUser.employeeCode.toLowerCase() === 'superadmin' || currentUser.id === 'usr-superadmin-red';

  const pendingRequests = useMemo(() => {
    return passwordResetRequests.filter((r) => r.status === 'pending');
  }, [passwordResetRequests]);

  const handleOpenRequestModal = (target: User) => {
    setRequestModalUser(target);
    setRequestReason('Employee forgot password / needs credential reset to default');
  };

  const handleConfirmSubmitRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestModalUser) return;
    requestPasswordReset(requestModalUser.id, requestReason);
    setRequestModalUser(null);
  };

  const handleSyncToSheets = async () => {
    const activeUrl = googleSheetsWebhookUrl || localStorage.getItem('trackpulse_sheets_webhook') || webhookInputVal.trim();
    if (!activeUrl || !activeUrl.trim().startsWith('https://')) {
      setShowWebhookBanner(true);
      setSyncStatusMsg({ type: 'error', text: 'Please configure Google Apps Script Webhook URL.' });
      setTimeout(() => setSyncStatusMsg(null), 8000);
      return;
    }
    setIsSyncingSheets(true);
    setSyncStatusMsg({ type: 'info', text: 'Pushing employee roster to Google Sheets...' });
    const empRes = await syncEmployeesToGoogleSheetsWebhook(activeUrl, users);
    triggerGoogleSheetsSync(activeUrl).catch(() => {});
    setIsSyncingSheets(false);
    if (empRes && empRes.success) {
      setSyncStatusMsg({ type: 'success', text: empRes.message || `Successfully synced ${users.length} employees!` });
    } else {
      setSyncStatusMsg({ type: 'error', text: `${empRes?.message || 'Sync failed.'}` });
    }
    setTimeout(() => setSyncStatusMsg(null), 8000);
  };

  const handlePullFromSheets = async () => {
    const activeUrl = googleSheetsWebhookUrl || localStorage.getItem('trackpulse_sheets_webhook') || webhookInputVal.trim();
    if (!activeUrl || !activeUrl.trim().startsWith('https://')) {
      setShowWebhookBanner(true);
      setSyncStatusMsg({ type: 'error', text: 'Please configure Google Apps Script Webhook URL.' });
      setTimeout(() => setSyncStatusMsg(null), 8000);
      return;
    }
    setIsPullingSheets(true);
    setSyncStatusMsg({ type: 'info', text: 'Pulling staff records from Google Sheets...' });
    const res = await importEmployeesFromGoogleSheets(activeUrl);
    setIsPullingSheets(false);
    if (res && res.success) {
      setSyncStatusMsg({ type: 'success', text: `✓ ${res.message}` });
    } else {
      setSyncStatusMsg({ type: 'error', text: `${res?.message}` });
    }
    setTimeout(() => setSyncStatusMsg(null), 8000);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.designation.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesDept = departmentFilter === 'all' || u.department === departmentFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && (u.status === 'active' || !u.status)) ||
        (statusFilter === 'inactive' && u.status === 'inactive');
      return matchesSearch && matchesRole && matchesDept && matchesStatus;
    });
  }, [users, searchTerm, roleFilter, departmentFilter, statusFilter]);

  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedUsers = useMemo(() => {
    const startIndex = (safePage - 1) * pageSize;
    return filteredUsers.slice(startIndex, startIndex + pageSize);
  }, [filteredUsers, safePage, pageSize]);

  const activeCount = users.filter((u) => u.status !== 'inactive').length;
  const inactiveCount = users.filter((u) => u.status === 'inactive').length;
  const departments = Array.from(new Set(users.map((u) => u.department || 'Operations')));

  const toggleUserStatus = (userId: string, currentStatus?: string) => {
    const newStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
    updateUser(userId, { status: newStatus });
  };

  const getTeamLeaderName = (leaderId?: string) => {
    if (!leaderId) return 'None / Direct';
    const leader = resolveSupervisor(leaderId, users);
    return leader ? leader.name || leader.username : leaderId;
  };

  return (
    <div id="employee-details-view" className="space-y-6">
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="bg-purple-900/60 text-purple-200 border border-purple-700/60 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-purple-400" /> HR Personnel Management
            </span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">Employee Directory</h2>
          <p className="text-xs text-slate-300 mt-1">
            Centralized directory of staff credentials, password states, supervisor assignments, and roles.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-slate-900/90 p-3 rounded-xl border border-slate-800">
            <div className="text-center px-2 border-r border-slate-800">
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Total Staff</div>
              <div className="text-lg font-bold text-white">{users.length}</div>
            </div>
            <div className="text-center px-2 border-r border-slate-800">
              <div className="text-[10px] text-emerald-400 font-semibold uppercase">Active</div>
              <div className="text-lg font-bold text-emerald-400">{activeCount}</div>
            </div>
            <div className="text-center px-2">
              <div className="text-[10px] text-rose-400 font-semibold uppercase">Inactive</div>
              <div className="text-lg font-bold text-rose-400">{inactiveCount}</div>
            </div>
          </div>
          <button
            disabled={isPullingSheets}
            onClick={handlePullFromSheets}
            className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all shrink-0 disabled:opacity-50 cursor-pointer"
          >
            <ArrowDownCircle className="w-4 h-4 text-blue-200" />
            <span>{isPullingSheets ? 'Pulling...' : 'Pull from Sheets'}</span>
          </button>
          <button
            disabled={isSyncingSheets}
            onClick={handleSyncToSheets}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-all shrink-0 disabled:opacity-50 cursor-pointer"
          >
            <ArrowUpCircle className="w-4 h-4 text-emerald-200" />
            <span>{isSyncingSheets ? 'Pushing...' : 'Push to Sheets'}</span>
          </button>
          <button
            onClick={onOpenAddUserModal}
            className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" /> Add Employee
          </button>
        </div>
      </div>

      {syncStatusMsg && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-sm border ${
            syncStatusMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : syncStatusMsg.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          {syncStatusMsg.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
          {syncStatusMsg.type === 'error' && <XCircle className="w-4 h-4 text-rose-600 shrink-0" />}
          <span>{syncStatusMsg.text}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-4 text-xs">
        <div className="relative w-full lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, email, code, or role..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl pl-9 pr-3 py-2 font-medium focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-600">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent text-slate-800 font-semibold focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="agent">Agent</option>
              <option value="team_lead">Team Lead</option>
              <option value="trainer">Trainer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">Employee Details</th>
                <th className="py-3.5 px-4">System Role</th>
                <th className="py-3.5 px-4">Designation & Dept</th>
                <th className="py-3.5 px-4">Assigned Supervisor</th>
                <th className="py-3.5 px-4">Login Password</th>
                <th className="py-3.5 px-4">Join Date</th>
                <th className="py-3.5 px-4">GEO Location</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No employee records match the selected search/filter criteria.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((usr) => {
                  const isActive = usr.status !== 'inactive';
                  const userPassword = usr.password || 'Password123!';
                  return (
                    <tr key={usr.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            name={usr.name}
                            role={usr.role}
                            size="md"
                          />
                          <div>
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                              <span>{usr.name}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-2">
                              <span>{usr.email}</span>
                              <span className="font-mono font-semibold text-purple-600">
                                #{usr.employeeCode}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-purple-50 border border-purple-200 text-purple-800 px-2 py-0.5 rounded font-bold uppercase text-[10px]">
                          {usr.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{usr.designation}</div>
                        <div className="text-[10px] text-slate-500">{usr.department || 'Operations'}</div>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {getTeamLeaderName(usr.teamLeaderId)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-mono text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-xs w-fit">
                          <Lock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{maskPassword(userPassword)}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-medium text-slate-600">
                        {usr.joinDate || '2024-01-01'}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1 text-slate-700 font-medium">
                          <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                          <span>{usr.geoCity}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-1 rounded-full text-[10px] font-bold">
                            <XCircle className="w-3 h-3 text-rose-600" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onEditUser(usr)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-all cursor-pointer"
                          title="Edit Employee Details"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
