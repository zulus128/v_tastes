export function authenticatedPhase(onboardingComplete: boolean): 'onboarding' | 'authenticated' {
  return onboardingComplete ? 'authenticated' : 'onboarding';
}
