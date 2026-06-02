# Contributing — CockpitHire

## ⚠ Database Safety Rules (Non-Negotiable)

### NEVER use `--force-reset` or `--accept-data-loss` against production

These commands wipe all data or silently discard schema changes:

```
# FORBIDDEN — destroys all rows
npx prisma db push --force-reset

# FORBIDDEN — silently drops columns/tables to force schema alignment
npx prisma db push --accept-data-loss
```

On 2026-06-02 a `--force-reset` was run against the production Railway database,
wiping all pilot accounts, flight logs, alerts, and data. This happened because
`prisma db push` was used instead of migrations.

**We will not repeat this.**

---

## Schema Change Workflow

### 1. Before ANY schema change — propose first

Post a message stating:

> "This migration is **additive** (safe) — adds X column/table, no data at risk."
>
> or
>
> "This migration is **destructive** — drops/renames column Y. Backup required."

Wait for explicit approval before touching the schema.

### 2. For destructive migrations — backup first

```bash
node backend/scripts/backup-db.js
```

Output goes to `backend/backups/YYYY-MM-DD-HHMMSS.sql` (git-ignored).
Run this and confirm the file exists before proceeding.

### 3. Create the migration locally

```bash
# In backend/
npx prisma migrate dev --name describe_the_change
```

This creates a file under `prisma/migrations/`. Commit it.

> **Do NOT use `prisma db push` for schema changes after initial setup.**
> `db push` is prototype-only; it has no history and can silently destroy data.

### 4. Deploy applies it automatically

The Railway start command is:

```
npx prisma generate && npx prisma migrate deploy && node src/app.js
```

`migrate deploy` applies only pending migrations — it is safe to run on production
because it never rolls back, never drops data, and is idempotent.

---

## Migration Quick Reference

| Situation | Command |
|---|---|
| New feature, additive schema change | `npx prisma migrate dev --name add_X` |
| Destructive change (backup first!) | `npx prisma migrate dev --name drop_X` |
| Production deploy | `npx prisma migrate deploy` (automatic via Railway) |
| Check migration status | `npx prisma migrate status` |
| Restore from backup | `psql $DATABASE_URL < backups/TIMESTAMP.sql` |

---

## Scripts Safety Header

Every script that touches the database directly must start with:

```js
/**
 * ⚠ DATABASE SAFETY
 * DO NOT use --force-reset. Use prisma migrate dev for development
 * and prisma migrate deploy for production.
 * Force-reset wipes ALL data with no recovery path.
 * Run backup-db.js before any destructive operation.
 */
```
