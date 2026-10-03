import React, { useState } from 'react';
import { Plus, Minus, Globe, Maximize2 } from 'lucide-react';
import maplibregl from 'maplibre-gl';
import { LiquidGlassSurface } from '../ui/LiquidGlassSurface';

interface MapControlsProps {
  mapInstance: maplibregl.Map | null;
  currentPitch: number;
}

export const MapControls: React.FC<MapControlsProps> = ({ mapInstance, currentPitch }) => {
  const [isGlobeActive, setIsGlobeActive] = useState<boolean>(true);

  const handleZoomIn = () => {
    if (mapInstance) mapInstance.zoomIn({ duration: 300 });
  };

  const handleZoomOut = () => {
    if (mapInstance) mapInstance.zoomOut({ duration: 300 });
  };

  const handleToggleGlobeProjection = () => {
    if (!mapInstance) return;
    const nextState = !isGlobeActive;
    setIsGlobeActive(nextState);

    // If native setProjection exists in MapLibre version, invoke it
    if (typeof (mapInstance as any).setProjection === 'function') {
      try {
        (mapInstance as any).setProjection({ type: nextState ? 'globe' : 'mercator' });
      } catch (err) {
        console.info('Projection toggle info:', err);
      }
    }

    // Toggle 3D oblique perspective angle smoothly
    const targetPitch = nextState ? 50 : 0;
    mapInstance.easeTo({
      pitch: targetPitch,
      duration: 500
    });
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <LiquidGlassSurface
      surfaceKey="mapControls"
      type="rounded"
      level={2}
      borderRadius={6}
      style={{
        bottom: 'calc(var(--map-safe-bottom, 108px) + 12px)'
      }}
      className="absolute right-3 z-20 flex flex-col gap-1 p-1 pointer-events-auto select-none transition-[bottom] duration-200"
    >
      <button
        type="button"
        onClick={handleZoomIn}
        title="Zoom in"
        className="w-7 h-7 rounded bg-[#131518] hover:bg-[#1C1F24] border border-[#272A30] flex items-center justify-center text-[#94908D] hover:text-[#F4F4F5] transition-colors"
      >
        <Plus size={13} />
      </button>

      <button
        type="button"
        onClick={handleZoomOut}
        title="Zoom out"
        className="w-7 h-7 rounded bg-[#131518] hover:bg-[#1C1F24] border border-[#272A30] flex items-center justify-center text-[#94908D] hover:text-[#F4F4F5] transition-colors"
      >
        <Minus size={13} />
      </button>

      <button
        type="button"
        onClick={handleToggleGlobeProjection}
        title={isGlobeActive ? '3D Globe Projection (Active)' : '2D Planar Map'}
        className={`w-7 h-7 rounded border flex items-center justify-center transition-colors ${
          isGlobeActive || currentPitch > 25
            ? 'bg-[#FF5A00]/20 border-[#FF5A00] text-[#FF9F00]'
            : 'bg-[#131518] hover:bg-[#1C1F24] border-[#272A30] text-[#94908D] hover:text-[#F4F4F5]'
        }`}
      >
        <Globe size={13} />
      </button>

      <button
        type="button"
        onClick={handleToggleFullscreen}
        title="Toggle Fullscreen"
        className="w-7 h-7 rounded bg-[#131518] hover:bg-[#1C1F24] border border-[#272A30] flex items-center justify-center text-[#94908D] hover:text-[#F4F4F5] transition-colors"
      >
        <Maximize2 size={13} />
      </button>
    </LiquidGlassSurface>
  );
};
