/**
 * TapTalk mic glyph for in-app UI (no emerald background rect).
 * Keep in sync with src/electron/assets/icon.svg — regenerate tray/app PNGs via:
 *   python3 scripts/generate-app-icons.py
 * Website source: taptalk-website/public/favicon.svg
 */

const GLYPH_PATHS = `<path d="M16 6a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V9a3 3 0 0 0-3-3Z" fill="currentColor"/>
<path d="M22 14v1.5a6 6 0 0 1-12 0V14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
<line x1="16" y1="21" x2="16" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;

export function taptalkGlyphSvg(size = 18) {
  const w = Number(size) || 18;
  return `<svg width="${w}" height="${w}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${GLYPH_PATHS}</svg>`;
}

export function mountTaptalkGlyphs(root = document) {
  for (const el of root.querySelectorAll("[data-taptalk-glyph]")) {
    const raw = el.getAttribute("data-taptalk-glyph");
    el.innerHTML = taptalkGlyphSvg(raw ? Number(raw) : 18);
  }
}
