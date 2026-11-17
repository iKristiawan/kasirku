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
  Clock,
  Users,
  TrendingUp,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { Transaction, Product } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface HourlyTransactionChartProps {
  transactions: Transaction[];
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

type VolumeDisplayMode = 'AVG_PER_DAY' | 'TOTAL';
type HourWindowMode = 'FULL_24H' | 'OPERATIONAL';

interface HourlyBucket {
  hour: number;
  hourLabel: string;
  hourRangeLabel: string;
  txCount: number;
  avgTxPerDay: number;
  revenue: number;
  units: number;
  prevTxCount: number;
  prevAvgTxPerDay: number;
  sharePercent: number;
  recommendedCashiers: number;
  trafficLabel: 'Sepi' | 'Normal' | 'Padat' | 'Jam Sibuk';
  isPeakHour: boolean;
}

export const HourlyTransactionChart: React.FC<HourlyTransactionChartProps> = ({
  transactions,
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
  const [volumeMode, setVolumeMode] = useState<VolumeDisplayMode>('AVG_PER_DAY');
  const [hourWindow, setHourWindow] = useState<HourWindowMode>('FULL_24H');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const {
    hourlyData,
    visibleHourlyData,
    totalTxCount,
    totalPrevTxCount,
    avgPerHourValue,
    peakHourBucket,
    peak3HourWindow,
    maxRecommendedCashiers,
    shiftSummaries,
    periodDays,
    hasAnyTx,
  } = useMemo(() => {
    const msSpan = Math.max(86400000, currentEnd - currentStart + 1);
    const daysInPeriod = Math.max(1, Math.round(msSpan / 86400000));
    const prevMsSpan = Math.max(86400000, previousEnd - previousStart + 1);
    const daysInPrevPeriod = Math.max(1, Math.round(prevMsSpan / 86400000));

    const isFiltered = hiddenCategorySet.size > 0;

    const rawBuckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hourLabel: `${String(hour).padStart(2, '0')}:00`,
      hourRangeLabel: `${String(hour).padStart(2, '0')}:00 – ${String(hour).padStart(2, '0')}:59`,
      txCount: 0,
      revenue: 0,
      units: 0,
      prevTxCount: 0,
    }));

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      const inCurrent = ts >= currentStart && ts <= currentEnd;
      const inPrevious = ts >= previousStart && ts <= previousEnd;
      if (!inCurrent && !inPrevious) return;

      let matchedRevenue = tx.finalAmount || 0;
      let matchedUnits = 0;
      let hasMatchingItem = !isFiltered;

      if (isFiltered) {
        matchedRevenue = 0;
        hasMatchingItem = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (!hiddenCategorySet.has(catName)) {
            matchedRevenue += item.totalAmount || 0;
            matchedUnits += (item.quantity || 0) * (item.conversionFactor || 1);
            hasMatchingItem = true;
          }
        });
      } else {
        tx.items.forEach((item) => {
          matchedUnits += (item.quantity || 0) * (item.conversionFactor || 1);
        });
      }

      if (!hasMatchingItem) return;

      const hour = new Date(ts).getHours();
      const bucket = rawBuckets[hour];
      if (!bucket) return;

      if (inCurrent) {
        bucket.txCount += 1;
        bucket.revenue += matchedRevenue;
        bucket.units += matchedUnits;
      } else if (inPrevious) {
        bucket.prevTxCount += 1;
      }
    });

    const totalCurrentTx = rawBuckets.reduce((sum, b) => sum + b.txCount, 0);
    const totalPrevTx = rawBuckets.reduce((sum, b) => sum + b.prevTxCount, 0);

    const maxTxInHour = rawBuckets.reduce((mx, b) => Math.max(mx, b.txCount), 0);
    const peakAvgPerDay = maxTxInHour / daysInPeriod;

    const computed: HourlyBucket[] = rawBuckets.map((b) => {
      const avgTxPerDay = Number((b.txCount / daysInPeriod).toFixed(2));
      const prevAvgTxPerDay = Number((b.prevTxCount / daysInPrevPeriod).toFixed(2));
      const sharePercent = totalCurrentTx > 0 ? (b.txCount / totalCurrentTx) * 100 : 0;
      const isPeakHour = maxTxInHour > 0 && b.txCount === maxTxInHour;

      // Staffing recommendation calibrated to both hourly throughput (~8 trx/jam/kasir)
      // and relative store peak intensity so owners get practical staffing guidance at any volume.
      let recommendedCashiers = 1;
      let trafficLabel: HourlyBucket['trafficLabel'] = 'Sepi';

      if (b.txCount > 0 && maxTxInHour > 0) {
        const relativeRatio = b.txCount / maxTxInHour;
        const capacityNeed = Math.max(1, Math.ceil(avgTxPerDay / 8));
        if (relativeRatio >= 0.78 || capacityNeed >= 3) {
          trafficLabel = 'Jam Sibuk';
          recommendedCashiers = Math.max(2, capacityNeed);
        } else if (relativeRatio >= 0.45 || capacityNeed === 2) {
          trafficLabel = 'Padat';
          recommendedCashiers = Math.max(2, capacityNeed);
        } else {
          trafficLabel = 'Normal';
          recommendedCashiers = 1;
        }
      }

      return {
        hour: b.hour,
        hourLabel: b.hourLabel,
        hourRangeLabel: b.hourRangeLabel,
        txCount: b.txCount,
        avgTxPerDay,
        revenue: b.revenue,
        units: b.units,
        prevTxCount: b.prevTxCount,
        prevAvgTxPerDay,
        sharePercent,
        recommendedCashiers,
        trafficLabel,
        isPeakHour,
      };
    });

    const peakBucket =
      maxTxInHour > 0
        ? computed.reduce((best, cur) => (cur.txCount > best.txCount ? cur : best), computed[0])
        : null;

    // Best 3-consecutive-hour rush window
    let bestWindowStart = 9;
    let bestWindowTx = -1;
    if (totalCurrentTx > 0) {
      for (let h = 0; h <= 21; h++) {
        const sum3 = computed[h].txCount + computed[h + 1].txCount + computed[h + 2].txCount;
        if (sum3 > bestWindowTx) {
          bestWindowTx = sum3;
          bestWindowStart = h;
        }
      }
    }

    const activeHours = computed.filter((b) => b.txCount > 0);
    const activeAvgTotal =
      activeHours.length > 0 ? totalCurrentTx / activeHours.length : 0;
    const activeAvgPerDay =
      activeHours.length > 0
        ? activeHours.reduce((sum, b) => sum + b.avgTxPerDay, 0) / activeHours.length
        : 0;

    const maxCashiers =
      computed.reduce((mx, b) => Math.max(mx, b.txCount > 0 ? b.recommendedCashiers : 0), 0) || 1;

    // 3 operational shifts summary
    const buildShift = (label: string, timeRange: string, startHour: number, endHour: number) => {
      const slice = computed.slice(startHour, endHour + 1);
      const txSum = slice.reduce((s, b) => s + b.txCount, 0);
      const revSum = slice.reduce((s, b) => s + b.revenue, 0);
      const maxShiftCashiers =
        slice.reduce((mx, b) => Math.max(mx, b.txCount > 0 ? b.recommendedCashiers : 0), 0) || 1;
      const share = totalCurrentTx > 0 ? (txSum / totalCurrentTx) * 100 : 0;
      return {
        label,
        timeRange,
        txCount: txSum,
        avgPerDay: Number((txSum / daysInPeriod).toFixed(1)),
        revenue: revSum,
        sharePercent: share,
        recommendedCashiers: txSum > 0 ? maxShiftCashiers : 1,
      };
    };

    const shifts = [
      buildShift('Shift Pagi', '06:00 – 11:59', 6, 11),
      buildShift('Shift Siang & Sore', '12:00 – 17:59', 12, 17),
      buildShift('Shift Malam', '18:00 – 23:59', 18, 23),
    ];

    const filteredWindowData =
      hourWindow === 'OPERATIONAL'
        ? computed.filter((b) => b.hour >= 6 && b.hour <= 22)
        : computed;

    return {
      hourlyData: computed,
      visibleHourlyData: filteredWindowData,
      totalTxCount: totalCurrentTx,
      totalPrevTxCount: totalPrevTx,
      avgPerHourValue:
        volumeMode === 'AVG_PER_DAY'
          ? Number(activeAvgPerDay.toFixed(2))
          : Number(activeAvgTotal.toFixed(1)),
      peakHourBucket: peakBucket,
      peak3HourWindow:
        totalCurrentTx > 0
          ? {
              range: `${String(bestWindowStart).padStart(2, '0')}:00 – ${String(bestWindowStart + 3).padStart(2, '0')}:00`,
              txCount: bestWindowTx,
              sharePercent: (bestWindowTx / totalCurrentTx) * 100,
            }
          : null,
      maxRecommendedCashiers: maxCashiers,
      shiftSummaries: shifts,
      periodDays: daysInPeriod,
      hasAnyTx: totalCurrentTx > 0 || (compareWithPrevious && totalPrevTx > 0),
      peakAvgPerDay,
    };
  }, [
    transactions,
    productMap,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    hiddenCategorySet,
    volumeMode,
    hourWindow,
    compareWithPrevious,
  ]);

  const currentDataKey = volumeMode === 'AVG_PER_DAY' ? 'avgTxPerDay' : 'txCount';
  const previousDataKey = volumeMode === 'AVG_PER_DAY' ? 'prevAvgTxPerDay' : 'prevTxCount';

  const renderDot = (props: {
    cx?: number;
    cy?: number;
    payload?: HourlyBucket;
  }) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined || !payload) return null;
    if (payload.isPeakHour && payload.txCount > 0) {
      return (
        <circle
          key={`dot-${payload.hour}`}
          cx={cx}
          cy={cy}
          r={5.5}
          fill={palette.warning}
          stroke="#ffffff"
          strokeWidth={2}
        />
      );
    }
    if (payload.txCount === 0) {
      return (
        <circle
          key={`dot-${payload.hour}`}
          cx={cx}
          cy={cy}
          r={2.2}
          fill={palette.neutral}
        />
      );
    }
    return (
      <circle
        key={`dot-${payload.hour}`}
        cx={cx}
        cy={cy}
        r={3.2}
        fill={palette.primary}
        stroke="#ffffff"
        strokeWidth={1.5}
      />
    );
  };

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Volume Transaksi per Jam (Analisis Jam Sibuk)"
    >
    <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
      {/* Header Row */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-600" />
              <span>Volume Transaksi per Jam (Analisis Jam Sibuk)</span>
            </h3>
            <span className="text-[11px] font-medium text-slate-400">
              {periodLabel}
              {periodDays > 1 ? ` · ${periodDays} hari` : ''}
              {specificSelectedCategoryName
                ? ` · Kategori: ${specificSelectedCategoryName}`
                : isCategoryFiltered
                ? ` · ${activeCategoryCount}/${totalCategoriesCount} Kategori`
                : ''}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribusi kepadatan checkout per jam sepanjang hari untuk mengidentifikasi jam sibuk dan menjadwalkan jumlah kasir yang optimal.
          </p>
        </div>

        {/* Interactive Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setVolumeMode('AVG_PER_DAY');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                volumeMode === 'AVG_PER_DAY'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Rata-rata / Hari
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setVolumeMode('TOTAL');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                volumeMode === 'TOTAL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Total Periode
            </button>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setHourWindow('FULL_24H');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                hourWindow === 'FULL_24H'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              24 Jam
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setHourWindow('OPERATIONAL');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                hourWindow === 'OPERATIONAL'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              06:00–22:00
            </button>
          </div>

          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>
      </div>

      {/* Hairline-Divided Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border border-slate-200 rounded-2xl bg-slate-50/50">
        <div className="p-3.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            Jam Tersibuk (Peak Hour)
          </div>
          <div className="text-lg font-black font-mono text-slate-900 mt-0.5 tabular-nums">
            {peakHourBucket ? peakHourBucket.hourRangeLabel : '-'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {peakHourBucket ? (
              <>
                <span className="font-mono font-bold text-orange-600">
                  {volumeMode === 'AVG_PER_DAY'
                    ? `${peakHourBucket.avgTxPerDay.toFixed(1)} trx/hari`
                    : `${formatNumber(peakHourBucket.txCount)} trx`}
                </span>{' '}
                · {peakHourBucket.sharePercent.toFixed(1)}% total
              </>
            ) : (
              'Belum ada transaksi'
            )}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            Rentang 3 Jam Terpadat
          </div>
          <div className="text-lg font-black font-mono text-slate-900 mt-0.5 tabular-nums">
            {peak3HourWindow ? peak3HourWindow.range : '-'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {peak3HourWindow ? (
              <>
                <span className="font-mono font-bold text-sky-700">
                  {peak3HourWindow.sharePercent.toFixed(1)}%
                </span>{' '}
                volume ({formatNumber(peak3HourWindow.txCount)} trx)
              </>
            ) : (
              'Belum ada transaksi'
            )}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            Rata-rata Jam Aktif
          </div>
          <div className="text-lg font-black font-mono text-slate-900 mt-0.5 tabular-nums">
            {hasAnyTx
              ? `${avgPerHourValue.toFixed(1)} ${volumeMode === 'AVG_PER_DAY' ? 'trx/jam/hr' : 'trx/jam'}`
              : '0 trx/jam'}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Total periode:{' '}
            <span className="font-mono font-bold text-slate-700">
              {formatNumber(totalTxCount)} trx
            </span>
            {compareWithPrevious && totalPrevTxCount > 0 && (
              <> · lalu {formatNumber(totalPrevTxCount)}</>
            )}
          </div>
        </div>

        <div className="p-3.5">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            Rekomendasi Kasir Jam Sibuk
          </div>
          <div className="text-lg font-black font-mono text-emerald-700 mt-0.5 flex items-center gap-1.5">
            <Users className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{hasAnyTx ? `${maxRecommendedCashiers} Kasir` : '1 Kasir'}</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {peakHourBucket
              ? `Siapkan ${maxRecommendedCashiers} kasir sekitar ${peakHourBucket.hourLabel}`
              : 'Siaga 1 kasir reguler'}
          </div>
        </div>
      </div>

      {/* Main Recharts Line Chart */}
      <AnimatedChartStage
        filterKey={`hourly-${volumeMode}-${hourWindow}-${periodLabel}-${compareWithPrevious}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
        accent="sky"
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
              className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tampilkan Semua Kategori</span>
            </button>
          </div>
        ) : !hasAnyTx ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
            <TrendingUp className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Belum ada data transaksi pada periode ini untuk memetakan volume per jam
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={visibleHourlyData}
              margin={{ top: 18, right: 16, left: 4, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis
                dataKey="hourLabel"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                interval={hourWindow === 'FULL_24H' ? 1 : 0}
              />
              <YAxis
                allowDecimals={volumeMode === 'AVG_PER_DAY'}
                tickFormatter={(val) =>
                  volumeMode === 'AVG_PER_DAY'
                    ? Number(val).toFixed(val >= 10 ? 0 : 1)
                    : String(Math.round(val))
                }
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              {avgPerHourValue > 0 && (
                <ReferenceLine
                  y={avgPerHourValue}
                  stroke={palette.warning}
                  strokeDasharray="5 5"
                  strokeWidth={1.75}
                  label={{
                    value: `Rata-rata: ${avgPerHourValue.toFixed(1)}`,
                    position: 'insideTopRight',
                    fill: palette.warning,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}
              <RechartsTooltip
                cursor={{ stroke: '#94a3b8', strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const row = payload[0]?.payload as HourlyBucket | undefined;
                  if (!row) return null;

                  const prevDisplayVal =
                    volumeMode === 'AVG_PER_DAY' ? row.prevAvgTxPerDay : row.prevTxCount;
                  const curDisplayVal =
                    volumeMode === 'AVG_PER_DAY' ? row.avgTxPerDay : row.txCount;
                  const diffVal = curDisplayVal - prevDisplayVal;

                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[245px] space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                        <span className="font-bold font-mono text-slate-100">
                          Jam {row.hourRangeLabel}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            row.trafficLabel === 'Jam Sibuk'
                              ? 'bg-orange-500/20 text-orange-300'
                              : row.trafficLabel === 'Padat'
                              ? 'bg-amber-500/20 text-amber-300'
                              : row.trafficLabel === 'Normal'
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {row.isPeakHour ? 'Puncak Harian' : row.trafficLabel}
                        </span>
                      </div>

                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Total Transaksi:</span>
                          <span className="font-bold text-sky-400 tabular-nums">
                            {formatNumber(row.txCount)} trx
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Rata-rata / Hari:</span>
                          <span className="font-bold text-slate-200 tabular-nums">
                            {row.avgTxPerDay.toFixed(1)} trx/hari
                          </span>
                        </div>
                        {compareWithPrevious && (
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Periode Lalu:</span>
                            <span className="text-slate-300 tabular-nums">
                              {volumeMode === 'AVG_PER_DAY'
                                ? `${row.prevAvgTxPerDay.toFixed(1)}/hr`
                                : `${formatNumber(row.prevTxCount)} trx`}{' '}
                              <span
                                className={
                                  diffVal >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'
                                }
                              >
                                ({diffVal >= 0 ? '+' : ''}
                                {volumeMode === 'AVG_PER_DAY' ? diffVal.toFixed(1) : formatNumber(diffVal)})
                              </span>
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Omzet Jam Ini:</span>
                          <span className="font-bold text-emerald-400 tabular-nums">
                            {formatRupiah(row.revenue)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Pangsa Harian:</span>
                          <span className="font-semibold text-slate-200 tabular-nums">
                            {row.sharePercent.toFixed(1)}% ({formatNumber(row.units)} unit)
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 pt-1.5 border-t border-slate-800 font-sans">
                          <span className="text-slate-400">Saran Kebutuhan Kasir:</span>
                          <span className="font-bold text-amber-300">
                            {row.txCount > 0 ? `${row.recommendedCashiers} Kasir Aktif` : '1 Kasir Siaga'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />

              {compareWithPrevious && (
                <Line
                  type="monotone"
                  dataKey={previousDataKey}
                  name={previousLabel}
                  stroke={palette.neutral}
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  dot={false}
                  activeDot={{ r: 4, fill: palette.neutral }}
                  isAnimationActive={true}
                  animationDuration={550}
                  animationEasing="ease-out"
                />
              )}

              <Line
                type="monotone"
                dataKey={currentDataKey}
                name={periodLabel}
                stroke={palette.primary}
                strokeWidth={2.75}
                dot={renderDot}
                activeDot={{ r: 6, fill: palette.primary, stroke: '#ffffff', strokeWidth: 2 }}
                isAnimationActive={true}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </AnimatedChartStage>

      {/* Operational Shift & Cashier Staffing Footer */}
      <div className="pt-3 border-t border-slate-100 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: palette.primary }} />
              <span>{periodLabel}</span>
            </span>
            {compareWithPrevious && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-0.5 border-t-2 border-dashed inline-block" style={{ borderColor: palette.neutral }} />
                <span>{previousLabel}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: palette.warning }} />
              <span>Jam Tersibuk</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-0.5 border-t-2 border-dashed inline-block" style={{ borderColor: palette.warning }} />
              <span>Garis Rata-rata</span>
            </span>
          </div>
          <span className="text-[10.5px] text-slate-400">
            * Estimasi jumlah kasir mempertimbangkan lonjakan relatif &amp; beban ±8 trx/jam per kasir.
          </span>
        </div>

        {/* 3 Shift Breakdown Row (Flat Hairline-Divided) */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 border border-slate-200 rounded-2xl bg-slate-50/40">
          {shiftSummaries.map((shift) => (
            <div key={shift.label} className="p-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>{shift.label}</span>
                  <span className="font-mono text-[10px] font-semibold text-slate-400">
                    ({shift.timeRange})
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                  {formatNumber(shift.txCount)} trx · {shift.sharePercent.toFixed(1)}% · {formatRupiah(shift.revenue)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span
                  className={`inline-block px-2 py-1 rounded-lg text-[11px] font-bold font-mono ${
                    shift.recommendedCashiers >= 2
                      ? 'bg-orange-50 text-orange-700 border border-orange-200'
                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  {shift.recommendedCashiers} Kasir
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </ChartFullscreenShell>
  );
};
