/* Find It! V2 - JSON router */
function doGet(e) { return dispatchFindIt_("GET", e); }
function doPost(e) { return dispatchFindIt_("POST", e); }
function dispatchFindIt_(method, e) {
  try {
    const query=(e&&e.parameter)||{}; let body={};
    if(method==="POST"&&e&&e.postData&&e.postData.contents){try{body=JSON.parse(e.postData.contents);}catch(_){throw apiError_("INVALID_JSON","Request body is not valid JSON.");}}
    const action=String(query.action||body.action||"").trim(); const data=Object.assign({},query,body);
    if(!action)throw apiError_("ACTION_REQUIRED","API action is required.");
    let result;
    switch(action){
      case "health": result={version:"2.0.0",status:"ok"}; break;
      case "createGame": result=createGameV2(data); break;
      case "joinGame": result=joinGameV2(data); break;
      case "startGame": result=startGameV2(data); break;
      case "getGameState": result=getGameStateV2(data); break;
      case "getChallenges": result=getChallengesV2(data); break;
      case "submitPhoto": result=submitPhotoV2(data); break;
      case "passChallenge": result=passChallengeV2(data); break;
      case "getCompletionStatus": result=getCompletionStatusV2(data); break;
      default: throw apiError_("UNKNOWN_ACTION","Unknown API action: "+action);
    }
    return jsonOutput_({ok:true,data:result});
  } catch(error) { return jsonOutput_({ok:false,error:{code:error.code||"SERVER_ERROR",message:error.message||String(error)}}); }
}
function jsonOutput_(payload){return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);}
function apiError_(code,message){const error=new Error(message);error.code=code;return error;}
