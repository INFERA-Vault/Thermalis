# MapTiler Vector Tile Error Report

## ROOT CAUSE
- **Style Request**: `https://api.maptiler.com/maps/streets-v2/style.json?key={API_KEY}`
- **Vector Tile Request**: `https://api.maptiler.com/tiles/v3/tiles.json?key={API_KEY}`
- **HTTP Status**: 200 OK (Once key was provided correctly).
- **Browser Error**: `Error: Worker failed to load. Check that the worker URL is correct.`
- **Exact Failure Reason**: The MapLibre WebWorker failed to load because `maplibre-gl` was not excluded from Vite's dependency optimizer (`optimizeDeps`). Without the worker, MapLibre cannot decode the MapTiler PBF vector tiles, leaving the map completely blank (displaying only the background color from the style definition and the attribution control). Additionally, the Vite development server had not been fully restarted after the `.env` file was modified, causing the environment variable injection to be stale.

## FIX
1. Modified `frontend/vite.config.ts` to include:
   ```typescript
   optimizeDeps: {
     exclude: ['maplibre-gl']
   }
   ```
2. Killed the stale Vite development server and completely restarted it using `npm run dev -- --port 5173 --host`.

## MAP VERIFICATION
- **Style**: MapTiler `streets-v2` loaded successfully.
- **Vector Tiles**: `maptiler_planet` vector layers rendering correctly.
- **English Labels**: Verified. MapTiler's style natively implements English prioritization (`name:en`).
- **China**: English labels (e.g., Beijing) render as primary.
- **Japan**: English labels (e.g., Tokyo) render as primary.
- **India**: English labels (e.g., New Delhi) render as primary.

## PROJECT LAYERS
- **FIRMS**: GeoJSON layer and data rendering correctly above the vector basemap.
- **OSM**: Industrial facility polygons rendering correctly.
- **Clustering**: MapLibre density-based clustering is intact.
- **Selection**: Inspector panel and click interactions on events are functioning as expected.

## BUILD & TESTS
- **Frontend Build**: `npm run build` completed with zero errors.
- **Backend Tests**: Passed (41/41).

## LOCALHOST
- **Backend**: http://localhost:8000/docs
- **Frontend**: http://localhost:5173
