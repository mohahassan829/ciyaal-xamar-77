import { REST, Routes } from "discord.js";

const commands = [
  {
    name: "setup",
    description: "🎫 Setup-ka Ticket System-ka (Admin kaliya)",
    default_member_permissions: "8", // ADMINISTRATOR
  },
];

export async function deployCommands(token, clientId) {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    console.log("📡 Slash commands la diiwaangelinayaa...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log("✅ Slash commands si guul leh ayaa loo diiwaangeliyay.");
  } catch (err) {
    console.error("❌ Slash commands diiwaangelinta ku guul daratay:", err);
  }
}
