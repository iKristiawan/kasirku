import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileDown,
  Search,
  TrendingUp,
  ShoppingBag,
  Receipt,
  Award,
  Layers,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { Product, ProductCategory, Transaction } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  SalesReportPeriodType,
  SalesReportSortBy,
  formatLocalDateYmd,
  generateSalesReport,
  parseLocalYmd,
} from '../utils/salesReport';

interface SalesReportViewProps {
  transactions: Transaction[];
  products: Product[];
  categories?: ProductCategory[];
  storeName?: string;
}

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Tunai (Cash)',
  QRIS_BCA: 'QRIS',
  EDC_BCA: 'Kartu Debit / Kredit',
  TRANSFER_BCA: 'Transfer Bank',
  PIUTANG: 'Piutang / Tempo',
};

function formatPaymentLabel(method: string): string {
  const upper = String(method || 'CASH').toUpperCase();
  return PAYMENT_LABELS[upper] || method;
}

export const SalesReportView: React.FC<SalesReportViewProps> = ({
  transactions,
  products,
  categories = [],
  storeName = 'KasirKu Tablet POS',
}) => {
  const now = new Date();
  const todayStr = formatLocalDateYmd(now);

  const [periodType, setPeriodType] = useState<SalesReportPeriodType>('HARIAN');
  const [anchorDate, setAnchorDate] = useState<string>(todayStr);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return formatLocalDateYmd(d);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SalesReportSortBy>('QUANTITY');
  const [chartMetric, setChartMetric] = useState<'COMBINED' | 'REVENUE' | 'TRANSACTIONS'>('COMBINED');
  const [showAllProducts, setShowAllProducts] = useState<boolean>(false);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    categories.forEach((c) => {
      if (c.name?.trim()) set.add(c.name.trim());
    });
    products.forEach((p) => {
      if (p.category?.trim()) set.add(p.category.trim());
      if (p.productType === 'JASA') set.add('Jasa');
    });
    transactions.forEach((tx) => {
      (tx.items || []).forEach((it) => {
        const p = productMap.get(it.productId);
        const cat = (p?.category || (it.isService ? 'Jasa' : '')).trim();
        if (cat) set.add(cat);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [categories, products, transactions, productMap]);

  const availablePaymentMethods = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.paymentMethod) {
        set.add(String(tx.paymentMethod).toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [transactions]);

  const availableYears = useMemo(() => {
    const set = new Set<number>([now.getFullYear(), now.getFullYear() - 1]);
    transactions.forEach((tx) => {
      const yr = new Date(tx.timestamp).getFullYear();
      if (!Number.isNaN(yr)) set.add(yr);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [transactions, now]);

  const report = useMemo(() => {
    return generateSalesReport({
      transactions,
      products,
      periodType,
      anchorDate,
      startDate: customStartDate,
      endDate: customEndDate,
      month: selectedMonth,
      year: selectedYear,
      categoryFilter,
      paymentMethodFilter: paymentFilter,
      searchQuery,
      sortBy,
    });
  }, [
    transactions,
    products,
    periodType,
    anchorDate,
    customStartDate,
    customEndDate,
    selectedMonth,
    selectedYear,
    categoryFilter,
    paymentFilter,
    searchQuery,
    sortBy,
  ]);

  const visibleProducts = useMemo(() => {
    if (showAllProducts) return report.bestSellingProducts;
    return report.bestSellingProducts.slice(0, 15);
  }, [report.bestSellingProducts, showAllProducts]);

  const topOneProduct = report.bestSellingProducts[0] || null;

  const chartData = useMemo(() => {
    if (report.range.type === 'HARIAN') {
      // Display core operational hours (06:00 - 23:00) plus any outside hours with sales
      const activeOrCore = report.trendSeries.filter((pt) => {
        const hr = Number(pt.key);
        return (hr >= 6 && hr <= 23) || pt.pendapatan > 0 || pt.transaksi > 0;
      });
      return activeOrCore.map((pt) => ({
        name: pt.label,
        fullLabel: pt.fullLabel,
        Pendapatan: pt.pendapatan,
        Keuntungan: pt.keuntunganKotor,
        Transaksi: pt.transaksi,
      }));
    }
    return report.trendSeries.map((pt) => ({
      name: pt.label,
      fullLabel: pt.fullLabel,
      Pendapatan: pt.pendapatan,
      Keuntungan: pt.keuntunganKotor,
      Transaksi: pt.transaksi,
    }));
  }, [report.trendSeries, report.range.type]);

  const handleStepPeriod = (direction: -1 | 1) => {
    sound.playTap();
    if (periodType === 'HARIAN') {
      const dt = parseLocalYmd(anchorDate);
      dt.setDate(dt.getDate() + direction);
      setAnchorDate(formatLocalDateYmd(dt));
    } else if (periodType === 'MINGGUAN') {
      const dt = parseLocalYmd(anchorDate);
      dt.setDate(dt.getDate() + direction * 7);
      setAnchorDate(formatLocalDateYmd(dt));
    } else if (periodType === 'BULANAN') {
      const d = new Date(selectedYear, selectedMonth + direction, 1);
      setSelectedMonth(d.getMonth());
      setSelectedYear(d.getFullYear());
    } else {
      const spanDays = report.range.daysCount;
      const start = parseLocalYmd(report.range.startDateStr);
      const end = parseLocalYmd(report.range.endDateStr);
      start.setDate(start.getDate() + direction * spanDays);
      end.setDate(end.getDate() + direction * spanDays);
      setCustomStartDate(formatLocalDateYmd(start));
      setCustomEndDate(formatLocalDateYmd(end));
    }
  };

  const handleResetToCurrentPeriod = () => {
    sound.playTap();
    const fresh = new Date();
    const freshYmd = formatLocalDateYmd(fresh);
    setAnchorDate(freshYmd);
    setSelectedMonth(fresh.getMonth());
    setSelectedYear(fresh.getFullYear());
    const weekAgo = new Date(fresh);
    weekAgo.setDate(weekAgo.getDate() - 6);
    setCustomStartDate(formatLocalDateYmd(weekAgo));
    setCustomEndDate(freshYmd);
  };

  const handleExportCsv = () => {
    sound.playTap();
    const esc = (val: string | number) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const lines: string[] = [
      `Laporan Penjualan,${esc(storeName)}`,
      `Periode,${esc(report.range.label)}`,
      `Rentang Tanggal,${report.range.startDateStr} s/d ${report.range.endDateStr}`,
      `Total Pendapatan,${report.summary.totalRevenue}`,
      `Estimasi HPP,${report.summary.totalEstimatedCogs}`,
      `Estimasi Keuntungan Kotor,${report.summary.estimatedGrossProfit}`,
      `Margin Kotor (%),${report.summary.grossMarginPercent.toFixed(2)}%`,
      `Jumlah Transaksi,${report.summary.transactionCount}`,
      `Total Kuantitas Terjual (Satuan Dasar),${report.summary.totalUnitsSold}`,
      '',
      'Peringkat,Nama Produk,Kategori,Kuantitas Terjual (Dasar),Rincian Satuan,Jumlah Transaksi,Total Penjualan (Rp),Estimasi HPP (Rp),Est. Keuntungan Kotor (Rp),Margin (%),Kontribusi Omzet (%)',
    ];

    report.bestSellingProducts.forEach((p) => {
      lines.push(
        [
          p.rank,
          esc(p.productName),
          esc(p.category),
          p.totalQuantitySold,
          esc(p.unitBreakdownLabel),
          p.transactionCount,
          p.totalSales,
          p.estimatedCogs,
          p.estimatedGrossProfit,
          `${p.grossMarginPercent.toFixed(1)}%`,
          `${p.revenueSharePercent.toFixed(1)}%`,
        ].join(',')
      );
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan-Penjualan-${report.range.startDateStr}_${report.range.endDateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPdf = () => {
    sound.playTap();
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(15);
    doc.text(`Laporan Penjualan — ${storeName}`, 14, 16);
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Periode: ${report.range.label} (${report.range.startDateStr} s/d ${report.range.endDateStr})`, 14, 22);
    doc.text(
      `Dicetak: ${new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}`,
      14,
      27
    );

    autoTable(doc, {
      startY: 32,
      head: [['Ringkasan Kinerja Penjualan', 'Nilai']],
      body: [
        ['Total Pendapatan Bersih', formatRupiah(report.summary.totalRevenue)],
        ['Estimasi Beban Pokok (HPP FIFO)', formatRupiah(report.summary.totalEstimatedCogs)],
        [
          'Estimasi Keuntungan Kotor',
          `${formatRupiah(report.summary.estimatedGrossProfit)} (${report.summary.grossMarginPercent.toFixed(1)}%)`,
        ],
        [
          'Total Transaksi / Rata-rata Nota',
          `${formatNumber(report.summary.transactionCount)} Nota · ${formatRupiah(report.summary.averageBasket)}/nota`,
        ],
        [
          'Total Kuantitas Terjual',
          `${formatNumber(report.summary.totalUnitsSold)} Unit (${formatNumber(report.summary.uniqueProductsSold)} Produk Berbeda)`,
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42] },
      styles: { fontSize: 9, cellPadding: 2.5 },
    });

    const summaryEndY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 78;

    autoTable(doc, {
      startY: summaryEndY + 6,
      head: [['#', 'Produk Terlaris', 'Kategori', 'Qty', 'Total Penjualan', 'Est. Laba Kotor', 'Margin']],
      body:
        report.bestSellingProducts.length > 0
          ? report.bestSellingProducts.slice(0, 40).map((item) => [
              item.rank,
              item.productName,
              item.category,
              item.unitBreakdownLabel,
              formatRupiah(item.totalSales),
              formatRupiah(item.estimatedGrossProfit),
              `${item.grossMarginPercent.toFixed(1)}%`,
            ])
          : [['-', 'Belum ada penjualan pada rentang tanggal ini', '-', '-', '-', '-', '-']],
      theme: 'striped',
      headStyles: { fillColor: [2, 132, 199] },
      styles: { fontSize: 8.2, cellPadding: 2.2 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    });

    doc.save(`Laporan-Penjualan-${report.range.startDateStr}_${report.range.endDateStr}.pdf`);
  };

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-100 overflow-y-auto font-sans">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-5">
        {/* Header & Primary Controls */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
                Laporan Penjualan
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{report.range.label}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {report.range.startDateStr === report.range.endDateStr
                    ? report.range.startDateStr
                    : `${report.range.startDateStr} s/d ${report.range.endDateStr}`}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{report.range.daysCount} hari</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={handleExportCsv}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4 text-slate-600" />
                <span>Ekspor CSV</span>
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <FileDown className="w-4 h-4 text-sky-400" />
                <span>Unduh PDF</span>
              </button>
            </div>
          </div>

          {/* Period Segmented Tabs + Date Range Picker */}
          <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Segmented Mode Selector */}
            <div
              role="tablist"
              aria-label="Rentang Laporan Penjualan"
              className="grid grid-cols-4 sm:inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl"
            >
              {(
                [
                  { id: 'HARIAN', label: 'Harian' },
                  { id: 'MINGGUAN', label: 'Mingguan' },
                  { id: 'BULANAN', label: 'Bulanan' },
                  { id: 'KUSTOM', label: 'Kustom' },
                ] as Array<{ id: SalesReportPeriodType; label: string }>
              ).map((tab) => {
                const isActive = periodType === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      sound.playTap();
                      setPeriodType(tab.id);
                    }}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-2xs font-bold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Active Date Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleStepPeriod(-1)}
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center cursor-pointer"
                title="Periode sebelumnya"
                aria-label="Periode sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              {(periodType === 'HARIAN' || periodType === 'MINGGUAN') && (
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 min-h-[40px]">
                  <Calendar className="w-4 h-4 text-sky-600 shrink-0" />
                  <input
                    type="date"
                    value={anchorDate}
                    onChange={(e) => {
                      sound.playTap();
                      if (e.target.value) setAnchorDate(e.target.value);
                    }}
                    aria-label={periodType === 'HARIAN' ? 'Pilih tanggal harian' : 'Pilih tanggal dalam minggu'}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none font-mono"
                  />
                </div>
              )}

              {periodType === 'BULANAN' && (
                <div className="flex items-center gap-2">
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      sound.playTap();
                      setSelectedMonth(Number(e.target.value));
                    }}
                    aria-label="Pilih bulan"
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    {MONTH_NAMES.map((mName, idx) => (
                      <option key={mName} value={idx}>
                        {mName}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={(e) => {
                      sound.playTap();
                      setSelectedYear(Number(e.target.value));
                    }}
                    aria-label="Pilih tahun"
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-800 font-mono focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    {availableYears.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {periodType === 'KUSTOM' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 min-h-[40px]">
                    <span className="text-[11px] font-medium text-slate-500">Dari</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => {
                        sound.playTap();
                        if (e.target.value) setCustomStartDate(e.target.value);
                      }}
                      aria-label="Tanggal mulai"
                      className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none font-mono"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 min-h-[40px]">
                    <span className="text-[11px] font-medium text-slate-500">Sampai</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => {
                        sound.playTap();
                        if (e.target.value) setCustomEndDate(e.target.value);
                      }}
                      aria-label="Tanggal akhir"
                      className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none font-mono"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => handleStepPeriod(1)}
                className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 inline-flex items-center justify-center cursor-pointer"
                title="Periode berikutnya"
                aria-label="Periode berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleResetToCurrentPeriod}
                className="min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Hari Ini</span>
              </button>
            </div>
          </div>

          {/* Secondary Filter Bar: Category + Payment + Product Search */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="relative">
              <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={categoryFilter}
                onChange={(e) => {
                  sound.playTap();
                  setCategoryFilter(e.target.value);
                }}
                aria-label="Filter kategori produk"
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="ALL">Semua Kategori Produk</option>
                <option value="ALL_BARANG">Hanya Produk Barang</option>
                <option value="ALL_JASA">Hanya Layanan / Jasa</option>
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    Kategori: {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={paymentFilter}
                onChange={(e) => {
                  sound.playTap();
                  setPaymentFilter(e.target.value);
                }}
                aria-label="Filter metode pembayaran"
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="ALL">Semua Metode Pembayaran</option>
                {availablePaymentMethods.map((m) => (
                  <option key={m} value={m}>
                    {formatPaymentLabel(m)}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama produk terlaris..."
                className="w-full min-h-[40px] pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        </div>

        {/* 4-Column KPI Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Total Pendapatan</span>
              <Receipt className="w-4 h-4 text-sky-600 shrink-0" />
            </div>
            <div className="text-xl md:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
              {formatRupiah(report.summary.totalRevenue)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap tabular-nums">
              <span>{formatNumber(report.summary.transactionCount)} transaksi</span>
              <span aria-hidden="true">·</span>
              <span>Rata-rata {formatRupiah(report.summary.averageBasket)}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Estimasi Keuntungan Kotor</span>
              <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <div
              className={`text-xl md:text-2xl font-bold font-mono tabular-nums mt-1.5 ${
                report.summary.estimatedGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatRupiah(report.summary.estimatedGrossProfit)}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap tabular-nums">
              <span className="font-semibold text-emerald-700">
                Margin {report.summary.grossMarginPercent.toFixed(1)}%
              </span>
              <span aria-hidden="true">·</span>
              <span>HPP {formatRupiah(report.summary.totalEstimatedCogs)}</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Total Kuantitas Terjual</span>
              <ShoppingBag className="w-4 h-4 text-indigo-600 shrink-0" />
            </div>
            <div className="text-xl md:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1.5">
              {formatNumber(report.summary.totalUnitsSold)} <span className="text-xs font-medium text-slate-500">Unit</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap tabular-nums">
              <span>{formatNumber(report.summary.uniqueProductsSold)} produk terjual</span>
              {report.summary.totalDiscountAndPoints > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Diskon {formatRupiah(report.summary.totalDiscountAndPoints)}</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span>Produk Terlaris #1</span>
              <Award className="w-4 h-4 text-amber-600 shrink-0" />
            </div>
            <div className="text-base md:text-lg font-bold text-slate-900 truncate mt-1.5">
              {topOneProduct ? topOneProduct.productName : 'Belum ada data'}
            </div>
            <div className="mt-1 text-[11px] text-slate-600 font-mono tabular-nums truncate">
              {topOneProduct
                ? `${topOneProduct.unitBreakdownLabel} · ${formatRupiah(topOneProduct.totalSales)}`
                : 'Belum ada transaksi di periode ini'}
            </div>
          </div>
        </div>

        {/* Empty State or Analytics & Best-Selling Products */}
        {report.summary.transactionCount === 0 ? (
          <div className="bg-white p-8 md:p-10 rounded-2xl border border-slate-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">
              Belum ada penjualan pada rentang tanggal ini
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
              Transaksi untuk {report.range.label} belum tercatat atau tidak cocok dengan filter kategori dan metode pembayaran yang dipilih.
            </p>
            <div className="pt-1 flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setPeriodType('BULANAN');
                  setSelectedMonth(now.getMonth());
                  setSelectedYear(now.getFullYear());
                  setCategoryFilter('ALL');
                  setPaymentFilter('ALL');
                  setSearchQuery('');
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Tampilkan Bulan Ini
              </button>
              {(categoryFilter !== 'ALL' || paymentFilter !== 'ALL' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setCategoryFilter('ALL');
                    setPaymentFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Trend Chart & Payment Summary Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              <div className="lg:col-span-2 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 flex flex-col justify-between gap-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      {report.range.type === 'HARIAN'
                        ? 'Tren Penjualan Per Jam'
                        : 'Tren Pendapatan & Keuntungan Kotor Harian'}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Perbandingan nilai omzet kotor setelah diskon dan estimasi keuntungan kotor (FIFO)
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold self-start sm:self-auto">
                    {(
                      [
                        { id: 'COMBINED', label: 'Omzet & Laba' },
                        { id: 'REVENUE', label: 'Pendapatan' },
                        { id: 'TRANSACTIONS', label: 'Jumlah Nota' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setChartMetric(opt.id);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          chartMetric === opt.id
                            ? 'bg-white text-slate-900 font-bold shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-64 sm:h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    {chartMetric === 'TRANSACTIONS' ? (
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10.5, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 10.5, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          formatter={(val: unknown) => [`${formatNumber(Number(val) || 0)} Nota`, 'Transaksi']}
                          labelFormatter={(_label, payload) =>
                            payload?.[0]?.payload?.fullLabel || String(_label || '')
                          }
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="Transaksi" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    ) : (
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10.5, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10.5, fill: '#64748b' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) =>
                            v >= 1000000
                              ? `${(v / 1000000).toFixed(1)}M`
                              : v >= 1000
                              ? `${(v / 1000).toFixed(0)}k`
                              : String(v)
                          }
                        />
                        <Tooltip
                          formatter={(val: unknown, name: unknown) => [
                            formatRupiah(Number(val) || 0),
                            String(name || ''),
                          ]}
                          labelFormatter={(_label, payload) =>
                            payload?.[0]?.payload?.fullLabel || String(_label || '')
                          }
                          contentStyle={{
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            fontSize: '12px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                        <Bar dataKey="Pendapatan" fill="#0284c7" radius={[6, 6, 0, 0]} />
                        {chartMetric === 'COMBINED' && (
                          <Bar
                            dataKey="Keuntungan"
                            name="Est. Keuntungan Kotor"
                            fill="#059669"
                            radius={[6, 6, 0, 0]}
                          />
                        )}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Payment Method Breakdown */}
              <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 flex flex-col justify-between gap-3">
                <div>
                  <div className="pb-3 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">
                      Ringkasan Metode Pembayaran
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Distribusi pendapatan per kanal pembayaran
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100 mt-2">
                    {report.paymentBreakdown.map((pm) => (
                      <div key={pm.method} className="py-2.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-800 truncate">
                            {formatPaymentLabel(pm.method)}
                          </span>
                          <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                            {formatRupiah(pm.totalAmount)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-600 rounded-full"
                            style={{ width: `${Math.min(100, Math.max(3, pm.sharePercent))}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                          <span>{formatNumber(pm.transactionCount)} transaksi</span>
                          <span className="font-mono">{pm.sharePercent.toFixed(1)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1">
                  <div className="flex justify-between tabular-nums">
                    <span>Akurasi HPP Berbasis Batch FIFO</span>
                    <span className="font-mono font-semibold text-slate-700">
                      {report.summary.fifoVerifiedSharePercent.toFixed(0)}%
                    </span>
                  </div>
                  {report.summary.totalReturnedAmount > 0 && (
                    <div className="flex justify-between text-rose-700 tabular-nums">
                      <span>Retur Dikeluarkan dari Omzet</span>
                      <span className="font-mono font-semibold">
                        -{formatRupiah(report.summary.totalReturnedAmount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Best-Selling Products Table & Mobile Touch List */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 md:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm md:text-base font-bold text-slate-900">
                    Daftar Produk Terlaris
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Menampilkan {formatNumber(visibleProducts.length)} dari{' '}
                    {formatNumber(report.bestSellingProducts.length)} produk terjual · diurutkan berdasarkan{' '}
                    {sortBy === 'QUANTITY'
                      ? 'kuantitas tertinggi'
                      : sortBy === 'REVENUE'
                      ? 'total penjualan tertinggi'
                      : 'keuntungan kotor tertinggi'}
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold self-start sm:self-auto">
                  {(
                    [
                      { id: 'QUANTITY', label: 'Kuantitas' },
                      { id: 'REVENUE', label: 'Total Penjualan' },
                      { id: 'GROSS_PROFIT', label: 'Laba Kotor' },
                    ] as Array<{ id: SalesReportSortBy; label: string }>
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setSortBy(opt.id);
                      }}
                      className={`min-h-[36px] px-3 py-1 rounded-lg whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        sortBy === opt.id
                          ? 'bg-white text-slate-900 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Desktop / Tablet Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-[11px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 text-center w-14">Peringkat</th>
                      <th className="py-3 px-4">Produk</th>
                      <th className="py-3 px-4 text-right">Kuantitas Terjual</th>
                      <th className="py-3 px-4 text-center">Nota</th>
                      <th className="py-3 px-4 text-right">Total Penjualan</th>
                      <th className="py-3 px-4 text-right">Estimasi HPP</th>
                      <th className="py-3 px-4 text-right">Est. Keuntungan Kotor</th>
                      <th className="py-3 px-4 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleProducts.map((item) => (
                      <tr key={`${item.productId}_${item.rank}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-700 tabular-nums">
                          #{item.rank}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{item.productName}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.category}
                            <span aria-hidden="true"> · </span>
                            <span>{item.revenueSharePercent.toFixed(1)}% kontribusi omzet</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          <div className="font-bold text-slate-900">
                            {formatNumber(item.totalQuantitySold)} {item.baseUnit}
                          </div>
                          {item.unitBreakdown.length > 0 && (
                            <div className="text-[11px] text-slate-500">{item.unitBreakdownLabel}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-slate-700 tabular-nums">
                          {formatNumber(item.transactionCount)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {formatRupiah(item.totalSales)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600 tabular-nums">
                          {formatRupiah(item.estimatedCogs)}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold tabular-nums ${
                            item.estimatedGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {formatRupiah(item.estimatedGrossProfit)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700 tabular-nums">
                          {item.grossMarginPercent.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Android Mobile Portrait Touch List */}
              <div className="md:hidden divide-y divide-slate-100">
                {visibleProducts.map((item) => (
                  <div key={`${item.productId}_m_${item.rank}`} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          #{item.rank} · {item.productName}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {item.category} · {formatNumber(item.transactionCount)} nota
                        </div>
                      </div>
                      <div className="text-right shrink-0 font-mono tabular-nums">
                        <div className="text-sm font-bold text-slate-900">
                          {formatRupiah(item.totalSales)}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatNumber(item.totalQuantitySold)} {item.baseUnit}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 tabular-nums">
                      <span className="text-slate-500">
                        Est. Keuntungan Kotor ({item.grossMarginPercent.toFixed(1)}%)
                      </span>
                      <span
                        className={`font-mono font-bold ${
                          item.estimatedGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatRupiah(item.estimatedGrossProfit)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {report.bestSellingProducts.length > 15 && (
                <div className="p-3 border-t border-slate-100 bg-slate-50/70 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setShowAllProducts((v) => !v);
                    }}
                    className="min-h-[40px] px-4 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    {showAllProducts
                      ? 'Tampilkan Top 15 Saja'
                      : `Tampilkan Semua (${formatNumber(report.bestSellingProducts.length)} Produk)`}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
