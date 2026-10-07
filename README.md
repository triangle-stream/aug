# 48 ore — treasure hunt

Cloudflare Worker + D1 + static mobile frontend for a 48-hour physical treasure hunt.

## Current flow

The game is deliberately sequential:

1. The birthday/date gate opens.
2. The entry answer starts the 48-hour session.
3. The current gift has a question.
4. A correct answer awards that step's points and reveals its location.
5. The player goes to the location and finds the physical gift.
6. A note inside the gift contains a word.
7. Entering the correct word marks that gift as found and unlocks the next question.
8. The final gift word completes the hunt. The final screen is intentionally a placeholder for the final reveal/action.

The player always sees:

- current score / maximum score;
- gifts found / total gifts;
- the current question or unlocked location;
- the inline map and walking route;
- the word input after a location has been revealed.

Points are derived from correctly answered steps rather than stored as a mutable counter, so retrying an already-completed answer cannot award points twice.

## Other features

- 48-hour authoritative countdown in D1.
- One active player browser session in an HttpOnly cookie.
- Server-side answer and gift-word verification.
- Attempt throttling for entry answers, questions, and gift words.
- Leaflet + OpenStreetMap map.
- Opt-in browser geolocation.
- Inline pedestrian routing using OpenStreetMap routing, with a direct-line fallback when routing is unavailable.
- Bidirectional player/admin chat.
- Notification sound for new incoming messages on both player and admin pages after the browser has received a user interaction.
- Optional one-time locker codes.
- Admin state/attempt view.

## Visual direction

The player page uses this supplied image as the main background:

`https://giordanom.sirv.com/Images/150226/comincia.jpg`

The UI intentionally avoids birthday-party and overtly romantic motifs. Controls sit on warm translucent neutral surfaces so the photograph remains the dominant source of colour. Patrick Hand is used only as a human/handwritten accent; ordinary UI text remains in DM Sans.

## Local setup

Requires Node.js 20+.

```bash
npm install
npm run db:reset
npm run dev
```

Open:

```text
http://localhost:8787
```

Admin:

```text
http://localhost:8787/admin.html
```

Local admin token:

```text
change-me-local-admin-token
```

### Existing local database

If you want to keep an existing local D1 state rather than reset it:

```bash
npm install
npm run db:migrate
npm run dev
```

Migration `0003_points_and_unlock_words.sql` adds the score and gift-word fields.

## Demo data

The sample birthday is configured in `seed.sql`.

Entry answer:

```text
stellina
```

Questions:

```text
1 → roma
2 → mare
3 → vinile
```

Words placed in the physical gift notes:

```text
gift 1 → nastro
gift 2 → lato b
gift 3 → ultima
```

Each demo question is worth 10 points, for a total score of 30.

## Database model

The original step completion fields remain for compatibility, with the current flow using:

- `steps.points`: score awarded for the correct question answer;
- `steps.completed_at`: question answered correctly / location revealed;
- `steps.unlock_word_hash`: server-side hash of the word in the physical note;
- `steps.word_verified_at`: physical gift word successfully entered;
- `steps.reward_acknowledged_at`: kept in sync for compatibility with older data;
- `game.completed_at`: set after the final gift word is verified.

The browser never receives answer hashes or gift-word hashes.

## Main API flow

```text
POST /api/activate
POST /api/steps/:id/answer
POST /api/steps/:id/word
GET  /api/status
```

Locker and chat endpoints remain available.

## Production notes

Before deploying:

1. Create/configure the real D1 database and set the production database ID.
2. Apply all migrations.
3. Replace the demo seed values with real questions, SHA-256 answer hashes, point values, coordinates, locker codes, and SHA-256 gift-word hashes.
4. Move `ADMIN_TOKEN` from Wrangler vars to a Worker secret.
5. Serve the final site over HTTPS; browser geolocation requires a secure context outside localhost.
6. For a production-scale routing workload, do not rely on a public community routing instance without reviewing its usage policy/capacity.

The current final screen is deliberately unfinished: it activates only after maximum progress has been reached and all gift words have been verified, leaving room for the actual final reveal.
