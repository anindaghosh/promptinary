/**
 * Promptinary background music engine — Web Audio API, no external files needed.
 *
 * lobby / playing each have 3 themed variants that get randomly picked per game.
 * countdown / scoring / reveal / leaderboard are fixed (they're short moments).
 *
 * Call getAudio().randomize() whenever a new game room is entered to pick a
 * fresh combo of tracks for that session.
 */

// ── Note table ────────────────────────────────────────────────────────────────
const N: Record<string, number> = {
  Bb2: 116.54,
  C3:  130.81, Cs3: 138.59, D3: 146.83, Ds3: 155.56, E3: 164.81,
  F3:  174.61, Fs3: 185.0,  G3: 196.0,  Gs3: 207.65, A3: 220.0, Bb3: 233.08, B3: 246.94,
  C4:  261.63, Cs4: 277.18, D4: 293.66, Ds4: 311.13, E4: 329.63,
  F4:  349.23, Fs4: 369.99, G4: 392.0,  Gs4: 415.30, A4: 440.0, Bb4: 466.16, B4: 493.88,
  C5:  523.25, Cs5: 554.37, D5: 587.33, Ds5: 622.25, E5: 659.25,
  F5:  698.46, Fs5: 739.99, G5: 783.99, A5: 880.0,
  _: 0, // rest
};

export type PhaseKey = 'lobby' | 'countdown' | 'playing' | 'scoring' | 'reveal' | 'leaderboard';

interface Beat { freq: number; dur: number }
interface Theme { bpm: number; beats: Beat[]; bass?: number; vol: number; label?: string }

// ── Variant pools ─────────────────────────────────────────────────────────────

const LOBBY_VARIANTS: Theme[] = [
  // A – C major, dreamy arpeggio
  {
    label: 'C major dreams', bpm: 72, vol: 0.18, bass: N.C3,
    beats: [
      { freq: N.E4,  dur: 1   }, { freq: N.G4,  dur: 1   }, { freq: N.C5,  dur: 1   },
      { freq: N.G4,  dur: 1   }, { freq: N.E4,  dur: 1   }, { freq: N.C4,  dur: 1   },
      { freq: N.D4,  dur: 1   }, { freq: N.F4,  dur: 1   }, { freq: N.A4,  dur: 1   },
      { freq: N.F4,  dur: 1   }, { freq: N.D4,  dur: 1   }, { freq: N.C4,  dur: 1   },
    ],
  },
  // B – A minor, wistful waltz
  {
    label: 'A minor waltz', bpm: 66, vol: 0.17, bass: N.A3,
    beats: [
      { freq: N.A4,  dur: 1   }, { freq: N.C5,  dur: 0.5 }, { freq: N.E5,  dur: 0.5 },
      { freq: N.C5,  dur: 1   }, { freq: N.A4,  dur: 1   },
      { freq: N.G4,  dur: 1   }, { freq: N.B4,  dur: 0.5 }, { freq: N.D5,  dur: 0.5 },
      { freq: N.B4,  dur: 1   }, { freq: N.G4,  dur: 1   },
      { freq: N.F4,  dur: 1   }, { freq: N.A4,  dur: 1   }, { freq: N.C5,  dur: 1   },
      { freq: N.A4,  dur: 2   },
    ],
  },
  // C – F major, warm & hopeful
  {
    label: 'F major glow', bpm: 76, vol: 0.18, bass: N.F3,
    beats: [
      { freq: N.F4,  dur: 0.5 }, { freq: N.A4,  dur: 0.5 }, { freq: N.C5,  dur: 1   },
      { freq: N.A4,  dur: 0.5 }, { freq: N.G4,  dur: 0.5 }, { freq: N.F4,  dur: 1   },
      { freq: N.G4,  dur: 0.5 }, { freq: N.Bb4, dur: 0.5 }, { freq: N.D5,  dur: 1   },
      { freq: N.Bb4, dur: 0.5 }, { freq: N.A4,  dur: 0.5 }, { freq: N.F4,  dur: 1   },
    ],
  },
  // D – D dorian, mysterious groove
  {
    label: 'D dorian mystery', bpm: 80, vol: 0.17, bass: N.D3,
    beats: [
      { freq: N.D4,  dur: 0.5 }, { freq: N._,   dur: 0.25 }, { freq: N.F4,  dur: 0.25 },
      { freq: N.A4,  dur: 0.5 }, { freq: N._,   dur: 0.5  },
      { freq: N.G4,  dur: 0.5 }, { freq: N.E4,  dur: 0.5  },
      { freq: N.D4,  dur: 1   }, { freq: N._,   dur: 0.5  },
      { freq: N.C4,  dur: 0.5 }, { freq: N.D4,  dur: 0.5  },
      { freq: N.F4,  dur: 0.75}, { freq: N.A4,  dur: 0.75 },
      { freq: N.D5,  dur: 1   }, { freq: N._,   dur: 0.5  },
    ],
  },
];

