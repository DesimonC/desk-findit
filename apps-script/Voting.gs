/* Find It! V2 - anonymous voting */
function startVotingV2(data){
  const gameCode=normalizeCode_(data.gameCode),playerId=String(data.playerId||"");
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const session=requireSession_(gameCode,playerId),game=session.game;
    if(String(game.HostPlayerId)!==playerId)throw apiError_("HOST_ONLY","Only the host can start voting.");
    if(String(game.Status)!=="PLAYING")throw apiError_("INVALID_GAME_STATE","Voting can only start after gameplay.");
    if(!everyoneCompleteV2_(gameCode))throw apiError_("PLAYERS_NOT_COMPLETE","All players must complete their challenges before voting starts.");
    const voteable=voteableChallengeIdsV2_(gameCode),voteableIds=Object.keys(voteable);
    if(!voteableIds.length){
      throw apiError_("NO_CONTESTED_CHALLENGES","There are no challenges with at least two submitted photos to vote on.");
    }
    updateObjectRow_("Games",game._row,{Status:"VOTING",VotingStartedAt:new Date()});
    return {status:"VOTING",voteableChallengeCount:voteableIds.length};
  }finally{lock.releaseLock();}
}

function getVotingStateV2(data){
  const gameCode=normalizeCode_(data.gameCode),playerId=String(data.playerId||""),session=requireSession_(gameCode,playerId);
  if(String(session.game.Status)!=="VOTING")throw apiError_("INVALID_GAME_STATE","Voting is not active.");
  const challenges=rowsAsObjects_("GameChallenges").filter(r=>String(r.GameCode)===gameCode).sort((a,b)=>Number(a.ChallengeNumber)-Number(b.ChallengeNumber));
  const entries=validVotingEntriesV2_(gameCode);
  const voteable=voteableChallengeIdsV2_(gameCode);
  const voteableIds=Object.keys(voteable);
  if(!voteableIds.length)throw apiError_("NO_CONTESTED_CHALLENGES","Voting is active but no contested challenges were found.");
  const votes=rowsAsObjects_("Votes").filter(r=>String(r.GameCode)===gameCode&&String(r.VoterPlayerId)===playerId),voted={};
  votes.forEach(v=>voted[String(v.ChallengeId)]=true);
  const next=challenges.find(c=>voteable[String(c.ChallengeId)]&&!voted[String(c.ChallengeId)]);
  const selfVoteUsed=votes.some(v=>bool_(v.IsSelfVote));
  if(!next)return {complete:true,selfVoteUsed:selfVoteUsed,allVotingComplete:allVotingCompleteV2_(gameCode),voteableChallengeCount:voteableIds.length};
  const challengeEntries=entries.filter(e=>String(e.ChallengeId)===String(next.ChallengeId));
  if(challengeEntries.length<2)throw apiError_("VOTING_DATA_CHANGED","The voting photos changed after voting started. Please retry.");
  const options=shuffle_(challengeEntries).map((e,i)=>({optionId:String(e.EntryId),label:"Photo "+(i+1),photoUrl:photoDataUrlV2_(String(e.PhotoReference))}));
  return {complete:false,selfVoteUsed:selfVoteUsed,voteableChallengeCount:voteableIds.length,challenge:{challengeId:String(next.ChallengeId),challengeNumber:Number(next.ChallengeNumber),name:String(next.Name),description:String(next.Description||"")},options:options};
}

