'use client';
import { useEffect, useRef, useState } from 'react';

const SRC = '/playground/index.html?hero=1';
const LINES = ['A world of research', 'on your case.'];
const TRACK_VH = 350;   // scrollable runway: the iframe world scrubs isometric -> top-down across it
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const easeOut = (k) => 1 - Math.pow(1 - k, 3);

export default function HeroIframe() {
  const frameRef = useRef(null), hlRef = useRef(null), hintRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true, raf = 0, lastP = -1;
    const words = [...hlRef.current.querySelectorAll('.w > span')];
    const t0 = performance.now();
    // same masked word-rise as ScrollPilot: word i starts at .12 + i*.13 s, .5 s ease-out
    const headlineAt = (t) => {
      words.forEach((w, i) => { const s = 0.12 + i * 0.13, k = easeOut(Math.min(1, Math.max(0, (t - s) / 0.5))); w.style.transform = `translateY(${(1 - k) * 108}%)`; });
    };
    const tick = () => {
      if (!alive) return;
      headlineAt((performance.now() - t0) / 1000);
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      const out = sm(0, 0.22, p);   // headline rises + fades out over the first ~22% of the scroll
      hlRef.current.style.opacity = 1 - out;
      hlRef.current.style.transform = `translateY(calc(-50% - ${out * 60}px))`;   // -50% keeps it dead-center while it rises out
      hintRef.current.style.opacity = 1 - sm(0, 0.12, p);
      // scrub the iframe world camera (only post when p actually changes)
      if (p !== lastP && frameRef.current && frameRef.current.contentWindow) {
        lastP = p;
        frameRef.current.contentWindow.postMessage({ type: 'hero-scroll', p }, '*');
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onLoad = () => setLoading(false);
    const fr = frameRef.current;
    fr.addEventListener('load', onLoad);
    return () => { alive = false; cancelAnimationFrame(raf); fr.removeEventListener('load', onLoad); };
  }, []);

  let n = 0;
  return (
    <main>
      <div className="stage">
        <iframe ref={frameRef} src={SRC} title="Sphero world" aria-label="Animated world of research characters" />
      </div>
      <div className="hl center" ref={hlRef}>
        <h1 aria-label={LINES.join(' ')}>
          {LINES.map((ln) => (
            <span className="ln" key={ln}>
              {ln.split(' ').map((w, i, all) => <span key={i}><span className="w"><span style={{ '--i': n++ }}>{w}</span></span>{i < all.length - 1 ? ' ' : ''}</span>)}
            </span>
          ))}
        </h1>
      </div>
      <div className="hint" ref={hintRef}>Scroll</div>
      {loading && <div className="loading">Loading world…</div>}
      <div className="track" style={{ height: `${TRACK_VH}vh` }} aria-hidden="true" />
    </main>
  );
}
