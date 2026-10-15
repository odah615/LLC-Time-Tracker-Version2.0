import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { User, UserPresence, DailyAttendanceLog } from '../types';
import { UserAvatar } from './UserAvatar';
import { getManilaDateString, formatDurationHuman, formatLogStartTime, formatLastSeen } from '../lib/dateUtils';
import {
  Radio,
  Search,
  Filter,
  Users,
  Clock,
  Laptop,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MousePointer,
  Keyboard,
  Activity,
  EyeOff,
} from 'lucide-react';

interface LiveTrackingTableProps {
  title?: string;
  description?: string;
  teamLeaderId?: string;
}

export const LiveTrackingTable: React.FC<LiveTrackingTableProps> = ({
  title = 'Live System Tracking & Real-Time Presence',
  description = 'Real-time database-driven presence tracking for all employees, leaders, trainers, and staff.',
  teamLeaderId,
}) => {
  const {
    users,
    userPresenceList,
    dailyAttendanceLogs,
    timeLogs,
    formatDuration,
    importPresenceFromGoogleSheets,
    syncAllFromGoogleSheets,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<'my_team' | 'all'>(
    teamLeaderId ? 'my_team' : 'all'
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPullingSheets, setIsPullingSheets] = useState(false);

  const todayStr = getManilaDateString();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await importPresenceFromGoogleSheets();
    } catch (e) {}
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handlePullFromSheets = async () => {
    setIsPullingSheets(true);
    await syncAllFromGoogleSheets();
    setIsPullingSheets(false);
  };

  const liveUsersData = useMemo(() => {
    const now = Date.now();
    const nonAdminUsers = users.filter((u) => {
      return !(
        u.role === 'admin' ||
        u.isSecretBackup === true ||
        u.employeeCode?.toLowerCase() === 'superadmin' ||
        u.id === 'usr-superadmin-red' ||
        u.id === 'usr-superadmin-root' ||
        u.email === 'admin@llc.com'
      );
    });

    return nonAdminUsers.map((user) => {
      const presence = userPresenceList.find((p) => {
        if (!p) return false;
        if (p.userId === user.id) return true;
        const pCode = (p.employeeCode || '').toUpperCase().trim();
        const uCode = (user.employeeCode || '').toUpperCase().trim();
        if (pCode && uCode && pCode === uCode) return true;
        const pName = (p.userName || '').toLowerCase().trim();
        const uName = (user.name || '').toLowerCase().trim();
        if (pName && uName && (pName === uName || uName.includes(pName) || pName.includes(uName))) return true;
        return false;
      });

      const lastHeartbeatMs = presence?.lastHeartbeat ? new Date(presence.lastHeartbeat).getTime() : 0;
      const diffMs = now - lastHeartbeatMs;
      const isRecent = diffMs < 12 * 60 * 1000;

      const isDesktopPlatform =
        presence?.loginPlatform === 'software' ||
        presence?.currentApp?.toLowerCase().includes('desktop') ||
        !!presence?.isTracking;
      const isWebPlatform =
        presence?.loginPlatform === 'webapp' ||
        (!isDesktopPlatform && (presence?.isOnline || isRecent));

      let calculatedStatus: 'online' | 'idle' | 'offline' = 'offline';
      let presenceMode: 'tracking' | 'desktop_online' | 'web_online' | 'idle' | 'offline' = 'offline';

      if (presence?.isTracking && (isRecent || presence.isOnline)) {
        calculatedStatus = 'online';
        presenceMode = 'tracking';
      } else if (isDesktopPlatform && (presence?.isOnline || isRecent)) {
        if (presence?.isPaused || presence?.status === 'idle') {
          calculatedStatus = 'idle';
          presenceMode = 'idle';
        } else {
          calculatedStatus = 'online';
          presenceMode = 'desktop_online';
        }
      } else if (isWebPlatform && (presence?.isOnline || isRecent)) {
        calculatedStatus = 'online';
        presenceMode = 'web_online';
      } else {
        calculatedStatus = 'offline';
        presenceMode = 'offline';
      }

      const attendance = dailyAttendanceLogs.find(
        (a) => a.userId === user.id && a.date === todayStr
      );

      const userTodayLogs = timeLogs.filter(
        (l) => l.userId === user.id && l.date === todayStr
      );
      const finishedTodaySec = userTodayLogs.reduce(
        (acc, l) => acc + l.durationSeconds,
        0
      );
      const latestLog = userTodayLogs[0] || timeLogs.find((l) => l.userId === user.id);

      let taskElapsedSeconds = 0;
      if (presenceMode === 'tracking' || presenceMode === 'idle') {
        taskElapsedSeconds = presence?.elapsedSeconds || 0;
        if (presence?.isTracking && !presence?.isPaused && diffMs > 0 && diffMs < 60000) {
          taskElapsedSeconds += Math.floor(diffMs / 1000);
        }
      }

      const liveRunningSec = (presenceMode === 'tracking' || presence?.isTracking) ? taskElapsedSeconds : 0;
      const totalTodaySec = finishedTodaySec + liveRunningSec;
      const isTracking = presenceMode === 'tracking';

      let currentTask = 'Shift Concluded';
      let currentApp = 'None';
      if (isTracking) {
        currentTask = presence?.currentTask || latestLog?.task || 'Active Task';
        currentApp = presence?.currentApp || 'LLC-Time-Tracker-V2 Desktop App';
      } else if (presenceMode === 'desktop_online') {
        currentTask = 'Desktop App Standby (Timer Not Started)';
        currentApp = 'LLC-Time-Tracker-V2 Desktop App';
      } else if (presenceMode === 'web_online') {
        currentTask = presence?.currentTask || 'Web Portal Active';
        currentApp = 'Web Browser';
      } else if (presenceMode === 'idle') {
        currentTask = `Paused (${presence?.currentTask || latestLog?.task || 'Break'})`;
        currentApp = presence?.currentApp || 'LLC-Time-Tracker-V2 Desktop App';
      } else {
        currentTask = 'Shift Concluded';
        currentApp = 'None';
      }

      const mouseActivity = isTracking ? (presence?.mouseActivity ?? 100) : 0;
      const keyboardActivity = isTracking ? (presence?.keyboardActivity ?? 100) : 0;

      let firstLoginTime = '--:--';
      if (userTodayLogs.length > 0) {
        const earliestLog = userTodayLogs[userTodayLogs.length - 1];
        firstLoginTime = formatLogStartTime(earliestLog.startTime, 'Asia/Manila') || earliestLog.geoLocalStartTime || '--:--';
      } else if (isDesktopPlatform && attendance?.firstLoginTime && attendance.firstLoginTime !== '--:--') {
        firstLoginTime = attendance.firstLoginTime;
      } else if (isDesktopPlatform && presence?.loginTime) {
        firstLoginTime = formatLogStartTime(presence.loginTime, 'Asia/Manila');
      }

      return {
        user,
        presence,
        attendance,
        calculatedStatus,
        presenceMode,
        currentTask,
        currentApp,
        mouseActivity,
        keyboardActivity,
        totalTodaySec,
        taskElapsedSeconds,
        firstLoginTime,
        lastHeartbeat: presence?.lastHeartbeat || 'N/A',
      };
    });
  }, [users, userPresenceList, dailyAttendanceLogs, timeLogs, todayStr]);

  const filteredData = useMemo(() => {
    return liveUsersData.filter((item) => {
      if (teamLeaderId && scopeFilter === 'my_team') {
        if (item.user.teamLeaderId !== teamLeaderId && item.user.id !== teamLeaderId) {
          return false;
        }
      }
      if (roleFilter !== 'all' && item.user.role !== roleFilter) {
        return false;
      }
      if (statusFilter !== 'all' && item.calculatedStatus !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = item.user.name.toLowerCase().includes(term);
        const matchesCode = item.user.employeeCode.toLowerCase().includes(term);
        const matchesEmail = item.user.email.toLowerCase().includes(term);
        const matchesDesig = item.user.designation.toLowerCase().includes(term);
        const matchesTask = item.currentTask.toLowerCase().includes(term);
        const matchesApp = item.currentApp.toLowerCase().includes(term);
        if (!matchesName && !matchesCode && !matchesEmail && !matchesDesig && !matchesTask && !matchesApp) {
          return false;
        }
      }
      return true;
    });
  }, [liveUsersData, teamLeaderId, scopeFilter, roleFilter, statusFilter, searchTerm]);

  const totalCount = filteredData.length;
  const trackingCount = filteredData.filter((d) => d.calculatedStatus === 'online' && d.presence?.isTracking).length;
  const onlineOnlyCount = filteredData.filter((d) => d.calculatedStatus === 'online' && !d.presence?.isTracking).length;
  const idleCount = filteredData.filter((d) => d.calculatedStatus === 'idle').length;
  const offlineCount = filteredData.filter((d) => d.calculatedStatus === 'offline').length;

  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedData = useMemo(() => {
    const start = (safePage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, safePage, itemsPerPage]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-emerald-50 text-emerald-800 border border-emerald-300/80 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Real-Time Feed
            </span>
            <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold">
              LLC-Time-Tracker-V2
            </span>
          </div>
          <h3 className="font-extrabold text-xl text-slate-900 flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-600 animate-pulse" />
            {title}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1.5 text-xs font-semibold">
            <span className="px-2.5 py-1 text-emerald-700 font-bold flex items-center gap-1.5 bg-emerald-100/60 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {trackingCount} Tracking
            </span>
            <span className="px-2.5 py-1 text-blue-700 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              {onlineOnlyCount} Online
            </span>
            <span className="px-2.5 py-1 text-amber-700 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {idleCount} Idle
            </span>
            <span className="px-2.5 py-1 text-slate-500 font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              {offlineCount} Offline
            </span>
          </div>
          <button
            onClick={handlePullFromSheets}
            disabled={isPullingSheets}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1.5 text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
            title="Pull Live Presence & Data directly from Google Sheets Database"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPullingSheets ? 'animate-spin' : ''}`} />
            <span>{isPullingSheets ? 'Pulling Sheets...' : 'Pull Google Sheets'}</span>
          </button>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
            title="Refresh Real-time Status"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200 text-xs">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, employee #, role, task, or app..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-white border border-slate-200 text-slate-900 rounded-xl pl-9 pr-3 py-2 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {teamLeaderId && (
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 font-semibold">
              <button
                onClick={() => {
                  setScopeFilter('my_team');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-lg transition-all ${
                  scopeFilter === 'my_team'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                My Supervised Team
              </button>
              <button
                onClick={() => {
                  setScopeFilter('all');
                  setCurrentPage(1);
                }}
                className={`px-3 py-1 rounded-lg transition-all ${
                  scopeFilter === 'all'
                    ? 'bg-slate-900 text-white font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Company Staff
              </button>
            </div>
          )}

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="team_lead">Team Leaders</option>
              <option value="agent">Agents</option>
              <option value="trainer">Trainers</option>
              <option value="hr">HR & Admin</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-transparent text-slate-800 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="online">Online Only</option>
              <option value="idle">Idle Only</option>
              <option value="offline">Offline Only</option>
            </select>
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-slate-600">
            <span>Show:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
              <th className="py-3.5 px-4">Employee</th>
              <th className="py-3.5 px-3">Platform Mode</th>
              <th className="py-3.5 px-3">Live Presence</th>
              <th className="py-3.5 px-4">Active Task & Work Window</th>
              <th className="py-3.5 px-3">First Check-in</th>
              <th className="py-3.5 px-3">Hours Today</th>
              <th className="py-3.5 px-4 text-center">Activity Index</th>
              <th className="py-3.5 px-3 text-right">Heartbeat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-medium">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Users className="w-8 h-8 text-slate-300" />
                    <p className="font-semibold text-slate-600">No matching employees found.</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => {
                const isOnline = row.calculatedStatus === 'online';
                const isIdle = row.calculatedStatus === 'idle';
                const isOffline = row.calculatedStatus === 'offline';
                const isDesktop = row.presenceMode === 'tracking' || row.presenceMode === 'desktop_online' || (row.presence?.loginPlatform === 'software');
                const isWeb = row.presenceMode === 'web_online' || (row.presence?.loginPlatform === 'webapp');
                return (
                  <tr
                    key={row.user.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="relative shrink-0">
                          <UserAvatar
                            name={row.user.name}
                            role={row.user.role}
                            size="md"
                          />
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-2 ring-white ${
                              isOnline
                                ? 'bg-emerald-500'
                                : isIdle
                                ? 'bg-amber-500'
                                : 'bg-slate-300'
                            }`}
                            title={`Status: ${row.calculatedStatus.toUpperCase()}`}
                          />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                            <span>{row.user.name}</span>
                            <span className="font-mono text-[10px] text-slate-400 font-normal">
                              #{row.user.employeeCode}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <span>{row.user.designation}</span>
                            <span className="text-slate-300">•</span>
                            <span className="text-slate-400 font-semibold">{row.user.department || 'Operations'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {isDesktop ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-50 border border-indigo-200 text-indigo-700 shadow-2xs">
                          <Laptop className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>Desktop Tracker</span>
                        </span>
                      ) : isWeb ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-teal-50 border border-teal-200 text-teal-700 shadow-2xs">
                          <Activity className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span>Website</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-400">
                          <span>None / Offline</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3">
                      {row.presenceMode === 'tracking' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                          Live Tracking
                        </span>
                      )}
                      {row.presenceMode === 'desktop_online' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 border border-blue-200 text-blue-700 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                          Desktop Online
                        </span>
                      )}
                      {row.presenceMode === 'web_online' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-50 border border-teal-200 text-teal-800 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-teal-500" />
                          Website Active
                        </span>
                      )}
                      {row.presenceMode === 'idle' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-800 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-amber-500" />
                          Idle / Break
                        </span>
                      )}
                      {row.presenceMode === 'offline' && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 border border-slate-200 text-slate-500">
                          <span className="w-2 h-2 rounded-full bg-slate-400" />
                          Offline
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-bold text-slate-800 truncate" title={row.currentTask}>
                        {row.currentTask}
                      </div>
                      {row.taskElapsedSeconds > 0 && (
                        <div className="text-[10px] font-mono text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-emerald-500" />
                          <span>{formatDuration(row.taskElapsedSeconds)} on current task</span>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 truncate mt-0.5" title={row.currentApp}>
                        <Laptop className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{row.currentApp}</span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-slate-600 font-mono text-xs">
                      {row.firstLoginTime}
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-extrabold text-slate-900 font-mono">
                        {formatDuration(row.totalTodaySec)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {((row.totalTodaySec || 0) / 3600).toFixed(1)} hrs logged
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {!row.user.activityMonitored ? (
                        <div className="flex items-center justify-center">
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                            <EyeOff className="w-2.5 h-2.5 text-slate-400" /> Surveillance Off
                          </span>
                        </div>
                      ) : isOffline ? (
                        <div className="text-center text-slate-400 text-[11px] font-mono">--</div>
                      ) : (
                        <div className="space-y-1.5 max-w-[130px] mx-auto">
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <MousePointer className="w-2.5 h-2.5 text-blue-500" /> Mouse
                            </span>
                            <span className="font-mono font-bold text-slate-800">{row.mouseActivity}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-blue-600 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, row.mouseActivity))}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span className="flex items-center gap-1">
                              <Keyboard className="w-2.5 h-2.5 text-emerald-500" /> Keys
                            </span>
                            <span className="font-mono font-bold text-slate-800">{row.keyboardActivity}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-600 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, row.keyboardActivity))}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right">
                      {isOffline ? (
                        <span className="text-slate-400 text-[11px] font-mono">{formatLastSeen(row.lastHeartbeat)}</span>
                      ) : (
                        <span className="text-emerald-700 text-[11px] font-mono font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {formatLastSeen(row.lastHeartbeat)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200 text-xs text-slate-600 font-medium">
          <div>
            Showing <strong className="text-slate-900">{paginatedData.length}</strong> of{' '}
            <strong className="text-slate-900">{totalCount}</strong> employees
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent font-semibold flex items-center gap-1 transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
              <button
                key={pNum}
                onClick={() => setCurrentPage(pNum)}
                className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                  safePage === pNum
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {pNum}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent font-semibold flex items-center gap-1 transition-all"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
