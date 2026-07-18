import {
  Client,
  GatewayIntentBits,
  Partials,
  MessageFlags,
  type Interaction,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger.js";
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
  handleResendEmbed,
  handleResendChannelSelect,
} from "./commands/setup.js";
import {
  handleOpenTicket,
  handleClaimTicket,
  handleCloseTicket,
  handleCloseConfirm,
  handleCloseCancel,
} from "./handlers/tickets.js";
import { initGames, handleGameMessage, handleGameInteraction } from "./games/game-handler.js";

export function startBot(token: string) {
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

  client.once("clientReady", async (c) => {
    logger.info({ tag: c.user.tag }, "✅ Discord bot online!");
    await deployCommands(token, c.user.id);
    await initGames(client);
  });

  // ── Message handler — !bomb, !dilaay and all game commands ──────────────────
  client.on("messageCreate", (msg: Message) => {
    handleGameMessage(msg, client).catch((err: Error) =>
      logger.error({ err }, "MessageCreate error"),
    );
  });

  // ── Interaction handler ──────────────────────────────────────────────────────
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      // ── Slash commands ────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "setup") {
          await handleSetupCommand(interaction);
        }
        return;
      }

      // ── Buttons ───────────────────────────────────────────────────────────
      if (interaction.isButton()) {
        switch (interaction.customId) {
          // Ticket buttons
          case "ticket_open":          await handleOpenTicket(interaction);    return;
          case "ticket_claim":         await handleClaimTicket(interaction);   return;
          case "ticket_close":         await handleCloseTicket(interaction);   return;
          case "ticket_close_confirm": await handleCloseConfirm(interaction);  return;
          case "ticket_close_cancel":  await handleCloseCancel(interaction);   return;
          // Setup buttons
          case "setup_reset":          await handleSetupReset(interaction);    return;
          case "setup_cancel":         await handleSetupCancel(interaction);   return;
          case "setup_resend_embed":   await handleResendEmbed(interaction);   return;
        }
      }

      // ── Select menus ──────────────────────────────────────────────────────
      if (interaction.isChannelSelectMenu()) {
        switch (interaction.customId) {
          case "setup_open_category":   await handleOpenCategorySelect(interaction);   return;
          case "setup_closed_category": await handleClosedCategorySelect(interaction); return;
          case "setup_post_channel":    await handlePostChannelSelect(interaction);    return;
          case "setup_resend_channel":  await handleResendChannelSelect(interaction);  return;
        }
      }

      if (interaction.isRoleSelectMenu() && interaction.customId === "setup_staff_roles") {
        await handleStaffRolesSelect(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === "setup_embed_modal") {
        await handleEmbedModal(interaction);
        return;
      }

      // ── Game interactions (!bomb + !dilaay) ───────────────────────────────
      await handleGameInteraction(interaction, client);

    } catch (err) {
      logger.error({ err }, "Interaction error");
      // Always try to acknowledge so Discord doesn't show "didn't respond in time"
      try {
        const i = interaction as any;
        const msg = { content: "❌ Khalad ayaa dhacay. Markale isku day.", flags: MessageFlags.Ephemeral };
        if (i.replied || i.deferred) {
          await i.followUp(msg);
        } else {
          await i.reply(msg);
        }
      } catch { /* ignore double-reply errors */ }
    }
  });

  client.login(token).catch((err) => {
    logger.error({ err }, "❌ Discord bot login ku guul daratay — token-ka hubi.");
    process.exit(1);
  });

  return client;
}
