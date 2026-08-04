export type VerificationFailureState = 'incorrect' | 'expired' | 'locked' | 'failure';

export function verificationFailureState(reason: unknown): VerificationFailureState {
  if (reason === 'code-expired') return 'expired';
  if (reason === 'max-attempts-reached') return 'locked';
  if (reason === 'incorrect-code') return 'incorrect';
  return 'failure';
}
