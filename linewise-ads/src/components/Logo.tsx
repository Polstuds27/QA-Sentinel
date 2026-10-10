import React, { useId } from "react";
import { colors } from "../theme";

// The Linewise mark from client/src/components/logo.tsx: two lines meet as an L, and
// the cobalt dot is the moment on the call worth hearing. The dot never touches the
// lines. `vertical`, `horizontal` and `dot` (each 0 to 1) draw it in.
export const LogoMark: React.FC<{
  size: number;
  vertical?: number;
  horizontal?: number;
  dot?: number;
}> = ({ size, vertical = 1, horizontal = 1, dot = 1 }) => {
  const clip = useId();
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ flexShrink: 0, overflow: "visible" }}
    >
      <clipPath id={clip}>
        <rect x={3} y={3} width={4} height={18 * vertical} />
        <rect
          x={3}
          y={17}
          width={4 + 14 * horizontal}
          height={horizontal > 0 ? 4 : 0}
        />
      </clipPath>
      <path
        d="M3 3h4v14h14v4H3z"
        fill={colors.foreground}
        clipPath={`url(#${clip})`}
      />
      <circle cx={15.5} cy={8.5} r={4 * dot} fill={colors.primary} />
    </svg>
  );
};

// Mark and wordmark, in the proportions the app uses (a 1.5rem mark beside 1.25rem type).
export const Logo: React.FC<{ size: number }> = ({ size }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.42,
      fontSize: size * 0.84,
      fontWeight: 600,
      letterSpacing: "-0.025em",
      lineHeight: 1,
    }}
  >
    <LogoMark size={size} />
    Linewise
  </span>
);
