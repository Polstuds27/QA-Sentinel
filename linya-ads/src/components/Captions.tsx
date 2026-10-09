import React, { useMemo } from "react";
import {
  AbsoluteFill,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Caption } from "@remotion/captions";
import { CAPTION_BAND, colors, font } from "../theme";

const MAX_WORDS = 4;
// A pause this long (ms) ends a phrase, as does the end of a sentence.
const PAUSE_MS = 450;
// How long a page stays up after its last word if nothing follows it.
const HOLD_MS = 700;

interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

interface Page {
  words: Word[];
  startMs: number;
  endMs: number;
}

// Cut the transcript into phrases at sentence ends and pauses, then share each phrase
// out over pages of two to four words, so a page never runs across a sentence and a
// sentence never leaves one word stranded on its own page.
const toPages = (captions: Caption[]): Page[] => {
  const words: Word[] = captions
    .map((c) => ({ text: c.text.trim(), startMs: c.startMs, endMs: c.endMs }))
    .filter((w) => w.text.length > 0);

  const phrases: Word[][] = [[]];
  words.forEach((word, i) => {
    phrases[phrases.length - 1].push(word);
    const next = words[i + 1];
    if (
      next &&
      (/[.!?]$/.test(word.text) || next.startMs - word.endMs > PAUSE_MS)
    ) {
      phrases.push([]);
    }
  });

  const pages: Page[] = [];
  for (const phrase of phrases) {
    const count = Math.ceil(phrase.length / MAX_WORDS);
    let taken = 0;
    for (let i = 0; i < count; i++) {
      const size = Math.ceil((phrase.length - taken) / (count - i));
      const chunk = phrase.slice(taken, taken + size);
      taken += size;
      pages.push({
        words: chunk,
        startMs: chunk[0].startMs,
        endMs: chunk[chunk.length - 1].endMs,
      });
    }
  }
  return pages.map((page, i) => ({
    ...page,
    endMs: Math.min(page.endMs + HOLD_MS, pages[i + 1]?.startMs ?? Infinity),
  }));
};

// Kinetic captions: each word settles in as it is spoken, and the word being spoken is
// cobalt. Sentence case, like everything else in the app.
export const Captions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => toPages(captions), [captions]);
  const ms = (frame / fps) * 1000;
  const page = pages.find((p) => ms >= p.startMs && ms < p.endMs);
  if (!page) return null;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
      <div
        style={{
          height: CAPTION_BAND,
          display: "flex",
          alignItems: "center",
          gap: "0.26em",
          fontFamily: font,
          fontSize: 84,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {page.words.map((word, i) => {
          const shown = spring({
            frame: ((ms - word.startMs) / 1000) * fps,
            fps,
            config: { damping: 200 },
            durationInFrames: Math.round(0.3 * fps),
          });
          const speaking =
            ms >= word.startMs &&
            ms < (page.words[i + 1]?.startMs ?? page.endMs);
          return (
            <span
              key={i}
              style={{
                opacity: shown,
                transform: `translateY(${(1 - shown) * 30}px)`,
                color: speaking ? colors.primary : colors.foreground,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
