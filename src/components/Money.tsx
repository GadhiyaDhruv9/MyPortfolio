import { useEffect, useState } from 'react';
import { Pressable, Text, type StyleProp, type TextStyle } from 'react-native';

import { useData } from '../data/DataContext';
import { formatINR, formatSignedINR, pnlColor } from '../lib/format';

export const MASK = '••••••';

interface MoneyProps {
  value: number;
  /** "full" ₹1,25,000.00 · "signed" +₹1,250.00 */
  variant?: 'full' | 'signed';
  /** Colour by sign (green/red/grey). */
  colored?: boolean;
  style?: StyleProp<TextStyle>;
  decimals?: number;
}

/**
 * Renders a rupee amount. In privacy mode it is masked; tapping reveals it for a
 * few seconds.
 */
export function Money({ value, variant = 'full', colored, style, decimals }: MoneyProps) {
  const { data } = useData();
  const [revealed, setRevealed] = useState(false);
  const hidden = data.settings.privacyMode && !revealed;

  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(false), 4000);
    return () => clearTimeout(t);
  }, [revealed]);

  const text = variant === 'signed' ? formatSignedINR(value) : formatINR(value, decimals);

  const content = (
    <Text style={[{ fontVariant: ['tabular-nums'] }, style, colored && { color: pnlColor(value) }, hidden && { letterSpacing: 1 }]} numberOfLines={1}>
      {hidden ? MASK : text}
    </Text>
  );

  if (!data.settings.privacyMode) return content;
  return (
    <Pressable onPress={() => setRevealed((r) => !r)} accessibilityRole="button" accessibilityLabel={hidden ? 'Hidden amount. Tap to reveal' : text} hitSlop={6}>
      {content}
    </Pressable>
  );
}

/** Whether amounts should be masked in places that cannot use <Money> (chart tooltips). */
export function usePrivacy(): boolean {
  return useData().data.settings.privacyMode;
}
