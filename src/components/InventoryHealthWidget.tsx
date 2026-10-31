import React, { useState, useMemo } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  Sparkles, 
  Tag, 
  Eye, 
  ChevronDown, 
  ChevronUp, 
  CheckCircle2, 
  Info, 
  Flame, 
  Percent, 
  Clock, 
  ArrowRight,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { Product, Transaction } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';

interface InventoryHealthWidgetProps {
  products: Product[];
  transactions: Transaction[];
  onHighlightProduct?: (productId: string) => void;
  onOpenThresholdSettings?: () => void;
}

export interface InventoryItemHealth {
  product: Product;
  totalSold30d: number;
  dailyVelocity: number;
  daysOfInventory: number; // Runout days
  capitalTiedUp: number; // stock * costPrice
  status: 'DEAD_STOCK' | 'OVERSTOCK' | 'HEALTHY' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  recommendation: string;
}

export const InventoryHealthWidget: React.FC<InventoryHealthWidgetProps> = ({
  products,
  transactions,
  onHighlightProduct,
  onOpenThresholdSettings,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'DEAD_STOCK' | 'LOW_STOCK' | 'HEALTHY'>('DEAD_STOCK');

  // Compute 30-day product velocity and inventory health metrics
  const { 
    analyzedItems, 
    healthScore, 
    healthLabel, 
    healthColor, 
    deadStockItems, 
    totalDeadStockCapital,
    healthyItems,
    lowStockItems,
    overstockItems
  } = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    
    // 1. Aggregate sold quantities per product in past 30 days
    const salesMap = new Map<string, number>();
    transactions.forEach((tx) => {
      if (tx.timestamp >= thirtyDaysAgo) {
        tx.items.forEach((item) => {
          const current = salesMap.get(item.productId) || 0;
          const baseUnits = item.quantity * (item.conversionFactor || 1);
          salesMap.set(item.productId, current + baseUnits);
        });
      }
    });

    // 2. Classify each product
    const items: InventoryItemHealth[] = products.map((prod) => {
      const totalSold30d = salesMap.get(prod.id) || 0;
      const dailyVelocity = Math.round((totalSold30d / 30) * 100) / 100;
      const stock = prod.stockInBaseUnit;
      const capitalTiedUp = stock * prod.costPrice;

      let daysOfInventory = 999;
      if (dailyVelocity > 0) {
        daysOfInventory = Math.round((stock / dailyVelocity) * 10) / 10;
      }

      let status: InventoryItemHealth['status'];
      let recommendation = '';

      if (stock <= 0) {
        status = 'OUT_OF_STOCK';
        recommendation = 'Stok habis total. Segera pesan kembali ke supplier.';
      } else if (totalSold30d === 0 && stock > 0) {
        status = 'DEAD_STOCK';
        recommendation = 'Tidak ada penjualan 30 hari! Buat promo diskon kasir atau bundling.';
      } else if (dailyVelocity > 0 && daysOfInventory > 75 && stock > prod.minStockAlert * 3) {
        status = 'DEAD_STOCK';
        recommendation = 'Perputaran sangat lambat (>75 hari). Promosikan di etalase kasir.';
      } else if (stock <= prod.minStockAlert) {
        status = 'LOW_STOCK';
        recommendation = 'Stok mendekati atau di bawah batas minimum.';
      } else if (daysOfInventory > 45) {
        status = 'OVERSTOCK';
        recommendation = 'Kelebihan persediaan. Kurangi pemesanan berikutnya.';
      } else {
        status = 'HEALTHY';
        recommendation = 'Rasio perputaran stok optimal dan sehat.';
      }

      return {
        product: prod,
        totalSold30d,
        dailyVelocity,
        daysOfInventory,
        capitalTiedUp,
        status,
        recommendation,
      };
    });

    const dead = items.filter((i) => i.status === 'DEAD_STOCK');
    const healthy = items.filter((i) => i.status === 'HEALTHY');
    const low = items.filter((i) => i.status === 'LOW_STOCK' || i.status === 'OUT_OF_STOCK');
    const over = items.filter((i) => i.status === 'OVERSTOCK');

    const totalDeadCap = dead.reduce((sum, i) => sum + i.capitalTiedUp, 0);

    // Calculate Inventory Health Score (0 - 100)
    // Healthy items add points; Dead Stock & Stockouts deduct points
    const totalCount = Math.max(1, products.length);
    const scoreVal = Math.max(
      15,
      Math.min(
        100,
        Math.round(
          ((healthy.length * 1.0 + over.length * 0.7 + (products.length - dead.length - low.length) * 0.3) / totalCount) * 100 -
          (dead.length / totalCount) * 25
        )
      )
    );

    let label = 'Sangat Sehat';
    let color = 'text-emerald-700 bg-emerald-50 border-emerald-300';
    if (scoreVal < 50) {
      label = 'Kritis (Banyak Dead Stock)';
      color = 'text-rose-700 bg-rose-50 border-rose-300';
    } else if (scoreVal < 75) {
      label = 'Perlu Perhatian';
      color = 'text-amber-700 bg-amber-50 border-amber-300';
    }

    return {
      analyzedItems: items,
      healthScore: scoreVal,
      healthLabel: label,
      healthColor: color,
      deadStockItems: dead,
      totalDeadStockCapital: totalDeadCap,
      healthyItems: healthy,
      lowStockItems: low,
      overstockItems: over,
    };
  }, [products, transactions]);

  // Filtered view based on user selection in widget
  const displayedItems = useMemo(() => {
    if (selectedFilter === 'DEAD_STOCK') return deadStockItems;
    if (selectedFilter === 'LOW_STOCK') return lowStockItems;
    if (selectedFilter === 'HEALTHY') return healthyItems;
    return analyzedItems;
  }, [analyzedItems, selectedFilter, deadStockItems, lowStockItems, healthyItems]);

  return (
    <div className="mx-3 md:mx-4 mt-3 bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden transition-all">
      {/* Top Banner / Summary Bar */}
      <div className="p-3 md:p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-gradient-to-r from-slate-50 via-white to-sky-50/40 border-b border-slate-100">
        <div className="flex items-center gap-3">
          {/* Circular / Radial Health Score Gauge */}
          <div className="relative flex items-center justify-center shrink-0">
            <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center border font-mono font-black shadow-xs ${
              healthScore >= 75 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300' 
                : healthScore >= 50 
                ? 'bg-amber-50 text-amber-700 border-amber-300' 
                : 'bg-rose-50 text-rose-700 border-rose-300'
            }`}>
              <span className="text-base leading-none">{healthScore}</span>
              <span className="text-[9px] uppercase tracking-wider font-sans font-bold opacity-75">Skor</span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs md:text-sm font-black text-slate-900 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-sky-600" />
                <span>Inventory Health Score</span>
              </h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${healthColor}`}>
                {healthLabel}
              </span>
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5">
              Analisis rasio perputaran stok vs penjualan harian: <strong className="text-slate-800">{healthyItems.length} Sehat</strong>,{' '}
              <strong className={deadStockItems.length > 0 ? 'text-rose-600' : 'text-slate-700'}>
                {deadStockItems.length} Dead Stock
              </strong>{' '}
              {totalDeadStockCapital > 0 && `(Modal tertahan ${formatRupiah(totalDeadStockCapital)})`}.
            </p>
          </div>
        </div>

        {/* Quick Summary Badges & Expand Button */}
        <div className="flex items-center gap-2 flex-wrap self-end lg:self-center shrink-0">
          {deadStockItems.length > 0 && (
            <div className="px-2.5 py-1 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-1.5 animate-subtle-pulse">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>{deadStockItems.length} Barang Perlu Promo</span>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsExpanded(!isExpanded);
            }}
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <span>{isExpanded ? 'Tutup Analisis' : 'Lihat Produk Dead Stock'}</span>
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Detail Panel */}
      {isExpanded && (
        <div className="p-3 md:p-4 space-y-4 bg-slate-50/60 animate-in fade-in duration-150">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div 
              onClick={() => { sound.playTap(); setSelectedFilter('HEALTHY'); }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedFilter === 'HEALTHY' 
                  ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-400/40 shadow-xs' 
                  : 'bg-white border-slate-200 hover:border-emerald-200'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Stok Sehat (Optimal)</span>
              </div>
              <div className="text-lg font-black font-mono text-emerald-700 mt-0.5">
                {healthyItems.length} <span className="text-xs font-normal text-slate-500">SKU</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Perputaran seimbang 10-45 hari</div>
            </div>

            <div 
              onClick={() => { sound.playTap(); setSelectedFilter('DEAD_STOCK'); }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedFilter === 'DEAD_STOCK' 
                  ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-400/40 shadow-xs' 
                  : 'bg-white border-slate-200 hover:border-rose-200'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-rose-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 text-rose-600" />
                <span>Dead Stock (Stagnan)</span>
              </div>
              <div className="text-lg font-black font-mono text-rose-700 mt-0.5">
                {deadStockItems.length} <span className="text-xs font-normal text-slate-500">SKU</span>
              </div>
              <div className="text-[10px] text-rose-600 font-medium mt-0.5 font-mono">
                Modal: {formatRupiah(totalDeadStockCapital)}
              </div>
            </div>

            <div 
              onClick={() => { sound.playTap(); setSelectedFilter('LOW_STOCK'); }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedFilter === 'LOW_STOCK' 
                  ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/40 shadow-xs' 
                  : 'bg-white border-slate-200 hover:border-amber-200'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-amber-600 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-600" />
                <span>Menipis / Bawah Batas</span>
              </div>
              <div className="text-lg font-black font-mono text-amber-700 mt-0.5">
                {lowStockItems.length} <span className="text-xs font-normal text-slate-500">SKU</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Sisa stok &lt; batas minimum</div>
            </div>

            <div 
              onClick={() => { sound.playTap(); setSelectedFilter('ALL'); }}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedFilter === 'ALL' 
                  ? 'bg-sky-50 border-sky-300 ring-2 ring-sky-400/40 shadow-xs' 
                  : 'bg-white border-slate-200 hover:border-sky-200'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                <Package className="w-3 h-3 text-sky-600" />
                <span>Total Katalog SKU</span>
              </div>
              <div className="text-lg font-black font-mono text-slate-900 mt-0.5">
                {products.length} <span className="text-xs font-normal text-slate-500">Barang</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Seluruh inventaris toko</div>
            </div>
          </div>

          {/* Table / List of Products based on Filter */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>
                  {selectedFilter === 'DEAD_STOCK'
                    ? `Daftar Produk Dead Stock (Stagnan & Mengendap) - Prioritas Promosi Kasir`
                    : selectedFilter === 'LOW_STOCK'
                    ? `Daftar Produk Menipis / Perlu Restock`
                    : selectedFilter === 'HEALTHY'
                    ? `Daftar Produk Sehat & Perputaran Stabil`
                    : `Seluruh Analisis Kesehatan Inventaris Produk`}
                </span>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {displayedItems.length} item ditemukan
              </span>
            </div>

            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200 tracking-wider sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">Produk & Barcode</th>
                    <th className="py-2.5 px-3">Sisa Stok</th>
                    <th className="py-2.5 px-3">Laju Jual 30d</th>
                    <th className="py-2.5 px-3">Rasio Hari (DOI)</th>
                    <th className="py-2.5 px-3">Modal Tertahan</th>
                    <th className="py-2.5 px-3">Diagnosa & Rekomendasi Aksi</th>
                    <th className="py-2.5 px-3 text-right">Aksi Kasir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-400">
                        Tidak ada barang pada kategori ini.
                      </td>
                    </tr>
                  ) : (
                    displayedItems.map(({ product, totalSold30d, dailyVelocity, daysOfInventory, capitalTiedUp, status, recommendation }) => {
                      const isDead = status === 'DEAD_STOCK';
                      return (
                        <tr 
                          key={product.id} 
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isDead ? 'bg-rose-50/30' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{product.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              SKU: {product.barcode} · {product.category}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 font-mono font-bold">
                            <span className={product.stockInBaseUnit <= product.minStockAlert ? 'text-amber-700' : 'text-slate-800'}>
                              {formatNumber(product.stockInBaseUnit)} {product.baseUnit}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 font-mono">
                            <span className={totalSold30d === 0 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                              {totalSold30d} unit ({dailyVelocity}/hari)
                            </span>
                          </td>

                          <td className="py-2.5 px-3 font-mono">
                            {dailyVelocity > 0 ? (
                              <span className={daysOfInventory > 60 ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                                ~{daysOfInventory} hari
                              </span>
                            ) : (
                              <span className="text-rose-600 font-bold text-[11px] bg-rose-100 px-1.5 py-0.5 rounded">
                                ∞ (0 Terjual)
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                            {formatRupiah(capitalTiedUp)}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="text-[11px] leading-tight text-slate-700">
                              {recommendation}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {onHighlightProduct && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    onHighlightProduct(product.id);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] flex items-center gap-1 shadow-2xs whitespace-nowrap"
                                  title="Sorot produk di etalase POS untuk transaksi"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>Sorot di Kasir</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Tip for Store Manager */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-600">
              <div className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>
                  <strong>Tips Dead Stock:</strong> Berikan promo beli 1 gratis 1 atau diskon kasir 10-20% untuk membebaskan modal kerja sebesar <strong>{formatRupiah(totalDeadStockCapital)}</strong>.
                </span>
              </div>

              {onOpenThresholdSettings && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onOpenThresholdSettings();
                  }}
                  className="text-xs font-bold text-sky-600 hover:underline shrink-0"
                >
                  Sesuaikan Ambang Batas Stok &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
