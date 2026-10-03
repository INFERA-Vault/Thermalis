import React, { useState, useRef, useCallback, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useThermalData } from './hooks/useThermalData';
import { AppHeader } from './components/ui/AppHeader';
import { StatusBar } from './components/ui/StatusBar';
import { MapLibreViewer } from './components/map/MapLibreViewer';
import { MapControls } from './components/map/MapControls';
import { InspectorPanel } from './components/inspector/InspectorPanel';
import { LayerPanel } from './components/layers/LayerPanel';
import { TimelineBar } from './components/timeline/TimelineBar';
import { AlertsDrawer } from './components/alerts/AlertsDrawer';
import { AnalysisModal } from './components/analysis/AnalysisModal';
import { HelpModal } from './components/ui/HelpModal';
import { ThermalisLoadingScreen } from './components/loading/ThermalisLoadingScreen';
import { applyGlassStyles, loadGlassSettings } from './lib/liquidGlass/tuningStore';
import {
  LayerVisibilityState,
  SelectedObjectState,
  Coordinates
} from './types';

export const App: React.FC = () => {
  // Real backend thermal & GIS telemetry hook
  const {
    rawEvents,
    modeEvents,
    filteredEvents,
    rawFacilities,
    stats,
    health,
    alertCount,
    alertCounts,
    loading,
    backendOnline,
    eventsStatus,
    timeBounds,
    timelineMode,
    setTimelineMode,
    scrubberTimestamp,
    setScrubberTimestamp,
    isPlaying,
    setIsPlaying,
    loadData,
    triggerFirmsRefresh
  } = useThermalData();

  // Layer Visibility State
  const [layers, setLayers] = useState<LayerVisibilityState>({
    firmsMaster: true,
    industrialHeatSource: true,
    persistentThermal: true,
    otherThermal: true,
    clustering: true,
    satelliteBasemap: 'natural',
    industrialFacilities: true,
    placeLabelsBorders: true,
    alerts: true
  });

  // UI Panels & Modals State
  const [layersOpen, setLayersOpen] = useState<boolean>(true);
  const [timelineOpen, setTimelineOpen] = useState<boolean>(true);
  // Default state: Object Inspector is completely hidden when nothing is selected
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  
  const [alertsOpen, setAlertsOpen] = useState<boolean>(false);
  const [analysisOpen, setAnalysisOpen] = useState<boolean>(false);
  const [helpOpen, setHelpOpen] = useState<boolean>(false);

  // Initialize and inject calibrated Liquid Glass styles on mount
  useEffect(() => {
    applyGlassStyles(loadGlassSettings());
  }, []);

  // Selected Object State (FIRMS Event or OSM Facility)
  const [selectedObject, setSelectedObject] = useState<SelectedObjectState>({
    type: null,
    id: null
  });

  // Camera fly-to trigger state
  const [cameraTrigger, setCameraTrigger] = useState<{
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
    ts: number;
  } | null>(null);

  // Live Map Telemetry (Position, Zoom, Bearing, Pitch)
  const [telemetry, setTelemetry] = useState<{
    lng: number;
    lat: number;
    zoom: number;
    pitch: number;
    bearing: number;
  }>({
    lng: 0,
    lat: 20,
    zoom: 1.5,
    pitch: 0,
    bearing: 0
  });

  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState<boolean>(true);

  // Application readiness: map engine initialized & data load completed (or handled)
  const isAppReady = mapReady && (!loading || eventsStatus === 'success' || eventsStatus === 'error');

  // Map callbacks
  const handleMapReady = useCallback((map: maplibregl.Map) => {
    mapInstanceRef.current = map;
    setMapReady(true);
  }, []);

  const handleSelectEvent = useCallback((eventId: number, coords: Coordinates) => {
    setSelectedObject({
      type: 'event',
      id: eventId,
      coordinates: coords
    });
    setInspectorOpen(true);
  }, []);

  const handleSelectFacility = useCallback((facilityId: number, coords: Coordinates) => {
    setSelectedObject({
      type: 'facility',
      id: facilityId,
      coordinates: coords
    });
    setInspectorOpen(true);
  }, []);

  const handleCenterMap = useCallback((lng: number, lat: number, customZoom?: number) => {
    const currentZoom = mapInstanceRef.current?.getZoom() ?? 2;
    // Moderate zoom level: if currently zoomed out, zoom to 9.5; if already inspecting at a good level, preserve current zoom clamped to max 10.5
    const targetZoom = customZoom ?? (currentZoom < 7 ? 9.5 : Math.min(currentZoom, 10.5));
    setCameraTrigger({
      center: [lng, lat],
      zoom: targetZoom,
      pitch: 0,
      bearing: 0,
      ts: Date.now()
    });
  }, []);

  // Sync selection: Clear selected event if it falls outside active timeline filter
  useEffect(() => {
    if (selectedObject.type === 'event' && selectedObject.id !== null) {
      const exists = filteredEvents.features.some(f => f.properties.id === selectedObject.id || f.id === selectedObject.id);
      if (!exists) {
        setSelectedObject({ type: null, id: null });
        setInspectorOpen(false);
      }
    }
  }, [filteredEvents, selectedObject]);

  // Optional URL parameter handling for direct inspection (e.g. ?zoom=1.5&lng=78&lat=20)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const zoomParam = params.get('zoom');
      const lngParam = params.get('lng');
      const latParam = params.get('lat');
      if (zoomParam) {
        const z = parseFloat(zoomParam);
        const lng = lngParam ? parseFloat(lngParam) : 0;
        const lat = latParam ? parseFloat(latParam) : 20;
        if (!isNaN(z)) {
          setCameraTrigger({
            center: [lng, lat],
            zoom: z,
            pitch: 0,
            bearing: 0,
            ts: Date.now()
          });
        }
      }
    } catch {}
  }, []);

  // Global search navigate: only moves/pans the camera; does NOT open the inspector
  const handleNavigateCoords = useCallback((coords: { lng: number; lat: number; zoom?: number }) => {
    const currentZoom = mapInstanceRef.current?.getZoom() ?? 2;
    const targetZoom = coords.zoom ?? (currentZoom < 7 ? 9.5 : Math.min(currentZoom, 10.5));
    setCameraTrigger({
      center: [coords.lng, coords.lat],
      zoom: targetZoom,
      pitch: 0,
      bearing: 0,
      ts: Date.now()
    });
  }, []);

  // Select event directly from Alerts drawer
  const handleAlertSelectEvent = useCallback((eventId: number) => {
    const ev = rawEvents.features.find(f => f.properties.id === eventId);
    if (ev) {
      handleSelectEvent(eventId, {
        lng: ev.geometry.coordinates[0],
        lat: ev.geometry.coordinates[1]
      });
      handleCenterMap(ev.geometry.coordinates[0], ev.geometry.coordinates[1]);
    } else {
      setSelectedObject({
        type: 'event',
        id: eventId
      });
      setInspectorOpen(true);
    }
  }, [rawEvents, handleSelectEvent, handleCenterMap]);

  return (
    <div
      className="w-screen h-screen relative bg-[#08090b] overflow-hidden select-none"
      style={{
        '--timeline-height': timelineOpen ? '84px' : '0px',
        '--map-safe-bottom': timelineOpen ? 'calc(var(--status-height, 24px) + 84px)' : 'var(--status-height, 24px)'
      } as React.CSSProperties}
    >
      {/* Primary Full-Bleed MapLibre Canvas Container */}
      <main className="absolute inset-0 w-full h-full z-0 bg-[#08090b]">
        <MapLibreViewer
          events={filteredEvents}
          facilities={rawFacilities}
          layers={layers}
          selectedObject={selectedObject}
          onSelectEvent={handleSelectEvent}
          onSelectFacility={handleSelectFacility}
          onClearSelection={() => {
            setSelectedObject({ type: null, id: null });
            setInspectorOpen(false);
          }}
          onUpdateTelemetry={setTelemetry}
          cameraTrigger={cameraTrigger}
          onMapReady={handleMapReady}
        />

        {/* Map Controls */}
        <MapControls
          mapInstance={mapInstanceRef.current}
          currentPitch={telemetry.pitch}
        />
      </main>

      {/* Top Bar Header */}
      <div className="absolute top-0 left-0 right-0 z-30 pointer-events-auto">
        <AppHeader
          events={rawEvents}
          facilities={rawFacilities}
          onNavigateCoords={handleNavigateCoords}
          layersOpen={layersOpen}
          onToggleLayers={() => setLayersOpen(!layersOpen)}
          timelineOpen={timelineOpen}
          onToggleTimeline={() => setTimelineOpen(!timelineOpen)}
          onOpenAnalysis={() => setAnalysisOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenAlerts={() => setAlertsOpen(true)}
          alertCount={alertCount}
          backendOnline={backendOnline}
        />
      </div>

      {/* Left Layers Panel */}
      <LayerPanel
        layers={layers}
        onUpdateLayers={setLayers}
        isOpen={layersOpen}
        onClose={() => setLayersOpen(false)}
      />

      {/* Right Event / Facility Inspector Panel */}
      <div className="absolute right-0 top-11 bottom-6 z-40 pointer-events-auto flex flex-col min-h-0">
        <InspectorPanel
          isOpen={inspectorOpen}
          selectedObject={selectedObject}
          allEvents={rawEvents.features}
          onSelectEventId={(id) => {
            const ev = rawEvents.features.find(f => f.id === id);
            if (ev) {
              const origLng = ev.properties.original_lng ?? ev.geometry.coordinates[0];
              const origLat = ev.properties.original_lat ?? ev.geometry.coordinates[1];
              handleSelectEvent(id, { lng: origLng, lat: origLat });
            }
          }}
          onClose={() => {
            setInspectorOpen(false);
            setSelectedObject({ type: null, id: null });
          }}
          onCenterMap={handleCenterMap}
          onAlertStatusChange={() => loadData(true)}
        />
      </div>

      {/* Bottom Timeline Bar */}
      <div className="absolute bottom-6 left-0 right-0 z-[25] pointer-events-auto">
        <TimelineBar
          events={modeEvents}
          timelineMode={timelineMode}
          onSetTimelineMode={setTimelineMode}
          scrubberTimestamp={scrubberTimestamp}
          onSetScrubberTimestamp={setScrubberTimestamp}
          isPlaying={isPlaying}
          onSetIsPlaying={setIsPlaying}
          timeBounds={timeBounds}
          isOpen={timelineOpen}
        />
      </div>

      {/* Bottom HUD Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-auto">
        <StatusBar
          telemetry={telemetry}
          backendOnline={backendOnline}
          eventCount={filteredEvents.features.length}
          eventsStatus={eventsStatus}
          alertCount={alertCount}
          lastSyncAt={health?.last_firms_sync_at}
          syncStatus={health?.firms_sync_status}
        />
      </div>

      {/* Alerts Drawer */}
      <AlertsDrawer
        isOpen={alertsOpen}
        onClose={() => setAlertsOpen(false)}
        onSelectEventId={handleAlertSelectEvent}
        onAlertCountUpdated={() => loadData(true)}
        counts={alertCounts}
        onRefreshFirms={triggerFirmsRefresh}
        lastSyncAt={health?.last_firms_sync_at}
      />

      {/* Analysis Modal */}
      <AnalysisModal
        isOpen={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        events={filteredEvents}
        facilities={rawFacilities}
        stats={stats}
        alertCount={alertCount}
      />

      {/* Operator Help Modal */}
      <HelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      {/* Integrated INFERA Canvas Particle Loading Screen */}
      {showLoadingScreen && (
        <ThermalisLoadingScreen
          imageSrc="/infera-logo.jpeg"
          isReady={isAppReady}
          onComplete={() => setShowLoadingScreen(false)}
        />
      )}
    </div>
  );
};

export default App;
