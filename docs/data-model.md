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

### Review visits and dish identity

`reviewOwnership/{hashedAuthorVenue}` reserves one published review for each
author–venue pair in the same transaction as review creation. Returning to a
venue appends a visit to the existing review; likes and comments stay on that
review. A deleted review releases its claim so a fresh review can be created.

The review contains the current `dishReviews` list and visit snapshots. Each dish
has a stable ID within that review, its latest rating, its first/latest visit IDs,
and a history of ratings and photo references. Adding a visit matches an existing
dish by its ID or by its trimmed, NFKC-normalized, case-insensitive title. It
updates that dish rather than adding another row. Visit snapshots retain what
was rated on that visit.

Dish identity is currently scoped to a review. Two authors writing “Tuna Tartare”
do not establish a shared canonical dish record. Venue `popularDishes` metadata
is also separate from these user-authored dish histories; no Maps photo import
creates or replaces a user's dish record.

A future canonical dish catalog should use venue-scoped dish IDs, preserve the
original author titles and visit histories, and keep proposed matches reviewable
before merging aliases. Name similarity alone should not silently merge dishes
from different venues or different menu items. This catalog is not implemented.

Historical duplicate reviews approved for consolidation retain archived source
documents with `mergedIntoReviewId`. Callable review operations resolve those
aliases to the canonical review so older links and engagement remain usable.

### Private activity and discovery audits

`_activityEvents` records timestamped follow/unfollow, review/visit, reaction and
comment mutations inside their existing transactions, after state and idempotency
checks. These events contain entity IDs and operation metadata, not copies of
review/comment text or raw network addresses. Removing a relationship or reaction
retains its original creation time in the event so re-adding it does not manufacture
new growth. Events are not reconstructed for activity that was never recorded.

`_communityPeopleSignals`, `_communityReviewSignals`, and `_communitySignalRuns`
store hourly shadow calculations and their timestamps/thresholds. They do not
replace the live discovery rankings. Calculations count unique eligible actors,
exclude self activity and fixture/suspicious accounts, use recent engagement with
decay, and do not use lifetime counters as recent activity. A complete week of
observed events and a production comparison are still needed before activation.

`_userPrivate/{uid}.signupNetworkHash` is recorded only when a new profile is
created. It uses an HMAC with a private random key in `_riskConfig/network`; no raw
IP is stored and no country/GPS history is inferred. Existing accounts are not
given invented historical fingerprints.

The hourly review risk check adds `source: "risk-monitor"` reports for human
moderators when long cross-account text duplicates, review velocity, or coordinated
new-account/network activity crosses a conservative threshold. These reports do
not hide content or ban accounts. A dismissed report stays dismissed for that
content version; a later text change can be reviewed separately. Resolving a system
report does not send a notification to a fictitious reporter. Pending high-risk
reviews are excluded from shadow discovery scores.

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

### `users/{uid}/notifications/{notificationId}`

The in-app notification list. Every document is raised from an entry of the notification catalog in
`@tastes/contracts` (`notificationCatalog`) and stores its `type`, `group`, `category`, declared
`channels`, rendered `title`/`body`, actor, and deep-link target. The document ID hashes recipient,
type, and the event key, so a repeated event overwrites rather than duplicates. `pushUserNotification`
fans the document out to the declared channels: push through Expo, email through `_emailQueue`.
Reads go through `listNotifications`; direct client access stays denied.

### Notification support collections

- `_emailQueue/{notificationId}` — email deliveries waiting for a mail worker; no provider is wired up yet.
- `_contactInvites/{hash}` — hashed contact identifiers mapped to the users who invited them, used to raise `contact-joined` on sign-up. Deleted once the invite is announced.
- `_leaderboardSnapshots/{city}` — yesterday's top ten per city, diffed daily to raise leaderboard notifications.

Per-user delivery preferences live on `users/{uid}.notificationPreferences`: the `enabled`/`push`/`email`/`sms`
channel switches plus a `categories` map, one flag per settings category. Catalog entries in the
`always` category (security, account, and moderation) ignore every switch.

## Composite indexes

`services/backend/firebase/firestore.indexes.json` describes the `tastes-eu` database, not `(default)`.
Two rules keep `firebase deploy --only firestore:indexes` working:

- Never write a `__name__` field into the file. The Firestore API always reports it, but the CLI strips it
  before matching, so an explicit entry never matches and the deploy dies with `409 index already exists`.
  The implicit `__name__` direction follows the last ordered field, which is what every query here needs.
- Never pass `--force`. It deletes every index the file does not list, and the database holds four indexes
  that repeat an existing definition with `__name__` ascending — they serve the queries that break ties on
  `orderBy(documentId, 'asc')`, such as the leaderboard and Discover paging. Stripping `__name__` from the
  file makes both variants match the same entry, so they survive a normal deploy but not a forced one.

Note also that `firebase firestore:indexes` prints the `(default)` database unless `--database tastes-eu`
is passed, which makes the two look inconsistent.

## Write policy

Client writes are denied for the initial collections. Mutations are performed by Callable Functions using Admin SDK transactions. This protects ownership fields, counters, statuses, and server timestamps.

## Planned collections

`reports`, `auditLogs`, immutable leaderboard snapshots, and private user settings will be introduced with their corresponding modules rather than pre-created without tested rules.
