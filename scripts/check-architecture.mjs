#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const FILE_LINE_LIMITS = [
  {
    file: "src/cli.ts",
    maxLines: 180,
    rationale: "CLI entry should stay as thin dispatcher."
  },
  {
    file: "src/providers/cloud-stt-provider.ts",
    maxLines: 260,
    rationale: "Cloud provider should remain orchestration-first."
  },
  {
    file: "src/electron/renderer/main.js",
    maxLines: 430,
    rationale: "Renderer entry should not regress into a monolith."
  },
  {
    file: "src/settings/index.ts",
    maxLines: 180,
    rationale: "Settings facade should stay compact."
  },
  {
    file: "src/electron/main.ts",
    maxLines: 670,
    rationale: "Main process entry should not grow unchecked."
  }
];

function countLines(contents) {
  if (contents.length === 0) {
    return 0;
  }
  const normalized = contents.replace(/\r\n/g, "\n");
  return normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n").length
    : normalized.split("\n").length;
}

async function checkFileLimit(entry) {
  const absolute = path.resolve(entry.file);
  const contents = await readFile(absolute, "utf8");
  const lines = countLines(contents);
  return {
    ...entry,
    lines,
    absolute,
    ok: lines <= entry.maxLines
  };
}

async function main() {
  const results = await Promise.all(FILE_LINE_LIMITS.map((entry) => checkFileLimit(entry)));
  const failed = results.filter((entry) => !entry.ok);

  if (failed.length > 0) {
    console.error("Architecture guardrails failed:");
    for (const entry of failed) {
      console.error(
        `- ${entry.file}: ${entry.lines} lines (limit ${entry.maxLines}). ${entry.rationale}`
      );
    }
    process.exit(1);
  }

  console.log(
    `Architecture guardrails passed (${results.length} files checked).`
  );
}

main().catch((error) => {
  console.error("Architecture guardrails error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
