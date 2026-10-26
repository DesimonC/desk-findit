const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const { harness } = require('./harness.cjs');
const jpeg = 'data:image/jpeg;base64,/9j/2Q==';
function game(count = 2, players = 2) {
  const h = harness(),
    host = h.create(count),
    all = [host];
  for (let i = 1; i < players; i++) all.push(h.join(host, 'Player ' + i));
  h.api('startGame', host);
  const cats = h.sync(host).challenges;
  return { h, host, all, cats };
}
function submit(h, s, c) {
  h.api('submitPhoto', { ...s, challengeId: c.challengeId, photoData: jpeg });
}
function pass(h, s, c) {
  h.api('passChallenge', { ...s, challengeId: c.challengeId });
}
function enter(h, all) {
  all.forEach((s) => h.sync(s, 'waiting'));
}
function vote(h, s, c, id) {
  h.api('castVote', { ...s, challengeId: c, entryId: id });
}
function entries(h, c) {
  return h.rows('Entries').filter((e) => e.ChallengeId === c.challengeId);
}
test('setup is repeatable and adds one cleanup trigger without a Winners archive', () => {
  const h = harness();
  h.ctx.setupFindIt();
  assert.equal(h.rows('Challenges').length, 12);
  assert.equal(h.tables.Winners, undefined);
});
test('host codes, duplicate request recovery, name protection and lobby visibility', () => {
  const h = harness(),
    requestId = crypto.randomUUID(),
    payload = { hostName: 'Des', challengeCount: 3, gameCode: 'SNAP24', requestId };
  const a = h.api('createGame', payload),
    b = h.api('createGame', payload);
  assert.deepEqual(a, b);
  assert.equal(h.rows('Games').length, 1);
  const host = { gameCode: a.game.gameCode, playerId: a.player.playerId };
  const guest = h.join(host);
  const data = h.sync(host);
  assert.equal(data.players.length, 2);
  assert.ok(data.players.every((p) => !p.playerId));
  assert.throws(() => h.join(host), { code: 'NAME_IN_USE' });
  assert.throws(() => h.api('createGame', { ...payload, requestId: crypto.randomUUID() }), {
    code: 'CODE_IN_USE',
  });
  assert.throws(() => h.api('startGame', guest), { code: 'HOST_ONLY' });
  assert.throws(() => h.api('sync', { ...host, playerId: 'forged' }), { code: 'SESSION_INVALID' });
  assert.equal(h.rows('Players').length, 2);
});
test('requires at least two players and forbids joining after start', () => {
  const h = harness(),
    host = h.create();
  assert.throws(() => h.api('startGame', host), { code: 'MORE_PLAYERS' });
  h.join(host);
  h.api('startGame', host);
  assert.throws(() => h.join(host, 'Late'), { code: 'ALREADY_STARTED' });
});
test('all submissions/passes AND live voting room presence are required', () => {
  const { h, host, all, cats } = game();
  for (const s of all) for (const c of cats) pass(h, s, c);
  h.sync(host, 'waiting');
  assert.equal(h.ctx.findGame_(host.gameCode).Status, 'PLAYING');
  h.sync(all[1], 'waiting', false);
  assert.equal(h.ctx.findGame_(host.gameCode).Status, 'PLAYING');
  h.sync(all[1], 'waiting');
  assert.equal(h.ctx.findGame_(host.gameCode).Status, 'FINISHED');
  assert.equal(h.api('getResults', host).winner, null);
});
test('stale presence cannot start voting, progress counts passes', () => {
  const { h, host, all, cats } = game(1);
  all.forEach((s) => submit(h, s, cats[0]));
  h.sync(host, 'waiting');
  const p = h.rows('Players')[0];
  h.ctx.updateObjectRow_('Players', p._row, { LastSeenAt: new Date(Date.now() - 40000) });
  const data = h.sync(all[1], 'waiting');
  assert.equal(data.game.status, 'PLAYING');
  assert.equal(data.players[0].present, false);
  assert.equal(data.players[0].completedCount, 1);
  assert.equal(h.sync(host, 'waiting').game.status, 'VOTING');
});
test('submissions are idempotent, passes cannot replace photos, foreign categories rejected', () => {
  const { h, host, cats } = game();
  submit(h, host, cats[0]);
  submit(h, host, cats[0]);
  assert.equal(h.files.size, 1);
  assert.throws(() => pass(h, host, cats[0]), { code: 'ALREADY_SUBMITTED' });
  assert.throws(() => submit(h, host, { challengeId: 'foreign' }), { code: 'INVALID_CATEGORY' });
  assert.throws(
    () =>
      h.api('submitPhoto', {
        ...host,
        challengeId: cats[1].challengeId,
        photoData: 'data:image/jpeg;base64,AAAAAA==',
      }),
    { code: 'INVALID_PHOTO' },
  );
});
test('one self-vote per game, one vote per category and maximum category votes wins', () => {
  const { h, host, all, cats } = game(2, 3);
  for (const s of all) for (const c of cats) submit(h, s, c);
  enter(h, all);
  const first = entries(h, cats[0]),
    second = entries(h, cats[1]);
  vote(h, host, cats[0].challengeId, first[0].EntryId);
  assert.throws(() => vote(h, host, cats[0].challengeId, first[1].EntryId), {
    code: 'ALREADY_VOTED',
  });
  assert.throws(() => vote(h, host, cats[1].challengeId, second[0].EntryId), {
    code: 'SELF_VOTE_USED',
  });
  vote(h, host, cats[1].challengeId, second[1].EntryId);
  vote(h, all[1], cats[0].challengeId, first[0].EntryId);
  vote(h, all[1], cats[1].challengeId, second[2].EntryId);
  vote(h, all[2], cats[0].challengeId, first[0].EntryId);
  vote(h, all[2], cats[1].challengeId, second[1].EntryId);
  const result = h.api('getResults', host);
  assert.equal(result.winner.name, 'Host');
  assert.equal(result.winner.votes, 3);
  assert.equal(result.winner.finalUsed, false);
});
test('tied photos get exactly one final vote, final tie uses received upload order', () => {
  const { h, host, all, cats } = game(1);
  all.forEach((s) => submit(h, s, cats[0]));
  const e = entries(h, cats[0]);
  h.ctx.updateObjectRow_('Entries', e[0]._row, { SubmittedAt: new Date('2026-01-01T00:00:00Z') });
  h.ctx.updateObjectRow_('Entries', e[1]._row, { SubmittedAt: new Date('2026-01-01T00:00:01Z') });
  enter(h, all);
  vote(h, host, cats[0].challengeId, e[1].EntryId);
  vote(h, all[1], cats[0].challengeId, e[0].EntryId);
  assert.equal(h.sync(host).game.status, 'FINAL_VOTE');
  vote(h, host, 'FINAL', e[1].EntryId);
  vote(h, all[1], 'FINAL', e[0].EntryId);
  const r = h.api('getResults', host);
  assert.equal(r.winner.name, 'Host');
  assert.equal(r.winner.earliestTieBreak, true);
  assert.equal(h.rows('Votes').filter((v) => v.ChallengeId === 'FINAL').length, 2);
});
test('final voting obeys the remaining self-vote budget', () => {
  const { h, host, all, cats } = game(1);
  all.forEach((s) => submit(h, s, cats[0]));
  const e = entries(h, cats[0]);
  enter(h, all);
  vote(h, host, cats[0].challengeId, e[0].EntryId);
  vote(h, all[1], cats[0].challengeId, e[1].EntryId);
  assert.throws(() => vote(h, host, 'FINAL', e[0].EntryId), { code: 'SELF_VOTE_USED' });
  vote(h, host, 'FINAL', e[1].EntryId);
  vote(h, all[1], 'FINAL', e[0].EntryId);
  assert.equal(h.sync(host).game.status, 'FINISHED');
});
test('uncontested categories require no ballot, all-own final can abstain only when budget spent', () => {
  const { h, host, all, cats } = game(3, 2);
  for (const c of cats) {
    submit(h, host, c);
    pass(h, all[1], c);
  }
  enter(h, all);
  assert.equal(h.sync(host).game.status, 'FINAL_VOTE');
  assert.throws(() => vote(h, host, 'FINAL', ''), { code: 'VOTE_REQUIRED' });
  const r = h.api('getBallot', host);
  vote(h, host, 'FINAL', r.options[0].entryId);
  vote(h, all[1], 'FINAL', r.options[0].entryId);
  assert.equal(h.sync(host).game.status, 'FINISHED');
});
test('complete cleanup removes winner, temporary records and folder; other games are untouched', () => {
  const { h, host, all, cats } = game(1);
  submit(h, host, cats[0]);
  pass(h, all[1], cats[0]);
  const other = h.create(1, 'OTHER2');
  enter(h, all);
  assert.throws(() => h.api('closeGame', host), { code: 'RESULTS_NOT_SEEN' });
  all.forEach((s) => h.api('acknowledgeResults', s));
  assert.equal(h.api('closeGame', host).deleted, false);
  assert.equal(h.files.size, 1);
  assert.equal(h.api('closeGame', all[1]).deleted, true);
  assert.equal(h.files.size, 0);
  for (const n of ['Games', 'Players', 'Entries', 'Votes', 'GameChallenges'])
    assert.equal(h.rows(n).filter((r) => r.GameCode === host.gameCode).length, 0);
  assert.ok(h.ctx.findGame_(other.gameCode));
  assert.throws(() => h.sync(host), { code: 'GAME_NOT_FOUND' });
});
test('failed permanent deletion keeps references, retries successfully, and never trashes', () => {
  const { h, host, all, cats } = game(1);
  submit(h, host, cats[0]);
  pass(h, all[1], cats[0]);
  enter(h, all);
  all.forEach((s) => h.api('acknowledgeResults', s));
  h.api('closeGame', host);
  h.setDeleteFailure(true);
  assert.throws(() => h.api('closeGame', all[1]), { code: 'CLEANUP_FAILED' });
  assert.equal(h.files.size, 1);
  assert.equal(h.rows('Entries').length, 2);
  assert.equal(h.ctx.findGame_(host.gameCode).Status, 'CLOSING');
  h.setDeleteFailure(false);
  assert.equal(h.sync(host).deleted, true);
  assert.equal(h.files.size, 0);
  assert.equal(h.rows('Games').length, 0);
});
test('abandoned and finished expiry cleanup', () => {
  const h = harness(),
    a = h.create(1);
  const g = h.ctx.findGame_(a.gameCode);
  h.ctx.updateObjectRow_('Games', g._row, {
    ActivityAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
  });
  assert.equal(h.ctx.cleanupExpiredGames().deleted, 1);
  const b = h.create(1),
    r = h.ctx.findGame_(b.gameCode);
  h.ctx.updateObjectRow_('Games', r._row, {
    Status: 'FINISHED',
    FinishedAt: new Date(Date.now() - 16 * 60 * 1000),
  });
  assert.equal(h.ctx.cleanupExpiredGames().deleted, 1);
  assert.equal(h.rows('Games').length, 0);
});
test('router errors are structured and unknown legacy archive routes are gone', () => {
  const h = harness();
  assert.equal(h.call('getLatestWinner').error.code, 'UNKNOWN_ACTION');
  assert.equal(JSON.parse(h.ctx.doPost().text).error.code, 'INVALID_REQUEST');
});

test('a spent self-vote can abstain in an all-own-photo final without blocking everyone', () => {
  const { h, host, all, cats } = game(2, 3);
  for (const s of all) for (const c of cats) submit(h, s, c);
  const a = entries(h, cats[0]),
    b = entries(h, cats[1]);
  enter(h, all);
  vote(h, host, cats[0].challengeId, a[0].EntryId);
  vote(h, host, cats[1].challengeId, b[1].EntryId);
  vote(h, all[1], cats[0].challengeId, a[0].EntryId);
  vote(h, all[1], cats[1].challengeId, b[0].EntryId);
  vote(h, all[2], cats[0].challengeId, a[1].EntryId);
  vote(h, all[2], cats[1].challengeId, b[0].EntryId);
  const ballot = h.api('getBallot', host);
  assert.equal(ballot.final, true);
  assert.equal(ballot.options.length, 2);
  assert.equal(ballot.canAbstain, true);
  assert.ok(ballot.options.every((o) => !o.canVote));
  vote(h, host, 'FINAL', '');
  vote(h, all[1], 'FINAL', a[0].EntryId);
  vote(h, all[2], 'FINAL', b[0].EntryId);
  assert.equal(h.sync(host).game.status, 'FINISHED');
});
