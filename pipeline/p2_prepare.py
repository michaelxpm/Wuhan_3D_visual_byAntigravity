"""P2b: turn raw OSM + DEM + GBA heights into compact, local-metre web data (web/public/data)."""
import json, os, math, random, collections
import numpy as np
import rasterio
from scipy.ndimage import gaussian_filter, map_coordinates
from shapely.geometry import shape, Polygon, MultiPolygon, LineString, Point, box, mapping
from shapely.ops import transform, unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree
from shapely import make_valid
from pyproj import Transformer

P = r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity"
RAW = f"{P}/data/raw"
OUT = f"{P}/web/public/data"
os.makedirs(OUT, exist_ok=True)
random.seed(7)
np.random.seed(7)

to_utm = Transformer.from_crs(4326, 32650, always_xy=True).transform
to_ll = Transformer.from_crs(32650, 4326, always_xy=True).transform

# ---- region & origin
bd = shape(json.load(open(f"{RAW}/wuchang_boundary.geojson", encoding="utf8"))["geometry"])
main = max(bd.geoms, key=lambda p: p.area) if hasattr(bd, "geoms") else bd
main_m = transform(to_utm, main)
ox, oy = main_m.centroid.x, main_m.centroid.y
OLON, OLAT = to_ll(ox, oy)
print("origin", OLON, OLAT)


def loc(x, y, z=None):
    return (x - ox, y - oy)


def to_local(geom_ll):
    return transform(lambda x, y, z=None: (np.array(to_utm(x, y)[0]) - ox, np.array(to_utm(x, y)[1]) - oy), geom_ll)


def fwd(g):  # lonlat geom -> local meters
    def f(x, y, z=None):
        X, Y = to_utm(x, y)
        return (np.asarray(X) - ox, np.asarray(Y) - oy)
    return transform(f, g)


main_loc = fwd(main)
region = main_loc.buffer(500)           # content region (agreed: boundary + 500 m)
rp = prep(region)
view_region = main_loc.buffer(1500)     # soft context (terrain / water only)
print("region bounds", region.bounds)


def rd(v, n=1):
    return round(float(v), n)


def load(name):
    p = f"{RAW}/osm/{name}.geojson"
    return json.load(open(p, encoding="utf8"))["features"] if os.path.exists(p) else []


def polys_of(g):
    if g.is_empty: return []
    if isinstance(g, Polygon): return [g]
    if isinstance(g, MultiPolygon): return list(g.geoms)
    return [x for x in getattr(g, "geoms", []) if isinstance(x, Polygon)]


def poly_json(p, nd=1):
    return {"o": [rd(c, nd) for xy in p.exterior.coords[:-1] for c in xy],
            "h": [[rd(c, nd) for xy in r.coords[:-1] for c in xy] for r in p.interiors]}


def num(v):
    if v is None: return None
    try:
        s = str(v).lower().replace("m", "").replace(" ", "").replace(",", ".")
        return float(s.split(";")[0])
    except Exception:
        return None


def clean_poly(g, clip):
    if not g.is_valid: g = make_valid(g)
    g = g.intersection(clip)
    return [p for p in polys_of(g) if p.area > 1.0]


# =============== TERRAIN ===============
with rasterio.open(f"{RAW}/dem_N30_E114.tif") as ds:
    dem = ds.read(1).astype("float32")
    tr = ds.transform
vb = view_region.bounds
res = 25.0
xs = np.arange(math.floor(vb[0] / res) * res, vb[2] + res, res)
ys = np.arange(math.floor(vb[1] / res) * res, vb[3] + res, res)
X, Y = np.meshgrid(xs, ys)
LON, LAT = to_ll(X + ox, Y + oy)
col = (np.asarray(LON) - tr.c) / tr.a
row = (np.asarray(LAT) - tr.f) / tr.e
Z = map_coordinates(dem, [row - 0.5, col - 0.5], order=1, mode="nearest").astype("float32")
Zs = gaussian_filter(Z, 2.0)  # DSM->approx DTM: suppress building/tree roofs
# water mask from OSM water polygons
water_feats = load("water_areas")
wpolys = []
for f in water_feats:
    try:
        wpolys += clean_poly(fwd(shape(f["geometry"])), view_region)
    except Exception: pass
