import type { ActivityCandidate, Venue } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import cafeImage from '../../../assets/discover/cafe.png';
import loungeImage from '../../../assets/discover/lounge.png';
import restaurantImage from '../../../assets/discover/restaurant.png';
import sushiImage from '../../../assets/discover/sushi.jpg';
import tacosImage from '../../../assets/discover/tacos.jpg';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useDiscoverVenues } from '../discover/api';

const venueImages: Record<string, ImageSourcePropType> = {
  cafe: cafeImage,
  lounge: loungeImage,
  restaurant: restaurantImage,
  sushi: sushiImage,
  tacos: tacosImage,
};
const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function venueImage(key?: string): ImageSourcePropType {
  return key && venueImages[key] ? venueImages[key] : restaurantImage;
}

function initialStart(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(19, 0, 0, 0);
  return date;
}

function monthCells(month: Date): Array<number | null> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function NewActivityScreen({
  onBack,
  onCreated,
  userId,
}: {
  onBack: () => void;
  onCreated: () => void;
  userId: string;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const api = useTastesApi();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [startsAt, setStartsAt] = useState(initialStart);
  const [month, setMonth] = useState(() => new Date(startsAt.getFullYear(), startsAt.getMonth(), 1));
  const [candidates, setCandidates] = useState<ActivityCandidate[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey('activity'));

  useEffect(() => {
    let active = true;
    void api.listActivityCandidates()
      .then((result) => { if (active) setCandidates(result.data); })
      .catch((error) => { if (active) Alert.alert('Could not load friends', apiErrorMessage(error)); })
      .finally(() => { if (active) setLoadingCandidates(false); });
    return () => { active = false; };
  }, [api]);

  const selectedMembers = candidates.filter((candidate) => memberIds.includes(candidate.userId));
  const valid = venue !== null && memberIds.length > 0 && startsAt.getTime() > Date.now() + 5 * 60_000;
  const cells = monthCells(month);

  function chooseDay(day: number) {
    const next = new Date(startsAt);
    next.setFullYear(month.getFullYear(), month.getMonth(), day);
    setStartsAt(next);
  }

  async function submit() {
    if (!venue || !valid || submitting) return;
    setSubmitting(true);
    try {
      await api.createActivity({
        idempotencyKey,
        memberIds,
        startsAt: startsAt.toISOString(),
        venueId: venue.id,
      });
      setIdempotencyKey(createIdempotencyKey('activity'));
      Alert.alert('Activity created', `${venue.name} · ${startsAt.toLocaleString()}`, [
        { text: 'Done', onPress: onCreated },
      ]);
    } catch (error) {
      Alert.alert('Could not create activity', apiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.navigation, { paddingTop: insets.top }]}>
        <Pressable accessibilityLabel="Back" onPress={onBack} style={styles.navButton}><Text style={styles.back}>‹</Text></Pressable>
        <Text style={styles.navTitle}>New activity</Text>
        <View style={styles.navButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 18) + 100 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>PLACE</Text>
        {venue ? (
          <View style={styles.venueCard}>
            <Image source={venueImage(venue.imageKey)} style={styles.venueImage} />
            <View style={styles.venueCopy}>
              <Text numberOfLines={2} style={styles.venueName}>{venue.name}</Text>
              <Text numberOfLines={2} style={styles.venueAddress}>{venue.address ?? venue.city}</Text>
            </View>
            <Pressable accessibilityLabel="Change place" onPress={() => setPlaceOpen(true)}><Text style={styles.edit}>✎</Text></Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setPlaceOpen(true)} style={styles.outlineButton}>
            <Text style={styles.outlineButtonText}>Select Place</Text>
          </Pressable>
        )}

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>TIME</Text>
        <View style={styles.calendar}>
          <View style={styles.calendarHeader}>
            <Text style={styles.month}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
            <View style={styles.monthActions}>
              <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Text style={styles.monthArrow}>‹</Text></Pressable>
              <Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Text style={styles.monthArrow}>›</Text></Pressable>
            </View>
          </View>
          <View style={styles.weekRow}>{weekdays.map((day) => <Text key={day} style={styles.weekday}>{day}</Text>)}</View>
          <View style={styles.days}>
            {cells.map((day, index) => {
              const selected = day !== null
                && startsAt.getFullYear() === month.getFullYear()
                && startsAt.getMonth() === month.getMonth()
                && startsAt.getDate() === day;
              const past = day !== null && new Date(month.getFullYear(), month.getMonth(), day, 23, 59).getTime() < Date.now();
              return (
                <Pressable disabled={day === null || past} key={`${day ?? 'blank'}-${index}`} onPress={() => day && chooseDay(day)} style={styles.dayCell}>
                  <View style={[styles.dayCircle, selected && styles.daySelected]}>
                    <Text style={[styles.dayText, past && styles.dayPast, selected && styles.daySelectedText]}>{day ?? ''}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.timeLabel}>Time</Text>
            <Pressable onPress={() => setTimeOpen(true)} style={styles.timePill}><Text style={styles.timeValue}>{formatTime(startsAt)}</Text></Pressable>
          </View>
        </View>

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>MEMBERS</Text>
        {selectedMembers.map((member) => (
          <View key={member.userId} style={styles.memberRow}>
            <Avatar member={member} styles={styles} />
            <View style={styles.memberCopy}><Text style={styles.memberName}>{member.displayName}</Text><Text style={styles.memberHandle}>{member.username ? `@${member.username}` : 'Mutual follower'}</Text></View>
            <Pressable accessibilityLabel={`Remove ${member.displayName}`} onPress={() => setMemberIds((current) => current.filter((id) => id !== member.userId))}><Text style={styles.remove}>×</Text></Pressable>
          </View>
        ))}
        <Pressable disabled={loadingCandidates} onPress={() => setMembersOpen(true)} style={styles.addMember}>
          {loadingCandidates ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.addMemberText}>+</Text>}
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable disabled={!valid || submitting} onPress={() => void submit()} style={[styles.createButton, (!valid || submitting) && styles.disabled]}>
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.createText}>Create activity</Text>}
        </Pressable>
      </View>

      <PlaceSelector onClose={() => setPlaceOpen(false)} onSelect={(next) => { setVenue(next); setPlaceOpen(false); }} styles={styles} userId={userId} visible={placeOpen} />
      <MemberSelector candidates={candidates} onClose={() => setMembersOpen(false)} onConfirm={(ids) => { setMemberIds(ids); setMembersOpen(false); }} selectedIds={memberIds} styles={styles} visible={membersOpen} />
      <TimeSelector onClose={() => setTimeOpen(false)} onSelect={(hour, minute) => { const next = new Date(startsAt); next.setHours(hour, minute, 0, 0); setStartsAt(next); setTimeOpen(false); }} styles={styles} value={startsAt} visible={timeOpen} />
    </View>
  );
}

