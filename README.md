# 3D Wuhan Visual Map (Wuchang District)

Interactive 3D map of Wuchang District, Wuhan built with Python (OSM/DEM/GBA preprocessing) and Three.js + Vite.

## Project Structure
- `pipeline/` — Python scripts that extract Wuchang District data from OSM (`D:\WuhanGIS\hubei-261109.osm.pbf`), DEM, GlobalBuildingAtlas heights, and MapTiler satellite imagery.
- `web/` — Vite + Three.js 3D web application (`web/src/main.js`, `web/index.html`).
- `data/raw/` — *(Git-ignored)* Raw downloaded/extracted datasets (`~1.04 GB`).
- `web/public/data/` — *(Git-ignored)* Preprocessed local-meter JSON/binary assets loaded by the web app (`~16.4 MB`).

## Running the Website
If `web/public/data/` and `web/node_modules/` are already present locally:
```powershell
cd web
npm run dev
```
Open the local Vite URL (default `http://localhost:5173/`) in a browser.

## Restoring or Regenerating Excluded Data
On a fresh clone (where `data/` and `web/public/data/` are absent):
1. **Install dependencies:**
   - Python 3.10+: `pip install osmium geopandas shapely pyproj numpy scipy rasterio ijson requests pillow`
   - Node.js dependencies: `cd web && npm install`
2. **Environment variables:**
   - Copy `.env.example` to `.env` and set `MAPTILER_API_KEY` (required only if regenerating `satellite.jpg`).
3. **Run the pipeline from the project root:**
   - Ensure the read-only reference PBF exists at `D:\WuhanGIS\hubei-261109.osm.pbf`.
   - `python pipeline/p1_boundary.py` — Extract Wuchang District administrative boundary.
   - `python pipeline/p1_extract.py` — Extract OSM layers for Wuchang (+500 m buffer).
   - Download Copernicus DEM (`N30_E114`) to `data/raw/dem_N30_E114.tif` and GlobalBuildingAtlas (`e110_n35_e115_n30`) to `data/raw/gba/`, then run `python pipeline/p2a_gba.py`.
   - `python pipeline/p2_prepare.py` — Generate `web/public/data/` (`terrain.bin`, `buildings.json`, `roads.json`, `water.json`, `green.json`, `trees_*.json`, `meta.json`, etc.).
   - `python pipeline/p2c_satellite.py` — Download & warp MapTiler satellite tiles into `web/public/data/satellite.jpg`.
