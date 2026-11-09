// Music: an epic, Celtic-flavoured orchestra synthesized live with Web Audio (original themes),
// scheduled a little ahead on a step grid.
//   menu:   "The Apex Theme", 80 BPM 4/4 in D (Mixolydian): tin whistle over strings and a drone,
//           horns join, then the choir
//   race:   a galloping 12/8 jig in E minor: fiddle figures under heroic horn calls, taiko and bodhrán
//   sprint: 132 BPM 4/4 in A minor: driving spiccato strings, a brass anthem, taiko and snare
// Each song is an 8-bar cycle arranged over 32 bars: opening, build, full (choir and doubled
// melody, a cymbal crash), and a breath that ends in a snare roll and cymbal swell. Everything goes
// through a large hall reverb, and a low-pass muffles it on pause.

export type SongName = 'menu' | 'race' | 'sprint';

/** A melody note: bar in the cycle, step in the bar, MIDI pitch, length in steps. */
type Note = [bar: number, step: number, midi: number, len: number];

interface Song {
  bpm: number;              // beats per minute (quarter notes, or dotted quarters in 12/8)
  steps: number;            // steps per bar: 16 (16ths in 4/4) or 12 (eighths in 12/8)
  stepsPerBeat: number;     // 4 or 3
  /** One chord per bar of the 8-bar cycle: voicing (MIDI) and bass root (MIDI). */
  chords: { notes: number[]; bass: number }[];
  melody: Note[];
  /** Repeating figure under the melody: [step, chord-tone index (beyond the chord climbs an octave)]. */
  ostinato: [number, number][];
  ostinatoOctave: number;   // semitones added to the ostinato
  ostinatoFrom: number;     // the section the ostinato starts in (0..3)
  drone: boolean;
  /** Drum steps in the bar. */
  taiko: number[];
  taikoSmall: number[];
  frame: number[];
  snare: number[];
  /** Which sections the whistle and the horns carry the melody in, and the horns' octave. */
  whistleIn: number[];
  hornsIn: number[];
  hornOctave: number;
  level: number;            // overall level of this song
}

