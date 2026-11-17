import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  Cell,
  ComposedChart,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend 
} from 'recharts';
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
  Flame,
  Award,
  Target,
  FileText,
  AlertCircle,
  Layers,
  ChevronDown,
  ChevronUp,
  Tag,
  BarChart2,
  BarChart3,
  CheckCircle2,
  Download,
  CalendarRange,
  ArrowRight,
  Eye,
  X,
  Info,
  Calculator,
  ShieldCheck,
  Wrench
} from 'lucide-react';
import { Transaction, Product, ProductCategory, UserRole, StoreSettings, CashflowRecord, Customer } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime, formatDateOnly, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getCategoryColor } from '../utils/categoryColors';
import { SalesChartView } from './SalesChartView';
import { SalesPerformanceDashboard } from './SalesPerformanceDashboard';
import { getItemFifoCogs, getItemFifoUnitCost, calculateFIFOGrossProfit, reconcileTransactionsFifo, FifoValidationSummary } from '../utils/fifoUtils';
import { FifoReconciliationModal } from './FifoReconciliationModal';
import { DailyFifoAuditPanel } from './DailyFifoAuditPanel';

export interface FifoBatchDeductionSummary {
  batchNumber: string;
  quantity: number;
  costPrice: number;
  totalCost: number;
  expiryDate?: string;
  isDeficit?: boolean;
}

export interface FifoTransactionAudit {
  invoiceNumber: string;
  timestamp: number;
  formattedDate: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
  cogs: number;
  profit: number;
  deductions: FifoBatchDeductionSummary[];
}

export interface CategoryItemData {
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
  batchDeductionsSummary: FifoBatchDeductionSummary[];
  transactionAudits: FifoTransactionAudit[];
}

