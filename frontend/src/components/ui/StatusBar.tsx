import React from 'react';
import { formatCoordinates } from '../../utils/geoUtils';
import { DataFetchStatus } from '../../hooks/useThermalData';

interface StatusBarProps {
  telemetry: {
    lng: number;
    lat: number;
    zoom: number;
    pitch: number;
    bearing: number;
  };
  backendOnline: boolean;
  eventCount: number;
  eventsStatus?: DataFetchStatus;
  alertCount: number;
  lastSyncAt?: string;
  syncStatus?: string;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  telemetry,
  backendOnline,
  eventCount,
  eventsStatus = 'idle',
  alertCount,
  lastSyncAt,
  syncStatus
}) => {
  const formatSyncTime = (isoString?: string) => {
    if (!isoString) return null;
    try {
      const d = new Date(isoString);
      const hours = String(d.getUTCHours()).padStart(2, '0');
      const mins = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hours}:${mins} UTC`;
    } catch {
      return null;
    }
  };

  const syncTimeStr = formatSyncTime(lastSyncAt);
  const renderFirmsPart = () => {
    if (!backendOnline) {
      return <span className="text-[#E74D02]" title="Backend offline">FIRMS OFFLINE</span>;
    }
    if (eventsStatus === 'loading') {
      return <span className="text-[#FF9F00]" title="Fetching FIRMS data...">FIRMS LOADING...</span>;
    }
    if (eventsStatus === 'error') {
      return <span className="text-[#FF5A00]" title="Unable to retrieve FIRMS observations">FIRMS UNAVAILABLE</span>;
    }
    return (
      <span title="NASA FIRMS thermal observations" className="cursor-help">
        FIRMS <strong className="text-[#F4F4F5] font-normal">{eventCount}</strong>
      </span>
    );
  };

  return (
    <footer
      className="h-6 w-full bg-[#0A0C10]/95 backdrop-blur-md border-t border-[#1F2227] px-3 flex items-center justify-between text-[11px] text-[#94908D] select-none z-30 shrink-0 overflow-hidden font-mono"
    >
      {/* Left: Map Coordinate State & Zoom Readout */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        <span className="text-[#D4D4D8]">{formatCoordinates(telemetry.lng, telemetry.lat)}</span>
        <span className="text-[#383330]">|</span>
        <span>Zoom <strong className="text-[#F4F4F5] font-normal">{telemetry.zoom.toFixed(1)}</strong></span>
      </div>

      {/* Right: Live Stream & System Telemetry */}
      <div className="flex items-center gap-2 whitespace-nowrap">
        {renderFirmsPart()}
        <span className="text-[#383330]">|</span>
        <span 
          title="Active operational alerts generated from thermal observations. One thermal event may produce multiple alert types."
          className="cursor-help"
        >
          Active Alerts{' '}
          <span className={alertCount > 0 ? 'text-[#FF5A00] font-semibold' : 'text-[#F4F4F5]'}>
            {alertCount}
          </span>
        </span>
        {syncTimeStr && (
          <>
            <span className="text-[#383330]">|</span>
            <span title={`NASA FIRMS Live Sync (${syncStatus || 'ok'}): ${lastSyncAt}`} className="text-[#A1A1AA] cursor-help">
              Sync <span className="text-[#F4F4F5]">{syncTimeStr}</span>
            </span>
          </>
        )}
        <span className="text-[#383330]">|</span>
        <span className={backendOnline ? 'text-emerald-400 font-medium' : 'text-[#EF4444] font-medium'}>
          Backend {backendOnline ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>
    </footer>
  );
};

