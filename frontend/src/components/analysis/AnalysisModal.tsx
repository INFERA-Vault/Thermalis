import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { EventFeatureCollection, FacilityFeatureCollection, DashboardStats } from '../../types';
import { LiquidGlassSurface } from '../ui/LiquidGlassSurface';

interface AnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: EventFeatureCollection;
  facilities: FacilityFeatureCollection;
  stats: DashboardStats | null;
  alertCount: number;
}

export const AnalysisModal: React.FC<AnalysisModalProps> = ({
  isOpen,
  onClose,
  events,
  facilities,
  stats,
  alertCount
}) => {
  const metrics = useMemo(() => {
    const evList = events.features;
    const totalEvents = stats?.total_events ?? evList.length;
    const totalFacilities = stats?.total_facilities ?? facilities.features.length;

    let minFrp = Infinity;
    let maxFrp = 0;
    let sumFrp = 0;
    let countLow = 0;      // <20 MW
    let countMod = 0;      // 20-80 MW
    let countHigh = 0;     // 80-250 MW
    let countSevere = 0;   // >250 MW

    const locationMap = new Map<string, number>();

    evList.forEach(f => {
      const frp = f.properties.frp || 0;
      sumFrp += frp;
      if (frp < minFrp) minFrp = frp;
      if (frp > maxFrp) maxFrp = frp;

      if (frp < 20) countLow++;
      else if (frp < 80) countMod++;
      else if (frp < 250) countHigh++;
      else countSevere++;

      const [lng, lat] = f.geometry.coordinates;
      const key = `${lng.toFixed(2)},${lat.toFixed(2)}`;
      locationMap.set(key, (locationMap.get(key) || 0) + 1);
    });

    let singleOccurrence = 0;
    let intermittent = 0;
    let highlyPersistent = 0;

    locationMap.forEach(count => {
      if (count === 1) singleOccurrence++;
      else if (count < 5) intermittent++;
      else highlyPersistent++;
    });

    const avgFrp = evList.length > 0 ? sumFrp / evList.length : 0;

    return {
      totalEvents,
      totalFacilities,
      activeEvents: evList.length,
      minFrp: minFrp === Infinity ? 0 : minFrp,
      maxFrp,
      avgFrp,
      frpBuckets: {
        low: countLow,
        mod: countMod,
        high: countHigh,
        severe: countSevere
      },
      persistenceBuckets: {
        single: singleOccurrence,
        intermittent: intermittent,
        persistent: highlyPersistent
      }
    };
  }, [events, facilities, stats]);

  if (!isOpen) return null;

  const totalBucketItems = Math.max(1, metrics.activeEvents);
  const totalLocations = Math.max(
    1,
    metrics.persistenceBuckets.single +
      metrics.persistenceBuckets.intermittent +
      metrics.persistenceBuckets.persistent
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 select-none p-4 backdrop-blur-xs">
      <LiquidGlassSurface
        as="div"
        type="rounded"
        level={3}
        surfaceKey="floatingPanels"
        borderRadius={12}
        className="w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#262322] bg-[#0C0E11]/70 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-sm bg-[#FF5A00]" />
            <span className="text-xs font-semibold text-[#F4F4F5] uppercase tracking-wider">
              Thermal Intelligence Analysis
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#94908D] hover:text-[#F4F4F5] p-0.5 rounded transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* SECTION 1: OVERVIEW */}
          <div>
            <div className="text-[10px] font-semibold text-[#94908D] tracking-wider uppercase mb-2">
              OVERVIEW
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#0C0E11] border border-[#262322] p-2.5 rounded">
                <span className="text-[#94908D] text-[10px] block">Total Events</span>
                <span className="text-base font-bold font-mono text-[#F4F4F5] block mt-0.5">
                  {metrics.totalEvents.toLocaleString()}
                </span>
              </div>

              <div className="bg-[#0C0E11] border border-[#262322] p-2.5 rounded">
                <span className="text-[#94908D] text-[10px] block">Facilities</span>
                <span className="text-base font-bold font-mono text-[#F4F4F5] block mt-0.5">
                  {metrics.totalFacilities.toLocaleString()}
                </span>
              </div>

              <div className="bg-[#0C0E11] border border-[#262322] p-2.5 rounded">
                <span className="text-[#94908D] text-[10px] block">Active Alerts</span>
                <span className={`text-base font-bold font-mono block mt-0.5 ${alertCount > 0 ? 'text-[#FF5A00]' : 'text-[#F4F4F5]'}`}>
                  {alertCount}
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 2: THERMAL ACTIVITY */}
          <div className="space-y-3 pt-2 border-t border-[#262322]">
            <div className="text-[10px] font-semibold text-[#94908D] tracking-wider uppercase">
              THERMAL ACTIVITY
            </div>

            {/* FRP Distribution */}
            <div className="bg-[#0C0E11] border border-[#262322] p-3 rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-stone-200 font-medium text-[11px]">Fire Radiative Power (FRP) Distribution</span>
                <span className="text-[#94908D] text-[10px]">
                  Average: <span className="font-mono text-[#FFD000]">{metrics.avgFrp.toFixed(1)} MW</span>
                </span>
              </div>

              <div className="space-y-2 pt-1 text-[11px]">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[#94908D]">&lt; 20 MW (Low Intensity)</span>
                    <span className="font-mono text-stone-300">
                      {metrics.frpBuckets.low} ({((metrics.frpBuckets.low / totalBucketItems) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2025] h-1.5 rounded overflow-hidden">
                    <div
                      className="bg-[#FF9F00] h-full rounded"
                      style={{ width: `${(metrics.frpBuckets.low / totalBucketItems) * 100}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[#94908D]">20 - 80 MW (Moderate Flare)</span>
                    <span className="font-mono text-stone-300">
                      {metrics.frpBuckets.mod} ({((metrics.frpBuckets.mod / totalBucketItems) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2025] h-1.5 rounded overflow-hidden">
                    <div
                      className="bg-[#FF5A00] h-full rounded"
                      style={{ width: `${(metrics.frpBuckets.mod / totalBucketItems) * 100}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[#94908D]">&gt; 80 MW (Intense Thermal Anomaly)</span>
                    <span className="font-mono text-stone-300">
                      {metrics.frpBuckets.high + metrics.frpBuckets.severe} ({(((metrics.frpBuckets.high + metrics.frpBuckets.severe) / totalBucketItems) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2025] h-1.5 rounded overflow-hidden">
                    <div
                      className="bg-[#FF0000] h-full rounded"
                      style={{ width: `${((metrics.frpBuckets.high + metrics.frpBuckets.severe) / totalBucketItems) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Persistence */}
            <div className="bg-[#0C0E11] border border-[#262322] p-3 rounded space-y-2">
              <span className="text-stone-200 font-medium text-[11px] block">Temporal Persistence</span>
              <div className="space-y-2 pt-1 text-[11px]">
                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[#94908D]">Single observation</span>
                    <span className="font-mono text-stone-300">
                      {metrics.persistenceBuckets.single} ({((metrics.persistenceBuckets.single / totalLocations) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2025] h-1.5 rounded overflow-hidden">
                    <div
                      className="bg-[#383330] h-full rounded"
                      style={{ width: `${(metrics.persistenceBuckets.single / totalLocations) * 100}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[#94908D]">Intermittent (2 - 4 detections)</span>
                    <span className="font-mono text-stone-300">
                      {metrics.persistenceBuckets.intermittent} ({((metrics.persistenceBuckets.intermittent / totalLocations) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2025] h-1.5 rounded overflow-hidden">
                    <div
                      className="bg-[#FF9F00] h-full rounded"
                      style={{ width: `${(metrics.persistenceBuckets.intermittent / totalLocations) * 100}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-0.5">
                    <span className="text-[#94908D]">Persistent (&ge; 5 detections)</span>
                    <span className="font-mono text-stone-300">
                      {metrics.persistenceBuckets.persistent} ({((metrics.persistenceBuckets.persistent / totalLocations) * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="w-full bg-[#1D2025] h-1.5 rounded overflow-hidden">
                    <div
                      className="bg-[#E74D02] h-full rounded"
                      style={{ width: `${(metrics.persistenceBuckets.persistent / totalLocations) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: MODEL */}
          <div className="space-y-2 pt-2 border-t border-[#262322]">
            <div className="text-[10px] font-semibold text-[#94908D] tracking-wider uppercase">
              MODEL INFERENCE ARCHITECTURE
            </div>
            <div className="bg-[#0C0E11] border border-[#262322] p-3 rounded space-y-1.5">
              <span className="text-[#F4F4F5] font-semibold text-[11px] block">
                Model A — GIHS Decision Tree Ensemble
              </span>
              <p className="text-[#94908D] text-[11px] leading-relaxed">
                Gradient-boosted decision trees trained on Global Industrial Heat Sources (GIHS) and agricultural fire baselines.
              </p>
              <div className="text-[10px] text-[#686360] pt-1">
                Inputs: Proximity, 30-day frequency, persistence days, recurrence rate, WorldCover land class, FRP, and brightness temperature.
              </div>
            </div>
          </div>
        </div>
      </LiquidGlassSurface>
    </div>
  );
};
