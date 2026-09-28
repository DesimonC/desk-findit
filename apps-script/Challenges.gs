/* Find It! V2 - challenge gameplay, photo storage and completion */
function getChallengesV2(data) {
  const session = requireSession_(normalizeCode_(data.gameCode), String(data.playerId || ""));
  if (String(session.game.Status) !== "PLAYING") throw apiError_("INVALID_GAME_STATE", "Challenges are only available while the game is playing.");
  const gameCode = String(session.game.GameCode);
  const playerId = String(session.player.PlayerId);
  const challenges = rowsAsObjects_("GameChallenges")
    .filter(r => String(r.GameCode) === gameCode)
    .sort((a,b) => Number(a.ChallengeNumber)-Number(b.ChallengeNumber));
  const entries = rowsAsObjects_("Entries").filter(r => String(r.GameCode) === gameCode && String(r.PlayerId) === playerId);
  const byChallenge = {};
  entries.forEach(e => byChallenge[String(e.ChallengeId)] = e);
  const result = challenges.map(c => {
    const entry = byChallenge[String(c.ChallengeId)];
    return {
      challengeId:String(c.ChallengeId), challengeNumber:Number(c.ChallengeNumber),
      name:String(c.Name), description:String(c.Description || ""),
      status:entry ? String(entry.Status) : "OPEN"
    };
  });
  return {
    challenges:result,
    completedCount:result.filter(c => c.status === "SUBMITTED" || c.status === "PASSED").length,
    challengeCount:result.length,
    everyoneComplete:everyoneCompleteV2_(gameCode)
  };
}

function submitPhotoV2(data) {
  const gameCode = normalizeCode_(data.gameCode);
  const playerId = String(data.playerId || "");
  const challengeId = String(data.challengeId || "");
  const dataUrl = String(data.photoData || "");
  if (!challengeId) throw apiError_("CHALLENGE_REQUIRED", "Challenge is required.");
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl)) throw apiError_("PHOTO_REQUIRED", "A valid photo is required.");
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const session = requireSession_(gameCode, playerId);
    if (String(session.game.Status) !== "PLAYING") throw apiError_("INVALID_GAME_STATE", "Photos can only be submitted while the game is playing.");
    const challenge = requireGameChallengeV2_(gameCode, challengeId);
    requireNoEntryV2_(gameCode, playerId, challengeId);
    const photo = savePhotoV2_(gameCode, playerId, challenge, dataUrl);
    const entryId = id_("E");
    appendObject_("Entries", { EntryId:entryId, GameCode:gameCode, PlayerId:playerId, ChallengeId:challengeId, ChallengeNumber:Number(challenge.ChallengeNumber), Status:"SUBMITTED", PhotoReference:photo.fileId, SubmittedAt:new Date() });
    return { entryId, status:"SUBMITTED", completed:playerCompleteV2_(gameCode, playerId), everyoneComplete:everyoneCompleteV2_(gameCode) };
  } finally { lock.releaseLock(); }
}

function passChallengeV2(data) {
  const gameCode = normalizeCode_(data.gameCode);
  const playerId = String(data.playerId || "");
  const challengeId = String(data.challengeId || "");
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const session = requireSession_(gameCode, playerId);
    if (String(session.game.Status) !== "PLAYING") throw apiError_("INVALID_GAME_STATE", "Challenges can only be passed while the game is playing.");
    const challenge = requireGameChallengeV2_(gameCode, challengeId);
    requireNoEntryV2_(gameCode, playerId, challengeId);
    const entryId = id_("E");
    appendObject_("Entries", { EntryId:entryId, GameCode:gameCode, PlayerId:playerId, ChallengeId:challengeId, ChallengeNumber:Number(challenge.ChallengeNumber), Status:"PASSED", PhotoReference:"", SubmittedAt:new Date() });
    return { entryId, status:"PASSED", completed:playerCompleteV2_(gameCode, playerId), everyoneComplete:everyoneCompleteV2_(gameCode) };
  } finally { lock.releaseLock(); }
}

function getCompletionStatusV2(data) {
  const session = requireSession_(normalizeCode_(data.gameCode), String(data.playerId || ""));
  const gameCode = String(session.game.GameCode);
  const count = Number(session.game.ChallengeCount);
  const entries = rowsAsObjects_("Entries").filter(r => String(r.GameCode) === gameCode);
  const players = rowsAsObjects_("Players").filter(r => String(r.GameCode) === gameCode);
  return {
    everyoneComplete:everyoneCompleteV2_(gameCode),
    players:players.map(p => {
      const completed = entries.filter(e => String(e.PlayerId) === String(p.PlayerId) && (String(e.Status)==="SUBMITTED" || String(e.Status)==="PASSED")).length;
      return { playerId:String(p.PlayerId), name:String(p.Name), isHost:bool_(p.IsHost), completedCount:completed, challengeCount:count, complete:completed >= count };
    })
  };
}

function requireGameChallengeV2_(gameCode, challengeId) {
  const challenge = findOne_("GameChallenges", r => String(r.GameCode) === gameCode && String(r.ChallengeId) === challengeId);
  if (!challenge) throw apiError_("CHALLENGE_NOT_FOUND", "This challenge is not part of the game.");
  return challenge;
}
function requireNoEntryV2_(gameCode, playerId, challengeId) {
  if (findOne_("Entries", r => String(r.GameCode)===gameCode && String(r.PlayerId)===playerId && String(r.ChallengeId)===challengeId)) throw apiError_("CHALLENGE_ALREADY_COMPLETE", "You have already completed this challenge.");
}
function playerCompleteV2_(gameCode, playerId) {
  const game = findGame_(gameCode); if (!game) return false;
  const done = rowsAsObjects_("Entries").filter(r => String(r.GameCode)===gameCode && String(r.PlayerId)===playerId && (String(r.Status)==="SUBMITTED" || String(r.Status)==="PASSED")).length;
  return done >= Number(game.ChallengeCount);
}
function everyoneCompleteV2_(gameCode) {
  const players = rowsAsObjects_("Players").filter(r => String(r.GameCode)===gameCode);
  return players.length > 0 && players.every(p => playerCompleteV2_(gameCode, String(p.PlayerId)));
}
function savePhotoV2_(gameCode, playerId, challenge, dataUrl) {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/i);
  if (!match) throw apiError_("INVALID_PHOTO", "The selected photo could not be read.");
  const subtype = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 8 * 1024 * 1024) throw apiError_("PHOTO_TOO_LARGE", "Photo is too large. Please take a smaller photo.");
  const mime = "image/" + subtype;
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  const blob = Utilities.newBlob(bytes, mime, gameCode + "_" + challenge.ChallengeNumber + "_" + playerId + "." + ext);
  const root = findItPhotoRootV2_();
  const gameFolder = getOrCreateFolderV2_(root, gameCode);
  const file = gameFolder.createFile(blob);
  return { fileId:file.getId() };
}
function findItPhotoRootV2_() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty("FINDIT_PHOTO_ROOT_ID");
  if (saved) { try { return DriveApp.getFolderById(saved); } catch (_) {} }
  const folders = DriveApp.getFoldersByName("Find It! V2 Photos");
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder("Find It! V2 Photos");
  props.setProperty("FINDIT_PHOTO_ROOT_ID", folder.getId());
  return folder;
}
function getOrCreateFolderV2_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}
