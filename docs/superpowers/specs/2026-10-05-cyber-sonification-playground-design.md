# Cyber Sonification Playground — Design

Date: 2026-10-05
Status: implemented; revised 2026-10-05 (see Revision 2)

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
| Density | events in the last 5 s / 30, clamped (about 0.5 at the normal rate, near 1 during bursts) |
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
- Accent mix ← Density (so the accent color appears mainly during port-scan bursts)
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

## Revision 2 (2026-10-05): modular engine

The first build felt rigid: fixed voices (Pluck, Bell…) and a halftone dot canvas. Feedback was to make it feel like a simple modular synth and to move the visuals toward soft, grainy, fluid noise fields. The sections above on Mapping, Audio, Visuals and Defaults are superseded by this one.

- **Knobs and modules** (`src/engine/params.js`): every knob is 0..1 and belongs to a module.
  - Sound modules: Voice (note, range, level, pan, chance), Oscillator (wave morph sine→triangle→saw→square, FM amount, FM ratio, detune, noise), Envelope (ADSR), Filter (cutoff, resonance, envelope amount), Drive (drive, crush), Delay (time, feedback, mix), Reverb (size, mix), Drone (level, tone, motion).
  - Visual modules: Field (scale, turbulence, flow, detail), Color (hue, spread, saturation, contrast, paper), Texture (grain, softness), Impact (x, y, size, strength, swirl, decay).
  - Mod module: LFO (rate).
- **Patches:** a list of `{source, target, amount}`. Any source can drive any patchable knob (Reverb size and LFO rate are not patchable), several patches can stack on one knob, and the result is `clamp01(knob + Σ amount × source)`.
- **Sources:** the five per-event fields, plus Density, Threat and LFO. Event-kind modules use the latest values at each event. Continuous modules (Drone, Field, Color, Texture, LFO) use exponential followers (τ ≈ 0.8 s).
- **Audio:** raw Web Audio replaces Tone.js. One voice graph is built per event (up to 24 at once), and it feeds a shared waveshaper (drive + bit crush), then delay and a convolution reverb (impulse regenerated when Size changes). A 4-oscillator drone moves through a chord progression every 10 s, with detune and filter LFOs scaled by Motion.
- **Visual:** a WebGL fragment shader with domain-warped fbm, smoothstep-thresholded between paper and ink colors (HSL from Color), plus animated grain. It renders at 0.6× resolution, which adds softness. Up to 16 live impacts warp the field (a swirl or push mix) and add ink.
- **Presets:** Glass rain (default), Low tide and Static storm. A preset is just a settings object.
- **Settings v2:** `{ version: 2, knobs, patches, root, scale, master }`. v1 links fall back to the defaults.
- **UI:** three tabs. Sound and Visual are module cards with knobs, and an orange dot marks a patched knob. Patch has the LFO, patch rows (source → target, amount, a live source meter) and live meters for every source.

## Revision 3 (2026-10-05): inline patching, richer impacts

- **Inline patching:** the separate Patch tab is gone. Each patchable knob has a cable button that opens a source menu. Its patches are listed right under the knob, each with an amount slider, a live source meter and a remove button. The LFO rate sits in a Global card above the Sound and Visual tabs, together with Root, Scale and Master.
- **Impact** is now Position X/Y, Size, Strength, Ink and Decay. A new event-rate **Distortion** module adds seven mixable local effects per impact: Swirl, Push/pull (bipolar around 0.5), Ripple (expanding rings), Smear (horizontal row tearing), Shatter (block displacement), Pixelate (local uv quantization) and Tint (a shift toward the complementary hue). Every effect is patchable. Live impacts are capped at 12 to stay within the WebGL uniform limits on mobile.

## Revision 4 (2026-10-05): Wavetable-style synth and modulation matrix

