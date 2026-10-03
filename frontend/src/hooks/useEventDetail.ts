import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';
import {
  EventDetailResponse,
  ModelAPredictionResponse,
  FullSatelliteObservation,
  WorldCoverLookupResponse,
  AlertItem
} from '../types';

// In-memory cache for Model A inference results keyed by event ID
const modelACache = new Map<number, ModelAPredictionResponse>();

export function useEventDetail(eventId: number | null) {
  const [detail, setDetail] = useState<EventDetailResponse | null>(null);
  const [modelA, setModelA] = useState<ModelAPredictionResponse | null>(null);
  const [satellites, setSatellites] = useState<FullSatelliteObservation[]>([]);
  const [worldCover, setWorldCover] = useState<WorldCoverLookupResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  
  const [loading, setLoading] = useState<boolean>(false);
  const [modelLoading, setModelLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);

  // Active event ID ref to guard against race conditions on rapid event switching
  const activeEventIdRef = useRef<number | null>(eventId);
  activeEventIdRef.current = eventId;

  // Run Model A inference with caching and race-condition guards
  const executeModelA = useCallback(async (id: number, forceRefresh: boolean = false) => {
    // 1. Check cache first
    if (!forceRefresh && modelACache.has(id)) {
      if (activeEventIdRef.current === id) {
        setModelA(modelACache.get(id)!);
        setModelLoading(false);
        setModelError(null);
      }
      return;
    }

    if (activeEventIdRef.current === id) {
      setModelLoading(true);
      setModelError(null);
      setModelA(null);
    }

    try {
      const pred = await api.predictModelA(id);
      // Store in cache
      modelACache.set(id, pred);
      
      // Guard: Only update state if this event is still active
      if (activeEventIdRef.current === id) {
        setModelA(pred);
        setModelError(null);
      }
    } catch (err: any) {
      console.warn(`Model A classification error for event ${id}:`, err);
      if (activeEventIdRef.current === id) {
        setModelError(err.message || 'Inference unavailable');
        setModelA(null);
      }
    } finally {
      if (activeEventIdRef.current === id) {
        setModelLoading(false);
      }
    }
  }, []);

  const fetchDetails = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setWorldCover(null);
    setSatellites([]);
    setAlerts([]);

    // Auto-run or retrieve cached Model A inference immediately
    executeModelA(id, false);

    try {
      // 1. Fetch primary event details
      const eventDetailsPromise = api.getEventDetails(id);
      
      // 2. Fetch satellites STAC metadata
      const satPromise = api.getSatelliteObservations(id).catch(e => {
        console.warn('Satellite observations fetch error:', e.message);
        return [];
      });

      // 3. Fetch WorldCover data
      const wcPromise = api.lookupWorldCover(id).catch(e => {
        console.warn('WorldCover fetch error:', e.message);
        return null;
      });

      // 4. Fetch alerts related to this event
      const alertsPromise = api.getAlerts({ limit: 100 }).catch(e => {
        console.warn('Alerts fetch error:', e.message);
        return [];
      });

      const [eventRes, satRes, wcRes, alertsRes] = await Promise.all([
        eventDetailsPromise,
        satPromise,
        wcPromise,
        alertsPromise
      ]);

      if (activeEventIdRef.current === id) {
        setDetail(eventRes);
        setSatellites(satRes);
        setWorldCover(wcRes);
        
        // Filter alerts for this event
        const matchedAlerts = (alertsRes || []).filter(a => a.thermal_event_id === id);
        setAlerts(matchedAlerts);
      }
    } catch (err: any) {
      console.error(`Error loading event ${id}:`, err);
      if (activeEventIdRef.current === id) {
        setError(err.message || 'Unable to load event details from backend');
      }
    } finally {
      if (activeEventIdRef.current === id) {
        setLoading(false);
      }
    }
  }, [executeModelA]);

  useEffect(() => {
    if (eventId !== null) {
      fetchDetails(eventId);
    } else {
      setDetail(null);
      setModelA(null);
      setSatellites([]);
      setWorldCover(null);
      setAlerts([]);
      setError(null);
      setModelError(null);
      setModelLoading(false);
    }
  }, [eventId, fetchDetails]);

  return {
    detail,
    modelA,
    satellites,
    worldCover,
    alerts,
    loading,
    modelLoading,
    error,
    modelError,
    triggerModelA: () => eventId && executeModelA(eventId, true),
    refetch: () => eventId && fetchDetails(eventId)
  };
}
