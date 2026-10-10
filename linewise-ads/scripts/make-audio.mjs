// Synthesises the background music and the sound effects into public/audio/. Everything
// is generated here from sine waves and noise, so there is nothing to license or credit.
//
//   node scripts/make-audio.mjs        (Node 23.6 or newer: it imports src/timing.ts)
//
// The music's arrangement follows the scene starts in src/timing.ts, so re-run this
// after moving a scene. It is written as two stems, mid (what both speakers share) and
// side (what differs between them), so the video can pull the middle of the music back
// under the voiceover and leave it wide around the voice. See src/mix.ts.

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DURATION_SECONDS, SCENES } from "../src/timing.ts";

const SR = 48000;
const TAU = Math.PI * 2;
// The side stem is stored this much louder than it really is, so the mix has room to
// widen the music without a volume above 1. Keep in sync with src/mix.ts.
const SIDE_FILE_GAIN = 2;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "audio");
mkdirSync(outDir, { recursive: true });

// --- helpers ---------------------------------------------------------------------

const samples = (seconds) => Math.round(seconds * SR);
const midiHz = (note) => 440 * 2 ** ((note - 69) / 12);
const smoothstep = (x) => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};
// Equal-power pan: -1 is hard left, 1 hard right.
const panGains = (pan) => {
  const angle = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(angle), Math.sin(angle)];
};
// Seeded noise, so the files come out the same on every run.
const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const peakOf = (...channels) => {
  let peak = 0;
  for (const channel of channels)
    for (const v of channel) peak = Math.max(peak, Math.abs(v));
  return peak;
};
const rmsDb = (channel) => {
  let sum = 0;
  for (const v of channel) sum += v * v;
  return 20 * Math.log10(Math.sqrt(sum / channel.length) + 1e-9);
};

const writeWav = (file, left, right) => {
  const frames = left.length;
  const buffer = Buffer.alloc(44 + frames * 4);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + frames * 4, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(SR, 24);
  buffer.writeUInt32LE(SR * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, left[i])) * 32767),
      44 + i * 4,
    );
    buffer.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, right[i])) * 32767),
      46 + i * 4,
    );
  }
  writeFileSync(file, buffer);
};

// --- music -----------------------------------------------------------------------

const BPM = 120;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;

const CHORDS = {
  Bm9: { bass: 47, pad: [62, 66, 69, 73] },
  Gmaj9: { bass: 43, pad: [59, 62, 66, 69] },
  Dmaj9: { bass: 50, pad: [66, 69, 73, 76] },
  A: { bass: 45, pad: [61, 64, 69, 71] },
};
// Two bars a chord. The opening circles without settling; the logo arrives on the home
// chord and the loop from there ends on A, which resolves home again as the CTA starts.
const INTRO = ["Bm9", "Gmaj9", "Bm9", "A"];
const MAIN = ["Dmaj9", "A", "Bm9", "Gmaj9"];

const sceneStart = Object.fromEntries(SCENES.map((s) => [s.id, s.start]));
const logoBar = Math.round(sceneStart.logoReveal / BAR);
const ctaBar = Math.round(sceneStart.cta / BAR);
const totalBars = Math.ceil(DURATION_SECONDS / BAR);

const chordNameAt = (bar) =>
  bar >= ctaBar
    ? "Dmaj9"
    : bar < logoBar
      ? INTRO[Math.floor(bar / 2) % INTRO.length]
      : MAIN[Math.floor((bar - logoBar) / 2) % MAIN.length];
const chordAt = (seconds) =>
  CHORDS[chordNameAt(Math.min(totalBars - 1, Math.floor(seconds / BAR)))];

// Runs of bars that share a chord.
const segments = [];
for (let bar = 0; bar < totalBars; bar++) {
  const name = chordNameAt(bar);
  const last = segments[segments.length - 1];
  if (last && last.name === name) last.end = (bar + 1) * BAR;
  else segments.push({ name, start: bar * BAR, end: (bar + 1) * BAR });
}

// How loud each layer is in each scene: quiet and open at the start, a pulse through
// the demo, and back to the pad for the close.
const LEVELS = {
  hook: { pad: 0.7, bass: 0.5, arp: 0, drums: 0 },
  problem: { pad: 0.8, bass: 0.6, arp: 0.3, drums: 0 },
  logoReveal: { pad: 1, bass: 0.8, arp: 0.55, drums: 0 },
  demo: { pad: 0.9, bass: 0.9, arp: 0.8, drums: 0.8 },
  offline: { pad: 1, bass: 0.8, arp: 0.4, drums: 0.3 },
  local: { pad: 1, bass: 0.8, arp: 0.4, drums: 0 },
  cta: { pad: 1, bass: 0.9, arp: 0.6, drums: 0 },
};
const BLEND_SECONDS = 0.8;
const levelAt = (layer, seconds) => {
  let index = 0;
  while (index + 1 < SCENES.length && SCENES[index + 1].start <= seconds)
    index++;
  const now = LEVELS[SCENES[index].id][layer];
  if (index === 0) return now;
  const before = LEVELS[SCENES[index - 1].id][layer];
  return (
    before +
    (now - before) * smoothstep((seconds - SCENES[index].start) / BLEND_SECONDS)
  );
};

