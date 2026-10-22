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
`production` environment with `FIREBASE_SERVICE_ACCOUNT`. Before the first
email-enabled deploy, create the Firebase Functions secret
`SENDGRID_API_KEY` and set `TRANSACTIONAL_EMAIL_FROM` to a verified SendGrid
sender. Production should set `ENFORCE_APP_CHECK=true`; previews and emulators
may keep it disabled until their native App Check providers are configured.

The separate `Build and submit TestFlight` workflow is intentionally manual.
It uses the production EAS profile, increments the native build number, and
submits the resulting iOS build using the protected `EXPO_TOKEN` secret.

## Places configuration

`searchVenues` always searches active Firestore venues. To supplement those results with
Google Places API (New), configure `GOOGLE_PLACES_API_KEY` in the Functions runtime environment
and enable Places API (New) for the same Google Cloud project. When the key is absent or Google
Places is temporarily unavailable, the callable returns the local matches instead of failing.
