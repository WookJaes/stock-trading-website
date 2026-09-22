'use client';

import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Download,
  Info,
  LoaderCircle,
  Search,
  TrendingDown,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ExcludedStockList,
  MarketTimeRange,
  SettingToggle,
  StrategyMarketTabs,
} from '@/components/strategy-controls';
import {
  chartCandleOptions,
  defaultStrategySettings,
  parseStrategySettings,
  serializeStrategySettings,
  STRATEGY_SETTINGS_STORAGE_KEY,
  validateMarketTimeRange,
  validateMovingAveragePeriods,
  writeStrategySettings,
  type ExcludedStock,
  type DeadCrossMarketSettings,
  type StrategyMarket,
  type StrategySettings,
} from '@/lib/strategy-settings';
import type { KiwoomEnvironment } from '@/lib/kiwoom-environment';

type Stock = ExcludedStock & {
  sector?: string;
  isEtf?: boolean;
  status?: string;
};
type SearchData = { results: Stock[]; total: number };
const strategySettingsEvent = 'portfolio-desk-strategy-settings-change';
const defaultSettingsText = serializeStrategySettings(defaultStrategySettings);

function subscribeStrategySettings(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STRATEGY_SETTINGS_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(strategySettingsEvent, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(strategySettingsEvent, onStoreChange);
  };
}

function getStrategySettingsSnapshot() {
  return (
    window.localStorage.getItem(STRATEGY_SETTINGS_STORAGE_KEY) ??
    defaultSettingsText
  );
}

async function searchStocks(
  environment: KiwoomEnvironment,
  search: string,
): Promise<SearchData> {
  const response = await fetch(
    `/api/stocks?environment=${environment}&q=${encodeURIComponent(search)}`,
    { headers: { Accept: 'application/json' } },
  );
  const payload = (await response.json()) as SearchData & { message?: string };
  if (!response.ok)
    throw new Error(payload.message || '종목을 검색하지 못했습니다.');
  return payload;
}

function availableMarkets(environment: KiwoomEnvironment): StrategyMarket[] {
  if (environment.endsWith('-live')) return ['domestic', 'overseas'];
  return environment.startsWith('domestic-') ? ['domestic'] : ['overseas'];
}

function environmentMarket(environment: KiwoomEnvironment): StrategyMarket {
  return environment.startsWith('domestic-') ? 'domestic' : 'overseas';
}

