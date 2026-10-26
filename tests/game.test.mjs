import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,join,mutate,read,identify,ranked} from '../supabase/functions/findit-api/game.mjs';
import {handler} from '../supabase/functions/findit-api/index.mjs';
import {MemoryBackend} from './memory-backend.mjs';

const NOW='2026-10-26T16:00:00.000Z';
const host={id:'host',hash:'host-secret'},guest={id:'guest',hash:'guest-secret'};
function game(count=2){const g=newGame('ABC234',{hostName:'Host',challengeCount:count},host,NOW);join(g,{playerName:'Guest'},guest);mutate(g,g.players[0],'startGame',{},NOW);return g;}
function submit(g,player,challenge,id,time=NOW){return mutate(g,g.players[player],'submitPhoto',{challengeId:challenge,entryId:id,photoPath:id+'.jpg'},time);}
function vote(g,player,challenge,entry){return mutate(g,g.players[player],'castVote',{challengeId:challenge,entryId:entry},NOW);}

test('finished players wait; last submission automatically opens voting',()=>{
 const g=game(1);submit(g,0,'C1','h');assert.equal(g.status,'PLAYING');submit(g,1,'C1','a');assert.equal(g.status,'VOTING');
 assert.equal(read(g,g.players[0],'getCompletionStatus').everyoneComplete,true);
});
test('photo votes decide the overall winner; one final vote and earliest upload resolve ties',()=>{
 const g=game();submit(g,0,'C1','h1',NOW);submit(g,1,'C1','a1','2026-10-26T16:00:01.000Z');submit(g,0,'C2','h2');submit(g,1,'C2','a2');
 vote(g,0,'C1','h1');vote(g,1,'C1','h1');vote(g,0,'C2','a2');vote(g,1,'C2','a2');
 assert.equal(g.status,'RUNOFF');assert.deepEqual(g.runoffIds,['h1','a2']);
 assert.equal(read(g,g.players[0],'getVotingState').challenge.challengeId,'RUNOFF');
 vote(g,0,'RUNOFF','h1');vote(g,1,'RUNOFF','a2');assert.equal(g.status,'FINISHED');assert.equal(g.winnerId,'h1');
 assert.equal(read(g,g.players[0],'getResults').maxVotes,2);
});
test('runoff excludes other photos and duplicate voting cannot change a vote',()=>{
 const g=game(1);submit(g,0,'C1','h');submit(g,1,'C1','a');vote(g,0,'C1','h');
 assert.throws(()=>vote(g,0,'C1','a'),e=>e.code==='ALREADY_VOTED');
 vote(g,1,'C1','a');assert.equal(g.status,'RUNOFF');
 assert.throws(()=>vote(g,0,'RUNOFF','missing'),e=>e.code==='ENTRY_NOT_FOUND');
 assert.throws(()=>vote(g,0,'C1','h'),e=>e.code==='VOTE_ROUND_CHANGED');
});
test('self-vote limit is enforced; final round permits choosing any tied photo',()=>{
 const g=game();for(const c of ['C1','C2']){submit(g,0,c,'h'+c);submit(g,1,c,'a'+c);}
 vote(g,0,'C1','hC1');assert.throws(()=>vote(g,0,'C2','hC2'),e=>e.code==='SELF_VOTE_USED');
 const state=read(g,g.players[0],'getVotingState');assert.equal(state.options.find(o=>o.optionId==='hC2').disabled,true);
 vote(g,0,'C2','aC2');vote(g,1,'C1','aC1');vote(g,1,'C2','hC2');assert.equal(g.status,'RUNOFF');
 vote(g,0,'RUNOFF','hC2');vote(g,1,'RUNOFF','hC2');assert.equal(g.winnerId,'hC2');
});
test('all passes finish without a winner; single photo wins without a vote',()=>{
 let g=game(1);for(const p of g.players)mutate(g,p,'passChallenge',{challengeId:'C1',entryId:p.playerId},NOW);assert.equal(g.status,'FINISHED');assert.equal(g.winnerId,null);
 g=game(1);submit(g,0,'C1','only');mutate(g,g.players[1],'passChallenge',{challengeId:'C1',entryId:'pass'},NOW);assert.equal(g.winnerId,'only');assert.equal(g.status,'FINISHED');
});
test('winner is the most-voted individual photo rather than challenge-win totals',()=>{
 const g=game();g.entries=[
 {entryId:'a',challengeId:'C1',playerId:'host',status:'SUBMITTED',submittedAt:NOW},
 {entryId:'b',challengeId:'C2',playerId:'guest',status:'SUBMITTED',submittedAt:NOW}
 ];g.votes=[{entryId:'a',round:1},{entryId:'a',round:1},{entryId:'b',round:1}];assert.equal(ranked(g,null,1)[0].entryId,'a');
});
test('session secrets do not appear in public state and host actions require ownership',()=>{
 const g=game(1);assert.throws(()=>identify(g,'wrong'),e=>e.code==='SESSION_INVALID');
 assert.throws(()=>mutate(g,g.players[1],'finishGame',{},NOW),e=>e.code==='HOST_ONLY');
 assert.ok(!JSON.stringify(read(g,g.players[0],'getGameState')).includes('tokenHash'));
 assert.throws(()=>join(g,{playerName:'Late'},{id:'late',hash:'late'}),e=>e.code==='INVALID_GAME_STATE');
});

