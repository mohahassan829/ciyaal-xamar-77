// game-handler.ts — Bridges !bomb + !dilaay into the running bot
// @ts-nocheck — JS game files use dynamic patterns; skip strict checks here
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} from "discord.js";
import { logger } from "../../lib/logger.js";

// ── JS game imports ──────────────────────────────────────────────────────────
import { handleBombMessage }      from "./bomb-commands.js";
import { handleBombInteraction }  from "./bomb-interactions.js";
import { startTaxScheduler }      from "./tax.js";
import { initDb }                 from "./economy.js";
import {
  games, createGame, assignRoles, getGuildGames, addLog, checkWinCondition,
} from "./dilaay-game.js";
import {
  buildLobbyEmbed, buildLobbyButtons, buildRoleDmEmbed, buildKickButtons,
} from "./dilaay-embeds.js";
import { startNightPhase, endGame } from "./dilaay-phases.js";

const OWNER_ID = process.env["OWNER_ID"] || "725076744251637760";
const MAX_GAMES_PER_GUILD = 5;

export async function initGames(client: Client) {
  await initDb().catch((err: Error) => {
    logger.warn({ err }, "initDb warning — continuing with JSON storage");
  });
  startTaxScheduler(client);
  logger.info("🎮 !bomb + !dilaay game handlers loaded");
}

