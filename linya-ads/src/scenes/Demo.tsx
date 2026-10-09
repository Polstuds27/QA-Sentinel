import React from "react";
import { Img, interpolate, staticFile } from "remotion";
import { CUES, sceneStart } from "../timing";
import {
  type Box,
  boxOf,
  clickOn,
  eventAt,
  footage,
  scoreAndStatus,
  statusAt,
  union,
  VIEW,
} from "../data/footage";
import {
  type CameraMove,
  type ClickRing,
  Footage,
  FootageCaption,
  FRAME_HEIGHT,
  type Outline,
  type Shot,
  viewOf,
} from "../components/Footage";
import { Headline } from "../components/Headline";
import { enter, useClock } from "../components/motion";
import { Sfx } from "../components/Sfx";
import { Wall } from "../components/Wall";

// What the app is doing at each step, said in one line. `from` is a cue in timing.ts.
const CALLOUTS: { from: number; text: string }[] = [
  { from: sceneStart("demo"), text: "Drop in a call recording." },
  { from: CUES.demoProcess, text: "Transcribed and scored on this laptop." },
  {
    from: CUES.demoTranscript,
    text: "Whisper writes the transcript, word by word.",
  },
  { from: CUES.demoScore, text: "Local AI checks it against the scorecard." },
  { from: CUES.demoEvidence, text: "Every verdict quotes its evidence." },
  { from: CUES.demoFlag, text: "Click a flag to hear that moment." },
  { from: CUES.demoRedact, text: "Card numbers are redacted automatically." },
  { from: CUES.demoCoaching, text: "The local model writes a coaching note." },
  { from: CUES.demoExport, text: "Export the redacted report as a PDF." },
  {
    from: CUES.demoScorecards,
    text: "Edit the scorecard to match your rules.",
  },
  {
    from: CUES.demoPhones,
    text: "Phones on the same Wi-Fi can send recordings.",
  },
  {
    from: CUES.demoDashboard,
    text: "Each agent's average and most-missed checks.",
  },
];

// The flag is clicked this long after its cue, so the callout is up first.
const FLAG_CLICK_AFTER = 0.8;
// The exported report comes up this long after Export PDF is clicked, then moves
// slowly up so more of the page is read, and leaves before the next screen.
const REPORT_AFTER = 0.4;
const REPORT_WIDTH = 900;
const REPORT_TRAVEL = 330;

const rec = footage.online;
const begins = sceneStart("demo");

// ----- where things are in the recording (footage seconds) -------------------------
const transcribe = clickOn(rec, "Transcribe");
const callRow = clickOn(rec, "the scored call");
const play = clickOn(rec, "Play");
const flag = clickOn(rec, "Jump to");
const generate = clickOn(rec, "Generate note");
const exportPdf = clickOn(rec, "Export PDF");
const editScorecard = clickOn(rec, "Edit scorecard");
const opened = eventAt(rec, "call-open");
const detail = eventAt(rec, "detail");
const scrolled = eventAt(rec, "scorecard");
const coaching = eventAt(rec, "coaching");
const phones = eventAt(rec, "phones");
const dashboard = eventAt(rec, "dashboard");

const dropFrom = eventAt(rec, "upload-area").at - 0.3;
const processFrom = transcribe.at + 0.15;
const openFrom = statusAt(rec, "done") + 0.4;
// From here the recording plays at its real speed, placed so the flag is clicked just
// after its cue.
const playFrom =
  flag.at - (CUES.demoFlag + FLAG_CLICK_AFTER - CUES.demoTranscript);

const sped = (from: number, to: number, srcFrom: number, srcTo: number) => ({
  from,
  srcFrom,
  rate: (srcTo - srcFrom) / (to - from),
});
const SHOTS: Shot[] = [
  sped(begins, CUES.demoProcess, dropFrom, processFrom),
  sped(CUES.demoProcess, CUES.demoOpen, processFrom, openFrom),
  sped(CUES.demoOpen, CUES.demoTranscript, openFrom, playFrom),
  { from: CUES.demoTranscript, srcFrom: playFrom },
  { from: CUES.demoRedact, srcFrom: scrolled.at - 0.7 },
  { from: CUES.demoCoaching, srcFrom: generate.at - 0.6 },
  { from: CUES.demoExport, srcFrom: exportPdf.at - 0.8 },
  { from: CUES.demoScorecards, srcFrom: editScorecard.at - 0.5 },
  { from: CUES.demoPhones, srcFrom: phones.at + 0.2 },
  { from: CUES.demoDashboard, srcFrom: dashboard.at - 0.1 },
];
// When a moment of the recording is on screen, in video seconds.
const shown = (at: number) => {
  const shot = [...SHOTS].reverse().find((s) => s.srcFrom <= at) ?? SHOTS[0];
  return shot.from + (at - shot.srcFrom) / (shot.rate ?? 1);
};

// ----- the camera ------------------------------------------------------------------
const WIDE = 1280;
const wide = (y: number) => ({ x: (VIEW.width - WIDE) / 2, y, width: WIDE });

