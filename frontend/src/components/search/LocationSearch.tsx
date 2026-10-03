import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { EventFeatureCollection, FacilityFeatureCollection } from '../../types';
import { LiquidGlassSurface } from '../ui/LiquidGlassSurface';

interface LocationSearchProps {
  events: EventFeatureCollection;
  facilities: FacilityFeatureCollection;
  onNavigateCoords: (coords: { lng: number; lat: number; zoom?: number }) => void;
}

interface GeocodedPlace {
  name: string;
  details: string;
  lng: number;
  lat: number;
  zoom: number;
}

export const LocationSearch: React.FC<LocationSearchProps> = ({
  events,
  facilities,
  onNavigateCoords
}) => {
  const [query, setQuery] = useState<string>('');
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState<boolean>(false);
  const [geocodedPlaces, setGeocodedPlaces] = useState<GeocodedPlace[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Parse raw coordinate strings: "22.25, 71.19" or "22.25 71.19" or "22.2587N 71.1924E"
  const parsedCoords = useMemo(() => {
    if (!query.trim()) return null;
    const clean = query.replace(/[°NSEWnsew]/g, '').trim();
    const parts = clean.split(/[, ]+/).filter(Boolean);
    if (parts.length === 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng };
      }
    }
    return null;
  }, [query]);

  // Local memory search: Events and Facilities (Real Data Only)
  const localResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return { events: [], facilities: [] };
    }

    const cleanedIdStr = trimmed.replace('#', '');
    const isNum = !isNaN(Number(cleanedIdStr)) && cleanedIdStr !== '';

    const matchedEvents = isNum
      ? events.features.filter(f => String(f.properties.id) === cleanedIdStr || String(f.id) === cleanedIdStr).slice(0, 4)
      : [];

    const matchedFacilities = facilities.features.filter(f => {
      const name = (f.properties.name || '').toLowerCase();
      const type = (f.properties.facility_type || '').toLowerCase();
      const idMatch = isNum && String(f.properties.id) === cleanedIdStr;
      return name.includes(trimmed) || type.includes(trimmed) || idMatch;
    }).slice(0, 4);

    return {
      events: matchedEvents,
      facilities: matchedFacilities
    };
  }, [query, events, facilities]);

  // Worldwide Geocoding Search using OpenStreetMap Nominatim with debouncing
  const performGeocodeSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setGeocodedPlaces([]);
      setIsSearchingPlaces(false);
      return;
    }

    // Cancel prior request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsSearchingPlaces(true);

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        trimmed
      )}&format=json&addressdetails=1&limit=5`;

      const res = await fetch(url, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Accept-Language': 'en'
        }
      });

      if (!res.ok) throw new Error('Geocoding request failed');
      const data = await res.json();

      if (Array.isArray(data)) {
        const places: GeocodedPlace[] = data.map((item: any) => {
          const lat = parseFloat(item.lat);
          const lng = parseFloat(item.lon);
          
          let zoom = 11;
          const type = item.type || item.addresstype;
          if (type === 'country') zoom = 5;
          else if (type === 'state') zoom = 7;
          else if (type === 'county') zoom = 9;
          else if (type === 'city') zoom = 11;
          else if (type === 'town' || type === 'village') zoom = 13;
          else if (type === 'suburb' || type === 'neighbourhood') zoom = 14;

          const address = item.address || {};
          const details = [
            address.state,
            address.country
          ].filter(Boolean).join(', ');

          return {
            name: item.name || item.display_name.split(',')[0],
            details: details || item.display_name,
            lng,
            lat,
            zoom
          };
        });

        setGeocodedPlaces(places);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Geocode lookup warning:', err.message);
      }
    } finally {
      setIsSearchingPlaces(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!query.trim()) {
      setGeocodedPlaces([]);
      setIsSearchingPlaces(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      performGeocodeSearch(query);
    }, 350);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query, performGeocodeSearch]);

  const hasAnyResults = 
    parsedCoords !== null ||
    localResults.events.length > 0 ||
    localResults.facilities.length > 0 ||
    geocodedPlaces.length > 0;

  const showDropdown = isOpen && query.trim().length > 0;

  // Handle direct Enter submission in search box
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (parsedCoords) {
        onNavigateCoords({ lat: parsedCoords.lat, lng: parsedCoords.lng, zoom: 12 });
        setIsOpen(false);
      } else if (localResults.events.length > 0) {
        const first = localResults.events[0];
        onNavigateCoords({
          lng: first.geometry.coordinates[0],
          lat: first.geometry.coordinates[1],
          zoom: 10
        });
        setIsOpen(false);
      } else if (localResults.facilities.length > 0) {
        const first = localResults.facilities[0];
        onNavigateCoords({
          lng: first.geometry.coordinates[0],
          lat: first.geometry.coordinates[1],
          zoom: 11
        });
        setIsOpen(false);
      } else if (geocodedPlaces.length > 0) {
        const first = geocodedPlaces[0];
        onNavigateCoords({ lng: first.lng, lat: first.lat, zoom: first.zoom });
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-sm select-none">
      <LiquidGlassSurface
        surfaceKey="search"
        type="pill"
        level={2}
        borderRadius={999}
        className="relative flex items-center hover:border-[#3F3F46] focus-within:border-[#FF5A00] transition-colors"
      >
        <div className="relative w-full flex items-center px-2.5 py-0.5">
          <Search size={13} className="text-[#94908D] pointer-events-none mr-1.5 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => {
              if (query.trim().length > 0) setIsOpen(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search location, coordinates, facility, or event ID"
            className="w-full bg-transparent text-[#F4F4F5] placeholder-[#8c8885] text-[11px] py-1 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setIsOpen(false);
                setGeocodedPlaces([]);
              }}
              className="text-[#94908D] hover:text-[#F4F4F5] ml-1 shrink-0"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </LiquidGlassSurface>

      {/* Results Dropdown */}
      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 shadow-2xl z-50 max-h-72 overflow-y-auto text-[11px] bg-[#0E1115]/95 backdrop-blur-md border border-[#272A30] rounded-md"
        >
          {/* Coordinates Quick Navigate */}
          {parsedCoords && (
            <div
              onClick={() => {
                onNavigateCoords({ lat: parsedCoords.lat, lng: parsedCoords.lng, zoom: 12 });
                setIsOpen(false);
              }}
              className="p-2 hover:bg-[#181B20]/80 cursor-pointer border-b border-[#262322] text-[#FFD000] font-mono text-[10px]"
            >
              Go to coordinates: {parsedCoords.lat.toFixed(4)}°, {parsedCoords.lng.toFixed(4)}°
            </div>
          )}



          {/* Events Matches */}
          {localResults.events.length > 0 && (
            <div className="border-b border-[#262322]">
              <div className="px-2.5 py-1 text-[9px] text-[#94908D] bg-[#0C0E11]/80 uppercase tracking-wider font-semibold">
                Thermal Events
              </div>
              {localResults.events.map(ev => (
                <div
                  key={ev.properties.id}
                  onClick={() => {
                    onNavigateCoords({
                      lng: ev.geometry.coordinates[0],
                      lat: ev.geometry.coordinates[1],
                      zoom: 14
                    });
                    setIsOpen(false);
                  }}
                  className="px-2.5 py-1.5 hover:bg-[#181B20]/80 cursor-pointer flex items-center justify-between text-[#F4F4F5]"
                >
                  <span className="font-mono text-[11px]">Event #{ev.properties.id}</span>
                  <span className="text-[10px] text-[#FF9F00] font-mono">
                    {ev.properties.frp ? `${ev.properties.frp.toFixed(1)} MW` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Facilities Matches */}
          {localResults.facilities.length > 0 && (
            <div className="border-b border-[#262322]">
              <div className="px-2.5 py-1 text-[9px] text-[#94908D] bg-[#0C0E11]/80 uppercase tracking-wider font-semibold">
                Industrial Facilities
              </div>
              {localResults.facilities.map(fac => (
                <div
                  key={fac.properties.id}
                  onClick={() => {
                    onNavigateCoords({
                      lng: fac.geometry.coordinates[0],
                      lat: fac.geometry.coordinates[1],
                      zoom: 14
                    });
                    setIsOpen(false);
                  }}
                  className="px-2.5 py-1.5 hover:bg-[#181B20]/80 cursor-pointer flex items-center justify-between text-[#F4F4F5]"
                >
                  <span className="truncate max-w-[200px]">{fac.properties.name || `Facility #${fac.properties.id}`}</span>
                  <span className="text-[10px] text-[#94908D]">{fac.properties.facility_type}</span>
                </div>
              ))}
            </div>
          )}

          {/* Global Geocoded Places (Cities, States, Countries, Landmarks) */}
          {geocodedPlaces.length > 0 && (
            <div>
              <div className="px-2.5 py-1 text-[9px] text-[#94908D] bg-[#0C0E11]/80 uppercase tracking-wider font-semibold">
                Places
              </div>
              {geocodedPlaces.map((place, idx) => (
                <div
                  key={`${place.name}-${idx}`}
                  onClick={() => {
                    onNavigateCoords({
                      lng: place.lng,
                      lat: place.lat,
                      zoom: place.zoom
                    });
                    setIsOpen(false);
                  }}
                  className="px-2.5 py-1.5 hover:bg-[#181B20]/80 cursor-pointer flex items-center justify-between text-[#F4F4F5]"
                >
                  <span className="font-medium text-[#F4F4F5] truncate max-w-[170px]">{place.name}</span>
                  {place.details && (
                    <span className="text-[10px] text-[#94908D] truncate max-w-[150px]">{place.details}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Loading status */}
          {isSearchingPlaces && geocodedPlaces.length === 0 && (
            <div className="px-3 py-2 text-center text-[#94908D] text-[10px]">
              Searching places...
            </div>
          )}

          {/* No results */}
          {!isSearchingPlaces && !hasAnyResults && (
            <div className="px-3 py-2.5 text-center text-[#686360] text-[11px]">
              No matching locations or events found
            </div>
          )}
        </div>
      )}
    </div>
  );
};