const SONGS: Record<SongName, Song> = {
  menu: {
    bpm: 80, steps: 16, stepsPerBeat: 4,
    chords: [
      { notes: [50, 57, 62, 66], bass: 38 },   // D
      { notes: [48, 55, 60, 64], bass: 36 },   // C
      { notes: [47, 55, 59, 62], bass: 43 },   // G/B
      { notes: [50, 57, 62, 66], bass: 38 },   // D
      { notes: [47, 54, 59, 62], bass: 35 },   // Bm
      { notes: [47, 55, 59, 62], bass: 43 },   // G
      { notes: [45, 52, 57, 61], bass: 45 },   // A
      { notes: [45, 50, 57, 62], bass: 45 },   // Asus4
    ],
    melody: [
      [0, 0, 74, 6], [0, 6, 76, 2], [0, 8, 78, 4], [0, 12, 81, 4],
      [1, 0, 79, 8], [1, 8, 76, 4], [1, 12, 72, 4],
      [2, 0, 74, 6], [2, 6, 71, 2], [2, 8, 74, 4], [2, 12, 79, 4],
      [3, 0, 78, 12], [3, 12, 76, 2], [3, 14, 74, 2],
      [4, 0, 74, 4], [4, 4, 78, 4], [4, 8, 83, 8],
      [5, 0, 81, 4], [5, 4, 79, 4], [5, 8, 78, 4], [5, 12, 76, 4],
      [6, 0, 78, 6], [6, 6, 76, 2], [6, 8, 73, 8],
      [7, 0, 76, 12],
    ],
    ostinato: [[0, 0], [2, 1], [4, 2], [6, 3], [8, 4], [10, 3], [12, 2], [14, 1]],
    ostinatoOctave: 12, ostinatoFrom: 1,
    drone: true,
    taiko: [0], taikoSmall: [10], frame: [8], snare: [],
    whistleIn: [0, 2, 3], hornsIn: [1, 2], hornOctave: -12,
    level: 0.95,
  },
  race: {
    bpm: 76, steps: 12, stepsPerBeat: 3,
    chords: [
      { notes: [52, 59, 64, 67], bass: 40 },   // Em
      { notes: [52, 59, 64, 67], bass: 40 },   // Em
      { notes: [48, 55, 60, 64], bass: 36 },   // C
      { notes: [50, 57, 62, 66], bass: 38 },   // D
      { notes: [52, 59, 64, 67], bass: 40 },   // Em
      { notes: [50, 55, 59, 62], bass: 43 },   // G
      { notes: [50, 57, 62, 66], bass: 38 },   // D
      { notes: [51, 54, 59, 63], bass: 35 },   // B
    ],
    melody: [
      [0, 0, 64, 6], [0, 6, 67, 6],
      [1, 0, 71, 9], [1, 9, 69, 3],
      [2, 0, 67, 6], [2, 6, 64, 3], [2, 9, 67, 3],
      [3, 0, 69, 12],
      [4, 0, 71, 6], [4, 6, 74, 6],
      [5, 0, 76, 6], [5, 6, 74, 3], [5, 9, 71, 3],
      [6, 0, 74, 6], [6, 6, 69, 6],
      [7, 0, 71, 6], [7, 6, 75, 6],
    ],
    // A jig figure: three eighths per beat, rising and turning.
    ostinato: [[0, 0], [1, 2], [2, 1], [3, 3], [4, 2], [5, 1], [6, 0], [7, 2], [8, 1], [9, 3], [10, 2], [11, 4]],
    ostinatoOctave: 12, ostinatoFrom: 0,
    drone: true,
    taiko: [0, 6], taikoSmall: [9, 10], frame: [0, 3, 6, 9], snare: [],
    whistleIn: [2, 3], hornsIn: [0, 1, 2], hornOctave: 0,
    level: 1,
  },
  sprint: {
    bpm: 132, steps: 16, stepsPerBeat: 4,
    chords: [
      { notes: [45, 52, 57, 60], bass: 45 },   // Am
      { notes: [41, 53, 57, 60], bass: 41 },   // F
      { notes: [48, 55, 60, 64], bass: 36 },   // C
      { notes: [43, 55, 59, 62], bass: 43 },   // G
      { notes: [50, 53, 57, 62], bass: 38 },   // Dm
      { notes: [41, 53, 57, 60], bass: 41 },   // F
      { notes: [43, 55, 59, 62], bass: 43 },   // G
      { notes: [40, 52, 56, 59], bass: 40 },   // E
    ],
    melody: [
      [0, 0, 69, 4], [0, 4, 72, 4], [0, 8, 76, 8],
      [1, 0, 77, 6], [1, 6, 76, 2], [1, 8, 72, 8],
      [2, 0, 74, 4], [2, 4, 76, 4], [2, 8, 79, 8],
      [3, 0, 79, 6], [3, 6, 77, 2], [3, 8, 74, 8],
      [4, 0, 74, 4], [4, 4, 77, 4], [4, 8, 81, 8],
      [5, 0, 81, 4], [5, 4, 79, 4], [5, 8, 77, 4], [5, 12, 76, 4],
      [6, 0, 74, 8], [6, 8, 79, 8],
      [7, 0, 80, 8], [7, 8, 76, 8],
    ],
    // Spiccato 16ths: root, fifth, octave, fifth.
    ostinato: Array.from({ length: 16 }, (_, k) => [k, [0, 1, 2, 1][k % 4]] as [number, number]),
    ostinatoOctave: 0, ostinatoFrom: 0,
    drone: false,
    taiko: [0, 8], taikoSmall: [6, 14], frame: [], snare: [4, 12],
    whistleIn: [2, 3], hornsIn: [0, 1, 2], hornOctave: -12,
    level: 0.9,
  },
};

const LOOKAHEAD = 0.15;    // s of audio scheduled ahead of the clock
const TICK_MS = 25;
const MUSIC_LEVEL = 0.34;  // music under the sound effects
const CYCLE = 8;           // bars in a song's cycle

const midiHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  private out: GainNode;         // fades between songs
  private muffle: BiquadFilterNode;
  private bus: GainNode;         // the orchestra, before the hall
  private hall: ConvolverNode;
  private noise: AudioBuffer;
  private song: SongName | null = null;
  private step = 0;              // steps since the song started
  private nextTime = 0;
  private timer: number | null = null;

  constructor(private ctx: AudioContext, destination: AudioNode, noise: AudioBuffer) {
    this.noise = noise;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.out.connect(this.muffle).connect(destination);

    this.bus = ctx.createGain();
    this.bus.connect(this.out);

    // A large hall: a 3.6 s decaying stereo noise burst, darker as it fades.
    this.hall = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 3.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * (0.6 - 0.45 * (i / len));
        d[i] = lp * Math.pow(1 - i / len, 2.4);
      }
    }
    this.hall.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.bus.connect(this.hall);
    this.hall.connect(wet).connect(this.out);
  }

  /** Switch songs (or stop with null), crossfading through a short dip. */
  play(name: SongName | null): void {
    if (name === this.song) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.3);
    const start = () => {
      this.song = name;
      if (this.timer !== null) { clearInterval(this.timer); this.timer = null; }
      if (!name) return;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.05;
      const now = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(now);
      this.out.gain.setValueAtTime(0, now);
      this.out.gain.linearRampToValueAtTime(MUSIC_LEVEL * SONGS[name].level, now + 2.5);
      this.timer = window.setInterval(() => this.schedule(), TICK_MS);
    };
    if (this.song) window.setTimeout(start, 800); else start();
  }

  /** Pause menu: muffle the music as if heard through a door. */
  setMuffled(on: boolean): void {
    this.muffle.frequency.setTargetAtTime(on ? 550 : 20000, this.ctx.currentTime, 0.15);
  }

  private schedule(): void {
    if (!this.song) return;
    const s = SONGS[this.song];
    const stepLen = 60 / s.bpm / s.stepsPerBeat;
    // After a long stall (a hidden tab), skip ahead rather than playing a burst of old notes.
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(s, this.step, this.nextTime, stepLen);
      this.step++;
      this.nextTime += stepLen;
    }
  }

  private playStep(s: Song, step: number, t: number, stepLen: number): void {
    const inBar = step % s.steps;
    const barAll = Math.floor(step / s.steps);
    const bar = barAll % CYCLE;
    const section = Math.floor(barAll / CYCLE) % 4;   // 0 opening, 1 build, 2 full, 3 breath
    const chord = s.chords[bar];
    const barLen = stepLen * s.steps;
    const first = barAll === 0;

    // Strings hold the harmony; the drone sits under it.
    if (inBar === 0) {
      this.strings(t, chord.notes, barLen, section === 3 ? 0.035 : 0.05);
      this.strings(t, [chord.bass, chord.bass + 12], barLen, 0.04);
      if (s.drone) this.drone(t, s.chords[0].bass, barLen, section === 2 ? 0.03 : 0.022);
      if (section === 2) this.choir(t, chord.notes.map((n) => n + 12), barLen);
      if (section === 2 && bar === 0) this.cymbal(t, 2.8, false);
    }
    // The ostinato figure.
    if (section >= s.ostinatoFrom && section !== 3 || (section === 3 && s !== SONGS.menu && bar < 4)) {
      for (const [st, idx] of s.ostinato) {
        if (st !== inBar) continue;
        const n = chord.notes[idx % chord.notes.length] + Math.floor(idx / chord.notes.length) * 12 + s.ostinatoOctave;
        this.bowed(t, n, stepLen * (s.steps === 12 ? 1 : 0.9), s.steps === 12 ? 0.05 : 0.035);
      }
    }
    // The melody: whistle and/or horns, depending on the section.
    for (const [b, st, midi, len] of s.melody) {
      if (b !== bar || st !== inBar) continue;
      const dur = len * stepLen;
      if (s.whistleIn.includes(section)) {
        // A Celtic flick: a quick upper grace note before some of the longer notes.
        const grace = len >= 6 && (b + st) % 3 === 0;
        if (grace) this.whistle(t, midi + 2, stepLen * 0.35, 0.8);
        this.whistle(grace ? t + stepLen * 0.35 : t, midi, dur - (grace ? stepLen * 0.35 : 0), 1);
      }
      if (s.hornsIn.includes(section)) this.horn(t, midi + s.hornOctave, dur, section === 2 ? 1 : 0.8);
    }
    // Drums: lighter while the song opens and in the breath, full in the build and the peak.
    const drums = first ? 0 : section === 0 ? (s === SONGS.menu ? 0 : 0.7) : section === 3 ? 0.55 : 1;
    if (drums > 0) {
      if (s.taiko.includes(inBar)) this.taiko(t, 1 * drums);
      if (s.taikoSmall.includes(inBar)) this.taiko(t, 0.55 * drums, true);
      if (s.frame.includes(inBar)) this.frame(t, (inBar % (s.stepsPerBeat * 2) === 0 ? 1 : 0.6) * drums);
      if (s.snare.includes(inBar) && section !== 3) this.snare(t, 0.8 * drums);
    }
    // The end of the breath: a snare roll and a cymbal swell back into the top.
    if (section === 3 && bar === CYCLE - 1 && inBar === 0) {
      this.roll(t, barLen);
      this.cymbal(t, barLen, true);
    }
  }

  // --- instruments ----------------------------------------------------------------------------

  /** Envelope helper: attack, hold, release on a fresh gain node. */
  private env(t: number, len: number, peak: number, attack: number, release: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, len));
    g.gain.linearRampToValueAtTime(0.0001, t + Math.max(attack, len) + release);
    return g;
  }

  /** A vibrato LFO wired into the detune of the given oscillators, starting after a delay. */
  private vibrato(t: number, len: number, depth: number, rate: number, oscs: OscillatorNode[], delay = 0.18): void {
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rate;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(depth, t + delay + 0.25);
    lfo.connect(g);
    for (const o of oscs) g.connect(o.detune);
    lfo.start(t);
    lfo.stop(t + len + 1);
  }

  /** Sustained string section: three detuned saws per note, a gentle bow attack. */
  private strings(t: number, notes: number[], len: number, level: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1700;
    lp.Q.value = 0.5;
    const g = this.env(t, len, level, 0.45, 0.7);
    const oscs: OscillatorNode[] = [];
    for (const n of notes) {
      for (const detune of [-8, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiHz(n);
        o.detune.value = detune;
        o.connect(lp);
        o.start(t);
        o.stop(t + len + 1);
        oscs.push(o);
      }
    }
    this.vibrato(t, len, 6, 5, oscs, 0.3);
    lp.connect(g).connect(this.bus);
  }

  /** A short bowed note (fiddle or spiccato strings). */
  private bowed(t: number, midi: number, len: number, level: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(level * 0.35, t + len * 0.9);
    g.gain.linearRampToValueAtTime(0.0001, t + len + 0.06);
    for (const detune of [-5, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(midi);
      o.detune.value = detune;
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.1);
    }
    lp.connect(g).connect(this.bus);
  }

  /** Tin whistle: a pure tone with a little breath and a singing vibrato. */
  private whistle(t: number, midi: number, len: number, level: number): void {
    const ctx = this.ctx;
    const f = midiHz(midi);
    const g = this.env(t, len, 0.055 * level, 0.025, 0.12);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    o.connect(g);
    o2.connect(g2).connect(g);
    // Breath: noise around the second harmonic.
    const breath = this.noiseAt(t, len + 0.15);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f * 2;
    bp.Q.value = 3;
    const bg = ctx.createGain();
    bg.gain.value = 0.18;
    breath.connect(bp).connect(bg).connect(g);
    for (const x of [o, o2]) { x.start(t); x.stop(t + len + 0.2); }
    if (len > 0.3) this.vibrato(t, len, 18, 5.6, [o, o2]);
    g.connect(this.bus);
  }

  /** French horns: a brassy swell, the filter opening as the note blooms, an octave below for weight. */
  private horn(t: number, midi: number, len: number, level: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.linearRampToValueAtTime(1500, t + 0.16);
    lp.frequency.setTargetAtTime(1100, t + 0.3, 0.4);
    const g = this.env(t, len, 0.06 * level, 0.09, 0.25);
    const oscs: OscillatorNode[] = [];
    for (const [type, m, lvl] of [['sawtooth', 1, 1], ['square', 1, 0.4], ['sawtooth', 0.5, 0.5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = midiHz(midi) * m;
      const og = ctx.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + len + 0.4);
      oscs.push(o);
    }
    this.vibrato(t, len, 5, 4.8, oscs, 0.35);
    lp.connect(g).connect(this.bus);
  }

  /** A choir "aah": saws through two vowel formants. */
  private choir(t: number, notes: number[], len: number): void {
    const ctx = this.ctx;
    const g = this.env(t, len, 0.03, 0.7, 0.9);
    const mix = ctx.createGain();
    for (const [f, q, lvl] of [[750, 5, 1], [1180, 6, 0.7], [2600, 8, 0.25]]) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const bg = ctx.createGain();
      bg.gain.value = lvl;
      mix.connect(bp).connect(bg).connect(g);
    }
    const oscs: OscillatorNode[] = [];
    for (const n of notes) {
      for (const detune of [-10, 9]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiHz(n);
        o.detune.value = detune;
        o.connect(mix);
        o.start(t);
        o.stop(t + len + 1.2);
        oscs.push(o);
      }
    }
    this.vibrato(t, len, 7, 5.2, oscs, 0.4);
    g.connect(this.bus);
  }

  /** A pipes drone: root and fifth, low and a little nasal. */
  private drone(t: number, root: number, len: number, level: number): void {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const nasal = ctx.createBiquadFilter();
    nasal.type = 'peaking';
    nasal.frequency.value = 1300;
    nasal.Q.value = 4;
    nasal.gain.value = 8;
    const g = this.env(t, len, level, 0.3, 0.5);
    for (const n of [root - 12, root - 5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(n);
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.8);
    }
    lp.connect(nasal).connect(g).connect(this.bus);
  }

  /** Taiko: a deep pitched thump with a skin slap (small = a higher, lighter drum). */
  private taiko(t: number, level: number, small = false): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(small ? 150 : 95, t);
    o.frequency.exponentialRampToValueAtTime(small ? 80 : 42, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime((small ? 0.28 : 0.55) * level, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + (small ? 0.4 : 0.9));
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 1);
    const slap = this.noiseAt(t, 0.12);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = small ? 1200 : 600;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.25 * level, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    slap.connect(lp).connect(sg).connect(this.bus);
  }

  /** Bodhrán: a frame drum's soft, woody tap. */
  private frame(t: number, level: number): void {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(95, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.2);
    const n = this.noiseAt(t, 0.06);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.08 * level, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(bp).connect(ng).connect(this.bus);
  }

  /** An orchestral snare: a crisp crack. */
  private snare(t: number, level: number): void {
    const ctx = this.ctx;
    const n = this.noiseAt(t, 0.2);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16 * level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(hp).connect(g).connect(this.bus);
  }

  /** A snare roll that builds over `len` seconds. */
  private roll(t: number, len: number): void {
    const hits = 28;
    for (let k = 0; k < hits; k++) {
      const f = k / hits;
      this.snare(t + len * (1 - Math.pow(1 - f, 1.4)), 0.25 + 0.75 * f);
    }
  }

  /** A suspended cymbal: a long crash, or a swell rising into the next bar. */
  private cymbal(t: number, len: number, swell: boolean): void {
    const ctx = this.ctx;
    const n = this.noiseAt(t, len + 0.1);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const g = ctx.createGain();
    if (swell) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + len);
      g.gain.linearRampToValueAtTime(0.0001, t + len + 0.05);
    } else {
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + len);
    }
    n.connect(hp).connect(g).connect(this.bus);
  }

  private noiseAt(t: number, len: number): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(t, Math.random() * 0.5);
    src.stop(t + len);
    return src;
  }
}
