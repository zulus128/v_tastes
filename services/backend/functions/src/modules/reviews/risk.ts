const HOUR = 3_600_000;
export interface RiskReview {
  id: string;
  authorId: string;
  venueId: string;
  text: string;
  createdAt: number;
}
export interface RiskAccount {
  id: string;
  createdAt: number;
  networkHash?: string | null;
}
function shingles(text: string): Set<string> {
  const words =
    text
      .normalize('NFKC')
      .toLocaleLowerCase('en-US')
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(
    words.slice(2).map((_, index) => words.slice(index, index + 3).join(' ')),
  );
}
export function nearDuplicate(first: string, second: string): boolean {
  if (first.trim().length < 80 || second.trim().length < 80) return false;
  const a = shingles(first),
    b = shingles(second);
  if (a.size < 6 || b.size < 6) return false;
  const intersection = [...a].filter((key) => b.has(key)).length;
  return intersection / (a.size + b.size - intersection) >= 0.85;
}

/** Advisory behaviour signals for a human; no content classifier or automatic ban. */
export function reviewRisk(
  review: RiskReview,
  reviews: RiskReview[],
  accounts: RiskAccount[],
) {
  const account = accounts.find((user) => user.id === review.authorId);
  const reasons: string[] = [];
  let score = 0;
  const duplicate = reviews.find(
    (other) =>
      other.authorId !== review.authorId &&
      other.id !== review.id &&
      nearDuplicate(review.text, other.text),
  );
  if (duplicate) {
    score += 75;
    reasons.push(`Near-duplicate text in review ${duplicate.id}.`);
  }
  const recent = reviews.filter(
    (other) => Math.abs(other.createdAt - review.createdAt) <= HOUR,
  );
  if (
    recent.filter((other) => other.authorId === review.authorId).length >= 5
  ) {
    score += 70;
    reasons.push('At least five reviews from this account within one hour.');
  }
  if (account?.networkHash) {
    const peers = new Set(
      accounts
        .filter(
          (other) =>
            other.networkHash === account.networkHash &&
            Math.abs(other.createdAt - account.createdAt) <= HOUR,
        )
        .map((other) => other.id),
    );
    const reviewingPeers = new Set(
      recent
        .filter(
          (other) =>
            other.venueId === review.venueId && peers.has(other.authorId),
        )
        .map((other) => other.authorId),
    );
    if (reviewingPeers.size >= 3) {
      score += 50;
      reasons.push(
        'Three or more accounts created on the same network within one hour reviewed the same venue. Shared Wi-Fi alone is not proof of abuse.',
      );
      if (
        account.createdAt > 0 &&
        review.createdAt - account.createdAt >= 0 &&
        review.createdAt - account.createdAt < 7 * 24 * HOUR
      ) {
        score += 20;
        reasons.push(
          'The account was less than seven days old when the review was posted.',
        );
      }
    }
  }
  return { score, reasons, queue: score >= 70 };
}
