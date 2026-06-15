# Release Checklist

TapTalk lives in two repos:

- **`TapTalk_dev`** (private, `origin`) — full development history.
- **`TapTalk`** (public) — clean squashed export; the Release workflow
  builds and publishes the `.dmg` here on every `v*` tag.

## 1. Working tree sanity (on `main`, dev repo)

- `git status` should be clean.
- `npm run verify:release`
  - architecture guardrails pass (`npm run check:architecture`)
  - all tests pass
  - `npm audit --omit=dev --audit-level=high` reports no vulnerabilities
  - `npm pack --dry-run --json` includes required runtime files

## 2. Local artifact build

- `npm run dist`
- Expected:
  - `dist/TapTalk-<version>-macos-arm64.dmg` is produced (Apple Silicon only)
  - whisper.cpp is built portable (`GGML_NATIVE=OFF`) so it runs on any M-series

## 3. Security spot-check

- Open app settings and verify:
  - API key backend is set intentionally (`safeStorage` recommended on macOS)
  - cloud URL rejects insecure values: remote `http://...` and
    `https://user:pass@...` are blocked
  - cloud URL accepts `https://...` and `http://127.0.0.1:...`

## 4. Runtime smoke test

- Install the built `.dmg` (or `npm run reset:first-run` then launch the build —
  permissions do not work under `npm start`).
- Verify:
  - main window + tray icon/menu work
  - dictation start/stop pastes a transcript without a trailing blank line
  - selected-text edit replaces a selection
  - README's Gatekeeper first-launch steps match reality
  - Microphone / Accessibility / Input Monitoring grant flow works; Fn works
    after restart if macOS requires it

## 5. Bump version (dev repo)

- `npm version <x.y.z> --no-git-tag-version`
- Commit: `chore: bump version to <x.y.z>`
- `git push origin main`

## 6. Publish to the public repo

- Re-export `main` as a single clean commit (no private history):

  ```bash
  git checkout --orphan public-main
  git add -A && git commit -m "TapTalk v<x.y.z>"
  git push public public-main:main --force
  git checkout main && git branch -D public-main
  ```

- Tag and push to trigger the automated DMG release:

  ```bash
  git tag v<x.y.z>
  git push public v<x.y.z>
  ```

- The Release workflow (in `TapTalk`) verifies the tag matches
  `package.json`, runs tests + audit, builds the `.dmg`, and publishes the
  GitHub Release. Watch it: `gh run watch <id> --repo rwcod/TapTalk`.
- Confirm the published release has the `.dmg` asset attached.
