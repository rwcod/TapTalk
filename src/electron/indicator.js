const pill = document.getElementById("pill");
const text = document.getElementById("text");
const timerEl = document.getElementById("timer");
const bars = Array.from(document.querySelectorAll(".bar"));

const LABELS = {
  idle: "Ready",
  recording: "Recording",
  transcribing: "Transcribing…",
  editing: "Editing…",
  thinking: "Thinking…"
};

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function renderBars(values) {
  const next = Array.isArray(values) ? values : [];
  bars.forEach((bar, index) => {
    const level = clamp01(next[index] ?? 0);
    const scale = 0.15 + level * 0.85;
    const opacity = 0.5 + level * 0.5;
    bar.style.transform = `scaleY(${scale.toFixed(3)})`;
    bar.style.opacity = opacity.toFixed(3);
  });
}

function formatTimer(ms) {
  const totalSeconds = Math.floor((ms || 0) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function playPhaseShift() {
  pill.classList.remove("pill--shift");
  void pill.offsetWidth;
  pill.classList.add("pill--shift");
}

let lastPhase = pill.dataset.phase ?? "idle";

function render(payload) {
  const phase = payload?.phase ?? "idle";
  const dictationMode = payload?.dictationMode ?? "dictation";

  if (phase !== lastPhase && lastPhase !== "idle" && phase !== "idle") {
    playPhaseShift();
  }
  lastPhase = phase;

  pill.dataset.phase = phase;
  text.textContent =
    phase === "saved"
      ? payload?.label ?? "Saved"
      : phase === "recording" && dictationMode === "edit"
        ? "Editing"
        : LABELS[phase] ?? LABELS.recording;

  pill.classList.toggle("light", !!payload?.lightMode);

  if (timerEl) {
    timerEl.hidden = phase !== "recording";
    timerEl.textContent =
      phase === "recording" && typeof payload?.elapsedMs === "number"
        ? formatTimer(payload.elapsedMs)
        : "";
  }

  if (phase === "recording") {
    renderBars(payload?.bars);
  } else {
    // Transcribing / editing / thinking waveforms are CSS-driven — clear inline levels.
    bars.forEach((bar) => {
      bar.style.transform = "";
      bar.style.opacity = "";
    });
  }
}

window.indicator.onStatus((payload) => render(payload));

// Replay the entrance animation each time the pill window becomes visible.
let wasVisible = document.visibilityState === "visible";
function playEntrance() {
  pill.classList.remove("pill--in");
  void pill.offsetWidth;
  pill.classList.add("pill--in");
}
document.addEventListener("visibilitychange", () => {
  const visible = document.visibilityState === "visible";
  if (visible && !wasVisible) playEntrance();
  wasVisible = visible;
});
if (wasVisible) playEntrance();
