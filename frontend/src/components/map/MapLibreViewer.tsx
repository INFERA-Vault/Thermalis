import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  EventFeatureCollection,
  FacilityFeatureCollection,
  LayerVisibilityState,
  SelectedObjectState,
  Coordinates,
  EventFeatureItem
} from '../../types';
import { spiderfyFeatures } from '../../utils/geoUtils';

interface MapLibreViewerProps {
  events: EventFeatureCollection;
  facilities: FacilityFeatureCollection;
  layers: LayerVisibilityState;
  selectedObject: SelectedObjectState;
  onSelectEvent: (eventId: number, coords: Coordinates) => void;
  onSelectFacility: (facilityId: number, coords: Coordinates) => void;
  onClearSelection: () => void;
  onUpdateTelemetry: (state: { lng: number; lat: number; zoom: number; pitch: number; bearing: number }) => void;
  cameraTrigger?: { center: [number, number]; zoom: number; pitch: number; bearing: number; ts: number } | null;
  onMapReady?: (map: maplibregl.Map) => void;
}

// Exact 5-Color Infrared Palette Look-Up Table:
// Deep Indigo: #14108C (cool background & water bodies)
// Mauve:       #C85AB5 (intermediate lowlands & vegetation)
// Magenta:     #F82FC2 (intermediate highlands & plateaus)
// Orange-Red:  #F93F00 (warmer arid terrain & ridges)
// Yellow:      #F9D33F (brightest thermal accents & high albedo)
const COLOR_STOPS = [
  { t: 0.00, r: 20, g: 16, b: 140 },  // #14108C (Deep Indigo)
  { t: 0.22, r: 200, g: 90, b: 181 }, // #C85AB5 (Mauve)
  { t: 0.48, r: 248, g: 47, b: 194 }, // #F82FC2 (Magenta)
  { t: 0.78, r: 249, g: 63, b: 0 },   // #F93F00 (Orange-Red)
  { t: 1.00, r: 249, g: 211, b: 63 }  // #F9D33F (Yellow)
];

const LUT_SIZE = 1024;
const LUT_R = new Uint8Array(LUT_SIZE);
const LUT_G = new Uint8Array(LUT_SIZE);
const LUT_B = new Uint8Array(LUT_SIZE);

for (let i = 0; i < LUT_SIZE; i++) {
  const t = i / (LUT_SIZE - 1);
  let s1 = COLOR_STOPS[0];
  let s2 = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let j = 0; j < COLOR_STOPS.length - 1; j++) {
    if (t >= COLOR_STOPS[j].t && t <= COLOR_STOPS[j + 1].t) {
      s1 = COLOR_STOPS[j];
      s2 = COLOR_STOPS[j + 1];
      break;
    }
  }
  const span = s2.t - s1.t || 1;
  const u = Math.min(1.0, Math.max(0.0, (t - s1.t) / span));
  LUT_R[i] = Math.min(255, Math.max(0, Math.round(s1.r + u * (s2.r - s1.r))));
  LUT_G[i] = Math.min(255, Math.max(0, Math.round(s1.g + u * (s2.g - s1.g))));
  LUT_B[i] = Math.min(255, Math.max(0, Math.round(s1.b + u * (s2.b - s1.b))));
}

// Ocean bathymetry Look-Up Table: smooth shades from midnight indigo (#0a083a) to #14108C
const OCEAN_LUT_R = new Uint8Array(256);
const OCEAN_LUT_G = new Uint8Array(256);
const OCEAN_LUT_B = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const lum = i / 255.0;
  const f = Math.min(1.0, Math.max(0.0, lum * 2.0));
  OCEAN_LUT_R[i] = Math.min(255, Math.max(0, Math.round(10 + f * (20 - 10))));
  OCEAN_LUT_G[i] = Math.min(255, Math.max(0, Math.round(8 + f * (16 - 8))));
  OCEAN_LUT_B[i] = Math.min(255, Math.max(0, Math.round(58 + f * (140 - 58))));
}

