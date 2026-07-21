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

Private, short-lived backend state for phone verification with a random document ID. It contains the normalized phone number, provider reference, expiry timestamp, status, and failed-attempt count. Successful challenges are deleted before token issuance; expired documents are removed by the `expiresAt` Firestore TTL policy. Clients have no direct access.

### `_otpRateLimits/{hashedScope}`

Private rolling counters and cooldown state keyed by a one-way hash of phone number or source IP. The `expiresAt` Firestore TTL policy removes stale counters. Clients have no direct access.

## Write policy

Client writes are denied for the initial collections. Mutations are performed by Callable Functions using Admin SDK transactions. This protects ownership fields, counters, statuses, and server timestamps.

## Planned collections

`follows`, `reports`, `conversations`, `notifications`, `auditLogs`, and private user settings will be introduced with their corresponding modules rather than pre-created without tested rules.
