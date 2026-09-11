'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { quantityForBudget } from '@/lib/order-quantity';

const krwBudgets = [100_000, 500_000, 1_000_000] as const;

export function OrderQuantityControls({
  quantity,
  unitPrice,
  currency,
  maximum,
  onChange,
}: {
  quantity: string;
  unitPrice: number;
  currency: 'KRW' | 'USD';
  maximum?: number;
  onChange: (quantity: string) => void;
}) {
  const [usdBudget, setUsdBudget] = useState('');
  const numericQuantity = Number(quantity);
  const normalizedQuantity =
    Number.isInteger(numericQuantity) && numericQuantity > 0
      ? numericQuantity
      : 1;
  const applyBudget = (budget: number) => {
    const calculated = quantityForBudget(budget, unitPrice);
    const limited =
      maximum === undefined ? calculated : Math.min(calculated, maximum);
    if (limited > 0) onChange(String(limited));
  };

  return (
    <fieldset className="mt-4">
      <legend className="text-xs font-semibold text-slate-600">주문수량</legend>
      <div className="mt-2 grid grid-cols-[2.75rem_1fr_2.75rem] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={() => onChange(String(Math.max(1, normalizedQuantity - 1)))}
          disabled={normalizedQuantity <= 1}
          className="grid h-11 place-items-center border-r border-slate-200 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="주문수량 1 감소"
        >
          <Minus className="size-4" />
        </button>
        <input
          aria-label="주문수량"
          type="number"
          min="1"
          max={maximum}
          step="1"
          value={quantity}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 min-w-0 bg-transparent px-3 text-center text-sm font-semibold tabular-nums outline-none"
        />
        <button
          type="button"
          onClick={() =>
            onChange(
              String(
                maximum === undefined
                  ? normalizedQuantity + 1
                  : Math.min(normalizedQuantity + 1, maximum),
              ),
            )
          }
          disabled={maximum !== undefined && normalizedQuantity >= maximum}
          className="grid h-11 place-items-center border-l border-slate-200 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="주문수량 1 증가"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {currency === 'KRW' ? (
        <div
          className="mt-2 grid grid-cols-3 gap-2"
          aria-label="원화 예산으로 수량 계산"
        >
          {krwBudgets.map((budget) => (
            <button
              key={budget}
              type="button"
              onClick={() => applyBudget(budget)}
              disabled={quantityForBudget(budget, unitPrice) < 1}
              className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {budget / 10_000}만원
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">USD 예산</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={usdBudget}
                onChange={(event) => setUsdBudget(event.target.value)}
                placeholder="예산 직접 입력"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 pr-12 text-sm outline-none focus:border-emerald-700"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                USD
              </span>
            </label>
            <button
              type="button"
              onClick={() => applyBudget(Number(usdBudget))}
              disabled={quantityForBudget(Number(usdBudget), unitPrice) < 1}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              수량 계산
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            환율을 적용하지 않고 입력한 USD 예산으로 계산합니다.
          </p>
        </div>
      )}
    </fieldset>
  );
}
