import type { ActivityCandidate, AppRequest, TastesGroup } from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import lightDialogPattern from '../../../assets/figma-backgrounds/home-feed-pattern.png';
import SearchIcon from '../../../assets/discover/search.svg';
import UserHeartIcon from '../../../assets/messaging/user-heart.svg';
import UserHeartLightIcon from '../../../assets/messaging/user-heart-light.svg';
import dialogPattern from '../../../assets/onboarding/pattern-screen.png';
import { formatDisplayDate } from '../../infrastructure/date';
import { useAuthenticatedUserId, useTastesApi } from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { PatternBackgroundLift, Screen } from '../../ui/components';

export function RequestsScreen({ onBack }: { onBack: () => void }) {
  const api = useTastesApi();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [requests, setRequests] = useState<AppRequest[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    void api
      .listRequests()
      .then((r) => {
        if (active) setRequests(r.data);
      })
      .catch((e) => Alert.alert('Could not load requests', apiErrorMessage(e)))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const respond = async (item: AppRequest, response: 'accepted' | 'declined') => {
    await api.respondToRequest({ requestId: item.id, response });
    setRequests((current) => current.filter((candidate) => candidate.id !== item.id));
  };
  const deleteAll = async () => {
    const pending = [...requests];
    await Promise.all(pending.map((item) => api.respondToRequest({ requestId: item.id, response: 'declined' })));
    setRequests([]);
  };
  return (
    <Screen style={styles.screen}>
      <Header
        action={requests.length ? 'Delete all' : undefined}
        onAction={() => void deleteAll().catch((error) => Alert.alert('Could not delete requests', apiErrorMessage(error)))}
        onBack={onBack}
        styles={styles}
        title="Requests"
      />
      <ImageBackground
        imageStyle={{ opacity: isDark ? 1 : 0.08 }}
        resizeMode="stretch"
        source={isDark ? dialogPattern : lightDialogPattern}
        style={[styles.patternBody, { backgroundColor: colors.canvas }]}
      >
        <PatternBackgroundLift />
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <FlatList
            contentContainerStyle={styles.list}
            data={requests}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Empty
                copy="New message and activity requests will appear here."
                styles={styles}
                title="No requests"
              />
            }
            renderItem={({ item }) => (
              <View style={styles.request}>
                <View style={styles.requestIcon}>
                  <Text style={styles.requestIconText}>{item.kind === 'group' ? 'G' : '◷'}</Text>
                </View>
                <View style={styles.requestCopy}>
                  <Text style={styles.requestName}>{item.title}</Text>
                  <Text style={styles.requestBody}>{item.body}</Text>
                  <Text style={styles.requestType}>
                    {item.senderName} · {item.kind}
                  </Text>
                </View>
                <View style={styles.requestActions}>
                  <Pressable onPress={() => void respond(item, 'accepted')} style={styles.accept}>
                    <Text style={styles.actionText}>Accept</Text>
                  </Pressable>
                  <Pressable onPress={() => void respond(item, 'declined')} style={styles.decline}>
                    <Text style={styles.declineText}>×</Text>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}
      </ImageBackground>
    </Screen>
  );
}

export function NewGroupScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (groupId: string) => void;
}) {
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const api = useTastesApi();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<ActivityCandidate[]>([]);
  const [searchResults, setSearchResults] = useState<ActivityCandidate[]>([]);
  const [selected, setSelected] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .listActivityCandidates()
      .then((result) => {
        if (active) setPeople(result.data);
      })
      .catch((error) => Alert.alert('Could not load friends', apiErrorMessage(error)))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const normalizedQuery = query.trim();
  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    let active = true;
    setSearching(true);
    const timeout = setTimeout(() => {
      void api.searchPeople({ query: normalizedQuery, limit: 50 })
        .then((result) => {
          if (active) setSearchResults(result.data);
        })
        .catch((error) => {
          if (active) Alert.alert('Could not search people', apiErrorMessage(error));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [api, normalizedQuery]);
  const filtered = normalizedQuery.length >= 2
    ? searchResults
    : people.filter(
        (person) =>
          !normalizedQuery ||
          `${person.displayName} ${person.username ?? ''}`.toLowerCase().includes(normalizedQuery.toLowerCase()),
      );
  const create = async () => {
    setCreating(true);
    try {
      const result = await api.createGroup({ name, memberIds: [...selected] });
      onCreated(result.data.id);
    } catch (error) {
      Alert.alert('Could not create group', apiErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };
  return (
    <View style={styles.newGroupScreen}>
      <Header
        onBack={onBack}
        style={styles.newGroupHeader}
        styles={styles}
        title="New group"
      />
      <Text style={styles.fieldLabel}>TITLE</Text>
      <View style={styles.groupHero}>
        <TextInput
          maxLength={60}
          onChangeText={setName}
          placeholder="Enter text"
          placeholderTextColor={colors.placeholder}
          style={styles.groupName}
          value={name}
        />
      </View>
      <View style={styles.searchRow}>
        <View style={[styles.search, styles.newGroupSearch]}>
          <SearchIcon color={colors.textSecondary} height={24} style={styles.searchIcon} width={24} />
          <TextInput
            onChangeText={setQuery}
            placeholder="Search people"
            placeholderTextColor={colors.placeholder}
            style={styles.searchInput}
            value={query}
          />
        </View>
        <Pressable
          accessibilityLabel="Show contacts"
          accessibilityRole="button"
          onPress={() => setQuery('')}
          style={styles.contactsButton}
        >
          {isDark ? <UserHeartIcon height={21.5} width={21.5} /> : <UserHeartLightIcon height={21.5} width={21.5} />}
        </Pressable>
      </View>
      {loading || searching ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : (
        <FlatList
          style={styles.peopleList}
          data={filtered}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => {
            const active = selected.has(item.userId);
            return (
              <Pressable
                onPress={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (active) next.delete(item.userId);
                    else next.add(item.userId);
                    return next;
                  })
                }
                style={styles.person}
              >
                <Avatar name={item.displayName} photoUrl={item.photoUrl} styles={styles} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{item.displayName}</Text>
                  <Text style={styles.personHandle}>
                    {item.username ? `@${item.username}` : 'Mutual follower'}
                  </Text>
                </View>
                <View style={styles.check}>
                  <View style={[styles.checkCircle, active && styles.checkActive]}>
                    <Text style={styles.checkText}>{active ? '✓' : ''}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <View style={[styles.createFooter, { paddingBottom: Math.max(16, insets.bottom) }]}>
        <Pressable
          disabled={creating || name.trim().length < 2 || selected.size < 1}
          onPress={() => void create()}
          style={[styles.createGroup, (creating || name.trim().length < 2 || selected.size < 1) && styles.disabled]}
        >
          {creating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.createGroupText}>Create group</Text>}
        </Pressable>
      </View>
    </View>
  );
}

export function GroupDetailsScreen({ groupId, onBack, onOpenConversation }: { groupId: string; onBack: () => void; onOpenConversation: (conversationId: string) => void }) {
  const api = useTastesApi();
  const currentUserId = useAuthenticatedUserId();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, insets.top), [colors, insets.top]);
  const [group, setGroup] = useState<TastesGroup | null>(null);
  const [candidates, setCandidates] = useState<ActivityCandidate[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ActivityCandidate[]>([]);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const load = async () => {
    const [g, people] = await Promise.all([
      api.getGroup({ groupId }),
      api.listActivityCandidates(),
    ]);
    setGroup(g.data);
    setCandidates(people.data);
  };
  useEffect(() => {
    void load().catch((e) => Alert.alert('Could not load group', apiErrorMessage(e)));
  }, [api, groupId]);
  const normalizedMemberQuery = memberQuery.trim();
  useEffect(() => {
    if (!adding || normalizedMemberQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return undefined;
    }
    let active = true;
    setSearching(true);
    const timeout = setTimeout(() => {
      void api.searchPeople({ query: normalizedMemberQuery, limit: 50 })
        .then((result) => {
          if (active) setSearchResults(result.data);
        })
        .catch((error) => {
          if (active) Alert.alert('Could not search people', apiErrorMessage(error));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [adding, api, normalizedMemberQuery]);
  if (!group)
    return (
      <Screen style={styles.screen}>
        <Header onBack={onBack} styles={styles} title="Group details" />
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  const admin = currentUserId === group.adminId;
  const update = async (ids: string[], userId: string) => {
    setUpdatingUserId(userId);
    try {
      await api.updateGroupMembers({ groupId, memberIds: ids });
      await load();
    } catch (error) {
      Alert.alert('Could not update group', apiErrorMessage(error));
    } finally {
      setUpdatingUserId(null);
    }
  };
  const pendingMembers = group.pendingMembers ?? [];
  const available = (normalizedMemberQuery.length >= 2 ? searchResults : candidates).filter(
    (candidate) =>
      !group.members.some((member) => member.userId === candidate.userId)
      && !pendingMembers.some((member) => member.userId === candidate.userId),
  );
  return (
    <Screen style={styles.screen}>
      <Header onBack={onBack} styles={styles} title="Group details" />
      <ScrollView contentContainerStyle={styles.details}>
        <View style={styles.groupAvatarLarge}>
          <Text style={styles.groupAvatarLargeText}>
            {group.name
              .split(' ')
              .map((v) => v[0])
              .join('')
              .slice(0, 2)}
          </Text>
        </View>
        <Text style={styles.detailsTitle}>{group.name}</Text>
        <Text style={styles.detailsSubtitle}>
          {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
          {pendingMembers.length > 0
            ? ` · ${pendingMembers.length} invited`
            : ''}
          {' · '}Created {formatDisplayDate(group.createdAt)}
        </Text>
        <Pressable onPress={() => onOpenConversation(groupId)} style={styles.primaryOutline}>
          <Text style={styles.primaryOutlineText}>Open group chat</Text>
        </Pressable>
        {admin ? (
          <Pressable onPress={() => {
            setAdding((value) => !value);
            setMemberQuery('');
          }} style={styles.primaryOutline}>
            <Text style={styles.primaryOutlineText}>{adding ? 'Done' : '+ Add members'}</Text>
          </Pressable>
        ) : null}
        {adding ? (
          <View style={[styles.search, styles.detailsSearch]}>
            <Text style={styles.searchGlyph}>⌕</Text>
            <TextInput
              autoCorrect={false}
              onChangeText={setMemberQuery}
              placeholder="Search people"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              value={memberQuery}
            />
          </View>
        ) : null}
        {adding && searching ? <ActivityIndicator color={colors.primary} style={styles.searchLoader} /> : null}
        {adding
          ? available.map((person) => (
              <View key={person.userId} style={styles.person}>
                <Avatar name={person.displayName} photoUrl={person.photoUrl} styles={styles} />
                <Text style={[styles.personName, { flex: 1 }]}>
                  {person.displayName}
                </Text>
                <Pressable
                  accessibilityLabel={`Add ${person.displayName}`}
                  accessibilityRole="button"
                  disabled={updatingUserId !== null}
                  hitSlop={8}
                  onPress={() =>
                    void update(
                      [...group.members.map((member) => member.userId), person.userId],
                      person.userId,
                    )
                  }
                  style={styles.addMember}
                >
                  {updatingUserId === person.userId
                    ? <ActivityIndicator color={colors.primary} />
                    : <Text style={styles.addMemberText}>Add</Text>}
                </Pressable>
              </View>
            ))
          : null}
        {pendingMembers.length > 0 ? (
          <>
            <Text style={styles.section}>INVITED ({pendingMembers.length})</Text>
            {pendingMembers.map((member) => (
              <View key={member.userId} style={styles.person}>
                <Avatar name={member.displayName} photoUrl={member.photoUrl} styles={styles} />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{member.displayName}</Text>
                  <Text style={styles.personHandle}>Invitation pending</Text>
                </View>
              </View>
            ))}
          </>
        ) : null}
        <Text style={styles.section}>MEMBERS ({group.members.length})</Text>
        {group.members.map((member) => (
          <View key={member.userId} style={styles.person}>
            <Avatar name={member.displayName} photoUrl={member.photoUrl} styles={styles} />
            <View style={styles.personCopy}>
              <Text style={styles.personName}>{member.displayName}</Text>
              <Text style={styles.personHandle}>
                {member.username ? `@${member.username}` : ''}
              </Text>
            </View>
            {member.admin ? (
              <View style={styles.admin}>
                <Text style={styles.adminText}>Admin</Text>
              </View>
            ) : admin ? (
              <Pressable
                accessibilityLabel={`Remove ${member.displayName}`}
                onPress={() =>
                  void update(
                    group.members
                      .filter((candidate) => candidate.userId !== member.userId)
                      .map((candidate) => candidate.userId),
                    member.userId,
                  )
                }
                style={styles.remove}
              >
                <Text style={styles.removeText}>⌫</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Pressable
          onPress={() =>
            Alert.alert(admin ? 'Delete group?' : 'Leave group?', undefined, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: admin ? 'Delete' : 'Leave',
                style: 'destructive',
                onPress: () => void api.leaveGroup({ groupId }).then(onBack),
              },
            ])
          }
          style={styles.danger}
        >
          <Text style={styles.dangerText}>{admin ? 'Delete group' : 'Leave group'}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Header({
  action,
  actionDisabled,
  onAction,
  onBack,
  style,
  styles,
  title,
}: {
  action?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  onBack: () => void;
  style?: StyleProp<ViewStyle>;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View style={[styles.header, style]}>
      <Pressable onPress={onBack} style={styles.headerButton}>
        <Text style={styles.back}>‹</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <Pressable disabled={actionDisabled} onPress={onAction} style={styles.headerButton}>
        <Text style={[styles.headerAction, actionDisabled && styles.disabled]}>{action}</Text>
      </Pressable>
    </View>
  );
}
function Avatar({
  name,
  photoUrl,
  styles,
}: {
  name: string;
  photoUrl?: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  return photoUrl ? (
    <Image source={{ uri: photoUrl }} style={styles.avatar} />
  ) : (
    <View style={styles.avatarFallback}>
      <Text style={styles.avatarText}>
        {name
          .split(' ')
          .map((part) => part[0])
          .join('')
          .slice(0, 2)}
      </Text>
    </View>
  );
}
function Empty({
  copy,
  styles,
  title,
}: {
  copy: string;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyGlyph}>···</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyCopy}>{copy}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, safeTop: number) {
  return StyleSheet.create({
    screen: { flex: 1 },
    newGroupScreen: { flex: 1, backgroundColor: colors.canvas },
    newGroupHeader: { backgroundColor: colors.surface },
    patternBody: { flex: 1 },
    header: {
      height: safeTop + 62,
      paddingTop: safeTop,
      paddingHorizontal: 6,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    headerButton: {
      width: 68,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    back: {
      color: colors.text,
      fontSize: 38,
      lineHeight: 40,
      fontWeight: '300',
    },
    headerTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 17,
      fontWeight: '700',
      textAlign: 'center',
    },
    headerAction: { color: colors.primary, fontSize: 14, fontWeight: '600' },
    disabled: { opacity: 0.35 },
    list: { paddingBottom: 30 },
    request: {
      minHeight: 110,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    requestIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    requestIconText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
    requestCopy: { flex: 1, marginLeft: 12 },
    requestName: { color: colors.text, fontSize: 15, fontWeight: '700' },
    requestBody: {
      marginTop: 4,
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    requestType: { marginTop: 5, color: colors.primary, fontSize: 11 },
    requestActions: { marginLeft: 8, alignItems: 'center', gap: 7 },
    accept: {
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: colors.primary,
    },
    actionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
    decline: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    declineText: { color: colors.textMuted, fontSize: 18 },
    empty: {
      minHeight: 500,
      padding: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyGlyph: { color: colors.primary, fontSize: 38, fontWeight: '900' },
    emptyTitle: {
      marginTop: 14,
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
    },
    emptyCopy: {
      marginTop: 8,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    fieldLabel: { marginTop: 18, marginHorizontal: 16, marginBottom: 7, color: colors.textMuted, fontSize: 12 },
    groupHero: { paddingHorizontal: 16, paddingBottom: 16 },
    groupName: {
      width: '100%',
      height: 46,
      paddingHorizontal: 14,
      borderRadius: 12,
      color: colors.text,
      backgroundColor: colors.surface,
      fontSize: 16,
    },
    searchRow: {
      marginTop: 10,
      marginHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    search: {
      flex: 1,
      height: 39,
      paddingHorizontal: 11,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 22,
      backgroundColor: colors.surfaceRaised,
    },
    newGroupSearch: { backgroundColor: colors.surface },
    searchIcon: { marginRight: 8 },
    searchGlyph: { marginRight: 8, color: colors.textSecondary, fontSize: 21 },
    searchInput: { flex: 1, color: colors.text, fontSize: 16 },
    detailsSearch: { marginHorizontal: 16, marginBottom: 4 },
    searchLoader: { marginVertical: 16 },
    contactsButton: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    section: {
      marginHorizontal: 16,
      marginTop: 18,
      marginBottom: 6,
      color: colors.textMuted,
      fontSize: 12,
    },
    loader: { marginTop: 40 },
    peopleList: { flex: 1 },
    person: {
      height: 76,
      paddingHorizontal: 16,
      flexDirection: 'row',
      gap: 7,
      alignItems: 'center',
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
      backgroundColor: colors.canvas,
    },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    avatarFallback: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    avatarText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
    personCopy: { flex: 1 },
    personName: { color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.41 },
    personHandle: { color: colors.textSecondary, fontSize: 13, letterSpacing: -0.24 },
    check: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkCircle: {
      width: 22,
      height: 22,
      borderWidth: 1.5,
      borderColor: colors.background === '#080808' ? colors.border : '#C7C7CC',
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkActive: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    checkText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '600' },
    createFooter: { paddingTop: 12, paddingHorizontal: 31, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline, backgroundColor: colors.surface },
    createGroup: { height: 58, borderRadius: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    createGroupText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    details: { paddingBottom: 40 },
    groupAvatarLarge: {
      width: 118,
      height: 118,
      marginTop: 28,
      alignSelf: 'center',
      borderRadius: 59,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    groupAvatarLargeText: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' },
    detailsTitle: {
      marginTop: 14,
      color: colors.text,
      fontSize: 22,
      fontWeight: '800',
      textAlign: 'center',
    },
    detailsSubtitle: {
      marginTop: 6,
      color: colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
    },
    primaryOutline: {
      height: 44,
      margin: 18,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryOutlineText: { color: colors.text, fontSize: 14, fontWeight: '600' },
    addMember: {
      minWidth: 48,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addMemberText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
    admin: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    adminText: { color: '#FFFFFF', fontSize: 11 },
    remove: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: { color: colors.danger, fontSize: 20 },
    danger: {
      height: 48,
      margin: 20,
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dangerText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  });
}
