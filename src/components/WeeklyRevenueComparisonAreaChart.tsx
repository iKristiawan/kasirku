import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
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

interface WeeklyRevenueComparisonAreaChartProps {
  transactions: Transaction[];
  productMap: Map<string, Product>;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

type ChartViewMode = 'DAILY' | 'CUMULATIVE';

interface WeeklyComparisonPoint {
  idx: number;
  dayShort: string;
  dayFull: string;
  thisWeekDateLabel: string;
  lastWeekDateLabel: string;
  thisWeekRevenue: number | null;
  lastWeekRevenue: number;
  thisWeekRaw: number;
  thisWeekTxCount: number;
  lastWeekTxCount: number;
  thisWeekCumulative: number | null;
  lastWeekCumulative: number;
  diffAmount: number | null;
  diffPercent: number | null;
  isToday: boolean;
  isFuture: boolean;
}

export const WeeklyRevenueComparisonAreaChart: React.FC<WeeklyRevenueComparisonAreaChartProps> = ({
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
  const [viewMode, setViewMode] = useState<ChartViewMode>('DAILY');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const {
    chartPoints,
    thisWeekRangeLabel,
    lastWeekRangeLabel,
    thisWeekTotal,
    lastWeekSameSpanTotal,
    lastWeekFullTotal,
    wtdGrowthPercent,
    bestDayThisWeek,
    bestDayLastWeek,
    hasAnyData,
  } = useMemo(() => {
    const now = new Date();
    const oneDayMs = 86400000;
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const startOfThisWeek = new Date(startOfToday);
    const dow = startOfThisWeek.getDay();
    const diffToMonday = dow === 0 ? -6 : 1 - dow;
    startOfThisWeek.setDate(startOfThisWeek.getDate() + diffToMonday);
    startOfThisWeek.setHours(0, 0, 0, 0);

    const thisWeekStartMs = startOfThisWeek.getTime();
    const thisWeekEndMs = thisWeekStartMs + 7 * oneDayMs - 1;
    const lastWeekStartMs = thisWeekStartMs - 7 * oneDayMs;
    const lastWeekEndMs = thisWeekStartMs - 1;

    const dayShortNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
    const dayFullNames = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const isFiltered = hiddenCategorySet.size > 0;

    const rawDays = Array.from({ length: 7 }, (_, idx) => {
      const thisDayMs = thisWeekStartMs + idx * oneDayMs;
      const lastDayMs = lastWeekStartMs + idx * oneDayMs;
      const thisD = new Date(thisDayMs);
      const lastD = new Date(lastDayMs);

      return {
        idx,
        dayShort: dayShortNames[idx],
        dayFull: dayFullNames[idx],
        thisWeekDateLabel: thisD.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        lastWeekDateLabel: lastD.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        thisDayStart: thisDayMs,
        thisDayEnd: thisDayMs + oneDayMs - 1,
        lastDayStart: lastDayMs,
        lastDayEnd: lastDayMs + oneDayMs - 1,
        thisWeekRaw: 0,
        lastWeekRaw: 0,
        thisWeekTxCount: 0,
        lastWeekTxCount: 0,
        isToday: thisDayMs === startOfToday,
        isFuture: thisDayMs > startOfToday,
      };
    });

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      const inThisWeek = ts >= thisWeekStartMs && ts <= thisWeekEndMs;
      const inLastWeek = ts >= lastWeekStartMs && ts <= lastWeekEndMs;
      if (!inThisWeek && !inLastWeek) return;

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

      if (inThisWeek) {
        const idx = Math.floor((ts - thisWeekStartMs) / oneDayMs);
        if (rawDays[idx]) {
          rawDays[idx].thisWeekRaw += matchedRevenue;
          rawDays[idx].thisWeekTxCount += 1;
        }
      } else if (inLastWeek) {
        const idx = Math.floor((ts - lastWeekStartMs) / oneDayMs);
        if (rawDays[idx]) {
          rawDays[idx].lastWeekRaw += matchedRevenue;
          rawDays[idx].lastWeekTxCount += 1;
        }
      }
    });

    let runningThisWeek = 0;
    let runningLastWeek = 0;
    let sameSpanLastWeekSum = 0;

    const points: WeeklyComparisonPoint[] = rawDays.map((d) => {
      runningLastWeek += d.lastWeekRaw;
      if (!d.isFuture) {
        runningThisWeek += d.thisWeekRaw;
        sameSpanLastWeekSum += d.lastWeekRaw;
      }

      const thisVal = d.isFuture ? null : d.thisWeekRaw;
      const thisCum = d.isFuture ? null : runningThisWeek;
      const diffAmt = d.isFuture ? null : d.thisWeekRaw - d.lastWeekRaw;
      const diffPct =
        d.isFuture
          ? null
          : d.lastWeekRaw > 0
          ? ((d.thisWeekRaw - d.lastWeekRaw) / d.lastWeekRaw) * 100
          : d.thisWeekRaw > 0
          ? 100
          : 0;

      return {
        idx: d.idx,
        dayShort: d.dayShort,
        dayFull: d.dayFull,
        thisWeekDateLabel: d.thisWeekDateLabel,
        lastWeekDateLabel: d.lastWeekDateLabel,
        thisWeekRevenue: thisVal,
        lastWeekRevenue: d.lastWeekRaw,
        thisWeekRaw: d.thisWeekRaw,
        thisWeekTxCount: d.thisWeekTxCount,
        lastWeekTxCount: d.lastWeekTxCount,
        thisWeekCumulative: thisCum,
        lastWeekCumulative: runningLastWeek,
        diffAmount: diffAmt,
        diffPercent: diffPct,
        isToday: d.isToday,
        isFuture: d.isFuture,
      };
    });

    const totalThis = runningThisWeek;
    const totalLastFull = runningLastWeek;
    const wtdGrowth =
      sameSpanLastWeekSum > 0
        ? ((totalThis - sameSpanLastWeekSum) / sameSpanLastWeekSum) * 100
        : totalThis > 0
        ? 100
        : 0;

    const elapsedDays = points.filter((p) => !p.isFuture && p.thisWeekRaw > 0);
    const bestThis =
      elapsedDays.length > 0
        ? [...elapsedDays].sort((a, b) => b.thisWeekRaw - a.thisWeekRaw)[0]
        : null;

    const activeLastDays = points.filter((p) => p.lastWeekRevenue > 0);
    const bestLast =
      activeLastDays.length > 0
        ? [...activeLastDays].sort((a, b) => b.lastWeekRevenue - a.lastWeekRevenue)[0]
        : null;

    const thisEndD = new Date(thisWeekStartMs + 6 * oneDayMs);
    const lastStartD = new Date(lastWeekStartMs);
    const lastEndD = new Date(lastWeekEndMs);

    const fmtRange = (a: Date, b: Date) =>
      `${a.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`;

    return {
      chartPoints: points,
      thisWeekRangeLabel: fmtRange(startOfThisWeek, thisEndD),
      lastWeekRangeLabel: fmtRange(lastStartD, lastEndD),
      thisWeekTotal: totalThis,
      lastWeekSameSpanTotal: sameSpanLastWeekSum,
      lastWeekFullTotal: totalLastFull,
      wtdGrowthPercent: wtdGrowth,
      bestDayThisWeek: bestThis,
      bestDayLastWeek: bestLast,
      hasAnyData: totalThis > 0 || totalLastFull > 0,
    };
  }, [transactions, productMap, hiddenCategorySet]);

