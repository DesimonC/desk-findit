/* Find It! 3.0.0 — complete game service. Run setupFindIt() before deployment. */

// Data
/* Temporary game records only. Player IDs are private bearer credentials. */
const FINDIT_SHEETS = Object.freeze({
  Games: [
    'GameCode',
    'HostPlayerId',
    'Status',
    'ChallengeCount',
    'CreatedAt',
    'StartedAt',
    'VotingStartedAt',
    'FinishedAt',
    'EndedEarly',
    'RequestId',
    'ActivityAt',
    'Finalists',
    'WinnerEntryId',
    'PhotoFolderId',
  ],
  Players: [
    'PlayerId',
    'GameCode',
    'Name',
    'IsHost',
    'JoinedAt',
    'RequestId',
    'LastSeenAt',
    'Visible',
    'Ready',
    'ResultSeen',
    'Closed',
  ],
  Challenges: ['ChallengeId', 'Name', 'Description', 'Active'],
  GameChallenges: ['GameCode', 'ChallengeId', 'ChallengeNumber', 'Name', 'Description'],
  Entries: [
    'EntryId',
    'GameCode',
    'PlayerId',
    'ChallengeId',
    'ChallengeNumber',
    'Status',
    'PhotoReference',
    'SubmittedAt',
  ],
  Votes: [
    'VoteId',
    'GameCode',
    'ChallengeId',
    'VoterPlayerId',
    'EntryId',
    'PhotoOwnerPlayerId',
    'IsSelfVote',
    'VotedAt',
  ],
});
const PRESENT_MS = 30000;
function getFindItSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('FINDIT_SPREADSHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
function ensureFindItSheets() {
  const ss = getFindItSpreadsheet_();
  if (!ss) throw apiError_('SETUP_REQUIRED', 'Bind this script to the Find It spreadsheet.');
  PropertiesService.getScriptProperties().setProperty('FINDIT_SPREADSHEET_ID', ss.getId());
  Object.keys(FINDIT_SHEETS).forEach((name) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name),
      headers = FINDIT_SHEETS[name],
      old = sh.getLastRow()
        ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String)
        : [];
    if (old.some((h, i) => h !== headers[i]))
      throw apiError_(
        'SCHEMA_MISMATCH',
        'Incompatible headings in ' + name + '. Use a fresh spreadsheet for version 3.',
      );
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  });
  return { version: '3.0.0' };
}
function seedFindItChallenges() {
  ensureFindItSheets();
  if (rowsAsObjects_('Challenges').length) return;
  const items = [
    ['Something Red', 'Find something mainly red.'],
    ['Something Tiny', 'Find something surprisingly small.'],
    ['A Reflection', 'Capture an interesting reflection.'],
    ['Something Old', 'Find something old or historic.'],
    ['A Funny Sign', 'Find a sign that makes you smile.'],
    ['Something Round', 'Find something circular or spherical.'],
    ['Nature Close-Up', 'Photograph something natural up close.'],
    ['Something Blue', 'Find something mainly blue.'],
    ['An Unusual Angle', 'Make an everyday object look different.'],
    ['Something With Numbers', 'Find numbers around you.'],
    ['A Pattern', 'Capture a repeated pattern.'],
    ['Something Shiny', 'Find something that catches the light.'],
  ];
  items.forEach((c, i) =>
    appendObject_('Challenges', {
      ChallengeId: 'C' + (i + 1),
      Name: c[0],
      Description: c[1],
      Active: true,
    }),
  );
}
function sheet_(name) {
  const s = getFindItSpreadsheet_().getSheetByName(name);
  if (!s) throw apiError_('SETUP_REQUIRED', 'Run setupFindIt() first.');
  return s;
}
function rowsAsObjects_(name) {
  const v = sheet_(name).getDataRange().getValues();
  return v.slice(1).map((r, i) => {
    const o = { _row: i + 2 };
    v[0].forEach((h, j) => (o[h] = r[j]));
    return o;
  });
}
function appendObject_(name, obj) {
  sheet_(name).appendRow(FINDIT_SHEETS[name].map((h) => (obj[h] === undefined ? '' : obj[h])));
}
function updateObjectRow_(name, row, changes) {
  const sh = sheet_(name),
    h = FINDIT_SHEETS[name],
    v = sh.getRange(row, 1, 1, h.length).getValues()[0];
  h.forEach((k, i) => {
    if (Object.prototype.hasOwnProperty.call(changes, k)) v[i] = changes[k];
  });
  sh.getRange(row, 1, 1, h.length).setValues([v]);
}
function findOne_(name, predicate) {
  return rowsAsObjects_(name).find(predicate) || null;
}
function gameRows_(name, code) {
  return rowsAsObjects_(name).filter((r) => String(r.GameCode) === code);
}
function deleteGameRows_(name, code) {
  gameRows_(name, code)
    .map((r) => r._row)
    .sort((a, b) => b - a)
    .forEach((r) => sheet_(name).deleteRow(r));
}
function id_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '');
}
function bool_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}
function millis_(v) {
  return v ? new Date(v).getTime() : 0;
}
function normalizeCode_(v) {
  return String(v || '')
    .trim()
    .toUpperCase();
}
function findGame_(code) {
  return findOne_('Games', (g) => String(g.GameCode) === code);
}
function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
function shuffle_(a) {
  const c = a.slice();
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}
function requireSession_(data) {
  const code = normalizeCode_(data.gameCode),
    game = findGame_(code);
  if (!game) throw apiError_('GAME_NOT_FOUND', 'This game has closed.');
  const player = findOne_(
    'Players',
    (p) => String(p.GameCode) === code && String(p.PlayerId) === String(data.playerId || ''),
  );
  if (!player) throw apiError_('SESSION_INVALID', 'Your game session is no longer available.');
  return { game, player, code };
}
function requireHost_(s) {
  if (String(s.game.HostPlayerId) !== String(s.player.PlayerId))
    throw apiError_('HOST_ONLY', 'Only the host can do that.');
}
function publicGame_(g) {
  return {
    gameCode: String(g.GameCode),
    status: String(g.Status),
    challengeCount: Number(g.ChallengeCount),
  };
}
function publicPlayer_(p) {
  return {
    playerId: String(p.PlayerId),
    name: String(p.Name),
    isHost: bool_(p.IsHost),
    gameCode: String(p.GameCode),
    closed: bool_(p.Closed),
  };
}
function apiError_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// Main
/* Credentials and photos only travel in POST bodies, never URLs or logs. */
function doGet() {
  return jsonOutput_({ ok: true, data: { version: '3.0.0', status: 'ok' } });
}
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents)
      throw apiError_('INVALID_REQUEST', 'A JSON request body is required.');
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (_) {
      throw apiError_('INVALID_JSON', 'Invalid JSON.');
    }
    const routes = {
      createGame: createGameV3,
      joinGame: joinGameV3,
      startGame: startGameV3,
      sync: syncGameV3,
      submitPhoto: submitPhotoV3,
      passChallenge: passChallengeV3,
      getBallot: getBallotV3,
      castVote: castVoteV3,
      getResults: getResultsV3,
      acknowledgeResults: acknowledgeResultsV3,
      closeGame: closeGameV3,
    };
    if (!data || !Object.prototype.hasOwnProperty.call(routes, data.action))
      throw apiError_('UNKNOWN_ACTION', 'Unknown action.');
    return jsonOutput_({ ok: true, data: routes[data.action](data) });
  } catch (e) {
    return jsonOutput_({
      ok: false,
      error: {
        code: e.code || 'SERVER_ERROR',
        message: e.code
          ? e.message
          : 'The game service could not complete this request. Please retry.',
      },
    });
  }
}
function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

