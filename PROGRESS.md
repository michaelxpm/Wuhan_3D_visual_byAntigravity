# PROGRESS — 3D Wuhan Visual Map (Wuchang District)

## Current Phase
- **P2 / P3 Transition**: Core OSM + DEM + GBA height + MapTiler satellite data pipeline is built; initial Three.js 3D scene (`web/src/main.js`) is implemented and rendered (`web/shots/a1.png`). Git repository initialized and configured.

## Git Status
- **Repository Root**: `D:\coding\2611-3D-wuhan-visual--map-byAntigravity`
- **Active Branch**: `develop`
- **Stable Branch**: `main` (at initial commit `78ba2ce`)
- **Remote**: None configured yet (local only)

## Completed Milestones
- **P0**: Node.js v26.13.1 + npm 11.20.0 installed; Python geospatial stack (`osmium`, `geopandas`, `shapely`, `pyproj`, `rasterio`, `ijson`) verified; `web/` Vite + Three.js project initialized.
- **P1**: Extracted Wuchang District administrative boundary (`relation/3076297`) and all OSM layers within boundary + 500 m buffer from read-only `D:\WuhanGIS\hubei-261109.osm.pbf`.
- **P2**:
  - Downloaded Copernicus 30 m DEM (`data/raw/dem_N30_E114.tif`).
  - Downloaded GlobalBuildingAtlas ODbL polygons & LoD1 heights (`data/raw/gba/`) and matched 3,382 OSM building heights for Wuchang.
  - Downloaded and warped 100 MapTiler z14 satellite tiles into `web/public/data/satellite.jpg`.
  - Generated local-meter runtime datasets in `web/public/data/` (`terrain.bin`, `buildings.json`, `roads.json`, `water.json`, `green.json`, `trees_osm.json`, `trees_synthetic.json`, `rails.json`, `pois.json`, `meta.json`).
- **P3 (Initial)**: Implemented Three.js viewer (`web/src/main.js`) with terrain, water, extruded buildings + night windows, roads/bridges/piers, instanced trees, POI labels, time-of-day sky, quality presets, and first-person mode. Verified first headless screenshot (`web/shots/a1.png`).
- **Git & Governance Setup**: Created `.gitignore`, `.env`, `.env.example`, `AGENTS.md`, and `README.md`; removed hardcoded MapTiler key from `pipeline/p2c_satellite.py`; committed initial state to `main` (`78ba2ce`) and switched to `develop`.

## Generated Files & Data Locations (Git-Ignored)
- `data/raw/wuchang_boundary.geojson`, `data/raw/osm/*.geojson`
- `data/raw/dem_N30_E114.tif` (42.9 MB)
- `data/raw/gba/odbl.geojson` (95 MB), `data/raw/gba/lod1.json` (881 MB), `data/raw/gba_wuchang.json` (1.35 MB)
- `data/raw/sat_tiles/*.jpg` (100 tiles, 7.01 MB)
- `web/public/data/*` (~16.4 MB runtime assets)
- `web/node_modules/` (63.91 MB)
- `web/shots/a1.png`

## Known Limitations & Issues
- `pipeline/p2d_fetch_wuchang_gba_polys.py` failed during the final range fetch due to a transient DNS error (`huggingface.co`); non-OSM Microsoft/satellite footprints from GBA have not yet been merged into `buildings.json`.
- `web/src/main.js` still needs integration of `satellite.jpg` ground blending, landmark detailing (Yellow Crane Tower, Yangtze River Bridge, etc.), PBR/textured facades, and performance/memory verification on integrated GPU.
- `D:\WuhanGIS` remains strictly read-only.

## Next Planned Actions
1. Retry/complete `pipeline/p2d_fetch_wuchang_gba_polys.py` if needed, or validate current building coverage.
2. Continue P3/P4: integrate MapTiler satellite imagery toggle/blending with vector ground, refine bridge/tunnel 3D geometry, add landmark detailing, and verify console/rendering/FPS across multiple camera angles.

## Resume Instructions
- Work on `develop` branch only.
- Run `cd web && npm run dev` to preview locally; run `python pipeline/p2_prepare.py` to regenerate `web/public/data/` if `pipeline/` changes.
