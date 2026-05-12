# Prompt: Make logbook entry fast for working pilots

Paste this into Claude in VS Code at the repo root (`pilot-jobs/`).

---

We're overhauling the logbook flow in our React Native / Expo pilot-jobs app to make logging a flight feel like 15 seconds of tapping, not 2 minutes of typing. The codebase has both `mobile/` (RN + Redux Toolkit + axios) and `backend/` (Node + Prisma).

Before writing any UI, read these end-to-end:

- `mobile/src/screens/logbook/LogbookScreen.tsx` — list + totals + import
- `mobile/src/screens/logbook/AddLogScreen.tsx` — the entry form you'll rebuild
- `mobile/src/services/api.ts` — current `flightLogApi` and `profileApi` surface
- `mobile/src/store/index.ts` — the logbook slice (`setLogs`, `setTotals`, `addLog`, `removeLog`, and any update/edit action)
- `backend/prisma/schema.prisma` — `FlightLog` and `User` / `Rating` models
- `backend/src/controllers/flightLogController.js` and `backend/src/routes/flightLogs.js` — what the API accepts on create/update and what `/profile/totals` computes
- `backend/src/services/matchingService.js` if it touches logbook fields — so any new computed field stays consistent with what matching uses

Start your reply with a short table marking each new/changed field as **backend ready**, **backend partial (explain)**, or **needs backend work (propose migration + route change)**. Don't write UI for fields that need backend work without flagging them — scaffold those behind a `// TODO: backend` comment.

## What to build

### 1. Time-based hours entry (this is the headline change)

Replace the decimal `totalTime` text input with two time pickers:

- **Block off** (default: now, rounded to nearest 5 min)
- **Block on** (default: block-off + last-flight average, or +1h)

Auto-compute `totalTime` from the difference and display it as a read-only "Flight: 1h 45m (1.75)" line below the pickers. Recompute on every change.

Also auto-derive `nightTime`:
- Use the route's departure/arrival airports plus block times to compute the portion of the flight that fell between civil sunset and civil sunrise.
- Use a small inline solar calculator (NOAA formula is ~30 lines, no library needed) — don't pull a heavy dep.
- Show the derived value as the default but let the pilot override.

If the route's airports aren't known yet, fall back to the existing manual `nightTime` field with no derivation.

Keep PIC/SIC/Multi/Turbine/IMC as decimal fields but make them feel lighter — add `+15m / +30m / +1h` quick-add chips next to each.

### 2. Date picker

Replace the free-text `date` field with `@react-native-community/datetimepicker`, default to today, send ISO. Same component will be reused everywhere else in the app (the Profile work is also adopting it — see `PROFILE_ENHANCEMENT_PROMPT.md`).

### 3. Aircraft type + registration: remember and pre-fill

- Show the user's profile type ratings as tappable chips at the top of the Aircraft Type field. Selecting one fills the type, and if the rating has known characteristics, auto-checks the right flags (e.g. B737 → Multi-Engine + Turbine).
- Below those, show the last 5 aircraft types this user has logged (from the most recent flights in Redux or via a new `flightLogApi.recentAircraft()` endpoint — propose if missing).
- For registration: when the user picks a type, show the last 5 registrations they used for *that* type.
- Aircraft type input should `autoCapitalize="characters"` and trim whitespace.

### 4. Airport autocomplete

Ship `mobile/src/data/airports.json` (ICAO, IATA, name, lat, lon, tz — ~10K airports, can be a stripped-down public dataset). Build a lightweight `AirportPicker` component:

