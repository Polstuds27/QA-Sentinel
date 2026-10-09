# Linya — checklist to submission

Deadline: **10:00 AM, October 10, 2026**. No extensions, one submission per team, and
judges review the repo as it stands at the deadline. The build plan has the form
submitted by 9:30 AM to leave a buffer.

Tick a box by changing `[ ]` to `[x]`. Items are in the order to do them.

## A. Get both machines on the same code

1. [ ] **Mac:** update the working branch: `git checkout feature/test-ui`, then `git merge main`.
2. [ ] **Windows:** `git pull` on `main`, then `npm install` inside `frontend/`. The merge
   added new packages (shadcn/ui, Base UI, the font), so the app will not start without it.
3. [ ] **Both:** `npm run build` and `npm run lint` pass in `frontend/`.

## B. Prove the merged app works

The AI pipeline and the new UI were merged on Oct 9. The pipeline has not been run since.

4. [ ] **Windows:** start Ollama (`ollama serve`) and run `node scripts/phase1-e2e.mjs`.
   It should end with an AI call listed and the card readback marked critical.
5. [ ] By hand, with Local AI on: upload `frontend/public/demo-audio/call-sample.wav`,
   press **Transcribe & score**, open the call, and check that:
   - the transcript and scorecard appear
   - the audio bar shows a waveform and plays the uploaded file
   - clicking a timestamp or a red flag line jumps the audio there
   - reloading the page keeps the call
6. [ ] Upload one of the stereo samples too (`frontend/public/samples/call-147.m4a`).
   Stereo files get Agent and Customer labels; mono files are labelled Unknown.
7. [ ] With Local AI off, click through all five tabs: play a demo call, press Confirm
   and Dismiss on a failed check, change a scorecard weight, export a CSV and a PDF.
8. [ ] Open an exported CSV and PDF and confirm the card number shows as
   `[CARD •••• 1111]`, never in full.
9. [ ] Look at the app at phone width and in dark mode (it follows the system setting).
10. [ ] **Mac only, optional:** to run the pipeline on the Mac, install Ollama, pull
    `qwen2.5:3b`, and start it with `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`.
    `setup-local.ps1` is Windows-only, and `phase1-e2e.mjs` has a Windows Chrome path
    hard-coded.

## C. Get the demo laptop ready

Measured speeds on the Windows laptop: about 40 seconds to transcribe a 67-second clip,
then 20 to 30 seconds per check, and there are 7 checks. One call takes a few minutes.

11. [ ] Decide which laptop is the demo laptop and do every item in this section on it.
12. [ ] Download and cache the models while online: run one full transcribe-and-score so
    Whisper (about 150 MB) is cached, and confirm `qwen2.5:3b` is pulled.
13. [ ] **Airplane-mode rehearsal.** Turn Wi-Fi off and run the whole flow. The pitch
    depends on this and it has not been done end to end yet.
14. [ ] Process the demo calls ahead of time so their results are already in the Calls
    list. Score at most one short call live on stage.
15. [ ] Record a screen capture of the full flow as a backup in case the live demo fails.
16. [ ] Rehearse the five-minute pitch once with a timer. The "click 02:13" moment from
    the concept PDF is at **00:14** on Call #147, because the sample call is 31 seconds long.

## D. Fix the documents judges will read

17. [ ] Add a `README.md` at the repo root. Judges land there first and there is none;
    the only README is in `frontend/`. It needs what Linya is, setup steps, and the
    disclosures table.
18. [ ] Add Mac setup steps next to the Windows ones, or say plainly that the AI backend
    was set up and tested on Windows.
19. [ ] Review the disclosures table in `frontend/README.md` line by line:
    - **Models used:** Whisper base and `qwen2.5:3b` through Ollama. Do not list WebLLM;
      it is blocked on the test hardware and not in use.
    - **AI development tools:** it says Claude Code and notes the backend scripts suggest
      opencode. Confirm with the team and list every tool used.
    - **What requires internet:** first load, the one-time Whisper download, pulling the
      Ollama model.
20. [ ] Claim no accuracy rate. The only measured result is one 67-second clip where the
    card readback was flagged. The three demo calls are scripted, not model output.
21. [ ] Update the two stale docs, which still say QA Sentinel and contradict themselves:
    - `docs/LOCAL_AI_PLAN.md` is titled "NOT started" and ends by saying the pipeline
      throws until approved, while its own phase notes say phases 1 to 5 are done. It
      also lists coaching notes and the waveform as to-do; both are built.
    - `docs/BACKEND_CAPSULE.md` describes the pipeline correctly but under the old name.
22. [ ] Use the name Linya on the submission form. The concept PDF's pre-filled form and
    its "Why local?" answer still say QA Sentinel.
23. [ ] Decide whether to rename the GitHub repo (`QA-Sentinel`) or leave it, and say
    "formerly QA Sentinel" once in the README either way.

## E. Submit

24. [ ] Demo video, about one minute. `linya-ads/out/linya-ad.mp4` is a promo made from
    recreated screens; decide whether the submission needs a recording of the real app
    instead, or as well.
25. [ ] Post the video on X or LinkedIn, tag Devin / Cognition, include `#AppBuildersPH`.
26. [ ] Commit and push everything, including this checklist. Check on GitHub that
    `main` shows the latest commit.
27. [ ] Make the repo **public**.
28. [ ] Open the repo in a private browser window and follow the README's setup steps as
    a judge would.
29. [ ] Fill in the form on the Cerebral Valley event page: project name, short
    description, team names exactly as registered, repo link, video link, post link, and
    the disclosures from item 19.
30. [ ] Read the form through twice, then submit. Only one submission is allowed.

## Rules that can disqualify

- The project must be substantially built during the hackathon.
- No help from people outside the hackathon.
- No fake benchmarks: state only numbers the team measured, and say how.
- No cloud AI APIs, and audio never leaves the machine.
