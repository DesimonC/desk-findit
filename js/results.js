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
  const endButton=document.getElementById("endGameButton"),isHost=!!(FindItApp.state.session&&FindItApp.state.session.isHost);
  if(endButton)endButton.textContent=isHost?"Close Game & Delete Data":"Leave Game";
  FindItApp.showMessage("resultsMessage",isHost?"Closing the game deletes its stored photos and removes its active game data. Other players will return home when you close it.":"The host will close the game and delete its stored photos when everyone has seen the results.",false);
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
   loaded=false;
   FindItApp.navigate("splashScreen");
   FindItApp.showMessage("resultsMessage","",false);
  }catch(error){
   FindItApp.showMessage("resultsMessage",error.message,true);
   if(b)b.disabled=false;
  }
 }
 function escapeHtml(v){return String(v||"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
 document.addEventListener("DOMContentLoaded",()=>{
  const b=document.getElementById("endGameButton");
  if(b)b.addEventListener("click",endGame);
 });
 window.FindItResults={load};
})();
