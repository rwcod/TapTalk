#!/usr/bin/env python3
import argparse
import json
import sys
from typing import Any

from faster_whisper import WhisperModel

ENGLISH_LANGUAGE = "en"
LEGACY_BILINGUAL_MODE = "pl-en"
HALLUCINATION_PREFIXES = (
    "dziekuje",
    "dziękuje",
    "dziękuję",
    "thanks for watching",
    "thank you for watching",
)


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    lowered = str(value).strip().lower()
    if lowered in ("1", "true", "yes", "on"):
        return True
    if lowered in ("0", "false", "no", "off"):
        return False
    raise ValueError(f"Unsupported boolean value: {value}")


def transcribe_file(
    model: WhisperModel,
    audio_path: str,
    language: str,
    beam_size: int,
    vad_filter: bool,
) -> dict[str, Any]:
    language_arg = language.strip() or None

    segments, info = model.transcribe(
        audio_path,
        language=language_arg,
        beam_size=max(1, int(beam_size)),
        vad_filter=vad_filter,
        temperature=0.0,
    )

    parts: list[str] = []
    logprobs: list[float] = []
    no_speech_probs: list[float] = []
    for segment in segments:
        text = (segment.text or "").strip()
        if text:
            parts.append(text)

        avg_logprob = getattr(segment, "avg_logprob", None)
        if avg_logprob is not None:
            try:
                logprobs.append(float(avg_logprob))
            except Exception:  # pylint: disable=broad-except
                pass

        no_speech_prob = getattr(segment, "no_speech_prob", None)
        if no_speech_prob is not None:
            try:
                no_speech_probs.append(float(no_speech_prob))
            except Exception:  # pylint: disable=broad-except
                pass

    return {
        "text": " ".join(parts).strip(),
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "avg_logprob": (sum(logprobs) / len(logprobs)) if logprobs else None,
        "avg_no_speech_prob": (sum(no_speech_probs) / len(no_speech_probs))
        if no_speech_probs
        else None,
    }


def score_result(payload: dict[str, Any]) -> float:
    text = str(payload.get("text", "")).strip()
    if not text:
        return -1_000_000.0

    try:
        avg_logprob = float(payload.get("avg_logprob"))
    except Exception:  # pylint: disable=broad-except
        avg_logprob = -10.0

    length_bonus = min(len(text), 300) * 0.002
    return avg_logprob + length_bonus


def normalize_text(value: str) -> str:
    lowered = (value or "").strip().lower()
    return "".join(ch for ch in lowered if ch.isalnum() or ch.isspace()).strip()


def has_hallucination_prefix(normalized_text: str) -> bool:
    return any(normalized_text.startswith(prefix) for prefix in HALLUCINATION_PREFIXES)


def should_retry_with_vad(payload: dict[str, Any]) -> bool:
    text = str(payload.get("text", "")).strip()
    normalized = normalize_text(text)

    no_speech_prob_raw = payload.get("avg_no_speech_prob")
    no_speech_prob = None
    try:
        no_speech_prob = float(no_speech_prob_raw)
    except Exception:  # pylint: disable=broad-except
        no_speech_prob = None

    # Typical Whisper hallucinations on silence.
    if has_hallucination_prefix(normalized):
        return True

    if no_speech_prob is not None and no_speech_prob >= 0.75 and len(normalized) <= 90:
        return True

    return False


def transcribe_with_vad_retry(
    model: WhisperModel,
    audio_path: str,
    language: str,
    beam_size: int,
    vad_filter: bool,
) -> dict[str, Any]:
    primary = transcribe_file(
        model=model,
        audio_path=audio_path,
        language=language,
        beam_size=beam_size,
        vad_filter=vad_filter,
    )

    if vad_filter:
        return primary

    if not should_retry_with_vad(primary):
        return primary

    primary_text = str(primary.get("text", "")).strip()
    primary_normalized = normalize_text(primary_text)
    with_vad = transcribe_file(
        model=model,
        audio_path=audio_path,
        language=language,
        beam_size=beam_size,
        vad_filter=True,
    )

    with_vad_text = str(with_vad.get("text", "")).strip()
    if not with_vad_text:
        return with_vad

    # If VAD is disabled by user and we already have non-empty text that does not look
    # like a known silence hallucination, keep the original to avoid cutting valid onset words.
    if primary_text and not has_hallucination_prefix(primary_normalized):
        return primary

    if not primary_text:
        return with_vad

    return with_vad if score_result(with_vad) >= score_result(primary) else primary


