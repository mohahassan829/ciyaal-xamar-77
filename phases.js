// phases.js — Ciyaal Xamar · Night/Day phase logic
import { EmbedBuilder } from "discord.js";
import {
  getAlivePlayers, getDilaayePlayers, checkWinCondition,
  getMostVoted, getVoteResults, addLog,
} from "./game.js";
import {
  buildNightEmbed, buildDayEmbed, buildVoteButtons, buildVoteResultEmbed,
  buildWinEmbed, buildNightKillButtons, buildNightSaveButtons, buildNightSheriffButtons,
  buildSheriffTurnEmbed,
} from "./embeds.js";

const NIGHT_DURATION = 30000;
const DAY_DURATION   = 60000;

export async function startNightPhase(client, game) {
  game.phase = "night";
  game.round++;
  game.votes = [];
  game.nightKillTarget = null;
  game.nightSaveTarget = null;
  game.nightSheriffUsed = new Set();

  const channel = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;

  const guild     = await client.guilds.fetch(game.guildId).catch(() => null);
  const guildName = guild?.name ?? "Unknown";
  addLog(game.guildId, guildName, `🌙 Wareegga ${game.round} habeenkii wuu bilaabmay`);

  const embed = buildNightEmbed(game.round, 30);
  const msg   = await channel.send({ embeds: [embed] }).catch(() => null);
  if (msg) game.nightMessageId = msg.id;

  const alive = getAlivePlayers(game);

  for (const player of alive) {
    const user = await client.users.fetch(player.id).catch(() => null);
    if (!user) continue;

    if (player.role === "dilaaye") {
      const killButtons = buildNightKillButtons(alive, game.channelId);
      if (killButtons.length > 0)
        await user.send({ content: `🌙 **HABEENKA — Wareegga ${game.round}**\n🔪 Xulo cidda aad dili rabto:`, components: killButtons }).catch(() => null);
    } else if (player.role === "dhakhtar") {
      const saveButtons = buildNightSaveButtons(alive, game.channelId);
      if (saveButtons.length > 0)
        await user.send({ content: `🌙 **HABEENKA — Wareegga ${game.round}**\n🛡️ Xulo cidda aad badbaadin rabto:`, components: saveButtons }).catch(() => null);
    } else if (player.role === "sheriff") {
      const sheriffButtons = buildNightSheriffButtons(alive.filter(p => p.id !== player.id), game.channelId);
      if (sheriffButtons.length > 0)
        await user.send({ embeds: [buildSheriffTurnEmbed(game.round)], components: sheriffButtons }).catch(() => null);
    }
  }

  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  game.phaseTimer = setTimeout(() => endNightPhase(client, game), NIGHT_DURATION);
}

export async function endNightPhase(client, game) {
  if (game.phase !== "night") return;

  const channel   = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;
  const guild     = await client.guilds.fetch(game.guildId).catch(() => null);
  const guildName = guild?.name ?? "Unknown";

  const nightReport = [];
  const killTargetId = game.nightKillTarget;
  const saveTargetId = game.nightSaveTarget;

  if (killTargetId) {
    const target = game.players.get(killTargetId);
    if (target) {
      const wasSaved = saveTargetId === killTargetId;
      if (!wasSaved) {
        target.alive = false;
        const isDhakhtar = target.role === "dhakhtar";
        if (isDhakhtar) {
          nightReport.push(
            `💔 **DHAKHTAR AYAA LA DILAY!**`,
            `😱 **${target.displayName}** — ninka/naagta badbaadinaysay — ayaa habeentii la dilay!`,
            `⚠️ Ciyaaryahanno: Dhakhtar la'aantiis waa halis weyn!`
          );
          addLog(game.guildId, guildName, `💔 DHAKHTAR ${target.displayName} ayaa habeentii la dilay!`);
        } else {
          nightReport.push(`💀 **${target.displayName}** ayaa la dilay habeentii.`);
          addLog(game.guildId, guildName, `💀 ${target.displayName} ayaa habeentii la dilay`);
        }
        const killedUser = await client.users.fetch(target.id).catch(() => null);
        if (killedUser) {
          const msg = isDhakhtar
            ? `💔 Aad baad u xumaatay — waad dhinteen habeentii!\n😱 Doorarkaagu wuxuu ahaa: **🩺 Dhakhtar** — badbaadintu dhammaatay!`
            : `💀 Aad baad u xumaatay — waad dhinteen habeentii!\n🎭 Doorarkaagu wuxuu ahaa: **${target.role}**`;
          await killedUser.send({ content: msg }).catch(() => null);
        }
      } else {
        nightReport.push(`🛡️ **Habeentii qof la dilay laakiin Dhakhtarku wuu badbaadiyay!**\n✨ Naf badbaaday — Dhakhtarka mahadsanid!`);
        addLog(game.guildId, guildName, `🛡️ Dhakhtarku wuu badbaadiyay habeentii`);
      }
    }
  } else {
    nightReport.push("🌙 Habeentii waxba ma dhicin. Dilaayeyaashu ma dooranin bartilmaameed.");
  }

  const aliveAfter = getAlivePlayers(game);

  const nightResultEmbed = new EmbedBuilder()
    .setTitle(`🌅 SUBAXDII — Wareegga ${game.round}`)
    .setDescription(nightReport.join("\n") || "Habeentii waxba ma dhicin.")
    .setColor(nightReport.some(l => l.includes("💔")) ? 0x1e90ff : 0xf39c12)
    .addFields(
      { name: "👥 Ciyaaryahanno Nool", value: `**${aliveAfter.length}** ciyaaryahan`, inline: true },
      {
        name: "📋 Nool",
        value: aliveAfter.map(p => `• ${p.displayName}`).join("\n") || "Ciyaaryahan la'aan",
        inline: true,
      }
    )
    .setFooter({ text: "Maalinta waxay bilaabaysaa daqiiqad kadib..." });

  await channel.send({ embeds: [nightResultEmbed] }).catch(() => null);

  const winner = checkWinCondition(game);
  if (winner) { await endGame(client, game, winner); return; }

  setTimeout(() => startDayPhase(client, game), 3000);
}

