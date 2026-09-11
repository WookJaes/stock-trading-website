'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Star, Trash2 } from 'lucide-react';
import type { TradeStock } from '@/components/stock-trade-panel';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  readWatchlist,
  toggleWatchlist,
  WATCHLIST_STORAGE_KEY,
  watchlistStockKey,
  writeWatchlist,
  type WatchlistStock,
} from '@/lib/watchlist';

const WATCHLIST_CHANGE_EVENT = 'portfolio-desk:watchlist-change';

type WatchlistContextValue = {
  stocks: WatchlistStock[];
  toggle: (stock: WatchlistStock) => void;
};
const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [stocks, setStocks] = useState<WatchlistStock[]>([]);

  useEffect(() => {
    const sync = () => setStocks(readWatchlist(window.localStorage));
    const syncStorage = (event: StorageEvent) => {
      if (event.key === WATCHLIST_STORAGE_KEY) sync();
    };
    sync();
    window.addEventListener('storage', syncStorage);
    window.addEventListener(WATCHLIST_CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener(WATCHLIST_CHANGE_EVENT, sync);
    };
  }, []);

  const toggle = useCallback((stock: WatchlistStock) => {
    const next = toggleWatchlist(readWatchlist(window.localStorage), stock);
    writeWatchlist(window.localStorage, next);
    window.dispatchEvent(new Event(WATCHLIST_CHANGE_EVENT));
  }, []);

  const value = useMemo(() => ({ stocks, toggle }), [stocks, toggle]);
  return <WatchlistContext value={value}>{children}</WatchlistContext>;
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context)
    throw new Error('useWatchlist must be used within WatchlistProvider.');
  return context;
}

export function WatchlistButton({ stock }: { stock: WatchlistStock }) {
  const { stocks, toggle } = useWatchlist();
  const selected = stocks.some(
    (item) => watchlistStockKey(item) === watchlistStockKey(stock),
  );
  const label = selected
    ? `${stock.name} 관심종목에서 삭제`
    : `${stock.name} 관심종목에 추가`;

  return (
    <button
      type="button"
      onClick={() => toggle(stock)}
      aria-label={label}
      title={label}
      aria-pressed={selected}
      className={`grid size-9 place-items-center rounded-lg transition focus-visible:outline-2 focus-visible:outline-emerald-700 ${selected ? 'bg-amber-50 text-amber-500 hover:bg-amber-100' : 'text-slate-400 hover:bg-slate-100 hover:text-amber-500'}`}
    >
      <Star className={`size-4 ${selected ? 'fill-current' : ''}`} />
    </button>
  );
}

export function WatchlistView({
  onSelect,
}: {
  onSelect: (stock: TradeStock) => void;
}) {
  const { stocks, toggle } = useWatchlist();

  return (
    <section>
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-emerald-800">
          <Star className="size-3.5" />
          관심종목
        </div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          내 관심종목
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          이 브라우저에 저장한 종목을 한곳에서 확인합니다.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold">저장된 종목</h2>
          <p className="mt-1 text-xs text-slate-500">
            총 {stocks.length}개 · 브라우저 로컬 저장
          </p>
        </div>
        {stocks.length === 0 ? (
          <div className="grid min-h-72 place-items-center px-6 text-center">
            <div>
              <Star className="mx-auto size-9 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-700">
                관심종목이 없습니다
              </p>
              <p className="mt-1 text-sm text-slate-400">
                종목 검색 또는 순위 화면의 별표를 눌러 추가해 보세요.
              </p>
            </div>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="pl-5">종목</TableHead>
                <TableHead>시장</TableHead>
                <TableHead className="w-20 pr-5 text-right">삭제</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stocks.map((stock) => (
                <TableRow key={watchlistStockKey(stock)}>
                  <TableCell className="py-2 pl-3">
                    <button
                      type="button"
                      onClick={() => onSelect(stock)}
                      className="w-full rounded-lg px-2 py-2 text-left hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
                    >
                      <div className="font-semibold text-slate-800">
                        {stock.name}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-400">
                        {stock.englishName ? `${stock.englishName} · ` : ''}
                        {stock.code}
                      </div>
                    </button>
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                      {stock.market}
                    </span>
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => toggle(stock)}
                      aria-label={`${stock.name} 관심종목에서 삭제`}
                      className="inline-grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-2 focus-visible:outline-rose-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}
