import React from "react";
import { Audio, staticFile, useVideoConfig } from "remotion";
import { musicMidVolume, musicSideVolume } from "../mix";

// The background music as its two stems, each following the voiceover (src/mix.ts).
export const Soundtrack: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <>
      <Audio
        src={staticFile("audio/music-mid.mp3")}
        volume={(frame) => musicMidVolume(frame / fps)}
      />
      <Audio
        src={staticFile("audio/music-side.mp3")}
        volume={(frame) => musicSideVolume(frame / fps)}
      />
    </>
  );
};
