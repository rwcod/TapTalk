#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_SETTINGS, type VaultConfig } from "../core/types";
import {
  captureToVault,
  configuredKnowledgeRoots,
  expandHomePath,
  getCaptureDir,
  getVaultDir,
  listKnowledgeVault,
  noteBody,
  resolveVaultFileInRoot,
  type VaultEntry
} from "../runtime/vault";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

interface ServerOptions {
  vaultPath?: string;
  taptalkVaultDir?: string;
}

const PROTOCOL_VERSION = "2024-11-05";

function parseArgs(argv: string[]): ServerOptions {
  const options: ServerOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--vault" && argv[i + 1]) {
      options.vaultPath = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--vault=")) {
      options.vaultPath = arg.slice("--vault=".length);
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write("Usage: taptalk-mcp [--vault /path/to/vault]\n");
      process.exit(0);
    }
  }
  return options;
}

function vaultConfig(options: ServerOptions): VaultConfig {
  const vaultPath = options.vaultPath?.trim();
  if (!vaultPath && !options.taptalkVaultDir) {
    return DEFAULT_SETTINGS.vault;
  }
  const knowledgeSources: VaultConfig["knowledgeSources"] = [];
  // explicit taptalkVaultDir overrides getVaultDir() — used in tests and custom installs
  if (options.taptalkVaultDir) {
    knowledgeSources.push({
      id: "taptalk",
      label: "TapTalk",
      path: options.taptalkVaultDir,
      enabled: true,
      kind: "folder"
    });
  }
  if (vaultPath) {
    const expanded = expandHomePath(vaultPath);
    knowledgeSources.push({
      id: "mcp-vault",
      label: path.basename(expanded) || "Vault",
      path: expanded,
      enabled: true,
      kind: "obsidian"
    });
  }
  return {
    captureDestination: vaultPath ? "folder" : "taptalk",
    captureFolder: vaultPath ? expandHomePath(vaultPath) : "",
    includeTapTalkVault: !options.taptalkVaultDir,
    knowledgeSources
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function textParam(params: unknown, key: string): string {
  const value = asRecord(params)[key];
  return typeof value === "string" ? value.trim() : "";
}

function numberParam(params: unknown, key: string, fallback: number): number {
  const value = asRecord(params)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function entryHaystack(entry: VaultEntry, body: string): string {
  return `${entry.title} ${entry.source} ${entry.tags.join(" ")} ${entry.excerpt} ${body}`.toLowerCase();
}

async function searchNotes(params: unknown, config: VaultConfig): Promise<unknown> {
  const query = textParam(params, "query").toLowerCase();
  const limit = Math.min(Math.max(Math.trunc(numberParam(params, "limit", 10)), 1), 25);
  const entries = await listKnowledgeVault(config);
  const matches: Array<VaultEntry & { body?: string }> = [];

  for (const entry of entries) {
    const body = await readEntryBody(entry, config);
    if (!query || entryHaystack(entry, body).includes(query)) {
      matches.push({ ...entry, body: body.slice(0, 500) });
    }
    if (matches.length >= limit) break;
  }

  return { notes: matches };
}

async function readEntryBody(entry: Pick<VaultEntry, "file" | "rootPath">, config: VaultConfig): Promise<string> {
  const root = entry.rootPath || config.knowledgeSources[0]?.path || getVaultDir();
  if (!root) {
    return "";
  }
  const resolved = resolveVaultFileInRoot(root, entry.file);
  if (!resolved) {
    return "";
  }
  try {
    return noteBody(await readFile(resolved, "utf8"));
  } catch {
    return "";
  }
}

async function readNote(params: unknown, config: VaultConfig): Promise<unknown> {
  const file = textParam(params, "file");
  if (!file) {
    throw new Error("read_note requires file.");
  }
  for (const root of configuredKnowledgeRoots(config)) {
    const resolved = resolveVaultFileInRoot(root.path, file);
    if (!resolved) continue;
    try {
      const content = await readFile(resolved, "utf8");
      return { file, body: noteBody(content), rootPath: root.path };
    } catch {
      // not in this root, try next
    }
  }
  throw new Error("Note not found.");
}

async function captureNote(params: unknown, config: VaultConfig): Promise<unknown> {
  const text = textParam(params, "text");
  if (!text) {
    throw new Error("capture_note requires text.");
  }
  const source = textParam(params, "source") || "mcp";
  const filePath = await captureToVault(
    { text, source },
    { destinationDir: getCaptureDir(config) }
  );
  return { filePath };
}

function toolsList(): unknown {
  return {
    tools: [
      {
        name: "capture_note",
        description: "Capture text into the configured OKF Markdown vault.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string" },
            source: { type: "string" }
          },
          required: ["text"]
        }
      },
      {
        name: "search_notes",
        description: "Search notes in the configured OKF Markdown vault.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" }
          }
        }
      },
      {
        name: "read_note",
        description: "Read a note body by vault-relative file path.",
        inputSchema: {
          type: "object",
          properties: {
            file: { type: "string" }
          },
          required: ["file"]
        }
      }
    ]
  };
}

async function callTool(params: unknown, config: VaultConfig): Promise<unknown> {
  const record = asRecord(params);
  const name = typeof record.name === "string" ? record.name : "";
  const args = record.arguments;
  let result: unknown;

  if (name === "capture_note") {
    result = await captureNote(args, config);
  } else if (name === "search_notes") {
    result = await searchNotes(args, config);
  } else if (name === "read_note") {
    result = await readNote(args, config);
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
  };
}

export async function handleRequest(request: JsonRpcRequest, options: ServerOptions = {}): Promise<unknown> {
  const config = vaultConfig(options);
  if (request.method === "initialize") {
    return {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "taptalk-vault", version: "0.1.0" }
    };
  }
  if (request.method === "tools/list") {
    return toolsList();
  }
  if (request.method === "tools/call") {
    return callTool(request.params, config);
  }
  if (request.method?.startsWith("notifications/")) {
    return undefined;
  }
  throw new Error(`Unsupported method: ${request.method || ""}`);
}

function writeResponse(id: JsonRpcId | undefined, result: unknown): void {
  if (id === undefined || result === undefined) return;
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

function writeError(id: JsonRpcId | undefined, error: unknown): void {
  if (id === undefined) return;
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32000, message } })}\n`);
}

export function runStdioServer(options: ServerOptions = parseArgs(process.argv.slice(2))): void {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch (error) {
        writeError(null, error);
        continue;
      }
      void Promise.resolve()
        .then(() => handleRequest(request, options))
        .then((result) => writeResponse(request.id, result))
        .catch((error) => writeError(request.id, error));
    }
  });
  process.stdin.on("end", () => {
    process.exit(0);
  });
}

if (require.main === module) {
  runStdioServer();
}
