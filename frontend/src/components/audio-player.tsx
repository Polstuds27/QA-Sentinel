import { useState, type RefObject } from "react"
import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

export interface AudioMarker {
  seconds: number
  label: string
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

// The call as a line: a hairline track, a cobalt dot for the playhead, and a tick
// at every flagged moment. Without a recording the line still shows where the flags are.
function AudioPlayer<M extends AudioMarker>({
  audioRef,
  src,
  fallbackDuration,
  markers,
  onMarkerClick,
}: {
  audioRef: RefObject<HTMLAudioElement | null>
  src?: string
  fallbackDuration: number
  markers: M[]
  onMarkerClick: (marker: M) => void
}) {
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [loaded, setLoaded] = useState<number | null>(null)
  const [muted, setMuted] = useState(false)

  const ready = loaded !== null
  const duration = loaded ?? fallbackDuration

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => {})
    else audio.pause()
  }

  function scrub(value: number | readonly number[]) {
    const next = typeof value === "number" ? value : value[0]
    if (audioRef.current) audioRef.current.currentTime = next
    setCurrent(next)
  }

  return (
    <div className="flex items-center gap-3 border-y border-border py-4 sm:gap-5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onDurationChange={(e) => setLoaded(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)}
        onEmptied={() => { setLoaded(null); setCurrent(0) }}
        onVolumeChange={(e) => setMuted(e.currentTarget.muted)}
      />
      <Button variant="outline" size="icon" disabled={!ready} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <span className="label w-10 shrink-0 text-right">{formatTime(current)}</span>
      <div className="relative min-w-0 flex-1">
        <Slider
          aria-label="Seek"
          value={[Math.min(current, duration)]}
          min={0}
          max={duration}
          step={1}
          disabled={!ready}
          onValueChange={scrub}
        />
        {markers.filter((m) => m.seconds <= duration).map((m) => (
          <button
            key={`${m.seconds}-${m.label}`}
            onClick={() => onMarkerClick(m)}
            title={`${formatTime(m.seconds)} · ${m.label}`}
            aria-label={`Jump to ${formatTime(m.seconds)}: ${m.label}`}
            style={{ left: `${(m.seconds / duration) * 100}%` }}
            className="group absolute bottom-1/2 flex h-6 w-4 -translate-x-1/2 items-end justify-center"
          >
            <span className="h-3 w-px bg-destructive transition-[height] duration-200 group-hover:h-5 group-focus-visible:h-5" />
          </button>
        ))}
      </div>
      <span className="label w-10 shrink-0 text-muted-foreground">{formatTime(duration)}</span>
      <Button
        variant="ghost"
        size="icon"
        disabled={!ready}
        onClick={() => { if (audioRef.current) audioRef.current.muted = !audioRef.current.muted }}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeXIcon /> : <Volume2Icon />}
      </Button>
    </div>
  )
}

export { AudioPlayer }
