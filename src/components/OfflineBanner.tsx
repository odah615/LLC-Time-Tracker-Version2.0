import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WifiOff, RefreshCw, ShieldAlert } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const {
    isOffline,
    offlineSecondsRemaining,
    offlineStatusStage,
    isTracking,
    retryConnection,
  } = useApp();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);

  if (!isOffline && offlineStatusStage === 'online') {
    return null;
  }

  const mins = Math.floor(offlineSecondsRemaining / 60);
  const secs = offlineSecondsRemaining % 60;
  const timeFormatted = `${mins}m ${secs.toString().padStart(2, '0')}s`;

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryResult(null);
    const success = await retryConnection();
    setIsRetrying(false);
    if (!success) {
      setRetryResult('Still Offline. Please check your WiFi or mobile hotspot.');
      setTimeout(() => setRetryResult(null), 4000);
    }
  };

  const isCritical = offlineStatusStage === 'critical_countdown';

  return (
    <div
      id="offline-grace-period-banner"
      className={`w-full transition-all duration-300 z-40 border-b shadow-lg text-xs ${
        isCritical
          ? 'bg-rose-950/95 border-rose-600/80 text-rose-100'
          : 'bg-amber-950/95 border-amber-600/80 text-amber-100'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
              isCritical
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-amber-600 text-white'
            }`}
          >
            {isCritical ? <ShieldAlert className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1.5">
                {isCritical ? '⚠️ Critical Offline Limit Active' : '⚠️ No Internet Connection Detected'}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-mono font-bold text-[11px] uppercase border ${
                  isCritical
                    ? 'bg-rose-500/30 text-rose-200 border-rose-400/40 animate-pulse'
                    : 'bg-amber-500/30 text-amber-200 border-amber-400/40'
                }`}
              >
                {timeFormatted} Remaining
              </span>
              {isTracking && (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                  Tracking locally
                </span>
              )}
            </div>
            <p
              className={`text-xs mt-0.5 ${
                isCritical ? 'text-rose-200' : 'text-amber-200/90'
              }`}
            >
              {isCritical
                ? `You are past the initial 5-minute window. You have ${timeFormatted} remaining in your 30-minute grace period before your shift is automatically finalized and logged out.`
                : `Internet connection dropped. You have a 30-minute total grace window (${timeFormatted} remaining) to connect to backup WiFi or a mobile data hotspot. Your hours are safely tracking locally.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {retryResult && (
            <span className="text-[11px] text-rose-300 font-semibold truncate">
              {retryResult}
            </span>
          )}
          <button
            onClick={handleRetry}
            disabled={isRetrying}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shrink-0 ${
              isCritical
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
            title="Check if internet connection has been restored"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            <span>{isRetrying ? 'Checking...' : 'Check Connection'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
