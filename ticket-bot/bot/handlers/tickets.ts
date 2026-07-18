import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import {
  getGuildConfig,
  getUserOpenTicket,
  getTicketByChannel,
  removeTicket,
  saveTicket,
  updateTicket,
} from "../storage.js";
import { logger } from "../../lib/logger.js";

// ─── Open Ticket ──────────────────────────────────────────────────────────────

export async function handleOpenTicket(interaction: ButtonInteraction) {
  // Always acknowledge within 3 seconds
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  logger.info(
    { userId: interaction.user.id, guildId: interaction.guildId },
    "ticket_open interaction received",
  );

  const guild = interaction.guild;
  if (!guild || !interaction.guildId) {
    await interaction.editReply("❌ Server error — guild ma helin.");
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  if (!config) {
    await interaction.editReply(
      "❌ Setup ma sameynin. Admin-ku ha isticmaalo `/setup`.",
    );
    return;
  }

  // One-ticket-per-user
  const existing = getUserOpenTicket(interaction.guildId, interaction.user.id);
  if (existing) {
    await interaction.editReply(
      `❌ Waxaad hore u leedahay ticket furan: <#${existing.channelId}>\nTicket-kaas xir kadibna mid cusub fur.`,
    );
    return;
  }

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.editReply("❌ Member-ka lama helin.");
    return;
  }

  const username = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, "") || "user";

  // Create ticket channel
  let channel: TextChannel;
  try {
    channel = await guild.channels.create({
      name: `ticket-${username}`,
      type: ChannelType.GuildText,
      parent: config.openCategoryId,
      permissionOverwrites: buildPermissions(guild, member, config.staffRoleIds),
    }) as TextChannel;
  } catch (err) {
    logger.error({ err }, "Failed to create ticket channel");
    await interaction.editReply(
      "❌ Ticket channel lama abuuri karin. Bot-ka hubi:\n• **Manage Channels** permission\n• Category-ga sax ah ayaa loo doortay /setup",
    );
    return;
  }

  saveTicket({
    channelId: channel.id,
    userId: interaction.user.id,
    guildId: interaction.guildId,
    createdAt: Date.now(),
  });

  // Welcome embed inside ticket channel
  const embed = new EmbedBuilder()
    .setTitle("🎫 Ticket Furan")
    .setDescription(
      `Ku soo dhawoow Support-ka **CIYAAL XAMAR** <@${interaction.user.id}>!\n\n` +
      "Fadlan si faahfaahsan u sharax dhibaatadaada.\n\n" +
      "**Waxaad ticket-kan u isticmaali kartaa:**\n" +
      "💰 Lacag kaa maqan\n" +
      "💣 Bomb Survival\n" +
      "🔪 Dilaay\n" +
      "⚠️ Bugs & Support\n\n" +
      "⏳ Fadlan sug Staff-ka.",
    )
    .setColor(0x57f287)
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_claim")
      .setLabel("👮 Claim Ticket")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ticket_close")
      .setLabel("🔒 Close Ticket")
      .setStyle(ButtonStyle.Danger),
  );

  await channel.send({ embeds: [embed], components: [row] }).catch((err: Error) => {
    logger.error({ err }, "Failed to send welcome embed");
  });

  await interaction.editReply(
    `✅ Ticket-kaaga waxaa la sameeyay: <#${channel.id}>`,
  );

  logger.info({ channelId: channel.id, userId: interaction.user.id }, "Ticket created");
}

// ─── Claim Ticket ─────────────────────────────────────────────────────────────

export async function handleClaimTicket(interaction: ButtonInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.editReply("❌ Member-ka lama helin.");
    return;
  }

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

  const channel = interaction.channel as TextChannel;
  await channel.send(`✅ Ticket-kan waxaa qaatay: <@${interaction.user.id}>`).catch(() => null);
  await interaction.editReply("✅ Ticket-ka waxaad si guul leh u qaadatay.");
}

