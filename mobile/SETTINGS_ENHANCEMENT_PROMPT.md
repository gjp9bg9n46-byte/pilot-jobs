# Prompt: Rebuild the Settings screen with proper categories, controls, and account safety

Paste this into Claude in VS Code at the repo root (`pilot-jobs/`).

---

We're overhauling the Settings screen in our React Native / Expo pilot-jobs app. The codebase has both `mobile/` (RN + Redux Toolkit + axios) and `backend/` (Node + Prisma). Before writing any UI, read these end-to-end:

- `mobile/src/screens/settings/SettingsScreen.tsx` — what you'll be modifying
- `mobile/src/screens/profile/ProfileScreen.tsx` — has overlapping concepts (preferences, logout). See "Coordination" below.
- `mobile/src/services/api.ts` — `authApi` and `profileApi` surface. Some methods the current Settings screen calls (`authApi.changePassword`, `authApi.deleteAccount`) may not exist there — verify and add them if missing.
- `mobile/src/store/index.ts` — `logout` action + any theme/units slice (probably absent today).
- `backend/prisma/schema.prisma` — `User`, `UserPreferences` (or wherever `notifyEmail` / `preferredCountries` / `preferredAircraft` / `minSalary` live), and any session / token / 2FA tables that exist.
- `backend/src/routes/profile.js` (specifically the preferences route) and `backend/src/routes/auth.js` / `backend/src/controllers/authController.js` to see what password-change and account-deletion endpoints actually accept.
- `backend/src/services/notificationService.js` to understand how push is dispatched, so the granular notification categories you add map to real channels.

Start your reply with a short table marking each new/changed field as **backend ready**, **backend partial (explain)**, or **needs backend work (propose migration + route change)**. For anything that needs backend work, scaffold the UI behind a `// TODO: backend` comment and call it out in your summary.

## Coordination with the Profile work

There's a separate prompt (`mobile/PROFILE_ENHANCEMENT_PROMPT.md`) that proposed adding a preferences section to Profile. **Settings now owns preferences end-to-end.** Remove any preferences-related additions you would have made under Profile and concentrate them here. Profile keeps personal info, licences, ratings, medicals, documents, etc.

Same coordination on date-pickers: this work and the logbook/profile work all use `@react-native-community/datetimepicker`. If it isn't yet installed, add it to `package.json` once.

## What to build

### 1. Fix the notification bug

Currently, toggling "Email alerts" or "Push notifications" updates local state but doesn't persist — the only save action is the "Save Preferences" button under Job Preferences, which the user has no reason to think governs notification switches.

- Make notification switches **auto-save** on change (debounced 400ms, optimistic UI, revert + Toast on failure).
- Wire the push toggle to a real permission flow: when the user turns it ON, request `expo-notifications` permission, fetch the FCM/Expo push token, call `authApi.updateFcmToken(token)`. If permission is denied, revert the switch and show an inline help row with a "Open system settings" button (`Linking.openSettings()`).
- When the user turns push OFF, call `authApi.updateFcmToken(null)` (or a new `clearFcmToken` endpoint — propose if needed) so the server stops sending.

### 2. Granular notification categories + quiet hours

Replace the two booleans with a per-category, per-channel matrix:

| Category | Push | Email |
|---|---|---|
| New matched jobs | ✓ | ✓ |
| Saved-search alerts | ✓ | – |
| Application status updates | ✓ | ✓ |
| Expiry reminders (medical, licence, training, passport) | ✓ | ✓ |
| Weekly digest | – | ✓ |
| Product updates from our team | – | ✓ |

Render as a list of category rows, each with two small switches. Master toggles at the top still exist ("All push" / "All email") and override individual ones when off.

Below the matrix add a **Quiet hours** block: enable switch + start time + end time pickers + timezone (default to device timezone, override available). When enabled, push during those hours is suppressed server-side.

Propose the Prisma additions if `UserPreferences` doesn't already have these fields (`notifyMatches`, `notifyAlerts`, `notifyApplications`, `notifyExpiries`, `notifyDigest`, `notifyProductUpdates`, each as `{ push: bool, email: bool }` JSON or separate bool columns; plus `quietHoursStart`, `quietHoursEnd`, `quietHoursTz`).

### 3. Job preferences — broader pickers, currency-aware salary

The current chip grids hardcode 10 countries and 10 aircraft. Replace both with searchable pickers (modal sheet, type-to-filter, multi-select with check-marks):

