/* Find It! V2 - final results + latest winner splash */
(function(){
 let loadedStatus="";
 async function load(){
  const s=FindItApp.state.session;
  const status=FindItApp.state.game?.status;if(!s||!["CHALLENGE_RESULTS","FINISHED"].includes(status)||loadedStatus===status)return;
  try{
   const data=await FindItAPI.get("getResults",{gameCode:s.gameCode,playerId:s.playerId,_t:Date.now()});
   loadedStatus=status;
   render(data);
  }catch(error){FindItApp.showMessage("resultsMessage",error.message,true);}
 }
 function render(data){
  const box=document.getElementById("finalResults");
  const endButton=document.getElementById("endGameButton"),isHost=!!(FindItApp.state.session&&FindItApp.state.session.isHost);
  if(endButton)endButton.textContent=isHost?"Close Game & Delete Data":"Leave Game";
  FindItApp.showMessage("resultsMessage",isHost?"Closing the game deletes its stored photos and removes its active game data. Other players will return home when you close it.":"The host will close the game and delete its stored photos when everyone has seen the results.",false);
  let html;
  if(!data.overallRevealed){
   html='<div class="winner-hero"><p class="eyebrow">CHALLENGE RESULTS</p><h3>Category winners revealed</h3><p>The host will reveal the overall winner separately. If challenge wins are tied, players vote among the tied players’ challenge-winning photos. A tied ballot repeats with only the photos tied in that round.</p></div>';
  }else if(data.overallWinner){
   html='<div class="winner-hero"><p class="eyebrow">OVERALL WINNER</p><h3>'+escapeHtml(data.overallWinner.name)+'</h3><p>'+data.maxChallengeWins+' challenge win'+(data.maxChallengeWins===1?'':'s')+'</p><figure class="overall-winning-photo"><img src="'+data.overallWinner.photoUrl+'" alt="Best photo of the game"><figcaption>Best photo of the game</figcaption></figure></div>';
  }else{
   html='<div class="winner-hero"><p class="eyebrow">GAME COMPLETE</p><h3>No Winner</h3><p>No challenge-winning photo was available for an overall winner.</p></div>';
  }
  if(data.challengeResults&&data.challengeResults.length){
   html+='<div class="result-list"><h3>Challenge winners</h3>'+data.challengeResults.map(c=>'<div class="result-card"><span class="challenge-number">Challenge '+c.challengeNumber+'</span><h4>'+escapeHtml(c.name)+'</h4>'+(c.winners.length?'<div class="winner-photos">'+c.winners.map(w=>'<figure><img src="'+w.photoUrl+'" alt="Winning photo"><figcaption>'+escapeHtml(w.name)+(c.uncontested?' · uncontested':c.winners.length>1?' · joint winner':'')+'</figcaption></figure>').join('')+'</div>':'<p class="hint">No photo submitted.</p>')+'</div>').join('')+'</div>';
  }
  box.innerHTML=html;
  const reveal=document.getElementById("revealOverallWinnerButton");if(reveal){reveal.hidden=!isHost||data.overallRevealed;reveal.disabled=false;}
  if(endButton)endButton.hidden=!data.overallRevealed;
  FindItApp.showMessage("resultsMessage",data.overallRevealed?(isHost?"Closing the game deletes all stored photos and active game data, including the best photo of the game.":"The host can close the game and delete all stored photos and game data."):(isHost?"Review the category winners, then reveal the overall winner when ready.":"The host will reveal the overall winner after the category results."),false);
 }
 async function endGame(){
  const b=document.getElementById("endGameButton");
  if(b)b.disabled=true;
  const s=FindItApp.state.session;
  try{
   if(s&&s.isHost){
    FindItApp.showMessage("resultsMessage","Closing game...",false);
    const cleanup=await FindItAPI.post("cleanupFinishedGame",{gameCode:s.gameCode,playerId:s.playerId});
    FindItApp.showMessage("globalMessage","Game closed. "+Number(cleanup.photosRemoved||0)+" photo(s) and its game data deleted.",false);
   }
   FindItSession.clear();
   FindItApp.stopPolling();
   FindItApp.state.session=null;
   FindItApp.state.game=null;
   FindItApp.state.localActivity=null;
   loadedStatus="";
   FindItApp.navigate("splashScreen");
   FindItApp.showMessage("resultsMessage","",false);
  }catch(error){
   FindItApp.showMessage("resultsMessage",error.message,true);
   if(b)b.disabled=false;
  }
 }
 function escapeHtml(v){return String(v||"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
 async function revealOverall(){
  const b=document.getElementById("revealOverallWinnerButton");if(b)b.disabled=true;
  try{const s=FindItApp.state.session;await FindItAPI.post("revealOverallWinner",{gameCode:s.gameCode,playerId:s.playerId});await FindItApp.pollNow();if(FindItApp.state.game?.status==="CHALLENGE_RESULTS"){loadedStatus="";await load();}}
  catch(error){FindItApp.showMessage("resultsMessage",error.message||"Could not reveal the overall winner.",true);if(b)b.disabled=false;}
 }
 document.addEventListener("DOMContentLoaded",()=>{
  const b=document.getElementById("endGameButton");if(b)b.addEventListener("click",endGame);
  const reveal=document.getElementById("revealOverallWinnerButton");if(reveal)reveal.addEventListener("click",revealOverall);
 });
 window.FindItResults={load};
})();
