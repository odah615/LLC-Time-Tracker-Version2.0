import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_LIST } from '../../data/initialData';
import { TaskCategory, TimeLog, User } from '../../types';
import { Clock, X, Check, UserCheck, ShieldCheck, Coffee, FileSpreadsheet, AlertCircle, Search, ChevronDown, User as UserIcon } from 'lucide-react';
import { getManilaIsoString, getManilaDateString } from '../../lib/dateUtils';

interface ManualTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManualTimeModal: React.FC<ManualTimeModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, users, timeLogs, addTimeLog, submitManualTimeRequest, triggerGoogleSheetsSync } = useApp();

  const isAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'va_admin' ||
    (currentUser?.employeeCode || '').toLowerCase().includes('admin') ||
    (currentUser?.employeeCode || '').toLowerCase().includes('super') ||
    currentUser?.id === 'usr-superadmin-red' ||
    currentUser?.name?.toLowerCase().includes('admin');

  const isPrivileged =
    isAdmin ||
    currentUser?.role === 'trainer' ||
    currentUser?.name?.toLowerCase().includes('pia');

  const [targetUserId, setTargetUserId] = useState(currentUser?.id || '');
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState('');
  const [isEmployeeDropdownOpen, setIsEmployeeDropdownOpen] = useState(false);
  const employeeDropdownRef = useRef<HTMLDivElement>(null);

  const [date, setDate] = useState(getManilaDateString());
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [hoursToAdd, setHoursToAdd] = useState('8');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [task, setTask] = useState<TaskCategory>('Data Entry & Market Research');
  const [reason, setReason] = useState(
    isAdmin ? 'Direct manual timesheet entry credited by Admin' : 'Direct manual shift credit rendered by Admin / Trainer'
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  const targetUser = users.find((u) => u.id === targetUserId) || currentUser;

  // Initialize selected target user search display
  useEffect(() => {
    if (targetUser) {
      const codeLabel = targetUser.employeeCode ? `[${targetUser.employeeCode}] ` : '';
      setEmployeeSearchQuery(`${codeLabel}${targetUser.name} — (${targetUser.designation || targetUser.role})`);
    }
  }, [targetUserId]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target as Node)) {
        setIsEmployeeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  // Filtered employees list based on search query
  const filteredUsers = users.filter((u) => {
    const q = employeeSearchQuery.toLowerCase().trim();
    if (!q) return true;
    const nameMatch = (u.name || '').toLowerCase().includes(q);
    const codeMatch = (u.employeeCode || '').toLowerCase().includes(q);
    const desigMatch = (u.designation || '').toLowerCase().includes(q);
    const roleMatch = (u.role || '').toLowerCase().includes(q);
    const userMatch = (u.username || '').toLowerCase().includes(q);
    return nameMatch || codeMatch || desigMatch || roleMatch || userMatch;
  });

  // Calculate End Time given Start Time + Shift Hours + Break Minutes
  const calcEndTime = (startStr: string, hrsVal: string | number, breakMins: number): string => {
    const hrs = parseFloat(String(hrsVal));
    if (isNaN(hrs) || hrs <= 0) return endTime;
    try {
      const [sh, sm] = startStr.split(':').map(Number);
      if (isNaN(sh) || isNaN(sm)) return endTime;
      const startTotalMins = sh * 60 + sm;
      const totalAddMins = Math.round(hrs * 60) + Math.max(0, Number(breakMins) || 0);
      const endTotalMins = (startTotalMins + totalAddMins) % (24 * 60);
      const eh = Math.floor(endTotalMins / 60);
      const em = endTotalMins % 60;
      return `${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`;
    } catch {
      return endTime;
    }
  };

  // Calculate Shift Hours given Start Time and End Time and Break Minutes
  const calcHoursFromTimes = (startStr: string, endStr: string, breakMins: number): string => {
    try {
      const [sh, sm] = startStr.split(':').map(Number);
      const [eh, em] = endStr.split(':').map(Number);
      let startTotalMins = sh * 60 + sm;
      let endTotalMins = eh * 60 + em;
      if (endTotalMins < startTotalMins) {
        endTotalMins += 24 * 60;
      }
      const grossMins = Math.max(0, endTotalMins - startTotalMins);
      const netMins = Math.max(0, grossMins - Math.max(0, Number(breakMins) || 0));
      const hoursNum = netMins / 60;
      return hoursNum.toFixed(2).replace(/\.00$/, '');
    } catch {
      return '8';
    }
  };

  // Handlers for dynamic auto-calculations
  const handleHoursChange = (val: string) => {
    setHoursToAdd(val);
    const newEnd = calcEndTime(startTime, val, breakMinutes);
    setEndTime(newEnd);
  };

  const handleStartTimeChange = (val: string) => {
    setStartTime(val);
    const newEnd = calcEndTime(val, hoursToAdd, breakMinutes);
    setEndTime(newEnd);
  };

  const handleBreakMinutesChange = (val: number) => {
    const cleanBreak = Math.max(0, val);
    setBreakMinutes(cleanBreak);
    const newEnd = calcEndTime(startTime, hoursToAdd, cleanBreak);
    setEndTime(newEnd);
  };

  const handleEndTimeChange = (val: string) => {
    setEndTime(val);
    const newHrs = calcHoursFromTimes(startTime, val, breakMinutes);
    setHoursToAdd(newHrs);
  };

  const calculateGrossDurationSeconds = (): number => {
    try {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      let startMins = sh * 60 + sm;
      let endMins = eh * 60 + em;
      if (endMins < startMins) {
        endMins += 24 * 60;
      }
      const diffSecs = Math.max((endMins - startMins) * 60, 60);
      return diffSecs;
    } catch {
      return 32400; // 9 hours default
    }
  };

  const grossDurationSec = calculateGrossDurationSeconds();
  const netDurationSec = Math.max(grossDurationSec - Math.max(Number(breakMinutes) || 0, 0) * 60, 60);

  const grossHoursFormatted = (grossDurationSec / 3600).toFixed(2);
  const netHoursFormatted = (netDurationSec / 3600).toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason && !isPrivileged) return;

    if (isPrivileged) {
      setIsSyncing(true);
      setSyncStatus('Saving and syncing manual entry to Google Sheets...');

      // Parse start & end dates in Manila local context
      const startMs = new Date(`${date}T${startTime}:00`).getTime();
      const endMs = new Date(`${date}T${endTime}:00`).getTime();

      const startIso = isNaN(startMs) ? `${date}T${startTime}:00.000Z` : getManilaIsoString(startMs);
      const endIso = isNaN(endMs) ? `${date}T${endTime}:00.000Z` : getManilaIsoString(endMs);

      const newLogData: Omit<TimeLog, 'id'> = {
        userId: targetUser.id,
        userName: targetUser.name,
        employeeCode: targetUser.employeeCode || targetUser.id,
        userAvatar: targetUser.avatar,
        designation: targetUser.designation || 'Agent',
        task: task,
        startTime: startIso,
        endTime: endIso,
        durationSeconds: netDurationSec,
        status: 'completed',
        geoTimezone: targetUser.geoTimezone || 'Asia/Manila',
        geoLocalStartTime: startTime,
        geoLocalEndTime: endTime,
        mouseActivityAvg: 95,
        keyboardActivityAvg: 90,
        idleSeconds: Math.max(Number(breakMinutes) || 0, 0) * 60,
        date: date,
        notes: `Admin Manual Entry by ${currentUser.name} (${currentUser.role}): ${reason || 'Rendered Shift'}`,
        appsUsed: [
          {
            appName: 'Admin Manual Entry',
            icon: 'Clock',
            durationSeconds: netDurationSec,
            category: 'productive',
          },
        ],
      };

      // 1. Add log to local state & Firestore
      const createdLog = addTimeLog(newLogData);

      // 2. Trigger Google Sheets webhook sync immediately with createdLog explicitly passed
      try {
        await triggerGoogleSheetsSync(undefined, [createdLog, ...timeLogs]);
      } catch (err) {
        console.warn('Background sheets sync notice:', err);
      }

      setIsSyncing(false);
      onClose();
    } else {
      submitManualTimeRequest({
        userId: currentUser.id,
        userName: currentUser.name,
        date,
        startTime,
        endTime,
        task,
        reason: reason || 'Manual shift entry request',
      });
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-hidden">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full max-h-[88vh] sm:max-h-[90vh] flex flex-col p-5 sm:p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in duration-150 my-auto">
        <div className="shrink-0 flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                {isAdmin ? 'Manual Entry Timesheet (Super Admin Direct)' : isPrivileged ? 'Manual Timesheet Entry' : 'Request Manual Time Adjustment'}
              </h3>
              <p className="text-xs text-blue-600 font-medium flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                {isAdmin
                  ? 'Super Admin Direct Privilege: Instantly updates Timesheets & Google Sheets Database'
                  : 'Direct Admin/Trainer Credit: Instantly updates Timesheets'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSyncing}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-4 pr-1">
          <form id="manual-time-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
          {isPrivileged && (
            <div className="relative" ref={employeeDropdownRef}>
              <label className="block text-slate-800 font-bold mb-1.5 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-blue-600" /> Target Employee Account
              </label>
              
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Type to search employee name or code (e.g. Juan, Maria, LLC-0081)..."
                  value={employeeSearchQuery}
                  onFocus={() => setIsEmployeeDropdownOpen(true)}
                  onChange={(e) => {
                    setEmployeeSearchQuery(e.target.value);
                    setIsEmployeeDropdownOpen(true);
                  }}
                  className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl pl-9 pr-8 p-3 focus:ring-2 focus:ring-blue-500 font-bold text-xs shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => setIsEmployeeDropdownOpen((p) => !p)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              {/* Searchable Combobox Dropdown */}
              {isEmployeeDropdownOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((u) => {
                      const isSelected = u.id === targetUserId;
                      return (
                        <div
                          key={u.id}
                          onClick={() => {
                            setTargetUserId(u.id);
                            const codeLabel = u.employeeCode ? `[${u.employeeCode}] ` : '';
                            setEmployeeSearchQuery(`${codeLabel}${u.name} — (${u.designation || u.role})`);
                            setIsEmployeeDropdownOpen(false);
                          }}
                          className={`p-2.5 flex items-center justify-between hover:bg-blue-50 cursor-pointer transition-colors ${
                            isSelected ? 'bg-blue-50/80 font-bold text-blue-900' : 'text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-[10px] font-bold shrink-0">
                              {u.name?.slice(0, 2).toUpperCase() || 'EM'}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900">
                                {u.employeeCode ? `[${u.employeeCode}] ` : ''}{u.name}
                              </p>
                              <p className="text-[10px] text-slate-500 font-medium">
                                {u.designation || u.role} • {u.department || 'Operations'}
                              </p>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-slate-500 text-xs font-medium">
                      No employees match "{employeeSearchQuery}"
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-slate-800 font-bold mb-1.5">Shift Date (Asia/Manila)</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-800 font-bold mb-1.5">Clock In (Start)</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-semibold"
                required
              />
            </div>

            {/* Shift Hours to Add Box */}
            <div>
              <label className="block text-slate-800 font-bold mb-1.5 text-blue-900 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" /> Hours to Add
              </label>
              <input
                type="number"
                step="0.25"
                min="0.1"
                max="24"
                placeholder="e.g. 8"
                value={hoursToAdd}
                onChange={(e) => handleHoursChange(e.target.value)}
                className="w-full bg-blue-50/70 border border-blue-300 text-blue-950 font-bold rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-slate-800 font-bold mb-1.5">Clock Out (End)</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => handleEndTimeChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-semibold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-800 font-bold mb-1.5 flex items-center gap-1">
                <Coffee className="w-3.5 h-3.5 text-amber-600" /> Meal / Idle Break (Minutes)
              </label>
              <input
                type="number"
                min="0"
                max="360"
                value={breakMinutes}
                onChange={(e) => handleBreakMinutesChange(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-semibold"
              />
            </div>
            <div>
              <label className="block text-slate-800 font-bold mb-1.5">Select Task Category</label>
              <select
                value={task}
                onChange={(e) => setTask(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
              >
                {TASK_LIST.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Real-time calculated duration banner */}
          <div className="p-3.5 bg-blue-50/80 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-blue-950 font-medium">
            <div className="space-y-0.5">
              <p className="text-[11px] text-blue-700 font-bold">Shift Hours Calculation:</p>
              <p className="text-xs text-slate-600">
                Gross: <b>{grossHoursFormatted} hrs</b> ({Math.floor(grossDurationSec / 60)}m) — Break: <b>{breakMinutes}m</b>
              </p>
            </div>
            <div className="bg-blue-600 text-white px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm shrink-0">
              <span>Net Work:</span>
              <span className="text-emerald-300 font-mono text-sm">{netHoursFormatted} hrs</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-800 font-bold mb-1.5">
              {isAdmin ? 'Admin Entry Notes / Audit Reason' : 'Reason / Justification'}
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Approved manual shift entry during desktop tracker update..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
              required={!isPrivileged}
            />
          </div>

          {/* Live Preview Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
            <p className="font-bold text-slate-700 text-[11px] flex items-center gap-1.5 uppercase tracking-wider">
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              Timesheet Entry Summary Preview
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div>
                <span className="text-slate-400">Employee: </span>
                <span className="font-bold text-slate-800">{targetUser.name} ({targetUser.employeeCode || 'N/A'})</span>
              </div>
              <div>
                <span className="text-slate-400">Date: </span>
                <span className="font-bold text-slate-800">{date}</span>
              </div>
              <div>
                <span className="text-slate-400">Hours: </span>
                <span className="font-bold text-emerald-700">{startTime} – {endTime} ({netHoursFormatted} hrs net)</span>
              </div>
              <div>
                <span className="text-slate-400">Task: </span>
                <span className="font-bold text-slate-800">{task}</span>
              </div>
            </div>
          </div>

          {syncStatus && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{syncStatus}</span>
            </div>
          )}
          </form>
        </div>

        {/* Sticky Actions Footer */}
        <div className="shrink-0 flex justify-end gap-2 pt-3 border-t border-slate-100 bg-white mt-auto">
          <button
            type="button"
            onClick={onClose}
            disabled={isSyncing}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="manual-time-form"
            disabled={isSyncing}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-2 shadow-md hover:shadow-blue-200 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSyncing ? (
              <>
                <Clock className="w-4 h-4 animate-spin" />
                <span>Saving & Syncing...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{isAdmin ? 'Save & Sync to Timesheet' : 'Submit Request'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
