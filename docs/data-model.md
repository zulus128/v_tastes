# Firestore data model v1

## Collections

### `users/{uid}`

Server-owned profile containing `displayName`, `bio`, `photoUrl`, `status`, and timestamps. The initial client may read authenticated profiles but cannot write them directly.

### `venues/{venueId}`

Normalized venue record. The initial statuses are `active`, `hidden`, `pending`, and `merged`. Only active venues are visible to ordinary authenticated users.

### `reviews/{reviewId}`

Published content containing immutable author and venue snapshots plus rating, text, status, counters, and timestamps.

Subcollections:

- `comments/{commentId}` — published comments with author snapshot.
- `reactions/{uid}` — at most one reaction per user.

### `_otpChallenges/{challengeId}`

Private, short-lived backend state for phone verification. It contains the normalized phone number, provider reference, resend and expiry timestamps, status, and failed-attempt count. Clients have no direct access. Production retention cleanup will be handled with a Firestore TTL policy.

## Write policy

Client writes are denied for the initial collections. Mutations are performed by Callable Functions using Admin SDK transactions. This protects ownership fields, counters, statuses, and server timestamps.

## Planned collections

`follows`, `reports`, `conversations`, `notifications`, `auditLogs`, and private user settings will be introduced with their corresponding modules rather than pre-created without tested rules.
