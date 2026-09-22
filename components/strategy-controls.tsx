'use client';

import { X } from 'lucide-react';
import type { ExcludedStock, StrategyMarket } from '@/lib/strategy-settings';
import { marketSessions } from '@/lib/strategy-settings';

export function StrategyMarketTabs({
  market,
  availableMarkets,
  onChange,
}: {
  market: StrategyMarket;
  availableMarkets: StrategyMarket[];
  onChange: (market: StrategyMarket) => void;
}) {
  return (
    <div className="flex gap-2" aria-label="전략 시장">
      {(Object.keys(marketSessions) as StrategyMarket[]).map((item) => {
        const enabled = availableMarkets.includes(item);
        const selected = market === item;
        return (
          <button
            key={item}
            type="button"
            disabled={!enabled}
            aria-pressed={selected}
            onClick={() => enabled && onChange(item)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${selected ? 'bg-emerald-900 text-white' : enabled ? 'bg-slate-100 text-slate-600 hover:bg-slate-200' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}
          >
            {marketSessions[item].label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-slate-800">{label}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${label} ${checked ? '끄기' : '켜기'}`}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? 'bg-emerald-800' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-1 size-5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}

export function MarketTimeRange({
  market,
  startTime,
  endTime,
  onChange,
}: {
  market: StrategyMarket;
  startTime: string;
  endTime: string;
  onChange: (value: { startTime: string; endTime: string }) => void;
}) {
  const session = marketSessions[market];
  const inputClass =
    'mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums outline-none focus:border-emerald-700 focus:ring-3 focus:ring-emerald-100';
  return (
    <fieldset>
      <legend className="text-sm font-bold text-slate-800">실행 시간</legend>
      <p className="mt-1 text-xs text-slate-500">
        {session.timeZone} · 정규장 {session.open}–{session.close}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-600">
          시작시간
          <input
            type="time"
            min={session.open}
            max={session.close}
            step="60"
            value={startTime}
            onChange={(event) =>
              onChange({ startTime: event.target.value, endTime })
            }
            className={inputClass}
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          종료시간
          <input
            type="time"
            min={session.open}
            max={session.close}
            step="60"
            value={endTime}
            onChange={(event) =>
              onChange({ startTime, endTime: event.target.value })
            }
            className={inputClass}
          />
        </label>
      </div>
    </fieldset>
  );
}

export function ExcludedStockList({
  stocks,
  onRemove,
}: {
  stocks: ExcludedStock[];
  onRemove: (stock: ExcludedStock) => void;
}) {
  if (stocks.length === 0)
    return (
      <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
        제외된 종목이 없습니다.
      </p>
    );
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {stocks.map((stock) => (
        <li
          key={`${stock.market}:${stock.code}`}
          className="flex items-center gap-3 px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-800">
              {stock.name || stock.englishName || stock.code}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              {stock.code} · {stock.market}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(stock)}
            aria-label={`${stock.name || stock.code} 제외종목에서 삭제`}
            className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"
          >
            <X className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