const makeMusic = () => {
  const length = samples(DURATION_SECONDS);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const random = makeRandom(7);

  // Pad: each chord note is two slightly detuned voices, one towards each speaker.
  const PAD_HARMONICS = [1, 2, 3, 4, 5, 6].map((n) => ({
    n,
    amp: Math.exp(-(n - 1) / 2.2) / n,
  }));
  const PAD_ATTACK = 0.9;
  const PAD_RELEASE = 1.4;
  for (const segment of segments) {
    const from = samples(Math.max(0, segment.start - 0.2));
    const to = Math.min(length, samples(segment.end + PAD_RELEASE));
    CHORDS[segment.name].pad.forEach((note, voice) => {
      for (const side of [-1, 1]) {
        const hz = midiHz(note) * 2 ** ((side * 7) / 1200);
        const [gl, gr] = panGains(side * 0.85);
        const drift = random() * TAU;
        const offset = random() * TAU;
        for (let i = from; i < to; i++) {
          const t = i / SR;
          const envelope =
            smoothstep((t - (segment.start - 0.2)) / PAD_ATTACK) *
            (1 - smoothstep((t - segment.end) / PAD_RELEASE));
          const phase = TAU * hz * t + offset;
          let wave = 0;
          for (const { n, amp } of PAD_HARMONICS)
            wave += amp * Math.sin(phase * n);
          const sway = 1 + 0.18 * Math.sin(TAU * 0.17 * t + drift + voice);
          const value = wave * envelope * sway * levelAt("pad", t) * 0.085;
          left[i] += value * gl;
          right[i] += value * gr;
        }
      }
    });
  }

  // Bass: the root, in the middle, breathing with the kick once the drums are in.
  for (const segment of segments) {
    const hz = midiHz(CHORDS[segment.name].bass);
    const from = samples(segment.start);
    const to = Math.min(length, samples(segment.end + 0.3));
    for (let i = from; i < to; i++) {
      const t = i / SR;
      const envelope =
        smoothstep((t - segment.start) / 0.08) *
        (1 - smoothstep((t - segment.end) / 0.3));
      const phase = TAU * hz * t;
      const wave =
        Math.sin(phase) + 0.3 * Math.sin(phase * 2) + 0.1 * Math.sin(phase * 3);
      const pump = 1 - 0.7 * levelAt("drums", t) * Math.exp(-(t % BEAT) * 8);
      const value = wave * envelope * pump * levelAt("bass", t) * 0.2;
      left[i] += value;
      right[i] += value;
    }
  }

  // Arp: eighth-note plucks through the chord an octave up. The dry notes sit in the
  // middle and their echoes bounce between the speakers.
  const arp = new Float32Array(length);
  const ARP_PATTERN = [0, 2, 1, 3, 2, 1, 3, 2];
  const eighth = BEAT / 2;
  for (let step = 0; step * eighth < DURATION_SECONDS; step++) {
    const at = step * eighth;
    const gain = levelAt("arp", at);
    if (gain <= 0.001) continue;
    const hz = midiHz(
      chordAt(at).pad[ARP_PATTERN[step % ARP_PATTERN.length]] + 12,
    );
    const accent = step % 2 === 0 ? 1 : 0.65;
    const from = samples(at);
    const to = Math.min(length, from + samples(0.7));
    for (let i = from; i < to; i++) {
      const t = (i - from) / SR;
      const phase = TAU * hz * t;
      const wave =
        Math.sin(phase) +
        0.4 * Math.sin(phase * 2) +
        0.15 * Math.sin(phase * 3);
      arp[i] +=
        wave * Math.min(1, t / 0.004) * Math.exp(-t * 8) * gain * accent * 0.11;
    }
  }
  const echo = samples(BEAT * 0.75);
  const echoLeft = new Float32Array(length);
  const echoRight = new Float32Array(length);
  for (let i = echo; i < length; i++) {
    echoLeft[i] = arp[i - echo] + 0.45 * echoRight[i - echo];
    echoRight[i] = 0.45 * echoLeft[i - echo];
  }
  for (let i = 0; i < length; i++) {
    left[i] += arp[i] * 0.7 + echoLeft[i] * 0.6;
    right[i] += arp[i] * 0.7 + echoRight[i] * 0.6;
  }

  // Drums: a soft kick on every beat and a quiet tick between them.
  for (let beat = 0; beat * BEAT < DURATION_SECONDS; beat++) {
    const at = beat * BEAT;
    const gain = levelAt("drums", at);
    if (gain <= 0.001) continue;
    const kickFrom = samples(at);
    const kickTo = Math.min(length, kickFrom + samples(0.32));
    let phase = 0;
    for (let i = kickFrom; i < kickTo; i++) {
      const t = (i - kickFrom) / SR;
      phase += (TAU * (46 + 80 * Math.exp(-t * 32))) / SR;
      const value = Math.sin(phase) * Math.exp(-t * 10) * gain * 0.42;
      left[i] += value;
      right[i] += value;
    }
    const hatFrom = samples(at + eighth);
    const hatTo = Math.min(length, hatFrom + samples(0.06));
    const [gl, gr] = panGains(beat % 2 === 0 ? -0.5 : 0.5);
    let previous = 0;
    for (let i = hatFrom; i < hatTo; i++) {
      const t = (i - hatFrom) / SR;
      const noise = random() * 2 - 1;
      const value = (noise - previous) * Math.exp(-t * 70) * gain * 0.05;
      previous = noise;
      left[i] += value * gl;
      right[i] += value * gr;
    }
  }

  // Fade in and out, then bring the peak to a fixed level.
  for (let i = 0; i < length; i++) {
    const t = i / SR;
    const fade =
      smoothstep(t / 0.4) *
      (1 - smoothstep((t - (DURATION_SECONDS - 2)) / 1.9));
    left[i] *= fade;
    right[i] *= fade;
  }
  const scale = 0.8 / peakOf(left, right);
  const mid = new Float32Array(length);
  const side = new Float32Array(length);
  const sideFlipped = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    mid[i] = ((left[i] + right[i]) / 2) * scale;
    side[i] = ((left[i] - right[i]) / 2) * scale * SIDE_FILE_GAIN;
    sideFlipped[i] = -side[i];
  }
  return { mid, side, sideFlipped };
};

