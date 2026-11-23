import React, { useCallback, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  LabelList,
} from 'recharts';
import {
  Percent,
  BarChart3,
  Trophy,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  EyeOff,
  ArrowUpDown,
  X,
} from 'lucide-react';
import { Product, ProductCategory, Transaction } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { getCategoryColor } from '../utils/categoryColors';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { sound } from '../utils/audio';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { AnimatedChartStage } from './AnimatedChartStage';
import { useChartTheme } from './ChartThemeContext';

interface CategoryProfitMarginPoint {
  categoryName: string;
  color: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  prevRevenue: number;
  prevCogs: number;
  prevGrossProfit: number;
  prevMarginPercent: number | null;
  marginDeltaPp: number | null;
  unitsSold: number;
  txCount: number;
  profitSharePercent: number;
  topProducts: Array<{
    productId: string;
    name: string;
    revenue: number;
    grossProfit: number;
    marginPercent: number;
    unitsSold: number;
    baseUnit: string;
  }>;
}

interface CategoryProfitMarginChartProps {
  transactions: Transaction[];
  products: Product[];
  categories?: ProductCategory[];
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

type MarginViewMode = 'MARGIN_BAR' | 'HORIZONTAL_RANK' | 'MARGIN_VS_PROFIT';
type MarginSortBy = 'MARGIN_DESC' | 'PROFIT_DESC' | 'REVENUE_DESC' | 'MARGIN_ASC';

export const CategoryProfitMarginChart: React.FC<CategoryProfitMarginChartProps> = ({
  transactions,
  categories = [],
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
  const getMarginStatusColor = useCallback(
    (marginPercent: number): string => {
      if (marginPercent >= 25) return palette.positive;
      if (marginPercent >= 15) return palette.primary;
      if (marginPercent >= 0) return palette.warning;
      return palette.danger;
    },
    [palette]
  );
  const [viewMode, setViewMode] = useState<MarginViewMode>('MARGIN_BAR');
  const [sortBy, setSortBy] = useState<MarginSortBy>('MARGIN_DESC');
  const [focusedCategory, setFocusedCategory] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const analysis = useMemo(() => {
    interface CatAccumulator {
      name: string;
      revenue: number;
      cogs: number;
      prevRevenue: number;
      prevCogs: number;
      unitsSold: number;
      txIds: Set<string>;
      products: Map<
        string,
        {
          productId: string;
          name: string;
          revenue: number;
          cogs: number;
          unitsSold: number;
          baseUnit: string;
        }
      >;
    }

    const catMap = new Map<string, CatAccumulator>();
    const ensureCat = (name: string): CatAccumulator => {
      let entry = catMap.get(name);
      if (!entry) {
        entry = {
          name,
          revenue: 0,
          cogs: 0,
          prevRevenue: 0,
          prevCogs: 0,
          unitsSold: 0,
          txIds: new Set<string>(),
          products: new Map(),
        };
        catMap.set(name, entry);
      }
      return entry;
    };

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalPrevRevenue = 0;
    let totalPrevCogs = 0;

    transactions.forEach((tx) => {
      const isCur = tx.timestamp >= currentStart && tx.timestamp <= currentEnd;
      const isPrev = tx.timestamp >= previousStart && tx.timestamp <= previousEnd;
      if (!isCur && !isPrev) return;

      const items = tx.items || [];
      items.forEach((item) => {
        if (item.isCashWithdrawal || /tarik\s*tunai/i.test(item.productName || '')) return;
        const prod = productMap.get(item.productId);
        const catName = prod?.category || (item.isService ? 'Jasa' : 'Umum');
        if (hiddenCategorySet.has(catName)) return;

        const rev = item.totalAmount || 0;
        const cogs = getItemFifoCogs(item, prod);
        const qtyBase = (item.quantity || 0) * (item.conversionFactor || 1);
        const bucket = ensureCat(catName);

        if (isCur) {
          totalRevenue += rev;
          totalCogs += cogs;
          bucket.revenue += rev;
          bucket.cogs += cogs;
          bucket.unitsSold += qtyBase;
          bucket.txIds.add(tx.id);

          const pAcc = bucket.products.get(item.productId) || {
            productId: item.productId,
            name: item.productName || prod?.name || 'Produk',
            revenue: 0,
            cogs: 0,
            unitsSold: 0,
            baseUnit: prod?.baseUnit || item.unitName || 'PCS',
          };
          pAcc.revenue += rev;
          pAcc.cogs += cogs;
          pAcc.unitsSold += qtyBase;
          bucket.products.set(item.productId, pAcc);
        } else if (isPrev) {
          totalPrevRevenue += rev;
          totalPrevCogs += cogs;
          bucket.prevRevenue += rev;
          bucket.prevCogs += cogs;
        }
      });
    });

    const totalGrossProfit = totalRevenue - totalCogs;
    const overallMarginPercent =
      totalRevenue > 0 ? Number(((totalGrossProfit / totalRevenue) * 100).toFixed(1)) : 0;
    const prevOverallMargin =
      totalPrevRevenue > 0
        ? Number((((totalPrevRevenue - totalPrevCogs) / totalPrevRevenue) * 100).toFixed(1))
        : null;

    const rawCategories: CategoryProfitMarginPoint[] = Array.from(catMap.values())
      .filter((c) => c.revenue > 0 || c.cogs > 0)
      .map((c) => {
        const grossProfit = c.revenue - c.cogs;
        const marginPercent =
          c.revenue > 0 ? Number(((grossProfit / c.revenue) * 100).toFixed(1)) : 0;
        const prevGrossProfit = c.prevRevenue - c.prevCogs;
        const prevMarginPercent =
          c.prevRevenue > 0
            ? Number(((prevGrossProfit / c.prevRevenue) * 100).toFixed(1))
            : null;
        const marginDeltaPp =
          prevMarginPercent !== null
            ? Number((marginPercent - prevMarginPercent).toFixed(1))
            : null;
        const profitSharePercent =
          totalGrossProfit > 0
            ? Number(((grossProfit / totalGrossProfit) * 100).toFixed(1))
            : 0;

        const topProducts = Array.from(c.products.values())
          .map((p) => {
            const pProfit = p.revenue - p.cogs;
            const pMargin = p.revenue > 0 ? Number(((pProfit / p.revenue) * 100).toFixed(1)) : 0;
            return {
              productId: p.productId,
              name: p.name,
              revenue: p.revenue,
              grossProfit: pProfit,
              marginPercent: pMargin,
              unitsSold: p.unitsSold,
              baseUnit: p.baseUnit,
            };
          })
          .sort((a, b) => b.grossProfit - a.grossProfit)
          .slice(0, 3);

        return {
          categoryName: c.name,
          color: getCategoryColor(c.name, categories),
          revenue: c.revenue,
          cogs: c.cogs,
          grossProfit,
          marginPercent,
          prevRevenue: c.prevRevenue,
          prevCogs: c.prevCogs,
          prevGrossProfit,
          prevMarginPercent,
          marginDeltaPp,
          unitsSold: c.unitsSold,
          txCount: c.txIds.size,
          profitSharePercent,
          topProducts,
        };
      });

    const sorted = [...rawCategories].sort((a, b) => {
      switch (sortBy) {
        case 'PROFIT_DESC':
          return b.grossProfit - a.grossProfit;
        case 'REVENUE_DESC':
          return b.revenue - a.revenue;
        case 'MARGIN_ASC':
          return a.marginPercent - b.marginPercent;
        case 'MARGIN_DESC':
        default:
          return b.marginPercent - a.marginPercent;
      }
    });

    const byMarginDesc = [...rawCategories].sort((a, b) => b.marginPercent - a.marginPercent);
    const byProfitDesc = [...rawCategories].sort((a, b) => b.grossProfit - a.grossProfit);

    return {
      rows: sorted,
      totalRevenue,
      totalCogs,
      totalGrossProfit,
      overallMarginPercent,
      prevOverallMargin,
      highestMarginCategory: byMarginDesc[0] || null,
      lowestMarginCategory: byMarginDesc.length > 1 ? byMarginDesc[byMarginDesc.length - 1] : null,
      mostProfitableCategory: byProfitDesc[0] || null,
      aboveAverageCount: rawCategories.filter((r) => r.marginPercent >= overallMarginPercent).length,
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
    sortBy,
  ]);

  const activeCategoryDetail = useMemo(
    () =>
      focusedCategory
        ? analysis.rows.find((r) => r.categoryName === focusedCategory) || null
        : null,
    [focusedCategory, analysis.rows]
  );

  const renderTooltipContent = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: ReadonlyArray<{ payload?: CategoryProfitMarginPoint }>;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[250px] space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: item.color }}
            />
            <span className="font-bold text-slate-100 truncate">{item.categoryName}</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 shrink-0">
            {formatNumber(item.txCount)} nota
          </span>
        </div>

        <div className="space-y-1 font-mono text-[11px]">
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Margin Keuntungan:</span>
            <span
              className={`font-black tabular-nums ${
                item.marginPercent >= 25
                  ? 'text-emerald-400'
                  : item.marginPercent >= 15
                  ? 'text-sky-400'
                  : item.marginPercent >= 0
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {item.marginPercent.toFixed(1)}%
            </span>
          </div>

          {compareWithPrevious && item.prevMarginPercent !== null && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-400">Margin {previousLabel}:</span>
              <span className="text-slate-300 tabular-nums">
                {item.prevMarginPercent.toFixed(1)}%
                {item.marginDeltaPp !== null && (
                  <span
                    className={`ml-1.5 font-bold ${
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

          <div className="flex justify-between gap-3 pt-1 border-t border-slate-800">
            <span className="text-slate-400">Laba Kotor (FIFO):</span>
            <span className="font-bold text-emerald-300 tabular-nums">
              {formatRupiah(item.grossProfit)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Omzet Penjualan:</span>
            <span className="text-sky-300 tabular-nums">{formatRupiah(item.revenue)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Modal HPP FIFO:</span>
            <span className="text-slate-300 tabular-nums">{formatRupiah(item.cogs)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-400">Kontribusi Laba Toko:</span>
            <span className="font-semibold text-amber-300 tabular-nums">
              {item.profitSharePercent.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/80">
          Klik batang grafik untuk melihat top produk di kategori ini
        </div>
      </div>
    );
  };

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Margin Keuntungan per Kategori Produk (%)"
    >
      <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
        {/* Header Row */}
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <Percent className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Visualisasi Margin Keuntungan per Kategori Produk</span>
              </h3>
              <span className="text-xs text-slate-500 font-medium">
                · {periodLabel} · Basis HPP FIFO
                {specificSelectedCategoryName ? (
                  <span className="text-sky-700 font-semibold"> · {specificSelectedCategoryName}</span>
                ) : isCategoryFiltered ? (
                  <span className="text-amber-700 font-semibold">
                    {' '}
                    · {activeCategoryCount}/{totalCategoriesCount} Kategori
                  </span>
                ) : null}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Bandingkan persentase margin laba dan kontribusi rupiah setiap kategori untuk mengidentifikasi kategori paling menguntungkan dan peluang optimasi harga.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setViewMode('MARGIN_BAR');
                }}
                className={`px-2.5 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'MARGIN_BAR'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Grafik Margin (%)
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setViewMode('HORIZONTAL_RANK');
                }}
                className={`px-2.5 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'HORIZONTAL_RANK'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Peringkat Horizontal
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setViewMode('MARGIN_VS_PROFIT');
                }}
                className={`px-2.5 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  viewMode === 'MARGIN_VS_PROFIT'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Margin % &amp; Laba (Rp)
              </button>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                aria-label="Urutkan kategori berdasarkan"
                value={sortBy}
                onChange={(e) => {
                  sound.playTap();
                  setSortBy(e.target.value as MarginSortBy);
                }}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="MARGIN_DESC">Margin Tertinggi (%)</option>
                <option value="PROFIT_DESC">Laba Terbesar (Rp)</option>
                <option value="REVENUE_DESC">Omzet Terbesar</option>
                <option value="MARGIN_ASC">Margin Terendah (%)</option>
              </select>
            </div>

            <FullscreenToggleButton
              isFullscreen={isFullscreen}
              onToggle={() => setIsFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Executive Highlights Strip (Flat dividers, tabular numerals) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-slate-100">
          <div className="space-y-0.5">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Kategori Margin Tertinggi</span>
            </div>
            {analysis.highestMarginCategory ? (
              <>
                <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-emerald-700">
                  {analysis.highestMarginCategory.marginPercent.toFixed(1)}%
                </div>
                <div className="text-[11px] font-semibold text-slate-700 truncate">
                  {analysis.highestMarginCategory.categoryName}{' '}
                  <span className="font-mono text-slate-500">
                    ({formatRupiah(analysis.highestMarginCategory.grossProfit)})
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-400 pt-1">Belum ada data</div>
            )}
          </div>

          <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span>Penyumbang Laba Terbesar</span>
            </div>
            {analysis.mostProfitableCategory ? (
              <>
                <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
                  {formatRupiah(analysis.mostProfitableCategory.grossProfit)}
                </div>
                <div className="text-[11px] font-semibold text-slate-600 truncate">
                  {analysis.mostProfitableCategory.categoryName} ·{' '}
                  <span className="font-mono text-sky-700">
                    {analysis.mostProfitableCategory.profitSharePercent.toFixed(1)}% pangsa laba
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-400 pt-1">Belum ada data</div>
            )}
          </div>

          <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-[11px] font-semibold text-slate-500">Rata-rata Margin Toko</div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
                {analysis.overallMarginPercent.toFixed(1)}%
              </span>
              {compareWithPrevious && analysis.prevOverallMargin !== null && (
                <span
                  className={`text-[11px] font-mono font-bold inline-flex items-center ${
                    analysis.overallMarginPercent >= analysis.prevOverallMargin
                      ? 'text-emerald-600'
                      : 'text-rose-600'
                  }`}
                >
                  {analysis.overallMarginPercent >= analysis.prevOverallMargin ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  {(analysis.overallMarginPercent - analysis.prevOverallMargin) >= 0 ? '+' : ''}
                  {(analysis.overallMarginPercent - analysis.prevOverallMargin).toFixed(1)}%
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 tabular-nums">
              {analysis.aboveAverageCount}/{analysis.rows.length} kategori di atas rata-rata
            </div>
          </div>

          <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Margin Terendah</span>
            </div>
            {analysis.lowestMarginCategory ? (
              <>
                <div
                  className={`text-xl md:text-2xl font-black font-mono tabular-nums ${
                    analysis.lowestMarginCategory.marginPercent < 10
                      ? 'text-rose-700'
                      : 'text-amber-700'
                  }`}
                >
                  {analysis.lowestMarginCategory.marginPercent.toFixed(1)}%
                </div>
                <div className="text-[11px] font-semibold text-slate-600 truncate">
                  {analysis.lowestMarginCategory.categoryName}{' '}
                  <span className="font-mono text-slate-500">
                    ({formatRupiah(analysis.lowestMarginCategory.grossProfit)})
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-400 pt-1">
                {analysis.rows.length === 1 ? 'Hanya 1 kategori aktif' : 'Belum ada data'}
              </div>
            )}
          </div>
        </div>

        {/* Chart Canvas */}
        <AnimatedChartStage
          filterKey={`cat-margin-${viewMode}-${sortBy}-${periodLabel}-${compareWithPrevious}-${analysis.rows.length}-${Array.from(hiddenCategorySet).join(',')}`}
          accent="emerald"
          delayMs={80}
          className={
            isFullscreen
              ? 'w-full h-[60vh] min-h-[380px]'
              : viewMode === 'HORIZONTAL_RANK'
              ? 'w-full h-96 md:h-[440px]'
              : 'w-full h-80 md:h-96'
          }
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
          ) : analysis.rows.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
              <Percent className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-600">
                Belum ada transaksi kategori pada {periodLabel} untuk memvisualisasikan margin keuntungan
              </p>
            </div>
          ) : viewMode === 'HORIZONTAL_RANK' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analysis.rows}
                layout="vertical"
                margin={{ top: 12, right: 64, left: 10, bottom: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={palette.grid} />
                <XAxis
                  type="number"
                  tickFormatter={(val) => `${val}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="categoryName"
                  width={130}
                  tick={{ fontSize: 11, fill: '#334155', fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine
                  x={analysis.overallMarginPercent}
                  stroke={palette.secondary}
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                />
                <RechartsTooltip
                  cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                  content={renderTooltipContent}
                />
                <Bar
                  dataKey="marginPercent"
                  name="Margin Keuntungan (%)"
                  radius={[0, 6, 6, 0]}
                  barSize={24}
                  className="cursor-pointer"
                  onClick={(data) => {
                    const cat = (data as unknown as CategoryProfitMarginPoint)?.categoryName;
                    if (cat) {
                      sound.playTap();
                      setFocusedCategory((prev) => (prev === cat ? null : cat));
                    }
                  }}
                >
                  {analysis.rows.map((entry, idx) => (
                    <Cell
                      key={`horiz-margin-${idx}`}
                      fill={getMarginStatusColor(entry.marginPercent)}
                      opacity={
                        focusedCategory && focusedCategory !== entry.categoryName ? 0.35 : 1
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="marginPercent"
                    position="right"
                    formatter={(val: unknown) => `${Number(val || 0).toFixed(1)}%`}
                    style={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : viewMode === 'MARGIN_VS_PROFIT' ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={analysis.rows}
                margin={{ top: 20, right: 16, left: 10, bottom: 26 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="categoryName"
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  yAxisId="profit"
                  tickFormatter={(val) => {
                    const abs = Math.abs(val);
                    if (abs >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                    if (abs >= 1000) return `${(val / 1000).toFixed(0)}k`;
                    return String(val);
                  }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <YAxis
                  yAxisId="margin"
                  orientation="right"
                  tickFormatter={(val) => `${val}%`}
                  tick={{ fontSize: 11, fill: palette.positiveDark, fontWeight: 700 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <ReferenceLine
                  yAxisId="margin"
                  y={analysis.overallMarginPercent}
                  stroke={palette.secondary}
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                />
                <RechartsTooltip
                  cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                  content={renderTooltipContent}
                />
                <Bar
                  yAxisId="profit"
                  dataKey="grossProfit"
                  name="Laba Kotor (Rp)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={44}
                  className="cursor-pointer"
                  onClick={(data) => {
                    const cat = (data as unknown as CategoryProfitMarginPoint)?.categoryName;
                    if (cat) {
                      sound.playTap();
                      setFocusedCategory((prev) => (prev === cat ? null : cat));
                    }
                  }}
                >
                  {analysis.rows.map((entry, idx) => (
                    <Cell
                      key={`combo-profit-${idx}`}
                      fill={entry.color || palette.primary}
                      opacity={
                        focusedCategory && focusedCategory !== entry.categoryName ? 0.35 : 0.85
                      }
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="margin"
                  type="monotone"
                  dataKey="marginPercent"
                  name="Margin Keuntungan (%)"
                  stroke={palette.positiveDark}
                  strokeWidth={2.8}
                  dot={{ r: 4.5, fill: '#ffffff', stroke: palette.positiveDark, strokeWidth: 2.2 }}
                  activeDot={{ r: 6, fill: palette.positiveDark, stroke: '#ffffff', strokeWidth: 2 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analysis.rows}
                margin={{ top: 24, right: 16, left: 4, bottom: 26 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="categoryName"
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  tickFormatter={(val) => `${val}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                <ReferenceLine
                  y={analysis.overallMarginPercent}
                  stroke={palette.secondary}
                  strokeDasharray="5 4"
                  strokeWidth={1.6}
                  label={{
                    value: `Rata-rata Toko: ${analysis.overallMarginPercent.toFixed(1)}%`,
                    position: 'insideTopRight',
                    fill: palette.secondary,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
                <RechartsTooltip
                  cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                  content={renderTooltipContent}
                />
                <Bar
                  dataKey="marginPercent"
                  name={`Margin ${periodLabel}`}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                  className="cursor-pointer"
                  onClick={(data) => {
                    const cat = (data as unknown as CategoryProfitMarginPoint)?.categoryName;
                    if (cat) {
                      sound.playTap();
                      setFocusedCategory((prev) => (prev === cat ? null : cat));
                    }
                  }}
                >
                  {analysis.rows.map((entry, idx) => (
                    <Cell
                      key={`bar-margin-${idx}`}
                      fill={getMarginStatusColor(entry.marginPercent)}
                      opacity={
                        focusedCategory && focusedCategory !== entry.categoryName ? 0.35 : 1
                      }
                    />
                  ))}
                  <LabelList
                    dataKey="marginPercent"
                    position="top"
                    formatter={(val: unknown) => `${Number(val || 0).toFixed(1)}%`}
                    style={{ fontSize: 10.5, fontWeight: 700, fill: '#334155' }}
                  />
                </Bar>
                {compareWithPrevious && (
                  <Bar
                    dataKey="prevMarginPercent"
                    name={`Margin ${previousLabel}`}
                    fill={palette.neutral}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                    opacity={0.65}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </AnimatedChartStage>

        {/* Pinned Category Drilldown Strip (when manager clicks a bar) */}
        {activeCategoryDetail && (
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: activeCategoryDetail.color }}
                />
                <h4 className="text-xs md:text-sm font-bold text-slate-900">
                  Detail Profitabilitas Kategori: {activeCategoryDetail.categoryName}
                </h4>
                <span className="text-xs font-mono font-black text-emerald-700 tabular-nums">
                  Margin {activeCategoryDetail.marginPercent.toFixed(1)}% · Laba{' '}
                  {formatRupiah(activeCategoryDetail.grossProfit)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setFocusedCategory(null)}
                className="self-start sm:self-auto px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-600 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Tutup Detail</span>
              </button>
            </div>

            {activeCategoryDetail.topProducts.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                      <th className="py-1.5 pr-3">Top Produk di Kategori</th>
                      <th className="py-1.5 px-3 text-right">Terjual</th>
                      <th className="py-1.5 px-3 text-right">Omzet</th>
                      <th className="py-1.5 px-3 text-right">Laba Kotor</th>
                      <th className="py-1.5 pl-3 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70">
                    {activeCategoryDetail.topProducts.map((p) => (
                      <tr key={p.productId}>
                        <td className="py-1.5 pr-3 font-semibold text-slate-800">{p.name}</td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-600">
                          {formatNumber(p.unitsSold)} {p.baseUnit}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums text-slate-700">
                          {formatRupiah(p.revenue)}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                          {formatRupiah(p.grossProfit)}
                        </td>
                        <td className="py-1.5 pl-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {p.marginPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Legend Footer */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3.5 flex-wrap">
            {viewMode === 'MARGIN_VS_PROFIT' ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.primary }} />
                  <span>Batang = Laba Kotor (Rp)</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: palette.positiveDark }} />
                  <span>Garis = Margin Keuntungan (%)</span>
                </span>
              </>
            ) : (
              <>
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
              </>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-3 h-0.5 border-t-2 border-dashed inline-block"
                style={{ borderColor: palette.secondary }}
              />
              <span>Rata-rata Toko ({analysis.overallMarginPercent.toFixed(1)}%)</span>
            </span>
          </div>

          <span className="text-[11px] text-slate-400">
            Klik batang kategori untuk detail produk terprofit
          </span>
        </div>
      </section>
    </ChartFullscreenShell>
  );
};
