// A small baseline for launch; this is separate from external AI moderation.
export const DEFAULT_BLOCKED_COMMENT_TERMS = [
  'fuck',
  'fucking',
  'motherfucker',
  'shit',
] as const;

function normalizedWords(text: string) {
  return (
    text
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .toLocaleLowerCase('en-US')
      .match(/[\p{L}\p{N}]+/gu)
      ?.join(' ') ?? ''
  );
}

export function containsBlockedCommentTerm(
  text: string,
  additionalTerms: readonly string[] = [],
) {
  const content = ` ${normalizedWords(text)} `;
  return [...DEFAULT_BLOCKED_COMMENT_TERMS, ...additionalTerms].some((term) => {
    const normalized = normalizedWords(term);
    return normalized.length > 0 && content.includes(` ${normalized} `);
  });
}
