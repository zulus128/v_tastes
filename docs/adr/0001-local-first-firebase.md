# ADR 0001: Local-first Firebase development

## Status

Accepted.

## Decision

Develop against Firebase Emulator Suite under the fixed local project ID `demo-tastes`. Keep all project identifiers and environment-specific Firebase configuration outside domain code.

Callable Functions are transport adapters over application logic. Allowed real-time reads use Firestore SDK under deny-by-default Security Rules. The mobile app consumes public contracts and a small Firebase client package but does not import backend internals.

## Consequences

The first milestone requires no client Firebase account and contains no production data. A client-owned staging or production project can later deploy the same functions, rules, indexes, and contracts. External services such as SMS, FCM/APNs, Google Places, and SendGrid remain adapters to be configured outside the local milestone.
