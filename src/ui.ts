/*
  Copyright 2021 David Whiting
  This work is licensed under a Creative Commons Attribution 4.0 International License
  https://creativecommons.org/licenses/by/4.0/
*/

import {
    DelayUnit,
    DrumPattern,
    GeneralisedParameter, ClockUnit, NineOhMachine, NoteGenerator,
    NumericParameter,
    PatternParameter, ProgramState,
    ThreeOhMachine, Trigger, AutoPilotUnit
} from "./interface.js";
// ClockUnit is used by ClockControls
import {textNoteToNumber} from "./audio.js";
import {MidiT} from "./midi.js";
import {Dial, RangeSelect} from "./dial.js";
import {midiControlPresets, midiDrumPresets, DELAY_MULTIPLIERS} from "./app.js";

const defaultColors = {
    bg: "#140c2d",
    note: "#00ffe6",
    accent: "#ff0080",
    glide: "#CCAA88",
    text: "#e0e0ff",
    highlight: "rgba(255,255,255,0.2)",
    grid1: "rgba(255,255,255,0.1)",
    grid2: "rgba(255,255,255,0.3)",
    dial: "#ff0080"
}
type ColorScheme = { [color in keyof typeof defaultColors]: string; };


function DialSet(parameters: {[key: string]: NumericParameter} | NumericParameter[], 
                 ...classes: string[]) {
    const params = Array.isArray(parameters) ? parameters : Object.keys(parameters).map(k => parameters[k]);

    const container = document.createElement("div");
    container.classList.add("params", ...classes);

    params.forEach(param => {
        //const param = parameters[p];
        const dial = Dial(param.value, param.bounds, param.name, defaultColors.dial, defaultColors.text);

        // Change the parameter if we move the dial
        dial.bind(v => { param.value = v });

        // Move the dial if the parameter changes elsewhere
        param.subscribe(v => dial.value = v);

        container.append(dial.element);
    })

    return container;
}

function MidiControls(midiDevice: NumericParameter, deviceNames: string[], midiChannel: NumericParameter,
                      midiPreset: NumericParameter, presetNames: string[],
                      parameters: {[key: string]: NumericParameter} | NumericParameter[], 
					  ...classes: string[]) {
    const params = Array.isArray(parameters) ? parameters : Object.keys(parameters).map(k => parameters[k]);

	// base container
    const container = document.createElement("div");
    container.classList.add("midi-controls", "params", ...classes);


	// container for MIDI device/channel
	var paramGroup = document.createElement("div");
	paramGroup.classList.add("param-group", ...classes);
	container.append(paramGroup);

	{
		const paramBox = document.createElement("div");
		paramBox.classList.add("param-box");
		paramGroup.append(paramBox);

		const deviceLabel = document.createElement("span");
		deviceLabel.classList.add("param-name");
		deviceLabel.append(document.createTextNode("MIDI Device:"));
		paramBox.append(deviceLabel);

		const devices = optionList(midiDevice, deviceNames);
		paramBox.append(devices);
	}

	{
		const paramBox = document.createElement("div");
		paramBox.classList.add("param-box");
		paramGroup.append(paramBox);

		const channelLabel = document.createElement("span");
		channelLabel.classList.add("param-name");
		channelLabel.append(document.createTextNode("MIDI Channel:"));
		paramBox.append(channelLabel);

		var channelNames: string[] = [];
		for (let ch = 0; ch < 16; ch++)
			channelNames.push(ch.toString());

		const channels = optionList(midiChannel, channelNames);
		paramBox.append(channels);
	}

	paramGroup = document.createElement("div");
	paramGroup.classList.add("param-group", ...classes);
	container.append(paramGroup);

	{
		const paramBox = document.createElement("div");
		paramBox.classList.add("param-box");
		paramGroup.append(paramBox);

		const presetLabel = document.createElement("span");
		presetLabel.classList.add("param-name");
		presetLabel.append(document.createTextNode("Control Preset:"));
		paramBox.append(presetLabel);

		const presets = optionList(midiPreset, presetNames);
		paramBox.append(presets);
	}


	const paramValues = Array.from(params.values());
    for (var i = 0; i < paramValues.length; i++) {
		
		const param = paramValues[i];
		
		// group pairs of parameters
		if (i % 2 == 0) {
			paramGroup = document.createElement("div");
			paramGroup.classList.add("param-group", ...classes);
			container.append(paramGroup);
		}

        const paramBox = document.createElement("div");
        paramBox.classList.add("param-box");
        paramGroup.append(paramBox);

        const label = document.createElement("span");
        label.classList.add("param-name");
        label.append(document.createTextNode(param.name + ":"));
        paramBox.append(label);

        const dial = RangeSelect(param.value, param.bounds, param.name);
        paramBox.append(dial.element);
		
        // Change the parameter if we move the dial
        dial.bind(v => { param.value = v });

        // Move the dial if the parameter changes elsewhere
        param.subscribe(v => dial.value = v);
    }
	
    return container;
}

