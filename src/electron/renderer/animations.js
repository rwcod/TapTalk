/**
 * TapTalk UI Animation Layer
 * Spring-physics, magnetic tilt, stagger, and micro-interaction animations.
 * Pure vanilla JS — no external deps, CSP-safe (script-src 'self').
 */

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Sidebar sliding active indicator ─────────────────────────────────────────
function initSidebarIndicator() {
  const nav = document.getElementById('sidebarNav');
  if (!nav) return;

  const indicator = document.createElement('div');
  indicator.className = 'sidebar-nav-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  nav.insertBefore(indicator, nav.firstChild);

  function place(item, animate) {
    if (!item) return;
    if (!animate || reducedMotion) {
      indicator.style.transition = 'none';
    } else {
      indicator.style.transition =
        'transform 360ms var(--ease-spring), width 300ms var(--ease-smooth), height 300ms var(--ease-smooth)';
    }
    indicator.style.transform = `translate(${item.offsetLeft}px, ${item.offsetTop}px)`;
    indicator.style.width = `${item.offsetWidth}px`;
    indicator.style.height = `${item.offsetHeight}px`;
    if (!animate) {
      // Force reflow, then re-enable transitions for subsequent placements
      void indicator.offsetWidth;
      indicator.style.transition = '';
    }
  }

  const placeActive = () => place(nav.querySelector('.sidebar-item.active'), false);
  placeActive();
  // Re-measure once fonts/layout settle so the pill lands exactly.
  window.addEventListener('load', placeActive);
  setTimeout(placeActive, 250);

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    requestAnimationFrame(() => place(btn, true));
  });
}

// ─── Cockpit HUD telemetry chips around the orb ───────────────────────────────
function initCockpitHUD() {
  const mode = document.getElementById('hudMode');
  const model = document.getElementById('hudModel');
  const lang = document.getElementById('hudLang');
  const modelInput = document.getElementById('localModelInput');
  const cppModelInput = document.getElementById('whisperCppModelInput');
  const engineSelect = document.getElementById('localEngineSelect');
  const langSel = document.getElementById('languageModeSelect');
  const modeLabel = document.getElementById('sidebarModeLabel');

  const selText = (sel) => {
    if (!sel || sel.selectedIndex < 0) return '';
    const o = sel.options[sel.selectedIndex];
    return o ? o.textContent.trim() : '';
  };

  function activeModelText() {
    const isCpp = engineSelect && engineSelect.value === 'whisper-cpp';
    if (isCpp) return (cppModelInput && selText(cppModelInput)) || 'on-device';
    return (modelInput && modelInput.value.trim()) || 'on-device';
  }

  function refresh() {
    if (mode && modeLabel) mode.textContent = modeLabel.textContent.replace(/\s*mode$/i, '').trim() || 'Local';
    if (model) model.textContent = activeModelText();
    if (lang) lang.textContent = selText(langSel) || 'auto';
  }

  refresh();
  if (modelInput) modelInput.addEventListener('change', refresh);
  if (cppModelInput) cppModelInput.addEventListener('change', refresh);
  if (engineSelect) engineSelect.addEventListener('change', refresh);
  if (langSel) langSel.addEventListener('change', refresh);
  if (modeLabel) new MutationObserver(refresh).observe(modeLabel, { childList: true, characterData: true, subtree: true });
  window.addEventListener('load', refresh);
  setTimeout(refresh, 700);
}

