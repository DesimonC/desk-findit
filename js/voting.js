/* Find It! V2 - anonymous voting UI */
(function(){
 let current=null,busy=false,progressTimer=null,loading=false,loadedStatus=null;
 async function load(){
  const s=FindItApp.state.session;if(!s||!["VOTING","RUNOFF"].includes(FindItApp.state.game?.status)||busy||loading)return;
  if(loadedStatus===FindItApp.state.game.status)return;
  loading=true;
  try{const data=await FindItAPI.get("getVotingState",{gameCode:s.gameCode,playerId:s.playerId,_t:Date.now()});if(FindItApp.state.session!==s)return;render(data);loadedStatus=data.round===2?"RUNOFF":"VOTING";if(s.isHost){await loadProgress();startProgressPolling();}}
  catch(error){console.warn("[FindIt Voting] Voting-state load failed; preserving current voting screen.",error);FindItApp.showMessage("votingMessage","Connection interrupted — retrying voting…",false);}
  finally{loading=false;}
 }
 function render(data){
  const area=document.getElementById("votingArea");FindItApp.showMessage("votingMessage","",false);
  if(data.complete){current=null;area.innerHTML='<div class="panel completion-panel"><h3>Votes submitted!</h3><p>'+(data.allVotingComplete?'Everyone has finished voting.':'Waiting for the other players to finish voting...')+'</p></div>';return;}
  if(!data.challenge||!Array.isArray(data.options)||!data.options.length){console.warn("[FindIt Voting] Server returned an incomplete active voting state; keeping existing UI.",data);return;}
  current=data;document.getElementById("votingChallengeNumber").textContent="Challenge "+data.challenge.challengeNumber;document.getElementById("votingChallengeName").textContent=data.challenge.name;document.getElementById("selfVoteNotice").textContent=data.round===2?"Final vote: choose any tied photo. If this vote ties, the earliest uploaded photo wins.":data.selfVoteUsed?"Your one self-vote has already been used.":"You may vote for your own photo once during the whole game.";area.innerHTML='<div class="vote-grid">'+data.options.map(o=>'<button type="button" class="vote-card" data-entry="'+o.optionId+'"'+(o.disabled?' disabled':'')+'><img src="'+o.photoUrl+'" alt="Anonymous challenge photo"><strong>'+o.label+(o.disabled?' · Self-vote used':'')+'</strong></button>').join('')+'</div>';area.querySelectorAll(".vote-card").forEach(b=>b.addEventListener("click",()=>vote(b.dataset.entry)));
 }
 async function vote(entryId){
  if(!current||busy)return;if(!window.confirm("Vote for this photo?"))return;busy=true;const votedChallenge=current.challenge.challengeId;
  try{const s=FindItApp.state.session;await FindItAPI.post("castVote",{gameCode:s.gameCode,playerId:s.playerId,challengeId:votedChallenge,entryId});current=null;await FindItApp.pollNow();}
  catch(error){FindItApp.showMessage("votingMessage",error.message,true);}
  finally{busy=false;loadedStatus=null;await load();}
 }
 async function loadProgress(){
  const s=FindItApp.state.session;if(!s||!s.isHost||!["VOTING","RUNOFF"].includes(FindItApp.state.game?.status))return;
  try{const data=await FindItAPI.get("getVotingProgress",{gameCode:s.gameCode,playerId:s.playerId,_t:Date.now()}),box=document.getElementById("votingProgress");box.hidden=false;box.innerHTML='<h3>Voting progress</h3>'+data.players.map(p=>'<div class="player-progress"><span>'+escapeHtml(p.name)+(p.isHost?' (Host)':'')+'</span><strong>'+(p.complete?'Done ✓':'Voting…')+'</strong></div>').join('')+(data.allVotingComplete?'<p class="ready-note">Everyone has voted. Results are ready.</p><button id="finishGameButton" class="button primary">Reveal Winners</button>':'');
   if(data.allVotingComplete){stopProgressPolling();const finishButton=document.getElementById("finishGameButton");if(finishButton)finishButton.addEventListener("click",finish);}
  }catch(error){console.warn("[FindIt Voting] Voting-progress poll failed; preserving current voting UI.",error);}
 }
 function startProgressPolling(){if(progressTimer)return;progressTimer=setInterval(()=>{if(!["VOTING","RUNOFF"].includes(FindItApp.state.game?.status)){stopProgressPolling();return;}loadProgress();},window.FINDIT_CONFIG.pollMs||3000);}
 function stopProgressPolling(){if(progressTimer)clearInterval(progressTimer);progressTimer=null;}
 async function finish(){stopProgressPolling();const b=document.getElementById("finishGameButton");if(b)b.disabled=true;try{const s=FindItApp.state.session;await FindItAPI.post("finishGame",{gameCode:s.gameCode,playerId:s.playerId});await FindItApp.pollNow();}catch(error){FindItApp.showMessage("votingMessage",error.message,true);if(b)b.disabled=false;startProgressPolling();}}
 function escapeHtml(v){return String(v||"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
 window.FindItVoting={load,loadProgress,stopProgressPolling,reset(){stopProgressPolling();current=null;busy=false;loading=false;loadedStatus=null;}};
})();
