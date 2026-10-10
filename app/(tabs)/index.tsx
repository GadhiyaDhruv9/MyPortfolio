import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '../../src/components/Card';
import { DonutChart } from '../../src/components/DonutChart';
import { EmptyState } from '../../src/components/EmptyState';
import { InfoButton, TaxDisclaimer } from '../../src/components/InfoButton';
import { LineChart } from '../../src/components/LineChart';
import { Money, MASK, usePrivacy } from '../../src/components/Money';
import { Screen, SectionTitle } from '../../src/components/Screen';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { useData } from '../../src/data/DataContext';
import { useSelection } from '../../src/data/useSelection';
import { addDays, todayISO } from '../../src/domain/fifo';
import { allocationBySector, dividendTotals, valueHistory } from '../../src/domain/holdings';
import type { HoldingSummary } from '../../src/domain/types';
import { formatDate, formatINR, formatPct, pnlColor } from '../../src/lib/format';
import { colors, spacing, type } from '../../src/lib/theme';

type Range = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';
const RANGE_DAYS: Record<Range, number | null> = { '1W': 7, '1M': 30, '3M': 91, '6M': 182, '1Y': 365, ALL: null };

export default function Dashboard() {
  const router = useRouter();
  const { data } = useData();
  const { transactions, dividends, holdings, totals, xirrPct, fifo } = useSelection();
  const hidden = usePrivacy();
  const [range, setRange] = useState<Range>('1Y');

  const history = useMemo(() => {
    const days = RANGE_DAYS[range];
    const from = days == null ? '1900-01-01' : addDays(todayISO(), -days);
    return valueHistory(transactions, data.quotes, from);
  }, [transactions, data.quotes, range]);

  const last = history.at(-1);
  const lineColor = !last || last.value >= last.invested ? colors.successBright : colors.errorBright;
  const allocation = useMemo(() => allocationBySector(holdings), [holdings]);
  const divTotals = useMemo(() => dividendTotals(dividends), [dividends]);
  const open = holdings.filter((h) => !h.isClosed);
  const gainers = [...open].filter((h) => h.unrealizedPnLPct > 0).sort((a, b) => b.unrealizedPnLPct - a.unrealizedPnLPct).slice(0, 5);
  const losers = [...open].filter((h) => h.unrealizedPnLPct < 0).sort((a, b) => a.unrealizedPnLPct - b.unrealizedPnLPct).slice(0, 5);

  if (!transactions.length) {
    return (
      <Screen title="Dashboard">
        <Card>
          <EmptyState
            icon="trending-up-outline"
            title="No investments yet"
            message="Add your first buy transaction to see portfolio value, P&L and XIRR here."
            actionLabel="Add transaction"
            onAction={() => router.navigate('/transactions?add=1')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Dashboard">
      <View style={styles.grid}>
        <StatTile index={0} label="Current value" info={INFO.currentValue}>
          <Money value={totals.currentValue} style={styles.big} />
        </StatTile>
        <StatTile index={1} label="Total invested" info={INFO.invested}>
          <Money value={totals.invested} style={styles.big} />
        </StatTile>
        <StatTile index={2} label="Total P&L" info={INFO.pnl}>
          <Money value={totals.unrealizedPnL} variant="signed" colored style={styles.big} />
          <Text style={[styles.sub, { color: pnlColor(totals.unrealizedPnLPct) }]}>{formatPct(totals.unrealizedPnLPct)}</Text>
        </StatTile>
        <StatTile index={3} label="XIRR" info={INFO.xirr}>
          <Text style={[styles.big, { color: pnlColor(xirrPct) }]}>{formatPct(xirrPct)}</Text>
          <Text style={styles.sub}>annualised</Text>
        </StatTile>
      </View>

      <Card index={4} title="Portfolio value" subtitle="Estimated from trade prices and today's quotes" right={<InfoButton title="Portfolio value over time" body={INFO.history} />}>
        <SegmentedControl
          options={(Object.keys(RANGE_DAYS) as Range[]).map((r) => ({ label: r, value: r }))}
          value={range}
          onChange={setRange}
          style={{ marginBottom: spacing.md }}
        />
        {history.length >= 2 ? (
          <LineChart
            data={history.map((p) => ({ label: formatDate(p.date), value: p.value, secondary: p.invested }))}
            formatValue={formatINR}
            hideValues={hidden}
            color={lineColor}
          />
        ) : (
          <Text style={type.small}>Not enough history in this range.</Text>
        )}
        <View style={styles.legendRow}>
          <LegendDot color={lineColor} label="Value" />
          <LegendDot color={colors.textMuted} label="Invested (dashed)" dashed />
        </View>
      </Card>

      <View style={styles.grid}>
        <StatTile index={5} label="Today's P&L" info={INFO.today}>
          <Money value={totals.dayChange} variant="signed" colored style={styles.mid} />
          <Text style={[styles.sub, { color: pnlColor(totals.dayChangePct) }]}>{formatPct(totals.dayChangePct)}</Text>
        </StatTile>
        <StatTile index={6} label="Realized P&L" info={INFO.realized}>
          <Money value={totals.realizedPnL} variant="signed" colored style={styles.mid} />
          <Text style={styles.sub}>{new Set(fifo.realized.map((r) => r.sellTxnId)).size} sells</Text>
        </StatTile>
        <StatTile index={7} label="Dividends received" info={INFO.dividends}>
          <Money value={divTotals.net} style={styles.mid} />
          <Text style={styles.sub}>{divTotals.count} payouts</Text>
        </StatTile>
        <StatTile index={8} label="Positions" info={INFO.positions}>
          <Text style={styles.mid}>{totals.openCount}</Text>
          <Text style={styles.sub}>{totals.closedCount} sold/closed</Text>
        </StatTile>
      </View>

      <Card index={9} title="Allocation by sector">
        {allocation.length ? (
          <DonutChart
            slices={allocation.map((a) => ({ label: a.label, value: a.value }))}
            centerValue={hidden ? MASK : formatINR(totals.currentValue)}
            centerLabel={`${allocation.length} sectors`}
          />
        ) : (
          <Text style={type.small}>No open positions.</Text>
        )}
      </Card>

      <SectionTitle>Top gainers</SectionTitle>
      <Card index={10} padded={false}>
        <MoverList items={gainers} empty="No holdings in profit." />
      </Card>
      <SectionTitle>Top losers</SectionTitle>
      <Card index={11} padded={false}>
        <MoverList items={losers} empty="No holdings in loss." />
      </Card>

      <TaxDisclaimer />
    </Screen>
  );
}

function StatTile({ label, info, children, index }: { label: string; info: string[]; children: React.ReactNode; index: number }) {
  return (
    <Card index={index} style={styles.tile}>
      <View style={styles.tileHeader}>
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
        <InfoButton title={label} body={info} />
      </View>
      {children}
    </Card>
  );
}

function MoverList({ items, empty }: { items: HoldingSummary[]; empty: string }) {
  if (!items.length) return <Text style={[type.small, { padding: spacing.lg }]}>{empty}</Text>;
  return (
    <View>
      {items.map((h, i) => (
        <View key={h.instrumentId} style={[styles.mover, i > 0 && styles.divider]}>
          <View style={{ flex: 1 }}>
            <Text style={type.h3}>{h.symbol}</Text>
            <Text style={type.caption} numberOfLines={1}>
              {h.companyName}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.moverPct, { color: pnlColor(h.unrealizedPnLPct) }]}>{formatPct(h.unrealizedPnLPct)}</Text>
            <Money value={h.unrealizedPnL} variant="signed" colored style={type.caption} />
          </View>
        </View>
      ))}
    </View>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: dashed ? 'transparent' : color, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }]} />
      <Text style={type.caption}>{label}</Text>
    </View>
  );
}