// ─── Hero button: magnetic parallax + squash & stretch ────────────────────────
function initHeroMagneticEffect() {
  const btn = document.getElementById('recBtn');
  if (!btn || reducedMotion) return;

  const halo = btn.querySelector('.hero-halo');
  const core = btn.querySelector('.hero-core');

  const LERP      = 0.10;   // spring tightness (lower = slower/bouncier)
  const HALO_PX   = 10;     // halo moves opposite — feels "behind"
  const CORE_PX   = 5;      // core follows cursor — feels "in front"
  const EPSILON   = 0.005;

  let rafId = null;
  let targetDx = 0, targetDy = 0;
  let curDx = 0, curDy = 0;
  let hovering = false;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function applyLayers() {
    if (halo) halo.style.transform = `translate(${curDx * -HALO_PX}px, ${curDy * -HALO_PX}px)`;
    if (core) core.style.transform = `translate(${curDx * CORE_PX}px, ${curDy * CORE_PX}px)`;
  }

  function tick() {
    curDx = lerp(curDx, targetDx, LERP);
    curDy = lerp(curDy, targetDy, LERP);

    const settled = !hovering
      && Math.abs(curDx) < EPSILON
      && Math.abs(curDy) < EPSILON;

    if (settled) {
      // Snap to zero and clear inline transforms so CSS animations resume
      curDx = 0; curDy = 0;
      if (halo) halo.style.transform = '';
      if (core) core.style.transform = '';
      rafId = null;
      return;
    }

    applyLayers();
    rafId = requestAnimationFrame(tick);
  }

  function startTick() {
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  btn.addEventListener('mouseenter', () => {
    hovering = true;
    startTick();
  });

  btn.addEventListener('mousemove', (e) => {
    if (btn.getAttribute('data-phase') === 'transcribing') return;
    const r = btn.getBoundingClientRect();
    targetDx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    targetDy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  });

  btn.addEventListener('mouseleave', () => {
    hovering = false;
    targetDx = 0;
    targetDy = 0;
    btn.style.transition = 'scale 200ms var(--ease-spring)';
    btn.style.scale = '1';
    setTimeout(() => { btn.style.transition = ''; }, 200);
    startTick(); // spring layers back
  });

  // Squash on press, spring back on release
  btn.addEventListener('mousedown', () => {
    if (btn.getAttribute('data-phase') === 'transcribing') return;
    btn.style.transition = 'scale 80ms var(--ease-smooth)';
    btn.style.scale = '0.94';
  });

  btn.addEventListener('mouseup', () => {
    btn.style.transition = 'scale 240ms var(--ease-spring)';
    btn.style.scale = '1';
    setTimeout(() => { btn.style.transition = ''; }, 240);
  });
}

// ─── List items: stagger entrance via MutationObserver ────────────────────────
function initListStagger() {
  if (reducedMotion) return;

  const lists = ['recentList', 'historyFullList']
    .map((id) => document.getElementById(id))
    .filter(Boolean);

  for (const list of lists) {
    const observer = new MutationObserver(() => {
      const items = list.querySelectorAll('.recent-item:not([data-anim])');
      items.forEach((item, i) => {
        item.dataset.anim = '1';
        item.style.setProperty('--stagger-i', i);
        item.classList.add('recent-item--entering');
        item.addEventListener('animationend', () => {
          item.classList.remove('recent-item--entering');
        }, { once: true });
      });
    });
    observer.observe(list, { childList: true });
  }
}

// ─── Hero orb: audio-reactive equalizer while recording ───────────────────────
// Drives the .hero-eq bars with smoothed random levels for an organic "live"
// feel, overriding the CSS keyframe only while data-phase="recording".
function initHeroPhaseFX() {
  const btn = document.getElementById('recBtn');
  if (!btn || reducedMotion) return;

  const bars = Array.from(btn.querySelectorAll('.hero-eq i'));
  if (!bars.length) return;

  let rafId = null;
  let lastRoll = 0;
  const cur = bars.map(() => 0.6);
  const tgt = bars.map(() => 0.6);

  function frame(t) {
    if (btn.getAttribute('data-phase') !== 'recording') {
      // Hand control back to the CSS animation
      bars.forEach((b) => { b.style.transform = ''; b.style.animation = ''; });
      rafId = null;
      return;
    }
    if (t - lastRoll > 110) {
      for (let i = 0; i < tgt.length; i++) tgt[i] = 0.35 + Math.random() * 1.25;
      lastRoll = t;
    }
    for (let i = 0; i < bars.length; i++) {
      cur[i] += (tgt[i] - cur[i]) * 0.28;
      bars[i].style.animation = 'none';
      bars[i].style.transform = `scaleY(${cur[i].toFixed(3)})`;
    }
    rafId = requestAnimationFrame(frame);
  }

  function start() { if (!rafId) rafId = requestAnimationFrame(frame); }

  const obs = new MutationObserver(() => {
    if (btn.getAttribute('data-phase') === 'recording') start();
  });
  obs.observe(btn, { attributes: true, attributeFilter: ['data-phase'] });

  if (btn.getAttribute('data-phase') === 'recording') start();
}

// ─── Transcript card: flash animation when new content arrives ────────────────
function initTranscriptFlash() {
  const box = document.getElementById('transcriptBox');
  if (!box || reducedMotion) return;

  let firstRender = true;

  const observer = new MutationObserver(() => {
    if (firstRender) { firstRender = false; return; }
    if (!box.textContent.trim()) return;
    box.classList.remove('transcript--flash');
    void box.offsetWidth; // reflow to restart animation
    box.classList.add('transcript--flash');
  });

  observer.observe(box, { childList: true, characterData: true, subtree: true });
}

// ─── Ambient aurora parallax: background drifts opposite the cursor ───────────
function initAuroraParallax() {
  const aurora = document.querySelector('.aurora');
  if (!aurora || reducedMotion) return;

  let rafId = null;
  let tx = 0, ty = 0, cx = 0, cy = 0;

  function tick() {
    cx += (tx - cx) * 0.06;
    cy += (ty - cy) * 0.06;
    aurora.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
    if (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
    }
  }

  window.addEventListener('mousemove', (e) => {
    tx = (e.clientX / window.innerWidth - 0.5) * -34;
    ty = (e.clientY / window.innerHeight - 0.5) * -34;
    if (!rafId) rafId = requestAnimationFrame(tick);
  });
}

// ─── 3D tilt on large cards toward the cursor ─────────────────────────────────
function initCardTilt() {
  if (reducedMotion) return;
  const SEL = '.transcript-card, .wizard-mode-card';
  const MAX = 7; // degrees

  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest(SEL);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform =
      `perspective(900px) rotateY(${(px * MAX).toFixed(2)}deg) rotateX(${(-py * MAX).toFixed(2)}deg) translateZ(8px)`;
  });

  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest(SEL);
    if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    el.style.transform = '';
  });
}

// ─── Cinematic focus while recording: dim the surroundings ────────────────────
function initRecordCinematic() {
  const btn = document.getElementById('recBtn');
  if (!btn) return;

  const sync = () => {
    document.body.classList.toggle(
      'is-recording',
      btn.getAttribute('data-phase') === 'recording'
    );
  };
  const obs = new MutationObserver(sync);
  obs.observe(btn, { attributes: true, attributeFilter: ['data-phase'] });
  sync();
}

// ─── Main entry ───────────────────────────────────────────────────────────────
export function initAnimations() {
  initSidebarIndicator();
  initHeroMagneticEffect();
  initHeroPhaseFX();
  initListStagger();
  initTranscriptFlash();
  initAuroraParallax();
  initCardTilt();
  initRecordCinematic();
  initCockpitHUD();
}
