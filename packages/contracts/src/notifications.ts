import { z } from 'zod';

export const notificationGroups = [
  'follows',
  'likesComments',
  'friendsActivity',
  'messages',
  'rewards',
  'recap',
  'savedPlaces',
  'reminders',
  'moderation',
  'account',
  'promotions',
] as const;
export type NotificationGroup = (typeof notificationGroups)[number];

/** Preference buckets shown in Settings → Notifications. `always` is not switchable. */
export const notificationCategories = [
  'follows',
  'likesComments',
  'friendReviews',
  'messages',
  'badges',
  'recap',
  'savedPlaces',
  'reminders',
  'promotions',
  'always',
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

export const notificationSettingCategories = notificationCategories.filter(
  (category): category is Exclude<NotificationCategory, 'always'> => category !== 'always',
);
export type NotificationSettingCategory = (typeof notificationSettingCategories)[number];

export const notificationCategoryLabels: Record<NotificationCategory, string> = {
  follows: 'New followers & friend requests',
  likesComments: 'Likes & comments',
  friendReviews: "Friends' new reviews",
  messages: 'Messages',
  badges: 'Badges & levels',
  recap: 'Monthly recap',
  savedPlaces: 'Saved places',
  reminders: 'Reminders',
  promotions: 'Promotions & offers',
  always: 'Always delivered',
};

export const notificationChannels = ['inApp', 'push', 'email', 'sms'] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export const notificationTargetTypes = [
  'comments',
  'profile',
  'activity',
  'recap',
  'review',
  'place',
  'chat',
  'leaderboard',
  'requests',
  'messageRequests',
  'rewards',
  'discover',
  'settings',
  'account',
  'compose',
  'draft',
  'moderation',
] as const;
export type NotificationTargetType = (typeof notificationTargetTypes)[number];

export const notificationTypes = [
  'follow-new',
  'follow-request',
  'follow-request-accepted',
  'follow-back',
  'contact-joined',
  'review-like',
  'review-comment',
  'comment-reply',
  'mention',
  'review-milestone',
  'friend-review',
  'saved-place-review',
  'city-first-review',
  'friend-leaderboard',
  'message',
  'message-request',
  'group-added',
  'badge-unlocked',
  'level-up',
  'badge-almost',
  'leaderboard-overtaken',
  'season-results',
  'recap-ready',
  'recap-reminder',
  'saved-place-trending',
  'saved-place-nearby',
  'saved-place-changed',
  'draft-reminder',
  'inactive-reminder',
  'visit-review-reminder',
  'profile-incomplete',
  'report-received',
  'report-resolved',
  'content-removed',
  'account-restricted',
  'verification-code',
  'new-sign-in',
  'credentials-changed',
  'deletion-scheduled',
  'account-deleted',
  'city-launched',
  'new-feature',
  'partner-offer',
] as const;
export type NotificationType = (typeof notificationTypes)[number];

/** Legacy buckets the notifications list still groups rows by. */
export type NotificationKind = 'comment' | 'follow' | 'invite' | 'reward' | 'system';

export interface NotificationCopyParams {
  actor?: string | null;
  place?: string | null;
  city?: string | null;
  text?: string | null;
  badge?: string | null;
  group?: string | null;
  feature?: string | null;
  offer?: string | null;
  device?: string | null;
  field?: string | null;
  code?: string | null;
  date?: string | null;
  month?: string | null;
  level?: number | string | null;
  rank?: number | string | null;
  count?: number | string | null;
}

export interface NotificationDefinition {
  type: NotificationType;
  group: NotificationGroup;
  category: NotificationCategory;
  channels: readonly NotificationChannel[];
  kind: NotificationKind;
  targetType: NotificationTargetType | null;
  /** Templates use `{placeholder}` tokens resolved from NotificationCopyParams. */
  title: string;
  body: string;
}

const push = ['inApp', 'push'] as const;
const pushEmail = ['inApp', 'push', 'email'] as const;
const emailOnly = ['inApp', 'email'] as const;
const inAppOnly = ['inApp'] as const;
const smsOnly = ['sms'] as const;

export const notificationCatalog: Record<NotificationType, NotificationDefinition> = {
  'follow-new': {
    type: 'follow-new',
    group: 'follows',
    category: 'follows',
    channels: push,
    kind: 'follow',
    targetType: 'profile',
    title: '{actor} started following you',
    body: 'Tap to see their profile',
  },
  'follow-request': {
    type: 'follow-request',
    group: 'follows',
    category: 'follows',
    channels: push,
    kind: 'invite',
    targetType: 'requests',
    title: '{actor} wants to follow you',
    body: 'Accept or decline this request',
  },
  'follow-request-accepted': {
    type: 'follow-request-accepted',
    group: 'follows',
    category: 'follows',
    channels: push,
    kind: 'follow',
    targetType: 'profile',
    title: '{actor} accepted your follow request',
    body: 'You can now see what they post',
  },
  'follow-back': {
    type: 'follow-back',
    group: 'follows',
    category: 'follows',
    channels: push,
    kind: 'follow',
    targetType: 'profile',
    title: '{actor} followed you back',
    body: 'You both follow each other now',
  },
  'contact-joined': {
    type: 'contact-joined',
    group: 'follows',
    category: 'follows',
    channels: push,
    kind: 'follow',
    targetType: 'profile',
    title: '{actor} joined Tastes',
    body: 'Follow them to see their reviews',
  },
  'review-like': {
    type: 'review-like',
    group: 'likesComments',
    category: 'likesComments',
    channels: push,
    kind: 'comment',
    targetType: 'review',
    title: '{actor} liked your review',
    body: 'Your review of {place}',
  },
  'review-comment': {
    type: 'review-comment',
    group: 'likesComments',
    category: 'likesComments',
    channels: push,
    kind: 'comment',
    targetType: 'comments',
    title: '{actor} commented on your review',
    body: '“{text}”',
  },
  'comment-reply': {
    type: 'comment-reply',
    group: 'likesComments',
    category: 'likesComments',
    channels: push,
    kind: 'comment',
    targetType: 'comments',
    title: '{actor} replied to your comment',
    body: '“{text}”',
  },
  mention: {
    type: 'mention',
    group: 'likesComments',
    category: 'likesComments',
    channels: push,
    kind: 'comment',
    targetType: 'comments',
    title: '{actor} mentioned you',
    body: '“{text}”',
  },
  'review-milestone': {
    type: 'review-milestone',
    group: 'likesComments',
    category: 'likesComments',
    channels: push,
    kind: 'comment',
    targetType: 'review',
    title: 'Your review hit {count} likes',
    body: 'Your review of {place} is getting attention',
  },
  'friend-review': {
    type: 'friend-review',
    group: 'friendsActivity',
    category: 'friendReviews',
    channels: push,
    kind: 'comment',
    targetType: 'review',
    title: '{actor} reviewed {place}',
    body: 'New review from someone you follow',
  },
  'saved-place-review': {
    type: 'saved-place-review',
    group: 'friendsActivity',
    category: 'friendReviews',
    channels: push,
    kind: 'comment',
    targetType: 'review',
    title: '{actor} reviewed {place}',
    body: 'It’s on your saved list',
  },
  'city-first-review': {
    type: 'city-first-review',
    group: 'friendsActivity',
    category: 'friendReviews',
    channels: push,
    kind: 'comment',
    targetType: 'place',
    title: '{place} just got its first review',
    body: 'Be one of the first to try it in {city}',
  },
  'friend-leaderboard': {
    type: 'friend-leaderboard',
    group: 'friendsActivity',
    category: 'friendReviews',
    channels: push,
    kind: 'comment',
    targetType: 'leaderboard',
    title: '{actor} is #{rank} in {city} this month',
    body: 'See where you stand',
  },
  message: {
    type: 'message',
    group: 'messages',
    category: 'messages',
    channels: push,
    kind: 'comment',
    targetType: 'chat',
    title: '{actor} sent you a message',
    body: '{text}',
  },
  'message-request': {
    type: 'message-request',
    group: 'messages',
    category: 'messages',
    channels: push,
    kind: 'invite',
    targetType: 'messageRequests',
    title: '{actor} sent you a message request',
    body: 'Accept it to start chatting',
  },
  'group-added': {
    type: 'group-added',
    group: 'messages',
    category: 'messages',
    channels: push,
    kind: 'invite',
    targetType: 'chat',
    title: '{actor} added you to “{group}”',
    body: 'Say hi to the group',
  },
  'badge-unlocked': {
    type: 'badge-unlocked',
    group: 'rewards',
    category: 'badges',
    channels: push,
    kind: 'reward',
    targetType: 'rewards',
    title: 'Badge unlocked: {badge}',
    body: 'Tap to see your rewards',
  },
  'level-up': {
    type: 'level-up',
    group: 'rewards',
    category: 'badges',
    channels: push,
    kind: 'reward',
    targetType: 'rewards',
    title: 'You reached Level {level}',
    body: 'Keep reviewing to climb further',
  },
  'badge-almost': {
    type: 'badge-almost',
    group: 'rewards',
    category: 'badges',
    channels: push,
    kind: 'reward',
    targetType: 'rewards',
    title: 'Almost there: {badge}',
    body: 'One more review and it’s yours',
  },
  'leaderboard-overtaken': {
    type: 'leaderboard-overtaken',
    group: 'rewards',
    category: 'badges',
    channels: push,
    kind: 'reward',
    targetType: 'leaderboard',
    title: '{actor} just passed you',
    body: 'You’re now #{rank} in {city}',
  },
  'season-results': {
    type: 'season-results',
    group: 'rewards',
    category: 'badges',
    channels: push,
    kind: 'reward',
    targetType: 'leaderboard',
    title: '{month} is done — you finished #{rank}',
    body: 'See the full {city} leaderboard',
  },
  'recap-ready': {
    type: 'recap-ready',
    group: 'recap',
    category: 'recap',
    channels: pushEmail,
    kind: 'reward',
    targetType: 'recap',
    title: 'Your {month} recap is ready',
    body: 'See the places and flavours that made your month',
  },
  'recap-reminder': {
    type: 'recap-reminder',
    group: 'recap',
    category: 'recap',
    channels: push,
    kind: 'reward',
    targetType: 'recap',
    title: 'You haven’t seen your {month} recap yet',
    body: 'It only takes a minute',
  },
  'saved-place-trending': {
    type: 'saved-place-trending',
    group: 'savedPlaces',
    category: 'savedPlaces',
    channels: push,
    kind: 'comment',
    targetType: 'place',
    title: '{place} is trending in {city}',
    body: 'It’s on your saved list',
  },
  'saved-place-nearby': {
    type: 'saved-place-nearby',
    group: 'savedPlaces',
    category: 'savedPlaces',
    channels: push,
    kind: 'comment',
    targetType: 'place',
    title: 'You’re near {place}',
    body: 'It’s on your saved list',
  },
  'saved-place-changed': {
    type: 'saved-place-changed',
    group: 'savedPlaces',
    category: 'savedPlaces',
    channels: push,
    kind: 'comment',
    targetType: 'place',
    title: '{place} has changed',
    body: '{text}',
  },
  'draft-reminder': {
    type: 'draft-reminder',
    group: 'reminders',
    category: 'reminders',
    channels: push,
    kind: 'comment',
    targetType: 'draft',
    title: 'Your review of {place} is still a draft',
    body: 'Finish it in a couple of taps',
  },
  'inactive-reminder': {
    type: 'inactive-reminder',
    group: 'reminders',
    category: 'reminders',
    channels: push,
    kind: 'comment',
    targetType: 'discover',
    title: '{count} new places opened near you',
    body: 'See what’s new in {city}',
  },
  'visit-review-reminder': {
    type: 'visit-review-reminder',
    group: 'reminders',
    category: 'reminders',
    channels: push,
    kind: 'comment',
    targetType: 'compose',
    title: 'How was {place}?',
    body: 'Leave a review while it’s fresh',
  },
  'profile-incomplete': {
    type: 'profile-incomplete',
    group: 'reminders',
    category: 'reminders',
    channels: push,
    kind: 'comment',
    targetType: 'settings',
    title: 'Finish your profile',
    body: 'Add your favourite dish so people can find you',
  },
  'report-received': {
    type: 'report-received',
    group: 'moderation',
    category: 'always',
    channels: inAppOnly,
    kind: 'system',
    targetType: null,
    title: 'Thanks — we’ll review this',
    body: 'We’ll let you know once it has been checked',
  },
  'report-resolved': {
    type: 'report-resolved',
    group: 'moderation',
    category: 'always',
    channels: pushEmail,
    kind: 'system',
    targetType: 'moderation',
    title: 'We reviewed your report',
    body: 'Thanks for flagging it',
  },
  'content-removed': {
    type: 'content-removed',
    group: 'moderation',
    category: 'always',
    channels: pushEmail,
    kind: 'system',
    targetType: 'moderation',
    title: 'Your review of {place} was removed',
    body: 'Tap to see why',
  },
  'account-restricted': {
    type: 'account-restricted',
    group: 'moderation',
    category: 'always',
    channels: pushEmail,
    kind: 'system',
    targetType: 'account',
    title: 'Your account has been restricted',
    body: '{text}',
  },
  'verification-code': {
    type: 'verification-code',
    group: 'account',
    category: 'always',
    channels: smsOnly,
    kind: 'system',
    targetType: null,
    title: 'Your Tastes code is {code}',
    body: 'It expires in 5 minutes',
  },
  'new-sign-in': {
    type: 'new-sign-in',
    group: 'account',
    category: 'always',
    channels: pushEmail,
    kind: 'system',
    targetType: 'account',
    title: 'New sign-in on {device}',
    body: 'Was this you?',
  },
  'credentials-changed': {
    type: 'credentials-changed',
    group: 'account',
    category: 'always',
    channels: emailOnly,
    kind: 'system',
    targetType: 'account',
    title: 'Your {field} was changed',
    body: 'Contact support if this wasn’t you',
  },
  'deletion-scheduled': {
    type: 'deletion-scheduled',
    group: 'account',
    category: 'always',
    channels: emailOnly,
    kind: 'system',
    targetType: null,
    title: 'Your account will be deleted on {date}',
    body: 'Sign in before then to cancel',
  },
  'account-deleted': {
    type: 'account-deleted',
    group: 'account',
    category: 'always',
    channels: emailOnly,
    kind: 'system',
    targetType: null,
    title: 'Your Tastes account has been deleted',
    body: 'We’re sorry to see you go',
  },
  'city-launched': {
    type: 'city-launched',
    group: 'promotions',
    category: 'promotions',
    channels: pushEmail,
    kind: 'system',
    targetType: 'discover',
    title: 'Tastes is now live in {city}',
    body: 'Discover the first places',
  },
  'new-feature': {
    type: 'new-feature',
    group: 'promotions',
    category: 'promotions',
    channels: push,
    kind: 'system',
    targetType: 'discover',
    title: '{feature}',
    body: '{text}',
  },
  'partner-offer': {
    type: 'partner-offer',
    group: 'promotions',
    category: 'promotions',
    channels: push,
    kind: 'system',
    targetType: 'place',
    title: '{offer} at {place}',
    body: '{text}',
  },
};

export const notificationTypesByCategory = notificationTypes.reduce(
  (grouped, type) => {
    const { category } = notificationCatalog[type];
    grouped[category] = [...(grouped[category] ?? []), type];
    return grouped;
  },
  {} as Record<NotificationCategory, NotificationType[]>,
);

export function isNotificationType(value: unknown): value is NotificationType {
  return typeof value === 'string' && value in notificationCatalog;
}

/** Fills `{placeholder}` tokens, drops the ones without a value, and tidies the leftovers. */
export function renderNotificationTemplate(template: string, params: NotificationCopyParams = {}): string {
  return template
    .replace(/\{(\w+)\}/g, (_match, key: string) => {
      const value = (params as Record<string, unknown>)[key];
      return value === undefined || value === null || value === '' ? '' : String(value);
    })
    .replace(/[“"']{2}/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/(^[\s—–-]+)|([\s—–-]+$)/g, '')
    // A dropped placeholder can leave the sentence hanging on its preposition.
    .replace(/\s+(in|at|on|of|for|to|from)$/i, '')
    .trim();
}

export function renderNotificationCopy(
  type: NotificationType,
  params: NotificationCopyParams = {},
): { title: string; body: string } {
  const definition = notificationCatalog[type];
  return {
    title: renderNotificationTemplate(definition.title, params),
    body: renderNotificationTemplate(definition.body, params),
  };
}

export type NotificationCategoryPreferences = Record<NotificationSettingCategory, boolean>;

export const defaultNotificationCategoryPreferences: NotificationCategoryPreferences =
  Object.fromEntries(
    notificationSettingCategories.map((category) => [category, true]),
  ) as NotificationCategoryPreferences;

export const notificationCategoryPreferencesSchema = z.object(
  Object.fromEntries(
    notificationSettingCategories.map((category) => [category, z.boolean().default(true)]),
  ) as Record<NotificationSettingCategory, z.ZodDefault<z.ZodBoolean>>,
);

export interface NotificationPreferences {
  enabled: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  categories: NotificationCategoryPreferences;
}

export const defaultNotificationPreferences: NotificationPreferences = {
  enabled: true,
  push: true,
  email: true,
  sms: false,
  categories: defaultNotificationCategoryPreferences,
};

/** Decides whether one channel of one notification type may be delivered. */
export function allowsNotification(
  preferences: NotificationPreferences,
  type: NotificationType,
  channel: NotificationChannel,
): boolean {
  const definition = notificationCatalog[type];
  const category = definition.category;
  if (!definition.channels.includes(channel)) return false;
  if (category === 'always') return true;
  if (channel === 'inApp') return true;
  if (!preferences.enabled) return false;
  if (channel === 'push' && !preferences.push) return false;
  if (channel === 'email' && !preferences.email) return false;
  if (channel === 'sms' && !preferences.sms) return false;
  return preferences.categories[category] !== false;
}
