# ADR 0003: Directed social graph and read-time feed merge

## Status

Accepted for the initial product scale.

## Decision

Following is directed and does not imply mutual friendship. A user may follow at most 500 active users. `followUser` and `unfollowUser` Callable Functions atomically maintain:

- `users/{uid}/following/{targetUid}`;
- `users/{targetUid}/followers/{uid}`;
- denormalized `followingCount` and `followerCount`.

Clients cannot write graph edges directly. The initial friends feed uses fan-out on read: it loads the caller's following IDs, splits them into Firestore `in` query groups of at most 30, and merges the groups by `createdAt DESC, documentId DESC`. Cursor ordering uses UTF-8 byte comparison to match Firestore.

The 500-follow ceiling bounds one page to at most 17 parallel review queries. Before raising that ceiling, or when p95 feed latency exceeds 500 ms, the feed must migrate to materialized per-user timelines populated asynchronously on review publication.

## Consequences

- Follow/unfollow is idempotent because edge document IDs are deterministic.
- Graph edges remain backend-owned and are not directly enumerable under current Security Rules.
- Feed reads cost more as following count grows; this is an explicit bounded trade-off rather than an accidental unbounded query.
- Private accounts, follow requests, blocks, and recommendations require explicit future graph states rather than changing the meaning of an existing edge.
