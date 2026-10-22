import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_LIST } from '../../data/initialData';
import { TaskCategory, TimeLog } from '../../types';
import { Clock, X, Check, ShieldCheck, AlertCircle, Edit3, Sparkles } from 'lucide-react';
import { getManilaIsoString, formatDurationDetailed } from '../../lib/dateUtils';

interface EditTimeLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: TimeLog | null;
}

export const EditTimeLogModal: React.FC<EditTimeLogModalProps> = ({ isOpen, onClose, log }) => {
  const { currentUser, users, updateTimeLog, addAuditLog, triggerGoogleSheetsSync } = useApp();

  const [date, setDate] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('08:00');
  const [endTime, setEndTime] = useState<string>('11:00');
  const [idleMinutes, setIdleMinutes] = useState<number>(0);
  const [task, setTask] = useState<TaskCategory>('Data Entry & Market Research');
  const [reason, setReason] = useState<string>('Approved by Team Lead - Data entry proof verified');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Sync modal form state whenever active log changes
  useEffect(() => {
    if (log) {
      setDate(log.date || new Date().toISOString().split('T')[0]);
      setTask(log.task || 'Data Entry & Market Research');
      setIdleMinutes(Math.round((log.idleSeconds || 0) / 60));

      // Extract time part from startTime/endTime ISO strings or local formatted strings
      if (log.startTime) {
        try {
          const d = new Date(log.startTime);
          if (!isNaN(d.getTime())) {
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            setStartTime(`${hh}:${mm}`);
          } else if (log.geoLocalStartTime && /^\d{1,2}:\d{2}/.test(log.geoLocalStartTime)) {
            setStartTime(log.geoLocalStartTime.slice(0, 5));
          }
        } catch {
          setStartTime('08:00');
        }
      }

      if (log.endTime && !log.endTime.toLowerCase().includes('in progress')) {
        try {
          const d = new Date(log.endTime);
          if (!isNaN(d.getTime())) {
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            setEndTime(`${hh}:${mm}`);
          } else if (log.geoLocalEndTime && /^\d{1,2}:\d{2}/.test(log.geoLocalEndTime)) {
            setEndTime(log.geoLocalEndTime.slice(0, 5));
          }
        } catch {
          setEndTime('11:00');
        }
      } else {
        // Fallback end time calculated from durationSeconds
        if (log.startTime && log.durationSeconds) {
          try {
            const dStart = new Date(log.startTime);
            if (!isNaN(dStart.getTime())) {
              const dEnd = new Date(dStart.getTime() + (log.durationSeconds * 1000));
              const hh = String(dEnd.getHours()).padStart(2, '0');
              const mm = String(dEnd.getMinutes()).padStart(2, '0');
              setEndTime(`${hh}:${mm}`);
            }
          } catch {}
        }
      }
      setReason('Approved by Team Lead - Data entry proof verified');
    }
  }, [log]);

  if (!isOpen || !log) return null;

  const targetUser = users.find((u) => u.id === log.userId || u.employeeCode === log.employeeCode) || {
    name: log.userName,
    employeeCode: log.employeeCode,
    designation: log.designation,
  };

  // Quick Preset Helper: Set duration directly (e.g., 1h, 2h, 3h, 4h, 8h)
  const setQuickDuration = (hours: number) => {
    try {
      const [sh, sm] = startTime.split(':').map(Number);
      let endMins = (sh * 60 + sm) + (hours * 60);
      endMins = endMins % (24 * 60);
      const eh = String(Math.floor(endMins / 60)).padStart(2, '0');
      const em = String(endMins % 60).padStart(2, '0');
      setEndTime(`${eh}:${em}`);
    } catch {}
  };

  const calculateGrossDurationSeconds = (): number => {
    try {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      let startMins = sh * 60 + sm;
      let endMins = eh * 60 + em;
      if (endMins < startMins) {
        endMins += 24 * 60; // Overnight shift
      }
      const diffSecs = Math.max((endMins - startMins) * 60, 60);
      return diffSecs;
    } catch {
      return log.durationSeconds || 3600;
    }
  };

  const grossDurationSec = calculateGrossDurationSeconds();
  const netDurationSec = Math.max(grossDurationSec - Math.max(Number(idleMinutes) || 0, 0) * 60, 60);

  const grossHoursFormatted = (grossDurationSec / 3600).toFixed(2);
  const netHoursFormatted = (netDurationSec / 3600).toFixed(2);
  const netFormattedString = formatDurationDetailed(netDurationSec);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setStatusMsg('Please enter an admin note or TL approval reason.');
      return;
    }

    setIsSaving(true);
    setStatusMsg('Updating timesheet entry and syncing to Google Sheets...');

    try {
      const startMs = new Date(`${date}T${startTime}:00`).getTime();
      const endMs = new Date(`${date}T${endTime}:00`).getTime();

      const startIso = isNaN(startMs) ? `${date}T${startTime}:00.000Z` : getManilaIsoString(startMs);
      const endIso = isNaN(endMs) ? `${date}T${endTime}:00.000Z` : getManilaIsoString(endMs);

      const updatedFields: Partial<TimeLog> = {
        task,
        date,
        startTime: startIso,
        endTime: endIso,
        durationSeconds: netDurationSec,
        idleSeconds: Math.max(Number(idleMinutes) || 0, 0) * 60,
        geoLocalStartTime: startTime,
        geoLocalEndTime: endTime,
        notes: `Admin Timesheet Edit by ${currentUser.name} (${currentUser.role}): ${reason}`,
      };

      // 1. Update React state, local storage & backend API
      await updateTimeLog(log.id, updatedFields);

      // 2. Audit Log record
      addAuditLog({
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionCategory: 'Timesheet Edit',
        details: `Updated timesheet for ${log.userName} (${log.employeeCode}): ${task} set to ${netFormattedString} (${netHoursFormatted} hrs). Note: ${reason}`,
      });

      // 3. Dispatch Google Sheets Webhook sync
      await triggerGoogleSheetsSync();

      setIsSaving(false);
      onClose();
    } catch (err: any) {
      console.warn('Error saving edited time log:', err);
      setIsSaving(false);
      setStatusMsg('Timesheet updated locally. Check Google Sheets webhook if sync delay occurs.');
      setTimeout(() => onClose(), 1500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in duration-150 my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600">
              <Edit3 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                Edit Timesheet Entry
              </h3>
              <p className="text-xs text-indigo-600 font-medium flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                Admin & TL Authorized Timesheet Correction
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          {/* Target Employee Info Header */}
          <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</p>
              <p className="text-sm font-bold text-slate-900 mt-0.5">{targetUser.name}</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-100 text-indigo-800">
                {log.employeeCode || targetUser.employeeCode || 'N/A'}
              </span>
              <p className="text-xs text-slate-500 mt-1">{log.designation || 'Agent'}</p>
            </div>
          </div>

          {/* Task Category Dropdown */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Task Category
            </label>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value as TaskCategory)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {TASK_LIST.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Work Date (Manila GMT+8)
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Start Time & End Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Quick Duration Preset Buttons */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Quick Duration Presets</span>
              <span className="text-xs text-indigo-600 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Auto-calculates End Time
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 8].map((hrs) => (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => setQuickDuration(hrs)}
                  className="py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold rounded-lg transition-colors text-center"
                >
                  {hrs} Hours
                </button>
              ))}
            </div>
          </div>

          {/* Break / Idle Deductions */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Unpaid Break / Idle Deduction (Minutes)
            </label>
            <input
              type="number"
              min="0"
              max="240"
              value={idleMinutes}
              onChange={(e) => setIdleMinutes(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Realtime Duration Summary Display */}
          <div className="p-3.5 bg-emerald-50 border border-emerald-200/80 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-900">Net Rendered Duration</p>
                <p className="text-xs text-emerald-700">Gross: {grossHoursFormatted} hrs | Deductions: {idleMinutes}m</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-base font-extrabold text-emerald-800">{netFormattedString}</span>
              <p className="text-[11px] font-semibold text-emerald-600">({netHoursFormatted} hrs total)</p>
            </div>
          </div>

          {/* Admin Note / Approval Reason */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Admin Note / Approval Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approved by TL - Data entry proof attached & verified"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {statusMsg && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-lg shadow-indigo-600/20 transition-colors"
            >
              {isSaving ? (
                <>Saving & Syncing...</>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Save & Sync Timesheet
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
