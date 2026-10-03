import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { TimelineRangeMode, EventFeatureItem } from '../../types';
import {
  generateHistogram,
  getObservationClusterMarkers,
  formatUtcDateTime,
  formatUtcShort,
  formatUtcTimeOnly,
  formatDurationSpan
} from '../../utils/timeUtils';
import { LiquidGlassSurface } from '../ui/LiquidGlassSurface';

interface TimelineBarProps {
  events: EventFeatureItem[];
  timelineMode: TimelineRangeMode;
  onSetTimelineMode: (mode: TimelineRangeMode) => void;
  scrubberTimestamp: number | null;
  onSetScrubberTimestamp: (ts: number | null) => void;
  isPlaying: boolean;
  onSetIsPlaying: (playing: boolean) => void;
  timeBounds: { min: number; max: number };
  isOpen?: boolean;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  events,
  timelineMode,
  onSetTimelineMode,
  scrubberTimestamp,
  onSetScrubberTimestamp,
  isPlaying,
  onSetIsPlaying,
  timeBounds,
  isOpen = true
}) => {
  const { min, max } = timeBounds;
  const span = Math.max(1000, max - min);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Real event histogram across the active observation window (64 bins)
  const histogramBins = useMemo(() => {
    return generateHistogram(events, 64, { min, max });
  }, [events, min, max]);

  // Exact observation timestamp clusters for vertical pips/ticks
  const clusterMarkers = useMemo(() => {
    return getObservationClusterMarkers(events, { min, max });
  }, [events, min, max]);

  // If scrubberTimestamp is null, default position is max (showing all events)
  const currentTs = scrubberTimestamp !== null ? scrubberTimestamp : max;
  const currentTsRef = useRef<number>(currentTs);
  useEffect(() => {
    currentTsRef.current = currentTs;
  }, [currentTs]);

  // Active observation count up to current scrubber timestamp
  const visibleEventCount = useMemo(() => {
    return events.filter(e => {
      if (!e.properties.detected_at) return true;
      const t = new Date(e.properties.detected_at).getTime();
      return isNaN(t) || t <= currentTs;
    }).length;
  }, [events, currentTs]);

  // Handle Play / Pause Toggle
  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      onSetIsPlaying(false);
    } else {
      // If already at or near the end of interval, reset to beginning before playing
      if (scrubberTimestamp === null || scrubberTimestamp >= max - 200) {
        onSetScrubberTimestamp(min);
      }
      onSetIsPlaying(true);
    }
  }, [isPlaying, scrubberTimestamp, min, max, onSetIsPlaying, onSetScrubberTimestamp]);

  // Handle Reset to beginning (earliest available event timestamp)
  const handleReset = useCallback(() => {
    onSetIsPlaying(false);
    onSetScrubberTimestamp(min);
  }, [min, onSetIsPlaying, onSetScrubberTimestamp]);

  // Real temporal playback engine
  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
      return;
    }

    const TICK_MS = 33; // smooth 30 fps playback
    const BASE_DURATION_MS = 15000; // 15s to traverse total available range at 1x
    const effectiveDuration = BASE_DURATION_MS / speedMultiplier;
    const totalTicks = effectiveDuration / TICK_MS;
    const timeDeltaPerTick = Math.max(50, span / totalTicks);

    playTimerRef.current = setInterval(() => {
      const cur = currentTsRef.current;
      const next = cur + timeDeltaPerTick;
      if (next >= max) {
        onSetIsPlaying(false);
        onSetScrubberTimestamp(max);
      } else {
        onSetScrubberTimestamp(next);
      }
    }, TICK_MS);

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, min, max, span, speedMultiplier, onSetIsPlaying, onSetScrubberTimestamp]);

  // Step Forward / Backward clamped strictly to [min, max]
  const handleStep = (direction: 'prev' | 'next') => {
    if (isPlaying) {
      onSetIsPlaying(false);
    }
    // Step by 10 minutes or 1/10th of span, minimum 1 minute
    const stepSize = Math.max(60000, Math.min(600000, Math.round(span / 10 / 60000) * 60000));
    if (direction === 'prev') {
      const target = Math.max(min, currentTs - stepSize);
      onSetScrubberTimestamp(target);
    } else {
      const target = Math.min(max, currentTs + stepSize);
      onSetScrubberTimestamp(target);
    }
  };

  const progressPercent = Math.min(100, Math.max(0, ((currentTs - min) / span) * 100));
  const isLimitedSpan = span < 24 * 60 * 60 * 1000;

  // 5 evenly spaced time scale ticks
  const timeScaleTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1.0].map(ratio => {
      const t = min + span * ratio;
      return {
        ratio,
        label: formatUtcTimeOnly(t)
      };
    });
  }, [min, span]);

  return (
    <LiquidGlassSurface
      as="section"
      surfaceKey="timeline"
      level={1}
      borderRadius={0}
      style={{ display: isOpen ? 'flex' : 'none' }}
      className="w-full px-3 py-1.5 flex-col gap-1 select-none z-10 font-sans border-t border-[#1F2227]"
    >
      {/* Controls & Timestamp Header */}
      <div className="flex items-center justify-between text-xs">
        {/* Playback Controls & Range Presets */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleTogglePlay}
              title={isPlaying ? 'Pause timeline playback' : 'Play timeline temporal progression'}
              className={`p-1 rounded border text-xs transition-colors ${
                isPlaying
                  ? 'bg-[#FF5A00]/20 border-[#FF5A00] text-[#FF9F00]'
                  : 'bg-[#131518] hover:bg-[#1C1F24] border-[#272A30] text-[#A1A1AA] hover:text-[#F4F4F5]'
              }`}
            >
              {isPlaying ? <Pause size={12} /> : <Play size={12} />}
            </button>

            <button
              type="button"
              onClick={handleReset}
              title="Reset timeline to earliest available observation"
              className="p-1 rounded bg-[#131518] hover:bg-[#1C1F24] border border-[#272A30] text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors"
            >
              <RotateCcw size={11} />
            </button>

            <button
              type="button"
              onClick={() => handleStep('prev')}
              title="Step backward in time"
              className="p-1 rounded bg-[#131518] hover:bg-[#1C1F24] border border-[#272A30] text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors"
            >
              <ChevronLeft size={12} />
            </button>

            <button
              type="button"
              onClick={() => handleStep('next')}
              title="Step forward in time"
              className="p-1 rounded bg-[#131518] hover:bg-[#1C1F24] border border-[#272A30] text-[#A1A1AA] hover:text-[#F4F4F5] transition-colors"
            >
              <ChevronRight size={12} />
            </button>

            {/* Playback Speed Controls */}
            <div className="flex items-center ml-1 bg-[#111317] rounded p-0.5 border border-[#272A30]">
              {([1, 2, 5] as const).map(speed => (
                <button
                  key={speed}
                  onClick={() => setSpeedMultiplier(speed)}
                  className={`px-1.5 py-0.2 rounded text-[9px] font-mono transition-colors ${
                    speedMultiplier === speed
                      ? 'bg-[#FF5A00]/25 text-[#FF9F00] font-semibold'
                      : 'text-[#8C8885] hover:text-[#F4F4F5]'
                  }`}
                  title={`Playback speed ${speed}x`}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          {/* Time Range Presets */}
          <div className="flex items-center gap-1">
            {(['24h', '7d', 'all'] as const).map(mode => {
              const label = mode === '24h' ? '24H' : mode === '7d' ? '7D' : 'ALL';
              const isSelected = timelineMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    onSetTimelineMode(mode);
                    onSetScrubberTimestamp(null);
                    onSetIsPlaying(false);
                  }}
                  className={`text-[10px] py-0.5 px-2 rounded border font-medium transition-colors ${
                    isSelected
                      ? 'bg-[#FF5A00]/20 border-[#FF5A00] text-[#FF9F00] font-semibold'
                      : 'bg-[#131518] hover:bg-[#1C1F24] border-[#272A30] text-[#8C8885] hover:text-[#F4F4F5]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Observation Interval Info Badge */}
          {isLimitedSpan && (
            <div
              className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#111317] border border-[#272A30] text-[10px] text-[#94908D]"
              title="Observation temporal bounds"
            >
              <Info size={10} className="text-[#FF9F00]" />
              <span>Observation Span: <strong className="text-[#F4F4F5] font-normal">{formatDurationSpan(min, max)}</strong></span>
              <span className="text-[#383330]">|</span>
              <span className="text-[#8C8885]">{formatUtcShort(min)} → {formatUtcShort(max)}</span>
            </div>
          )}
        </div>

        {/* Current Timestamp & Feature Telemetry */}
        <div className="flex items-center gap-2.5 font-mono text-[11px]">
          <div className="text-[#94908D] text-[10px]">
            <span className="text-[#FF9F00] font-semibold">{visibleEventCount}</span> / {events.length} Detections
          </div>
          <div className="text-[#383330]">|</div>
          <div className="text-[#F4F4F5] flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00]" />
            <span>{formatUtcDateTime(currentTs)}</span>
          </div>
        </div>
      </div>

      {/* Observation Density Track & Interactive Scrubber Rail */}
      <div className="relative w-full pt-0.5 pb-0.5">
        {/* Density Histogram Bars Container */}
        <div className="h-5 w-full flex items-end gap-[1px] px-1 pointer-events-none">
          {histogramBins.map((bin, i) => {
            const isPast = bin.timestamp <= currentTs;
            const hasEvents = bin.count > 0;

            if (!hasEvents) {
              return <div key={i} className="flex-1 h-0" />;
            }

            return (
              <div
                key={i}
                className="flex-1 flex flex-col justify-end items-center h-full"
                title={`${formatUtcTimeOnly(bin.timestamp)}: ${bin.count} detection${bin.count > 1 ? 's' : ''}`}
              >
                <div
                  className={`w-full rounded-t-[1px] transition-all duration-150 ${
                    isPast
                      ? 'bg-[#FF9F00]'
                      : 'bg-[#611511] opacity-70'
                  }`}
                  style={{ height: `${bin.heightPercent}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Base Rail Container with Cluster Ticks and Needle */}
        <div className="relative w-full h-2 flex items-center px-1">
          {/* Base Track Rail */}
          <div className="w-full h-1 bg-[#14171A] border border-[#23272E] rounded-full relative overflow-hidden">
            {/* Active Progress Fill */}
            <div
              className="h-full rounded-full transition-all duration-75 bg-[#FF5A00]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Observation Cluster Markers / Pips */}
          {clusterMarkers.map((cluster, idx) => {
            const isPast = cluster.timestamp <= currentTs;
            return (
              <div
                key={idx}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none"
                style={{ left: `calc(${cluster.normalizedPos * 100}% + 4px - ${cluster.normalizedPos * 8}px)` }}
                title={`${cluster.formattedTime}: ${cluster.count} detection${cluster.count > 1 ? 's' : ''}`}
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full border transition-all ${
                    isPast
                      ? 'bg-[#FF9F00] border-[#FF5A00]'
                      : 'bg-[#451A03] border-[#78350F] opacity-70'
                  }`}
                />
              </div>
            );
          })}

          {/* Scrubber Needle & Thumb Indicator */}
          <div
            className="absolute top-0 bottom-0 -translate-x-1/2 pointer-events-none z-15 flex flex-col items-center justify-center"
            style={{ left: `calc(${progressPercent}% + 4px - ${progressPercent * 0.08}px)` }}
          >
            {/* Subtle vertical indicator line extending through the track area only */}
            <div className="w-[1px] h-[22px] -top-[14px] absolute bg-[#FF9F00]/80 pointer-events-none" />
            {/* Circular Thumb handle centered exactly on the timeline track */}
            <div className="w-2.5 h-2.5 rounded-full bg-[#FF5A00] border border-white shadow-sm relative z-10" />
          </div>

          {/* Transparent Input Slider Overlay for full click & drag coverage */}
          <input
            type="range"
            min={min}
            max={max}
            value={currentTs}
            onChange={e => {
              onSetIsPlaying(false);
              onSetScrubberTimestamp(Number(e.target.value));
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />
        </div>

        {/* 5-Tick Time Axis Scale Labels */}
        <div className="flex items-center justify-between text-[9px] font-mono text-[#686360] px-1 mt-0.5">
          {timeScaleTicks.map((tick, idx) => (
            <span
              key={idx}
              className={`${idx === 0 || idx === timeScaleTicks.length - 1 ? 'text-[#8C8885] font-medium' : ''}`}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
    </LiquidGlassSurface>
  );
};
