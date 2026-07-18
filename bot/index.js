import { Client, GatewayIntentBits, Partials } from "discord.js";
import { deployCommands } from "./deploy.js";
import {
  handleSetupCommand,
  handleOpenCategorySelect,
  handleClosedCategorySelect,
  handleStaffRolesSelect,
  handleEmbedModal,
  handlePostChannelSelect,
  handleSetupReset,
  handleSetupCancel,
} from "./commands/setup.js";
import {
  handleOpenTicket,
  handleClaimTicket,
  handleCloseTicket,
  handleCloseConfirm,
  handleCloseCancel,
} from "./handlers/tickets.js";

export function startBot(token) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  });

  client.once("clientReady", async (c) => {
    console.log(`✅ Discord bot online! Tag: ${c.user.tag}`);
    await deployCommands(token, c.user.id);
  });

  client.on("interactionCreate", async (interaction) => {
    try {
      // ── Slash commands ─────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "setup") {
          await handleSetupCommand(interaction);
        }
        return;
      }

      // ── Buttons ────────────────────────────────────────────────────────────
      if (interaction.isButton()) {
        switch (interaction.customId) {
          case "ticket_open":          await handleOpenTicket(interaction);   break;
          case "ticket_claim":         await handleClaimTicket(interaction);  break;
          case "ticket_close":         await handleCloseTicket(interaction);  break;
          case "ticket_close_confirm": await handleCloseConfirm(interaction); break;
          case "ticket_close_cancel":  await handleCloseCancel(interaction);  break;
          case "setup_reset":          await handleSetupReset(interaction);   break;
          case "setup_cancel":         await handleSetupCancel(interaction);  break;
        }
        return;
      }

      // ── Channel select menus ───────────────────────────────────────────────
      if (interaction.isChannelSelectMenu()) {
        switch (interaction.customId) {
          case "setup_open_category":   await handleOpenCategorySelect(interaction);   break;
          case "setup_closed_category": await handleClosedCategorySelect(interaction); break;
          case "setup_post_channel":    await handlePostChannelSelect(interaction);    break;
        }
        return;
      }

      // ── Role select menus ──────────────────────────────────────────────────
      if (interaction.isRoleSelectMenu()) {
        if (interaction.customId === "setup_staff_roles") {
          await handleStaffRolesSelect(interaction);
        }
        return;
      }

      // ── Modals ─────────────────────────────────────────────────────────────
      if (interaction.isModalSubmit()) {
        if (interaction.customId === "setup_embed_modal") {
          await handleEmbedModal(interaction);
        }
        return;
      }
    } catch (err) {
      console.error("Interaction error:", err);
      try {
        const msg = { content: "❌ Khalad ayaa dhacay. Markale isku day.", flags: 64 };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg);
        } else {
          await interaction.reply(msg);
        }
      } catch {
        // ignore
      }
    }
  });

  client.login(token).catch((err) => {
    console.error("❌ Discord bot login ku guul daratay — token-ka hubi:", err.message);
    process.exit(1);
  });

  return client;
}
