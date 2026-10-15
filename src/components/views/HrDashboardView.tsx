import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  Users,
  UserCheck,
  UserPlus,
  FileText,
  Building2,
  Clock,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { User } from '../../types';
import { LiveTrackingTable } from '../LiveTrackingTable';

interface HrDashboardViewProps {
  onOpenAddUserModal?: () => void;
  onEditUser?: (user: User) => void;
  onNavigateToEmployees?: () => void;
  onNavigateToRequests?: () => void;
}

export const HrDashboardView: React.FC<HrDashboardViewProps> = ({
  onOpenAddUserModal,
  onNavigateToEmployees,
  onNavigateToRequests,
}) => {
  const { users, leaveRequests, currentUser } = useApp();

  const activeCount = users.filter((u) => u.status !== 'inactive').length;
  const inactiveCount = users.filter((u) => u.status === 'inactive').length;

  const pendingLeaves = leaveRequests.filter((l) => l.status === 'pending');
  const approvedLeaves = leaveRequests.filter((l) => l.status === 'approved');

  const departmentCounts: Record<string, number> = {};
  users.forEach((u) => {
    const dept = u.department || 'Operations';
    departmentCounts[dept] = (departmentCounts[dept] || 0) + 1;
  });

  const activeStaffOnShift = users.filter((u) => u.status === 'active' && !u.isSecretBackup).length;

  return (
    <div id="hr-dashboard-view" className="space-y-6">
      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 text-slate-100 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="bg-purple-900/60 text-purple-200 border border-purple-700/60 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <UserCheck className="w-3 h-3 text-purple-400" /> Human Resources Overview
            </span>
            <span className="text-slate-400 text-xs"> • Welcome back, {currentUser.name}</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">HR Operations & Workforce Portal</h2>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Monitor personnel headcount, review team leave applications, audit employee master details, and maintain organization structure.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {onOpenAddUserModal && (
            <button
              onClick={onOpenAddUserModal}
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" /> Add Employee
            </button>
          )}
          {onNavigateToEmployees && (
            <button
              onClick={onNavigateToEmployees}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <Users className="w-4 h-4 text-purple-400" /> Employee Roster
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 bg-purple-50 text-purple-700 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Total Staff</span>
            <div className="text-xl font-extrabold text-slate-900">{users.length} Employees</div>
            <div className="text-[11px] text-emerald-600 font-medium">
              {activeCount} Active • {inactiveCount} Inactive
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 bg-amber-50 text-amber-700 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Leave Applications</span>
            <div className="text-xl font-extrabold text-slate-900">{pendingLeaves.length} Pending</div>
            <div className="text-[11px] text-amber-600 font-medium">
              {approvedLeaves.length} Approved this period
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 text-blue-700 rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Active Departments</span>
            <div className="text-xl font-extrabold text-slate-900">{Object.keys(departmentCounts).length} Units</div>
            <div className="text-[11px] text-slate-500 font-medium">Operations, QA, Sales & HR</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Active Staff Coverage</span>
            <div className="text-xl font-extrabold text-slate-900">{activeStaffOnShift} Ready</div>
            <div className="text-[11px] text-emerald-600 font-medium">Available for operations & shifts</div>
          </div>
        </div>
      </div>

      <LiveTrackingTable
        title="Workforce Real-Time Presence & Attendance Feed"
        description="Database-driven live status and active task monitoring for all company personnel."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-purple-600" /> Department Distribution
              </h3>
              <span className="text-xs text-slate-500 font-medium">{users.length} Active Headcount</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.entries(departmentCounts).map(([dept, count]) => {
                const percentage = Math.round((count / users.length) * 100);
                return (
                  <div key={dept} className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-xs">{dept}</span>
                      <span className="text-xs font-mono font-bold text-purple-700">{count} staff ({percentage}%)</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              onClick={onNavigateToEmployees}
              className="bg-gradient-to-br from-purple-900 to-indigo-900 text-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-white/10 rounded-xl text-purple-300">
                  <Users className="w-6 h-6" />
                </div>
                <ArrowRight className="w-5 h-5 text-purple-300 group-hover:translate-x-1 transition-transform" />
              </div>
              <h4 className="font-bold text-base text-white">Employee Master Records</h4>
              <p className="text-xs text-purple-200 mt-1">
                View detailed roster, edit hourly pay rates, update designations, or toggle active/inactive staff status.
              </p>
            </div>

            <div
              onClick={onNavigateToRequests}
              className="bg-gradient-to-br from-blue-900 to-slate-900 text-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="p-2.5 bg-white/10 rounded-xl text-blue-300">
                  <FileText className="w-6 h-6" />
                </div>
                <ArrowRight className="w-5 h-5 text-blue-300 group-hover:translate-x-1 transition-transform" />
              </div>
              <h4 className="font-bold text-base text-white">Leave Requests & Approvals</h4>
              <p className="text-xs text-blue-200 mt-1">
                Review pending sick leave, vacation, and emergency leave applications submitted by agents.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" /> Pending Leave Requests
            </h3>
            <span className="text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-0.5 rounded-full">
              {pendingLeaves.length}
            </span>
          </div>

          {pendingLeaves.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs space-y-2 flex-1 flex flex-col justify-center items-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              <p>No pending leave applications requiring HR review.</p>
            </div>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto max-h-[340px]">
              {pendingLeaves.map((leave) => (
                <div key={leave.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{leave.userName}</span>
                    <span className="bg-purple-100 text-purple-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                      {leave.type}
                    </span>
                  </div>
                  <div className="text-slate-500 text-[11px] font-mono">
                    {leave.startDate} to {leave.endDate}
                  </div>
                  <p className="text-slate-600 text-[11px] italic bg-white p-2 rounded border border-slate-200">
                    "{leave.reason}"
                  </p>
                </div>
              ))}
            </div>
          )}

          {onNavigateToRequests && (
            <button
              onClick={onNavigateToRequests}
              className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all mt-auto cursor-pointer"
            >
              <span>Manage All Leave Applications</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
