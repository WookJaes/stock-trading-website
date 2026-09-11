export type CsvHolding = {
  code: string;
  name: string;
  market: string;
  quantity: number;
  availableQuantity: number;
  averagePrice: number;
  currentPrice: number;
  evaluationAmount: number;
  profitLoss: number;
  profitRate: number;
  currency: 'KRW' | 'USD';
};

const headers = [
  '종목코드',
  '종목명',
  '시장',
  '통화',
  '보유수량',
  '주문가능수량',
  '평균단가',
  '현재가',
  '평가금액',
  '평가손익',
  '수익률(%)',
] as const;

function textCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export function createHoldingsCsv(holdings: CsvHolding[]) {
  const rows = holdings.map((holding) =>
    [
      textCell(holding.code),
      textCell(holding.name),
      textCell(holding.market),
      holding.currency,
      holding.quantity,
      holding.availableQuantity,
      holding.averagePrice,
      holding.currentPrice,
      holding.evaluationAmount,
      holding.profitLoss,
      holding.profitRate,
    ].join(','),
  );

  return `\uFEFF${headers.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`;
}
