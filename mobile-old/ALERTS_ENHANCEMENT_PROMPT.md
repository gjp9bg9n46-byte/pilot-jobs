# Prompt: Turn the Alerts screen into a real inbox + match-explainer

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`).

---

We're upgrading the Alerts experience in our React Native / Expo pilot-jobs app. It currently shows a chronological list of server-pushed job-match alerts with a percentage badge but no way to filter, manage in bulk, or understand *why* a job was matched. Read these files first:

- `mobile/src/screens/jobs/AlertsScreen.tsx` — the screen you'll rebuild
- `mobile/src/screens/jobs/JobsScreen.tsx` and `JobDetailScreen.tsx` — for reuse + the navigation pattern into JobDetail
- `mobile/src/services/api.ts` — current `jobApi.getAlerts` / `jobApi.markRead` surface
- `mobile/src/store/index.ts` — jobs slice (`setAlerts`, `markAlertRead` exist; you'll add `addAlert`, `appendAlerts`, `markAllAlertsRead`, `dismissAlert`, saved searches actions)
- `mobile/src/navigation/index.tsx` — needs a `tabBarBadge` wired in
- `mobile/App.tsx` — push notification handler lives here; we'll subscribe new alerts into Redux
- `backend/prisma/schema.prisma` — look at `JobAlert` (or whatever the alert model is called), and check for `SavedSearch`
- `backend/src/routes/jobs.js` (or `alerts.js`) and the matching controller(s)
- `backend/src/services/matchingService.js` — source of truth for the match score and the per-criterion breakdown we need exposed

Start your reply with a short table marking each new field or endpoint as **backend ready**, **backend partial (explain)**, or **needs backend work (propose migration + route change)**. Scaffold UI for backend-pending items behind `// TODO: backend` comments and call them out in your summary.

## Coordination with other work

- **Saved searches vs saved jobs.** This prompt owns **saved searches** (filter rules that generate alerts: "B737 captain roles in Asia >$120k"). The Search prompt owns **saved jobs** (bookmarked individual listings). Don't conflate — they need separate backend tables (`SavedSearch` here, `SavedJob` there).
- **Match-score breakdown.** Both this prompt and the Search prompt need per-criterion match info from `matchingService.js`. Extend the service once to return `{ score, matched: [...], missing: [...], marginal: [...] }` and reuse on both screens. If the Search prompt has already shipped this work, use what's there.
- **matchLabel helper.** If `matchLabel` has already been extracted to `mobile/src/utils/matchLabel.ts` by the Search prompt, import from there. If not, do the extraction in this PR and use it on both screens.

## What to build

### 1. Two small bugs to clean up first

- **Plural string.** `unread === 1 ? 'job matches' : 'job matches'` — both branches say "matches". Should be `'job match'` vs `'job matches'`.
- **Mark-as-read is not optimistic.** `handlePress` awaits `jobApi.markRead` before dispatching, so the unread dot lingers on a slow connection. Dispatch `markAlertRead` first, then fire the API in the background. On failure, log it (or revert with a toast); don't block the navigation.

### 2. Tab badge for unread

In `mobile/src/navigation/index.tsx`, the Alerts `Tab.Screen` needs `options={{ tabBarBadge: unread || undefined }}` where `unread` is read from Redux (`useAppSelector(s => s.jobs.alerts.filter(a => !a.readAt).length)`). Since `Tab.Screen options` accepts a function, you can subscribe in a small wrapper component. Don't show a `0` — use `undefined` so the badge disappears entirely when there's nothing to read.

### 3. "Why this match?" — the most valuable addition

Today the card shows `87%` and a label, but no detail. Expand each card with a tappable "Why this match?" disclosure that reveals two compact lists:

- **You match on:** "4,200 hrs total · ATPL FAA · B737 type rating · Class 1 medical"
- **Missing or marginal:** "Min PIC 3,000 hrs — you have 2,500 · No EU work auth"

Pull from the breakdown that `matchingService.js` returns (see coordination note). Render `matched` items in green, `marginal` in amber, `missing` in red. Each item should be terse one-liner.

If tapping the card opens JobDetail directly today, change the interaction: tap the body to open JobDetail, tap a chevron/disclosure icon on the card to expand the breakdown in place. (Keep mark-as-read firing on either action.)

### 4. Saved searches (user-defined alert rules)

Add a sticky header to the screen with a horizontal segmented control:

- **Matches** (current view — server-pushed match alerts)
- **Saved searches** (user-defined rules)
- **Applications** *(stubbed for now — see §12)*

The Saved searches tab lists existing rules + a prominent "+ New alert rule" button. Tapping the button opens a sheet to define:

- Filters: authority (multi), aircraft (multi), region/country (multi), salary range + currency, role (Captain / FO / Either), contract types, base city, posted-within window. Reuse the same filter sheet component the Search prompt builds — if it exists, import; if not, propose the shared component path and stub a minimal version here.
- Name (free text — default to a summary of filters, e.g. "B737 Captain · Asia · ≥ $120k")
- Frequency: Instant push / Daily digest / Weekly digest

Persist server-side. Backend needs a `SavedSearch` table (id, userId, name, filters JSON, frequency enum, createdAt, lastTriggeredAt) and CRUD endpoints. Propose the migration and routes in the summary.

Each saved-search row shows: name, frequency, last-triggered timestamp, and a count of new matches since last open. Tap to view the matching jobs (navigate to `JobsScreen` with the filters pre-applied via route params); long-press for Edit / Pause / Delete.

