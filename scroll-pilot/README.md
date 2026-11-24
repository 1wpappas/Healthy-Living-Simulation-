# Healthier scroll pilot (Next.js)

Five scroll steps, each one screen tall and snapping:
0. The green head floats in its wire ball under the d1 headline (same word-by-word rise and button fade as d1).
1. The camera pulls back to a tight isometric view on the r of "research". Everyone rolls along paths that are really letter outlines.
2. The camera tracks along the line to the r of "your", still too close to read.
3. It zooms out to straight overhead. The balls become coloured dots and the paths read as "A world of research on your case."
4. The type fills in.

## Run it
    npm install
    npm run dev        # http://localhost:3000

## Where things live
- `components/ScrollPilot.jsx`: page, headline animation, scroll progress
- `lib/scene.js`: camera moves, characters, rope dot trails, paths, fill (tweak `SETTINGS` at the top)
- `lib/letters.js`: sets the sentence in KMR Melange Grotesk and turns it into paths
- `lib/heads.js`: Will's soft heads, ported from healthier/public/d1/yii.js
- `public/fonts`: KMR Melange Grotesk. Not committed (licensed font); copy it in from the healthier repo, see `public/fonts/README.md`

`npm run build` writes a static site to `out/`. `python3 relativize.py out preview` makes a copy that works from any folder (used for the Claude preview link).
