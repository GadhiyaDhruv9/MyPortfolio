import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '../lib/theme';
import { Modal } from './Modal';

export interface SelectOption<T extends string> {
  label: string;
  value: T;
  description?: string;
}

interface SelectProps<T extends string> {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  /** Render as a small pill (used in headers and toolbars). */
  compact?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

/** Dropdown that opens a bottom-sheet list of options. */
export function Select<T extends string>({ label, value, options, onChange, placeholder = 'Select…', style, compact, icon }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={[!compact && { gap: 6 }, style]}>
      {label && !compact ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? 'Select'}: ${current?.label ?? placeholder}`}
        style={({ pressed }) => [compact ? styles.pill : styles.field, pressed && { opacity: 0.7 }]}
      >
        {icon ? <Ionicons name={icon} size={15} color={colors.textSecondary} /> : null}
        <Text style={[compact ? styles.pillText : styles.value, !current && { color: colors.textMuted }]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={compact ? 14 : 18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} onClose={() => setOpen(false)} title={label ?? 'Select'}>
        <View style={styles.list}>
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <Pressable
                key={o.value}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.option, i > 0 && styles.divider, pressed && { backgroundColor: colors.surfaceMuted }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optionText, selected && { color: colors.primary, fontWeight: '600' }]}>{o.label}</Text>
                  {o.description ? <Text style={styles.description}>{o.description}</Text> : null}
                </View>
                {selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  value: { flex: 1, fontSize: 15, color: colors.text },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 34,
    maxWidth: 220,
  },
  pillText: { fontSize: 13, fontWeight: '600', color: colors.text, flexShrink: 1 },
  list: { backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  optionText: { fontSize: 15, color: colors.text },
  description: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
