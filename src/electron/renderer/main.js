import {
  wizardCloudAudioFieldInput,
  wizardCloudAuthHeaderInput,
  wizardCloudAuthValueInput,
  wizardCloudBodyFormatSelect,
  wizardCloudExtraFormFieldsInput,
  wizardCloudModelInput,
  wizardCloudQueryParamsInput,
  wizardCloudTextFieldHintsInput,
  wizardCloudUrlInput,
  wizardEditingCloudWarning,
  wizardEditingEndpointInput,
  wizardEditingLlmFields,
  wizardEditingProviderSelect,
  wizardEngineSelect,
  wizardLocalFieldsCppOnly,
  wizardLocalFieldsFwOnly,
  wizardLocalModelHint,
  wizardLocalModelInput,
  wizardLocalModelPresetSelect,
  wizardModeLocalBtn,
  wizardWhisperCppGpuCheck
} from "./dom.js";
import { state } from "./state.js";
import {
  cloudLanguageToSetting,
  localLanguageToSetting,
  isLocalEditEndpoint,
  parseHints,
  parseLocalLanguageConfig,
  parseKeyValuePairs,
  populateLanguageSelect,
  serializeKeyValuePairs
} from "./utils.js";
import {
  WIZARD_DRAFT_STORAGE_KEY,
  WIZARD_LOCAL_MODEL_PROFILES,
  wizardState
} from "./wizard/state.js";
import {
  clampWizardStep,
  renderWizardCloudAdvanced,
  renderWizardModeView,
  renderWizardPrefsAdvanced,
  renderWizardStepView,
  resetDepChecklist,
  setWizardCloudStatus,
  setWizardEditingStatus,
  setWizardPermStatus,
  setWizardStatus
} from "./wizard/render.js";
import { createWizardPermissionsController } from "./wizard/permissions.js";
import { createWizardRuntimeController } from "./wizard/runtime.js";
import { createWizardDraftController } from "./wizard/draft.js";
import { createWizardFlowController } from "./wizard/flow.js";
import {
  cloudApiKeysFromConfig,
  cloneCloudFromPreset,
  applyTheme,
  closeApiKeyModal,
  fillCloudPresetOptions,
  flash,
  openApiKeyModal,
  openSettings,
  rebuildPresetOptions,
  renderMode,
  renderSettings,
  renderSettingsTab,
  saveApiKey,
  scheduleAutoSave,
  setLocalPreset
} from "./settings-panel.js";
import { renderRecentTranscripts, renderStatus } from "./status-view.js";
import { bindRendererEvents } from "./bindings.js";
import { initializeRenderer } from "./init.js";
import { initAnimations } from "./animations.js";

function wizardProfileForModel(model) {
  const normalized = (model || "").trim().toLowerCase();
  if (normalized === "tiny") return "fast";
  if (normalized === "small") return "balanced";
  if (normalized === "medium") return "quality";
  if (normalized === "large-v3") return "best";
  return "custom";
}

function applyWizardLocalModelProfile(profile) {
  const select = wizardLocalModelPresetSelect;

  // Drop any model option we injected previously so the preset list stays tidy
  // across repeated calls (e.g. reopening the wizard with a different model).
  Array.from(select.options)
    .filter((opt) => opt.dataset.injected === "1")
    .forEach((opt) => opt.remove());

  // Known size preset: apply it and write the matching model name.
  if (Object.hasOwn(WIZARD_LOCAL_MODEL_PROFILES, profile) && profile !== "custom") {
    const config = WIZARD_LOCAL_MODEL_PROFILES[profile];
    select.value = profile;
    wizardLocalModelHint.textContent = config.hint;
    wizardLocalModelInput.value = config.model;
    return;
  }

  // Unknown/custom model (typically chosen in the Settings panel). Preserve the
  // actual model value instead of silently resetting it, and reflect it in the
  // dropdown by injecting it as a selected option.
  const model = wizardLocalModelInput.value.trim();
  if (!model) {
    const config = WIZARD_LOCAL_MODEL_PROFILES.balanced;
    select.value = "balanced";
    wizardLocalModelHint.textContent = config.hint;
    wizardLocalModelInput.value = config.model;
    return;
  }

  const option = document.createElement("option");
  option.value = model;
  option.dataset.injected = "1";
  option.textContent = `${model} (custom)`;
  select.appendChild(option);
  select.value = model;
  wizardLocalModelHint.textContent = "Custom model — kept as configured, outside the size presets.";
}

