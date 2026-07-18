import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import {
  getGuildConfig,
  getUserOpenTicket,
  getTicketByChannel,
  removeTicket,
  saveTicket,
  updateTicket,
} from "../storage.js";

// ─── Open Ticket ──────────────────────────────────────────────────────────────

export async function handleOpenTicket(interaction) {
  await interaction.deferReply({ flags: 64 });
  const guild = interaction.guild;
  if (!guild || !interaction.guildId) {
    await interaction.editReply("❌ Server error.");
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  if (!config) {
    await interaction.editReply("❌ Setup ma sameynin. Admin-ku ha isticmaalo /setup.");
    return;
  }

  // Check if user already has open ticket
  const existing = getUserOpenTicket(interaction.guildId, interaction.user.id);
  if (existing) {
    await interaction.editReply(`❌ Waxaad hore u leedahay ticket furan: <#${existing.channelId}>`);
    return;
  }

  const member = await guild.members.fetch(interaction.user.id);
  const username = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Create ticket channel
  const channel = await guild.channels.create({
    name: `ticket-${username}`,
    type: ChannelType.GuildText,
    parent: config.openCategoryId,
    permissionOverwrites: buildPermissions(guild, member, config.staffRoleIds),
  });

  saveTicket({
    channelId: channel.id,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    createdAt: Date.now(),
  });

  // Send welcome embed
  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket Open")
    .setDescription(
      `Ku soo dhawoow Support-ka **CIYAAL XAMAR**.\n\n` +
      `Fadlan si faahfaahsan u sharax dhibaatadaada.\n\n` +
      `Waxaad ticket-kan u isticmaali kartaa:\n\n` +
      `💰 Lacag kaa maqan.\n` +
      `💣 Bomb Survival.\n` +
      `🔪 Dilaay.\n` +
      `⚠️ Bugs.\n` +
      `❓ Support.\n\n` +
      `Fadlan sug Staff-ka.`
    )
    .setColor(0x57f287)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("👮 Claim Ticket").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("🔒 Close Ticket").setStyle(ButtonStyle.Danger),
  );

  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
  await interaction.editReply(`✅ Ticket-kaaga waxaa la sameeyay: <#${channel.id}>`);
}

// ─── Claim Ticket ─────────────────────────────────────────────────────────────

export async function handleClaimTicket(interaction) {
  await interaction.deferReply({ flags: 64 });
  if (!interaction.guildId || !interaction.guild) {
    await interaction.editReply("❌ Server error.");
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  const ticket = getTicketByChannel(interaction.channelId);

  if (!ticket || !config) {
    await interaction.editReply("❌ Ticket-kan kuma jiro nidaamka.");
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isStaff =
    config.staffRoleIds.some((r) => member.roles.cache.has(r)) ||
    member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isStaff) {
    await interaction.editReply("❌ Staff-ka oo keliya ayaa Claim gareyn kara.");
    return;
  }

  if (ticket.claimedBy) {
    await interaction.editReply(`❌ Ticket-kaan hore waxaa qaatay <@${ticket.claimedBy}>`);
    return;
  }

  updateTicket(interaction.channelId, { claimedBy: interaction.user.id });

  await interaction.channel.send(`✅ Ticket-kan waxaa qaatay: <@${interaction.user.id}>`);
  await interaction.editReply("✅ Ticket-ka waxaad si guul leh u qaadatay.");
}

// ─── Close Ticket (ask confirm) ───────────────────────────────────────────────

export async function handleCloseTicket(interaction) {
  await interaction.deferReply({ flags: 64 });
  if (!interaction.guildId || !interaction.guild) {
    await interaction.editReply("❌ Server error.");
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  const ticket = getTicketByChannel(interaction.channelId);

  if (!ticket || !config) {
    await interaction.editReply("❌ Ticket-kan kuma jiro nidaamka.");
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isStaff =
    config.staffRoleIds.some((r) => member.roles.cache.has(r)) ||
    member.permissions.has(PermissionFlagsBits.Administrator);
  const isOwner = ticket.userId === interaction.user.id;

  if (!isStaff && !isOwner) {
    await interaction.editReply("❌ Ticket-ka owner-kiis ama Staff keliya ayaa xiri kara.");
    return;
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close_confirm").setLabel("✅ Confirm").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket_close_cancel").setLabel("❌ Cancel").setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ content: "**Ma hubtaa inaad xirto Ticket-kan?**", components: [row] });
}

// ─── Close Confirm ────────────────────────────────────────────────────────────

export async function handleCloseConfirm(interaction) {
  await interaction.deferUpdate();
  if (!interaction.guildId || !interaction.guild) return;

  const config = getGuildConfig(interaction.guildId);
  const ticket = getTicketByChannel(interaction.channelId);

  if (!ticket || !config) {
    await interaction.followUp({ content: "❌ Ticket-kan kuma jiro nidaamka.", flags: 64 });
    return;
  }

  // Save transcript first
  await saveTranscript(interaction.channel, interaction.guild, ticket.userId);

  // Move to closed category
  await interaction.channel.setParent(config.closedCategoryId, { lockPermissions: false });

  // Remove ticket owner's permissions
  await interaction.channel.permissionOverwrites.delete(ticket.userId).catch(() => {});

  // Hide from everyone except staff
  await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    ViewChannel: false,
  });

  removeTicket(interaction.channelId);

  const closeEmbed = new EmbedBuilder()
    .setTitle("🔒 Ticket Xirnaatay")
    .setDescription(`Ticket-kaan waxaa xiray <@${interaction.user.id}>`)
    .setColor(0xed4245)
    .setTimestamp();

  await interaction.channel.send({ embeds: [closeEmbed] });
  await interaction.editReply({ content: "🔒 Ticket-ka la xiray.", components: [] });
}

// ─── Close Cancel ─────────────────────────────────────────────────────────────

export async function handleCloseCancel(interaction) {
  await interaction.update({ content: "❌ La joojiyay. Ticket-ka weli furan yahay.", components: [] });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPermissions(guild, member, staffRoleIds) {
  const overrides = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  for (const roleId of staffRoleIds) {
    overrides.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  return overrides;
}

async function saveTranscript(channel, guild, userId) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const lines = sorted.map((m) => {
      const time = new Date(m.createdTimestamp).toISOString();
      const content = m.content || (m.embeds.length ? "[Embed]" : "[Media]");
      return `[${time}] ${m.author.tag}: ${content}`;
    });

    const header = [
      `=== TICKET TRANSCRIPT ===`,
      `Channel : #${channel.name}`,
      `User    : ${userId}`,
      `Closed  : ${new Date().toISOString()}`,
      `=========================`,
      "",
    ];

    const transcript = [...header, ...lines].join("\n");
    const buffer = Buffer.from(transcript, "utf8");

    await channel.send({
      content: "📋 **Transcript — Ticket History:**",
      files: [{ attachment: buffer, name: `transcript-${channel.name}.txt` }],
    });
  } catch (err) {
    console.error("Transcript save failed:", err);
  }
}
