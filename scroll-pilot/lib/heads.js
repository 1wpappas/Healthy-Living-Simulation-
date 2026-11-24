// Will's soft moulded plastic heads, ported from healthier/public/d1/yii.js (v30 heads): filleted outline -> rounded bevel extrude ->
// tessellate -> pillow-puffed faces -> dot eyes that follow the puff. Coloured per Will's "A world of research" frame.
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const YU = 2 / 212;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function poly(n, r, rot = 0) { const s = new THREE.Shape(); for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2, x = Math.sin(a) * r, y = Math.cos(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
const OUTLINES = { hexagon: () => poly(6, 66 * YU) };
const DEPTH = { hexagon: .56 }, EYES = { hexagon: .03 }, EYE_X = .295, EYE_R = .085, FILLET = { hexagon: .1 }, BEVEL = { hexagon: .09 };
const INFLATE = .07, THIN_W = .24;

function sdPoly(px, py, P) {
  let d = (px - P[0][0]) ** 2 + (py - P[0][1]) ** 2, s = 1;
  for (let i = 0, j = P.length - 1; i < P.length; j = i, i++) {
    const ex = P[j][0] - P[i][0], ey = P[j][1] - P[i][1], wx = px - P[i][0], wy = py - P[i][1];
    const h = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey))), bx = wx - ex * h, by = wy - ey * h;
    d = Math.min(d, bx * bx + by * by);
    const c1 = py >= P[i][1], c2 = py < P[j][1], c3 = ex * wy > ey * wx;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
  }
  return s * Math.sqrt(d);
}
function filletPts(src, r, n = 10) {
  const P = src.slice(); if (P.length > 2 && P[0].distanceTo(P[P.length - 1]) < 1e-6) P.pop();
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length];
    const da = a.clone().sub(p), db = b.clone().sub(p), la = da.length(), lb = db.length(); da.divideScalar(la); db.divideScalar(lb);
    const ang = Math.acos(Math.max(-1, Math.min(1, da.dot(db))));
    const t = Math.min(r / Math.tan(ang / 2), la * .45, lb * .45);
    const p1 = p.clone().addScaledVector(da, t), p2 = p.clone().addScaledVector(db, t);
    for (let k = 0; k <= n; k++) { const s = k / n, u = 1 - s; out.push(new THREE.Vector2(u * u * p1.x + 2 * u * s * p.x + s * s * p2.x, u * u * p1.y + 2 * u * s * p.y + s * s * p2.y)); }
  }
  return out;
}
const cache = {};
export function softHead(kind = 'hexagon') {
  if (cache[kind]) return cache[kind];
  const outer = OUTLINES[kind](), D = DEPTH[kind];
  const pts = filletPts(outer.getPoints(), FILLET[kind]), arr = pts.map((v) => [v.x, v.y]);
  const BT = Math.min(.15, D * .3), BS = BEVEL[kind];
  let g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: D - 2 * BT, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelOffset: -BS, bevelSegments: 6, curveSegments: 12, steps: 1 });
  g.translate(0, 0, -(D - 2 * BT) / 2);
  g = new TessellateModifier(.05, 8).modify(g);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position, n = pos.count, thin = new Float32Array(n), uv = new Float32Array(n * 2);
  const pillow = (x, y) => INFLATE * sstep(0, .32, Math.max(0, -sdPoly(x, y, arr)));
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), inside = Math.max(0, -sdPoly(x, y, arr));
    pos.setZ(i, z + Math.sign(z) * pillow(x, y) * Math.min(1, Math.abs(z) / (D / 2)));
    thin[i] = 1 - sstep(0, THIN_W, inside);
    uv[i * 2] = x + z * .6; uv[i * 2 + 1] = y + z * .6;
  }
  g.setAttribute('thin', new THREE.BufferAttribute(thin, 1)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals(); g.computeBoundingBox();
  const eyeGeo = (ex, ey) => {
    const e = new THREE.RingGeometry(0, EYE_R, 40, 6), p = e.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, pillow(ex + p.getX(i), ey + p.getY(i)) - pillow(ex, ey));
    e.computeVertexNormals(); return e;
  };
  const bb = g.boundingBox;
  return (cache[kind] = { geo: g, eyes: [-1, 1].map((sd) => { const ex = sd * EYE_X, ey = EYES[kind]; return { geo: eyeGeo(ex, ey), pos: [ex, ey, D / 2 + pillow(ex, ey) + .006] }; }),
    h: Math.max(bb.max.y - bb.min.y, (bb.max.x - bb.min.x) / .87), cy: (bb.max.y + bb.min.y) / 2 });
}

