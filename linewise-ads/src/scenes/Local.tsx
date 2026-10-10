import React from "react";
import { colors, PAD_TOP, PAD_X } from "../theme";
import { WIDTH } from "../timing";
import { Headline } from "../components/Headline";
import { Rise, useClock } from "../components/motion";
import { Sfx } from "../components/Sfx";
import { Wall } from "../components/Wall";

// The plain answer to "why local": what runs on the machine and what needs the
// internet. Only what holds for the build (see AGENTS.md).
const HEADLINE = "Customer audio never leaves your device.";

const LOCAL: [string, string][] = [
  ["Speech-to-text", "Whisper"],
  ["Scoring", "qwen2.5:3b through Ollama"],
  ["Redaction, storage, reports", "This laptop"],
];
const INTERNET =
  "Only the one-time setup: installing the app and downloading the models.";
const COSTS = "No per-minute API costs.";

const LIST_TOP = PAD_TOP + 290;
const RIGHT_LEFT = 1110;
const LEFT_WIDTH = RIGHT_LEFT - PAD_X - 90;

const label: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 500,
  color: colors.mutedForeground,
  marginBottom: 16,
};

export const Local: React.FC = () => {
  const clock = useClock("local");
  const s = clock.start;
  return (
    <Wall>
      <Headline
        clock={clock}
        at={s + 0.1}
        size={104}
        style={{
          position: "absolute",
          left: PAD_X,
          top: PAD_TOP,
          width: 1500,
        }}
      >
        {HEADLINE}
      </Headline>

      <div
        style={{
          position: "absolute",
          left: PAD_X,
          top: LIST_TOP,
          width: LEFT_WIDTH,
        }}
      >
        <Rise clock={clock} at={s + 0.9} style={label}>
          Runs locally
        </Rise>
        {LOCAL.map(([what, how], i) => (
          <Rise
            key={what}
            clock={clock}
            at={s + 1.05 + i * 0.18}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 24,
              padding: "20px 0",
              borderTop: `1px solid ${colors.border}`,
              fontSize: 36,
              fontWeight: 500,
              letterSpacing: "-0.02em",
            }}
          >
            <span>{what}</span>
            <span style={{ color: colors.primary }}>{how}</span>
          </Rise>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: RIGHT_LEFT,
          top: LIST_TOP,
          width: WIDTH - PAD_X - RIGHT_LEFT,
        }}
      >
        <Rise clock={clock} at={s + 1.9} style={label}>
          Needs internet
        </Rise>
        <Rise
          clock={clock}
          at={s + 2.05}
          style={{
            padding: "20px 0",
            borderTop: `1px solid ${colors.border}`,
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1.25,
          }}
        >
          {INTERNET}
        </Rise>
        <Rise
          clock={clock}
          at={s + 2.9}
          style={{
            marginTop: 8,
            padding: "20px 0",
            borderTop: `1px solid ${colors.border}`,
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: "-0.02em",
          }}
        >
          {COSTS}
        </Rise>
      </div>
      {[0.9, 1.9, 2.9].map((at) => (
        <Sfx key={at} clock={clock} at={s + at} name="tick" />
      ))}
    </Wall>
  );
};
