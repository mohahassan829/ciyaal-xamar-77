// src/interactions.js — all button handlers for !bomb game (ES module)
import { EmbedBuilder, MessageFlags } from 'discord.js';
import { activeGames } from './game.js';
import { getBalance, addBalance, deductBalance } from './economy.js';

const Ephemeral = MessageFlags.Ephemeral;

export async function handleBombInteraction(interaction) {
  if (!interaction.isButton()) return false;
  const { customId } = interaction;

  // Only handle bomb-game custom IDs
  const isBomb = ['game_join','game_leave','game_start','game_stop','final_qaybsi','final_xad'].includes(customId)
    || customId.startsWith('bet_')
    || customId.startsWith('tile_');
  if (!isBomb) return false;

  try {
    if (customId === 'game_join')    { await handleJoin(interaction);         return true; }
    if (customId === 'game_leave')   { await handleLeave(interaction);        return true; }
    if (customId === 'game_start')   { await handleStart(interaction);        return true; }
    if (customId === 'game_stop')    { await handleStop(interaction);         return true; }
    if (customId.startsWith('bet_')) { await handleBet(interaction);          return true; }
    if (customId.startsWith('tile_')){ await handleTile(interaction);         return true; }
    if (customId === 'final_qaybsi' || customId === 'final_xad') { await handleFinalChoice(interaction); return true; }
  } catch (err) {
    console.error('Bomb interaction error:', err);
    try {
      const msg = { content: '⚠️ An error occurred. Please try again.', flags: Ephemeral };
      if (interaction.deferred || interaction.replied) await interaction.followUp(msg);
      else await interaction.reply(msg);
    } catch {}
  }
  return true;
}

// ─── Lobby handlers ───────────────────────────────────────────────────────────

async function handleJoin(interaction) {
  const game = activeGames.get(interaction.channelId);
  if (!game || game.state !== 'LOBBY') return interaction.reply({ content: '❌ No active game lobby in this channel.', flags: Ephemeral });
  if (game.players.find(p => p.id === interaction.user.id)) return interaction.reply({ content: '✅ You are already in the game!', flags: Ephemeral });
  if (game.players.length >= 13) return interaction.reply({ content: '❌ Game is full (13/13)!', flags: Ephemeral });
  await interaction.reply({ content: '💵 **Choose your bet amount:**', components: game.buildBetComponents(), flags: Ephemeral });
}

async function handleLeave(interaction) {
  const game = activeGames.get(interaction.channelId);
  if (!game || game.state !== 'LOBBY') return interaction.reply({ content: '❌ No active lobby.', flags: Ephemeral });
  const player = game.removePlayer(interaction.user.id);
  if (!player) return interaction.reply({ content: '❌ You are not in the game.', flags: Ephemeral });
  await addBalance(player.id, player.bet, player.username);
  await game.message.edit({ embeds: [game.buildLobbyEmbed()], components: game.buildLobbyComponents() });
  await interaction.reply({ content: `✅ You left the game. **$${player.bet.toLocaleString()}** has been refunded.`, flags: Ephemeral });
}

async function handleStart(interaction) {
  const game = activeGames.get(interaction.channelId);
  if (!game)                               return interaction.reply({ content: '❌ No active game.', flags: Ephemeral });
  if (game.state !== 'LOBBY')              return interaction.reply({ content: '❌ Game already started!', flags: Ephemeral });
  if (interaction.user.id !== game.hostId) return interaction.reply({ content: '❌ Only the host can start the game!', flags: Ephemeral });
  if (game.players.length < 2)             return interaction.reply({ content: '❌ Need at least **2 players** to start!', flags: Ephemeral });
  await interaction.deferUpdate();
  game.state = 'PLAYING';
  game.setupTiles();
  game.currentTurnIndex = 0;
  game.turn = 1;
  await game.message.edit({ embeds: [game.buildGameEmbed()], components: game.buildTileComponents() });
  startTurnTimer(game);
}

