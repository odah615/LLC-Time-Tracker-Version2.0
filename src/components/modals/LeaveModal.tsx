import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { FileText, X, Check, Calendar, UserCheck, ShieldAlert, AlertCircle } from 'lucide-react';

interface LeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LeaveModal: React.FC<LeaveModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, leaveRequests, leaveBalances, submitLeaveRequest, users } = useApp();
  
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [type, setType] = useState<'Paid Leave' | 'Unpaid Leave'>('Paid Leave');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState('');

  // Find user's leave balance record from Leave_Balances table
  const userBalance = useMemo(() => {
    return leaveBalances.find(
      (b) => b.userId === currentUser.id || b.employeeCode === (currentUser.employeeCode || currentUser.id)
    );
  }, [leaveBalances, currentUser]);

  // Fallbacks if balance record isn't initialized yet
  const employmentStatus = userBalance?.employmentStatus || 'Probationary';
  const isRegular = employmentStatus === 'Regular';
  const remainingPaidCredits = userBalance?.remainingPaidLeaveCredits ?? (isRegular ? 15 : 0);
  const unpaidDaysUsed = userBalance?.unpaidDaysUsed ?? 0;

  // Resolve Supervisor Name
  const supervisorName = useMemo(() => {
    if (userBalance?.supervisorName && userBalance.supervisorName !== 'Unassigned' && userBalance.supervisorName !== 'Sir Robin / Team Leader') {
      return userBalance.supervisorName;
    }
    if (currentUser.teamLeaderId) {
      const rawTl = currentUser.teamLeaderId.trim();
      const tl = users.find(
        (u) =>
          u.id.toLowerCase() === rawTl.toLowerCase() ||
          u.employeeCode?.toLowerCase() === rawTl.toLowerCase() ||
          u.username?.toLowerCase() === rawTl.toLowerCase() ||
          u.name.toLowerCase() === rawTl.toLowerCase()
      );
      if (tl) return tl.name;
      return rawTl;
    }
    return 'Unassigned';
  }, [userBalance, currentUser, users]);

  // Last approved leave date
  const lastApprovedLeaveDate = useMemo(() => {
    const userApproved = leaveRequests
      .filter((r) => r.userId === currentUser.id && r.status === 'approved')
      .sort((a, b) => (b.endDate || b.startDate).localeCompare(a.endDate || a.startDate));
    return userApproved.length > 0 ? userApproved[0].endDate || userApproved[0].startDate : 'No previous approved leaves';
  }, [leaveRequests, currentUser]);

  // Compute total days requested
  const totalDays = useMemo(() => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 1;
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(1, diffDays);
  }, [startDate, endDate]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!reason.trim()) {
      setFormError('Please provide a reason for your leave request.');
      return;
    }

    if (endDate < startDate) {
      setFormError('End date cannot be earlier than start date.');
      return;
    }

    if (type === 'Paid Leave' && !isRegular) {
      setFormError('Paid Leave is only available for Regular employees. Please select Unpaid Leave.');
      return;
    }

    if (type === 'Paid Leave' && remainingPaidCredits < totalDays) {
      setFormError(
        `Insufficient Paid Leave credits. You requested ${totalDays} day(s), but only have ${remainingPaidCredits} day(s) remaining.`
      );
      return;
    }

    submitLeaveRequest({
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode || currentUser.id,
      userName: currentUser.name,
      employmentStatus,
      teamLeaderName: supervisorName,
      teamLeaderId: currentUser.teamLeaderId,
      type: isRegular && type === 'Paid Leave' ? 'Paid Leave' : 'Unpaid Leave',
      startDate,
      endDate,
      totalDays,
      reason: reason.trim(),
      paidLeaveCreditsSnapshot: remainingPaidCredits,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-100 text-purple-700">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Apply For Leave</h3>
              <p className="text-xs text-slate-500">File a leave request with team leader review</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile & Credits Summary Badge */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-200/60">
            <div>
              <span className="text-slate-500 font-medium block">Employment Status:</span>
              <span
                className={`font-bold inline-flex items-center gap-1 ${
                  isRegular ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {isRegular ? <UserCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                {employmentStatus}
              </span>
            </div>
            <div>
              <span className="text-slate-500 font-medium block">Supervisor / Team Lead:</span>
              <span className="font-bold text-slate-900 truncate block">{supervisorName}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-0.5 text-center">
            <div className="p-2 bg-white rounded-lg border border-slate-200/60">
              <span className="text-[10px] text-slate-500 font-medium block">Paid Leave Balance</span>
              <span className="text-sm font-black text-purple-700">{remainingPaidCredits} days</span>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200/60">
              <span className="text-[10px] text-slate-500 font-medium block">Unpaid Days Taken</span>
              <span className="text-sm font-black text-slate-700">{unpaidDaysUsed} days</span>
            </div>
            <div className="p-2 bg-white rounded-lg border border-slate-200/60">
              <span className="text-[10px] text-slate-500 font-medium block">Last Approved Leave</span>
              <span className="text-[11px] font-bold text-slate-800 truncate block" title={lastApprovedLeaveDate}>
                {lastApprovedLeaveDate}
              </span>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* Leave Type Selector */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Leave Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-purple-500 font-medium text-xs"
            >
              <option value="Paid Leave" disabled={!isRegular || remainingPaidCredits <= 0}>
                Paid Leave {!isRegular ? '(Regular Employees Only)' : `(${remainingPaidCredits} days remaining)`}
              </option>
              <option value="Unpaid Leave">Unpaid Leave</option>
            </select>
            {!isRegular && (
              <p className="text-[11px] text-amber-700 mt-1 font-medium flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                Probationary staff file under Unpaid Leave until regularized.
              </p>
            )}
          </div>

          {/* Dates Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-purple-500 font-medium text-xs"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-purple-500 font-medium text-xs"
                required
              />
            </div>
          </div>

          {/* Calculated Duration Indicator */}
          <div className="flex items-center justify-between p-2.5 bg-purple-50/70 border border-purple-200/60 rounded-xl text-purple-900 font-semibold">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-purple-600" /> Total Duration:
            </span>
            <span className="text-xs font-bold bg-purple-200 text-purple-900 px-2.5 py-0.5 rounded-full">
              {totalDays} Day{totalDays > 1 ? 's' : ''}
            </span>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              Reason for Leave <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              placeholder="Provide context for your leave request..."
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setFormError('');
              }}
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-purple-500 font-medium text-xs"
              required
            />
          </div>

          {formError && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold flex items-center gap-1.5 shadow-sm text-xs"
            >
              <Check className="w-4 h-4" /> Submit Application
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