function Avatar({ member, styles }: { member: ActivityCandidate; styles: ReturnType<typeof createStyles> }) {
  return member.photoUrl
    ? <Image source={{ uri: member.photoUrl }} style={styles.avatar} />
    : <View style={styles.avatarFallback}><Text style={styles.avatarInitial}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View>;
}

function SheetHeader({ onClose, styles, title }: { onClose: () => void; styles: ReturnType<typeof createStyles>; title: string }) {
  return <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><Pressable accessibilityLabel="Close" onPress={onClose} style={styles.closeCircle}><Text style={styles.closeText}>×</Text></Pressable></View>;
}

function PlaceSelector({ onClose, onSelect, styles, userId, visible }: { onClose: () => void; onSelect: (venue: Venue) => void; styles: ReturnType<typeof createStyles>; userId: string; visible: boolean }) {
  const [search, setSearch] = useState('');
  const venues = useDiscoverVenues(userId);
  const items = venues.data?.pages.flatMap((page) => page.items) ?? [];
  const query = search.trim().toLowerCase();
  const filtered = items.filter((venue) => !query || venue.name.toLowerCase().includes(query) || venue.city.toLowerCase().includes(query));
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}><View style={styles.sheet}>
        <SheetHeader onClose={onClose} styles={styles} title="Select Place" />
        <View style={styles.sheetSearch}><Text style={styles.searchGlyph}>⌕</Text><TextInput onChangeText={setSearch} placeholder="Restaurant" placeholderTextColor={styles.searchPlaceholder.color} style={styles.sheetSearchInput} value={search} /></View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={venues.isLoading ? <ActivityIndicator style={styles.loader} /> : <Text style={styles.emptyText}>No places found</Text>}
          onEndReached={() => { if (venues.hasNextPage && !venues.isFetchingNextPage) void venues.fetchNextPage(); }}
          renderItem={({ item }) => <Pressable onPress={() => onSelect(item)} style={styles.placeRow}><Image source={venueImage(item.imageKey)} style={styles.placeImage} /><View style={styles.placeCopy}><Text numberOfLines={1} style={styles.placeName}>{item.name}</Text><Text numberOfLines={1} style={styles.placeAddress}>{item.address ?? item.city}</Text><View style={styles.placeMeta}><Text style={styles.rating}>★ {(item.rating ?? 0).toFixed(1)}</Text><Text style={styles.reviews}>{item.reviewCount ?? 0} reviews</Text></View></View><Text style={styles.rowPlus}>⊕</Text></Pressable>}
        />
      </View></View>
    </Modal>
  );
}

