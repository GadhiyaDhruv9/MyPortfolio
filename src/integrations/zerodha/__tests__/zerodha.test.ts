/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyData, seedData } from '../../../data/seed';
import { DEFAULT_CHARGE_TEMPLATES } from '../../../domain/charges';
import { applyFIFO } from '../../../domain/fifo';
import type { AppData } from '../../../domain/types';
import { applyImportPlan, planImport, type ImportOptions } from '../importer';
import { planKiteSync, tokenExpiry, tradesToFills, type KiteTrade } from '../kite';
import { parseCsv, parseTradebook, parseTradeDate } from '../tradebook';

let n = 0;
const opts = (portfolioId = 'pf'): ImportOptions => ({
  portfolioId,
  deliveryTemplate: DEFAULT_CHARGE_TEMPLATES[0],
  intradayTemplate: DEFAULT_CHARGE_TEMPLATES[2],
  source: 'zerodha_csv',
  newId: (p) => `${p}_${++n}`,
});

const base = (): AppData => {
  const d = emptyData();
  d.portfolios = [{ id: 'pf', name: 'Zerodha', owner: 'Self', baseCurrency: 'INR', createdAt: '2024-01-01' }];
  return d;
};

const CSV = [
  'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time',
  'INFY,INE009A01021,2024-01-10,NSE,EQ,EQ,buy,false,6,1500.00,1001,O1,2024-01-10T09:20:01',
  'INFY,INE009A01021,2024-01-10,NSE,EQ,EQ,buy,false,4,1510.00,1002,O1,2024-01-10T09:20:05',
  'INFY,INE009A01021,2024-01-10,NSE,EQ,EQ,sell,false,4,1520.00,1003,O2,2024-01-10T14:10:00',
  'TCS,INE467B01029,2024-02-01,NSE,EQ,EQ,buy,false,2,3500.00,2001,O3,2024-02-01T10:00:00',
  'NIFTY24FEBFUT,,2024-02-01,NFO,FO,,buy,false,50,21000.00,3001,O4,2024-02-01T10:00:00',
  '"HDFC BANK, LTD",INE040A01034,18-03-2024,BSE,EQ,A,buy,false,1,1400.50,4001,O5,"2024-03-18 11:00:00"',
].join('\n');

describe('tradebook CSV', () => {
  it('parses quoted fields', () => {
    assert.deepEqual(parseCsv('a,"b,c","d ""e"""\r\n1,2,3'), [
      ['a', 'b,c', 'd "e"'],
      ['1', '2', '3'],
    ]);
  });

  it('parses dates in several formats', () => {
    assert.equal(parseTradeDate('2024-01-10'), '2024-01-10');
    assert.equal(parseTradeDate('18-03-2024'), '2024-03-18');
    assert.equal(parseTradeDate('5/3/2024'), '2024-03-05');
    assert.equal(parseTradeDate('18-Mar-2024'), '2024-03-18');
    assert.equal(parseTradeDate('nope'), null);
  });

  it('keeps cash equity rows and skips F&O', () => {
    const r = parseTradebook(CSV);
    assert.equal(r.error, undefined);
    assert.equal(r.fills.length, 5);
    assert.equal(r.skipped.length, 1);
    assert.equal(r.fills[0].time, '09:20');
    assert.equal(r.fills[4].exchange, 'BSE');
    assert.equal(r.fills[4].date, '2024-03-18');
  });

  it('reports missing columns', () => {
    assert.match(parseTradebook('symbol,quantity\nINFY,1').error ?? '', /Missing column/);
  });
});

describe('importer', () => {
  it('splits same-day buy and sell into intraday + delivery', () => {
    const data = base();
    const plan = planImport(parseTradebook(CSV).fills, data, opts());
    assert.equal(plan.newInstruments.length, 3);
    const infy = plan.upserts.filter((t) => t.tradeDate === '2024-01-10');
    const by = (type: string, product: string) => infy.find((t) => t.type === type && t.productType === product);
    assert.equal(by('BUY', 'MIS')?.quantity, 4);
    assert.equal(by('SELL', 'MIS')?.quantity, 4);
    assert.equal(by('BUY', 'CNC')?.quantity, 6);
    assert.equal(by('BUY', 'CNC')?.price, 1504); // VWAP of 6@1500 + 4@1510

    const after = applyImportPlan(data, plan);
    const fifo = applyFIFO(after.transactions);
    assert.deepEqual(fifo.issues, []);
    const sell = fifo.realized.find((r) => r.instrumentId === by('SELL', 'MIS')?.instrumentId);
    assert.equal(sell?.classification, 'intraday');
    const infyLots = fifo.lots.filter((l) => l.instrumentId === by('BUY', 'CNC')?.instrumentId && l.remainingQty > 0);
    assert.equal(infyLots.reduce((s, l) => s + l.remainingQty, 0), 6);
  });

  it('skips already imported trades', () => {
    const data = applyImportPlan(base(), planImport(parseTradebook(CSV).fills, base(), opts()));
    const again = planImport(parseTradebook(CSV).fills, data, opts());
    assert.equal(again.newFills, 0);
    assert.equal(again.duplicateFills, 5);
    assert.equal(again.upserts.length, 0);
  });

  it('rebuilds a day when new fills arrive, keeping notes', () => {
    const fills = parseTradebook(CSV).fills.filter((f) => f.symbol === 'TCS');
    let data = applyImportPlan(base(), planImport(fills, base(), opts()));
    const first = data.transactions[0];
    data = { ...data, transactions: [{ ...first, reason: 'Quality compounder' }] };
    const more = [{ ...fills[0], id: 'NSE:2024-02-01:2002', quantity: 3, price: 3600 }];
    const plan = planImport(more, data, opts());
    data = applyImportPlan(data, plan);
    assert.equal(data.transactions.length, 1);
    assert.equal(data.transactions[0].quantity, 5);
    assert.equal(data.transactions[0].id, first.id);
    assert.equal(data.transactions[0].reason, 'Quality compounder');
  });

  it('matches existing instruments by ISIN', () => {
    const data = seedData();
    const plan = planImport(
      [{ id: 'x1', symbol: 'INFY', exchange: 'BSE', isin: 'INE009A01021', side: 'BUY', quantity: 1, price: 1500, date: '2026-01-05' }],
      data,
      opts('pf_main'),
    );
    assert.equal(plan.newInstruments.length, 0);
    assert.equal(plan.upserts[0].instrumentId, 'in_infy');
  });
});

