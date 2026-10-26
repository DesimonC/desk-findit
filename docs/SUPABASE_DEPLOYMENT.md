# Find It Supabase cutover

## Current status

This branch prepares the migration. The hosted Find It project
`rqbwdxsxxqnyqigikrht` is not accessible through the connected Supabase account.
No hosted database, bucket, Edge Function or deployment has been changed.
`js/config.js` therefore keeps `backend: "apps-script"`. Do not change this until
the live checks below pass. `?backend=supabase` opts a test browser into the new
transport without affecting other visitors.

## Deployment order

1. Connect Supabase using the account/organisation containing the Find It project,
   or grant that account access to this project. Do not use another app's project.
2. Inspect the existing `public` schema and Storage buckets before applying
   `supabase/schema.sql`. It creates a dedicated game table and private photo
   bucket; it deliberately fails on conflicting names rather than overwriting.
   After testing against the project, generate a migration using the current
   Supabase CLI workflow and commit it. The bootstrap is not an applied migration.
3. Deploy `supabase/functions/findit-api/index.mjs` and its relative `game.mjs`.
   The function name is `findit-api`. Its config uses `verify_jwt = false` because
   the handler authenticates random per-game bearer tokens itself. Create and
   join are guest entry points. It does not use email signup or leave Auth users.
4. Check the function has its default server-only `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`. Never put the service key in frontend code or Git.
   Generate a separate random `FINDIT_CLEANUP_SECRET` in the function environment.
   Set the same value as the GitHub repository secret `FINDIT_CLEANUP_SECRET`.
5. Enable the hourly cleanup workflow after deployment, and run it manually once.
   An abandoned game expires after 24 hours; the next hourly sweep deletes its
   live records and all objects in its private game folder. GitHub schedules can
   be delayed and require monitoring. Hosting another game does not extend expiry.
6. Run the checks below against the live project; inspect Supabase security and
   performance advisors. No browser role should have access to the game table or
   photo bucket directly. Inspect existing policies too: policies are additive.
7. Set `backend: "supabase"`, publish, and test on actual Android and iPhone devices.
   Only then remove the legacy transport, old `apps-script/` source and retired
   deployment. Existing legacy games are not imported into Supabase.

## Architecture and game rules

- A row stores the bounded state of a game (maximum 20 players, 10 challenges).
  Compressed photos are separate objects, never stored in the game JSON.
- RLS is enabled. Public/anonymous/authenticated clients have no direct table
  grants or policies. The Edge Function alone uses service-role access.
- A browser generates a 256-bit player capability; only its SHA-256 hash is
  stored server-side. Every game action checks the capability and player ID.
  Host flags from requests are ignored. Joining an existing name cannot steal it.
- Game codes have six characters. A code is an invitation, not host authority.
- Compare-and-swap updates on the version column serialize concurrent changes.
  Failed updates retry against fresh state rather than overwriting other players.
- Finished players enter the voting waiting room. The last submission or pass
  opens voting for everyone automatically.
- Each player votes once per contested challenge, with one self-vote in the normal
  round. Empty and single-photo categories do not require a vote.
- The individual photo with the most normal votes overall wins. Tied photos go
  into exactly one final vote. Everyone may select any tied photo in that round.
  A remaining tie is resolved by the first accepted upload, using server-stored
  upload order (which also resolves matching timestamps).
- Photos are anonymous during voting and have temporary five-minute signed URLs.
  Possession of a signed URL permits access until expiry or object deletion.
- The host closes the results to remove every photo and the entire game row.
  No winner archive remains. Other players return to the loading screen on their
  next poll. A player who leaves early only clears their own tab; the host or
  expiry sweep closes the shared game. Ordinary Supabase backup/log retention is
  outside application deletion; do not claim forensic erasure from provider backups.
- The frontend clears its tab session, cached results and displayed photos when
  returning to the two-second loading screen. Original photos on phones remain
  under the player's control.
- No lobby advertising integration is included in this migration.

## Validation

Local automated checks:

```sh
node --test tests/game.test.mjs
# Install the exact Playwright version and browser recorded in package-lock.json:
npm ci
npx playwright install chromium
npm run test:browser
```

The game and browser tests use a memory adapter and do not prove hosted RLS,
Storage permissions or Edge deployment health. Before cutover, test against the
actual project:

- Host and join from two devices; confirm six-character codes and player counts.
- Try a guessed player ID with another player's token: it must fail.
- Finish one player early, observe waiting-room progress, then finish the other.
- Submit votes creating a tie; verify final vote and earliest-upload fallback.
- Close the game and query the table and Storage listing: both must be empty for
  that game. Repeat after expiry, failed uploads and a simulated lost response.
- Request the Data API and private bucket with only the publishable key: neither
  may return private game data or photos.
- Confirm host deletion resets both players and permits another complete game.
- Test camera capture on real iPhone and Android hardware.

Follow Supabase docs for [function authentication](https://supabase.com/docs/guides/functions/auth),
[private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals),
and [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
