# Find It! by DesK Apps

Multiplayer photo hunt: **See it. Snap it. Win it.**

The existing Apps Script backend remains selected in `js/config.js` while the
Supabase replacement is staged. The target Find It project is
`rqbwdxsxxqnyqigikrht`; it must be accessible and deployed before cutover.
See [deployment status and checks](docs/SUPABASE_DEPLOYMENT.md).

## App

- Existing DesK Apps Find It logo on a two-second loading screen and at the top.
- Host/join lobby, photo challenges, progress, anonymous voting and results.
- Supabase preview: append `?backend=supabase` after the function is deployed.
- Supabase game states: `WAITING → PLAYING → VOTING → RUNOFF (if needed) → FINISHED`.
- Supabase rules: most-voted individual photo wins; one final tie-break vote;
  first accepted upload resolves a remaining tie. Host closure deletes the game
  and every game photo. Expiry cleanup requires the configured scheduled job.
- Legacy Apps Script retains its existing four-character codes, challenge-win
  scoring and winner archive until retired. The staged Supabase version uses
  six-character codes and does not retain winner records.

## Source

- `index.html`, `css/`, `js/`: static frontend and transport adapters.
- `supabase/functions/findit-api/`: game engine and authenticated guest API.
- `supabase/schema.sql`: proposed bootstrap, not applied to the hosted project.
- `apps-script/`, `js/legacy-api.js`: retained for the active legacy deployment.
- `tests/`: game-rule, request/authentication and two-browser flow checks.

## Development checks

```sh
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

The automated adapter is local test infrastructure. Live database, Storage,
security-advisor and real-phone checks remain required before release.
