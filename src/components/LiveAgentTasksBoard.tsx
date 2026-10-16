import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { User, TaskCategory, TimeLog } from '../types';
import { UserAvatar } from './UserAvatar';
import {
  getManilaDateString,
  getManilaTimeString,
  formatDurationHuman,
  formatLogStartTime,
  formatLastSeen,
} from '../lib/dateUtils';
import { isEmployeeAssignedToSupervisor } from '../lib/userUtils';
import {
  Radio,
  Clock,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Calendar,
  BarChart3,
  PieChart as PieIcon,
  Laptop,
  MousePointer,
  Keyboard,
  Shield,
  EyeOff,
  LogIn,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';

interface LiveAgentTasksBoardProps {
  title?: string;
  description?: string;
  teamLeaderId?: string;
  showAnalyticsTabs?: boolean;
}

type TimeframeMode = 'daily' | 'weekly' | 'monthly';

const TASK_COLORS: Record<string, string> = {
  'Data Entry & Market Research': '#2563eb',
  'Data Entry': '#2563eb',
  'Email Reachout': '#10b981',
  'Email Reachout & Follow-up': '#10b981',
  'Follow-up': '#06b6d4',
  'Inbound / Outbound Calls': '#f59e0b',
  'Training': '#8b5cf6',
  'Team Meeting': '#ec4899',
  'Coaching': '#6366f1',
  'Escalation Resolution': '#ef4444',
  'QA Review': '#14b8a6',
  'System Operations': '#64748b',
  'HR & Recruitment': '#d97706',
  'Payroll Audit & Processing': '#059669',
  'Team Supervision': '#4f46e5',
};

const DEFAULT_COLOR = '#3b82f6';

export const LiveAgentTasksBoard: React.FC<LiveAgentTasksBoardProps> = ({
  title = 'Live Agent Sessions & Real-Time Task Tracker',
  description = 'Real-time monitoring of what each agent is working on right now, with live headcount graphs and task breakdowns per day, week, and month.',
  teamLeaderId,
  showAnalyticsTabs = true,
}) => {
  const {
    users,
    userPresenceList,
    dailyAttendanceLogs,
    timeLogs,
    formatDuration,
  } = useApp();

  const [, setClockTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setClockTick((tick) => tick + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const getLiveLoginDurationSeconds = (loginTime?: string) => {
    if (!loginTime) return 0;
    const loginMs = new Date(loginTime).getTime();
    if (!Number.isFinite(loginMs)) return 0;
    return Math.max(0, Math.floor((Date.now() - loginMs) / 1000));
  };

  const todayStr = getManilaDateString();
  const manilaCurrentTime = getManilaTimeString();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTaskFilter, setSelectedTaskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [graphMetric, setGraphMetric] = useState<'headcount' | 'hours'>('headcount');

  const [timeframeTab, setTimeframeTab] = useState<TimeframeMode>('daily');
  const [anchorDate, setAnchorDate] = useState<string>(todayStr);

  const getMondayFriday = (refDateStr: string) => {
    const refDate = new Date(refDateStr || todayStr);
    const dayOfWeek = refDate.getDay();
    const distanceToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(refDate);
    monday.setDate(refDate.getDate() + distanceToMonday);
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return {
      start: monday.toISOString().split('T')[0],
      end: friday.toISOString().split('T')[0],
    };
  };

  const initialWeek = getMondayFriday(todayStr);
  const [weekStartDate, setWeekStartDate] = useState<string>(initialWeek.start);
  const [weekEndDate, setWeekEndDate] = useState<string>(initialWeek.end);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const isAdminAccount = (u: User) => {
    return (
      u.role === 'admin' ||
      u.isSecretBackup === true ||
      u.employeeCode?.toLowerCase() === 'superadmin' ||
      u.id === 'usr-superadmin-red' ||
      u.id === 'usr-superadmin-root' ||
      u.email === 'admin@llc.com'
    );
  };

  const targetUsers = useMemo(() => {
    if (!teamLeaderId) {
      return users.filter((u) => !isAdminAccount(u));
    }
    const leaderUser = users.find(
      (u) =>
        u.id === teamLeaderId ||
        (u.username && u.username.toLowerCase() === teamLeaderId.toLowerCase()) ||
        (u.employeeCode && u.employeeCode.toUpperCase() === teamLeaderId.toUpperCase())
    );
    return users.filter((u) => {
      if (isAdminAccount(u)) return false;
      if (leaderUser) {
        return isEmployeeAssignedToSupervisor(u, leaderUser, users);
      }
      if (u.id === teamLeaderId) return true;
      if (u.teamLeaderId && (u.teamLeaderId === teamLeaderId || u.teamLeaderId.toLowerCase() === teamLeaderId.toLowerCase())) {
        return true;
      }
      return false;
    });
  }, [users, teamLeaderId]);

  const liveAgents = useMemo(() => {
    const now = Date.now();
    return targetUsers.map((user) => {
      const presence = userPresenceList.find(
        (p) =>
          p.userId === user.id ||
          (p.employeeCode && user.employeeCode && p.employeeCode.toUpperCase() === user.employeeCode.toUpperCase()) ||
          (p.userName && user.name && p.userName.toLowerCase().trim() === user.name.toLowerCase().trim())
      );
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

      const userTodayLogs = timeLogs.filter((l) => l.userId === user.id && l.date === todayStr);
      const finishedTodaySec = userTodayLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
      const latestLog = userTodayLogs[0] || timeLogs.find((l) => l.userId === user.id);

      const attendance = dailyAttendanceLogs.find((a) => a.userId === user.id && a.date === todayStr);
      let loginTimeDisplay = '--:--';
      if (userTodayLogs.length > 0) {
        const earliestLog = userTodayLogs[userTodayLogs.length - 1];
        loginTimeDisplay = formatLogStartTime(earliestLog.startTime, 'Asia/Manila') || earliestLog.geoLocalStartTime || '--:--';
      } else if (attendance?.firstLoginTime && attendance.firstLoginTime !== '--:--') {
        loginTimeDisplay = attendance.firstLoginTime;
      } else if (presence?.loginTime) {
        loginTimeDisplay = formatLogStartTime(presence.loginTime, 'Asia/Manila');
      }

      let taskElapsedSeconds = 0;
      if (presenceMode === 'tracking' || presenceMode === 'idle') {
        taskElapsedSeconds = presence?.elapsedSeconds || 0;
        if (presence?.isTracking && !presence?.isPaused && diffMs > 0 && diffMs < 180000) {
          taskElapsedSeconds += Math.floor(diffMs / 1000);
        }
      }

      const liveRunningSec = (presenceMode === 'tracking' || presence?.isTracking) ? taskElapsedSeconds : 0;
      const todayTotalSec = finishedTodaySec + liveRunningSec;

      let currentTaskName = 'Shift Concluded';
      if (presenceMode === 'tracking') {
        currentTaskName = presence?.currentTask || latestLog?.task || 'Data Entry & Market Research';
      } else if (presenceMode === 'desktop_online') {
        currentTaskName = 'Desktop App Standby (Timer Not Started)';
      } else if (presenceMode === 'web_online') {
        currentTaskName = presence?.currentTask || 'Web Portal Active';
      } else if (presenceMode === 'idle') {
        currentTaskName = `Paused (${presence?.currentTask || latestLog?.task || 'Break'})`;
      } else {
        currentTaskName = 'Shift Concluded';
      }

      const currentApp = presenceMode === 'tracking'
        ? (presence?.currentApp || 'LLC-Time-Tracker-V2 Desktop App')
        : (presenceMode === 'desktop_online' || presenceMode === 'idle'
            ? 'LLC-Time-Tracker-V2 Desktop App'
            : (presenceMode === 'web_online' ? 'Web Browser' : 'None'));

      const mouseActivity = presenceMode === 'tracking' ? (presence?.mouseActivity ?? 80) : 0;
      const keyboardActivity = presenceMode === 'tracking' ? (presence?.keyboardActivity ?? 85) : 0;
      const supervisor = users.find((u) => u.id === user.teamLeaderId);

      return {
        user,
        presence,
        calculatedStatus,
        presenceMode,
        currentTaskName: currentTaskName || 'Data Entry & Market Research',
        currentApp,
        mouseActivity,
        keyboardActivity,
        todayTotalSec,
        loginTimeDisplay: loginTimeDisplay || '--:--',
        taskElapsedSeconds,
        supervisorName: supervisor?.name || 'Direct / Management',
        latestLog,
      };
    });
  }, [targetUsers, userPresenceList, timeLogs, todayStr, users, dailyAttendanceLogs]);

  const filteredLiveAgents = useMemo(() => {
    return liveAgents.filter((agent) => {
      if (statusFilter !== 'all' && agent.calculatedStatus !== statusFilter) {
        return false;
      }
      if (selectedTaskFilter !== 'all' && !agent.currentTaskName.toLowerCase().includes(selectedTaskFilter.toLowerCase())) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = agent.user.name.toLowerCase().includes(term);
        const matchesCode = agent.user.employeeCode.toLowerCase().includes(term);
        const matchesDesig = agent.user.designation.toLowerCase().includes(term);
        const matchesTask = agent.currentTaskName.toLowerCase().includes(term);
        const matchesApp = agent.currentApp.toLowerCase().includes(term);
        const matchesSup = agent.supervisorName.toLowerCase().includes(term);
        if (!matchesName && !matchesCode && !matchesDesig && !matchesTask && !matchesApp && !matchesSup) {
          return false;
        }
      }
      return true;
    });
  }, [liveAgents, statusFilter, selectedTaskFilter, searchTerm]);

  const [currentAgentsPage, setCurrentAgentsPage] = useState(1);
  const agentsPageSize = 10;

  useEffect(() => {
    setCurrentAgentsPage(1);
  }, [searchTerm, statusFilter, selectedTaskFilter]);

  const totalAgentsPages = Math.ceil(filteredLiveAgents.length / agentsPageSize) || 1;
  const safeAgentsPage = Math.min(currentAgentsPage, totalAgentsPages);
  const paginatedLiveAgents = useMemo(() => {
    const start = (safeAgentsPage - 1) * agentsPageSize;
    return filteredLiveAgents.slice(start, start + agentsPageSize);
  }, [filteredLiveAgents, safeAgentsPage, agentsPageSize]);

  const agentsPerTaskTodayData = useMemo(() => {
    const taskHeadcountMap: Record<string, { count: number; onlineCount: number; hours: number }> = {};
    const nonAdminUserIds = new Set(targetUsers.map((u) => u.id));

    liveAgents.forEach((agent) => {
      const task = agent.currentTaskName.replace('Last: ', '').trim();
      if (!taskHeadcountMap[task]) {
        taskHeadcountMap[task] = { count: 0, onlineCount: 0, hours: 0 };
      }
      taskHeadcountMap[task].count += 1;
      if (agent.calculatedStatus === 'online') {
        taskHeadcountMap[task].onlineCount += 1;
      }
      taskHeadcountMap[task].hours += agent.todayTotalSec / 3600;
    });

    const todayLogs = timeLogs.filter((l) => l.date === todayStr && nonAdminUserIds.has(l.userId));
    todayLogs.forEach((l) => {
      if (!taskHeadcountMap[l.task]) {
        taskHeadcountMap[l.task] = { count: 1, onlineCount: 0, hours: 0 };
      }
    });

    return Object.keys(taskHeadcountMap).map((task) => ({
      taskName: task,
      shortName: task.length > 16 ? task.substring(0, 15) + '...' : task,
      agentsCount: taskHeadcountMap[task].count,
      activeNow: taskHeadcountMap[task].onlineCount,
      totalHours: Number(taskHeadcountMap[task].hours.toFixed(1)),
      color: TASK_COLORS[task] || DEFAULT_COLOR,
    })).sort((a, b) => b.agentsCount - a.agentsCount);
  }, [liveAgents, timeLogs, todayStr, targetUsers]);

  const taskDistributionPieData = useMemo(() => {
    const total = agentsPerTaskTodayData.reduce((acc, d) => acc + d.agentsCount, 0);
    if (total === 0) return [];
    return agentsPerTaskTodayData.map((d) => ({
      name: d.taskName,
      value: d.agentsCount,
      percentage: Math.round((d.agentsCount / total) * 100),
      color: d.color,
    }));
  }, [agentsPerTaskTodayData]);

  const timeframeLogs = useMemo(() => {
    const nonAdminUserIds = new Set(targetUsers.map((u) => u.id));
    let logs = timeLogs.filter((l) => nonAdminUserIds.has(l.userId));
    if (teamLeaderId) {
      const teamUserIds = targetUsers.map((u) => u.id);
      logs = logs.filter((l) => teamUserIds.includes(l.userId));
    }
    if (timeframeTab === 'daily') {
      return logs.filter((l) => l.date === anchorDate);
    } else if (timeframeTab === 'weekly') {
      return logs.filter((l) => l.date >= weekStartDate && l.date <= weekEndDate);
    } else {
      return logs.filter((l) => {
        const d = new Date(l.date);
        return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
      });
    }
  }, [timeLogs, teamLeaderId, targetUsers, timeframeTab, anchorDate, weekStartDate, weekEndDate, selectedMonth, selectedYear]);

  const timeframeTaskBreakdown = useMemo(() => {
    const taskMap: Record<string, { totalSec: number; agentIds: Set<string>; logCount: number }> = {};
    timeframeLogs.forEach((l) => {
      if (!taskMap[l.task]) {
        taskMap[l.task] = { totalSec: 0, agentIds: new Set(), logCount: 0 };
      }
      taskMap[l.task].totalSec += l.durationSeconds;
      taskMap[l.task].agentIds.add(l.userId);
      taskMap[l.task].logCount += 1;
    });
    const totalHoursAll = timeframeLogs.reduce((acc, l) => acc + l.durationSeconds, 0) / 3600;
    return Object.keys(taskMap).map((task) => {
      const hours = taskMap[task].totalSec / 3600;
      const pct = totalHoursAll > 0 ? Math.round((hours / totalHoursAll) * 100) : 0;
      return {
        task,
        hours: Number(hours.toFixed(1)),
        durationFormatted: formatDuration(taskMap[task].totalSec),
        agentsCount: taskMap[task].agentIds.size,
        logCount: taskMap[task].logCount,
        percentage: pct,
        color: TASK_COLORS[task] || DEFAULT_COLOR,
      };
    }).sort((a, b) => b.hours - a.hours);
  }, [timeframeLogs, formatDuration]);

  const totalTimeframeHours = useMemo(() => {
    const sec = timeframeLogs.reduce((acc, l) => acc + l.durationSeconds, 0);
    return (sec / 3600).toFixed(1);
  }, [timeframeLogs]);

  const topTask = timeframeTaskBreakdown[0] || null;

  const onlineAgentsCount = liveAgents.filter((a) => a.calculatedStatus === 'online').length;
  const idleAgentsCount = liveAgents.filter((a) => a.calculatedStatus === 'idle').length;
  const offlineAgentsCount = liveAgents.filter((a) => a.calculatedStatus === 'offline').length;

  return (
    <div id="live-agent-tasks-board" className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 border border-slate-700/80 rounded-2xl p-6 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live Agent Task Stream
              </span>
              <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-mono px-2.5 py-0.5 rounded-full">
                LLC-Time-Tracker-V2
              </span>
            </div>
            <h2 className="text-2xl font-extrabold text-white flex items-center gap-2">
              <Radio className="w-6 h-6 text-emerald-400 animate-pulse" />
              {title}
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 bg-slate-950/70 border border-slate-800 p-2 rounded-2xl">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-600/80 text-emerald-300 text-xs font-bold shadow-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>{onlineAgentsCount} Working Now</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-600/80 text-amber-300 text-xs font-bold shadow-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>{idleAgentsCount} Idle / Paused</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-bold shadow-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
              <span>{offlineAgentsCount} Offline</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <BarChart3 className="w-3 h-3 text-blue-600" /> Today's Live Task Distribution
              </span>
            </div>
            <h3 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
              <span>Agents Working per Task Today</span>
            </h3>
            <p className="text-xs text-slate-500">
              Live breakdown of active agent headcount and hours logged across task categories today ({todayStr}).
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setGraphMetric('headcount')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                graphMetric === 'headcount'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Headcount (Agents)
            </button>
            <button
              onClick={() => setGraphMetric('hours')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                graphMetric === 'hours'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hours Logged (hrs)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                {graphMetric === 'headcount' ? 'Agent Headcount per Task' : 'Total Hours per Task Today'}
              </h4>
              <span className="text-[11px] font-semibold text-slate-500">
                {agentsPerTaskTodayData.length} active task categories
              </span>
            </div>
            {agentsPerTaskTodayData.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs">
                <Clock className="w-8 h-8 text-slate-300 mb-2" />
                <p>No active tasks recorded today yet.</p>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentsPerTaskTodayData} margin={{ top: 10, right: 20, left: -10, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748B' }}
                      allowDecimals={graphMetric === 'hours'}
                    />
                    <Tooltip
                      formatter={(val: any) => [
                        graphMetric === 'headcount' ? `${val} Agents` : `${val} Hours`,
                        graphMetric === 'headcount' ? 'Assigned Agents' : 'Tracked Hours',
                      ]}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.taskName || label}
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        color: '#F8FAFC',
                        borderRadius: '12px',
                        fontSize: '12px',
                        border: '1px solid #334155',
                      }}
                    />
                    <Bar
                      dataKey={graphMetric === 'headcount' ? 'agentsCount' : 'totalHours'}
                      radius={[6, 6, 0, 0]}
                    >
                      {agentsPerTaskTodayData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 sm:p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <PieIcon className="w-4 h-4 text-emerald-600" /> Share of Workforce
                </h4>
                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                  Live Ratio
                </span>
              </div>
              {taskDistributionPieData.length === 0 ? (
                <div className="h-44 flex items-center justify-center text-slate-400 text-xs">
                  No data today
                </div>
              ) : (
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={taskDistributionPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={68}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {taskDistributionPieData.map((entry, index) => (
                          <Cell key={`pie-cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: any, name: any, item: any) => [
                          `${val} Agents (${item.payload.percentage}%)`,
                          name,
                        ]}
                        contentStyle={{
                          backgroundColor: '#0F172A',
                          color: '#F8FAFC',
                          borderRadius: '12px',
                          fontSize: '11px',
                          border: '1px solid #334155',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-3 border-t border-slate-200 max-h-36 overflow-y-auto">
              {agentsPerTaskTodayData.slice(0, 4).map((item) => (
                <div key={item.taskName} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-700 font-semibold truncate" title={item.taskName}>
                      {item.taskName}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-slate-900 shrink-0 ml-2">
                    {item.agentsCount} {item.agentsCount === 1 ? 'agent' : 'agents'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-extrabold text-lg text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              <span>Current Live Agent Sessions ({filteredLiveAgents.length})</span>
            </h3>
            <p className="text-xs text-slate-500">
              Live status, active task, current application, and hardware activity for every supervised agent.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search agent, task, app..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses ({liveAgents.length})</option>
              <option value="online">● Active ({onlineAgentsCount})</option>
              <option value="idle">● Idle ({idleAgentsCount})</option>
              <option value="offline">● Offline ({offlineAgentsCount})</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedTaskFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              selectedTaskFilter === 'all'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Tasks ({liveAgents.length})
          </button>
          {agentsPerTaskTodayData.map((item) => (
            <button
              key={item.taskName}
              onClick={() => setSelectedTaskFilter(item.taskName)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                selectedTaskFilter === item.taskName
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span>{item.shortName}</span>
              <span className="bg-white/20 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
                {item.agentsCount}
              </span>
            </button>
          ))}
        </div>

        {filteredLiveAgents.length === 0 ? (
          <div className="py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No matching agent sessions found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedLiveAgents.map((agent) => {
              const isOnline = agent.calculatedStatus === 'online';
              const isIdle = agent.calculatedStatus === 'idle';
              const taskColor = TASK_COLORS[agent.currentTaskName] || DEFAULT_COLOR;
              return (
                <div
                  key={agent.user.id}
                  className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between ${
                    isOnline
                      ? 'border-emerald-300 ring-1 ring-emerald-100'
                      : isIdle
                      ? 'border-amber-300 ring-1 ring-amber-100'
                      : 'border-slate-200 opacity-90'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <UserAvatar name={agent.user.name} role={agent.user.role} size="md" />
                          <span
                            className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full ring-2 ring-white ${
                              isOnline ? 'bg-emerald-500 animate-pulse' : isIdle ? 'bg-amber-400' : 'bg-slate-400'
                            }`}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm text-slate-900">{agent.user.name}</span>
                            <span className="text-[10px] font-mono text-slate-400">#{agent.user.employeeCode}</span>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">{agent.user.designation}</p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {agent.presenceMode === 'tracking' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                            Live Tracking
                          </span>
                        )}
                        {agent.presenceMode === 'desktop_online' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            Desktop Online
                          </span>
                        )}
                        {agent.presenceMode === 'web_online' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-teal-50 text-teal-800 border border-teal-200 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                            Web Online
                          </span>
                        )}
                        {agent.presenceMode === 'idle' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Idle / Break
                          </span>
                        )}
                        {agent.presenceMode === 'offline' && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                            Offline
                          </span>
                        )}
                        <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-slate-400" />
                          <span>{formatLastSeen(agent.presence?.lastHeartbeat)}</span>
                        </span>
                        <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                          <LogIn className="w-2.5 h-2.5 text-slate-400" />
                          Check-in: <strong className="font-mono text-slate-700">{agent.loginTimeDisplay}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          <Briefcase className="w-3.5 h-3.5 text-blue-600" /> Current Task
                        </span>
                        <span className="font-medium text-slate-600 bg-white px-2 py-0.5 rounded text-[10px] flex items-center gap-1 border border-slate-200/80 shadow-2xs">
                          <Clock className="w-3 h-3 text-blue-500" />
                          Today: <strong className="text-slate-900 font-mono font-bold">{formatDurationHuman(getLiveLoginDurationSeconds(agent.presence?.loginTime))}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: taskColor }}
                        />
                        <span className="font-bold text-xs text-slate-900 truncate" title={agent.currentTaskName}>
                          {agent.currentTaskName}
                        </span>
                      </div>

                      {(isOnline || isIdle) && (
                        <div className="flex items-center justify-between bg-blue-50/90 border border-blue-200/80 rounded-lg px-2.5 py-1 text-[11px]">
                          <span className="font-semibold text-blue-900 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
                            <span>Task Elapsed Time:</span>
                          </span>
                          <span className="font-mono font-extrabold text-blue-700 bg-white px-2 py-0.5 rounded border border-blue-200/60 shadow-2xs">
                            {agent.taskElapsedSeconds > 0 ? formatDurationHuman(agent.taskElapsedSeconds) : 'Just Started (< 1m)'}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/80">
                        <span className="flex items-center gap-1">
                          <Laptop className="w-3 h-3 text-slate-400" /> App:
                        </span>
                        <span className="font-semibold text-slate-700 truncate max-w-[150px]" title={agent.currentApp}>
                          {agent.currentApp}
                        </span>
                      </div>
                    </div>

                    {agent.user.activityMonitored ? (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 mb-1">
                            <span className="flex items-center gap-1">
                              <MousePointer className="w-2.5 h-2.5 text-blue-500" /> Mouse
                            </span>
                            <span className="font-mono font-bold text-slate-900">{agent.mouseActivity}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-blue-600 h-full rounded-full transition-all"
                              style={{ width: `${agent.mouseActivity}%` }}
                            />
                          </div>
                        </div>
                        <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
                          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 mb-1">
                            <span className="flex items-center gap-1">
                              <Keyboard className="w-2.5 h-2.5 text-emerald-500" /> Keyboard
                            </span>
                            <span className="font-mono font-bold text-slate-900">{agent.keyboardActivity}%</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-600 h-full rounded-full transition-all"
                              style={{ width: `${agent.keyboardActivity}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-1">
                        <div className="bg-slate-50/80 px-2.5 py-1.5 rounded-lg border border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                          <span className="flex items-center gap-1 font-medium text-slate-500 text-[10px]">
                            <EyeOff className="w-3 h-3 text-slate-400" /> Input Activity Tracker
                          </span>
                          <span className="font-bold text-[9px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-wider">
                            Surveillance OFF
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3 text-amber-500" /> Supervised by:
                    </span>
                    <span className="font-bold text-slate-700 truncate max-w-[130px]" title={agent.supervisorName}>
                      {agent.supervisorName}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalAgentsPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <span className="text-xs text-slate-500 font-medium">
              Showing <strong className="text-slate-800 font-bold">{(safeAgentsPage - 1) * agentsPageSize + 1}</strong> to{' '}
              <strong className="text-slate-800 font-bold">{Math.min(safeAgentsPage * agentsPageSize, filteredLiveAgents.length)}</strong> of{' '}
              <strong className="text-slate-800 font-bold">{filteredLiveAgents.length}</strong> agent sessions
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentAgentsPage((p) => Math.max(1, p - 1))}
                disabled={safeAgentsPage === 1}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalAgentsPages }, (_, idx) => idx + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setCurrentAgentsPage(p)}
                    className={`w-8 h-8 rounded-xl text-xs font-bold transition-all ${
                      p === safeAgentsPage
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentAgentsPage((p) => Math.min(totalAgentsPages, p + 1))}
                disabled={safeAgentsPage === totalAgentsPages}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 transition-all"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {showAnalyticsTabs && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-indigo-600" /> Historical Task Analytics
                </span>
              </div>
              <h3 className="font-extrabold text-xl text-slate-900 flex items-center gap-2">
                <span>Task Tracking Breakdown: Per Day, Week & Month</span>
              </h3>
              <p className="text-xs text-slate-500">
                Track agent performance and hours spent per task category over any selected daily, weekly, or monthly timeframe.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                onClick={() => setTimeframeTab('daily')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  timeframeTab === 'daily'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Per Day</span>
              </button>
              <button
                onClick={() => setTimeframeTab('weekly')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  timeframeTab === 'weekly'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Per Week</span>
              </button>
              <button
                onClick={() => setTimeframeTab('monthly')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  timeframeTab === 'monthly'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Per Month</span>
              </button>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {timeframeTab === 'daily' && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700">Selected Date:</label>
                  <input
                    type="date"
                    value={anchorDate}
                    onChange={(e) => setAnchorDate(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 shadow-xs focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => setAnchorDate(todayStr)}
                    className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-blue-600 cursor-pointer"
                  >
                    Today
                  </button>
                </div>
              )}
              {timeframeTab === 'weekly' && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-bold text-slate-700">Monday - Friday Range:</label>
                  <input
                    type="date"
                    value={weekStartDate}
                    onChange={(e) => setWeekStartDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 shadow-xs"
                  />
                  <span className="text-xs text-slate-500">to</span>
                  <input
                    type="date"
                    value={weekEndDate}
                    onChange={(e) => setWeekEndDate(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 shadow-xs"
                  />
                </div>
              )}
              {timeframeTab === 'monthly' && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs font-bold text-slate-700">Month & Year:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 shadow-xs"
                  >
                    {MONTH_NAMES.map((m, idx) => (
                      <option key={m} value={idx}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-800 shadow-xs"
                  >
                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-500">Period Total Time</span>
                <div className="text-base font-extrabold font-mono text-blue-700">{totalTimeframeHours} hrs</div>
              </div>
              <div className="text-right pl-3 border-l border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-500">Top Task</span>
                <div className="text-xs font-extrabold text-slate-800 truncate max-w-[120px]" title={topTask?.task || 'None'}>
                  {topTask?.task || 'N/A'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {timeframeTaskBreakdown.slice(0, 4).map((item) => (
              <div key={item.task} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="font-bold text-slate-800 truncate" title={item.task}>
                      {item.task}
                    </span>
                  </div>
                  <span className="font-bold text-xs bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                    {item.percentage}%
                  </span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-xl font-extrabold font-mono text-slate-900">{item.hours} hrs</span>
                  <span className="text-xs text-slate-500">{item.agentsCount} agents</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${item.percentage}%`, backgroundColor: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