function triggerButton(target: Trigger) {
    const but = document.createElement("button");
    but.classList.add("trigger-button");
    but.title = "Trigger";
    but.innerText = "⟳";

    target.subscribe(v => {
        if (v) but.classList.add("waiting"); else but.classList.remove("waiting");
    });
    but.addEventListener("click", function () {
        target.value = true;
    })

    return but;
}

function restoreButton(target: Trigger) {
    const but = document.createElement("button");
    but.classList.add("trigger-button");
    but.title = "Restore";
    but.innerText = "⤾";

    target.subscribe(v => {
        if (v) but.classList.add("waiting"); else but.classList.remove("waiting");
    });
    but.addEventListener("click", function () {
        target.value = true;
    })

    return but;
}

function toggleButton(param: GeneralisedParameter<boolean>, ...classes: string[]) {
    const but = document.createElement("button");
    but.classList.add(...classes);
    but.title = "Toggle";
    but.innerText = param.name;

    but.addEventListener("click", () => param.value = !param.value);
    param.subscribe(v => {
        if (v) {
            but.classList.add("on");
            but.classList.remove("off");
        } else {
            but.classList.add("off");
            but.classList.remove("on");
        }
    })

    return but;
}

function optionList(param: NumericParameter, options: string[]) {
    const sel = document.createElement("select");
    sel.classList.add("option-list");

    sel.addEventListener("click", () => param.value = sel.selectedIndex);

    for (let name of options) {
        var opt = document.createElement("option");
        opt.text = name;
        //opt.value = id;
        sel.add(opt);
    }

    return sel;
}

function label(text: string) {
    const element = document.createElement("div");
    element.classList.add("label");
    element.innerText = text;
    return element;
}

function machine(...contents: HTMLElement[]) {
    const element = document.createElement("div");
    element.classList.add("machine");
    element.append(...contents);
    return element
}

function controlGroup(label: HTMLElement, content: HTMLElement, ...classes: string[]) {
    const element = document.createElement("div");
    element.classList.add("control-group", ...classes);
    element.append(label, content);
    return element
}

function controls(...contents: HTMLElement[]) {
    const element = document.createElement("div");
    element.classList.add("controls");
    element.append(...contents);
    return element
}

function group(...contents: HTMLElement[]) {
    const element = document.createElement("div");
    element.classList.add("group");
    element.append(...contents);
    return element;
}

function buttonGroup(...contents: HTMLElement[]) {
    const element = document.createElement("div");
    element.classList.add("button-group");
    element.append(...contents);
    return element;
}

