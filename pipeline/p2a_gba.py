"""P2a: keep only GBA ODbL polygons + LoD1 heights that fall in the Wuchang study area.
Output data/raw/gba_wuchang.json : [{src,id,h,var,ring:[[lon,lat],...]}]"""
import json
import ijson
from shapely.geometry import shape, Polygon
from shapely.ops import transform
from shapely.prepared import prep
from pyproj import Transformer

ROOT = r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity\data\raw"
b = json.load(open(f"{ROOT}/wuchang_boundary.geojson", encoding="utf8"))
g = shape(b["geometry"])
main = max(g.geoms, key=lambda p: p.area) if hasattr(g, "geoms") else g
to_m = Transformer.from_crs(4326, 32650, always_xy=True).transform
to_ll = Transformer.from_crs(32650, 4326, always_xy=True).transform
study = transform(to_ll, transform(to_m, main).buffer(500))
sp = prep(study)
t = Transformer.from_crs(3857, 4326, always_xy=True).transform
print("study bounds", study.bounds)

# 1) polygons in study area
need = {}
n = 0
with open(f"{ROOT}/gba/odbl.geojson", "rb") as f:
    for ft in ijson.items(f, "features.item", use_float=True):
        n += 1
        p = ft["properties"]
        geom = ft["geometry"]
        if geom["type"] != "Polygon":
            continue
        x, y = geom["coordinates"][0][0]
        lon, lat = t(x, y)
        bx = study.bounds
        if not (bx[0] <= lon <= bx[2] and bx[1] <= lat <= bx[3]):
            continue
        poly = Polygon([t(*c) for c in geom["coordinates"][0]])
        if not sp.intersects(poly):
            continue
        key = f'{p["source"]}{p["id"]}{p["region"]}'
        need[key] = {"src": p["source"], "id": p["id"], "ring": [[round(a, 7), round(c, 7)] for a, c in poly.exterior.coords]}
print("polygons scanned", n, "kept", len(need))

# 2) heights for those keys only
found = 0
with open(f"{ROOT}/gba/lod1.json", "rb") as f:
    for k, v in ijson.kvitems(f, "", use_float=True):
        if k in need:
            need[k]["h"] = v.get("height")
            need[k]["var"] = v.get("var")
            found += 1
print("heights found", found)
out = list(need.values())
json.dump(out, open(f"{ROOT}/gba_wuchang.json", "w"))
import collections
print(collections.Counter(o["src"] for o in out), "with height", sum(1 for o in out if o.get("h") is not None))
