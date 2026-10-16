import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { User, IdleLog, LeaveRequest } from '../../types';
import { downloadDesktopSoftwarePackage, DesktopOS } from '../../lib/desktopDownloader';
import { isEmployeeAssignedToSupervisor } from '../../lib/userUtils';
import { UserAvatar } from '../UserAvatar';
import { LiveAgentTasksBoard } from '../LiveAgentTasksBoard';
import {
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileText,
  Laptop,
  Monitor,
  Download,
  Check,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Search,
} from 'lucide-react';

export const TeamLeadDashboardView: React.FC = () => {
  const {
    currentUser,
    users,
    userPresenceList,
    timeLogs,
    idleLogs,
    leaveRequests,
    approveLeaveRequest,
    rejectLeaveRequest,
    formatDuration,
  } = useApp();

  const [selectedOS, setSelectedOS] = useState<DesktopOS>('windows');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const [agentPage, setAgentPage] = useState(1);
  const [idlePage, setIdlePage] = useState(1);
  const [leavePage, setLeavePage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const ITEMS_PER_PAGE = 10;

  const teamAgents: User[] = users.filter((u) => {
    if (u.id === currentUser.id) return false;
    if (currentUser.role === 'admin') return true;
    return isEmployeeAssignedToSupervisor(u, currentUser, users);
  });

  const filteredAgents: User[] = teamAgents.filter((agent) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    return (
      agent.name?.toLowerCase().includes(q) ||
      agent.username?.toLowerCase().includes(q) ||
      agent.email?.toLowerCase().includes(q) ||
      agent.employeeCode?.toLowerCase().includes(q) ||
      agent.designation?.toLowerCase().includes(q) ||
      agent.department?.toLowerCase().includes(q)
    );
  });

  const pendingLeaves: LeaveRequest[] = leaveRequests.filter((r) => r.status === 'pending');

  const sortedIdleLogs: IdleLog[] = [...idleLogs].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const totalTeamSec = timeLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
  const totalTeamHours = (totalTeamSec / 3600).toFixed(1);

  const handleDownloadApp = (os: DesktopOS = selectedOS) => {
    downloadDesktopSoftwarePackage(os);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 5000);
  };

  const getPaginatedItems = <T,>(items: T[], page: number, perPage: number = ITEMS_PER_PAGE): T[] => {
    const startIndex = (page - 1) * perPage;
    return items.slice(startIndex, startIndex + perPage);
  };

  const totalAgentPages = Math.ceil(filteredAgents.length / ITEMS_PER_PAGE) || 1;
  const totalIdlePages = Math.ceil(sortedIdleLogs.length / ITEMS_PER_PAGE) || 1;
  const totalLeavePages = Math.ceil(pendingLeaves.length / ITEMS_PER_PAGE) || 1;

  const currentAgents: User[] = getPaginatedItems(filteredAgents, agentPage);
  const currentIdleLogs: IdleLog[] = getPaginatedItems(sortedIdleLogs, idlePage);
  const currentLeaves: LeaveRequest[] = getPaginatedItems(pendingLeaves, leavePage);

  return (
    <div id="team-lead-dashboard-view" className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 border border-slate-700/80 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md">
              <Laptop className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg text-white tracking-tight">
                  LLC-Time-Tracker-V2 Desktop Software
                </h2>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-mono font-bold">
                  Team Leader Edition
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Install the native standalone desktop software client on Windows, macOS, or Linux for high-precision time tracking, shift logging, and team supervisor management.
              </p>
              <div className="pt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedOS('windows')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedOS === 'windows'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  Windows PC (.exe / .bat)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOS('mac')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedOS === 'mac'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
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
                      ? 'bg-amber-500 text-slate-950 font-bold shadow'
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
              className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98] cursor-pointer"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-4 h-4 text-slate-950" />
                  <span>Installer Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>
                    Download {selectedOS === 'windows' ? 'Windows App (.bat)' : selectedOS === 'mac' ? 'macOS App (.sh)' : 'Linux App (.sh)'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-700/60 flex flex-wrap items-center justify-between gap-4 text-[11px] text-slate-400">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Team Leader Management Suite
            </span>
            <span>•</span>
            <span className="flex items-center gap-1.5 text-slate-300">
              <Monitor className="w-3.5 h-3.5 text-blue-400" /> Live Team Monitoring & Audits
            </span>
          </div>
          <span className="text-slate-400">LLC-Time-Tracker-V2</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-slate-600">Supervised Agents</span>
            <Users className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900">{teamAgents.length} Agents</div>
          <p className="text-[11px] text-slate-500 mt-1">Active team roster</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-slate-600">Team Total Hours</span>
            <Clock className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 font-mono">{totalTeamHours} hrs</div>
          <p className="text-[11px] text-slate-500 mt-1">Logged across all tasks</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold text-slate-600">Pending Leave Requests</span>
            <FileText className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-purple-600">
            {pendingLeaves.length} Item(s)
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Awaiting team lead approval</p>
        </div>
      </div>

      <LiveAgentTasksBoard
        title="Live Supervised Agent Tasks & Real-Time Presence"
        description="Real-time live monitoring of what your supervised agents are doing right now, with live agent headcount graphs and task breakdown analytics."
        teamLeaderId={currentUser.id}
        showAnalyticsTabs={true}
      />

      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-200">
            <div>
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-600" /> Team Member Details
              </h3>
              <p className="text-xs text-slate-500">
                Showing {currentAgents.length} of {filteredAgents.length} filtered team members ({teamAgents.length} total assigned)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search team members by name, email, role..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setAgentPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 text-slate-900 placeholder:text-slate-400 font-medium"
                />
              </div>
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  onClick={() => setAgentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={agentPage === 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
                {Array.from({ length: totalAgentPages }, (_, i) => i + 1).map((pNum) => (
                  <button
                    key={pNum}
                    onClick={() => setAgentPage(pNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                      agentPage === pNum
                        ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {pNum}
                  </button>
                ))}
                <button
                  onClick={() => setAgentPage((prev) => Math.min(prev + 1, totalAgentPages))}
                  disabled={agentPage === totalAgentPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition-all flex items-center gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentAgents.map((agent) => {
              const agentAllLogs = timeLogs.filter((l) => l.userId === agent.id);
              const lastLog = agentAllLogs[0];
              const todayStr = new Date().toISOString().split('T')[0];
              const agentTodayLogs = agentAllLogs.filter((l) => l.date === todayStr);
              const baseTodaySec = agentTodayLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
              const presence = userPresenceList.find(
                (p) =>
                  p.userId === agent.id ||
                  (p.employeeCode && agent.employeeCode && p.employeeCode.toUpperCase() === agent.employeeCode.toUpperCase()) ||
                  (p.userName && agent.name && p.userName.toLowerCase().trim() === agent.name.toLowerCase().trim())
              );
              const now = Date.now();
              const lastHeartbeat = presence ? new Date(presence.lastHeartbeat).getTime() : 0;
              const isRecent = now - lastHeartbeat < 12 * 60 * 1000;
              const isTracking = !!presence?.isTracking && (isRecent || !!presence?.isOnline);
              const isIdle = presence?.status === 'idle' || !!presence?.isPaused;
              const liveActiveSec = isTracking ? (presence?.elapsedSeconds || 0) : 0;
              const totalTodayTrackedSec = baseTodaySec + liveActiveSec;
              return (
                <div
                  key={agent.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 hover:border-slate-300 transition-all shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        name={agent.name}
                        role={agent.role}
                        size="lg"
                      />
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{agent.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">#{agent.employeeCode} • {agent.designation}</div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-lg text-xs space-y-2 border border-slate-200">
                    <div className="flex justify-between items-center text-slate-700">
                      <span className="text-slate-500 font-medium">Time Tracked Today:</span>
                      <strong className={`font-mono text-sm ${isTracking ? 'text-emerald-700 font-black' : 'text-slate-900'}`}>
                        {formatDuration(totalTodayTrackedSec)}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