// Games
function validateName_(value) {
  const s = String(value || '').trim();
  if (!s || s.length > 30 || /^[=+@\-]/.test(s))
    throw apiError_(
      'INVALID_NAME',
      'Enter a name of 1–30 characters, starting with a letter or number.',
    );
  return s;
}
function requestId_(data) {
  const id = String(data.requestId || '');
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id))
    throw apiError_('INVALID_REQUEST_ID', 'Please reopen the setup form and try again.');
  return id;
}
function uniqueGameCode_() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let n = 0; n < 200; n++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += a[Math.floor(Math.random() * a.length)];
    if (!findGame_(code)) return code;
  }
  throw apiError_('CODE_UNAVAILABLE', 'Please try another code.');
}
function createGameV3(data) {
  return locked_(() => {
    const name = validateName_(data.hostName),
      request = requestId_(data),
      retry = findOne_('Games', (g) => String(g.RequestId) === request);
    if (retry) {
      const p = findOne_('Players', (p) => String(p.PlayerId) === String(retry.HostPlayerId));
      return { game: publicGame_(retry), player: publicPlayer_(p) };
    }
    const count = Number(data.challengeCount);
    if (!Number.isInteger(count) || count < 1 || count > 10)
      throw apiError_('INVALID_COUNT', 'Choose 1–10 categories.');
    const active = rowsAsObjects_('Challenges').filter(
      (c) => bool_(c.Active) && c.ChallengeId && c.Name,
    );
    if (active.length < count)
      throw apiError_('NOT_ENOUGH_CATEGORIES', 'There are not enough categories. Check setup.');
    const code = data.gameCode ? normalizeCode_(data.gameCode) : uniqueGameCode_();
    if (!/^[A-Z2-9]{6}$/.test(code))
      throw apiError_('INVALID_CODE', 'Use six letters or numbers 2–9.');
    if (findGame_(code))
      throw apiError_('CODE_IN_USE', 'That code is in use. Choose another or leave it blank.');
    const playerId = id_('P'),
      now = new Date();
    appendObject_('Games', {
      GameCode: code,
      HostPlayerId: playerId,
      Status: 'WAITING',
      ChallengeCount: count,
      CreatedAt: now,
      ActivityAt: now,
      RequestId: request,
    });
    appendObject_('Players', {
      PlayerId: playerId,
      GameCode: code,
      Name: name,
      IsHost: true,
      JoinedAt: now,
      RequestId: request,
      LastSeenAt: now,
      Visible: true,
    });
    shuffle_(active)
      .slice(0, count)
      .forEach((c, i) =>
        appendObject_('GameChallenges', {
          GameCode: code,
          ChallengeId: String(c.ChallengeId),
          ChallengeNumber: i + 1,
          Name: c.Name,
          Description: c.Description || '',
        }),
      );
    return {
      game: publicGame_(findGame_(code)),
      player: publicPlayer_(findOne_('Players', (p) => p.PlayerId === playerId)),
    };
  });
}
function joinGameV3(data) {
  return locked_(() => {
    const name = validateName_(data.playerName),
      code = normalizeCode_(data.gameCode),
      request = requestId_(data);
    if (!/^[A-Z2-9]{6}$/.test(code))
      throw apiError_('INVALID_CODE', 'Enter the six-character game code.');
    const game = findGame_(code);
    if (!game) throw apiError_('GAME_NOT_FOUND', 'That game was not found. Check the code.');
    const retry = gameRows_('Players', code).find((p) => String(p.RequestId) === request);
    if (retry) return { game: publicGame_(game), player: publicPlayer_(retry) };
    if (game.Status !== 'WAITING')
      throw apiError_('ALREADY_STARTED', 'This game has already started.');
    if (gameRows_('Players', code).some((p) => String(p.Name).toLowerCase() === name.toLowerCase()))
      throw apiError_('NAME_IN_USE', 'That name is already in the lobby. Choose another.');
    const id = id_('P'),
      now = new Date();
    appendObject_('Players', {
      PlayerId: id,
      GameCode: code,
      Name: name,
      IsHost: false,
      JoinedAt: now,
      LastSeenAt: now,
      Visible: true,
      RequestId: request,
    });
    return {
      game: publicGame_(game),
      player: publicPlayer_(findOne_('Players', (p) => p.PlayerId === id)),
    };
  });
}
function startGameV3(data) {
  return locked_(() => {
    const s = requireSession_(data);
    requireHost_(s);
    if (s.game.Status === 'PLAYING') return { started: true };
    if (s.game.Status !== 'WAITING')
      throw apiError_('INVALID_STATE', 'This game has already started.');
    if (gameRows_('Players', s.code).length < 2)
      throw apiError_('MORE_PLAYERS', 'At least two players are needed.');
    updateObjectRow_('Games', s.game._row, {
      Status: 'PLAYING',
      StartedAt: new Date(),
      ActivityAt: new Date(),
    });
    return { started: true };
  });
}
function complete_(code, id) {
  const c = gameRows_('GameChallenges', code),
    e = gameRows_('Entries', code).filter((e) => e.PlayerId === id);
  return (
    c.length > 0 &&
    c.every((c) =>
      e.some(
        (e) =>
          e.ChallengeId === c.ChallengeId && ['SUBMITTED', 'PASSED'].includes(String(e.Status)),
      ),
    )
  );
}
function playerProgress_(code) {
  const challenges = gameRows_('GameChallenges', code),
    entries = gameRows_('Entries', code),
    now = Date.now();
  return gameRows_('Players', code).map((p) => {
    const done = challenges.filter((c) =>
        entries.some(
          (e) =>
            e.PlayerId === p.PlayerId &&
            e.ChallengeId === c.ChallengeId &&
            ['SUBMITTED', 'PASSED'].includes(String(e.Status)),
        ),
      ).length,
      complete = done === challenges.length && done > 0;
    return {
      name: String(p.Name),
      isHost: bool_(p.IsHost),
      completedCount: done,
      challengeCount: challenges.length,
      complete,
      ready: complete && bool_(p.Ready),
      present: bool_(p.Visible) && now - millis_(p.LastSeenAt) <= PRESENT_MS,
      resultSeen: bool_(p.ResultSeen),
      closed: bool_(p.Closed),
    };
  });
}
function syncGameV3(data) {
  return locked_(() => {
    let s = requireSession_(data);
    if (s.game.Status === 'CLOSING') {
      purgeGame_(s.code);
      return { deleted: true };
    }
    const visible = data.visible === true,
      changes = { Visible: visible };
    if (visible) changes.LastSeenAt = new Date();
    if (s.game.Status === 'PLAYING')
      changes.Ready =
        visible && data.room === 'waiting' && complete_(s.code, String(s.player.PlayerId));
    updateObjectRow_('Players', s.player._row, changes);
    if (visible && !['FINISHED', 'CLOSING'].includes(String(s.game.Status)))
      updateObjectRow_('Games', s.game._row, { ActivityAt: new Date() });
    advanceGame_(s.code);
    s = requireSession_(data);
    const result = {
      game: publicGame_(s.game),
      player: publicPlayer_(s.player),
      players: playerProgress_(s.code),
    };
    if (s.game.Status === 'PLAYING') {
      const entries = gameRows_('Entries', s.code).filter((e) => e.PlayerId === s.player.PlayerId);
      result.challenges = gameRows_('GameChallenges', s.code)
        .sort((a, b) => a.ChallengeNumber - b.ChallengeNumber)
        .map((c) => ({
          challengeId: String(c.ChallengeId),
          challengeNumber: Number(c.ChallengeNumber),
          name: String(c.Name),
          description: String(c.Description || ''),
          status: String(
            (entries.find((e) => e.ChallengeId === c.ChallengeId) || {}).Status || 'OPEN',
          ),
        }));
    }
    if (['VOTING', 'FINAL_VOTE'].includes(String(s.game.Status))) result.ballot = ballotMeta_(s);
    return result;
  });
}

