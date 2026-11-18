import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const $ = (id) => document.getElementById(id);
const setMsg = (m) => ($('lmsg').textContent = m);
const BASE = import.meta.env.BASE_URL;
const J = async (n) => (await fetch(`${BASE}data/${n}.json`)).json();

// ------------------------------------------------------------------ renderer
const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: params.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 2, 60000);
scene.fog = new THREE.FogExp2(0xbfd2e0, 0.00006);

const sky = new Sky();
sky.scale.setScalar(50000);
scene.add(sky);
const sun = new THREE.DirectionalLight(0xfff2dd, 3.0);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6b6a58, 0.9);
scene.add(hemi);

const world = new THREE.Group();
scene.add(world);
const layers = { buildings: new THREE.Group(), roads: new THREE.Group(), water: new THREE.Group(), trees: new THREE.Group(), rails: new THREE.Group(), traffic: new THREE.Group(), poi: new THREE.Group(), terrain: new THREE.Group(), misc: new THREE.Group() };
for (const g of Object.values(layers)) world.add(g);

// ------------------------------------------------------------------ data
setMsg('loading data…');
const meta = await J('meta');
const T = meta.terrain;
const terrainRaw = new Float32Array(await (await fetch(`${BASE}data/terrain.bin`)).arrayBuffer());
const wl = T.level;

function ground(x, y) {
  let c = (x - T.x0) / T.res, r = (y - T.y0) / T.res;
  c = Math.max(0, Math.min(T.nx - 1.001, c)); r = Math.max(0, Math.min(T.ny - 1.001, r));
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
  const z = (rr, cc) => terrainRaw[rr * T.nx + cc];
  return (z(r0, c0) * (1 - fc) + z(r0, c0 + 1) * fc) * (1 - fr) + (z(r0 + 1, c0) * (1 - fc) + z(r0 + 1, c0 + 1) * fc) * fr;
}
const W = (x, y, h) => new THREE.Vector3(x, h, -y); // local(east,north) -> three

const gltfLoader = new GLTFLoader();
const loadGltf = (path) => gltfLoader.loadAsync(`${BASE}${path}`).catch(() => null);
const [buildings, roads, water, green, landuse, rails, trees1, trees2, pois, waterways, structures, otherAreas, corridors, satTex, busGltf, treeGltf, carGltf] = await Promise.all([
  ...['buildings', 'roads', 'water', 'green', 'landuse', 'rails', 'trees_osm', 'trees_synthetic', 'pois', 'waterways', 'structures', 'other_areas', 'corridors'].map(J),
  new THREE.TextureLoader().loadAsync(`${BASE}data/satellite.jpg`),
  loadGltf('models/bus/scene.gltf'),
  loadGltf('models/tree/scene.gltf'),
  loadGltf('models/car/scene.gltf')
]);
satTex.colorSpace = THREE.SRGBColorSpace;
satTex.anisotropy = 8;
satTex.generateMipmaps = true;
satTex.minFilter = THREE.LinearMipmapLinearFilter;
setMsg('building scene…');

const CELL = 1000;
const cellKey = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;

// ------------------------------------------------------------------ ground texture
function polyPath(ctx, p, tx, ty) {
  const ring = (a) => { for (let i = 0; i < a.length; i += 2) { const X = tx(a[i]), Y = ty(a[i + 1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); } ctx.closePath(); };
  ctx.beginPath(); ring(p.o); for (const h of p.h) ring(h);
}
function buildGround() {
  const vb = meta.view_bounds;
  const wm = vb[2] - vb[0], hm = vb[3] - vb[1];
  const S = 4096, scale = S / Math.max(wm, hm);
  const cw = Math.ceil(wm * scale), ch = Math.ceil(hm * scale);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const tx = (x) => (x - vb[0]) * scale, ty = (y) => (vb[3] - y) * scale;
  ctx.fillStyle = '#8f9a72'; ctx.fillRect(0, 0, cw, ch);
  const LU = { residential: '#b7b2a2', commercial: '#b9b1a6', retail: '#bdb0a0', industrial: '#a09f9b', railway: '#8d8a82', farmland: '#a9b27a', farmyard: '#a9a37a', construction: '#a8987a', brownfield: '#a39378', cemetery: '#8ea27a', military: '#8a8f7a', education: '#b0b49a', religious: '#b3ab98', garages: '#9d9c97', allotments: '#9fae78', quarry: '#a09484', landfill: '#9a9078', basin: '#6f8fa0', reservoir: '#6f8fa0' };
  for (const p of landuse) { ctx.fillStyle = LU[p.k] || '#a9a999'; polyPath(ctx, p, tx, ty); ctx.fill('evenodd'); }
  const OA = { school: '#b8b9a8', university: '#b4b6a2', parking: '#9b9b9b', hospital: '#bdb8ad', pitch: '#7aa06c', stadium: '#a6ae88', playground: '#a8b890' };
  for (const p of otherAreas) { if (OA[p.k]) { ctx.fillStyle = OA[p.k]; polyPath(ctx, p, tx, ty); ctx.fill('evenodd'); } }
  const GR = { park: '#7fae67', garden: '#7fae67', wood: '#4f8a4a', forest: '#4a8147', scrub: '#74924f', grass: '#8cba6d', meadow: '#8cba6d', grassland: '#8cba6d', wetland: '#6f9a74', orchard: '#7aa458', flowerbed: '#9ec27a', recreation_ground: '#86b368', village_green: '#86b368', nature_reserve: '#6ea060', common: '#86b368', golf_course: '#79b05f', pitch: '#7aa06c', playground: '#a8b890', greenfield: '#98ae78', farmland: '#a9b27a', heath: '#8a9a60', sand: '#d8cfa0', beach: '#d8cfa0', bare_rock: '#9a958a', vineyard: '#8aa860', cemetery: '#8ea27a' };
  for (const p of green) { ctx.fillStyle = GR[p.k] || '#7fae67'; polyPath(ctx, p, tx, ty); ctx.fill('evenodd'); }
  // noise for visual richness
  const id = ctx.getImageData(0, 0, cw, ch), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(id, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, vb, canvas: cv };
}
{
  const { tex: vecTex, vb, canvas: vecCanvas } = buildGround();

  // Build hybrid texture (vector base + 72% satellite imagery) on an offscreen canvas
  const hybCanvas = document.createElement('canvas');
  hybCanvas.width = vecCanvas.width; hybCanvas.height = vecCanvas.height;
  const hctx = hybCanvas.getContext('2d');
  hctx.drawImage(vecCanvas, 0, 0);
  hctx.globalAlpha = 0.84;
  hctx.drawImage(satTex.image, 0, 0, hybCanvas.width, hybCanvas.height);
  hctx.globalAlpha = 1.0;
  const hybTex = new THREE.CanvasTexture(hybCanvas);
  hybTex.colorSpace = THREE.SRGBColorSpace;
  hybTex.anisotropy = 8;
  hybTex.generateMipmaps = true;
  hybTex.minFilter = THREE.LinearMipmapLinearFilter;

  const stride = 2; // 50 m mesh
  const nx = Math.floor((T.nx - 1) / stride) + 1, ny = Math.floor((T.ny - 1) / stride) + 1;
  const pos = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2);
  const wm = vb[2] - vb[0], hm = vb[3] - vb[1];
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    const x = T.x0 + c * stride * T.res, y = T.y0 + r * stride * T.res;
    const i = r * nx + c;
    pos.set([x, terrainRaw[r * stride * T.nx + c * stride], -y], i * 3);
    uv.set([(x - vb[0]) / wm, (y - vb[1]) / hm], i * 2);
  }
  const idx = [];
  for (let r = 0; r < ny - 1; r++) for (let c = 0; c < nx - 1; c++) { const a = r * nx + c, b = a + 1, d = a + nx, e = d + 1; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({ map: hybTex, roughness: 0.94, metalness: 0 });
  terrainMat.userData.maps = { hybrid: hybTex, sat: satTex, vec: vecTex };

  const m = new THREE.Mesh(g, terrainMat);
  m.receiveShadow = true; m.name = 'terrain';
  layers.terrain.userData.mat = terrainMat;
  layers.terrain.add(m);
  // river bed / far plane
  const far = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f7a62, roughness: 1 }));
  far.position.y = wl - 6; layers.terrain.add(far);
}

