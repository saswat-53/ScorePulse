# Spec: Android push notifications that reach the phone

Status: draft, to be worked through step by step
Owner: saswat · Last updated: 2026-11-04

## Goal

A goal, card, substitution, kickoff or full-time alert for a followed match or a favorite club appears on the phone
as a normal system notification, like Instagram's, with the app closed.

## Why nothing arrived (evidence)

| Fact | How it was found |
|---|---|
| `push_tokens` has 0 rows, so the server has no device to send to | read-only query on Neon, 2026-11-03 |
| The installed APK has no Firebase config (no Google app id, no sender id, no `google-services.json`) | searched `app/build-1793650059458.apk` |
| `app.json` has no `android.googleServicesFile` | `app/app.json` |
| Getting a push token needs Firebase on Android; the app catches the failure and registers nothing | `app/src/lib/push.ts` (`getPushToken` returns `null` after `console.warn('push token failed')`) |

The last row is the likely mechanism; it has not been seen on the phone yet. Step 8 below confirms it from the other
side: after the fix a row appears in `push_tokens`.

## Non-goals

- iOS. The app is Android-only (see `docs/PROJECT-OVERVIEW.md`).
- Changing what is alerted or when. Alert content and rules stay as they are (ADR 0013, ADR 0016).
- Play Store release. The APK is still built locally and handed out (ADR 0006).

## How the pieces connect

```
poller (Worker) → Expo push service (exp.host) → Google FCM → the phone
                         ↑ needs the FCM key          ↑ needs google-services.json in the APK
```

Two separate Firebase files do two separate jobs:

- `google-services.json` goes into the **APK**, so the phone can get a push address.
- The **service-account key** (a different JSON) goes to **Expo**, so Expo may deliver through Google.

Both are missing today.

## Prerequisites

- A Google account for Firebase.
- The Expo account `saswat_5335` (the project owner in `app.json`), able to sign in with `npx eas-cli login`.
- The local APK build already works on this Mac (the `build-*.apk` files in `app/`).
- The Android phone with the current ScorePulse installed, signed in.

## Secrets rule

`google-services.json` is already in `.gitignore`. The service-account key is a real secret: keep it outside the repo
(for example `~/secrets/scorepulse-fcm.json`), never paste it into a chat, and delete the local copy once Expo has it.
If it ever leaks, delete the key in Firebase and generate a new one.

## Steps

Who: **You** = needs your accounts or phone. **Claude** = done in the repo or database.

### 1. Create the Firebase project (You)

1. Open https://console.firebase.google.com and choose **Add project**.
2. Name it `ScorePulse`. Turn **Google Analytics off** (not needed). Create the project.

Done when: the project's overview page opens.

### 2. Add the Android app and download `google-services.json` (You)

1. On the project overview, click the **Android** icon (**Add app**).
2. **Android package name:** `com.scorepulse.app`. It must match `app.json` → `android.package` exactly.
3. App nickname is optional. Leave the SHA-1 field empty (push does not need it). Click **Register app**.
4. **Download `google-services.json`** and put it at `app/google-services.json`.
5. Skip the remaining wizard screens ("Add Firebase SDK", "Run your app"). Expo wires this up itself.

Done when: `app/google-services.json` exists and `git status` does not list it (it is ignored).

### 3. Confirm the Cloud Messaging API (V1) is on (You)

1. In Firebase: **Project settings** (gear icon) → **Cloud Messaging** tab.
2. **Firebase Cloud Messaging API (V1)** must say **Enabled**. If it says disabled, use the menu next to it to open
   Google Cloud and click **Enable** on the API.
3. Ignore the "Cloud Messaging API (Legacy)" section. Expo uses V1.

Done when: V1 shows Enabled.

### 4. Create the service-account key (You)

1. **Project settings** → **Service accounts** tab.
2. Click **Generate new private key**, then **Generate key**. A JSON file downloads.
3. Move it outside the repo, for example `~/secrets/scorepulse-fcm.json`.

Done when: the file exists and is not inside `ScorePulse/`.

### 5. Give the key to Expo (You)

Run from the `app/` folder:

```
npx eas-cli login
npx eas-cli credentials
```

Choose: **Android** → the build profile (`preview`) → **Google Service Account** → **Manage your Google Service
Account Key for Push Notifications (FCM V1)** → **Set up** (or **Upload**) → give the path to the JSON from step 4.
The menu wording can differ between versions; the item to find is the **FCM V1 push-notification key**.

Alternative in the browser: https://expo.dev → the `scorepulse` project → **Credentials** → **Android** →
`com.scorepulse.app` → **FCM V1 service account key** → **Add**.

