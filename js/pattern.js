/*
  Copyright 2021 David Whiting
  This work is licensed under a Creative Commons Attribution 4.0 International License
  https://creativecommons.org/licenses/by/4.0/
*/
import { midiNoteToText, textNoteToNumber } from "./audio.js";
import { choose, rndInt } from "./math.js";
import { genericParameter, trigger } from "./interface.js";
export function ThreeOhGen() {
    let noteSet = genericParameter("note set", ['C1']);
    let newNotes = trigger("new note set", true);
    const density = 1.0;
    const offsetChoices = [
        [0, 0, 12, 24, 27],
        [0, 0, 0, 12, 10, 19, 26, 27],
        [0, 1, 7, 10, 12, 13],
        [0],
        [0, 0, 0, 12],
        [0, 0, 12, 14, 15, 19],
        [0, 0, 0, 0, 12, 13, 16, 19, 22, 24, 25],
        [0, 0, 0, 7, 12, 15, 17, 20, 24],
    ];
    function changeNotes() {
        const root = rndInt(15) + 16;
        const offsets = choose(offsetChoices);
        noteSet.value = offsets.map(o => midiNoteToText(o + root));
    }
    function createPattern() {
        if (newNotes.value == true) {
            changeNotes();
            newNotes.value = false;
        }
        const pattern = [];
        for (let i = 0; i < 16; i++) {
            const chance = density * (i % 4 === 0 ? 0.6 : (i % 3 === 0 ? 0.5 : (i % 2 === 0 ? 0.3 : 0.1)));
            if (Math.random() < chance) {
                pattern.push({
                    note: choose(noteSet.value),
                    accent: Math.random() < 0.3,
                    glide: Math.random() < 0.1
                });
            }
            else {
                pattern.push({
                    note: "-",
                    accent: false,
                    glide: false
                });
            }
        }
        return pattern;
    }
    return {
        createPattern,
        newNotes,
        noteSet
    };
}
export function SynthwaveGen(getOctaveRange = () => [2, 4], getSharedNoteSet) {
    let noteSet = genericParameter("note set", ['C3']);
    let newNotes = trigger("new note set", true);
    const density = 0.8;
    // Synthwave-style: clean tonal intervals (thirds, fifths, octaves)
    const synthOffsetChoices = [
        [0, 3, 7, 12],
        [0, 3, 7, 10, 12],
        [0, 5, 7, 12],
        [0, 3, 5, 7, 10, 12],
        [0, 3, 7, 12, 15]
    ];
    // Acid-style: gritty chromatic leaps from the original ThreeOhGen
    const acidOffsetChoices = [
        [0, 0, 12, 24, 27],
        [0, 0, 0, 12, 10, 19, 26, 27],
        [0, 1, 7, 10, 12, 13],
        [0],
        [0, 0, 0, 12],
        [0, 0, 12, 14, 15, 19],
        [0, 0, 0, 0, 12, 13, 16, 19, 22, 24, 25],
        [0, 0, 0, 7, 12, 15, 17, 20, 24],
    ];
    // Combined pool — both flavours are available for random selection
    const offsetChoices = [...synthOffsetChoices, ...acidOffsetChoices];
    function changeNotes() {
        const [minOct, maxOct] = getOctaveRange();
        // MIDI: C(oct) = oct * 12 + 12
        const minMidi = minOct * 12 + 12;
        const maxMidi = (maxOct + 1) * 12 + 11; // top note of maxOct (inclusive)
        if (getSharedNoteSet) {
            // Shared-key mode: take the pitch classes from the global gen's noteSet
            // and find all transpositions that fall within our octave range.
            const sharedNotes = getSharedNoteSet();
            const remapped = [];
            for (const note of sharedNotes) {
                const midiVal = textNoteToNumber(note);
                const pitchClass = midiVal % 12; // 0–11
                // Walk up from the bottom of our range finding every octave of this pitch class
                // that lands within [minMidi, maxMidi].
                let candidate = pitchClass + 12; // pitch class in octave 0 (MIDI formula: pc + 12)
                while (candidate < minMidi)
                    candidate += 12;
                while (candidate <= maxMidi) {
                    remapped.push(midiNoteToText(candidate));
                    candidate += 12;
                }
            }
            noteSet.value = remapped.length > 0 ? [...new Set(remapped)] : [midiNoteToText(minMidi)];
        }
        else {
            // Primary mode: pick a fresh root + interval set within the octave range.
            const rootCeiling = maxOct * 12 + 12; // bottom of maxOct
            const root = minMidi + rndInt(Math.max(1, rootCeiling - minMidi + 1));
            const offsets = choose(offsetChoices);
            noteSet.value = offsets.map(o => midiNoteToText(o + root));
        }
    }
    function createPattern() {
        if (newNotes.value == true) {
            changeNotes();
            newNotes.value = false;
        }
        const pattern = [];
        // Randomly pick rhythmic style each pattern — ~40% acid, ~60% synthwave
        const acidStyle = Math.random() < 0.4;
        for (let i = 0; i < 16; i++) {
            let chance;
            if (acidStyle) {
                // Acid: syncopated, position-weighted — sparse off-beats, busy on beats
                chance = density * (i % 4 === 0 ? 0.6 : (i % 3 === 0 ? 0.5 : (i % 2 === 0 ? 0.3 : 0.1)));
            }
            else {
                // Synthwave: more uniform, slightly beat-favoured
                chance = density * (i % 4 === 0 ? 0.9 : 0.5);
            }
            if (Math.random() < chance) {
                pattern.push({
                    note: choose(noteSet.value),
                    accent: Math.random() < (acidStyle ? 0.3 : 0.1),
                    glide: Math.random() < (acidStyle ? 0.1 : 0.05),
                });
            }
            else {
                pattern.push({
                    note: "-",
                    accent: false,
                    glide: false
                });
            }
        }
        return pattern;
    }
    return {
        createPattern,
        newNotes,
        noteSet
    };
}
export function NineOhGen() {
    function createPatterns(full = false) {
        const bdPattern = new Array(16);
        const ohPattern = new Array(16);
        const chPattern = new Array(16);
        const sdPattern = new Array(16);
        const cpPattern = new Array(16);
        // D&B modes added alongside existing electro/fourfloor
        const kickMode = choose(["electro", "fourfloor", "dnb", "halftime"]);
        const hatMode = choose(["offbeats", "closed", "rolling", full ? "offbeats" : "none"]);
        const snareMode = choose(["backbeat", "skip", "dnb", full ? "backbeat" : "none"]);
        const clapMode = choose(["backbeat", "skip", full ? "backbeat" : "none"]);
        // ── Kick patterns ────────────────────────────────────────────────────────
        if (kickMode == "fourfloor") {
            for (let i = 0; i < 16; i++) {
                if (i % 4 == 0) {
                    bdPattern[i] = 0.9;
                }
                else if (i % 2 == 0 && Math.random() < 0.1) {
                    bdPattern[i] = 0.6;
                }
            }
        }
        else if (kickMode == "electro") {
            for (let i = 0; i < 16; i++) {
                if (i == 0) {
                    bdPattern[i] = 1;
                }
                else if (i % 2 == 0 && i % 8 != 4 && Math.random() < 0.5) {
                    bdPattern[i] = Math.random() * 0.9;
                }
                else if (Math.random() < 0.05) {
                    bdPattern[i] = Math.random() * 0.9;
                }
            }
        }
        else if (kickMode == "dnb") {
            // Classic D&B: hard kick on 0, syncopated double/ghost kicks around step 10-11
            // Template variants chosen randomly
            const dnbTemplates = [
                [0, 10], // minimal
                [0, 3, 10], // slightly busier
                [0, 10, 11], // double-hit on the "and"
                [0, 6, 10], // mid-bar accent
                [0, 3, 10, 14], // rolling feel
            ];
            const template = choose(dnbTemplates);
            for (let i = 0; i < 16; i++) {
                if (template.includes(i)) {
                    bdPattern[i] = i === 0 ? 1.0 : 0.7 + Math.random() * 0.25;
                }
                else if (Math.random() < 0.04) {
                    bdPattern[i] = 0.3 + Math.random() * 0.2; // ghost kick
                }
            }
        }
        else if (kickMode == "halftime") {
            // Halftime: kick only on beat 1 and late beat 3 — big, heavy
            for (let i = 0; i < 16; i++) {
                if (i === 0) {
                    bdPattern[i] = 1.0;
                }
                else if (i === 10 || i === 11) {
                    bdPattern[i] = 0.8 + Math.random() * 0.2;
                }
            }
        }
        // ── Snare patterns ───────────────────────────────────────────────────────
        if (snareMode == "backbeat") {
            for (let i = 0; i < 16; i++) {
                if (i % 8 === 4) {
                    sdPattern[i] = 1;
                }
            }
        }
        else if (snareMode == "skip") {
            for (let i = 0; i < 16; i++) {
                if (i % 8 === 3 || i % 8 === 6) {
                    sdPattern[i] = 0.6 + Math.random() * 0.4;
                }
                else if (i % 2 === 0 && Math.random() < 0.2) {
                    sdPattern[i] = 0.4 + Math.random() * 0.2;
                }
                else if (Math.random() < 0.1) {
                    sdPattern[i] = 0.2 + Math.random() * 0.2;
                }
            }
        }
        else if (snareMode == "dnb") {
            // D&B snare: hard hit on step 8 (beat 3), ghost hits scattered
            for (let i = 0; i < 16; i++) {
                if (i === 8) {
                    sdPattern[i] = 1.0;
                }
                else if (i === 12 && Math.random() < 0.4) {
                    sdPattern[i] = 0.5 + Math.random() * 0.3; // ghost before bar end
                }
                else if (Math.random() < 0.08) {
                    sdPattern[i] = 0.15 + Math.random() * 0.2; // ghost notes
                }
            }
        }
        // ── Clap patterns ────────────────────────────────────────────────────────
        if (clapMode == "backbeat") {
            for (let i = 0; i < 16; i++) {
                if (i % 8 === 4) {
                    cpPattern[i] = 0.5;
                }
                else if (i % 8 == 5 && sdPattern[i - 1]) {
                    cpPattern[i] = 0.3 + Math.random() * 0.2;
                }
            }
        }
        else if (clapMode == "skip") {
            for (let i = 0; i < 16; i++) {
                if (i % 8 === 3 || i % 8 === 6) {
                    cpPattern[i] = 0.5 + Math.random() * 0.3;
                }
                else if ((i % 8 === 4 || i % 8 === 7) && cpPattern[i - 1] && Math.random() < 0.5) {
                    cpPattern[i] = 0.3 + Math.random() * 0.2;
                }
                else if (i % 2 === 0 && Math.random() < (sdPattern[i] ? 0.2 : 0.4)) {
                    cpPattern[i] = 0.4 + Math.random() * 0.1;
                }
                else if (Math.random() < 0.1) {
                    cpPattern[i] = 0.1 + Math.random() * 0.1;
                }
            }
        }
        // ── Hat patterns ─────────────────────────────────────────────────────────
        if (hatMode == "offbeats") {
            for (let i = 0; i < 16; i++) {
                if (i % 4 == 2) {
                    ohPattern[i] = 0.4;
                }
                else if (Math.random() < 0.3) {
                    if (Math.random() < 0.5) {
                        chPattern[i] = 0.2 + Math.random() * 0.2;
                    }
                    else {
                        ohPattern[i] = 0.1 + Math.random() * 0.2;
                    }
                }
            }
        }
        else if (hatMode == "closed") {
            for (let i = 0; i < 16; i++) {
                if (i % 2 === 0) {
                    chPattern[i] = 0.4;
                }
                else if (Math.random() < 0.5) {
                    chPattern[i] = 0.2 + Math.random() * 0.3;
                }
            }
        }
        else if (hatMode == "rolling") {
            // D&B rolling hats: every 16th note with velocity variation; occasional OH
            for (let i = 0; i < 16; i++) {
                chPattern[i] = 0.2 + Math.random() * 0.3;
                if (i % 8 === 0)
                    chPattern[i] = 0.5; // accent on beats
                if (i % 4 === 2 && Math.random() < 0.4) {
                    ohPattern[i] = 0.3 + Math.random() * 0.2;
                    chPattern[i] = 0; // silence CH when OH opens
                }
            }
        }
        // ── Sample variant selection (decided at pattern generation time) ────────
        // 0 = synth sample, 1 = 909 acid sample
        // CP is always the synth sample (no 909 clap), but may sometimes not fire (sparse pattern)
        const sampleVariants = [
            Math.random() < 0.5 ? 1 : 0, // BD
            Math.random() < 0.5 ? 1 : 0, // OH
            Math.random() < 0.5 ? 1 : 0, // CH
            Math.random() < 0.5 ? 1 : 0, // SD
            0, // CP — always synth
        ];
        return {
            patterns: [bdPattern, ohPattern, chPattern, sdPattern, cpPattern],
            sampleVariants
        };
    }
    return {
        createPatterns
    };
}
//# sourceMappingURL=pattern.js.map