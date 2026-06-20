import { vaultList, vaultSearch, vaultTags, vaultDetail } from "./dom.js";
import { renderStatus } from "./status-view.js";

let allEntries = [];
let activeTag = null;
let query = "";
let selectedFile = null;
let openLinkPreviewFile = null;
let lastVaultRefreshKey = "";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<span class="md-link">$1</span>');
}

// Minimal, safe markdown → HTML. Content is HTML-escaped first, so only our own
// tags reach the DOM — no XSS even from note bodies.
function renderMarkdown(md) {
  const lines = esc(md).split("\n");
  let html = "";
  let inCode = false;
  let listOpen = false;
  const closeList = () => {
    if (listOpen) {
      html += "</ul>";
      listOpen = false;
    }
  };
  for (const raw of lines) {
    if (raw.trim().startsWith("```")) {
      if (inCode) {
        html += "</code></pre>";
        inCode = false;
      } else {
        closeList();
        html += "<pre><code>";
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      html += raw + "\n";
      continue;
    }
    const line = raw.trim();
    if (line === "") {
      closeList();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      if (!listOpen) {
        html += "<ul>";
        listOpen = true;
      }
      html += `<li>${inline(li[1])}</li>`;
      continue;
    }
    closeList();
    html += `<p>${inline(line)}</p>`;
  }
  if (inCode) html += "</code></pre>";
  closeList();
  return html;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

function matches(entry) {
  if (activeTag && !entry.tags.includes(activeTag)) return false;
  if (!query) return true;
  const hay = `${entry.title} ${entry.source} ${entry.tags.join(" ")} ${entry.excerpt}`.toLowerCase();
  return hay.includes(query);
}

function renderTags() {
  if (!vaultTags) return;
  vaultTags.innerHTML = "";
  const counts = new Map();
  for (const e of allEntries) for (const t of e.tags) counts.set(t, (counts.get(t) || 0) + 1);
  for (const [tag] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "vault-tag-chip" + (activeTag === tag ? " active" : "");
    chip.textContent = `#${tag}`;
    chip.addEventListener("click", () => {
      activeTag = activeTag === tag ? null : tag;
      renderTags();
      renderList();
    });
    vaultTags.appendChild(chip);
  }
}

function renderList() {
  if (!vaultList) return;
  vaultList.innerHTML = "";
  const shown = allEntries.filter(matches);
  if (shown.length === 0) {
    const empty = document.createElement("div");
    empty.className = "recent-empty";
    empty.textContent = allEntries.length === 0 ? "Vault is empty — capture with Fn + M." : "No matches.";
    vaultList.appendChild(empty);
    return;
  }
  shown.forEach((entry, i) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "vault-item" + (entry.file === selectedFile ? " active" : "");
    item.style.setProperty("--i", String(i));

    const title = document.createElement("div");
    title.className = "vault-item-title";
    title.textContent = entry.title;
    item.appendChild(title);

    const ex = document.createElement("div");
    ex.className = "vault-item-excerpt";
    ex.textContent = entry.excerpt;
    item.appendChild(ex);

    const meta = document.createElement("div");
    meta.className = "vault-item-meta";
    meta.textContent = [entry.source, entry.tags.map((t) => `#${t}`).join(" "), fmtDate(entry.created)]
      .filter(Boolean)
      .join("  ·  ");
    item.appendChild(meta);

    item.addEventListener("click", () => selectNote(entry));
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, entry);
    });
    vaultList.appendChild(item);
  });
}

let openMenu = null;
function closeContextMenu() {
  if (openMenu) {
    openMenu.remove();
    openMenu = null;
    document.removeEventListener("click", closeContextMenu);
    document.removeEventListener("scroll", closeContextMenu, true);
  }
}

function showContextMenu(x, y, entry) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.className = "vault-ctx";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  const del = document.createElement("button");
  del.type = "button";
  del.className = "vault-ctx-item vault-ctx-danger";
  del.textContent = "Delete note";
  del.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeContextMenu();
    if (!window.confirm(`Delete "${entry.title}"? This cannot be undone.`)) return;
    try {
      await window.tapTalk?.deleteVaultEntry?.(entry.file);
    } catch {
      /* ignore */
    }
    if (selectedFile === entry.file && vaultDetail) {
      selectedFile = null;
      removeLinkPreviewSurface();
      vaultDetail.innerHTML = '<div class="vault-detail-empty">Select a note to preview it.</div>';
    }
    await loadVault();
  });
  menu.appendChild(del);
  document.body.appendChild(menu);
  openMenu = menu;
  // Defer so this same click/contextmenu doesn't immediately close it.
  setTimeout(() => {
    document.addEventListener("click", closeContextMenu);
    document.addEventListener("scroll", closeContextMenu, true);
  }, 0);
}