interface DailyProfitLossViewProps {
  transactions: Transaction[];
  products: Product[];
  categories?: ProductCategory[];
  cashflows?: CashflowRecord[];
  customers?: Customer[];
  currentUserRole: UserRole;
  storeName: string;
  storeSettings?: StoreSettings;
  onOpenSettings?: () => void;
  onReconcileTransactions?: (reconciledTransactions: Transaction[]) => Promise<void> | void;
}

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export const DailyProfitLossView: React.FC<DailyProfitLossViewProps> = ({
  transactions,
  products,
  categories = [],
  cashflows = [],
  customers = [],
  currentUserRole,
  storeName,
  storeSettings,
  onOpenSettings,
  onReconcileTransactions,
}) => {
  // Navigation Tabs: 'MONTHLY' vs 'DAILY' vs 'SALES_DASHBOARD'
  const [activeReportTab, setActiveReportTab] = useState<'DAILY' | 'MONTHLY' | 'SALES_DASHBOARD'>('MONTHLY');

  // Daily report filters
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'YESTERDAY' | 'LAST_7_DAYS' | 'THIS_MONTH' | 'ALL'>('TODAY');
  const [customDate, setCustomDate] = useState<string>('');
  const [searchProduct, setSearchProduct] = useState<string>('');
  const [trendDaysRange, setTrendDaysRange] = useState<number>(14);

  // Monthly report filters
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [monthlySearch, setMonthlySearch] = useState<string>('');
  const [categorySortBy, setCategorySortBy] = useState<'PROFIT' | 'REVENUE' | 'COGS' | 'MARGIN'>('PROFIT');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Active FIFO Audit Modal product
  const [selectedFifoAuditProduct, setSelectedFifoAuditProduct] = useState<CategoryItemData | null>(null);

  // Historical FIFO Gross Profit Validator Modal state
  const [isFifoValidatorModalOpen, setIsFifoValidatorModalOpen] = useState<boolean>(false);
  const [isReconcileModalOpen, setIsReconcileModalOpen] = useState<boolean>(false);
  const [isDailyAuditPanelOpen, setIsDailyAuditPanelOpen] = useState<boolean>(false);
  const [validatorFilter, setValidatorFilter] = useState<'ALL' | 'DISCREPANCY_ONLY' | 'WITH_BATCHES_ONLY'>('ALL');
  const [validatorSearchQuery, setValidatorSearchQuery] = useState<string>('');
  const [expandedValidationTxId, setExpandedValidationTxId] = useState<string | null>(null);

  // Run calculateFIFOGrossProfit across all historical transactions
  const fifoValidationSummary: FifoValidationSummary = useMemo(() => {
    return calculateFIFOGrossProfit(transactions, products);
  }, [transactions, products]);

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
        const itemCOGS = getItemFifoCogs(item, prod);
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
    const pMap = new Map<string, CategoryItemData & { category: string; profit: number; margin: number }>();

    filteredDailyTransactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const category = prod?.category || 'Umum';
        const baseUnit = prod?.baseUnit || item.unitName || 'PCS';
        const unitsSold = item.quantity * (item.conversionFactor || 1);
        const cogs = getItemFifoCogs(item, prod);
        const revenue = item.totalAmount;

        let existing = pMap.get(item.productId);
        if (!existing) {
          existing = {
            productId: item.productId,
            productName: item.productName || prod?.name || 'Produk',
            barcode: prod?.barcode || '-',
            baseUnit,
            unitsSold: 0,
            costPrice: 0,
            avgSellingPrice: 0,
            totalRevenue: 0,
            totalCOGS: 0,
            grossProfit: 0,
            marginPercent: 0,
            batchDeductionsSummary: [],
            transactionAudits: [],
            category,
            profit: 0,
            margin: 0,
          };
          pMap.set(item.productId, existing);
        }

        existing.unitsSold += unitsSold;
        existing.totalRevenue += revenue;
        existing.totalCOGS += cogs;

        const txDeductions: FifoBatchDeductionSummary[] = [];
        if (item.batchDeductions && item.batchDeductions.length > 0) {
          item.batchDeductions.forEach((b) => {
            const bQty = b.quantity || 0;
            const bCost = b.costPrice !== undefined ? b.costPrice : (prod?.costPrice || 0);
            const isDef = b.batchNumber === 'DEFISIT-STOK' || b.batchId === 'batch_deficit';
            txDeductions.push({
              batchNumber: b.batchNumber || (isDef ? 'Defisit Stok' : 'Batch Standar'),
              quantity: bQty,
              costPrice: bCost,
              totalCost: bQty * bCost,
              expiryDate: b.expiryDate,
              isDeficit: isDef,
            });
          });
        } else {
          const bCost = item.costPrice !== undefined && item.costPrice > 0 ? item.costPrice : (prod?.costPrice || 0);
          txDeductions.push({
            batchNumber: 'Stok Terdaftar',
            quantity: unitsSold,
            costPrice: bCost,
            totalCost: cogs,
            isDeficit: false,
          });
        }

        existing.transactionAudits.push({
          invoiceNumber: tx.invoiceNumber || tx.id,
          timestamp: tx.timestamp,
          formattedDate: formatDateTime(tx.timestamp),
          quantity: unitsSold,
          unitPrice: item.unitPrice || (revenue / (item.quantity || 1)),
          revenue,
          cogs,
          profit: revenue - cogs,
          deductions: txDeductions,
        });

        txDeductions.forEach((td) => {
          const eb = existing!.batchDeductionsSummary.find(
            (b) => b.batchNumber === td.batchNumber && b.costPrice === td.costPrice
          );
          if (eb) {
            eb.quantity += td.quantity;
            eb.totalCost += td.totalCost;
          } else {
            existing!.batchDeductionsSummary.push({ ...td });
          }
        });
      });
    });

    return Array.from(pMap.values())
      .map((item) => {
        const profit = item.totalRevenue - item.totalCOGS;
        const margin = item.totalRevenue > 0 ? (profit / item.totalRevenue) * 100 : 0;
        const costPrice = item.unitsSold > 0 ? Math.round(item.totalCOGS / item.unitsSold) : (productMap.get(item.productId)?.costPrice || 0);
        const avgSellingPrice = item.unitsSold > 0 ? item.totalRevenue / item.unitsSold : 0;
        return {
          ...item,
          costPrice,
          avgSellingPrice,
          grossProfit: profit,
          marginPercent: margin,
          profit,
          margin,
          category: productMap.get(item.productId)?.category || 'Umum',
        };
      })
      .filter((item) => item.productName.toLowerCase().includes(searchProduct.toLowerCase()))
      .sort((a, b) => b.profit - a.profit);
  }, [filteredDailyTransactions, productMap, searchProduct]);

  // Compute Daily Revenue & Profit Trend for Recharts Line Chart
  const dailyRevenueTrendData = useMemo(() => {
    const list: {
      dateKey: string;
      label: string;
      fullDate: string;
      Omzet: number;
      HPP: number;
      Laba: number;
      Transaksi: number;
    }[] = [];

    const now = new Date();
    for (let i = trendDaysRange - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      const fullDate = d.toLocaleDateString('id-ID', { dateStyle: 'full' });

      list.push({
        dateKey,
        label,
        fullDate,
        Omzet: 0,
        HPP: 0,
        Laba: 0,
        Transaksi: 0,
      });
    }

    const map = new Map(list.map((item) => [item.dateKey, item]));

    transactions.forEach((tx) => {
      const txKey = new Date(tx.timestamp).toISOString().split('T')[0];
      const target = map.get(txKey);
      if (target) {
        target.Omzet += tx.finalAmount;
        target.Transaksi += 1;

        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          target.HPP += getItemFifoCogs(item, prod);
        });
      }
    });

    list.forEach((item) => {
      item.Laba = item.Omzet - item.HPP;
    });

    return list;
  }, [transactions, trendDaysRange, productMap]);

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
        const baseQty = item.quantity * (item.conversionFactor || 1);
        totalUnitsSold += baseQty;
        totalCOGS += getItemFifoCogs(item, prod);
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
        const baseUnitsSold = item.quantity * (item.conversionFactor || 1);
        const itemCOGS = getItemFifoCogs(item, prod);
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
            costPrice: 0,
            avgSellingPrice: 0,
            totalRevenue: 0,
            totalCOGS: 0,
            grossProfit: 0,
            marginPercent: 0,
            batchDeductionsSummary: [],
            transactionAudits: [],
          };
          catAgg.productsMap.set(prodKey, pData);
        }

        pData.unitsSold += baseUnitsSold;
        pData.totalRevenue += itemRevenue;
        pData.totalCOGS += itemCOGS;

        // Collect individual batch deductions for this sale item
        const txDeductions: FifoBatchDeductionSummary[] = [];
        if (item.batchDeductions && item.batchDeductions.length > 0) {
          item.batchDeductions.forEach((b) => {
            const bQty = b.quantity || 0;
            const bCost = b.costPrice !== undefined ? b.costPrice : (prod?.costPrice || 0);
            const isDef = b.batchNumber === 'DEFISIT-STOK' || b.batchId === 'batch_deficit';
            txDeductions.push({
              batchNumber: b.batchNumber || (isDef ? 'Defisit Stok' : 'Batch Standar'),
              quantity: bQty,
              costPrice: bCost,
              totalCost: bQty * bCost,
              expiryDate: b.expiryDate,
              isDeficit: isDef,
            });
          });
        } else {
          // If transaction didn't have explicit batch deductions, use item cost price
          const bCost = item.costPrice !== undefined && item.costPrice > 0 ? item.costPrice : (prod?.costPrice || 0);
          txDeductions.push({
            batchNumber: 'Stok Terdaftar',
            quantity: baseUnitsSold,
            costPrice: bCost,
            totalCost: itemCOGS,
            isDeficit: false,
          });
        }

        // Add to product transactions audit log
        pData.transactionAudits.push({
          invoiceNumber: tx.invoiceNumber || tx.id,
          timestamp: tx.timestamp,
          formattedDate: formatDateTime(tx.timestamp),
          quantity: baseUnitsSold,
          unitPrice: item.unitPrice || (itemRevenue / (item.quantity || 1)),
          revenue: itemRevenue,
          cogs: itemCOGS,
          profit: itemRevenue - itemCOGS,
          deductions: txDeductions,
        });

        // Accumulate into overall batch deductions summary for this product
        txDeductions.forEach((td) => {
          const existingBatch = pData.batchDeductionsSummary.find(
            (b) => b.batchNumber === td.batchNumber && b.costPrice === td.costPrice
          );
          if (existingBatch) {
            existingBatch.quantity += td.quantity;
            existingBatch.totalCost += td.totalCost;
          } else {
            pData.batchDeductionsSummary.push({ ...td });
          }
        });
      });
    });

    const totalStoreRevenue = monthlyOverallFinancials.totalRevenue;

    // Convert map to array and compute percentages with true FIFO average unit cost
    const list = Array.from(catMap.values()).map((cat) => {
      const grossProfit = cat.totalRevenue - cat.totalCOGS;
      const marginPercent = cat.totalRevenue > 0 ? (grossProfit / cat.totalRevenue) * 100 : 0;
      const revenueContributionPercent = totalStoreRevenue > 0 ? (cat.totalRevenue / totalStoreRevenue) * 100 : 0;

      const productsList = Array.from(cat.productsMap.values()).map((p) => {
        const pProfit = p.totalRevenue - p.totalCOGS;
        const pMargin = p.totalRevenue > 0 ? (pProfit / p.totalRevenue) * 100 : 0;
        const avgSellingPrice = p.unitsSold > 0 ? p.totalRevenue / p.unitsSold : 0;
        // True weighted average FIFO cost price per base unit: Total HPP / Total Unit Terjual
        const avgFifoCostPrice = p.unitsSold > 0 ? Math.round(p.totalCOGS / p.unitsSold) : (productMap.get(p.productId)?.costPrice || 0);

        return {
          ...p,
          costPrice: avgFifoCostPrice,
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

  // Prepared data for Category Sales Heatmap & Performance Matrix
  const categoryHeatmapData = useMemo(() => {
    return monthlyCategoryBreakdown.map((cat) => {
      let heatColor = '#10b981'; // Emerald
      let heatBg = 'bg-emerald-50/80 border-emerald-200 text-emerald-950';
      let segmentLabel = 'Bintang Laba (Star Segment)';
      let segmentBadge = 'bg-emerald-600 text-white';

      if (cat.marginPercent >= 35) {
        heatColor = '#059669'; // High margin emerald
        heatBg = 'bg-emerald-50/90 border-emerald-300 text-emerald-950';
        segmentLabel = 'Bintang Laba (High Margin)';
        segmentBadge = 'bg-emerald-700 text-white';
      } else if (cat.marginPercent >= 25) {
        heatColor = '#0d9488'; // Good margin teal
        heatBg = 'bg-teal-50/90 border-teal-200 text-teal-950';
        segmentLabel = 'Penarik Volume (Good Margin)';
        segmentBadge = 'bg-teal-700 text-white';
      } else if (cat.marginPercent >= 15) {
        heatColor = '#d97706'; // Moderate margin amber
        heatBg = 'bg-amber-50/90 border-amber-200 text-amber-950';
        segmentLabel = 'Volume Driver (Moderate)';
        segmentBadge = 'bg-amber-600 text-white';
      } else {
        heatColor = '#e11d48'; // Low margin rose
        heatBg = 'bg-rose-50/90 border-rose-200 text-rose-950';
        segmentLabel = 'Margin Tipis (Low Margin)';
        segmentBadge = 'bg-rose-600 text-white';
      }

      return {
        name: cat.categoryName,
        categoryColor: cat.categoryColor,
        revenue: cat.totalRevenue,
        cogs: cat.totalCOGS,
        profit: cat.grossProfit,
        margin: Math.round(cat.marginPercent * 10) / 10,
        contribution: Math.round(cat.revenueContributionPercent * 10) / 10,
        units: cat.totalUnitsSold,
        heatColor,
        heatBg,
        segmentLabel,
        segmentBadge,
        skuCount: cat.products.length,
        topProduct: cat.products[0]?.productName || 'Tidak ada produk',
      };
    });
  }, [monthlyCategoryBreakdown]);

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
              <button
                onClick={() => {
                  sound.playTap();
                  setActiveReportTab('SALES_DASHBOARD');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeReportTab === 'SALES_DASHBOARD'
                    ? 'bg-white text-indigo-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Sales Performance Dashboard</span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-indigo-100 text-indigo-700 font-bold uppercase">
                  Mingguan
                </span>
              </button>
            </div>

            {/* Tombol Jalankan Audit (Tabel Ringkasan per Hari & Perbaiki Massal) */}
            <button
              onClick={() => {
                sound.playTap();
                setIsDailyAuditPanelOpen((prev) => !prev);
              }}
              className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all border cursor-pointer shadow-xs ${
                isDailyAuditPanelOpen
                  ? 'bg-purple-900 text-white border-purple-800 ring-2 ring-purple-400/40'
                  : 'bg-purple-700 hover:bg-purple-800 text-white border-purple-600'
              }`}
              title="Jalankan Audit FIFO & Tampilkan Tabel Ringkasan per Hari dengan window.calculateFIFOGrossProfit"
            >
              <Calculator className="w-3.5 h-3.5 text-purple-200" />
              <span>Jalankan Audit</span>
              {fifoValidationSummary.transactionsWithDiscrepancyCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-rose-500 text-white font-black animate-pulse">
                  {fifoValidationSummary.transactionsWithDiscrepancyCount} Selisih
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-500 text-white font-bold">
                  OK
                </span>
              )}
            </button>

            {/* Validasi FIFO Button */}
            <button
              onClick={() => {
                sound.playTap();
                setIsFifoValidatorModalOpen(true);
              }}
              className="px-3 py-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-xs flex items-center gap-1.5 transition-colors border border-teal-200 cursor-pointer shadow-2xs"
              title="Audit & Validasi Laba Kotor FIFO Historis Seluruh Transaksi"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden sm:inline">Validasi FIFO</span>
              {fifoValidationSummary.transactionsWithDiscrepancyCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-rose-500 text-white font-black animate-pulse">
                  {fifoValidationSummary.transactionsWithDiscrepancyCount} Selisih
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-teal-200 text-teal-800 font-bold">
                  {fifoValidationSummary.totalTransactionsValidated} Tx OK
                </span>
              )}
            </button>

            {/* Rekonsiliasi FIFO Modal Button */}
            <button
              onClick={() => {
                sound.playTap();
                setIsReconcileModalOpen(true);
              }}
              className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 font-bold text-xs flex items-center gap-1.5 transition-colors border border-indigo-200 cursor-pointer shadow-2xs"
              title="Buka Modal Rekonsiliasi & Perbaikan Laba Transaksi FIFO"
            >
              <Wrench className="w-3.5 h-3.5 text-indigo-600" />
              <span className="hidden sm:inline">Rekonsiliasi Laba</span>
            </button>

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
            PANEL RINGKASAN HASIL AUDIT LABA FIFO PER HARI & PERBAIKI MASSAL
           ========================================================================= */}
        <DailyFifoAuditPanel
          isOpen={isDailyAuditPanelOpen}
          onClose={() => setIsDailyAuditPanelOpen(false)}
          transactions={transactions}
          products={products}
          onReconcileTransactions={onReconcileTransactions}
        />

        {/* =========================================================================
            TAB 0: SALES PERFORMANCE DASHBOARD (KOMPARASI MINGGUAN KATEGORI)
           ========================================================================= */}
        {activeReportTab === 'SALES_DASHBOARD' && (
          <SalesPerformanceDashboard
            transactions={transactions}
            products={products}
            categories={categories}
            cashflows={cashflows}
            customers={customers}
            currentUserRole={currentUserRole}
            storeName={storeName}
            dailySalesGoal={storeSettings?.dailySalesGoal}
            weeklySalesGoal={storeSettings?.weeklySalesGoal}
            monthlySalesGoal={storeSettings?.monthlySalesGoal}
            onOpenSettings={onOpenSettings}
          />
        )}

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

            {/* =========================================================================
                CATEGORY SALES HEATMAP & SEGMENT PERFORMANCE MATRIX (RECHARTS)
               ========================================================================= */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 md:p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-xl bg-emerald-100 text-emerald-800">
                      <Flame className="w-4 h-4 text-emerald-700" />
                    </span>
                    <h3 className="text-sm md:text-base font-extrabold text-slate-900">
                      Category Sales Heatmap ({MONTH_NAMES[selectedMonth]} {selectedYear})
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 font-mono">
                      Recharts
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Visualisasi perbandingan kontribusi omzet pendapatan dan margin keuntungan per segmen kategori produk.
                  </p>
                </div>

                {/* Heatmap Legend */}
                <div className="flex items-center gap-2 flex-wrap text-[10.5px] font-semibold">
                  <span className="text-slate-400">Intensitas Margin:</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    <span>&ge; 35% (Star)</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-100 text-teal-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-teal-600"></span>
                    <span>25-34%</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>15-24%</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    <span>&lt; 15%</span>
                  </span>
                </div>
              </div>

              {categoryHeatmapData.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  Belum ada data penjualan pada bulan ini untuk menghasilkan grafik heatmap.
                </div>
              ) : (
                <>
                  {/* Recharts Composed Bar & Margin Line Heatmap */}
                  <div className="h-72 w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={categoryHeatmapData}
                        margin={{ top: 10, right: 20, left: 15, bottom: 25 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis
                          dataKey="name"
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          angle={-15}
                          textAnchor="end"
                          height={45}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#64748b"
                          fontSize={11}
                          tickLine={false}
                          tickFormatter={(val) =>
                            val >= 1000000
                              ? `Rp ${(val / 1000000).toFixed(1)}M`
                              : `Rp ${(val / 1000).toFixed(0)}k`
                          }
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#4f46e5"
                          fontSize={11}
                          tickLine={false}
                          unit="%"
                          domain={[0, 100]}
                        />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-800 text-xs space-y-1.5 min-w-[210px]">
                                  <div className="font-extrabold text-sm border-b border-slate-800 pb-1 flex items-center justify-between">
                                    <span>{data.name}</span>
                                    <span className="font-mono text-[10px] text-slate-400">
                                      {data.skuCount} SKU
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-slate-300">
                                    <span>Total Omzet:</span>
                                    <span className="font-mono font-bold text-amber-300">
                                      {formatRupiah(data.revenue)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-slate-300">
                                    <span>Beban HPP (Modal):</span>
                                    <span className="font-mono text-rose-300">
                                      {formatRupiah(data.cogs)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-slate-300">
                                    <span>Laba Kotor:</span>
                                    <span className="font-mono font-bold text-emerald-400">
                                      {formatRupiah(data.profit)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-slate-300 pt-0.5 border-t border-slate-800">
                                    <span>Margin Keuntungan:</span>
                                    <span className="font-mono font-black text-indigo-400">
                                      {data.margin}%
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-slate-400 text-[10.5px]">
                                    <span>Kontribusi Omzet:</span>
                                    <span className="font-mono font-semibold text-sky-300">
                                      {data.contribution}%
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800 truncate">
                                    Top SKU: <span className="text-slate-200">{data.topProduct}</span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <RechartsLegend
                          verticalAlign="top"
                          align="right"
                          height={30}
                          wrapperStyle={{ fontSize: '11px', paddingBottom: '10px' }}
                        />
                        <Bar
                          yAxisId="left"
                          dataKey="revenue"
                          name="Omzet Penjualan (Rp)"
                          radius={[6, 6, 0, 0]}
                        >
                          {categoryHeatmapData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.heatColor} />
                          ))}
                        </Bar>
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="margin"
                          name="Margin Laba Kotor (%)"
                          stroke="#4f46e5"
                          strokeWidth={3}
                          dot={{ r: 4, fill: '#4f46e5', strokeWidth: 1, stroke: '#ffffff' }}
                          activeDot={{ r: 6 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Heatmap Performance Quadrant Tiles */}
                  <div className="pt-2">
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                      <span>Matriks Performa Segmen Produk (Heatmap Tiles)</span>
                      <span className="text-[11px] text-slate-400 font-normal lowercase">
                        diurutkan berdasarkan omzet & margin
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5">
                      {categoryHeatmapData.map((cat) => (
                        <div
                          key={cat.name}
                          onClick={() => toggleCategoryExpand(cat.name)}
                          className={`p-3 rounded-2xl border transition-all cursor-pointer hover:shadow-md active:scale-98 relative overflow-hidden ${cat.heatBg}`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1.5">
                            <span className="font-extrabold text-xs truncate" title={cat.name}>
                              {cat.name}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase shrink-0 ${cat.segmentBadge}`}>
                              {cat.margin}%
                            </span>
                          </div>

                          <div className="text-base font-black font-mono tracking-tight tabular-nums">
                            {formatRupiah(cat.revenue)}
                          </div>

                          <div className="flex items-center justify-between text-[10.5px] mt-1 pt-1 border-t border-black/10">
                            <span className="opacity-80">Laba Bersih:</span>
                            <span className="font-mono font-bold">{formatRupiah(cat.profit)}</span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] mt-0.5 opacity-75">
                            <span>Share Toko:</span>
                            <span className="font-mono font-semibold">{cat.contribution}%</span>
                          </div>

                          {/* Progress bar visual indicator of margin */}
                          <div className="w-full h-1 bg-black/10 rounded-full mt-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, Math.max(10, cat.margin))}%`,
                                backgroundColor: cat.heatColor,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
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
                                <td colSpan={10} className="p-3 md:px-6">
                                  <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-inner space-y-2">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-xs font-bold text-slate-700">
                                      <span className="flex items-center gap-1.5">
                                        <Tag className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Rincian HPP & Profit Produk di Kategori {cat.categoryName}</span>
                                      </span>
                                      <span className="text-[11px] text-slate-500 font-normal">
                                        {cat.products.length} Produk Terjual • Perhitungan Murni FIFO
                                      </span>
                                    </div>

                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-xs">
                                        <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                                          <tr>
                                            <th className="py-2 px-2.5">Nama Produk & Barcode</th>
                                            <th className="py-2 px-2 text-center">Terjual</th>
                                            <th className="py-2 px-2 text-right">Harga Modal (HPP FIFO/Unit)</th>
                                            <th className="py-2 px-2 text-right">Rata-rata Harga Jual</th>
                                            <th className="py-2 px-2 text-right">Total Omzet</th>
                                            <th className="py-2 px-2 text-right">Total HPP</th>
                                            <th className="py-2 px-2 text-right">Laba Kotor</th>
                                            <th className="py-2 px-2 text-right">Margin (%)</th>
                                            <th className="py-2 px-2 text-center">Audit FIFO</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {cat.products.map((p) => (
                                            <tr key={p.productId} className="hover:bg-slate-50/80 transition-colors">
                                              <td className="py-2.5 px-2.5 font-semibold text-slate-800">
                                                <div>{p.productName}</div>
                                                <div className="text-[10px] text-slate-400 font-mono">{p.barcode}</div>
                                              </td>
                                              <td className="py-2.5 px-2 text-center font-mono text-slate-700">
                                                {formatNumber(p.unitsSold)} {p.baseUnit}
                                              </td>
                                              <td className="py-2.5 px-2 text-right">
                                                <div className="font-mono font-bold text-rose-700">
                                                  {formatRupiah(p.costPrice)}
                                                </div>
                                                <div className="flex items-center justify-end gap-1 mt-0.5">
                                                  <span className="text-[9px] text-slate-400 font-medium">
                                                    {p.batchDeductionsSummary.length > 1 ? 'Rata-rata FIFO' : 'HPP FIFO'}
                                                  </span>
                                                  {p.batchDeductionsSummary.length > 1 && (
                                                    <span className="inline-flex items-center px-1.5 py-0.2 text-[9px] font-bold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                                                      {p.batchDeductionsSummary.length} Batch
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="py-2.5 px-2 text-right font-mono text-slate-800">
                                                {formatRupiah(p.avgSellingPrice)}
                                              </td>
                                              <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-900">
                                                {formatRupiah(p.totalRevenue)}
                                              </td>
                                              <td className="py-2.5 px-2 text-right font-mono font-semibold text-rose-600">
                                                {formatRupiah(p.totalCOGS)}
                                              </td>
                                              <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-700">
                                                {formatRupiah(p.grossProfit)}
                                              </td>
                                              <td className="py-2.5 px-2 text-right font-mono font-black text-indigo-700">
                                                {p.marginPercent.toFixed(1)}%
                                              </td>
                                              <td className="py-2.5 px-2 text-center">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    sound.playTap();
                                                    setSelectedFifoAuditProduct(p);
                                                  }}
                                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold transition-all shadow-2xs hover:scale-105 cursor-pointer"
                                                  title="Lihat rincian kalkulasi pemotongan batch FIFO produk ini"
                                                >
                                                  <Layers className="w-3.5 h-3.5 text-sky-600" />
                                                  <span>Detail FIFO</span>
                                                </button>
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

            {/* Recharts Line Chart: Tren Pendapatan & Laba Harian */}
            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center font-bold">
                    <TrendingUp className="w-4 h-4 text-sky-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Grafik Garis Tren Pendapatan Harian (Daily Revenue Trend)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Visualisasi pergerakan omzet dan laba harian toko menggunakan pustaka Recharts
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                  {[
                    { days: 7, label: '7 Hari' },
                    { days: 14, label: '14 Hari' },
                    { days: 30, label: '30 Hari' },
                  ].map((preset) => (
                    <button
                      key={preset.days}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setTrendDaysRange(preset.days);
                      }}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        trendDaysRange === preset.days
                          ? 'bg-sky-600 text-white font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-64 sm:h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyRevenueTrendData} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis 
                      tick={{ fontSize: 10, fill: '#64748b' }} 
                      axisLine={false} 
                      tickLine={false}
                      tickFormatter={(v) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}k`}
                    />
                    <RechartsTooltip
                      formatter={(val: any, name: any) => [formatRupiah(val), name]}
                      labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullDate || _label}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 'bold' }}
                    />
                    <RechartsLegend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                    <Line 
                      type="monotone" 
                      name="Omzet Pendapatan"
                      dataKey="Omzet" 
                      stroke="#0284c7" 
                      strokeWidth={3} 
                      dot={{ r: 4, fill: '#0284c7' }} 
                      activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2 }}
                    />
                    <Line 
                      type="monotone" 
                      name="Laba Kotor"
                      dataKey="Laba" 
                      stroke="#059669" 
                      strokeWidth={2.5} 
                      strokeDasharray="4 4"
                      dot={{ r: 3, fill: '#059669' }} 
                      activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
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
                      <th className="py-3 px-4 text-center">Terjual</th>
                      <th className="py-3 px-4 text-right">HPP FIFO/Unit</th>
                      <th className="py-3 px-4 text-right">Total Omzet</th>
                      <th className="py-3 px-4 text-right">Total HPP</th>
                      <th className="py-3 px-4 text-right">Laba Bersih</th>
                      <th className="py-3 px-4 text-right">Margin (%)</th>
                      <th className="py-3 px-4 text-center">Audit FIFO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dailyProductProfitability.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          Belum ada penjualan produk pada filter ini.
                        </td>
                      </tr>
                    ) : (
                      dailyProductProfitability.map((p) => (
                        <tr key={p.productId} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            <div>{p.productName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{p.barcode}</div>
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-medium">
                            {p.category}
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-medium text-slate-800">
                            {formatNumber(p.unitsSold)} {p.baseUnit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-700 font-semibold tabular-nums">
                            <div>{formatRupiah(p.costPrice)}</div>
                            <div className="text-[9px] text-slate-400 font-sans">
                              {p.batchDeductionsSummary.length > 1 ? `${p.batchDeductionsSummary.length} Batch` : 'FIFO'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-800 tabular-nums">
                            {formatRupiah(p.totalRevenue)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-700 tabular-nums font-semibold">
                            {formatRupiah(p.totalCOGS)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 tabular-nums">
                            {formatRupiah(p.profit)}
                          </td>
                          <td className="py-3 px-4 font-mono font-black text-indigo-700 tabular-nums text-right">
                            {p.margin.toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                sound.playTap();
                                setSelectedFifoAuditProduct(p);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold transition-all shadow-2xs hover:scale-105 cursor-pointer"
                              title="Lihat rincian kalkulasi pemotongan batch FIFO produk ini"
                            >
                              <Layers className="w-3.5 h-3.5 text-sky-600" />
                              <span>Detail FIFO</span>
                            </button>
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

        {/* =========================================================================
            MODAL AUDIT PEMOTONGAN BATCH FIFO (FIFO AUDIT LOG DIALOG)
           ========================================================================= */}
        {selectedFifoAuditProduct && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-5 md:p-7 shadow-2xl border border-slate-200 space-y-5 my-auto animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
              
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center shadow-2xs shrink-0">
                    <Layers className="w-6 h-6 text-teal-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg md:text-xl font-black text-slate-900">
                        Audit Kalkulasi Batch FIFO
                      </h3>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-200">
                        <ShieldCheck className="w-3 h-3 text-teal-700" />
                        Murni FIFO Terverifikasi
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      <strong className="text-slate-800 font-semibold">{selectedFifoAuditProduct.productName}</strong> • Barcode/SKU: <span className="font-mono">{selectedFifoAuditProduct.barcode}</span> • Satuan: <span className="font-semibold">{selectedFifoAuditProduct.baseUnit}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setSelectedFifoAuditProduct(null);
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Info Callout */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-600">
                <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800">Prinsip Akuntansi FIFO (First-In, First-Out):</span>{' '}
                  Setiap unit yang terjual memotong stok dari faktur pembelian (PO) tertua yang masuk ke toko. 
                  Jika harga beli supplier berbeda antar waktu (misal batch 1 seharga Rp 16.500 dan batch 2 seharga Rp 16.100), 
                  maka Total HPP adalah akumulasi harga modal riil tiap batch yang terpotong, dan Harga Modal satuan adalah rata-rata tertimbang FIFO (<span className="font-mono font-bold text-slate-800">Total HPP ÷ Jumlah Unit Terjual</span>).
                </div>
              </div>

              {/* 6 Key Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Terjual</div>
                  <div className="text-lg md:text-xl font-black text-slate-900 font-mono mt-0.5">
                    {formatNumber(selectedFifoAuditProduct.unitsSold)} {selectedFifoAuditProduct.baseUnit}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Rata-rata jual: {formatRupiah(selectedFifoAuditProduct.avgSellingPrice)}
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pendapatan (Omzet)</div>
                  <div className="text-lg md:text-xl font-black text-slate-900 font-mono mt-0.5">
                    {formatRupiah(selectedFifoAuditProduct.totalRevenue)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Semua faktur penjualan</div>
                </div>

                <div className="bg-rose-50/50 p-3.5 rounded-2xl border border-rose-200 shadow-2xs">
                  <div className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Rata-rata HPP Satuan (FIFO)</div>
                  <div className="text-lg md:text-xl font-black text-rose-700 font-mono mt-0.5">
                    {formatRupiah(selectedFifoAuditProduct.costPrice)}
                  </div>
                  <div className="text-[10px] text-rose-800 mt-0.5 font-medium">
                    {formatRupiah(selectedFifoAuditProduct.totalCOGS)} ÷ {selectedFifoAuditProduct.unitsSold} unit
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Beban Pokok (HPP)</div>
                  <div className="text-lg md:text-xl font-black text-rose-700 font-mono mt-0.5">
                    {formatRupiah(selectedFifoAuditProduct.totalCOGS)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Total modal batch terpakai</div>
                </div>

                <div className="bg-emerald-50/60 p-3.5 rounded-2xl border border-emerald-200 shadow-2xs">
                  <div className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Laba Kotor (Gross Profit)</div>
                  <div className="text-lg md:text-xl font-black text-emerald-700 font-mono mt-0.5">
                    {formatRupiah(selectedFifoAuditProduct.grossProfit)}
                  </div>
                  <div className="text-[10px] text-emerald-800 mt-0.5 font-medium">
                    Omzet dikurangi Total HPP
                  </div>
                </div>

                <div className="bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-200 shadow-2xs">
                  <div className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Margin Keuntungan</div>
                  <div className="text-lg md:text-xl font-black text-indigo-700 font-mono mt-0.5">
                    {selectedFifoAuditProduct.marginPercent.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-indigo-800 mt-0.5 font-medium">
                    {selectedFifoAuditProduct.marginPercent >= 20 ? 'Margin Sehat' : 'Margin Standar'}
                  </div>
                </div>
              </div>

              {/* Section 1: Rincian Batch Pembelian Yang Terpotong */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-teal-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      1. Komposisi Batch Pembelian yang Terpotong (FIFO Deduced Batches)
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500 font-semibold font-mono">
                    {selectedFifoAuditProduct.batchDeductionsSummary.length} Batch Digunakan
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/60 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">No. PO / Batch Pembelian</th>
                        <th className="py-2.5 px-4 text-center">Unit Terpotong</th>
                        <th className="py-2.5 px-4 text-right">Harga Modal Beli</th>
                        <th className="py-2.5 px-4 text-right">Subtotal HPP Batch</th>
                        <th className="py-2.5 px-4 text-center">Status / Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedFifoAuditProduct.batchDeductionsSummary.map((b, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-bold text-slate-800 font-mono">
                            <div className="flex items-center gap-2">
                              <span>{b.batchNumber}</span>
                              {b.isDeficit && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  Defisit
                                </span>
                              )}
                            </div>
                            {b.expiryDate && (
                              <div className="text-[10px] text-slate-400 font-sans">
                                Kadaluarsa: {b.expiryDate}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-700">
                            {formatNumber(b.quantity)} {selectedFifoAuditProduct.baseUnit}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-rose-700 font-semibold">
                            {formatRupiah(b.costPrice)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(b.totalCost)}
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            {b.isDeficit ? (
                              <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 font-medium">
                                Penjualan sebelum restock diinput
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-medium">
                                Alokasi Stok PO Sah
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                      <tr>
                        <td className="py-2.5 px-4">TOTAL TERPOTONG:</td>
                        <td className="py-2.5 px-4 text-center font-mono">
                          {formatNumber(selectedFifoAuditProduct.unitsSold)} {selectedFifoAuditProduct.baseUnit}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-500 font-normal">
                          Rata-rata: {formatRupiah(selectedFifoAuditProduct.costPrice)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-rose-700 text-sm">
                          {formatRupiah(selectedFifoAuditProduct.totalCOGS)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Section 2: Log Transaksi Penjualan Terkait */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-sky-600" />
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      2. Log Transaksi Penjualan Produk Ini (Sales Invoices)
                    </h4>
                  </div>
                  <span className="text-[11px] text-slate-500 font-semibold font-mono">
                    {selectedFifoAuditProduct.transactionAudits.length} Faktur Penjualan
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/60 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">No. Faktur (Invoice)</th>
                        <th className="py-2.5 px-4">Waktu Transaksi</th>
                        <th className="py-2.5 px-4 text-center">Terjual</th>
                        <th className="py-2.5 px-4 text-right">Omzet</th>
                        <th className="py-2.5 px-4 text-right">HPP FIFO</th>
                        <th className="py-2.5 px-4 text-right">Laba Kotor</th>
                        <th className="py-2.5 px-4">Rincian Batch Terpotong</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedFifoAuditProduct.transactionAudits.map((tx, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                            {tx.invoiceNumber}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600">
                            {tx.formattedDate}
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono font-semibold text-slate-700">
                            {formatNumber(tx.quantity)} {selectedFifoAuditProduct.baseUnit}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(tx.revenue)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-rose-700">
                            {formatRupiah(tx.cogs)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">
                            {formatRupiah(tx.profit)}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="space-y-1">
                              {tx.deductions.map((d, dIdx) => (
                                <div key={dIdx} className="text-[11px] font-mono text-slate-600 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                  <span>{d.quantity} {selectedFifoAuditProduct.baseUnit} dari <strong>{d.batchNumber}</strong> @ {formatRupiah(d.costPrice)} = {formatRupiah(d.totalCost)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section 3: Verifikasi Matematika Laba Rugi */}
              <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-teal-200 rounded-2xl p-4 md:p-5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-900 uppercase tracking-wider">
                  <Calculator className="w-4 h-4 text-teal-700" />
                  <span>Verifikasi Rumus Laba Rugi FIFO Produk Ini:</span>
                </div>
                <div className="text-xs text-slate-700 space-y-1 font-mono">
                  <div>• <strong>Total Omzet Penjualan</strong> = {formatRupiah(selectedFifoAuditProduct.totalRevenue)} ({formatNumber(selectedFifoAuditProduct.unitsSold)} {selectedFifoAuditProduct.baseUnit} x {formatRupiah(selectedFifoAuditProduct.avgSellingPrice)})</div>
                  <div>• <strong>Total Beban Pokok (HPP) FIFO</strong> = {selectedFifoAuditProduct.batchDeductionsSummary.map(b => `${b.quantity} x ${formatRupiah(b.costPrice)}`).join(' + ')} = <strong className="text-rose-700">{formatRupiah(selectedFifoAuditProduct.totalCOGS)}</strong></div>
                  <div>• <strong>Rata-rata HPP per Unit</strong> = {formatRupiah(selectedFifoAuditProduct.totalCOGS)} ÷ {formatNumber(selectedFifoAuditProduct.unitsSold)} = <strong className="text-rose-700">{formatRupiah(selectedFifoAuditProduct.costPrice)} / {selectedFifoAuditProduct.baseUnit}</strong></div>
                  <div>• <strong>Laba Kotor Bersih</strong> = {formatRupiah(selectedFifoAuditProduct.totalRevenue)} - {formatRupiah(selectedFifoAuditProduct.totalCOGS)} = <strong className="text-emerald-700 text-sm">{formatRupiah(selectedFifoAuditProduct.grossProfit)}</strong> (Margin: {selectedFifoAuditProduct.marginPercent.toFixed(1)}%)</div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setSelectedFifoAuditProduct(null);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
                >
                  Tutup Rincian Audit
                </button>
              </div>

            </div>
          </div>
        )}

        {/* =========================================================================
            MODAL 2: FIFO GROSS PROFIT RE-VALIDATION & AUDIT MODAL
           ========================================================================= */}
        {isFifoValidatorModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
            <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
              
              {/* Header */}
              <div className="p-4 sm:p-6 bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white flex items-center justify-between relative overflow-hidden shrink-0">
                <div className="flex items-center gap-3 relative z-10">
                  <div className="p-3 bg-teal-500/20 border border-teal-400/30 rounded-2xl text-teal-400">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                      <span>Audit Validasi Laba Kotor FIFO Historis</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-400/20 text-teal-300 border border-teal-400/30 font-mono uppercase">
                        calculateFIFOGrossProfit
                      </span>
                    </h3>
                    <p className="text-xs text-teal-200/80">
                      Menelusuri riwayat alokasi batch (`batchDeductions`), menguji HPP modal per batch vs HPP rata-rata tersimpan, dan memastikan formula Subtotal - (Qty x Modal) akurat 100%.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setIsFifoValidatorModalOpen(false);
                  }}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer relative z-10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1">

                {/* Status Banner */}
                {fifoValidationSummary.validationStatus === 'VALID_MATCH' && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-emerald-900">
                      <div className="font-bold text-sm">Status Validasi: Akurat 100% Sesuai FIFO Murni</div>
                      <div className="mt-0.5 text-emerald-800">
                        Seluruh <strong>{fifoValidationSummary.totalTransactionsValidated} transaksi</strong> ({fifoValidationSummary.totalItemsValidated} item) yang memiliki alokasi batch memiliki laba kotor yang 100% identik dengan akumulasi beban pokok dari batch kartu stok FIFO.
                      </div>
                    </div>
                  </div>
                )}

                {fifoValidationSummary.validationStatus === 'DISCREPANCY_DETECTED' && (
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-rose-900">
                      <div className="font-bold text-sm">Perhatian: Terdeteksi {fifoValidationSummary.transactionsWithDiscrepancyCount} Transaksi dengan Selisih Laba Kotor!</div>
                      <div className="mt-0.5 text-rose-800">
                        Perhitungan HPP rata-rata tersimpan memiliki selisih sebesar <strong>{formatRupiah(Math.abs(fifoValidationSummary.netDiscrepancyAmount))}</strong> dibandingkan akumulasi alokasi batch FIFO murni. Nilai laba kotor yang akurat adalah <strong>{formatRupiah(fifoValidationSummary.totalExactFifoGrossProfit)}</strong>.
                      </div>
                    </div>
                  </div>
                )}

                {fifoValidationSummary.validationStatus === 'HISTORICAL_NO_BATCHES' && (
                  <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex items-start gap-3">
                    <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-sky-900">
                      <div className="font-bold text-sm">Informasi Transaksi Historis</div>
                      <div className="mt-0.5 text-sky-800">
                        Sebagian transaksi dibuat sebelum modul pencatatan batch FIFO diaktifkan, sehingga validasi menggunakan HPP unit tersimpan sebagai dasar penentuan laba kotor.
                      </div>
                    </div>
                  </div>
                )}

                {/* 4 Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Divalidasi</div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      {formatNumber(fifoValidationSummary.totalTransactionsValidated)} Tx
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {formatNumber(fifoValidationSummary.totalItemsValidated)} item produk
                    </div>
                  </div>

                  <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-2xl">
                    <div className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Total Omzet Penjualan</div>
                    <div className="text-lg font-black text-sky-950 mt-1">
                      {formatRupiah(fifoValidationSummary.totalRevenue)}
                    </div>
                    <div className="text-[11px] text-sky-700 mt-0.5">
                      Nilai bersih transaksi
                    </div>
                  </div>

                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl">
                    <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Total HPP FIFO Murni</div>
                    <div className="text-lg font-black text-rose-950 mt-1">
                      {formatRupiah(fifoValidationSummary.totalExactFifoCogs)}
                    </div>
                    <div className="text-[11px] text-rose-700 mt-0.5">
                      Tersimpan: {formatRupiah(fifoValidationSummary.totalStoredCogs)}
                    </div>
                  </div>

                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                    <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Laba Kotor FIFO Murni</div>
                    <div className="text-lg font-black text-emerald-950 mt-1">
                      {formatRupiah(fifoValidationSummary.totalExactFifoGrossProfit)}
                    </div>
                    <div className="text-[11px] text-emerald-700 mt-0.5">
                      Margin: {fifoValidationSummary.totalRevenue > 0 
                        ? ((fifoValidationSummary.totalExactFifoGrossProfit / fifoValidationSummary.totalRevenue) * 100).toFixed(1) 
                        : '0.0'}%
                    </div>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setValidatorFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        validatorFilter === 'ALL'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Semua ({fifoValidationSummary.results.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setValidatorFilter('DISCREPANCY_ONLY')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        validatorFilter === 'DISCREPANCY_ONLY'
                          ? 'bg-rose-600 text-white shadow-2xs'
                          : 'text-rose-700 hover:text-rose-900'
                      }`}
                    >
                      <span>Ada Selisih</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        validatorFilter === 'DISCREPANCY_ONLY' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {fifoValidationSummary.transactionsWithDiscrepancyCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setValidatorFilter('WITH_BATCHES_ONLY')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        validatorFilter === 'WITH_BATCHES_ONLY'
                          ? 'bg-teal-700 text-white shadow-2xs'
                          : 'text-teal-800 hover:text-teal-950'
                      }`}
                    >
                      <span>Dengan Batch FIFO</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                        validatorFilter === 'WITH_BATCHES_ONLY' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-800'
                      }`}>
                        {fifoValidationSummary.transactionsWithBatchDeductionsCount}
                      </span>
                    </button>
                  </div>

                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Cari No. Faktur, Pelanggan, Produk..."
                      value={validatorSearchQuery}
                      onChange={(e) => setValidatorSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                {/* Transaction Validation Results List */}
                <div className="space-y-3">
                  {fifoValidationSummary.results
                    .filter((res) => {
                      // Tab Filter
                      if (validatorFilter === 'DISCREPANCY_ONLY' && !res.hasDiscrepancy) return false;
                      if (validatorFilter === 'WITH_BATCHES_ONLY' && !res.hasBatchDeductions) return false;

                      // Query Filter
                      if (validatorSearchQuery.trim()) {
                        const q = validatorSearchQuery.toLowerCase();
                        const matchInvoice = res.invoiceNumber.toLowerCase().includes(q);
                        const matchCustomer = (res.customerName || '').toLowerCase().includes(q);
                        const matchItems = res.items.some(i => i.productName.toLowerCase().includes(q));
                        return matchInvoice || matchCustomer || matchItems;
                      }

                      return true;
                    })
                    .map((res) => {
                      const isExpanded = expandedValidationTxId === res.transactionId;

                      return (
                        <div
                          key={res.transactionId}
                          className={`rounded-2xl border transition-all ${
                            res.hasDiscrepancy
                              ? 'border-rose-300 bg-rose-50/20 shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          {/* Transaction Card Header */}
                          <div
                            onClick={() => {
                              sound.playTap();
                              setExpandedValidationTxId(isExpanded ? null : res.transactionId);
                            }}
                            className="p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-xl shrink-0 ${
                                res.hasDiscrepancy 
                                  ? 'bg-rose-100 text-rose-700' 
                                  : res.hasBatchDeductions 
                                    ? 'bg-teal-100 text-teal-800' 
                                    : 'bg-slate-100 text-slate-600'
                              }`}>
                                <Receipt className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-xs text-slate-900">{res.invoiceNumber}</span>
                                  <span className="text-[11px] text-slate-500">• {res.dateStr}</span>
                                  {res.customerName && (
                                    <span className="text-[11px] text-slate-600 font-medium">({res.customerName})</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                                  <span>{res.items.length} item produk</span>
                                  <span>•</span>
                                  <span className="capitalize">{res.paymentMethod.replace(/_/g, ' ')}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 ml-auto">
                              <div className="text-right">
                                <div className="text-xs font-mono font-bold text-slate-900">
                                  Omzet: {formatRupiah(res.finalAmount)}
                                </div>
                                <div className="text-[11px] font-mono flex items-center gap-1.5 justify-end">
                                  <span className="text-rose-700 font-semibold">HPP: {formatRupiah(res.totalExactFifoCogs)}</span>
                                  <span>|</span>
                                  <span className="text-emerald-700 font-bold">Laba: {formatRupiah(res.totalExactFifoGrossProfit)}</span>
                                </div>
                              </div>

                              <div className="shrink-0 flex items-center gap-2">
                                {res.hasDiscrepancy ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold border border-rose-200">
                                    Selisih {formatRupiah(Math.abs(res.profitDifference))}
                                  </span>
                                ) : res.hasBatchDeductions ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-100 text-teal-800 font-bold border border-teal-200">
                                    100% Cocok FIFO
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-medium border border-slate-200">
                                    Fallback
                                  </span>
                                )}

                                <button
                                  type="button"
                                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Expanded Itemized FIFO Audit Section */}
                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/50 p-4 space-y-3">
                              <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-teal-700" />
                                <span>Rincian Item & Penelusuran Batch FIFO:</span>
                              </div>

                              <div className="space-y-2">
                                {res.items.map((item, iIdx) => (
                                  <div
                                    key={iIdx}
                                    className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div>
                                        <div className="text-xs font-bold text-slate-900">{item.productName}</div>
                                        <div className="text-[11px] text-slate-500">
                                          {item.quantity} {item.unitName} (Total {item.baseUnits} unit dasar) @ {formatRupiah(item.unitPrice)} = <strong>{formatRupiah(item.subtotal)}</strong>
                                        </div>
                                      </div>

                                      <div className="text-right">
                                        <div className="text-xs font-mono font-bold text-emerald-700">
                                          Laba Kotor FIFO: {formatRupiah(item.exactFifoGrossProfit)}
                                        </div>
                                        <div className="text-[11px] font-mono text-rose-700">
                                          Total HPP FIFO: {formatRupiah(item.exactFifoCogs)} (Efektif: {formatRupiah(item.effectiveFifoUnitCost)}/unit)
                                        </div>
                                      </div>
                                    </div>

                                    {/* Batch Deductions Trace */}
                                    <div className="pt-2 border-t border-slate-100">
                                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        Alokasi Batch Kartu Stok (FIFO):
                                      </div>

                                      {item.batchDeductions && item.batchDeductions.length > 0 ? (
                                        <div className="space-y-1">
                                          {item.batchDeductions.map((b, bIdx) => (
                                            <div
                                              key={bIdx}
                                              className="p-2 bg-slate-50 rounded-lg text-[11px] font-mono text-slate-700 flex flex-wrap items-center justify-between gap-2 border border-slate-200"
                                            >
                                              <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-teal-500 shrink-0" />
                                                <span>Batch: <strong>{b.batchNumber || b.batchId}</strong></span>
                                                {b.expiryDate && (
                                                  <span className="text-[10px] text-slate-500">(Exp: {b.expiryDate})</span>
                                                )}
                                              </div>
                                              <div>
                                                {b.quantity} unit dasar x {formatRupiah(b.costPrice)} = <strong className="text-rose-700">{formatRupiah(b.totalCost)}</strong>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="p-2 bg-amber-50 text-amber-800 rounded-lg text-[11px] border border-amber-200">
                                          Item ini tidak memiliki rekaman alokasi batch murni. Menggunakan HPP rata-rata tersimpan: {formatRupiah(item.storedCostPrice)} per unit.
                                        </div>
                                      )}
                                    </div>

                                    {/* Math Validation Formula */}
                                    <div className="p-2 bg-teal-50/50 rounded-lg text-[11px] font-mono text-teal-900 border border-teal-200/60 flex items-center justify-between">
                                      <span>Rumus: Subtotal ({formatRupiah(item.subtotal)}) - HPP FIFO ({formatRupiah(item.exactFifoCogs)})</span>
                                      <span className="font-bold text-emerald-700">= {formatRupiah(item.exactFifoGrossProfit)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
                <div className="text-xs text-slate-600 hidden sm:block">
                  Total Divalidasi: <strong>{fifoValidationSummary.totalTransactionsValidated} transaksi</strong> • Selisih Ditemukan: <strong>{fifoValidationSummary.transactionsWithDiscrepancyCount}</strong>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setIsFifoValidatorModalOpen(false);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer ml-auto"
                >
                  Tutup Hasil Validasi
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Modal 3: Standalone Visual FIFO Reconciliation & Comparison Modal */}
        <FifoReconciliationModal
          isOpen={isReconcileModalOpen}
          onClose={() => setIsReconcileModalOpen(false)}
          transactions={transactions}
          products={products}
          onReconcile={async (reconciledTxs) => {
            if (onReconcileTransactions) {
              await onReconcileTransactions(reconciledTxs);
            }
          }}
        />

      </div>
    </div>
  );
};
