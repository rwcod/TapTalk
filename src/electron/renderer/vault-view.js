import { vaultList, vaultSearch, vaultTags, vaultDetail } from "./dom.js";

let allEntries = [];
let activeTag = null;
let query = "";
let selectedFile = null;

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

async function selectNote(entry) {
  selectedFile = entry.file;
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
  const open = document.createElement("button");
  open.type = "button";
  open.className = "vault-detail-open";
  open.textContent = "Open in editor";
  open.addEventListener("click", () => window.tapTalk?.openVaultEntry?.(entry.file));
  head.appendChild(open);

  const article = document.createElement("article");
  article.className = "vault-md";
  article.innerHTML = renderMarkdown(body);

  vaultDetail.innerHTML = "";
  vaultDetail.appendChild(head);
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
