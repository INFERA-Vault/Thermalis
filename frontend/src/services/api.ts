import {
  EventFeatureCollection,
  FacilityFeatureCollection,
  EventDetailResponse,
  ModelAPredictionResponse,
  AlertItem,
  AlertCountResponse,
  FullSatelliteObservation,
  OSMFacilityDetail,
  WorldCoverLookupResponse,
  DashboardStats,
  BackendHealth
} from '../types';

function resolveApiBase(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;
  if (!envUrl) {
    return 'http://localhost:8000/api/v1';
  }
  const trimmed = envUrl.trim().replace(/\/+$/, '');
  // If base does not end with /api/v1 or /api, append /api/v1 so backend routers match
  if (!trimmed.endsWith('/api/v1') && !trimmed.endsWith('/api')) {
    return `${trimmed}/api/v1`;
  }
  return trimmed;
}

const API_BASE = resolveApiBase();

class ApiService {
  private base: string;

  constructor(baseUrl: string) {
    this.base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.base}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options?.headers || {})
        }
      });

      clearTimeout(timeout);

      if (!response.ok) {
        let errMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorJson = await response.json();
          if (errorJson && errorJson.detail) {
            errMessage = typeof errorJson.detail === 'string' ? errorJson.detail : JSON.stringify(errorJson.detail);
          }
        } catch {
          // fallback to statusText
        }
        throw new Error(errMessage);
      }

      return await response.json() as T;
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out for ${endpoint}`);
      }
      throw err;
    }
  }

  // Health
  async getHealth(): Promise<BackendHealth> {
    return this.request<BackendHealth>('/health');
  }

  // Dashboard Stats
  async getDashboardStats(): Promise<DashboardStats> {
    return this.request<DashboardStats>('/dashboard/stats');
  }

  // Dashboard Events (GeoJSON)
  async getDashboardEvents(limit: number = 2000): Promise<EventFeatureCollection> {
    return this.request<EventFeatureCollection>(`/dashboard/events?limit=${limit}`);
  }

  // Dashboard Event Details
  async getEventDetails(eventId: number): Promise<EventDetailResponse> {
    return this.request<EventDetailResponse>(`/dashboard/events/${eventId}`);
  }

  // Dashboard Facilities (GeoJSON)
  async getDashboardFacilities(limit: number = 5000): Promise<FacilityFeatureCollection> {
    return this.request<FacilityFeatureCollection>(`/dashboard/facilities?limit=${limit}`);
  }

  // Model A Classification
  async predictModelA(eventId: number): Promise<ModelAPredictionResponse> {
    return this.request<ModelAPredictionResponse>(`/classification/predict/${eventId}`, {
      method: 'POST'
    });
  }

  // Alerts
  async getAlerts(params?: { status?: string; severity?: string; limit?: number }): Promise<AlertItem[]> {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.severity) q.append('severity', params.severity);
    if (params?.limit) q.append('limit', String(params.limit));
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<AlertItem[]>(`/alerts/${qs}`);
  }

  async getAlertCount(): Promise<AlertCountResponse> {
    return this.request<AlertCountResponse>('/alerts/count');
  }

  async acknowledgeAlert(alertId: string): Promise<AlertItem> {
    return this.request<AlertItem>(`/alerts/${alertId}/acknowledge`, {
      method: 'POST'
    });
  }

  async resolveAlert(alertId: string): Promise<AlertItem> {
    return this.request<AlertItem>(`/alerts/${alertId}/resolve`, {
      method: 'POST'
    });
  }

  // FIRMS Ingestion
  async refreshFirms(): Promise<any> {
    return this.request<any>('/firms/refresh', {
      method: 'POST'
    });
  }

  // OSM Facilities
  async getOsmFacilities(params?: { skip?: number; limit?: number; facility_type?: string }): Promise<OSMFacilityDetail[]> {
    const q = new URLSearchParams();
    if (params?.skip) q.append('skip', String(params.skip));
    if (params?.limit) q.append('limit', String(params.limit));
    if (params?.facility_type) q.append('facility_type', params.facility_type);
    const qs = q.toString() ? `?${q.toString()}` : '';
    return this.request<OSMFacilityDetail[]>(`/osm/facilities${qs}`);
  }

  async getOsmFacility(facilityId: number): Promise<OSMFacilityDetail> {
    return this.request<OSMFacilityDetail>(`/osm/facilities/${facilityId}`);
  }

  // Satellite STAC Observations
  async getSatelliteObservations(eventId: number): Promise<FullSatelliteObservation[]> {
    return this.request<FullSatelliteObservation[]>(`/satellite/event/${eventId}`);
  }

  // Features
  async getEventFeatures(eventId: number): Promise<any> {
    return this.request<any>(`/features/${eventId}`);
  }

  // WorldCover
  async lookupWorldCover(eventId: number): Promise<WorldCoverLookupResponse> {
    return this.request<WorldCoverLookupResponse>(`/worldcover/lookup/${eventId}`);
  }
}

export const api = new ApiService(API_BASE);
