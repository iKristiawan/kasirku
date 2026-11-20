import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Download,
  Percent,
  Search,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { Product, UserRole } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  ProductTurnoverMetric,
  StockTurnoverAnalysisResult,
  TurnoverSpeedCategory,
} from '../utils/stockTurnRate';

interface StockTurnRateModuleProps {
  analysis: StockTurnoverAnalysisResult;
  lookbackDays: 30 | 60 | 90;
  onChangeLookbackDays: (days: 30 | 60 | 90) => void;
  currentUserRole: UserRole;
  initialSpeedFilter?: 'ALL' | TurnoverSpeedCategory;
  onUpdateProduct?: (updatedProduct: Product) => void;
  onNavigateToSuppliers?: () => void;
}

export const StockTurnRateModule: React.FC<StockTurnRateModuleProps> = ({
  analysis,
  lookbackDays,
  onChangeLookbackDays,
  currentUserRole,
  initialSpeedFilter = 'ALL',
  onUpdateProduct,
  onNavigateToSuppliers,
}) => {
  const canEditPricing = currentUserRole === 'ADMIN' || currentUserRole === 'STORE_MANAGER';

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('SEMUA');
  const [speedFilter, setSpeedFilter] = useState<'ALL' | TurnoverSpeedCategory>(initialSpeedFilter);
  const [sortBy, setSortBy] = useState<'CAPITAL_DESC' | 'DAYS_DESC' | 'TURN_ASC' | 'TURN_DESC'>('CAPITAL_DESC');

  // Interactive Liquidation Discount Modal
  const [liquidationTarget, setLiquidationTarget] = useState<ProductTurnoverMetric | null>(null);
  const [discountPercentInput, setDiscountPercentInput] = useState<number>(15);
  const [customNewPriceInput, setCustomNewPriceInput] = useState<string>('');
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null);

  React.useEffect(() => {
    setSpeedFilter(initialSpeedFilter);
  }, [initialSpeedFilter]);

  const categories = useMemo(() => {
    const set = new Set(analysis.items.map((i) => i.product.category).filter(Boolean));
    return ['SEMUA', ...Array.from(set)];
  }, [analysis.items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = analysis.items.filter((item) => {
      if (categoryFilter !== 'SEMUA' && item.product.category !== categoryFilter) return false;
      if (speedFilter !== 'ALL' && item.speedCategory !== speedFilter) return false;
      if (!q) return true;
      return (
        item.product.name.toLowerCase().includes(q) ||
        (item.product.sku || '').toLowerCase().includes(q) ||
        (item.product.barcode || '').toLowerCase().includes(q) ||
        item.product.category.toLowerCase().includes(q)
      );
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sortBy === 'DAYS_DESC') {
        const da = Number.isFinite(a.daysOfInventory) ? a.daysOfInventory : 999999;
        const db = Number.isFinite(b.daysOfInventory) ? b.daysOfInventory : 999999;
        return db - da;
      }
      if (sortBy === 'TURN_ASC') {
        return a.turnRatePerYear - b.turnRatePerYear;
      }
      if (sortBy === 'TURN_DESC') {
        return b.turnRatePerYear - a.turnRatePerYear;
      }
      // CAPITAL_DESC
      if (a.isSlowOver90Days !== b.isSlowOver90Days) {
        return a.isSlowOver90Days ? -1 : 1;
      }
      return b.inventoryCostValue - a.inventoryCostValue;
    });

    return sorted;
  }, [analysis.items, categoryFilter, speedFilter, search, sortBy]);

  const openLiquidationModal = (metric: ProductTurnoverMetric) => {
    sound.playTap();
    const pct = metric.recommendedDiscountPercent > 0 ? metric.recommendedDiscountPercent : 15;
    const basePrice = metric.sellingPriceBase;
    const calcPrice =
      basePrice > 0 ? Math.max(100, Math.round((basePrice * (1 - pct / 100)) / 100) * 100) : 0;
    setLiquidationTarget(metric);
    setDiscountPercentInput(pct);
    setCustomNewPriceInput(calcPrice > 0 ? String(calcPrice) : '');
  };

  const handleSelectDiscountPreset = (pct: number) => {
    if (!liquidationTarget) return;
    sound.playTap();
    setDiscountPercentInput(pct);
    const basePrice = liquidationTarget.sellingPriceBase;
    const calcPrice =
      basePrice > 0 ? Math.max(100, Math.round((basePrice * (1 - pct / 100)) / 100) * 100) : 0;
    setCustomNewPriceInput(calcPrice > 0 ? String(calcPrice) : '');
  };

  const handleConfirmLiquidationDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liquidationTarget || !onUpdateProduct) return;

    const newBaseSellingPrice = Math.max(0, Math.round(Number(customNewPriceInput) || 0));
    if (newBaseSellingPrice <= 0) return;

    const prod = liquidationTarget.product;
    const oldBaseSellingPrice = prod.units?.[0]?.sellingPrice || 0;
    const ratio = oldBaseSellingPrice > 0 ? newBaseSellingPrice / oldBaseSellingPrice : 1;

    const updatedUnits = prod.units.map((u, idx) => {
      if (idx === 0) {
        return { ...u, sellingPrice: newBaseSellingPrice };
      }
      const scaled = Math.max(100, Math.round((u.sellingPrice * ratio) / 100) * 100);
      return { ...u, sellingPrice: scaled };
    });

    const updatedProduct: Product = {
      ...prod,
      units: updatedUnits,
    };

    sound.playSuccessChime();
    onUpdateProduct(updatedProduct);
    setApplyFeedback(
      `Harga likuidasi "${prod.name}" diperbarui: ${formatRupiah(oldBaseSellingPrice)} → ${formatRupiah(
        newBaseSellingPrice
      )} per ${prod.baseUnit}.`
    );
    setLiquidationTarget(null);
    setTimeout(() => setApplyFeedback(null), 6000);
  };

  const handleExportTurnoverCsv = () => {
    sound.playTap();
    const headers = [
      'Nama Produk',
      'SKU/Barcode',
      'Kategori',
      'Stok Saat Ini',
      'Satuan',
      'HPP Satuan',
      'Modal Tertahan (Rp)',
      `Terjual (${lookbackDays} Hari)`,
      'Stock Turn Rate (x/Tahun)',
      'Estimasi Perputaran (Hari)',
      'Status Perputaran',
      'Rekomendasi Diskon (%)',
      'Harga Jual Normal',
      'Saran Harga Likuidasi',
    ];

    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;

    const rows = filteredItems.map((m) => [
      m.product.name,
      m.product.sku || m.product.barcode || '-',
      m.product.category,
      m.currentStock,
      m.product.baseUnit,
      m.product.costPrice,
      m.inventoryCostValue,
      m.unitsSoldInPeriod,
      m.turnRatePerYear.toFixed(2),
      Number.isFinite(m.daysOfInventory) ? m.daysOfInventory : '>90 (Nol Penjualan)',
      m.isSlowOver90Days ? 'SANGAT LAMBAT (>90 HARI)' : m.speedCategory,
      m.recommendedDiscountPercent,
      m.sellingPriceBase,
      m.suggestedLiquidationPrice,
    ]);

    const csv = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join(
      '\n'
    );
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analisis-stock-turn-rate-${lookbackDays}h-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderSpeedLabel = (item: ProductTurnoverMetric) => {
    switch (item.speedCategory) {
      case 'VERY_SLOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10.5px] font-bold whitespace-nowrap">
            <AlertTriangle className="w-3 h-3 text-rose-600 shrink-0" />
            <span>Sangat Lambat (&gt;90h)</span>
          </span>
        );
      case 'SLOW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 text-[10.5px] font-bold whitespace-nowrap">
            <TrendingDown className="w-3 h-3 text-amber-600 shrink-0" />
            <span>Lambat (61-90h)</span>
          </span>
        );
      case 'NORMAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[10.5px] font-bold whitespace-nowrap">
            <span>Normal (31-60h)</span>
          </span>
        );
      case 'FAST':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10.5px] font-bold whitespace-nowrap">
            <TrendingUp className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>Cepat (&le;30h)</span>
          </span>
        );
      case 'OUT_OF_STOCK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[10.5px] font-bold whitespace-nowrap">
            <span>Stok Habis</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header & Period Switcher */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4.5 h-4.5 text-amber-600" />
            <span>Analisis Stock Turn Rate &amp; Rekomendasi Diskon Likuidasi</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Mengukur kecepatan perputaran modal persediaan tahunan serta mendeteksi stok mengendap lebih dari 90 hari agar dana cepat cair kembali.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
            {([30, 60, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  sound.playTap();
                  onChangeLookbackDays(days);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  lookbackDays === days
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Basis {days} Hari
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportTurnoverCsv}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Ekspor CSV</span>
          </button>
        </div>
      </div>

      {/* Feedback Notification after applying liquidation price */}
      {applyFeedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{applyFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setApplyFeedback(null)}
            className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 4 Crisp KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-rose-200">
          <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
            Stok Sangat Lambat (&gt;90 Hari)
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-rose-700 mt-1">
            {formatNumber(analysis.summary.verySlowCount)} SKU
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Dari {formatNumber(analysis.summary.totalPhysicalSkus)} produk fisik
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200">
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
            Modal Tertahan (&gt;90 Hari)
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 mt-1">
            {formatRupiah(analysis.summary.verySlowCapitalValue)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Total valuasi HPP stok lambat
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Rata-Rata Stock Turn Rate
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-sky-700 mt-1">
            {analysis.summary.avgTurnRate.toFixed(2)}× / thn
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            {analysis.summary.avgDaysToTurn !== null
              ? `Rata-rata siklus: ${analysis.summary.avgDaysToTurn} hari`
              : 'Belum ada penjualan aktif'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200">
          <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
            Potensi Kas Likuidasi
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-700 mt-1">
            {formatRupiah(analysis.summary.potentialCashRecovered)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Estimasi omzet jika didiskon likuidasi
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row gap-2.5 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama produk, SKU, atau kategori..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => {
              sound.playTap();
              setCategoryFilter(e.target.value);
            }}
            className="w-full md:w-48 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                Kategori: {cat}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 w-full md:w-auto">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => {
                sound.playTap();
                setSortBy(e.target.value as any);
              }}
              className="w-full md:w-52 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="CAPITAL_DESC">Urutkan: Modal Tertahan Terbesar</option>
              <option value="DAYS_DESC">Urutkan: Hari Perputaran Terlama</option>
              <option value="TURN_ASC">Urutkan: Turn Rate Terendah</option>
              <option value="TURN_DESC">Urutkan: Turn Rate Tertinggi</option>
            </select>
          </div>
        </div>

        {/* Speed Segment Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100">
          {[
            { id: 'ALL', label: `Semua (${analysis.items.length})` },
            { id: 'VERY_SLOW', label: `Sangat Lambat >90h (${analysis.summary.verySlowCount})` },
            { id: 'SLOW', label: `Lambat 61-90h (${analysis.summary.slowCount})` },
            { id: 'NORMAL', label: `Normal 31-60h (${analysis.summary.normalCount})` },
            { id: 'FAST', label: `Cepat <=30h (${analysis.summary.fastCount})` },
            { id: 'OUT_OF_STOCK', label: `Habis (${analysis.summary.outOfStockCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                sound.playTap();
                setSpeedFilter(tab.id as any);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                speedFilter === tab.id
                  ? tab.id === 'VERY_SLOW'
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stock Turn Rate Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
              <tr>
                <th className="py-3 px-4">Produk &amp; Kategori</th>
                <th className="py-3 px-4 text-right">Stok &amp; Modal (HPP)</th>
                <th className="py-3 px-4 text-right">Terjual ({lookbackDays}h)</th>
                <th className="py-3 px-4 text-right">Turn Rate</th>
                <th className="py-3 px-4 text-right">Perputaran</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Rekomendasi Likuidasi</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    Tidak ada produk yang sesuai dengan filter perputaran stok.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr
                    key={item.product.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      item.isSlowOver90Days ? 'bg-rose-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{item.product.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span>{item.product.category}</span>
                        <span>•</span>
                        <span className="font-mono">{item.product.sku || item.product.barcode || '-'}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <div className="font-bold text-slate-900">
                        {formatNumber(item.currentStock)} {item.product.baseUnit}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {formatRupiah(item.inventoryCostValue)}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <div className="font-bold text-slate-800">
                        {formatNumber(item.unitsSoldInPeriod)} {item.product.baseUnit}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {item.avgDailySales > 0 ? `${item.avgDailySales.toFixed(2)}/hari` : '0/hari'}
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span
                        className={`font-black ${
                          item.isSlowOver90Days
                            ? 'text-rose-700'
                            : item.speedCategory === 'FAST'
                            ? 'text-emerald-700'
                            : 'text-slate-900'
                        }`}
                      >
                        {item.turnRatePerYear.toFixed(2)}×
                      </span>
                      <div className="text-[10px] text-slate-400">per tahun</div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {item.currentStock <= 0 ? (
                        <span className="text-slate-400 font-bold">0 hari</span>
                      ) : Number.isFinite(item.daysOfInventory) ? (
                        <div>
                          <span
                            className={`font-black ${
                              item.daysOfInventory > 90
                                ? 'text-rose-700'
                                : item.daysOfInventory > 60
                                ? 'text-amber-700'
                                : 'text-slate-900'
                            }`}
                          >
                            {formatNumber(item.daysOfInventory)} hari
                          </span>
                          {item.daysSinceLastMovement !== null && (
                            <div className="text-[10px] text-slate-400">
                              Terakhir gerak {item.daysSinceLastMovement}h lalu
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="font-black text-rose-700">&gt; 90 hari</span>
                          <div className="text-[10px] text-rose-600">Nol penjualan</div>
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-4">{renderSpeedLabel(item)}</td>

                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      {item.recommendedDiscountPercent > 0 && item.sellingPriceBase > 0 ? (
                        <div>
                          <div className="font-bold text-amber-700">
                            Diskon {item.recommendedDiscountPercent}% →{' '}
                            {formatRupiah(item.suggestedLiquidationPrice)}
                          </div>
                          <div className="text-[10.5px] text-slate-500">
                            Normal: {formatRupiah(item.sellingPriceBase)} •{' '}
                            <span
                              className={
                                item.isSuggestedBelowCost ? 'text-rose-600 font-bold' : 'text-emerald-700'
                              }
                            >
                              Margin {item.estimatedMarginAfterDiscountPercent}%
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-sans">Tidak perlu diskon</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right">
                      {item.currentStock > 0 && item.sellingPriceBase > 0 && canEditPricing && onUpdateProduct ? (
                        <button
                          type="button"
                          onClick={() => openLiquidationModal(item)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            item.isSlowOver90Days
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          <Tag className="w-3.5 h-3.5" />
                          <span>Diskon Likuidasi</span>
                        </button>
                      ) : item.speedCategory === 'OUT_OF_STOCK' && onNavigateToSuppliers ? (
                        <button
                          type="button"
                          onClick={onNavigateToSuppliers}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Restock PO
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Hanya Lihat</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Liquidation Discount Modal */}
      {liquidationTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-200 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-rose-600" />
                <div>
                  <h3 className="text-base font-bold text-slate-900">Terapkan Diskon Likuidasi</h3>
                  <p className="text-xs text-slate-500">{liquidationTarget.product.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLiquidationTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmLiquidationDiscount} className="py-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200 font-mono tabular-nums">
                <div>
                  <span className="text-slate-500 font-sans block text-[11px]">Harga Jual Saat Ini</span>
                  <strong className="text-slate-900 text-sm">
                    {formatRupiah(liquidationTarget.sellingPriceBase)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 font-sans block text-[11px]">HPP / Harga Modal</span>
                  <strong className="text-slate-900 text-sm">
                    {formatRupiah(liquidationTarget.product.costPrice)}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 font-sans block text-[11px]">Stok Tertahan</span>
                  <strong className="text-rose-700 text-sm">
                    {formatNumber(liquidationTarget.currentStock)} {liquidationTarget.product.baseUnit}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 font-sans block text-[11px]">Modal Tertahan</span>
                  <strong className="text-rose-700 text-sm">
                    {formatRupiah(liquidationTarget.inventoryCostValue)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  Pilih Persentase Diskon Likuidasi
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[10, 15, 20, 25, 30].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleSelectDiscountPreset(pct)}
                      className={`py-2 rounded-xl text-xs font-bold font-mono cursor-pointer transition-colors ${
                        discountPercentInput === pct
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      -{pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Harga Jual Baru per {liquidationTarget.product.baseUnit} (Rp)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    required
                    value={customNewPriceInput}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setCustomNewPriceInput(e.target.value);
                      if (liquidationTarget.sellingPriceBase > 0) {
                        const impliedPct = Math.round(
                          ((liquidationTarget.sellingPriceBase - val) /
                            liquidationTarget.sellingPriceBase) *
                            100
                        );
                        setDiscountPercentInput(Math.max(0, impliedPct));
                      }
                    }}
                    className="w-full p-3 rounded-xl border border-slate-300 text-base font-mono font-bold focus:border-rose-500 focus:outline-none pr-16"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-rose-600 flex items-center gap-0.5 font-mono">
                    <Percent className="w-3.5 h-3.5" />
                    -{discountPercentInput}%
                  </span>
                </div>
                {Number(customNewPriceInput) > 0 &&
                  Number(customNewPriceInput) < liquidationTarget.product.costPrice && (
                    <p className="text-[11px] text-rose-600 font-bold mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Harga ini di bawah HPP ({formatRupiah(liquidationTarget.product.costPrice)}) — mode cuci gudang rugi modal.
                      </span>
                    </p>
                  )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setLiquidationTarget(null)}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  Terapkan Harga Likuidasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
