import {
  apiKeyCancelBtn,
  apiKeyModal,
  apiKeyPeekBtn,
  apiKeySaveBtn,
  apiKeyInput,
  autopasteCheck,
  showIndicatorCheck,
  launchAtLoginCheck,
  themeSelect,
  clearHistoryBtn,
  cloudAudioFieldInput,
  cloudAuthHeaderInput,
  cloudAuthValueInput,
  cloudBodyFormatSelect,
  cloudExtraFormFieldsInput,
  cloudModelInput,
  cloudPresetSelect,
  cloudQueryParamsInput,
  cloudTextFieldHintsInput,
  cloudUrlInput,
  copyBtn,
  fallbackCheck,
  vaultCaptureDestinationSelect,
  vaultCaptureFolderInput,
  vaultChooseCaptureFolderBtn,
  vaultIncludeTapTalkCheck,
  vaultIncludeObsidianCheck,
  editingEnabledCheck,
  editingProviderSelect,
  editingEndpointInput,
  editingModelInput,
  editingApiKeyInput,
  hotkeyProfileSelect,
  languageIncludeEnglishCheck,
  languageModeSelect,
  localBeamSizeInput,
  localComputeTypeInput,
  localCpuThreadsInput,
  localDeviceInput,
  localModelInput,
  localPythonPathInput,
  localVadFilterCheck,
  localEngineSelect,
  whisperCppModelInput,
  whisperCppThreadsInput,
  whisperCppUseGpuCheck,
  whisperCppDownloadBtn,
  modeCloudBtn,
  modeLocalBtn,
  mcpCopyConfigBtn,
  mcpCopyPromptBtn,
  mcpCopyStatus,
  openAccessibilityBtn,
  openWizardBtn,
  recBtn,
  resetOnboardingBtn,
  secretBackendSelect,
  setApiKeyBtn,
  settingsSection,
  settingsTrigger,
  setupWizard,
  tabCloudBtn,
  tabVaultBtn,
  tabEditingBtn,
  tabGeneralBtn,
  tabLocalBtn,
  transcriptBox,
  updateBanner,
  updateBannerDismissBtn,
  updateBannerPermissionsBtn,
  useFallbackHotkeyBtn,
  welcomeGetStartedBtn,
  welcomeModal,
  welcomeSkipBtn,
  wizardBackBtn,
  wizardCloudAdvancedToggleBtn,
  wizardCloudApiKeyInput,
  wizardCloudApiKeyPeekBtn,
  wizardCloudModelInput,
  wizardCloudPresetSelect,
  wizardEditingEndpointInput,
  wizardEditingProviderSelect,
  wizardEngineSelect,
  wizardInstallPackageCheck,
  wizardLocalModelPresetSelect,
  wizardModeCloudBtn,
  wizardModeLocalBtn,
  wizardNextBtn,
  wizardChooseObsidianFolderBtn,
  wizardMcpCopyConfigBtn,
  wizardMcpCopyPromptBtn,
  wizardMcpCopyStatus,
  wizardObsidianFolderInput,
  wizardObsidianStatus,
  wizardPermAccessibilityBtn,
  wizardPermInputMonitoringBtn,
  wizardPermMicrophoneBtn,
  wizardPermRefreshBtn,
  wizardPrepareLocalBtn,
  wizardPrepareOnSaveCheck,
  wizardPythonPathInput,
  wizardSaveBtn,
  wizardSkipBtn,
  wizardTestLocalBtn,
  wizardUseObsidianCheck,
  wizardCaptureDestinationSelect,
  themeToggleBtn
} from "./dom.js";
import { state } from "./state.js";
import { cloudLanguageToSetting, profileToHotkey, userFacingErrorMessage } from "./utils.js";
import { wizardState } from "./wizard/state.js";
import {
  syncThemeBtn,
  syncEditingFields,
  syncEngineSection,
  syncVaultFields,
  prepareWhisperCppModel
} from "./settings-panel.js";
import { syncWizardObsidianFields } from "./wizard/render.js";
import { copyMcpConfig, copyMcpSetupPrompt } from "./mcp-copy.js";

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

