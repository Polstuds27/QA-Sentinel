---
name: Linya
description: Gallery White. An off-white wall, black type and one cobalt accent, applied to a call QA tool.
colors:
  background: "#fafaf8"
  foreground: "#111111"
  primary: "#1d3fd1"
  primary-foreground: "#ffffff"
  muted: "#f0f0ec"
  muted-foreground: "#5d5d58"
  border: "#dcdcd8"
  destructive: "#b3261e"
  paper: "#ffffff"
  ink: "#111111"
  cobalt: "#1d3fd1"
  dark-background: "#0e0e0e"
  dark-foreground: "#f2f2ef"
  dark-primary: "#7d97ff"
  dark-primary-foreground: "#0e0e0e"
  dark-muted: "#1a1a19"
  dark-muted-foreground: "#a5a5a0"
  dark-border: "#2c2c2a"
  dark-destructive: "#ff8a80"
typography:
  page-heading:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "3rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  section-heading:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "Schibsted Grotesk Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.45
rounded:
  none: "0"
  full: "9999px"
spacing:
  gutter: "20px"
  gutter-sm: "32px"
  column-gap: "40px"
  panel-top: "80px"
  section: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    height: "40px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.full}"
    height: "40px"
    padding: "0 20px"
  button-outline-hover:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.background}"
  badge:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.full}"
    height: "24px"
    padding: "0 10px"
  input:
    backgroundColor: "transparent"
    rounded: "{rounded.none}"
    height: "40px"
    padding: "0 12px"
---

# Design System: Linya

The source of truth for every value here is `src/index.css` and the components in `src/components/ui/`. If this file and the code disagree, the code is right and this file needs updating.

## Overview

Gallery White treats the page as a gallery wall. The wall is off-white and almost empty. Type is black, in one sans-serif family. The calls are the work: each one is a row on the wall with a small dot beside it, and the call on view gets the cobalt dot. Cobalt is the only accent and it means one of two things: the primary action, or the item currently on view.

The direction was set in these words: minimalist, lots of white space, mostly black and white with one accent colour, clean sans-serif type, no heavy shadows or gradients. Treat that as binding.

