// src/commands.js — !bomb, !work, !balance, !givecash, !grant, !deduct, !ecodebug (ES module)
import { EmbedBuilder } from 'discord.js';
import { BombGame, activeGames } from './game.js';
import {
  getUser, getBalance, addBalance, deductBalance,
  getLastWork, setLastWork, getEcoStatus,
} from './economy.js';

const PREFIX   = '!';
const OWNER_ID = process.env.OWNER_ID || '725076744251637760';

// Deduplicate same message from stale gateway sessions
const _seen     = new Set();
// Per-channel lock during !bomb setup
const _bombLock = new Set();

export async function handleBombMessage(message) {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;
  if (_seen.has(message.id)) return;
  _seen.add(message.id);
  if (_seen.size > 2000) _seen.delete(_seen.values().next().value);

  const args    = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift().toLowerCase();

  try {
    if (command === 'bomb')     return await cmdBomb(message);
    if (command === 'work')     return await cmdWork(message);
    if (command === 'balance')  return await cmdBalance(message, args);
    if (command === 'givecash') return await cmdGivecash(message, args);
    if (command === 'deduct')   return await cmdDeduct(message, args);
    if (command === 'grant')    return await cmdGrant(message, args);
    if (command === 'ecodebug') return await cmdEcoDebug(message);
    if (command === 'leaderboard' || command === 'lb') return await cmdLeaderboard(message);
  } catch (err) {
    const errMsg = err?.message || String(err);
    console.error(`❌ Command error [!${command}]: ${errMsg}`);
    console.error(err?.stack || '');
    try {
      await message.reply(
        `⚠️ Khalad ayaa dhacay — **!${command}**\n` +
        `\`\`\`\n${errMsg.slice(0, 500)}\n\`\`\`\n` +
        `_Haddii ay sii socoto, qor !ecodebug si aad u ogaato sabab._`,
      );
    } catch (replyErr) {
      console.error('❌ Reply also failed:', replyErr?.message);
    }
  }
}

// ─── !bomb ────────────────────────────────────────────────────────────────────
async function cmdBomb(message) {
  const channelId = message.channelId;
  if (activeGames.has(channelId)) return message.reply('❌ There is already an active game in this channel!');
  if (_bombLock.has(channelId)) return;
  _bombLock.add(channelId);
  try {
    // Guard against dual-instance duplicate lobby
    try {
      const recent = await message.channel.messages.fetch({ limit: 5 });
      const duplicate = recent.find(m =>
        m.author.id === message.client.user.id &&
        m.embeds[0]?.title === '💣 Bomb Survival' &&
        (Date.now() - m.createdTimestamp) < 4000,
      );
      if (duplicate) return;
    } catch (_) {}
    if (activeGames.has(channelId)) return;

    const hostId       = message.author.id;
    const hostUsername = message.member?.displayName || message.author.username;
    const game         = new BombGame(hostId, hostUsername, channelId);
    activeGames.set(channelId, game);

    const lobbyMsg = await message.channel.send({
      embeds:     [game.buildLobbyEmbed()],
      components: game.buildLobbyComponents(),
    });
    game.message = lobbyMsg;
    try { await message.delete(); } catch (_) {}
  } finally {
    _bombLock.delete(channelId);
  }
}

// ─── !work ────────────────────────────────────────────────────────────────────
async function cmdWork(message) {
  const userId      = message.author.id;
  const username    = message.member?.displayName || message.author.username;
  const COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours
  const REWARD      = 500;

  // Ensure user exists
  await getUser(userId, username);

  const lastWork = await getLastWork(userId);
  const now      = Date.now();

  if (lastWork && (now - lastWork) < COOLDOWN_MS) {
    const remaining = COOLDOWN_MS - (now - lastWork);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    return message.reply({ embeds: [
      new EmbedBuilder()
        .setColor(0xff6600)
        .setTitle('⏳ Hore baad u shaqeysay!')
        .setDescription(`Wali waqtigaagu dhammaanin.\n\n**Waqti hadhay: ${mins} Daqiiqo ${secs} Ilbiriqsi**`)
        .setFooter({ text: '2 saacadood ka dib ku soo noqo.' }),
    ] });
  }

  const newBalance = await addBalance(userId, REWARD, username);
  await setLastWork(userId);

  return message.reply({ embeds: [
    new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('💼 Shaqo la dhammeeyay!')
      .setDescription(`Adiga oo aad u shaqeysay waad heeshay **$${REWARD.toLocaleString()}**! 💵\n\n💰 **Lacagta cusub: $${Number(newBalance).toLocaleString()}**`)
      .setFooter({ text: '2 saacadood ka dib shaqo mar kale ku soo noqo.' }),
  ] });
}

