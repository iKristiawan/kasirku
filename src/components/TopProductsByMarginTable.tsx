import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Package,
  EyeOff,
  RotateCcw,
  Coins,
  Wrench,
} from 'lucide-react';
import { Transaction, Product, ProductCategory } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { sound } from '../utils/audio';

interface TopProductsByMarginTableProps {
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

type MarginRankMode = 'PROFIT_RP' | 'MARGIN_PERCENT';

interface TopMarginProductRow {
  productId: string;
  name: string;
  sku: string;
  category: string;
  baseUnit: string;
  isService: boolean;
  unitsSold: number;
  dailyVelocity: number;
  txCount: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  profitSharePercent: number;
  currentStock: number;
  minStockAlert: number;
  daysOfCover: number | null;
  procurementStatus: 'URGENT_RESTOCK' | 'WATCH_RESTOCK' | 'STOCK_SAFE' | 'NON_STOCK';
}

export const TopProductsByMarginTable: React.FC<TopProductsByMarginTableProps> = ({
  transactions,
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
  const [rankMode, setRankMode] = useState<MarginRankMode>('PROFIT_RP');

  const analysis = useMemo(() => {
    const periodDays = Math.max(1, Math.round((currentEnd - currentStart + 1) / 86400000));

    interface AggEntry {
      productId: string;
      name: string;
      sku: string;
      category: string;
      baseUnit: string;
      isService: boolean;
      unitsSold: number;
      revenue: number;
      cogs: number;
      txIds: Set<string>;
      currentStock: number;
      minStockAlert: number;
    }

    const aggMap = new Map<string, AggEntry>();
    let totalPeriodRevenue = 0;
    let totalPeriodCogs = 0;

    transactions.forEach((tx) => {
      if (tx.timestamp < currentStart || tx.timestamp > currentEnd) return;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        if (hiddenCategorySet.has(catName)) return;

        const units = (item.quantity || 0) * (item.conversionFactor || 1);
        const rev = item.totalAmount || 0;
        const cogs = getItemFifoCogs(item, prod);

        totalPeriodRevenue += rev;
        totalPeriodCogs += cogs;

        const key = item.productId || item.productName;
        const existing = aggMap.get(key);
        if (existing) {
          existing.unitsSold += units;
          existing.revenue += rev;
          existing.cogs += cogs;
          existing.txIds.add(tx.id);
        } else {
          aggMap.set(key, {
            productId: item.productId,
            name: prod?.name || item.productName || 'Produk',
            sku: (prod?.sku || prod?.barcode || '').trim(),
            category: catName,
            baseUnit: prod?.baseUnit || item.unitName || 'PCS',
            isService: prod?.productType === 'JASA',
            unitsSold: units,
            revenue: rev,
            cogs,
            txIds: new Set([tx.id]),
            currentStock: prod?.stockInBaseUnit ?? 0,
            minStockAlert: prod?.minStockAlert ?? 0,
          });
        }
      });
    });

    const totalPeriodProfit = totalPeriodRevenue - totalPeriodCogs;
    const positiveTotalProfit = Math.max(0, totalPeriodProfit);

    const rows: TopMarginProductRow[] = Array.from(aggMap.values())
      .map((entry) => {
        const grossProfit = entry.revenue - entry.cogs;
        const marginPercent = entry.revenue > 0 ? (grossProfit / entry.revenue) * 100 : 0;
        const profitSharePercent =
          positiveTotalProfit > 0 && grossProfit > 0
            ? (grossProfit / positiveTotalProfit) * 100
            : 0;
        const dailyVelocity = entry.unitsSold / periodDays;
        const daysOfCover =
          !entry.isService && dailyVelocity > 0
            ? Math.floor(Math.max(0, entry.currentStock) / dailyVelocity)
            : null;

        let procurementStatus: TopMarginProductRow['procurementStatus'] = 'STOCK_SAFE';
        if (entry.isService) {
          procurementStatus = 'NON_STOCK';
        } else if (
          entry.currentStock <= entry.minStockAlert ||
          (daysOfCover !== null && daysOfCover <= 3)
        ) {
          procurementStatus = 'URGENT_RESTOCK';
        } else if (
          entry.currentStock <= entry.minStockAlert * 1.5 ||
          (daysOfCover !== null && daysOfCover <= 7)
        ) {
          procurementStatus = 'WATCH_RESTOCK';
        }

        return {
          productId: entry.productId,
          name: entry.name,
          sku: entry.sku,
          category: entry.category,
          baseUnit: entry.baseUnit,
          isService: entry.isService,
          unitsSold: entry.unitsSold,
          dailyVelocity,
          txCount: entry.txIds.size,
          revenue: entry.revenue,
          cogs: entry.cogs,
          grossProfit,
          marginPercent,
          profitSharePercent,
          currentStock: entry.currentStock,
          minStockAlert: entry.minStockAlert,
          daysOfCover,
          procurementStatus,
        };
      })
      .filter((r) => r.revenue > 0);

    rows.sort((a, b) => {
      if (rankMode === 'MARGIN_PERCENT') {
        if (b.marginPercent !== a.marginPercent) return b.marginPercent - a.marginPercent;
        return b.grossProfit - a.grossProfit;
      }
      if (b.grossProfit !== a.grossProfit) return b.grossProfit - a.grossProfit;
      return b.marginPercent - a.marginPercent;
    });

    const top5 = rows.slice(0, 5);
    const top5ProfitSum = top5.reduce((sum, r) => sum + r.grossProfit, 0);
    const top5ShareOfStoreProfit =
      positiveTotalProfit > 0 ? (Math.max(0, top5ProfitSum) / positiveTotalProfit) * 100 : 0;
    const urgentCount = top5.filter((r) => r.procurementStatus === 'URGENT_RESTOCK').length;

    return {
      top5,
      totalUniqueProducts: rows.length,
      totalPeriodProfit,
      top5ProfitSum,
      top5ShareOfStoreProfit,
      urgentCount,
      periodDays,
    };
  }, [transactions, productMap, currentStart, currentEnd, hiddenCategorySet, rankMode]);

