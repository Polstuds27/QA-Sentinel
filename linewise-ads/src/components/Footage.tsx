import React from "react";
import {
  Easing,
  OffthreadVideo,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import { CAPTION_BAND, colors, PAD_X } from "../theme";
import { HEIGHT, WIDTH } from "../timing";
import { type Box, VIEW } from "../data/footage";
import { type Clock, enter } from "./motion";

// The window the footage is shown in.
export const FRAME_TOP = 176;
export const FRAME_WIDTH = WIDTH - 2 * PAD_X;
export const FRAME_HEIGHT = HEIGHT - CAPTION_BAND - FRAME_TOP;

/** A stretch of footage: from `from` (video seconds) it plays from `srcFrom` (footage
 *  seconds) at `rate`, until the next shot starts. */
export interface Shot {
  from: number;
  srcFrom: number;
  rate?: number;
}

/** The part of the app's window in view: its left, top and width in the app's own
 *  pixels. The height follows from the frame's shape. */
export interface View {
  x: number;
  y: number;
  width: number;
}

/** At `at` the camera starts moving to `to`, or jumps there if `cut`. */
export interface CameraMove {
  at: number;
  to: View;
  cut?: boolean;
}

/** An outline drawn over the footage to point at something. Not part of the app. */
export interface Outline {
  from: number;
  until: number;
  box: Box;
}

/** A ring where the recording clicked: the recorded browser has no cursor to show. */
export interface ClickRing {
  at: number;
  x: number;
  y: number;
}

const MOVE_SECONDS = 0.9;
const ease = Easing.inOut(Easing.cubic);

const viewAt = (moves: CameraMove[], t: number): View => {
  let view = moves[0].to;
  for (const move of moves.slice(1)) {
    if (t < move.at) break;
    const p = move.cut ? 1 : ease(Math.min(1, (t - move.at) / MOVE_SECONDS));
    view = {
      x: view.x + (move.to.x - view.x) * p,
      y: view.y + (move.to.y - view.y) * p,
      width: view.width + (move.to.width - view.width) * p,
    };
  }
  return view;
};

/** A view `width` wide that shows `box`, with `above` pixels of room over it. */
export const viewOf = (box: Box, width: number, above = 40): View => {
  const height = (width * FRAME_HEIGHT) / FRAME_WIDTH;
  return {
    x: Math.min(
      VIEW.width - width,
      Math.max(0, box.x + box.width / 2 - width / 2),
    ),
    y: Math.min(VIEW.height - height, Math.max(0, box.y - above)),
    width,
  };
};

// Real footage of the app in a frame, with a camera that pans and zooms over it. The
// footage itself is never altered: shots only choose which part plays and how fast,
// and the outlines and click rings are drawn on top.
export const Footage: React.FC<{
  clock: Clock;
  file: string;
  shots: Shot[];
  camera: CameraMove[];
  outlines?: Outline[];
  clicks?: ClickRing[];
  /** Drawn over the footage, in the frame's own pixels. */
  children?: React.ReactNode;
}> = ({ clock, file, shots, camera, outlines = [], clicks = [], children }) => {
  const { fps } = useVideoConfig();
  const view = viewAt(camera, clock.t);
  const scale = FRAME_WIDTH / view.width;
  const frameOf = (seconds: number) =>
    Math.round(clock.lead + (seconds - clock.start) * fps);

  return (
    <div
      style={{
        position: "absolute",
        left: PAD_X,
        top: FRAME_TOP,
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        boxSizing: "border-box",
        border: `1px solid ${colors.border}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: VIEW.width,
          height: VIEW.height,
          transformOrigin: "0 0",
          transform: `scale(${scale}) translate(${-view.x}px, ${-view.y}px)`,
        }}
      >
        {shots.map((shot, i) => {
          const rate = shot.rate ?? 1;
          // The first shot also covers the moments the scene is still arriving.
          const from = i === 0 ? 0 : frameOf(shot.from);
          const early = i === 0 ? (frameOf(shot.from) / fps) * rate : 0;
          const next = shots[i + 1];
          return (
            <Sequence
              key={i}
              from={from}
              durationInFrames={next ? frameOf(next.from) - from : undefined}
              layout="none"
            >
              <OffthreadVideo
                src={staticFile(file)}
                trimBefore={Math.round(Math.max(0, shot.srcFrom - early) * fps)}
                playbackRate={rate}
                muted
                style={{
                  position: "absolute",
                  width: VIEW.width,
                  height: VIEW.height,
                }}
              />
            </Sequence>
          );
        })}
        {outlines.map((outline, i) => {
          const shown =
            enter(clock, outline.from, 0.4) - enter(clock, outline.until, 0.4);
          const pad = 8;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: outline.box.x - pad,
                top: outline.box.y - pad,
                width: outline.box.width + 2 * pad,
                height: outline.box.height + 2 * pad,
                boxSizing: "border-box",
                border: `${3 / scale}px solid ${colors.primary}`,
                opacity: shown,
              }}
            />
          );
        })}
        {clicks.map((click, i) => {
          const p = (clock.t - click.at) / 0.6;
          if (p < 0 || p > 1) return null;
          const radius = 10 + 34 * ease(p);
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: click.x - radius,
                top: click.y - radius,
                width: radius * 2,
                height: radius * 2,
                boxSizing: "border-box",
                borderRadius: 9999,
                border: `${4 / scale}px solid ${colors.primary}`,
                opacity: 1 - p,
              }}
            />
          );
        })}
      </div>
      {children}
    </div>
  );
};

// The line over the frame: what the app is doing on the left, and on the right what
// kind of footage this is.
export const FootageCaption: React.FC<{
  clock: Clock;
  labels: string[];
  icon?: React.ReactNode;
  children: React.ReactNode;
}> = ({ labels, icon, children }) => (
  <div
    style={{
      position: "absolute",
      left: PAD_X,
      top: 0,
      width: FRAME_WIDTH,
      height: FRAME_TOP,
    }}
  >
    <div style={{ position: "absolute", left: 0, bottom: 34, right: 420 }}>
      {children}
    </div>
    <div
      style={{
        position: "absolute",
        right: 0,
        bottom: 34,
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontSize: 24,
        fontWeight: 500,
        lineHeight: 1.2,
        color: colors.mutedForeground,
        textAlign: "right",
      }}
    >
      <span>
        {labels.map((label) => (
          <span key={label} style={{ display: "block" }}>
            {label}
          </span>
        ))}
      </span>
      {icon}
    </div>
  </div>
);
