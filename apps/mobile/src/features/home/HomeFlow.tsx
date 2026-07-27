import { useEffect, useState } from 'react';
import {
  Image,
  ImageBackground,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import avatar from '../../../assets/home/avatar.png';
import dishOne from '../../../assets/home/dish-1.jpg';
import dishTwo from '../../../assets/home/dish-2.png';
import friendsEmptyIcon from '../../../assets/home/friends-empty.png';
import localEmptyIcon from '../../../assets/home/local-empty.png';
import logo from '../../../assets/home/logo.png';
import notificationIcon from '../../../assets/home/notification.png';
import offlineIcon from '../../../assets/home/offline.png';
import recommendation from '../../../assets/home/recommendation.jpg';
import statsIcon from '../../../assets/home/stats.png';
import pattern from '../../../assets/onboarding/pattern-screen.png';

export type HomePreviewState =
  | 'friendsEmpty'
  | 'localEmpty'
  | 'offline'
  | 'loading'
  | 'postMenu'
  | 'newPosts'
  | 'recommendationMenu'
  | 'commentsEmpty'
  | 'commentMenu'
  | 'report'
  | 'reportSent';

type HomeFlowProps = {
  embeddedInTabs?: boolean;
  initialState: HomePreviewState;
  onBack: () => void;
  onOpenComments?: (mode: 'empty' | 'menu') => void;
  onOpenReport?: () => void;
  onReportSent?: () => void;
};

const RED = '#B82F29';
const BLACK = '#080808';
const CARD = '#161616';
const CARD_SECONDARY = '#222222';
const BORDER = '#45474B';
const SECONDARY = 'rgba(255,255,255,0.55)';

function SvgAsset({ source, size, width }: { source: ImageSourcePropType; size: number; width?: number }) {
  return <Image source={source} resizeMode="contain" style={{ width: width ?? size, height: size }} />;
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function HomeHeader({
  activeTab,
  onChangeTab,
  onExit,
}: {
  activeTab: 'friends' | 'local';
  onChangeTab: (tab: 'friends' | 'local') => void;
  onExit: () => void;
}) {
  return (
    <View style={styles.homeHeader}>
      <View style={styles.statusSpacer} />
      <View style={styles.headerControls}>
        <Pressable accessibilityLabel="Close Home preview" onPress={onExit} style={styles.headerIcon}>
          <SvgAsset source={statsIcon} size={24} />
        </Pressable>
        <SvgAsset source={logo} size={37} width={72} />
        <View style={styles.headerIcon}>
          <SvgAsset source={notificationIcon} size={24} />
        </View>
      </View>
      <View style={styles.switcher}>
        {(['friends', 'local'] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => onChangeTab(tab)}
            style={[styles.switchButton, activeTab === tab && styles.switchButtonActive]}
          >
            <Text style={[styles.switchText, activeTab === tab && styles.switchTextActive]}>
              {tab === 'friends' ? 'Friends' : 'Local'}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TabBar() {
  return (
    <View style={styles.tabBar}>
      <View style={styles.tabItem}><Text style={styles.tabIcon}>▣</Text><Text style={styles.tabTextActive}>Home</Text></View>
      <View style={styles.tabItem}><Text style={styles.tabIconMuted}>⌾</Text><Text style={styles.tabText}>Discover</Text></View>
      <View style={styles.addButton}><Text style={styles.addButtonText}>＋</Text></View>
      <View style={styles.tabItem}><Text style={styles.tabIconMuted}>◌</Text><Text style={styles.tabText}>Dialog</Text></View>
      <View style={styles.tabItem}><Text style={styles.tabIconMuted}>♙</Text><Text style={styles.tabText}>Profile</Text></View>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: ImageSourcePropType;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <SvgAsset source={icon} size={60} />
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      <PrimaryButton label={action} onPress={onAction} />
    </View>
  );
}

function Stars() {
  return <Text style={styles.stars}>★ ★ ★ ★ ★</Text>;
}

function ReviewCard({
  onLongPress,
  onComments,
}: {
  onLongPress: () => void;
  onComments: () => void;
}) {
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        <Image source={avatar} style={styles.avatar} />
        <View style={styles.authorCopy}>
          <Text style={styles.authorName}>Jane Cooper</Text>
          <Text style={styles.handle}>@nickname2321</Text>
        </View>
        <Text style={styles.date}>Dec 5, 2025</Text>
      </View>
      <View style={styles.reviewBody}>
        <Text style={styles.place}>Joe’s Shanghai Soup Dumpling Restaurant</Text>
        <View style={styles.ratingRow}>
          <Stars />
          <View style={styles.tag}><Text style={styles.tagText}>☾ Date night</Text></View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dishRow}>
          <Image source={dishOne} style={styles.dishImage} />
          <Image source={dishTwo} style={styles.dishImage} />
        </ScrollView>
        <Text style={styles.reviewText}>The soup dumplings were incredible — rich broth, delicate wrappers, and worth the wait.</Text>
        <View style={styles.metrics}>
          <Text style={styles.metricLiked}>♥ 2301</Text>
          <Pressable onPress={onComments}><Text style={styles.metric}>◯ 520</Text></Pressable>
          <Text style={styles.metric}>↗</Text>
        </View>
      </View>
    </Pressable>
  );
}

function RecommendationCard({ onLongPress }: { onLongPress: () => void }) {
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} style={styles.recommendationCard}>
      <Image source={recommendation} style={styles.recommendationImage} />
      <View style={styles.recommendationCopy}>
        <Text style={styles.recommendationEyebrow}>RECOMMENDED FOR YOU</Text>
        <Text style={styles.recommendationTitle}>Grill 23 & Bar</Text>
        <Text style={styles.recommendationMeta}>Steakhouse · 4.8 ★ · 1.2 km</Text>
        <Text style={styles.recommendationReason}>Because you liked Joe’s Shanghai</Text>
      </View>
    </Pressable>
  );
}

function LoadingFeed({ embeddedInTabs }: { embeddedInTabs: boolean }) {
  return (
    <View style={[styles.loadingFeed, embeddedInTabs && styles.loadingFeedEmbedded]}>
      {[0, 1].map((card) => (
        <View key={card} style={styles.skeletonCard}>
          <View style={styles.skeletonHeader}>
            <View style={styles.skeletonAvatar} />
            <View style={styles.skeletonCopy}>
              <View style={[styles.skeletonLine, { width: '54%' }]} />
              <View style={[styles.skeletonLine, { width: '34%' }]} />
            </View>
          </View>
          <View style={[styles.skeletonLine, { width: '64%' }]} />
          <View style={styles.skeletonImages}>
            <View style={styles.skeletonImage} />
            <View style={styles.skeletonImage} />
            <View style={styles.skeletonImage} />
          </View>
          <View style={[styles.skeletonLine, { width: '92%' }]} />
          <View style={[styles.skeletonLine, { width: '72%' }]} />
        </View>
      ))}
    </View>
  );
}

function ActionSheet({
  actions,
  onCancel,
}: {
  actions: Array<{ label: string; destructive?: boolean; onPress: () => void }>;
  onCancel: () => void;
}) {
  return (
    <View style={styles.scrim}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={styles.sheet}>
        <View style={styles.sheetGroup}>
          {actions.map((action, index) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={[styles.sheetAction, index > 0 && styles.sheetDivider]}
            >
              <Text style={[styles.sheetActionText, action.destructive && styles.destructive]}>{action.label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable onPress={onCancel} style={styles.sheetCancel}><Text style={styles.sheetCancelText}>Cancel</Text></Pressable>
      </View>
    </View>
  );
}

function Feed({
  embeddedInTabs,
  showNewPosts,
  onDismissNewPosts,
  onPostMenu,
  onRecommendationMenu,
  onComments,
}: {
  embeddedInTabs: boolean;
  showNewPosts: boolean;
  onDismissNewPosts: () => void;
  onPostMenu: () => void;
  onRecommendationMenu: () => void;
  onComments: () => void;
}) {
  return (
    <>
      <ScrollView style={[styles.feed, embeddedInTabs && styles.feedEmbedded]} contentContainerStyle={styles.feedContent} showsVerticalScrollIndicator={false}>
        <ReviewCard onLongPress={onPostMenu} onComments={onComments} />
        <RecommendationCard onLongPress={onRecommendationMenu} />
      </ScrollView>
      {showNewPosts && (
        <Pressable onPress={onDismissNewPosts} style={styles.newPostsPill}>
          <Text style={styles.newPostsText}>↑  New posts</Text>
        </Pressable>
      )}
    </>
  );
}

function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return <View style={styles.toast}><Text style={styles.toastText}>✓  {text}</Text></View>;
}

function HomeScreen({
  embeddedInTabs,
  state,
  setState,
  onBack,
  onOpenComments,
  onOpenReport,
}: {
  embeddedInTabs: boolean;
  state: HomePreviewState;
  setState: (state: HomePreviewState) => void;
  onBack: () => void;
  onOpenComments?: (mode: 'empty' | 'menu') => void;
  onOpenReport?: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [newPostsDismissed, setNewPostsDismissed] = useState(false);
  const activeTab = state === 'localEmpty' ? 'local' : 'friends';
  const showFeed = ['postMenu', 'newPosts', 'recommendationMenu'].includes(state);

  function notify(message: string) {
    setToast(message);
    setState('newPosts');
  }

  return (
    <ImageBackground source={pattern} resizeMode="repeat" style={styles.screen}>
      <HomeHeader
        activeTab={activeTab}
        onChangeTab={(tab) => setState(tab === 'local' ? 'localEmpty' : 'friendsEmpty')}
        onExit={onBack}
      />
      {state === 'friendsEmpty' && (
        <EmptyState
          icon={friendsEmptyIcon}
          title="Your feed is quiet"
          body="Follow friends to see their reviews and recommendations here."
          action="Find friends"
          onAction={() => setState('newPosts')}
        />
      )}
      {state === 'localEmpty' && (
        <EmptyState
          icon={localEmptyIcon}
          title="No posts in your city yet"
          body="Be the first to review a place in Monaco — your post starts the feed."
          action="Browse restaurants"
          onAction={() => setState('newPosts')}
        />
      )}
      {state === 'offline' && (
        <EmptyState
          icon={offlineIcon}
          title="No connection"
          body="Check your internet connection and try again."
          action="Retry"
          onAction={() => setState('loading')}
        />
      )}
      {state === 'loading' && <LoadingFeed embeddedInTabs={embeddedInTabs} />}
      {showFeed && (
        <Feed
          embeddedInTabs={embeddedInTabs}
          showNewPosts={state === 'newPosts' && !newPostsDismissed}
          onDismissNewPosts={() => setNewPostsDismissed(true)}
          onPostMenu={() => setState('postMenu')}
          onRecommendationMenu={() => setState('recommendationMenu')}
          onComments={() => onOpenComments ? onOpenComments('empty') : setState('commentsEmpty')}
        />
      )}
      {!embeddedInTabs && <TabBar />}
      <Toast text={toast} />
      {state === 'postMenu' && (
        <ActionSheet
          actions={[
            { label: 'Report post', destructive: true, onPress: () => onOpenReport ? onOpenReport() : setState('report') },
            { label: 'Block this user', destructive: true, onPress: () => notify('User blocked') },
          ]}
          onCancel={() => setState('newPosts')}
        />
      )}
      {state === 'recommendationMenu' && (
        <ActionSheet
          actions={[
            { label: 'Why am I seeing this?', onPress: () => notify('Shown because it matches your tastes') },
            { label: 'Not interested', destructive: true, onPress: () => notify('Recommendation hidden') },
          ]}
          onCancel={() => setState('newPosts')}
        />
      )}
    </ImageBackground>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.backHeader}>
      <View style={styles.statusSpacer} />
      <View style={styles.backHeaderRow}>
        <Pressable onPress={onBack} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
        <Text style={styles.backTitle}>{title}</Text>
        <View style={styles.backButton} />
      </View>
    </View>
  );
}

function CommentRow({ onLongPress }: { onLongPress: () => void }) {
  return (
    <Pressable onLongPress={onLongPress} delayLongPress={350} style={styles.commentRow}>
      <Image source={avatar} style={styles.commentAvatar} />
      <View style={styles.commentContent}>
        <View style={styles.commentTitleRow}>
          <Text style={styles.commentAuthor}>Maria Kaine</Text>
          <Text style={styles.commentDate}>2h</Text>
        </View>
        <Text style={styles.commentText}>That looks amazing! Adding this place to my list.</Text>
        <View style={styles.commentMetrics}><Text style={styles.metricLiked}>♥ 24</Text><Text style={styles.metric}>Reply</Text></View>
      </View>
    </Pressable>
  );
}

function CommentsScreen({
  empty,
  initialMenu,
  onBack,
}: {
  empty: boolean;
  initialMenu: boolean;
  onBack: () => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(initialMenu);

  function menuAction(message: string) {
    setToast(message);
    setShowMenu(false);
  }

  return (
    <ImageBackground source={pattern} resizeMode="repeat" style={styles.screen}>
      <BackHeader title="Comments" onBack={onBack} />
      <ScrollView style={styles.commentsScroll} contentContainerStyle={styles.commentsContent}>
        <View style={styles.commentsPost}>
          <View style={styles.reviewHeader}>
            <Image source={avatar} style={styles.avatar} />
            <View style={styles.authorCopy}><Text style={styles.authorName}>Jane Cooper</Text><Text style={styles.handle}>@nickname2321</Text></View>
            <Text style={styles.date}>Dec 5</Text>
          </View>
          <Text style={styles.place}>Joe’s Shanghai Soup Dumpling Restaurant</Text>
          <Stars />
          <Text style={styles.reviewText}>The soup dumplings were incredible — rich broth and delicate wrappers.</Text>
        </View>
        {empty ? (
          <View style={styles.commentsEmpty}>
            <SvgAsset source={localEmptyIcon} size={60} />
            <Text style={styles.emptyTitle}>No comments yet</Text>
            <Text style={styles.emptyBody}>Be the first to share your thoughts on this review.</Text>
          </View>
        ) : (
          <>
            <CommentRow onLongPress={() => setShowMenu(true)} />
            <CommentRow onLongPress={() => setShowMenu(true)} />
          </>
        )}
      </ScrollView>
      <View style={styles.commentComposer}>
        <TextInput placeholder="Add comment" placeholderTextColor={SECONDARY} style={styles.commentInput} />
        <View style={styles.sendButton}><Text style={styles.sendText}>↑</Text></View>
      </View>
      <Toast text={toast} />
      {showMenu && (
        <ActionSheet
          actions={[
            { label: 'Copy text', onPress: () => menuAction('Text copied') },
            { label: 'Report comment', destructive: true, onPress: () => menuAction('Comment reported') },
            { label: 'Delete', destructive: true, onPress: () => menuAction('Comment deleted') },
          ]}
          onCancel={() => setShowMenu(false)}
        />
      )}
    </ImageBackground>
  );
}

const reportReasons = [
  'Spam or scam',
  'Inappropriate content',
  'Harassment or bullying',
  'Hate speech or symbols',
  'Violence or dangerous acts',
  'False information',
  'Something else',
];

function ReportScreen({ onBack, onSent }: { onBack: () => void; onSent: () => void }) {
  const [selected, setSelected] = useState('Spam or scam');
  const [details, setDetails] = useState('');
  return (
    <View style={styles.reportScreen}>
      <BackHeader title="Report" onBack={onBack} />
      <ScrollView style={styles.reportScroll} contentContainerStyle={styles.reportContent}>
        <Text style={styles.reportQuestion}>Why are you reporting this post?</Text>
        {reportReasons.map((reason) => (
          <Pressable key={reason} onPress={() => setSelected(reason)} style={styles.reportRow}>
            <Text style={styles.reportReason}>{reason}</Text>
            <View style={[styles.radio, selected === reason && styles.radioSelected]}>
              {selected === reason && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        ))}
        {selected === 'Something else' && (
          <View style={styles.detailsWrap}>
            <TextInput
              value={details}
              onChangeText={(value) => setDetails(value.slice(0, 300))}
              multiline
              placeholder="Tell us what happened…"
              placeholderTextColor={SECONDARY}
              style={styles.detailsInput}
            />
            <Text style={styles.counter}>{details.length}/300</Text>
          </View>
        )}
      </ScrollView>
      <View style={styles.reportFooter}><PrimaryButton label="Submit report" onPress={onSent} /></View>
    </View>
  );
}

function ReportSent({ onDone }: { onDone: () => void }) {
  return (
    <ImageBackground source={pattern} resizeMode="repeat" style={styles.screen}>
      <BackHeader title="Report" onBack={onDone} />
      <View style={styles.reportSentCenter}>
        <View style={styles.successIcon}><Text style={styles.successCheck}>✓</Text></View>
        <Text style={styles.emptyTitle}>Report sent</Text>
        <Text style={styles.emptyBody}>Thanks for helping keep Tastes safe. Our team will review this shortly.</Text>
      </View>
      <View style={styles.reportFooter}><PrimaryButton label="Done" onPress={onDone} /></View>
    </ImageBackground>
  );
}

export function HomeFlow({
  embeddedInTabs = false,
  initialState,
  onBack,
  onOpenComments,
  onOpenReport,
  onReportSent,
}: HomeFlowProps) {
  const [state, setState] = useState<HomePreviewState>(initialState);
  const { width } = useWindowDimensions();
  const scale = Math.min(1, width / 402);

  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  let content;
  if (state === 'commentsEmpty' || state === 'commentMenu') {
    content = (
      <CommentsScreen
        empty={state === 'commentsEmpty'}
        initialMenu={state === 'commentMenu'}
        onBack={() => setState('newPosts')}
      />
    );
  } else if (state === 'report') {
    content = (
      <ReportScreen
        onBack={onBack}
        onSent={() => onReportSent ? onReportSent() : setState('reportSent')}
      />
    );
  } else if (state === 'reportSent') {
    content = <ReportSent onDone={onBack} />;
  } else {
    content = (
      <HomeScreen
        embeddedInTabs={embeddedInTabs}
        state={state}
        setState={setState}
        onBack={onBack}
        onOpenComments={onOpenComments}
        onOpenReport={onOpenReport}
      />
    );
  }

  return (
    <View style={styles.viewport}>
      <View style={[styles.deviceCanvas, scale < 1 && { transform: [{ scale }], width: 402 / scale }]}>
        {content}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: CARD },
  deviceCanvas: { flex: 1, backgroundColor: CARD },
  screen: { flex: 1, backgroundColor: CARD },
  pressed: { opacity: 0.8 },
  statusSpacer: { height: 54 },
  homeHeader: { position: 'absolute', zIndex: 10, left: 0, right: 0, top: 0, height: 157, alignItems: 'center', backgroundColor: BLACK, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerControls: { height: 44, width: '100%', paddingHorizontal: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  switcher: { marginTop: 7, width: 370, height: 40, padding: 4, borderRadius: 100, flexDirection: 'row', backgroundColor: 'rgba(223,223,233,0.12)' },
  switchButton: { flex: 1, borderRadius: 100, alignItems: 'center', justifyContent: 'center' },
  switchButtonActive: { backgroundColor: '#D9DDE5' },
  switchText: { color: '#C4CAD7', opacity: 0.5, fontSize: 13 },
  switchTextActive: { color: CARD, opacity: 1, fontWeight: '700' },
  tabBar: { position: 'absolute', zIndex: 10, left: 0, right: 0, bottom: 0, height: 70, paddingHorizontal: 8, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: BLACK },
  tabItem: { width: 70, paddingTop: 9, alignItems: 'center', gap: 1 },
  tabIcon: { color: '#fff', fontSize: 21, height: 25 },
  tabIconMuted: { color: '#fff', opacity: 0.6, fontSize: 21, height: 25 },
  tabTextActive: { color: '#fff', fontSize: 12 },
  tabText: { color: '#fff', opacity: 0.6, fontSize: 12 },
  addButton: { marginTop: -8, width: 60, height: 60, borderRadius: 30, borderWidth: 5, borderColor: BLACK, backgroundColor: RED, alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: '#fff', fontSize: 27, fontWeight: '300', marginTop: -3 },
  emptyState: { position: 'absolute', left: 41, right: 41, top: '50%', transform: [{ translateY: -70 }], alignItems: 'center', gap: 14 },
  emptyTitle: { color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  emptyBody: { color: SECONDARY, fontSize: 15, lineHeight: 19, textAlign: 'center' },
  primaryButton: { minHeight: 42, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: RED },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '500' },
  feed: { position: 'absolute', top: 157, bottom: 70, left: 0, right: 0 },
  feedEmbedded: { bottom: 0 },
  feedContent: { padding: 15, gap: 16, paddingBottom: 30 },
  reviewCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 24, backgroundColor: CARD, overflow: 'hidden' },
  reviewHeader: { minHeight: 72, padding: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: CARD_SECONDARY },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  authorCopy: { flex: 1, paddingLeft: 10 },
  authorName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  handle: { color: SECONDARY, fontSize: 12, marginTop: 2 },
  date: { color: SECONDARY, fontSize: 12 },
  reviewBody: { padding: 14, gap: 10 },
  place: { color: '#fff', fontSize: 15, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stars: { color: '#D33B35', fontSize: 19, fontWeight: '700' },
  tag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#292929' },
  tagText: { color: '#fff', fontSize: 11 },
  dishRow: { gap: 10 },
  dishImage: { width: 150, height: 150, borderRadius: 17, backgroundColor: '#2B2B2B' },
  reviewText: { color: 'rgba(255,255,255,0.76)', fontSize: 13, lineHeight: 18 },
  metrics: { borderTopWidth: 1, borderTopColor: '#303030', paddingTop: 11, flexDirection: 'row', gap: 18 },
  metric: { color: 'rgba(255,255,255,0.72)', fontSize: 13 },
  metricLiked: { color: '#D84A43', fontSize: 13 },
  recommendationCard: { minHeight: 142, borderRadius: 22, overflow: 'hidden', flexDirection: 'row', backgroundColor: CARD_SECONDARY },
  recommendationImage: { width: 128, alignSelf: 'stretch' },
  recommendationCopy: { flex: 1, padding: 14, justifyContent: 'center', gap: 5 },
  recommendationEyebrow: { color: '#D84A43', fontSize: 10, fontWeight: '700' },
  recommendationTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  recommendationMeta: { color: '#fff', fontSize: 12 },
  recommendationReason: { color: SECONDARY, fontSize: 11, marginTop: 5 },
  newPostsPill: { position: 'absolute', zIndex: 11, top: 168, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: RED, shadowColor: '#000', shadowOpacity: 0.36, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  newPostsText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  loadingFeed: { position: 'absolute', top: 172, left: 15, right: 15, bottom: 70, gap: 16 },
  loadingFeedEmbedded: { bottom: 0 },
  skeletonCard: { padding: 14, gap: 12, borderRadius: 24, backgroundColor: CARD_SECONDARY },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  skeletonAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#343434' },
  skeletonCopy: { flex: 1, gap: 8 },
  skeletonLine: { height: 10, borderRadius: 6, backgroundColor: '#373737' },
  skeletonImages: { flexDirection: 'row', gap: 8 },
  skeletonImage: { flex: 1, aspectRatio: 1, borderRadius: 14, backgroundColor: '#303030' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30, justifyContent: 'flex-end', padding: 8, paddingBottom: 14, backgroundColor: 'rgba(0,0,0,0.64)' },
  sheet: { gap: 8 },
  sheetGroup: { overflow: 'hidden', borderRadius: 16, backgroundColor: '#272727' },
  sheetAction: { height: 54, alignItems: 'center', justifyContent: 'center' },
  sheetDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#484848' },
  sheetActionText: { color: '#fff', fontSize: 17 },
  destructive: { color: '#FF453A' },
  sheetCancel: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#272727' },
  sheetCancelText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  toast: { position: 'absolute', zIndex: 40, top: 168, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: '#303030' },
  toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  backHeader: { position: 'absolute', zIndex: 10, top: 0, left: 0, right: 0, height: 102, backgroundColor: BLACK },
  backHeaderRow: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 52, height: 48, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 38, lineHeight: 39, fontWeight: '300' },
  backTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  commentsScroll: { position: 'absolute', top: 102, bottom: 70, left: 0, right: 0 },
  commentsContent: { minHeight: 730, paddingBottom: 40 },
  commentsPost: { padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: '#333', backgroundColor: CARD },
  commentsEmpty: { marginTop: 126, paddingHorizontal: 41, alignItems: 'center', gap: 14 },
  commentRow: { padding: 16, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', backgroundColor: CARD },
  commentAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentContent: { flex: 1, paddingLeft: 10, gap: 6 },
  commentTitleRow: { flexDirection: 'row', justifyContent: 'space-between' },
  commentAuthor: { color: '#fff', fontSize: 14, fontWeight: '700' },
  commentDate: { color: SECONDARY, fontSize: 12 },
  commentText: { color: 'rgba(255,255,255,0.82)', fontSize: 14, lineHeight: 19 },
  commentMetrics: { flexDirection: 'row', gap: 18, marginTop: 3 },
  commentComposer: { position: 'absolute', zIndex: 12, left: 0, right: 0, bottom: 0, height: 70, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BLACK },
  commentInput: { flex: 1, height: 44, paddingHorizontal: 16, borderRadius: 22, color: '#fff', backgroundColor: '#272727' },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: RED },
  sendText: { color: '#fff', fontSize: 23, fontWeight: '700' },
  reportScreen: { flex: 1, backgroundColor: CARD },
  reportScroll: { position: 'absolute', top: 102, bottom: 90, left: 0, right: 0 },
  reportContent: { paddingTop: 24, paddingHorizontal: 16 },
  reportQuestion: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 18 },
  reportRow: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#383838' },
  reportReason: { color: '#fff', fontSize: 16 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#777', alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: RED },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: RED },
  detailsWrap: { marginTop: 18, borderWidth: 1, borderColor: '#474747', borderRadius: 14, backgroundColor: CARD_SECONDARY },
  detailsInput: { minHeight: 108, padding: 14, color: '#fff', textAlignVertical: 'top' },
  counter: { color: SECONDARY, fontSize: 12, textAlign: 'right', paddingRight: 12, paddingBottom: 10 },
  reportFooter: { position: 'absolute', left: 16, right: 16, bottom: 24 },
  reportSentCenter: { position: 'absolute', left: 41, right: 41, top: '44%', transform: [{ translateY: -70 }], alignItems: 'center', gap: 14 },
  successIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2E9B56' },
  successCheck: { color: '#fff', fontSize: 34, fontWeight: '700' },
});