- **Sources** are only the incoming data types: Port, Port popularity, Attacker IP, Attacker volume, Density and Threat level. LFO and Random were removed.
- **Matrix UI** after Ableton Wavetable: the rows are the knobs that have any modulation plus the currently selected knob, and the columns are the six data types, each with a live meter. A cell is a drag-to-set amount: click an empty cell for +50%, double-click or Delete to clear, arrow keys step by 5%. Clicking a knob selects it, highlights its row and switches to its Sound or Visual tab. The matrix sits under the canvas on desktop and above the modules on mobile. Sound and visual parameters share the one matrix.
- **Knobs** are rotary (drag vertically, Shift for fine control, double-click to reset, arrow keys). An orange arc shows the range the patched data can push the knob through.
- **Synth** (Tone.js again): Osc 1 is a PolySynth(FMSynth) with a custom-partials carrier. Shape morphs through five generated harmonic tables, Bright tilts the spectrum, and Warp/Ratio set the FM index and harmonicity. Osc 2 is a PolySynth of fat oscillators (shape, spread, octave, level). Sub is a sine an octave down, and Noise is brown, pink or white. They feed pan → Filter (LP/BP/HP by Morph, with a FrequencyEnvelope driven by the Mod env) → Distortion → BitCrusher → Chorus → FeedbackDelay → Reverb → Limiter. The Mod env also shapes the FM index (To warp). The Drone is a fat-saw PolySynth chord loop through an LFO-swept lowpass.
- **Settings** version 3. Older links fall back to the defaults.

## Revision 5 (2026-10-05): responsiveness, layout, cross-mod

- **Response** (global knob, 10 ms to 3 s, exponential, default about 40 ms) sets the time constant of the smoothed sources that drive continuous targets, and the drone's ramp time. Moving a knob also updates the shared sound chain (filter, drive, crush, chorus, delay, reverb) at once, instead of waiting for the next event.
- **Voices** are native Web Audio graphs built per event inside Tone's context. Osc 1 uses a cached PeriodicWave per Shape and Bright. FM is shaped by the Mod env. Osc 2 is a 3-oscillator detuned stack. Cross-mod runs both ways: "2 → 1 FM" sends Osc 2 into Osc 1's frequency, and "1 → 2 FM" sends Osc 1 into Osc 2 through a 128-sample delay, which keeps the feedback cycle from being muted. Each voice has its own pan and amp envelope, and at most 24 run at once. This replaces PolySynth.set() on every event.
- **Layout:** on desktop, resizable panels (stage | controls, and canvas over matrix) with px and % constraints. On mobile, a stack. The engine is rebuilt if the layout switches, because the canvas element changes.
- **Performance:** incoming events no longer re-render the app (EventLog subscribes on its own). Module cards and knobs are memoized, with stable callbacks. The shader resolution adapts between 0.3× and 0.75× CSS px to hold 60 fps.
- **Knobs** select on pointer-down or focus.

## Revision 6 (2026-10-05): bipolar modulation

Modulation is now bipolar: `value = clamp01(knob + Σ amount × (2·source − 1))`. The knob is the centre, a source at 0.5 leaves it unchanged, and the extremes push it down or up by the amount. The knob's orange arc is drawn symmetrically (± the summed |amount|). Presets are still written in the readable "base + amount × data" form and converted when they load (knob += amount/2, amount /= 2), so they sound the same as before.

## Revision 7 (2026-10-05): visible modulation, richer noise background

- **Live modulation display:** the engine keeps `live[key]`, the latest modulated value of every knob (event knobs update per event, continuous ones every frame). Each modulated knob animates a bright arc and dot from its own value to the live value with requestAnimationFrame, writing straight into the SVG with no React re-render. The faint arc still shows the full ± range.
- **Weight scaling:** Port popularity and Attacker volume are log-scaled between the smallest and largest weight in the current dataset, instead of between 1 and the largest. Before this the top ports all landed between 0.9 and 1.0 and barely moved anything.
- **Background controls** (the old Field module is split up):
  - Noise: Character (smooth → ridged → billow → cellular), Scale, Detail, Stretch (bipolar horizontal/vertical anisotropy) and Symmetry (off, mirror, or a 2–8 slice kaleidoscope).
  - Motion: Turbulence, Flow and Direction (the angle of the flow vector).
  - Texture gains Bands, which posterizes the ink/paper mix into 16 down to 2 levels.

## Revision 8 (2026-10-05): whole-frame distortion

