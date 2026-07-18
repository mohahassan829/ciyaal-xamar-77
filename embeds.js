// embeds.js — Ciyaal Xamar · Embed & Button builders
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { getAlivePlayers, getDilaayePlayers, getRoleCounts } from "./game.js";

const IMAGES = {
  shacab:   "https://cdn.noctaly.com/servers/859126603619631115/tJGyElBTEm.jpg",
  dhakhtar: "https://cdn.noctaly.com/servers/859126603619631115/Wb6yHb4_M6.jpg",
  dilaaye:  "https://cdn.noctaly.com/servers/859126603619631115/1TZ1--f_dY.jpg",
  lobby:    "https://cdn.discordapp.com/attachments/1470820767204638742/1524440715499667686/IMG_7945.png?ex=6a4fc18d&is=6a4e700d&hm=d07331606f79bec7a892d5375fa216a66f1b40c5577043ee6c499471fb65a5b2",
  atoore:   "https://cdn.discordapp.com/attachments/1470820767204638742/1524437607679787099/AE318162-39A2-4D9C-80F0-9CBF106C8E41.png?ex=6a4fbea8&is=6a4e6d28&hm=a6294472ad11006ae2c9fbefd19cbc963436ad99e140a094cede4064d835049b",
};

// Golbi timer bar — maalinta codbixinta
function makeDayTimerBar(timeLeft) {
  const total = 60;
  const blocks = 12;
  const filled = Math.round((timeLeft / total) * blocks);
  const pct = Math.round((timeLeft / total) * 100);
  const bar = "🟨".repeat(filled) + "⬛".repeat(blocks - filled);
  return `${bar}\n**${timeLeft}s** hadhay · ${pct}%`;
}

// Waa-weyne-guduud timer bar — habeenka
function makeNightTimerBar(timeLeft) {
  const total = 30;
  const blocks = 10;
  const filled = Math.round((timeLeft / total) * blocks);
  const pct = Math.round((timeLeft / total) * 100);
  const bar = "🟣".repeat(filled) + "⬛".repeat(blocks - filled);
  return `${bar}\n**${timeLeft}s** hadhay · ${pct}%`;
}

const MEDALS = ["🥇","🥈","🥉","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"];

export function buildLobbyEmbed(game, guild) {
  const players = Array.from(game.players.values());
  const count = players.length;
  const { dilaaye, dhakhtar, sheriff } = count >= 5
    ? getRoleCounts(count)
    : { dilaaye: 1, dhakhtar: 1, sheriff: 1 };

  const statusLine = count < 5
    ? `⚠️ Ugu yaraan 5 ciyaaryahan ayaa loo baahan yahay. (${count}/5)`
    : `✅ Diyaar — Host wuxuu bilaabi karaa.`;

  return new EmbedBuilder()
    .setTitle("🔪 CIYAAL XAMAR — MAFIA")
    .setDescription(
      "Ku soo biir ciyaarta! Dilaayeyaasha, Dhakhtarka, iyo Shacabka ayaa iska horimanaya.\n" +
      "Host-ku wuxuu bilaabi karaa marka dhammaantood diyaar yihiin."
    )
    .setColor(0x1a1a2e)
    .setImage(IMAGES.lobby)
    .addFields(
      { name: "👥 Ciyaaryahanno", value: `**${count}** / 20`, inline: true },
      {
        name: "🎭 Doorarka",
        value: [
          `🔪 ×${dilaaye} Dilaaye`,
          `🩺 ×${dhakhtar} Dhakhtar`,
          `⭐ ×${sheriff} Atoore`,
          `🏠 Shacabka kale`,
        ].join("\n"),
        inline: true,
      },
      {
        name: "📋 Liiska Ciyaaryahanno",
        value: count === 0
          ? "_Wali ciyaaryahan ma jiraan_"
          : players.map((p, i) => `\`${i + 1}.\` ${p.displayName}`).join("\n"),
      },
      { name: "ℹ️ Xaalad", value: statusLine }
    )
    .setFooter({ text: `${guild.name} · Ciyaaryahanno: ${count}/20` });
}

export function buildLobbyButtons(game) {
  const count = game.players.size;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("lobby_join").setLabel("KU BIIR").setStyle(ButtonStyle.Success).setDisabled(count >= 20),
    new ButtonBuilder().setCustomId("lobby_start").setLabel("BILAAB HADDA").setStyle(ButtonStyle.Primary).setDisabled(count < 5),
    new ButtonBuilder().setCustomId("lobby_leave").setLabel("KA BAX").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("lobby_stop").setLabel("JOOJI").setStyle(ButtonStyle.Danger)
  );
}

