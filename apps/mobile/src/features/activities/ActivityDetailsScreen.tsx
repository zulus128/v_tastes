import { doc, getDoc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import restaurantImage from '../../../assets/discover/restaurant.png';
import { apiErrorMessage } from '@tastes/firebase-client';
import { firestore } from '../../infrastructure/firebase';
import {
  useAuthenticatedUserId,
  useTastesApi,
} from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';

type Member = {
  id: string;
  displayName: string;
  username: string | null;
  photoUrl: string | null;
};

type ActivityDetails = {
  organizerId: string;
  startsAt: Date;
  venue: {
    id: string;
    address: string;
    category: string;
    city: string;
    imageUrl: string | null;
    name: string;
    priceLevel: number;
    rating: number;
    reviewCount: number;
  };
  members: Member[];
};

function imageFor(url: string | null): ImageSourcePropType {
  return url ? { uri: url } : restaurantImage;
}

function memberFromData(id: string, data: DocumentData | undefined): Member {
  return {
    id,
    displayName:
      typeof data?.displayName === 'string' ? data.displayName : 'Tastes user',
    username: typeof data?.username === 'string' ? data.username : null,
    photoUrl: typeof data?.photoUrl === 'string' ? data.photoUrl : null,
  };
}

export function ActivityDetailsScreen({
  activityId,
  onBack,
  onEdit,
}: {
  activityId: string;
  onBack: () => void;
  onEdit: (activityId: string) => void;
}) {
  const api = useTastesApi();
  const currentUserId = useAuthenticatedUserId();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [details, setDetails] = useState<ActivityDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (__DEV__ && activityId === 'visual-audit-activity') {
      setDetails({
        organizerId: 'visual-audit-user',
        startsAt: new Date('2026-09-20T19:00:00Z'),
        venue: {
          id: 'visual-audit-venue',
          address: '38 Beauchamp Place',
          category: 'Restaurant',
          city: 'London',
          imageUrl: null,
          name: 'Gemini',
          priceLevel: 2,
          rating: 4.8,
          reviewCount: 24,
        },
        members: [],
      });
      setError(null);
      return undefined;
    }
    return onSnapshot(
      doc(firestore, 'activities', activityId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError('This activity is no longer available.');
          return;
        }
        const data = snapshot.data();
        const participantIds = Array.isArray(data.participantIds)
          ? data.participantIds.filter(
              (value): value is string => typeof value === 'string',
            )
          : [];
        const venueId = String(data.venueId ?? '');
        void Promise.all([
          getDoc(doc(firestore, 'venues', venueId)),
          ...participantIds.map((participantId) =>
            getDoc(doc(firestore, 'users', participantId)),
          ),
        ])
          .then(([venueSnapshot, ...profiles]) => {
            const venue = venueSnapshot.data();
            const startsAt =
              data.startsAt && typeof data.startsAt.toDate === 'function'
                ? (data.startsAt.toDate() as Date)
                : new Date(String(data.startsAt ?? 0));
            setDetails({
              organizerId: String(data.organizerId ?? ''),
              startsAt,
              venue: {
                id: venueId,
                address:
                  typeof venue?.address === 'string' ? venue.address : '',
                category:
                  typeof venue?.category === 'string'
                    ? venue.category
                    : 'Restaurant',
                city: typeof venue?.city === 'string' ? venue.city : '',
                imageUrl:
                  typeof venue?.imageUrl === 'string' ? venue.imageUrl : null,
                name:
                  typeof venue?.name === 'string'
                    ? venue.name
                    : String(data.venueName ?? 'Activity'),
                priceLevel: Math.max(0, Number(venue?.priceLevel ?? 0)),
                rating: Math.max(0, Number(venue?.rating ?? 0)),
                reviewCount: Math.max(0, Number(venue?.reviewCount ?? 0)),
              },
              members: participantIds.map((id, index) =>
                memberFromData(id, profiles[index]?.data()),
              ),
            });
            setError(null);
          })
          .catch(() => setError('Could not load activity details.'));
      },
      () => setError('Could not load activity details.'),
    );
  }, [activityId]);

  useEffect(() => {
    if (!details) return;
    let active = true;
    void api
      .getMessages({ conversationId: activityId, cursor: null, limit: 50 })
      .then((result) => {
        if (active)
          setMediaUrls(
            result.data.items.flatMap((message) =>
              message.imageUrl ? [message.imageUrl] : [],
            ),
          );
      })
      .catch(() => {
        if (active) setMediaUrls([]);
      });
    return () => {
      active = false;
    };
  }, [activityId, api, details?.startsAt]);

  if (!details) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <ActivityIndicator color={colors.primary} />
        )}
        <Pressable onPress={onBack} style={styles.centerBack}>
          <Text style={styles.centerBackText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const date = details.startsAt.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const time = details.startsAt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  const price =
    details.venue.priceLevel > 0 ? '$'.repeat(details.venue.priceLevel) : null;
  const admin =
    currentUserId === details.organizerId ||
    (__DEV__ && activityId === 'visual-audit-activity');
  const finish = async (action: 'delete' | 'leave') => {
    try {
      if (action === 'delete') await api.deleteActivity({ activityId });
      else await api.leaveActivity({ activityId });
      onBack();
    } catch (actionError) {
      Alert.alert(`Could not ${action} activity`, apiErrorMessage(actionError));
    }
  };
  const removeMember = async (memberId: string) => {
    setUpdatingMemberId(memberId);
    try {
      await api.updateActivity({
        activityId,
        venueId: details.venue.id,
        startsAt: details.startsAt.toISOString(),
        memberIds: details.members
          .filter(
            (member) =>
              member.id !== memberId && member.id !== details.organizerId,
          )
          .map((member) => member.id),
      });
    } catch (actionError) {
      Alert.alert('Could not remove member', apiErrorMessage(actionError));
    } finally {
      setUpdatingMemberId(null);
    }
  };
  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={{
          paddingBottom:
            Math.max(insets.bottom, responsiveSize(16)) + responsiveSize(24),
        }}
        data={details.members}
        initialNumToRender={8}
        keyExtractor={(member) => member.id}
        ListHeaderComponent={
          <>
            <View style={styles.hero}>
              <Image
                source={imageFor(details.venue.imageUrl)}
                style={styles.heroImage}
              />
              <View style={styles.heroShade} />
              <View style={[styles.navigation, { paddingTop: insets.top }]}>
                <Pressable
                  accessibilityLabel="Back"
                  onPress={onBack}
                  style={styles.navButton}
                >
                  <Text style={styles.back}>‹</Text>
                </Pressable>
                <Text numberOfLines={1} style={styles.navTitle}>
                  {details.venue.name}
                </Text>
                <View style={styles.navActions}>
                  {admin ? (
                    <Pressable
                      accessibilityLabel="Edit activity"
                      onPress={() => onEdit(activityId)}
                      style={styles.navButton}
                    >
                      <Text style={styles.navActionText}>✎</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityLabel={
                      admin ? 'Delete activity' : 'Leave activity'
                    }
                    onPress={() =>
                      Alert.alert(
                        admin ? 'Delete activity?' : 'Leave activity?',
                        admin
                          ? 'This will remove the activity for everyone.'
                          : 'You will lose access to this activity chat.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: admin ? 'Delete' : 'Leave',
                            style: 'destructive',
                            onPress: () =>
                              void finish(admin ? 'delete' : 'leave'),
                          },
                        ],
                      )
                    }
                    style={styles.navButton}
                  >
                    <Text style={[styles.navActionText, styles.dangerText]}>
                      {admin ? '⌫' : '↗'}
                    </Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.datePill}>
                <Text style={styles.dateText}>
                  ▣ {date}, {time}
                </Text>
              </View>
            </View>

            <View style={styles.placeCard}>
              <View style={styles.ratingRow}>
                <Text style={styles.rating}>
                  ★ {details.venue.rating.toFixed(1)}
                </Text>
                <Text style={styles.reviews}>
                  {details.venue.reviewCount} reviews
                </Text>
              </View>
              <Text style={styles.placeName}>{details.venue.name}</Text>
              <Text numberOfLines={1} style={styles.address}>
                {details.venue.address || details.venue.city}
              </Text>
              <View style={styles.tags}>
                <Text style={styles.tag}>{details.venue.category}</Text>
                {price ? <Text style={styles.tag}>{price}</Text> : null}
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>MEDIA</Text>
              {mediaUrls.length ? (
                <View style={styles.mediaGrid}>
                  {mediaUrls.slice(0, 6).map((url, index) => (
                    <Image
                      key={`${url}-${index}`}
                      source={{ uri: url }}
                      style={styles.mediaPhoto}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.mediaEmpty}>
                  <Text style={styles.mediaEmptyTitle}>
                    No shared photos yet
                  </Text>
                  <Text style={styles.mediaEmptyCopy}>
                    Use the + button in chat to add photos here.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                MEMBERS ({details.members.length})
              </Text>
            </View>
          </>
        }
        maxToRenderPerBatch={8}
        renderItem={({ item: member }) => (
          <View style={[styles.memberRow, styles.memberRowInset]}>
            {member.photoUrl ? (
              <Image source={{ uri: member.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>
                  {member.displayName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.memberCopy}>
              <View style={styles.memberTitleRow}>
                <Text style={styles.memberName}>{member.displayName}</Text>
                {member.id === details.organizerId ? (
                  <Text style={styles.organizer}>Organizer</Text>
                ) : null}
              </View>
              <Text style={styles.memberHandle}>
                {member.username ? `@${member.username}` : 'Tastes member'}
              </Text>
            </View>
            {admin && member.id !== details.organizerId ? (
              <Pressable
                accessibilityLabel={`Remove ${member.displayName}`}
                disabled={updatingMemberId !== null}
                onPress={() =>
                  Alert.alert(
                    `Remove ${member.displayName}?`,
                    'They will lose access to this activity and its chat.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Remove',
                        style: 'destructive',
                        onPress: () => void removeMember(member.id),
                      },
                    ],
                  )
                }
                style={styles.removeMember}
              >
                {updatingMemberId === member.id ? (
                  <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                  <Text style={styles.removeMemberText}>⌫</Text>
                )}
              </Pressable>
            ) : null}
          </View>
        )}
        ListFooterComponent={
          admin ? (
            <Pressable
              onPress={() => onEdit(activityId)}
              style={styles.inviteButton}
            >
              <Text style={styles.inviteButtonText}>＋ Invite members</Text>
            </Pressable>
          ) : null
        }
        showsVerticalScrollIndicator={false}
        windowSize={5}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return responsiveStyleSheet({
    screen: { flex: 1, backgroundColor: colors.canvas },
    hero: { height: 366, backgroundColor: colors.background },
    heroImage: { width: '100%', height: '100%' },
    heroShade: {
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    navigation: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      minHeight: 102,
      paddingHorizontal: 6,
      paddingBottom: 4,
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: 'rgba(8,8,8,0.82)',
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    navButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navActions: { flexDirection: 'row' },
    navActionText: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
    dangerText: { color: colors.primary },
    back: { color: '#FFFFFF', fontSize: 38, lineHeight: 39, fontWeight: '300' },
    navTitle: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 17,
      lineHeight: 44,
      fontWeight: '600',
    },
    datePill: {
      position: 'absolute',
      bottom: 30,
      alignSelf: 'center',
      paddingHorizontal: 12,
      height: 37,
      borderRadius: 19,
      justifyContent: 'center',
      backgroundColor: 'rgba(22,22,22,0.78)',
    },
    dateText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    placeCard: {
      marginTop: -16,
      padding: 16,
      paddingTop: 18,
      alignItems: 'center',
      borderTopWidth: 1,
      borderColor: colors.border,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: colors.background,
    },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    rating: {
      color: '#FFFFFF',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: colors.primary,
      fontWeight: '700',
    },
    reviews: { color: colors.textMuted, fontSize: 14 },
    placeName: {
      color: colors.text,
      marginTop: 14,
      fontSize: 17,
      lineHeight: 22,
      fontWeight: '600',
      textAlign: 'center',
    },
    address: {
      color: colors.textSecondary,
      width: '100%',
      marginTop: 8,
      fontSize: 13,
      textAlign: 'center',
    },
    tags: { marginTop: 14, flexDirection: 'row', gap: 7 },
    tag: {
      color: colors.text,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors.canvas,
    },
    section: {
      padding: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
    },
    sectionTitle: { color: colors.textMuted, marginBottom: 8, fontSize: 12 },
    mediaEmpty: {
      minHeight: 112,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mediaEmptyTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
    mediaEmptyCopy: { color: colors.textMuted, marginTop: 5, fontSize: 12 },
    mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    mediaPhoto: {
      width: '31.8%',
      aspectRatio: 1,
      borderRadius: 10,
      backgroundColor: colors.skeleton,
    },
    memberRow: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    memberRowInset: { marginHorizontal: 16 },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.skeleton,
    },
    avatarFallback: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    avatarInitial: { color: colors.onPrimary, fontWeight: '700' },
    memberCopy: { flex: 1, marginLeft: 10 },
    removeMember: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeMemberText: { color: colors.primary, fontSize: 23 },
    inviteButton: {
      height: 48,
      marginHorizontal: 16,
      marginTop: 20,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    inviteButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
    memberTitleRow: { flexDirection: 'row', alignItems: 'center' },
    memberName: { color: colors.text, fontSize: 15, fontWeight: '600' },
    organizer: {
      color: colors.primary,
      marginLeft: 8,
      fontSize: 11,
      fontWeight: '700',
    },
    memberHandle: { color: colors.textSecondary, marginTop: 3, fontSize: 12 },
    center: {
      flex: 1,
      padding: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.canvas,
    },
    error: { color: colors.text, fontSize: 16, textAlign: 'center' },
    centerBack: {
      marginTop: 18,
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 22,
      backgroundColor: colors.primary,
    },
    centerBackText: { color: colors.onPrimary, fontWeight: '700' },
  });
}
