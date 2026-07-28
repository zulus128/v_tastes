# ADR 0004: XP, idempotency, and content mutation abuse controls

## Status

Accepted.

## Decision

XP is server-owned and updated inside the same Firestore transaction as the action:

- publishing a review awards the author 50 XP;
- receiving a like awards the review author 5 XP;
- removing that like removes 5 XP without allowing a negative balance.

Both lifetime `xp` and current `monthlyXp` are updated together. A scheduled function resets `monthlyXp` at 00:00 UTC on the first day of each month. The leaderboard is explicitly a live, eventually consistent ranking; rank may move between pages while users earn XP. A frozen leaderboard snapshot is required before ranks are used for prizes or financial value.

Create-review, add-comment, and reaction commands carry a client-generated idempotency key. Review and comment document IDs are derived from `(uid, operation, key)`. Reaction outcomes are stored in a short-lived private idempotency collection. Replaying the same command therefore returns the same outcome without repeating counters or XP.

Content commands are rate-limited in backend transactions:

- 10 reviews per user per hour;
- 30 comments per user per minute;
- 120 reaction commands per user per minute;
- 60 follow changes per user per minute.

Private rate-limit and idempotency documents use Firestore TTL.

## Consequences

- Network retries and double submissions do not duplicate content or XP when they reuse the same command key.
- A new intentional user action must use a new key.
- Moderation and reports still require their own backend module before the report UI can ship.
- Monthly reset is sufficient for the initial leaderboard. Prize-bearing leaderboards must use immutable period snapshots.