function wizardEngineValue() {
  return wizardEngineSelect && wizardEngineSelect.value === "whisper-cpp"
    ? "whisper-cpp"
    : "faster-whisper";
}

function syncWizardEngineFields() {
  const isCpp = wizardEngineValue() === "whisper-cpp";
  wizardLocalFieldsCppOnly.forEach((el) => el.classList.toggle("hidden", !isCpp));
  wizardLocalFieldsFwOnly.forEach((el) => el.classList.toggle("hidden", isCpp));
}

function wizardLocalModelValue() {
  const profile = wizardLocalModelPresetSelect.value;
  if (profile === "custom") {
    return wizardLocalModelInput.value.trim();
  }

  const config = WIZARD_LOCAL_MODEL_PROFILES[profile];
  if (config && config.model) {
    return config.model;
  }

  return wizardLocalModelInput.value.trim();
}

const {
  clearWizardDraft,
  persistWizardDraft,
  restoreWizardDraft
} = createWizardDraftController({
  applyWizardLocalModelProfile,
  WIZARD_DRAFT_STORAGE_KEY,
  WIZARD_LOCAL_MODEL_PROFILES,
  clampWizardStep,
  parseLocalLanguageConfig,
  populateLanguageSelect,
  renderWizardCloudAdvanced,
  renderWizardMode,
  state,
  wizardMode,
  wizardState
});

function fillWizardCloudAdvancedFields(cloud) {
  wizardCloudUrlInput.value = cloud?.url || "";
  wizardCloudAuthHeaderInput.value = cloud?.authHeader || "";
  wizardCloudAuthValueInput.value = cloud?.authValueTemplate || "";
  wizardCloudBodyFormatSelect.value = cloud?.bodyFormat === "binary" ? "binary" : "formdata";
  wizardCloudAudioFieldInput.value = cloud?.audioFieldName || "";
  wizardCloudQueryParamsInput.value = serializeKeyValuePairs(cloud?.queryParams);
  wizardCloudExtraFormFieldsInput.value = serializeKeyValuePairs(cloud?.extraFormFields);
  wizardCloudTextFieldHintsInput.value = (cloud?.textFieldHints || []).join(", ");
}

function syncWizardEditingFields() {
  if (!wizardEditingProviderSelect) return;
  const isLlm = wizardEditingProviderSelect.value === "openai-compatible";
  if (wizardEditingLlmFields) wizardEditingLlmFields.style.display = isLlm ? "" : "none";

  const endpoint = wizardEditingEndpointInput?.value || "";
  const showWarning = isLlm && endpoint.trim().length > 0 && !isLocalEditEndpoint(endpoint);
  if (wizardEditingCloudWarning) {
    wizardEditingCloudWarning.style.display = showWarning ? "" : "none";
  }
}

function renderWizardStep(step) {
  renderWizardStepView(step);

  if (wizardState.step === 2 && wizardMode() === "local" && !wizardState.busy) {
    void probeWizardRuntime();
  }

  if (wizardState.step === 3 && isMacOS()) {
    void checkWizardPermissions({ probeFnListener: true });
    startPermissionPolling();
  } else {
    stopPermissionPolling();
  }

  persistWizardDraft();
}

const {
  checkWizardPermissions,
  openAccessibilityFromWizard,
  openInputMonitoringFromWizard: openInputMonitoringFromWizardController,
  refreshWizardPermissionState,
  requestMicrophonePermission
} = createWizardPermissionsController({
  isMacOS,
  renderStatus,
  state
});

let permissionPollHandle = null;
const PERMISSION_POLL_INTERVAL_MS = 2500;

function startPermissionPolling() {
  if (permissionPollHandle !== null) {
    return;
  }
  permissionPollHandle = window.setInterval(() => {
    if (wizardState.step !== 3) {
      stopPermissionPolling();
      return;
    }
    // probeFnListener: false — don't kill/respawn keyspy on every tick.
    // Restarting the IOHIDManager client every 2.5 s causes macOS to briefly
    // interrupt input focus. The listener is probed (probeFnListener: true) only
    // once on step entry and on explicit "Refresh status" clicks.
    void checkWizardPermissions({ probeFnListener: false });
  }, PERMISSION_POLL_INTERVAL_MS);
}

function stopPermissionPolling() {
  if (permissionPollHandle !== null) {
    window.clearInterval(permissionPollHandle);
    permissionPollHandle = null;
  }
}

function openInputMonitoringFromWizard() {
  return openInputMonitoringFromWizardController(() => {
    persistWizardDraft();
  });
}

