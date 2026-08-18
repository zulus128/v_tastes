// Standard absolute-date label used across the app (e.g. "Dec 5, 2024"),
// per Figma's review/comment timestamps. This is a fixed "Month Day, Year"
// layout, not a locale-dependent one — pass a fixed locale (rather than
// `undefined`, which follows the device's region and reorders to e.g.
// "15 Aug 2026") so it renders the same everywhere.
export function formatDisplayDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
