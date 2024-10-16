const audioContext = new (window.AudioContext || window.webkitAudioContext)();

let composerRendererElement;

addEventListener("load", () => {
    LS.Color.add("custom-default", 0, 0, 0)

    windowManager.target = O("#windowContainer")

    let keyThreads = {};

    M.on("keydown", "keyup", event => {

        let key = event.key.toUpperCase();

        if(Sound.keyboardMapping[key]){
            if(!windowManager.focused || !windowManager.focused.parentAudioComponent) return;

            if(event.type === "keyup"){

                keyThreads[key].stop()
                delete keyThreads[key]

            } else if(!keyThreads[key]) {

                keyThreads[key] = windowManager.focused.parentAudioComponent.play({
                    baseFrequency: Sound.keyboardMapping[key]
                })

            }
        }

    })

    Sound.createComponent("synthetizer")
    Sound.createComponent("realtime_constructor")

})

function getNoteFrequencies() {
    const baseFrequency = 440; // Frequency of A4
    const baseMidiNumber = 49; // MIDI number for A4

    const frequencies = [];
    
    for (let midiNumber = 1; midiNumber <= 127; midiNumber++) {
        // Calculate frequency
        const frequency = baseFrequency * Math.pow(2, (midiNumber - baseMidiNumber) / 12);
        frequencies.push(frequency);
    }

    return frequencies;
}

LS.Knob.presets["main"] = {
    arcFill: false,
    arcRounded: false,
    arcBackground: true
}


let Sound = {
    tracks: [],
    currentTrack: 0,

    get track() {
        return Sound.tracks[Sound.currentTrack]
    },

    set track(value) {
        Sound.tracks = value
    },

    components: {},

    createComponent(id){
        return Sound.components[id].instance()
    },

    notes: getNoteFrequencies(),

    keyboardMapping: {
        'Q': 261.63, // C4
        '2': 277.18, // C#4/Db4
        'W': 293.66, // D4
        '3': 311.13, // D#4/Eb4
        'E': 329.63, // E4
        'R': 349.23, // F4
        '5': 369.99, // F#4/Gb4
        'T': 392.00, // G4
        '6': 415.30, // G#4/Ab4
        'Z': 440.00, // A4
        '7': 466.16, // A#4/Bb4
        'U': 493.88, // B4
        'I': 523.25, // C5
        '9': 554.37, // C#5/Db5
        'O': 587.33, // D5
        '0': 622.25, // D#5/Eb5
        'P': 659.25, // E5
        '[': 698.46, // F5
        '=': 739.99, // F#5/Gb5
        ']': 783.99, // G5
        '\\': 830.61, // G#5/Ab5
        'A': 880.00, // A5
        'S': 932.33, // A#5/Bb5
        'D': 987.77, // B5
        'F': 1046.50, // C6
        'G': 1108.73, // C#6/Db6
        'H': 1174.66, // D6
        'J': 1244.51, // D#6/Eb6
        'K': 1318.51, // E6
        'L': 1396.91, // F6
        ';': 1480.00, // F#6/Gb6
        "'": 1567.98  // G6
    },

    generator: {
        compile(bufferSize, generator, options){
            const audioBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
            const output = audioBuffer.getChannelData(0);

            for(let i = 0; i < bufferSize; i++){
                output[i] = generator(i)
            }

            return {
                audioBuffer,

                output,

                bufferSize,

                createSource(){
                    let source = audioContext.createBufferSource();

                    source.buffer = audioBuffer;
                    source.loop = true;

                    return source
                },

                modulate(modulator){
                    for(let i = 0; i < bufferSize; i++){
                        output[i] = modulator(i, output[i])
                    }
                }
            }
        }
    },

    async registerModule(source, fromString = false){
        let url = fromString? URL.createObjectURL(new Blob([source], {
            type: "text/javascript"
        })): source

        await audioContext.audioWorklet.addModule(url);

        if(fromString) URL.revokeObjectURL(url)
    },

    module(name, options){
        return new AudioWorkletNode(audioContext, name, options)
    },

    noiseGenerator: {
        whiteNoise(bufferSize, output) {
            for (let i = 0; i < bufferSize; i++) {
                output[i] = Math.random() * 2 - 1;
            }
        },

        pinkNoise(bufferSize, output) {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < bufferSize; i++) {
                let white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                output[i] *= 0.11; // (roughly compensates for gain)
                b6 = white * 0.115926;
            }
        },

        brownNoise(bufferSize, output) {
            let lastOut = 0;
            for (let i = 0; i < bufferSize; i++) {
                let white = Math.random() * 2 - 1;
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 3.5; // (roughly compensates for gain)
            }
        }
    },

    Component: class AudioComponent {
        constructor(id, element, options){
            O(element).getAll("script").all().remove()

            Sound.components[id] = this;

            this.instances = [];

            this.element = element;

            element.remove()
            element.class("sound-component-content")

            this.options = options;
        }

        instance(options){
            let component = this;

            return new (class AudioComponentInstance {
                constructor(element){
                    this.element = O(element);
                    component.instances.push(this);

                    let gainKnob = LS.Knob(N("ls-knob", {
                        tooltip: "Gain"
                    }), "main", {value: 100})

                    this.data = {}

                    this.uniqueID = M.uid();

                    this.destination = audioContext.destination;

                    let _thisInstance = this;

                    let _window = windowManager.createWindow({
    
                        title: [
                            gainKnob.element,
                            N("span", {innerText: component.options.title || component.options.name || ""}),

                            LS.Select.fromNative(N("select", {
                                inner: [
                                    N("option", {value: "Default", inner: "Default"}),
        
                                    component.options.presets? Object.entries(component.options.presets).map(entry => {
                                        return N("option", {
                                            value: entry[0],
                                            innerText: entry[0]
                                        })
                                    }): null
                                ],
        
                                onchange(value){
                                    if(_thisInstance.loadPreset) {
                                        _thisInstance.loadPreset(value === "Default"? component.options.presets[value] || null : component.options.presets[value]);
                                    }
                                },
        
                                tooltip: "Presets"
                            })).element
                        ],

                        buttonClass: "elevated",

                        handleInteractableSelector: "select, ls-select",

                        minimizeable: false,

                        tags: ["sound-component"],
            
                        width: 960,
                        height: 540,

                        onResize(direction, properties){
                            if(_thisInstance.onResize) _thisInstance.onResize(direction, properties)
                        },

                        ...component.options.window? component.options.window: {}
            
                    }, this.element)

                    _window.addToWorkspace()

                    _thisInstance.window = _window;
                    _window.parentAudioComponent = _thisInstance;

                    if(component.onInstance) component.onInstance(this);
                }

                destroy(){
                    this.destroyed = true;
                    this.element.remove()
                }

                play(options = {}){
                    let stopCallbacks = [];

                    this._continuousGenerator(options, fn => {
                        stopCallbacks.push(fn)
                    })

                    return {
                        stop(){
                            for(let fn of stopCallbacks) fn()
                        }
                    }
                }
            })(component.element.cloneNode(true))
        }
    }
}


