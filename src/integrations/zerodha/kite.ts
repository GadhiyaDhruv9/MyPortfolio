import { applyFIFO } from '../../domain/fifo';
import type { AppData, Instrument, PriceQuote } from '../../domain/types';
import { applyImportPlan, matchInstrument, newInstrumentFor, planImport, type BrokerFill, type ImportOptions, type ImportPlan } from './importer';

const API = 'https://api.kite.trade';

export interface KiteSession {
  apiKey: string;
  accessToken: string;
  userId?: string;
  userName?: string;
  /** ISO time the token was issued. */
  issuedAt: string;
}

export interface KiteHolding {
  tradingsymbol: string;
  exchange: string;
  isin?: string;
  quantity: number;
  t1_quantity?: number;
  used_quantity?: number;
  average_price: number;
  last_price: number;
  close_price: number;
}

export interface KiteTrade {
  trade_id: string;
  order_id: string;
  exchange: string;
  tradingsymbol: string;
  product: string;
  average_price: number;
  quantity?: number;
  filled?: number;
  transaction_type: 'BUY' | 'SELL';
  fill_timestamp?: string;
  exchange_timestamp?: string;
  order_timestamp?: string;
}

export class KiteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorType?: string,
  ) {
    super(message);
  }
  /** Token expired or revoked — the user must log in again. */
  get isAuthError() {
    return this.status === 403 || this.errorType === 'TokenException';
  }
  /** The API plan does not include this endpoint (e.g. market quotes). */
  get isPermissionError() {
    return this.errorType === 'PermissionException';
  }
}

/** Kite access tokens expire at 6:00 AM IST the day after login. */
export function tokenExpiry(issuedAt: string): Date {
  const IST_OFFSET_MS = 330 * 60 * 1000;
  const issuedIst = new Date(Date.parse(issuedAt) + IST_OFFSET_MS);
  const expiryIst = Date.UTC(issuedIst.getUTCFullYear(), issuedIst.getUTCMonth(), issuedIst.getUTCDate(), 6, 0, 0);
  const next = issuedIst.getUTCHours() < 6 ? expiryIst : expiryIst + 86400000;
  return new Date(next - IST_OFFSET_MS);
}

export function isSessionValid(session: KiteSession | null, now = new Date()): session is KiteSession {
  return !!session && now < tokenExpiry(session.issuedAt);
}

/** Today's date in India (trades and holdings are reported in IST). */
export function todayIST(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

type Fetch = typeof fetch;

async function kiteGet<T>(session: KiteSession, path: string, fetchImpl: Fetch = fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    headers: { 'X-Kite-Version': '3', Authorization: `token ${session.apiKey}:${session.accessToken}` },
  });
  let body: { status?: string; data?: T; message?: string; error_type?: string } = {};
  try {
    body = await res.json();
  } catch {
    // Non-JSON error page; handled below.
  }
  if (!res.ok || body.status !== 'success') {
    throw new KiteError(body.message || `Kite API error (${res.status})`, res.status, body.error_type);
  }
  return body.data as T;
}

export const kiteApi = {
  holdings: (s: KiteSession, f?: Fetch) => kiteGet<KiteHolding[]>(s, '/portfolio/holdings', f),
  trades: (s: KiteSession, f?: Fetch) => kiteGet<KiteTrade[]>(s, '/trades', f),
  /** Up to 1000 instruments per call, keyed "NSE:INFY". */
  ohlc: (s: KiteSession, keys: string[], f?: Fetch) =>
    kiteGet<Record<string, { last_price: number; ohlc: { close: number } }>>(s, `/quote/ohlc?${keys.map((k) => `i=${encodeURIComponent(k)}`).join('&')}`, f),
};

/** Today's cash-equity trades as broker fills. */
export function tradesToFills(trades: KiteTrade[]): BrokerFill[] {
  const out: BrokerFill[] = [];
  for (const t of trades) {
    if (t.exchange !== 'NSE' && t.exchange !== 'BSE') continue; // F&O, currency, commodity
    if (t.product !== 'CNC' && t.product !== 'MIS') continue;
    const stamp = t.fill_timestamp || t.exchange_timestamp || '';
    const date = stamp.slice(0, 10) || todayIST();
    const quantity = t.quantity ?? t.filled ?? 0;
    if (!(quantity > 0) || !(t.average_price > 0)) continue;
    out.push({
      id: `${t.exchange}:${date}:${t.trade_id}`,
      orderId: t.order_id,
      symbol: t.tradingsymbol,
      exchange: t.exchange,
      side: t.transaction_type,
      quantity,
      price: t.average_price,
      date,
      time: stamp.slice(11, 16) || undefined,
    });
  }
  return out;
}

