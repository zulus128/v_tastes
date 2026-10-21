const EPOCH_ISO = new Date(0).toISOString();

function timestampToIso(value: unknown): string | null {
  if (value && typeof value === 'object' && 'toDate' in value) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toISOString();
  }
  if (typeof value === 'string' && value.length > 0) return value;
  return null;
}

export function conversationReadReceipt({
  participantIds,
  userId,
  lastMessageId,
  lastReadMessageIds,
  lastReadAt,
}: {
  participantIds: string[];
  userId: string;
  lastMessageId: string | null;
  lastReadMessageIds: Record<string, unknown>;
  lastReadAt: Record<string, unknown>;
}): { readByCount: number; readAt: string | null } {
  if (!lastMessageId) return { readByCount: 0, readAt: null };

  const readers = participantIds.filter(
    (id) => id !== userId && lastReadMessageIds[id] === lastMessageId,
  );
  const readAt =
    readers
      .map((id) => timestampToIso(lastReadAt[id]))
      .filter((value): value is string => Boolean(value) && value !== EPOCH_ISO)
      .sort()
      .at(-1) ?? null;

  return { readByCount: readers.length, readAt };
}