function PatternDisplay(patternParam: PatternParameter, stepParam: NumericParameter,  colors: ColorScheme = defaultColors) {
    const canvas = document.createElement("canvas");
    canvas.classList.add("pattern");
    function repaint() {
        const pattern = patternParam.value;
        const w = canvas.width = canvas.clientWidth;
        const h = canvas.height = 200;
        // Show from C0 (midi 12) to C7 (midi 96) — 84 semitones
        const noteMin = 12;  // C0
        const noteRange = 84;
        const vScale = h / noteRange;
        const g = canvas.getContext("2d") as CanvasRenderingContext2D;

        g.font = "10px Orbitron";

        g.fillStyle = colors.bg;
        g.fillRect(0, 0, w, h);

        for (let i = 0; i < pattern.length; i++) {
            g.strokeStyle = i % 4 == 0 ? colors.grid2 : colors.grid1;
            const x = w * i / pattern.length;
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, h);
            g.stroke();
        }

        for (let i = 0; i < noteRange; i++) {
            g.strokeStyle = i % 12 == 0 ? colors.grid2 : colors.grid1;
            const y = h - (i * vScale);
            g.beginPath();
            g.moveTo(0, y);
            g.lineTo(w, y);
            g.stroke();
        }

        for (let i = 0; i < pattern.length; i++) {
            const s = pattern[i];
            if (s.note === "-") {
            } else {
                const n = textNoteToNumber(s.note) - noteMin;
                const x = w * i / pattern.length;
                const y = h - (n * vScale);
                const bw = w / pattern.length;
                const bh = 5;

                g.fillStyle = s.glide ? colors.glide : (s.accent ? colors.accent : colors.note);
                g.fillRect(x, y, bw, bh);

                g.fillStyle = colors.text;
                const xt = (x + bw / 2) - g.measureText(s.note).width / 2;
                g.fillText(s.note, xt, y);
            }
        }

        g.fillStyle = colors.highlight;
        g.fillRect(w * stepParam.value / pattern.length, 0, w / pattern.length, h);
    }

    patternParam.subscribe(repaint);
    stepParam.subscribe(repaint);

    return canvas;
}

function DrumDisplay(pattern: GeneralisedParameter<DrumPattern>, mutes: GeneralisedParameter<boolean>[], stepParam: NumericParameter, colors: ColorScheme = defaultColors) {
    const canvas = document.createElement("canvas");
    canvas.classList.add("pattern");

    function repaint() {
        const w = canvas.width = canvas.clientWidth;
        const h = canvas.height = 100;
        const g = canvas.getContext("2d") as CanvasRenderingContext2D;
        g.fillStyle = colors.bg;
        g.fillRect(0, 0, w, h);

        for (let i = 0; i < 16; i+=4) {
            g.strokeStyle = i % 4 == 0 ? colors.grid2 : colors.grid1;
            const x = w * i / 16;
            g.beginPath();
            g.moveTo(x, 0);
            g.lineTo(x, h);
            g.stroke();
        }

        for (let i = 0; i < 16; i++) {
            const x = w * i / 16;
            for (let p = 0; p < pattern.value.length; p++) {
                const y = (p / pattern.value.length) * h;
                if (pattern.value[p][i]) {
                    if (mutes[p].value) {
                        g.fillStyle = "rgba(128,0,0,0.4)";
                    } else {
                        g.fillStyle = "rgba(136,170,204," + pattern.value[p][i] + ")";
                    }
                    g.fillRect(x, y, w / 16, h / pattern.value.length);
                }
            }
        }

        g.fillStyle = colors.highlight;
        g.fillRect(w * stepParam.value / 16, 0, w / 16, h);
    }

    pattern.subscribe(repaint);
    stepParam.subscribe(repaint);

    return canvas;
}



function NoteGen(noteGenerator: NoteGenerator) {
    const currentNotes = document.createElement("div");
    currentNotes.classList.add("parameter-controlled", "notegen-note-display");
    noteGenerator.noteSet.subscribe(notes => {
        currentNotes.innerText = notes.join(", ");
    })

    return controlGroup(
        label("Notegen"),
        group(
            triggerButton(noteGenerator.newNotes),
            currentNotes
        ),
        "notegen-box"
    )
}

function Mutes(params: GeneralisedParameter<boolean>[]) {
    const container = document.createElement("div");
    container.classList.add("mutes");

    container.append(...params.map(p => toggleButton(p)));
    return container;
}

