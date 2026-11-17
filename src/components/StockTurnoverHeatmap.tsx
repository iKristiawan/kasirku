import React, { useMemo, useState, useDeferredValue } from 'react';
import {
  Flame,
  Snowflake,
  Search,
  Filter,
  ArrowUpDown,
  Grid3X3,
  CalendarDays,
  TrendingUp,
  Package,
  Truck,
  Sparkles,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Product, Transaction } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';

export type TurnoverTier = 'VERY_FAST' | 'FAST' | 'MEDIUM' | 'SLOW' | 'STAGNANT';

interface StockTurnoverHeatmapProps {
  products: Product[];
  transactions: Transaction[];
  onInitiateRestockForProduct?: (product: Product, recommendedQty: number) => void;
  onSelectProductForMonitoring?: (product: Product) => void;
}

interface DailyCell {
  dayIndex: number;
  shortLabel: string;
  fullDateLabel: string;
  unitsSold: number;
}

interface ProductHeatmapEntry {
  product: Product;
  sold30d: number;
  revenue30d: number;
  txCount30d: number;
  activeDaysCount: number;
  dailyVelocity: number;
  currentStock: number;
  stockAssetValue: number;
  turnoverRatio30d: number;
  daysOfCover: number;
  tier: TurnoverTier;
  intensityScore: number; // 0 to 100 relative score
  dailyCells: DailyCell[];
  maxDailyUnits: number;
}

const TIER_META: Record<
  TurnoverTier,
  {
    label: string;
    shortLabel: string;
    tileClass: string;
    badgeClass: string;
    dotClass: string;
    description: string;
  }
> = {
  VERY_FAST: {
    label: 'Sangat Cepat (Hot)',
    shortLabel: 'Sangat Cepat',
    tileClass:
      'bg-gradient-to-br from-emerald-600 to-teal-700 text-white border-emerald-700 shadow-sm hover:from-emerald-500 hover:to-teal-600',
    badgeClass: 'bg-emerald-600 text-white border-emerald-700',
    dotClass: 'bg-emerald-600',
    description: 'Top 20% produk paling cepat terjual dalam 30 hari terakhir.',
  },
  FAST: {
    label: 'Cepat (Fast-Moving)',
    shortLabel: 'Cepat',
    tileClass:
      'bg-emerald-100/95 text-emerald-950 border-emerald-300 hover:bg-emerald-200/80',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    dotClass: 'bg-emerald-400',
    description: 'Perputaran tinggi dan permintaan stabil di atas rata-rata.',
  },
  MEDIUM: {
    label: 'Sedang (Normal)',
    shortLabel: 'Sedang',
    tileClass:
      'bg-amber-100/90 text-amber-950 border-amber-300 hover:bg-amber-200/80',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    dotClass: 'bg-amber-400',
    description: 'Perputaran moderat dengan penjualan berkala.',
  },
  SLOW: {
    label: 'Lambat (Slow-Moving)',
    shortLabel: 'Lambat',
    tileClass:
      'bg-orange-100/85 text-orange-950 border-orange-300 hover:bg-orange-200/75',
    badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
    dotClass: 'bg-orange-400',
    description: 'Penjualan 30 hari sangat rendah; pantau risiko penumpukan modal.',
  },
  STAGNANT: {
    label: 'Tidak Bergerak (0x)',
    shortLabel: 'Mandek (0x)',
    tileClass:
      'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200/80',
    badgeClass: 'bg-slate-200 text-slate-700 border-slate-300',
    dotClass: 'bg-slate-400',
    description: 'Belum ada penjualan sama sekali dalam 30 hari terakhir.',
  },
};

