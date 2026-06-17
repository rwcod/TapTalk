import {
  welcomeGetStartedBtn,
  welcomeModal,
  welcomeSkipBtn,
  wizardCloudAudioFieldInput,
  wizardCloudAuthHeaderInput,
  wizardCloudAuthValueInput,
  wizardCloudBodyFormatSelect,
  wizardCloudExtraFormFieldsInput,
  wizardCloudQueryParamsInput,
  wizardCloudTextFieldHintsInput,
  wizardCloudUrlInput
} from "./dom.js";
import {
  setupWizard,
  wizardBackBtn,
  wizardCloudAdvancedToggleBtn,
  wizardCloudApiKeyInput,
  wizardCloudApiKeyPeekBtn,
  wizardCloudModelInput,
  wizardCloudPresetSelect,
  wizardEditingApiKeyInput,
  wizardEditingCloudWarning,
  wizardEditingEnabledCheck,
  wizardEditingEndpointInput,
  wizardEditingLlmFields,
  wizardEditingModelInput,
  wizardEditingProviderSelect,
  wizardEngineSelect,
  wizardWhisperCppGpuCheck,
  wizardLocalFieldsCppOnly,
  wizardLocalFieldsFwOnly,
  wizardInstallPackageCheck,
  wizardLocalModelHint,
  wizardLocalModelInput,
  wizardLocalModelPresetSelect,
  wizardModeCloudBtn,
  wizardModeLocalBtn,
  wizardNextBtn,
  wizardPermAccessibilityBtn,
  wizardPermInputMonitoringBtn,
  wizardPermMicrophoneBtn,
  wizardPermRefreshBtn,
  wizardPrefsAdvancedToggleBtn,
  wizardPrepareLocalBtn,
  wizardPrepareOnSaveCheck,
  wizardPythonPathInput,
  wizardSaveBtn,
  wizardSkipBtn,
  wizardTestLocalBtn
} from "./wizard/dom.js";
import { state } from "./state.js";
import { mountTaptalkGlyphs } from "./taptalk-glyph.js";
import {
  cloudLanguageToSetting,
  localLanguageToSetting,
  parseHints,
  parseLocalLanguageConfig,
  parseKeyValuePairs,
  populateLanguageSelect,
  serializeKeyValuePairs,
  isLocalEditEndpoint,
  userFacingErrorMessage
} from "./utils.js";
import {
  WIZARD_DRAFT_STORAGE_KEY,
  WIZARD_LOCAL_MODEL_PROFILES,
  wizardState
} from "./wizard/state.js";
import { applyTheme } from "./settings-panel.js";
import {
  clampWizardStep,
  renderWizardCloudAdvanced,
  renderWizardModeView,
  renderWizardPrefsAdvanced,
  renderWizardStepView,
  resetDepChecklist,
  setDepStatus,
  setWizardCloudStatus,
  setWizardEditingStatus,
  setWizardPermStatus,
  setWizardStatus
} from "./wizard/render.js";
import { createWizardPermissionsController } from "./wizard/permissions.js";
import { createWizardRuntimeController } from "./wizard/runtime.js";
import { createWizardDraftController } from "./wizard/draft.js";
import { createWizardFlowController } from "./wizard/flow.js";

// Wizard-window-only stubs for helpers normally provided by main-window modules.
// The wizard window does not own a transcript box, settings panel, or save
// toast, so those touchpoints become no-ops or local fallbacks.

function noopRenderSettings(settings) {
  state.settings = settings;
}

function noopRenderStatus(status) {
  state.status = status;
}

function noopFlash() {
  // Wizard window has no save toast; nothing to flash.
}

function parseCloudApiKeys(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.entries(value).reduce((acc, [rawKey, rawValue]) => {
    const key = rawKey.trim();
    if (
      !key ||
      key === "__proto__" ||
      key === "prototype" ||
      key === "constructor" ||
      typeof rawValue !== "string"
    ) {
      return acc;
    }
    acc[key] = rawValue.trim();
    return acc;
  }, Object.create(null));
}

