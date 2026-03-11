/*
 Copyright 2021 David Whiting
 This work is licensed under a Creative Commons Attribution 4.0 International License
 https://creativecommons.org/licenses/by/4.0/
*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { Clock, pressToStart } from "./boilerplate.js";
import { Audio } from './audio.js';
import { Midi } from './midi.js';
import { NineOhGen, SynthwaveGen } from "./pattern.js";
import { UI } from "./ui.js";
import { genericParameter, parameter, trigger } from "./interface.js";
// Musical delay multipliers — stored as beat fractions (1.0 = one quarter-note beat).
// Delay time in seconds = beats × (60 / bpm).
// Max value is 4 beats (1 bar at any BPM); audio.ts DelayInsert is created with 6s max.
export const DELAY_MULTIPLIERS = [
    { label: "1/16", beats: 0.25 },
    { label: "1/8T", beats: 1 / 3 },
    { label: "1/8", beats: 0.5 },
    { label: "1/4T", beats: 2 / 3 },
    { label: "3/16", beats: 0.75 }, // dotted 8th — original default
    { label: "1/4", beats: 1.0 },
    { label: "1/2T", beats: 4 / 3 },
    { label: "3/8", beats: 1.5 }, // dotted quarter
    { label: "1/2", beats: 2.0 },
    { label: "3/4", beats: 3.0 }, // dotted half
    { label: "1 bar", beats: 4.0 },
];
export const midiControlPresets = new Map([
    ["(Default)", {
            pitchOffset: 0,
            //absVolume:    63,
            //triggerCC:    -1,
            accentCC: -1,
            cutoffCC: -1,
            resonanceCC: -1,
            envModCC: -1,
            decayCC: -1,
            distortionCC: -1,
        }],
    ["Elektron - Digitakt", {
            pitchOffset: 0,
            //absVolume:    63,
            //triggerCC:    -1,
            accentCC: -1,
            cutoffCC: 74, // Filter frequency
            resonanceCC: 75, // Filter resonance
            envModCC: 77, // Filter env depth
            decayCC: 80, // Amp decay time
            distortionCC: 81, // Amp overdrive
        }],
    ["KORG - minilogue xd)", {
            // Values taken from the minilogue xd Owner's Manual, Version 1.00, page 61
            pitchOffset: 0,
            //absVolume:    63,
            //triggerCC:    39,  // Mixer VCO1
            accentCC: -1,
            cutoffCC: 43, // Cutoff
            resonanceCC: 44, // Resonance
            envModCC: 22, // EG Int
            decayCC: 17, // Amp Decay
            distortionCC: -1,
        }],
    ["Behringer - TD-3-MO", {
            // Values taken from trial & error, only two CC's are supported
            pitchOffset: 12,
            //absVolume:    63,
            //triggerCC:    -1,
            accentCC: 120,
            cutoffCC: 74, // Cutoff
            resonanceCC: -1,
            envModCC: -1,
            decayCC: -1,
            distortionCC: -1,
        }],
]);
// Drum MIDI notes relative to middle c (C4 = 60)
export const midiDrumPresets = new Map([
    ["(Default)", {
            //absVolume:  63,
            //triggerCC:  -1,
            pitchBD: 0,
            pitchOH: 0,
            pitchCH: 0,
            pitchSD: 0,
            pitchCP: 0,
            channelBD: -1,
            channelOH: -1,
            channelCH: -1,
            channelSD: -1,
            channelCP: -1,
        }],
    ["Elektron - Digitakt", {
            //absVolume:  63,
            //triggerCC:  -1,
            pitchBD: 0,
            pitchOH: 0,
            pitchCH: 0,
            pitchSD: 0,
            pitchCP: 0,
            channelBD: 0, // Track 1 (Kick)
            channelOH: 6, // Track 7 (Open Hat)
            channelCH: 5, // Track 6 (Closed Hat)
            channelSD: 1, // Track 2 (Snare)
            channelCP: 3, // Track 4 (Clap)
        }],
]);
function WanderingParameter(param, scaleFactor = 1 / 400) {
    const [min, max] = param.bounds;
    let diff = 0.0;
    let scale = scaleFactor * (max - min);
    let touchCountdown = 0;
    let previousValue = (min + max) / 2;
    const step = () => {
        if (previousValue != param.value) {
            // Something else has touched this parameter
            diff = 0;
            previousValue = param.value;
            touchCountdown = 200;
        }
        else {
            if (touchCountdown > 0) {
                touchCountdown--;
            }
            if (touchCountdown < 100) {
                diff *= touchCountdown > 0 ? 0.8 : 0.98;
                diff += (Math.random() - 0.5) * scale;
                param.value += diff;
                previousValue = param.value;
                if (param.value > min + 0.8 * (max - min)) {
                    diff -= Math.random() * scale;
                }
                else if (param.value < min + 0.2 * (max - min)) {
                    diff += Math.random() * scale;
                }
            }
        }
    };
    return {
        step
    };
}
function ThreeOhUnit(audio, midi, waveform, output, bpm, gen, patternLength = 16, defaultOctaveMin = 2, defaultOctaveMax = 4) {
    const synth = audio.ThreeOh(waveform, output);
    const midiDevice = parameter("Device", [0, Infinity], 0);
    const midiChannel = parameter("MIDI Channel", [0, 15], 0);
    const midiPreset = parameter("Preset", [0, Infinity], 0);
    const pattern = genericParameter("Pattern", []);
    const savedPattern = genericParameter("Pattern", []);
    const octaveMin = parameter("Oct Min", [-1, 7], defaultOctaveMin);
    const octaveMax = parameter("Oct Max", [-1, 7], defaultOctaveMax);
    const newPattern = trigger("New Pattern Trigger", true);
    const restorePattern = trigger("Restore Pattern Trigger", false);
    // Each ThreeOhUnit gets its own generator that remaps the shared key's pitch classes
    // into its own octave range, so both synth channels stay in the same key.
    const localGen = SynthwaveGen(() => [octaveMin.value, octaveMax.value], () => gen.noteSet.value);
    const parameters = {
        cutoff: parameter("Cutoff", [30, 700], 400),
        resonance: parameter("Resonance", [1, 30], 15),
        envMod: parameter("Env Mod", [0, 8000], 4000),
        decay: parameter("Decay", [0.1, 0.9], 0.5),
        distortion: parameter("Dist", [0, 80], 0)
    };
    const midiControls = {
        //absVolume: parameter("Volume", [0,127], 63),
        //triggerCC: parameter("Trig CC", [-1,127], -1),
        accentCC: parameter("Acc CC", [-1, 127], -1),
        cutoffCC: parameter("Cutoff CC", [-1, 127], -1),
        resonanceCC: parameter("Reso CC", [-1, 127], -1),
        envModCC: parameter("EnvMod CC", [-1, 127], -1),
        decayCC: parameter("Decay CC", [-1, 127], -1),
        distortionCC: parameter("Dist CC", [-1, 127], -1),
        pitchOffset: parameter("Pitch", [-48, 48], 0),
    };
    gen.newNotes.subscribe(newNotes => {
        if (newNotes == true)
            newPattern.value = true;
    });
    // Changing the octave range immediately triggers a fresh pattern *and* new notes
    // so that changeNotes() re-picks a root within the updated octave bounds.
    octaveMin.subscribe(() => { localGen.newNotes.value = true; newPattern.value = true; });
    octaveMax.subscribe(() => { localGen.newNotes.value = true; newPattern.value = true; });
    // All three classic waveforms in the random pool — sawtooth and square are from the
    // original acid banger; triangle is the synthwave lead tone.
    const waveforms = ["sawtooth", "square", "triangle"];
    function step(index) {
        if ((index === 0 && newPattern.value == true) || pattern.value.length == 0) {
            savedPattern.value = pattern.value;
            pattern.value = localGen.createPattern();
            // Pick a new waveform at pattern-generation time
            synth.setWaveform(waveforms[Math.floor(Math.random() * waveforms.length)]);
            newPattern.value = false;
        }
        if (index === 0 && restorePattern.value == true && savedPattern.value.length > 0) {
            const tempPattern = pattern.value;
            pattern.value = savedPattern.value;
            savedPattern.value = tempPattern;
            restorePattern.value = false;
            newPattern.value = false;
        }
        else if (restorePattern.value == true && savedPattern.value.length == 0) {
            restorePattern.value = false;
        }
        // if (midi) {
        //     // send 6 clock pulses per 4 steps (24 per quarter note)
        //     const device = midi.OutputDevice(midiDevice.value, midiChannel.value);
        //     for (let i = 0; i < 6; i++)
        //         window.setTimeout(() => { device.clockPulse(); }, (60000/bpm.value)*(i/24));
        // }
        const slot = pattern.value[index % patternLength];
        if (slot.note != "-") {
            synth.noteOn(slot.note, slot.accent, slot.glide);
            if (midi) {
                const device = midi.OutputDevice(midiDevice.value, midiChannel.value);
                //device.controlChange(midiControls.triggerCC.value, midiControls.absVolume.value);
                const velocity = slot.accent ? 127 : 100;
                const length = slot.glide ? 100 : 50;
                if (slot.accent) {
                    device.controlChange(midiControls.accentCC.value, slot.accent ? 127 : 0);
                    setTimeout(() => { device.controlChange(midiControls.accentCC.value, 0); }, 100); // reset after 100 ms, mainly for TD-3-MO (accent = CC change)
                }
                device.noteOn(slot.note, velocity, length, midiControls.pitchOffset.value);
            }
        }
        else {
            synth.noteOff();
            if (midi) {
                const device = midi.OutputDevice(midiDevice.value, midiChannel.value);
                //device.noteOff();
                //device.controlChange(midiControls.triggerCC.value, 0x00);
            }
        }
    }
    parameters.cutoff.subscribe(v => synth.params.cutoff.value = v);
    parameters.resonance.subscribe(v => synth.params.resonance.value = v);
    parameters.envMod.subscribe(v => synth.params.envMod.value = v);
    parameters.decay.subscribe(v => synth.params.decay.value = v);
    parameters.distortion.subscribe(v => synth.params.distortion.value = v);
    if (midi) {
        midiDevice.subscribe(d => {
            var output = midi.getOutput(d);
            if (output) {
                const deviceName = output.manufacturer + " " + output.name;
                console.log("MIDI output device: " + deviceName);
                for (let channel = 0; channel < 16; channel++) {
                    const device = midi.OutputDevice(midiDevice.value, channel);
                    device.allNotesOff();
                }
            }
        });
        midiChannel.subscribe(c => {
        });
        midiPreset.subscribe(d => {
            const presetName = Array.from(midiControlPresets.keys())[midiPreset.value];
            console.log("MIDI control preset: " + presetName);
            const preset = midiControlPresets.get(presetName);
            if (preset) {
                //midiControls.absVolume.value = preset.absVolume;
                //midiControls.triggerCC.value = preset.triggerCC;
                midiControls.accentCC.value = preset.accentCC;
                midiControls.cutoffCC.value = preset.cutoffCC;
                midiControls.resonanceCC.value = preset.resonanceCC;
                midiControls.decayCC.value = preset.decayCC;
                midiControls.envModCC.value = preset.envModCC;
                midiControls.distortionCC.value = preset.distortionCC;
                midiControls.pitchOffset.value = preset.pitchOffset;
            }
        });
        function sendMidiControl(param, control) {
            const v = Math.trunc((param.value - param.bounds[0]) / (param.bounds[1] - param.bounds[0]) * 127); // convert to MIDI range
            if (midi && control.value >= 0) {
                const device = midi.OutputDevice(midiDevice.value, midiChannel.value);
                device.controlChange(control.value, v);
            }
        }
        parameters.cutoff.subscribe(v => sendMidiControl(parameters.cutoff, midiControls.cutoffCC));
        parameters.resonance.subscribe(v => sendMidiControl(parameters.resonance, midiControls.resonanceCC));
        parameters.envMod.subscribe(v => sendMidiControl(parameters.envMod, midiControls.envModCC));
        parameters.decay.subscribe(v => sendMidiControl(parameters.decay, midiControls.decayCC));
        parameters.distortion.subscribe(v => sendMidiControl(parameters.distortion, midiControls.distortionCC));
    }
    return {
        step,
        pattern,
        parameters,
        octaveMin,
        octaveMax,
        midiDevice,
        midiChannel,
        midiPreset,
        midiControls,
        newPattern,
        restorePattern
    };
}
function NineOhUnit(audio, midi, bpm) {
    return __awaiter(this, void 0, void 0, function* () {
        // Synth sample set (5 tracks: BD, OH, CH, SD, CP)
        const synthDrums = yield audio.SamplerDrumMachine(["samples/bd01.mp4", "samples/oh01.mp4", "samples/hh01.mp4", "samples/sd02.mp4", "samples/cp01.mp4"]);
        // 909 acid sample set (4 tracks: BD, OH, CH, SD — no clap)
        const acidDrums = yield audio.SamplerDrumMachine(["samples/909BD.mp3", "samples/909OH.mp3", "samples/909CH.mp3", "samples/909SD.mp3"]);
        // Which sample to use per track, decided at pattern-generation time.
        // 0 = synth, 1 = 909. CP (index 4) is always 0.
        let currentSampleVariants = [0, 0, 0, 0, 0];
        const midiDevice = parameter("MIDI Device", [0, Infinity], 0);
        const midiChannel = parameter("MIDI Channel", [0, 15], 0);
        const midiPreset = parameter("Preset", [0, Infinity], 0);
        const pattern = genericParameter("Drum Pattern", []);
        const savedPattern = genericParameter("Drum Pattern", []);
        const mutes = [
            genericParameter("Mute BD", false),
            genericParameter("Mute OH", false),
            genericParameter("Mute CH", false),
            genericParameter("Mute SD", false),
            genericParameter("Mute CP", false)
        ];
        const middleC = 60;
        const midiNotes = [
            parameter("BD Pitch", [0, 48], 0),
            parameter("OH Pitch", [0, 48], 0),
            parameter("CH Pitch", [0, 48], 0),
            parameter("SD Pitch", [0, 48], 0),
            parameter("CP Pitch", [0, 48], 0),
        ];
        const midiChannels = [
            parameter("BD Channel", [-1, 15], 0),
            parameter("OH Channel", [-1, 15], 0),
            parameter("CH Channel", [-1, 15], 0),
            parameter("SD Channel", [-1, 15], 0),
            parameter("CP Channel", [-1, 15], 0),
        ];
        const midiControls = {
            //absVolume: parameter("Volume", [0,127], 63),
            //triggerCC: parameter("Trigger CC", [-1,127], -1),
            pitchBD: midiNotes[0],
            channelBD: midiChannels[0],
            pitchOH: midiNotes[1],
            channelOH: midiChannels[1],
            pitchCH: midiNotes[2],
            channelCH: midiChannels[2],
            pitchSD: midiNotes[3],
            channelSD: midiChannels[3],
            pitchCP: midiNotes[4],
            channelCP: midiChannels[4],
        };
        const newPattern = trigger("New Pattern Trigger", true);
        const restorePattern = trigger("Restore Pattern Trigger", false);
        const gen = NineOhGen();
        function step(index) {
            if ((index == 0 && newPattern.value == true) || pattern.value.length == 0) {
                savedPattern.value = pattern.value;
                const result = gen.createPatterns(true);
                pattern.value = result.patterns;
                currentSampleVariants = result.sampleVariants;
                newPattern.value = false;
            }
            if (index === 0 && restorePattern.value == true && savedPattern.value.length > 0) {
                const tempPattern = pattern.value;
                pattern.value = savedPattern.value;
                savedPattern.value = tempPattern;
                restorePattern.value = false;
                newPattern.value = false;
            }
            else if (restorePattern.value == true && savedPattern.value.length == 0) {
                restorePattern.value = false;
            }
            // if (midi) {
            //     // send 6 clock pulses per step (24 per quarter note)
            //     const device = midi.OutputDevice(midiDevice.value, midiChannel.value);
            //     for (let i = 0; i < 6; i++)
            //         window.setTimeout(() => { device.clockPulse(); }, (60000/bpm.value)*(i/24));
            // }
            var hasNotes = false;
            for (let i in pattern.value) {
                const entry = pattern.value[i][index % pattern.value[i].length];
                if (entry && !mutes[i].value) {
                    // Use the sample chosen at pattern-generation time
                    const trackIdx = Number(i);
                    const useAcid = currentSampleVariants[trackIdx] === 1 && trackIdx < acidDrums.triggers.length;
                    const triggers = useAcid ? acidDrums.triggers : synthDrums.triggers;
                    triggers[trackIdx].play(entry);
                    hasNotes = true;
                    if (midi) {
                        const channel = midiChannels[i].value >= 0 ? midiChannels[i].value : midiChannel.value;
                        const device = midi.OutputDevice(midiDevice.value, channel);
                        const velocity = Math.floor(entry * 127);
                        //device.controlChange(midiControls.triggerCC.value, midiControls.absVolume.value);
                        device.noteOn(midiNotes[i].value, velocity);
                    }
                }
            }
            if (midi) {
                const channel = /* midiChannels[i].value >= 0 ? midiChannels[i].value : */ midiChannel.value;
                const device = midi.OutputDevice(midiDevice.value, channel);
                //if (! hasNotes)
                //    device.controlChange(midiControls.triggerCC.value, 0x00);
            }
        }
        if (midi) {
            midiDevice.subscribe(d => {
                const output = midi.getOutput(d);
                if (output) {
                    const deviceName = output.manufacturer + " " + output.name;
                    console.log("MIDI output device: " + deviceName);
                    for (let channel = 0; channel < 16; channel++) {
                        const device = midi.OutputDevice(midiDevice.value, channel);
                        device.allNotesOff();
                    }
                }
            });
            midiChannel.subscribe(c => {
            });
            midiPreset.subscribe(d => {
                const presetName = Array.from(midiDrumPresets.keys())[midiPreset.value];
                console.log("MIDI control preset: " + presetName);
                const preset = midiDrumPresets.get(presetName);
                if (preset) {
                    //midiControls.absVolume.value = preset.absVolume;
                    //midiControls.triggerCC.value = preset.triggerCC;
                    midiControls.pitchBD.value = preset.pitchBD;
                    midiControls.pitchOH.value = preset.pitchOH;
                    midiControls.pitchCH.value = preset.pitchCH;
                    midiControls.pitchSD.value = preset.pitchSD;
                    midiControls.pitchCP.value = preset.pitchCP;
                    midiControls.channelBD.value = preset.channelBD;
                    midiControls.channelOH.value = preset.channelOH;
                    midiControls.channelCH.value = preset.channelCH;
                    midiControls.channelSD.value = preset.channelSD;
                    midiControls.channelCP.value = preset.channelCP;
                }
            });
        }
        return {
            step,
            pattern,
            mutes,
            midiDevice,
            midiChannel,
            midiPreset,
            midiControls,
            newPattern,
            restorePattern
        };
    });
}
function DelayUnit(audio) {
    const dryWet = parameter("Dry/Wet", [0, 1], 0.6);
    const feedback = parameter("Feedback", [0, 0.9], 0.4);
    const delayTime = parameter("Time", [0, 6], 0.3);
    // Index into DELAY_MULTIPLIERS; default 4 = "3/16" (dotted 8th) = original behaviour.
    const delayMultiplierIndex = parameter("Delay Timing", [0, DELAY_MULTIPLIERS.length - 1], 4);
    const delay = audio.DelayInsert(delayTime.value, feedback.value, dryWet.value);
    dryWet.subscribe(w => delay.wet.value = w);
    feedback.subscribe(f => delay.feedback.value = f);
    // Direct assignment — caller is responsible for only updating delayTime at
    // bar boundaries (step 0) to avoid pitch-warble artefacts.
    delayTime.subscribe(t => delay.delayTime.value = t);
    return {
        dryWet,
        feedback,
        delayTime,
        delayMultiplierIndex,
        inputNode: delay.in,
    };
}
function AutoPilot(state) {
    const nextMeasure = parameter("upcomingMeasure", [0, Infinity], 0);
    const currentMeasure = parameter("measure", [0, Infinity], 0);
    const patternEnabled = genericParameter("Alter Patterns", true);
    const dialsEnabled = genericParameter("Twiddle With Knobs", true);
    const mutesEnabled = genericParameter("Mute Drum Parts", true);
    // Randomisation parameters — exposed to UI
    const noteChangeMeasures = parameter("Note Pattern Every (measures)", [1, 128], 16);
    const noteChangeChance = parameter("Note Pattern Chance (%)", [0, 100], 50);
    const newNotesChangeMeasures = parameter("New Notes Every (measures)", [1, 256], 64);
    const newNotesChangeChance = parameter("New Notes Chance (%)", [0, 100], 20);
    const drumChangeMeasures = parameter("Drum Pattern Every (measures)", [1, 128], 16);
    const drumChangeChance = parameter("Drum Pattern Chance (%)", [0, 100], 30);
    const muteMeasures = parameter("Drum Mute Every (measures)", [1, 64], 8);
    const muteBDChance = parameter("Mute BD Chance (%)", [0, 100], 20);
    const muteOHChance = parameter("Mute OH Chance (%)", [0, 100], 50);
    const muteCHChance = parameter("Mute CH Chance (%)", [0, 100], 50);
    const muteSDChance = parameter("Mute SD Chance (%)", [0, 100], 50);
    const muteCPChance = parameter("Mute CP Chance (%)", [0, 100], 80);
    const bpmJumpMeasures = parameter("BPM Jump Every (measures)", [1, 128], 32);
    const bpmJumpChance = parameter("BPM Jump Chance (%)", [0, 100], 20);
    const delayChangeMeasures = parameter("Delay Timing Every (measures)", [1, 128], 16);
    const delayChangeChance = parameter("Delay Timing Chance (%)", [0, 100], 25);
    var lastDrumChange = 0;
    var lastNoteChange = [0, 0];
    state.clock.currentStep.subscribe(step => {
        if (step === 4) {
            nextMeasure.value = nextMeasure.value + 1;
        }
        else if (step === 15) { // slight hack to get mutes functioning as expected
            currentMeasure.value = currentMeasure.value + 1;
        }
    });
    function triggerBpmJump() {
        const min = Math.min(state.clock.bpmMin.value, state.clock.bpmMax.value);
        const max = Math.max(state.clock.bpmMin.value, state.clock.bpmMax.value);
        bpmJumpStartTime = Date.now();
        bpmJumpStartValue = state.clock.bpm.value;
        // Cap the jump to ±8 BPM from the current value, then clamp to [min, max].
        const rawTarget = Math.round(min + Math.random() * (max - min));
        const clampedDelta = Math.max(-8, Math.min(8, rawTarget - bpmJumpStartValue));
        bpmJumpTargetValue = Math.max(min, Math.min(max, bpmJumpStartValue + clampedDelta));
        // Rate-limit to 2 BPM per bar: duration = max(1, |delta|/2) bars.
        // One bar = 240000/bpm ms (4 beats × 60000/bpm ms each).
        const barMs = 240000 / state.clock.bpm.value;
        bpmJumpDuration = Math.max(1, Math.abs(bpmJumpTargetValue - bpmJumpStartValue) / 2) * barMs;
        bpmJumping = true;
        console.log("BPM jump %d -> %d over %dms", bpmJumpStartValue, bpmJumpTargetValue, Math.round(bpmJumpDuration));
    }
    // Randomize button triggers an immediate 2-bar jump
    state.clock.randomizeBpm.subscribe(v => {
        if (v) {
            triggerBpmJump();
            state.clock.randomizeBpm.value = false;
        }
    });
    nextMeasure.subscribe(measure => {
        // BPM jump — configurable interval and chance
        if (state.clock.bpmTwiddleMode.value === 1 && measure % bpmJumpMeasures.value === 0 && Math.random() < bpmJumpChance.value / 100) {
            triggerBpmJump();
            console.log("measure #%d: auto BPM jump triggered", measure);
        }
        // Delay multiplier randomisation — gated on "Twiddle With Knobs"
        if (dialsEnabled.value && measure % delayChangeMeasures.value === 0 && Math.random() < delayChangeChance.value / 100) {
            const newIdx = Math.floor(Math.random() * DELAY_MULTIPLIERS.length);
            state.delay.delayMultiplierIndex.value = newIdx;
            console.log("measure #%d: delay multiplier -> %s", measure, DELAY_MULTIPLIERS[newIdx].label);
        }
        if (patternEnabled.value) {
            // New note set — configurable interval and chance
            if (measure % newNotesChangeMeasures.value === 0) {
                if (Math.random() < newNotesChangeChance.value / 100) {
                    console.log("measure #%d: will generate new notes", measure);
                    state.gen.newNotes.value = true;
                    lastNoteChange[0] = lastNoteChange[1] = measure;
                }
            }
            // New note patterns — configurable interval and chance
            if (measure % noteChangeMeasures.value === 0) {
                state.notes.forEach((n, i) => {
                    if (Math.random() < noteChangeChance.value / 100) {
                        console.log("measure #%d: will generate new pattern for unit %d", measure, i);
                        n.newPattern.value = true;
                        lastNoteChange[i] = measure;
                    }
                });
            }
            // New drum pattern — configurable interval and chance
            if (measure % drumChangeMeasures.value === 0) {
                if (Math.random() < drumChangeChance.value / 100) {
                    console.log("measure #%d: will generate new pattern for drums", measure);
                    state.drums.newPattern.value = true;
                    lastDrumChange = measure;
                }
            }
        }
    });
    currentMeasure.subscribe(measure => {
        if (mutesEnabled.value) {
            const perTrackChances = [
                muteBDChance.value / 100,
                muteOHChance.value / 100,
                muteCHChance.value / 100,
                muteSDChance.value / 100,
                muteCPChance.value / 100,
            ];
            const drumMutes = perTrackChances.map(c => Math.random() < c);
            const numActive = state.drums.mutes.reduce((sum, current) => !current.value ? sum + 1 : sum, 0);
            if (measure % muteMeasures.value === 0) {
                console.log("measure #%d: may mute drum parts", measure);
                state.drums.mutes.forEach((m, i) => {
                    m.value = drumMutes[i];
                });
            }
            else if (measure % muteMeasures.value === muteMeasures.value - 1) {
                console.log("measure #%d: may mute drum parts (late)", measure);
                state.drums.mutes.forEach((m, i) => {
                    if (Math.random() < 0.5) {
                        m.value || (m.value = drumMutes[i]);
                    }
                });
            }
            else if (measure % 2 === 0) {
                console.log("measure #%d: may unmute drum parts", measure);
                state.drums.mutes.forEach((m, i) => {
                    if (Math.random() < 1. / (numActive + 1)) {
                        m.value && (m.value = drumMutes[i]);
                    }
                });
            }
        }
    });
    // Separate distortion params out so they can use a custom extended-range wanderer.
    // All other note params use the standard WanderingParameter.
    const distortionParams = state.notes.map(x => x.parameters.distortion);
    const noteParams = state.notes.flatMap(x => Object.values(x.parameters).filter(p => p !== x.parameters.distortion));
    const delayParams = [state.delay.feedback, state.delay.dryWet];
    const wanderers = [...noteParams, ...delayParams].map(param => WanderingParameter(param));
    // Distortion wanderer: internal shadow value ranges -60 to 80.
    // When shadow < 0 the parameter is clamped to 0 (off), giving natural extended
    // silent periods. The knob itself stays [0,80] so it still looks/feels correct.
    const distortionWanderers = distortionParams.map(param => {
        let shadow = 0;
        let diff = 0;
        let touchCountdown = 0;
        let previousValue = param.value;
        const scale = (1 / 400) * 140; // 140 = virtual range -60..80
        return {
            step: () => {
                if (previousValue !== param.value) {
                    // Manual adjustment — sync shadow to current knob value and pause
                    shadow = param.value;
                    diff = 0;
                    previousValue = param.value;
                    touchCountdown = 200;
                    return;
                }
                if (touchCountdown > 0)
                    touchCountdown--;
                if (touchCountdown < 100) {
                    diff *= touchCountdown > 0 ? 0.8 : 0.98;
                    diff += (Math.random() - 0.5) * scale;
                    shadow += diff;
                    shadow = Math.max(-60, Math.min(80, shadow));
                    // Bias back toward centre of virtual range (10) when near extremes
                    if (shadow > 52)
                        diff -= Math.random() * scale;
                    else if (shadow < -36)
                        diff += Math.random() * scale;
                    // Write clamped value — negative shadow = distortion off
                    const clamped = Math.max(0, shadow);
                    param.value = clamped;
                    previousValue = clamped;
                }
            }
        };
    });
    // BPM jump state
    let bpmJumping = false;
    let bpmJumpStartTime = 0;
    let bpmJumpStartValue = 0;
    let bpmJumpTargetValue = 0;
    let bpmJumpDuration = 0;
    window.setInterval(() => {
        if (dialsEnabled.value) {
            wanderers.forEach(w => w.step());
            distortionWanderers.forEach(w => w.step());
        }
        // Mode 1: advance smooth BPM transition
        if (bpmJumping && state.clock.bpmTwiddleMode.value === 1) {
            const elapsed = Date.now() - bpmJumpStartTime;
            const t = Math.min(1, elapsed / bpmJumpDuration);
            const newBpm = bpmJumpStartValue + (bpmJumpTargetValue - bpmJumpStartValue) * t;
            state.clock.bpm.value = Math.round(newBpm);
            if (t >= 1)
                bpmJumping = false;
        }
    }, 100);
    return {
        switches: [
            patternEnabled,
            dialsEnabled,
            mutesEnabled
        ],
        randomisation: {
            noteChangeMeasures,
            noteChangeChance,
            newNotesChangeMeasures,
            newNotesChangeChance,
            drumChangeMeasures,
            drumChangeChance,
            muteMeasures,
            muteBDChance,
            muteOHChance,
            muteCHChance,
            muteSDChance,
            muteCPChance,
            bpmJumpMeasures,
            bpmJumpChance,
            delayChangeMeasures,
            delayChangeChance,
        }
    };
}
function ClockUnit() {
    const bpmMin = parameter("BPM Min", [40, 300], 80);
    const bpmMax = parameter("BPM Max", [40, 300], 120);
    const bpm = parameter("BPM", [40, 300], 90);
    const bpmTwiddleMode = parameter("BPM Auto", [0, 1], 1); // 0=Off, 1=Jump
    const randomizeBpm = trigger("Randomize BPM", false);
    const currentStep = parameter("Current Step", [0, 15], 0);
    const clockImpl = Clock(bpm.value, 4, 0.0);
    bpm.subscribe(clockImpl.setBpm);
    clockImpl.bind((time, step) => {
        currentStep.value = step % 16;
    });
    return {
        bpm,
        bpmMin,
        bpmMax,
        bpmTwiddleMode,
        randomizeBpm,
        currentStep
    };
}
function start() {
    return __awaiter(this, void 0, void 0, function* () {
        const audio = Audio();
        const clock = ClockUnit();
        const delay = DelayUnit(audio);
        // Derive delay time from the selected multiplier and current BPM.
        // Only apply at bar boundaries (step 0) to avoid pitch-warble artefacts.
        function calcDelayTime() {
            const beats = DELAY_MULTIPLIERS[Math.round(delay.delayMultiplierIndex.value)].beats;
            return beats * (60 / clock.bpm.value);
        }
        let pendingDelayTime = null;
        clock.bpm.subscribe(() => { pendingDelayTime = calcDelayTime(); });
        delay.delayMultiplierIndex.subscribe(() => { pendingDelayTime = calcDelayTime(); });
        clock.currentStep.subscribe(step => {
            if (step === 0 && pendingDelayTime !== null) {
                delay.delayTime.value = pendingDelayTime;
                pendingDelayTime = null;
            }
        });
        const gen = SynthwaveGen();
        // Consume the shared gen's newNotes trigger so the NoteGen UI panel
        // gets populated (noteSet updated, flashing ⟳ button cleared).
        // Each ThreeOhUnit propagates this trigger to its own localGen for actual pattern generation.
        gen.newNotes.subscribe(v => {
            if (v)
                gen.createPattern();
        });
        const programState = {
            notes: [
                ThreeOhUnit(audio, midi, "triangle", delay.inputNode, clock.bpm, gen, 16, 0, 4), // lead: octaves 0-4
                ThreeOhUnit(audio, midi, "sawtooth", delay.inputNode, clock.bpm, gen, 16, 0, 4), // bass: octaves 0-4
            ],
            drums: yield NineOhUnit(audio, midi, clock.bpm),
            gen,
            delay,
            clock,
            masterVolume: parameter("Volume", [0, 1], 0.5)
        };
        if (midi) {
            console.log("MIDI output enabled");
            clock.bpm.subscribe(b => midi.noteLength = (1 / 4) * (60000 / b));
            midi.startClock(clock.bpm);
        }
        programState.masterVolume.subscribe(newVolume => { audio.master.in.gain.value = newVolume; });
        clock.currentStep.subscribe(step => [...programState.notes, programState.drums].forEach(d => d.step(step)));
        const autoPilot = AutoPilot(programState);
        const ui = UI(programState, autoPilot, audio.master.analyser, midi);
        document.body.append(ui);
    });
}
var midi = null;
try {
    window.navigator.requestMIDIAccess()
        .then((midiAccess) => {
        console.log("MIDI Ready!");
        midi = Midi(midiAccess);
        midi.listInputsAndOutputs();
    })
        .catch((error) => {
        console.log("Error accessing MIDI devices: " + error);
    });
}
catch (error) {
    console.log("Error accessing MIDI devices: " + error);
}
pressToStart(start, "Endless Synthwave Generator", "A collaboration between human and algorithm by Vitling, spiced up by Zykure, reimagined by webdesignerdesjahres");
//# sourceMappingURL=app.js.map