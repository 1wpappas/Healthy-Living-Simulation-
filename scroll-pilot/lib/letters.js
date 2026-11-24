// "A world of research on your case." set in d1's KMR Melange Grotesk, turned into ground paths (one closed loop per glyph contour)
// and fill shapes. Layout: centred lines, tight leading and tracking like Will's frame 25. World plane: x right, z down the page.
import * as THREE from 'three';
import opentype from 'opentype.js';

export const TEXT_LINES = ['A world of', 'research on your', 'case.'];

export async function buildLetters(fontUrl, { size = 16, leading = 0.98, tracking = -0.05, step = 0.08 } = {}) {
  const buf = await (await fetch(fontUrl)).arrayBuffer();
  const font = opentype.parse(buf), k = size / font.unitsPerEm;
  // 1. lay out every glyph's path
  const glyphPaths = []; let y = 0;
  TEXT_LINES.forEach((line, li) => {
    const glyphs = font.stringToGlyphs(line); let x = 0; const placed = [];
    glyphs.forEach((g, i) => { placed.push({ g, x }); x += g.advanceWidth * k + tracking * size + (i < glyphs.length - 1 ? font.getKerningValue(g, glyphs[i + 1]) * k : 0); });
    const w = x - tracking * size;
    placed.forEach((p, gi) => glyphPaths.push({ path: p.g.getPath(p.x - w / 2, y, size), line: li, idx: gi, ch: line[gi] }));
    y += size * leading;
  });
  // 2. flatten into closed polylines (curves sampled finely), and collect fill shapes
  const contours = [], shapes = [], glyphs = [], min = new THREE.Vector2(Infinity, Infinity), max = new THREE.Vector2(-Infinity, -Infinity);
  for (const gp of glyphPaths) {
    const path = gp.path, glyph = { line: gp.line, idx: gp.idx, ch: gp.ch, contours: [], center: new THREE.Vector3() }; glyphs.push(glyph);
    const sp = new THREE.ShapePath(); let cur = null, pts = null; const subs = [];
    const flush = () => { if (pts && pts.length > 2) subs.push(pts); pts = null; };
    for (const c of path.commands) {
      if (c.type === 'M') { flush(); pts = [new THREE.Vector2(c.x, c.y)]; cur = pts[0]; sp.moveTo(c.x, c.y); }
      else if (c.type === 'L') { pts.push(new THREE.Vector2(c.x, c.y)); sp.lineTo(c.x, c.y); }
      else if (c.type === 'Q') { const a = pts[pts.length - 1]; for (let i = 1; i <= 10; i++) { const t = i / 10, u = 1 - t; pts.push(new THREE.Vector2(u * u * a.x + 2 * u * t * c.x1 + t * t * c.x, u * u * a.y + 2 * u * t * c.y1 + t * t * c.y)); } sp.quadraticCurveTo(c.x1, c.y1, c.x, c.y); }
      else if (c.type === 'C') { const a = pts[pts.length - 1]; for (let i = 1; i <= 14; i++) { const t = i / 14, u = 1 - t; pts.push(new THREE.Vector2(u * u * u * a.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * a.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y)); } sp.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y); }
      else if (c.type === 'Z') { flush(); }
    }
    flush();
    for (const s of sp.toShapes(false)) shapes.push(s);
    for (const raw of subs) {
      // resample to an even step so motion along the loop is uniform
      const out = []; let carry = 0;
      for (let i = 0; i < raw.length; i++) {
        const a = raw[i], b = raw[(i + 1) % raw.length], L = a.distanceTo(b);
        let s = carry; for (; s < L; s += step) out.push(new THREE.Vector3(a.x + (b.x - a.x) * s / L, 0, a.y + (b.y - a.y) * s / L));
        carry = s - L;
      }
      if (out.length < 8) continue;
      const cum = [0]; for (let i = 1; i <= out.length; i++) cum.push(cum[i - 1] + out[i - 1].distanceTo(out[i % out.length]));
      const contour = { pts: out, cum, len: cum[out.length], glyph }; contours.push(contour); glyph.contours.push(contour);
      for (const p of out) { min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.z); max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.z); }
    }
  }
  for (const g of glyphs) { const all = g.contours.flatMap((c) => c.pts); if (all.length) { const bx = all.map((p) => p.x), bz = all.map((p) => p.z); g.center.set((Math.min(...bx) + Math.max(...bx)) / 2, 0, (Math.min(...bz) + Math.max(...bz)) / 2); } }
  return { contours, shapes, glyphs, min, max, center: new THREE.Vector3((min.x + max.x) / 2, 0, (min.y + max.y) / 2), size };
}

// point + tangent at arc length s along a closed contour
export function sampleContour(c, s, outP, outT) {
  s = ((s % c.len) + c.len) % c.len;
  let lo = 0, hi = c.pts.length; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c.cum[m] <= s) lo = m; else hi = m; }
  const a = c.pts[lo], b = c.pts[(lo + 1) % c.pts.length], f = (s - c.cum[lo]) / Math.max(1e-6, c.cum[lo + 1] - c.cum[lo]);
  outP.lerpVectors(a, b, f); if (outT) outT.subVectors(b, a).normalize();
  return outP;
}
