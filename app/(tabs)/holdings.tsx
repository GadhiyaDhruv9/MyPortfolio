import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Badge } from '../../src/components/Badge';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import { HoldingDetail } from '../../src/components/HoldingDetail';
import { Input } from '../../src/components/Input';
import { Money } from '../../src/components/Money';
import { Screen } from '../../src/components/Screen';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { Select } from '../../src/components/Select';
import { useSelection } from '../../src/data/useSelection';
import type { HoldingSummary } from '../../src/domain/types';
import { formatINR, formatPct, formatQty, pnlColor } from '../../src/lib/format';
import { colors, spacing, type } from '../../src/lib/theme';

type SortKey = 'value' | 'pnl' | 'pnlPct' | 'name' | 'sector';

const SORTS: { label: string; value: SortKey }[] = [
  { label: 'Value', value: 'value' },
  { label: 'P&L (₹)', value: 'pnl' },
  { label: 'P&L (%)', value: 'pnlPct' },
  { label: 'Name', value: 'name' },
  { label: 'Sector', value: 'sector' },
];

function sortHoldings(list: HoldingSummary[], key: SortKey, closed: boolean): HoldingSummary[] {
  const pnl = (h: HoldingSummary) => (closed ? h.realizedPnL : h.unrealizedPnL);
  const copy = [...list];
  switch (key) {
    case 'value':
      return copy.sort((a, b) => (closed ? b.realizedPnL - a.realizedPnL : b.currentValue - a.currentValue));
    case 'pnl':
      return copy.sort((a, b) => pnl(b) - pnl(a));
    case 'pnlPct':
      return copy.sort((a, b) => b.unrealizedPnLPct - a.unrealizedPnLPct);
    case 'name':
      return copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
    case 'sector':
      return copy.sort((a, b) => (a.sector ?? '').localeCompare(b.sector ?? '') || a.symbol.localeCompare(b.symbol));
  }
}

export default function Holdings() {
  const router = useRouter();
  const { holdings, transactions } = useSelection();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('value');
  const [selected, setSelected] = useState<string | null>(null);

  const openCount = holdings.filter((h) => !h.isClosed).length;
  const closedCount = holdings.length - openCount;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = holdings.filter(
      (h) => h.isClosed === (tab === 'closed') && (!q || h.symbol.toLowerCase().includes(q) || h.companyName.toLowerCase().includes(q)),
    );
    return sortHoldings(filtered, sort, tab === 'closed');
  }, [holdings, tab, query, sort]);

  const selectedHolding = holdings.find((h) => h.instrumentId === selected) ?? null;

  return (
    <Screen title="Holdings">
      <SegmentedControl
        options={[
          { label: `Open (${openCount})`, value: 'open' },
          { label: `Sold/Closed (${closedCount})`, value: 'closed' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={styles.toolbar}>
        <Input
          style={{ flex: 1 }}
          placeholder="Search symbol or company"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          right={<Ionicons name="search" size={18} color={colors.textMuted} />}
          accessibilityLabel="Search holdings"
        />
        <Select compact icon="swap-vertical" label="Sort by" value={sort} options={SORTS} onChange={setSort} />
      </View>

      {!transactions.length ? (
        <Card>
          <EmptyState
            icon="briefcase-outline"
            title="No holdings yet"
            message="Holdings are built from your transactions. Add a buy to get started."
            actionLabel="Add transaction"
            onAction={() => router.navigate('/transactions?add=1')}
          />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={query ? 'search-outline' : tab === 'open' ? 'briefcase-outline' : 'archive-outline'}
            title={query ? 'No matches' : tab === 'open' ? 'No open positions' : 'No closed positions'}
            message={query ? `Nothing matches “${query}”.` : tab === 'open' ? 'Everything has been sold. Closed positions are under Sold/Closed.' : 'Fully sold positions will appear here and are never deleted.'}
          />
        </Card>
      ) : (
        list.map((h, i) => <HoldingCard key={h.instrumentId} holding={h} index={i} onPress={() => setSelected(h.instrumentId)} />)
      )}

      <HoldingDetail holding={selectedHolding} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function HoldingCard({ holding: h, index, onPress }: { holding: HoldingSummary; index: number; onPress: () => void }) {
  return (
    <Card index={index} onPress={onPress}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.symbolRow}>
            <Text style={styles.symbol}>{h.symbol}</Text>
            {h.sector ? <Badge label={h.sector} tone="primary" /> : null}
          </View>
          <Text style={type.caption} numberOfLines={1}>
            {h.companyName}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {h.isClosed ? (
            <>
              <Money value={h.realizedPnL} variant="signed" colored style={styles.value} />
              <Text style={type.caption}>realized</Text>
            </>
          ) : (
            <>
              <Money value={h.currentValue} style={styles.value} />
              <Text style={[styles.pct, { color: pnlColor(h.unrealizedPnLPct) }]}>{formatPct(h.unrealizedPnLPct)}</Text>
            </>
          )}
        </View>
      </View>
      {!h.isClosed ? (
        <View style={styles.metaRow}>
          <Meta label="Qty" value={formatQty(h.quantity)} />
          <Meta label="Avg cost" value={<Money value={h.avgBuyPrice} style={styles.metaValue} />} />
          <Meta label="LTP" value={formatINR(h.currentPrice)} />
          <Meta label="Weight" value={`${h.weight.toFixed(1)}%`} />
        </View>
      ) : null}
    </Card>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={type.caption}>{label}</Text>
      {typeof value === 'string' ? <Text style={styles.metaValue}>{value}</Text> : value}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  symbolRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  symbol: { fontSize: 16, fontWeight: '700', color: colors.text },
  value: { fontSize: 16, fontWeight: '700', color: colors.text },
  pct: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  metaRow: { flexDirection: 'row', marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: spacing.sm },
  metaValue: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },
});
