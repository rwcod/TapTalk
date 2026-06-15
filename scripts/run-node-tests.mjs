import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const DIST_DIR = path.resolve("dist");

async function collectTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTestFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  let testFiles = [];

  try {
    testFiles = await collectTestFiles(DIST_DIR);
  } catch (error) {
    const maybe = error;
    if (maybe && typeof maybe === "object" && maybe.code === "ENOENT") {
      console.error("dist/ not found. Run the build step first.");
      process.exit(1);
    }
    throw error;
  }

  if (testFiles.length === 0) {
    console.log("No compiled .test.js files found under dist/. Skipping node:test.");
    return;
  }

  const child = spawn(process.execPath, ["--test", ...testFiles], {
    stdio: "inherit"
  });

  child.once("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

await main();