// ------------------------------------------------------------------ water
const waterUniforms = { uTime: { value: 0 } };
{
  const geos = [];
  const mkShape = (p) => {
    const s = new THREE.Shape(); for (let i = 0; i < p.o.length; i += 2) i ? s.lineTo(p.o[i], p.o[i + 1]) : s.moveTo(p.o[i], p.o[i + 1]);
    for (const h of p.h) { const path = new THREE.Path(); for (let i = 0; i < h.length; i += 2) i ? path.lineTo(h[i], h[i + 1]) : path.moveTo(h[i], h[i + 1]); s.holes.push(path); }
    return s;
  };
  for (const p of water) { try { const g = new THREE.ShapeGeometry(mkShape(p)); g.rotateX(-Math.PI / 2); geos.push(g); } catch (e) { } }
  const merged = mergeGeometries(geos, false);
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x3b6e7f, roughness: 0.16, metalness: 0.04, transparent: true, opacity: 0.88, envMapIntensity: 1.1 });
  const mesh = new THREE.Mesh(merged, mat); mesh.position.y = wl + 0.05; mesh.renderOrder = 1;
  layers.water.add(mesh);
}

// ------------------------------------------------------------------ buildings
const bInfo = []; // for picking: {cell mesh, ranges, ids}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967295; }
const PAL = {
  residential: [0xd9d2c3, 0xcfc7b6, 0xe2ddd0, 0xc9bfae, 0xd3cbc0], apartments: [0xd8d3c8, 0xcfc9bd, 0xe4e0d6, 0xbfb9ad, 0xd6cbb7],
  house: [0xd9c9b3, 0xc9b79c, 0xe0d4c0], commercial: [0xb7c3cc, 0xaab8c4, 0xc7ced4, 0xa5b0b9], office: [0x9fb3c2, 0x8fa5b7, 0xb2c2ce, 0x7f97ab],
  retail: [0xc6bcae, 0xb9c1c6, 0xd0c7b8], hotel: [0xc9c1b3, 0xb6bec4], university: [0xcfc2a8, 0xc2b79e, 0xd7ccb4], school: [0xd2c6ae, 0xc8bda5],
  industrial: [0xa9a8a2, 0xb5b3aa, 0x9b9a96], warehouse: [0xa9a8a2, 0xb5b3aa], dormitory: [0xd5cdbd, 0xc9c1b1], yes: [0xd2cdc2, 0xc6c1b6, 0xdad6cc, 0xbdb8ad],
};
const CN_COLOR = { '黑': '#222428', '白': '#ecebe6', '灰': '#8c8f94', '红': '#a8443a', '蓝': '#3b6a96', '绿': '#4c7a52', '黄': '#d4b464', '棕': '#7a5942', '银': '#b8bec4', '金': '#c8a654', '橙': '#c8763c', '紫': '#6c527a' };
const colorCache = new Map();
function parseColor(s) {
  if (!s) return null;
  if (colorCache.has(s)) return colorCache.get(s);
  const mapped = CN_COLOR[s.trim()] || s.trim();
  let c = null;
  try {
    c = new THREE.Color(mapped);
    if (Number.isNaN(c.r)) c = null;
  } catch (e) { c = null; }
  colorCache.set(s, c);
  return c;
}
function buildingColor(b) {
  const bc = parseColor(b.bc); if (bc) return bc;
  const pal = PAL[b.ty] || PAL.yes; const r = hashStr(b.id);
  const c = new THREE.Color(pal[Math.floor(r * pal.length)]);
  if (b.ht > 60 && !b.bc) c.lerp(new THREE.Color(0x8da2b3), 0.45);
  c.multiplyScalar(0.92 + hashStr(b.id + 'v') * 0.16);
  return c;
}
const roofColor = new THREE.Color(0x8a8780);

function extrudeBuilding(b) {
  const o = b.o; if (o.length < 6) return null;
  const shape = new THREE.Shape();
  for (let i = 0; i < o.length; i += 2) i ? shape.lineTo(o[i], o[i + 1]) : shape.moveTo(o[i], o[i + 1]);
  for (const h of b.h) { if (h.length < 6) continue; const p = new THREE.Path(); for (let i = 0; i < h.length; i += 2) i ? p.lineTo(h[i], h[i + 1]) : p.moveTo(h[i], h[i + 1]); shape.holes.push(p); }
  let gmin = Infinity;
  for (let i = 0; i < o.length; i += 2) gmin = Math.min(gmin, ground(o[i], o[i + 1]));
  const mh = b.mh || 0;
  const bottom = b.part ? gmin + mh : gmin - 3;
  const depth = Math.max(1.5, b.ht - (b.part ? mh : -3));
  let g;
  try { g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 }); } catch (e) { return null; }
  g.rotateX(-Math.PI / 2); g.translate(0, bottom, 0);
  g.deleteAttribute('uv');
  const n = g.attributes.position.count; const col = new Float32Array(n * 3);
  const wc = buildingColor(b), rc = b.rc ? (parseColor(b.rc) || roofColor) : roofColor;
  const nor = g.attributes.normal;
  for (let i = 0; i < n; i++) { const c = nor.getY(i) > 0.7 ? rc : wc; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g = g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g;
  if (b.rs === 'gabled') {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < o.length; i += 2) { x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]); y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]); }
    const w = x1 - x0, d = y1 - y0, rh = Math.min(b.rh || 2.8, 5);
    if (w > 2 && d > 2) {
      const topY = bottom + depth;
      const ridge = w >= d;
      const p = new THREE.CylinderGeometry(0.01, Math.SQRT1_2, 1, 4, 1);
      p.rotateY(Math.PI / 4);
      const rg = p.toNonIndexed();
      rg.deleteAttribute('uv');
      rg.scale(ridge ? w : d, rh, ridge ? d : w);
      if (!ridge) rg.rotateY(Math.PI / 2);
      rg.translate((x0 + x1) / 2, topY + rh / 2, -(y0 + y1) / 2);
      const rn = rg.attributes.position.count;
      const rcol = new Float32Array(rn * 3);
      for (let i = 0; i < rn; i++) { rcol[i * 3] = rc.r; rcol[i * 3 + 1] = rc.g; rcol[i * 3 + 2] = rc.b; }
      rg.setAttribute('color', new THREE.BufferAttribute(rcol, 3));
      const merged = mergeGeometries([g, rg], false);
      if (merged) g = merged;
    }
  }
  return g;
}

const bmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02 });
bmat.onBeforeCompile = (sh) => {
  sh.uniforms.uNight = bmat.userData.uNight = { value: 0 };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz; vWN=normalize(mat3(modelMatrix)*objectNormal);');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float uNight;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}')
    .replace('#include <color_fragment>', `#include <color_fragment>
      float side = 1.0 - smoothstep(0.25, 0.55, abs(vWN.y));
      vec2 t = vec2(dot(vWP.xz, vec2(-vWN.z, vWN.x)), vWP.y);
      vec2 cell = vec2(3.4, 3.2);
      vec2 id = floor(t / cell); vec2 f = fract(t / cell);
      float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.22, f.y) * step(f.y, 0.82);
      float r = h21(id + floor(vWP.xz*0.01));
      vec3 glass = mix(vec3(0.16,0.22,0.28), vec3(0.42,0.52,0.6), r);
      diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * side * 0.7);
      float lit = step(0.72, r) * win * side * uNight;`)
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0,0.85,0.55) * lit * 0.9;');
};

function polyCentroid(o) {
  let sx = 0, sy = 0, cnt = o.length / 2;
  for (let i = 0; i < o.length; i += 2) { sx += o[i]; sy += o[i + 1]; }
  return [sx / cnt, sy / cnt];
}

const cells = new Map();
let nb = 0;
let yctPos = null, glcPos = null, wcsPos = null;
for (const b of buildings) {
  if (b.nm === '黄鹤楼') {
    const [cx, cy] = polyCentroid(b.o);
    yctPos = [cx, cy, b.ht || 51.4];
    continue;
  }
  if (b.nm === '武汉绿地中心') {
    const [cx, cy] = polyCentroid(b.o);
    glcPos = [cx, cy, b.ht || 476.0];
    continue;
  }
  if (b.nm === '武昌站') {
    const [cx, cy] = polyCentroid(b.o);
    wcsPos = [cx, cy, b.ht || 24.3];
  }
  const g = extrudeBuilding(b); if (!g) continue;
  const cx = b.o[0], cy = b.o[1]; const k = cellKey(cx, cy);
  if (!cells.has(k)) cells.set(k, []);
  cells.get(k).push({ g, b }); nb++;
}
for (const [k, list] of cells) {
  const merged = mergeGeometries(list.map((l) => l.g), false);
  const ranges = []; let acc = 0;
  for (const l of list) { ranges.push(acc); acc += l.g.attributes.position.count / 3; }
  const mesh = new THREE.Mesh(merged, bmat);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = true;
  mesh.userData = { kind: 'building', ranges, items: list.map((l) => l.b) };
  merged.computeBoundingSphere(); merged.computeBoundingBox();
  layers.buildings.add(mesh);
}
if (yctPos) {
  const [yx, yy, yh] = yctPos;
  const gy = ground(yx, yy);
  const yct = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xddd8ce, roughness: 0.9 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9c2c24, roughness: 0.78 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xd99b26, roughness: 0.45, metalness: 0.18 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.3, metalness: 0.6 });
  // Podium
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(20, 23, 5, 8), stoneMat);
  pod.position.y = 2.5; pod.castShadow = pod.receiveShadow = true; yct.add(pod);
  // 5 tiers
  let curY = 5;
  for (let tier = 0; tier < 5; tier++) {
    const r = 15.5 - tier * 2.1;
    const h = 7.4 - tier * 0.45;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 8), wallMat);
    body.position.y = curY + h / 2; body.castShadow = body.receiveShadow = true; yct.add(body);
    const eave = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r * 1.42, 3.0, 8), roofMat);
    eave.position.y = curY + h + 0.6; eave.castShadow = true; yct.add(eave);
    curY += h + 1.1;
  }
  // Top spire
  const topRoof = new THREE.Mesh(new THREE.ConeGeometry(8.2, 6.5, 8), roofMat);
  topRoof.position.y = curY + 2.5; topRoof.castShadow = true; yct.add(topRoof);
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 6, 8), goldMat);
  spire.position.y = curY + 7.5; yct.add(spire);
  yct.position.set(yx, gy, -yy);
  yct.traverse((o) => { if (o.isMesh) o.userData.landmark = { nm: '黄鹤楼 Yellow Crane Tower', ty: '地标建筑 (5层八角重檐)', ht: yh }; });
  layers.buildings.add(yct);
  nb++;
}
// Wuhan Greenland Center (476 m tapered 3-lobed glass tower)
if (glcPos) {
  const [gx, gy2, gh] = glcPos;
  const gy = ground(gx, gy2);
  const glc = new THREE.Group();
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x7ba0b8, roughness: 0.22, metalness: 0.45 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0xa6c4d6, roughness: 0.16, metalness: 0.55 });
  // 5 tapering tiers from base to 476m crown
  const tiers = [
    [34, 32, 130, 0],
    [32, 28, 130, 130],
    [28, 23, 105, 260],
    [23, 16, 70, 365],
    [16, 4, 41, 435],
  ];
  for (let i = 0; i < tiers.length; i++) {
    const [rb, rt, h, y0] = tiers[i];
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 9), i === tiers.length - 1 ? crownMat : glassMat);
    m.position.y = y0 + h / 2; m.castShadow = m.receiveShadow = true;
    m.userData.landmark = { nm: '武汉绿地中心 Wuhan Greenland Center', ty: '超高层地标 (流线型玻璃幕墙)', ht: gh };
    glc.add(m);
  }
  glc.position.set(gx, gy, -gy2);
  layers.buildings.add(glc);
  nb++;
}
// Wuchang Railway Station pitched traditional-modern roof accent
if (wcsPos) {
  const [wx, wy, wh] = wcsPos;
  const gy = ground(wx, wy);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(42, 10, 4),
    new THREE.MeshStandardMaterial({ color: 0x5c6873, roughness: 0.5, metalness: 0.2 })
  );
  roof.scale.set(1.8, 1, 1.1);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(wx, gy + wh + 4, -wy);
  roof.castShadow = true;
  roof.userData.landmark = { nm: '武昌站 Wuchang Railway Station', ty: '铁路枢纽 (楚风大屋檐)', ht: wh };
  layers.buildings.add(roof);
}
// Yangtze River Bridge Wuchang bridgehead twin towers (near -4835, -735)
{
  const bx = -4835, by = -735;
  const deckY = wl + 11;
  const twMat = new THREE.MeshStandardMaterial({ color: 0xc9c2b4, roughness: 0.85 });
  const rfMat = new THREE.MeshStandardMaterial({ color: 0x3b6e4c, roughness: 0.55 });
  for (const [dx, dy] of [[-14, -14], [14, 14]]) {
    const grp = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(9, 44, 9), twMat);
    shaft.position.y = 22; shaft.castShadow = shaft.receiveShadow = true; grp.add(shaft);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(7.2, 5.5, 4), rfMat);
    cap.rotation.y = Math.PI / 4; cap.position.y = 46.5; grp.add(cap);
    grp.position.set(bx + dx, deckY - 12, -(by + dy));
    grp.traverse((o) => { if (o.isMesh) o.userData.landmark = { nm: '武汉长江大桥桥头堡', ty: '桥梁地标', ht: 44 }; });
    layers.buildings.add(grp);
  }
}
setMsg(`buildings: ${nb}`);