// ─── Message handler ──────────────────────────────────────────────────────────
export async function handleGameMessage(msg: any, client: Client) {
  if (msg.author.bot || !msg.guild) return;

  // !bomb — handles !bomb !work !balance !givecash !grant !deduct !leaderboard
  await handleBombMessage(msg);

  const content   = msg.content.trim().toLowerCase();
  const raw       = msg.content.trim();
  const channelId = msg.channel.id;
  const guildId   = msg.guild.id;
  const isOwner   = msg.author.id === OWNER_ID;

  // ── !help ──────────────────────────────────────────────────────────────────
  if (content === "!help") {
    const embed = new EmbedBuilder()
      .setTitle("🎮 CIYAAL XAMAR — Amarrada (Commands)")
      .setColor(0x5865f2)
      .addFields(
        { name: "💣 Bomb Survival",  value: ["`!bomb` — Lobby cusub bilow", "`!work` — $500 kasub (2 saac)", "`!balance` — Lacagtaada arag", "`!givecash @qof xad` — Lacag u dir"].join("\n") },
        { name: "🔪 Mafia Ciyaarta", value: ["`!dilaay` — Lobby cusub bilow", "`!kasaar` — Host: ciyaaryahan lobby ka saar"].join("\n") },
        { name: "🆘 Caawimo",        value: ["`!icaawi [farriin]` — Cilad owner-ka u dir"].join("\n") },
        { name: "🎫 Ticket System",  value: ["`/setup` — Ticket system setup (Admin)"].join("\n") },
      )
      .setFooter({ text: "Ciyaal Xamar Bot" });
    await msg.reply({ embeds: [embed] });
    return;
  }

  // ── !icaawi ────────────────────────────────────────────────────────────────
  if (content.startsWith("!icaawi")) {
    const report = raw.slice("!icaawi".length).trim();
    if (!report) { await msg.reply("⚠️ Fariintaada qor kadib `!icaawi`.\n_Tusaale: `!icaawi Bot-ka lobby kuma furin`_"); return; }
    const owner = await client.users.fetch(OWNER_ID).catch(() => null);
    if (!owner) { await msg.reply("⚠️ Maamulaha lama gaadhi karin."); return; }
    const ok = await owner.send({ embeds: [
      new EmbedBuilder()
        .setTitle("🆘 Codsi Caawimo — Ciyaal Xamar").setColor(0xed4245)
        .addFields(
          { name: "👤 Qofka",   value: `**${msg.author.username}**\n\`${msg.author.id}\``, inline: true },
          { name: "🏠 Server",  value: `${msg.guild.name}\n\`${msg.guild.id}\``,             inline: true },
          { name: "💬 Farriin", value: report },
        ).setTimestamp(),
    ] }).then(() => true).catch(() => false);
    await msg.reply(ok
      ? "✅ **Fariintaada maamulaha la gaarsiiiyay!** Waxay kugu jawaabi doonaan DM-kaaga."
      : "⚠️ Maamulaha DM-kiisu waa xidnaanaa.",
    );
    return;
  }

  // ── !dm — Owner only ───────────────────────────────────────────────────────
  if (content.startsWith("!dm")) {
    if (!isOwner) { await msg.reply("🔐 `!dm` kaliya owner-ku isticmaali karaa."); return; }
    const rest  = raw.slice("!dm".length).trim();
    const match = rest.match(/^<@!?(\d{15,25})>\s*([\s\S]*)$/) || rest.match(/^(\d{15,25})\s+([\s\S]*)$/);
    if (!match || !match[2]?.trim()) { await msg.reply("⚠️ Isticmaal: `!dm @user farriinta`"); return; }
    const user = await client.users.fetch(match[1]).catch(() => null);
    if (!user) { await msg.reply("⚠️ Qofkaan lama helin."); return; }
    const ok = await user.send({ embeds: [
      new EmbedBuilder().setTitle("📢 Farriin — Ciyaal Xamar").setDescription(match[2].trim()).setColor(0x5865f2).setTimestamp(),
    ] }).then(() => true).catch(() => false);
    await msg.reply(ok ? `✅ Fariinta waxaa la diray **${user.username}**.` : `⚠️ DM-kiisu waa xidnaan karaa.`);
    return;
  }

  // ── !say — Admin/Manage Messages ──────────────────────────────────────────
  if (content === "!say") {
    const hasPerm = msg.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    msg.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
    if (!hasPerm) { await msg.reply("🔐 `!say` waxaa isticmaali kara Administrator ama Manage Messages."); return; }
    await msg.delete().catch(() => null);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`open_say_${msg.channel.id}`).setLabel("📝 Buuxi Foomka").setStyle(ButtonStyle.Primary),
    );
    const dmSent = await msg.author.send({ content: "Riix batoonka hoose:", components: [row] }).then(() => true).catch(() => false);
    if (!dmSent) {
      const warn = await msg.channel.send(`⚠️ ${msg.author}, DM-kaaga waa xidnaan karaa.`).catch(() => null);
      if (warn) setTimeout(() => warn.delete().catch(() => null), 8000);
    }
    return;
  }

  // ── !dilaay ────────────────────────────────────────────────────────────────
  if (content === "!dilaay") {
    const existing = games.get(channelId);
    if (existing && existing.phase !== "ended") { await msg.reply("⚠️ Kanaalkan ciyaaro socota ayaa ku jirta!"); return; }
    const guildGames = getGuildGames(guildId);
    if (guildGames.length >= MAX_GAMES_PER_GUILD) { await msg.reply(`⚠️ ${MAX_GAMES_PER_GUILD} ciyaaro ayaa isku mar socda.`); return; }
    const game = createGame(guildId, channelId, msg.author.id);
    game.players.set(msg.author.id, {
      id: msg.author.id, username: msg.author.username,
      displayName: msg.member?.displayName ?? msg.author.username,
      role: null, alive: true, protected: false,
    });
    addLog(guildId, msg.guild.name, `🎮 ${msg.author.username} wuxuu bilaabay ciyaaro cusub`);
    const lobbyMsg = await msg.channel.send({ embeds: [buildLobbyEmbed(game, msg.guild)], components: [buildLobbyButtons(game)] }).catch((err: Error) => {
      logger.error({ err }, "Lobby send error"); return null;
    });
    if (!lobbyMsg) { games.delete(channelId); await msg.reply("⚠️ Lobby-ga lama furin karin.").catch(() => null); return; }
    game.lobbyMessageId = lobbyMsg.id;
    return;
  }

  // ── !kasaar ────────────────────────────────────────────────────────────────
  if (content === "!kasaar") {
    const game = games.get(channelId);
    if (!game || game.phase !== "lobby") { await msg.reply("⚠️ Kanaalkan ma jirto lobby furan."); return; }
    if (game.hostId !== msg.author.id)   { await msg.reply("⚠️ Kaliya host-ku wuxuu isticmaali karaa `!kasaar`."); return; }
    const kickButtons = buildKickButtons(game, msg.author.id);
    if (kickButtons.length === 0) { await msg.reply("⚠️ Ma jiraan ciyaaryahan la saari karo."); return; }
    await msg.reply({ content: "🚪 Xulo ciyaaryahanka aad saari rabto:", components: kickButtons });
    return;
  }
}