function MemberSelector({ candidates, onClose, onConfirm, selectedIds, styles, visible }: { candidates: ActivityCandidate[]; onClose: () => void; onConfirm: (ids: string[]) => void; selectedIds: string[]; styles: ReturnType<typeof createStyles>; visible: boolean }) {
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(selectedIds);
  useEffect(() => { if (visible) setDraft(selectedIds); }, [selectedIds, visible]);
  const query = search.trim().toLowerCase();
  const filtered = candidates.filter((item) => !query || item.displayName.toLowerCase().includes(query) || item.username?.toLowerCase().includes(query));
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}><View style={styles.sheet}>
        <SheetHeader onClose={onClose} styles={styles} title="Select Members" />
        <View style={styles.sheetSearch}><Text style={styles.searchGlyph}>⌕</Text><TextInput onChangeText={setSearch} placeholder="Search friends" placeholderTextColor={styles.searchPlaceholder.color} style={styles.sheetSearchInput} value={search} /></View>
        <FlatList data={filtered} keyExtractor={(item) => item.userId} ListEmptyComponent={<Text style={styles.emptyText}>Mutual followers will appear here.</Text>} renderItem={({ item }) => { const checked = draft.includes(item.userId); return <Pressable onPress={() => setDraft((current) => checked ? current.filter((id) => id !== item.userId) : [...current, item.userId])} style={styles.candidateRow}><Avatar member={item} styles={styles} /><View style={styles.memberCopy}><Text style={styles.memberName}>{item.displayName}</Text><Text style={styles.memberHandle}>{item.username ? `@${item.username}` : 'Mutual follower'}</Text></View><View style={[styles.radio, checked && styles.radioChecked]}><Text style={styles.check}>{checked ? '✓' : ''}</Text></View></Pressable>; }} />
        <View style={styles.sheetFooter}><Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable><Pressable disabled={draft.length === 0} onPress={() => onConfirm(draft)} style={[styles.confirmButton, draft.length === 0 && styles.disabled]}><Text style={styles.confirmText}>✓  Confirm</Text></Pressable></View>
      </View></View>
    </Modal>
  );
}