// Register custom tile protocol once at module load
let protocolRegistered = false;
function registerThermalProtocol() {
  if (protocolRegistered || typeof window === 'undefined') return;
  protocolRegistered = true;

  try {
    maplibregl.addProtocol('thermal-palette', async (params, abortController) => {
      const actualUrl = params.url.replace('thermal-palette://', 'https://');
      const response = await fetch(actualUrl, { signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`Thermal tile fetch failed: ${response.status}`);
      }
      const blob = await response.blob();
      const imgBitmap = await createImageBitmap(blob);
      const width = imgBitmap.width;
      const height = imgBitmap.height;

      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(width, height)
        : document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
      ctx.drawImage(imgBitmap, 0, 0);
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;

      for (let i = 0; i < d.length; i += 4) {
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];

        // Perceived grayscale luminance (0.0 to 1.0)
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;

        // Water detection: blue-dominant or deep dark ocean water
        const isWater = (b > r + 12 && b > g) || (lum < 0.07 && b >= g && b >= r);

        if (isWater) {
          const lIdx = Math.min(255, Math.max(0, Math.round(lum * 255)));
          d[i] = OCEAN_LUT_R[lIdx];
          d[i + 1] = OCEAN_LUT_G[lIdx];
          d[i + 2] = OCEAN_LUT_B[lIdx];
        } else {
          // Smooth land infrared spectrum mapping across the 5 exact colors:
          // Lowlands/forests -> Mauve (#C85AB5)
          // Intermediate plains -> Magenta (#F82FC2)
          // Warmer terrain/ridges -> Orange-Red (#F93F00)
          // Highest peaks/salt flats -> Yellow (#F9D33F)
          const normLum = Math.min(1.0, Math.max(0.0, (lum - 0.03) / 0.94));
          const lutIdx = Math.min(LUT_SIZE - 1, Math.max(0, Math.floor(normLum * (LUT_SIZE - 1))));

          // Subtle contrast shadow/highlight modulation without color shift
          const shadowFactor = 0.78 + 0.22 * lum;
          d[i] = Math.min(255, Math.max(0, Math.round(LUT_R[lutIdx] * shadowFactor)));
          d[i + 1] = Math.min(255, Math.max(0, Math.round(LUT_G[lutIdx] * shadowFactor)));
          d[i + 2] = Math.min(255, Math.max(0, Math.round(LUT_B[lutIdx] * shadowFactor)));
        }
      }

      ctx.putImageData(imgData, 0, 0);

      let arrayBuffer: ArrayBuffer;
      if ('convertToBlob' in canvas) {
        const outBlob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
        arrayBuffer = await outBlob.arrayBuffer();
      } else {
        const outBlob = await new Promise<Blob>((res) => (canvas as HTMLCanvasElement).toBlob(b => res(b!), 'image/png'));
        arrayBuffer = await outBlob.arrayBuffer();
      }

      return { data: arrayBuffer };
    });
  } catch (err) {
    console.warn('Could not register thermal-palette protocol:', err);
  }
}
registerThermalProtocol();

// Unified multi-basemap style specification supporting instant, rock-solid switching without style reloads
const BASE_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri'
    },
    'thermal-palette-satellite': {
      type: 'raster',
      tiles: [
        'thermal-palette://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      attribution: 'Stylized Infrared Basemap (Imagery &copy; Esri)'
    },
    'nasa-gibs-swir': {
      type: 'raster',
      tiles: [
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_BandsM11-I2-I1/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg'
      ],
      tileSize: 256,
      attribution: 'NASA GIBS / EOSDIS VIIRS SWIR'
    },
    'esri-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    },
    'dark-base': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    },
    'dark-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256
    }
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#14108C' }
    },
    // 1. Natural Basemap (Esri Satellite)
    {
      id: 'satellite-layer',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 20,
      layout: { visibility: 'visible' }
    },
    // 2. Thermal Basemap Layer (Exact 5-Color Infrared Palette: #14108C, #C85AB5, #F82FC2, #F93F00, #F9D33F)
    {
      id: 'thermal-ir-layer',
      type: 'raster',
      source: 'thermal-palette-satellite',
      minzoom: 0,
      maxzoom: 20,
      layout: { visibility: 'none' }
    },
    // 3. Dark GIS Basemap (Esri Dark Canvas)
    {
      id: 'dark-base-layer',
      type: 'raster',
      source: 'dark-base',
      minzoom: 0,
      maxzoom: 20,
      layout: { visibility: 'none' }
    },
    // Place Labels (Natural)
    {
      id: 'place-labels-natural',
      type: 'raster',
      source: 'esri-labels',
      minzoom: 1,
      maxzoom: 20,
      layout: { visibility: 'visible' }
    },
    // Place Labels (Dark & Thermal)
    {
      id: 'place-labels-dark',
      type: 'raster',
      source: 'dark-labels',
      minzoom: 1,
      maxzoom: 20,
      layout: { visibility: 'none' }
    }
  ]
};

