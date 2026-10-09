import React from "react";
import { AbsoluteFill } from "remotion";
import { CAPTION_BAND, colors, CREDIT, TAGLINE } from "../theme";
import { Logo } from "../components/Logo";
import { Headline } from "../components/Headline";
import { enter, Rise, useClock } from "../components/motion";
import { Sfx } from "../components/Sfx";
import { Wall } from "../components/Wall";

export const Cta: React.FC = () => {
  const clock = useClock("cta");
  const s = clock.start;
  return (
    <Wall>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: CAPTION_BAND / 2,
        }}
      >
        <Rise clock={clock} at={s + 0.3}>
          <Logo size={170} />
        </Rise>
        <Headline
          clock={clock}
          at={s + 0.8}
          size={72}
          style={{ fontWeight: 500, letterSpacing: "-0.025em", marginTop: 60 }}
        >
          {TAGLINE}
        </Headline>
        <div
          style={{
            width: 520,
            height: 1,
            margin: "56px 0 44px",
            background: colors.border,
            transform: `scaleX(${enter(clock, s + 1.4, 1)})`,
          }}
        />
        <Rise
          clock={clock}
          at={s + 1.7}
          style={{
            fontSize: 46,
            fontWeight: 500,
            letterSpacing: "-0.025em",
            lineHeight: 1,
            color: colors.mutedForeground,
          }}
        >
          {CREDIT}
        </Rise>
      </AbsoluteFill>
      <Sfx clock={clock} at={s + 0.3} name="resolve" />
    </Wall>
  );
};
