# Backend setup checklist for the pilot-jobs app

This is what the backend needs in place so the mobile app can register, sign in, and stay signed in. Hand this to whoever owns `pilot-jobs/backend/`.

---

## 1. Database

The backend uses Prisma. You need a Postgres instance reachable from wherever the API runs.

- Local dev: `docker run -d --name pilotjobs-db -p 5432:5432 -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=pilotjobs postgres:16`
- Hosted alternatives: Supabase, Neon, Railway, RDS. Free tier on any of them is fine.

Connection string format: `postgresql://USER:PASS@HOST:5432/DBNAME?schema=public`

## 2. Environment variables (`backend/.env`)

Copy `backend/.env.example` to `backend/.env` and fill in:

| Var | Required for auth? | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string from step 1 |
| `JWT_SECRET` | yes | Long random string. Generate with `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | recommended | e.g. `30d`. Mobile keeps the token in SecureStore until expiry |
| `PORT` | optional | Defaults to 3000. Mobile expects 3000 unless `EXPO_PUBLIC_API_URL` says otherwise |
| `NODE_ENV` | recommended | `development` locally, `production` deployed |
| `CORS_ORIGIN` | only if you add a web client | Mobile (React Native) doesn't enforce CORS |
| `FIREBASE_*` | no (skip for now) | Needed only when push notifications go live |
| `SMTP_*` / `RESEND_API_KEY` | no (skip for now) | Needed for email verification + password reset |

## 3. Migrations + seed

From `backend/`:

```bash
npm install
npx prisma generate
npx prisma migrate deploy        # or `migrate dev` while schema is still moving
npx prisma db seed               # if a seed exists; safe to skip otherwise
```

The `User` table must exist before register/login will work. Confirm with `npx prisma studio` and open the `User` model.

## 4. Run the server

```bash
npm run dev       # nodemon-style, hot reload
# or
npm start         # production-style
```

You should see something like `Listening on http://localhost:3000`. Hit `GET http://localhost:3000/api/health` (or whatever your health route is) to confirm it's reachable.

## 5. Auth route contract — must match the mobile exactly

The mobile app (`mobile/src/services/api.ts`) sends and expects the following. The backend must conform to this exactly, or login will silently fail (the app reads `data.token` and `data.pilot` — any other naming and Redux never sees them).

### Register

```
POST /api/auth/register
Content-Type: application/json

{
  "email": "alice@example.com",
  "password": "min-8-chars",
  "firstName": "Alice",
  "lastName": "Smith",
  "phone": "+971501234567",       // optional
  "country": "United Arab Emirates", // optional
  "city": "Dubai"                  // optional
}
```

Response 200:
```json
{
  "token": "<jwt>",
  "pilot": {
    "id": "...",
    "email": "...",
    "firstName": "...",
    "lastName": "...",
    "phone": "...",
    "country": "...",
    "city": "...",
    "createdAt": "..."
  }
}
```

Error 409 (duplicate email):
```json
{ "error": "An account with that email already exists." }
```

Error 400 (validation):
```json
{ "error": "<human-readable reason>" }
```

The mobile shows `err.response.data.error` verbatim in the Alert — write messages a pilot would understand.

### Login

```
POST /api/auth/login
{ "email": "...", "password": "..." }
```

Response 200: same `{ token, pilot }` shape as register.

Error 401:
```json
{ "error": "Invalid email or password." }
```

(Use 401 for both unknown email and wrong password — don't leak which one is wrong.)

### Current user

```
GET /api/auth/me
Authorization: Bearer <jwt>
```

Response 200: the pilot object (the `data` payload is passed directly into Redux as the `pilot`).

Error 401 if the token is missing, invalid, or expired. The mobile interceptor handles 401 by signing the user out.

### FCM token update (push notifications)

```
PATCH /api/auth/fcm-token
Authorization: Bearer <jwt>
{ "fcmToken": "<expo-push-token-or-null>" }
```

The mobile already calls this on launch when push permission is granted. Safe to accept and no-op for now if FCM isn't wired.

## 6. Password storage

Use bcrypt (cost 10–12) or argon2. Never store plaintext. On login, compare with `bcrypt.compare`. Common gotchas:

- Trim and lowercase the email before lookup AND on register; otherwise `Alice@example.com` and `alice@example.com` become two accounts.
- Don't reject passwords longer than N characters — bcrypt truncates at 72 bytes so cap input length at 72 before hashing.

## 7. JWT

- Sign with `JWT_SECRET`, HS256 is fine.
- Payload: at minimum `{ sub: user.id }`. Add `email` and `iat` if convenient.
- Set `expiresIn: process.env.JWT_EXPIRES_IN || '30d'`.
- The auth middleware in `backend/src/middleware/auth.js` reads `Authorization: Bearer <token>`, verifies, attaches `req.user`. Apply it to every route except `/auth/register`, `/auth/login`, and any health check.

## 8. Rate limiting (recommended before public release)

`express-rate-limit` on `/auth/login`: 5 attempts per email per 15 minutes, plus 20 per IP per 15 minutes. Without this, anyone can brute-force passwords.

## 9. Things to add before real users (not required to test sign-in)

- **Email verification.** Send a one-time link on register; gate certain actions until verified. Routes: `POST /auth/send-verification`, `GET /auth/verify?token=...`.
- **Forgot password.** Two routes: `POST /auth/forgot-password` (email a reset link), `POST /auth/reset-password` (consume token, set new password). The Login screen needs a "Forgot password?" link wired to these.
- **Session revocation.** Store a token version on the user (`tokenVersion`) and embed it in the JWT. Bump on password change / "sign out everywhere" so old tokens become invalid.
- **Audit log.** Record login attempts (success + failure) with IP and timestamp. Useful for support and security.

## 10. Smoke test before saying you're done

From your dev machine:

```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","email":"test@example.com","password":"hunter22"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"hunter22"}'

# Me (paste the token from above)
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

All three should return JSON with the exact shapes documented above. If they do, mobile sign-in will work.

## 11. Mobile network config (so the app can find your backend)

In `mobile/.env`, set `EXPO_PUBLIC_API_URL` so the simulator/device can reach your server:

- iOS simulator on same machine: `http://localhost:3000/api`
- Android emulator on same machine: `http://10.0.2.2:3000/api`
- Physical phone via Expo Go: your LAN IP, e.g. `http://192.168.1.42:3000/api` — phone must be on the same Wi-Fi
- From anywhere via tunnel: `ngrok http 3000` and use the public URL + `/api`

Restart `expo start` after editing `.env` — Expo only reads `EXPO_PUBLIC_*` at startup.
