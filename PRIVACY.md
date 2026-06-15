# TapTalk Privacy Model

TapTalk is a local-first macOS dictation app.
What leaves your device depends on the transcription mode you choose.

## Local Mode

When you use local transcription:

- audio is recorded and transcribed on your Mac with a local engine (`faster-whisper` or `whisper.cpp`)
- TapTalk does not need a TapTalk account or a TapTalk-hosted speech service
- settings are stored locally in `~/.taptalk/settings.json`
- recent transcript history is stored locally in `~/.taptalk/transcripts.json`

If you enable local model preparation, TapTalk downloads model files to your Mac.
That download step fetches model artifacts over the network, but it does not upload your microphone audio as part of transcription.

## Cloud Mode

When you use a cloud provider:

- recorded audio is sent from your Mac to the provider you selected
- the request may also include provider-specific fields such as model name or language options
- the returned transcript comes back to your Mac and may appear in local transcript history
- TapTalk does not operate a mandatory proxy or relay for those requests

Cloud privacy depends on the provider you choose.
That provider may log requests, associate them with your API key or account, and apply its own retention, abuse-prevention, billing, or regional processing policies.

## Selected-Text Editing

When selected-text editing is enabled, pressing the hotkey with text selected
sends your spoken words to Whisper as an **edit command**, and the selected text
plus that command to the configured **edit provider**:

- selected text, spoken commands, and replacements are **never** written to
  transcript history
- the **Basic Local Commands** provider (default) runs entirely on your Mac
- if you explicitly select a **cloud** edit endpoint, your selected text and
  spoken command are sent to that provider — the app warns you in Settings, and
  there is **no automatic fallback** from a local provider to a cloud provider
- selection is detected with a best-effort clipboard probe that restores your
  previous clipboard; clipboard contents are never logged
- prefer a local provider (Basic Local Commands or a localhost LLM such as
  Ollama) for sensitive content

## Accounts And API Keys

- TapTalk does not require a TapTalk account
- cloud usage is bring-your-own-provider and bring-your-own-API-key
- TapTalk prefers storing cloud keys with macOS-backed encrypted storage through Electron `safeStorage`
- if you explicitly switch key storage to plain settings, those keys are stored locally on disk instead

TapTalk does not claim anonymous cloud usage.
If you use a cloud provider, that provider can still identify your account, API key, IP address, or other request metadata.

## Practical Guidance

- If you want dictation to stay on-device, use local mode
- If you need cloud transcription, review that provider's privacy and retention terms before sending audio
- If you store API keys locally, prefer the encrypted storage option unless you have a specific reason not to
