import { ipcMain, shell } from "electron";
import { readFile, rm, writeFile } from "node:fs/promises";
import {
  getVaultDir,
  listVault,
  readVaultNoteBody,
  resolveVaultFile,
  writeFolderIndexes
} from "../../../runtime/vault";
import { appendWikilink, suggestVaultLinks, wikilinkForEntry } from "../../../runtime/vault-links";
import { IPC_CHANNELS } from "../contracts";
import { RegisterIpcDeps } from "./types";

export function registerVaultIpcHandlers(deps: RegisterIpcDeps): void {
  ipcMain.handle(IPC_CHANNELS.vaultList, async (event) => {
    deps.assertTrustedIpcSender(event);
    return listVault();
  });

  ipcMain.handle(IPC_CHANNELS.vaultReadBody, async (event, file: unknown) => {
    deps.assertTrustedIpcSender(event);
    return typeof file === "string" ? readVaultNoteBody(file) : null;
  });

  ipcMain.handle(IPC_CHANNELS.vaultSuggestLinks, async (event, file: unknown) => {
    deps.assertTrustedIpcSender(event);
    if (typeof file !== "string") {
      return [];
    }
    const entries = await listVault();
    const entry = entries.find((item) => item.file === file);
    if (!entry) {
      return [];
    }
    const body = await readVaultNoteBody(file);
    return suggestVaultLinks(entry, body ?? "", entries);
  });

  ipcMain.handle(IPC_CHANNELS.vaultApplyLink, async (event, file: unknown, targetFile: unknown) => {
    deps.assertTrustedIpcSender(event);
    if (typeof file !== "string" || typeof targetFile !== "string" || file === targetFile) {
      return false;
    }
    const resolved = resolveVaultFile(file);
    if (!resolved) {
      return false;
    }
    const target = (await listVault()).find((entry) => entry.file === targetFile);
    if (!target) {
      return false;
    }
    const content = await readFile(resolved, "utf8");
    await writeFile(resolved, appendWikilink(content, wikilinkForEntry(target)), { mode: 0o600 });
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.vaultOpenEntry, async (event, file: unknown) => {
    deps.assertTrustedIpcSender(event);
    if (typeof file !== "string") {
      return;
    }
    const resolved = resolveVaultFile(file);
    if (resolved) {
      await shell.openPath(resolved);
    }
  });

  ipcMain.handle(IPC_CHANNELS.vaultDelete, async (event, file: unknown) => {
    deps.assertTrustedIpcSender(event);
    if (typeof file !== "string") {
      return false;
    }
    const resolved = resolveVaultFile(file);
    if (!resolved) {
      return false;
    }
    await rm(resolved, { force: true });
    await writeFolderIndexes().catch(() => undefined);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.vaultReveal, async (event) => {
    deps.assertTrustedIpcSender(event);
    await shell.openPath(getVaultDir());
  });
}
