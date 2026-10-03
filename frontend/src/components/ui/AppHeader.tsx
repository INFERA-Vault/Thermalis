import React from 'react';
import { Flame } from 'lucide-react';
import { LocationSearch } from '../search/LocationSearch';
import { EventFeatureCollection, FacilityFeatureCollection } from '../../types';
import { LiquidGlassButton } from './LiquidGlassButton';
import { LiquidGlassSurface } from './LiquidGlassSurface';

interface AppHeaderProps {
  events: EventFeatureCollection;
  facilities: FacilityFeatureCollection;
  onNavigateCoords: (coords: { lng: number; lat: number; zoom?: number }) => void;
  
  // Toolbar states
  layersOpen: boolean;
  onToggleLayers: () => void;
  timelineOpen: boolean;
  onToggleTimeline: () => void;
  onOpenAnalysis: () => void;
  onOpenHelp: () => void;
  onOpenAlerts: () => void;

  // Telemetry status
  alertCount: number;
  backendOnline: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  events,
  facilities,
  onNavigateCoords,
  layersOpen,
  onToggleLayers,
  timelineOpen,
  onToggleTimeline,
  onOpenAnalysis,
  onOpenHelp,
  onOpenAlerts,
  alertCount,
  backendOnline
}) => {
  return (
    <LiquidGlassSurface
      as="header"
      surfaceKey="header"
      level={1}
      borderRadius={0}
      className="h-11 w-full px-3 flex items-center justify-between select-none z-30 shrink-0 border-b border-[#1F2227]"
    >
      <div className="w-full flex items-center justify-between">
        {/* Left: Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 rounded bg-gradient-to-br from-[#FF5A00] to-[#9A0000] flex items-center justify-center shrink-0">
            <Flame size={12} className="text-white" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-xs tracking-wider text-[#F4F4F5]">
              THERMALIS
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00]" title="Operational Thermal Workstation" />
          </div>
        </div>

        {/* Center: Global Search Bar with comfortable vertical padding */}
        <div className="flex-1 max-w-md mx-4 py-0.5">
          <LocationSearch
            events={events}
            facilities={facilities}
            onNavigateCoords={onNavigateCoords}
          />
        </div>

        {/* Right: Tools & LIVE Status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <LiquidGlassButton
            type="rounded"
            size="sm"
            active={layersOpen}
            onClick={onToggleLayers}
          >
            Layers
          </LiquidGlassButton>

          <LiquidGlassButton
            type="rounded"
            size="sm"
            active={timelineOpen}
            onClick={onToggleTimeline}
          >
            Timeline
          </LiquidGlassButton>

          <LiquidGlassButton
            type="rounded"
            size="sm"
            onClick={onOpenAnalysis}
          >
            Analysis
          </LiquidGlassButton>

          <LiquidGlassButton
            type="rounded"
            size="sm"
            onClick={onOpenHelp}
          >
            Help
          </LiquidGlassButton>

          <LiquidGlassButton
            type="rounded"
            size="sm"
            active={alertCount > 0}
            variant={alertCount > 0 ? 'critical' : 'default'}
            onClick={onOpenAlerts}
            title="Active operational alerts generated from thermal observations. One thermal event may produce multiple alert types."
          >
            {alertCount > 0 ? (
              <span className="flex items-center gap-1.5">
                <span>Active Alerts</span>
                <span className="px-1.5 py-0.2 rounded-sm bg-[#EF4444] text-white text-[9px] font-mono font-bold leading-none">
                  {alertCount}
                </span>
              </span>
            ) : (
              'Active Alerts'
            )}
          </LiquidGlassButton>

          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#272A30] bg-[#111317] text-[10px] font-mono ml-1">
            <span className={`status-dot ${backendOnline ? 'status-dot-green' : 'status-dot-amber'}`} />
            <span className={backendOnline ? 'text-emerald-400 font-medium' : 'text-[#FF9F00] font-medium'}>
              LIVE
            </span>
          </div>
        </div>
      </div>
    </LiquidGlassSurface>
  );
};