export function buildRoleDmEmbed(player, game) {
  const alive = getAlivePlayers(game);
  const allPlayersList = alive.map((p, i) => `\`${i + 1}.\` ${p.displayName}`).join("\n");

  if (player.role === "dilaaye") {
    const teammates = getDilaayePlayers(game)
      .filter(p => p.id !== player.id)
      .map(p => `🔪 **${p.displayName}**`)
      .join("\n") || "_Adiga oo kali ah_";

    return new EmbedBuilder()
      .setTitle("🔪 DILAAYE")
      .setDescription(
        "**Adiga waxaad tahay Dilaaye!**\n" +
        "Habeenta waxaad dilaysaa shacabka. Maalintana qarso doorkaaga si aanad loo garanin!"
      )
      .setColor(0xdc143c)
      .setImage(IMAGES.dilaaye)
      .addFields(
        { name: "🤝 Dilaayeyaasha Kale", value: teammates },
        {
          name: "📌 Tilmaamaha",
          value: [
            "🔪 **Habeenta** — DM kaa imaanaysaa, xulo qofka aad dili rabto",
            "🎭 **Maalinta** — Isku day inaadan lagu garanin, cod si xirfad leh",
            "🏆 **Guusha** — Tirada Dilaayeyaasha ay la siman tahay ama ka badan Shacabka",
          ].join("\n"),
        },
        { name: `👥 Dhammaan Ciyaaryahanno (${alive.length})`, value: allPlayersList }
      )
      .setFooter({ text: "🤫 Dilaaye · Xirso sirta!" });
  }

  if (player.role === "dhakhtar") {
    return new EmbedBuilder()
      .setTitle("🩺 DHAKHTAR")
      .setDescription(
        "**Adiga waxaad tahay Dhakhtar!**\n" +
        "Gacantaadu waxay badbaadin kartaa naf habeenta kasta. Xil weyn ayaa ku saaran!"
      )
      .setColor(0x00bfff)
      .setImage(IMAGES.dhakhtar)
      .addFields(
        {
          name: "📌 Tilmaamaha",
          value: [
            "🛡️ **Habeenta** — DM kaa imaanaysaa, xulo qofka aad badbaadinayso",
            "💡 **Xasuus** — Naftaada ayaad badbaadin kartaa, laakiin mar kaliya",
            "🏆 **Guusha** — Dhammaan Dilaayeyaasha in la saaro",
          ].join("\n"),
        },
        { name: `👥 Dhammaan Ciyaaryahanno (${alive.length})`, value: allPlayersList }
      )
      .setFooter({ text: "🩺 Dhakhtar · Naf badbaadi!" });
  }

  if (player.role === "sheriff") {
    return new EmbedBuilder()
      .setTitle("⭐ ATOORE")
      .setDescription(
        "**Adiga waxaad tahay Atoore!**\n" +
        "Atoore waa ilaaliyaha magaalada.\n" +
        "Habeen kasta wuxuu dooran karaa hal qof oo keliya si uu u toogto.\n\n" +
        "⚠️ Atoore wuxuu dili karaa **Dilaayaha (Killer)** oo keliya.\n" +
        "Haddii uu doorto qof aan Dilaaye ahayn, qofkaas waxba ma gaarayaan, habeenkuna wuu sii soconayaa."
      )
      .setColor(0xffd700)
      .setImage(IMAGES.atoore)
      .addFields(
        {
          name: "🎯 Xeerarka Atoore",
          value: [
            "⭐ Habeen kasta wuxuu leeyahay hal xabbad (1 shot).",
            "🔪 Wuxuu dili karaa Dilaayaha oo keliya.",
            "❌ Haddii uu doorto qof aan Dilaaye ahayn, qofkaas ma dhimanayo.",
            "👥 Atoore waa inuu qariyaa doorkiisa inta ciyaartu socoto.",
          ].join("\n"),
        },
        { name: `👥 Dhammaan Ciyaaryahanno (${alive.length})`, value: allPlayersList }
      )
      .setFooter({ text: "⭐ Atoore · Justice Never Sleeps!" });
  }

  // Shacab
  return new EmbedBuilder()
    .setTitle("🏠 SHACAB")
    .setDescription(
      "**Adiga waxaad ka mid tahay Shacabka!**\n" +
      "Raadi Dilaayeyaasha — maalintana codbixinta ku saaro cidda ugu khatar badan!"
    )
    .setColor(0x2ecc71)
    .setImage(IMAGES.shacab)
    .addFields(
      {
        name: "📌 Tilmaamaha",
        value: [
          "☀️ **Maalintii** — Cod bixin: shaki qofka u muuqda Dilaaye",
          "👁️ **Caawiye** — Dhakhtar iyo Sheriff waxay kaa caawiyaan",
          "🏆 **Guusha** — Dhammaan Dilaayeyaasha in la saaro",
        ].join("\n"),
      },
      { name: `👥 Dhammaan Ciyaaryahanno (${alive.length})`, value: allPlayersList }
    )
    .setFooter({ text: "🏠 Shacab · Raadi runta!" });
}

