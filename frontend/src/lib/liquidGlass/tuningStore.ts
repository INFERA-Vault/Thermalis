/**
 * THERMALIS — Liquid Glass Tuning Store & Material Controller
 * 
 * Manages runtime Liquid Glass parameters per UI surface:
 * - Header
 * - Search Bar
 * - Layers Panel
 * - Timeline
 * - Map Controls
 * - Other Floating Panels (Object Inspector, Modals, Popups)
 * 
 * Storage Key: `thermaliGlassSettings`
 */

import { useState, useEffect } from 'react';

export type GlassSurfaceKey = 'header' | 'search' | 'layers' | 'timeline' | 'mapControls' | 'floatingPanels';

export interface GlassSurfaceSettings {
  blurRadius: number;        // Range: 0px -> 20px, Step: 0.5px
  tintOpacity: number;       // Range: 0 -> 1, Step: 0.01
  edgeRefraction: number;    // Range: 0 -> 0.05, Step: 0.001
  rimLighting: number;       // Range: 0 -> 0.20, Step: 0.005
  borderOpacity: number;     // Range: 0 -> 1, Step: 0.01
  backgroundOpacity: number; // Range: 0 -> 1, Step: 0.01
  shadow: number;            // Range: 0 -> 1, Step: 0.01
}

export type AllGlassSettings = Record<GlassSurfaceKey, GlassSurfaceSettings>;

export const SURFACE_LABELS: Record<GlassSurfaceKey, string> = {
  header: 'Header',
  search: 'Search Bar',
  layers: 'Layers Panel',
  timeline: 'Timeline',
  mapControls: 'Map Controls',
  floatingPanels: 'Other Floating Panels'
};

export const DEFAULT_GLASS_SETTINGS: AllGlassSettings = {
  header: {
    blurRadius: 4.0,
    tintOpacity: 0.20,
    edgeRefraction: 0.010,
    rimLighting: 0.030,
    borderOpacity: 0.40,
    backgroundOpacity: 0.75,
    shadow: 0.20
  },
  search: {
    blurRadius: 14.0,
    tintOpacity: 0.65,
    edgeRefraction: 0.035,
    rimLighting: 0.100,
    borderOpacity: 0.80,
    backgroundOpacity: 0.90,
    shadow: 0.60
  },
  layers: {
    blurRadius: 4.0,
    tintOpacity: 0.15,
    edgeRefraction: 0.045,
    rimLighting: 0.150,
    borderOpacity: 0.55,
    backgroundOpacity: 0.37,
    shadow: 0.50
  },
  timeline: {
    blurRadius: 4.0,
    tintOpacity: 0.20,
    edgeRefraction: 0.010,
    rimLighting: 0.030,
    borderOpacity: 0.40,
    backgroundOpacity: 0.75,
    shadow: 0.20
  },
  mapControls: {
    blurRadius: 8.5,
    tintOpacity: 0.15,
    edgeRefraction: 0.045,
    rimLighting: 0.150,
    borderOpacity: 0.85,
    backgroundOpacity: 0.27,
    shadow: 0.54
  },
  floatingPanels: {
    blurRadius: 4.0,
    tintOpacity: 0.20,
    edgeRefraction: 0.010,
    rimLighting: 0.030,
    borderOpacity: 0.40,
    backgroundOpacity: 0.75,
    shadow: 0.20
  }
};

export type PresetName = 'Subtle Glass' | 'Balanced Glass' | 'Heavy Glass' | 'Crystal Glass';

export const GLASS_PRESETS: Record<PresetName, GlassSurfaceSettings> = {
  'Subtle Glass': {
    blurRadius: 4.0,
    tintOpacity: 0.20,
    edgeRefraction: 0.010,
    rimLighting: 0.030,
    borderOpacity: 0.40,
    backgroundOpacity: 0.75,
    shadow: 0.20
  },
  'Balanced Glass': {
    blurRadius: 8.0,
    tintOpacity: 0.40,
    edgeRefraction: 0.020,
    rimLighting: 0.060,
    borderOpacity: 0.60,
    backgroundOpacity: 0.82,
    shadow: 0.40
  },
  'Heavy Glass': {
    blurRadius: 14.0,
    tintOpacity: 0.65,
    edgeRefraction: 0.035,
    rimLighting: 0.100,
    borderOpacity: 0.80,
    backgroundOpacity: 0.90,
    shadow: 0.60
  },
  'Crystal Glass': {
    blurRadius: 18.0,
    tintOpacity: 0.15,
    edgeRefraction: 0.045,
    rimLighting: 0.150,
    borderOpacity: 0.85,
    backgroundOpacity: 0.55,
    shadow: 0.50
  }
};

const STORAGE_KEY = 'thermaliGlassSettings';

