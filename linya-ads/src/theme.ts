import type { CSSProperties } from "react";
import { loadFont } from "@remotion/google-fonts/SchibstedGrotesk";

// Schibsted Grotesk is the app's only typeface (client/src/index.css).
const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

export const font = fontFamily;

// The app's dark theme: the `.dark` tokens in client/src/index.css. Cobalt is the
// accent; no shadows, no gradients, square corners (client/DESIGN.md).
export const colors = {
  background: "#0e0e0e",
  foreground: "#f2f2ef",
  primary: "#7d97ff",
  primaryForeground: "#0e0e0e",
  muted: "#1a1a19",
  mutedForeground: "#a5a5a0",
  border: "#2c2c2a",
  destructive: "#ff8a80",
  // Call status: passed and needs review. Failed is `destructive`.
  statusGreen: "#56d364",
  statusAmber: "#f0a13a",
  // The word being spoken in a transcript while the customer talks. The agent's is `primary`.
  customer: "#f2c94c",
} as const;

// The app's `display` utility: headings and scores.
export const display: CSSProperties = {
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "-0.035em",
};

// Page margins. The bottom band is kept clear for the captions.
export const PAD_X = 96;
export const PAD_TOP = 110;
export const CAPTION_BAND = 230;

export const TAGLINE = "Every call, scored locally.";
export const CREDIT = "Developed by Team Busseng";
