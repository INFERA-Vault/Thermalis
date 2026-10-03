import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../services/api';
import {
  EventFeatureCollection,
  FacilityFeatureCollection,
  DashboardStats,
  BackendHealth,
  TimelineRangeMode,
  EventFeatureItem,
  AlertCountResponse
} from '../types';

export type DataFetchStatus = 'idle' | 'loading' | 'success' | 'error';

export function useThermalData() {
  const [eventsData, setEventsData] = useState<EventFeatureCollection>({
    type: 'FeatureCollection',
    features: []
  });
  const [facilitiesData, setFacilitiesData] = useState<FacilityFeatureCollection>({
    type: 'FeatureCollection',
    features: []
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [alertCount, setAlertCount] = useState<number>(0);
  const [alertCounts, setAlertCounts] = useState<AlertCountResponse | null>(null);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [backendOnline, setBackendOnline] = useState<boolean>(false);
  const [eventsStatus, setEventsStatus] = useState<DataFetchStatus>('idle');
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  // Timeline Filtering States
  const [timelineMode, setTimelineMode] = useState<TimelineRangeMode>('all');
  const [scrubberTimestamp, setScrubberTimestamp] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Load all core data from real backend
  const loadData = useCallback(async (isSilent: boolean = false) => {
    if (!isSilent) {
      setLoading(true);
      setEventsStatus('loading');
    }
    setError(null);

    try {
      // 1. Health check
      try {
        const healthRes = await api.getHealth();
        setHealth(healthRes);
        setBackendOnline(healthRes.status === 'ok');
      } catch (healthErr: any) {
        console.warn('Backend health check warning:', healthErr.message);
        setBackendOnline(false);
      }

      // 2. Load Events, Facilities, Stats, Alerts in parallel
      const [eventsRes, facilitiesRes, statsRes, alertsCountRes] = await Promise.allSettled([
        api.getDashboardEvents(2000),
        api.getDashboardFacilities(5000),
        api.getDashboardStats(),
        api.getAlertCount()
      ]);

      if (eventsRes.status === 'fulfilled' && eventsRes.value && Array.isArray(eventsRes.value.features)) {
        setEventsData(eventsRes.value);
        setEventsStatus('success');
        setEventsError(null);
      } else {
        setEventsStatus('error');
        const reasonMsg = eventsRes.status === 'rejected' 
          ? (eventsRes.reason?.message || 'Failed to retrieve thermal events') 
          : 'Invalid payload structure';
        setEventsError(reasonMsg);
        console.warn('Events fetch issue:', reasonMsg);
      }

      if (facilitiesRes.status === 'fulfilled' && facilitiesRes.value?.features) {
        setFacilitiesData(facilitiesRes.value);
      }

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value);
      }

      if (alertsCountRes.status === 'fulfilled') {
        setAlertCount(alertsCountRes.value.active_alerts ?? 0);
        setAlertCounts(alertsCountRes.value);
      }

      setLastRefreshed(new Date());
    } catch (err: any) {
      console.error('Data load error:', err);
      setError(err.message || 'Unable to connect to INFERA backend API');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Trigger NASA FIRMS refresh
  const triggerFirmsRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const summary = await api.refreshFirms();
      // Reload events after refresh
      await loadData(true);
      return summary;
    } catch (err: any) {
      console.warn('FIRMS refresh issue:', err.message);
      throw err;
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
    // Periodic telemetry ping every 60s
    const timer = setInterval(() => {
      loadData(true);
    }, 60000);
    return () => clearInterval(timer);
  }, [loadData]);

  // 1. Compute dataset-wide observation boundaries from real FIRMS detected_at timestamps
  const datasetTimestamps = useMemo(() => {
    return eventsData.features
      .map(f => (f.properties.detected_at ? new Date(f.properties.detected_at).getTime() : NaN))
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);
  }, [eventsData.features]);

  const datasetEarliest = datasetTimestamps.length > 0 ? datasetTimestamps[0] : Date.now() - 3600000;
  const datasetLatest = datasetTimestamps.length > 0 ? datasetTimestamps[datasetTimestamps.length - 1] : Date.now();

  // 2. Events filtered by time range mode (24h / 7d / all) relative to the actual latest observation
  const modeEvents = useMemo(() => {
    const allFeatures = eventsData.features;
    if (allFeatures.length === 0) return [];

    let cutoffTime = 0;
    if (timelineMode === '24h') {
      cutoffTime = datasetLatest - 24 * 60 * 60 * 1000;
    } else if (timelineMode === '7d') {
      cutoffTime = datasetLatest - 7 * 24 * 60 * 60 * 1000;
    }

    return allFeatures.filter((f: EventFeatureItem) => {
      if (!f.properties.detected_at) return true;
      const t = new Date(f.properties.detected_at).getTime();
      if (isNaN(t)) return true;
      if (timelineMode !== 'all' && t < cutoffTime) return false;
      return true;
    });
  }, [eventsData.features, timelineMode, datasetLatest]);

  // 3. Exact playback timeBounds derived dynamically from actual events in the active mode
  const timeBounds = useMemo(() => {
    const times = modeEvents
      .map(f => (f.properties.detected_at ? new Date(f.properties.detected_at).getTime() : NaN))
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    if (times.length === 0) {
      return {
        min: datasetEarliest,
        max: datasetLatest
      };
    }

    const minT = times[0];
    const maxT = times[times.length - 1];

    return {
      min: minT === maxT ? minT - 60000 : minT,
      max: maxT
    };
  }, [modeEvents, datasetEarliest, datasetLatest]);

  // 4. Scrubber-filtered events for map visualization and telemetry counters
  const filteredEvents = useMemo(() => {
    if (modeEvents.length === 0) return [];

    // If scrubberTimestamp is null, default to showing all mode events (at maxTimestamp)
    if (scrubberTimestamp === null) {
      return modeEvents;
    }

    return modeEvents.filter((f: EventFeatureItem) => {
      if (!f.properties.detected_at) return true;
      const t = new Date(f.properties.detected_at).getTime();
      if (isNaN(t)) return true;
      return t <= scrubberTimestamp;
    });
  }, [modeEvents, scrubberTimestamp]);

  const filteredGeoJSON: EventFeatureCollection = useMemo(() => ({
    type: 'FeatureCollection',
    features: filteredEvents
  }), [filteredEvents]);

  return {
    rawEvents: eventsData,
    modeEvents,
    filteredEvents: filteredGeoJSON,
    rawFacilities: facilitiesData,
    stats,
    health,
    alertCount,
    loading,
    refreshing,
    error,
    backendOnline,
    eventsStatus,
    eventsError,
    lastRefreshed,
    timeBounds,
    timelineMode,
    setTimelineMode,
    scrubberTimestamp,
    setScrubberTimestamp,
    isPlaying,
    setIsPlaying,
    loadData,
    triggerFirmsRefresh,
    alertCounts,
    setAlertCount
  };
}
