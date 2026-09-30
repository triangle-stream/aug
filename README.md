# Birthday Treasure Hunt — local MVP

A Cloudflare Worker + D1 + static frontend prototype for a 48-hour birthday treasure hunt.

## What is already implemented

- Birthday/date gate.
- Entry riddle with server-side answer verification.
- One active browser session stored in an HttpOnly cookie.
- 48-hour countdown started by the first successful entry answer.
- Sequential questions: only the current step can be answered.
- Rewards containing text and GPS coordinates.
- Locker codes revealed once. The server records `locker_revealed_at` and does not return the code again to the player.
- Simple attempt throttling.
- Admin page with progress/attempts and in-app messages.
- Local D1 database, using the same Worker APIs used in production.

## Local setup on macOS

Requires Node.js 20+.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open the URL printed by Wrangler, normally `http://localhost:8787`.

Admin page:

```text
http://localhost:8787/admin.html
```

The local admin token is currently:

```text
change-me-local-admin-token
```

### Demo answers

Entry: `stellina`

Step 1: `roma`

Step 2: `mare`

Step 3: `vinile`

The sample birthday is in `seed.sql`. Change it to a date in the past if you want to test immediately.

## Reset the local game

```bash
npm run db:reset
```

Wrangler persists local D1 state under `.wrangler/state`.

## Production notes

Before deploying:

1. Create the real D1 database with Wrangler.
2. Replace `local-placeholder` in `wrangler.jsonc` with the real database ID.
3. Apply migrations and seed/configure production data.
4. Do **not** keep the admin token in `vars`; move it to a Worker secret.
5. Replace demo questions, answer hashes, coordinates, and locker codes.
6. Put the site behind HTTPS on the final domain.

The current notification feature is deliberately an in-app inbox that the player polls every 15 seconds while the site is open. Real Android push notifications are best added as the next phase with a PWA service worker + Web Push subscription; that requires permission on her phone and some extra server-side push handling.

## Security model / caveats

This is meant to protect the surprise from casual access, not to be a banking system. Answers and locker codes never need to be sent to the browser until unlocked. A single successful entry creates a new active session hash, so activating from another device invalidates the previous player's session. All authoritative timing and progress live in D1 rather than localStorage.

For a physical locker code, the admin API deliberately still exposes the code to the admin. That gives you an emergency recovery path even after the player has used her one-time reveal.


## Mobile UI / map / chat update

The current UI is mobile-first and shows one game state at a time: question, then unlocked reward/map, then the next question after the player confirms the reward was found.

When a reward has coordinates, the page renders a Leaflet/OpenStreetMap map. Location tracking is opt-in and remains in the browser; the player's coordinates are not sent to the Worker or stored in D1. The map shows the live position, target, straight-line distance, and a link to external turn-by-turn directions.

The floating chat is bidirectional. Player messages use `/api/chat`; the admin panel at `/admin.html` uses `/api/admin/chat`. Both sides poll every five seconds in this local MVP.

After pulling this version over an existing local DB, run `npm run db:migrate`. For a clean demo with the seed data, `npm run db:reset` is simplest.
