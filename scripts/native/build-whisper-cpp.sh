#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# build-whisper-cpp.sh
#
# Compiles the whisper.cpp CLI binary for macOS with Metal
# (GPU) support.  Called by `npm run build:native`.
#
# The compiled binary is cached in .cache/native/<tag>/ so that
# clean builds (which wipe dist/) don't trigger a full recompile.
# Delete .cache/native/ to force a rebuild.
#
# Requirements: Xcode CLI tools (provides clang++, cmake, git).
# ─────────────────────────────────────────────────────────────
set -euo pipefail

WHISPER_CPP_TAG="v1.7.5"
WHISPER_CPP_REPO="https://github.com/ggerganov/whisper.cpp.git"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$PROJECT_ROOT/dist/native"
CACHE_DIR="$PROJECT_ROOT/.cache/native/$WHISPER_CPP_TAG"
BUILD_TMP="$PROJECT_ROOT/.whisper-cpp-build"

mkdir -p "$OUT_DIR"
# Ensure Metal shader files always exist so electron-builder never fails trying
# to copy them. whisper.cpp v1.7+ embeds shaders in the binary itself; these
# files are only used as a fallback by older runtimes.
touch "$OUT_DIR/ggml-metal.metal" "$OUT_DIR/default.metallib"

# Skip on non-macOS (CI on Linux, etc.)
if [ "$(uname)" != "Darwin" ]; then
  echo "[build-whisper-cpp] Skipping: not macOS"
  exit 0
fi

# If the binary is cached, just copy it — no recompile needed.
if [ -f "$CACHE_DIR/whisper-cpp" ]; then
  echo "[build-whisper-cpp] Using cached binary for $WHISPER_CPP_TAG"
  cp "$CACHE_DIR/whisper-cpp" "$OUT_DIR/whisper-cpp"
  [ -f "$CACHE_DIR/ggml-metal.metal"  ] && cp "$CACHE_DIR/ggml-metal.metal"  "$OUT_DIR/ggml-metal.metal"
  [ -f "$CACHE_DIR/default.metallib"  ] && cp "$CACHE_DIR/default.metallib"   "$OUT_DIR/default.metallib"
  echo "[build-whisper-cpp] Done (cached) → $OUT_DIR/whisper-cpp"
  exit 0
fi

echo "[build-whisper-cpp] Cache miss — building $WHISPER_CPP_TAG from source..."
echo "[build-whisper-cpp] Delete .cache/native/ to force a future rebuild."

echo "[build-whisper-cpp] Cloning whisper.cpp $WHISPER_CPP_TAG ..."
rm -rf "$BUILD_TMP"
git clone --depth 1 --branch "$WHISPER_CPP_TAG" "$WHISPER_CPP_REPO" "$BUILD_TMP"

echo "[build-whisper-cpp] Building with Metal support ..."
# GGML_NATIVE=OFF → portable arm64 baseline: one binary runs on every Apple
# Silicon (M1+). With native on, -mcpu detection emits i8mm intrinsics that
# fail to build / run on CPUs without i8mm (e.g. the M1 CI runner).
cmake -S "$BUILD_TMP" -B "$BUILD_TMP/build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DWHISPER_METAL=ON \
  -DWHISPER_BUILD_TESTS=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DBUILD_SHARED_LIBS=OFF \
  -DGGML_NATIVE=OFF

cmake --build "$BUILD_TMP/build" --config Release --target whisper-cli -j "$(sysctl -n hw.logicalcpu)"

# Locate the binary (location varies between whisper.cpp versions)
if [ -f "$BUILD_TMP/build/bin/whisper-cli" ]; then
  BUILT_BIN="$BUILD_TMP/build/bin/whisper-cli"
elif [ -f "$BUILD_TMP/build/bin/main" ]; then
  BUILT_BIN="$BUILD_TMP/build/bin/main"
else
  echo "[build-whisper-cpp] ERROR: Could not find compiled binary"
  find "$BUILD_TMP/build" -type f -perm +111 -name '*whisper*' -o -name 'main' 2>/dev/null || true
  exit 1
fi

# Populate cache
mkdir -p "$CACHE_DIR"
cp "$BUILT_BIN" "$CACHE_DIR/whisper-cpp"
chmod +x "$CACHE_DIR/whisper-cpp"

METAL_SHADER=$(find "$BUILD_TMP/build" -name "ggml-metal.metal" -type f 2>/dev/null | head -1)
if [ -n "$METAL_SHADER" ]; then
  cp "$METAL_SHADER" "$CACHE_DIR/ggml-metal.metal"
fi

METALLIB=$(find "$BUILD_TMP/build" -name "default.metallib" -type f 2>/dev/null | head -1)
if [ -n "$METALLIB" ]; then
  cp "$METALLIB" "$CACHE_DIR/default.metallib"
fi

# Copy from cache to dist
cp "$CACHE_DIR/whisper-cpp" "$OUT_DIR/whisper-cpp"
[ -f "$CACHE_DIR/ggml-metal.metal" ] && cp "$CACHE_DIR/ggml-metal.metal" "$OUT_DIR/ggml-metal.metal"
[ -f "$CACHE_DIR/default.metallib" ] && cp "$CACHE_DIR/default.metallib"  "$OUT_DIR/default.metallib"

# Cleanup build temp
rm -rf "$BUILD_TMP"

echo "[build-whisper-cpp] Done → $OUT_DIR/whisper-cpp (cached for future builds)"
