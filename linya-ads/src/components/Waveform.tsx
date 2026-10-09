import React from "react";
import { random } from "remotion";
import { colors } from "../theme";

const BAR = 6;
const GAP = 6;

export interface Envelope {
  /** Loudness per bar, 0 to 1: the agent, drawn above the line. */
  up: number[];
  /** The customer, drawn below the line. */
  down: number[];
}

export const barCount = (width: number, bar = BAR, gap = GAP) =>
  Math.max(1, Math.floor((width + gap) / (bar + gap)));

// A scripted call as two loudness tracks. Each speaker is loud while their line runs
// and silent while the other one talks, like the app's stereo sample recordings.
export const callEnvelope = (
  lines: { seconds: number; speaker: "Agent" | "Customer" }[],
  duration: number,
  count: number,
): Envelope => {
  const up: number[] = [];
  const down: number[] = [];
  for (let i = 0; i < count; i++) {
    const time = ((i + 0.5) / count) * duration;
    let index = 0;
    while (index + 1 < lines.length && lines[index + 1].seconds <= time)
      index++;
    const line = lines[index];
    const next = lines[index + 1]?.seconds ?? duration;
    const into = (time - line.seconds) / Math.max(0.001, next - line.seconds);
    const loud =
      into < 0.8
        ? (0.3 + 0.7 * random(`call-${i}`)) *
          (0.55 + 0.45 * Math.sin(into * 3.9))
        : 0;
    up.push(line.speaker === "Agent" ? loud : 0);
    down.push(line.speaker === "Customer" ? loud : 0);
  }
  return { up, down };
};

// Two voices trading turns, for waveforms that stand for a call in general.
export const noiseEnvelope = (count: number, seed: string): Envelope => {
  const up: number[] = [];
  const down: number[] = [];
  const turn = 6 + Math.floor(random(`${seed}-turn`) * 8);
  for (let i = 0; i < count; i++) {
    const agent = Math.floor(i / turn) % 2 === 0;
    const loud = 0.2 + 0.8 * random(`${seed}-${i}`);
    const quiet = 0.08 * random(`${seed}-q-${i}`);
    up.push(agent ? loud : quiet);
    down.push(agent ? quiet : loud);
  }
  return { up, down };
};

// The app's waveform (frontend/src/components/waveform.tsx): square bars on a line,
// played bars in the foreground colour, and the bars at the playhead cobalt and moving
// with the voice.
export const Waveform: React.FC<{
  width: number;
  height: number;
  envelope: Envelope;
  /** Playhead, 0 to 1 along the call. Leave out for a waveform that is not playing. */
  head?: number;
  /** Seconds; drives the movement at the playhead. */
  time?: number;
  live?: boolean;
  /** Bars past this point (0 to 1) are not drawn yet. */
  reveal?: number;
  bar?: number;
  gap?: number;
}> = ({
  width,
  height,
  envelope,
  head,
  time = 0,
  live = false,
  reveal = 1,
  bar = BAR,
  gap = GAP,
}) => {
  const count = envelope.up.length;
  const pitch = bar + gap;
  const offset = (width - (count * pitch - gap)) / 2;
  const reach = height / 2 - 1;
  const headBar = head === undefined ? -1 : head * count;

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      {envelope.up.map((_, i) => {
        const shown = Math.min(1, Math.max(0, (reveal * count - i) / 3));
        if (shown === 0) return null;
        const near =
          head === undefined
            ? 0
            : Math.exp(-Math.pow((i + 0.5 - headBar) / 4, 2));
        const wobble = 0.55 + 0.45 * Math.sin(time * 11 + i * 1.9);
        const lift = live ? near * wobble * 0.5 : 0;
        const up = Math.min(
          1,
          envelope.up[i] * 0.8 + lift * (0.25 + envelope.up[i]),
        );
        const down = Math.min(
          1,
          envelope.down[i] * 0.8 + lift * (0.25 + envelope.down[i]),
        );
        const isLive = live && near > 0.2;
        const played = i + 0.5 <= headBar;
        const top = Math.max(1, up * reach) * shown;
        const bottom = Math.max(1, down * reach) * shown;
        return (
          <rect
            key={i}
            x={offset + i * pitch}
            y={height / 2 - top}
            width={bar}
            height={top + bottom}
            fill={
              isLive
                ? colors.primary
                : played
                  ? colors.foreground
                  : colors.mutedForeground
            }
            opacity={isLive || played ? 1 : 0.4}
          />
        );
      })}
    </svg>
  );
};
