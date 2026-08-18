import type { PlaceReviewSort } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import restaurantImage from '../../../assets/discover/restaurant.png';
import fallbackAvatar from '../../../assets/home/avatar.png';
import BookmarkIcon from '../../../assets/favourites/bookmark.svg';
import SortIcon from '../../../assets/place/sort.svg';
import TopRatedDishesIcon from '../../../assets/place/top-rated-dishes.svg';
import { SaveToFolderSheet, type SaveablePlace } from '../favourites/FavouritesPane';
import { useSavedVenue, useUnsaveVenue } from '../favourites/api';
import { usePlace, usePlaceReviews } from '../discover/api';
import { cuisineFlag } from '../discover/cuisineFlags';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { useTastesApi } from '../../session/SessionProvider';
import { createIdempotencyKey } from '../../infrastructure/idempotency';
import { formatDisplayDate } from '../../infrastructure/date';

const sorts: Record<PlaceReviewSort, string> = { highest: 'Highest rated', lowest: 'Lowest rated', popular: 'Popular', recent: 'Recent', oldest: 'Oldest' };

function placeImage(url: string | null | undefined): ImageSourcePropType {
  return url ? { uri: url } : restaurantImage;
}
function personImage(url: string | null): ImageSourcePropType {
  return url ? { uri: url } : fallbackAvatar;
}

