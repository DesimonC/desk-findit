const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
test("overall tie rounds survive reload, narrow candidates and resolve a repeated tie", async () => {
 const path = process.env.FINDIT_BACKEND || "supabase/functions/findit-api/index.ts";
 const source = stripTypeScriptTypes(fs.readFileSync(path, "utf8"));
 const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
 let snapshot = { players: ["P1","P2"].map(playerId => ({playerId})), entries: ["A","B","C"].map(entryId => ({entryId, status:"SUBMITTED"})), overallCandidates:["A","B","C"], overallVoteRound:1, overallVotes:[] };
 const context = vm.createContext({
  db:async () => [{snapshot:JSON.parse(JSON.stringify(snapshot))}],
  enc:encodeURIComponent,
  fail:(code,message)=>{throw new Error(message);},
  activePlayers:s=>s.players,
  save:async (code,g,s)=>{snapshot=JSON.parse(JSON.stringify(s));},
  finishAndRecord:async (code,g,s)=>{snapshot=JSON.parse(JSON.stringify(s));return {winner:s.overallWinnerEntryId};}
 });
 vm.runInContext(section("async function load(", "async function save(") + section("async function acceptOverallVote(", "async function listStoredFiles("), context);
 async function vote(player, entry) {const {row,state}=await context.load("TEST");return context.acceptOverallVote("TEST",row,state,player,entry);}
 await vote("P1","A");
 assert.equal((await context.load("TEST")).state.overallVotes.length,1);
 await vote("P2","B");
 assert.deepEqual(snapshot.overallCandidates,["A","B"]);
 assert.equal(snapshot.overallVoteRound,2);
 await vote("P1","A");await vote("P2","B");
 assert.equal(snapshot.overallVoteRound,3);
 await vote("P1","B");
 const result=await vote("P2","B");
 assert.equal(result.winner,"B");
 const restored=(await context.load("TEST")).state;
 assert.equal(restored.overallWinnerEntryId,"B");
 assert.equal(restored.overallRevealed,true);
});
