// The scroll pilot scene (plain three.js, driven by scroll progress 0..3):
//   0 hero   – the green head floats in its wire ball under the headline, facing you
//   1 iso    – the camera pulls back to a tight isometric view on the r of "research": everyone rolls along paths that are really letter outlines
//   2 track  – the camera tracks along the line to the r of "your" (still far too close to read)
//   3 aerial – it zooms out to straight overhead: the balls become coloured dots and the paths read as "A world of research on your case."
//   4 fill   – the type fills in
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { buildHead, initEnv, HEAD_COLORS } from './heads';
import { buildLetters, sampleContour } from './letters';

const V3 = THREE.Vector3;
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

export const SETTINGS = {
  count: 38,          // characters on the letters
  R: 0.66,            // ball radius (≈ the letters' stroke width, as in Will's frame 24)
  speed: 1.25,        // world units / s at a normal pace
  isoZoom: 2.8,       // iso half-height in world units: small enough that you can't tell the paths are letters
  pathGrey: '#cbcbcb', pathInk: '#1d1d1f', ballLine: '#b9b9b9',
};

export async function mountScene(canvas, { progress, fontUrl }) {
  const S = SETTINGS;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setClearColor('#ffffff');
  initEnv(renderer);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.3); sun.position.set(3, 10, 7); scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 3000);

  const L = await buildLetters(fontUrl, { size: 16 });

  // ---------- fat lines (constant pixel width at any zoom) ----------
  const fatMats = [], res = new THREE.Vector2();
  const fatMat = (color, w, opacity = 1) => { const m = new LineMaterial({ color, linewidth: w, transparent: true, opacity, depthWrite: false }); fatMats.push(m); return m; };
  const circle = (r, n, plane) => { const a = []; for (let i = 0; i < n; i++) { const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
    if (plane === 'xy') a.push(Math.cos(t0) * r, Math.sin(t0) * r, 0, Math.cos(t1) * r, Math.sin(t1) * r, 0); else a.push(Math.cos(t0) * r, 0, Math.sin(t0) * r, Math.cos(t1) * r, 0, Math.sin(t1) * r); } return a; };

  // ---------- the letter paths + the fill ----------
  const segs = [];
  for (const c of L.contours) for (let i = 0; i < c.pts.length; i++) { const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length]; segs.push(a.x, 0.01, a.z, b.x, 0.01, b.z); }
  const pathMat = fatMat(S.pathGrey, 5, 0);
  const paths = new LineSegments2(new LineSegmentsGeometry().setPositions(segs), pathMat); paths.renderOrder = 1; scene.add(paths);
  const fillGeo = new THREE.ShapeGeometry(L.shapes, 8); fillGeo.rotateX(Math.PI / 2);
  const fillMat = new THREE.MeshBasicMaterial({ color: S.pathInk, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const fill = new THREE.Mesh(fillGeo, fillMat); fill.position.y = 0.004; scene.add(fill);

  // ---------- the overhead "agent dots" (always on top) ----------
  const dotShader = (depthTest) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest,
    uniforms: { px: { value: renderer.getPixelRatio() } },
    vertexShader: 'attribute vec3 color; attribute float alpha; attribute float size; uniform float px; varying vec3 vC; varying float vA; void main(){ vC = color; vA = alpha; gl_PointSize = size * px; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float aa = smoothstep(0.5, 0.42, r); gl_FragColor = vec4(vC, vA * aa); }' });
  const makeDots = (n, depthTest) => { const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(n), 1)); g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(n), 1));
    const p = new THREE.Points(g, dotShader(depthTest)); p.frustumCulled = false; scene.add(p); return p; };
  const agentDots = makeDots(S.count, false); agentDots.renderOrder = 10;

  // ---------- characters ----------
  const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const usable = L.contours.filter((c) => c.len > S.R * 9);
  const totalLen = usable.reduce((a, c) => a + c.len, 0);
  const tmpV = new V3(), camFlat = new V3();
  const rFrom = L.glyphs.find((g) => g.line === 1 && g.idx === 0), rTo = L.glyphs.filter((g) => g.line === 1 && g.ch === 'r').pop();   // r of "research" -> r of "your"
  const agents = [];
  { const c = rFrom.contours.reduce((m, c) => (c.len > m.len ? c : m)); agents.push(makeAgent(0, c, c.len * 0.3)); }   // the hero starts on the r
  // spread them over the loops by length, keeping a ball's width apart
  for (let i = 1; i < S.count; i++) {
    let c, s, tries = 0;
    do { let r = Math.random() * totalLen; c = usable.find((u) => (r -= u.len) <= 0) || usable[0]; s = Math.random() * c.len; tries++; }
    while (tries < 60 && agents.some((o) => sampleContour(c, s, tmpV).distanceTo(o.pos) < S.R * 3));
    agents.push(makeAgent(i, c, s));
  }
  function makeAgent(i, c, s) {
    const hc = HEAD_COLORS[i % HEAD_COLORS.length];
    const a = { i, hc, c, s, dir: Math.random() < .5 ? 1 : -1, v: 0, vGoal: 1, moodT: rand(0, 3), fly: 0, flyGoal: 0, flyT: rand(5, 15), hopY: 0, hopV: 0, cool: 0,
      pos: new V3(), tan: new V3(), heading: new V3(1, 0, 0), rollQ: new THREE.Quaternion(), rollW: 0, rollAxis: new V3(1, 0, 0), yaw: 0, y: S.R, phase: rand(0, 6.3),
      dotCol: new THREE.Color(hc.dot), trailCol: new THREE.Color(hc.dot) };
    a.body = new THREE.Group(); scene.add(a.body);
    // wire ball: a camera-facing outline + two middle lines that turn with the roll
    a.outline = new LineSegments2(new LineSegmentsGeometry().setPositions(circle(S.R, 96, 'xy')), fatMat(S.ballLine, 1.4)); a.outline.frustumCulled = false; a.body.add(a.outline);
    a.outline.onBeforeRender = (r, sc, camera) => { a.outline.matrixWorld.compose(tmpV.setFromMatrixPosition(a.body.matrixWorld), camera.quaternion, a.outline.scale); a.outline.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, a.outline.matrixWorld); };
    a.rings = new THREE.Group(); a.body.add(a.rings);
    const r0 = new LineSegments2(new LineSegmentsGeometry().setPositions(circle(S.R, 96, 'xz')), fatMat(S.ballLine, 1.3, .9)); a.rings.add(r0);
    const r1 = new LineSegments2(new LineSegmentsGeometry().setPositions(circle(S.R, 96, 'xy')), fatMat(S.ballLine, 1.3, .9)); a.rings.add(r1);
    a.rollQ.setFromAxisAngle(new V3(1, 0, 0), rand(-.3, .3));
    a.head = buildHead(hc, S.R); scene.add(a.head.root);
    a.shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); a.shadow.scale.setScalar(S.R * 2.6); scene.add(a.shadow);
    sampleContour(c, s, a.pos, a.tan);
    return a;
  }
  const hero = agents[0];   // the green one is the hero on load

  // ---------- scroll + camera ----------
  let Pd = progress(), debugP = null, last = performance.now(), raf = 0, simT = 0;
  const heroSm = hero.pos.clone(), target = new V3(), up = new V3(), dirV = new V3();
  const k0 = { el: 0.2, az: 0 }, k1 = { el: Math.atan(1 / Math.SQRT2), az: Math.PI / 4 }, k2 = { el: Math.PI / 2 - 0.0005, az: 0 };
  const cGrey = new THREE.Color(S.pathGrey), cInk = new THREE.Color(S.pathInk);

  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    renderer.setSize(w, h, false); renderer.getDrawingBufferSize(res); fatMats.forEach((m) => m.resolution.copy(res));
    agentDots.material.uniforms.px.value = renderer.getPixelRatio();
  }
  addEventListener('resize', resize); resize();

  function updateAgent(a, dt, P, b) {
    const isHero = a === hero, live = sm(0.15, 0.9, P);              // nobody but the hero moves on load
    a.moodT -= dt; if (a.moodT <= 0) { const r = Math.random(); a.vGoal = r < .14 ? 0 : r < .24 ? 2.1 : rand(.7, 1.5); a.moodT = rand(1.5, 5); }
    a.v += (a.vGoal * S.speed * live - a.v) * Math.min(1, dt * 2.2);
    a.cool -= dt;
    // bump: someone right ahead -> bounce back the other way with a little hop
    for (const o of agents) { if (o === a) continue; const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < S.R * 2.05 && d > 1e-4 && a.cool <= 0 && (dx * a.heading.x + dz * a.heading.z) / d > 0.55) { a.dir *= -1; a.v *= .3; a.cool = .8; if (a.hopY <= 0.001) a.hopV = 2.2; } }
    const ds = a.v * dt * a.dir; a.s += ds;
    sampleContour(a.c, a.s, a.pos, a.tan); a.heading.copy(a.tan).multiplyScalar(a.dir);
    // hamster ball: rolls, now and then floats up for a while still spinning, hops when it bumps
    a.flyT -= dt; if (a.flyT <= 0) { if (a.flyGoal) { a.flyGoal = 0; a.flyT = rand(7, 18); } else { a.flyGoal = rand(.3, .7); a.flyT = rand(1.5, 4); } }
    a.fly += (a.flyGoal * live - a.fly) * Math.min(1, dt * 1.5);
    a.hopV -= 9 * dt; a.hopY = Math.max(0, a.hopY + a.hopV * dt); if (a.hopY === 0) a.hopV = Math.max(0, a.hopV);
    const heroLift = isHero ? (1 - sm(0, 0.85, P)) * 0.55 : 0, t = simT + a.phase;
    a.y = S.R + a.fly + a.hopY + heroLift + (a.fly + heroLift > .05 ? Math.sin(t * 2) * .05 : 0);
    if (a.fly + a.hopY + heroLift < .04 && Math.abs(ds) > 1e-6) { a.rollAxis.set(a.heading.z, 0, -a.heading.x).normalize(); a.rollW = Math.abs(ds) / dt / S.R; }
    else a.rollW = isHero && P < .5 ? lerp(a.rollW, .35, dt) : a.rollW * Math.exp(-dt * .9);   // floating hero turns slowly
    if (a.rollW > 1e-4) a.rollQ.premultiply(new THREE.Quaternion().setFromAxisAngle(a.rollAxis, a.rollW * dt));
    // show / hide: everyone pops in on the first scroll; from overhead the balls give way to dots
    const pop = isHero ? 1 : sm(0.25 + (a.i % 9) * .03, 0.75 + (a.i % 9) * .03, P), ballVis = pop * (1 - sm(0.35, 0.8, b));
    a.body.position.set(a.pos.x, a.y, a.pos.z); a.body.scale.setScalar(Math.max(1e-3, ballVis)); a.body.visible = ballVis > .01;
    a.rings.quaternion.copy(a.rollQ);
    // head: faces where it rolls, pulled toward the viewer (fully, for the hero on load); never rolls with the ball
    camFlat.subVectors(cam.position, target); camFlat.y = 0; const hasCam = camFlat.lengthSq() > 1e-4; if (hasCam) camFlat.normalize();
    const camW = hasCam ? (isHero ? lerp(1, .6, sm(0, 1, P)) : .6) : 0;
    const fx = a.heading.x * (1 - camW) + camFlat.x * camW, fz = a.heading.z * (1 - camW) + camFlat.z * camW;
    let d = Math.atan2(fx, fz) - a.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); a.yaw += d * Math.min(1, dt * 3.5);
    a.head.yaw.rotation.y = a.yaw;
    const el = Math.atan2(cam.position.y - target.y, Math.hypot(cam.position.x - target.x, cam.position.z - target.z));
    a.head.pitch.rotation.x = -el * .35 + Math.sin(t * 3.1) * .04 * Math.min(1, a.v);
    a.head.pitch.rotation.z = Math.sin(t * 2.3 + 1) * .05 * Math.min(1, a.v + .3);
    a.head.root.position.set(a.pos.x, a.y + Math.sin(t * 1.7 + 2) * .015, a.pos.z); a.head.root.scale.setScalar(Math.max(1e-3, ballVis)); a.head.root.visible = a.body.visible;
    a.shadow.position.set(a.pos.x, 0.006, a.pos.z); a.shadow.material.opacity = ballVis * sm(0.2, 0.9, P) / (1 + (a.y - S.R) * 2.5);
  }

  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; simT += dt;
    const P = debugP ?? progress(); Pd += (P - Pd) * Math.min(1, dt * 3);   // eases toward the scroll position
    const a = sm(0, 1, Pd), tr = sm(1, 2, Pd), b = sm(2, 3, Pd), c = sm(3, 4, Pd);
    for (const ag of agents) updateAgent(ag, dt, Pd, b);
    // camera: hero close-up -> iso (following the hero) -> straight overhead framing the whole sentence
    heroSm.lerp(hero.pos, Math.min(1, dt * 1.5));
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight, asp = w / h;
    const H0 = Math.max(2.9, 2.9 * 1.25 / asp), H1 = S.isoZoom;
    const H2 = Math.max((L.max.y - L.min.y) / 2 * 1.2, (L.max.x - L.min.x) / 2 * 1.18 / asp);
    // iso: start over the r of "research" (where the hero lands), track along the line to the r of "your", then pull out
    const t0 = new V3(hero.pos.x, hero.y + 0.62, hero.pos.z), t1 = heroSm.clone().lerp(rFrom.center, 0.5).setY(0.4).lerp(rTo.center.clone().setY(0.4), tr), t2 = L.center.clone();
    target.copy(t0).lerp(t1, a).lerp(t2, b);
    const el = lerp(lerp(k0.el, k1.el, a), k2.el, b), az = lerp(lerp(k0.az, k1.az, a), k2.az, b);
    const H = Math.exp(lerp(lerp(Math.log(H0), Math.log(H1), a), Math.log(H2), b));
    dirV.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    cam.position.copy(target).addScaledVector(dirV, 800);
    up.set(-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)).normalize(); cam.up.copy(up); cam.lookAt(target);
    cam.left = -H * asp; cam.right = H * asp; cam.top = H; cam.bottom = -H; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // paths: appear on the first scroll, go from soft grey + thick to thin ink from overhead; then the type fills
    pathMat.opacity = sm(0.1, 0.6, Pd); pathMat.color.copy(cGrey).lerp(cInk, b); pathMat.linewidth = lerp(5, 1.4, b);
    fillMat.opacity = c;
    // dots
    const dotVis = sm(0.45, 0.9, b);
    { const g = agentDots.geometry, P3 = g.attributes.position.array, C = g.attributes.color.array, A = g.attributes.alpha.array, Z = g.attributes.size.array;
      agents.forEach((ag, n) => { P3.set([ag.pos.x, 0.05, ag.pos.z], n * 3); C.set([ag.dotCol.r, ag.dotCol.g, ag.dotCol.b], n * 3); A[n] = dotVis; Z[n] = 11; });
      for (const k of ['position', 'color', 'alpha', 'size']) g.attributes[k].needsUpdate = true; }
    renderer.render(scene, cam);
  }
  raf = requestAnimationFrame(frame);

  return {
    agents, letters: L, settings: S,
    setProgress: (p) => { debugP = p; if (p !== null) Pd = p; },   // for testing: pin the scroll position
    dispose: () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); renderer.dispose(); },
  };
}