function cloudApiKeysFromConfig(config) {
  const apiKeys = parseCloudApiKeys(config?.apiKeys);
  const preset = typeof config?.preset === "string" ? config.preset : "";
  const activeKey = typeof config?.apiKey === "string" ? config.apiKey.trim() : "";
  if (preset && activeKey) {
    apiKeys[preset] = activeKey;
  }
  return apiKeys;
}

function cloneCloudFromPreset(presetName, keepApiKey, current, sourcePreset = current.preset) {
  const apiKeys = cloudApiKeysFromConfig(current);
  const normalizedKey = typeof keepApiKey === "string" ? keepApiKey.trim() : "";
  const sourcePresetName = typeof sourcePreset === "string" ? sourcePreset : "";

  if (sourcePresetName) {
    if (normalizedKey) {
      apiKeys[sourcePresetName] = normalizedKey;
    } else if (
      !apiKeys[sourcePresetName] &&
      typeof current.apiKey === "string" &&
      current.apiKey.trim()
    ) {
      apiKeys[sourcePresetName] = current.apiKey.trim();
    }
  }

  const targetApiKey = apiKeys[presetName] || "";
  const source = state.presets[presetName];
  if (!source) {
    return {
      ...current,
      preset: presetName,
      apiKey: targetApiKey,
      apiKeys
    };
  }

  return {
    preset: presetName,
    apiKey: targetApiKey,
    apiKeys,
    url: source.url,
    authHeader: source.authHeader,
    authValueTemplate: source.authValueTemplate,
    bodyFormat: source.bodyFormat,
    audioFieldName: source.audioFieldName,
    model: source.model,
    language: source.language,
    extraFormFields: { ...source.extraFormFields },
    queryParams: { ...source.queryParams },
    textFieldHints: [...source.textFieldHints]
  };
}

function presetLabel(name) {
  const source = state.presets[name];
  if (source?.label) {
    return source.label;
  }
  return name;
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function fillCloudPresetOptions(select, current) {
  const presets = Object.keys(state.presets);
  clearChildren(select);

  if (presets.length === 0) {
    ["openai", "groq", "elevenlabs", "deepgram", "huggingface", "deapi", "custom"].forEach(
      (name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }
    );
  } else {
    presets.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = presetLabel(name);
      select.appendChild(opt);
    });
  }

  select.value = current;
}

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

function wizardEditingFromInputs() {
  return {
    enabled: wizardEditingEnabledCheck ? wizardEditingEnabledCheck.checked : true,
    provider: wizardEditingProviderSelect ? wizardEditingProviderSelect.value : "rule-based",
    endpoint: wizardEditingEndpointInput ? wizardEditingEndpointInput.value.trim() : "",
    model: wizardEditingModelInput ? wizardEditingModelInput.value.trim() : "",
    apiKey: wizardEditingApiKeyInput ? wizardEditingApiKeyInput.value.trim() : ""
  };
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
  syncWizardEditingFields,
  state,
  wizardMode,
  wizardState
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
    void checkWizardPermissions({ probeFnListener: true });
  }, PERMISSION_POLL_INTERVAL_MS);
}

