import { db } from '../../shared/firebase';
import {
  COMMUNITY_SIGNAL_VERSION,
  communityRankingsReady,
  signalTime,
} from './community-policy';

export async function communitySelection(now = Date.now()) {
  const [settings, latest, overrides] = await Promise.all([
    db.collection('configuration').doc('communityDiscovery').get(),
    db
      .collection('_communitySignalRuns')
      .orderBy('calculatedAt', 'desc')
      .limit(1)
      .get(),
    db.collection('_communityOverrides').where('excluded', '==', true).get(),
  ]);
  const excluded = new Set(
    overrides.docs.map(
      (doc) => `${doc.get('targetType')}:${doc.get('targetId')}`,
    ),
  );
  const enabled = communityRankingsReady(
    settings.data(),
    latest.docs[0]?.data(),
    now,
  );
  const [people, reviews] = enabled
    ? await Promise.all([
        db.collection('_communityPeopleSignals').get(),
        db.collection('_communityReviewSignals').get(),
      ])
    : [null, null];
  const fresh = (data: Record<string, unknown>) =>
    data.algorithmVersion === COMMUNITY_SIGNAL_VERSION &&
    signalTime(data.calculatedAt) >= now - 2 * 60 * 60_000 &&
    signalTime(data.calculatedAt) <= now;
  return {
    enabled,
    excluded,
    people: new Map(
      people?.docs
        .filter((doc) => fresh(doc.data()))
        .map((doc) => [doc.id, doc.data()]) ?? [],
    ),
    reviews: new Map(
      reviews?.docs
        .filter((doc) => fresh(doc.data()))
        .map((doc) => [doc.id, doc.data()]) ?? [],
    ),
  };
}
