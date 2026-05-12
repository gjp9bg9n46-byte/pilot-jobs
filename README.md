# PilotJobs

Pilot job matching app with flight logbook — iOS & Android.

## Structure

```
pilot-jobs/
├── backend/     Node.js + Express + PostgreSQL API
└── mobile/      React Native (Expo) app
```

## Backend Setup

```bash
cd backend
cp .env.example .env        # fill in your values
npm install
npx prisma migrate dev       # creates the DB schema
npm run dev
```

**Required env vars:**
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — any long random string
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — from Firebase Console → Project Settings → Service Accounts

## Mobile Setup

```bash
cd mobile
npm install
npx expo start
```

Set `EXPO_PUBLIC_API_URL` in a `.env` file to point at your backend (e.g. `http://192.168.x.x:3000/api` on local network).

## Features

### Job Matching
- Scrapes AviationJobSearch & PilotCareerCentre every 6 hours
- Extracts requirements: authority (FAA/EASA/GCAA/…), certificate type, minimum hours (total/PIC/multi-engine/turbine/instrument), aircraft type ratings, medical class
- Scores each pilot 0–100 against every active job
- Push notification sent via FCM when match score ≥ 60%

### Flight Logbook
- Manual entry with full ICAO fields
- CSV import from **ForeFlight** and **Logbook Pro**
- Running totals: total, PIC, SIC, multi-engine, turbine, instrument, night

### Pilot Profile
- Certificates (ATP/CPL/PPL/…) with issuing authority
- Type ratings with authority
- Medical certificates (Class 1/2/3) with expiry tracking
- Willingness to relocate flag

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | Register |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Current user |
| GET | /api/profile | Full profile |
| PATCH | /api/profile | Update info |
| POST | /api/profile/certificates | Add certificate |
| POST | /api/profile/ratings | Add type rating |
| POST | /api/profile/medicals | Add medical |
| GET | /api/profile/totals | Flight hour totals |
| GET | /api/flight-logs | Paginated logs |
| POST | /api/flight-logs | Add manual log |
| POST | /api/flight-logs/import | Import CSV logbook |
| GET | /api/jobs | Browse jobs |
| GET | /api/jobs/alerts | My matched job alerts |
| PATCH | /api/jobs/alerts/:id/read | Mark alert read |
