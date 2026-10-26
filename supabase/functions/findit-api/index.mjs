import {newGame, join, identify, state, mutate, read, fail} from './game.mjs';

const READS=new Set(['getGameState','getChallenges','getCompletionStatus','getVotingState','getVotingProgress','getResults']);
const WRITES=new Set(['startGame','submitPhoto','passChallenge','startVoting','castVote','finishGame','cleanupFinishedGame']);
const BUCKET='findit-photos';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
export async function digest(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}

// Dependency-free REST adapter; privileged credentials exist only in the function environment.
export function backend(env, request=fetch){
  const base=env.get('SUPABASE_URL'),key=env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!base||!key)fail('CONFIGURATION_ERROR','The game service is not configured.');
  const headers={apikey:key,Authorization:'Bearer '+key};
  async function api(path,options={}){
    const res=await request(base+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(20000)});
    if(!res.ok){const detail=await res.text();throw Object.assign(new Error('The game service could not complete that request.'),{code:'BACKEND_ERROR',status:res.status,detail});}
    return res.status===204?null:res.json();
  }
  return {
    async get(code){return (await api('/rest/v1/findit_games?code=eq.'+code+'&select=*'))[0]||null;},
    async insert(row){return api('/rest/v1/findit_games',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify(row)});},
    async replace(row,data){const result=await api('/rest/v1/findit_games?code=eq.'+row.code+'&version=eq.'+row.version,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({data,version:row.version+1})});return result.length>0;},
    async capacity(creator){const rows=await api('/rest/v1/findit_games?select=code&limit=500');if(rows.length>=500)fail('SERVICE_BUSY','The game service is busy. Please try later.');const recent=await api('/rest/v1/findit_games?select=code&limit=10&creator_hash=eq.'+creator+'&created_at=gte.'+encodeURIComponent(new Date(Date.now()-3600000).toISOString()));if(recent.length>=10)fail('RATE_LIMITED','Please wait before hosting another game.');},
    async expired(){return api('/rest/v1/findit_games?select=*&limit=50&expires_at=lt.'+encodeURIComponent(new Date().toISOString()));},
    async upload(path,bytes){return api('/storage/v1/object/'+BUCKET+'/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:bytes});},
    async remove(paths){if(paths.length)await api('/storage/v1/object/'+BUCKET,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:paths})});},
    async sign(path){const result=await api('/storage/v1/object/sign/'+BUCKET+'/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:300})});return base+'/storage/v1'+result.signedURL;},
    async cleanup(row){
      // Storage API removes bytes as well as metadata. Never DELETE storage.objects with SQL.
      const files=await api('/storage/v1/object/list/'+BUCKET,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:row.data.storagePrefix,limit:1000,offset:0})});
      await this.remove(files.filter(f=>f.id).map(f=>row.data.storagePrefix+'/'+f.name));
      await api('/rest/v1/findit_games?code=eq.'+row.code+'&version=eq.'+row.version,{method:'DELETE'});
    }
  };
}
async function hydrate(value,store){
  // Signed URLs are issued only for photos selected by the authorised game rules.
  if(Array.isArray(value))return Promise.all(value.map(v=>hydrate(v,store)));
  if(value&&typeof value==='object'){
    const result={};for(const [k,v] of Object.entries(value)){if(k==='photoPath'){if(v)result.photoUrl=await store.sign(v);}else result[k]=await hydrate(v,store);}return result;
  }return value;
}
function decodePhoto(data){
  if(typeof data!=='string'||data.length>560000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(data))fail('PHOTO_REQUIRED','Choose a JPEG photo smaller than 400 KB.');
  let bytes;try{bytes=Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0));}catch{fail('PHOTO_REQUIRED','The photo could not be read.');}
  if(bytes.length>400*1024||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)fail('PHOTO_REQUIRED','Choose a valid JPEG photo smaller than 400 KB.');return bytes;
}
export function handler(env,makeBackend=()=>backend(env)){
  return async req=>{
    if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
    if(req.method!=='POST')return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'Use POST.'}},405);
    let uploaded=null,uploadCode=null,store;
    try{
      // Limit streamed input as well as Content-Length (which is not always present).
      const reader=req.body?.getReader();if(!reader)fail('INVALID_JSON','Request body is required.');
      const chunks=[];let length=0;while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>600000){await reader.cancel();fail('PAYLOAD_TOO_LARGE','The photo is too large.');}chunks.push(value);}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('INVALID_JSON','Invalid request.');}
      if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_JSON','Invalid request.');
      const action=String(input.action||'');store=makeBackend();
      if(action==='health')return json({ok:true,data:{status:'ok',backend:'supabase',version:'3.0.0'}});
      if(action==='sweepExpired'){
        const secret=env.get('FINDIT_CLEANUP_SECRET');if(!secret||req.headers.get('Authorization')!=='Bearer '+secret)fail('SESSION_INVALID','Not authorised.');
        let cleaned=0;for(const row of await store.expired()){await store.cleanup(row);cleaned++;}return json({ok:true,data:{cleaned}});
      }
      const token=String(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
      if(!/^[a-f0-9]{64}$/.test(token))fail('SESSION_INVALID','A valid player session is required.');
      const hash=await digest(token),identity={hash,id:crypto.randomUUID()},now=new Date().toISOString();
      const code=String(input.gameCode||'').trim().toUpperCase();
      if(action==='createGame'){
        const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        const generated=Array.from({length:6},(_,i)=>alphabet[parseInt(hash.slice(i*2,i*2+2),16)%32]).join('');
        const existing=await store.get(generated);
        if(existing){const p=identify(existing.data,hash);return json({ok:true,data:state(existing.data,p)});}
        const g=newGame(generated,input,identity,now);g.storagePrefix=crypto.randomUUID();
        const creator=await digest((env.get('SUPABASE_SERVICE_ROLE_KEY')||'')+'|'+(req.headers.get('x-forwarded-for')||'unknown').split(',')[0]);
        await store.capacity(creator);
        try{await store.insert({code:generated,version:1,data:g,creator_hash:creator,expires_at:new Date(Date.now()+86400000).toISOString()});}
        catch(error){if(error.status===409){const row=await store.get(generated);if(row)return json({ok:true,data:state(row.data,identify(row.data,hash))});}throw error;}
        return json({ok:true,data:state(g,g.players[0])});
      }
      if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))fail('GAME_CODE_REQUIRED','Enter the six-character game code.');
      if(action!=='joinGame'&&!READS.has(action)&&!WRITES.has(action))fail('UNKNOWN_ACTION','Unknown action.');
      const entryId=crypto.randomUUID();
      for(let attempt=0;attempt<8;attempt++){
        const row=await store.get(code);if(!row)fail('GAME_NOT_FOUND','This game has ended or could not be found.');
        if(Date.parse(row.expires_at)<=Date.now())fail('GAME_NOT_FOUND','This game has expired.');
        const g=structuredClone(row.data);
        if(action==='joinGame'){
          const result=join(g,input,identity);
          if(await store.replace(row,g))return json({ok:true,data:result});continue;
        }
        const p=identify(g,hash);
        if(input.playerId!==p.playerId)fail('SESSION_INVALID','This player session is no longer valid.');
        if(g.status==='CLOSING'&&action!=='cleanupFinishedGame')fail('GAME_NOT_FOUND','The host has closed this game.');
        if(READS.has(action))return json({ok:true,data:await hydrate(read(g,p,action),store)});
        const operation={...input,entryId:action==='castVote'?input.entryId:entryId};
        if(action==='submitPhoto'){
          // Validate session, state and challenge before accepting any storage write.
          if(g.status!=='PLAYING'||!g.challenges.some(c=>c.challengeId===input.challengeId))fail('INVALID_GAME_STATE','This photo is not expected now.');
          if(g.entries.some(e=>e.playerId===p.playerId&&e.challengeId===input.challengeId))fail('CHALLENGE_ALREADY_COMPLETE','This challenge is already complete.');
          const path=g.storagePrefix+'/'+entryId+'.jpg';
          if(!uploaded){const photo=decodePhoto(input.photoData);await store.upload(path,photo);uploaded=path;uploadCode=code;}
          operation.photoPath=uploaded;
        }
        const result=mutate(g,p,action,operation,now);
        if(await store.replace(row,g)){
          uploaded=null;
          if(action==='cleanupFinishedGame')await store.cleanup({...row,data:g,version:row.version+1});
          return json({ok:true,data:result});
        }
      }
      fail('SERVICE_BUSY','Other players are updating this game. Please retry.');
    }catch(error){
      if(uploaded&&store){
        try{
          const row=await store.get(uploadCode),saved=row?.data.entries.find(e=>e.photoPath===uploaded);
          if(saved)return json({ok:true,data:{entryId:saved.entryId,status:'SUBMITTED'}});
          await store.remove([uploaded]);
        }catch{console.error('Upload outcome uncertain; expiry sweep will retry cleanup.');}
      }
      const code=error.code||'SERVER_ERROR';
      console.warn('Find It request failed:',code); // No names, session tokens or photo data in logs.
      return json({ok:false,error:{code,message:code==='SERVER_ERROR'?'The game service is temporarily unavailable.':error.message}},code==='SESSION_INVALID'?401:400);
    }
  };
}
if(import.meta.main)Deno.serve(handler(Deno.env));