function OctaveControls(n: ThreeOhMachine) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("octave-controls");

    function octaveField(param: NumericParameter, labelText: string) {
        const field = document.createElement("div");
        field.classList.add("bpm-range-field");

        const lbl = document.createElement("span");
        lbl.classList.add("bpm-range-label");
        lbl.innerText = labelText;

        const input = document.createElement("input");
        input.type = "number";
        input.min = String(param.bounds[0]);
        input.max = String(param.bounds[1]);
        input.value = String(param.value);
        input.classList.add("bpm-range-input");

        input.addEventListener("change", () => {
            const parsed = parseInt(input.value);
            const v = Math.max(param.bounds[0], Math.min(param.bounds[1], isNaN(parsed) ? param.value : parsed));
            param.value = v;
            input.value = String(v);
        });
        param.subscribe(v => { input.value = String(v); });

        field.append(lbl, input);
        return field;
    }

    const lbl = document.createElement("span");
    lbl.classList.add("octave-label");
    lbl.innerText = "Oct";

    wrapper.append(lbl, octaveField(n.octaveMin, "Min"), octaveField(n.octaveMax, "Max"));
    return wrapper;
}

function DialSetWithOctaves(n: ThreeOhMachine) {
    const wrapper = document.createElement("div");
    wrapper.classList.add("dial-octave-stack");
    wrapper.append(DialSet(n.parameters), OctaveControls(n));
    return wrapper;
}

function ClockControls(clock: ClockUnit) {
    const container = document.createElement("div");
    container.classList.add("clock-controls");

    // BPM dial + numeric readout
    const dialContainer = document.createElement("div");
    dialContainer.classList.add("clock-bpm-dial");
    const dial = Dial(clock.bpm.value, clock.bpm.bounds, clock.bpm.name, defaultColors.dial, defaultColors.text);
    dial.bind(v => { clock.bpm.value = v; });
    clock.bpm.subscribe(v => dial.value = v);

    const bpmReadout = document.createElement("div");
    bpmReadout.classList.add("bpm-readout");
    clock.bpm.subscribe(v => { bpmReadout.innerText = Math.round(v) + " BPM"; });

    dialContainer.append(dial.element, bpmReadout);
    container.append(dialContainer);

    // Randomize button (triggers a 2-bar smooth jump)
    const rndBtn = document.createElement("button");
    rndBtn.classList.add("trigger-button", "bpm-randomize-button");
    rndBtn.title = "Randomize BPM (smooth 2-bar jump)";
    rndBtn.innerText = "⟳";
    clock.randomizeBpm.subscribe(v => {
        if (v) rndBtn.classList.add("waiting"); else rndBtn.classList.remove("waiting");
    });
    rndBtn.addEventListener("click", () => { clock.randomizeBpm.value = true; });
    container.append(rndBtn);

    // Min / Max + mode selector
    const rangeContainer = document.createElement("div");
    rangeContainer.classList.add("bpm-range");

    function bpmRangeField(param: NumericParameter, labelText: string) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("bpm-range-field");

        const lbl = document.createElement("span");
        lbl.classList.add("bpm-range-label");
        lbl.innerText = labelText;

        const input = document.createElement("input");
        input.type = "number";
        input.min = String(param.bounds[0]);
        input.max = String(param.bounds[1]);
        input.value = String(param.value);
        input.classList.add("bpm-range-input");

        input.addEventListener("change", () => {
            const parsed = parseInt(input.value);
            const v = Math.max(param.bounds[0], Math.min(param.bounds[1], isNaN(parsed) ? param.value : parsed));
            param.value = v;
            input.value = String(v);
        });
        param.subscribe(v => { input.value = String(v); });

        wrapper.append(lbl, input);
        return wrapper;
    }

    rangeContainer.append(
        bpmRangeField(clock.bpmMin, "Min"),
        bpmRangeField(clock.bpmMax, "Max"),
    );

    // Auto mode selector: Off / Wander / Jump
    const modeWrapper = document.createElement("div");
    modeWrapper.classList.add("bpm-range-field");

    const modeLbl = document.createElement("span");
    modeLbl.classList.add("bpm-range-label");
    modeLbl.innerText = "Auto";

    const modeSelect = document.createElement("select");
    modeSelect.classList.add("bpm-mode-select");
    ["Off", "Jump"].forEach((name, i) => {
        const opt = document.createElement("option");
        opt.text = name;
        opt.value = String(i);
        modeSelect.add(opt);
    });
    modeSelect.selectedIndex = clock.bpmTwiddleMode.value;
    modeSelect.addEventListener("change", () => {
        clock.bpmTwiddleMode.value = modeSelect.selectedIndex;
    });
    clock.bpmTwiddleMode.subscribe(v => { modeSelect.selectedIndex = v; });

    modeWrapper.append(modeLbl, modeSelect);
    rangeContainer.append(modeWrapper);

    container.append(rangeContainer);

    const cg = controlGroup(label("Clock"), container);
    cg.classList.add("clock-group");
    return cg;
}

