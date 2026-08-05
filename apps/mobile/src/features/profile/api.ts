import type { FeedItem } from '@tastes/contracts';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Timestamp,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { firestore } from '../../infrastructure/firebase';

export type ProfileData = {
  avatarKey: string | null;
  bio: string;
  city: string | null;
  displayName: string;
  favoriteCuisines: string[];
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
    avatarKey: typeof data?.avatarKey === 'string' ? data.avatarKey : null,
    bio: typeof data?.bio === 'string' ? data.bio : '',
    city: typeof data?.city === 'string' ? data.city : null,
    displayName: typeof data?.displayName === 'string' ? data.displayName : fallbackName,
    favoriteCuisines: cuisines,
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

  useEffect(() => onSnapshot(
    query(
      collection(firestore, 'reviews'),
      where('status', '==', 'published'),
      where('authorId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(20),
    ),
    (snapshot) => {
      setReviews(snapshot.docs.map(reviewFromDocument));
      setLoading(false);
    },
    () => setLoading(false),
  ), [userId]);

  return { loading, reviews };
}
