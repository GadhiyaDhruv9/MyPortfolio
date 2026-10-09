import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { formatDate, fromDateInput, toDateInput } from '../lib/format';
import { colors, radius, spacing } from '../lib/theme';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';

interface DateFieldProps {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  maximumDate?: Date;
  style?: StyleProp<ViewStyle>;
}

/** Date input: native calendar on iOS/Android, typed YYYY-MM-DD on web. */
export function DateField({ label, value, onChange, maximumDate, style }: DateFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState(() => fromDateInput(value));

  if (Platform.OS === 'web') {
    const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);
    return (
      <Input
        label={label}
        value={value}
        onChangeText={onChange}
        placeholder="YYYY-MM-DD"
        style={style}
        error={value && !valid ? 'Use YYYY-MM-DD' : null}
      />
    );
  }

  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: fromDateInput(value),
        mode: 'date',
        maximumDate,
        onChange: (event, date) => {
          if (event.type === 'set' && date) onChange(toDateInput(date));
        },
      });
    } else {
      setDraft(fromDateInput(value));
      setIosOpen(true);
    }
  };

  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={open} style={({ pressed }) => [styles.field, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`${label}: ${formatDate(value)}`}>
        <Text style={styles.value}>{formatDate(value)}</Text>
        <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
      </Pressable>
      {Platform.OS === 'ios' ? (
        <Modal
          visible={iosOpen}
          onClose={() => setIosOpen(false)}
          title={label}
          footer={
            <Button
              title="Done"
              onPress={() => {
                onChange(toDateInput(draft));
                setIosOpen(false);
              }}
            />
          }
        >
          <View style={styles.calendar}>
            <DateTimePicker value={draft} mode="date" display="inline" maximumDate={maximumDate} onChange={(_, d) => d && setDraft(d)} accentColor={colors.primary} />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  value: { flex: 1, fontSize: 15, color: colors.text },
  calendar: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm },
});
