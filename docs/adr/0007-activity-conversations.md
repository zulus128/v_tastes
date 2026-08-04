# ADR 0007: Activities own participant-scoped conversations

## Status

Accepted.

## Decision

Creating an activity atomically creates an `activities/{activityId}` document and a
`conversations/{activityId}` document with `kind: "activity"`. Both records use the
same identifier. The organizer and selected mutual followers become the initial
participants of both records.

Activity conversations reuse the existing realtime inbox, message, unread-state,
and push-notification infrastructure. A message increments unread state and creates
one durable notification for every participant except its sender. The activity
record remains the source of truth for venue, start time, organizer, and membership;
the conversation stores the title and image snapshot needed for inbox rendering.

Authenticated participants may read their activity record for the details screen.
All writes remain backend-owned.

## Consequences

- An activity appears in Dialog immediately for every invited participant.
- Opening the activity conversation header leads to its activity details.
- Ordinary direct conversations retain deterministic pair IDs and mutual-follow
  checks on every send.
- This decision does not introduce arbitrary named groups, membership management,
  chat attachments, or media uploads. Those require separate contracts.
