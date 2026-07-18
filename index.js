import "dotenv/config";
import { startBot } from "./bot/index.js";

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error("❌ DISCORD_BOT_TOKEN ma jirto!");
  console.error("   .env file samee oo ku dar: DISCORD_BOT_TOKEN=your_token_here");
  process.exit(1);
}

console.log("🚀 CIYAAL XAMAR Ticket Bot bilaabmaya...");
startBot(token);
