import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { chartPalette, colors } from '../lib/theme';

export interface DonutSlice {
  label: string;
  value: number;
}

interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = end - start;
  const large = sweep > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`;
}

/** Donut with a legend showing each slice's share. */
export function DonutChart({ slices, size = 160, thickness = 22, centerLabel, centerValue }: DonutChartProps) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const gap = slices.length > 1 ? 0.025 : 0;
  let angle = -Math.PI / 2;

  return (
    <View style={styles.row}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={c} cy={c} r={r} stroke={colors.border} strokeWidth={thickness} fill="none" />
          <G>
            {total > 0 &&
              slices.map((s, i) => {
                const sweep = (Math.max(0, s.value) / total) * Math.PI * 2;
                const start = angle;
                angle += sweep;
                if (sweep <= 0) return null;
                const color = chartPalette[i % chartPalette.length];
                if (sweep >= Math.PI * 2 - 1e-6) {
                  return <Circle key={s.label} cx={c} cy={c} r={r} stroke={color} strokeWidth={thickness} fill="none" />;
                }
                return (
                  <Path
                    key={s.label}
                    d={arcPath(c, c, r, start + gap / 2, start + Math.max(sweep - gap / 2, gap / 2 + 0.001))}
                    stroke={color}
                    strokeWidth={thickness}
                    fill="none"
                  />
                );
              })}
          </G>
        </Svg>
        {centerValue ? (
          <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <Text style={styles.centerValue} numberOfLines={1} adjustsFontSizeToFit>
              {centerValue}
            </Text>
            {centerLabel ? <Text style={styles.centerLabel}>{centerLabel}</Text> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.legend}>
        {slices.map((s, i) => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: chartPalette[i % chartPalette.length] }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={styles.legendPct}>{total > 0 ? ((Math.max(0, s.value) / total) * 100).toFixed(1) : '0.0'}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  centerValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  centerLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  legend: { flex: 1, minWidth: 140, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, fontSize: 13, color: colors.textSecondary },
  legendPct: { fontSize: 13, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
});
