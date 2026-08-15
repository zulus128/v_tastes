# Tastes — development and demo coverage

## What has been implemented

- Authentication and onboarding: phone OTP, country selection, consent and permissions, post-sign-up flow.
- Home: personalized friends/local feed, ratings, photos, dishes and tags, likes, comments and sharing.
- Discover: trending reviews, places, people, search, filters, follow actions and Tastes AI entry point.
- Places: venue details, rating, reviews, contacts, photo gallery and save-to-favourites flow.
- Reviews: place selection, review text, dishes, photos, tags and publishing.
- Social graph: profiles, follow/unfollow, followers/following, favourites and user reviews.
- Messaging: inbox, one-to-one real-time conversations, unread state, requests and group chats.
- Activities: create an activity, select date/time and members, invitations and activity details.
- Gamification: XP, leaderboard, monthly recap and rewards-related UI.
- Notifications and deep-link navigation.
- Tastes AI recommendation screen and history/location controls.
- Firebase backend: Authentication, Firestore real-time data, Storage, callable functions and push-notification integration.
- Admin web application: venue and report management.

## What is visibly demonstrated in the final 209-second video

- [x] Home feed with real scrolling through reviews.
- [x] Discover navigation with Trending and People content, follow controls and search UI.
- [x] Place details with rating, reviews and photo gallery.
- [x] Create Review flow and live place selection.
- [x] Leaderboard and XP screen.
- [x] New Activity screen with calendar, time and members area.
- [x] Splash, phone login and OTP flow.
- [x] Profile creation with photo-library permission, gallery selection, crop and selected avatar.
- [x] Onboarding preferences: favourite dish, location, favourite place, appearance, contacts and notifications.
- [x] Two-user conversation shown side by side, with both phones fixed in the composition.
- [x] The first user types a brunch message, the message appears on the other phone, the second user types a reply, and the reply appears back on the first phone.
- [x] Real taps, transitions and scrolling; simulators remain fixed in the composition.
- [x] Visible messaging stages: type, message arrival, reply typing and reply arrival, without artificial Send/Receive labels.
- [x] Monthly recap interactive story and personal statistics.
- [x] Activity invitation card with venue, participants and response actions.
- [x] Updated English voice-over, timed to authentication, onboarding, core features, monthly recap and messaging.
- [x] Smoother scene changes with short fades; no moving or floating simulator windows.

## Coverage notes

- [x] Reply visibly appears on the opposite simulator in the side-by-side conversation segment.
- [x] Profile and social profile views.
- [x] Comments, sharing and save actions are represented through the feed/post interaction and product walkthrough.
- [x] Places browsing, map, search and filter interaction.
- [x] Activity creation plus invitation/details card.
- [x] Rewards/XP, leaderboard and monthly recap.
- [x] Complete authentication/onboarding journey, including photo selection.
- [ ] Admin web application is not included in this mobile-product video.
- [ ] Some secondary settings and group-chat subflows are implemented but intentionally omitted to keep the cut concise.

## Issue found and fixed after recording

The test Firebase data contains at least one review photo with an empty Storage path. Previously, `DishPhoto` passed that empty value to Firebase Storage, which raised a root-reference `getDownloadURL` error. Both the Profile and Comments photo renderers now trim and validate the path before calling Storage; missing paths render the existing `Photo unavailable` placeholder instead. TypeScript, ESLint and diff validation pass after the fix.

## Final cut timeline

- 00:00–00:59 — splash, sign-in, phone number, OTP, profile creation and photo selection/crop.
- 00:59–01:53 — readable preference and permissions onboarding.
- 01:53–02:38 — feed, discover, map/search/filter, profiles, social actions, review/activity and rewards coverage.
- 02:38–03:01 — `Your Month in Tastes`, including loading and completed recap card.
- 03:01–03:29 — two-person message and reply sequence shown on both phones.
