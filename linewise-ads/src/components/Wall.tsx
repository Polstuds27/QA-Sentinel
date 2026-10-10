import React from "react";
import { AbsoluteFill } from "remotion";
import { colors, font } from "../theme";

// The gallery wall after hours: every scene sits on the app's dark background.
export const Wall: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: colors.background,
      color: colors.foreground,
      fontFamily: font,
      fontSize: 28,
      lineHeight: 1.45,
    }}
  >
    {children}
  </AbsoluteFill>
);
