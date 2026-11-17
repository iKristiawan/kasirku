import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  Coins,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  RotateCcw,
  EyeOff,
  Package,
  Search,
} from 'lucide-react';
import { Transaction, Product, ProductCategory } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { getCategoryColor } from '../utils/categoryColors';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface GrossProfitByCategoryPanelProps {
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

type MarginHealthFilter = 'ALL' | 'HIGH' | 'HEALTHY' | 'THIN_OR_LOSS';
type CategoryProfitSort = 'PROFIT_DESC' | 'MARGIN_DESC' | 'REVENUE_DESC' | 'GROWTH_DESC';
type ChartBreakdownMode = 'PROFIT_VS_COGS' | 'PROFIT_COMPARE';

interface ProductProfitItem {
  productId: string;
  name: string;
  sku: string;
  baseUnit: string;
  unitsSold: number;
  txCount: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  shareOfCategoryProfit: number;
}

interface CategoryProfitRow {
  name: string;
  color: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  prevRevenue: number;
  prevCogs: number;
  prevGrossProfit: number;
  prevMarginPercent: number | null;
  profitGrowthPercent: number;
  profitSharePercent: number;
  unitsSold: number;
  skuCount: number;
  txCount: number;
  topProfitProduct: string;
  products: ProductProfitItem[];
}

export const GrossProfitByCategoryPanel: React.FC<GrossProfitByCategoryPanelProps> = ({
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
  const { palette, isDefaultTheme } = useChartTheme();
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [marginFilter, setMarginFilter] = useState<MarginHealthFilter>('ALL');
  const [sortBy, setSortBy] = useState<CategoryProfitSort>('PROFIT_DESC');
  const [chartMode, setChartMode] = useState<ChartBreakdownMode>('PROFIT_VS_COGS');
  const [productSearch, setProductSearch] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Keep panel focus aligned when the top dashboard dropdown isolates a specific category
  useEffect(() => {
    if (specificSelectedCategoryName) {
      setSelectedCategory(specificSelectedCategoryName);
    } else if (!isCategoryFiltered) {
      setSelectedCategory('ALL');
    }
  }, [specificSelectedCategoryName, isCategoryFiltered]);

  const aggregated = useMemo(() => {
    interface ProdAgg {
      productId: string;
      name: string;
      sku: string;
      baseUnit: string;
      unitsSold: number;
      revenue: number;
      cogs: number;
      txIds: Set<string>;
    }

    interface CatAgg {
      name: string;
      revenue: number;
      cogs: number;
      prevRevenue: number;
      prevCogs: number;
      unitsSold: number;
      txIds: Set<string>;
      prodMap: Map<string, ProdAgg>;
    }

    const catMap = new Map<string, CatAgg>();
    const ensureCat = (catName: string): CatAgg => {
      const clean = catName.trim() || 'Umum';
      let existing = catMap.get(clean);
      if (!existing) {
        existing = {
          name: clean,
          revenue: 0,
          cogs: 0,
          prevRevenue: 0,
          prevCogs: 0,
          unitsSold: 0,
          txIds: new Set<string>(),
          prodMap: new Map<string, ProdAgg>(),
        };
        catMap.set(clean, existing);
      }
      return existing;
    };

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      const isCur = ts >= currentStart && ts <= currentEnd;
      const isPrev = ts >= previousStart && ts <= previousEnd;
      if (!isCur && !isPrev) return;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        if (hiddenCategorySet.has(catName)) return;

        const rev = item.totalAmount || 0;
        const cogs = getItemFifoCogs(item, prod);
        const units = (item.quantity || 0) * (item.conversionFactor || 1);
        const cat = ensureCat(catName);

        if (isCur) {
          cat.revenue += rev;
          cat.cogs += cogs;
          cat.unitsSold += units;
          cat.txIds.add(tx.id);

          const prodKey = item.productId || item.productName;
          const existingProd = cat.prodMap.get(prodKey);
          if (existingProd) {
            existingProd.unitsSold += units;
            existingProd.revenue += rev;
            existingProd.cogs += cogs;
            existingProd.txIds.add(tx.id);
          } else {
            cat.prodMap.set(prodKey, {
              productId: item.productId,
              name: prod?.name || item.productName || 'Produk',
              sku: (prod?.sku || prod?.barcode || '').trim(),
              baseUnit: prod?.baseUnit || item.unitName || 'PCS',
              unitsSold: units,
              revenue: rev,
              cogs,
              txIds: new Set([tx.id]),
            });
          }
        } else if (isPrev) {
          cat.prevRevenue += rev;
          cat.prevCogs += cogs;
        }
      });
    });

    const baseRows = Array.from(catMap.values()).filter(
      (c) => c.revenue > 0 || c.prevRevenue > 0
    );

    const storeTotalPositiveProfit = baseRows.reduce((sum, c) => {
      const gp = c.revenue - c.cogs;
      return sum + (gp > 0 ? gp : 0);
    }, 0);

    const allCategoryRows: CategoryProfitRow[] = baseRows.map((c) => {
      const grossProfit = c.revenue - c.cogs;
      const marginPercent = c.revenue > 0 ? (grossProfit / c.revenue) * 100 : 0;
      const prevGrossProfit = c.prevRevenue - c.prevCogs;
      const prevMarginPercent =
        c.prevRevenue > 0 ? (prevGrossProfit / c.prevRevenue) * 100 : null;
      const profitGrowthPercent =
        prevGrossProfit !== 0
          ? ((grossProfit - prevGrossProfit) / Math.abs(prevGrossProfit)) * 100
          : grossProfit > 0
          ? 100
          : 0;
      const profitSharePercent =
        storeTotalPositiveProfit > 0 && grossProfit > 0
          ? (grossProfit / storeTotalPositiveProfit) * 100
          : 0;

      const catPositiveProfit = Math.max(0, grossProfit);
      const productsList: ProductProfitItem[] = Array.from(c.prodMap.values())
        .map((p) => {
          const gp = p.revenue - p.cogs;
          return {
            productId: p.productId,
            name: p.name,
            sku: p.sku,
            baseUnit: p.baseUnit,
            unitsSold: p.unitsSold,
            txCount: p.txIds.size,
            revenue: p.revenue,
            cogs: p.cogs,
            grossProfit: gp,
            marginPercent: p.revenue > 0 ? (gp / p.revenue) * 100 : 0,
            shareOfCategoryProfit:
              catPositiveProfit > 0 && gp > 0 ? (gp / catPositiveProfit) * 100 : 0,
          };
        })
        .sort((a, b) => b.grossProfit - a.grossProfit);

      const topProfitProduct = productsList[0]?.name || '-';

      return {
        name: c.name,
        color: getCategoryColor(c.name, categories),
        revenue: c.revenue,
        cogs: c.cogs,
        grossProfit,
        marginPercent,
        prevRevenue: c.prevRevenue,
        prevCogs: c.prevCogs,
        prevGrossProfit,
        prevMarginPercent,
        profitGrowthPercent,
        profitSharePercent,
        unitsSold: c.unitsSold,
        skuCount: productsList.length,
        txCount: c.txIds.size,
        topProfitProduct,
        products: productsList,
      };
    });

    // Sort allCategoryRows
    allCategoryRows.sort((a, b) => {
      if (sortBy === 'MARGIN_DESC') return b.marginPercent - a.marginPercent;
      if (sortBy === 'REVENUE_DESC') return b.revenue - a.revenue;
      if (sortBy === 'GROWTH_DESC') return b.profitGrowthPercent - a.profitGrowthPercent;
      return b.grossProfit - a.grossProfit;
    });

    return {
      allCategoryRows,
      storeTotalPositiveProfit,
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

  const effectiveSelectedCategory =
    selectedCategory !== 'ALL' &&
    aggregated.allCategoryRows.some((c) => c.name === selectedCategory)
      ? selectedCategory
      : 'ALL';

  const filteredCategoryRows = useMemo(() => {
    return aggregated.allCategoryRows.filter((c) => {
      if (effectiveSelectedCategory !== 'ALL' && c.name !== effectiveSelectedCategory) {
        return false;
      }
      if (marginFilter === 'HIGH') return c.marginPercent >= 25;
      if (marginFilter === 'HEALTHY') return c.marginPercent >= 15 && c.marginPercent < 25;
      if (marginFilter === 'THIN_OR_LOSS') return c.marginPercent < 15;
      return true;
    });
  }, [aggregated.allCategoryRows, effectiveSelectedCategory, marginFilter]);

  const focusedCategoryRow =
    effectiveSelectedCategory !== 'ALL'
      ? aggregated.allCategoryRows.find((c) => c.name === effectiveSelectedCategory) || null
      : null;

  const filteredTotals = useMemo(() => {
    const revenue = filteredCategoryRows.reduce((s, r) => s + r.revenue, 0);
    const cogs = filteredCategoryRows.reduce((s, r) => s + r.cogs, 0);
    const grossProfit = revenue - cogs;
    const prevRevenue = filteredCategoryRows.reduce((s, r) => s + r.prevRevenue, 0);
    const prevCogs = filteredCategoryRows.reduce((s, r) => s + r.prevCogs, 0);
    const prevGrossProfit = prevRevenue - prevCogs;
    const marginPercent = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const profitGrowthPercent =
      prevGrossProfit !== 0
        ? ((grossProfit - prevGrossProfit) / Math.abs(prevGrossProfit)) * 100
        : grossProfit > 0
        ? 100
        : 0;
    const storeProfitContribution =
      aggregated.storeTotalPositiveProfit > 0 && grossProfit > 0
        ? (grossProfit / aggregated.storeTotalPositiveProfit) * 100
        : 0;

    return {
      revenue,
      cogs,
      grossProfit,
      prevGrossProfit,
      marginPercent,
      profitGrowthPercent,
      storeProfitContribution,
    };
  }, [filteredCategoryRows, aggregated.storeTotalPositiveProfit]);

  const focusedProductsFiltered = useMemo(() => {
    if (!focusedCategoryRow) return [];
    const q = productSearch.trim().toLowerCase();
    if (!q) return focusedCategoryRow.products;
    return focusedCategoryRow.products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q))
    );
  }, [focusedCategoryRow, productSearch]);

  const hasLocalPanelFilters =
    effectiveSelectedCategory !== 'ALL' || marginFilter !== 'ALL' || productSearch.trim() !== '';

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Filter & Rincian Gross Profit per Kategori"
    >
    <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
      {/* Header Row */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Coins className="w-4 h-4 shrink-0" style={{ color: palette.positive }} />
              <span>Filter &amp; Rincian Gross Profit per Kategori</span>
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <span aria-hidden="true">·</span>
              <span>{periodLabel}</span>
              <span aria-hidden="true">·</span>
              <span>Basis HPP FIFO</span>
              {effectiveSelectedCategory !== 'ALL' ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-sky-700 font-semibold">{effectiveSelectedCategory}</span>
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
            Analisis laba kotor yang dipecah per kategori produk beserta filter status margin dan rincian kontribusi tiap SKU di dalam kategori terpilih.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Category Picker Dropdown */}
          <div
            className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-xl text-xs transition-colors ${
              effectiveSelectedCategory !== 'ALL'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <Filter
              className={`w-3.5 h-3.5 shrink-0 ${
                effectiveSelectedCategory !== 'ALL' ? 'text-emerald-600' : 'text-slate-400'
              }`}
            />
            <span className="text-slate-500 font-semibold whitespace-nowrap">Kategori:</span>
            <select
              aria-label="Filter Gross Profit per Kategori"
              value={effectiveSelectedCategory}
              onChange={(e) => {
                sound.playTap();
                setSelectedCategory(e.target.value);
                setProductSearch('');
              }}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[175px]"
            >
              <option value="ALL">
                Semua Kategori ({aggregated.allCategoryRows.length})
              </option>
              {aggregated.allCategoryRows.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} ({formatRupiah(c.grossProfit)})
                </option>
              ))}
            </select>
          </div>

          {/* Margin Efficiency Status Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            <span className="text-slate-500 font-semibold whitespace-nowrap">Margin:</span>
            <select
              aria-label="Filter Status Margin Kategori"
              value={marginFilter}
              onChange={(e) => {
                sound.playTap();
                setMarginFilter(e.target.value as MarginHealthFilter);
              }}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="ALL">Semua Margin</option>
              <option value="HIGH">Tinggi (&ge;25%)</option>
              <option value="HEALTHY">Sehat (15–24,9%)</option>
              <option value="THIN_OR_LOSS">Tipis / Rugi (&lt;15%)</option>
            </select>
          </div>

          {/* Sort Order */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            <span className="text-slate-500 font-semibold whitespace-nowrap">Urutkan:</span>
            <select
              aria-label="Urutkan Gross Profit Kategori"
              value={sortBy}
              onChange={(e) => {
                sound.playTap();
                setSortBy(e.target.value as CategoryProfitSort);
              }}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="PROFIT_DESC">Laba Kotor Tertinggi</option>
              <option value="MARGIN_DESC">Margin % Tertinggi</option>
              <option value="REVENUE_DESC">Omzet Tertinggi</option>
              <option value="GROWTH_DESC">Pertumbuhan Laba</option>
            </select>
          </div>

          {hasLocalPanelFilters && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setSelectedCategory('ALL');
                setMarginFilter('ALL');
                setProductSearch('');
              }}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filter</span>
            </button>
          )}

          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>
      </div>

      {/* Quick Category Focus Chips */}
      {aggregated.allCategoryRows.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setSelectedCategory('ALL');
              setProductSearch('');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-colors border cursor-pointer ${
              effectiveSelectedCategory === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            Semua Kategori ({aggregated.allCategoryRows.length})
          </button>
          {aggregated.allCategoryRows.map((cat) => {
            const isSelected = effectiveSelectedCategory === cat.name;
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSelectedCategory((prev) => (prev === cat.name ? 'ALL' : cat.name));
                  setProductSearch('');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors border flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: isSelected ? '#ffffff' : cat.color }}
                />
                <span>{cat.name}</span>
                <span
                  className={`font-mono text-[10.5px] tabular-nums ${
                    isSelected ? 'text-emerald-100' : 'text-slate-500'
                  }`}
                >
                  {formatRupiah(cat.grossProfit)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 py-1 border-b border-slate-100 pb-4">
        <div className="space-y-0.5">
          <div className="text-[11px] font-semibold text-slate-500">
            {focusedCategoryRow
              ? `Laba Kotor · ${focusedCategoryRow.name}`
              : 'Total Laba Kotor Terfilter'}
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className={`text-xl md:text-2xl font-black font-mono tabular-nums ${
                filteredTotals.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatRupiah(filteredTotals.grossProfit)}
            </span>
            {compareWithPrevious && (
              <span
                className={`text-[11px] font-mono font-bold inline-flex items-center ${
                  filteredTotals.profitGrowthPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {filteredTotals.profitGrowthPercent >= 0 ? (
                  <ArrowUpRight className="w-3 h-3" />
                ) : (
                  <ArrowDownRight className="w-3 h-3" />
                )}
                {filteredTotals.profitGrowthPercent >= 0 ? '+' : ''}
                {filteredTotals.profitGrowthPercent.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            {compareWithPrevious
              ? `Periode lalu: ${formatRupiah(filteredTotals.prevGrossProfit)}`
              : `${filteredCategoryRows.length} kategori ditampilkan`}
          </div>
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">Total Omzet Penjualan</div>
          <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
            {formatRupiah(filteredTotals.revenue)}
          </div>
          <div className="text-[11px] text-slate-400">
            HPP FIFO{' '}
            <span className="font-mono font-semibold text-slate-600 tabular-nums">
              {formatRupiah(filteredTotals.cogs)}
            </span>
          </div>
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">Margin Laba Kotor</div>
          <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-sky-700">
            {filteredTotals.marginPercent.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400">
            Efisiensi laba terhadap omzet
          </div>
        </div>

        <div className="space-y-0.5 lg:border-l lg:border-slate-100 lg:pl-4">
          <div className="text-[11px] font-semibold text-slate-500">Pangsa Laba Terhadap Toko</div>
          <div className="text-xl md:text-2xl font-black font-mono tabular-nums text-slate-900">
            {filteredTotals.storeProfitContribution.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400">
            {focusedCategoryRow
              ? `${focusedCategoryRow.skuCount} produk terjual · ${formatNumber(focusedCategoryRow.unitsSold)} unit`
              : `Dari total laba kategori aktif`}
          </div>
        </div>
      </div>

      {/* Empty / Filtered Out State */}
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
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tampilkan Semua Kategori</span>
          </button>
        </div>
      ) : filteredCategoryRows.length === 0 ? (
        <div className="py-12 px-6 flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <Package className="w-8 h-8 text-slate-300" />
          <p className="text-xs font-bold text-slate-600">
            Tidak ada kategori yang cocok dengan filter Gross Profit saat ini
          </p>
          {hasLocalPanelFilters && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setSelectedCategory('ALL');
                setMarginFilter('ALL');
                setProductSearch('');
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
            >
              Reset Filter Panel
            </button>
          )}
        </div>
      ) : focusedCategoryRow ? (
        /* Single Category Isolated Drill-Down View */
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h4 className="text-xs md:text-sm font-bold text-slate-900">
                Rincian Gross Profit Produk dalam Kategori "{focusedCategoryRow.name}"
              </h4>
              <p className="text-[11px] text-slate-500">
                Menampilkan kontribusi laba kotor setiap produk di kategori ini selama {periodLabel}.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Cari produk / SKU..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:outline-none focus:border-emerald-500 w-48"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSelectedCategory('ALL');
                  setProductSearch('');
                }}
                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer whitespace-nowrap shrink-0"
              >
                Semua Kategori
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Produk</th>
                  <th className="py-3 px-4 text-right">Volume</th>
                  <th className="py-3 px-4 text-right">Omzet (Rp)</th>
                  <th className="py-3 px-4 text-right">HPP FIFO (Rp)</th>
                  <th className="py-3 px-4 text-right">Laba Kotor (Rp)</th>
                  <th className="py-3 px-4 text-right">Pangsa Kategori</th>
                  <th className="py-3 px-4 text-right">Margin (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {focusedProductsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Tidak ada produk yang cocok dengan pencarian "{productSearch}".
                    </td>
                  </tr>
                ) : (
                  focusedProductsFiltered.map((prod, idx) => (
                    <tr
                      key={prod.productId || `${prod.name}-${idx}`}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{prod.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {prod.sku ? `${prod.sku} · ` : ''}
                          {formatNumber(prod.txCount)} transaksi
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                        {formatNumber(prod.unitsSold)} {prod.baseUnit}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 font-semibold">
                        {formatRupiah(prod.revenue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                        {formatRupiah(prod.cogs)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-black ${
                          prod.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatRupiah(prod.grossProfit)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        {prod.shareOfCategoryProfit.toFixed(1)}%
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${
                          prod.marginPercent >= 25
                            ? 'text-emerald-700'
                            : prod.marginPercent >= 15
                            ? 'text-sky-700'
                            : prod.marginPercent >= 0
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {prod.marginPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Multi-Category Gross Profit Breakdown Chart + Table */
        <div className="space-y-5">
          {/* Chart Header Toggle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">
              Klik batang atau baris kategori di bawah untuk melihat rincian laba per produk di dalam kategori tersebut.
            </span>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs self-start sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setChartMode('PROFIT_VS_COGS');
                }}
                className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  chartMode === 'PROFIT_VS_COGS'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Laba Kotor vs HPP
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setChartMode('PROFIT_COMPARE');
                }}
                className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap cursor-pointer transition-colors ${
                  chartMode === 'PROFIT_COMPARE'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Laba Ini vs Periode Lalu
              </button>
            </div>
          </div>

          {/* Recharts Bar Chart */}
          <AnimatedChartStage
            filterKey={`gp-cat-${periodLabel}-${effectiveSelectedCategory}-${marginFilter}-${sortBy}-${chartMode}-${hiddenCategorySet.size}`}
            accent="emerald"
            delayMs={80}
            className={isFullscreen ? 'w-full h-[55vh] min-h-[360px]' : 'w-full h-72 md:h-80'}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredCategoryRows}
                margin={{ top: 16, right: 16, left: 8, bottom: 24 }}
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
                  tickFormatter={(val) => {
                    const abs = Math.abs(val);
                    const sign = val < 0 ? '-' : '';
                    if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1)}M`;
                    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(0)}k`;
                    return String(val);
                  }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />
                <RechartsTooltip
                  cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0]?.payload as CategoryProfitRow | undefined;
                    if (!row) return null;

                    return (
                      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[245px] space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: row.color }}
                            />
                            <span className="font-bold text-slate-100 truncate">{row.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-300 font-bold">
                            {row.marginPercent.toFixed(1)}% margin
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Laba Kotor:</span>
                            <span
                              className={`font-black tabular-nums ${
                                row.grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatRupiah(row.grossProfit)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Omzet Penjualan:</span>
                            <span className="font-bold text-sky-300 tabular-nums">
                              {formatRupiah(row.revenue)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Beban HPP FIFO:</span>
                            <span className="font-medium text-slate-300 tabular-nums">
                              {formatRupiah(row.cogs)}
                            </span>
                          </div>
                          {compareWithPrevious && (
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-400">Laba Periode Lalu:</span>
                              <span className="font-medium text-slate-300 tabular-nums">
                                {formatRupiah(row.prevGrossProfit)}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between gap-3 pt-1 border-t border-slate-800 text-[10px] font-sans">
                            <span className="text-slate-400">Kontribusi Laba:</span>
                            <span className="font-semibold text-slate-200">
                              {row.profitSharePercent.toFixed(1)}% • {row.skuCount} produk
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                {chartMode === 'PROFIT_VS_COGS' ? (
                  <>
                    <Bar
                      dataKey="grossProfit"
                      name="Laba Kotor (Rp)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                      className="cursor-pointer"
                      onClick={(data) => {
                        const catName = (data as any)?.name;
                        if (catName) {
                          sound.playTap();
                          setSelectedCategory(catName);
                        }
                      }}
                    >
                      {filteredCategoryRows.map((entry, idx) => (
                        <Cell
                          key={`gp-bar-${idx}`}
                          fill={entry.grossProfit >= 0 ? palette.positive : palette.danger}
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="cogs"
                      name="Beban HPP FIFO (Rp)"
                      fill={palette.neutral}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                      className="cursor-pointer"
                      onClick={(data) => {
                        const catName = (data as any)?.name;
                        if (catName) {
                          sound.playTap();
                          setSelectedCategory(catName);
                        }
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Bar
                      dataKey="grossProfit"
                      name={`Laba ${periodLabel}`}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                      className="cursor-pointer"
                      onClick={(data) => {
                        const catName = (data as any)?.name;
                        if (catName) {
                          sound.playTap();
                          setSelectedCategory(catName);
                        }
                      }}
                    >
                      {filteredCategoryRows.map((entry, idx) => (
                        <Cell
                          key={`gp-cur-${idx}`}
                          fill={
                            isDefaultTheme
                              ? entry.color || palette.positive
                              : palette.series[idx % palette.series.length]
                          }
                        />
                      ))}
                    </Bar>
                    <Bar
                      dataKey="prevGrossProfit"
                      name={`Laba ${previousLabel}`}
                      fill={palette.neutral}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                    />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </AnimatedChartStage>

          {/* Detailed Category Gross Profit Breakdown Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-2xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">Kategori Produk</th>
                  <th className="py-3 px-4 text-right">Omzet (Rp)</th>
                  <th className="py-3 px-4 text-right">HPP FIFO (Rp)</th>
                  <th className="py-3 px-4 text-right">Laba Kotor (Rp)</th>
                  {compareWithPrevious && (
                    <th className="py-3 px-4 text-right">Tren Laba</th>
                  )}
                  <th className="py-3 px-4 text-right">Pangsa Laba</th>
                  <th className="py-3 px-4 text-right">Margin (%)</th>
                  <th className="py-3 px-4">Produk Laba Tertinggi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCategoryRows.map((cat) => (
                  <tr
                    key={cat.name}
                    onClick={() => {
                      sound.playTap();
                      setSelectedCategory(cat.name);
                      setProductSearch('');
                    }}
                    className="hover:bg-slate-50 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 font-bold text-slate-900">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span>{cat.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-600 transition-colors" />
                      </div>
                      <div className="text-[10.5px] text-slate-400 pl-4 font-mono tabular-nums">
                        {cat.skuCount} produk · {formatNumber(cat.unitsSold)} unit · {cat.txCount} trx
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800 font-semibold">
                      {formatRupiah(cat.revenue)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-500">
                      {formatRupiah(cat.cogs)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-black ${
                        cat.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatRupiah(cat.grossProfit)}
                    </td>
                    {compareWithPrevious && (
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`inline-flex items-center font-bold ${
                            cat.profitGrowthPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {cat.profitGrowthPercent >= 0 ? '+' : ''}
                          {cat.profitGrowthPercent.toFixed(1)}%
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                      {cat.profitSharePercent.toFixed(1)}%
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono tabular-nums font-bold ${
                        cat.marginPercent >= 25
                          ? 'text-emerald-700'
                          : cat.marginPercent >= 15
                          ? 'text-sky-700'
                          : cat.marginPercent >= 0
                          ? 'text-amber-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {cat.marginPercent.toFixed(1)}%
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate">
                      {cat.topProfitProduct}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
    </ChartFullscreenShell>
  );
};
