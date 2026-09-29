/* Find It! V2 - challenge cards, progress and completion UI */
(function(){
 let loading=false,hostProgressTimer=null,hostProgressLoading=false,startVotingBusy=false;

 async function loadChallenges(){
  const session=FindItApp.state.session;
  if(!session||loading)return;
  if(!FindItApp.state.game||FindItApp.state.game.status!=="PLAYING"){stopHostProgressRefresh();return;}
  loading=true;
  try{
   const data=await FindItAPI.get("getChallenges",{gameCode:session.gameCode,playerId:session.playerId,_t:Date.now()});
   render(data);
  }catch(error){
   console.warn("[FindIt Challenges] LOAD FAILED - existing cards preserved",error);
   FindItApp.showMessage("challengeMessage","Connection interrupted — challenges kept. Retrying…",false);
  }finally{loading=false;}
 }

 function openChallenge(challenge){
  console.log("[FindIt Challenges] CARD ACTIVATED",{challengeId:challenge&&challenge.challengeId,photoModule:!!window.FindItPhotos,session:!!FindItApp.state.session});
  if(!challenge)return;
  if(!window.FindItPhotos||typeof window.FindItPhotos.open!=="function"){
   console.error("[FindIt Challenges] PHOTO MODULE NOT READY",window.FindItPhotos);
   FindItApp.showMessage("challengeMessage","Photo activity did not load. Please reload the page.",true);
   return;
  }
  window.FindItPhotos.open(challenge);
 }

 function render(data){
  const total=Number(data.challengeCount||0),done=Number(data.completedCount||0);
  document.getElementById("progressText").textContent=done+" / "+total+" Complete";
  document.getElementById("progressBar").style.width=(total?Math.round(done/total*100):0)+"%";
  const cards=document.getElementById("challengeCards");
  const challenges=Array.isArray(data.challenges)?data.challenges:[];

  if(challenges.length){
   const fragment=document.createDocumentFragment();
   challenges.forEach(challenge=>{
    const complete=challenge.status==="SUBMITTED"||challenge.status==="PASSED";
    const button=document.createElement("button");
    button.type="button";
    button.className="challenge-card"+(complete?" complete":"");
    button.dataset.challengeId=String(challenge.challengeId||"");
    button.disabled=complete;
    button.setAttribute("aria-disabled",complete?"true":"false");
    button.innerHTML='<span class="challenge-number">Challenge '+challenge.challengeNumber+'</span><strong>'+escapeHtml(challenge.name)+'</strong><span class="challenge-description">'+escapeHtml(challenge.description)+'</span><span class="challenge-status">'+(challenge.status==="SUBMITTED"?"✓ Photo submitted":challenge.status==="PASSED"?"✓ Passed":"Tap to open →")+'</span>';
    if(!complete){
     button.onclick=function(event){
      event.preventDefault();
      event.stopPropagation();
      openChallenge(challenge);
     };
    }
    fragment.appendChild(button);
   });
   cards.replaceChildren(fragment);
   console.log("[FindIt Challenges] CARDS READY",{count:challenges.length,open:challenges.filter(c=>c.status!=="SUBMITTED"&&c.status!=="PASSED").length,photoModule:!!window.FindItPhotos});
  }else if(!cards.children.length){
   cards.innerHTML='<div class="empty-state">No challenges were returned for this game.</div>';
  }

  const panel=document.getElementById("completionPanel");
  panel.hidden=done!==total||total===0;
  if(done===total&&total>0){
   document.getElementById("completionTitle").textContent="All done!";
   document.getElementById("completionText").textContent=data.everyoneComplete?"Everyone has completed the challenges.":"You've completed all challenges. Waiting for the other players...";
  }
  if(FindItApp.state.session&&FindItApp.state.session.isHost&&FindItApp.state.game&&FindItApp.state.game.status==="PLAYING")startHostProgressRefresh();else stopHostProgressRefresh();
  FindItApp.showMessage("challengeMessage","",false);
 }

 function markComplete(challengeId,status){
  const cards=document.getElementById("challengeCards");
  if(!cards)return;
  const card=Array.from(cards.querySelectorAll(".challenge-card")).find(el=>String(el.dataset.challengeId||"")===String(challengeId||""));
  if(!card||card.disabled)return;
  card.disabled=true;
  card.classList.add("complete");
  card.setAttribute("aria-disabled","true");
  card.onclick=null;
  const statusEl=card.querySelector(".challenge-status");
  if(statusEl)statusEl.textContent=status==="PASSED"?"✓ Passed":"✓ Photo submitted";
  const progress=document.getElementById("progressText");
  const match=String(progress&&progress.textContent||"").match(/(\d+)\s*\/\s*(\d+)/);
  if(match){
   const total=Number(match[2]||0),done=Math.min(total,Number(match[1]||0)+1);
   progress.textContent=done+" / "+total+" Complete";
   document.getElementById("progressBar").style.width=(total?Math.round(done/total*100):0)+"%";
   const panel=document.getElementById("completionPanel");
   if(panel&&done===total&&total>0){
    panel.hidden=false;
    document.getElementById("completionTitle").textContent="All done!";
    document.getElementById("completionText").textContent="You've completed all challenges. Waiting for the other players...";
   }
  }
  console.log("[FindIt Challenges] LOCAL PROGRESS UPDATED",{challengeId,status});
 }

 function startHostProgressRefresh(){if(hostProgressTimer||hostProgressLoading||!FindItApp.state.game||FindItApp.state.game.status!=="PLAYING"||!FindItApp.state.session||!FindItApp.state.session.isHost)return;scheduleNextHostProgress(0);}
 function scheduleNextHostProgress(delay){if(hostProgressTimer)clearTimeout(hostProgressTimer);if(!FindItApp.state.game||FindItApp.state.game.status!=="PLAYING"||!FindItApp.state.session||!FindItApp.state.session.isHost){stopHostProgressRefresh();return;}hostProgressTimer=setTimeout(async()=>{hostProgressTimer=null;await loadHostProgress();if(FindItApp.state.game&&FindItApp.state.game.status==="PLAYING"&&FindItApp.state.session&&FindItApp.state.session.isHost)scheduleNextHostProgress(1500);else stopHostProgressRefresh();},delay);}
 function stopHostProgressRefresh(){if(hostProgressTimer)clearTimeout(hostProgressTimer);hostProgressTimer=null;}
 async function loadHostProgress(){const session=FindItApp.state.session;if(!session||!session.isHost||!FindItApp.state.game||FindItApp.state.game.status!=="PLAYING"||hostProgressLoading)return;hostProgressLoading=true;try{const data=await FindItAPI.get("getCompletionStatus",{gameCode:session.gameCode,playerId:session.playerId,_t:Date.now()});if(!FindItApp.state.game||FindItApp.state.game.status!=="PLAYING")return;const box=document.getElementById("hostProgress");box.hidden=false;box.innerHTML='<h3>Player progress</h3>'+data.players.map(p=>'<div class="player-progress"><span>'+escapeHtml(p.name)+(p.isHost?' (Host)':'')+'</span><strong>'+p.completedCount+'/'+p.challengeCount+(p.complete?' ✓':'')+'</strong></div>').join('')+(data.everyoneComplete?'<p class="ready-note">Everyone is complete. Ready to vote.</p><button id="startVotingButton" class="button primary">Start Voting</button>':'');if(data.everyoneComplete){const button=document.getElementById("startVotingButton");button.disabled=startVotingBusy;button.onclick=startVoting;}}catch(error){console.warn("[FindIt Challenges] Completion poll failed; preserving progress.",error);}finally{hostProgressLoading=false;}}

 function withTimeout(promise,ms){return Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>{const e=new Error("Start Voting response timed out.");e.code="START_VOTING_TIMEOUT";reject(e);},ms))]);}
 async function verifyVotingState(){try{await FindItApp.pollNow();return !!(FindItApp.state.game&&FindItApp.state.game.status==="VOTING");}catch(_){return false;}}
 async function startVoting(){
  if(startVotingBusy)return;
  const button=document.getElementById("startVotingButton"),s=FindItApp.state.session;
  if(!s)return;
  startVotingBusy=true;if(button)button.disabled=true;FindItApp.showMessage("challengeMessage","Starting voting…",false);
  try{await withTimeout(FindItAPI.post("startVoting",{gameCode:s.gameCode,playerId:s.playerId}),12000);stopHostProgressRefresh();await FindItApp.pollNow();}
  catch(error){const nowVoting=await verifyVotingState();if(nowVoting){stopHostProgressRefresh();return;}FindItApp.showMessage("challengeMessage",error.message||"Could not start voting. Please try again.",true);}
  finally{startVotingBusy=false;const currentButton=document.getElementById("startVotingButton");if(currentButton&&(!FindItApp.state.game||FindItApp.state.game.status==="PLAYING"))currentButton.disabled=false;}
 }

 function escapeHtml(value){return String(value||"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
 window.FindItChallenges={load:loadChallenges,stopHostProgressRefresh,openChallenge,markComplete};
})();