- **Preferred countries**: source the list from the airports JSON added in the logbook work (`mobile/src/data/airports.json`) — derive a unique country list with names + ISO codes. If the airports file isn't shipped yet, ship a `mobile/src/data/countries.json` (ISO 3166).
- **Preferred aircraft types**: source from a `mobile/src/data/aircraft.json` (ICAO type designators with friendly names like `B738 — Boeing 737-800`). Pre-fill with the user's profile type ratings as the top "Your rated aircraft" section.
- **Preferred contract types**: new multi-select — Permanent / Fixed-term / Contract (ACMI) / Per-diem / Pay-to-fly *excluded* (yes/no flag).
- **Route preference**: Short-haul / Medium-haul / Long-haul / Ultra-long-haul / Cargo / Corporate (multi-select).
- **Minimum salary**: amount + currency picker (USD, EUR, GBP, AED, AUD, SGD, CAD, CHF, JPY) + period toggle (per year / per month). Persist as `minSalary` + `minSalaryCurrency` + `minSalaryPeriod`.

Add a "Negotiable / open to any" master switch above the salary block that, when on, sends `minSalary: null` and grays out the inputs.

Switch the save model here from a single bottom button to per-section auto-save (matches the notifications pattern), with a small status line ("Saved 2s ago") at the top of the section.

### 4. Password change — better UX and verify the endpoint exists

