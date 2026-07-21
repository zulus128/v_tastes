import type { Review, Venue } from '@tastes/contracts';
import { createTastesApi } from '@tastes/firebase-client';
import { signOut, type User } from 'firebase/auth';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { auth, firestore, functions } from '../../infrastructure/firebase';

type DocumentData = Record<string, unknown>;

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function toVenue(id: string, data: DocumentData): Venue {
  return {
    id,
    name: String(data.name ?? ''),
    city: String(data.city ?? ''),
    status: data.status as Venue['status'],
  };
}

function toReview(id: string, data: DocumentData): Review {
  return {
    id,
    authorId: String(data.authorId ?? ''),
    authorDisplayName: String(data.authorDisplayName ?? ''),
    venueId: String(data.venueId ?? ''),
    venueName: String(data.venueName ?? ''),
    rating: Number(data.rating ?? 0),
    text: String(data.text ?? ''),
    status: data.status as Review['status'],
    commentCount: Number(data.commentCount ?? 0),
    reactionCount: Number(data.reactionCount ?? 0),
  };
}

export function DemoScreen({ user }: { user: User }) {
  const api = useMemo(() => createTastesApi(functions), []);
  const [displayName, setDisplayName] = useState(user.displayName ?? '');
  const [venues, setVenues] = useState<Venue[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState('demo-cafe');
  const [reviewText, setReviewText] = useState('A local emulator review.');
  const [commentText, setCommentText] = useState('Looks good!');
  const [message, setMessage] = useState('Ready');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const venuesQuery = query(collection(firestore, 'venues'), where('status', '==', 'active'));
    const reviewsQuery = query(
      collection(firestore, 'reviews'),
      where('status', '==', 'published'),
      orderBy('createdAt', 'desc'),
      limit(20),
    );

    const unsubscribeVenues = onSnapshot(venuesQuery, (snapshot) => {
      const items = snapshot.docs.map((document) => toVenue(document.id, document.data()));
      setVenues(items);
      setSelectedVenueId((currentVenueId) =>
        items[0] && !items.some((venue) => venue.id === currentVenueId)
          ? items[0].id
          : currentVenueId,
      );
    }, (error) => setMessage(errorMessage(error)));

    const unsubscribeReviews = onSnapshot(reviewsQuery, (snapshot) => {
      setReviews(snapshot.docs.map((document) => toReview(document.id, document.data())));
    }, (error) => setMessage(errorMessage(error)));

    return () => {
      unsubscribeVenues();
      unsubscribeReviews();
    };
  }, []);

  async function run(label: string, operation: () => Promise<unknown>) {
    setBusy(true);
    setMessage(`${label}…`);
    try {
      await operation();
      setMessage(`${label}: done`);
    } catch (error) {
      setMessage(`${label}: ${errorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Tastes Local</Text>
      <Text style={styles.subtitle}>Firebase emulator diagnostic client</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Backend</Text>
        <Button title="Health check" disabled={busy} onPress={() => run('Health check', () => api.healthCheck())} />
        <Text style={styles.message}>{message}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <Text>{user.phoneNumber ?? user.email ?? user.uid}</Text>
        <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} />
        <View style={styles.row}>
          <Button title="Save profile" disabled={busy} onPress={() => run('Save profile', () => api.createUserProfile({ displayName }))} />
          <Button title="Sign out" disabled={busy} onPress={() => run('Sign out', () => signOut(auth))} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Create review</Text>
        <Text style={styles.label}>Venue ID</Text>
        <TextInput style={styles.input} value={selectedVenueId} onChangeText={setSelectedVenueId} />
        <Text style={styles.hint}>{venues.map((venue) => `${venue.name} (${venue.id})`).join(', ') || 'Run pnpm seed.'}</Text>
        <TextInput style={[styles.input, styles.multiline]} value={reviewText} onChangeText={setReviewText} multiline />
        <Button
          title="Create 5-star review"
          disabled={busy || !selectedVenueId}
          onPress={() => run('Create review', () => api.createReview({ venueId: selectedVenueId, rating: 5, text: reviewText }))}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Published feed</Text>
        <TextInput style={styles.input} value={commentText} onChangeText={setCommentText} />
        {reviews.length === 0 ? <Text>No reviews yet.</Text> : reviews.map((review) => (
          <View key={review.id} style={styles.review}>
            <Text style={styles.reviewTitle}>{review.venueName} · {review.rating}/5</Text>
            <Text>{review.text}</Text>
            <Text style={styles.hint}>by {review.authorDisplayName} · {review.reactionCount} likes · {review.commentCount} comments</Text>
            <View style={styles.row}>
              <Button title="Toggle like" disabled={busy} onPress={() => run('Reaction', () => api.reactToReview({ reviewId: review.id, reaction: 'like' }))} />
              <Button title="Comment" disabled={busy} onPress={() => run('Comment', () => api.addComment({ reviewId: review.id, text: commentText }))} />
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 14, backgroundColor: '#f6f4ef' },
  title: { fontSize: 30, fontWeight: '700', color: '#1c1917' },
  subtitle: { color: '#6b625b', marginBottom: 4 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#d6d0c8', borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  label: { fontWeight: '600' },
  hint: { color: '#766f68', fontSize: 12 },
  message: { color: '#9c2f29' },
  review: { borderTopWidth: 1, borderTopColor: '#eee9e3', paddingTop: 12, gap: 8 },
  reviewTitle: { fontWeight: '700' },
});
