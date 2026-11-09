// Sound: everything is synthesized with Web Audio, so there are no sound files to load.
// The browser only allows audio after a click or key press, so nothing plays until unlock().
// Effects (engine, scrapes, beeps) and music have separate buses: menus silence the effects
// while the music keeps playing.

import { Music } from './music';

const MASTER_VOLUME = 0.5;

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  /** The player's volume settings (Settings menu), separate from the scene switching on sfx. */
  private sfxVol!: GainNode;
  private musicVol!: GainNode;
  private volumes = { music: 0.8, sfx: 0.9 };
  private music: Music | null = null;
  /** What the music should be doing; applied as soon as audio is unlocked. */
  private scene: 'menu' | 'race' | 'paused' = 'menu';
  private engineGain!: GainNode;
  /** Rushing wind past the dragon, rising with speed (Skyfold has no engine). */
  private windGain!: GainNode;
  private windBand!: BiquadFilterNode;
  private engineFilter!: BiquadFilterNode;
  private engineOscs: OscillatorNode[] = [];
  private scrapeGain!: GainNode;
  /** Wind while airborne off a jump: its level and a band-pass that rises with height. */
  private airGain!: GainNode;
  private airBand!: BiquadFilterNode;
  /** Loops for sprint strips: a charging hum, a cooling hiss and a fire crackle. */
  private stripGains: Record<'charge' | 'cool' | 'fire', GainNode> | null = null;
  /** Which race loop to play: the circuit groove or the sprint one. */
  private raceSong: 'race' | 'sprint' = 'race';
  private noise!: AudioBuffer;
  muted = false;

  /** Create or resume the audio context. Call from a click or key handler. */
  unlock(): void {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
    this.apply();
  }

  /** Start screen / results: chill house, no engine. */
  menu(): void { this.scene = 'menu'; this.apply(); }

  /** Racing: race music (the sprint loop on a sprint) and effects on. */
  race(song: 'race' | 'sprint' = 'race'): void { this.scene = 'race'; this.raceSong = song; this.apply(); }

  /** Pause menu: effects off, race music muffled. */
  pause(): void { this.scene = 'paused'; this.apply(); }

  private apply(): void {
    if (!this.ctx || !this.music) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(this.scene === 'race' ? 1 : 0, t, 0.05);
    this.music.play(this.scene === 'menu' ? 'menu' : this.raceSong);
    this.music.setMuffled(this.scene === 'paused');
  }

  /** Music and effects volume, 0..1 each (from Settings). */
  setVolumes(music: number, sfx: number): void {
    this.volumes = { music, sfx };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicVol.gain.setTargetAtTime(music, t, 0.03);
    this.sfxVol.gain.setTargetAtTime(sfx, t, 0.03);
  }

  /**
   * A car going past: a rush of air that rises then falls in pitch (the Doppler drop),
   * panned to the side it passes on. closing = how fast it passes (px/s), side -1 left .. +1 right.
   */
  /**
   * A rival dragon sweeping past close by: two or three heavy wingbeats panned from one side to
   * behind, each a little lower and fainter as it pulls away or drops back (a wingbeat Doppler),
   * over the rush of the air it pushes. `closing` is how fast it passes (px/s), `side` +1 right.
   */
  passBy(closing: number, side: number): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime, k = Math.min(1, closing / 400);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(Math.max(-1, Math.min(1, side * 0.85)), t);
    pan.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, side * 0.25)), t + 0.9);
    pan.connect(this.sfx);
    // The rush of its wake: soft air, sweeping down.
    const src = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(900 + k * 500, t);
    band.frequency.exponentialRampToValueAtTime(260, t + 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 + k * 0.12, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    src.connect(band).connect(g).connect(pan);
    src.start(t); src.stop(t + 0.9);
    // Its wingbeats: deep whumps of air, each lower than the last.
    const beats = closing > 220 ? 3 : 2;
    for (let n = 0; n < beats; n++) {
      const at = t + 0.04 + n * (0.3 - k * 0.06), fade = 1 - n * 0.28, drop = 1 - n * 0.12;
      const air = this.noiseSource();
      const low = ctx.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.setValueAtTime(620 * drop, at);
      low.frequency.exponentialRampToValueAtTime(150 * drop, at + 0.2);
      const ag = ctx.createGain();
      ag.gain.setValueAtTime(0.0001, at);
      ag.gain.exponentialRampToValueAtTime((0.42 + k * 0.22) * fade, at + 0.04);
      ag.gain.exponentialRampToValueAtTime(0.001, at + 0.26);
      air.connect(low).connect(ag).connect(pan);
      air.start(at); air.stop(at + 0.28);
      const thud = ctx.createOscillator();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(88 * drop, at);
      thud.frequency.exponentialRampToValueAtTime(52 * drop, at + 0.18);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime((0.16 + k * 0.1) * fade, at);
      tg.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      thud.connect(tg).connect(pan);
      thud.start(at); thud.stop(at + 0.24);
    }
  }

  /** Call every step with whether the player is riding the gale: it roars as the gale is called. */
  gale(on: boolean): void {
    if (on && !this.galeOn) this.roar();
    this.galeOn = on;
  }
  private galeOn = false;

  /**
   * The player's dragon roars: a deep, rough growl that swells and opens up (the vowel moving
   * from a closed "oo" to a wide "ah"), with a gravelly rumble and a rush of breath, about 1.3 s.
   */
  roar(): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime, len = 1.3;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.3, t + 0.12);
    out.gain.setValueAtTime(0.3, t + 0.55);
    out.gain.exponentialRampToValueAtTime(0.001, t + len);
    // A rough edge: soft clipping.
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 255) * 2 - 1; curve[i] = Math.tanh(x * 3); }
    shaper.curve = curve;
    // The voice: two detuned saws, pitch rising into the roar and sagging at the end.
    const voice = ctx.createGain();
    voice.gain.value = 0.35;
    for (const det of [0, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(118, t + 0.35);
      o.frequency.exponentialRampToValueAtTime(64, t + len);
      o.connect(voice);
      o.start(t); o.stop(t + len + 0.05);
    }
    // The growl: the voice's loudness flutters quickly, like a throat rattling.
    const rattle = ctx.createGain();
    rattle.gain.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(22, t);
    lfo.frequency.linearRampToValueAtTime(30, t + len);
    const depth = ctx.createGain();
    depth.gain.value = 0.4;
    lfo.connect(depth).connect(rattle.gain);
    lfo.start(t); lfo.stop(t + len + 0.05);
    voice.connect(rattle).connect(shaper);
    // The mouth: two vowel formants opening from "oo" to "ah".
    for (const [f0, f1, q, lvl] of [[300, 750, 5, 1], [700, 1150, 6, 0.6]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(f1, t + 0.4);
      bp.frequency.exponentialRampToValueAtTime(f0 * 1.2, t + len);
      const bg = ctx.createGain();
      bg.gain.value = lvl;
      shaper.connect(bp).connect(bg).connect(out);
    }
    // Chest: the low body of it.
    const chest = ctx.createBiquadFilter();
    chest.type = 'lowpass';
    chest.frequency.value = 220;
    const cg = ctx.createGain();
    cg.gain.value = 0.7;
    shaper.connect(chest).connect(cg).connect(out);
    // Breath: a rush of air through the teeth.
    const breath = this.noiseSource();
    const bb = ctx.createBiquadFilter();
    bb.type = 'bandpass';
    bb.Q.value = 0.8;
    bb.frequency.setValueAtTime(900, t);
    bb.frequency.exponentialRampToValueAtTime(1600, t + 0.4);
    bb.frequency.exponentialRampToValueAtTime(700, t + len);
    const brg = ctx.createGain();
    brg.gain.value = 0.18;
    breath.connect(bb).connect(brg).connect(out);
    breath.start(t); breath.stop(t + len + 0.05);
    out.connect(this.sfx);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  /**
   * Engine hum for the player's craft, set every step. Pitch climbs through each gear's rev band
   * and drops back on an upshift; the filter opens and the volume rises with thrust.
   */
  engine(gear: number, rev: number, thrust: number, speedFrac: number): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const freq = 52 + gear * 9 + rev * 80;
    this.engineOscs[0].frequency.setTargetAtTime(freq, t, 0.03);
    this.engineOscs[1].frequency.setTargetAtTime(freq * 0.5, t, 0.03);
    this.engineOscs[2].frequency.setTargetAtTime(freq * 2.01, t, 0.03);
    this.engineFilter.frequency.setTargetAtTime(350 + thrust * 1500 + rev * 700, t, 0.05);
    // Dragons have no engine: the old engine tone stays silent, and the wind carries the speed.
    this.engineGain.gain.setTargetAtTime(0, t, 0.05);
    this.windGain.gain.setTargetAtTime(0.025 + speedFrac * 0.11 + thrust * 0.02, t, 0.08);
    this.windBand.frequency.setTargetAtTime(260 + speedFrac * 1300, t, 0.1);
  }

  /** One downstroke of the player's wings: a soft, deep whump of air. strength 0..1. */
  wingbeat(strength: number): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime, k = Math.min(1, strength);
    const src = this.noiseSource();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(520, t);
    low.frequency.exponentialRampToValueAtTime(140, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26 * k, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    src.connect(low).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + 0.32);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(78, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.2);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.12 * k, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(og).connect(this.sfx);
    o.start(t); o.stop(t + 0.26);
  }

  /** Grinding against a wall: 0 = clear, 1 = pressed hard into it. Set every step. */
  scrape(level: number): void {
    if (!this.ctx) return;
    this.scrapeGain.gain.setTargetAtTime(Math.min(1, level) * 0.22, this.ctx.currentTime, level > 0 ? 0.02 : 0.08);
  }

  /** Air rushing as the gearbox shifts up. */
  whoosh(): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(500, t);
    band.frequency.exponentialRampToValueAtTime(2800, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(band).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.45);
  }

  /** A heavy hit on a wall or another car; impact is the closing speed in px/s. */
  thud(impact: number): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.5, impact / 600), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  /**
   * Touching down after a jump: a deep body thump, a crunch of the skirt hitting the deck and a
   * short metallic ring from the hull. impact is the vertical speed (px/s), about 330 normally.
   */
  land(impact: number): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime, k = Math.min(1, impact / 450);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55 * k, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    osc.connect(g).connect(this.sfx);
    osc.start(t); osc.stop(t + 0.4);
    const src = this.noiseSource();
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(1600, t);
    low.frequency.exponentialRampToValueAtTime(240, t + 0.25);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.32 * k, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(low).connect(ng).connect(this.sfx);
    src.start(t); src.stop(t + 0.3);
    for (const [f, v] of [[310, 0.05], [467, 0.035]] as const) {
      const ring = ctx.createOscillator();
      ring.type = 'triangle';
      ring.frequency.value = f;
      const rg = ctx.createGain();
      rg.gain.setValueAtTime(v * k, t + 0.01);
      rg.gain.exponentialRampToValueAtTime(0.0005, t + 0.5);
      ring.connect(rg).connect(this.sfx);
      ring.start(t); ring.stop(t + 0.52);
    }
  }

  /** Wind while airborne: 0 = on the ground, 1 = at the top of a big jump. Set every step. */
  air(level: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.airGain.gain.setTargetAtTime(Math.min(1, level) * 0.2, t, level > 0 ? 0.08 : 0.12);
    this.airBand.frequency.setTargetAtTime(500 + Math.min(1, level) * 900, t, 0.1);
  }

  /** The strip under the player ('charge', 'cool', 'fire') or null: fades its loop in, the others out. */
  strip(kind: 'charge' | 'cool' | 'fire' | null): void {
    if (!this.ctx || !this.stripGains) return;
    const t = this.ctx.currentTime;
    const level = { charge: 0.12, cool: 0.08, fire: 0.14 };
    for (const k of ['charge', 'cool', 'fire'] as const) {
      this.stripGains[k].gain.setTargetAtTime(kind === k ? level[k] : 0, t, kind === k ? 0.05 : 0.15);
    }
  }

  /** A boost pad's push: a rising rush with a bright ping on top. */
  padBoost(): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.6;
    band.frequency.setValueAtTime(400, t);
    band.frequency.exponentialRampToValueAtTime(3600, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    src.connect(band).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + 0.55);
    this.tone(1568, 0.12, 0.05);
    this.tone(2093, 0.16, 0.04, 0.06);
  }

  /** The crowd at the finish: a swell of cheering that fades over a few seconds (bigger for a win). */
  crowd(win: boolean): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime, peak = win ? 0.22 : 0.13, len = win ? 4.5 : 3;
    for (const [f, q] of [[700, 0.7], [1500, 1.1], [3200, 1.6]] as const) {
      const src = this.noiseSource();
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = f;
      band.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak / (f > 2000 ? 2.5 : 1), t + 0.6);
      g.gain.setTargetAtTime(0.0001, t + 1.2, len / 4);
      // A slow wobble, so it sounds like many voices rather than steady hiss.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 3 + f / 1000;
      const lg = ctx.createGain();
      lg.gain.value = peak * 0.35;
      lfo.connect(lg).connect(g.gain);
      src.connect(band).connect(g).connect(this.sfx);
      src.start(t); src.stop(t + len);
      lfo.start(t); lfo.stop(t + len);
    }
    // A few whistles over the top.
    if (win) [0.5, 1.1, 1.7].forEach((d) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(1900, t + d);
      o.frequency.linearRampToValueAtTime(2500, t + d + 0.25);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0, t + d);
      og.gain.linearRampToValueAtTime(0.035, t + d + 0.05);
      og.gain.linearRampToValueAtTime(0, t + d + 0.35);
      o.connect(og).connect(this.sfx);
      o.start(t + d); o.stop(t + d + 0.4);
    });
  }

  /** A firework bursting: a soft thump, then a crackle tailing off. */
  pop(): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.setValueAtTime(1800, t);
    band.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(band).connect(g).connect(this.sfx);
    src.start(t);
    src.stop(t + 0.65);
  }

  /**
   * The count: on 3-2-1 a war drum and a brazier catching fire; on FLY! a long horn blast
   * (a low sawtooth and its fifth through a closing-then-opening filter, like a lur or a war horn).
   */
  beep(go: boolean): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (!go) {
      // Drum: a pitched thump falling from 120 Hz to 55 Hz.
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(55, t + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
      osc.connect(g).connect(this.sfx);
      osc.start(t); osc.stop(t + 0.5);
      // Fire catching: a band of noise swelling and fading.
      const src = this.noiseSource();
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass'; band.frequency.value = 900; band.Q.value = 0.7;
      const fg = ctx.createGain();
      fg.gain.setValueAtTime(0, t);
      fg.gain.linearRampToValueAtTime(0.12, t + 0.08);
      fg.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
      src.connect(band).connect(fg).connect(this.sfx);
      src.start(t); src.stop(t + 0.65);
      return;
    }
    const len = 1.3;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 3;
    lp.frequency.setValueAtTime(300, t);
    lp.frequency.linearRampToValueAtTime(1500, t + 0.25);
    lp.frequency.linearRampToValueAtTime(900, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.12);
    g.gain.setValueAtTime(0.2, t + len - 0.35);
    g.gain.linearRampToValueAtTime(0, t + len);
    lp.connect(g).connect(this.sfx);
    for (const [f, v] of [[110, 1], [165, 0.55], [220, 0.3]] as const) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 0.94, t);
      osc.frequency.linearRampToValueAtTime(f, t + 0.15);   // the horn's scoop up to pitch
      const og = ctx.createGain(); og.gain.value = v;
      osc.connect(og).connect(lp);
      osc.start(t); osc.stop(t + len + 0.05);
    }
  }

  /**
   * A sheep's bleat: a nasal "baa" (a buzzy tone through two vowel formants, opening then closing)
   * with the wobble of a sheep's voice. `pan` -1..1 places it, `pitch` varies the sheep.
   */
  bleat(pan = 0, pitch = 1): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime, len = 0.55 + Math.random() * 0.2, f0 = (310 + Math.random() * 90) * pitch;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0 * 0.92, t);
    osc.frequency.linearRampToValueAtTime(f0, t + 0.08);
    osc.frequency.linearRampToValueAtTime(f0 * 0.86, t + len);
    // The bleat's tremble: a fast vibrato that deepens as the call goes on.
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.frequency.value = 17 + Math.random() * 5;
    lfoGain.gain.setValueAtTime(2, t);
    lfoGain.gain.linearRampToValueAtTime(f0 * 0.06, t + len);
    lfo.connect(lfoGain).connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.04);
    g.gain.setValueAtTime(0.08, t + len * 0.6);
    g.gain.linearRampToValueAtTime(0, t + len);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    for (const [from, to, q] of [[700, 1050, 6], [1700, 2300, 8]] as const) {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = q;
      f.frequency.setValueAtTime(from, t);
      f.frequency.linearRampToValueAtTime(to, t + 0.12);   // "b-aa": the mouth opens
      f.frequency.linearRampToValueAtTime(from * 0.9, t + len);
      osc.connect(f).connect(g);
    }
    g.connect(panner).connect(this.sfx);
    osc.start(t); lfo.start(t);
    osc.stop(t + len + 0.05); lfo.stop(t + len + 0.05);
  }

  /** Claws closing on a sheep: a quick swoop of air, a muffled thump of wool, and a startled bleat. */
  snatch(): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = this.noiseSource();
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.Q.value = 1.2;
    band.frequency.setValueAtTime(2400, t);
    band.frequency.exponentialRampToValueAtTime(500, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(band).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + 0.3);
    const thump = ctx.createOscillator(), tg = ctx.createGain();
    thump.frequency.setValueAtTime(140, t + 0.06);
    thump.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    tg.gain.setValueAtTime(0, t + 0.06);
    tg.gain.linearRampToValueAtTime(0.25, t + 0.07);
    tg.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    thump.connect(tg).connect(this.sfx);
    thump.start(t + 0.06); thump.stop(t + 0.26);
    setTimeout(() => this.bleat(0, 1.15), 90);
  }

  /**
   * A round's horn: one long blast on a cow horn (a rough low tone and its octave through a
   * resonant body), rising at the end; the final round gets two blasts, the second higher.
   */
  roundHorn(final = false): void {
    const ctx = this.live();
    if (!ctx) return;
    const blasts = final ? [[0, 98, 0.9], [1.05, 131, 1.3]] : [[0, 98, 1.2]];
    for (const [at, f, len] of blasts) {
      const t = ctx.currentTime + at;
      const body = ctx.createBiquadFilter();
      body.type = 'lowpass'; body.Q.value = 5;
      body.frequency.setValueAtTime(380, t);
      body.frequency.linearRampToValueAtTime(1300, t + 0.2);
      body.frequency.linearRampToValueAtTime(1000, t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.2, t + 0.1);
      g.gain.setValueAtTime(0.18, t + len - 0.25);
      g.gain.linearRampToValueAtTime(0, t + len);
      body.connect(g).connect(this.sfx);
      for (const [mul, v] of [[1, 1], [2, 0.35], [1.5, 0.12]] as const) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(f * mul * 0.93, t);
        o.frequency.linearRampToValueAtTime(f * mul, t + 0.12);
        o.frequency.setValueAtTime(f * mul, t + len - 0.3);
        o.frequency.linearRampToValueAtTime(f * mul * 1.04, t + len);   // the player's breath pushing up at the end
        const og = ctx.createGain(); og.gain.value = v;
        o.connect(og).connect(body);
        o.start(t); o.stop(t + len + 0.05);
      }
    }
  }

  /** Two rising notes on a completed lap; three for a best lap. */
  chime(best: boolean): void {
    const notes = best ? [784, 988, 1319] : [784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.18, 0.1, i * 0.09));
  }

  private tone(freq: number, length: number, volume: number, delay = 0): void {
    const ctx = this.live();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.setValueAtTime(volume, t + length - 0.04);
    g.gain.linearRampToValueAtTime(0, t + length);
    osc.connect(g).connect(this.sfx);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  private live(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' ? this.ctx : null;
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    return src;
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(ctx.destination);
    this.sfxVol = ctx.createGain();
    this.sfxVol.gain.value = this.volumes.sfx;
    this.sfxVol.connect(this.master);
    this.musicVol = ctx.createGain();
    this.musicVol.gain.value = this.volumes.music;
    this.musicVol.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0;
    this.sfx.connect(this.sfxVol);

    // One second of white noise, reused by the scrape loop and the whooshes.
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Engine: a saw, a sub-octave square and a faint upper harmonic through a low-pass.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 4;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter.connect(this.engineGain).connect(this.sfx);
    const parts: [OscillatorType, number][] = [['sawtooth', 0.6], ['square', 0.35], ['sawtooth', 0.12]];
    this.engineOscs = parts.map(([type, level]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = 52;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(this.engineFilter);
      osc.start();
      return osc;
    });

    // Wall scrape: looping noise through a bright band-pass, silent until scrape() raises it.
    const scrapeBand = ctx.createBiquadFilter();
    scrapeBand.type = 'bandpass';
    scrapeBand.frequency.value = 2600;
    scrapeBand.Q.value = 0.9;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    const scrapeSrc = this.noiseSource();
    scrapeSrc.connect(scrapeBand).connect(this.scrapeGain).connect(this.sfx);
    scrapeSrc.start();

    // Flight wind: looping noise through a band-pass that opens up with speed (see engine()).
    this.windBand = ctx.createBiquadFilter();
    this.windBand.type = 'bandpass';
    this.windBand.frequency.value = 300;
    this.windBand.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    const windSrc = this.noiseSource();
    windSrc.connect(this.windBand).connect(this.windGain).connect(this.sfx);
    windSrc.start();

    // Airtime wind: looping noise through a soft band-pass, silent until air() raises it.
    this.airBand = ctx.createBiquadFilter();
    this.airBand.type = 'bandpass';
    this.airBand.frequency.value = 600;
    this.airBand.Q.value = 0.6;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    const airSrc = this.noiseSource();
    airSrc.connect(this.airBand).connect(this.airGain).connect(this.sfx);
    airSrc.start();

    // Sprint strips. Charging: a low electric hum with a fast tremolo. Cooling: a soft high hiss.
    // Fire: low noise with a flickering level.
    const mk = () => { const g = ctx.createGain(); g.gain.value = 0; g.connect(this.sfx); return g; };
    this.stripGains = { charge: mk(), cool: mk(), fire: mk() };
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    trem.connect(this.stripGains.charge);
    for (const [f, type] of [[110, 'sawtooth'], [220, 'sine'], [331, 'sine']] as const) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = type === 'sawtooth' ? 0.25 : 0.4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(og).connect(lp).connect(trem);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 14;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain).connect(trem.gain);
    lfo.start();
    const hiss = this.noiseSource();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    hiss.connect(hp).connect(this.stripGains.cool);
    hiss.start();
    const fire = this.noiseSource();
    const flp = ctx.createBiquadFilter(); flp.type = 'lowpass'; flp.frequency.value = 700;
    const flicker = ctx.createGain(); flicker.gain.value = 0.7;
    const flo = ctx.createOscillator(); flo.type = 'square'; flo.frequency.value = 23;
    const flg = ctx.createGain(); flg.gain.value = 0.3;
    flo.connect(flg).connect(flicker.gain);
    flo.start();
    fire.connect(flp).connect(flicker).connect(this.stripGains.fire);
    fire.start();

    this.music = new Music(ctx, this.musicVol, this.noise);
  }
}