// Gameplay
function gameFolder_(code) {
  const rootId = PropertiesService.getScriptProperties().getProperty('FINDIT_PHOTO_ROOT_ID');
  if (!rootId) throw apiError_('SETUP_REQUIRED', 'Run setupFindIt() before playing.');
  const root = DriveApp.getFolderById(rootId),
    folders = root.getFoldersByName(code),
    folder = folders.hasNext() ? folders.next() : root.createFolder(code),
    game = findGame_(code);
  if (game && !game.PhotoFolderId)
    updateObjectRow_('Games', game._row, { PhotoFolderId: folder.getId() });
  return folder;
}
function submitPhotoV3(data) {
  return locked_(() => {
    const s = requireSession_(data);
    if (s.game.Status !== 'PLAYING')
      throw apiError_('INVALID_STATE', 'Photo collection has ended.');
    const c = gameRows_('GameChallenges', s.code).find(
      (c) => String(c.ChallengeId) === String(data.challengeId),
    );
    if (!c) throw apiError_('INVALID_CATEGORY', 'That category is not in this game.');
    const existing = gameRows_('Entries', s.code).find(
      (e) => e.PlayerId === s.player.PlayerId && e.ChallengeId === c.ChallengeId,
    );
    if (existing) {
      if (existing.Status === 'SUBMITTED') return { accepted: true };
      throw apiError_('ALREADY_PASSED', 'That category has already been passed.');
    }
    const match = String(data.photoData || '').match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[1].length > 1400000)
      throw apiError_('INVALID_PHOTO', 'Use a JPEG photo smaller than 1 MB.');
    const bytes = Utilities.base64Decode(match[1]);
    if (bytes.length < 4 || (bytes[0] + 256) % 256 !== 255 || (bytes[1] + 256) % 256 !== 216)
      throw apiError_('INVALID_PHOTO', 'The uploaded file is not a JPEG photo.');
    const entryId = id_('E'),
      file = gameFolder_(s.code).createFile(
        Utilities.newBlob(bytes, 'image/jpeg', entryId + '.jpg'),
      );
    appendObject_('Entries', {
      EntryId: entryId,
      GameCode: s.code,
      PlayerId: s.player.PlayerId,
      ChallengeId: c.ChallengeId,
      ChallengeNumber: c.ChallengeNumber,
      Status: 'SUBMITTED',
      PhotoReference: file.getId(),
      SubmittedAt: new Date(),
    });
    updateObjectRow_('Games', s.game._row, { ActivityAt: new Date() });
    return { accepted: true };
  });
}
function passChallengeV3(data) {
  return locked_(() => {
    const s = requireSession_(data);
    if (s.game.Status !== 'PLAYING')
      throw apiError_('INVALID_STATE', 'Photo collection has ended.');
    const c = gameRows_('GameChallenges', s.code).find(
      (c) => String(c.ChallengeId) === String(data.challengeId),
    );
    if (!c) throw apiError_('INVALID_CATEGORY', 'That category is not in this game.');
    const old = gameRows_('Entries', s.code).find(
      (e) => e.PlayerId === s.player.PlayerId && e.ChallengeId === c.ChallengeId,
    );
    if (old) {
      if (old.Status === 'PASSED') return { accepted: true };
      throw apiError_('ALREADY_SUBMITTED', 'A photo is already submitted for this category.');
    }
    appendObject_('Entries', {
      EntryId: id_('E'),
      GameCode: s.code,
      PlayerId: s.player.PlayerId,
      ChallengeId: c.ChallengeId,
      ChallengeNumber: c.ChallengeNumber,
      Status: 'PASSED',
      SubmittedAt: new Date(),
    });
    return { accepted: true };
  });
}
function photos_(code) {
  return gameRows_('Entries', code).filter(
    (e) => String(e.Status) === 'SUBMITTED' && e.PhotoReference,
  );
}
function photoData_(reference) {
  const blob = DriveApp.getFileById(String(reference)).getBlob();
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(blob.getBytes());
}

