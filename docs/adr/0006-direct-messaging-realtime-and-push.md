# ADR 0006: Direct messaging with participant listeners and push signals

## Status

Accepted for the initial messaging increment.

## Decision

The first messaging version supports text-only, one-to-one conversations between users who follow each other. The conversation document ID is deterministic for the unordered participant pair, so the same pair cannot create duplicate conversations.

All mutations remain backend-owned Callable Functions:

- `createConversation` verifies both active profiles and both directed follow edges;
- `sendMessage` verifies mutual follow on every send, rate-limits the sender, and derives the message ID from the sender, conversation, and client idempotency key;
- `markConversationRead` updates only the authenticated participant's unread state;
- push-token registration stores tokens in a private user subcollection and atomically moves a device token away from any previous account owner.

Foreground synchronization is the narrow exception to the callable-read boundary established in ADR 0005. Firestore Rules allow authenticated participants to read only conversation documents containing their UID and messages under those conversations. Client writes remain denied. Callable paginated reads remain available for initial hydration, reconnect recovery, and clients that do not keep a listener active.

Each accepted message creates a durable `notifications` event in the same transaction. A Firestore trigger sends the event through the Expo Push Service. The push payload contains the conversation and message IDs and is only a signal to refresh server data; delivery is not assumed, and push order is not used as message order. An optional `EXPO_ACCESS_TOKEN` enables Expo enhanced push security.

## Initial limits

- direct conversations only;
- mutual follow required to start and continue messaging;
- text messages only, up to 4,000 characters;
- 60 messages per sender per minute;
- 20 new conversations per sender per hour;
- up to 100 active push tokens are considered per recipient;
- server timestamps and document IDs define stable descending pagination.

## Consequences

- Open conversations update in real time without relying on push delivery.
- Background users receive a push when credentials and a registered Expo push token are available, then refetch authoritative data.
- Unfollow immediately prevents new messages but preserves both participants' read access to existing history.
- Group chats, attachments, typing indicators, presence, edits, deletion, blocking, delivery receipts, and end-to-end encryption require explicit later designs.
- Firestore Rules tests are mandatory because participant listeners expose a new direct-read surface.
