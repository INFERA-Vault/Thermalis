/**
 * THERMALIS Liquid Glass UI System
 * TypeScript definitions adapted from dashersw/liquid-glass-js
 */

export type LiquidGlassShape = 'rounded' | 'circle' | 'pill';

export type LiquidGlassVariant = 'default' | 'fire-active' | 'fire-subtle' | 'smoked' | 'critical';

export interface LiquidGlassOptions {
  /** Shape of the glass surface: 'rounded' | 'circle' | 'pill' */
  type?: LiquidGlassShape;
  /** Corner radius in pixels (default: 16) */
  borderRadius?: number;
  /** Opacity of the smoked / fire tint overlay (0.0 to 1.0, recommended 0.12 - 0.20) */
  tintOpacity?: number;
  /** Base tint color RGB [0-1, 0-1, 0-1] (default: dark charcoal smoked) */
  tintColor?: [number, number, number];
  /** Rim highlight color RGB [0-1, 0-1, 0-1] (default: fire amber / gold) */
  rimColor?: [number, number, number];
  /** Gaussian blur radius for refracted background (recommended 4.0 - 8.0) */
  blurRadius?: number;
  /** Edge refraction intensity (recommended 0.015 - 0.03) */
  edgeIntensity?: number;
  /** Rim highlight refraction intensity (recommended 0.04 - 0.08) */
  rimIntensity?: number;
  /** Base center refraction intensity (subtle) */
  baseIntensity?: number;
  /** Distance factor for edge refraction */
  edgeDistance?: number;
  /** Distance factor for rim refraction */
  rimDistance?: number;
  /** Distance factor for base refraction */
  baseDistance?: number;
  /** Corner proximity refraction boost */
  cornerBoost?: number;
  /** Perpendicular ripple effect factor (recommended 0.0 - 0.04) */
  rippleEffect?: number;
  /** Enable center warping distortion (recommended false for GIS UI) */
  warp?: boolean;
  /** Design theme variant */
  variant?: LiquidGlassVariant;
  /** WebGL context state change callback */
  onContextStateChange?: (ready: boolean) => void;
}

export interface LiquidGlassPosition {
  x: number;
  y: number;
}

export interface GLProgramRefs {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture | null;
  positionBuffer: WebGLBuffer | null;
  texcoordBuffer: WebGLBuffer | null;
  positionLoc: number;
  texcoordLoc: number;
  resolutionLoc: WebGLUniformLocation | null;
  textureSizeLoc: WebGLUniformLocation | null;
  scrollYLoc?: WebGLUniformLocation | null;
  blurRadiusLoc: WebGLUniformLocation | null;
  borderRadiusLoc: WebGLUniformLocation | null;
  containerPositionLoc: WebGLUniformLocation | null;
  warpLoc: WebGLUniformLocation | null;
  edgeIntensityLoc: WebGLUniformLocation | null;
  rimIntensityLoc: WebGLUniformLocation | null;
  baseIntensityLoc: WebGLUniformLocation | null;
  edgeDistanceLoc: WebGLUniformLocation | null;
  rimDistanceLoc: WebGLUniformLocation | null;
  baseDistanceLoc: WebGLUniformLocation | null;
  cornerBoostLoc: WebGLUniformLocation | null;
  rippleEffectLoc: WebGLUniformLocation | null;
  tintOpacityLoc: WebGLUniformLocation | null;
  tintColorLoc: WebGLUniformLocation | null;
  rimColorLoc: WebGLUniformLocation | null;
  imageLoc: WebGLUniformLocation | null;
  pageHeightLoc?: WebGLUniformLocation | null;
  viewportHeightLoc?: WebGLUniformLocation | null;
  buttonPositionLoc?: WebGLUniformLocation | null;
  containerSizeLoc?: WebGLUniformLocation | null;
}
