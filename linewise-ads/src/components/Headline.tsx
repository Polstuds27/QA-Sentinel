import React from "react";
import { display } from "../theme";
import { type Clock, enter } from "./motion";

const WORD_STAGGER = 0.07;

// A heading that arrives one word at a time.
export const Headline: React.FC<{
  clock: Clock;
  at: number;
  out?: number;
  size?: number;
  style?: React.CSSProperties;
  children: string;
}> = ({ clock, at, out, size = 120, style, children }) => {
  const words = children.split(" ");
  const gone = out === undefined ? 0 : enter(clock, out, 0.4);
  return (
    <h1
      style={{
        ...display,
        fontSize: size,
        margin: 0,
        textWrap: "balance",
        opacity: 1 - gone,
        ...style,
      }}
    >
      {words.map((word, i) => {
        const shown = enter(clock, at + i * WORD_STAGGER);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              whiteSpace: "pre",
              opacity: shown,
              transform: `translateY(${(1 - shown) * size * 0.3}px)`,
            }}
          >
            {i < words.length - 1 ? `${word} ` : word}
          </span>
        );
      })}
    </h1>
  );
};
