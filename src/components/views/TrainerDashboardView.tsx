import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { downloadDesktopSoftwarePackage, DesktopOS } from '../../lib/desktopDownloader';
import { getManilaDateString } from '../../lib/dateUtils';
import {
  GraduationCap,
  Users,
  Clock,
  Plus,
  Edit,
  CheckCircle2,
  XCircle,
  FileText,
  Save,
  Trash2,
  Laptop,
  Download,
  Check,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Search,
  Filter,
  Play,
  X,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { TimeLog, User, IdleLog, LeaveRequest } from '../../types';
import { UserAvatar } from '../UserAvatar';
import { LiveTrackingTable } from '../LiveTrackingTable';

interface TrainerDashboardViewProps {
  onOpenAddUserModal: () => void;
  onEditUser: (user: User) => void;
}

export const TrainerDashboardView: React.FC<TrainerDashboardViewProps> = ({
  onOpenAddUserModal,
  onEditUser,
}) => {
  const {
    currentUser,
    users,
    userPresenceList,
    timeLogs,
    idleLogs,
    leaveRequests,
    addTimeLog,
    updateTimeLog,
    deleteTimeLog,
    updateUser,
    approveLeaveRequest,
    rejectLeaveRequest,
    formatDuration,
    startAgentLiveShift,
    stopAgentLiveShift,
    syncAllFromGoogleSheets,
    triggerGoogleSheetsSync,
  } = useApp();

  const [isPullingSheets, setIsPullingSheets] = useState(false);
  const [isPushingSheets, setIsPushingSheets] = useState(false);
  const [trainerSyncMsg, setTrainerSyncMsg] = useState<string | null>(null);

  const handlePushToSheets = async () => {
    setIsPushingSheets(true);
    setTrainerSyncMsg('Syncing all agent shifts and timesheets to Google Sheets...');
    const res = await triggerGoogleSheetsSync();
    setIsPushingSheets(false);
    if (res && res.success) {
      setTrainerSyncMsg(`✓ ${res.message || 'Successfully updated Google Spreadsheet!'}`);
      setTimeout(() => setTrainerSyncMsg(null), 7000);
    } else {
      setTrainerSyncMsg(`Notice: ${res?.message || 'Check Webhook configuration'}`);
    }
  };

  const [selectedOS, setSelectedOS] = useState<DesktopOS>('windows');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const [timesheetSearch, setTimesheetSearch] = useState('');
  const [timesheetFilter, setTimesheetFilter] = useState<'all' | 'today'>('all');

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editTask, setEditTask] = useState('');
  const [editDurationHours, setEditDurationHours] = useState<number>(0);

  const [showAddLogModal, setShowAddLogModal] = useState(false);
  const [newLogUserId, setNewLogUserId] = useState('');
  const [newLogDate, setNewLogDate] = useState(getManilaDateString());
  const [newLogTask, setNewLogTask] = useState('Email Reachout');
  const [newLogHours, setNewLogHours] = useState(8);
  const [newLogNotes, setNewLogNotes] = useState('Trainer direct manual entry');

  const ITEMS_PER_PAGE = 10;
  const [empPage, setEmpPage] = useState(1);
  const [agentPage, setAgentPage] = useState(1);
  const [timesheetPage, setTimesheetPage] = useState(1);
  const [idlePage, setIdlePage] = useState(1);
  const [leavePage, setLeavePage] = useState(1);

  useEffect(() => {
    setTimesheetPage(1);
  }, [timesheetSearch, timesheetFilter]);

  useEffect(() => {
    setEmpPage(1);
  }, [searchTerm, roleFilter]);

  const manageableUsers = users.filter((u) => u.role !== 'admin');

  const filteredUsers = manageableUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.employeeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.designation.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const teamLeadsAndTrainers = users.filter(
    (u) => u.role === 'team_lead' || u.role === 'trainer' || u.role === 'admin'
  );

  const traineeAgents = users.filter(
    (u) => u.role === 'agent' && u.id !== currentUser?.id
  );

  const pendingLeaves: LeaveRequest[] = leaveRequests.filter((r) => r.status === 'pending');
  const sortedIdleLogs: IdleLog[] = [...idleLogs].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const totalTrackedSec = timeLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
  const totalTrackedHours = (totalTrackedSec / 3600).toFixed(1);

  const handleDownloadApp = (os: DesktopOS = selectedOS) => {
    downloadDesktopSoftwarePackage(os);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 5000);
  };

  const handleReassignSupervisor = (agentId: string, newLeaderId: string) => {
    updateUser(agentId, { teamLeaderId: newLeaderId });
  };

  const handleStartEditLog = (log: TimeLog) => {
    setEditingLogId(log.id);
    setEditTask(log.task);
    setEditDurationHours(Number((log.durationSeconds / 3600).toFixed(2)));
  };

  const handleSaveEditedLog = (logId: string) => {
    updateTimeLog(logId, {
      task: editTask as any,
      durationSeconds: Math.round(editDurationHours * 3600),
    });
    setEditingLogId(null);
  };

  const handleCreateDirectTimeLog = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = users.find((u) => u.id === (newLogUserId || traineeAgents[0]?.id)) || currentUser;
    if (!targetUser) return;
    const todayDate = newLogDate || getManilaDateString();
    const startIso = `${todayDate}T09:00:00.000Z`;
    const endIso = `${todayDate}T17:00:00.000Z`;

    addTimeLog({
      userId: targetUser.id,
      userName: targetUser.name,
      userAvatar: '',
      designation: targetUser.designation || 'Agent',
      task: newLogTask as any,
      startTime: startIso,
      endTime: endIso,
      durationSeconds: Math.round(Number(newLogHours) * 3600),
      status: 'completed',
      geoTimezone: 'Asia/Manila',
      geoLocalStartTime: '09:00 AM',
      geoLocalEndTime: '05:00 PM',
      mouseActivityAvg: 95,
      keyboardActivityAvg: 92,
      idleSeconds: 0,
      date: todayDate,
      notes: newLogNotes || 'Trainer direct timesheet manual override',
      appsUsed: [{ appName: 'LLC-Time-Tracker-V2 Desktop App', icon: 'laptop', durationSeconds: Math.round(Number(newLogHours) * 3600), category: 'productive' }],
    });
    setShowAddLogModal(false);
  };

  const sortedFilteredTimeLogs: TimeLog[] = useMemo(() => {
    const query = timesheetSearch.trim().toLowerCase();
    const today = getManilaDateString();
    return [...timeLogs]
      .filter((log) => {
        const matchesSearch =
          !query ||
          log.userName.toLowerCase().includes(query) ||
          log.task.toLowerCase().includes(query) ||
          (log.userId && log.userId.toLowerCase().includes(query)) ||
          ((log as any).employeeCode && String((log as any).employeeCode).toLowerCase().includes(query));
        if (!matchesSearch) return false;
        if (timesheetFilter === 'today') {
          const normDate = log.date || (log.startTime ? log.startTime.split('T')[0] : '');
          return normDate === today;
        }
        return true;
      })
      .sort((a, b) => {
        const getTimestamp = (l: TimeLog) => {
          if (l.startTime && !isNaN(Date.parse(l.startTime))) {
            return new Date(l.startTime).getTime();
          }
          if (l.date) {
            const parsed = new Date(`${l.date}T12:00:00Z`).getTime();
            if (!isNaN(parsed)) return parsed;
          }
          return 0;
        };
        return getTimestamp(b) - getTimestamp(a);
      });
  }, [timeLogs, timesheetSearch, timesheetFilter]);

  const getPaginatedItems = <T,>(items: T[], page: number, perPage: number = ITEMS_PER_PAGE): T[] => {
    const startIndex = (page - 1) * perPage;
    return items.slice(startIndex, startIndex + perPage);
  };

  const totalEmpPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE) || 1;
  const totalAgentPages = Math.ceil(traineeAgents.length / ITEMS_PER_PAGE) || 1;
  const totalTimesheetPages = Math.ceil(sortedFilteredTimeLogs.length / ITEMS_PER_PAGE) || 1;
  const totalIdlePages = Math.ceil(sortedIdleLogs.length / ITEMS_PER_PAGE) || 1;
  const totalLeavePages = Math.ceil(pendingLeaves.length / ITEMS_PER_PAGE) || 1;

  const currentFilteredUsers: User[] = getPaginatedItems<User>(filteredUsers, empPage);
  const currentAgents: User[] = getPaginatedItems<User>(traineeAgents, agentPage);
  const currentTimeLogs: TimeLog[] = getPaginatedItems<TimeLog>(sortedFilteredTimeLogs, timesheetPage);
  const currentIdleLogs: IdleLog[] = getPaginatedItems<IdleLog>(sortedIdleLogs, idlePage);
  const currentLeaves: LeaveRequest[] = getPaginatedItems<LeaveRequest>(pendingLeaves, leavePage);
  const todayStr = getManilaDateString();

  return (
    <div id="trainer-dashboard-view" className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 border border-slate-700/80 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center shrink-0 shadow-md">
              <Laptop className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg text-white tracking-tight">
                  LLC-Time-Tracker-V2 Desktop Software
                </h2>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded-full font-mono font-bold">
                  Trainer Edition
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Task and coaching time tracking is handled via the official <strong>LLC-Time-Tracker-V2 Desktop Software</strong>. Download and install to manage trainees, log coaching shifts, and track onboarding activity.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOS('windows')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedOS === 'windows'
                      ? 'bg-indigo-500 text-white font-bold shadow'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  Windows OS (.exe / .bat)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOS('mac')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedOS === 'mac'
                      ? 'bg-indigo-500 text-white font-bold shadow'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  macOS (Apple .app)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOS('linux')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedOS === 'linux'
                      ? 'bg-indigo-500 text-white font-bold shadow'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  Linux OS (Binary)
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto shrink-0">
            <button
              onClick={() => handleDownloadApp(selectedOS)}
              className="px-6 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] cursor-pointer"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>Installer Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>
                    Download {selectedOS === 'windows' ? 'Windows App Builder (.bat)' : selectedOS === 'mac' ? 'macOS App Builder (.sh)' : 'Linux App Builder (.sh)'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-slate-600">Active Trainees / Staff</span>
            <GraduationCap className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{manageableUsers.length} Employees</div>
          <p className="text-[11px] text-slate-500 mt-1">Agents, Leads, Trainers, HR & Payroll</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-slate-600">Total Tracked Time</span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">{totalTrackedHours} hrs</div>
          <p className="text-[11px] text-slate-500 mt-1">Logged across all task entries</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-slate-600">Supervised Staff</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-purple-700">
            {manageableUsers.length} Members
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Assigned trainees & team members</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-slate-600">Pending Leave Requests</span>
            <FileText className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-700">{pendingLeaves.length} Applications</div>
          <p className="text-[11px] text-slate-500 mt-1">Awaiting approval review</p>
        </div>
      </div>

      <LiveTrackingTable
        title="Live Trainee & Staff Tracking Feed"
        description="Real-time database-driven presence tracking, active coaching tasks, and team members under training."
      />

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-600" /> Employee & Trainee Management Console
            </h3>
            <p className="text-xs text-slate-500">
              Add new trainees, edit staff details, transfer agents to team leaders, and manage team member onboarding.
            </p>
          </div>
          <button
            onClick={onOpenAddUserModal}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-md transition-all shrink-0"
          >
            <UserPlus className="w-4 h-4" /> Add Employee / Trainee
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search name, email, or employee code..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 text-slate-800 rounded-xl pl-9 pr-3 py-2 font-medium focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-semibold text-slate-600">Filter Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-800 rounded-xl px-3 py-1.5 font-semibold focus:outline-none"
            >
              <option value="all">All Roles (Non-Admin)</option>
              <option value="agent">Agent</option>
              <option value="team_lead">Team Lead</option>
              <option value="trainer">Trainer</option>
              <option value="hr">HR Specialist</option>
              <option value="payroll">Payroll Officer</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">ID No.</th>
                <th className="py-3.5 px-4">Employee</th>
                <th className="py-3.5 px-4">Role & Designation</th>
                <th className="py-3.5 px-4">Assigned Team Lead</th>
                <th className="py-3.5 px-4">Date Hired</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {currentFilteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No employees match your search filter criteria.
                  </td>
                </tr>
              ) : (
                currentFilteredUsers.map((usr) => {
                  return (
                    <tr key={usr.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 whitespace-nowrap">
                        #{usr.employeeCode}
                      </td>
                      <td className="py-3.5 px-4">
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{usr.name}</div>
                          <div className="text-[11px] text-slate-500">{usr.email}</div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{usr.designation}</div>
                        <span className="bg-indigo-50 border border-indigo-200 text-indigo-800 px-2 py-0.5 rounded font-bold uppercase text-[10px] inline-block mt-0.5">
                          {usr.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <select
                          value={usr.teamLeaderId || ''}
                          onChange={(e) => handleReassignSupervisor(usr.id, e.target.value)}
                          className="bg-slate-50 border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1.5 font-semibold text-xs focus:ring-2 focus:ring-indigo-500 w-full max-w-[180px]"
                        >
                          <option value="">None / Training Pool</option>
                          {teamLeadsAndTrainers.map((tl) => (
                            <option key={tl.id} value={tl.id}>
                              {tl.name} ({tl.designation})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-700 font-semibold whitespace-nowrap">
                        {usr.joinDate || '2024-01-15'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onEditUser(usr)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold text-[11px] flex items-center gap-1 transition-all"
                          title="Edit Employee Details"
                        >
                          <Edit className="w-3.5 h-3.5" /> Edit
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
