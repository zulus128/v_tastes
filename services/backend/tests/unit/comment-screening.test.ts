import { describe, expect, it } from 'vitest';
import { containsBlockedCommentTerm } from '../../functions/src/shared/comment-screening';

describe('basic comment screening', () => {
  it('matches whole words through punctuation, case and zero-width characters', () => {
    expect(containsBlockedCommentTerm('FUCK!')).toBe(true);
    expect(containsBlockedCommentTerm('fu\u200bck')).toBe(true);
    expect(containsBlockedCommentTerm('ｆｕｃｋ')).toBe(true);
  });

  it('supports additional configured words and phrases', () => {
    expect(
      containsBlockedCommentTerm('This is spam phrase!', ['spam phrase']),
    ).toBe(true);
    expect(containsBlockedCommentTerm('hello', ['', '  '])).toBe(false);
  });

  it('does not flag food names or substrings of unrelated words', () => {
    expect(
      containsBlockedCommentTerm('Shiitake mushrooms and passion fruit'),
    ).toBe(false);
    expect(containsBlockedCommentTerm('A delicious dish.')).toBe(false);
  });
});