function vaultStage() {
  return vaultDetail?.closest(".stage-vault") || null;
}

function clearLinkPreview(resize = true) {
  openLinkPreviewFile = null;
  const stage = vaultStage();
  stage?.classList.remove("stage-vault--link-preview");
  const preview = stage?.querySelector(":scope > .vault-link-preview");
  if (preview) {
    preview.innerHTML = "";
    preview.onkeydown = null;
    delete preview.dataset.file;
  }
  document.querySelectorAll(".vault-link-suggestion.active").forEach((item) => {
    item.classList.remove("active");
    item.setAttribute("aria-pressed", "false");
  });
  if (resize) void window.tapTalk?.resizeForView?.("vault");
}

function removeLinkPreviewSurface() {
  openLinkPreviewFile = null;
  const stage = vaultStage();
  stage?.classList.remove("stage-vault--link-preview");
  stage?.querySelectorAll(":scope > .vault-link-preview").forEach((item) => item.remove());
}

function createLinkPreviewSurface() {
  const stage = vaultStage();
  if (!stage) return null;
  stage.querySelectorAll(":scope > .vault-link-preview").forEach((item) => item.remove());
  const preview = document.createElement("section");
  preview.className = "vault-link-preview";
  preview.setAttribute("aria-label", "Suggested link preview");
  stage.appendChild(preview);
  return preview;
}

function renderLinkPreview(container, currentEntry, suggestion, onApplied, onClose) {
  if (!container) return;
  container.dataset.file = suggestion.file;
  container.onkeydown = (event) => {
    if (event.key === "Escape") onClose();
  };
  container.innerHTML = '<div class="vault-link-suggestions-empty">Loading preview…</div>';
  void (async () => {
    let body = "";
    try {
      body = (await window.tapTalk?.readVaultBody?.(suggestion.file)) || "";
    } catch {
      body = suggestion.excerpt || "";
    }
    if (container.dataset.file !== suggestion.file) return;

    const back = document.createElement("button");
    back.type = "button";
    back.className = "vault-link-preview-pill vault-link-preview-back";
    back.textContent = "↩ Back";
    back.setAttribute("aria-label", "Close preview");
    back.addEventListener("click", onClose);

    const head = document.createElement("div");
    head.className = "vault-link-preview-head";

    const titleBlock = document.createElement("div");
    titleBlock.className = "vault-link-preview-title-block";

    const title = document.createElement("div");
    title.className = "vault-link-preview-title";
    title.textContent = suggestion.title;

    const link = document.createElement("div");
    link.className = "vault-link-preview-link";
    link.textContent = suggestion.wikilink;
    titleBlock.appendChild(title);
    titleBlock.appendChild(link);

    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "vault-link-preview-pill vault-link-preview-apply";
    apply.textContent = "✓ Link";
    apply.setAttribute("aria-label", "Apply link");
    apply.addEventListener("click", async () => {
      apply.disabled = true;
      apply.textContent = "Linking…";
      const ok = await window.tapTalk?.applyVaultLink?.(currentEntry.file, suggestion.file);
      apply.textContent = ok ? "✓ Linked" : "Failed";
      if (ok) await onApplied();
    });
    head.appendChild(titleBlock);

    const preview = document.createElement("article");
    preview.className = "vault-link-preview-body vault-md";
    preview.innerHTML = renderMarkdown(body || suggestion.excerpt);

    const actions = document.createElement("div");
    actions.className = "vault-link-preview-actions";
    actions.appendChild(back);
    actions.appendChild(apply);

    container.innerHTML = "";
    container.appendChild(head);
    container.appendChild(preview);
    container.appendChild(actions);
    back.focus();
  })();
}

function renderLinkSuggestions(container, preview, currentEntry, suggestions, onApplied) {
  container.innerHTML = "";
  clearLinkPreview(false);
  if (!preview) return;
  if (suggestions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "vault-link-suggestions-empty";
    empty.textContent = "No link candidates.";
    container.appendChild(empty);
    return;
  }

  for (const suggestion of suggestions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vault-link-suggestion";
    btn.title = "Preview link candidate";
    btn.setAttribute("aria-pressed", "false");

    const title = document.createElement("span");
    title.className = "vault-link-suggestion-title";
    title.textContent = suggestion.title;
    btn.appendChild(title);

    const link = document.createElement("span");
    link.className = "vault-link-suggestion-link";
    link.textContent = suggestion.wikilink;
    btn.appendChild(link);

    btn.addEventListener("click", () => {
      if (openLinkPreviewFile === suggestion.file) {
        clearLinkPreview();
        return;
      }
      openLinkPreviewFile = suggestion.file;
      vaultStage()?.classList.add("stage-vault--link-preview");
      void window.tapTalk?.resizeForView?.("vault-preview");
      container.querySelectorAll(".vault-link-suggestion").forEach((item) => {
        item.classList.toggle("active", item === btn);
        item.setAttribute("aria-pressed", item === btn ? "true" : "false");
      });
      renderLinkPreview(preview, currentEntry, suggestion, onApplied, () => clearLinkPreview());
    });
    container.appendChild(btn);
  }
}

