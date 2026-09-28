/* Find It! V2 - create/join/lobby/state foundation */
function createGameV2(data) {
  const hostName = String(data.hostName || "").trim();
  const rawCount = String(data.challengeCount === undefined ? "" : data.challengeCount).trim();
  if (!hostName) throw apiError_("HOST_NAME_REQUIRED", "Host name is required.");
  if (!/^\d+$/.test(rawCount)) throw apiError_("INVALID_CHALLENGE_COUNT", "Challenge count must be a whole number from 1 to 10.");
  const challengeCount = Number(rawCount);
  if (challengeCount < 1 || challengeCount > 10) throw apiError_("INVALID_CHALLENGE_COUNT", "Challenge count must be from 1 to 10.");

  const active = rowsAsObjects_("Challenges").filter(r => bool_(r.Active) && String(r.ChallengeId).trim() && String(r.Name).trim());
  if (active.length < challengeCount) throw apiError_("NOT_ENOUGH_CHALLENGES", "There are not enough active challenges for this game.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const gameCode = uniqueGameCode_();
    const playerId = id_("P");
    const now = new Date();
    appendObject_("Games", { GameCode:gameCode, HostPlayerId:playerId, Status:"WAITING", ChallengeCount:challengeCount, CreatedAt:now, EndedEarly:false });
    appendObject_("Players", { PlayerId:playerId, GameCode:gameCode, Name:hostName, IsHost:true, JoinedAt:now });

    shuffle_(active).slice(0,challengeCount).forEach((challenge,index) => {
      appendObject_("GameChallenges", {
        GameCode:gameCode,
        ChallengeId:String(challenge.ChallengeId),
        ChallengeNumber:index + 1,
        Name:String(challenge.Name),
        Description:String(challenge.Description || "")
      });
    });

    return { game: publicGame_(findGame_(gameCode)), player: { playerId, gameCode, name:hostName, isHost:true } };
  } finally { lock.releaseLock(); }
}

function joinGameV2(data) {
  const gameCode = normalizeCode_(data.gameCode);
  const playerName = String(data.playerName || "").trim();
  if (!gameCode) throw apiError_("GAME_CODE_REQUIRED", "Game code is required.");
  if (!playerName) throw apiError_("PLAYER_NAME_REQUIRED", "Your name is required.");
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const game = findGame_(gameCode);
    if (!game) throw apiError_("GAME_NOT_FOUND", "Game " + gameCode + " could not be found.");
    if (String(game.Status) !== "WAITING") throw apiError_("GAME_ALREADY_STARTED", "This game has already started.");
    const duplicate = findOne_("Players", r => String(r.GameCode) === gameCode && String(r.Name).trim().toLowerCase() === playerName.toLowerCase());
    if (duplicate) throw apiError_("NAME_IN_USE", "That player name is already in this game.");
    const playerId = id_("P");
    appendObject_("Players", { PlayerId:playerId, GameCode:gameCode, Name:playerName, IsHost:false, JoinedAt:new Date() });
    return { game:publicGame_(game), player:{ playerId, gameCode, name:playerName, isHost:false } };
  } finally { lock.releaseLock(); }
}

function startGameV2(data) {
  const gameCode = normalizeCode_(data.gameCode);
  const playerId = String(data.playerId || "");
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const game = requireSession_(gameCode, playerId).game;
    if (String(game.HostPlayerId) !== playerId) throw apiError_("HOST_ONLY", "Only the host can start the game.");
    if (String(game.Status) !== "WAITING") throw apiError_("INVALID_GAME_STATE", "The game cannot be started from its current state.");
    const selected = rowsAsObjects_("GameChallenges").filter(r => String(r.GameCode) === gameCode);
    if (selected.length !== Number(game.ChallengeCount)) throw apiError_("CHALLENGE_SETUP_INVALID", "The selected challenge set is incomplete.");
    updateObjectRow_("Games", game._row, { Status:"PLAYING", StartedAt:new Date() });
    return { status:"PLAYING" };
  } finally { lock.releaseLock(); }
}

function getGameStateV2(data) {
  const gameCode = normalizeCode_(data.gameCode);
  const playerId = String(data.playerId || "");
  const session = requireSession_(gameCode, playerId);
  const players = rowsAsObjects_("Players").filter(r => String(r.GameCode) === gameCode).map(publicPlayer_);
  return { game:publicGame_(session.game), player:publicPlayer_(session.player), players:players };
}

function requireSession_(gameCode, playerId) {
  const game = findGame_(gameCode);
  if (!game) throw apiError_("GAME_NOT_FOUND", "Game " + gameCode + " could not be found.");
  const player = findOne_("Players", r => String(r.GameCode) === gameCode && String(r.PlayerId) === playerId);
  if (!player) throw apiError_("SESSION_INVALID", "This player session is no longer valid.");
  return { game, player };
}

function findGame_(code) { return findOne_("Games", r => String(r.GameCode) === code); }
function normalizeCode_(code) { return String(code || "").trim().toUpperCase(); }
function uniqueGameCode_() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt=0; attempt<100; attempt++) {
    let code=""; for (let i=0;i<6;i++) code += alphabet.charAt(Math.floor(Math.random()*alphabet.length));
    if (!findGame_(code)) return code;
  }
  throw apiError_("CODE_GENERATION_FAILED", "Could not generate a unique game code.");
}
function shuffle_(array) {
  const copy=array.slice();
  for (let i=copy.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); const t=copy[i]; copy[i]=copy[j]; copy[j]=t; }
  return copy;
}
function publicGame_(g) { return { gameCode:String(g.GameCode), hostPlayerId:String(g.HostPlayerId), status:String(g.Status), challengeCount:Number(g.ChallengeCount), endedEarly:bool_(g.EndedEarly) }; }
function publicPlayer_(p) { return { playerId:String(p.PlayerId), gameCode:String(p.GameCode), name:String(p.Name), isHost:bool_(p.IsHost) }; }
