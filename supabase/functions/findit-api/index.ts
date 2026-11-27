import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { canSkipVoting, collectNestedStoragePaths, everyPlayerVoted, everyoneCompletedAllChallenges, findPlayerByName, playerCompletedAllChallenges, voteableChallengeIds } from "./game-logic.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_API_KEY = Deno.env.get("GOOGLE_CLOUD_VISION_API_KEY") || "";
const BUCKET = "findit-game-photos";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-findit-rejoin-token","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Content-Type":"application/json"};
const enc = (s:string)=>encodeURIComponent(s);
function out(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors});}
function fail(code:string,message:string):never{throw Object.assign(new Error(message),{code});}
async function db(path:string, init:RequestInit={}) {
 const r=await fetch(SUPABASE_URL+"/rest/v1/"+path,{...init,headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json",Prefer:"return=representation",...(init.headers||{})}});
 const t=await r.text(); if(!r.ok) throw new Error("Database request failed ("+r.status+"): "+t.slice(0,300));
 return t?JSON.parse(t):null;
}
async function storage(path:string,init:RequestInit={}) {
 const r=await fetch(SUPABASE_URL+"/storage/v1/"+path,{...init,headers:{apikey:KEY,Authorization:"Bearer "+KEY,...(init.headers||{})}});
 const t=await r.text();if(!r.ok)throw new Error("Photo storage failed ("+r.status+"): "+t.slice(0,200));return t?JSON.parse(t):null;
}
function newId(p:string){return p+crypto.randomUUID().replaceAll("-","").slice(0,12).toUpperCase();}
function newRejoinToken(){return Array.from(crypto.getRandomValues(new Uint8Array(24)),x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();}
async function hashRejoinToken(token:string){const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();}
function norm(v:unknown){return String(v||"").trim().toUpperCase();}
function activePlayers(s:any){return s.players.filter((p:any)=>!p.blocked);}
async function screenPhoto(base64:string){
 if(!VISION_API_KEY)fail("SCREENING_UNAVAILABLE","Photo safety screening is temporarily unavailable. Your photo was not uploaded. Please try again later or pass this challenge.");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch("https://vision.googleapis.com/v1/images:annotate?key="+encodeURIComponent(VISION_API_KEY),{method:"POST",headers:{"Content-Type":"application/json"},signal:controller.signal,body:JSON.stringify({requests:[{image:{content:base64},features:[{type:"SAFE_SEARCH_DETECTION"}]}]})});
  if(!response.ok){console.error("[FindIt API] Photo screening service returned HTTP",response.status);fail("SCREENING_UNAVAILABLE","Photo safety screening is temporarily unavailable. Your photo was not uploaded. Please try again later or pass this challenge.");}
  const payload=await response.json(),annotation=payload?.responses?.[0]?.safeSearchAnnotation;
  if(!annotation){console.error("[FindIt API] Photo screening returned no safety annotation");fail("SCREENING_UNAVAILABLE","Photo safety screening could not check this image. Your photo was not uploaded. Please try again later or pass this challenge.");}
  const levels:any={UNKNOWN:0,VERY_UNLIKELY:1,UNLIKELY:2,POSSIBLE:3,LIKELY:4,VERY_LIKELY:5};
  const flagged=["adult","racy","violence","medical"].filter(category=>(levels[String(annotation[category]||"UNKNOWN")]||0)>=4);
  if(flagged.length)fail("PHOTO_SCREENED","This photo was flagged by the safety check and was not added. Please choose a different photo or pass this challenge.");
  return {screened:true};
 }catch(error:any){
  if(error?.code==="PHOTO_SCREENED"||error?.code==="SCREENING_UNAVAILABLE")throw error;
  console.error("[FindIt API] Photo screening request failed",error?.name||"error");
  fail("SCREENING_UNAVAILABLE","Photo safety screening could not check this image. Your photo was not uploaded. Please try again later or pass this challenge.");
 }finally{clearTimeout(timer);}
}
async function load(code:string){
 const rows=await db("findit_games?game_code=eq."+enc(code)+"&select=game_code,host_player_id,status,challenge_count,ended_early,snapshot,version");
 if(!rows?.length) fail("GAME_NOT_FOUND","Game "+code+" could not be found.");
 const g=rows[0],s=g.snapshot||{};
 return {row:g,state:{players:s.players||[],challenges:s.challenges||[],entries:s.entries||[],votes:s.votes||[],reports:s.reports||[]}};
}
async function save(code:string,g:any,state:any){
 {
  const r=await fetch(SUPABASE_URL+"/rest/v1/rpc/findit_save_snapshot",{method:"POST",headers:{apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"},body:JSON.stringify({p_game_code:code,p_expected_version:g.version,p_snapshot:state})});
  const raw=await r.text();if(!r.ok)throw new Error("Game save failed: "+raw.slice(0,200));
  const v=Number(JSON.parse(raw));
  if(v){g.version=v;await db("findit_games?game_code=eq."+enc(code),{method:"PATCH",body:JSON.stringify({status:g.status})});return;}
  fail("GAME_BUSY","Another game action is saving. Please retry.");
 }
 fail("GAME_BUSY","Another game action is saving. Please retry.");
}
async function player(g:any,s:any,id:string,token:string){const p=s.players.find((x:any)=>x.playerId===id&&!x.blocked);if(!p)fail("SESSION_INVALID","This player session is no longer valid.");if(p.rejoinTokenHash&&(await hashRejoinToken(token))!==p.rejoinTokenHash)fail("SESSION_INVALID","This player session is no longer valid.");if(p.rejoinToken&&p.rejoinToken!==token)fail("SESSION_INVALID","This player session is no longer valid.");return p;}
function gamePublic(g:any){return {gameCode:g.game_code,status:g.status,challengeCount:g.challenge_count,endedEarly:g.ended_early};}
function playerPublic(p:any){return {playerId:p.playerId,gameCode:p.gameCode,name:p.name,isHost:p.isHost};}
function playerListPublic(p:any){return {name:p.name,isHost:p.isHost};}
function playerPrivate(p:any,token:string){return {...playerPublic(p),rejoinToken:token};}
function complete(s:any,id:string){return playerCompletedAllChallenges(s,id);}
function everyone(s:any){return everyoneCompletedAllChallenges(s);}
function voteable(s:any){return voteableChallengeIds(s);}
function votingComplete(s:any,id:string){const ids=voteable(s);return ids.every((c:any)=>s.votes.some((v:any)=>v.voterPlayerId===id&&v.challengeId===c));}
function allVoted(s:any){return everyPlayerVoted(s);}
async function photoUrl(ref:string){if(!ref)return "";const r=await storage("object/sign/"+BUCKET+"/"+ref,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expiresIn:3600})});return SUPABASE_URL+"/storage/v1"+r.signedURL;}
async function getResults(code:string,s:any,withPhotos=true){
 const names=Object.fromEntries(s.players.map((p:any)=>[p.playerId,p.name])),wins:any={};s.players.forEach((p:any)=>wins[p.playerId]=0);
 const results=[];
 for(const c of s.challenges){
  const photos=s.entries.filter((e:any)=>e.challengeId===c.challengeId&&e.status==="SUBMITTED");
  if(!photos.length){results.push({challengeId:c.challengeId,challengeNumber:c.challengeNumber,name:c.name,winners:[],topVotes:0,uncontested:false});continue;}
  const counts:any={};photos.forEach((e:any)=>counts[e.entryId]=0);
  s.votes.filter((v:any)=>v.challengeId===c.challengeId).forEach((v:any)=>{if(counts[v.entryId]!==undefined)counts[v.entryId]++;});
  const top=Math.max(...Object.values(counts) as number[]),ws=photos.length===1?photos:photos.filter((e:any)=>counts[e.entryId]===top);
  const winners=[];for(const e of ws){wins[e.playerId]=(wins[e.playerId]||0)+1;winners.push({playerId:e.playerId,name:names[e.playerId]||"Player",photoReference:e.photoReference,photoUrl:withPhotos?await photoUrl(e.photoReference):""});}
  results.push({challengeId:c.challengeId,challengeNumber:c.challengeNumber,name:c.name,topVotes:photos.length===1?0:top,uncontested:photos.length===1,winners});
 }
 const max=Math.max(0,...Object.values(wins) as number[]),overall=activePlayers(s).filter((p:any)=>wins[p.playerId]===max&&max>0).map((p:any)=>({playerId:p.playerId,name:p.name,challengeWins:wins[p.playerId]}));
 return {gameCode:code,hasWinner:overall.length>0,challengeResults:results,overallWinners:overall,maxChallengeWins:max};
}
async function finishAndRecord(code:string,g:any,s:any){
 const result=await getResults(code,s,false),playedAt=new Date().toISOString(),rows:any[]=[];
 for(const challenge of result.challengeResults)for(const winner of challenge.winners)rows.push({game_code:code,played_at:playedAt,record_type:"CHALLENGE",challenge_number:challenge.challengeNumber,challenge_name:challenge.name,winner_player_id:winner.playerId,winner_name:winner.name,winning_photo_reference:winner.photoReference,is_joint_winner:challenge.winners.length>1,is_overall_winner:result.overallWinners.some((item:any)=>item.playerId===winner.playerId)});
 if(!result.hasWinner)rows.push({game_code:code,played_at:playedAt,record_type:"NO_WINNER",winner_name:"No winner"});
 else for(const winner of result.overallWinners)rows.push({game_code:code,played_at:playedAt,record_type:"OVERALL",winner_player_id:winner.playerId,winner_name:winner.name,challenge_wins:winner.challengeWins,is_joint_winner:result.overallWinners.length>1,is_overall_winner:true});
 if(rows.length)await db("findit_winners",{method:"POST",body:JSON.stringify(rows)});
 g.status="FINISHED";
 await save(code,g,s);
 return {gameCode:code,status:"FINISHED",hasWinner:result.hasWinner,overallWinners:result.overallWinners,maxChallengeWins:result.maxChallengeWins};
}
async function listStoredFiles(prefix:string){
 try{return await collectNestedStoragePaths(async(folder:string,offset:number,limit:number)=>storage("object/list/"+BUCKET,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefix:folder,limit,offset,sortBy:{column:"name",order:"asc"}})}),prefix,1000);}
 catch(error){console.warn("[FindIt API] Photo listing failed during cleanup",error);fail("PHOTO_LIST_FAILED","Could not confirm the stored photos for this game.");}
}
async function action(a:string,d:any){
 if(a==="health")return {version:"3.0.0",status:"ok",provider:"supabase",selfVoteRule:"half-rounded-down",photoScreening:VISION_API_KEY?"configured":"not-configured"};
 if(a==="getLatestWinner"){
  const rows=await db("findit_winners?select=game_code,winner_name,record_type,played_at&record_type=eq.OVERALL&order=played_at.desc&limit=1");
  return rows?.length?{hasWinner:true,gameCode:rows[0].game_code,winnerName:rows[0].winner_name,photoUrl:""}:{hasWinner:false};
 }
 const code=norm(d.gameCode);
 if(a==="createGame"){
  const name=String(d.hostName||"").trim(),n=Number(d.challengeCount);
  if(!name)fail("HOST_NAME_REQUIRED","Host name is required.");
  if(!Number.isInteger(n)||n<1||n>10)fail("INVALID_CHALLENGE_COUNT","Challenge count must be from 1 to 10.");
  const catalog=await db("findit_challenges?active=eq.true&select=challenge_id,name,description");
  if(catalog.length<n)fail("NOT_ENOUGH_CHALLENGES","There are not enough active challenges for this game.");
  let gc="",inserted=null;
  for(let i=0;i<30&&!inserted;i++){gc=Array.from(crypto.getRandomValues(new Uint8Array(4)),x=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x%32]).join("");const pid=newId("P"),token=newRejoinToken(),tokenHash=await hashRejoinToken(token);const shuffled=[...catalog].sort(()=>Math.random()-.5).slice(0,n).map((c:any,i:number)=>({...c,challengeId:c.challenge_id,challengeNumber:i+1}));const state={players:[{playerId:pid,gameCode:gc,name,isHost:true,rejoinTokenHash:tokenHash}],challenges:shuffled,entries:[],votes:[],reports:[]};try{await db("findit_games",{method:"POST",body:JSON.stringify({game_code:gc,host_player_id:pid,status:"WAITING",challenge_count:n,snapshot:state})});inserted={state,pid,token};}catch(e){if(!String(e).includes("23505"))throw e;}}
  if(!inserted)fail("CODE_GENERATION_FAILED","Could not generate a unique game code.");
  return {game:{gameCode:gc,status:"WAITING",challengeCount:n,endedEarly:false},player:playerPrivate(inserted.state.players[0],inserted.token)};
 }
 const {row:g,state:s}=await load(code);
 if(a==="joinGame"){
  const token=String(d.rejoinToken||"");
  if(token){const tokenHash=await hashRejoinToken(token),returning=s.players.find((p:any)=>p.rejoinTokenHash===tokenHash||p.rejoinToken===token);if(!returning)fail("REJOIN_LINK_INVALID","This personal rejoin link is not valid for this game.");if(returning.blocked)return {blocked:true,notice:returning.notice?.text||"You have been blocked from this game by the host."};return {game:gamePublic(g),player:playerPrivate(returning,token),reused:true,notice:returning.notice||null};}
  const name=String(d.playerName||"").trim();if(!name)fail("PLAYER_NAME_REQUIRED","Your name is required.");if(name.length>30)fail("PLAYER_NAME_TOO_LONG","Your name must be 30 characters or fewer.");
  const duplicate=findPlayerByName(s.players,name);if(duplicate){if(duplicate.blocked)fail("PLAYER_BLOCKED","You have been blocked from this game by the host.");fail("REJOIN_LINK_REQUIRED","That name is already in this game. Use your personal rejoin link to return.");}
  if(g.status!=="WAITING")fail("GAME_ALREADY_STARTED","This game has already started. New players cannot join now; returning players need their personal rejoin link.");
  const token=newRejoinToken(),p={playerId:newId("P"),gameCode:code,name,isHost:false,rejoinTokenHash:await hashRejoinToken(token)};s.players.push(p);await save(code,g,s);return {game:gamePublic(g),player:playerPrivate(p,token),reused:false};
 }
 const pid=String(d.playerId||""),candidate=s.players.find((p:any)=>p.playerId===pid);if(a==="getGameState"&&candidate?.blocked){const supplied=String(d.rejoinToken||"");if(candidate.rejoinTokenHash&&(await hashRejoinToken(supplied))!==candidate.rejoinTokenHash)fail("SESSION_INVALID","This player session is no longer valid.");if(candidate.rejoinToken&&candidate.rejoinToken!==supplied)fail("SESSION_INVALID","This player session is no longer valid.");return {blocked:true,notice:candidate.notice?.text||"You have been blocked from this game by the host."};}const me=await player(g,s,pid,String(d.rejoinToken||""));
 if(a==="getGameState")return {game:gamePublic(g),player:{...playerPublic(me),notice:me.notice||null},players:activePlayers(s).map(playerListPublic)};
 if(a==="acknowledgePlayerNotice") {if(me.notice&&String(d.noticeId||"")===me.notice.id){me.notice=null;await save(code,g,s);}return {acknowledged:true};}
 if(a==="startGame"){if(pid!==g.host_player_id)fail("HOST_ONLY","Only the host can start the game.");if(g.status!=="WAITING")fail("INVALID_GAME_STATE","The game cannot be started now.");g.status="PLAYING";await save(code,g,s);return {status:g.status};}
 if(a==="getChallenges"){
  if(g.status!=="PLAYING")fail("INVALID_GAME_STATE","Challenges are only available while the game is playing.");
  const challenges=s.challenges.map((c:any)=>({...c,status:s.entries.find((e:any)=>e.playerId===pid&&e.challengeId===c.challengeId)?.status||"OPEN"}));
  return {challenges,completedCount:challenges.filter((c:any)=>c.status!=="OPEN").length,challengeCount:challenges.length,everyoneComplete:everyone(s)};
 }
 if(a==="getCompletionStatus")return {everyoneComplete:everyone(s),players:activePlayers(s).map((p:any)=>({name:p.name,isHost:p.isHost,completedCount:s.entries.filter((e:any)=>e.playerId===p.playerId).length,challengeCount:g.challenge_count,complete:complete(s,p.playerId)}))};
 if(a==="submitPhoto"||a==="passChallenge"){
  if(g.status!=="PLAYING")fail("INVALID_GAME_STATE","Challenges can only be completed while the game is playing.");
  const c=s.challenges.find((x:any)=>x.challengeId===String(d.challengeId));if(!c)fail("CHALLENGE_NOT_FOUND","This challenge is not part of the game.");
  if(s.entries.some((e:any)=>e.playerId===pid&&e.challengeId===c.challengeId))fail("CHALLENGE_ALREADY_COMPLETE","You have already completed this challenge.");
  let ref=null;
  if(a==="submitPhoto"){
   const m=String(d.photoData||"").match(/^data:image\/(jpeg|jpg|png|webp);base64,([\s\S]+)$/i);if(!m)fail("PHOTO_REQUIRED","A valid photo is required.");
   const type=m[1].toLowerCase()==="jpg"?"jpeg":m[1].toLowerCase(),bytes=Uint8Array.from(atob(m[2]),x=>x.charCodeAt(0));if(bytes.length>8*1024*1024)fail("PHOTO_TOO_LARGE","Photo is too large. Please take a smaller photo.");
   await screenPhoto(m[2]);
   ref=code+"/"+pid+"/"+c.challengeId+"-"+crypto.randomUUID()+".jpg";
   await storage("object/"+BUCKET+"/"+ref,{method:"POST",headers:{"Content-Type":"image/"+type,"x-upsert":"false"},body:bytes});
  }
  const e={entryId:newId("E"),gameCode:code,playerId:pid,challengeId:c.challengeId,challengeNumber:c.challengeNumber,status:a==="passChallenge"?"PASSED":"SUBMITTED",photoReference:ref,submittedAt:new Date().toISOString()};
  s.entries.push(e);await save(code,g,s);return {entryId:e.entryId,status:e.status,completed:complete(s,pid),everyoneComplete:everyone(s)};
 }
 if(a==="startVoting"){
  if(pid!==g.host_player_id)fail("HOST_ONLY","Only the host can start voting.");if(g.status!=="PLAYING")fail("INVALID_GAME_STATE","Voting can only start after gameplay.");if(!everyone(s))fail("PLAYERS_NOT_COMPLETE","All players must complete their challenges before voting starts.");
  const count=voteable(s).length;if(!count)return await finishAndRecord(code,g,s);
  g.status="VOTING";await save(code,g,s);return {status:g.status,voteableChallengeCount:count};
 }
 if(a==="getVotingState"){
  if(g.status!=="VOTING")fail("INVALID_GAME_STATE","Voting is not active.");const ids=voteable(s),next=s.challenges.find((c:any)=>ids.includes(c.challengeId)&&!s.votes.some((v:any)=>v.voterPlayerId===pid&&v.challengeId===c.challengeId));
  const selfVotesUsed=s.votes.filter((v:any)=>v.voterPlayerId===pid&&v.isSelfVote).length,selfVoteLimit=Math.floor(ids.length/2);
  if(!next)return {complete:true,selfVoteUsed:selfVotesUsed>0,selfVotesUsed,selfVoteLimit,allVotingComplete:allVoted(s),voteableChallengeCount:ids.length};
  const opts=s.entries.filter((e:any)=>e.challengeId===next.challengeId&&e.status==="SUBMITTED").sort(()=>Math.random()-.5);
  const options=[];for(let i=0;i<opts.length;i++){const reports=(s.reports||[]).filter((r:any)=>r.entryId===opts[i].entryId);options.push({optionId:opts[i].entryId,label:"Photo "+(i+1),photoUrl:await photoUrl(opts[i].photoReference),reported:reports.length>0,reportedByMe:reports.some((r:any)=>r.reporterPlayerId===pid)});}
  return {complete:false,selfVoteUsed:selfVotesUsed>0,selfVotesUsed,selfVoteLimit,voteableChallengeCount:ids.length,challenge:next,options};
 }
 if(a==="reportPhoto"){
  if(g.status!=="VOTING")fail("INVALID_GAME_STATE","Photos can only be reported during voting.");
  const challengeId=String(d.challengeId||""),entryId=String(d.entryId||""),entry=s.entries.find((e:any)=>e.entryId===entryId&&e.challengeId===challengeId&&e.status==="SUBMITTED");
  if(!entry)fail("ENTRY_NOT_FOUND","That photo is no longer available to report.");
  s.reports=s.reports||[];if(s.reports.some((r:any)=>r.entryId===entryId&&r.reporterPlayerId===pid))return {reported:true,reused:true};
  s.reports.push({reportId:newId("R"),entryId,challengeId,reporterPlayerId:pid,reportedPlayerId:entry.playerId,reason:"Possible breach of the Photo Safety Agreement",status:"PENDING",createdAt:new Date().toISOString()});
  await save(code,g,s);return {reported:true,reused:false};
 }
 if(a==="castVote"){
  if(g.status!=="VOTING")fail("INVALID_GAME_STATE","Voting is not active.");const challengeId=String(d.challengeId||""),entryId=String(d.entryId||"");
  if(!voteable(s).includes(challengeId))fail("VOTE_NOT_REQUIRED","This challenge is not contested.");
  if(s.votes.some((v:any)=>v.voterPlayerId===pid&&v.challengeId===challengeId))fail("ALREADY_VOTED","You have already voted for this challenge.");
  const e=s.entries.find((x:any)=>x.entryId===entryId&&x.challengeId===challengeId&&x.status==="SUBMITTED");if(!e)fail("ENTRY_NOT_FOUND","That photo is not available for this vote.");
  const self=e.playerId===pid,limit=Math.floor(voteable(s).length/2);if(self&&s.votes.filter((v:any)=>v.voterPlayerId===pid&&v.isSelfVote).length>=limit)fail("SELF_VOTE_USED","You have reached your self-vote allowance.");
  s.votes.push({voteId:newId("V"),gameCode:code,challengeId,voterPlayerId:pid,entryId,photoOwnerPlayerId:e.playerId,isSelfVote:self});await save(code,g,s);return {accepted:true,isSelfVote:self,votingComplete:votingComplete(s,pid),allVotingComplete:allVoted(s)};
 }
 if(a==="getVotingProgress"){
  if(pid!==g.host_player_id)fail("HOST_ONLY","Only the host can view voting progress.");const ids=voteable(s);
  const pendingReports=[];for(const report of (s.reports||[]).filter((r:any)=>r.status==="PENDING")){const entry=s.entries.find((e:any)=>e.entryId===report.entryId);const challenge=s.challenges.find((c:any)=>c.challengeId===report.challengeId);pendingReports.push({reportId:report.reportId,entryId:report.entryId,reportedName:s.players.find((p:any)=>p.playerId===report.reportedPlayerId)?.name||"Player",challengeName:challenge?.name||"Challenge",reason:report.reason,photoUrl:entry?.photoReference?await photoUrl(entry.photoReference):""});}
  return {voteableChallengeCount:ids.length,players:activePlayers(s).map((p:any)=>({name:p.name,isHost:p.isHost,complete:votingComplete(s,p.playerId)})),allVotingComplete:allVoted(s),pendingReports};
 }
 if(a==="resolvePhotoReport"){
  if(pid!==g.host_player_id)fail("HOST_ONLY","Only the host can review photo reports.");if(g.status!=="VOTING")fail("INVALID_GAME_STATE","Photo reports can only be reviewed during voting.");
  const report=s.reports?.find((r:any)=>r.reportId===String(d.reportId||"")&&r.status==="PENDING");if(!report)fail("REPORT_NOT_FOUND","This report is no longer waiting for review.");
  const decision=String(d.decision||"").toUpperCase();if(!["REMOVE","DISMISS","WARN","BLOCK"].includes(decision))fail("INVALID_REPORT_DECISION","Choose to remove the photo, dismiss the report, warn the player, or block them from this game.");
  const target=s.players.find((p:any)=>p.playerId===report.reportedPlayerId);if((decision==="WARN"||decision==="BLOCK")&&(!target||target.isHost))fail("HOST_CANNOT_BE_SANCTIONED","The host cannot warn or block themselves through this review action.");
  const now=new Date().toISOString(),refs:string[]=[],affectedChallenges=new Set<string>(),affectedEntries=new Set<string>();
  const removeEntry=(entry:any)=>{if(!entry||entry.status!=="SUBMITTED")return;entry.status="REMOVED";affectedEntries.add(entry.entryId);affectedChallenges.add(entry.challengeId);if(entry.photoReference)refs.push(entry.photoReference);};
  if(decision==="REMOVE"||decision==="WARN"){removeEntry(s.entries.find((e:any)=>e.entryId===report.entryId));}
  if(decision==="WARN"){target.notice={id:newId("N"),text:"The host has sent a safety warning. Please follow the Photo Safety Agreement. The reported photo was removed from this game.",createdAt:now};report.status="WARNED";}
  else if(decision==="BLOCK"){
   target.blocked=true;target.blockedAt=now;target.notice={id:newId("N"),text:"You have been blocked from this game by the host. Your photos were removed and you cannot rejoin this match.",createdAt:now};
   for(const entry of s.entries.filter((e:any)=>e.playerId===target.playerId))removeEntry(entry);
   for(const pending of (s.reports||[]).filter((r:any)=>r.reportedPlayerId===target.playerId&&r.status==="PENDING")){pending.status="BLOCKED";pending.reviewedAt=now;pending.reviewedBy=pid;}
  }else{report.status=decision==="REMOVE"?"REMOVED":"DISMISSED";}
  if(decision!=="BLOCK"){report.reviewedAt=now;report.reviewedBy=pid;}
  if(affectedChallenges.size)s.votes=s.votes.filter((v:any)=>!affectedChallenges.has(v.challengeId)&&!affectedEntries.has(v.entryId));
  if(decision==="BLOCK")s.votes=s.votes.filter((v:any)=>v.voterPlayerId!==target.playerId);
  await save(code,g,s);
  for(let i=0;i<refs.length;i+=100){try{await storage("object/"+BUCKET,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:refs.slice(i,i+100)})});}catch(error){console.warn("[FindIt API] Removed photo remains stored until game cleanup",error);}}
  return {resolved:true,decision};
 }
 if(a==="finishGame"){
  if(pid!==g.host_player_id)fail("HOST_ONLY","Only the host can finish the game.");
  if((s.reports||[]).some((r:any)=>r.status==="PENDING"))fail("REPORTS_PENDING","The host must review all reported photos before revealing results.");
  if(g.status==="PLAYING"&&canSkipVoting(s))return await finishAndRecord(code,g,s);
  if(g.status!=="VOTING")fail("INVALID_GAME_STATE","The game can only finish after voting.");if(!allVoted(s))fail("VOTING_NOT_COMPLETE","All players must finish voting first.");
  return await finishAndRecord(code,g,s);
 }
 if(a==="getResults"){
  if(g.status!=="FINISHED")fail("RESULTS_NOT_READY","Results are not ready yet.");return await getResults(code,s,true);
 }
 if(a==="cleanupFinishedGame"){
  if(pid!==g.host_player_id)fail("HOST_ONLY","Only the host can close the finished game.");if(g.status!=="FINISHED")fail("INVALID_GAME_STATE","Only a finished game can be cleaned up.");
  const paths=await listStoredFiles(code);
  for(let i=0;i<paths.length;i+=100)await storage("object/"+BUCKET,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({prefixes:paths.slice(i,i+100)})});
  const remaining=await listStoredFiles(code);if(remaining.length)fail("PHOTO_CLEANUP_INCOMPLETE","Some game photos could not be deleted. The game data has been kept so cleanup can be retried.");
  const records=(await db("findit_winners?game_code=eq."+enc(code)+"&select=id")).length;
  if(records)await db("findit_winners?game_code=eq."+enc(code),{method:"DELETE"});
  await db("findit_games?game_code=eq."+enc(code),{method:"DELETE"});
  return {cleaned:true,gameCode:code,recordsRemoved:records,photosRemoved:paths.length};
 }
 fail("UNKNOWN_ACTION","Unknown API action: "+a);
}
Deno.serve(async (req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 try{
  const url=new URL(req.url);let a=url.searchParams.get("action")||"",d:any={};
  if(req.method==="GET")url.searchParams.forEach((v,k)=>{if(k!=="action")d[k]=v;});
  else{d=await req.json();a=a||d.action;}
  const sessionToken=req.headers.get("x-findit-rejoin-token");if(sessionToken&&!d.rejoinToken)d.rejoinToken=sessionToken;
  if(!a)fail("ACTION_REQUIRED","API action is required.");
  return out({ok:true,data:await action(a,d)});
 }catch(e:any){return out({ok:false,error:{code:e.code||"SERVER_ERROR",message:e.message||String(e)}},400);}
});