// ─── !balance ─────────────────────────────────────────────────────────────────
async function cmdBalance(message, args) {
  let targetUser   = message.author;
  let targetMember = message.member;

  if (args.length > 0 && message.mentions.users.size > 0) {
    targetUser   = message.mentions.users.first();
    targetMember = message.guild?.members.cache.get(targetUser.id) || null;
  }

  const username = targetMember?.displayName || targetUser.username;
  const balance  = await getBalance(targetUser.id, username);
  const isSelf   = targetUser.id === message.author.id;

  return message.reply({ embeds: [
    new EmbedBuilder()
      .setColor(0x00aaff)
      .setTitle(`💰 ${isSelf ? 'Lacagtaada' : `${username} lacagtiisa`}`)
      .setDescription(`## $${Number(balance).toLocaleString()}`)
      .setFooter({ text: isSelf ? '!work isticmaal si aad lacag u hesho.' : `${username} xisaabadiisa.` }),
  ] });
}

// ─── !leaderboard / !lb ───────────────────────────────────────────────────────
async function cmdLeaderboard(message) {
  const { getAllUsers } = await import('./economy.js');
  const users = await getAllUsers();
  const top10 = users.slice(0, 10);

  if (top10.length === 0) {
    return message.reply('⚠️ Wali dadku lacag ma haysato.');
  }

  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
  const lines  = top10.map((u, i) => `${medals[i]} **${u.username}** — $${Number(u.balance).toLocaleString()}`);

  return message.reply({ embeds: [
    new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle('🏆 Liiska Lacagta — Top 10')
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Ciyaal Xamar Economy' }),
  ] });
}

// ─── !givecash ────────────────────────────────────────────────────────────────
async function cmdGivecash(message, args) {
  const targetUser = message.mentions.users.first();
  const amount     = parseInt(args[1], 10);
  if (!targetUser)                             return message.reply('❌ Isticmaal: `!givecash @qof xadka`');
  if (!amount || amount <= 0 || isNaN(amount)) return message.reply('❌ Xad sax ah geli.');
  if (targetUser.id === message.author.id)     return message.reply('❌ Naftaada lacag u diri kartid!');
  if (targetUser.bot)                          return message.reply('❌ Bot-ka lacag u diri kartid!');

  const giverId      = message.author.id;
  const giverName    = message.member?.displayName || message.author.username;
  const receiverName = message.guild?.members.cache.get(targetUser.id)?.displayName || targetUser.username;

  const result = await deductBalance(giverId, amount);
  if (!result.success) {
    const bal = await getBalance(giverId, giverName);
    return message.reply(`❌ **Lacag ku filan kuma lihid.**\n💰 Lacagtaada: **$${Number(bal).toLocaleString()}**`);
  }

  const newBal = await addBalance(targetUser.id, amount, receiverName);
  return message.reply({ embeds: [
    new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('💸 Lacag la diray!')
      .setDescription(`**${giverName}** wuxuu u diray **$${amount.toLocaleString()}** **${receiverName}**!\n\n💰 ${receiverName} lacagta cusub: **$${Number(newBal).toLocaleString()}**`),
  ] });
}

