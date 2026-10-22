import { PRICING_TIERS } from './constants';

// Graduated pricing calculation - different rates apply to different provider ranges
// 1-10: $199/each, 11-20: $149/each, 21+: $99/each
export const calculateEstimatedPrice = (providerCount) => {
  if (!providerCount || providerCount <= 0) {
    return {
      providerCount: 0,
      totalMonthly: 0,
      breakdown: [],
      description: 'No active providers',
    };
  }

  const breakdown = [];
  let totalMonthly = 0;

  // Tier 1: First 10 providers at $199 each
  const tier1Count = Math.min(providerCount, 10);
  if (tier1Count > 0) {
    const tier1Cost = tier1Count * PRICING_TIERS.TIER_1.pricePerProvider;
    totalMonthly += tier1Cost;
    breakdown.push({
      tier: PRICING_TIERS.TIER_1.displayName,
      count: tier1Count,
      rate: PRICING_TIERS.TIER_1.pricePerProvider,
      subtotal: tier1Cost,
    });
  }

  // Tier 2: Providers 11-20 at $149 each
  if (providerCount > 10) {
    const tier2Count = Math.min(providerCount - 10, 10);
    const tier2Cost = tier2Count * PRICING_TIERS.TIER_2.pricePerProvider;
    totalMonthly += tier2Cost;
    breakdown.push({
      tier: PRICING_TIERS.TIER_2.displayName,
      count: tier2Count,
      rate: PRICING_TIERS.TIER_2.pricePerProvider,
      subtotal: tier2Cost,
    });
  }

  // Tier 3: Providers 21+ at $99 each
  if (providerCount > 20) {
    const tier3Count = providerCount - 20;
    const tier3Cost = tier3Count * PRICING_TIERS.TIER_3.pricePerProvider;
    totalMonthly += tier3Cost;
    breakdown.push({
      tier: PRICING_TIERS.TIER_3.displayName,
      count: tier3Count,
      rate: PRICING_TIERS.TIER_3.pricePerProvider,
      subtotal: tier3Cost,
    });
  }

  const breakdownText = breakdown.map((b) => `${b.count} × $${b.rate}`).join(' + ');

  return {
    providerCount,
    totalMonthly,
    breakdown,
    breakdownText: `${breakdownText} = $${totalMonthly.toLocaleString()}/month`,
    description: `Graduated pricing for ${providerCount} provider${providerCount > 1 ? 's' : ''}`,
  };
};

export const getAllPricingTiers = () =>
  Object.values(PRICING_TIERS).map((tier) => ({
    name: tier.displayName,
    minProviders: tier.minProviders,
    maxProviders: tier.maxProviders === Infinity ? 'Unlimited' : tier.maxProviders,
    pricePerProvider: tier.pricePerProvider,
    description: tier.description,
    // prettier-ignore
    example:
      tier.maxProviders === Infinity
        ? `60 providers = 60 × $${tier.pricePerProvider} = $${(60 * tier.pricePerProvider).toLocaleString()}/month`
        : `${tier.minProviders} providers = ${tier.minProviders} × $${tier.pricePerProvider} = $${(tier.minProviders * tier.pricePerProvider).toLocaleString()}/month`,
  }));

// Get the rate for the next provider based on graduated pricing
const getRateForProvider = (providerNumber) => {
  if (providerNumber <= 10) {
    return PRICING_TIERS.TIER_1.pricePerProvider;
  }
  if (providerNumber <= 20) {
    return PRICING_TIERS.TIER_2.pricePerProvider;
  }
  return PRICING_TIERS.TIER_3.pricePerProvider;
};

export const calculateAddProviderImpact = (currentProviderCount) => {
  const currentPricing = calculateEstimatedPrice(currentProviderCount);
  const newPricing = calculateEstimatedPrice(currentProviderCount + 1);

  const newProviderRate = getRateForProvider(currentProviderCount + 1);
  const priceDifference = newPricing.totalMonthly - currentPricing.totalMonthly;

  return {
    currentProviderCount,
    newProviderCount: currentProviderCount + 1,
    currentMonthly: currentPricing.totalMonthly,
    newMonthly: newPricing.totalMonthly,
    monthlyIncrease: priceDifference,
    newProviderRate,
    message: `Adding provider #${
      currentProviderCount + 1
    } will cost $${newProviderRate}/month. Your new monthly total will be $${newPricing.totalMonthly.toLocaleString()}.`,
  };
};

export const calculateRemoveProviderImpact = (currentProviderCount) => {
  if (currentProviderCount <= 0) {
    return {
      error: 'No providers to remove',
    };
  }

  const currentPricing = calculateEstimatedPrice(currentProviderCount);
  const newPricing = calculateEstimatedPrice(currentProviderCount - 1);

  const removedProviderRate = getRateForProvider(currentProviderCount);
  const priceDifference = currentPricing.totalMonthly - newPricing.totalMonthly;

  return {
    currentProviderCount,
    newProviderCount: currentProviderCount - 1,
    currentMonthly: currentPricing.totalMonthly,
    newMonthly: newPricing.totalMonthly,
    monthlyDecrease: priceDifference,
    removedProviderRate,
    message: `Removing provider #${currentProviderCount} will save $${removedProviderRate}/month. Your new monthly total will be $${newPricing.totalMonthly.toLocaleString()}.`,
  };
};
