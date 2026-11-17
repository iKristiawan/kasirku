import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { Transaction, Product } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface ThirtyDayRevenueTrendChartProps {
  transactions: Transaction[];
  productMap: Map<string, Product>;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

interface DayTrendPoint {
  idx: number;
  dateLabel: string;
  fullDateLabel: string;
  prevFullDateLabel: string;
  currentRevenue: number;
  previousRevenue: number;
  movingAvg7d: number;
  currentTxCount: number;
  previousTxCount: number;
  diffAmount: number;
  diffPercent: number;
  isToday: boolean;
  isPeakDay: boolean;
}

export const ThirtyDayRevenueTrendChart: React.FC<ThirtyDayRevenueTrendChartProps> = ({
  transactions,
  productMap,
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette } = useChartTheme();
  const [showPrev30d, setShowPrev30d] = useState<boolean>(true);
  const [showMovingAvg, setShowMovingAvg] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const {
    dailyPoints,
    rangeLabel,
    prevRangeLabel,
    total30dRevenue,
    totalPrev30dRevenue,
    avgDaily30dRevenue,
    growth30dPercent,
    total30dTxCount,
    peakDay,
    hasAnyData,
    hasPrev30dData,
  } = useMemo(() => {
    const now = new Date();
    const oneDayMs = 86400000;
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start30dMs = todayStart - 29 * oneDayMs;
    const end30dMs = todayStart + oneDayMs - 1;
    const prev30dStartMs = start30dMs - 30 * oneDayMs;
    const prev30dEndMs = start30dMs - 1;
    const maPreWindowStartMs = start30dMs - 6 * oneDayMs;

    const isFiltered = hiddenCategorySet.size > 0;

    // Track 36 days (6 days prior + 30 days) for accurate 7-day moving average from day 1
    const pre6DailyRev = new Array<number>(6).fill(0);

    const rawCurrentBuckets = Array.from({ length: 30 }, (_, idx) => {
      const dayTs = start30dMs + idx * oneDayMs;
      const prevTs = prev30dStartMs + idx * oneDayMs;
      const d = new Date(dayTs);
      const pd = new Date(prevTs);
      const isToday = dayTs === todayStart;
      return {
        idx,
        dayTs,
        dateLabel: isToday
          ? 'Hari Ini'
          : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        fullDateLabel: d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        prevFullDateLabel: pd.toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
        currentRevenue: 0,
        previousRevenue: 0,
        currentTxCount: 0,
        previousTxCount: 0,
        isToday,
      };
    });

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      if (ts < prev30dStartMs || ts > end30dMs) return;

      let matchedRevenue = tx.finalAmount || 0;
      let hasMatch = !isFiltered;

      if (isFiltered) {
        matchedRevenue = 0;
        hasMatch = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (!hiddenCategorySet.has(catName)) {
            matchedRevenue += item.totalAmount || 0;
            hasMatch = true;
          }
        });
      }

      if (!hasMatch) return;

      if (ts >= start30dMs && ts <= end30dMs) {
        const idx = Math.floor((ts - start30dMs) / oneDayMs);
        if (rawCurrentBuckets[idx]) {
          rawCurrentBuckets[idx].currentRevenue += matchedRevenue;
          rawCurrentBuckets[idx].currentTxCount += 1;
        }
      } else {
        if (ts >= prev30dStartMs && ts <= prev30dEndMs) {
          const prevIdx = Math.floor((ts - prev30dStartMs) / oneDayMs);
          if (rawCurrentBuckets[prevIdx]) {
            rawCurrentBuckets[prevIdx].previousRevenue += matchedRevenue;
            rawCurrentBuckets[prevIdx].previousTxCount += 1;
          }
        }
        if (ts >= maPreWindowStartMs && ts < start30dMs) {
          const preIdx = Math.floor((ts - maPreWindowStartMs) / oneDayMs);
          if (preIdx >= 0 && preIdx < 6) {
            pre6DailyRev[preIdx] += matchedRevenue;
          }
        }
      }
    });

    const combinedSeries = [
      ...pre6DailyRev,
      ...rawCurrentBuckets.map((b) => b.currentRevenue),
    ];

    let sum30 = 0;
    let sumPrev30 = 0;
    let tx30 = 0;
    let maxIdx = -1;
    let maxVal = -1;

    rawCurrentBuckets.forEach((b, idx) => {
      sum30 += b.currentRevenue;
      sumPrev30 += b.previousRevenue;
      tx30 += b.currentTxCount;
      if (b.currentRevenue > 0 && b.currentRevenue > maxVal) {
        maxVal = b.currentRevenue;
        maxIdx = idx;
      }
    });

    const points: DayTrendPoint[] = rawCurrentBuckets.map((b, idx) => {
      const sliceStart = idx; // corresponds to combinedSeries[idx .. idx+6]
      let maSum = 0;
      for (let k = sliceStart; k <= sliceStart + 6; k++) {
        maSum += combinedSeries[k] || 0;
      }
      const movingAvg7d = Math.round(maSum / 7);
      const diffAmount = b.currentRevenue - b.previousRevenue;
      const diffPercent =
        b.previousRevenue > 0
          ? ((b.currentRevenue - b.previousRevenue) / b.previousRevenue) * 100
          : b.currentRevenue > 0
          ? 100
          : 0;

      return {
        idx: b.idx,
        dateLabel: b.dateLabel,
        fullDateLabel: b.fullDateLabel,
        prevFullDateLabel: b.prevFullDateLabel,
        currentRevenue: b.currentRevenue,
        previousRevenue: b.previousRevenue,
        movingAvg7d,
        currentTxCount: b.currentTxCount,
        previousTxCount: b.previousTxCount,
        diffAmount,
        diffPercent,
        isToday: b.isToday,
        isPeakDay: idx === maxIdx,
      };
    });

    const avgDaily = Math.round(sum30 / 30);
    const growthPct =
      sumPrev30 > 0
        ? ((sum30 - sumPrev30) / sumPrev30) * 100
        : sum30 > 0
        ? 100
        : 0;

    const sDate = new Date(start30dMs);
    const eDate = new Date(todayStart);
    const psDate = new Date(prev30dStartMs);
    const peDate = new Date(prev30dEndMs);

    const fmt = (a: Date, b: Date) =>
      `${a.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    return {
      dailyPoints: points,
      rangeLabel: fmt(sDate, eDate),
      prevRangeLabel: fmt(psDate, peDate),
      total30dRevenue: sum30,
      totalPrev30dRevenue: sumPrev30,
      avgDaily30dRevenue: avgDaily,
      growth30dPercent: growthPct,
      total30dTxCount: tx30,
      peakDay: maxIdx >= 0 ? points[maxIdx] : null,
      hasAnyData: sum30 > 0 || sumPrev30 > 0,
      hasPrev30dData: sumPrev30 > 0,
    };
  }, [transactions, productMap, hiddenCategorySet]);

  const isGrowthPositive = growth30dPercent >= 0;

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Tren Total Pendapatan Harian (30 Hari Terakhir)"
    >
    <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-600" />
              <span>Tren Total Pendapatan Harian (30 Hari Terakhir)</span>
            </h3>
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{rangeLabel}</span>
            </span>
            {hasPrev30dData && (
              <span
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 border ${
                  isGrowthPositive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {isGrowthPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                <span>
                  {isGrowthPositive ? '+' : ''}
                  {growth30dPercent.toFixed(1)}% vs 30 hr sebelumnya
                </span>
              </span>
            )}
            {specificSelectedCategoryName ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Kategori: {specificSelectedCategoryName}
              </span>
            ) : isCategoryFiltered ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Terfilter: {activeCategoryCount}/{totalCategoriesCount} Kategori
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Grafik garis interaktif untuk memantau pola musiman penjualan 30 hari terakhir dibandingkan dengan periode 30 hari sebelumnya ({prevRangeLabel}).
          </p>
        </div>

        {/* Toggle Controls */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPrev30d}
              onChange={(e) => {
                sound.playTap();
                setShowPrev30d(e.target.checked);
              }}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>Bandingkan 30H Lalu</span>
          </label>

          <label className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showMovingAvg}
              onChange={(e) => {
                sound.playTap();
                setShowMovingAvg(e.target.checked);
              }}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span>Rata-rata 7H (MA-7)</span>
          </label>

          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>
      </div>

      {/* Summary KPIs for 30-day window */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3 rounded-2xl bg-sky-50/80 border border-sky-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
            Total Omzet 30 Hari
          </div>
          <div className="text-sm md:text-base font-black font-mono text-slate-900 mt-0.5 tabular-nums">
            {formatRupiah(total30dRevenue)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {formatNumber(total30dTxCount)} transaksi selesai
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Rata-rata Harian (30H)
          </div>
          <div className="text-sm md:text-base font-black font-mono text-slate-900 mt-0.5 tabular-nums">
            {formatRupiah(avgDaily30dRevenue)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            per hari kalender
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
            Total 30 Hari Sebelumnya
          </div>
          <div className="text-sm md:text-base font-black font-mono text-slate-800 mt-0.5 tabular-nums">
            {formatRupiah(totalPrev30dRevenue)}
          </div>
          <div
            className={`text-[10px] font-bold mt-0.5 flex items-center gap-0.5 ${
              isGrowthPositive ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {hasPrev30dData ? (
              <>
                {isGrowthPositive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span>
                  {isGrowthPositive ? '+' : ''}
                  {growth30dPercent.toFixed(1)}% perubahan
                </span>
              </>
            ) : (
              <span className="text-slate-400 font-normal">Belum ada pembanding</span>
            )}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Puncak Penjualan 30H
          </div>
          <div className="text-sm md:text-base font-black font-mono text-emerald-900 mt-0.5 tabular-nums">
            {peakDay ? formatRupiah(peakDay.currentRevenue) : '-'}
          </div>
          <div className="text-[10px] text-emerald-700 font-semibold mt-0.5 truncate">
            {peakDay ? `${peakDay.fullDateLabel} (${peakDay.currentTxCount} trx)` : 'Belum ada data'}
          </div>
        </div>
      </div>

      {/* Interactive Recharts Line Chart */}
      <AnimatedChartStage
        filterKey={`trend-30d-${showPrev30d}-${showMovingAvg}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
        accent="sky"
        delayMs={110}
        className={isFullscreen ? 'w-full h-[60vh] min-h-[380px]' : 'w-full h-72 md:h-80'}
      >
        {activeCategoryCount === 0 && totalCategoriesCount > 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
            <EyeOff className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Semua kategori sedang dinonaktifkan pada filter grafik
            </p>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onResetCategoryFilter();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tampilkan Semua Kategori</span>
            </button>
          </div>
        ) : !hasAnyData ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
            <TrendingUp className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Belum ada data transaksi dalam 30 hari terakhir untuk menampilkan pola tren musiman
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyPoints} margin={{ top: 16, right: 16, left: 10, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10.5, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                tickFormatter={(val) => {
                  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                  if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                  return String(val);
                }}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={56}
              />

              {avgDaily30dRevenue > 0 && (
                <ReferenceLine
                  y={avgDaily30dRevenue}
                  stroke={palette.warning}
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{
                    value: `Rata-rata 30H: ${formatRupiah(avgDaily30dRevenue)}`,
                    position: 'insideTopRight',
                    fill: palette.warning,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}

              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const pt = payload[0]?.payload as DayTrendPoint | undefined;
                  if (!pt) return null;

                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[255px] space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                        <span className="font-bold text-slate-100">{pt.fullDateLabel}</span>
                        {pt.isToday ? (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                            Hari Ini
                          </span>
                        ) : pt.isPeakDay ? (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            Puncak 30H
                          </span>
                        ) : null}
                      </div>

                      <div className="space-y-1.5 font-mono text-[11px]">
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-sky-300 font-sans">Pendapatan Hari Ini (30H):</span>
                          <span className="font-bold text-white tabular-nums">
                            {formatRupiah(pt.currentRevenue)}
                          </span>
                        </div>

                        {showMovingAvg && (
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-emerald-300 font-sans">Rata-rata 7 Hari (MA-7):</span>
                            <span className="font-semibold text-emerald-300 tabular-nums">
                              {formatRupiah(pt.movingAvg7d)}
                            </span>
                          </div>
                        )}

                        {showPrev30d && (
                          <>
                            <div className="flex justify-between items-center gap-3">
                              <span className="text-indigo-300 font-sans">
                                30H Lalu ({pt.prevFullDateLabel}):
                              </span>
                              <span className="font-semibold text-slate-200 tabular-nums">
                                {formatRupiah(pt.previousRevenue)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center gap-3 pt-1 border-t border-slate-800">
                              <span className="text-slate-400 font-sans">Selisih vs 30H Lalu:</span>
                              <span
                                className={`font-bold tabular-nums ${
                                  pt.diffAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {pt.diffAmount >= 0 ? '+' : ''}
                                {formatRupiah(pt.diffAmount)} ({pt.diffPercent >= 0 ? '+' : ''}
                                {pt.diffPercent.toFixed(1)}%)
                              </span>
                            </div>
                          </>
                        )}

                        <div className="flex justify-between items-center gap-3 pt-1 border-t border-slate-800 text-[10px] text-slate-400 font-sans">
                          <span>Jumlah Transaksi:</span>
                          <span className="font-mono text-slate-200 font-semibold">
                            {formatNumber(pt.currentTxCount)} trx
                            {showPrev30d ? ` (lalu: ${formatNumber(pt.previousTxCount)} trx)` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />

              {showPrev30d && (
                <Line
                  type="monotone"
                  dataKey="previousRevenue"
                  name="30 Hari Sebelumnya"
                  stroke={palette.neutral}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={{ r: 4, fill: palette.neutral, stroke: '#ffffff', strokeWidth: 2 }}
                  isAnimationActive={true}
                  animationDuration={550}
                  animationEasing="ease-out"
                />
              )}

              {showMovingAvg && (
                <Line
                  type="monotone"
                  dataKey="movingAvg7d"
                  name="Rata-rata Bergerak 7H (MA-7)"
                  stroke={palette.positive}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: palette.positive, stroke: '#ffffff', strokeWidth: 2 }}
                  isAnimationActive={true}
                  animationDuration={550}
                  animationEasing="ease-out"
                />
              )}

              <Line
                type="monotone"
                dataKey="currentRevenue"
                name="Pendapatan Harian (30H Terakhir)"
                stroke={palette.primary}
                strokeWidth={2.75}
                isAnimationActive={true}
                animationDuration={620}
                animationEasing="ease-out"
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  if (cx == null || cy == null) return <g key={`empty-${props.index}`} />;
                  if (payload?.isPeakDay || payload?.isToday) {
                    return (
                      <circle
                        key={`dot-${payload.idx}`}
                        cx={cx}
                        cy={cy}
                        r={4.5}
                        fill={payload.isPeakDay ? palette.positiveDark : palette.primary}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                    );
                  }
                  return <g key={`dot-${payload?.idx ?? props.index}`} />;
                }}
                activeDot={{ r: 6, fill: palette.primary, stroke: '#ffffff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </AnimatedChartStage>

      {/* Legend & Note */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="w-4 h-1 rounded-full inline-block" style={{ backgroundColor: palette.primary }} />
            <span>30 Hari Terakhir</span>
          </span>
          {showMovingAvg && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <span className="w-4 h-1 rounded-full inline-block" style={{ backgroundColor: palette.positive }} />
              <span>Rata-rata 7 Hari (MA-7)</span>
            </span>
          )}
          {showPrev30d && (
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-500">
              <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: palette.neutral }} />
              <span>30 Hari Sebelumnya</span>
            </span>
          )}
        </div>

        <span className="text-[10.5px] text-slate-400">
          * Garis MA-7 menghaluskan fluktuasi harian agar pola musiman bulanan terlihat lebih jelas.
        </span>
      </div>
    </div>
    </ChartFullscreenShell>
  );
};
