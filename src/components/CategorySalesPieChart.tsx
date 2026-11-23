import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  PieChart as PieChartIcon,
  ShoppingBag,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { Transaction, Product, ProductCategory } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { getCategoryColor } from '../utils/categoryColors';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface CategorySalesPieChartProps {
  transactions: Transaction[];
  products: Product[];
  categories: ProductCategory[];
  productMap: Map<string, Product>;
  currentStart: number;
  currentEnd: number;
  periodLabel: string;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

type SalesPieMetric = 'REVENUE' | 'PROFIT' | 'UNITS';

interface CategorySalesSlice {
  name: string;
  color: string;
  revenue: number;
  profit: number;
  cogs: number;
  unitsSold: number;
  txCount: number;
  marginPercent: number;
  value: number;
  sharePercent: number;
}

const RADIAN = Math.PI / 180;

const renderSlicePercentLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) => {
  if (
    cx === undefined ||
    cy === undefined ||
    midAngle === undefined ||
    innerRadius === undefined ||
    outerRadius === undefined ||
    percent === undefined ||
    percent < 0.06
  ) {
    return null;
  }

  const radius = innerRadius + (outerRadius - innerRadius) * 0.62;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#ffffff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
      fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export const CategorySalesPieChart: React.FC<CategorySalesPieChartProps> = ({
  transactions,
  categories,
  productMap,
  currentStart,
  currentEnd,
  periodLabel,
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette, isDefaultTheme } = useChartTheme();
  const [salesMetric, setSalesMetric] = useState<SalesPieMetric>('REVENUE');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const summary = useMemo(() => {
    interface AggBucket {
      name: string;
      revenue: number;
      cogs: number;
      unitsSold: number;
      txIds: Set<string>;
    }

    const bucketMap = new Map<string, AggBucket>();
    let totalRevenue = 0;
    let totalCogs = 0;
    let totalUnits = 0;
    const matchedTxIds = new Set<string>();

    transactions.forEach((tx) => {
      if (tx.timestamp < currentStart || tx.timestamp > currentEnd) return;

      (tx.items || []).forEach((item) => {
        const prod = productMap.get(item.productId);
        const rawCat =
          prod?.category ||
          (item.isCashWithdrawal
            ? 'Jasa Tarik Tunai'
            : item.isQuickSale
            ? 'Item Bebas / Quick Sale'
            : item.isService
            ? 'Layanan Jasa'
            : 'Umum');
        const catName = rawCat.trim() || 'Umum';
        if (hiddenCategorySet.has(catName)) return;

        const rev = Math.max(0, Number(item.totalAmount) || 0);
        const cogs = Math.max(0, getItemFifoCogs(item, prod));
        const units = Math.max(0, (Number(item.quantity) || 0) * (Number(item.conversionFactor) || 1));

        totalRevenue += rev;
        totalCogs += cogs;
        totalUnits += units;
        matchedTxIds.add(tx.id);

        let entry = bucketMap.get(catName);
        if (!entry) {
          entry = {
            name: catName,
            revenue: 0,
            cogs: 0,
            unitsSold: 0,
            txIds: new Set<string>(),
          };
          bucketMap.set(catName, entry);
        }
        entry.revenue += rev;
        entry.cogs += cogs;
        entry.unitsSold += units;
        entry.txIds.add(tx.id);
      });
    });

    const rawEntries = Array.from(bucketMap.values()).map((b) => {
      const profit = b.revenue - b.cogs;
      const metricValue =
        salesMetric === 'REVENUE'
          ? b.revenue
          : salesMetric === 'PROFIT'
          ? Math.max(0, profit)
          : b.unitsSold;

      return {
        name: b.name,
        color: getCategoryColor(b.name, categories),
        revenue: b.revenue,
        profit,
        cogs: b.cogs,
        unitsSold: b.unitsSold,
        txCount: b.txIds.size,
        marginPercent: b.revenue > 0 ? (profit / b.revenue) * 100 : 0,
        value: metricValue,
      };
    });

    const filteredPositive = rawEntries
      .filter((e) => e.value > 0)
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return b.revenue - a.revenue;
      });

    const totalMetricSum = filteredPositive.reduce((sum, e) => sum + e.value, 0);

    const items: CategorySalesSlice[] = filteredPositive.map((e, idx) => ({
      ...e,
      color: isDefaultTheme ? e.color : palette.series[idx % palette.series.length],
      sharePercent: totalMetricSum > 0 ? (e.value / totalMetricSum) * 100 : 0,
    }));

    const totalProfit = totalRevenue - totalCogs;
    const blendedMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const topCategory = items[0] || null;

    return {
      items,
      totalMetricSum,
      totalRevenue,
      totalProfit,
      totalUnits,
      totalTxCount: matchedTxIds.size,
      blendedMarginPercent,
      topCategory,
      activeCategoryWithSalesCount: items.length,
    };
  }, [
    transactions,
    categories,
    productMap,
    currentStart,
    currentEnd,
    hiddenCategorySet,
    salesMetric,
    isDefaultTheme,
    palette.series,
  ]);

  const focusedIdx =
    pinnedIdx !== null && pinnedIdx < summary.items.length
      ? pinnedIdx
      : hoveredIdx !== null && hoveredIdx < summary.items.length
      ? hoveredIdx
      : null;

  const focusedItem = focusedIdx !== null ? summary.items[focusedIdx] : null;

  const formatMetricValue = (entry: {
    revenue: number;
    profit: number;
    unitsSold: number;
  }): string => {
    if (salesMetric === 'REVENUE') return formatRupiah(entry.revenue);
    if (salesMetric === 'PROFIT') return formatRupiah(entry.profit);
    return `${formatNumber(entry.unitsSold)} unit`;
  };

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Distribusi Total Penjualan per Kategori Produk"
    >
      <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
        {/* Header Bar */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 shrink-0" style={{ color: palette.primary }} />
                <span>Distribusi Total Penjualan per Kategori Produk</span>
              </h3>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                <span aria-hidden="true">·</span>
                <span>{periodLabel}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {summary.activeCategoryWithSalesCount} kategori berkontribusi
                </span>
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
              Porsi kontribusi pendapatan toko dari setiap kategori produk untuk melihat penggerak utama omzet dan laba.
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {pinnedIdx !== null && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setPinnedIdx(null);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Reset Sorotan
              </button>
            )}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSalesMetric('REVENUE');
                  setPinnedIdx(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  salesMetric === 'REVENUE'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Omzet (Rp)
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSalesMetric('PROFIT');
                  setPinnedIdx(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  salesMetric === 'PROFIT'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Laba Kotor
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSalesMetric('UNITS');
                  setPinnedIdx(null);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  salesMetric === 'UNITS'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unit Terjual
              </button>
            </div>

            <FullscreenToggleButton
              isFullscreen={isFullscreen}
              onToggle={() => setIsFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Revenue Contribution Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-0.5">
            <div className="text-[11px] font-semibold text-slate-500">Total Penjualan Kategori</div>
            <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
              {formatRupiah(summary.totalRevenue)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
              {formatNumber(summary.totalTxCount)} transaksi tercatat
            </div>
          </div>

          <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-[11px] font-semibold text-slate-500">Kontributor Terbesar</div>
            <div className="text-lg md:text-xl font-black text-sky-700 truncate">
              {summary.topCategory ? summary.topCategory.name : '-'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
              {summary.topCategory
                ? `${summary.topCategory.sharePercent.toFixed(1)}% · ${formatMetricValue(summary.topCategory)}`
                : 'Belum ada penjualan'}
            </div>
          </div>

          <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-[11px] font-semibold text-slate-500">Total Laba Kotor (FIFO)</div>
            <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-emerald-700">
              {formatRupiah(summary.totalProfit)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono tabular-nums">
              Margin rata-rata {summary.blendedMarginPercent.toFixed(1)}%
            </div>
          </div>

          <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-[11px] font-semibold text-slate-500">Volume Terjual</div>
            <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
              {formatNumber(summary.totalUnits)}{' '}
              <span className="text-xs font-sans font-semibold text-slate-500">unit</span>
            </div>
            <div className="text-[11px] text-slate-400">
              Dari {summary.activeCategoryWithSalesCount} kategori produk
            </div>
          </div>
        </div>

        {/* Main Split Content: Recharts Pie Chart + Ranked Revenue Contribution List */}
        {activeCategoryCount === 0 && totalCategoriesCount > 0 ? (
          <div className="py-12 px-6 flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <EyeOff className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Semua kategori sedang dinonaktifkan pada filter dashboard
            </p>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onResetCategoryFilter();
              }}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tampilkan Semua Kategori</span>
            </button>
          </div>
        ) : summary.items.length === 0 ? (
          <div className="py-12 px-6 flex flex-col items-center justify-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <ShoppingBag className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Belum ada data penjualan kategori pada {periodLabel}
            </p>
            <p className="text-[11px] text-slate-400">
              Grafik distribusi pendapatan kategori akan otomatis muncul setelah ada transaksi penjualan.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left: Interactive Recharts Pie Chart */}
            <div className="lg:col-span-5 flex flex-col items-center">
              <AnimatedChartStage
                filterKey={`cat-sales-pie-${salesMetric}-${periodLabel}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
                accent="sky"
                delayMs={90}
                className={isFullscreen ? 'w-full h-[58vh] min-h-[380px]' : 'w-full h-72 sm:h-80'}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.items}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={0}
                      outerRadius={isFullscreen ? 165 : 114}
                      paddingAngle={1.5}
                      stroke="#ffffff"
                      strokeWidth={2}
                      labelLine={false}
                      label={renderSlicePercentLabel}
                      isAnimationActive={true}
                      animationDuration={600}
                      animationEasing="ease-out"
                      onMouseEnter={(_, index) => setHoveredIdx(index)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={(_, index) => {
                        sound.playTap();
                        setPinnedIdx((prev) => (prev === index ? null : index));
                      }}
                      className="cursor-pointer focus:outline-none"
                    >
                      {summary.items.map((entry, idx) => {
                        const isActive = focusedIdx === idx;
                        const isDimmed = focusedIdx !== null && !isActive;
                        return (
                          <Cell
                            key={`sales-pie-${entry.name}`}
                            fill={entry.color}
                            fillOpacity={isDimmed ? 0.32 : 1}
                            stroke={isActive ? '#0f172a' : '#ffffff'}
                            strokeWidth={isActive ? 2.5 : 2}
                          />
                        );
                      })}
                    </Pie>
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const entry = payload[0]?.payload as CategorySalesSlice | undefined;
                        if (!entry) return null;

                        return (
                          <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[240px] space-y-2">
                            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: entry.color }}
                                />
                                <span className="font-bold text-slate-100 truncate">
                                  {entry.name}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-sky-300 tabular-nums">
                                {entry.sharePercent.toFixed(1)}%
                              </span>
                            </div>

                            <div className="space-y-1 font-mono text-[11px]">
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Total Penjualan:</span>
                                <span className="font-bold text-slate-100 tabular-nums">
                                  {formatRupiah(entry.revenue)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Laba Kotor:</span>
                                <span className="font-bold text-emerald-300 tabular-nums">
                                  {formatRupiah(entry.profit)} ({entry.marginPercent.toFixed(1)}%)
                                </span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Volume Terjual:</span>
                                <span className="font-semibold text-slate-200 tabular-nums">
                                  {formatNumber(entry.unitsSold)} unit ({formatNumber(entry.txCount)} trx)
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </AnimatedChartStage>

              {/* Focused Slice Readout Strip */}
              <div className="w-full text-center text-xs text-slate-600 pt-1 min-h-[24px]">
                {focusedItem ? (
                  <div className="inline-flex items-center gap-2 font-medium text-slate-800 flex-wrap justify-center">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: focusedItem.color }}
                    />
                    <span className="font-bold">{focusedItem.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-bold tabular-nums">
                      {formatMetricValue(focusedItem)} ({focusedItem.sharePercent.toFixed(1)}%)
                    </span>
                  </div>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Arahkan kursor atau klik irisan pie / daftar untuk menyorot kontribusi kategori
                  </span>
                )}
              </div>
            </div>

            {/* Right: Synchronized Category Revenue Contribution Breakdown */}
            <div className="lg:col-span-7 overflow-hidden border border-slate-200 rounded-2xl">
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {summary.items.map((item, idx) => {
                  const isActive = focusedIdx === idx;
                  const isDimmed = focusedIdx !== null && !isActive;

                  return (
                    <button
                      key={item.name}
                      type="button"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                      onClick={() => {
                        sound.playTap();
                        setPinnedIdx((prev) => (prev === idx ? null : idx));
                      }}
                      className={`w-full text-left px-3.5 py-2.5 transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                        isActive ? 'bg-slate-100' : 'bg-white hover:bg-slate-50'
                      } ${isDimmed ? 'opacity-55' : 'opacity-100'}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold text-slate-400 tabular-nums shrink-0">
                              #{idx + 1}
                            </span>
                            <span className="font-bold text-slate-900 text-xs truncate">
                              {item.name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums flex items-center gap-1.5 flex-wrap">
                            <span>{formatRupiah(item.revenue)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{formatNumber(item.unitsSold)} unit</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-700 font-semibold">
                              Margin {item.marginPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-black text-xs text-slate-900 tabular-nums">
                          {item.sharePercent.toFixed(1)}%
                        </div>
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1 ml-auto">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.max(4, item.sharePercent))}%`,
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </ChartFullscreenShell>
  );
};
