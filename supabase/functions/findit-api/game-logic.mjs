export function normalizedPlayerName(value) {
  return String(value || "").trim().toLowerCase();
}

export function findPlayerByName(players, name) {
  const normalized = normalizedPlayerName(name);
  return normalized ? (players || []).find(player => normalizedPlayerName(player.name) === normalized) || null : null;
}

export function voteableChallengeIds(state) {
  const entries = state?.entries || [];
  const ids = [...new Set(entries.filter(entry => entry.status === "SUBMITTED").map(entry => entry.challengeId))];
  return ids.filter(id => entries.filter(entry => entry.challengeId === id && entry.status === "SUBMITTED").length >= 2);
}

export function playerCompletedAllChallenges(state, playerId) {
  const challenges = state?.challenges || [];
  return challenges.length > 0 && (state?.entries || []).filter(entry => entry.playerId === playerId).length >= challenges.length;
}

export function everyoneCompletedAllChallenges(state) {
  const players = (state?.players || []).filter(player => !player.blocked);
  return players.length > 0 && players.every(player => playerCompletedAllChallenges(state, player.playerId));
}

export function canSkipVoting(state) {
  return everyoneCompletedAllChallenges(state) && voteableChallengeIds(state).length === 0;
}

export function everyPlayerVoted(state) {
  const players = (state?.players || []).filter(player => !player.blocked);
  const ids = voteableChallengeIds(state);
  return players.length > 0 && players.every(player =>
    ids.every(challengeId => (state?.votes || []).some(vote => vote.voterPlayerId === player.playerId && vote.challengeId === challengeId))
  );
}

export function classifyStorageItems(prefix, items) {
  const normalizedPrefix = String(prefix || "").replace(/^\/+|\/+$/g, "");
  const files = [];
  const folders = [];
  for (const item of items || []) {
    if (!item || typeof item.name !== "string" || !item.name || item.name.includes("..")) continue;
    const path = normalizedPrefix ? normalizedPrefix + "/" + item.name.replace(/^\/+/, "") : item.name.replace(/^\/+/, "");
    if (item.id === null || item.id === undefined) folders.push(path);
    else files.push(path);
  }
  return { files, folders };
}

export async function collectNestedStoragePaths(listPage, root, pageSize = 1000) {
  const files = [];
  const folders = [String(root || "").replace(/^\/+|\/+$/g, "")];
  while (folders.length) {
    const folder = folders.shift();
    let offset = 0;
    while (true) {
      const page = await listPage(folder, offset, pageSize);
      if (!Array.isArray(page)) throw new Error("Storage list returned an invalid page.");
      const result = classifyStorageItems(folder, page);
      files.push(...result.files);
      folders.push(...result.folders);
      offset += page.length;
      if (page.length < pageSize) break;
    }
  }
  return files;
}
