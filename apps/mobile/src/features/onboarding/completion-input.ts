import type { CompleteOnboardingInput } from '@tastes/contracts';

type CompletionInput = Partial<Omit<CompleteOnboardingInput, 'version'>>;

interface BuildCompletionInputOptions {
  appearance: CompleteOnboardingInput['appearance'];
  dish: string | null;
  invitedContactCount: number;
  place: string | null;
}

export function buildCompletionInput({
  appearance,
  dish,
  invitedContactCount,
  place,
}: BuildCompletionInputOptions): CompletionInput {
  return {
    invitedContactCount,
    appearance,
    ...(dish ? { favoriteDish: dish } : {}),
    ...(place ? { favoriteVenueId: place } : {}),
  };
}
