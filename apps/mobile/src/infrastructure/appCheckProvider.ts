export type AppleAppCheckProvider =
  'debug' | 'deviceCheck' | 'appAttestWithDeviceCheckFallback';

const FIRST_APP_ATTEST_ENTITLED_BUILD = 50;

export function selectAppleAppCheckProvider(
  isDevelopment: boolean,
  nativeBuildVersion: string | null,
): AppleAppCheckProvider {
  if (isDevelopment) return 'debug';

  const buildNumber = Number.parseInt(nativeBuildVersion ?? '', 10);
  if (
    Number.isFinite(buildNumber) &&
    buildNumber < FIRST_APP_ATTEST_ENTITLED_BUILD
  ) {
    // Builds through 49 were signed without the App Attest entitlement. They
    // must use DeviceCheck so an OTA can still obtain a valid App Check token.
    return 'deviceCheck';
  }

  return 'appAttestWithDeviceCheckFallback';
}
