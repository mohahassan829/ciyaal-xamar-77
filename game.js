// game.js — Game state, player types, role assignment
// Ciyaal Xamar · Discord Mafia Bot

/** @type {Map<string, object>} Key: channelId — each channel gets its own independent game */
export const games = new Map();

/** @type {Array<object>} */
export const gameLogs = [];

export function addLog(guildId, guildName, message) {
  gameLogs.unshift({ timestamp: new Date(), message, guildId, guildName });
  if (gameLogs.length > 500) gameLogs.splice(500);
}

export function createGame(guildId, channelId, hostId) {
  const game = {
    guildId,
    channelId,
    hostId,
    players: new Map(),
    phase: "lobby",
    round: 0,
    votes: [],
    nightKillTarget: null,
    nightSaveTarget: null,
    // Set: sheriff player IDs oo horeba u isticmaalay xabbadooda habeenkan
    nightSheriffUsed: new Set(),
    lobbyMessageId: null,
    nightMessageId: null,
    dayMessageId: null,
    phaseTimer: null,
    startedAt: null,
    endedAt: null,
    winner: null,
  };
  games.set(channelId, game);
  return game;
}

/** All active (non-ended) games running in a guild */
export function getGuildGames(guildId) {
  return Array.from(games.values()).filter(
    g => g.guildId === guildId && g.phase !== "ended"
  );
}

export function getRoleCounts(playerCount) {
  if (playerCount >= 15) return { dilaaye: 3, dhakhtar: 1, sheriff: 2 };
  if (playerCount >= 10) return { dilaaye: 2, dhakhtar: 1, sheriff: 1 };
  return { dilaaye: 1, dhakhtar: 1, sheriff: 1 };
}

export function assignRoles(game) {
  const playerList = Array.from(game.players.values());
  const count = playerList.length;
  const { dilaaye: dilaayeCount, sheriff: sheriffCount } = getRoleCounts(count);

  const roles = [];
  for (let i = 0; i < dilaayeCount; i++) roles.push("dilaaye");
  roles.push("dhakhtar");
  for (let i = 0; i < sheriffCount; i++) roles.push("sheriff");
  while (roles.length < count) roles.push("shacab");

  const shuffled = [...roles].sort(() => Math.random() - 0.5);
  const shuffledPlayers = [...playerList].sort(() => Math.random() - 0.5);

  shuffledPlayers.forEach((player, i) => {
    player.role = shuffled[i];
    player.alive = true;
    player.protected = false;
  });
}

export function getAlivePlayers(game) {
  return Array.from(game.players.values()).filter(p => p.alive);
}

export function getDilaayePlayers(game) {
  return Array.from(game.players.values()).filter(p => p.role === "dilaaye" && p.alive);
}

export function checkWinCondition(game) {
  const alive = getAlivePlayers(game);
  const aliveDilaaye = alive.filter(p => p.role === "dilaaye").length;
  const aliveShacab = alive.filter(p => p.role !== "dilaaye").length;
  if (aliveDilaaye === 0) return "shacab";
  if (aliveDilaaye >= aliveShacab) return "dilaaye";
  return null;
}

export function getVoteResults(game) {
  const counts = new Map();
  for (const vote of game.votes) {
    if (vote.targetId !== "skip") {
      counts.set(vote.targetId, (counts.get(vote.targetId) || 0) + 1);
    }
  }
  return counts;
}

export function getMostVoted(game) {
  const counts = getVoteResults(game);
  if (counts.size === 0) return null;

  let maxVotes = 0;
  let maxPlayer = null;
  let tie = false;

  counts.forEach((count, playerId) => {
    if (count > maxVotes) {
      maxVotes = count;
      maxPlayer = playerId;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  });

  return tie ? null : maxPlayer;
}

export function getGameStats() {
  const allGames = Array.from(games.values());
  return {
    activeGames: allGames.filter(g => g.phase !== "ended" && g.phase !== "lobby").length,
    totalChannels: games.size,
    recentLogs: gameLogs.slice(0, 50),
  };
}
