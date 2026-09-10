# Local quality gates

Husky installs the repository hooks through the root `prepare` script after `pnpm install`.

## Pre-commit

The pre-commit hook:

1. blocks staged environment-specific files, credentials, private keys, production signing files,
   and Firebase client configuration files;
2. runs ESLint and Prettier fixes through lint-staged;
3. scans supported staged text files with secretlint's recommended credential rules.

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

Accepted audit findings must have a narrow, documented entry in `pnpm-workspace.yaml`. The current
`image-size` exceptions are limited to Metro's build-time parsing of repository-owned assets because
the React Native toolchain does not yet accept the patched major version.

Git hooks can be bypassed with `--no-verify`; CI remains the authoritative gate.
