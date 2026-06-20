import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCaptureMarkdown } from "../runtime/vault";
import { countCaptureLinkSuggestions } from "./main-capture";
import type { VaultConfig } from "../core/types";

test("countCaptureLinkSuggestions counts suggestions for a captured note", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "taptalk-capture-links-"));
  try {
    const current = path.join(root, "current.md");
    await writeFile(current, buildCaptureMarkdown({
      text: "OKF capture format\n\nMarkdown frontmatter for Obsidian.",
      source: "test",
      created: new Date("2026-06-19T10:00:00Z")
    }));
    await writeFile(path.join(root, "related.md"), buildCaptureMarkdown({
      text: "Obsidian OKF format\n\nCapture notes with markdown frontmatter.",
      source: "test",
      created: new Date("2026-06-19T10:01:00Z")
    }));
    await writeFile(path.join(root, "unrelated.md"), buildCaptureMarkdown({
      text: "Invoice payment terms\n\nQuarterly finance note.",
      source: "test",
      created: new Date("2026-06-19T10:02:00Z")
    }));

    const vaultConfig: VaultConfig = {
      captureDestination: "folder",
      captureFolder: root,
      includeTapTalkVault: false,
      knowledgeSources: [{ id: "obsidian", label: "Obsidian", path: root, enabled: true, kind: "obsidian" }]
    };

    assert.equal(await countCaptureLinkSuggestions(current, vaultConfig), 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