const INFO = {
  currentValue: ['Sum of quantity × current price for every open position.', 'Prices are the quotes saved in the app — update them from a holding’s detail sheet.'],
  invested: ['Cost of the shares you still hold, using FIFO: each remaining share carries its own buy price plus a proportional share of the buy charges.', 'Shares already sold are excluded.'],
  pnl: ['Unrealized P&L = current value − invested amount (open positions only).', 'Percentage = P&L ÷ invested × 100.'],
  xirr: [
    'Extended internal rate of return: the annualised rate that makes the present value of all cash flows zero.',
    'Cash flows: each buy is money out (net of charges), each sell is money in (net of charges), and today’s current value is treated as a final inflow.',
    'Solved with Newton-Raphson, falling back to bisection if it does not converge. Shown as “—” when there are not enough cash flows.',
  ],
  history: [
    'The app works offline and does not download historical prices.',
    'Each instrument’s price on a past date is interpolated between the prices you actually traded at and today’s quote, adjusted for splits and bonuses. Quantities on each date come from replaying your transactions.',
    'Treat the shape as indicative; the latest point always equals your current value.',
  ],
  today: ['Σ quantity × (current price − previous close) across open positions.', 'Percentage is relative to yesterday’s value of the same holdings.'],
  realized: ['Total gain or loss booked on sells, matched to buys using FIFO (oldest lot first).', 'Sell value is net of sell charges; buy cost includes buy charges.'],
  dividends: ['Net dividends received (gross − TDS) for the selected portfolios.'],
  positions: ['Open positions have shares remaining. Fully sold positions stay visible in Holdings → Sold/Closed.'],
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { flexGrow: 1, flexBasis: '45%', minWidth: 150, padding: spacing.md + 2 },
  tileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  tileLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', flex: 1 },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontWeight: '600' },
  // Sized so full amounts (₹12,34,567.89) fit two tiles to a row on a phone.
  big: { fontSize: 18, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  mid: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  mover: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  moverPct: { fontSize: 15, fontWeight: '700' },
  legendRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 0, borderTopWidth: 2 },
});