// Voting
/* Automatic phases, category ballots, and one self-vote including the final. */
function contested_(code) {
  const e = photos_(code);
  return gameRows_('GameChallenges', code)
    .sort((a, b) => a.ChallengeNumber - b.ChallengeNumber)
    .filter((c) => e.filter((e) => e.ChallengeId === c.ChallengeId).length >= 2);
}
function selfVoteUsed_(code, id) {
  return gameRows_('Votes', code).some((v) => v.VoterPlayerId === id && bool_(v.IsSelfVote));
}
function finalists_(game) {
  try {
    return JSON.parse(String(game.Finalists || '[]'));
  } catch (_) {
    throw apiError_('INVALID_FINAL', 'The final vote could not be loaded.');
  }
}
function ballotMeta_(s) {
  const final = s.game.Status === 'FINAL_VOTE',
    votes = gameRows_('Votes', s.code).filter((v) => v.VoterPlayerId === s.player.PlayerId),
    all = final
      ? [{ ChallengeId: 'FINAL', Name: 'Overall winning photo', ChallengeNumber: 1 }]
      : contested_(s.code),
    next = all.find((c) => !votes.some((v) => v.ChallengeId === c.ChallengeId)),
    base = {
      complete: !next,
      final,
      selfVoteUsed: selfVoteUsed_(s.code, s.player.PlayerId),
      total: all.length,
      done: all.filter((c) => votes.some((v) => v.ChallengeId === c.ChallengeId)).length,
    };
  return next
    ? Object.assign(base, {
        key: (final ? 'FINAL:' : 'CATEGORY:') + next.ChallengeId,
        challengeId: String(next.ChallengeId),
        name: String(next.Name),
        number: Number(next.ChallengeNumber),
      })
    : base;
}
function ballotEntries_(s, id) {
  const e = photos_(s.code);
  return s.game.Status === 'FINAL_VOTE'
    ? e.filter((e) => finalists_(s.game).includes(String(e.EntryId)))
    : e.filter((e) => String(e.ChallengeId) === id);
}
function getBallotV3(data) {
  return locked_(() => {
    const s = requireSession_(data);
    if (!['VOTING', 'FINAL_VOTE'].includes(String(s.game.Status)))
      throw apiError_('INVALID_STATE', 'Voting has moved on.');
    const meta = ballotMeta_(s);
    if (meta.complete) return meta;
    const options = shuffle_(ballotEntries_(s, meta.challengeId)).map((e) => ({
      entryId: String(e.EntryId),
      photoData: photoData_(e.PhotoReference),
      isOwn: e.PlayerId === s.player.PlayerId,
      canVote: !(meta.selfVoteUsed && e.PlayerId === s.player.PlayerId),
    }));
    return Object.assign(meta, { options, canAbstain: options.every((o) => !o.canVote) });
  });
}
function castVoteV3(data) {
  return locked_(() => {
    const s = requireSession_(data);
    if (!['VOTING', 'FINAL_VOTE'].includes(String(s.game.Status)))
      throw apiError_('INVALID_STATE', 'This vote has finished.');
    const id = String(data.challengeId || ''),
      entryId = String(data.entryId || ''),
      old = gameRows_('Votes', s.code).find(
        (v) => v.VoterPlayerId === s.player.PlayerId && v.ChallengeId === id,
      );
    if (old) {
      if (String(old.EntryId) === entryId) return { accepted: true };
      throw apiError_('ALREADY_VOTED', 'Your vote is already recorded.');
    }
    const meta = ballotMeta_(s);
    if (meta.complete || meta.challengeId !== id)
      throw apiError_('INVALID_BALLOT', 'Please refresh the voting round.');
    const entries = ballotEntries_(s, id),
      used = selfVoteUsed_(s.code, s.player.PlayerId),
      entry = entries.find((e) => e.EntryId === entryId);
    if (!entryId) {
      if (entries.some((e) => e.PlayerId !== s.player.PlayerId || !used))
        throw apiError_('VOTE_REQUIRED', 'Choose an eligible photo.');
    } else if (!entry) throw apiError_('INVALID_PHOTO', 'That photo is not in this vote.');
    if (entry && entry.PlayerId === s.player.PlayerId && used)
      throw apiError_('SELF_VOTE_USED', 'You have already used your one self-vote.');
    appendObject_('Votes', {
      VoteId: id_('V'),
      GameCode: s.code,
      ChallengeId: id,
      VoterPlayerId: s.player.PlayerId,
      EntryId: entryId,
      PhotoOwnerPlayerId: entry ? entry.PlayerId : '',
      IsSelfVote: !!entry && entry.PlayerId === s.player.PlayerId,
      VotedAt: new Date(),
    });
    advanceGame_(s.code);
    return { accepted: true };
  });
}
function allVoted_(code, ids) {
  const v = gameRows_('Votes', code);
  return gameRows_('Players', code).every((p) =>
    ids.every((id) => v.some((v) => v.VoterPlayerId === p.PlayerId && v.ChallengeId === id)),
  );
}
function counts_(code, final) {
  const counts = {};
  photos_(code).forEach((e) => (counts[e.EntryId] = 0));
  gameRows_('Votes', code)
    .filter((v) => (v.ChallengeId === 'FINAL') === final)
    .forEach((v) => {
      if (Object.prototype.hasOwnProperty.call(counts, v.EntryId)) counts[v.EntryId]++;
    });
  return counts;
}
function earliest_(entries) {
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => millis_(a.e.SubmittedAt) - millis_(b.e.SubmittedAt) || a.i - b.i)[0].e;
}
function finish_(game, winner) {
  updateObjectRow_('Games', game._row, {
    Status: 'FINISHED',
    WinnerEntryId: winner ? winner.EntryId : '',
    FinishedAt: new Date(),
  });
}
function settleCategoryVoting_(game) {
  const photos = photos_(String(game.GameCode));
  if (!photos.length) {
    finish_(game, null);
    return;
  }
  const counts = counts_(String(game.GameCode), false),
    max = Math.max(...photos.map((e) => counts[e.EntryId])),
    tied = photos.filter((e) => counts[e.EntryId] === max);
  if (tied.length === 1) finish_(game, tied[0]);
  else
    updateObjectRow_('Games', game._row, {
      Status: 'FINAL_VOTE',
      Finalists: JSON.stringify(tied.map((e) => String(e.EntryId))),
    });
}
function advanceGame_(code) {
  let game = findGame_(code);
  if (!game) return;
  if (game.Status === 'PLAYING') {
    const p = playerProgress_(code);
    if (p.length && p.every((p) => p.ready && p.present)) {
      updateObjectRow_('Games', game._row, { Status: 'VOTING', VotingStartedAt: new Date() });
      game = findGame_(code);
    }
  }
  if (
    game.Status === 'VOTING' &&
    allVoted_(
      code,
      contested_(code).map((c) => String(c.ChallengeId)),
    )
  ) {
    settleCategoryVoting_(game);
    game = findGame_(code);
  }
  if (game.Status === 'FINAL_VOTE' && allVoted_(code, ['FINAL'])) {
    const ids = finalists_(game),
      e = photos_(code).filter((e) => ids.includes(String(e.EntryId))),
      counts = counts_(code, true),
      max = Math.max(...e.map((e) => counts[e.EntryId]));
    finish_(game, earliest_(e.filter((e) => counts[e.EntryId] === max)));
  }
}

