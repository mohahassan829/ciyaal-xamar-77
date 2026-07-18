// src/game.js — BombGame class + active games store (ES module)
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const LOBBY_IMAGE_URL =
  'https://cdn.discordapp.com/attachments/1470820767204638742/1523824380075970670/IMG_6568.jpg';

function getTileConfig(playerCount) {
  if (playerCount <= 4)  return { tiles: 10, minBombs: 2, maxBombs: 3 };
  if (playerCount <= 6)  return { tiles: 12, minBombs: 4, maxBombs: 4 };
  if (playerCount <= 8)  return { tiles: 14, minBombs: 6, maxBombs: 6 };
  if (playerCount <= 11) return { tiles: 16, minBombs: 8, maxBombs: 8 };
  return                        { tiles: 18, minBombs: 10, maxBombs: 10 };
}

export class BombGame {
  constructor(hostId, hostUsername, channelId) {
    this.hostId       = hostId;
    this.hostUsername = hostUsername;
    this.channelId    = channelId;
    this.players      = [];   // [{ id, username, bet }]
    this.eliminated   = [];   // [{ id, username, turn }]
    this.state        = 'LOBBY'; // LOBBY | PLAYING | FINAL | ENDED
    this.message      = null;
    this.tiles        = [];
    this.bombCount    = 0;
    this.prizePool    = 0;
    this.currentTurnIndex = 0;
    this.turn         = 0;
    this.timeLeft     = 10;
    this.timerRef     = null;
    this.gameLog      = [];
    this.finalPlayers  = null;
    this.finalChoices  = new Map();  // playerId → 'qaybsi' | 'xad'
    this.finalTimerRef = null;
    this.finalTimeLeft = 25;
  }

  get eliminatedIds()    { return new Set(this.eliminated.map(e => e.id)); }
  get activePlayers()    { const e = this.eliminatedIds; return this.players.filter(p => !e.has(p.id)); }
  get hiddenBombsCount() { return this.tiles.filter(t => t.isBomb && !t.revealed).length; }
  get currentPlayer() {
    const active = this.activePlayers;
    if (active.length === 0) return null;
    const p = this.players[this.currentTurnIndex];
    if (p && !this.eliminatedIds.has(p.id)) return p;
    return active[0];
  }

  advanceTurn() {
    const len = this.players.length, elim = this.eliminatedIds;
    let next  = (this.currentTurnIndex + 1) % len;
    for (let i = 0; i < len; i++) {
      if (!elim.has(this.players[next].id)) break;
      next = (next + 1) % len;
    }
    this.currentTurnIndex = next;
  }

  clearTimer()      { if (this.timerRef)      { clearInterval(this.timerRef);      this.timerRef      = null; } }
  clearFinalTimer() { if (this.finalTimerRef) { clearInterval(this.finalTimerRef); this.finalTimerRef = null; } }

  addPlayer(id, username, bet) {
    if (this.players.find(p => p.id === id)) return false;
    this.players.push({ id, username, bet });
    this.prizePool += bet;
    return true;
  }

  removePlayer(id) {
    const player = this.players.find(p => p.id === id);
    if (!player) return null;
    this.players    = this.players.filter(p => p.id !== id);
    this.prizePool -= player.bet;
    if (this.currentTurnIndex >= this.players.length) this.currentTurnIndex = 0;
    return player;
  }

  eliminatePlayer(player) { this.eliminated.push({ id: player.id, username: player.username, turn: this.turn }); }

