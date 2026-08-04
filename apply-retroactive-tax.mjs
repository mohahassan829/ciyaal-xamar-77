import 'dotenv/config';
import db from './db.js';
import { calculateWealthTax } from './wealthTax.js';

async function applyRetroactiveTax() {
  console.log('🏛️ Applying retroactive wealth tax to existing players...');
  
  try {
    const users = await db.getAllUsers();
    let taxedCount = 0;
    let totalTaxed = 0;
    
    for (const user of users) {
      const totalWealth = parseInt(user.wallet || 0) + parseInt(user.bank || 0);
      const currentTaxLevel = user.wealthTaxLevel || 0;
      
      if (totalWealth > 0) {
        const taxInfo = calculateWealthTax(totalWealth, currentTaxLevel);
        
        if (taxInfo.shouldTax) {
          // Apply the tax
          await db.removeWallet(user.userId, taxInfo.taxAmount);
          await db.updateWealthTaxLevel(user.userId, taxInfo.newTaxLevel);
          await db.logWealthTax(user.userId, user.username, taxInfo.tier, taxInfo.taxAmount);
          
          taxedCount++;
          totalTaxed += taxInfo.taxAmount;
          
          console.log(`✅ ${user.username} (${user.userId}): Wealth $${totalWealth.toLocaleString()} → Taxed $${taxInfo.taxAmount.toLocaleString()} at tier $${taxInfo.tier.toLocaleString()}`);
        }
      }
    }
    
    console.log(`\n📊 Retroactive Tax Summary:`);
    console.log(`   Players taxed: ${taxedCount}`);
    console.log(`   Total taxed: $${totalTaxed.toLocaleString()}`);
    console.log(`✅ Retroactive wealth tax applied successfully!`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error applying retroactive tax:', error);
    process.exit(1);
  }
}

applyRetroactiveTax();
