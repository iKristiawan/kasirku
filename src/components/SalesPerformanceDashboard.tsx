import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend,
  ReferenceLine,
  PieChart,
  Pie
} from 'recharts';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  Sparkles, 
  DollarSign, 
  Package, 
  Tag, 
  ArrowUpRight, 
  ArrowDownRight, 
  Layers, 
  CheckCircle2, 
  Filter, 
  Percent, 
  Flame, 
  ChevronRight,
  Eye,
  RefreshCw,
  Boxes,
  ShieldAlert,
  AlertTriangle,
  ShieldCheck,
  Target,
  Settings,
  Clock,
  RotateCcw,
  EyeOff,
  MessageCircle,
  ExternalLink,
  Truck,
  Trophy,
  Users,
  Coffee,
  Repeat,
  UserCheck,
  Activity,
  Award,
  Wallet,
  Receipt,
  Star,
  Minus
} from 'lucide-react';
import { Transaction, Product, ProductCategory, Supplier, UserRole, CashflowRecord, Customer, AttendanceRecord, ChartColorThemeConfig, CategorySalesGoal, RestockOrder, TaxAdjustment, TaxRecord, StoreSettings } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getCategoryColor } from '../utils/categoryColors';
import { getItemFifoCogs, verifyBatchStockIntegrity } from '../utils/fifoUtils';
import { FifoBatchVisualizer } from './FifoBatchVisualizer';
import { FifoGrossProfitAuditPanel } from './FifoGrossProfitAuditPanel';
import { BatchStockIntegrityPanel } from './BatchStockIntegrityPanel';
import { CategoryTrendFilterBar } from './CategoryTrendFilterBar';
import { GrossProfitMarginChart } from './GrossProfitMarginChart';
import { CategoryProfitMarginChart } from './CategoryProfitMarginChart';
import { TopProductsByMarginTable } from './TopProductsByMarginTable';
import { CategorySalesPieChart } from './CategorySalesPieChart';
import { CategoryStockPieChart } from './CategoryStockPieChart';
import { GrossProfitByCategoryPanel } from './GrossProfitByCategoryPanel';
import { HourlyTransactionChart } from './HourlyTransactionChart';
import { WeeklyRevenueComparisonAreaChart } from './WeeklyRevenueComparisonAreaChart';
import { ThirtyDayRevenueTrendChart } from './ThirtyDayRevenueTrendChart';
import { ThirtyDayNetProfitLineChart } from './ThirtyDayNetProfitLineChart';
import { PaymentMethodDonutChart } from './PaymentMethodDonutChart';
import { ProductStockThresholdChart } from './ProductStockThresholdChart';
import { StockRunwayProjectionCard } from './StockRunwayProjectionCard';
import { NewCustomerGrowthAreaChart } from './NewCustomerGrowthAreaChart';
import { CustomerSatisfactionReportPanel } from './CustomerSatisfactionReportPanel';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { MonthlyDiscountEffectivenessChart } from './MonthlyDiscountEffectivenessChart';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartThemeProvider, useChartTheme } from './ChartThemeContext';
import { ChartThemeSelector } from './ChartThemeSelector';
import { ShiftEfficiencyCard } from './ShiftEfficiencyCard';
import { CategorySalesTargetEvaluationPanel } from './CategorySalesTargetEvaluationPanel';
import { PiutangDueAlertBanner } from './PiutangDueAlertBanner';
import { TaxDueAlertBanner } from './TaxDueAlertBanner';
import { PkpThresholdAlertBanner } from './PkpThresholdAlertBanner';
import { ProductVolumeMarginScatterChart } from './ProductVolumeMarginScatterChart';
import { CrossBranchStockPanel } from './CrossBranchStockPanel';

interface SalesPerformanceDashboardProps {
  transactions: Transaction[];
  products: Product[];
  categories?: ProductCategory[];
  suppliers?: Supplier[];
  cashflows?: CashflowRecord[];
  customers?: Customer[];
  attendances?: AttendanceRecord[];
  currentUserRole?: UserRole;
  storeName?: string;
  bcaAccountNumber?: string;
  bcaAccountName?: string;
  dailySalesGoal?: number;
  weeklySalesGoal?: number;
  monthlySalesGoal?: number;
  categorySalesGoals?: Record<string, CategorySalesGoal>;
  chartTheme?: ChartColorThemeConfig;
  onUpdateChartTheme?: (theme: ChartColorThemeConfig) => void;
  onOpenSettings?: () => void;
  onNavigateToPiutang?: () => void;
  onSaveProducts?: (products: Product[]) => Promise<void> | void;
  purchases?: RestockOrder[];
  taxRecords?: TaxRecord[];
  taxAdjustments?: TaxAdjustment[];
  storeSettings?: StoreSettings;
  onUpdateStoreSettings?: (nextSettings: StoreSettings) => void;
  onNavigateToTax?: () => void;
  currentUserName?: string;
}

type PeriodType = 'THIS_WEEK' | 'LAST_WEEK' | 'LAST_14_DAYS' | 'LAST_30_DAYS';
type MetricType = 'REVENUE' | 'UNITS' | 'PROFIT';
type SortType = 'REVENUE_DESC' | 'UNITS_DESC' | 'PROFIT_DESC' | 'GROWTH_DESC';

const SalesPerformanceDashboardContent: React.FC<
  Omit<SalesPerformanceDashboardProps, 'chartTheme' | 'onUpdateChartTheme'>