export async function startDayPhase(client, game) {
  game.phase = "day";
  game.votes = [];

  const channel   = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;
  const guild     = await client.guilds.fetch(game.guildId).catch(() => null);
  const guildName = guild?.name ?? "Unknown";
  addLog(game.guildId, guildName, `☀️ Wareegga ${game.round} maalintii waa bilaabmay`);

  const alive       = getAlivePlayers(game);
  const embed       = buildDayEmbed(game.round, alive, 60);
  const voteButtons = buildVoteButtons(alive);

  const msg = await channel.send({ embeds: [embed], components: voteButtons }).catch(() => null);
  if (msg) game.dayMessageId = msg.id;

  if (game.phaseTimer) clearTimeout(game.phaseTimer);
  let timeLeft = 60;

  const ticker = setInterval(async () => {
    timeLeft -= 5;
    if (timeLeft <= 0 || game.phase !== "day") { clearInterval(ticker); return; }
    if (msg) {
      const voteCount = game.votes.length;
      const updatedEmbed = buildDayEmbed(game.round, alive, timeLeft);
      updatedEmbed.data.fields[1].value = String(voteCount);
      await msg.edit({ embeds: [updatedEmbed], components: voteButtons }).catch(() => null);
      if (voteCount >= alive.length) {
        clearInterval(ticker);
        clearTimeout(game.phaseTimer);
        await endDayPhase(client, game);
      }
    }
  }, 5000);

  game.phaseTimer = setTimeout(() => { clearInterval(ticker); endDayPhase(client, game); }, DAY_DURATION);
}

export async function endDayPhase(client, game) {
  if (game.phase !== "day") return;

  const channel   = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;
  const guild     = await client.guilds.fetch(game.guildId).catch(() => null);
  const guildName = guild?.name ?? "Unknown";

  if (game.dayMessageId) {
    const m = await channel.messages.fetch(game.dayMessageId).catch(() => null);
    if (m) await m.edit({ components: [] }).catch(() => null);
  }

  const mostVotedId = getMostVoted(game);
  const voteResults = getVoteResults(game);
  let eliminated = null;

  if (mostVotedId) {
    const target = game.players.get(mostVotedId);
    if (target) {
      target.alive = false;
      eliminated   = target;
      addLog(game.guildId, guildName, `🗳️ ${target.displayName} ayaa maalintii laga saaray (${target.role})`);
      const eliminatedUser = await client.users.fetch(target.id).catch(() => null);
      if (eliminatedUser) {
        const isDhakhtar = target.role === "dhakhtar";
        await eliminatedUser.send({
          content: isDhakhtar
            ? `💔 Codbixinta awgeed waa laga saaray ciyaarta!\n😱 Doorarkaagu wuxuu ahaa: **🩺 Dhakhtar** — badbaadintu dhammaatay!`
            : `🗳️ Codbixinta awgeed waa laga saaray ciyaarta!\n🎭 Doorarkaagu wuxuu ahaa: **${target.role}**`,
        }).catch(() => null);
      }
    }
  } else {
    addLog(game.guildId, guildName, `🗳️ Wareegga ${game.round} — Cod is qabsi ah, qof lagama saarin`);
  }

  const resultEmbed = buildVoteResultEmbed(eliminated, voteResults, game.players);
  await channel.send({ embeds: [resultEmbed] }).catch(() => null);

  const winner = checkWinCondition(game);
  if (winner) { await endGame(client, game, winner); return; }

  setTimeout(() => startNightPhase(client, game), 3000);
}

export async function endGame(client, game, winner) {
  game.phase   = "ended";
  game.winner  = winner;
  game.endedAt = new Date();

  if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }

  const channel   = await client.channels.fetch(game.channelId).catch(() => null);
  if (!channel) return;
  const guild     = await client.guilds.fetch(game.guildId).catch(() => null);
  const guildName = guild?.name ?? "Unknown";

  addLog(game.guildId, guildName, `🏆 Ciyaarta waa dhammaatay — ${winner === "dilaaye" ? "Dilaayeyaashu" : "Shacabku"} guuleystay!`);

  const allPlayers = Array.from(game.players.values());
  const winEmbed   = buildWinEmbed(winner, allPlayers);
  await channel.send({ embeds: [winEmbed] }).catch(() => null);
}