async function selectNote(entry) {
  selectedFile = entry.file;
  removeLinkPreviewSurface();
  renderList();
  if (!vaultDetail) return;
  vaultDetail.innerHTML = '<div class="vault-detail-empty">Loading…</div>';
  let body = "";
  try {
    body = (await window.tapTalk?.readVaultBody?.(entry.file)) || "";
  } catch {
    body = "";
  }

  const head = document.createElement("div");
  head.className = "vault-detail-head";
  const h = document.createElement("h2");
  h.textContent = entry.title;
  head.appendChild(h);
  const meta = document.createElement("div");
  meta.className = "vault-detail-meta";
  meta.textContent = [entry.source, entry.tags.map((t) => `#${t}`).join(" "), fmtDate(entry.created)]
    .filter(Boolean)
    .join("  ·  ");
  head.appendChild(meta);
  const actions = document.createElement("div");
  actions.className = "vault-detail-actions";

  const open = document.createElement("button");
  open.type = "button";
  open.className = "vault-detail-open";
  open.textContent = "Open in editor";
  open.addEventListener("click", () => window.tapTalk?.openVaultEntry?.(entry.file));
  actions.appendChild(open);

  const suggest = document.createElement("button");
  suggest.type = "button";
  suggest.className = "vault-detail-open";
  suggest.textContent = "Suggest links";
  suggest.setAttribute("aria-expanded", "false");
  actions.appendChild(suggest);
  head.appendChild(actions);

  const suggestions = document.createElement("div");
  suggestions.id = "vaultLinkSuggestions";
  suggestions.className = "vault-link-suggestions";
  suggestions.hidden = true;
  suggest.setAttribute("aria-controls", suggestions.id);
  const linkPreview = createLinkPreviewSurface();
  let suggestionsOpen = false;
  let suggestionsLoaded = false;
  const setSuggestionsOpen = (open) => {
    suggestionsOpen = open;
    suggestions.hidden = !open;
    suggest.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) clearLinkPreview();
  };
  suggest.addEventListener("click", async () => {
    if (suggestionsOpen) {
      setSuggestionsOpen(false);
      return;
    }
    setSuggestionsOpen(true);
    if (suggestionsLoaded) return;
    suggest.disabled = true;
    suggest.textContent = "Suggesting…";
    try {
      renderLinkSuggestions(
        suggestions,
        linkPreview,
        entry,
        await window.tapTalk?.suggestVaultLinks?.(entry.file) || [],
        async () => {
          body = (await window.tapTalk?.readVaultBody?.(entry.file)) || body;
          article.innerHTML = renderMarkdown(body);
        }
      );
      suggestionsLoaded = true;
    } catch {
      renderLinkSuggestions(suggestions, linkPreview, entry, [], async () => undefined);
      suggestionsLoaded = true;
    } finally {
      suggest.disabled = false;
      suggest.textContent = "Suggest links";
    }
  });

  const article = document.createElement("article");
  article.className = "vault-md";
  article.innerHTML = renderMarkdown(body);

  vaultDetail.innerHTML = "";
  vaultDetail.appendChild(head);
  vaultDetail.appendChild(suggestions);
  vaultDetail.appendChild(article);
  vaultDetail.classList.remove("vault-detail--in");
  void vaultDetail.offsetWidth;
  vaultDetail.classList.add("vault-detail--in");
}

if (vaultSearch) {
  vaultSearch.addEventListener("input", () => {
    query = vaultSearch.value.trim().toLowerCase();
    renderList();
  });
}

export async function loadVault() {
  try {
    allEntries = (await window.tapTalk?.listVault?.()) || [];
  } catch {
    allEntries = [];
  }
  // Keep current selection if it still exists.
  if (selectedFile && !allEntries.some((e) => e.file === selectedFile)) {
    selectedFile = null;
  }
  renderTags();
  renderList();
}

export function renderStatusAndRefreshVault(status) {
  renderStatus(status);
  if (status?.phase !== "idle") return;
  const activeView = document.querySelector(".view.active");
  if (activeView?.id !== "viewVault") return;
  const latest = Array.isArray(status.recentTranscripts) ? status.recentTranscripts[0] : null;
  const key = latest ? `${latest.ts || ""}:${latest.text || ""}` : status.lastText || "";
  if (!key || key === lastVaultRefreshKey) return;
  lastVaultRefreshKey = key;
  void loadVault();
}
