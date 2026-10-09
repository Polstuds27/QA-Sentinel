import React, { useMemo } from "react";
import { interpolate, interpolateColors } from "remotion";
import { CloudIcon, CloudOffIcon } from "lucide-react";
import { colors, PAD_TOP, PAD_X } from "../theme";
import { CUES, WIDTH } from "../timing";
import { SENSITIVE_LINE } from "../data/demo";
import { Headline } from "../components/Headline";
import { enter, Rise, useClock } from "../components/motion";
import { barCount, noiseEnvelope, Waveform } from "../components/Waveform";
import { Sfx } from "../components/Sfx";
import { Wall } from "../components/Wall";

const HEADLINE_VOLUME = "Too many calls to review by hand.";
const HEADLINE_PRIVACY = "Sensitive audio shouldn't go to cloud AI.";

const COLUMN_LEFT = 1040;
const COLUMN_WIDTH = WIDTH - PAD_X - COLUMN_LEFT;
const HEADLINE_WIDTH = COLUMN_LEFT - PAD_X - 80;

const ROWS = 8;
const ROW_HEIGHT = 80;
const ROW_STAGGER = 0.3;
const DOT = 16;
const ROW_WAVE_WIDTH = COLUMN_WIDTH - DOT - 28;

const CLOUD = 150;
const UPLOAD_PATH = 190;

// Split a line around its card number so the digits can carry the destructive colour.
const CARD = /(\d[\d ]{11,}\d)/;

export const Problem: React.FC = () => {
  const clock = useClock("problem");
  const s = clock.start;
  const privacy = CUES.problemPrivacy;
  const envelopes = useMemo(
    () =>
      new Array(ROWS)
        .fill(0)
        .map((_, i) =>
          noiseEnvelope(barCount(ROW_WAVE_WIDTH, 4, 4), `queue-${i}`),
        ),
    [],
  );

  // One call is being listened to while the rest pile up underneath it.
  const reviewed = interpolate(clock.t, [s + 0.8, privacy], [0, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // The quoted line heads for the cloud, is stopped, and comes back.
  const upload = enter(clock, privacy + 1.3, 0.9);
  const blocked = enter(clock, privacy + 2.5, 0.5);
  const [before, card, after] = SENSITIVE_LINE.text.split(CARD);

  return (
    <Wall>
      <div
        style={{
          position: "absolute",
          left: PAD_X,
          top: PAD_TOP + 10,
          width: HEADLINE_WIDTH,
        }}
      >
        <Headline
          clock={clock}
          at={s - 0.1}
          out={privacy - 0.35}
          style={{ position: "absolute" }}
        >
          {HEADLINE_VOLUME}
        </Headline>
        <Headline
          clock={clock}
          at={privacy + 0.1}
          style={{ position: "absolute" }}
        >
          {HEADLINE_PRIVACY}
        </Headline>
      </div>

      <div
        style={{
          position: "absolute",
          left: COLUMN_LEFT,
          top: PAD_TOP + 20,
          width: COLUMN_WIDTH,
        }}
      >
        {envelopes.map((envelope, i) => (
          <Rise
            key={i}
            clock={clock}
            at={s + 0.4 + i * ROW_STAGGER}
            out={privacy - 0.45}
            style={{
              height: ROW_HEIGHT,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              gap: 28,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            <span
              style={{
                width: DOT,
                height: DOT,
                boxSizing: "border-box",
                flexShrink: 0,
                borderRadius: 9999,
                border: `1px solid ${i === 0 ? colors.primary : colors.mutedForeground}`,
                background: i === 0 ? colors.primary : "transparent",
              }}
            />
            <Waveform
              width={ROW_WAVE_WIDTH}
              height={46}
              envelope={envelope}
              head={i === 0 ? reviewed : undefined}
              time={clock.t}
              live={i === 0}
              bar={4}
              gap={4}
            />
          </Rise>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: COLUMN_LEFT,
          top: PAD_TOP + 30,
          width: COLUMN_WIDTH,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Rise
          clock={clock}
          at={privacy + 0.9}
          style={{ position: "relative", width: CLOUD, height: CLOUD }}
        >
          <CloudIcon
            size={CLOUD}
            strokeWidth={1}
            color={colors.mutedForeground}
            style={{ position: "absolute", opacity: 1 - blocked }}
          />
          <CloudOffIcon
            size={CLOUD}
            strokeWidth={1}
            color={colors.destructive}
            style={{ position: "absolute", opacity: blocked }}
          />
        </Rise>
        <div
          style={{
            height: UPLOAD_PATH,
            margin: "18px 0",
            display: "flex",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              height: UPLOAD_PATH * upload * (1 - blocked),
              borderLeft: `2px dashed ${interpolateColors(blocked, [0, 1], [colors.mutedForeground, colors.destructive])}`,
            }}
          />
        </div>
        <Rise
          clock={clock}
          at={privacy + 0.4}
          style={{
            alignSelf: "stretch",
            display: "grid",
            gridTemplateColumns: "96px 150px 1fr",
            alignItems: "baseline",
            padding: "22px 0",
            borderTop: `1px solid ${colors.border}`,
            borderBottom: `1px solid ${colors.border}`,
            fontSize: 34,
          }}
        >
          <span
            style={{
              fontSize: 24,
              fontWeight: 500,
              color: colors.mutedForeground,
            }}
          >
            {SENSITIVE_LINE.time}
          </span>
          <span style={{ fontSize: 24, fontWeight: 500 }}>
            {SENSITIVE_LINE.speaker}
          </span>
          <span>
            {before}
            <span style={{ color: colors.destructive, fontWeight: 500 }}>
              {card}
            </span>
            {after}
          </span>
        </Rise>
        <Rise
          clock={clock}
          at={privacy + 0.6}
          style={{
            alignSelf: "flex-start",
            marginTop: 18,
            fontSize: 24,
            fontWeight: 500,
            color: colors.mutedForeground,
          }}
        >
          Sample call, scripted data
        </Rise>
      </div>
      {envelopes.map((_, i) => (
        <Sfx
          key={i}
          clock={clock}
          at={s + 0.4 + i * ROW_STAGGER}
          name="tick"
          volume={0.8}
        />
      ))}
      <Sfx clock={clock} at={privacy + 2.5} name="flag" />
    </Wall>
  );
};
