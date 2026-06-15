import * as dom from "./dom.js";
import { wizardState, WIZARD_STEP_COUNT } from "./state.js";

export function setDepStatus(el, status, text) {
  if (!el) return;
  const icon = el.querySelector(".wizard-dep-icon");
  const statusEl = el.querySelector(".wizard-dep-status");
  if (icon) {
    icon.className = "wizard-dep-icon " + status;
    if (status === "ok") icon.textContent = "\u2713";
    else if (status === "fail") icon.textContent = "\u2717";
    else icon.textContent = "\u25CF";
  }
  if (statusEl) {
    statusEl.textContent = text;
  }
}

export function resetDepChecklist() {
  setDepStatus(dom.wizardDepWhisperCpp, "pending", "Waiting...");
  setDepStatus(dom.wizardDepPython, "pending", "Waiting...");
  setDepStatus(dom.wizardDepFfmpeg, "pending", "Waiting...");
  setDepStatus(dom.wizardDepWhisper, "pending", "Waiting...");
  setDepStatus(dom.wizardDepModel, "pending", "Waiting...");
}

export function setWizardStatus(text, tone = "") {
  dom.wizardPrepareText.textContent = text;
  dom.wizardPrepareStatus.classList.toggle("success", tone === "success");
  dom.wizardPrepareStatus.classList.toggle("error", tone === "error");
  const showSpinner = text && !tone;
  dom.wizardPrepareSpinner.classList.toggle("hidden", !showSpinner);
}

export function setWizardCloudStatus(text, tone = "") {
  dom.wizardCloudStatus.textContent = text;
  dom.wizardCloudStatus.classList.toggle("success", tone === "success");
  dom.wizardCloudStatus.classList.toggle("error", tone === "error");
}

export function setWizardPermStatus(text, tone = "") {
  if (!dom.wizardPermStatus) return;
  dom.wizardPermStatus.textContent = text;
  dom.wizardPermStatus.classList.toggle("success", tone === "success");
  dom.wizardPermStatus.classList.toggle("error", tone === "error");
}

export function setWizardEditingStatus(text, tone = "") {
  if (!dom.wizardEditingStatus) return;
  dom.wizardEditingStatus.textContent = text;
  dom.wizardEditingStatus.classList.toggle("success", tone === "success");
  dom.wizardEditingStatus.classList.toggle("error", tone === "error");
}

export function setWizardBusy(isBusy) {
  wizardState.busy = isBusy;
  const buttons = [
    dom.wizardSaveBtn,
    dom.wizardNextBtn,
    dom.wizardBackBtn,
    dom.wizardSkipBtn,
    dom.wizardPrepareLocalBtn,
    dom.wizardTestLocalBtn,
    dom.wizardCloudAdvancedToggleBtn,
    dom.wizardCloudApiKeyPeekBtn,
    dom.wizardEditingEnabledCheck,
    dom.wizardEditingProviderSelect,
    dom.wizardEditingEndpointInput,
    dom.wizardEditingModelInput,
    dom.wizardEditingApiKeyInput,
    dom.wizardPermMicrophoneBtn,
    dom.wizardPermAccessibilityBtn,
    dom.wizardPermInputMonitoringBtn,
    dom.wizardPermRefreshBtn
  ];
  for (const btn of buttons) {
    if (btn) btn.disabled = isBusy;
  }
}

export function clampWizardStep(value) {
  if (value <= 1) return 1;
  if (value >= WIZARD_STEP_COUNT) return WIZARD_STEP_COUNT;
  return value;
}

export function renderWizardCloudAdvanced() {
  const forcedOpen = dom.wizardCloudPresetSelect.value === "custom";
  const open = forcedOpen || wizardState.cloudAdvancedOpen;
  dom.wizardCloudAdvancedFields.classList.toggle("hidden", !open);
  dom.wizardCloudAdvancedToggleBtn.classList.toggle("hidden", forcedOpen);
  dom.wizardCloudAdvancedToggleBtn.textContent = open
    ? "Hide advanced options"
    : "Show advanced options";
}