// ─── Close Ticket (ask confirm) ───────────────────────────────────────────────

export async function handleCloseTicket(interaction: ButtonInteraction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isStaff =
    config.staffRoleIds.some((r) => member?.roles.cache.has(r)) ||
    member?.permissions.has(PermissionFlagsBits.Administrator);
  const isOwner = ticket.userId === interaction.user.id;

  if (!isStaff && !isOwner) {
    await interaction.editReply("❌ Ticket-ka owner-kiis ama Staff keliya ayaa xiri kara.");
    return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_close_confirm")
      .setLabel("✅ Xir")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ticket_close_cancel")
      .setLabel("❌ Ka noqo")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content: "**🔒 Ma hubtaa inaad xirto Ticket-kan?**",
    components: [row],
  });
}

// ─── Close Confirm ────────────────────────────────────────────────────────────

export async function handleCloseConfirm(interaction: ButtonInteraction) {
  await interaction.deferUpdate();

  if (!interaction.guildId || !interaction.guild) return;

  const config = getGuildConfig(interaction.guildId);
  const ticket = getTicketByChannel(interaction.channelId);

  if (!ticket || !config) {
    await interaction.followUp({ content: "❌ Ticket-kan kuma jiro nidaamka.", flags: MessageFlags.Ephemeral });
    return;
  }

  const channel = interaction.channel as TextChannel;

  // Save transcript
  await saveTranscript(channel, interaction.guild, ticket.userId);

  // Move to closed category
  await channel.setParent(config.closedCategoryId, { lockPermissions: false }).catch((err: Error) => {
    logger.error({ err }, "Failed to move ticket to closed category");
  });

  // Remove ticket owner's permissions
  await channel.permissionOverwrites.delete(ticket.userId).catch(() => {});

  // Lock for everyone except staff
  await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
    ViewChannel: false,
  }).catch(() => {});

  removeTicket(interaction.channelId);

  const closeEmbed = new EmbedBuilder()
    .setTitle("🔒 Ticket Xirnaatay")
    .setDescription(`Ticket-kaan waxaa xiray <@${interaction.user.id}>`)
    .setColor(0xed4245)
    .setTimestamp();

  await channel.send({ embeds: [closeEmbed] }).catch(() => null);
  await interaction.editReply({ content: "🔒 Ticket-ka la xiray.", components: [] });

  logger.info({ channelId: interaction.channelId, closedBy: interaction.user.id }, "Ticket closed");
}

// ─── Close Cancel ─────────────────────────────────────────────────────────────

export async function handleCloseCancel(interaction: ButtonInteraction) {
  await interaction.update({ content: "❌ La joojiyay. Ticket-ka weli furan yahay.", components: [] });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPermissions(guild: Guild, member: GuildMember, staffRoleIds: string[]) {
  const overrides: {
    id: string;
    allow?: bigint[];
    deny?: bigint[];
  }[] = [
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
        PermissionFlagsBits.AttachFiles,
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
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  return overrides;
}

async function saveTranscript(channel: TextChannel, guild: Guild, userId: string) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp,
    );

    const lines = sorted.map((m) => {
      const time = new Date(m.createdTimestamp).toISOString();
      const content = m.content || (m.embeds.length ? "[Embed]" : "[Media/File]");
      return `[${time}] ${m.author.tag}: ${content}`;
    });

    const header = [
      `=== TICKET TRANSCRIPT ===`,
      `Server: ${guild.name} (${guild.id})`,
      `Channel: #${channel.name}`,
      `User ID: ${userId}`,
      `Closed: ${new Date().toISOString()}`,
      `========================`,
      "",
    ];

    const transcript = [...header, ...lines].join("\n");
    const buffer = Buffer.from(transcript, "utf8");

    await channel.send({
      content: "📋 **Transcript — Ticket History:**",
      files: [{ attachment: buffer, name: `transcript-${channel.name}.txt` }],
    });
  } catch (err) {
    logger.error({ err }, "Transcript save failed");
  }
}
