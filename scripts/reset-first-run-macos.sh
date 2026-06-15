#!/usr/bin/env bash

set -euo pipefail

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "This script is macOS-only."
  exit 1
fi

APP_IDS=(
  "com.taptalk.app"
  "com.taptalk.app.helper"
  "com.taptalk.app.helper.Renderer"
  "com.taptalk.app.helper.GPU"
  "com.taptalk.app.helper.Plugin"
)

TCC_SERVICES=(
  "Microphone"
  "Accessibility"
  "ListenEvent"
)

echo "Closing TapTalk (if running)..."
osascript -e 'tell application "TapTalk" to quit' >/dev/null 2>&1 || true
pkill -f "/TapTalk.app/" >/dev/null 2>&1 || true

echo "Removing app-local data..."
rm -rf "${HOME}/.taptalk"
rm -rf "${HOME}/.local-wspr"
rm -rf "${HOME}/Library/Application Support/TapTalk"
rm -f "${HOME}/Library/Preferences/com.taptalk.app.plist"
rm -f "${HOME}/Library/Preferences/com.taptalk.app.helper.plist"

echo "Resetting macOS TCC permissions..."
for service in "${TCC_SERVICES[@]}"; do
  for app_id in "${APP_IDS[@]}"; do
    tccutil reset "${service}" "${app_id}" >/dev/null 2>&1 || true
  done
done

echo "Done. Next launch should behave like first run."
