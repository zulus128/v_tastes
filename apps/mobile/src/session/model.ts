export function authenticatedPhase(
  onboardingComplete: boolean,
): 'onboarding' | 'authenticated' {
  return onboardingComplete ? 'authenticated' : 'onboarding';
}

const TERMINAL_TOKEN_ERROR_CODES = new Set([
  'auth/invalid-user-token',
  'auth/user-disabled',
  'auth/user-token-expired',
]);

export function shouldClearSessionAfterTokenRefresh(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? error.code : undefined;
  return typeof code === 'string' && TERMINAL_TOKEN_ERROR_CODES.has(code);
}
