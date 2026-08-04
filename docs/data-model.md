# Firestore data model v1

## Collections

### `users/{uid}`

Server-owned profile containing `displayName`, `bio`, application-owned `photoPath`, legacy `photoUrl`, `status`, lifetime/monthly XP, social counters, onboarding version, and timestamps. The initial client may read authenticated profiles but cannot write them directly.

Subcollections:

- `following/{targetUid}` — directed outgoing social edge.
- `followers/{sourceUid}` — inverse edge maintained in the same backend transaction.
- `pushTokens/{tokenHash}` — private Expo push destinations registered through Callable Functions. Clients cannot read or write tokens directly.

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

### `_contentRateLimits/{hashedBucket}`

Private per-user mutation counters. Documents are scoped to a time bucket and removed by TTL.

### `_idempotency/{hashedCommand}`

Private, short-lived outcomes for mutations whose natural entity ID cannot represent the result, currently reactions. Documents are removed by TTL.

### `_pushTokens/{tokenHash}`

Private ownership registry ensuring that one Expo push token belongs to at most one authenticated account. Registering the same device after an account switch atomically removes it from the previous user's private `pushTokens` subcollection.

### `conversations/{conversationId}`

Backend-owned conversation metadata. A direct conversation uses `kind: "direct"` and a deterministic ID for one unordered pair of users. An activity conversation uses `kind: "activity"`, shares its ID with the activity, and may contain up to 21 participants. `lastMessage` supports inbox rendering, and per-participant unread/read state is stored in maps. Starting and continuing a direct conversation requires a mutual follow.

Authenticated participants may read their conversation documents directly for foreground Firestore listeners. Direct writes remain denied.

Subcollections:

- `messages/{messageId}` — immutable text messages with sender, recipient IDs, server timestamp, and an idempotent server-derived ID. Only conversation participants may read them; all writes use Callable Functions.

### `activities/{activityId}`

Backend-owned activity metadata containing its organizer, participants, venue, start time, status, and timestamps. Creation atomically creates a same-ID activity conversation. Only activity participants may read the record directly; clients cannot write it.

### `notifications/{notificationId}`

Backend-owned notification events. Message notifications use deterministic IDs derived from the recipient and message so retries cannot create duplicates. Only the recipient may read a notification. Push delivery status is server-owned and is not a synchronization source of truth.

## Write policy

Client writes are denied for the initial collections. Mutations are performed by Callable Functions using Admin SDK transactions. This protects ownership fields, counters, statuses, and server timestamps.

## Planned collections

`reports`, `auditLogs`, immutable leaderboard snapshots, and private user settings will be introduced with their corresponding modules rather than pre-created without tested rules.
