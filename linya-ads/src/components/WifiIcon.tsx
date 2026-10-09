import React from "react";
import { interpolateColors } from "remotion";
import { colors } from "../theme";

const SLASH_LENGTH = Math.hypot(20, 20);

// A wifi icon that switches off: the arcs dim and a slash draws across. `off` is 0 to 1.
export const WifiIcon: React.FC<{ size: number; off: number }> = ({
  size,
  off,
}) => {
  const arcs = interpolateColors(
    off,
    [0, 1],
    [colors.foreground, colors.border],
  );
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="square"
    >
      <g stroke={arcs}>
        <path d="M12 20h.01" strokeLinecap="round" strokeWidth={2} />
        <path d="M2 8.82a15 15 0 0 1 20 0" />
        <path d="M5 12.859a10 10 0 0 1 14 0" />
        <path d="M8.5 16.429a5 5 0 0 1 7 0" />
      </g>
      <path
        d="M2 2l20 20"
        stroke={colors.foreground}
        strokeDasharray={SLASH_LENGTH}
        strokeDashoffset={(1 - off) * SLASH_LENGTH}
        opacity={off > 0 ? 1 : 0}
      />
    </svg>
  );
};
