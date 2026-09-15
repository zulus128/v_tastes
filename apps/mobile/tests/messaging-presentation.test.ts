import type { ConversationSummary } from '@tastes/contracts';
import { describe, expect, it } from 'vitest';
import { activitySubtitle, compareConversations, reservationCountdown } from '../src/features/messaging/presentation';

function conversation(id: string, overrides: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id,
    kind: 'direct',
    participantIds: [],
    otherParticipant: null,
    activityId: null,
    title: null,
    imageUrl: null,
    organizerId: null,
    invitationStatus: null,
    activityStartsAt: null,
    activityAddress: null,
    memberCount: 1,
    lastMessage: null,
    unreadCount: 0,
    createdAt: '2026-09-15T08:00:00.000Z',
    updatedAt: '2026-09-15T08:00:00.000Z',
    ...overrides,
  };
}

describe('messaging presentation', () => {
  it('floats upcoming activities by the nearest reservation first', () => {
    const now = new Date('2026-09-15T10:00:00.000Z').getTime();
    const direct = conversation('direct', { updatedAt: '2026-09-15T12:00:00.000Z' });
    const later = conversation('later', { kind: 'activity', activityStartsAt: '2026-09-15T14:00:00.000Z' });
    const sooner = conversation('sooner', { kind: 'activity', activityStartsAt: '2026-09-15T11:00:00.000Z' });
    expect([direct, later, sooner].sort((a, b) => compareConversations(a, b, now)).map((item) => item.id))
      .toEqual(['sooner', 'later', 'direct']);
  });

  it('returns passed activities to normal recency order', () => {
    const now = new Date('2026-09-15T10:00:00.000Z').getTime();
    const passed = conversation('passed', { kind: 'activity', activityStartsAt: '2026-09-15T09:00:00.000Z' });
    const recent = conversation('recent', { updatedAt: '2026-09-15T12:00:00.000Z' });
    expect([passed, recent].sort((a, b) => compareConversations(a, b, now)).map((item) => item.id))
      .toEqual(['recent', 'passed']);
  });

  it('formats activity metadata and countdowns', () => {
    expect(activitySubtitle('2026-09-18T20:00:00.000Z', 4)).toContain('4 going');
    expect(reservationCountdown('2026-09-15T12:00:00.000Z', new Date('2026-09-15T10:00:00.000Z').getTime())).toBe('in 2h');
  });
});
