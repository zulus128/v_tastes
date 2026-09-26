export interface OpeningHoursEntry {
  day: string;
  hours: string;
}

const weekdays = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export function openingHoursForDate(
  hours: OpeningHoursEntry[],
  date = new Date(),
) {
  const today = weekdays[date.getDay()];
  return (
    hours.find(
      (entry) => entry.day.trim().toLowerCase() === today.toLowerCase(),
    ) ??
    hours.find((entry) => entry.day.trim().toLowerCase() === 'daily') ??
    hours[0]
  );
}

function minutesFromMidnight(value: string) {
  const match = value.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (minute > 59 || hour > (meridiem ? 12 : 23) || hour < (meridiem ? 1 : 0))
    return null;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (meridiem === 'pm' && hour !== 12) hour += 12;
  return hour * 60 + minute;
}

export function openingStatus(
  hours: OpeningHoursEntry[],
  date = new Date(),
): 'open' | 'closed' | 'unknown' {
  const entry = openingHoursForDate(hours, date);
  if (!entry) return 'unknown';
  if (/\bclosed\b/i.test(entry.hours)) return 'closed';
  if (/\b(open 24 hours|24 hours)\b/i.test(entry.hours)) return 'open';

  const [opening, closing, ...extra] = entry.hours.split(/\s*(?:–|—|-)\s*/);
  if (!opening || !closing || extra.length > 0) return 'unknown';
  const start = minutesFromMidnight(opening);
  const end = minutesFromMidnight(closing);
  if (start === null || end === null) return 'unknown';

  const now = date.getHours() * 60 + date.getMinutes();
  if (start === end) return 'open';
  return start < end
    ? now >= start && now < end
      ? 'open'
      : 'closed'
    : now >= start || now < end
      ? 'open'
      : 'closed';
}
