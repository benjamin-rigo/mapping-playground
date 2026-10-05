# Cyber Sonification Playground — Design

Date: 2026-10-05
Status: draft, awaiting review

## Purpose

A web tool for the "Data to Sound" workshop. Every participant opens one link on their own laptop or phone and builds their own sonification and visualization of the same live cyber-attack data. They choose which data field drives each sound and visual parameter and how strongly, then share their result as a link.

Success:
- Opening the link and pressing Start produces sound and visuals within a few seconds, using live data when online and a bundled snapshot when not.
- A participant understands the controls without explanation beyond "pick what drives it, set how much".
- A shared link reproduces the sender's settings exactly.
- Works on a phone-width screen.

Out of scope for now: multiple data sources, saving presets on a server, collaboration between participants, the final simplified UI look (comes after the structure works).

## Stack and delivery

- Vite + React + shadcn/ui + Tailwind, dark mode UI. Tone.js for audio, Canvas 2D for visuals.
- The engine (data, audio, visuals, mapping) is plain JS modules with no React dependency, so the UI can be swapped or simplified later.
- Public repo `mapping-playground` on GitHub account `benjamin-rigo`, deployed to GitHub Pages by a GitHub Actions workflow on push to `main`. Vite `base` set to `/mapping-playground/`.
- The v1 `index.html` moves to `legacy/index-v1.html` for reference.

## Data source: SANS Internet Storm Center (DShield)

Called directly from the browser. The ISC API sends `access-control-allow-origin: *` (verified 2026-10-05), so no proxy is needed.

Endpoints, fetched on start and every 4 minutes:
- `https://isc.sans.edu/api/topports/records/25?json` → `{ "0": {rank, targetport, records, targets, sources}, ..., date, limit }`
- `https://isc.sans.edu/api/topips/records/40?json` → `[{rank, source, reports, targets}]`
- `https://isc.sans.edu/api/infocon?json` → `{status: "green" | "yellow" | "orange" | "red"}`

DShield is aggregate data, not a per-attack firehose. As in `../cyber_attack_sonification`, the sampler builds a live event stream from it:
- Base rate around 3 events per second with random jitter.
- Each event picks an IP weighted by `reports` and a port weighted by `records`.
- About 1 in 15 events starts a port-scan burst: the same IP hits 4 to 10 ports in quick succession (60 to 150 ms apart).

Event shape: `{ t, ip, port, portWeight, ipWeight, burst }`.

Fallback: `public/snapshot.json` holds one real response from all three endpoints, captured during implementation. It is used when any fetch fails. The UI shows "LIVE" or "OFFLINE (snapshot)".

## Data fields

Every field is normalized to 0..1. These are the options in each "driven by" dropdown.

| Field | Normalization |
| --- | --- |
| Port | `log(port) / log(65535)`, so low ports give low values |
| Port popularity | `log(records) / log(max records)` in the current dataset |
| Attacker IP | first octet / 255 (deterministic, so the same IP always gives the same value) |
| Attacker volume | `log(reports) / log(max reports)` in the current dataset |
| Density | events in the last 5 s / 20, clamped |
| Threat level | infocon: green 0, yellow 0.33, orange 0.66, red 1 |
| Random | new random value per event |
| Off | parameter is not driven |

## Mapping

Each mappable parameter has three controls:
- **Driven by**: a field from the table above.
- **Base**: slider 0..1, the value when the input is 0 or the source is Off.
- **Amount**: slider −100%..+100% (bipolar, so negative inverts). Disabled when the source is Off.

`value = clamp01(base + amount * input)`, then scaled to the parameter's real range (for example Hz or dB) inside the audio or visual module.

## Audio (Tone.js)

- **Bed:** slow, soft pad chords in the selected key, always on while running. Chords on/off toggle.
- **Event voice:** one short note per event (bursts included). Voice type selector: Pluck, Bell, Noise, Kick.
- **Mappable sound parameters:** Pitch (quantized to the scale over 3 octaves), Volume, Filter cutoff, Distortion, Reverb wet, Delay wet, Pan, Probability (chance that an event sounds at all, which controls sparseness).
- **Tuning (not mappable):** Root note, Scale (minor, major, pentatonic, chromatic), Chords on/off, Master volume.
- Audio starts only after the Start click (browser gesture requirement). Effect parameters ramp over about 50 ms to avoid clicks.