wunion = unary_union(wpolys) if wpolys else Polygon()
from rasterio import features as rfeat
from affine import Affine
aff = Affine(res, 0, xs[0] - res / 2, 0, res, ys[0] - res / 2)
wmask = rfeat.rasterize([(mapping(wunion), 1)], out_shape=Z.shape, transform=aff, fill=0, dtype="uint8").astype(bool)
level = float(np.median(Z[wmask])) if wmask.any() else 19.0
print("water level approx", level, "dem range", float(Zs.min()), float(Zs.max()))
Zt = Zs.copy()
Zt[Zt < level] = level
land = gaussian_filter((~wmask).astype("float32"), 1.5)
Zt = np.where(wmask, level - 4.0, Zt)
# blend bank (soft shoreline)
Zt = np.where(~wmask, np.maximum(Zt, level + 0.3), Zt).astype("float32")
Zt.tofile(f"{OUT}/terrain.bin")
terrain_meta = {"nx": int(len(xs)), "ny": int(len(ys)), "res": res, "x0": float(xs[0]), "y0": float(ys[0]), "level": level}
print("terrain", terrain_meta)


def ground(x, y):
    c = (x - xs[0]) / res; r = (y - ys[0]) / res
    return float(map_coordinates(Zt, [[r], [c]], order=1, mode="nearest")[0])


# =============== BUILDINGS ===============
gba = json.load(open(f"{RAW}/gba_wuchang.json")) if os.path.exists(f"{RAW}/gba_wuchang.json") else []
gba_osm = {g["id"]: g for g in gba if g["src"] == "osm"}
gba_ms = [g for g in gba if g["src"] != "osm"]
print("gba osm", len(gba_osm), "gba other", len(gba_ms))

TYPE_H = {"house": 8, "detached": 7, "semidetached_house": 8, "terrace": 8, "residential": 20, "apartments": 28, "dormitory": 20,
          "retail": 12, "commercial": 24, "office": 36, "hotel": 36, "university": 20, "school": 14, "kindergarten": 8, "hospital": 22,
          "industrial": 10, "warehouse": 9, "roof": 4, "garage": 3, "garages": 3, "shed": 3, "hut": 3, "service": 6, "civic": 14,
          "public": 14, "church": 14, "temple": 12, "train_station": 14, "stadium": 20, "yes": 14, "construction": 6, "carport": 3}

bparts = load("building_parts")
parts_geo = []
for f in bparts:
    try:
        parts_geo.append(fwd(shape(f["geometry"])))
    except Exception: pass
parts_tree = STRtree(parts_geo) if parts_geo else None

buildings = []
osm_geoms = []
stats = collections.Counter()


def resolve_height(t, oid, area):
    h = num(t.get("height"))
    if h and h > 0: return h, "osm_height"
    lv = num(t.get("building:levels"))
    if lv and lv > 0:
        return lv * 3.2 + (num(t.get("roof:levels")) or 0) * 2.5, "osm_levels"
    gid = oid.split("/")[-1]
    g = gba_osm.get(gid)
    if g and g.get("h") and g["h"] >= 2.5: return float(g["h"]), "gba"
    return TYPE_H.get(t.get("building"), 12), "type_estimate"


def add_building(poly, props, h, src, has_parts=False, minh=0.0, partflag=False):
    for p in poly:
        d = poly_json(p, 1)
        b = {"id": props.get("id", ""), **d, "ht": rd(h, 1), "src": src}
        if minh: b["mh"] = rd(minh, 1)
        for k_out, k_in in (("ty", "building"), ("nm", "name"), ("rs", "roof:shape"), ("rc", "roof:colour"), ("bc", "building:colour"), ("bm", "building:material")):
            v = props.get(k_in)
            if v: b[k_out] = v
        rh = num(props.get("roof:height"))
        if rh: b["rh"] = rd(rh, 1)
        if partflag: b["part"] = 1
        buildings.append(b)


