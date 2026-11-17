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
  Package,
  AlertTriangle,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { Product, ProductCategory } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { getCategoryColor } from '../utils/categoryColors';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface CategoryStockPieChartProps {
  products: Product[];
  categories: ProductCategory[];
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

type StockPieMetric = 'UNITS' | 'VALUE' | 'SKU_COUNT';

interface CategoryStockEntry {
  name: string;
  color: string;
  skuCount: number;
  totalUnits: number;
  stockValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  value: number;
  sharePercent: number;
}

const getProductStockValue = (prod: Product): number => {
  const safeUnits = Math.max(0, Number(prod.stockInBaseUnit) || 0);
  if (safeUnits === 0) return 0;

  if (Array.isArray(prod.batches) && prod.batches.length > 0) {
    let batchQty = 0;
    let batchVal = 0;
    prod.batches.forEach((b) => {
      const rem = Math.max(0, Number(b.remainingQuantity) || 0);
      if (rem > 0) {
        batchQty += rem;
        batchVal += rem * (Number(b.costPrice) || Number(prod.costPrice) || 0);
      }
    });
    if (batchQty > 0) {
      if (batchQty === safeUnits) return batchVal;
      const diff = safeUnits - batchQty;
      return Math.max(0, batchVal + diff * (Number(prod.costPrice) || 0));
    }
  }

  return safeUnits * (Number(prod.costPrice) || 0);
};

export const CategoryStockPieChart: React.FC<CategoryStockPieChartProps> = ({
  products,
  categories,
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette, isDefaultTheme } = useChartTheme();
  const [stockMetric, setStockMetric] = useState<StockPieMetric>('UNITS');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const summary = useMemo(() => {
    interface AggBucket {
      name: string;
      skuCount: number;
      totalUnits: number;
      stockValue: number;
      lowStockCount: number;
      outOfStockCount: number;
    }

    const bucketMap = new Map<string, AggBucket>();
    let totalPhysicalSkus = 0;
    let totalPhysicalUnits = 0;
    let totalPhysicalValue = 0;
    let totalLowStockItems = 0;
    let totalOutOfStockItems = 0;
    let excludedServiceCount = 0;

    products.forEach((prod) => {
      if (prod.productType === 'JASA') {
        excludedServiceCount += 1;
        return;
      }

      const catName = (prod.category || 'Umum').trim() || 'Umum';
      if (hiddenCategorySet.has(catName)) return;

      const units = Math.max(0, Number(prod.stockInBaseUnit) || 0);
      const val = getProductStockValue(prod);
      const isOut = units <= 0;
      const isLow = units <= (Number(prod.minStockAlert) || 0);

      totalPhysicalSkus += 1;
      totalPhysicalUnits += units;
      totalPhysicalValue += val;
      if (isLow) totalLowStockItems += 1;
      if (isOut) totalOutOfStockItems += 1;

      const existing = bucketMap.get(catName);
      if (existing) {
        existing.skuCount += 1;
        existing.totalUnits += units;
        existing.stockValue += val;
        if (isLow) existing.lowStockCount += 1;
        if (isOut) existing.outOfStockCount += 1;
      } else {
        bucketMap.set(catName, {
          name: catName,
          skuCount: 1,
          totalUnits: units,
          stockValue: val,
          lowStockCount: isLow ? 1 : 0,
          outOfStockCount: isOut ? 1 : 0,
        });
      }
    });

    const rawEntries = Array.from(bucketMap.values()).map((b) => {
      const metricValue =
        stockMetric === 'UNITS'
          ? b.totalUnits
          : stockMetric === 'VALUE'
          ? b.stockValue
          : b.skuCount;

      return {
        ...b,
        color: getCategoryColor(b.name, categories),
        value: metricValue,
      };
    });

    const totalMetricSum = rawEntries.reduce((sum, e) => sum + e.value, 0);

    const items: CategoryStockEntry[] = rawEntries
      .filter((e) => e.value > 0)
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return b.skuCount - a.skuCount;
      })
      .map((e, idx) => ({
        ...e,
        color: isDefaultTheme ? e.color : palette.series[idx % palette.series.length],
        sharePercent: totalMetricSum > 0 ? (e.value / totalMetricSum) * 100 : 0,
      }));

    const zeroStockCategoriesCount = rawEntries.filter((e) => e.value === 0).length;

    return {
      items,
      totalMetricSum,
      totalPhysicalSkus,
      totalPhysicalUnits,
      totalPhysicalValue,
      totalLowStockItems,
      totalOutOfStockItems,
      excludedServiceCount,
      zeroStockCategoriesCount,
      categoryCountWithStock: items.length,
    };
  }, [products, categories, hiddenCategorySet, stockMetric, isDefaultTheme, palette.series]);

  const focusedIdx =
    pinnedIdx !== null && pinnedIdx < summary.items.length
      ? pinnedIdx
      : hoveredIdx !== null && hoveredIdx < summary.items.length
      ? hoveredIdx
      : null;

  const focusedItem = focusedIdx !== null ? summary.items[focusedIdx] : null;

  const formatMetricValue = (entry: {
    totalUnits: number;
    stockValue: number;
    skuCount: number;
  }): string => {
    if (stockMetric === 'UNITS') return `${formatNumber(entry.totalUnits)} unit`;
    if (stockMetric === 'VALUE') return formatRupiah(entry.stockValue);
    return `${formatNumber(entry.skuCount)} SKU`;
  };

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Komposisi Stok Produk per Kategori"
    >
    <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 shrink-0" style={{ color: palette.primary }} />
              <span>Komposisi Stok Produk per Kategori</span>
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <span aria-hidden="true">·</span>
              <span>Inventaris Fisik Saat Ini</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {summary.categoryCountWithStock} kategori aktif
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
            Distribusi stok inventaris di gudang/toko per kategori berdasarkan total unit stok, estimasi nilai modal (HPP), atau variasi jumlah SKU.
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
                setStockMetric('UNITS');
                setPinnedIdx(null);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                stockMetric === 'UNITS'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Total Unit
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setStockMetric('VALUE');
                setPinnedIdx(null);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                stockMetric === 'VALUE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nilai Stok (Rp)
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setStockMetric('SKU_COUNT');
                setPinnedIdx(null);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                stockMetric === 'SKU_COUNT'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Jumlah SKU
            </button>
          </div>

          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>
      </div>

      {/* Inventory Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-0.5">
          <div className="text-[11px] font-semibold text-slate-500">Total Stok Fisik</div>
          <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
            {formatNumber(summary.totalPhysicalUnits)}{' '}
            <span className="text-xs font-sans font-semibold text-slate-500">unit</span>
          </div>
          <div className="text-[11px] text-slate-400">
            Tersebar di {summary.categoryCountWithStock} kategori
          </div>
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">Estimasi Nilai Modal (HPP)</div>
          <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-sky-700">
            {formatRupiah(summary.totalPhysicalValue)}
          </div>
          <div className="text-[11px] text-slate-400">
            Valuasi stok FIFO / HPP aktif
          </div>
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">Variasi Katalog Barang</div>
          <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
            {formatNumber(summary.totalPhysicalSkus)}{' '}
            <span className="text-xs font-sans font-semibold text-slate-500">SKU</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {summary.excludedServiceCount > 0
              ? `${summary.excludedServiceCount} layanan jasa non-stok dikecualikan`
              : 'Seluruh produk fisik terdata'}
          </div>
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">Perlu Perhatian Stok</div>
          <div
            className={`text-xl md:text-2xl font-black font-mono tabular-nums ${
              summary.totalLowStockItems > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {formatNumber(summary.totalLowStockItems)}{' '}
            <span className="text-xs font-sans font-semibold text-slate-500">item</span>
          </div>
          <div className="text-[11px] text-slate-500">
            {summary.totalOutOfStockItems > 0
              ? `${formatNumber(summary.totalOutOfStockItems)} item stok kosong (0)`
              : summary.totalLowStockItems > 0
              ? 'Di bawah batas minimum stok'
              : 'Semua stok di atas batas minimum'}
          </div>
        </div>
      </div>

      {/* Main Split Content: Pie Chart + Synchronized Category Distribution List */}
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
          <Package className="w-8 h-8 text-slate-300" />
          <p className="text-xs font-bold text-slate-600">
            Belum ada stok barang fisik yang tersedia untuk ditampilkan
          </p>
          <p className="text-[11px] text-slate-400">
            Tambahkan stok barang pada Manajemen Produk atau Penerimaan Pembelian.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Interactive Recharts Pie Chart */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <AnimatedChartStage
              filterKey={`cat-stock-pie-${stockMetric}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
              accent="sky"
              delayMs={100}
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
                    outerRadius={isFullscreen ? 165 : 112}
                    paddingAngle={1.5}
                    stroke="#ffffff"
                    strokeWidth={2}
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
                          key={`stock-pie-${entry.name}`}
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
                      const entry = payload[0]?.payload as CategoryStockEntry | undefined;
                      if (!entry) return null;

                      return (
                        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[235px] space-y-2">
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
                              <span className="text-slate-400">Total Stok Unit:</span>
                              <span className="font-bold text-slate-100 tabular-nums">
                                {formatNumber(entry.totalUnits)} unit
                              </span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-400">Nilai Modal (HPP):</span>
                              <span className="font-bold text-emerald-300 tabular-nums">
                                {formatRupiah(entry.stockValue)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-400">Jumlah SKU:</span>
                              <span className="font-semibold text-slate-200 tabular-nums">
                                {formatNumber(entry.skuCount)} produk
                              </span>
                            </div>
                            {entry.lowStockCount > 0 && (
                              <div className="flex justify-between gap-3 pt-1 border-t border-slate-800">
                                <span className="text-amber-300 font-sans">Stok Menipis:</span>
                                <span className="font-bold text-amber-300 tabular-nums">
                                  {formatNumber(entry.lowStockCount)} SKU
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </AnimatedChartStage>

            {/* Active / Hovered Slice Readout Strip below Pie */}
            <div className="w-full text-center text-xs text-slate-600 pt-1 min-h-[24px]">
              {focusedItem ? (
                <div className="inline-flex items-center gap-2 font-medium text-slate-800">
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
                  Arahkan kursor atau klik irisan pie / daftar untuk menyorot kategori
                </span>
              )}
            </div>
          </div>

          {/* Right: Synchronized Category Inventory Distribution Table/List */}
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
                          <span className="font-bold text-slate-900 text-xs truncate">
                            {item.name}
                          </span>
                          {item.lowStockCount > 0 && (
                            <span
                              className="inline-flex items-center gap-0.5 text-[10.5px] font-semibold text-amber-700 shrink-0"
                              title={`${item.lowStockCount} SKU stok menipis`}
                            >
                              <AlertTriangle className="w-3 h-3" />
                              <span>{item.lowStockCount} menipis</span>
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums flex items-center gap-1.5 flex-wrap">
                          <span>{formatNumber(item.skuCount)} SKU</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatNumber(item.totalUnits)} unit</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatRupiah(item.stockValue)}</span>
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

      {/* Footer Note */}
      {summary.zeroStockCategoriesCount > 0 && summary.items.length > 0 && (
        <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center justify-between flex-wrap gap-2">
          <span>
            {summary.zeroStockCategoriesCount} kategori lainnya saat ini memiliki{' '}
            {stockMetric === 'UNITS'
              ? '0 unit stok'
              : stockMetric === 'VALUE'
              ? 'nilai modal Rp 0'
              : '0 SKU aktif'}.
          </span>
          <span>Urutan berdasarkan proporsi terbesar ke terkecil</span>
        </div>
      )}
    </section>
    </ChartFullscreenShell>
  );
};
