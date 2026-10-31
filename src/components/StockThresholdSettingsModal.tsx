import React, { useState, useMemo, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  X, 
  Search, 
  Sliders, 
  AlertTriangle, 
  CheckCircle2, 
  Save, 
  Sparkles, 
  Layers,
  ArrowUpDown,
  RotateCcw,
  ShoppingBag,
  MessageCircle,
  Truck,
  Copy,
  Check,
  FileDown,
  Building2,
  Phone,
  Calendar,
  Send,
  AlertCircle,
  Package,
  Plus,
  Minus,
  RefreshCw
} from 'lucide-react';
import { Product, Supplier, StoreSettings, ProductUnit } from '../types/pos';
import { formatNumber, formatRupiah, formatDateTime, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';

interface StockThresholdSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  suppliers?: Supplier[];
  storeSettings?: StoreSettings;
  onSaveThresholds: (updatedProducts: Product[]) => void;
}

export const StockThresholdSettingsModal: React.FC<StockThresholdSettingsModalProps> = ({
  isOpen,
  onClose,
  products,
  suppliers = [],
  storeSettings,
  onSaveThresholds,
}) => {
  // Navigation tabs inside modal: 'THRESHOLDS' vs 'AUTO_PO'
  const [activeTab, setActiveTab] = useState<'THRESHOLDS' | 'AUTO_PO'>('THRESHOLDS');

  // Search & filter for Thresholds tab
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('SEMUA');
  
  // Local state map of productId -> minStockAlert
  const [thresholds, setThresholds] = useState<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    products.forEach((p) => {
      map[p.id] = p.minStockAlert;
    });
    return map;
  });

  // Auto-PO feature states
  const [autoPOEnabled, setAutoPOEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('kasir_auto_po_enabled') === 'true';
    } catch {
      return true;
    }
  });

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('ALL');
  const [filterSupplierCategories, setFilterSupplierCategories] = useState<boolean>(false);
  const [customReorderQtys, setCustomReorderQtys] = useState<Record<string, number>>({});
  const [customSelectedUnits, setCustomSelectedUnits] = useState<Record<string, string>>({});
  const [excludedFromPO, setExcludedFromPO] = useState<Record<string, boolean>>({});
  const [poNote, setPoNote] = useState<string>('Mohon konfirmasi ketersediaan barang & estimasi jam pengiriman. Terima kasih!');
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  const categories = useMemo(() => {
    return ['SEMUA', ...Array.from(new Set(products.map((p) => p.category)))];
  }, [products]);

  // Sync state when modal opens
  useEffect(() => {
    if (isOpen) {
      const map: Record<string, number> = {};
      products.forEach((p) => {
        map[p.id] = p.minStockAlert;
      });
      setThresholds(map);
      setSearch('');
      setCopiedSuccess(false);
    }
  }, [isOpen, products]);

  // List of products that have reached or are below their minimum threshold
  const lowStockProducts = useMemo(() => {
    return products.filter((p) => {
      const threshold = thresholds[p.id] ?? p.minStockAlert;
      return p.stockInBaseUnit <= threshold;
    });
  }, [products, thresholds]);

  // Filtered products for Thresholds tab
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === 'SEMUA' || p.category === selectedCategory;
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, search]);

  // Current selected supplier object
  const activeSupplier = useMemo(() => {
    if (selectedSupplierId === 'ALL') return null;
    return suppliers.find((s) => s.id === selectedSupplierId) || null;
  }, [suppliers, selectedSupplierId]);

  // Items to include in the Auto-Generated Purchase Order
  const poItems = useMemo(() => {
    let list = lowStockProducts;

    // Filter by supplier category if enabled
    if (activeSupplier && filterSupplierCategories && activeSupplier.suppliedCategories.length > 0) {
      list = list.filter((p) => activeSupplier.suppliedCategories.includes(p.category));
    }

    return list.map((p) => {
      const threshold = thresholds[p.id] ?? p.minStockAlert;
      const deficit = Math.max(0, threshold - p.stockInBaseUnit);
      // Default recommended order: buffer to reach 2x minStockAlert (or at least threshold amount)
      const defaultBaseOrderQty = Math.max(threshold || 10, deficit + (threshold || 10));

      // Check selected unit
      const selectedUnitName = customSelectedUnits[p.id] || p.baseUnit;
      const unitObj = p.units.find((u) => u.unitName === selectedUnitName) || p.units[0];
      const convFactor = unitObj?.conversionFactor || 1;

      // Recommended order in selected unit
      const defaultOrderInUnit = Math.max(1, Math.ceil(defaultBaseOrderQty / convFactor));
      const orderQty = customReorderQtys[p.id] !== undefined ? customReorderQtys[p.id] : defaultOrderInUnit;

      const unitCost = (unitObj?.costPrice && unitObj.costPrice > 0)
        ? unitObj.costPrice
        : (p.costPrice * convFactor);
      const totalEstimatedCost = orderQty * unitCost;

      const isExcluded = !!excludedFromPO[p.id];

      return {
        product: p,
        threshold,
        currentStock: p.stockInBaseUnit,
        selectedUnitName,
        selectedUnitObj: unitObj,
        conversionFactor: convFactor,
        orderQty,
        unitCost,
        totalEstimatedCost,
        isExcluded,
      };
    });
  }, [lowStockProducts, thresholds, activeSupplier, filterSupplierCategories, customSelectedUnits, customReorderQtys, excludedFromPO]);

  // Active items included in PO (not unchecked)
  const activePOItems = useMemo(() => {
    return poItems.filter((item) => !item.isExcluded && item.orderQty > 0);
  }, [poItems]);

  // Total PO Financials
  const totalPOEstimatedCost = useMemo(() => {
    return activePOItems.reduce((acc, item) => acc + item.totalEstimatedCost, 0);
  }, [activePOItems]);

  const handleThresholdChange = (productId: string, val: number) => {
    setThresholds((prev) => ({
      ...prev,
      [productId]: Math.max(0, val),
    }));
  };

  const handleApplyBulkCategory = (thresholdVal: number) => {
    sound.playTap();
    const updated = { ...thresholds };
    filteredProducts.forEach((p) => {
      updated[p.id] = thresholdVal;
    });
    setThresholds(updated);
  };

  const handleSave = () => {
    sound.playSuccessChime();
    const updatedProducts = products.map((p) => {
      if (thresholds[p.id] !== undefined) {
        return {
          ...p,
          minStockAlert: thresholds[p.id],
        };
      }
      return p;
    });
    onSaveThresholds(updatedProducts);
    onClose();
  };

  const handleToggleAutoPO = (enabled: boolean) => {
    sound.playTap();
    setAutoPOEnabled(enabled);
    try {
      localStorage.setItem('kasir_auto_po_enabled', enabled ? 'true' : 'false');
    } catch {}
  };

  // Adjust order quantity for a product in PO
  const handleOrderQtyChange = (productId: string, newQty: number) => {
    setCustomReorderQtys((prev) => ({
      ...prev,
      [productId]: Math.max(1, newQty),
    }));
  };

  // Change order unit for a product (e.g. PCS -> DUS)
  const handleUnitChange = (productId: string, unitName: string) => {
    sound.playTap();
    setCustomSelectedUnits((prev) => ({
      ...prev,
      [productId]: unitName,
    }));
  };

  // Toggle exclusion of an item from PO
  const handleToggleExclude = (productId: string) => {
    sound.playTap();
    setExcludedFromPO((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  // Generate formatted WhatsApp message text
  const generateWhatsAppMessage = () => {
    const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
    const storeAddr = storeSettings?.storeAddress || '';
    const storeTel = storeSettings?.storePhone || '';
    const targetSupplierName = activeSupplier ? activeSupplier.name : 'Mitra Distributor & Supplier';
    const targetContact = activeSupplier?.contactPerson ? ` (${activeSupplier.contactPerson})` : '';
    const dateFormatted = formatDateTime(Date.now());
    const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    let text = `📋 *PURCHASE ORDER (PO) RESTOCK BARANG*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🏪 *${storeTitle}*\n`;
    if (storeAddr) text += `📍 ${storeAddr}\n`;
    if (storeTel) text += `📞 ${storeTel}\n`;
    text += `\n`;
    text += `🔢 *No. PO:* ${poNumber}\n`;
    text += `📅 *Tanggal:* ${dateFormatted}\n`;
    text += `👤 *Penerima:* ${targetSupplierName}${targetContact}\n`;
    text += `\n`;
    text += `Halo, berikut adalah daftar pesanan restock barang yang telah mencapai batas minimum stok di toko kami:\n\n`;
    text += `📦 *DAFTAR ITEM PESANAN:*\n`;

    activePOItems.forEach((item, idx) => {
      const p = item.product;
      text += `${idx + 1}. *${p.name}*\n`;
      text += `   • Sisa Stok: ${formatNumber(item.currentStock)} ${p.baseUnit} (Batas Min: ${formatNumber(item.threshold)})\n`;
      text += `   • Qty Dipesan: *${formatNumber(item.orderQty)} ${item.selectedUnitName}*`;
      if (item.conversionFactor > 1) {
        text += ` (= ${formatNumber(item.orderQty * item.conversionFactor)} ${p.baseUnit})`;
      }
      text += `\n`;
      text += `   • Estimasi Biaya: ${formatRupiah(item.unitCost)} / ${item.selectedUnitName} (Total: ${formatRupiah(item.totalEstimatedCost)})\n\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💰 *TOTAL ESTIMASI NILAI PO: ${formatRupiah(totalPOEstimatedCost)}*\n`;
    text += `📦 *Total Item:* ${activePOItems.length} Macam Barang\n\n`;
    text += `📝 *Catatan Pemesanan:*\n`;
    text += `${poNote.trim()}\n\n`;
    text += `_Dibuat secara otomatis melalui KasirKu Tablet POS._`;

    return { text, poNumber };
  };

  // Send PO via WhatsApp
  const handleSendWhatsAppPO = () => {
    if (activePOItems.length === 0) {
      alert('Tidak ada item yang dipilih untuk dipesan dalam Purchase Order.');
      return;
    }

    sound.playSuccessChime();
    const { text } = generateWhatsAppMessage();
    const phone = activeSupplier?.whatsapp || activeSupplier?.phone || '';
    const url = formatWhatsAppUrl(phone, text);
    window.open(url, '_blank');
  };

  // Copy PO message to clipboard
  const handleCopyPOMessage = async () => {
    sound.playTap();
    const { text } = generateWhatsAppMessage();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 3000);
    } catch {
      alert('Gagal menyalin ke clipboard');
    }
  };

  // Export PO to PDF using jsPDF
  const handleExportPOPdf = () => {
    sound.playTap();
    const doc = new jsPDF({ orientation: 'portrait' });
    const { poNumber } = generateWhatsAppMessage();
    const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
    const storeAddr = storeSettings?.storeAddress || '';
    const storeTel = storeSettings?.storePhone || '';
    const dateFormatted = formatDateTime(Date.now());
    const supplierTitle = activeSupplier ? activeSupplier.name : 'Mitra Supplier & Distributor';

    // Header Banner
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 26, 'F');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text('SURAT PESANAN BARANG (PURCHASE ORDER)', 14, 13);
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text(`${storeTitle} | ${storeAddr || 'Pusat Distribusi KasirKu'}`, 14, 20);

    // Meta details
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(9.5);
    doc.text(`Nomor PO: ${poNumber}`, 14, 34);
    doc.text(`Tanggal Cetak: ${dateFormatted}`, 14, 40);
    doc.text(`Toko Pemesan: ${storeTitle} (${storeTel || '-'})`, 14, 46);

    doc.text(`Tujuan Supplier: ${supplierTitle}`, 120, 34);
    doc.text(`Kontak: ${activeSupplier?.whatsapp || activeSupplier?.phone || '-'}`, 120, 40);
    doc.text(`PIC: ${activeSupplier?.contactPerson || 'Bagian Penjualan'}`, 120, 46);

    // Table Data
    const tableBody = activePOItems.map((item, idx) => [
      (idx + 1).toString(),
      item.product.name,
      item.product.category,
      `${formatNumber(item.currentStock)} ${item.product.baseUnit}`,
      `${formatNumber(item.threshold)} ${item.product.baseUnit}`,
      `${formatNumber(item.orderQty)} ${item.selectedUnitName}`,
      formatRupiah(item.unitCost),
      formatRupiah(item.totalEstimatedCost),
    ]);

    autoTable(doc, {
      startY: 52,
      head: [
        ['No', 'Nama Produk', 'Kategori', 'Sisa Stok', 'Batas Min', 'Qty Pesan', 'Harga Satuan', 'Subtotal Biaya'],
      ],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [2, 132, 199],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 80;

    // Totals & Notes
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Estimasi Nilai PO: ${formatRupiah(totalPOEstimatedCost)}`, 14, finalY + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Catatan: ${poNote}`, 14, finalY + 16);

    // Signature boxes
    doc.setFontSize(8.5);
    doc.text('Dibuat Oleh (Toko):', 14, finalY + 28);
    doc.text('______________________', 14, finalY + 45);
    doc.text(`${storeTitle}`, 14, finalY + 50);

    doc.text('Diterima Oleh (Supplier):', 130, finalY + 28);
    doc.text('______________________', 130, finalY + 45);
    doc.text(`${supplierTitle}`, 130, finalY + 50);

    doc.save(`${poNumber}.pdf`);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 select-none overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-5 md:p-6 shadow-2xl border border-slate-200 my-auto flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header with Navigation Tabs */}
        <div className="pb-3 border-b border-slate-100 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-amber-100 text-amber-700">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Ambang Batas Stok & Auto-Generate PO
                </h3>
                <p className="text-xs text-slate-500">
                  Kelola batas minimum peringatan stok dan otomatis buat daftar Purchase Order ke supplier via WhatsApp.
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sub-Tabs: Thresholds vs Auto-Generate PO */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setActiveTab('THRESHOLDS');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all ${
                  activeTab === 'THRESHOLDS'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5 text-amber-600" />
                <span>Atur Batas Minimum Stok</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setActiveTab('AUTO_PO');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all relative ${
                  activeTab === 'AUTO_PO'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-600" />
                <span>Auto-Generate PO WhatsApp</span>
                {lowStockProducts.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                    {lowStockProducts.length}
                  </span>
                )}
              </button>
            </div>

            {/* Auto PO Notification Pill */}
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  checked={autoPOEnabled}
                  onChange={(e) => handleToggleAutoPO(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                <span className="text-[11px] font-bold text-slate-700">Auto Draf PO Aktif</span>
              </label>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* TAB 1: PENGATURAN AMBANG BATAS STOK                                */}
        {/* =================================================================== */}
        {activeTab === 'THRESHOLDS' && (
          <div className="flex-1 flex flex-col min-h-0 pt-3 space-y-3">
            {/* Search & Bulk Preset */}
            <div className="space-y-2 shrink-0">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama barang atau barcode..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Quick Bulk Preset */}
                <div className="flex items-center gap-1.5 text-xs text-slate-600 self-end sm:self-center shrink-0">
                  <span className="text-[11px] font-semibold text-slate-400 hidden md:inline">Terapkan ke list ini:</span>
                  {[5, 10, 20, 50].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleApplyBulkCategory(num)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-800 text-slate-700 text-xs font-bold transition-colors"
                    >
                      Min {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      sound.playTap();
                      setSelectedCategory(cat);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white font-bold'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Low Stock Alert Callout if any */}
            {lowStockProducts.length > 0 && (
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-900 font-medium">
                    Ada <b>{lowStockProducts.length} produk</b> yang sudah mencapai atau di bawah batas minimum stok.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setActiveTab('AUTO_PO');
                  }}
                  className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Buat PO Sekarang</span>
                </button>
              </div>
            )}

            {/* Product Thresholds List */}
            <div className="flex-1 overflow-y-auto py-1 divide-y divide-slate-100 border-t border-b border-slate-100">
              {filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">
                  Tidak ada produk yang cocok dengan pencarian.
                </div>
              ) : (
                filteredProducts.map((p) => {
                  const currentThreshold = thresholds[p.id] ?? p.minStockAlert;
                  const isBelow = p.stockInBaseUnit <= currentThreshold;
                  const isZero = p.stockInBaseUnit <= 0;

                  return (
                    <div
                      key={p.id}
                      className="py-2.5 px-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center font-bold text-slate-500 text-xs">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            p.name.charAt(0)
                          )}
                        </div>
                        <div>
                          <div className="text-xs md:text-sm font-bold text-slate-900">{p.name}</div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                            <span>{p.category}</span>
                            <span>·</span>
                            <span className="font-mono">Satuan: {p.baseUnit}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stock Status & Threshold Stepper */}
                      <div className="flex items-center justify-between sm:justify-end gap-3">
                        {/* Current Stock */}
                        <div className="text-left sm:text-right">
                          <div className="text-[10px] text-slate-400">Stok Saat Ini</div>
                          <div className={`text-xs md:text-sm font-bold font-mono ${
                            isZero
                              ? 'text-rose-600 font-black'
                              : isBelow
                              ? 'text-amber-600'
                              : 'text-emerald-600'
                          }`}>
                            {formatNumber(p.stockInBaseUnit)} {p.baseUnit}
                          </div>
                        </div>

                        {/* Threshold Stepper */}
                        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              handleThresholdChange(p.id, currentThreshold - 5);
                            }}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shadow-2xs cursor-pointer"
                            title="-5"
                          >
                            -5
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              handleThresholdChange(p.id, currentThreshold - 1);
                            }}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shadow-2xs cursor-pointer"
                            title="-1"
                          >
                            -1
                          </button>

                          <div className="text-center px-1">
                            <input
                              type="number"
                              min="0"
                              value={currentThreshold}
                              onChange={(e) =>
                                handleThresholdChange(p.id, parseInt(e.target.value) || 0)
                              }
                              className="w-14 text-center p-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500"
                            />
                            <div className="text-[9px] text-slate-400 uppercase font-semibold">Min Alert</div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              handleThresholdChange(p.id, currentThreshold + 1);
                            }}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shadow-2xs cursor-pointer"
                            title="+1"
                          >
                            +1
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              handleThresholdChange(p.id, currentThreshold + 5);
                            }}
                            className="w-7 h-7 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs flex items-center justify-center shadow-2xs cursor-pointer"
                            title="+5"
                          >
                            +5
                          </button>
                        </div>

                        {/* Status Pill & Jump to PO */}
                        <div className="w-24 text-right shrink-0 flex flex-col items-end gap-1">
                          {isZero ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                              Habis
                            </span>
                          ) : isBelow ? (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              Menipis
                            </span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Aman
                            </span>
                          )}

                          {isBelow && (
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setActiveTab('AUTO_PO');
                              }}
                              className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 underline"
                            >
                              PO WhatsApp &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500">
                * Perubahan ambang batas tersimpan otomatis ke sistem dan cloud sync.
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onClose();
                  }}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="py-2.5 px-6 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Simpan Ambang Batas</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: AUTO-GENERATE PO & WHATSAPP TO SUPPLIER                     */}
        {/* =================================================================== */}
        {activeTab === 'AUTO_PO' && (
          <div className="flex-1 flex flex-col min-h-0 pt-3 space-y-3">
            {/* Supplier Selector Bar & Options */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 shrink-0 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-800">Pilih Supplier Tujuan:</span>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => {
                      sound.playTap();
                      setSelectedSupplierId(e.target.value);
                    }}
                    className="p-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ALL">Semua Supplier (Gabungan)</option>
                    {suppliers.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name} {sup.contactPerson ? `(${sup.contactPerson})` : ''} - {sup.whatsapp || sup.phone}
                      </option>
                    ))}
                  </select>
                </div>

                {activeSupplier && activeSupplier.suppliedCategories.length > 0 && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterSupplierCategories}
                      onChange={(e) => setFilterSupplierCategories(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Filter hanya kategori yang disuplai ({activeSupplier.suppliedCategories.join(', ')})</span>
                  </label>
                )}
              </div>

              {/* Active Supplier Contact Card if chosen */}
              {activeSupplier && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-1 border-t border-slate-200">
                  <span className="flex items-center gap-1 font-semibold text-slate-900">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    {activeSupplier.name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    WA: <b className="text-emerald-700">{activeSupplier.whatsapp || activeSupplier.phone}</b>
                  </span>
                  {activeSupplier.address && (
                    <span className="text-slate-400">
                      Alamat: {activeSupplier.address}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* List of Low Stock Items for PO */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white p-2">
              {poItems.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-700">Semua Stok Barang Aman!</p>
                  <p className="text-xs text-slate-400">
                    Tidak ada produk yang saat ini berada di bawah batas minimum stok.
                  </p>
                </div>
              ) : (
                poItems.map((item) => {
                  const p = item.product;
                  const isChecked = !item.isExcluded;

                  return (
                    <div
                      key={p.id}
                      className={`p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl transition-all ${
                        isChecked ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/60 opacity-50'
                      }`}
                    >
                      {/* Checkbox & Product Info */}
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleExclude(p.id)}
                          className="mt-1 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                        />
                        <div className="w-10 h-10 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center font-bold text-slate-500 text-xs">
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            p.name.charAt(0)
                          )}
                        </div>
                        <div>
                          <div className="text-xs md:text-sm font-bold text-slate-900">{p.name}</div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-medium bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                              {p.category}
                            </span>
                            <span>• Sisa: <b className="text-rose-600 font-mono">{formatNumber(item.currentStock)} {p.baseUnit}</b></span>
                            <span>• Batas Min: <b className="font-mono">{formatNumber(item.threshold)}</b></span>
                          </div>
                        </div>
                      </div>

                      {/* PO Controls: Unit Selector & Quantity Stepper */}
                      <div className="flex items-center justify-between md:justify-end gap-3 pl-7 md:pl-0">
                        {/* Packaging Unit Selector */}
                        <div className="flex flex-col items-start md:items-end">
                          <span className="text-[10px] text-slate-400">Satuan Order:</span>
                          {p.units.length > 1 ? (
                            <select
                              value={item.selectedUnitName}
                              onChange={(e) => handleUnitChange(p.id, e.target.value)}
                              disabled={!isChecked}
                              className="p-1 text-xs font-bold bg-slate-100 border border-slate-200 rounded-lg text-slate-800 focus:outline-none"
                            >
                              {p.units.map((u) => (
                                <option key={u.id} value={u.unitName}>
                                  {u.unitName} (x{u.conversionFactor} {p.baseUnit})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg">
                              {p.baseUnit}
                            </span>
                          )}
                        </div>

                        {/* Order Quantity Stepper */}
                        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                          <button
                            type="button"
                            disabled={!isChecked}
                            onClick={() => {
                              sound.playTap();
                              handleOrderQtyChange(p.id, item.orderQty - 1);
                            }}
                            className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center disabled:opacity-40 cursor-pointer shadow-2xs"
                          >
                            <Minus className="w-3 h-3" />
                          </button>

                          <input
                            type="number"
                            min="1"
                            value={item.orderQty}
                            disabled={!isChecked}
                            onChange={(e) => handleOrderQtyChange(p.id, parseInt(e.target.value) || 1)}
                            className="w-12 text-center p-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none disabled:opacity-40"
                          />

                          <button
                            type="button"
                            disabled={!isChecked}
                            onClick={() => {
                              sound.playTap();
                              handleOrderQtyChange(p.id, item.orderQty + 1);
                            }}
                            className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center disabled:opacity-40 cursor-pointer shadow-2xs"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Estimated Cost */}
                        <div className="text-right min-w-[100px]">
                          <div className="text-[10px] text-slate-400">Subtotal Estimasi</div>
                          <div className="text-xs font-bold text-slate-900 font-mono">
                            {formatRupiah(item.totalEstimatedCost)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Note & Summary Bar */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 shrink-0 space-y-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="text-xs text-slate-600 flex items-center gap-2">
                  <span className="font-bold text-slate-800">Catatan Tambahan untuk Supplier:</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-500">Total Produk: <b>{activePOItems.length} SKU</b></span>
                  <span className="text-slate-900 font-black">
                    Estimasi PO: <span className="font-mono text-emerald-700 text-sm">{formatRupiah(totalPOEstimatedCost)}</span>
                  </span>
                </div>
              </div>

              <input
                type="text"
                value={poNote}
                onChange={(e) => setPoNote(e.target.value)}
                placeholder="Tulis catatan (misal: Mohon kirim sebelum jam 11 siang, hubungi kasir saat tiba)..."
                className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Footer Buttons with WhatsApp, Copy, PDF */}
            <div className="pt-1 flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopyPOMessage}
                  disabled={activePOItems.length === 0}
                  className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
                  title="Salin isi pesan Purchase Order"
                >
                  {copiedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Salin Teks PO</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleExportPOPdf}
                  disabled={activePOItems.length === 0}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 cursor-pointer"
                  title="Unduh Draf PO Resmi dalam format PDF"
                >
                  <FileDown className="w-3.5 h-3.5 text-sky-400" />
                  <span>Ekspor PDF</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setActiveTab('THRESHOLDS');
                  }}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Kembali ke Batas Stok
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsAppPO}
                  disabled={activePOItems.length === 0}
                  className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-2 transition-all disabled:opacity-40 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 fill-white/20" />
                  <span>Kirim PO ke WhatsApp Supplier</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
