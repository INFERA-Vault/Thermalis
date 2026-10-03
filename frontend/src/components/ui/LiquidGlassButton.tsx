/**
 * THERMALIS Liquid Glass Button Component
 * High-performance interactive glass button UI control designed to sit directly on
 * liquid glass surfaces or standalone, without creating redundant WebGL contexts
 * that exceed browser limits.
 */
import React, { useMemo } from 'react';
import { LiquidGlassShape, LiquidGlassVariant } from '../../lib/liquidGlass/types';

export interface LiquidGlassButtonProps {
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  type?: LiquidGlassShape;
  variant?: LiquidGlassVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  title?: string;
  disabled?: boolean;
  borderRadius?: number;
}

export const LiquidGlassButton: React.FC<LiquidGlassButtonProps> = ({
  children,
  onClick,
  active = false,
  type = 'rounded',
  variant,
  size = 'md',
  className = '',
  title,
  disabled = false,
  borderRadius
}) => {
  const effectiveVariant: LiquidGlassVariant = useMemo(() => {
    if (variant) return variant;
    return active ? 'fire-active' : 'default';
  }, [variant, active]);

  const radius = useMemo(() => {
    if (borderRadius !== undefined) return borderRadius;
    if (type === 'circle' || type === 'pill') return 999;
    if (size === 'sm') return 6;
    if (size === 'lg') return 10;
    return 7;
  }, [borderRadius, type, size]);

  const sizeClasses = useMemo(() => {
    if (type === 'circle') {
      switch (size) {
        case 'sm': return 'w-7 h-7 p-0';
        case 'lg': return 'w-10 h-10 p-0';
        case 'md':
        default: return 'w-8 h-8 p-0';
      }
    }
    switch (size) {
      case 'sm': return 'px-2 py-0.5 text-xs gap-1.5';
      case 'lg': return 'px-3.5 py-1.5 text-sm gap-2';
      case 'md':
      default: return 'px-2.5 py-1 text-xs gap-1.5';
    }
  }, [size, type]);

  const styleClasses = useMemo(() => {
    if (effectiveVariant === 'critical') {
      return 'bg-[#EF4444]/20 border-[#EF4444]/80 text-[#FCA5A5]';
    }
    if (active || effectiveVariant === 'fire-active') {
      return 'bg-[#FF5A00]/15 border-[#FF5A00] text-[#FF9F00] font-semibold';
    }
    return 'bg-[#131518]/90 border-[#272A30] hover:border-[#3F3F46] text-[#A1A1AA] hover:text-[#F4F4F5] hover:bg-[#1C1F24]';
  }, [active, effectiveVariant]);

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`glass-button relative inline-flex items-center justify-center font-medium border transition-all duration-150 select-none overflow-hidden backdrop-blur-sm ${sizeClasses} ${styleClasses} ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
      style={{
        borderRadius: `${radius}px`,
        WebkitBackdropFilter: 'blur(4px)',
        backdropFilter: 'blur(4px)'
      }}
    >
      {/* Button Content */}
      <span className="relative z-10 flex items-center justify-center gap-1.5 whitespace-nowrap">
        {children}
      </span>
    </button>
  );
};