export const MapLibreViewer: React.FC<MapLibreViewerProps> = ({
  events,
  facilities,
  layers,
  selectedObject,
  onSelectEvent,
  onSelectFacility,
  onClearSelection,
  onUpdateTelemetry,
  cameraTrigger,
  onMapReady
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState<{ title: string; subtitle: string; x: number; y: number } | null>(null);

  // Filter events based on active thermal layer visibility toggles
  const activeEvents = useMemo(() => {
    if (!layers.firmsMaster) return [];

    return (events.features || []).filter(f => {
      const p = f.properties;
      const isPersistent = Boolean(p.is_persistent || (p.hotspot_frequency_30d && p.hotspot_frequency_30d > 1) || (p.persistence_days && p.persistence_days > 0));
      const isIndustrial = Boolean(p.has_industrial_association || (p.nearby_facility_count && p.nearby_facility_count > 0));

      // If user toggles off Persistent, hide persistent events
      if (isPersistent && !isIndustrial && !layers.persistentThermal) return false;
      // If user toggles off Industrial Association, hide industrial-associated events
      if (isIndustrial && !isPersistent && !layers.industrialHeatSource) return false;
      // If event is both persistent & industrial, and both toggles are off, hide it
      if (isPersistent && isIndustrial && !layers.persistentThermal && !layers.industrialHeatSource) return false;

      return true;
    });
  }, [events, layers.firmsMaster, layers.persistentThermal, layers.industrialHeatSource]);

  // Compute spiderfied data for coincident features to make overlapping points inspectable
  const { features: spiderfiedEvents, spiderLegs } = useMemo(() => {
    return spiderfyFeatures(activeEvents);
  }, [activeEvents]);

  // Synchronous references to latest props & state for resilient MapLibre lifecycle
  const eventsRef = useRef<EventFeatureItem[]>(spiderfiedEvents);
  const spiderLegsRef = useRef<{ type: 'FeatureCollection'; features: any[] }>(spiderLegs);
  const facilitiesRef = useRef<FacilityFeatureCollection>(facilities);
  const layersRef = useRef<LayerVisibilityState>(layers);
  const selectedObjectRef = useRef<SelectedObjectState>(selectedObject);
  const prevClusteringRef = useRef<boolean>(layers.clustering);

  // Keep refs up-to-date synchronously on every render
  eventsRef.current = spiderfiedEvents;
  spiderLegsRef.current = spiderLegs;
  facilitiesRef.current = facilities;
  layersRef.current = layers;
  selectedObjectRef.current = selectedObject;

  // Synchronize GeoJSON sources, layers, visibilities, and selection reticles
  const syncDataLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.getStyle()) return;

    const currentLayers = layersRef.current;
    const currentEvents = eventsRef.current;
    const currentSpiderLegs = spiderLegsRef.current;
    const currentFacilities = facilitiesRef.current;
    const currentSelected = selectedObjectRef.current;

    // 1. FIRMS Events Source & Layers
    let firmsSrc = map.getSource('firms-source') as maplibregl.GeoJSONSource | undefined;

    // If clustering toggle changed, re-create source with updated cluster setting
    if (firmsSrc && prevClusteringRef.current !== currentLayers.clustering) {
      const layerIds = [
        'clusters-circle',
        'cluster-count',
        'unclustered-halo',
        'unclustered-ring',
        'unclustered-point',
        'selected-event-ring'
      ];
      layerIds.forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      map.removeSource('firms-source');
      firmsSrc = undefined;
      prevClusteringRef.current = currentLayers.clustering;
    }

    if (!firmsSrc) {
      map.addSource('firms-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: currentEvents
        } as any,
        cluster: currentLayers.clustering,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });

      // Cluster Circle Layer (Fire Progression: Amber < 10 -> Flame Orange 10-49 -> Fire Red >= 50)
      // Translucent fill allows underlying geographical and satellite features to remain visible
      if (!map.getLayer('clusters-circle')) {
        map.addLayer({
          id: 'clusters-circle',
          type: 'circle',
          source: 'firms-source',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': [
              'step',
              ['get', 'point_count'],
              '#FF9F00', // amber (<10)
              10,
              '#FF5A00', // flame orange (10-49)
              50,
              '#FF0000'  // fire red (>=50)
            ],
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              18,
              10,
              24,
              50,
              32
            ],
            'circle-opacity': [
              'step',
              ['get', 'point_count'],
              0.40, // Small amber clusters (<10): 0.40 opacity
              10,
              0.46, // Medium flame orange clusters (10-49): 0.46 opacity
              50,
              0.52  // Large fire red clusters (>=50): 0.52 opacity
            ]
          }
        });
      }

      // Cluster Count Text (Sharp, white, centered with protective dark halo)
      if (!map.getLayer('cluster-count')) {
        map.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'firms-source',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-size': 12,
            'text-allow-overlap': true,
            'text-font': ['Noto Sans Bold']
          },
          paint: {
            'text-color': '#ffffff',
            'text-opacity': 1.0,
            'text-halo-color': 'rgba(12, 14, 17, 0.90)',
            'text-halo-width': 1.2
          }
        });
      }

      // Unclustered Outer Halo (dark red/orange halo with blur)
      if (!map.getLayer('unclustered-halo')) {
        map.addLayer({
          id: 'unclustered-halo',
          type: 'circle',
          source: 'firms-source',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'interpolate',
              ['linear'],
              ['get', 'frp'],
              0, '#9A0000',
              30, '#B62602',
              80, '#E74D02',
              250, '#FF5A00',
              600, '#FF9F00'
            ],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2, 4,
              7, 9,
              12, 14,
              16, 20
            ],
            'circle-opacity': 0.22,
            'circle-blur': 0.65
          }
        });
      }

      // Unclustered Middle Ring (orange/red ring)
      if (!map.getLayer('unclustered-ring')) {
        map.addLayer({
          id: 'unclustered-ring',
          type: 'circle',
          source: 'firms-source',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': 'transparent',
            'circle-stroke-color': [
              'interpolate',
              ['linear'],
              ['get', 'frp'],
              0, '#E74D02',
              30, '#FF5A00',
              100, '#FF9F00',
              300, '#FFD000',
              600, '#FFE500'
            ],
            'circle-stroke-width': 1.5,
            'circle-stroke-opacity': 0.85,
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2, 3,
              7, 6.5,
              12, 11,
              16, 16
            ]
          }
        });
      }

      // Unclustered Core Point (bright yellow/orange -> hot yellow center, translucent fill & defined stroke)
      if (!map.getLayer('unclustered-point')) {
        map.addLayer({
          id: 'unclustered-point',
          type: 'circle',
          source: 'firms-source',
          filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-color': [
              'interpolate',
              ['linear'],
              ['get', 'frp'],
              0, '#FF9F00',    // Amber
              25, '#FF5A00',   // Flame Orange
              80, '#FF0000',   // Fire Red
              250, '#FFD000',  // Thermal Gold
              600, '#FFE500'   // Hot Yellow / Whiteout
            ],
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2, 2.5,
              7, 4.5,
              12, 7.5,
              16, 11
            ],
            'circle-opacity': 0.80
          }
        });
      }

      // Selected Event Reticle Ring (Thermal Gold with luminous interior glow)
      if (!map.getLayer('selected-event-ring')) {
        map.addLayer({
          id: 'selected-event-ring',
          type: 'circle',
          source: 'firms-source',
          filter: ['==', ['get', 'id'], -1],
          paint: {
            'circle-color': 'rgba(255, 208, 0, 0.18)',
            'circle-radius': 16,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#FFD000',
            'circle-stroke-opacity': 1.0
          }
        });
      }
    } else {
      // Source already exists: update GeoJSON dataset
      firmsSrc.setData({
        type: 'FeatureCollection',
        features: currentEvents
      } as any);
    }

    // 2. Spider Legs Connector Source & Layers
    let legsSrc = map.getSource('firms-spider-legs') as maplibregl.GeoJSONSource | undefined;
    if (!legsSrc) {
      map.addSource('firms-spider-legs', {
        type: 'geojson',
        data: currentSpiderLegs as any
      });

      if (!map.getLayer('firms-spider-legs-layer')) {
        map.addLayer({
          id: 'firms-spider-legs-layer',
          type: 'line',
          source: 'firms-spider-legs',
          filter: ['==', '$type', 'LineString'],
          minzoom: 12,
          paint: {
            'line-color': '#FF9F00',
            'line-width': 1.5,
            'line-opacity': 0.75,
            'line-dasharray': [2, 2]
          }
        });
      }

      if (!map.getLayer('firms-spider-hub')) {
        map.addLayer({
          id: 'firms-spider-hub',
          type: 'circle',
          source: 'firms-spider-legs',
          filter: ['==', '$type', 'Point'],
          minzoom: 12,
          paint: {
            'circle-radius': 3.5,
            'circle-color': '#FF5A00',
            'circle-opacity': 0.95
          }
        });
      }
    } else {
      legsSrc.setData(currentSpiderLegs as any);
    }

    // 3. Industrial Facilities Source & Layers
    let facSrc = map.getSource('facilities-source') as maplibregl.GeoJSONSource | undefined;
    if (!facSrc) {
      map.addSource('facilities-source', {
        type: 'geojson',
        data: currentFacilities as any
      });

      if (!map.getLayer('facility-points')) {
        map.addLayer({
          id: 'facility-points',
          type: 'circle',
          source: 'facilities-source',
          paint: {
            'circle-color': '#A8A29E',
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              4, 2.5,
              8, 4,
              13, 7
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#0C0E11',
            'circle-opacity': 0.85
          }
        });
      }

      if (!map.getLayer('selected-facility-ring')) {
        map.addLayer({
          id: 'selected-facility-ring',
          type: 'circle',
          source: 'facilities-source',
          filter: ['==', ['get', 'id'], -1],
          paint: {
            'circle-color': 'transparent',
            'circle-radius': 14,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FF9F00'
          }
        });
      }
    } else {
      facSrc.setData(currentFacilities as any);
    }

    // 4. Update Basemap & Label Visibilities (Instantaneous layer toggling without style drops)
    const basemap = currentLayers.satelliteBasemap;
    const showLabels = currentLayers.placeLabelsBorders;

    if (map.getLayer('satellite-layer')) {
      map.setLayoutProperty('satellite-layer', 'visibility', basemap === 'natural' ? 'visible' : 'none');
    }
    if (map.getLayer('thermal-ir-layer')) {
      map.setLayoutProperty('thermal-ir-layer', 'visibility', basemap === 'thermal' ? 'visible' : 'none');
    }
    if (map.getLayer('dark-base-layer')) {
      map.setLayoutProperty('dark-base-layer', 'visibility', basemap === 'dark' ? 'visible' : 'none');
    }
    if (map.getLayer('place-labels-natural')) {
      map.setLayoutProperty('place-labels-natural', 'visibility', (showLabels && basemap === 'natural') ? 'visible' : 'none');
    }
    if (map.getLayer('place-labels-dark')) {
      map.setLayoutProperty('place-labels-dark', 'visibility', (showLabels && (basemap === 'dark' || basemap === 'thermal')) ? 'visible' : 'none');
    }

    // 5. Update FIRMS, Alerts & Facilities Layer Visibilities
    const firmsVisible = currentLayers.firmsMaster ? 'visible' : 'none';
    const clusterVisible = (currentLayers.firmsMaster && currentLayers.clustering) ? 'visible' : 'none';
    const alertsVisible = (currentLayers.firmsMaster && currentLayers.alerts) ? 'visible' : 'none';
    const facVisible = currentLayers.industrialFacilities ? 'visible' : 'none';

    if (map.getLayer('clusters-circle')) map.setLayoutProperty('clusters-circle', 'visibility', clusterVisible);
    if (map.getLayer('cluster-count')) map.setLayoutProperty('cluster-count', 'visibility', clusterVisible);
    if (map.getLayer('unclustered-halo')) map.setLayoutProperty('unclustered-halo', 'visibility', alertsVisible);
    if (map.getLayer('unclustered-ring')) map.setLayoutProperty('unclustered-ring', 'visibility', alertsVisible);
    if (map.getLayer('unclustered-point')) map.setLayoutProperty('unclustered-point', 'visibility', firmsVisible);
    if (map.getLayer('firms-spider-legs-layer')) map.setLayoutProperty('firms-spider-legs-layer', 'visibility', firmsVisible);
    if (map.getLayer('firms-spider-hub')) map.setLayoutProperty('firms-spider-hub', 'visibility', firmsVisible);
    if (map.getLayer('facility-points')) map.setLayoutProperty('facility-points', 'visibility', facVisible);

    // 6. Update Selection Reticle Filters
    if (map.getLayer('selected-event-ring')) {
      const selectedEventId = (currentSelected.type === 'event' && currentSelected.id !== null) ? currentSelected.id : -1;
      map.setFilter('selected-event-ring', ['==', ['get', 'id'], selectedEventId]);
    }
    if (map.getLayer('selected-facility-ring')) {
      const selectedFacilityId = (currentSelected.type === 'facility' && currentSelected.id !== null) ? currentSelected.id : -1;
      map.setFilter('selected-facility-ring', ['==', ['get', 'id'], selectedFacilityId]);
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current) return;

    let initialCenter: [number, number] = [0, 20];
    let initialZoom = 1.5;
    try {
      const p = new URLSearchParams(window.location.search);
      const z = p.get('zoom');
      if (z && !isNaN(parseFloat(z))) initialZoom = parseFloat(z);
      const lng = p.get('lng');
      const lat = p.get('lat');
      if (lng && lat && !isNaN(parseFloat(lng)) && !isNaN(parseFloat(lat))) {
        initialCenter = [parseFloat(lng), parseFloat(lat)];
      }
    } catch {}

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: BASE_MAP_STYLE,
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      maxPitch: 80,
      attributionControl: false,
      renderWorldCopies: false,
      preserveDrawingBuffer: true
    });

    mapRef.current = map;
    (window as any).__map = map;

    // Safe globe projection support if supported by MapLibre engine version
    if (typeof (map as any).setProjection === 'function') {
      try {
        (map as any).setProjection({ type: 'globe' });
      } catch (err) {
        console.info('MapLibre globe projection init info:', err);
      }
    }

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    let resizeObserver: ResizeObserver | null = null;

    // Permanent style load and style data listener
    const handleStyleLoad = () => {
      syncDataLayers();
    };

    map.on('style.load', handleStyleLoad);
    map.on('styledata', handleStyleLoad);

    map.on('load', () => {
      mapRef.current = map;
      (window as any).__map = map;
      (window as any).__thermoDiagnostic = () => {
        const isLoaded = !!map.getStyle();
        const firmsSrc = map.getSource('firms-source') as maplibregl.GeoJSONSource | undefined;
        const facSrc = map.getSource('facilities-source') as maplibregl.GeoJSONSource | undefined;

        const isClustersVisible = map.getLayer('clusters-circle') && map.getLayoutProperty('clusters-circle', 'visibility') !== 'none';
        const isPointsVisible = map.getLayer('unclustered-point') && map.getLayoutProperty('unclustered-point', 'visibility') !== 'none';
        const isHalosVisible = map.getLayer('unclustered-halo') && map.getLayoutProperty('unclustered-halo', 'visibility') !== 'none';
        const isRingsVisible = map.getLayer('unclustered-ring') && map.getLayoutProperty('unclustered-ring', 'visibility') !== 'none';
        const isFacsVisible = map.getLayer('facility-points') && map.getLayoutProperty('facility-points', 'visibility') !== 'none';
        const isNaturalLabelsVisible = map.getLayer('place-labels-natural') && map.getLayoutProperty('place-labels-natural', 'visibility') !== 'none';
        const isDarkLabelsVisible = map.getLayer('place-labels-dark') && map.getLayoutProperty('place-labels-dark', 'visibility') !== 'none';

        const renderedClusters = isClustersVisible
          ? map.queryRenderedFeatures(undefined, { layers: ['clusters-circle'] })
          : [];
        const renderedPoints = isPointsVisible
          ? map.queryRenderedFeatures(undefined, { layers: ['unclustered-point'] })
          : [];
        const renderedFacilities = isFacsVisible
          ? map.queryRenderedFeatures(undefined, { layers: ['facility-points'] })
          : [];

        const visibleBasemapLayer = (['satellite-layer', 'thermal-ir-layer', 'dark-base-layer'] as const).find(id => {
          try {
            return map.getLayoutProperty(id, 'visibility') === 'visible';
          } catch {
            return false;
          }
        });

        return {
          isStyleLoaded: isLoaded,
          layers: { ...layersRef.current },
          basemap: layersRef.current.satelliteBasemap,
          visibleBasemapLayer,
          activeEventsCount: eventsRef.current.length,
          activeFacilitiesCount: facilitiesRef.current.features.length,
          hasFirmsSource: !!firmsSrc,
          hasFacSource: !!facSrc,
          isClustersVisible: !!isClustersVisible,
          isPointsVisible: !!isPointsVisible,
          isHalosVisible: !!isHalosVisible,
          isRingsVisible: !!isRingsVisible,
          isFacsVisible: !!isFacsVisible,
          isLabelsVisible: !!(isNaturalLabelsVisible || isDarkLabelsVisible),
          renderedClustersCount: renderedClusters.length,
          renderedPointsCount: renderedPoints.length,
          renderedFacilitiesCount: renderedFacilities.length,
          zoom: map.getZoom(),
          center: map.getCenter()
        };
      };

      setMapLoaded(true);
      map.resize();
      updateTelemetryState();
      syncDataLayers();
      if (onMapReady) onMapReady(map);
    });

    if (mapContainer.current) {
      resizeObserver = new ResizeObserver(() => {
        map.resize();
      });
      resizeObserver.observe(mapContainer.current);
    }

    const updateTelemetryState = () => {
      const center = map.getCenter();
      onUpdateTelemetry({
        lng: center.lng,
        lat: center.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing()
      });
    };

    map.on('move', updateTelemetryState);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      map.off('style.load', handleStyleLoad);
      map.off('styledata', handleStyleLoad);
      map.off('move', updateTelemetryState);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Synchronize data updates (when filtered events, spider legs, or facilities change)
  useEffect(() => {
    syncDataLayers();
  }, [spiderfiedEvents, spiderLegs, facilities, syncDataLayers]);

  // Synchronize layer visibility, basemap switches & clustering changes
  useEffect(() => {
    syncDataLayers();
  }, [layers, syncDataLayers]);

  // Synchronize selection changes
  useEffect(() => {
    syncDataLayers();
  }, [selectedObject, syncDataLayers]);

  // Map Click Interactions, Hover Tooltips & Navigation Event Handlers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Hover Tooltip Dismissal & State Reset (immediately clears on any map navigation)
    const dismissHoverPopups = () => {
      setHoveredInfo(null);
      if (map) {
        map.getCanvas().style.cursor = '';
      }
    };

    // Centralized Map Click Handler (uses queryRenderedFeatures for style-resilient dispatch)
    const handleMapClick = async (e: maplibregl.MapMouseEvent) => {
      // 1. Check for Cluster Click
      const clusterFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['clusters-circle'].filter(id => map.getLayer(id))
      });

      if (clusterFeatures.length > 0) {
        const cluster = clusterFeatures[0];
        const clusterId = cluster.properties?.cluster_id;
        const source = map.getSource('firms-source') as maplibregl.GeoJSONSource;
        if (source && clusterId !== undefined) {
          try {
            const zoom = await source.getClusterExpansionZoom(clusterId);
            if (zoom !== null && zoom !== undefined) {
              const coords = (cluster.geometry as any).coordinates as [number, number];
              const currentZoom = map.getZoom();
              // Sensibly expand cluster without excessive zoom:
              // Advance by at least +1 zoom level, clamp to max 13.0
              const targetZoom = Math.min(13.0, Math.max(zoom, currentZoom + 1));
              map.easeTo({
                center: coords,
                zoom: targetZoom,
                duration: 500
              });
            }
          } catch (err) {
            console.warn('Failed to expand cluster zoom:', err);
          }
        }
        return;
      }

      // 2. Check for Unclustered Point Click (Thermal Event)
      const pointFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['unclustered-point'].filter(id => map.getLayer(id))
      });

      if (pointFeatures.length > 0) {
        const feature = pointFeatures[0];
        const eventId = Number(feature.properties?.id);
        if (eventId) {
          const lng = feature.properties?.original_lng !== undefined
            ? Number(feature.properties.original_lng)
            : e.lngLat.lng;
          const lat = feature.properties?.original_lat !== undefined
            ? Number(feature.properties.original_lat)
            : e.lngLat.lat;
          onSelectEvent(eventId, { lng, lat });
        }
        return;
      }

      // 3. Check for Facility Click
      const facilityFeatures = map.queryRenderedFeatures(e.point, {
        layers: ['facility-points'].filter(id => map.getLayer(id))
      });

      if (facilityFeatures.length > 0) {
        const feature = facilityFeatures[0];
        const facilityId = Number(feature.properties?.id);
        if (facilityId) {
          onSelectFacility(facilityId, { lng: e.lngLat.lng, lat: e.lngLat.lat });
        }
        return;
      }

      // 4. Click on empty space: clear selection
      onClearSelection();
    };

    // Hover Mouse Move Handler
    const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
      const activeLayers = ['clusters-circle', 'unclustered-point', 'facility-points'].filter(id => map.getLayer(id));
      if (activeLayers.length === 0) {
        setHoveredInfo(null);
        map.getCanvas().style.cursor = '';
        return;
      }

      const features = map.queryRenderedFeatures(e.point, { layers: activeLayers });
      if (features.length === 0) {
        setHoveredInfo(null);
        map.getCanvas().style.cursor = '';
        return;
      }

      map.getCanvas().style.cursor = 'pointer';
      const feature = features[0];
      const layerId = feature.layer.id;

      if (layerId === 'unclustered-point') {
        const p = feature.properties;
        const isCoincident = p?.is_coincident || (p?.coincident_count && p?.coincident_count > 1);
        const coincidentTag = isCoincident ? ` [Coincident 1 of ${p.coincident_count}]` : '';
        setHoveredInfo({
          title: `Thermal Event #${p.id}${coincidentTag}`,
          subtitle: `FRP: ${p.frp ?? 0} MW | ${p.satellite || 'VIIRS'} | Brightness: ${p.brightness_temperature ?? 0} K`,
          x: e.point.x,
          y: e.point.y
        });
      } else if (layerId === 'facility-points') {
        const p = feature.properties;
        setHoveredInfo({
          title: p.name || 'Industrial Facility',
          subtitle: `Type: ${p.facility_type || 'Industrial'}`,
          x: e.point.x,
          y: e.point.y
        });
      } else if (layerId === 'clusters-circle') {
        setHoveredInfo(null);
      }
    };

    const canvas = map.getCanvas();

    // Attach navigation dismissal handlers (immediately dismisses popup on wheel/drag/zoom/move)
    map.on('movestart', dismissHoverPopups);
    map.on('zoomstart', dismissHoverPopups);
    map.on('dragstart', dismissHoverPopups);
    map.on('rotatestart', dismissHoverPopups);
    map.on('pitchstart', dismissHoverPopups);

    if (canvas) {
      canvas.addEventListener('mouseleave', dismissHoverPopups);
    }

    map.on('click', handleMapClick);
    map.on('mousemove', handleMouseMove);

    return () => {
      map.off('movestart', dismissHoverPopups);
      map.off('zoomstart', dismissHoverPopups);
      map.off('dragstart', dismissHoverPopups);
      map.off('rotatestart', dismissHoverPopups);
      map.off('pitchstart', dismissHoverPopups);

      if (canvas) {
        canvas.removeEventListener('mouseleave', dismissHoverPopups);
      }

      map.off('click', handleMapClick);
      map.off('mousemove', handleMouseMove);
    };
  }, [mapLoaded, onSelectEvent, onSelectFacility, onClearSelection]);

  // Handle Camera Trigger (Presets, Center Map, Jamnagar 3D)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !cameraTrigger) return;

    map.flyTo({
      center: cameraTrigger.center,
      zoom: cameraTrigger.zoom,
      pitch: cameraTrigger.pitch ?? 0,
      bearing: cameraTrigger.bearing ?? 0,
      essential: true,
      duration: 1000
    });
  }, [cameraTrigger, mapLoaded]);

  return (
    <div className="relative w-full h-full select-none overflow-hidden">
      {/* MapLibre DOM Node */}
      <div ref={mapContainer} className="w-full h-full absolute inset-0" style={{ width: '100%', height: '100%' }} />

      {/* Map Hover Tooltip (Real FIRMS events & facilities) */}
      {hoveredInfo && (
        <div
          className="absolute z-20 pointer-events-none gis-panel px-2.5 py-1 text-xs -translate-x-1/2 -translate-y-full mb-2 border border-[#262322] shadow-xl bg-[#14171B]"
          style={{ left: hoveredInfo.x, top: hoveredInfo.y }}
        >
          <div className="font-semibold text-[#FF5A00] font-mono text-[11px]">{hoveredInfo.title}</div>
          <div className="text-stone-300 font-mono text-[10px]">{hoveredInfo.subtitle}</div>
        </div>
      )}
    </div>
  );
};
