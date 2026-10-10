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
  { id: "problem", start: 3.2 },
  { id: "logoReveal", start: 9.6 },
  { id: "demo", start: 12 },
  { id: "offline", start: 44 },
  { id: "local", start: 48 },
  { id: "cta", start: 53.5 },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

// Moments inside a scene that should land on a line of the voiceover, also in seconds
// of the finished video.
export const CUES = {
  // Problem: three beats. Too many calls to hear; the one that breaks a rule is
  // missed; and cloud AI would mean uploading the audio.
  problemMissed: 5.4,
  problemPrivacy: 7.5,

  // Demo: when each part of the recorded walk-through starts. The footage is cut to
  // fit; waiting is sped up to fill the time given here.
  // The queue row works through the call (sped up).
  demoProcess: 13.5,
  // The scored call is opened (sped up).
  demoOpen: 16,
  // Playback starts and the transcript follows the audio. One unbroken stretch at
  // real speed from here to demoRedact.
  demoTranscript: 17,
  // The score and status.
  demoScore: 21.4,
  // The failed checks and their quoted evidence.
  demoEvidence: 23.8,
  // The flag on the waveform is clicked (0.8 s after this) and playback jumps.
  demoFlag: 26.8,
  // The redacted card number in the transcript.
  demoRedact: 30,
  // A coaching note is generated.
  demoCoaching: 32,
  // Export PDF is clicked and the exported report is shown.
  demoExport: 34.2,
  // The rest of the app, a moment each: the scorecard editor, phone uploads, the
  // agent dashboard.
  demoScorecards: 39.4,
  demoPhones: 41,
  demoDashboard: 42.5,

  // Offline: the same upload with the internet blocked, sped up, ending on the calls
  // list at real speed.
  offlineProcess: 45,
  offlineList: 47,
  offlineHold: 47.7,
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
