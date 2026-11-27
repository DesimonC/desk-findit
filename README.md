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
- When the host closes a finished game, all game photos and active game data are deleted, including winner records. Results stay visible until the host closes the game.
- New players join with the game code or host invitation while the lobby is waiting. Each player receives a private rejoin link with an unguessable token; keep it private. Reopening it restores that player even after the game starts.
- During voting, any player can privately report a photo for a possible Photo Safety Agreement breach. The host reviews reports in the voting screen and can remove the photo, dismiss the report, warn the player, or block them from the current game before revealing results.
- Warnings appear in the player's active game or on their next private-link visit. A blocked player cannot rejoin the match; their private link displays the block notice. Blocking removes their photos and votes from the active game.

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
