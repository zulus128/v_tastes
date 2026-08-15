# Milestone 1 — video scope and recording plan

Source: *Technical Project Scope: Tastes Application Development*.

## Contract scope

### Frontend M01 — Onboarding & Auth UI

- Registration and login journey.
- SMS OTP.
- Email verification and password reset/confirmation UI where applicable.
- First-download welcome screens.
- Post-sign-up onboarding.

### Frontend M02 — Profile UI

- Personal profile/dashboard.
- Activity tracking on an interactive map.
- Actions tab.
- Wishlist.
- Rewards.
- Followers and following.
- Settings and notification preferences.

### Backend M01 — Auth & User Management

- `createUserProfile`.
- `updateProfile`.
- `resetPassword`.
- `discoverContacts`.
- Firebase Auth with email and SMS OTP.
- Contact-based friend discovery hooks.
- Custom claims/RBAC are backend-only and should be mentioned in the voice-over, not simulated as a consumer mobile screen.

## Silent-preview storyboard

Current visual preview: approximately 3:15. The voice-over cut will be tightened after visual approval.

1. **00:00–00:08 — First launch**
   - Native splash and welcome carousel.
   - Move through the welcome screens at a readable pace.
2. **00:08–00:24 — Authentication**
   - Open sign-in choices.
   - Choose phone sign-in.
   - Select country, enter phone number, request OTP, enter OTP.
3. **00:24–00:38 — Create profile**
   - Enter name, username and city.
   - Open photo picker, select a photo, crop it, show the completed avatar.
4. **00:38–01:02 — Post-sign-up onboarding**
   - Favourite dishes.
   - Location permission.
   - Favourite place.
   - Appearance.
   - Find/invite friends and contact discovery.
   - Notification permission and ready screen.
5. **01:02–01:28 — Profile dashboard**
   - Open own profile.
   - Scroll the profile naturally.
   - Switch between Actions, Map and Wishlist.
6. **01:28–01:48 — Social/profile extras**
   - Followers and Following lists.
   - Rewards and achievements.
   - Settings.
   - Notification preference switches.
7. **01:48–01:55 — Close**
   - Return to the profile overview and hold briefly.

## Excluded from this video

- Messaging UI.
- Review creation, comments and reactions.
- Places/venues search and Discover feed.
- Social graph/discovery backend functions delivered in Milestone 2.
- Activities/invitations outside the profile's own Actions view.
- Monthly recap, leaderboard and unrelated later-scope features.

## Acceptance checklist

- [x] No redbox or application error toast is visible.
- [x] Every retained interaction leads to an observable UI change.
- [x] Transitions use short fades only between major chapters.
- [x] Login and onboarding remain readable.
- [x] Photo selection and the resulting avatar are both visible.
- [x] Profile Reviews, Map and Wishlist are each shown.
- [x] Followers/following counters, Rewards and Settings are visible.
- [ ] Add the final English voice-over after visual approval.
- [ ] Video is approved silently before English voice-over is produced.
