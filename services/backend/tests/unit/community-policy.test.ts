import { describe, expect, it } from 'vitest';
import {
  communityObservationReady,
  communityRankingsReady,
} from '../../functions/src/modules/discover/community-policy';
const now = Date.parse('2026-11-12T12:00:00Z');
const day = 86_400_000;
const audit = {
  algorithmVersion: 1,
  eventCount: 12,
  firstObservedEventAt: now - 8 * day,
  calculatedAt: now - 60_000,
};
const settings = {
  mode: 'enabled',
  validatedAlgorithmVersion: 1,
  validatedAt: now - day / 2,
};
describe('community activation gate', () => {
  it('requires observed history and explicit validation after a full week', () => {
    expect(communityRankingsReady(settings, audit, now)).toBe(true);
    expect(
      communityRankingsReady({ ...settings, mode: 'shadow' }, audit, now),
    ).toBe(false);
    expect(
      communityRankingsReady(
        { ...settings, validatedAt: now - 2 * day },
        audit,
        now,
      ),
    ).toBe(false);
    expect(
      communityObservationReady(
        { ...audit, firstObservedEventAt: now - day },
        now,
      ),
    ).toBe(false);
    expect(communityObservationReady({ ...audit, eventCount: 0 }, now)).toBe(
      false,
    );
  });
  it('falls back when the calculation is stale, from the future or from another algorithm', () => {
    expect(
      communityRankingsReady(
        settings,
        { ...audit, calculatedAt: now - 3 * 60 * 60_000 },
        now,
      ),
    ).toBe(false);
    expect(
      communityRankingsReady(
        settings,
        { ...audit, calculatedAt: now + 1 },
        now,
      ),
    ).toBe(false);
    expect(
      communityRankingsReady(
        { ...settings, validatedAlgorithmVersion: 2 },
        audit,
        now,
      ),
    ).toBe(false);
    expect(communityRankingsReady(settings, undefined, now)).toBe(false);
  });
});