export interface Mismatch {
  instrumentId: string;
  symbol: string;
  zerodhaQty: number;
  appQty: number;
}

export interface SyncPlan extends ImportPlan {
  quotes: PriceQuote[];
  mismatches: Mismatch[];
  holdingsCount: number;
}

/**
 * Builds everything a sync changes, without touching data:
 * today's trades → transactions, holdings → instruments + prices, and a check that
 * the app's quantities (before today's trades) match Zerodha's settled holdings.
 */
export function planKiteSync(
  data: AppData,
  holdings: KiteHolding[],
  trades: KiteTrade[],
  ohlc: Record<string, { last_price: number; ohlc: { close: number } }> | null,
  opts: ImportOptions,
  now = new Date(),
): SyncPlan {
  const plan = planImport(tradesToFills(trades), data, opts);
  const instruments: Instrument[] = [...data.instruments];
  for (const i of plan.newInstruments) {
    const at = instruments.findIndex((x) => x.id === i.id);
    if (at >= 0) instruments[at] = i;
    else instruments.push(i);
  }

  const equityHoldings = holdings.filter((h) => h.exchange === 'NSE' || h.exchange === 'BSE');
  const holdingInstrument = new Map<KiteHolding, Instrument>();
  for (const h of equityHoldings) {
    const key = { symbol: h.tradingsymbol, exchange: h.exchange as 'NSE' | 'BSE', isin: h.isin || undefined };
    let inst = matchInstrument(instruments, key);
    if (!inst) {
      inst = newInstrumentFor(key, opts.newId('in'));
      instruments.push(inst);
      plan.newInstruments.push(inst);
    }
    holdingInstrument.set(h, inst);
  }

  const stamp = now.toISOString();
  const quotes = new Map<string, PriceQuote>();
  for (const [h, inst] of holdingInstrument) {
    if (h.last_price > 0) quotes.set(inst.id, { instrumentId: inst.id, price: h.last_price, previousClose: h.close_price > 0 ? h.close_price : h.last_price, updatedAt: stamp });
  }
  if (ohlc) {
    for (const inst of instruments) {
      const q = ohlc[`${inst.exchange}:${inst.symbol}`];
      if (q?.last_price > 0) quotes.set(inst.id, { instrumentId: inst.id, price: q.last_price, previousClose: q.ohlc?.close > 0 ? q.ohlc.close : q.last_price, updatedAt: stamp });
    }
  }

  // Holdings exclude today's buys and still include today's sells, so compare against the app as of yesterday.
  const today = todayIST(now);
  const after = applyImportPlan(data, plan);
  const before = after.transactions.filter((t) => t.portfolioId === opts.portfolioId && t.tradeDate < today);
  const appQty = new Map<string, number>();
  for (const l of applyFIFO(before).lots) appQty.set(l.instrumentId, (appQty.get(l.instrumentId) ?? 0) + l.remainingQty);
  const zerodhaQty = new Map<string, number>();
  for (const [h, inst] of holdingInstrument) zerodhaQty.set(inst.id, (zerodhaQty.get(inst.id) ?? 0) + h.quantity + (h.t1_quantity ?? 0));

  const mismatches: Mismatch[] = [];
  for (const id of new Set([...appQty.keys(), ...zerodhaQty.keys()])) {
    const z = zerodhaQty.get(id) ?? 0;
    const a = appQty.get(id) ?? 0;
    if (Math.abs(z - a) > 1e-6) mismatches.push({ instrumentId: id, symbol: instruments.find((i) => i.id === id)?.symbol ?? '?', zerodhaQty: z, appQty: a });
  }
  mismatches.sort((x, y) => x.symbol.localeCompare(y.symbol));

  return { ...plan, quotes: [...quotes.values()], mismatches, holdingsCount: equityHoldings.length };
}

/** Exchange keys ("NSE:INFY") for instruments that still have open lots anywhere. */
export function openInstrumentKeys(data: AppData): string[] {
  const open = new Set(applyFIFO(data.transactions).lots.filter((l) => l.remainingQty > 1e-9).map((l) => l.instrumentId));
  return data.instruments.filter((i) => open.has(i.id) && i.exchange !== 'OTHER').map((i) => `${i.exchange}:${i.symbol}`);
}
