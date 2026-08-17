# Tastes Admin

Static Next.js staff application for moderation, user actions, venue management, and operational metrics.

## Configure

Copy `.env.example` to `.env.local` and fill in the Web App values from Firebase Console → Project settings. Enable Email/Password in Firebase Authentication.

Create the staff account in Firebase Authentication, then assign its claim using Application Default Credentials:

```bash
gcloud auth application-default login
pnpm build
pnpm admin:set-role admin@tastes.com admin
```

The user must sign out and back in after a role changes so Firebase refreshes the ID token.

## Develop and deploy

```bash
pnpm dev:admin
pnpm build:admin
firebase hosting:sites:create tastes-admin
firebase deploy --only hosting,functions,firestore:indexes
```

Connect `admin.tastes.com` to the `tastes-admin` Hosting site in Firebase Console. The exported site uses Firebase Auth and callable Functions directly; it does not require a Next.js server.

## Analytics metrics

The dashboard reads DAU/MAU from GA4 property `550185288` through the Google Analytics Data API. Grant the Functions runtime service account
`254210443804-compute@developer.gserviceaccount.com` Viewer access to that property in Google Analytics Admin.

Temporary suspensions are automatically reinstated by the `reinstateExpiredSuspensions` scheduled function every 30 minutes. Scheduled functions require billing to be enabled in the Firebase project.
