import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import { getGuildConfig, saveGuildConfig } from "../storage.js";

// In-memory setup sessions per guild
export const setupSessions = new Map();

export async function handleSetupCommand(interaction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "❌ Command-kan server gudihiisa oo kaliya ayaa lagu isticmaali karaa.", flags: 64 });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "❌ Waxaad u baahan tahay Admin permission si aad /setup u isticmaasho.", flags: 64 });
    return;
  }

  const existing = getGuildConfig(interaction.guildId);
  if (existing?.setupDone) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("setup_reset").setLabel("🔄 Setup dib u samee").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("setup_cancel").setLabel("❌ Jooji").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      content: "⚠️ **Setup hore ayaa la sameeyay.** Ma rabtaa inaad dib u bilaabdo?",
      components: [row],
      flags: 64,
    });
    return;
  }

  setupSessions.set(interaction.guildId, {});
  await askOpenCategory(interaction);
}

export async function askOpenCategory(interaction) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId("setup_open_category")
    .setPlaceholder("Dooro Open Ticket Category...")
    .addChannelTypes(ChannelType.GuildCategory);

  const row = new ActionRowBuilder().addComponents(menu);
  const msg = "**📂 Tallaabada 1/3 — Open Ticket Category**\nDooro category-ga tickets-ka cusub lagu abuuri doono:";

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: msg, components: [row], flags: 64 });
  } else {
    await interaction.reply({ content: msg, components: [row], flags: 64 });
  }
}

export async function handleOpenCategorySelect(interaction) {
  if (!interaction.guildId) return;
  const session = setupSessions.get(interaction.guildId) ?? {};
  session.openCategoryId = interaction.values[0];
  setupSessions.set(interaction.guildId, session);

  const menu = new ChannelSelectMenuBuilder()
    .setCustomId("setup_closed_category")
    .setPlaceholder("Dooro Closed Ticket Category...")
    .addChannelTypes(ChannelType.GuildCategory);

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.update({
    content: "**🔒 Tallaabada 2/3 — Closed Ticket Category**\nDooro category-ga tickets-ka la xiray loo wareejin doono:",
    components: [row],
  });
}

export async function handleClosedCategorySelect(interaction) {
  if (!interaction.guildId) return;
  const session = setupSessions.get(interaction.guildId) ?? {};
  session.closedCategoryId = interaction.values[0];
  setupSessions.set(interaction.guildId, session);

  const menu = new RoleSelectMenuBuilder()
    .setCustomId("setup_staff_roles")
    .setPlaceholder("Dooro Staff/Admin Roles...")
    .setMinValues(1)
    .setMaxValues(10);

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.update({
    content: "**👮 Tallaabada 3/3 — Staff/Admin Roles**\nDooro roles-ka arki kara tickets-ka:",
    components: [row],
  });
}

export async function handleStaffRolesSelect(interaction) {
  if (!interaction.guildId) return;
  const session = setupSessions.get(interaction.guildId) ?? {};
  session.staffRoleIds = interaction.values;
  setupSessions.set(interaction.guildId, session);

  const modal = new ModalBuilder()
    .setCustomId("setup_embed_modal")
    .setTitle("🎫 Ticket Embed Setup");

  const titleInput = new TextInputBuilder()
    .setCustomId("embed_title")
    .setLabel("Embed Title")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Tusaale: 🎫 Ticket Support")
    .setRequired(true)
    .setMaxLength(256);

  const descInput = new TextInputBuilder()
    .setCustomId("embed_description")
    .setLabel("Embed Description")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Tusaale: Si ticket u fur oo noo soo xiriir...")
    .setRequired(true)
    .setMaxLength(4000);

  const imageInput = new TextInputBuilder()
    .setCustomId("embed_image")
    .setLabel("Embed Image URL (ikhtiyaari ah)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://...")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(imageInput),
  );

  await interaction.showModal(modal);
}

export async function handleEmbedModal(interaction) {
  if (!interaction.guildId) return;
  const session = setupSessions.get(interaction.guildId) ?? {};

  session.embedTitle = interaction.fields.getTextInputValue("embed_title");
  session.embedDescription = interaction.fields.getTextInputValue("embed_description");
  const img = interaction.fields.getTextInputValue("embed_image").trim();
  if (img) session.embedImage = img;
  setupSessions.set(interaction.guildId, session);

  const menu = new ChannelSelectMenuBuilder()
    .setCustomId("setup_post_channel")
    .setPlaceholder("Dooro channel-ka embed-ka lagu soo diri doono...")
    .addChannelTypes(ChannelType.GuildText);

  const row = new ActionRowBuilder().addComponents(menu);
  await interaction.reply({
    content: "**📢 Embed Channel**\nYaa channel-ka aad rabto embed-ka lagu soo diro?",
    components: [row],
    flags: 64,
  });
}

export async function handlePostChannelSelect(interaction) {
  if (!interaction.guildId || !interaction.guild) return;
  const session = setupSessions.get(interaction.guildId);

  if (
    !session ||
    !session.openCategoryId ||
    !session.closedCategoryId ||
    !session.staffRoleIds ||
    !session.embedTitle ||
    !session.embedDescription
  ) {
    await interaction.update({ content: "❌ Setup session-ka ayaa dhammaatay. /setup mar kale iska dayo.", components: [] });
    return;
  }

  const config = {
    openCategoryId: session.openCategoryId,
    closedCategoryId: session.closedCategoryId,
    staffRoleIds: session.staffRoleIds,
    embedTitle: session.embedTitle,
    embedDescription: session.embedDescription,
    embedImage: session.embedImage,
    setupDone: true,
  };

  saveGuildConfig(interaction.guildId, config);
  setupSessions.delete(interaction.guildId);

  const channelId = interaction.values[0];
  const channel = await interaction.guild.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    await interaction.update({ content: "❌ Channel-ka la doortay ma shaqeynayso.", components: [] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(config.embedTitle)
    .setDescription(config.embedDescription)
    .setColor(0x5865f2);

  if (config.embedImage) embed.setImage(config.embedImage);

  const openBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open")
      .setLabel("🎫 Open Ticket")
      .setStyle(ButtonStyle.Primary),
  );

  await channel.send({ embeds: [embed], components: [openBtn] });

  await interaction.update({
    content: `✅ **Setup dhammaatay!** Embed-ka waxaa lagu soo diray <#${channelId}>`,
    components: [],
  });
}

export async function handleSetupReset(interaction) {
  if (!interaction.guildId) return;
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "❌ Admin permission ayaad u baahan tahay.", flags: 64 });
    return;
  }
  setupSessions.set(interaction.guildId, {});
  await askOpenCategory(interaction);
}

export async function handleSetupCancel(interaction) {
  await interaction.update({ content: "❌ Setup la joojiyay.", components: [] });
}
