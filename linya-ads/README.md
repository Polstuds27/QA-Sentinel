# Linya ad

A 1-minute promo video for Linya, built with [Remotion](https://www.remotion.dev).
1920x1080, 60 fps, 60 seconds. Composition id: `LinyaAd`.

The screens are recreated from the app in `../frontend/` and show its scripted sample
calls (`src/data/demo.ts`). The video is a concept of the product experience: it shows
no accuracy or speed numbers, and the only scores on screen are the ones the app's own
scorecard gives those sample calls.

## Commands

```sh
npm install
npm run dev        # preview in Remotion Studio
npm run render     # writes out/linya-ad.mp4 (h264, 60 fps)
npm run lint
npm run audio      # regenerates the music and sound effects in public/audio/
```

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
- `src/data/demo.ts`: all sample transcript and score data.
- `src/theme.ts`: colours and type from the app's dark theme, the tagline and the team name.
- `src/scenes/`: one component per scene. `src/components/`: shared pieces.