function periodValue(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function DeadCrossSettings({
  environment,
  onEnvironmentChange,
}: {
  environment: KiwoomEnvironment;
  onEnvironmentChange: (environment: KiwoomEnvironment) => void;
}) {
  const settingsText = useSyncExternalStore(
    subscribeStrategySettings,
    getStrategySettingsSnapshot,
    () => defaultSettingsText,
  );
  const settings =
    parseStrategySettings(settingsText) ?? defaultStrategySettings;
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [importText, setImportText] = useState('');
  const [importMessage, setImportMessage] = useState<
    { type: 'success' | 'error'; text: string } | undefined
  >();
  const [copied, setCopied] = useState(false);
  const market = environmentMarket(environment);
  const markets = availableMarkets(environment);
  const marketSettings = settings.strategies.deadCross[market];
  const exportedText = serializeStrategySettings(settings);
  const query = useQuery({
    queryKey: ['dead-cross-excluded-stock-search', environment, searchTerm],
    queryFn: () => searchStocks(environment, searchTerm),
    enabled: searchTerm.length > 0,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  function saveSettings(next: StrategySettings) {
    writeStrategySettings(window.localStorage, next);
    window.dispatchEvent(new Event(strategySettingsEvent));
  }

  function changeMarket(next: StrategyMarket) {
    if (!markets.includes(next)) return;
    if (environment.endsWith('-live'))
      onEnvironmentChange(
        next === 'domestic' ? 'domestic-live' : 'overseas-live',
      );
    setSearchInput('');
    setSearchTerm('');
  }

  function updateMarket(
    updater: (current: DeadCrossMarketSettings) => DeadCrossMarketSettings,
  ) {
    saveSettings({
      ...settings,
      strategies: {
        ...settings.strategies,
        deadCross: {
          ...settings.strategies.deadCross,
          [market]: updater(settings.strategies.deadCross[market]),
        },
      },
    });
  }

  function addExcludedStock(stock: Stock) {
    updateMarket((current) => {
      const exists = current.excludedStocks.some(
        (item) => item.code === stock.code && item.market === stock.market,
      );
      if (exists) return current;
      return {
        ...current,
        excludedStocks: [
          ...current.excludedStocks,
          {
            code: stock.code,
            name: stock.name,
            market: stock.market,
            ...(stock.englishName ? { englishName: stock.englishName } : {}),
          },
        ],
      };
    });
  }

  function importSettings() {
    const parsed = parseStrategySettings(importText);
    if (!parsed) {
      setImportMessage({
        type: 'error',
        text: 'JSON 형식이나 설정값을 확인해 주세요.',
      });
      return;
    }
    saveSettings(parsed);
    setImportText('');
    setImportMessage({
      type: 'success',
      text: '전체 전략 설정을 가져왔습니다.',
    });
  }

  async function copySettings() {
    try {
      await navigator.clipboard.writeText(exportedText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const inputClass =
    'mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold tabular-nums outline-none focus:border-emerald-700 focus:ring-3 focus:ring-emerald-100';

  return (
    <section>
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
          <TrendingDown className="size-3.5" />
          자동매도 전략
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          데드크로스
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          단기 이동평균선의 장기 이동평균선 하향 돌파 조건을 구성합니다.
        </p>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:p-5">
        <StrategyMarketTabs
          market={market}
          availableMarkets={markets}
          onChange={changeMarket}
        />
      </div>

      <div className="mb-5 flex gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          완료된 봉의 종가로 단순 이동평균을 계산합니다. 단기 이동평균이 장기
          이동평균을 하향 돌파하면 매도 가능 수량 전량을 시장가로 매도합니다.
          현재는 설정 인터페이스만 제공하며 자동매도는 실행되지 않습니다.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.72fr)]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="mb-5">
              <h2 className="font-bold">실행 조건</h2>
              <p className="mt-1 text-xs text-slate-500">
                {market === 'domestic' ? '국내' : '해외'} 보유 종목에 적용할
                기본 조건입니다.
              </p>
            </div>
            <SettingToggle
              label="데드크로스 기능"
              description="향후 자동매도 엔진 연결 시 이 설정으로 기능을 활성화합니다."
              checked={marketSettings.enabled}
              onChange={(enabled) =>
                updateMarket((current) => ({ ...current, enabled }))
              }
            />
            <div className="mt-6">
              <MarketTimeRange
                market={market}
                startTime={marketSettings.startTime}
                endTime={marketSettings.endTime}
                onChange={({ startTime, endTime }) => {
                  if (!validateMarketTimeRange(market, startTime, endTime))
                    return;
                  updateMarket((current) => ({
                    ...current,
                    startTime,
                    endTime,
                  }));
                }}
              />
            </div>
            <div className="mt-6">
              <label className="text-sm font-bold text-slate-800">
                봉 주기
                <select
                  value={marketSettings.candle}
                  onChange={(event) =>
                    updateMarket((current) => ({
                      ...current,
                      candle: event.target
                        .value as DeadCrossMarketSettings['candle'],
                    }))
                  }
                  className={inputClass}
                >
                  {chartCandleOptions[market].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} · {option.apiId}
                    </option>
                  ))}
                </select>
                <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
                  키움 차트 명세에서 확인된 봉만 제공합니다. 미국 분봉 단위는
                  공식 예시에 확인된 1분만 선택할 수 있습니다.
                </span>
              </label>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-800">
                단기 이동평균 기간
                <input
                  type="number"
                  min="1"
                  max={marketSettings.longPeriod - 1}
                  step="1"
                  value={marketSettings.shortPeriod}
                  onChange={(event) => {
                    const shortPeriod = periodValue(event.target.value);
                    if (
                      shortPeriod === null ||
                      !validateMovingAveragePeriods(
                        shortPeriod,
                        marketSettings.longPeriod,
                      )
                    )
                      return;
                    updateMarket((current) => ({ ...current, shortPeriod }));
                  }}
                  className={inputClass}
                />
                <span className="mt-1.5 block text-xs font-normal text-slate-500">
                  완료된 봉 개수 · 장기 기간보다 작게 설정
                </span>
              </label>
              <label className="text-sm font-bold text-slate-800">
                장기 이동평균 기간
                <input
                  type="number"
                  min={marketSettings.shortPeriod + 1}
                  step="1"
                  value={marketSettings.longPeriod}
                  onChange={(event) => {
                    const longPeriod = periodValue(event.target.value);
                    if (
                      longPeriod === null ||
                      !validateMovingAveragePeriods(
                        marketSettings.shortPeriod,
                        longPeriod,
                      )
                    )
                      return;
                    updateMarket((current) => ({ ...current, longPeriod }));
                  }}
                  className={inputClass}
                />
                <span className="mt-1.5 block text-xs font-normal leading-5 text-slate-500">
                  완료된 봉 개수 · 차트 명세에 최대 조회 봉 수가 없어 임의의
                  상한은 적용하지 않음
                </span>
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="mb-4">
              <h2 className="font-bold">제외종목</h2>
              <p className="mt-1 text-xs text-slate-500">
                자동매도 조건에서 제외할 종목을 검색해 추가합니다.
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = searchInput.trim();
                if (value) setSearchTerm(value);
              }}
              className="flex gap-2"
            >
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">제외종목 검색</span>
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={
                    market === 'domestic'
                      ? '종목명 또는 코드'
                      : '종목명 또는 티커'
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-emerald-700 focus:bg-white focus:ring-3 focus:ring-emerald-100"
                />
              </label>
              <button
                type="submit"
                disabled={!searchInput.trim() || query.isFetching}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-900 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {query.isFetching ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Search className="size-4" />
                )}
                검색
              </button>
            </form>

            {query.isError && (
              <p className="mt-3 flex gap-2 text-sm text-amber-800">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {query.error.message}
              </p>
            )}
            {query.data && searchTerm && (
              <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                {query.data.results.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-slate-400">
                    검색 결과가 없습니다.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {query.data.results.slice(0, 10).map((stock) => {
                      const added = marketSettings.excludedStocks.some(
                        (item) =>
                          item.code === stock.code &&
                          item.market === stock.market,
                      );
                      return (
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
                            disabled={added}
                            onClick={() => addExcludedStock(stock)}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:border-emerald-100 disabled:bg-emerald-50 disabled:text-emerald-700"
                          >
                            {added ? '추가됨' : '추가'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">
                등록 {marketSettings.excludedStocks.length}개
              </p>
              {marketSettings.excludedStocks.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    updateMarket((current) => ({
                      ...current,
                      excludedStocks: [],
                    }))
                  }
                  className="flex items-center gap-1.5 text-xs font-semibold text-rose-700"
                >
                  <Trash2 className="size-3.5" />
                  전체 삭제
                </button>
              )}
            </div>
            <div className="mt-3">
              <ExcludedStockList
                stocks={marketSettings.excludedStocks}
                onRemove={(stock) =>
                  updateMarket((current) => ({
                    ...current,
                    excludedStocks: current.excludedStocks.filter(
                      (item) =>
                        item.code !== stock.code ||
                        item.market !== stock.market,
                    ),
                  }))
                }
              />
            </div>
          </section>
        </div>

        <section className="self-start rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] xl:sticky xl:top-24">
          <div className="mb-5">
            <h2 className="font-bold">전체 전략 설정</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              향후 추가되는 전략도 같은 JSON의 strategies 아래에 함께 저장할 수
              있습니다.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="strategy-export"
              className="text-sm font-bold text-slate-800"
            >
              내보내기
            </label>
            <button
              type="button"
              onClick={copySettings}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800"
            >
              {copied ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Clipboard className="size-3.5" />
              )}
              {copied ? '복사됨' : '텍스트 복사'}
            </button>
          </div>
          <textarea
            id="strategy-export"
            readOnly
            value={exportedText}
            rows={12}
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-600 outline-none"
          />
          <div className="mt-6 flex items-center gap-2 text-sm font-bold text-slate-800">
            <Upload className="size-4 text-emerald-800" />
            가져오기
          </div>
          <textarea
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setImportMessage(undefined);
            }}
            rows={7}
            placeholder="전체 전략 설정 JSON을 붙여 넣으세요."
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 outline-none focus:border-emerald-700 focus:ring-3 focus:ring-emerald-100"
          />
          <button
            type="button"
            disabled={!importText.trim()}
            onClick={importSettings}
            className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Download className="size-4" />
            전체 설정 가져오기
          </button>
          {importMessage && (
            <output
              className={`mt-3 text-xs ${importMessage.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}
            >
              {importMessage.text}
            </output>
          )}
        </section>
      </div>
    </section>
  );
}