function DelayControls(delayUnit: DelayUnit) {
    const container = document.createElement("div");
    container.classList.add("delay-controls");

    const dials = DialSet([delayUnit.dryWet, delayUnit.feedback]);
    dials.classList.add("horizontal");
    container.append(dials);

    // Timing dropdown — lists musical delay multiples
    const timingWrapper = document.createElement("div");
    timingWrapper.classList.add("delay-timing-wrapper");

    const timingLabel = document.createElement("span");
    timingLabel.classList.add("delay-timing-label");
    timingLabel.innerText = "Timing";

    const timingSelect = document.createElement("select");
    timingSelect.classList.add("delay-timing-select");
    DELAY_MULTIPLIERS.forEach((m, i) => {
        const opt = document.createElement("option");
        opt.text = m.label;
        opt.value = String(i);
        timingSelect.add(opt);
    });
    timingSelect.selectedIndex = Math.round(delayUnit.delayMultiplierIndex.value);
    timingSelect.addEventListener("change", () => {
        delayUnit.delayMultiplierIndex.value = timingSelect.selectedIndex;
    });
    delayUnit.delayMultiplierIndex.subscribe(v => { timingSelect.selectedIndex = Math.round(v); });

    timingWrapper.append(timingLabel, timingSelect);
    container.append(timingWrapper);

    return controlGroup(
        label("Delay"),
        container,
    )
}

function AutopilotControls(autoPilot: AutoPilotUnit) {
    return controlGroup(
        label("Autopilot"),
        group(
            ...autoPilot.switches.map(p => toggleButton(p, "autopilot-button"))
        )
    )
}

function RandomisationControls(autoPilot: AutoPilotUnit) {
    const r = autoPilot.randomisation;

    function rndField(param: NumericParameter, isFloat = false) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("rnd-field");

        const lbl = document.createElement("span");
        lbl.classList.add("rnd-label");
        lbl.innerText = param.name;

        const input = document.createElement("input");
        input.type = "number";
        input.min = String(param.bounds[0]);
        input.max = String(param.bounds[1]);
        input.step = isFloat ? "0.1" : "1";
        input.value = String(isFloat ? param.value : Math.round(param.value));
        input.classList.add("rnd-input");

        input.addEventListener("change", () => {
            const parsed = isFloat ? parseFloat(input.value) : parseInt(input.value);
            const v = Math.max(param.bounds[0], Math.min(param.bounds[1], isNaN(parsed) ? param.value : parsed));
            param.value = v;
            input.value = String(isFloat ? v : Math.round(v));
        });
        param.subscribe(v => { input.value = String(isFloat ? v : Math.round(v)); });

        wrapper.append(lbl, input);
        return wrapper;
    }

    function rndSection(title: string, ...fields: HTMLElement[]) {
        const section = document.createElement("div");
        section.classList.add("rnd-section");

        const heading = document.createElement("div");
        heading.classList.add("rnd-section-heading");
        heading.innerText = title;

        const body = document.createElement("div");
        body.classList.add("rnd-section-body");
        body.append(...fields);

        section.append(heading, body);
        return section;
    }

    const container = document.createElement("div");
    container.classList.add("rnd-panel");

    const heading = document.createElement("div");
    heading.classList.add("rnd-panel-heading");
    heading.innerText = "Randomisation";

    const sections = document.createElement("div");
    sections.classList.add("rnd-sections");

    sections.append(
        rndSection("Notes",
            rndField(r.noteChangeMeasures),
            rndField(r.noteChangeChance),
            rndField(r.newNotesChangeMeasures),
            rndField(r.newNotesChangeChance),
        ),
        rndSection("Drums",
            rndField(r.drumChangeMeasures),
            rndField(r.drumChangeChance),
        ),
        rndSection("Drum Mutes",
            rndField(r.muteMeasures),
            rndField(r.muteBDChance),
            rndField(r.muteOHChance),
            rndField(r.muteCHChance),
            rndField(r.muteSDChance),
            rndField(r.muteCPChance),
        ),
        rndSection("BPM",
            rndField(r.bpmJumpMeasures),
            rndField(r.bpmJumpChance),
        ),
        rndSection("Delay",
            rndField(r.delayChangeMeasures),
            rndField(r.delayChangeChance),
        ),
    );

    container.append(heading, sections);
    return container;
}

