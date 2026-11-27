/* Find It! V2 - create, join and lobby actions */
(function(){
 function value(id){return String(document.getElementById(id).value||"").trim();}
 function freshStart(){FindItSession.clear();FindItApp.state.session=null;FindItApp.state.game=null;FindItApp.state.localActivity=null;if(FindItApp.stopPolling)FindItApp.stopPolling();}
 function showImmediateLobby(data,isHost){
  FindItApp.navigate("lobbyScreen");
  document.getElementById("lobbyGameCode").textContent=data.game.gameCode;
  const list=document.getElementById("lobbyPlayers");list.innerHTML="";
  const li=document.createElement("li");li.textContent=data.player.name+(isHost?" (Host)":"");list.appendChild(li);
  const start=document.getElementById("startGameButton");start.hidden=!isHost;start.disabled=!isHost;
  document.getElementById("lobbyMessage").textContent=isHost?"Waiting for players to join…":"Waiting for the host to start the game…";
 }
 async function createGame(){
  freshStart();const hostName=value("hostNameInput"),challengeCount=Number(document.getElementById("challengeCountInput").value);FindItApp.showMessage("hostSetupMessage","Creating game...",false);
  try{const data=await FindItAPI.post("createGame",{hostName,challengeCount});showImmediateLobby(data,true);FindItApp.setSession({gameCode:data.game.gameCode,playerId:data.player.playerId,playerName:data.player.name,isHost:true});}
  catch(error){FindItApp.showMessage("hostSetupMessage",error.message,true);}
 }
 async function joinGame(){
  freshStart();const gameCode=FindItInvitations.normalizeCode(value("joinGameCodeInput")),playerName=value("joinNameInput");if(!gameCode){FindItApp.showMessage("joinMessage","Enter the 4-character game code.",true);return;}if(!playerName){FindItApp.showMessage("joinMessage","Enter your name.",true);return;}if(playerName.length>30){FindItApp.showMessage("joinMessage","Your name must be 30 characters or fewer.",true);return;}FindItApp.showMessage("joinMessage","Joining or rejoining game...",false);
  try{const data=await FindItAPI.post("joinGame",{gameCode,playerName}),session={gameCode:data.game.gameCode,playerId:data.player.playerId,playerName:data.player.name,isHost:data.player.isHost===true};if(data.game.status==="WAITING")showImmediateLobby(data,session.isHost);FindItApp.setSession(session);if(data.game.status!=="WAITING")await FindItApp.pollNow();if(data.reused)FindItApp.showMessage("joinMessage","Welcome back, "+data.player.name+". Rejoining your game...",false);}
  catch(error){FindItApp.showMessage("joinMessage",error.message,true);}
 }
 async function shareGame(){const session=FindItApp.state.session;if(!session||!session.gameCode)return;const url=FindItInvitations.buildJoinUrl(window.location.href,session.gameCode),details={title:"Find It! game invitation",text:"Join my Find It! game. Use the game code and the name you choose:",url};try{if(navigator.share){await navigator.share(details);document.getElementById("shareMessage").textContent="Invitation link ready to share.";}else if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(url);document.getElementById("shareMessage").textContent="Invitation link copied. Send it to your players.";}else{window.prompt("Copy this Find It! invitation link:",url);document.getElementById("shareMessage").textContent="Copy the link and send it to your players.";}}catch(error){if(error&&error.name==="AbortError")return;document.getElementById("shareMessage").textContent="Could not share the link. Send the game code instead: "+session.gameCode;}}
 async function startGame(){const session=FindItApp.state.session;if(!session||!session.isHost)return;FindItApp.showMessage("lobbyMessage","Starting game...",false);try{await FindItAPI.post("startGame",{gameCode:session.gameCode,playerId:session.playerId});await FindItApp.pollNow();}catch(error){FindItApp.showMessage("lobbyMessage",error.message,true);}}
 document.addEventListener("DOMContentLoaded",function(){
  document.getElementById("completeRulesButton").addEventListener("click",async ()=>{
   document.getElementById("completeRulesDialog").showModal();
   try{
    const health=await FindItAPI.get("health");
    const updatedRule=health.selfVoteRule==="half-rounded-down";
    document.getElementById("legacySelfVoteRule").hidden=updatedRule;
    document.getElementById("halfSelfVoteRule").hidden=!updatedRule;
   }catch(error){
    console.warn("[FindIt Game] Could not check the server voting rule.",error);
   }
  });
 document.getElementById("hostButton").addEventListener("click",()=>{freshStart();FindItApp.navigate("hostSetupScreen");});document.getElementById("joinButton").addEventListener("click",joinGame);document.getElementById("createGameButton").addEventListener("click",createGame);document.getElementById("startGameButton").addEventListener("click",startGame);document.getElementById("shareGameButton").addEventListener("click",shareGame);document.getElementById("hostBackButton").addEventListener("click",()=>FindItApp.navigate("splashScreen"));document.querySelectorAll("[data-home]").forEach(button=>button.addEventListener("click",()=>FindItApp.clearSession()));});
})();
