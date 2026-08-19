import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_PUSH_TOKENS = 100;

export type PushStatus = 'sent' | 'partial' | 'failed' | 'no-tokens';

interface ExpoPushTicket {
  status?: unknown;
  message?: unknown;
  details?: { error?: unknown };
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

function ticketList(payload: unknown): ExpoPushTicket[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data as ExpoPushTicket[] : data ? [data as ExpoPushTicket] : [];
}

/** Delivers one payload to every active device of a user and retires dead tokens. */
export async function sendExpoPush(recipientId: string, payload: PushPayload): Promise<{
  status: PushStatus;
  error?: string;
}> {
  const tokens = await db.collection('users').doc(recipientId).collection('pushTokens')
    .where('active', '==', true)
    .limit(MAX_PUSH_TOKENS)
    .get();
  if (tokens.empty) return { status: 'no-tokens' };

  const messages = tokens.docs.map((token) => ({
    to: String(token.get('token')),
    sound: 'default',
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });
    const responsePayload: unknown = await response.json();
    if (!response.ok) throw new Error(`Expo Push API returned HTTP ${response.status}.`);
    const tickets = ticketList(responsePayload);
    const batch = db.batch();
    let retired = 0;
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        const token = tokens.docs[index];
        if (token) {
          batch.update(token.ref, { active: false, updatedAt: FieldValue.serverTimestamp() });
          retired += 1;
        }
      }
    });
    if (retired > 0) await batch.commit();
    return { status: tickets.some((ticket) => ticket.status === 'error') ? 'partial' : 'sent' };
  } catch (error) {
    return {
      status: 'failed',
      error: error instanceof Error ? error.message.slice(0, 500) : 'Unknown push error.',
    };
  }
}
