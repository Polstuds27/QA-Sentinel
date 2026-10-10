import React from "react";
import { Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import { effectsVolume } from "../mix";
import type { Clock } from "./motion";

// The sound effects written by scripts/make-audio.mjs. Each has its place between the
// speakers built in: the app's sounds sit to the right, where the app is on screen.
export type SfxName =
  | "ring"
  | "whoosh-left"
  | "whoosh-up"
  | "tick"
  | "pop"
  | "type"
  | "flag"
  | "chime"
  | "power-down"
  | "land"
  | "resolve";

// Plays an effect at `at` seconds of the finished video. Inside a scene, pass the
// scene's clock; without one, `at` is read against the whole composition.
export const Sfx: React.FC<{
  clock?: Clock;
  at: number;
  name: SfxName;
  volume?: number;
}> = ({ clock, at, name, volume = 1 }) => {
  const { fps } = useVideoConfig();
  const from = Math.round(
    clock ? clock.lead + (at - clock.start) * fps : at * fps,
  );
  if (from < 0) return null;
  return (
    <Sequence from={from} layout="none" name={`Sfx: ${name}`}>
      <Audio
        src={staticFile(`audio/${name}.wav`)}
        volume={volume * effectsVolume(at)}
      />
    </Sequence>
  );
};
