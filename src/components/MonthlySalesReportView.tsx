import React, { useState, useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  CalendarRange, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Percent, 
  Receipt, 
  FileDown, 
  ArrowUpRight, 
  ShoppingBag, 
  Sparkles, 
  Layers, 
  Printer, 
  Filter, 
  Award,
  ChevronRight,
  Download,
  CheckCircle2,
  X
} from 'lucide-react';
import { Transaction, Product, ProductCategory, UserRole, StoreSettings, CashflowRecord, RestockOrder, TaxRecord, TaxAdjustment, BalanceSheetEntry } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { exportStockAndProfitLossPdf } from '../utils/balanceSheetUtils';
import { addStandardPdfFooters, buildStoreContactLine, drawPdfStoreHeader } from '../utils/pdfLogoHelper';
import { INITIAL_STORE_SETTINGS } from '../utils/mockData';

interface MonthlySalesReportViewProps {
  transactions: Transaction[];
  products: Product[];
  categories?: ProductCategory[];
  storeName?: string;
  storeSettings?: StoreSettings;
  cashflows?: CashflowRecord[];
  purchases?: RestockOrder[];
  taxRecords?: TaxRecord[];
  taxAdjustments?: TaxAdjustment[];
  balanceSheetEntries?: BalanceSheetEntry[];
  currentUserRole?: UserRole;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'
];

