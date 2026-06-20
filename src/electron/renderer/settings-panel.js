import {
  apiKeyInput,
  apiKeyModal,
  apiKeyPeekBtn,
  apiKeyStatus,
  apiKeyTitle,
  autopasteCheck,
  showIndicatorCheck,
  launchAtLoginCheck,
  themeSelect,
  themeToggleBtn,
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
  customFields,
  fallbackCheck,
  vaultCaptureDestinationSelect,
  vaultCaptureFolderGroup,
  vaultCaptureFolderInput,
  vaultIncludeTapTalkCheck,
  vaultIncludeObsidianCheck,
  editingEnabledCheck,
  editingProviderSelect,
  editingLlmFields,
  editingEndpointInput,
  editingModelInput,
  editingApiKeyInput,
  editingCloudWarning,
  hotkeyProfileSelect,
  languageIncludeEnglishCheck,
  languageIncludeEnglishRow,
  languageModeSelect,
  localBeamSizeInput,
  localComputeTypeInput,
  localCpuThreadsInput,
  localDeviceInput,
  localModelInput,
  localPythonPathInput,
  localVadFilterCheck,
  localEngineSelect,
  whisperCppSection,
  localSection,
  whisperCppModelInput,
  whisperCppThreadsInput,
  whisperCppUseGpuCheck,
  whisperCppModelStatus,
  whisperCppProgress,
  modeCloudBtn,
  modeLocalBtn,
  saveToast,
  sidebarModeLabel,
  secretBackendSelect,
  settingsSection,
  tabCloudBtn,
  tabCloudPanel,
  tabEditingBtn,
  tabEditingPanel,
  tabGeneralBtn,
  tabGeneralPanel,
  tabLocalBtn,
  tabLocalPanel,
  tabVaultBtn,
  tabVaultPanel
} from "./dom.js";
import { state } from "./state.js";
import {
  cloudLanguageToSetting,
  localLanguageToSetting,
  isLocalEditEndpoint,
  modelToPreset,
  parseHints,
  parseLocalLanguageConfig,
  parseKeyValuePairs,
  parsePositiveIntOrFallback,
  populateLanguageSelect,
  profileFromPreferred,
  profileToHotkey,
  serializeKeyValuePairs
} from "./utils.js";

let saveTimer = null;
let flashTimer = null;

const THEME_LABELS = { system: "Theme: System", light: "Theme: Light", dark: "Theme: Dark" };

const DEFAULT_VAULT_SETTINGS = {
  captureDestination: "taptalk",
  captureFolder: "",
  includeTapTalkVault: true,
  knowledgeSources: []
};

// Keep model dropdowns tolerant of custom/unknown values stored in settings:
// if the saved model isn't one of the predefined options, inject it so the
// dropdown reflects (and preserves) the actual configured value.
function setSelectValuePreserving(select, value) {
  if (!select) return;
  const safe = typeof value === "string" ? value.trim() : "";
  if (!safe) {
    select.selectedIndex = select.options.length ? 0 : -1;
    return;
  }
  const exists = Array.from(select.options).some((opt) => opt.value === safe);
  if (!exists) {
    const opt = document.createElement("option");
    opt.value = safe;
    opt.textContent = `${safe} (custom)`;
    select.appendChild(opt);
  }
  select.value = safe;
}

export function syncThemeBtn(val) {
  if (!themeToggleBtn) return;
  const safe = val === "light" || val === "dark" ? val : "system";
  themeToggleBtn.dataset.themeCurrent = safe;
  themeToggleBtn.title = THEME_LABELS[safe];
  themeToggleBtn.setAttribute("aria-label", THEME_LABELS[safe]);
}

export function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === "light" || theme === "dark") {
    html.setAttribute("data-theme", theme);
  } else {
    html.removeAttribute("data-theme");
  }
}

