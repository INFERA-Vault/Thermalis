import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { OSMFacilityDetail } from '../types';

export function useFacilityDetail(facilityId: number | null) {
  const [facility, setFacility] = useState<OSMFacilityDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!facilityId) {
      setFacility(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    api.getOsmFacility(facilityId)
      .then(res => {
        if (isMounted) setFacility(res);
      })
      .catch(err => {
        if (isMounted) {
          console.warn(`Error loading facility ${facilityId}:`, err);
          setError(err.message || 'Facility metadata not found');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [facilityId]);

  return { facility, loading, error };
}