// ─── Interaction handler ──────────────────────────────────────────────────────
export async function handleGameInteraction(interaction: any, client: Client) {
  // !bomb buttons
  if (interaction.isButton()) {
    const handled = await handleBombInteraction(interaction);
    if (handled) return;
  }

  // !say modal submit
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("say_modal_")) {
      await handleSayModalSubmit(interaction, client);
    }
    return;
  }

  if (!interaction.isButton()) return;

  // !say open button (arrives in DMs, no guild required)
  if (interaction.customId.startsWith("open_say_")) {
    const hasPerm = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) ||
                    interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
    if (!hasPerm) { await interaction.reply({ content: "🔐 Ogolaanshahaaga kuma filan.", ephemeral: true }); return; }
    const targetChannelId = interaction.customId.slice("open_say_".length);
    const modal = new ModalBuilder().setCustomId(`say_modal_${targetChannelId}`).setTitle("📝 Say — Fariin Bot-ku Diro");
    const contentInput = new TextInputBuilder().setCustomId("say_content").setLabel("Content (waajib)").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000);
    const attachInput  = new TextInputBuilder().setCustomId("say_attachment_url").setLabel("Attachment URL (ikhtiyari)").setStyle(TextInputStyle.Short).setRequired(false);
    modal.addComponents(new ActionRowBuilder().addComponents(contentInput), new ActionRowBuilder().addComponents(attachInput));
    await interaction.showModal(modal);
    return;
  }

  // Night DM actions (no guild)
  const customId = interaction.customId;
  if (customId.startsWith("night_kill_") || customId.startsWith("night_save_") || customId.startsWith("night_sheriff_")) {
    await handleNightDmAction(interaction, interaction.user.id, customId, client);
    return;
  }

  if (!interaction.guild) return;
  const guildId   = interaction.guild.id;
  const channelId = interaction.channelId;
  const game      = games.get(channelId);

  if (customId === "lobby_join") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (game.players.has(interaction.user.id))  { await interaction.reply({ content: "⚠️ Hore baad ku biirtay lobby-ga.", ephemeral: true }); return; }
    if (game.players.size >= 20)                 { await interaction.reply({ content: "⚠️ Lobby-ga wuu buuxay (20/20).", ephemeral: true }); return; }
    game.players.set(interaction.user.id, {
      id: interaction.user.id, username: interaction.user.username,
      displayName: interaction.member?.displayName ?? interaction.user.username,
      role: null, alive: true, protected: false,
    });
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ku biiray lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild, client);
    await interaction.reply({ content: "✅ Lobby-ga waad ku biiray!", ephemeral: true });
    return;
  }

  if (customId === "lobby_leave") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (!game.players.has(interaction.user.id)) { await interaction.reply({ content: "⚠️ Ma jirtid lobby-ga.", ephemeral: true }); return; }
    if (interaction.user.id === game.hostId)    { await interaction.reply({ content: "⚠️ Host-ku ma bixin karo. JOOJI batoonka isticmaal.", ephemeral: true }); return; }
    game.players.delete(interaction.user.id);
    addLog(guildId, interaction.guild.name, `👤 ${interaction.user.username} wuxuu ka baxay lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild, client);
    await interaction.reply({ content: "👋 Lobby-ga waad ka baxday.", ephemeral: true });
    return;
  }

  if (customId === "lobby_stop") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (interaction.user.id !== game.hostId) { await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu joojin karaa.", ephemeral: true }); return; }
    if (game.phaseTimer) clearTimeout(game.phaseTimer);
    game.phase = "ended";
    games.delete(channelId);
    await interaction.reply({ content: "🛑 Ciyaarta waa la joojiyay.", ephemeral: true });
    await interaction.channel?.send("🛑 Lobby-ga waa la xirray host-ka.").catch(() => null);
    return;
  }

  if (customId === "lobby_start") {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (interaction.user.id !== game.hostId) { await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu bilaabi karaa.", ephemeral: true }); return; }
    if (game.players.size < 5)               { await interaction.reply({ content: "⚠️ Ugu yaraan 5 ciyaaryahan ayaa loo baahan yahay.", ephemeral: true }); return; }
    assignRoles(game);
    game.startedAt = new Date();
    addLog(guildId, interaction.guild.name, `🎮 Ciyaarta waa bilaabmay — ${game.players.size} ciyaaryahan`);
    await interaction.reply({ content: "🎮 Ciyaarta waa bilaabmay! Doorarkiinna DM-kiinna ku fiiri." });
    for (const player of Array.from(game.players.values())) {
      const user = await client.users.fetch((player as any).id).catch(() => null);
      if (user) await user.send({ embeds: [buildRoleDmEmbed(player, game)] }).catch(() => null);
    }
    setTimeout(() => startNightPhase(client, game), 3000);
    return;
  }

  if (customId.startsWith("kick_")) {
    if (!game || game.phase !== "lobby") { await interaction.reply({ content: "⚠️ Kanaalkan lobby ma jiro.", ephemeral: true }); return; }
    if (interaction.user.id !== game.hostId) { await interaction.reply({ content: "⚠️ Kaliya host-ku wuxuu saari karaa.", ephemeral: true }); return; }
    const targetId = customId.replace("kick_", "");
    const target   = game.players.get(targetId);
    if (!target) { await interaction.reply({ content: "⚠️ Ciyaaryahanka lama helin.", ephemeral: true }); return; }
    game.players.delete(targetId);
    addLog(guildId, interaction.guild.name, `🚪 ${(target as any).displayName} waa laga saaray lobby-ga`);
    await refreshLobbyMsg(game, interaction.guild, client);
    await interaction.reply({ content: `🚪 **${(target as any).displayName}** waa laga saaray lobby-ga.` });
    const ku = await client.users.fetch(targetId).catch(() => null);
    if (ku) await ku.send("🚪 Host-ku wuu kaa saaray lobby-ga.").catch(() => null);
    return;
  }

  if (customId.startsWith("vote_")) {
    if (!game || game.phase !== "day") { await interaction.reply({ content: "⚠️ Maalinta codbixinta maaha hadda.", ephemeral: true }); return; }
    const voter = game.players.get(interaction.user.id);
    if (!voter || !(voter as any).alive) { await interaction.reply({ content: "⚠️ Adigu ma codeyn kartid.", ephemeral: true }); return; }
    const targetId   = customId === "vote_skip" ? "skip" : customId.replace("vote_", "");
    if (targetId !== "skip") {
      const t = game.players.get(targetId);
      if (!t || !(t as any).alive) { await interaction.reply({ content: "⚠️ Ciyaaryahankaan nool maaha.", ephemeral: true }); return; }
    }
    const existingIdx = game.votes.findIndex((v: any) => v.voterId === interaction.user.id);
    if (existingIdx !== -1) game.votes.splice(existingIdx, 1);
    game.votes.push({ voterId: interaction.user.id, targetId });
    const targetName = targetId === "skip" ? "SKIP" : (game.players.get(targetId) as any)?.displayName ?? targetId;
    addLog(guildId, interaction.guild.name, `🗳️ ${(voter as any).displayName} wuxuu u codeeyay ${targetName}`);
    await interaction.reply({ content: `🗳️ Waxaad u codeysay: **${targetName}**`, ephemeral: true });
    return;
  }
}

// ─── Night DM actions ─────────────────────────────────────────────────────────

function parseNightCustomId(customId: string, prefix: string) {
  const rest = customId.slice(prefix.length);
  const idx  = rest.indexOf("_");
  if (idx === -1) return null;
  return { gameChannelId: rest.slice(0, idx), targetId: rest.slice(idx + 1) };
}

async function handleNightDmAction(interaction: any, userId: string, customId: string, client: Client) {
  if (customId.startsWith("night_kill_")) {
    const parsed = parseNightCustomId(customId, "night_kill_");
    if (!parsed) { await interaction.reply({ content: "⚠️ Cilad dhacday.", ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== "night") { await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || (player as any).role !== "dilaaye") { await interaction.reply({ content: "⚠️ Dilaaye ma tihid.", ephemeral: true }); return; }
    if (game.nightKillTarget) { await interaction.reply({ content: "⚠️ Hore ayaa la doortay — beesha waa isku raacday.", ephemeral: true }); return; }
    game.nightKillTarget = parsed.targetId;
    const target = game.players.get(parsed.targetId);
    await interaction.update({ content: `🔪 Waxaad doortay: **${(target as any)?.displayName ?? parsed.targetId}**`, components: [] });
  }
  else if (customId.startsWith("night_save_")) {
    const parsed = parseNightCustomId(customId, "night_save_");
    if (!parsed) { await interaction.reply({ content: "⚠️ Cilad dhacday.", ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== "night") { await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || (player as any).role !== "dhakhtar") { await interaction.reply({ content: "⚠️ Dhakhtar ma tihid.", ephemeral: true }); return; }
    game.nightSaveTarget = parsed.targetId;
    const target = game.players.get(parsed.targetId);
    await interaction.update({ content: `🛡️ Waxaad badbaadinaysaa: **${(target as any)?.displayName ?? parsed.targetId}**`, components: [] });
  }
  else if (customId.startsWith("night_sheriff_")) {
    const parsed = parseNightCustomId(customId, "night_sheriff_");
    if (!parsed) { await interaction.reply({ content: "⚠️ Cilad dhacday.", ephemeral: true }); return; }
    const game = games.get(parsed.gameChannelId);
    if (!game || game.phase !== "night") { await interaction.reply({ content: "⚠️ Habeenka ma socdo hadda.", ephemeral: true }); return; }
    const player = game.players.get(userId);
    if (!player || (player as any).role !== "sheriff") { await interaction.reply({ content: "⚠️ Sheriff ma tihid.", ephemeral: true }); return; }
    game.nightSheriffUsed = game.nightSheriffUsed || new Set();
    if (game.nightSheriffUsed.has(userId)) { await interaction.reply({ content: "⚠️ Hore baad xabbad u isticmaashay habeenkan.", ephemeral: true }); return; }
    game.nightSheriffUsed.add(userId);
    const target = game.players.get(parsed.targetId);
    if (!target) { await interaction.reply({ content: "⚠️ Target-ka lama helin.", ephemeral: true }); return; }
    const channel = await client.channels.fetch(parsed.gameChannelId).catch(() => null) as any;
    const guildId   = channel?.guild?.id ?? "";
    const guildName = channel?.guild?.name ?? "Unknown";
    if ((target as any).role === "dilaaye") {
      (target as any).alive = false;
      addLog(guildId, guildName, `⭐ Sheriff ${(player as any).displayName} wuxuu toogtay Dilaaye ${(target as any).displayName}`);
      const winner = checkWinCondition(game);
      if (winner) {
        if (game.phaseTimer) { clearTimeout(game.phaseTimer); game.phaseTimer = null; }
        await endGame(client, game, winner);
      }
      await interaction.update({ content: `✅ **${(target as any).displayName}** waa Dilaaye — la dilay!`, components: [] });
    } else {
      addLog(guildId, guildName, `❌ Sheriff ${(player as any).displayName} wuxuu toogtay ${(target as any).displayName} — ma ahayn Dilaaye`);
      await interaction.update({ content: `❌ **${(target as any).displayName}** ma aha Dilaaye. 🌙 Habeenku wuu sii socdaa...`, components: [] });
    }
  }
}

// ─── !say Modal Submit ────────────────────────────────────────────────────────

async function handleSayModalSubmit(interaction: any, client: Client) {
  const channelId = interaction.customId.slice("say_modal_".length);
  const content   = interaction.fields.getTextInputValue("say_content");
  const attachUrl = interaction.fields.getTextInputValue("say_attachment_url")?.trim();
  const channel   = await client.channels.fetch(channelId).catch(() => null) as any;
  if (!channel) { await interaction.reply({ content: "⚠️ Channel-ka lama helin.", ephemeral: true }); return; }
  const payload = { content: attachUrl ? `${content}\n${attachUrl}` : content };
  const sent = await channel.send(payload).catch(() => null);
  await interaction.reply({ content: sent ? "✅ Fariinta waa la diray!" : "⚠️ Fariinta lama dirin karin.", ephemeral: true });
}

// ─── Lobby refresh helper ─────────────────────────────────────────────────────

async function refreshLobbyMsg(game: any, guild: any, client: Client) {
  if (!game.lobbyMessageId) return;
  const ch = await client.channels.fetch(game.channelId).catch(() => null) as any;
  if (!ch) return;
  const lm = await ch.messages.fetch(game.lobbyMessageId).catch(() => null);
  if (lm) await lm.edit({ embeds: [buildLobbyEmbed(game, guild)], components: [buildLobbyButtons(game)] }).catch(() => null);
}
