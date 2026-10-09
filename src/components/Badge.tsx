import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { GainClassification, TxnType } from '../domain/types';
import { colors, radius } from '../lib/theme';

export type BadgeTone = 'primary' | 'success' | 'error' | 'warning' | 'neutral' | 'purple';

const tones: Record<BadgeTone, { bg: string; fg: string }> = {
  primary: { bg: colors.primarySoft, fg: '#1d4ed8' },
  success: { bg: colors.successSoft, fg: colors.success },
  error: { bg: colors.errorSoft, fg: colors.error },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  neutral: { bg: '#eef2f6', fg: colors.textSecondary },
  purple: { bg: '#ede9fe', fg: '#6d28d9' },
};

export function Badge({ label, tone = 'neutral', style }: { label: string; tone?: BadgeTone; style?: StyleProp<ViewStyle> }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const TXN_TONES: Partial<Record<TxnType, BadgeTone>> = {
  BUY: 'success',
  SELL: 'error',
  BONUS: 'purple',
  SPLIT: 'purple',
  IPO_ALLOTMENT: 'primary',
  RIGHTS: 'primary',
  TRANSFER_IN: 'warning',
  TRANSFER_OUT: 'warning',
  GIFT: 'warning',
};

export function TxnTypeBadge({ type }: { type: TxnType }) {
  return <Badge label={type.replace('_', ' ')} tone={TXN_TONES[type] ?? 'neutral'} />;
}

const CLASS_BADGE: Record<GainClassification, { label: string; tone: BadgeTone }> = {
  intraday: { label: 'Intraday', tone: 'warning' },
  stcg: { label: 'STCG', tone: 'primary' },
  ltcg: { label: 'LTCG', tone: 'purple' },
};

export function GainClassBadge({ classification }: { classification: GainClassification }) {
  const b = CLASS_BADGE[classification];
  return <Badge label={b.label} tone={b.tone} />;
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
});
