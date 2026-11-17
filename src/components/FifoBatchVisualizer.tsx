import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  Search, 
  AlertTriangle, 
  Clock, 
  CalendarDays, 
  CheckCircle2, 
  ShieldAlert, 
  Filter, 
  TrendingDown, 
  DollarSign, 
  Boxes, 
  Sparkles,
  ArrowRight,
  Package,
  Calendar
} from 'lucide-react';
import { Product, ProductBatch } from '../types/pos';
import { formatRupiah, formatNumber, formatDateOnly } from '../utils/formatters';
import { sound } from '../utils/audio';

interface FifoBatchVisualizerProps {
  products: Product[];
  onOpenRestock?: () => void;
}

type ExpiryFilterType = 'ALL' | 'CRITICAL_7' | 'WARNING_30' | 'SAFE' | 'EXPIRED';

export const FifoBatchVisualizer: React.FC<FifoBatchVisualizerProps> = ({
  products,
  onOpenRestock
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilterType>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  // Flatten and process all active batches across products
  const processedProducts = useMemo(() => {
    return products
      .filter((p) => (p.productType || 'BARANG') === 'BARANG')
      .map((p) => {
        // Collect active batches or synthesize fallback if batches array is empty
        let activeBatches: Array<ProductBatch & { daysUntilExpiry: number | null; status: 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'SAFE' | 'NO_EXPIRY' }> = [];

        if (p.batches && p.batches.length > 0) {
          activeBatches = p.batches
            .filter((b) => b.remainingQuantity > 0)
            .map((b) => {
              let daysUntilExpiry: number | null = null;
              let status: 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'SAFE' | 'NO_EXPIRY' = 'NO_EXPIRY';

              if (b.expiryDate) {
                const expTime = new Date(b.expiryDate).getTime();
                daysUntilExpiry = Math.ceil((expTime - now) / oneDayMs);

                if (daysUntilExpiry < 0) {
                  status = 'EXPIRED';
                } else if (daysUntilExpiry <= 7) {
                  status = 'CRITICAL';
                } else if (daysUntilExpiry <= 30) {
                  status = 'WARNING';
                } else {
                  status = 'SAFE';
                }
              }

              return {
                ...b,
                daysUntilExpiry,
                status
              };
            });
        } else if (p.stockInBaseUnit > 0) {
          // Virtual single batch for legacy stock
          let daysUntilExpiry: number | null = null;
          let status: 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'SAFE' | 'NO_EXPIRY' = 'NO_EXPIRY';

          if (p.expiryDate) {
            const expTime = new Date(p.expiryDate).getTime();
            daysUntilExpiry = Math.ceil((expTime - now) / oneDayMs);
            if (daysUntilExpiry < 0) status = 'EXPIRED';
            else if (daysUntilExpiry <= 7) status = 'CRITICAL';
            else if (daysUntilExpiry <= 30) status = 'WARNING';
            else status = 'SAFE';
          }

          activeBatches = [{
            id: `batch_initial_${p.id}`,
            batchNumber: 'BATCH-AWAL',
            receivedAt: Date.now(),
            receivedDate: new Date().toISOString().split('T')[0],
            initialQuantity: p.stockInBaseUnit,
            remainingQuantity: p.stockInBaseUnit,
            costPrice: p.costPrice || 0,
            expiryDate: p.expiryDate,
            daysUntilExpiry,
            status
          }];
        }

        // Sort batches in strictly FIFO/FEFO order (expiry date first, then date received)
        activeBatches.sort((a, b) => {
          if (a.expiryDate && b.expiryDate) {
            return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
          }
          if (a.expiryDate) return -1;
          if (b.expiryDate) return 1;
          return new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime();
        });

        const totalBatchQty = activeBatches.reduce((acc, b) => acc + b.remainingQuantity, 0);
        const totalBatchAssetValue = activeBatches.reduce((acc, b) => acc + (b.remainingQuantity * (b.costPrice || p.costPrice || 0)), 0);

        const hasExpired = activeBatches.some((b) => b.status === 'EXPIRED');
        const hasCritical = activeBatches.some((b) => b.status === 'CRITICAL');
        const hasWarning = activeBatches.some((b) => b.status === 'WARNING');

        return {
          product: p,
          batches: activeBatches,
          totalBatchQty,
          totalBatchAssetValue,
          hasExpired,
          hasCritical,
          hasWarning,
        };
      });
  }, [products, now]);

  // Overall store batch statistics
  const stats = useMemo(() => {
    let totalBatches = 0;
    let expiredBatches = 0;
    let criticalBatches = 0;
    let warningBatches = 0;
    let safeBatches = 0;
    let totalInventoryValue = 0;

    processedProducts.forEach((p) => {
      totalBatches += p.batches.length;
      totalInventoryValue += p.totalBatchAssetValue;

      p.batches.forEach((b) => {
        if (b.status === 'EXPIRED') expiredBatches++;
        else if (b.status === 'CRITICAL') criticalBatches++;
        else if (b.status === 'WARNING') warningBatches++;
        else if (b.status === 'SAFE') safeBatches++;
      });
    });

    return {
      totalBatches,
      expiredBatches,
      criticalBatches,
      warningBatches,
      safeBatches,
      totalInventoryValue
    };
  }, [processedProducts]);

  // Filter products by search, category, and expiry status
  const filteredProducts = useMemo(() => {
    return processedProducts.filter((p) => {
      const matchSearch = 
        p.product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.product.sku && p.product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
        p.batches.some((b) => b.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory = selectedCategory === 'ALL' || p.product.category === selectedCategory;

      if (!matchSearch || !matchCategory) return false;

      switch (expiryFilter) {
        case 'EXPIRED':
          return p.batches.some((b) => b.status === 'EXPIRED');
        case 'CRITICAL_7':
          return p.batches.some((b) => b.status === 'CRITICAL' || b.status === 'EXPIRED');
        case 'WARNING_30':
          return p.batches.some((b) => b.status === 'WARNING' || b.status === 'CRITICAL' || b.status === 'EXPIRED');
        case 'SAFE':
          return p.batches.every((b) => b.status === 'SAFE' || b.status === 'NO_EXPIRY');
        case 'ALL':
        default:
          return true;
      }
    });
  }, [processedProducts, searchTerm, selectedCategory, expiryFilter]);

  // Unique categories
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  return (
    <div className="space-y-4">
      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total Batches */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-bold">Total Batch Aktif</span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-xl font-black text-slate-900 font-mono">
            {stats.totalBatches} <span className="text-xs font-semibold text-slate-500">Batch</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
            Valuasi: {formatRupiah(stats.totalInventoryValue)}
          </div>
        </div>

        {/* Expired Batches */}
        <div 
          onClick={() => {
            sound.playTap();
            setExpiryFilter(expiryFilter === 'EXPIRED' ? 'ALL' : 'EXPIRED');
          }}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            expiryFilter === 'EXPIRED' 
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/20' 
              : 'bg-white border-rose-200 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-rose-600 mb-1">
            <span className="text-[11px] font-bold">Sudah Kadaluarsa</span>
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-rose-700 font-mono">
            {stats.expiredBatches} <span className="text-xs font-semibold">Batch</span>
          </div>
          <div className="text-[10px] text-rose-600 mt-0.5 font-medium">
            Wajib retur / sortir fisik
          </div>
        </div>

        {/* Critical < 7 Days */}
        <div 
          onClick={() => {
            sound.playTap();
            setExpiryFilter(expiryFilter === 'CRITICAL_7' ? 'ALL' : 'CRITICAL_7');
          }}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            expiryFilter === 'CRITICAL_7' 
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/20' 
              : 'bg-white border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 mb-1">
            <span className="text-[11px] font-bold">Kritis (&le; 7 Hari)</span>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-amber-800 font-mono">
            {stats.criticalBatches} <span className="text-xs font-semibold">Batch</span>
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5 font-medium">
            Prioritaskan diskon / promo
          </div>
        </div>

        {/* Warning < 30 Days */}
        <div 
          onClick={() => {
            sound.playTap();
            setExpiryFilter(expiryFilter === 'WARNING_30' ? 'ALL' : 'WARNING_30');
          }}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            expiryFilter === 'WARNING_30' 
              ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-400/20' 
              : 'bg-white border-yellow-200 hover:border-yellow-300'
          }`}
        >
          <div className="flex items-center justify-between text-yellow-700 mb-1">
            <span className="text-[11px] font-bold">Mendekati (&le; 30 Hari)</span>
            <Clock className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-yellow-800 font-mono">
            {stats.warningBatches} <span className="text-xs font-semibold">Batch</span>
          </div>
          <div className="text-[10px] text-yellow-700 mt-0.5 font-medium">
            Pantau perputaran FIFO
          </div>
        </div>

        {/* Safe Batches */}
        <div 
          onClick={() => {
            sound.playTap();
            setExpiryFilter(expiryFilter === 'SAFE' ? 'ALL' : 'SAFE');
          }}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            expiryFilter === 'SAFE' 
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/20' 
              : 'bg-white border-emerald-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 mb-1">
            <span className="text-[11px] font-bold">Aman (&gt; 30 Hari)</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-xl font-black text-emerald-800 font-mono">
            {stats.safeBatches} <span className="text-xs font-semibold">Batch</span>
          </div>
          <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">
            Kondisi stok terjaga
          </div>
        </div>
      </div>

      {/* Control Bar: Search & Filters */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari produk, SKU, atau nomor batch..."
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-indigo-500 focus:bg-white"
          />
        </div>

        {/* Category & Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Dropdown */}
          <select
            value={selectedCategory}
            onChange={(e) => {
              sound.playTap();
              setSelectedCategory(e.target.value);
            }}
            className="py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer"
          >
            <option value="ALL">Semua Kategori</option>
            {categoriesList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Quick Filter Status Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
            <button
              onClick={() => { sound.playTap(); setExpiryFilter('ALL'); }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                expiryFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => { sound.playTap(); setExpiryFilter('CRITICAL_7'); }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                expiryFilter === 'CRITICAL_7' ? 'bg-amber-500 text-white shadow-2xs' : 'text-amber-700 hover:bg-amber-100/50'
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              <span>&le; 7 Hari</span>
            </button>
            <button
              onClick={() => { sound.playTap(); setExpiryFilter('WARNING_30'); }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                expiryFilter === 'WARNING_30' ? 'bg-yellow-500 text-white shadow-2xs' : 'text-yellow-700 hover:bg-yellow-100/50'
              }`}
            >
              <Clock className="w-3 h-3" />
              <span>&le; 30 Hari</span>
            </button>
            <button
              onClick={() => { sound.playTap(); setExpiryFilter('EXPIRED'); }}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                expiryFilter === 'EXPIRED' ? 'bg-rose-600 text-white shadow-2xs' : 'text-rose-700 hover:bg-rose-100/50'
              }`}
            >
              <ShieldAlert className="w-3 h-3" />
              <span>Kadaluarsa</span>
            </button>
          </div>
        </div>
      </div>

      {/* Product List with FIFO Batch Visual Cards */}
      <div className="space-y-3">
        {products.length === 0 ? (
          <div className="p-10 md:p-14 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs">
            <Boxes className="w-14 h-14 text-slate-300 mx-auto mb-3" />
            <h4 className="font-black text-slate-800 text-base">Database Monitoring Sisa Stok Batch Kosong</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Tidak ada data barang atau batch persediaan aktif di dalam sistem. Seluruh database telah bersih (0).
            </p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-slate-200">
            <Boxes className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h4 className="font-bold text-slate-700 text-sm">Tidak Ada Batch yang Sesuai</h4>
            <p className="text-xs text-slate-400 mt-1">Coba sesuaikan kata kunci pencarian atau ubah filter masa kadaluarsa.</p>
          </div>
        ) : (
          filteredProducts.map(({ product, batches, totalBatchQty, totalBatchAssetValue }) => (
            <div key={product.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-sm transition-all">
              {/* Product Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden border border-slate-200">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 text-sm">{product.name}</h4>
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {product.sku || product.barcode || '-'}
                      </span>
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {product.category || 'Umum'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Satuan Dasar: <span className="font-bold text-slate-700">{product.baseUnit || 'PCS'}</span> · Total Stok: <span className="font-bold text-slate-900 font-mono">{formatNumber(totalBatchQty)} {product.baseUnit || 'PCS'}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right flex items-center sm:flex-col justify-between sm:justify-center">
                  <span className="text-[10px] text-slate-400">Total Nilai Aset FIFO</span>
                  <span className="text-sm font-black font-mono text-emerald-700">
                    {formatRupiah(totalBatchAssetValue)}
                  </span>
                </div>
              </div>

              {/* FIFO Batch Stack Progress Bar */}
              <div className="my-3">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 mb-1">
                  <span className="flex items-center gap-1">
                    <span>Komposisi Batch (Urutan Keluar FIFO)</span>
                    <span className="text-indigo-600 font-normal">→ batch sebelah kiri keluar terlebih dahulu saat transaksi kasir</span>
                  </span>
                  <span>{batches.length} Batch Aktif</span>
                </div>

                {/* Progress bar stack */}
                <div className="h-4 w-full bg-slate-100 rounded-lg overflow-hidden flex p-0.5 gap-0.5">
                  {batches.map((b, idx) => {
                    const pct = totalBatchQty > 0 ? (b.remainingQuantity / totalBatchQty) * 100 : 0;
                    let bgColor = 'bg-emerald-500';
                    if (b.status === 'EXPIRED') bgColor = 'bg-rose-500';
                    else if (b.status === 'CRITICAL') bgColor = 'bg-amber-500';
                    else if (b.status === 'WARNING') bgColor = 'bg-yellow-400';

                    return (
                      <div
                        key={b.id || idx}
                        style={{ width: `${Math.max(4, pct)}%` }}
                        className={`${bgColor} h-full rounded-sm transition-all relative group cursor-pointer`}
                        title={`Batch ${b.batchNumber}: ${b.remainingQuantity} ${product.baseUnit || 'PCS'} (${pct.toFixed(1)}%) - HPP: ${formatRupiah(b.costPrice || product.costPrice || 0)}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Batches Table / Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {batches.map((b, idx) => {
                  const isFirstOut = idx === 0;
                  const batchCost = b.costPrice !== undefined ? b.costPrice : (product.costPrice || 0);

                  return (
                    <div
                      key={b.id || idx}
                      className={`p-2.5 rounded-xl border text-xs flex flex-col justify-between transition-all ${
                        isFirstOut 
                          ? 'border-indigo-300 bg-indigo-50/40 ring-1 ring-indigo-300/30' 
                          : 'border-slate-200 bg-slate-50/50'
                      }`}
                    >
                      <div>
                        {/* Header batch: priority badge & batch number */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            isFirstOut 
                              ? 'bg-indigo-600 text-white' 
                              : 'bg-slate-200 text-slate-700'
                          }`}>
                            {isFirstOut ? '★ FIFO #1 Keluar Pertama' : `FIFO #${idx + 1}`}
                          </span>

                          <span className="font-mono text-[11px] font-bold text-slate-700">
                            {b.batchNumber}
                          </span>
                        </div>

                        {/* Sisa Stok & HPP */}
                        <div className="flex items-center justify-between text-slate-800 my-1">
                          <span className="text-[11px] text-slate-500">Sisa Stok:</span>
                          <span className="font-black font-mono text-slate-900">
                            {formatNumber(b.remainingQuantity)} {product.baseUnit || 'PCS'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-slate-800 my-1">
                          <span className="text-[11px] text-slate-500">HPP / Beli:</span>
                          <span className="font-mono font-bold text-indigo-700">
                            {formatRupiah(batchCost)}
                          </span>
                        </div>
                      </div>

                      {/* Expiration status info */}
                      <div className="pt-2 mt-1 border-t border-slate-200/60 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] text-slate-500">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{b.expiryDate ? formatDateOnly(b.expiryDate) : 'Tanpa Exp'}</span>
                        </div>

                        {b.status === 'EXPIRED' ? (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px]">
                            <ShieldAlert className="w-2.5 h-2.5" />
                            <span>Kedaluwarsa</span>
                          </span>
                        ) : b.status === 'CRITICAL' ? (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>{b.daysUntilExpiry} Hari Lagi</span>
                          </span>
                        ) : b.status === 'WARNING' ? (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-yellow-100 text-yellow-800 font-bold text-[10px]">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{b.daysUntilExpiry} Hari Lagi</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Aman ({b.daysUntilExpiry ? `${b.daysUntilExpiry}h` : 'OK'})</span>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