const PLAYING_VARIANTS: Theme[] = [
  // A – G mixolydian, upbeat driving
  {
    label: 'G mixo drive', bpm: 138, vol: 0.20, bass: N.G3,
    beats: [
      { freq: N.G4,  dur: 0.5 }, { freq: N.B4,  dur: 0.5 },
      { freq: N.D5,  dur: 0.5 }, { freq: N.G5,  dur: 0.5 },
      { freq: N.D5,  dur: 0.5 }, { freq: N.B4,  dur: 0.5 },
      { freq: N.A4,  dur: 0.5 }, { freq: N.G4,  dur: 0.5 },
      { freq: N.C5,  dur: 0.5 }, { freq: N.E5,  dur: 0.5 },
      { freq: N.D5,  dur: 0.5 }, { freq: N.C5,  dur: 0.5 },
      { freq: N.B4,  dur: 0.5 }, { freq: N.A4,  dur: 0.5 },
      { freq: N.G4,  dur: 1.0 },
    ],
  },
  // B – D major, punchy & energetic
  {
    label: 'D major sprint', bpm: 148, vol: 0.19, bass: N.D3,
    beats: [
      { freq: N.D5,  dur: 0.25 }, { freq: N._,   dur: 0.25 },
      { freq: N.Fs5, dur: 0.25 }, { freq: N._,   dur: 0.25 },
      { freq: N.A5,  dur: 0.5  }, { freq: N._,   dur: 0.5  },
      { freq: N.Fs5, dur: 0.25 }, { freq: N.E5,  dur: 0.25 },
      { freq: N.D5,  dur: 0.5  }, { freq: N._,   dur: 0.25 },
      { freq: N.E5,  dur: 0.25 },
      { freq: N.Fs5, dur: 0.5  }, { freq: N.A5,  dur: 0.5  },
      { freq: N.G5,  dur: 0.5  }, { freq: N.Fs5, dur: 0.5  },
      { freq: N.D5,  dur: 1.0  },
    ],
  },
  // C – E minor, intense & dark
  {
    label: 'E minor intensity', bpm: 132, vol: 0.20, bass: N.E3,
    beats: [
      { freq: N.E5,  dur: 0.5  }, { freq: N.D5,  dur: 0.5  },
      { freq: N.B4,  dur: 0.5  }, { freq: N.A4,  dur: 0.5  },
      { freq: N.G4,  dur: 0.5  }, { freq: N.A4,  dur: 0.5  },
      { freq: N.B4,  dur: 1.0  },
      { freq: N.C5,  dur: 0.5  }, { freq: N.B4,  dur: 0.5  },
      { freq: N.A4,  dur: 0.5  }, { freq: N.G4,  dur: 0.5  },
      { freq: N.Fs4, dur: 0.5  }, { freq: N.G4,  dur: 0.5  },
      { freq: N.E4,  dur: 1.0  },
    ],
  },
  // D – C pentatonic, breezy & carefree
  {
    label: 'C penta breeze', bpm: 126, vol: 0.19, bass: N.C3,
    beats: [
      { freq: N.C5,  dur: 0.5  }, { freq: N.D5,  dur: 0.25 }, { freq: N.E5,  dur: 0.25 },
      { freq: N.G5,  dur: 0.5  }, { freq: N.E5,  dur: 0.5  },
      { freq: N.D5,  dur: 0.5  }, { freq: N.C5,  dur: 0.5  },
      { freq: N.G4,  dur: 0.5  }, { freq: N.A4,  dur: 0.5  },
      { freq: N.C5,  dur: 0.5  }, { freq: N.D5,  dur: 0.5  },
      { freq: N.E5,  dur: 0.25 }, { freq: N.D5,  dur: 0.25 }, { freq: N.C5,  dur: 0.5  },
      { freq: N.G4,  dur: 1.0  },
    ],
  },
];