async function handleStop(interaction) {
  const game = activeGames.get(interaction.channelId);
  if (!game)                               return interaction.reply({ content: '❌ No active game.', flags: Ephemeral });
  if (interaction.user.id !== game.hostId) return interaction.reply({ content: '❌ Only the host can stop the game!', flags: Ephemeral });
  await interaction.deferUpdate();
  game.clearTimer();
  game.clearFinalTimer();
  const wasLobby = game.state === 'LOBBY';
  game.state = 'ENDED';
  activeGames.delete(interaction.channelId);
  // Refund bets
  if (wasLobby) {
    await Promise.all(game.players.map(p => addBalance(p.id, p.bet, p.username)));
  }
  const stopEmbed = new EmbedBuilder().setColor(0xff0000).setTitle('🛑 Game Stopped')
    .setDescription(wasLobby ? 'The game was stopped by the host. All bets have been refunded.' : 'The game was forcefully stopped by the host.');
  await game.message.edit({ embeds: [stopEmbed], components: [] });
  await interaction.editReply({ content: '🛑 Game stopped.' });
}

// ─── Bet handler ──────────────────────────────────────────────────────────────

async function handleBet(interaction) {
  const game = activeGames.get(interaction.channelId);
  if (!game || game.state !== 'LOBBY') return interaction.update({ content: '❌ This lobby is no longer active.', components: [] });
  if (game.players.find(p => p.id === interaction.user.id)) return interaction.update({ content: '✅ You are already in the game!', components: [] });
  if (game.players.length >= 13) return interaction.update({ content: '❌ Game is full!', components: [] });
  const betAmount = parseInt(interaction.customId.replace('bet_', ''), 10);
  const userId    = interaction.user.id;
  const username  = interaction.member?.displayName || interaction.user.username;
  const balance   = await getBalance(userId, username);
  if (balance < betAmount) return interaction.update({ content: `❌ **You don't have enough money.**\n💰 Your balance: **$${balance.toLocaleString()}**\nRequired: **$${betAmount.toLocaleString()}**`, components: [] });
  const result = await deductBalance(userId, betAmount);
  if (!result.success) return interaction.update({ content: `❌ **You don't have enough money.**`, components: [] });
  game.addPlayer(userId, username, betAmount);
  await game.message.edit({ embeds: [game.buildLobbyEmbed()], components: game.buildLobbyComponents() });
  await interaction.update({ content: `✅ You joined with a bet of **$${betAmount.toLocaleString()}**! Good luck! 🍀`, components: [] });
}

// ─── Tile handler ─────────────────────────────────────────────────────────────

async function handleTile(interaction) {
  const game = activeGames.get(interaction.channelId);
  if (!game || game.state !== 'PLAYING') return interaction.reply({ content: '❌ No active game.', flags: Ephemeral });
  const current = game.currentPlayer;
  if (!current) return interaction.reply({ content: '❌ No current player.', flags: Ephemeral });
  if (interaction.user.id !== current.id) return interaction.reply({ content: `❌ It's not your turn! Waiting for **${current.username}**.`, flags: Ephemeral });
  if (game.eliminatedIds.has(interaction.user.id)) return interaction.reply({ content: '❌ You are already eliminated!', flags: Ephemeral });
  const tileIndex = parseInt(interaction.customId.replace('tile_', ''), 10);
  const tile      = game.tiles[tileIndex];
  if (!tile || tile.revealed) return interaction.reply({ content: '❌ That tile is already revealed!', flags: Ephemeral });
  await interaction.deferUpdate();
  game.clearTimer();
  await processTileReveal(game, current, tileIndex);
}

// ─── Final Showdown — Qaybsi / Xad ───────────────────────────────────────────

