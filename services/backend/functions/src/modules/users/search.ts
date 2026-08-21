const MAX_SEARCH_TERM_LENGTH = 40;

export function normalizeUserSearch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/^@+/, '')
    .replace(/[^\p{L}\p{N}._]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_SEARCH_TERM_LENGTH);
}

function fuzzyVariants(term: string): string[] {
  if (term.length < 2) return [term];
  const variants = new Set([term]);
  for (let index = 0; index < term.length; index += 1) {
    variants.add(term.slice(0, index) + term.slice(index + 1));
    if (index + 1 < term.length) {
      variants.add(
        term.slice(0, index)
        + term[index + 1]
        + term[index]
        + term.slice(index + 2),
      );
    }
  }
  return [...variants].filter((variant) => variant.length >= 2);
}

export function userSearchTokens(displayName: string, username?: string | null): string[] {
  const values = [displayName, username ?? '']
    .map(normalizeUserSearch)
    .filter(Boolean);
  const terms = new Set(values.flatMap((value) => [value, ...value.split(' ')]));
  const tokens = new Set<string>();
  for (const term of terms) {
    for (let length = 2; length <= term.length; length += 1) {
      tokens.add(`p:${term.slice(0, length)}`);
    }
    for (const variant of fuzzyVariants(term)) tokens.add(`v:${variant}`);
  }
  return [...tokens].slice(0, 500);
}

export function userSearchCandidateTokens(query: string): string[] {
  const normalized = normalizeUserSearch(query);
  if (normalized.length < 2) return [];
  const terms = [normalized, ...normalized.split(' ')];
  const tokens = new Set<string>();
  for (const term of terms) {
    tokens.add(`p:${term}`);
    for (const variant of fuzzyVariants(term)) tokens.add(`v:${variant}`);
  }
  return [...tokens].slice(0, 30);
}

export function damerauLevenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row]![0] = row;
  for (let column = 0; column < columns; column += 1) matrix[0]![column] = column;
  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitution = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + substitution,
      );
      if (
        row > 1
        && column > 1
        && left[row - 1] === right[column - 2]
        && left[row - 2] === right[column - 1]
      ) {
        matrix[row]![column] = Math.min(matrix[row]![column]!, matrix[row - 2]![column - 2]! + 1);
      }
    }
  }
  return matrix[left.length]![right.length]!;
}

export function userSearchScore(query: string, displayName: string, username?: string | null): number | null {
  const needle = normalizeUserSearch(query);
  if (needle.length < 2) return null;
  const fields = [displayName, username ?? ''].map(normalizeUserSearch).filter(Boolean);
  let best = Number.POSITIVE_INFINITY;
  for (const field of fields) {
    const words = field.split(' ');
    if (field === needle) best = Math.min(best, 0);
    else if (words.includes(needle)) best = Math.min(best, 1);
    else if (field.startsWith(needle)) best = Math.min(best, 2);
    else if (words.some((word) => word.startsWith(needle))) best = Math.min(best, 3);
    else if (field.includes(needle)) best = Math.min(best, 4);

    const threshold = needle.length <= 4 ? 1 : needle.length <= 8 ? 2 : 3;
    const distance = Math.min(...[field, ...words].map((candidate) => damerauLevenshtein(needle, candidate)));
    if (distance <= threshold) best = Math.min(best, 10 + distance);
  }
  return Number.isFinite(best) ? best : null;
}
