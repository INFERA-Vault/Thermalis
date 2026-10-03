/**
 * THERMALIS Liquid Glass Surface Component
 * 
 * Hybrid Live Glass Architecture:
 * 1. Live Background: Browser native hardware-accelerated `backdrop-filter: blur(3.5px)`
 *    blurs the live MapLibre satellite map and labels in real time at 60fps with zero lag.
 * 2. Liquid Glass Overlay: WebGL procedural shader renders physical liquid-glass edge refraction,
 *    warm fire rim lighting, and corner optical depth.
 * 3. Sharp Content: Crisp, unblurred DOM content positioned above the glass.
 * 
 * Calibrated against physical liquid fire glass specifications:
 * - Blur Radius: 3.5px
 * - Tint Opacity: 0.22
 * - Edge Refraction: 0.025
 * - Rim Lighting: 0.090
 */
import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Container } from '../../lib/liquidGlass/Container';
import { LiquidGlassOptions } from '../../lib/liquidGlass/types';
import {
  THERMAL_FIRE_GLASS,
  THERMAL_FIRE_GLASS_COMPACT,
  GLASS_LEVELS,
  GlassMaterialLevel
} from '../../lib/liquidGlass/presets';
import { useSurfaceGlassSettings, GlassSurfaceKey } from '../../lib/liquidGlass/tuningStore';

export interface LiquidGlassSurfaceProps extends LiquidGlassOptions {
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  style?: React.CSSProperties;
  id?: string;
  as?: 'div' | 'header' | 'aside' | 'section' | 'nav' | 'main' | 'footer';
  /** Preset calibration: default (THERMAL_FIRE_GLASS) or compact (THERMAL_FIRE_GLASS_COMPACT) */
  preset?: 'default' | 'compact';
  /** Material depth level: 1 = Background Glass, 2 = Elevated Glass, 3 = Deep Glass */
  level?: GlassMaterialLevel;
  /** Surface Key for Liquid Glass tuning */
  surfaceKey?: GlassSurfaceKey;
  'data-glass-surface'?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLElement>) => void;
}

