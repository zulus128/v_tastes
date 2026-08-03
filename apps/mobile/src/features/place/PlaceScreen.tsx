import type { PlaceReviewSort } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import avatarCameron from '../../../assets/discover/avatar-cameron.jpg';
import avatarKristin from '../../../assets/discover/avatar-kristin.png';
import avatarWade from '../../../assets/discover/avatar-wade.png';
import cafeImage from '../../../assets/discover/cafe.png';
import loungeImage from '../../../assets/discover/lounge.png';
import restaurantImage from '../../../assets/discover/restaurant.png';
import sushiImage from '../../../assets/discover/sushi.jpg';
import tacosImage from '../../../assets/discover/tacos.jpg';
import BookmarkIcon from '../../../assets/favourites/bookmark.svg';
import { useFavourites, useSaveVenue, useUnsaveVenue } from '../favourites/api';
import { usePlace, usePlaceReviews } from '../discover/api';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';

const venueImages: Record<string, ImageSourcePropType> = { sushi: sushiImage, restaurant: restaurantImage, lounge: loungeImage, tacos: tacosImage, cafe: cafeImage };
const avatarImages: Record<string, ImageSourcePropType> = { kristin: avatarKristin, cameron: avatarCameron, wade: avatarWade };
const sorts: Record<PlaceReviewSort, string> = { highest: 'Highest rated', lowest: 'Lowest rated', popular: 'Popular', recent: 'Recent', oldest: 'Oldest' };

function placeImage(key: string | null | undefined): ImageSourcePropType {
  return key && venueImages[key] ? venueImages[key] : restaurantImage;
}
function personImage(url: string | null, key: string | null): ImageSourcePropType {
  return url ? { uri: url } : (key && avatarImages[key] ? avatarImages[key] : avatarKristin);
}
function relativeTime(iso: string) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000));
  return hours < 24 ? String(hours) + 'h ago' : String(Math.round(hours / 24)) + 'd ago';
}