def transcribe_with_language_policy(
    model: WhisperModel,
    audio_path: str,
    language: str,
    beam_size: int,
    vad_filter: bool,
) -> dict[str, Any]:
    normalized = (language or "").strip().lower()
    if not normalized or normalized == "auto":
        return transcribe_with_vad_retry(
            model=model,
            audio_path=audio_path,
            language="",
            beam_size=beam_size,
            vad_filter=vad_filter,
        )

    include_english = False
    base_language = normalized

    if normalized == LEGACY_BILINGUAL_MODE:
        include_english = True
        base_language = "pl"
    elif "+" in normalized:
        parts = [part.strip() for part in normalized.split("+") if part.strip()]
        include_english = ENGLISH_LANGUAGE in parts
        base_language = next(
            (part for part in parts if part != ENGLISH_LANGUAGE),
            ENGLISH_LANGUAGE if include_english else "",
        )

    if base_language in ("", "auto"):
        include_english = False
        base_language = ""
    elif base_language == ENGLISH_LANGUAGE:
        include_english = False

    if not include_english:
        return transcribe_with_vad_retry(
            model=model,
            audio_path=audio_path,
            language=base_language,
            beam_size=beam_size,
            vad_filter=vad_filter,
        )

    auto = transcribe_with_vad_retry(
        model=model,
        audio_path=audio_path,
        language="",
        beam_size=beam_size,
        vad_filter=vad_filter,
    )

    detected = str(auto.get("language") or "").strip().lower()
    allowed_languages = {base_language, ENGLISH_LANGUAGE}
    if detected in allowed_languages and str(auto.get("text", "")).strip():
        return auto

    base = transcribe_with_vad_retry(
        model=model,
        audio_path=audio_path,
        language=base_language,
        beam_size=beam_size,
        vad_filter=vad_filter,
    )
    en = transcribe_with_vad_retry(
        model=model,
        audio_path=audio_path,
        language=ENGLISH_LANGUAGE,
        beam_size=beam_size,
        vad_filter=vad_filter,
    )

    # In bilingual mode we only want base-language/EN output. If auto-detection
    # picked another language (or script), prefer constrained decode.
    candidates = [base, en]
    return max(candidates, key=score_result)


def run_server(args: argparse.Namespace) -> int:
    model = WhisperModel(
        args.model,
        device=args.device,
        compute_type=args.compute_type,
        cpu_threads=args.cpu_threads,
    )

    print(json.dumps({"event": "ready"}, ensure_ascii=False), flush=True)

    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue

        request_id = None
        try:
            payload = json.loads(line)
            request_id = payload.get("id")
            audio_path = str(payload.get("audio", "")).strip()
            if not audio_path:
                raise ValueError("Missing audio path.")

            language = str(payload.get("language", args.language))
            beam_size = int(payload.get("beam_size", args.beam_size))
            vad_filter = parse_bool(payload.get("vad_filter", args.vad_filter))

            result = transcribe_with_language_policy(
                model=model,
                audio_path=audio_path,
                language=language,
                beam_size=beam_size,
                vad_filter=vad_filter,
            )
            print(
                json.dumps(
                    {
                        "id": request_id,
                        "ok": True,
                        "text": result.get("text", ""),
                        "language": result.get("language"),
                        "language_probability": result.get("language_probability"),
                        "avg_logprob": result.get("avg_logprob"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
        except Exception as exc:  # pylint: disable=broad-except
            print(
                json.dumps(
                    {
                        "id": request_id,
                        "ok": False,
                        "error": str(exc),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio")
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--language", default="")
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--vad-filter", default="on")
    parser.add_argument("--cpu-threads", type=int, default=4)
    parser.add_argument("--serve", action="store_true")
    args = parser.parse_args()

    try:
        if args.serve:
            return run_server(args)

        if not args.audio:
            raise ValueError("--audio is required unless --serve is used.")

        model = WhisperModel(
            args.model,
            device=args.device,
            compute_type=args.compute_type,
            cpu_threads=args.cpu_threads,
        )

        payload = transcribe_with_language_policy(
            model=model,
            audio_path=args.audio,
            language=args.language,
            beam_size=args.beam_size,
            vad_filter=parse_bool(args.vad_filter),
        )
        print(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:  # pylint: disable=broad-except
        print(f"faster-whisper runner error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