export const LiquidGlassSurface: React.FC<LiquidGlassSurfaceProps> = ({
  children,
  className = '',
  contentClassName = '',
  style = {},
  id,
  as: Component = 'div',
  type = 'rounded',
  variant = 'default',
  borderRadius,
  preset = 'default',
  level = 2,
  surfaceKey,
  'data-glass-surface': dataGlassSurface,
  tintOpacity,
  blurRadius,
  edgeIntensity,
  rimIntensity,
  baseIntensity,
  rippleEffect,
  warp,
  tintColor,
  rimColor,
  onClick,
  onMouseEnter,
  onMouseLeave
}) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<Container | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  // Material preset baseline
  const activePreset = useMemo(() => {
    return preset === 'compact' ? THERMAL_FIRE_GLASS_COMPACT : THERMAL_FIRE_GLASS;
  }, [preset]);

  // Level configuration (1, 2, or 3)
  const levelConfig = useMemo(() => {
    return GLASS_LEVELS[level] || GLASS_LEVELS[2];
  }, [level]);

  // Live tuned settings if surfaceKey is provided
  const tuned = useSurfaceGlassSettings(surfaceKey);

  // Calibrated material parameters
  const effectiveBlur = blurRadius ?? tuned?.blurRadius ?? levelConfig.blurRadius ?? activePreset.blurRadius;
  const effectiveTintOpacity = tintOpacity ?? tuned?.tintOpacity ?? levelConfig.tintOpacity ?? activePreset.tintOpacity;
  const effectiveEdgeIntensity = edgeIntensity ?? tuned?.edgeRefraction ?? activePreset.edgeIntensity;
  const effectiveRimIntensity = rimIntensity ?? tuned?.rimLighting ?? activePreset.rimIntensity;
  const effectiveBaseIntensity = baseIntensity ?? activePreset.baseIntensity;
  const effectiveRipple = rippleEffect ?? activePreset.rippleEffect;
  const effectiveWarp = warp ?? activePreset.warp;
  const effectiveTintColor = tintColor ?? levelConfig.tintColor;
  const effectiveRimColor = rimColor ?? levelConfig.rimColor;

  const radius = useMemo(() => {
    if (borderRadius !== undefined) return borderRadius;
    if (type === 'circle' || type === 'pill') return 999;
    return level === 1 ? 0 : 12;
  }, [borderRadius, type, level]);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    try {
      const instance = new Container(containerRef.current, canvasRef.current, {
        type,
        variant,
        borderRadius: radius,
        tintOpacity: effectiveTintOpacity,
        blurRadius: effectiveBlur,
        edgeIntensity: effectiveEdgeIntensity,
        rimIntensity: effectiveRimIntensity,
        baseIntensity: effectiveBaseIntensity,
        rippleEffect: effectiveRipple,
        warp: effectiveWarp,
        tintColor: effectiveTintColor,
        rimColor: effectiveRimColor,
        onContextStateChange: (ready) => {
          setIsReady(ready);
          setIsFallback(!ready);
        }
      });

      instanceRef.current = instance;
      if (!instance.isReady()) {
        setIsFallback(true);
      } else {
        setIsReady(true);
      }
    } catch (err) {
      console.warn('LiquidGlassSurface WebGL initialization warning:', err);
      setIsFallback(true);
    }

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
      setIsReady(false);
    };
  }, []);

  // Sync prop updates
  useEffect(() => {
    if (instanceRef.current && isReady) {
      instanceRef.current.updateOptions({
        type,
        variant,
        borderRadius: radius,
        tintOpacity: effectiveTintOpacity,
        blurRadius: effectiveBlur,
        edgeIntensity: effectiveEdgeIntensity,
        rimIntensity: effectiveRimIntensity,
        baseIntensity: effectiveBaseIntensity,
        rippleEffect: effectiveRipple,
        warp: effectiveWarp,
        tintColor: effectiveTintColor,
        rimColor: effectiveRimColor
      });
    }
  }, [
    type,
    variant,
    radius,
    effectiveTintOpacity,
    effectiveBlur,
    effectiveEdgeIntensity,
    effectiveRimIntensity,
    effectiveBaseIntensity,
    effectiveRipple,
    effectiveWarp,
    effectiveTintColor,
    effectiveRimColor,
    isReady
  ]);

  // Level & variant border styling (clean, restrained dark borders)
  const variantBorderClass = useMemo(() => {
    if (variant === 'fire-active') {
      return 'border border-[#FF5A00]';
    }
    if (variant === 'critical') {
      return 'border border-[#EF4444]';
    }
    return `${levelConfig.borderClass} ${levelConfig.depthShadow}`;
  }, [variant, levelConfig]);

  // Live CSS Hybrid Glass Backdrop:
  const containerStyle: React.CSSProperties = {
    borderRadius: `${radius}px`,
    backgroundColor: tuned
      ? `rgba(12, 14, 18, var(--glass-bg-opacity, ${tuned.backgroundOpacity}))`
      : isFallback
      ? levelConfig.fallbackBackground
      : levelConfig.cssBackground,
    backdropFilter: `blur(var(--glass-blur, ${effectiveBlur}px))`,
    WebkitBackdropFilter: `blur(var(--glass-blur, ${effectiveBlur}px))`,
    ...style
  };

  const hasExplicitPosition = className.includes('absolute') || className.includes('fixed') || className.includes('sticky');
  const positionClass = hasExplicitPosition ? '' : 'relative';

  return (
    <Component
      ref={containerRef as any}
      id={id}
      data-glass="true"
      data-glass-surface={surfaceKey || dataGlassSurface}
      data-fallback={isFallback ? 'true' : 'false'}
      data-level={level}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`liquid-glass-surface ${positionClass} overflow-hidden transition-all duration-200 ${variantBorderClass} ${className}`}
      style={containerStyle}
    >
      {/* WebGL Refraction & Rim Light Overlay (strictly pointer-events-none) */}
      <canvas
        ref={canvasRef}
        className="liquid-glass-canvas absolute inset-0 pointer-events-none z-0 block"
        style={{
          borderRadius: `${radius}px`,
          width: '100%',
          height: '100%'
        }}
      />

      {/* Foreground Content (always sharp, un-blurred DOM) */}
      <div className={`relative z-10 w-full h-full pointer-events-auto ${contentClassName}`}>
        {children}
      </div>
    </Component>
  );
};
