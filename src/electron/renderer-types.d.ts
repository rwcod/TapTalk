import type { TapTalkBridge } from "./ipc/contracts";

declare global {
  interface Window {
    tapTalk: TapTalkBridge;
  }
}

export {};
