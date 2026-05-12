# Prompt: Expand the Profile screen with pilot-relevant fields

Paste this into Claude in VS Code at the repo root (`pilot-jobs/`).

---

We're extending the Profile page in our React Native / Expo pilot-jobs app. The codebase has both `mobile/` (RN + Redux Toolkit + axios) and `backend/` (Node + Prisma). Before writing any UI, read these files end-to-end:

- `mobile/src/screens/profile/ProfileScreen.tsx` — the screen you'll be modifying
- `mobile/src/services/api.ts` — current `profileApi` surface
- `backend/prisma/schema.prisma` — to see what fields/models already exist on `User`, `Certificate`, `Medical`, `Rating`, and any related tables
- `backend/src/routes/profile.js` and the matching controller(s) — to see what payloads each endpoint accepts and what validation runs
- `backend/src/services/matchingService.js` — to understand which profile fields actually drive job matching, so we prioritize correctly

## What to build

Add three groups of new inputs to `ProfileScreen.tsx`. For every field below, **first check if the backend schema and route support it**. Produce a short table at the start of your reply listing each new field as either "backend ready", "backend partial (explain)", or "needs backend work (propose migration + route change)". Don't write UI for fields that need backend work without flagging them — when in doubt, scaffold the UI behind a `// TODO: backend` comment and call it out in your summary.

### 1. Flight experience + richer licences and type ratings

New section "Flight Experience" with editable numeric fields:

- Total flight time (hours)
- PIC hours
- SIC hours
- Multi-engine hours
- Turbine / jet hours
- Night hours
- Instrument (actual) hours
- Cross-country hours

Also: call `profileApi.getTotals()` on mount and display the computed totals from the logbook alongside the editable fields (so the user can see "your logbook says X, your declared total is Y"). The endpoint already exists in `api.ts` but is never called — wire it up.

Move "Hours on Type" off the top-level personal form and onto each Type Rating row instead (a single global number doesn't make sense — it should be per aircraft).

Extend the **Add Licence** form with:
- Licence number (free text)
- Issue date and expiry date (use a real date picker — see bug fix below)
- ICAO English Language Proficiency level (picker: 4, 5, 6)
- Endorsements (multi-select chips: Complex, High-altitude, Tailwheel, Night, IFR)

Extend the **Add Type Rating** form with:
- Hours on type (numeric)
- Capacity (picker: PIC, SIC, PIC + SIC)
- Last proficiency check date + expiry
- Replace the hardcoded `category: 'Multi-Engine'` with a real picker: Single-Engine / Multi-Engine / Helicopter / Glider / Seaplane

### 2. Documents, right-to-work, recurrent training

New section "Documents & Right to Work":
- Passport: number, issuing country, expiry date
- Right-to-work entries (list, add/remove like certificates): region (EU / USA / UAE / UK / Canada / Australia / Other) + status (Citizen / Permanent resident / Work visa / No right to work) + expiry (optional)
- Resume / CV: PDF upload via `expo-document-picker`, store filename + uploaded date, allow replace/delete
- Profile photo: upload via `expo-image-picker`, replace the initials avatar in the header when present

New section "Recurrent Training & Checks" (list pattern, like medicals):
- Check type (picker: OPC / Line Check / CRM / Dangerous Goods / SEP / Base Check)
- Last completed date
- Expiry date
- Show expired entries in red the same way medicals already do

### 3. Personal basics + date-picker bug fix

Add to the existing "Personal Information" form:
- Date of birth (date picker)
- Nationality (multi-select — pilots often hold dual)
- Emergency contact: name, relationship, phone

**Bug fix:** the existing `AddMedicalForm` parses dates from free-text like `01/06/2025`, which silently fails on bad input. Replace both date inputs there — and use the same component for every new date field above — with `@react-native-community/datetimepicker`. Add it to `package.json` and use the Expo-recommended import pattern. Make sure dates are sent to the backend as ISO strings (the current medical form already does this).

## Conventions to follow

- Match the existing visual language: `#0A1628` background, `#1B2B4B` cards, `#00B4D8` accent, `Ionicons` icons, the `SectionCard` / `ItemRow` / `AddXxxForm` pattern already in the file.
- Don't introduce new state libraries — keep using local `useState` and the existing Redux slice for the user.
- Replace `any` types on new code with real interfaces. Define them next to where they're used, or in a new `mobile/src/types/profile.ts` if multiple files need them.
- Keep the file readable. If `ProfileScreen.tsx` grows past ~800 lines, split the four section forms (`AddLicenceForm`, `AddMedicalForm`, `AddRatingForm`, `AddTrainingForm`) into their own files under `mobile/src/screens/profile/forms/`.
- Add basic validation per field (required, numeric ranges for hours, expiry not in the past for new entries) and show inline error text, matching the existing `hoursOnType` invalid-border treatment.

## Deliverables

1. The backend-support table described above.
2. The modified files (and any new ones).
3. A short summary at the end listing: what you implemented, what's stubbed pending backend work (with the exact Prisma migration + route changes needed), and anything you intentionally skipped.

Do not start writing code until you've read the backend schema and routes — the goal is to wire the UI to what already exists wherever possible, not invent fields the server will reject.
