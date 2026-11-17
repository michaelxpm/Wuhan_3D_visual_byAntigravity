"""Find and download ONLY the byte blocks of GBA Polygon (e110_n35_e115_n30.geojson)
that fall in/near Wuchang District, using HTTP Range probes, then enrich with local lod1.json."""
import json, re, os
import ijson
import requests
from concurrent.futures import ThreadPoolExecutor
from shapely.geometry import shape, Polygon
from shapely.ops import transform
from shapely.prepared import prep
from pyproj import Transformer

ROOT = r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity\data\raw"
URL = "https://huggingface.co/datasets/zhu-xlab/GBA.LoD1/resolve/main/Polygon/asiaeast/e110_n35_e115_n30.geojson"
S = 5839547411
BLOCK = 3_000_000  # 3 MB
NB = (S + BLOCK - 1) // BLOCK

b = json.load(open(f"{ROOT}/wuchang_boundary.geojson", encoding="utf8"))
g = shape(b["geometry"])
main = max(g.geoms, key=lambda p: p.area) if hasattr(g, "geoms") else g
to_m = Transformer.from_crs(4326, 32650, always_xy=True).transform
to_ll = Transformer.from_crs(32650, 4326, always_xy=True).transform
study = transform(to_ll, transform(to_m, main).buffer(500))
sp = prep(study)
t3857 = Transformer.from_crs(3857, 4326, always_xy=True).transform

pat_xy = re.compile(r"\[\s*(12\d{6}\.\d+)\s*,\s*(3\d{6}\.\d+)")
session_local = __import__("threading").local()

def get_sess():
    if not hasattr(session_local, "s"):
        session_local.s = requests.Session()
    return session_local.s

def probe(idx):
    byte0 = idx * BLOCK
    try:
        r = get_sess().get(URL, headers={"Range": f"bytes={byte0}-{byte0+600}"}, timeout=12)
        for m in pat_xy.finditer(r.text):
            x, y = float(m.group(1)), float(m.group(2))
            if 12705000 <= x <= 12750000 and 3555000 <= y <= 3595000:
                return idx
    except Exception:
        pass
    return None

print(f"Probing {NB} blocks of 3MB across 5.84GB...")
with ThreadPoolExecutor(32) as ex:
    hits = [i for i in ex.map(probe, range(NB)) if i is not None]

# Expand by +-1 block around each hit to catch boundary-crossing runs
blocks = sorted({j for i in hits for j in (i - 1, i, i + 1) if 0 <= j < NB})
print(f"Direct hits: {len(hits)}, expanded blocks to fetch: {len(blocks)} ({len(blocks)*3} MB)")

# Merge contiguous block ranges
ranges = []
for b_idx in blocks:
    b0, b1 = b_idx * BLOCK, min(S - 1, (b_idx + 1) * BLOCK - 1)
    if ranges and b0 <= ranges[-1][1] + 1:
        ranges[-1][1] = b1
    else:
        ranges.append([b0, b1])
print(f"Merged into {len(ranges)} contiguous byte ranges")

need = {}
bx = study.bounds

def fetch_range(rg):
    b0, b1 = rg
    # expand by 4KB on both sides so we don't miss a line on a block boundary
    s0 = max(0, b0 - 4096)
    s1 = min(S - 1, b1 + 4096)
    r = get_sess().get(URL, headers={"Range": f"bytes={s0}-{s1}"}, timeout=90)
    lines = r.content.decode("utf8", errors="ignore").splitlines()
    local_kept = {}
    for ln in lines:
        ln = ln.strip().rstrip(",")
        if not (ln.startswith("{") and ln.endswith("}") and '"Feature"' in ln):
            continue
        # quick string check for x prefix "1272" or "1273"
        if "1271" not in ln and "1272" not in ln and "1273" not in ln and "1274" not in ln:
            continue
        try:
            ft = json.loads(ln)
            geom = ft["geometry"]
            if geom["type"] != "Polygon":
                continue
            ring3857 = geom["coordinates"][0]
            lon, lat = t3857(ring3857[0][0], ring3857[0][1])
            if not (bx[0] <= lon <= bx[2] and bx[1] <= lat <= bx[3]):
                continue
            poly = Polygon([t3857(c[0], c[1]) for c in ring3857])
            if not sp.intersects(poly):
                continue
            p = ft["properties"]
            key = f'{p["source"]}{p["id"]}{p["region"]}'
            local_kept[key] = {
                "src": p["source"],
                "id": p["id"],
                "ring": [[round(a, 7), round(c, 7)] for a, c in poly.exterior.coords],
            }
        except Exception:
            pass
    return local_kept

with ThreadPoolExecutor(8) as ex:
    for d in ex.map(fetch_range, ranges):
        need.update(d)

print("Wuchang GBA extra polygons kept:", len(need))

if need:
    found = 0
    with open(f"{ROOT}/gba/lod1.json", "rb") as f:
        for k, v in ijson.kvitems(f, "", use_float=True):
            if k in need:
                need[k]["h"] = v.get("height")
                need[k]["var"] = v.get("var")
                found += 1
    print("Heights matched from lod1.json:", found)

# Merge with existing gba_wuchang.json (ODbL)
odbl = json.load(open(f"{ROOT}/gba_wuchang.json", encoding="utf8")) if os.path.exists(f"{ROOT}/gba_wuchang.json") else []
merged = {f'{o["src"]}_{o["id"]}': o for o in odbl}
for o in need.values():
    merged[f'{o["src"]}_{o["id"]}'] = o
out = list(merged.values())
json.dump(out, open(f"{ROOT}/gba_wuchang.json", "w"))
print("Saved total gba_wuchang.json:", len(out))
