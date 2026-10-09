import { useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { cn } from "@/lib/utils"
import { findHidden, type Redaction } from "@/lib/pii"
import type { TranscriptLine } from "@/mock"

interface Token {
  text: string
  start: number
  end: number
}

function toSeconds(stamp: string): number {
  const [m, s] = stamp.split(":").map(Number)
  return m * 60 + s
}

// A line as the pieces to draw: one per word, except that hidden details (a card number,
// a name) collapse into one label that covers the time of every word it replaces.
// Lines carry a real time for every word. Calls scored before word times were kept do
// not, so their words are spread over the line at a speaking pace: close, not exact.
function tokens(line: TranscriptLine, lineEnd: number, found: Redaction[]): Token[] {
  const lineStart = line.words?.[0]?.start ?? toSeconds(line.time)
  const texts = line.words?.map((w) => w.text) ?? line.text.split(" ")
  const lengths = texts.reduce((sum, t) => sum + t.length + 1, 0)
  const pace = Math.min(lineEnd - lineStart, lengths * 0.065)
  let spent = 0
  let at = 0
  const words = texts.map((text, i) => {
    const real = line.words?.[i]
    const start = real?.start ?? lineStart + (spent / lengths) * pace
    spent += text.length + 1
    const end = real?.end ?? lineStart + (spent / lengths) * pace
    const from = at
    at += text.length + 1
    return { text, start, end, from, to: from + text.length }
  })

  const out: Token[] = []
  const hidden = findHidden(texts.join(" "), found)
  let i = 0
  while (i < words.length) {
    const range = hidden.find((r) => r.start < words[i].to && r.end > words[i].from)
    if (!range) {
      out.push({ text: words[i].text, start: words[i].start, end: words[i].end })
      i++
      continue
    }
    let last = i
    while (last + 1 < words.length && words[last + 1].from < range.end) last++
    // Keep what sits outside the hidden part in the same words: an opening bracket, a closing comma.
    const before = words[i].text.slice(0, Math.max(0, range.start - words[i].from))
    const after = words[last].text.slice(Math.max(0, range.end - words[last].from))
    out.push({ text: `${before}${range.label}${after}`, start: words[i].start, end: words[last].end })
    i = last + 1
  }
  return out
}

// The transcript is plain text. Colour appears only on the word being spoken, karaoke
// style, and says who is speaking: cobalt while the agent talks, yellow while the customer
// does. A line with no known speaker highlights in cobalt.
const SPOKEN: Record<string, { word: string; hover: string }> = {
  Agent: { word: "text-primary", hover: "hover:text-primary" },
  Customer: { word: "text-customer", hover: "hover:text-customer" },
};
const SPOKEN_DEFAULT = SPOKEN.Agent;

// Follows the audio. Clicking a word or a timestamp plays from there.
function Transcript({
  lines,
  duration,
  redactions,
  audioRef,
  onSeek,
}: {
  lines: TranscriptLine[]
  /** Length of the call in seconds, to know where the last line ends. */
  duration: number
  redactions?: Redaction[]
  audioRef: RefObject<HTMLAudioElement | null>
  onSeek: (seconds: number) => void
}) {
  const rows = useMemo(
    () =>
      lines.map((line, i) => {
        const next = lines[i + 1]
        const lineEnd = next ? (next.words?.[0]?.start ?? toSeconds(next.time)) : Math.max(duration, toSeconds(line.time) + 1)
        return tokens(line, lineEnd, redactions ?? [])
      }),
    [lines, duration, redactions],
  )
  // "line:word" of the word being spoken, or "" when nothing is.
  const [active, setActive] = useState("")
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let frame = 0
    const find = () => {
      const t = audio.currentTime
      // Nothing is "being spoken" before playback has started.
      if (t === 0 && audio.paused) return ""
      for (let l = rows.length - 1; l >= 0; l--) {
        for (let w = rows[l].length - 1; w >= 0; w--) if (rows[l][w].start <= t) return `${l}:${w}`
      }
      return ""
    }
    const update = () => setActive(find())
    const loop = () => {
      update()
      frame = requestAnimationFrame(loop)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(frame)
      update()
    }
    audio.addEventListener("play", start)
    audio.addEventListener("pause", stop)
    audio.addEventListener("ended", stop)
    audio.addEventListener("seeked", update)
    audio.addEventListener("emptied", update)
    if (!audio.paused) start()
    else update()
    return () => {
      cancelAnimationFrame(frame)
      audio.removeEventListener("play", start)
      audio.removeEventListener("pause", stop)
      audio.removeEventListener("ended", stop)
      audio.removeEventListener("seeked", update)
      audio.removeEventListener("emptied", update)
    }
  }, [audioRef, rows])

  // Keep the line being spoken on screen, without yanking the page when it already is.
  const activeLine = active ? Number(active.split(":")[0]) : -1
  useEffect(() => {
    if (activeLine < 0 || audioRef.current?.paused) return
    list.current?.children[activeLine]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [activeLine, audioRef])

  return (
    <ul ref={list} className="border-b border-border">
      {lines.map((line, l) => (
        <li key={l} className="grid grid-cols-[3rem_4.5rem_1fr] items-baseline gap-x-3 border-t border-border py-3">
          <button
            className="label text-left text-muted-foreground underline underline-offset-4 transition-colors duration-200 hover:text-primary"
            onClick={() => onSeek(rows[l][0]?.start ?? toSeconds(line.time))}
          >
            {line.time}
          </button>
          <span className={cn("label transition-colors duration-200", l === activeLine && (SPOKEN[line.speaker] ?? SPOKEN_DEFAULT).word)}>{line.speaker}</span>
          <span className="max-w-[60ch]">
            {rows[l].map((token, w) => (
              <span key={w}>
                <span
                  onClick={() => onSeek(token.start)}
                  className={cn(
                    "cursor-pointer transition-colors duration-150",
                    (SPOKEN[line.speaker] ?? SPOKEN_DEFAULT).hover,
                    `${l}:${w}` === active && (SPOKEN[line.speaker] ?? SPOKEN_DEFAULT).word,
                  )}
                >
                  {token.text}
                </span>{" "}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export { Transcript }
