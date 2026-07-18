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
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type ChatInputCommandInteraction,
  type ModalSubmitInteraction,
  type RoleSelectMenuInteraction,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { getGuildConfig, saveGuildConfig, type GuildConfig } from "../storage.js";
import { logger } from "../../lib/logger.js";

// In-memory setup sessions per guild
export const setupSessions = new Map<string, Partial<GuildConfig>>();

// ── Helper: send the ticket embed to a channel ─────────────────────────────
export async function sendTicketEmbed(
  channel: import("discord.js").TextChannel,
  config: GuildConfig,
) {
  const embed = new EmbedBuilder()
    .setTitle(config.embedTitle)
    .setDescription(config.embedDescription)
    .setColor(0x5865f2);

  if (config.embedImage) embed.setImage(config.embedImage);

  const openBtn = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_open")
      .setLabel("🎫 Open Ticket")
      .setStyle(ButtonStyle.Primary),
  );

  return channel.send({ embeds: [embed], components: [openBtn] });
}

// ── /setup ─────────────────────────────────────────────────────────────────
export async function handleSetupCommand(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId || !interaction.guild) {
    await interaction.reply({ content: "❌ Command-kan server gudihiisa oo kaliya ayaa lagu isticmaali karaa.", flags: MessageFlags.Ephemeral });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "❌ Waxaad u baahan tahay Admin permission si aad /setup u isticmaasho.", flags: MessageFlags.Ephemeral });
    return;
  }

  const existing = getGuildConfig(interaction.guildId);
  if (existing?.setupDone) {
    // Setup already done — show options: Resend, Reset, Cancel
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("setup_resend_embed").setLabel("📤 Embed dib u dir").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("setup_reset").setLabel("🔄 Setup oo dhan dib u samee").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("setup_cancel").setLabel("❌ Jooji").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      content: [
        "⚙️ **Setup hore ayaa la sameeyay.**",
        "",
        "📤 **Embed dib u dir** — Open Ticket embed cusub channel kasta ku soo dir (cilad hadduu jiro)",
        "🔄 **Setup oo dhan dib u samee** — categories, roles, embed oo dhan dib u samee",
        "❌ **Jooji** — Waxba ha bedelin",
      ].join("\n"),
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Fresh setup
  setupSessions.set(interaction.guildId, {});
  await askOpenCategory(interaction);
}

// ── Resend Embed ──────────────────────────────────────────────────────────
export async function handleResendEmbed(interaction: ButtonInteraction) {
  if (!interaction.guildId || !interaction.guild) return;

  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "❌ Admin permission ayaad u baahan tahay.", flags: MessageFlags.Ephemeral });
    return;
  }

  const config = getGuildConfig(interaction.guildId);
  if (!config) {
    await interaction.update({ content: "❌ Setup ma jiro. /setup ku soo bilow.", components: [] });
    return;
  }

  // Ask which channel to post the embed
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId("setup_resend_channel")
    .setPlaceholder("Dooro channel-ka embed-ka lagu soo diri doono...")
    .addChannelTypes(ChannelType.GuildText);

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu);
  await interaction.update({
    content: "📤 **Embed dib u dir** — Yaa channel-ka aad rabto embed-ka lagu soo diro?",
    components: [row],
  });
}

export async function handleResendChannelSelect(interaction: ChannelSelectMenuInteraction) {
  if (!interaction.guildId || !interaction.guild) return;

  const config = getGuildConfig(interaction.guildId);
  if (!config) {
    await interaction.update({ content: "❌ Setup ma jiro.", components: [] });
    return;
  }

  const channelId = interaction.values[0];
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.update({ content: "❌ Channel-ka la doortay ma shaqeynayso.", components: [] });
    return;
  }

  try {
    await sendTicketEmbed(channel as import("discord.js").TextChannel, config);
    await interaction.update({
      content: `✅ **Embed cusub waa la diray** <#${channelId}> — hadda **Open Ticket** batoonka riix si aad u tijaabiso!`,
      components: [],
    });
    logger.info({ channelId, guildId: interaction.guildId }, "Ticket embed resent");
  } catch (err) {
    logger.error({ err }, "Failed to resend ticket embed");
    await interaction.update({
      content: "❌ Embed-ka lama dirin karin. Bot-ka permissions-kiisa hubi (Send Messages).",
      components: [],
    });
  }
}

// ── Setup steps ───────────────────────────────────────────────────────────

export async function askOpenCategory(interaction: ChatInputCommandInteraction | ButtonInteraction) {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId("setup_open_category")
    .setPlaceholder("Dooro Open Ticket Category...")
    .addChannelTypes(ChannelType.GuildCategory);

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu);
  const msg = "**📂 Tallaabada 1/3 — Open Ticket Category**\nDooro category-ga tickets-ka cusub lagu abuuri doono:";

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp({ content: msg, components: [row], flags: MessageFlags.Ephemeral });
  } else {
    await interaction.reply({ content: msg, components: [row], flags: MessageFlags.Ephemeral });
  }
}

