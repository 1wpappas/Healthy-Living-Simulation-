'use client';
import { useEffect, useRef, useState } from 'react';

const LINES = ['Healthier finds treatment', 'that is specific to you.'];
const STEPS = 5;   // 0 hero · 1 iso on the r of "research" · 2 tracked to the r of "your" · 3 aerial dots · 4 type fills
// where each step sits on the page, in screen heights. The r-to-r track gets TRACK screens of scrolling, and the camera follows
// your scroll the whole way (scrubbing) instead of jumping, so it moves as slowly as you scroll.
const TRACK = 5;
const STOPS = [0, 1, 1 + TRACK, 2 + TRACK, 3 + TRACK];
const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const easeOut = (k) => 1 - Math.pow(1 - k, 3);

export default function ScrollPilot() {
  const canvasRef = useRef(null), hlRef = useRef(null), askRef = useRef(null), hintRef = useRef(null);
  const [step, setStep] = useState(0), [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true, scene = null, raf = 0;
    const words = [...hlRef.current.querySelectorAll('.w > span')];
    const t0 = performance.now();
    // d1 headline: word by word rise (start .12 + i*.13 s, .5 s ease-out), the button fades in at 2.0–2.6 s
    const headlineAt = (t) => {
      words.forEach((w, i) => { const s = 0.12 + i * 0.13, k = easeOut(Math.min(1, Math.max(0, (t - s) / 0.5))); w.style.transform = `translateY(${(1 - k) * 108}%)`; });
      askRef.current.style.opacity = sm(2.0, 2.6, t);
    };
    const progress = () => { const y = scrollY / innerHeight;
      for (let k = 0; k < STOPS.length - 1; k++) if (y < STOPS[k + 1]) return k + Math.max(0, y - STOPS[k]) / (STOPS[k + 1] - STOPS[k]);
      return STEPS - 1; };
    const tick = () => {
      if (!alive) return;
      headlineAt((performance.now() - t0) / 1000);
      const p = progress(), out = sm(0, 0.4, p);
      hlRef.current.style.opacity = 1 - out; hlRef.current.style.transform = `translateY(${-out * 60}px)`;
      hintRef.current.style.opacity = 1 - sm(0, 0.15, p);
      setStep(Math.round(p));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    (async () => {
      const { mountScene } = await import('@/lib/scene');
      if (!alive) return;
      scene = await mountScene(canvasRef.current, { progress, fontUrl: 'fonts/KMRMelangeGrotesk-Regular.otf' });
      if (!alive) { scene.dispose(); return; }
      window.__pilot = scene; setLoading(false);
    })().catch((e) => { console.error(e); setLoading(false); });
    return () => { alive = false; cancelAnimationFrame(raf); if (scene) scene.dispose(); };
  }, []);

  let n = 0;
  return (
    <main>
      <div className="stage"><canvas ref={canvasRef} aria-label="Healthier characters rolling along the letters of 'A world of research on your case.'" /></div>
      <div className="hl" ref={hlRef}>
        <h1 aria-label={LINES.join(' ')}>
          {LINES.map((ln) => (
            <span className="ln" key={ln}>
              {ln.split(' ').map((w, i, all) => <span key={i}><span className="w"><span style={{ '--i': n++ }}>{w}</span></span>{i < all.length - 1 ? ' ' : ''}</span>)}
            </span>
          ))}
        </h1>
        <a className="ask" ref={askRef} href="#" onClick={(e) => e.preventDefault()} aria-label="Ask Healthier">
          <span className="ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"><path d="M4.5 12a7.5 7.5 0 1 1 3.4 6.28L4 19.5l1.2-3.9A7.46 7.46 0 0 1 4.5 12z" /><path d="M8.6 12h.01M12 12h.01M15.4 12h.01" strokeWidth="2.6" /></svg></span>
          Ask Healthier
        </a>
      </div>
      <div className="hint" ref={hintRef}>Scroll</div>
      <div className="steps" aria-hidden="true">{Array.from({ length: STEPS }, (_, i) => <i key={i} className={i === step ? 'on' : ''} />)}</div>
      {loading && <div className="loading">Loading…</div>}
      <div className="track" style={{ height: `${(STOPS[STOPS.length - 1] + 1) * 100}vh` }}>
        {STOPS.map((y, i) => <section className="snap" key={i} style={{ top: `${y * 100}vh` }} aria-label={['Intro', 'The paths', 'Along the paths', 'From above', 'A world of research on your case.'][i]} />)}
      </div>
    </main>
  );
}
