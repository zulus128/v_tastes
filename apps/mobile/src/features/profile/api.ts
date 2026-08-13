import type { FeedItem } from '@tastes/contracts';
import {
  collection,
  doc,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { firestore } from '../../infrastructure/firebase';

export type ProfileData = {
  bio: string;
  city: string | null;
  displayName: string;
  favoriteCuisines: string[];
  favoriteDish: string | null;
  favoriteVenueId: string | null;
  followerCount: number;
  followingCount: number;
  photoUrl: string | null;
  photoPath: string | null;
  reviewCount: number;
  username: string | null;
  xp: number;
};

function profileFromDocument(data: DocumentData | undefined, fallbackName: string): ProfileData {
  const cuisines = Array.isArray(data?.favoriteCuisines)
    ? data.favoriteCuisines.filter((value: unknown): value is string => typeof value === 'string')
    : [];
  return {
    bio: typeof data?.bio === 'string' ? data.bio : '',
    city: typeof data?.city === 'string' ? data.city : null,
    displayName: typeof data?.displayName === 'string' ? data.displayName : fallbackName,
    favoriteCuisines: cuisines,
    favoriteDish: typeof data?.tastePreferences?.favoriteDish === 'string' ? data.tastePreferences.favoriteDish : null,
    favoriteVenueId: typeof data?.tastePreferences?.favoriteVenueId === 'string' ? data.tastePreferences.favoriteVenueId : null,
    followerCount: Number(data?.followerCount ?? 0),
    followingCount: Number(data?.followingCount ?? 0),
    photoUrl: typeof data?.photoUrl === 'string' ? data.photoUrl : null,
    photoPath: typeof data?.photoPath === 'string' ? data.photoPath : null,
    reviewCount: Number(data?.reviewCount ?? 0),
    username: typeof data?.username === 'string' ? data.username : null,
    xp: Number(data?.xp ?? 0),
  };
}

function reviewFromDocument(document: QueryDocumentSnapshot<DocumentData>): FeedItem {
  const data = document.data();
  const createdAt = data.createdAt as Timestamp | undefined;
  return {
    id: document.id,
    authorId: String(data.authorId ?? ''),
    authorDisplayName: String(data.authorDisplayName ?? 'Tastes member'),
    venueId: String(data.venueId ?? ''),
    venueName: String(data.venueName ?? 'Place'),
    rating: Number(data.rating ?? 0),
    text: String(data.text ?? ''),
    tags: Array.isArray(data.tags) ? data.tags : [],
    dishReviews: Array.isArray(data.dishReviews) ? data.dishReviews : [],
    status: 'published',
    commentCount: Number(data.commentCount ?? 0),
    reactionCount: Number(data.reactionCount ?? 0),
    pinned: data.pinned === true,
    createdAt: createdAt?.toDate ? createdAt.toDate().toISOString() : new Date().toISOString(),
  };
}

export function useProfile(userId: string, fallbackName: string) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onSnapshot(
    doc(firestore, 'users', userId),
    (snapshot) => {
      setProfile(snapshot.exists() ? profileFromDocument(snapshot.data(), fallbackName) : null);
      setLoading(false);
    },
    () => setLoading(false),
  ), [fallbackName, userId]);

  return { loading, profile };
}

export function useProfileReviews(userId: string) {
  const [reviews, setReviews] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastDocument = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const hasLoadedMore = useRef(false);

  const baseQuery = useCallback(() => query(
      collection(firestore, 'reviews'),
      where('status', '==', 'published'),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc'),
      orderBy(documentId(), 'desc'),
      limit(20),
    ), [userId]);

  useEffect(() => {
    hasLoadedMore.current = false;
    lastDocument.current = null;
    setReviews([]);
    setLoading(true);
    return onSnapshot(
      baseQuery(),
    (snapshot) => {
      const latest = snapshot.docs.map(reviewFromDocument);
      setReviews((current) => {
        const latestIds = new Set(latest.map((review) => review.id));
        return [...latest, ...current.filter((review) => !latestIds.has(review.id))];
      });
      if (!hasLoadedMore.current) {
        lastDocument.current = snapshot.docs.at(-1) ?? null;
        setHasMore(snapshot.size === 20);
      }
      setError(null);
      setLoading(false);
    },
      (cause) => { setError(cause); setLoading(false); },
    );
  }, [baseQuery]);

  const loadMore = useCallback(async () => {
    if (!lastDocument.current || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const cursor = lastDocument.current;
      const snapshot = await getDocs(query(
        collection(firestore, 'reviews'),
        where('status', '==', 'published'),
        where('authorId', '==', userId),
        orderBy('createdAt', 'desc'),
        orderBy(documentId(), 'desc'),
        startAfter(cursor.get('createdAt'), cursor.id),
        limit(20),
      ));
      const next = snapshot.docs.map(reviewFromDocument);
      hasLoadedMore.current = true;
      setReviews((current) => {
        const known = new Set(current.map((review) => review.id));
        return [...current, ...next.filter((review) => !known.has(review.id))];
      });
      lastDocument.current = snapshot.docs.at(-1) ?? lastDocument.current;
      setHasMore(snapshot.size === 20);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('Could not load more reviews.'));
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, userId]);

  return { error, hasMore, loadMore, loading, loadingMore, reviews };
}