Done when: the Credentials page shows an FCM V1 key attached to `com.scorepulse.app`.

### 6. Point the app at `google-services.json` (Claude)

Add one line to `app/app.json`, under `expo.android`:

```json
"googleServicesFile": "./google-services.json"
```

Check: `cd app && npx expo config --type public` prints `googleServicesFile` under `android`.

Done when: the check shows the path, and the file from step 2 exists.

### 7. Rebuild the APK and install it over the old one (You)

The APK is a local EAS build (`eas.json` profile `preview`, `credentialsSource: local`). From `app/`:

```
npx eas-cli build --platform android --profile preview --local
```

This is inferred from `eas.json` and the `build-<timestamp>.apk` file names; use your usual build command if it
differs. Install the new APK over the current app (it uses the same signing key, so it updates in place and keeps your
sign-in, clubs and follows).

Done when: the app opens at the same sign-in state as before.

### 8. Register the phone (You, then Claude checks)

1. Open the app. Registration runs on sign-in and on every app start (`app/src/state/session.tsx`).
2. If the app asks for notification permission, **Allow**. If it never asks (it asks once per install), open Android
   **Settings → Apps → ScorePulse → Notifications** and turn notifications on.
3. If still nothing, sign out and in again, or open **More → choose clubs** and tap **Enable**.

Claude then checks, read-only: `select user_id, left(token, 24), created_at from push_tokens` shows a row for your user.

Done when: `push_tokens` has a row with an `ExponentPushToken[…]` for your user. This also confirms the cause in
"Why nothing arrived".

### 9. Send a test push straight to the phone (You)

1. Close the app (swipe it away).
2. Open https://expo.dev/notifications, paste your `ExponentPushToken[…]`, any title and message, and send.
   (Claude can give you the token from step 8.)
3. The notification should appear within seconds with the app closed.
4. Open the app and send another: with the app open, a banner should appear (`app/src/lib/push.ts` sets that).

Done when: both the closed-app and open-app notifications show.

### 10. Send one through our own server (Claude proposes, You confirm)

This proves the server → Expo → phone path with real alert content. Claude proposes the least invasive way (the
demo match from `npm run demo:seed` in `server/`, followed by your account) and **asks before running anything that
writes to production**. Clean up afterwards with `npm run demo:clean`.

Done when: a goal alert from the server shows on the phone, and the matching row in `notification_log` has a
delivered status.

### 11. Watch the first real matchday (You and Claude)

Follow one non-favorite match and keep `npx wrangler tail --format pretty` open. Expect: kickoff alert, goal alert(s),
full-time alert. Missed alerts are likely to come from the API-Football refusals tracked separately, not from push.

## Acceptance

| # | Check | Pass when |
|---|---|---|
| 1 | Token registered | `push_tokens` has your token (step 8) |
| 2 | Direct test push | arrives with the app closed and with it open (step 9) |
| 3 | Server alert | a server-sent alert arrives and is logged (step 10) |
| 4 | Real match | kickoff, goal and full-time alerts arrive for a followed match (step 11) |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `push token failed … FirebaseApp is not initialized` in the phone log | the APK was built without `google-services.json` | do step 6 and rebuild (step 7) |
| `push_tokens` still empty after step 8 | permission off, or no sign-in, or an old APK | check Settings → Notifications; confirm the new APK is installed |
| Expo ticket error `InvalidCredentials` or "unable to retrieve the FCM server key" | step 5 not done or the wrong key | upload the FCM V1 key again |
| Expo ticket `DeviceNotRegistered` | the app was reinstalled or its data cleared | open the app so it registers again; the server deletes the dead token itself |
| Test push works, server alerts don't | the poller isn't seeing the event | check `wrangler tail`; see the API-Football refusal issue |
| Alert appears late or only on opening the app | the phone's battery saver stops the app | Settings → Battery → ScorePulse → Unrestricted (Samsung, Xiaomi, Oppo are the usual ones) |
| No banner while the app is open | handler not active | confirm a release build, not Expo Go (`PUSH_AVAILABLE` in `push.ts`) |

## Rollback

Nothing in this spec is destructive. If the new APK misbehaves, install the previous `build-*.apk` over it (same
signing key). The Firebase project and the Expo key can stay in place unused.

## Open questions

- Is the build command in step 7 the one you use? (Inferred from `eas.json`.)
- Does the Expo project have "enhanced push security" on? The server sends pushes without an access token
  (`server/src/poller/expo.ts`); if it is on, sends fail with an authorization error and the server needs an
  `EXPO_ACCESS_TOKEN`. Default is off.
- Should the notification channel be named differently for Android settings? Today it is `default`, shown as
  "Match alerts".
