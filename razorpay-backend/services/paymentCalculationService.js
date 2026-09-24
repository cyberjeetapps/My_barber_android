/**
 * Payment Calculation Service
 * 
 * Computes platform and owner splits with deterministic 2-decimal rounding.
 * Guardrails against fractional paisa discrepancies.
 */

const PLATFORM_PERCENTAGE = 10;
const OWNER_PERCENTAGE = 90;

/**
 * Calculates 10% platform and 90% owner split for a given total amount.
 * @param {number} totalAmount - The total service charge in INR
 * @returns {{ totalAmount: number, platformPercentage: number, platformAmount: number, ownerPercentage: number, ownerAmount: number }}
 */
function calculateSplit(totalAmount) {
  const numericTotal = Number(totalAmount);
  if (isNaN(numericTotal) || numericTotal <= 0) {
    throw new Error(`Invalid total amount for split calculation: ${totalAmount}`);
  }

  // Calculate platform amount (10%) rounded to 2 decimals
  const platformAmount = Math.round(numericTotal * (PLATFORM_PERCENTAGE / 100) * 100) / 100;
  
  // Calculate owner amount as total minus platform amount to guarantee total integrity
  const ownerAmount = Math.round((numericTotal - platformAmount) * 100) / 100;

  return {
    totalAmount: numericTotal,
    platformPercentage: PLATFORM_PERCENTAGE,
    platformAmount,
    ownerPercentage: OWNER_PERCENTAGE,
    ownerAmount
  };
}

module.exports = {
  PLATFORM_PERCENTAGE,
  OWNER_PERCENTAGE,
  calculateSplit
};