function castVoteV2(data){
  const gameCode=normalizeCode_(data.gameCode),playerId=String(data.playerId||""),challengeId=String(data.challengeId||""),entryId=String(data.entryId||""),lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const session=requireSession_(gameCode,playerId);
    if(String(session.game.Status)!=="VOTING")throw apiError_("INVALID_GAME_STATE","Voting is not active.");
    const challenge=findOne_("GameChallenges",r=>String(r.GameCode)===gameCode&&String(r.ChallengeId)===challengeId);
    if(!challenge)throw apiError_("CHALLENGE_NOT_FOUND","Voting challenge not found.");
    const eligible=validVotingEntriesV2_(gameCode).filter(e=>String(e.ChallengeId)===challengeId);
    if(eligible.length<2)throw apiError_("VOTE_NOT_REQUIRED","This challenge is not contested and does not require voting.");
    if(findOne_("Votes",r=>String(r.GameCode)===gameCode&&String(r.VoterPlayerId)===playerId&&String(r.ChallengeId)===challengeId))throw apiError_("ALREADY_VOTED","You have already voted for this challenge.");
    const entry=eligible.find(e=>String(e.EntryId)===entryId);
    if(!entry)throw apiError_("ENTRY_NOT_FOUND","That photo is not available for this vote.");
    const isSelf=String(entry.PlayerId)===playerId;
    if(isSelf&&findOne_("Votes",r=>String(r.GameCode)===gameCode&&String(r.VoterPlayerId)===playerId&&bool_(r.IsSelfVote)))throw apiError_("SELF_VOTE_USED","You have already used your one self-vote for this game.");
    appendObject_("Votes",{VoteId:id_("V"),GameCode:gameCode,ChallengeId:challengeId,VoterPlayerId:playerId,EntryId:entryId,PhotoOwnerPlayerId:String(entry.PlayerId),IsSelfVote:isSelf,VotedAt:new Date()});
    return {accepted:true,isSelfVote:isSelf,votingComplete:playerVotingCompleteV2_(gameCode,playerId),allVotingComplete:allVotingCompleteV2_(gameCode)};
  }finally{lock.releaseLock();}
}

function getVotingProgressV2(data){
  const gameCode=normalizeCode_(data.gameCode),playerId=String(data.playerId||""),session=requireSession_(gameCode,playerId);
  if(String(session.game.HostPlayerId)!==playerId)throw apiError_("HOST_ONLY","Only the host can view voting progress.");
  const voteableCount=Object.keys(voteableChallengeIdsV2_(gameCode)).length;
  if(!voteableCount)throw apiError_("NO_CONTESTED_CHALLENGES","No contested challenges are available for voting.");
  const players=rowsAsObjects_("Players").filter(r=>String(r.GameCode)===gameCode);
  return {voteableChallengeCount:voteableCount,players:players.map(p=>({name:String(p.Name),isHost:bool_(p.IsHost),complete:playerVotingCompleteV2_(gameCode,String(p.PlayerId))})),allVotingComplete:allVotingCompleteV2_(gameCode)};
}

function validVotingEntriesV2_(gameCode){
  return rowsAsObjects_("Entries").filter(e=>String(e.GameCode)===gameCode&&String(e.Status)==="SUBMITTED"&&String(e.PhotoReference));
}

function voteableChallengeIdsV2_(gameCode){
  const counts={};
  validVotingEntriesV2_(gameCode).forEach(e=>{const id=String(e.ChallengeId);counts[id]=(counts[id]||0)+1;});
  const result={};Object.keys(counts).forEach(id=>{if(counts[id]>=2)result[id]=true;});return result;
}

function playerVotingCompleteV2_(gameCode,playerId){
  const voteable=voteableChallengeIdsV2_(gameCode),ids=Object.keys(voteable);
  if(!ids.length)return false;
  const voted={};rowsAsObjects_("Votes").filter(v=>String(v.GameCode)===gameCode&&String(v.VoterPlayerId)===playerId).forEach(v=>voted[String(v.ChallengeId)]=true);
  return ids.every(id=>voted[id]);
}

function allVotingCompleteV2_(gameCode){
  const voteableIds=Object.keys(voteableChallengeIdsV2_(gameCode));
  if(!voteableIds.length)return false;
  const players=rowsAsObjects_("Players").filter(p=>String(p.GameCode)===gameCode);
  return players.length>0&&players.every(p=>playerVotingCompleteV2_(gameCode,String(p.PlayerId)));
}

function photoDataUrlV2_(fileId){try{const blob=DriveApp.getFileById(fileId).getBlob();return "data:"+(blob.getContentType()||"image/jpeg")+";base64,"+Utilities.base64Encode(blob.getBytes());}catch(_){return "";}}