bfeats = load("buildings")
for f in bfeats:
    t = f["properties"]
    try:
        g = fwd(shape(f["geometry"]))
        polys = clean_poly(g, region)
        if not polys: continue
        stats["osm_buildings"] += 1
        a = sum(p.area for p in polys)
        h, src = resolve_height(t, t["id"], a)
        # skip outline if building:parts exist inside (parts carry the real geometry)
        skip = False
        if parts_tree is not None:
            idx = parts_tree.query(g)
            cov = sum(parts_geo[i].intersection(g).area for i in idx if parts_geo[i].intersects(g)) if len(idx) else 0
            if g.area > 0 and cov / g.area > 0.5: skip = True
        osm_geoms.append(g)
        if skip:
            stats["outline_skipped_has_parts"] += 1
            continue
        add_building(polys, t, h, src)
        stats["h_" + src] += 1
    except Exception as e:
        stats["bld_err"] += 1

for f in bparts:
    t = f["properties"]
    try:
        polys = clean_poly(fwd(shape(f["geometry"])), region)
        if not polys: continue
        h = num(t.get("height")) or ((num(t.get("building:levels")) or 0) * 3.2) or 8
        mh = num(t.get("min_height")) or ((num(t.get("building:min_level")) or 0) * 3.2)
        t2 = dict(t); t2["building"] = t.get("building:part")
        add_building(polys, t2, h, "osm_part", minh=mh, partflag=True)
        stats["parts"] += 1
    except Exception: stats["part_err"] += 1

# footprints from GBA (Microsoft) not present in OSM
osm_tree = STRtree(osm_geoms)
added = 0
for gdict in gba_ms:
    try:
        gl = fwd(Polygon(gdict["ring"]))
        if not gl.is_valid: gl = make_valid(gl)
        if gl.area < 15 or not rp.intersects(gl): continue
        idx = osm_tree.query(gl)
        ov = sum(osm_geoms[i].intersection(gl).area for i in idx)
        if ov / gl.area > 0.2: continue
        h = gdict.get("h")
        if not h or h < 2.5: continue
        polys = clean_poly(gl, region)
        add_building(polys, {"id": "gba/" + gdict["id"], "building": "yes"}, float(h), "gba_footprint")
        added += 1
    except Exception: stats["gba_err"] += 1
