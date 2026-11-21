# Find It! V2

**See it. Snap it. Win it.**

Clean V2 rebuild of Find It!, a multiplayer photo-hunt game.

## Authoritative game states

`WAITING -> PLAYING -> VOTING -> FINISHED`

UI activities such as opening a challenge or taking a photo are not server game states.

## Core rules

- Host is also a player.
- Six-character game codes.
- Host chooses 1-10 challenges; default 1.
- No game timer.
- Each challenge is completed by `SUBMITTED` or `PASSED`.
- Voting is anonymous until results.
- One vote per player per challenge requiring a vote.
- A player may vote for their own photos in up to half the categories with at least two submitted photos, rounded down. This rule takes effect after the updated Apps Script web app is deployed.
- Zero-photo challenges require no vote.
- Single-photo challenges are uncontested and require no vote.
- Ties create joint challenge/overall winners.
- When the host ends a finished game, winner records are retained but all game photos are removed, including winning photos; photo references are cleared.

## Structure

- `index.html` - all application screens
- `css/app.css` - responsive UI
- `js/config.js` - deployment configuration
- `js/api.js` - the only Apps Script HTTP client
- `js/session.js` - local player session
- `js/app.js` - the only screen/navigation controller and central polling
- `js/game.js` - create/join/lobby actions
- `apps-script/Main.gs` - JSON router
- `apps-script/Data.gs` - sheet/schema helpers
- `apps-script/Games.gs` - create/join/state foundation

Later V2 phases add challenges/photos, voting, results and cleanup without changing these ownership rules.