> = ({
  transactions = [],
  products = [],
  categories = [],
  suppliers = [],
  cashflows = [],
  customers = [],
  attendances = [],
  currentUserRole = 'ADMIN',
  storeName = 'KasirKu POS',
  bcaAccountNumber,
  bcaAccountName,
  dailySalesGoal = 5000000,
  weeklySalesGoal = 30000000,
  monthlySalesGoal = 120000000,
  categorySalesGoals = {},
  onOpenSettings,
  onNavigateToPiutang,
  onSaveProducts,
  purchases = [],
  taxRecords = [],
  taxAdjustments = [],
  storeSettings,
  onUpdateStoreSettings,
  onNavigateToTax,
  currentUserName,
}) => {
  const { palette, isDefaultTheme } = useChartTheme();
  const [period, setPeriod] = useState<PeriodType>('THIS_WEEK');
  const [metric, setMetric] = useState<MetricType>('REVENUE');
  const [sortBy, setSortBy] = useState<SortType>('REVENUE_DESC');
  const [compareWithPrevious, setCompareWithPrevious] = useState<boolean>(true);
  const [selectedCategoryHighlight, setSelectedCategoryHighlight] = useState<string | null>(null);
  const [dashboardTab, setDashboardTab] = useState<'PERFORMANCE' | 'FIFO_BATCHES' | 'BATCH_INTEGRITY' | 'FIFO_AUDIT'>('PERFORMANCE');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isIntegrityModalOpen, setIsIntegrityModalOpen] = useState<boolean>(false);
  const [expiryAlertFilter, setExpiryAlertFilter] = useState<'ALL' | 'EXPIRED' | 'CRITICAL' | 'WARNING'>('ALL');
  const [expiryAlertSearch, setExpiryAlertSearch] = useState<string>('');
  const [selectedExpirySupplierId, setSelectedExpirySupplierId] = useState<string>('AUTO');
  const [hiddenCategories, setHiddenCategories] = useState<string[]>([]);
  const [showOverallMarginLine, setShowOverallMarginLine] = useState<boolean>(true);
  const [focusedMarginCategory, setFocusedMarginCategory] = useState<string | null>(null);
  const [topProductsMetric, setTopProductsMetric] = useState<MetricType>('UNITS');
  const [hoveredTopProductIdx, setHoveredTopProductIdx] = useState<number | null>(null);
  const [pinnedTopProductIdx, setPinnedTopProductIdx] = useState<number | null>(null);
  const [quietHourScope, setQuietHourScope] = useState<'OPERATIONAL' | 'ACTIVE_ONLY'>('OPERATIONAL');
  const [isWeeklyGoalFullscreen, setIsWeeklyGoalFullscreen] = useState<boolean>(false);
  const [isGrossProfit7dFullscreen, setIsGrossProfit7dFullscreen] = useState<boolean>(false);
  const [isCategoryCompFullscreen, setIsCategoryCompFullscreen] = useState<boolean>(false);
  const [isMargin30dFullscreen, setIsMargin30dFullscreen] = useState<boolean>(false);
  const [isTop5DonutFullscreen, setIsTop5DonutFullscreen] = useState<boolean>(false);
  const hiddenCategorySet = useMemo(() => new Set(hiddenCategories), [hiddenCategories]);

  // Verifikasi Integritas Sisa Stok Batch (Total remainingQuantity vs stockInBaseUnit)
  const batchIntegritySummary = useMemo(() => {
    try {
      const verifyFn = (typeof window !== 'undefined' && (window as any).verifyBatchStockIntegrity)
        ? (window as any).verifyBatchStockIntegrity
        : verifyBatchStockIntegrity;
      return verifyFn(products);
    } catch (e) {
      return null;
    }
  }, [products]);

  // Map product id -> product for fast lookups
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // FIFO Batch Expiry & Stock Overview across all products (Automated 30-Day Expiry Alert Engine)
  const batchExpiryOverview = useMemo(() => {
    let totalBatches = 0;
    let expiredBatches = 0;
    let criticalBatches = 0;
    let warningBatches = 0;
    let safeBatches = 0;
    let totalUnitsAtRisk = 0;
    let totalValueAtRisk = 0;

    const allUrgentItems: Array<{
      productId: string;
      productName: string;
      category: string;
      batchId: string;
      batchNumber: string;
      remainingQuantity: number;
      baseUnit: string;
      expiryDate: string;
      daysUntilExpiry: number;
      costPrice: number;
      sellingPrice: number;
      stockValueAtRisk: number;
      status: 'EXPIRED' | 'CRITICAL' | 'WARNING';
      recommendedAction: string;
      supplierId?: string;
      supplierName: string;
      supplierWhatsapp: string;
    }> = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const oneDayMs = 86400000;

    const parseExpiryLocalMs = (dateStr: string): number => {
      const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())
        ? `${dateStr.trim()}T00:00:00`
        : dateStr.trim();
      const parsed = new Date(normalized);
      if (isNaN(parsed.getTime())) return NaN;
      parsed.setHours(0, 0, 0, 0);
      return parsed.getTime();
    };

    const resolveSupplierForItem = (prod: Product, batchSupplierName?: string) => {
      if (prod.supplierId) {
        const byId = suppliers.find((s) => s.id === prod.supplierId);
        if (byId) return byId;
      }
      if (batchSupplierName) {
        const clean = batchSupplierName.trim().toLowerCase();
        const byName = suppliers.find((s) => s.name.trim().toLowerCase() === clean);
        if (byName) return byName;
      }
      const byCategory = suppliers.find(
        (s) => Array.isArray(s.suppliedCategories) && s.suppliedCategories.includes(prod.category)
      );
      return byCategory || null;
    };

    products.filter((p) => (p.productType || 'BARANG') === 'BARANG').forEach((p) => {
      const batches = (p.batches && p.batches.length > 0)
        ? p.batches.filter((b) => b.remainingQuantity > 0)
        : (p.stockInBaseUnit > 0 && p.expiryDate ? [{
            id: `legacy_${p.id}`,
            batchNumber: 'BATCH-AWAL',
            remainingQuantity: p.stockInBaseUnit,
            expiryDate: p.expiryDate,
            costPrice: p.costPrice || 0,
            supplierName: undefined,
          }] : []);

      const baseSellingPrice = p.units?.[0]?.sellingPrice || 0;

      batches.forEach((b) => {
        totalBatches++;
        if (b.expiryDate) {
          const expTime = parseExpiryLocalMs(b.expiryDate);
          if (isNaN(expTime)) {
            safeBatches++;
            return;
          }
          const days = Math.round((expTime - todayMs) / oneDayMs);
          const batchCost = (b as any).costPrice !== undefined ? (b as any).costPrice : (p.costPrice || 0);
          const stockValueAtRisk = Math.round((b.remainingQuantity || 0) * batchCost);
          const matchedSupplier = resolveSupplierForItem(p, (b as any).supplierName);
          const resolvedSupplierName = matchedSupplier?.name || (b as any).supplierName || 'Supplier Belum Terkait';
          const resolvedSupplierWa = matchedSupplier?.whatsapp || matchedSupplier?.phone || '';

          if (days < 0) {
            expiredBatches++;
            totalUnitsAtRisk += b.remainingQuantity || 0;
            totalValueAtRisk += stockValueAtRisk;
            allUrgentItems.push({
              productId: p.id,
              productName: p.name,
              category: p.category || 'Umum',
              batchId: b.id,
              batchNumber: b.batchNumber || 'BATCH',
              remainingQuantity: b.remainingQuantity,
              baseUnit: p.baseUnit || 'PCS',
              expiryDate: b.expiryDate,
              daysUntilExpiry: days,
              costPrice: batchCost,
              sellingPrice: baseSellingPrice,
              stockValueAtRisk,
              status: 'EXPIRED',
              recommendedAction: 'Tarik dari Rak / Retur Supplier',
              supplierId: matchedSupplier?.id,
              supplierName: resolvedSupplierName,
              supplierWhatsapp: resolvedSupplierWa,
            });
          } else if (days <= 7) {
            criticalBatches++;
            totalUnitsAtRisk += b.remainingQuantity || 0;
            totalValueAtRisk += stockValueAtRisk;
            allUrgentItems.push({
              productId: p.id,
              productName: p.name,
              category: p.category || 'Umum',
              batchId: b.id,
              batchNumber: b.batchNumber || 'BATCH',
              remainingQuantity: b.remainingQuantity,
              baseUnit: p.baseUnit || 'PCS',
              expiryDate: b.expiryDate,
              daysUntilExpiry: days,
              costPrice: batchCost,
              sellingPrice: baseSellingPrice,
              stockValueAtRisk,
              status: 'CRITICAL',
              recommendedAction: 'Diskon Clearance / Tukar Stok',
              supplierId: matchedSupplier?.id,
              supplierName: resolvedSupplierName,
              supplierWhatsapp: resolvedSupplierWa,
            });
          } else if (days <= 30) {
            warningBatches++;
            totalUnitsAtRisk += b.remainingQuantity || 0;
            totalValueAtRisk += stockValueAtRisk;
            allUrgentItems.push({
              productId: p.id,
              productName: p.name,
              category: p.category || 'Umum',
              batchId: b.id,
              batchNumber: b.batchNumber || 'BATCH',
              remainingQuantity: b.remainingQuantity,
              baseUnit: p.baseUnit || 'PCS',
              expiryDate: b.expiryDate,
              daysUntilExpiry: days,
              costPrice: batchCost,
              sellingPrice: baseSellingPrice,
              stockValueAtRisk,
              status: 'WARNING',
              recommendedAction: 'Rotasi FEFO / Koordinasi Supplier',
              supplierId: matchedSupplier?.id,
              supplierName: resolvedSupplierName,
              supplierWhatsapp: resolvedSupplierWa,
            });
          } else {
            safeBatches++;
          }
        } else {
          safeBatches++;
        }
      });
    });

    allUrgentItems.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    return {
      totalBatches,
      expiredBatches,
      criticalBatches,
      warningBatches,
      safeBatches,
      totalUnitsAtRisk,
      totalValueAtRisk,
      urgentCount: expiredBatches + criticalBatches + warningBatches,
      next30DaysCount: criticalBatches + warningBatches,
      allUrgentItems,
      urgentItems: allUrgentItems.slice(0, 6),
    };
  }, [products, suppliers]);

  const filteredExpiringItems = useMemo(() => {
    const q = expiryAlertSearch.trim().toLowerCase();
    return batchExpiryOverview.allUrgentItems.filter((item) => {
      const matchFilter = expiryAlertFilter === 'ALL' || item.status === expiryAlertFilter;
      const matchSearch =
        !q ||
        item.productName.toLowerCase().includes(q) ||
        item.batchNumber.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [batchExpiryOverview.allUrgentItems, expiryAlertFilter, expiryAlertSearch]);

  const buildSupplierExpiryWhatsAppUrl = (
    itemsToNotify: typeof batchExpiryOverview.allUrgentItems,
    overrideSupplier?: Supplier | null
  ): string => {
    const targetSupplier =
      overrideSupplier ||
      (itemsToNotify.length === 1 && itemsToNotify[0].supplierId
        ? suppliers.find((s) => s.id === itemsToNotify[0].supplierId) || null
        : null);

    const rawPhone =
      targetSupplier?.whatsapp ||
      targetSupplier?.phone ||
      (itemsToNotify.length === 1 ? itemsToNotify[0].supplierWhatsapp : '') ||
      '';

    const supplierGreeting = targetSupplier
      ? `${targetSupplier.name}${targetSupplier.contactPerson ? ` (${targetSupplier.contactPerson})` : ''}`
      : itemsToNotify.length === 1 && itemsToNotify[0].supplierName !== 'Supplier Belum Terkait'
      ? itemsToNotify[0].supplierName
      : 'Mitra Supplier';

    const lines: string[] = [];
    lines.push(`⚠️ *PEMBERITAHUAN PRODUK MENDEKATI KEDALUWARSA*`);
    lines.push(`🏪 *${storeName}*`);
    lines.push(`📅 Tanggal: ${formatDateTime(Date.now())}`);
    lines.push(`--------------------------------`);
    lines.push(`Halo *${supplierGreeting}*,`);
    lines.push(
      `Berikut daftar produk / batch di toko kami yang kedaluwarsa dalam 30 hari ke depan dan membutuhkan koordinasi retur/tukar guling atau dukungan promo:`
    );
    lines.push('');

    itemsToNotify.forEach((item, idx) => {
      const statusText =
        item.daysUntilExpiry < 0
          ? `SUDAH LEWAT ${Math.abs(item.daysUntilExpiry)} hari`
          : item.daysUntilExpiry === 0
          ? 'KEDALUWARSA HARI INI'
          : `Sisa ${item.daysUntilExpiry} hari lagi`;
      lines.push(`${idx + 1}. *${item.productName}*`);
      lines.push(`   • Batch: #${item.batchNumber} | Exp: ${item.expiryDate} (${statusText})`);
      lines.push(`   • Sisa Stok: ${formatNumber(item.remainingQuantity)} ${item.baseUnit}`);
    });

    lines.push('');
    lines.push(`--------------------------------`);
    lines.push(`Mohon konfirmasi kesediaan jadwal retur / penggantian stok baru. Terima kasih!`);

    const msg = lines.join('\n');
    const digits = rawPhone.replace(/\D/g, '');
    if (digits.length >= 8) {
      return formatWhatsAppUrl(digits, msg);
    }
    return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  };

  // Determine date ranges for current and previous periods
  const { currentStart, currentEnd, previousStart, previousEnd, periodLabel, previousLabel } = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    let cStart = new Date();
    let cEnd = new Date();
    let pStart = new Date();
    let pEnd = new Date();
    let pLabel = 'Minggu Ini';
    let prevLabel = 'Minggu Lalu';

    if (period === 'THIS_WEEK') {
      const day = now.getDay();
      const diffToMonday = now.getDate() - (day === 0 ? 6 : day - 1);
      cStart = new Date(now.setDate(diffToMonday));
      cStart.setHours(0, 0, 0, 0);
      cEnd = new Date(cStart);
      cEnd.setDate(cStart.getDate() + 6);
      cEnd.setHours(23, 59, 59, 999);

      pStart = new Date(cStart);
      pStart.setDate(cStart.getDate() - 7);
      pEnd = new Date(cEnd);
      pEnd.setDate(cEnd.getDate() - 7);

      pLabel = `Minggu Ini (${cStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${cEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})`;
      prevLabel = `Minggu Lalu (${pStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${pEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})`;
    } else if (period === 'LAST_WEEK') {
      const day = now.getDay();
      const diffToLastMonday = now.getDate() - (day === 0 ? 6 : day - 1) - 7;
      cStart = new Date(now.setDate(diffToLastMonday));
      cStart.setHours(0, 0, 0, 0);
      cEnd = new Date(cStart);
      cEnd.setDate(cStart.getDate() + 6);
      cEnd.setHours(23, 59, 59, 999);

      pStart = new Date(cStart);
      pStart.setDate(cStart.getDate() - 7);
      pEnd = new Date(cEnd);
      pEnd.setDate(cEnd.getDate() - 7);

      pLabel = `Minggu Lalu (${cStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${cEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})`;
      prevLabel = `2 Minggu Lalu (${pStart.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - ${pEnd.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})`;
    } else if (period === 'LAST_14_DAYS') {
      cStart = new Date(now.getTime() - 14 * 86400000);
      cStart.setHours(0, 0, 0, 0);
      cEnd = new Date(now);
      cEnd.setHours(23, 59, 59, 999);

      pStart = new Date(cStart.getTime() - 14 * 86400000);
      pEnd = new Date(cStart.getTime() - 1);

      pLabel = '14 Hari Terakhir';
      prevLabel = '14 Hari Sebelumnya';
    } else {
      cStart = new Date(now.getTime() - 30 * 86400000);
      cStart.setHours(0, 0, 0, 0);
      cEnd = new Date(now);
      cEnd.setHours(23, 59, 59, 999);

      pStart = new Date(cStart.getTime() - 30 * 86400000);
      pEnd = new Date(cStart.getTime() - 1);

      pLabel = '30 Hari Terakhir';
      prevLabel = '30 Hari Sebelumnya';
    }

    return {
      currentStart: cStart.getTime(),
      currentEnd: cEnd.getTime(),
      previousStart: pStart.getTime(),
      previousEnd: pEnd.getTime(),
      periodLabel: pLabel,
      previousLabel: prevLabel,
    };
  }, [period]);

  // Aggregate Category performance for both periods
  const { categoryList, totalCurrentRevenue, totalPreviousRevenue, totalCurrentUnits, totalCurrentProfit, overallGrowthPercent } = useMemo(() => {
    interface CatAgg {
      name: string;
      currentRevenue: number;
      previousRevenue: number;
      currentUnits: number;
      previousUnits: number;
      currentCOGS: number;
      previousCOGS: number;
      productSales: Map<string, { name: string; units: number; revenue: number }>;
    }

    const catMap = new Map<string, CatAgg>();

    // Helper to get or create category entry
    const getCat = (catName: string): CatAgg => {
      const clean = catName || 'Umum';
      if (!catMap.has(clean)) {
        catMap.set(clean, {
          name: clean,
          currentRevenue: 0,
          previousRevenue: 0,
          currentUnits: 0,
          previousUnits: 0,
          currentCOGS: 0,
          previousCOGS: 0,
          productSales: new Map(),
        });
      }
      return catMap.get(clean)!;
    };

    // Ensure all registered categories appear even if 0 sales
    categories.forEach((c) => getCat(c.name));
    products.forEach((p) => {
      if (p.category) getCat(p.category);
    });

    // Process transactions
    transactions.forEach((tx) => {
      const isCurrent = tx.timestamp >= currentStart && tx.timestamp <= currentEnd;
      const isPrevious = tx.timestamp >= previousStart && tx.timestamp <= previousEnd;

      if (!isCurrent && !isPrevious) return;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = prod?.category || 'Umum';
        const cat = getCat(catName);

        const units = item.quantity * (item.conversionFactor || 1);
        const cogs = getItemFifoCogs(item, prod);

        if (isCurrent) {
          cat.currentRevenue += item.totalAmount;
          cat.currentUnits += units;
          cat.currentCOGS += cogs;

          const pMap = cat.productSales;
          const pEntry = pMap.get(item.productId) || { name: item.productName || prod?.name || 'Produk', units: 0, revenue: 0 };
          pEntry.units += units;
          pEntry.revenue += item.totalAmount;
          pMap.set(item.productId, pEntry);
        } else if (isPrevious) {
          cat.previousRevenue += item.totalAmount;
          cat.previousUnits += units;
          cat.previousCOGS += cogs;
        }
      });
    });

    const list = Array.from(catMap.values()).map((c) => {
      const profit = c.currentRevenue - c.currentCOGS;
      const previousProfit = c.previousRevenue - c.previousCOGS;
      const margin = c.currentRevenue > 0 ? (profit / c.currentRevenue) * 100 : 0;
      const growth = c.previousRevenue > 0
        ? ((c.currentRevenue - c.previousRevenue) / c.previousRevenue) * 100
        : c.currentRevenue > 0 ? 100 : 0;

      // Find top product in this category
      let topProduct = '-';
      let topProdUnits = 0;
      c.productSales.forEach((p) => {
        if (p.units > topProdUnits) {
          topProdUnits = p.units;
          topProduct = `${p.name} (${p.units}x)`;
        }
      });

      return {
        name: c.name,
        color: getCategoryColor(c.name, categories),
        currentRevenue: c.currentRevenue,
        previousRevenue: c.previousRevenue,
        currentUnits: c.currentUnits,
        previousUnits: c.previousUnits,
        currentProfit: profit,
        previousProfit,
        marginPercent: margin,
        growthPercent: growth,
        topProduct,
      };
    });

    const totCurRev = list.reduce((sum, item) => sum + item.currentRevenue, 0);
    const totPrevRev = list.reduce((sum, item) => sum + item.previousRevenue, 0);
    const totCurUnits = list.reduce((sum, item) => sum + item.currentUnits, 0);
    const totCurProfit = list.reduce((sum, item) => sum + item.currentProfit, 0);
    const overallGrowth = totPrevRev > 0
      ? ((totCurRev - totPrevRev) / totPrevRev) * 100
      : totCurRev > 0 ? 100 : 0;

    // Sorting
    list.sort((a, b) => {
      switch (sortBy) {
        case 'REVENUE_DESC':
          return b.currentRevenue - a.currentRevenue;
        case 'UNITS_DESC':
          return b.currentUnits - a.currentUnits;
        case 'PROFIT_DESC':
          return b.currentProfit - a.currentProfit;
        case 'GROWTH_DESC':
          return b.growthPercent - a.growthPercent;
        default:
          return b.currentRevenue - a.currentRevenue;
      }
    });

    return {
      categoryList: list,
      totalCurrentRevenue: totCurRev,
      totalPreviousRevenue: totPrevRev,
      totalCurrentUnits: totCurUnits,
      totalCurrentProfit: totCurProfit,
      overallGrowthPercent: overallGrowth,
    };
  }, [transactions, categories, products, productMap, currentStart, currentEnd, previousStart, previousEnd, sortBy]);

  // Interactive Category Filter Options & Handlers
  const categoryFilterOptions = useMemo(() => {
    return [...categoryList]
      .sort((a, b) => b.currentRevenue - a.currentRevenue)
      .map((c) => ({
        name: c.name,
        color: c.color,
        currentRevenue: c.currentRevenue,
        sharePercent: totalCurrentRevenue > 0 ? (c.currentRevenue / totalCurrentRevenue) * 100 : 0,
      }));
  }, [categoryList, totalCurrentRevenue]);

  const visibleCategoryList = useMemo(() => {
    if (hiddenCategorySet.size === 0) return categoryList;
    return categoryList.filter((c) => !hiddenCategorySet.has(c.name));
  }, [categoryList, hiddenCategorySet]);

  const activeCategoryCount = visibleCategoryList.length;
  const isCategoryFiltered = hiddenCategories.some((name) => categoryList.some((c) => c.name === name));

  const handleToggleCategoryFilter = (categoryName: string) => {
    setHiddenCategories((prev) =>
      prev.includes(categoryName)
        ? prev.filter((name) => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  const handleSelectAllCategories = () => {
    setHiddenCategories([]);
  };

  const handleFocusTopCategories = (count: number) => {
    const sortedNames = [...categoryList]
      .sort((a, b) => b.currentRevenue - a.currentRevenue)
      .map((c) => c.name);
    const keepSet = new Set(sortedNames.slice(0, count));
    setHiddenCategories(sortedNames.filter((name) => !keepSet.has(name)));
  };

  const handleClearAllCategories = () => {
    setHiddenCategories(categoryList.map((c) => c.name));
  };

  // Dropdown state derived seamlessly from active/hidden categories so dropdown & filter bar stay 100% synced
  const selectedCategoryDropdownValue = useMemo(() => {
    if (categoryFilterOptions.length === 0) return 'ALL';
    const activeNames = categoryFilterOptions
      .filter((c) => !hiddenCategorySet.has(c.name))
      .map((c) => c.name);
    if (activeNames.length === categoryFilterOptions.length) return 'ALL';
    if (activeNames.length === 0) return 'NONE';
    if (activeNames.length === 1) return activeNames[0];
    return 'CUSTOM';
  }, [categoryFilterOptions, hiddenCategorySet]);

  const specificSelectedCategoryName =
    selectedCategoryDropdownValue !== 'ALL' &&
    selectedCategoryDropdownValue !== 'NONE' &&
    selectedCategoryDropdownValue !== 'CUSTOM'
      ? selectedCategoryDropdownValue
      : null;

  const handleSelectCategoryFromDropdown = (val: string) => {
    if (val === 'ALL') {
      setHiddenCategories([]);
      setSelectedCategoryHighlight(null);
      setFocusedMarginCategory(null);
      return;
    }
    if (val === 'NONE') {
      setHiddenCategories(categoryFilterOptions.map((c) => c.name));
      setSelectedCategoryHighlight(null);
      setFocusedMarginCategory(null);
      return;
    }
    // Isolate selected category across all dashboard charts & KPIs
    setHiddenCategories(
      categoryFilterOptions.map((c) => c.name).filter((name) => name !== val)
    );
    setSelectedCategoryHighlight(val);
    setFocusedMarginCategory(val);
  };

  // Resolve target (daily/weekly/monthly) dynamically against per-category goals when categories are filtered
  const resolveTargetForHorizon = useMemo(() => {
    return (horizon: 'daily' | 'weekly' | 'monthly', storeDefaultGoal: number) => {
      if (!isCategoryFiltered) {
        return {
          target: storeDefaultGoal,
          targetSourceLabel: 'Target Toko',
          isFallbackToStoreGoal: false,
        };
      }

      if (activeCategoryCount === 0) {
        return {
          target: 0,
          targetSourceLabel: 'Tidak Ada Kategori Aktif',
          isFallbackToStoreGoal: false,
        };
      }

      if (specificSelectedCategoryName) {
        const customGoal = Number(
          categorySalesGoals?.[specificSelectedCategoryName]?.[horizon] || 0
        );
        if (customGoal > 0) {
          return {
            target: customGoal,
            targetSourceLabel: `Target Kategori: ${specificSelectedCategoryName}`,
            isFallbackToStoreGoal: false,
          };
        }
        return {
          target: storeDefaultGoal,
          targetSourceLabel: `Fallback Target Toko (${specificSelectedCategoryName} belum diatur)`,
          isFallbackToStoreGoal: true,
        };
      }

      let configuredSum = 0;
      let configuredCount = 0;
      visibleCategoryList.forEach((cat) => {
        const val = Number(categorySalesGoals?.[cat.name]?.[horizon] || 0);
        if (val > 0) {
          configuredSum += val;
          configuredCount += 1;
        }
      });

      if (configuredSum > 0) {
        return {
          target: configuredSum,
          targetSourceLabel: `Akumulasi Target ${configuredCount}/${activeCategoryCount} Kategori`,
          isFallbackToStoreGoal: false,
        };
      }

      return {
        target: storeDefaultGoal,
        targetSourceLabel: 'Fallback Target Toko (target kategori belum diatur)',
        isFallbackToStoreGoal: true,
      };
    };
  }, [
    isCategoryFiltered,
    activeCategoryCount,
    specificSelectedCategoryName,
    visibleCategoryList,
    categorySalesGoals,
  ]);

  // Real-time Achievement vs Daily, Weekly (Senin-now), and Monthly (Tanggal 1-now) Targets
  const salesTargetProgress = useMemo(() => {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayStartMs = startOfToday.getTime();

    const startOfWeek = new Date(now);
    const dayOfWeek = startOfWeek.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStartMs = startOfWeek.getTime();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthStartMs = startOfMonth.getTime();

    let dailyRevenue = 0;
    let dailyTxCount = 0;
    let weeklyRevenue = 0;
    let weeklyTxCount = 0;
    let monthlyRevenue = 0;
    let monthlyTxCount = 0;

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      if (ts < monthStartMs) return;

      let txMatchedRevenue = tx.finalAmount;
      let hasMatchingItem = true;

      if (isCategoryFiltered) {
        txMatchedRevenue = 0;
        hasMatchingItem = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = prod?.category || 'Umum';
          if (!hiddenCategorySet.has(catName)) {
            txMatchedRevenue += item.totalAmount;
            hasMatchingItem = true;
          }
        });
      }

      if (!hasMatchingItem) return;

      monthlyRevenue += txMatchedRevenue;
      monthlyTxCount += 1;

      if (ts >= weekStartMs) {
        weeklyRevenue += txMatchedRevenue;
        weeklyTxCount += 1;
      }
      if (ts >= todayStartMs) {
        dailyRevenue += txMatchedRevenue;
        dailyTxCount += 1;
      }
    });

    const storeDailyGoal = dailySalesGoal > 0 ? dailySalesGoal : 5000000;
    const storeWeeklyGoal = weeklySalesGoal > 0 ? weeklySalesGoal : 30000000;
    const storeMonthlyGoal = monthlySalesGoal > 0 ? monthlySalesGoal : 120000000;

    const resolvedDaily = resolveTargetForHorizon('daily', storeDailyGoal);
    const resolvedWeekly = resolveTargetForHorizon('weekly', storeWeeklyGoal);
    const resolvedMonthly = resolveTargetForHorizon('monthly', storeMonthlyGoal);

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDayOfMonth = now.getDate();

    return {
      daily: {
        label: 'Target Harian (Hari Ini)',
        subtitle: now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }),
        achieved: dailyRevenue,
        target: resolvedDaily.target,
        targetSourceLabel: resolvedDaily.targetSourceLabel,
        isFallbackToStoreGoal: resolvedDaily.isFallbackToStoreGoal,
        txCount: dailyTxCount,
        percent: resolvedDaily.target > 0 ? (dailyRevenue / resolvedDaily.target) * 100 : 0,
      },
      weekly: {
        label: 'Target Mingguan (Minggu Ini)',
        subtitle: `${startOfWeek.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} - Hari Ini`,
        achieved: weeklyRevenue,
        target: resolvedWeekly.target,
        targetSourceLabel: resolvedWeekly.targetSourceLabel,
        isFallbackToStoreGoal: resolvedWeekly.isFallbackToStoreGoal,
        txCount: weeklyTxCount,
        percent: resolvedWeekly.target > 0 ? (weeklyRevenue / resolvedWeekly.target) * 100 : 0,
      },
      monthly: {
        label: 'Target Bulanan (Bulan Ini)',
        subtitle: `${now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} (Hr ${currentDayOfMonth}/${daysInMonth})`,
        achieved: monthlyRevenue,
        target: resolvedMonthly.target,
        targetSourceLabel: resolvedMonthly.targetSourceLabel,
        isFallbackToStoreGoal: resolvedMonthly.isFallbackToStoreGoal,
        txCount: monthlyTxCount,
        percent: resolvedMonthly.target > 0 ? (monthlyRevenue / resolvedMonthly.target) * 100 : 0,
      },
    };
  }, [
    transactions,
    dailySalesGoal,
    weeklySalesGoal,
    monthlySalesGoal,
    isCategoryFiltered,
    hiddenCategorySet,
    productMap,
    resolveTargetForHorizon,
  ]);

  // Current week daily revenue trends (Senin - Minggu) vs resolved daily goal (respects active category filter & per-category targets)
  const {
    currentWeekDailyTrend,
    weekRangeLabel,
    daysMetTargetCount,
    safeGoalForChart,
    weeklyTargetSourceLabel,
  } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = new Date(now);
    const dayOfWeek = startOfWeek.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const storeDailyGoal = dailySalesGoal > 0 ? dailySalesGoal : 5000000;
    const resolvedDaily = resolveTargetForHorizon('daily', storeDailyGoal);
    const safeGoal = resolvedDaily.target;
    const dayNames = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

    const buckets = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + idx);
      const dayStart = d.getTime();
      const dayEnd = dayStart + 86400000 - 1;
      return {
        dayName: dayNames[idx],
        dayLabel: `${dayNames[idx]} (${d.getDate()}/${d.getMonth() + 1})`,
        fullDateLabel: d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        dayStart,
        dayEnd,
        actualRevenue: 0,
        salesGoal: safeGoal,
        txCount: 0,
        isToday: dayStart === startOfToday,
        isFuture: dayStart > startOfToday,
        achievementPercent: 0,
      };
    });

    transactions.forEach((tx) => {
      for (let i = 0; i < buckets.length; i++) {
        if (tx.timestamp >= buckets[i].dayStart && tx.timestamp <= buckets[i].dayEnd) {
          if (!isCategoryFiltered) {
            buckets[i].actualRevenue += tx.finalAmount;
            buckets[i].txCount += 1;
          } else {
            let filteredTxRevenue = 0;
            let hasMatchingItem = false;
            tx.items.forEach((item) => {
              const prod = productMap.get(item.productId);
              const catName = prod?.category || 'Umum';
              if (!hiddenCategorySet.has(catName)) {
                filteredTxRevenue += item.totalAmount;
                hasMatchingItem = true;
              }
            });
            if (hasMatchingItem) {
              buckets[i].actualRevenue += filteredTxRevenue;
              buckets[i].txCount += 1;
            }
          }
          break;
        }
      }
    });

    let metCount = 0;
    buckets.forEach((b) => {
      b.achievementPercent = safeGoal > 0 ? (b.actualRevenue / safeGoal) * 100 : 0;
      if (safeGoal > 0 && b.actualRevenue >= safeGoal) metCount += 1;
    });

    const label = `${startOfWeek.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} – ${endOfWeek.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    return {
      currentWeekDailyTrend: buckets,
      weekRangeLabel: label,
      daysMetTargetCount: metCount,
      safeGoalForChart: safeGoal,
      weeklyTargetSourceLabel: resolvedDaily.targetSourceLabel,
    };
  }, [
    transactions,
    dailySalesGoal,
    isCategoryFiltered,
    hiddenCategorySet,
    productMap,
    resolveTargetForHorizon,
  ]);

  const {
    filteredCurrentRevenue,
    filteredOverallGrowthPercent,
    visibleTopCategory,
    visibleFastestGrowingCategory,
    visibleHighestMarginCategory,
  } = useMemo(() => {
    const curRev = visibleCategoryList.reduce((sum, c) => sum + c.currentRevenue, 0);
    const prevRev = visibleCategoryList.reduce((sum, c) => sum + c.previousRevenue, 0);
    const growth =
      prevRev > 0 ? ((curRev - prevRev) / prevRev) * 100 : curRev > 0 ? 100 : 0;

    const byRev = [...visibleCategoryList].sort((a, b) => b.currentRevenue - a.currentRevenue);
    const top = byRev[0] || null;

    const growingPool = visibleCategoryList.filter((c) => c.currentRevenue > 0 && c.previousRevenue > 0);
    const fastest =
      growingPool.length > 0
        ? [...growingPool].sort((a, b) => b.growthPercent - a.growthPercent)[0]
        : top;

    const marginPool = visibleCategoryList.filter((c) => c.currentRevenue > 0);
    const highestMargin =
      marginPool.length > 0
        ? [...marginPool].sort((a, b) => b.marginPercent - a.marginPercent)[0]
        : top;

    return {
      filteredCurrentRevenue: curRev,
      filteredOverallGrowthPercent: growth,
      visibleTopCategory: top,
      visibleFastestGrowingCategory: fastest,
      visibleHighestMarginCategory: highestMargin,
    };
  }, [visibleCategoryList]);

  // Ringkasan Jam Paling Sibuk & Jam Paling Sepi untuk penjadwalan shift karyawan
  const hourlyTrafficSummary = useMemo(() => {
    const msSpan = Math.max(86400000, currentEnd - currentStart + 1);
    const daysInPeriod = Math.max(1, Math.round(msSpan / 86400000));
    const isFiltered = hiddenCategorySet.size > 0;

    const buckets = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      hourLabel: `${String(hour).padStart(2, '0')}:00`,
      hourRangeLabel: `${String(hour).padStart(2, '0')}:00 – ${String(hour).padStart(2, '0')}:59`,
      txCount: 0,
      revenue: 0,
    }));

    transactions.forEach((tx) => {
      if (tx.timestamp < currentStart || tx.timestamp > currentEnd) return;

      let matchedRevenue = tx.finalAmount || 0;
      let hasMatch = !isFiltered;

      if (isFiltered) {
        matchedRevenue = 0;
        hasMatch = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (!hiddenCategorySet.has(catName)) {
            matchedRevenue += item.totalAmount || 0;
            hasMatch = true;
          }
        });
      }

      if (!hasMatch) return;
      const hr = new Date(tx.timestamp).getHours();
      if (buckets[hr]) {
        buckets[hr].txCount += 1;
        buckets[hr].revenue += matchedRevenue;
      }
    });

    const totalTx = buckets.reduce((sum, b) => sum + b.txCount, 0);
    const activeHours = buckets.filter((b) => b.txCount > 0);

    const busiestBucket =
      activeHours.length > 0
        ? [...activeHours].sort((a, b) =>
            b.txCount !== a.txCount ? b.txCount - a.txCount : b.revenue - a.revenue
          )[0]
        : null;

    // Operational hours window (08:00–21:00) expanded if store has active transactions outside it
    const minActiveHour = activeHours.length > 0 ? Math.min(...activeHours.map((b) => b.hour)) : 8;
    const maxActiveHour = activeHours.length > 0 ? Math.max(...activeHours.map((b) => b.hour)) : 21;
    const opStart = Math.min(8, Math.max(6, minActiveHour));
    const opEnd = Math.max(21, Math.min(22, maxActiveHour));
    const operationalPool = buckets.filter((b) => b.hour >= opStart && b.hour <= opEnd);

    const quietestActiveBucket =
      activeHours.length > 0
        ? [...activeHours].sort((a, b) =>
            a.txCount !== b.txCount ? a.txCount - b.txCount : a.revenue - b.revenue
          )[0]
        : null;

    const quietestOperationalBucket =
      totalTx > 0
        ? [...operationalPool].sort((a, b) =>
            a.txCount !== b.txCount
              ? a.txCount - b.txCount
              : a.revenue !== b.revenue
              ? a.revenue - b.revenue
              : a.hour - b.hour
          )[0]
        : null;

    const selectedQuietBucket =
      quietHourScope === 'ACTIVE_ONLY'
        ? quietestActiveBucket
        : quietestOperationalBucket || quietestActiveBucket;

    const busiestAvgPerDay = busiestBucket ? busiestBucket.txCount / daysInPeriod : 0;
    const busiestShare = busiestBucket && totalTx > 0 ? (busiestBucket.txCount / totalTx) * 100 : 0;
    const busiestRecommendedCashiers = busiestBucket
      ? Math.max(2, Math.ceil(busiestAvgPerDay / 8))
      : 1;

    const quietAvgPerDay = selectedQuietBucket ? selectedQuietBucket.txCount / daysInPeriod : 0;
    const quietShare =
      selectedQuietBucket && totalTx > 0 ? (selectedQuietBucket.txCount / totalTx) * 100 : 0;

    return {
      totalTx,
      daysInPeriod,
      opRangeLabel: `${String(opStart).padStart(2, '0')}:00–${String(opEnd).padStart(2, '0')}:59`,
      busiest: busiestBucket
        ? {
            ...busiestBucket,
            avgPerDay: busiestAvgPerDay,
            sharePercent: busiestShare,
            recommendedCashiers: busiestRecommendedCashiers,
          }
        : null,
      quietest: selectedQuietBucket
        ? {
            ...selectedQuietBucket,
            avgPerDay: quietAvgPerDay,
            sharePercent: quietShare,
          }
        : null,
      quietestActive: quietestActiveBucket,
    };
  }, [transactions, productMap, currentStart, currentEnd, hiddenCategorySet, quietHourScope]);

  // Kartu 'Revenue Growth %': Total Pendapatan Hari Ini vs Rata-rata 7 Hari Terakhir (H-7 s/d H-1)
  const revenueGrowthTodayVs7d = useMemo(() => {
    const now = new Date();
    const oneDayMs = 86400000;
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEndMs = todayStartMs + oneDayMs - 1;
    const prev7StartMs = todayStartMs - 7 * oneDayMs;
    const prev7EndMs = todayStartMs - 1;
    const isFiltered = hiddenCategorySet.size > 0;

    let todayRevenue = 0;
    let todayTxCount = 0;
    let prev7TotalRevenue = 0;
    let prev7TxCount = 0;
    const prev7ActiveDayBuckets = new Set<number>();

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      const inToday = ts >= todayStartMs && ts <= todayEndMs;
      const inPrev7 = ts >= prev7StartMs && ts <= prev7EndMs;
      if (!inToday && !inPrev7) return;

      let matchedRevenue = tx.finalAmount || 0;
      let hasMatch = !isFiltered;

      if (isFiltered) {
        matchedRevenue = 0;
        hasMatch = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (!hiddenCategorySet.has(catName)) {
            matchedRevenue += item.totalAmount || 0;
            hasMatch = true;
          }
        });
      }

      if (!hasMatch) return;

      if (inToday) {
        todayRevenue += matchedRevenue;
        todayTxCount += 1;
      } else if (inPrev7) {
        prev7TotalRevenue += matchedRevenue;
        prev7TxCount += 1;
        prev7ActiveDayBuckets.add(Math.floor((ts - prev7StartMs) / oneDayMs));
      }
    });

    const avgLast7Days = prev7TotalRevenue / 7;
    const has7dBaseline = prev7TotalRevenue > 0;
    const diffAmount = todayRevenue - avgLast7Days;
    const growthPercent = has7dBaseline
      ? ((todayRevenue - avgLast7Days) / avgLast7Days) * 100
      : todayRevenue > 0
      ? 100
      : 0;

    const prev7StartDate = new Date(prev7StartMs);
    const prev7EndDate = new Date(prev7EndMs);
    const baselineLabel = `${prev7StartDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })} – ${prev7EndDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })}`;

    return {
      todayRevenue,
      todayTxCount,
      prev7TotalRevenue,
      avgLast7Days,
      prev7TxCount,
      activeDaysIn7d: prev7ActiveDayBuckets.size,
      diffAmount,
      growthPercent,
      has7dBaseline,
      baselineLabel,
    };
  }, [transactions, productMap, hiddenCategorySet]);

  // Proyeksi Laba Bulan Ini (Dihitung proporsional berdasarkan tren penjualan harian bulan berjalan)
  const monthlyProfitProjection = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const elapsedDays = Math.max(1, now.getDate());
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    const remainingDays = Math.max(0, totalDaysInMonth - elapsedDays);

    const curMonthStartMs = new Date(year, month, 1, 0, 0, 0, 0).getTime();
    const curMonthEndMs = new Date(year, month, now.getDate(), 23, 59, 59, 999).getTime();
    const prevMonthStartMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
    const prevMonthEndMs = curMonthStartMs - 1;

    let mtdRevenue = 0;
    let mtdCogs = 0;
    let mtdTxCount = 0;
    let prevMonthRevenue = 0;
    let prevMonthCogs = 0;

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      if (ts >= curMonthStartMs && ts <= curMonthEndMs) {
        let matched = false;
        (tx.items || []).forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (hiddenCategorySet.has(catName)) return;

          mtdRevenue += item.totalAmount || 0;
          mtdCogs += getItemFifoCogs(item, prod);
          matched = true;
        });
        if (matched) mtdTxCount += 1;
      } else if (ts >= prevMonthStartMs && ts <= prevMonthEndMs) {
        (tx.items || []).forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (hiddenCategorySet.has(catName)) return;

          prevMonthRevenue += item.totalAmount || 0;
          prevMonthCogs += getItemFifoCogs(item, prod);
        });
      }
    });

    const mtdProfit = mtdRevenue - mtdCogs;
    const mtdMarginPercent = mtdRevenue > 0 ? (mtdProfit / mtdRevenue) * 100 : 0;
    const avgDailyProfit = mtdProfit / elapsedDays;
    const avgDailyRevenue = mtdRevenue / elapsedDays;
    const projectedMonthlyProfit = Math.round(avgDailyProfit * totalDaysInMonth);
    const projectedMonthlyRevenue = Math.round(avgDailyRevenue * totalDaysInMonth);

    const prevMonthProfit = prevMonthRevenue - prevMonthCogs;
    const hasPrevMonthBaseline = prevMonthRevenue > 0;
    const vsPrevMonthPercent =
      hasPrevMonthBaseline && prevMonthProfit !== 0
        ? ((projectedMonthlyProfit - prevMonthProfit) / Math.abs(prevMonthProfit)) * 100
        : 0;

    const monthLabel = now.toLocaleDateString('id-ID', {
      month: 'short',
      year: 'numeric',
    });

    return {
      monthLabel,
      elapsedDays,
      totalDaysInMonth,
      remainingDays,
      mtdRevenue,
      mtdProfit,
      mtdMarginPercent,
      mtdTxCount,
      avgDailyProfit: Math.round(avgDailyProfit),
      projectedMonthlyProfit,
      projectedMonthlyRevenue,
      prevMonthProfit,
      hasPrevMonthBaseline,
      vsPrevMonthPercent,
    };
  }, [transactions, productMap, hiddenCategorySet]);

  // Rata-rata Persentase Margin Keuntungan Kotor Seluruh Transaksi: Bulan Ini vs Bulan Sebelumnya
  const monthlyGrossMarginComparison = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const curMonthStartMs = new Date(year, month, 1, 0, 0, 0, 0).getTime();
    const curMonthEndMs = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();
    const prevMonthStartMs = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
    const prevMonthEndMs = curMonthStartMs - 1;

    const prevMonthRef = new Date(year, month - 1, 1);
    const curMonthLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const prevMonthLabel = prevMonthRef.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    const curMonthShort = now.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    const prevMonthShort = prevMonthRef.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

    const isFiltered = hiddenCategorySet.size > 0;

    let curTxCount = 0;
    let curMarginPercentSum = 0;
    let curTotalRevenue = 0;
    let curTotalCogs = 0;
    let curLowMarginCount = 0;
    let curHighMarginCount = 0;

    let prevTxCount = 0;
    let prevMarginPercentSum = 0;
    let prevTotalRevenue = 0;
    let prevTotalCogs = 0;

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      const inCurMonth = ts >= curMonthStartMs && ts <= curMonthEndMs;
      const inPrevMonth = ts >= prevMonthStartMs && ts <= prevMonthEndMs;
      if (!inCurMonth && !inPrevMonth) return;

      let txRev = 0;
      let txCogs = 0;
      let matched = false;

      (tx.items || []).forEach((item) => {
        const prod = productMap.get(item.productId);
        if (isFiltered) {
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (hiddenCategorySet.has(catName)) return;
        }
        txRev += item.totalAmount || 0;
        txCogs += getItemFifoCogs(item, prod);
        matched = true;
      });

      if (!matched || txRev <= 0) return;

      const txGrossProfit = txRev - txCogs;
      const txMarginPercent = (txGrossProfit / txRev) * 100;

      if (inCurMonth) {
        curTxCount += 1;
        curMarginPercentSum += txMarginPercent;
        curTotalRevenue += txRev;
        curTotalCogs += txCogs;
        if (txMarginPercent < 15) curLowMarginCount += 1;
        if (txMarginPercent >= 30) curHighMarginCount += 1;
      } else if (inPrevMonth) {
        prevTxCount += 1;
        prevMarginPercentSum += txMarginPercent;
        prevTotalRevenue += txRev;
        prevTotalCogs += txCogs;
      }
    });

    const curAvgTxMargin = curTxCount > 0 ? curMarginPercentSum / curTxCount : 0;
    const prevAvgTxMargin = prevTxCount > 0 ? prevMarginPercentSum / prevTxCount : 0;

    const curGrossProfit = curTotalRevenue - curTotalCogs;
    const prevGrossProfit = prevTotalRevenue - prevTotalCogs;
    const curWeightedMargin = curTotalRevenue > 0 ? (curGrossProfit / curTotalRevenue) * 100 : 0;
    const prevWeightedMargin = prevTotalRevenue > 0 ? (prevGrossProfit / prevTotalRevenue) * 100 : 0;

    const hasCurData = curTxCount > 0;
    const hasPrevData = prevTxCount > 0;
    const deltaPoints = hasCurData && hasPrevData ? curAvgTxMargin - prevAvgTxMargin : 0;
    const weightedDeltaPoints = hasCurData && hasPrevData ? curWeightedMargin - prevWeightedMargin : 0;

    let evaluationLabel = 'Belum Ada Transaksi';
    let evaluationTone: 'POSITIVE' | 'NEUTRAL' | 'WARNING' = 'NEUTRAL';
    let pricingGuidance = 'Belum ada data transaksi pada bulan ini untuk dievaluasi.';

    if (hasCurData) {
      if (hasPrevData) {
        if (deltaPoints >= 1) {
          evaluationLabel = 'Penetapan Harga Membaik';
          evaluationTone = 'POSITIVE';
          pricingGuidance = `Rata-rata margin per transaksi naik ${deltaPoints.toFixed(1)} poin vs ${prevMonthShort}.`;
        } else if (deltaPoints <= -1) {
          evaluationLabel = 'Margin Terkoreksi';
          evaluationTone = 'WARNING';
          pricingGuidance =
            curLowMarginCount > 0
              ? `Turun ${Math.abs(deltaPoints).toFixed(1)} poin; ${formatNumber(curLowMarginCount)} transaksi bermargin <15%.`
              : `Turun ${Math.abs(deltaPoints).toFixed(1)} poin; tinjau diskon atau kenaikan HPP.`;
        } else {
          evaluationLabel = 'Penetapan Harga Stabil';
          evaluationTone = 'NEUTRAL';
          pricingGuidance = `Selisih ${deltaPoints >= 0 ? '+' : ''}${deltaPoints.toFixed(1)} poin terhadap ${prevMonthShort}.`;
        }
      } else if (curAvgTxMargin >= 25) {
        evaluationLabel = 'Margin Sehat';
        evaluationTone = 'POSITIVE';
        pricingGuidance = `Rata-rata margin ${curAvgTxMargin.toFixed(1)}% pada ${formatNumber(curTxCount)} transaksi bulan ini.`;
      } else if (curAvgTxMargin >= 15) {
        evaluationLabel = 'Margin Moderat';
        evaluationTone = 'NEUTRAL';
        pricingGuidance = 'Pembanding bulan lalu belum tersedia; pantau HPP & diskon berkala.';
      } else {
        evaluationLabel = 'Perlu Evaluasi Harga';
        evaluationTone = 'WARNING';
        pricingGuidance = `${formatNumber(curLowMarginCount)} transaksi bulan ini berada di bawah margin 15%.`;
      }
    }

    return {
      curMonthLabel,
      prevMonthLabel,
      curMonthShort,
      prevMonthShort,
      curTxCount,
      curAvgTxMargin,
      curTotalRevenue,
      curGrossProfit,
      curWeightedMargin,
      curLowMarginCount,
      curHighMarginCount,
      prevTxCount,
      prevAvgTxMargin,
      prevTotalRevenue,
      prevGrossProfit,
      prevWeightedMargin,
      hasCurData,
      hasPrevData,
      deltaPoints,
      weightedDeltaPoints,
      evaluationLabel,
      evaluationTone,
      pricingGuidance,
    };
  }, [transactions, productMap, hiddenCategorySet]);

  // Metrik 'Persentase Pelanggan Kembali' (Returning Customer Rate) berdasarkan riwayat transaksi
  const returningCustomerMetrics = useMemo(() => {
    const isFiltered = hiddenCategorySet.size > 0;
    const GENERIC_NAMES = new Set([
      '',
      '-',
      'umum',
      'pelanggan umum',
      'pelanggan umum (non-member)',
      'non-member',
      'guest',
      'tamu',
      'walk-in',
      'walkin',
    ]);

    const getCustomerKey = (tx: Transaction): string | null => {
      const cid = (tx.customerId || '').trim();
      if (cid && !GENERIC_NAMES.has(cid.toLowerCase())) {
        return `id:${cid}`;
      }
      const waDigits = (tx.customerWhatsapp || '').replace(/\D/g, '');
      if (waDigits.length >= 6) {
        return `wa:${waDigits}`;
      }
      const cname = (tx.customerName || '').trim().toLowerCase();
      if (cname && !GENERIC_NAMES.has(cname)) {
        return `name:${cname}`;
      }
      return null;
    };

    const getMatchedRevenue = (tx: Transaction): { matched: boolean; revenue: number } => {
      if (!isFiltered) {
        return { matched: true, revenue: tx.finalAmount || 0 };
      }
      let rev = 0;
      let matched = false;
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        if (!hiddenCategorySet.has(catName)) {
          rev += item.totalAmount || 0;
          matched = true;
        }
      });
      return { matched, revenue: rev };
    };

    interface CustomerHistoryAgg {
      allTimestamps: number[];
      periodTxCount: number;
      periodRevenue: number;
      prevPeriodTxCount: number;
    }

    const customerMap = new Map<string, CustomerHistoryAgg>();
    let periodAnonymousTxCount = 0;
    let periodTotalMatchedTxCount = 0;

    transactions.forEach((tx) => {
      const { matched, revenue } = getMatchedRevenue(tx);
      if (!matched) return;

      const ts = tx.timestamp;
      const inCurrent = ts >= currentStart && ts <= currentEnd;
      const inPrevious = ts >= previousStart && ts <= previousEnd;

      if (inCurrent) {
        periodTotalMatchedTxCount += 1;
      }

      const cKey = getCustomerKey(tx);
      if (!cKey) {
        if (inCurrent) periodAnonymousTxCount += 1;
        return;
      }

      let entry = customerMap.get(cKey);
      if (!entry) {
        entry = {
          allTimestamps: [],
          periodTxCount: 0,
          periodRevenue: 0,
          prevPeriodTxCount: 0,
        };
        customerMap.set(cKey, entry);
      }

      entry.allTimestamps.push(ts);
      if (inCurrent) {
        entry.periodTxCount += 1;
        entry.periodRevenue += revenue;
      } else if (inPrevious) {
        entry.prevPeriodTxCount += 1;
      }
    });

    let periodIdentifiedCount = 0;
    let periodReturningCount = 0;
    let periodNewCount = 0;
    let returningRevenuePeriod = 0;
    let newRevenuePeriod = 0;
    let returningTxPeriod = 0;
    let newTxPeriod = 0;

    let prevIdentifiedCount = 0;
    let prevReturningCount = 0;

    let allTimeIdentifiedCount = 0;
    let allTimeReturningCount = 0;
    let allTimeIdentifiedTxCount = 0;

    customerMap.forEach((entry) => {
      const totalTxAllTime = entry.allTimestamps.length;
      if (totalTxAllTime > 0) {
        allTimeIdentifiedCount += 1;
        allTimeIdentifiedTxCount += totalTxAllTime;
        if (totalTxAllTime >= 2) {
          allTimeReturningCount += 1;
        }
      }

      if (entry.periodTxCount > 0) {
        periodIdentifiedCount += 1;
        const hasPriorTxBeforeCurrent = entry.allTimestamps.some((t) => t < currentStart);
        const totalUpToCurrentEnd = entry.allTimestamps.filter((t) => t <= currentEnd).length;
        const isReturning = hasPriorTxBeforeCurrent || totalUpToCurrentEnd >= 2;

        if (isReturning) {
          periodReturningCount += 1;
          returningRevenuePeriod += entry.periodRevenue;
          returningTxPeriod += entry.periodTxCount;
        } else {
          periodNewCount += 1;
          newRevenuePeriod += entry.periodRevenue;
          newTxPeriod += entry.periodTxCount;
        }
      }

      if (entry.prevPeriodTxCount > 0) {
        prevIdentifiedCount += 1;
        const hasPriorBeforePrev = entry.allTimestamps.some((t) => t < previousStart);
        const totalUpToPrevEnd = entry.allTimestamps.filter((t) => t <= previousEnd).length;
        if (hasPriorBeforePrev || totalUpToPrevEnd >= 2) {
          prevReturningCount += 1;
        }
      }
    });

    const periodReturningRate =
      periodIdentifiedCount > 0 ? (periodReturningCount / periodIdentifiedCount) * 100 : 0;
    const prevReturningRate =
      prevIdentifiedCount > 0 ? (prevReturningCount / prevIdentifiedCount) * 100 : 0;
    const hasPrevComparison = prevIdentifiedCount > 0;
    const rateDeltaPercent = hasPrevComparison ? periodReturningRate - prevReturningRate : 0;

    const allTimeReturningRate =
      allTimeIdentifiedCount > 0 ? (allTimeReturningCount / allTimeIdentifiedCount) * 100 : 0;
    const avgVisitsPerCustomer =
      allTimeIdentifiedCount > 0 ? allTimeIdentifiedTxCount / allTimeIdentifiedCount : 0;

    const totalPeriodIdentifiedRevenue = returningRevenuePeriod + newRevenuePeriod;
    const returningRevenueSharePercent =
      totalPeriodIdentifiedRevenue > 0
        ? (returningRevenuePeriod / totalPeriodIdentifiedRevenue) * 100
        : 0;
    const avgSpendReturning = returningTxPeriod > 0 ? returningRevenuePeriod / returningTxPeriod : 0;
    const avgSpendNew = newTxPeriod > 0 ? newRevenuePeriod / newTxPeriod : 0;

    return {
      periodIdentifiedCount,
      periodReturningCount,
      periodNewCount,
      periodReturningRate,
      prevIdentifiedCount,
      prevReturningRate,
      hasPrevComparison,
      rateDeltaPercent,
      allTimeIdentifiedCount,
      allTimeReturningCount,
      allTimeReturningRate,
      avgVisitsPerCustomer,
      returningRevenuePeriod,
      returningRevenueSharePercent,
      avgSpendReturning,
      avgSpendNew,
      periodAnonymousTxCount,
      periodTotalMatchedTxCount,
    };
  }, [transactions, productMap, currentStart, currentEnd, previousStart, previousEnd, hiddenCategorySet]);

  // Kartu 'Customer Retention Rate': Persentase pelanggan yang bertransaksi > 1 kali dalam bulan berjalan
  const customerRetentionMonthly = useMemo(() => {
    const now = new Date();
    const curMonthStartMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    const curMonthEndMs = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const prevMonthStartMs = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
    const prevMonthEndMs = curMonthStartMs - 1;
    const isFiltered = hiddenCategorySet.size > 0;

    const GENERIC_NAMES = new Set([
      '',
      '-',
      'umum',
      'pelanggan umum',
      'pelanggan umum (non-member)',
      'non-member',
      'guest',
      'tamu',
      'walk-in',
      'walkin',
    ]);

    const getCustomerKey = (tx: Transaction): string | null => {
      const cid = (tx.customerId || '').trim();
      if (cid && !GENERIC_NAMES.has(cid.toLowerCase())) {
        return `id:${cid}`;
      }
      const waDigits = (tx.customerWhatsapp || '').replace(/\D/g, '');
      if (waDigits.length >= 6) {
        return `wa:${waDigits}`;
      }
      const cname = (tx.customerName || '').trim().toLowerCase();
      if (cname && !GENERIC_NAMES.has(cname)) {
        return `name:${cname}`;
      }
      return null;
    };

    const curMonthCustomers = new Map<string, { txCount: number; revenue: number }>();
    const prevMonthCustomers = new Map<string, { txCount: number }>();
    let monthAnonymousTxCount = 0;

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      const inCurMonth = ts >= curMonthStartMs && ts <= curMonthEndMs;
      const inPrevMonth = ts >= prevMonthStartMs && ts <= prevMonthEndMs;
      if (!inCurMonth && !inPrevMonth) return;

      let matchedRevenue = tx.finalAmount || 0;
      let hasMatch = !isFiltered;
      if (isFiltered) {
        matchedRevenue = 0;
        hasMatch = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (!hiddenCategorySet.has(catName)) {
            matchedRevenue += item.totalAmount || 0;
            hasMatch = true;
          }
        });
      }
      if (!hasMatch) return;

      const cKey = getCustomerKey(tx);
      if (!cKey) {
        if (inCurMonth) monthAnonymousTxCount += 1;
        return;
      }

      if (inCurMonth) {
        const cur = curMonthCustomers.get(cKey) || { txCount: 0, revenue: 0 };
        cur.txCount += 1;
        cur.revenue += matchedRevenue;
        curMonthCustomers.set(cKey, cur);
      } else if (inPrevMonth) {
        const prev = prevMonthCustomers.get(cKey) || { txCount: 0 };
        prev.txCount += 1;
        prevMonthCustomers.set(cKey, prev);
      }
    });

    const totalCustomersMonth = curMonthCustomers.size;
    let retainedCount = 0;
    let singleTxCount = 0;
    let retainedRevenue = 0;
    let totalMonthIdentifiedRevenue = 0;
    let retainedTxTotal = 0;
    let totalMonthIdentifiedTx = 0;

    curMonthCustomers.forEach((stats) => {
      totalMonthIdentifiedRevenue += stats.revenue;
      totalMonthIdentifiedTx += stats.txCount;
      if (stats.txCount > 1) {
        retainedCount += 1;
        retainedRevenue += stats.revenue;
        retainedTxTotal += stats.txCount;
      } else {
        singleTxCount += 1;
      }
    });

    const prevTotalCustomers = prevMonthCustomers.size;
    let prevRetainedCount = 0;
    prevMonthCustomers.forEach((stats) => {
      if (stats.txCount > 1) prevRetainedCount += 1;
    });

    const retentionRate =
      totalCustomersMonth > 0 ? (retainedCount / totalCustomersMonth) * 100 : 0;
    const prevRetentionRate =
      prevTotalCustomers > 0 ? (prevRetainedCount / prevTotalCustomers) * 100 : 0;
    const hasPrevMonthData = prevTotalCustomers > 0;
    const deltaPoints = hasPrevMonthData ? retentionRate - prevRetentionRate : 0;

    const retainedRevenueShare =
      totalMonthIdentifiedRevenue > 0
        ? (retainedRevenue / totalMonthIdentifiedRevenue) * 100
        : 0;

    const monthLabel = now.toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
    });

    return {
      monthLabel,
      totalCustomersMonth,
      retainedCount,
      singleTxCount,
      retentionRate,
      prevTotalCustomers,
      prevRetentionRate,
      hasPrevMonthData,
      deltaPoints,
      retainedRevenue,
      retainedRevenueShare,
      retainedTxTotal,
      totalMonthIdentifiedTx,
      monthAnonymousTxCount,
    };
  }, [transactions, productMap, hiddenCategorySet]);

  // Chart data formatted for Recharts (filtered by active categories)
  const chartData = useMemo(() => {
    return visibleCategoryList.map((c, idx) => {
      let curVal = c.currentRevenue;
      let prevVal = c.previousRevenue;

      if (metric === 'UNITS') {
        curVal = c.currentUnits;
        prevVal = c.previousUnits;
      } else if (metric === 'PROFIT') {
        curVal = c.currentProfit;
        prevVal = c.previousProfit;
      }

      return {
        categoryName: c.name,
        color: isDefaultTheme ? c.color : palette.series[idx % palette.series.length],
        currentValue: curVal,
        previousValue: prevVal,
        revenue: c.currentRevenue,
        units: c.currentUnits,
        profit: c.currentProfit,
        marginPercent: c.marginPercent,
        growthPercent: c.growthPercent,
        topProduct: c.topProduct,
        sharePercent: totalCurrentRevenue > 0 ? (c.currentRevenue / totalCurrentRevenue) * 100 : 0,
      };
    });
  }, [visibleCategoryList, metric, totalCurrentRevenue, isDefaultTheme, palette.series]);

  // Top Key Performing Segment (respects active category filter)
  const topCategory = visibleTopCategory;
  const fastestGrowingCategory = visibleFastestGrowingCategory;
  const highestMarginCategory = visibleHighestMarginCategory;

  // 30-Day Daily Gross Profit Margin (%) Trend per Category (using FIFO COGS)
  const {
    marginTrend30dData,
    marginCategorySeries,
    overall30dMargin,
    overall30dProfit,
    overall30dRevenue,
    hasAny30dSales,
  } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 86400000;

    // Discover all categories present in registered categories, products, or 30d transactions
    const knownCategories: string[] = [];
    const seenCats = new Set<string>();
    const addCatName = (name: string) => {
      const clean = (name || 'Umum').trim() || 'Umum';
      if (!seenCats.has(clean)) {
        seenCats.add(clean);
        knownCategories.push(clean);
      }
    };
    categories.forEach((c) => addCatName(c.name));
    products.forEach((p) => {
      if (p.category) addCatName(p.category);
    });

    const start30dMs = todayStart - 29 * oneDayMs;
    const end30dMs = todayStart + oneDayMs - 1;

    // Also include any category found only in transactions within last 30d
    transactions.forEach((tx) => {
      if (tx.timestamp < start30dMs || tx.timestamp > end30dMs) return;
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        addCatName(prod?.category || 'Umum');
      });
    });

    interface DayCatStats {
      revenue: number;
      cogs: number;
    }

    const dayBuckets = Array.from({ length: 30 }, (_, idx) => {
      const dayTs = start30dMs + idx * oneDayMs;
      const d = new Date(dayTs);
      const isToday = dayTs === todayStart;
      return {
        idx,
        dayStart: dayTs,
        dayEnd: dayTs + oneDayMs - 1,
        dateLabel: isToday
          ? 'Hari Ini'
          : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        fullDateLabel: d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        byCategory: new Map<string, DayCatStats>(),
        totalRevenue: 0,
        totalCogs: 0,
      };
    });

    let totalRevAll = 0;
    let totalCogsAll = 0;

    transactions.forEach((tx) => {
      if (tx.timestamp < start30dMs || tx.timestamp > end30dMs) return;
      const bucketIdx = Math.floor((tx.timestamp - start30dMs) / oneDayMs);
      const bucket = dayBuckets[bucketIdx];
      if (!bucket) return;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        const rev = item.totalAmount || 0;
        const cogs = getItemFifoCogs(item, prod);

        const cur = bucket.byCategory.get(catName) || { revenue: 0, cogs: 0 };
        cur.revenue += rev;
        cur.cogs += cogs;
        bucket.byCategory.set(catName, cur);

        if (!hiddenCategorySet.has(catName)) {
          bucket.totalRevenue += rev;
          bucket.totalCogs += cogs;
          totalRevAll += rev;
          totalCogsAll += cogs;
        }
      });
    });

    // Build per-category 30d & half-period (Days 1-15 vs Days 16-30) margin metrics
    const seriesList = knownCategories
      .filter((name) => !hiddenCategorySet.has(name))
      .map((name, idx) => {
        let rev30 = 0;
        let cogs30 = 0;
        let revFirstHalf = 0;
        let cogsFirstHalf = 0;
        let revSecondHalf = 0;
        let cogsSecondHalf = 0;

        dayBuckets.forEach((b) => {
          const st = b.byCategory.get(name);
          if (!st) return;
          rev30 += st.revenue;
          cogs30 += st.cogs;
          if (b.idx < 15) {
            revFirstHalf += st.revenue;
            cogsFirstHalf += st.cogs;
          } else {
            revSecondHalf += st.revenue;
            cogsSecondHalf += st.cogs;
          }
        });

        const margin30 = rev30 > 0 ? ((rev30 - cogs30) / rev30) * 100 : null;
        const marginFirst = revFirstHalf > 0 ? ((revFirstHalf - cogsFirstHalf) / revFirstHalf) * 100 : null;
        const marginSecond = revSecondHalf > 0 ? ((revSecondHalf - cogsSecondHalf) / revSecondHalf) * 100 : null;
        const shiftDelta =
          marginFirst !== null && marginSecond !== null
            ? Number((marginSecond - marginFirst).toFixed(1))
            : null;

        return {
          name,
          dataKey: `catMargin_${idx}`,
          revKey: `catRev_${idx}`,
          profitKey: `catProfit_${idx}`,
          color: getCategoryColor(name, categories),
          revenue30d: rev30,
          profit30d: rev30 - cogs30,
          margin30d: margin30 !== null ? Number(margin30.toFixed(1)) : null,
          shiftDelta,
        };
      })
      .filter((s) => s.revenue30d > 0)
      .sort((a, b) => b.revenue30d - a.revenue30d)
      .map((s, sortedIdx) => ({
        ...s,
        color: isDefaultTheme ? s.color : palette.series[sortedIdx % palette.series.length],
      }));

    const chartRows = dayBuckets.map((b) => {
      const overallDayMargin =
        b.totalRevenue > 0
          ? Number((((b.totalRevenue - b.totalCogs) / b.totalRevenue) * 100).toFixed(1))
          : null;

      const row: Record<string, any> = {
        dateLabel: b.dateLabel,
        fullDateLabel: b.fullDateLabel,
        overallMargin: overallDayMargin,
        overallRevenue: b.totalRevenue,
        overallProfit: b.totalRevenue - b.totalCogs,
      };

      seriesList.forEach((s) => {
        const st = b.byCategory.get(s.name);
        if (st && st.revenue > 0) {
          const profit = st.revenue - st.cogs;
          row[s.dataKey] = Number(((profit / st.revenue) * 100).toFixed(1));
          row[s.revKey] = st.revenue;
          row[s.profitKey] = profit;
        } else {
          row[s.dataKey] = null;
          row[s.revKey] = 0;
          row[s.profitKey] = 0;
        }
      });

      return row;
    });

    const totalProfitAll = totalRevAll - totalCogsAll;
    const blendedMargin = totalRevAll > 0 ? Number(((totalProfitAll / totalRevAll) * 100).toFixed(1)) : 0;

    return {
      marginTrend30dData: chartRows,
      marginCategorySeries: seriesList,
      overall30dMargin: blendedMargin,
      overall30dProfit: totalProfitAll,
      overall30dRevenue: totalRevAll,
      hasAny30dSales: totalRevAll > 0 && seriesList.length > 0,
    };
  }, [transactions, products, categories, productMap, hiddenCategorySet, isDefaultTheme, palette.series]);

  // 7-Day Daily Gross Profit Trend (Rolling Last 7 Days: Today - 6 days through Today)
  const last7DaysGrossProfitSummary = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const oneDayMs = 86400000;
    const start7dMs = todayStart - 6 * oneDayMs;
    const end7dMs = todayStart + oneDayMs - 1;
    const prev7dStartMs = start7dMs - 7 * oneDayMs;
    const prev7dEndMs = start7dMs - 1;
    const dayShortNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

    const buckets = Array.from({ length: 7 }, (_, idx) => {
      const dayTs = start7dMs + idx * oneDayMs;
      const d = new Date(dayTs);
      const isToday = dayTs === todayStart;
      const dayShort = dayShortNames[d.getDay()];
      return {
        idx,
        dayStart: dayTs,
        dayEnd: dayTs + oneDayMs - 1,
        dayName: dayShort,
        dayLabel: isToday ? 'Hari Ini' : `${dayShort} (${d.getDate()}/${d.getMonth() + 1})`,
        fullDateLabel: d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        marginPercent: 0,
        unitsSold: 0,
        txCount: 0,
        isToday,
        isBestDay: false,
      };
    });

    let prev7dRevenue = 0;
    let prev7dCogs = 0;

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      if (ts >= start7dMs && ts <= end7dMs) {
        const bucketIdx = Math.floor((ts - start7dMs) / oneDayMs);
        const bucket = buckets[bucketIdx];
        if (!bucket) return;

        let txMatched = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (hiddenCategorySet.has(catName)) return;

          const rev = item.totalAmount || 0;
          const cogs = getItemFifoCogs(item, prod);
          const units = (item.quantity || 0) * (item.conversionFactor || 1);

          bucket.revenue += rev;
          bucket.cogs += cogs;
          bucket.unitsSold += units;
          txMatched = true;
        });

        if (txMatched) {
          bucket.txCount += 1;
        }
      } else if (ts >= prev7dStartMs && ts <= prev7dEndMs) {
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (hiddenCategorySet.has(catName)) return;

          prev7dRevenue += item.totalAmount || 0;
          prev7dCogs += getItemFifoCogs(item, prod);
        });
      }
    });

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalTxCount = 0;
    let bestDayIndex = -1;
    let bestDayProfit = -Infinity;

    buckets.forEach((b, idx) => {
      b.grossProfit = b.revenue - b.cogs;
      b.marginPercent = b.revenue > 0 ? (b.grossProfit / b.revenue) * 100 : 0;
      totalRevenue += b.revenue;
      totalCogs += b.cogs;
      totalTxCount += b.txCount;

      if (b.txCount > 0 && b.grossProfit > bestDayProfit) {
        bestDayProfit = b.grossProfit;
        bestDayIndex = idx;
      }
    });

    if (bestDayIndex >= 0) {
      buckets[bestDayIndex].isBestDay = true;
    }

    const totalGrossProfit = totalRevenue - totalCogs;
    const avgDailyGrossProfit = Math.round(totalGrossProfit / 7);
    const avgMarginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0;
    const prev7dGrossProfit = prev7dRevenue - prev7dCogs;
    const profitGrowthPercent =
      prev7dGrossProfit !== 0
        ? ((totalGrossProfit - prev7dGrossProfit) / Math.abs(prev7dGrossProfit)) * 100
        : totalGrossProfit > 0
        ? 100
        : 0;

    const rangeStartDate = new Date(start7dMs);
    const rangeEndDate = new Date(todayStart);
    const rangeLabel = `${rangeStartDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })} – ${rangeEndDate.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;

    return {
      dailyData: buckets,
      rangeLabel,
      totalRevenue,
      totalCogs,
      totalGrossProfit,
      avgDailyGrossProfit,
      avgMarginPercent,
      totalTxCount,
      prev7dGrossProfit,
      profitGrowthPercent,
      hasPrev7dData: prev7dRevenue > 0,
      bestDay: bestDayIndex >= 0 ? buckets[bestDayIndex] : null,
      hasAnyData: totalTxCount > 0,
    };
  }, [transactions, productMap, hiddenCategorySet]);

  // Real-Time Laba Bersih (Gross Profit FIFO - Biaya Operasional dari Cashflow)
  const netProfitSummary = useMemo(() => {
    const now = new Date();
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
    const todayEndMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
    const monthStartMs = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
    const monthEndMs = todayEndMs;

    const getCashflowLocalMs = (c: CashflowRecord): number => {
      if (c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date.trim())) {
        const [y, m, d] = c.date.trim().split('-').map(Number);
        if (typeof c.timestamp === 'number' && !isNaN(c.timestamp)) {
          const tsDate = new Date(c.timestamp);
          if (
            tsDate.getFullYear() === y &&
            tsDate.getMonth() + 1 === m &&
            tsDate.getDate() === d
          ) {
            return c.timestamp;
          }
        }
        return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
      }
      return c.timestamp || 0;
    };

    let periodStoreRevenue = 0;
    let periodStoreCogs = 0;
    let prevPeriodStoreRevenue = 0;
    let prevPeriodStoreCogs = 0;
    let todayGrossProfit = 0;
    let mtdGrossProfit = 0;

    transactions.forEach((tx) => {
      const ts = tx.timestamp;
      const inCurrent = ts >= currentStart && ts <= currentEnd;
      const inPrevious = ts >= previousStart && ts <= previousEnd;
      const inToday = ts >= todayStartMs && ts <= todayEndMs;
      const inMonth = ts >= monthStartMs && ts <= monthEndMs;

      if (!inCurrent && !inPrevious && !inToday && !inMonth) return;

      let txRev = 0;
      let txCogs = 0;
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        txRev += item.totalAmount || 0;
        txCogs += getItemFifoCogs(item, prod);
      });
      const txProfit = txRev - txCogs;

      if (inCurrent) {
        periodStoreRevenue += txRev;
        periodStoreCogs += txCogs;
      }
      if (inPrevious) {
        prevPeriodStoreRevenue += txRev;
        prevPeriodStoreCogs += txCogs;
      }
      if (inToday) {
        todayGrossProfit += txProfit;
      }
      if (inMonth) {
        mtdGrossProfit += txProfit;
      }
    });

    const periodGrossProfit = periodStoreRevenue - periodStoreCogs;
    const prevGrossProfit = prevPeriodStoreRevenue - prevPeriodStoreCogs;

    let periodExpenses = 0;
    let periodExpenseCount = 0;
    let periodOtherIncome = 0;
    let prevExpenses = 0;
    let todayExpenses = 0;
    let mtdExpenses = 0;
    const expenseByCategoryMap = new Map<string, number>();

    cashflows.forEach((c) => {
      const amt = Number(c.amount) || 0;
      if (amt <= 0) return;
      const ts = getCashflowLocalMs(c);

      if (c.type === 'PENGELUARAN') {
        if (c.isCashWithdrawalOutflow || c.category === 'Tarik Tunai (Kas Keluar)') {
          return;
        }
        if (ts >= currentStart && ts <= currentEnd) {
          periodExpenses += amt;
          periodExpenseCount += 1;
          const catName = (c.category || 'Lain-lain').trim() || 'Lain-lain';
          expenseByCategoryMap.set(catName, (expenseByCategoryMap.get(catName) || 0) + amt);
        }
        if (ts >= previousStart && ts <= previousEnd) {
          prevExpenses += amt;
        }
        if (ts >= todayStartMs && ts <= todayEndMs) {
          todayExpenses += amt;
        }
        if (ts >= monthStartMs && ts <= monthEndMs) {
          mtdExpenses += amt;
        }
      } else if (c.type === 'PEMASUKAN') {
        if (c.isCashWithdrawalAdminProfit || c.category === 'Keuntungan Biaya Admin (Tarik Tunai)') {
          return;
        }
        if (ts >= currentStart && ts <= currentEnd) {
          periodOtherIncome += amt;
        }
      }
    });

    const topExpenseCategories = Array.from(expenseByCategoryMap.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 2);

    const netProfit = periodGrossProfit - periodExpenses;
    const prevNetProfit = prevGrossProfit - prevExpenses;
    const hasPrevBaseline = prevPeriodStoreRevenue > 0 || prevExpenses > 0;
    const netProfitDeltaAmount = netProfit - prevNetProfit;
    const netProfitGrowthPercent =
      hasPrevBaseline && prevNetProfit !== 0
        ? (netProfitDeltaAmount / Math.abs(prevNetProfit)) * 100
        : netProfit > 0 && hasPrevBaseline
        ? 100
        : 0;

    const netMarginPercent =
      periodStoreRevenue > 0 ? (netProfit / periodStoreRevenue) * 100 : 0;
    const grossMarginPercent =
      periodStoreRevenue > 0 ? (periodGrossProfit / periodStoreRevenue) * 100 : 0;
    const expenseRatioToRevenue =
      periodStoreRevenue > 0 ? (periodExpenses / periodStoreRevenue) * 100 : 0;

    return {
      periodStoreRevenue,
      periodStoreCogs,
      periodGrossProfit,
      periodExpenses,
      periodExpenseCount,
      periodOtherIncome,
      netProfit,
      netMarginPercent,
      grossMarginPercent,
      expenseRatioToRevenue,
      prevNetProfit,
      netProfitDeltaAmount,
      netProfitGrowthPercent,
      hasPrevBaseline,
      todayGrossProfit,
      todayExpenses,
      todayNetProfit: todayGrossProfit - todayExpenses,
      mtdGrossProfit,
      mtdExpenses,
      mtdNetProfit: mtdGrossProfit - mtdExpenses,
      topExpenseCategories,
    };
  }, [transactions, cashflows, productMap, currentStart, currentEnd, previousStart, previousEnd]);

  // Top 5 Produk Terlaris Aggregation (for current selected period & active category filters)
  const top5ProductsSummary = useMemo(() => {
    const DONUT_PALETTE = ['#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#f43f5e'];

    interface ProductAgg {
      productId: string;
      name: string;
      category: string;
      unitName: string;
      unitsSold: number;
      revenue: number;
      cogs: number;
      txIds: Set<string>;
    }

    const aggMap = new Map<string, ProductAgg>();
    let totalPeriodRevenue = 0;
    let totalPeriodUnits = 0;
    let totalPeriodCogs = 0;

    transactions.forEach((tx) => {
      if (tx.timestamp < currentStart || tx.timestamp > currentEnd) return;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        if (hiddenCategorySet.has(catName)) return;

        const units = item.quantity * (item.conversionFactor || 1);
        const rev = item.totalAmount || 0;
        const cogs = getItemFifoCogs(item, prod);

        totalPeriodUnits += units;
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
            name: item.productName || prod?.name || 'Produk',
            category: catName,
            unitName: prod?.baseUnit || item.unitName || 'PCS',
            unitsSold: units,
            revenue: rev,
            cogs,
            txIds: new Set([tx.id]),
          });
        }
      });
    });

    const allProducts = Array.from(aggMap.values()).map((entry) => {
      const profit = entry.revenue - entry.cogs;
      const marginPercent = entry.revenue > 0 ? (profit / entry.revenue) * 100 : 0;
      const metricValue =
        topProductsMetric === 'UNITS'
          ? entry.unitsSold
          : topProductsMetric === 'REVENUE'
          ? entry.revenue
          : Math.max(0, profit);

      return {
        productId: entry.productId,
        name: entry.name,
        shortName: entry.name.length > 22 ? `${entry.name.slice(0, 20)}...` : entry.name,
        category: entry.category,
        unitName: entry.unitName,
        unitsSold: entry.unitsSold,
        revenue: entry.revenue,
        profit,
        marginPercent,
        txCount: entry.txIds.size,
        value: metricValue,
      };
    });

    allProducts.sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return b.revenue - a.revenue;
    });

    const totalMetricOverall =
      topProductsMetric === 'UNITS'
        ? totalPeriodUnits
        : topProductsMetric === 'REVENUE'
        ? totalPeriodRevenue
        : Math.max(0, totalPeriodRevenue - totalPeriodCogs);

    const top5Raw = allProducts.slice(0, 5).filter((p) => p.value > 0);
    const top5MetricSum = top5Raw.reduce((sum, p) => sum + p.value, 0);

    const items = top5Raw.map((p, idx) => ({
      ...p,
      rank: idx + 1,
      color: isDefaultTheme
        ? DONUT_PALETTE[idx % DONUT_PALETTE.length]
        : palette.series[idx % palette.series.length],
      shareOfAllPercent: totalMetricOverall > 0 ? (p.value / totalMetricOverall) * 100 : 0,
      shareOfTop5Percent: top5MetricSum > 0 ? (p.value / top5MetricSum) * 100 : 0,
    }));

    const top5ShareOfAll = totalMetricOverall > 0 ? (top5MetricSum / totalMetricOverall) * 100 : 0;

    return {
      items,
      totalUniqueProducts: allProducts.length,
      totalMetricOverall,
      top5MetricSum,
      top5ShareOfAll,
      totalPeriodRevenue,
      totalPeriodUnits,
      totalPeriodProfit: totalPeriodRevenue - totalPeriodCogs,
    };
  }, [transactions, productMap, currentStart, currentEnd, hiddenCategorySet, topProductsMetric, isDefaultTheme, palette.series]);

  const focusedTopProductIdx =
    hoveredTopProductIdx !== null && hoveredTopProductIdx < top5ProductsSummary.items.length
      ? hoveredTopProductIdx
      : pinnedTopProductIdx !== null && pinnedTopProductIdx < top5ProductsSummary.items.length
      ? pinnedTopProductIdx
      : null;

  const activeTopProductItem =
    focusedTopProductIdx !== null ? top5ProductsSummary.items[focusedTopProductIdx] : null;

  const formatTopProductMetricValue = (val: number, metricType: MetricType, unitName = 'Unit') => {
    if (metricType === 'UNITS') {
      return `${formatNumber(val)} ${unitName}`;
    }
    return formatRupiah(val);
  };

  // Custom Tooltip for Top 5 Produk Terlaris Donut Chart
  const CustomTopProductDonutTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const item = payload[0]?.payload;
    if (!item) return null;

    return (
      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[240px] space-y-2 z-50">
        <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-start gap-2 min-w-0">
            <span
              className="w-3 h-3 rounded-full shrink-0 mt-0.5 ring-2 ring-white/20"
              style={{ backgroundColor: item.color }}
            />
            <div className="min-w-0">
              <div className="font-bold text-slate-100 leading-tight">{item.name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Peringkat #{item.rank} • {item.category}
              </div>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 shrink-0">
            {item.shareOfAllPercent.toFixed(1)}% Total
          </span>
        </div>

        <div className="space-y-1 font-mono text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Volume Terjual:</span>
            <span className="font-bold text-sky-300 tabular-nums">
              {formatNumber(item.unitsSold)} {item.unitName}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Total Omzet:</span>
            <span className="font-bold text-slate-100 tabular-nums">{formatRupiah(item.revenue)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Laba Kotor (FIFO):</span>
            <span className="font-bold text-emerald-400 tabular-nums">{formatRupiah(item.profit)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Margin Profit:</span>
            <span className="font-semibold text-amber-300 tabular-nums">{item.marginPercent.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-center pt-1 border-t border-slate-800 text-[10px] text-slate-400 font-sans">
            <span>Frekuensi Terjual:</span>
            <span className="text-slate-200 font-semibold">{item.txCount} transaksi</span>
          </div>
        </div>
      </div>
    );
  };

  // Custom Chart Tooltip
  const CustomBarTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      if (!data) return null;

      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[240px] space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }} />
              <span className="font-bold text-slate-100 text-sm">{data.categoryName}</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-sky-300">
              {data.sharePercent.toFixed(1)}% Kontribusi
            </span>
          </div>

          <div className="space-y-1.5 font-mono text-[11px]">
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Omzet Minggu Ini:</span>
              <span className="font-bold text-sky-400 tabular-nums">{formatRupiah(data.revenue)}</span>
            </div>
            {compareWithPrevious && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Omzet Minggu Lalu:</span>
                <span className="font-medium text-slate-300 tabular-nums">{formatRupiah(data.previousValue)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Tren Pertumbuhan:</span>
              <span className={`font-bold flex items-center gap-0.5 ${data.growthPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {data.growthPercent >= 0 ? '+' : ''}{data.growthPercent.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Volume Terjual:</span>
              <span className="font-bold text-amber-300 tabular-nums">{formatNumber(data.units)} Unit</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Laba Kotor:</span>
              <span className="font-bold text-emerald-400 tabular-nums">{formatRupiah(data.profit)} ({data.marginPercent.toFixed(1)}%)</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-300">
            <span className="text-slate-400">Produk Terlaris:</span>
            <span className="font-semibold truncate max-w-[140px] text-slate-200">{data.topProduct}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-5 animate-dashboard-enter">
      {/* Pengingat Otomatis Piutang Pelanggan Jatuh Tempo (<= 3 Hari ke Depan & Lewat Tempo) */}
      <PiutangDueAlertBanner
        transactions={transactions}
        customers={customers}
        storeName={storeName}
        bcaAccountNumber={bcaAccountNumber}
        bcaAccountName={bcaAccountName}
        onNavigateToPiutang={onNavigateToPiutang}
      />

      {/* Notifikasi Peringatan Jatuh Tempo Pajak Bulanan (H-7 sebelum tgl 15 / Lewat Tempo) */}
      {(currentUserRole === 'ADMIN' || currentUserRole === 'STORE_MANAGER') && storeSettings && (
        <TaxDueAlertBanner
          transactions={transactions}
          purchases={purchases}
          taxRecords={taxRecords}
          taxAdjustments={taxAdjustments}
          storeSettings={storeSettings}
          variant="DASHBOARD"
          onNavigateToTax={onNavigateToTax}
        />
      )}

      {/* Peringatan Otomatis Ambang Batas Omzet PKP (Rp 4,8 Miliar / Tahun) */}
      {(currentUserRole === 'ADMIN' || currentUserRole === 'STORE_MANAGER') && storeSettings && (
        <PkpThresholdAlertBanner
          transactions={transactions}
          purchases={purchases}
          taxRecords={taxRecords}
          taxAdjustments={taxAdjustments}
          storeSettings={storeSettings}
          onNavigateToTax={onNavigateToTax}
        />
      )}

      {/* Top Compact Responsive KPI & Shift Summary Grid (Tablet & Desktop Above-the-Fold Optimized) */}
      <div className="bg-white p-3 md:p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <Activity className="w-4 h-4 shrink-0" style={{ color: palette.primary }} />
            <h3 className="text-xs font-extrabold text-slate-900">
              Ringkasan KPI Utama &amp; Penjadwalan Shift
            </h3>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
              {periodLabel} · {formatNumber(hourlyTrafficSummary.totalTx)} trx
            </span>
            {specificSelectedCategoryName ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {specificSelectedCategoryName}
              </span>
            ) : isCategoryFiltered ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {activeCategoryCount}/{categoryList.length} Kategori
              </span>
            ) : null}
            {(() => {
              const ratedTxs = transactions.filter(
                (t) => typeof t.customerRating === 'number' && t.customerRating >= 1
              );
              const avgScore =
                ratedTxs.length > 0
                  ? ratedTxs.reduce((s, t) => s + (t.customerRating || 0), 0) / ratedTxs.length
                  : 0;
              return (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setDashboardTab('PERFORMANCE');
                    window.setTimeout(() => {
                      document
                        .getElementById('customer-satisfaction-report-section')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 60);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  title="Lihat laporan ringkasan kepuasan pelanggan"
                >
                  <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                  <span>
                    {ratedTxs.length > 0
                      ? `Kepuasan ${avgScore.toFixed(1)}/5 (${ratedTxs.length})`
                      : 'Kepuasan Pelanggan'}
                  </span>
                </button>
              );
            })()}
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto shrink-0">
            <ChartThemeSelector />

            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[10.5px] shrink-0">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setQuietHourScope('OPERATIONAL');
                }}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  quietHourScope === 'OPERATIONAL'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Jam Operasional ({hourlyTrafficSummary.opRangeLabel})
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setQuietHourScope('ACTIVE_ONLY');
                }}
                className={`px-2 py-1 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  quietHourScope === 'ACTIVE_ONLY'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Jam Ada Transaksi
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-2.5">
          {/* Card 1: Revenue Growth % (Hari Ini vs Rata-rata 7 Hari Terakhir) */}
          <div
            className={`p-2.5 md:p-3 rounded-xl border flex flex-col justify-between gap-2 ${
              revenueGrowthTodayVs7d.todayRevenue === 0 && !revenueGrowthTodayVs7d.has7dBaseline
                ? 'bg-slate-50/70 border-slate-200'
                : revenueGrowthTodayVs7d.growthPercent >= 0
                ? 'bg-gradient-to-br from-emerald-50/90 via-white to-sky-50/40 border-emerald-200'
                : 'bg-gradient-to-br from-rose-50/85 via-white to-amber-50/40 border-rose-200'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide text-slate-600 truncate">
                  <Activity className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">Revenue Growth</span>
                </span>
                <span
                  className={`p-1 rounded-lg border shrink-0 ${
                    revenueGrowthTodayVs7d.growthPercent >= 0
                      ? 'bg-emerald-100/80 border-emerald-200 text-emerald-700'
                      : 'bg-rose-100/80 border-rose-200 text-rose-700'
                  }`}
                >
                  {revenueGrowthTodayVs7d.growthPercent >= 0 ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5" />
                  )}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
                <span
                  className={`text-xl md:text-2xl font-black font-mono tabular-nums tracking-tight leading-none ${
                    revenueGrowthTodayVs7d.todayRevenue === 0 && !revenueGrowthTodayVs7d.has7dBaseline
                      ? 'text-slate-400'
                      : revenueGrowthTodayVs7d.growthPercent >= 0
                      ? 'text-emerald-700'
                      : 'text-rose-700'
                  }`}
                >
                  {revenueGrowthTodayVs7d.has7dBaseline
                    ? `${revenueGrowthTodayVs7d.growthPercent >= 0 ? '+' : ''}${revenueGrowthTodayVs7d.growthPercent.toFixed(1)}%`
                    : revenueGrowthTodayVs7d.todayRevenue > 0
                    ? '+100%'
                    : '0.0%'}
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold border ${
                    revenueGrowthTodayVs7d.todayRevenue === 0 && !revenueGrowthTodayVs7d.has7dBaseline
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : revenueGrowthTodayVs7d.growthPercent >= 0
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-rose-100 text-rose-800 border-rose-200'
                  }`}
                >
                  {revenueGrowthTodayVs7d.growthPercent >= 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  <span>vs Avg 7H</span>
                </span>
              </div>
            </div>

            <div className="pt-1.5 border-t border-slate-200/80 space-y-0.5 text-[10px]">
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Hari Ini ({formatNumber(revenueGrowthTodayVs7d.todayTxCount)} trx)</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums truncate">
                  {formatRupiah(revenueGrowthTodayVs7d.todayRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Avg 7H ({revenueGrowthTodayVs7d.activeDaysIn7d}/7 hr)</span>
                <span className="font-mono font-semibold text-slate-700 tabular-nums truncate">
                  {formatRupiah(Math.round(revenueGrowthTodayVs7d.avgLast7Days))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Selisih</span>
                <span
                  className={`font-mono font-bold tabular-nums truncate ${
                    revenueGrowthTodayVs7d.diffAmount >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {revenueGrowthTodayVs7d.diffAmount >= 0 ? '+' : ''}
                  {formatRupiah(Math.round(revenueGrowthTodayVs7d.diffAmount))}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Proyeksi Laba Bulan Ini (Proporsional dari Tren Harian) */}
          <div className="p-2.5 md:p-3 rounded-xl bg-gradient-to-br from-emerald-50/90 via-teal-50/45 to-white border border-emerald-200 flex flex-col justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide text-emerald-800 truncate">
                  <DollarSign className="w-3 h-3 text-emerald-600 shrink-0" />
                  <span className="truncate">Proyeksi Laba Bln Ini</span>
                </span>
                <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-emerald-100/90 text-emerald-800 border border-emerald-200 shrink-0 font-mono">
                  H{monthlyProfitProjection.elapsedDays}/{monthlyProfitProjection.totalDaysInMonth}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
                <span
                  className="text-lg sm:text-xl font-black font-mono text-emerald-950 tabular-nums leading-none tracking-tight truncate"
                  title={`Estimasi akhir ${monthlyProfitProjection.monthLabel}: ${formatRupiah(monthlyProfitProjection.projectedMonthlyProfit)}`}
                >
                  {formatRupiah(monthlyProfitProjection.projectedMonthlyProfit)}
                </span>
                {monthlyProfitProjection.hasPrevMonthBaseline ? (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold border ${
                      monthlyProfitProjection.vsPrevMonthPercent >= 0
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-rose-100 text-rose-800 border-rose-200'
                    }`}
                  >
                    {monthlyProfitProjection.vsPrevMonthPercent >= 0 ? '+' : ''}
                    {monthlyProfitProjection.vsPrevMonthPercent.toFixed(0)}% bln lalu
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                    Margin {monthlyProfitProjection.mtdMarginPercent.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            <div className="pt-1.5 border-t border-emerald-200/75 space-y-0.5 text-[10px]">
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Laba Berjalan</span>
                <span className="font-mono font-bold text-emerald-800 tabular-nums truncate">
                  {formatRupiah(monthlyProfitProjection.mtdProfit)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Rata-rata Harian</span>
                <span className="font-mono font-semibold text-slate-800 tabular-nums truncate">
                  {formatRupiah(monthlyProfitProjection.avgDailyProfit)}/hr
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Proyeksi Omzet</span>
                <span className="font-mono font-semibold text-slate-700 tabular-nums truncate">
                  {formatRupiah(monthlyProfitProjection.projectedMonthlyRevenue)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Jam Paling Sibuk (Peak Hour for Shift Scheduling) */}
          <div className="p-2.5 md:p-3 rounded-xl bg-gradient-to-br from-amber-50/95 via-orange-50/50 to-white border border-amber-200 flex flex-col justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide text-orange-700 truncate">
                  <Flame className="w-3 h-3 text-orange-600 shrink-0" />
                  <span className="truncate">Jam Paling Sibuk</span>
                </span>
                {hourlyTrafficSummary.busiest && (
                  <span className="px-1.5 py-0.5 rounded-md bg-orange-600 text-white font-mono text-[10px] font-extrabold tabular-nums shrink-0">
                    {formatNumber(hourlyTrafficSummary.busiest.txCount)} trx
                  </span>
                )}
              </div>

              <div className="text-lg sm:text-xl md:text-2xl font-black font-mono text-slate-900 tabular-nums leading-none tracking-tight">
                {hourlyTrafficSummary.busiest ? hourlyTrafficSummary.busiest.hourRangeLabel : '-'}
              </div>
            </div>

            {hourlyTrafficSummary.busiest ? (
              <div className="pt-1.5 border-t border-amber-200/80 space-y-0.5 text-[10px]">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-slate-600">Rata-rata / Pangsa</span>
                  <span className="font-mono font-bold text-orange-800 tabular-nums">
                    {hourlyTrafficSummary.busiest.avgPerDay.toFixed(1)}/hr · {hourlyTrafficSummary.busiest.sharePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-slate-600">Omzet Jam Sibuk</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums truncate">
                    {formatRupiah(hourlyTrafficSummary.busiest.revenue)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-orange-800 font-extrabold">
                  <span className="inline-flex items-center gap-1">
                    <Users className="w-3 h-3 shrink-0" />
                    <span>Shift Kasir</span>
                  </span>
                  <span className="tabular-nums">
                    {hourlyTrafficSummary.busiest.recommendedCashiers} Kasir Aktif
                  </span>
                </div>
              </div>
            ) : (
              <div className="pt-1.5 border-t border-amber-200/80 text-[10px] text-slate-500">
                Belum ada transaksi periode ini.
              </div>
            )}
          </div>

          {/* Card 3: Jam Paling Sepi (Quiet Hour for Restock & Shift Rest) */}
          <div className="p-2.5 md:p-3 rounded-xl bg-gradient-to-br from-sky-50/85 via-slate-50 to-white border border-sky-200 flex flex-col justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide text-sky-800 truncate">
                  <Coffee className="w-3 h-3 text-sky-600 shrink-0" />
                  <span className="truncate">Jam Paling Sepi</span>
                </span>
                {hourlyTrafficSummary.quietest && (
                  <span className="px-1.5 py-0.5 rounded-md bg-sky-700 text-white font-mono text-[10px] font-extrabold tabular-nums shrink-0">
                    {formatNumber(hourlyTrafficSummary.quietest.txCount)} trx
                  </span>
                )}
              </div>

              <div className="text-lg sm:text-xl md:text-2xl font-black font-mono text-slate-900 tabular-nums leading-none tracking-tight">
                {hourlyTrafficSummary.quietest ? hourlyTrafficSummary.quietest.hourRangeLabel : '-'}
              </div>
            </div>

            {hourlyTrafficSummary.quietest ? (
              <div className="pt-1.5 border-t border-sky-200/80 space-y-0.5 text-[10px]">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-slate-600">
                    {hourlyTrafficSummary.quietest.txCount === 0 && hourlyTrafficSummary.quietestActive
                      ? 'Aktif Tersepi'
                      : 'Rata-rata / Pangsa'}
                  </span>
                  <span className="font-mono font-bold text-sky-900 tabular-nums truncate">
                    {hourlyTrafficSummary.quietest.txCount === 0 && hourlyTrafficSummary.quietestActive
                      ? `${hourlyTrafficSummary.quietestActive.hourLabel} (${hourlyTrafficSummary.quietestActive.txCount} trx)`
                      : `${hourlyTrafficSummary.quietest.avgPerDay.toFixed(1)}/hr · ${hourlyTrafficSummary.quietest.sharePercent.toFixed(1)}%`}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-slate-600">Omzet Jam Sepi</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums truncate">
                    {formatRupiah(hourlyTrafficSummary.quietest.revenue)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-1 text-sky-800 font-extrabold">
                  <span>Saran Shift</span>
                  <span>1 Kasir · Restock</span>
                </div>
              </div>
            ) : (
              <div className="pt-1.5 border-t border-sky-200/80 text-[10px] text-slate-500">
                Belum ada transaksi periode ini.
              </div>
            )}
          </div>

          {/* Card 4: Persentase Pelanggan Kembali (Returning Customer Rate) */}
          <div className="p-2.5 md:p-3 rounded-xl bg-gradient-to-br from-indigo-50/85 via-white to-sky-50/40 border border-indigo-200 flex flex-col justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide text-indigo-700 truncate">
                  <Repeat className="w-3 h-3 text-indigo-600 shrink-0" />
                  <span className="truncate">Pelanggan Kembali</span>
                </span>
                <span className="p-1 rounded-lg bg-indigo-100/90 border border-indigo-200 text-indigo-700 shrink-0">
                  <UserCheck className="w-3.5 h-3.5" />
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
                <span className="text-xl md:text-2xl font-black font-mono text-indigo-950 tabular-nums leading-none tracking-tight">
                  {returningCustomerMetrics.periodReturningRate.toFixed(1)}%
                </span>
                {returningCustomerMetrics.hasPrevComparison ? (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold border ${
                      returningCustomerMetrics.rateDeltaPercent >= 0
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-rose-100 text-rose-800 border-rose-200'
                    }`}
                  >
                    {returningCustomerMetrics.rateDeltaPercent >= 0 ? '+' : ''}
                    {returningCustomerMetrics.rateDeltaPercent.toFixed(1)} pts
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-indigo-100/80 text-indigo-800 border border-indigo-200">
                    All: {returningCustomerMetrics.allTimeReturningRate.toFixed(0)}%
                  </span>
                )}
              </div>
            </div>

            <div className="pt-1.5 border-t border-indigo-200/70 space-y-0.5 text-[10px]">
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Repeat / Baru</span>
                <span className="font-mono font-bold text-indigo-800 tabular-nums">
                  {formatNumber(returningCustomerMetrics.periodReturningCount)}/{formatNumber(returningCustomerMetrics.periodIdentifiedCount)} ({formatNumber(returningCustomerMetrics.periodNewCount)} baru)
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Omzet Loyal ({returningCustomerMetrics.returningRevenueSharePercent.toFixed(0)}%)</span>
                <span className="font-mono font-bold text-emerald-700 tabular-nums truncate">
                  {formatRupiah(returningCustomerMetrics.returningRevenuePeriod)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Kunjungan</span>
                <span className="font-mono font-semibold text-slate-800 tabular-nums truncate">
                  {returningCustomerMetrics.avgVisitsPerCustomer.toFixed(1)}x avg
                </span>
              </div>
            </div>
          </div>

          {/* Card 6: Customer Retention Rate (>1x Transaksi di Bulan Berjalan) */}
          <div className="p-2.5 md:p-3 rounded-xl bg-gradient-to-br from-teal-50/90 via-white to-emerald-50/40 border border-teal-200 flex flex-col justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold uppercase tracking-wide text-teal-700 truncate">
                  <Award className="w-3 h-3 text-teal-600 shrink-0" />
                  <span className="truncate">Retention Rate</span>
                </span>
                <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-teal-100/90 text-teal-800 border border-teal-200 shrink-0">
                  &gt;1x {customerRetentionMonthly.monthLabel}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-1.5 flex-wrap">
                <span className="text-xl md:text-2xl font-black font-mono text-teal-950 tabular-nums leading-none tracking-tight">
                  {customerRetentionMonthly.retentionRate.toFixed(1)}%
                </span>
                {customerRetentionMonthly.hasPrevMonthData ? (
                  <span
                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-extrabold border ${
                      customerRetentionMonthly.deltaPoints >= 0
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : 'bg-rose-100 text-rose-800 border-rose-200'
                    }`}
                  >
                    {customerRetentionMonthly.deltaPoints >= 0 ? '+' : ''}
                    {customerRetentionMonthly.deltaPoints.toFixed(1)} pts
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                    Bln Berjalan
                  </span>
                )}
              </div>
            </div>

            <div className="pt-1.5 border-t border-teal-200/70 space-y-0.5 text-[10px]">
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Pelanggan &gt;1x</span>
                <span className="font-mono font-bold text-teal-800 tabular-nums">
                  {formatNumber(customerRetentionMonthly.retainedCount)} / {formatNumber(customerRetentionMonthly.totalCustomersMonth)} ({formatNumber(customerRetentionMonthly.singleTxCount)} 1x)
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Omzet Repeat ({customerRetentionMonthly.retainedRevenueShare.toFixed(0)}%)</span>
                <span className="font-mono font-bold text-emerald-700 tabular-nums truncate">
                  {formatRupiah(customerRetentionMonthly.retainedRevenue)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-1">
                <span className="text-slate-500">Trx Member</span>
                <span className="font-mono font-semibold text-slate-800 tabular-nums">
                  {formatNumber(customerRetentionMonthly.retainedTxTotal)} / {formatNumber(customerRetentionMonthly.totalMonthIdentifiedTx)} trx
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Kartu Ringkasan Evaluasi Penetapan Harga: Rata-rata Margin Keuntungan Kotor Bulan Ini vs Bulan Lalu */}
        <div
          className={`p-3 md:p-3.5 rounded-xl border ${
            !monthlyGrossMarginComparison.hasCurData
              ? 'bg-slate-50/70 border-slate-200'
              : monthlyGrossMarginComparison.evaluationTone === 'POSITIVE'
              ? 'bg-gradient-to-r from-emerald-50/85 via-white to-sky-50/50 border-emerald-200'
              : monthlyGrossMarginComparison.evaluationTone === 'WARNING'
              ? 'bg-gradient-to-r from-amber-50/90 via-white to-rose-50/50 border-amber-200'
              : 'bg-gradient-to-r from-slate-50/90 via-white to-sky-50/40 border-slate-200'
          }`}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">
            {/* Primary Average Gross Margin Figure */}
            <div className="md:col-span-5 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-slate-700">
                  <Percent
                    className={`w-3.5 h-3.5 shrink-0 ${
                      monthlyGrossMarginComparison.evaluationTone === 'POSITIVE'
                        ? 'text-emerald-600'
                        : monthlyGrossMarginComparison.evaluationTone === 'WARNING'
                        ? 'text-amber-600'
                        : 'text-sky-600'
                    }`}
                  />
                  <span>
                    Rata-Rata Margin Kotor ({monthlyGrossMarginComparison.curMonthLabel})
                  </span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border whitespace-nowrap ${
                    !monthlyGrossMarginComparison.hasCurData
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : monthlyGrossMarginComparison.evaluationTone === 'POSITIVE'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : monthlyGrossMarginComparison.evaluationTone === 'WARNING'
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-sky-100 text-sky-800 border-sky-200'
                  }`}
                >
                  {monthlyGrossMarginComparison.evaluationTone === 'POSITIVE' ? (
                    <TrendingUp className="w-3 h-3 shrink-0" />
                  ) : monthlyGrossMarginComparison.evaluationTone === 'WARNING' ? (
                    <TrendingDown className="w-3 h-3 shrink-0" />
                  ) : (
                    <Minus className="w-3 h-3 shrink-0" />
                  )}
                  <span>{monthlyGrossMarginComparison.evaluationLabel}</span>
                </span>
              </div>

              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span
                  className={`text-2xl md:text-[26px] font-black font-mono tabular-nums tracking-tight leading-none ${
                    !monthlyGrossMarginComparison.hasCurData
                      ? 'text-slate-400'
                      : monthlyGrossMarginComparison.curAvgTxMargin >= 0
                      ? 'text-slate-900'
                      : 'text-rose-700'
                  }`}
                >
                  {monthlyGrossMarginComparison.curAvgTxMargin.toFixed(1)}%
                </span>

                <span className="text-xs font-mono font-semibold text-slate-600 tabular-nums">
                  rata-rata {formatNumber(monthlyGrossMarginComparison.curTxCount)} trx
                </span>

                {monthlyGrossMarginComparison.hasCurData &&
                  monthlyGrossMarginComparison.hasPrevData && (
                    <span
                      className={`inline-flex items-center gap-0.5 text-[11px] font-mono font-bold tabular-nums ${
                        monthlyGrossMarginComparison.deltaPoints >= 0
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {monthlyGrossMarginComparison.deltaPoints >= 0 ? (
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>
                        {monthlyGrossMarginComparison.deltaPoints >= 0 ? '+' : ''}
                        {monthlyGrossMarginComparison.deltaPoints.toFixed(1)} pts vs{' '}
                        {monthlyGrossMarginComparison.prevMonthShort}
                      </span>
                    </span>
                  )}
              </div>

              <div className="text-[11px] text-slate-600 flex items-center gap-1.5 flex-wrap">
                <span>{monthlyGrossMarginComparison.pricingGuidance}</span>
                {isCategoryFiltered && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 font-semibold">
                      Sesuai filter {activeCategoryCount} kategori aktif
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Hairline-Divided Comparison & Pricing Diagnostic Columns */}
            <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3 md:border-l md:border-slate-200/80 md:pl-4">
              {/* Previous Month Comparison */}
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Bulan Lalu ({monthlyGrossMarginComparison.prevMonthShort})
                </div>
                <div className="text-sm md:text-base font-black font-mono text-slate-900 tabular-nums">
                  {monthlyGrossMarginComparison.hasPrevData
                    ? `${monthlyGrossMarginComparison.prevAvgTxMargin.toFixed(1)}%`
                    : '—'}
                </div>
                <div className="text-[10px] text-slate-500 font-mono tabular-nums truncate">
                  {monthlyGrossMarginComparison.hasPrevData
                    ? `${formatNumber(monthlyGrossMarginComparison.prevTxCount)} trx · Laba ${formatRupiah(monthlyGrossMarginComparison.prevGrossProfit)}`
                    : `Belum ada transaksi ${monthlyGrossMarginComparison.prevMonthShort}`}
                </div>
              </div>

              {/* Weighted Margin vs Gross Profit */}
              <div className="space-y-0.5 sm:border-l sm:border-slate-200/75 sm:pl-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Margin Agregat (FIFO)
                </div>
                <div className="text-sm md:text-base font-black font-mono text-slate-900 tabular-nums flex items-baseline gap-1.5">
                  <span>{monthlyGrossMarginComparison.curWeightedMargin.toFixed(1)}%</span>
                  {monthlyGrossMarginComparison.hasCurData &&
                    monthlyGrossMarginComparison.hasPrevData && (
                      <span
                        className={`text-[10px] font-bold ${
                          monthlyGrossMarginComparison.weightedDeltaPoints >= 0
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        ({monthlyGrossMarginComparison.weightedDeltaPoints >= 0 ? '+' : ''}
                        {monthlyGrossMarginComparison.weightedDeltaPoints.toFixed(1)} pts)
                      </span>
                    )}
                </div>
                <div className="text-[10px] text-slate-500 font-mono tabular-nums truncate">
                  Laba {formatRupiah(monthlyGrossMarginComparison.curGrossProfit)} /{' '}
                  {formatRupiah(monthlyGrossMarginComparison.curTotalRevenue)}
                </div>
              </div>

              {/* Pricing Spread Diagnostics */}
              <div className="space-y-0.5 sm:border-l sm:border-slate-200/75 sm:pl-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Sebaran Margin Transaksi
                </div>
                <div className="text-sm md:text-base font-black font-mono tabular-nums text-slate-900">
                  {formatNumber(monthlyGrossMarginComparison.curHighMarginCount)}{' '}
                  <span className="text-[11px] font-sans font-semibold text-emerald-700">
                    ≥30%
                  </span>
                  <span className="text-slate-300 mx-1.5">/</span>
                  {formatNumber(monthlyGrossMarginComparison.curLowMarginCount)}{' '}
                  <span
                    className={`text-[11px] font-sans font-semibold ${
                      monthlyGrossMarginComparison.curLowMarginCount > 0
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    &lt;15%
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {monthlyGrossMarginComparison.curLowMarginCount > 0
                    ? 'Tinjau produk atau diskon bermargin tipis'
                    : 'Tidak ada transaksi margin tipis (<15%)'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom-Line Real-Time Summary Card: Laba Bersih (Laba Kotor FIFO - Biaya Operasional Cashflow) */}
        <AnimatedChartStage
          filterKey={`net-profit-${period}-${transactions.length}-${cashflows.length}`}
          accent={netProfitSummary.netProfit >= 0 ? 'emerald' : 'amber'}
          delayMs={70}
          className={`rounded-xl border transition-colors ${
            netProfitSummary.netProfit >= 0
              ? 'bg-gradient-to-r from-emerald-50/90 via-white to-teal-50/60 border-emerald-200'
              : 'bg-gradient-to-r from-rose-50/90 via-white to-amber-50/60 border-rose-200'
          }`}
        >
          <div className="p-3 md:p-3.5 grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">
            {/* Primary Net Profit Figure */}
            <div className="md:col-span-5 space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-slate-700">
                  <Wallet
                    className={`w-3.5 h-3.5 shrink-0 ${
                      netProfitSummary.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  />
                  <span>Laba Bersih ({periodLabel})</span>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${
                    netProfitSummary.netProfit >= 0
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : 'bg-rose-100 text-rose-800 border-rose-200'
                  }`}
                >
                  {netProfitSummary.netProfit >= 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  <span>
                    {netProfitSummary.netProfit >= 0 ? 'Surplus Bersih' : 'Defisit Bersih'}
                  </span>
                </span>
              </div>

              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span
                  className={`text-2xl md:text-[26px] font-black font-mono tabular-nums tracking-tight leading-none ${
                    netProfitSummary.netProfit >= 0 ? 'text-emerald-950' : 'text-rose-800'
                  }`}
                >
                  {formatRupiah(netProfitSummary.netProfit)}
                </span>

                <span
                  className={`text-xs font-mono font-bold tabular-nums ${
                    netProfitSummary.netMarginPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  Net Margin {netProfitSummary.netMarginPercent.toFixed(1)}%
                </span>

                {netProfitSummary.hasPrevBaseline && compareWithPrevious && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10.5px] font-mono font-bold tabular-nums ${
                      netProfitSummary.netProfitDeltaAmount >= 0
                        ? 'text-emerald-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {netProfitSummary.netProfitDeltaAmount >= 0 ? (
                      <ArrowUpRight className="w-3 h-3" />
                    ) : (
                      <ArrowDownRight className="w-3 h-3" />
                    )}
                    <span>
                      {netProfitSummary.netProfitGrowthPercent >= 0 ? '+' : ''}
                      {netProfitSummary.netProfitGrowthPercent.toFixed(1)}% vs periode lalu
                    </span>
                  </span>
                )}
              </div>

              <div className="text-[10.5px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                <span>Laba Kotor (FIFO) dikurangi biaya operasional cashflow</span>
                {isCategoryFiltered && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-700 font-semibold">
                      Basis keseluruhan toko (overhead toko)
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Hairline-Divided Breakdown Columns */}
            <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3 md:border-l md:border-slate-200/80 md:pl-4">
              {/* Gross Profit */}
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Laba Kotor (FIFO)
                </div>
                <div className="text-sm md:text-base font-black font-mono text-slate-900 tabular-nums">
                  {formatRupiah(netProfitSummary.periodGrossProfit)}
                </div>
                <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                  Margin {netProfitSummary.grossMarginPercent.toFixed(1)}% · Omzet{' '}
                  {formatRupiah(netProfitSummary.periodStoreRevenue)}
                </div>
              </div>

              {/* Operational Expenses from Cashflow */}
              <div className="space-y-0.5 sm:border-l sm:border-slate-200/75 sm:pl-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-rose-700 flex items-center gap-1">
                  <Receipt className="w-3 h-3 shrink-0" />
                  <span>Biaya Operasional</span>
                </div>
                <div className="text-sm md:text-base font-black font-mono text-rose-700 tabular-nums">
                  −{formatRupiah(netProfitSummary.periodExpenses)}
                </div>
                <div className="text-[10px] text-slate-500 truncate" title={netProfitSummary.topExpenseCategories.map((e) => `${e.name}: ${formatRupiah(e.amount)}`).join(' · ')}>
                  {netProfitSummary.periodExpenseCount > 0 ? (
                    <>
                      <span className="font-mono font-semibold text-slate-700">
                        {formatNumber(netProfitSummary.periodExpenseCount)}
                      </span>{' '}
                      catat ·{' '}
                      {netProfitSummary.topExpenseCategories[0]
                        ? netProfitSummary.topExpenseCategories[0].name
                        : `${netProfitSummary.expenseRatioToRevenue.toFixed(1)}% omzet`}
                    </>
                  ) : (
                    'Belum ada pengeluaran cashflow'
                  )}
                </div>
              </div>

              {/* Real-time Today & Month-to-Date Net Profit */}
              <div className="space-y-0.5 sm:border-l sm:border-slate-200/75 sm:pl-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-teal-700">
                  Real-Time Hari Ini &amp; Bln Ini
                </div>
                <div
                  className={`text-sm md:text-base font-black font-mono tabular-nums ${
                    netProfitSummary.todayNetProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'
                  }`}
                >
                  {formatRupiah(netProfitSummary.todayNetProfit)}
                  <span className="text-[10px] font-sans font-semibold text-slate-500 ml-1">
                    hari ini
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 font-mono tabular-nums truncate">
                  MTD:{' '}
                  <strong
                    className={
                      netProfitSummary.mtdNetProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }
                  >
                    {formatRupiah(netProfitSummary.mtdNetProfit)}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </AnimatedChartStage>

        {/* Kartu Ringkasan Proaktif: Proyeksi Kebutuhan Stok (Berdasarkan Rata-rata Penjualan 7 Hari Terakhir) */}
        <StockRunwayProjectionCard
          products={products}
          transactions={transactions}
          hiddenCategorySet={hiddenCategorySet}
          isCategoryFiltered={isCategoryFiltered}
          activeCategoryCount={activeCategoryCount}
          totalCategoriesCount={categoryList.length}
          specificSelectedCategoryName={specificSelectedCategoryName}
          onJumpToStockThreshold={() => {
            setDashboardTab('PERFORMANCE');
            window.setTimeout(() => {
              document
                .getElementById('stock-threshold-chart-section')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 60);
          }}
        />

        {/* Kartu Metrik Efisiensi Shift: Total Transaksi vs Karyawan Login (AttendanceRecord) di Jam Sibuk */}
        <ShiftEfficiencyCard
          transactions={transactions}
          attendances={attendances}
          productMap={productMap}
          hiddenCategorySet={hiddenCategorySet}
          currentStart={currentStart}
          currentEnd={currentEnd}
          periodLabel={periodLabel}
        />
      </div>

      {/* Top Sub-Navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl flex-wrap">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setDashboardTab('PERFORMANCE');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              dashboardTab === 'PERFORMANCE'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Performa Penjualan &amp; Kategori</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setDashboardTab('FIFO_BATCHES');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              dashboardTab === 'FIFO_BATCHES'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Visualisasi Batch Stok FIFO</span>
            {batchExpiryOverview.urgentCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-amber-500 text-white font-black animate-pulse">
                {batchExpiryOverview.urgentCount} Pantau
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-slate-200 text-slate-700 font-bold">
                {batchExpiryOverview.totalBatches}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setDashboardTab('BATCH_INTEGRITY');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              dashboardTab === 'BATCH_INTEGRITY'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Integritas Sisa Stok Batch</span>
            {batchIntegritySummary && batchIntegritySummary.discrepantProductsCount > 0 ? (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-rose-500 text-white font-black animate-pulse">
                {batchIntegritySummary.discrepantProductsCount} Selisih
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-emerald-100 text-emerald-700 font-bold">
                Klop
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setDashboardTab('FIFO_AUDIT');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              dashboardTab === 'FIFO_AUDIT'
                ? 'bg-teal-700 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Audit Laba Kotor (FIFO vs Tercatat)</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsIntegrityModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Buka Modal Verifikasi Integritas Sisa Stok Batch"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Modal Verifikasi Batch</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsAuditModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold border border-teal-200 transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            title="Buka Modal Audit Laba Kotor Transaksi FIFO"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
            <span>Modal Audit FIFO</span>
          </button>

          <div className="text-[11px] font-bold text-slate-500 px-2 items-center gap-1.5 hidden lg:flex">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Sistem FIFO Aktif</span>
          </div>
        </div>
      </div>

      {/* Real-Time Sales Target Progress Section (Harian, Mingguan, Bulanan) */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 shrink-0">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900">
                  Pemantauan Target Penjualan Real-Time
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                  Live Update
                </span>
                {isCategoryFiltered && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                    {specificSelectedCategoryName
                      ? `Kategori: ${specificSelectedCategoryName}`
                      : `Terfilter ${activeCategoryCount}/${categoryList.length} Kategori`}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                {isCategoryFiltered
                  ? 'Evaluasi omzet kategori terpilih terhadap target Harian, Mingguan, dan Bulanan yang dikonfigurasi.'
                  : 'Perbandingan omzet penjualan aktual terhadap target Harian, Mingguan, dan Bulanan toko.'}
              </p>
            </div>
          </div>

          {currentUserRole === 'ADMIN' && onOpenSettings && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onOpenSettings();
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 whitespace-nowrap shrink-0 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Atur Target di Pengaturan</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {[
            { key: 'daily', data: salesTargetProgress.daily, accentBg: 'bg-sky-50', accentBorder: 'border-sky-200', accentText: 'text-sky-700' },
            { key: 'weekly', data: salesTargetProgress.weekly, accentBg: 'bg-indigo-50', accentBorder: 'border-indigo-200', accentText: 'text-indigo-700' },
            { key: 'monthly', data: salesTargetProgress.monthly, accentBg: 'bg-emerald-50', accentBorder: 'border-emerald-200', accentText: 'text-emerald-700' },
          ].map(({ key, data }) => {
            const clampedPercent = Math.min(100, Math.max(0, data.percent));
            const isTargetMet = data.target > 0 && data.percent >= 100;
            const remaining = data.target - data.achieved;

            const barColorClass =
              isTargetMet
                ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                : data.percent >= 65
                ? 'bg-gradient-to-r from-sky-500 to-cyan-400'
                : data.percent >= 30
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400'
                : 'bg-gradient-to-r from-rose-500 to-orange-400';

            const badgeClass =
              isTargetMet
                ? 'bg-emerald-600 text-white'
                : data.percent >= 65
                ? 'bg-sky-100 text-sky-800 border border-sky-200'
                : data.percent >= 30
                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                : 'bg-rose-100 text-rose-800 border border-rose-200';

            return (
              <div
                key={key}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                  isTargetMet
                    ? 'bg-emerald-50/40 border-emerald-300 shadow-xs'
                    : 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">{data.label}</div>
                    <div className="text-[10.5px] text-slate-500 flex items-center gap-1 mt-0.5 flex-wrap">
                      <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                      <span>{data.subtitle}</span>
                    </div>
                    <div
                      className={`text-[10px] mt-0.5 truncate ${
                        data.isFallbackToStoreGoal
                          ? 'text-amber-700 font-semibold'
                          : 'text-slate-500 font-medium'
                      }`}
                      title={data.targetSourceLabel}
                    >
                      Acuan: {data.targetSourceLabel}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black font-mono shrink-0 tabular-nums ${badgeClass}`}>
                    {data.percent.toFixed(1)}%
                  </span>
                </div>

                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-base md:text-lg font-black font-mono text-slate-900 tabular-nums">
                      {formatRupiah(data.achieved)}
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-slate-500 tabular-nums">
                      / {formatRupiah(data.target)}
                    </span>
                  </div>

                  {/* Animated Progress Bar */}
                  <div className="w-full h-3 rounded-full bg-slate-200/90 overflow-hidden p-0.5">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColorClass}`}
                      style={{ width: `${clampedPercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/70">
                  <span className="text-slate-500 font-medium font-mono tabular-nums">
                    {formatNumber(data.txCount)} Transaksi
                  </span>
                  {data.target <= 0 ? (
                    <span className="font-semibold text-slate-400">Belum ada target</span>
                  ) : isTargetMet ? (
                    <span className="font-bold text-emerald-700 flex items-center gap-1 font-mono tabular-nums">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Surplus +{formatRupiah(Math.abs(remaining))}</span>
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-600 font-mono tabular-nums">
                      Kurang {formatRupiah(remaining)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Per-Category Target Evaluation (Harian, Mingguan, Bulanan) */}
      <CategorySalesTargetEvaluationPanel
        transactions={transactions}
        products={products}
        categories={categories}
        productMap={productMap}
        categorySalesGoals={categorySalesGoals}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
        onOpenSettings={onOpenSettings}
        currentUserRole={currentUserRole}
      />

      {/* Recharts Bar Chart: Tren Omzet Harian Minggu Ini vs Target Penjualan */}
      <ChartFullscreenShell
        isFullscreen={isWeeklyGoalFullscreen}
        onClose={() => setIsWeeklyGoalFullscreen(false)}
        title="Tren Omzet Harian Minggu Ini vs Target Penjualan"
      >
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 shrink-0" style={{ color: palette.primary }} />
                <span>Tren Omzet Harian Minggu Ini vs Target Penjualan</span>
              </h3>
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                {weekRangeLabel}
              </span>
              {isCategoryFiltered && (
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Terfilter: {activeCategoryCount}/{categoryList.length} Kategori
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Komparasi pendapatan aktual harian (Senin – Minggu) terhadap{' '}
              <span className="font-semibold text-slate-700">{weeklyTargetSourceLabel}</span> sebesar{' '}
              <span className="font-mono font-bold text-slate-700">{formatRupiah(safeGoalForChart)}</span>
              {isCategoryFiltered && ' (hanya kategori aktif terpilih)'}.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap text-[11px] font-semibold">
            <span className="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{daysMetTargetCount}/7 Hari Capai Target</span>
            </span>
            <div className="flex items-center gap-3 text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: palette.primary }} />
                <span>Omzet Aktual</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: palette.positive }} />
                <span>Capai Target</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded border border-slate-300 inline-block" style={{ backgroundColor: palette.grid }} />
                <span>Target Harian</span>
              </span>
            </div>
            <FullscreenToggleButton
              isFullscreen={isWeeklyGoalFullscreen}
              onToggle={() => setIsWeeklyGoalFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Interactive Category Toggle Filter Bar */}
        <CategoryTrendFilterBar
          categories={categoryFilterOptions}
          hiddenCategories={hiddenCategories}
          onToggleCategory={handleToggleCategoryFilter}
          onSelectAll={handleSelectAllCategories}
          onFocusTopPerformers={handleFocusTopCategories}
          onClearAll={handleClearAllCategories}
        />

        <AnimatedChartStage
          filterKey={`weekly-goal-${dailySalesGoal}-${safeGoalForChart}-${JSON.stringify(categorySalesGoals)}-${hiddenCategories.join(',')}-${transactions.length}`}
          accent="sky"
          delayMs={60}
          className={isWeeklyGoalFullscreen ? 'w-full h-[60vh] min-h-[380px]' : 'w-full h-72 md:h-80'}
        >
          {activeCategoryCount === 0 && categoryList.length > 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
              <EyeOff className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-600">
                Semua kategori sedang dinonaktifkan pada grafik tren penjualan
              </p>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  handleSelectAllCategories();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tampilkan Semua Kategori</span>
              </button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={currentWeekDailyTrend} margin={{ top: 18, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis
                dataKey="dayLabel"
                tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val) => {
                  if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                  if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                  return String(val);
                }}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={54}
              />
              <RechartsTooltip
                cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const item = payload[0]?.payload;
                  if (!item) return null;
                  const diff = item.actualRevenue - item.salesGoal;
                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[230px] space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                        <span className="font-bold text-slate-100">{item.fullDateLabel}</span>
                        {item.isToday && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                            Hari Ini
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Omzet Aktual:</span>
                          <span className="font-bold text-sky-400 tabular-nums">
                            {formatRupiah(item.actualRevenue)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Target Harian:</span>
                          <span className="font-semibold text-slate-300 tabular-nums">
                            {formatRupiah(item.salesGoal)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-slate-400">Selisih:</span>
                          <span
                            className={`font-bold tabular-nums ${
                              diff >= 0 ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {diff >= 0 ? `+${formatRupiah(diff)}` : formatRupiah(diff)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3 pt-1 border-t border-slate-800">
                          <span className="text-slate-400">Pencapaian / Trx:</span>
                          <span className="font-bold text-emerald-300">
                            {item.achievementPercent.toFixed(1)}% ({formatNumber(item.txCount)} trx)
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <ReferenceLine
                y={safeGoalForChart}
                stroke={palette.warning}
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `Target: ${formatRupiah(safeGoalForChart)}`,
                  position: 'insideTopRight',
                  fill: palette.warning,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
              <Bar
                dataKey="salesGoal"
                name="Target Penjualan Harian"
                fill={palette.grid}
                radius={[6, 6, 0, 0]}
                maxBarSize={26}
                isAnimationActive={true}
                animationDuration={550}
                animationEasing="ease-out"
              />
              <Bar
                dataKey="actualRevenue"
                name="Omzet Aktual Harian"
                radius={[6, 6, 0, 0]}
                maxBarSize={36}
                isAnimationActive={true}
                animationDuration={620}
                animationEasing="ease-out"
              >
                {currentWeekDailyTrend.map((entry, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={
                      entry.actualRevenue >= entry.salesGoal
                        ? palette.positive
                        : entry.isToday
                        ? palette.primary
                        : entry.actualRevenue > 0
                        ? palette.primaryLight
                        : palette.neutral
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          )}
        </AnimatedChartStage>
      </div>
      </ChartFullscreenShell>

      {/* Grafik Area: Perbandingan Tren Total Pendapatan Minggu Ini vs Minggu Lalu */}
      <WeeklyRevenueComparisonAreaChart
        transactions={transactions}
        productMap={productMap}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Grafik Area Recharts: Tren Penjualan Harian 30 Hari Terakhir */}
      <ThirtyDayRevenueTrendChart
        transactions={transactions}
        productMap={productMap}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Grafik Garis Recharts: Tren Profit Bersih Harian 30 Hari Terakhir */}
      <ThirtyDayNetProfitLineChart
        transactions={transactions}
        cashflows={cashflows}
        productMap={productMap}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Grafik Area: Tren Pertumbuhan Pelanggan Baru (30 Hari Terakhir) */}
      <NewCustomerGrowthAreaChart customers={customers} />

      {/* Visualisasi Sisa Stok per Batch (FIFO) & Monitoring Kedaluwarsa - Admin Dashboard Widget */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 md:p-5 rounded-2xl border border-indigo-900/50 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-500/20 border border-indigo-400/30 rounded-xl shrink-0">
              <Layers className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm md:text-base font-bold text-white">
                  Monitoring Sisa Stok per Batch (FIFO) &amp; Peringatan Kedaluwarsa
                </h3>
                <span className="text-[10px] font-mono bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                  FEFO / FIFO Active
                </span>
                {batchIntegritySummary && (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                    batchIntegritySummary.discrepantProductsCount > 0
                      ? 'bg-rose-500/20 text-rose-300 border-rose-400/30 animate-pulse'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                  }`}>
                    {batchIntegritySummary.discrepantProductsCount > 0
                      ? `⚠️ ${batchIntegritySummary.discrepantProductsCount} Produk Selisih Stok Batch`
                      : '✓ Integritas Batch 100% Klop'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Pantau sisa stok per batch fisik barang, verifikasi integritas batch vs stok dasar, dan antisipasi kedaluwarsa.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setDashboardTab('BATCH_INTEGRITY');
              }}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Verifikasi Integritas Batch</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setDashboardTab('FIFO_BATCHES');
              }}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer active:scale-95"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Visualisasi Penuh FIFO</span>
            </button>
          </div>
        </div>

        {/* 5 Mini Stat Pills (Termasuk Integritas Stok Batch) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 mt-3.5 pt-3.5 border-t border-indigo-900/60">
          <div
            onClick={() => {
              sound.playTap();
              setDashboardTab('FIFO_BATCHES');
            }}
            className="bg-white/5 hover:bg-white/10 p-2.5 rounded-xl border border-white/10 transition-colors cursor-pointer"
          >
            <div className="text-[10px] text-slate-400 font-bold uppercase">Total Batch Aktif</div>
            <div className="text-lg font-black font-mono text-white mt-0.5">
              {batchExpiryOverview.totalBatches} <span className="text-xs font-semibold text-slate-400">Batch</span>
            </div>
          </div>

          <div
            onClick={() => {
              sound.playTap();
              setDashboardTab('BATCH_INTEGRITY');
            }}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
              batchIntegritySummary && batchIntegritySummary.discrepantProductsCount > 0
                ? 'bg-rose-950/70 border-rose-500/60 hover:bg-rose-950/90'
                : 'bg-emerald-950/40 border-emerald-500/30 hover:bg-emerald-950/60'
            }`}
          >
            <div className={`text-[10px] font-bold uppercase flex items-center justify-between ${
              batchIntegritySummary && batchIntegritySummary.discrepantProductsCount > 0 ? 'text-rose-300' : 'text-emerald-300'
            }`}>
              <span>Integritas Batch</span>
              {batchIntegritySummary && batchIntegritySummary.discrepantProductsCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </div>
            <div className={`text-lg font-black font-mono mt-0.5 ${
              batchIntegritySummary && batchIntegritySummary.discrepantProductsCount > 0
                ? 'text-rose-300'
                : 'text-emerald-300'
            }`}>
              {batchIntegritySummary ? `${batchIntegritySummary.matchingProductsCount}/${batchIntegritySummary.totalProductsChecked}` : '0/0'}
              <span className="text-[10px] font-semibold ml-1 text-slate-300">
                {batchIntegritySummary && batchIntegritySummary.discrepantProductsCount > 0 ? 'Selisih' : 'Klop'}
              </span>
            </div>
          </div>

          <div
            onClick={() => {
              sound.playTap();
              setDashboardTab('FIFO_BATCHES');
            }}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
              batchExpiryOverview.expiredBatches > 0
                ? 'bg-rose-950/60 border-rose-500/50 hover:bg-rose-950/80'
                : 'bg-white/5 hover:bg-white/10 border-white/10'
            }`}
          >
            <div className="text-[10px] text-rose-300 font-bold uppercase flex items-center justify-between">
              <span>Kadaluwarsa</span>
              {batchExpiryOverview.expiredBatches > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
            </div>
            <div className="text-lg font-black font-mono text-rose-300 mt-0.5">
              {batchExpiryOverview.expiredBatches} <span className="text-xs font-semibold">Batch</span>
            </div>
          </div>

          <div
            onClick={() => {
              sound.playTap();
              setDashboardTab('FIFO_BATCHES');
            }}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
              batchExpiryOverview.criticalBatches > 0
                ? 'bg-amber-950/60 border-amber-500/50 hover:bg-amber-950/80'
                : 'bg-white/5 hover:bg-white/10 border-white/10'
            }`}
          >
            <div className="text-[10px] text-amber-300 font-bold uppercase">Kritis (≤ 7 Hari)</div>
            <div className="text-lg font-black font-mono text-amber-300 mt-0.5">
              {batchExpiryOverview.criticalBatches} <span className="text-xs font-semibold">Batch</span>
            </div>
          </div>

          <div
            onClick={() => {
              sound.playTap();
              setDashboardTab('FIFO_BATCHES');
            }}
            className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
              batchExpiryOverview.warningBatches > 0
                ? 'bg-yellow-950/60 border-yellow-500/50 hover:bg-yellow-950/80'
                : 'bg-white/5 hover:bg-white/10 border-white/10'
            }`}
          >
            <div className="text-[10px] text-yellow-300 font-bold uppercase">Mendekati (≤ 30 Hr)</div>
            <div className="text-lg font-black font-mono text-yellow-300 mt-0.5">
              {batchExpiryOverview.warningBatches} <span className="text-xs font-semibold">Batch</span>
            </div>
          </div>
        </div>

        {/* Urgent Expiring Batches Preview Banner */}
        {batchExpiryOverview.urgentItems.length > 0 && (
          <div className="mt-3 p-2.5 bg-amber-500/10 border border-amber-400/20 rounded-xl">
            <div className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Perhatian Staf: Batch Produk Mendekati Kedaluwarsa Terdekat:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {batchExpiryOverview.urgentItems.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    sound.playTap();
                    setDashboardTab('FIFO_BATCHES');
                  }}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border flex items-center gap-2 cursor-pointer transition-colors ${
                    item.status === 'EXPIRED'
                      ? 'bg-rose-900/60 text-rose-200 border-rose-500/40 hover:bg-rose-900/80'
                      : item.status === 'CRITICAL'
                      ? 'bg-amber-900/60 text-amber-200 border-amber-500/40 hover:bg-amber-900/80'
                      : 'bg-yellow-900/60 text-yellow-200 border-yellow-500/40 hover:bg-yellow-900/80'
                  }`}
                >
                  <span className="font-bold">{item.productName}</span>
                  <span className="font-mono text-[10px] opacity-80">(Batch #{item.batchNumber})</span>
                  <span className="font-black">
                    {item.daysUntilExpiry < 0
                      ? `Expired ${Math.abs(item.daysUntilExpiry)} hr lalu`
                      : `Sisa ${item.daysUntilExpiry} hari`}
                  </span>
                  <span className="font-mono text-[10px] bg-black/20 px-1 py-0.2 rounded">
                    Sisa: {item.remainingQuantity} {item.baseUnit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {dashboardTab === 'FIFO_BATCHES' ? (
        <FifoBatchVisualizer products={products} />
      ) : dashboardTab === 'BATCH_INTEGRITY' ? (
        <BatchStockIntegrityPanel
          products={products}
          onSaveProducts={onSaveProducts || (() => {})}
        />
      ) : dashboardTab === 'FIFO_AUDIT' ? (
        <FifoGrossProfitAuditPanel
          transactions={transactions}
          products={products}
          storeName={storeName}
        />
      ) : (
        <>
          {/* Product Expiry Alert Widget (Next 30 Days + WhatsApp Supplier Notification) */}
          <div className={`rounded-2xl border shadow-2xs overflow-hidden ${
            batchExpiryOverview.urgentCount > 0
              ? 'bg-white border-amber-300'
              : 'bg-white border-emerald-200'
          }`}>
            <div className={`p-4 md:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b ${
              batchExpiryOverview.urgentCount > 0
                ? 'bg-gradient-to-r from-amber-50 via-orange-50/70 to-rose-50/50 border-amber-200'
                : 'bg-emerald-50/50 border-emerald-100'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl border shrink-0 ${
                  batchExpiryOverview.urgentCount > 0
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}>
                  {batchExpiryOverview.urgentCount > 0 ? (
                    <ShieldAlert className="w-5 h-5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm md:text-base font-bold text-slate-900">
                      Product Expiry Alert (≤ 30 Hari) &amp; Notifikasi Supplier
                    </h3>
                    {batchExpiryOverview.urgentCount > 0 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-black bg-rose-600 text-white">
                        {batchExpiryOverview.urgentCount} Batch Perlu Tindakan
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-600 text-white">
                        Semua Produk Aman
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {batchExpiryOverview.urgentCount > 0 ? (
                      <>
                        Ditemukan <strong className="text-slate-900">{formatNumber(batchExpiryOverview.totalUnitsAtRisk)} unit</strong> pada{' '}
                        <strong className="text-slate-900">{batchExpiryOverview.urgentCount} batch</strong> yang kedaluwarsa dalam 30 hari ke depan (nilai HPP risiko:{' '}
                        <strong className="font-mono text-rose-700">{formatRupiah(batchExpiryOverview.totalValueAtRisk)}</strong>). Kirim notifikasi WhatsApp langsung ke supplier untuk retur/tukar stok.
                      </>
                    ) : (
                      'Tidak ada produk fisik atau batch stok yang akan kedaluwarsa dalam 30 hari ke depan.'
                    )}
                  </p>
                </div>
              </div>

              {batchExpiryOverview.urgentCount > 0 && (
                <div className="flex items-center gap-2 flex-wrap self-start xl:self-auto shrink-0">
                  {(() => {
                    const selectedSupplierObj =
                      selectedExpirySupplierId !== 'AUTO'
                        ? suppliers.find((s) => s.id === selectedExpirySupplierId) || null
                        : null;
                    const itemsForBulkWa =
                      filteredExpiringItems.length > 0
                        ? filteredExpiringItems
                        : batchExpiryOverview.allUrgentItems;
                    const bulkWaUrl = buildSupplierExpiryWhatsAppUrl(
                      itemsForBulkWa,
                      selectedSupplierObj
                    );

                    return (
                      <>
                        {suppliers.length > 0 && (
                          <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded-xl px-2.5 py-1.5 text-xs">
                            <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <select
                              value={selectedExpirySupplierId}
                              onChange={(e) => {
                                sound.playTap();
                                setSelectedExpirySupplierId(e.target.value);
                              }}
                              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[170px]"
                              title="Pilih supplier tujuan notifikasi WhatsApp"
                            >
                              <option value="AUTO">Supplier Otomatis / Pilih di WA</option>
                              {suppliers.map((sup) => (
                                <option key={sup.id} value={sup.id}>
                                  {sup.name} ({sup.whatsapp || sup.phone})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <a
                          href={bulkWaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => sound.playSuccessChime()}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
                          title="Kirim daftar produk mendekati kedaluwarsa ke WhatsApp Supplier"
                        >
                          <MessageCircle className="w-4 h-4 shrink-0" />
                          <span>Kirim WA ke Supplier ({itemsForBulkWa.length})</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      </>
                    );
                  })()}

                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setDashboardTab('FIFO_BATCHES');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-amber-400" />
                    <span>Kelola Batch</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {batchExpiryOverview.urgentCount > 0 && (
              <div className="p-4 space-y-3">
                {/* Filter Chips & Quick Search */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    {[
                      { id: 'ALL', label: `Semua (${batchExpiryOverview.allUrgentItems.length})`, activeClass: 'bg-slate-900 text-white border-slate-900' },
                      { id: 'EXPIRED', label: `Expired (${batchExpiryOverview.expiredBatches})`, activeClass: 'bg-rose-600 text-white border-rose-600' },
                      { id: 'CRITICAL', label: `Kritis ≤ 7 Hr (${batchExpiryOverview.criticalBatches})`, activeClass: 'bg-amber-600 text-white border-amber-600' },
                      { id: 'WARNING', label: `Segera 8-30 Hr (${batchExpiryOverview.warningBatches})`, activeClass: 'bg-yellow-500 text-slate-950 border-yellow-500' },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setExpiryAlertFilter(f.id as 'ALL' | 'EXPIRED' | 'CRITICAL' | 'WARNING');
                        }}
                        className={`px-3 py-1.5 rounded-xl font-bold border transition-all cursor-pointer ${
                          expiryAlertFilter === f.id
                            ? f.activeClass
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    value={expiryAlertSearch}
                    onChange={(e) => setExpiryAlertSearch(e.target.value)}
                    placeholder="Cari nama produk / batch / supplier..."
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 focus:outline-none text-xs w-full sm:w-64"
                  />
                </div>

                {/* Detailed List Table of Expiring Items */}
                <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 text-slate-600 font-bold z-10">
                      <tr>
                        <th className="py-2.5 px-3">Produk &amp; Kategori</th>
                        <th className="py-2.5 px-3">Supplier</th>
                        <th className="py-2.5 px-3">No. Batch</th>
                        <th className="py-2.5 px-3 text-right">Sisa Batch</th>
                        <th className="py-2.5 px-3 text-right">Nilai HPP Risiko</th>
                        <th className="py-2.5 px-3 text-center">Tgl Kedaluwarsa</th>
                        <th className="py-2.5 px-3 text-center">Sisa Hari</th>
                        <th className="py-2.5 px-3 text-right">Notifikasi Supplier &amp; Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredExpiringItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-slate-400">
                            Tidak ada batch kedaluwarsa yang cocok dengan filter.
                          </td>
                        </tr>
                      ) : (
                        filteredExpiringItems.map((item) => {
                          const isExpired = item.status === 'EXPIRED';
                          const isCritical = item.status === 'CRITICAL';
                          const overrideSupplier =
                            selectedExpirySupplierId !== 'AUTO'
                              ? suppliers.find((s) => s.id === selectedExpirySupplierId) || null
                              : null;
                          const itemWaUrl = buildSupplierExpiryWhatsAppUrl(
                            [item],
                            overrideSupplier
                          );

                          return (
                            <tr
                              key={`${item.productId}-${item.batchId}`}
                              className={`transition-colors ${
                                isExpired
                                  ? 'bg-rose-50/40 hover:bg-rose-50'
                                  : isCritical
                                  ? 'bg-amber-50/40 hover:bg-amber-50'
                                  : 'hover:bg-yellow-50/40'
                              }`}
                            >
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{item.productName}</div>
                                <div className="text-[10px] text-slate-500">{item.category}</div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-800">{item.supplierName}</div>
                                {item.supplierWhatsapp && (
                                  <div className="text-[10px] font-mono text-emerald-700">
                                    WA: {item.supplierWhatsapp}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono font-semibold text-slate-700">
                                #{item.batchNumber}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                                {formatNumber(item.remainingQuantity)} {item.baseUnit}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-700 tabular-nums">
                                {formatRupiah(item.stockValueAtRisk)}
                              </td>
                              <td className="py-2.5 px-3 text-center font-mono text-slate-700">
                                {item.expiryDate}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-block px-2 py-0.5 rounded-lg text-[10px] font-black font-mono ${
                                  isExpired
                                    ? 'bg-rose-600 text-white'
                                    : isCritical
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-yellow-200 text-yellow-950'
                                }`}>
                                  {item.daysUntilExpiry < 0
                                    ? `Lewat ${Math.abs(item.daysUntilExpiry)} hr`
                                    : item.daysUntilExpiry === 0
                                    ? 'HARI INI'
                                    : `${item.daysUntilExpiry} hari`}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                                  <a
                                    href={itemWaUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => sound.playSuccessChime()}
                                    title={
                                      item.supplierWhatsapp || overrideSupplier
                                        ? `Kirim alert kedaluwarsa via WhatsApp ke ${overrideSupplier?.name || item.supplierName}`
                                        : 'Buka WhatsApp untuk kirim peringatan ke supplier'
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10.5px] font-bold inline-flex items-center gap-1 transition-colors shadow-2xs"
                                  >
                                    <MessageCircle className="w-3 h-3 shrink-0" />
                                    <span>WA Supplier</span>
                                  </a>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      sound.playTap();
                                      setDashboardTab('FIFO_BATCHES');
                                    }}
                                    className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border inline-flex items-center gap-1 transition-colors cursor-pointer ${
                                      isExpired
                                        ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-300'
                                        : isCritical
                                        ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300'
                                        : 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-200'
                                    }`}
                                  >
                                    <span>{item.recommendedAction}</span>
                                    <ArrowUpRight className="w-3 h-3 shrink-0" />
                                  </button>
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
            )}
          </div>

          {/* Control Bar: Period, Metric, Sort & Comparison Toggle */}
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        
        {/* Left: Period Buttons */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Periode Analisis:</span>
            <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'THIS_WEEK', label: 'Minggu Ini' },
                { id: 'LAST_WEEK', label: 'Minggu Lalu' },
                { id: 'LAST_14_DAYS', label: '14 Hari' },
                { id: 'LAST_30_DAYS', label: '30 Hari' },
              ].map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    sound.playTap();
                    setPeriod(p.id as PeriodType);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    period === p.id
                      ? 'bg-sky-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-sky-900 font-semibold flex items-center gap-1.5 flex-wrap">
            <Calendar className="w-3.5 h-3.5 text-sky-600" />
            <span>{periodLabel}</span>
            {compareWithPrevious && (
              <span className="text-slate-500 font-normal">
                vs {previousLabel}
              </span>
            )}
            {specificSelectedCategoryName && (
              <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200 text-[10.5px] font-bold">
                Kategori: {specificSelectedCategoryName}
              </span>
            )}
          </div>
        </div>

        {/* Right: Category Filter Dropdown, Metric Selector, Sort, and Comparison Switch */}
        <div className="flex items-center gap-2.5 flex-wrap">
          
          {/* Category Filter Dropdown */}
          <div
            className={`flex items-center gap-1.5 border px-3 py-1.5 rounded-xl text-xs transition-colors ${
              selectedCategoryDropdownValue !== 'ALL'
                ? 'bg-sky-50 border-sky-300 text-sky-900'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <Filter
              className={`w-3.5 h-3.5 shrink-0 ${
                selectedCategoryDropdownValue !== 'ALL' ? 'text-sky-600' : 'text-slate-400'
              }`}
            />
            <span className="text-slate-400 font-bold">Kategori:</span>
            <select
              aria-label="Filter Kategori Produk"
              value={selectedCategoryDropdownValue}
              onChange={(e) => {
                sound.playTap();
                handleSelectCategoryFromDropdown(e.target.value);
              }}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[180px]"
            >
              <option value="ALL">Semua Kategori ({categoryFilterOptions.length})</option>
              {selectedCategoryDropdownValue === 'CUSTOM' && (
                <option value="CUSTOM" disabled>
                  {activeCategoryCount} Kategori Dipilih
                </option>
              )}
              {selectedCategoryDropdownValue === 'NONE' && (
                <option value="NONE" disabled>
                  Tidak Ada Kategori Aktif
                </option>
              )}
              {categoryFilterOptions.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </select>
            {selectedCategoryDropdownValue !== 'ALL' && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  handleSelectCategoryFromDropdown('ALL');
                }}
                title="Tampilkan Semua Kategori"
                className="ml-0.5 text-[10px] font-bold text-sky-700 hover:text-sky-900 underline cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* Metric Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => {
                sound.playTap();
                setMetric('REVENUE');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                metric === 'REVENUE' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pendapatan (Rp)
            </button>
            <button
              onClick={() => {
                sound.playTap();
                setMetric('UNITS');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                metric === 'UNITS' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Volume Unit
            </button>
            <button
              onClick={() => {
                sound.playTap();
                setMetric('PROFIT');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                metric === 'PROFIT' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Laba Kotor (Rp)
            </button>
          </div>

          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
            <span className="text-slate-400 font-bold">Urutkan:</span>
            <select
              value={sortBy}
              onChange={(e) => {
                sound.playTap();
                setSortBy(e.target.value as SortType);
              }}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="REVENUE_DESC">Omzet Tertinggi</option>
              <option value="UNITS_DESC">Unit Terbanyak</option>
              <option value="PROFIT_DESC">Laba Terbanyak</option>
              <option value="GROWTH_DESC">Pertumbuhan Tercepat</option>
            </select>
          </div>

          {/* Compare Toggle */}
          <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={compareWithPrevious}
              onChange={(e) => {
                sound.playTap();
                setCompareWithPrevious(e.target.checked);
              }}
              className="rounded text-sky-600 focus:ring-sky-500"
            />
            <span>Bandingkan Periode Lalu</span>
          </label>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        
        {/* KPI 1: Total Revenue */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between gap-1">
            <span className="truncate">
              {specificSelectedCategoryName
                ? `Omzet • ${specificSelectedCategoryName}`
                : isCategoryFiltered
                ? `Omzet (${activeCategoryCount} Kategori)`
                : 'Total Omzet Periode Ini'}
            </span>
            <DollarSign className="w-4 h-4 text-sky-600 shrink-0" />
          </div>
          <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1">
            {formatRupiah(filteredCurrentRevenue)}
          </div>
          <div className="text-[10px] mt-1 flex items-center gap-1">
            <span className={`font-bold flex items-center ${filteredOverallGrowthPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {filteredOverallGrowthPercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {Math.abs(filteredOverallGrowthPercent).toFixed(1)}%
            </span>
            <span className="text-slate-400">dibanding periode lalu</span>
          </div>
        </div>

        {/* KPI 2: Top Selling Category */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider flex items-center justify-between">
            <span>{specificSelectedCategoryName ? 'Kategori Terpilih' : 'Kategori Terlaris (Top Driver)'}</span>
            <Flame className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-lg md:text-xl font-black text-indigo-950 truncate mt-1 flex items-center gap-2">
            {topCategory ? (
              <>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: topCategory.color }} />
                <span className="truncate">{topCategory.name}</span>
              </>
            ) : (
              '-'
            )}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            {topCategory && totalCurrentRevenue > 0
              ? `${formatRupiah(topCategory.currentRevenue)} (${((topCategory.currentRevenue / totalCurrentRevenue) * 100).toFixed(1)}% total)`
              : 'Belum ada data'}
          </div>
        </div>

        {/* KPI 3: Highest Growth Segment */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider flex items-center justify-between">
            <span>Pertumbuhan Tertinggi</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg md:text-xl font-black text-emerald-950 truncate mt-1 flex items-center gap-2">
            {fastestGrowingCategory ? (
              <>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: fastestGrowingCategory.color }} />
                <span className="truncate">{fastestGrowingCategory.name}</span>
              </>
            ) : (
              '-'
            )}
          </div>
          <div className="text-[10px] text-emerald-700 font-bold mt-1 flex items-center gap-1">
            {fastestGrowingCategory ? (
              <span>+{fastestGrowingCategory.growthPercent.toFixed(1)}% lonjakan permintaan</span>
            ) : (
              'Belum ada data'
            )}
          </div>
        </div>

        {/* KPI 4: Highest Margin Segment */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center justify-between">
            <span>Margin Laba Tertinggi</span>
            <Percent className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg md:text-xl font-black text-amber-950 truncate mt-1 flex items-center gap-2">
            {highestMarginCategory ? (
              <>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: highestMarginCategory.color }} />
                <span className="truncate">{highestMarginCategory.name}</span>
              </>
            ) : (
              '-'
            )}
          </div>
          <div className="text-[10px] text-amber-700 font-bold mt-1">
            {highestMarginCategory ? `${highestMarginCategory.marginPercent.toFixed(1)}% margin keuntungan` : 'Belum ada data'}
          </div>
        </div>
      </div>

      {/* Recharts Bar Chart: Tren Laba Kotor Harian (7 Hari Terakhir) */}
      <ChartFullscreenShell
        isFullscreen={isGrossProfit7dFullscreen}
        onClose={() => setIsGrossProfit7dFullscreen(false)}
        title="Tren Laba Kotor Harian (7 Hari Terakhir)"
      >
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 shrink-0" style={{ color: palette.positive }} />
                <span>Tren Laba Kotor Harian (7 Hari Terakhir)</span>
              </h3>
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {last7DaysGrossProfitSummary.rangeLabel}
              </span>
              {last7DaysGrossProfitSummary.hasAnyData && (
                <span
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 border ${
                    last7DaysGrossProfitSummary.profitGrowthPercent >= 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {last7DaysGrossProfitSummary.profitGrowthPercent >= 0 ? (
                    <ArrowUpRight className="w-3 h-3" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3" />
                  )}
                  <span>
                    {last7DaysGrossProfitSummary.profitGrowthPercent >= 0 ? '+' : ''}
                    {last7DaysGrossProfitSummary.profitGrowthPercent.toFixed(1)}% vs 7 hr lalu
                  </span>
                </span>
              )}
              {isCategoryFiltered && (
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  Terfilter: {activeCategoryCount}/{categoryList.length} Kategori
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Visualisasi laba kotor per hari (Omzet Penjualan dikurangi HPP FIFO) selama 7 hari terakhir untuk memantau kesehatan profitabilitas harian toko.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-[10px] font-bold uppercase text-emerald-700">Total Laba 7 Hari</div>
              <div className="font-mono font-black text-emerald-900 tabular-nums">
                {formatRupiah(last7DaysGrossProfitSummary.totalGrossProfit)}
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[10px] font-bold uppercase text-slate-500">Rata-rata / Hari</div>
              <div className="font-mono font-black text-slate-800 tabular-nums">
                {formatRupiah(last7DaysGrossProfitSummary.avgDailyGrossProfit)}
              </div>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-[10px] font-bold uppercase text-amber-700">Margin 7 Hari</div>
              <div className="font-mono font-black text-amber-900 tabular-nums">
                {last7DaysGrossProfitSummary.avgMarginPercent.toFixed(1)}%
              </div>
            </div>
            <FullscreenToggleButton
              isFullscreen={isGrossProfit7dFullscreen}
              onToggle={() => setIsGrossProfit7dFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        <AnimatedChartStage
          filterKey={`gp-7d-${hiddenCategories.join(',')}-${transactions.length}`}
          accent="emerald"
          delayMs={80}
          className={isGrossProfit7dFullscreen ? 'w-full h-[60vh] min-h-[380px]' : 'w-full h-72 md:h-80'}
        >
          {activeCategoryCount === 0 && categoryList.length > 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
              <EyeOff className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-600">
                Semua kategori sedang dinonaktifkan pada filter grafik
              </p>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  handleSelectAllCategories();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tampilkan Semua Kategori</span>
              </button>
            </div>
          ) : !last7DaysGrossProfitSummary.hasAnyData ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
              <DollarSign className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-600">
                Belum ada transaksi penjualan dalam 7 hari terakhir untuk menampilkan tren laba kotor harian
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={last7DaysGrossProfitSummary.dailyData}
                margin={{ top: 20, right: 16, left: 10, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="dayLabel"
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(val) => {
                    const abs = Math.abs(val);
                    const sign = val < 0 ? '-' : '';
                    if (abs >= 1000000) return `${sign}${(abs / 1000000).toFixed(1)}M`;
                    if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(0)}k`;
                    return String(val);
                  }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <ReferenceLine y={0} stroke={palette.neutral} strokeWidth={1} />
                {last7DaysGrossProfitSummary.avgDailyGrossProfit > 0 && (
                  <ReferenceLine
                    y={last7DaysGrossProfitSummary.avgDailyGrossProfit}
                    stroke={palette.warning}
                    strokeDasharray="5 5"
                    strokeWidth={2}
                    label={{
                      value: `Rata-rata: ${formatRupiah(last7DaysGrossProfitSummary.avgDailyGrossProfit)}`,
                      position: 'insideTopRight',
                      fill: palette.warning,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                )}
                <RechartsTooltip
                  cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0]?.payload;
                    if (!item) return null;

                    return (
                      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[240px] space-y-2">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                          <span className="font-bold text-slate-100">{item.fullDateLabel}</span>
                          {item.isToday ? (
                            <span className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                              Hari Ini
                            </span>
                          ) : item.isBestDay ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                              Puncak 7H
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Laba Kotor (FIFO):</span>
                            <span
                              className={`font-black tabular-nums ${
                                item.grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {formatRupiah(item.grossProfit)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Omzet Penjualan:</span>
                            <span className="font-bold text-sky-300 tabular-nums">
                              {formatRupiah(item.revenue)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Total HPP (Modal):</span>
                            <span className="font-medium text-slate-300 tabular-nums">
                              {formatRupiah(item.cogs)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Margin Kotor:</span>
                            <span className="font-bold text-amber-300 tabular-nums">
                              {item.marginPercent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between gap-3 pt-1 border-t border-slate-800 text-[10px] font-sans">
                            <span className="text-slate-400">Volume / Transaksi:</span>
                            <span className="font-semibold text-slate-200">
                              {formatNumber(item.txCount)} trx • {formatNumber(item.unitsSold)} unit
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="grossProfit"
                  name="Laba Kotor Harian"
                  radius={[8, 8, 0, 0]}
                  maxBarSize={48}
                  isAnimationActive={true}
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {last7DaysGrossProfitSummary.dailyData.map((entry, idx) => (
                    <Cell
                      key={`gp-cell-${idx}`}
                      fill={
                        entry.grossProfit < 0
                          ? palette.danger
                          : entry.isToday
                          ? palette.primary
                          : entry.isBestDay
                          ? palette.positiveDark
                          : entry.grossProfit > 0
                          ? palette.positive
                          : palette.neutral
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </AnimatedChartStage>

        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.positiveDark }} />
              <span>Laba Tertinggi</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.positive }} />
              <span>Laba Positif</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.primary }} />
              <span>Hari Ini</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded inline-block" style={{ backgroundColor: palette.danger }} />
              <span>Rugi</span>
            </span>
          </div>

          {last7DaysGrossProfitSummary.bestDay && (
            <span>
              Performa Terbaik:{' '}
              <strong className="text-slate-800">{last7DaysGrossProfitSummary.bestDay.dayLabel}</strong>{' '}
              (<strong className="font-mono text-emerald-700">{formatRupiah(last7DaysGrossProfitSummary.bestDay.grossProfit)}</strong>) •{' '}
              <span className="font-mono">{formatNumber(last7DaysGrossProfitSummary.totalTxCount)} trx</span>
            </span>
          )}
        </div>
      </div>
      </ChartFullscreenShell>

      {/* Dedicated Category Profit Margin % & Profitability Visualization */}
      <CategoryProfitMarginChart
        transactions={transactions}
        products={products}
        categories={categories}
        productMap={productMap}
        currentStart={currentStart}
        currentEnd={currentEnd}
        previousStart={previousStart}
        previousEnd={previousEnd}
        periodLabel={periodLabel}
        previousLabel={previousLabel}
        compareWithPrevious={compareWithPrevious}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Gross Profit Margin % Component */}
      <GrossProfitMarginChart
        transactions={transactions}
        products={products}
        categories={categories}
        productMap={productMap}
        currentStart={currentStart}
        currentEnd={currentEnd}
        previousStart={previousStart}
        previousEnd={previousEnd}
        periodLabel={periodLabel}
        previousLabel={previousLabel}
        compareWithPrevious={compareWithPrevious}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Filter & Rincian Mendetail Gross Profit per Kategori */}
      <GrossProfitByCategoryPanel
        transactions={transactions}
        products={products}
        categories={categories}
        productMap={productMap}
        currentStart={currentStart}
        currentEnd={currentEnd}
        previousStart={previousStart}
        previousEnd={previousEnd}
        periodLabel={periodLabel}
        previousLabel={previousLabel}
        compareWithPrevious={compareWithPrevious}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Grafik Garis: Volume Transaksi per Jam (Analisis Jam Sibuk & Kebutuhan Kasir) */}
      <HourlyTransactionChart
        transactions={transactions}
        productMap={productMap}
        currentStart={currentStart}
        currentEnd={currentEnd}
        previousStart={previousStart}
        previousEnd={previousEnd}
        periodLabel={periodLabel}
        previousLabel={previousLabel}
        compareWithPrevious={compareWithPrevious}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Main Interactive Bar Chart Card */}
      <ChartFullscreenShell
        isFullscreen={isCategoryCompFullscreen}
        onClose={() => setIsCategoryCompFullscreen(false)}
        title="Komparasi Pendapatan & Permintaan per Kategori Produk"
      >
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 shrink-0" style={{ color: palette.primary }} />
                <span>Komparasi Pendapatan &amp; Permintaan per Kategori Produk</span>
              </h3>
              {isCategoryFiltered && (
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {activeCategoryCount}/{categoryList.length} Kategori Ditampilkan
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Grafik batang interaktif membandingkan {metric === 'REVENUE' ? 'omzet pendapatan' : metric === 'UNITS' ? 'jumlah unit terjual' : 'laba kotor'} antar kategori pada {periodLabel}.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: palette.primary }} />
              <span>Periode Ini</span>
            </span>
            {compareWithPrevious && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded inline-block" style={{ backgroundColor: palette.neutral }} />
                <span>Periode Sebelumnya</span>
              </span>
            )}
            <FullscreenToggleButton
              isFullscreen={isCategoryCompFullscreen}
              onToggle={() => setIsCategoryCompFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Synchronized Interactive Category Filter Controls */}
        <CategoryTrendFilterBar
          categories={categoryFilterOptions}
          hiddenCategories={hiddenCategories}
          onToggleCategory={handleToggleCategoryFilter}
          onSelectAll={handleSelectAllCategories}
          onFocusTopPerformers={handleFocusTopCategories}
          onClearAll={handleClearAllCategories}
        />

        {/* The Recharts Bar Chart */}
        <AnimatedChartStage
          filterKey={`cat-comp-${period}-${metric}-${sortBy}-${compareWithPrevious}-${hiddenCategories.join(',')}`}
          accent="sky"
          delayMs={100}
          className={isCategoryCompFullscreen ? 'w-full h-[60vh] min-h-[380px]' : 'w-full h-80 md:h-96'}
        >
          {chartData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
              {isCategoryFiltered && categoryList.length > 0 ? (
                <>
                  <EyeOff className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">
                    Tidak ada kategori yang diaktifkan pada grafik saat ini
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      handleSelectAllCategories();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tampilkan Semua Kategori</span>
                  </button>
                </>
              ) : (
                <>
                  <Package className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-bold">Belum ada transaksi kategori pada periode terpilih</p>
                </>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 10, left: 10, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis 
                  dataKey="categoryName" 
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} 
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={45}
                />
                <YAxis 
                  tickFormatter={(val) => {
                    if (metric === 'UNITS') return `${val} unit`;
                    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                    if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                    return String(val);
                  }}
                  tick={{ fontSize: 11, fill: '#64748b' }} 
                  axisLine={false}
                  tickLine={false}
                  width={65}
                />
                <RechartsTooltip content={<CustomBarTooltip />} />
                
                {compareWithPrevious ? (
                  <>
                    <Bar 
                      dataKey="currentValue" 
                      name="Periode Ini" 
                      fill={palette.primary} 
                      radius={[6, 6, 0, 0]} 
                      maxBarSize={48}
                      isAnimationActive={true}
                      animationDuration={550}
                      animationEasing="ease-out"
                    >
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-cur-${index}`} 
                          fill={entry.color || palette.primary} 
                          opacity={selectedCategoryHighlight && selectedCategoryHighlight !== entry.categoryName ? 0.35 : 1}
                        />
                      ))}
                    </Bar>
                    <Bar 
                      dataKey="previousValue" 
                      name="Periode Sebelumnya" 
                      fill={palette.neutral} 
                      radius={[6, 6, 0, 0]} 
                      maxBarSize={48}
                      opacity={0.65}
                      isAnimationActive={true}
                      animationDuration={550}
                      animationEasing="ease-out"
                    />
                  </>
                ) : (
                  <Bar 
                    dataKey="currentValue" 
                    name={metric === 'REVENUE' ? 'Pendapatan' : metric === 'UNITS' ? 'Unit Terjual' : 'Laba Kotor'} 
                    radius={[6, 6, 0, 0]} 
                    maxBarSize={56}
                    isAnimationActive={true}
                    animationDuration={550}
                    animationEasing="ease-out"
                  >
                    {chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color || palette.primary}
                        opacity={selectedCategoryHighlight && selectedCategoryHighlight !== entry.categoryName ? 0.35 : 1}
                      />
                    ))}
                  </Bar>
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </AnimatedChartStage>
      </div>
      </ChartFullscreenShell>

      {/* Distribusi Total Penjualan per Kategori Produk (Interactive Recharts Pie Chart) */}
      <CategorySalesPieChart
        transactions={transactions}
        products={products}
        categories={categories}
        productMap={productMap}
        currentStart={currentStart}
        currentEnd={currentEnd}
        periodLabel={periodLabel}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* 30-Day Gross Profit Margin Trend Line Chart per Category */}
      <ChartFullscreenShell
        isFullscreen={isMargin30dFullscreen}
        onClose={() => setIsMargin30dFullscreen(false)}
        title="Tren Margin Laba Kotor 30 Hari Terakhir per Kategori (%)"
      >
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 shrink-0" style={{ color: palette.positive }} />
                <span>Tren Margin Laba Kotor 30 Hari Terakhir per Kategori (%)</span>
              </h3>
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                30 Hari • FIFO HPP
              </span>
              {hasAny30dSales && (
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold bg-slate-900 text-emerald-300">
                  Rata-rata Margin: {overall30dMargin.toFixed(1)}%
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau pergeseran persentase margin laba kotor harian per kategori selama 30 hari terakhir untuk mendeteksi kenaikan HPP atau perubahan bauran produk.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showOverallMarginLine}
                onChange={(e) => {
                  sound.playTap();
                  setShowOverallMarginLine(e.target.checked);
                }}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Tampilkan Rata-rata Toko</span>
            </label>

            {focusedMarginCategory && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setFocusedMarginCategory(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Fokus</span>
              </button>
            )}

            <FullscreenToggleButton
              isFullscreen={isMargin30dFullscreen}
              onToggle={() => setIsMargin30dFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Category 30-Day Margin & Shift Summary Strip */}
        {marginCategorySeries.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {marginCategorySeries.map((cat) => {
              const effectiveFocus =
                focusedMarginCategory && marginCategorySeries.some((s) => s.name === focusedMarginCategory)
                  ? focusedMarginCategory
                  : null;
              const isFocused = effectiveFocus === cat.name;
              const isDimmed = effectiveFocus !== null && !isFocused;
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setFocusedMarginCategory((curr) => (curr === cat.name ? null : cat.name));
                  }}
                  title="Klik untuk menyorot garis margin kategori ini"
                  className={`px-2.5 py-1.5 rounded-xl border text-left transition-all flex items-center gap-2 cursor-pointer ${
                    isFocused
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : isDimmed
                      ? 'bg-slate-50 text-slate-400 border-slate-200 opacity-60 hover:opacity-100'
                      : 'bg-slate-50 hover:bg-white text-slate-800 border-slate-200'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="text-[11px] font-bold">{cat.name}</span>
                  <span className={`text-[11px] font-mono font-black ${isFocused ? 'text-emerald-300' : 'text-slate-900'}`}>
                    {cat.margin30d !== null ? `${cat.margin30d.toFixed(1)}%` : '-'}
                  </span>
                  {cat.shiftDelta !== null && (
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                        cat.shiftDelta >= 0
                          ? isFocused
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-emerald-100 text-emerald-800'
                          : isFocused
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                      title="Pergeseran margin 15 hari terakhir vs 15 hari sebelumnya"
                    >
                      {cat.shiftDelta >= 0 ? `▲ +${cat.shiftDelta.toFixed(1)}%` : `▼ ${cat.shiftDelta.toFixed(1)}%`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Recharts Line Chart */}
        <AnimatedChartStage
          filterKey={`margin-30d-${hiddenCategories.join(',')}-${focusedMarginCategory || 'ALL'}-${showOverallMarginLine}`}
          accent="emerald"
          delayMs={120}
          className={isMargin30dFullscreen ? 'w-full h-[60vh] min-h-[380px]' : 'w-full h-80 md:h-96'}
        >
          {!hasAny30dSales ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
              {isCategoryFiltered && categoryList.length > 0 ? (
                <>
                  <EyeOff className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">
                    Tidak ada kategori aktif untuk menampilkan tren margin 30 hari
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      handleSelectAllCategories();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tampilkan Semua Kategori</span>
                  </button>
                </>
              ) : (
                <>
                  <Percent className="w-8 h-8 text-slate-300" />
                  <p className="text-xs font-bold text-slate-600">
                    Belum ada transaksi penjualan dalam 30 hari terakhir untuk menghitung tren margin laba kotor
                  </p>
                </>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marginTrend30dData} margin={{ top: 18, right: 18, left: 6, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 10.5, fill: '#64748b', fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  minTickGap={22}
                />
                <YAxis
                  tickFormatter={(val) => `${val}%`}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  domain={['auto', 'auto']}
                />
                <ReferenceLine y={0} stroke="#cbd5e1" strokeDasharray="3 3" />
                {showOverallMarginLine && overall30dRevenue > 0 && (
                  <ReferenceLine
                    y={overall30dMargin}
                    stroke="#0f172a"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Rata-rata 30H: ${overall30dMargin.toFixed(1)}%`,
                      position: 'insideTopRight',
                      fill: '#334155',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                )}
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0]?.payload;
                    if (!row) return null;

                    const activeCatsOnDay = marginCategorySeries
                      .map((s) => ({
                        name: s.name,
                        color: s.color,
                        margin: row[s.dataKey] as number | null,
                        revenue: row[s.revKey] as number,
                        profit: row[s.profitKey] as number,
                      }))
                      .filter((item) => item.margin !== null && item.revenue > 0)
                      .sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0));

                    return (
                      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[250px] space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                          <span className="font-bold text-slate-100">{row.fullDateLabel}</span>
                          {row.overallMargin !== null && (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                              Toko: {row.overallMargin.toFixed(1)}%
                            </span>
                          )}
                        </div>

                        {activeCatsOnDay.length === 0 ? (
                          <div className="text-[11px] text-slate-400 italic">
                            Tidak ada transaksi kategori aktif pada tanggal ini
                          </div>
                        ) : (
                          <div className="space-y-1.5 font-mono text-[11px]">
                            {activeCatsOnDay.map((cat) => (
                              <div key={cat.name} className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: cat.color }}
                                  />
                                  <span className="font-sans font-semibold text-slate-200 truncate max-w-[115px]">
                                    {cat.name}
                                  </span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span
                                    className={`font-bold ${
                                      (cat.margin ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {cat.margin?.toFixed(1)}%
                                  </span>
                                  <span className="text-slate-400 text-[10px] ml-1.5">
                                    ({formatRupiah(cat.profit)})
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <RechartsLegend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />

                {showOverallMarginLine && (
                  <Line
                    type="monotone"
                    dataKey="overallMargin"
                    name="Rata-rata Margin Harian"
                    stroke="#0f172a"
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    dot={false}
                    activeDot={{ r: 4, fill: '#0f172a' }}
                    connectNulls
                    isAnimationActive={true}
                    animationDuration={550}
                    animationEasing="ease-out"
                    opacity={focusedMarginCategory && marginCategorySeries.some((s) => s.name === focusedMarginCategory) ? 0.25 : 0.75}
                  />
                )}

                {marginCategorySeries.map((cat) => {
                  const effectiveFocus =
                    focusedMarginCategory && marginCategorySeries.some((s) => s.name === focusedMarginCategory)
                      ? focusedMarginCategory
                      : null;
                  const isFocused = effectiveFocus === cat.name;
                  const isDimmed = effectiveFocus !== null && !isFocused;
                  return (
                    <Line
                      key={cat.dataKey}
                      type="monotone"
                      dataKey={cat.dataKey}
                      name={cat.name}
                      stroke={cat.color || palette.primary}
                      strokeWidth={isFocused ? 3.5 : 2.5}
                      strokeOpacity={isDimmed ? 0.2 : 1}
                      dot={isDimmed ? false : { r: 2.5, strokeWidth: 1.5, fill: '#fff' }}
                      activeDot={{ r: 5 }}
                      connectNulls
                      isAnimationActive={true}
                      animationDuration={550}
                      animationEasing="ease-out"
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </AnimatedChartStage>

        {hasAny30dSales && (
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Total Omzet 30 Hari (Kategori Aktif):{' '}
              <strong className="font-mono text-slate-800">{formatRupiah(overall30dRevenue)}</strong> • Laba Kotor:{' '}
              <strong className="font-mono text-emerald-700">{formatRupiah(overall30dProfit)}</strong>
            </span>
            <span className="text-[10.5px] text-slate-400">
              * Hari tanpa penjualan pada suatu kategori dihubungkan mulus agar tren margin tetap terbaca akurat.
            </span>
          </div>
        )}
      </div>
      </ChartFullscreenShell>

      {/* Top 5 Produk Terlaris - Interactive Recharts Donut Chart */}
      <ChartFullscreenShell
        isFullscreen={isTop5DonutFullscreen}
        onClose={() => setIsTop5DonutFullscreen(false)}
        title="Top 5 Produk Terlaris"
      >
      <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center flex-wrap gap-2">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <span>Top 5 Produk Terlaris</span>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                {periodLabel}
              </span>
              {top5ProductsSummary.items.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                  {top5ProductsSummary.top5ShareOfAll.toFixed(1)}% dari Total Penjualan
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Visualisasi donat interaktif untuk memantau 5 produk unggulan terlaris — arahkan kursor atau klik irisan/daftar untuk mengunci detail produk.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {pinnedTopProductIdx !== null && (
              <button
                type="button"
                onClick={() => setPinnedTopProductIdx(null)}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
              >
                Reset Fokus
              </button>
            )}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setTopProductsMetric('UNITS');
                  setPinnedTopProductIdx(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  topProductsMetric === 'UNITS'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Unit Terjual
              </button>
              <button
                type="button"
                onClick={() => {
                  setTopProductsMetric('REVENUE');
                  setPinnedTopProductIdx(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  topProductsMetric === 'REVENUE'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Omzet
              </button>
              <button
                type="button"
                onClick={() => {
                  setTopProductsMetric('PROFIT');
                  setPinnedTopProductIdx(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  topProductsMetric === 'PROFIT'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Laba Kotor
              </button>
            </div>

            <FullscreenToggleButton
              isFullscreen={isTop5DonutFullscreen}
              onToggle={() => setIsTop5DonutFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {top5ProductsSummary.items.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs text-center gap-2 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 p-6">
            <Package className="w-8 h-8 text-slate-300" />
            <p className="font-semibold text-slate-600">
              Belum ada data produk terjual pada periode {periodLabel}.
            </p>
            {isCategoryFiltered && (
              <p className="text-[11px] text-slate-400">
                Coba aktifkan kembali kategori yang sedang disembunyikan oleh filter grafik.
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left: Interactive Recharts Donut Chart + Dynamic Center Overlay */}
            <AnimatedChartStage
              filterKey={`top5-${period}-${topProductsMetric}-${hiddenCategories.join(',')}`}
              accent="amber"
              delayMs={120}
              className={`lg:col-span-5 relative w-full flex items-center justify-center ${
                isTop5DonutFullscreen ? 'h-[58vh] min-h-[380px]' : 'h-72 sm:h-80'
              }`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <RechartsTooltip content={<CustomTopProductDonutTooltip />} />
                  <Pie
                    data={top5ProductsSummary.items}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="86%"
                    paddingAngle={4}
                    cornerRadius={6}
                    isAnimationActive={true}
                    animationDuration={600}
                    animationEasing="ease-out"
                    onMouseEnter={(_, idx) => setHoveredTopProductIdx(idx)}
                    onMouseLeave={() => setHoveredTopProductIdx(null)}
                    onClick={(_, idx) =>
                      setPinnedTopProductIdx((prev) => (prev === idx ? null : idx))
                    }
                  >
                    {top5ProductsSummary.items.map((entry, idx) => {
                      const isDimmed = focusedTopProductIdx !== null && focusedTopProductIdx !== idx;
                      const isFocused = focusedTopProductIdx === idx;
                      return (
                        <Cell
                          key={entry.productId || `${entry.name}-${idx}`}
                          fill={entry.color}
                          fillOpacity={isDimmed ? 0.25 : 1}
                          stroke={isFocused ? '#0f172a' : '#ffffff'}
                          strokeWidth={isFocused ? 2.5 : 1.5}
                          className="cursor-pointer transition-all duration-200 outline-none"
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center Donut KPI Summary Overlay */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-12">
                {activeTopProductItem ? (
                  <div className="space-y-0.5 max-w-[140px]">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black text-white shadow-2xs"
                      style={{ backgroundColor: activeTopProductItem.color }}
                    >
                      #{activeTopProductItem.rank} Terlaris
                    </span>
                    <div className="text-xs font-bold text-slate-900 line-clamp-2 leading-tight pt-0.5">
                      {activeTopProductItem.name}
                    </div>
                    <div className="text-sm font-black font-mono text-slate-900 tabular-nums">
                      {formatTopProductMetricValue(
                        activeTopProductItem.value,
                        topProductsMetric,
                        activeTopProductItem.unitName
                      )}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-500">
                      {activeTopProductItem.shareOfAllPercent.toFixed(1)}% total toko
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5 max-w-[145px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total Top 5
                    </span>
                    <div className="text-sm sm:text-base font-black font-mono text-slate-900 tabular-nums leading-tight">
                      {formatTopProductMetricValue(
                        top5ProductsSummary.top5MetricSum,
                        topProductsMetric,
                        'Unit'
                      )}
                    </div>
                    <div className="text-[11px] font-bold text-sky-600">
                      {top5ProductsSummary.top5ShareOfAll.toFixed(1)}% pangsa toko
                    </div>
                    <div className="text-[10px] text-slate-400">
                      dari {top5ProductsSummary.totalUniqueProducts} produk
                    </div>
                  </div>
                )}
              </div>
            </AnimatedChartStage>

            {/* Right: Synchronized Interactive Top 5 Ranking Breakdown */}
            <div className="lg:col-span-7 space-y-2.5">
              {top5ProductsSummary.items.map((item, idx) => {
                const isActive = focusedTopProductIdx === idx;
                const isPinned = pinnedTopProductIdx === idx;
                const isDimmed = focusedTopProductIdx !== null && !isActive;

                return (
                  <button
                    key={item.productId || `${item.name}-${idx}`}
                    type="button"
                    onMouseEnter={() => setHoveredTopProductIdx(idx)}
                    onMouseLeave={() => setHoveredTopProductIdx(null)}
                    onClick={() => setPinnedTopProductIdx((prev) => (prev === idx ? null : idx))}
                    className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-slate-50 border-slate-900 shadow-xs scale-[1.01]'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    } ${isDimmed ? 'opacity-55' : 'opacity-100'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black shrink-0 ${
                            item.rank === 1
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          #{item.rank}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                              {item.name}
                            </span>
                            {isPinned && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900 text-white">
                                Terkunci
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[10px]">
                              {item.category}
                            </span>
                            <span>{item.txCount} transaksi</span>
                            <span>•</span>
                            <span className="text-emerald-700 font-semibold">
                              Margin {item.marginPercent.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-black text-xs sm:text-sm text-slate-900 tabular-nums">
                          {formatTopProductMetricValue(item.value, topProductsMetric, item.unitName)}
                        </div>
                        <div className="text-[10.5px] font-mono text-slate-500 tabular-nums">
                          {topProductsMetric === 'UNITS'
                            ? formatRupiah(item.revenue)
                            : `${formatNumber(item.unitsSold)} ${item.unitName}`}
                        </div>
                      </div>
                    </div>

                    {/* Progress bar of contribution within total store sales */}
                    <div className="mt-2.5 flex items-center gap-2.5">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.min(100, Math.max(4, item.shareOfTop5Percent))}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                      <span className="text-[10.5px] font-mono font-bold text-slate-600 tabular-nums shrink-0 w-24 text-right">
                        {item.shareOfAllPercent.toFixed(1)}% toko
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {top5ProductsSummary.items.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Total Penjualan Periode Ini ({top5ProductsSummary.totalUniqueProducts} produk unik):{' '}
              <strong className="font-mono text-slate-800">
                {formatNumber(top5ProductsSummary.totalPeriodUnits)} Unit
              </strong>{' '}
              • Omzet:{' '}
              <strong className="font-mono text-slate-800">
                {formatRupiah(top5ProductsSummary.totalPeriodRevenue)}
              </strong>{' '}
              • Laba:{' '}
              <strong className="font-mono text-emerald-700">
                {formatRupiah(top5ProductsSummary.totalPeriodProfit)}
              </strong>
            </span>
            <span className="text-[10.5px] text-slate-400">
              * Klik baris atau irisan grafik untuk mengunci sorotan produk di pusat donat.
            </span>
          </div>
        )}
      </div>
      </ChartFullscreenShell>

      {/* Top 5 Produk Berdasarkan Margin (Profit Contribution & Procurement Focus) */}
      <TopProductsByMarginTable
        transactions={transactions}
        products={products}
        categories={categories}
        productMap={productMap}
        currentStart={currentStart}
        currentEnd={currentEnd}
        periodLabel={periodLabel}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Scatter Plot Korelasi Volume Penjualan vs Margin Keuntungan per Produk */}
      <ProductVolumeMarginScatterChart
        transactions={transactions}
        productMap={productMap}
        currentStart={currentStart}
        currentEnd={currentEnd}
        periodLabel={periodLabel}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Grafik Level Stok Produk & Garis Penanda Batas Minimum (Threshold Reorder) */}
      <div id="stock-threshold-chart-section">
        <ProductStockThresholdChart
          products={products}
          categories={categories}
          hiddenCategorySet={hiddenCategorySet}
          totalCategoriesCount={categoryList.length}
          activeCategoryCount={activeCategoryCount}
          isCategoryFiltered={isCategoryFiltered}
          specificSelectedCategoryName={specificSelectedCategoryName}
          onResetCategoryFilter={handleSelectAllCategories}
        />
      </div>

      {/* Pengecekan Stok Silang Antar Unit Toko & Koordinasi Mutasi Stok */}
      <CrossBranchStockPanel
        products={products}
        storeSettings={storeSettings}
        onUpdateStoreSettings={onUpdateStoreSettings}
        onSaveProducts={onSaveProducts}
        requestedByName={currentUserName}
      />

      {/* Komposisi Stok Produk Berdasarkan Kategori (Interactive Pie Chart) */}
      <CategoryStockPieChart
        products={products}
        categories={categories}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Grafik Donut & Tabel Breakdown: Distribusi Metode Pembayaran (Cash, QRIS, Transfer, EDC, Piutang) */}
      <PaymentMethodDonutChart
        transactions={transactions}
        productMap={productMap}
        currentStart={currentStart}
        currentEnd={currentEnd}
        previousStart={previousStart}
        previousEnd={previousEnd}
        periodLabel={periodLabel}
        previousLabel={previousLabel}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Analisis Efektivitas Diskon (Membership vs Promo) Terhadap Volume Penjualan Bulanan */}
      <MonthlyDiscountEffectivenessChart
        transactions={transactions}
        productMap={productMap}
        hiddenCategorySet={hiddenCategorySet}
        totalCategoriesCount={categoryList.length}
        activeCategoryCount={activeCategoryCount}
        isCategoryFiltered={isCategoryFiltered}
        specificSelectedCategoryName={specificSelectedCategoryName}
        onResetCategoryFilter={handleSelectAllCategories}
      />

      {/* Laporan Ringkasan Kualitas Layanan & Kepuasan Pelanggan (Rating Bintang 1-5 Struk Digital) */}
      <div id="customer-satisfaction-report-section">
        <CustomerSatisfactionReportPanel
          transactions={transactions}
          currentStart={currentStart}
          currentEnd={currentEnd}
          previousStart={previousStart}
          previousEnd={previousEnd}
          periodLabel={periodLabel}
        />
      </div>

      {/* Category Performance Breakdown Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Matriks Permintaan Kategori &amp; Performa Penjualan</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Rincian komprehensif kontribusi omzet, volume permintaan, estimasi margin laba, dan tren pertumbuhan setiap segmen.
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono font-bold">
            {visibleCategoryList.length}{isCategoryFiltered ? ` / ${categoryList.length}` : ''} Kategori
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                <th className="py-3 px-4">Kategori Produk</th>
                <th className="py-3 px-4 text-right">Omzet Periode Ini</th>
                {compareWithPrevious && <th className="py-3 px-4 text-right">Omzet Periode Lalu</th>}
                <th className="py-3 px-4 text-center">Tren Permintaan</th>
                <th className="py-3 px-4 text-right">Volume Terjual</th>
                <th className="py-3 px-4 text-right">Laba Kotor</th>
                <th className="py-3 px-4 text-right">Margin (%)</th>
                <th className="py-3 px-4">Produk Paling Laris</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleCategoryList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    {isCategoryFiltered && categoryList.length > 0
                      ? 'Semua kategori sedang disembunyikan oleh filter grafik.'
                      : 'Belum ada kategori dengan catatan transaksi pada periode ini.'}
                  </td>
                </tr>
              ) : (
                visibleCategoryList.map((cat) => {
                  const share = totalCurrentRevenue > 0 ? (cat.currentRevenue / totalCurrentRevenue) * 100 : 0;
                  const isPositiveGrowth = cat.growthPercent >= 0;

                  return (
                    <tr 
                      key={cat.name} 
                      onMouseEnter={() => setSelectedCategoryHighlight(cat.name)}
                      onMouseLeave={() => setSelectedCategoryHighlight(null)}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                          <div>
                            <div className="font-bold text-slate-900">{cat.name}</div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, backgroundColor: cat.color }} />
                              </div>
                              <span>{share.toFixed(1)}% pangsa</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {formatRupiah(cat.currentRevenue)}
                      </td>

                      {compareWithPrevious && (
                        <td className="py-3 px-4 text-right font-mono text-slate-500 tabular-nums">
                          {formatRupiah(cat.previousRevenue)}
                        </td>
                      )}

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isPositiveGrowth
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {isPositiveGrowth ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          <span>{isPositiveGrowth ? '+' : ''}{cat.growthPercent.toFixed(1)}%</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono text-slate-700 tabular-nums">
                        {formatNumber(cat.currentUnits)} Unit
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                        {formatRupiah(cat.currentProfit)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 tabular-nums">
                        {cat.marginPercent.toFixed(1)}%
                      </td>

                      <td className="py-3 px-4 text-slate-600 truncate max-w-[180px]">
                        {cat.topProduct}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* Optional Batch Stock Integrity Modal in Dashboard Admin */}
      {isIntegrityModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
            <div className="p-2 sm:p-4 overflow-y-auto">
              <BatchStockIntegrityPanel
                products={products}
                onSaveProducts={onSaveProducts || (() => {})}
                isModal={true}
                onClose={() => setIsIntegrityModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Optional Audit Modal in Dashboard Admin */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden">
            <div className="p-2 sm:p-4 overflow-y-auto">
              <FifoGrossProfitAuditPanel
                transactions={transactions}
                products={products}
                storeName={storeName}
                isModal={true}
                onClose={() => setIsAuditModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const SalesPerformanceDashboard: React.FC<SalesPerformanceDashboardProps> = ({
  chartTheme,
  onUpdateChartTheme,
  ...restProps
}) => {
  return (
    <ChartThemeProvider initialConfig={chartTheme} onChangeConfig={onUpdateChartTheme}>
      <SalesPerformanceDashboardContent {...restProps} />
    </ChartThemeProvider>
  );
};