export function parseCloudApiKeys(value) {
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

export function cloudApiKeysFromConfig(config) {
  const apiKeys = parseCloudApiKeys(config?.apiKeys);
  const preset = typeof config?.preset === "string" ? config.preset : "";
  const activeKey = typeof config?.apiKey === "string" ? config.apiKey.trim() : "";

  if (preset && activeKey) {
    apiKeys[preset] = activeKey;
  }

  return apiKeys;
}

export function cloneCloudFromPreset(
  presetName,
  keepApiKey,
  current,
  sourcePreset = current.preset
) {
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

export function fillCloudPresetOptions(select, current) {
  const presets = Object.keys(state.presets);
  select.innerHTML = "";

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

export function rebuildPresetOptions() {
  const current = state.settings?.cloud?.preset || "groq";
  fillCloudPresetOptions(cloudPresetSelect, current);
}

export function renderSettingsTab(tab) {
  state.activeSettingsTab = tab;

  tabGeneralBtn.classList.toggle("active", tab === "general");
  tabLocalBtn.classList.toggle("active", tab === "local");
  tabCloudBtn.classList.toggle("active", tab === "cloud");
  if (tabVaultBtn) tabVaultBtn.classList.toggle("active", tab === "vault");
  if (tabEditingBtn) tabEditingBtn.classList.toggle("active", tab === "editing");

  tabGeneralPanel.classList.toggle("hidden", tab !== "general");
  tabLocalPanel.classList.toggle("hidden", tab !== "local");
  tabCloudPanel.classList.toggle("hidden", tab !== "cloud");
  if (tabVaultPanel) tabVaultPanel.classList.toggle("hidden", tab !== "vault");
  if (tabEditingPanel) tabEditingPanel.classList.toggle("hidden", tab !== "editing");
}

export function renderMode(mode) {
  modeLocalBtn.classList.toggle("active", mode === "local");
  modeCloudBtn.classList.toggle("active", mode === "cloud");
}

function renderCloud(settings) {
  cloudPresetSelect.value = settings.cloud.preset;
  cloudModelInput.value = settings.cloud.model;

  const activeApiKey =
    cloudApiKeysFromConfig(settings.cloud)[settings.cloud.preset] || settings.cloud.apiKey;
  const hasKey = typeof activeApiKey === "string" && activeApiKey.trim().length > 0;
  apiKeyStatus.textContent = hasKey ? "Key set" : "No key";

  cloudUrlInput.value = settings.cloud.url;
  cloudAuthHeaderInput.value = settings.cloud.authHeader;
  cloudAuthValueInput.value = settings.cloud.authValueTemplate;
  cloudBodyFormatSelect.value = settings.cloud.bodyFormat;
  cloudAudioFieldInput.value = settings.cloud.audioFieldName;
  cloudQueryParamsInput.value = serializeKeyValuePairs(settings.cloud.queryParams);
  cloudExtraFormFieldsInput.value = serializeKeyValuePairs(settings.cloud.extraFormFields);
  cloudTextFieldHintsInput.value = (settings.cloud.textFieldHints || []).join(", ");

  customFields.classList.toggle("hidden", settings.cloud.preset !== "custom");
}

export function renderSettings(settings) {
  state.settings = settings;

  renderMode(settings.mode);

  const localLanguage = parseLocalLanguageConfig(settings.localFasterWhisper.language);
  const cloudLanguage = parseLocalLanguageConfig(settings.cloud.language);
  const baseLanguage =
    localLanguage.baseLanguage !== "auto" || localLanguage.includeEnglish
      ? localLanguage.baseLanguage
      : cloudLanguage.baseLanguage;
  populateLanguageSelect(languageModeSelect, baseLanguage);
  languageIncludeEnglishCheck.checked = localLanguage.includeEnglish;

  hotkeyProfileSelect.value = profileFromPreferred(settings.hotkey.preferred);
  secretBackendSelect.value = settings.cloudSecretBackend || "settings";
  if (themeSelect) {
    themeSelect.value = settings.theme || "system";
    applyTheme(settings.theme || "system");
  }
  const themeVal = settings.theme || "system";
  syncThemeBtn(themeVal);
  if (sidebarModeLabel) {
    sidebarModeLabel.textContent = settings.mode === "cloud" ? "Cloud Mode" : "Local Mode";
  }
  autopasteCheck.checked = settings.autoPaste;
  if (showIndicatorCheck) showIndicatorCheck.checked = settings.showIndicator !== false;
  if (launchAtLoginCheck) launchAtLoginCheck.checked = settings.launchAtLogin === true;
  fallbackCheck.checked = settings.fallback.enabled;
  renderVault(settings);

  const active = modelToPreset(settings.localFasterWhisper.model);
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === active);
  });

  localPythonPathInput.value = settings.localFasterWhisper.pythonPath;
  setSelectValuePreserving(localModelInput, settings.localFasterWhisper.model);
  localDeviceInput.value = settings.localFasterWhisper.device;
  localComputeTypeInput.value = settings.localFasterWhisper.computeType;
  localBeamSizeInput.value = String(settings.localFasterWhisper.beamSize);
  localCpuThreadsInput.value = String(settings.localFasterWhisper.cpuThreads);
  localVadFilterCheck.checked = !!settings.localFasterWhisper.vadFilter;

  renderWhisperCpp(settings);

  renderCloud(settings);
  renderEditing(settings);
  renderSettingsTab(state.activeSettingsTab || "general");
}

