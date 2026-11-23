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
  Wallet,
} from 'lucide-react';
import { Transaction, Product, CashflowRecord } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface ThirtyDayNetProfitLineChartProps {
  transactions: Transaction[];
  cashflows: CashflowRecord[];
  productMap: Map<string, Product>;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

interface DailyNetProfitPoint {
  idx: number;
  dateLabel: string;
  fullDateLabel: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  expenseCount: number;
  netProfit: number;
  netMarginPercent: number;
  movingAvg7d: number;
  txCount: number;
  isToday: boolean;
  isPeakDay: boolean;
}

const getCashflowLocalMs = (c: CashflowRecord): number => {
  if (c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date.trim())) {
    const [y, m, d] = c.date.trim().split('-').map(Number);
    if (typeof c.timestamp === 'number' && !isNaN(c.timestamp)) {
      const tsDate = new Date(c.timestamp);
      if (
        tsDate.getFullYear() === y &&
        tsDate.getMonth() + 1 === m &&
        tsDate.getDate() === d
      ) {
        return c.timestamp;
      }
    }
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }
  return c.timestamp || 0;
};

export const ThirtyDayNetProfitLineChart: React.FC<ThirtyDayNetProfitLineChartProps> = ({
  transactions,
  cashflows,
  productMap,
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette } = useChartTheme();
  const [showMovingAvg, setShowMovingAvg] = useState<boolean>(true);
  const [showComponents, setShowComponents] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const {
    dailyPoints,
    rangeLabel,
    total30dNetProfit,
    totalPrev30dNetProfit,
    total30dRevenue,
    total30dGrossProfit,
    total30dExpenses,
    avgDailyNetProfit,
    netMargin30dPercent,
    growth30dPercent,
    hasPrevBaseline,
    surplusDaysCount,
    deficitDaysCount,
    peakDay,
    hasAnyData,
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

    // 6 days before the 30-day window so MA-7 is accurate starting on Day 1
    const pre6GrossProfit = new Array<number>(6).fill(0);
    const pre6Expenses = new Array<number>(6).fill(0);

    const rawBuckets = Array.from({ length: 30 }, (_, idx) => {
      const dayTs = start30dMs + idx * oneDayMs;
      const d = new Date(dayTs);
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
        revenue: 0,
        cogs: 0,
        expenses: 0,
        expenseCount: 0,
        txCount: 0,
        isToday,
      };
    });

    let prev30dGrossProfit = 0;
    let prev30dRevenue = 0;

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      if (ts < prev30dStartMs || ts > end30dMs) return;

      let txRev = 0;
      let txCogs = 0;
      let hasMatch = false;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        if (isFiltered) {
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (hiddenCategorySet.has(catName)) return;
        }
        txRev += item.totalAmount || 0;
        txCogs += getItemFifoCogs(item, prod);
        hasMatch = true;
      });

      if (!hasMatch) return;
      const txGross = txRev - txCogs;

      if (ts >= start30dMs && ts <= end30dMs) {
        const idx = Math.floor((ts - start30dMs) / oneDayMs);
        if (rawBuckets[idx]) {
          rawBuckets[idx].revenue += txRev;
          rawBuckets[idx].cogs += txCogs;
          rawBuckets[idx].txCount += 1;
        }
      } else {
        if (ts >= prev30dStartMs && ts <= prev30dEndMs) {
          prev30dRevenue += txRev;
          prev30dGrossProfit += txGross;
        }
        if (ts >= maPreWindowStartMs && ts < start30dMs) {
          const preIdx = Math.floor((ts - maPreWindowStartMs) / oneDayMs);
          if (preIdx >= 0 && preIdx < 6) {
            pre6GrossProfit[preIdx] += txGross;
          }
        }
      }
    });

    let prev30dExpenses = 0;

    // Operational expenses from cashflows apply across store (excluded when single/filtered category focus is active so category profit remains unskewed, unless unfiltered)
    if (!isFiltered) {
      cashflows.forEach((c) => {
        if (c.type !== 'PENGELUARAN') return;
        if (c.isCashWithdrawalOutflow || c.category === 'Tarik Tunai (Kas Keluar)') return;
        const amt = Number(c.amount) || 0;
        if (amt <= 0) return;

        const ts = getCashflowLocalMs(c);
        if (ts < prev30dStartMs || ts > end30dMs) return;

        if (ts >= start30dMs && ts <= end30dMs) {
          const idx = Math.floor((ts - start30dMs) / oneDayMs);
          if (rawBuckets[idx]) {
            rawBuckets[idx].expenses += amt;
            rawBuckets[idx].expenseCount += 1;
          }
        } else {
          if (ts >= prev30dStartMs && ts <= prev30dEndMs) {
            prev30dExpenses += amt;
          }
          if (ts >= maPreWindowStartMs && ts < start30dMs) {
            const preIdx = Math.floor((ts - maPreWindowStartMs) / oneDayMs);
            if (preIdx >= 0 && preIdx < 6) {
              pre6Expenses[preIdx] += amt;
            }
          }
        }
      });
    }

    const pre6NetProfit = pre6GrossProfit.map((gp, i) => gp - (pre6Expenses[i] || 0));
    const currentNetSeries = rawBuckets.map((b) => b.revenue - b.cogs - b.expenses);
    const combinedNetSeries = [...pre6NetProfit, ...currentNetSeries];

    let sumRev = 0;
    let sumGross = 0;
    let sumExp = 0;
    let sumNet = 0;
    let surplusDays = 0;
    let deficitDays = 0;
    let maxIdx = -1;
    let maxNet = -Infinity;
    let anyActivity = false;

    rawBuckets.forEach((b, idx) => {
      const gp = b.revenue - b.cogs;
      const np = gp - b.expenses;
      sumRev += b.revenue;
      sumGross += gp;
      sumExp += b.expenses;
      sumNet += np;

      if (b.txCount > 0 || b.expenses > 0) {
        anyActivity = true;
        if (np > 0) surplusDays += 1;
        else if (np < 0) deficitDays += 1;
      }

      if ((b.txCount > 0 || b.expenses > 0) && np > maxNet) {
        maxNet = np;
        maxIdx = idx;
      }
    });

    const points: DailyNetProfitPoint[] = rawBuckets.map((b, idx) => {
      const grossProfit = b.revenue - b.cogs;
      const netProfit = grossProfit - b.expenses;
      const netMarginPercent = b.revenue > 0 ? (netProfit / b.revenue) * 100 : 0;

      let maSum = 0;
      for (let k = idx; k <= idx + 6; k++) {
        maSum += combinedNetSeries[k] || 0;
      }
      const movingAvg7d = Math.round(maSum / 7);

      return {
        idx: b.idx,
        dateLabel: b.dateLabel,
        fullDateLabel: b.fullDateLabel,
        revenue: b.revenue,
        cogs: b.cogs,
        grossProfit,
        expenses: b.expenses,
        expenseCount: b.expenseCount,
        netProfit,
        netMarginPercent,
        movingAvg7d,
        txCount: b.txCount,
        isToday: b.isToday,
        isPeakDay: idx === maxIdx,
      };
    });

    const prevNet = prev30dGrossProfit - prev30dExpenses;
    const hasPrev = prev30dRevenue > 0 || prev30dExpenses > 0;
    const growthPct =
      hasPrev && prevNet !== 0
        ? ((sumNet - prevNet) / Math.abs(prevNet)) * 100
        : sumNet > 0 && hasPrev
        ? 100
        : 0;

    const sDate = new Date(start30dMs);
    const eDate = new Date(todayStart);
    const rangeStr = `${sDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })} – ${eDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;

    return {
      dailyPoints: points,
      rangeLabel: rangeStr,
      total30dNetProfit: sumNet,
      totalPrev30dNetProfit: prevNet,
      total30dRevenue: sumRev,
      total30dGrossProfit: sumGross,
      total30dExpenses: sumExp,
      avgDailyNetProfit: Math.round(sumNet / 30),
      netMargin30dPercent: sumRev > 0 ? (sumNet / sumRev) * 100 : 0,
      growth30dPercent: growthPct,
      hasPrevBaseline: hasPrev,
      surplusDaysCount: surplusDays,
      deficitDaysCount: deficitDays,
      peakDay: maxIdx >= 0 ? points[maxIdx] : null,
      hasAnyData: anyActivity,
    };
  }, [transactions, cashflows, productMap, hiddenCategorySet]);

  const isTotalPositive = total30dNetProfit >= 0;
  const isGrowthPositive = growth30dPercent >= 0;

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Tren Profit Bersih Harian (30 Hari Terakhir)"
    >
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <Wallet
                  className="w-4 h-4 shrink-0"
                  style={{ color: isTotalPositive ? palette.positive : palette.danger }}
                />
                <span>Tren Profit Bersih Harian (30 Hari Terakhir)</span>
              </h3>
              <span className="text-xs text-slate-500 inline-flex items-center gap-1 tabular-nums">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{rangeLabel}</span>
              </span>
              {hasPrevBaseline && (
                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold tabular-nums ${
                    isGrowthPositive ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  {isGrowthPositive ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isGrowthPositive ? '+' : ''}
                    {growth30dPercent.toFixed(1)}% vs 30 hr lalu
                  </span>
                </span>
              )}
              {specificSelectedCategoryName ? (
                <span className="text-xs font-semibold text-amber-700">
                  · Kategori: {specificSelectedCategoryName}
                </span>
              ) : isCategoryFiltered ? (
                <span className="text-xs font-semibold text-amber-700">
                  · Terfilter {activeCategoryCount}/{totalCategoriesCount} Kategori
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Grafik garis profit bersih harian (Laba Kotor FIFO dikurangi Biaya Operasional Cashflow) selama 30 hari terakhir.
              {isCategoryFiltered && ' Saat filter kategori aktif, beban operasional toko tidak dikurangkan agar profit kategori tetap akurat.'}
            </p>
          </div>

          {/* Interactive Chart Overlay Controls */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setShowMovingAvg((prev) => !prev);
              }}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showMovingAvg
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Rata-rata 7H (MA-7)
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setShowComponents((prev) => !prev);
              }}
              className={`px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                showComponents
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Tampilkan Laba Kotor &amp; Beban
            </button>

            <FullscreenToggleButton
              isFullscreen={isFullscreen}
              onToggle={() => setIsFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* 4-Column Quantitative KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
          <div
            className={`p-3 rounded-xl border ${
              isTotalPositive
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-rose-50/70 border-rose-200'
            }`}
          >
            <div
              className={`text-[10.5px] font-bold uppercase tracking-wider ${
                isTotalPositive ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              Total Profit Bersih 30H
            </div>
            <div
              className={`text-sm md:text-base font-black font-mono mt-0.5 tabular-nums ${
                isTotalPositive ? 'text-emerald-950' : 'text-rose-800'
              }`}
            >
              {formatRupiah(total30dNetProfit)}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
              Net Margin {netMargin30dPercent.toFixed(1)}% · Omzet {formatRupiah(total30dRevenue)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              Rata-rata Profit / Hari
            </div>
            <div
              className={`text-sm md:text-base font-black font-mono mt-0.5 tabular-nums ${
                avgDailyNetProfit >= 0 ? 'text-slate-900' : 'text-rose-700'
              }`}
            >
              {formatRupiah(avgDailyNetProfit)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
              {formatNumber(surplusDaysCount)} hr surplus · {formatNumber(deficitDaysCount)} hr defisit
            </div>
          </div>

          <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-sky-700">
              Laba Kotor vs Biaya 30H
            </div>
            <div className="text-sm md:text-base font-black font-mono text-slate-900 mt-0.5 tabular-nums">
              {formatRupiah(total30dGrossProfit)}
            </div>
            <div className="text-[11px] text-rose-700 font-semibold mt-0.5 tabular-nums">
              {isCategoryFiltered
                ? 'Mode filter kategori aktif'
                : `Beban Cashflow: −${formatRupiah(total30dExpenses)}`}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-indigo-700">
              Profit Harian Tertinggi
            </div>
            <div className="text-sm md:text-base font-black font-mono text-indigo-950 mt-0.5 tabular-nums">
              {peakDay ? formatRupiah(peakDay.netProfit) : '-'}
            </div>
            <div className="text-[11px] text-indigo-700 font-semibold mt-0.5 truncate tabular-nums">
              {peakDay
                ? `${peakDay.fullDateLabel} (${peakDay.txCount} trx)`
                : hasPrevBaseline
                ? `30H lalu: ${formatRupiah(totalPrev30dNetProfit)}`
                : 'Belum ada data'}
            </div>
          </div>
        </div>

        {/* Interactive Recharts Line Chart */}
        <AnimatedChartStage
          filterKey={`net-profit-line-30d-${showMovingAvg}-${showComponents}-${activeCategoryCount}-${Array.from(
            hiddenCategorySet
          ).join(',')}`}
          accent="emerald"
          delayMs={100}
          className={isFullscreen ? 'w-full h-[60vh] min-h-[380px]' : 'w-full h-80 md:h-96'}
        >
          {!hasAnyData ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
              {isCategoryFiltered && totalCategoriesCount > 0 ? (
                <>
                  <EyeOff className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-bold text-slate-600 text-center">
                    Tidak ada transaksi kategori aktif dalam 30 hari terakhir
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      onResetCategoryFilter();
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tampilkan Semua Kategori</span>
                  </button>
                </>
              ) : (
                <>
                  <Wallet className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-bold text-slate-600 text-center">
                    Belum ada data transaksi atau cashflow dalam 30 hari terakhir untuk grafik profit bersih
                  </p>
                </>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyPoints} margin={{ top: 18, right: 16, left: 6, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 10.5, fill: '#64748b', fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  minTickGap={22}
                />
                <YAxis
                  tickFormatter={(val) => {
                    const abs = Math.abs(val);
                    const prefix = val < 0 ? '-' : '';
                    if (abs >= 1000000) return `${prefix}${(abs / 1000000).toFixed(1)}M`;
                    if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(0)}k`;
                    return `${prefix}${abs}`;
                  }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                />
                <ReferenceLine
                  y={0}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1.25}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0]?.payload as DailyNetProfitPoint | undefined;
                    if (!row) return null;
                    const isDayProfit = row.netProfit >= 0;

                    return (
                      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[260px] space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                          <span className="font-bold text-slate-100">{row.fullDateLabel}</span>
                          <span className="text-[10.5px] font-mono font-bold text-slate-400">
                            {row.isToday ? 'Hari Ini' : row.isPeakDay ? 'Tertinggi' : `${row.txCount} trx`}
                          </span>
                        </div>

                        <div className="space-y-1.5 font-mono text-[11px] tabular-nums">
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-sans font-semibold text-slate-200 flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full inline-block"
                                style={{ backgroundColor: isDayProfit ? palette.positive : palette.danger }}
                              />
                              <span>Profit Bersih</span>
                            </span>
                            <span
                              className={`font-black text-xs ${
                                isDayProfit ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatRupiah(row.netProfit)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-4 text-[10.5px] text-slate-300">
                            <span className="font-sans">Laba Kotor FIFO</span>
                            <span className="text-sky-300 font-semibold">
                              {formatRupiah(row.grossProfit)}
                            </span>
                          </div>

                          {!isCategoryFiltered && (
                            <div className="flex items-center justify-between gap-4 text-[10.5px] text-slate-300">
                              <span className="font-sans">
                                Biaya Operasional ({row.expenseCount})
                              </span>
                              <span className="text-rose-300 font-semibold">
                                −{formatRupiah(row.expenses)}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-4 text-[10.5px] text-slate-400">
                            <span className="font-sans">Omzet · Net Margin</span>
                            <span>
                              {formatRupiah(row.revenue)} · {row.netMarginPercent.toFixed(1)}%
                            </span>
                          </div>

                          {showMovingAvg && (
                            <div className="flex items-center justify-between gap-4 text-[10.5px] text-amber-300 pt-1 border-t border-slate-800">
                              <span className="font-sans">Rata-rata 7H (MA-7)</span>
                              <span className="font-bold">{formatRupiah(row.movingAvg7d)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />

                {showComponents && (
                  <Line
                    type="monotone"
                    dataKey="grossProfit"
                    name="Laba Kotor FIFO"
                    stroke={palette.primary}
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 4, fill: palette.primary, stroke: '#ffffff', strokeWidth: 1.5 }}
                    isAnimationActive={true}
                    animationDuration={500}
                  />
                )}

                {showComponents && !isCategoryFiltered && (
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Biaya Operasional"
                    stroke={palette.danger}
                    strokeWidth={1.8}
                    strokeDasharray="2 3"
                    dot={false}
                    activeDot={{ r: 4, fill: palette.danger, stroke: '#ffffff', strokeWidth: 1.5 }}
                    isAnimationActive={true}
                    animationDuration={500}
                  />
                )}

                {showMovingAvg && (
                  <Line
                    type="monotone"
                    dataKey="movingAvg7d"
                    name="Rata-rata 7 Hari (MA-7)"
                    stroke={palette.warning}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={{ r: 4, fill: palette.warning, stroke: '#ffffff', strokeWidth: 1.5 }}
                    isAnimationActive={true}
                    animationDuration={500}
                  />
                )}

                <Line
                  type="monotone"
                  dataKey="netProfit"
                  name="Profit Bersih Harian"
                  stroke={palette.positive}
                  strokeWidth={2.75}
                  dot={(dotProps: any) => {
                    const { cx, cy, payload, index } = dotProps;
                    if (cx === undefined || cy === undefined || !payload) return <g key={`dot-empty-${index}`} />;
                    const p = payload as DailyNetProfitPoint;
                    if (p.txCount === 0 && p.expenses === 0) {
                      return <g key={`dot-idle-${index}`} />;
                    }
                    const dotColor =
                      p.netProfit < 0
                        ? palette.danger
                        : p.isToday
                        ? palette.primary
                        : p.isPeakDay
                        ? palette.positiveDark
                        : palette.positive;
                    const r = p.isPeakDay || p.isToday || p.netProfit < 0 ? 4.5 : 3;
                    return (
                      <circle
                        key={`dot-np-${index}`}
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={dotColor}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    );
                  }}
                  activeDot={{
                    r: 6,
                    fill: palette.positiveDark,
                    stroke: '#ffffff',
                    strokeWidth: 2,
                  }}
                  isAnimationActive={true}
                  animationDuration={650}
                  animationEasing="ease-out"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </AnimatedChartStage>

        {/* Legend & Insight Footer */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <span className="w-3.5 h-0.5 rounded inline-block" style={{ backgroundColor: palette.positive }} />
              <span>Profit Bersih Harian</span>
            </span>
            {showMovingAvg && (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3.5 h-0.5 border-b-2 border-dashed inline-block"
                  style={{ borderColor: palette.warning }}
                />
                <span>Rata-rata 7H (MA-7)</span>
              </span>
            )}
            {showComponents && (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-0.5 border-b-2 border-dashed inline-block"
                    style={{ borderColor: palette.primary }}
                  />
                  <span>Laba Kotor FIFO</span>
                </span>
                {!isCategoryFiltered && (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-3.5 h-0.5 border-b-2 border-dotted inline-block"
                      style={{ borderColor: palette.danger }}
                    />
                    <span>Biaya Operasional</span>
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 tabular-nums">
            {isGrowthPositive ? (
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
            )}
            <span>
              Perbandingan 30 hari sebelumnya:{' '}
              <strong className="font-mono text-slate-800">{formatRupiah(totalPrev30dNetProfit)}</strong>
            </span>
          </div>
        </div>
      </div>
    </ChartFullscreenShell>
  );
};