function TimeSelector({ onClose, onSelect, styles, value, visible }: { onClose: () => void; onSelect: (hour: number, minute: number) => void; styles: ReturnType<typeof createStyles>; value: Date; visible: boolean }) {
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(value.getMinutes() < 30 ? 0 : 30);
  useEffect(() => { if (visible) { setHour(value.getHours()); setMinute(value.getMinutes() < 30 ? 0 : 30); } }, [value, visible]);
  return <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}><View style={styles.centerBackdrop}><View style={styles.timeSheet}><SheetHeader onClose={onClose} styles={styles} title="Select time" /><Text style={styles.pickerLabel}>HOUR</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{Array.from({ length: 24 }, (_, item) => <Pressable key={item} onPress={() => setHour(item)} style={[styles.timeOption, hour === item && styles.timeOptionSelected]}><Text style={styles.timeOptionText}>{String(item).padStart(2, '0')}</Text></Pressable>)}</ScrollView><Text style={styles.pickerLabel}>MINUTE</Text><View style={styles.minuteRow}>{[0, 15, 30, 45].map((item) => <Pressable key={item} onPress={() => setMinute(item)} style={[styles.timeOption, minute === item && styles.timeOptionSelected]}><Text style={styles.timeOptionText}>{String(item).padStart(2, '0')}</Text></Pressable>)}</View><Pressable onPress={() => onSelect(hour, minute)} style={styles.confirmButton}><Text style={styles.confirmText}>Confirm</Text></Pressable></View></View></Modal>;
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    navigation: { minHeight: 102, paddingHorizontal: 6, flexDirection: 'row', alignItems: 'flex-end', paddingBottom: 12, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: colors.background },
    navButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    back: { color: colors.text, fontSize: 38, lineHeight: 39, fontWeight: '300' },
    navTitle: { flex: 1, color: colors.text, fontSize: 17, lineHeight: 44, fontWeight: '600', textAlign: 'center' },
    content: { paddingTop: 16 },
    sectionLabel: { color: colors.textMuted, marginHorizontal: 16, marginBottom: 8, fontSize: 12 },
    outlineButton: { height: 45, marginHorizontal: 16, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
    outlineButtonText: { color: colors.text, fontSize: 15 },
    divider: { height: StyleSheet.hairlineWidth, marginVertical: 16, backgroundColor: colors.border },
    venueCard: { minHeight: 112, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
    venueImage: { width: 104, height: 104, borderRadius: 10 },
    venueCopy: { flex: 1, marginLeft: 14 }, venueName: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '600' }, venueAddress: { color: colors.textSecondary, marginTop: 6, fontSize: 13, lineHeight: 18 }, edit: { color: colors.text, fontSize: 24, padding: 10 },
    calendar: { marginHorizontal: 16, padding: 16, borderRadius: 13, backgroundColor: colors.background },
    calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, month: { color: colors.text, fontSize: 17, fontWeight: '700' }, monthActions: { flexDirection: 'row', gap: 25 }, monthArrow: { color: colors.primary, fontSize: 32, lineHeight: 34 },
    weekRow: { marginTop: 5, flexDirection: 'row' }, weekday: { width: '14.2857%', color: colors.textMuted, fontSize: 11, textAlign: 'center' },
    days: { marginTop: 5, flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: '14.2857%', height: 46, alignItems: 'center', justifyContent: 'center' }, dayCircle: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }, daySelected: { backgroundColor: colors.primaryBorder }, dayText: { color: colors.text, fontSize: 17 }, dayPast: { color: colors.textMuted, opacity: 0.35 }, daySelectedText: { color: colors.primary, fontWeight: '700' },
    timeRow: { marginTop: 5, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, timeLabel: { color: colors.text, fontSize: 16 }, timePill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surfaceRaised }, timeValue: { color: colors.text, fontSize: 16 },
    memberRow: { minHeight: 62, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }, avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.skeleton }, avatarFallback: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, avatarInitial: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' }, memberCopy: { flex: 1, marginLeft: 10 }, memberName: { color: colors.text, fontSize: 15, fontWeight: '600' }, memberHandle: { color: colors.textSecondary, marginTop: 2, fontSize: 12 }, remove: { color: colors.text, fontSize: 25, padding: 10 },
    addMember: { width: 44, height: 44, marginLeft: 16, marginTop: 5, borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed', borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, addMemberText: { color: colors.text, fontSize: 28, fontWeight: '300' },
    footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 12, paddingHorizontal: 31, backgroundColor: colors.canvas }, createButton: { height: 62, borderWidth: 5, borderColor: colors.primaryBorder, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, createText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', letterSpacing: 0.3 }, disabled: { opacity: 0.45 },
    modalBackdrop: { flex: 1, paddingTop: 86, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.72)' }, sheet: { maxHeight: '91%', minHeight: '72%', borderTopWidth: 1, borderColor: colors.border, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', backgroundColor: colors.canvas }, sheetHeader: { height: 64, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '700' }, closeCircle: { width: 30, height: 30, borderWidth: 2, borderColor: colors.text, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, closeText: { color: colors.text, fontSize: 21, lineHeight: 22 },
    sheetSearch: { height: 40, margin: 16, paddingHorizontal: 11, borderRadius: 22, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised }, searchGlyph: { color: colors.textSecondary, fontSize: 21, marginRight: 8 }, sheetSearchInput: { flex: 1, color: colors.text, fontSize: 16, paddingVertical: 0 }, searchPlaceholder: { color: colors.placeholder }, loader: { marginTop: 40 }, emptyText: { color: colors.textMuted, margin: 32, textAlign: 'center' },
    placeRow: { minHeight: 165, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'flex-start' }, placeImage: { width: 122, height: 122, borderRadius: 10 }, placeCopy: { flex: 1, marginLeft: 15, paddingTop: 18 }, placeName: { color: colors.text, fontSize: 15, fontWeight: '700' }, placeAddress: { color: colors.textSecondary, marginTop: 5, fontSize: 13 }, placeMeta: { marginTop: 13, flexDirection: 'row', alignItems: 'center' }, rating: { color: '#FFFFFF', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.primary, fontWeight: '700' }, reviews: { color: colors.textMuted, marginLeft: 8, fontSize: 13 }, rowPlus: { color: colors.text, fontSize: 23 },
    candidateRow: { minHeight: 76, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }, radio: { width: 23, height: 23, borderWidth: 1.5, borderColor: colors.text, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, radioChecked: { borderColor: colors.primary, backgroundColor: colors.primary }, check: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
    sheetFooter: { padding: 16, flexDirection: 'row', gap: 10, backgroundColor: colors.background }, cancelButton: { flex: 1, height: 45, borderWidth: 1, borderColor: colors.primary, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }, cancelText: { color: colors.text, fontWeight: '600' }, confirmButton: { flex: 1, minHeight: 45, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, confirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    centerBackdrop: { flex: 1, padding: 24, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)' }, timeSheet: { paddingBottom: 20, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.canvas }, pickerLabel: { color: colors.textMuted, margin: 16, marginBottom: 8, fontSize: 12 }, timeOption: { width: 50, height: 45, marginLeft: 8, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised }, timeOptionSelected: { backgroundColor: colors.primary }, timeOptionText: { color: colors.text, fontSize: 16, fontWeight: '600' }, minuteRow: { marginBottom: 20, paddingRight: 8, flexDirection: 'row' },
  });
}
