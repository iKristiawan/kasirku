import React, { useMemo, useState } from 'react';
import {
  PackageCheck,
  AlertTriangle,
  ShoppingBag,
  Clock,
  ArrowRight,
  Boxes,
  Filter,
} from 'lucide-react';
import { Product, Transaction } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';

interface StockRunwayProjectionCardProps {
  products: Product[];
  transactions: Transaction[];
  hiddenCategorySet: Set<string>;
  isCategoryFiltered: boolean;
  activeCategoryCount: number;
  totalCategoriesCount: number;
  specificSelectedCategoryName?: string | null;
  onJumpToStockThreshold?: () => void;
}

type RunwayFilterMode = 'URGENT' | 'ALL_ACTIVE';

interface ProductRunwayRow {
  id: string;
  name: string;
  category: string;
  baseUnit: string;
  stock: number;
  sold7d: number;
  avgDailySales: number;
  daysUntilStockout: number;
  suggestedReorderUnits: number;
  estimatedOrderCost: number;
  urgency: 'OUT' | 'CRITICAL' | 'SOON' | 'WATCH' | 'SAFE';
  urgencyLabel: string;
}

const TARGET_BUFFER_DAYS = 14;

export const StockRunwayProjectionCard: React.FC<StockRunwayProjectionCardProps> = ({
  products,
  transactions,
  hiddenCategorySet,
  isCategoryFiltered,
  activeCategoryCount,
  totalCategoriesCount,
  specificSelectedCategoryName,
  onJumpToStockThreshold,
}) => {
  const [listMode, setListMode] = useState<RunwayFilterMode>('URGENT');

  const projection = useMemo(() => {
    const now = new Date();
    const oneDayMs = 86400000;
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start7dMs = todayStartMs - 6 * oneDayMs;
    const end7dMs = todayStartMs + oneDayMs - 1;

    // 1. Accumulate units sold (in base unit) per product over rolling last 7 days
    const sold7dByProduct = new Map<string, number>();
    let totalUnitsSold7d = 0;

    transactions.forEach((tx) => {
      if (tx.timestamp < start7dMs || tx.timestamp > end7dMs) return;
      (tx.items || []).forEach((item) => {
        if (!item.productId) return;
        const units = Math.max(0, (Number(item.quantity) || 0) * (Number(item.conversionFactor) || 1));
        if (units <= 0) return;
        sold7dByProduct.set(item.productId, (sold7dByProduct.get(item.productId) || 0) + units);
        totalUnitsSold7d += units;
      });
    });

    // 2. Evaluate each physical product respecting category filter
    const rows: ProductRunwayRow[] = [];
    let totalStockUnits = 0;
    let totalActiveAvgDailyUnits = 0;
    let outOfStockCount = 0;
    let critical3dCount = 0;
    let soon7dCount = 0;
    let watch14dCount = 0;
    let safeCount = 0;
    let stagnantCount = 0;
    let totalSuggestedBudget = 0;

    products.forEach((p) => {
      if ((p.productType || 'BARANG') === 'JASA') return;
      const catName = (p.category || 'Umum').trim() || 'Umum';
      if (hiddenCategorySet.has(catName)) return;

      const stock = Math.max(0, Number(p.stockInBaseUnit) || 0);
      const sold7d = sold7dByProduct.get(p.id) || 0;
      const avgDailySales = sold7d / 7;
      const costPrice = Math.max(0, Number(p.costPrice) || 0);
      const minAlert = Math.max(1, Number(p.minStockAlert) || 5);

      totalStockUnits += stock;

      if (avgDailySales <= 0 && stock > 0) {
        stagnantCount += 1;
        return;
      }

      totalActiveAvgDailyUnits += avgDailySales;

      const daysUntilStockout =
        stock <= 0 ? 0 : avgDailySales > 0 ? stock / avgDailySales : Infinity;

      let urgency: ProductRunwayRow['urgency'] = 'SAFE';
      let urgencyLabel = 'Aman (>14 hr)';

      if (stock <= 0) {
        urgency = 'OUT';
        urgencyLabel = 'Stok Habis';
        outOfStockCount += 1;
      } else if (daysUntilStockout <= 3) {
        urgency = 'CRITICAL';
        urgencyLabel = 'Kritis ≤ 3 Hr';
        critical3dCount += 1;
      } else if (daysUntilStockout <= 7) {
        urgency = 'SOON';
        urgencyLabel = 'Pesan ≤ 7 Hr';
        soon7dCount += 1;
      } else if (daysUntilStockout <= 14) {
        urgency = 'WATCH';
        urgencyLabel = 'Pantau ≤ 14 Hr';
        watch14dCount += 1;
      } else {
        safeCount += 1;
      }

      const targetUnitsFor14d =
        avgDailySales > 0 ? Math.ceil(avgDailySales * TARGET_BUFFER_DAYS) : minAlert * 2;
      const suggestedReorderUnits =
        daysUntilStockout <= TARGET_BUFFER_DAYS
          ? Math.max(0, targetUnitsFor14d - stock)
          : 0;
      const estimatedOrderCost = Math.round(suggestedReorderUnits * costPrice);

      if (daysUntilStockout <= 7) {
        totalSuggestedBudget += estimatedOrderCost;
      }

      rows.push({
        id: p.id,
        name: p.name,
        category: catName,
        baseUnit: p.baseUnit || 'PCS',
        stock,
        sold7d,
        avgDailySales,
        daysUntilStockout,
        suggestedReorderUnits,
        estimatedOrderCost,
        urgency,
        urgencyLabel,
      });
    });

    // Sort shortest runway first; for tied 0-day stockouts, prioritize highest demand
    rows.sort((a, b) => {
      if (a.daysUntilStockout !== b.daysUntilStockout) {
        return a.daysUntilStockout - b.daysUntilStockout;
      }
      return b.avgDailySales - a.avgDailySales;
    });

    const urgentRows = rows.filter((r) => r.daysUntilStockout <= 14);
    const urgentUnder7dCount = outOfStockCount + critical3dCount + soon7dCount;

    // Average runway across products with positive stock & sales
    const movingWithStock = rows.filter((r) => r.stock > 0 && r.avgDailySales > 0);
    const avgRunwayDays =
      movingWithStock.length > 0
        ? movingWithStock.reduce((sum, r) => sum + Math.min(r.daysUntilStockout, 90), 0) /
          movingWithStock.length
        : null;

    const shortestActive = movingWithStock[0] || null;
    const rangeStart = new Date(start7dMs);
    const rangeLabel = `${rangeStart.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })} – Hari Ini`;

    return {
      rows,
      urgentRows,
      urgentUnder7dCount,
      outOfStockCount,
      critical3dCount,
      soon7dCount,
      watch14dCount,
      safeCount,
      stagnantCount,
      movingCount: rows.length,
      totalStockUnits,
      totalUnitsSold7d,
      totalActiveAvgDailyUnits,
      avgRunwayDays,
      shortestActive,
      totalSuggestedBudget,
      rangeLabel,
    };
  }, [products, transactions, hiddenCategorySet]);

  const displayedRows =
    listMode === 'URGENT'
      ? projection.urgentRows.slice(0, 4)
      : projection.rows.slice(0, 4);

  const tone =
    projection.outOfStockCount > 0 || projection.critical3dCount > 0
      ? 'rose'
      : projection.soon7dCount > 0
      ? 'amber'
      : 'emerald';

  const formatDaysBadge = (days: number): string => {
    if (days <= 0) return '0 hari';
    if (!Number.isFinite(days)) return '—';
    if (days >= 90) return '90+ hr';
    return `${days.toFixed(1)} hr`;
  };

  return (
    <AnimatedChartStage
      filterKey={`stock-runway-${listMode}-${Array.from(hiddenCategorySet).join(',')}-${transactions.length}-${products.length}`}
      accent={tone === 'emerald' ? 'emerald' : 'amber'}
      delayMs={95}
      className={`rounded-xl border transition-colors ${
        tone === 'rose'
          ? 'bg-gradient-to-r from-rose-50/85 via-white to-amber-50/45 border-rose-200'
          : tone === 'amber'
          ? 'bg-gradient-to-r from-amber-50/90 via-white to-orange-50/45 border-amber-200'
          : 'bg-gradient-to-r from-emerald-50/80 via-white to-sky-50/45 border-emerald-200'
      }`}
    >
      <div className="p-3 md:p-3.5 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* Left: Primary Headline KPI & Velocity Summary */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-slate-700">
                <Boxes
                  className={`w-3.5 h-3.5 shrink-0 ${
                    tone === 'rose'
                      ? 'text-rose-600'
                      : tone === 'amber'
                      ? 'text-amber-600'
                      : 'text-emerald-600'
                  }`}
                />
                <span>Proyeksi Kebutuhan Stok</span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {specificSelectedCategoryName ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800">
                    <Filter className="w-2.5 h-2.5" />
                    <span>{specificSelectedCategoryName}</span>
                  </span>
                ) : isCategoryFiltered ? (
                  <span className="text-[10px] font-bold text-amber-800">
                    {activeCategoryCount}/{totalCategoriesCount} Kategori
                  </span>
                ) : null}
                <span className="text-[10px] font-mono font-bold text-slate-500">
                  Basis 7H ({projection.rangeLabel})
                </span>
              </div>
            </div>

            {/* Big Figure Row */}
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span
                className={`text-2xl md:text-[26px] font-black font-mono tabular-nums tracking-tight leading-none ${
                  tone === 'rose'
                    ? 'text-rose-800'
                    : tone === 'amber'
                    ? 'text-amber-900'
                    : 'text-emerald-900'
                }`}
              >
                {projection.urgentUnder7dCount > 0
                  ? `${formatNumber(projection.urgentUnder7dCount)} SKU`
                  : projection.avgRunwayDays !== null
                  ? `${projection.avgRunwayDays.toFixed(1)} Hari`
                  : 'Aman'}
              </span>

              <span
                className={`text-xs font-bold ${
                  tone === 'rose'
                    ? 'text-rose-700'
                    : tone === 'amber'
                    ? 'text-amber-800'
                    : 'text-emerald-700'
                }`}
              >
                {projection.urgentUnder7dCount > 0
                  ? 'habis dalam ≤ 7 hari'
                  : 'rata-rata ketahanan stok'}
              </span>
            </div>

            <div className="text-[10.5px] text-slate-600 flex items-center gap-2 flex-wrap">
              <span>
                Laju keluar 7H:{' '}
                <strong className="font-mono text-slate-900 tabular-nums">
                  {projection.totalActiveAvgDailyUnits.toFixed(1)} unit/hr
                </strong>
              </span>
              {projection.shortestActive && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[230px]">
                    Tercepat habis:{' '}
                    <strong className="text-slate-900">{projection.shortestActive.name}</strong>{' '}
                    <span className="font-mono font-bold text-rose-700">
                      ({formatDaysBadge(projection.shortestActive.daysUntilStockout)})
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Compact Hairline Metrics Breakdown */}
          <div className="pt-2 border-t border-slate-200/80 grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <div className="text-slate-500 font-semibold">Kritis (0–3 Hr)</div>
              <div className="font-mono font-black text-rose-700 tabular-nums text-xs">
                {formatNumber(projection.outOfStockCount + projection.critical3dCount)} SKU
              </div>
            </div>
            <div className="border-l border-slate-200/80 pl-2">
              <div className="text-slate-500 font-semibold">Pesan (4–7 Hr)</div>
              <div className="font-mono font-black text-amber-700 tabular-nums text-xs">
                {formatNumber(projection.soon7dCount)} SKU
              </div>
            </div>
            <div className="border-l border-slate-200/80 pl-2">
              <div className="text-slate-500 font-semibold">Est. Modal Restock</div>
              <div className="font-mono font-black text-slate-900 tabular-nums text-xs truncate">
                {formatRupiah(projection.totalSuggestedBudget)}
              </div>
            </div>
          </div>
        </div>

        {/* Right: Top 4 Prioritas Pengadaan Table */}
        <div className="lg:col-span-7 lg:border-l lg:border-slate-200/80 lg:pl-4 flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-700">
              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Prioritas Restock Proaktif (Target Buffer {TARGET_BUFFER_DAYS} Hari)</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setListMode('URGENT');
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    listMode === 'URGENT'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Perlu Restock ({projection.urgentRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setListMode('ALL_ACTIVE');
                  }}
                  className={`px-2 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                    listMode === 'ALL_ACTIVE'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Tercepat Habis ({projection.movingCount})
                </button>
              </div>

              {onJumpToStockThreshold && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onJumpToStockThreshold();
                  }}
                  className="text-[10px] font-bold text-sky-700 hover:text-sky-900 inline-flex items-center gap-0.5 cursor-pointer"
                  title="Lihat grafik threshold stok produk lengkap"
                >
                  <span>Grafik Stok</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {displayedRows.length === 0 ? (
            <div className="flex-1 flex items-center gap-2.5 p-3 rounded-lg bg-white/70 border border-emerald-200/80 text-xs text-slate-600">
              <PackageCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {projection.movingCount === 0
                  ? 'Belum ada riwayat penjualan 7 hari terakhir untuk menghitung laju kebutuhan stok.'
                  : `Semua produk aktif memiliki ketahanan stok > ${TARGET_BUFFER_DAYS} hari berdasarkan tren penjualan 7 hari terakhir.`}
              </span>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/75 bg-white/80 rounded-lg border border-slate-200/80 overflow-hidden">
              {displayedRows.map((item) => {
                const isOutOrCritical = item.urgency === 'OUT' || item.urgency === 'CRITICAL';
                const isSoon = item.urgency === 'SOON';
                return (
                  <div
                    key={item.id}
                    className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] hover:bg-slate-50/80 transition-colors"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <AlertTriangle
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isOutOrCritical
                            ? 'text-rose-600'
                            : isSoon
                            ? 'text-amber-600'
                            : 'text-sky-600'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{item.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono tabular-nums truncate">
                          Sisa {formatNumber(item.stock)} {item.baseUnit} · Laju{' '}
                          {item.avgDailySales.toFixed(1)}/hr
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <div>
                        <div
                          className={`font-mono font-black tabular-nums ${
                            isOutOrCritical
                              ? 'text-rose-700'
                              : isSoon
                              ? 'text-amber-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {item.daysUntilStockout <= 0
                            ? 'Habis (0 hr)'
                            : `~${formatDaysBadge(item.daysUntilStockout)}`}
                        </div>
                        <div className="text-[9.5px] font-semibold text-slate-500">
                          {item.urgencyLabel}
                        </div>
                      </div>

                      <div className="border-l border-slate-200 pl-2.5 min-w-[82px]">
                        {item.suggestedReorderUnits > 0 ? (
                          <>
                            <div className="font-mono font-bold text-sky-800 tabular-nums inline-flex items-center gap-1 justify-end">
                              <ShoppingBag className="w-3 h-3 text-sky-600 shrink-0" />
                              <span>
                                +{formatNumber(item.suggestedReorderUnits)} {item.baseUnit}
                              </span>
                            </div>
                            <div className="text-[9.5px] font-mono text-slate-500 tabular-nums">
                              {item.estimatedOrderCost > 0
                                ? formatRupiah(item.estimatedOrderCost)
                                : 'Target 14 hr'}
                            </div>
                          </>
                        ) : (
                          <div className="text-[10px] font-bold text-emerald-700">Stok Cukup</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AnimatedChartStage>
  );
};