export async function handleOpenCategorySelect(interaction: ChannelSelectMenuInteraction) {
  if (!interaction.guildId) return;
  const session = setupSessions.get(interaction.guildId) ?? {};
  session.openCategoryId = interaction.values[0];
  setupSessions.set(interaction.guildId, session);

  const menu = new ChannelSelectMenuBuilder()
    .setCustomId("setup_closed_category")
    .setPlaceholder("Dooro Closed Ticket Category...")
    .addChannelTypes(ChannelType.GuildCategory);

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu);
  await interaction.update({
    content: "**📂 Tallaabada 2/4 — Closed Ticket Category**\nDooro category-ga tickets-ka xiran lagu rarayaa:",
    components: [row],
  });
}

export async function handleClosedCategorySelect(interaction: ChannelSelectMenuInteraction) {
  if (!interaction.guildId) return;
  const session = setupSessions.get(interaction.guildId) ?? {};
  session.closedCategoryId = interaction.values[0];
  setupSessions.set(interaction.guildId, session);

  const menu = new RoleSelectMenuBuilder()
    .setCustomId("setup_staff_roles")
    .setPlaceholder("Dooro Staff Role(s)...")
    .setMinValues(1)
    .setMaxValues(10);

  const row = new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(menu);
  await interaction.update({
    content: "**👮 Tallaabada 3/4 — Staff Roles**\nDooro roles-ka staff-ka ah (kuwaas oo tickets claim/close garayn kara):",
    components: [row],
  });
}

export async function handleStaffRolesSelect(interaction: RoleSelectMenuInteraction) {
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
    .setMaxLength(256)
    .setValue("🎫 Ticket Support");

  const descInput = new TextInputBuilder()
    .setCustomId("embed_description")
    .setLabel("Embed Description")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(4000)
    .setValue(
      "Ku soo dhawoow **CIYAAL XAMAR** Support.\n\n" +
      "Fadlan si cad u sharax dhibaatadaada, kuna dar sawir haddii loo baahdo.\n\n" +
      "Waxaan kaa caawini karnaa:\n" +
      "💰 Lacag maqan\n" +
      "💣 Bomb Survival\n" +
      "🔪 Dilaay\n" +
      "⚠️ Bugs & Support\n\n" +
      "⏳ Fadlan sug Staff-ka, hana spam-gareyn.\n\n" +
      "Waad ku mahadsan tahay."
    );

  const imageInput = new TextInputBuilder()
    .setCustomId("embed_image")
    .setLabel("Embed Image URL (ikhtiyaari ah)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://...")
    .setRequired(false)
    .setValue("https://cdn.discordapp.com/attachments/1470820767204638742/1524440715499667686/IMG_7945.png?ex=6a4fc18d&is=6a4e700d&hm=d07331606f79bec7a892d5375fa216a66f1b40c5577043ee6c499471fb65a5b2");

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(titleInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(imageInput),
  );

  await interaction.showModal(modal);
}

export async function handleEmbedModal(interaction: ModalSubmitInteraction) {
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

  const row = new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu);
  await interaction.reply({
    content: "**📢 Tallaabada 4/4 — Embed Channel**\nYaa channel-ka aad rabto embed-ka lagu soo diro?",
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handlePostChannelSelect(interaction: ChannelSelectMenuInteraction) {
  if (!interaction.guildId || !interaction.guild) return;
  const session = setupSessions.get(interaction.guildId);
  if (!session?.openCategoryId || !session.closedCategoryId || !session.staffRoleIds || !session.embedTitle || !session.embedDescription) {
    await interaction.update({ content: "❌ Setup session-ka ayaa dhammaatay. /setup mar kale iska dayo.", components: [] });
    return;
  }

  const config: GuildConfig = {
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
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.update({ content: "❌ Channel-ka la doortay ma shaqeynayso.", components: [] });
    return;
  }

  try {
    await sendTicketEmbed(channel as import("discord.js").TextChannel, config);
    await interaction.update({
      content: `✅ **Setup dhammaatay!** Embed-ka waxaa lagu soo diray <#${channelId}>`,
      components: [],
    });
    logger.info({ guildId: interaction.guildId, channelId }, "Ticket setup complete, embed sent");
  } catch (err) {
    logger.error({ err }, "Failed to send ticket embed after setup");
    await interaction.update({
      content: `✅ Setup dhammaatay — laakiin embed-ka lama dirin karin <#${channelId}>. Bot-ka permissions-kiisa hubi, kadibna /setup ku isticmaal "Embed dib u dir".`,
      components: [],
    });
  }
}

export async function handleSetupReset(interaction: ButtonInteraction) {
  if (!interaction.guildId) return;
  const member = await interaction.guild?.members.fetch(interaction.user.id);
  if (!member?.permissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "❌ Admin permission ayaad u baahan tahay.", flags: MessageFlags.Ephemeral });
    return;
  }
  setupSessions.set(interaction.guildId, {});
  await interaction.update({ content: "🔄 Setup dib ayaa loo bilaabayaa...", components: [] });
  await askOpenCategory(interaction as unknown as ChatInputCommandInteraction);
}

export async function handleSetupCancel(interaction: ButtonInteraction) {
  await interaction.update({ content: "❌ Setup la joojiyay.", components: [] });
}
