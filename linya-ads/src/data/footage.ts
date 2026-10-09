// What scripts/record-demo.mjs recorded: the footage files, when each thing happened
// in them, and where it was on screen. Scenes read their cuts and zooms from here, so
// a new recording moves them without editing a scene.

import footageJson from "./footage.json";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface FootageEvent {
  /** Seconds into the footage. */
  at: number;
  event: string;
  [detail: string]: unknown;
}

export interface Recording {
  file: string;
  fps: number;
  seconds: number;
  events: FootageEvent[];
  /** Every host other than this machine that the page asked for. */
  outside: string[];
}

export const footage = footageJson as unknown as {
  viewport: { width: number; height: number };
  online: Recording;
  offline: Recording;
  report: { image: string };
};

export const VIEW = footage.viewport;

const find = (
  rec: Recording,
  test: (e: FootageEvent) => boolean,
  what: string,
) => {
  const found = rec.events.find(test);
  if (!found) {
    throw new Error(
      `The recording has no ${what}. Run scripts/record-demo.mjs again.`,
    );
  }
  return found;
};

export const eventAt = (rec: Recording, event: string) =>
  find(rec, (e) => e.event === event, `"${event}" event`);

/** A click, found by the start of what was clicked ("Play", "Jump to", "Export PDF"). */
export const clickOn = (rec: Recording, what: string) => {
  const e = find(
    rec,
    (c) => c.event === "click" && String(c.what).startsWith(what),
    `click on "${what}"`,
  );
  return { at: e.at, x: e.x as number, y: e.y as number, box: e.box as Box };
};

/** When the queue row's status first started with this text ("done", "scoring"). */
export const statusAt = (rec: Recording, start: string) =>
  find(
    rec,
    (e) => e.event === "status" && String(e.status).startsWith(start),
    `"${start}" status`,
  ).at;

export const boxOf = (event: FootageEvent, key = "box") => event[key] as Box;

export const union = (...boxes: Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
};

// The score with the status badge beside it. The badge ends at the right edge of the
// scorecard column, which is the same in every recording.
export const scoreAndStatus = (score: Box): Box => {
  const scorecard = boxOf(eventAt(footage.online, "detail"), "scorecard");
  return union(score, {
    ...score,
    x: scorecard.x + scorecard.width - 1,
    width: 1,
  });
};
