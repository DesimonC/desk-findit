# Find It! V2

**See it. Snap it. Win it.**

A multiplayer photo-hunt game. The live app now uses Caroline's Supabase project for game state, scoring, and temporary photo storage.

## Game rules

- The host is also a player.
- Four-character game codes.
- The host chooses 1–10 challenges.
- No game timer.
- Each challenge is completed by `SUBMITTED` or `PASSED`.
- Voting is anonymous until results.
- One vote per player per contested challenge.
- Self-voting is limited to half of contested challenges, rounded down.
- Zero-photo challenges require no vote; single-photo challenges are uncontested.
- Ties create joint challenge and overall winners.
- At End Game, all game photos are deleted, including winners' photos. Text winner records remain and photo references are cleared.

## Supabase

- `supabase/migrations/20261121000000_findit_schema.sql` creates isolated `findit_*` tables, RLS, the private `findit-game-photos` bucket, and the version-checked state save function.
- `supabase/functions/findit-api/index.ts` implements the game API. The service role key stays in Edge Function environment variables; it is never sent to the browser.
- `js/config.js` points the app at the Supabase Edge Function.
- `js/api.js` is the browser HTTP client.
- Game photos are compressed in the browser, stored privately, and accessed through short-lived signed URLs.

## App files

- `index.html` - application screens
- `css/app.css` - responsive UI
- `js/session.js` - local player session
- `js/app.js` - screen navigation and central polling
- `js/game.js`, `js/challenges.js`, `js/photos.js`, `js/voting.js`, `js/results.js` - game flow and UI

The former Apps Script implementation remains under `apps-script/` as a reference. New games are created in Supabase; existing Apps Script games are not copied automatically.