// ─── !deduct (Owner only) ─────────────────────────────────────────────────────
async function cmdDeduct(message, args) {
  if (message.author.id !== OWNER_ID) return message.reply('❌ Amarka `!deduct` kaliya owner-ku wuxuu isticmaali karaa.');
  const targetUser = message.mentions.users.first();
  const amount     = parseInt(args[1], 10);
  if (!targetUser)                             return message.reply('❌ Isticmaal: `!deduct @qof xad`');
  if (!amount || amount <= 0 || isNaN(amount)) return message.reply('❌ Xad sax ah geli.');

  const targetName = message.guild?.members.cache.get(targetUser.id)?.displayName || targetUser.username;
  const result     = await deductBalance(targetUser.id, amount);
  if (!result.success) {
    const bal = await getBalance(targetUser.id, targetName);
    return message.reply(`❌ **${targetName}** lacag ku filan kuma lihid.\nLacag: **$${Number(bal).toLocaleString()}**`);
  }

  return message.reply({ embeds: [
    new EmbedBuilder()
      .setColor(0xff4400)
      .setTitle('💸 Lacag la jaray')
      .setDescription(`**$${amount.toLocaleString()}** waxaa laga jaray **${targetName}**.\n💰 Lacagta cusub: **$${Number(result.balance).toLocaleString()}**`),
  ] });
}

// ─── !grant (Owner only) ──────────────────────────────────────────────────────
async function cmdGrant(message, args) {
  if (message.author.id !== OWNER_ID) return message.reply('❌ Amarka `!grant` kaliya owner-ku wuxuu isticmaali karaa.');
  const targetUser = message.mentions.users.first();
  const amount     = parseInt(args[1], 10);
  if (!targetUser)                             return message.reply('❌ Isticmaal: `!grant @qof xad`');
  if (!amount || amount <= 0 || isNaN(amount)) return message.reply('❌ Xad sax ah geli.');

  const targetName = message.guild?.members.cache.get(targetUser.id)?.displayName || targetUser.username;
  const newBal     = await addBalance(targetUser.id, amount, targetName);

  return message.reply({ embeds: [
    new EmbedBuilder()
      .setColor(0x00ff88)
      .setTitle('💰 Lacag la siiyay')
      .setDescription(`**$${amount.toLocaleString()}** waxaa la siiyay **${targetName}**.\n💰 Lacagta cusub: **$${Number(newBal).toLocaleString()}**`),
  ] });
}

// ─── !ecodebug (Owner or anyone — diagnostic only) ────────────────────────────
async function cmdEcoDebug(message) {
  const status = getEcoStatus();

  // Test each function step by step
  const results = [];
  const userId  = message.author.id;
  const name    = message.member?.displayName || message.author.username;

  try {
    await getUser(userId, name);
    results.push('✅ getUser — OK');
  } catch (e) { results.push(`❌ getUser — ${e.message}`); }

  try {
    const bal = await getBalance(userId, name);
    results.push(`✅ getBalance — $${bal}`);
  } catch (e) { results.push(`❌ getBalance — ${e.message}`); }

  try {
    const lw = await getLastWork(userId);
    results.push(`✅ getLastWork — ${lw ? new Date(lw).toISOString() : 'null'}`);
  } catch (e) { results.push(`❌ getLastWork — ${e.message}`); }

  return message.reply({ embeds: [
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔧 Economy Debug')
      .addFields(
        { name: '🗄️ Database',
          value: [
            `DATABASE_URL set: **${status.hasDatabaseUrl ? 'Yes' : 'No'}**`,
            `DB checked: **${status.dbChecked}**`,
            `DB enabled: **${status.dbEnabled}**`,
          ].join('\n') },
        { name: '📂 File Storage',
          value: [
            `File: \`${status.dataFile}\``,
            `Exists: **${status.fileExists}**`,
            `Writable: **${status.fileWritable}**`,
          ].join('\n') },
        { name: '💾 Memory Cache',
          value: `Users in memory: **${status.memUsers}**` },
        { name: '🧪 Function Tests', value: results.join('\n') || 'N/A' },
      )
      .setFooter({ text: 'Ciyaal Xamar — Economy Diagnostics' }),
  ] });
}
