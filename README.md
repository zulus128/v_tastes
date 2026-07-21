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

Seed venues after the emulators are running:

```bash
pnpm seed
pnpm smoke
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

### Local phone authentication

The test client uses the same passwordless flow planned for production:

1. Select a country and enter a phone number.
2. Tap Continue to request a verification code.
3. Enter the local emulator code `1332`.
4. The backend verifies the challenge and returns a Firebase Custom Token.

The local `FakeOtpProvider` never sends an SMS. Production deployment is intentionally blocked until a Twilio Verify implementation and secrets are configured. The resend cooldown is 30 seconds and a challenge expires after 10 minutes.

## Architecture boundary

- `apps/mobile` is a disposable test consumer.
- `services/backend/functions`, `firebase`, `packages/contracts`, tests, and documentation form the transferable backend deliverable.
- Clients read allowed Firestore data under Security Rules.
- Business mutations use Callable Functions.
- Domain contracts do not depend on React Native.

## Local environment

The local project ID is `demo-tastes`. Android emulators connect through `10.0.2.2`; iOS simulators and web use `127.0.0.1`.

Firestore uses port `8180` because port `8080` is commonly occupied by local Docker services.

App Check is deliberately disabled for local callable functions. It will be enabled in staging before production enforcement.
