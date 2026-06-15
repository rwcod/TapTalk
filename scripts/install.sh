#!/usr/bin/env bash
set -euo pipefail

APP_NAME="TapTalk"
DEFAULT_REPO_URL="https://github.com/rwcod/TapTalk"
REPO_URL="${REPO_URL:-$DEFAULT_REPO_URL}"
TARGET_DIR="${TARGET_DIR:-TapTalk}"
START_APP=1
USE_CURRENT_DIR=0
SKIP_BREW_INSTALL=0
PY_BIN="${PY_BIN:-python3}"

usage() {
  cat <<'EOF'
TapTalk installer (macOS)

Usage:
  ./scripts/install.sh [options]

Options:
  --repo-url <url>    Git repo URL (default: https://github.com/rwcod/TapTalk)
  --dir <path>        Clone destination directory (default: ./TapTalk)
  --here              Use current directory (already cloned repo)
  --start             Start app after install (default)
  --no-start          Do not start app automatically
  --skip-brew-install Skip `brew install` and only verify dependencies
  -h, --help          Show this help
EOF
}

need_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-url)
      REPO_URL="${2:-}"
      shift 2
      ;;
    --dir)
      TARGET_DIR="${2:-}"
      shift 2
      ;;
    --here)
      USE_CURRENT_DIR=1
      shift
      ;;
    --start)
      START_APP=1
      shift
      ;;
    --no-start)
      START_APP=0
      shift
      ;;
    --skip-brew-install)
      SKIP_BREW_INSTALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "$APP_NAME installer currently supports macOS only." >&2
  exit 1
fi

need_cmd git

if ! command -v brew >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Homebrew is required.
Install it first: https://brew.sh
EOF
  exit 1
fi

if (( SKIP_BREW_INSTALL == 0 )); then
  echo "[1/5] Installing dependencies via Homebrew (ffmpeg, python@3.11, node)..."
  brew install ffmpeg python@3.11 node
else
  echo "[1/5] Skipping Homebrew install, verifying dependencies..."
  need_cmd ffmpeg
  need_cmd node
fi

WORKDIR=""
if (( USE_CURRENT_DIR == 1 )); then
  WORKDIR="$(pwd)"
  echo "[2/5] Using current directory: $WORKDIR"
else
  if [[ -d "$TARGET_DIR/.git" ]]; then
    echo "[2/5] Reusing existing clone: $TARGET_DIR"
  else
    echo "[2/5] Cloning repository..."
    git clone "$REPO_URL" "$TARGET_DIR"
  fi
  WORKDIR="$(cd "$TARGET_DIR" && pwd)"
fi

cd "$WORKDIR"

if [[ ! -f package.json ]]; then
  echo "package.json not found in $WORKDIR" >&2
  exit 1
fi

if ! command -v "$PY_BIN" >/dev/null 2>&1; then
  if command -v /opt/homebrew/bin/python3 >/dev/null 2>&1; then
    PY_BIN="/opt/homebrew/bin/python3"
  elif command -v /usr/local/bin/python3 >/dev/null 2>&1; then
    PY_BIN="/usr/local/bin/python3"
  else
    echo "python3 not found. Install python@3.11 via Homebrew." >&2
    exit 1
  fi
fi

echo "[3/5] Creating Python venv (.venv) and upgrading pip..."
"$PY_BIN" -m venv .venv
./.venv/bin/python -m pip install --upgrade pip

echo "[4/5] Installing npm dependencies..."
npm install

if (( START_APP == 1 )); then
  echo "[5/5] Starting $APP_NAME..."
  npm start
else
  echo "[5/5] Install complete."
  echo "Run these next commands:"
  echo "  cd \"$WORKDIR\""
  echo "  npm start"
fi
