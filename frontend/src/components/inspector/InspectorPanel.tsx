import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { SelectedObjectState, EventFeatureItem } from '../../types';
import { useEventDetail } from '../../hooks/useEventDetail';
import { useFacilityDetail } from '../../hooks/useFacilityDetail';
import { formatCoordinates, formatDistance } from '../../utils/geoUtils';
import { formatUtcDateTime, formatRelativeTime } from '../../utils/timeUtils';
import { api } from '../../services/api';
import { LiquidGlassSurface } from '../ui/LiquidGlassSurface';

interface InspectorPanelProps {
  isOpen: boolean;
  selectedObject: SelectedObjectState;
  allEvents?: EventFeatureItem[];
  onSelectEventId?: (eventId: number) => void;
  onClose: () => void;
  onCenterMap: (lng: number, lat: number) => void;
  onAlertStatusChange?: () => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  isOpen,
  selectedObject,
  allEvents,
  onSelectEventId,
  onClose,
  onCenterMap,
  onAlertStatusChange
}) => {
  // Resizable width (persisted in sessionStorage)
  const [width, setWidth] = useState<number>(() => {
    try {
      const saved = sessionStorage.getItem('thermalis_inspector_width');
      if (saved) {
        const val = parseInt(saved, 10);
        if (!isNaN(val) && val >= 280 && val <= 560) return val;
      }
    } catch {}
    return 360;
  });

  const isDraggingRef = useRef<boolean>(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.min(560, Math.max(280, startWidth + delta));
      setWidth(newWidth);
      try {
        sessionStorage.setItem('thermalis_inspector_width', String(newWidth));
      } catch {}
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [width]);

  const isEvent = selectedObject.type === 'event' && selectedObject.id !== null;
  const isFacility = selectedObject.type === 'facility' && selectedObject.id !== null;

  // Track open sections independently. Model Classification is open by default.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    persistence: false,
    industrial: false,
    worldcover: false,
    satellite: false,
    model: true,
    alerts: false
  });

  // When selected event changes, ensure Model Classification is open/active
  useEffect(() => {
    if (selectedObject.id !== null) {
      setOpenSections(prev => ({ ...prev, model: true }));
    }
  }, [selectedObject.id]);

  const toggleSection = (sec: string) => {
    setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  const {
    detail: eventDetail,
    modelA,
    satellites,
    worldCover,
    alerts,
    loading: eventLoading,
    modelLoading,
    error: eventError,
    modelError,
    triggerModelA,
    refetch: refetchEvent
  } = useEventDetail(isEvent ? Number(selectedObject.id) : null);

  const {
    facility: osmFacility,
    loading: facilityLoading,
    error: facilityError
  } = useFacilityDetail(isFacility ? Number(selectedObject.id) : null);

  // Check for coincident events at the exact same coordinates
  const coincidentEvents = useMemo(() => {
    if (!isEvent || !eventDetail || !allEvents || allEvents.length <= 1) return [];
    const curLat = eventDetail.event.latitude;
    const curLng = eventDetail.event.longitude;
    return allEvents.filter(f => {
      const origLng = f.properties.original_lng ?? f.geometry.coordinates[0];
      const origLat = f.properties.original_lat ?? f.geometry.coordinates[1];
      return Math.abs(origLat - curLat) < 0.0001 && Math.abs(origLng - curLng) < 0.0001;
    });
  }, [isEvent, eventDetail, allEvents]);

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await api.acknowledgeAlert(alertId);
      refetchEvent();
      if (onAlertStatusChange) onAlertStatusChange();
    } catch (e: any) {
      console.error('Failed to acknowledge alert:', e);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await api.resolveAlert(alertId);
      refetchEvent();
      if (onAlertStatusChange) onAlertStatusChange();
    } catch (e: any) {
      console.error('Failed to resolve alert:', e);
    }
  };

  const renderSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return 'bg-[#FF0000]/15 text-[#FF0000] border-[#FF0000]/40 font-bold';
      case 'HIGH':
        return 'bg-[#E74D02]/15 text-[#E74D02] border-[#E74D02]/40';
      case 'MEDIUM':
        return 'bg-[#FF9F00]/15 text-[#FF9F00] border-[#FF9F00]/40';
      case 'LOW':
      default:
        return 'bg-[#FCB42C]/15 text-[#FCB42C] border-[#FCB42C]/40';
    }
  };

  const formatConfidence = (conf: any) => {
    if (conf === undefined || conf === null) return 'N/A';
    const str = String(conf).trim().toLowerCase();
    if (str === 'n' || str === 'nominal') return 'Nominal (n)';
    if (str === 'l' || str === 'low') return 'Low (l)';
    if (str === 'h' || str === 'high') return 'High (h)';
    const num = Number(conf);
    if (!isNaN(num)) return `${num}%`;
    return String(conf);
  };

  const formatSourceSensor = (event: any) => {
    if (event.source) {
      return event.source.replace(/_/g, ' ');
    }
    if (event.satellite === 'N') return 'VIIRS (Suomi-NPP)';
    if (event.satellite === 'T') return 'MODIS (Terra)';
    if (event.satellite === 'A') return 'MODIS (Aqua)';
    return event.satellite || 'MODIS/VIIRS';
  };

  const isVisible = isOpen && Boolean(selectedObject.type) && selectedObject.id !== null;

  return (
    <LiquidGlassSurface
      as="aside"
      type="rounded"
      level={3}
      surfaceKey="floatingPanels"
      borderRadius={0}
      style={{
        width: `${width}px`,
        display: isVisible ? 'flex' : 'none'
      }}
      className="relative h-full flex flex-col select-none z-20 overflow-hidden shrink-0 min-h-0"
      contentClassName="flex flex-col h-full min-h-0 overflow-hidden"
    >
      {isVisible && (
        <>
          {/* Drag Resize Handle on left edge */}
          <div
            onMouseDown={handleMouseDown}
            className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-col-resize z-30 hover:bg-[#FF5A00]/50 active:bg-[#FF5A00] transition-colors"
            title="Drag to resize inspector width"
          />

          {/* Header */}
          <div className="px-3.5 py-2 border-b border-[#262322] flex items-center justify-between bg-[#0C0E11] shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-sm bg-[#FF5A00]" />
              <span className="text-[11px] font-semibold text-[#F4F4F5] uppercase tracking-wider">
                OBJECT INSPECTOR
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-[#94908D] hover:text-[#F4F4F5] p-0.5 rounded transition-colors"
              title="Close Inspector"
            >
              <X size={14} />
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-3 text-xs inspector-scroll-container">
            {/* Loading Indicators */}
            {eventLoading && isEvent && (
              <div className="py-6 text-center text-[#94908D] text-xs">
                Loading telemetry...
              </div>
            )}

            {facilityLoading && isFacility && (
              <div className="py-6 text-center text-[#94908D] text-xs">
                Loading facility...
              </div>
            )}

            {/* Error States */}
            {!eventLoading && eventError && isEvent && (
              <div className="p-3 border border-[#E74D02]/30 bg-[#611511]/20 rounded text-[#FF9F00] text-xs">
                <div className="font-semibold mb-1 text-[#FF5A00]">DATA UNAVAILABLE</div>
                <div className="text-[11px] text-[#94908D] mb-2">{eventError}</div>
                <button
                  onClick={() => refetchEvent()}
                  className="gis-button text-[10px]"
                >
                  Retry
                </button>
              </div>
            )}

            {!facilityLoading && facilityError && isFacility && (
              <div className="p-3 border border-[#E74D02]/30 bg-[#611511]/20 rounded text-[#FF9F00] text-xs">
                <div className="font-semibold mb-1 text-[#FF5A00]">DATA UNAVAILABLE</div>
                <div className="text-[11px] text-[#94908D]">{facilityError}</div>
              </div>
            )}

            {/* ===================== FIRMS EVENT DETAILS ===================== */}
            {isEvent && eventDetail && (
              <>
                {/* PRIMARY: Identifier & Core Telemetry */}
                <div className="flex flex-col gap-2 pb-3 border-b border-[#262322]">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-[#F4F4F5] font-mono">
                      Event #{selectedObject.id}
                    </div>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#611511]/40 text-[#FF5A00] border border-[#FF5A00]/30 font-mono">
                      NASA FIRMS
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#94908D] uppercase tracking-wider block">Coordinates</span>
                    <div className="flex items-center justify-between">
                      <span className="text-[#F4F4F5] font-mono text-[11px]">
                        {formatCoordinates(eventDetail.event.longitude, eventDetail.event.latitude)}
                      </span>
                      <button
                        onClick={() => onCenterMap(eventDetail.event.longitude, eventDetail.event.latitude)}
                        className="gis-button text-[10px] py-0.5 px-1.5 text-[#94908D] hover:text-[#F4F4F5]"
                        title="Center on map"
                      >
                        Center
                      </button>
                    </div>
                  </div>

                  {/* Coincident Events Switcher Pill */}
                  {coincidentEvents.length > 1 && (
                    <div className="bg-[#1C1A19] border border-[#FF5A00]/30 rounded p-2 flex flex-col gap-1.5 my-1">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-[#FF9F00] font-semibold flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00] animate-pulse" />
                          Coincident Detections ({coincidentEvents.length})
                        </span>
                        <span className="text-[#94908D] text-[9px]">Same Coordinates</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {coincidentEvents.map(ev => {
                          const evId = Number(ev.properties?.id ?? ev.properties?.event_id ?? ev.id);
                          const isCurrent = evId === Number(selectedObject.id);
                          const rawSource = ev.properties?.source || ev.properties?.satellite || '';
                          const displaySource = rawSource.replace('_NRT', '').replace('VIIRS_', '');
                          return (
                            <button
                              key={evId}
                              onClick={() => onSelectEventId && onSelectEventId(evId)}
                              className={`px-2 py-1 rounded text-[10px] font-mono transition-all flex items-center gap-1.5 border ${
                                isCurrent
                                  ? 'bg-[#FF5A00] text-[#0C0E11] font-bold border-[#FF5A00] shadow-sm'
                                  : 'bg-[#0C0E11] text-[#D4D4D8] border-[#262322] hover:border-[#FF5A00]/50 hover:text-[#F4F4F5]'
                              }`}
                              title={`Switch to Event #${evId} (${rawSource})`}
                            >
                              <span>#{evId}</span>
                              <span className="text-[9px] opacity-80">({displaySource || 'VIIRS'})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] text-[#94908D] uppercase tracking-wider block">Detection time</span>
                    <span className="text-[#F4F4F5] font-mono text-[11px]">
                      {formatUtcDateTime(eventDetail.event.detected_at)}
                    </span>
                    <span className="text-[10px] text-[#94908D] ml-1.5">
                      ({formatRelativeTime(eventDetail.event.detected_at)})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] pt-1">
                    <div>
                      <span className="text-[10px] text-[#94908D] block">FRP</span>
                      <span className="text-[#FF5A00] font-mono font-bold text-sm">
                        {eventDetail.event.frp !== undefined ? `${eventDetail.event.frp.toFixed(1)} MW` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94908D] block">Temperature</span>
                      <span className="text-[#FFD000] font-mono font-semibold text-sm">
                        {eventDetail.event.brightness_temperature ? `${eventDetail.event.brightness_temperature.toFixed(1)} K` : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94908D] block">Confidence</span>
                      <span className="text-[#F4F4F5] font-mono">
                        {formatConfidence(eventDetail.event.confidence)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#94908D] block">Source / Sensor</span>
                      <span className="text-stone-300">
                        {formatSourceSensor(eventDetail.event)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ===================== EXPANDABLE SECTIONS ===================== */}
                <div className="flex flex-col gap-0.5">
                  {/* 1. Persistence */}
                  <div className="border-b border-[#262322]">
                    <button
                      onClick={() => toggleSection('persistence')}
                      className="w-full py-2 flex items-center justify-between text-left hover:text-[#F4F4F5] transition-colors"
                    >
                      <span className="font-medium text-stone-300 text-[11px]">Persistence</span>
                      {openSections.persistence ? (
                        <ChevronDown size={14} className="text-[#94908D]" />
                      ) : (
                        <ChevronRight size={14} className="text-[#94908D]" />
                      )}
                    </button>
                    {openSections.persistence && (
                      <div className="pb-3 pt-1 grid grid-cols-3 gap-2 text-center text-[11px]">
                        <div className="bg-[#0C0E11] p-2 rounded border border-[#262322]">
                          <span className="text-[#94908D] text-[9px] block">30D Count</span>
                          <span className="text-[#F4F4F5] font-mono font-semibold">
                            {eventDetail.features?.hotspot_frequency_30d ?? 0}
                          </span>
                        </div>
                        <div className="bg-[#0C0E11] p-2 rounded border border-[#262322]">
                          <span className="text-[#94908D] text-[9px] block">Active Days</span>
                          <span className="text-[#F4F4F5] font-mono font-semibold">
                            {eventDetail.features?.persistence_days ?? 0}
                          </span>
                        </div>
                        <div className="bg-[#0C0E11] p-2 rounded border border-[#262322]">
                          <span className="text-[#94908D] text-[9px] block">Recurrence</span>
                          <span className="text-[#FF9F00] font-mono font-semibold">
                            {eventDetail.features?.recurrence_rate !== undefined && eventDetail.features?.recurrence_rate !== null
                              ? `${(eventDetail.features.recurrence_rate * 100).toFixed(0)}%`
                              : '0%'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 2. Industrial Proximity */}
                  <div className="border-b border-[#262322]">
                    <button
                      onClick={() => toggleSection('industrial')}
                      className="w-full py-2 flex items-center justify-between text-left hover:text-[#F4F4F5] transition-colors"
                    >
                      <span className="font-medium text-stone-300 text-[11px]">Industrial Proximity</span>
                      {openSections.industrial ? (
                        <ChevronDown size={14} className="text-[#94908D]" />
                      ) : (
                        <ChevronRight size={14} className="text-[#94908D]" />
                      )}
                    </button>
                    {openSections.industrial && (
                      <div className="pb-3 pt-1 text-[11px]">
                        {eventDetail.facility ? (
                          <div className="space-y-1.5">
                            <div className="flex justify-between">
                              <span className="text-[#94908D] text-[10px]">Facility</span>
                              <span className="text-[#F4F4F5] font-medium text-right truncate max-w-[180px]">
                                {eventDetail.facility.name || 'Industrial Complex'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#94908D] text-[10px]">Type</span>
                              <span className="text-stone-300">
                                {eventDetail.facility.facility_type || 'Industrial'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[#94908D] text-[10px]">Proximity</span>
                              <span className="text-[#FFD000] font-mono font-semibold">
                                {formatDistance(eventDetail.facility.distance_meters)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-[#686360] text-[11px]">
                            No industrial facility registered within 1 km radius.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 3. WorldCover */}
                  <div className="border-b border-[#262322]">
                    <button
                      onClick={() => toggleSection('worldcover')}
                      className="w-full py-2 flex items-center justify-between text-left hover:text-[#F4F4F5] transition-colors"
                    >
                      <span className="font-medium text-stone-300 text-[11px]">WorldCover</span>
                      {openSections.worldcover ? (
                        <ChevronDown size={14} className="text-[#94908D]" />
                      ) : (
                        <ChevronRight size={14} className="text-[#94908D]" />
                      )}
                    </button>
                    {openSections.worldcover && (
                      <div className="pb-3 pt-1 text-[11px] space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-[#94908D] text-[10px]">Land Class</span>
                          <span className="text-[#F4F4F5]">
                            {worldCover?.land_cover_class_name || (eventDetail.facility ? 'Built-up / Industrial' : 'Land Cover 10m')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#94908D] text-[10px]">Source</span>
                          <span className="text-[#94908D] font-mono text-[10px]">
                            {worldCover?.source || 'ESA WorldCover 10m'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* 4. Satellite */}
                  <div className="border-b border-[#262322]">
                    <button
                      onClick={() => toggleSection('satellite')}
                      className="w-full py-2 flex items-center justify-between text-left hover:text-[#F4F4F5] transition-colors"
                    >
                      <span className="font-medium text-stone-300 text-[11px]">
                        Satellite ({satellites.length})
                      </span>
                      {openSections.satellite ? (
                        <ChevronDown size={14} className="text-[#94908D]" />
                      ) : (
                        <ChevronRight size={14} className="text-[#94908D]" />
                      )}
                    </button>
                    {openSections.satellite && (
                      <div className="pb-3 pt-1 text-[11px]">
                        {satellites.length > 0 ? (
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {satellites.map(sat => (
                              <div key={sat.id} className="p-1.5 bg-[#0C0E11] rounded border border-[#262322]">
                                <div className="flex justify-between font-medium text-stone-300">
                                  <span>{sat.satellite}</span>
                                  <span className="font-mono text-[#94908D] text-[10px]">
                                    {formatUtcDateTime(sat.acquisition_time)}
                                  </span>
                                </div>
                                {sat.cloud_coverage !== null && sat.cloud_coverage !== undefined && (
                                  <div className="text-[#686360] text-[10px]">
                                    Cloud: {sat.cloud_coverage.toFixed(1)}%
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[#686360] text-[11px]">
                            No satellite acquisitions indexed for this time window.
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 5. Model Classification (Renamed from Model A Classification, Auto-Inference) */}
                  <div className="border-b border-[#262322]">
                    <button
                      onClick={() => toggleSection('model')}
                      className="w-full py-2 flex items-center justify-between text-left hover:text-[#F4F4F5] transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-stone-300 text-[11px]">
                          Model Classification
                        </span>
                        <span className="text-[9px] font-mono text-[#8C8885]">
                          (Reference Classifier)
                        </span>
                      </div>
                      {openSections.model ? (
                        <ChevronDown size={14} className="text-[#94908D]" />
                      ) : (
                        <ChevronRight size={14} className="text-[#94908D]" />
                      )}
                    </button>
                    {openSections.model && (
                      <div className="pb-3 pt-1 space-y-2 text-[11px]">
                        {/* Automatic Loading State */}
                        {modelLoading && (
                          <div className="bg-[#0C0E11] p-3 rounded border border-[#262322] flex items-center justify-center gap-2 text-[#94908D] text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00] animate-pulse" />
                            <span>Running inference...</span>
                          </div>
                        )}

                        {/* Error / Unavailable State with Retry Option */}
                        {!modelLoading && modelError && !modelA && (
                          <div className="bg-[#0C0E11] p-2.5 rounded border border-[#E74D02]/30 flex items-center justify-between text-[11px]">
                            <span className="text-[#FF9F00]">{modelError}</span>
                            <button
                              onClick={triggerModelA}
                              className="gis-button text-[10px] py-0.5 px-2 text-[#FFD000] border-[#FF5A00]/40 hover:border-[#FF5A00]"
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {/* Prediction Results Display */}
                        {!modelLoading && modelA && (
                          <div className="bg-[#0C0E11] p-2.5 rounded border border-[#262322] space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="text-[#94908D] text-[10px] uppercase tracking-wider block">
                                  Prediction
                                </span>
                                <span className="font-semibold text-[#F4F4F5] text-xs mt-0.5 break-words leading-snug">
                                  {modelA.prediction_label}
                                </span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[#94908D] text-[10px] uppercase tracking-wider block">
                                  Probability
                                </span>
                                <span className="font-mono font-bold text-[#FFD000] text-sm block mt-0.5">
                                  {(modelA.model_probability * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>

                            {/* Probability Progress Bar */}
                            <div className="w-full bg-[#14171B] h-1.5 rounded overflow-hidden">
                              <div
                                className="h-full rounded transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, Math.max(0, modelA.model_probability * 100))}%`,
                                  background: 'linear-gradient(90deg, #FF9F00 0%, #FF5A00 60%, #FF0000 100%)'
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 6. Alerts */}
                  <div className="border-b border-[#262322]">
                    <button
                      onClick={() => toggleSection('alerts')}
                      className="w-full py-2 flex items-center justify-between text-left hover:text-[#F4F4F5] transition-colors"
                    >
                      <span className="font-medium text-stone-300 text-[11px]">
                        Alerts ({alerts.length})
                      </span>
                      {openSections.alerts ? (
                        <ChevronDown size={14} className="text-[#94908D]" />
                      ) : (
                        <ChevronRight size={14} className="text-[#94908D]" />
                      )}
                    </button>
                    {openSections.alerts && (
                      <div className="pb-3 pt-1 text-[11px]">
                        {alerts.length > 0 ? (
                          <div className="space-y-2">
                            {alerts.map(alert => (
                              <div key={alert.id} className="p-2 bg-[#0C0E11] rounded border border-[#262322]">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[#F4F4F5] font-semibold">{alert.title}</span>
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold border ${renderSeverityBadge(alert.severity)}`}>
                                    {alert.severity}
                                  </span>
                                </div>
                                <div className="text-[#94908D] text-[10px] mb-2">{alert.message}</div>
                                <div className="flex items-center justify-between pt-1 border-t border-[#262322]">
                                  <span className="text-[#686360] text-[9px] font-mono">
                                    {alert.status}
                                  </span>
                                  <div className="flex gap-1.5">
                                    {alert.status === 'ACTIVE' && (
                                      <button
                                        onClick={() => handleAcknowledgeAlert(alert.id)}
                                        className="gis-button text-[10px] px-2 py-0.5"
                                      >
                                        Ack
                                      </button>
                                    )}
                                    {alert.status !== 'RESOLVED' && (
                                      <button
                                        onClick={() => handleResolveAlert(alert.id)}
                                        className="gis-button text-[10px] px-2 py-0.5 text-emerald-300"
                                      >
                                        Resolve
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[#686360] text-[11px]">
                            No active alerts for this event.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ===================== FACILITY DETAILS ===================== */}
            {isFacility && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-[#F4F4F5] font-mono">
                    Facility #{selectedObject.id}
                  </div>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-[#262322] text-stone-300 border border-[#383330] font-mono">
                    OSM INFRASTRUCTURE
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-[#94908D] uppercase tracking-wider block">Facility Name</span>
                  <span className="text-[#F4F4F5] font-semibold text-xs block mt-0.5">
                    {osmFacility?.name || `Industrial Complex #${selectedObject.id}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-[#94908D] text-[10px] block">Type</span>
                    <span className="text-stone-300">{osmFacility?.facility_type || 'Industrial'}</span>
                  </div>
                  <div>
                    <span className="text-[#94908D] text-[10px] block">Source</span>
                    <span className="text-[#94908D] font-mono text-[10px]">{osmFacility?.source_id || 'OSM'}</span>
                  </div>
                </div>

                {selectedObject.coordinates && (
                  <div>
                    <span className="text-[10px] text-[#94908D] uppercase tracking-wider block">Coordinates</span>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-stone-300 font-mono text-[10px]">
                        {formatCoordinates(selectedObject.coordinates.lng, selectedObject.coordinates.lat)}
                      </span>
                      <button
                        onClick={() => onCenterMap(selectedObject.coordinates!.lng, selectedObject.coordinates!.lat)}
                        className="gis-button text-[10px] py-0.5 px-1.5 text-[#94908D] hover:text-[#F4F4F5]"
                      >
                        Center
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </LiquidGlassSurface>
  );
};
