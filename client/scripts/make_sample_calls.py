#!/usr/bin/env python3
"""Generate three scripted test recordings in samples/ (macOS only).

Each line of a call is spoken by a built-in `say` voice, then the lines are stitched
into one stereo file: agent on the left channel, customer on the right, which is how
the spec expects call recordings to arrive. They are test files to upload and score:
the app itself ships with no sample data.

    python3 scripts/make_sample_calls.py

The voices are synthetic and the calls are scripted. This is demo data, not a benchmark.
"""
import array
import json
import pathlib
import subprocess
import tempfile
import wave

RATE = 22050
LEAD_IN = 0.4  # seconds of silence before the first line
GAP = 0.55  # seconds between lines
OUT = pathlib.Path(__file__).resolve().parent.parent / "samples"

# (speaker, text shown in the transcript, text to speak if it differs)
CALLS = {
    "147": {
        "voices": {"Agent": "Daniel", "Customer": "Karen"},
        "lines": [
            ("Agent", "Thank you for calling, this is Jason."),
            ("Customer", "Hi, I want to dispute a charge on my card."),
            ("Agent", "Sure! What's the card number?"),
            ("Customer", "It's 4111 1111 1111 1111.", "It's 4 1 1 1, 1 1 1 1, 1 1 1 1, 1 1 1 1."),
            ("Agent", "Okay, so that's 4111 1111 1111 1111, right?", "Okay, so that's 4 1 1 1, 1 1 1 1, 1 1 1 1, 1 1 1 1, right?"),
            ("Agent", "I understand how frustrating that is."),
            ("Agent", "Is there anything else I can help with?"),
            ("Agent", "Thanks for calling BankCo, bye!", "Thanks for calling Bank Co, bye!"),
        ],
    },
    "148": {
        "voices": {"Agent": "Samantha", "Customer": "Daniel"},
        "lines": [
            ("Agent", "Thank you for calling BankCo, this is Maria. May I have your account ID and date of birth to verify you?", "Thank you for calling Bank Co, this is Maria. May I have your account I D and date of birth to verify you?"),
            ("Customer", "Sure, it's AC-48291, June 4 1990.", "Sure, it's A C, 4 8 2 9 1. June fourth, nineteen ninety."),
            ("Agent", "Is there anything else I can help with? Thanks for calling BankCo!", "Is there anything else I can help with? Thanks for calling Bank Co!"),
        ],
    },
    "149": {
        "voices": {"Agent": "Rishi", "Customer": "Karen"},
        "lines": [
            ("Agent", "Hello, how can I help?"),
            ("Customer", "This is so frustrating, nobody helps me."),
            ("Agent", "Okay noted.", "Okay. Noted."),
        ],
    },
}


def speak(voice: str, text: str, tmp: pathlib.Path) -> array.array:
    aiff, wav = tmp / "line.aiff", tmp / "line.wav"
    subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{RATE}", "-c", "1", str(aiff), str(wav)], check=True)
    with wave.open(str(wav), "rb") as w:
        return array.array("h", w.readframes(w.getnframes()))


def stamp(seconds: float) -> str:
    s = int(seconds)
    return f"{s // 60:02d}:{s % 60:02d}"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    timings = {}
    with tempfile.TemporaryDirectory() as d:
        tmp = pathlib.Path(d)
        for call_id, call in CALLS.items():
            left, right = array.array("h"), array.array("h")
            silence = lambda secs: array.array("h", [0] * int(secs * RATE))
            left.extend(silence(LEAD_IN)); right.extend(silence(LEAD_IN))
            starts = []
            for speaker, text, *spoken in call["lines"]:
                samples = speak(call["voices"][speaker], spoken[0] if spoken else text, tmp)
                starts.append({"time": stamp(len(left) / RATE), "speaker": speaker, "text": text})
                mine, other = (left, right) if speaker == "Agent" else (right, left)
                mine.extend(samples); other.extend(silence(len(samples) / RATE))
                other.extend([0] * (len(mine) - len(other)))
                left.extend(silence(GAP)); right.extend(silence(GAP))
            stereo = array.array("h", [0] * (len(left) * 2))
            stereo[0::2], stereo[1::2] = left, right
            wav = tmp / f"call-{call_id}.wav"
            with wave.open(str(wav), "wb") as w:
                w.setnchannels(2); w.setsampwidth(2); w.setframerate(RATE)
                w.writeframes(stereo.tobytes())
            subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000", str(wav), str(OUT / f"call-{call_id}.m4a")], check=True)
            total = int(len(left) / RATE)  # the encoded file can run up to a second longer
            timings[call_id] = {"duration": f"{total // 60}:{total % 60:02d}", "lines": starts}
    print(json.dumps(timings, indent=2))


if __name__ == "__main__":
    main()
