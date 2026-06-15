# 🎙️ TapTalk

**Privacy-first dictation for macOS. Local by default.**

Speak into any app. Press a hotkey, talk, release. TapTalk transcribes
your voice locally — with `faster-whisper` (Python-based) or the native
`whisper.cpp` engine (no Python required) — and pastes the text where
your cursor is. No account, no subscription, no audio leaving your Mac
unless you opt into a cloud provider yourself.

<!-- TODO: add a 30s GIF here showing: press Fn → talk → release → text appears in TextEdit -->

## Download

Latest release: [**GitHub Releases ↗**](https://github.com/rwcod/TapTalk/releases/latest)

- macOS 13+ on Apple Silicon (`arm64`)
- Download the `.dmg`
- Builds are **not notarized** (no Apple Developer ID). Expect
  one extra click on first launch — see *First launch* below.

## First launch (one-time Gatekeeper bypass)

Because TapTalk is **ad-hoc signed** (no Apple Developer ID yet),
macOS will show *"TapTalk cannot be opened because it is from an
unidentified developer"* the first time you open it. To get past it:

1. Open Finder, go to `/Applications`
2. **Right-click** (or Control-click) `TapTalk.app` → **Open**
3. In the dialog that appears, click **Open** again

macOS remembers this choice. Subsequent launches open normally.

## Setup wizard (~3 minutes)

When TapTalk starts for the first time, it shows a welcome screen and
then walks you through:

1. **Mode** — Local (offline) or Cloud (bring your own API key for Groq,
   OpenAI, Deepgram, ElevenLabs, or any custom endpoint).
   - Local: choose **faster-whisper** (Python-based) or **whisper.cpp**
     (native, no Python or ffmpeg required).
2. **Model & language** — pick a Whisper model size and language.
   Local mode downloads the model on first prepare (~150 MB for `small`).
3. **Permissions** — macOS will prompt for:
   - 🎤 **Microphone** (always required)
   - ♿ **Accessibility** (for auto-paste — without it the transcript
     still copies to your clipboard, you just press ⌘V manually)
   - ⌨️ **Input Monitoring** (only if you use the Fn key as your hotkey)

   The wizard auto-saves on every input, so you can step out to grant
   permissions in System Settings and come back — your progress and any
   API keys you typed will still be there.

   > **Heads-up:** macOS may show *"TapTalk needs to be quit and
   > reopened to use this permission"* after you toggle Input
   > Monitoring. Click **Quit & Reopen** — TapTalk re-launches and
   > automatically reopens the wizard on the same step.

## Using TapTalk

- **Default hotkey:** hold **Fn** for ~0.2 s to start recording, release to stop.
- **Hands-free mode:** tap **Fn + Space** to toggle recording on; tap again to stop.
- **Fallback hotkeys** (no Input Monitoring required): `⌃ ⇧ Space` or `⌥ Space`.

While recording, a small pill appears at the bottom of the screen with
a live waveform. When you stop, it switches to "Transcribing…" and then
disappears once the text is pasted.

You can also click **Start Recording** in the app window if you just
want to test things without configuring a hotkey.

### Speak to type. Select text to edit.

The TapTalk hotkey is **context-aware** — there's no separate "command mode"
shortcut:

- **No selection → normal dictation.** Press the hotkey, speak, and your words
  are transcribed and pasted at the cursor (the existing behaviour).
- **Text selected → voice command edits the selection.** Select some text,
  press the same hotkey, and speak an instruction such as *"make this
  professional"* or *"make this shorter"*. TapTalk replaces the selection with
  the edited result.

How it works:

- Whisper only **transcribes your spoken command** — it never performs the edit.
- A **CommandTransformProvider** performs the transformation:
  - **Basic Local Commands** (default, fully local): `uppercase`, `lowercase`,
    `trim`, `remove line breaks`.
  - **Local LLM / OpenAI-compatible** (optional): any `/v1/chat/completions`
    endpoint — e.g. a local **Ollama** server, or a cloud provider like OpenAI.
- A **local provider is recommended for private content.** Cloud providers
  receive your selected text and spoken command only if you explicitly
  configure one.

Configure it under **Settings → General → Selected-text editing**. When you
pick a cloud (non-localhost) endpoint, the UI shows a clear warning:
*"Selected text and spoken edit commands are sent to the selected provider."*

> **Privacy:** selected text, spoken edit commands, and replacements are never
> written to transcript history, and TapTalk never silently sends selected text
> to a cloud provider. Selection is detected with a best-effort clipboard probe
> (sentinel + Cmd+C) that restores your clipboard afterwards.

### If Fn doesn't trigger

macOS has its own Fn behaviour you may need to change:
**System Settings → Keyboard → Press 🌐 key to → Nothing**
(or *Show Emoji*). Other settings let macOS intercept Fn before TapTalk
sees it. TapTalk will detect this and surface a hint in the status row.

## Features

- 🔒 **Local-first.** Transcription runs entirely on your machine; no audio leaves your Mac in Local mode.
- ⚙️ **Two local engines.** `faster-whisper` (Python-based) or `whisper.cpp` (native Metal/CPU, no Python required).
- ☁️ **Cloud is optional and BYOK.** Groq, OpenAI, Deepgram, ElevenLabs, HuggingFace, deapi, or any custom endpoint.
- 🎯 **Fn hotkey** (default) or any Electron-compatible shortcut.
- 📋 **Native auto-paste** via a tiny Swift `PasteHelper` (uses `CGEvent` — needs Accessibility, not AppleEvents).
- 🪟 **Floating indicator pill** with a live audio waveform.
- ✏️ **Select-to-edit.** Selected text + a spoken command = an instant voice edit, via local rules or an optional local/cloud LLM.
- 🌍 **Multi-language**, with an optional bilingual mode (e.g. Polish + English) on the faster-whisper engine.
- 🔑 **API keys in macOS Keychain** (or plaintext settings if you prefer; you choose in setup).
- 💾 **Recent transcripts panel** with quick copy and clear-all.

## Updates

> ⚠️ **Without an Apple Developer ID, every new TapTalk version has a
> different code signature.** macOS will treat the updated app as a
> different app and ask you to grant Accessibility / Input Monitoring
> permissions again. TapTalk detects this on first launch after an
> update and shows a blue banner with a one-click shortcut to the
> permissions step.

To update:
1. Download the new `.dmg` from [Releases](https://github.com/rwcod/TapTalk/releases/latest).
2. Drag `TapTalk.app` into `/Applications`, replacing the old copy.
3. Open TapTalk. If you see *"Updated to v0.X — macOS may require
   re-granting permissions"*, click **Open permissions check** and
   re-toggle Accessibility / Input Monitoring as needed.

An in-app update checker is on the roadmap.

## Privacy

- **Local mode**: recording and transcription happen on your Mac. Nothing is sent anywhere.
- **Cloud mode**: audio is sent only to the provider whose API key you supply.
- TapTalk never operates a hosted relay and does not require an account.
- API keys can be encrypted with macOS Keychain (default in setup).
- Full details: [PRIVACY.md](PRIVACY.md).

## Build from source

Requires macOS 13+, Xcode Command Line Tools, Node 20+ (CI builds on Node 24).
Python 3.11+ and `ffmpeg` are only needed for the `faster-whisper` engine.

```bash
brew install ffmpeg python@3.11 node
git clone https://github.com/rwcod/TapTalk
cd TapTalk
npm install
npm start
```

Or use the bootstrap script which handles Homebrew dependencies, the
Python venv, and launches the app:

```bash
./scripts/install.sh --here --start
```

Then complete the setup wizard inside the app. Choose your local engine
in the wizard — faster-whisper installs its Python deps and downloads the
model on first prepare; whisper.cpp builds the native binary and downloads
the model.

To produce a redistributable `.dmg`:

```bash
npm run dist
# Output: dist/TapTalk-<version>-macos-arm64.dmg
```

## Known limitations

- Preview-quality release. Things may move around in `v0.x`.
- macOS 13+ only.
- Apple Silicon only for now; Intel preview is not packaged.
- Not notarized → one-time Gatekeeper bypass on first launch.
- Every update resets TCC permissions until we obtain an Apple
  Developer ID.
- **faster-whisper** local mode requires Python 3.11+, `ffmpeg`, and a
  first-time model download (~150 MB for `small`, more for `medium`/`large`).
- **whisper.cpp** local mode requires only Xcode Command Line Tools; no
  Python or `ffmpeg` needed. Model download still applies.
- Cloud mode privacy, logging, and retention follow the policy of the
  provider you chose.
- Selected-text editing is macOS-only and uses a clipboard probe (Cmd+C) on
  each activation, which adds a small delay before recording starts. It can be
  turned off under Settings → General → Selected-text editing. Selection
  detection relies on the focused app supporting Cmd+C copy.

The full pre-release smoke checklist lives in
[docs/maintainers/RELEASE_CHECKLIST.md](docs/maintainers/RELEASE_CHECKLIST.md).

## Contributing & support

- Bugs and feature requests: [GitHub Issues](https://github.com/rwcod/TapTalk/issues)
- Privacy: [PRIVACY.md](PRIVACY.md)

## License

ISC — see [LICENSE](LICENSE).
