import { doc, getDoc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import cafeImage from '../../../assets/discover/cafe.png';
import loungeImage from '../../../assets/discover/lounge.png';
import restaurantImage from '../../../assets/discover/restaurant.png';
import sushiImage from '../../../assets/discover/sushi.jpg';
import tacosImage from '../../../assets/discover/tacos.jpg';
import { firestore } from '../../infrastructure/firebase';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

const venueImages: Record<string, ImageSourcePropType> = {
  cafe: cafeImage,
  lounge: loungeImage,
  restaurant: restaurantImage,
  sushi: sushiImage,
  tacos: tacosImage,
};

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
    address: string;
    category: string;
    city: string;
    imageKey: string | null;
    name: string;
    priceLevel: number;
    rating: number;
    reviewCount: number;
  };
  members: Member[];
};

function imageFor(key: string | null): ImageSourcePropType {
  return key && venueImages[key] ? venueImages[key] : restaurantImage;
}

function memberFromData(id: string, data: DocumentData | undefined): Member {
  return {
    id,
    displayName: typeof data?.displayName === 'string' ? data.displayName : 'Tastes user',
    username: typeof data?.username === 'string' ? data.username : null,
    photoUrl: typeof data?.photoUrl === 'string' ? data.photoUrl : null,
  };
}

