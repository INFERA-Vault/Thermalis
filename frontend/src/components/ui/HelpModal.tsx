import React from 'react';
import { X } from 'lucide-react';
import { LiquidGlassSurface } from './LiquidGlassSurface';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 select-none p-4 backdrop-blur-xs">
      <LiquidGlassSurface
        as="div"
        type="rounded"
        level={3}
        surfaceKey="floatingPanels"
        borderRadius={12}
        className="w-full max-w-xl flex flex-col max-h-[85vh] overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#262322] bg-[#0C0E11]/70 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-sm bg-[#FF5A00]" />
            <span className="text-xs font-semibold text-[#F4F4F5] uppercase tracking-wider">
              Operator Guide
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-[#94908D] hover:text-[#F4F4F5] p-0.5 rounded transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs leading-relaxed text-stone-300">
          {/* Navigation */}
          <div>
            <div className="text-[10px] font-semibold text-[#94908D] tracking-wider uppercase mb-1.5">
              Navigation & Interaction
            </div>
            <div className="bg-[#0C0E11] border border-[#262322] p-3 rounded space-y-1.5 text-[11px]">
              <div>
                <span className="font-semibold text-[#F4F4F5]">Point Click: </span>
                Selects a thermal event or industrial facility to open telemetry in the Object Inspector.
              </div>
              <div>
                <span className="font-semibold text-[#F4F4F5]">Cluster Click: </span>
                Zooms and smoothly un-clusters detections.
              </div>
              <div>
                <span className="font-semibold text-[#F4F4F5]">Timeline: </span>
                Filter observations chronologically; toggle 24H, 7D, or ALL time ranges.
              </div>
              <div>
                <span className="font-semibold text-[#F4F4F5]">3D Tilt: </span>
                Right-click and drag or click the 3D button in the map controls.
              </div>
            </div>
          </div>

          {/* Layer Semantics */}
          <div className="pt-2 border-t border-[#262322]">
            <div className="text-[10px] font-semibold text-[#94908D] tracking-wider uppercase mb-1.5">
              Layer Definitions
            </div>
            <div className="bg-[#0C0E11] border border-[#262322] p-3 rounded space-y-1.5 text-[11px]">
              <div>
                <span className="font-semibold text-[#FF5A00]">NASA FIRMS: </span>
                Near-real-time active thermal detections from MODIS and VIIRS satellite sensors.
              </div>
              <div>
                <span className="font-semibold text-[#EF4444]">Operational Alerts: </span>
                Actionable notifications generated from thermal observations. A single thermal event may produce multiple alert types.
              </div>
              <div>
                <span className="font-semibold text-[#A8A29E]">Industrial Facilities: </span>
                Refineries, chemical plants, thermal power stations, and metal smelters from OpenStreetMap.
              </div>
              <div>
                <span className="font-semibold text-emerald-400">Land Cover: </span>
                ESA WorldCover 10m land classification (built-up, cropland, bare soil, vegetation).
              </div>
            </div>
          </div>

          {/* Model A Disclaimer */}
          <div className="pt-2 border-t border-[#262322]">
            <div className="text-[10px] font-semibold text-[#94908D] tracking-wider uppercase mb-1.5">
              Model A Inference Scope
            </div>
            <div className="bg-[#0C0E11] border border-[#262322] p-3 rounded text-[11px] text-[#94908D] space-y-1">
              <p>
                Model A is trained to classify whether a thermal anomaly statistically matches known Global Industrial Heat Sources (GIHS) facilities or agricultural crop-burning baselines.
              </p>
              <p className="text-[#686360] text-[10px]">
                Note: A high probability indicates resemblance to known industrial operational thermal signatures, not necessarily an uncontrolled fire.
              </p>
            </div>
          </div>
        </div>
      </LiquidGlassSurface>
    </div>
  );
};