// ------------------------------------------------------------------ ribbons (roads/rails)
function densify(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1]; const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.ceil(d / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  out.push(pts[pts.length - 1]); return out;
}
const nodeKey = (x, y) => `${Math.round(x * 5)},${Math.round(y * 5)}`;
const bridgeEnds = new Map(); // node -> {b, o, maxLy}
function regEnd(p, isBridge, ly) {
  const k = nodeKey(p[0], p[1]);
  const e = bridgeEnds.get(k) || { b: 0, o: 0, maxLy: 0 };
  if (isBridge) { e.b++; e.maxLy = Math.max(e.maxLy, ly || 1); }
  else { e.o++; }
  bridgeEnds.set(k, e);
}
const R = roads.map((r) => ({ ...r, pts: (() => { const a = []; for (let i = 0; i < r.p.length; i += 2) a.push([r.p[i], r.p[i + 1]]); return a; })() }));
for (const r of R) { regEnd(r.pts[0], !!r.br, r.ly); regEnd(r.pts[r.pts.length - 1], !!r.br, r.ly); }
const railsL = rails.map((r) => { const a = []; for (let i = 0; i < r.p.length; i += 2) a.push([r.p[i], r.p[i + 1]]); return { ...r, pts: a, br: r.bridge && r.bridge !== 'no', tn: r.tunnel && r.tunnel !== 'no' }; });
for (const r of railsL) { regEnd(r.pts[0], !!r.br, r.ly); regEnd(r.pts[r.pts.length - 1], !!r.br, r.ly); }

function deckHeight(pt) {
  const k = nodeKey(pt[0], pt[1]);
  const e = bridgeEnds.get(k) || { b: 0, o: 0, maxLy: 1 };
  const g = ground(pt[0], pt[1]);
  if (e.o > 0) return g + 0.15; // meets normal road: ramp starts seamlessly at ground
  const lift = Math.max(5.5, (e.maxLy || 1) * 5.5);
  return (g <= wl + 0.6 ? wl + 11 : g + lift);
}

