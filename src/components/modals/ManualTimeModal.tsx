import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_LIST } from '../../data/initialData';
import { TaskCategory, TimeLog } from '../../types';
import { Clock, X, Check, UserCheck, ShieldCheck, Coffee, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { getManilaIsoString } from '../../lib/dateUtils';

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
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [task, setTask] = useState<TaskCategory>('Data Entry & Market Research');
  const [reason, setReason] = useState(
    isAdmin ? 'Direct manual timesheet entry credited by Admin' : 'Direct manual shift credit rendered by Admin / Trainer'
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const targetUser = users.find((u) => u.id === targetUserId) || currentUser;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in duration-150 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
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
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          {isPrivileged && (
            <div>
              <label className="block text-slate-800 font-bold mb-1.5 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-blue-600" /> Target Employee Account
              </label>
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-3 focus:ring-2 focus:ring-blue-500 font-bold text-xs"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.employeeCode ? `[${u.employeeCode}] ` : ''}{u.name} — ({u.designation || u.role})
                  </option>
                ))}
              </select>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-800 font-bold mb-1.5">Clock In (Start)</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-900 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-semibold"
                required
              />
            </div>
            <div>
              <label className="block text-slate-800 font-bold mb-1.5">Clock Out (End)</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
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
                onChange={(e) => setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0))}
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

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
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
        </form>
      </div>
    </div>
  );
};