function AudioMeter(analyser: AnalyserNode) {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    let w = canvas.width = 200;
    const h = canvas.height = 50;
    const g = canvas.getContext("2d") as CanvasRenderingContext2D;

    const fftOutput = new Uint8Array(analyser.fftSize);
    const freqOutput = new Uint8Array(analyser.frequencyBinCount / 2);

    function draw() {
        //w = canvas.width = canvas.clientWidth;
        analyser.getByteTimeDomainData(fftOutput);
        analyser.getByteFrequencyData(freqOutput);

        g.clearRect(0,0,w,h);

        g.fillStyle = "white";
        for (let i =0 ; i < freqOutput.length; i++) {
            const v = freqOutput[i] / 256;
            g.fillStyle = '#ff0080';
            g.fillRect(w * i/freqOutput.length, h - 1.0 * v * h, w/freqOutput.length, 1.0 * v * h);
        }

        g.strokeStyle = "white";
        g.beginPath();
        g.moveTo(0,h/2);
        for (let i =0 ; i < fftOutput.length; i++) {
            const v = (fftOutput[i] / 128) - 1;
            g.lineTo(w * i/fftOutput.length, h/2 + (1.5 * v * h/2));
        }
        g.stroke();

        window.requestAnimationFrame(draw);
    }
    window.requestAnimationFrame(draw);

    return canvas;
}


export function UI(state: ProgramState, autoPilot: AutoPilotUnit, analyser: AnalyserNode, midi: MidiT) {
    const ui = document.createElement("div");
    ui.id = "ui";

    const otherControls = controls(
        AutopilotControls(autoPilot),
        NoteGen(state.gen),
        DelayControls(state.delay),
        ClockControls(state.clock),
        controlGroup(label("Volume"), DialSet([state.masterVolume], "horizontal")),
        controlGroup(label("Meter"), group(AudioMeter(analyser)), "meter")
    )

    const machineContainer = document.createElement("div");
    machineContainer.classList.add("machines");

    const emptyElement = document.createElement("div");
    const deviceNames = midi ? midi.getOutputNames() : [];
    const notePresetNames = [...midiControlPresets.keys()];
    const drumPresetNames = [...midiDrumPresets.keys()];

    const noteMachines = state.notes.map((n, i) => machine(
        label("303-0" + (i+1)),
        group(
            buttonGroup(
                triggerButton(n.newPattern),
                restoreButton(n.restorePattern),
            ),
            PatternDisplay(n.pattern, state.clock.currentStep),
            DialSetWithOctaves(n),
            midi ? MidiControls(n.midiDevice, deviceNames, n.midiChannel, n.midiPreset, notePresetNames, n.midiControls, "horizontal") : emptyElement,
        ),
    ));

    const drumMachine = machine(
        label("909-XX"),
        group(
            buttonGroup(
                triggerButton(state.drums.newPattern),
                restoreButton(state.drums.restorePattern),
            ),
            DrumDisplay(state.drums.pattern, state.drums.mutes, state.clock.currentStep),
            Mutes(state.drums.mutes),
            midi ? MidiControls(state.drums.midiDevice, deviceNames, state.drums.midiChannel, state.drums.midiPreset, drumPresetNames, state.drums.midiControls, "horizontal") : emptyElement,
        )
    )

    machineContainer.append(...noteMachines, drumMachine)
    ui.append(machineContainer, otherControls, RandomisationControls(autoPilot));

    return ui;
}
