// index.js — Ciyaal Xamar Discord Bot
// ✅ !dilaay (Mafia Game)    — !dilaay !kasaar !join !leave !help !icaawi !dm !news !say !dashboard
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config';
import {
  Client, GatewayIntentBits, Partials, Events, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, PermissionFlagsBits,
} from 'discord.js';
import { joinVoiceChannel, VoiceConnectionStatus, entersState } from '@discordjs/voice';

// ── !dilaay imports ────────────────────────────────────────────────────────────
import { games, createGame, assignRoles, getGuildGames, addLog, checkWinCondition } from './game.js';
import { buildLobbyEmbed, buildLobbyButtons, buildRoleDmEmbed, buildKickButtons }   from './embeds.js';
import { startNightPhase, endGame } from './phases.js';

// ── Ticket system imports ──────────────────────────────────────────────────────
import { handleOpenTicket, handleClaimTicket, handleCloseTicket, handleCloseConfirm, handleCloseCancel } from './bot/handlers/tickets.js';
import { handleSetupCommand, handleOpenCategorySelect, handleClosedCategorySelect, handleStaffRolesSelect, handleEmbedModal, handlePostChannelSelect, handleSetupReset, handleSetupCancel } from './bot/commands/setup.js';
import { deployCommands } from './bot/deploy.js';

// ── Economy System imports ──────────────────────────────────────────────────────
import db from './db.js';
import * as econUtils from './economyUtils.js';
import DashboardWebSocketClient from './websocket-client.js';
import { calculateWealthTax, applyHighRollerRisk } from './wealthTax.js';

// ── WebSocket client for dashboard ────────────────────────────────────────────
const dashboardWS = new DashboardWebSocketClient(process.env.DASHBOARD_URL || 'http://localhost:3000');
dashboardWS.connect().catch(err => console.warn('[Bot] Dashboard WebSocket connection failed:', err));

// ─────────────────────────────────────────────────────────────────────────────
const token   = process.env.DISCORD_BOT_TOKEN || process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID  || '725076744251637760';
const ADMIN_IDS = ['1307382619696267294', '725076744251637760', '1488229307523530914'];
const MAX_GAMES_PER_GUILD = 5;

if (!token) {
  console.error('❌ BOT_TOKEN waa loo baahan yahay!');
  console.error('   1. BOT_TOKEN secret-ka ku dar Railway/Replit/server-kaaga');
  console.error('   2. Token-ka Discord Developer Portal-ka ka hel:');
  console.error('      https://discord.com/developers/applications');
  process.exit(1);
}

const voiceConnections = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// ─── Crash Protection ─────────────────────────────────────────────────────────
process.on('unhandledRejection', reason => {
  console.error('⚠️ Unhandled promise rejection:', reason?.message || reason);
});
process.on('uncaughtException', err => {
  console.error('⚠️ Uncaught exception:', err?.message || err);
});

// ─── Ready ────────────────────────────────────────────────────────────────────
client.once('clientReady', async c => {
  await db.init();
  console.log(`✅ Bot diyaar: ${c.user.tag} | ${c.guilds.cache.size} server`);
  console.log('🔪 Commands: !dilaay !kasaar !join !leave !help !icaawi !dm !news !say !dashboard !cx !wallet !work !daily !rob !shop !bank');
  console.log('ℹ️  Discord Developer Portal → Bot → SERVER MEMBERS INTENT + MESSAGE CONTENT INTENT fur!');
  
  setInterval(checkTaxes, 60 * 60 * 1000);
  checkTaxes();

  deployCommands(token, c.user.id).catch(err => console.error("⚠️ deployCommands error:", err?.message || err));
  
  // One-time reset for Number Box (Update Aug 11, 2026)
  try {
    const res = await db.pool.query('UPDATE nb_games SET is_active = 0 WHERE is_active = 1');
    if (res.rowCount > 0) console.log(`🔄 [NB Reset] Deactivated ${res.rowCount} old games for the update.`);
  } catch (err) {
    console.error('⚠️ [NB Reset] Error:', err.message);
  }
});

async function checkTaxes() {
  const now = Date.now();
  const users = await db.getAllUsers();
  for (const user of users) {
    if (now - user.lastTax >= econUtils.config.taxInterval) {
      let taxToDeduct = econUtils.config.taxAmount;
      if (user.bank >= taxToDeduct) {
        await db.updateUser(user.userId, { bank: user.bank - taxToDeduct, lastTax: now });
      } else {
        let remaining = taxToDeduct - user.bank;
        await db.updateUser(user.userId, { bank: 0, wallet: Math.max(0, user.wallet - remaining), lastTax: now });
      }
      if (user.hasPlayedCX) {
        try {
          const discordUser = await client.users.fetch(user.userId);
          const taxEmbed = econUtils.createEmbed('💰 Tax System', `Waxaa lagaa jaray **$${econUtils.config.taxAmount}** Tax (3-Day Tax). Mahadsanid isticmaalka Economy-ga.`, econUtils.config.colors.economy);
          await discordUser.send({ embeds: [taxEmbed] });
        } catch (err) {}
      }
      await db.logActivity({
        userId: user.userId,
        username: user.username,
        type: 'tax',
        description: '3-Day Tax Deduction',
        amount: econUtils.config.taxAmount
      });
    }
  }
}

const economyCooldowns = new Map();

// ─── Message Handler ──────────────────────────────────────────────────────────
client.on(Events.MessageCreate, msg => {
  handleAllMessages(msg).catch(err => console.error('⚠️ MessageCreate error:', err?.message || err));
});

// ─── Interaction Handler ──────────────────────────────────────────────────────
client.on(Events.InteractionCreate, interaction => {
  handleAllInteractions(interaction).catch(err => console.error('⚠️ InteractionCreate error:', err?.message || err));
});

// ─── Login with Retry ─────────────────────────────────────────────────────────
async function loginWithRetry() {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      await client.login(token);
      return;
    } catch (err) {
      console.error(`❌ Login failed (#${attempt}): ${err.message}`);
      console.error('   BOT_TOKEN-ka hubi — Discord Developer Portal-ka token cusub samee haddii loo baahdo.');
      const wait = Math.min(30 * attempt, 300);
      console.error(`   ${wait}s kadib dib ayaa loo isku dayayaa...`);
      await new Promise(r => setTimeout(r, wait * 1000));
    }
  }
}
// ─── Startup ──────────────────────────────────────────────────────────────────
(async () => {
  loginWithRetry();
})();

// ── Number Box Helpers ───────────────────────────────────────────────────────
function buildNBEmbed(currentWinners, maxWinners, expiresAt, winnersList) {
  const timeLeft = Math.max(0, expiresAt - Date.now());
  const hours = Math.floor(timeLeft / (60 * 60 * 1000));
  const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
  
  let winnersText = winnersList.length > 0 
    ? `🟢 ${winnersList.length} Winners Found:\n${winnersList.map(w => `• <@${w.user_id}>`).join('\n')}`
    : '⚪ No winners yet.';

  const embed = new EmbedBuilder()
    .setTitle('🎰 NUMBER BOX')
    .setColor(0xffd700)
    .addFields(
      { name: '💰 Prize', value: '`$100,000 Cash`', inline: true },
      { name: '🎯 Winners', value: `\`${currentWinners}/${maxWinners}\``, inline: true },
      { name: '⏳ Time Left', value: `\`${hours}h ${minutes}m\``, inline: true },
      { name: '🏆 Winners List', value: winnersText }
    )
    .setDescription('**Dooro hal number (1–10) si aad u guuleysato!**\n\n⚠️ Kaliya hal mar ayaad riixi kartaa.')
    .setFooter({ text: 'Number Box • Guushu waa nasiib' })
    .setTimestamp();

  return embed;
}

