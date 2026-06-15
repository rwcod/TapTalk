# Architecture Boundaries

This document defines module boundaries and dependency direction for TapTalk.

## Goals

- Keep entry files thin (`main.ts`, `renderer/main.js`, `cli.ts`).
- Keep domain logic in focused modules.
- Prefer reusable pure helpers over inline command/UI logic.
- Prevent monolithic files from regrowing.

## High-level module map

### Core domains (`src/`)

- `core/*`: shared contracts and infra helpers (`types`, `url-security`, `app-paths`).
- `settings/*`: settings facade + sanitize/merge/legacy/repository/secrets.
- `providers/*`: STT providers and response parsing.
- `runtime/*`: dictation/recording/flow/autopaste/transcript runtime features.
- `local/*`: local runtime prep (`ffmpeg-path`, `local-runtime`, `python-setup`).

### Electron main process (`src/electron/`)

- `main.ts`: bootstrap/wiring.
- `main-*.ts`: feature modules (windows, tray, lifecycle, hotkeys, dictation, permissions, security, paths).
- `ipc/*`: channel handlers and validators by domain.
- `preload*.ts`: renderer bridge contracts and event exposure.

### Electron renderer (`src/electron/renderer/`)

- `main.js`: renderer orchestration only.
- `dom.js`, `state.js`, `utils.js`: shared renderer primitives.
- `status-view.js`, `settings-panel.js`, `bindings.js`, `init.js`: UI domains.
- `wizard/*`: isolated setup wizard state/dom/render/runtime/permissions/save flow.

### CLI (`src/cli/`)

- `guards.ts`: shared argument guards/parsers.
- `settings/*`: settings command handlers grouped by domain.
- `src/cli.ts`: top-level command dispatch only.

## Dependency direction rules

- Entry files can depend on domain modules; domain modules must not import entry files.
- Renderer modules must not import Electron main modules directly.
- IPC validators must stay pure and side-effect free.
- `settings/*` modules must not depend on Electron UI/runtime modules.
- CLI settings handlers may depend on `settings` and `cloud-presets`, but not on Electron modules.

## Guardrails

Static guardrails are enforced by:

- `npm run check:architecture`
- script: `scripts/check-architecture.mjs`

Current checks enforce max file sizes for key entry/facade files:

- `src/electron/main.ts`
- `src/electron/renderer/main.js`
- `src/cli.ts`
- `src/settings/index.ts`
- `src/providers/cloud-stt-provider.ts`

These limits are not style preferences; they are anti-monolith safety rails.
