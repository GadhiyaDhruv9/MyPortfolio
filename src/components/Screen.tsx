import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from '../data/DataContext';
import { colors, spacing, type } from '../lib/theme';
import { Select } from './Select';

interface ScreenProps {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  /** Render children directly (for screens that manage their own list). */
  scroll?: boolean;
  showPortfolioSwitcher?: boolean;
  /** Rendered above the scroll view (e.g. a floating action button). */
  overlay?: ReactNode;
}

export function Screen({ title, right, children, scroll = true, showPortfolioSwitcher = true, overlay }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.titleRow}>
        <Text style={type.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.right}>
          {showPortfolioSwitcher ? <PortfolioSwitcher /> : null}
          {right}
        </View>
      </View>
    </View>
  );
  if (!scroll) {
    return (
      <View style={styles.root}>
        {header}
        <View style={{ flex: 1 }}>{children}</View>
        {overlay}
      </View>
    );
  }
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {header}
        <View style={styles.body}>{children}</View>
      </ScrollView>
      {overlay}
    </View>
  );
}

export function PortfolioSwitcher() {
  const { data, selectedPortfolioId, setSelectedPortfolioId } = useData();
  if (data.portfolios.length < 1) return null;
  const options = [
    { label: 'All portfolios', value: 'all', description: `${data.portfolios.length} portfolios combined` },
    ...data.portfolios.map((p) => ({ label: p.name, value: p.id, description: [p.owner, p.broker].filter(Boolean).join(' · ') })),
  ];
  return (
    <Select
      compact
      icon="briefcase-outline"
      label="Portfolio"
      value={selectedPortfolioId ?? 'all'}
      options={options}
      onChange={(v) => setSelectedPortfolioId(v === 'all' ? null : v)}
    />
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={type.h2}>{children}</Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, width: '100%', maxWidth: 900, alignSelf: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  content: { paddingBottom: 120 },
  body: { paddingHorizontal: spacing.lg, gap: spacing.md, width: '100%', maxWidth: 900, alignSelf: 'center' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
});
