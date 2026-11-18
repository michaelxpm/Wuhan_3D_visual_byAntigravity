# PROGRESS — 3D Wuhan Visual Map (Wuchang District)

## Current Phase
- **P5 Complete — Ready for User Acceptance**: All planned phases (P0–P5) are implemented, built (`vite build`), and verified via multi-angle headless browser checks.

## Git Status
- **Repository Root**: `D:\coding\2611-3D-wuhan-visual--map-byAntigravity`
- **Active Branch**: `develop`
- **Stable Branch**: `main` (release `v1.2.0` merged & tagged)
- **Remote**: `origin` -> `https://github.com/michaelxpm/Wuhan_3D_visual_byAntigravity.git`
- **GitHub Pages**: `https://michaelxpm.github.io/Wuhan_3D_visual_byAntigravity/`

## Completed Milestones
- **P0–P2**: Environment, Git setup, Wuchang boundary + OSM extraction (`D:\WuhanGIS\hubei-261109.osm.pbf` kept strictly read-only), Copernicus 30 m DEM, GlobalBuildingAtlas heights (3,382 OSM matches), MapTiler z14 satellite mosaic (`satellite.jpg`), and local-meter runtime data (`web/public/data/`).
- **P3 & P4**:
  - Three.js renderer with DEM terrain, water, 7,615 buildings (procedural windows + night lighting), 11,090 roads/bridges/piers, 152,173 instanced trees (OSM + synthetic), search, building click-inspection, quality presets (`Low`/`Med`/`High`), time-of-day slider, and first-person (`F` key) mode.
  - `Basemap` selector (`Hybrid` / `Satellite` / `Vector`), distance-scaled POI labels, Chinese color tag mapping (`CN_COLOR`), inline favicon, smooth water reflections, and readable dusk/night lighting.
  - `web/vite.config.js` (`build.target: 'esnext'`) for clean production bundling.
- **P5 (Landmarks & Final Polish)**:
  - Procedural 5-tier octagonal **Yellow Crane Tower (黄鹤楼)** (`51.4 m`).
  - Tapered aerodynamic **Wuhan Greenland Center (武汉绿地中心)** (`476 m`).
  - **Wuhan Yangtze River Bridge** Wuchang bridgehead twin towers.
  - **Wuchang Railway Station (武昌站)** pitched roof canopy.
  - 8 one-click **Landmark Quick-Jump** buttons in HUD and landmark click-inspection support.

## Acceptance Test Results (Latest)
- `npm run build` (`vite build`): **PASS** (`2.57s`, 0 errors, `dist/` built).
- Headless Edge multi-angle verification (`web/shots/b1_overview.png`, `b2_huanghelou.png`, `b3_greenland_sunset.png`, `b4_night.png`): **PASS** (0 console errors, 0 warnings, 0 404s).

## Known Limitations
- Non-OSM Microsoft/satellite building footprints from `p2d_fetch_wuchang_gba_polys.py` were skipped after transient HuggingFace DNS errors; all OSM buildings (7,615 geometries) are included with provenance-tagged heights.
- Procedural facades, synthetic street/park trees, and procedural landmark approximations (not photogrammetry).
- Real-world FPS on user's AMD Vega 496 MB iGPU to be confirmed interactively by user.

## Next Planned Actions
- Awaiting user visual & performance acceptance at `http://localhost:5173/`.
- Upon explicit user acceptance: merge `develop` into `main` and create release tag per `AGENTS.md` §7.

## Resume Instructions
- Dev server: `cd web && npm run dev` (open `http://localhost:5173/`).
- Production build: `cd web && npm run build`.
