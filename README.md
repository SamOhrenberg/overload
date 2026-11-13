<h1 align="center">Overload</h1>

<p align="center">
  <em>Every session, a little more.</em><br>
  A self-hosted, open-source workout tracker and progression assistant — a mobile-first PWA.
</p>

---

## What it is

**Overload** is a personal workout log that does more than remember what you did. After each session
you record exactly what you performed, and it tells you what to do **next time** to keep getting
stronger, going longer, and lasting more. The name is the principle: *progressive overload*.

## Features

- 📱 **Mobile-first PWA** — installs to the iPhone home screen, one-handed between sets, works offline.
- 🧠 **Progression assistant** — explainable, rule-based recommendations (double progression + RIR for
  strength/endurance, a 10%-cap model for cardio stamina, plus work-capacity progression) tuned to each
  exercise's goal.
- 🏆 **PRs, trends & deloads** — estimated-1RM tracking, stall detection, readiness scaling.
- 🔐 **Invite-only** — the first admin is created from environment variables; others join with a code.
- 🐳 **Self-hosted** — one app container + Postgres, drops into your existing Docker Compose.
- 🌐 **Flexible hosting** — serve the UI from your server, from GitHub Pages, or run it **local-only**
  with no backend (data stays on the device). Configurable API endpoint with health-probe failover
  handles split-DNS home networks.
- ⚙️ **Config via environment variables** — see [`.env.example`](./.env.example).

## Quick start (Docker Compose)

```bash
cp .env.example .env
# edit .env: set SESSION_SECRET, DB_PASSWORD, ADMIN_USERNAME, ADMIN_PASSWORD, ORIGIN
docker compose up -d
```

The app bootstraps the database, seeds a built-in exercise library, and creates the admin account on
first boot. Then sign in, open **Me → Invites** to create invite codes for anyone else.

## Tech stack

SvelteKit + TypeScript · PostgreSQL + Drizzle ORM · Tailwind CSS · Argon2id auth with cookie **or**
bearer-token sessions · Workbox service worker + IndexedDB offline outbox.

```
src/lib/server/engine/   the progression engine (pure, portable functions)
src/lib/server/services/ data services over the DB
src/routes/api/          JSON API
src/routes/(app)/        the installed app screens
```

## Configuration

Everything operational is an environment variable — no settings UI. See [`.env.example`](./.env.example)
for the full list (core, database, admin bootstrap, app behavior, cross-origin/CORS, optional AI coach).

## License

[MIT](./LICENSE) © 2025 Samuel Ohrenberg
