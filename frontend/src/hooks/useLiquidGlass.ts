/**
 * React hook to attach a LiquidGlass Container to DOM elements
 */
import { useEffect, useRef, useState } from 'react';
import { Container } from '../lib/liquidGlass/Container';
import { LiquidGlassOptions } from '../lib/liquidGlass/types';

export function useLiquidGlass(options: LiquidGlassOptions = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<Container | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isFallback, setIsFallback] = useState(false);

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    try {
      const instance = new Container(containerRef.current, canvasRef.current, options);
      instanceRef.current = instance;

      if (!instance.getGL()) {
        setIsFallback(true);
      } else {
        setIsReady(true);
      }
    } catch (e) {
      console.warn('LiquidGlass hook fallback:', e);
      setIsFallback(true);
    }

    return () => {
      if (instanceRef.current) {
        instanceRef.current.destroy();
        instanceRef.current = null;
      }
      setIsReady(false);
    };
  }, []); // Run on mount / unmount

  // Handle options updates
  useEffect(() => {
    if (instanceRef.current && isReady) {
      instanceRef.current.updateOptions(options);
    }
  }, [
    options.type,
    options.variant,
    options.borderRadius,
    options.tintOpacity,
    options.blurRadius,
    options.edgeIntensity,
    options.rimIntensity,
    options.baseIntensity,
    options.rippleEffect,
    options.warp
  ]);

  return {
    containerRef,
    canvasRef,
    instance: instanceRef.current,
    isReady,
    isFallback
  };
}
