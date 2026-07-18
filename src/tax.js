// src/tax.js — Automatic $2,500 tax every 3 days (ES module)
import { EmbedBuilder } from 'discord.js';
import { getAllUsers, deductBalance } from './economy.js';

const TAX_AMOUNT      = 2500;
const TAX_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

export function startTaxScheduler(client) {
  console.log(`🏦 Tax scheduler started — $${TAX_AMOUNT.toLocaleString()} every 3 days.`);
  setInterval(async () => { await collectTax(client); }, TAX_INTERVAL_MS);
}

async function collectTax(client) {
  console.log('🏦 Collecting tax from all users...');
  // ✅ Fix: getAllUsers is async — must await it
  const users = await getAllUsers();

  for (const user of users) {
    const userId  = user.discord_id;
    const balance = user.balance || 0;
    if (balance <= 0) continue;
    const deducted = Math.min(balance, TAX_AMOUNT);
    await deductBalance(userId, deducted);

    try {
      const discordUser = await client.users.fetch(userId).catch(() => null);
      if (!discordUser) continue;
      const embed = new EmbedBuilder()
        .setColor(0xff4400)
        .setTitle('🏦 Tax Collected')
        .setDescription(
          `**$${deducted.toLocaleString()}** has been deducted from your wallet.\n\n` +
          `**Reason:** Automatic 3-Day Tax.\n\n` +
          `💰 Remaining balance: **$${(balance - deducted).toLocaleString()}**`,
        )
        .setFooter({ text: 'Ciyaal Xamar Economy' });
      await discordUser.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      console.error(`Tax DM failed for ${userId}:`, err.message);
    }
  }
  console.log('🏦 Tax collection complete.');
}
