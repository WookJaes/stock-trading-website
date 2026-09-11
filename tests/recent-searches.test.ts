import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addRecentSearch,
  MAX_RECENT_SEARCHES,
  parseRecentSearches,
} from '../lib/recent-searches.ts';

await test('최근 검색어를 최신순으로 추가하고 중복을 앞으로 이동한다', () => {
  assert.deepEqual(addRecentSearch(['삼성전자', '카카오'], ' 카카오 '), [
    '카카오',
    '삼성전자',
  ]);
});

await test('최근 검색어를 최대 10개까지만 유지한다', () => {
  const searches = Array.from(
    { length: MAX_RECENT_SEARCHES },
    (_, index) => `종목 ${index}`,
  );
  assert.deepEqual(addRecentSearch(searches, '새 종목'), [
    '새 종목',
    ...searches.slice(0, 9),
  ]);
});

await test('저장된 최근 검색어를 안전하게 정리한다', () => {
  assert.deepEqual(
    parseRecentSearches('[" 삼성전자 ","삼성전자",null,"",42,"카카오"]'),
    ['삼성전자', '카카오'],
  );
  assert.deepEqual(parseRecentSearches('invalid json'), []);
  assert.deepEqual(parseRecentSearches('{"search":"삼성전자"}'), []);
});
