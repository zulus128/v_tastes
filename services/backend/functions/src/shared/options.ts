export const callableOptions = {
  region: 'europe-west1',
  // Local emulators do not mint App Check tokens. Every deployed callable must require one.
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
  cors: true,
  maxInstances: 10,
} as const;