let normalTex = null, envTex = null;
function grainMap(S = 256) {
  if (normalTex) return normalTex;
  const h = new Float32Array(S * S), rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (const [cell, amp] of [[4, .6], [2, .4]]) {
    const G = S / cell, grid = Array.from({ length: (G + 1) * (G + 1) }, rnd);
    for (let gy = 0; gy <= G; gy++) grid[gy * (G + 1) + G] = grid[gy * (G + 1)];
    for (let gx = 0; gx <= G; gx++) grid[G * (G + 1) + gx] = grid[gx];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const fx = x / cell, fy = y / cell, ix = Math.floor(fx), iy = Math.floor(fy), tx = sstep(0, 1, fx - ix), ty = sstep(0, 1, fy - iy);
      const a = grid[iy * (G + 1) + ix], b = grid[iy * (G + 1) + ix + 1], c = grid[(iy + 1) * (G + 1) + ix], d = grid[(iy + 1) * (G + 1) + ix + 1];
      h[y * S + x] += amp * ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty);
    }
  }
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const ctx = cv.getContext('2d'), img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S]) * 2, dy = (h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x]) * 2;
    const l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    img.data[o] = (-dx / l * .5 + .5) * 255; img.data[o + 1] = (-dy / l * .5 + .5) * 255; img.data[o + 2] = (1 / l * .5 + .5) * 255; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.colorSpace = THREE.NoColorSpace;
  return (normalTex = t);
}
export function initEnv(renderer) { if (!envTex) { const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); } }
function glowPatch(m, glowHex) {   // d1 edge glow: the thin rim of the moulding catches light
  m.onBeforeCompile = (sh) => {
    sh.uniforms.glowCol = { value: new THREE.Color(glowHex) }; sh.uniforms.glowAmt = { value: .24 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float thin;\nvarying float vThin;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvThin = thin;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 glowCol;\nuniform float glowAmt;\nvarying float vThin;')
      .replace('#include <opaque_fragment>', 'float headFr = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0);\noutgoingLight += glowCol * glowAmt * vThin * (0.35 + 0.65 * headFr);\n#include <opaque_fragment>');
  };
}
const matCache = {};
export function headMats(hc) {
  if (matCache[hc.head]) return matCache[hc.head];
  const head = new THREE.MeshPhysicalMaterial({ color: hc.head, roughness: .52, envMap: envTex, envMapIntensity: .35, sheen: .5,
    sheenColor: new THREE.Color(hc.head).lerp(new THREE.Color('#ffffff'), .5), sheenRoughness: .5, clearcoat: .25, clearcoatRoughness: .4,
    normalMap: grainMap(), normalScale: new THREE.Vector2(.05, .05) });
  glowPatch(head, new THREE.Color(hc.head).lerp(new THREE.Color('#ffffff'), .7));
  const eye = new THREE.MeshBasicMaterial({ color: hc.eye, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  return (matCache[hc.head] = { head, eye });
}
// sampled from Will's "A world of research on your case" frame: light moulded head + darker dot eyes; dot = the colour it becomes from above
export const HEAD_COLORS = [
  { name: 'green',  head: '#c5ee70', eye: '#55c06a', dot: '#a9dd4e' },
  { name: 'orange', head: '#f6bb80', eye: '#d0814f', dot: '#f2a86a' },
  { name: 'mint',   head: '#7aeeb8', eye: '#5fc8b3', dot: '#6ee3ae' },
  { name: 'blue',   head: '#a8c1d6', eye: '#3a4a75', dot: '#8fb0d2' },
  { name: 'red',    head: '#ee6878', eye: '#bb5f68', dot: '#e8586b' },
];

// a head, sized to fill a ball of radius R like the reference (head height = .665 of the ball's diameter)
export function buildHead(hc, R, kind = 'hexagon') {
  const c = softHead(kind), M = headMats(hc), s = R * 2 * 0.665 / c.h;
  const root = new THREE.Group(), yaw = new THREE.Group(), pitch = new THREE.Group(), mesh = new THREE.Group();
  root.add(yaw); yaw.add(pitch); pitch.add(mesh); mesh.scale.setScalar(s); mesh.position.y = -c.cy * s;
  mesh.add(new THREE.Mesh(c.geo, M.head));
  for (const e of c.eyes) { const m = new THREE.Mesh(e.geo, M.eye); m.position.set(...e.pos); mesh.add(m); }
  return { root, yaw, pitch };
}
