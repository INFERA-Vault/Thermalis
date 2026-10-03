/**
 * THERMALIS — Liquid Glass Material Presets & Calibration
 * 
 * Centralized hybrid material calibration based on physical liquid glass specifications:
 * - Blur Radius: 3.5px (clear liquid glass refraction via native browser backdrop-filter)
 * - Tint Opacity: 0.22 (single coherent optical tint, map visibly influences appearance)
 * - Edge Refraction: 0.025 (subtle physical edge bending, no wavy blobs)
 * - Rim Lighting: 0.090 (restrained warm rim light establishing material depth)
 * 
 * Live Hybrid Architecture:
 * - Native browser compositing: `backdrop-filter: blur(3.5px)` provides 100% live 60fps background
 * - WebGL Liquid Glass Overlay: provides physical edge refraction, fire rim lighting, and corner depth
 * - UI Content: crisp, unblurred foreground layer
 */

export interface LiquidGlassMaterialPreset {
  blurRadius: number;
  tintOpacity: number;
  edgeIntensity: number;
  rimIntensity: number;
  baseIntensity: number;
  edgeDistance: number;
  rimDistance: number;
  baseDistance: number;
  cornerBoost: number;
  rippleEffect: number;
  warp: boolean;
}

/**
 * Primary THERMALIS Material Preset: THERMAL_FIRE_GLASS
 * The authoritative baseline calibration for the entire UI system.
 */
export const THERMAL_FIRE_GLASS: LiquidGlassMaterialPreset = {
  blurRadius: 3.5,
  tintOpacity: 0.22,
  edgeIntensity: 0.0,
  rimIntensity: 0.0,
  baseIntensity: 0.001,
  edgeDistance: 0.15,
  rimDistance: 0.8,
  baseDistance: 0.1,
  cornerBoost: 0.0,
  rippleEffect: 0.0,
  warp: false
};

/**
 * Compact Variant: THERMAL_FIRE_GLASS_COMPACT
 * For small buttons and compact control bars.
 */
export const THERMAL_FIRE_GLASS_COMPACT: LiquidGlassMaterialPreset = {
  blurRadius: 2.8,
  tintOpacity: 0.20,
  edgeIntensity: 0.0,
  rimIntensity: 0.0,
  baseIntensity: 0.001,
  edgeDistance: 0.18,
  rimDistance: 0.9,
  baseDistance: 0.1,
  cornerBoost: 0.0,
  rippleEffect: 0.0,
  warp: false
};

/**
 * 3 Clear Material Levels for THERMALIS UI Surfaces:
 * LEVEL 1 — Background Glass (Header / StatusBar)
 * LEVEL 2 — Elevated Glass (Layers / Timeline / Search / MapControls)
 * LEVEL 3 — Deep Glass (Object Inspector / Important Modals)
 */
export type GlassMaterialLevel = 1 | 2 | 3;

export interface GlassLevelConfig {
  tintColor: [number, number, number];
  rimColor: [number, number, number];
  tintOpacity: number;
  blurRadius: number;
  cssBackground: string;
  fallbackBackground: string;
  border: string;
  borderClass: string;
  depthShadow: string;
}

export const GLASS_LEVELS: Record<GlassMaterialLevel, GlassLevelConfig> = {
  // LEVEL 1 — Background Glass (Header / Status)
  1: {
    tintColor: [0.05, 0.04, 0.038],
    rimColor: [0.2, 0.2, 0.2],
    tintOpacity: 0.20,
    blurRadius: 3.5,
    cssBackground: 'rgba(10, 12, 16, 0.85)',
    fallbackBackground: 'rgba(10, 12, 16, 0.95)',
    border: '1px solid #1F2227',
    borderClass: 'border-b border-[#1F2227]',
    depthShadow: 'shadow-none'
  },
  // LEVEL 2 — Elevated Glass (Layers / MapControls)
  2: {
    tintColor: [0.045, 0.035, 0.032],
    rimColor: [0.2, 0.2, 0.2],
    tintOpacity: 0.22,
    blurRadius: 3.5,
    cssBackground: 'rgba(14, 17, 22, 0.82)',
    fallbackBackground: 'rgba(14, 17, 22, 0.95)',
    border: '1px solid #272A30',
    borderClass: 'border border-[#272A30]',
    depthShadow: 'shadow-[0_4px_16px_rgba(0,0,0,0.5)]'
  },
  // LEVEL 3 — Deep Glass (Object Inspector / Modals / Alerts)
  3: {
    tintColor: [0.055, 0.026, 0.022],
    rimColor: [0.2, 0.2, 0.2],
    tintOpacity: 0.24,
    blurRadius: 3.8,
    cssBackground: 'rgba(16, 18, 24, 0.88)',
    fallbackBackground: 'rgba(16, 18, 24, 0.96)',
    border: '1px solid #272A30',
    borderClass: 'border-l border-[#272A30]',
    depthShadow: 'shadow-[0_8px_28px_rgba(0,0,0,0.6)]'
  }
};