export function PlaceScreen({ onBack, onWriteReview, userId, venueId }: { onBack: () => void; onWriteReview: () => void; userId: string; venueId: string }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<'overview' | 'reviews'>('overview');
  const [sort, setSort] = useState<PlaceReviewSort>('recent');
  const [sheet, setSheet] = useState<'hours' | 'photos' | 'sort' | null>(null);
  const [toast, setToast] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const details = usePlace(venueId);
  const reviews = usePlaceReviews(venueId, sort);
  const favourites = useFavourites(userId);
  const save = useSaveVenue(userId);
  const unsave = useUnsaveVenue(userId);
  const saved = favourites.data?.places.some((place) => place.venueId === venueId) ?? false;
  const busy = save.isPending || unsave.isPending;
  const toggleSave = () => {
    if (busy) return;
    if (saved) {
      unsave.mutate(venueId);
    } else {
      save.mutate({ venueId, folderIds: [] }, { onSuccess: () => { setToast(true); setTimeout(() => setToast(false), 2200); } });
    }
  };

  if (details.isPending || (__DEV__ && details.isFetching)) return <Loading onBack={onBack} />;
  if (details.isError || !details.data) return <ErrorPage onBack={onBack} message={details.isError ? apiErrorMessage(details.error) : 'Please try again.'} retry={() => void details.refetch()} />;

  const place = details.data;
  const photos = place.photoKeys.length > 0 ? place.photoKeys : [place.venue.imageKey ?? 'restaurant'];
  const photoCount = place.photoCount > 0 ? place.photoCount : photos.length;
  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <ScrollView
            horizontal
            onMomentumScrollEnd={(event) => setActivePhoto(Math.round(event.nativeEvent.contentOffset.x / width))}
            pagingEnabled
            showsHorizontalScrollIndicator={false}
          >
            {photos.map((key, index) => <Image key={key + String(index)} source={placeImage(key)} style={[styles.heroImage, { width }]} />)}
          </ScrollView>
          <LinearGradient colors={['rgba(0,0,0,0.78)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0)']} locations={[0, 0.55, 1]} style={styles.topShade} />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.78)']} style={styles.bottomShade} />
          <Pressable accessibilityLabel="Go back" hitSlop={14} onPress={onBack} style={[styles.navButton, { top: insets.top + 12 }]}><Text style={styles.back}>‹</Text></Pressable>
          <Pressable accessibilityLabel={saved ? 'Remove from saved' : 'Save place'} onPress={toggleSave} style={[styles.navButton, styles.save, { top: insets.top + 12 }]}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <BookmarkIcon color="#fff" height={18} width={18} />}
          </Pressable>
          <View style={styles.photoDots}>{photos.map((key, index) => <View key={key + String(index)} style={[styles.photoDot, index === activePhoto && styles.photoDotActive]} />)}</View>
          <Pressable onPress={() => setSheet('photos')} style={styles.photoCount}><Text style={styles.photoCountText}>{photoCount} photos ›</Text></Pressable>
        </View>
        <View style={styles.content}>
          <View style={styles.badges}><Text style={styles.primaryBadge}>Popular</Text><Text style={styles.primaryBadge}>★ {place.venue.rating?.toFixed(1) ?? '–'}</Text><Text style={styles.count}>{place.venue.reviewCount ?? 0} reviews</Text></View>
          <Text style={styles.title}>{place.venue.name}</Text>
          <Text style={styles.address}>{place.venue.address ?? place.venue.city}</Text>
          <View style={styles.chips}>{(place.chips.length > 0 ? place.chips : [place.venue.category, '$'.repeat(place.venue.priceLevel ?? 1), (place.venue.distanceKm ?? 0).toFixed(1) + ' km']).map((value) => <Text key={value} style={styles.chip}>{value}</Text>)}</View>
          <View style={styles.tabs}>{(['overview', 'reviews'] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === 'overview' ? 'Overview' : 'Reviews'}</Text></Pressable>)}</View>
          {tab === 'overview' ? <Overview details={place} openHours={() => setSheet('hours')} openPhotos={() => setSheet('photos')} styles={styles} /> : <Reviews error={reviews.isError ? apiErrorMessage(reviews.error) : null} items={reviews.data ?? []} loading={reviews.isPending} openSort={() => setSheet('sort')} retry={() => void reviews.refetch()} sort={sort} styles={styles} />}
        </View>
      </ScrollView>
      <Pressable onPress={onWriteReview} style={styles.reviewButton}><Text style={styles.reviewButtonText}>＋  Review now</Text></Pressable>
      {toast ? <View style={styles.toast}><Text style={styles.toastText}>✓ Saved to your favourites</Text></View> : null}
      <Hours visible={sheet === 'hours'} close={() => setSheet(null)} hours={place.openingHours} styles={styles} />
      <Gallery visible={sheet === 'photos'} close={() => setSheet(null)} photos={photos} styles={styles} />
      <Sort visible={sheet === 'sort'} close={() => setSheet(null)} selected={sort} select={setSort} styles={styles} />
    </View>
  );
}

function Overview({ details, openHours, openPhotos, styles }: { details: NonNullable<ReturnType<typeof usePlace>['data']>; openHours: () => void; openPhotos: () => void; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.section}>
    <Pressable onPress={openHours} style={styles.detail}><Text style={styles.detailText}>▣  {details.openingHours[0]?.hours ?? 'Opening hours'}</Text><Text style={styles.arrow}>›</Text></Pressable>
    {details.phone ? <Pressable style={styles.detail}><Text style={styles.detailText}>⌕  {details.phone}</Text><Text style={styles.arrow}>›</Text></Pressable> : null}
    {details.website ? <Pressable style={styles.detail}><Text style={styles.detailText}>◒  {details.website}</Text><Text style={styles.arrow}>›</Text></Pressable> : null}
    <Pressable onPress={openPhotos} style={styles.strip}>{details.photoKeys.slice(0, 3).map((key, index) => <Image key={key + String(index)} source={placeImage(key)} style={styles.stripImage} />)}<Text style={styles.seePhotos}>See all photos ›</Text></Pressable>
    <Text style={styles.sectionTitle}>☁  Top rated dishes</Text>
    {details.popularDishes.map((dish, index) => <View key={dish.name} style={styles.dish}><Text style={styles.dishName}>{index + 1}. {dish.name}</Text><Text style={styles.dishRating}>★ {dish.rating.toFixed(1)}</Text></View>)}
  </View>;
}

