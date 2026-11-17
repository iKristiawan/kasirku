import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';
import {
  Percent,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  EyeOff,
  RotateCcw,
  Target,
} from 'lucide-react';
import { Transaction, Product, ProductCategory } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { getCategoryColor } from '../utils/categoryColors';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface GrossProfitMarginChartProps {
  transactions: Transaction[];
  products: Product[];
  categories: ProductCategory[];
  productMap: Map<string, Product>;
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
  periodLabel: string;
  previousLabel: string;
  compareWithPrevious: boolean;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

type MarginViewMode = 'DAILY' | 'CATEGORY';
type BenchmarkMode = 'AVG' | '15' | '20' | '25' | '30';

interface DailyMarginPoint {
  idx: number;
  dateKey: string;
  dateLabel: string;
  fullDateLabel: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number | null;
  cogsRatioPercent: number | null;
  txCount: number;
  prevRevenue: number;
  prevCogs: number;
  prevGrossProfit: number;
  prevMarginPercent: number | null;
  marginDeltaPp: number | null;
}

interface CategoryMarginPoint {
  name: string;
  color: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  cogsRatioPercent: number;
  prevRevenue: number;
  prevCogs: number;
  prevMarginPercent: number | null;
  marginDeltaPp: number | null;
  unitsSold: number;
}

const formatLocalDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getMarginSemanticColor = (marginPercent: number): string => {
  if (marginPercent < 0) return '#dc2626';
  if (marginPercent < 15) return '#d97706';
  if (marginPercent < 25) return '#0284c7';
  return '#059669';
};

export const GrossProfitMarginChart: React.FC<GrossProfitMarginChartProps> = ({
  transactions,
  categories,
  productMap,
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  periodLabel,
  previousLabel,
  compareWithPrevious,
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette } = useChartTheme();
  const [viewMode, setViewMode] = useState<MarginViewMode>('DAILY');
  const [benchmarkMode, setBenchmarkMode] = useState<BenchmarkMode>('AVG');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const getThemedMarginColor = (marginPercent: number): string => {
    if (marginPercent < 0) return palette.danger;
    if (marginPercent < 15) return palette.warning;
    if (marginPercent < 25) return palette.primary;
    return palette.positive;
  };

  const analysis = useMemo(() => {
    const startDate = new Date(currentStart);
    const endDate = new Date(currentEnd);
    const startDayOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const endDayOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    const totalDays = Math.max(
      1,
      Math.min(62, Math.round((endDayOnly.getTime() - startDayOnly.getTime()) / 86400000) + 1)
    );

    const prevStartDate = new Date(previousStart);
    const prevStartDayOnly = new Date(
      prevStartDate.getFullYear(),
      prevStartDate.getMonth(),
      prevStartDate.getDate()
    );

    const dayIndexByCurKey = new Map<string, number>();
    const dayIndexByPrevKey = new Map<string, number>();

    const dailyBuckets: DailyMarginPoint[] = Array.from({ length: totalDays }, (_, idx) => {
      const curDay = new Date(
        startDayOnly.getFullYear(),
        startDayOnly.getMonth(),
        startDayOnly.getDate() + idx
      );
      const prevDay = new Date(
        prevStartDayOnly.getFullYear(),
        prevStartDayOnly.getMonth(),
        prevStartDayOnly.getDate() + idx
      );

      const curKey = formatLocalDateKey(curDay);
      const prevKey = formatLocalDateKey(prevDay);
      dayIndexByCurKey.set(curKey, idx);
      dayIndexByPrevKey.set(prevKey, idx);

      return {
        idx,
        dateKey: curKey,
        dateLabel: curDay.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
        }),
        fullDateLabel: curDay.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        marginPercent: null,
        cogsRatioPercent: null,
        txCount: 0,
        prevRevenue: 0,
        prevCogs: 0,
        prevGrossProfit: 0,
        prevMarginPercent: null,
        marginDeltaPp: null,
      };
    });

    interface CatBucket {
      name: string;
      revenue: number;
      cogs: number;
      unitsSold: number;
      prevRevenue: number;
      prevCogs: number;
    }

    const catMap = new Map<string, CatBucket>();
    const ensureCat = (name: string): CatBucket => {
      const clean = name.trim() || 'Umum';
      let existing = catMap.get(clean);
      if (!existing) {
        existing = {
          name: clean,
          revenue: 0,
          cogs: 0,
          unitsSold: 0,
          prevRevenue: 0,
          prevCogs: 0,
        };
        catMap.set(clean, existing);
      }
      return existing;
    };

    let totalCurRev = 0;
    let totalCurCogs = 0;
    let totalCurTx = 0;
    let totalPrevRev = 0;
    let totalPrevCogs = 0;

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      const isCur = ts >= currentStart && ts <= currentEnd;
      const isPrev = ts >= previousStart && ts <= previousEnd;
      if (!isCur && !isPrev) return;

      const txDateKey = formatLocalDateKey(new Date(ts));
      const dayIdx = isCur ? dayIndexByCurKey.get(txDateKey) : dayIndexByPrevKey.get(txDateKey);
      let txHadVisibleItem = false;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        if (hiddenCategorySet.has(catName)) return;

        txHadVisibleItem = true;
        const rev = item.totalAmount || 0;
        const cogs = getItemFifoCogs(item, prod);
        const units = (item.quantity || 0) * (item.conversionFactor || 1);
        const catBucket = ensureCat(catName);

        if (isCur) {
          totalCurRev += rev;
          totalCurCogs += cogs;
          catBucket.revenue += rev;
          catBucket.cogs += cogs;
          catBucket.unitsSold += units;
          if (dayIdx !== undefined && dailyBuckets[dayIdx]) {
            dailyBuckets[dayIdx].revenue += rev;
            dailyBuckets[dayIdx].cogs += cogs;
          }
        } else if (isPrev) {
          totalPrevRev += rev;
          totalPrevCogs += cogs;
          catBucket.prevRevenue += rev;
          catBucket.prevCogs += cogs;
          if (dayIdx !== undefined && dailyBuckets[dayIdx]) {
            dailyBuckets[dayIdx].prevRevenue += rev;
            dailyBuckets[dayIdx].prevCogs += cogs;
          }
        }
      });

      if (isCur && txHadVisibleItem) {
        totalCurTx += 1;
        if (dayIdx !== undefined && dailyBuckets[dayIdx]) {
          dailyBuckets[dayIdx].txCount += 1;
        }
      }
    });

    dailyBuckets.forEach((b) => {
      b.grossProfit = b.revenue - b.cogs;
      b.marginPercent =
        b.revenue > 0 ? Number(((b.grossProfit / b.revenue) * 100).toFixed(1)) : null;
      b.cogsRatioPercent =
        b.revenue > 0 ? Number(((b.cogs / b.revenue) * 100).toFixed(1)) : null;

      b.prevGrossProfit = b.prevRevenue - b.prevCogs;
      b.prevMarginPercent =
        b.prevRevenue > 0
          ? Number(((b.prevGrossProfit / b.prevRevenue) * 100).toFixed(1))
          : null;

      b.marginDeltaPp =
        b.marginPercent !== null && b.prevMarginPercent !== null
          ? Number((b.marginPercent - b.prevMarginPercent).toFixed(1))
          : null;
    });

    const categoryData: CategoryMarginPoint[] = Array.from(catMap.values())
      .filter((c) => c.revenue > 0)
      .map((c) => {
        const grossProfit = c.revenue - c.cogs;
        const marginPercent = Number(((grossProfit / c.revenue) * 100).toFixed(1));
        const cogsRatioPercent = Number(((c.cogs / c.revenue) * 100).toFixed(1));
        const prevMarginPercent =
          c.prevRevenue > 0
            ? Number((((c.prevRevenue - c.prevCogs) / c.prevRevenue) * 100).toFixed(1))
            : null;
        const marginDeltaPp =
          prevMarginPercent !== null
            ? Number((marginPercent - prevMarginPercent).toFixed(1))
            : null;

        return {
          name: c.name,
          color: getCategoryColor(c.name, categories),
          revenue: c.revenue,
          cogs: c.cogs,
          grossProfit,
          marginPercent,
          cogsRatioPercent,
          prevRevenue: c.prevRevenue,
          prevCogs: c.prevCogs,
          prevMarginPercent,
          marginDeltaPp,
          unitsSold: c.unitsSold,
        };
      })
      .sort((a, b) => b.marginPercent - a.marginPercent);

    const totalCurProfit = totalCurRev - totalCurCogs;
    const overallMarginPercent = totalCurRev > 0 ? (totalCurProfit / totalCurRev) * 100 : 0;
    const overallCogsRatioPercent = totalCurRev > 0 ? (totalCurCogs / totalCurRev) * 100 : 0;

    const totalPrevProfit = totalPrevRev - totalPrevCogs;
    const prevOverallMarginPercent =
      totalPrevRev > 0 ? (totalPrevProfit / totalPrevRev) * 100 : null;
    const overallDeltaPp =
      totalCurRev > 0 && prevOverallMarginPercent !== null
        ? overallMarginPercent - prevOverallMarginPercent
        : null;

    const activeDays = dailyBuckets.filter((d) => d.marginPercent !== null);
    const bestDay =
      activeDays.length > 0
        ? activeDays.reduce((best, curr) =>
            (curr.marginPercent ?? -Infinity) > (best.marginPercent ?? -Infinity) ? curr : best
          )
        : null;
    const lowestDay =
      activeDays.length > 0
        ? activeDays.reduce((low, curr) =>
            (curr.marginPercent ?? Infinity) < (low.marginPercent ?? Infinity) ? curr : low
          )
        : null;

    const highestCategory = categoryData.length > 0 ? categoryData[0] : null;
    const lowestCategory =
      categoryData.length > 1 ? categoryData[categoryData.length - 1] : null;

    return {
      dailyData: dailyBuckets,
      categoryData,
      totalCurRev,
      totalCurCogs,
      totalCurProfit,
      totalCurTx,
      overallMarginPercent,
      overallCogsRatioPercent,
      prevOverallMarginPercent,
      overallDeltaPp,
      bestDay,
      lowestDay,
      highestCategory,
      lowestCategory,
      hasData: totalCurRev > 0,
    };
  }, [
    transactions,
    categories,
    productMap,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    hiddenCategorySet,
  ]);

  const benchmarkValue =
    benchmarkMode === 'AVG'
      ? Number(analysis.overallMarginPercent.toFixed(1))
      : Number(benchmarkMode);

  const benchmarkLabel =
    benchmarkMode === 'AVG'
      ? `Rata-rata Toko: ${analysis.overallMarginPercent.toFixed(1)}%`
      : `Target Margin: ${benchmarkValue}%`;

  const aboveBenchmarkCount = useMemo(() => {
    if (viewMode === 'DAILY') {
      const valid = analysis.dailyData.filter((d) => d.marginPercent !== null);
      return {
        matched: valid.filter((d) => (d.marginPercent ?? 0) >= benchmarkValue).length,
        total: valid.length,
        unit: 'hari',
      };
    }
    return {
      matched: analysis.categoryData.filter((c) => c.marginPercent >= benchmarkValue).length,
      total: analysis.categoryData.length,
      unit: 'kategori',
    };
  }, [viewMode, analysis, benchmarkValue]);

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Gross Profit Margin %"
    >
    <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Percent className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Gross Profit Margin %</span>
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <span aria-hidden="true">·</span>
              <span>{periodLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Basis HPP FIFO</span>
              {specificSelectedCategoryName ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-700 font-semibold">{specificSelectedCategoryName}</span>
                </>
              ) : isCategoryFiltered ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 font-semibold">
                    {activeCategoryCount}/{totalCategoriesCount} Kategori
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Pantau efisiensi laba bersih terhadap omzet dalam persentase (%) untuk mengevaluasi struktur harga jual dan beban HPP.
          </p>
        </div>

        {/* Interactive Controls */}
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {/* View Mode Segmented Control */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setViewMode('DAILY');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                viewMode === 'DAILY'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tren Harian (%)
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setViewMode('CATEGORY');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                viewMode === 'CATEGORY'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Per Kategori (%)
            </button>
          </div>

          {/* Benchmark Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            <Target className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-slate-500 font-semibold whitespace-nowrap">Acuan:</span>
            <select
              aria-label="Acuan Gross Profit Margin"
              value={benchmarkMode}
              onChange={(e) => {
                sound.playTap();
                setBenchmarkMode(e.target.value as BenchmarkMode);
              }}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="AVG">Rata-rata Periode</option>
              <option value="15">Target 15%</option>
              <option value="20">Target 20%</option>
              <option value="25">Target 25%</option>
              <option value="30">Target 30%</option>
            </select>
          </div>

          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>
      </div>

      {/* Executive Efficiency Strip (Flat hairline dividers, tabular-nums, zero nested card clutter) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-1 border-b border-slate-100 pb-4">
        <div className="space-y-0.5">
          <div className="text-[11px] font-semibold text-slate-500">Margin Kotor Keseluruhan</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`text-xl md:text-2xl font-black font-mono tabular-nums ${
                analysis.overallMarginPercent >= 20
                  ? 'text-emerald-700'
                  : analysis.overallMarginPercent >= 10
                  ? 'text-sky-700'
                  : analysis.overallMarginPercent >= 0
                  ? 'text-amber-700'
                  : 'text-rose-700'
              }`}
            >
              {analysis.hasData ? `${analysis.overallMarginPercent.toFixed(1)}%` : '0.0%'}
            </span>
            {analysis.overallDeltaPp !== null && compareWithPrevious && (
              <span
                className={`text-[11px] font-mono font-bold inline-flex items-center ${
                  analysis.overallDeltaPp >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {analysis.overallDeltaPp >= 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {analysis.overallDeltaPp >= 0 ? '+' : ''}
                {analysis.overallDeltaPp.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            Laba <span className="font-mono font-semibold text-slate-600 tabular-nums">{formatRupiah(analysis.totalCurProfit)}</span>
          </div>
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">Rasio Beban HPP (COGS)</div>
          <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
            {analysis.hasData ? `${analysis.overallCogsRatioPercent.toFixed(1)}%` : '0.0%'}
          </div>
          <div className="text-[11px] text-slate-400">
            Modal <span className="font-mono font-semibold text-slate-600 tabular-nums">{formatRupiah(analysis.totalCurCogs)}</span>
          </div>
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">
            {viewMode === 'DAILY' ? 'Efisiensi Puncak Harian' : 'Kategori Margin Tertinggi'}
          </div>
          {viewMode === 'DAILY' ? (
            analysis.bestDay ? (
              <>
                <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-emerald-700">
                  {analysis.bestDay.marginPercent?.toFixed(1)}%
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {analysis.bestDay.dateLabel} · {formatNumber(analysis.bestDay.txCount)} trx
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-400 pt-1">Belum ada data</div>
            )
          ) : analysis.highestCategory ? (
            <>
              <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-emerald-700">
                {analysis.highestCategory.marginPercent.toFixed(1)}%
              </div>
              <div className="text-[11px] text-slate-600 font-semibold truncate">
                {analysis.highestCategory.name}
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-slate-400 pt-1">Belum ada data</div>
          )}
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">
            {aboveBenchmarkCount.total > 0
              ? `Memenuhi Acuan (${benchmarkValue}%)`
              : 'Margin Terendah'}
          </div>
          {aboveBenchmarkCount.total > 0 ? (
            <>
              <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
                {aboveBenchmarkCount.matched}/{aboveBenchmarkCount.total}{' '}
                <span className="text-xs font-sans font-semibold text-slate-500">
                  {aboveBenchmarkCount.unit}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {viewMode === 'DAILY' && analysis.lowestDay
                  ? `Terendah: ${analysis.lowestDay.dateLabel} (${analysis.lowestDay.marginPercent?.toFixed(1)}%)`
                  : analysis.lowestCategory
                  ? `Terendah: ${analysis.lowestCategory.name} (${analysis.lowestCategory.marginPercent.toFixed(1)}%)`
                  : `Total ${formatNumber(analysis.totalCurTx)} transaksi`}
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-slate-400 pt-1">Belum ada data</div>
          )}
        </div>
      </div>

      {/* Main Chart Viewport */}
      <AnimatedChartStage
        filterKey={`gpm-${viewMode}-${benchmarkMode}-${periodLabel}-${compareWithPrevious}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
        accent="emerald"
        delayMs={100}
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
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tampilkan Semua Kategori</span>
            </button>
          </div>
        ) : !analysis.hasData ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
            <TrendingUp className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Belum ada transaksi pada {periodLabel} untuk menghitung Gross Profit Margin %
            </p>
          </div>
        ) : viewMode === 'DAILY' ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={analysis.dailyData}
              margin={{ top: 20, right: 16, left: 4, bottom: 8 }}
            >
              <defs>
                <linearGradient id="gpmFillGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={palette.positive} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={palette.positive} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                minTickGap={18}
              />
              <YAxis
                tickFormatter={(val) => `${val}%`}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={48}
                domain={['auto', 'auto']}
              />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
              <ReferenceLine
                y={benchmarkValue}
                stroke={palette.secondary}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: benchmarkLabel,
                  position: 'insideTopRight',
                  fill: palette.secondary,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0]?.payload as DailyMarginPoint | undefined;
                  if (!item) return null;

                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[245px] space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                        <span className="font-bold text-slate-100">{item.fullDateLabel}</span>
                        {item.txCount > 0 && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatNumber(item.txCount)} trx
                          </span>
                        )}
                      </div>

                      {item.marginPercent === null ? (
                        <div className="text-[11px] text-slate-400 italic">
                          Tidak ada transaksi pada hari ini
                        </div>
                      ) : (
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Gross Profit Margin:</span>
                            <span
                              className={`font-black tabular-nums ${
                                item.marginPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {item.marginPercent.toFixed(1)}%
                            </span>
                          </div>
                          {compareWithPrevious && item.prevMarginPercent !== null && (
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-400">Margin Periode Lalu:</span>
                              <span className="font-semibold text-slate-300 tabular-nums">
                                {item.prevMarginPercent.toFixed(1)}%
                                {item.marginDeltaPp !== null && (
                                  <span
                                    className={`ml-1.5 ${
                                      item.marginDeltaPp >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    ({item.marginDeltaPp >= 0 ? '+' : ''}
                                    {item.marginDeltaPp.toFixed(1)}%)
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Rasio HPP (COGS):</span>
                            <span className="font-semibold text-amber-300 tabular-nums">
                              {item.cogsRatioPercent?.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between gap-3 pt-1 border-t border-slate-800">
                            <span className="text-slate-400">Laba Kotor (Rp):</span>
                            <span className="font-bold text-emerald-300 tabular-nums">
                              {formatRupiah(item.grossProfit)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Omzet Penjualan:</span>
                            <span className="font-semibold text-sky-300 tabular-nums">
                              {formatRupiah(item.revenue)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              {compareWithPrevious && (
                <Line
                  type="monotone"
                  dataKey="prevMarginPercent"
                  name={`Margin ${previousLabel}`}
                  stroke={palette.neutral}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: palette.neutral }}
                  connectNulls
                  isAnimationActive={true}
                  animationDuration={550}
                  animationEasing="ease-out"
                />
              )}
              <Area
                type="monotone"
                dataKey="marginPercent"
                name={`Margin ${periodLabel}`}
                stroke={palette.positive}
                strokeWidth={2.5}
                fill="url(#gpmFillGradient)"
                dot={{ r: 3, fill: '#ffffff', stroke: palette.positive, strokeWidth: 2 }}
                activeDot={{ r: 5, fill: palette.positive, stroke: '#ffffff', strokeWidth: 2 }}
                connectNulls
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={analysis.categoryData}
              margin={{ top: 20, right: 16, left: 4, bottom: 24 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                interval={0}
                angle={-15}
                textAnchor="end"
                height={46}
              />
              <YAxis
                tickFormatter={(val) => `${val}%`}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={48}
                domain={['auto', 'auto']}
              />
              <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
              <ReferenceLine
                y={benchmarkValue}
                stroke={palette.secondary}
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: benchmarkLabel,
                  position: 'insideTopRight',
                  fill: palette.secondary,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
              <RechartsTooltip
                cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const cat = payload[0]?.payload as CategoryMarginPoint | undefined;
                  if (!cat) return null;

                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[245px] space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="font-bold text-slate-100 truncate">{cat.name}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatNumber(cat.unitsSold)} unit
                        </span>
                      </div>

                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Gross Profit Margin:</span>
                          <span
                            className={`font-black tabular-nums ${
                              cat.marginPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {cat.marginPercent.toFixed(1)}%
                          </span>
                        </div>
                        {compareWithPrevious && cat.prevMarginPercent !== null && (
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Margin Periode Lalu:</span>
                            <span className="font-semibold text-slate-300 tabular-nums">
                              {cat.prevMarginPercent.toFixed(1)}%
                              {cat.marginDeltaPp !== null && (
                                <span
                                  className={`ml-1.5 ${
                                    cat.marginDeltaPp >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  ({cat.marginDeltaPp >= 0 ? '+' : ''}
                                  {cat.marginDeltaPp.toFixed(1)}%)
                                </span>
                              )}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Rasio HPP (COGS):</span>
                          <span className="font-semibold text-amber-300 tabular-nums">
                            {cat.cogsRatioPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 pt-1 border-t border-slate-800">
                          <span className="text-slate-400">Laba Kotor (Rp):</span>
                          <span className="font-bold text-emerald-300 tabular-nums">
                            {formatRupiah(cat.grossProfit)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Omzet Kategori:</span>
                          <span className="font-semibold text-sky-300 tabular-nums">
                            {formatRupiah(cat.revenue)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="marginPercent"
                name={`Margin ${periodLabel}`}
                radius={[6, 6, 0, 0]}
                maxBarSize={44}
                isAnimationActive={true}
                animationDuration={580}
                animationEasing="ease-out"
              >
                {analysis.categoryData.map((entry, idx) => (
                  <Cell
                    key={`gpm-cat-${idx}`}
                    fill={getThemedMarginColor(entry.marginPercent)}
                  />
                ))}
              </Bar>
              {compareWithPrevious && (
                <Bar
                  dataKey="prevMarginPercent"
                  name={`Margin ${previousLabel}`}
                  fill={palette.neutral}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={true}
                  animationDuration={580}
                  animationEasing="ease-out"
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </AnimatedChartStage>

      {/* Footer Legend */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        {viewMode === 'DAILY' ? (
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: palette.positive }} />
              <span>Margin {periodLabel} (%)</span>
            </span>
            {compareWithPrevious && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed inline-block" style={{ borderColor: palette.neutral }} />
                <span>Margin {previousLabel} (%)</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t-2 border-dashed inline-block" style={{ borderColor: palette.secondary }} />
              <span>{benchmarkLabel}</span>
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.positive }} />
              <span>Margin Tinggi (&ge;25%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.primary }} />
              <span>Sehat (15–24.9%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.warning }} />
              <span>Tipis (&lt;15%)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.danger }} />
              <span>Rugi (&lt;0%)</span>
            </span>
            {compareWithPrevious && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.neutral }} />
                <span>Periode Sebelumnya</span>
              </span>
            )}
          </div>
        )}

        <span className="text-[11px] text-slate-400">
          Rumus: (Omzet − HPP FIFO) ÷ Omzet × 100%
        </span>
      </div>
    </section>
    </ChartFullscreenShell>
  );
};