export function buildNightEmbed(round, timeLeft) {
  return new EmbedBuilder()
    .setTitle(`🌙 HABEENKA · Wareeg ${round}`)
    .setDescription(
      "**Tuuladu way seexatay... laakiin dilaayeyaashu way toosanyihiin.**\n\n" +
      "🔪 Dilaayeyaashu waxay dooranayaan cidda la dilo\n" +
      "🩺 Dhakhtarku wuxuu dooranayaa cidda la badbaadinayo\n" +
      "⭐ Atoore wuxuu ilaaliyaa magaalada — hal xabbad buu leeyahay"
    )
    .setColor(0x0d0d2b)
    .addFields(
      { name: "⏳ Waqtiga la haray", value: makeNightTimerBar(timeLeft) },
      { name: "🌑 Xaaladda", value: "Habeenku waa socda — degdeg!" }
    )
    .setFooter({ text: "📨 DM-kaaga fur si aad ficil u qaadato!" });
}

export function buildDayEmbed(round, alivePlayers, timeLeft) {
  return new EmbedBuilder()
    .setTitle(`☀️ MAALINTA · Wareeg ${round}`)
    .setDescription(
      "**Subaxdii ayaa beesha kici — go'aanka maanta waa muhiim!**\n\n" +
      "Ku saaro cidda aad u malaynayso inay Dilaaye tahay. Dhammaan ciyaaryahanno nool ayaa codeynaya!"
    )
    .setColor(0xf59e0b)
    .addFields(
      { name: "⏱️ Waqtiga la haray", value: makeDayTimerBar(timeLeft) },
      { name: "🗳️ Codad la bixiyay", value: "0", inline: true },
      { name: "👥 Ciyaaryahanno Nool", value: `${alivePlayers.length}`, inline: true }
    )
    .setFooter({ text: "💡 Hoos riix si aad u codeysato · Codkaaga badali kartaa!" });
}

export function buildVoteButtons(alivePlayers) {
  const rows = [];
  const chunks = [];
  for (let i = 0; i < alivePlayers.length; i += 5) chunks.push(alivePlayers.slice(i, i + 5));
  const maxRows = Math.min(chunks.length, 4);
  for (let i = 0; i < maxRows; i++) {
    const row = new ActionRowBuilder();
    chunks[i].forEach(p => row.addComponents(
      new ButtonBuilder().setCustomId(`vote_${p.id}`).setLabel(p.displayName.slice(0, 25)).setStyle(ButtonStyle.Primary)
    ));
    rows.push(row);
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("vote_skip").setLabel("⏭️ SKIP — Cod la'aan").setStyle(ButtonStyle.Secondary)
  ));
  return rows;
}

export function buildNightKillButtons(alivePlayers, gameChannelId) {
  const rows = [];
  const targets = alivePlayers.filter(p => p.role !== "dilaaye");
  const chunks = [];
  for (let i = 0; i < targets.length; i += 5) chunks.push(targets.slice(i, i + 5));
  const maxRows = Math.min(chunks.length, 4);
  for (let i = 0; i < maxRows; i++) {
    const row = new ActionRowBuilder();
    chunks[i].forEach(p => row.addComponents(
      new ButtonBuilder().setCustomId(`night_kill_${gameChannelId}_${p.id}`).setLabel(p.displayName.slice(0, 25)).setStyle(ButtonStyle.Danger)
    ));
    rows.push(row);
  }
  return rows;
}

export function buildNightSaveButtons(alivePlayers, gameChannelId) {
  const rows = [];
  const chunks = [];
  for (let i = 0; i < alivePlayers.length; i += 5) chunks.push(alivePlayers.slice(i, i + 5));
  const maxRows = Math.min(chunks.length, 4);
  for (let i = 0; i < maxRows; i++) {
    const row = new ActionRowBuilder();
    chunks[i].forEach(p => row.addComponents(
      new ButtonBuilder().setCustomId(`night_save_${gameChannelId}_${p.id}`).setLabel(p.displayName.slice(0, 25)).setStyle(ButtonStyle.Success)
    ));
    rows.push(row);
  }
  return rows;
}

export function buildNightSheriffButtons(alivePlayers, gameChannelId) {
  const rows = [];
  const chunks = [];
  for (let i = 0; i < alivePlayers.length; i += 5) chunks.push(alivePlayers.slice(i, i + 5));
  const maxRows = Math.min(chunks.length, 4);
  for (let i = 0; i < maxRows; i++) {
    const row = new ActionRowBuilder();
    chunks[i].forEach(p => row.addComponents(
      new ButtonBuilder().setCustomId(`night_sheriff_${gameChannelId}_${p.id}`).setLabel(`👤 ${p.displayName.slice(0, 25)}`).setStyle(ButtonStyle.Primary)
    ));
    rows.push(row);
  }
  return rows;
}

