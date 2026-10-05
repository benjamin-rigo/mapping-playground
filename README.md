# Mapping Playground

A data sonification playground for the "Data to Sound" workshop at SAP Impulse (90 min). Every participant opens the link on their own laptop or phone and builds their own sound and visuals from the same live cyber-attack data.

Live: https://benjamin-rigo.github.io/mapping-playground/

Companion to `../cyber_attack_sonification` (the reference piece shown in the opening of the workshop).

## How it works

- **Data:** SANS Internet Storm Center (DShield): top targeted ports, top attacking IPs and the infocon threat level. These are fetched straight from the browser (the ISC API allows CORS) and refreshed every 4 minutes. They are sampled into a stream of about 3 events per second, with occasional port-scan bursts. If the API is unreachable, the bundled `public/snapshot.json` is used, and the badge shows "Offline".
- **Mapping:** every sound and visual parameter has three controls: "driven by" (Port, Port popularity, Attacker IP, Attacker volume, Density, Threat level, Random, Off), Base and Amount (−100% to +100%). The value is `clamp(base + amount * field)`, and every field is normalized to 0..1.
- **Sharing:** settings live in the URL hash. "Copy link" shares an exact setup.

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
src/engine/   framework-free: isc.js (data), sampler.js, fields.js (normalize + mapping),
              audio.js (Tone.js), visuals.js (halftone canvas), settings.js, index.js (wiring)
src/components/  React + shadcn/ui controls
legacy/index-v1.html  the previous single-file version (four data sources)
docs/superpowers/specs/  design spec
```

## Related

- Workshop facilitator guide: Claude Docs, "Data to Sound Workshop Guide"
- Printable A4 worksheet: `sonification-canvas-a4-en.pdf`
