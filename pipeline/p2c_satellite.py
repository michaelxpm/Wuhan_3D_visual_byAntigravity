"""Download MapTiler satellite-v2 tiles for Wuchang view_bounds and warp to local-metre grid."""
import json, math, os, io
from concurrent.futures import ThreadPoolExecutor
import numpy as np
import requests
from PIL import Image
from pyproj import Transformer
from scipy.ndimage import map_coordinates

P = r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity"
OUT = f"{P}/web/public/data"

def load_maptiler_key():
    if os.environ.get("MAPTILER_API_KEY"):
        return os.environ["MAPTILER_API_KEY"].strip()
    env_path = os.path.join(P, ".env")
    if os.path.exists(env_path):
        with open(env_path, encoding="utf8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("MAPTILER_API_KEY=") and not line.startswith("#"):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("MAPTILER_API_KEY not found in environment or .env")

KEY = load_maptiler_key()
meta = json.load(open(f"{OUT}/meta.json", encoding="utf8"))
ox, oy = meta["origin_utm50n"]
vb = meta["view_bounds"]  # [xmin, ymin, xmax, ymax] in local meters
to_ll = Transformer.from_crs(32650, 4326, always_xy=True).transform

lons, lats = to_ll([vb[0] + ox, vb[2] + ox, vb[0] + ox, vb[2] + ox],
                   [vb[1] + oy, vb[1] + oy, vb[3] + oy, vb[3] + oy])
lon0, lon1 = min(lons), max(lons)
lat0, lat1 = min(lats), max(lats)

Z = 14
N = 2 ** Z
def ll_to_tile(lon, lat):
    x = (lon + 180.0) / 360.0 * N
    r = math.radians(lat)
    y = (1.0 - math.log(math.tan(r) + 1.0 / math.cos(r)) / math.pi) / 2.0 * N
    return x, y

tx0, ty1 = ll_to_tile(lon0, lat0)
tx1, ty0 = ll_to_tile(lon1, lat1)
ix0, ix1 = int(math.floor(tx0)), int(math.floor(tx1))
iy0, iy1 = int(math.floor(ty0)), int(math.floor(ty1))
coords = [(x, y) for y in range(iy0, iy1 + 1) for x in range(ix0, ix1 + 1)]
print(f"Fetching {len(coords)} satellite tiles at z={Z} ({ix1-ix0+1}x{iy1-iy0+1})...")

cache_dir = f"{P}/data/raw/sat_tiles"
os.makedirs(cache_dir, exist_ok=True)

def fetch(xy):
    x, y = xy
    cp = f"{cache_dir}/{Z}_{x}_{y}.jpg"
    if os.path.exists(cp) and os.path.getsize(cp) > 1000:
        return x, y, Image.open(cp).convert("RGB")
    url = f"https://api.maptiler.com/tiles/satellite-v2/{Z}/{x}/{y}.jpg?key={KEY}"
    for _ in range(3):
        try:
            r = requests.get(url, timeout=15)
            if r.status_code == 200:
                open(cp, "wb").write(r.content)
                return x, y, Image.open(io.BytesIO(r.content)).convert("RGB")
        except Exception:
            pass
    return x, y, None

with ThreadPoolExecutor(max_workers=8) as ex:
    res = list(ex.map(fetch, coords))

sample = next(im for _, _, im in res if im is not None)
TS = sample.width
W_mosaic = (ix1 - ix0 + 1) * TS
H_mosaic = (iy1 - iy0 + 1) * TS
mosaic = Image.new("RGB", (W_mosaic, H_mosaic))
for x, y, im in res:
    if im:
        mosaic.paste(im, ((x - ix0) * TS, (y - iy0) * TS))
arr = np.asarray(mosaic, dtype=np.float32)

# Reproject onto local meter grid matching view_bounds
wm = vb[2] - vb[0]
hm = vb[3] - vb[1]
S = 4096
scale = S / max(wm, hm)
cw = int(math.ceil(wm * scale))
ch = int(math.ceil(hm * scale))
xs = np.linspace(vb[0], vb[2], cw, dtype=np.float64)
ys = np.linspace(vb[3], vb[1], ch, dtype=np.float64)  # top to bottom
X, Y = np.meshgrid(xs, ys)
LON, LAT = to_ll(X + ox, Y + oy)
TX = (LON + 180.0) / 360.0 * N
RAD = np.radians(LAT)
TY = (1.0 - np.log(np.tan(RAD) + 1.0 / np.cos(RAD)) / math.pi) / 2.0 * N
px = (TX - ix0) * TS - 0.5
py = (TY - iy0) * TS - 0.5

out = np.zeros((ch, cw, 3), dtype=np.uint8)
for c in range(3):
    out[:, :, c] = np.clip(map_coordinates(arr[:, :, c], [py, px], order=1, mode="nearest"), 0, 255).astype(np.uint8)

Image.fromarray(out).save(f"{OUT}/satellite.jpg", quality=88, optimize=True)
print("Saved satellite.jpg", cw, "x", ch, os.path.getsize(f"{OUT}/satellite.jpg"))
