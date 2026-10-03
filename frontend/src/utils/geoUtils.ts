import { EventFeatureItem } from '../types';

export interface GeographicPreset {
  id: string;
  name: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
  description: string;
}

export const GEOGRAPHIC_PRESETS: GeographicPreset[] = [
  {
    id: 'world',
    name: 'World',
    center: [20.0, 20.0],
    zoom: 1.8,
    pitch: 0,
    bearing: 0,
    description: 'Global thermal observation coverage'
  },
  {
    id: 'india',
    name: 'India',
    center: [78.9629, 22.5937],
    zoom: 4.6,
    pitch: 0,
    bearing: 0,
    description: 'National overview'
  },
  {
    id: 'gujarat',
    name: 'Gujarat',
    center: [71.1924, 22.2587],
    zoom: 7.2,
    pitch: 0,
    bearing: 0,
    description: 'Western industrial corridor'
  },
  {
    id: 'jamnagar',
    name: 'Jamnagar 3D',
    center: [69.85, 22.40],
    zoom: 12.4,
    pitch: 56,
    bearing: -32,
    description: 'Refinery & petrochemical complex (oblique perspective)'
  }
];

export function formatCoordinates(lng?: number, lat?: number): string {
  if (lng === undefined || lat === undefined || isNaN(lng) || isNaN(lat)) {
    return '00.0000° N, 00.0000° E';
  }
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

/**
 * Calculates distance in meters between two [lng, lat] points using the Haversine formula
 */
export function calculateDistanceMeters(
  point1: [number, number],
  point2: [number, number]
): number {
  const [lng1, lat1] = point1;
  const [lng2, lat2] = point2;

  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * WorldCover ESA Class ID to Label mapper
 */
export function getWorldCoverLabel(classValue?: number | null): { name: string; isBuiltUp: boolean; color: string } {
  if (classValue === undefined || classValue === null) {
    return { name: 'Unknown / Not Assessed', isBuiltUp: false, color: '#64748b' };
  }
  
  switch (classValue) {
    case 10:
      return { name: 'Tree cover', isBuiltUp: false, color: '#006400' };
    case 20:
      return { name: 'Shrubland', isBuiltUp: false, color: '#ffbb22' };
    case 30:
      return { name: 'Grassland', isBuiltUp: false, color: '#ffff4c' };
    case 40:
      return { name: 'Cropland', isBuiltUp: false, color: '#f096ff' };
    case 50:
      return { name: 'Built-up / Urban / Industrial', isBuiltUp: true, color: '#fa0000' };
    case 60:
      return { name: 'Bare / Sparse vegetation', isBuiltUp: false, color: '#b4b4b4' };
    case 70:
      return { name: 'Snow and ice', isBuiltUp: false, color: '#f0f0f0' };
    case 80:
      return { name: 'Permanent water bodies', isBuiltUp: false, color: '#0064c8' };
    case 90:
      return { name: 'Herbaceous wetland', isBuiltUp: false, color: '#0096a0' };
    case 95:
      return { name: 'Mangroves', isBuiltUp: false, color: '#00cf75' };
    case 100:
      return { name: 'Moss and lichen', isBuiltUp: false, color: '#fae6a0' };
    default:
      return { name: `Class ${classValue}`, isBuiltUp: false, color: '#94a3b8' };
  }
}

export interface SpiderfiedResult {
  features: EventFeatureItem[];
  spiderLegs: {
    type: 'FeatureCollection';
    features: any[];
  };
}

/**
 * Calculates subtle visual display offsets for coincident/overlapping features
 * so they are individually visible and inspectable on map zoom-in.
 * Preserves the authentic original geographic coordinates in `properties.original_lng`
 * and `properties.original_lat`.
 */
export function spiderfyFeatures(
  features: EventFeatureItem[],
  offsetMeters: number = 60
): SpiderfiedResult {
  if (!features || features.length === 0) {
    return {
      features: [],
      spiderLegs: { type: 'FeatureCollection', features: [] }
    };
  }

  const groups = new Map<string, EventFeatureItem[]>();
  for (const feature of features) {
    const coords = feature.geometry.coordinates;
    // Group points within ~1m (5 decimal places)
    const key = `${coords[1].toFixed(5)},${coords[0].toFixed(5)}`;
    const group = groups.get(key);
    if (group) {
      group.push(feature);
    } else {
      groups.set(key, [feature]);
    }
  }

  const resultFeatures: EventFeatureItem[] = [];
  const spiderLegsFeatures: any[] = [];

  for (const [_key, group] of groups.entries()) {
    if (group.length === 1) {
      const f = group[0];
      const featureId = Number(f.id ?? f.properties?.id ?? f.properties?.event_id);
      resultFeatures.push({
        ...f,
        id: featureId,
        properties: {
          ...f.properties,
          id: featureId,
          original_lng: f.geometry.coordinates[0],
          original_lat: f.geometry.coordinates[1],
          is_coincident: false,
          coincident_count: 1
        }
      });
      continue;
    }

    const centerLng = group[0].geometry.coordinates[0];
    const centerLat = group[0].geometry.coordinates[1];
    const n = group.length;
    const coincidentIds = group.map(f => Number(f.id ?? f.properties?.id ?? f.properties?.event_id));

    // Geographic conversion: meters to delta degrees
    const latRad = (centerLat * Math.PI) / 180;
    const degLat = offsetMeters / 111320;
    const degLng = offsetMeters / (111320 * Math.max(0.1, Math.cos(latRad)));

    // Center hub point feature
    spiderLegsFeatures.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [centerLng, centerLat]
      },
      properties: {
        type: 'spider_hub',
        coincident_count: n
      }
    });

    group.forEach((f, i) => {
      const featureId = Number(f.id ?? f.properties?.id ?? f.properties?.event_id);
      let dispLng = centerLng;
      let dispLat = centerLat;

      if (n === 2) {
        // Offset horizontally west and east
        const angle = i === 0 ? Math.PI : 0;
        dispLng = centerLng + Math.cos(angle) * degLng;
        dispLat = centerLat + Math.sin(angle) * degLat;
      } else {
        const angle = (2 * Math.PI * i) / n;
        dispLng = centerLng + Math.cos(angle) * degLng;
        dispLat = centerLat + Math.sin(angle) * degLat;
      }

      resultFeatures.push({
        ...f,
        id: featureId,
        geometry: {
          type: 'Point',
          coordinates: [dispLng, dispLat]
        },
        properties: {
          ...f.properties,
          id: featureId,
          original_lng: centerLng,
          original_lat: centerLat,
          is_coincident: true,
          coincident_count: n,
          coincident_index: i,
          coincident_ids: coincidentIds
        }
      });

      // Spider leg connector line
      spiderLegsFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [centerLng, centerLat],
            [dispLng, dispLat]
          ]
        },
        properties: {
          type: 'spider_leg',
          eventId: f.id,
          original_lng: centerLng,
          original_lat: centerLat
        }
      });
    });
  }

  return {
    features: resultFeatures,
    spiderLegs: {
      type: 'FeatureCollection',
      features: spiderLegsFeatures
    }
  };
}

