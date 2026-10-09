import type { BrokerFill } from './importer';

/** RFC 4180 CSV parsing (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Accepted header names for each field (lower-cased, spaces/underscores ignored). */
const COLUMNS = {
  symbol: ['symbol', 'tradingsymbol', 'scrip', 'scripname'],
  isin: ['isin'],
  date: ['tradedate', 'date'],
  exchange: ['exchange'],
  segment: ['segment'],
  side: ['tradetype', 'type', 'transactiontype', 'buysell'],
  quantity: ['quantity', 'qty'],
  price: ['price', 'tradeprice', 'averageprice'],
  tradeId: ['tradeid'],
  orderId: ['orderid'],
  time: ['orderexecutiontime', 'executiontime', 'tradetime', 'time'],
} as const;

type Field = keyof typeof COLUMNS;
const norm = (h: string) => h.toLowerCase().replace(/[\s_\-.]/g, '');

const MONTHS: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

/** Accepts 2024-01-18, 18-01-2024, 18/01/2024, 18-Jan-2024 and ISO timestamps. */
export function parseTradeDate(raw: string): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  return null;
}

function parseTime(raw: string | undefined): string | undefined {
  const m = raw?.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : undefined;
}

export interface TradebookResult {
  fills: BrokerFill[];
  skipped: { row: number; reason: string }[];
  /** Header row could not be mapped to the required columns. */
  error?: string;
}

/**
 * Parses a Zerodha Console tradebook export (Reports → Tradebook → Equity → CSV).
 * Only cash-market equity rows (NSE/BSE) are kept; F&O, currency and commodity
 * rows are skipped and reported.
 */
export function parseTradebook(text: string): TradebookResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { fills: [], skipped: [], error: 'The file has no trade rows.' };

  // Some exports put a title above the header; use the first row that names a symbol and quantity.
  const headerIndex = rows.findIndex((r) => {
    const h = r.map(norm);
    return COLUMNS.symbol.some((c) => h.includes(c)) && COLUMNS.quantity.some((c) => h.includes(c));
  });
  if (headerIndex < 0) return { fills: [], skipped: [], error: 'Could not find a header row with "symbol" and "quantity" columns.' };
  const header = rows[headerIndex].map(norm);
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(COLUMNS) as Field[]) col[f] = header.findIndex((h) => (COLUMNS[f] as readonly string[]).includes(h));
  const missing = (['symbol', 'date', 'side', 'quantity', 'price'] as Field[]).filter((f) => col[f] < 0);
  if (missing.length) return { fills: [], skipped: [], error: `Missing column(s): ${missing.join(', ')}.` };

  const fills: BrokerFill[] = [];
  const skipped: TradebookResult['skipped'] = [];
  const get = (r: string[], f: Field) => (col[f] >= 0 ? (r[col[f]] ?? '').trim() : '');

  rows.slice(headerIndex + 1).forEach((r, i) => {
    const rowNo = headerIndex + i + 2;
    const exchange = get(r, 'exchange').toUpperCase() || 'NSE';
    const segment = get(r, 'segment').toUpperCase();
    if ((exchange !== 'NSE' && exchange !== 'BSE') || (segment && segment !== 'EQ')) {
      skipped.push({ row: rowNo, reason: `Not cash equity (${[exchange, segment].filter(Boolean).join(' ')})` });
      return;
    }
    const date = parseTradeDate(get(r, 'date'));
    const sideRaw = get(r, 'side').toUpperCase();
    const side = sideRaw.startsWith('B') ? 'BUY' : sideRaw.startsWith('S') ? 'SELL' : null;
    const quantity = Number(get(r, 'quantity').replace(/,/g, ''));
    const price = Number(get(r, 'price').replace(/,/g, ''));
    const symbol = get(r, 'symbol').toUpperCase().replace(/-(EQ|BE|BZ|SM|ST)$/, '');
    if (!symbol || !date || !side || !(quantity > 0) || !(price > 0)) {
      skipped.push({ row: rowNo, reason: 'Missing or invalid symbol, date, type, quantity or price' });
      return;
    }
    const orderId = get(r, 'orderId') || undefined;
    const tradeId = get(r, 'tradeId');
    fills.push({
      // Trade IDs are unique per exchange and day; fall back to the row contents if absent.
      id: tradeId ? `${exchange}:${date}:${tradeId}` : `${exchange}:${date}:${symbol}:${side}:${quantity}:${price}:${orderId ?? rowNo}`,
      orderId,
      symbol,
      exchange,
      isin: get(r, 'isin').toUpperCase() || undefined,
      side,
      quantity,
      price,
      date,
      time: parseTime(get(r, 'time')),
    });
  });

  return { fills, skipped };
}