export function PlaceScreen({ onBack, onOpenComments, onWriteReview, userId, venueId }: { onBack: () => void; onOpenComments: (reviewId: string) => void; onWriteReview: () => void; userId: string; venueId: string }) {
  const api = useTastesApi();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [tab, setTab] = useState<'overview' | 'reviews'>('overview');
  const [sort, setSort] = useState<PlaceReviewSort>('recent');
  const [reviewScope, setReviewScope] = useState<'all' | 'friends'>('all');
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'hours' | 'photos' | 'sort' | null>(null);
  const [toast, setToast] = useState(false);
  const [saveTarget, setSaveTarget] = useState<SaveablePlace | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const details = usePlace(venueId);
  const reviews = usePlaceReviews(venueId, sort, reviewScope);
  const savedVenue = useSavedVenue(userId, venueId);
  const unsave = useUnsaveVenue(userId);
  const saved = savedVenue.saved;
  const busy = unsave.isPending;
  async function reactToReview(reviewId: string) {
    if (reactingId) return;
    setReactingId(reviewId);
    try {
      await api.reactToReview({ idempotencyKey: createIdempotencyKey('place-review-reaction'), reviewId, reaction: 'like' });
      await reviews.refetch();
    } finally {
      setReactingId(null);
    }
  }
  const toggleSave = () => {
    if (busy) return;
    if (saved) {
      unsave.mutate(venueId);
    } else {
      setSaveTarget({ venueId, name: details.data?.venue.name ?? '' });
    }
  };

  if (details.isPending || (__DEV__ && details.isFetching)) return <Loading onBack={onBack} />;
  if (details.isError || !details.data) return <ErrorPage onBack={onBack} message={details.isError ? apiErrorMessage(details.error) : 'Please try again.'} retry={() => void details.refetch()} />;

  const place = details.data;
  const photos = place.photoUrls.length > 0 ? place.photoUrls : [place.venue.imageUrl ?? ''];
  const photoCount = place.photoCount > 0 ? place.photoCount : photos.length;
  const categoryChip = place.venue.category;
  // Seed/CMS tags duplicate the category with a trailing emoji (e.g. "Japanese 🍣"
  // alongside category "Japanese") instead of being independent tags — strip those
  // out so they don't show up twice next to the category chip below.
  const categoryLabel = categoryChip
    ? [categoryChip, cuisineFlag(categoryChip)].filter(Boolean).join(' ')
    : categoryChip;
  const priceChip = '$'.repeat(place.venue.priceLevel ?? 1);
  const detailChips = place.chips
    .filter((value) => !(categoryChip && (value === categoryChip || value.startsWith(categoryChip))) && !/^\$+$/.test(value))
    .slice(0, 2);
  if (detailChips.length === 0) detailChips.push((place.venue.distanceKm ?? 0).toFixed(1) + ' km');
  const hero = <View style={styles.hero}>
    <ScrollView horizontal onMomentumScrollEnd={(event) => setActivePhoto(Math.round(event.nativeEvent.contentOffset.x / width))} pagingEnabled showsHorizontalScrollIndicator={false}>
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
  </View>;
  const intro = <View style={[styles.content, tab === 'reviews' && styles.reviewsContent]}>
    <View style={styles.badges}><Text style={styles.primaryBadge}>Popular</Text><Text style={styles.primaryBadge}>★ {place.venue.rating?.toFixed(1) ?? '–'}</Text><Text style={styles.count}>{place.venue.reviewCount ?? 0} reviews</Text></View>
    <Text style={styles.title}>{place.venue.name}</Text>
    <Text style={styles.address}>{place.venue.address ?? place.venue.city}</Text>
    <View style={styles.chips}>
      <View style={styles.compoundChip}>
        <Text style={styles.chipText}>{categoryLabel}</Text>
        <View style={styles.chipDivider} />
        <Text style={styles.chipSecondary}>{priceChip}</Text>
      </View>
      {detailChips.map((value) => <Text key={value} style={styles.chip}>{value}</Text>)}
    </View>
    <View style={styles.tabs}>{(['overview', 'reviews'] as const).map((value) => <Pressable key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === 'overview' ? 'Overview' : 'Reviews'}</Text></Pressable>)}</View>
    {tab === 'overview'
      ? <Overview details={place} openHours={() => setSheet('hours')} openPhotos={() => setSheet('photos')} styles={styles} />
      : <ReviewsHeader error={reviews.isError ? apiErrorMessage(reviews.error) : null} loading={reviews.isPending} openSort={() => setSheet('sort')} retry={() => void reviews.refetch()} scope={reviewScope} setScope={setReviewScope} sort={sort} styles={styles} />}
  </View>;
  return (
    <View style={styles.screen}>
      {tab === 'overview' ? <ScrollView showsVerticalScrollIndicator={false}>{hero}{intro}</ScrollView> : <FlatList
        data={reviews.data ?? []}
        initialNumToRender={8}
        keyExtractor={(review) => review.id}
        maxToRenderPerBatch={8}
        ListHeaderComponent={<>{hero}{intro}</>}
        ListEmptyComponent={!reviews.isPending && !reviews.isError ? <Text style={styles.empty}>No reviews yet.</Text> : null}
        ListFooterComponent={reviews.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ paddingVertical: 18 }} /> : null}
        onEndReached={() => { if (reviews.hasNextPage && !reviews.isFetchingNextPage) void reviews.fetchNextPage(); }}
        onEndReachedThreshold={0.5}
        windowSize={7}
        renderItem={({ item: review }) => <ReviewCard item={review} onComments={onOpenComments} onReact={(reviewId) => void reactToReview(reviewId)} onShare={(item) => void Share.share({ message: `${item.authorDisplayName} on Tastes: ${item.text}\nhttps://tastes.app/reviews/${item.id}` })} reactingId={reactingId} styles={styles} />}
        showsVerticalScrollIndicator={false}
      />}
      <Pressable onPress={onWriteReview} style={styles.reviewButton}><Text style={styles.reviewButtonText}>＋  Review now</Text></Pressable>
      {toast ? <View style={styles.toast}><Text style={styles.toastText}>✓ Saved to your favourites</Text></View> : null}
      <Hours visible={sheet === 'hours'} close={() => setSheet(null)} hours={place.openingHours} styles={styles} />
      <Gallery visible={sheet === 'photos'} close={() => setSheet(null)} photos={photos} styles={styles} />
      <Sort visible={sheet === 'sort'} close={() => setSheet(null)} selected={sort} select={setSort} styles={styles} />
      <SaveToFolderSheet
        onClose={() => setSaveTarget(null)}
        onSaved={() => { setToast(true); setTimeout(() => setToast(false), 2200); }}
        place={saveTarget}
        userId={userId}
        visible={saveTarget !== null}
      />
    </View>
  );
}

