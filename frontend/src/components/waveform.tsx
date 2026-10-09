import { useEffect, useRef, useState, type RefObject } from "react"

const ENVELOPE_RATE = 100 // loudness samples per second of audio
const BAR = 2 // bar width in CSS px
const GAP = 2

interface Envelope {
  left: Float32Array
  right: Float32Array
}

// Decode the recording once and keep its loudness over time, one track per channel.
// Call recordings put the agent on the left channel and the customer on the right.
function useEnvelope(src?: string): Envelope | null {
  const [state, setState] = useState<{ src: string; envelope: Envelope } | null>(null)

  useEffect(() => {
    if (!src) return
    let cancelled = false
    void (async () => {
      try {
        const data = await (await fetch(src)).arrayBuffer()
        const audio = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(data)
        const size = Math.max(1, Math.ceil(audio.duration * ENVELOPE_RATE))
        const step = audio.sampleRate / ENVELOPE_RATE
        const tracks = [0, Math.min(1, audio.numberOfChannels - 1)].map((channel) => {
          const samples = audio.getChannelData(channel)
          const out = new Float32Array(size)
          for (let i = 0; i < size; i++) {
            let peak = 0
            const end = Math.min(samples.length, Math.floor((i + 1) * step))
            for (let j = Math.floor(i * step); j < end; j++) peak = Math.max(peak, Math.abs(samples[j]))
            out[i] = peak
          }
          return out
        })
        let loudest = 1e-4
        tracks.forEach((t) => t.forEach((v) => (loudest = Math.max(loudest, v))))
        tracks.forEach((t) => t.forEach((v, i) => (t[i] = Math.pow(v / loudest, 0.7))))
        if (!cancelled) setState({ src, envelope: { left: tracks[0], right: tracks[1] } })
      } catch {
        // An undecodable file just leaves the plain line.
      }
    })()
    return () => { cancelled = true }
  }, [src])

  return state && state.src === src ? state.envelope : null
}

function peakBetween(track: Float32Array, from: number, to: number): number {
  let peak = 0
  for (let i = Math.max(0, from); i < Math.min(track.length, Math.max(to, from + 1)); i++) peak = Math.max(peak, track[i])
  return peak
}

// The call drawn as sound: agent above the line, customer below it. Played bars darken,
// and while the audio plays the bars at the playhead turn cobalt and move with the voice.
function Waveform({
  audioRef,
  src,
  duration,
  playing,
  onTime,
}: {
  audioRef: RefObject<HTMLAudioElement | null>
  src?: string
  duration: number
  playing: boolean
  onTime: (seconds: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const envelope = useEnvelope(src)
  const level = useRef({ left: 0, right: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let frame = 0

    function draw(now: number) {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext("2d")
      if (!canvas || !ctx) return
      const ratio = window.devicePixelRatio || 1
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.clearRect(0, 0, width, height)
      if (!envelope || duration <= 0) return

      const styles = getComputedStyle(canvas)
      const played = styles.getPropertyValue("--foreground")
      const ahead = styles.getPropertyValue("--muted-foreground")
      const live = styles.getPropertyValue("--primary")

      const time = audioRef.current?.currentTime ?? 0
      const moving = playing && !still
      const at = Math.floor(time * ENVELOPE_RATE)
      // Ease toward the loudness of each voice right now, so the motion follows speech.
      const target = moving
        ? { left: peakBetween(envelope.left, at - 4, at + 4), right: peakBetween(envelope.right, at - 4, at + 4) }
        : { left: 0, right: 0 }
      level.current.left += (target.left - level.current.left) * 0.2
      level.current.right += (target.right - level.current.right) * 0.2

      const count = Math.max(1, Math.floor((width + GAP) / (BAR + GAP)))
      const offset = (width - (count * (BAR + GAP) - GAP)) / 2
      const reach = height / 2 - 1
      const head = (time / duration) * count
      const perBar = (duration * ENVELOPE_RATE) / count

      for (let i = 0; i < count; i++) {
        const from = Math.floor(i * perBar)
        const to = Math.floor((i + 1) * perBar)
        const near = Math.exp(-Math.pow((i + 0.5 - head) / 5, 2))
        const wobble = 0.55 + 0.45 * Math.sin(now / 90 + i * 1.9)
        const lift = near * wobble * 0.55
        const up = Math.min(1, peakBetween(envelope.left, from, to) * 0.8 + lift * level.current.left)
        const down = Math.min(1, peakBetween(envelope.right, from, to) * 0.8 + lift * level.current.right)
        const isLive = moving && near > 0.2
        ctx.globalAlpha = isLive || i + 0.5 <= head ? 1 : 0.4
        ctx.fillStyle = isLive ? live : i + 0.5 <= head ? played : ahead
        const x = offset + i * (BAR + GAP)
        const top = Math.max(0.5, up * reach)
        const bottom = Math.max(0.5, down * reach)
        ctx.fillRect(x, height / 2 - top, BAR, top + bottom)
      }
      ctx.globalAlpha = 1
    }

    function tick(now: number) {
      onTime(audioRef.current?.currentTime ?? 0)
      draw(now)
      frame = requestAnimationFrame(tick)
    }

    if (playing) {
      frame = requestAnimationFrame(tick)
    } else {
      // Let the live bars settle, then hold still.
      let settle = 20
      const rest = (now: number) => {
        draw(now)
        if (settle-- > 0) frame = requestAnimationFrame(rest)
      }
      frame = requestAnimationFrame(rest)
    }

    const audio = audioRef.current
    const redraw = () => draw(performance.now())
    const resize = new ResizeObserver(redraw)
    resize.observe(canvas)
    audio?.addEventListener("seeked", redraw)
    const theme = window.matchMedia("(prefers-color-scheme: dark)")
    theme.addEventListener("change", redraw)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      audio?.removeEventListener("seeked", redraw)
      theme.removeEventListener("change", redraw)
    }
  }, [audioRef, envelope, duration, playing, onTime])

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
}

export { Waveform }
