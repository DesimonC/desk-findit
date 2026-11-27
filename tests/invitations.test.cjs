const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(require.resolve("../js/invitations.js"), "utf8");
const context = { window: {}, URL, URLSearchParams };
vm.runInNewContext(source, context);
const invitations = context.window.FindItInvitations;

test("invitation links normalize codes and discard unrelated query data", () => {
  const link = invitations.buildJoinUrl("https://findit.example/index.html?old=value#rules", "ab23");
  assert.equal(link, "https://findit.example/index.html#join=AB23");
  assert.equal(invitations.readJoinCode(link), "AB23");
});

test("personal rejoin links carry a private token in the fragment", () => {
  const token = "A".repeat(48);
  const link = invitations.buildJoinUrl("https://findit.example/index.html", "AB23", token);
  assert.equal(invitations.readJoinCode(link), "AB23");
  assert.equal(invitations.readRejoinToken(link), token);
});

test("invalid codes cannot create or load invitation links", () => {
  assert.equal(invitations.normalizeCode("AB01"), "");
  assert.equal(invitations.readJoinCode("https://findit.example/?join=bad"), "");
  assert.throws(() => invitations.buildJoinUrl("https://findit.example/", ""), /valid game code/);
  assert.throws(() => invitations.buildJoinUrl("https://findit.example/", "AB23", "bad"), /token is invalid/);
});