export const MonthlySalesReportView: React.FC<MonthlySalesReportViewProps> = ({
  transactions,
  products,
  categories = [],
  storeName = 'KasirKu Tablet POS',
  storeSettings,
  cashflows = [],
  purchases = [],
  taxRecords = [],
  taxAdjustments = [],
  balanceSheetEntries = [],
  currentUserRole = 'ADMIN',
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedExportMonth, setSelectedExportMonth] = useState<number>(new Date().getMonth());
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [chartMetric, setChartMetric] = useState<'COMBINED' | 'REVENUE' | 'PROFIT' | 'TRANSACTIONS'>('COMBINED');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfExportNotice, setPdfExportNotice] = useState<string | null>(null);

  // Product map for category & COGS calculation
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Extract distinct product/service categories for filter dropdown
  const availableCategories = useMemo(() => {
    const catSet = new Set<string>();
    categories.forEach((c) => {
      if (c.name?.trim()) catSet.add(c.name.trim());
    });
    products.forEach((p) => {
      if (p.category?.trim()) catSet.add(p.category.trim());
      if (p.productType === 'JASA') catSet.add('Jasa');
    });
    transactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const cat = (prod?.category || (item.isService ? 'Jasa' : '')).trim();
        if (cat) catSet.add(cat);
      });
    });
    return Array.from(catSet).sort((a, b) => a.localeCompare(b, 'id'));
  }, [categories, products, transactions, productMap]);

  const selectedCategoryLabel = useMemo(() => {
    if (selectedCategory === 'ALL') return 'Semua Kategori';
    if (selectedCategory === 'ALL_BARANG') return 'Semua Produk Barang';
    if (selectedCategory === 'ALL_JASA') return 'Semua Layanan / Jasa';
    return selectedCategory;
  }, [selectedCategory]);

  // Extract available years from transaction timestamps
  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([currentYear, currentYear - 1]);
    transactions.forEach((tx) => {
      const yr = new Date(tx.timestamp).getFullYear();
      if (!isNaN(yr)) yearsSet.add(yr);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [transactions, currentYear]);

  // Filter transactions by selected year
  const yearTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const d = new Date(tx.timestamp);
      return d.getFullYear() === selectedYear;
    });
  }, [transactions, selectedYear]);

  // Calculate 12-month aggregated metrics (optionally scoped by product/service category)
  const monthlyData = useMemo(() => {
    const isFilteringCategory = selectedCategory !== 'ALL';
    const targetLower = selectedCategory.toLowerCase();

    const matchesCategory = (item: Transaction['items'][number], prod?: Product): boolean => {
      if (!isFilteringCategory) return true;
      const itemCat = (prod?.category || (item.isService ? 'Jasa' : 'Umum')).trim();
      const isJasa = Boolean(
        item.isService || prod?.productType === 'JASA' || itemCat.toLowerCase() === 'jasa'
      );
      if (selectedCategory === 'ALL_BARANG') return !isJasa;
      if (selectedCategory === 'ALL_JASA') return isJasa;
      if (targetLower === 'jasa') return isJasa || itemCat.toLowerCase() === 'jasa';
      return itemCat.toLowerCase() === targetLower;
    };

    // Initialize 12 months array
    const months = MONTH_NAMES.map((name, idx) => ({
      monthIndex: idx,
      monthName: name,
      shortName: SHORT_MONTH_NAMES[idx],
      year: selectedYear,
      transactionCount: 0,
      totalRevenue: 0,
      totalCOGS: 0,
      grossProfit: 0,
      grossMarginPercent: 0,
      averageBasket: 0,
      totalUnitsSold: 0,
      totalDiscount: 0,
      totalPointsExpense: 0,
    }));

    yearTransactions.forEach((tx) => {
      const txMonth = new Date(tx.timestamp).getMonth();
      const m = months[txMonth];
      if (!m) return;

      if (!isFilteringCategory) {
        m.transactionCount += 1;
        m.totalRevenue += tx.finalAmount;
        m.totalDiscount += tx.discount || 0;
        m.totalPointsExpense += tx.pointsDiscountAmount || 0;

        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const units = item.quantity * (item.conversionFactor || 1);
          m.totalUnitsSold += units;
          m.totalCOGS += getItemFifoCogs(item, prod);
        });
        return;
      }

      const matchingItems = tx.items.filter((item) =>
        matchesCategory(item, productMap.get(item.productId))
      );
      if (matchingItems.length === 0) return;

      const matchingGross = matchingItems.reduce((sum, it) => sum + (it.totalAmount || 0), 0);
      const netRatio = tx.subtotal > 0 ? tx.finalAmount / tx.subtotal : 1;
      const itemShareRatio =
        tx.subtotal > 0
          ? Math.min(1, matchingGross / tx.subtotal)
          : matchingItems.length / Math.max(1, tx.items.length);

      m.transactionCount += 1;
      m.totalRevenue += Math.round(matchingGross * netRatio);
      m.totalDiscount += Math.round((tx.discount || 0) * itemShareRatio);
      m.totalPointsExpense += Math.round((tx.pointsDiscountAmount || 0) * itemShareRatio);

      matchingItems.forEach((item) => {
        const prod = productMap.get(item.productId);
        const units = item.quantity * (item.conversionFactor || 1);
        m.totalUnitsSold += units;
        m.totalCOGS += getItemFifoCogs(item, prod);
      });
    });

    // Compute derived metrics
    let maxRevenue = 0;
    months.forEach((m) => {
      m.grossProfit = m.totalRevenue - m.totalCOGS;
      m.grossMarginPercent = m.totalRevenue > 0 ? (m.grossProfit / m.totalRevenue) * 100 : 0;
      m.averageBasket = m.transactionCount > 0 ? m.totalRevenue / m.transactionCount : 0;
      if (m.totalRevenue > maxRevenue) maxRevenue = m.totalRevenue;
    });

    return months;
  }, [yearTransactions, selectedYear, selectedCategory, productMap]);

  // Annual Totals
  const annualSummary = useMemo(() => {
    const totalRevenue = monthlyData.reduce((acc, m) => acc + m.totalRevenue, 0);
    const totalCOGS = monthlyData.reduce((acc, m) => acc + m.totalCOGS, 0);
    const totalProfit = totalRevenue - totalCOGS;
    const totalTransactions = monthlyData.reduce((acc, m) => acc + m.transactionCount, 0);
    const totalUnits = monthlyData.reduce((acc, m) => acc + m.totalUnitsSold, 0);
    const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgBasket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Find best performing month
    let bestMonth = monthlyData[0];
    monthlyData.forEach((m) => {
      if (m.totalRevenue > (bestMonth?.totalRevenue || 0)) {
        bestMonth = m;
      }
    });

    return {
      totalRevenue,
      totalCOGS,
      totalProfit,
      totalTransactions,
      totalUnits,
      avgMargin,
      avgBasket,
      bestMonth: bestMonth && bestMonth.totalRevenue > 0 ? bestMonth : null,
    };
  }, [monthlyData]);

  // Chart data format
  const chartData = useMemo(() => {
    return monthlyData.map((m) => ({
      name: m.shortName,
      fullName: m.monthName,
      Omzet: m.totalRevenue,
      Laba: m.grossProfit,
      HPP: m.totalCOGS,
      Transaksi: m.transactionCount,
      Margin: Math.round(m.grossMarginPercent * 10) / 10,
    }));
  }, [monthlyData]);

  // Export Annual Monthly Summary PDF with Store Logo
  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    sound.playTap();
    setIsExportingPdf(true);
    setPdfExportNotice(null);
    try {
      const effectiveSettings = storeSettings || { ...INITIAL_STORE_SETTINGS, storeName };
      const doc = new jsPDF({ orientation: 'landscape' });
      const dateFormatted = new Date().toLocaleDateString('id-ID', { dateStyle: 'full' });

      const { bannerHeight } = await drawPdfStoreHeader({
        doc,
        title: `LAPORAN KEUANGAN & PENJUALAN BULANAN TAHUN ${selectedYear}`,
        subtitle: `${(effectiveSettings.storeName || storeName).toUpperCase()} · Filter Kategori: ${selectedCategoryLabel}`,
        contactLine: buildStoreContactLine(effectiveSettings),
        rightTopText: `Total Omzet: ${formatRupiah(annualSummary.totalRevenue)}`,
        rightBottomText: `Laba Kotor: ${formatRupiah(annualSummary.totalProfit)} · Dicetak: ${dateFormatted}`,
        storeSettings: effectiveSettings,
        bannerColor: [15, 23, 42],
        accentStripeColor: [79, 70, 229],
        bannerHeight: 28,
      });

      const tableData = monthlyData.map((m, idx) => [
        (idx + 1).toString(),
        m.monthName,
        `${formatNumber(m.transactionCount)} Nota`,
        formatRupiah(m.totalRevenue),
        formatRupiah(m.totalCOGS),
        formatRupiah(m.grossProfit),
        `${m.grossMarginPercent.toFixed(1)}%`,
        formatRupiah(m.averageBasket),
        `${formatNumber(m.totalUnitsSold)} Unit`,
      ]);

      autoTable(doc, {
        startY: bannerHeight + 5,
        margin: { left: 14, right: 14 },
        head: [
          [
            'No',
            'Bulan',
            'Jumlah Transaksi',
            'Total Omzet (Revenue)',
            'Beban HPP (COGS)',
            'Laba Kotor (Profit)',
            'Margin (%)',
            'Rata-rata Nota',
            'Barang Terjual',
          ],
        ],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [15, 23, 42],
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

      const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 120;
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(
        `RINGKASAN TAHUN ${selectedYear} (${selectedCategoryLabel}): Total Omzet ${formatRupiah(annualSummary.totalRevenue)} | Total Laba Kotor ${formatRupiah(annualSummary.totalProfit)} (Margin ${annualSummary.avgMargin.toFixed(1)}%)`,
        14,
        finalY + 8
      );

      addStandardPdfFooters(doc, `${effectiveSettings.storeName || storeName} — Rekapitulasi Penjualan Tahunan ${selectedYear}`);

      const catSlug =
        selectedCategory === 'ALL'
          ? 'semua-kategori'
          : selectedCategory.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const filename = `laporan-penjualan-bulanan-${selectedYear}-${catSlug}.pdf`;
      doc.save(filename);
      sound.playSuccessChime();
      setPdfExportNotice(`Rekap Penjualan Tahunan (${filename}) berhasil diunduh.`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Export Executive Monthly Profit & Loss + Stock Report PDF with Store Logo
  const handleExportOwnerMonthlyPnlAndStockPdf = async () => {
    if (isExportingPdf) return;
    sound.playTap();
    setIsExportingPdf(true);
    setPdfExportNotice(null);
    try {
      const effectiveSettings = storeSettings || { ...INITIAL_STORE_SETTINGS, storeName };
      const periodMonth = `${selectedYear}-${String(selectedExportMonth + 1).padStart(2, '0')}`;
      const { filename } = await exportStockAndProfitLossPdf({
        periodMonth,
        transactions,
        products,
        purchases,
        cashflows,
        taxRecords,
        taxAdjustments,
        manualEntries: balanceSheetEntries,
        storeSettings: effectiveSettings,
        preparedBy: currentUserRole === 'ADMIN' ? 'Admin' : 'Store Manager',
      });
      sound.playSuccessChime();
      setPdfExportNotice(`Laporan PDF Ringkasan Laba Rugi Bulanan & Stok (${filename}) berhasil diunduh.`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        
        {/* Top Header Card */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
              <CalendarRange className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-slate-900">
                Laporan Penjualan Bulanan (Monthly Sales Report)
              </h2>
              <p className="text-xs text-slate-500">
                Rekapitulasi total omzet pendapatan, estimasi laba kotor, dan volume transaksi per bulan.
              </p>
            </div>
          </div>

          {/* Category Filter, Year Selector & Export Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <Filter className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              <span className="whitespace-nowrap">Kategori:</span>
              <select
                value={selectedCategory}
                aria-label="Filter Kategori Laporan Bulanan"
                onChange={(e) => {
                  sound.playTap();
                  setSelectedCategory(e.target.value);
                }}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer max-w-[180px]"
              >
                <option value="ALL">Semua Kategori</option>
                <option value="ALL_BARANG">Semua Produk Barang</option>
                <option value="ALL_JASA">Semua Layanan / Jasa</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {selectedCategory !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setSelectedCategory('ALL');
                  }}
                  className="ml-1 text-[11px] font-bold text-sky-700 hover:text-sky-900 underline whitespace-nowrap cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <Calendar className="w-3.5 h-3.5 text-indigo-600" />
              <span>Tahun:</span>
              <select
                value={selectedYear}
                aria-label="Pilih Tahun Laporan Bulanan"
                onChange={(e) => {
                  sound.playTap();
                  setSelectedYear(parseInt(e.target.value));
                }}
                className="bg-transparent font-bold font-mono text-slate-900 focus:outline-none cursor-pointer"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700">
              <CalendarRange className="w-3.5 h-3.5 text-emerald-600" />
              <span>Bulan PDF:</span>
              <select
                value={selectedExportMonth}
                aria-label="Pilih Bulan untuk Ekspor PDF Laba Rugi dan Stok"
                onChange={(e) => {
                  sound.playTap();
                  setSelectedExportMonth(parseInt(e.target.value, 10));
                }}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleExportOwnerMonthlyPnlAndStockPdf}
              disabled={isExportingPdf}
              className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs transition-colors cursor-pointer"
              title="Unduh PDF Ringkasan Laba Rugi Bulanan & Laporan Stok dengan Logo Toko untuk Pemilik Bisnis"
            >
              <Download className="w-3.5 h-3.5 text-emerald-200" />
              <span>{isExportingPdf ? 'Menyusun PDF...' : 'PDF Laba Rugi & Stok'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-xs transition-colors cursor-pointer"
              title="Unduh Rekap Penjualan Tahunan ke PDF dengan Logo Toko"
            >
              <FileDown className="w-3.5 h-3.5 text-sky-400" />
              <span>PDF Tahunan</span>
            </button>
          </div>
        </div>

        {pdfExportNotice && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{pdfExportNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setPdfExportNotice(null)}
              className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-700 cursor-pointer"
              aria-label="Tutup notifikasi PDF"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 4 Annual Summary Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Total Omzet Tahun {selectedYear}</span>
              <DollarSign className="w-3.5 h-3.5 text-sky-600" />
            </div>
            <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1 tabular-nums">
              {formatRupiah(annualSummary.totalRevenue)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">
              {selectedCategory === 'ALL' ? 'Akumulasi 12 bulan kalender' : `Kategori: ${selectedCategoryLabel}`}
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/70 p-4 rounded-2xl border border-emerald-200 shadow-2xs">
            <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center justify-between">
              <span>Total Laba Kotor Tahunan</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-xl md:text-2xl font-black text-emerald-700 font-mono mt-1 tabular-nums">
              {formatRupiah(annualSummary.totalProfit)}
            </div>
            <div className="text-[10px] text-emerald-800 mt-0.5 font-medium">
              Margin rata-rata: {annualSummary.avgMargin.toFixed(1)}%
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Jumlah Transaksi Kasir</span>
              <Receipt className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-xl md:text-2xl font-black text-indigo-700 font-mono mt-1 tabular-nums">
              {formatNumber(annualSummary.totalTransactions)} <span className="text-xs font-normal text-slate-500">Nota</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Rata-rata {formatRupiah(annualSummary.avgBasket)} / nota
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Bulan Penjualan Terbaik</span>
              <Award className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-base md:text-lg font-black text-slate-900 mt-1 truncate">
              {annualSummary.bestMonth ? annualSummary.bestMonth.monthName : 'Belum Ada Transaksi'}
            </div>
            <div className="text-[10px] text-amber-700 font-mono font-bold mt-0.5">
              {annualSummary.bestMonth ? formatRupiah(annualSummary.bestMonth.totalRevenue) : '-'}
            </div>
          </div>
        </div>

        {/* Visual Monthly Performance Chart (Recharts) */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Grafik Tren Omzet &amp; Laba Per Bulan (Tahun {selectedYear} • {selectedCategoryLabel})
              </h3>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setChartMetric('COMBINED');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  chartMetric === 'COMBINED' ? 'bg-white text-indigo-900 font-bold shadow-2xs' : 'text-slate-600'
                }`}
              >
                Omzet &amp; Laba
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setChartMetric('REVENUE');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  chartMetric === 'REVENUE' ? 'bg-white text-sky-900 font-bold shadow-2xs' : 'text-slate-600'
                }`}
              >
                Hanya Omzet
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setChartMetric('TRANSACTIONS');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  chartMetric === 'TRANSACTIONS' ? 'bg-white text-indigo-900 font-bold shadow-2xs' : 'text-slate-600'
                }`}
              >
                Volume Nota
              </button>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartMetric === 'TRANSACTIONS' ? (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: any) => [`${formatNumber(val)} Nota`, 'Transaksi']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Bar dataKey="Transaksi" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748b' }} 
                    axisLine={false} 
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [formatRupiah(val), name]}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  {(chartMetric === 'COMBINED' || chartMetric === 'REVENUE') && (
                    <Bar dataKey="Omzet" fill="#0284c7" radius={[6, 6, 0, 0]} />
                  )}
                  {chartMetric === 'COMBINED' && (
                    <Bar dataKey="Laba" fill="#059669" radius={[6, 6, 0, 0]} />
                  )}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Monthly Data Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Receipt className="w-4 h-4 text-sky-400" />
                <span>Tabel Rincian Kinerja Penjualan Bulanan (12 Bulan)</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Kalkulasi transaksi tahun {selectedYear} untuk filter: {selectedCategoryLabel}.
              </p>
            </div>
            <span className="text-xs text-sky-300 font-mono font-bold bg-white/10 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">
              {annualSummary.totalTransactions} Transaksi
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Bulan</th>
                  <th className="py-3 px-4 text-center">Jumlah Transaksi</th>
                  <th className="py-3 px-4 text-right">Total Omzet</th>
                  <th className="py-3 px-4 text-right">Beban Pokok (HPP)</th>
                  <th className="py-3 px-4 text-right">Laba Kotor</th>
                  <th className="py-3 px-4 text-right">Margin (%)</th>
                  <th className="py-3 px-4 text-right">Rata-rata Nota</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyData.map((m) => {
                  const isBest = annualSummary.bestMonth && annualSummary.bestMonth.monthIndex === m.monthIndex && m.totalRevenue > 0;
                  const hasSales = m.transactionCount > 0;

                  return (
                    <tr key={m.monthIndex} className={`hover:bg-slate-50/80 transition-colors ${isBest ? 'bg-amber-50/40' : ''}`}>
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span>{m.monthName}</span>
                        {isBest && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-black uppercase flex items-center gap-0.5 border border-amber-300">
                            <Award className="w-3 h-3 text-amber-600" />
                            <span>Terbaik</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-700">
                        {m.transactionCount > 0 ? `${formatNumber(m.transactionCount)} Nota` : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {hasSales ? formatRupiah(m.totalRevenue) : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-rose-700 tabular-nums">
                        {hasSales ? formatRupiah(m.totalCOGS) : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                        {hasSales ? formatRupiah(m.grossProfit) : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-black text-indigo-700 tabular-nums">
                        {hasSales ? `${m.grossMarginPercent.toFixed(1)}%` : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-600 tabular-nums">
                        {hasSales ? formatRupiah(m.averageBasket) : '-'}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {hasSales ? (
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.grossMarginPercent >= 30
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.grossMarginPercent >= 15
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {m.grossMarginPercent >= 30 ? 'Margin Tinggi' : m.grossMarginPercent >= 15 ? 'Normal' : 'Tipis'}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Belum ada data</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};
