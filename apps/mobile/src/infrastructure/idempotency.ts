export function createIdempotencyKey(scope: string): string {
  const random = Math.random().toString(36).slice(2);
  return `${scope}:${Date.now().toString(36)}:${random}`;
}