// Load initial settings from localStorage or defaults
export function loadGlassSettings(): AllGlassSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        header: { ...DEFAULT_GLASS_SETTINGS.header, ...(parsed.header || {}) },
        search: { ...DEFAULT_GLASS_SETTINGS.search, ...(parsed.search || {}) },
        layers: { ...DEFAULT_GLASS_SETTINGS.layers, ...(parsed.layers || {}) },
        timeline: { ...DEFAULT_GLASS_SETTINGS.timeline, ...(parsed.timeline || {}) },
        mapControls: { ...DEFAULT_GLASS_SETTINGS.mapControls, ...(parsed.mapControls || {}) },
        floatingPanels: { ...DEFAULT_GLASS_SETTINGS.floatingPanels, ...(parsed.floatingPanels || {}) }
      };
    }
  } catch (err) {
    console.warn('Error loading glass settings from localStorage:', err);
  }
  return { ...DEFAULT_GLASS_SETTINGS };
}

// Listeners for live updates across React components
type Listener = (settings: AllGlassSettings) => void;
const listeners = new Set<Listener>();

export function subscribeGlassSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyGlassSettings(settings: AllGlassSettings): void {
  listeners.forEach(l => l(settings));
}

// Persist settings to localStorage
export function saveGlassSettings(settings: AllGlassSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    notifyGlassSettings(settings);
  } catch (err) {
    console.warn('Error saving glass settings to localStorage:', err);
  }
}

// React Hook to subscribe to a surface's live tuning settings
export function useSurfaceGlassSettings(surfaceKey?: GlassSurfaceKey): GlassSurfaceSettings | null {
  const [settings, setSettings] = useState<GlassSurfaceSettings | null>(() => {
    if (!surfaceKey) return null;
    return loadGlassSettings()[surfaceKey];
  });

  useEffect(() => {
    if (!surfaceKey) return;
    setSettings(loadGlassSettings()[surfaceKey]);
    return subscribeGlassSettings((all) => {
      setSettings(all[surfaceKey]);
    });
  }, [surfaceKey]);

  return settings;
}

