const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const PAL = JSON.parse(fs.readFileSync(path.join(__dirname, 'cone-guy-palette.json'), 'utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR '+e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\/(.*)/, r => { const rel = r.request().url().split('three@0.160.0/')[1]; r.fulfill({ path: path.join(__dirname, 'node_modules/three', rel), contentType: 'text/javascript' }); });
  await p.route(/fonts\.(googleapis|gstatic)/, r => r.fulfill({ body: '', contentType: 'text/css' }));
  let html = fs.readFileSync(path.join(__dirname, '../playground/index.html'),'utf8')
    .replace('<script type="module">', '<script type="module">\nimport { GLTFExporter as __GLTFX } from \'three/addons/exporters/GLTFExporter.js\';')
    .replace('window.__lb = {', 'window.__ex = { Orb, HEAD_CHARS, S, GLTFExporter: __GLTFX }; window.__lb = {');
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>'+html+'</body></html>');
  await p.waitForTimeout(2500); await p.click('#btnPause');
  const FIGS = [['hexagon','green'],['star','orange'],['triangle','mint'],['square','blue'],['circle','red']];
  const out = await p.evaluate(async ({ FIGS, PAL }) => {
    const { THREE } = __lb, { Orb, HEAD_CHARS, S, GLTFExporter } = __ex; S.arrowShare = 0;
    const exp = new GLTFExporter(), res = {}, all = new THREE.Group(); all.name = 'cone-guys';
    const toGlb = (obj) => new Promise((ok, bad) => exp.parse(obj, (buf) => { const u = new Uint8Array(buf); let t = ''; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); ok(btoa(t)); }, bad, { binary: true }));
    // body: a cone standing on a half-sphere bowl (proportions from the 2D cone figures), ground at y = 0
    const R = 0.5, CONE_H = 1.0;
    const coneProfile = [new THREE.Vector2(0.0001, R + CONE_H), new THREE.Vector2(R, R)];
    const bowlProfile = []; for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; bowlProfile.push(new THREE.Vector2(Math.max(0.0001, Math.sin(a) * R), R - Math.cos(a) * R)); }
    bowlProfile.reverse(); // top rim first so normals face out
    let i = 0;
    for (const [shape, col] of FIGS) {
      const pal = PAL[col], fig = new THREE.Group(); fig.name = `cone-${shape}-${col}`;
      const mLight = new THREE.MeshStandardMaterial({ color: pal.light, roughness: 0.55, metalness: 0 }); mLight.name = `${col}-light`;
      const mDark = new THREE.MeshStandardMaterial({ color: pal.dark, roughness: 0.55, metalness: 0 }); mDark.name = `${col}-dark`;
      const cone = new THREE.Mesh(new THREE.LatheGeometry(coneProfile, 64), mLight); cone.name = 'cone';
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(bowlProfile, 64), mDark); bowl.name = 'bowl';
      fig.add(bowl, cone);
      Orb.prototype.headKind = shape; const a = new Orb(HEAD_CHARS[col], 'bubble', true);
      const src = a.mesh; const head = new THREE.Group(); head.name = 'head';
      src.traverse((m) => { if (!m.isMesh || m === a.hull || m.material?.side === THREE.BackSide) return;
        const isEye = a.eyes.includes(m), g = m.geometry.clone(); m.updateMatrix();
        g.applyMatrix4(new THREE.Matrix4().compose(m.position, m.quaternion, m.scale));
        const mm = new THREE.Mesh(g, isEye ? mDark : mLight); mm.name = isEye ? 'eye' : 'head-shell'; head.add(mm); });
      head.scale.copy(src.scale);
      // size + seat it like the 2D figure: head about as wide as the bowl, bottom sinking onto the neck
      const box = new THREE.Box3().setFromObject(head), size = box.getSize(new THREE.Vector3()), k = 1.09 / Math.max(size.x, size.y);
      head.scale.multiplyScalar(k); const box2 = new THREE.Box3().setFromObject(head), c2 = box2.getCenter(new THREE.Vector3());
      head.position.set(-c2.x, R + 0.62 - box2.min.y, -c2.z);
      fig.add(head); a.dispose();
      res[fig.name] = await toGlb(fig);
      const copy = fig.clone(); copy.position.x = (i - 2) * 1.5; all.add(copy); i++;
    }
    res['cone-guys-all'] = await toGlb(all);
    return res;
  }, { FIGS, PAL });
  for (const [k, v] of Object.entries(out)) fs.writeFileSync(path.join(__dirname, '../assets/3d', k + '.glb'), Buffer.from(v, 'base64'));
  console.log(Object.keys(out), errs); await b.close();
})();
