/**
 * Philippine (Manila) Timezone & Duration Formatting Utilities
 * Default timezone: Asia/Manila (PHT / UTC+8)
 */

export const DEFAULT_TIMEZONE = 'Asia/Manila';

/**
 * Returns YYYY-MM-DD string for a given date in Asia/Manila timezone
 */
export function getManilaDateString(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().split('T')[0];
  }
}

/**
 * Returns ISO string in Asia/Manila timezone with explicit +08:00 offset
 * e.g. "2026-10-20T01:50:50.695+08:00"
 */
export function getManilaIsoString(dateInput: Date | string | number = new Date()): string {
  try {
    const d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) {
      return new Date().toISOString().replace('Z', '+08:00');
    }
    const manilaMs = d.getTime() + 8 * 60 * 60 * 1000;
    const manilaDate = new Date(manilaMs);
    const isoUtc = manilaDate.toISOString();
    return isoUtc.replace('Z', '+08:00');
  } catch {
    return new Date().toISOString().replace('Z', '+08:00');
  }
}

/**
 * Returns full date and time formatted in Manila timezone (e.g. "2026-10-20 11:40:51 PM")
 */
export function getManilaFullDateTimeString(dateInput: Date | string | number = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    const d = typeof dateInput === 'object' ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    const datePart = getManilaDateString(d, timeZone);
    const timePart = getManilaTimeWithSeconds(d, timeZone);
    return `${datePart} ${timePart}`;
  } catch {
    return String(dateInput);
  }
}


/**
 * Returns formatted 12-hour time string (e.g. "11:40 AM") in Asia/Manila timezone
 */
export function getManilaTimeString(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}

/**
 * Returns formatted 12-hour time with seconds (e.g. "11:40:51 AM") in Asia/Manila timezone
 */
export function getManilaTimeWithSeconds(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  }
}

/**
 * Formats the exact start time of a session in Manila timezone (PHT / UTC+8).
 * Prioritizes parsing log.startTime (ISO string). Falls back to geoLocalStartTime.
 */
export function formatLogStartTime(
  logOrStartTime?: { startTime?: string; geoLocalStartTime?: string; geoTimezone?: string } | string,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (!logOrStartTime) return '';
  if (typeof logOrStartTime === 'string') {
    const d = new Date(logOrStartTime);
    if (!isNaN(d.getTime())) {
      return getManilaTimeString(d, timeZone);
    }
    return logOrStartTime;
  }
  if (logOrStartTime.startTime) {
    const d = new Date(logOrStartTime.startTime);
    if (!isNaN(d.getTime())) {
      return getManilaTimeString(d, logOrStartTime.geoTimezone || timeZone);
    }
  }
  return logOrStartTime.geoLocalStartTime || '';
}

/**
 * Formats the exact end time of a session in Manila timezone (PHT / UTC+8).
 */
export function formatLogEndTime(
  logOrEndTime?: { endTime?: string; geoTimezone?: string } | string,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (!logOrEndTime) return '';
  if (typeof logOrEndTime === 'string') {
    const d = new Date(logOrEndTime);
    if (!isNaN(d.getTime())) {
      return getManilaTimeString(d, timeZone);
    }
    return logOrEndTime;
  }
  if (logOrEndTime.endTime) {
    const d = new Date(logOrEndTime.endTime);
    if (!isNaN(d.getTime())) {
      return getManilaTimeString(d, logOrEndTime.geoTimezone || timeZone);
    }
  }
  return '';
}

/**
 * Returns full date display (e.g. "Friday, 21 Aug 2026") in Asia/Manila timezone
 */
export function getManilaFormattedDate(date: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

/**
 * Converts seconds duration into an unambiguous human-friendly string:
 * - Under 60s: "45s"
 * - Under 1h: "12m 19s"
 * - 1h and above: "2h 15m" (or "1h 00m")
 * This completely prevents users from mistaking a duration (e.g. 00:12:19) for a 24-hour clock time!
 */
export function formatDurationHuman(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0m 00s';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h 00m`;
  }
  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

/**
 * Converts seconds into "Xh Ym Zs" with full precision
 */
export function formatDurationDetailed(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '0m 00s';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

/**
 * Mathematically accurate Total Time conversion:
 * - >= 1 hour: "Xh Ym Zs" (e.g. 27529s -> "7h 38m 49s")
 * - < 1 hour: "Ym Zs" (e.g. 1121s -> "18m 41s", 2147s -> "35m 47s")
 * - < 1 min: "Zs" (e.g. 14s -> "14s")
 */
export function formatTotalTime(totalSeconds: number | string | undefined | null): string {
  const secs = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}h ${m}m ${s}s`;
  } else if (m > 0) {
    return `${m}m ${s}s`;
  } else {
    return `${s}s`;
  }
}

/**
 * Standard HH:MM:SS format
 */
export function formatDurationHHMMSS(totalSec: number): string {
  if (!totalSec || totalSec <= 0) return '00:00:00';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Returns "Last updated hh:mm" for data refresh indicators
 */
export function formatLastUpdatedTime(date: Date = new Date()): string {
  const hrs = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');
  return `Last updated ${hrs}:${mins}`;
}

/**
 * Returns "Last seen X min ago" for user presence
 */
export function formatLastSeen(lastHeartbeatIso?: string): string {
  if (!lastHeartbeatIso) return 'Last seen --';
  const hbTime = new Date(lastHeartbeatIso).getTime();
  if (isNaN(hbTime)) return 'Last seen --';
  const diffMins = Math.floor((Date.now() - hbTime) / 60000);
  if (diffMins < 1) return 'Last seen just now';
  if (diffMins === 1) return 'Last seen 1 min ago';
  return `Last seen ${diffMins} min ago`;
}
