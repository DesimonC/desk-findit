/* Find It! V2 - final results + latest winner splash */
(function(){
 let loaded=false;
 async function load(){
  const s=FindItApp.state.session;
  if(!s||loaded)return;
  try{
   const data=await FindItAPI.get("getResults",{gameCode:s.gameCode,playerId:s.playerId,_t:Date.now()});
   loaded=true;
   render(data);
  }catch(error){FindItApp.showMessage("resultsMessage",error.message,true);}
 }
 function render(data){
  const box=document.getElementById("finalResults");
  let html;
  if(!data.hasWinner||!data.overallWinners.length){
   html='<div class="winner-hero"><p class="eyebrow">GAME COMPLETE</p><h3>No Winner</h3><p>No photos were submitted, so this game has no winner.</p></div>';
  }else{
   const tied=data.overallWinners.length>1;
   html='<div class="winner-hero"><p class="eyebrow">'+(tied?'JOINT WINNERS':'OVERALL WINNER')+'</p><h3>'+data.overallWinners.map(w=>escapeHtml(w.name)).join(' & ')+'</h3><p>'+data.maxChallengeWins+' challenge win'+(data.maxChallengeWins===1?'':'s')+'</p></div>';
  }
  if(data.challengeResults&&data.challengeResults.length){
   html+='<div class="result-list"><h3>Challenge winners</h3>'+data.challengeResults.map(c=>'<div class="result-card"><span class="challenge-number">Challenge '+c.challengeNumber+'</span><h4>'+escapeHtml(c.name)+'</h4>'+(c.winners.length?'<div class="winner-photos">'+c.winners.map(w=>'<figure><img src="'+w.photoUrl+'" alt="Winning photo"><figcaption>'+escapeHtml(w.name)+(c.uncontested?' · uncontested':c.winners.length>1?' · joint winner':'')+'</figcaption></figure>').join('')+'</div>':'<p class="hint">No photo submitted.</p>')+'</div>').join('')+'</div>';
  }
  box.innerHTML=html;
 }
 async function loadLatestWinner(){
  const panel=document.getElementById("latestWinnerPanel");
  if(!panel)return;
  try{
   const data=await FindItAPI.get("getLatestWinner",{_t:Date.now()});
   if(!data||!data.hasWinner||!data.photoUrl){panel.hidden=true;return;}
   document.getElementById("latestWinnerPhoto").src=data.photoUrl;
   document.getElementById("latestWinnerName").textContent=data.winnerName||"Winner";
   document.getElementById("latestWinnerChallenge").textContent=data.challengeName?"Winning photo · "+data.challengeName:"Winning photo";
   panel.hidden=false;
  }catch(error){
   console.warn("[FindIt Results] Could not load latest winner for splash.",error);
   panel.hidden=true;
  }
 }
 async function endGame(){
  const b=document.getElementById("endGameButton");
  if(b)b.disabled=true;
  const s=FindItApp.state.session;
  try{
   if(s&&s.isHost){
    FindItApp.showMessage("resultsMessage","Closing game...",false);
    await FindItAPI.post("cleanupFinishedGame",{gameCode:s.gameCode,playerId:s.playerId});
   }
   FindItSession.clear();
   FindItApp.stopPolling();
   FindItApp.state.session=null;
   FindItApp.state.game=null;
   FindItApp.state.localActivity=null;
   loaded=false;
   FindItApp.navigate("splashScreen");
   FindItApp.showMessage("resultsMessage","",false);
   await loadLatestWinner();
  }catch(error){
   FindItApp.showMessage("resultsMessage",error.message,true);
   if(b)b.disabled=false;
  }
 }
 function escapeHtml(v){return String(v||"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
 document.addEventListener("DOMContentLoaded",()=>{
  const b=document.getElementById("endGameButton");
  if(b)b.addEventListener("click",endGame);
  loadLatestWinner();
 });
 window.FindItResults={load,loadLatestWinner};
})();
