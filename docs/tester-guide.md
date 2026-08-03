# Tastes Preview — Tester Guide

## Purpose of this build

This preview build is intended to validate the current Android user experience and the integration with the shared Firebase test environment.

Please focus on:

- sign-in and onboarding;
- Home feed states and navigation;
- Discover, venue search, and venue details;
- creating and publishing a review, including dish photos and ratings;
- following and unfollowing people;
- saving venues and managing favourite folders;
- comments;
- leaderboard and monthly recap;
- app stability, error handling, and data persistence after restart.

## Install the app

1. Open the Firebase App Distribution invitation on an Android device.
2. Accept the invitation using the same email address that was added to the `tastes-testers` group.
3. Download and install the latest Tastes APK.
4. If Android blocks the installation, allow installs from Firebase App Tester or from your browser when prompted.
5. Open Tastes.

When reporting a problem, include the release date and release notes shown in Firebase App Distribution.

## Sign in

1. Select a country.
2. Enter a valid-looking phone number, including the country code.
3. Tap **Continue**.
4. Enter the test verification code:

   `1332`

5. Complete the profile and onboarding steps.

No real SMS is sent in this preview environment. Different phone numbers create different test accounts, so keep using the same number if you want to return to the same account.

Do not use a real personal phone number. A fictional number in a valid international format is sufficient for testing.

## Suggested smoke test

After installing the build, please complete this short test first:

1. Sign in with the test code `1332`.
2. Complete onboarding and reach the Home screen.
3. Switch between the **Friends** and **Local** feeds.
4. Open **Discover** and switch between its sections.
5. Open a venue and review its overview, photos, opening hours, and reviews.
6. Save the venue to favourites, then remove it.
7. Tap **Review now** and confirm that the selected venue is already shown in the review form.
8. Select an overall rating, enter feedback, and add at least one dish with a photo, name, and rating.
9. Select one or more visit tags and tap **Post Review**.
10. Confirm that the success screen appears, then return to Home and find the review in **Local** with its dish and tags.
11. Follow a person, close the screen, return, and confirm that the state was saved.
12. Open comments from a Home feed item and add a comment.
13. Open the leaderboard from Home or Profile.
14. Open the monthly recap from Profile.
15. Close and reopen the app. Confirm that you remain signed in and that saved server-side changes are still present.
16. Sign out from Profile and confirm that the sign-in screen appears.

## Create review checks

Run the complete happy path above once, then cover these focused cases:

- open the centre **Create** tab directly and search for a venue;
- change the overall rating in 0.5-point steps and confirm that the selected value is shown;
- add several dishes, edit a saved dish, and delete a dish before publishing;
- choose a photo from the library and, on a separate attempt, take one with the camera;
- deny camera or photo-library permission and confirm that the app explains the failure without losing the draft;
- try to save a dish without a photo, name, or rating and confirm that **Save** remains unavailable;
- try to post without a venue, overall rating, or feedback and confirm that **Post Review** remains unavailable;
- select and deselect each visit tag: **Casual**, **Date night**, **Birthday**, and **With children**;
- tap **Post Review** repeatedly while publishing and confirm that only one review is created;
- temporarily disable the network during photo upload, confirm that an error is shown, restore the network, and retry;
- after a successful post, verify the venue review count/rating and the profile review count after refreshing the relevant screens;
- close and reopen the app, then confirm that the published review and dish photo still load in the feed.

## Additional checks

While testing, please also try:

- empty, loading, error, and retry states;
- slow or temporarily disabled network connectivity;
- repeatedly tapping an action while it is loading;
- navigating back during or after a request;
- light, dark, and automatic appearance modes;
- denying Contacts, Location, Photos, and Notifications permissions;
- closing the app during onboarding and continuing after reopening it;
- entering invalid or incomplete values in forms.

## Known limitations

- This increment is distributed for Android testing. iOS distribution is not part of the current tester flow.
- **Dialog** is currently a placeholder; conversations are not implemented yet.
- A review draft is not saved if the app is closed before publishing.
- Dish photos are visible only to signed-in users in this test environment.
- Real SMS delivery and third-party sign-in providers are not enabled. Use the test code `1332`.
- Push notifications are not delivered even if notification permission is granted.
- Reporting and moderation are not connected to a backend workflow yet.
- Testers share one Firebase test environment. Content or counters may change while other people are testing.
- Reinstalling the app or signing out does not delete server-side test data.

Please do not report the limitations above as new defects unless the observed behaviour is different from what is described.

## Reporting a bug

Create one report per issue and include:

- **Title:** short description of the problem;
- **Build:** release date and release notes from Firebase App Distribution;
- **Device:** manufacturer, model, and Android version;
- **Account:** the fictional test phone number used, if relevant;
- **Preconditions:** account or data state before the test;
- **Steps:** numbered steps that reproduce the issue;
- **Expected result:** what should have happened;
- **Actual result:** what happened instead;
- **Frequency:** always, sometimes, or once;
- **Evidence:** screenshot or screen recording;
- **Network:** Wi-Fi, mobile data, offline, or limited connection.

Example:

```text
Title: Saved venue appears unsaved after returning from Place
Build: 2026-08-03 — feat(place): enhance venue details
Device: Pixel 8, Android 16
Account: +15550001001

Preconditions:
The user is signed in and the venue is not saved.

Steps:
1. Open Discover.
2. Open a venue.
3. Tap the bookmark button.
4. Return to Discover.
5. Open the same venue again.

Expected result:
The bookmark remains active.

Actual result:
The bookmark is inactive.

Frequency: 3/3
Network: Wi-Fi
Evidence: attached screen recording
```

## Severity guide

- **Blocker:** the app cannot be installed or opened, sign-in is impossible, or testing cannot continue.
- **Critical:** crash, data loss, account mix-up, or a core scenario is consistently unusable.
- **Major:** an important action fails, but another part of the app can still be tested.
- **Minor:** visual, copy, accessibility, or low-impact interaction issue.

If the app crashes or becomes stuck, capture a screenshot or recording before restarting it whenever possible.
