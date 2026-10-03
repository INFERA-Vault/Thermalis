import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { EventFeatureItem } from '../types';

/**
 * Format any date string, ISO string, timestamp number, or Date object strictly as UTC.
 * e.g. "2026-10-01 06:50:00 UTC"
 */
export function formatUtcDateTime(dateInput?: string | number | Date | null): string {
  if (!dateInput && dateInput !== 0) return 'N/A';
  try {
    const d = typeof dateInput === 'number'
      ? new Date(dateInput)
      : typeof dateInput === 'string'
      ? new Date(dateInput)
      : dateInput;
    if (!d || isNaN(d.getTime())) return String(dateInput);
    const iso = d.toISOString(); // e.g. "2026-10-01T06:50:00.000Z"
    const datePart = iso.slice(0, 10);
    const timePart = iso.slice(11, 19);
    return `${datePart} ${timePart} UTC`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Format date strictly as UTC time with date (e.g. "10-01 06:50 UTC" or "06:50 UTC").
 */
export function formatUtcShort(dateInput?: string | number | Date | null): string {
  if (!dateInput && dateInput !== 0) return 'N/A';
  try {
    const d = typeof dateInput === 'number'
      ? new Date(dateInput)
      : typeof dateInput === 'string'
      ? new Date(dateInput)
      : dateInput;
    if (!d || isNaN(d.getTime())) return String(dateInput);
    const iso = d.toISOString();
    return `${iso.slice(5, 10)} ${iso.slice(11, 16)} UTC`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Format time only strictly as UTC: "HH:mm UTC"
 */
export function formatUtcTimeOnly(dateInput?: string | number | Date | null): string {
  if (!dateInput && dateInput !== 0) return 'N/A';
  try {
    const d = typeof dateInput === 'number'
      ? new Date(dateInput)
      : typeof dateInput === 'string'
      ? new Date(dateInput)
      : dateInput;
    if (!d || isNaN(d.getTime())) return String(dateInput);
    const iso = d.toISOString();
    return `${iso.slice(11, 16)} UTC`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Format duration between two timestamps: e.g. "1h 45m" or "45m" or "2d 4h"
 */
export function formatDurationSpan(minTs: number, maxTs: number): string {
  if (!minTs || !maxTs || maxTs < minTs) return '0m';
  const diffMinutes = Math.round((maxTs - minTs) / (60 * 1000));
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  if (hours < 24) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

export function formatRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return 'Unknown';
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return 'Unknown';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

export interface DateHistogramBin {
  date: string; // ISO string
  timestamp: number;
  count: number;
  heightPercent: number;
}

export interface ObservationClusterMarker {
  timestamp: number;
  dateStr: string;
  count: number;
  normalizedPos: number; // 0.0 to 1.0 (clamped)
  formattedTime: string; // e.g. "06:50 UTC"
}

/**
 * Extract unique observation timestamp clusters with exact counts and normalized positions.
 */
export function getObservationClusterMarkers(
  features: EventFeatureItem[],
  bounds: { min: number; max: number }
): ObservationClusterMarker[] {
  const { min, max } = bounds;
  const span = max - min || 1;
  const timestampMap = new Map<number, number>();

  for (const f of features) {
    if (!f.properties.detected_at) continue;
    const t = new Date(f.properties.detected_at).getTime();
    if (!isNaN(t)) {
      timestampMap.set(t, (timestampMap.get(t) || 0) + 1);
    }
  }

  const sortedEntries = Array.from(timestampMap.entries()).sort((a, b) => a[0] - b[0]);
  return sortedEntries.map(([t, count]) => {
    const clamped = Math.max(min, Math.min(max, t));
    const norm = (clamped - min) / span;
    return {
      timestamp: t,
      dateStr: new Date(t).toISOString(),
      count,
      normalizedPos: Math.min(1, Math.max(0, norm)),
      formattedTime: formatUtcTimeOnly(t)
    };
  });
}

/**
 * Generate proportional histogram bins across [min, max] with distinct height for non-empty bins.
 */
export function generateHistogram(
  features: EventFeatureItem[],
  binCount: number = 64,
  explicitBounds?: { min: number; max: number }
): DateHistogramBin[] {
  const validTimestamps = features
    .map(f => (f.properties.detected_at ? new Date(f.properties.detected_at).getTime() : NaN))
    .filter(t => !isNaN(t))
    .sort((a, b) => a - b);

  if (validTimestamps.length === 0) {
    return [];
  }

  const minTime = explicitBounds ? explicitBounds.min : validTimestamps[0];
  const maxTime = explicitBounds ? explicitBounds.max : validTimestamps[validTimestamps.length - 1];

  if (minTime >= maxTime) {
    return [
      {
        date: new Date(minTime).toISOString(),
        timestamp: minTime,
        count: validTimestamps.length,
        heightPercent: 100
      }
    ];
  }

  const step = (maxTime - minTime) / binCount;
  const bins: { date: string; timestamp: number; count: number }[] = [];
  let maxCount = 1;

  for (let i = 0; i < binCount; i++) {
    const start = minTime + i * step;
    const end = start + step;
    const count = validTimestamps.filter(t => t >= start && (i === binCount - 1 ? t <= end : t < end)).length;
    if (count > maxCount) {
      maxCount = count;
    }
    bins.push({
      date: new Date(start).toISOString(),
      timestamp: start,
      count
    });
  }

  return bins.map(b => ({
    ...b,
    // 0 height for empty bins, proportional height with 25% minimum base for bins with observations
    heightPercent: b.count === 0 ? 0 : Math.min(100, Math.round(25 + (b.count / maxCount) * 75))
  }));
}
