import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const themeableIcons = [
  'place-selector-close.svg',
  'place-selector-search.svg',
  'place-selector-clear.svg',
  'place-filter-trending.svg',
  'place-filter-restaurant.svg',
  'place-filter-cafe-cup.svg',
  'place-filter-cafe-steam-left.svg',
  'place-filter-cafe-steam-right.svg',
  'place-filter-bar.svg',
  'place-filter-my-list.svg',
];

describe('review place selector icons', () => {
  it.each(themeableIcons)('%s inherits the active theme color', (fileName) => {
    const source = readFileSync(
      new URL(`../assets/create-review/${fileName}`, import.meta.url),
      'utf8',
    );

    expect(source).toContain('currentColor');
    expect(source).not.toMatch(/(?:fill|stroke)="(?:white|#fff(?:fff)?)"/i);
  });
});
