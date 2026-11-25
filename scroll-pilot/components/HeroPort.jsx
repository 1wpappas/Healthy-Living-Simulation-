'use client';
import { useEffect, useRef, useState } from 'react';
import styles from './HeroPort.module.css';

// Scroll hero: the Living Block cone-guy world (lib/heroWorld.js) fills the viewport;
// scrolling 0 -> 1 scrubs the ortho camera from isometric to top-down.
// Track is 400vh: the first 100vh is the intro, the remaining 300vh drive the camera.
const TRACK_VH = 400;

export default function HeroPort() {
  const canvasRef = useRef(null), hlRef = useRef(null), hintRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true, world = null, raf = 0;
    const progress = () => Math.min(1, Math.max(0, scrollY / (innerHeight * ((TRACK_VH - 100) / 100))));
    const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
    const tick = () => {
      if (!alive) return;
      const p = progress();
      // headline: dead-center at scroll 0, lifts and fades out over the first stretch
      const out = sm(0, 0.16, p);
      hlRef.current.style.opacity = 1 - out;
      hlRef.current.style.transform = `translate(-50%, calc(-50% - ${out * 48}px))`;
      hintRef.current.style.opacity = 1 - sm(0, 0.1, p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    (async () => {
      const { mountHeroWorld } = await import('@/lib/heroWorld');
      if (!alive) return;
      world = mountHeroWorld(canvasRef.current, { progress });
      if (!alive) { world.dispose(); return; }
      window.__heroWorld = world;
      setLoading(false);
    })().catch((e) => { console.error(e); setLoading(false); });
    return () => { alive = false; cancelAnimationFrame(raf); if (world) world.dispose(); };
  }, []);

  return (
    <main>
      <div className="stage"><canvas ref={canvasRef} aria-label="Cone characters moving along grid routes on a light grid" /></div>
      <div className={styles.hl} ref={hlRef}>
        <h1>A world of research<br />on your case.</h1>
      </div>
      <div className="hint" ref={hintRef}>Scroll</div>
      {loading && <div className="loading">Loading…</div>}
      <div className="track" style={{ height: `${TRACK_VH}vh` }}>
        {[0, 1, 2, 3].map((i) => <section key={i} className="snap" style={{ top: `${i * 100}vh` }} aria-hidden="true" />)}
      </div>
    </main>
  );
}
