const test = require("node:test");
const assert = require("node:assert/strict");

let logic;
test("load shared game rules", async () => {
  logic = await import("../supabase/functions/findit-api/game-logic.mjs");
});

function state(entries) {
  return {
    players: [{ playerId: "P1", name: "Host" }, { playerId: "P2", name: "Guest" }],
    challenges: [{ challengeId: "C1" }, { challengeId: "C2" }],
    entries,
    votes: []
  };
}

test("all-pass game can skip voting and finish", () => {
  const game = state([
    { playerId: "P1", challengeId: "C1", status: "PASSED" },
    { playerId: "P1", challengeId: "C2", status: "PASSED" },
    { playerId: "P2", challengeId: "C1", status: "PASSED" },
    { playerId: "P2", challengeId: "C2", status: "PASSED" }
  ]);
  assert.equal(logic.everyoneCompletedAllChallenges(game), true);
  assert.deepEqual(logic.voteableChallengeIds(game), []);
  assert.equal(logic.canSkipVoting(game), true);
  assert.equal(logic.everyPlayerVoted(game), true);
});

test("single-entry challenges finish without a vote", () => {
  const game = state([
    { playerId: "P1", challengeId: "C1", status: "SUBMITTED" },
    { playerId: "P1", challengeId: "C2", status: "PASSED" },
    { playerId: "P2", challengeId: "C1", status: "PASSED" },
    { playerId: "P2", challengeId: "C2", status: "PASSED" }
  ]);
  assert.equal(logic.canSkipVoting(game), true);
});

test("contested challenge requires a vote from each player", () => {
  const game = state([
    { playerId: "P1", challengeId: "C1", status: "SUBMITTED" },
    { playerId: "P2", challengeId: "C1", status: "SUBMITTED" },
    { playerId: "P1", challengeId: "C2", status: "PASSED" },
    { playerId: "P2", challengeId: "C2", status: "PASSED" }
  ]);
  assert.deepEqual(logic.voteableChallengeIds(game), ["C1"]);
  assert.equal(logic.canSkipVoting(game), false);
  assert.equal(logic.everyPlayerVoted(game), false);
  game.votes.push({ voterPlayerId: "P1", challengeId: "C1" }, { voterPlayerId: "P2", challengeId: "C1" });
  assert.equal(logic.everyPlayerVoted(game), true);
});

test("code and case-insensitive name find an existing player for rejoining", () => {
  const players = [{ playerId: "P1", name: "Carla" }, { playerId: "P2", name: "Des" }];
  assert.equal(logic.findPlayerByName(players, "  cArLa ").playerId, "P1");
  assert.equal(logic.findPlayerByName(players, "New Player"), null);
  assert.equal(logic.findPlayerByName(players, "   "), null);
});

test("cleanup walks nested folders and paginates listing results", async () => {
  const tree = {
    GAME: [{ id: null, name: "P1" }, { id: null, name: "P2" }],
    "GAME/P1": [{ id: "f1", name: "a.jpg" }, { id: null, name: "nested" }],
    "GAME/P1/nested": [{ id: "f2", name: "b.jpg" }],
    "GAME/P2": [{ id: "f3", name: "c.jpg" }]
  };
  const requests = [];
  const files = await logic.collectNestedStoragePaths(async (prefix, offset, limit) => {
    requests.push({ prefix, offset, limit });
    return (tree[prefix] || []).slice(offset, offset + limit);
  }, "GAME", 1);
  assert.deepEqual(files.sort(), ["GAME/P1/a.jpg", "GAME/P1/nested/b.jpg", "GAME/P2/c.jpg"]);
  assert.ok(requests.some(request => request.prefix === "GAME" && request.offset === 1));
  assert.ok(requests.some(request => request.prefix === "GAME/P1/nested"));
});