function Reviews({ error, items, loading, openSort, retry, sort, styles }: { error: string | null; items: NonNullable<ReturnType<typeof usePlaceReviews>['data']>; loading: boolean; openSort: () => void; retry: () => void; sort: PlaceReviewSort; styles: ReturnType<typeof createStyles> }) {
  if (loading) return <View style={styles.status}><ActivityIndicator color={styles.primaryBadge.backgroundColor as string} /></View>;
  if (error) return <View style={styles.status}><Text style={styles.errorCopy}>{error}</Text><Pressable onPress={retry}><Text style={styles.retry}>Try again</Text></Pressable></View>;
  return <View style={styles.section}>
    <View style={styles.reviewTools}><Text style={styles.all}>All</Text><Text style={styles.friends}>Friends</Text><Pressable onPress={openSort}><Text style={styles.sort}>⇅ {sorts[sort]}</Text></Pressable></View>
    {items.length === 0 ? <Text style={styles.empty}>No reviews yet.</Text> : items.map((review) => <View key={review.id} style={styles.review}>
      <View style={styles.reviewer}><Image source={personImage(review.authorPhotoUrl, review.authorAvatarKey)} style={styles.avatar} /><View style={styles.author}><Text style={styles.authorName}>{review.authorDisplayName}</Text><Text style={styles.authorHandle}>{review.authorUsername ? '@' + review.authorUsername : ''}</Text></View><Text style={styles.reviewDate}>{relativeTime(review.createdAt)}</Text></View>
      <Text style={styles.stars}>{'★'.repeat(Math.round(review.rating))}</Text><Text style={styles.reviewText}>{review.text}</Text>
      {review.dishNames.length > 0 ? <Text style={styles.dishes}>{review.dishNames.join('  ·  ')}</Text> : null}<Text style={styles.metrics}>♡ {review.reactionCount}   ◯ {review.commentCount}   ↗</Text>
    </View>)}
  </View>;
}

