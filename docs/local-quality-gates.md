# Local quality gates

Husky installs the repository hooks through the root `prepare` script after `pnpm install`.

## Pre-commit

The pre-commit hook:

1. blocks staged environment-specific files, credentials, private keys, production signing files,
   and Firebase client configuration files;
2. runs ESLint and Prettier fixes through lint-staged;
3. scans supported staged text files, including package-manager auth configuration such as
   `.npmrc`, with secretlint's recommended credential rules.

Environment templates such as `.env.example` and development-only `debug.keystore` are allowed.
Secret values must never be added to those templates.

Run the hook manually with:

```sh
.husky/pre-commit
```

## Pre-push

The pre-push hook runs the same main quality gate used by CI: build, lint, type-checking, tests,
and a production dependency audit.

Run it manually with:

```sh
pnpm run prepush
```

Audit findings are never hidden from this gate. The currently unpatched `image-size` advisories are
documented in [ADR 0008](adr/0008-dependency-security-exceptions.md) and intentionally remain
release-blocking until a compatible patched version is available.

Git hooks can be bypassed with `--no-verify`. CI remains the authoritative gate: it rejects
forbidden credential files in the submitted diff, scans supported changed text files with
secretlint, and audits production dependencies before running the build and test suite.
