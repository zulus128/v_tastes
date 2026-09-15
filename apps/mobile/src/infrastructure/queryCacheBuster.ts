export function queryCacheBuster({
  nativeBuildVersion,
  runtimeVersion,
  updateId,
}: {
  nativeBuildVersion: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
}) {
  return [
    nativeBuildVersion ?? 'development',
    runtimeVersion ?? 'development-runtime',
    updateId ?? 'embedded',
  ].join(':');
}
