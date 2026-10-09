import React from "react";
import { colors } from "../theme";
import type { CallStatus } from "../data/scoring";

// Call status without traffic lights (frontend/DESIGN.md): red is the destructive
// edge, amber the foreground edge, green a hairline. The word always sits beside it.
const EDGE: Record<CallStatus, { border: string; color: string }> = {
  red: { border: colors.destructive, color: colors.destructive },
  amber: { border: colors.foreground, color: colors.foreground },
  green: { border: colors.border, color: colors.mutedForeground },
};

export const StatusBadge: React.FC<{
  status: CallStatus;
  size?: number;
  children: React.ReactNode;
}> = ({ status, size = 22, children }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      height: size * 1.9,
      padding: `0 ${size * 0.8}px`,
      borderRadius: 9999,
      border: `1px solid ${EDGE[status].border}`,
      color: EDGE[status].color,
      fontSize: size,
      fontWeight: 500,
      lineHeight: 1,
      whiteSpace: "nowrap",
      fontVariantNumeric: "tabular-nums",
    }}
  >
    {children}
  </span>
);