stats["gba_footprints_added"] = added
print("buildings", len(buildings), dict(stats))
json.dump(buildings, open(f"{OUT}/buildings.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))

# =============== AREAS (water, green, landuse) ===============
def dump_areas(name, feats, clip, keyfn):
    out = []
    for f in feats:
        t = f["properties"]
        try:
            for p in clean_poly(fwd(shape(f["geometry"])), clip):
                out.append({**poly_json(p, 1), "k": keyfn(t), "nm": t.get("name", "")})
        except Exception: pass
    json.dump(out, open(f"{OUT}/{name}.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(name, len(out))
    return out


def water_kind(t): return t.get("water") or t.get("natural") or t.get("waterway") or "water"
def green_kind(t): return t.get("landuse") or t.get("natural") or t.get("leisure") or "green"
def lu_kind(t): return t.get("landuse")


dump_areas("water", water_feats, view_region, water_kind)
green = dump_areas("green", load("green_areas"), region, green_kind)
dump_areas("landuse", load("landuse"), region, lu_kind)
dump_areas("other_areas", load("other_areas"), region, lambda t: t.get("amenity") or t.get("leisure") or t.get("tourism") or "other")
dump_areas("structures", load("structures"), region, lambda t: t.get("man_made") or t.get("railway") or "structure")

# =============== LINES ===============
ROAD_W = {"motorway": 14, "motorway_link": 7, "trunk": 13, "trunk_link": 7, "primary": 11, "primary_link": 6.5, "secondary": 9.5,
          "secondary_link": 6, "tertiary": 8, "tertiary_link": 5.5, "residential": 6, "unclassified": 6, "living_street": 5, "service": 4,
          "pedestrian": 5, "footway": 1.8, "path": 1.5, "steps": 1.6, "cycleway": 2.2, "track": 3, "corridor": 2, "bridleway": 1.5}
roads = []
rstat = collections.Counter()
for f in load("roads"):
    t = f["properties"]
    hw = t.get("highway")
    if hw not in ROAD_W: rstat["skip_" + str(hw)] += 1; continue
    try:
        g = fwd(shape(f["geometry"]))
        if not rp.intersects(g): continue
        g = g.intersection(region) if not region.contains(g) else g
        for ln in (g.geoms if hasattr(g, "geoms") else [g]):
            if ln.length < 1 or ln.geom_type != "LineString": continue
            ln = ln.simplify(0.3)
            w = ROAD_W[hw]
            lanes = num(t.get("lanes"))
            if lanes and hw not in ("footway", "path", "steps", "cycleway"): w = max(w, lanes * 3.4)
            ww = num(t.get("width"))
            if ww and 1 < ww < 40: w = ww
            r = {"id": t["id"], "c": hw, "w": rd(w, 1), "p": [rd(c, 1) for xy in ln.coords for c in xy]}
            br = t.get("bridge"); tn = t.get("tunnel")
            if br and br != "no": r["br"] = 1
            if tn and tn not in ("no",): r["tn"] = 1
            lyr = num(t.get("layer"))
            if lyr: r["ly"] = int(lyr)
            if t.get("name"): r["nm"] = t["name"]
            if t.get("oneway") in ("yes", "1"): r["ow"] = 1
            if t.get("surface"): r["sf"] = t["surface"]
            roads.append(r); rstat[hw] += 1
    except Exception: rstat["err"] += 1
json.dump(roads, open(f"{OUT}/roads.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print("roads", len(roads), dict(rstat.most_common(8)))


def dump_lines(name, feats, clip, keyfn, extra=()):
    out = []
    for f in feats:
        t = f["properties"]
        try:
            g = fwd(shape(f["geometry"]))
            if not clip.intersects(g): continue
            g = g.intersection(clip)
            for ln in (g.geoms if hasattr(g, "geoms") else [g]):
                if ln.geom_type != "LineString" or ln.length < 1: continue
                o = {"k": keyfn(t), "p": [rd(c, 1) for xy in ln.simplify(0.3).coords for c in xy]}
                for e in extra:
                    if t.get(e): o[e] = t[e]
                out.append(o)
        except Exception: pass
    json.dump(out, open(f"{OUT}/{name}.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(name, len(out))


dump_lines("rails", load("rails"), region, lambda t: t.get("railway"), ("bridge", "tunnel", "layer", "service", "name"))
dump_lines("waterways", load("waterways"), view_region, lambda t: t.get("waterway"), ("name", "width"))
dump_lines("barriers", load("barriers"), region, lambda t: t.get("barrier"))
dump_lines("natural_lines", load("natural_lines"), region, lambda t: t.get("natural"))
dump_lines("structures_lines", load("structures_lines"), region, lambda t: t.get("man_made"))
dump_lines("power", load("power"), region, lambda t: t.get("power"))

# =============== POINTS ===============
def dump_points(name, feats, keyfn, keep=()):
    out = []
    for f in feats:
        t = f["properties"]
        x, y = f["geometry"]["coordinates"][:2]
        X, Y = to_utm(x, y)
        X -= ox; Y -= oy
        if not rp.contains(Point(X, Y)): continue
        o = {"x": rd(X, 1), "y": rd(Y, 1), "k": keyfn(t)}
        for e in keep:
            if t.get(e): o[e] = t[e]
        out.append(o)
    json.dump(out, open(f"{OUT}/{name}.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(name, len(out))
    return out


trees = dump_points("trees_osm", load("trees"), lambda t: t.get("species") or "tree")
dump_points("pois", load("pois"), lambda t: t.get("amenity") or t.get("shop") or t.get("tourism") or t.get("historic") or t.get("place") or "poi", ("name", "name:en"))
dump_points("infra", load("node_infra"), lambda t: t.get("highway") or t.get("railway") or t.get("public_transport") or t.get("power") or t.get("barrier") or "infra", ("name",))

# Spatial clearance index: never place synthetic trees on roads or inside buildings
road_bufs = []
for r in roads:
    if r.get("tn"): continue
    try:
        ln = LineString(list(zip(r["p"][0::2], r["p"][1::2])))
        road_bufs.append(ln.buffer(r["w"] / 2 + 1.4, cap_style=2))
    except Exception: pass
road_tree = STRtree(road_bufs) if road_bufs else None

bld_polys = []
for b in buildings:
    try:
        bld_polys.append(Polygon(list(zip(b["o"][0::2], b["o"][1::2]))))
    except Exception: pass
bld_tree = STRtree(bld_polys) if bld_polys else None

def is_clear_for_tree(x, y):
    pt = Point(x, y)
    if road_tree is not None:
        for i in road_tree.query(pt):
            if road_bufs[i].contains(pt): return False
    if bld_tree is not None:
        for i in bld_tree.query(pt):
            if bld_polys[i].contains(pt): return False
    return True

# synthetic trees: parks / woods / grass strips (marked synthetic)
syn = []
dens = {"wood": 1 / 75, "forest": 1 / 75, "scrub": 1 / 160, "park": 1 / 200, "garden": 1 / 240, "grass": 1 / 450, "meadow": 1 / 500}
for gdict in green:
    d = dens.get(gdict["k"], 0)
    if d <= 0: continue
    try:
        p = Polygon(gdict["o"][0::2] and list(zip(gdict["o"][0::2], gdict["o"][1::2])), [list(zip(h[0::2], h[1::2])) for h in gdict["h"]])
        if not p.is_valid: p = make_valid(p)
        n = min(int(p.area * d), 4000)
        minx, miny, maxx, maxy = p.bounds
        pp = prep(p); k = 0; tries = 0
        while k < n and tries < n * 6:
            tries += 1
            x, y = random.uniform(minx, maxx), random.uniform(miny, maxy)
            if pp.contains(Point(x, y)) and is_clear_for_tree(x, y):
                syn.append({"x": rd(x, 1), "y": rd(y, 1), "s": round(random.uniform(0.75, 1.3), 2)}); k += 1
    except Exception: pass
# street trees along roads (offset onto roadside green strip, 14m spacing, strictly road-clear)
for r in roads:
    if r["c"] in ("primary", "secondary", "tertiary", "residential", "trunk", "unclassified") and not r.get("br") and not r.get("tn"):
        ln = LineString(list(zip(r["p"][0::2], r["p"][1::2])))
        off = r["w"] / 2 + 2.4
        for side in (1, -1):
            try:
                oc = ln.parallel_offset(off, "left" if side == 1 else "right", join_style=2)
            except Exception: continue
            for seg in (oc.geoms if hasattr(oc, "geoms") else [oc]):
                if seg.geom_type != "LineString": continue
                L = seg.length
                d = random.uniform(0, 14)
                while d < L:
                    pt = seg.interpolate(d)
                    if is_clear_for_tree(pt.x, pt.y):
                        syn.append({"x": rd(pt.x, 1), "y": rd(pt.y, 1), "s": round(random.uniform(0.75, 1.15), 2)})
                    d += 14
            if len(syn) > 150000: break
json.dump(syn, open(f"{OUT}/trees_synthetic.json", "w"), separators=(",", ":"))
print("synthetic trees (road-clear)", len(syn))

meta = {"origin_lonlat": [OLON, OLAT], "origin_utm50n": [ox, oy], "terrain": terrain_meta,
        "region_bounds": list(region.bounds), "view_bounds": list(view_region.bounds),
        "main_boundary": [[rd(x, 1), rd(y, 1)] for x, y in main_loc.exterior.coords],
        "stats": dict(stats), "attribution": "© OpenStreetMap contributors (ODbL); GlobalBuildingAtlas (TUM) heights; Copernicus DEM GLO-30"}
json.dump(meta, open(f"{OUT}/meta.json", "w", encoding="utf8"), ensure_ascii=False, indent=1)
print("done")