The per-impact blobs are gone. **Distortion** is now a continuous module that acts on the whole frame: Swirl, Push/pull (bipolar, 0.5 neutral), Ripple, Smear (random row tearing), Shatter (block displacement), Pixelate and Tint. Swirl, push and ripple centre on the impact point and fall off over Reach; the other effects cover everything. **Impact** (event-rate) now means: Pos X/Y (the distortion centre, which eases toward each event over about 150 ms), Reach, Hit (how much each event spikes the distortions, added to an exponentially decaying envelope), Decay and Ink (an ink flash at the centre). A hit multiplies each distortion as `min(1, knob × (1 + 2·hit))`, so a distortion at zero stays off. The shader is simpler and cheaper than the 12-impact version.

## Revision 9 (2026-10-05): "Two worlds, one tension" (concept reset)

Feedback: too many equal-weight knobs, small visible change, the tool felt rigid, and the collaboration needed a concept instead of piecemeal requests. The piece is a story: a calm pastel ambient mass that turns into a noise state when attacks come in. The interface is now built around that arc.

- **Scenes (after the Elektron Octatrack scenes and crossfader):** *Calm* and *Storm* are full snapshots. A **Tension** fader morphs every sound and visual parameter between them, so one gesture changes everything. Participants design two endpoints, not forty knobs. A *Hold Calm / Live data / Hold Storm* switch auditions a scene regardless of the data.
- **Engines plus three macros (after Mutable Instruments Plaits):** each scene picks one sound engine (Drone, Bells, Texture, Pulse) and one visual engine (Fluid, Tunnel, Mosh, Grid), each played with the same three macros: Color, Texture and Motion. An engine is a function from its macros to the full low-level parameter set, so the Tension fader crossfades between engines too (`scenes.js`).
- **Signals (modular CV/gate thinking):** *Hit* is an envelope fired by every attack (trigger → envelope → CV, unipolar, with a global Hit decay). Density, Threat, Port, Port popularity, Attacker IP and Attacker volume are bipolar CVs. The matrix is a fixed 7 × 7: rows are Tension plus the six macros (sound and visual Color, Texture, Motion), offsets apply to both scenes. The default patching is Hit → Tension plus Density → Tension.
- **Visual engine:** a feedback video synth (Hydra/TouchDesigner style) with ping-pong framebuffers. The frame pass mixes a domain-warped pastel fbm source with the previous frame. That frame is resampled with zoom/rotate around the last attack position and with a self-warp (Hydra-style modulate), plus mosh blocks that keep sliding old pixels, RGB split, row tearing, Ikeda-style barcode bands and static. A present pass adds grain, which is not fed back.
- **Sound engine:** four layers whose levels come from the morph. Drone (fat-saw chord loop, LFO lowpass) and Texture (pink noise through a swept bandpass) are continuous. Bells (FM strike, pitch from the port, as in *Listen to Wikipedia*) and Pulse (stuttering filtered noise clicks) are triggered by attacks. Everything shares drive → bit crush → delay → reverb, so Storm can distort the whole mix.
- **Pedagogy (after the Sonification Handbook, ch. 15, on parameter mapping):** participants make the three mapping decisions explicitly. What calm is (A), what an attack is (B), and which data pushes between them, in which direction and how fast (matrix, polarity, Response and Hit decay).
- **Not yet built:** the Advanced view (direct access to the low-level parameters behind the macros), and categorical port classes (Web, Remote, DB, IoT) as a voice and colour selector.

## Revision 10 (2026-10-07): four modules, everything mappable

The scenes/tension concept was dropped. The tool is now four clearly separated modules. Each knob in them can be driven by data from one matrix (rows = touched or patched knobs; columns = Hit plus the six data types; data is bipolar around the knob, Hit is one-way).