// ── Fixed single themes (short-lived phases) ──────────────────────────────────
const FIXED_THEMES: Omit<Record<PhaseKey, Theme>, 'lobby' | 'playing'> = {
  countdown: {
    bpm: 120, vol: 0.22,
    beats: [
      { freq: N.B4,  dur: 0.25 }, { freq: N._,   dur: 0.25 },
      { freq: N.D5,  dur: 0.25 }, { freq: N._,   dur: 0.25 },
      { freq: N.F5,  dur: 0.5  }, { freq: N._,   dur: 0.5  },
      { freq: N.G5,  dur: 0.75 }, { freq: N._,   dur: 0.25 },
    ],
  },
  scoring: {
    bpm: 80, vol: 0.15, bass: N.D3,
    beats: [
      { freq: N.D4,  dur: 0.75 }, { freq: N.F4,  dur: 0.75 },
      { freq: N.A4,  dur: 0.75 }, { freq: N.C5,  dur: 0.75 },
      { freq: N.A4,  dur: 0.5  }, { freq: N.F4,  dur: 0.5  },
      { freq: N.D4,  dur: 1.5  },
    ],
  },
  reveal: {
    bpm: 100, vol: 0.22, bass: N.C3,
    beats: [
      { freq: N.C4,  dur: 0.33 }, { freq: N.E4,  dur: 0.33 }, { freq: N.G4,  dur: 0.33 },
      { freq: N.C5,  dur: 0.5  }, { freq: N._,   dur: 0.25 },
      { freq: N.G4,  dur: 0.33 }, { freq: N.E4,  dur: 0.33 }, { freq: N.C4,  dur: 0.33 },
      { freq: N.E4,  dur: 0.5  }, { freq: N._,   dur: 0.5  },
      { freq: N.D4,  dur: 0.33 }, { freq: N.F4,  dur: 0.33 }, { freq: N.A4,  dur: 0.33 },
      { freq: N.D5,  dur: 0.5  }, { freq: N._,   dur: 0.25 },
      { freq: N.C5,  dur: 1.0  }, { freq: N._,   dur: 0.5  },
    ],
  },
  leaderboard: {
    bpm: 108, vol: 0.24, bass: N.G3,
    beats: [
      { freq: N.G4,  dur: 0.5  }, { freq: N.G4,  dur: 0.5  },
      { freq: N.D5,  dur: 0.5  }, { freq: N.D5,  dur: 0.5  },
      { freq: N.E5,  dur: 0.5  }, { freq: N.D5,  dur: 0.5  },
      { freq: N.C5,  dur: 1.0  },
      { freq: N.B4,  dur: 0.5  }, { freq: N.B4,  dur: 0.5  },
      { freq: N.A4,  dur: 0.5  }, { freq: N.G4,  dur: 0.5  },
      { freq: N.G4,  dur: 1.5  },
    ],
  },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Engine ────────────────────────────────────────────────────────────────────
class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private oscNodes: OscillatorNode[] = [];
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private currentPhase: PhaseKey | null = null;
  private _muted: boolean;
  private loopStart = 0;
  private loopDuration = 0;

  /** Active theme map — updated by randomize() */
  private activeThemes: Record<PhaseKey, Theme> = {
    lobby:       LOBBY_VARIANTS[0],
    playing:     PLAYING_VARIANTS[0],
    countdown:   FIXED_THEMES.countdown,
    scoring:     FIXED_THEMES.scoring,
    reveal:      FIXED_THEMES.reveal,
    leaderboard: FIXED_THEMES.leaderboard,
  };

  constructor() {
    this._muted = typeof window !== 'undefined'
      ? localStorage.getItem('promptinary_muted') === 'true'
      : false;
    // Pick random starting variants
    this.pickVariants();
  }

  /** Pick random lobby + playing themes for this session */
  private pickVariants() {
    this.activeThemes.lobby   = pick(LOBBY_VARIANTS);
    this.activeThemes.playing = pick(PLAYING_VARIANTS);
  }

  /**
   * Call this when a new game room is entered / a new game starts.
   * Picks fresh random lobby & playing tracks, restarts music if mid-play.
   */
  randomize() {
    const wasPlaying = this.currentPhase;
    this.pickVariants();
    if (wasPlaying === 'lobby' || wasPlaying === 'playing') {
      // Force restart with the new variant
      this.currentPhase = null;
      this.stopAll();
      if (!this._muted) this.startLoop(wasPlaying);
      this.currentPhase = wasPlaying;
    }
  }

  get muted() { return this._muted; }

  private ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this._muted ? 0 : 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return { ctx: this.ctx, master: this.masterGain! };
  }

  private scheduleNote(
    ctx: AudioContext, dest: AudioNode,
    freq: number, startTime: number, dur: number, vol: number,
    type: OscillatorType = 'triangle',
  ) {
    if (freq === 0) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const atk = 0.02;
    const rel = Math.min(0.08, dur * 0.25);
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + atk);
    gain.gain.setValueAtTime(vol, startTime + dur - rel);
    gain.gain.linearRampToValueAtTime(0, startTime + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.01);
    this.oscNodes.push(osc);
  }

  private scheduleBass(ctx: AudioContext, dest: AudioNode, freq: number, startTime: number, dur: number) {
    if (!freq) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.07, startTime);
    gain.gain.linearRampToValueAtTime(0, startTime + dur);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + dur + 0.01);
    this.oscNodes.push(osc);
  }

  private scheduleLoop(theme: Theme, startAt: number): number {
    const { ctx, master } = this.ensureContext();
    const spb = 60 / theme.bpm;
    let t = startAt;
    for (const beat of theme.beats) {
      this.scheduleNote(ctx, master, beat.freq, t, beat.dur * spb * 0.9, theme.vol * 0.7);
      t += beat.dur * spb;
    }
    if (theme.bass) this.scheduleBass(ctx, master, theme.bass, startAt, t - startAt);
    return t - startAt;
  }

  private stopAll() {
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
    this.oscNodes.forEach(o => { try { o.disconnect(); } catch { /* ignore */ } });
    this.oscNodes = [];
  }

  private startLoop(phase: PhaseKey) {
    const theme = this.activeThemes[phase];
    const { ctx } = this.ensureContext();
    const now = ctx.currentTime + 0.05;
    this.loopStart   = now;
    this.loopDuration = this.scheduleLoop(theme, now);

    const scheduleNext = (nextStart: number) => {
      const dur = this.scheduleLoop(theme, nextStart);
      this.loopTimer = setTimeout(() => {
        if (this.currentPhase === phase) scheduleNext(nextStart + dur);
      }, Math.max(0, (nextStart - ctx.currentTime - 0.2) * 1000));
    };

    this.loopTimer = setTimeout(() => {
      if (this.currentPhase === phase) scheduleNext(this.loopStart + this.loopDuration);
    }, Math.max(0, (this.loopDuration - 0.2) * 1000));
  }

  play(phase: PhaseKey) {
    if (this.currentPhase === phase) return;
    this.currentPhase = phase;
    this.stopAll();
    if (!this._muted) this.startLoop(phase);
  }

  stop() {
    this.currentPhase = null;
    this.stopAll();
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    localStorage.setItem('promptinary_muted', String(this._muted));
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this._muted ? 0 : 1, this.ctx!.currentTime, 0.1,
      );
    }
    if (!this._muted && this.currentPhase) {
      this.stopAll();
      this.startLoop(this.currentPhase);
    }
    return this._muted;
  }
}

// Singleton — safe for SSR
let _engine: AudioEngine | null = null;
export function getAudio(): AudioEngine {
  if (!_engine) _engine = new AudioEngine();
  return _engine;
}
