# Endless Synthwave Generator — Project Context

## What it is

A browser-based algorithmic music generator that continuously creates and plays synthesised music using the Web Audio API.
It is a fork/evolution of the [Endless Acid Banger](https://www.vitling.xyz) by Vitling, extended by Zykure and then reimagined as the "Endless Synthwave Generator" by webdesignerdesjahres.

There is no build server — the project is a collection of TypeScript source files compiled directly to ES modules with `tsc`, served as static files. Open `index.html` in a browser to run it.

---

## Tech stack

| Layer | Detail |
|---|---|
| Language | TypeScript (compiled with `tsc -p .`, outputs to `js/`) |
| Audio | Web Audio API — no external audio libraries |
| UI | Vanilla DOM — no framework, no bundler required for the UI |
| MIDI | WebMIDI API (optional, graceful no-op if unavailable) |
| Build | `build.sh` runs `tsc` then `webpack` to produce a `dist/` bundle, but for local dev just `tsc` is sufficient |

---

## File structure

```
src/            TypeScript source (edit these)
js/             Compiled JS output (generated — do not edit)
ui.css          Single stylesheet for all UI
index.html      Entry point — just loads js/app.js as a module
samples/        Drum sample files (.mp4 container, audio only)
old_pattern.ts  Reference copy of the original acid banger pattern generator
```

### Source files

| File | Purpose |
|---|---|
| [`src/app.ts`](src/app.ts) | Top-level wiring — creates audio, clock, synth units, drum machine, autopilot, UI and connects them all |
| [`src/audio.ts`](src/audio.ts) | All Web Audio graph construction: oscillators, filters, VCA, delay, sampler, master channel |
| [`src/pattern.ts`](src/pattern.ts) | Pattern generators: `SynthwaveGen` (melodic), `ThreeOhGen` (acid), `NineOhGen` (drums) |
| [`src/interface.ts`](src/interface.ts) | All shared TypeScript types + the reactive `parameter` / `trigger` / `genericParameter` primitives |
| [`src/ui.ts`](src/ui.ts) | DOM construction for all UI panels — no HTML templates, everything built in JS |
| [`src/dial.ts`](src/dial.ts) | Canvas-based rotary dial widget and range-select widget |
| [`src/boilerplate.ts`](src/boilerplate.ts) | `Clock` implementation (recursive `setTimeout`-based sequencer) and `pressToStart` splash |
| [`src/midi.ts`](src/midi.ts) | WebMIDI wrapper — output device management, note on/off, CC, clock |
| [`src/math.ts`](src/math.ts) | Tiny helpers: `choose`, `rndInt`, `biRnd` |

---

## Core reactive system

Everything is wired together using the lightweight reactive parameter system defined in [`src/interface.ts`](src/interface.ts):

```typescript
parameter(name, [min, max], defaultValue)  // NumericParameter
trigger(name, defaultValue)                 // GeneralisedParameter<boolean>
genericParameter(name, defaultValue)        // GeneralisedParameter<T>
```

Each parameter has:
- `.value` — get/set (setting publishes to all subscribers)
- `.subscribe(callback)` — callback fires immediately with current value and on every future change
- `.bounds` — `[min, max]` on NumericParameter

This replaces any need for a state management library.

---

## Architecture overview

```
Clock (boilerplate.ts)
  └─ currentStep (0–15) fires every step
       ├─ ThreeOhUnit × 2  (src/app.ts)
       │    ├─ SynthwaveGen (own instance per track)
       │    ├─ audio.ThreeOh (synth voice)
       │    └─ pattern, parameters, octaveMin/Max, MIDI
       ├─ NineOhUnit (drum machine)
       │    ├─ NineOhGen
       │    ├─ SamplerDrumMachine
       │    └─ pattern, mutes, MIDI
       └─ AutoPilot (src/app.ts)
            ├─ WanderingParameter on all synth dials + delay
            ├─ BPM twiddle modes (Wander / Jump)
            └─ Pattern/mute automation

DelayUnit  ←  BPM-synced delay time (updated at step 0 only)
UI (src/ui.ts)  ←  all DOM panels, wired two-way to parameters
```

---

## Clock & timing

- [`Clock()`](src/boilerplate.ts:71) is a recursive `setTimeout` loop — **not** a Web Audio scheduled clock
- BPM range: 40–300 (was originally 70–200)
- Step is `0–15` (16 steps per bar), firing 4 steps per quarter note
- Delay time is set to `(3/4) × (60 / bpm)` seconds — this is a dotted-quarter delay
- **Important:** Delay time is only updated at `step === 0` to avoid pitch-warble artefacts from moving the delay line mid-playback

---

## Pattern generation

### `SynthwaveGen` ([`src/pattern.ts`](src/pattern.ts:77))
- Accepts a `getOctaveRange: () => [number, number]` callback (added to support per-track octave control)
- `changeNotes()` picks a root MIDI note within the octave range, then adds one of several interval offset sets
- `createPattern()` uses density-weighted probability to place notes on a 16-step grid

### `NineOhGen` ([`src/pattern.ts`](src/pattern.ts:130))
- Generates 5 independent drum patterns (BD, OH, CH, SD, CP) with kick/hat/snare modes

### Pattern storage
Each `ThreeOhUnit` and `NineOhUnit` stores:
- `pattern` — current active pattern
- `savedPattern` — previous pattern (for the ⤾ restore button)
- `newPattern` trigger — set true to regenerate at next step 0
- `restorePattern` trigger — swaps current ↔ saved

---

## Synth units

### `ThreeOhUnit` ([`src/app.ts`](src/app.ts:147))
Two instances — one triangle wave (303-01, lead), one sawtooth (303-02, bass):
- Each has its **own** `SynthwaveGen` instance so octave range is independent
- Parameters: `cutoff`, `resonance`, `envMod`, `decay`, `distortion` (all routed to Web Audio nodes)
- `octaveMin` / `octaveMax` — integer octave range (0–7). Changing either triggers immediate pattern regeneration
- MIDI out: note on/off with accent velocity, CC mappings, pitch offset

### Default octave ranges:
- 303-01 (triangle/lead): octaves 2–4
- 303-02 (sawtooth/bass): octaves 1–2

### `NineOhUnit` ([`src/app.ts`](src/app.ts:302))
Sample-based drum machine using 5 `.mp4` audio files (audio-only container).

---

## AutoPilot ([`src/app.ts`](src/app.ts:479))

Three toggle switches (shown in the Autopilot panel):

| Switch | Effect |
|---|---|
| Alter Patterns | Triggers new note/drum patterns on a measure schedule |
| Twiddle With Knobs | Runs `WanderingParameter` on all synth dials + delay parameters every 100ms |
| Mute Drum Parts | Randomly mutes/unmutes drum channels every few measures |

### BPM auto-twiddle modes (per `bpmTwiddleMode` parameter):
- **0 — Off:** BPM only changes manually
- **1 — Wander:** BPM is passed through `WanderingParameter` on the same 100ms tick as all other knobs, clamped to `[bpmMin, bpmMax]`
- **2 — Jump:** On `measure % 16 === 0` (50% chance), a smooth linear interpolation from current BPM to a new random target within range is queued; transition takes exactly 2 bars

### `WanderingParameter` ([`src/app.ts`](src/app.ts:106))
A small brownian-motion controller: diffs accumulate with friction, biased back toward centre when near the extremes. Respects a `touchCountdown` so manual adjustments suppress auto-movement for ~200 ticks.

---

## BPM box controls (Clock panel)

- **BPM dial** — rotary control for current BPM
- **⟳ button** — triggers an immediate 2-bar smooth BPM jump (same logic as Auto=Jump)
- **Min / Max** — number inputs for the BPM range used by Wander and Jump modes
- **Auto** dropdown — Off / Wander / Jump

---

## UI system ([`src/ui.ts`](src/ui.ts))

Entirely programmatic DOM construction. Key helpers:
- `machine(...children)` — 3-column grid: `20px label | 1fr content | auto octave-controls`
- `controlGroup(label, content)` — 2-column grid: `20px label | auto content`
- `controls(...children)` — flex row wrapping container for the right-side control panels
- `Dial()` — from [`src/dial.ts`](src/dial.ts), canvas rotary dial, two-way bound to a `NumericParameter`
- `DialSet()` — renders a group of Dials
- `triggerButton()` / `restoreButton()` — ⟳ / ⤾ buttons wired to `Trigger` parameters
- `toggleButton()` — green/off toggle for boolean parameters (used for autopilot switches and drum mutes)
- `ClockControls()` — custom Clock panel with BPM dial, randomise button, min/max inputs, auto selector
- `OctaveControls()` — per-303 min/max octave inputs, rendered in the 3rd column of each machine

---

## CSS notes ([`ui.css`](ui.css))

- CSS custom properties for the colour scheme: `--bg`, `--panel`, `--text`, `--accent` (pink), `--accent2` (cyan)
- `.machine` uses `grid-template-columns: 20px 1fr auto` (label / main / octave controls)
- `.control-group` uses `grid-template-columns: 20px auto` (label / content)
- `.control-group` has `min-height: 100px; height: auto` so the Clock box grows to fit
- **Known pre-existing linter error** at line ~119: `height: 20%;  // 5 buttons` — the `//` comment syntax is invalid CSS but the browser ignores it. Do not worry about it.

---

## Build

```bash
# Just compile TypeScript (sufficient for local dev):
node node_modules/typescript/bin/tsc -p .

# Full production build (includes webpack bundle in dist/):
bash build.sh
```

TypeScript is in `node_modules` — if it's not there, run:
```bash
npm install --no-save typescript webpack webpack-cli @types/webmidi
```

After compiling, do a **hard refresh** in the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`) — the browser caches JS aggressively.

---

## Things to be aware of

1. **Delay warble:** Never smoothly ramp `delayTime.value` continuously — it pitch-modulates the audio like a chorus effect. Instead, queue the new value and apply it at `step === 0`.
2. **No framework:** DOM is built entirely in [`src/ui.ts`](src/ui.ts) with `document.createElement`. Keep the same pattern.
3. **Two-way binding:** Parameters are always wired both ways — UI → parameter **and** parameter → UI — using `.bind()` and `.subscribe()`.
4. **Shared gen vs local gen:** The global `state.gen` (`SynthwaveGen` instance in `ProgramState`) is only used for the **Notegen** UI panel and the shared "new notes" trigger. Each `ThreeOhUnit` has its **own** internal `localGen` (`SynthwaveGen`) so octave ranges are independent.
5. **MIDI is optional:** All MIDI paths are guarded with `if (midi)`. The `midi` variable starts as `null` and is replaced if `requestMIDIAccess()` succeeds.
