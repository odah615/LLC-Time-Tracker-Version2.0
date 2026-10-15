import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TASK_LIST } from '../../data/initialData';
import { TaskCategory, TimeLog } from '../../types';
import { Clock, X, Check, UserCheck, ShieldCheck } from 'lucide-react';

interface ManualTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ManualTimeModal: React.FC<ManualTimeModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, users, addTimeLog, submitManualTimeRequest } = useApp();
  const isPrivileged =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'trainer' ||
    currentUser?.name?.toLowerCase().includes('pia') ||
    currentUser?.name?.toLowerCase().includes('admin');

  const [targetUserId, setTargetUserId] = useState(currentUser?.id || '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [task, setTask] = useState<TaskCategory>('Data Entry & Market Research');
  const [reason, setReason] = useState(
    isPrivileged ? 'Direct manual shift credit rendered by Admin / Trainer' : ''
  );
  const [isDirectApproval, setIsDirectApproval] = useState(isPrivileged);

  if (!isOpen) return null;

  const targetUser = users.find((u) => u.id === targetUserId) || currentUser;

  const calculateDurationSeconds = (): number => {
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
      return 28800;
    }
  };

  const durationSec = calculateDurationSeconds();
  const durationHoursFormatted = (durationSec / 3600).toFixed(2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason && !isPrivileged) return;

    if (isPrivileged && isDirectApproval) {
      const startIso = `${date}T${startTime}:00.000Z`;
      const endIso = `${date}T${endTime}:00.000Z`;

      const newLogData: Omit<TimeLog, 'id'> = {
        userId: targetUser.id,
        userName: targetUser.name,
        employeeCode: targetUser.employeeCode || '',
        userAvatar: targetUser.avatar,
        designation: targetUser.designation || 'Agent',
        task: task,
        startTime: startIso,
        endTime: endIso,
        durationSeconds: durationSec,
        status: 'completed',
        geoTimezone: targetUser.geoTimezone || 'Asia/Manila',
        geoLocalStartTime: startTime,
        geoLocalEndTime: endTime,
        mouseActivityAvg: 90,
        keyboardActivityAvg: 90,
        idleSeconds: 0,
        date: date,
        notes: `Manual Shift Entry by ${currentUser.name} (${currentUser.role}): ${reason || 'Rendered Shift'}`,
        appsUsed: [
          {
            appName: 'Manual Timesheet Entry',
            icon: 'Clock',
            durationSeconds: durationSec,
            category: 'productive',
          },
        ],
      };
      addTimeLog(newLogData);
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
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-800 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <div>
            <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-600" />
              {isPrivileged ? 'Manual Timesheet Entry (Direct Credit)' : 'Request Manual Time Adjustment'}
            </h3>
            {isPrivileged && (
              <p className="text-xs text-blue-600 font-medium flex items-center gap-1 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Direct Admin / Trainer privilege: Instantly updates Timesheet & Google Sheets
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {isPrivileged && (
            <div>
              <label className="block text-slate-700 font-semibold mb-1 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-blue-600" /> Select Target Employee
              </label>
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-semibold"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.employeeCode ? `[${u.employeeCode}] ` : ''}{u.name} ({u.designation || u.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-slate-700 font-semibold mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-slate-700 font-semibold mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
                required
              />
            </div>
          </div>

          <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-2.5 text-blue-900 flex items-center justify-between font-medium">
            <span>Calculated Shift Duration:</span>
            <span className="font-bold text-blue-700 bg-white px-2 py-0.5 rounded-lg border border-blue-200">
              {durationHoursFormatted} hours ({Math.floor(durationSec / 60)} mins)
            </span>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">Select Task Category</label>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value as any)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
            >
              {TASK_LIST.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-700 font-semibold mb-1">
              {isPrivileged ? 'Notes / Justification' : 'Reason / Justification'}
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Rendered shift during tracker maintenance..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 rounded-xl p-2.5 focus:ring-2 focus:ring-blue-500 font-medium"
              required={!isPrivileged}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Check className="w-4 h-4" />
              {isPrivileged ? 'Save & Log to Timesheet' : 'Submit Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
