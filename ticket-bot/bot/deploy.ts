import { REST, Routes } from "discord.js";
import { logger } from "../lib/logger.js";

const commands = [
  {
    name: "setup",
    description: "🎫 Setup-ka Ticket System-ka (Admin kaliya)",
    default_member_permissions: "8", // ADMINISTRATOR
  },
];

export async function deployCommands(token: string, clientId: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    logger.info("Slash commands la diiwaangelinayaa...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    logger.info("✅ Slash commands si guul leh ayaa loo diiwaangeliyay.");
  } catch (err) {
    logger.error({ err }, "❌ Slash commands diiwaangelinta ku guul daratay");
  }
}
