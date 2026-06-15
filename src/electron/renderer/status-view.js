import {
  clearHistoryBtn,
  errorText,
  fnHint,
  footerProvider,
  footerStatus,
  historyFullList,
  openAccessibilityBtn,
  providerTag,
  recBtn,
  recLabel,
  recentList,
  statusText,
  transcriptBox,
  updateBanner,
  updateBannerVersion,
  useFallbackHotkeyBtn
} from "./dom.js";
import { state } from "./state.js";

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function entryText(item) {
  return typeof item === "string" ? item : item?.text || "";
}

function entryTs(item) {
  return typeof item === "object" && item !== null ? item.ts || 0 : 0;
}

function buildRecentItem(text, ts) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "recent-item";
  button.title = "Click to preview in Transcript box";

  const textSpan = document.createElement("span");
  textSpan.className = "recent-item-text";
  textSpan.textContent = text;
  button.appendChild(textSpan);

  if (ts) {
    const timeSpan = document.createElement("span");
    timeSpan.className = "recent-item-time";
    timeSpan.textContent = formatTimestamp(ts);
    button.appendChild(timeSpan);
  }

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "recent-item-copy";
  copyBtn.title = "Copy";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).catch(() => {});
  });
  button.appendChild(copyBtn);

  button.addEventListener("click", () => {
    transcriptBox.textContent = text;
  });
  return button;
}

export function renderRecentTranscripts(items) {
  recentList.innerHTML = "";
  if (historyFullList) historyFullList.innerHTML = "";

  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "recent-empty";
    empty.textContent = "No recent transcripts yet.";
    recentList.appendChild(empty);
    if (historyFullList) historyFullList.appendChild(empty.cloneNode(true));
    return;
  }

  items.forEach((item) => {
    const text = entryText(item);
    const ts = entryTs(item);
    recentList.appendChild(buildRecentItem(text, ts));
    if (historyFullList) historyFullList.appendChild(buildRecentItem(text, ts));
  });
}

export function renderStatus(status) {
  state.status = status;

  const visualPhase =
    status.phase === "recording" && status.dictationMode === "edit" ? "editing" : status.phase;
  recBtn.setAttribute("data-phase", visualPhase);
  if (status.phase === "idle") {
    recLabel.textContent = "Start Recording";
    recBtn.disabled = false;
  } else if (status.phase === "starting") {
    recLabel.textContent = "Starting\u2026";
    recBtn.disabled = true;
  } else if (status.phase === "recording") {
    recLabel.textContent = status.dictationMode === "edit" ? "Stop Editing" : "Stop Recording";
    recBtn.disabled = false;
  } else if (status.phase === "editing") {
    recLabel.textContent = "Editing…";
    recBtn.disabled = true;
  } else {
    recLabel.textContent = "Transcribing\u2026";
    recBtn.disabled = true;
  }

  statusText.textContent = status.message || "Ready";
  const autoPasteAccessibilityIssue =
    typeof status.error === "string" &&
    /(\(1002\)|not authoris|not authorized|nie ma zezwolenia|osascript)/i.test(status.error);
  if (openAccessibilityBtn) {
    const showPermissionAction =
      status.phase === "idle" &&
      (status.fnPermissionRequired === true || autoPasteAccessibilityIssue);
    openAccessibilityBtn.textContent = autoPasteAccessibilityIssue
      ? "Enable auto-paste in macOS"
      : "Enable Fn in macOS";
    openAccessibilityBtn.style.display = showPermissionAction ? "inline-flex" : "none";
    openAccessibilityBtn.disabled = !showPermissionAction;
  }
  const fnPreferred = state.settings?.hotkey?.preferred === "Fn+Space";
  if (useFallbackHotkeyBtn) {
    const showFallbackAction =
      status.phase === "idle" && status.fnPermissionRequired === true && fnPreferred;
    useFallbackHotkeyBtn.style.display = showFallbackAction ? "inline-flex" : "none";
    useFallbackHotkeyBtn.disabled = !showFallbackAction;
  }
  if (fnHint) {
    const showFnHint =
      status.phase === "idle" && fnPreferred && status.fnPermissionRequired !== true;
    fnHint.style.display = showFnHint ? "inline" : "none";
  }

  if (updateBanner) {
    const updatedFrom = typeof status.appUpdatedFromVersion === "string"
      ? status.appUpdatedFromVersion.trim()
      : "";
    const currentVersion = typeof status.appVersion === "string" ? status.appVersion.trim() : "";
    const showBanner = updatedFrom.length > 0 && currentVersion.length > 0 && !state.updateBannerDismissed;
    if (showBanner && updateBannerVersion) {
      updateBannerVersion.textContent = currentVersion;
    }
    updateBanner.style.display = showBanner ? "flex" : "none";
  }

  if (status.error) {
    errorText.textContent = status.error;
    errorText.style.display = "inline";
  } else {
    errorText.style.display = "none";
  }

  if (status.provider && status.provider !== "-") {
    providerTag.textContent = status.provider;
    providerTag.style.display = "inline";
    if (footerProvider) {
      footerProvider.textContent = status.provider;
      footerProvider.style.display = "inline";
    }
  } else {
    providerTag.style.display = "none";
    if (footerProvider) footerProvider.style.display = "none";
  }

  if (footerStatus) {
    footerStatus.textContent = status.message || "Ready";
  }

  if (status.lastText !== undefined) {
    transcriptBox.textContent = status.lastText;
  }

  if (Array.isArray(status.recentTranscripts)) {
    renderRecentTranscripts(status.recentTranscripts);
  }

  if (clearHistoryBtn) {
    const canClear =
      status.phase === "idle" &&
      Array.isArray(status.recentTranscripts) &&
      status.recentTranscripts.length > 0;
    clearHistoryBtn.disabled = !canClear;
  }
}