if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess()
        .then(onMIDISuccess, onMIDIFailure);
} else {
    // outputDiv.textContent = "Web MIDI API is not supported in this browser.";
}

function onMIDISuccess(midiAccess) {
    console.log(midiAccess);
    const inputs = midiAccess.inputs.values();

    for (let input of inputs) {
        input.onmidimessage = handleMIDIMessage;
    }
}

function onMIDIFailure() {
    // outputDiv.textContent = "Failed to access MIDI devices.";
}


let keyThreads = {};

function handleMIDIMessage(message) {
    const [command, note, velocity] = message.data;

    // console.log(message);

    // if(command == 176) {
    //     if(trackToMap){
    //         trackToMap.vSlider.element.class("mapping", 0)
    //         trackToMap.midiMapper = note
    //         trackToMap.vSlider.value = velocity
            
    //         trackToMap = null
    //         return
    //     }

    //     let track = tracks.find(track => track.midiMapper == note || track.midiMapper + 10 == note);

    //     if(track) {
    //         if(note > 49){
    //             track.thread.play()
    //         } else {
    //             track.vSlider.value = velocity
    //         }
    //     }
    // } else if (command == 224){
    //     for(let thread of threads){
    //         thread.speed = velocity / 64
    //     }
    // }


    // outputDiv.textContent = `
    //     Command: ${command}
    //     Note: ${note}
    //     Velocity: ${velocity}
    // `;

    if(!windowManager.focused || !windowManager.focused.parentAudioComponent) return;

    if(command === 128){

        keyThreads[note].stop()
        delete keyThreads[note]

    } else if(command === 144 && !keyThreads[note]) {

        keyThreads[note] = windowManager.focused.parentAudioComponent.play({
            baseFrequency: Sound.notes[note]
        })

    }
}