export const StockTurnoverHeatmap: React.FC<StockTurnoverHeatmapProps> = ({
  products,
  transactions,
  onInitiateRestockForProduct,
  onSelectProductForMonitoring,
}) => {
  const [viewMode, setViewMode] = useState<'GRID' | 'MATRIX'>('GRID');
  const [search, setSearch] = useState<string>('');
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState<string>('SEMUA');
  const [tierFilter, setTierFilter] = useState<'ALL' | TurnoverTier>('ALL');
  const [sortOrder, setSortOrder] = useState<
    'FASTEST_FIRST' | 'SLOWEST_FIRST' | 'TURNOVER_DESC' | 'CAPITAL_DESC'
  >('FASTEST_FIRST');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const {
    entries,
    categories,
    dayHeaders,
    tierCounts,
    stagnantStockCapital,
    fastStockUnits30d,
    totalUnitsSold30d,
    fastestItem,
    slowestOverstockItem,
  } = useMemo(() => {
    const physicalProducts = products.filter((p) => p.productType !== 'JASA');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 86400000;
    const start30dMs = todayStart - 29 * oneDayMs;
    const end30dMs = todayStart + oneDayMs - 1;

    const headers = Array.from({ length: 30 }, (_, idx) => {
      const ts = start30dMs + idx * oneDayMs;
      const d = new Date(ts);
      const isToday = ts === todayStart;
      return {
        dayIndex: idx,
        shortLabel: isToday ? 'Hr Ini' : `${d.getDate()}/${d.getMonth() + 1}`,
        dayNumber: String(d.getDate()),
        fullDateLabel: d.toLocaleDateString('id-ID', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        }),
      };
    });

    interface Agg {
      sold30d: number;
      revenue30d: number;
      txIds: Set<string>;
      daily: number[];
    }

    const aggMap = new Map<string, Agg>();
    physicalProducts.forEach((p) => {
      aggMap.set(p.id, {
        sold30d: 0,
        revenue30d: 0,
        txIds: new Set<string>(),
        daily: new Array(30).fill(0),
      });
    });

    transactions.forEach((tx) => {
      if (tx.timestamp < start30dMs || tx.timestamp > end30dMs) return;
      const dayIdx = Math.min(
        29,
        Math.max(0, Math.floor((tx.timestamp - start30dMs) / oneDayMs))
      );

      tx.items.forEach((item) => {
        const agg = aggMap.get(item.productId);
        if (!agg) return;
        const baseUnits = (item.quantity || 0) * (item.conversionFactor || 1);
        agg.sold30d += baseUnits;
        agg.revenue30d += item.totalAmount || 0;
        agg.txIds.add(tx.id);
        agg.daily[dayIdx] += baseUnits;
      });
    });

    const movingValues = Array.from(aggMap.values())
      .map((a) => a.sold30d)
      .filter((v) => v > 0)
      .sort((a, b) => b - a);

    const maxSold = movingValues[0] || 0;
    const p80 =
      movingValues.length > 0
        ? movingValues[Math.min(movingValues.length - 1, Math.floor(movingValues.length * 0.2))]
        : 0;
    const p55 =
      movingValues.length > 0
        ? movingValues[Math.min(movingValues.length - 1, Math.floor(movingValues.length * 0.45))]
        : 0;
    const p25 =
      movingValues.length > 0
        ? movingValues[Math.min(movingValues.length - 1, Math.floor(movingValues.length * 0.75))]
        : 0;

    const classifyTier = (sold: number): TurnoverTier => {
      if (sold <= 0) return 'STAGNANT';
      if (movingValues.length === 1) return sold >= 3 ? 'VERY_FAST' : 'FAST';
      if (sold >= Math.max(3, p80)) return 'VERY_FAST';
      if (sold >= Math.max(2, p55)) return 'FAST';
      if (sold > Math.max(1, p25) || (p55 === p25 && sold >= p25)) return 'MEDIUM';
      return 'SLOW';
    };

    const catSet = new Set<string>();
    const counts: Record<TurnoverTier, number> = {
      VERY_FAST: 0,
      FAST: 0,
      MEDIUM: 0,
      SLOW: 0,
      STAGNANT: 0,
    };

    let stagnantCapital = 0;
    let fastSold = 0;
    let allSold = 0;

    const resultEntries: ProductHeatmapEntry[] = physicalProducts.map((product) => {
      if (product.category) catSet.add(product.category);
      const agg = aggMap.get(product.id)!;
      const tier = classifyTier(agg.sold30d);
      counts[tier] += 1;

      const currentStock = Math.max(0, product.stockInBaseUnit || 0);
      const stockAssetValue = currentStock * (product.costPrice || 0);
      const dailyVelocity = agg.sold30d / 30;
      const turnoverRatio30d =
        currentStock > 0 ? agg.sold30d / currentStock : agg.sold30d > 0 ? 99 : 0;
      const daysOfCover = dailyVelocity > 0 ? currentStock / dailyVelocity : Infinity;
      const activeDaysCount = agg.daily.filter((u) => u > 0).length;
      const maxDailyUnits = Math.max(0, ...agg.daily);
      const intensityScore = maxSold > 0 ? Math.round((agg.sold30d / maxSold) * 100) : 0;

      if (tier === 'STAGNANT') stagnantCapital += stockAssetValue;
      if (tier === 'VERY_FAST' || tier === 'FAST') fastSold += agg.sold30d;
      allSold += agg.sold30d;

      const dailyCells: DailyCell[] = headers.map((h, idx) => ({
        dayIndex: h.dayIndex,
        shortLabel: h.shortLabel,
        fullDateLabel: h.fullDateLabel,
        unitsSold: agg.daily[idx] || 0,
      }));

      return {
        product,
        sold30d: agg.sold30d,
        revenue30d: agg.revenue30d,
        txCount30d: agg.txIds.size,
        activeDaysCount,
        dailyVelocity,
        currentStock,
        stockAssetValue,
        turnoverRatio30d,
        daysOfCover,
        tier,
        intensityScore,
        dailyCells,
        maxDailyUnits,
      };
    });

    const byFastest = [...resultEntries].sort((a, b) => b.sold30d - a.sold30d);
    const bySlowestOverstock = [...resultEntries]
      .filter((e) => e.currentStock > 0)
      .sort((a, b) => {
        if (a.sold30d !== b.sold30d) return a.sold30d - b.sold30d;
        return b.stockAssetValue - a.stockAssetValue;
      });

    return {
      entries: resultEntries,
      categories: ['SEMUA', ...Array.from(catSet).sort()],
      dayHeaders: headers,
      tierCounts: counts,
      stagnantStockCapital: stagnantCapital,
      fastStockUnits30d: fastSold,
      totalUnitsSold30d: allSold,
      fastestItem: byFastest[0]?.sold30d > 0 ? byFastest[0] : null,
      slowestOverstockItem: bySlowestOverstock[0] || null,
    };
  }, [products, transactions]);

  const filteredEntries = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const list = entries.filter((e) => {
      const matchCat = categoryFilter === 'SEMUA' || e.product.category === categoryFilter;
      const matchTier = tierFilter === 'ALL' || e.tier === tierFilter;
      const matchSearch =
        !q ||
        e.product.name.toLowerCase().includes(q) ||
        e.product.barcode.toLowerCase().includes(q) ||
        (e.product.sku || '').toLowerCase().includes(q) ||
        (e.product.category || '').toLowerCase().includes(q);
      return matchCat && matchTier && matchSearch;
    });

    list.sort((a, b) => {
      switch (sortOrder) {
        case 'FASTEST_FIRST':
          return b.sold30d !== a.sold30d
            ? b.sold30d - a.sold30d
            : b.turnoverRatio30d - a.turnoverRatio30d;
        case 'SLOWEST_FIRST':
          return a.sold30d !== b.sold30d
            ? a.sold30d - b.sold30d
            : b.stockAssetValue - a.stockAssetValue;
        case 'TURNOVER_DESC':
          return b.turnoverRatio30d !== a.turnoverRatio30d
            ? b.turnoverRatio30d - a.turnoverRatio30d
            : b.sold30d - a.sold30d;
        case 'CAPITAL_DESC':
          return b.stockAssetValue - a.stockAssetValue;
        default:
          return 0;
      }
    });

    return list;
  }, [entries, deferredSearch, categoryFilter, tierFilter, sortOrder]);

  const inspectedEntry = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    if (selectedProductId) {
      const found = filteredEntries.find((e) => e.product.id === selectedProductId);
      if (found) return found;
    }
    return filteredEntries[0];
  }, [filteredEntries, selectedProductId]);

  const getDailyHeatColor = (units: number, maxUnits: number) => {
    if (units <= 0) return 'bg-slate-100 text-slate-300 border-slate-200/80';
    const ratio = maxUnits > 0 ? units / maxUnits : 1;
    if (ratio >= 0.75 || units >= 10) return 'bg-emerald-600 text-white border-emerald-700 font-bold';
    if (ratio >= 0.45 || units >= 5) return 'bg-emerald-400 text-emerald-950 border-emerald-500 font-bold';
    if (ratio >= 0.2 || units >= 2) return 'bg-amber-300 text-amber-950 border-amber-400 font-semibold';
    return 'bg-sky-200 text-sky-950 border-sky-300';
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-2xl p-4 md:p-5 text-white border border-emerald-900/50 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300">
              <Flame className="w-4 h-4" />
            </span>
            <h3 className="text-sm md:text-base font-black text-white">
              Heatmap Perputaran Stok (30 Hari Terakhir)
            </h3>
            <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-mono font-bold">
              {entries.length} SKU Fisik
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-2xl">
            Visualisasi kecepatan keluar barang berdasarkan transaksi 30 hari terakhir untuk mengidentifikasi produk paling laris (fast-moving) hingga stok lambat/mandek (slow-moving).
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 text-xs self-start lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setViewMode('GRID');
            }}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'GRID'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Grid3X3 className="w-3.5 h-3.5" />
            <span>Peta Blok Heatmap</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setViewMode('MATRIX');
            }}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'MATRIX'
                ? 'bg-emerald-500 text-slate-950 shadow-xs'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>Matriks Harian (30H)</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-2xs space-y-1">
          <div className="text-[10.5px] font-extrabold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
            <span>Fast-Moving (Cepat)</span>
            <Flame className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-800">
            {formatNumber(tierCounts.VERY_FAST + tierCounts.FAST)} SKU
          </div>
          <div className="text-[10.5px] text-slate-600">
            Menyumbang{' '}
            <strong className="font-mono text-emerald-700">
              {totalUnitsSold30d > 0
                ? `${((fastStockUnits30d / totalUnitsSold30d) * 100).toFixed(0)}%`
                : '0%'}
            </strong>{' '}
            total unit terjual 30h
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-orange-200 shadow-2xs space-y-1">
          <div className="text-[10.5px] font-extrabold text-orange-800 uppercase tracking-wider flex items-center justify-between">
            <span>Slow &amp; Mandek (0x)</span>
            <Snowflake className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl font-black font-mono text-orange-800">
            {formatNumber(tierCounts.SLOW + tierCounts.STAGNANT)} SKU
          </div>
          <div className="text-[10.5px] text-slate-600">
            {tierCounts.SLOW} lambat ·{' '}
            <strong className="text-slate-900">{tierCounts.STAGNANT} tidak terjual</strong> (30h)
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <div className="text-[10.5px] font-extrabold text-slate-600 uppercase tracking-wider flex items-center justify-between">
            <span>Modal Stok Mandek (0x)</span>
            <Package className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-xl md:text-2xl font-black font-mono text-slate-900 truncate">
            {formatRupiah(stagnantStockCapital)}
          </div>
          <div className="text-[10.5px] text-slate-500">
            Valuasi modal barang 0 terjual 30 hari
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-sky-200 shadow-2xs space-y-1">
          <div className="text-[10.5px] font-extrabold text-sky-800 uppercase tracking-wider flex items-center justify-between">
            <span>Tercepat vs Terlambat</span>
            <TrendingUp className="w-4 h-4 text-sky-600" />
          </div>
          {fastestItem ? (
            <>
              <div className="text-xs font-bold text-emerald-800 truncate">
                🔥 {fastestItem.product.name} ({formatNumber(fastestItem.sold30d)} {fastestItem.product.baseUnit})
              </div>
              <div className="text-[11px] font-semibold text-orange-800 truncate">
                ❄️{' '}
                {slowestOverstockItem
                  ? `${slowestOverstockItem.product.name} (${formatNumber(slowestOverstockItem.sold30d)} terjual · stok ${formatNumber(slowestOverstockItem.currentStock)})`
                  : '-'}
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 pt-1">
              Belum ada transaksi penjualan 30 hari terakhir.
            </div>
          )}
        </div>
      </div>

      {/* Filters, Tier Chips & Color Scale Legend */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk, SKU, barcode, atau kategori di heatmap..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={categoryFilter}
                onChange={(e) => {
                  sound.playTap();
                  setCategoryFilter(e.target.value);
                }}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat === 'SEMUA' ? 'Semua Kategori' : cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortOrder}
                onChange={(e) => {
                  sound.playTap();
                  setSortOrder(e.target.value as typeof sortOrder);
                }}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="FASTEST_FIRST">Urut: Tercepat → Terlambat</option>
                <option value="SLOWEST_FIRST">Urut: Terlambat → Tercepat</option>
                <option value="TURNOVER_DESC">Urut: Rasio Perputaran Tertinggi</option>
                <option value="CAPITAL_DESC">Urut: Nilai Modal Tertinggi</option>
              </select>
            </div>
          </div>
        </div>

        {/* Speed Tier Filter Chips + Thermal Intensity Scale Legend */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setTierFilter('ALL');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold border transition-colors cursor-pointer ${
                tierFilter === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Semua ({entries.length})
            </button>
            {(['VERY_FAST', 'FAST', 'MEDIUM', 'SLOW', 'STAGNANT'] as TurnoverTier[]).map((t) => {
              const meta = TIER_META[t];
              const isActive = tierFilter === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setTierFilter(isActive ? 'ALL' : t);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    isActive
                      ? 'ring-2 ring-slate-900/20 ' + meta.badgeClass
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                  <span>
                    {meta.shortLabel} ({tierCounts[t]})
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-[10.5px] text-slate-500 shrink-0">
            <span className="font-bold">Skala Perputaran:</span>
            <span className="text-slate-500">Lambat</span>
            <div className="flex items-center gap-0.5">
              <span className="w-4 h-3 rounded-xs bg-slate-200 border border-slate-300" title="Tidak Bergerak (0)" />
              <span className="w-4 h-3 rounded-xs bg-orange-200 border border-orange-300" title="Lambat" />
              <span className="w-4 h-3 rounded-xs bg-amber-300 border border-amber-400" title="Sedang" />
              <span className="w-4 h-3 rounded-xs bg-emerald-300 border border-emerald-400" title="Cepat" />
              <span className="w-4 h-3 rounded-xs bg-emerald-600 border border-emerald-700" title="Sangat Cepat (Hot)" />
            </div>
            <span className="font-bold text-emerald-700">Cepat</span>
          </div>
        </div>
      </div>

      {/* Main Content: GRID or MATRIX */}
      {filteredEntries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
          <Package className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-bold text-slate-700">
            Tidak ada produk fisik yang sesuai filter Heatmap Stok.
          </p>
        </div>
      ) : viewMode === 'GRID' ? (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
          {/* Heatmap Tiles Grid */}
          <div className="xl:col-span-8 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
              <span>
                Menampilkan <strong className="text-slate-900">{filteredEntries.length}</strong> produk • Klik kotak produk untuk lihat detail pola penjualan 30 hari
              </span>
              <span className="text-[11px] font-mono hidden sm:inline">
                Terurut: {sortOrder === 'FASTEST_FIRST' ? 'Tercepat ↑' : sortOrder === 'SLOWEST_FIRST' ? 'Terlambat ↑' : sortOrder === 'TURNOVER_DESC' ? 'Turnover ↑' : 'Modal ↑'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[540px] overflow-y-auto pr-1">
              {filteredEntries.map((entry) => {
                const meta = TIER_META[entry.tier];
                const isSelected = inspectedEntry?.product.id === entry.product.id;
                const isHot = entry.tier === 'VERY_FAST';
                const isLowStockFast =
                  (entry.tier === 'VERY_FAST' || entry.tier === 'FAST') &&
                  entry.currentStock <= entry.product.minStockAlert;

                return (
                  <button
                    key={entry.product.id}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setSelectedProductId(entry.product.id);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 min-h-[112px] ${
                      meta.tileClass
                    } ${
                      isSelected
                        ? 'ring-2 ring-slate-900 ring-offset-1 scale-[1.01]'
                        : ''
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-1">
                        <span
                          className={`text-[9.5px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            isHot
                              ? 'bg-white/20 text-white'
                              : 'bg-black/5 text-current opacity-85'
                          }`}
                        >
                          {meta.shortLabel}
                        </span>
                        {isLowStockFast && (
                          <span
                            className="p-0.5 rounded bg-rose-600 text-white"
                            title="Fast-moving dengan stok menipis!"
                          >
                            <AlertTriangle className="w-3 h-3" />
                          </span>
                        )}
                      </div>

                      <div className="font-bold text-xs leading-snug line-clamp-2">
                        {entry.product.name}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="text-base font-black font-mono tabular-nums">
                          {formatNumber(entry.sold30d)}
                        </span>
                        <span className="text-[10px] font-mono opacity-85">
                          {entry.product.baseUnit} / 30h
                        </span>
                      </div>

                      <div
                        className={`pt-1 border-t flex items-center justify-between text-[10px] font-mono ${
                          isHot ? 'border-white/20 text-emerald-50' : 'border-black/10 opacity-85'
                        }`}
                      >
                        <span>{entry.dailyVelocity.toFixed(1)}/hr</span>
                        <span>Stok: {formatNumber(entry.currentStock)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Inspector Panel: Selected Product 30-Day Activity Heatmap */}
          {inspectedEntry && (
            <div className="xl:col-span-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-4 sticky top-4">
              <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                <div className="min-w-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold border mb-1.5 ${
                      TIER_META[inspectedEntry.tier].badgeClass
                    }`}
                  >
                    {TIER_META[inspectedEntry.tier].label}
                  </span>
                  <h4 className="text-sm font-black text-slate-900 leading-snug">
                    {inspectedEntry.product.name}
                  </h4>
                  <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                    {inspectedEntry.product.category} • {inspectedEntry.product.sku || inspectedEntry.product.barcode}
                  </p>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Terjual (30 Hari)</div>
                  <div className="text-base font-black font-mono text-slate-900">
                    {formatNumber(inspectedEntry.sold30d)} {inspectedEntry.product.baseUnit}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {inspectedEntry.activeDaysCount}/30 hari aktif ({inspectedEntry.txCount30d} trx)
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Laju / Hari</div>
                  <div className="text-base font-black font-mono text-emerald-700">
                    {inspectedEntry.dailyVelocity.toFixed(2)} /hr
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Rasio putar: {inspectedEntry.turnoverRatio30d.toFixed(1)}x/bln
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Sisa Stok Kini</div>
                  <div className="text-base font-black font-mono text-slate-900">
                    {formatNumber(inspectedEntry.currentStock)} {inspectedEntry.product.baseUnit}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {inspectedEntry.daysOfCover === Infinity
                      ? 'Tidak ada penjualan 30h'
                      : `Cukup ±${Math.round(inspectedEntry.daysOfCover)} hari`}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Modal Stok / Omzet</div>
                  <div className="text-sm font-black font-mono text-slate-900 truncate">
                    {formatRupiah(inspectedEntry.stockAssetValue)}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-semibold truncate">
                    Omzet 30h: {formatRupiah(inspectedEntry.revenue30d)}
                  </div>
                </div>
              </div>

              {/* 30-Day Calendar Mini Heatmap */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-700">Pola Penjualan Harian (30 Hari)</span>
                  <span className="font-mono text-slate-400">H-29 → Hari Ini</span>
                </div>
                <div className="grid grid-cols-10 gap-1">
                  {inspectedEntry.dailyCells.map((cell) => (
                    <div
                      key={cell.dayIndex}
                      title={`${cell.fullDateLabel}: ${formatNumber(cell.unitsSold)} ${inspectedEntry.product.baseUnit}`}
                      className={`h-7 rounded-md border flex flex-col items-center justify-center text-[9.5px] font-mono leading-none ${getDailyHeatColor(
                        cell.unitsSold,
                        inspectedEntry.maxDailyUnits
                      )}`}
                    >
                      <span>{cell.unitsSold > 0 ? cell.unitsSold : '·'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actionable Recommendation */}
              <div className="p-3 rounded-xl bg-sky-50/80 border border-sky-200 text-xs space-y-2">
                <div className="font-bold text-sky-900 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>Rekomendasi Manajerial</span>
                </div>
                <p className="text-[11px] text-sky-950 leading-relaxed">
                  {inspectedEntry.tier === 'VERY_FAST' || inspectedEntry.tier === 'FAST' ? (
                    inspectedEntry.daysOfCover <= 10 ? (
                      <>
                        Perputaran cepat dan stok hanya cukup{' '}
                        <strong>±{Math.max(0, Math.round(inspectedEntry.daysOfCover))} hari</strong>. Prioritaskan restock segera agar tidak kehabisan barang laris.
                      </>
                    ) : (
                      <>
                        Produk favorit dengan perputaran cepat. Pertahankan ketersediaan rak dan stok pengaman minimal{' '}
                        <strong>{Math.ceil(inspectedEntry.dailyVelocity * 10)} {inspectedEntry.product.baseUnit}</strong>.
                      </>
                    )
                  ) : inspectedEntry.tier === 'MEDIUM' ? (
                    <>
                      Perputaran stabil. Lakukan pemesanan sesuai siklus reguler tanpa menumpuk stok berlebih.
                    </>
                  ) : inspectedEntry.currentStock > 0 ? (
                    <>
                      Perputaran lambat dengan nilai modal tertahan{' '}
                      <strong>{formatRupiah(inspectedEntry.stockAssetValue)}</strong>. Pertimbangkan promo diskon, paket bundling dengan barang cepat laku, atau kurangi kuantitas PO berikutnya.
                    </>
                  ) : (
                    <>
                      Stok kosong dan belum ada transaksi 30 hari terakhir. Evaluasi permintaan sebelum menambah stok baru.
                    </>
                  )}
                </p>

                <div className="flex items-center gap-2 pt-1">
                  {onInitiateRestockForProduct &&
                    (inspectedEntry.tier === 'VERY_FAST' ||
                      inspectedEntry.tier === 'FAST' ||
                      inspectedEntry.currentStock <= inspectedEntry.product.minStockAlert) && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          const suggestedQty = Math.max(
                            inspectedEntry.product.minStockAlert * 2,
                            Math.ceil(inspectedEntry.dailyVelocity * 14) - inspectedEntry.currentStock,
                            1
                          );
                          onInitiateRestockForProduct(inspectedEntry.product, suggestedQty);
                        }}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Order PO</span>
                      </button>
                    )}
                  {onSelectProductForMonitoring && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        onSelectProductForMonitoring(inspectedEntry.product);
                      }}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                      <span>Lihat di Monitoring</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* 2D Matrix Heatmap View: Product x Last 30 Days */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-800">
              Matriks Intensitas Penjualan Harian (30 Hari Terakhir) • {filteredEntries.length} Produk
            </span>
            <span className="text-[11px] text-slate-500">
              Geser ke kanan untuk melihat hari-hari sebelumnya hingga Hari Ini
            </span>
          </div>

          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead className="sticky top-0 z-20 bg-slate-100 border-b border-slate-200 text-slate-600 font-bold">
                <tr>
                  <th className="py-2.5 px-3 sticky left-0 bg-slate-100 z-30 min-w-[180px] border-r border-slate-200">
                    Produk &amp; Kecepatan
                  </th>
                  <th className="py-2.5 px-2 text-right min-w-[68px]">30H</th>
                  <th className="py-2.5 px-2 text-right min-w-[60px]">Stok</th>
                  {dayHeaders.map((h) => (
                    <th
                      key={h.dayIndex}
                      title={h.fullDateLabel}
                      className="py-2 px-1 text-center font-mono text-[9.5px] min-w-[26px]"
                    >
                      {h.dayNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEntries.map((entry) => {
                  const meta = TIER_META[entry.tier];
                  return (
                    <tr key={entry.product.id} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 sticky left-0 bg-white z-10 border-r border-slate-200">
                        <div className="font-bold text-slate-900 truncate max-w-[180px]">
                          {entry.product.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold border ${meta.badgeClass}`}
                          >
                            {meta.shortLabel}
                          </span>
                          <span className="text-[9.5px] font-mono text-slate-500">
                            {entry.dailyVelocity.toFixed(1)}/hr
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-black text-slate-900 tabular-nums">
                        {formatNumber(entry.sold30d)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-slate-600 tabular-nums">
                        {formatNumber(entry.currentStock)}
                      </td>
                      {entry.dailyCells.map((cell) => (
                        <td key={cell.dayIndex} className="p-0.5 text-center">
                          <div
                            title={`${entry.product.name} (${cell.fullDateLabel}): ${formatNumber(cell.unitsSold)} ${entry.product.baseUnit}`}
                            className={`w-6 h-6 mx-auto rounded-xs border flex items-center justify-center font-mono text-[9.5px] ${getDailyHeatColor(
                              cell.unitsSold,
                              entry.maxDailyUnits
                            )}`}
                          >
                            {cell.unitsSold > 0 ? cell.unitsSold : ''}
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
