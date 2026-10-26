// Pure game rules. Only the Edge Function may read or write stored games.
export function fail(code, message) { throw Object.assign(new Error(message), {code}); }
const requireState = (g, ...states) => { if (!states.includes(g.status)) fail('INVALID_GAME_STATE', 'This action is not available now.'); };
export const challenges = [
  ['Something Red','Find something mainly red.'], ['Something Tiny','Find something surprisingly small.'],
  ['A Reflection','Capture an interesting reflection.'], ['Something Old','Find something old or historic.'],
  ['A Funny Sign','Find a sign or label that makes you smile.'], ['Something Round','Find something circular.'],
  ['Nature Close-Up','Photograph something natural close up.'], ['Something Blue','Find something mainly blue.'],
  ['An Unusual Angle','Show an everyday object from an unusual angle.'], ['Something With Numbers','Find numbers around you.'],
  ['A Pattern','Capture a repeated pattern.'], ['Something Shiny','Find something that catches the light.']
];
export function newGame(code, input, identity, now) {
  const name = cleanName(input.hostName), count = Number(input.challengeCount);
  if (!Number.isInteger(count) || count < 1 || count > 10) fail('INVALID_CHALLENGE_COUNT','Choose 1–10 challenges.');
  const selected = [...challenges];
  // Cryptographic shuffle; selection is fixed when the game is first stored.
  for (let i=selected.length-1;i>0;i--) { const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1); [selected[i],selected[j]]=[selected[j],selected[i]]; }
  return {gameCode:code,status:'WAITING',createdAt:now,players:[{playerId:identity.id,name,isHost:true,tokenHash:identity.hash}],
    challenges:selected.slice(0,count).map((c,i)=>({challengeId:'C'+(i+1),challengeNumber:i+1,name:c[0],description:c[1]})),entries:[],votes:[],runoffIds:[],winnerId:null};
}
function cleanName(raw) { const name=String(raw||'').trim(); if (!name || name.length>30) fail('INVALID_NAME','Enter a name of 1–30 characters.'); return name; }
export function identify(g, hash) { const p=g.players.find(p=>p.tokenHash===hash); if (!p) fail('SESSION_INVALID','This player session is no longer valid.'); return p; }
export const publicPlayer = p => ({playerId:p.playerId,name:p.name,isHost:p.isHost});
export const publicGame = g => ({gameCode:g.gameCode,status:g.status,challengeCount:g.challenges.length,hostPlayerId:g.players[0].playerId});
export function state(g,p) { return {game:publicGame(g),player:{...publicPlayer(p),gameCode:g.gameCode},players:g.players.map(publicPlayer)}; }
export function join(g,input,identity) {
  const existing=g.players.find(p=>p.tokenHash===identity.hash); if (existing) return state(g,existing);
  requireState(g,'WAITING'); if(g.players.length>=20) fail('GAME_FULL','This game already has 20 players.');
  const name=cleanName(input.playerName);
  if(g.players.some(p=>p.name.toLowerCase()===name.toLowerCase())) fail('NAME_IN_USE','That name is already in this game.');
  const p={playerId:identity.id,name,isHost:false,tokenHash:identity.hash};g.players.push(p);return state(g,p);
}
export const complete = (g,p) => g.entries.filter(e=>e.playerId===p.playerId).length===g.challenges.length;
export const everyoneComplete = g => g.players.every(p=>complete(g,p));
const photos = g => g.entries.filter(e=>e.status==='SUBMITTED');
const contested = g => g.challenges.filter(c=>photos(g).filter(e=>e.challengeId===c.challengeId).length>1);
const ownVotes = (g,p,round) => g.votes.filter(v=>v.playerId===p.playerId&&v.round===round);
const selfUsed = (g,p) => ownVotes(g,p,1).some(v=>g.entries.find(e=>e.entryId===v.entryId)?.playerId===p.playerId);
export function votingComplete(g,p) {return g.status==='RUNOFF'?ownVotes(g,p,2).length===1:contested(g).every(c=>ownVotes(g,p,1).some(v=>v.challengeId===c.challengeId));}
export const allVoted = g => g.players.every(p=>votingComplete(g,p));
export function ranked(g,ids,round) {
  return photos(g).filter(e=>!ids||ids.includes(e.entryId)).map(e=>({...e,voteCount:g.votes.filter(v=>v.round===round&&v.entryId===e.entryId).length}))
    .sort((a,b)=>b.voteCount-a.voteCount||(a.uploadOrder??Infinity)-(b.uploadOrder??Infinity)||a.submittedAt.localeCompare(b.submittedAt)||a.entryId.localeCompare(b.entryId));
}
function finish(g) {g.status='FINISHED';}
function resolveNormal(g) {
  const rows=ranked(g,null,1);
  if(!rows.length){g.winnerId=null;finish(g);return;}
  const tied=rows.filter(e=>e.voteCount===rows[0].voteCount);
  if(tied.length>1){g.runoffIds=tied.map(e=>e.entryId);g.status='RUNOFF';}
  else{g.winnerId=rows[0].entryId;finish(g);}
}
export function mutate(g,p,action,input,now) {
  const host=()=>{if(!p.isHost)fail('HOST_ONLY','Only the host can do that.');};
  switch(action){
    case 'startGame':host();requireState(g,'WAITING');g.status='PLAYING';return {status:g.status};
    case 'submitPhoto': case 'passChallenge':{
      requireState(g,'PLAYING');
      if(!g.challenges.some(c=>c.challengeId===input.challengeId))fail('CHALLENGE_NOT_FOUND','Challenge not found.');
      const previous=g.entries.find(e=>e.playerId===p.playerId&&e.challengeId===input.challengeId);
      if(previous){if(previous.entryId===input.entryId)return {entryId:previous.entryId,status:previous.status};fail('CHALLENGE_ALREADY_COMPLETE','This challenge is already complete.');}
      const entry={entryId:input.entryId,playerId:p.playerId,challengeId:input.challengeId,status:action==='submitPhoto'?'SUBMITTED':'PASSED',photoPath:input.photoPath||null,submittedAt:now,uploadOrder:g.entries.length+1};
      g.entries.push(entry);
      // The final submitted/passed challenge opens voting for everyone.
      if(everyoneComplete(g)){g.status='VOTING';if(!contested(g).length)resolveNormal(g);}
      return {entryId:entry.entryId,status:entry.status,completed:complete(g,p),everyoneComplete:everyoneComplete(g)};
    }
    case 'startVoting':host();if(['VOTING','RUNOFF','FINISHED'].includes(g.status))return {status:g.status};requireState(g,'PLAYING');if(!everyoneComplete(g))fail('PLAYERS_NOT_READY','Wait until everyone has finished.');g.status='VOTING';if(!contested(g).length)resolveNormal(g);return {status:g.status};
    case 'castVote':{
      requireState(g,'VOTING','RUNOFF');const round=g.status==='RUNOFF'?2:1;
      if((round===2&&input.challengeId!=='RUNOFF')||(round===1&&input.challengeId==='RUNOFF'))fail('VOTE_ROUND_CHANGED','Voting has moved to the next round.');
      const prior=ownVotes(g,p,round).find(v=>v.challengeId===input.challengeId);
      if(prior){if(prior.entryId===input.entryId)return {accepted:true};fail('ALREADY_VOTED','You have already voted.');}
      const entry=photos(g).find(e=>e.entryId===input.entryId);
      if(!entry||(round===2?!g.runoffIds.includes(entry.entryId):entry.challengeId!==input.challengeId||!contested(g).some(c=>c.challengeId===input.challengeId)))fail('ENTRY_NOT_FOUND','That photo is not eligible.');
      if(round===1&&entry.playerId===p.playerId&&selfUsed(g,p))fail('SELF_VOTE_USED','You have used your one self-vote.');
      // The final vote is a new round: each player may choose any tied photo.
      g.votes.push({playerId:p.playerId,entryId:entry.entryId,challengeId:input.challengeId,round});
      if(allVoted(g)){
        if(round===1)resolveNormal(g);
        else{g.winnerId=ranked(g,g.runoffIds,2)[0].entryId;finish(g);}
      }
      return {accepted:true,status:g.status};
    }
    case 'finishGame':host();if(g.status==='FINISHED')return {status:g.status};requireState(g,'VOTING','RUNOFF');if(!allVoted(g))fail('VOTING_NOT_COMPLETE','Everyone must finish voting first.');if(g.status==='VOTING')resolveNormal(g);else{g.winnerId=ranked(g,g.runoffIds,2)[0].entryId;finish(g);}return {status:g.status};
    case 'cleanupFinishedGame':host();requireState(g,'FINISHED','CLOSING');g.status='CLOSING';return {cleaned:true};
    default:fail('UNKNOWN_ACTION','Unknown action.');
  }
}
export function read(g,p,action) {
  switch(action){
    case 'getGameState':return state(g,p);
    case 'getChallenges':return {challenges:g.challenges.map(c=>({...c,status:g.entries.find(e=>e.playerId===p.playerId&&e.challengeId===c.challengeId)?.status||'OPEN'})),completedCount:g.entries.filter(e=>e.playerId===p.playerId).length,challengeCount:g.challenges.length,everyoneComplete:everyoneComplete(g)};
    case 'getCompletionStatus':return {everyoneComplete:everyoneComplete(g),players:g.players.map(p=>({...publicPlayer(p),completedCount:g.entries.filter(e=>e.playerId===p.playerId).length,challengeCount:g.challenges.length,complete:complete(g,p)}))};
    case 'getVotingState':{
      requireState(g,'VOTING','RUNOFF');
      const round=g.status==='RUNOFF'?2:1,used=selfUsed(g,p);
      if(votingComplete(g,p))return {complete:true,allVotingComplete:allVoted(g),selfVoteUsed:used,round};
      const c=round===2?{challengeId:'RUNOFF',challengeNumber:'Final',name:'Final tie-break vote',description:'Choose the best of the tied photos.'}:contested(g).find(c=>!ownVotes(g,p,1).some(v=>v.challengeId===c.challengeId));
      const options=photos(g).filter(e=>round===2?g.runoffIds.includes(e.entryId):e.challengeId===c.challengeId).map((e,i)=>({optionId:e.entryId,label:'Photo '+(i+1),photoPath:e.photoPath,disabled:round===1&&used&&e.playerId===p.playerId}));
      return {complete:false,selfVoteUsed:used,round,challenge:c,options};
    }
    case 'getVotingProgress':return {players:g.players.map(p=>({...publicPlayer(p),complete:votingComplete(g,p)})),allVotingComplete:allVoted(g)};
    case 'getResults':{
      requireState(g,'FINISHED');const rows=ranked(g,null,1),winner=rows.find(e=>e.entryId===g.winnerId);
      const describe=e=>({...publicPlayer(g.players.find(p=>p.playerId===e.playerId)),entryId:e.entryId,photoPath:e.photoPath,votes:e.voteCount});
      return {hasWinner:!!winner,overallWinners:winner?[describe(winner)]:[],maxVotes:winner?.voteCount||0,usedRunoff:g.runoffIds.length>0,winningPhoto:winner?describe(winner):null,
        challengeResults:g.challenges.map(c=>{const list=rows.filter(e=>e.challengeId===c.challengeId);return {...c,winners:list.filter(e=>e.voteCount===list[0]?.voteCount).map(describe),uncontested:list.length===1};})};
    }
    default:fail('UNKNOWN_ACTION','Unknown action.');
  }
}
