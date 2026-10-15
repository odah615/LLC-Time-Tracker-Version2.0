import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, Laptop, MapPin } from 'lucide-react';

const PRESET_GEOS = [
  { label: 'Toronto, Canada (EST)', tz: 'America/Toronto', city: 'Toronto, Canada' },
  { label: 'Manila, Philippines (PHT)', tz: 'Asia/Manila', city: 'Manila, Philippines' },
  { label: 'New York, US (EST)', tz: 'America/New_York', city: 'New York, US' },
  { label: 'Los Angeles, US (PST)', tz: 'America/Los_Angeles', city: 'Los Angeles, US' },
  { label: 'London, UK (GMT/BST)', tz: 'Europe/London', city: 'London, UK' },
  { label: 'Sydney, Australia (AEST)', tz: 'Australia/Sydney', city: 'Sydney, Australia' },
  { label: 'Tokyo, Japan (JST)', tz: 'Asia/Tokyo', city: 'Tokyo, Japan' },
  { label: 'Singapore (SGT)', tz: 'Asia/Singapore', city: 'Singapore' },
];

export const WorldClockWidget: React.FC = () => {
  const { currentUser, users } = useApp();
  const [deviceTime, setDeviceTime] = useState<string>('');
  const [deviceTzName, setDeviceTzName] = useState<string>('');

  const [selectedGeoTz, setSelectedGeoTz] = useState<string>(
    currentUser.geoTimezone || 'America/Toronto'
  );
  const [selectedGeoLabel, setSelectedGeoLabel] = useState<string>(
    currentUser.geoCity || 'Toronto, Canada'
  );
  const [selectedGeoTime, setSelectedGeoTime] = useState<string>('');

  useEffect(() => {
    if (currentUser.geoTimezone) {
      setSelectedGeoTz(currentUser.geoTimezone);
      setSelectedGeoLabel(currentUser.geoCity || currentUser.name);
    }
  }, [currentUser.id, currentUser.geoTimezone, currentUser.geoCity]);

  useEffect(() => {
    const userDeviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const updateTimes = () => {
      const now = new Date();
      try {
        const timeStr = now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const dayStr = now.toLocaleDateString([], { weekday: 'short' });
        const tzAbbr =
          new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
            .formatToParts(now)
            .find((p) => p.type === 'timeZoneName')?.value || userDeviceTz;
        setDeviceTime(`${timeStr} (${dayStr})`);
        setDeviceTzName(tzAbbr);
      } catch {
        setDeviceTime('Loading...');
      }

      try {
        const timeStr = now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: selectedGeoTz,
        });
        const dayStr = now.toLocaleDateString([], {
          weekday: 'short',
          timeZone: selectedGeoTz,
        });
        setSelectedGeoTime(`${timeStr} (${dayStr})`);
      } catch {
        setSelectedGeoTime('Loading...');
      }
    };

    updateTimes();
    const interval = setInterval(updateTimes, 1000);
    return () => clearInterval(interval);
  }, [selectedGeoTz]);

  const handleGeoSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedGeoTz(val);
    const presetMatch = PRESET_GEOS.find((g) => g.tz === val);
    if (presetMatch) {
      setSelectedGeoLabel(presetMatch.city);
      return;
    }
    const userMatch = users.find((u) => u.geoTimezone === val);
    if (userMatch) {
      setSelectedGeoLabel(`${userMatch.name} (${userMatch.geoCity})`);
      return;
    }
    setSelectedGeoLabel(val);
  };

  return (
    <div id="world-clock-widget" className="bg-[#0B132B] border-b border-slate-800/80 text-slate-100 text-xs py-2 px-4">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-x-auto py-0.5 scrollbar-none">
          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300 whitespace-nowrap">
            <Laptop className="w-3.5 h-3.5 text-blue-400" />
            <span className="font-semibold text-slate-200">Device Time ({deviceTzName}):</span>
            <span className="font-mono text-blue-300 font-semibold">{deviceTime}</span>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 whitespace-nowrap">
            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            {currentUser.role === 'team_lead' || currentUser.role === 'trainer' || currentUser.role === 'admin' ? (
              <>
                <span className="font-semibold text-slate-200">
                  {currentUser.role === 'trainer' ? 'Select Trainee/Agent GEO:' : 'Select Agent GEO:'}
                </span>
                <select
                  value={selectedGeoTz}
                  onChange={handleGeoSelect}
                  className="bg-slate-900 border border-emerald-700/60 text-emerald-200 text-xs font-medium rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400 cursor-pointer"
                >
                  <optgroup label="Assigned Agents GEO">
                    {users.map((u) => (
                      <option key={u.id} value={u.geoTimezone}>
                        {u.name} – {u.geoCity} ({u.geoTimezone})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Global Regions & Hubs">
                    {PRESET_GEOS.map((g) => (
                      <option key={g.tz} value={g.tz}>
                        {g.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </>
            ) : (
              <span className="font-semibold text-slate-200">GEO ({currentUser.geoCity}):</span>
            )}
            <span className="font-mono text-emerald-300 font-bold ml-1">{selectedGeoTime}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>LLC-Time-Tracker-V2 Sync</span>
        </div>
      </div>
    </div>
  );
};
