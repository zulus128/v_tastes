# Anton's Taste Match reference integration

Source: `TASTES AI MATCH .zip`, sent by Anton in the Tastes app dev WhatsApp chat on 7 October 2026 at 21:06.
The archive contains the v2 reference implementation and documentation. Its original 62 tests passed before integration.

`reference/` contains the supplied server-side JavaScript engine, normalization, social graph, private traits, tracking and feed helper. The only intentional engine change is accepting the app's existing 0.5–5 rating scale instead of rejecting 0.5-star ratings. Formatting changes do not alter ranking rules.

The TypeScript adapter derives identity from Firebase Auth, validates canonical selections, rechecks live reviews and profile/venue availability, applies bilateral blocks and hidden reviews, and maps public cards without exporting private traits, snapshots or inferred vectors. Retrieval is bounded and reports when its pool is truncated. No production accuracy claim follows from reference fixtures.

The initial approved catalogue contains only the 14 dish definitions in the supplied reference, without fictional people, venues or ratings. Admin-only approval can expand the catalogue; ambiguous names stay in a private normalization queue. An exact approved alias can resolve automatically; a different canonical choice requires explicit user confirmation. Do not infer ingredient variants from fuzzy name similarity.

The core runs without AI or a paid service. Optional live photo/name resolution and culinary research adapters are not enabled without provider approval and credentials. The reference's analytics is not silently enabled: this integration initially uses explicit dish ratings and existing visit history, not views or saves as positive votes.
