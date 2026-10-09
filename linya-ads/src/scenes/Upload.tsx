import React from "react";
import { interpolateColors } from "remotion";
import { FileAudioIcon } from "lucide-react";
import { colors } from "../theme";
import { CALLS } from "../data/demo";
import { enter, Rise, useClock } from "../components/motion";
import { Sfx } from "../components/Sfx";
import { StepLayout } from "../components/StepLayout";

const HEADING = "1 · Upload a recording";
const DROP_HINT = "Drop MP3 / WAV / M4A here";

// Seconds after the scene starts.
const FILES_DROP = 1.2;
const FILES_LAND = 3;
const QUEUE_IN = 3.2;
const FIRST_STARTS = 4.5;

export const Upload: React.FC = () => {
  const clock = useClock("upload");
  const s = clock.start;
  const over = enter(clock, s + FILES_DROP + 0.3, 0.5);
  const landed = enter(clock, s + FILES_LAND, 0.5);
  const started = enter(clock, s + FIRST_STARTS, 0.5);

  return (
    <StepLayout clock={clock} heading={HEADING} tab="Calls">
      <div
        style={{
          position: "relative",
          height: 250,
          boxSizing: "border-box",
          border: `1px dashed ${interpolateColors(over - landed, [0, 1], [colors.mutedForeground, colors.foreground])}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{ fontSize: 28, fontWeight: 500, opacity: 1 - over + landed }}
        >
          {DROP_HINT}
        </span>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 20,
          }}
        >
          {CALLS.map((call, i) => {
            const shown = enter(clock, s + FILES_DROP + i * 0.2);
            return (
              <span
                key={call.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 20px",
                  border: `1px solid ${colors.foreground}`,
                  background: colors.background,
                  fontSize: 24,
                  fontWeight: 500,
                  opacity: shown * (1 - landed),
                  transform: `translateY(${(1 - shown) * -150 + landed * 50}px)`,
                }}
              >
                <FileAudioIcon size={26} strokeWidth={1.5} />
                {call.file}
              </span>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 34 }}>
        {CALLS.map((call, i) => {
          const active = i === 0 ? started : 0;
          return (
            <Rise
              key={call.id}
              clock={clock}
              at={s + QUEUE_IN + i * 0.15}
              style={{
                height: 76,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderTop: `1px solid ${colors.border}`,
                borderBottom:
                  i === CALLS.length - 1
                    ? `1px solid ${colors.border}`
                    : undefined,
                fontSize: 26,
              }}
            >
              <span style={{ fontWeight: 500 }}>{call.file}</span>
              <span
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 24,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    right: 0,
                    color: colors.mutedForeground,
                    opacity: 1 - active,
                  }}
                >
                  Queued
                </span>
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 9999,
                    background: colors.primary,
                    opacity: active,
                  }}
                />
                <span style={{ opacity: active }}>Transcribing on device</span>
              </span>
            </Rise>
          );
        })}
      </div>
      {CALLS.map((call, i) => (
        <React.Fragment key={call.id}>
          <Sfx clock={clock} at={s + FILES_DROP + 0.2 + i * 0.2} name="pop" />
          <Sfx clock={clock} at={s + QUEUE_IN + i * 0.15} name="tick" />
        </React.Fragment>
      ))}
      <Sfx clock={clock} at={s + FIRST_STARTS} name="pop" />
    </StepLayout>
  );
};
