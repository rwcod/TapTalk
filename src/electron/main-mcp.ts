import { app } from "electron";
import { runStdioServer } from "../mcp/server";

export function isMcpMode(): boolean {
  return process.argv.includes("--mcp");
}

export function runMcpMode(): void {
  runStdioServer();
}

export function getMcpLaunchConfig(vaultPath?: string): { name: string; command: string; args: string[] } {
  const args = app.isPackaged ? ["--mcp"] : [app.getAppPath(), "--mcp"];
  const cleanVaultPath = vaultPath?.trim();
  if (cleanVaultPath) {
    args.push("--vault", cleanVaultPath);
  }
  return { name: "taptalk-vault", command: process.execPath, args };
}