describe('kite sync', () => {
  it('computes token expiry at 6 AM IST next day', () => {
    // 10:00 IST on 10 Oct → expires 06:00 IST on 11 Oct (00:30 UTC).
    assert.equal(tokenExpiry('2026-10-10T04:30:00.000Z').toISOString(), '2026-10-11T00:30:00.000Z');
    // 02:00 IST (before 6 AM) → expires 06:00 IST the same day.
    assert.equal(tokenExpiry('2026-10-09T20:30:00.000Z').toISOString(), '2026-10-10T00:30:00.000Z');
  });

  it('converts trades, skipping F&O', () => {
    const trades: KiteTrade[] = [
      { trade_id: 't1', order_id: 'o1', exchange: 'NSE', tradingsymbol: 'INFY', product: 'CNC', average_price: 1500, quantity: 2, transaction_type: 'BUY', fill_timestamp: '2026-10-09 09:30:00' },
      { trade_id: 't2', order_id: 'o2', exchange: 'NFO', tradingsymbol: 'NIFTY', product: 'NRML', average_price: 1, quantity: 50, transaction_type: 'BUY', fill_timestamp: '2026-10-09 09:30:00' },
    ];
    const fills = tradesToFills(trades);
    assert.equal(fills.length, 1);
    assert.equal(fills[0].id, 'NSE:2026-10-09:t1');
    assert.equal(fills[0].time, '09:30');
  });

  it('updates prices and reports quantity mismatches', () => {
    const data = seedData();
    const now = new Date('2026-10-09T06:00:00Z');
    const plan = planKiteSync(
      data,
      [
        { tradingsymbol: 'INFY', exchange: 'NSE', isin: 'INE009A01021', quantity: 15, t1_quantity: 0, average_price: 1290, last_price: 1600, close_price: 1590 },
        { tradingsymbol: 'TCS', exchange: 'NSE', isin: 'INE467B01029', quantity: 10, t1_quantity: 0, average_price: 3500, last_price: 3100, close_price: 3120 },
        { tradingsymbol: 'IRCTC', exchange: 'NSE', isin: 'INE335Y01020', quantity: 5, average_price: 700, last_price: 750, close_price: 745 },
      ],
      [],
      null,
      { ...opts('pf_main'), source: 'kite' },
      now,
    );
    const infyQuote = plan.quotes.find((q) => q.instrumentId === 'in_infy');
    assert.equal(infyQuote?.price, 1600);
    assert.equal(infyQuote?.previousClose, 1590);
    assert.ok(plan.newInstruments.some((i) => i.symbol === 'IRCTC'));
    const bySymbol = new Map(plan.mismatches.map((m) => [m.symbol, m]));
    assert.equal(bySymbol.has('INFY'), false); // 15 in both
    assert.equal(bySymbol.get('TCS')?.appQty, 15); // app has 15, Zerodha 10
    assert.equal(bySymbol.get('IRCTC')?.zerodhaQty, 5);
  });
});

describe('auth worker', () => {
  it('bounces the request token to the app and exchanges it', async () => {
    const worker = (await import('../../../../server/kite-auth-worker/index.js')).default;
    const env = { KITE_API_KEY: 'key123', KITE_API_SECRET: 'secret456' };

    const cb = await worker.fetch(
      new Request('https://w.example/callback?app_redirect=exp%3A%2F%2F192.168.1.5%3A8081%2F--%2Fkite-auth&request_token=abcDEF123456&status=success'),
      env,
    );
    assert.equal(cb.status, 302);
    assert.equal(cb.headers.get('Location'), 'exp://192.168.1.5:8081/--/kite-auth?request_token=abcDEF123456&status=success');

    const evil = await worker.fetch(new Request('https://w.example/callback?app_redirect=https%3A%2F%2Fevil.example&request_token=x'), env);
    assert.equal(evil.status, 400);

    const realFetch = globalThis.fetch;
    let sent: URLSearchParams | null = null;
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent = init.body as URLSearchParams;
      return new Response(JSON.stringify({ status: 'success', data: { access_token: 'tok', user_id: 'AB1234', user_name: 'Test', api_key: 'key123' } }));
    }) as typeof fetch;
    try {
      const res = await worker.fetch(
        new Request('https://w.example/session', { method: 'POST', body: JSON.stringify({ request_token: 'abcDEF123456' }) }),
        env,
      );
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { access_token: 'tok', user_id: 'AB1234', user_name: 'Test' });
      const { createHash } = await import('node:crypto');
      assert.equal(sent!.get('checksum'), createHash('sha256').update('key123abcDEF123456secret456').digest('hex'));
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
