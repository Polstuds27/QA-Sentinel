import React, { useMemo } from "react";
import { interpolate } from "remotion";
import { CAPTION_BAND, colors, PAD_TOP, PAD_X } from "../theme";
import { CUES, HEIGHT, WIDTH } from "../timing";
import { CALLS, CHECKS } from "../data/demo";
import { scoreCall, STATUS_LABEL, toSeconds } from "../data/scoring";
import { APP_PADDING, AppFrame } from "../components/AppFrame";
import { StatusBadge } from "../components/Badge";
import { Headline } from "../components/Headline";
import { enter, Rise, useClock } from "../components/motion";
import { barCount, callEnvelope, Waveform } from "../components/Waveform";
import { Sfx } from "../components/Sfx";
import { Wall } from "../components/Wall";
import { WifiIcon } from "../components/WifiIcon";

// One statement per beat (CUES.whyLocalBeats). Only claims that hold for the build.
const STATEMENTS = [
  "Customer audio never leaves your device.",
  "Works offline.",
  "No per-minute API costs.",
];

const COLUMN_LEFT = 1040;
const COLUMN_WIDTH = WIDTH - PAD_X - COLUMN_LEFT;
const WIFI = 132;
const PANEL_TOP = PAD_TOP + WIFI + 44;
const PANEL_HEIGHT = HEIGHT - CAPTION_BAND - PANEL_TOP;
const ROW_WAVE_WIDTH = 220;

// After the wifi goes off the queue keeps moving: each call is scored in turn.
const FIRST_CALL = 0.9;
const CALL_EVERY = 3;
const CALL_TAKES = 2.1;

export const WhyLocal: React.FC = () => {
  const clock = useClock("whyLocal");
  const s = clock.start;
  const off = enter(clock, CUES.wifiOff, 0.6);
  const beat = CUES.whyLocalBeats.filter((at) => clock.t >= at).length - 1;

  const calls = useMemo(
    () =>
      CALLS.map((call) => ({
        call,
        ...scoreCall(CHECKS, call.results),
        envelope: callEnvelope(
          call.lines.map((line) => ({
            ...line,
            seconds: toSeconds(line.time),
          })),
          toSeconds(call.duration),
          barCount(ROW_WAVE_WIDTH, 4, 4),
        ),
      })),
    [],
  );

  return (
    <Wall>
      <div
        style={{
          position: "absolute",
          left: PAD_X,
          top: PAD_TOP + 10,
          width: COLUMN_LEFT - PAD_X - 60,
        }}
      >
        <Rise clock={clock} at={s + 0.2} style={{ display: "flex", gap: 14 }}>
          {STATEMENTS.map((_, i) => (
            <span
              key={i}
              style={{
                width: 16,
                height: 16,
                boxSizing: "border-box",
                borderRadius: 9999,
                border: `1px solid ${i === beat ? colors.primary : colors.mutedForeground}`,
                background: i === beat ? colors.primary : "transparent",
              }}
            />
          ))}
        </Rise>
        <div style={{ position: "relative", marginTop: 56 }}>
          {STATEMENTS.map((statement, i) => (
            <Headline
              key={i}
              clock={clock}
              at={CUES.whyLocalBeats[i]}
              out={
                i < STATEMENTS.length - 1
                  ? CUES.whyLocalBeats[i + 1] - 0.4
                  : undefined
              }
              size={112}
              style={{ position: "absolute", left: 0, right: 0 }}
            >
              {statement}
            </Headline>
          ))}
        </div>
      </div>

      <Rise
        clock={clock}
        at={s + 0.3}
        style={{ position: "absolute", left: COLUMN_LEFT, top: PAD_TOP }}
      >
        <WifiIcon size={WIFI} off={off} />
      </Rise>

      <div style={{ position: "absolute", left: COLUMN_LEFT, top: PANEL_TOP }}>
        <AppFrame
          width={COLUMN_WIDTH}
          height={PANEL_HEIGHT}
          headerRight={<span />}
        >
          {calls.map(({ call, score, status, envelope }, i) => {
            const from = CUES.wifiOff + FIRST_CALL + i * CALL_EVERY;
            const head = interpolate(
              clock.t,
              [from, from + CALL_TAKES],
              [0, 1],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            );
            const working = head > 0 && head < 1;
            const done = head >= 1;
            return (
              <div
                key={call.id}
                style={{
                  height: (PANEL_HEIGHT - 84 - 28 - 30) / CALLS.length,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  borderTop: `1px solid ${colors.border}`,
                  fontSize: 28,
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    boxSizing: "border-box",
                    flexShrink: 0,
                    borderRadius: 9999,
                    border: `1px solid ${working ? colors.primary : colors.foreground}`,
                    background: working ? colors.primary : "transparent",
                  }}
                />
                <span
                  style={{
                    width: 150,
                    flexShrink: 0,
                    letterSpacing: "-0.025em",
                  }}
                >
                  Call #{call.id}
                </span>
                <Waveform
                  width={ROW_WAVE_WIDTH}
                  height={44}
                  envelope={envelope}
                  head={head}
                  time={clock.t}
                  live={working}
                  bar={4}
                  gap={4}
                />
                <span
                  style={{
                    flex: 1,
                    display: "flex",
                    justifyContent: "flex-end",
                    width: COLUMN_WIDTH - 2 * APP_PADDING,
                  }}
                >
                  {done ? (
                    <Rise clock={clock} at={from + CALL_TAKES} distance={12}>
                      <StatusBadge status={status} size={20}>
                        {score} / 100 · {STATUS_LABEL[status]}
                      </StatusBadge>
                    </Rise>
                  ) : (
                    <span
                      style={{ fontSize: 22, color: colors.mutedForeground }}
                    >
                      {working ? "Scoring" : "Queued"}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </AppFrame>
      </div>
      <Sfx clock={clock} at={CUES.wifiOff} name="power-down" />
      {calls.map(({ call }, i) => (
        <Sfx
          key={call.id}
          clock={clock}
          at={CUES.wifiOff + FIRST_CALL + i * CALL_EVERY + CALL_TAKES}
          name="pop"
        />
      ))}
    </Wall>
  );
};
