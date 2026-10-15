import React from 'react';
import { useApp } from '../../context/AppContext';
import { AlertTriangle, ArrowRight, Check, X, Clock, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const TaskSwitchModal: React.FC = () => {
  const { taskSwitchPending, currentTask, elapsedSeconds, formatDuration, confirmTaskSwitch, cancelTaskSwitch } = useApp();

  if (!taskSwitchPending) return null;

  return (
    <AnimatePresence>
      <div id="task-switch-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-800"
        >
          <div className="flex items-center gap-3 text-blue-600 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Change to Another Task?</h3>
              <p className="text-xs text-slate-500">Confirm task switch to avoid accidental changes</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 my-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Current Task:</span>
              <span className="font-bold text-slate-800 bg-white border border-slate-200 px-3 py-1 rounded-lg text-xs shadow-sm">
                {currentTask}
              </span>
            </div>
            <div className="flex justify-center text-blue-600">
              <ArrowRight className="w-4 h-4 animate-pulse" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">New Target Task:</span>
              <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg text-xs shadow-sm">
                {taskSwitchPending.targetTask}
              </span>
            </div>
          </div>

          <div className="space-y-2 mb-6 text-xs text-slate-600 bg-blue-50/60 border border-blue-100 rounded-xl p-3.5">
            <div className="flex items-start gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-800">Database & Spreadsheet:</strong> Will record a separate completed row for <strong>"{currentTask}"</strong> with its exact start time, end time, and duration.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-800">Desktop Tracker:</strong> Continues tracking smoothly from your current elapsed time (<strong>{formatDuration(elapsedSeconds)}</strong>) onwards under <strong>"{taskSwitchPending.targetTask}"</strong>.
              </span>
            </div>
          </div>

          <p className="text-xs font-medium text-slate-700 mb-5 text-center">
            Are you sure you would like to change to another task?
          </p>

          <div className="flex items-center justify-end gap-2.5">
            <button
              onClick={cancelTaskSwitch}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-200"
            >
              <X className="w-4 h-4" /> No, Keep Current Task
            </button>
            <button
              onClick={confirmTaskSwitch}
              className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-blue-200 active:scale-[0.98]"
            >
              <Check className="w-4 h-4" /> Yes, Switch Task
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
