// Hero world: a scoped port of playground/index.html (the "Living Block" cone guys on a light grid).
// What came over: the flat-grid ground + light grid, ConeGuy agents that plan whole grid routes
// (long cardinal legs, 90° filleted turns, no self-crossing), soft moulded heads with dot eyes,
// line/dot/stamp/ribbon-outline trails, idle look-around, weeble rock pose.
// What stayed behind: lil-gui, DOM phrase labels, bloom/fisheye post, street camera, night preset,
// recording. The camera is a single ortho cam eased from isometric to top-down by scroll progress.
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };

// ---------- Settings (fixed — the playground's "sketch" defaults, flat-grid world) ----------
const S = {
  tempo: 1, coneGrid: true, avoidTrails: true, gridCell: 0.8, ribbonWidth: 0.3, trailHold: 5,
  trailLines: true, trailDots: true, trailStamps: true, trailStampLine: true, trailRibbonOut: true,
  ribOutWidth: 1, ribOutAlpha: 1, trailLife: 6, trailWidth: 1.8, trailDotSize: 2, stampSize: 3, trailLen: 4,
  heads: 20, headSize: 1.5, headWobble: 1, eyeSize: 1, eyeSpread: 0.8,
  gridFadeNear: 7, gridFadeFar: 28,
};
const world = 'flat-grid';
const gridded = () => world === 'flat-grid';
// flat-grid routes run through the CENTRES of the grid squares
const snapToCellCenter = (v, C) => (Math.round(v / C - 0.5) + 0.5) * C;

// trail kinds (playground defaults): lines, dots, dot-stamps, line-stamps, ribbon outlines
const TRAIL_KINDS = ['lines', 'dots', 'dotstamps', 'stampline', 'ribout'];
const TRAIL_FLAG = { lines: 'trailLines', dots: 'trailDots', dotstamps: 'trailStamps', stampline: 'trailStampLine', ribout: 'trailRibbonOut' };
const TRAIL_WEIGHT = { stampline: 0.25 };
const enabledTrailKinds = () => TRAIL_KINDS.filter(k => S[TRAIL_FLAG[k]]);
let trailPool = [];
const dealTrails = () => { trailPool = enabledTrailKinds(); };
const pickTrail = () => { if (!trailPool.length) return 'off'; let tot = 0; for (const k of trailPool) tot += TRAIL_WEIGHT[k] || 1; let r = Math.random() * tot; for (const k of trailPool) { r -= TRAIL_WEIGHT[k] || 1; if (r <= 0) return k; } return trailPool[trailPool.length - 1]; };
const ribbonKind = (k) => k === 'ribbon';
const stampKind = (k) => k === 'dotstamps' || k === 'stampline';
const dispKind = (k) => k === 'lines' ? 'line' : k === 'dots' ? 'dot' : null;
const effTrailKind = (a) => a.trailKind || 'off';

