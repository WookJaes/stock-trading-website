import assert from 'node:assert/strict';
import test from 'node:test';
import { createHoldingsCsv, type CsvHolding } from '../lib/account-csv.ts';

const holding: CsvHolding = {
  code: '005930',
  name: '삼성전자',
  market: 'KOSPI',
  currency: 'KRW',
  quantity: 10,
  availableQuantity: 8,
  averagePrice: 70000,
  currentPrice: 75000,
  evaluationAmount: 750000,
  profitLoss: 50000,
  profitRate: 7.14,
};

void test('creates a UTF-8 BOM CSV containing holding and profit data', () => {
  const csv = createHoldingsCsv([holding]);

  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /^﻿종목코드,종목명,시장,통화,/);
  assert.match(
    csv,
    /"005930","삼성전자","KOSPI",KRW,10,8,70000,75000,750000,50000,7\.14/,
  );
  assert.ok(csv.endsWith('\r\n'));
});

void test('escapes quotes and spreadsheet formulas in text cells', () => {
  const csv = createHoldingsCsv([
    { ...holding, code: '=1+1', name: 'A "quoted", name' },
  ]);

  assert.match(csv, /"'=1\+1"/);
  assert.match(csv, /"A ""quoted"", name"/);
});

void test('creates a header-only CSV for an empty account', () => {
  const csv = createHoldingsCsv([]);

  assert.equal(csv.split('\r\n').length, 2);
  assert.ok(csv.startsWith('\uFEFF종목코드'));
});