// --- sound effects ---------------------------------------------------------------

// A mono sound placed between the speakers. `pan` may be a function of 0..1 progress.
const place = (mono, pan, level) => {
  const scale = level / (peakOf(mono) || 1);
  const left = new Float32Array(mono.length);
  const right = new Float32Array(mono.length);
  for (let i = 0; i < mono.length; i++) {
    const [gl, gr] = panGains(
      typeof pan === "function" ? pan(i / mono.length) : pan,
    );
    left[i] = mono[i] * scale * gl;
    right[i] = mono[i] * scale * gr;
  }
  return { left, right };
};
const render = (seconds, fn) => {
  const out = new Float32Array(samples(seconds));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR, i);
  // A few milliseconds of fade at each end, so nothing clicks.
  const edge = samples(0.004);
  for (let i = 0; i < edge && i < out.length; i++) {
    out[i] *= i / edge;
    out[out.length - 1 - i] *= i / edge;
  }
  return out;
};
const mix = (seconds, parts) => {
  const left = new Float32Array(samples(seconds));
  const right = new Float32Array(samples(seconds));
  for (const { at, sound } of parts) {
    const from = samples(at);
    for (let i = 0; i < sound.left.length && from + i < left.length; i++) {
      left[from + i] += sound.left[i];
      right[from + i] += sound.right[i];
    }
  }
  return { left, right };
};

// A bell: a few partials that die away at different speeds.
const bell = (hz, seconds) =>
  render(seconds, (t) =>
    [
      [1, 1, 3],
      [2, 0.45, 4.5],
      [3.01, 0.22, 6],
      [4.2, 0.1, 8],
      [5.4, 0.05, 11],
    ].reduce(
      (sum, [ratio, amp, decay]) =>
        sum + amp * Math.sin(TAU * hz * ratio * t) * Math.exp(-decay * t),
      0,
    ),
  );

// Noise through a band-pass filter whose centre sweeps from one pitch to another.
const sweep = (seconds, fromHz, toHz, seed) => {
  const random = makeRandom(seed);
  let low = 0;
  let band = 0;
  return render(seconds, (t) => {
    const x = t / seconds;
    const f = 2 * Math.sin((Math.PI * fromHz * (toHz / fromHz) ** x) / SR);
    low += f * band;
    const high = random() * 2 - 1 - low - 0.7 * band;
    band += f * high;
    return band * Math.sin(Math.PI * x) ** 2;
  });
};

const tickSound = (hz, seed) => {
  const random = makeRandom(seed);
  return render(
    0.05,
    (t) =>
      Math.sin(TAU * hz * t) * Math.exp(-t * 200) +
      (random() * 2 - 1) * 0.3 * Math.exp(-t * 500),
  );
};

