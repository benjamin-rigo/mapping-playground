# Mapping Playground

A data sonification playground for the "Data to Sound" workshop at SAP Impulse (90 min). Every participant opens the link on their own laptop or phone and builds their own sound and visuals from the same live cyber-attack data.

Live: https://benjamin-rigo.github.io/mapping-playground/

Companion to `../cyber_attack_sonification` (the reference piece shown in the opening of the workshop).

## How it works

- **Data:** SANS Internet Storm Center (DShield): top targeted ports, top attacking IPs and the infocon threat level. These are fetched straight from the browser (the ISC API allows CORS) and refreshed every 4 minutes. They are sampled into a stream of about 3 events per second, with occasional port-scan bursts. If the API is unreachable, the bundled `public/snapshot.json` is used.
- **Concept: two worlds, one tension.** *Calm* and *Storm* are two scenes. A Tension fader morphs every sound and visual parameter between them, and the data pushes the fader (an attack fires a Hit envelope).
- **Engines:** each scene picks a sound engine (Drone, Bells, Texture, Pulse) and a visual engine (Fluid, Tunnel, Mosh, Grid), each played with three macros: Color, Texture and Motion.
- **Visual:** a feedback video synth (WebGL ping-pong framebuffers) with a pastel fbm source, plus zoom/rotate/self-warp feedback, datamosh blocks, RGB split, tearing, barcode bands and static.
- **Modulation matrix:** rows are Tension and the six macros. Columns are Hit (attack envelope) and the six data types, which are bipolar around their centre.
- **Presets and sharing:** three starting points (Pastel to static, Glass and tunnel, Data rain). All settings live in the URL hash, so "Copy link" shares an exact patch.

## Develop

```sh
npm install
npm run dev     # http://localhost:5173/mapping-playground/
npm test        # unit tests for the pure engine logic
npm run build
```

A push to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`.

## Structure

```
src/engine/   framework-free: isc.js (data), sampler.js, fields.js (normalize + smoothed sources),
              params.js (module/knob registry + applyPatches), synth.js (Tone.js),
              field.js (WebGL shader), settings.js (presets + URL hash), index.js (wiring)
src/components/  React + shadcn/ui controls
legacy/index-v1.html  the previous single-file version (four data sources)
docs/superpowers/specs/  design spec
```

## Related

- Workshop facilitator guide: Claude Docs, "Data to Sound Workshop Guide"
- Printable A4 worksheet: `sonification-canvas-a4-en.pdf`