- **Synth** (event, one note per attack, with sub-groups): Oscillator (wavetable-like Shape, Bright, FM, FM ratio, Detune), Layers (Osc 2 detuned saw stack, Cross-mod Osc 2 → Osc 1, Sub, Noise), Filter (Cutoff, Res, Env amount, per voice), Envelope (ADSR), Voice (Note, Range, Level, Pan, Chance). Native Web Audio voice per attack.
- **Drone** (continuous): Root and Scale selectors (8 scales, including phrygian, lydian and whole tone), Pitch (where the chord sits inside the Range), Range (1–4 octaves the pitch can move through), Glide, Voicing (root → +third → +fifth → +octave), Timbre (the same harmonic-table morph as the synth), Bright (lowpass), Spread (detune of 2 oscillators per chord tone), Motion (filter and amplitude LFOs), Level. The chord only re-targets when the quantised note changes, and it glides there.
- **FX** (continuous, shared): Drive, Crush, Delay, Time, Feedback, Reverb, Size.
- **Noise** (continuous, the base visual): Color (Hue, Hue spread, Saturation, Paper, Contrast), Shape (Scale, Detail, Blur, Turbulence), Motion (Speed, Direction), Feedback (Amount, Zoom, Rotate, Drift along the direction). This runs in the feedback frame pass.
- **Distortion** (continuous): Glitch (Blocks, which is fed back as sliding stuck blocks; Tear; Pixelate; RGB split), Noise (Static, Scanlines, Grain), Color (Hue shift, Invert, Posterize, Burn). Everything except Blocks runs in the present pass, so it breaks the picture without accumulating.
- **Global:** Response (source smoothing), Hit decay and Master.
- **Presets:** Pastel drift, Glass rain and Breakdown.

**Revision 10a:** Distortion gets its own feedback loop: Feedback → Amount, Zoom, Rotate and Shift (horizontal smear). The distort pass renders into a second ping-pong pair and mixes in its previous output, resampled. Scanlines, static and grain moved into a final output pass, so they never accumulate.

**Revision 10b:** Each matrix column header is a live scope of its source: about 4 s of history at 30 Hz, a dashed centre line for bipolar sources (Hit's baseline is the bottom), a tick for every incoming attack (density) and the current value as a number. Every active cell draws a live bar from its centre showing its current contribution (amount × signal).

## Revision 11 (2026-10-07): macro-oscillator synth, three-column layout

- **Layout:** Visual modules on the left, canvas over matrix in the centre, Sound modules (with the global Response, Hit decay and Master) on the right. Three resizable columns on desktop; stacked on mobile (canvas, matrix, visual, sound).
- **Synth = macro-oscillator** after Mutable Instruments Plaits: an Algorithm knob, which is also mappable and has a picker, plus Harmonics, Timbre and Morph whose labels change per algorithm. The eleven algorithms, each built per attack in Web Audio:
  - Analog: tri→saw plus a variable pulse, detuned.
  - Fold: sine/triangle through a sine wavefolder with asymmetry.
  - FM: 2-op with a quantised ratio, decaying index and a third op as feedback.
  - Formant: a saw through two bandpasses.
  - Additive: bump spectra as a PeriodicWave.
  - Wavetable: the harmonic-table morph with unison.
  - Chords: 9 chord types, inversion, waveform.
  - Modal: 6 decaying partials morphing string → bar → membrane ratios.
  - Drum: Basimilus-Iteritas-like additive partials with Spread (harmonic → stretched ratios), partial count and waveform, and a built-in pitch drop.
  - Noise: an LP/BP/HP-filtered noise, tracking the note.
  - Dust: sparse impulses through a resonant bandpass.
- After **Basimilus Iteritas**, every algorithm also gets **Fold** (a post wavefolder) and **Punch** (a pitch envelope).
- **Filter, Envelope and Voice** sections are unchanged.
- **Levels:** measured in headless Chrome with an analyser on the destination, all eleven produce roughly −15 to −25 dBFS peaks with the defaults.
- Settings version 6.

**Revision 11a:** Everything that shapes the output is now a mappable knob.
- Drone **Root** (12 steps) and **Scale** (8 steps) are stepped knobs. The modulated key is shared with the synth, so data can change key or mode on the fly.
- A **Global** module (Response, Hit decay, Master) replaces the separate global controls. Response and Hit decay use the previous frame's modulated value, to avoid a feedback loop with the smoothing they control.
- Settings version 8.
