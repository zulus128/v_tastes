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

## Places configuration

`searchVenues` always searches active Firestore venues. To supplement those results with
Google Places API (New), configure `GOOGLE_PLACES_API_KEY` in the Functions runtime environment
and enable Places API (New) for the same Google Cloud project. When the key is absent or Google
Places is temporarily unavailable, the callable returns the local matches instead of failing.