export function renderWizardPrefsAdvanced() {
  if (!dom.wizardPrefsAdvancedFields || !dom.wizardPrefsAdvancedToggleBtn) return;
  const open = wizardState.prefsAdvancedOpen;
  dom.wizardPrefsAdvancedFields.classList.toggle("hidden", !open);
  dom.wizardPrefsAdvancedToggleBtn.textContent = open
    ? "Hide advanced options"
    : "Show advanced options";
}

export function renderWizardModeView(mode) {
  dom.wizardModeLocalBtn.classList.toggle("active", mode === "local");
  dom.wizardModeCloudBtn.classList.toggle("active", mode === "cloud");
  dom.wizardLocalFields.classList.toggle("hidden", mode !== "local");
  dom.wizardCloudFields.classList.toggle("hidden", mode !== "cloud");
  if (mode !== "local") {
    setWizardStatus("");
    resetDepChecklist();
  }
  if (mode !== "cloud") {
    setWizardCloudStatus("");
  }
}

const STEP_TITLES = [
  ["Choose Your Mode",        "Select how TapTalk should process your voice"],
  ["Set Up AI Engine",        "Configure your transcription engine"],
  ["Grant Permissions",       "Allow TapTalk to record audio and listen for hotkeys"],
  ["Set Your Preferences",    "Almost done — pick your language and paste settings"],
];

const wizardDots = () => document.querySelectorAll(".wz-dot");

export function renderWizardStepView(step) {
  wizardState.step = clampWizardStep(step);
  wizardState.maxStepReached = Math.max(
    wizardState.maxStepReached || 1,
    wizardState.step
  );

  dom.wizardStepMode.classList.toggle("hidden", wizardState.step !== 1);
  dom.wizardStepEngine.classList.toggle("hidden", wizardState.step !== 2);
  dom.wizardStepPermissions.classList.toggle("hidden", wizardState.step !== 3);
  dom.wizardStepPreferences.classList.toggle("hidden", wizardState.step !== 4);

  if (dom.wizardLanguageIncludeEnglishRow) {
    const isCpp = dom.wizardEngineSelect?.value === "whisper-cpp";
    dom.wizardLanguageIncludeEnglishRow.classList.toggle("hidden", isCpp);
  }

  const chips = [
    dom.wizardStepChip1,
    dom.wizardStepChip2,
    dom.wizardStepChip3,
    dom.wizardStepChip4
  ];
  chips.forEach((chip, index) => {
    const chipStep = index + 1;
    if (!chip) return;
    chip.classList.toggle("active", chipStep === wizardState.step);
    chip.classList.toggle("done", chipStep < wizardState.step);
    // Only steps the user has already reached are clickable in the sidebar.
    const visited = chipStep <= wizardState.maxStepReached;
    chip.setAttribute("aria-disabled", visited ? "false" : "true");
  });

  wizardDots().forEach((dot, index) => {
    const dotStep = index + 1;
    dot.classList.toggle("active", dotStep === wizardState.step);
    dot.classList.toggle("done", dotStep < wizardState.step);
  });

  dom.wizardStepLabel.textContent = `Step ${wizardState.step} of ${WIZARD_STEP_COUNT}`;
  dom.wizardBackBtn.classList.toggle("hidden", wizardState.step === 1);
  dom.wizardNextBtn.classList.toggle("hidden", wizardState.step === WIZARD_STEP_COUNT);
  dom.wizardSaveBtn.classList.toggle("hidden", wizardState.step !== WIZARD_STEP_COUNT);

  const [title, subtitle] = STEP_TITLES[wizardState.step - 1] ?? ["", ""];
  if (dom.wizardStepTitle) dom.wizardStepTitle.textContent = title;
  if (dom.wizardStepSubtitle) dom.wizardStepSubtitle.textContent = subtitle;

  renderWizardPrefsAdvanced();
}
