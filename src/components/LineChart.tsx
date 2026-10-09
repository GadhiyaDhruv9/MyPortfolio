import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors } from '../lib/theme';

export interface LinePoint {
  label: string;
  value: number;
  /** Optional second series drawn dashed (e.g. invested amount). */
  secondary?: number;
}

interface LineChartProps {
  data: LinePoint[];
  height?: number;
  color?: string;
  secondaryColor?: string;
  formatValue: (n: number) => string;
  /** Hide the scrub tooltip values (privacy mode). */
  hideValues?: boolean;
}

const PAD_Y = 12;

/** Area line chart with touch-to-scrub. Drawn with react-native-svg (bundled in Expo Go). */
export function LineChart({ data, height = 180, color = colors.primary, secondaryColor = colors.textMuted, formatValue, hideValues }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  const { path, area, secondaryPath, xs, ys } = useMemo(() => {
    if (width === 0 || data.length < 2) return { path: '', area: '', secondaryPath: '', xs: [] as number[], ys: [] as number[] };
    const values = data.flatMap((d) => (d.secondary != null ? [d.value, d.secondary] : [d.value]));
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (max === min) {
      max += 1;
      min -= 1;
    }
    const innerH = height - PAD_Y * 2;
    const x = (i: number) => (i / (data.length - 1)) * width;
    const y = (v: number) => PAD_Y + innerH - ((v - min) / (max - min)) * innerH;
    const xs = data.map((_, i) => x(i));
    const ys = data.map((d) => y(d.value));
    const path = xs.map((px, i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
    const area = `${path} L${width},${height} L0,${height} Z`;
    const secondaryPath = data.every((d) => d.secondary != null)
      ? data.map((d, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${y(d.secondary!).toFixed(1)}`).join(' ')
      : '';
    return { path, area, secondaryPath, xs, ys };
  }, [data, width, height]);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const scrub = (e: GestureResponderEvent) => {
    if (!xs.length) return;
    const lx = e.nativeEvent.locationX;
    const i = Math.round((lx / width) * (data.length - 1));
    setActive(Math.max(0, Math.min(data.length - 1, i)));
  };

  const shown = active ?? data.length - 1;
  const point = data[shown];

  return (
    <View>
      <View style={styles.tooltipRow}>
        {point ? (
          <>
            <Text style={styles.tooltipValue}>{hideValues ? '••••' : formatValue(point.value)}</Text>
            <Text style={styles.tooltipLabel}>{point.label}</Text>
          </>
        ) : null}
      </View>
      <View
        onLayout={onLayout}
        style={{ height }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={scrub}
        onResponderMove={scrub}
        onResponderRelease={() => setActive(null)}
        onResponderTerminate={() => setActive(null)}
        accessibilityLabel="Portfolio value chart"
      >
        {width > 0 && data.length >= 2 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#lineFill)" />
            {secondaryPath ? <Path d={secondaryPath} stroke={secondaryColor} strokeWidth={1.5} strokeDasharray="4 4" fill="none" /> : null}
            <Path d={path} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {active != null ? (
              <>
                <Line x1={xs[active]} x2={xs[active]} y1={0} y2={height} stroke={colors.border} strokeWidth={1} />
                <Circle cx={xs[active]} cy={ys[active]} r={5} fill={colors.surface} stroke={color} strokeWidth={2.5} />
              </>
            ) : null}
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tooltipRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6, minHeight: 22 },
  tooltipValue: { fontSize: 17, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  tooltipLabel: { fontSize: 12, color: colors.textMuted },
});
