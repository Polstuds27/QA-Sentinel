import React from "react";
import { PauseIcon, PlayIcon } from "lucide-react";
import { colors } from "../theme";
import { formatTime } from "../data/scoring";
import { type Envelope, Waveform } from "./Waveform";

const BUTTON = 52;
const TIME_WIDTH = 70;
const GAP = 22;

// How wide the waveform is inside a strip of this width; use it to size the envelope.
export const waveWidth = (stripWidth: number) =>
  stripWidth - BUTTON - 2 * TIME_WIDTH - 3 * GAP;

// The app's audio player (frontend/src/components/audio-player.tsx): the call drawn as
// a line between two hairlines, a cobalt dot for the playhead, and a destructive tick
// at each flagged moment.
export const PlayerStrip: React.FC<{
  width: number;
  height?: number;
  envelope: Envelope;
  duration: number;
  /** Seconds into the call. */
  current: number;
  playing: boolean;
  time: number;
  /** Flagged moments: seconds into the call, and how far in (0 to 1) the tick is drawn. */
  flags?: { seconds: number; shown: number }[];
}> = ({
  width,
  height = 76,
  envelope,
  duration,
  current,
  playing,
  time,
  flags = [],
}) => {
  const wave = waveWidth(width);
  const head = Math.min(1, current / duration);
  const Icon = playing ? PauseIcon : PlayIcon;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: GAP,
        width,
        padding: "14px 0",
        borderTop: `1px solid ${colors.border}`,
        borderBottom: `1px solid ${colors.border}`,
        fontSize: 22,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: BUTTON,
          height: BUTTON,
          flexShrink: 0,
          borderRadius: 9999,
          border: `1px solid ${colors.foreground}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon size={20} />
      </span>
      <span style={{ width: TIME_WIDTH, flexShrink: 0, textAlign: "right" }}>
        {formatTime(current)}
      </span>
      <div style={{ position: "relative", width: wave, height, flexShrink: 0 }}>
        <Waveform
          width={wave}
          height={height}
          envelope={envelope}
          head={head}
          time={time}
          live={playing}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: height / 2,
            height: 1,
            background: colors.border,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            width: head * wave,
            top: height / 2,
            height: 1,
            background: colors.foreground,
          }}
        />
        {flags.map((flag) => (
          <div
            key={flag.seconds}
            style={{
              position: "absolute",
              left: (flag.seconds / duration) * wave - 1,
              top: 0,
              width: 2,
              height,
              background: colors.destructive,
              transform: `scaleY(${flag.shown})`,
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            left: head * wave - 8,
            top: height / 2 - 8,
            width: 16,
            height: 16,
            borderRadius: 9999,
            background: colors.primary,
          }}
        />
      </div>
      <span
        style={{
          width: TIME_WIDTH,
          flexShrink: 0,
          color: colors.mutedForeground,
        }}
      >
        {formatTime(duration)}
      </span>
    </div>
  );
};
