import type { ConversationSummary } from '@tastes/contracts';

function activityTime(conversation: ConversationSummary): number | null {
  if (conversation.kind !== 'activity' || !conversation.activityStartsAt)
    return null;
  const value = new Date(conversation.activityStartsAt).getTime();
  return Number.isFinite(value) ? value : null;
}

export function compareConversations(
  left: ConversationSummary,
  right: ConversationSummary,
  now = Date.now(),
): number {
  // A newly received personal message must be immediately visible even when
  // there are upcoming activity rows pinned in the inbox. Once it is read,
  // the normal upcoming-activity and recency ordering resumes.
  const leftNewDirect = left.kind === 'direct' && left.unreadCount > 0;
  const rightNewDirect = right.kind === 'direct' && right.unreadCount > 0;
  if (leftNewDirect !== rightNewDirect) return leftNewDirect ? -1 : 1;
  if (leftNewDirect && rightNewDirect)
    return right.updatedAt.localeCompare(left.updatedAt);

  const leftTime = activityTime(left);
  const rightTime = activityTime(right);
  const leftUpcoming = leftTime !== null && leftTime > now;
  const rightUpcoming = rightTime !== null && rightTime > now;
  if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
  if (leftUpcoming && rightUpcoming)
    return (leftTime as number) - (rightTime as number);
  return right.updatedAt.localeCompare(left.updatedAt);
}

export function activitySchedule(startsAt: string | null): string | null {
  if (!startsAt) return null;
  const date = new Date(startsAt);
  if (!Number.isFinite(date.getTime())) return null;
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `Dinner · ${weekday}, ${time}`;
}

export function activitySubtitle(
  startsAt: string | null,
  goingCount: number,
): string {
  const schedule = activitySchedule(startsAt);
  if (!schedule) return `${goingCount} going`;
  return `${schedule} · ${goingCount} going`;
}

export function reservationCountdown(
  startsAt: string | null,
  now = Date.now(),
): string | null {
  if (!startsAt) return null;
  const remaining = new Date(startsAt).getTime() - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const minutes = Math.ceil(remaining / 60_000);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.ceil(hours / 24)}d`;
}
