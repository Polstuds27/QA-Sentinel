import React from "react";
import { AbsoluteFill, spring } from "remotion";
import { CAPTION_BAND, TAGLINE } from "../theme";
import { LogoMark } from "../components/Logo";
import { Headline } from "../components/Headline";
import { enter, useClock } from "../components/motion";
import { Sfx } from "../components/Sfx";
import { Wall } from "../components/Wall";

const MARK = 220;
const WORDMARK = "Linya";

export const LogoReveal: React.FC = () => {
  const clock = useClock("logoReveal");
  const s = clock.start;

  // The two lines draw, then the dot lands with a little weight.
  const dot = spring({
    frame: (clock.t - (s + 1.05)) * clock.fps,
    fps: clock.fps,
    config: { damping: 14, stiffness: 170, mass: 0.7 },
  });

  return (
    <Wall>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 64,
          paddingBottom: CAPTION_BAND / 2,
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: MARK * 0.42 }}
        >
          <LogoMark
            size={MARK}
            vertical={enter(clock, s + 0.3, 0.5)}
            horizontal={enter(clock, s + 0.65, 0.5)}
            dot={dot}
          />
          <span
            style={{
              fontSize: MARK * 0.84,
              fontWeight: 600,
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            {WORDMARK.split("").map((letter, i) => {
              const shown = enter(clock, s + 1.15 + i * 0.06);
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-block",
                    opacity: shown,
                    transform: `translateY(${(1 - shown) * 48}px)`,
                  }}
                >
                  {letter}
                </span>
              );
            })}
          </span>
        </div>
        <Headline
          clock={clock}
          at={s + 1.9}
          size={66}
          style={{ fontWeight: 500, letterSpacing: "-0.025em" }}
        >
          {TAGLINE}
        </Headline>
      </AbsoluteFill>
      <Sfx clock={clock} at={s + 1.05} name="chime" />
    </Wall>
  );
};
