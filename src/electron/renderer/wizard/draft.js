import {
  setupWizard,
  wizardAutopasteCheck,
  wizardCloudApiKeyInput,
  wizardCloudAuthHeaderInput,
  wizardCloudAuthValueInput,
  wizardCloudAudioFieldInput,
  wizardCloudBodyFormatSelect,
  wizardCloudExtraFormFieldsInput,
  wizardCloudModelInput,
  wizardCloudPresetSelect,
  wizardCloudQueryParamsInput,
  wizardCloudTextFieldHintsInput,
  wizardCloudUrlInput,
  wizardEditingEnabledCheck,
  wizardEditingEndpointInput,
  wizardEditingModelInput,
  wizardEditingProviderSelect,
  wizardInstallPackageCheck,
  wizardLanguageIncludeEnglishCheck,
  wizardLanguageSelect,
  wizardLocalModelInput,
  wizardLocalModelPresetSelect,
  wizardPrepareOnSaveCheck,
  wizardSecretBackendSelect,
  wizardPythonPathInput,
  wizardEngineSelect,
  wizardWhisperCppGpuCheck
} from "./dom.js";

export function createWizardDraftController({
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
}) {
  function readWizardDraft() {
    try {
      const raw = window.localStorage.getItem(WIZARD_DRAFT_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  function clearWizardDraft() {
    try {
      window.localStorage.removeItem(WIZARD_DRAFT_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
  }

  function isWizardVisible() {
    return !setupWizard.classList.contains("hidden");
  }

  function persistWizardDraft() {
    if (!isWizardVisible()) {
      return;
    }

    if (!state.settings) {
      return;
    }

    try {
      const draft = {
        wizardActive: true,
        step: wizardState.step,
        mode: wizardMode(),
        localEngine: wizardEngineSelect ? wizardEngineSelect.value : "faster-whisper",
        whisperCppUseGpu: wizardWhisperCppGpuCheck ? wizardWhisperCppGpuCheck.checked : true,
        pythonPath: wizardPythonPathInput.value.trim(),
        localModelPreset: wizardLocalModelPresetSelect.value,
        localModelInput: wizardLocalModelInput.value.trim(),
        installPackage: wizardInstallPackageCheck.checked,
        prepareOnSave: wizardPrepareOnSaveCheck.checked,
        cloudPreset: wizardCloudPresetSelect.value || wizardState.cloudPresetCurrent,
        cloudModel: wizardCloudModelInput.value.trim(),
        cloudAdvancedOpen: wizardState.cloudAdvancedOpen,
        prefsAdvancedOpen: wizardState.prefsAdvancedOpen,
        cloudUrl: wizardCloudUrlInput.value.trim(),
        cloudAuthHeader: wizardCloudAuthHeaderInput.value.trim(),
        cloudAuthValueTemplate: wizardCloudAuthValueInput.value.trim(),
        cloudBodyFormat:
          wizardCloudBodyFormatSelect.value === "binary" ? "binary" : "formdata",
        cloudAudioFieldName: wizardCloudAudioFieldInput.value.trim(),
        cloudQueryParams: wizardCloudQueryParamsInput.value.trim(),
        cloudExtraFormFields: wizardCloudExtraFormFieldsInput.value.trim(),
        cloudTextFieldHints: wizardCloudTextFieldHintsInput.value.trim(),
        language: wizardLanguageSelect.value,
        languageIncludeEnglish: wizardLanguageIncludeEnglishCheck.checked,
        cloudSecretBackend:
          wizardSecretBackendSelect.value === "safeStorage" ? "safeStorage" : "settings",
        autoPaste: wizardAutopasteCheck.checked,
        editingEnabled: wizardEditingEnabledCheck ? wizardEditingEnabledCheck.checked : true,
        editingProvider: wizardEditingProviderSelect ? wizardEditingProviderSelect.value : "rule-based",
        editingEndpoint: wizardEditingEndpointInput ? wizardEditingEndpointInput.value.trim() : "",
        editingModel: wizardEditingModelInput ? wizardEditingModelInput.value.trim() : ""
      };

      window.localStorage.setItem(WIZARD_DRAFT_STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore storage failures
    }
  }

  function restoreWizardDraft() {
    if (!state.settings) {
      return null;
    }

    const draft = readWizardDraft();
    if (!draft) {
      return null;
    }

    if (
      typeof draft.localEngine === "string" &&
      (draft.localEngine === "faster-whisper" || draft.localEngine === "whisper-cpp") &&
      wizardEngineSelect
    ) {
      wizardEngineSelect.value = draft.localEngine;
    }
    if (typeof draft.whisperCppUseGpu === "boolean" && wizardWhisperCppGpuCheck) {
      wizardWhisperCppGpuCheck.checked = draft.whisperCppUseGpu;
    }

    if (draft.mode === "local" || draft.mode === "cloud") {
      renderWizardMode(draft.mode);
    }

    if (typeof draft.pythonPath === "string" && draft.pythonPath.trim()) {
      wizardPythonPathInput.value = draft.pythonPath.trim();
    }

    if (typeof draft.localModelInput === "string") {
      wizardLocalModelInput.value = draft.localModelInput;
    }

    // Restore the model input first, then sync the preset dropdown. This keeps a
    // model chosen outside the four presets (e.g. from the Settings panel)
    // intact instead of letting a stale/default preset clobber it.
    if (typeof draft.localModelPreset === "string" && draft.localModelPreset.trim()) {
      applyWizardLocalModelProfile(draft.localModelPreset);
    }

    if (typeof draft.installPackage === "boolean") {
      wizardInstallPackageCheck.checked = draft.installPackage;
    }

    if (typeof draft.prepareOnSave === "boolean") {
      wizardPrepareOnSaveCheck.checked = draft.prepareOnSave;
    }

    if (typeof draft.cloudPreset === "string" && draft.cloudPreset.trim()) {
      const nextPreset = draft.cloudPreset.trim();
      if (state.presets[nextPreset] || nextPreset === "custom") {
        wizardState.cloudPresetCurrent = nextPreset;
        wizardCloudPresetSelect.value = nextPreset;
      }
    }

    if (typeof draft.cloudModel === "string") {
      wizardCloudModelInput.value = draft.cloudModel;
    }

    if (typeof draft.cloudAdvancedOpen === "boolean") {
      wizardState.cloudAdvancedOpen = draft.cloudAdvancedOpen;
    }

    if (typeof draft.prefsAdvancedOpen === "boolean") {
      wizardState.prefsAdvancedOpen = draft.prefsAdvancedOpen;
    }

    if (typeof draft.cloudUrl === "string") {
      wizardCloudUrlInput.value = draft.cloudUrl;
    }
    if (typeof draft.cloudAuthHeader === "string") {
      wizardCloudAuthHeaderInput.value = draft.cloudAuthHeader;
    }
    if (typeof draft.cloudAuthValueTemplate === "string") {
      wizardCloudAuthValueInput.value = draft.cloudAuthValueTemplate;
    }
    if (typeof draft.cloudBodyFormat === "string") {
      wizardCloudBodyFormatSelect.value =
        draft.cloudBodyFormat === "binary" ? "binary" : "formdata";
    }
    if (typeof draft.cloudAudioFieldName === "string") {
      wizardCloudAudioFieldInput.value = draft.cloudAudioFieldName;
    }
    if (typeof draft.cloudQueryParams === "string") {
      wizardCloudQueryParamsInput.value = draft.cloudQueryParams;
    }
    if (typeof draft.cloudExtraFormFields === "string") {
      wizardCloudExtraFormFieldsInput.value = draft.cloudExtraFormFields;
    }
    if (typeof draft.cloudTextFieldHints === "string") {
      wizardCloudTextFieldHintsInput.value = draft.cloudTextFieldHints;
    }
    renderWizardCloudAdvanced();

    if (typeof draft.language === "string") {
      const parsedLanguage = parseLocalLanguageConfig(draft.language);
      populateLanguageSelect(wizardLanguageSelect, parsedLanguage.baseLanguage);
      wizardLanguageIncludeEnglishCheck.checked =
        typeof draft.languageIncludeEnglish === "boolean"
          ? draft.languageIncludeEnglish
          : parsedLanguage.includeEnglish;
    } else if (typeof draft.languageIncludeEnglish === "boolean") {
      wizardLanguageIncludeEnglishCheck.checked = draft.languageIncludeEnglish;
    }
    if (draft.cloudSecretBackend === "safeStorage" || draft.cloudSecretBackend === "settings") {
      wizardSecretBackendSelect.value = draft.cloudSecretBackend;
    }
    if (typeof draft.autoPaste === "boolean") {
      wizardAutopasteCheck.checked = draft.autoPaste;
    }
    if (typeof draft.editingEnabled === "boolean" && wizardEditingEnabledCheck) {
      wizardEditingEnabledCheck.checked = draft.editingEnabled;
    }
    if (
      typeof draft.editingProvider === "string" &&
      (draft.editingProvider === "rule-based" || draft.editingProvider === "openai-compatible") &&
      wizardEditingProviderSelect
    ) {
      wizardEditingProviderSelect.value = draft.editingProvider;
    }
    if (typeof draft.editingEndpoint === "string" && wizardEditingEndpointInput) {
      wizardEditingEndpointInput.value = draft.editingEndpoint;
    }
    if (typeof draft.editingModel === "string" && wizardEditingModelInput) {
      wizardEditingModelInput.value = draft.editingModel;
    }
    syncWizardEditingFields?.();

    const stepRaw = Number(draft.step);
    if (!Number.isFinite(stepRaw)) {
      return 1;
    }

    return clampWizardStep(Math.trunc(stepRaw));
  }

  return {
    clearWizardDraft,
    persistWizardDraft,
    readWizardDraft,
    restoreWizardDraft
  };
}
