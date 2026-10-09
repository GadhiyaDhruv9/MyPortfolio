import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, TxnTypeBadge } from '../../src/components/Badge';
import { Button, IconButton } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { EmptyState } from '../../src/components/EmptyState';
import { Input } from '../../src/components/Input';
import { Money } from '../../src/components/Money';
import { Screen } from '../../src/components/Screen';
import { Select } from '../../src/components/Select';
import { TransactionForm } from '../../src/components/TransactionForm';
import { useData, useInstrumentMap } from '../../src/data/DataContext';
import { useSelection } from '../../src/data/useSelection';
import { applyFIFO, sortTransactions } from '../../src/domain/fifo';
import type { Transaction, TxnType } from '../../src/domain/types';
import { confirm, notify } from '../../src/lib/confirm';
import { formatDate, formatINR, formatQty } from '../../src/lib/format';
import { colors, radius, shadow, spacing, type } from '../../src/lib/theme';

const TYPE_FILTERS: { label: string; value: TxnType | 'ALL' }[] = [
  { label: 'All types', value: 'ALL' },
  { label: 'Buy', value: 'BUY' },
  { label: 'Sell', value: 'SELL' },
  { label: 'Bonus', value: 'BONUS' },
  { label: 'Split', value: 'SPLIT' },
  { label: 'IPO allotment', value: 'IPO_ALLOTMENT' },
  { label: 'Rights', value: 'RIGHTS' },
  { label: 'Transfer in', value: 'TRANSFER_IN' },
  { label: 'Transfer out', value: 'TRANSFER_OUT' },
  { label: 'Gift', value: 'GIFT' },
  { label: 'Merger', value: 'MERGER' },
  { label: 'Demerger', value: 'DEMERGER' },
];

export default function Transactions() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const { data, deleteTransaction } = useData();
  const instruments = useInstrumentMap();
  const { transactions, fifo } = useSelection();
  const [typeFilter, setTypeFilter] = useState<TxnType | 'ALL'>('ALL');
  const [query, setQuery] = useState('');
  const [form, setForm] = useState<{ editing: Transaction | null } | null>(null);

  // Other tabs link here with ?add=1 to open the form directly.
  const activeForm = form ?? (params.add ? { editing: null } : null);
  const closeForm = () => {
    setForm(null);
    if (params.add) router.setParams({ add: undefined });
  };

  const issueById = useMemo(() => new Map(fifo.issues.map((i) => [i.txnId, i.message])), [fifo.issues]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTransactions(transactions)
      .reverse()
      .filter((t) => typeFilter === 'ALL' || t.type === typeFilter)
      .filter((t) => {
        if (!q) return true;
        const inst = instruments.get(t.instrumentId);
        return !!inst && (inst.symbol.toLowerCase().includes(q) || inst.companyName.toLowerCase().includes(q));
      });
  }, [transactions, typeFilter, query, instruments]);

  const remove = async (t: Transaction) => {
    const sym = instruments.get(t.instrumentId)?.symbol ?? '';
    const ok = await confirm('Delete transaction?', `${t.type} ${formatQty(t.quantity)} ${sym} on ${formatDate(t.tradeDate)}. Lots and realized P&L will be recalculated.`);
    if (!ok) return;
    const remaining = data.transactions.filter((x) => x.id !== t.id);
    const scoped = (list: Transaction[]) => list.filter((x) => x.portfolioId === t.portfolioId && x.instrumentId === t.instrumentId);
    const before = applyFIFO(scoped(data.transactions)).issues.length;
    const after = applyFIFO(scoped(remaining)).issues.length;
    deleteTransaction(t.id);
    if (after > before) notify('Check later sells', `Deleting this ${t.type.toLowerCase()} leaves a later sell of ${sym} without enough shares. It is flagged in the list.`);
  };

  const fab = (
    <Pressable
      onPress={() => setForm({ editing: null })}
      style={({ pressed }) => [styles.fab, pressed && { transform: [{ scale: 0.95 }] }]}
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
    >
      <Ionicons name="add" size={30} color="#fff" />
    </Pressable>
  );

  return (
    <Screen title="Transactions" overlay={transactions.length ? fab : null}>
      <View style={styles.toolbar}>
        <Input
          style={{ flex: 1 }}
          placeholder="Search symbol"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="characters"
          autoCorrect={false}
          right={<Ionicons name="search" size={18} color={colors.textMuted} />}
          accessibilityLabel="Search transactions"
        />
        <Select compact icon="filter" label="Transaction type" value={typeFilter} options={TYPE_FILTERS} onChange={setTypeFilter} />
      </View>

      {!transactions.length ? (
        <Card>
          <EmptyState icon="swap-vertical-outline" title="No transactions" message="Record buys, sells and corporate actions. Everything else is calculated from them." actionLabel="Add transaction" onAction={() => setForm({ editing: null })} />
        </Card>
      ) : !list.length ? (
        <Card>
          <EmptyState icon="search-outline" title="No matches" message="Try a different symbol or type filter." />
        </Card>
      ) : (
        <>
          <Text style={type.caption}>
            {list.length} of {transactions.length} transactions
          </Text>
          {list.map((t, i) => (
            <TxnRow
              key={t.id}
              txn={t}
              index={i}
              symbol={instruments.get(t.instrumentId)?.symbol ?? '?'}
              portfolio={data.portfolios.length > 1 ? data.portfolios.find((p) => p.id === t.portfolioId)?.name : undefined}
              issue={issueById.get(t.id)}
              onEdit={() => setForm({ editing: t })}
              onDelete={() => remove(t)}
            />
          ))}
        </>
      )}

      {!transactions.length ? null : <View style={{ height: 40 }} />}
      {activeForm ? <TransactionForm editing={activeForm.editing} onClose={closeForm} /> : null}
      {!data.portfolios.length && !transactions.length ? (
        <Button title="Create a portfolio in Settings" variant="secondary" onPress={() => router.navigate('/settings')} />
      ) : null}
    </Screen>
  );
}