## Visuals (Canvas 2D)

Mood (derived from the references, not copied): data as quantized units, a soft and organic layer against a sharp annotation layer, near-monochrome with one accent color, grain, generous empty space.

- **Paper background**, off-white or cool grey, with fine grain.
- **Intensity field:** a low-res grid. Each event adds a soft Gaussian blob to it, and the whole field decays every frame.
- **Rendering:** each grid cell is a square ink dot whose size follows the cell's intensity (halftone).
- **Annotation:** each event can draw a tiny monospace label (port, IP) linked to its blob by a hairline in the accent color. Labels fade out.
- **Glitch:** for strong events, random square blocks of cells invert or shift sideways for a few frames, tinted with the accent color.
- **Mappable visual parameters:** Position X, Position Y, Blob size, Softness, Ink strength, Glitch, Fade speed, Accent mix (how much accent color the event carries).
- **Global visual settings (not mappable):** Grid density, Grain amount, Accent color (a few fixed swatches), Annotations on/off.
- The canvas fills its container and resizes with it. The render loop runs before Start too (a calm empty field), and only data-driven activity starts on Start.

## UI layout (shadcn)

- **Top bar:** title, Start/Stop button, LIVE/OFFLINE badge, "Copy link" button.
- **Desktop (md and up):** the canvas takes the main area; a scrollable side panel on the right shows tabs or sections: Sound, Visuals, Tuning.
- **Mobile:** the canvas is on top (about 45% of the viewport height, sticky), with the controls below.
- **Each mappable parameter is one compact row:** label, "Driven by" Select, Base Slider, Amount Slider.
- **Event log:** one line at the bottom left of the canvas showing the latest event in monospace.
- **Reset button** to restore the default preset.
- **Accessibility:** labels on every control, keyboard operable (shadcn/Radix provides this), visible focus rings.

## Sharing

The full settings object is serialized as base64url JSON into the URL hash (`#s=...`) on every change, debounced. On load, a valid hash overrides the defaults, and an invalid one is ignored. "Copy link" copies `location.href`. A `version` field in the object allows future migration.

## Defaults

A preset that sounds and looks good on the first Start:
- Pitch ← Port
- Volume ← Attacker volume
- Pan ← Attacker IP
- Distortion ← Threat level
- Position X ← Attacker IP
- Position Y ← Port
- Blob size ← Attacker volume
- Glitch ← Density
- Everything else Off, with sensible bases
- Root A, minor scale, Pluck voice, chords on

## Code structure

```
src/engine/isc.js        fetch + parse the three endpoints, snapshot fallback
src/engine/sampler.js    weighted IP x port event stream + bursts
src/engine/fields.js     field definitions + normalization
src/engine/mapping.js    base/amount/source -> 0..1 value
src/engine/audio.js      Tone.js graph, applyEvent(event, values)
src/engine/visuals.js    intensity field, render loop, annotations, glitch
src/engine/settings.js   defaults, param definitions, hash encode/decode
src/App.jsx              wiring, top bar, layout
src/components/ParamRow.jsx, ControlPanel.jsx, CanvasView.jsx
public/snapshot.json
.github/workflows/pages.yml
```

Data flow: `sampler.onEvent(e)` → `fields.normalize(e, context)` → `mapping` per parameter → `audio.applyEvent` and `visuals.addEvent`. Settings live in React state and are mirrored into the engine through a single `engine.setSettings(settings)` call.

## Testing

- Vitest unit tests for the pure logic: field normalization, mapping math (including negative amount and clamping), settings hash round-trip and invalid-hash handling, ISC response parsing (using snapshot fixtures), and sampler weighting and bursts (seeded random).
- Manual browser check: live data arrives, every control audibly or visibly changes the output, a copied link restores the settings in a new tab, the offline fallback works (block the network in devtools), and the layout holds at 375 px width.
- Known pitfalls carried over from the reference project: wrap `setTimeout` in arrow functions (avoids "Illegal invocation"), and guard audio setters until `audio.ready`.