function wizardMode() {
  return wizardModeLocalBtn.classList.contains("active") ? "local" : "cloud";
}

function isMacOS() {
  return /mac/i.test(navigator.platform || "");
}

function isFnHotkeyPreferred(settings) {
  return settings?.hotkey?.preferred === "Fn+Space";
}

function renderWizardMode(mode) {
  renderWizardModeView(mode);
  syncWizardEngineFields();
  persistWizardDraft();
}

const {
  prepareWizardLocalModel,
  prepareWizardWhisperCpp,
  probeWizardRuntime,
  runSaveLocalChecks,
  testWizardLocalSetup
} = createWizardRuntimeController({
  isFnHotkeyPreferred,
  isMacOS,
  persistWizardDraft,
  renderWizardMode,
  renderWizardStep,
  state,
  wizardEngineValue,
  wizardLocalModelValue,
  wizardWhisperCppGpuCheck,
  wizardMode
});

const {
  openSetupWizard,
  resetOnboardingFlow,
  saveSetupWizard,
  skipSetupWizard
} = createWizardFlowController({
  applyWizardLocalModelProfile,
  clearWizardDraft,
  cloudApiKeysFromConfig,
  cloneCloudFromPreset,
  fillCloudPresetOptions,
  fillWizardCloudAdvancedFields,
  flash,
  cloudLanguageToSetting,
  localLanguageToSetting,
  parseLocalLanguageConfig,
  populateLanguageSelect,
  parseHints,
  parseKeyValuePairs,
  prepareWizardLocalModel,
  prepareWizardWhisperCpp,
  renderSettings,
  renderStatus,
  renderWizardCloudAdvanced,
  renderWizardMode,
  wizardEngineValue,
  renderWizardStep,
  resetDepChecklist,
  restoreWizardDraft,
  runSaveLocalChecks,
  setWizardCloudStatus,
  setWizardEditingStatus,
  setWizardPermStatus,
  setWizardStatus,
  state,
  stopPermissionPolling,
  userFacingErrorMessage: (error) => {
    const raw = error instanceof Error ? error.message : String(error);
    const ipcPrefixMatch = raw.match(/^Error invoking remote method '[^']+':\s*/);
    if (!ipcPrefixMatch) {
      return raw;
    }
    return raw.slice(ipcPrefixMatch[0].length).trim();
  },
  wizardMode,
  wizardLocalModelValue,
  wizardProfileForModel,
  isLocalEditEndpoint,
  syncWizardEditingFields,
  wizardState
});

bindRendererEvents({
  applyTheme,
  applyWizardLocalModelProfile,
  cloneCloudFromPreset,
  fillWizardCloudAdvancedFields,
  flash,
  openAccessibilityFromWizard,
  openInputMonitoringFromWizard,
  openSettings,
  openSetupWizard,
  openApiKeyModal,
  closeApiKeyModal,
  persistWizardDraft,
  prepareWizardLocalModel,
  prepareWizardWhisperCpp,
  probeWizardRuntime,
  refreshWizardPermissionState,
  renderMode,
  renderSettings,
  renderSettingsTab,
  renderStatus,
  renderWizardCloudAdvanced,
  renderWizardMode,
  renderWizardPrefsAdvanced,
  renderWizardStep,
  requestMicrophonePermission,
  resetOnboardingFlow,
  saveApiKey,
  saveSetupWizard,
  scheduleAutoSave,
  setLocalPreset,
  setWizardCloudStatus,
  setWizardPermStatus,
  setWizardStatus,
  skipSetupWizard,
  syncWizardEditingFields,
  syncWizardEngineFields,
  testWizardLocalSetup,
  wizardMode
});

// Sidebar navigation routing
const sidebarNav = document.getElementById("sidebarNav");
if (sidebarNav) {
  sidebarNav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view]");
    if (!btn) return;
    const target = btn.dataset.view;
    for (const item of sidebarNav.querySelectorAll(".sidebar-item")) {
      item.classList.toggle("active", item === btn);
    }
    for (const view of document.querySelectorAll(".view")) {
      view.classList.toggle("active", view.id === `view${target.charAt(0).toUpperCase()}${target.slice(1)}`);
    }
    if (window.tapTalk?.resizeForView) {
      void window.tapTalk.resizeForView(target);
    }
  });
}

void initializeRenderer({
  openSetupWizard,
  rebuildPresetOptions,
  renderRecentTranscripts,
  renderSettings,
  renderStatus,
  renderWizardStep,
  setWizardPermStatus,
  wizardMode
});

initAnimations();