function TxnRow({
  txn: t,
  symbol,
  portfolio,
  issue,
  index,
  onEdit,
  onDelete,
}: {
  txn: Transaction;
  symbol: string;
  portfolio?: string;
  issue?: string;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const showAmount = t.type !== 'BONUS' && t.type !== 'SPLIT' && t.type !== 'MERGER' && t.type !== 'DEMERGER';
  const detail =
    t.type === 'BONUS' ? `Bonus ${formatQty(t.quantity)}:${formatQty(t.price)}` : t.type === 'SPLIT' ? `Split 1 → ${formatQty(t.price)}` : `${formatQty(t.quantity)} @ ${formatINR(t.price)}`;
  return (
    <Card index={index} style={issue ? { borderWidth: 1, borderColor: colors.errorBright } : undefined}>
      <View style={styles.row}>
        <TxnTypeBadge type={t.type} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.symbol}>{symbol}</Text>
            {t.source === 'kite' || t.source === 'zerodha_csv' ? <Badge label={t.source === 'kite' ? 'Kite sync' : 'Imported'} tone="neutral" /> : null}
          </View>
          <Text style={type.caption}>
            {formatDate(t.tradeDate)}
            {t.productType !== 'CNC' ? ` · ${t.productType}` : ''}
            {portfolio ? ` · ${portfolio}` : ''}
          </Text>
        </View>
        <IconButton icon="pencil" label="Edit transaction" onPress={onEdit} />
        <IconButton icon="trash-outline" label="Delete transaction" color={colors.error} onPress={onDelete} />
      </View>
      <View style={styles.amountRow}>
        <Text style={styles.detail}>{detail}</Text>
        {showAmount ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Money value={t.netAmount} style={styles.net} />
            {t.totalCharges > 0 ? (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Text style={type.caption}>charges</Text>
                <Money value={t.totalCharges} style={type.caption} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      {t.reason ? <Text style={styles.reason}>“{t.reason}”</Text> : null}
      {t.tags?.length ? (
        <View style={styles.tags}>
          {t.tags.map((tag) => (
            <Text key={tag} style={styles.tag}>
              #{tag}
            </Text>
          ))}
        </View>
      ) : null}
      {issue ? <Text style={styles.issue}>{issue}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  symbol: { fontSize: 16, fontWeight: '700', color: colors.text },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: spacing.sm },
  detail: { fontSize: 14, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  net: { fontSize: 15, fontWeight: '700', color: colors.text },
  reason: { marginTop: spacing.sm, fontSize: 13, fontStyle: 'italic', color: colors.textSecondary, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  tag: { fontSize: 12, color: colors.primary, backgroundColor: colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  issue: { marginTop: spacing.sm, fontSize: 12, color: colors.error, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
    shadowOpacity: 0.25,
    elevation: 6,
  },
});