  setupTiles() {
    const cfg       = getTileConfig(this.players.length);
    const bombCount = cfg.minBombs + Math.floor(Math.random() * (cfg.maxBombs - cfg.minBombs + 1));
    this.bombCount  = bombCount;
    const indices   = Array.from({ length: cfg.tiles }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const bombSet = new Set(indices.slice(0, bombCount));
    this.tiles = Array.from({ length: cfg.tiles }, (_, i) => ({
      index: i, isBomb: bombSet.has(i), revealed: false, revealedAs: null,
    }));
    return { tileCount: cfg.tiles, bombCount };
  }

  setupFinalTiles() {
    const bombFirst = Math.random() < 0.5;
    this.finalTiles = [
      { index: 0, isBomb: bombFirst,  revealed: false },
      { index: 1, isBomb: !bombFirst, revealed: false },
    ];
  }

  buildLobbyEmbed() {
    const playerList = this.players.length > 0
      ? this.players.map(p => `${p.id === this.hostId ? '⭐' : '👤'} **${p.username}** — $${p.bet.toLocaleString()}`).join('\n')
      : '⏳ Waiting for Players…';
    return new EmbedBuilder()
      .setColor(0x1a1a1a).setTitle('💣 Bomb Survival').setImage(LOBBY_IMAGE_URL)
      .addFields(
        { name: '👥 Players',    value: `${this.players.length}/13`,           inline: true },
        { name: '💰 Prize Pool', value: `$${this.prizePool.toLocaleString()}`, inline: true },
        { name: '💣 Bombs',      value: 'Random',                              inline: true },
        { name: '🏟️ Lobby',      value: playerList },
      )
      .setFooter({ text: '⚠️ Only the host can start or stop the game.' });
  }

  buildLobbyComponents() {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('game_join').setLabel('Ku biir').setStyle(ButtonStyle.Success).setEmoji('➕'),
      new ButtonBuilder().setCustomId('game_leave').setLabel('Ka bax').setStyle(ButtonStyle.Danger).setEmoji('➖'),
      new ButtonBuilder().setCustomId('game_start').setLabel('Bilaab hadda').setStyle(ButtonStyle.Primary).setEmoji('▶️'),
      new ButtonBuilder().setCustomId('game_stop').setLabel('Jooji').setStyle(ButtonStyle.Secondary).setEmoji('🛑'),
    )];
  }

  buildBetComponents() {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_500').setLabel('💵 $500').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bet_1000').setLabel('💵 $1,000').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bet_2000').setLabel('💵 $2,000').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bet_3000').setLabel('💵 $3,000').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bet_4000').setLabel('💵 $4,000').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('bet_5000').setLabel('💵 $5,000').setStyle(ButtonStyle.Secondary),
      ),
    ];
  }

  buildGameEmbed(resultMsg = null) {
    const active = this.activePlayers, current = this.currentPlayer;
    // Numbered list — dead players get strikethrough + 💀, alive keep their original number
    const playerStatus = this.players.map((p, i) => {
      if (this.eliminatedIds.has(p.id)) return `💀 ~~${p.username}~~`;
      const marker = current && p.id === current.id ? '🎯' : '🟢';
      return `${i + 1}. ${marker} **${p.username}**`;
    }).join('\n');
    const description = resultMsg ? resultMsg
      : (current && this.state === 'PLAYING' ? `# 🎯 ${current.username}\n### ⏳ ${this.timeLeft} seconds — Pick a tile!` : '...');
    const embed = new EmbedBuilder()
      .setColor(0x1a1a1a).setTitle('💣 Bomb Survival').setDescription(description)
      .addFields(
        { name: '👥 Remaining',       value: `${active.length}/${this.players.length}`, inline: true },
        { name: '💰 Prize Pool',      value: `${this.prizePool.toLocaleString()}`,     inline: true },
        { name: '💣 Bombs Hidden',    value: `${this.hiddenBombsCount}`,                inline: true },
        { name: '👥 Players',         value: playerStatus },
      );
    if (this.gameLog.length > 0) embed.addFields({ name: '📋 Events', value: this.gameLog.slice(-4).join('\n') });
    return embed;
  }

  buildTileComponents() {
    const rows = []; let row = new ActionRowBuilder(), count = 0;
    for (const tile of this.tiles) {
      if (count > 0 && count % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
      let label = '⬛', style = ButtonStyle.Secondary;
      if (tile.revealed) {
        if (tile.revealedAs === 'bomb') { label = '💣'; style = ButtonStyle.Danger; }
        else                            { label = '🟢'; style = ButtonStyle.Success; }
      }
      row.addComponents(
        new ButtonBuilder().setCustomId(`tile_${tile.index}`).setLabel(label).setStyle(style).setDisabled(tile.revealed),
      );
      count++;
    }
    if (row.components.length > 0) rows.push(row);
    return rows;
  }

  buildFinalEmbed(timeLeft = 25, choices = new Map()) {
    const [p1, p2] = this.finalPlayers;
    const chosen = (p) => choices.has(p.id) ? '✅ **Doortay**' : '⏳ Sugaya...';
    return new EmbedBuilder().setColor(0xff6600).setTitle('⚡ FINAL SHOWDOWN — Qaybsi ama Xad?')
      .setDescription(
        `## 🏆 **${p1.username}** vs **${p2.username}**\n\n` +
        `Labaduba waa inay doortataan:\n` +
        `🟢 **Qaybsi** — Prize Pool loo qaybiyo 50/50\n` +
        `⚫ **Xad** — Hadduu kali doortaa, wuxuu qaadanayaa Prize Pool-ka oo dhan\n\n` +
        `> ⚠️ Labadooduba Xad doortaan → **Labadooduba way khasaarayaan!**\n\n` +
        `⏱️ **${timeLeft} seconds** ayaa haray!`,
      )
      .addFields(
        { name: '💰 Prize Pool', value: `${this.prizePool.toLocaleString()}`,       inline: true },
        { name: '⏱️ Waqti',     value: `${timeLeft}s`,                               inline: true },
        { name: `${p1.username}`, value: chosen(p1), inline: true },
        { name: `${p2.username}`, value: chosen(p2), inline: true },
      )
      .setFooter({ text: 'Dooro degdeg — waqtigu dhammaanayaa!' });
  }

  buildFinalComponents(disableAll = false) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('final_qaybsi').setLabel('🟢 Qaybsi').setStyle(ButtonStyle.Success).setDisabled(disableAll),
      new ButtonBuilder().setCustomId('final_xad').setLabel('⚫ Xad').setStyle(ButtonStyle.Danger).setDisabled(disableAll),
    )];
  }

  buildWinnerEmbed(winner, extraLine = '') {
    return new EmbedBuilder().setColor(0xffd700).setTitle('👑 WINNER!')
      .setDescription(
        (extraLine ? extraLine + '\n\n' : '') +
        `## 🏆 **${winner.username}**\n### Last Survivor\n\n` +
        `💰 **Prize Won: $${this.prizePool.toLocaleString()}**\n\n` +
        `*Congratulations! Use \`!balance\` to check your wallet.*`,
      )
      .setFooter({ text: 'Play again with !bomb' });
  }
}

export const activeGames = new Map(); // channelId → BombGame