function ribbon(pts, w, yfun, uvScale, extra) {
  const pos = [], uv = [], idx = [], col = [];
  const n = pts.length; if (n < 2) return null;
  let dist = 0; let prevL = null;
  for (let i = 0; i < n; i++) {
    const p = pts[i]; const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const nx = -dy * (w / 2), ny = dx * (w / 2);
    if (i > 0) dist += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    const y = yfun(p, i, dist);
    pos.push(p[0] + nx, y, -(p[1] + ny), p[0] - nx, y, -(p[1] - ny));
    uv.push(0, dist / uvScale, 1, dist / uvScale);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // ensure up-facing
  const nrm = g.attributes.normal; if (nrm.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}

function roadTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const c = cv.getContext('2d');
  c.fillStyle = '#5c5e61'; c.fillRect(0, 0, 128, 128);
  const id = c.getImageData(0, 0, 128, 128); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 22; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } c.putImageData(id, 0, 0);
  c.fillStyle = '#e8e6d8'; c.fillRect(4, 0, 3, 128); c.fillRect(121, 0, 3, 128); // edge lines
  c.fillStyle = '#e8c93a'; c.fillRect(62, 0, 4, 80); // centre dash
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const asphaltTex = roadTexture();
const plainTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d'); c.fillStyle = '#6a6c6e'; c.fillRect(0, 0, 32, 32); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
const matMain = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const matMinor = new THREE.MeshStandardMaterial({ color: 0x74777a, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const matPath = new THREE.MeshStandardMaterial({ color: 0xb8b2a6, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
const matBridgeSide = new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 0.9 });
const matRail = new THREE.MeshStandardMaterial({ color: 0x4a443d, roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

const MAIN = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link']);
const PATHS = new Set(['footway', 'path', 'steps', 'cycleway', 'pedestrian', 'track', 'corridor', 'bridleway']);
const bucket = { main: new Map(), minor: new Map(), path: new Map(), side: new Map(), rail: new Map() };
const push = (m, k, g) => { if (!g) return; if (!m.has(k)) m.set(k, []); m.get(k).push(g); };
const piers = [];
const trafficPaths = [];

function addLine(r, kind) {
  if (r.tn) return;
  let pts = densify(r.pts, 8);
  const isBr = !!r.br && (r.pts.length > 1);
  let yfun;
  const total = (() => { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; })();
  if (isBr) {
    const h0 = deckHeight(r.pts[0]), h1 = deckHeight(r.pts[r.pts.length - 1]);
    yfun = (p, i, dist) => { const t = total > 0 ? dist / total : 0; const s = t * t * (3 - 2 * t); return Math.max(h0 + (h1 - h0) * s, ground(p[0], p[1]) + 0.25); };
  } else {
    const dy = kind === 'path' ? 0.2 : kind === 'rail' ? 0.25 : 0.12 + (MAIN.has(r.c) ? 0.03 : 0);
    yfun = (p) => ground(p[0], p[1]) + dy;
  }
  const w = r.w || 3;
  const g = ribbon(pts, w, yfun, kind === 'main' ? 14 : 20);
  if (!g) return;
  if (kind === 'main' && total >= 45 && trafficPaths.length < 700) {
    const pts3 = []; let d = 0;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      pts3.push([pts[i][0], yfun(pts[i], i, d) + 0.75, -pts[i][1], d]);
    }
    trafficPaths.push({ pts: pts3, len: d, ow: !!r.ow });
  }
  const cx = pts[0][0], cy = pts[0][1], k = cellKey(cx, cy);
  push(bucket[kind], k, g);
  if (isBr) {
    // side skirts + piers
    const L = [], Rr = [];
    const n = pts.length; const idxs = [], pos = [];
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let dx = b[0] - a[0], dy = b[1] - a[1]; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const y = yfun(pts[i], i, 0); // not used for dist
    }
    // build skirt using ribbon positions
    const pa = g.attributes.position; const cnt = pa.count / 2;
    const sp = [], si = [];
    for (let side = 0; side < 2; side++) {
      const base = sp.length / 3;
      for (let i = 0; i < cnt; i++) { const x = pa.getX(i * 2 + side), y = pa.getY(i * 2 + side), z = pa.getZ(i * 2 + side); sp.push(x, y, z, x, y - (1.4), z); }
      for (let i = 0; i < cnt - 1; i++) { const a0 = base + i * 2; si.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2, a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setIndex(si); sg.computeVertexNormals();
    push(bucket.side, k, sg);
    // piers every ~30 m
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (acc >= 32) {
        acc = 0; const y = pa.getY(i * 2); const gy = ground(pts[i][0], pts[i][1]);
        const top = y - 1.4; const bot = Math.min(gy, wl - 3);
        if (top - bot > 2) piers.push({ x: pts[i][0], z: -pts[i][1], y0: bot, y1: top, w: Math.min(w * 0.45, 4) });
      }
    }
  }
}
for (const r of R) addLine(r, MAIN.has(r.c) ? 'main' : PATHS.has(r.c) ? 'path' : 'minor');
for (const r of railsL) { if (['rail', 'light_rail', 'subway', 'tram', 'narrow_gauge', 'monorail'].includes(r.k) && !r.tn && !(r.service && r.service !== 'main')) { r.w = r.k === 'subway' ? 3.2 : 3.6; addLine(r, 'rail'); } }
function flush(map, mat, parent, shadow) {
  for (const [, list] of map) { const m = mergeGeometries(list.map((g) => { g.deleteAttribute('uv') && 0; return g; }), false); }
}
function flushBucket(map, mat, parent, keepUV) {
  for (const [, list] of map) {
    const ok = list.filter(Boolean);
    const clean = ok.map((g) => { if (!keepUV) g.deleteAttribute('uv'); return g; });
    const m = mergeGeometries(clean, false); if (!m) continue;
    const mesh = new THREE.Mesh(m, mat); mesh.receiveShadow = true; parent.add(mesh);
  }
}
flushBucket(bucket.main, matMain, layers.roads, true);
flushBucket(bucket.minor, matMinor, layers.roads, false);
flushBucket(bucket.path, matPath, layers.roads, false);
flushBucket(bucket.side, matBridgeSide, layers.roads, false);
flushBucket(bucket.rail, matRail, layers.rails, false);
if (piers.length) {
  const geos = piers.map((p) => { const g = new THREE.BoxGeometry(p.w, p.y1 - p.y0, p.w * 1.4); g.translate(p.x, (p.y0 + p.y1) / 2, p.z); g.deleteAttribute('uv'); return g; });
  const m = mergeGeometries(geos, false); layers.roads.add(new THREE.Mesh(m, matBridgeSide));
}

// ------------------------------------------------------------------ model helper & sculpted car
function extractModelParts(gltfScene, { targetHeight, targetLength, nameFilter } = {}) {
  if (!gltfScene) return null;
  gltfScene.updateMatrixWorld(true);
  const raw = [];
  gltfScene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (nameFilter && !nameFilter(o.name || '')) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    raw.push({ g, mat: o.material });
  });
  if (!raw.length) return null;
  const box = new THREE.Box3();
  for (const r of raw) { r.g.computeBoundingBox(); box.union(r.g.boundingBox); }
  const sz = box.getSize(new THREE.Vector3());
  const ctr = box.getCenter(new THREE.Vector3());
  const rotateY90 = targetLength && sz.x > sz.z;
  const curLen = rotateY90 ? sz.x : sz.z;
  const sc = targetLength ? (targetLength / Math.max(0.001, curLen)) : (targetHeight / Math.max(0.001, sz.y));
  const byMat = new Map();
  for (const r of raw) {
    r.g.translate(-ctr.x, -box.min.y, -ctr.z);
    if (rotateY90) r.g.rotateY(Math.PI / 2);
    r.g.scale(sc, sc, sc);
    const gNon = r.g.index ? r.g.toNonIndexed() : r.g;
    if (!gNon.attributes.normal) gNon.computeVertexNormals();
    if (!byMat.has(r.mat)) byMat.set(r.mat, []);
    byMat.get(r.mat).push(gNon);
  }
  const parts = [];
  for (const [mat, list] of byMat) {
    // Ensure identical attribute set before merging
    const hasUv = list.every((g) => !!g.attributes.uv);
    for (const g of list) {
      if (!hasUv && g.attributes.uv) g.deleteAttribute('uv');
      if (g.attributes.color) g.deleteAttribute('color');
      if (g.attributes.tangent) g.deleteAttribute('tangent');
    }
    const merged = mergeGeometries(list, false);
    if (merged) parts.push({ geo: merged, mat });
  }
  return parts.length ? parts : null;
}

function buildCarGeo() {
  const parts = [];
  const add = (g, colHex) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    const n = ng.attributes.position.count;
    const c = new THREE.Color(colHex);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    parts.push(ng);
  };
  const body = new THREE.BoxGeometry(1.85, 0.72, 4.35); body.translate(0, 0.54, 0); add(body, 0xffffff);
  const cabin = new THREE.BoxGeometry(1.56, 0.6, 2.15); cabin.translate(0, 1.15, -0.15); add(cabin, 0x33404d);
  for (const [wx, wz] of [[-0.86, 1.32], [0.86, 1.32], [-0.86, -1.32], [0.86, -1.32]]) {
    const wh = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 8);
    wh.rotateZ(Math.PI / 2); wh.translate(wx, 0.32, wz); add(wh, 0x1e2022);
  }
  return mergeGeometries(parts, false);
}

// Build continuous city-spanning corridors from corridors.json
const longPaths = [];
for (const cor of corridors) {
  const pts3 = [];
  let cumD = 0;
  for (const seg of cor.segs) {
    const raw = [];
    for (let i = 0; i < seg.p.length; i += 2) raw.push([seg.p[i], seg.p[i + 1]]);
    if (raw.length < 2) continue;
    const dpts = densify(raw, 12);
    const segLen = (() => { let d = 0; for (let i = 1; i < dpts.length; i++) d += Math.hypot(dpts[i][0] - dpts[i - 1][0], dpts[i][1] - dpts[i - 1][1]); return d; })();
    const h0 = seg.br ? deckHeight(raw[0]) : 0;
    const h1 = seg.br ? deckHeight(raw[raw.length - 1]) : 0;
    let sd = 0;
    for (let i = 0; i < dpts.length; i++) {
      if (i > 0) {
        const stepD = Math.hypot(dpts[i][0] - dpts[i - 1][0], dpts[i][1] - dpts[i - 1][1]);
        sd += stepD; cumD += stepD;
      }
      if (pts3.length && i === 0) continue; // avoid duplicate joint vertex
      let y;
      if (seg.br) {
        const t = segLen > 0 ? sd / segLen : 0;
        const s = t * t * (3 - 2 * t);
        y = Math.max(h0 + (h1 - h0) * s, ground(dpts[i][0], dpts[i][1]) + 0.25);
      } else {
        y = ground(dpts[i][0], dpts[i][1]) + 0.15;
      }
      pts3.push([dpts[i][0], y, -dpts[i][1], cumD]);
    }
  }
  if (pts3.length >= 2 && cumD > 100) longPaths.push({ pts: pts3, len: cumD, ow: !!cor.ow });
}

