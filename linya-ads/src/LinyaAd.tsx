import React from "react";
import { AbsoluteFill, Audio, staticFile, useVideoConfig } from "remotion";
import { springTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { colors } from "./theme";
import {
  sceneDurationInFrames,
  type SceneId,
  sceneStart,
  TRANSITION_SECONDS,
  transitionFrames,
} from "./timing";
import { Captions } from "./components/Captions";
import { Sfx } from "./components/Sfx";
import { Soundtrack } from "./components/Soundtrack";
import { Cta } from "./scenes/Cta";
import { Hook } from "./scenes/Hook";
import { LogoReveal } from "./scenes/LogoReveal";
import { Problem } from "./scenes/Problem";
import { Score } from "./scenes/Score";
import { Transcribe } from "./scenes/Transcribe";
import { Upload } from "./scenes/Upload";
import { WhyLocal } from "./scenes/WhyLocal";
import { transcript } from "./transcript";

// Each scene, and how it arrives. The three how-it-works steps fade into each other so
// the app frame holds still while its contents change.
const SCENES: {
  id: SceneId;
  component: React.FC;
  enters?: "fade" | "slide-left" | "slide-up";
}[] = [
  { id: "hook", component: Hook },
  { id: "problem", component: Problem, enters: "slide-left" },
  { id: "logoReveal", component: LogoReveal, enters: "fade" },
  { id: "upload", component: Upload, enters: "slide-up" },
  { id: "transcribe", component: Transcribe, enters: "fade" },
  { id: "score", component: Score, enters: "fade" },
  { id: "whyLocal", component: WhyLocal, enters: "slide-left" },
  { id: "cta", component: Cta, enters: "fade" },
];

const presentation = (enters: "fade" | "slide-left" | "slide-up") =>
  enters === "fade"
    ? fade()
    : slide({
        direction: enters === "slide-left" ? "from-right" : "from-bottom",
      });

export const LinyaAd: React.FC = () => {
  const { fps } = useVideoConfig();
  const timing = springTiming({
    config: { damping: 200 },
    durationInFrames: transitionFrames(fps),
  });

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background }}>
      {transcript.audioFile ? (
        <Audio src={staticFile(transcript.audioFile)} />
      ) : null}
      <TransitionSeries>
        {SCENES.map(({ id, component: Scene, enters }) => (
          <React.Fragment key={id}>
            {enters ? (
              <TransitionSeries.Transition
                presentation={presentation(enters)}
                timing={timing}
              />
            ) : null}
            <TransitionSeries.Sequence
              durationInFrames={sceneDurationInFrames(id, fps)}
            >
              <Scene />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
      </TransitionSeries>
      <Soundtrack />
      {SCENES.map(({ id, enters }) =>
        enters === "slide-left" || enters === "slide-up" ? (
          <Sfx
            key={id}
            at={sceneStart(id) - TRANSITION_SECONDS / 2}
            name={enters === "slide-left" ? "whoosh-left" : "whoosh-up"}
          />
        ) : null,
      )}
      <Captions captions={transcript.captions} />
    </AbsoluteFill>
  );
};
