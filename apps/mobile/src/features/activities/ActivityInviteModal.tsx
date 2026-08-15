import { apiErrorMessage } from '@tastes/firebase-client';
import { doc, getDoc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import CalendarIcon from '../../../assets/activities/calendar.svg';
import CheckIcon from '../../../assets/activities/check.svg';
import restaurantImage from '../../../assets/discover/restaurant.png';
import pattern from '../../../assets/onboarding/pattern-screen.png';
import { firestore } from '../../infrastructure/firebase';
import { useTastesApi } from '../../session/SessionProvider';
import { PatternBackgroundLift } from '../../ui/components';

type Member = {
  id: string;
  displayName: string;
  photoUrl: string | null;
};

type Details = {
  invitationStatus: 'pending' | 'accepted' | 'declined';
  organizer: Member;
  startsAt: Date;
  members: Member[];
  venue: {
    address: string;
    category: string;
    imageUrl: string | null;
    name: string;
    placeTags: string[];
    rating: number;
    reviewCount: number;
  };
};

function member(id: string, data: DocumentData | undefined): Member {
  return {
    id,
    displayName: typeof data?.displayName === 'string' && data.displayName ? data.displayName : 'Tastes user',
    photoUrl: typeof data?.photoUrl === 'string' ? data.photoUrl : null,
  };
}

function venueImage(url: string | null): ImageSourcePropType {
  return url ? { uri: url } : restaurantImage;
}

function Avatar({ person, size }: { person: Member; size: number }) {
  return person.photoUrl ? (
    <Image source={{ uri: person.photoUrl }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarInitial, { fontSize: size * 0.36 }]}>{person.displayName.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function ActivityInviteModal({
  activityId,
  onClose,
  userId,
  visible,
}: {
  activityId: string | null;
  onClose: () => void;
  userId: string;
  visible: boolean;
}) {
  const api = useTastesApi();
  const [details, setDetails] = useState<Details | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    let active = true;
    setDetails(null);
    setLoadError(null);
    if (!visible || !activityId) return undefined;
    setLoading(true);
    const unsubscribe = onSnapshot(doc(firestore, 'activities', activityId), (snapshot) => {
      if (!snapshot.exists()) {
        setLoading(false);
        setLoadError('This activity is no longer available.');
        return;
      }
      const data = snapshot.data();
      const participantIds = Array.isArray(data.participantIds)
        ? data.participantIds.filter((value): value is string => typeof value === 'string')
        : [];
      const organizerId = String(data.organizerId ?? '');
      const venueId = String(data.venueId ?? '');
      const statuses = data.invitationStatuses && typeof data.invitationStatuses === 'object'
        ? data.invitationStatuses as Record<string, unknown>
        : {};
      const rawStatus = statuses[userId];
      const startsAt = data.startsAt && typeof data.startsAt.toDate === 'function'
        ? data.startsAt.toDate() as Date
        : new Date(String(data.startsAt ?? 0));
      const fallbackMembers = participantIds.map((id) => member(id, undefined));
      const base: Details = {
        invitationStatus: rawStatus === 'pending' || rawStatus === 'declined' ? rawStatus : 'accepted',
        organizer: fallbackMembers.find((item) => item.id === organizerId) ?? member(organizerId, undefined),
        startsAt,
        members: fallbackMembers,
        venue: {
          address: '',
          category: 'Restaurant',
          imageUrl: null,
          name: String(data.venueName ?? 'Activity'),
          placeTags: [],
          rating: 0,
          reviewCount: 0,
        },
      };
      setDetails(base);
      setLoading(false);

      void Promise.allSettled([
        getDoc(doc(firestore, 'venues', venueId)),
        ...participantIds.map((id) => getDoc(doc(firestore, 'users', id))),
      ]).then(([venueResult, ...profileResults]) => {
        if (!active) return;
        const venue = venueResult.status === 'fulfilled' ? venueResult.value.data() : undefined;
        const members = participantIds.map((id, index) => {
          const result = profileResults[index];
          return member(id, result?.status === 'fulfilled' ? result.value.data() : undefined);
        });
        setDetails({
          ...base,
          organizer: members.find((item) => item.id === organizerId) ?? member(organizerId, undefined),
          members,
          venue: {
            address: typeof venue?.address === 'string' ? venue.address : '',
            category: typeof venue?.category === 'string' ? venue.category : 'Restaurant',
            imageUrl: typeof venue?.imageUrl === 'string' ? venue.imageUrl : null,
            name: typeof venue?.name === 'string' ? venue.name : String(data.venueName ?? 'Activity'),
            placeTags: Array.isArray(venue?.placeTags)
              ? venue.placeTags.filter((value): value is string => typeof value === 'string').slice(0, 3)
              : [],
            rating: Math.max(0, Number(venue?.rating ?? 0)),
            reviewCount: Math.max(0, Number(venue?.reviewCount ?? 0)),
          },
        });
      });
    }, (error) => {
      setLoading(false);
      setLoadError(error.message || 'Could not load activity.');
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [activityId, onClose, userId, visible]);

  async function respond(response: 'accepted' | 'declined') {
    if (!activityId || responding) return;
    setResponding(true);
    try {
      await api.respondToActivityInvitation({ activityId, response });
      onClose();
    } catch (error) {
      Alert.alert('Could not update invitation', apiErrorMessage(error));
    } finally {
      setResponding(false);
    }
  }

  const date = useMemo(() => details?.startsAt.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }) ?? '', [details?.startsAt]);
  const pending = details?.invitationStatus === 'pending';

  return (
    <Modal animationType="fade" onRequestClose={pending ? undefined : onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <ImageBackground imageStyle={styles.patternImage} source={pattern} style={styles.sheet}>
          <PatternBackgroundLift />
          {loadError ? (
            <View style={styles.errorState}>
              <Text style={styles.errorTitle}>Could not load activity</Text>
              <Text style={styles.errorCopy}>{loadError}</Text>
              <Pressable onPress={onClose} style={[styles.button, styles.closeButton]}>
                <Text style={styles.buttonText}>Close</Text>
              </Pressable>
            </View>
          ) : loading || !details ? <ActivityIndicator color="#B82F29" size="large" /> : (
            <>
              <View style={styles.identity}>
                <Avatar person={details.organizer} size={100} />
                <Text style={styles.organizer}>{details.organizer.displayName}</Text>
                <Text style={styles.inviteCopy}>
                  {pending ? `Invite you in “${details.venue.name}” restaurant` : `Activity in “${details.venue.name}” restaurant`}
                </Text>
              </View>

              <View style={styles.dateRow}>
                <CalendarIcon height={20} width={20} />
                <Text style={styles.date}>{date}</Text>
              </View>

              <View style={styles.placeCard}>
                <View style={styles.placeTop}>
                  <View>
                    <Image source={venueImage(details.venue.imageUrl)} style={styles.venueImage} />
                    <Text style={styles.popular}>Popular</Text>
                  </View>
                  <View style={styles.placeCopy}>
                    <Text numberOfLines={1} style={styles.placeName}>{details.venue.name}</Text>
                    <Text numberOfLines={2} style={styles.address}>{details.venue.address}</Text>
                    <View style={styles.ratingRow}>
                      <Text style={styles.rating}>★ {details.venue.rating.toFixed(1)}</Text>
                      <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={styles.reviews}>{details.venue.reviewCount} reviews</Text>
                    </View>
                  </View>
                </View>
                <View style={styles.tags}>
                  {(details.venue.placeTags.length ? details.venue.placeTags : [details.venue.category]).map((tag) => (
                    <Text key={tag} style={styles.tag}>{tag}</Text>
                  ))}
                </View>
              </View>

              <View style={styles.peopleRow}>
                <View style={styles.avatarStack}>
                  {details.members.slice(0, 3).map((person, index) => (
                    <View key={person.id} style={[styles.smallAvatar, { marginLeft: index === 0 ? 0 : -14 }]}>
                      <Avatar person={person} size={38} />
                    </View>
                  ))}
                </View>
                <Text style={styles.peopleCopy}>{details.members.length} people invited</Text>
              </View>

              {pending ? (
                <View style={styles.actions}>
                  <Pressable disabled={responding} onPress={() => void respond('declined')} style={[styles.button, styles.skipButton]}>
                    <Text style={styles.buttonText}>Skip</Text>
                  </Pressable>
                  <Pressable disabled={responding} onPress={() => void respond('accepted')} style={[styles.button, styles.takeButton]}>
                    {responding ? <ActivityIndicator color="#FFFFFF" /> : (
                      <View style={styles.takePartContent}>
                        <CheckIcon height={15} width={20} />
                        <Text style={styles.buttonText}>Take part</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              ) : (
                <Pressable onPress={onClose} style={[styles.button, styles.closeButton]}>
                  <Text style={styles.buttonText}>Close</Text>
                </Pressable>
              )}
            </>
          )}
        </ImageBackground>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' },
  sheet: { width: '100%', maxWidth: 370, minHeight: 540, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 16, borderWidth: 1, borderColor: '#45474B', borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: '#080808' },
  patternImage: { opacity: 0.18, resizeMode: 'repeat' },
  identity: { width: 270, alignItems: 'center' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#B82F29' },
  avatarInitial: { color: '#FFFFFF', fontWeight: '700' },
  organizer: { width: '100%', marginTop: 12, color: '#FFFFFF', fontSize: 24, lineHeight: 29, fontWeight: '700', textAlign: 'center' },
  inviteCopy: { width: '100%', marginTop: 2, color: '#D9D9D9', fontSize: 15, lineHeight: 20, textAlign: 'center' },
  dateRow: { marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 4 },
  date: { color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  placeCard: { width: '100%', marginTop: 15, padding: 12, borderRadius: 16, backgroundColor: '#161616' },
  placeTop: { flexDirection: 'row', gap: 12 },
  venueImage: { width: 110, height: 110, borderRadius: 12 },
  popular: { position: 'absolute', top: 4, left: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden', color: '#FFFFFF', fontSize: 12, backgroundColor: '#B82F29' },
  placeCopy: { flex: 1, minWidth: 0, paddingTop: 6 },
  placeName: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  address: { minHeight: 36, marginTop: 6, color: '#AAB2C5', fontSize: 13, lineHeight: 16 },
  ratingRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  rating: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: 'hidden', color: '#FFFFFF', fontSize: 14, fontWeight: '600', backgroundColor: '#B82F29' },
  reviews: { flexShrink: 1, color: 'rgba(216,221,232,0.4)', fontSize: 14 },
  tags: { marginTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 18, overflow: 'hidden', color: '#FFFFFF', fontSize: 15, backgroundColor: '#080808' },
  peopleRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  avatarStack: { flexDirection: 'row', alignItems: 'center' },
  smallAvatar: { padding: 1, borderWidth: 1, borderColor: '#FFFFFF', borderRadius: 21, backgroundColor: '#080808' },
  peopleCopy: { marginLeft: 6, color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  actions: { width: '100%', flexDirection: 'row', gap: 12 },
  button: { height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  skipButton: { flex: 1, borderWidth: 1, borderColor: '#B82F29', backgroundColor: '#161616' },
  takeButton: { flex: 1, backgroundColor: '#B82F29' },
  takePartContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closeButton: { width: '100%', backgroundColor: '#B82F29' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', letterSpacing: 0.6 },
  errorState: { width: '100%', paddingHorizontal: 16, alignItems: 'center' },
  errorTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', textAlign: 'center' },
  errorCopy: { marginTop: 8, marginBottom: 20, color: '#AAB2C5', fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
