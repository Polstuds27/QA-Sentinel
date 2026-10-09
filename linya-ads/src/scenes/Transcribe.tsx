import React, { useMemo } from "react";
import { interpolate } from "remotion";
import { colors, display } from "../theme";
import { sceneEnd } from "../timing";
import { FEATURED_CALL } from "../data/demo";
import { redactPII, toSeconds } from "../data/scoring";
import { useClock } from "../components/motion";
import { PlayerStrip, waveWidth } from "../components/PlayerStrip";
import { Sfx } from "../components/Sfx";
import { STEP_CONTENT_WIDTH, StepLayout } from "../components/StepLayout";
import { barCount, callEnvelope } from "../components/Waveform";

const HEADING = "2 · Transcribed on your device";

// How much of the call (in call seconds) plays while the scene is up, and how fast
// the transcript types relative to the call.
const CALL_SECONDS_SHOWN = 19;
const LINES_SHOWN = 5;
const CHARS_PER_CALL_SECOND = 22;

const call = FEATURED_CALL;
const duration = toSeconds(call.duration);
const lines = call.lines.map((line) => ({
  ...line,
  seconds: toSeconds(line.time),
  text: redactPII(line.text),
}));

export const CallTitle: React.FC = () => (
  <div>
    <div style={{ ...display, fontSize: 50 }}>Call #{call.id}</div>
    <div style={{ marginTop: 10, fontSize: 22, color: colors.mutedForeground }}>
      Agent: {call.agent} · {call.duration} · {call.scorecard}
    </div>
  </div>
);

export const Transcribe: React.FC = () => {
  const clock = useClock("transcribe");
  const s = clock.start;
  const envelope = useMemo(
    () =>
      callEnvelope(lines, duration, barCount(waveWidth(STEP_CONTENT_WIDTH))),
    [],
  );

  const playFrom = s + 0.9;
  const playTo = sceneEnd("transcribe") - 0.4;
  const callTime = interpolate(
    clock.t,
    [playFrom, playTo],
    [0, CALL_SECONDS_SHOWN],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  return (
    <StepLayout clock={clock} heading={HEADING} tab="Call detail">
      <CallTitle />
      <div style={{ marginTop: 24 }}>
        <PlayerStrip
          width={STEP_CONTENT_WIDTH}
          height={70}
          envelope={envelope}
          duration={duration}
          current={callTime}
          playing={callTime > 0 && callTime < CALL_SECONDS_SHOWN}
          time={clock.t}
        />
      </div>
      <div
        style={{
          margin: "26px 0 12px",
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: "-0.025em",
        }}
      >
        Transcript (PII redacted)
      </div>
      {lines.slice(0, LINES_SHOWN).map((line) => {
        const since = callTime - line.seconds;
        if (since <= 0) return null;
        const typed = Math.floor(since * CHARS_PER_CALL_SECOND);
        return (
          <div
            key={line.time}
            style={{
              display: "grid",
              gridTemplateColumns: "84px 130px 1fr",
              alignItems: "baseline",
              padding: "11px 0",
              borderTop: `1px solid ${colors.border}`,
              fontSize: 24,
              opacity: Math.min(1, since / 0.4),
            }}
          >
            <span
              style={{
                fontSize: 21,
                fontWeight: 500,
                color: colors.mutedForeground,
              }}
            >
              {line.time}
            </span>
            <span style={{ fontSize: 21, fontWeight: 500 }}>
              {line.speaker}
            </span>
            <span>
              {line.text.slice(0, typed)}
              {typed < line.text.length ? (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 26,
                    marginLeft: 3,
                    verticalAlign: "text-bottom",
                    background: colors.primary,
                  }}
                />
              ) : null}
            </span>
          </div>
        );
      })}
      {lines.slice(0, LINES_SHOWN).map((line) => (
        <Sfx
          key={line.time}
          clock={clock}
          at={
            playFrom + (line.seconds / CALL_SECONDS_SHOWN) * (playTo - playFrom)
          }
          name="type"
        />
      ))}
    </StepLayout>
  );
};
