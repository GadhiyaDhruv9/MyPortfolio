/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { calculateCharges, DEFAULT_CHARGE_TEMPLATES } from '../charges';
import { applyFIFO, classifyGain, daysBetween, getFY, previewSell } from '../fifo';
import { computeHoldings } from '../holdings';
import { periodBreakdown, periodOf } from '../reports';
import { xirr } from '../returns';
import { computeCapitalGains, DEFAULT_TAX_RULES, grandfatheredCost } from '../tax';
import type { Transaction } from '../types';

let seq = 0;
function txn(p: Partial<Transaction> & Pick<Transaction, 'type' | 'tradeDate' | 'quantity' | 'price'>): Transaction {
  const charges = p.totalCharges ?? 0;
  const value = p.quantity * p.price;
  return {
    id: `t${++seq}`,
    portfolioId: 'p1',
    instrumentId: 'i1',
    productType: 'CNC',
    brokerage: 0,
    stt: 0,
    exchangeCharges: 0,
    sebiFee: 0,
    stampDuty: 0,
    gst: 0,
    dpCharges: 0,
    otherCharges: charges,
    totalCharges: charges,
    netAmount: p.type === 'SELL' ? value - charges : value + charges,
    ...p,
  };
}

const close = (a: number, b: number, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe('dates & FY', () => {
  it('computes Indian FY', () => {
    assert.equal(getFY('2025-04-01'), 'FY2025-26');
    assert.equal(getFY('2026-03-31'), 'FY2025-26');
    assert.equal(getFY('2099-12-01'), 'FY2099-00');
  });
  it('counts days', () => {
    assert.equal(daysBetween('2024-01-01', '2025-01-01'), 366);
  });
  it('classifies gains', () => {
    assert.equal(classifyGain('MIS', 400), 'intraday');
    assert.equal(classifyGain('CNC', 0), 'intraday');
    assert.equal(classifyGain('CNC', 365), 'stcg');
    assert.equal(classifyGain('CNC', 366), 'ltcg');
  });
});

describe('FIFO', () => {
  it('consumes the oldest lot first, partially', () => {
    const r = applyFIFO([
      txn({ type: 'BUY', tradeDate: '2023-01-10', quantity: 10, price: 100, totalCharges: 10 }),
      txn({ type: 'BUY', tradeDate: '2023-06-10', quantity: 10, price: 200 }),
      txn({ type: 'SELL', tradeDate: '2024-03-01', quantity: 15, price: 300 }),
    ]);
    assert.equal(r.realized.length, 2);
    const [a, b] = r.realized;
    assert.equal(a.quantity, 10);
    close(a.buyCost, 1010);
    close(a.gain, 3000 - 1010);
    assert.equal(a.classification, 'ltcg');
    assert.equal(b.quantity, 5);
    close(b.buyCost, 1000);
    assert.equal(b.classification, 'stcg');
    assert.equal(r.lots[1].remainingQty, 5);
    close(r.lots[1].costBasis, 1000);
  });

  it('applies bonus and split without changing cost', () => {
    const r = applyFIFO([
      txn({ type: 'BUY', tradeDate: '2023-01-10', quantity: 10, price: 100 }),
      txn({ type: 'BONUS', tradeDate: '2023-05-01', quantity: 1, price: 1 }),
      txn({ type: 'SPLIT', tradeDate: '2023-08-01', quantity: 0, price: 5 }),
    ]);
    const lot = r.lots[0];
    assert.equal(lot.remainingQty, 100);
    close(lot.costBasis, 1000);
    close(lot.perShareCost, 10);
    close(lot.buyPrice, 10);
  });

  it('flags overselling', () => {
    const r = applyFIFO([
      txn({ type: 'BUY', tradeDate: '2023-01-10', quantity: 5, price: 100 }),
      txn({ type: 'SELL', tradeDate: '2023-02-10', quantity: 8, price: 100 }),
    ]);
    assert.equal(r.issues.length, 1);
  });

  it('previews a sell', () => {
    const txns = [
      txn({ type: 'BUY', tradeDate: '2023-01-10', quantity: 10, price: 100 }),
      txn({ type: 'BUY', tradeDate: '2024-01-10', quantity: 10, price: 100 }),
    ];
    const p = previewSell(txns, txn({ type: 'SELL', tradeDate: '2024-06-01', quantity: 25, price: 150 }));
    assert.equal(p.available, 20);
    assert.equal(p.shortfall, 5);
    assert.equal(p.consumed[0].classification, 'ltcg');
    assert.equal(p.consumed[1].classification, 'stcg');
  });

  it('keeps closed positions in holdings', () => {
    const txns = [
      txn({ type: 'BUY', tradeDate: '2023-01-10', quantity: 5, price: 100 }),
      txn({ type: 'SELL', tradeDate: '2023-02-10', quantity: 5, price: 120 }),
    ];
    const h = computeHoldings(txns, [], []);
    assert.equal(h.length, 1);
    assert.equal(h[0].isClosed, true);
    close(h[0].realizedPnL, 100);
  });
});

describe('demerger', () => {
  // Like Tata Motors → TMCV: 1 new share per share held, ~31.65% of the cost moves across.
  const history = () => [
    txn({ type: 'BUY', tradeDate: '2023-03-01', quantity: 10, price: 400, totalCharges: 10 }),
    txn({ type: 'BUY', tradeDate: '2024-06-01', quantity: 6, price: 900 }),
    txn({ type: 'SELL', tradeDate: '2024-09-01', quantity: 4, price: 1000 }),
    txn({ type: 'DEMERGER', tradeDate: '2025-10-14', quantity: 1, price: 1, demergedInstrumentId: 'i2', costSharePct: 31.65 }),
  ];

  it('moves part of each lot’s cost to the new company, keeping buy dates', () => {
    const { lots, issues } = applyFIFO(history());
    assert.deepEqual(issues, []);
    const parent = lots.filter((l) => l.instrumentId === 'i1' && l.remainingQty > 0);
    const child = lots.filter((l) => l.instrumentId === 'i2');
    // 6 left from the 2023 lot, 6 from the 2024 lot.
    assert.deepEqual(child.map((l) => [l.buyDate, l.remainingQty]), [['2023-03-01', 6], ['2024-06-01', 6]]);
    const before = 6 * (400 + 1) + 6 * 900; // 2023 lot cost includes ₹1/share charges
    close(child.reduce((s, l) => s + l.costBasis, 0), before * 0.3165);
    close(parent.reduce((s, l) => s + l.costBasis, 0), before * 0.6835);
    close(child[0].buyPrice, 400 * 0.3165);
    close(parent[0].buyPrice, 400 * 0.6835);
  });

  it('carries the holding period over when the new shares are sold', () => {
    const txns = [...history(), txn({ type: 'SELL', tradeDate: '2025-11-01', quantity: 6, price: 300, instrumentId: 'i2' })];
    const { realized, issues } = applyFIFO(txns);
    assert.deepEqual(issues, []);
    const sale = realized.find((r) => r.instrumentId === 'i2');
    assert.equal(sale?.buyDate, '2023-03-01');
    assert.equal(sale?.classification, 'ltcg');
    close(sale!.buyCost, 6 * 401 * 0.3165);
  });

  it('lets the new company’s shares be sold and shown as a holding', () => {
    const draft = txn({ type: 'SELL', tradeDate: '2025-11-01', quantity: 8, price: 300, instrumentId: 'i2' });
    const preview = previewSell(history(), draft);
    assert.equal(preview.available, 12);
    assert.equal(preview.shortfall, 0);
    const holdings = computeHoldings(history(), [], []);
    assert.equal(holdings.find((h) => h.instrumentId === 'i2')?.quantity, 12);
  });

  it('stays reference-only without a new company', () => {
    const txns = history().map((t) => (t.type === 'DEMERGER' ? { ...t, demergedInstrumentId: undefined } : t));
    const { lots } = applyFIFO(txns);
    assert.equal(lots.some((l) => l.instrumentId === 'i2'), false);
    close(lots.filter((l) => l.instrumentId === 'i1').reduce((s, l) => s + l.costBasis, 0), 6 * 401 + 6 * 900);
  });
});

describe('charges', () => {
  it('computes a zero-brokerage delivery buy', () => {
    const c = calculateCharges(DEFAULT_CHARGE_TEMPLATES[0], 'BUY', 100, 1000);
    assert.equal(c.brokerage, 0);
    assert.equal(c.stt, 100);
    assert.equal(c.stampDuty, 15);
    assert.equal(c.dpCharges, 0);
    close(c.netAmount, 100000 + c.totalCharges);
  });
  it('computes a flat-fee sell with DP charges', () => {
    const c = calculateCharges(DEFAULT_CHARGE_TEMPLATES[1], 'SELL', 100, 1000);
    assert.equal(c.brokerage, 20);
    assert.equal(c.stampDuty, 0);
    assert.equal(c.dpCharges, 15.34);
    close(c.netAmount, 100000 - c.totalCharges);
  });
});

describe('XIRR', () => {
  it('returns ~10% for a one-year 10% gain', () => {
    const r = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2024-01-01', amount: 1100 },
    ]);
    assert.ok(r !== null);
    close(r!, 9.97, 0.1); // 2023-24 spans 365 days → ≈10%
  });
  it('handles losses', () => {
    const r = xirr([
      { date: '2023-01-01', amount: -1000 },
      { date: '2023-07-01', amount: 500 },
    ]);
    assert.ok(r !== null && r < -60);
  });
  it('returns null for one-sided flows', () => {
    assert.equal(xirr([{ date: '2023-01-01', amount: -1000 }]), null);
    assert.equal(xirr([{ date: '2023-01-01', amount: -1 }, { date: '2023-02-01', amount: -1 }]), null);
  });
});

