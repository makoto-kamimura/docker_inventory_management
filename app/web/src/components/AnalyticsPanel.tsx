"use client";

import { useEffect, useState } from "react";
import {
  api,
  type AnalyticsMetric,
  type AnalyticsPeriod,
  type AnalyticsQuery,
  type AnalyticsTimeseries,
} from "@/lib/api";
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
} from "@/lib/inventory";
import { ReloadButton, SegControl, cls } from "./ui";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const data = result?.data;

  return (
    <section className={cls.card}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="font-semibold">{ANALYTICS_TITLE[query.metric]}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegControl
            value={query.metric}
            onChange={(metric) => onChangeQuery({ ...query, metric })}
            options={ANALYTICS_METRIC_OPTIONS}
          />
          <SegControl
            value={query.period}
            onChange={(period) => onChangeQuery({ ...query, period })}
            options={ANALYTICS_PERIOD_OPTIONS}
          />
          <SegControl
            value={query.group}
            onChange={(group) => onChangeQuery({ ...query, group })}
            options={ANALYTICS_GROUP_OPTIONS}
          />
          <ReloadButton onClick={() => setReloadCount((n) => n + 1)} />
        </div>
      </header>
      {loading ? (
        <p className={cls.muted}>読み込み中...</p>
      ) : !data || data.series.length === 0 ? (
        <p className={cls.muted}>履歴がありません</p>
      ) : (
        <AnalyticsLineChart data={data} period={query.period} metric={query.metric} />
      )}
    </section>
  );
}

function AnalyticsLineChart({
  data,
  period,
  metric,
}: {
  data: AnalyticsTimeseries;
  period: AnalyticsPeriod;
  metric: AnalyticsMetric;
}) {
  const { labels, series } = data;
  const scale = chartScale(series);
  const fmt = (v: number) => formatMetricValue(v, metric);

  const width = 1000;
  const height = 360;
  const padL = metric === "amount" ? 72 : 48;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = labels.length;

  const xAt = (i: number) => (n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1));
  const yAt = (v: number) => padT + plotH - ((v - scale.min) / (scale.max - scale.min || 1)) * plotH;
  const xTickStride = Math.max(1, Math.ceil(n / 8));

  return (
    <div className="px-4 py-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label={ANALYTICS_TITLE[metric]}
      >
        {scale.ticks.map((t) => (
          <g key={`y-${t}`}>
            <line x1={padL} y1={yAt(t)} x2={width - padR} y2={yAt(t)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
            <text x={padL - 6} y={yAt(t)} textAnchor="end" dominantBaseline="central" className="fill-zinc-500 text-[10px]">
              {fmt(t)}
            </text>
          </g>
        ))}

        {labels.map((label, i) =>
          i % xTickStride !== 0 && i !== n - 1 ? null : (
            <text key={`x-${label}`} x={xAt(i)} y={height - padB + 16} textAnchor="middle" className="fill-zinc-500 text-[10px]">
              {formatBucketLabel(label, period)}
            </text>
          ),
        )}

        <line x1={padL} y1={padT} x2={padL} y2={height - padB} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />

        {series.map((s, si) => {
          const color = seriesColor(si);
          const pathD = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
          return (
            <g key={`s-${s.name}`}>
              <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={`p-${s.name}-${i}`} cx={xAt(i)} cy={yAt(v)} r={2.5} fill={color}>
                  <title>{`${s.name} / ${formatBucketLabel(labels[i], period)}: ${fmt(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {series.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s, si) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: seriesColor(si) }} />
              <span className="text-zinc-700 dark:text-zinc-200">{s.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
