# Find It! · DesK Apps

Installable phone web app, rebuilt around a complete multiplayer photo hunt. The existing Find It logo appears for two seconds at opening and after a game closes.

## Game flow

1. Host or join. The host chooses 1–10 categories and can choose an unused six-character code or generate one. The host plays too. At least two players are required.
2. The lobby lists everyone who joined and shows the count. Only the host starts the game. Names are unique within a game; knowing a name cannot reclaim someone else's session.
3. Everyone receives the same randomly selected categories. Take or choose a photo, preview/retake, submit, or pass each category. Photos are converted to compressed JPEGs on the phone.
4. The host sees individual completion bars and a total ready count. Completed players enter the voting room. The backend opens voting only after every player has completed every category AND checked in visibly in that room within the last 30 seconds. A backgrounded player is marked away on their next check-in. Presence after an abrupt disconnect expires after 30 seconds.
5. One vote per contested category. Other photographers' names stay hidden until results. Each player has one self-vote for the entire game, including any final vote. Zero-photo categories are skipped; one-photo categories are uncontested.
6. The photo with most category votes overall wins. Tied photos receive exactly one final ballot. If that also ties, the first successfully received upload wins; append order settles identical server timestamps. Abstention is allowed only when no photo is eligible under the self-vote rule.
7. Reveal the category results, then the overall winning photo. Save/share the winner explicitly if desired.
8. Every player taps **Ready to finish & delete game** after receiving the finale. The last acknowledgement permanently deletes the game's Drive photo folder (including the winner) and all game/player/category-instance/entry/vote rows. No winner archive or latest-winner screen remains. Every connected player returns through the two-second logo screen to Host / Join.

## Deployment — update the game service and app together

The code is ready for a coordinated deployment; committing web files does **not** update Google's separately hosted Apps Script deployment. The configured URL in `js/config.js` is the existing service URL, not proof that version 3 is live. Version 2 cannot serve this client's version 3 actions.

1. Open the Find It Apps Script project attached to your game spreadsheet. End existing test games before replacing the service. A fresh spreadsheet is recommended for a clean version 3 start; this update does not automatically erase historical V1/V2 archives.
2. Replace the old `.gs` files with `apps-script/Code.gs`. Remove the old game `.gs` files from the script project so functions do not conflict; the rebuild uses just one backend source file. Show the manifest in project settings and replace `appsscript.json` with the supplied manifest.
3. Run **setupFindIt()** once as the script owner and authorise it. This prepares headings and default categories, creates the private temporary photo folder, installs one five-minute cleanup trigger, and tests permanent deletion using a disposable setup folder. If the deletion check reports a permission/API error, enable Google Drive API in the script's associated Cloud project, grant the supplied scopes and rerun setup. Do not deploy until setup succeeds.
4. Deploy → Manage deployments → Edit the existing web app → New version. Run as **you**, accessible to **Anyone**. Keeping the existing deployment retains its `/exec` URL. If you create a new deployment instead, update `apiUrl` in `js/config.js`.
5. Open the `/exec` URL to confirm the health response says **3.0.0**. Publish this branch's web files to Netlify only after the service is updated. `netlify.toml` publishes the repository root.
6. On iPhone, use Safari → Share → Add to Home Screen. On Android, use the browser's Install / Add to Home screen option. This is a PWA, not an Android AAB or iOS App Store package. Multiplayer play requires internet. Check actual camera, picker, save/share and reconnect behavior on both phones before release.

The static app shell/logo can be cached for installation; API calls, uploaded photos, ballots and results are never put in the service worker cache. The sole private session credential is stored in sessionStorage for refresh recovery in the current tab and removed at closure. Game photos stay in browser memory only. The old V2 localStorage session is removed. No advertising or payments are enabled; pricing remains undecided.

## Expiry and deletion failures

Normal completion waits for every player's explicit finish acknowledgement, so one player cannot remove the others' finale early. A finished game left open expires 15 minutes after results, with cleanup attempted on the next five-minute scheduled run. A game abandoned before results expires after 24 hours without visible player activity. Closing screens retry a failed deletion on the next sync; the scheduled task also retries. Failed deletions retain references instead of claiming success. The template category bank, empty table headings, root folder, deployment configuration and trigger remain; they contain no individual game records.

Deletion uses Drive's permanent DELETE endpoint, not Trash. It removes app-managed active records; Google may retain spreadsheet revision history/backups and browser/OS recovery is outside the app's control. Do not describe this as a forensic guarantee that no provider copy exists. Player-saved downloads, shares and copied invitation codes also remain outside the app. Existing historical V1/V2 archives require a separate, explicitly reviewed cleanup.

## Verification

```
npm ci
npm test
npm run check
```

Tests run the real Apps Script handlers against in-memory Sheets/Drive/locking adapters; they do not call or delete live Google files. Coverage includes lobby identity, presence, submit/pass handling, duplicate requests, one self-vote, overall ranking, final voting, upload order, isolated cleanup and failed-delete recovery. Real Google authorisation, deployment and phone-camera behavior require the deployment smoke test below.

### Two-phone smoke test

- Install/open on both phones: two-second existing logo, then Host / Join.
- Create a code, join on the second phone and verify player count/names. Start from the host.
- Submit on one phone and pass on the other. Confirm bars advance and the first finisher waits. Background the second phone before it enters the room: voting must stay locked. Bring it back to open voting.
- Play contested categories and try a second self-vote. Reload one phone mid-game and confirm its session recovers in that tab.
- Exercise the final ballot with tied photos. Confirm the winning image and save it.
- Tap Ready to finish on both. Verify no rows for the game remain in Games, Players, GameChallenges, Entries or Votes; its photo folder must be permanently absent, including the winner. Both screens must show the logo for two seconds and then a fresh lobby. Start a second game to check no old state leaks through.

## Files removed

The old separate frontend game/session/challenges/photo/voting/results modules and archived-winner UI were replaced by one screen controller, one HTTP client and one poller. The old backend modules were consolidated into one `Code.gs` file for simpler deployment. The original `DesimonC/Find-it` reference repository and its history are untouched.
