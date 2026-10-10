import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { type SceneId, sceneLeadInFrames, sceneStart } from "../timing";

export interface Clock {
  /** Seconds of the finished video, so cues can be read straight off the voiceover. */
  t: number;
  fps: number;
  /** When this scene starts, in the same seconds. */
  start: number;
  /** Frames this scene is on screen before `start`, while it is still coming in. */
  lead: number;
}

export const useClock = (scene: SceneId): Clock => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = sceneStart(scene);
  const lead = sceneLeadInFrames(scene, fps);
  return { t: start + (frame - lead) / fps, fps, start, lead };
};

// 0 to 1 on a smooth spring with no bounce, starting at `at` seconds.
export const enter = (clock: Clock, at: number, duration = 0.8) =>
  spring({
    frame: (clock.t - at) * clock.fps,
    fps: clock.fps,
    config: { damping: 200 },
    durationInFrames: Math.round(duration * clock.fps),
  });

// The app's `animate-hang`: content settles up into place as it fades in.
export const Rise: React.FC<{
  clock: Clock;
  at: number;
  out?: number;
  distance?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ clock, at, out, distance = 28, style, children }) => {
  const shown = enter(clock, at);
  const gone = out === undefined ? 0 : enter(clock, out, 0.4);
  return (
    <div
      style={{
        opacity: shown * (1 - gone),
        transform: `translateY(${(1 - shown) * distance - gone * distance * 0.5}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
