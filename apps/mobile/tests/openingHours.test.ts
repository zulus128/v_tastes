import { describe, expect, it } from 'vitest';
import {
  openingHoursForDate,
  openingStatus,
} from '../src/features/place/openingHours';

describe('opening hours', () => {
  it('selects the named weekday before the fallback row', () => {
    const rows = [
      { day: 'Monday', hours: '9 AM – 5 PM' },
      { day: 'Tuesday', hours: '10 AM – 6 PM' },
    ];
    expect(openingHoursForDate(rows, new Date(2026, 8, 15, 12))?.day).toBe(
      'Tuesday',
    );
  });

  it('supports daily and 24-hour schedules', () => {
    expect(
      openingStatus(
        [{ day: 'Daily', hours: 'Open 24 hours' }],
        new Date(2026, 8, 15, 3),
      ),
    ).toBe('open');
  });

  it('reports closed before opening and open during service', () => {
    const rows = [{ day: 'Daily', hours: '10 AM – 6 PM' }];
    expect(openingStatus(rows, new Date(2026, 8, 15, 9, 59))).toBe('closed');
    expect(openingStatus(rows, new Date(2026, 8, 15, 10))).toBe('open');
    expect(openingStatus(rows, new Date(2026, 8, 15, 18))).toBe('closed');
  });

  it('handles venues that close after midnight', () => {
    const rows = [{ day: 'Daily', hours: '6 PM – 2 AM' }];
    expect(openingStatus(rows, new Date(2026, 8, 15, 23))).toBe('open');
    expect(openingStatus(rows, new Date(2026, 8, 15, 1))).toBe('open');
    expect(openingStatus(rows, new Date(2026, 8, 15, 12))).toBe('closed');
  });

  it('does not guess when a schedule cannot be parsed', () => {
    expect(openingStatus([{ day: 'Daily', hours: 'By appointment' }])).toBe(
      'unknown',
    );
  });
});
