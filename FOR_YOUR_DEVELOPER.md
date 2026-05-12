# Instructions for the Developer
## PilotJobs App — Setup Guide

Hi! This document tells you exactly what needs to be done to get this app live.
The app owner is a pilot and will handle everything inside the app once it's running.

---

## What you're setting up

There are two parts:

1. **The backend** — a server that stores pilot profiles, job listings, and sends push notifications
2. **The mobile app** — React Native (Expo), to be published on iOS App Store and Google Play

---

## Step 1 — Create a free Firebase project (30 min)

1. Go to [firebase.google.com](https://firebase.google.com) and create a new project called "PilotJobs"
2. Enable **Cloud Messaging** (for push notifications)
3. Go to **Project Settings → Service Accounts → Generate new private key**
4. Save the downloaded JSON file — you'll need 3 values from it:
   - `project_id`
   - `client_email`
   - `private_key`

---

## Step 2 — Set up a database (20 min)

Use [Supabase](https://supabase.com) — it's free and has a PostgreSQL database.

1. Create a free account and a new project called "pilotjobs"
2. Once created, go to **Settings → Database** and copy the **Connection String (URI)**
   - It looks like: `postgresql://postgres:[password]@db.xxxx.supabase.co:5432/postgres`

---

## Step 3 — Deploy the backend server (30 min)

Use [Railway](https://railway.app) — easiest free option.

1. Create a free Railway account
2. Create a new project and choose **"Deploy from GitHub repo"**
   - Upload or push the `/backend` folder to a GitHub repo first
3. Add the following **Environment Variables** in Railway's dashboard:

```
DATABASE_URL          = [the Supabase connection string from Step 2]
JWT_SECRET            = [any long random string — e.g. generate one at random.org]
JWT_EXPIRES_IN        = 7d
PORT                  = 3000
FIREBASE_PROJECT_ID   = [from Firebase JSON]
FIREBASE_CLIENT_EMAIL = [from Firebase JSON]
FIREBASE_PRIVATE_KEY  = [from Firebase JSON — keep the \n characters]
SCRAPE_INTERVAL_HOURS = 6
```

4. After deploy, Railway gives you a public URL like `https://pilotjobs-production.up.railway.app`
5. Run the database migration by opening the Railway terminal and running:
   ```
   npx prisma migrate deploy
   ```

---

## Step 4 — Configure the mobile app (10 min)

1. Open the `/mobile` folder
2. Create a file called `.env` with this content:
   ```
   EXPO_PUBLIC_API_URL=https://your-railway-url.up.railway.app/api
   ```
   (Replace with the actual Railway URL from Step 3)

3. Open `mobile/app.json` and replace:
   - `"bundleIdentifier": "com.pilotjobs.app"` — change `pilotjobs` to something unique
   - `"package": "com.pilotjobs.app"` — same change

4. Add the `google-services.json` file (downloaded from Firebase → Project Settings → Android app) into the `/mobile` root folder

---

## Step 5 — Install dependencies and test (15 min)

```bash
# Backend
cd backend
npm install
npm run dev   # should say "Server running on port 3000"

# Mobile (in a separate terminal)
cd mobile
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app on your phone to test it.

---

## Step 6 — Publish to App Store & Play Store

Use [EAS Build](https://expo.dev/eas) (Expo's publishing service):

```bash
npm install -g eas-cli
eas login
eas build --platform all
```

- For iOS: you need an Apple Developer account ($99/year). Submit via `eas submit --platform ios`
- For Android: you need a Google Play Developer account ($25 one-time). Submit via `eas submit --platform android`

---

## Monthly costs after setup

| Service     | Cost          | What it's for                    |
|-------------|---------------|----------------------------------|
| Railway     | ~$5–10/month  | The backend server               |
| Supabase    | Free tier     | Database (upgrades if needed)    |
| Firebase    | Free tier     | Push notifications               |
| Apple Dev   | $99/year      | iOS App Store (if publishing)    |
| Google Play | $25 one-time  | Android Play Store (if pub.)     |

---

## That's it

Once deployed, the app owner only needs to:
- Download the app on their phone
- Create an account
- Fill in their pilot details
- Job alerts arrive automatically as push notifications

No maintenance needed from you after setup unless new features are added.

---

## Questions?

The codebase is at `/pilot-jobs/` and is fully documented.
Backend entry point: `backend/src/app.js`
Mobile entry point: `mobile/App.tsx`
