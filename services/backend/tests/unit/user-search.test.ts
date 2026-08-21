import { describe, expect, it } from 'vitest';
import {
  damerauLevenshtein,
  normalizeUserSearch,
  userSearchCandidateTokens,
  userSearchScore,
  userSearchTokens,
} from '../../functions/src/modules/users/search';

describe('user search', () => {
  it('normalizes case, accents and handles', () => {
    expect(normalizeUserSearch('  @ÁRTAA  ')).toBe('artaa');
  });

  it('ranks exact, prefix and fuzzy matches in that order', () => {
    expect(userSearchScore('arta', 'Arta')).toBe(0);
    expect(userSearchScore('arta', 'Artaa')).toBe(2);
    expect(userSearchScore('arat', 'Arta')).toBe(11);
    expect(userSearchScore('arta', 'Maria')).toBeNull();
  });

  it('matches usernames as well as display names', () => {
    expect(userSearchScore('@artaa', 'Someone Else', 'Artaa')).toBe(0);
  });

  it('uses a transposition-aware edit distance', () => {
    expect(damerauLevenshtein('arat', 'arta')).toBe(1);
  });

  it('produces an intersecting candidate token for a one-edit typo', () => {
    const indexed = new Set(userSearchTokens('Arta', 'arta_user'));
    expect(userSearchCandidateTokens('Arat').some((token) => indexed.has(token))).toBe(true);
  });
});
