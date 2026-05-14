# Step 1 of 5: Get the backend running with migrations applied

Paste this into Claude Code in VS Code at the repo root (`pilot-jobs/`). This is an operational prompt — you'll be running shell commands, not writing features. Assumes the `JOB_INGESTION_PROMPT.md` work has already shipped (so there are new Prisma fields to migrate).

---

Goal: by the end of this session, I should have the backend running locally on port 3000, with the Postgres database connected, all Prisma migrations applied (including the new fields from the ingestion work — `sourcePlatform`, `externalId`, `inactive`, attribution fields, etc.), and the auth endpoints responding to curl. If anything blocks that, stop and report exactly what's blocking so I can fix it myself.

Work through these in order and confirm each one before moving to the next.

## 0. Read these first

- `backend/.env.example` — see what env vars are expected
- `backend/.env` — if it exists, read it; if not, we'll create it
- `backend/prisma/schema.prisma` — confirm the new ingestion fields exist (`sourcePlatform`, `externalId`, `inactive` or `status`, `sourceUrl`, etc.). If they don't, the ingestion prompt didn't produce a migration — stop and tell me.
- `backend/package.json` — see what scripts and deps are there

## 1. Database

Check whether Postgres is reachable. Try in this order:

1. `psql --version` to confirm psql is installed.
2. If a `docker ps` shows a Postgres container, use that connection string.
3. Otherwise, propose starting one with:
   ```bash
   docker run -d --name pilotjobs-db -p 5432:5432 \
     -e POSTGRES_PASSWORD=devpass \
     -e POSTGRES_DB=pilotjobs \
     postgres:16
   ```
   Then wait for it to be ready (`pg_isready` or a 2-second sleep).

Don't run that docker command without asking me first — print it and wait for me to confirm.

## 2. Environment file

If `backend/.env` doesn't exist, create it from `.env.example` and fill in:

- `DATABASE_URL` matching the database from step 1 (e.g. `postgresql://postgres:devpass@localhost:5432/pilotjobs?schema=public`)
- `JWT_SECRET` — generate with `openssl rand -base64 48` and paste
- `PORT=3000`
- `NODE_ENV=development`
- `CONTACT_EMAIL=mohamed.alaa.azim@icloud.com` (the ingestion HTTP layer reads this)
- Leave Firebase / SMTP / external-API vars empty for now — they're not required for backend boot

Don't overwrite an existing `.env` without asking. If one exists and is missing keys we need, just append the missing ones.

## 3. Install + generate

From `backend/`:

```bash
npm install
npx prisma generate
```

Report any install errors verbatim. If `prisma generate` fails because of a schema problem, stop and show me the error.

## 4. Apply migrations

```bash
npx prisma migrate deploy
```

If there are pending migrations from the ingestion prompt, this should apply them. If `migrate deploy` errors because the migration files aren't checked in (only schema changed), instead run:

```bash
npx prisma migrate dev --name ingestion_fields
```

…and report the migration name and what it added.

After migrations, list the `Job` table columns so I can confirm the new fields landed:

```bash
npx prisma db execute --stdin <<'SQL'
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Job' ORDER BY ordinal_position;
SQL
```

## 5. Start the server

```bash
npm run dev
```

(or `npm start` if `dev` isn't defined). Confirm it's listening on port 3000. If it crashes on start, paste the full stack trace.

## 6. Smoke-test the auth routes

In a separate terminal (the server stays running in the first one), run these and report the response status + body for each:

```bash
# Health check (if a health route exists — try /api/health and / )
curl -i http://localhost:3000/api/health || curl -i http://localhost:3000/

# Register
curl -i -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Test","lastName":"Pilot","email":"smoke@test.com","password":"hunter22test"}'

# Login (use the email above)
curl -i -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"smoke@test.com","password":"hunter22test"}'

# Me (use the token from login)
curl -i http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <PASTE_TOKEN>"
```

All three of register, login, me must return 200 with JSON containing `token` and `pilot` (for register/login) or the pilot object (for me). If any returns something different, stop and show me.

## 7. Report

When all of the above passes, reply with:

- Confirmed: backend is running on port 3000
- Postgres connection string used (with password redacted)
- Migrations applied (names)
- New ingestion fields confirmed on the `Job` table (list them)
- Smoke-test results: register / login / me all 200
- The bearer token from the smoke-test login (I'll use it for the next step)

If anything failed, just report which step failed and the exact error. Don't try to "fix" infrastructure problems silently — surface them and let me decide.
