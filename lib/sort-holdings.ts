export type HoldingSortKey =
  | 'name'
  | 'evaluationAmount'
  | 'profitLoss'
  | 'profitRate';
export type SortDirection = 'asc' | 'desc';

export function sortHoldings<T extends Record<HoldingSortKey, string | number>>(
  holdings: readonly T[],
  key: HoldingSortKey,
  direction: SortDirection,
) {
  const multiplier = direction === 'asc' ? 1 : -1;

  return holdings
    .map((holding, index) => ({ holding, index }))
    .sort((left, right) => {
      const leftValue = left.holding[key];
      const rightValue = right.holding[key];
      const comparison =
        typeof leftValue === 'string' && typeof rightValue === 'string'
          ? leftValue.localeCompare(rightValue, 'ko-KR')
          : Number(leftValue) - Number(rightValue);

      return comparison === 0
        ? left.index - right.index
        : comparison * multiplier;
    })
    .map(({ holding }) => holding);
}