function fixture(){
 const store=new MemoryBackend(),env={get:name=>name==='FINDIT_CLEANUP_SECRET'?'cleanup-secret':'test'},serve=handler(env,()=>store);
 async function call(action,token,input={}){const response=await serve(new Request('https://example.test/',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({action,...input})}));return {status:response.status,...await response.json()};}
 return {store,call,serve};
}
const H='a'.repeat(64),G='b'.repeat(64),JPEG='data:image/jpeg;base64,/9j/2Q==';
test('HTTP game lifecycle, concurrency conflicts, session isolation and photo deletion',async()=>{
 const {store,call}=fixture();const created=await call('createGame',H,{hostName:'Host',challengeCount:1});assert.equal(created.ok,true);
 const code=created.data.game.gameCode,h={gameCode:code,playerId:created.data.player.playerId};
 assert.deepEqual((await call('createGame',H,{hostName:'Host',challengeCount:1})).data,created.data);
 store.conflicts=1;const joined=await call('joinGame',G,{gameCode:code,playerName:'Guest'});assert.equal(joined.ok,true);
 const guestInput={gameCode:code,playerId:joined.data.player.playerId};
 assert.equal((await call('startGame',G,h)).ok,false); // Guessing the host ID does not grant host privileges.
 assert.equal((await call('getGameState','c'.repeat(64),h)).status,401);
 assert.equal((await call('startGame',H,h)).ok,true);
 const [a,b]=await Promise.all([call('submitPhoto',H,{...h,challengeId:'C1',photoData:JPEG}),call('submitPhoto',G,{...guestInput,challengeId:'C1',photoData:JPEG})]);assert.equal(a.ok,true);assert.equal(b.ok,true);assert.equal(store.files.size,2);
 const hs=await call('getVotingState',H,h);assert.equal(hs.data.options.length,2);assert.ok(!JSON.stringify(hs).includes('tokenHash'));
 const photo=hs.data.options[0].optionId;
 await call('castVote',H,{...h,challengeId:'C1',entryId:photo});await call('castVote',G,{...guestInput,challengeId:'C1',entryId:photo});
 assert.equal((await call('getResults',H,h)).data.overallWinners.length,1);
 assert.equal((await call('cleanupFinishedGame',G,guestInput)).ok,false);
 assert.equal((await call('cleanupFinishedGame',H,h)).ok,true);assert.equal(store.files.size,0);assert.equal(store.rows.size,0);
 assert.equal((await call('getGameState',G,guestInput)).error.code,'GAME_NOT_FOUND');
});
test('lost write response preserves committed photo and invalid images never reach storage',async()=>{
 const {store,call}=fixture();const created=await call('createGame',H,{hostName:'H',challengeCount:1});const h={gameCode:created.data.game.gameCode,playerId:created.data.player.playerId};
 await call('startGame',H,h);
 assert.equal((await call('submitPhoto',H,{...h,challengeId:'C1',photoData:'data:image/jpeg;base64,aGVsbG8='})).ok,false);assert.equal(store.files.size,0);
 store.loseNextWrite=true;assert.equal((await call('submitPhoto',H,{...h,challengeId:'C1',photoData:JPEG})).ok,true);assert.equal(store.files.size,1);
});
test('expiry sweep requires a separate secret and removes abandoned games and photos',async()=>{
 const {store,call}=fixture();const created=await call('createGame',H,{hostName:'H',challengeCount:1});const row=store.rows.get(created.data.game.gameCode);row.expires_at='2000-01-01T00:00:00.000Z';store.files.set(row.data.storagePrefix+'/orphan.jpg',new Uint8Array());
 assert.equal((await call('sweepExpired',H)).status,401);assert.equal(store.rows.size,1);
 assert.equal((await call('sweepExpired','cleanup-secret')).data.cleaned,1);assert.equal(store.rows.size,0);assert.equal(store.files.size,0);
});
test('preflight and input limits',async()=>{
 const {serve}=fixture();assert.equal((await serve(new Request('https://example.test',{method:'OPTIONS'}))).status,200);
 const bad=await serve(new Request('https://example.test',{method:'POST',body:'x'.repeat(600001)}));assert.equal((await bad.json()).error.code,'PAYLOAD_TOO_LARGE');
});
