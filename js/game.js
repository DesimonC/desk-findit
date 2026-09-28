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
  freshStart();const gameCode=value("joinGameCodeInput").toUpperCase(),playerName=value("joinNameInput");if(!/^[A-Z2-9]{4}$/.test(gameCode)){FindItApp.showMessage("joinMessage","Enter the 4-character game code.",true);return;}FindItApp.showMessage("joinMessage","Joining...",false);
  try{const data=await FindItAPI.post("joinGame",{gameCode,playerName});showImmediateLobby(data,false);FindItApp.setSession({gameCode:data.game.gameCode,playerId:data.player.playerId,playerName:data.player.name,isHost:false});}
  catch(error){FindItApp.showMessage("joinMessage",error.message,true);}
 }
 async function startGame(){const session=FindItApp.state.session;if(!session||!session.isHost)return;FindItApp.showMessage("lobbyMessage","Starting game...",false);try{await FindItAPI.post("startGame",{gameCode:session.gameCode,playerId:session.playerId});await FindItApp.pollNow();}catch(error){FindItApp.showMessage("lobbyMessage",error.message,true);}}
 document.addEventListener("DOMContentLoaded",function(){document.getElementById("hostButton").addEventListener("click",()=>{freshStart();FindItApp.navigate("hostSetupScreen");});document.getElementById("joinButton").addEventListener("click",joinGame);document.getElementById("createGameButton").addEventListener("click",createGame);document.getElementById("startGameButton").addEventListener("click",startGame);document.getElementById("hostBackButton").addEventListener("click",()=>FindItApp.navigate("splashScreen"));document.querySelectorAll("[data-home]").forEach(button=>button.addEventListener("click",()=>FindItApp.clearSession()));});
})();
