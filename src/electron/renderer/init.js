import { state } from "./state.js";
import { setDepStatus, setWizardStatus } from "./wizard/render.js";
import { wizardDepPython, wizardDepWhisper } from "./wizard/dom.js";
import { welcomeModal } from "./dom.js";
import { wizardState } from "./wizard/state.js";

const WIZARD_DRAFT_STORAGE_KEY_LOCAL = "taptalk:wizard-draft";

function readDraftActiveFlag() {
  try {
    const raw = window.localStorage.getItem(WIZARD_DRAFT_STORAGE_KEY_LOCAL);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed && parsed.wizardActive === true;
  } catch {
    return false;
  }
}

function showWelcomeModal() {
  void window.tapTalk?.resizeForView?.("wizard");
  if (welcomeModal) welcomeModal.classList.remove("hidden");
}

export function initializeRenderer({
  openSetupWizard,
  rebuildPresetOptions,
  renderRecentTranscripts,
  renderSettings,
  renderStatus,
  renderWizardStep,
  setWizardPermStatus,
  wizardMode
}) {
  renderRecentTranscripts([]);

  window.tapTalk.onStatus((payload) => renderStatus(payload));
  window.tapTalk.onSetupProgress((msg) => {
    if (wizardState.step === 2 && wizardMode() === "local") {
      setWizardStatus(msg);
      const lower = msg.toLowerCase();
      if (
        lower.includes("model") ||
        lower.includes("faster-whisper") ||
        lower.includes("pip") ||
        lower.includes("venv")
      ) {
        setDepStatus(wizardDepWhisper, "working", msg);
      } else if (lower.includes("python") || lower.includes("extracting")) {
        setDepStatus(wizardDepPython, "working", msg);
      }
    }
  });

  return Promise.all([
    window.tapTalk.getSettings(),
    window.tapTalk.getStatus(),
    window.tapTalk.getCloudPresets()
  ])
    .then(([settings, status, presets]) => {
      state.presets = presets || {};
      rebuildPresetOptions();
      renderSettings(settings);
      renderStatus(status);
      if (settings.onboardingCompleted) {
        const fnPreferred = settings?.hotkey?.preferred === "Fn+Space";
        const fnNeedsPermission = status?.fnPermissionRequired === true;
        const wasWizardActive = readDraftActiveFlag();
        if (wasWizardActive) {
          openSetupWizard({ resumeDraft: true, required: false });
          setWizardPermStatus(
            "Welcome back. Your wizard progress is restored — continue where you left off."
          );
        } else if (fnPreferred && fnNeedsPermission) {
          openSetupWizard({ resumeDraft: true, required: false });
          renderWizardStep(3);
          setWizardPermStatus(
            "Fn permissions appear incomplete. Complete this step to restore Fn hotkey."
          );
        }
      } else if (settings.welcomeShown !== true && !readDraftActiveFlag()) {
        showWelcomeModal();
      } else {
        openSetupWizard({ resumeDraft: true, required: true });
      }
    })
    .catch((error) => {
      renderStatus({
        phase: "idle",
        dictationMode: "dictation",
        provider: "-",
        message: "Init failed",
        hotkeyPreferred: "-",
        hotkeyActive: "-",
        fnPermissionRequired: false,
        recentTranscripts: [],
        error: String(error)
      });
    });
}
