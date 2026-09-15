import { sendNotification } from './notifications';

export const LEVEL_XP = 250;
export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.max(0, xp) / LEVEL_XP) + 1);
}

/** Raises the level-up notification when an XP change crosses a level boundary. */
export async function notifyLevelChange(profileId: string, previousXp: number, nextXp: number): Promise<void> {
  const previousLevel = levelForXp(previousXp);
  const nextLevel = levelForXp(nextXp);
  if (nextLevel <= previousLevel) return;
  await sendNotification({
    recipientId: profileId,
    type: 'level-up',
    eventKey: `level-${nextLevel}`,
    params: { level: nextLevel },
    targetId: String(nextLevel),
  });
}
