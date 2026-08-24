import json
import sys
import urllib.request

from faster_whisper import WhisperModel


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: verify-local-stack.py <audio-file>")

    model = WhisperModel("small", device="cpu", compute_type="int8")
    segments, info = model.transcribe(sys.argv[1], beam_size=1, vad_filter=True)
    transcript = " ".join(segment.text.strip() for segment in segments).strip()
    if not transcript:
        raise RuntimeError("Whisper returned an empty transcript")

    payload = json.dumps(
        {
            "model": "qwen3:4b",
            "prompt": (
                "Summarize this class note in one concise sentence and include its key action. /no_think\n"
                + transcript
            ),
            "stream": False,
            "think": False,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "http://127.0.0.1:11434/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.load(response)

    summary = result.get("response", "").strip()
    if "</think>" in summary:
        summary = summary.split("</think>", 1)[1].strip()
    if not summary:
        raise RuntimeError("Ollama returned an empty summary")

    print(json.dumps({"language": info.language, "transcript": transcript, "summary": summary}))


if __name__ == "__main__":
    main()