// Results
function getResultsV3(data) {
  return locked_(() => {
    const s = requireSession_(data);
    if (s.game.Status !== 'FINISHED') throw apiError_('NOT_FINISHED', 'Results are not ready.');
    const players = gameRows_('Players', s.code),
      photos = photos_(s.code),
      counts = counts_(s.code, false),
      finalCounts = counts_(s.code, true),
      names = {};
    players.forEach((p) => (names[p.PlayerId] = String(p.Name)));
    const categories = gameRows_('GameChallenges', s.code)
      .sort((a, b) => a.ChallengeNumber - b.ChallengeNumber)
      .map((c) => {
        const e = photos.filter((e) => e.ChallengeId === c.ChallengeId),
          max = e.length ? Math.max(...e.map((e) => counts[e.EntryId])) : 0;
        return {
          name: String(c.Name),
          number: Number(c.ChallengeNumber),
          uncontested: e.length === 1,
          winners: e
            .filter((e) => counts[e.EntryId] === max)
            .map((e) => ({
              name: names[e.PlayerId],
              votes: counts[e.EntryId],
              photoData: photoData_(e.PhotoReference),
            })),
        };
      });
    const winner = photos.find((e) => e.EntryId === s.game.WinnerEntryId),
      finalists = finalists_(s.game),
      finalUsed = finalists.length > 1;
    return {
      categories,
      winner: winner
        ? {
            name: names[winner.PlayerId],
            photoData: photoData_(winner.PhotoReference),
            votes: counts[winner.EntryId],
            finalVotes: finalCounts[winner.EntryId],
            finalUsed,
            earliestTieBreak:
              finalUsed &&
              finalists.filter((id) => finalCounts[id] === finalCounts[winner.EntryId]).length > 1,
          }
        : null,
    };
  });
}
function acknowledgeResultsV3(data) {
  return locked_(() => {
    const s = requireSession_(data);
    if (s.game.Status !== 'FINISHED') throw apiError_('INVALID_STATE', 'Results are not ready.');
    updateObjectRow_('Players', s.player._row, { ResultSeen: true });
    return { accepted: true };
  });
}
function closeGameV3(data) {
  return locked_(() => {
    const s = requireSession_(data);
    if (s.game.Status !== 'FINISHED' && s.game.Status !== 'CLOSING')
      throw apiError_('INVALID_STATE', 'The game is not finished.');
    if (!bool_(s.player.ResultSeen))
      throw apiError_('RESULTS_NOT_SEEN', 'Wait for your winning photo to load first.');
    updateObjectRow_('Players', s.player._row, { Closed: true });
    if (gameRows_('Players', s.code).every((p) => bool_(p.Closed))) {
      purgeGame_(s.code);
      return { deleted: true };
    }
    return { deleted: false };
  });
}