function buildNBButtons(disabled = false) {
  const rows = [];
  for (let i = 0; i < 2; i++) {
    const row = new ActionRowBuilder();
    for (let j = 1; j <= 5; j++) {
      const num = (i * 5) + j;
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`nb_btn_${num}`)
          .setLabel(`${num}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled)
      );
    }
    rows.push(row);
  }
  return rows;
}

async function handleNBInteraction(interaction) {
  const userId = interaction.user.id;
  const guildId = interaction.guild.id;
  
  const user = await db.getUser(userId, interaction.user.username);
  if (!user.hasPlayedCX) {
    return interaction.reply({ content: '❌failed', ephemeral: true });
  }

  const game = await db.getActiveNBGame(guildId);
  if (!game) {
    return interaction.reply({ content: '❌ Game-kani hadda ma shaqeynayo ama wuu dhammaaday.', ephemeral: true });
  }

  if (game.is_blocked) {
    return interaction.reply({ content: '❌ Game-ka Number Box hadda waa xiran yahay.', ephemeral: true });
  }

  if (user.nb_blocked) {
    return interaction.reply({ content: '❌ Adiga waa lagaa xiray game-ka Number Box.', ephemeral: true });
  }

  if (Date.now() > parseInt(game.expires_at)) {
    await db.updateNBGame(game.id, { is_active: 0 });
    return interaction.reply({ content: '❌ Game-kani wuu dhacay (24h Time Out).', ephemeral: true });
  }

  // Check if ever won
  const hasWon = await db.checkIfWinner(userId);
  if (hasWon) {
    return interaction.reply({ content: '❌ Waad guuleysatay hore, mar kale ma ciyaari kartid Number Box.', ephemeral: true });
  }

  const participant = await db.checkNBParticipant(game.id, userId);
  if (participant) {
    // Check for extra slots
    if (user.nb_extra_slots > 0) {
      // Allow the try and decrement the slot
      await db.decrementNBExtraSlots(userId);
    } else {
      return interaction.reply({ content: '❌ Waxaad hore u isticmaashay !nb. Abaalmarintan hal mar oo keliya ayaa la qaadan karaa.', ephemeral: true });
    }
  } else {
    // If it's their first time, we don't need to check nb_extra_slots, 
    // but we should still allow it. 
    // If an admin opened it for everyone, even new people can play.
  }

  const chosenNumber = parseInt(interaction.customId.replace('nb_btn_', ''));
  const isWinner = chosenNumber === game.winning_number;

  if (isWinner) {
    const newWinnersCount = game.winners_count + 1;
    await db.addNBParticipant(game.id, userId, interaction.user.username, true);
    await db.addWallet(userId, 100000);
    await db.logActivity({
      userId,
      username: interaction.user.username,
      type: 'nb_win',
      description: `Won Number Box (Number: ${chosenNumber})`,
      amount: 100000,
      serverId: guildId
    });

    let nextWinningNumber = game.winning_number;
    while (nextWinningNumber === game.winning_number) {
      nextWinningNumber = Math.floor(Math.random() * 10) + 1;
    }

    const updates = {
      winners_count: newWinnersCount,
      winning_number: nextWinningNumber
    };

    if (newWinnersCount >= game.max_winners) {
      updates.is_active = 0;
    }

    await db.updateNBGame(game.id, updates);

    const winnersList = await db.getNBParticipants(game.id);
    const filteredWinners = winnersList.filter(p => p.is_winner === 1);
    const embed = buildNBEmbed(newWinnersCount, game.max_winners, parseInt(game.expires_at), filteredWinners);
    const rows = buildNBButtons(newWinnersCount >= game.max_winners);

    await interaction.update({ embeds: [embed], components: rows });
    await interaction.followUp({ content: `🎉 **WINNER!**\n🔢 Number: ${chosenNumber}\n💰 **+100,000 Cash**\n🏆 Winners: ${newWinnersCount}/${game.max_winners}`, ephemeral: false });
  } else {
    await db.addNBParticipant(game.id, userId, interaction.user.username, false);
    await interaction.reply({ content: '❌ **Nasiib darro!**\nNumber-ka aad dooratay ma ahayn number-ka guuleystay.\nQofkaas mar kale !nb ma isticmaali karo.', ephemeral: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED MESSAGE HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleAllMessages(msg) {
  if (msg.author.bot || !msg.guild) return;

  const content  = msg.content.trim().toLowerCase();
  const raw      = msg.content.trim();
  const channelId = msg.channel.id;
  const guildId   = msg.guild.id;
  const isOwner   = msg.author.id === OWNER_ID;
  const isAdmin   = ADMIN_IDS.includes(msg.author.id);

  // ── Economy Commands ────────────────────────────────────────────────────────
  const econCommands = ['cx', 'wallet', 'work', 'daily', 'rob', 'shop', 'buyshield', 'buycash', 'jailbuy', 'dep', 'with', 'give', 'rank', 'grant', 'deduct', 'drop', 'jail', 'jailremoved', 'nb', 'nbopen', 'nbclose'];
  const cmd = content.split(' ')[0].slice(1);
  
  if (econCommands.includes(cmd)) {
    const user = await db.getUser(msg.author.id, msg.author.username);
    if (cmd !== 'jailbuy' && user.jailUntil > Date.now()) {
      const remaining = Math.ceil((user.jailUntil - Date.now()) / 60000);
      return msg.reply(`🚔 Waxaad ku jirtaa Xabsi! Waxaad u baahan tahay **${remaining}** daqiiqo oo dheeraad ah. Isticmaal \`!jailbuy\` si aad u baxdo.`);
    }

    switch (cmd) {
      case 'drop': {
        if (!user.hasPlayedCX) {
          return msg.reply('❌failed');
        }
        if (user.hasClaimedDrop) {
          return msg.reply('❌ Waxaad hore u isticmaashay !drop. Abaalmarintan hal mar oo keliya ayaa la qaadan karaa.');
        }
        
        await db.addWallet(msg.author.id, 10000);
        await db.updateUser(msg.author.id, { hasclaimeddrop: 1 });
        await db.logActivity({
          userId: msg.author.id,
          username: msg.author.username,
          type: 'drop_claim',
          description: 'Claimed !drop reward',
          amount: 10000,
          serverId: msg.guild.id
        });
        
        return msg.reply('🎉 Hambalyo!\nWaxaad heshay 10,000 Cash adigoo isticmaalay !drop.');
      }
      case 'nb': {
        if (!user.hasPlayedCX) {
          return msg.reply('❌failed');
        }
        
        let game = await db.getActiveNBGame(msg.guild.id);
        
        if (!game) {
          const winningNumber = Math.floor(Math.random() * 10) + 1;
          const initialEmbed = buildNBEmbed(0, 5, Date.now() + (24 * 60 * 60 * 1000), []);
          const rows = buildNBButtons(false);
          const reply = await msg.reply({ embeds: [initialEmbed], components: rows });
          game = await db.createNBGame(msg.guild.id, winningNumber, reply.id);
          return;
        }

        const participants = await db.getNBParticipants(game.id);
        const winners = participants.filter(p => p.is_winner === 1);
        const embed = buildNBEmbed(game.winners_count, game.max_winners, parseInt(game.expires_at), winners);
        const rows = buildNBButtons(game.winners_count >= game.max_winners || Date.now() > parseInt(game.expires_at));
        return msg.reply({ embeds: [embed], components: rows });
      }
      case 'wallet': {
        const shieldStatus = user.shieldUntil > Date.now() ? '🛡️ **Active**' : '🔓 **Inactive**';
        const walletEmbed = new EmbedBuilder()
          .setAuthor({ name: `${msg.author.username}'s Balance`, iconURL: msg.author.displayAvatarURL() })
          .setColor(econUtils.config.colors.economy)
          .addFields(
            { name: '💵 Wallet', value: `\`$${user.wallet.toLocaleString()}\``, inline: true },
            { name: '🏦 Bank', value: `\`$${user.bank.toLocaleString()}\``, inline: true },
            { name: '💎 Diamonds', value: `\`${user.diamonds.toLocaleString()}\``, inline: true },
            { name: '🛡️ Shield Status', value: shieldStatus, inline: false }
          )
          .setFooter({ text: 'Economy System • Modern & Secure' })
          .setTimestamp();
        return msg.reply({ embeds: [walletEmbed] });
      }
      case 'work': {
        const cooldown = 2 * 60 * 60 * 1000;
        if (Date.now() - user.lastWork < cooldown) {
          return msg.reply(`⏳ Fadlan sug **${econUtils.formatTime(cooldown - (Date.now() - user.lastWork))}** si aad mar kale u shaqeyso.`);
        }
        await db.addWallet(msg.author.id, 200);
        await db.updateUser(msg.author.id, { lastWork: Date.now() });
        await db.logActivity({
          userId: msg.author.id,
          username: msg.author.username,
          type: 'work',
          description: 'Daily work reward',
          amount: 200,
          serverId: msg.guild.id
        });
        return msg.reply('💼 Waxaad shaqeysay maanta, waxaadna heshay **$200 Cash**!');
      }
      case 'daily': {
        const cooldown = 24 * 60 * 60 * 1000;
        if (Date.now() - user.lastDaily < cooldown) {
          return msg.reply(`⏳ Fadlan sug **${econUtils.formatTime(cooldown - (Date.now() - user.lastDaily))}** si aad u qaadato hadiyaddaada daily-ga.`);
        }
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('claim_daily').setLabel('🎁 Claim Daily').setStyle(ButtonStyle.Primary));
        const dailyEmbed = econUtils.createEmbed('🎁 Daily Gift', 'Riix badhanka hoose si aad u qaadato hadiyaddaada.');
        const reply = await msg.reply({ embeds: [dailyEmbed], components: [row] });
        const collector = reply.createMessageComponentCollector({ filter: i => i.user.id === msg.author.id, time: 60000 });
        collector.on('collect', async i => {
          if (i.customId === 'claim_daily') {
            const isDiamond = Math.random() < 0.3;
            let rewardText = '';
            if (isDiamond) {
              const diaRewards = [1, 1, 1, 2, 2, 3, 5, 10];
              const weights = [20, 20, 20, 15, 10, 8, 5, 2];
              const rand = Math.random() * 100;
              let sum = 0, amount = 1;
              for(let j=0; j<weights.length; j++) { sum += weights[j]; if(rand <= sum) { amount = diaRewards[j]; break; } }
              await db.addDiamonds(msg.author.id, amount);
              rewardText = `💎 ${amount} Diamonds`;
            } else {
              const cashRewards = [50, 70, 100, 200, 500, 1000];
              const weights = [30, 30, 20, 15, 4, 1];
              const rand = Math.random() * 100;
              let sum = 0, amount = 50;
              for(let j=0; j<weights.length; j++) { sum += weights[j]; if(rand <= sum) { amount = cashRewards[j]; break; } }
              await db.addWallet(msg.author.id, amount);
              rewardText = `$${amount} Cash`;
            }
            await db.updateUser(msg.author.id, { lastDaily: Date.now() });
            await db.logActivity({
              userId: msg.author.id,
              username: msg.author.username,
              type: 'daily',
              description: `Daily gift: ${rewardText}`,
              amount: isDiamond ? 0 : parseInt(rewardText.replace(/[^0-9]/g, '')),
              diamonds: isDiamond ? parseInt(rewardText.replace(/[^0-9]/g, '')) : 0,
              serverId: msg.guild.id
            });
            const successEmbed = econUtils.createEmbed('🎁 Daily Claimed', `Waxaad heshay: **${rewardText}**!`);
            await i.update({ embeds: [successEmbed], components: [] });
            try { await msg.author.send({ embeds: [successEmbed] }); } catch(e) {}
          }
        });
        return;
      }
      case 'cx': {
        const args = msg.content.split(/ +/);
        const amount = econUtils.parseAmount(args[1] || '', user.wallet);
        const choice = args[2]?.toLowerCase();
        if (!amount || amount > user.wallet) return msg.reply('❌ Lacagta aad dhigtay ma saxna ama wallet-kaaga kuma filna.');
        if (!['m', 'x'].includes(choice)) return msg.reply('❌ Fadlan dooro **m** (Madax) ama **x** (Xarash). Tusaale: `!cx 100 m`');
        const cxCooldown = 30000;
        const lastCX = economyCooldowns.get(`${msg.author.id}_cx`) || 0;
        if (Date.now() - lastCX < cxCooldown) {
          return msg.reply(`⏳ Fadlan sug **${Math.ceil((cxCooldown - (Date.now() - lastCX)) / 1000)}s** si aad mar kale u ciyaarto.`);
        }
        economyCooldowns.set(`${msg.author.id}_cx`, Date.now());
        
        // Event: 90% Loss Rate for 48 Hours (Ends Aug 10, 2026)
        const EVENT_END = 1786386940000;
        let result;
        if (Date.now() < EVENT_END) {
          const winChance = Math.random() < 0.1; // 10% win = 90% loss
          result = winChance ? choice : (choice === 'm' ? 'x' : 'm');
        } else {
          result = Math.random() < 0.5 ? 'm' : 'x';
        }

        const resultName = result === 'm' ? 'Madax (M)' : 'Xarash (X)';
        const choiceName = choice === 'm' ? 'Madax (M)' : 'Xarash (X)';
        await db.updateUser(msg.author.id, { hasPlayedCX: 1 });
        const win = choice === result;
        await db.logCX({
          userId: msg.author.id,
          username: msg.author.username,
          amount,
          choice: choiceName,
          result: resultName,
          win,
          serverId: msg.guild.id,
          serverName: msg.guild.name,
          channelId: msg.channel.id
        });
        // Emit WebSocket event to dashboard
        dashboardWS.emitCXGame(
          msg.author.id,
          msg.author.username,
          msg.guild.id,
          msg.guild.name,
          msg.channel.id,
          amount,
          choice === 'm' ? 'Madax' : 'Xarash',
          result === 'm' ? 'Madax' : 'Xarash',
          win
        );
        if (win) {
          await db.addWallet(msg.author.id, amount);
          const updatedUser = await db.getUser(msg.author.id, msg.author.username);
          const totalWealth = parseInt(updatedUser.wallet || 0) + parseInt(updatedUser.bank || 0);
          const currentTaxLevel = await db.getWealthTaxLevel(msg.author.id);
          const taxInfo = calculateWealthTax(totalWealth, currentTaxLevel);
          
          let taxMessage = '';
          if (taxInfo.shouldTax) {
            await db.removeWallet(msg.author.id, taxInfo.taxAmount);
            await db.updateWealthTaxLevel(msg.author.id, taxInfo.newTaxLevel);
            await db.logWealthTax(msg.author.id, msg.author.username, taxInfo.tier, taxInfo.taxAmount);
            taxMessage = `\n\n🏛️ Government Wealth Tax\nWaxaad gaartay heerka $${taxInfo.tier.toLocaleString()}+, sidaas darteed Dowladda ayaa si toos ah uga jartay $${taxInfo.taxAmount.toLocaleString()} Cash.`;
            try { await msg.author.send({ embeds: [econUtils.createEmbed('🏛️ Government Wealth Tax', `Waxaad gaartay heerka $${taxInfo.tier.toLocaleString()}+\n\nCanshuurta: $${taxInfo.taxAmount.toLocaleString()} Cash\nLacagta hadda kuu hartay: $${(totalWealth - taxInfo.taxAmount).toLocaleString()} Cash`)] }); } catch(e) {}
          }
          
          return msg.reply({ embeds: [econUtils.createEmbed('🎉 Waad Guuleysatay!', `🪙 Doorashadaada: ${choiceName}\n🎲 Natiijada: ${resultName}\n💰 Waxaad heshay: **$${amount * 2} Cash**${taxMessage}`, econUtils.config.colors.success)] });
        } else {
          await db.removeWallet(msg.author.id, amount);
          return msg.reply({ embeds: [econUtils.createEmbed('😔 Nasiib darro!', `🪙 Doorashadaada: ${choiceName}\n🎲 Natiijada: ${resultName}\n💸 Waxaad khasaarisay: **$${amount} Cash**\n\n🍀 Isku day mar kale`, econUtils.config.colors.error)] });
        }
      }
      case 'rob': {
        const target = msg.mentions.users.first();
        if (!target || target.bot || target.id === msg.author.id) return msg.reply('❌ Fadlan mention garee qof aad rabto inaad dhacdo.');
        const targetData = await db.getUser(target.id, target.username);
        if (targetData.shieldUntil > Date.now()) return msg.reply(`🛡️ ${target.toString()} wuxuu leeyahay Shield, ma dhici kartid!`);
        if (targetData.wallet < 100) return msg.reply(`❌ ${target.toString()} lacag ku filan ma haysto (ugu yaraan $100).`);
        const robCooldown = 5 * 60 * 1000;
        const lastRob = economyCooldowns.get(`${msg.author.id}_rob`) || 0;
        if (Date.now() - lastRob < robCooldown) {
          return msg.reply(`⏳ Fadlan sug **${econUtils.formatTime(robCooldown - (Date.now() - lastRob))}** si aad mar kale wax u dhacdo.`);
        }
        economyCooldowns.set(`${msg.author.id}_rob`, Date.now());
        const rand = Math.random();
        if (rand < 0.4) {
          const amount = Math.floor(Math.random() * (targetData.wallet * 0.5)) + 50;
          await db.removeWallet(target.id, amount);
          await db.addWallet(msg.author.id, amount);
          await db.logActivity({
            userId: msg.author.id,
            username: msg.author.username,
            type: 'rob_success',
            description: `Successfully robbed ${target.username}`,
            amount,
            serverId: msg.guild.id
          });
          return msg.reply(`✅ Waad ku guuleysatay! Waxaad ka xaday ${target.toString()} lacag dhan **$${amount.toLocaleString()}**.`);
        } else if (rand < 0.7) {
          await db.logActivity({
            userId: msg.author.id,
            username: msg.author.username,
            type: 'rob_fail',
            description: `Failed to rob ${target.username}`,
            serverId: msg.guild.id
          });
          return msg.reply(`❌ Fashilmay! Waxba ma aadan helin.`);
        } else {
          const jailTime = Math.floor(Math.random() * 10) + 1;
          await db.updateUser(msg.author.id, { jailUntil: Date.now() + (jailTime * 60 * 1000) });
          await db.logActivity({
            userId: msg.author.id,
            username: msg.author.username,
            type: 'rob_jail',
            description: `Caught robbing ${target.username} and jailed for ${jailTime}m`,
            serverId: msg.guild.id
          });
          return msg.reply(`🚔 Jail! Booliska ayaa ku qabtay, waxaadna xirnaan doontaa **${jailTime} daqiiqo**.`);
        }
      }
      case 'shop': {
        const shopEmbed = econUtils.createEmbed('🛒 Economy Shop', 'Isticmaal amarrada hoose si aad wax u iibsato.')
          .addFields(
            { name: '🛡️ !buyshield', value: '25 Diamonds (24 Hours Protection)', inline: true },
            { name: '💰 !buycash <amount>', value: 'Exchange Diamonds for Cash', inline: true },
            { name: '💎 Rates', value: '100 Cash = 5 💎\n200 Cash = 10 💎\n300 Cash = 20 💎', inline: false }
          );
        return msg.reply({ embeds: [shopEmbed] });
      }
      case 'buyshield': {
        if (user.diamonds < 25) return msg.reply('❌ Ma haysatid Diamonds ku filan (25 💎 ayaa loo baahan yahay).');
        await db.removeDiamonds(msg.author.id, 25);
        await db.updateUser(msg.author.id, { shieldUntil: Date.now() + (24 * 60 * 60 * 1000) });
        await db.logActivity({
          userId: msg.author.id,
          username: msg.author.username,
          type: 'shop_shield',
          description: 'Purchased 24h Shield',
          diamonds: 25,
          serverId: msg.guild.id
        });
        return msg.reply('🛡️ Waxaad iibsatay Shield! Waxaad ka badbaadaysaa dhaca muddo **24 saacadood** ah.');
      }
      case 'buycash': {
        const args = msg.content.split(/ +/);
        const amount = parseInt(args[1] || '');
        if (!amount || ![100, 200, 300].includes(amount)) return msg.reply('❌ Fadlan dooro lacagta aad rabto (100, 200, ama 300).');
        let cost = amount === 100 ? 5 : amount === 200 ? 10 : 20;
        if (user.diamonds < cost) return msg.reply(`❌ Ma haysatid Diamonds ku filan (${cost} 💎 ayaa loo baahan yahay).`);
        await db.removeDiamonds(msg.author.id, cost);
        await db.addWallet(msg.author.id, amount);
        await db.logActivity({
          userId: msg.author.id,
          username: msg.author.username,
          type: 'shop_cash',
          description: `Exchanged ${cost} diamonds for $${amount} cash`,
          amount,
          diamonds: cost,
          serverId: msg.guild.id
        });
        return msg.reply(`💰 Waxaad ku beddelatay ${cost} 💎 lacag dhan **$${amount} Cash**.`);
      }
      case 'jailbuy': {
        if (user.jailUntil <= Date.now()) return msg.reply('❌ Kuma jirtid xabsi!');
        
        const args = msg.content.split(/ +/);
        const manualMinutes = parseInt(args[1]);

        if (!isNaN(manualMinutes) && manualMinutes > 0) {
          const price = manualMinutes * 15;
          if (user.bank < price) return msg.reply(`❌ Bank-kaaga lacag ku filan kuma jirto ($${price} ayaa loo baahan yahay).`);
          
          await db.removeBank(msg.author.id, price);
          const newJailUntil = Math.max(Date.now(), user.jailUntil - (manualMinutes * 60 * 1000));
          await db.updateUser(msg.author.id, { jailUntil: newJailUntil });
          await db.logActivity({
            userId: msg.author.id,
            username: msg.author.username,
            type: 'jailbuy',
            description: `Paid $${price} to reduce jail by ${manualMinutes}m`,
            amount: price,
            serverId: msg.guild.id
          });
          return msg.reply({ embeds: [econUtils.createEmbed('✅ Xabsiga waa lagaa dhimay', `Waxaad bixisay **$${price}**, waxaana lagaa dhimay **${manualMinutes} daqiiqo**.`)] });
        }

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('jail_2').setLabel('2 Min ($30)').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('jail_3').setLabel('3 Min ($45)').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('jail_5').setLabel('5 Min ($75)').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('jail_8').setLabel('8 Min ($120)').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('jail_10').setLabel('10 Min ($150)').setStyle(ButtonStyle.Secondary)
        );
        const jailEmbed = econUtils.createEmbed('🚔 Jail Buy', 'Dooro inta daqiiqo ee aad rabto inaad iska bixiso lacagta si aad u baxdo.\n\n💰 **Qiimaha:** $15 halkii daqiiqo.');
        const reply = await msg.reply({ embeds: [jailEmbed], components: [row] });
        const collector = reply.createMessageComponentCollector({ filter: i => i.user.id === msg.author.id, time: 60000 });
        collector.on('collect', async i => {
          const option = parseInt(i.customId.split('_')[1]);
          const price = option * 15;
          const currentUser = await db.getUser(msg.author.id);
          if (currentUser.bank < price) return i.reply({ content: `❌ Bank-kaaga lacag ku filan kuma jirto ($${price} ayaa loo baahan yahay).`, ephemeral: true });
          await db.removeBank(msg.author.id, price);
          const newJailUntil = Math.max(Date.now(), currentUser.jailUntil - (option * 60 * 1000));
          await db.updateUser(msg.author.id, { jailUntil: newJailUntil });
          await i.update({ embeds: [econUtils.createEmbed('✅ Xabsiga waa lagaa dhimay', `Waxaad bixisay **$${price}**, waxaana lagaa dhimay **${option} daqiiqo** ka dib.`)], components: [] });
        });
        return;
      }
      case 'dep': {
        const args = msg.content.split(/ +/);
        const amount = econUtils.parseAmount(args[1] || '', user.wallet);
        if (!amount || amount > user.wallet) return msg.reply('❌ Lacagta aad dhigayso ma saxna ama wallet-kaaga kuma filna.');
        await db.removeWallet(msg.author.id, amount);
        await db.addBank(msg.author.id, amount);
        return msg.reply(`🏦 Waxaad dhigatay **$${amount.toLocaleString()}** Bank-kaaga.`);
      }
      case 'with': {
        const args = msg.content.split(/ +/);
        const amount = econUtils.parseAmount(args[1] || '', user.bank);
        if (!amount || amount > user.bank) return msg.reply('❌ Lacagta aad la baxayso ma saxna ama bank-kaaga kuma filna.');
        await db.removeBank(msg.author.id, amount);
        await db.addWallet(msg.author.id, amount);
        return msg.reply(`💸 Waxaad kala soo baxday **$${amount.toLocaleString()}** Bank-kaaga.`);
      }
      case 'give': {
        const args = msg.content.split(/ +/);
        const target = msg.mentions.users.first();
        const amount = econUtils.parseAmount(args[2] || '', user.wallet);
        if (!target || target.bot || target.id === msg.author.id) return msg.reply('❌ Fadlan mention garee qof sax ah.');
        if (!amount || amount > user.wallet) return msg.reply('❌ Lacagta aad dirayso ma saxna ama wallet-kaaga kuma filna.');
        await db.removeWallet(msg.author.id, amount);
        await db.addWallet(target.id, amount);
        await db.logGive({
          senderId: msg.author.id,
          senderName: msg.author.username,
          receiverId: target.id,
          receiverName: target.username,
          amount,
          serverId: msg.guild.id,
          serverName: msg.guild.name,
          channelId: msg.channel.id
        });
        return msg.reply(`💸 Waxaad u dirtay **$${amount.toLocaleString()}** ${target.toString()}.`);
      }
      case 'rank': {
        const top = await db.getTopRich(10);
        let desc = top.map((t, i) => `**${i + 1}.** <@${t.userId}> — **$${t.total.toLocaleString()}**`).join('\n');
        return msg.reply({ embeds: [econUtils.createEmbed('🏆 Top 10 Richest Players', desc || 'Ma jiro qof weli liiska ku jira.', econUtils.config.colors.economy)] });
      }
      case 'grant': {
        if (!isAdmin) return;
        const args = msg.content.split(/ +/);
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2] || '');
        if (!target || isNaN(amount)) return msg.reply('❌ Tusaale: `!grant @user 1000`');
        await db.addWallet(target.id, amount);
        await db.logActivity({
          userId: target.id,
          username: target.username,
          type: 'grant',
          description: `Admin granted $${amount}`,
          amount,
          serverId: msg.guild.id
        });
        return msg.reply(`👑 Admin: Waxaad u dartay **$${amount.toLocaleString()}** ${target.toString()}.`);
      }
      case 'deduct': {
        if (!isAdmin) return;
        const args = msg.content.split(/ +/);
        const target = msg.mentions.users.first();
        const amount = parseInt(args[2] || '');
        if (!target || isNaN(amount)) return msg.reply('❌ Tusaale: `!deduct @user 1000`');
        
        const targetUser = await db.getUser(target.id, target.username);
        // Deduct from wallet first, then bank if needed
        let remainingDeduct = amount;
        let walletDeduct = Math.min(targetUser.wallet, remainingDeduct);
        await db.removeWallet(target.id, walletDeduct);
        remainingDeduct -= walletDeduct;
        
        if (remainingDeduct > 0) {
          await db.removeBank(target.id, remainingDeduct);
        }

        await db.logActivity({
          userId: target.id,
          username: target.username,
          type: 'deduct',
          description: `Admin deducted $${amount}`,
          amount,
          serverId: msg.guild.id
        });
        return msg.reply(`👑 Admin: Waxaad ka jartay **$${amount.toLocaleString()}** ${target.toString()}.`);
      }
      case 'jail': {
        if (!isAdmin) return;
        const args = msg.content.split(/ +/);
        const target = msg.mentions.users.first();
        const minutes = parseInt(args[2] || '');
        if (!target || isNaN(minutes)) return msg.reply('❌ Tusaale: `!jail @user 10`');
        
        await db.updateUser(target.id, { jailUntil: Date.now() + (minutes * 60 * 1000) });
        await db.logActivity({
          userId: target.id,
          username: target.username,
          type: 'admin_jail',
          description: `Admin jailed for ${minutes}m`,
          serverId: msg.guild.id
        });
        return msg.reply(`🚔 Admin: Waxaad xirtay ${target.toString()} muddo **${minutes} daqiiqo** ah.`);
      }
      case 'jailremoved': {
        if (!isAdmin) return;
        const args = msg.content.split(/ +/);
        const target = msg.mentions.users.first();
        const minutes = parseInt(args[2] || '');
        if (!target || isNaN(minutes)) return msg.reply('❌ Tusaale: `!jailremoved @user 10`');
        
        const targetUser = await db.getUser(target.id, target.username);
        if (targetUser.jailUntil <= Date.now()) return msg.reply('❌ Qofkani kuma jiro xabsi!');
        
        const newJailUntil = Math.max(Date.now(), targetUser.jailUntil - (minutes * 60 * 1000));
        await db.updateUser(target.id, { jailUntil: newJailUntil });
        
        await db.logActivity({
          userId: target.id,
          username: target.username,
          type: 'admin_unjail',
          description: `Admin reduced jail by ${minutes}m`,
          serverId: msg.guild.id
        });
        
        const remaining = Math.ceil((newJailUntil - Date.now()) / 60000);
        if (remaining <= 0) {
          return msg.reply(`🔓 Admin: Waxaad xabsiga ka saartay ${target.toString()}.`);
        } else {
          return msg.reply(`🔓 Admin: Waxaad ${target.toString()} ka dhimay **${minutes} daqiiqo**. Waxaa u haray **${remaining} daqiiqo**.`);
        }
      }
      case 'nbopen': {
        if (!isAdmin) return;
        const args = msg.content.split(/ +/);
        const sub = args[1]?.toLowerCase();
        
        if (sub === 'all') {
          const game = await db.getActiveNBGame(msg.guild.id);
          if (!game) return msg.reply('❌ Ma jiro game Number Box oo hadda socda.');
          await db.openNBAll(game.id);
          await db.uncloseNBAll(game.id);
          return msg.reply('🎰 **NB Update:** Dhammaan dadka (aan weli guuleysan) waxaa loo furay fursad labaad!');
        } else {
          const target = msg.mentions.users.first() || { id: args[1] };
          if (!target.id) return msg.reply('❌ Tusaale: `!nbopen all` ama `!nbopen @user` ama `!nbopen USER_ID`');
          await db.openNBUser(target.id);
          return msg.reply(`🎰 **NB Update:** ${target.toString?.() || target.id} waxaa loo furay fursad kale!`);
        }
      }
      case 'nbclose': {
        if (!isAdmin) return;
        const args = msg.content.split(/ +/);
        const sub = args[1]?.toLowerCase();
        
        if (sub === 'all') {
          const game = await db.getActiveNBGame(msg.guild.id);
          if (!game) return msg.reply('❌ Ma jiro game Number Box oo hadda socda.');
          await db.closeNBAll(game.id);
          return msg.reply('🎰 **NB Update:** Game-ka Number Box waa laga xiray dhammaan dadka!');
        } else {
          const target = msg.mentions.users.first() || { id: args[1] };
          if (!target.id) return msg.reply('❌ Tusaale: `!nbclose all` ama `!nbclose @user` ama `!nbclose USER_ID`');
          await db.closeNBUser(target.id);
          return msg.reply(`🎰 **NB Update:** ${target.toString?.() || target.id} waa laga xiray game-ka!`);
        }
      }
    }
  }

  // ── !help ──────────────────────────────────────────────────────────────────
  if (content === '!help') {
    const embed = new EmbedBuilder()
      .setTitle('🎮 CIYAAL XAMAR — Amarrada (Commands)')
      .setColor(0x5865f2)
      .setDescription('Waa kuwan dhammaan amarrada bot-ka:')
      .addFields(
        { name: '🔪 Mafia Ciyaarta', value: [
          '`!dilaay` — Lobby cusub bilow (adiga waxaad noqon doontaa host)',
          '`!kasaar @user` — Host: ciyaaryahan lobby ka saar (mention)',
          '`!dilaay @user kasaar` — Sidoo kale lobby ka saar (mention)',
        ].join('\n') },
        { name: '🎧 Voice Channel — 24/7', value: [
          '`!join` — Bot-ka VC-ga ku soo gal (24/7 joogayaa)',
          '`!leave` — Bot-ka VC-ka ka saar',
        ].join('\n') },
        { name: '🆘 Caawimo & Xiriir', value: [
          '`!icaawi [farriin]` — Cilad ama su\'aal owner-ka u dir',
          '  _Tusaale: `!icaawi Bot-ka lobby kuma furin`_',
        ].join('\n') },
        { name: '📝 Say Command', value: '`!say` — Foom modal ah furo si bot-ku fariin idinku dhaha (Admin/Manage Messages)' },
        { name: '💰 Economy System', value: [
          '`!wallet` — Wallet, Bank iyo Diamonds arag',
          '`!cx <amount> <m/x>` — Lacag ku khamaar (Madax/Xarash)',
          '`!work` — Shaqayso 2 saacadood kasta ($200)',
          '`!daily` — Hadiyad maalinle ah qaado',
          '`!rob @user` — Qof kale lacag ka xado',
          '`!bank` — `!dep <amount>` ama `!with <amount>`',
          '`!shop` — Shield ama Cash iibso',
          '`!rank` — Top 10 Richest Players',
          '`!drop` — Reward system ($10,000)',
          '`!nb` — Number Box game ($100,000)',
        ].join('\n') },
        { name: '📊 Admin/Owner Commands', value: [
          '`!dashboard` — Serverrada bot ku jira oo dhan arag (Owner kaliya)',
          '`!dm @qof farriin` — DM gaar ah (Owner)',
          '`!news farriin` — Dhammaan dadka DM u dir (Owner)',
          '`!grant @user <amount>` — Lacag u dar qof (Admin)',
          '`!deduct @user <amount>` — Lacag ka jar qof (Admin)',
          '`!jail @user <minutes>` — Qof xabsi u dir (Admin)',
          '`!jailremoved @user <minutes>` — Xabsiga ka dhim ama ka saar (Admin)',
          '`!nbopen all/@user` — NB u fur qof ama dhammaan (Admin)',
          '`!nbclose all/@user` — NB ka xir qof ama dhammaan (Admin)',
        ].join('\n') },
      )
      .setFooter({ text: 'Ciyaal Xamar Bot · !icaawi haddaad caawimaad u baahantahay' });
    await msg.reply({ embeds: [embed] });
    return;
  }

  // ── !join ──────────────────────────────────────────────────────────────────
  if (content === '!join') {
    const vc = msg.member?.voice?.channel;
    if (!vc) { await msg.reply('⚠️ Marka hore **Voice Channel** gal, kadibna `!join` qor.'); return; }
    joinVC(guildId, vc.id, msg.guild.voiceAdapterCreator);
    addLog(guildId, msg.guild.name, `🎧 Bot wuxuu ku biiray VC: ${vc.name}`);
    await msg.reply({ embeds: [new EmbedBuilder()
      .setTitle('🎧 24/7 Voice Channel — Online!')
      .setDescription(`Bot-ku wuxuu ku biiray **${vc.name}**.\nHabeen iyo maalin wuu ku sii joogayaa!`)
      .setColor(0x57f287)
      .addFields({ name: '📍 Channel', value: vc.name, inline: true }, { name: '🔇 Xaalad', value: 'Maqal · Aan hadlayn', inline: true })
      .setFooter({ text: '`!leave` haddaad rabto bot-ka in uu ka baxo' })] });
    return;
  }

  // ── !leave ─────────────────────────────────────────────────────────────────
  if (content === '!leave') {
    const conn = voiceConnections.get(guildId);
    if (!conn) { await msg.reply('⚠️ Bot-ku voice channel kuma jiro hadda.'); return; }
    try { conn.destroy(); } catch {}
    voiceConnections.delete(guildId);
    addLog(guildId, msg.guild.name, '🎧 Bot wuxuu ka baxay VC-ga');
    await msg.reply('👋 Bot-ku VC-ga wuu ka baxay.');
    return;
  }

  // ── !icaawi ────────────────────────────────────────────────────────────────
  if (content.startsWith('!icaawi')) {
    const report = raw.slice('!icaawi'.length).trim();
    if (!report) { await msg.reply('⚠️ Fariintaada qor kadib `!icaawi`.\n_Tusaale: `!icaawi Bot-ka lobby kuma furin`_'); return; }
    const owner  = await client.users.fetch(OWNER_ID).catch(() => null);
    if (!owner) { await msg.reply('⚠️ Maamulaha lama gaadhi karin. Dib u isku day.'); return; }
    const dmSent = await owner.send({ embeds: [new EmbedBuilder()
      .setTitle('🆘 Codsi Caawimo — Ciyaal Xamar Bot').setColor(0xed4245)
      .addFields(
        { name: '👤 Qofka',   value: `**${msg.author.displayName ?? msg.author.username}**\n\`${msg.author.id}\``, inline: true },
        { name: '🏠 Server',  value: `${msg.guild.name}\n\`${msg.guild.id}\``,                                     inline: true },
        { name: '💬 Farriin', value: report },
      )
      .setFooter({ text: `User: ${msg.author.id} · Server: ${msg.guild.id}` }).setTimestamp()
    ] }).then(() => true).catch(() => false);
    if (dmSent) {
      await msg.reply('✅ **Fariintaada maamulaha la gaarsiiiyay!**\nIyagu waxay kugu jawaabi doonaan DM-kaaga.');
      addLog(guildId, msg.guild.name, `🆘 ${msg.author.username} wuxuu u diray caawimo codsi owner-ka`);
    } else {
      await msg.reply('⚠️ Maamulaha DM-kiisu waa xidnaanaa. Dib u isku day.');
    }
    return;
  }

  // ── !dm — Owner kaliya ─────────────────────────────────────────────────────
  if (content.startsWith('!dm')) {
    if (!isOwner) { await msg.reply('🔐 Amarka `!dm` kaliya owner-ku wuxuu isticmaali karaa.'); return; }
    const rest  = raw.slice('!dm'.length).trim();
    const match = rest.match(/^<@!?(\d{15,25})>\s*([\s\S]*)$/) || rest.match(/^(\d{15,25})\s+([\s\S]*)$/);
    if (!match || !match[2]?.trim()) { await msg.reply('⚠️ Isticmaal: `!dm @user farriinta` ama `!dm userID farriinta`.'); return; }
    const user = await client.users.fetch(match[1]).catch(() => null);
    if (!user) { await msg.reply('⚠️ Qofkaan lama helin.'); return; }
    const ok = await user.send({ embeds: [new EmbedBuilder()
      .setTitle('📢 Farriin — Ciyaal Xamar').setDescription(match[2].trim()).setColor(0x5865f2)
      .setFooter({ text: `${msg.guild.name} · Ciyaal Xamar Bot` }).setTimestamp()
    ] }).then(() => true).catch(() => false);
    if (ok) { addLog(guildId, msg.guild.name, `📢 Owner wuxuu DM fariin u diray ${user.username}`); await msg.reply(`✅ Fariinta waxaa la diray **${user.username}**.`); }
    else     { await msg.reply(`⚠️ Fariinta lama dirin karin **${user.username}** — DM-kiisu waa xidnaan karaa.`); }
    return;
  }

  // ── !news — Owner kaliya ───────────────────────────────────────────────────
  if (content.startsWith('!news')) {
    if (!isOwner) { await msg.reply('🔐 Amarka `!news` kaliya owner-ku wuxuu isticmaali karaa.'); return; }
    const farriin = raw.slice('!news'.length).trim();
    if (!farriin) { await msg.reply('⚠️ Fariinta qor kadib `!news`.\n_Tusaale: `!news Bot-ka wuxuu helaya update cusub!`_'); return; }
    const guilds = Array.from(client.guilds.cache.values());
    if (guilds.length === 0) { await msg.reply('⚠️ Bot-ku wali server kuma biirin.'); return; }
    const newsEmbed = new EmbedBuilder()
      .setTitle('📰 Wariye — Ciyaal Xamar Bot').setDescription(farriin).setColor(0xf59e0b)
      .addFields({ name: '📡 Isha', value: 'Ciyaal Xamar — Bot Maamulaha', inline: true })
      .setFooter({ text: 'Ciyaal Xamar Bot · Farriin rasmi ah' }).setTimestamp();
    await msg.reply(`⏳ Server **${guilds.length}** ka dhammaan dadka loo dirayo farriin...`);
    let totalSent = 0, totalFailed = 0, totalMembers = 0;
    for (const guild of guilds) {
      try {
        const members = await guild.members.fetch();
        const humans  = members.filter(m => !m.user.bot);
        totalMembers += humans.size;
        for (const [, member] of humans) {
          const ok = await member.user.send({ embeds: [newsEmbed] }).then(() => true).catch(() => false);
          if (ok) totalSent++; else totalFailed++;
        }
      } catch {}
    }
    addLog(guildId, msg.guild.name, `📰 Owner wuxuu news u diray ${totalSent}/${totalMembers} qof (${guilds.length} server)`);
    await msg.channel.send(`📰 **News la diray!**\n🌐 Serverro: **${guilds.length}**\n👥 Dadka: **${totalMembers}**\n✅ La diray: **${totalSent}**\n❌ DM xidnaa: **${totalFailed}**`).catch(() => null);
    return;
  }

  // ── !dashboard — Owner kaliya ──────────────────────────────────────────────
  if (content === '!dashboard') {
    if (!isOwner) { await msg.reply('🔐 Amarka `!dashboard` kaliya owner-ku wuxuu isticmaali karaa.'); return; }
    const guilds = Array.from(client.guilds.cache.values());
    if (guilds.length === 0) { await msg.reply('⚠️ Bot-ku wali server kuma biirin.'); return; }
    const chunks = [];
    for (let i = 0; i < guilds.length; i += 10) chunks.push(guilds.slice(i, i + 10));
    for (let ci = 0; ci < chunks.length; ci++) {
      const fields = await Promise.all(chunks[ci].map(async g => ({
        name:  `🏠 ${g.name}`,
        value: [`\`ID:\` ${g.id}`, `👑 Owner: \`${g.ownerId}\``, `👥 Members: **${g.memberCount ?? '?'}**`,
                `🎮 Active games: **${getGuildGames(g.id).filter(gm => gm.phase !== 'ended').length}**`,
                `📅 Bot joined: <t:${Math.floor(g.joinedTimestamp / 1000)}:R>`].join('\n'),
        inline: false,
      })));
      const embed = new EmbedBuilder()
        .setTitle(`📊 Dashboard — Serverrada Bot (${ci * 10 + 1}–${Math.min((ci + 1) * 10, guilds.length)} / ${guilds.length})`)
        .setColor(0x5865f2).addFields(fields).setFooter({ text: `Ciyaal Xamar Bot · ${new Date().toUTCString()}` });
      await msg.channel.send({ embeds: [embed] }).catch(() => null);
    }
    addLog(guildId, msg.guild.name, `📊 Owner wuxuu xukumay dashboard (${guilds.length} server)`);
    return;
  }

  // ── !dilaay ────────────────────────────────────────────────────────────────
  if (content === '!dilaay') {
    const existing   = games.get(channelId);
    if (existing && existing.phase !== 'ended') { await msg.reply('⚠️ Kanaalkan ciyaaro socota ayaa ku jirta! Jooji ciyaartii hore ka hor.'); return; }
    const guildGames = getGuildGames(guildId);
    if (guildGames.length >= MAX_GAMES_PER_GUILD) { await msg.reply(`⚠️ Servarkaan ${MAX_GAMES_PER_GUILD} ciyaaro ayaa isku mar ka socda.`); return; }
    const game = createGame(guildId, channelId, msg.author.id);
    game.players.set(msg.author.id, {
      id: msg.author.id, username: msg.author.username,
      displayName: msg.member?.displayName ?? msg.author.username,
      role: null, alive: true, protected: false,
    });
    addLog(guildId, msg.guild.name, `🎮 ${msg.author.username} wuxuu bilaabay ciyaaro cusub`);
    const lobbyMsg = await msg.channel.send({ embeds: [buildLobbyEmbed(game, msg.guild)], components: [buildLobbyButtons(game)] }).catch(err => {
      console.error('⚠️ Lobby send error:', err?.message || err); return null;
    });
    if (!lobbyMsg) { games.delete(channelId); await msg.reply('⚠️ Lobby-ga lama furin karin.').catch(() => null); return; }
    game.lobbyMessageId = lobbyMsg.id;
    return;
  }

  // ── !kasaar @user  OR  !dilaay @user kasaar ───────────────────────────────
  const kasaarMention =
    (content.startsWith('!kasaar ') && msg.mentions.users.first()) ||
    (content.startsWith('!dilaay ') && content.endsWith(' kasaar') && msg.mentions.users.first());

  if (content === '!kasaar' || kasaarMention) {
    const game = games.get(channelId);
    if (!game || game.phase !== 'lobby') { await msg.reply('⚠️ Kanaalkan ma jirto lobby furan.'); return; }
    if (game.hostId !== msg.author.id)   { await msg.reply('⚠️ Kaliya host-ku wuxuu isticmaali karaa `!kasaar`.'); return; }

    // ── Direct mention kick ──────────────────────────────────────────────────
    if (kasaarMention) {
      const targetUser = msg.mentions.users.first();
      const target = game.players.get(targetUser.id);
      if (!target) { await msg.reply(`⚠️ **${targetUser.username}** lobby-ga kuma jirto.`); return; }
      if (targetUser.id === game.hostId) { await msg.reply('⚠️ Host-ku isaga saari karo ma ahan.'); return; }
      game.players.delete(targetUser.id);
      addLog(guildId, msg.guild.name, `🚪 ${target.displayName} waa laga saaray lobby-ga (mention kick)`);
      await refreshLobbyMsg(game, msg.guild);
      await msg.reply(`🚪 **${target.displayName}** lobby-ga waa laga saaray.`);
      const ku = await client.users.fetch(targetUser.id).catch(() => null);
      if (ku) await ku.send('🚪 Host-ku wuu kaa saaray lobby-ga.').catch(() => null);
      return;
    }

    // ── Button menu kick (fallback when no mention) ──────────────────────────
    const kickButtons = buildKickButtons(game, msg.author.id);
    if (kickButtons.length === 0) { await msg.reply('⚠️ Ma jiraan ciyaaryahan la saari karo.'); return; }
    await msg.reply({ content: '🚪 Xulo ciyaaryahanka aad saari rabto, ama isticmaal `!kasaar @user`:', components: kickButtons });
    return;
  }

  // ── !say — Admin/Manage Messages ──────────────────────────────────────────
  if (content === '!say') {
    const hasPerm = msg.member?.permissions?.has(PermissionFlagsBits.Administrator)
      || msg.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
    if (!hasPerm) { await msg.reply('🔐 Amarka `!say` waxaa isticmaali kara Administrator ama qof leh Manage Messages permission.'); return; }
    await msg.delete().catch(() => null);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`open_say_${msg.channel.id}`).setLabel('📝 Buuxi Foomka').setStyle(ButtonStyle.Primary),
    );
    const dmSent = await msg.author.send({ content: 'Riix batoonka hoose si aad u buuxiso foomka fariinta:', components: [row] }).then(() => true).catch(() => false);
    if (!dmSent) {
      const warn = await msg.channel.send(`⚠️ ${msg.author}, DM-kaaga waa xidnaan karaa. Fadlan fur DM si aad u isticmaasho \`!say\`.`).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => null), 8000);
    }
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED INTERACTION HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleAllInteractions(interaction) {
  // ── Slash commands ─────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup') await handleSetupCommand(interaction);
    return;
  }

  // ── Channel select menus (ticket setup) ───────────────────────────────────
  if (interaction.isChannelSelectMenu()) {
    switch (interaction.customId) {
      case 'setup_open_category':   await handleOpenCategorySelect(interaction);   break;
      case 'setup_closed_category': await handleClosedCategorySelect(interaction); break;
      case 'setup_post_channel':    await handlePostChannelSelect(interaction);    break;
    }
    return;
  }

  // ── Role select menus (ticket setup) ──────────────────────────────────────
  if (interaction.isRoleSelectMenu()) {
    if (interaction.customId === 'setup_staff_roles') await handleStaffRolesSelect(interaction);
    return;
  }

  // ── Modal Submit ───────────────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'setup_embed_modal') { await handleEmbedModal(interaction); return; }
    if (interaction.customId.startsWith('say_modal_')) await handleSayModalSubmit(interaction);
    return;
  }

  // ── Ticket buttons ─────────────────────────────────────────────────────────
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('nb_btn_')) {
      await handleNBInteraction(interaction);
      return;
    }
    switch (interaction.customId) {
      case 'ticket_open':          await handleOpenTicket(interaction);   return;
      case 'ticket_claim':         await handleClaimTicket(interaction);  return;
      case 'ticket_close':         await handleCloseTicket(interaction);  return;
      case 'ticket_close_confirm': await handleCloseConfirm(interaction); return;
      case 'ticket_close_cancel':  await handleCloseCancel(interaction);  return;
      case 'setup_reset':          await handleSetupReset(interaction);   return;
      case 'setup_cancel':         await handleSetupCancel(interaction);  return;
    }
  }

  if (!interaction.isButton()) return;

  // ── !say — modal fom button ────────────────────────────────────────────────
  if (interaction.customId.startsWith('open_say_')) {
    const hasPerm = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
      || interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
    if (!hasPerm) { await interaction.reply({ content: '🔐 Ogolaanshahaaga kuma filan si aad u isticmaasho `!say`.', ephemeral: true }); return; }
    const targetChannelId = interaction.customId.slice('open_say_'.length);
    const modal = new ModalBuilder().setCustomId(`say_modal_${targetChannelId}`).setTitle('📝 Say — Fariin Bot-ku Diro');
    const contentInput = new TextInputBuilder().setCustomId('say_content').setLabel('Content (waajib)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000);
    const attachInput  = new TextInputBuilder().setCustomId('say_attachment_url').setLabel('Attachment URL (ikhtiyari — link sawir/file)').setStyle(TextInputStyle.Short).setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(contentInput), new ActionRowBuilder().addComponents(attachInput));
    await interaction.showModal(modal);
    return;
  }

  // ── Dilaay — Night DM actions (from DM channels, no guild) ─────────────────
  const userId   = interaction.user.id;
  const customId = interaction.customId;

  if (customId.startsWith('night_kill_') || customId.startsWith('night_save_') || customId.startsWith('night_sheriff_')) {
    await handleNightDmAction(interaction, userId, customId);
    return;
  }

  // ── Dilaay — Guild interactions ────────────────────────────────────────────
  if (!interaction.guild) return;
  const guildId   = interaction.guild.id;
  const channelId = interaction.channelId;
  const game      = games.get(channelId);

  if (customId === 'lobby_join') {
    if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Kanaalkan lobby ma jiro.', ephemeral: true }); return; }
    if (game.players.has(userId)) { await interaction.reply({ content: '⚠️ Hore baad ku biirtay lobby-ga.', ephemeral: true }); return; }
    if (game.players.size >= 20)  { await interaction.reply({ content: '⚠️ Lobby-ga wuu buuxay (20/20).', ephemeral: true }); return; }
    game.players.set(userId, {
      id: userId, username: interaction.user.username,
      displayName: interaction.member?.displayName ?? interaction.user.username,
      role: null, alive: true, protected: false,
    });
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ku biiray lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild);
    await interaction.reply({ content: '✅ Lobby-ga waad ku biiray!', ephemeral: true });
    return;
  }

  if (customId === 'lobby_leave') {
    if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Kanaalkan lobby ma jiro.', ephemeral: true }); return; }
    if (!game.players.has(userId)) { await interaction.reply({ content: '⚠️ Ma jirtid lobby-ga.', ephemeral: true }); return; }
    if (userId === game.hostId)    { await interaction.reply({ content: '⚠️ Host-ku ma bixin karo. JOOJI batoonka isticmaal.', ephemeral: true }); return; }
    game.players.delete(userId);
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ka baxay lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild);
    await interaction.reply({ content: '👋 Lobby-ga waad ka baxday.', ephemeral: true });
    return;
  }

  if (customId === 'lobby_stop') {
    if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Kanaalkan lobby ma jiro.', ephemeral: true }); return; }
    if (userId !== game.hostId) { await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu joojin karaa.', ephemeral: true }); return; }
    if (game.phaseTimer) clearTimeout(game.phaseTimer);
    game.phase = 'ended';
    games.delete(channelId);
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) { const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null); if (lm) await lm.edit({ components: [] }).catch(() => null); }
    }
    addLog(guildId, interaction.guild.name, '🛑 Host-ku wuxuu joojiyay lobby-ga');
    await interaction.reply({ content: '🛑 Ciyaarta waa la joojiyay.', ephemeral: true });
    const ch = await client.channels.fetch(game.channelId).catch(() => null);
    if (ch) await ch.send('🛑 Lobby-ga waa la xirray host-ka.').catch(() => null);
    return;
  }

  if (customId === 'lobby_start') {
    if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Kanaalkan lobby ma jiro.', ephemeral: true }); return; }
    if (userId !== game.hostId)          { await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu bilaabi karaa.', ephemeral: true }); return; }
    if (game.players.size < 5)           { await interaction.reply({ content: '⚠️ Ugu yaraan 5 ciyaaryahan ayaa loo baahan yahay.', ephemeral: true }); return; }
    assignRoles(game);
    game.startedAt = new Date();
    addLog(guildId, interaction.guild.name, `🎮 Ciyaarta waa bilaabmay — ${game.players.size} ciyaaryahan`);
    if (game.lobbyMessageId) {
      const ch = await client.channels.fetch(game.channelId).catch(() => null);
      if (ch) { const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null); if (lm) await lm.edit({ components: [] }).catch(() => null); }
    }
    await interaction.reply({ content: '🎮 Ciyaarta waa bilaabmay! Doorarkiinna DM-kiinna ku fiiri.', ephemeral: false });
    for (const player of Array.from(game.players.values())) {
      const user = await client.users.fetch(player.id).catch(() => null);
      if (user) await user.send({ embeds: [buildRoleDmEmbed(player, game)] }).catch(() => null);
    }
    setTimeout(() => startNightPhase(client, game), 3000);
    return;
  }

  if (customId.startsWith('kick_')) {
    if (!game || game.phase !== 'lobby') { await interaction.reply({ content: '⚠️ Kanaalkan lobby ma jiro.', ephemeral: true }); return; }
    if (userId !== game.hostId) { await interaction.reply({ content: '⚠️ Kaliya host-ku wuxuu saari karaa.', ephemeral: true }); return; }
    const targetId = customId.replace('kick_', '');
    const target   = game.players.get(targetId);
    if (!target) { await interaction.reply({ content: '⚠️ Ciyaaryahanka lama helin.', ephemeral: true }); return; }
    game.players.delete(targetId);
    addLog(guildId, interaction.guild.name, `🚪 ${target.displayName} waa laga saaray lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild);
    await interaction.reply({ content: `🚪 **${target.displayName}** waa laga saaray lobby-ga.`, ephemeral: false });
    const ku = await client.users.fetch(targetId).catch(() => null);
    if (ku) await ku.send('🚪 Host-ku wuu kaa saaray lobby-ga.').catch(() => null);
    return;
  }

  if (customId.startsWith('vote_')) {
    if (!game || game.phase !== 'day') { await interaction.reply({ content: '⚠️ Maalinta codbixinta maaha hadda.', ephemeral: true }); return; }
    const voter = game.players.get(userId);
    if (!voter || !voter.alive) { await interaction.reply({ content: '⚠️ Adigu ma codeyn kartid.', ephemeral: true }); return; }
    const targetId = customId === 'vote_skip' ? 'skip' : customId.replace('vote_', '');
    if (targetId !== 'skip') {
      const t = game.players.get(targetId);
      if (!t || !t.alive) { await interaction.reply({ content: '⚠️ Ciyaaryahankaan nool maaha.', ephemeral: true }); return; }
    }
    const existingIdx = game.votes.findIndex(v => v.voterId === userId);
    const isChange    = existingIdx !== -1;
    if (isChange) game.votes.splice(existingIdx, 1);
    game.votes.push({ voterId: userId, targetId });
    const targetName = targetId === 'skip' ? 'SKIP' : game.players.get(targetId)?.displayName ?? targetId;
    addLog(guildId, interaction.guild.name, `🗳️ ${voter.displayName} wuxuu u codeeyay ${targetName}${isChange ? ' (baddalay)' : ''}`);
    await interaction.reply({ content: isChange ? `🔄 Codkaagii waad baddashay → **${targetName}**` : `🗳️ Waxaad u codeysay: **${targetName}**`, ephemeral: true });
    return;
  }
}

// ─── Night DM Actions ─────────────────────────────────────────────────────────
function parseNightCustomId(customId, prefix) {
  const rest = customId.slice(prefix.length);
  const idx  = rest.indexOf('_');
  if (idx === -1) return null;
  return { gameChannelId: rest.slice(0, idx), targetId: rest.slice(idx + 1) };
}

async function handleNightDmAction(interaction, userId, customId) {
  if (customId.startsWith('night_kill_')) {
    const parsed = parseNightCustomId(customId, 'night_kill_');
    if (!parsed) { await interaction.reply({ content: '⚠️ Cilad dhacday.', ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== 'night') { await interaction.reply({ content: '⚠️ Habeenka ma socdo hadda.', ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || player.role !== 'dilaaye' || !player.alive) { await interaction.reply({ content: '⚠️ Adigu ma tahid Dilaaye nool.', ephemeral: true }); return; }
    game.nightKillTarget = parsed.targetId;
    const target    = game.players.get(parsed.targetId);
    const guildName = (await client.guilds.fetch(game.guildId).catch(() => null))?.name ?? 'Unknown';
    addLog(game.guildId, guildName, '🔪 Dilaaye wuxuu xushay bartilmaameedka');
    await interaction.reply({ content: `🔪 Waad dooratay: **${target?.displayName ?? parsed.targetId}**`, ephemeral: true });
    return;
  }

  if (customId.startsWith('night_save_')) {
    const parsed = parseNightCustomId(customId, 'night_save_');
    if (!parsed) { await interaction.reply({ content: '⚠️ Cilad dhacday.', ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== 'night') { await interaction.reply({ content: '⚠️ Habeenka ma socdo hadda.', ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || player.role !== 'dhakhtar' || !player.alive) { await interaction.reply({ content: '⚠️ Adigu ma tahid Dhakhtar nool.', ephemeral: true }); return; }
    game.nightSaveTarget = parsed.targetId;
    const target    = game.players.get(parsed.targetId);
    const guildName = (await client.guilds.fetch(game.guildId).catch(() => null))?.name ?? 'Unknown';
    addLog(game.guildId, guildName, '🛡️ Dhakhtarku wuxuu xushay badbaadinta');
    await interaction.reply({ content: `🛡️ Waad badbaadisay: **${target?.displayName ?? parsed.targetId}**`, ephemeral: true });
    return;
  }

  if (customId.startsWith('night_sheriff_')) {
    const parsed = parseNightCustomId(customId, 'night_sheriff_');
    if (!parsed) { await interaction.reply({ content: '⚠️ Cilad dhacday.', ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== 'night') { await interaction.reply({ content: '⚠️ Habeenka ma socdo hadda.', ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || player.role !== 'sheriff' || !player.alive) { await interaction.reply({ content: '⚠️ Adigu ma tahid Atoore nool.', ephemeral: true }); return; }
    if (!game.nightSheriffUsed) game.nightSheriffUsed = new Set();
    if (game.nightSheriffUsed.has(userId)) { await interaction.reply({ content: '⚠️ Hal xabbad oo kaliya ayaad haysataa habeen kasta — waad isticmaashay!', ephemeral: true }); return; }
    game.nightSheriffUsed.add(userId);
    const target    = game.players.get(parsed.targetId);
    const guildName = (await client.guilds.fetch(game.guildId).catch(() => null))?.name ?? 'Unknown';
    if (!target || !target.alive) { await interaction.reply({ content: '⚠️ Ciyaaryahankaan lama heli karo.', ephemeral: true }); return; }
    if (target.role === 'dilaaye') {
      target.alive = false;
      addLog(game.guildId, guildName, `💥 Sheriff ${player.displayName} wuxuu toogtay Dilaayaha ${target.displayName}!`);
      await interaction.reply({ content: `💥 **Sheriff ayaa toogtay ${target.displayName}!**\n🔪 ${target.displayName} wuxuu ahaa Dilaayaha.\n🎉 Dilaayaha waa la dilay!`, ephemeral: true });
      const channel = await client.channels.fetch(game.channelId).catch(() => null);
      if (channel) {
        await channel.send({ embeds: [new EmbedBuilder().setTitle('💥 ATOORE WUU TOOGTAY!').setColor(0xffd700)
          .setDescription(`⭐ **Atoore** habeenkii wuxuu toogtay **${target.displayName}**!\n🔪 Waxa uu ahaa **Dilaayaha**!\n🎉 **Dilaayaha waa la dilay!**`)
          .setFooter({ text: 'Ciyaal Xamar · Mafia Game' })] }).catch(() => null);
      }
      const winner = checkWinCondition(game);
      if (winner) { if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; } await endGame(client, game, winner); }
    } else {
      addLog(game.guildId, guildName, `❌ Sheriff ${player.displayName} wuxuu toogtay ${target.displayName} — ma ahayn Dilaaye`);
      await interaction.reply({ content: `❌ **${target.displayName}** ma aha Dilaaye.\n🛡️ Sheriff wuxuu dili karaa oo keliya Dilaayaha.\n🌙 Habeenku wuu sii socdaa...`, ephemeral: true });
    }
  }
}

// ─── !say Modal Submit ────────────────────────────────────────────────────────
async function handleSayModalSubmit(interaction) {
  const channelId    = interaction.customId.slice('say_modal_'.length);
  const content      = interaction.fields.getTextInputValue('say_content');
  const attachUrl    = interaction.fields.getTextInputValue('say_attachment_url')?.trim();
  const channel      = await client.channels.fetch(channelId).catch(() => null);
  if (!channel) { await interaction.reply({ content: '⚠️ Channel-ka lama helin.', ephemeral: true }); return; }
  const payload = { content: attachUrl ? `${content}\n${attachUrl}` : content };
  const sent    = await channel.send(payload).catch(() => null);
  await interaction.reply({ content: sent ? '✅ Fariinta waa la diray!' : '⚠️ Fariinta lama dirin karin.', ephemeral: true });
}

// ─── Voice Helper ─────────────────────────────────────────────────────────────
function joinVC(guildId, channelId, adapterCreator) {
  const existing = voiceConnections.get(guildId);
  if (existing) { try { existing.destroy(); } catch {} }
  const connection = joinVoiceChannel({ channelId, guildId, adapterCreator, selfDeaf: true, selfMute: false });
  voiceConnections.set(guildId, connection);
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      try { connection.destroy(); } catch {}
      voiceConnections.delete(guildId);
    }
  });
  return connection;
}

// ─── Lobby Refresh Helper ─────────────────────────────────────────────────────
async function refreshLobbyMsg(game, guild) {
  if (!game.lobbyMessageId) return;
  const ch = await client.channels.fetch(game.channelId).catch(() => null);
  if (!ch) return;
  const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
  if (lm) await lm.edit({ embeds: [buildLobbyEmbed(game, guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
}
