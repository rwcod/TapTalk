import type { VaultEntry } from "./vault";

export interface VaultLinkSuggestion {
  file: string;
  title: string;
  wikilink: string;
  score: number;
  tags: string[];
  excerpt: string;
}

const STOP_WORDS = new Set([
  "and",
  "the",
  "this",
  "that",
  "with",
  "from",
  "for",
  "jest",
  "oraz",
  "czy",
  "jak",
  "nie",
  "się",
  "sie",
  "dla",
  "pod"
]);

function words(value: string): Set<string> {
  return new Set(
    (value.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
      .filter((word) => !STOP_WORDS.has(word))
  );
}

export function wikilinkForEntry(entry: Pick<VaultEntry, "file">): string {
  const target = entry.file
    .replace(/\\/g, "/")
    .replace(/\.md$/i, "")
    .replace(/\]\]/g, "")
    .trim();
  return `[[${target}]]`;
}

export function appendWikilink(content: string, wikilink: string): string {
  if (content.includes(wikilink)) {
    return content;
  }
  const next = content.trimEnd();
  if (/^## Links\s*$/m.test(next)) {
    return `${next.replace(/^## Links\s*$/m, `## Links\n\n- ${wikilink}`)}\n`;
  }
  return `${next}\n\n## Links\n\n- ${wikilink}\n`;
}

export function suggestVaultLinks(
  entry: VaultEntry,
  body: string,
  entries: VaultEntry[],
  limit = 3
): VaultLinkSuggestion[] {
  const currentWords = words(`${entry.title} ${entry.tags.join(" ")} ${body}`);
  const currentTags = new Set(entry.tags);

  return entries
    .filter((candidate) => candidate.file !== entry.file)
    .map((candidate) => {
      const candidateWords = words(
        `${candidate.title} ${candidate.tags.join(" ")} ${candidate.excerpt}`
      );
      const wordOverlap = [...candidateWords].filter((word) => currentWords.has(word)).length;
      const tagOverlap = candidate.tags.filter((tag) => currentTags.has(tag)).length;
      const score = wordOverlap + tagOverlap * 5;
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.candidate.title.localeCompare(b.candidate.title))
    .slice(0, limit)
    .map(({ candidate, score }) => ({
      file: candidate.file,
      title: candidate.title,
      wikilink: wikilinkForEntry(candidate),
      score,
      tags: candidate.tags,
      excerpt: candidate.excerpt
    }));
}
