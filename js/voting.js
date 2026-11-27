/* Find It! V2 - anonymous voting UI */
(function(){
 let current=null,busy=false,progressTimer=null,loading=false;
 async function load(){
  const s=FindItApp.state.session;if(!s||!["VOTING","OVERALL_VOTING"].includes(FindItApp.state.game?.status)||busy||loading)return;
  loading=true;
  try{const data=await FindItAPI.get("getVotingState",{gameCode:s.gameCode,playerId:s.playerId,_t:Date.now()});render(data);if(s.isHost){await loadProgress();startProgressPolling();}if(data.overallTieBreak)startProgressPolling();}
  catch(error){console.warn("[FindIt Voting] Voting-state load failed; preserving current voting screen.",error);FindItApp.showMessage("votingMessage","Connection interrupted — retrying voting…",false);}
  finally{loading=false;}
 }
 function render(data){
  const area=document.getElementById("votingArea");FindItApp.showMessage("votingMessage","",false);
  if(data.complete){current=null;area.innerHTML='<div class="panel completion-panel"><h3>Votes submitted!</h3><p>'+(data.overallTieBreak?'Waiting for the next tie-break round or overall reveal.':data.allVotingComplete?'Everyone has finished voting.':'Waiting for the other players to finish voting...')+'</p></div>';return;}
  if(!data.challenge||!Array.isArray(data.options)||!data.options.length){console.warn("[FindIt Voting] Server returned an incomplete active voting state; keeping existing UI.",data);return;}
  current=data;
  document.getElementById("votingChallengeNumber").textContent=data.overallTieBreak?"OVERALL TIE-BREAK · ROUND "+data.round:"Challenge "+data.challenge.challengeNumber;
  document.getElementById("votingChallengeName").textContent=data.challenge.name;
  document.getElementById("selfVoteNotice").textContent=data.overallTieBreak?"Vote for one eligible challenge-winning photo. If the vote ties, another round will use only the photos tied in this round.":selfVoteNotice(data);
  area.innerHTML='<div class="vote-grid">'+data.options.map(o=>'<div class="vote-option"><button type="button" class="vote-card" data-entry="'+o.optionId+'"><img src="'+o.photoUrl+'" alt="Anonymous challenge photo"><strong>'+o.label+'</strong></button>'+(o.reported?'<p class="reported-note" role="status">Reported for host review</p>':'')+(data.overallTieBreak?'':'<button type="button" class="button ghost report-photo-button" data-entry="'+o.optionId+'" '+(o.reportedByMe?'disabled':'')+'>'+(o.reportedByMe?'Report sent':'Report photo')+'</button>')+'</div>').join('')+'</div>';
  area.querySelectorAll(".vote-card").forEach(b=>b.addEventListener("click",()=>vote(b.dataset.entry)));
  area.querySelectorAll(".report-photo-button:not(:disabled)").forEach(b=>b.addEventListener("click",()=>reportPhoto(b.dataset.entry)));
 }
 function selfVoteNotice(data){
  if(Number.isInteger(data.selfVoteLimit)&&Number.isInteger(data.selfVotesUsed)){
   return "Self-votes remaining: "+Math.max(0,data.selfVoteLimit-data.selfVotesUsed)+" of "+data.selfVoteLimit;
  }
  return data.selfVoteUsed?"Your one self-vote has already been used.":"You may vote for your own photo once during the whole game.";
 }
 async function vote(entryId){
  if(!current||busy)return;if(!window.confirm(current.overallTieBreak?"Vote for this photo in the overall tie-break?":"Vote for this photo?"))return;busy=true;const votedChallenge=current.challenge.challengeId,isOverall=current.overallTieBreak;
  try{const s=FindItApp.state.session;await FindItAPI.post("castVote",{gameCode:s.gameCode,playerId:s.playerId,challengeId:votedChallenge,entryId});current=null;}
  catch(error){FindItApp.showMessage("votingMessage",error.message,true);}
  finally{busy=false;if(isOverall){await FindItApp.pollNow();if(FindItApp.state.game?.status==="OVERALL_VOTING")await load();}else await load();}
 }
 async function reportPhoto(entryId){
  if(!current||busy)return;
  if(!window.confirm("Report this photo to the host for a possible breach of the Photo Safety Agreement? Reporting will not count as your vote."))return;
  busy=true;
  let message="Report sent privately to the host for review.",isError=false;
  try{const s=FindItApp.state.session;await FindItAPI.post("reportPhoto",{gameCode:s.gameCode,playerId:s.playerId,challengeId:current.challenge.challengeId,entryId});}
  catch(error){message=error.message||"Could not send the report. Please tell the host.";isError=true;}
  finally{busy=false;await load();FindItApp.showMessage("votingMessage",message,isError);}
 }
 async function loadProgress(){
  const s=FindItApp.state.session;if(!s||!s.isHost||!["VOTING","OVERALL_VOTING"].includes(FindItApp.state.game?.status))return;
  try{const data=await FindItAPI.get("getVotingProgress",{gameCode:s.gameCode,playerId:s.playerId,_t:Date.now()}),box=document.getElementById("votingProgress"),reports=data.pendingReports||[],reportHtml=reports.length?'<div class="photo-reports"><h3>Reported photos</h3><p>Review each report. You can remove the photo, send a warning and remove it, block the player from this game, or dismiss the report.</p>'+reports.map(r=>'<article class="photo-report"><img src="'+r.photoUrl+'" alt="Reported photo"><p><strong>'+escapeHtml(r.reportedName)+'</strong> · '+escapeHtml(r.challengeName)+'</p><p>'+escapeHtml(r.reason)+'</p><button type="button" class="button secondary resolve-report" data-report="'+r.reportId+'" data-decision="REMOVE">Remove photo</button><button type="button" class="button secondary resolve-report" data-report="'+r.reportId+'" data-decision="WARN">Warn player and remove photo</button><button type="button" class="button secondary resolve-report" data-report="'+r.reportId+'" data-decision="BLOCK">Block player from this game</button><button type="button" class="button ghost resolve-report" data-report="'+r.reportId+'" data-decision="DISMISS">Dismiss report</button></article>').join('')+'</div>':'',reportBlock=reports.length?'<p class="ready-note">Review all reported photos before revealing winners.</p>':'';box.hidden=false;box.innerHTML='<h3>Voting progress</h3>'+data.players.map(p=>'<div class="player-progress"><span>'+escapeHtml(p.name)+(p.isHost?' (Host)':'')+'</span><strong>'+(p.complete?'Done ✓':'Voting…')+'</strong></div>').join('')+reportHtml+reportBlock+(data.allVotingComplete&&!reports.length&&!data.overallTieBreak?'<p class="ready-note">Everyone has voted. Challenge results are ready.</p><button id="finishGameButton" class="button primary">Reveal Challenge Winners</button>':data.overallTieBreak?'<p class="ready-note">Tie-break round '+data.round+'. If the vote ties, another round will use only the tied photos.</p>':'');
   box.querySelectorAll(".resolve-report").forEach(button=>button.addEventListener("click",()=>resolveReport(button.dataset.report,button.dataset.decision)));
   if(data.allVotingComplete&&!data.overallTieBreak){stopProgressPolling();const finishButton=document.getElementById("finishGameButton");if(finishButton)finishButton.addEventListener("click",finish);}
  }catch(error){console.warn("[FindIt Voting] Voting-progress poll failed; preserving current voting UI.",error);}
 }
 function startProgressPolling(){if(progressTimer)return;progressTimer=setInterval(()=>{const status=FindItApp.state.game?.status;if(status!=="VOTING"&&status!=="OVERALL_VOTING"){stopProgressPolling();return;}if(status==="OVERALL_VOTING"){load();if(FindItApp.state.session?.isHost)loadProgress();}else loadProgress();},window.FINDIT_CONFIG.pollMs||3000);}
 function stopProgressPolling(){if(progressTimer)clearInterval(progressTimer);progressTimer=null;}
 async function finish(){stopProgressPolling();const b=document.getElementById("finishGameButton");if(b)b.disabled=true;try{const s=FindItApp.state.session;await FindItAPI.post("finishGame",{gameCode:s.gameCode,playerId:s.playerId});await FindItApp.pollNow();}catch(error){FindItApp.showMessage("votingMessage",error.message,true);if(b)b.disabled=false;startProgressPolling();}}
 async function resolveReport(reportId,decision){const prompts={REMOVE:"Remove this photo from the game and voting?",WARN:"Remove this photo and send the player a safety warning? They will see it when they next open their personal rejoin link.",BLOCK:"Block this player from this game and remove all their photos? They will see a block notice when they next open their personal rejoin link.",DISMISS:"Dismiss this report and keep the photo available?"};if(!window.confirm(prompts[decision]||"Review this report?"))return;try{const s=FindItApp.state.session;await FindItAPI.post("resolvePhotoReport",{gameCode:s.gameCode,playerId:s.playerId,reportId,decision});FindItApp.showMessage("votingMessage",decision==="REMOVE"?"Photo removed from the game.":decision==="WARN"?"Photo removed and warning queued for the player.":decision==="BLOCK"?"Player blocked from this game.":"Report dismissed; photo remains in the game.",false);await loadProgress();await load();}catch(error){FindItApp.showMessage("votingMessage",error.message||"Could not resolve this report.",true);}}
 function escapeHtml(v){return String(v||"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
 window.FindItVoting={load,loadProgress,stopProgressPolling};
})();
