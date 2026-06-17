interface ReplacementRule {
  pattern: RegExp;
  value: string;
}

export const MAX_NORMALIZED_TRANSCRIPT_LENGTH = 20_000;

const DEV_REPLACEMENTS: ReplacementRule[] = [
  { pattern: /\bci[\/\s-]*cd\b/gi, value: "CI/CD" },
  { pattern: /\btype\s*script\b/gi, value: "TypeScript" },
  { pattern: /\bjava\s*script\b/gi, value: "JavaScript" },
  { pattern: /\bnode\s*js\b/gi, value: "Node.js" },
  { pattern: /\bnext\s*js\b/gi, value: "Next.js" },
  { pattern: /\bnuxt\s*js\b/gi, value: "Nuxt.js" },
  { pattern: /\bexpress\s*js\b/gi, value: "Express.js" },
  { pattern: /\bvue\s*js\b/gi, value: "Vue.js" },
  { pattern: /\breact\s*js\b/gi, value: "React" },
  { pattern: /\bpostgres(?:ql)?\b/gi, value: "PostgreSQL" },
  { pattern: /\bmongodb\b/gi, value: "MongoDB" },
  { pattern: /\bgraphql\b/gi, value: "GraphQL" },
  { pattern: /\boauth\b/gi, value: "OAuth" },
  { pattern: /\bopenai\b/gi, value: "OpenAI" },
  { pattern: /\bgithub\b/gi, value: "GitHub" },
  { pattern: /\bgitlab\b/gi, value: "GitLab" },
  { pattern: /\bbitbucket\b/gi, value: "Bitbucket" },
  { pattern: /\bk8s\b/gi, value: "K8s" },
  { pattern: /\bkubernetes\b/gi, value: "Kubernetes" },
  { pattern: /\btypescript\b/gi, value: "TypeScript" },
  { pattern: /\bjavascript\b/gi, value: "JavaScript" },
  { pattern: /\bapi\b/gi, value: "API" },
  { pattern: /\bsdk\b/gi, value: "SDK" },
  { pattern: /\bjwt\b/gi, value: "JWT" },
  { pattern: /\bjson\b/gi, value: "JSON" },
  { pattern: /\bsql\b/gi, value: "SQL" },
  { pattern: /\bnosql\b/gi, value: "NoSQL" },
  { pattern: /\bhttp\b/gi, value: "HTTP" },
  { pattern: /\bhttps\b/gi, value: "HTTPS" },
  { pattern: /\burl\b/gi, value: "URL" },
  { pattern: /\buri\b/gi, value: "URI" },
  { pattern: /\bcli\b/gi, value: "CLI" },
  { pattern: /\bcpu\b/gi, value: "CPU" },
  { pattern: /\bgpu\b/gi, value: "GPU" },
  { pattern: /\bram\b/gi, value: "RAM" },
  { pattern: /\bssh\b/gi, value: "SSH" },
  { pattern: /\bdns\b/gi, value: "DNS" },
  { pattern: /\bcdn\b/gi, value: "CDN" },
  { pattern: /\baws\b/gi, value: "AWS" },
  { pattern: /\bgcp\b/gi, value: "GCP" },
  { pattern: /\bazure\b/gi, value: "Azure" },
  { pattern: /\bdocker\b/gi, value: "Docker" },
  { pattern: /\bredis\b/gi, value: "Redis" }
];

export function normalizeTranscript(
  text: string,
  extraReplacements: ReplacementRule[] = []
): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let normalized = text;
  // User dictionary replacements run first so they win over the built-ins.
  for (const rule of [...extraReplacements, ...DEV_REPLACEMENTS]) {
    normalized = normalized.replace(rule.pattern, rule.value);
  }

  if (normalized.length > MAX_NORMALIZED_TRANSCRIPT_LENGTH) {
    return normalized.slice(0, MAX_NORMALIZED_TRANSCRIPT_LENGTH);
  }

  return normalized;
}