### 5. Filter, sort, bulk actions on the Matches list

Above the list (still in the Matches tab):

- **Filter chips:** All / Unread / Saved / Dismissed. Single-select.
- **Sort menu:** Newest (default) / Highest match / Closest deadline.
- **"Mark all as read"** button on the right side of the header, only visible when `unread > 0`. Optimistic update + single bulk API call (propose `PATCH /jobs/alerts/read-all` if missing).

Per-row swipe actions using `react-native-gesture-handler`'s `Swipeable`:

- **Swipe left → Save** (yellow background, star icon)
- **Swipe right → Dismiss** (red background, x icon) — moves the alert into the Dismissed bucket so it doesn't clutter the main list. Backend: add a `dismissedAt` timestamp to the alert model.
- **Long-press → Mark read/unread** (toggle).

### 6. Group by date

Render the FlatList as a `SectionList` with headers — **Today / Yesterday / This Week / Earlier**. Section headers use the existing palette and a small unread count next to each label. A 50-entry list without grouping is exhausting to scan.

### 7. Show more on the card

The current card hides info pilots use to triage:

- **Salary** (if available — pull from `job.salaryMin/Max/Currency/Period`; add a tiny range badge "$120–160k").
- **Authority chip** (matches the `JobCard` on `JobsScreen` — reuse that component to keep them consistent).
- **Min hours** with inline ✓ / ✗ vs the user's `profile.totals` total. The Search prompt builds this; reuse the helper.
- **Posted X hours ago** (if backend has `postedAt` on the job).

Don't lose information density — keep the card scannable. If it grows tall, hide the "Why this match?" body until expanded.

### 8. Empty state that takes action

Three distinct empty states instead of one:

- **No alerts AND profile incomplete** → "Complete your profile to start receiving matched jobs" + button to ProfileScreen.
- **No alerts AND no saved searches** → "Create your first alert rule to get notified about jobs you care about" + button that opens the new-alert sheet.
- **No alerts BUT profile + saved searches exist** → "Nothing new right now. We're watching X postings — we'll notify you" + a "Browse all jobs" link to JobsScreen.

### 9. Real-time arrival via push

In `App.tsx`, register a `Notifications.addNotificationReceivedListener` once the user is signed in. When a push payload of type `MATCH_ALERT` arrives:

- Dispatch a new `addAlert(payload.alert)` action — prepends to the Redux list so the new card shows up without a manual refresh.
- The tab badge updates automatically because it's derived from Redux.
- Don't dispatch if the alert ID is already in the list (idempotent).

Background-tapped notification (notification response listener) should `navigation.navigate('Alerts')` and scroll to the alert if possible.

### 10. Pagination

`setAlerts(data)` replaces the whole list today and there's no `onEndReached`. Wire it the same as the Logbook fix:

- Accept `page` and `limit` on `jobApi.getAlerts` (propose if missing).
- Add `appendAlerts({ alerts, total })` to the jobs slice.
- Show a footer spinner while the next page fetches.
- Reset to page 1 when the filter (All / Unread / Saved / Dismissed) changes.

### 11. Error state

Today, if `jobApi.getAlerts` throws, the catch is empty and the screen looks identical to "no alerts." Add a real error state with a red icon, "Couldn't load alerts," and a Retry button.

### 12. Applications tab — stub it

Add the third segment ("Applications") but render a placeholder: "Application status alerts are coming soon. Apply to a job to start tracking here." Once the Search prompt's apply-tracking work ships, this tab populates from a future endpoint. Don't build it out here — just leave the slot so users see it's planned.

## Conventions

- Match the existing palette: `#0A1628` background, `#1B2B4B` cards, `#00B4D8` accent, amber `#F5A524` warnings, red `#FF4757` destructive, Ionicons icons.
- No new state libs — Redux Toolkit only. Extend the existing jobs slice or split a `savedSearches` slice if it gets noisy.
- Replace `any` types on new code with real interfaces. Add `mobile/src/types/alert.ts` covering JobAlert, MatchBreakdown, SavedSearch, AlertFrequency.
- Keep `AlertsScreen.tsx` readable. If it grows past ~500 lines, split into `AlertsHeader`, `AlertCard`, `SavedSearchRow`, `MatchBreakdown`, `NewAlertSheet`, `AlertsEmptyState` under `mobile/src/screens/jobs/components/`.
- All mutating interactions are optimistic with revert-on-failure. Mark-as-read, mark-all-as-read, save, dismiss, delete saved search — same pattern.
- All dates as ISO; durations as the existing "X days ago" formatter (extract to `mobile/src/utils/relativeTime.ts` if not already shared).

## Deliverables

1. Backend-support table at the top of your reply.
2. The modified and new files.
3. The proposed Prisma migration + new route signatures for anything that needed backend work (per-criterion match breakdown, `SavedSearch` CRUD, `dismissedAt` on alerts, bulk mark-read, paginated alerts list, push payload schema).
4. A short summary at the end: what shipped end-to-end, what's stubbed pending backend work, and anything you deliberately deferred (e.g. Applications tab content, alert-rule pause behavior) with rationale.

Do not start writing UI until you've read the alert model, the matching service, and the existing routes. The goal is to wire the client to what the server supports today wherever possible and only propose schema changes where the user-facing win is clear.
