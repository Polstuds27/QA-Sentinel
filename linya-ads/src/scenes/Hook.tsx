import React, { useMemo } from "react";
import { interpolate } from "remotion";
import { HeadsetIcon } from "lucide-react";
import { colors, PAD_TOP, PAD_X } from "../theme";
import { sceneEnd, WIDTH } from "../timing";
import { Headline } from "../components/Headline";
import { enter, Rise, useClock } from "../components/motion";
import { barCount, noiseEnvelope, Waveform } from "../components/Waveform";
import { Sfx } from "../components/Sfx";
import { Wall } from "../components/Wall";

const HEADLINE = "Who listens to every call?";

const LINE_Y = 690;
const ICON = 132;
const WAVE_HEIGHT = 260;
const WAVE_LEFT = PAD_X + ICON + 84;
const WAVE_WIDTH = WIDTH - PAD_X - WAVE_LEFT;

// The headset rings in bursts, like a phone: on for RING_LENGTH of every RING_PERIOD.
const RING_PERIOD = 2;
const RING_LENGTH = 0.9;
const RING_TRAVEL = 1.2;
// The first ring, in seconds after the scene starts.
const FIRST_RING = 0.4;

export const Hook: React.FC = () => {
  const clock = useClock("hook");
  const s = clock.start;
  const envelope = useMemo(
    () => noiseEnvelope(barCount(WAVE_WIDTH), "hook"),
    [],
  );

  const head = interpolate(clock.t, [s + 0.5, sceneEnd("hook") + 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phase =
    (((clock.t - s - FIRST_RING) % RING_PERIOD) + RING_PERIOD) % RING_PERIOD;
  const shake =
    phase < RING_LENGTH
      ? Math.sin(phase * Math.PI * 22) *
        7 *
        Math.sin((phase / RING_LENGTH) * Math.PI)
      : 0;

  return (
    <Wall>
      <Headline
        clock={clock}
        at={s + 0.2}
        size={156}
        style={{
          position: "absolute",
          left: PAD_X,
          top: PAD_TOP + 10,
          width: 1500,
        }}
      >
        {HEADLINE}
      </Headline>

      <div
        style={{
          position: "absolute",
          left: WAVE_LEFT,
          top: LINE_Y,
          width: WAVE_WIDTH,
          height: 1,
          background: colors.border,
          transformOrigin: "left",
          transform: `scaleX(${enter(clock, s + 0.3, 1.4)})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: WAVE_LEFT,
          top: LINE_Y - WAVE_HEIGHT / 2,
        }}
      >
        <Waveform
          width={WAVE_WIDTH}
          height={WAVE_HEIGHT}
          envelope={envelope}
          head={head}
          reveal={head + 0.02}
          time={clock.t}
          live
        />
      </div>

      <Rise
        clock={clock}
        at={s + 0.3}
        style={{
          position: "absolute",
          left: PAD_X,
          top: LINE_Y - ICON / 2,
          width: ICON,
          height: ICON,
        }}
      >
        {[0, 0.28].map((delay) => {
          const p = (phase - delay) / RING_TRAVEL;
          if (p < 0 || p > 1) return null;
          const size = ICON * (1.1 + p * 1.1);
          return (
            <div
              key={delay}
              style={{
                position: "absolute",
                left: (ICON - size) / 2,
                top: (ICON - size) / 2,
                width: size,
                height: size,
                boxSizing: "border-box",
                borderRadius: 9999,
                border: `2px solid ${colors.primary}`,
                opacity: (1 - p) * 0.9,
              }}
            />
          );
        })}
        <HeadsetIcon
          size={ICON}
          strokeWidth={1.25}
          style={{ transform: `rotate(${shake}deg)` }}
        />
      </Rise>
      {new Array(Math.ceil((sceneEnd("hook") - s - FIRST_RING) / RING_PERIOD))
        .fill(0)
        .map((_, i) => (
          <Sfx
            key={i}
            clock={clock}
            at={s + FIRST_RING + i * RING_PERIOD}
            name="ring"
          />
        ))}
    </Wall>
  );
};
