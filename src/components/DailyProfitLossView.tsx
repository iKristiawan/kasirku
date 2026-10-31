import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Printer, 
  MessageCircle, 
  DollarSign, 
  Percent, 
  ArrowUpRight, 
  Sparkles, 
  Search, 
  Filter, 
  PieChart, 
  Receipt,
  FileText,
  AlertCircle,
  Layers,
  ChevronDown,
  ChevronUp,
  Tag,
  BarChart2,
  CheckCircle2,
  Download,
  CalendarRange,
  ArrowRight
} from 'lucide-react';
import { Transaction, Product, ProductCategory, UserRole } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime, formatDateOnly, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getCategoryColor } from '../utils/categoryColors';
import { SalesChartView } from './SalesChartView';

interface DailyProfitLossViewProps {
  transactions: Transaction[];
  products: Product[];
  categories?: ProductCategory[];
  currentUserRole: UserRole;
  storeName: string;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const DailyProfitLossView: React.FC<DailyProfitLossViewProps> = ({
  transactions,
  products,
  categories = [],
  currentUserRole,
  storeName,
}) => {
  // Navigation Tabs: 'DAILY' vs 'MONTHLY'
  const [activeReportTab, setActiveReportTab] = useState<'DAILY' | 'MONTHLY'>('MONTHLY');

  // Daily report filters
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'ALL'>('TODAY');
  const [customDate, setCustomDate] = useState<string>('');
  const [searchProduct, setSearchProduct] = useState<string>('');

  // Monthly report filters
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [monthlySearch, setMonthlySearch] = useState<string>('');
  const [categorySortBy, setCategorySortBy] = useState<'PROFIT' | 'REVENUE' | 'COGS' | 'MARGIN'>('PROFIT');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Map product id -> product for fast costPrice resolution
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Date boundary calculations for Daily view
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const yesterdayEnd = todayStart - 1;
  const sevenDaysAgo = todayStart - 6 * 86400000;
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  // Filter transactions for DAILY view
  const filteredDailyTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (customDate) {
        const txDate = new Date(tx.timestamp).toISOString().split('T')[0];
        return txDate === customDate;
      }

      switch (periodFilter) {
        case 'TODAY':
          return tx.timestamp >= todayStart;
        case 'YESTERDAY':
          return tx.timestamp >= yesterdayStart && tx.timestamp <= yesterdayEnd;
        case 'LAST_7_DAYS':
          return tx.timestamp >= sevenDaysAgo;
        case 'THIS_MONTH':
          return tx.timestamp >= thisMonthStart;
        case 'ALL':
        default:
          return true;
      }
    });
  }, [transactions, periodFilter, customDate, todayStart, yesterdayStart, yesterdayEnd, sevenDaysAgo, thisMonthStart]);

  // Financial Summary for DAILY view
  const dailyFinancialSummary = useMemo(() => {
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalPointsExpense = 0;
    let totalDiscount = 0;

    filteredDailyTransactions.forEach((tx) => {
      totalRevenue += tx.finalAmount;
      totalPointsExpense += tx.pointsDiscountAmount || 0;
      totalDiscount += tx.discount || 0;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const itemCost = item.costPrice ?? (prod?.costPrice || 0);
        const itemCOGS = item.quantity * (item.conversionFactor || 1) * itemCost;
        totalCOGS += itemCOGS;
      });
    });

    const grossProfit = totalRevenue - totalCOGS;
    const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCOGS,
      grossProfit,
      grossMarginPercent,
      totalPointsExpense,
      totalDiscount,
      transactionCount: filteredDailyTransactions.length,
      averageProfitPerTransaction: filteredDailyTransactions.length > 0 ? grossProfit / filteredDailyTransactions.length : 0,
    };
  }, [filteredDailyTransactions, productMap]);

  // Product profitability for DAILY view
  const dailyProductProfitability = useMemo(() => {
    const pMap = new Map<string, {
      productId: string;
      productName: string;
      category: string;
      baseUnit: string;
      unitsSold: number;
      totalRevenue: number;
      totalCOGS: number;
    }>();

    filteredDailyTransactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const category = prod?.category || 'Umum';
        const baseUnit = prod?.baseUnit || 'PCS';
        const itemCost = item.costPrice ?? (prod?.costPrice || 0);
        const unitsSold = item.quantity * (item.conversionFactor || 1);
        const cogs = unitsSold * itemCost;

        const existing = pMap.get(item.productId) || {
          productId: item.productId,
          productName: item.productName || prod?.name || 'Produk',
          category,
          baseUnit,
          unitsSold: 0,
          totalRevenue: 0,
          totalCOGS: 0,
        };

        existing.unitsSold += unitsSold;
        existing.totalRevenue += item.totalAmount;
        existing.totalCOGS += cogs;
        pMap.set(item.productId, existing);
      });
    });

    return Array.from(pMap.values())
      .map((item) => {
        const profit = item.totalRevenue - item.totalCOGS;
        const margin = item.totalRevenue > 0 ? (profit / item.totalRevenue) * 100 : 0;
        return {
          ...item,
          profit,
          margin,
        };
      })
      .filter((item) => item.productName.toLowerCase().includes(searchProduct.toLowerCase()))
      .sort((a, b) => b.profit - a.profit);
  }, [filteredDailyTransactions, productMap, searchProduct]);

  // =========================================================================
  // MONTHLY PROFIT & LOSS CALCULATIONS (HPP & Breakdown per Kategori)
  // =========================================================================
  
  // 1. Filter transactions by chosen month & year
  const monthlyTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const d = new Date(tx.timestamp);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });
  }, [transactions, selectedMonth, selectedYear]);

  // 2. Aggregate monthly metrics across entire store
  const monthlyOverallFinancials = useMemo(() => {
    let totalRevenue = 0;
    let totalCOGS = 0;
    let totalUnitsSold = 0;
    let totalDiscount = 0;
    let totalPointsExpense = 0;

    monthlyTransactions.forEach((tx) => {
      totalRevenue += tx.finalAmount;
      totalDiscount += tx.discount || 0;
      totalPointsExpense += tx.pointsDiscountAmount || 0;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const itemCost = item.costPrice ?? (prod?.costPrice || 0);
        const baseQty = item.quantity * (item.conversionFactor || 1);
        totalUnitsSold += baseQty;
        totalCOGS += baseQty * itemCost;
      });
    });

    const grossProfit = totalRevenue - totalCOGS;
    const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    return {
      totalRevenue,
      totalCOGS,
      grossProfit,
      grossMarginPercent,
      totalUnitsSold,
      totalDiscount,
      totalPointsExpense,
      transactionCount: monthlyTransactions.length,
      avgBasket: monthlyTransactions.length > 0 ? totalRevenue / monthlyTransactions.length : 0,
    };
  }, [monthlyTransactions, productMap]);

  // 3. Category-Level Profit & Loss Aggregation with Product Details
  const monthlyCategoryBreakdown = useMemo(() => {
    interface CategoryItemData {
      productId: string;
      productName: string;
      barcode: string;
      baseUnit: string;
      unitsSold: number;
      costPrice: number;
      avgSellingPrice: number;
      totalRevenue: number;
      totalCOGS: number;
      grossProfit: number;
      marginPercent: number;
    }

    interface CategoryAggregate {
      categoryName: string;
      categoryColor: string;
      totalUnitsSold: number;
      totalRevenue: number;
      totalCOGS: number;
      grossProfit: number;
      marginPercent: number;
      revenueContributionPercent: number;
      productsMap: Map<string, CategoryItemData>;
    }

    const catMap = new Map<string, CategoryAggregate>();

    monthlyTransactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim();
        const baseUnit = prod?.baseUnit || item.unitName || 'PCS';
        const costPrice = item.costPrice ?? (prod?.costPrice || 0);
        const baseUnitsSold = item.quantity * (item.conversionFactor || 1);
        const itemCOGS = baseUnitsSold * costPrice;
        const itemRevenue = item.totalAmount;

        let catAgg = catMap.get(catName);
        if (!catAgg) {
          catAgg = {
            categoryName: catName,
            categoryColor: getCategoryColor(catName, categories, prod),
            totalUnitsSold: 0,
            totalRevenue: 0,
            totalCOGS: 0,
            grossProfit: 0,
            marginPercent: 0,
            revenueContributionPercent: 0,
            productsMap: new Map(),
          };
          catMap.set(catName, catAgg);
        }

        catAgg.totalUnitsSold += baseUnitsSold;
        catAgg.totalRevenue += itemRevenue;
        catAgg.totalCOGS += itemCOGS;

        // Group individual products under category
        const prodKey = item.productId;
        let pData = catAgg.productsMap.get(prodKey);
        if (!pData) {
          pData = {
            productId: item.productId,
            productName: item.productName || prod?.name || 'Produk',
            barcode: prod?.barcode || '-',
            baseUnit,
            unitsSold: 0,
            costPrice,
            avgSellingPrice: 0,
            totalRevenue: 0,
            totalCOGS: 0,
            grossProfit: 0,
            marginPercent: 0,
          };
          catAgg.productsMap.set(prodKey, pData);
        }

        pData.unitsSold += baseUnitsSold;
        pData.totalRevenue += itemRevenue;
        pData.totalCOGS += itemCOGS;
      });
    });

    const totalStoreRevenue = monthlyOverallFinancials.totalRevenue;

    // Convert map to array and compute percentages
    const list = Array.from(catMap.values()).map((cat) => {
      const grossProfit = cat.totalRevenue - cat.totalCOGS;
      const marginPercent = cat.totalRevenue > 0 ? (grossProfit / cat.totalRevenue) * 100 : 0;
      const revenueContributionPercent = totalStoreRevenue > 0 ? (cat.totalRevenue / totalStoreRevenue) * 100 : 0;

      const productsList = Array.from(cat.productsMap.values()).map((p) => {
        const pProfit = p.totalRevenue - p.totalCOGS;
        const pMargin = p.totalRevenue > 0 ? (pProfit / p.totalRevenue) * 100 : 0;
        const avgSellingPrice = p.unitsSold > 0 ? p.totalRevenue / p.unitsSold : 0;
        return {
          ...p,
          avgSellingPrice,
          grossProfit: pProfit,
          marginPercent: pMargin,
        };
      }).sort((a, b) => b.grossProfit - a.grossProfit);

      return {
        ...cat,
        grossProfit,
        marginPercent,
        revenueContributionPercent,
        products: productsList,
      };
    });

    // Filter by search query
    const filtered = list.filter((cat) => {
      if (!monthlySearch.trim()) return true;
      const q = monthlySearch.toLowerCase();
      if (cat.categoryName.toLowerCase().includes(q)) return true;
      return cat.products.some((p) => p.productName.toLowerCase().includes(q) || p.barcode.includes(q));
    });

    // Sort categories
    filtered.sort((a, b) => {
      switch (categorySortBy) {
        case 'REVENUE':
          return b.totalRevenue - a.totalRevenue;
        case 'COGS':
          return b.totalCOGS - a.totalCOGS;
        case 'MARGIN':
          return b.marginPercent - a.marginPercent;
        case 'PROFIT':
        default:
          return b.grossProfit - a.grossProfit;
      }
    });

    return filtered;
  }, [monthlyTransactions, productMap, categories, monthlyOverallFinancials.totalRevenue, monthlySearch, categorySortBy]);

  const toggleCategoryExpand = (categoryName: string) => {
    sound.playTap();
    setExpandedCategories((prev) => ({
      ...prev,
      [categoryName]: !prev[categoryName],
    }));
  };

  // RBAC check
  if (currentUserRole !== 'ADMIN' && currentUserRole !== 'STORE_MANAGER') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-100">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
        <h3 className="text-base font-bold text-slate-800">Akses Dibatasi</h3>
        <p className="text-xs text-slate-500 max-w-sm mt-1">
          Halaman Laba Rugi hanya dapat diakses oleh Admin dan Store Manager toko.
        </p>
      </div>
    );
  }

  // Print Handler
  const handlePrint = () => {
    sound.playTap();
    window.print();
  };

  // Monthly WhatsApp Share Handler
  const handleShareMonthlyWhatsApp = () => {
    sound.playTap();
    const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    const categoryLines = monthlyCategoryBreakdown.slice(0, 5).map((cat, idx) => {
      return `${idx + 1}. *${cat.categoryName}*\n   - Omzet : ${formatRupiah(cat.totalRevenue)}\n   - HPP   : ${formatRupiah(cat.totalCOGS)}\n   - Laba  : ${formatRupiah(cat.grossProfit)} (${cat.marginPercent.toFixed(1)}%)`;
    }).join('\n\n');

    const lines = [
      `*LAPORAN LABA RUGI BULANAN - ${storeName.toUpperCase()}*`,
      `Periode: ${monthLabel}`,
      `Waktu Rekap: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}`,
      `------------------------------------------`,
      `*RINGKASAN KEUANGAN BULAN INI:*`,
      `Total Omzet (Pendapatan): ${formatRupiah(monthlyOverallFinancials.totalRevenue)}`,
      `Total HPP (Beban Modal) : ${formatRupiah(monthlyOverallFinancials.totalCOGS)}`,
      `*LABA KOTOR BULANAN     : ${formatRupiah(monthlyOverallFinancials.grossProfit)}*`,
      `*Margin Laba Rata-rata   : ${monthlyOverallFinancials.grossMarginPercent.toFixed(1)}%*`,
      `Total Unit Terjual       : ${formatNumber(monthlyOverallFinancials.totalUnitsSold)} unit`,
      `Jumlah Transaksi         : ${formatNumber(monthlyOverallFinancials.transactionCount)} nota`,
      `------------------------------------------`,
      `*TOP 5 KATEGORI TERPROFIT:*`,
      categoryLines || 'Belum ada transaksi di bulan ini.',
      `------------------------------------------`,
      `Dihasilkan secara otomatis dari KasirKu POS Tablet.`,
    ];

    const url = formatWhatsAppUrl('', lines.join('\n'));
    window.open(url, '_blank');
  };

  // Daily WhatsApp Share Handler
  const handleShareDailyWhatsApp = () => {
    sound.playTap();
    const periodLabel = customDate
      ? `Tanggal ${customDate}`
      : periodFilter === 'TODAY'
      ? 'Hari Ini'
      : periodFilter === 'YESTERDAY'
      ? 'Kemarin'
      : periodFilter === 'LAST_7_DAYS'
      ? '7 Hari Terakhir'
      : periodFilter === 'THIS_MONTH'
      ? 'Bulan Ini'
      : 'Semua Periode';

    const lines = [
      `*RINGKASAN LABA RUGI HARIAN - ${storeName}*`,
      `Periode: ${periodLabel}`,
      `Jumlah Transaksi  : ${dailyFinancialSummary.transactionCount} Nota`,
      `Total Omzet (Rev) : ${formatRupiah(dailyFinancialSummary.totalRevenue)}`,
      `Estimasi HPP/COGS : ${formatRupiah(dailyFinancialSummary.totalCOGS)}`,
      `*LABA KOTOR       : ${formatRupiah(dailyFinancialSummary.grossProfit)}*`,
      `*Margin Keuntungan: ${dailyFinancialSummary.grossMarginPercent.toFixed(1)}%*`,
      `Rata-rata Laba/Nota: ${formatRupiah(dailyFinancialSummary.averageProfitPerTransaction)}`,
      `Dihasilkan dari sistem KasirKu POS.`,
    ];

    const url = formatWhatsAppUrl('', lines.filter(Boolean).join('\n'));
    window.open(url, '_blank');
  };

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-100 overflow-y-auto select-none font-sans">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-5">
        
        {/* Top Header Card */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-900">
                  Laporan Keuangan & Laba Rugi (P&L Analysis)
                </h2>
                <p className="text-xs text-slate-500">
                  Perhitungan otomatis HPP (*Cost of Goods Sold*), laba kotor, dan margin keuntungan per kategori dan per produk.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Subtabs Switcher */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
              <button
                onClick={() => {
                  sound.playTap();
                  setActiveReportTab('MONTHLY');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeReportTab === 'MONTHLY'
                    ? 'bg-white text-emerald-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5 text-emerald-600" />
                <span>Laba-Rugi Bulanan</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-emerald-100 text-emerald-700 font-bold uppercase">
                  Per Kategori
                </span>
              </button>

              <button
                onClick={() => {
                  sound.playTap();
                  setActiveReportTab('DAILY');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeReportTab === 'DAILY'
                    ? 'bg-white text-sky-800 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                <span>Laporan Harian & Grafik</span>
              </button>
            </div>

            {/* Print & Share Buttons */}
            <button
              onClick={handlePrint}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors border border-slate-200"
              title="Cetak Laporan ke Printer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Cetak</span>
            </button>

            <button
              onClick={activeReportTab === 'MONTHLY' ? handleShareMonthlyWhatsApp : handleShareDailyWhatsApp}
              className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-colors border border-emerald-200"
              title="Kirim Ringkasan Laporan ke WhatsApp"
            >
              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Bagikan WA</span>
            </button>
          </div>
        </div>

        {/* =========================================================================
            TAB 1: LAPORAN LABA-RUGI BULANAN (DETAIL PER KATEGORI & HPP)
           ========================================================================= */}
        {activeReportTab === 'MONTHLY' && (
          <div className="space-y-4 md:space-y-5">
            {/* Month & Year Selection Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <CalendarRange className="w-4 h-4 text-emerald-600" />
                  <span>Pilih Periode Bulan:</span>
                </span>

                {/* Month Dropdown */}
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    sound.playTap();
                    setSelectedMonth(parseInt(e.target.value));
                  }}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500 shadow-2xs"
                >
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>

                {/* Year Dropdown */}
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    sound.playTap();
                    setSelectedYear(parseInt(e.target.value));
                  }}
                  className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs md:text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500 shadow-2xs font-mono"
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>

                <div className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800">
                  {monthlyTransactions.length} Transaksi Tercatat
                </div>
              </div>

              {/* Sort by Metric */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap hidden sm:inline">
                  Urutkan:
                </span>
                <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-bold">
                  {[
                    { id: 'PROFIT' as const, label: 'Laba Terbesar' },
                    { id: 'REVENUE' as const, label: 'Omzet' },
                    { id: 'MARGIN' as const, label: 'Margin %' },
                    { id: 'COGS' as const, label: 'HPP' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        sound.playTap();
                        setCategorySortBy(s.id);
                      }}
                      className={`px-2.5 py-1 rounded-lg transition-all ${
                        categorySortBy === s.id
                          ? 'bg-white text-emerald-900 shadow-2xs font-black'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4 Executive Monthly KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Total Revenue Bulanan */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Total Omzet Bulanan</span>
                  <DollarSign className="w-3.5 h-3.5 text-sky-600" />
                </div>
                <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1 tabular-nums">
                  {formatRupiah(monthlyOverallFinancials.totalRevenue)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Dari {monthlyOverallFinancials.transactionCount} nota transaksi
                </div>
              </div>

              {/* 2. Total HPP Bulanan */}
              <div className="bg-white p-4 rounded-2xl border border-rose-200/80 shadow-2xs bg-rose-50/10">
                <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider flex items-center justify-between">
                  <span>Total HPP / Biaya Pokok</span>
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                </div>
                <div className="text-xl md:text-2xl font-black text-rose-700 font-mono mt-1 tabular-nums">
                  {formatRupiah(monthlyOverallFinancials.totalCOGS)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Dihitung dari modal per unit produk
                </div>
              </div>

              {/* 3. Gross Profit Bulanan */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50/80 p-4 rounded-2xl border border-emerald-300 shadow-2xs">
                <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center justify-between">
                  <span>Laba Kotor Bulanan</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-xl md:text-2xl font-black text-emerald-700 font-mono mt-1 tabular-nums">
                  {formatRupiah(monthlyOverallFinancials.grossProfit)}
                </div>
                <div className="text-[10px] text-emerald-800 mt-0.5 font-medium">
                  Omzet dikurangi Beban HPP
                </div>
              </div>

              {/* 4. Margin Laba Kotor Bulanan */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Margin Keuntungan</span>
                  <Percent className="w-3.5 h-3.5 text-indigo-600" />
                </div>
                <div className="text-xl md:text-2xl font-black text-indigo-700 font-mono mt-1 tabular-nums">
                  {monthlyOverallFinancials.grossMarginPercent.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {formatNumber(monthlyOverallFinancials.totalUnitsSold)} unit produk terjual
                </div>
              </div>
            </div>

            {/* Category Breakdown Table Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Tabel Detail Laba Rugi per Kategori Produk ({MONTH_NAMES[selectedMonth]} {selectedYear})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Rincian omzet, HPP, laba kotor, dan margin keuntungan per kategori barang. Klik baris kategori untuk melihat produk.
                    </p>
                  </div>
                </div>

                {/* Search Bar for Categories & Products */}
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={monthlySearch}
                    onChange={(e) => setMonthlySearch(e.target.value)}
                    placeholder="Cari kategori atau produk..."
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              {monthlyCategoryBreakdown.length === 0 ? (
                <div className="p-10 text-center text-slate-400 space-y-2">
                  <Layers className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">
                    Tidak ada transaksi penjualan pada bulan {MONTH_NAMES[selectedMonth]} {selectedYear}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Pilih bulan lain pada dropdown periode di atas atau lakukan transaksi melalui kasir POS.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs md:text-sm">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Kategori Produk</th>
                        <th className="py-3 px-4 text-center">Unit Terjual</th>
                        <th className="py-3 px-4 text-right">Total Omzet</th>
                        <th className="py-3 px-4 text-right">Total HPP (Modal)</th>
                        <th className="py-3 px-4 text-right">Laba Kotor</th>
                        <th className="py-3 px-4 text-right">Margin (%)</th>
                        <th className="py-3 px-4 text-center">Kontribusi</th>
                        <th className="py-3 px-4 text-center">Profit Status</th>
                        <th className="py-3 px-4 text-center">Rincian</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {monthlyCategoryBreakdown.map((cat) => {
                        const isExpanded = !!expandedCategories[cat.categoryName];
                        const isHighMargin = cat.marginPercent >= 30;
                        const isMidMargin = cat.marginPercent >= 15 && cat.marginPercent < 30;

                        return (
                          <React.Fragment key={cat.categoryName}>
                            {/* Category Row */}
                            <tr 
                              onClick={() => toggleCategoryExpand(cat.categoryName)}
                              className="hover:bg-slate-50 cursor-pointer transition-colors group"
                            >
                              <td className="py-3.5 px-4 font-bold text-slate-900">
                                <div className="flex items-center gap-2">
                                  <span 
                                    className="w-3 h-3 rounded-full shrink-0 shadow-2xs" 
                                    style={{ backgroundColor: cat.categoryColor }} 
                                  />
                                  <span className="text-slate-900 font-extrabold text-xs md:text-sm">
                                    {cat.categoryName}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    ({cat.products.length} SKU)
                                  </span>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-center font-mono font-semibold text-slate-700">
                                {formatNumber(cat.totalUnitsSold)} unit
                              </td>

                              <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                                {formatRupiah(cat.totalRevenue)}
                              </td>

                              <td className="py-3.5 px-4 text-right font-mono text-rose-700 tabular-nums font-semibold">
                                {formatRupiah(cat.totalCOGS)}
                              </td>

                              <td className="py-3.5 px-4 text-right font-mono font-extrabold text-emerald-700 tabular-nums">
                                {formatRupiah(cat.grossProfit)}
                              </td>

                              <td className="py-3.5 px-4 text-right font-mono font-black text-indigo-700 tabular-nums">
                                {cat.marginPercent.toFixed(1)}%
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <div className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-600">
                                  <span>{cat.revenueContributionPercent.toFixed(1)}%</span>
                                  <div className="w-12 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-emerald-500 h-full rounded-full"
                                      style={{ width: `${Math.min(100, cat.revenueContributionPercent)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  isHighMargin
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : isMidMargin
                                    ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                    : 'bg-amber-100 text-amber-800 border border-amber-300'
                                }`}>
                                  {isHighMargin ? 'Tinggi (≥30%)' : isMidMargin ? 'Normal (15-30%)' : 'Tipis (<15%)'}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 text-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleCategoryExpand(cat.categoryName);
                                  }}
                                  className="p-1 rounded-lg text-slate-400 group-hover:text-slate-800 hover:bg-slate-200 transition-colors"
                                  title="Lihat Rincian Produk"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-emerald-600" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </td>
                            </tr>

                            {/* Expanded Nested Product Breakdown Table */}
                            {isExpanded && (
                              <tr className="bg-slate-50/70">
                                <td colSpan={9} className="p-3 md:px-6">
                                  <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-inner space-y-2">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-bold text-slate-700">
                                      <span className="flex items-center gap-1.5">
                                        <Tag className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Rincian HPP & Profit Produk di Kategori {cat.categoryName}</span>
                                      </span>
                                      <span className="text-[11px] text-slate-500 font-normal">
                                        {cat.products.length} Produk Terjual
                                      </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-xs">
                                        <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                                          <tr>
                                            <th className="py-1.5 px-2">Nama Produk & Barcode</th>
                                            <th className="py-1.5 px-2 text-center">Terjual</th>
                                            <th className="py-1.5 px-2 text-right">Harga Modal (HPP/Unit)</th>
                                            <th className="py-1.5 px-2 text-right">Rata-rata Harga Jual</th>
                                            <th className="py-1.5 px-2 text-right">Total Omzet</th>
                                            <th className="py-1.5 px-2 text-right">Total HPP</th>
                                            <th className="py-1.5 px-2 text-right">Laba Kotor</th>
                                            <th className="py-1.5 px-2 text-right">Margin (%)</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {cat.products.map((p) => (
                                            <tr key={p.productId} className="hover:bg-slate-50">
                                              <td className="py-2 px-2 font-semibold text-slate-800">
                                                <div>{p.productName}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">{p.barcode}</div>
                                              </td>
                                              <td className="py-2 px-2 text-center font-mono text-slate-700">
                                                {formatNumber(p.unitsSold)} {p.baseUnit}
                                              </td>
                                              <td className="py-2 px-2 text-right font-mono text-rose-700">
                                                {formatRupiah(p.costPrice)}
                                              </td>
                                              <td className="py-2 px-2 text-right font-mono text-slate-800">
                                                {formatRupiah(p.avgSellingPrice)}
                                              </td>
                                              <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                                                {formatRupiah(p.totalRevenue)}
                                              </td>
                                              <td className="py-2 px-2 text-right font-mono font-semibold text-rose-600">
                                                {formatRupiah(p.totalCOGS)}
                                              </td>
                                              <td className="py-2 px-2 text-right font-mono font-bold text-emerald-700">
                                                {formatRupiah(p.grossProfit)}
                                              </td>
                                              <td className="py-2 px-2 text-right font-mono font-black text-indigo-700">
                                                {p.marginPercent.toFixed(1)}%
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: LAPORAN LABA-RUGI HARIAN & VISUAL ANALYTICS
           ========================================================================= */}
        {activeReportTab === 'DAILY' && (
          <div className="space-y-4 md:space-y-5">
            {/* Period Selector & Date Picker Bar */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto">
                {[
                  { id: 'TODAY', label: 'Hari Ini' },
                  { id: 'YESTERDAY', label: 'Kemarin' },
                  { id: 'LAST_7_DAYS', label: '7 Hari Terakhir' },
                  { id: 'THIS_MONTH', label: 'Bulan Ini' },
                  { id: 'ALL', label: 'Semua Waktu' },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      sound.playTap();
                      setPeriodFilter(p.id as any);
                      setCustomDate('');
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                      periodFilter === p.id && !customDate
                        ? 'bg-slate-900 text-white font-bold shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                <span className="text-xs text-slate-500 font-semibold whitespace-nowrap hidden sm:inline">
                  Pilih Tanggal:
                </span>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => {
                    setCustomDate(e.target.value);
                    sound.playTap();
                  }}
                  className="p-2 rounded-xl border border-slate-300 text-xs bg-slate-50 font-medium focus:outline-none focus:border-sky-500 text-slate-800 w-full sm:w-auto"
                />
                {customDate && (
                  <button
                    onClick={() => setCustomDate('')}
                    className="text-xs text-rose-600 hover:underline font-bold whitespace-nowrap"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* 4 Executive Daily Financial Summary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 1. Total Revenue */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Total Pendapatan (Omzet)
                </div>
                <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1 tabular-nums">
                  {formatRupiah(dailyFinancialSummary.totalRevenue)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Dari {dailyFinancialSummary.transactionCount} nota penjualan
                </div>
              </div>

              {/* 2. Total COGS / HPP */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Total Beban Pokok (HPP)
                </div>
                <div className="text-xl md:text-2xl font-black text-rose-700 font-mono mt-1 tabular-nums">
                  {formatRupiah(dailyFinancialSummary.totalCOGS)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Akumulasi harga modal barang
                </div>
              </div>

              {/* 3. Gross Profit */}
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50/70 p-4 rounded-2xl border border-emerald-200 shadow-2xs">
                <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider flex items-center justify-between">
                  <span>Laba Kotor (Gross Profit)</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <div className="text-xl md:text-2xl font-black text-emerald-700 font-mono mt-1 tabular-nums">
                  {formatRupiah(dailyFinancialSummary.grossProfit)}
                </div>
                <div className="text-[10px] text-emerald-800 mt-0.5 font-medium">
                  Rata-rata {formatRupiah(dailyFinancialSummary.averageProfitPerTransaction)} / nota
                </div>
              </div>

              {/* 4. Margin Percentage */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Margin Laba Kotor
                </div>
                <div className="text-xl md:text-2xl font-black text-indigo-700 font-mono mt-1 tabular-nums">
                  {dailyFinancialSummary.grossMarginPercent.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Persentase laba dari omzet
                </div>
              </div>
            </div>

            {/* Visual Analytics Chart View (Recharts & D3.js Peak Hours) */}
            <SalesChartView transactions={transactions} products={products} />

            {/* Daily Product Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Rincian Profitabilitas Produk ({dailyProductProfitability.length} Produk)
                  </h3>
                </div>

                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchProduct}
                    onChange={(e) => setSearchProduct(e.target.value)}
                    placeholder="Cari nama produk..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Produk</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4">Terjual</th>
                      <th className="py-3 px-4">Total Omzet</th>
                      <th className="py-3 px-4">Total HPP</th>
                      <th className="py-3 px-4">Laba Bersih</th>
                      <th className="py-3 px-4 text-right">Margin (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyProductProfitability.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          Belum ada penjualan produk pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      dailyProductProfitability.map((p) => (
                        <tr key={p.productId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {p.productName}
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-medium">
                            {p.category}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-800">
                            {formatNumber(p.unitsSold)} {p.baseUnit}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-800 tabular-nums">
                            {formatRupiah(p.totalRevenue)}
                          </td>
                          <td className="py-3 px-4 font-mono text-rose-700 tabular-nums">
                            {formatRupiah(p.totalCOGS)}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-700 tabular-nums">
                            {formatRupiah(p.profit)}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-indigo-700 tabular-nums text-right">
                            {p.margin.toFixed(1)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
