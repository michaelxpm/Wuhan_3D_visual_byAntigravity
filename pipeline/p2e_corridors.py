"""Stitch main drivable road segments from web/public/data/roads.json into long
continuous city-spanning corridors (web/public/data/corridors.json) so cars and
buses travel across Wuchang without vanishing at mid-city junctions."""
import json, math, os, collections

P = r"D:\coding\2611-3D-wuhan-visual--map-byAntigravity\web\public\data"
roads = json.load(open(f"{P}/roads.json", encoding="utf8"))

MAIN = {"motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link", "secondary", "secondary_link", "tertiary"}
RANK = {"motorway": 4, "trunk": 4, "primary": 3, "secondary": 2, "tertiary": 1}

def nkey(x, y):
    return (round(x * 5), round(y * 5))

def unit_vec(p0, p1):
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    l = math.hypot(dx, dy) or 1.0
    return (dx / l, dy / l)

# Build undirected/directed edge list
segs = []
adj = collections.defaultdict(list)
for r in roads:
    if r.get("tn") or r["c"] not in MAIN:
        continue
    p = r["p"]
    pts = [(p[i], p[i + 1]) for i in range(0, len(p), 2)]
    if len(pts) < 2:
        continue
    length = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))
    if length < 3:
        continue
    sid = len(segs)
    segs.append({
        "pts": pts, "c": r["c"], "br": 1 if r.get("br") else 0,
        "ly": r.get("ly", 0), "ow": 1 if r.get("ow") else 0,
        "nm": r.get("nm", ""), "len": length
    })
    k0, k1 = nkey(*pts[0]), nkey(*pts[-1])
    adj[k0].append((sid, 0))  # 0 = forward from pts[0]
    if not r.get("ow"):
        adj[k1].append((sid, 1))  # 1 = reverse from pts[-1]

used = set()
corridors = []

def walk(start_sid, start_dir):
    chain = []
    cur_sid, cur_dir = start_sid, start_dir
    while True:
        used.add(cur_sid)
        s = segs[cur_sid]
        pts = s["pts"] if cur_dir == 0 else list(reversed(s["pts"]))
        chain.append({"pts": pts, "br": s["br"], "ly": s["ly"], "c": s["c"], "len": s["len"]})
        end_k = nkey(*pts[-1])
        out_v = unit_vec(pts[-2], pts[-1])
        # Pick straightest unused continuing segment
        best = None
        best_score = -9.0
        for nsid, ndir in adj[end_k]:
            if nsid in used:
                continue
            ns = segs[nsid]
            npts = ns["pts"] if ndir == 0 else list(reversed(ns["pts"]))
            in_v = unit_vec(npts[0], npts[1])
            dot = out_v[0] * in_v[0] + out_v[1] * in_v[1]
            if dot < 0.25:
                continue
            score = dot
            if ns["nm"] and ns["nm"] == s["nm"]:
                score += 0.5
            if RANK.get(ns["c"], 0) == RANK.get(s["c"], 0):
                score += 0.2
            if ns["br"] == s["br"]:
                score += 0.1
            if score > best_score:
                best_score = score
                best = (nsid, ndir)
        if not best:
            break
        cur_sid, cur_dir = best
    return chain

# Prefer starting from motorway/trunk/primary boundary nodes (degree 1) then remaining high-class segments
order = sorted(range(len(segs)), key=lambda i: (-RANK.get(segs[i]["c"], 0), len(adj[nkey(*segs[i]["pts"][0])]), -segs[i]["len"]))
for sid in order:
    if sid in used:
        continue
    s = segs[sid]
    # Walk forward and also try extending backward if two-way
    fwd = walk(sid, 0)
    total_len = sum(x["len"] for x in fwd)
    if total_len >= 450:
        # Pack into compact segments list: each sub-seg has [br, ly, flat_xy]
        corridors.append({
            "len": round(total_len, 1),
            "c": fwd[0]["c"],
            "ow": s["ow"],
            "segs": [{"br": x["br"], "ly": x["ly"], "p": [round(v, 1) for pt in x["pts"] for v in pt]} for x in fwd]
        })

corridors.sort(key=lambda c: -c["len"])
corridors = corridors[:180]
json.dump(corridors, open(f"{P}/corridors.json", "w", encoding="utf8"), separators=(",", ":"))
print(f"Saved {len(corridors)} corridors; longest={corridors[0]['len']}m, median={corridors[len(corridors)//2]['len']}m, total_kb={round(os.path.getsize(f'{P}/corridors.json')/1024,1)}")