function Loading({ onBack }: { onBack: () => void }) {
  const { colors } = useAppTheme(); const insets = useSafeAreaInsets(); const styles = useMemo(() => createStyles(colors), [colors]);
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.82, duration: 780, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 780, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  return <View style={styles.screen}><Animated.View style={[styles.loadingHero, { opacity: pulse }]}><Pressable accessibilityLabel="Go back" hitSlop={14} onPress={onBack} style={[styles.navButton, { top: insets.top + 12 }]}><Text style={styles.back}>‹</Text></Pressable></Animated.View><View style={styles.content}><Animated.View style={[styles.skeleton, { opacity: pulse }]} /><Animated.View style={[styles.skeleton, styles.short, { opacity: pulse }]} /><Animated.View style={[styles.skeletonTabs, { opacity: pulse }]} />{[1, 2, 3].map((key) => <Animated.View key={key} style={[styles.skeletonRow, { opacity: pulse }]} />)}</View></View>;
}
function ErrorPage({ message, onBack, retry }: { message: string; onBack: () => void; retry: () => void }) {
  const { colors } = useAppTheme(); const styles = useMemo(() => createStyles(colors), [colors]);
  return <View style={[styles.screen, styles.errorPage]}><Pressable onPress={onBack}><Text style={styles.retry}>‹ Back</Text></Pressable><Text style={styles.errorTitle}>Could not load place</Text><Text style={styles.errorCopy}>{message}</Text><Pressable onPress={retry} style={styles.errorButton}><Text style={styles.reviewButtonText}>Try again</Text></Pressable></View>;
}
function Hours({ close, hours, styles, visible }: { close: () => void; hours: Array<{ day: string; hours: string }>; styles: ReturnType<typeof createStyles>; visible: boolean }) {
  return <Modal animationType="slide" transparent visible={visible} onRequestClose={close}><Pressable onPress={close} style={styles.backdrop}><Pressable style={styles.sheet}><View style={styles.sheetHead}><Text style={styles.sheetTitle}>▣  Opening hours</Text><Pressable onPress={close}><Text style={styles.close}>×</Text></Pressable></View>{hours.map((item) => <View key={item.day} style={styles.hours}><Text style={styles.day}>{item.day}</Text><Text style={styles.hour}>{item.hours}</Text></View>)}</Pressable></Pressable></Modal>;
}
function Gallery({ close, photos, styles, visible }: { close: () => void; photos: string[]; styles: ReturnType<typeof createStyles>; visible: boolean }) {
  return <Modal animationType="slide" visible={visible} onRequestClose={close}><View style={styles.gallery}><View style={styles.galleryHead}><Pressable onPress={close}><Text style={styles.galleryBack}>‹</Text></Pressable><Text style={styles.galleryTitle}>Photos</Text><View style={styles.spacer} /></View><ScrollView contentContainerStyle={styles.grid}>{[...photos, ...photos, ...photos].map((key, index) => <Image key={key + String(index)} source={placeImage(key)} style={styles.gridImage} />)}</ScrollView></View></Modal>;
}
function Sort({ close, select, selected, styles, visible }: { close: () => void; select: (sort: PlaceReviewSort) => void; selected: PlaceReviewSort; styles: ReturnType<typeof createStyles>; visible: boolean }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={close}><Pressable onPress={close} style={styles.backdrop}><Pressable style={styles.sortSheet}><View style={styles.sheetHead}><Text style={styles.sheetTitle}>Sort by</Text><Pressable onPress={close}><Text style={styles.close}>×</Text></Pressable></View>{(Object.keys(sorts) as PlaceReviewSort[]).map((key) => <Pressable key={key} onPress={() => { select(key); close(); }} style={styles.sortRow}><Text style={styles.sortOption}>{sorts[key]}</Text><Text style={styles.radio}>{key === selected ? '◉' : '○'}</Text></Pressable>)}</Pressable></Pressable></Modal>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, hero: { height: 365, overflow: 'hidden' }, heroImage: { height: 365, resizeMode: 'cover' }, topShade: { position: 'absolute', zIndex: 1, top: 0, right: 0, left: 0, height: 150 }, bottomShade: { position: 'absolute', zIndex: 1, right: 0, bottom: 0, left: 0, height: 135 },
  navButton: { position: 'absolute', zIndex: 2, elevation: 2, top: 16, left: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(33,33,33,0.64)' }, save: { left: undefined, right: 16 }, back: { color: '#fff', fontSize: 40, lineHeight: 40, marginTop: -4 }, photoDots: { position: 'absolute', zIndex: 2, bottom: 28, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }, photoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' }, photoDotActive: { backgroundColor: '#fff' }, photoCount: { position: 'absolute', zIndex: 2, right: 18, bottom: 18, borderRadius: 13, backgroundColor: 'rgba(66,66,66,0.72)', paddingHorizontal: 11, paddingVertical: 6 }, photoCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 95 }, badges: { marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryBadge: { color: '#fff', backgroundColor: colors.primary, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 5, fontSize: 10, fontWeight: '700' }, count: { color: colors.textMuted, fontSize: 11 }, title: { marginTop: 7, color: colors.text, fontSize: 21, fontWeight: '700' }, address: { marginTop: 5, color: colors.textSecondary, fontSize: 13 }, chips: { marginTop: 9, flexDirection: 'row', gap: 8 }, chip: { color: colors.text, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, fontSize: 11, fontWeight: '600' },
  tabs: { marginTop: 15, flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border }, tab: { flex: 1, alignItems: 'center', paddingBottom: 10 }, tabActive: { borderBottomWidth: 2, borderColor: colors.primary }, tabText: { color: colors.textMuted, fontSize: 11 }, tabTextActive: { color: colors.text, fontWeight: '700' }, section: { gap: 9, paddingTop: 10 },
  detail: { minHeight: 58, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderRadius: 29, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised }, detailText: { flex: 1, color: colors.textSecondary, fontSize: 13 }, arrow: { color: colors.textMuted, fontSize: 23 }, strip: { height: 100, flexDirection: 'row', gap: 4, overflow: 'hidden', borderRadius: 14, marginTop: 8 }, stripImage: { width: 112, height: 100, resizeMode: 'cover' }, seePhotos: { position: 'absolute', right: 9, bottom: 8, color: '#fff', backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, fontSize: 10 }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 18 }, dish: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, dishName: { flex: 1, color: colors.textSecondary, fontSize: 14 }, dishRating: { color: '#fff', backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7, fontSize: 11, fontWeight: '700' },
  reviewTools: { height: 34, padding: 4, flexDirection: 'row', alignItems: 'center', gap: 15, borderRadius: 17, backgroundColor: colors.surfaceRaised }, all: { color: '#111', backgroundColor: '#D9DDE5', borderRadius: 13, paddingHorizontal: 28, paddingVertical: 5, fontSize: 10, fontWeight: '700' }, friends: { flex: 1, color: colors.textMuted, fontSize: 10, textAlign: 'center' }, sort: { color: colors.text, fontSize: 10, paddingRight: 7 }, review: { gap: 6, padding: 11, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, reviewer: { flexDirection: 'row', alignItems: 'center' }, avatar: { width: 29, height: 29, borderRadius: 15 }, author: { flex: 1, paddingLeft: 7 }, authorName: { color: colors.text, fontSize: 11, fontWeight: '700' }, authorHandle: { color: colors.textMuted, fontSize: 9 }, reviewDate: { color: colors.textMuted, fontSize: 9 }, stars: { color: colors.primary, fontSize: 12 }, reviewText: { color: colors.textSecondary, fontSize: 11, lineHeight: 15 }, dishes: { color: colors.text, fontSize: 10, fontWeight: '600' }, metrics: { color: colors.textMuted, fontSize: 10 }, status: { alignItems: 'center', gap: 10, paddingVertical: 45 }, empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 32 }, retry: { color: colors.primary, fontWeight: '700' },
  reviewButton: { position: 'absolute', right: 16, left: 16, bottom: 18, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, reviewButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, toast: { position: 'absolute', alignSelf: 'center', bottom: 76, borderRadius: 18, backgroundColor: '#303030', paddingHorizontal: 16, paddingVertical: 10 }, toastText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  loadingHero: { height: 250, backgroundColor: colors.surfaceRaised }, skeleton: { height: 17, marginTop: 16, borderRadius: 8, backgroundColor: colors.surfaceRaised }, short: { width: '48%', marginTop: 9 }, skeletonTabs: { height: 35, marginTop: 20, borderRadius: 12, backgroundColor: colors.surfaceRaised }, skeletonRow: { height: 48, marginTop: 13, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  errorPage: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }, errorTitle: { color: colors.text, fontSize: 20, fontWeight: '700' }, errorCopy: { color: colors.textMuted, textAlign: 'center' }, errorButton: { borderRadius: 18, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }, sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 35, backgroundColor: colors.surface }, sortSheet: { margin: 18, borderRadius: 18, padding: 16, backgroundColor: colors.surface }, sheetHead: { minHeight: 34, flexDirection: 'row', alignItems: 'center' }, sheetTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }, close: { color: colors.textMuted, fontSize: 26 }, hours: { minHeight: 35, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, day: { flex: 1, color: colors.text, fontSize: 11 }, hour: { color: colors.textMuted, fontSize: 10 }, sortRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center' }, sortOption: { flex: 1, color: colors.text, fontSize: 13 }, radio: { color: colors.primary, fontSize: 17 },
  gallery: { flex: 1, paddingTop: 52, backgroundColor: colors.canvas }, galleryHead: { height: 42, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }, galleryBack: { color: colors.text, fontSize: 34, lineHeight: 34 }, galleryTitle: { flex: 1, color: colors.text, fontWeight: '700', textAlign: 'center' }, spacer: { width: 24 }, grid: { padding: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, gridImage: { width: '32.4%', aspectRatio: 1, borderRadius: 5, resizeMode: 'cover' },
});
