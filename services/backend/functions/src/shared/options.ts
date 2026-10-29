import { isRelaxedTestEnvironment } from './runtime-environment';

export const callableOptions = {
  region: 'europe-west1',
  // Production callables are deny-by-default. Tests and local emulators are the
  // only environments allowed to bypass attestation.
  enforceAppCheck: !isRelaxedTestEnvironment(),
  cors: true,
  invoker: 'public',
  maxInstances: 10,
} as const;

// This authenticated bootstrap endpoint must remain reachable by an older
// native build so an OTA can learn that the App Store update is required.
// Every state-changing mobile callable continues to enforce App Check.
export const sessionCallableOptions = {
  ...callableOptions,
  enforceAppCheck: false,
} as const;

// The admin console is a separate web client protected by staff claims. It
// does not yet ship a web App Check provider, so keep its endpoints explicit
// rather than silently weakening the mobile callable policy.
export const adminCallableOptions = {
  ...callableOptions,
  enforceAppCheck: false,
} as const;