function stopPermissionPolling() {
  if (permissionPollHandle !== null) {
    window.clearInterval(permissionPollHandle);
    permissionPollHandle = null;
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

// When every required permission is granted, glide the user forward instead of
// making them hunt for "Next". Fires at most once per wizard session so a user
// who steps Back to review permissions isn't yanked away again.
function handlePermissionsAllGranted() {
  if (wizardState.permAutoAdvanced) return;
  if (wizardState.step !== 3) return;
  wizardState.permAutoAdvanced = true;
  window.setTimeout(() => {
    if (wizardState.step === 3) {
      renderWizardStep(4);
    }
  }, 900);
}

const {
  checkWizardPermissions,
  openAccessibilityFromWizard,
  openInputMonitoringFromWizard: openInputMonitoringFromWizardController,
  refreshWizardPermissionState,
  requestMicrophonePermission
} = createWizardPermissionsController({
  isMacOS,
  renderStatus: noopRenderStatus,
  state,
  onAllRequiredGranted: handlePermissionsAllGranted
});

function openInputMonitoringFromWizard() {
  return openInputMonitoringFromWizardController(() => {
    persistWizardDraft();
  });
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
  wizardLocalModelValue,
  wizardEngineValue,
  wizardWhisperCppGpuCheck,
  wizardMode
});

const {
  openSetupWizard: openSetupWizardController,
  saveSetupWizard: saveSetupWizardBase,
  skipSetupWizard: skipSetupWizardBase
} = createWizardFlowController({
  applyWizardLocalModelProfile,
  clearWizardDraft,
  cloudApiKeysFromConfig,
  cloneCloudFromPreset,
  fillCloudPresetOptions,
  fillWizardCloudAdvancedFields,
  flash: noopFlash,
  cloudLanguageToSetting,
  localLanguageToSetting,
  parseLocalLanguageConfig,
  populateLanguageSelect,
  parseHints,
  parseKeyValuePairs,
  prepareWizardLocalModel,
  prepareWizardWhisperCpp,
  wizardEngineValue,
  wizardWhisperCppGpuCheck,
  renderSettings: noopRenderSettings,
  renderStatus: noopRenderStatus,
  renderWizardCloudAdvanced,
  renderWizardMode,
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
  userFacingErrorMessage,
  wizardMode,
  wizardLocalModelValue,
  wizardProfileForModel,
  isLocalEditEndpoint,
  syncWizardEditingFields,
  wizardState
});

function openSetupWizard(options = {}) {
  openSetupWizardController(options);
}

async function notifyWizardCompletedAndClose() {
  try {
    await window.tapTalk.notifyWizardCompleted();
  } catch (error) {
    console.error("Failed to notify wizard completion:", error);
  }
}

async function collectSaveBlockers() {
  const blockers = [];
  const mode = wizardMode();

  if (mode === "local" && wizardEngineValue() === "whisper-cpp") {
    const modelName =
      wizardLocalModelValue() || state.settings?.localWhisperCpp?.model || "small";
    try {
      const probe = await window.tapTalk.probeWhisperCpp(modelName);
      if (!probe.ffmpegOk) {
        blockers.push({ step: 2, message: "ffmpeg is missing. Install it with: brew install ffmpeg" });
      }
      if (!probe.binaryOk) {
        blockers.push({
          step: 2,
          message: "whisper.cpp engine not found. Rebuild the app with `npm run build`."
        });
      }
      const downloadRequested = wizardPrepareOnSaveCheck?.checked === true;
      if (probe.binaryOk && probe.hasModel === false && !downloadRequested) {
        blockers.push({
          step: 2,
          message: `Model "${modelName}" is not downloaded yet. Tick "Download model on Save" or click "Install + download model now".`
        });
      }
    } catch (err) {
      blockers.push({
        step: 2,
        message:
          "Couldn't verify whisper.cpp runtime: " +
          (err instanceof Error ? err.message : String(err))
      });
    }
  } else if (mode === "local") {
    const pythonPath =
      wizardPythonPathInput.value.trim() ||
      state.settings?.localFasterWhisper?.pythonPath ||
      "python3";
    const modelName =
      wizardLocalModelValue() || state.settings?.localFasterWhisper?.model || "small";
    try {
      const probe = await window.tapTalk.probeLocalRuntime(pythonPath, modelName);
      if (!probe.ffmpegOk) {
        blockers.push({ step: 2, message: "ffmpeg is missing. Install it with: brew install ffmpeg" });
      }
      if (!probe.pythonOk) {
        blockers.push({ step: 2, message: "Python 3 is missing. Use the auto-install or set a valid path." });
      }
      if (probe.pythonOk && !probe.fasterWhisperOk) {
        blockers.push({
          step: 2,
          message:
            "faster-whisper is not installed. Tick \"Install / upgrade faster-whisper package on Save\" and try again."
        });
      }
      const downloadRequested = wizardPrepareOnSaveCheck?.checked === true;
      if (probe.fasterWhisperOk && probe.hasModel === false && !downloadRequested) {
        blockers.push({
          step: 2,
          message: `Model "${modelName}" is not downloaded yet. Tick "Download Whisper model on Save" or click "Install + download model now".`
        });
      }
    } catch (err) {
      blockers.push({
        step: 2,
        message:
          "Couldn't verify local runtime: " +
          (err instanceof Error ? err.message : String(err))
      });
    }
  } else if (mode === "cloud") {
    const apiKey = wizardCloudApiKeyInput.value.trim();
    if (!apiKey) {
      blockers.push({ step: 2, message: "Cloud API key is required before saving." });
    }
  }

  const editing = wizardEditingFromInputs();
  if (editing.enabled && editing.provider === "openai-compatible") {
    if (!editing.endpoint) {
      blockers.push({ step: 4, target: "editing", message: "Set an edit endpoint before saving." });
    } else if (!editing.model) {
      blockers.push({ step: 4, target: "editing", message: "Set an edit model before saving." });
    } else if (!isLocalEditEndpoint(editing.endpoint) && !editing.apiKey) {
      blockers.push({ step: 4, target: "editing", message: "Remote edit endpoints require an API key." });
    }
  }

  if (isMacOS()) {
    try {
      const perms = await window.tapTalk.checkPermissions({ probeFnListener: false });
      if (perms.microphone !== "granted") {
        blockers.push({
          step: 3,
          message: "Microphone permission is required — grant it before saving."
        });
      }
      const fnPreferred = state.settings?.hotkey?.preferred === "Fn+Space";
      if (fnPreferred && !perms.accessibility) {
        blockers.push({
          step: 3,
          message:
            "Accessibility permission is required for the Fn hotkey. Grant it, or change the hotkey later in Settings."
        });
      }
    } catch (err) {
      blockers.push({
        step: 3,
        message:
          "Couldn't read macOS permissions: " +
          (err instanceof Error ? err.message : String(err))
      });
    }
  }

  return blockers;
}

async function saveSetupWizard() {
  const blockers = await collectSaveBlockers();
  if (blockers.length > 0) {
    const first = blockers[0];
    renderWizardStep(first.step);
    if (first.step === 3) {
      setWizardPermStatus(first.message, "error");
    } else if (first.target === "editing") {
      setWizardEditingStatus(first.message, "error");
    } else {
      setWizardStatus(first.message, "error");
    }
    return;
  }

  await saveSetupWizardBase();
  // Re-fetch settings — renderSettings is a no-op in the wizard window so the
  // local state.settings can lag behind the canonical value on disk.
  try {
    state.settings = await window.tapTalk.getSettings();
  } catch (err) {
    console.error("Failed to refresh settings after save:", err);
  }
  if (state.settings?.onboardingCompleted === true) {
    await notifyWizardCompletedAndClose();
  }
}

async function skipSetupWizard() {
  const previouslyCompleted = state.settings?.onboardingCompleted === true;
  await skipSetupWizardBase();
  if (!previouslyCompleted && state.settings?.onboardingCompleted === true) {
    await notifyWizardCompletedAndClose();
  }
}

function bindWizardEvents() {
  function bindPressToReveal(button, input) {
    if (!button || !input) {
      return;
    }
    const reveal = () => {
      input.type = "text";
      button.classList.add("active");
    };
    const hide = () => {
      input.type = "password";
      button.classList.remove("active");
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      reveal();
    });
    button.addEventListener("pointerup", hide);
    button.addEventListener("pointercancel", hide);
    button.addEventListener("pointerleave", hide);
    button.addEventListener("blur", hide);
    button.addEventListener("keyup", (event) => {
      if (event.key === " " || event.key === "Enter") {
        hide();
      }
    });
  }

  bindPressToReveal(wizardCloudApiKeyPeekBtn, wizardCloudApiKeyInput);

  wizardModeLocalBtn.addEventListener("click", () => {
    renderWizardMode("local");
    if (wizardState.step === 2 && !wizardState.busy) {
      void probeWizardRuntime();
    }
  });
  wizardModeCloudBtn.addEventListener("click", () => {
    renderWizardMode("cloud");
    setWizardStatus("");
  });
  wizardBackBtn.addEventListener("click", () => {
    renderWizardStep(wizardState.step - 1);
  });
  wizardNextBtn.addEventListener("click", () => {
    renderWizardStep(wizardState.step + 1);
  });

  // Sidebar stepper: jump straight to an already-visited step. Forward
  // navigation stays gated behind Continue so per-step validation/probes run.
  function jumpToStep(target) {
    if (wizardState.busy) return;
    if (!Number.isFinite(target)) return;
    if (target === wizardState.step) return;
    if (target > wizardState.maxStepReached) return;
    renderWizardStep(target);
  }
  document.querySelectorAll(".wz-step-row").forEach((row) => {
    const target = Number(row.getAttribute("data-step"));
    row.addEventListener("click", () => jumpToStep(target));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        jumpToStep(target);
      }
    });
  });
  wizardPythonPathInput.addEventListener("change", () => {
    if (wizardMode() === "local" && !wizardState.busy) {
      void probeWizardRuntime();
    }
  });
  wizardLocalModelPresetSelect.addEventListener("change", () => {
    applyWizardLocalModelProfile(wizardLocalModelPresetSelect.value);
    if (wizardMode() === "local" && wizardState.step === 2 && !wizardState.busy) {
      void probeWizardRuntime();
    }
  });
  if (wizardEngineSelect) {
    wizardEngineSelect.addEventListener("change", () => {
      syncWizardEngineFields();
      persistWizardDraft();
      if (wizardMode() === "local" && wizardState.step === 2 && !wizardState.busy) {
        void probeWizardRuntime();
      }
    });
  }
  wizardInstallPackageCheck.addEventListener("change", () => {
    if (wizardMode() === "local" && wizardState.step === 2 && !wizardState.busy) {
      void probeWizardRuntime();
    }
  });
  wizardPrepareOnSaveCheck.addEventListener("change", () => {
    if (wizardMode() === "local" && wizardState.step === 2 && !wizardState.busy) {
      void probeWizardRuntime();
    }
  });
  wizardPrepareLocalBtn.addEventListener("click", () => {
    if (wizardEngineValue() === "whisper-cpp") {
      void prepareWizardWhisperCpp();
    } else {
      void prepareWizardLocalModel();
    }
  });
  wizardTestLocalBtn.addEventListener("click", () => {
    void probeWizardRuntime();
  });
  wizardPermMicrophoneBtn.addEventListener("click", async () => {
    const perms = await window.tapTalk.checkPermissions();
    if (perms.microphone === "denied" || perms.microphone === "restricted") {
      void window.tapTalk.openMicrophone();
      setWizardPermStatus("Open System Settings > Privacy & Security > Microphone to enable.", "");
    } else {
      void requestMicrophonePermission();
    }
  });
  wizardPermAccessibilityBtn.addEventListener("click", () => {
    void openAccessibilityFromWizard();
  });
  if (wizardPermInputMonitoringBtn) {
    wizardPermInputMonitoringBtn.addEventListener("click", () => {
      void openInputMonitoringFromWizard();
    });
  }
  wizardPermRefreshBtn.addEventListener("click", () => {
    setWizardPermStatus("");
    void refreshWizardPermissionState();
  });
  wizardCloudPresetSelect.addEventListener("change", () => {
    const selected = wizardCloudPresetSelect.value || "groq";
    wizardState.cloudApiKeys[wizardState.cloudPresetCurrent] = wizardCloudApiKeyInput.value.trim();
    wizardState.cloudPresetCurrent = selected;
    const source = state.presets[selected];
    wizardCloudApiKeyInput.value = wizardState.cloudApiKeys[selected] || "";
    if (source) {
      wizardCloudModelInput.value = source.model || "";
      fillWizardCloudAdvancedFields({
        ...source,
        apiKey: wizardCloudApiKeyInput.value,
        apiKeys: wizardState.cloudApiKeys
      });
    }
    if (selected === "custom") {
      wizardState.cloudAdvancedOpen = true;
    }
    renderWizardCloudAdvanced();
    setWizardCloudStatus("");
  });
  wizardCloudAdvancedToggleBtn.addEventListener("click", () => {
    wizardState.cloudAdvancedOpen = !wizardState.cloudAdvancedOpen;
    renderWizardCloudAdvanced();
  });
  if (wizardPrefsAdvancedToggleBtn) {
    wizardPrefsAdvancedToggleBtn.addEventListener("click", () => {
      wizardState.prefsAdvancedOpen = !wizardState.prefsAdvancedOpen;
      renderWizardPrefsAdvanced();
      persistWizardDraft();
    });
  }
  if (wizardEditingProviderSelect) {
    wizardEditingProviderSelect.addEventListener("change", () => {
      syncWizardEditingFields();
      setWizardEditingStatus("");
    });
  }
  if (wizardEditingEndpointInput) {
    wizardEditingEndpointInput.addEventListener("input", syncWizardEditingFields);
  }
  wizardSkipBtn.addEventListener("click", () => {
    void skipSetupWizard();
  });
  wizardSaveBtn.addEventListener("click", () => {
    void saveSetupWizard();
  });

  setupWizard.addEventListener("input", () => {
    persistWizardDraft();
  });
  setupWizard.addEventListener("change", () => {
    persistWizardDraft();
  });

  if (welcomeGetStartedBtn) {
    welcomeGetStartedBtn.addEventListener("click", () => {
      if (welcomeModal) welcomeModal.classList.add("hidden");
      void window.tapTalk
        .updateSettings({ welcomeShown: true })
        .catch(() => undefined)
        .finally(() => {
          openSetupWizard({ resumeDraft: false, required: true });
        });
    });
  }
  if (welcomeSkipBtn) {
    welcomeSkipBtn.addEventListener("click", () => {
      if (welcomeModal) welcomeModal.classList.add("hidden");
      void window.tapTalk
        .updateSettings({ welcomeShown: true })
        .catch(() => undefined)
        .finally(() => {
          void notifyWizardCompletedAndClose();
        });
    });
  }
}

