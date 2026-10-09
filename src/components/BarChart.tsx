import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { colors } from '../lib/theme';

export interface BarDatum {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarDatum[];
  height?: number;
  formatValue: (n: number) => string;
  hideValues?: boolean;
}

const MIN_BAR_SLOT = 44;
const LABEL_H = 20;

/** Vertical bars from a zero baseline: green above, red below. Scrolls when there are many periods. */
export function BarChart({ data, height = 200, formatValue, hideValues }: BarChartProps) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const slot = width > 0 ? Math.max(MIN_BAR_SLOT, width / Math.max(data.length, 1)) : MIN_BAR_SLOT;
  const chartW = Math.max(width, slot * data.length);
  const plotH = height - LABEL_H;
  const maxPos = Math.max(0, ...data.map((d) => d.value));
  const maxNeg = Math.max(0, ...data.map((d) => -d.value));
  const range = maxPos + maxNeg || 1;
  const zeroY = 8 + ((plotH - 16) * maxPos) / range;
  const scale = (plotH - 16) / range;
  const barW = Math.min(28, slot * 0.6);
  const shown = selected != null ? data[selected] : null;

  return (
    <View onLayout={onLayout}>
      <Text style={styles.selected}>
        {shown ? `${shown.label}: ${hideValues ? '••••' : formatValue(shown.value)}` : 'Tap a bar for details'}
      </Text>
      {width > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: Math.max(0, chartW - width), y: 0 }}>
          <View style={{ width: chartW, height }}>
            <Svg width={chartW} height={plotH}>
              <Line x1={0} x2={chartW} y1={zeroY} y2={zeroY} stroke={colors.border} strokeWidth={1} />
              {data.map((d, i) => {
                const h = Math.max(Math.abs(d.value) * scale, d.value === 0 ? 0 : 2);
                const x = i * slot + (slot - barW) / 2;
                const y = d.value >= 0 ? zeroY - h : zeroY;
                const fill = d.value >= 0 ? colors.successBright : colors.errorBright;
                return <Rect key={d.label + i} x={x} y={y} width={barW} height={h} rx={5} fill={fill} opacity={selected == null || selected === i ? 1 : 0.4} />;
              })}
            </Svg>
            <View style={[StyleSheet.absoluteFill, { flexDirection: 'row' }]}>
              {data.map((d, i) => (
                <Pressable
                  key={d.label + i}
                  style={{ width: slot, height }}
                  onPress={() => setSelected(selected === i ? null : i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${d.label} ${hideValues ? '' : formatValue(d.value)}`}
                >
                  <Text style={[styles.label, { top: plotH + 2 }]} numberOfLines={1}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  selected: { fontSize: 13, color: colors.textSecondary, marginBottom: 8, fontWeight: '500' },
  label: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 10, color: colors.textMuted },
});
