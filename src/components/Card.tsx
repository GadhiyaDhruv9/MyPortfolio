import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { colors, radius, shadow, spacing, type } from '../lib/theme';

interface CardProps {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Stagger index for the entry animation. */
  index?: number;
  padded?: boolean;
}

export function Card({ title, subtitle, right, children, style, onPress, index = 0, padded = true }: CardProps) {
  const header = (title || right) && (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {title ? <Text style={type.h3}>{title}</Text> : null}
        {subtitle ? <Text style={[type.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
  const body = (
    <>
      {header}
      {children}
    </>
  );
  return (
    <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index, 8) * 40)} style={[styles.card, padded && styles.padded, style]}>
      {onPress ? (
        <Pressable onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.7 }]} accessibilityRole="button">
          {body}
        </Pressable>
      ) : (
        body
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadow,
  },
  padded: { padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm },
});