function vaultSettings(settings) {
  return settings.vault || DEFAULT_VAULT_SETTINGS;
}

function pathLabel(value) {
  return value.split(/[\\/]/).filter(Boolean).pop() || value;
}

// Obsidian folder is needed when captures go there OR it's an AI context source.
function vaultNeedsObsidianFolder() {
  const captureToObsidian = vaultCaptureDestinationSelect?.value === "folder";
  const contextObsidian = vaultIncludeObsidianCheck?.checked ?? false;
  return captureToObsidian || contextObsidian;
}

function renderVault(settings) {
  const vault = vaultSettings(settings);
  const knowledgeSources = vault.knowledgeSources || [];
  const savedPath = vault.captureFolder || knowledgeSources.find((source) => source?.path)?.path || "";
  if (vaultCaptureDestinationSelect) {
    vaultCaptureDestinationSelect.value = vault.captureDestination === "folder" ? "folder" : "taptalk";
  }
  if (vaultCaptureFolderInput) {
    vaultCaptureFolderInput.value = savedPath;
  }
  if (vaultIncludeTapTalkCheck) {
    vaultIncludeTapTalkCheck.checked = vault.includeTapTalkVault !== false;
  }
  if (vaultIncludeObsidianCheck) {
    vaultIncludeObsidianCheck.checked = knowledgeSources.some(
      (source) => source?.path && source?.enabled !== false
    );
  }
  syncVaultFields();
}

export function syncVaultFields() {
  if (!vaultCaptureFolderGroup) return;
  // Demand-driven: the folder field appears when something points at Obsidian.
  // Hiding never clears the value, so a path given earlier is remembered.
  vaultCaptureFolderGroup.classList.toggle("hidden", !vaultNeedsObsidianFolder());
}

function vaultFromInputs() {
  const current = vaultSettings(state.settings || {});
  const captureToObsidian = vaultCaptureDestinationSelect?.value === "folder";
  const contextObsidian = vaultIncludeObsidianCheck?.checked ?? false;
  const folder = vaultCaptureFolderInput?.value.trim() || "";
  const existing = (current.knowledgeSources || []).find((source) => source?.path === folder);
  // One shared folder feeds both capture and context. Keep the source entry
  // whenever a path exists so it round-trips; `enabled` carries the context flag.
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
    includeTapTalkVault: vaultIncludeTapTalkCheck ? vaultIncludeTapTalkCheck.checked : true,
    knowledgeSources
  };
}

export function syncEngineSection() {
  if (!localEngineSelect) return;
  const isCpp = localEngineSelect.value === "whisper-cpp";
  if (whisperCppSection) whisperCppSection.classList.toggle("hidden", !isCpp);
  if (localSection) localSection.classList.toggle("hidden", isCpp);
  if (languageIncludeEnglishRow) languageIncludeEnglishRow.classList.toggle("hidden", isCpp);
}

function renderWhisperCpp(settings) {
  const cfg = settings.localWhisperCpp || {
    binaryPath: "",
    model: "small",
    language: "pl",
    threads: 4,
    useGpu: true
  };
  if (localEngineSelect) localEngineSelect.value = settings.localEngine || "faster-whisper";
  setSelectValuePreserving(whisperCppModelInput, cfg.model || "small");
  if (whisperCppThreadsInput) whisperCppThreadsInput.value = String(cfg.threads ?? 4);
  if (whisperCppUseGpuCheck) whisperCppUseGpuCheck.checked = cfg.useGpu !== false;
  if (whisperCppModelStatus) whisperCppModelStatus.textContent = "Unknown";
  syncEngineSection();
}

function whisperCppFromInputs(language) {
  const base = state.settings?.localWhisperCpp || {
    binaryPath: "",
    model: "small",
    language: "pl",
    threads: 4,
    useGpu: true
  };
  return {
    ...base,
    model: (whisperCppModelInput?.value.trim()) || base.model,
    threads: parsePositiveIntOrFallback(whisperCppThreadsInput?.value, base.threads),
    useGpu: whisperCppUseGpuCheck ? whisperCppUseGpuCheck.checked : base.useGpu,
    language: language || base.language
  };
}

let whisperCppPreparing = false;

