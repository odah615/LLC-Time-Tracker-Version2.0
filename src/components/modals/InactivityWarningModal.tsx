import React from 'react';
import { useApp } from '../../context/AppContext';
import { Clock, AlertTriangle, CheckCircle2, LogOut, ShieldAlert, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const InactivityWarningModal: React.FC = () => {
  const {
    isAuthenticated,
    currentTask,
    isSessionWarningActive,
    webSessionWarningCountdown,
    refreshWebSession,
    logout,
    inactivityAlertState,
    respondToInactivityAlert,
  } = useApp();

  const isTrackerInactivity = Boolean(inactivityAlertState?.isOpen);
  const isSessionWarning = Boolean(isSessionWarningActive);

  if (!isAuthenticated || (!isTrackerInactivity && !isSessionWarning)) {
    return null;
  }

  const remainingSeconds = isTrackerInactivity
    ? (inactivityAlertState.remainingSeconds || 300)
    : (webSessionWarningCountdown || 300);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const formattedCountdown = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const percentRemaining = Math.max(0, Math.min(100, (remainingSeconds / 300) * 100));

  const handleConfirmWorking = () => {
    if (isTrackerInactivity) {
      respondToInactivityAlert('stay_active');
    } else {
      refreshWebSession();
    }
  };

  const handleSignOut = () => {
    if (isTrackerInactivity) {
      respondToInactivityAlert('pause_tracker');
    } else {
      logout('manual_inactivity_signout');
    }
  };

  return (
    <AnimatePresence>
      <div
        id="inactivity-warning-modal"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          className="bg-slate-900 border-2 border-amber-500 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl text-white relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 animate-pulse" />

          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400 shadow-inner">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-lg text-white">Hey, are you still there?</h3>
                <span className="bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                  <Volume2 className="w-3 h-3 animate-pulse text-amber-400" />
                  10 Min Idle
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                No mouse or keyboard activity detected for <span className="font-bold text-amber-300">10 minutes</span> while tracking <span className="font-bold text-white">"{currentTask || 'Active Shift'}"</span>.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/85 border border-amber-500/30 rounded-2xl p-5 my-4 text-center space-y-2.5 relative">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Auto-Logout & Timesheet Deduction In</span>
            </p>
            <div className="text-4xl sm:text-5xl font-black font-mono text-amber-400 tracking-tight">
              {formattedCountdown}
            </div>

            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700/60 mt-3">
              <div
                className={`h-full transition-all duration-1000 ${
                  remainingSeconds <= 60 ? 'bg-red-500' : remainingSeconds <= 120 ? 'bg-orange-500' : 'bg-amber-400'
                }`}
                style={{ width: `${percentRemaining}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400 pt-1">
              Click <span className="text-emerald-300 font-semibold">"Yes, I'm Working"</span> or simply move your mouse / type to automatically dismiss this notice and resume tracking.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-400 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 mb-5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Accurate timesheets protect your payroll. Confirming your presence immediately resumes smooth tracking.
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              id="inactivity-working-btn"
              type="button"
              onClick={handleConfirmWorking}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4 text-slate-950" />
              <span>Yes, I'm Working! (Keep Tracking)</span>
            </button>
            <button
              id="inactivity-pause-btn"
              type="button"
              onClick={handleSignOut}
              className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-800 hover:bg-red-950/80 hover:border-red-600/80 border border-slate-700 text-slate-300 hover:text-red-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-4 h-4 text-red-400" />
              <span>Sign Out / Pause</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