export function buildSheriffTurnEmbed(round) {
  return new EmbedBuilder()
    .setTitle("⭐ Atoore's Turn")
    .setColor(0xffd700)
    .setDescription(
      "Waxaad tahay ⭐ **Atoore**.\n\n" +
      "🎯 Caawa dooro hal ciyaaryahan.\n\n" +
      "⚠️ Waxaad dili kartaa oo keliya Dilaayaha.\n\n" +
      "Haddii aad doorato qof aan Dilaaye ahayn, waxba ma dhacayaan."
    )
    .setFooter({ text: `Wareegga ${round} · Hal xabbad oo kaliya!` });
}

export function buildVoteResultEmbed(eliminated, voteMap, players) {
  const sortedVotes = Array.from(voteMap.entries()).sort(([, a], [, b]) => b - a);
  const rankLines = sortedVotes.length > 0
    ? sortedVotes.map(([id, count], idx) => {
        const p = players.get(id);
        const medal = MEDALS[idx] ?? "🔸";
        return `${medal} **${p?.displayName ?? id}** — **${count}** codad`;
      }).join("\n")
    : "_Codad la'aan — qof cod kuma bixin_";

  const embed = new EmbedBuilder()
    .setTitle("📋 Natiijada Codeynta")
    .setColor(eliminated ? 0xf59e0b : 0x22c55e)
    .addFields({ name: "🗳️ Natiijada", value: rankLines });

  if (eliminated) {
    const isDhakhtar = eliminated.role === "dhakhtar";
    embed.addFields({
      name: isDhakhtar ? "💔 DHAKHTAR AYAA LA SAARTAY!" : "💀 La Saaray",
      value: isDhakhtar
        ? `**${eliminated.displayName}** ayaa laga saaray ciyaarta.\n😱 Ninka/Naagta badbaadinaysay oo naftiisu baxday!\n🎭 Doorarkiisu wuxuu ahaa: **${getRoleLabel(eliminated.role)}**`
        : `**${eliminated.displayName}** ayaa laga saaray ciyaarta.\n🎭 Doorarkiisu wuxuu ahaa: **${getRoleLabel(eliminated.role)}**`,
    });
  } else {
    embed.addFields({ name: "⚖️ Natiijada", value: "Cod is qabsig ah ayaa dhacay — qof lagama saarin wareeggan." });
  }
  return embed;
}

export function buildWinEmbed(winner, players) {
  const isDilaaye = winner === "dilaaye";
  const roleLines = players.map(p => `${p.alive ? "✅" : "💀"} **${p.displayName}** — ${getRoleLabel(p.role)}`).join("\n");

  return new EmbedBuilder()
    .setTitle(isDilaaye ? "🔪 DILAAYEYAASHU GUULEYSTEEN!" : "🏆 SHACABKU GUULEYSTAY!")
    .setDescription(
      isDilaaye
        ? "☠️ Dilaayeyaashu waxay la simeen shacabka.\n**Tuuladu waxay hoos u dhacday — ciyaarta dhammaatay!**"
        : "🎉 Dhammaan Dilaayeyaasha waa laga saaray.\n**Shacabku wuu badbaadey — nabadda ayaa soo noqotay!**"
    )
    .setColor(isDilaaye ? 0xdc143c : 0x22c55e)
    .addFields({ name: "🎭 Doorarka Dhammaan Ciyaaryahanno", value: roleLines || "N/A" })
    .setFooter({ text: "Ciyaal Xamar · Mafia Game" });
}

export function buildKickButtons(game, hostId) {
  const players = Array.from(game.players.values()).filter(p => p.id !== hostId);
  const rows = [];
  const chunks = [];
  for (let i = 0; i < players.length; i += 5) chunks.push(players.slice(i, i + 5));
  const maxRows = Math.min(chunks.length, 4);
  for (let i = 0; i < maxRows; i++) {
    const row = new ActionRowBuilder();
    chunks[i].forEach(p => row.addComponents(
      new ButtonBuilder().setCustomId(`kick_${p.id}`).setLabel(p.displayName.slice(0, 25)).setStyle(ButtonStyle.Danger)
    ));
    rows.push(row);
  }
  return rows;
}

function getRoleLabel(role) {
  const labels = {
    dilaaye:  "🔪 Dilaaye",
    dhakhtar: "🩺 Dhakhtar",
    sheriff:  "⭐ Atoore",
    shacab:   "🏠 Shacab",
  };
  return labels[role] ?? role;
}
