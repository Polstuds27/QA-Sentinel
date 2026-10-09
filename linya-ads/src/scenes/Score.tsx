import React, { useMemo } from "react";
import { interpolateColors } from "remotion";
import { CheckIcon, MinusIcon, XIcon } from "lucide-react";
import { colors, display } from "../theme";
import { CHECKS, FEATURED_CALL } from "../data/demo";
import { scoreCall, STATUS_LABEL, toSeconds } from "../data/scoring";
import { StatusBadge } from "../components/Badge";
import { enter, Rise, useClock } from "../components/motion";
import { PlayerStrip, waveWidth } from "../components/PlayerStrip";
import { Sfx } from "../components/Sfx";
import { STEP_CONTENT_WIDTH, StepLayout } from "../components/StepLayout";
import { barCount, callEnvelope } from "../components/Waveform";
import { CallTitle } from "./Transcribe";

const HEADING = "3 · Scored against your rubric";

// Seconds after the scene starts.
const CHECKS_IN = 0.9;
const CHECK_STAGGER = 0.38;
const SCORE_IN = 3.9;
const SCORE_COUNT = 1.3;
const STATUS_IN = 5.3;

const VERDICTS = {
  pass: { label: "Pass", icon: CheckIcon, color: colors.foreground },
  fail: { label: "Fail", icon: XIcon, color: colors.destructive },
  critical: { label: "Critical", icon: XIcon, color: colors.destructive },
  na: { label: "N/A", icon: MinusIcon, color: colors.mutedForeground },
};

const call = FEATURED_CALL;
const duration = toSeconds(call.duration);
const { score, status } = scoreCall(CHECKS, call.results);
const rows = CHECKS.map((check) => {
  const result = call.results.find((r) => r.check_id === check.id);
  const verdict =
    !result || result.verdict === "not_applicable"
      ? "na"
      : result.verdict === "pass"
        ? "pass"
        : check.critical
          ? "critical"
          : "fail";
  return {
    check,
    verdict: VERDICTS[verdict],
    failed: result?.verdict === "fail",
    timestamp: result?.timestamp,
  };
});

export const Score: React.FC = () => {
  const clock = useClock("score");
  const s = clock.start;
  const envelope = useMemo(
    () =>
      callEnvelope(
        call.lines.map((line) => ({ ...line, seconds: toSeconds(line.time) })),
        duration,
        barCount(waveWidth(STEP_CONTENT_WIDTH)),
      ),
    [],
  );

  const checkAt = (i: number) => s + CHECKS_IN + i * CHECK_STAGGER;
  // Each flag tick lands on the timeline as its failed check appears.
  const flags = rows.flatMap((row, i) =>
    row.failed && row.timestamp
      ? [
          {
            seconds: toSeconds(row.timestamp),
            shown: enter(clock, checkAt(i) + 0.1, 0.5),
          },
        ]
      : [],
  );
  const counted = enter(clock, s + SCORE_IN, SCORE_COUNT);
  const settled = enter(clock, s + STATUS_IN, 0.4);

  return (
    <StepLayout clock={clock} heading={HEADING} tab="Call detail">
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        <CallTitle />
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Rise
            clock={clock}
            at={s + SCORE_IN - 0.2}
            style={{
              ...display,
              fontSize: 68,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span
              style={{
                color:
                  status === "red"
                    ? interpolateColors(
                        settled,
                        [0, 1],
                        [colors.foreground, colors.destructive],
                      )
                    : colors.foreground,
              }}
            >
              {Math.round(counted * score)}
            </span>
            <span style={{ color: colors.mutedForeground }}> / 100</span>
          </Rise>
          <Rise clock={clock} at={s + STATUS_IN} distance={12}>
            <StatusBadge status={status}>{STATUS_LABEL[status]}</StatusBadge>
          </Rise>
        </div>
      </div>
      <div style={{ marginTop: 22 }}>
        <PlayerStrip
          width={STEP_CONTENT_WIDTH}
          height={70}
          envelope={envelope}
          duration={duration}
          current={duration}
          playing={false}
          time={clock.t}
          flags={flags}
        />
      </div>
      <div
        style={{
          margin: "22px 0 10px",
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: "-0.025em",
        }}
      >
        Scorecard
      </div>
      {rows.map((row, i) => (
        <Rise
          key={row.check.id}
          clock={clock}
          at={checkAt(i)}
          distance={14}
          style={{
            height: 45,
            boxSizing: "border-box",
            display: "flex",
            alignItems: "center",
            gap: 14,
            borderTop: `1px solid ${colors.border}`,
            fontSize: 21,
          }}
        >
          <span
            style={{
              width: 128,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontWeight: 500,
              color: row.verdict.color,
            }}
          >
            <row.verdict.icon size={20} />
            {row.verdict.label}
          </span>
          <span style={{ flex: 1 }}>
            {row.check.label}{" "}
            <span
              style={{
                color: colors.mutedForeground,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              ({row.check.weight})
            </span>
          </span>
          {row.timestamp ? (
            <span style={{ color: colors.mutedForeground }}>
              {row.timestamp}
            </span>
          ) : null}
        </Rise>
      ))}
      {rows.map((row, i) => (
        <Sfx
          key={row.check.id}
          clock={clock}
          at={checkAt(i)}
          name={row.failed ? "flag" : "tick"}
        />
      ))}
      <Sfx clock={clock} at={s + STATUS_IN} name="land" />
    </StepLayout>
  );
};
