# Tastes backend

The backend is implemented with Firebase Cloud Functions, Firestore, Authentication, and
Storage.

## Structure

```text
services/backend/
  firebase/    Firestore indexes, Firestore rules, and Storage rules
  functions/   Cloud Functions source and seed scripts
  tests/       Emulator-backed authentication and security-rules tests
```

Repository-level `firebase.json`, `firebase.test.json`, and `.firebaserc` remain at the
workspace root because they orchestrate the Firebase CLI. Shared contract tests remain in the
root `tests/integration` directory.

Run backend verification from the workspace root:

```bash
pnpm build
pnpm test:rules
pnpm test:auth
```

## Production deployment

The `Deploy production` GitHub Actions workflow runs after a successful CI run
on `main` and can also be started manually. Configure the protected
`production` environment with `FIREBASE_SERVICE_ACCOUNT`.

### Username-claim migration

Deploy the Functions release containing the username migration gate before
enabling new username writes, then run the claim migration against the remote
database:

```bash
pnpm build
FIRESTORE_DATABASE_ID=tastes-eu pnpm --filter @tastes/functions users:migrate-private -- --apply
```

The script normalizes legacy usernames, creates `_usernames` claims, and sets
`_migrations/usernameClaims.complete` only when every claim is unambiguous.
Until that marker is true, new or changed usernames fail closed with
`username-migration-incomplete`; existing claimed usernames continue to work.
Resolve any reported collisions and rerun the migration before opening signup.

Before the first email- and SMS-enabled deploy, create these Firebase Functions
secrets:

- `SENDGRID_API_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Set `TRANSACTIONAL_EMAIL_FROM` to a verified SendGrid sender. The Twilio service
must be a Verify service with an SMS channel enabled. App Check enforcement is
enabled by default for every mobile callable in deployed environments; only
unit tests and the local Firebase emulators bypass attestation. Admin web
callables remain protected by staff claims and intentionally do not require App
Check until the admin console configures a web App Check provider.

The separate `Build and submit TestFlight` workflow is intentionally manual.
It uses the production EAS profile, increments the native build number, and
submits the resulting iOS build using the protected `EXPO_TOKEN` secret.

## Places configuration

`searchVenues` always searches active Firestore venues. To supplement those results with
Google Places API (New), configure `GOOGLE_PLACES_API_KEY` in the Functions runtime environment
and enable Places API (New) for the same Google Cloud project. When the key is absent or Google
Places is temporarily unavailable, the callable returns the local matches instead of failing.
