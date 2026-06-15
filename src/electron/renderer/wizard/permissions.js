import {
  wizardPermAccessibility,
  wizardPermAccessibilityBtn,
  wizardPermInputMonitoring,
  wizardPermInputMonitoringBtn,
  wizardPermMicrophone,
  wizardPermMicrophoneBtn
} from "./dom.js";
import { setWizardPermStatus } from "./render.js";
import { userFacingErrorMessage } from "../utils.js";

function setPermItemStatus(item, status, statusText) {
  if (!item) return;
  const icon = item.querySelector(".wizard-dep-icon");
  const statusEl = item.querySelector(".wizard-dep-status");
  if (icon) {
    icon.classList.remove("ok", "fail", "pending", "working");
    icon.classList.add(status);
  }
  if (statusEl && statusText) {
    statusEl.textContent = statusText;
  }
}

export function createWizardPermissionsController({
  isMacOS,
  renderStatus,
  state,
  onAllRequiredGranted = () => undefined
}) {
  async function checkWizardPermissions(options = {}) {
    if (!isMacOS()) return;
    const probeFnListener = options.probeFnListener === true;

    try {
      const perms = await window.tapTalk.checkPermissions({
        probeFnListener
      });

      let liveStatus = state.status;
      try {
        liveStatus = await window.tapTalk.getStatus();
      } catch {
        // keep last known status
      }
      if (liveStatus) {
        renderStatus(liveStatus);
      }
      if (perms.microphone === "granted") {
        setPermItemStatus(wizardPermMicrophone, "ok", "Granted");
        if (wizardPermMicrophoneBtn) wizardPermMicrophoneBtn.disabled = true;
      } else if (perms.microphone === "denied" || perms.microphone === "restricted") {
        setPermItemStatus(
          wizardPermMicrophone,
          "fail",
          "Denied - open System Settings to enable"
        );
        if (wizardPermMicrophoneBtn) {
          wizardPermMicrophoneBtn.disabled = false;
          wizardPermMicrophoneBtn.textContent = "Open Settings";
        }
      } else {
        setPermItemStatus(wizardPermMicrophone, "pending", "Not yet requested");
        if (wizardPermMicrophoneBtn) {
          wizardPermMicrophoneBtn.disabled = false;
          wizardPermMicrophoneBtn.textContent = "Grant Access";
        }
      }

      if (!perms.fnRequired) {
        setPermItemStatus(
          wizardPermAccessibility,
          "ok",
          "Not required (Fn hotkey disabled)"
        );
        if (wizardPermAccessibilityBtn) wizardPermAccessibilityBtn.disabled = true;
        setPermItemStatus(
          wizardPermInputMonitoring,
          "ok",
          "Not required (Fn hotkey disabled)"
        );
        if (wizardPermInputMonitoringBtn) wizardPermInputMonitoringBtn.disabled = true;
        if (perms.microphone === "granted") {
          setWizardPermStatus("All set — you're good to go.", "success");
          onAllRequiredGranted();
        }
        return;
      }

      if (perms.accessibility) {
        setPermItemStatus(wizardPermAccessibility, "ok", "Enabled");
        if (wizardPermAccessibilityBtn) wizardPermAccessibilityBtn.disabled = true;
      } else {
        setPermItemStatus(wizardPermAccessibility, "pending", "Required for Fn key");
        if (wizardPermAccessibilityBtn) wizardPermAccessibilityBtn.disabled = false;
      }

      if (perms.fnState === "needs-accessibility") {
        setPermItemStatus(
          wizardPermInputMonitoring,
          "pending",
          "Enable Accessibility first"
        );
        if (wizardPermInputMonitoringBtn) wizardPermInputMonitoringBtn.disabled = false;
        setWizardPermStatus(
          "Accessibility is still required. Enable it in System Settings, then click Refresh status."
        );
        return;
      }

      if (perms.fnState === "needs-input-monitoring-or-restart") {
        const reason = perms.fnFailureReason ? ` (${perms.fnFailureReason})` : "";
        setPermItemStatus(
          wizardPermInputMonitoring,
          "pending",
          "Pending (after enabling, restart app and click Refresh)"
        );
        if (wizardPermInputMonitoringBtn) wizardPermInputMonitoringBtn.disabled = false;
        setWizardPermStatus(
          `Input Monitoring may require app restart. After restart, open wizard and click Refresh status.${reason}`
        );
        return;
      }

      setPermItemStatus(wizardPermInputMonitoring, "ok", "Enabled (Fn listener active)");
      if (wizardPermInputMonitoringBtn) wizardPermInputMonitoringBtn.disabled = true;
      if (perms.microphone === "granted") {
        setWizardPermStatus("All set — you're good to go.", "success");
        onAllRequiredGranted();
      }
    } catch (error) {
      setWizardPermStatus(
        "Failed to check permissions: " + userFacingErrorMessage(error),
        "error"
      );
    }
  }

  async function refreshWizardPermissionState() {
    try {
      setWizardPermStatus("Refreshing permission status...");
      const refreshed = await window.tapTalk.refreshPermissionStatus();
      renderStatus(refreshed);
      await checkWizardPermissions({ probeFnListener: true });
    } catch (error) {
      setWizardPermStatus(
        "Failed to refresh permissions: " + userFacingErrorMessage(error),
        "error"
      );
    }
  }

  async function requestMicrophonePermission() {
    try {
      setWizardPermStatus("Requesting microphone access...");
      const granted = await window.tapTalk.requestMicrophone();
      if (granted) {
        setWizardPermStatus("Microphone access granted!", "success");
      } else {
        setWizardPermStatus(
          "Microphone access was denied. You can enable it in System Settings.",
          "error"
        );
      }
      await checkWizardPermissions({ probeFnListener: true });
    } catch (error) {
      setWizardPermStatus(
        "Failed to request microphone: " + userFacingErrorMessage(error),
        "error"
      );
    }
  }

  async function openAccessibilityFromWizard() {
    try {
      await window.tapTalk.openAccessibility();
      setWizardPermStatus(
        "Accessibility settings opened. Add TapTalk to the list, then click Refresh.",
        "success"
      );
    } catch (error) {
      setWizardPermStatus(
        "Failed to open settings: " + userFacingErrorMessage(error),
        "error"
      );
    }
  }

  async function openInputMonitoringFromWizard(onBeforeOpen = () => undefined) {
    try {
      onBeforeOpen();
      setWizardPermStatus(
        "Opening Input Monitoring… macOS may ask to 'Quit & Reopen' TapTalk — click it without worry. Your wizard progress and settings are saved to disk and the wizard will reopen automatically on this exact step.",
        ""
      );
      await window.tapTalk.openInputMonitoring();
    } catch (error) {
      setWizardPermStatus(
        "Failed to open settings: " + userFacingErrorMessage(error),
        "error"
      );
    }
  }

  return {
    checkWizardPermissions,
    openAccessibilityFromWizard,
    openInputMonitoringFromWizard,
    refreshWizardPermissionState,
    requestMicrophonePermission
  };
}
