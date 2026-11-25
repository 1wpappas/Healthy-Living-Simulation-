export const metadata = { title: 'Experiments index' };

export default function Page() {
  return (
    <main>
      <h1>Experiments</h1>
      <ul>
        <li><a href="/pilot">Scroll pilot — letters scene (created 2026-11-24)</a></li>
        <li><a href="/hero-iframe">Hero scroll — iframe embed of playground world (created 2026-11-25)</a></li>
        <li><a href="/hero-port">Hero scroll — ported world module (created 2026-11-25)</a></li>
        <li><a href="/playground/index.html">Living Block playground — full tweak-panel world (created earlier, ongoing)</a></li>
        <li><a href="/playground/composer.html">Living Block composer — frame/stage/iso shot builder (created 2026-11-25)</a></li>
      </ul>
    </main>
  );
}
