/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeData, seedData } from '../../data/seed';
import { applyFIFO, getFY } from '../fifo';
import { computeHoldings, portfolioTotals } from '../holdings';
import { portfolioCashFlows, xirr } from '../returns';
import { computeCapitalGains } from '../tax';

describe('seed data', () => {
  const data = seedData();
  const fifo = applyFIFO(data.transactions);

  it('has the expected shape', () => {
    assert.equal(data.portfolios.length, 2);
    assert.equal(data.instruments.length, 10);
    assert.ok(data.transactions.length >= 26);
    assert.equal(data.dividends.length, 4);
    assert.equal(data.quotes.length, 10);
  });

  it('replays without overselling', () => {
    assert.deepEqual(fifo.issues, []);
  });

  it('spans three financial years of sells', () => {
    const fys = new Set(fifo.realized.map((r) => getFY(r.sellDate)));
    for (const fy of ['FY2023-24', 'FY2024-25', 'FY2025-26']) assert.ok(fys.has(fy), fy);
  });

  it('keeps closed positions and produces sane totals', () => {
    const holdings = computeHoldings(data.transactions, data.instruments, data.quotes, null, fifo);
    const closed = holdings.filter((h) => h.isClosed).map((h) => h.symbol).sort();
    assert.deepEqual(closed, ['TATAMOTORS', 'TATASTEEL']);
    const totals = portfolioTotals(holdings, fifo.realized);
    assert.ok(totals.currentValue > 0 && totals.invested > 0);
    const rate = xirr(portfolioCashFlows(data.transactions, totals.currentValue));
    assert.ok(rate !== null && rate > -50 && rate < 100, String(rate));
    const reliance = holdings.find((h) => h.symbol === 'RELIANCE')!;
    assert.equal(reliance.quantity, 65); // 20 + 1:1 bonus + 25 spouse
  });

  it('computes capital gains for each FY', () => {
    for (const fy of ['FY2023-24', 'FY2024-25', 'FY2025-26']) {
      const r = computeCapitalGains(fifo.realized, data.instruments, data.taxRules, fy);
      assert.ok(Number.isFinite(r.estimatedTax) && r.estimatedTax >= 0);
    }
  });

  it('round-trips through a JSON backup', () => {
    const json = JSON.stringify(data);
    assert.equal(JSON.stringify(normalizeData(JSON.parse(json))), json);
  });
});