describe('capital gains', () => {
  it('sets off STCL against LTCG and applies exemption + cess', () => {
    const trades = applyFIFO([
      txn({ instrumentId: 'a', type: 'BUY', tradeDate: '2024-01-01', quantity: 100, price: 1000 }),
      txn({ instrumentId: 'a', type: 'SELL', tradeDate: '2025-06-01', quantity: 100, price: 4000 }), // LTCG 3,00,000
      txn({ instrumentId: 'b', type: 'BUY', tradeDate: '2025-05-01', quantity: 100, price: 1000 }),
      txn({ instrumentId: 'b', type: 'SELL', tradeDate: '2025-08-01', quantity: 100, price: 500 }), // STCL 50,000
    ]).realized;
    const r = computeCapitalGains(trades, [], DEFAULT_TAX_RULES, 'FY2025-26');
    close(r.stclUsedAgainstLtcg, 50000);
    close(r.ltcgNet, 250000);
    close(r.ltcgTaxable, 125000);
    close(r.estimatedTax, 125000 * 0.125 * 1.04);
    assert.equal(r.stclCarryForward, 0);
  });
  it('carries forward LTCL, which cannot offset STCG', () => {
    const trades = applyFIFO([
      txn({ instrumentId: 'a', type: 'BUY', tradeDate: '2023-01-01', quantity: 10, price: 1000 }),
      txn({ instrumentId: 'a', type: 'SELL', tradeDate: '2025-06-01', quantity: 10, price: 500 }), // LTCL 5,000
      txn({ instrumentId: 'b', type: 'BUY', tradeDate: '2025-05-01', quantity: 10, price: 1000 }),
      txn({ instrumentId: 'b', type: 'SELL', tradeDate: '2025-08-01', quantity: 10, price: 1200 }), // STCG 2,000
    ]).realized;
    const r = computeCapitalGains(trades, [], DEFAULT_TAX_RULES, 'FY2025-26');
    close(r.ltclCarryForward, 5000);
    close(r.stcgTaxable, 2000);
  });
  it('grandfathers pre-2018 cost', () => {
    assert.equal(grandfatheredCost(100, 300, 250), 250);
    assert.equal(grandfatheredCost(100, 200, 250), 200);
    assert.equal(grandfatheredCost(300, 200, 250), 300);
  });
});

describe('reports', () => {
  it('labels Indian FY quarters', () => {
    assert.equal(periodOf('2025-04-15', 'quarterly').label, 'Q1 2025-26');
    assert.equal(periodOf('2026-02-15', 'quarterly').label, 'Q4 2025-26');
  });
  it('computes win rate per period', () => {
    const txns = [
      txn({ type: 'BUY', tradeDate: '2024-01-01', quantity: 10, price: 100 }),
      txn({ type: 'SELL', tradeDate: '2024-02-01', quantity: 5, price: 120 }),
      txn({ type: 'SELL', tradeDate: '2024-02-05', quantity: 5, price: 80 }),
    ];
    const rows = periodBreakdown(txns, applyFIFO(txns).realized, 'fy');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].trades, 2);
    assert.equal(rows[0].winRate, 50);
  });
});