async function handleFinalChoice(interaction) {
  const game = activeGames.get(interaction.channelId);
  if (!game || game.state !== 'FINAL') return interaction.reply({ content: '❌ No final showdown active.', flags: Ephemeral });
  const player = game.finalPlayers.find(p => p.id === interaction.user.id);
  if (!player) return interaction.reply({ content: '❌ You are not in the final showdown!', flags: Ephemeral });
  if (game.finalChoices.has(interaction.user.id)) return interaction.reply({ content: '✅ Hore ayaad dooratay! Kan kale sugaya...', flags: Ephemeral });

  const choice = interaction.customId === 'final_qaybsi' ? 'qaybsi' : 'xad';
  game.finalChoices.set(interaction.user.id, choice);
  const emoji = choice === 'qaybsi' ? '🟢 Qaybsi' : '⚫ Xad';
  await interaction.reply({ content: `✅ **${emoji}** doortay! Kan kale sugaya...`, flags: Ephemeral });

  // Update embed to show someone chose (without revealing which)
  try {
    await game.message.edit({
      embeds: [game.buildFinalEmbed(game.finalTimeLeft, game.finalChoices)],
      components: game.buildFinalComponents(),
    });
  } catch {}

  // Both have chosen — resolve immediately
  if (game.finalChoices.size === 2) {
    game.clearFinalTimer();
    await resolveFinalShowdown(game);
  }
}

async function resolveFinalShowdown(game) {
  const [p1, p2] = game.finalPlayers;
  const c1 = game.finalChoices.get(p1.id);
  const c2 = game.finalChoices.get(p2.id);

  game.clearTimer();
  game.state = 'ENDED';
  activeGames.delete(game.channelId);

  // Both Qaybsi → split 50/50
  if (c1 === 'qaybsi' && c2 === 'qaybsi') {
    const half = Math.floor(game.prizePool / 2);
    await Promise.all([
      addBalance(p1.id, half, p1.username),
      addBalance(p2.id, half, p2.username),
    ]);
    const embed = new EmbedBuilder().setColor(0x00ff88).setTitle('🤝 Qaybsi — Waa la Qaybiyen!')
      .setDescription(
        `## 🟢 Labadooduba Qaybsi doortay!\n\n` +
        `**${p1.username}** → 💰 $${half.toLocaleString()}\n` +
        `**${p2.username}** → 💰 $${half.toLocaleString()}\n\n` +
        `*Nabadgalyo! \`!balance\` ku eeg lacagtaada.*`,
      );
    return game.message.edit({ embeds: [embed], components: [] });
  }

  // Both Xad → nobody wins
  if (c1 === 'xad' && c2 === 'xad') {
    const embed = new EmbedBuilder().setColor(0x555555).setTitle('💀 Labadooduba Xad — Way Khasaareen!')
      .setDescription(
        `## ⚫ Labadooduba Xad doortay!\n\n` +
        `**${p1.username}** ❌\n` +
        `**${p2.username}** ❌\n\n` +
        `💸 Prize Pool-ka oo dhan ($${game.prizePool.toLocaleString()}) waa la waayay!\n` +
        `*Cidna lacag kuma heshay.*`,
      );
    return game.message.edit({ embeds: [embed], components: [] });
  }

  // One Xad, one Qaybsi → Xad winner takes all
  const winner = c1 === 'xad' ? p1 : p2;
  const loser  = c1 === 'xad' ? p2 : p1;
  await addBalance(winner.id, game.prizePool, winner.username);
  const embed = new EmbedBuilder().setColor(0xffd700).setTitle('😈 Xad — Winner Takes All!')
    .setDescription(
      `## ⚫ **${winner.username}** Xad dooratay — 🟢 **${loser.username}** Qaybsi!\n\n` +
      `**${winner.username}** ayaa qaatay Prize Pool-ka oo dhan!\n` +
      `💰 **$${game.prizePool.toLocaleString()}**\n\n` +
      `*${loser.username} wuu la kalsoonaa, laakiin ${winner.username} xad ku qaatay!*`,
    )
    .setFooter({ text: 'Play again with !bomb' });
  return game.message.edit({ embeds: [embed], components: [] });
}

// ─── Game Flow ────────────────────────────────────────────────────────────────

