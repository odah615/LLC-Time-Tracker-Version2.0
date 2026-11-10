import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileText,
  Plus,
  CheckCircle2,
  XCircle,
  Calendar,
  Filter,
  RefreshCw,
  Slash,
  UserCheck,
  ShieldAlert,
  Edit3,
  Clock,
  User,
  Check,
} from 'lucide-react';
import { LeaveActionModal, LeaveActionType } from '../modals/LeaveActionModal';
import { LeaveRequest, LeaveBalance } from '../../types';

interface LeaveRequestsViewProps {
  onOpenLeaveModal: () => void;
  onOpenManualModal?: () => void;
}

export const LeaveRequestsView: React.FC<LeaveRequestsViewProps> = ({ onOpenLeaveModal }) => {
  const {
    leaveRequests,
    leaveBalances,
    currentUser,
    updateLeaveRequestStatus,
    updateEmployeeLeaveBalance,
    users,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'pending' | 'approved' | 'rejected' | 'resubmit' | 'cancelled'
  >('ALL');

  // Modal State for Actioning a Leave Request
  const [activeLeave, setActiveLeave] = useState<LeaveRequest | null>(null);
  const [activeAction, setActiveAction] = useState<LeaveActionType | null>(null);
  const [isAgentCancelling, setIsAgentCancelling] = useState(false);

  // Edit Balance Drawer/Modal State for Admin/HR
  const [editingBalance, setEditingBalance] = useState<LeaveBalance | null>(null);
  const [editStatus, setEditStatus] = useState<string>('Regular');
  const [editCredits, setEditCredits] = useState<number>(15);

  // Agent's personal balance
  const currentBalance = useMemo(() => {
    return leaveBalances.find(
      (b) => b.userId === currentUser.id || b.employeeCode === (currentUser.employeeCode || currentUser.id)
    );
  }, [leaveBalances, currentUser]);

  const isRegular = (currentBalance?.employmentStatus || 'Probationary') === 'Regular';
  const remainingPaidCredits = currentBalance?.remainingPaidLeaveCredits ?? (isRegular ? 15 : 0);
  const unpaidDaysUsed = currentBalance?.unpaidDaysUsed ?? 0;

  // Resolved Supervisor
  const supervisorName = useMemo(() => {
    if (currentBalance?.supervisorName && currentBalance.supervisorName !== 'Unassigned') {
      return currentBalance.supervisorName;
    }
    if (currentUser.teamLeaderId) {
      const tl = users.find((u) => u.id === currentUser.teamLeaderId || u.employeeCode === currentUser.teamLeaderId);
      if (tl) return tl.name;
    }
    return 'Sir Robin / Team Leader';
  }, [currentBalance, currentUser, users]);

  // Last Approved Leave Date
  const lastApprovedLeaveDate = useMemo(() => {
    const approved = leaveRequests
      .filter((r) => r.userId === currentUser.id && r.status === 'approved')
      .sort((a, b) => (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate));
    return approved.length > 0 ? approved[0].endDate || approved[0].startDate : 'None';
  }, [leaveRequests, currentUser]);

  const isManagerRole =
    currentUser.role === 'admin' ||
    currentUser.role === 'team_lead' ||
    currentUser.role === 'hr' ||
    currentUser.role === 'trainer';

  // Filtered Leave List
  const visibleLeaves = useMemo(() => {
    return leaveRequests.filter((l) => {
      const isMyLeave = l.userId === currentUser.id || l.employeeCode === currentUser.employeeCode;
      const isRoleAllowed = isManagerRole || isMyLeave;
      const matchesFilter = statusFilter === 'ALL' || l.status === statusFilter;
      return isRoleAllowed && matchesFilter;
    });
  }, [leaveRequests, currentUser, isManagerRole, statusFilter]);

  const openActionModal = (leave: LeaveRequest, action: LeaveActionType, agentCancel = false) => {
    setActiveLeave(leave);
    setActiveAction(action);
    setIsAgentCancelling(agentCancel);
  };

  const handleConfirmAction = (leaveId: string, action: LeaveActionType, notes: string) => {
    const actorNameRole = `${currentUser.name} (${currentUser.role.replace('_', ' ').toUpperCase()})`;
    updateLeaveRequestStatus(leaveId, action, notes, actorNameRole);
  };

  const handleSaveBalanceEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBalance) return;
    updateEmployeeLeaveBalance(editingBalance.userId, {
      employmentStatus: editStatus as any,
      remainingPaidLeaveCredits: Number(editCredits),
      totalPaidLeaveCredits: Math.max(Number(editCredits), editingBalance.totalPaidLeaveCredits),
    });
    setEditingBalance(null);
  };

  return (
    <div id="leave-requests-view" className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-purple-600" /> Leave Applications & Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Submit leave requests, review team leave applications, and manage leave credits.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent text-slate-900 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Declined</option>
              <option value="resubmit">Re-Submit Required</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <button
            onClick={onOpenLeaveModal}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Request Leave
          </button>
        </div>
      </div>

      {/* Leave Credits Overview Dashboard Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-purple-100 text-purple-700">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Employment Status</span>
            <span className={`text-sm font-bold ${isRegular ? 'text-emerald-600' : 'text-amber-600'}`}>
              {isRegular ? 'Regular Employee' : 'Probationary Staff'}
            </span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Paid Leave Credits</span>
            <span className="text-base font-black text-slate-900">{remainingPaidCredits} Days Available</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-slate-100 text-slate-700">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Unpaid Leave Taken</span>
            <span className="text-base font-bold text-slate-800">{unpaidDaysUsed} Days</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-700">
            <User className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-500 block">Supervisor & Last Leave</span>
            <span className="text-xs font-bold text-slate-900 block truncate" title={supervisorName}>
              {supervisorName}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">Last: {lastApprovedLeaveDate}</span>
          </div>
        </div>
      </div>

      {/* Leave Application Log Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-base text-slate-900 mb-4 pb-3 border-b border-slate-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" /> Leave Applications Log
          </span>
          <span className="text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full">
            {visibleLeaves.length} Application{visibleLeaves.length !== 1 ? 's' : ''}
          </span>
        </h3>

        {visibleLeaves.length === 0 ? (
          <p className="text-slate-500 text-xs py-8 text-center">No leave applications found matching your status filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-4">Leave Type & Dates</th>
                  <th className="py-3.5 px-4">Reason</th>
                  <th className="py-3.5 px-4 text-center">Credits Snapshot</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Reviewer & Notes</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {visibleLeaves.map((l) => {
                  const isMyOwnRequest = l.userId === currentUser.id;
                  const isPending = l.status === 'pending';
                  const isResubmit = l.status === 'resubmit';

                  return (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Employee Info */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900">{l.userName}</div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                          {l.employmentStatus || 'Staff'} • TL: {l.teamLeaderName || 'Supervisor'}
                        </div>
                      </td>

                      {/* Dates & Type */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-purple-700">{l.type}</div>
                        <div className="text-slate-700 font-mono font-semibold text-[11px]">
                          {l.startDate} to {l.endDate} ({l.totalDays || 1}d)
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4 text-slate-600 max-w-xs font-medium">
                        <p className="line-clamp-2" title={l.reason}>
                          "{l.reason}"
                        </p>
                      </td>

                      {/* Credits Snapshot */}
                      <td className="py-3.5 px-4 text-center">
                        <span className="inline-block bg-purple-50 text-purple-900 border border-purple-200 px-2.5 py-1 rounded-lg font-mono text-xs font-bold">
                          {l.paidLeaveCreditsSnapshot ?? (l.employmentStatus === 'Regular' ? 15 : 0)} days
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1 ${
                            l.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : l.status === 'rejected'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : l.status === 'resubmit'
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : l.status === 'cancelled'
                              ? 'bg-slate-100 text-slate-700 border border-slate-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                          }`}
                        >
                          {l.status === 'rejected' ? 'DECLINED' : l.status}
                        </span>
                      </td>

                      {/* Reviewer & Notes */}
                      <td className="py-3.5 px-4 max-w-xs text-[11px]">
                        {l.actionedBy ? (
                          <div>
                            <span className="font-semibold text-slate-700 block">{l.actionedBy}</span>
                            {l.reviewerNotes && (
                              <span className="text-slate-500 italic block line-clamp-2" title={l.reviewerNotes}>
                                "{l.reviewerNotes}"
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Awaiting review...</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* Manager Actions (TL / HR / Admin) */}
                          {isManagerRole && (isPending || isResubmit) && (
                            <>
                              <button
                                onClick={() => openActionModal(l, 'approved')}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                title="Approve Leave Request"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </button>
                              <button
                                onClick={() => openActionModal(l, 'rejected')}
                                className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                title="Decline Leave Request"
                              >
                                <XCircle className="w-3 h-3" /> Decline
                              </button>
                              <button
                                onClick={() => openActionModal(l, 'resubmit')}
                                className="px-2 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                title="Request Re-Submit"
                              >
                                <RefreshCw className="w-3 h-3" /> Re-Submit
                              </button>
                              <button
                                onClick={() => openActionModal(l, 'cancelled')}
                                className="px-2 py-1 rounded-lg bg-slate-600 hover:bg-slate-700 text-white font-bold text-[10px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                                title="Cancel Application"
                              >
                                <Slash className="w-3 h-3" /> Cancel
                              </button>
                            </>
                          )}

                          {/* Agent Self-Service Action: Only CANCEL on pending requests */}
                          {!isManagerRole && isMyOwnRequest && isPending && (
                            <button
                              onClick={() => openActionModal(l, 'cancelled', true)}
                              className="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-bold text-[11px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                              title="Cancel Request"
                            >
                              <Slash className="w-3.5 h-3.5" /> Cancel Request
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Admin & HR Master Leave Balances Roster Section */}
      {(currentUser.role === 'admin' || currentUser.role === 'hr') && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" /> Employee Leave Balances Roster (`Leave_Balances`)
              </h3>
              <p className="text-xs text-slate-500">
                Isolated balance directory. Manage employment status (Regular vs Probationary) and leave credits.
              </p>
            </div>
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1 rounded-full">
              {leaveBalances.length} Staff Balances
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Supervisor</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Total Paid Credits</th>
                  <th className="py-3 px-4 text-center">Remaining Credits</th>
                  <th className="py-3 px-4 text-center">Unpaid Taken</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {leaveBalances.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {b.fullName} <span className="text-[10px] text-slate-400 font-normal">({b.employeeCode})</span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-600">{b.supervisorName}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.employmentStatus === 'Regular'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {b.employmentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{b.totalPaidLeaveCredits} days</td>
                    <td className="py-3 px-4 text-center font-bold text-emerald-700">{b.remainingPaidLeaveCredits} days</td>
                    <td className="py-3 px-4 text-center font-medium text-slate-600">{b.unpaidDaysUsed} days</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          setEditingBalance(b);
                          setEditStatus(b.employmentStatus);
                          setEditCredits(b.remainingPaidLeaveCredits);
                        }}
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold flex items-center gap-1 ml-auto transition-colors"
                      >
                        <Edit3 className="w-3 h-3" /> Edit Credits
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Action Confirmation Modal */}
      <LeaveActionModal
        isOpen={Boolean(activeLeave && activeAction)}
        onClose={() => {
          setActiveLeave(null);
          setActiveAction(null);
          setIsAgentCancelling(false);
        }}
        leaveRequest={activeLeave}
        actionType={activeAction}
        onConfirm={handleConfirmAction}
        isAgentCancelling={isAgentCancelling}
      />

      {/* Admin/HR Edit Balance Modal */}
      {editingBalance && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-100">
            <h3 className="font-bold text-base text-slate-900">Update Employee Leave Status & Credits</h3>
            <p className="text-xs text-slate-500">
              Editing balance for <span className="font-bold text-slate-900">{editingBalance.fullName}</span> (
              {editingBalance.employeeCode})
            </p>

            <form onSubmit={handleSaveBalanceEdit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Employment Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Regular">Regular (Eligible for Paid Leave)</option>
                  <option value="Probationary">Probationary (Unpaid Leave Only)</option>
                  <option value="Training / Nesting">Training / Nesting (Unpaid Leave Only)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Remaining Paid Leave Credits (Days)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={editCredits}
                  onChange={(e) => setEditCredits(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-medium focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBalance(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1 shadow-sm"
                >
                  <Check className="w-4 h-4" /> Save Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
