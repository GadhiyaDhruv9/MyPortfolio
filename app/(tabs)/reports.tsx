import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarChart } from '../../src/components/BarChart';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import { InfoButton, TaxDisclaimer } from '../../src/components/InfoButton';
import { Money, usePrivacy } from '../../src/components/Money';
import { Screen } from '../../src/components/Screen';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { Select } from '../../src/components/Select';
import { useData, useInstrumentMap } from '../../src/data/DataContext';
import { useSelection } from '../../src/data/useSelection';
import { CHARGE_FIELDS, sumCharges } from '../../src/domain/charges';
import { getFY, sortTransactions, todayISO } from '../../src/domain/fifo';
import { periodBreakdown, type PeriodKind } from '../../src/domain/reports';
import { computeCapitalGains, financialYearsWithSales } from '../../src/domain/tax';
import { notify } from '../../src/lib/confirm';
import { realizedCsv, shareTextFile, transactionsCsv } from '../../src/lib/export';
import { formatINRCompact } from '../../src/lib/format';
import { colors, spacing, type } from '../../src/lib/theme';

const PERIODS: { label: string; value: PeriodKind }[] = [
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Yearly', value: 'yearly' },
  { label: 'FY', value: 'fy' },
];

export default function Reports() {
  const { data } = useData();
  const instruments = useInstrumentMap();
  const { transactions, fifo } = useSelection();
  const hidden = usePrivacy();
  const [period, setPeriod] = useState<PeriodKind>('fy');
  const [exporting, setExporting] = useState<string | null>(null);

  const rows = useMemo(() => periodBreakdown(transactions, fifo.realized, period), [transactions, fifo.realized, period]);

  // Capital gains are computed per person: the LTCG exemption applies once per FY across the selected portfolios.
  const fys = useMemo(() => {
    const list = financialYearsWithSales(fifo.realized);
    const current = getFY(todayISO());
    return list.includes(current) ? list : [current, ...list];
  }, [fifo.realized]);
  const [fy, setFy] = useState(() => fys.find((f) => fifo.realized.some((r) => getFY(r.sellDate) === f)) ?? fys[0]);
  const selectedFy = fys.includes(fy) ? fy : fys[0];
  const cg = useMemo(() => computeCapitalGains(fifo.realized, data.instruments, data.taxRules, selectedFy), [fifo.realized, data.instruments, data.taxRules, selectedFy]);
  const charges = useMemo(() => sumCharges(transactions), [transactions]);

  const portfolios = useMemo(() => new Map(data.portfolios.map((p) => [p.id, p])), [data.portfolios]);
  const stamp = todayISO();

  const doExport = async (kind: 'txns' | 'realized') => {
    setExporting(kind);
    try {
      if (kind === 'txns') {
        await shareTextFile(`transactions-${stamp}.csv`, transactionsCsv(sortTransactions(transactions), instruments, portfolios), 'text/csv', 'public.comma-separated-values-text');
      } else {
        const trades = [...fifo.realized].sort((a, b) => a.sellDate.localeCompare(b.sellDate));
        await shareTextFile(`realized-trades-${stamp}.csv`, realizedCsv(trades, instruments, portfolios, getFY), 'text/csv', 'public.comma-separated-values-text');
      }
    } catch (e) {
      notify('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };

  if (!transactions.length) {
    return (
      <Screen title="Reports">
        <Card>
          <EmptyState icon="bar-chart-outline" title="Nothing to report yet" message="Reports show realized P&L, capital gains and charges once you have transactions." />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen title="Reports">
      <SegmentedControl options={PERIODS} value={period} onChange={setPeriod} />

      <Card index={0} title="Realized P&L" subtitle={`By ${PERIODS.find((p) => p.value === period)!.label.toLowerCase()} period`} right={<InfoButton title="Realized P&L" body={INFO.realized} />}>
        {rows.some((r) => r.realizedPnL !== 0) ? (
          <BarChart data={rows.map((r) => ({ label: r.label, value: r.realizedPnL }))} formatValue={formatINRCompact} hideValues={hidden} />
        ) : (
          <Text style={type.small}>No sells yet.</Text>
        )}
      </Card>

      <Card index={1} title="Period breakdown" padded={false} style={{ paddingVertical: spacing.lg }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg }}>
          <View>
            <View style={[styles.tr, { borderTopWidth: 0 }]}>
              {COLS.map(([label, w]) => (
                <Text key={label} style={[styles.th, { width: w, textAlign: label === 'Period' ? 'left' : 'right' }]}>
                  {label}
                </Text>
              ))}
            </View>
            {[...rows].reverse().map((r) => (
              <View key={r.key} style={styles.tr}>
                <Text style={[styles.td, { width: COLS[0][1], fontWeight: '600' }]}>{r.label}</Text>
                <Cell w={COLS[1][1]} value={r.bought} />
                <Cell w={COLS[2][1]} value={r.sold} />
                <Cell w={COLS[3][1]} value={r.realizedPnL} pnl />
                <Cell w={COLS[4][1]} value={r.charges} />
                <Text style={[styles.td, { width: COLS[5][1], textAlign: 'right' }]}>{r.trades}</Text>
                <Text style={[styles.td, { width: COLS[6][1], textAlign: 'right' }]}>{r.trades ? `${r.winRate.toFixed(0)}%` : '—'}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>

      <Card
        index={2}
        title="Capital gains"
        subtitle={`Listed equity · ${cg.rules.stcgRate}% STCG / ${cg.rules.ltcgRate}% LTCG rules`}
        right={<Select compact label="Financial year" value={selectedFy} options={fys.map((f) => ({ label: f, value: f }))} onChange={setFy} />}
      >
        <Line label="STCG (net)" value={cg.stcgGains - cg.stcgLosses} pnl info={INFO.stcg} />
        <Line label="LTCG (net)" value={cg.ltcgGains - cg.ltcgLosses} pnl info={INFO.ltcg} />
        <Line label="Intraday (speculative)" value={cg.intradayNet} pnl info={INFO.intraday} />
        <View style={styles.divider} />
        <Text style={[type.h3, { marginBottom: 4 }]}>Loss set-off & carry forward</Text>
        <Line label="STCL set off against LTCG" value={cg.stclUsedAgainstLtcg} />
        <Line label="STCL carry forward" value={cg.stclCarryForward} info={INFO.carry} />
        <Line label="LTCL carry forward" value={cg.ltclCarryForward} info={INFO.carry} />
        <Line label="STCG taxable" value={cg.stcgTaxable} />
        <Line label={`LTCG exemption used (max ${formatINRCompact(cg.rules.ltcgExemption)})`} value={cg.ltcgExemptionUsed} />
        <Line label="LTCG taxable" value={cg.ltcgTaxable} />
        <View style={styles.divider} />
        <Line label={`Tax @ ${cg.stcgRate.toFixed(1)}% / ${cg.ltcgRate.toFixed(1)}%`} value={cg.baseTax} />
        {cg.surcharge > 0 ? <Line label={`Surcharge (${cg.rules.surchargeRate}%)`} value={cg.surcharge} /> : null}
        <Line label={`Health & education cess (${cg.rules.cessRate}%)`} value={cg.cess} />
        <View style={styles.taxRow}>
          <View style={styles.labelRow}>
            <Text style={type.h3}>Estimated tax</Text>
            <InfoButton title="Estimated tax" body={INFO.tax} />
          </View>
          <Money value={cg.estimatedTax} style={styles.taxValue} />
        </View>
        {cg.grandfatheredCount ? <Text style={type.caption}>Grandfathering (31 Jan 2018 FMV) applied to {cg.grandfatheredCount} lot(s).</Text> : null}
      </Card>
      <TaxDisclaimer />

      <Card index={3} title="Charges breakdown" subtitle="All time, selected portfolios" right={<InfoButton title="Charges" body={INFO.charges} />}>
        {CHARGE_FIELDS.map(([key, label]) => (key === 'otherCharges' && !charges.otherCharges ? null : <Line key={key} label={key === 'otherCharges' ? 'Other / manual' : label} value={charges[key]} />))}
        <View style={styles.taxRow}>
          <Text style={type.h3}>Total</Text>
          <Money value={charges.totalCharges} style={styles.taxValue} />
        </View>
      </Card>

      <Card index={4} title="Export">
        <View style={{ gap: spacing.sm }}>
          <Button title="Transactions CSV" icon="document-text-outline" variant="secondary" onPress={() => doExport('txns')} loading={exporting === 'txns'} />
          <Button title="Realized trades CSV" icon="receipt-outline" variant="secondary" onPress={() => doExport('realized')} loading={exporting === 'realized'} />
        </View>
      </Card>
    </Screen>
  );
}

const COLS: [string, number][] = [
  ['Period', 96],
  ['Bought', 96],
  ['Sold', 96],
  ['Realized', 100],
  ['Charges', 84],
  ['Trades', 56],
  ['Win %', 60],
];

function Cell({ w, value, pnl }: { w: number; value: number; pnl?: boolean }) {
  return (
    <View style={{ width: w, alignItems: 'flex-end' }}>
      <Money value={value} variant={pnl ? 'signedCompact' : 'compact'} colored={pnl} style={styles.td} />
    </View>
  );
}

function Line({ label, value, pnl, info }: { label: string; value: number; pnl?: boolean; info?: string[] }) {
  return (
    <View style={styles.line}>
      <View style={styles.labelRow}>
        <Text style={type.small} numberOfLines={2}>
          {label}
        </Text>
        {info ? <InfoButton title={label} body={info} /> : null}
      </View>
      <Money value={value} variant={pnl ? 'signed' : 'full'} colored={pnl} style={styles.lineValue} />
    </View>
  );
}

const INFO = {
  realized: ['Gain or loss on each sell, matched to the oldest buys first (FIFO). Sell value is net of sell charges and buy cost includes buy charges.', 'A trade counts as a win when the sell’s total realized gain is positive.'],
  stcg: ['Listed shares and equity ETFs held 365 days or less (sold via delivery).', `Shown as gains minus losses within the head, before cross set-off.`],
  ltcg: ['Held for more than 365 days. Shares bought before 1 Feb 2018 use the grandfathered cost: higher of actual cost and the lower of the 31 Jan 2018 FMV and the sale price.', 'An annual exemption (₹1.25 lakh by default) applies once per FY across all portfolios.'],
  intraday: ['MIS or same-day trades are speculative business income, taxed at your slab rate. Only totals are shown; no tax is computed here.'],
  carry: ['Short-term losses can offset both STCG and LTCG; long-term losses can only offset LTCG.', 'Unabsorbed losses can be carried forward for 8 assessment years, provided you file your return on time.'],
  tax: [
    'Losses are first set off within the same head, then remaining short-term loss offsets LTCG. The LTCG exemption is then applied.',
    'Each sale is taxed at the rate in force on its sale date (rates changed on 23 Jul 2024), surcharge is added, then 4% cess on the total.',
    'Edit the rates in Settings → Tax rules.',
  ],
  charges: ['Sum of the charges recorded on each transaction. Manual overrides appear under “Other / manual”.'],
};

const styles = StyleSheet.create({
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  th: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  td: { fontSize: 13, color: colors.text, fontVariant: ['tabular-nums'] },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  lineValue: { fontSize: 14, fontWeight: '600', color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
  taxRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  taxValue: { fontSize: 18, fontWeight: '700', color: colors.text },
});