- Triggers a modal/sheet on focus.
- Filters as the user types 2+ chars across ICAO, IATA, and name.
- Shows results as rows: `OMDB · DXB — Dubai International`.
- Recently-used airports (last 8 from this user's logs) appear above the search results.
- Storing on the log entry: keep the existing `departure` / `arrival` codes; also stash lat/lon/tz on the log if backend supports it (for the night-time computation).

If the JSON is heavier than 1MB, lazy-load it only when the AirportPicker mounts.

### 5. Multi-leg duty-day entry

Below the form add a **"+ Add another leg"** button that:
- Keeps date and aircraft (type + registration) fixed.
- Adds a new collapsible leg card with fresh From/To/times/landings/IMC fields.
- The Save button creates multiple `FlightLog` rows in one request if the backend supports a bulk endpoint, otherwise sequentially with optimistic UI.
- Show a header total ("Duty day: 4 legs, 7h 12m, 5 landings") above the save button.

Propose a backend bulk-create route if one doesn't exist (`POST /flight-logs/bulk`).

### 6. Clone-a-flight

In `LogbookScreen`, add a swipe action (or long-press menu) on each `LogRow`:
- **Duplicate** — opens `AddLogScreen` pre-filled with that flight's data, date defaulted to today.
- **Reverse** — same but with `departure`/`arrival` swapped (for return legs).
- **Edit** — opens `AddLogScreen` in edit mode (see #7).
- **Delete** — what the trash icon does today.

Use `react-native-gesture-handler`'s Swipeable, which is already pulled in by react-navigation.

### 7. Edit existing logs + pagination

- `flightLogApi.update` exists but is never called. Tapping a `LogRow` should open `AddLogScreen` in edit mode (route param `logId`); the form pre-fills and Save calls `update` instead of `create`. Add the action to the Redux slice (`updateLog`).
- The FlatList currently fetches page 1 only — add `onEndReached` pagination using the existing `page` param on `flightLogApi.list`. Show a small footer spinner while fetching.

### 8. Smarter Totals + Currency card

Replace the current 4-tile `TotalsCard` with a two-row layout:

- **Top row — Lifetime**: Total · PIC · Multi · Turbine (what exists today).
- **Bottom row — Currency**: Last 30d hrs · Last 90d hrs · Landings (last 90d) · Days since last flight.

If `/profile/totals` doesn't return currency figures, propose extending it (a `getCurrency()` endpoint or new fields on the existing one). If extending the backend is out of scope for this pass, compute on the client from the logs that are already loaded, with a note in the summary.

Add a small "FAA passenger-carrying currency" badge when day landings in 90d ≥ 3, and a warning chip when < 3. Same logic with night landings for night currency. Make the legal-claim text generic ("3 landings in last 90 days" — not legal advice) to avoid jurisdictional issues.

### 9. Sanity-check sub-totals (warnings, not blockers)

On save, show inline warnings (don't block):
- `picTime + sicTime > totalTime` → "PIC + SIC exceeds total time"
- `nightTime > totalTime`, `instrumentTime > totalTime`, `multiEngineTime > totalTime`, `turbineTime > totalTime` → "X exceeds total time"
- `totalTime > 0` and `landingsDay + landingsNight === 0` → "No landings recorded"
- `totalTime > 18` → "Unusually long flight time — check entry"

Style them like the existing red-border treatment on invalid `hoursOnType` in Profile, but in amber (`#F5A524`) since they're warnings not errors.

### 10. Offline-tolerant save (ramp reliability)

Wrap `flightLogApi.create` / `update` in an outbox pattern:
- On save attempt, write the log to a local queue (use `expo-sqlite` if it's already a dep, otherwise `@react-native-async-storage/async-storage`).
- POST to the server; on success, drop from the queue and the user sees Saved.
- On failure (network/timeout), keep it in the queue and mark the row in the list with a small "pending sync" badge.
- Retry the queue on app foreground and on every successful API call elsewhere.
- Expose a "Sync now" action in the Logbook header that drains the queue.

### 11. Smaller cleanups

- `HoursField` is used for landings, which are integers, not hours. Create a `LandingsField` with `+ / −` steppers, default value 1.
- `LogbookScreen.fetchData` calls `flightLogApi.list()` and `flightLogApi.list(1)` — they're the same request. Remove the duplicate.
- Import dialog only supports ForeFlight and Logbook Pro; add LogTen Pro, MyFlightbook, and a generic CSV with a column-mapping screen if columns can't be auto-detected from the header row.
- Add a search box above the list (filter by aircraft type, registration, or airport code, debounced 250ms).

## Conventions to follow

- Match the existing visual language: `#0A1628` background, `#1B2B4B` cards, `#00B4D8` accent, amber `#F5A524` for warnings, red `#FF4757` for destructive, Ionicons for icons.
- Don't introduce new state libraries — keep using local `useState` and the existing Redux slice.
- Replace `any` types on new code with real interfaces. Add a `mobile/src/types/logbook.ts` and a `mobile/src/types/airport.ts` rather than scattering them.
- Keep `AddLogScreen.tsx` readable. If it grows past ~600 lines, extract sub-components (`BlockTimePicker`, `AirportPicker`, `AircraftPicker`, `LegCard`, `WarningList`) into `mobile/src/screens/logbook/components/`.
- Make the entire screen `KeyboardAvoidingView`-friendly so inputs stay visible above the keyboard on iOS.
- All new dates must be sent to the backend as ISO strings; all hours as numbers, not strings.

## Deliverables

1. The backend-support table at the top of your reply.
2. The modified and new files.
3. The proposed Prisma migration + new route signatures for anything that needed backend work (bulk create, currency totals, `recentAircraft`, etc.).
4. A short summary at the end: what shipped end-to-end, what's stubbed pending backend work, and anything you deliberately deferred and why.

Do not start writing UI until you've read the FlightLog schema and the create/update controller. The goal is to fit the UI to what the server already accepts wherever possible, and only propose schema changes where the entry-speed wins are clearly worth it.
