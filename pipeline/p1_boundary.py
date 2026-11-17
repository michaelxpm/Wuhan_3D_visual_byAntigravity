"""Find Wuchang District boundary (admin_level=6) in the Hubei PBF (read-only) and save as GeoJSON."""
import osmium, json, shapely.wkb as wkb, shapely
from shapely.geometry import mapping

SRC = r"D:\WuhanGIS\hubei-261109.osm.pbf"
OUT = r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity\data\raw\wuchang_boundary.geojson"
wf = osmium.geom.WKBFactory()
cands = []
for o in osmium.FileProcessor(SRC).with_locations().with_areas().with_filter(osmium.filter.KeyFilter("boundary")):
    if o.is_area() and o.tags.get("boundary") == "administrative" and "武昌" in (o.tags.get("name") or ""):
        g = wkb.loads(wf.create_multipolygon(o), hex=True)
        cands.append((o.tags.get("admin_level"), o.tags.get("name"), o.orig_id(), g))
        print(o.tags.get("admin_level"), o.tags.get("name"), o.orig_id(), round(g.area * 111 * 96, 1), "km2")
best = [c for c in cands if c[0] == "6" and c[1] == "武昌区"]
assert best, "boundary not found"
lvl, name, rid, g = best[0]
json.dump({"type": "Feature", "properties": {"name": name, "relation": rid}, "geometry": mapping(g)},
          open(OUT, "w", encoding="utf8"))
print("bounds", g.bounds)
