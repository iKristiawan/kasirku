import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  MessageCircle,
  Percent,
  Search,
  ShieldAlert,
  Tag,
  X,
} from 'lucide-react';
import { Product, StoreSettings, UserRole } from '../types/pos';
import { formatNumber, formatRupiah, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  analyzeExpiringProducts,
  buildClearanceWhatsAppBroadcast,
  ExpiringProductItem,
} from '../utils/expiryClearance';

interface ExpiringClearanceModuleProps {
  products: Product[];
  storeSettings?: StoreSettings;
  currentUserRole: UserRole;
  onUpdateProduct?: (updatedProduct: Product) => void;
  onAdjustStockForProduct?: (product: Product, defaultReason: string) => void;
}

export const ExpiringClearanceModule: React.FC<ExpiringClearanceModuleProps> = ({
  products,
  storeSettings,
  currentUserRole,
  onUpdateProduct,
  onAdjustStockForProduct,
}) => {
  const canApplyClearance = currentUserRole === 'ADMIN' || currentUserRole === 'STORE_MANAGER';

  const [windowFilter, setWindowFilter] = useState<'WITHIN_30D' | 'CRITICAL_7D' | 'EXPIRED'>('WITHIN_30D');
  const [search, setSearch] = useState('');
  const [promoTarget, setPromoTarget] = useState<ExpiringProductItem | null>(null);
  const [selectedDiscountPct, setSelectedDiscountPct] = useState<number>(20);
  const [customPromoPrice, setCustomPromoPrice] = useState<string>('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const analysis = useMemo(() => analyzeExpiringProducts(products), [products]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const baseList =
      windowFilter === 'CRITICAL_7D'
        ? analysis.within7Days
        : windowFilter === 'EXPIRED'
        ? analysis.expired
        : analysis.within30Days;

    if (!q) return baseList;
    return baseList.filter(
      (item) =>
        item.product.name.toLowerCase().includes(q) ||
        (item.product.sku || '').toLowerCase().includes(q) ||
        (item.product.barcode || '').toLowerCase().includes(q) ||
        (item.product.category || '').toLowerCase().includes(q)
    );
  }, [analysis, windowFilter, search]);

  const openPromoModal = (item: ExpiringProductItem) => {
    sound.playTap();
    const pct = item.recommendedDiscountPercent > 0 ? item.recommendedDiscountPercent : 15;
    const basePrice = item.normalSellingPrice;
    const calc =
      basePrice > 0 ? Math.max(100, Math.round((basePrice * (1 - pct / 100)) / 100) * 100) : 0;
    setPromoTarget(item);
    setSelectedDiscountPct(pct);
    setCustomPromoPrice(calc > 0 ? String(calc) : '');
  };

  const handleSelectDiscountPreset = (pct: number) => {
    if (!promoTarget) return;
    sound.playTap();
    setSelectedDiscountPct(pct);
    const basePrice = promoTarget.normalSellingPrice;
    const calc =
      basePrice > 0 ? Math.max(100, Math.round((basePrice * (1 - pct / 100)) / 100) * 100) : 0;
    setCustomPromoPrice(calc > 0 ? String(calc) : '');
  };

  const handleConfirmClearancePromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoTarget || !onUpdateProduct) return;

    const newBaseSellingPrice = Math.max(0, Math.round(Number(customPromoPrice) || 0));
    if (newBaseSellingPrice <= 0) return;

    const prod = promoTarget.product;
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
    setFeedbackMsg(
      `Promo cuci gudang "${prod.name}" diterapkan: ${formatRupiah(oldBaseSellingPrice)} -> ${formatRupiah(
        newBaseSellingPrice
      )} per ${prod.baseUnit} (Exp: ${promoTarget.earliestExpiryDate}).`
    );
    setPromoTarget(null);
    setTimeout(() => setFeedbackMsg(null), 7000);
  };

  const handleExportCsv = () => {
    sound.playTap();
    const headers = [
      'Nama Produk',
      'SKU/Barcode',
      'Kategori',
      'Tanggal Kedaluwarsa',
      'Sumber Tanggal',
      'Sisa Hari',
      'Stok Berisiko',
      'Satuan',
      'Nilai HPP Berisiko (Rp)',
      'Harga Normal (Rp)',
      'Saran Diskon (%)',
      'Saran Harga Cuci Gudang (Rp)',
    ];
    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
    const rows = filteredItems.map((item) => [
      item.product.name,
      item.product.sku || item.product.barcode,
      item.product.category,
      item.earliestExpiryDate,
      item.expirySource === 'BATCH' ? `Batch ${item.batchNumber || ''}`.trim() : 'Produk Utama',
      item.daysRemaining,
      item.atRiskUnits,
      item.product.baseUnit,
      item.atRiskCostValue,
      item.normalSellingPrice,
      item.recommendedDiscountPercent,
      item.suggestedPromoPrice,
    ]);

    const csv = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join(
      '\n'
    );
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daftar-cuci-gudang-30-hari-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBroadcastWhatsApp = () => {
    sound.playTap();
    const msg = buildClearanceWhatsAppBroadcast(
      analysis.within30Days,
      storeSettings?.storeName
    );
    const targetPhone = storeSettings?.adminWhatsAppNumber || storeSettings?.storePhone || '';
    const waUrl = formatWhatsAppUrl(targetPhone, msg);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const promoNumericPrice = Math.max(0, Math.round(Number(customPromoPrice) || 0));
  const promoCostPrice = promoTarget?.product.costPrice || 0;
  const isPromoBelowCost = promoCostPrice > 0 && promoNumericPrice > 0 && promoNumericPrice < promoCostPrice;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
            <CalendarClock className="w-4.5 h-4.5 text-amber-600 shrink-0" />
            <span>Produk Kedaluwarsa ≤ 30 Hari &amp; Promosi Cuci Gudang Dini</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Daftar otomatis produk fisik (dan batch FIFO) yang mendekati tanggal kedaluwarsa dalam 30 hari ke depan untuk aksi promo cuci gudang sebelum barang rusak.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {analysis.within30Days.length > 0 && (
            <button
              type="button"
              onClick={handleBroadcastWhatsApp}
              className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Kirim Daftar Promo WA</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredItems.length === 0}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Ekspor (.CSV)</span>
          </button>
        </div>
      </div>

      {/* Summary Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40">
          <div className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
            Kedaluwarsa ≤ 30 Hari
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-amber-800 mt-1">
            {formatNumber(analysis.within30Days.length)} SKU
          </div>
          <div className="text-[11px] text-amber-700 mt-0.5 tabular-nums">
            Total {formatNumber(analysis.totalAtRiskUnits30d)} unit perlu promo dini
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50/30">
          <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
            Kritis ≤ 7 Hari
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-rose-700 mt-1">
            {formatNumber(analysis.within7Days.length)} SKU
          </div>
          <div className="text-[11px] text-rose-700 mt-0.5">
            Prioritas diskon tinggi / cuci gudang kilat
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            Modal Stok Berisiko (30H)
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 mt-1">
            {formatRupiah(analysis.totalAtRiskCost30d)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Potensi kerugian HPP jika tidak terjual
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Sudah Lewat Tanggal
          </div>
          <div className={`text-xl font-black font-mono tabular-nums mt-1 ${
            analysis.expired.length > 0 ? 'text-rose-700' : 'text-emerald-700'
          }`}>
            {formatNumber(analysis.expired.length)} SKU
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Wajib dipisahkan dari rak penjualan
          </div>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search & Segmented Window Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk, SKU/barcode, atau kategori dalam daftar kedaluwarsa..."
            className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-amber-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 shrink-0 overflow-x-auto no-scrollbar">
          {[
            { id: 'WITHIN_30D', label: `≤ 30 Hari (${analysis.within30Days.length})` },
            { id: 'CRITICAL_7D', label: `Kritis ≤ 7 Hari (${analysis.within7Days.length})` },
            { id: 'EXPIRED', label: `Lewat Tanggal (${analysis.expired.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                sound.playTap();
                setWindowFilter(tab.id as any);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                windowFilter === tab.id
                  ? tab.id === 'EXPIRED'
                    ? 'bg-rose-600 text-white'
                    : 'bg-amber-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product Clearance List Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
              <tr>
                <th className="py-3 px-4">Produk &amp; Batch</th>
                <th className="py-3 px-4">Kedaluwarsa</th>
                <th className="py-3 px-4 text-right">Stok Berisiko</th>
                <th className="py-3 px-4 text-right">Harga Normal</th>
                <th className="py-3 px-4 text-right">Saran Promo Cuci Gudang</th>
                <th className="py-3 px-4 text-right">Aksi Promo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <CheckCircle2 className="w-9 h-9 mx-auto mb-2 text-emerald-500 stroke-1.5" />
                    <p className="font-semibold text-slate-700 text-sm">
                      Tidak ada produk kedaluwarsa pada filter ini
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      Produk dengan tanggal kedaluwarsa aktif dalam rentang 30 hari ke depan akan muncul otomatis di sini beserta rekomendasi diskon cuci gudang.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const urgLabel = item.isExpired
                    ? `Lewat ${Math.abs(item.daysRemaining)} hari`
                    : item.daysRemaining === 0
                    ? 'Kedaluwarsa Hari Ini'
                    : `Sisa ${item.daysRemaining} hari`;

                  return (
                    <tr key={item.product.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{item.product.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>{item.product.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{item.product.sku || item.product.barcode}</span>
                          {item.expirySource === 'BATCH' && item.batchNumber && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-amber-800 font-semibold">
                                Batch {item.batchNumber}
                              </span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono tabular-nums font-bold text-slate-900">
                          {item.earliestExpiryDate}
                        </div>
                        <div
                          className={`text-[11px] font-bold mt-0.5 inline-flex items-center gap-1 ${
                            item.isExpired
                              ? 'text-rose-700'
                              : item.isWithin7Days
                              ? 'text-rose-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {item.isExpired ? (
                            <ShieldAlert className="w-3 h-3 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                          )}
                          <span>{urgLabel}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <div className="font-bold text-slate-900">
                          {formatNumber(item.atRiskUnits)} {item.product.baseUnit}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          HPP: {formatRupiah(item.atRiskCostValue)}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-800">
                        {formatRupiah(item.normalSellingPrice)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {item.isExpired ? (
                          <span className="text-xs font-bold text-rose-700">
                            Tarik / Retur / Musnahkan
                          </span>
                        ) : (
                          <div>
                            <div className="font-extrabold text-amber-800">
                              {formatRupiah(item.suggestedPromoPrice)}{' '}
                              <span className="text-[11px] text-rose-700">
                                (-{item.recommendedDiscountPercent}%)
                              </span>
                            </div>
                            <div className="text-[10.5px] text-slate-500">
                              Margin est. {item.estimatedMarginPercent}%
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!item.isExpired && canApplyClearance && onUpdateProduct && (
                            <button
                              type="button"
                              onClick={() => openPromoModal(item)}
                              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                            >
                              <Tag className="w-3 h-3" />
                              <span>Promo Cuci Gudang</span>
                            </button>
                          )}
                          {onAdjustStockForProduct && (
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                onAdjustStockForProduct(
                                  item.product,
                                  item.isExpired
                                    ? 'Pemusnahan / Retur Barang Kadaluarsa'
                                    : 'Pemisahan Stok Mendekati Kadaluarsa'
                                );
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                            >
                              Sesuaikan Stok
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
      </div>

      {/* Clearance Promotion Modal */}
      {promoTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div
            className="bg-white rounded-2xl max-w-md w-full p-5 border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Percent className="w-4 h-4 text-amber-600" />
                  <span>Atur Promosi Cuci Gudang</span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[300px]">
                  {promoTarget.product.name} · Exp {promoTarget.earliestExpiryDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromoTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmClearancePromo} className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono tabular-nums">
                <div>
                  <span className="text-slate-500 block font-sans">Harga Jual Normal</span>
                  <strong className="text-slate-900">{formatRupiah(promoTarget.normalSellingPrice)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-sans">Harga Modal (HPP)</span>
                  <strong className="text-slate-900">{formatRupiah(promoCostPrice)}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-sans">Stok Berisiko</span>
                  <strong className="text-amber-800">
                    {formatNumber(promoTarget.atRiskUnits)} {promoTarget.product.baseUnit}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500 block font-sans">Sisa Masa Simpan</span>
                  <strong className="text-rose-700">{promoTarget.daysRemaining} Hari</strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih Diskon Cuci Gudang Cepat
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[10, 15, 20, 25, 30, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleSelectDiscountPreset(pct)}
                      className={`py-2 rounded-xl text-xs font-bold font-mono border cursor-pointer transition-colors ${
                        selectedDiscountPct === pct
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                      }`}
                    >
                      Diskon {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Harga Promo Baru per {promoTarget.product.baseUnit} (Rp)
                </label>
                <input
                  type="number"
                  min={1}
                  value={customPromoPrice}
                  onChange={(e) => setCustomPromoPrice(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                  required
                />
                {isPromoBelowCost && (
                  <p className="text-[11px] text-rose-700 font-semibold mt-1.5 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Perhatian: Harga promo berada di bawah HPP modal ({formatRupiah(promoCostPrice)}).</span>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPromoTarget(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer"
                >
                  Terapkan Harga Promo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
