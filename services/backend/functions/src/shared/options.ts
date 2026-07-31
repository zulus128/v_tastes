import { isRelaxedTestEnvironment } from './runtime-environment';

export const callableOptions = {
  region: 'europe-west1',
  // Enable only after the mobile app initializes native App Check providers.
  enforceAppCheck:
    process.env.ENFORCE_APP_CHECK === 'true' &&
    !isRelaxedTestEnvironment(),
  cors: true,
  invoker: 'public',
  maxInstances: 10,
} as const;