  const isWtdPositive = wtdGrowthPercent >= 0;

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Perbandingan Tren Pendapatan: Minggu Ini vs Minggu Lalu"
    >
    <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-600" />
              <span>Perbandingan Tren Pendapatan: Minggu Ini vs Minggu Lalu</span>
            </h3>
            <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>{thisWeekRangeLabel}</span>
            </span>
            {hasAnyData && (
              <span
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 border ${
                  isWtdPositive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {isWtdPositive ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                <span>
                  {isWtdPositive ? '+' : ''}
                  {wtdGrowthPercent.toFixed(1)}% vs periode setara minggu lalu
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
            Grafik area membandingkan siklus penjualan harian Senin – Minggu antara{' '}
            <span className="font-semibold text-sky-700">Minggu Ini ({thisWeekRangeLabel})</span> dan{' '}
            <span className="font-semibold text-indigo-700">Minggu Lalu ({lastWeekRangeLabel})</span>.
          </p>
        </div>

        {/* Mode Toggle + Quick Stats */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setViewMode('DAILY');
              }}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'DAILY'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tren Harian
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setViewMode('CUMULATIVE');
              }}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'CUMULATIVE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Akumulasi Mingguan
            </button>
          </div>
          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>
      </div>

      {/* KPI Strip for Weekly Comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3 rounded-2xl bg-sky-50/80 border border-sky-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
            Total Minggu Ini (s/d Hari Ini)
          </div>
          <div className="text-sm md:text-base font-black font-mono text-slate-900 mt-0.5 tabular-nums">
            {formatRupiah(thisWeekTotal)}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
            Setara Minggu Lalu (Sen–Hari Sama)
          </div>
          <div className="text-sm md:text-base font-black font-mono text-slate-900 mt-0.5 tabular-nums">
            {formatRupiah(lastWeekSameSpanTotal)}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Total Penuh Minggu Lalu
          </div>
          <div className="text-sm md:text-base font-black font-mono text-slate-800 mt-0.5 tabular-nums">
            {formatRupiah(lastWeekFullTotal)}
          </div>
        </div>

        <div
          className={`p-3 rounded-2xl border ${
            isWtdPositive
              ? 'bg-emerald-50/80 border-emerald-200'
              : 'bg-rose-50/80 border-rose-200'
          }`}
        >
          <div
            className={`text-[10px] font-bold uppercase tracking-wider ${
              isWtdPositive ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            Selisih Siklus (WTD)
          </div>
          <div
            className={`text-sm md:text-base font-black font-mono mt-0.5 tabular-nums flex items-center gap-1 ${
              isWtdPositive ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            {isWtdPositive ? (
              <TrendingUp className="w-4 h-4 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 shrink-0" />
            )}
            <span>
              {thisWeekTotal - lastWeekSameSpanTotal >= 0 ? '+' : ''}
              {formatRupiah(thisWeekTotal - lastWeekSameSpanTotal)}
            </span>
          </div>
        </div>
      </div>

      {/* Area Chart */}
      <AnimatedChartStage
        filterKey={`weekly-area-${viewMode}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
        accent="sky"
        delayMs={90}
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
              Belum ada data transaksi pada Minggu Ini maupun Minggu Lalu untuk dibandingkan
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartPoints} margin={{ top: 14, right: 16, left: 10, bottom: 8 }}>
              <defs>
                <linearGradient id="weeklyRevThisWeekGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={palette.primary} stopOpacity={0.38} />
                  <stop offset="95%" stopColor={palette.primary} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="weeklyRevLastWeekGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={palette.secondary} stopOpacity={0.22} />
                  <stop offset="95%" stopColor={palette.secondary} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis
                dataKey="dayShort"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
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

              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const pt = payload[0]?.payload as WeeklyComparisonPoint | undefined;
                  if (!pt) return null;

                  const thisVal =
                    viewMode === 'CUMULATIVE' ? pt.thisWeekCumulative : pt.thisWeekRevenue;
                  const lastVal =
                    viewMode === 'CUMULATIVE' ? pt.lastWeekCumulative : pt.lastWeekRevenue;
                  const diffVal = thisVal !== null ? thisVal - lastVal : null;
                  const diffPct =
                    thisVal !== null
                      ? lastVal > 0
                        ? ((thisVal - lastVal) / lastVal) * 100
                        : thisVal > 0
                        ? 100
                        : 0
                      : null;

                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[250px] space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                        <span className="font-bold text-slate-100">
                          {pt.dayFull} ({viewMode === 'CUMULATIVE' ? 'Kumulatif' : 'Harian'})
                        </span>
                        {pt.isToday && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                            Hari Ini
                          </span>
                        )}
                        {pt.isFuture && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 text-[10px] font-bold">
                            Belum Berjalan
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5 font-mono text-[11px]">
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-sky-300 font-sans">
                            Minggu Ini ({pt.thisWeekDateLabel}):
                          </span>
                          <span className="font-bold text-white tabular-nums">
                            {thisVal !== null ? formatRupiah(thisVal) : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-indigo-300 font-sans">
                            Minggu Lalu ({pt.lastWeekDateLabel}):
                          </span>
                          <span className="font-bold text-slate-200 tabular-nums">
                            {formatRupiah(lastVal)}
                          </span>
                        </div>

                        {diffVal !== null && diffPct !== null && (
                          <div className="flex justify-between items-center gap-3 pt-1 border-t border-slate-800">
                            <span className="text-slate-400 font-sans">Selisih:</span>
                            <span
                              className={`font-bold tabular-nums ${
                                diffVal >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {diffVal >= 0 ? '+' : ''}
                              {formatRupiah(diffVal)} ({diffPct >= 0 ? '+' : ''}
                              {diffPct.toFixed(1)}%)
                            </span>
                          </div>
                        )}

                        <div className="flex justify-between items-center gap-3 pt-1 border-t border-slate-800 text-[10px] text-slate-400 font-sans">
                          <span>Jumlah Transaksi Hari Ini / Lalu:</span>
                          <span className="font-mono text-slate-200 font-semibold">
                            {pt.isFuture ? '-' : `${formatNumber(pt.thisWeekTxCount)} trx`} /{' '}
                            {formatNumber(pt.lastWeekTxCount)} trx
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />

              <Area
                type="monotone"
                dataKey={viewMode === 'CUMULATIVE' ? 'lastWeekCumulative' : 'lastWeekRevenue'}
                name={`Minggu Lalu (${lastWeekRangeLabel})`}
                stroke={palette.secondary}
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="url(#weeklyRevLastWeekGrad)"
                dot={{ r: 3, fill: palette.secondary, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: palette.secondary, stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={550}
                animationEasing="ease-out"
              />
              <Area
                type="monotone"
                dataKey={viewMode === 'CUMULATIVE' ? 'thisWeekCumulative' : 'thisWeekRevenue'}
                name={`Minggu Ini (${thisWeekRangeLabel})`}
                stroke={palette.primary}
                strokeWidth={3}
                fill="url(#weeklyRevThisWeekGrad)"
                connectNulls={false}
                dot={{ r: 4, fill: palette.primary, stroke: '#ffffff', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: palette.primary, stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={620}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </AnimatedChartStage>

      {/* Footer Legend & Peak Insight */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
            <span className="w-4 h-1 rounded-full inline-block" style={{ backgroundColor: palette.primary }} />
            <span>Minggu Ini ({thisWeekRangeLabel})</span>
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
            <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: palette.secondary }} />
            <span>Minggu Lalu ({lastWeekRangeLabel})</span>
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {bestDayThisWeek && (
            <span>
              Puncak Minggu Ini:{' '}
              <strong className="text-sky-800">{bestDayThisWeek.dayFull}</strong>{' '}
              (<strong className="font-mono text-slate-900">{formatRupiah(bestDayThisWeek.thisWeekRaw)}</strong>)
            </span>
          )}
          {bestDayLastWeek && (
            <span>
              • Puncak Minggu Lalu:{' '}
              <strong className="text-indigo-800">{bestDayLastWeek.dayFull}</strong>{' '}
              (<strong className="font-mono text-slate-700">{formatRupiah(bestDayLastWeek.lastWeekRevenue)}</strong>)
            </span>
          )}
        </div>
      </div>
    </div>
    </ChartFullscreenShell>
  );
};