The concept PDF (`QA-Sentinel-Concept.pdf`, written under the product's earlier name) draws the app in navy and teal with all-caps monospace labels and red, amber and green pills. That look is superseded by this file. The PDF still decides what is on each screen.

Dark mode is the same gallery after hours: a near-black wall, off-white type, and a lighter cobalt. It follows the system setting (`src/main.tsx`); there is no toggle.

QA analysts use this at a desk, working through a batch of calls. Scanning and density matter more than display: this is a tool, so headings are smaller and gaps tighter than a marketing page would use.

## Logo

Linya is Filipino for "line". The mark is two heavy lines meeting as a square-cornered L, with one cobalt dot in the open corner. The lines are the call; the dot is the moment on it worth hearing. The dot never touches the lines.

- **Geometry:** on a 24-unit square, the L is 4 units thick and runs from 3 to 21 on both axes. The dot is 8 units across, centred at (15.5, 8.5), which leaves a 4.5-unit gap to each line.
- **In the app:** `Logo` in `src/components/logo.tsx`. The mark is a 1.5rem square with the L in `--foreground` and the dot in `--primary`; the wordmark is "Linya" at `text-xl`, weight 600, `tracking-tight`, in sentence case. Both follow the theme.
- **Files** (in `public/`): `logo.png` is the mark and wordmark on a transparent background for light surfaces; `logo-dark.png` is the same in off-white with the lighter cobalt for dark surfaces; `logo-mark.png` is the mark alone on a 512px square of the wall colour, for avatars and social posts; `favicon.svg` is the mark for the browser tab.
- **Rules:** the dot is always cobalt and there is only one. Do not let it touch or overlap the L, round the L's corners, tilt the mark, or set the wordmark in capitals. Keep clear space of at least the dot's width around the logo.

## Colors

All colours are CSS variables on `:root` and `.dark`, exposed to Tailwind through `@theme inline`. Use the semantic token, never the hex.

### Primary

- **Cobalt** `--primary`: `#1d3fd1` light, `#7d97ff` dark. The one primary button per view (Export on call detail), the active tab rule and dot, the dot beside the selected call, checked checkboxes, the focus ring, the text caret, and text selection.
- `--primary-foreground`: `#ffffff` light, `#0e0e0e` dark.

### Neutral

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--background` | `#fafaf8` | `#0e0e0e` | The wall |
| `--foreground` | `#111111` | `#f2f2ef` | Text, outline button border, checkbox edge, the rule above a total |
| `--muted` | `#f0f0ec` | `#1a1a19` | Ghost button hover, secondary badge |
| `--muted-foreground` | `#5d5d58` | `#a5a5a0` | Supporting text, labels, N/A verdicts |
| `--border` | `#dcdcd8` | `#2c2c2a` | Hairline rules, input edge, badge outline |
| `--secondary` | `#111111` | `#f2f2ef` | Inverse button |
| `--destructive` | `#b3261e` | `#ff8a80` | Red calls, failed checks, an invalid total |

### Fixed inks

`--paper` `#ffffff`, `--ink` `#111111`, `--cobalt` `#1d3fd1`. These do **not** change in dark mode. Nothing uses them yet; they are reserved for exported reports and print, which keep their own colours.

### Call status without traffic lights

The spec scores calls green (85 and up), amber (70 to 84) and red (below 70, or any critical failure). The one-accent rule means those are not three hues. `StatusBadge` in `src/App.tsx` carries them like this:

| Status | Badge variant | Looks like |
|---|---|---|
| Red | `destructive` | Destructive border and text |
| Amber | `strong` | Foreground border and text |
| Green | `outline` | Hairline border, muted text |

The status word is always written next to the score ("71 / 100 · Amber"), because the outline weight alone is not enough to tell amber from green. Check verdicts follow the same idea: an icon and a word (Pass, Fail, Critical, N/A), with only Fail and Critical in the destructive colour.

### Named Rules

- **One accent.** Cobalt is the only colour. Do not add a second hue for status, variety, or decoration.
- **Cobalt means something.** It marks the action or the selection. It is never a background wash or a border on something inert.
- **Destructive is for something wrong:** a red call, a failed check, an invalid input. Never decoration.
- **Supporting text is `text-muted-foreground`**, never a lowered opacity on the wall.

## Typography

One family: **Schibsted Grotesk Variable** (`@fontsource-variable/schibsted-grotesk`, self-hosted so the app works offline), set as `--font-sans` and `--font-heading`. There is no serif and no monospace.

### Hierarchy

| Role | Size | Weight | Line height | Tracking | Class |
|---|---|---|---|---|---|
| Call heading, score | 2.25rem, 3rem from `sm` | 600 | 1 | -0.035em | `display text-4xl sm:text-5xl` |
| Section heading | 1.875rem, 2.25rem from `sm` | 600 | 1 | -0.035em | `display text-3xl sm:text-4xl` |
| Panel title, row title, total | 1.25rem | 500 | snug | -0.025em | `text-xl font-medium tracking-tight` |
| Body, transcript text | 1rem | 400 | 1.625 | 0 | `text-base` |
| Scorecard row | 0.875rem | 400 | 1.625 | 0 | `text-sm leading-relaxed` |
| Button, tab | 0.875rem | 500 | | 0 | `text-sm font-medium` |
| Label, timestamp, speaker | 0.8125rem | 500 | 1.45 | 0 | `label` |
| Badge | 0.75rem | 500 | | 0 | `text-xs` |

### Named Rules

- **Sentence case everywhere.** No all-caps headings, labels or verdicts.
- **Display maximum is 6rem. Tracking never goes below -0.04em.**
- Headings use `text-wrap: balance`, paragraphs and list items `text-wrap: pretty`.
- Supporting paragraphs are capped at 48ch; transcript lines at 60ch.
- `tabular-nums` is for scores, weights and totals. Do not put it on timestamps: in this face it widens the colon.
- Emphasis comes from weight, size, or cobalt. Never from gradient text.

## Layout

- **Container:** `max-w-7xl` (80rem), centred, with `px-5` gutters, `px-8` from `sm`.
- **Grid:** 12 columns from `lg` with `gap-x-10`. A section puts its heading (and any filter or description) in 5 columns and its content in 7. Call detail splits the other way: transcript in 7, scorecard in 5.
- **Rhythm:** a tab panel starts at `pt-12` (`pt-20` from `sm`) and ends with `pb-32`. Sections inside a panel are `gap-24` apart. Heading to list is `mb-5`.
- **Lists** are rows divided by hairlines (`border-t border-border`, `py-3` for dense rows, `py-4` to `py-6` for rows with controls), not grids of cards.
- **Breakpoints:** everything is a single column below `lg`. Rows with controls wrap their controls under the label.
- **Navigation:** a sticky bar on the wall colour with no border, 4rem tall from `md`. Below `md` the tabs drop to a second row that scrolls sideways.

## Elevation & Depth

There is none. No `box-shadow` anywhere, no gradients, no blur, no glass. Things are separated by white space or a 1px hairline. An element that needs to stand out gets the darker edge (`border-foreground`) instead of a shadow, as the rule above the scorecard total does. Focus is a 2px cobalt `outline`, not a ring shadow.

## Shapes

- `--radius` is `0`. Inputs, checkboxes, rules and panels are square.
- **Pills are the exception and only for small controls:** buttons and badges are `rounded-full`. So are the small marker dots (`size-2`).
- Lines are 1px. The only dashed line is the upload drop zone.

## Components

shadcn/ui components (Base UI, `base-nova`) live in `src/components/ui/` and have been restyled in place. Use them as they are; pass `className` for layout only. A newly added component arrives with the stock look and must be restyled to these rules before use.

### Buttons

`Button` is a pill, `text-sm font-medium`, with a 200ms colour transition.

- **default:** cobalt fill. Hover inverts to foreground fill with background text. Use it for the primary action only, once per view.
- **outline:** transparent with a 1px foreground border. Hover fills with foreground.
- **secondary:** foreground fill; hover turns cobalt.
- **ghost:** no border; hover `bg-muted`.
- **destructive:** destructive border and text; hover fills.
- **Sizes:** `sm` 2.25rem, default 2.5rem, `lg` 3rem with `text-base`. Icon buttons are `icon-sm` 2.25rem, `icon` 2.5rem.

### Badges

`Badge` is a 1.5rem pill, `text-xs font-medium`, with tabular numerals. Variants: `default` (cobalt fill), `secondary` (`bg-muted`), `outline`, `strong` and `destructive`. The last three carry call status, as above.

### Form controls

- **`Input`** is a square 2.5rem box with a hairline edge that darkens to foreground on hover and focus.
- **`Checkbox`** is a square with a foreground edge; checked, it fills cobalt.
- Pair a control with its label through `Field` and `FieldLabel` (`orientation="horizontal"`).

### Navigation

**Tabs** are text labels on a hairline. Each trigger has a small dot and `text-muted-foreground`; the active one turns foreground, gets a 1px cobalt underline, and its dot fills cobalt. `TabsTrigger` draws the dot itself.

### Audio player

`AudioPlayer` in `src/components/audio-player.tsx` replaces the browser's audio controls. It is the call drawn as a line, between two hairlines.

- **Track:** `Slider` is a 1px hairline across a 4rem-tall strip. The played part darkens to foreground and the playhead is a `size-3` cobalt dot that grows slightly on hover and drag.
- **Waveform:** `Waveform` (`src/components/waveform.tsx`) draws the recording's real loudness as 2px square bars with 2px gaps on a canvas behind the line. The agent's channel rises above the line and the customer's hangs below it, so you can see who is speaking. Played bars are foreground; bars still ahead are muted-foreground at 40%.
- **Live motion:** while audio plays, the bars within a few steps of the playhead turn cobalt and lift and fall with the loudness of the voice at that instant. This is the one moving thing on the page. It stops when playback pauses and is off under `prefers-reduced-motion`.
- **Flag ticks:** every failed check with a timestamp gets a 1px destructive line the full height of the strip at that moment. It thickens on hover and focus, and clicking it plays from there.
- **Controls:** an outline icon button for play and pause, a ghost icon button for mute, and the current time and duration as `label` text. Below `sm` the waveform takes the full width and the controls sit in a row beneath it.
- **No recording yet:** the controls are disabled and the dot turns muted, but the line still shows the call's length and where its flags are.

### Call rows and the drop zone

- **Call row** (in `src/App.tsx`): a `size-2` dot, the call number as the row title, and a `label` line of agent, duration and scorecard beneath; flag count and status badge on the right. The dot is hollow by default and cobalt when that call is the one open in call detail, or on hover.
- **Drop zone:** a square dashed frame at least 12rem tall. The edge darkens on hover and keyboard focus. The file input covers it invisibly, so both click and drop work.
- **Empty state:** `Empty` with a title and one line saying how to get results back. No border.

## Do's and Don'ts

### Do:

- Leave space. When in doubt, add more.
- Use hairlines to separate things.
- Keep cobalt for the action and the selection.
- Write the status word beside every score.
- Check every change in both themes and at phone width.
- Label mock calls and illustrative numbers as such.

### Don't:

- Add shadows, gradients, blur, or glass.
- Add a second accent colour, including green and amber for status.
- Round the corners of inputs, panels, or images.
- Use all-caps or a monospace face for labels, timestamps or verdicts.
- Wrap ordinary content in cards.
- Put a small label or kicker above a heading.
- Write `dark:` colour overrides or raw hex values in components.

## Motion

Motion is sparse and uses `--ease-out-expo` (`cubic-bezier(0.16, 1, 0.3, 1)`).

| Name | Where | What |
|---|---|---|
| `animate-hang` | Tab panels | The panel settles 0.75rem into place and fades in, 0.6s, on tab change |
| Waveform | Audio player | Bars at the playhead turn cobalt and move with the voice while audio plays |
| Hover | Buttons, tabs, row dots, inputs | 200ms colour transition |

The animation uses `backwards` fill, so content is visible by default if it never runs. All of it is switched off under `prefers-reduced-motion`.
