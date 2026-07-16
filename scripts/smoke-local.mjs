/* global console, fetch */

const authBaseUrl = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const functionsBaseUrl = 'http://127.0.0.1:5001/demo-tastes/europe-west1';

async function post(url, body, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(JSON.stringify(payload));
  }

  return payload;
}

async function callFunction(name, data, token) {
  const payload = await post(`${functionsBaseUrl}/${name}`, { data }, token);
  return payload.result;
}

const email = `smoke-${Date.now()}@tastes.local`;
const auth = await post(`${authBaseUrl}/accounts:signUp?key=demo-api-key`, {
  email,
  password: 'password123',
  returnSecureToken: true,
});
const token = auth.idToken;
const health = await callFunction('healthCheck', {});
const profile = await callFunction('createUserProfile', { displayName: 'Smoke Test User' }, token);
const review = await callFunction('createReview', {
  venueId: 'demo-cafe',
  rating: 5,
  text: 'Verified by the local smoke test.',
}, token);
const comment = await callFunction('addComment', {
  reviewId: review.id,
  text: 'Smoke test comment.',
}, token);
const reaction = await callFunction('reactToReview', {
  reviewId: review.id,
  reaction: 'like',
}, token);

console.log(JSON.stringify({
  health: health.status,
  email,
  profileId: profile.id,
  reviewId: review.id,
  commentId: comment.id,
  reaction,
}, null, 2));
