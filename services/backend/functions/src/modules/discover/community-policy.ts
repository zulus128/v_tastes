export const COMMUNITY_SIGNAL_VERSION = 1;
const WEEK = 7 * 86_400_000;
export function signalTime(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value) || 0;
  if (value && typeof value === 'object' && 'toMillis' in value)
    return (value as { toMillis(): number }).toMillis();
  return 0;
}
export function communityObservationReady(
  audit: Record<string, unknown> | undefined,
  now: number,
): boolean {
  const first = signalTime(audit?.firstObservedEventAt);
  const calculated = signalTime(audit?.calculatedAt);
  return (
    audit?.algorithmVersion === COMMUNITY_SIGNAL_VERSION &&
    Number(audit.eventCount) > 0 &&
    first > 0 &&
    first <= now - WEEK &&
    calculated >= now - 2 * 60 * 60_000 &&
    calculated <= now
  );
}
export function communityRankingsReady(
  settings: Record<string, unknown> | undefined,
  audit: Record<string, unknown> | undefined,
  now: number,
): boolean {
  const validated = signalTime(settings?.validatedAt);
  return (
    settings?.mode === 'enabled' &&
    settings.validatedAlgorithmVersion === COMMUNITY_SIGNAL_VERSION &&
    communityObservationReady(audit, now) &&
    validated >= signalTime(audit?.firstObservedEventAt) + WEEK &&
    validated <= now
  );
}
