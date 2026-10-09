import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '../lib/theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
type IconName = ComponentProps<typeof Ionicons>['name'];

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Fill the toggle as selected (used for Buy/Sell toggles). */
  active?: boolean;
}

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
  danger: { bg: colors.errorSoft, fg: colors.error, border: colors.errorSoft },
  success: { bg: colors.successSoft, fg: colors.success, border: colors.successSoft },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

export function Button({ title, onPress, variant = 'primary', size = 'md', icon, disabled, loading, style, active }: ButtonProps) {
  let p = palette[variant];
  if (active === true && variant === 'success') p = { bg: colors.successBright, fg: '#fff', border: colors.successBright };
  if (active === true && variant === 'danger') p = { bg: colors.errorBright, fg: '#fff', border: colors.errorBright };
  const height = size === 'sm' ? 34 : size === 'lg' ? 52 : 44;
  const fontSize = size === 'sm' ? 13 : 15;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected: active }}
      style={({ pressed }) => [
        styles.base,
        { height, backgroundColor: p.bg, borderColor: p.border, paddingHorizontal: size === 'sm' ? 12 : 16 },
        pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
        (disabled || loading) && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={fontSize + 3} color={p.fg} /> : null}
          <Text style={[styles.text, { color: p.fg, fontSize }]} numberOfLines={1}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color = colors.textSecondary,
  label,
  size = 20,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  label: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.icon, pressed && { backgroundColor: colors.background }]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.md - 4,
    borderWidth: 1,
  },
  text: { fontWeight: '600' },
  icon: { padding: 6, borderRadius: radius.pill },
});