// Cleanup
/* Permanent deletion, no Trash or winner archive. Keep references if deletion fails. */
function deleteDriveItem_(id) {
  const response = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(String(id)),
    {
      method: 'delete',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    },
  );
  const status = response.getResponseCode();
  if (status !== 204 && status !== 200 && status !== 404)
    throw apiError_('CLEANUP_FAILED', 'Deletion could not be completed. It will be retried.');
}
function purgeGame_(code) {
  const game = findGame_(code);
  if (!game) return;
  updateObjectRow_('Games', game._row, { Status: 'CLOSING' });
  if (game.PhotoFolderId) deleteDriveItem_(String(game.PhotoFolderId));
  else {
    const rootId = PropertiesService.getScriptProperties().getProperty('FINDIT_PHOTO_ROOT_ID');
    if (rootId) {
      const folders = DriveApp.getFolderById(rootId).getFoldersByName(code);
      while (folders.hasNext()) deleteDriveItem_(folders.next().getId());
    }
  }
  ['Votes', 'Entries', 'GameChallenges', 'Players', 'Games'].forEach((n) =>
    deleteGameRows_(n, code),
  );
}
function cleanupExpiredGames() {
  return locked_(() => {
    const now = Date.now();
    let deleted = 0,
      failed = 0;
    rowsAsObjects_('Games').forEach((g) => {
      const finished = ['FINISHED', 'CLOSING'].includes(String(g.Status)),
        expired = finished
          ? now - millis_(g.FinishedAt || g.ActivityAt || g.CreatedAt) > 15 * 60 * 1000
          : now - millis_(g.ActivityAt || g.CreatedAt) > 24 * 60 * 60 * 1000;
      if (g.Status === 'CLOSING' || expired) {
        try {
          purgeGame_(String(g.GameCode));
          deleted++;
        } catch (_) {
          failed++;
        }
      }
    });
    return { deleted, failed };
  });
}
function setupFindIt() {
  ensureFindItSheets();
  seedFindItChallenges();
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('FINDIT_PHOTO_ROOT_ID'))
    props.setProperty(
      'FINDIT_PHOTO_ROOT_ID',
      DriveApp.createFolder('Find It Temporary Photos').getId(),
    );
  const probe = DriveApp.getFolderById(props.getProperty('FINDIT_PHOTO_ROOT_ID')).createFolder(
    'Deletion setup check',
  );
  deleteDriveItem_(probe.getId());
  if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'cleanupExpiredGames'))
    ScriptApp.newTrigger('cleanupExpiredGames').timeBased().everyMinutes(5).create();
  return { version: '3.0.0', ready: true };
}