  return (
    <section className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Header Bar */}
      <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Coins className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Top 5 Produk Berdasarkan Margin</span>
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <span aria-hidden="true">·</span>
              <span>{periodLabel}</span>
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
              {analysis.top5.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                    {analysis.top5ShareOfStoreProfit.toFixed(1)}% kontribusi laba
                  </span>
                </>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Peringkat produk dengan kontribusi profit dan efisiensi margin tertinggi beserta kondisi stok saat ini untuk prioritas pengadaan barang.
          </p>
        </div>

        {/* Ranking Mode Segmented Control */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs shrink-0 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setRankMode('PROFIT_RP');
            }}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              rankMode === 'PROFIT_RP'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Kontribusi Laba (Rp)
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setRankMode('MARGIN_PERCENT');
            }}
            className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              rankMode === 'MARGIN_PERCENT'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Margin Tertinggi (%)
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        {activeCategoryCount === 0 && totalCategoriesCount > 0 ? (
          <div className="py-12 px-6 flex flex-col items-center justify-center text-slate-400 space-y-2.5">
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
        ) : analysis.top5.length === 0 ? (
          <div className="py-12 px-6 flex flex-col items-center justify-center text-slate-400 space-y-2">
            <Package className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Belum ada penjualan produk pada {periodLabel}
            </p>
            <p className="text-[11px] text-slate-400">
              Data kontribusi margin produk akan muncul otomatis setelah ada transaksi.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Produk &amp; Penjualan</th>
                <th className="py-3 px-4 text-right">Omzet &amp; HPP</th>
                <th className="py-3 px-4 text-right">Kontribusi Laba</th>
                <th className="py-3 px-4 text-right">Margin (%)</th>
                <th className="py-3 px-4 text-right">Sisa Stok</th>
                <th className="py-3 px-4">Rekomendasi Pengadaan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysis.top5.map((row, idx) => {
                const rank = idx + 1;
                const isLowOrNegativeMargin = row.marginPercent < 15;

                return (
                  <tr key={row.productId || `${row.name}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    {/* Rank */}
                    <td className="py-3.5 px-4 text-center font-mono font-black text-slate-700 tabular-nums">
                      {rank}
                    </td>

                    {/* Product & Sales Context (Clean unboxed metadata with middle dot) */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-xs md:text-sm truncate max-w-[260px]">
                        {row.name}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{row.category}</span>
                        {row.sku && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{row.sku}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          Terjual {formatNumber(row.unitsSold)} {row.baseUnit} ({row.txCount} trx)
                        </span>
                      </div>
                    </td>

                    {/* Revenue & FIFO COGS */}
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-bold text-slate-800">{formatRupiah(row.revenue)}</div>
                      <div className="text-[10.5px] text-slate-400">
                        HPP {formatRupiah(row.cogs)}
                      </div>
                    </td>

                    {/* Profit Contribution */}
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div
                        className={`font-black ${
                          row.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatRupiah(row.grossProfit)}
                      </div>
                      <div className="text-[10.5px] text-slate-500">
                        {row.profitSharePercent.toFixed(1)}% laba toko
                      </div>
                    </td>

                    {/* Gross Margin % */}
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div
                        className={`font-black ${
                          row.marginPercent >= 25
                            ? 'text-emerald-700'
                            : row.marginPercent >= 15
                            ? 'text-sky-700'
                            : row.marginPercent >= 0
                            ? 'text-amber-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {row.marginPercent.toFixed(1)}%
                      </div>
                      <div className="text-[10px] font-sans text-slate-400">
                        {row.marginPercent >= 25
                          ? 'Sangat Tinggi'
                          : isLowOrNegativeMargin
                          ? row.marginPercent < 0
                            ? 'Negatif'
                            : 'Margin Tipis'
                          : 'Sehat'}
                      </div>
                    </td>

                    {/* Current Stock & Velocity */}
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      {row.isService ? (
                        <span className="text-xs font-sans font-semibold text-slate-500">
                          Non-Stok
                        </span>
                      ) : (
                        <>
                          <div
                            className={`font-bold ${
                              row.procurementStatus === 'URGENT_RESTOCK'
                                ? 'text-rose-700'
                                : row.procurementStatus === 'WATCH_RESTOCK'
                                ? 'text-amber-700'
                                : 'text-slate-800'
                            }`}
                          >
                            {formatNumber(row.currentStock)} {row.baseUnit}
                          </div>
                          <div className="text-[10.5px] text-slate-400">
                            Min {formatNumber(row.minStockAlert)} ·{' '}
                            {row.daysOfCover !== null ? `~${row.daysOfCover} hr` : 'Laju rendah'}
                          </div>
                        </>
                      )}
                    </td>

                    {/* Procurement Decision Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {row.procurementStatus === 'URGENT_RESTOCK' ? (
                        <div className="inline-flex items-center gap-1.5 text-rose-700 font-bold text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Prioritas Restock</span>
                        </div>
                      ) : row.procurementStatus === 'WATCH_RESTOCK' ? (
                        <div className="inline-flex items-center gap-1.5 text-amber-700 font-bold text-xs">
                          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                          <span>Siapkan Order</span>
                        </div>
                      ) : row.procurementStatus === 'NON_STOCK' ? (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 font-semibold text-xs">
                          <Wrench className="w-3.5 h-3.5 shrink-0" />
                          <span>Layanan / Jasa</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Stok Aman</span>
                        </div>
                      )}
                      {!row.isService && row.dailyVelocity > 0 && (
                        <div className="text-[10.5px] text-slate-400 font-mono tabular-nums mt-0.5">
                          Laju {row.dailyVelocity.toFixed(1)} {row.baseUnit}/hari
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer Summary */}
      {analysis.top5.length > 0 && (
        <div className="px-4 md:px-6 py-3 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-2 flex-wrap">
            <span>
              Total Laba Top 5:{' '}
              <strong className="font-mono text-emerald-700 tabular-nums">
                {formatRupiah(analysis.top5ProfitSum)}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              dari total{' '}
              <strong className="font-mono text-slate-700 tabular-nums">
                {analysis.totalUniqueProducts}
              </strong>{' '}
              produk terjual
            </span>
          </div>

          <div className="text-[11px]">
            {analysis.urgentCount > 0 ? (
              <span className="font-semibold text-rose-700">
                {analysis.urgentCount} produk margin tinggi perlu prioritas pengadaan stok segera
              </span>
            ) : (
              <span className="text-slate-500">
                Stok produk penyumbang laba utama dalam kondisi terjaga
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