// ------------------------------------------------------------------ animated traffic (long-distance cars & real buses)
const vehicles = [];
const carList = [], busParts = extractModelParts(busGltf?.scene, { targetLength: 10.2 });
const realCarParts = extractModelParts(carGltf?.scene, { targetLength: 4.5, nameFilter: (n) => !n.includes('interiour') && !n.includes('steeringwheel') });
let carMesh = null;
const busMeshes = [], realCarMeshes = [];
const MAX_REAL_CARS = 28;
if (longPaths.length) {
  const N_CARS = 2000;
  const carGeo = buildCarGeo();
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 });
  carMesh = new THREE.InstancedMesh(carGeo, carMat, N_CARS);
  const CAR_COLS = [0xf2f4f7, 0x262c33, 0x7b8694, 0xc43b33, 0x2c669e, 0xd9a834, 0x4b7862, 0x8f9aa6];
  const c = new THREE.Color();
  for (let i = 0; i < N_CARS; i++) {
    const tp = longPaths[i % longPaths.length];
    const dir = tp.ow ? 1 : (i % 2 === 0 ? 1 : -1);
    carList.push({ path: tp, t: (i * 0.6180339) % 1, sp: 11 + (i % 7) * 2.4, dir, off: dir * 1.9 });
    c.setHex(CAR_COLS[i % CAR_COLS.length]);
    carMesh.setColorAt(i, c);
  }
  carMesh.instanceColor.needsUpdate = true;
  carMesh.frustumCulled = false;
  layers.traffic.add(carMesh);

  if (realCarParts) {
    for (const part of realCarParts) {
      const rm = new THREE.InstancedMesh(part.geo, part.mat, MAX_REAL_CARS);
      rm.count = 0;
      rm.frustumCulled = false;
      layers.traffic.add(rm);
      realCarMeshes.push(rm);
    }
  }

  // Real city buses from models/bus/scene.gltf
  const N_BUS = 160;
  const busRoutes = longPaths.slice(0, Math.min(80, longPaths.length));
  if (busParts && busRoutes.length) {
    for (const part of busParts) {
      const bm = new THREE.InstancedMesh(part.geo, part.mat, N_BUS);
      bm.frustumCulled = false;
      layers.traffic.add(bm);
      busMeshes.push(bm);
    }
  } else {
    const fbGeo = new THREE.BoxGeometry(2.5, 3.0, 10.2); fbGeo.translate(0, 1.5, 0);
    const fb = new THREE.InstancedMesh(fbGeo, new THREE.MeshStandardMaterial({ color: 0x2f7d5b, roughness: 0.5 }), N_BUS);
    fb.frustumCulled = false; layers.traffic.add(fb); busMeshes.push(fb);
  }
  for (let i = 0; i < N_BUS; i++) {
    const tp = busRoutes[i % busRoutes.length];
    const dir = tp.ow ? 1 : (i % 2 === 0 ? 1 : -1);
    vehicles.push({ path: tp, t: (i * 0.381966) % 1, sp: 8.5 + (i % 4) * 1.3, dir, off: dir * 2.2 });
  }
}

// ------------------------------------------------------------------ trees (2-LOD: real glTF near camera, lightweight far)
{
  const treeParts = extractModelParts(treeGltf?.scene, { targetHeight: 7.2, nameFilter: (n) => n.includes('tree6') });
  if (treeParts) {
    for (const p of treeParts) {
      if (p.mat && p.mat.transparent) { p.mat.alphaTest = 0.4; p.mat.transparent = false; p.mat.side = THREE.DoubleSide; }
    }
  }
  const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 3.2, 5); trunkG.translate(0, 1.6, 0);
  const crownG = new THREE.IcosahedronGeometry(2.4, 0); crownG.translate(0, 5.0, 0); crownG.scale(1, 1.15, 1);
  const farParts = [
    { geo: trunkG, mat: new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 1 }) },
    { geo: crownG, mat: new THREE.MeshStandardMaterial({ color: 0x4f8a43, roughness: 0.9, flatShading: true }) }
  ];

  const all = [...trees1.map((t) => ({ x: t.x, y: t.y, s: 1 })), ...trees2];
  const map = new Map();
  for (const t of all) { const k = cellKey(t.x, t.y); if (!map.has(k)) map.set(k, []); map.get(k).push(t); }
  const dummy = new THREE.Object3D();
  layers.trees.userData.chunks = [];
  for (const [, list] of map) {
    const farMeshes = farParts.map((mp) => new THREE.InstancedMesh(mp.geo, mp.mat, list.length));
    const nearMeshes = treeParts ? treeParts.map((mp) => new THREE.InstancedMesh(mp.geo, mp.mat, list.length)) : null;
    list.forEach((t, i) => {
      const gy = ground(t.x, t.y);
      if (gy <= wl + 0.4) dummy.scale.setScalar(0.0001);
      else dummy.scale.setScalar(t.s * (0.85 + hashStr('' + t.x + t.y) * 0.4));
      dummy.position.set(t.x, gy, -t.y);
      dummy.rotation.y = hashStr('r' + t.x) * 6.28;
      dummy.updateMatrix();
      for (const im of farMeshes) im.setMatrixAt(i, dummy.matrix);
      if (nearMeshes) for (const im of nearMeshes) im.setMatrixAt(i, dummy.matrix);
    });
    let sx = 0, sy = 0;
    for (const t of list) { sx += t.x; sy += t.y; }
    const cx = sx / list.length, cy = sy / list.length;
    const grp = new THREE.Group();
    const farGrp = new THREE.Group(); for (const im of farMeshes) { im.castShadow = false; im.frustumCulled = false; farGrp.add(im); }
    const nearGrp = new THREE.Group(); if (nearMeshes) { for (const im of nearMeshes) { im.castShadow = false; im.frustumCulled = false; nearGrp.add(im); } }
    nearGrp.visible = false;
    grp.add(farGrp, nearGrp);
    grp.userData = { center: new THREE.Vector3(cx, 0, -cy), farGrp, nearGrp, hasNear: !!nearMeshes };
    layers.trees.add(grp); layers.trees.userData.chunks.push(grp);
  }
}

// ------------------------------------------------------------------ labels (sprites for notable POIs + major buildings)
const poiList = [];
{
  const KEEP = new Set(['university', 'college', 'school', 'hospital', 'museum', 'attraction', 'monument', 'memorial', 'station', 'hotel', 'viewpoint', 'theatre', 'library', 'townhall', 'place_of_worship', 'stadium', 'castle', 'fort', 'ruins', 'mall', 'department_store', 'park', 'zoo', 'gallery', 'arts_centre', 'bus_station', 'ferry_terminal']);
  const ranked = pois.filter((p) => p.name && (KEEP.has(p.k) || p.k === 'city' || p.k === 'suburb' || p.k === 'quarter' || p.k === 'neighbourhood'));
  for (const p of ranked) poiList.push(p);
  const seenNames = new Set(poiList.map((p) => p.name));
  for (const b of buildings) {
    if (!b.nm || seenNames.has(b.nm) || b.ht < 15) continue;
    seenNames.add(b.nm);
    poiList.push({ x: b.o[0], y: b.o[1], name: b.nm, k: b.ty || 'building', ht: b.ht });
  }
  const made = new Set();
  const labelItems = [
    ...poiList.filter((p) => p.ht >= 30 || KEEP.has(p.k)).slice(0, 260)
  ];
  for (const p of labelItems) {
    if (made.has(p.name)) continue; made.add(p.name);
    const c = document.createElement('canvas'); const ctx = c.getContext('2d'); ctx.font = 'bold 34px "Microsoft YaHei", sans-serif';
    const w = Math.ceil(ctx.measureText(p.name).width) + 24; c.width = w; c.height = 56;
    const x = c.getContext('2d'); x.font = 'bold 34px "Microsoft YaHei", sans-serif'; x.fillStyle = 'rgba(15,25,35,.68)'; x.fillRect(0, 0, w, 56); x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(p.name, 12, 29);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false, transparent: true, fog: false }));
    const hBase = p.ht ? p.ht + 22 : 55;
    sp.userData.aspect = w / 56;
    sp.scale.set((w / 56) * 20, 20, 1);
    sp.position.set(p.x, ground(p.x, p.y) + hBase, -p.y);
    sp.renderOrder = 10; sp.userData.name = p.name; sp.userData.k = p.k;
    layers.poi.add(sp);
  }
}

