"""P1: extract all relevant OSM features for Wuchang (+500 m buffer) from the read-only PBF.
Outputs categorised GeoJSON (WGS84) in data/raw/. Original OSM id and all tags are preserved."""
import osmium, json, os, collections
import shapely.wkb as wkb
from shapely.geometry import shape, mapping
from shapely.ops import transform
from shapely.prepared import prep
from pyproj import Transformer

SRC = r"D:\WuhanGIS\hubei-261109.osm.pbf"
ROOT = r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity\data\raw"
b = json.load(open(os.path.join(ROOT, "wuchang_boundary.geojson"), encoding="utf8"))
g = shape(b["geometry"])
to_m = Transformer.from_crs(4326, 32650, always_xy=True).transform
to_ll = Transformer.from_crs(32650, 4326, always_xy=True).transform
area = transform(to_ll, transform(to_m, g).buffer(500))
area_p = prep(area)
print("study bounds", area.bounds)

KEYS = ["building", "building:part", "highway", "railway", "waterway", "natural", "water", "landuse", "leisure",
        "amenity", "man_made", "bridge", "tunnel", "barrier", "power", "aeroway", "public_transport", "tourism",
        "historic", "shop", "office", "emergency", "place", "boundary", "route"]
LINE_KEYS = ("highway", "railway", "waterway", "power", "barrier", "man_made", "aeroway", "natural")
AREA_KEYS = ("building", "building:part", "landuse", "natural", "leisure", "water", "amenity", "man_made", "tourism",
             "historic", "aeroway", "public_transport", "railway", "waterway")


def cat_area(t):
    if "building:part" in t: return "building_parts"
    if "building" in t: return "buildings"
    if t.get("natural") == "water" or "water" in t or t.get("waterway") in ("riverbank", "dock") or t.get("landuse") in ("reservoir", "basin"):
        return "water_areas"
    if t.get("natural") in ("wood", "scrub", "grassland", "wetland", "heath", "bare_rock", "sand", "beach", "cliff") \
            or t.get("landuse") in ("forest", "grass", "meadow", "orchard", "vineyard", "farmland", "greenfield", "recreation_ground", "village_green", "cemetery", "flowerbed") \
            or t.get("leisure") in ("park", "garden", "pitch", "playground", "golf_course", "nature_reserve", "common"):
        return "green_areas"
    if "landuse" in t: return "landuse"
    if t.get("man_made") in ("bridge", "pier", "tower", "storage_tank", "chimney", "pier") or t.get("railway") == "platform" or t.get("public_transport"):
        return "structures"
    if "amenity" in t or "leisure" in t or "tourism" in t or "historic" in t or "aeroway" in t: return "other_areas"
    return None


def cat_line(t):
    if "highway" in t: return "roads"
    if "railway" in t: return "rails"
    if "waterway" in t: return "waterways"
    if "power" in t: return "power"
    if "barrier" in t: return "barriers"
    if t.get("man_made") in ("bridge", "pier", "embankment", "dyke", "breakwater", "groyne"): return "structures_lines"
    if t.get("natural") in ("coastline", "tree_row", "cliff"): return "natural_lines"
    if "aeroway" in t: return "aero_lines"
    return None


def cat_node(t):
    if t.get("natural") == "tree": return "trees"
    if "highway" in t or "railway" in t or "public_transport" in t or "power" in t or "emergency" in t or "barrier" in t: return "node_infra"
    if "natural" in t or "man_made" in t: return "node_nature_manmade"
    if any(k in t for k in ("amenity", "shop", "tourism", "historic", "office", "leisure", "place")): return "pois"
    return None


out = collections.defaultdict(list)
stat = collections.Counter()
wf = osmium.geom.WKBFactory()
fp = osmium.FileProcessor(SRC).with_locations().with_areas().with_filter(osmium.filter.KeyFilter(*KEYS))
for o in fp:
    t = {k.k: k.v for k in o.tags}
    try:
        if o.is_node():
            c = cat_node(t)
            if not c: continue
            if not area_p.contains(shapely_pt := __import__("shapely.geometry", fromlist=["Point"]).Point(o.location.lon, o.location.lat)): continue
            geom = shapely_pt; oid = f"node/{o.id}"
        elif o.is_way():
            if not any(k in t for k in LINE_KEYS): continue
            c = cat_line(t)
            if not c: continue
            from shapely.geometry import LineString
            geom = LineString([(n.lon, n.lat) for n in o.nodes]); oid = f"way/{o.id}"
            if len(geom.coords) < 2 or not area_p.intersects(geom): continue
        elif o.is_area():
            if not any(k in t for k in AREA_KEYS): continue
            if "highway" in t and t.get("area") != "yes": pass
            c = cat_area(t)
            if not c: continue
            geom = wkb.loads(wf.create_multipolygon(o), hex=True)
            oid = ("relation/" if o.from_way() is False else "way/") + str(o.orig_id())
            if not area_p.intersects(geom): continue
        else:
            continue
    except Exception as e:
        stat["error:" + type(e).__name__] += 1
        continue
    out[c].append({"type": "Feature", "geometry": mapping(geom), "properties": {"id": oid, **t}})
    stat[c] += 1

os.makedirs(os.path.join(ROOT, "osm"), exist_ok=True)
for c, feats in out.items():
    json.dump({"type": "FeatureCollection", "features": feats}, open(os.path.join(ROOT, "osm", c + ".geojson"), "w", encoding="utf8"), ensure_ascii=False)
json.dump(dict(stat), open(os.path.join(ROOT, "osm", "_stats.json"), "w"), indent=1)
print(dict(stat))