async function bootstrapWizardWindow() {
  mountTaptalkGlyphs();
  bindWizardEvents();

  // Surface setup progress from the main process inside the wizard window.
  window.tapTalk.onSetupProgress((msg) => {
    if (wizardState.step === 2 && wizardMode() === "local") {
      setWizardStatus(msg);
      const lower = msg.toLowerCase();
      const pythonItem = document.getElementById("wizardDepPython");
      const whisperItem = document.getElementById("wizardDepWhisper");
      if (
        lower.includes("model") ||
        lower.includes("faster-whisper") ||
        lower.includes("pip") ||
        lower.includes("venv")
      ) {
        setDepStatus(whisperItem, "working", msg);
      } else if (lower.includes("python") || lower.includes("extracting")) {
        setDepStatus(pythonItem, "working", msg);
      }
    }
  });

  try {
    const [settings, status, presets] = await Promise.all([
      window.tapTalk.getSettings(),
      window.tapTalk.getStatus(),
      window.tapTalk.getCloudPresets()
    ]);

    state.presets = presets || {};
    state.settings = settings;
    state.status = status;
    applyTheme(settings.theme || "system");

    if (settings.welcomeShown !== true) {
      if (welcomeModal) {
        welcomeModal.classList.remove("hidden");
      }
    } else {
      openSetupWizard({ resumeDraft: true, required: true });
    }
  } catch (error) {
    console.error("Failed to initialize wizard window:", error);
    setWizardStatus("Failed to load wizard: " + userFacingErrorMessage(error), "error");
  }
}

void bootstrapWizardWindow();
