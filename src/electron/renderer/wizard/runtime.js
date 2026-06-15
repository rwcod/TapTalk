import {
  wizardInstallPackageCheck,
  wizardPrepareOnSaveCheck,
  wizardPythonPathInput
} from "./dom.js";
import { setDepStatus, setWizardBusy, setWizardStatus } from "./render.js";
import { userFacingErrorMessage } from "../utils.js";

export function createWizardRuntimeController({
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
}) {
  function isWhisperCppEngine() {
    return typeof wizardEngineValue === "function" && wizardEngineValue() === "whisper-cpp";
  }

  // Reflect model-cache state on the "Model" checklist row. A missing model is
  // not a failure — it's auto-downloaded on Save, so we show it as pending.
  function setModelDepStatus(modelName, hasModel) {
    const el = document.getElementById("wizardDepModel");
    if (!el) return;
    if (hasModel === true) {
      setDepStatus(el, "ok", `Downloaded (${modelName})`);
    } else if (hasModel === false) {
      setDepStatus(el, "pending", `Will download on Save (${modelName})`);
    } else {
      setDepStatus(el, "working", "Checking...");
    }
  }

  async function probeWizardWhisperCpp() {
    const selectedModel =
      wizardLocalModelValue() || state.settings?.localWhisperCpp?.model || "small";
    setWizardStatus("Checking whisper.cpp engine...");
    setDepStatus(document.getElementById("wizardDepWhisperCpp"), "working", "Checking...");
    setDepStatus(document.getElementById("wizardDepFfmpeg"), "working", "Checking...");
    setDepStatus(document.getElementById("wizardDepModel"), "working", "Checking...");

    try {
      const probe = await window.tapTalk.probeWhisperCpp(selectedModel);

      setDepStatus(
        document.getElementById("wizardDepFfmpeg"),
        probe.ffmpegOk ? "ok" : "fail",
        probe.ffmpegOk ? "Found" : "Not found — install via Homebrew: brew install ffmpeg"
      );
      setDepStatus(
        document.getElementById("wizardDepWhisperCpp"),
        probe.binaryOk ? "ok" : "fail",
        probe.binaryOk ? "Native engine ready" : "Not found — run `npm run build`"
      );
      setModelDepStatus(probe.modelChecked || selectedModel, probe.hasModel);

      // Default the download checkbox on when the model isn't cached yet.
      wizardPrepareOnSaveCheck.checked = probe.binaryOk && probe.hasModel === false;

      const modelName = probe.modelChecked || selectedModel;
      if (probe.ffmpegOk && probe.binaryOk && probe.hasModel === true) {
        setWizardStatus(
          `Everything is ready (model "${modelName}" already on disk). Save will be instant.`,
          "success"
        );
      } else if (probe.ffmpegOk && probe.binaryOk && probe.hasModel === false) {
        setWizardStatus(
          `Model "${modelName}" not yet downloaded. Saving now will pull it (a few minutes).`,
          ""
        );
      } else {
        const missing = [];
        if (!probe.ffmpegOk) missing.push("ffmpeg");
        if (!probe.binaryOk) missing.push("whisper.cpp engine");
        setWizardStatus("Missing: " + missing.join(", ") + ". See details above.", "error");
      }
    } catch (error) {
      setWizardStatus(userFacingErrorMessage(error), "error");
    }
  }

  async function probeWizardRuntime() {
    if (isWhisperCppEngine()) {
      return probeWizardWhisperCpp();
    }
    const pythonPath = wizardPythonPathInput.value.trim() || "python3";
    setWizardStatus("Checking system requirements...");
    setDepStatus(document.getElementById("wizardDepPython"), "working", "Checking...");
    setDepStatus(document.getElementById("wizardDepFfmpeg"), "working", "Checking...");
    setDepStatus(document.getElementById("wizardDepWhisper"), "working", "Checking...");
    setDepStatus(document.getElementById("wizardDepModel"), "working", "Checking...");

    const selectedModel = wizardLocalModelValue() || state.settings?.localFasterWhisper?.model || "";

    try {
      let probe = await window.tapTalk.probeLocalRuntime(pythonPath, selectedModel);

      if (probe.ffmpegOk) {
        setDepStatus(document.getElementById("wizardDepFfmpeg"), "ok", "Found");
      } else {
        setDepStatus(
          document.getElementById("wizardDepFfmpeg"),
          "fail",
          "Not found — install via Homebrew: brew install ffmpeg"
        );
      }

      if (!probe.pythonOk) {
        setDepStatus(
          document.getElementById("wizardDepPython"),
          "working",
          "Not found, installing automatically..."
        );
        setWizardStatus("Python not found on your system. Downloading and installing...");
        try {
          const installedPath = await window.tapTalk.findOrInstallPython();
          wizardPythonPathInput.value = installedPath;
          persistWizardDraft();
          probe = await window.tapTalk.probeLocalRuntime(installedPath, selectedModel);
          setDepStatus(
            document.getElementById("wizardDepPython"),
            "ok",
            "Installed: " + installedPath
          );
        } catch (installError) {
          setDepStatus(
            document.getElementById("wizardDepPython"),
            "fail",
            userFacingErrorMessage(installError)
          );
          setWizardStatus(
            "Python auto-install failed. You can install it manually and try again.",
            "error"
          );
          setDepStatus(document.getElementById("wizardDepWhisper"), "pending", "Requires Python");
          return;
        }
      } else {
        setDepStatus(document.getElementById("wizardDepPython"), "ok", "Found: " + pythonPath);
      }

      const canInstallLater =
        wizardInstallPackageCheck.checked && wizardPrepareOnSaveCheck.checked;
      if (probe.fasterWhisperOk) {
        const ver = probe.fasterWhisperVersion ? " v" + probe.fasterWhisperVersion : "";
        setDepStatus(document.getElementById("wizardDepWhisper"), "ok", "Found" + ver);
      } else if (canInstallLater) {
        setDepStatus(
          document.getElementById("wizardDepWhisper"),
          "pending",
          "Will be installed when you save setup"
        );
      } else {
        setDepStatus(
          document.getElementById("wizardDepWhisper"),
          "fail",
          "Not found — enable 'Install faster-whisper' checkbox below"
        );
      }

      // Smart-default the install/download checkboxes off what's already cached.
      // The user can still override, but no one is forced to opt out of a
      // multi-minute download just because faster-whisper happened to land
      // their model years ago.
      wizardInstallPackageCheck.checked = !probe.fasterWhisperOk;
      wizardPrepareOnSaveCheck.checked =
        probe.fasterWhisperOk && probe.hasModel === false;

      const modelReady = probe.hasModel === true;
      const modelMissing = probe.hasModel === false;
      const modelName = probe.modelChecked || selectedModel;
      setModelDepStatus(modelName, probe.hasModel);
      if (probe.ffmpegOk && probe.pythonOk && probe.fasterWhisperOk && modelReady) {
        setWizardStatus(
          `Everything is ready (model "${modelName}" already on disk). Save will be instant.`,
          "success"
        );
      } else if (probe.ffmpegOk && probe.pythonOk && probe.fasterWhisperOk && modelMissing) {
        setWizardStatus(
          `Model "${modelName}" not yet downloaded. Saving now will pull it (a few minutes).`,
          ""
        );
      } else if (probe.ffmpegOk && probe.pythonOk && (probe.fasterWhisperOk || canInstallLater)) {
        setWizardStatus("All requirements met! You can proceed.", "success");
      } else {
        const missing = [];
        if (!probe.ffmpegOk) missing.push("ffmpeg");
        if (!probe.pythonOk) missing.push("Python");
        if (!probe.fasterWhisperOk && !canInstallLater) missing.push("faster-whisper");
        setWizardStatus("Missing: " + missing.join(", ") + ". See details above.", "error");
      }
    } catch (error) {
      setWizardStatus(userFacingErrorMessage(error), "error");
    }
  }

  async function testWizardLocalSetup() {
    const pythonPath = wizardPythonPathInput.value.trim() || "python3";
    setWizardBusy(true);
    setWizardStatus("Running local setup test...");
    setDepStatus(document.getElementById("wizardDepPython"), "working", "Testing...");
    setDepStatus(document.getElementById("wizardDepFfmpeg"), "working", "Testing...");
    setDepStatus(document.getElementById("wizardDepWhisper"), "working", "Testing...");

    try {
      const probe = await window.tapTalk.probeLocalRuntime(pythonPath);

      setDepStatus(
        document.getElementById("wizardDepPython"),
        probe.pythonOk ? "ok" : "fail",
        probe.pythonOk ? "Found: " + pythonPath : "Not found"
      );
      setDepStatus(
        document.getElementById("wizardDepFfmpeg"),
        probe.ffmpegOk ? "ok" : "fail",
        probe.ffmpegOk ? "Found" : "Not found"
      );

      if (!probe.ffmpegOk || !probe.pythonOk) {
        setWizardStatus("Test failed. See checklist above for details.", "error");
        setDepStatus(
          document.getElementById("wizardDepWhisper"),
          "pending",
          "Requires Python and ffmpeg"
        );
        return;
      }

      const canInstallLater =
        wizardInstallPackageCheck.checked && wizardPrepareOnSaveCheck.checked;
      if (probe.fasterWhisperOk) {
        const ver = probe.fasterWhisperVersion ? " v" + probe.fasterWhisperVersion : "";
        setDepStatus(document.getElementById("wizardDepWhisper"), "ok", "Found" + ver);
      } else if (canInstallLater) {
        setDepStatus(
          document.getElementById("wizardDepWhisper"),
          "pending",
          "Will be installed when you save setup"
        );
      } else {
        setDepStatus(document.getElementById("wizardDepWhisper"), "fail", "Not found");
        setWizardStatus(
          "Test failed: faster-whisper missing. Enable install checkboxes below.",
          "error"
        );
        return;
      }

      const fnHint =
        isMacOS() && isFnHotkeyPreferred(state.settings)
          ? " If Fn still does not react, use 'Enable Fn permissions in macOS'."
          : "";
      setWizardStatus("Test passed! All dependencies are available." + fnHint, "success");
    } catch (error) {
      setWizardStatus("Test failed: " + userFacingErrorMessage(error), "error");
    } finally {
      setWizardBusy(false);
    }
  }

  async function ensureWizardLocalRuntimeReadyForSave(pythonPath) {
    setWizardBusy(true);
    setWizardStatus("Verifying dependencies before saving...");
    setDepStatus(document.getElementById("wizardDepPython"), "working", "Verifying...");
    setDepStatus(document.getElementById("wizardDepFfmpeg"), "working", "Verifying...");
    setDepStatus(document.getElementById("wizardDepWhisper"), "working", "Verifying...");

    try {
      let effectivePythonPath = pythonPath;
      let probe = await window.tapTalk.probeLocalRuntime(effectivePythonPath);

      if (probe.ffmpegOk) {
        setDepStatus(document.getElementById("wizardDepFfmpeg"), "ok", "Found");
      } else {
        setDepStatus(document.getElementById("wizardDepFfmpeg"), "fail", "Not found");
      }

      if (!probe.pythonOk) {
        setDepStatus(
          document.getElementById("wizardDepPython"),
          "working",
          "Not found, installing..."
        );
        setWizardStatus("Python not found. Downloading and installing...");
        try {
          effectivePythonPath = await window.tapTalk.findOrInstallPython();
          wizardPythonPathInput.value = effectivePythonPath;
          persistWizardDraft();
          probe = await window.tapTalk.probeLocalRuntime(effectivePythonPath);
          setDepStatus(
            document.getElementById("wizardDepPython"),
            "ok",
            "Installed: " + effectivePythonPath
          );
        } catch (installError) {
          setDepStatus(
            document.getElementById("wizardDepPython"),
            "fail",
            userFacingErrorMessage(installError)
          );
          setWizardStatus("Python auto-install failed.", "error");
          return false;
        }
      } else {
        setDepStatus(document.getElementById("wizardDepPython"), "ok", "Found");
      }

      if (!probe.ffmpegOk || !probe.pythonOk) {
        setWizardStatus("Required dependencies are missing. See checklist above.", "error");
        return false;
      }

      const canInstallLater =
        wizardInstallPackageCheck.checked && wizardPrepareOnSaveCheck.checked;
      if (!probe.fasterWhisperOk && !canInstallLater) {
        setDepStatus(document.getElementById("wizardDepWhisper"), "fail", "Not found");
        setWizardStatus(
          "faster-whisper is missing. Enable 'Install faster-whisper' and 'Prepare model' checkboxes.",
          "error"
        );
        return false;
      }

      if (probe.fasterWhisperOk) {
        setDepStatus(document.getElementById("wizardDepWhisper"), "ok", "Found");
      } else {
        setDepStatus(
          document.getElementById("wizardDepWhisper"),
          "pending",
          "Will be installed now..."
        );
      }

      return true;
    } catch (error) {
      setWizardStatus(userFacingErrorMessage(error), "error");
      return false;
    } finally {
      setWizardBusy(false);
    }
  }

  async function prepareWizardLocalModel() {
    if (!state.settings) return;

    const pythonPath =
      wizardPythonPathInput.value.trim() || state.settings.localFasterWhisper.pythonPath;
    const model = wizardLocalModelValue();
    if (!pythonPath) {
      setWizardStatus("Set python executable first.", "error");
      return;
    }
    if (!model) {
      setWizardStatus("Choose local model first.", "error");
      return;
    }

    setWizardBusy(true);
    setWizardStatus("Preparing local model. This may take a few minutes...");

    try {
      let effectivePythonPath = pythonPath;
      const result = await window.tapTalk.prepareLocalWhisper({
        pythonPath,
        model,
        device: state.settings.localFasterWhisper.device,
        computeType: state.settings.localFasterWhisper.computeType,
        cpuThreads: state.settings.localFasterWhisper.cpuThreads,
        installPackage: wizardInstallPackageCheck.checked
      });

      if (result.pythonPath) {
        wizardPythonPathInput.value = result.pythonPath;
        effectivePythonPath = result.pythonPath;
        persistWizardDraft();
      }

      setWizardStatus(result.steps.join("\n"), "success");
      return effectivePythonPath;
    } catch (error) {
      const message = userFacingErrorMessage(error);
      setWizardStatus(message, "error");
      throw error;
    } finally {
      setWizardBusy(false);
    }
  }

  async function prepareWizardWhisperCpp() {
    const model = wizardLocalModelValue() || state.settings?.localWhisperCpp?.model;
    if (!model) {
      setWizardStatus("Choose a model first.", "error");
      return;
    }

    setWizardBusy(true);
    setWizardStatus("Preparing whisper.cpp model. This may take a few minutes...");
    setDepStatus(document.getElementById("wizardDepWhisperCpp"), "working", "Preparing...");

    const stopProgress = window.tapTalk.onSetupProgress((msg) => setWizardStatus(msg));
    try {
      const result = await window.tapTalk.prepareWhisperCpp(model);
      setDepStatus(document.getElementById("wizardDepWhisperCpp"), "ok", "Ready");
      setWizardStatus(result.steps.join("\n"), "success");
    } catch (error) {
      const message = userFacingErrorMessage(error);
      setDepStatus(document.getElementById("wizardDepWhisperCpp"), "fail", "Failed");
      setWizardStatus(message, "error");
      throw error;
    } finally {
      if (typeof stopProgress === "function") stopProgress();
      setWizardBusy(false);
    }
  }

  async function ensureWizardWhisperCppReadyForSave() {
    setWizardBusy(true);
    setWizardStatus("Verifying whisper.cpp before saving...");
    setDepStatus(document.getElementById("wizardDepWhisperCpp"), "working", "Verifying...");
    setDepStatus(document.getElementById("wizardDepFfmpeg"), "working", "Verifying...");
    try {
      const model = wizardLocalModelValue() || state.settings?.localWhisperCpp?.model || "small";
      const probe = await window.tapTalk.probeWhisperCpp(model);
      setDepStatus(
        document.getElementById("wizardDepFfmpeg"),
        probe.ffmpegOk ? "ok" : "fail",
        probe.ffmpegOk ? "Found" : "Not found"
      );
      setDepStatus(
        document.getElementById("wizardDepWhisperCpp"),
        probe.binaryOk ? "ok" : "fail",
        probe.binaryOk ? "Ready" : "Not found"
      );
      if (!probe.ffmpegOk || !probe.binaryOk) {
        setWizardStatus("Required dependencies are missing. See checklist above.", "error");
        return false;
      }
      return true;
    } catch (error) {
      setWizardStatus(userFacingErrorMessage(error), "error");
      return false;
    } finally {
      setWizardBusy(false);
    }
  }

  async function runSaveLocalChecks(pythonPath) {
    renderWizardMode("local");
    const runtimeReady = isWhisperCppEngine()
      ? await ensureWizardWhisperCppReadyForSave()
      : await ensureWizardLocalRuntimeReadyForSave(pythonPath);
    if (!runtimeReady) {
      // Land the user on Step 2 so the checklist is visible alongside the error.
      renderWizardStep(2);
      return false;
    }
    return true;
  }

  return {
    ensureWizardLocalRuntimeReadyForSave,
    prepareWizardLocalModel,
    prepareWizardWhisperCpp,
    probeWizardRuntime,
    runSaveLocalChecks,
    testWizardLocalSetup
  };
}