export async function prepareWhisperCppModel() {
  if (whisperCppPreparing) return;
  const model = (whisperCppModelInput?.value.trim()) || "small";
  whisperCppPreparing = true;

  const setStatus = (text) => {
    if (whisperCppModelStatus) whisperCppModelStatus.textContent = text;
  };
  const setProgress = (text) => {
    if (!whisperCppProgress) return;
    if (text) {
      whisperCppProgress.style.display = "";
      whisperCppProgress.textContent = text;
    } else {
      whisperCppProgress.style.display = "none";
    }
  };

  setStatus("Working…");
  setProgress(`Preparing "${model}"…`);

  const stopProgress = window.tapTalk.onSetupProgress((msg) => setProgress(msg));
  try {
    // Persist the chosen model first so the engine and download agree.
    await doSave();
    const result = await window.tapTalk.prepareWhisperCpp(model);
    setStatus(result?.ok ? "Ready" : "Failed");
    setProgress(result?.ok ? `Model "${model}" ready.` : "Preparation failed.");
  } catch (error) {
    setStatus("Failed");
    setProgress(error?.message ? String(error.message) : "Preparation failed.");
  } finally {
    if (typeof stopProgress === "function") stopProgress();
    whisperCppPreparing = false;
  }
}

export function syncEditingFields() {
  if (!editingProviderSelect) return;
  const isLlm = editingProviderSelect.value === "openai-compatible";
  if (editingLlmFields) editingLlmFields.style.display = isLlm ? "" : "none";

  const endpoint = editingEndpointInput?.value || "";
  const showWarning = isLlm && endpoint.trim().length > 0 && !isLocalEditEndpoint(endpoint);
  if (editingCloudWarning) {
    editingCloudWarning.style.display = showWarning ? "" : "none";
  }
}

function renderEditing(settings) {
  const editing = settings.editing || {
    enabled: false,
    provider: "rule-based",
    endpoint: "",
    model: "",
    apiKey: ""
  };
  if (editingEnabledCheck) editingEnabledCheck.checked = editing.enabled !== false;
  if (editingProviderSelect) editingProviderSelect.value = editing.provider || "rule-based";
  if (editingEndpointInput) editingEndpointInput.value = editing.endpoint || "";
  if (editingModelInput) editingModelInput.value = editing.model || "";
  if (editingApiKeyInput) editingApiKeyInput.value = editing.apiKey || "";
  syncEditingFields();
}

function editingFromInputs() {
  return {
    enabled: editingEnabledCheck ? editingEnabledCheck.checked : true,
    provider: editingProviderSelect ? editingProviderSelect.value : "rule-based",
    endpoint: editingEndpointInput ? editingEndpointInput.value.trim() : "",
    model: editingModelInput ? editingModelInput.value.trim() : "",
    apiKey: editingApiKeyInput ? editingApiKeyInput.value.trim() : ""
  };
}

export function flash() {
  clearTimeout(flashTimer);
  saveToast.classList.add("show");
  flashTimer = setTimeout(() => saveToast.classList.remove("show"), 1000);
}

function selectedLanguageConfig() {
  return {
    baseLanguage: languageModeSelect.value || "auto",
    includeEnglish: languageIncludeEnglishCheck.checked
  };
}

function cloudFromInputs(languageConfig) {
  const current = state.settings.cloud;
  const selectedPreset = cloudPresetSelect.value || current.preset;

  let cloud = current;
  if (selectedPreset !== current.preset) {
    cloud = cloneCloudFromPreset(selectedPreset, current.apiKey, current);
  }

  cloud = {
    ...cloud,
    model: cloudModelInput.value.trim() || cloud.model,
    language: cloudLanguageToSetting(languageConfig.baseLanguage, languageConfig.includeEnglish)
  };

  if (cloud.preset === "custom") {
    cloud = {
      ...cloud,
      url: cloudUrlInput.value.trim(),
      authHeader: cloudAuthHeaderInput.value.trim(),
      authValueTemplate: cloudAuthValueInput.value.trim(),
      bodyFormat: cloudBodyFormatSelect.value,
      audioFieldName: cloudAudioFieldInput.value.trim(),
      queryParams: parseKeyValuePairs(cloudQueryParamsInput.value),
      extraFormFields: parseKeyValuePairs(cloudExtraFormFieldsInput.value),
      textFieldHints: parseHints(cloudTextFieldHintsInput.value)
    };
  }

  return cloud;
}

