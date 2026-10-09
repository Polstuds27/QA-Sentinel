import React from "react";
import { colors } from "../theme";
import { Logo } from "./Logo";

const TABS = [
  "Calls",
  "Call detail",
  "Scorecards",
  "Agents",
  "Export",
] as const;
export type AppTab = (typeof TABS)[number];

export const APP_HEADER_HEIGHT = 84;
export const APP_PADDING = 40;

// The app shell from frontend/src/App.tsx, simplified: the logo, the offline status and
// the tab row (text on a hairline; the open tab gets the cobalt rule and dot).
export const AppFrame: React.FC<{
  width: number;
  height: number;
  tab?: AppTab;
  /** Slot at the right of the header, in place of the tab row. */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}> = ({ width, height, tab, headerRight, children }) => (
  <div
    style={{
      width,
      height,
      boxSizing: "border-box",
      border: `1px solid ${colors.border}`,
      background: colors.background,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        height: APP_HEADER_HEIGHT,
        flexShrink: 0,
        padding: `0 ${APP_PADDING}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
        <Logo size={30} />
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 19,
            fontWeight: 500,
            color: colors.mutedForeground,
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 9999,
              background: colors.foreground,
            }}
          />
          Offline ready
        </span>
      </div>
      {headerRight ?? (
        <div
          style={{
            display: "flex",
            gap: 26,
            height: 46,
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          {TABS.map((label) => {
            const active = label === tab;
            return (
              <span
                key={label}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  fontSize: 19,
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  color: active ? colors.foreground : colors.mutedForeground,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    boxSizing: "border-box",
                    borderRadius: 9999,
                    border: `1px solid ${active ? colors.primary : colors.mutedForeground}`,
                    background: active ? colors.primary : "transparent",
                  }}
                />
                {label}
                {active ? (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: -1,
                      height: 1,
                      background: colors.primary,
                    }}
                  />
                ) : null}
              </span>
            );
          })}
        </div>
      )}
    </div>
    <div
      style={{
        flex: 1,
        padding: `28px ${APP_PADDING}px 0`,
        position: "relative",
      }}
    >
      {children}
    </div>
  </div>
);