- Add a show/hide eye icon on each of the three password inputs.
- Add a strength meter below the New Password input (use `zxcvbn-ts`; ~10KB gzipped, no native code). Show four-bar visual + the top suggestion from zxcvbn's feedback.
- Inline validation as the user types: minimum length, doesn't equal current, matches confirm. Disable the Change Password button until all conditions pass — don't rely on Alert pop-ups for guidance.
- Verify `authApi.changePassword(currentPw, newPw)` actually exists. If it's not in `api.ts`, add it and confirm the backend route exists at `POST /auth/change-password` (or wherever). If the backend route is missing, propose it.
- On success: clear the fields, show an inline confirmation, and offer a "Sign out of other devices" CTA that calls a session-revocation endpoint (propose if it doesn't exist — see Active Sessions below).

### 5. Delete account — more careful confirmation + GDPR export

Rebuild the delete flow as a multi-step screen (not the current single password input):

1. **Step 1 — Read what gets deleted.** Itemized list: profile, X logbook entries, Y licences, Z medicals, alerts, applications. Fetch counts from the existing profile and logbook APIs.
2. **Step 2 — Download your data.** Offer "Export my data" before delete. Calls a new `GET /me/export` endpoint (propose if it doesn't exist) that returns a JSON or ZIP. Save via `expo-file-system` + `expo-sharing`.
3. **Step 3 — Type your email to confirm.** Show the email faintly above the input; require an exact match. Then a password input below.
4. **Step 4 — Final confirm.** Red destructive button, plus a checkbox "I understand this is permanent."

If the backend supports soft-delete with a grace period, surface "Your account will be permanently deleted in 30 days. Sign in again before then to cancel." If not, propose adding it — losing data to an accidental delete is the most common settings-screen complaint.

Verify `authApi.deleteAccount(password)` exists in `api.ts` and add it if missing.

### 6. Appearance — theme + units + language + date format

New section "Appearance & Locale":

- **Theme**: Light / Dark / System (default System). Plumb through a new Redux slice `ui.theme`, persisted to AsyncStorage. The app is hardcoded dark today; produce a `light` palette mirroring the existing `#0A1628 / #1B2B4B / #00B4D8` family in light tones, and a `useTheme()` hook that returns the active palette. Don't migrate every screen in this PR — just add the foundation and use it on the Settings screen itself as proof-of-concept. Call out in the summary that the rest of the screens still need migration.
- **Units**: altitude (ft / m), distance (nm / km / mi), wind speed (kt / m/s / km/h). Persist to the same `ui` slice. Add a `useUnits()` hook so other screens can format consistently.
- **Language**: picker, English-only for now but include the picker scaffold and an `i18n` placeholder (`react-i18next`) — only English populated. Note this clearly in the summary so it doesn't look like fake localization.
- **Date format**: DD/MM/YYYY / MM/DD/YYYY / YYYY-MM-DD / Auto (locale default). The codebase currently mixes `en-GB` (Profile) and `en-US` (Logbook); unify around this setting via a `formatDate(d)` helper in `mobile/src/utils/format.ts`.

### 7. Privacy

New section "Privacy":

- **Profile visible to recruiters** (default on). When off, the matching service should skip this user as a candidate — confirm with `matchingService.js` and propose the backend flag if missing (`profileVisible` on `User`).
- **Anonymous browsing** — when on, viewing a job listing doesn't record a "viewed by" entry. Backend wiring as above.
- **Show seniority / years of experience publicly** — granular control over what shows on a recruiter-facing profile preview.

### 8. Security

New section "Security":

- **Two-factor authentication** — scaffold a row that opens a dedicated 2FA setup screen (TOTP via `otplib`). Mark as "Coming soon" if the backend lacks 2FA tables (likely); propose the schema (`TwoFactorSecret { userId, secret, verifiedAt, backupCodes[] }`).
- **Active sessions / devices** — list current sessions with device label + last-used IP/city + last-used time, with a "Sign out" button per row and a "Sign out everywhere" button at the bottom. Propose `GET /auth/sessions` + `DELETE /auth/sessions/:id` if missing.
- **Connected accounts** — placeholder rows for Apple / Google sign-in. Mark "Not linked" with a "Link" button that opens the respective OAuth flow (stub a TODO if those providers aren't wired yet).

### 9. Data

New section "Data":

- **Export logbook** — three buttons: CSV (raw), PDF (formatted, last 12 months by default with range picker), and ForeFlight-compatible CSV (matches the import format already supported). Files saved via `expo-file-system` + `expo-sharing`.
- **Automatic cloud backup of logbook** — daily/weekly/off picker. Propose the schedule on the backend (a cron or trigger) if needed.
- **Export all my data** — same endpoint as the delete-flow export, exposed here too for any-time download.

### 10. Support & Legal

Plain row list (no toggles), each row is a tappable navigation:

- Contact support → mailto or in-app form
- Help center → opens external URL via `expo-web-browser`
- Send feedback → mailto with prefilled subject
- Terms of Service → external URL
- Privacy Policy → external URL
- Open-source licences → static screen
- App version + build number (read-only, read from `expo-constants`)

### 11. Sign out

Move sign out from `ProfileScreen` to the bottom of Settings (the conventional place). Keep the existing confirmation dialog. Profile's footer stays clean.

## Conventions to follow

- Match the existing visual language: `#0A1628` background, `#1B2B4B` cards, `#00B4D8` accent, amber `#F5A524` warnings, red `#FF4757` destructive, Ionicons icons. Switches use the existing `trackColor={{ false: '#243050', true: '#00B4D8' }}` pattern.
- The new theme work is the one place this palette becomes a variable — everywhere else, keep hardcoding it for now, but read from the theme hook on the Settings screen itself.
- Don't introduce new state libraries — keep using Redux Toolkit. Add a `ui` slice for theme/units/dateFormat/language and a `preferences` slice if it makes the persistence easier.
- Replace `any` types on new code with real interfaces. Add `mobile/src/types/settings.ts` and `mobile/src/types/preferences.ts`.
- Keep `SettingsScreen.tsx` readable. Split each section into a sibling component file under `mobile/src/screens/settings/sections/` (`NotificationsSection.tsx`, `PreferencesSection.tsx`, `AppearanceSection.tsx`, etc.) and have `SettingsScreen.tsx` only compose them.
- All toggle/save interactions must be optimistic: update local state first, fire the API, revert + Toast on failure. Use a small `useAutoSave` hook for the debounced pattern.
- All new dates as ISO; times as `HH:mm` strings; all enums as backend-stable codes (e.g. currency `USD`, not `US Dollar`).

## Deliverables

1. The backend-support table at the top of your reply.
2. The modified and new files.
3. The proposed Prisma migration + new route signatures for anything that needed backend work (granular notifications, quiet hours, sessions, 2FA, data export, soft-delete, profileVisible, etc.).
4. A short summary at the end: what shipped end-to-end, what's stubbed pending backend work, and anything you deliberately deferred (e.g. real translation strings, light-mode rollout to non-Settings screens) with rationale.

Do not start writing UI until you've read the relevant Prisma models and the auth + preferences controllers. The goal is to wire the UI to what the server already accepts wherever possible, and only propose schema changes where the user-facing win is clear.
