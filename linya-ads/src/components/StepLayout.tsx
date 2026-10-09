import React from "react";
import { CAPTION_BAND, colors, PAD_TOP, PAD_X } from "../theme";
import { HEIGHT, WIDTH } from "../timing";
import { SAMPLE_NOTE } from "../data/demo";
import {
  APP_HEADER_HEIGHT,
  APP_PADDING,
  AppFrame,
  type AppTab,
} from "./AppFrame";
import { Headline } from "./Headline";
import { type Clock, Rise } from "./motion";
import { Wall } from "./Wall";

const HEADING_WIDTH = 600;
const COLUMN_GAP = 64;

export const STEP_FRAME_WIDTH = WIDTH - 2 * PAD_X - HEADING_WIDTH - COLUMN_GAP;
export const STEP_FRAME_HEIGHT = HEIGHT - PAD_TOP - CAPTION_BAND;
// Room for content inside the app frame.
export const STEP_CONTENT_WIDTH = STEP_FRAME_WIDTH - 2 * APP_PADDING - 2;
export const STEP_CONTENT_HEIGHT =
  STEP_FRAME_HEIGHT - APP_HEADER_HEIGHT - 28 - 2;

// A how-it-works step, split like the app's own sections: the heading on the left, the
// screen on the right. The frame sits in the same place in every step, so the fades
// between steps read as the app changing rather than the scene.
export const StepLayout: React.FC<{
  clock: Clock;
  heading: string;
  tab: AppTab;
  children: React.ReactNode;
}> = ({ clock, heading, tab, children }) => (
  <Wall>
    <div
      style={{
        position: "absolute",
        left: PAD_X,
        top: PAD_TOP,
        width: HEADING_WIDTH,
        height: STEP_FRAME_HEIGHT,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <Headline clock={clock} at={clock.start + 0.15} size={78}>
        {heading}
      </Headline>
      <Rise
        clock={clock}
        at={clock.start + 0.5}
        style={{ fontSize: 24, fontWeight: 500, color: colors.mutedForeground }}
      >
        {SAMPLE_NOTE}
      </Rise>
    </div>
    <div
      style={{
        position: "absolute",
        left: PAD_X + HEADING_WIDTH + COLUMN_GAP,
        top: PAD_TOP,
      }}
    >
      <AppFrame width={STEP_FRAME_WIDTH} height={STEP_FRAME_HEIGHT} tab={tab}>
        {children}
      </AppFrame>
    </div>
  </Wall>
);
