# ADR 0002: Passwordless phone authentication through an OTP provider

## Status

Accepted for local implementation. Production Twilio credentials are pending.

## Decision

The mobile client calls `requestPhoneOtp` and `verifyPhoneOtp` Callable Functions. An `OtpProvider` backend boundary owns OTP delivery and verification. Local development uses `FakeOtpProvider` with the fixed code `1332`; production will use Twilio Verify without exposing Twilio credentials to any client.

After OTP approval, the backend creates or locates the Firebase Authentication user by normalized E.164 phone number and returns a Firebase Custom Token. The client signs in with that token, so Firestore Security Rules and all authenticated Callable Functions continue to use the standard Firebase `uid`.

Challenges have a 30-second resend cooldown, a 10-minute lifetime, and a maximum of five failed checks. Challenge documents are private backend implementation data and are never readable through client Security Rules.

## Consequences

- React Native, Flutter, Swift, and web clients share the same authentication API.
- Firebase native phone-SMS delivery is not used when Twilio is enabled.
- Google and Apple sign-in remain separate Firebase Auth providers.
- Production deployment requires Twilio Verify secrets, App Check enforcement, and additional rate limiting by phone, IP, and device.
