/* Find It! V2 - sheet schema and shared data helpers */
const FINDIT_SHEETS = Object.freeze({
  Games: ["GameCode","HostPlayerId","Status","ChallengeCount","CreatedAt","StartedAt","VotingStartedAt","FinishedAt","EndedEarly"],
  Players: ["PlayerId","GameCode","Name","IsHost","JoinedAt"],
  Challenges: ["ChallengeId","Name","Description","Active"],
  GameChallenges: ["GameCode","ChallengeId","ChallengeNumber","Name","Description"],
  Entries: ["EntryId","GameCode","PlayerId","ChallengeId","ChallengeNumber","Status","PhotoReference","SubmittedAt"],
  Votes: ["VoteId","GameCode","ChallengeId","VoterPlayerId","EntryId","PhotoOwnerPlayerId","IsSelfVote","VotedAt"],
  Winners: ["GameCode","Date","WinnerName","ChallengeWins","WinningPhotoReference"]
});

function getFindItSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ensureFindItSheets() {
  const ss = getFindItSpreadsheet_();
  Object.keys(FINDIT_SHEETS).forEach(name => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    const headers = FINDIT_SHEETS[name];
    if (sheet.getLastRow() === 0) sheet.getRange(1,1,1,headers.length).setValues([headers]);
  });
  return { sheets: Object.keys(FINDIT_SHEETS) };
}

function sheet_(name) {
  const sheet = getFindItSpreadsheet_().getSheetByName(name);
  if (!sheet) throw apiError_("SHEET_MISSING", "Missing sheet: " + name + ". Run ensureFindItSheets() once.");
  return sheet;
}

function rowsAsObjects_(name) {
  const sh = sheet_(name);
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    headers.forEach((h, j) => obj[h] = row[j]);
    return obj;
  });
}

function appendObject_(name, obj) {
  const headers = FINDIT_SHEETS[name];
  sheet_(name).appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : ""));
}

function findOne_(name, predicate) {
  const rows = rowsAsObjects_(name);
  for (let i = 0; i < rows.length; i++) if (predicate(rows[i])) return rows[i];
  return null;
}

function updateObjectRow_(name, rowNumber, changes) {
  const sh = sheet_(name);
  const headers = FINDIT_SHEETS[name];
  const current = sh.getRange(rowNumber,1,1,headers.length).getValues()[0];
  headers.forEach((h,i) => { if (Object.prototype.hasOwnProperty.call(changes,h)) current[i] = changes[h]; });
  sh.getRange(rowNumber,1,1,headers.length).setValues([current]);
}

function id_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g,"").slice(0,12).toUpperCase();
}

function bool_(value) {
  return value === true || String(value).toUpperCase() === "TRUE";
}
