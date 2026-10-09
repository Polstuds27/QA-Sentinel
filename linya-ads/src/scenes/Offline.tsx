import React from "react";
import { CUES, sceneEnd, sceneStart } from "../timing";
import {
  boxOf,
  clickOn,
  eventAt,
  footage,
  statusAt,
  union,
  VIEW,
} from "../data/footage";
import {
  type CameraMove,
  type ClickRing,
  Footage,
  FootageCaption,
  type Outline,
  type Shot,
  viewOf,
} from "../components/Footage";
import { Headline } from "../components/Headline";
import { enter, useClock } from "../components/motion";
import { Sfx } from "../components/Sfx";
import { Wall } from "../components/Wall";
import { WifiIcon } from "../components/WifiIcon";

const HEADLINE = "Works with the internet off.";

const rec = footage.offline;
// The claim rests on this recording: the browser could reach nothing but this machine,
// and the page asked for nothing else.
if (rec.outside.length > 0) {
  throw new Error(
    `The offline recording reached ${rec.outside.join(", ")}. Do not show it as offline.`,
  );
}

const begins = sceneStart("offline");
const transcribe = clickOn(rec, "Transcribe");
const listed = eventAt(rec, "call-row");

const dropFrom = eventAt(rec, "upload-area").at - 0.3;
const processFrom = transcribe.at + 0.15;
const listFrom = statusAt(rec, "done") + 0.4;
// The calls list has scrolled into view by now: the run ends here, on the scored call
// in the list, without opening it again.
const holdFrom = listed.at - 0.2;

const sped = (from: number, to: number, srcFrom: number, srcTo: number) => ({
  from,
  srcFrom,
  rate: (srcTo - srcFrom) / (to - from),
});
const SHOTS: Shot[] = [
  sped(begins, CUES.offlineProcess, dropFrom, processFrom),
  sped(CUES.offlineProcess, CUES.offlineList, processFrom, listFrom),
  sped(CUES.offlineList, CUES.offlineHold, listFrom, holdFrom),
  { from: CUES.offlineHold, srcFrom: holdFrom },
];
const shown = (at: number) => {
  const shot = [...SHOTS].reverse().find((s) => s.srcFrom <= at) ?? SHOTS[0];
  return shot.from + (at - shot.srcFrom) / (shot.rate ?? 1);
};

const WIDE = 1280;
const wide = (y: number) => ({ x: (VIEW.width - WIDE) / 2, y, width: WIDE });

const CAMERA: CameraMove[] = [
  { at: begins, to: wide(0) },
  {
    at: begins + 0.2,
    to: viewOf(
      union(boxOf(eventAt(rec, "upload-area")), boxOf(eventAt(rec, "queued"))),
      900,
      36,
    ),
  },
  { at: CUES.offlineList - 0.2, to: wide(boxOf(listed).y - 230) },
];
const OUTLINES: Outline[] = [
  {
    from: CUES.offlineHold,
    until: sceneEnd("offline") + 1,
    box: boxOf(listed),
  },
];
const CLICKS: ClickRing[] = [
  { at: shown(transcribe.at), x: transcribe.x, y: transcribe.y },
];

export const Offline: React.FC = () => {
  const clock = useClock("offline");
  const shot = [...SHOTS].reverse().find((s) => s.from <= clock.t) ?? SHOTS[0];
  const rate = shot.rate ?? 1;

  return (
    <Wall>
      <FootageCaption
        clock={clock}
        labels={[
          "Internet blocked for this run",
          "Real app, scripted test call",
          ...(rate > 1.05 ? [`Sped up ${rate.toFixed(1)}×`] : []),
        ]}
        icon={<WifiIcon size={84} off={enter(clock, begins + 0.5, 0.6)} />}
      >
        <Headline
          clock={clock}
          at={begins + 0.1}
          size={58}
          style={{ position: "absolute", left: 0, bottom: 0 }}
        >
          {HEADLINE}
        </Headline>
      </FootageCaption>
      <Footage
        clock={clock}
        file={rec.file}
        shots={SHOTS}
        camera={CAMERA}
        outlines={OUTLINES}
        clicks={CLICKS}
      />
      <Sfx clock={clock} at={begins + 0.5} name="power-down" />
      {CLICKS.map((click, i) => (
        <Sfx key={i} clock={clock} at={click.at} name="pop" />
      ))}
      <Sfx clock={clock} at={CUES.offlineHold} name="land" />
    </Wall>
  );
};
