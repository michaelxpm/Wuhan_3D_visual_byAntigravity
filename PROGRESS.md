# PROGRESS — 3D Wuhan Visual Map (Wuchang District)

## Current Phase
- **P4 → P5 (Visual Realism & Landmark Detailing)**: Core 3D renderer, basemap switching, water/lighting fixes, and initial landmarks (Yellow Crane Tower, Yangtze River Bridge towers) are verified and passing `vite build` + headless multi-angle checks.

## Git Status
- **Repository Root**: `D:\coding\2611-3D-wuhan-visual--map-byAntigravity`
- **Active Branch**: `develop`
- **Stable Branch**: `main` (at initial commit `78ba2ce`)
- **Remote**: None configured yet

## Completed Milestones
- **P0–P2**: Environment, Git setup, Wuchang boundary + OSM extraction, Copernicus 30 m DEM, GlobalBuildingAtlas heights (3,382 OSM matches), MapTiler z14 satellite mosaic (`satellite.jpg`), and local-meter runtime data (`web/public/data/`).
- **P3 & P4**:
  - Three.js renderer with terrain, water, 7,615 buildings (procedural windows + night lighting), roads/bridges/piers, 152k instanced trees, search, building click-inspection, quality presets (`Low`/`Med`/`High`), time-of-day slider, and first-person (`F` key) mode.
  - Added `Basemap` selector (`Hybrid` / `Satellite` / `Vector`), fixed POI label distance scaling, fixed Chinese color tags (`CN_COLOR`) and favicon 404, smoothed water reflections, and improved dusk/night ambient lighting.
  - Added `web/vite.config.js` (`build.target: 'esnext'`) so `npm run build` succeeds cleanly.
- **P5 (Started)**:
  - Procedural 5-tier octagonal **Yellow Crane Tower (黄鹤楼)** at exact OSM footprint/height (`51.4 m`).
  - **Wuhan Yangtze River Bridge** Wuchang bridgehead twin towers.
  - 8 one-click **Landmark Quick-Jump** buttons in HUD.

## Acceptance Test Results (Latest)
- `npm run build` (`vite build`): **PASS** (`1.68s`, 0 errors, `dist/` built).
- Headless Edge multi-angle verification (`web/shots/b1_overview.png`, `b2_huanghelou.png`, `b3_greenland_sunset.png`, `b4_night.png`): **PASS** (0 console errors, 0 warnings, 0 404s).

## Known Limitations & Issues
- `pipeline/p2d_fetch_wuchang_gba_polys.py` (non-OSM Microsoft/satellite footprints from HuggingFace) previously hit transient DNS errors; OSM + GBA-matched heights cover 7,615 buildings.
- Real-world GPU FPS on user's AMD Vega 496 MB iGPU should be verified interactively by user at `http://localhost:5173/`.
- `D:\WuhanGIS` remains strictly read-only.

## Next Planned Actions
1. **P5 Finish**: Add sculpted crown/curtain-wall material for Wuhan Greenland Center (`476 m`), refine remaining key landmarks (e.g. Wuchang Railway Station, Hubei Provincial Museum / Chuhe Han Street), and add final polish & documentation.
2. Final end-to-end verification and user acceptance before any `main` merge.

## Resume Instructions
- Work on `develop` branch only.
- Dev server is running on `http://localhost:5173/` (or run `cd web && npm run dev`).
