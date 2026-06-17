#!/usr/bin/env python3
"""Regenerate TapTalk app icons from src/electron/assets/icon.svg.

Outputs (all committed — CI does not run this script):
  - src/electron/assets/icon.png          (1024×1024, Dock / in-app)
  - build/icon.icns                       (macOS bundle + DMG)
  - src/electron/assets/tray-*Template*.png (menu-bar template glyphs)

Website source of truth: taptalk-website/public/favicon.svg
Copy changes into src/electron/assets/icon.svg, then run:

  pip3 install -r requirements-dev.txt   # once
  python3 scripts/generate-app-icons.py

Requires macOS: qlmanage, sips, iconutil, Python 3 + Pillow.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src" / "electron" / "assets"
BUILD = ROOT / "build"
ICON_SVG = ASSETS / "icon.svg"
ICON_PNG = ASSETS / "icon.png"
ICONSET = BUILD / "icon.iconset"
ICNS = BUILD / "icon.icns"
IDLE_ALPHA = 0.72

TRAY_GLYPH_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <path d="M16 6a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V9a3 3 0 0 0-3-3Z" fill="#000000"/>
  <path d="M22 14v1.5a6 6 0 0 1-12 0V14" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
  <line x1="16" y1="21" x2="16" y2="24" stroke="#000000" stroke-width="2" stroke-linecap="round"/>
</svg>"""


def rasterize_svg(svg: str, size: int) -> Image.Image:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        svg_path = tmp_path / "source.svg"
        svg_path.write_text(svg, encoding="utf-8")
        subprocess.run(
            ["qlmanage", "-t", "-s", str(size), "-o", str(tmp_path), str(svg_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return Image.open(tmp_path / "source.svg.png").convert("RGBA")


def rasterize_svg_file(svg_path: Path, size: int, out_path: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        subprocess.run(
            ["qlmanage", "-t", "-s", str(size), "-o", str(tmp_path), str(svg_path)],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        shutil.move(str(tmp_path / f"{svg_path.name}.png"), out_path)


def tray_glyph_bitmap(size: int) -> Image.Image:
    """Black mic on transparent — qlmanage white matte removed."""
    src = rasterize_svg(TRAY_GLYPH_SVG, 512)
    out = Image.new("RGBA", src.size)
    src_px = src.load()
    out_px = out.load()
    w, h = src.size
    for y in range(h):
        for x in range(w):
            r, g, b, _a = src_px[x, y]
            if r > 240 and g > 240 and b > 240:
                out_px[x, y] = (0, 0, 0, 0)
            else:
                lum = 255 - max(r, g, b)
                out_px[x, y] = (0, 0, 0, lum)
    return out.resize((size, size), Image.Resampling.LANCZOS)


def apply_alpha(image: Image.Image, factor: float) -> Image.Image:
    if factor >= 0.999:
        return image
    out = image.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, int(a * factor))
    return out


def generate_app_png() -> None:
    print(f"→ {ICON_PNG}")
    rasterize_svg_file(ICON_SVG, 1024, ICON_PNG)


def generate_icns() -> None:
    print(f"→ {ICNS}")
    if ICONSET.exists():
        shutil.rmtree(ICONSET)
    ICONSET.mkdir(parents=True)

    for size in (16, 32, 128, 256, 512):
        rasterize_svg_file(ICON_SVG, size, ICONSET / f"icon_{size}x{size}.png")
        rasterize_svg_file(ICON_SVG, size * 2, ICONSET / f"icon_{size}x{size}@2x.png")

    subprocess.run(["iconutil", "-c", "icns", str(ICONSET), "-o", str(ICNS)], check=True)


def generate_tray_pngs() -> None:
    print("→ tray template PNGs")
    active_32 = tray_glyph_bitmap(32)
    active_16 = active_32.resize((16, 16), Image.Resampling.LANCZOS)
    idle_32 = apply_alpha(active_32, IDLE_ALPHA)
    idle_16 = apply_alpha(active_16, IDLE_ALPHA)

    active_16.save(ASSETS / "tray-activeTemplate.png")
    active_32.save(ASSETS / "tray-activeTemplate@2x.png")
    idle_16.save(ASSETS / "tray-idleTemplate.png")
    idle_32.save(ASSETS / "tray-idleTemplate@2x.png")


def main() -> int:
    if sys.platform != "darwin":
        print("generate-app-icons.py: macOS only (qlmanage, iconutil).", file=sys.stderr)
        return 1

    if not ICON_SVG.is_file():
        print(f"Missing {ICON_SVG}", file=sys.stderr)
        return 1

    ASSETS.mkdir(parents=True, exist_ok=True)
    BUILD.mkdir(parents=True, exist_ok=True)

    generate_app_png()
    generate_tray_pngs()
    generate_icns()

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
