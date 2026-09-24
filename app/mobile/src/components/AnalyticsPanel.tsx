import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import {
  api,
  type AnalyticsMetric,
  type AnalyticsPeriod,
  type AnalyticsQuery,
  type AnalyticsTimeseries,
} from "../api";
import {
  ANALYTICS_GROUP_OPTIONS,
  ANALYTICS_METRIC_OPTIONS,
  ANALYTICS_PERIOD_OPTIONS,
  ANALYTICS_TITLE,
  chartScale,
  errorMessage,
  formatBucketLabel,
  formatMetricValue,
  seriesColor,
} from "../inventory";
import { colors, styles } from "../styles";
import { ChipSelect, IconButton } from "./ui";

export function AnalyticsPanel({
  query,
  onChangeQuery,
  onError,
}: {
  query: AnalyticsQuery;
  onChangeQuery: (next: AnalyticsQuery) => void;
  onError: (message: string) => void;
}) {
  // 条件 (+ 再読み込み回数) ごとに結果を保持し、結果が現在の条件に追いつくまで読み込み中とする
  const [reloadCount, setReloadCount] = useState(0);
  const key = `${query.period}/${query.group}/${query.metric}/${reloadCount}`;
  const [result, setResult] = useState<{ key: string; data: AnalyticsTimeseries | null } | null>(null);
  const loading = result?.key !== key;

  useEffect(() => {
    let active = true;
    api.listAnalyticsTimeseries(query).then(
      (data) => active && setResult({ key, data }),
      (e) => {
        if (!active) return;
        setResult({ key, data: null });
        onError(errorMessage(e));
      },
    );
    return () => {
      active = false;
    };
    // key が query と reloadCount を表す
  }, [key]);

  const data = result?.data;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.h2}>{ANALYTICS_TITLE[query.metric]}</Text>
          <IconButton label="再読み込み" icon="↻" onPress={() => setReloadCount((n) => n + 1)} />
        </View>
        <ChipSelect
          options={ANALYTICS_METRIC_OPTIONS}
          value={query.metric}
          onChange={(metric) => onChangeQuery({ ...query, metric })}
        />
        <ChipSelect
          options={ANALYTICS_PERIOD_OPTIONS}
          value={query.period}
          onChange={(period) => onChangeQuery({ ...query, period })}
        />
        <ChipSelect
          options={ANALYTICS_GROUP_OPTIONS}
          value={query.group}
          onChange={(group) => onChangeQuery({ ...query, group })}
        />
        {loading ? (
          <ActivityIndicator />
        ) : !data || data.series.length === 0 ? (
          <Text style={styles.muted}>履歴がありません</Text>
        ) : (
          <LineChart data={data} period={query.period} metric={query.metric} />
        )}
      </View>
    </ScrollView>
  );
}

const CHART_HEIGHT = 220;
const LINE_WIDTH = 2;
const DOT_SIZE = 5;

/** react-native-svg を追加せずに描くため、線分は回転させた View で表現する */
function LineChart({
  data,
  period,
  metric,
}: {
  data: AnalyticsTimeseries;
  period: AnalyticsPeriod;
  metric: AnalyticsMetric;
}) {
  const [width, setWidth] = useState(0);
  const { labels, series } = data;
  const scale = chartScale(series);

  const padL = metric === "amount" ? 64 : 36;
  const padR = 8;
  const padT = 8;
  const padB = 24;
  const plotW = Math.max(0, width - padL - padR);
  const plotH = CHART_HEIGHT - padT - padB;
  const n = labels.length;

  const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1));
  const yAt = (v: number) => padT + plotH - ((v - scale.min) / (scale.max - scale.min || 1)) * plotH;
  const xTickStride = Math.max(1, Math.ceil(n / 5));

  return (
    <View>
      <View style={{ height: CHART_HEIGHT }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <>
            {scale.ticks.map((t) => (
              <View key={`y-${t}`}>
                <View
                  style={{
                    position: "absolute",
                    left: padL,
                    top: yAt(t),
                    width: plotW,
                    height: 1,
                    backgroundColor: colors.border,
                  }}
                />
                <Text
                  style={[styles.chartLabel, { left: 0, top: yAt(t) - 7, width: padL - 6, textAlign: "right" }]}
                  numberOfLines={1}
                >
                  {formatMetricValue(t, metric)}
                </Text>
              </View>
            ))}

            {labels.map((label, i) =>
              i % xTickStride !== 0 && i !== n - 1 ? null : (
                <Text
                  key={`x-${label}`}
                  style={[styles.chartLabel, { left: xAt(i) - 20, top: CHART_HEIGHT - padB + 6, width: 40, textAlign: "center" }]}
                >
                  {formatBucketLabel(label, period)}
                </Text>
              ),
            )}

            <View
              style={{ position: "absolute", left: padL, top: padT, width: 1, height: plotH, backgroundColor: colors.inputBorder }}
            />
            <View
              style={{ position: "absolute", left: padL, top: padT + plotH, width: plotW, height: 1, backgroundColor: colors.inputBorder }}
            />

            {series.map((s, si) => {
              const color = seriesColor(si);
              const points = s.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
              return (
                <View key={`s-${s.name}`} style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
                  {points.slice(1).map((p, i) => (
                    <Segment key={`l-${i}`} from={points[i]} to={p} color={color} />
                  ))}
                  {points.map((p, i) => (
                    <View
                      key={`p-${i}`}
                      style={{
                        position: "absolute",
                        left: p.x - DOT_SIZE / 2,
                        top: p.y - DOT_SIZE / 2,
                        width: DOT_SIZE,
                        height: DOT_SIZE,
                        borderRadius: DOT_SIZE / 2,
                        backgroundColor: color,
                      }}
                    />
                  ))}
                </View>
              );
            })}
          </>
        )}
      </View>

      {series.length > 1 && (
        <View style={styles.legendRow}>
          {series.map((s, si) => (
            <View key={s.name} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: seriesColor(si) }]} />
              <Text style={styles.legendText}>{s.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Segment({
  from,
  to,
  color,
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
}) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  // 中点を基準に回転するため、線分の中心を 2 点の中点に置く
  return (
    <View
      style={{
        position: "absolute",
        left: (from.x + to.x) / 2 - length / 2,
        top: (from.y + to.y) / 2 - LINE_WIDTH / 2,
        width: length,
        height: LINE_WIDTH,
        backgroundColor: color,
        transform: [{ rotate: `${angle}rad` }],
      }}
    />
  );
}
