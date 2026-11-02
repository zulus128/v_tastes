# ADR 0008: Temporary dependency security exception

Status: temporary, explicitly accepted exception; review required

## Resolved advisories

Workspace overrides pin patched transitive versions of `fast-xml-parser`,
`brace-expansion`, `js-yaml`, `nanoid`, `postcss`, and `uuid`. In particular,
the Functions runtime now resolves `fast-xml-parser` 5.10.1, closing
GHSA-8r6m-32jq-jx6q. React Navigation core is pinned to 7.22.1, which removes
the vulnerable `query-string` / `decode-uri-component` dependency path.

The former exceptions GHSA-vfj7-8cjw-p6xm (`braces`) and
GHSA-hp3w-g68c-fv3c (`sprintf-js`) were removed on 2026-10-29 because GitHub
withdrew both advisories. Next.js is pinned to 16.4.2, and workspace overrides
select patched `body-parser`, `qs`, and `re2js` releases.

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

GHSA-86w9-cpqp-85rv affects `node-forge` 1.4.0 through Expo/EAS certificate
and build tooling. No patched `node-forge` release is currently listed. The
application and Firebase Functions do not use `node-forge` to verify runtime
user input; the affected path is limited to trusted local/CI mobile build and
signing operations.

GHSA-mrhx-c7xc-m3w5 affects Zod 3.25.76 bundled by Expo CLI. Runtime contracts
and Functions use patched Zod 4.6.7. Forcing Expo CLI across the Zod 3→4 major
boundary is incompatible, so the exception is limited to trusted build-tool
inputs until Expo upgrades its CLI dependency.

GHSA-gcqx-w48m-w2h4 affects unpatched `deepmerge` 4.3.1 in Expo/React Native
configuration tooling. It is not bundled into Firebase Functions or used to
merge remote application data. Expo configuration is repository-controlled,
so the current exposure is limited to trusted local/CI build configuration.

GHSA-g3hv-75wg-m249 (`minimatch` 3.1.5 / 10.2.5) and GHSA-3g3m-2fjr-6pw4
(`glob` 13.0.6) were reported on 2026-11-02. Both are reached only through
Expo CLI config loading and Jest/Istanbul coverage tooling, which glob
repository-controlled paths. The patched releases (`minimatch` 11.0.1,
`glob` 14.0.2) are new majors with incompatible APIs for those callers, so
forcing them would break builds. Neither package is bundled into the app or
Firebase Functions. On the same date `node-forge` was pinned to 1.4.2 and
`joi` to 17.13.9 through workspace overrides.

## Exit criteria

- Remove the `image-size` exceptions and replace the transitive dependency with `image-size` 2.0.3 or
  a later compatible version as soon as it is published by updating Expo /
  React Native / Metro or adding a workspace override.
- Remove the `minimatch` and `glob` exceptions once Expo CLI and Jest depend
  on the patched majors.
- Remove the `node-forge`, Expo CLI Zod, and `deepmerge` exceptions as soon as
  their upstream dependency chains publish compatible patched releases.
- Re-run `pnpm audit --prod`, the complete test suite, and both native builds.
- Do not silently add advisory IDs to the audit ignore list; every exception
  must record dependency path, exposure, and exit criteria in this ADR.
- Revisit this exception before any public production release.
