import React from 'react';
import { X } from 'lucide-react';
import { LayerVisibilityState } from '../../types';
import { LiquidGlassSurface } from '../ui/LiquidGlassSurface';

interface LayerPanelProps {
  layers: LayerVisibilityState;
  onUpdateLayers: (updater: (prev: LayerVisibilityState) => LayerVisibilityState) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  onUpdateLayers,
  isOpen,
  onClose
}) => {
  const toggleLayer = (key: keyof Omit<LayerVisibilityState, 'satelliteBasemap'>) => {
    onUpdateLayers(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const setBasemap = (mode: 'natural' | 'thermal' | 'dark') => {
    onUpdateLayers(prev => ({
      ...prev,
      satelliteBasemap: mode
    }));
  };

  const renderLayerRow = (
    key: keyof Omit<LayerVisibilityState, 'satelliteBasemap'>,
    label: string,
    activeDotColor: string
  ) => {
    const isActive = layers[key];
    return (
      <div
        onClick={() => toggleLayer(key)}
        className="flex items-center justify-between px-2 py-0.5 rounded hover:bg-[#181B20] cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
              isActive ? activeDotColor : 'bg-[#383330]'
            }`}
          />
          <span className={isActive ? 'text-[#F4F4F5]' : 'text-[#686360]'}>
            {label}
          </span>
        </div>
        {/* Sleek, non-repetitive micro-toggle switch */}
        <div
          className={`w-5 h-2.5 rounded-full p-0.5 border transition-all duration-150 flex items-center shrink-0 ${
            isActive
              ? 'bg-[#FF5A00]/20 border-[#FF5A00]/60 justify-end'
              : 'bg-[#111317] border-[#272A30] justify-start'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              isActive ? 'bg-[#FF9F00]' : 'bg-[#4B4E57]'
            }`}
          />
        </div>
      </div>
    );
  };

  return (
    <LiquidGlassSurface
      as="aside"
      type="rounded"
      level={2}
      surfaceKey="layers"
      borderRadius={10}
      style={{
        display: isOpen ? 'flex' : 'none',
        top: 'calc(var(--header-height, 44px) + 10px)',
        maxHeight: 'calc(100vh - var(--header-height, 44px) - var(--map-safe-bottom, 108px) - 24px)'
      }}
      className="absolute left-3 w-56 z-[35] flex-col select-none overflow-hidden text-xs transition-[max-height] duration-200"
    >
      {/* Header */}
      <div className="px-2.5 py-1.5 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between bg-transparent shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-sm bg-[#FF5A00]" />
          <span className="font-semibold text-[#F4F4F5] text-[11px] tracking-wider uppercase">
            LAYERS
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-[#94908D] hover:text-[#F4F4F5] p-0.5 rounded transition-colors"
          title="Close Layers"
        >
          <X size={13} />
        </button>
      </div>

      {/* Layer Groups (Scrollable on short screens) */}
      <div className="p-2 flex flex-col gap-2 overflow-y-auto">
        {/* THERMAL */}
        <div>
          <div className="text-[9.5px] font-semibold text-[#94908D] tracking-wider uppercase mb-1">
            THERMAL
          </div>
          <div className="flex flex-col gap-0.5">
            {renderLayerRow('firmsMaster', 'NASA FIRMS', 'bg-[#FF5A00]')}
            {renderLayerRow('persistentThermal', 'Persistent', 'bg-[#FF9F00]')}
            {renderLayerRow('industrialHeatSource', 'Industrial Association', 'bg-[#FFD000]')}
          </div>
        </div>

        {/* Thin separator */}
        <div className="border-t border-[#1F2227] my-0.5" />

        {/* CONTEXT */}
        <div>
          <div className="text-[9.5px] font-semibold text-[#94908D] tracking-wider uppercase mb-1">
            CONTEXT
          </div>
          <div className="flex flex-col gap-0.5">
            {renderLayerRow('industrialFacilities', 'Industrial Facilities', 'bg-[#A8A29E]')}
            {renderLayerRow('placeLabelsBorders', 'Place Names', 'bg-[#D4D4D8]')}
            {renderLayerRow('alerts', 'Alerts', 'bg-[#FF0000]')}
          </div>
        </div>

        {/* Thin separator */}
        <div className="border-t border-[#1F2227] my-0.5" />

        {/* BASEMAP */}
        <div>
          <div className="text-[9.5px] font-semibold text-[#94908D] tracking-wider uppercase mb-1">
            BASEMAP
          </div>
          <div className="grid grid-cols-3 gap-1">
            {(['natural', 'thermal', 'dark'] as const).map(mode => {
              const label = mode === 'natural' ? 'Natural' : mode === 'thermal' ? 'Thermal' : 'Dark';
              const isSelected = layers.satelliteBasemap === mode;
              return (
                <button
                  key={mode}
                  onClick={() => setBasemap(mode)}
                  className={`py-0.5 text-[10.5px] rounded border text-center transition-all ${
                    isSelected
                      ? 'bg-[#FF5A00]/15 border-[#FF5A00]/70 text-[#FF9F00] font-medium'
                      : 'bg-[#0C0E11] border-[#22252B] text-[#8C8885] hover:text-[#F4F4F5] hover:border-[#383C45]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </LiquidGlassSurface>
  );
};
