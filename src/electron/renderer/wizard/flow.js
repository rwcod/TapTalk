import {
  setupWizard,
  wizardAutopasteCheck,
  wizardCloudApiKeyInput,
  wizardCloudApiKeyPeekBtn,
  wizardCloudAudioFieldInput,
  wizardCloudAuthHeaderInput,
  wizardCloudAuthValueInput,
  wizardCloudBodyFormatSelect,
  wizardCloudExtraFormFieldsInput,
  wizardCloudModelInput,
  wizardCloudPresetSelect,
  wizardCloudQueryParamsInput,
  wizardCloudTextFieldHintsInput,
  wizardCloudUrlInput,
  wizardEditingApiKeyInput,
  wizardEditingEnabledCheck,
  wizardEditingEndpointInput,
  wizardEditingModelInput,
  wizardEditingProviderSelect,
  wizardInstallPackageCheck,
  wizardLanguageIncludeEnglishCheck,
  wizardLanguageSelect,
  wizardLocalModelInput,
  wizardPrepareOnSaveCheck,
  wizardSecretBackendSelect,
  wizardPythonPathInput,
  wizardWhisperCppGpuCheck,
  wizardEngineSelect,
  wizardSkipBtn
} from "./dom.js";

export function createWizardFlowController({
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
  wizardEngineValue,
  renderSettings,
  renderStatus,
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
}) {
  function editingFromWizardInputs() {
    return {
      enabled: wizardEditingEnabledCheck ? wizardEditingEnabledCheck.checked : true,
      provider: wizardEditingProviderSelect ? wizardEditingProviderSelect.value : "rule-based",
      endpoint: wizardEditingEndpointInput ? wizardEditingEndpointInput.value.trim() : "",
      model: wizardEditingModelInput ? wizardEditingModelInput.value.trim() : "",
      apiKey: wizardEditingApiKeyInput ? wizardEditingApiKeyInput.value.trim() : ""
    };
  }

  function validateWizardEditing(editing) {
    if (!editing.enabled || editing.provider !== "openai-compatible") {
      return null;
    }
    if (!editing.endpoint.trim()) {
      return "Set an edit endpoint before saving selected-text editing.";
    }
    if (!editing.model.trim()) {
      return "Set an edit model before saving selected-text editing.";
    }
    if (!isLocalEditEndpoint(editing.endpoint) && !editing.apiKey.trim()) {
      return "Remote edit endpoints require an API key.";
    }
    return null;
  }

  function closeSetupWizard() {
    wizardCloudApiKeyInput.type = "password";
    wizardCloudApiKeyPeekBtn.classList.remove("active");
    stopPermissionPolling();
    wizardState.mandatory = false;
    setupWizard.classList.add("hidden");
    persistWizardActiveFlag(false);
    void window.tapTalk?.resizeForView?.("dashboard");
  }

  function openSetupWizard(options = {}) {
    if (!state.settings) return;
    const resumeDraft = options.resumeDraft === true;
    wizardState.mandatory = options.required === true;

    const settings = state.settings;
    const localLanguage = parseLocalLanguageConfig(settings.localFasterWhisper.language);
    const cloudLanguage = parseLocalLanguageConfig(settings.cloud.language);
    const baseLanguage =
      localLanguage.baseLanguage !== "auto" || localLanguage.includeEnglish
        ? localLanguage.baseLanguage
        : cloudLanguage.baseLanguage;

    fillCloudPresetOptions(wizardCloudPresetSelect, settings.cloud.preset);
    const engine = settings.localEngine === "whisper-cpp" ? "whisper-cpp" : "faster-whisper";
    if (wizardEngineSelect) wizardEngineSelect.value = engine;
    const cppCfg = settings.localWhisperCpp || { model: "small", useGpu: true };
    if (wizardWhisperCppGpuCheck) wizardWhisperCppGpuCheck.checked = cppCfg.useGpu !== false;
    const initialModel =
      engine === "whisper-cpp" ? cppCfg.model : settings.localFasterWhisper.model;
    wizardPythonPathInput.value = settings.localFasterWhisper.pythonPath;
    wizardLocalModelInput.value = initialModel;
    applyWizardLocalModelProfile(wizardProfileForModel(initialModel));
    wizardState.cloudPresetCurrent = wizardCloudPresetSelect.value || settings.cloud.preset;
    wizardState.cloudApiKeys = cloudApiKeysFromConfig(settings.cloud);
    wizardCloudApiKeyInput.value = wizardState.cloudApiKeys[wizardState.cloudPresetCurrent] || "";
    wizardCloudModelInput.value = settings.cloud.model;
    fillWizardCloudAdvancedFields({
      ...settings.cloud,
      apiKey: wizardCloudApiKeyInput.value,
      apiKeys: wizardState.cloudApiKeys
    });
    wizardState.cloudAdvancedOpen = false;
    wizardState.prefsAdvancedOpen = false;
    wizardState.permAutoAdvanced = false;
    wizardState.maxStepReached = 1;
    renderWizardCloudAdvanced();
    populateLanguageSelect(wizardLanguageSelect, baseLanguage);
    wizardLanguageIncludeEnglishCheck.checked = localLanguage.includeEnglish;
    wizardSecretBackendSelect.value =
      settings.cloudSecretBackend === "safeStorage" ? "safeStorage" : "settings";
    wizardAutopasteCheck.checked = !!settings.autoPaste;
    const editing = settings.editing || {};
    if (wizardEditingEnabledCheck) wizardEditingEnabledCheck.checked = editing.enabled !== false;
    if (wizardEditingProviderSelect) {
      wizardEditingProviderSelect.value = editing.provider || "rule-based";
    }
    if (wizardEditingEndpointInput) wizardEditingEndpointInput.value = editing.endpoint || "";
    if (wizardEditingModelInput) wizardEditingModelInput.value = editing.model || "";
    if (wizardEditingApiKeyInput) wizardEditingApiKeyInput.value = editing.apiKey || "";
    syncWizardEditingFields?.();
    wizardInstallPackageCheck.checked = true;
    wizardPrepareOnSaveCheck.checked = true;
    wizardSkipBtn.classList.toggle("hidden", wizardState.mandatory);
    renderWizardMode(settings.mode);
    resetDepChecklist();
    let initialStep = 1;
    if (resumeDraft) {
      const restoredStep = restoreWizardDraft();
      if (typeof restoredStep === "number") {
        initialStep = restoredStep;
      }
    }
    renderWizardStep(initialStep);
    setWizardStatus("");
    setWizardCloudStatus("");
    setWizardEditingStatus("");
    setWizardPermStatus("");
    void window.tapTalk?.resizeForView?.("wizard");
    setupWizard.classList.remove("hidden");
    persistWizardActiveFlag(true);
  }

  function persistWizardActiveFlag(active) {
    try {
      const raw = window.localStorage.getItem("taptalk:wizard-draft");
      const draft = raw ? JSON.parse(raw) : {};
      if (active) {
        draft.wizardActive = true;
        window.localStorage.setItem("taptalk:wizard-draft", JSON.stringify(draft));
      } else if (draft && typeof draft === "object") {
        draft.wizardActive = false;
        window.localStorage.setItem("taptalk:wizard-draft", JSON.stringify(draft));
      }
    } catch {
      // ignore localStorage failures
    }
  }

  async function skipSetupWizard() {
    if (wizardState.mandatory && state.settings && !state.settings.onboardingCompleted) {
      setWizardStatus("Complete setup to continue.", "error");
      return;
    }

    if (state.settings?.onboardingCompleted) {
      closeSetupWizard();
      return;
    }

    const next = await window.tapTalk.updateSettings({
      onboardingCompleted: true
    });
    renderSettings(next);
    clearWizardDraft();
    closeSetupWizard();
  }

  async function resetOnboardingFlow() {
    if (!state.settings) {
      return;
    }

    const confirmed = window.confirm(
      "Reset setup and reopen onboarding wizard? Current onboarding progress will be cleared."
    );
    if (!confirmed) {
      return;
    }

    try {
      const next = await window.tapTalk.resetOnboarding();
      renderSettings(next);
      clearWizardDraft();
      openSetupWizard({ resumeDraft: false, required: true });
      setWizardStatus("Setup reset. Complete the wizard to continue.");

      try {
        renderStatus(await window.tapTalk.getStatus());
      } catch {
        // keep existing status
      }
    } catch (error) {
      if (!state.status) {
        return;
      }
      renderStatus({
        ...state.status,
        error: userFacingErrorMessage(error)
      });
    }
  }

  async function saveSetupWizard() {
    if (!state.settings) return;

    const current = state.settings;
    const mode = wizardMode();
    const engine = typeof wizardEngineValue === "function" ? wizardEngineValue() : "faster-whisper";
    const isCpp = mode === "local" && engine === "whisper-cpp";
    const baseLanguage = wizardLanguageSelect.value || "auto";
    const includeEnglish = !isCpp && wizardLanguageIncludeEnglishCheck.checked;
    const localLanguage = localLanguageToSetting(baseLanguage, includeEnglish);
    const cloudLanguage = cloudLanguageToSetting(baseLanguage, includeEnglish);
    const localModel = wizardLocalModelValue() || current.localFasterWhisper.model;
    const editing = editingFromWizardInputs();
    let effectivePythonPath =
      wizardPythonPathInput.value.trim() || current.localFasterWhisper.pythonPath;
    wizardState.cloudApiKeys[wizardState.cloudPresetCurrent] = wizardCloudApiKeyInput.value.trim();
    const selectedCloudPreset = wizardState.cloudPresetCurrent || current.cloud.preset;
    const cloudApiKey = wizardState.cloudApiKeys[selectedCloudPreset] || "";

    if (mode === "cloud" && !cloudApiKey.trim()) {
      renderWizardMode("cloud");
      renderWizardStep(2);
      setWizardCloudStatus("Set API key first.", "error");
      return;
    }

    const nextCloudBase = cloneCloudFromPreset(
      selectedCloudPreset,
      cloudApiKey,
      {
        ...current.cloud,
        apiKeys: {
          ...cloudApiKeysFromConfig(current.cloud),
          ...wizardState.cloudApiKeys
        }
      },
      selectedCloudPreset
    );

    let nextCloud = {
      ...nextCloudBase,
      model: wizardCloudModelInput.value.trim() || nextCloudBase.model,
      language: cloudLanguage
    };

    const applyCloudAdvanced =
      selectedCloudPreset === "custom" || wizardState.cloudAdvancedOpen;
    if (applyCloudAdvanced) {
      const bodyFormat = wizardCloudBodyFormatSelect.value === "binary" ? "binary" : "formdata";
      const defaultAudioField =
        bodyFormat === "formdata" ? (nextCloud.audioFieldName || "file") : "";

      nextCloud = {
        ...nextCloud,
        url: wizardCloudUrlInput.value.trim() || nextCloud.url,
        authHeader: wizardCloudAuthHeaderInput.value.trim() || nextCloud.authHeader,
        authValueTemplate:
          wizardCloudAuthValueInput.value.trim() || nextCloud.authValueTemplate,
        bodyFormat,
        audioFieldName: wizardCloudAudioFieldInput.value.trim() || defaultAudioField,
        queryParams: parseKeyValuePairs(wizardCloudQueryParamsInput.value),
        extraFormFields: parseKeyValuePairs(wizardCloudExtraFormFieldsInput.value),
        textFieldHints: parseHints(wizardCloudTextFieldHintsInput.value)
      };
    }

    if (mode === "cloud" && selectedCloudPreset === "custom" && !nextCloud.url.trim()) {
      renderWizardMode("cloud");
      renderWizardStep(2);
      setWizardCloudStatus("Custom cloud endpoint requires URL.", "error");
      return;
    }

    const editingError = validateWizardEditing(editing);
    if (editingError) {
      renderWizardStep(4);
      setWizardEditingStatus(editingError, "error");
      return;
    }
    setWizardEditingStatus("");

    setWizardCloudStatus("");

    try {
      if (mode === "local") {
        const runtimeReady = await runSaveLocalChecks(effectivePythonPath);
        if (!runtimeReady) {
          return;
        }
        effectivePythonPath = wizardPythonPathInput.value.trim() || effectivePythonPath;
      }

      if (mode === "local" && wizardPrepareOnSaveCheck.checked) {
        if (isCpp) {
          await prepareWizardWhisperCpp();
        } else {
          const preparedPythonPath = await prepareWizardLocalModel();
          effectivePythonPath =
            preparedPythonPath || wizardPythonPathInput.value.trim() || effectivePythonPath;
        }
      }

      const next = await window.tapTalk.updateSettings({
        onboardingCompleted: true,
        mode,
        localEngine: mode === "local" ? engine : current.localEngine,
        autoPaste: wizardAutopasteCheck.checked,
        cloudSecretBackend:
          wizardSecretBackendSelect.value === "safeStorage" ? "safeStorage" : "settings",
        editing,
        cloud: nextCloud,
        localFasterWhisper: {
          ...current.localFasterWhisper,
          pythonPath: effectivePythonPath,
          model: isCpp ? current.localFasterWhisper.model : localModel,
          language: localLanguage
        },
        localWhisperCpp: {
          ...current.localWhisperCpp,
          model: isCpp ? localModel : current.localWhisperCpp.model,
          language: localLanguage,
          useGpu: wizardWhisperCppGpuCheck
            ? wizardWhisperCppGpuCheck.checked
            : current.localWhisperCpp.useGpu
        }
      });

      renderSettings(next);
      clearWizardDraft();
      closeSetupWizard();
      flash();
    } catch {
      // Status is already shown in wizard.
    }
  }

  return {
    closeSetupWizard,
    openSetupWizard,
    resetOnboardingFlow,
    saveSetupWizard,
    skipSetupWizard
  };
}
