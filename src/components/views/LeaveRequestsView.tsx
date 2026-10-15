import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FileText, Plus, CheckCircle2, XCircle, Calendar, Filter } from 'lucide-react';

interface LeaveRequestsViewProps {
  onOpenLeaveModal: () => void;
  onOpenManualModal?: () => void;
}

export const LeaveRequestsView: React.FC<LeaveRequestsViewProps> = ({
  onOpenLeaveModal,
}) => {
  const {
    leaveRequests,
    currentUser,
    approveLeaveRequest,
    rejectLeaveRequest,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'approved' | 'pending' | 'rejected'>('ALL');

  const myLeaves = leaveRequests.filter(
    (l) =>
      (currentUser.role === 'admin' || currentUser.role === 'team_lead' || l.userId === currentUser.id) &&
      (statusFilter === 'ALL' || l.status === statusFilter)
  );

  return (
    <div id="leave-requests-view" className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-6 h-6 text-purple-600" /> Leave Applications & Management
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Submit leave applications with reason notes and monitor available leave credits.
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
              <option value="rejected">Declined / Rejected</option>
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

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-base text-slate-900 mb-4 pb-3 border-b border-slate-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-600" /> Leave Application
          </span>
          <span className="text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full">
            {myLeaves.length} Records
          </span>
        </h3>

        {myLeaves.length === 0 ? (
          <p className="text-slate-500 text-xs py-8 text-center">No leave applications found matching your status filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4">Agent Name</th>
                  <th className="py-3.5 px-4">Leave Dates</th>
                  <th className="py-3.5 px-4">Reason</th>
                  <th className="py-3.5 px-4">Leave type</th>
                  <th className="py-3.5 px-4 text-center">Available Leave Credits</th>
                  <th className="py-3.5 px-4">Status</th>
                  {(currentUser.role === 'admin' || currentUser.role === 'team_lead') && (
                    <th className="py-3.5 px-4 text-right">Remarks/Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {myLeaves.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">{l.userName}</td>
                    <td className="py-3.5 px-4 text-slate-700 font-mono font-semibold text-blue-600">
                      {l.startDate} to {l.endDate}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate" title={l.reason}>
                      {l.reason}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-purple-700">
                      {l.type.includes('Leave') ? l.type : `${l.type} Leave`}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-lg font-mono text-xs font-bold">
                        {l.availableLeaveCredits ?? 4}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          l.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : l.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                        }`}
                      >
                        {l.status === 'rejected' ? 'DECLINED' : l.status.toUpperCase()}
                      </span>
                    </td>
                    {(currentUser.role === 'admin' || currentUser.role === 'team_lead') && (
                      <td className="py-3.5 px-4 text-right">
                        {l.status === 'pending' && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => approveLeaveRequest(l.id)}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                              title="Approve"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => rejectLeaveRequest(l.id)}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                              title="Decline"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Decline
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