// Dynamic CSS Injection
export function applyGlassStyles(settings: AllGlassSettings): void {
  let styleEl = document.getElementById('thermalis-glass-tuning-styles') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'thermalis-glass-tuning-styles';
    document.head.appendChild(styleEl);
  }

  const s = settings;

  styleEl.textContent = `
    /* === Header Glass Surface === */
    [data-glass-surface="header"] {
      --glass-blur: ${s.header.blurRadius}px;
      --glass-tint-opacity: ${s.header.tintOpacity};
      --glass-edge-refraction: ${s.header.edgeRefraction};
      --glass-rim-light: ${s.header.rimLighting};
      --glass-border-opacity: ${s.header.borderOpacity};
      --glass-bg-opacity: ${s.header.backgroundOpacity};
      --glass-shadow: ${s.header.shadow};
      backdrop-filter: blur(var(--glass-blur)) !important;
      -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
      background-color: rgba(10, 12, 16, var(--glass-bg-opacity)) !important;
      border-color: rgba(55, 60, 70, var(--glass-border-opacity)) !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, var(--glass-shadow)),
                  inset 0 1px 0 rgba(255, 255, 255, calc(var(--glass-edge-refraction) * 6)),
                  0 0 calc(var(--glass-rim-light) * 35px) rgba(255, 90, 0, calc(var(--glass-rim-light) * 1.5)) !important;
    }

    /* === Search Bar Glass Surface === */
    [data-glass-surface="search"] {
      --glass-blur: ${s.search.blurRadius}px;
      --glass-tint-opacity: ${s.search.tintOpacity};
      --glass-edge-refraction: ${s.search.edgeRefraction};
      --glass-rim-light: ${s.search.rimLighting};
      --glass-border-opacity: ${s.search.borderOpacity};
      --glass-bg-opacity: ${s.search.backgroundOpacity};
      --glass-shadow: ${s.search.shadow};
      backdrop-filter: blur(var(--glass-blur)) !important;
      -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
      background-color: rgba(12, 14, 17, var(--glass-bg-opacity)) !important;
      border-color: rgba(55, 60, 70, var(--glass-border-opacity)) !important;
      box-shadow: 0 4px 16px rgba(0, 0, 0, var(--glass-shadow)),
                  inset 0 1px 0 rgba(255, 255, 255, calc(var(--glass-edge-refraction) * 6)),
                  0 0 calc(var(--glass-rim-light) * 25px) rgba(255, 90, 0, calc(var(--glass-rim-light) * 1.2)) !important;
    }

    /* === Layers Panel Glass Surface === */
    [data-glass-surface="layers"],
    .liquid-glass-surface[data-glass-surface="layers"] {
      --glass-blur: ${s.layers.blurRadius}px;
      --glass-tint-opacity: ${s.layers.tintOpacity};
      --glass-edge-refraction: ${s.layers.edgeRefraction};
      --glass-rim-light: ${s.layers.rimLighting};
      --glass-border-opacity: ${s.layers.borderOpacity};
      --glass-bg-opacity: ${s.layers.backgroundOpacity};
      --glass-shadow: ${s.layers.shadow};
      backdrop-filter: blur(var(--glass-blur)) !important;
      -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
      background-color: rgba(14, 17, 22, var(--glass-bg-opacity)) !important;
      border-color: rgba(55, 60, 70, var(--glass-border-opacity)) !important;
      box-shadow: 0 8px 32px rgba(0, 0, 0, var(--glass-shadow)),
                  inset 0 1px 0 rgba(255, 255, 255, calc(var(--glass-edge-refraction) * 6)),
                  0 0 calc(var(--glass-rim-light) * 40px) rgba(255, 90, 0, calc(var(--glass-rim-light) * 1.5)) !important;
    }

    /* === Timeline Glass Surface === */
    [data-glass-surface="timeline"] {
      --glass-blur: ${s.timeline.blurRadius}px;
      --glass-tint-opacity: ${s.timeline.tintOpacity};
      --glass-edge-refraction: ${s.timeline.edgeRefraction};
      --glass-rim-light: ${s.timeline.rimLighting};
      --glass-border-opacity: ${s.timeline.borderOpacity};
      --glass-bg-opacity: ${s.timeline.backgroundOpacity};
      --glass-shadow: ${s.timeline.shadow};
      backdrop-filter: blur(var(--glass-blur)) !important;
      -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
      background-color: rgba(10, 12, 16, var(--glass-bg-opacity)) !important;
      border-color: rgba(45, 50, 58, var(--glass-border-opacity)) !important;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, var(--glass-shadow)),
                  inset 0 1px 0 rgba(255, 255, 255, calc(var(--glass-edge-refraction) * 6)),
                  0 0 calc(var(--glass-rim-light) * 30px) rgba(255, 90, 0, calc(var(--glass-rim-light) * 1.2)) !important;
    }

    /* === Map Controls Glass Surface === */
    [data-glass-surface="mapControls"] {
      --glass-blur: ${s.mapControls.blurRadius}px;
      --glass-tint-opacity: ${s.mapControls.tintOpacity};
      --glass-edge-refraction: ${s.mapControls.edgeRefraction};
      --glass-rim-light: ${s.mapControls.rimLighting};
      --glass-border-opacity: ${s.mapControls.borderOpacity};
      --glass-bg-opacity: ${s.mapControls.backgroundOpacity};
      --glass-shadow: ${s.mapControls.shadow};
      backdrop-filter: blur(var(--glass-blur)) !important;
      -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
      background-color: rgba(12, 14, 17, var(--glass-bg-opacity)) !important;
      border-color: rgba(55, 60, 70, var(--glass-border-opacity)) !important;
      box-shadow: 0 6px 24px rgba(0, 0, 0, var(--glass-shadow)),
                  inset 0 1px 0 rgba(255, 255, 255, calc(var(--glass-edge-refraction) * 6)),
                  0 0 calc(var(--glass-rim-light) * 30px) rgba(255, 90, 0, calc(var(--glass-rim-light) * 1.2)) !important;
    }

    /* === Other Floating Panels (Inspector, Modals) === */
    [data-glass-surface="floatingPanels"],
    .liquid-glass-surface[data-glass-surface="floatingPanels"] {
      --glass-blur: ${s.floatingPanels.blurRadius}px;
      --glass-tint-opacity: ${s.floatingPanels.tintOpacity};
      --glass-edge-refraction: ${s.floatingPanels.edgeRefraction};
      --glass-rim-light: ${s.floatingPanels.rimLighting};
      --glass-border-opacity: ${s.floatingPanels.borderOpacity};
      --glass-bg-opacity: ${s.floatingPanels.backgroundOpacity};
      --glass-shadow: ${s.floatingPanels.shadow};
      backdrop-filter: blur(var(--glass-blur)) !important;
      -webkit-backdrop-filter: blur(var(--glass-blur)) !important;
      background-color: rgba(16, 18, 24, var(--glass-bg-opacity)) !important;
      border-color: rgba(55, 60, 70, var(--glass-border-opacity)) !important;
      box-shadow: 0 10px 36px rgba(0, 0, 0, var(--glass-shadow)),
                  inset 0 1px 0 rgba(255, 255, 255, calc(var(--glass-edge-refraction) * 6)),
                  0 0 calc(var(--glass-rim-light) * 40px) rgba(255, 90, 0, calc(var(--glass-rim-light) * 1.5)) !important;
    }
  `;
}

// Format single surface values as readable text
export function formatSurfaceValues(surfaceKey: GlassSurfaceKey, settings: GlassSurfaceSettings): string {
  const label = SURFACE_LABELS[surfaceKey];
  return `${label}
Blur Radius: ${settings.blurRadius.toFixed(1)}px
Tint Opacity: ${settings.tintOpacity.toFixed(2)}
Edge Refraction: ${settings.edgeRefraction.toFixed(3)}
Rim Lighting: ${settings.rimLighting.toFixed(3)}
Border Opacity: ${settings.borderOpacity.toFixed(2)}
Background Opacity: ${settings.backgroundOpacity.toFixed(2)}
Shadow: ${settings.shadow.toFixed(2)}`;
}

// Format all surface values
export function formatAllSurfaceValues(allSettings: AllGlassSettings): string {
  return (Object.keys(allSettings) as GlassSurfaceKey[])
    .map(key => formatSurfaceValues(key, allSettings[key]))
    .join('\n\n');
}
