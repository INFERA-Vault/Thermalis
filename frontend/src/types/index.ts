// Core Types matching SIH PS-162 INFERA Backend Schema

export interface Coordinates {
  lng: number;
  lat: number;
}

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

// GeoJSON Types
export interface EventGeoProperties {
  id: number;
  event_id?: number;
  frp: number;
  brightness_temperature: number;
  confidence: number | string;
  satellite: string;
  detected_at: string | null;
  source: string;
  original_lng?: number;
  original_lat?: number;
  is_coincident?: boolean;
  coincident_count?: number;
  coincident_index?: number;
  coincident_ids?: number[];
  hotspot_frequency_30d?: number;
  persistence_days?: number;
  is_persistent?: boolean;
  nearby_facility_count?: number;
  distance_to_facility_meters?: number | null;
  has_industrial_association?: boolean;
}

export interface EventFeatureItem {
  type: 'Feature';
  id: number;
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: EventGeoProperties;
}

export interface EventFeatureCollection {
  type: 'FeatureCollection';
  features: EventFeatureItem[];
}

export interface FacilityGeoProperties {
  id: number;
  name: string;
  facility_type: string;
  source: string;
}

export interface FacilityFeatureItem {
  type: 'Feature';
  id: number;
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: FacilityGeoProperties;
}

export interface FacilityFeatureCollection {
  type: 'FeatureCollection';
  features: FacilityFeatureItem[];
}

// Single Event Details (GET /api/v1/dashboard/events/{id})
export interface SingleEventData {
  id: number;
  latitude: number;
  longitude: number;
  frp: number;
  brightness_temperature: number;
  confidence: number;
  satellite: string;
  detected_at: string | null;
  source: string;
}

export interface SingleFacilityData {
  id: number;
  name: string;
  facility_type: string;
  distance_meters: number;
}

export interface SingleEventFeatures {
  nearby_facility_count?: number | null;
  hotspot_frequency_30d?: number | null;
  persistence_days?: number | null;
  recurrence_rate?: number | null;
  land_cover_at_event?: number | null;
  is_built_up?: number | boolean | null;
  day_night?: string | null;
}

export interface SingleSatelliteObs {
  platform: string;
  date: string;
  product_id: string;
}

export interface EventDetailResponse {
  event: SingleEventData;
  facility: SingleFacilityData | null;
  features: SingleEventFeatures | null;
  satellites: SingleSatelliteObs[];
}

// Model A Prediction Response (POST /api/v1/classification/predict/{id})
export interface ModelAPredictionResponse {
  event_id: number;
  predicted_class: number;
  prediction_label: string;
  model_probability: number;
  model_version: string;
  feature_list: string[];
  disclaimer: string;
}

// Alerts (GET /api/v1/alerts/)
export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'EXPIRED';
export type AlertType = 'NEW_THERMAL_ANOMALY' | 'INDUSTRIAL_HEAT_SOURCE_ALERT' | 'PERSISTENT_THERMAL_ACTIVITY' | string;

export interface AlertItem {
  id: string;
  title: string;
  message: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  thermal_event_id: number;
  model_probability?: number | null;
  evidence_json?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  last_seen_at?: string | null;
  expires_at?: string | null;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
}

export interface AlertCountResponse {
  active_alerts: number;
  acknowledged_alerts?: number;
  resolved_alerts?: number;
  expired_alerts?: number;
  total_alerts?: number;
}


// Satellite STAC Observation (GET /api/v1/satellite/event/{id})
export interface FullSatelliteObservation {
  id: number;
  thermal_event_id: number;
  satellite: string;
  product_id: string;
  acquisition_time: string;
  cloud_coverage?: number | null;
  extra_metadata?: Record<string, any> | null;
  created_at: string;
}

// OSM Facility (GET /api/v1/osm/facilities/{id})
export interface OSMFacilityDetail {
  id: number;
  source_id: string;
  name: string;
  facility_type: string;
  properties?: Record<string, any>;
}

// WorldCover features (GET /api/v1/worldcover/lookup/{id})
export interface WorldCoverLookupResponse {
  land_cover_class?: number;
  class_name?: string;
  is_built_up?: boolean;
  raw_value?: number;
  error?: string;
  [key: string]: any;
}

// Dashboard Stats (GET /api/v1/dashboard/stats)
export interface DashboardStats {
  total_events: number;
  total_facilities: number;
}

// Health (GET /api/v1/health)
export interface BackendHealth {
  status: string;
  service?: string;
  version?: string;
  environment?: string;
  last_firms_sync_at?: string;
  firms_sync_status?: string;
}

// Layer Visibility State
export interface LayerVisibilityState {
  // Thermal Detections
  firmsMaster: boolean;
  industrialHeatSource: boolean;
  persistentThermal: boolean;
  otherThermal: boolean;
  clustering: boolean;

  // Satellite Basemap
  satelliteBasemap: 'natural' | 'thermal' | 'dark';

  // Geographic Context
  industrialFacilities: boolean;
  placeLabelsBorders: boolean;
  alerts: boolean;
}

// Timeline State
export type TimelineRangeMode = '24h' | '7d' | 'all' | 'custom';

export interface TimelineState {
  rangeMode: TimelineRangeMode;
  startDate: string | null; // ISO
  endDate: string | null;   // ISO
  currentScrubDate: string | null; // ISO
  isPlaying: boolean;
  playbackSpeed: number; // 1x, 2x, 5x
}

// Selected Object State for Inspector
export type SelectedObjectType = 'event' | 'facility' | null;

export interface SelectedObjectState {
  type: SelectedObjectType;
  id: number | null;
  coordinates?: Coordinates;
}