// ------------------------------------------------------------------ lighting / time of day
function setTime(h) {
  $('tval').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const ang = ((h - 6) / 12) * Math.PI; // 6h sunrise, 18h sunset
  const elev = Math.sin(ang), az = Math.cos(ang);
  const dir = new THREE.Vector3(az * 0.8, Math.max(elev, -0.15), -0.6).normalize();
  const U = sky.material.uniforms; U.sunPosition.value.copy(dir.clone().multiplyScalar(1));
  U.turbidity.value = 5.5; U.rayleigh.value = 1.6; U.mieCoefficient.value = 0.006; U.mieDirectionalG.value = 0.8;
  const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.22);
  sun.intensity = 3.2 * day;
  sun.color.setHSL(0.08 + 0.03 * day, 0.65 * (1 - day * 0.55), 0.52 + 0.28 * day);
  hemi.intensity = 0.36 + 0.68 * day;
  renderer.toneMappingExposure = 0.54 + 0.44 * day;
  scene.fog.color.setHSL(0.58, 0.32, 0.16 + 0.56 * day);
  sun.userData.dir = dir;
  if (bmat.userData.uNight) bmat.userData.uNight.value = 1 - day;
}
$('time').addEventListener('input', (e) => setTime(+e.target.value));

// ------------------------------------------------------------------ camera/controls
const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = false;
controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 20; controls.maxDistance = 14000;
camera.position.set(-1800, 1500, 2600); controls.target.set(0, 30, 0);
controls.update();

let fp = false; const keys = {}; let yaw = 0, pitch = 0;
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'KeyF' && document.activeElement.tagName !== 'INPUT') toggleFP(); });
addEventListener('keyup', (e) => (keys[e.code] = false));
function toggleFP(on) {
  fp = on ?? !fp;
  controls.enabled = !fp;
  if (fp) {
    const t = controls.target.clone(); camera.position.set(t.x, ground(t.x, -t.z) + 1.7, t.z);
    const d = new THREE.Vector3(); camera.getWorldDirection(d); yaw = Math.atan2(-d.x, -d.z); pitch = 0;
    renderer.domElement.requestPointerLock?.();
  } else { document.exitPointerLock?.(); }
}
document.addEventListener('mousemove', (e) => { if (fp && document.pointerLockElement) { yaw -= e.movementX * 0.0022; pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.0022)); } });
document.addEventListener('pointerlockchange', () => { if (fp && !document.pointerLockElement) { fp = false; controls.enabled = true; const p = camera.position; controls.target.set(p.x - Math.sin(yaw) * 80, ground(p.x, -p.z) + 20, p.z - Math.cos(yaw) * 80); camera.position.y = ground(p.x, -p.z) + 120; } });

// ------------------------------------------------------------------ picking
const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4 || fp) return;
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(layers.buildings.children, true);
  const box = $('info');
  if (!hits.length) { box.style.display = 'none'; return; }
  const h = hits[0]; const ud = h.object.userData;
  if (!ud?.ranges) {
    const lm = ud?.landmark || { nm: '地标建筑', ty: 'Landmark', ht: '-' };
    box.innerHTML = `<b>${lm.nm}</b><br>类型: ${lm.ty}<br>高度: ${lm.ht} m`;
    box.style.display = 'block';
    return;
  }
  const tri = h.faceIndex;
  let lo = 0, hi = ud.ranges.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ud.ranges[mid] <= tri) lo = mid; else hi = mid - 1; }
  const b = ud.items[lo];
  const SRC = { osm_height: 'OSM 高度标注', osm_levels: 'OSM 层数×3.2m (估算)', gba: 'GlobalBuildingAtlas 高度 (机器学习估算)', type_estimate: '按建筑类型推断 (估算)', gba_footprint: 'GlobalBuildingAtlas 轮廓+高度', osm_part: 'OSM building:part' };
  box.innerHTML = `<b>${b.nm || '建筑 Building'}</b><br>类型: ${b.ty || 'yes'}<br>高度: ${b.ht} m<br>高度来源: ${SRC[b.src] || b.src}<br><span style="opacity:.6">${b.id}</span>`;
  box.style.display = 'block';
});

// ------------------------------------------------------------------ UI
function setHudCollapsed(collapsed) {
  $('hud').classList.toggle('collapsed', collapsed);
  $('hudToggle').textContent = collapsed ? '展开 +' : '－';
}
$('hudToggle').addEventListener('click', () => setHudCollapsed(!$('hud').classList.contains('collapsed')));
if (innerWidth < 640) setHudCollapsed(true);

