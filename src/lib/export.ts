import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { Instrument, Portfolio, RealizedTrade, Transaction } from '../domain/types';

/** Writes a file to the cache directory and opens the share sheet (downloads it on web). */
export async function shareTextFile(filename: string, content: string, mimeType: string, uti?: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType, UTI: uti, dialogTitle: filename });
}

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function transactionsCsv(txns: Transaction[], instruments: Map<string, Instrument>, portfolios: Map<string, Portfolio>): string {
  const headers = [
    'Date', 'Time', 'Portfolio', 'Symbol', 'Exchange', 'Type', 'Product', 'Quantity', 'Price', 'Trade value',
    'Brokerage', 'STT', 'Exchange charges', 'SEBI fee', 'Stamp duty', 'GST', 'DP charges', 'Other charges',
    'Total charges', 'Net amount', 'Order ref', 'Reason', 'Notes', 'Tags',
  ];
  const rows = txns.map((t) => {
    const inst = instruments.get(t.instrumentId);
    return [
      t.tradeDate, t.tradeTime, portfolios.get(t.portfolioId)?.name, inst?.symbol, inst?.exchange, t.type, t.productType,
      t.quantity, t.price, t.quantity * t.price, t.brokerage, t.stt, t.exchangeCharges, t.sebiFee, t.stampDuty, t.gst,
      t.dpCharges, t.otherCharges, t.totalCharges, t.netAmount, t.orderRef, t.reason, t.notes, t.tags?.join('; '),
    ];
  });
  return toCsv(headers, rows);
}

export function realizedCsv(trades: RealizedTrade[], instruments: Map<string, Instrument>, portfolios: Map<string, Portfolio>, fyOf: (d: string) => string): string {
  const headers = ['FY', 'Portfolio', 'Symbol', 'ISIN', 'Buy date', 'Sell date', 'Quantity', 'Buy cost', 'Sell value', 'Gain', 'Gain %', 'Holding days', 'Classification', 'Product'];
  const rows = trades.map((r) => {
    const inst = instruments.get(r.instrumentId);
    return [
      fyOf(r.sellDate), portfolios.get(r.portfolioId)?.name, inst?.symbol, inst?.isin, r.buyDate, r.sellDate, r.quantity,
      r.buyCost, r.sellValue, r.gain, r.gainPct, r.holdingDays, r.classification.toUpperCase(), r.productType,
    ];
  });
  return toCsv(headers, rows);
}
