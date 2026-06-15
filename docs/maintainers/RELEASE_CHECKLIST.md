# Release Checklist

## 1. Branch sanity

- `git branch --show-current` should be a non-main branch (for example `codex/release-hardening`).
- `git status` should be clean.
- `git log --oneline main..HEAD` should show intended release commits only.

## 2. Automated verification

- `npm run verify:release`
- Expected:
  - architecture guardrails pass (`npm run check:architecture`)
  - all tests pass
  - `npm audit --omit=dev --audit-level=high` reports no vulnerabilities
  - `npm pack --dry-run --json` includes required runtime files from `dist/` and `src/electron/`

## 3. Preview artifact build

- `npm run dist`
- Expected:
  - macOS preview artifacts are generated in `dist/`
  - packaged outputs are Apple Silicon only (`arm64`) unless packaging config has changed
  - the release still uses honest preview language and does not imply notarized GA distribution

## 4. Security spot-check

- Open app settings and verify:
  - API key backend is set intentionally (`safeStorage` recommended on macOS)
  - cloud URL rejects insecure values:
    - remote `http://...` is blocked
    - `https://user:pass@...` is blocked
- Confirm custom cloud URL accepts:
  - `https://...` remote API
  - `http://127.0.0.1:...` local dev endpoint

## 5. Runtime smoke test

- Start app: `npm start`
- Verify:
  - main window opens
  - tray icon renders and menu works
  - dictation start/stop works at least once
  - transcript appears and copy action works
  - app closes cleanly from tray menu
  - if Fn hotkeys are part of the release path, Microphone / Accessibility / Input Monitoring are granted as needed and Fn works after restart if required by macOS

## 6. Preview install smoke test

- Install the generated `.dmg` on a clean macOS user session or after `npm run reset:first-run`
- Confirm the README's Gatekeeper instructions match the actual first-launch flow
- Confirm release notes call out:
  - preview or beta status
  - Apple Silicon-only packaging
  - lack of notarization for this pass

## 7. Final publication prep

- Merge branch into `main`.
- Tag release (`git tag vX.Y.Z`).
- Push branch and tags.
- Publish release notes with security-impacting changes highlighted.
