export const WATCHLIST_STORAGE_KEY = 'portfolio-desk.watchlist.v1';

export type WatchlistStock = {
  code: string;
  name: string;
  englishName?: string;
  market: string;
};

type StorageReader = Pick<Storage, 'getItem'>;
type StorageWriter = Pick<Storage, 'setItem'>;

export function watchlistStockKey(
  stock: Pick<WatchlistStock, 'code' | 'market'>,
) {
  return `${stock.market}:${stock.code}`;
}

function isWatchlistStock(value: unknown): value is WatchlistStock {
  if (!value || typeof value !== 'object') return false;
  const stock = value as Record<string, unknown>;
  return (
    typeof stock.code === 'string' &&
    stock.code.length > 0 &&
    typeof stock.name === 'string' &&
    stock.name.length > 0 &&
    typeof stock.market === 'string' &&
    stock.market.length > 0 &&
    (stock.englishName === undefined || typeof stock.englishName === 'string')
  );
}

export function parseWatchlist(value: string | null): WatchlistStock[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const unique = new Map<string, WatchlistStock>();
    for (const stock of parsed) {
      if (isWatchlistStock(stock)) unique.set(watchlistStockKey(stock), stock);
    }
    return [...unique.values()];
  } catch {
    return [];
  }
}

export function readWatchlist(storage: StorageReader): WatchlistStock[] {
  return parseWatchlist(storage.getItem(WATCHLIST_STORAGE_KEY));
}

export function writeWatchlist(
  storage: StorageWriter,
  stocks: WatchlistStock[],
) {
  storage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(stocks));
}

export function toggleWatchlist(
  stocks: WatchlistStock[],
  stock: WatchlistStock,
): WatchlistStock[] {
  const key = watchlistStockKey(stock);
  return stocks.some((item) => watchlistStockKey(item) === key)
    ? stocks.filter((item) => watchlistStockKey(item) !== key)
    : [...stocks, stock];
}
