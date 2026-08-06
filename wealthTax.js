// Wealth Tax System
// One-time tax when player reaches wealth thresholds

const TAX_TIERS = [
  { threshold: 100000, tax: 5000 },
  { threshold: 200000, tax: 7000 },
  { threshold: 300000, tax: 10000 },
  { threshold: 400000, tax: 12000 },
  { threshold: 500000, tax: 18000 },
  { threshold: 600000, tax: 25000 },
  { threshold: 700000, tax: 32000 },
  { threshold: 800000, tax: 40000 },
  { threshold: 900000, tax: 50000 },
  { threshold: 1000000, tax: 60000 },
];

// Generate tax tiers up to any amount
function generateTaxTiers(maxAmount) {
  const tiers = [...TAX_TIERS];
  let current = 1000000;
  
  while (current < maxAmount) {
    current += 100000;
    tiers.push({
      threshold: current,
      tax: current / 10, // 10% of threshold
    });
  }
  
  return tiers;
}

// Get the next tax tier for a player based on their current wealth
function getNextTaxTier(totalWealth, currentTaxLevel) {
  const tiers = generateTaxTiers(totalWealth + 1000000);
  
  for (const tier of tiers) {
    if (tier.threshold > currentTaxLevel && totalWealth >= tier.threshold) {
      return tier;
    }
  }
  
  return null;
}

// Calculate if player should be taxed and return tax amount
function calculateWealthTax(totalWealth, currentTaxLevel) {
  const nextTier = getNextTaxTier(totalWealth, currentTaxLevel);
  
  if (nextTier) {
    return {
      shouldTax: true,
      taxAmount: nextTier.tax,
      newTaxLevel: nextTier.threshold,
      tier: nextTier.threshold,
    };
  }
  
  return {
    shouldTax: false,
    taxAmount: 0,
    newTaxLevel: currentTaxLevel,
  };
}

// High roller risk: 70% loss, 30% win for 1M+ players
function applyHighRollerRisk(amount, totalWealth) {
  if (totalWealth >= 1000000) {
    const rand = Math.random();
    if (rand < 0.7) {
      // 70% chance to lose
      return {
        win: false,
        multiplier: 0, // Lose the amount
      };
    } else {
      // 30% chance to win
      return {
        win: true,
        multiplier: 2, // Win 2x
      };
    }
  }
  
  return {
    win: null, // No high roller risk applied
    multiplier: null,
  };
}

export {
  TAX_TIERS,
  generateTaxTiers,
  getNextTaxTier,
  calculateWealthTax,
  applyHighRollerRisk,
};
