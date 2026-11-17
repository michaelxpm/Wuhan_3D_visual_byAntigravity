import json, collections, os
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from shapely.geometry import shape
R = r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity\data\raw"
L = lambda n: json.load(open(f"{R}/osm/{n}.geojson", encoding="utf8"))["features"]
b = L("buildings")
c = collections.Counter()
for f in b:
    p = f["properties"]
    c["height" if "height" in p else "levels" if "building:levels" in p else "none"] += 1
print("buildings", len(b), dict(c))
print("types", collections.Counter(f["properties"]["building"] for f in b).most_common(12))
print("road classes", collections.Counter(f["properties"]["highway"] for f in L("roads")).most_common(12))
fig, ax = plt.subplots(figsize=(14, 14))
bd = json.load(open(f"{R}/wuchang_boundary.geojson", encoding="utf8"))
def poly(g, **k):
    for p in (g.geoms if hasattr(g, "geoms") else [g]):
        ax.fill(*p.exterior.xy, **k)
for f in L("water_areas"): poly(shape(f["geometry"]), fc="#9cc", lw=0)
for f in L("green_areas"): poly(shape(f["geometry"]), fc="#bda", lw=0)
for f in b: poly(shape(f["geometry"]), fc="#555", lw=0)
for f in L("roads"):
    x, y = shape(f["geometry"]).xy; ax.plot(x, y, c="#c80", lw=.3)
g = shape(bd["geometry"])
for p in (g.geoms if hasattr(g, "geoms") else [g]): ax.plot(*p.exterior.xy, c="r", lw=1)
ax.set_aspect(1/0.86); plt.savefig(r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity\data\raw\preview.png", dpi=90)
