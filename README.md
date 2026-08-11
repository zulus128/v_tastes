# Tastes local development

Local-first Firebase backend and a minimal Expo client for validating the Tastes API. No Firebase account is required for this stage.

## Requirements

- Node.js 22.13 or newer (see `.nvmrc`)
- pnpm 11
- Java 21+

## Start

```bash
pnpm install
pnpm dev
```

This starts the Functions compiler, Firebase Emulator Suite, Emulator UI at `http://127.0.0.1:4000`, and the Tastes Expo Development Client on Metro port `8082`.

The mobile app uses its own native development build rather than Expo Go. Build it once on a new machine or after adding native dependencies:

```bash
pnpm mobile:build:ios
```

After that, `pnpm dev:ios` starts the backend, emulators, Metro, and opens the already-installed Tastes app. JavaScript and TypeScript changes use Fast Refresh without rebuilding Xcode.

Alternatively, use `pnpm dev:ios` or `pnpm dev:android` to open the simulator/emulator automatically without keyboard shortcuts.

The workspace pins a local Node 22 runtime for Firebase Functions and automatically selects Java 21 on macOS, so global Node/Java defaults do not control the emulators.

Local demo data is seeded automatically after Firestore starts. To reapply it manually:

```bash
pnpm seed
pnpm smoke
```

For a repeatable long-comments stress test, seed up to 1,000 isolated comments on the
`discover-review-gemini` fixture. The command replaces only documents whose source is
`stress-scroll`; cleanup leaves the normal demo data intact:

```bash
STRESS_SCROLL_COUNT=300 pnpm seed
STRESS_SCROLL_CLEANUP=true pnpm seed
```

For an image-heavy feed test, create up to 500 isolated reviews with two unique
remote dish-image URLs per card. Open Home → Friends after seeding. Cleanup removes
only fixture documents and the Storage objects referenced by those documents:

```bash
STRESS_IMAGE_COUNT=300 pnpm seed
STRESS_IMAGE_CLEANUP=true pnpm seed
```

Useful focused commands:

```bash
pnpm dev:emulators
pnpm dev:emulators:restore
pnpm dev:mobile
pnpm dev:ios
pnpm dev:android
pnpm mobile:build:ios
pnpm mobile:build:android
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm smoke` while the emulators are active to verify Auth, Callable Functions, Firestore transactions, profile creation, review creation, comments, and reactions end to end.

### Android test distribution

Pushes to `main` that change the mobile app or its workspace packages run the
EAS workflow in `apps/mobile/.eas/workflows/firebase-app-distribution.yml`.
It builds the `preview` APK and uploads it to the Firebase App Distribution app
`com.vkassin.tastes`, assigning the release to the `tastes-testers` group.

For the workflow to authenticate, add a Firebase service-account JSON key as a
secret file variable named `GOOGLE_APPLICATION_CREDENTIALS` in the EAS
`preview` environment before the next matching push. The service account needs
the Firebase App Distribution Admin role. Do not commit the key to the
repository.

### Local phone authentication

The test client uses the same passwordless flow planned for production:

1. Select a country and enter a phone number.
2. Tap Continue to request a verification code.
3. Enter the local emulator code `1332`.
4. The backend verifies the challenge and returns a Firebase Custom Token.

The local `FakeOtpProvider` never sends an SMS. Production deployment is intentionally blocked until a Twilio Verify implementation and secrets are configured. The resend cooldown is 30 seconds and a challenge expires after 10 minutes.

## Architecture boundary

- `apps/mobile` is a disposable test consumer.
- `services/backend`, `packages/contracts`, and backend documentation form the transferable backend deliverable.
- Clients read allowed Firestore data under Security Rules.
- Business mutations use Callable Functions.
- Domain contracts do not depend on React Native.

## Local environment

The local project ID is `demo-tastes`. Android emulators connect through `10.0.2.2`; iOS simulators and web use `127.0.0.1`.

Firestore uses port `8180` because port `8080` is commonly occupied by local Docker services.

App Check is deliberately disabled for local callable functions. It will be enabled in staging before production enforcement.
