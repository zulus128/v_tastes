# Mobile OTA updates

Tastes uses EAS Update to ship compatible JavaScript and bundled asset changes
without creating a new native binary.

## Channels

| Build profile | OTA channel | Purpose |
| --- | --- | --- |
| `layout-preview` | `layout-preview` | Internal resizable-layout builds |
| `preview` | `preview` | Internal preview builds |
| `production` | `production` | App Store and production builds |

Channels are embedded in a native build. The `layout-preview` profile produces
an internal-distribution binary, so it cannot be promoted through the
production App Store submission profile. Existing TestFlight build 45 keeps
its embedded `layout-preview` channel for OTA layout testing.

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
background, and applies it on the next launch.

## Runtime compatibility

The runtime version follows the public app version. JavaScript, styles, and
bundled assets can be updated over the air while the native runtime remains
unchanged. Increment the public app version and create a new native build when
changing the Expo SDK, native dependencies, entitlements, capabilities, or
other native configuration.

Production updates must be published separately to the `production` channel.
There is intentionally no automatic production publish from GitHub Actions.
