import { colors } from './theme';

/** Indian digit grouping for the integer part: 1234567 → "12,34,567". */
function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest},${last3}`;
}

/** Number with Indian grouping, e.g. formatNumber(125000) → "1,25,000". */
export function formatNumber(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const [intPart, frac] = Math.abs(n).toFixed(decimals).split('.');
  return `${sign}${groupIndian(intPart)}${frac ? `.${frac}` : ''}`;
}

/** Full rupee amount: ₹1,25,000.00 */
export function formatINR(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '—';
  return `${n < 0 ? '-' : ''}₹${formatNumber(Math.abs(n), decimals)}`;
}

/** Compact rupee amount: ₹1.25 Cr, ₹4.50 L, ₹12.3K. */
export function formatINRCompact(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${sign}₹${(a / 1e3).toFixed(1)}K`;
  return `${sign}₹${a.toFixed(0)}`;
}

/** Signed rupee amount for P&L: +₹1,250.00 / -₹300.00 */
export function formatSignedINR(n: number, compact = false): string {
  const body = compact ? formatINRCompact(Math.abs(n)) : formatINR(Math.abs(n));
  if (Math.abs(n) < 0.005) return body;
  return `${n > 0 ? '+' : '-'}${body}`;
}

/** Percentage with a + sign for gains: +12.34% */
export function formatPct(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = n.toFixed(decimals);
  return `${n > 0 && Number(s) !== 0 ? '+' : ''}${s}%`;
}

/** Quantity without trailing zeros: 10, 12.5 */
export function formatQty(n: number): string {
  return formatNumber(n, Number.isInteger(Math.round(n * 1e4) / 1e4) ? 0 : 2);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** dd MMM yyyy, e.g. "05 Feb 2026". Accepts YYYY-MM-DD or ISO strings. */
export function formatDate(date: string | undefined | null): string {
  if (!date) return '—';
  const [y, m, d] = date.slice(0, 10).split('-');
  const mi = Number(m) - 1;
  if (!y || mi < 0 || mi > 11 || !d) return date;
  return `${d} ${MONTHS[mi]} ${y}`;
}

/** Text colour for a P&L value: green gain, red loss, grey flat. */
export function pnlColor(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || Math.abs(n) < 0.005) return colors.textMuted;
  return n > 0 ? colors.success : colors.error;
}

export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromDateInput(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Parses a user-typed number ("1,25,000.50" → 125000.5); returns NaN when invalid. */
export function parseNumber(s: string): number {
  const cleaned = s.replace(/[,₹\s]/g, '');
  if (cleaned === '') return NaN;
  return Number(cleaned);
}
