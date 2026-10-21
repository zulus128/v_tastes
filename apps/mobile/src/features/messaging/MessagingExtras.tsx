import type {
  ActivityCandidate,
  AppRequest,
  TastesGroup,
} from '@tastes/contracts';
import { apiErrorMessage } from '@tastes/firebase-client';
import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
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
import GroupBackIcon from '../../../assets/leaderboard/back.svg';
import GroupEditIcon from '../../../assets/create-review/pen.svg';
import GroupInviteIcon from '../../../assets/messaging/group-invite.svg';
import GroupTrashIcon from '../../../assets/messaging/group-trash.svg';
import UserHeartIcon from '../../../assets/messaging/user-heart.svg';
import UserHeartLightIcon from '../../../assets/messaging/user-heart-light.svg';
import dialogPattern from '../../../assets/onboarding/pattern-screen.png';
import {
  useAuthenticatedUserId,
  useTastesApi,
} from '../../session/SessionProvider';
import { type ThemeColors, useAppTheme } from '../../ui/ThemeProvider';
import { ResponsiveModal as Modal } from '../../ui/ResponsiveModal';
import { responsiveSize, responsiveStyleSheet } from '../../ui/responsive';
import { useBottomSheetMotion } from '../../ui/useBottomSheetMotion';
import { PatternBackgroundLift, Screen } from '../../ui/components';
import { requestsQueryKey } from '../queryKeys';

