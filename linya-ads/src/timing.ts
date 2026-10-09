// Every timing in the video, in seconds. Frames are always derived from these with the
// composition's fps, so nothing here needs to change if the frame rate does.

export const FPS = 60;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION_SECONDS = 60;

// Scenes cross over for this long, centred on the start time of the incoming scene.
export const TRANSITION_SECONDS = 0.5;

// When each scene starts, in seconds of the finished video. The last scene (the CTA)
// runs to DURATION_SECONDS, so a shorter voiceover just leaves it on screen for longer.
export const SCENES = [
  { id: "hook", start: 0 },
  { id: "problem", start: 6 },
  { id: "logoReveal", start: 16 },
  { id: "upload", start: 20 },
  { id: "transcribe", start: 26 },
  { id: "score", start: 34 },
  { id: "whyLocal", start: 42 },
  { id: "cta", start: 54 },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

// Moments inside a scene that should land on a line of the voiceover, also in seconds
// of the finished video.
export const CUES = {
  // Problem: the headline moves from "too many calls" to "sensitive data".
  problemPrivacy: 11,
  // Why local: the wifi icon switches off.
  wifiOff: 43.2,
  // Why local: one statement per beat.
  whyLocalBeats: [42.4, 46.4, 50.4],
} as const;

export const toFrames = (seconds: number, fps: number) =>
  Math.round(seconds * fps);

const sceneIndex = (id: SceneId) => SCENES.findIndex((s) => s.id === id);

export const sceneStart = (id: SceneId): number => SCENES[sceneIndex(id)].start;

export const sceneEnd = (id: SceneId): number =>
  SCENES[sceneIndex(id) + 1]?.start ?? DURATION_SECONDS;

export const transitionFrames = (fps: number) =>
  toFrames(TRANSITION_SECONDS, fps);

// A scene is mounted half a transition before its start time, while it is still coming in.
export const sceneLeadInFrames = (id: SceneId, fps: number) =>
  sceneIndex(id) === 0 ? 0 : Math.floor(transitionFrames(fps) / 2);

// Length of a scene inside the transition series: its own time plus the halves of the
// transitions it shares with its neighbours. The lengths minus the overlaps add up to
// exactly DURATION_SECONDS * fps.
export const sceneDurationInFrames = (id: SceneId, fps: number) => {
  const isLast = sceneIndex(id) === SCENES.length - 1;
  const leadOut = isLast ? 0 : Math.ceil(transitionFrames(fps) / 2);
  return (
    toFrames(sceneEnd(id), fps) -
    toFrames(sceneStart(id), fps) +
    sceneLeadInFrames(id, fps) +
    leadOut
  );
};
