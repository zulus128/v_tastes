import { describe, expect, it } from 'vitest';
import {
  allowsNotification,
  defaultNotificationPreferences,
  notificationCatalog,
  notificationTypes,
  renderNotificationCopy,
  type NotificationPreferences,
} from '../../packages/contracts/src';

describe('notification catalog', () => {
  it('describes every catalog entry with a channel and copy', () => {
    expect(notificationTypes).toHaveLength(44);
    for (const type of notificationTypes) {
      const definition = notificationCatalog[type];
      expect(definition.type).toBe(type);
      expect(definition.channels.length).toBeGreaterThan(0);
      expect(definition.title.length).toBeGreaterThan(0);
      expect(definition.body.length).toBeGreaterThan(0);
    }
  });

  it('fills templates and drops placeholders without a value', () => {
    expect(renderNotificationCopy('follow-new', { actor: '@kinney' }).title).toBe('@kinney started following you');
    expect(renderNotificationCopy('review-like', { actor: '@kinney', place: 'Wasabi' }).body).toBe('Your review of Wasabi');
    expect(renderNotificationCopy('inactive-reminder', { count: 5 }).title).toBe('5 new places opened near you');
    expect(renderNotificationCopy('inactive-reminder', {}).body).toBe('See what’s new');
  });

  it('honours the category and channel preferences', () => {
    const preferences: NotificationPreferences = {
      ...defaultNotificationPreferences,
      categories: { ...defaultNotificationPreferences.categories, likesComments: false },
    };
    expect(allowsNotification(preferences, 'review-like', 'push')).toBe(false);
    expect(allowsNotification(preferences, 'review-like', 'inApp')).toBe(true);
    expect(allowsNotification(preferences, 'follow-new', 'push')).toBe(true);
  });

  it('always delivers moderation and account notifications', () => {
    const silenced: NotificationPreferences = {
      enabled: false,
      push: false,
      email: false,
      sms: false,
      categories: defaultNotificationPreferences.categories,
    };
    expect(allowsNotification(silenced, 'account-restricted', 'push')).toBe(true);
    expect(allowsNotification(silenced, 'verification-code', 'sms')).toBe(true);
    expect(allowsNotification(silenced, 'partner-offer', 'push')).toBe(false);
  });

  it('never offers a channel a definition does not declare', () => {
    expect(allowsNotification(defaultNotificationPreferences, 'follow-new', 'email')).toBe(false);
    expect(allowsNotification(defaultNotificationPreferences, 'recap-ready', 'email')).toBe(true);
  });
});