function clearWizardObsidianStatus() {
  if (!wizardObsidianStatus) return;
  wizardObsidianStatus.textContent = "";
  wizardObsidianStatus.classList.remove("success", "error");
}

function settingsMcpVaultPath() {
  const usesObsidian =
    vaultCaptureDestinationSelect?.value === "folder" || vaultIncludeObsidianCheck?.checked;
  return usesObsidian ? (vaultCaptureFolderInput?.value.trim() || "") : "";
}

function wizardMcpVaultPath() {
  const usesObsidian =
    wizardCaptureDestinationSelect?.value === "folder" || wizardUseObsidianCheck?.checked;
  return usesObsidian ? (wizardObsidianFolderInput?.value.trim() || "") : "";
}

export function bindRendererEvents({
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
}) {
  bindPressToReveal(apiKeyPeekBtn, apiKeyInput);
  bindPressToReveal(wizardCloudApiKeyPeekBtn, wizardCloudApiKeyInput);

  async function copyTranscript() {
    const text = transcriptBox.textContent || "";
    if (!text.trim()) return;

    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1000);
    } catch {
      // no-op
    }
  }

  async function clearHistory() {
    if (!clearHistoryBtn || clearHistoryBtn.disabled) {
      return;
    }

    try {
      renderStatus(await window.tapTalk.clearTranscriptHistory());
    } catch (error) {
      if (!state.status) {
        return;
      }

      renderStatus({
        ...state.status,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  recBtn.addEventListener("click", async () => {
    if (
      !state.status ||
      state.status.phase === "transcribing" ||
      state.status.phase === "starting"
    ) {
      return;
    }

    renderStatus(
      state.status.phase === "idle"
        ? await window.tapTalk.startDictation()
        : await window.tapTalk.stopDictation()
    );
  });

  copyBtn.addEventListener("click", copyTranscript);
  if (openAccessibilityBtn) {
    openAccessibilityBtn.addEventListener("click", async () => {
      try {
        await window.tapTalk.openAccessibilitySettings();
      } catch (error) {
        if (!state.status) {
          return;
        }

        renderStatus({
          ...state.status,
          error: userFacingErrorMessage(error)
        });
      }
    });
  }
  if (useFallbackHotkeyBtn) {
    useFallbackHotkeyBtn.addEventListener("click", async () => {
      if (!state.settings) {
        return;
      }

      try {
        const next = await window.tapTalk.updateSettings({
          hotkey: profileToHotkey("cmd_shift_space")
        });
        renderSettings(next);
        flash();
      } catch (error) {
        if (!state.status) {
          return;
        }

        renderStatus({
          ...state.status,
          error: userFacingErrorMessage(error)
        });
      }
    });
  }
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      void clearHistory();
    });
  }

  tabGeneralBtn.addEventListener("click", () => renderSettingsTab("general"));
  tabLocalBtn.addEventListener("click", () => renderSettingsTab("local"));
  tabCloudBtn.addEventListener("click", () => renderSettingsTab("cloud"));
  if (tabVaultBtn) {
    tabVaultBtn.addEventListener("click", () => renderSettingsTab("vault"));
  }
  if (tabEditingBtn) {
    tabEditingBtn.addEventListener("click", () => renderSettingsTab("editing"));
  }

  settingsTrigger.addEventListener("click", () => {
    if (settingsSection.classList.contains("open")) {
      settingsSection.classList.remove("open");
    } else {
      openSettings();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!settingsSection.classList.contains("open")) return;
    if (!(event.target instanceof Node)) return;
    if (settingsSection.contains(event.target)) return;
    settingsSection.classList.remove("open");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && settingsSection.classList.contains("open")) {
      settingsSection.classList.remove("open");
    }
  });

  modeLocalBtn.addEventListener("click", () => {
    renderMode("local");
    scheduleAutoSave();
  });

  modeCloudBtn.addEventListener("click", () => {
    renderMode("cloud");
    scheduleAutoSave();
  });

  languageModeSelect.addEventListener("change", scheduleAutoSave);
  languageIncludeEnglishCheck.addEventListener("change", scheduleAutoSave);
  localPythonPathInput.addEventListener("change", scheduleAutoSave);
  localModelInput.addEventListener("change", scheduleAutoSave);
  localDeviceInput.addEventListener("change", scheduleAutoSave);
  localComputeTypeInput.addEventListener("change", scheduleAutoSave);
  localBeamSizeInput.addEventListener("change", scheduleAutoSave);
  localCpuThreadsInput.addEventListener("change", scheduleAutoSave);
  localVadFilterCheck.addEventListener("change", scheduleAutoSave);
  if (localEngineSelect) {
    localEngineSelect.addEventListener("change", () => {
      syncEngineSection();
      scheduleAutoSave();
    });
  }
  if (whisperCppModelInput) whisperCppModelInput.addEventListener("change", scheduleAutoSave);
  if (whisperCppThreadsInput) whisperCppThreadsInput.addEventListener("change", scheduleAutoSave);
  if (whisperCppUseGpuCheck) whisperCppUseGpuCheck.addEventListener("change", scheduleAutoSave);
  if (whisperCppDownloadBtn) {
    whisperCppDownloadBtn.addEventListener("click", () => {
      void prepareWhisperCppModel();
    });
  }
  cloudPresetSelect.addEventListener("change", () => {
    if (!state.settings) return;
    const nextCloud = cloneCloudFromPreset(
      cloudPresetSelect.value,
      state.settings.cloud.apiKey,
      state.settings.cloud
    );
    renderSettings({
      ...state.settings,
      cloud: {
        ...nextCloud,
        language: cloudLanguageToSetting(
          languageModeSelect.value,
          languageIncludeEnglishCheck.checked
        )
      }
    });
    scheduleAutoSave();
  });

  cloudModelInput.addEventListener("change", scheduleAutoSave);
  cloudUrlInput.addEventListener("change", scheduleAutoSave);
  cloudAuthHeaderInput.addEventListener("change", scheduleAutoSave);
  cloudAuthValueInput.addEventListener("change", scheduleAutoSave);
  cloudBodyFormatSelect.addEventListener("change", scheduleAutoSave);
  cloudAudioFieldInput.addEventListener("change", scheduleAutoSave);
  cloudQueryParamsInput.addEventListener("change", scheduleAutoSave);
  cloudExtraFormFieldsInput.addEventListener("change", scheduleAutoSave);
  cloudTextFieldHintsInput.addEventListener("change", scheduleAutoSave);

  hotkeyProfileSelect.addEventListener("change", scheduleAutoSave);
  secretBackendSelect.addEventListener("change", scheduleAutoSave);

  // Capture destination and the Obsidian context checkbox both drive whether
  // the folder field is needed, so both re-sync visibility on change.
  if (vaultCaptureDestinationSelect) {
    vaultCaptureDestinationSelect.addEventListener("change", () => {
      syncVaultFields();
      scheduleAutoSave();
    });
  }
  if (vaultCaptureFolderInput) {
    vaultCaptureFolderInput.addEventListener("change", scheduleAutoSave);
  }
  if (vaultChooseCaptureFolderBtn) {
    vaultChooseCaptureFolderBtn.addEventListener("click", async () => {
      const folder = await window.tapTalk.chooseFolder();
      if (!folder || !vaultCaptureFolderInput) return;
      vaultCaptureFolderInput.value = folder;
      syncVaultFields();
      scheduleAutoSave();
    });
  }
  if (vaultIncludeTapTalkCheck) {
    vaultIncludeTapTalkCheck.addEventListener("change", scheduleAutoSave);
  }
  if (vaultIncludeObsidianCheck) {
    vaultIncludeObsidianCheck.addEventListener("change", () => {
      syncVaultFields();
      scheduleAutoSave();
    });
  }
  if (mcpCopyConfigBtn) {
    mcpCopyConfigBtn.addEventListener("click", () => {
      void copyMcpConfig(settingsMcpVaultPath(), mcpCopyStatus).catch(() => {
        if (mcpCopyStatus) mcpCopyStatus.textContent = "Could not copy MCP config.";
      });
    });
  }
  if (mcpCopyPromptBtn) {
    mcpCopyPromptBtn.addEventListener("click", () => {
      void copyMcpSetupPrompt(settingsMcpVaultPath(), mcpCopyStatus).catch(() => {
        if (mcpCopyStatus) mcpCopyStatus.textContent = "Could not copy setup prompt.";
      });
    });
  }

  if (editingEnabledCheck) {
    editingEnabledCheck.addEventListener("change", scheduleAutoSave);
  }
  if (editingProviderSelect) {
    editingProviderSelect.addEventListener("change", () => {
      syncEditingFields();
      scheduleAutoSave();
    });
  }
  if (editingEndpointInput) {
    editingEndpointInput.addEventListener("input", syncEditingFields);
    editingEndpointInput.addEventListener("change", scheduleAutoSave);
  }
  if (editingModelInput) {
    editingModelInput.addEventListener("change", scheduleAutoSave);
  }
  if (editingApiKeyInput) {
    editingApiKeyInput.addEventListener("change", scheduleAutoSave);
  }

  const THEME_CYCLE = ["system", "light", "dark"];
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const current = themeToggleBtn.dataset.themeCurrent || themeSelect?.value || "system";
      const next = THEME_CYCLE[(THEME_CYCLE.indexOf(current) + 1) % THEME_CYCLE.length];
      if (themeSelect) themeSelect.value = next;
      if (applyTheme) applyTheme(next);
      syncThemeBtn(next);
      scheduleAutoSave();
    });
  }

  for (const block of document.querySelectorAll(".settings-advanced")) {
    const toggle = block.querySelector(".settings-advanced-toggle");
    if (!toggle) continue;
    const key = block.dataset.advancedKey;
    const storageKey = key ? `taptalk.advanced.${key}` : null;
    let open = false;
    try {
      open = storageKey ? localStorage.getItem(storageKey) === "1" : false;
    } catch {
      open = false;
    }
    const apply = () => {
      block.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    };
    apply();
    toggle.addEventListener("click", () => {
      open = !open;
      apply();
      try {
        if (storageKey) localStorage.setItem(storageKey, open ? "1" : "0");
      } catch {
        /* ignore storage failures */
      }
    });
  }
  autopasteCheck.addEventListener("change", scheduleAutoSave);
  if (showIndicatorCheck) showIndicatorCheck.addEventListener("change", scheduleAutoSave);
  if (launchAtLoginCheck) launchAtLoginCheck.addEventListener("change", scheduleAutoSave);
  fallbackCheck.addEventListener("change", scheduleAutoSave);

  setApiKeyBtn.addEventListener("click", openApiKeyModal);
  apiKeyCancelBtn.addEventListener("click", closeApiKeyModal);
  apiKeySaveBtn.addEventListener("click", () => {
    void saveApiKey();
  });
  apiKeyModal.addEventListener("click", (event) => {
    if (event.target === apiKeyModal) {
      closeApiKeyModal();
    }
  });

  openWizardBtn.addEventListener("click", () => {
    openSetupWizard({ resumeDraft: true, required: false });
  });

  if (welcomeGetStartedBtn) {
    welcomeGetStartedBtn.addEventListener("click", () => {
      if (welcomeModal) welcomeModal.classList.add("hidden");
      void window.tapTalk.updateSettings({ welcomeShown: true }).catch(() => undefined);
      openSetupWizard({ resumeDraft: false, required: true });
    });
  }
  if (welcomeSkipBtn) {
    welcomeSkipBtn.addEventListener("click", () => {
      if (welcomeModal) welcomeModal.classList.add("hidden");
      void window.tapTalk.updateSettings({ welcomeShown: true }).catch(() => undefined);
      void window.tapTalk?.resizeForView?.("dashboard");
    });
  }

  if (updateBannerDismissBtn) {
    updateBannerDismissBtn.addEventListener("click", () => {
      state.updateBannerDismissed = true;
      if (updateBanner) updateBanner.style.display = "none";
    });
  }
  if (updateBannerPermissionsBtn) {
    updateBannerPermissionsBtn.addEventListener("click", () => {
      state.updateBannerDismissed = true;
      if (updateBanner) updateBanner.style.display = "none";
      openSetupWizard({ resumeDraft: false, required: false });
      renderWizardStep(3);
    });
  }

  if (resetOnboardingBtn) {
    resetOnboardingBtn.addEventListener("click", () => {
      void resetOnboardingFlow();
    });
  }
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
  wizardPythonPathInput.addEventListener("change", () => {
    if (wizardMode() === "local" && !wizardState.busy) {
      void probeWizardRuntime();
    }
  });
  wizardLocalModelPresetSelect.addEventListener("change", () => {
    applyWizardLocalModelProfile(wizardLocalModelPresetSelect.value);
  });
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
  if (wizardEngineSelect) {
    wizardEngineSelect.addEventListener("change", () => {
      syncWizardEngineFields();
      persistWizardDraft();
      if (wizardMode() === "local" && wizardState.step === 2 && !wizardState.busy) {
        void probeWizardRuntime();
      }
    });
  }
  wizardPrepareLocalBtn.addEventListener("click", () => {
    if (wizardEngineSelect && wizardEngineSelect.value === "whisper-cpp") {
      void prepareWizardWhisperCpp();
    } else {
      void prepareWizardLocalModel();
    }
  });
  wizardTestLocalBtn.addEventListener("click", () => {
    void testWizardLocalSetup();
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
  wizardPermInputMonitoringBtn.addEventListener("click", () => {
    void openInputMonitoringFromWizard();
  });
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
  if (wizardCaptureDestinationSelect) {
    wizardCaptureDestinationSelect.addEventListener("change", () => {
      syncWizardObsidianFields();
      clearWizardObsidianStatus();
      persistWizardDraft();
    });
  }
  if (wizardUseObsidianCheck) {
    wizardUseObsidianCheck.addEventListener("change", () => {
      syncWizardObsidianFields();
      clearWizardObsidianStatus();
      persistWizardDraft();
    });
  }
  if (wizardChooseObsidianFolderBtn) {
    wizardChooseObsidianFolderBtn.addEventListener("click", async () => {
      const folder = await window.tapTalk.chooseFolder();
      if (!folder || !wizardObsidianFolderInput) return;
      wizardObsidianFolderInput.value = folder;
      syncWizardObsidianFields();
      clearWizardObsidianStatus();
      persistWizardDraft();
    });
  }
  if (wizardMcpCopyConfigBtn) {
    wizardMcpCopyConfigBtn.addEventListener("click", () => {
      void copyMcpConfig(wizardMcpVaultPath(), wizardMcpCopyStatus).catch(() => {
        if (wizardMcpCopyStatus) wizardMcpCopyStatus.textContent = "Could not copy MCP config.";
      });
    });
  }
  if (wizardMcpCopyPromptBtn) {
    wizardMcpCopyPromptBtn.addEventListener("click", () => {
      void copyMcpSetupPrompt(wizardMcpVaultPath(), wizardMcpCopyStatus).catch(() => {
        if (wizardMcpCopyStatus) wizardMcpCopyStatus.textContent = "Could not copy setup prompt.";
      });
    });
  }
  if (wizardEditingProviderSelect) {
    wizardEditingProviderSelect.addEventListener("change", () => {
      syncWizardEditingFields();
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
  setupWizard.addEventListener("click", (event) => {
    if (event.target === setupWizard && !wizardState.busy) {
      if (wizardState.mandatory && state.settings && !state.settings.onboardingCompleted) {
        setWizardStatus("Complete setup to continue.", "error");
        return;
      }
      void skipSetupWizard();
    }
  });
  setupWizard.addEventListener("input", () => {
    persistWizardDraft();
  });
  setupWizard.addEventListener("change", () => {
    persistWizardDraft();
  });

  document.querySelectorAll(".wz-step-row").forEach((row) => {
    const target = Number(row.getAttribute("data-step"));
    row.addEventListener("click", () => {
      if (wizardState.busy) return;
      if (!Number.isFinite(target) || target === wizardState.step) return;
      if (target > wizardState.maxStepReached) return;
      renderWizardStep(target);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (wizardState.busy) return;
        if (!Number.isFinite(target) || target === wizardState.step) return;
        if (target > wizardState.maxStepReached) return;
        renderWizardStep(target);
      }
    });
  });

  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      void setLocalPreset(btn.dataset.preset);
    });
  });
}
