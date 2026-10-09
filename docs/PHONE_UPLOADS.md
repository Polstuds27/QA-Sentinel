# Sending call recordings from an iPhone to Linya

Agents record calls on their iPhones (iOS saves the recording in the Notes app). With the
"Send to Linya" shortcut, getting a recording scored takes two taps: **Share**, then
**Send to Linya**. Linya knows which agent sent it, scores recordings one at a time, and
ignores the same recording sent twice.

What has and has not been tested: the server, the Agents page, the queue and the
duplicate check were tested on the Mac with two simulated devices uploading at once. The
shortcut steps below were written from how Shortcuts works and have **not** been run on
an iPhone yet. Go through the test checklist at the end before relying on it.

## How it fits together

```
iPhone (Notes → Share → Send to Linya)
        │  POST the audio to the agent's upload link
        ▼
Upload server on the QA laptop   (server/, port 8787)
        │  stores the file, tags it with the agent, puts it in the queue
        ▼
Linya app on the QA laptop       (Local AI on)
           takes one recording at a time → transcribe → redact → score
```

The server only receives and queues. Transcribing and scoring still happen in the Linya
app on the laptop, with the same local models as a drag-and-drop upload.

## 1. Start it (on the laptop)

Four things run, each in its own terminal tab, all from `frontend/`:

```sh
ollama serve          # scoring model
npm run whisper       # speech to text (optional; falls back to in-browser Whisper)
npm run server        # the upload server, new
npm run dev           # the app
```

First time only: `cd server && npm install`.

`npm run server` prints the addresses phones can use, for example
`same Wi-Fi: http://192.168.1.23:8787`. macOS may ask whether to allow incoming
connections for "node": choose **Allow**.

## 2. Add the agents

In Linya, open the **Agents** tab.

1. Type the agent's name and device, press **Add agent**.
2. Press **Show link**. You get the agent's upload link, a **Copy link** button and a QR
   code of the same link.
3. The link is that agent's key. Anyone holding it can send recordings as them, so give
   each agent only their own.
4. **Revoke** turns a device off at once. The agent then needs a new one (add them again).

Each agent's row shows when they last uploaded.

## 3. Build the shortcut (once, on one iPhone)

1. Open **Shortcuts**, tap **+**, and name it **Send to Linya**.
2. Tap the **ⓘ** at the bottom, turn on **Show in Share Sheet**, tap Done.
3. The top of the shortcut now reads "Receive **Any** input from **Share Sheet**". Tap
   **Any**, clear everything, and leave only **Media** and **Files** on.
4. Add the action **Text**. Leave its box empty for now.
5. Add the action **Get Contents of URL**.
   - For the URL, pick the variable **Text** (from step 4).
   - Tap the arrow to show more. Set **Method** to **POST**.
   - Set **Request Body** to **Form**.
   - Tap **Add new field**, choose **File**. Key: `file`. Value: the variable
     **Shortcut Input**.
6. Add the action **Get Dictionary Value**. Set it to get the **Value** for the key
   `message` in **Contents of URL**.
7. Add the action **Show Notification**. Put **Dictionary Value** in the body. Title: `Linya`.
8. Tap **ⓘ** again, open **Setup**, tap **Add Question**, and pick the **Text** action's
   text. Question: `Paste your Linya upload link`. Leave the default answer empty.
9. Tap the share icon, choose **Copy iCloud Link**, and send that one link to the team.

Nobody edits the shortcut per device. When an agent adds it from the iCloud link, it asks
them the question from step 8, and they paste their own link.

## 4. Each agent, once

1. Join the same Wi-Fi as the QA laptop.
2. Open the iCloud link, tap **Add Shortcut**.
3. When asked for the Linya upload link: point the Camera at the QR code on the Agents tab,
   tap the link preview and hold to **Copy**, then paste it. Or receive the link by
   AirDrop or message and paste that.
4. The first time it runs, iOS asks to let Shortcuts find devices on the local network
   and to send the file: choose **Allow** / **Always Allow**.

## 5. Sending a recording

In **Notes**, open the note with the call recording, share the audio, and choose
**Send to Linya**. A notification says "Sent to Linya. It will be scored shortly." (or why
not). In Linya, the recording appears under **Calls → Sent from phones** as Waiting, then
scoring, then with its score and an **Open** button.

Recordings are only scored while **Local AI** is ticked. If it is off, they wait.

## On a MacBook

Notes syncs through iCloud, so the same recording is on the agent's Mac. Shortcuts syncs
too: the shortcut appears in the Shortcuts app on a Mac signed in to the same Apple ID,
with the agent's link already filled in. In its details, turn on **Use as Quick Action**
and **Share Sheet**. Then share the audio from Notes, or right-click an audio file in
Finder, and choose **Send to Linya**. The actions used all exist on macOS; this path has
not been tested either.

## Networking

