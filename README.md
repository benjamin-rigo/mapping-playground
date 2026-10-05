# Mapping Playground

A data sonification playground for the "Data to Sound" workshop at SAP Impulse (90 min). Every participant opens the link on their own laptop or phone and builds their own sound and visuals from the same live cyber-attack data.

Live: https://benjamin-rigo.github.io/mapping-playground/

Companion to `../cyber_attack_sonification` (the reference piece shown in the opening of the workshop).

## How it works

- **Data:** SANS Internet Storm Center (DShield): top targeted ports, top attacking IPs and the infocon threat level. These are fetched straight from the browser (the ISC API allows CORS) and refreshed every 4 minutes. They are sampled into a stream of about 3 events per second, with occasional port-scan bursts. If the API is unreachable, the bundled `public/snapshot.json` is used.
- **Sound:** a Tone.js synth, loosely modelled on Ableton Wavetable. Osc 1 morphs its Shape through generated harmonic tables (sine, saw, square, vocal, bell) and adds FM Warp. Osc 2 is a detuned unison layer, and there is Sub & Noise, a morphing LP/BP/HP filter, an Amp env and a Mod env, an FX chain (drive, crush, chorus, delay, reverb) and a chord Drone.
- **Visual:** a WebGL domain-warped noise field (Field, Color, Texture). Each event lands as an Impact (position, size, strength, ink, decay), and a Distortion module mixes seven local effects into it: swirl, push/pull, ripple, smear, shatter, pixelate and tint.
- **Modulation matrix:** rows are knobs, and the columns are the six incoming data types (Port, Port popularity, Attacker IP, Attacker volume, Density, Threat level). Click a knob to highlight its row, then drag a cell to set the amount (−100% to +100%). Event-rate knobs get the event's own values. Continuous knobs (Drone, Field, Color, Texture) get smoothed followers, so they glide.
- **Presets and sharing:** three starting points (Glass rain, Low tide, Static storm). All settings live in the URL hash, so "Copy link" shares an exact patch.

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
