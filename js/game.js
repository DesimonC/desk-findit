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
  const share=document.getElementById("shareGameButton"),rejoin=document.getElementById("shareRejoinButton"),hint=document.getElementById("lobbyInviteHint");if(share)share.hidden=!isHost;if(rejoin)rejoin.hidden=false;if(hint)hint.textContent=isHost?"Share the game invitation with new players before the game starts. Keep your personal rejoin link private.":"Save your personal rejoin link somewhere private. It returns you to this player session and carries safety notices.";
  document.getElementById("lobbyMessage").textContent=isHost?"Waiting for players to join…":"Waiting for the host to start the game…";
 }
 async function createGame(){if(!document.getElementById("photoTermsAccepted").checked){FindItApp.navigate("splashScreen");FindItApp.showMessage("joinMessage","Please read and agree to the Photo Terms and Conditions first.",true);return;}
  freshStart();const hostName=value("hostNameInput"),challengeCount=Number(document.getElementById("challengeCountInput").value);FindItApp.showMessage("hostSetupMessage","Creating game...",false);
  try{const data=await FindItAPI.post("createGame",{hostName,challengeCount});showImmediateLobby(data,true);FindItApp.setSession({gameCode:data.game.gameCode,playerId:data.player.playerId,playerName:data.player.name,rejoinToken:data.player.rejoinToken,isHost:true});}
  catch(error){FindItApp.showMessage("hostSetupMessage",error.message,true);}
 }
 async function joinGame(){if(!document.getElementById("photoTermsAccepted").checked){FindItApp.navigate("splashScreen");FindItApp.showMessage("joinMessage","Please read and agree to the Photo Terms and Conditions first.",true);return;}
  freshStart();const gameCode=FindItInvitations.normalizeCode(value("joinGameCodeInput")),playerName=value("joinNameInput");if(!gameCode){FindItApp.showMessage("joinMessage","Enter the 4-character game code.",true);return;}if(!playerName){FindItApp.showMessage("joinMessage","Enter your name.",true);return;}if(playerName.length>30){FindItApp.showMessage("joinMessage","Your name must be 30 characters or fewer.",true);return;}FindItApp.showMessage("joinMessage","Joining or rejoining game...",false);
  try{const data=await FindItAPI.post("joinGame",{gameCode,playerName}),session={gameCode:data.game.gameCode,playerId:data.player.playerId,playerName:data.player.name,rejoinToken:data.player.rejoinToken,isHost:data.player.isHost===true};if(data.game.status==="WAITING")showImmediateLobby(data,session.isHost);FindItApp.setSession(session);if(data.game.status!=="WAITING")await FindItApp.pollNow();}
  catch(error){FindItApp.showMessage("joinMessage",error.message,true);}
 }
 async function shareLink(personal){const session=FindItApp.state.session;if(!session||!session.gameCode)return;if(personal&&!session.rejoinToken){document.getElementById("shareMessage").textContent="This session has no personal rejoin link. Keep this browser session open.";return;}const url=FindItInvitations.buildJoinUrl(window.location.href,session.gameCode,personal?session.rejoinToken:""),details=personal?{title:"Your private Find It! rejoin link",text:"Keep this link private. It returns you to your player session and shows any safety notices.",url}:{title:"Find It! game invitation",text:"Join my Find It! game before it starts:",url};try{if(navigator.share){await navigator.share(details);document.getElementById("shareMessage").textContent=personal?"Your private rejoin link is ready to save.":"Game invitation ready to share.";}else if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(url);document.getElementById("shareMessage").textContent=personal?"Private rejoin link copied. Keep it to yourself.":"Game invitation copied. Send it to players.";}else{window.prompt(personal?"Copy this private link and keep it to yourself:":"Copy this game invitation link:",url);document.getElementById("shareMessage").textContent=personal?"Copy the link and keep it private.":"Copy the invitation and send it to players.";}}catch(error){if(error&&error.name==="AbortError")return;document.getElementById("shareMessage").textContent="Could not share the link. Your browser session remains saved on this device.";}}
 function shareGame(){return shareLink(false);}
 function shareRejoin(){return shareLink(true);}
 async function startGame(){if(!document.getElementById("photoTermsAccepted").checked){FindItApp.navigate("splashScreen");FindItApp.showMessage("joinMessage","Please read and agree to the Photo Terms and Conditions first.",true);return;}const session=FindItApp.state.session;if(!session||!session.isHost)return;FindItApp.showMessage("lobbyMessage","Starting game...",false);try{await FindItAPI.post("startGame",{gameCode:session.gameCode,playerId:session.playerId});await FindItApp.pollNow();}catch(error){FindItApp.showMessage("lobbyMessage",error.message,true);}}
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
 document.getElementById("hostButton").addEventListener("click",()=>{freshStart();FindItApp.navigate("hostSetupScreen");});document.getElementById("joinButton").addEventListener("click",joinGame);document.getElementById("createGameButton").addEventListener("click",createGame);document.getElementById("startGameButton").addEventListener("click",startGame);document.getElementById("shareGameButton").addEventListener("click",shareGame);document.getElementById("shareRejoinButton").addEventListener("click",shareRejoin);document.getElementById("hostBackButton").addEventListener("click",()=>FindItApp.navigate("splashScreen"));document.querySelectorAll("[data-home]").forEach(button=>button.addEventListener("click",()=>FindItApp.clearSession()));});
})();
