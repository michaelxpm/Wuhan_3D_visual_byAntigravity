import requests, re
from concurrent.futures import ThreadPoolExecutor

u = "https://huggingface.co/datasets/zhu-xlab/GBA.LoD1/resolve/main/Polygon/asiaeast/e110_n35_e115_n30.geojson"
S = 5839547411
N = 200
pat = re.compile(r'"id":\s*"([^"]+)".*?\[\s*(12\d{6}\.\d+)\s*,\s*(3\d{6}\.\d+)', re.S)

def probe(i):
    b = int(S * i / N)
    try:
        r = requests.get(u, headers={"Range": f"bytes={b}-{b+2000}"}, timeout=15)
        m = pat.search(r.text)
        if m:
            return (i, m.group(1), float(m.group(2)), float(m.group(3)))
    except Exception:
        pass
    return (i, None, 0, 0)

with ThreadPoolExecutor(16) as ex:
    rows = list(ex.map(probe, range(N)))

for i, id_, x, y in rows[:25]:
    print(f"{i:3d}: id={id_} x={x:.0f} y={y:.0f}")
print("--- Near Wuhan (x in 12680000..12770000, y in 3540000..3610000) ---")
for i, id_, x, y in rows:
    if 12680000 <= x <= 12770000 and 3540000 <= y <= 3610000:
        print(f"{i:3d}: id={id_} x={x:.0f} y={y:.0f}")
