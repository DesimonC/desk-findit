/* Find It! V2 - results, winners and finished-game cleanup */
function finishGameV2(data){
 const gameCode=normalizeCode_(data.gameCode),playerId=String(data.playerId||"");
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const session=requireSession_(gameCode,playerId),game=session.game;
  if(String(game.HostPlayerId)!==playerId)throw apiError_("HOST_ONLY","Only the host can finish the game.");
  if(String(game.Status)!=="VOTING")throw apiError_("INVALID_GAME_STATE","The game can only finish after voting.");
  if(!allVotingCompleteV2_(gameCode))throw apiError_("VOTING_NOT_COMPLETE","All players must finish voting first.");
  const results=calculateResultsV2_(gameCode);
  saveWinnersV2_(gameCode,results);
  updateObjectRow_("Games",game._row,{Status:"FINISHED",FinishedAt:new Date()});
  return results;
 }finally{lock.releaseLock();}
}

function getResultsV2(data){
 const gameCode=normalizeCode_(data.gameCode),playerId=String(data.playerId||"");
 const game=findGame_(gameCode);
 if(game){requireSession_(gameCode,playerId);if(String(game.Status)!=="FINISHED")throw apiError_("RESULTS_NOT_READY","Results are not ready yet.");return calculateResultsV2_(gameCode);}
 const saved=rowsAsObjects_("Winners").filter(r=>String(r.GameCode)===gameCode);
 if(!saved.length)throw apiError_("GAME_NOT_FOUND","Finished game results could not be found.");
 return savedResultsV2_(gameCode,saved);
}

function cleanupFinishedGameV2(data){
 const gameCode=normalizeCode_(data.gameCode),playerId=String(data.playerId||"");
 const game=findGame_(gameCode);if(!game)throw apiError_("GAME_NOT_FOUND","Game not found.");
 if(String(game.HostPlayerId)!==playerId)throw apiError_("HOST_ONLY","Only the host can close the finished game.");
 if(String(game.Status)!=="FINISHED")throw apiError_("INVALID_GAME_STATE","Only a finished game can be cleaned up.");
 const winners=rowsAsObjects_("Winners").filter(r=>String(r.GameCode)===gameCode);if(!winners.length)throw apiError_("WINNERS_NOT_SAVED","Winner records must be saved before cleanup.");
 const keep={};winners.forEach(w=>{if(String(w.WinningPhotoReference))keep[String(w.WinningPhotoReference)]=true;});
 cleanupPhotosV2_(gameCode,keep);
 ["Votes","Entries","GameChallenges","Players","Games"].forEach(name=>deleteGameRowsV2_(name,gameCode));
 return {cleaned:true,gameCode:gameCode,winnersRetained:winners.length};
}

function calculateResultsV2_(gameCode){
 const players=rowsAsObjects_("Players").filter(p=>String(p.GameCode)===gameCode),names={};players.forEach(p=>names[String(p.PlayerId)]=String(p.Name));
 const challenges=rowsAsObjects_("GameChallenges").filter(c=>String(c.GameCode)===gameCode).sort((a,b)=>Number(a.ChallengeNumber)-Number(b.ChallengeNumber));
 const entries=rowsAsObjects_("Entries").filter(e=>String(e.GameCode)===gameCode&&String(e.Status)==="SUBMITTED"&&String(e.PhotoReference));
 const votes=rowsAsObjects_("Votes").filter(v=>String(v.GameCode)===gameCode),wins={};players.forEach(p=>wins[String(p.PlayerId)]=0);
 const challengeResults=challenges.map(c=>{
  const photos=entries.filter(e=>String(e.ChallengeId)===String(c.ChallengeId));
  if(!photos.length)return {challengeNumber:Number(c.ChallengeNumber),name:String(c.Name),winners:[],topVotes:0,uncontested:false};
  const counts={};photos.forEach(e=>counts[String(e.EntryId)]=0);votes.filter(v=>String(v.ChallengeId)===String(c.ChallengeId)).forEach(v=>{if(counts[String(v.EntryId)]!==undefined)counts[String(v.EntryId)]++;});
  let top=0;Object.keys(counts).forEach(k=>top=Math.max(top,counts[k]));
  const winningEntries=photos.length===1?photos:photos.filter(e=>counts[String(e.EntryId)]===top);
  winningEntries.forEach(e=>wins[String(e.PlayerId)]=(wins[String(e.PlayerId)]||0)+1);
  return {challengeNumber:Number(c.ChallengeNumber),name:String(c.Name),topVotes:photos.length===1?0:top,uncontested:photos.length===1,winners:winningEntries.map(e=>({playerId:String(e.PlayerId),name:names[String(e.PlayerId)]||"Player",photoReference:String(e.PhotoReference),photoUrl:photoDataUrlV2_(String(e.PhotoReference))}))};
 });
 let maxWins=0;Object.keys(wins).forEach(id=>maxWins=Math.max(maxWins,wins[id]));
 const overall=players.filter(p=>wins[String(p.PlayerId)]===maxWins).map(p=>({playerId:String(p.PlayerId),name:String(p.Name),challengeWins:wins[String(p.PlayerId)]||0}));
 return {gameCode:gameCode,challengeResults:challengeResults,overallWinners:overall,maxChallengeWins:maxWins};
}

function saveWinnersV2_(gameCode,results){
 if(rowsAsObjects_("Winners").some(r=>String(r.GameCode)===gameCode))return;
 const winningPhotos={};results.challengeResults.forEach(c=>c.winners.forEach(w=>{if(!winningPhotos[w.playerId])winningPhotos[w.playerId]=w.photoReference;}));
 results.overallWinners.forEach(w=>appendObject_("Winners",{GameCode:gameCode,Date:new Date(),WinnerName:w.name,ChallengeWins:w.challengeWins,WinningPhotoReference:winningPhotos[w.playerId]||""}));
}
function savedResultsV2_(gameCode,rows){return {gameCode:gameCode,challengeResults:[],overallWinners:rows.map(r=>({name:String(r.WinnerName),challengeWins:Number(r.ChallengeWins)||0,photoReference:String(r.WinningPhotoReference||""),photoUrl:String(r.WinningPhotoReference)?photoDataUrlV2_(String(r.WinningPhotoReference)):""})),maxChallengeWins:Math.max.apply(null,rows.map(r=>Number(r.ChallengeWins)||0))};}
function deleteGameRowsV2_(name,gameCode){const sh=sheet_(name),rows=rowsAsObjects_(name).filter(r=>String(r.GameCode)===gameCode).map(r=>r._row).sort((a,b)=>b-a);rows.forEach(row=>sh.deleteRow(row));}
function cleanupPhotosV2_(gameCode,keep){const root=findItPhotoRootV2_(),folders=root.getFoldersByName(gameCode);while(folders.hasNext()){const folder=folders.next(),files=folder.getFiles();while(files.hasNext()){const f=files.next();if(!keep[f.getId()])f.setTrashed(true);}/* retained winners remain in the game folder */}}