const makeEffects = () => {
  const random = makeRandom(11);
  // Most of what makes a sound is in the right half of the frame, where the app is, so
  // those effects sit a little to the right. The headset rings from the left.
  const APP = 0.35;

  return {
    // A phone ringing: two notes of the home chord, trembling.
    ring: place(
      render(0.9, (t) => {
        const tremble = 0.55 + 0.45 * Math.sin(TAU * 21 * t);
        const shape =
          smoothstep(t / 0.04) * (1 - smoothstep((t - 0.75) / 0.15));
        return (
          (Math.sin(TAU * 880 * t) + 0.6 * Math.sin(TAU * 1108.73 * t)) *
          tremble *
          shape
        );
      }),
      -0.6,
      0.3,
    ),
    // A scene sliding in from the right: air moving right to left.
    "whoosh-left": place(sweep(0.6, 500, 2600, 3), (x) => 0.75 - 1.5 * x, 0.32),
    // A scene sliding up from below.
    "whoosh-up": place(sweep(0.6, 350, 3200, 4), 0, 0.3),
    tick: place(tickSound(2200, 5), APP, 0.22),
    // A drop: a file landing, a badge appearing.
    pop: place(
      render(0.13, (t) => {
        const hz = 380 + 420 * Math.exp(-t * 40);
        return Math.sin(TAU * hz * t) * Math.exp(-t * 32);
      }),
      APP,
      0.34,
    ),
    // A line of the transcript typing in.
    type: mix(
      0.6,
      new Array(10).fill(0).map((_, i) => ({
        at: i * 0.05 + random() * 0.025,
        sound: place(
          tickSound(1800 + random() * 800, 20 + i),
          APP,
          0.1 + random() * 0.08,
        ),
      })),
    ),
    // A check failing: a falling minor third.
    flag: place(
      render(0.42, (t) => {
        const second = t >= 0.15;
        const local = second ? t - 0.15 : t;
        const phase = TAU * (second ? 277.18 : 329.63) * local;
        return (
          (Math.sin(phase) + 0.25 * Math.sin(phase * 3)) *
          Math.min(1, local / 0.006) *
          Math.exp(-local * 9)
        );
      }),
      APP,
      0.34,
    ),
    // The logo's dot landing.
    chime: mix(1.8, [
      { at: 0, sound: place(bell(880, 1.7), -0.3, 0.26) },
      { at: 0.09, sound: place(bell(1174.66, 1.7), 0.3, 0.26) },
    ]),
    // The wifi switching off: a pitch falling away.
    "power-down": place(
      render(0.5, (t) => {
        const hz = 220 + 440 * Math.exp(-t * 7);
        return Math.sin(TAU * hz * t) * (1 - t / 0.5) ** 2;
      }),
      0.4,
      0.32,
    ),
    // The score settling.
    land: place(
      render(
        0.4,
        (t) =>
          Math.sin(TAU * 92 * t) * Math.exp(-t * 13) +
          0.25 * Math.sin(TAU * 1500 * t) * Math.exp(-t * 180),
      ),
      APP,
      0.5,
    ),
    // The closing card: the home chord, spread from left to right.
    resolve: mix(
      2.6,
      [
        [587.33, -0.5],
        [880, -0.15],
        [1174.66, 0.15],
        [1479.98, 0.5],
      ].map(([hz, pan], i) => ({
        at: i * 0.1,
        sound: place(bell(hz, 2.2), pan, 0.2),
      })),
    ),
  };
};

// --- write -----------------------------------------------------------------------

const encodeMp3 = (name, left, right) => {
  const wav = path.join(outDir, `${name}.wav`);
  writeWav(wav, left, right);
  execFileSync(
    "npx",
    [
      "remotion",
      "ffmpeg",
      "-y",
      "-i",
      wav,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      path.join(outDir, `${name}.mp3`),
    ],
    { cwd: root, stdio: "ignore" },
  );
  rmSync(wav);
};

const music = makeMusic();
encodeMp3("music-mid", music.mid, music.mid);
encodeMp3("music-side", music.side, music.sideFlipped);
console.log(
  `music: mid ${rmsDb(music.mid).toFixed(1)} dB, side ${(rmsDb(music.side) - 20 * Math.log10(SIDE_FILE_GAIN)).toFixed(1)} dB, ` +
    `peaks ${peakOf(music.mid).toFixed(2)} / ${peakOf(music.side).toFixed(2)} (side stored x${SIDE_FILE_GAIN})`,
);

for (const [name, sound] of Object.entries(makeEffects())) {
  writeWav(path.join(outDir, `${name}.wav`), sound.left, sound.right);
  console.log(
    `${name}: ${(sound.left.length / SR).toFixed(2)}s, peak ${peakOf(sound.left, sound.right).toFixed(2)}`,
  );
}
