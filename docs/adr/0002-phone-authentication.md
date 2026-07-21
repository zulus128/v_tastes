# ADR 0002: Passwordless phone authentication through an OTP provider

## Status

Accepted for local implementation. Production Twilio credentials are pending.

## Decision

The mobile client calls `requestPhoneOtp` and `verifyPhoneOtp` Callable Functions. An `OtpProvider` backend boundary owns OTP delivery and verification. Local development uses `FakeOtpProvider` with the fixed code `1332`; production will use Twilio Verify without exposing Twilio credentials to any client.

After OTP approval, the backend creates or locates the Firebase Authentication user by normalized E.164 phone number and returns a Firebase Custom Token. The client signs in with that token, so Firestore Security Rules and all authenticated Callable Functions continue to use the standard Firebase `uid`.

Challenges use random Firestore document IDs, have a 10-minute lifetime, and are deleted before a sign-in token is issued. Verification claims a challenge in a transaction so concurrent checks cannot bypass the maximum of five failed attempts. Challenge documents are private backend implementation data and are never readable through client Security Rules.

OTP requests have a 30-second per-phone resend cooldown plus rolling one-hour limits by phone and source IP. Deployed Callable Functions require Firebase App Check; only the local emulator bypasses it. Firestore TTL policies remove expired challenge and rate-limit documents.

## Consequences

- React Native, Flutter, Swift, and web clients share the same authentication API.
- Firebase native phone-SMS delivery is not used when Twilio is enabled.
- Google and Apple sign-in remain separate Firebase Auth providers.
- Production deployment requires Twilio Verify secrets. Device-level abuse signals and provider-side spend caps remain recommended defense-in-depth controls.
