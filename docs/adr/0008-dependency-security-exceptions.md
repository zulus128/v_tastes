# ADR 0008: Temporary dependency security exception

Status: temporary, release-blocking review required

## Resolved advisories

Workspace overrides pin patched transitive versions of `fast-xml-parser`,
`brace-expansion`, `js-yaml`, `nanoid`, `postcss`, and `uuid`. In particular,
the Functions runtime now resolves `fast-xml-parser` 5.10.1, closing
GHSA-8r6m-32jq-jx6q.

## Remaining upstream exception

As of 2026-08-11, `pnpm audit --prod` reports GHSA-w3rx-r6r6-pgpr and
GHSA-5p2g-fcmc-qvqq against `image-size` 2.0.2. Both advisories list 2.0.3 as
the patched release, but the npm registry still exposes 2.0.2 as the latest
published version. Installing the advertised patched version therefore fails.

The dependency is reached through Metro / React Native build tooling. It is
not imported by Firebase Functions or used to parse user-controlled files at
runtime. Mobile review photos are decoded by the native platform and uploaded
directly to Firebase Storage; the backend does not pass them to `image-size`.
This reduces current exposure but does not make the advisory resolved.

## Exit criteria

- Replace the override-free transitive dependency with `image-size` 2.0.3 or
  a later compatible version as soon as it is published by updating Expo /
  React Native / Metro or adding a workspace override.
- Re-run `pnpm audit --prod`, the complete test suite, and both native builds.
- Do not silently add these advisory IDs to an audit ignore list.
- Revisit this exception before any public production release.
