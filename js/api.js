/* Supabase transport. Apps Script remains active until deployment is verified. */
(function(){
 const legacy=window.FindItAPI;
 const enabled=window.FINDIT_CONFIG.backend==='supabase'||new URLSearchParams(location.search).get('backend')==='supabase';
 if(!enabled){legacy.isSupabase=false;return;}
 let pending=null;
 function newToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');}
 async function send(action,data){
  const joining=action==='createGame'||action==='joinGame';
  const session=FindItSession.get();
  if(joining&&!pending)pending={action,token:newToken()};
  if(joining&&pending.action!==action)pending={action,token:newToken()};
  const token=joining?pending.token:session&&session.sessionToken;
  if(action==='getLatestWinner')return {hasWinner:false};
  if(!token)throw Object.assign(new Error('Your player session is not available.'),{code:'SESSION_INVALID'});
  const response=await fetch(window.FINDIT_CONFIG.supabaseApiUrl,{
   method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify(Object.assign({},data,{action})),signal:AbortSignal.timeout(45000)
  });
  let payload;try{payload=await response.json();}catch{throw new Error('The game service could not be reached. Please retry.');}
  if(!response.ok||!payload.ok){
   const error=Object.assign(new Error(payload.error?.message||'The game request failed.'),{code:payload.error?.code});
   if(joining&&['NAME_IN_USE','GAME_ALREADY_STARTED','GAME_NOT_FOUND','SESSION_INVALID'].includes(error.code))pending=null;
   throw error;
  }
  if(joining){payload.data.player.sessionToken=token;pending=null;}
  return payload.data;
 }
 window.FindItAPI={isSupabase:true,get:send,post:send};
})();