export function RequestsScreen({ onBack }: { onBack: () => void }) {
  const api = useTastesApi();
  const userId = useAuthenticatedUserId();
  const queryClient = useQueryClient();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const cachedRequests = queryClient.getQueryData<AppRequest[]>(
    requestsQueryKey(userId),
  );
  const [requests, setRequests] = useState<AppRequest[]>(
    () => cachedRequests ?? [],
  );
  const [loading, setLoading] = useState(() => !cachedRequests);
  useEffect(() => {
    let active = true;
    void api
      .listRequests()
      .then((r) => {
        if (active) {
          setRequests(r.data);
          queryClient.setQueryData(requestsQueryKey(userId), r.data);
        }
      })
      .catch((e) => Alert.alert('Could not load requests', apiErrorMessage(e)))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, queryClient, userId]);
  const respond = async (
    item: AppRequest,
    response: 'accepted' | 'declined',
  ) => {
    await api.respondToRequest({ requestId: item.id, response });
    setRequests((current) =>
      current.filter((candidate) => candidate.id !== item.id),
    );
    queryClient.setQueryData<AppRequest[]>(
      requestsQueryKey(userId),
      (current) => current?.filter((candidate) => candidate.id !== item.id),
    );
  };
  const deleteAll = async () => {
    const pending = [...requests];
    await Promise.all(
      pending.map((item) =>
        api.respondToRequest({ requestId: item.id, response: 'declined' }),
      ),
    );
    setRequests([]);
    queryClient.setQueryData(requestsQueryKey(userId), []);
  };
  return (
    <Screen style={styles.screen}>
      <Header
        action={requests.length ? 'Delete all' : undefined}
        onAction={() =>
          void deleteAll().catch((error) =>
            Alert.alert('Could not delete requests', apiErrorMessage(error)),
          )
        }
        onBack={onBack}
        safeTop={insets.top}
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
                  <Text style={styles.requestIconText}>
                    {item.kind === 'group' ? 'G' : '◷'}
                  </Text>
                </View>
                <View style={styles.requestCopy}>
                  <Text style={styles.requestName}>{item.title}</Text>
                  <Text style={styles.requestBody}>{item.body}</Text>
                  <Text style={styles.requestType}>
                    {item.senderName} · {item.kind}
                  </Text>
                </View>
                <View style={styles.requestActions}>
                  <Pressable
                    onPress={() => void respond(item, 'accepted')}
                    style={styles.accept}
                  >
                    <Text style={styles.actionText}>Accept</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void respond(item, 'declined')}
                    style={styles.decline}
                  >
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
  const styles = useMemo(() => createStyles(colors), [colors]);
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
      .catch((error) =>
        Alert.alert('Could not load friends', apiErrorMessage(error)),
      )
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
      void api
        .searchPeople({ query: normalizedQuery, limit: 50 })
        .then((result) => {
          if (active) setSearchResults(result.data);
        })
        .catch((error) => {
          if (active)
            Alert.alert('Could not search people', apiErrorMessage(error));
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
  const filtered =
    normalizedQuery.length >= 2
      ? searchResults.filter((result) =>
          people.some((candidate) => candidate.userId === result.userId),
        )
      : people.filter(
          (person) =>
            !normalizedQuery ||
            `${person.displayName} ${person.username ?? ''}`
              .toLowerCase()
              .includes(normalizedQuery.toLowerCase()),
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
        safeTop={insets.top}
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
          <SearchIcon
            color={colors.textSecondary}
            height={responsiveSize(24)}
            style={styles.searchIcon}
            width={responsiveSize(24)}
          />
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
          {isDark ? (
            <UserHeartIcon
              height={responsiveSize(21.5)}
              width={responsiveSize(21.5)}
            />
          ) : (
            <UserHeartLightIcon
              height={responsiveSize(21.5)}
              width={responsiveSize(21.5)}
            />
          )}
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
                <Avatar
                  name={item.displayName}
                  photoUrl={item.photoUrl}
                  styles={styles}
                />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{item.displayName}</Text>
                  <Text style={styles.personHandle}>
                    {item.username ? `@${item.username}` : 'Mutual follower'}
                  </Text>
                </View>
                <View style={styles.check}>
                  <View
                    style={[styles.checkCircle, active && styles.checkActive]}
                  >
                    <Text style={styles.checkText}>{active ? '✓' : ''}</Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      )}
      <View
        style={[
          styles.createFooter,
          { paddingBottom: Math.max(responsiveSize(16), insets.bottom) },
        ]}
      >
        <Pressable
          disabled={creating || name.trim().length < 2 || selected.size < 1}
          onPress={() => void create()}
          style={[
            styles.createGroup,
            (creating || name.trim().length < 2 || selected.size < 1) &&
              styles.disabled,
          ]}
        >
          {creating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.createGroupText}>Create group</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function GroupDetailsScreen({
  groupId,
  onBack,
  onOpenConversation,
}: {
  groupId: string;
  onBack: () => void;
  onOpenConversation: (conversationId: string) => void;
}) {
  const api = useTastesApi();
  const currentUserId = useAuthenticatedUserId();
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [group, setGroup] = useState<TastesGroup | null>(null);
  const [candidates, setCandidates] = useState<ActivityCandidate[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ActivityCandidate[]>([]);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<
    | null
    | { type: 'delete' | 'leave' }
    | { type: 'remove'; userId: string; name: string }
  >(null);
  const confirmationSheet = useBottomSheetMotion({
    onClose: () => setConfirmAction(null),
    visible: confirmAction !== null,
  });
  const load = async () => {
    const [g, people] = await Promise.all([
      api.getGroup({ groupId }),
      api.listActivityCandidates(),
    ]);
    setGroup(g.data);
    setCandidates(people.data);
  };
  useEffect(() => {
    void load().catch((e) =>
      Alert.alert('Could not load group', apiErrorMessage(e)),
    );
  }, [api, groupId]);
  useEffect(() => {
    let active = true;
    void api
      .getMessages({ conversationId: groupId, cursor: null, limit: 50 })
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
      void api
        .searchPeople({ query: normalizedMemberQuery, limit: 50 })
        .then((result) => {
          if (active) setSearchResults(result.data);
        })
        .catch((error) => {
          if (active)
            Alert.alert('Could not search people', apiErrorMessage(error));
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
      <View style={styles.groupDetailsScreen}>
        <GroupDetailsHeader
          onBack={onBack}
          safeTop={insets.top}
          styles={styles}
          title="Group details"
        />
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </View>
    );
  const admin = currentUserId === group.adminId;
  const saveName = async () => {
    const name = nameDraft.trim();
    if (name.length < 2) return;
    try {
      await api.updateGroup({ groupId, name });
      setGroup((current) => (current ? { ...current, name } : current));
      setEditingName(false);
    } catch (error) {
      Alert.alert('Could not update group', apiErrorMessage(error));
    }
  };
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
  const available = (
    normalizedMemberQuery.length >= 2
      ? searchResults.filter((result) =>
          candidates.some((candidate) => candidate.userId === result.userId),
        )
      : candidates
  ).filter(
    (candidate) =>
      !group.members.some((member) => member.userId === candidate.userId) &&
      !pendingMembers.some((member) => member.userId === candidate.userId),
  );
  const detailRows = [
    ...pendingMembers.map((person) => ({ kind: 'pending' as const, person })),
    ...group.members.map((person) => ({ kind: 'member' as const, person })),
  ];
  const firstPendingIndex = 0;
  const firstMemberIndex = pendingMembers.length;
  const closeInviteMembers = () => {
    setAdding(false);
    setMemberQuery('');
  };
  const runConfirmedAction = async (
    action: Exclude<typeof confirmAction, null>,
  ) => {
    if (!action) return;
    if (action.type === 'remove') {
      await update(
        group.members
          .filter((member) => member.userId !== action.userId)
          .map((member) => member.userId),
        action.userId,
      );
      return;
    }
    await api.leaveGroup({ groupId });
    onBack();
  };
  return (
    <View style={styles.groupDetailsScreen}>
      <GroupDetailsHeader
        admin={admin}
        editingName={editingName}
        nameDraft={nameDraft}
        onChangeName={setNameDraft}
        onDelete={() => setConfirmAction({ type: admin ? 'delete' : 'leave' })}
        onEdit={() => {
          if (editingName) void saveName();
          else {
            setNameDraft(group.name);
            setEditingName(true);
          }
        }}
        onBack={onBack}
        safeTop={insets.top}
        styles={styles}
        title={group.name}
      />
      <FlatList
        contentContainerStyle={styles.details}
        data={detailRows}
        initialNumToRender={8}
        keyExtractor={(item) => `${item.kind}-${item.person.userId}`}
        ListHeaderComponent={
          <>
            <Text style={styles.detailSectionTitle}>MEDIA</Text>
            {mediaUrls.length ? (
              <View style={styles.groupMediaGrid}>
                {mediaUrls.slice(0, 6).map((url, index) => {
                  const overflow = index === 5 && mediaUrls.length > 6;
                  return (
                    <Pressable
                      accessibilityLabel={
                        overflow
                          ? `Open ${mediaUrls.length - 5} more group photos`
                          : 'Open group photo in chat'
                      }
                      accessibilityRole="button"
                      key={`${url}-${index}`}
                      onPress={() => onOpenConversation(groupId)}
                      style={styles.groupMediaPhoto}
                    >
                      <Image
                        source={{ uri: url }}
                        style={StyleSheet.absoluteFill}
                      />
                      {overflow ? (
                        <View style={styles.groupMediaOverflow}>
                          <Text style={styles.groupMediaOverflowText}>
                            +{mediaUrls.length - 5}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <Pressable
                onPress={() => onOpenConversation(groupId)}
                style={styles.groupMediaEmpty}
              >
                <Text style={styles.groupMediaEmptyTitle}>
                  No shared photos yet
                </Text>
                <Text style={styles.groupMediaEmptyCopy}>
                  Share the first photo in the group chat.
                </Text>
              </Pressable>
            )}
          </>
        }
        ListFooterComponent={
          !admin ? (
            <Pressable
              onPress={() => setConfirmAction({ type: 'leave' })}
              style={styles.danger}
            >
              <Text style={styles.dangerText}>Leave group</Text>
            </Pressable>
          ) : null
        }
        maxToRenderPerBatch={8}
        renderItem={({ item, index }) => {
          const { person } = item;
          return (
            <>
              {item.kind === 'pending' && index === firstPendingIndex ? (
                <Text style={styles.section}>
                  INVITED ({pendingMembers.length})
                </Text>
              ) : null}
              {item.kind === 'member' && index === firstMemberIndex ? (
                <Text style={styles.section}>
                  MEMBERS ({group.members.length})
                </Text>
              ) : null}
              <View style={styles.person}>
                <Avatar
                  name={person.displayName}
                  photoUrl={person.photoUrl}
                  styles={styles}
                />
                <View style={styles.personCopy}>
                  <Text style={styles.personName}>{person.displayName}</Text>
                  <Text style={styles.personHandle}>
                    {item.kind === 'pending'
                      ? 'Invitation pending'
                      : person.username
                        ? `@${person.username}`
                        : ''}
                  </Text>
                </View>
                {item.kind === 'member' && 'admin' in person && person.admin ? (
                  <View style={styles.admin}>
                    <Text style={styles.adminText}>Admin</Text>
                  </View>
                ) : item.kind === 'member' && admin ? (
                  <Pressable
                    accessibilityLabel={`Remove ${person.displayName}`}
                    accessibilityRole="button"
                    disabled={updatingUserId !== null}
                    onPress={() =>
                      setConfirmAction({
                        type: 'remove',
                        userId: person.userId,
                        name: person.displayName,
                      })
                    }
                    style={styles.remove}
                  >
                    {updatingUserId === person.userId ? (
                      <ActivityIndicator color={colors.text} />
                    ) : (
                      <GroupTrashIcon
                        color={colors.text}
                        height={responsiveSize(20)}
                        width={responsiveSize(19)}
                      />
                    )}
                  </Pressable>
                ) : null}
              </View>
            </>
          );
        }}
        windowSize={5}
      />
      {admin ? (
        <LinearGradient
          colors={['transparent', colors.canvas, colors.canvas]}
          locations={[0, 0.28, 1]}
          style={[
            styles.groupDetailsFooter,
            { paddingBottom: Math.max(responsiveSize(24), insets.bottom) },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => setAdding(true)}
            style={styles.inviteMembersButton}
          >
            <GroupInviteIcon
              color="#FFFFFF"
              height={responsiveSize(24)}
              width={responsiveSize(24)}
            />
            <Text style={styles.inviteMembersText}>Invite members</Text>
          </Pressable>
        </LinearGradient>
      ) : null}
      <Modal onRequestClose={closeInviteMembers} visible={adding}>
        <View style={styles.inviteScreen}>
          <GroupDetailsHeader
            onBack={closeInviteMembers}
            safeTop={insets.top}
            styles={styles}
            title="Invite members"
          />
          <View style={[styles.search, styles.inviteSearch]}>
            <SearchIcon
              color={colors.textSecondary}
              height={responsiveSize(24)}
              style={styles.searchIcon}
              width={responsiveSize(24)}
            />
            <TextInput
              autoCorrect={false}
              onChangeText={setMemberQuery}
              placeholder="Search people"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              value={memberQuery}
            />
          </View>
          {searching ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={available}
              keyExtractor={(person) => person.userId}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: person }) => (
                <View style={styles.person}>
                  <Avatar
                    name={person.displayName}
                    photoUrl={person.photoUrl}
                    styles={styles}
                  />
                  <View style={styles.personCopy}>
                    <Text style={styles.personName}>{person.displayName}</Text>
                    <Text style={styles.personHandle}>
                      {person.username ? `@${person.username}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Invite ${person.displayName}`}
                    accessibilityRole="button"
                    disabled={updatingUserId !== null}
                    onPress={() =>
                      void update(
                        [
                          ...group.members.map((member) => member.userId),
                          person.userId,
                        ],
                        person.userId,
                      )
                    }
                    style={styles.addMember}
                  >
                    {updatingUserId === person.userId ? (
                      <ActivityIndicator color={colors.primary} />
                    ) : (
                      <Text style={styles.addMemberText}>Invite</Text>
                    )}
                  </Pressable>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
      <Modal
        animationType="none"
        onRequestClose={confirmationSheet.close}
        transparent
        visible={confirmAction !== null}
      >
        <View style={styles.confirmationBackdrop}>
          <Pressable
            accessibilityLabel="Close confirmation"
            onPress={confirmationSheet.close}
            style={StyleSheet.absoluteFill}
          />
          <Animated.View
            style={[
              styles.confirmationSheet,
              { transform: [{ translateY: confirmationSheet.translateY }] },
            ]}
          >
            <View
              style={styles.confirmationDragArea}
              {...confirmationSheet.panHandlers}
            >
              <View style={styles.confirmationHandle} />
            </View>
            <Text style={styles.confirmationTitle}>
              {confirmAction?.type === 'remove'
                ? 'Remove this member?'
                : confirmAction?.type === 'leave'
                  ? 'Leave this group?'
                  : 'Delete this group?'}
            </Text>
            <Text style={styles.confirmationBody}>
              {confirmAction?.type === 'remove'
                ? 'Are you sure you want to remove this member?'
                : confirmAction?.type === 'leave'
                  ? 'Are you sure you want to leave this group?'
                  : 'Are you sure you want to delete this group?'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={confirmationSheet.close}
              style={styles.confirmationPrimary}
            >
              <Text style={styles.confirmationPrimaryText}>
                {confirmAction?.type === 'remove'
                  ? 'Keep member'
                  : confirmAction?.type === 'leave'
                    ? 'Stay in group'
                    : 'Keep group'}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                const action = confirmAction;
                if (!action) return;
                confirmationSheet.closeThen(() => {
                  void runConfirmedAction(action).catch((error) =>
                    Alert.alert(
                      'Could not update group',
                      apiErrorMessage(error),
                    ),
                  );
                });
              }}
              style={styles.confirmationDanger}
            >
              <Text style={styles.confirmationDangerText}>
                {confirmAction?.type === 'remove'
                  ? 'Remove'
                  : confirmAction?.type === 'leave'
                    ? 'Leave'
                    : 'Delete'}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

function GroupDetailsHeader({
  admin = false,
  editingName = false,
  nameDraft = '',
  onBack,
  onChangeName,
  onDelete,
  onEdit,
  safeTop,
  styles,
  title,
}: {
  admin?: boolean;
  editingName?: boolean;
  nameDraft?: string;
  onBack: () => void;
  onChangeName?: (value: string) => void;
  onDelete?: () => void;
  onEdit?: () => void;
  safeTop: number;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.groupDetailsHeader,
        { height: responsiveSize(48) + safeTop, paddingTop: safeTop },
      ]}
    >
      <Pressable
        accessibilityLabel="Back"
        accessibilityRole="button"
        onPress={onBack}
        style={styles.groupHeaderIconButton}
      >
        <GroupBackIcon
          color={colors.text}
          height={responsiveSize(16)}
          width={responsiveSize(9)}
        />
      </Pressable>
      {editingName ? (
        <TextInput
          autoFocus
          maxLength={60}
          onChangeText={onChangeName}
          selectTextOnFocus
          style={styles.groupHeaderNameInput}
          value={nameDraft}
        />
      ) : (
        <Text numberOfLines={1} style={styles.groupHeaderTitle}>
          {title}
        </Text>
      )}
      <View style={styles.groupHeaderActions}>
        {admin ? (
          <Pressable
            accessibilityLabel={editingName ? 'Save group name' : 'Edit group'}
            accessibilityRole="button"
            disabled={editingName && nameDraft.trim().length < 2}
            onPress={onEdit}
            style={styles.groupHeaderIconButton}
          >
            <GroupEditIcon
              color={colors.text}
              height={responsiveSize(20)}
              width={responsiveSize(20)}
            />
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable
            accessibilityLabel={admin ? 'Delete group' : 'Leave group'}
            accessibilityRole="button"
            onPress={onDelete}
            style={styles.groupHeaderIconButton}
          >
            <GroupTrashIcon
              color={colors.danger}
              height={responsiveSize(20)}
              width={responsiveSize(19)}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Header({
  action,
  actionDisabled,
  onAction,
  onBack,
  safeTop,
  style,
  styles,
  title,
}: {
  action?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
  onBack: () => void;
  safeTop: number;
  style?: StyleProp<ViewStyle>;
  styles: ReturnType<typeof createStyles>;
  title: string;
}) {
  return (
    <View
      style={[
        styles.header,
        { height: responsiveSize(62) + safeTop, paddingTop: safeTop },
        style,
      ]}
    >
      <Pressable onPress={onBack} style={styles.headerButton}>
        <Text style={styles.back}>‹</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <Pressable
        disabled={actionDisabled}
        onPress={onAction}
        style={styles.headerButton}
      >
        <Text style={[styles.headerAction, actionDisabled && styles.disabled]}>
          {action}
        </Text>
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

function createStyles(colors: ThemeColors) {
  return responsiveStyleSheet({
    screen: { flex: 1 },
    groupDetailsScreen: { flex: 1, backgroundColor: colors.canvas },
    inviteScreen: { flex: 1, backgroundColor: colors.canvas },
    newGroupScreen: { flex: 1, backgroundColor: colors.canvas },
    newGroupHeader: { backgroundColor: colors.surface },
    patternBody: { flex: 1 },
    header: {
      height: 62,
      paddingTop: 0,
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
    fieldLabel: {
      marginTop: 18,
      marginHorizontal: 16,
      marginBottom: 7,
      color: colors.textMuted,
      fontSize: 12,
    },
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
    personName: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.41,
    },
    personHandle: {
      color: colors.textSecondary,
      fontSize: 13,
      letterSpacing: -0.24,
    },
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
    createFooter: {
      paddingTop: 12,
      paddingHorizontal: 31,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.hairline,
      backgroundColor: colors.surface,
    },
    createGroup: {
      height: 58,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    createGroupText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
    groupDetailsHeader: {
      paddingHorizontal: 6,
      flexDirection: 'row',
      alignItems: 'center',
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    groupHeaderIconButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupHeaderTitle: {
      flex: 1,
      color: colors.text,
      fontSize: 17,
      fontWeight: '500',
    },
    groupHeaderNameInput: {
      flex: 1,
      height: 36,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 10,
      color: colors.text,
      backgroundColor: colors.surfaceRaised,
      fontSize: 16,
    },
    groupHeaderActions: {
      minWidth: 88,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    details: { paddingBottom: 112 },
    detailSectionTitle: {
      marginTop: 20,
      marginHorizontal: 16,
      marginBottom: 8,
      color: colors.textMuted,
      fontSize: 12,
    },
    groupMediaGrid: {
      marginHorizontal: 16,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 5,
    },
    groupMediaPhoto: {
      width: '32.4%',
      aspectRatio: 1,
      borderRadius: 10,
      backgroundColor: colors.skeleton,
      overflow: 'hidden',
    },
    groupMediaOverflow: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(8,8,8,0.74)',
    },
    groupMediaOverflowText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '500',
    },
    groupMediaEmpty: {
      height: 120,
      marginHorizontal: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: colors.border,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupMediaEmptyTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    groupMediaEmptyCopy: {
      marginTop: 5,
      color: colors.textMuted,
      fontSize: 12,
    },
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
    detailsNameInput: {
      height: 46,
      marginTop: 14,
      marginHorizontal: 32,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 12,
      color: colors.text,
      backgroundColor: colors.surface,
      fontSize: 18,
      fontWeight: '700',
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
    groupDetailsFooter: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      left: 0,
      paddingTop: 34,
      paddingHorizontal: 36,
    },
    inviteMembersButton: {
      height: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 27,
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.45,
      shadowRadius: 14,
      elevation: 7,
    },
    inviteMembersText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '500',
      letterSpacing: 1.2,
    },
    inviteSearch: {
      marginTop: 16,
      marginHorizontal: 16,
      marginBottom: 8,
      flex: 0,
    },
    confirmationBackdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    confirmationSheet: {
      minHeight: 236,
      paddingTop: 38,
      paddingHorizontal: 16,
      paddingBottom: 24,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      alignItems: 'center',
      backgroundColor: colors.surfaceRaised,
    },
    confirmationDragArea: {
      position: 'absolute',
      top: 0,
      right: 0,
      left: 0,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmationHandle: {
      position: 'absolute',
      top: 10,
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textMuted,
    },
    confirmationTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '600',
      textAlign: 'center',
    },
    confirmationBody: {
      marginTop: 9,
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 18,
      textAlign: 'center',
    },
    confirmationPrimary: {
      width: '100%',
      height: 50,
      marginTop: 26,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    confirmationPrimaryText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '500',
    },
    confirmationDanger: {
      width: '100%',
      minHeight: 22,
      marginTop: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmationDangerText: {
      color: colors.danger,
      fontSize: 16,
      fontWeight: '500',
    },
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