async function processTileReveal(game, player, tileIndex) {
  const tile = game.tiles[tileIndex];
  tile.revealed = true;
  if (tile.isBomb) {
    tile.revealedAs = 'bomb';
    game.eliminatePlayer(player);
    game.gameLog.push(`💥 **${player.username}** wuu dhintay! 💀 (Turn ${game.turn})`);
    const resultMsg = `## 💥 ${player.username} wuu dhintay! 💀\nThey picked a bomb! Eliminated.`;
    const active    = game.activePlayers;
    await game.message.edit({ embeds: [game.buildGameEmbed(resultMsg)], components: game.buildTileComponents() });
    await sleep(2000);
    if (active.length === 1) { await endBombGame(game, active[0]); return; }
    // Trigger Qaybsi/Xad only when 2 remain AND no more hidden bombs
    if (active.length === 2 && game.hiddenBombsCount === 0) { await startFinalShowdown(game); return; }
    game.advanceTurn(); game.turn++; game.timeLeft = 10;
  } else {
    tile.revealedAs = 'safe';
    game.gameLog.push(`✅ **${player.username}** wa safe! 🟢 (Turn ${game.turn})`);
    const resultMsg = `## ✅ ${player.username} wa safe! 🟢\nPhew! Clear tile!`;
    game.advanceTurn(); game.turn++; game.timeLeft = 10;
    await game.message.edit({ embeds: [game.buildGameEmbed(resultMsg)], components: game.buildTileComponents() });
    await sleep(1500);
  }
  const unrevealed = game.tiles.filter(t => !t.revealed);
  if (unrevealed.length === 0) {
    const active = game.activePlayers;
    if (active.length === 2) { await startFinalShowdown(game); return; }
    if (active.length === 1) { await endBombGame(game, active[0]); return; }
    return;
  }
  game.timeLeft = 10;
  await game.message.edit({ embeds: [game.buildGameEmbed()], components: game.buildTileComponents() });
  startTurnTimer(game);
}

function startTurnTimer(game) {
  game.clearTimer();
  game.timeLeft = 10;
  game.timerRef = setInterval(async () => {
    game.timeLeft -= 2;
    if (game.timeLeft <= 0) {
      game.clearTimer();
      const unrevealed = game.tiles.filter(t => !t.revealed);
      if (unrevealed.length === 0) return;
      const randomTile = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      const current    = game.currentPlayer;
      if (!current) return;
      game.gameLog.push(`⏰ **${current.username}** ran out of time! Auto-picked tile ${randomTile.index + 1}.`);
      await processTileReveal(game, current, randomTile.index);
    } else {
      try { await game.message.edit({ embeds: [game.buildGameEmbed()], components: game.buildTileComponents() }); } catch {}
    }
  }, 2000);
}

async function startFinalShowdown(game) {
  game.state        = 'FINAL';
  game.finalPlayers = [...game.activePlayers];
  game.finalChoices = new Map();
  game.finalTimeLeft = 25;
  await game.message.edit({ embeds: [game.buildFinalEmbed(25, game.finalChoices)], components: game.buildFinalComponents() });
  startFinalTimer(game);
}

function startFinalTimer(game) {
  game.clearFinalTimer();
  game.finalTimerRef = setInterval(async () => {
    game.finalTimeLeft -= 5;
    if (game.finalTimeLeft <= 0) {
      game.clearFinalTimer();
      // Time expired — auto-Qaybsi for anyone who hasn't chosen
      for (const p of game.finalPlayers) {
        if (!game.finalChoices.has(p.id)) game.finalChoices.set(p.id, 'qaybsi');
      }
      await resolveFinalShowdown(game);
    } else {
      try {
        await game.message.edit({
          embeds: [game.buildFinalEmbed(game.finalTimeLeft, game.finalChoices)],
          components: game.buildFinalComponents(),
        });
      } catch {}
    }
  }, 5000);
}

async function endBombGame(game, winner) {
  game.clearTimer();
  game.clearFinalTimer();
  game.state = 'ENDED';
  activeGames.delete(game.channelId);
  await addBalance(winner.id, game.prizePool, winner.username);
  await game.message.edit({ embeds: [game.buildWinnerEmbed(winner)], components: [] });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
