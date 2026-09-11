export function quantityForBudget(budget: number, unitPrice: number) {
  if (
    !Number.isFinite(budget) ||
    !Number.isFinite(unitPrice) ||
    budget <= 0 ||
    unitPrice <= 0
  )
    return 0;
  return Math.floor(budget / unitPrice);
}