export async function doSave() {
  if (!state.settings) return;

  const isCpp = localEngineSelect?.value === "whisper-cpp";
  const rawLangConfig = selectedLanguageConfig();
  const languageConfig = isCpp ? { ...rawLangConfig, includeEnglish: false } : rawLangConfig;
  const localLanguage = localLanguageToSetting(
    languageConfig.baseLanguage,
    languageConfig.includeEnglish
  );
  const cloud = cloudFromInputs(languageConfig);

  const next = await window.tapTalk.updateSettings({
    mode: modeLocalBtn.classList.contains("active") ? "local" : "cloud",
    theme: themeSelect ? themeSelect.value : undefined,
    showIndicator: showIndicatorCheck ? showIndicatorCheck.checked : undefined,
    launchAtLogin: launchAtLoginCheck ? launchAtLoginCheck.checked : undefined,
    autoPaste: autopasteCheck.checked,
    cloudSecretBackend: secretBackendSelect.value === "settings" ? "settings" : "safeStorage",
    fallback: { enabled: fallbackCheck.checked },
    editing: editingFromInputs(),
    vault: vaultFromInputs(),
    hotkey: profileToHotkey(hotkeyProfileSelect.value),
    cloud,
    localEngine: localEngineSelect ? localEngineSelect.value : undefined,
    localWhisperCpp: whisperCppFromInputs(localLanguage),
    localFasterWhisper: {
      ...state.settings.localFasterWhisper,
      pythonPath: localPythonPathInput.value.trim() || state.settings.localFasterWhisper.pythonPath,
      model: localModelInput.value.trim() || state.settings.localFasterWhisper.model,
      device: localDeviceInput.value.trim() || state.settings.localFasterWhisper.device,
      computeType:
        localComputeTypeInput.value.trim() || state.settings.localFasterWhisper.computeType,
      beamSize: parsePositiveIntOrFallback(
        localBeamSizeInput.value,
        state.settings.localFasterWhisper.beamSize
      ),
      cpuThreads: parsePositiveIntOrFallback(
        localCpuThreadsInput.value,
        state.settings.localFasterWhisper.cpuThreads
      ),
      vadFilter: localVadFilterCheck.checked,
      language: localLanguage
    }
  });

  renderSettings(next);
  flash();
}

export function scheduleAutoSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doSave, 350);
}

export async function setLocalPreset(name) {
  if (!state.settings) return;

  const presets = {
    ultrafast: {
      model: "tiny",
      device: "cpu",
      computeType: "int8",
      beamSize: 1,
      vadFilter: true,
      cpuThreads: 4
    },
    balanced: {
      model: "small",
      device: "cpu",
      computeType: "int8",
      beamSize: 1,
      vadFilter: true,
      cpuThreads: 4
    },
    quality: {
      model: "medium",
      device: "cpu",
      computeType: "int8",
      beamSize: 3,
      vadFilter: true,
      cpuThreads: 4
    }
  };

  const languageConfig = selectedLanguageConfig();

  const next = await window.tapTalk.updateSettings({
    localFasterWhisper: {
      ...state.settings.localFasterWhisper,
      ...presets[name],
      language: localLanguageToSetting(
        languageConfig.baseLanguage,
        languageConfig.includeEnglish
      )
    }
  });

  renderSettings(next);
  flash();
}

export function openApiKeyModal() {
  const preset = cloudPresetSelect.value;
  const apiKeys = cloudApiKeysFromConfig(state.settings?.cloud);
  apiKeyTitle.textContent = `Enter API key for ${presetLabel(preset)}`;
  apiKeyInput.value = apiKeys[preset] || "";
  apiKeyModal.classList.remove("hidden");
  setTimeout(() => apiKeyInput.focus(), 0);
}

export function closeApiKeyModal() {
  apiKeyInput.type = "password";
  apiKeyPeekBtn.classList.remove("active");
  apiKeyModal.classList.add("hidden");
}

export function isSettingsOpen() {
  return settingsSection.classList.contains("open");
}

export function openSettings() {
  settingsSection.classList.add("open");
}

export function closeSettings() {
  settingsSection.classList.remove("open");
}

export async function saveApiKey() {
  if (!state.settings) return;

  const key = apiKeyInput.value.trim();
  const preset = state.settings.cloud.preset;
  const apiKeys = cloudApiKeysFromConfig(state.settings.cloud);
  if (preset) {
    if (key) {
      apiKeys[preset] = key;
    } else {
      delete apiKeys[preset];
    }
  }

  const next = await window.tapTalk.updateSettings({
    cloud: {
      ...state.settings.cloud,
      apiKey: key,
      apiKeys
    }
  });

  renderSettings(next);
  closeApiKeyModal();
  flash();
}
