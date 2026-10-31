import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,authorization,apikey","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Content-Type":"application/json"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fail=(message:string,status=400)=>reply({ok:false,error:{message}},status);
async function sha(s:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function one(table:string,column:string,value:string){const {data,error}=await db.from(table).select("*").eq(column,value).maybeSingle();if(error)throw error;return data;}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response(null,{headers});
 try{
  const input=req.method==="GET"?Object.fromEntries(new URL(req.url).searchParams):await req.json();
  const action=String(input.action||"");
  if(action==="getLatestWinner")return reply({ok:true,data:{hasWinner:false}});
  if(action==="getPacks"){const {data,error}=await db.from("challenge_packs").select("id,name,description,seasonal").eq("active",true);if(error)throw error;return reply({ok:true,data:{packs:data}});}
  if(action==="createGame"){
   const name=String(input.hostName||"").trim().slice(0,40),count=Number(input.challengeCount),pack=String(input.packId||"classic");
   if(!name||!Number.isInteger(count)||count<1||count>10)return fail("Enter a name and 1–10 challenges.");
   const packRow=await one("challenge_packs","id",pack);if(!packRow?.active)return fail("Challenge pack unavailable.");
   const {data:pool,error:pe}=await db.from("challenges").select("id").eq("pack_id",pack).eq("active",true);if(pe)throw pe;if((pool||[]).length<count)return fail("Not enough challenges in this pack.");
   const token=crypto.randomUUID()+crypto.randomUUID(),hash=await sha(token);
   let game:any=null;
   for(let i=0;i<8;i++){const code=Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b%32]).join("");const {data,error}=await db.from("games").insert({code,challenge_count:count,pack_id:pack,status:"WAITING"}).select().single();if(!error){game=data;break;}if(error.code!=="23505")throw error;}
   if(!game)return fail("Could not allocate game code.",503);
   const {data:player,error:err}=await db.from("players").insert({game_id:game.id,name,session_token_hash:hash}).select().single();if(err){await db.from("games").delete().eq("id",game.id);throw err;}
   const {error:ue}=await db.from("games").update({host_player_id:player.id}).eq("id",game.id);if(ue)throw ue;
   return reply({ok:true,data:{game:{gameCode:game.code},player:{playerId:player.id,name:player.name,sessionToken:token}}});
  }
  if(action==="joinGame"){
   const code=String(input.gameCode||"").toUpperCase(),name=String(input.playerName||"").trim().slice(0,40);
   if(!/^[A-Z2-9]{6}$/.test(code)||!name)return fail("Enter a valid code and name.");
   const game=await one("games","code",code);if(!game||game.status!=="WAITING")return fail("Game not found or already started.",404);
   const token=crypto.randomUUID()+crypto.randomUUID();
   const {data:player,error}=await db.from("players").insert({game_id:game.id,name,session_token_hash:await sha(token)}).select().single();if(error)throw error;
   return reply({ok:true,data:{game:{gameCode:code},player:{playerId:player.id,name:player.name,sessionToken:token}}});
  }
  const code=String(input.gameCode||"").toUpperCase(),playerId=String(input.playerId||""),token=String(input.sessionToken||"");
  const game=await one("games","code",code);
  const player=playerId?await one("players","id",playerId):null;
  if(!game||!player||player.game_id!==game.id||!token||await sha(token)!==player.session_token_hash)return fail("Invalid game session.",401);
  const host=game.host_player_id===player.id;
  if(action==="getGameState"){
   const {data:players,error}=await db.from("players").select("id,name").eq("game_id",game.id);if(error)throw error;
   return reply({ok:true,data:{game:{gameCode:code,status:game.status,challengeCount:game.challenge_count},player:{playerId:player.id,name:player.name,isHost:host},players:players?.map(p=>({playerId:p.id,name:p.name,isHost:p.id===game.host_player_id}))}});
  }
  if(action==="startGame"){
   if(!host||game.status!=="WAITING")return fail("Only the host can start a waiting game.",403);
   const {data:pool,error}=await db.from("challenges").select("id").eq("pack_id",game.pack_id).eq("active",true);if(error)throw error;
   const selected=[...(pool||[])].map(c=>({c,key:crypto.getRandomValues(new Uint32Array(1))[0]})).sort((a,b)=>a.key-b.key).slice(0,game.challenge_count).map(x=>x.c);
   if(selected.length!==game.challenge_count)return fail("Not enough challenges.");
   const {error:ie}=await db.from("game_challenges").insert(selected.map((c,i)=>({game_id:game.id,challenge_id:c.id,ordinal:i+1})));if(ie)throw ie;
   const {error:ue}=await db.from("games").update({status:"PLAYING"}).eq("id",game.id);if(ue)throw ue;
   return reply({ok:true,data:{started:true}});
  }
  if(action==="getChallenges"){
   const {data:rows,error}=await db.from("game_challenges").select("id,ordinal,challenges(title,description)").eq("game_id",game.id).order("ordinal");if(error)throw error;
   const {data:entries,error:ee}=await db.from("entries").select("game_challenge_id,status,player_id").eq("game_id",game.id);if(ee)throw ee;
   const challenges=(rows||[]).map((r:any)=>({challengeId:r.id,challengeNumber:r.ordinal,name:r.challenges?.title||"",description:r.challenges?.description||"",status:entries?.find(e=>e.game_challenge_id===r.id&&e.player_id===player.id)?.status||"PENDING"}));
   const {count}=await db.from("players").select("id",{count:"exact",head:true}).eq("game_id",game.id);
   return reply({ok:true,data:{challengeCount:challenges.length,completedCount:challenges.filter(c=>c.status!=="PENDING").length,challenges,everyoneComplete:(entries||[]).length>=challenges.length*(count||1)}});
  }

  const {data:rounds,error:roundErr}=await db.from("game_challenges").select("id,ordinal,challenges(title)").eq("game_id",game.id).order("ordinal");if(roundErr)throw roundErr;
  const {data:players,error:playersErr}=await db.from("players").select("id,name").eq("game_id",game.id);if(playersErr)throw playersErr;
  const {data:entries,error:entriesErr}=await db.from("entries").select("*").eq("game_id",game.id);if(entriesErr)throw entriesErr;
  const {data:votes,error:votesErr}=await db.from("votes").select("*").eq("game_id",game.id);if(votesErr)throw votesErr;
  const allComplete=rounds.length>0&&players.every(p=>rounds.every(r=>entries.some(e=>e.player_id===p.id&&e.game_challenge_id===r.id)));
  const available=(r:any)=>entries.filter(e=>e.game_challenge_id===r.id&&e.status==="SUBMITTED");
  const signed=async(path:string|null)=>{if(!path)return "";const {data,error}=await db.storage.from("findit-photos").createSignedUrl(path,900);if(error)throw error;return data.signedUrl;};
  const summary=async()=>{
   const rows=[] as any[];const wins=new Map<string,number>();
   for(const r of rounds){const candidates=available(r);const scores=candidates.map(e=>({entry:e,score:votes.filter(v=>v.round===1&&v.entry_id===e.id).length}));const top=Math.max(0,...scores.map(x=>x.score));const winners=scores.filter(x=>x.score===top).map(x=>x.entry);for(const e of winners)wins.set(e.player_id,(wins.get(e.player_id)||0)+1);
    rows.push({challengeId:r.id,challengeNumber:r.ordinal,name:r.challenges?.title||"",uncontested:candidates.length===1,winners:await Promise.all(winners.map(async e=>({entryId:e.id,playerId:e.player_id,name:players.find(p=>p.id===e.player_id)?.name||"Player",photoUrl:await signed(e.storage_path)})))});
   }
   const max=Math.max(0,...wins.values());const overall=[...wins].filter(([,n])=>n===max&&max>0).map(([id])=>({playerId:id,name:players.find(p=>p.id===id)?.name||"Player"}));
   return {challengeResults:rows,overallWinners:overall,maxChallengeWins:max,hasWinner:overall.length>0};
  };
  if(action==="getCompletionStatus")return reply({ok:true,data:{players:players.map(p=>({name:p.name,isHost:p.id===game.host_player_id,completedCount:rounds.filter(r=>entries.some(e=>e.player_id===p.id&&e.game_challenge_id===r.id)).length,challengeCount:rounds.length,complete:rounds.every(r=>entries.some(e=>e.player_id===p.id&&e.game_challenge_id===r.id))})),everyoneComplete:allComplete}});
  if(action==="submitPhoto"||action==="passChallenge"){
   if(game.status!=="PLAYING")return fail("Game is not accepting challenges.",409);
   const challengeId=String(input.challengeId||"");if(!rounds.some(r=>r.id===challengeId))return fail("Invalid challenge.",400);
   if(entries.some(e=>e.player_id===player.id&&e.game_challenge_id===challengeId))return fail("Challenge already completed.",409);
   let path:string|null=null;
   if(action==="submitPhoto"){
    const raw=String(input.photoData||"");if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(raw)||raw.length>1400000)return fail("Please upload a JPEG smaller than 1 MB.");
    const bytes=Uint8Array.from(atob(raw.split(",")[1]),c=>c.charCodeAt(0));if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)return fail("Invalid JPEG.");
    path=game.id+"/"+challengeId+"/"+player.id+".jpg";
    const {error}=await db.storage.from("findit-photos").upload(path,bytes,{contentType:"image/jpeg",upsert:false});if(error)throw error;
   }
   const {error}=await db.from("entries").insert({game_id:game.id,game_challenge_id:challengeId,player_id:player.id,status:path?"SUBMITTED":"PASSED",storage_path:path});if(error){if(path)await db.storage.from("findit-photos").remove([path]);throw error;}
   return reply({ok:true,data:{status:path?"SUBMITTED":"PASSED"}});
  }
  if(action==="startVoting"){
   if(!host||game.status!=="PLAYING"||!allComplete)return fail("All players must complete their challenges first.",403);
   const {error}=await db.from("games").update({status:"VOTING"}).eq("id",game.id).eq("status","PLAYING");if(error)throw error;
   return reply({ok:true,data:{started:true}});
  }
  const required=(r:any,pid:string)=>available(r).length>1&&!votes.some(v=>v.round===1&&v.voter_id===pid&&v.game_challenge_id===r.id);
  const completeVote=(pid:string)=>rounds.every(r=>!required(r,pid));
  const allVotingComplete=players.every(p=>completeVote(p.id));
  if(action==="getVotingState"){
   if(game.status!=="VOTING")return fail("Not voting yet.",409);
   const r=rounds.find(r=>required(r,player.id));
   if(!r)return reply({ok:true,data:{complete:true,allVotingComplete}});
   const selfVoteUsed=votes.some(v=>v.round===1&&v.voter_id===player.id&&entries.some(e=>e.id===v.entry_id&&e.player_id===player.id));
   return reply({ok:true,data:{complete:false,selfVoteUsed,challenge:{challengeId:r.id,challengeNumber:r.ordinal,name:r.challenges?.title||""},options:await Promise.all(available(r).map(async(e,i)=>({optionId:e.id,label:"Photo "+(i+1),photoUrl:await signed(e.storage_path)})))}});
  }
  if(action==="castVote"){
   if(game.status!=="VOTING")return fail("Voting is not open.",409);
   const r=rounds.find(r=>r.id===String(input.challengeId||""));const e=entries.find(e=>e.id===String(input.entryId||""));
   if(!r||!e||e.game_challenge_id!==r.id||e.status!=="SUBMITTED"||!required(r,player.id))return fail("Invalid or duplicate vote.",409);
   if(e.player_id===player.id&&votes.some(v=>v.round===1&&v.voter_id===player.id&&entries.some(x=>x.id===v.entry_id&&x.player_id===player.id)))return fail("Only one self-vote per game.",403);
   const {error}=await db.from("votes").insert({game_id:game.id,game_challenge_id:r.id,voter_id:player.id,entry_id:e.id,round:1});if(error)throw error;
   return reply({ok:true,data:{voted:true}});
  }
  if(action==="getVotingProgress")return reply({ok:true,data:{players:players.map(p=>({name:p.name,isHost:p.id===game.host_player_id,complete:completeVote(p.id)})),allVotingComplete}});
  if(action==="finishGame"){
   if(!host||game.status!=="VOTING"||!allVotingComplete)return fail("Voting has not finished.",403);
   const {error}=await db.from("games").update({status:"FINISHED"}).eq("id",game.id).eq("status","VOTING");if(error)throw error;
   return reply({ok:true,data:{finished:true}});
  }
  if(action==="getResults"){
   if(game.status!=="FINISHED")return fail("Results are not ready.",409);
   return reply({ok:true,data:await summary()});
  }
  if(action==="cleanupFinishedGame"){
   if(!host||game.status!=="FINISHED")return fail("Only the host can close a finished game.",403);
   const results=await summary();const winningIds=new Set(results.overallWinners.map((p:any)=>p.playerId));
   const keep=entries.filter(e=>winningIds.has(e.player_id)&&e.storage_path).sort((a,b)=>votes.filter(v=>v.entry_id===b.id).length-votes.filter(v=>v.entry_id===a.id).length)[0];
   if(keep){const {data:file,error}=await db.storage.from("findit-photos").download(keep.storage_path);if(error)throw error;const target="winner-"+crypto.randomUUID()+".jpg";const {error:uploadError}=await db.storage.from("findit-photos").upload("winners/"+target,file,{contentType:"image/jpeg"});if(uploadError)throw uploadError;}
   const paths=entries.map(e=>e.storage_path).filter(Boolean) as string[];if(paths.length){const {error}=await db.storage.from("findit-photos").remove(paths);if(error)throw error;}
   const {error}=await db.from("games").delete().eq("id",game.id);if(error)throw error;
   return reply({ok:true,data:{cleaned:true}});
  }
  return fail("Unknown action.",404);
 }catch(e){console.error("findit-api",e);return fail("Server request failed.",500);}
});