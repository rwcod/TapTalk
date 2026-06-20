import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { handleRequest } from "./server";

function toolText(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content;
  return content?.[0]?.text || "";
}

test("read_note finds notes in TapTalk vault when external --vault is configured", async () => {
  const taptalkVault = await mkdtemp(path.join(tmpdir(), "taptalk-vault-"));
  const obsidianVault = await mkdtemp(path.join(tmpdir(), "taptalk-obsidian-"));
  await mkdir(path.join(taptalkVault, "notes"), { recursive: true });
  const noteFile = "notes/company-data.md";
  await writeFile(path.join(taptalkVault, noteFile), [
    "---",
    "type: note",
    "title: Company Data",
    "timestamp: 2026-06-19T10:00:00.000Z",
    "source: test",
    "tags: [contact]",
    "---",
    "",
    "NIP: 9662014112"
  ].join("\n"), "utf8");

  const options = { vaultPath: obsidianVault, taptalkVaultDir: taptalkVault };

  const search = await handleRequest({
    id: 1, method: "tools/call",
    params: { name: "search_notes", arguments: { query: "company", limit: 5 } }
  }, options);
  const found = JSON.parse(toolText(search)) as { notes: Array<{ file: string; rootPath: string }> };
  assert.equal(found.notes.length, 1);
  assert.equal(found.notes[0]?.file, noteFile);

  const read = await handleRequest({
    id: 2, method: "tools/call",
    params: { name: "read_note", arguments: { file: noteFile } }
  }, options);
  assert.match(toolText(read), /NIP: 9662014112/);
});

test("MCP tools capture, search, and read an OKF vault note", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "taptalk-mcp-"));
  const options = { vaultPath: root };

  const capture = await handleRequest({
    id: 1,
    method: "tools/call",
    params: {
      name: "capture_note",
      arguments: { text: "MCP smoke idea\n\nUse one vault everywhere.", source: "node:test" }
    }
  }, options);
  assert.match(toolText(capture), /MCP smoke idea/);

  const search = await handleRequest({
    id: 2,
    method: "tools/call",
    params: {
      name: "search_notes",
      arguments: { query: "one vault", limit: 5 }
    }
  }, options);
  const parsed = JSON.parse(toolText(search)) as { notes: Array<{ file: string; title: string }> };
  assert.equal(parsed.notes.length, 1);
  assert.equal(parsed.notes[0]?.title, "MCP smoke idea");

  const read = await handleRequest({
    id: 3,
    method: "tools/call",
    params: {
      name: "read_note",
      arguments: { file: parsed.notes[0]?.file }
    }
  }, options);
  assert.match(toolText(read), /Use one vault everywhere/);
});