export function mountHeroWorld(canvas, { progress }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setClearColor('#ffffff');

  // ---------- Scene: flat floor, lights, light grid (sketch preset colours) ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  const HALF = 10;
  const groundMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 12, HALF * 2 + 12), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.scale.setScalar(10); scene.add(ground);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(4, 10, 6); scene.add(sun);

  const gridMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#a9a9a9') }, uCam: { value: new THREE.Vector2() },
      uNear: { value: S.gridFadeNear }, uFar: { value: S.gridFadeFar }, uFade: { value: 0 } },
    vertexShader: `varying vec2 vXZ; void main(){ vXZ = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform vec2 uCam; uniform float uNear, uFar, uFade; varying vec2 vXZ;
      void main(){ float f = uFade * smoothstep(uNear, uFar, distance(vXZ, uCam)); gl_FragColor = vec4(uColor, 0.5 * (1.0 - f)); }`,
    transparent: true, depthWrite: false,
  });
  const gridMesh = new THREE.LineSegments(new THREE.BufferGeometry(), gridMat);
  gridMesh.frustumCulled = false; gridMesh.position.y = 0.001; gridMesh.visible = true; scene.add(gridMesh);
  function rebuildGrid() {
    const C = S.gridCell, N = Math.ceil(32 / C), pos = [];
    for (let i = -N; i <= N; i++) { const v = i * C;
      pos.push(v, 0, -N * C, v, 0, N * C, -N * C, 0, v, N * C, 0, v); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gridMesh.geometry.dispose(); gridMesh.geometry = g;
  }
  rebuildGrid();

  const hillY = () => 0;
  const isFree = (x, z, r) => Math.abs(x) <= HALF - r && Math.abs(z) <= HALF - r;
  function randomFree(r) {
    const C = S.gridCell, M = Math.floor((HALF - r) / C);
    for (let i = 0; i < 500; i++) { const x = snapToCellCenter((((Math.random() * (2 * M + 1)) | 0) - M) * C, C), z = snapToCellCenter((((Math.random() * (2 * M + 1)) | 0) - M) * C, C); if (isFree(x, z, r)) return new V3(x, 0, z); }
    return new V3(0, 0, 0);
  }

  // ---------- Trails ----------
  const MAX_SEG = 24000;
  const trailGeo = new LineSegmentsGeometry();
  trailGeo.setPositions(new Float32Array(MAX_SEG * 6)); trailGeo.setColors(new Float32Array(MAX_SEG * 6));
  const trailMat = new LineMaterial({ linewidth: S.trailWidth, vertexColors: true, worldUnits: false, transparent: true });
  const trailMesh = new LineSegments2(trailGeo, trailMat);
  trailMesh.frustumCulled = false; trailMesh.position.y = 0.012; trailMesh.renderOrder = 4.5; scene.add(trailMesh);
  let trails = [];   // each: { pts: [{p, t, u?, bt?}], c: THREE.Color, disp: 'line'|'dot'|null, ... }
  const cGround = new THREE.Color('#ffffff'), cTmp = new THREE.Color(), cRibbon = new THREE.Color(), cHsl = {};
  function ribbonColor(ch) {
    cRibbon.set(ch.head); cRibbon.getHSL(cHsl);
    cRibbon.setHSL(cHsl.h + rand(-0.012, 0.012), cHsl.s * rand(0.7, 0.88), rand(0.84, 0.92));
    return cRibbon;
  }
  function ageColor(age, base, out, fade) {
    const u = age / S.trailLife; out.copy(base);
    if (u > 0.3) out.lerp(fade || cGround, Math.min(1, (u - 0.3) / 0.7));
    return out;
  }
  function distColor(u, base, out, fade) {
    out.copy(base);
    if (u > 0.3) out.lerp(fade || cGround, Math.min(1, (u - 0.3) / 0.7));
    return out;
  }
  function addLine(points, c) { const l = { pts: points, c }; trails.push(l); return l; }
  function addRing(center, r, t, c, a0 = 0, a1 = Math.PI * 2, steps = 14) {
    const pts = []; for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; pts.push({ p: new V3(center.x + Math.cos(a) * r, 0, center.z + Math.sin(a) * r), t }); }
    return addLine(pts, c);
  }
  const addNode = (p, t, c) => { const l = addRing(p, 0.065, t, c, 0, Math.PI * 2, 12); l.node = p.clone(); return l; };

  const MAX_DOT = 40000, dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_DOT * 3), 3));
  dotGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_DOT * 3), 3));
  dotGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_DOT), 1));
  const dotMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true,
    uniforms: { px: { value: 1 } },
    vertexShader: 'attribute float size; varying vec3 vC; uniform float px; void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_PointSize = size * px; }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; if (dot(d,d) > 0.25) discard; gl_FragColor = vec4(vC,1.0);\n#include <colorspace_fragment>\n}' });
  const dotMesh = new THREE.Points(dotGeo, dotMat);
  dotMesh.frustumCulled = false; dotMesh.position.y = 0.014; dotMesh.renderOrder = 4.6; scene.add(dotMesh);

  const DOT_GAP = 0.17;
  function updateDots(now) {
    const life = S.trailLife, pos = dotGeo.attributes.position.array, col = dotGeo.attributes.color.array, siz = dotGeo.attributes.size.array;
    dotMat.uniforms.px.value = Math.min(2, devicePixelRatio);
    let n = 0; const put = (p, age, c, sz, fade, pop, u, bt) => { if (n >= MAX_DOT || age >= life || (bt != null && now < bt)) return; pos.set([p.x, p.y, p.z], n * 3); if (pop) col.set([c.r, c.g, c.b], n * 3); else { const uu = u == null ? age / life : Math.max(u, Math.min(1, age / life)); distColor(uu, c, cTmp, fade); col.set([cTmp.r, cTmp.g, cTmp.b], n * 3); } siz[n] = sz; n++; };
    const tmp = new V3();
    for (const l of trails) {
      if (l.disp !== 'dot') continue;
      if (l.node) { put(l.node, now - l.pts[0].t, l.c, S.trailDotSize * 1.5, l.fade); continue; }
      let carry = 0;
      for (let i = 0; i < l.pts.length - 1; i++) {
        const a = l.pts[i], b = l.pts[i + 1], L = a.p.distanceTo(b.p);
        const ua = a.u == null || b.u == null ? null : a.u, ub = a.u == null || b.u == null ? null : b.u, bta = a.bt, btb = b.bt;
        let s = carry; for (; s <= L; s += DOT_GAP) { const k = L ? s / L : 0; tmp.lerpVectors(a.p, b.p, k); put(tmp, now - (a.t + (b.t - a.t) * k), l.c, S.trailDotSize, l.fade, l.pop, ua == null ? null : ua + (ub - ua) * k, bta == null || btb == null ? null : bta + (btb - bta) * k); }
        carry = s - L;
      }
    }
    dotGeo.attributes.position.needsUpdate = dotGeo.attributes.color.needsUpdate = dotGeo.attributes.size.needsUpdate = true; dotGeo.setDrawRange(0, n);
    dotMesh.visible = n > 0;
  }
  const LINE_PASSES = [{ geo: trailGeo, mesh: trailMesh, disp: 'line' }];
  function updateTrails(now) {
    const life = S.trailLife; trails = trails.filter(l => l.pts.length && now - l.pts[l.pts.length - 1].t < life);
    for (const P of LINE_PASSES) {
      const posArr = P.geo.attributes.instanceStart.data.array, colArr = P.geo.attributes.instanceColorStart.data.array;
      let n = 0;
      outer: for (const l of trails) { if (l.disp !== P.disp) continue; for (let i = 0; i < l.pts.length - 1; i++) {
        if (n >= MAX_SEG) break outer;
        const a = l.pts[i], b = l.pts[i + 1], aa = now - a.t, ab = now - b.t;
        if (aa >= life && ab >= life) continue;
        posArr.set([a.p.x, a.p.y, a.p.z, b.p.x, b.p.y, b.p.z], n * 6);
        const ua = a.u == null ? null : Math.max(a.u, Math.min(1, aa / life)), ub = b.u == null ? null : Math.max(b.u, Math.min(1, ab / life));
        if (ua == null) ageColor(aa, l.c, cTmp, l.rc); else distColor(ua, l.c, cTmp, l.rc); colArr[n * 6] = cTmp.r; colArr[n * 6 + 1] = cTmp.g; colArr[n * 6 + 2] = cTmp.b;
        if (ub == null) ageColor(ab, l.c, cTmp, l.rc); else distColor(ub, l.c, cTmp, l.rc); colArr[n * 6 + 3] = cTmp.r; colArr[n * 6 + 4] = cTmp.g; colArr[n * 6 + 5] = cTmp.b;
        n++;
      } }
      P.geo.attributes.instanceStart.data.needsUpdate = true; P.geo.attributes.instanceColorStart.data.needsUpdate = true;
      P.geo.instanceCount = n;
      P.mesh.visible = n > 0;
    }
    updateDots(now);
  }

  // ---------- Stamp trails + ribbon bands ----------
  const stampGroup = new THREE.Group(); scene.add(stampGroup);
  const STAMP_GAP = 2, STAMP_CHANCE = 0.4, STAMP_UNWIND = 1.2;
  let stampSpots = [];
  let simTime = 0;
  const CAP = new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2);
  class PathRibbon {
    constructor(color) {
      this.max = 600; this.pts = []; const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.max * 6), 3));
      const idx = []; for (let i = 0; i < this.max - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx); this.geo = g;
      this.mat = new THREE.MeshBasicMaterial({ color, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, transparent: true });
      this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.position.y = 0.009;
      this.caps = [new THREE.Mesh(CAP, this.mat), new THREE.Mesh(CAP, this.mat)]; this.caps.forEach(c => { c.renderOrder = 4; });
      stampGroup.add(this.mesh, ...this.caps);
    }
    setColor(c) { this.mat.color.set(c); }
    push(p, now) { const last = this.pts[this.pts.length - 1]; if (last && Math.hypot(last.p.x - p.x, last.p.z - p.z) < 0.05) { last.t = now; return; } this.pts.push({ p: new V3(p.x, 0, p.z), t: now }); if (this.pts.length > this.max) this.pts.shift(); }
    update(now, life, w, on) {
      while (this.pts.length > 2 && now - this.pts[1].t > life) this.pts.shift();
      const n = this.pts.length, show = on && n > 1; this.mesh.visible = show; this.caps.forEach(c => c.visible = show); if (!show) return;
      const t0 = this.pts[0], t1 = this.pts[1], age = now - t0.t;
      const tail = age > life ? t0.p.clone().lerp(t1.p, Math.min(1, (age - life) / Math.max(1e-3, t1.t - t0.t))) : t0.p;
      const pos = this.geo.attributes.position.array, h = w / 2;
      for (let i = 0; i < n; i++) {
        const q = i === 0 ? tail : this.pts[i].p, a = i === 0 ? tail : this.pts[i - 1].p, b = this.pts[Math.min(n - 1, i + 1)].p;
        let dx = b.x - a.x, dz = b.z - a.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
        pos.set([q.x - dz * h, 0, q.z + dx * h, q.x + dz * h, 0, q.z - dx * h], i * 6);
      }
      this.geo.attributes.position.needsUpdate = true; this.geo.setDrawRange(0, (n - 1) * 6);
      this.caps[0].position.set(tail.x, 0.009, tail.z); this.caps[1].position.set(this.pts[n - 1].p.x, 0.009, this.pts[n - 1].p.z); this.caps.forEach(c => c.scale.setScalar(w));
    }
    fromPath(path, s0, s1, w, off = 0) {
      const show = s1 - s0 > 0.02; this.mesh.visible = show; this.caps.forEach(c => c.visible = show); if (!show) return;
      const pos = this.geo.attributes.position.array, h = w / 2, P = path.pts; let n = 0;
      const put = (x, z, nx, nz) => { if (n >= this.max) return; pos.set([x + nx * (off + h), 0, z + nz * (off + h), x + nx * (off - h), 0, z + nz * (off - h)], n * 6); n++; };
      const a = pathAt(path, s0), b = pathAt(path, s1); put(a.x, a.z, a.nx, a.nz);
      for (let i = pathIdx(path, s0) + 1; i < P.length && path.cum[i] < s1; i++) put(P[i][0], P[i][1], path.nrm[i][0], path.nrm[i][1]);
      put(b.x, b.z, b.nx, b.nz);
      this.geo.attributes.position.needsUpdate = true; this.geo.setDrawRange(0, (n - 1) * 6);
      this.caps[0].position.set(a.x + a.nx * off, 0.009, a.z + a.nz * off); this.caps[1].position.set(b.x + b.nx * off, 0.009, b.z + b.nz * off); this.caps.forEach(c => c.scale.setScalar(w));
    }
    hide() { this.mesh.visible = false; this.caps.forEach(c => c.visible = false); }
    clear() { this.pts = []; }
    dispose() { stampGroup.remove(this.mesh, ...this.caps); this.geo.dispose(); this.mat.dispose(); }
  }

  // ---------- Characters: soft heads (ported from the playground's yii.js moulded heads) ----------
  const headGroup = new THREE.Group(); scene.add(headGroup);
  const X_AXIS = new V3(1, 0, 0);
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  function makeShadow(size) { const m = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    m.scale.setScalar(size); m.position.y = 0.006; headGroup.add(m); return m; }
  const agentGroup = new THREE.Group(); scene.add(agentGroup);

  const YU = 2 / 212;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function yPoly(n, r, rot = 0) { const s = new THREE.Shape(); for (let i = 0; i < n; i++) { const a = rot + i / n * Math.PI * 2, x = Math.sin(a) * r, y = Math.cos(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
  function yStar(points, ro, ri) { const s = new THREE.Shape(); for (let i = 0; i < points * 2; i++) { const a = i / (points * 2) * Math.PI * 2, r = i % 2 ? ri : ro, x = Math.sin(a) * r, y = Math.cos(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath(); return s; }
  function yRect(w, h) { const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath(); return s; }
  const Y_OUTLINES = {
    triangle: () => { const o = new THREE.Shape(); o.moveTo(-82 * YU, -55 * YU); o.lineTo(82 * YU, -55 * YU); o.lineTo(-4 * YU, 70 * YU); o.closePath(); return o; },
    hexagon: () => yPoly(6, 66 * YU),
    star: () => yStar(8, 69 * YU, 48 * YU),
    square: () => yRect(110 * YU, 110 * YU),
  };
  const Y_DEPTH = { triangle: .5, hexagon: .56, star: .46, square: .9 };
  const Y_EYES = { triangle: -.117, hexagon: .03, star: -.026, square: -.107, circle: -.034 };
  const Y_EYE_X = .295, Y_EYE_R = .085;
  const Y_FILLET = { triangle: .1, hexagon: .1, star: .12, square: .1 };
  const Y_BEVEL = { triangle: .085, hexagon: .09, star: .075, square: .09 };
  const Y_INFLATE = .07, Y_THIN_W = .24;
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
  const softCache = {};
  function softHead(kind) {
    if (softCache[kind]) return softCache[kind];
    if (kind === 'circle') {
      const r = 60 * YU, g = new THREE.SphereGeometry(r, 72, 48), uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r, uv.getY(i) * Math.PI * r);
      g.setAttribute('thin', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(.3), 1));
      const zOn = (x, y) => Math.sqrt(Math.max(0, r * r - x * x - y * y));
      const eyeGeo = (ex, ey) => { const e = new THREE.RingGeometry(0, Y_EYE_R, 40, 6), p = e.attributes.position, z0 = zOn(ex, ey);
        for (let i = 0; i < p.count; i++) p.setZ(i, zOn(ex + p.getX(i), ey + p.getY(i)) - z0); e.computeVertexNormals(); return e; };
      return (softCache[kind] = { geo: g, eyeZ: (ex, ey) => zOn(ex, ey) + .006, eyeGeo, h: 2 * r });
    }
    const outer = Y_OUTLINES[kind](), D = Y_DEPTH[kind];
    const pts = filletPts(outer.getPoints(), Y_FILLET[kind]), arr = pts.map(v => [v.x, v.y]);
    const BT = Math.min(.15, D * .3), BS = Y_BEVEL[kind];
    let g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: D - 2 * BT, bevelEnabled: true, bevelThickness: BT, bevelSize: BS, bevelOffset: -BS, bevelSegments: 6, curveSegments: 12, steps: 1 });
    g.translate(0, 0, -(D - 2 * BT) / 2);
    g = new TessellateModifier(.05, 8).modify(g);
    g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g, 1e-4);
    const pos = g.attributes.position, n = pos.count, thin = new Float32Array(n), uv = new Float32Array(n * 2);
    const pillow = (x, y) => Y_INFLATE * sstep(0, .32, Math.max(0, -sdPoly(x, y, arr)));
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), inside = Math.max(0, -sdPoly(x, y, arr));
      pos.setZ(i, z + Math.sign(z) * pillow(x, y) * Math.min(1, Math.abs(z) / (D / 2)));
      thin[i] = 1 - sstep(0, Y_THIN_W, inside);
      uv[i * 2] = x + z * .6; uv[i * 2 + 1] = y + z * .6;
    }
    g.setAttribute('thin', new THREE.BufferAttribute(thin, 1)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeVertexNormals(); g.computeBoundingBox();
    const eyeGeo = (ex, ey) => {
      const e = new THREE.RingGeometry(0, Y_EYE_R, 40, 6), p = e.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, pillow(ex + p.getX(i), ey + p.getY(i)) - pillow(ex, ey));
      e.computeVertexNormals(); return e;
    };
    const bb = g.boundingBox;
    return (softCache[kind] = { geo: g, eyeZ: (ex, ey) => D / 2 + pillow(ex, ey) + .006, eyeGeo, h: Math.max(bb.max.y - bb.min.y, (bb.max.x - bb.min.x) / 0.87), cy: (bb.max.y + bb.min.y) / 2 });
  }
  const TOON_STEPS = (() => { const d = new Uint8Array([212, 212, 212, 255, 242, 242, 242, 255, 255, 255, 255, 255]); const t = new THREE.DataTexture(d, 3, 1); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();

  const HEAD_CHARS = {
    green:  { head: '#c5ee70', eye: '#55c06a', P: '#55c06a', S: '#c5ee70', move: 'hexagon' },
    orange: { head: '#f6bb80', eye: '#d0814f', P: '#e0904f', S: '#f6bb80', move: 'burst' },
    mint:   { head: '#7aeeb8', eye: '#5fc8b3', P: '#3fcf9a', S: '#7aeeb8', move: 'dodecagon' },
    blue:   { head: '#a8c1d6', eye: '#3a4a75', P: '#5b7bb0', S: '#a8c1d6', move: 'burst' },
    red:    { head: '#ee6878', eye: '#bb5f68', P: '#e44d62', S: '#ee6878', move: 'dodecagon' },
  };
  for (const c of Object.values(HEAD_CHARS)) { c.face = c.move; c.cP = new THREE.Color(c.P); c.cS = new THREE.Color(c.S); }
  for (const [k, c] of Object.entries(HEAD_CHARS)) c.key = k;

  // ---------- Cone guys ----------
  const CONE_PAL = { green: ['#cefc6f', '#458a00', 'hexagon'], orange: ['#ffd53d', '#dd5703', 'star'], mint: ['#c7feff', '#3600b3', 'triangle'],
    blue: ['#cfccff', '#5900ff', 'square'], red: ['#ffc2ef', '#ff00ae', 'circle'] };
  const CONE_KEYS = Object.keys(CONE_PAL);
  const CONE_CHARS = Object.fromEntries(CONE_KEYS.map(k => { const [f, st, shape] = CONE_PAL[k], h = HEAD_CHARS[k];
    return [k, { key: k, shape, head: f, eye: st, P: st, S: f, move: h.move, face: h.face, cP: new THREE.Color(st), cS: new THREE.Color(f) }]; }));

  const ORB_KINDS = {
    burst:     { speed: 1.0, weave: 0.7, weaveHz: 1.6, darts: 0.0, arcs: 0.0 },
    dodecagon: { speed: 1.05, weave: 0.15, weaveHz: 0.7, darts: 1.0, arcs: 0.0 },
    hexagon:   { speed: 0.85, weave: 0.1, weaveHz: 0.5, darts: 0.0, arcs: 1.0 },
  };

  // outlines via the stencil buffer (needs renderer stencil: true — set above)
  let coneIds = 0;
  function inkMat(color, w, ref, func, mask = 0xff, depth = true) {
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, toneMapped: false, depthTest: depth, depthWrite: false, transparent: true,
      stencilWrite: true, stencilRef: ref, stencilFunc: func, stencilFuncMask: mask, stencilWriteMask: 0, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
    m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${w.toFixed(5)};`); };
    m.customProgramCacheKey = () => 'ink' + w.toFixed(5);
    return m;
  }
  function coneMats(ch, id) {
    const HR = id * 2 + 1, BR = id * 2, st = (ref) => ({ stencilWrite: true, stencilRef: ref, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    const toon = (c, ref, extra = {}) => new THREE.MeshToonMaterial({ color: c, gradientMap: TOON_STEPS, emissive: new THREE.Color(c).multiplyScalar(.36), toneMapped: false, ...st(ref), ...extra });
    return {
      band: toon(new THREE.Color(ch.head).lerp(new THREE.Color(ch.eye), 0.16), BR), body: toon(ch.head, BR, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }), dark: toon(ch.eye, BR),
      fill: toon(ch.head, HR, { side: THREE.DoubleSide }),
      eye: new THREE.MeshBasicMaterial({ color: ch.eye, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, ...st(HR) }) };
  }
  const coneGeoCache = {};
  function coneGeos(u) {
    const k = u.toFixed(4); if (coneGeoCache[k]) return coneGeoCache[k];
    const R = 0.5 * u, H = 1.0 * u, NECK = 0.62 * u, TOP = NECK + 0.004 * u, HT = NECK + 0.02 * u, rAt = (y) => R * (1 - y / H), V = (x, y) => new THREE.Vector2(Math.max(1e-4, x), y);
    const bowl = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; bowl.push(V(Math.sin(a) * R, -Math.cos(a) * R)); }
    const cone = [V(R * 0.999, 0), V(rAt(TOP), TOP), V(0, TOP)];
    const B0 = NECK - 0.17 * u, band = [V(rAt(B0) + 0.002, B0), V(rAt(TOP) + 0.002, TOP), V(0, TOP)];
    const hull = bowl.slice(); hull.push(V(rAt(HT), HT), V(0, HT));
    return (coneGeoCache[k] = { R, H, bowl: new THREE.LatheGeometry(bowl, 48), cone: new THREE.LatheGeometry(cone, 48), band: new THREE.LatheGeometry(band, 48), hullBody: new THREE.LatheGeometry(hull, 48) });
  }

  function weighted(table) { let t = Math.random() * table.reduce((a, [, w]) => a + w, 0); for (const [k, w] of table) { if ((t -= w) <= 0) return k; } return table[0][0]; }
  let agents = [];
  class Agent {
    initMood() { this.tempo = rand(0.85, 1.15); this.mood = 1; this.moodGoal = 1; this.moodT = rand(1, 4); this.quietUntil = 0; }
    pace(dt) {
      this.moodT -= dt; if (this.moodT <= 0) { this.moodGoal = weighted([[rand(0.5, 0.8), 1], [rand(0.9, 1.2), 2], [rand(1.3, 1.7), 1]]); this.moodT = rand(3, 9); }
      this.mood += (this.moodGoal - this.mood) * Math.min(1, dt * 0.6);
      return S.tempo * this.tempo * this.mood;
    }
    nudge() {}
    dispose() { agentGroup.remove(this.body); headGroup.remove(this.head, this.shadow); this.disposeFace(); if (this.ribbon) this.ribbon.dispose(); }
  }

  class ConeGuy extends Agent {
    constructor(ch) {
      super(); this.initMood();
      this.ch = ch; this.kind = ORB_KINDS[ch.face]; this.U = 0.3; this.R = 0.46 * S.headSize; this.phase = rand(0, 6.28);
      this.pos = randomFree(0.7); this.heading = rand(0, Math.PI * 2); this.vel = new V3(); this.move = new V3(1, 0, 0);
      this.turnRate = 0; this.arcSign = Math.random() < 0.5 ? 1 : -1; this.arcT = rand(2, 5); this.rest = 0; this.dart = 0; this.spin = 0; this.walk = 0;
      this.body = new THREE.Group(); agentGroup.add(this.body);
      this.tilt = new THREE.Group(); this.body.add(this.tilt);
      this.shadow = makeShadow(this.R * 2.6);
      this.ropeN = 44; this.ropeSeg = 0.11; this.rope = { pts: [], c: ch.cP, disp: null, rc: null }; this.ropeK = null;
      this.stampAcc = 0;
      for (let i = 0; i < this.ropeN; i++) this.rope.pts.push({ p: new V3(this.pos.x, 0, this.pos.z), t: 0 });
      this.buildCone();
    }
    nudge() { this.vel.multiplyScalar(0.6); this.turnRate += rand(-2, 2); }
    freeAhead(h, dist) { for (const k of [0.35, 0.7, 1]) { const x = this.pos.x + Math.cos(h) * dist * k, z = this.pos.z + Math.sin(h) * dist * k; if (!isFree(x, z, this.R + 0.12)) return false; } return true; }
    update(dt, now) {
      const pace = this.pace(dt);
      let step, before;
      before = this.vel.clone(); step = this.gridStep(dt, pace, now);
      this.pos.add(step); const sp = this.vel.length(); if (sp > 0.05) this.move.copy(this.vel).normalize();
      const acc = this.vel.clone().sub(before).divideScalar(Math.max(dt, 1e-4));
      this.walk += step.length() / (this.U * 1.4);
      this.shadow.position.set(this.pos.x, hillY(this.pos.x, this.pos.z) + 0.006, this.pos.z);
      this.conePose(dt, now, sp, acc, now + this.phase, step);
      this.gridTrail(now);
    }
    dispose() { super.dispose(); trails = trails.filter(l => l !== this.rope); }
  }
  ConeGuy.prototype.buildCone = function () {
    this.u = this.R * 0.95; this.fly = 0; this.ballY = 0.06; this.rock = new V3(); this.rockV = new V3();
    this.figure = new THREE.Group(); this.tilt.add(this.figure);
    this.head = new THREE.Group(); this.yaw = new THREE.Group(); this.pitch = this.yaw; this.head.add(this.yaw); headGroup.add(this.head);
    this.dressCone(); this.yawNow = Math.atan2(this.move.x, this.move.z);
    const glow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: glowTex, color: this.ch.P, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(this.R * 3.2); glow.visible = false; headGroup.add(glow); this.glow = glow;
    this.path = new PathRibbon(ribbonColor(this.ch));
    this.disposeFace = () => { headGroup.remove(glow); this.path.dispose(); GRID_RESET(this); };
  };
  ConeGuy.prototype.dressCone = function () {
    if (!this.sid) this.sid = 1 + (coneIds++ % 126);
    const ch = this.ch, u = this.u, G = coneGeos(u), id = this.sid, M = coneMats(ch, id), W = u * 0.03;
    if (this.oldMats) this.oldMats.forEach(m => m.dispose());
    this.figure.clear(); this.yaw.clear();
    const bodyInk = inkMat(ch.eye, W, id * 2, THREE.NotEqualStencilFunc, 0xfe);
    const bowl = new THREE.Mesh(G.bowl, M.dark), cone = new THREE.Mesh(G.cone, M.body), band = new THREE.Mesh(G.band, M.band), hull = new THREE.Mesh(G.hullBody, bodyInk); hull.renderOrder = 6;
    [bowl, cone, band].forEach(m => m.renderOrder = 5);
    band.visible = false;
    this.figure.add(bowl, cone, band, hull);
    const kind = ch.shape, c = softHead(kind); this.headKind = kind;
    const bb = c.geo.boundingBox || (c.geo.computeBoundingBox(), c.geo.boundingBox), sz = bb.getSize(new V3()), s = 1.09 * u / Math.max(sz.x, sz.y) * (kind === 'square' ? 0.84 : 1);
    const mesh = new THREE.Group(); mesh.scale.setScalar(s); mesh.position.set(-(bb.min.x + bb.max.x) / 2 * s, -bb.min.y * s, -(bb.min.z + bb.max.z) / 2 * s);
    this.headMesh = new THREE.Mesh(c.geo, M.fill); this.headMesh.renderOrder = 5; mesh.add(this.headMesh);
    this.eyes = []; for (const sd of [-1, 1]) { const ex = sd * Y_EYE_X * S.eyeSpread, ey = Y_EYES[kind], e = new THREE.Mesh(c.eyeGeo(ex, ey), M.eye); e.scale.setScalar(S.eyeSize); e.position.set(ex, ey, c.eyeZ(ex, ey)); e.renderOrder = 5; mesh.add(e); this.eyes.push(e); }
    const headInk = inkMat(ch.eye, W / s, id * 2 + 1, THREE.NotEqualStencilFunc), chinInk = inkMat(ch.eye, W / s, id * 2, THREE.EqualStencilFunc, 0xff, false);
    this.hull = new THREE.Mesh(c.geo, headInk); this.hull.renderOrder = 6; mesh.add(this.hull);
    const chin = new THREE.Mesh(c.geo, chinInk); chin.renderOrder = 7; mesh.add(chin);
    this.yaw.add(mesh); this.neckY = 0.62 * u;
    this.oldMats = [...Object.values(M), bodyInk, headInk, chinInk];
  };
  ConeGuy.prototype.conePose = function (dt, now, sp, acc, t, step) {
    const u = this.u, R = 0.5 * u, g = hillY(this.pos.x, this.pos.z), w = S.headWobble, idle = sp < 0.15;
    const fwd = acc.x * this.move.x + acc.z * this.move.z, side = acc.z * this.move.x - acc.x * this.move.z;
    const goalP = THREE.MathUtils.clamp(fwd * 0.05, -0.32, 0.32) + Math.sin(this.walk * 2.4) * 0.06 * Math.min(1, sp) * w + (idle ? Math.sin(now * 1.7 + this.phase) * 0.03 * w : 0);
    const goalR = THREE.MathUtils.clamp(-side * 0.04, -0.25, 0.25) + Math.sin(this.walk * 1.2 + 1) * 0.08 * Math.min(1, sp) * w + (idle ? Math.sin(now * 2.3 + this.phase * 1.7) * 0.035 * w : 0);
    this.rockV.x += ((goalP - this.rock.x) * 60 - this.rockV.x * 7) * dt; this.rockV.z += ((goalR - this.rock.z) * 60 - this.rockV.z * 7) * dt;
    this.rock.x += this.rockV.x * dt; this.rock.z += this.rockV.z * dt;
    const ax = new V3(this.move.z, 0, -this.move.x), q = new THREE.Quaternion().setFromAxisAngle(ax, this.rock.x).multiply(new THREE.Quaternion().setFromAxisAngle(this.move, this.rock.z));
    this.tilt.quaternion.copy(q);
    this.body.position.set(this.pos.x, g + R + u * 0.03 + 0.01, this.pos.z); this.ballY = g + 0.06;
    this.shadow.scale.setScalar(u * 1.5); this.shadow.material.opacity = 1;
    if (!this.look) this.look = { y: 0, yT: 0, p: 0, pT: 0, t: rand(0.4, 1.8) };
    const L = this.look;
    if (idle) {
      L.t -= dt;
      if (L.t <= 0) {
        L.t = rand(1.4, 3.6);
        if (Math.random() < 0.3) {
          const cy = Math.atan2(cam.position.x - this.pos.x, cam.position.z - this.pos.z);
          const dy = cy - this.yawNow; L.yT = Math.atan2(Math.sin(dy), Math.cos(dy)); L.pT = rand(-0.05, 0.25);
        } else { L.yT = rand(-2.4, 0.8); L.pT = rand(-0.12, 0.3); }
      }
      L.y += (L.yT - L.y) * Math.min(1, dt * 3.2); L.p += (L.pT - L.p) * Math.min(1, dt * 3.2);
    } else {
      L.yT = 0; L.pT = 0; L.t = rand(0.5, 1.6);
      L.y += (0 - L.y) * Math.min(1, dt * 5); L.p += (0 - L.p) * Math.min(1, dt * 5);
    }
    if (this.stampSpin) this.yawNow += this.stampSpin * dt;
    else { let d = Math.atan2(this.move.x, this.move.z) - this.yawNow; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yawNow += d * Math.min(1, dt * 9); }
    this.yaw.rotation.y = this.yawNow + L.y;
    this.head.quaternion.copy(q); if (L.p) this.head.quaternion.multiply((this._lq || (this._lq = new THREE.Quaternion())).setFromAxisAngle(X_AXIS, L.p));
    this.head.position.set(0, this.neckY, 0).applyQuaternion(q).add(this.body.position);
    if (this.pop) { this.pop = Math.max(0, this.pop - dt * 2.2); this.head.scale.setScalar(1 + 0.32 * Math.sin(this.pop * Math.PI)); }
    if (gridded() || S.coneGrid) this.path.hide();
  };

  // ---------- Grid routes (plan whole path, roll it, lay the ribbon) ----------
  function planPath(route, step = 0.06) {
    const pts = [[route[0][0], route[0][1]]]; let cur = pts[0];
    const lineTo = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step)); for (let k = 1; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); };
    for (let i = 1; i < route.length; i++) {
      const B = route[i]; if (i === route.length - 1 || !B[2]) { lineTo(cur, B); cur = [B[0], B[1]]; continue; }
      const C = route[i + 1], r = B[2], l1 = Math.hypot(B[0] - cur[0], B[1] - cur[1]), l2 = Math.hypot(C[0] - B[0], C[1] - B[1]);
      const a = [(B[0] - cur[0]) / l1, (B[1] - cur[1]) / l1], b = [(C[0] - B[0]) / l2, (C[1] - B[1]) / l2];
      const th = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))), t = r * Math.tan(th / 2);
      const p1 = [B[0] - a[0] * t, B[1] - a[1] * t], p2 = [B[0] + b[0] * t, B[1] + b[1] * t]; lineTo(cur, p1);
      const nn = (a[0] * b[1] - a[1] * b[0]) > 0 ? [-a[1], a[0]] : [a[1], -a[0]], O = [p1[0] + nn[0] * r, p1[1] + nn[1] * r];
      const a0 = Math.atan2(p1[1] - O[1], p1[0] - O[0]); let da = Math.atan2(p2[1] - O[1], p2[0] - O[0]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const m = Math.max(2, Math.ceil(Math.abs(da) * r / step)); for (let k = 1; k <= m; k++) { const q = a0 + da * k / m; pts.push([O[0] + r * Math.cos(q), O[1] + r * Math.sin(q)]); }
      cur = p2;
    }
    const cum = [0], nrm = [];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; nrm.push([-(b[1] - a[1]) / L, (b[0] - a[0]) / L]); }
    return { pts, cum, nrm, len: cum[cum.length - 1] };
  }
  function pathIdx(p, s) { let lo = 0, hi = p.cum.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.cum[m] <= s) lo = m; else hi = m; } return lo; }
  function pathAt(p, s) {
    s = Math.max(0, Math.min(p.len, s)); const i = pathIdx(p, s), j = Math.min(p.pts.length - 1, i + 1), u = (s - p.cum[i]) / Math.max(1e-6, p.cum[j] - p.cum[i]);
    const A = p.pts[i], B = p.pts[j], na = p.nrm[i], nb = p.nrm[j];
    return { x: A[0] + (B[0] - A[0]) * u, z: A[1] + (B[1] - A[1]) * u, nx: na[0] + (nb[0] - na[0]) * u, nz: na[1] + (nb[1] - na[1]) * u };
  }
  const GDIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const rotDir = (d, a) => { const c = Math.cos(a), s = Math.sin(a), x = d[0] * c - d[1] * s, z = d[0] * s + d[1] * c; return [Math.abs(x) < 1e-9 ? 0 : x, Math.abs(z) < 1e-9 ? 0 : z]; };
  ConeGuy.prototype.planRoute = function () {
    const C = S.gridCell, R = this.R * 0.7, w = S.ribbonWidth, GRID = gridded();
    const snap = GRID ? (v) => snapToCellCenter(v, C) : (v) => Math.round(v / C) * C;
    const sx = snap(this.pos.x), sz = snap(this.pos.z);
    const legFree = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.3); for (let k = 1; k <= n; k++) if (!isFree(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, R)) return false; return true; };
    const CELLSZ = w * 0.75, busy = new Set(), key = (x, z) => Math.floor(x / CELLSZ) + ',' + Math.floor(z / CELLSZ);
    for (const o of agents) if ((o === this || S.avoidTrails) && o.jr) for (const j of o.jr) {
      const s1 = j === o.cur ? j.path.len : j.head;
      for (let q = j.tail; q <= s1; q += CELLSZ * 0.5) { const a = pathAt(j.path, q); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) busy.add(key(a.x + dx * CELLSZ, a.z + dz * CELLSZ)); }
    }
    const othersNear = (q) => agents.some(o => o !== this && o.goal && Math.hypot(o.goal[0] - q[0], o.goal[1] - q[1]) < C * 1.5);
    for (let tries = 0; tries < (S.avoidTrails ? 90 : 60); tries++) {
      let dir = tries < 40 && this.rdir ? this.rdir : GDIRS[(Math.random() * 4) | 0].slice(), p = [sx, sz];
      if (this.lastDir && dir[0] * this.lastDir[0] + dir[1] * this.lastDir[1] < -0.5) continue;
      const route = [[sx, sz]]; let ok = true;
      const legs = 2 + ((Math.random() * 3) | 0);
      for (let k = 0; k < legs && ok; k++) {
        const diag = !GRID && Math.abs(dir[0]) > 1e-6 && Math.abs(dir[1]) > 1e-6, cells = diag ? 2 + ((Math.random() * 2) | 0) : 2 + ((Math.random() * 3) | 0);
        let q = [p[0] + dir[0] * cells * C * (diag ? Math.SQRT2 : 1), p[1] + dir[1] * cells * C * (diag ? Math.SQRT2 : 1)];
        if (GRID) q = [snap(q[0]), snap(q[1])];
        if (!legFree(p, q)) { ok = false; break; }
        p = q; const sg = Math.random() < 0.5 ? 1 : -1, turn = GRID ? Math.PI / 2 * sg : diag ? Math.PI / 4 * sg : Math.random() < 0.18 ? Math.PI / 4 * sg : Math.PI / 2 * sg;
        route.push([p[0], p[1], Math.min(C * 0.8, w * 1.55)]); dir = rotDir(dir, turn);
      }
      if (!ok) continue;
      const diag = !GRID && Math.abs(dir[0]) > 1e-6 && Math.abs(dir[1]) > 1e-6, L = (2 + ((Math.random() * 3) | 0)) * C * (diag ? Math.SQRT2 : 1);
      let end = [p[0] + dir[0] * L, p[1] + dir[1] * L];
      if (GRID) end = [snap(end[0]), snap(end[1])];
      if (!legFree(p, end) || othersNear(end)) continue;
      route.push(end);
      const path = planPath(route); path.rf = { pts: path.pts, cum: path.cum, len: path.len };
      const P = path.pts; let crosses = false;
      for (let i = 0; i < P.length && !crosses; i += 4) for (let j = i + 4; j < P.length; j += 4) if (path.cum[j] - path.cum[i] > w * 5 && Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1]) < w * 1.6) { crosses = true; break; }
      if (crosses) continue;
      if (busy.size) { let hit = false; for (let i = 0; i < P.length && !hit; i += 3) if (path.cum[i] > w * 1.2 && busy.has(key(P[i][0], P[i][1]))) hit = true; if (hit) continue; }
      this.rdir = dir; this.lastDir = dir; this.goal = end; return path;
    }
    this.rdir = null; return null;
  };
  ConeGuy.prototype.gridStep = function (dt, pace, now) {
    if (!this.jr) { this.jr = []; this.ribPool = []; this.cur = null; this.gWait = rand(0, 1.2); }
    const base = 1.15 * pace, w = S.ribbonWidth, kind = effTrailKind(this), on = ribbonKind(kind), isOut = kind === 'ribout';
    // world-unit width for the ribbon-outline strips: trailWidth px -> world units at the current ortho zoom
    const outW = isOut ? S.ribOutWidth * (S.trailWidth * frustum / Math.max(1, bufH)) : 0;
    const before = new V3(this.pos.x, 0, this.pos.z);
    if (!this.cur) {
      if ((this.gWait -= dt) <= 0) {
        const path = this.planRoute();
        if (path) { const rib = this.ribPool.pop() || new PathRibbon(this.ch.head); rib.setColor(ribbonColor(this.ch)); this.cur = { path, head: 0, tail: 0, state: 'roll', rib, t: 0, born: now, spd: Math.max(0.05, base), mul: 0.7, mulGoal: rand(0.85, 1.3), stampS: 0 }; this.jr.push(this.cur);
          const a = pathAt(path, 0); this.pos.set(a.x, this.pos.y, a.z); before.set(a.x, 0, a.z); }
        else this.gWait = rand(0.6, 1.2);
      }
    }
    if (this.cur) {
      const j = this.cur; j.t += dt;
      j.mul += (j.mulGoal - j.mul) * Math.min(1, dt * 0.8);
      if (Math.random() < dt * 0.12) j.mulGoal = rand(0.8, 1.4);
      const ramp = 1 - Math.pow(1 - Math.min(1, j.t * 2.5), 3);
      const left = j.path.len - j.head, endU = THREE.MathUtils.clamp(left / 1.4, 0, 1), endEase = endU * endU * (3 - 2 * endU);
      const v = Math.max(0.05, base * j.mul * (0.35 + 0.65 * ramp) * (0.15 + 0.85 * endEase));
      if (j.stamp) j.spd = 0; else { j.head = Math.min(j.path.len, j.head + v * dt); j.spd = v; }
      const a = pathAt(j.path, j.head); this.pos.set(a.x, this.pos.y, a.z);
      if (j.head >= j.path.len) { j.state = 'linger'; j.hold = S.trailHold; this.cur = null; this.gWait = rand(0.4, 1.4); }
    }
    for (let i = this.jr.length - 1; i >= 0; i--) {
      const j = this.jr[i];
      if (j.state === 'linger' && (j.hold -= dt) <= 0) j.state = 'lift';
      if (j.state === 'roll' || j.state === 'linger') j.tail = Math.max(0, j.head - S.trailLen);
      if (j.state === 'lift') { j.tail += (j.spd || base) * 1.6 * dt; if (j.tail >= j.head) { j.rib.hide(); if (j.ribB) { j.ribB.hide(); this.ribPool.push(j.ribB); j.ribB = null; } this.ribPool.push(j.rib); this.jr.splice(i, 1); continue; } }
      if (isOut) {
        const Cw = S.ribbonWidth * 0.5;
        j.rib.fromPath(j.path, j.tail, j.head, outW, Cw);
        if (!j.ribB) j.ribB = this.ribPool.pop() || new PathRibbon(this.ch.head);
        j.ribB.fromPath(j.path, j.tail, j.head, outW, -Cw);
        j.rib.setColor(this.ch.cP); j.ribB.setColor(this.ch.cP); j.rib.mat.opacity = j.ribB.mat.opacity = S.ribOutAlpha;
      } else {
        if (j.ribB) { j.ribB.hide(); this.ribPool.push(j.ribB); j.ribB = null; }
        if (on) j.rib.fromPath(j.path, j.tail, j.head, w); else j.rib.hide();
      }
    }
    const step = new V3(this.pos.x - before.x, 0, this.pos.z - before.z); this.pos.sub(step);
    this.vel.copy(step).divideScalar(Math.max(dt, 1e-4));
    return step;
  };
  ConeGuy.prototype.layStamp = function (p, now) {
    const fd = ribbonKind(effTrailKind(this)) ? ribbonColor(this.ch).clone() : null;
    const C = S.gridCell, cx = snapToCellCenter(p.x, C), cz = snapToCellCenter(p.z, C), rr = S.stampSize * C / 2, pts = [];
    stampSpots = stampSpots.filter(s => simTime - s.t < S.trailLife);
    const minD = S.stampSize * C * 1.25;
    if (stampSpots.some(s => { const dx = s.x - cx, dz = s.z - cz; return dx * dx + dz * dz < minD * minD; })) return;
    stampSpots.push({ x: cx, z: cz, t: simTime });
    if (effTrailKind(this) === 'stampline') {
      const sp = 0.1;
      if (Math.random() < 0.5) { const n = Math.max(24, Math.round(2 * Math.PI * rr / sp)); for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; pts.push({ p: new V3(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr), t: simTime }); } }
      else { const side = 2 * rr, per = 4 * side, n = Math.max(24, Math.round(per / sp)); for (let i = 0; i <= n; i++) { const d = i / n * per, e = Math.floor(d / side) % 4, u = d - Math.floor(d / side) * side; const x = e === 0 ? -rr + u : e === 1 ? rr : e === 2 ? rr - u : -rr, z = e === 0 ? -rr : e === 1 ? -rr + u : e === 2 ? rr : rr - u; pts.push({ p: new V3(cx + x, 0, cz + z), t: simTime }); } }
      trails.push({ pts, c: this.ch.cP, disp: 'line' });
      const arm = C * 0.75;
      for (const [dx, dz] of [[1, 0], [0, 1]]) trails.push({ pts: [{ p: new V3(cx + dx * arm, 0, cz + dz * arm), t: simTime }, { p: new V3(cx - dx * arm, 0, cz - dz * arm), t: simTime }], c: this.ch.cP, disp: 'line' });
      return;
    }
    const put = (x, z, f) => pts.push({ p: new V3(x, 0, z), t: simTime - STAMP_UNWIND * (1 - f), bt: simTime + STAMP_UNWIND * f });
    if (Math.random() < 0.5) {
      const n = Math.max(10, Math.round((Math.PI * 2 * rr) / DOT_GAP));
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; put(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr, i / n); }
    } else {
      const side = 2 * rr, per = 4 * side, n = Math.max(12, Math.round(per / DOT_GAP));
      for (let i = 0; i <= n; i++) {
        const d = (i / n) * per, e = Math.floor(d / side) % 4, u = d - Math.floor(d / side) * side;
        const x = e === 0 ? -rr + u : e === 1 ? rr : e === 2 ? rr - u : -rr, z = e === 0 ? -rr : e === 1 ? -rr + u : e === 2 ? rr : rr - u;
        put(cx + x, cz + z, i / n);
      }
    }
    trails.push({ pts, c: this.ch.cP, disp: 'dot', fade: fd, pop: true });
    const arm = C * 0.75;
    for (const [dx, dz, f] of [[1, 0, 0], [0, 1, 0.5]]) {
      const t = simTime - STAMP_UNWIND * (1 - f), bt = simTime + STAMP_UNWIND * f;
      trails.push({ pts: [{ p: new V3(cx + dx * arm, 0, cz + dz * arm), t, bt }, { p: new V3(cx - dx * arm, 0, cz - dz * arm), t, bt }], c: this.ch.cP, disp: 'dot', fade: fd, pop: true });
    }
  };
  ConeGuy.prototype.gridTrail = function (now) {
    this.stampSpin = 0;
    const kind = effTrailKind(this), disp = dispKind(kind), stamp = stampKind(kind);
    const drop = (j) => { for (const k of ['trail', 'trailB']) { const t = j[k]; if (t) { const i = trails.indexOf(t); if (i >= 0) trails.splice(i, 1); j[k] = null; } } };
    const atS = (rf, s) => { s = Math.max(0, Math.min(rf.len, s)); const i = pathIdx(rf, s), j = Math.min(rf.pts.length - 1, i + 1);
      const u = (s - rf.cum[i]) / Math.max(1e-6, rf.cum[j] - rf.cum[i]), A = rf.pts[i], B = rf.pts[j];
      return [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u]; };
    for (const j of this.jr || []) {
      const rf = j.path.rf;
      if (stamp) {
        drop(j); this.stampSpin = 0;
        if (j !== this.cur || j.state !== 'roll') { j.stampS = Math.min(j.head, j.path.len); continue; }
        if (j.stamp) {
          const el = now - j.stamp.t0;
          if (el > 0.3 && el < 1.2) this.stampSpin = j.stamp.dir * 7;
          if (!j.stamp.dropped && el > 1.25) { this.layStamp(this.pos, now); j.stamp.dropped = true; }
          if (el > 1.7) j.stamp = null;
          continue;
        }
        if (!rf) { j.stampS = Math.min(j.head, j.path.len); continue; }
        const s1 = Math.min(j.head, j.path.len);
        let s = j.stampS || 0;
        for (; s < s1 - 1e-4; s += STAMP_GAP) { if (Math.random() < STAMP_CHANCE) j.stamp = { t0: now, dir: Math.random() < 0.5 ? -1 : 1, dropped: false }; }
        j.stampS = s; continue;
      }
      if (!disp) { drop(j); continue; }
      if (!rf) continue;
      const s0 = Math.max(0, j.tail), s1 = Math.min(j.head, j.path.len);
      if (s1 - s0 < 0.02) { drop(j); continue; }
      if (!j.trail) j.trail = { pts: [], c: this.ch.cP, disp, rc: ribbonKind(kind) ? ribbonColor(this.ch).clone() : null };
      const pts = [];
      const put = (s) => { const q = atS(rf, s); pts.push({ p: new V3(q[0], 0, q[1]), t: j.born + s / j.spd, u: (s1 - s) / (s1 - s0) }); };
      put(s0);
      for (let i = 1; i < rf.pts.length - 1; i++) if (rf.cum[i] > s0 + 1e-4 && rf.cum[i] < s1 - 1e-4) put(rf.cum[i]);
      put(s1);
      j.trail.pts = pts;
      j.trail.disp = disp;
      if (!trails.includes(j.trail)) trails.push(j.trail);
    }
  };
  const GRID_RESET = (a) => { a.stampSpin = 0; if (a.jr) { a.jr.forEach(j => { j.rib.dispose(); if (j.ribB) j.ribB.dispose(); for (const k of ['trail', 'trailB']) { const t = j[k]; if (t) { const i = trails.indexOf(t); if (i >= 0) trails.splice(i, 1); j[k] = null; } } }); (a.ribPool || []).forEach(r => r.dispose()); } a.jr = null; a.cur = null; a.ribPool = null; a.goal = null; };

  function makeConeGuy(key) { return new ConeGuy(CONE_CHARS[key]); }
  function populate() {
    agents.forEach(a => a.dispose()); agents = [];
    dealTrails();
    for (let i = 0; i < S.heads; i++) { const g = makeConeGuy(CONE_KEYS[i % CONE_KEYS.length]); g.trailKind = pickTrail(); agents.push(g); }
  }

  // ---------- Camera: ortho, isometric -> top-down driven by scroll progress ----------
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  const camTarget = new V3(0, 0, 0);
  const ISO = { el: Math.atan(1 / Math.SQRT2), az: Math.PI / 4, zoom: 1, lift: 0 };
  const TOP = { el: Math.PI / 2 - 0.0005, az: 0, zoom: 1, lift: 0 };
  let viewGoal = { ...ISO }, viewNow = { ...ISO }, frustum = 15, bufH = 1;
  const res = new THREE.Vector2();
  function placeCam() {
    const d = 40, tgt = camTarget.clone(); tgt.y += viewNow.lift || 0;
    cam.position.set(Math.cos(viewNow.el) * Math.sin(viewNow.az) * d, Math.sin(viewNow.el) * d, Math.cos(viewNow.el) * Math.cos(viewNow.az) * d).add(tgt);
    cam.lookAt(tgt); cam.updateMatrixWorld();
  }
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false); renderer.getDrawingBufferSize(res);
    trailMat.resolution.copy(res); bufH = res.y;
    const asp = w / h;
    // portrait: pull back so the grid still fills the frame edge-to-edge
    const f = asp >= 1 ? 15 : Math.min(26, (15 / asp) * 0.8);
    frustum = f;
    cam.left = -f * asp / 2; cam.right = f * asp / 2; cam.top = f / 2; cam.bottom = -f / 2; cam.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  // ---------- Populate + warm up so trails/ribbons already exist on first paint ----------
  populate();
  for (let i = 0; i < 360; i++) { simTime += 1 / 60; for (const a of agents) a.update(1 / 60, simTime); }
  updateTrails(simTime);

  const clock = new THREE.Clock();
  let Pd = progress(), raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, clock.getDelta());
    simTime += dt;
    for (const a of agents) a.update(dt, simTime);
    updateTrails(simTime);
    const P = progress(); Pd += (P - Pd) * Math.min(1, dt * 3);
    const e = sm(0, 1, Pd);
    viewGoal.el = lerp(ISO.el, TOP.el, e); viewGoal.az = lerp(ISO.az, TOP.az, e);
    const k = 1 - Math.exp(-dt * 4);
    viewNow.el += (viewGoal.el - viewNow.el) * k; viewNow.az += (viewGoal.az - viewNow.az) * k;
    placeCam();
    trailMat.linewidth = S.trailWidth;
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(frame);

  return {
    agents,
    getView: () => ({ el: viewNow.el, az: viewNow.az, frustum, progress: Pd }),
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
      agents.forEach(a => a.dispose());
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      renderer.dispose();
    },
  };
}
