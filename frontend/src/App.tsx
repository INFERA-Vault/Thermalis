import { useEffect, useState, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Activity, MapPin, Cpu, Layers, RefreshCw, AlertCircle, Database, ShieldAlert, CheckCircle, Gauge, Radio } from "lucide-react";
import { fetchEvents, fetchFacilities, fetchEventDetails, fetchClassification, fetchEvidenceAssessment, fetchStats, refreshFirms, fetchAlerts, fetchAlertCount, acknowledgeAlert, resolveAlert, fetchEmergencyStatus, dispatchEmergencyAlert } from "./api";
import { format } from "date-fns";

const MAPTILER_API_KEY = (import.meta.env.VITE_MAPTILER_API_KEY || "").trim();

// MapTiler is preferred for production styling. The no-key fallback keeps the
// operational overlays visible in local demos and judging environments where
// a provider key has not been provisioned yet.
const FALLBACK_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    openstreetmap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "openstreetmap",
      type: "raster",
      source: "openstreetmap"
    }
  ]
};

const MAP_STYLE: string | maplibregl.StyleSpecification = MAPTILER_API_KEY
  ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${encodeURIComponent(MAPTILER_API_KEY)}`
  : FALLBACK_MAP_STYLE;

export default function App() {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const mapContainer = useRef<HTMLDivElement>(null);
  
  const [eventsData, setEventsData] = useState<any>(null);
  const [facilitiesData, setFacilitiesData] = useState<any>(null);
  const [statsData, setStatsData] = useState<any>(null);
  
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [eventDetails, setEventDetails] = useState<any>(null);
  
  const [alerts, setAlerts] = useState<any[]>([]);
  const [activeAlertCount, setActiveAlertCount] = useState<number>(0);
  const [alertFilter, setAlertFilter] = useState("ALL");
  const [emergencyStatus, setEmergencyStatus] = useState<any>(null);
  const [emergencyAdminKey, setEmergencyAdminKey] = useState("");
  const [dispatchingAlertId, setDispatchingAlertId] = useState<string | null>(null);
  const [dispatchResult, setDispatchResult] = useState<any>(null);
  
  const [classification, setClassification] = useState<any>(null);
  const [loadingClassification, setLoadingClassification] = useState(false);
  const [evidenceAssessment, setEvidenceAssessment] = useState<any>(null);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [layerFirms, setLayerFirms] = useState(true);
  const [layerOsm, setLayerOsm] = useState(true);

  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [newEventsCount, setNewEventsCount] = useState<number>(0);
  const refreshingRef = useRef(false);

  const loadData = async (isInitial = false) => {
    try {
      setRefreshing(true);
      const [events, facilities, stats, alertsRes, alertCountRes, emergencyStatusRes] = await Promise.all([
        fetchEvents(),
        fetchFacilities(),
        fetchStats(),
        fetchAlerts(),
        fetchAlertCount(),
        fetchEmergencyStatus().catch(() => null)
      ]);
      setEventsData(events);
      if (isInitial) setFacilitiesData(facilities);
      setStatsData(stats);
      setAlerts(alertsRes);
      setActiveAlertCount(alertCountRes.active_alerts);
      setEmergencyStatus(emergencyStatusRes);
      setLastRefresh(new Date());
      setRefreshError(null);
    } catch (err) {
      console.error("Error loading data:", err);
      setRefreshError("Init load failed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleLiveRefresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const refreshResult = await refreshFirms();
      if (refreshResult.persisted_records > 0) {
         const [events, stats, alertsRes, alertCountRes, emergencyStatusRes] = await Promise.all([
           fetchEvents(),
           fetchStats(),
           fetchAlerts(),
           fetchAlertCount(),
           fetchEmergencyStatus().catch(() => null)
         ]);
         setEventsData(events);
         setStatsData(stats);
         setAlerts(alertsRes);
         setActiveAlertCount(alertCountRes.active_alerts);
         setEmergencyStatus(emergencyStatusRes);
         setNewEventsCount(refreshResult.persisted_records);
      } else {
         setNewEventsCount(0);
         // still fetch alerts just in case
         fetchAlerts().then(setAlerts);
         fetchAlertCount().then(res => setActiveAlertCount(res.active_alerts));
      }
      setLastRefresh(new Date());
      setRefreshError(null);
    } catch(err: any) {
      console.error("Error refreshing FIRMS data:", err);
      setRefreshError(err.message || "Refresh failed");
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(true);
    let timer: any;
    if (isLive) {
      timer = setInterval(() => {
        handleLiveRefresh();
      }, 60000);
    }
    return () => {
      if (timer) clearInterval(timer);
    }
  }, [isLive]);

  // Initialize Map
  useEffect(() => {
    if (!eventsData || !facilitiesData || !mapContainer.current) return;
    if (mapRef.current) return; // already initialized

    // Calculate center
    let center: [number, number] = [78.9629, 20.5937]; // Default India
    if (eventsData.features && eventsData.features.length > 0) {
      const f = eventsData.features[0];
      center = [f.geometry.coordinates[0], f.geometry.coordinates[1]];
    }

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: center,
      zoom: 4,
      pitch: 0
    });

    m.on("load", () => {
      // Add FIRMS Source
      m.addSource("firms", {
        type: "geojson",
        data: eventsData,
        cluster: true,
        clusterMaxZoom: 10,
        clusterRadius: 50
      });

      // Add OSM Source
      m.addSource("osm", {
        type: "geojson",
        data: facilitiesData
      });

      // FIRMS Clusters
      m.addLayer({
        id: "firms-clusters",
        type: "circle",
        source: "firms",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#eab308", // Yellow for small
            50,
            "#f97316", // Orange for medium
            150,
            "#ef4444"  // Red for large
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            15,
            50,
            20,
            150,
            25
          ],
          "circle-opacity": 0.8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff"
        }
      });

      m.addLayer({
        id: "firms-cluster-count",
        type: "symbol",
        source: "firms",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Regular", "Arial Unicode MS Regular"],
          "text-size": 12
        },
        paint: {
          "text-color": "#ffffff"
        }
      });

      // FIRMS Unclustered
      m.addLayer({
        id: "firms-unclustered",
        type: "circle",
        source: "firms",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": "#ef4444",
          "circle-radius": 6,
          "circle-opacity": 0.8,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#fff"
        }
      });

      // OSM Points
      m.addLayer({
        id: "osm-points",
        type: "circle",
        source: "osm",
        paint: {
          "circle-color": "#d2a8ff",
          "circle-radius": 4,
          "circle-opacity": 0.7,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#000"
        }
      });

      // Interactions
      m.on('click', 'firms-clusters', async (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ['firms-clusters'] });
        if (!features.length) return;
        const clusterId = features[0].properties.cluster_id;
        try {
            const zoom = await (m.getSource('firms') as maplibregl.GeoJSONSource).getClusterExpansionZoom(clusterId);
            m.easeTo({
                center: (features[0].geometry as any).coordinates,
                zoom: zoom
            });
        } catch (err) {
            console.error(err);
        }
      });

      m.on('click', 'firms-unclustered', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feature = e.features[0];
        // MapLibre/Supercluster may reuse feature.id for an internal index.
        // event_id is an explicit application property and remains stable.
        const id = feature.properties.event_id ?? feature.properties.id ?? feature.id;
        if (id !== undefined && id !== null) {
          setSelectedEventId(Number(id));
        }
      });

      m.on('mouseenter', 'firms-clusters', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'firms-clusters', () => { m.getCanvas().style.cursor = ''; });
      m.on('mouseenter', 'firms-unclustered', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'firms-unclustered', () => { m.getCanvas().style.cursor = ''; });
    });

    mapRef.current = m;
  }, [eventsData, facilitiesData]);

  // Handle Layer Toggles & Source Filtering
  useEffect(() => {
    if (!mapRef.current || !eventsData || !facilitiesData) return;
    const m = mapRef.current;
    if (!m.isStyleLoaded()) return;

    // Filter events
    let filteredEvents = eventsData;
    if (sourceFilter !== "ALL") {
      filteredEvents = {
        ...eventsData,
        features: eventsData.features.filter((f: any) => f.properties.source === sourceFilter)
      };
    }

    (m.getSource("firms") as maplibregl.GeoJSONSource).setData(filteredEvents);

    // Toggle Visibility
    const toggleLayer = (layerId: string, visible: boolean) => {
      if (m.getLayer(layerId)) {
        m.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };

    toggleLayer("firms-clusters", layerFirms);
    toggleLayer("firms-cluster-count", layerFirms);
    toggleLayer("firms-unclustered", layerFirms);
    toggleLayer("osm-points", layerOsm);

  }, [sourceFilter, layerFirms, layerOsm, eventsData, facilitiesData]);

  // Fetch Event Details when selected
  useEffect(() => {
    if (!selectedEventId) {
      setEventDetails(null);
      setClassification(null);
      setEvidenceAssessment(null);
      return;
    }
    const loadDetails = async () => {
      try {
        const details = await fetchEventDetails(selectedEventId);
        setEventDetails(details);
        setClassification(null);
        setEvidenceAssessment(null);
      } catch (err) {
        console.error("Error fetching details:", err);
      }
    };
    loadDetails();
  }, [selectedEventId]);

  const handleClassify = async () => {
    if (!selectedEventId) return;
    setLoadingClassification(true);
    try {
      const result = await fetchClassification(selectedEventId);
      setClassification(result);
    } catch (err: any) {
      console.error("Classification failed:", err);
      alert(err.message || "Classification failed");
    } finally {
      setLoadingClassification(false);
    }
  };

  const handleEvidenceAssessment = async () => {
    if (!selectedEventId) return;
    setLoadingEvidence(true);
    try {
      const result = await fetchEvidenceAssessment(selectedEventId);
      setEvidenceAssessment(result);
    } catch (err: any) {
      console.error("Evidence assessment failed:", err);
      alert(err.message || "Evidence assessment failed");
    } finally {
      setLoadingEvidence(false);
    }
  };

  const handleFeedClick = (f: any) => {
    setSelectedEventId(f.properties.id);
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: f.geometry.coordinates,
        zoom: 12
      });
    }
  };

  const handleAlertClick = (a: any) => {
    setSelectedEventId(a.thermal_event_id);
    if (eventsData && mapRef.current) {
      const feature = eventsData.features.find((f: any) => f.properties.id === a.thermal_event_id);
      if (feature) {
        mapRef.current.flyTo({ center: feature.geometry.coordinates, zoom: 12 });
      }
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    try {
      await acknowledgeAlert(alertId);
      const [alertsRes, alertCountRes] = await Promise.all([fetchAlerts(), fetchAlertCount()]);
      setAlerts(alertsRes);
      setActiveAlertCount(alertCountRes.active_alerts);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      await resolveAlert(alertId);
      const [alertsRes, alertCountRes] = await Promise.all([fetchAlerts(), fetchAlertCount()]);
      setAlerts(alertsRes);
      setActiveAlertCount(alertCountRes.active_alerts);
    } catch (err) {
      console.error(err);
    }
  };

  const handleEmergencyDispatch = async (alertId: string) => {
    if (!emergencyAdminKey.trim()) {
      setDispatchResult({ error: "Enter the configured emergency operator key first." });
      return;
    }

    setDispatchingAlertId(alertId);
    setDispatchResult(null);
    try {
      const result = await dispatchEmergencyAlert(alertId, emergencyAdminKey.trim());
      setDispatchResult(result);
      const status = await fetchEmergencyStatus().catch(() => null);
      if (status) setEmergencyStatus(status);
    } catch (err: any) {
      setDispatchResult({ error: err.message || "Emergency dispatch failed." });
    } finally {
      setDispatchingAlertId(null);
    }
  };

  return (
    <>
      <div className="header">
        <div className="header-left">
          <h1 className="brand-title">
            <Activity color="#58a6ff" size={20} />
            INFERA
          </h1>
          <div className="brand-subtitle">
            SIH PS-162 &bull; Industrial Fire & Thermal Anomaly Intelligence Platform
          </div>
        </div>
        <div className="header-status-container">
          
          <div className="system-status" style={{cursor: 'pointer'}} onClick={() => setIsLive(!isLive)}>
            <div className={`status-dot ${isLive ? 'active' : 'inactive'}`}></div>
            {isLive ? 'LIVE' : 'PAUSED'}
          </div>

          <div className="system-status" style={{fontSize: '0.75rem', color: '#8b949e'}}>
            {refreshError ? (
              <span style={{color: '#ff7b72'}}><AlertCircle size={10} /> {refreshError} (Last: {lastRefresh ? format(lastRefresh, 'HH:mm:ss') : '--'})</span>
            ) : (
              <span>Last update: {lastRefresh ? format(lastRefresh, 'HH:mm:ss') : '--'}</span>
            )}
          </div>

          <button className="refresh-btn" onClick={() => handleLiveRefresh()} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spinning' : ''} /> 
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>



      <div className="main-area">
        {/* LEFT SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-title">Region / View</div>
            <div style={{fontSize: '0.85rem', color: '#c9d1d9', marginBottom: 10}}>India (Current Dataset)</div>
            <button className="btn-classify" style={{background: '#21262d', color: '#c9d1d9', border: '1px solid #30363d'}} onClick={() => {
              if (mapRef.current) {
                mapRef.current.flyTo({ center: [78.9629, 20.5937], zoom: 4 });
              }
            }}>
              Fit to Dataset bounds
            </button>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title">Summary</div>
            <div className="summary-stat">
              <span className="label">Active Alerts</span>
              <span className="value" style={{color: '#ff7b72'}}>{activeAlertCount}</span>
            </div>
            <div className="summary-stat">
              <span className="label">Total DB Thermal Events</span>
              <span className="value">{statsData ? statsData.total_events.toLocaleString() : "..."}</span>
            </div>
            <div className="summary-stat">
              <span className="label">Loaded Events (Map)</span>
              <span className="value">{eventsData ? eventsData.features.length.toLocaleString() : "..."}</span>
            </div>
            <div className="summary-stat">
              <span className="label">Total DB Facilities</span>
              <span className="value">{statsData ? statsData.total_facilities.toLocaleString() : "..."}</span>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title">Filters</div>
            <div className="filter-group">
              <label>Source / Satellite</label>
              <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="ALL">All Sources</option>
                <option value="VIIRS_SNPP">VIIRS (SNPP)</option>
                <option value="VIIRS_NOAA20">VIIRS (NOAA-20)</option>
                <option value="VIIRS_NOAA21">VIIRS (NOAA-21)</option>
                <option value="MODIS_A">MODIS (Aqua)</option>
                <option value="MODIS_T">MODIS (Terra)</option>
              </select>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title">Map Layers</div>
            <label className="layer-toggle">
              <input type="checkbox" checked={layerFirms} onChange={e => setLayerFirms(e.target.checked)} />
              FIRMS Thermal Hotspots
            </label>
            <label className="layer-toggle">
              <input type="checkbox" checked={layerOsm} onChange={e => setLayerOsm(e.target.checked)} />
              OSM Industrial Facilities
            </label>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title">Alerts / Incidents</div>
            <div className="filter-group">
              <select value={alertFilter} onChange={(e) => setAlertFilter(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="ACKNOWLEDGED">Acknowledged</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </div>
            <div className="alerts-list" style={{maxHeight: 250, overflowY: 'auto', marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8}}>
              {alerts.length === 0 ? (
                <div style={{fontSize: '0.75rem', color: '#8b949e'}}>No alerts</div>
              ) : (
                alerts.filter(a => alertFilter === "ALL" || a.status === alertFilter).map(a => (
                  <div key={a.id} className={`alert-card severity-${a.severity.toLowerCase()}`} onClick={() => handleAlertClick(a)} style={{
                    padding: 8,
                    borderRadius: 6,
                    border: '1px solid #30363d',
                    background: '#21262d',
                    cursor: 'pointer'
                  }}>
                    <div style={{fontSize: '0.75rem', fontWeight: 600, color: '#c9d1d9', marginBottom: 4}}>{a.title}</div>
                    <div style={{fontSize: '0.65rem', color: '#8b949e', display: 'flex', justifyContent: 'space-between'}}>
                      <span>{a.severity}</span>
                      <span style={{
                        color: a.status === 'ACTIVE' ? '#ff7b72' : a.status === 'ACKNOWLEDGED' ? '#eab308' : '#3fb950'
                      }}>{a.status}</span>
                    </div>
                    {a.severity === 'HIGH' && a.notification_status && a.notification_status !== 'NOT_APPLICABLE' && (
                      <div style={{fontSize: '0.62rem', color: '#8b949e', marginTop: 5}}>
                        Email: <span style={{
                          color: a.notification_status === 'SENT' ? '#3fb950' :
                                 a.notification_status === 'FAILED' ? '#ff7b72' :
                                 a.notification_status === 'DISABLED' ? '#8b949e' : '#eab308'
                        }}>{a.notification_status}</span>
                      </div>
                    )}
                    {a.severity === 'HIGH' && (
                      <button
                        className="btn-classify"
                        style={{marginTop: 7, width: '100%', padding: '5px 7px', fontSize: '0.65rem', background: '#3b1d1d', borderColor: '#8b2c2c', color: '#ffb4ab'}}
                        onClick={(event) => { event.stopPropagation(); handleEmergencyDispatch(a.id); }}
                        disabled={dispatchingAlertId === a.id}
                      >
                        <Radio size={11} /> {dispatchingAlertId === a.id ? 'Dispatching...' : 'Escalate to verified contacts'}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-title"><ShieldAlert size={14} /> Emergency escalation</div>
            <div className="summary-stat">
              <span className="label">Dispatch</span>
              <span className="value" style={{fontSize: '0.75rem', color: emergencyStatus?.dispatch_enabled ? '#3fb950' : '#8b949e'}}>
                {emergencyStatus ? (emergencyStatus.dispatch_enabled ? 'ENABLED' : 'DISABLED') : 'UNAVAILABLE'}
              </span>
            </div>
            <div style={{fontSize: '0.68rem', color: '#8b949e', marginBottom: 8}}>
              Verified recipients: {emergencyStatus?.verified_recipient_count ?? '--'} · Minimum severity: {emergencyStatus?.minimum_severity ?? '--'}
            </div>
            <input
              type="password"
              value={emergencyAdminKey}
              onChange={(event) => setEmergencyAdminKey(event.target.value)}
              placeholder="Operator key (session only)"
              aria-label="Emergency operator key"
              style={{width: '100%', boxSizing: 'border-box', background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, padding: '7px 8px', fontSize: '0.7rem'}}
            />
            <div style={{fontSize: '0.63rem', color: '#8b949e', marginTop: 7, lineHeight: 1.4}}>
              Dispatch is fail-closed. Only operator-verified recipients configured through the protected API can receive SMS, voice, email, or webhook notifications.
            </div>
            {dispatchResult && (
              <div style={{fontSize: '0.65rem', color: dispatchResult.error ? '#ff7b72' : '#3fb950', marginTop: 8, lineHeight: 1.4}}>
                {dispatchResult.error || dispatchResult.message}
              </div>
            )}
          </div>
        </div>

        {/* MAP */}
        <div className="map-wrapper">
          <div ref={mapContainer} className="map"></div>
        </div>

        {/* RIGHT INSPECTOR */}
        <div className="inspector">
          {!selectedEventId || !eventDetails ? (
            <div className="inspector-empty">
              <MapPin size={32} style={{marginBottom: 10, opacity: 0.5}} />
              <div>Select a thermal anomaly<br/>on the map to inspect</div>
            </div>
          ) : (
            <>
              <div className="inspector-header">
                <h2>Event Inspector</h2>
                <div className="subtitle">ID: {eventDetails.event.id}</div>
              </div>

              {alerts.find(a => a.thermal_event_id === eventDetails.event.id) && (
                <div className="inspector-section" style={{background: 'rgba(234, 179, 8, 0.1)', borderColor: '#eab308'}}>
                  <h3 style={{color: '#eab308'}}><AlertCircle size={14} /> System Alert</h3>
                  {(() => {
                    const a = alerts.find(a => a.thermal_event_id === eventDetails.event.id);
                    return (
                      <>
                        <div style={{fontSize: '0.85rem', fontWeight: 600, color: '#c9d1d9', marginBottom: 5}}>{a.title}</div>
                        <div style={{fontSize: '0.75rem', color: '#8b949e', marginBottom: 10}}>{a.message}</div>
                        {a.severity === 'HIGH' && a.notification_status && a.notification_status !== 'NOT_APPLICABLE' && (
                          <div style={{fontSize: '0.7rem', color: '#8b949e', marginBottom: 10}}>
                            Email notification: <span style={{
                              color: a.notification_status === 'SENT' ? '#3fb950' :
                                     a.notification_status === 'FAILED' ? '#ff7b72' :
                                     a.notification_status === 'DISABLED' ? '#8b949e' : '#eab308'
                            }}>{a.notification_status}</span>
                          </div>
                        )}
                        <div style={{display: 'flex', gap: 10}}>
                          {a.status === 'ACTIVE' && (
                            <button className="btn-classify" style={{background: '#eab308', color: '#000', padding: '4px 8px', display: 'flex', alignItems: 'center'}} onClick={() => handleAcknowledge(a.id)}>
                              <CheckCircle size={12} style={{marginRight: 4}}/> Acknowledge
                            </button>
                          )}
                          {a.status !== 'RESOLVED' && (
                            <button className="btn-classify" style={{background: '#3fb950', color: '#fff', padding: '4px 8px', display: 'flex', alignItems: 'center'}} onClick={() => handleResolveAlert(a.id)}>
                              <CheckCircle size={12} style={{marginRight: 4}}/> Resolve
                            </button>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              <div className="inspector-section">
                <h3><AlertCircle size={14} /> Identification</h3>
                <div className="data-grid">
                  <div className="data-item">
                    <span className="lbl">Detection Time</span>
                    <span className="val">{eventDetails.event.detected_at}</span>
                  </div>
                  <div className="data-item">
                    <span className="lbl">Source / Satellite</span>
                    <span className="val">{eventDetails.event.source}</span>
                  </div>
                  <div className="data-item">
                    <span className="lbl">Coordinates</span>
                    <span className="val mono">{eventDetails.event.latitude.toFixed(4)}, {eventDetails.event.longitude.toFixed(4)}</span>
                  </div>
                </div>
              </div>

              <div className="inspector-section">
                <h3><Activity size={14} /> Thermal Signal</h3>
                <div className="data-grid">
                  <div className="data-item">
                    <span className="lbl">FRP (MW)</span>
                    <span className="val highlight">{eventDetails.event.frp?.toFixed(1) || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <span className="lbl">Brightness Temp (K)</span>
                    <span className="val">{eventDetails.event.brightness_temperature?.toFixed(1) || 'N/A'}</span>
                  </div>
                  <div className="data-item">
                    <span className="lbl">Confidence</span>
                    <span className="val">{eventDetails.event.confidence}</span>
                  </div>
                  <div className="data-item">
                    <span className="lbl">Day/Night</span>
                    <span className="val">{eventDetails.event.day_night === 'D' ? 'Day' : 'Night'}</span>
                  </div>
                </div>
              </div>

              <div className="inspector-section">
                <h3><Database size={14} /> Spatial & Temporal Context</h3>
                {eventDetails.features ? (
                  <div className="data-grid" style={{marginBottom: 10}}>
                    <div className="data-item">
                      <span className="lbl">Persistence (Days)</span>
                      <span className="val">{eventDetails.features.persistence_days}</span>
                    </div>
                    <div className="data-item">
                      <span className="lbl">30d Hotspot Freq</span>
                      <span className="val">{eventDetails.features.hotspot_frequency_30d}</span>
                    </div>
                    <div className="data-item">
                      <span className="lbl">WorldCover Class</span>
                      <span className="val">{eventDetails.features.land_cover_at_event || "N/A"}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{fontSize: '0.75rem', color: '#8b949e', marginBottom: 10}}>No engineered features extracted yet.</div>
                )}

                {eventDetails.facility ? (
                  <div className="facility-card">
                    <div className="lbl" style={{fontSize: '0.7rem', color: '#8b949e'}}>Nearest Associated Facility</div>
                    <div className="name">{eventDetails.facility.name || "Unnamed"}</div>
                    <div className="type">{eventDetails.facility.facility_type}</div>
                    <div className="dist">Distance: {eventDetails.facility.distance_meters.toFixed(0)}m</div>
                  </div>
                ) : (
                  <div style={{fontSize: '0.75rem', color: '#8b949e'}}>No industrial facilities in immediate vicinity.</div>
                )}
              </div>

              <div className="inspector-section">
                <h3><Layers size={14} /> Satellite Metadata</h3>
                {eventDetails.satellites && eventDetails.satellites.length > 0 ? (
                  eventDetails.satellites.map((s: any, idx: number) => (
                    <div key={idx} style={{marginBottom: 8}}>
                      <div style={{fontSize: '0.75rem', color: '#58a6ff', fontWeight: 600}}>{s.platform}</div>
                      <div style={{fontSize: '0.75rem', color: '#c9d1d9'}}>{format(new Date(s.date), 'yyyy-MM-dd HH:mm')}</div>
                      <div className="mono" style={{fontSize: '0.65rem', color: '#8b949e', wordBreak: 'break-all'}}>{s.product_id}</div>
                    </div>
                  ))
                ) : (
                  <div style={{fontSize: '0.75rem', color: '#8b949e'}}>No Sentinel observations linked to this event.</div>
                )}
              </div>

              <div className="inspector-section" style={{borderBottom: 'none'}}>
                <h3><Cpu size={14} /> AI Classification</h3>
                {!classification ? (
                  <button className="btn-classify" onClick={handleClassify} disabled={loadingClassification}>
                    {loadingClassification ? "Running Inference..." : "Request Model A Prediction"}
                  </button>
                ) : (
                  <div className="ai-classification">
                    <div className={`ai-badge ${classification.predicted_class === 1 ? 'industrial' : 'agricultural'}`}>
                      {classification.predicted_class === 1 ? "Model A - GIHS-associated industrial heat-source association" : "Agricultural-burning reference"}
                    </div>
                    <div className="ai-prob">{((classification.model_probability ?? classification.probability) * 100).toFixed(1)}%</div>
                    <div className="ai-version">Calibrated Probability &bull; Model {classification.model_version?.split('T')[0] ?? 'Unknown'}</div>
                    
                    <div className="ai-evidence">
                      <ShieldAlert size={14} style={{flexShrink: 0, marginTop: 2, color: '#eab308'}} />
                      <div>
                        <strong>Model evidence - not causal explanation</strong><br/>
                        Global SHAP dependence established in training. Individual-event SHAP not implemented in this API version.
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="inspector-section" style={{borderBottom: 'none'}}>
                <h3><Gauge size={14} /> ThermoContext Evidence Fusion</h3>
                {!evidenceAssessment ? (
                  <>
                    <div style={{fontSize: '0.75rem', color: '#8b949e', marginBottom: 10}}>
                      Transparent triage score combining thermal intensity, persistence, industrial context, land cover, sensor confidence, and linked imagery coverage.
                    </div>
                    <button className="btn-classify" onClick={handleEvidenceAssessment} disabled={loadingEvidence}>
                      {loadingEvidence ? "Building Evidence Profile..." : "Run Evidence Fusion"}
                    </button>
                  </>
                ) : (
                  <div className="ai-classification">
                    <div className={`ai-badge ${evidenceAssessment.interpretation.includes('INDUSTRIAL') || evidenceAssessment.priority === 'HIGH' ? 'industrial' : evidenceAssessment.interpretation.includes('WILDFIRE') ? 'natural' : 'agricultural'}`}>
                      {evidenceAssessment.interpretation.replaceAll('_', ' ')}
                    </div>
                    <div className="ai-prob">{evidenceAssessment.evidence_score.toFixed(1)} / 100</div>
                    <div className="ai-version">Priority: {evidenceAssessment.priority} &bull; Data coverage: {evidenceAssessment.data_coverage.toFixed(0)}%</div>
                    <div style={{fontSize: '0.75rem', color: '#c9d1d9', marginTop: 8}}>{evidenceAssessment.recommendation}</div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10}}>
                      {evidenceAssessment.signals.map((signal: any) => (
                        <div key={signal.key} style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#8b949e'}}>
                          <span>{signal.label}</span>
                          <span style={{color: signal.available ? '#c9d1d9' : '#ff7b72'}}>
                            {signal.available ? `${signal.score.toFixed(0)} / 100` : 'missing'}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="ai-evidence">
                      <ShieldAlert size={14} style={{flexShrink: 0, marginTop: 2, color: '#eab308'}} />
                      <div>
                        <strong>Why this result</strong><br/>
                        {evidenceAssessment.top_evidence.slice(0, 2).join(' ')}<br/>
                        <span style={{color: '#8b949e'}}>{evidenceAssessment.caution}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* BOTTOM FEED */}
      <div className="bottom-feed">
        <div className="feed-header">
          Latest Ingested Thermal Events
          {newEventsCount > 0 && (
            <span style={{marginLeft: 10, color: '#3fb950', fontSize: '0.75rem', padding: '2px 6px', background: 'rgba(63, 185, 80, 0.1)', borderRadius: 10}}>
              New events: {newEventsCount}
            </span>
          )}
        </div>
        <div className="feed-table-container">
          <table className="feed-table">
            <thead>
              <tr>
                <th>Event ID</th>
                <th>Detection Time</th>
                <th>Source</th>
                <th>Coordinates</th>
                <th>FRP (MW)</th>
                <th>Temp (K)</th>
              </tr>
            </thead>
            <tbody>
              {eventsData?.features?.slice(0, 50).map((f: any) => (
                <tr 
                  key={f.properties.id} 
                  className={selectedEventId === f.properties.id ? 'selected' : ''}
                  onClick={() => handleFeedClick(f)}
                >
                  <td className="mono">{f.properties.id}</td>
                  <td>{f.properties.detected_at}</td>
                  <td><span className="source-badge">{f.properties.source}</span></td>
                  <td className="mono">{f.geometry.coordinates[1].toFixed(4)}, {f.geometry.coordinates[0].toFixed(4)}</td>
                  <td style={{color: '#ff7b72'}}>{f.properties.frp?.toFixed(1) || 'N/A'}</td>
                  <td>{f.properties.brightness_temperature?.toFixed(1) || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
