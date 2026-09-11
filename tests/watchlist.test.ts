import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseWatchlist,
  readWatchlist,
  toggleWatchlist,
  WATCHLIST_STORAGE_KEY,
  writeWatchlist,
  type WatchlistStock,
} from '../lib/watchlist.ts';

const samsung: WatchlistStock = {
  code: '005930',
  name: '삼성전자',
  market: 'KOSPI',
};
const apple: WatchlistStock = {
  code: 'AAPL',
  name: 'Apple',
  englishName: 'Apple Inc.',
  market: 'NASDAQ',
};

await test('관심종목 JSON에서 유효한 종목만 읽고 중복을 제거한다', () => {
  const value = JSON.stringify([
    samsung,
    { ...samsung, name: '삼성전자 최신' },
    null,
    { code: 1 },
  ]);
  assert.deepEqual(parseWatchlist(value), [
    { ...samsung, name: '삼성전자 최신' },
  ]);
  assert.deepEqual(parseWatchlist('{invalid'), []);
});

await test('시장과 종목코드 조합으로 관심종목을 추가하고 삭제한다', () => {
  assert.deepEqual(toggleWatchlist([], samsung), [samsung]);
  assert.deepEqual(toggleWatchlist([samsung, apple], samsung), [apple]);
});

await test('지정된 localStorage 키에 관심종목을 저장하고 복원한다', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  writeWatchlist(storage, [samsung, apple]);
  assert.equal(values.has(WATCHLIST_STORAGE_KEY), true);
  assert.deepEqual(readWatchlist(storage), [samsung, apple]);
});
