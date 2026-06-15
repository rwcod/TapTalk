import { contextBridge, ipcRenderer } from "electron";
import { IndicatorStatusPayload, IPC_EVENTS } from "./ipc/contracts";

contextBridge.exposeInMainWorld("indicator", {
  onStatus: (listener: (payload: IndicatorStatusPayload) => void): (() => void) => {
    const wrapped = (_event: unknown, payload: IndicatorStatusPayload) => listener(payload);
    ipcRenderer.on(IPC_EVENTS.indicatorStatus, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_EVENTS.indicatorStatus, wrapped);
    };
  }
});