export function ActivityDetailsScreen({
  activityId,
  onBack,
}: {
  activityId: string;
  onBack: () => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [details, setDetails] = useState<ActivityDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onSnapshot(doc(firestore, 'activities', activityId), (snapshot) => {
    if (!snapshot.exists()) {
      setError('This activity is no longer available.');
      return;
    }
    const data = snapshot.data();
    const participantIds = Array.isArray(data.participantIds)
      ? data.participantIds.filter((value): value is string => typeof value === 'string')
      : [];
    const venueId = String(data.venueId ?? '');
    void Promise.all([
      getDoc(doc(firestore, 'venues', venueId)),
      ...participantIds.map((participantId) => getDoc(doc(firestore, 'users', participantId))),
    ]).then(([venueSnapshot, ...profiles]) => {
      const venue = venueSnapshot.data();
      const startsAt = data.startsAt && typeof data.startsAt.toDate === 'function'
        ? data.startsAt.toDate() as Date
        : new Date(String(data.startsAt ?? 0));
      setDetails({
        organizerId: String(data.organizerId ?? ''),
        startsAt,
        venue: {
          address: typeof venue?.address === 'string' ? venue.address : '',
          category: typeof venue?.category === 'string' ? venue.category : 'Restaurant',
          city: typeof venue?.city === 'string' ? venue.city : '',
          imageKey: typeof venue?.imageKey === 'string' ? venue.imageKey : null,
          name: typeof venue?.name === 'string' ? venue.name : String(data.venueName ?? 'Activity'),
          priceLevel: Math.max(0, Number(venue?.priceLevel ?? 0)),
          rating: Math.max(0, Number(venue?.rating ?? 0)),
          reviewCount: Math.max(0, Number(venue?.reviewCount ?? 0)),
        },
        members: participantIds.map((id, index) => memberFromData(id, profiles[index]?.data())),
      });
      setError(null);
    }).catch(() => setError('Could not load activity details.'));
  }, () => setError('Could not load activity details.')), [activityId]);

  if (!details) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}> 
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
        <Pressable onPress={onBack} style={styles.centerBack}><Text style={styles.centerBackText}>Back</Text></Pressable>
      </View>
    );
  }

  const date = details.startsAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = details.startsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const price = details.venue.priceLevel > 0 ? '$'.repeat(details.venue.priceLevel) : null;
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Image source={imageFor(details.venue.imageKey)} style={styles.heroImage} />
          <View style={styles.heroShade} />
          <View style={[styles.navigation, { paddingTop: insets.top }]}> 
            <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.navButton}><Text style={styles.back}>‹</Text></Pressable>
            <Text numberOfLines={1} style={styles.navTitle}>{details.venue.name}</Text>
            <View style={styles.navButton} />
          </View>
          <View style={styles.datePill}><Text style={styles.dateText}>▣  {date}, {time}</Text></View>
        </View>

        <View style={styles.placeCard}>
          <View style={styles.ratingRow}>
            <Text style={styles.rating}>★ {details.venue.rating.toFixed(1)}</Text>
            <Text style={styles.reviews}>{details.venue.reviewCount} reviews</Text>
          </View>
          <Text style={styles.placeName}>{details.venue.name}</Text>
          <Text numberOfLines={1} style={styles.address}>{details.venue.address || details.venue.city}</Text>
          <View style={styles.tags}>
            <Text style={styles.tag}>{details.venue.category}</Text>
            {price ? <Text style={styles.tag}>{price}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MEDIA</Text>
          <View style={styles.mediaEmpty}>
            <Text style={styles.mediaEmptyTitle}>No shared photos yet</Text>
            <Text style={styles.mediaEmptyCopy}>Photos shared in this activity will appear here.</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MEMBERS ({details.members.length})</Text>
          {details.members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              {member.photoUrl ? <Image source={{ uri: member.photoUrl }} style={styles.avatar} /> : (
                <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View>
              )}
              <View style={styles.memberCopy}>
                <View style={styles.memberTitleRow}>
                  <Text style={styles.memberName}>{member.displayName}</Text>
                  {member.id === details.organizerId ? <Text style={styles.organizer}>Organizer</Text> : null}
                </View>
                <Text style={styles.memberHandle}>{member.username ? `@${member.username}` : 'Tastes member'}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    hero: { height: 366, backgroundColor: colors.background },
    heroImage: { width: '100%', height: '100%' },
    heroShade: { position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
    navigation: { position: 'absolute', left: 0, right: 0, top: 0, minHeight: 102, paddingHorizontal: 6, paddingBottom: 4, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(8,8,8,0.82)', borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
    navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    back: { color: '#FFFFFF', fontSize: 38, lineHeight: 39, fontWeight: '300' },
    navTitle: { flex: 1, color: '#FFFFFF', fontSize: 17, lineHeight: 44, fontWeight: '600' },
    datePill: { position: 'absolute', bottom: 30, alignSelf: 'center', paddingHorizontal: 12, height: 37, borderRadius: 19, justifyContent: 'center', backgroundColor: 'rgba(22,22,22,0.78)' },
    dateText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
    placeCard: { marginTop: -16, padding: 16, paddingTop: 18, alignItems: 'center', borderTopWidth: 1, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.background },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    rating: { color: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.primary, fontWeight: '700' },
    reviews: { color: colors.textMuted, fontSize: 14 },
    placeName: { color: colors.text, marginTop: 14, fontSize: 17, lineHeight: 22, fontWeight: '600', textAlign: 'center' },
    address: { color: colors.textSecondary, width: '100%', marginTop: 8, fontSize: 13, textAlign: 'center' },
    tags: { marginTop: 14, flexDirection: 'row', gap: 7 },
    tag: { color: colors.text, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.hairline, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.canvas },
    section: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
    sectionTitle: { color: colors.textMuted, marginBottom: 8, fontSize: 12 },
    mediaEmpty: { minHeight: 112, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    mediaEmptyTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
    mediaEmptyCopy: { color: colors.textMuted, marginTop: 5, fontSize: 12 },
    memberRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.skeleton },
    avatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    avatarInitial: { color: colors.onPrimary, fontWeight: '700' },
    memberCopy: { flex: 1, marginLeft: 10 },
    memberTitleRow: { flexDirection: 'row', alignItems: 'center' },
    memberName: { color: colors.text, fontSize: 15, fontWeight: '600' },
    organizer: { color: colors.primary, marginLeft: 8, fontSize: 11, fontWeight: '700' },
    memberHandle: { color: colors.textSecondary, marginTop: 3, fontSize: 12 },
    center: { flex: 1, padding: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas },
    error: { color: colors.text, fontSize: 16, textAlign: 'center' },
    centerBack: { marginTop: 18, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 22, backgroundColor: colors.primary },
    centerBackText: { color: colors.onPrimary, fontWeight: '700' },
  });
}
