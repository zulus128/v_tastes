import {
  getCanonicalDishesInputSchema,
  getTasteRecommendationsInputSchema,
  canonicalDishIdSchema,
} from '@tastes/contracts';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { z } from 'zod';
import { requireUserId } from '../../shared/auth';
import { db } from '../../shared/firebase';
import { enforceRateLimit } from '../../shared/mutations';
import { callableOptions, adminCallableOptions } from '../../shared/options';
import { parseInput } from '../../shared/validation';
import {
  DishCatalog,
  loadDishCatalog,
  normalizationRequestId,
  TAXONOMY_VERSION,
} from './catalog';
import { tasteRecommendations } from './service';

export const getCanonicalDishes = onCall(callableOptions, async (request) => {
  const uid = requireUserId(request),
    input = parseInput(getCanonicalDishesInputSchema, request.data ?? {});
  await db.runTransaction((tx) =>
    enforceRateLimit(tx, uid, 'canonical-dishes', 200, 60_000),
  );
  const catalog = await loadDishCatalog(db);
  return {
    version: TAXONOMY_VERSION,
    dishes: catalog.suggest(input.query, input.limit),
    exactId: catalog.resolve(input.query)?.id ?? null,
  };
});

export const getTasteRecommendations = onCall(
  { ...callableOptions, timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    const uid = requireUserId(request),
      input = parseInput(
        getTasteRecommendationsInputSchema,
        request.data ?? {},
      );
    await db.runTransaction((tx) =>
      enforceRateLimit(tx, uid, 'taste-recommendations', 60, 60_000),
    );
    return tasteRecommendations(db, uid, input);
  },
);

const catalogEntry = z.object({
  id: canonicalDishIdSchema,
  name: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().trim().min(1).max(120)).max(50),
  status: z.enum(['active', 'retired']),
  reason: z.string().trim().min(5).max(500),
});

export const upsertCanonicalDish = onCall(
  adminCallableOptions,
  async (request) => {
    const uid = requireUserId(request);
    if (request.auth?.token.role !== 'admin')
      throw new HttpsError(
        'permission-denied',
        'An administrator account is required.',
      );
    const input = parseInput(catalogEntry, request.data),
      catalog = await loadDishCatalog(db);
    const proposed = new Map(catalog.dishes);
    proposed.delete(input.id);
    if (input.status === 'active')
      proposed.set(input.id, {
        id: input.id,
        name: input.name,
        aliases: input.aliases,
      });
    try {
      new DishCatalog([...proposed.values()]);
    } catch {
      throw new HttpsError(
        'invalid-argument',
        'An alias already belongs to another approved dish.',
      );
    }
    await db.runTransaction(async (tx) => {
      const lock = db.collection('_tasteMaintenance').doc('catalog');
      const [version, current] = await Promise.all([
        tx.get(lock),
        tx.get(db.collection('_canonicalDishes').doc(input.id)),
      ]);
      // Optimistic catalogue version prevents concurrent writes from approving
      // the same alias for two identities. Recheck the full catalogue on retry.
      const all = await tx.get(db.collection('_canonicalDishes').limit(2001));
      const merged = new Map(catalog.dishes);
      for (const d of all.docs) {
        if (d.get('status') !== 'active') merged.delete(d.id);
        else
          merged.set(d.id, {
            id: d.id,
            name: String(d.get('name')),
            aliases: d.get('aliases') ?? [],
          });
      }
      merged.delete(input.id);
      if (input.status === 'active')
        merged.set(input.id, {
          id: input.id,
          name: input.name,
          aliases: input.aliases,
        });
      try {
        new DishCatalog([...merged.values()]);
      } catch {
        throw new HttpsError(
          'invalid-argument',
          'An alias already belongs to another approved dish.',
        );
      }
      tx.set(db.collection('_canonicalDishes').doc(input.id), {
        ...input,
        taxonomyVersion: TAXONOMY_VERSION,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(lock, {
        revision: Number(version.get('revision') ?? 0) + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (input.status === 'active')
        for (const alias of [input.name, ...input.aliases])
          tx.set(
            db
              .collection('_dishNormalizationQueue')
              .doc(normalizationRequestId(alias)),
            {
              status: 'resolved',
              canonicalDishId: input.id,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
      tx.create(db.collection('_tasteCatalogAudit').doc(), {
        actorId: uid,
        dishId: input.id,
        reason: input.reason,
        before: current.data() ?? null,
        after: input,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { id: input.id };
  },
);

export const getAdminDishCatalog = onCall(
  adminCallableOptions,
  async (request) => {
    requireUserId(request);
    if (request.auth?.token.role !== 'admin')
      throw new HttpsError(
        'permission-denied',
        'An administrator account is required.',
      );
    const [catalog, pending] = await Promise.all([
      loadDishCatalog(db),
      db
        .collection('_dishNormalizationQueue')
        .where('status', '==', 'pending')
        .limit(100)
        .get(),
    ]);
    return {
      dishes: [...catalog.dishes.values()],
      pending: pending.docs.map((d) => ({
        id: d.id,
        rawName: String(d.get('rawName') ?? ''),
      })),
    };
  },
);
