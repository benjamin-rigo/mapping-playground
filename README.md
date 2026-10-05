# Mapping Playground

A live, projectable data sonification tool for the "Data to Sound" workshop at SAP Impulse (90 min). The room picks one data source, maps its changes to sound and visuals, and hears and sees the result live.

Companion to `../cyber_attack_sonification` (the reference project shown in the opening of the workshop).

## Run it

Open `index.html` in a browser. No build step. Tone.js loads from cdnjs on first open, so the first load needs internet.

Click Start once (browsers need a user gesture before audio plays).

## Data sources

| Source | Needs internet | Status |
| --- | --- | --- |
| Simulated seismic (default) | no | works offline, safe fallback |
| Earthquakes, USGS GeoJSON feed | yes | wired, not yet tested against the live API |
| Weather, Open-Meteo | yes | wired, not yet tested against the live API |
| Wikipedia edits, Wikimedia EventStreams | yes | wired, not yet tested against the live API |

Live sources only start when you press Start. Test all three from the workshop venue's network beforehand (CORS and Wi-Fi are the usual failure points). If something fails, switch to Simulated.

This must run as a normal local page or hosted site. It cannot be published as a Claude Artifact, because artifact pages block outgoing network calls.

## Current state

`index.html` is v1: four data sources, a fixed mapping table (dropdown per field), fixed chord behavior, a few sliders. Works, but the room cannot shape the sound or the visuals freely.

## Next: v2, patchbay (modular synth style)

Goal: fully customizable mapping, simplified so it does not take away from the experience.

- Every sound parameter (Pitch, Volume, Distortion, Filter cutoff, Reverb, Delay, Pan, Density) and visual parameter (Hue, Particle size, Glitch, Brightness, Motion speed, Opacity) is a module.
- Each module has two controls only: Source (a data field, Random, or Off) and Amount (bipolar, -100% to +100%, so it can invert).
- Parameter value = base position + Amount x scaled input.
- Tuning panel (not a module): Root, Scale, Chords on/off, Voicing.
- Data scaling: each field has a domain-informed min and max (e.g. depth 0 to 700 km, so 424 km = 0.61), editable, plus an Auto-fit button that snaps to the min and max seen so far. Output is always clamped to 0-1.
- Categorical fields (e.g. region) are not scaled; they act as a color key.
- Signed fields (e.g. Wikipedia edit size change) scale to -1..1 so direction can drive Pan or Hue.

Starting ranges: Magnitude 0-8, Depth 0-700 km, Temperature -20 to 45 C, Wind 0-120 km/h, Wikipedia edit size -2000 to +2000 bytes.

A static layout mockup of the patchbay exists as a Claude Design artifact ("Mapping Playground - patchbay mockup").

## Related

- Workshop facilitator guide: Claude Docs, "Data to Sound Workshop Guide"
- Printable A4 worksheet: `sonification-canvas-a4-en.pdf`
