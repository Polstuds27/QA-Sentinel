# Linewise ad

A 1-minute promo video for Linewise (the folder keeps the product's earlier name), built with [Remotion](https://www.remotion.dev).
1920x1080, 60 fps, 60 seconds. Composition id: `LinyaAd`.

The middle of the video is the real app, recorded from the browser: one run of the
scripted test call `../client/samples/call-147.m4a`, and the same upload again with all
internet access blocked. The hook, the problem, the logo, the "what runs locally" card
and the outro are animation. The video shows no accuracy or speed numbers; the only
numbers on screen are the ones the app displayed for that call.

## Commands

```sh
npm install
npm run dev        # preview in Remotion Studio
npm run render     # writes out/linya-ad.mp4 (h264, 60 fps)
npm run lint
npm run audio      # regenerates the music and sound effects in public/audio/
npm run record     # records the app again into public/demo/ (see below)
```

## The recorded demo

```sh
npm run record
```

Needs `ollama serve` running, and uses `npm run whisper` from `../client` if it is up.
The script starts its own copy of the app with an empty database (so the calls already
on this machine are neither shown nor touched), drives it in headless Chrome in dark
mode, and saves what the browser painted:

- `public/demo/online.mp4`: upload, scoring, the call detail, a flag clicked, the
  scorecard, a coaching note, Export PDF, then the scorecard editor, the phones
  section and the agent dashboard.
- `public/demo/offline.mp4`: the same upload in a browser that can reach nothing but
  this machine. The script stops if that block is not in effect.
- `public/demo/report.pdf` and `report.png`: the report the app exported, and its first
  page as an image.
- `src/data/footage.json`: when each thing happened and where it was on screen. The
  scenes take their cuts, zooms and outlines from this file.

Nothing in the footage is drawn or retouched. The video only chooses which part plays,
how fast (waiting is sped up and labelled, not cut out) and where the camera looks. The
cobalt outlines and click rings are drawn on top to point at things; the recorded
browser shows no cursor.

## Voiceover and captions

```sh
npm run transcribe -- /path/to/voiceover.mp3
```

This copies the file to `public/voiceover.<ext>`, stops if it is longer than 60 seconds,
and transcribes it on this machine with whisper.cpp into `src/transcript.json`. The
first run downloads and builds whisper.cpp and a model into `whisper.cpp/` (ignored by
git). The video then plays the voiceover from frame 0 and shows captions timed to each
word. Without a transcript the video has music and sound effects only, and no captions.

The script prints every word with its start time. Use those to set the scene starts and
cues in `src/timing.ts`, and fix any misheard word by editing `src/transcript.json`.

## Sound

`scripts/make-audio.mjs` synthesises the background music and every sound effect from
sine waves and noise, so there is nothing to license. The music follows the scene starts
in `src/timing.ts`; run `npm run audio` again after moving a scene (Node 23.6 or newer).

The music is two stems, mid and side. While the voiceover is speaking the middle of the
music drops back and the sides come up, so it opens out around the voice; between lines
it closes back in. The levels are in `src/mix.ts`, and the voice timing comes from
`src/transcript.json`. Sound effects are placed in each scene with `<Sfx>` and sit left
or right to match where they happen on screen.

## Where things are

- `src/timing.ts`: every timing, in seconds. Scene starts and the cues inside scenes.
- `src/data/footage.json`: the recording's timeline. `src/data/demo.ts`: the one sample
  line the problem scene quotes.
- `src/theme.ts`: colours and type from the app's dark theme, the tagline and the team name.
- `src/scenes/`: one component per scene. `src/components/`: shared pieces.
