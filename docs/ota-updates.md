# Mobile OTA updates

Tastes uses EAS Update to ship compatible JavaScript and bundled asset changes
without creating a new native binary.

## Channels

| Build profile | OTA channel | Purpose |
| --- | --- | --- |
| `layout-preview` | `layout-preview` | Internal resizable-layout builds |
| `testflight-layout` | `layout-preview` | TestFlight layout testing, including iOS-on-Mac |
| `preview` | `preview` | Internal preview builds |
| `production` | `production` | App Store and production builds |

Channels are embedded in a native build and select its OTA updates; they do not
select a Git branch or a backend. Both layout profiles use the production
backend. The `layout-preview` profile uses internal distribution (ad hoc on
iOS), which cannot be uploaded to TestFlight. Use `testflight-layout` when a new
TestFlight binary is needed. Existing TestFlight build 45 already contains the
`layout-preview` channel and can keep receiving compatible layout updates.

TestFlight and App Store distribution use the same kind of store-signed iOS
binary. A `testflight-layout` binary therefore **can** be selected for an App
Store release in App Store Connect. Its channel would remain `layout-preview`
for App Store users too. The EAS submission profile only selects the destination
app; it does not enforce the build's OTA channel. Before submitting a production
release, inspect the exact build with
`pnpm --filter @tastes/mobile exec eas build:view <build-id> --json`, verify its
`buildProfile` and `updateChannel.name` are both `production`, and submit that
same ID with
`pnpm --filter @tastes/mobile exec eas submit --platform ios --profile production --id <build-id>`.
Select that verified build number in App Store Connect, never the latest build
merely because its number is higher.

Store builds share the app's remote build-number sequence. A higher TestFlight
build number alone is not a reason to raise the backend's minimum supported
build; do that only after the corresponding production release is available in
the App Store.

## Publish a layout preview

Run the checks first:

```sh
pnpm --filter @tastes/mobile typecheck
pnpm --filter @tastes/mobile test
```

Then publish explicitly from the current working tree:

```sh
pnpm --filter @tastes/mobile update:layout-preview --message "Describe the layout change"
```

Publishing is manual. A commit or push does not publish an OTA update. The
installed app checks on launch, downloads a compatible update in the
background, and applies it on the next cold launch after the download finishes.
Simply switching away from the app and returning does not restart its runtime.

`--environment production` loads the production variables stored in EAS, not
the `env` block of a build profile in `eas.json`. Keep those EAS variables in sync
with the native build, particularly the Firebase project/database, emulator
flag, and sign-in client IDs. Local `.env` files are not used by this command.
Before publishing, use `pnpm --filter @tastes/mobile exec eas env:list production` to confirm that
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` are
present as well as the Firebase variables; omitting them disables Google
sign-in after the update. Client-side `EXPO_PUBLIC_*` values must be readable by
EAS Update (plain text or sensitive visibility, not secret).

## Runtime compatibility

The runtime version follows the public app version. JavaScript, styles, and
bundled assets can be updated over the air while the native runtime remains
unchanged. Increment the public app version and create a new native build when
changing the Expo SDK, native dependencies, entitlements, capabilities, or
other native configuration.

Build 45 uses runtime `1.0.0`; keep that version for JavaScript-only layout
updates intended for it. A new native build number does not change this runtime
policy. Before publishing an OTA, review the changes since its target binary
and confirm no native dependency or native configuration changed. If one did,
increment `expo.version` in `app.json`, build the new runtime, and publish only
to that runtime. Switching runtime policy now would also require a new binary.

Production updates must be published separately to the `production` channel.
There is intentionally no automatic production publish from GitHub Actions.

See the Expo documentation for [SDK 57 update behavior](https://docs.expo.dev/versions/v57.0.0/sdk/updates/),
[EAS environment variables](https://docs.expo.dev/eas/environment-variables/), and
[internal distribution](https://docs.expo.dev/build/internal-distribution/).
