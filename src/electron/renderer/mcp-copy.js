function mcpServerJson(launch) {
  return JSON.stringify({
    mcpServers: {
      [launch.name]: {
        command: launch.command,
        args: launch.args
      }
    }
  }, null, 2);
}

function setupPrompt(launch, vaultPath) {
  return [
    "Configure this local MCP server:",
    "",
    `Name: ${launch.name}`,
    "Transport: stdio",
    `Command: ${launch.command}`,
    "Args:",
    ...launch.args.map((arg) => `  ${arg}`),
    "",
    vaultPath ? `Vault: ${vaultPath}` : "Vault: TapTalk default vault",
    "Use it to capture, search, and read OKF Markdown notes."
  ].join("\n");
}

async function copyText(text, statusEl, label) {
  await navigator.clipboard.writeText(text);
  if (!statusEl) return;
  const previous = statusEl.textContent;
  statusEl.textContent = label;
  window.setTimeout(() => {
    statusEl.textContent = previous || "";
  }, 1400);
}

export async function copyMcpConfig(vaultPath, statusEl) {
  const launch = await window.tapTalk.getMcpLaunchConfig(vaultPath || undefined);
  await copyText(mcpServerJson(launch), statusEl, "Copied MCP config.");
}

export async function copyMcpSetupPrompt(vaultPath, statusEl) {
  const launch = await window.tapTalk.getMcpLaunchConfig(vaultPath || undefined);
  await copyText(setupPrompt(launch, vaultPath), statusEl, "Copied setup prompt.");
}