for (const k of ['buildings', 'roads', 'water', 'trees', 'rails', 'traffic', 'poi']) $('L_' + k).addEventListener('change', (e) => (layers[k].visible = e.target.checked));
$('quality').addEventListener('change', (e) => applyQuality(e.target.value));
$('basemap').addEventListener('change', (e) => {
  const mat = layers.terrain.userData.mat;
  if (mat?.userData?.maps?.[e.target.value]) {
    mat.map = mat.userData.maps[e.target.value];
    mat.needsUpdate = true;
  }
});
const LANDMARKS = [
  ['黄鹤楼', -3933, -1009, 260],
  ['绿地中心', -1905, 3239, 550],
  ['长江大桥', -4778, -783, 420],
  ['武昌站', -2641, -2957, 360],
  ['武汉大学', 1935, -2376, 480],
  ['楚河汉街', -147, -147, 380],
  ['东湖', 4200, 1200, 1400],
  ['沙湖', -600, 1200, 900],
];
for (const [nm, lx, ly, dist] of LANDMARKS) {
  const btn = document.createElement('button');
  btn.textContent = nm;
  btn.onclick = () => flyTo(lx, ly, dist);
  $('qjump').appendChild(btn);
}
function applyQuality(q) {
  renderer.setPixelRatio(q === 'low' ? 1 : q === 'med' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = q !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = q !== 'low'; sun.shadow.mapSize.set(q === 'high' ? 4096 : 2048, q === 'high' ? 4096 : 2048);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -700; sc.right = sc.top = 700; sc.near = 10; sc.far = 4000; sc.updateProjectionMatrix();
  layers.trees.userData.range = q === 'low' ? 800 : q === 'med' ? 1400 : 2200;
  layers.poi.userData.range = 4500;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
}
$('search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase(); const box = $('results'); box.innerHTML = '';
  if (q.length < 1) return;
  const found = poiList.filter((p) => (p.name || '').toLowerCase().includes(q) || (p['name:en'] || '').toLowerCase().includes(q)).slice(0, 12);
  for (const p of found) { const d = document.createElement('div'); d.textContent = `${p.name} · ${p.k}`; d.onclick = () => flyTo(p.x, p.y); box.appendChild(d); }
});
function flyTo(x, y, dist = 320) { const gy = ground(x, y); controls.target.set(x, gy + 15, -y); camera.position.set(x + dist * 0.78, gy + dist * 0.82, -y + dist); toggleFP(false); }
window.__flyTo = flyTo; window.__cam = (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.update(); };
window.__fp = (x, y) => { controls.target.set(x, ground(x, y), -y); toggleFP(true); keys['x'] = 0; };

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ------------------------------------------------------------------ loop
applyQuality($('quality').value); setTime(15);
let last = performance.now(), fpsT = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  waterUniforms.uTime.value = now * 0.001;
  if (fp) {
    const sp = (keys['ShiftLeft'] ? 18 : 5) * dt; const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (keys['KeyW']) camera.position.addScaledVector(f, sp); if (keys['KeyS']) camera.position.addScaledVector(f, -sp);
    if (keys['KeyD']) camera.position.addScaledVector(r, sp); if (keys['KeyA']) camera.position.addScaledVector(r, -sp);
    camera.position.y = Math.max(ground(camera.position.x, -camera.position.z), wl) + 1.7;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');
  } else controls.update();
  // keep the camera above terrain
  if (!fp) { const gy = ground(camera.position.x, -camera.position.z); if (camera.position.y < gy + 8) camera.position.y = gy + 8; }
  const dir = sun.userData.dir || new THREE.Vector3(0.5, 0.8, -0.3);
  const ctr = fp ? camera.position : controls.target;
  sun.position.copy(ctr).addScaledVector(dir, 1500); sun.target.position.copy(ctr); sun.target.updateMatrixWorld();
  // tree distance culling + 2-LOD switch (real glTF near camera, low-poly far)
  const tr = layers.trees.userData.range || 1400;
  if (layers.trees.visible) {
    for (const c of layers.trees.userData.chunks) {
      const d = c.userData.center.distanceTo(camera.position);
      c.visible = d < tr + 700;
      if (c.visible && c.userData.hasNear) {
        const useNear = d < 1350;
        c.userData.nearGrp.visible = useNear;
        c.userData.farGrp.visible = !useNear;
      }
    }
  }
  // animated traffic update (2000 cars + 160 buses; swap up to 28 close on-screen cars to real glTF model)
  if (layers.traffic.visible && (carMesh || busMeshes.length)) {
    const dummy = new THREE.Object3D();
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    const camY = camera.position.y - ground(camera.position.x, -camera.position.z);
    const useRealCars = realCarMeshes.length > 0 && camY < 380;
    let frustum = null;
    if (useRealCars) {
      camera.updateMatrixWorld();
      const projMat = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum = new THREE.Frustum().setFromProjectionMatrix(projMat);
    }
    const nearCars = [];
    const stepVehicle = (v, collectNear, idx) => {
      const tp = v.path;
      v.t += (v.sp * v.dir * dt) / tp.len;
      if (v.t >= 1) {
        if (tp.ow) v.t -= 1;
        else { v.t = 1 - (v.t - 1); v.dir *= -1; v.off = -v.off; }
      } else if (v.t < 0) {
        if (tp.ow) v.t += 1;
        else { v.t = -v.t; v.dir *= -1; v.off = -v.off; }
      }
      const targetD = v.t * tp.len;
      const pts = tp.pts;
      let lo = 0, hi = pts.length - 2;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pts[mid][3] <= targetD) lo = mid; else hi = mid - 1; }
      const a = pts[lo], b = pts[lo + 1];
      const segL = Math.max(0.01, b[3] - a[3]);
      const f = (targetD - a[3]) / segL;
      const dx = b[0] - a[0], dz = b[2] - a[2];
      const l = Math.hypot(dx, dz) || 1;
      const nx = -dz / l, nz = dx / l;
      dummy.position.set(a[0] + dx * f + nx * v.off, a[1] + (b[1] - a[1]) * f, a[2] + dz * f + nz * v.off);
      dummy.rotation.set(0, Math.atan2(dx * v.dir, dz * v.dir), 0);
      dummy.updateMatrix();
      if (collectNear && frustum) {
        const d2 = dummy.position.distanceToSquared(camera.position);
        if (d2 < 240 * 240 && frustum.containsPoint(dummy.position)) {
          nearCars.push({ idx, d2, mat: dummy.matrix.clone() });
        }
      }
      return dummy.matrix;
    };
    if (carMesh) {
      for (let i = 0; i < carList.length; i++) carMesh.setMatrixAt(i, stepVehicle(carList[i], useRealCars, i));
      if (realCarMeshes.length) {
        if (useRealCars && nearCars.length) {
          nearCars.sort((a, b) => a.d2 - b.d2);
          const cnt = Math.min(MAX_REAL_CARS, nearCars.length);
          for (let k = 0; k < cnt; k++) {
            carMesh.setMatrixAt(nearCars[k].idx, zeroMat);
            for (const rm of realCarMeshes) rm.setMatrixAt(k, nearCars[k].mat);
          }
          for (const rm of realCarMeshes) { rm.count = cnt; rm.visible = true; rm.instanceMatrix.needsUpdate = true; }
        } else {
          for (const rm of realCarMeshes) { rm.count = 0; rm.visible = false; }
        }
      }
      carMesh.instanceMatrix.needsUpdate = true;
    }
    if (busMeshes.length) {
      for (let i = 0; i < vehicles.length; i++) {
        const mat = stepVehicle(vehicles[i], false, i);
        for (const bm of busMeshes) bm.setMatrixAt(i, mat);
      }
      for (const bm of busMeshes) bm.instanceMatrix.needsUpdate = true;
    }
  }
  for (const s of layers.poi.children) {
    const d = camera.position.distanceTo(s.position);
    s.visible = d < layers.poi.userData.range;
    if (s.visible) {
      const sc = Math.max(10, Math.min(44, d * 0.016));
      s.scale.set((s.userData.aspect || 3) * sc, sc, 1);
      s.material.opacity = d > layers.poi.userData.range * 0.8 ? 0.5 : 1;
    }
  }
  renderer.render(scene, camera);
  frames++; fpsT += dt; if (fpsT > 1) { $('stats').textContent = `${Math.round(frames / fpsT)} fps · ${renderer.info.render.triangles.toLocaleString()} tris · ${nb} buildings`; frames = 0; fpsT = 0; }
}
$('loading').style.display = 'none';
window.__ready = true;
requestAnimationFrame(frame);