**Same Wi-Fi (the default, and the private one).** The recording goes from the phone
straight to the laptop and touches nothing else. Two things break it:

- Guest and venue Wi-Fi often stop devices from seeing each other. If the phone cannot
  reach the laptop, turn on the iPhone's Personal Hotspot, connect the laptop to it,
  restart `npm run server`, and use the new address it prints.
- The laptop's address can change when it rejoins a network. The Agents tab always shows
  the current one; an agent whose link stopped working needs the new link (edit the Text
  box in the shortcut).

**A phone that cannot join the Wi-Fi: a tunnel.** This gives the laptop a public `https`
address.

```sh
brew install cloudflared
cloudflared tunnel --url http://localhost:8787
```

It prints an address like `https://something.trycloudflare.com`. Paste it into
**Agents → Tunnel address**, press Save, choose it under "Phones reach this laptop at",
and the links and QR codes switch to it. With ngrok it is `ngrok http 8787` (needs a free
account), then the same steps.

Before using a tunnel, know two things:

- **The recording passes through that company's servers** on its way to the laptop. That
  is not "customer audio never leaves the building". For the Local AI pitch, demo on the
  same Wi-Fi or a hotspot, and treat the tunnel as a fallback you can name honestly.
- A quick tunnel's address changes every time it starts, so every agent's link changes
  with it.

The pages for managing agents and reading recordings answer only on the laptop itself.
Through the Wi-Fi address or a tunnel, the only things reachable are the upload and a
connection test, and both need a valid agent link.

## Testing with curl

Replace `TOKEN` with the part after `token=` in an agent's link.

```sh
# Is the server up, and is this agent's token good?
curl http://localhost:8787/api/ping -H "Authorization: Bearer TOKEN"

# Upload a recording (the way the spec describes it)
curl http://localhost:8787/api/uploads -H "Authorization: Bearer TOKEN" \
  -F file=@frontend/public/samples/call-147.m4a

# The same upload the way the shortcut does it, token in the link
curl "http://localhost:8787/api/uploads?token=TOKEN" -F file=@frontend/public/samples/call-148.m4a

# Send the same file again: expect "Linya already has this recording"
curl http://localhost:8787/api/uploads -H "Authorization: Bearer TOKEN" \
  -F file=@frontend/public/samples/call-147.m4a

# A wrong token: expect ok:false and HTTP 401
curl -i http://localhost:8787/api/ping -H "Authorization: Bearer wrong"

# From another device on the Wi-Fi, use the laptop's address instead of localhost
curl http://192.168.1.23:8787/api/ping -H "Authorization: Bearer TOKEN"
```

Every answer is short JSON, `{ "ok": true|false, "message": "…" }`, which is what the
shortcut shows in its notification.

## End-to-end checklist (two or more iPhones)

1. [ ] Laptop: `ollama serve`, `npm run whisper`, `npm run server`, `npm run dev` all running; Local AI ticked.
2. [ ] Agents tab: add Agent A and Agent B; each shows a link and a QR code.
3. [ ] `curl …/api/ping` with A's token from the laptop answers "Connected to Linya as A".
4. [ ] iPhone A and iPhone B on the same Wi-Fi: open `http://<laptop address>:8787/api/ping` in Safari. A reply of "not registered" is a pass: it proves the phone can reach the laptop.
5. [ ] Both phones: install the shortcut from the iCloud link and paste their own link.
6. [ ] iPhone A: share a recording to Send to Linya. Notification says it was sent.
7. [ ] Linya → Calls → Sent from phones: the recording appears under Agent A and goes Waiting → scoring → score.
8. [ ] Open it: the call shows "Agent: A", a transcript and a scorecard, and plays.
9. [ ] iPhone A and iPhone B share different recordings within a few seconds of each other. Both arrive; they are scored one after the other; each is under the right agent.
10. [ ] iPhone A shares the first recording again. Notification says Linya already has it; no second entry appears.
11. [ ] Filter "Sent from phones" by Agent B: only B's recordings show.
12. [ ] Agents tab: Revoke Agent B. iPhone B shares a recording: notification says access was turned off.
13. [ ] Untick Local AI, send a recording: it waits. Tick it again: it is scored.
14. [ ] If a tunnel will be used: start it, save its address, re-paste the link on one phone on mobile data, send a recording.
15. [ ] Mac: run the shortcut from the Share menu on an audio file.

## Limits

- Tokens are kept as plain text in `server/data/db.json` on the laptop, so the app can
  show a link again. That file and the recordings in `server/data/uploads/` are
  git-ignored. Do not copy that folder anywhere.
- Maximum upload: 200 MB. Formats: m4a, mp4, wav, mp3, aac, caf, aiff (the last two are
  converted on arrival on a Mac).
- Whether a recording gets Agent and Customer labels depends on the file: iOS call
  recordings are a single track, so the two voices are told apart by sound.
