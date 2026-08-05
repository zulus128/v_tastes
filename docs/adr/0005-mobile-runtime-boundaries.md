# ADR 0005: Mobile cache, production surfaces, observability, and media

## Status

Accepted with production release gates.

## Decision

Privileged and aggregated reads remain behind Callable Functions. Public product data and data that benefits from real-time updates may be read directly from Firestore only when Security Rules explicitly authorize the query shape and Rules tests cover it. TanStack Query is the owner for callable server state and persists successful query data in AsyncStorage for up to 24 hours. Query keys include the Firebase UID, and logout clears both memory and disk caches. Offline users may read cached feed, comments, and leaderboard data; mutations remain online-only.

Production navigation imports only product screens. Figma previews and the Firebase diagnostic client stay as unreferenced development modules and therefore are excluded from the Metro production dependency graph. If a playground is needed again, it must use a separate development entry point rather than product routes or deep links.

Observability uses a vendor-neutral sink boundary. Development defaults to console logging. Production sends errors and events to `EXPO_PUBLIC_OBSERVABILITY_ENDPOINT`; configuring and monitoring that collector is a release requirement.

User media uses authenticated Storage paths:

- `profile-images/{uid}/{fileName}`;
- `review-images/{uid}/{reviewId}/{fileName}`.

Storage Rules enforce ownership, image MIME types, and a 10 MB maximum. Backend profile and review records may reference only uploaded, application-owned media paths once upload commands are implemented.

## Release gates and consequences

- A production observability endpoint must be configured and tested.
- Firebase App Check must be initialized by the chosen native Expo/Firebase integration before deploying Functions with `enforceAppCheck: true`; this remains a hard production release blocker.
- Cached data is private to the device and is deleted on logout.
- Direct Firestore listeners must unsubscribe on unmount and may expose only fields authorized by tested Security Rules. Business mutations still use Callable Functions.
- Real-time counters are not promised by this architecture. They require either allowed Firestore listeners with tested Rules or explicit subscription infrastructure.
- CI runs lint, typecheck, unit tests, Firestore Rules tests, and authenticated Functions emulator tests on pushes and pull requests.
