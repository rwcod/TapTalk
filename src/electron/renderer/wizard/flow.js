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
  wizardObsidianFolderInput,
  wizardPrepareOnSaveCheck,
  wizardSecretBackendSelect,
  wizardPythonPathInput,
  wizardWhisperCppGpuCheck,
  wizardEngineSelect,
  wizardSkipBtn,
  wizardUseObsidianCheck,
  wizardCaptureDestinationSelect
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
  setWizardObsidianStatus,
  setWizardPermStatus,
  setWizardStatus,
  syncWizardObsidianFields,
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

  function pathLabel(value) {
    return value.split(/[\\/]/).filter(Boolean).pop() || value;
  }

  function wizardObsidianPathFromSettings(settings) {
    const vault = settings.vault || {};
    const knowledgeSources = Array.isArray(vault.knowledgeSources) ? vault.knowledgeSources : [];
    return knowledgeSources.find((source) => source?.path)?.path || vault.captureFolder || "";
  }

  // wizardUseObsidianCheck is the "use Obsidian notes as AI context" toggle.
  function wizardObsidianIsContext(settings) {
    const vault = settings.vault || {};
    const knowledgeSources = Array.isArray(vault.knowledgeSources) ? vault.knowledgeSources : [];
    return knowledgeSources.some((source) => source?.path && source?.enabled !== false);
  }

  function wizardObsidianCaptureDestination(settings) {
    const vault = settings.vault || {};
    return vault.captureDestination === "folder" ? "folder" : "taptalk";
  }

  function wizardNeedsObsidianFolder() {
    return (
      wizardCaptureDestinationSelect?.value === "folder" ||
      (wizardUseObsidianCheck?.checked ?? false)
    );
  }

  function vaultFromWizardInputs(current) {
    const currentVault = current.vault || {};
    const captureToObsidian = wizardCaptureDestinationSelect?.value === "folder";
    const contextObsidian = wizardUseObsidianCheck ? wizardUseObsidianCheck.checked : false;
    const folder = wizardObsidianFolderInput?.value.trim() || "";
    const existing = (currentVault.knowledgeSources || []).find(
      (source) => source?.path === folder
    );
    const knowledgeSources = folder
      ? [{
          id: existing?.id || "obsidian-vault",
          label: existing?.label || pathLabel(folder),
          path: folder,
          enabled: contextObsidian,
          kind: existing?.kind || "obsidian"
        }]
      : [];

    return {
      captureDestination: captureToObsidian && folder ? "folder" : "taptalk",
      captureFolder: folder,
      includeTapTalkVault: currentVault.includeTapTalkVault !== false,
      knowledgeSources
    };
  }

  function validateWizardObsidian() {
    if (!wizardNeedsObsidianFolder()) {
      setWizardObsidianStatus("");
      return null;
    }
    if (!wizardObsidianFolderInput?.value.trim()) {
      return "Choose your Obsidian folder first.";
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
    wizardState.permAutoAdvanced = false;
    wizardState.maxStepReached = 1;
    renderWizardCloudAdvanced();
    populateLanguageSelect(wizardLanguageSelect, baseLanguage);
    wizardLanguageIncludeEnglishCheck.checked = localLanguage.includeEnglish;
    wizardSecretBackendSelect.value =
      settings.cloudSecretBackend === "safeStorage" ? "safeStorage" : "settings";
    wizardAutopasteCheck.checked = !!settings.autoPaste;
    if (wizardUseObsidianCheck) {
      wizardUseObsidianCheck.checked = wizardObsidianIsContext(settings);
    }
    if (wizardObsidianFolderInput) {
      wizardObsidianFolderInput.value = wizardObsidianPathFromSettings(settings);
    }
    if (wizardCaptureDestinationSelect) {
      wizardCaptureDestinationSelect.value = wizardObsidianCaptureDestination(settings);
    }
    syncWizardObsidianFields();
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
    setWizardObsidianStatus("");
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
      renderWizardStep(5);
      setWizardEditingStatus(editingError, "error");
      return;
    }
    setWizardEditingStatus("");

    const obsidianError = validateWizardObsidian();
    if (obsidianError) {
      renderWizardStep(4);
      setWizardObsidianStatus(obsidianError, "error");
      return;
    }
    setWizardObsidianStatus("");

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
        vault: vaultFromWizardInputs(current),
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