const failed = (
  detail.checks as { verdict: string; box: Box; evidence: Box | null }[]
).filter((check) => check.verdict !== "Pass" && check.evidence);
const scoreBox = scoreAndStatus(boxOf(opened));

const CAMERA: CameraMove[] = [
  { at: begins, to: wide(0) },
  {
    at: begins + 0.4,
    to: viewOf(
      union(boxOf(eventAt(rec, "upload-area")), boxOf(eventAt(rec, "queued"))),
      900,
      36,
    ),
  },
  { at: CUES.demoOpen - 0.2, to: wide(60) },
  {
    at: CUES.demoTranscript + 1.4,
    to: viewOf(boxOf(detail, "transcript"), 940),
  },
  { at: CUES.demoScore - 0.4, to: wide(70) },
  {
    at: CUES.demoEvidence - 0.4,
    to: viewOf(union(...failed.map((check) => check.box)), 860, 14),
  },
  // The player and the transcript under it, down to the line the flag points at.
  {
    at: CUES.demoFlag - 0.5,
    to: { x: 260, y: boxOf(detail, "player").y - 20, width: 1400 },
  },
  {
    at: CUES.demoRedact,
    to: viewOf(boxOf(scrolled, "redacted"), 900, 150),
    cut: true,
  },
  { at: CUES.demoCoaching, to: viewOf(boxOf(coaching), 900, 130), cut: true },
  { at: CUES.demoExport, to: wide(exportPdf.box.y - 340), cut: true },
  { at: CUES.demoScorecards, to: wide(40), cut: true },
  // The left column only: what the feature is. The right one holds this laptop's
  // address on the network.
  {
    at: CUES.demoPhones,
    to: { x: boxOf(phones).x - 28, y: boxOf(phones).y - 40, width: 540 },
    cut: true,
  },
  {
    at: CUES.demoDashboard,
    to: wide(boxOf(dashboard).y - 70),
    cut: true,
  },
];

const OUTLINES: Outline[] = [
  {
    from: CUES.demoScore + 0.4,
    until: CUES.demoEvidence - 0.4,
    box: scoreBox,
  },
  ...failed.map((check) => ({
    from: CUES.demoEvidence + 0.6,
    until: CUES.demoFlag - 0.5,
    box: check.evidence as Box,
  })),
  { from: CUES.demoFlag + 0.2, until: shown(flag.at) + 0.2, box: flag.box },
  {
    from: CUES.demoRedact + 0.3,
    until: CUES.demoCoaching - 0.3,
    box: boxOf(scrolled, "redacted"),
  },
];

const CLICKS: ClickRing[] = [
  transcribe,
  callRow,
  play,
  flag,
  generate,
  exportPdf,
  editScorecard,
].map((click) => ({ at: shown(click.at), x: click.x, y: click.y }));

const reportAt = shown(exportPdf.at) + REPORT_AFTER;

export const Demo: React.FC = () => {
  const clock = useClock("demo");
  const shot = [...SHOTS].reverse().find((s) => s.from <= clock.t) ?? SHOTS[0];
  const rate = shot.rate ?? 1;
  const report =
    enter(clock, reportAt, 0.9) - enter(clock, CUES.demoScorecards - 0.5, 0.5);
  // How far up the page has moved since it arrived.
  const read = interpolate(
    clock.t,
    [reportAt + 1.2, CUES.demoScorecards - 0.6],
    [0, REPORT_TRAVEL],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <Wall>
      <FootageCaption
        clock={clock}
        labels={[
          "Real app, screen recording",
          "Scripted test call",
          ...(rate > 1.05 ? [`Sped up ${rate.toFixed(1)}×`] : []),
        ]}
      >
        {CALLOUTS.map((callout, i) => (
          <Headline
            key={i}
            clock={clock}
            at={callout.from + (i === 0 ? 0.2 : 0)}
            out={CALLOUTS[i + 1] ? CALLOUTS[i + 1].from - 0.35 : undefined}
            size={58}
            style={{ position: "absolute", left: 0, bottom: 0 }}
          >
            {callout.text}
          </Headline>
        ))}
      </FootageCaption>

      <Footage
        clock={clock}
        file={rec.file}
        shots={SHOTS}
        camera={CAMERA}
        outlines={OUTLINES}
        clicks={CLICKS}
      >
        {/* The PDF the app exported in the recording, first page, as it was written. */}
        <Img
          src={staticFile(footage.report.image)}
          style={{
            position: "absolute",
            left: 72,
            top: FRAME_HEIGHT - report * (FRAME_HEIGHT - 28 + read),
            width: REPORT_WIDTH,
            background: "#ffffff",
          }}
        />
      </Footage>

      {CLICKS.map((click, i) => (
        <Sfx key={i} clock={clock} at={click.at} name="pop" />
      ))}
      <Sfx clock={clock} at={CUES.demoScore + 0.4} name="land" />
      {failed.map((_, i) => (
        <Sfx
          key={i}
          clock={clock}
          at={CUES.demoEvidence + 0.6 + i * 0.25}
          name="flag"
          volume={0.7}
        />
      ))}
      <Sfx clock={clock} at={reportAt} name="whoosh-up" />
    </Wall>
  );
};
