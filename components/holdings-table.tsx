'use client';

import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import {
  sortHoldings,
  type HoldingSortKey,
  type SortDirection,
} from '@/lib/sort-holdings';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type HoldingRow = {
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

const sortableColumns: {
  key: HoldingSortKey;
  label: string;
  className?: string;
}[] = [
  { key: 'name', label: '종목', className: 'pl-5' },
  { key: 'evaluationAmount', label: '평가금액' },
  { key: 'profitLoss', label: '손익' },
  { key: 'profitRate', label: '수익률' },
];

function money(value: number, currency: 'KRW' | 'USD') {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KRW' ? 0 : 2,
  }).format(value);
}

function number(value: number, digits = 0) {
  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: digits,
  }).format(value);
}

function Change({ value, suffix = '' }: { value: number; suffix?: string }) {
  const tone =
    value > 0
      ? 'text-rose-600'
      : value < 0
        ? 'text-blue-600'
        : 'text-slate-600';
  return (
    <span className={`font-semibold tabular-nums ${tone}`}>
      {value > 0 ? '+' : ''}
      {number(value, 2)}
      {suffix}
    </span>
  );
}

function SortButton({
  column,
  activeKey,
  direction,
  onSort,
}: {
  column: (typeof sortableColumns)[number];
  activeKey: HoldingSortKey | null;
  direction: SortDirection;
  onSort: (key: HoldingSortKey) => void;
}) {
  const active = activeKey === column.key;
  const Icon = active
    ? direction === 'asc'
      ? ArrowUp
      : ArrowDown
    : ChevronsUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(column.key)}
      className={`inline-flex items-center gap-1 rounded px-1 py-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700 ${active ? 'text-emerald-800' : ''}`}
      aria-label={`${column.label} ${active && direction === 'asc' ? '내림차순' : '오름차순'} 정렬`}
      aria-pressed={active}
    >
      <span>{column.label}</span>
      <Icon className="size-3.5" aria-hidden="true" />
    </button>
  );
}

export function HoldingsTable({
  holdings,
  readOnly,
  onSell,
}: {
  holdings: HoldingRow[];
  readOnly: boolean;
  onSell: (holding: HoldingRow) => void;
}) {
  const [sortKey, setSortKey] = useState<HoldingSortKey | null>(null);
  const [direction, setDirection] = useState<SortDirection>('asc');
  const sortedHoldings = useMemo(
    () => (sortKey ? sortHoldings(holdings, sortKey, direction) : holdings),
    [holdings, sortKey, direction],
  );
  const handleSort = (key: HoldingSortKey) => {
    if (sortKey === key)
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setDirection('asc');
    }
  };
  const sortColumn = (key: HoldingSortKey) =>
    sortableColumns.find((column) => column.key === key)!;

  return (
    <Table>
      <TableHeader className="bg-slate-50/80">
        <TableRow className="hover:bg-slate-50/80">
          <TableHead className="h-11 pl-4 text-xs text-slate-500">
            <SortButton
              column={sortColumn('name')}
              activeKey={sortKey}
              direction={direction}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead className="text-right text-xs text-slate-500">
            보유 / 가능
          </TableHead>
          <TableHead className="text-right text-xs text-slate-500">
            평균단가
          </TableHead>
          <TableHead className="text-right text-xs text-slate-500">
            현재가
          </TableHead>
          <TableHead className="text-right text-xs text-slate-500">
            <SortButton
              column={sortColumn('evaluationAmount')}
              activeKey={sortKey}
              direction={direction}
              onSort={handleSort}
            />
          </TableHead>
          <TableHead className="text-right text-xs text-slate-500">
            <span className="inline-flex flex-col items-end gap-0.5">
              <SortButton
                column={sortColumn('profitLoss')}
                activeKey={sortKey}
                direction={direction}
                onSort={handleSort}
              />
              <SortButton
                column={sortColumn('profitRate')}
                activeKey={sortKey}
                direction={direction}
                onSort={handleSort}
              />
            </span>
          </TableHead>
          <TableHead className="pr-5 text-right text-xs text-slate-500">
            주문
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedHoldings.map((holding) => (
          <TableRow key={`${holding.market}-${holding.code}`}>
            <TableCell className="py-4 pl-5">
              <div className="font-semibold text-slate-800">{holding.name}</div>
              <div className="mt-1 text-[11px] text-slate-400">
                {holding.code} · {holding.market}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {number(holding.quantity, 4)}{' '}
              <span className="text-slate-300">/</span>{' '}
              {number(holding.availableQuantity, 4)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {money(holding.averagePrice, holding.currency)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {money(holding.currentPrice, holding.currency)}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">
              {money(holding.evaluationAmount, holding.currency)}
            </TableCell>
            <TableCell className="text-right">
              <Change value={holding.profitLoss} />
              <div className="mt-1 text-[11px]">
                <Change value={holding.profitRate} suffix="%" />
              </div>
            </TableCell>
            <TableCell className="pr-5 text-right">
              {readOnly ? (
                <span className="text-xs font-semibold text-slate-400">
                  조회 전용
                </span>
              ) : (
                <button
                  type="button"
                  disabled={holding.availableQuantity <= 0}
                  onClick={() => onSell(holding)}
                  className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  매도
                </button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