function Overview({ details, openHours, openPhotos, styles }: { details: NonNullable<ReturnType<typeof usePlace>['data']>; openHours: () => void; openPhotos: () => void; styles: ReturnType<typeof createStyles> }) {
  return <View style={styles.section}>
    <Pressable onPress={openHours} style={styles.detail}><Text style={styles.detailText}>▣  {details.openingHours[0]?.hours ?? 'Opening hours'}</Text><Text style={styles.arrow}>›</Text></Pressable>
    {details.phone ? <Pressable onPress={() => void Linking.openURL(`tel:${details.phone!.replace(/[^+\d]/g, '')}`)} style={styles.detail}><Text style={styles.detailText}>⌕  {details.phone}</Text><Text style={styles.arrow}>›</Text></Pressable> : null}
    {details.website ? <Pressable onPress={() => void Linking.openURL(/^https?:\/\//i.test(details.website!) ? details.website! : `https://${details.website}`)} style={styles.detail}><Text style={styles.detailText}>◒  {details.website}</Text><Text style={styles.arrow}>›</Text></Pressable> : null}
    <Pressable onPress={openPhotos} style={styles.strip}>{details.photoUrls.slice(0, 3).map((url, index) => <Image key={url + String(index)} source={placeImage(url)} style={styles.stripImage} />)}<Text style={styles.seePhotos}>See all photos ›</Text></Pressable>
    <View style={styles.sectionTitleRow}><TopRatedDishesIcon height={22} width={24} /><Text style={styles.sectionTitle}>Top rated dishes</Text></View>
    {details.popularDishes.map((dish, index) => <View key={dish.name} style={styles.dish}><Text style={styles.dishName}>{index + 1}. {dish.name}</Text><Text style={styles.dishRating}>★ {dish.rating.toFixed(1)}</Text></View>)}
  </View>;
}

function ReviewsHeader({ error, loading, openSort, retry, scope, setScope, sort, styles }: { error: string | null; loading: boolean; openSort: () => void; retry: () => void; scope: 'all' | 'friends'; setScope: (scope: 'all' | 'friends') => void; sort: PlaceReviewSort; styles: ReturnType<typeof createStyles> }) {
  if (loading) return <View style={styles.status}><ActivityIndicator color={styles.primaryBadge.backgroundColor as string} /></View>;
  if (error) return <View style={styles.status}><Text style={styles.errorCopy}>{error}</Text><Pressable onPress={retry}><Text style={styles.retry}>Try again</Text></Pressable></View>;
  return <View style={styles.reviewsHeader}>
    <View style={styles.reviewTools}>
      <View style={styles.scopeControl}>
        <Pressable onPress={() => setScope('all')} style={[styles.scopeButton, scope === 'all' && styles.scopeButtonActive]}><Text style={[styles.scopeText, scope === 'all' && styles.scopeTextActive]}>All</Text></Pressable>
        <Pressable onPress={() => setScope('friends')} style={[styles.scopeButton, scope === 'friends' && styles.scopeButtonActive]}><Text style={[styles.scopeText, scope === 'friends' && styles.scopeTextActive]}>Friends</Text></Pressable>
      </View>
      <Pressable accessibilityLabel={`Sort reviews: ${sorts[sort]}`} onPress={openSort} style={styles.sortButton}><SortIcon color={styles.sort.color} height={16} width={20} /></Pressable>
    </View>
  </View>;
}

function ReviewCard({ item: review, onComments, onReact, onShare, reactingId, styles }: { item: NonNullable<ReturnType<typeof usePlaceReviews>['data']>[number]; onComments: (reviewId: string) => void; onReact: (reviewId: string) => void; onShare: (review: NonNullable<ReturnType<typeof usePlaceReviews>['data']>[number]) => void; reactingId: string | null; styles: ReturnType<typeof createStyles> }) {
  return <View style={[styles.review, styles.reviewListCard]}>
      <View style={styles.reviewer}><Image source={personImage(review.authorPhotoUrl)} style={styles.avatar} /><View style={styles.author}><Text style={styles.authorName}>{review.authorDisplayName}</Text><Text style={styles.authorHandle}>{review.authorUsername ? '@' + review.authorUsername : ''}</Text></View><Text style={styles.reviewDate}>{formatDisplayDate(review.createdAt)}</Text></View>
      <View style={styles.reviewBody}>
        <Text style={styles.stars}>{'★'.repeat(Math.round(review.rating))}</Text><Text style={styles.reviewText}>{review.text}</Text>
        {review.dishNames.length > 0 ? <Text style={styles.dishes}>{review.dishNames.join('  ·  ')}</Text> : null}<View style={styles.metricActions}><Pressable disabled={reactingId === review.id} onPress={() => onReact(review.id)}><Text style={styles.metrics}>♡ {review.reactionCount}</Text></Pressable><Pressable onPress={() => onComments(review.id)}><Text style={styles.metrics}>◯ {review.commentCount}</Text></Pressable><Pressable onPress={() => onShare(review)}><Text style={styles.metrics}>↗</Text></Pressable></View>
      </View>
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
  return <Modal animationType="slide" visible={visible} onRequestClose={close}><View style={styles.gallery}><View style={styles.galleryHead}><Pressable onPress={close}><Text style={styles.galleryBack}>‹</Text></Pressable><Text style={styles.galleryTitle}>Photos</Text><View style={styles.spacer} /></View><ScrollView contentContainerStyle={styles.grid}>{[...photos, ...photos, ...photos].map((key, index) => <GalleryImage key={key + String(index)} index={index} styles={styles} url={key} />)}</ScrollView></View></Modal>;
}
function GalleryImage({ index, styles, url }: { index: number; styles: ReturnType<typeof createStyles>; url: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  return <View style={styles.gridImage}>
    {state === 'loading' ? <View style={styles.galleryLoading}><ActivityIndicator color={styles.retry.color as string} /></View> : null}
    {state === 'error' ? <Pressable accessibilityLabel={`Retry photo ${index + 1}`} onPress={() => { setAttempt((value) => value + 1); setState('loading'); }} style={styles.galleryError}><Text style={styles.galleryErrorIcon}>↻</Text><Text style={styles.galleryErrorText}>Retry</Text></Pressable> : null}
    <Image key={attempt} onError={() => setState('error')} onLoad={() => setState('ready')} source={placeImage(url)} style={[styles.galleryPhoto, state === 'error' && styles.hiddenPhoto]} />
  </View>;
}
function Sort({ close, select, selected, styles, visible }: { close: () => void; select: (sort: PlaceReviewSort) => void; selected: PlaceReviewSort; styles: ReturnType<typeof createStyles>; visible: boolean }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={close}><Pressable onPress={close} style={styles.backdrop}><Pressable style={styles.sortSheet}><View style={styles.sheetHead}><Text style={styles.sheetTitle}>Sort by</Text><Pressable onPress={close}><Text style={styles.close}>×</Text></Pressable></View>{(Object.keys(sorts) as PlaceReviewSort[]).map((key) => <Pressable key={key} onPress={() => { select(key); close(); }} style={styles.sortRow}><Text style={styles.sortOption}>{sorts[key]}</Text><Text style={styles.radio}>{key === selected ? '◉' : '○'}</Text></Pressable>)}</Pressable></Pressable></Modal>;
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas }, hero: { height: 365, overflow: 'hidden' }, heroImage: { height: 365, resizeMode: 'cover' }, topShade: { position: 'absolute', zIndex: 1, top: 0, right: 0, left: 0, height: 150 }, bottomShade: { position: 'absolute', zIndex: 1, right: 0, bottom: 0, left: 0, height: 135 },
  navButton: { position: 'absolute', zIndex: 2, elevation: 2, top: 16, left: 16, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(33,33,33,0.64)' }, save: { left: undefined, right: 16 }, back: { color: '#fff', fontSize: 40, lineHeight: 40, marginTop: -4 }, photoDots: { position: 'absolute', zIndex: 2, bottom: 28, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 }, photoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' }, photoDotActive: { backgroundColor: '#fff' }, photoCount: { position: 'absolute', zIndex: 2, right: 18, bottom: 18, borderRadius: 13, backgroundColor: 'rgba(66,66,66,0.72)', paddingHorizontal: 11, paddingVertical: 6 }, photoCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 95 }, reviewsContent: { paddingBottom: 0 }, badges: { marginTop: 15, flexDirection: 'row', alignItems: 'center', gap: 7 }, primaryBadge: { color: '#fff', backgroundColor: colors.primary, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 5, fontSize: 10, fontWeight: '700' }, count: { color: colors.textMuted, fontSize: 11 }, title: { marginTop: 7, color: colors.text, fontSize: 21, fontWeight: '700' }, address: { marginTop: 5, color: colors.textSecondary, fontSize: 13 }, chips: { marginTop: 9, flexDirection: 'row', alignItems: 'center', gap: 7 }, compoundChip: { height: 33, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, backgroundColor: colors.background }, chipDivider: { width: StyleSheet.hairlineWidth, height: 18, marginHorizontal: 8, backgroundColor: colors.border }, chipText: { color: colors.text, fontSize: 11, fontWeight: '600' }, chipSecondary: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' }, chip: { height: 33, color: colors.text, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, fontSize: 11, fontWeight: '600' },
  tabs: { marginTop: 15, flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border }, tab: { flex: 1, alignItems: 'center', paddingBottom: 10 }, tabActive: { borderBottomWidth: 2, borderColor: colors.primary }, tabText: { color: colors.textMuted, fontSize: 11 }, tabTextActive: { color: colors.text, fontWeight: '700' }, section: { gap: 9, paddingTop: 10 },
  detail: { minHeight: 58, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', borderRadius: 29, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised }, detailText: { flex: 1, color: colors.textSecondary, fontSize: 13 }, arrow: { color: colors.textMuted, fontSize: 23 }, strip: { height: 100, flexDirection: 'row', gap: 4, overflow: 'hidden', borderRadius: 14, marginTop: 8 }, stripImage: { width: 112, height: 100, resizeMode: 'cover' }, seePhotos: { position: 'absolute', right: 9, bottom: 8, color: '#fff', backgroundColor: 'rgba(0,0,0,0.72)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, fontSize: 10 }, sectionTitleRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 }, sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700' }, dish: { minHeight: 60, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, dishName: { flex: 1, color: colors.textSecondary, fontSize: 14 }, dishRating: { color: '#fff', backgroundColor: colors.primary, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7, fontSize: 11, fontWeight: '700' },
  reviewsHeader: { paddingTop: 10, paddingBottom: 10 }, reviewTools: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, scopeControl: { flex: 1, height: 34, padding: 3, flexDirection: 'row', borderRadius: 17, backgroundColor: colors.surfaceRaised }, scopeButton: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, scopeButtonActive: { backgroundColor: '#D9DDE5' }, scopeText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' }, scopeTextActive: { color: '#111' }, sortButton: { width: 40, height: 40, borderWidth: 1, borderColor: colors.primary, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas }, sort: { color: colors.text }, review: { overflow: 'hidden', borderRadius: 24, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, reviewListCard: { marginHorizontal: 16, marginBottom: 12 }, reviewer: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceMuted }, avatar: { width: 40, height: 40, borderRadius: 20 }, author: { flex: 1, gap: 3, paddingLeft: 7 }, authorName: { color: colors.text, fontSize: 15, fontWeight: '600' }, authorHandle: { color: colors.textSecondary, fontSize: 13 }, reviewDate: { color: colors.textMuted, fontSize: 12 }, reviewBody: { gap: 8, padding: 16 }, stars: { color: colors.primary, fontSize: 16 }, reviewText: { color: colors.text, fontSize: 14, lineHeight: 18 }, dishes: { color: colors.text, fontSize: 12, fontWeight: '600' }, metricActions: { flexDirection: 'row', gap: 18, alignItems: 'center' }, metrics: { color: colors.text, fontSize: 13 }, status: { alignItems: 'center', gap: 10, paddingVertical: 45 }, empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: 32 }, retry: { color: colors.primary, fontWeight: '700' },
  reviewButton: { position: 'absolute', right: 16, left: 16, bottom: 18, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }, reviewButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' }, toast: { position: 'absolute', alignSelf: 'center', bottom: 76, borderRadius: 18, backgroundColor: '#303030', paddingHorizontal: 16, paddingVertical: 10 }, toastText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  loadingHero: { height: 250, backgroundColor: colors.surfaceRaised }, skeleton: { height: 17, marginTop: 16, borderRadius: 8, backgroundColor: colors.surfaceRaised }, short: { width: '48%', marginTop: 9 }, skeletonTabs: { height: 35, marginTop: 20, borderRadius: 12, backgroundColor: colors.surfaceRaised }, skeletonRow: { height: 48, marginTop: 13, borderRadius: 12, backgroundColor: colors.surfaceRaised },
  errorPage: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 }, errorTitle: { color: colors.text, fontSize: 20, fontWeight: '700' }, errorCopy: { color: colors.textMuted, textAlign: 'center' }, errorButton: { borderRadius: 18, backgroundColor: colors.primary, paddingHorizontal: 18, paddingVertical: 10 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }, sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 35, backgroundColor: colors.surface }, sortSheet: { margin: 18, borderRadius: 18, padding: 16, backgroundColor: colors.surface }, sheetHead: { minHeight: 34, flexDirection: 'row', alignItems: 'center' }, sheetTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' }, close: { color: colors.textMuted, fontSize: 26 }, hours: { minHeight: 35, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, day: { flex: 1, color: colors.text, fontSize: 11 }, hour: { color: colors.textMuted, fontSize: 10 }, sortRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center' }, sortOption: { flex: 1, color: colors.text, fontSize: 13 }, radio: { color: colors.primary, fontSize: 17 },
  gallery: { flex: 1, paddingTop: 52, backgroundColor: colors.canvas }, galleryHead: { height: 42, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }, galleryBack: { color: colors.text, fontSize: 34, lineHeight: 34 }, galleryTitle: { flex: 1, color: colors.text, fontWeight: '700', textAlign: 'center' }, spacer: { width: 24 }, grid: { padding: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, gridImage: { width: '32.4%', aspectRatio: 1, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.surfaceRaised }, galleryPhoto: { width: '100%', height: '100%', resizeMode: 'cover' }, hiddenPhoto: { opacity: 0 }, galleryLoading: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }, galleryError: { position: 'absolute', inset: 0, zIndex: 2, alignItems: 'center', justifyContent: 'center', gap: 3 }, galleryErrorIcon: { color: colors.primary, fontSize: 24, fontWeight: '700' }, galleryErrorText: { color: colors.textMuted, fontSize: 10, fontWeight: '600' },
});
