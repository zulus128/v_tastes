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

This starts the Functions compiler, Firebase Emulator Suite, Emulator UI at `http://127.0.0.1:4000`, and Expo.

After Expo prints `Waiting on http://localhost:8081`, press `i` in the same terminal for iOS Simulator or `a` for Android Emulator. Input is routed to the mobile process.

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
pnpm lint
pnpm typecheck
pnpm test
```

Run `pnpm smoke` while the emulators are active to verify Auth, Callable Functions, Firestore transactions, profile creation, review creation, comments, and reactions end to end.

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
