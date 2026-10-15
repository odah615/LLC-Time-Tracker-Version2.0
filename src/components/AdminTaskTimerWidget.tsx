import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Play, Pause, Square, Clock, Laptop, CheckCircle2 } from 'lucide-react';
import { TASK_LIST } from '../data/initialData';
import { TaskCategory } from '../types';

export const AdminTaskTimerWidget: React.FC = () => {
  const { currentUser, addTimeLog, formatDuration } = useApp();
  const [selectedTask, setSelectedTask] = useState<TaskCategory>(
    currentUser.role === 'hr'
      ? 'HR & Recruitment'
      : currentUser.role === 'payroll'
      ? 'Payroll Task'
      : currentUser.role === 'trainer'
      ? 'Training'
      : 'Team Supervision'
  );
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const startEpochRef = React.useRef<number>(0);
  const accumulatedSecRef = React.useRef<number>(0);

  useEffect(() => {
    let interval: any = null;
    const updateTimer = () => {
      if (isTimerRunning && startEpochRef.current > 0) {
        const diff = Math.floor((Date.now() - startEpochRef.current) / 1000);
        setElapsedSeconds(accumulatedSecRef.current + Math.max(0, diff));
      }
    };

    if (isTimerRunning) {
      updateTimer();
      interval = setInterval(updateTimer, 500);
      const handleVis = () => {
        if (document.visibilityState === 'visible') updateTimer();
      };
      document.addEventListener('visibilitychange', handleVis);
      window.addEventListener('focus', updateTimer);
      return () => {
        clearInterval(interval);
        document.removeEventListener('visibilitychange', handleVis);
        window.removeEventListener('focus', updateTimer);
      };
    } else if (interval) {
      clearInterval(interval);
    }
  }, [isTimerRunning]);

  const handleStartPause = () => {
    if (!isTimerRunning) {
      startEpochRef.current = Date.now();
      setIsTimerRunning(true);
    } else {
      if (startEpochRef.current > 0) {
        const diff = Math.floor((Date.now() - startEpochRef.current) / 1000);
        accumulatedSecRef.current += Math.max(0, diff);
      }
      startEpochRef.current = 0;
      setIsTimerRunning(false);
    }
  };

  const handleStopAndSave = () => {
    let currentTotal = accumulatedSecRef.current;
    if (isTimerRunning && startEpochRef.current > 0) {
      currentTotal += Math.floor((Date.now() - startEpochRef.current) / 1000);
    }
    const finalSecs = Math.max(0, currentTotal);

    if (finalSecs < 10) {
      setIsTimerRunning(false);
      setElapsedSeconds(0);
      startEpochRef.current = 0;
      accumulatedSecRef.current = 0;
      return;
    }
    const now = new Date();
    const startTimeStr = new Date(now.getTime() - finalSecs * 1000)
      .toTimeString()
      .split(' ')[0]
      .substring(0, 5);
    const endTimeStr = now.toTimeString().split(' ')[0].substring(0, 5);

    addTimeLog({
      userId: currentUser.id,
      employeeCode: currentUser.employeeCode,
      userName: currentUser.name,
      userAvatar: currentUser.avatar || '',
      date: now.toISOString().split('T')[0],
      startTime: startTimeStr,
      endTime: endTimeStr,
      durationSeconds: finalSecs,
      task: selectedTask,
      designation: currentUser.designation,
      status: 'completed',
      geoTimezone: currentUser.geoTimezone || 'Asia/Manila',
      geoLocalStartTime: startTimeStr,
      geoLocalEndTime: endTimeStr,
      mouseActivityAvg: 92,
      keyboardActivityAvg: 65,
      idleSeconds: 0,
      appsUsed: [],
    });

    setIsTimerRunning(false);
    setElapsedSeconds(0);
    startEpochRef.current = 0;
    accumulatedSecRef.current = 0;
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3500);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-slate-900">
              Admin & Manager Task Time Tracker
            </h4>
            <p className="text-xs text-slate-500">
              Select task to log billable hours to central database
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
        <div className="w-full md:w-1/2 space-y-1">
          <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
            Current Management Task
          </label>
          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value as TaskCategory)}
            disabled={isTimerRunning}
            className="w-full bg-white border border-slate-200 text-slate-800 text-xs rounded-xl p-2.5 font-semibold focus:ring-2 focus:ring-blue-500"
          >
            {TASK_LIST.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-4">
          <div className="text-right">
            <div className="text-2xl font-mono font-extrabold text-slate-900 tracking-tight">
              {formatDuration(elapsedSeconds)}
            </div>
            <div className="text-[10px] font-bold uppercase text-slate-400">
              {isTimerRunning ? 'Timer Active' : 'Ready'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isTimerRunning ? (
              <button
                onClick={handleStartPause}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
              >
                <Play className="w-4 h-4 fill-white" /> Start Time
              </button>
            ) : (
              <button
                onClick={handleStartPause}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
              >
                <Pause className="w-4 h-4 fill-white" /> Pause
              </button>
            )}
            {elapsedSeconds > 0 && (
              <button
                onClick={handleStopAndSave}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all"
                title="Stop timer - Automatically saves shift to Database & Google Sheets"
              >
                <Square className="w-4 h-4 fill-white" /> Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {showSavedToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Task entry successfully saved to central database timesheet!</span>
        </div>
      )}
    </div>
  );
};
