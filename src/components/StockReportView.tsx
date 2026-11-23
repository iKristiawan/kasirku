import React, { useState, useMemo, useDeferredValue, useEffect } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  BarChart3, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Package, 
  Truck, 
  Printer, 
  MessageCircle, 
  Sliders, 
  ArrowUpDown, 
  TrendingDown, 
  TrendingUp,
  Plus, 
  Minus, 
  RotateCcw, 
  FileSpreadsheet, 
  Boxes, 
  HelpCircle, 
  X, 
  Sparkles,
  ClipboardCheck,
  History,
  Check,
  Filter,
  ShieldAlert,
  AlertCircle,
  Calendar,
  UserCheck,
  ChevronRight,
  Info,
  Lock,
  Download,
  FileText,
  Clock,
  ArrowRight,
  FileDown,
  Calculator,
  CalendarDays,
  ShieldCheck,
  Flame,
  Trash2,
  Layers,
  Wrench,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import {
  BalanceSheetEntry,
  CashflowRecord,
  Product,
  Supplier,
  TaxAdjustment,
  TaxRecord,
  User,
  UserRole,
  StockOpnameRecord,
  StockOpnameItem,
  StockOpnameBatchDetail,
  StoreSettings,
  Transaction,
  RestockOrder,
} from '../types/pos';
import { formatRupiah, formatNumber, formatWhatsAppUrl, formatDateOnly } from '../utils/formatters';
import { sound } from '../utils/audio';
import { TouchKeypadModal } from './TouchKeypadModal';
import { InventoryHealthWidget } from './InventoryHealthWidget';
import { StockTurnoverHeatmap } from './StockTurnoverHeatmap';
import { StockTurnRateModule } from './StockTurnRateModule';
import { TopBottomMovingProductsChart } from './TopBottomMovingProductsChart';
import { ExpiringClearanceModule } from './ExpiringClearanceModule';
import { MonthlyStockMovementModal } from './MonthlyStockMovementModal';
import { BatchHppSummarySection } from './BatchHppSummarySection';
import { BatchIntegrityCheckReport, runBatchIntegrityCheck } from '../utils/batchIntegrity';
import { analyzeStockTurnRate, TurnoverSpeedCategory } from '../utils/stockTurnRate';
import {
  computeMonthlyStockMovementData,
  generateMonthlyStockMovementPdf,
  getCurrentMonthKey,
  shiftMonthKey,
} from '../utils/monthlyStockMovementPdf';
import { exportStockAndProfitLossPdf } from '../utils/balanceSheetUtils';
import { INITIAL_STORE_SETTINGS } from '../utils/mockData';
import { addStandardPdfFooters, buildStoreContactLine, drawPdfStoreHeader } from '../utils/pdfLogoHelper';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

interface StockReportViewProps {
  products: Product[];
  suppliers: Supplier[];
  currentUser: User;
  currentUserRole: UserRole;
  users?: User[];
  stockOpnames: StockOpnameRecord[];
  storeSettings?: StoreSettings;
  transactions?: Transaction[];
  purchases?: RestockOrder[];
  cashflows?: CashflowRecord[];
  taxRecords?: TaxRecord[];
  taxAdjustments?: TaxAdjustment[];
  balanceSheetEntries?: BalanceSheetEntry[];
  batchIntegrityReport?: BatchIntegrityCheckReport;
  openVerifyStockNonce?: number;
  onRecheckBatchIntegrity?: () => BatchIntegrityCheckReport | void;
  onAutoFixAllBatchIntegrity?: () => number | void;
  onUpdateStock: (productId: string, newStock: number, reason?: string) => void;
  onUpdateProduct?: (updatedProduct: Product) => void;
  onBulkUpdateStock: (
    adjustments: { productId: string; newStock: number }[],
    sessionRecord: StockOpnameRecord
  ) => void;
  onDeleteStockOpname?: (
    record: StockOpnameRecord,
    deletionReason: string,
    responsibleUser: { id: string; name: string; role: UserRole },
    revertStockChanges: boolean
  ) => void;
  onOpenThresholdSettings: () => void;
  onNavigateToSuppliers: () => void;
  onInitiateRestockForProduct?: (product: Product, recommendedQty: number) => void;
}

export const REASON_PRESETS = [
  'Sesuai',
  'Barang Rusak / Kadaluarsa',
  'Hilang / Selisih Kasir',
  'Salah Input Transaksi Kasir',
  'Bonus Supplier Belum Dicatat',
  'Kemasan Rusak / Bocor',
  'Koreksi Salah Hitung Sebelumnya',
  'Retur Konsumen Belum Masuk',
  'Lainnya',
];

export const GENERAL_REASON_OPTIONS = [
  'Stock Opname Bulanan',
  'Stock Opname Mingguan',
  'Audit Fisik Akhir Tahun',
  'Audit Khusus / Selisih Kasir',
  'Pergantian Shift / Supervisor',
  'Audit Rutin Sembako & Kritis',
  'Pemeriksaan Acak (Spot Check)',
  'Lainnya',
];

export const StockReportView: React.FC<StockReportViewProps> = ({
  products,
  suppliers,
  currentUser,
  currentUserRole,
  users = [],
  stockOpnames,
  storeSettings,
  transactions = [],
  purchases = [],
  cashflows = [],
  taxRecords = [],
  taxAdjustments = [],
  balanceSheetEntries = [],
  batchIntegrityReport,
  openVerifyStockNonce = 0,
  onRecheckBatchIntegrity,
  onAutoFixAllBatchIntegrity,
  onUpdateStock,
  onUpdateProduct,
  onBulkUpdateStock,
  onDeleteStockOpname,
  onOpenThresholdSettings,
  onNavigateToSuppliers,
  onInitiateRestockForProduct,
}) => {
  // Navigation Tabs: 'MONITORING' | 'BATCH_HPP' | 'STOCK_HEATMAP' | 'TURNOVER' | 'MONTHLY_AUDIT' | 'OPNAME_SESSION' | 'OPNAME_HISTORY' | 'FORECASTING' | 'REORDER_REPORT' | 'EXPIRY_TRACKER'
  const [activeSubTab, setActiveSubTab] = useState<'MONITORING' | 'BATCH_HPP' | 'STOCK_HEATMAP' | 'TURNOVER' | 'MONTHLY_AUDIT' | 'OPNAME_SESSION' | 'OPNAME_HISTORY' | 'FORECASTING' | 'REORDER_REPORT' | 'EXPIRY_TRACKER'>('MONITORING');

  // Stock Turn Rate & Liquidation states
  const [turnoverLookbackDays, setTurnoverLookbackDays] = useState<30 | 60 | 90>(90);
  const [turnoverSpeedFilter, setTurnoverSpeedFilter] = useState<'ALL' | TurnoverSpeedCategory>('ALL');
  const [dismissedSlowAlert, setDismissedSlowAlert] = useState<boolean>(false);

  // Monthly Stock Movement Audit states
  const [auditMonthKey, setAuditMonthKey] = useState<string>(() => getCurrentMonthKey());
  const [auditCategoryFilter, setAuditCategoryFilter] = useState<string>('SEMUA');
  const [auditOnlyWithMovement, setAuditOnlyWithMovement] = useState<boolean>(false);
  const [auditSearch, setAuditSearch] = useState<string>('');
  const [isMonthlyMovementModalOpen, setIsMonthlyMovementModalOpen] = useState<boolean>(false);

  // Verify Stock utility states
  const [showVerifyStockPanel, setShowVerifyStockPanel] = useState<boolean>(false);
  const [verifyShowOnlyIssues, setVerifyShowOnlyIssues] = useState<boolean>(true);
  const [verifyFeedbackMsg, setVerifyFeedbackMsg] = useState<string | null>(null);
  const [isExportingOwnerPdf, setIsExportingOwnerPdf] = useState<boolean>(false);
  const [ownerPdfNotice, setOwnerPdfNotice] = useState<string | null>(null);

  useEffect(() => {
    if (openVerifyStockNonce > 0) {
      setActiveSubTab('MONITORING');
      setShowVerifyStockPanel(true);
      setVerifyShowOnlyIssues(true);
    }
  }, [openVerifyStockNonce]);

  // Optimal Reorder Quantity Report states
  const [reorderLookbackDays, setReorderLookbackDays] = useState<30 | 60 | 90>(30);
  const [reorderLeadTimeDays, setReorderLeadTimeDays] = useState<number>(7);
  const [reorderCycleDays, setReorderCycleDays] = useState<number>(14);
  const [reorderSafetyDays, setReorderSafetyDays] = useState<number>(5);
  const [reorderFilterMode, setReorderFilterMode] = useState<'ALL' | 'NEED_REORDER' | 'WITH_HISTORY'>('ALL');
  const [reorderSupplierFilter, setReorderSupplierFilter] = useState<string>('ALL');
  const [reorderSearch, setReorderSearch] = useState<string>('');

  // STRICTLY physical products only: Services (JASA) have no stock and must NOT be monitored or opnamed
  const physicalProducts = useMemo(() => {
    return products.filter((p) => p.productType !== 'JASA');
  }, [products]);

  const physicalProductMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (let i = 0; i < physicalProducts.length; i++) {
      map.set(physicalProducts[i].id, physicalProducts[i]);
    }
    return map;
  }, [physicalProducts]);

  const supplierMap = useMemo(() => {
    const map = new Map<string, Supplier>();
    for (let i = 0; i < suppliers.length; i++) {
      map.set(suppliers[i].id, suppliers[i]);
    }
    return map;
  }, [suppliers]);

  // Expiry tracker states
  const [expiryStatusFilter, setExpiryStatusFilter] = useState<'ALL' | 'EXPIRED' | 'CRITICAL_7D' | 'WARNING_30D' | 'SAFE'>('ALL');
  const [expirySearch, setExpirySearch] = useState('');

  // Forecasting filter & suggestion states
  const [forecastingSearch, setForecastingSearch] = useState('');
  const deferredForecastingSearch = useDeferredValue(forecastingSearch);
  const [forecastingUrgency, setForecastingUrgency] = useState<'ALL' | 'CRITICAL' | 'SOON_7D' | 'SAFE'>('ALL');
  const [leadTimeDays, setLeadTimeDays] = useState<number>(7); // Default 7 hari lead time pengiriman supplier
  const [safetyStockDays, setSafetyStockDays] = useState<number>(14); // Default 14 hari buffer stok pengaman
  const [isDraftPOModalOpen, setIsDraftPOModalOpen] = useState<boolean>(false);
  const [selectedPOSupplierId, setSelectedPOSupplierId] = useState<string>('ALL');

  // Touch Keypad Modal state for tactile tablet stock adjustments & physical counts
  const [activeKeypad, setActiveKeypad] = useState<{
    title: string;
    subtitle?: string;
    initialValue: number;
    unitName?: string;
    onConfirm: (val: number) => void;
  } | null>(null);

  // =========================================================================
  // TAB 1: MONITORING & RINGKASAN STOK STATES
  // =========================================================================
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const deferredReorderSearch = useDeferredValue(reorderSearch);
  const [monitoringPage, setMonitoringPage] = useState(1);
  const [reorderPage, setReorderPage] = useState(1);
  const STOCK_PAGE_SIZE = 50;
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEED_RESTOCK' | 'OUT_OF_STOCK' | 'SAFE'>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [stockAdjustmentVal, setStockAdjustmentVal] = useState<string>('0');
  const [adjustmentType, setAdjustmentType] = useState<'SET' | 'ADD' | 'SUBTRACT'>('SET');
  const [adjustmentReason, setAdjustmentReason] = useState<string>('Stock Opname Fisik');

  // Predictive Restock & Linear Regression States
  const [isPredictiveRestockActive, setIsPredictiveRestockActive] = useState<boolean>(true);
  const [onlyShowCritical7Days, setOnlyShowCritical7Days] = useState<boolean>(false);

  // Categories
  const categories = useMemo(() => {
    return ['SEMUA', ...Array.from(new Set(physicalProducts.map((p) => p.category)))];
  }, [physicalProducts]);

  // Stock Turn Rate Analysis (>90 days slow-moving detection & liquidation)
  const stockTurnoverAnalysis = useMemo(() => {
    return analyzeStockTurnRate({
      products,
      transactions,
      purchases,
      lookbackDays: turnoverLookbackDays,
    });
  }, [products, transactions, purchases, turnoverLookbackDays]);

  // Monthly Stock Movement Audit Calculation
  const monthlyAuditData = useMemo(() => {
    return computeMonthlyStockMovementData({
      monthKey: auditMonthKey,
      products,
      purchases,
      transactions,
      stockOpnames,
      categoryFilter: auditCategoryFilter,
    });
  }, [auditMonthKey, products, purchases, transactions, stockOpnames, auditCategoryFilter]);

  const filteredMonthlyAuditRows = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return monthlyAuditData.rows.filter((row) => {
      if (auditOnlyWithMovement && !row.hasMovement) return false;
      if (!q) return true;
      return (
        row.productName.toLowerCase().includes(q) ||
        row.barcode.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q)
      );
    });
  }, [monthlyAuditData.rows, auditOnlyWithMovement, auditSearch]);

  // Calculations for Monitoring
  const totalValuation = useMemo(() => {
    return physicalProducts.reduce((acc, p) => acc + p.stockInBaseUnit * p.costPrice, 0);
  }, [physicalProducts]);

  const totalBaseUnitsCount = useMemo(() => {
    return physicalProducts.reduce((acc, p) => acc + p.stockInBaseUnit, 0);
  }, [physicalProducts]);

  const lowStockProducts = useMemo(() => {
    return physicalProducts.filter((p) => p.stockInBaseUnit <= p.minStockAlert);
  }, [physicalProducts]);

  const outOfStockProducts = useMemo(() => {
    return physicalProducts.filter((p) => p.stockInBaseUnit <= 0);
  }, [physicalProducts]);

  const safeStockProducts = useMemo(() => {
    return physicalProducts.filter((p) => p.stockInBaseUnit > p.minStockAlert);
  }, [physicalProducts]);

  // Expiry analytics
  const expiryAnalytics = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    const itemsWithExpiry = physicalProducts.filter((p) => Boolean(p.expiryDate));
    const expiredItems = itemsWithExpiry.filter((p) => new Date(p.expiryDate!) < today);
    const expiringIn7Days = itemsWithExpiry.filter((p) => {
      const d = new Date(p.expiryDate!);
      return d >= today && d <= in7Days;
    });
    const expiringIn30Days = itemsWithExpiry.filter((p) => {
      const d = new Date(p.expiryDate!);
      return d > in7Days && d <= in30Days;
    });
    const safeItems = itemsWithExpiry.filter((p) => new Date(p.expiryDate!) > in30Days);

    return {
      totalTracked: itemsWithExpiry.length,
      expiredItems,
      expiringIn7Days,
      expiringIn30Days,
      safeItems,
      alertCount: expiredItems.length + expiringIn7Days.length + expiringIn30Days.length,
    };
  }, [physicalProducts]);

  const filteredExpiryProducts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    return physicalProducts.filter((p) => {
      if (!p.expiryDate) return false;
      const expDate = new Date(p.expiryDate);
      const isExpired = expDate < today;
      const is7Days = expDate >= today && expDate <= in7Days;
      const is30Days = expDate > in7Days && expDate <= in30Days;
      const isSafe = expDate > in30Days;

      if (expiryStatusFilter === 'EXPIRED' && !isExpired) return false;
      if (expiryStatusFilter === 'CRITICAL_7D' && !is7Days) return false;
      if (expiryStatusFilter === 'WARNING_30D' && !is30Days) return false;
      if (expiryStatusFilter === 'SAFE' && !isSafe) return false;

      const matchSearch =
        p.name.toLowerCase().includes(expirySearch.toLowerCase()) ||
        p.barcode.toLowerCase().includes(expirySearch.toLowerCase()) ||
        p.category.toLowerCase().includes(expirySearch.toLowerCase());

      return matchSearch;
    });
  }, [physicalProducts, expiryStatusFilter, expirySearch]);

  // =========================================================================
  // 30-DAY DAILY VELOCITY & LINEAR REGRESSION (PREDICTIVE RESTOCK)
  // Evaluates daily trend slope (m in y = mx + b), predicts days until depletion,
  // and flags products running out within 7 days.
  // =========================================================================
  const predictiveStockMap = useMemo(() => {
    const now = Date.now();
    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * MS_PER_DAY;

    // 1. Prepare 30-day daily sales buckets for each product: Map<productId, number[30]>
    const productDailySales = new Map<string, number[]>();
    physicalProducts.forEach((p) => {
      productDailySales.set(p.id, new Array(30).fill(0));
    });

    (transactions || []).forEach((tx) => {
      if (tx.timestamp >= thirtyDaysAgo && tx.timestamp <= now) {
        const dayDiff = Math.min(29, Math.max(0, Math.floor((now - tx.timestamp) / MS_PER_DAY)));
        const dayIndex = 29 - dayDiff; // 0 = 29 days ago, 29 = today
        tx.items.forEach((item) => {
          const arr = productDailySales.get(item.productId);
          if (arr) {
            const baseQty = item.quantity * (item.conversionFactor || 1);
            arr[dayIndex] = (arr[dayIndex] || 0) + baseQty;
          }
        });
      }
    });

    // 2. Perform Linear Regression (y = mx + b)
    // x values are 0, 1, 2, ..., 29 (N = 30)
    // mean(x) = 14.5
    // SS_xx = sum((x - 14.5)^2) = 2247.5
    const resultMap = new Map<string, {
      dailyVelocity: number;
      regressionSlope: number;
      trendDirection: 'RISING' | 'DECLINING' | 'STABLE';
      trendPercent: number;
      projectedRunRate: number;
      daysUntilDepletion: number;
      depletionDateStr: string;
      isDepletingSoon7Days: boolean;
      recommendedRestockUnits: number;
      totalSold30Days: number;
    }>();

    physicalProducts.forEach((prod) => {
      const dailyArray = productDailySales.get(prod.id) || new Array(30).fill(0);
      const totalSold = dailyArray.reduce((acc, v) => acc + v, 0);
      const yMean = totalSold / 30;

      let spXY = 0;
      for (let i = 0; i < 30; i++) {
        const xDev = i - 14.5;
        const yDev = dailyArray[i] - yMean;
        spXY += xDev * yDev;
      }

      const slope = spXY / 2247.5; // Change in daily sales per day

      let trendDirection: 'RISING' | 'DECLINING' | 'STABLE' = 'STABLE';
      if (slope > 0.04) trendDirection = 'RISING';
      else if (slope < -0.04) trendDirection = 'DECLINING';

      // Trend acceleration percent over 30 days
      const trendPercent = yMean > 0 ? Math.round((slope * 30 / yMean) * 100) : 0;

      // Projected current daily demand with regression momentum (day 30)
      const projectedRunRate = Math.max(0, yMean + slope * 15.5);
      const effectiveVelocity = yMean > 0 ? Math.max(0.08, projectedRunRate) : 0;

      let daysUntilDepletion = 999;
      let isDepletingSoon7Days = false;

      if (prod.stockInBaseUnit <= 0) {
        daysUntilDepletion = 0;
        isDepletingSoon7Days = true;
      } else if (effectiveVelocity > 0) {
        daysUntilDepletion = Math.round((prod.stockInBaseUnit / effectiveVelocity) * 10) / 10;
        if (daysUntilDepletion <= 7) {
          isDepletingSoon7Days = true;
        }
      }

      let depletionDateStr = 'Aman (>30 Hari)';
      if (prod.stockInBaseUnit <= 0) {
        depletionDateStr = 'Habis Hari Ini';
      } else if (daysUntilDepletion <= 30) {
        const d = new Date(now + daysUntilDepletion * MS_PER_DAY);
        depletionDateStr = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
      }

      // Recommended restock quantity: 21 days supply (7 days lead time + 14 days safety buffer)
      const targetStock = Math.ceil(effectiveVelocity * 21 + prod.minStockAlert);
      const recommendedRestockUnits = Math.max(0, targetStock - prod.stockInBaseUnit);

      resultMap.set(prod.id, {
        dailyVelocity: Math.round(yMean * 10) / 10,
        regressionSlope: Math.round(slope * 1000) / 1000,
        trendDirection,
        trendPercent,
        projectedRunRate: Math.round(projectedRunRate * 10) / 10,
        daysUntilDepletion,
        depletionDateStr,
        isDepletingSoon7Days,
        recommendedRestockUnits,
        totalSold30Days: totalSold,
      });
    });

    return resultMap;
  }, [physicalProducts, transactions]);

  // List of items depleting within 7 days (only active when Predictive Restock toggle is ON)
  const critical7DaysProducts = useMemo(() => {
    if (!isPredictiveRestockActive) return [];
    return physicalProducts.filter((p) => {
      const pred = predictiveStockMap.get(p.id);
      return pred?.isDepletingSoon7Days;
    });
  }, [physicalProducts, predictiveStockMap, isPredictiveRestockActive]);

  const filteredProducts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return physicalProducts.filter((p) => {
      const isZero = p.stockInBaseUnit <= 0;
      const isLow = p.stockInBaseUnit <= p.minStockAlert;
      const pred = predictiveStockMap.get(p.id);

      if (onlyShowCritical7Days && (!isPredictiveRestockActive || !pred?.isDepletingSoon7Days)) {
        return false;
      }

      if (statusFilter === 'OUT_OF_STOCK' && !isZero) return false;
      if (statusFilter === 'NEED_RESTOCK' && !isLow) return false;
      if (statusFilter === 'SAFE' && isLow) return false;
      if (selectedCategory !== 'SEMUA' && p.category !== selectedCategory) return false;
      if (!q) return true;

      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        p.baseUnit.toLowerCase().includes(q)
      );
    });
  }, [physicalProducts, statusFilter, selectedCategory, deferredSearch, onlyShowCritical7Days, isPredictiveRestockActive, predictiveStockMap]);

  const monitoringTotalPages = Math.max(1, Math.ceil(filteredProducts.length / STOCK_PAGE_SIZE));
  const safeMonitoringPage = Math.min(monitoringPage, monitoringTotalPages);

  useEffect(() => {
    setMonitoringPage(1);
  }, [deferredSearch, statusFilter, selectedCategory, onlyShowCritical7Days, isPredictiveRestockActive]);

  const paginatedMonitoringProducts = useMemo(() => {
    const start = (safeMonitoringPage - 1) * STOCK_PAGE_SIZE;
    return filteredProducts.slice(start, start + STOCK_PAGE_SIZE);
  }, [filteredProducts, safeMonitoringPage]);

  // =========================================================================
  // DEMAND FORECASTING ANALYTICS (Velocity & Runout Days Estimation)
  // =========================================================================
  const demandForecastingList = useMemo(() => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Aggregate sales velocity from transactions in the past 30 days
    const salesVelocityMap = new Map<string, { totalBaseSold: number; txCount: number }>();
    (transactions || []).forEach((tx) => {
      if (tx.timestamp >= thirtyDaysAgo) {
        tx.items.forEach((item) => {
          const current = salesVelocityMap.get(item.productId) || { totalBaseSold: 0, txCount: 0 };
          const baseQty = item.quantity * (item.conversionFactor || 1);
          salesVelocityMap.set(item.productId, {
            totalBaseSold: current.totalBaseSold + baseQty,
            txCount: current.txCount + 1,
          });
        });
      }
    });

    const items = physicalProducts.map((prod) => {
      const sales = salesVelocityMap.get(prod.id) || { totalBaseSold: 0, txCount: 0 };
      const dailyVelocity = sales.totalBaseSold > 0 ? sales.totalBaseSold / 30 : 0;
      const currentStock = prod.stockInBaseUnit;
      const minAlert = prod.minStockAlert;

      let daysUntilMinThreshold = 999;
      let daysUntilStockOut = 999;

      if (dailyVelocity > 0) {
        const remainingToMin = currentStock - minAlert;
        daysUntilMinThreshold = remainingToMin <= 0 ? 0 : Math.round((remainingToMin / dailyVelocity) * 10) / 10;
        daysUntilStockOut = currentStock <= 0 ? 0 : Math.round((currentStock / dailyVelocity) * 10) / 10;
      }

      // Proactive reorder quantity based on Supplier Lead Time + Safety Stock buffer
      const totalBufferDays = (leadTimeDays || 7) + (safetyStockDays || 14);
      const targetBufferStock = Math.ceil(dailyVelocity * totalBufferDays + minAlert);
      const recommendedReorderQty = Math.max(0, targetBufferStock - currentStock);

      let urgency: 'CRITICAL_ZERO' | 'CRITICAL_MIN' | 'DUE_SOON_3D' | 'WARNING_7D' | 'SAFE';
      if (currentStock <= 0) {
        urgency = 'CRITICAL_ZERO';
      } else if (currentStock <= minAlert) {
        urgency = 'CRITICAL_MIN';
      } else if (daysUntilMinThreshold <= 3) {
        urgency = 'DUE_SOON_3D';
      } else if (daysUntilMinThreshold <= 7) {
        urgency = 'WARNING_7D';
      } else {
        urgency = 'SAFE';
      }

      return {
        product: prod,
        totalSold30d: sales.totalBaseSold,
        dailyVelocity,
        currentStock,
        minAlert,
        daysUntilMinThreshold,
        daysUntilStockOut,
        recommendedReorderQty,
        urgency,
      };
    });

    // Sorting by urgency
    return items.sort((a, b) => {
      const urgencyRank = {
        CRITICAL_ZERO: 0,
        CRITICAL_MIN: 1,
        DUE_SOON_3D: 2,
        WARNING_7D: 3,
        SAFE: 4,
      };
      if (urgencyRank[a.urgency] !== urgencyRank[b.urgency]) {
        return urgencyRank[a.urgency] - urgencyRank[b.urgency];
      }
      return a.daysUntilMinThreshold - b.daysUntilMinThreshold;
    });
  }, [physicalProducts, transactions, leadTimeDays, safetyStockDays]);

  const filteredForecastingList = useMemo(() => {
    const q = deferredForecastingSearch.trim().toLowerCase();
    return demandForecastingList.filter((item) => {
      if (forecastingUrgency === 'CRITICAL' && item.urgency !== 'CRITICAL_ZERO' && item.urgency !== 'CRITICAL_MIN') {
        return false;
      }
      if (forecastingUrgency === 'SOON_7D' && item.urgency !== 'DUE_SOON_3D' && item.urgency !== 'WARNING_7D') {
        return false;
      }
      if (forecastingUrgency === 'SAFE' && item.urgency !== 'SAFE') {
        return false;
      }
      if (!q) return true;

      return (
        item.product.name.toLowerCase().includes(q) ||
        item.product.barcode.toLowerCase().includes(q) ||
        item.product.category.toLowerCase().includes(q)
      );
    });
  }, [demandForecastingList, forecastingUrgency, deferredForecastingSearch]);

  // =========================================================================
  // VERIFY STOCK UTILITY (Negative Batches, Negative Stock, Total vs Batch Mismatch, Cost)
  // =========================================================================
  const stockVerification = useMemo(() => {
    const report =
      batchIntegrityReport ??
      runBatchIntegrityCheck(physicalProducts, { source: 'MANUAL' });
    const resultMap = new Map(report.results.map((r) => [r.product.id, r]));
    const negativeBatchCount = report.results.filter(
      (r) => r.negativeBatches.length > 0 || r.hasNegativeTotal
    ).length;

    return {
      report,
      results: report.results,
      resultMap,
      issueItems: report.issueItems,
      negativeBatchCount,
      mismatchCount: report.mismatchProductsCount,
      negativeCostCount: report.negativeCostProductsCount,
    };
  }, [batchIntegrityReport, physicalProducts]);

  // =========================================================================
  // OPTIMAL REORDER QUANTITY REPORT (Historical Transaction Demand + Variability)
  // =========================================================================
  const optimalReorderList = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const cutoff = now - reorderLookbackDays * oneDayMs;

    // Aggregate daily demand map per product over lookback period
    const productDailySalesMap = new Map<string, Map<string, number>>();
    const productTxCountMap = new Map<string, number>();

    transactions.forEach((tx) => {
      if (tx.timestamp < cutoff) return;
      if ((tx as { isVoid?: boolean }).isVoid) return;
      const dayKey = new Date(tx.timestamp).toISOString().slice(0, 10);
      const seenInTx = new Set<string>();

      tx.items.forEach((item) => {
        if (!item.productId || item.isService) return;
        const matchedProd = physicalProductMap.get(item.productId);
        if (!matchedProd) return;
        const unitObj = matchedProd.units.find((u) => u.unitName === item.unitName);
        const factor = item.conversionFactor || unitObj?.conversionFactor || 1;
        const baseSold = item.quantity * factor;

        if (!productDailySalesMap.has(item.productId)) {
          productDailySalesMap.set(item.productId, new Map());
        }
        const dayMap = productDailySalesMap.get(item.productId)!;
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + baseSold);

        if (!seenInTx.has(item.productId)) {
          seenInTx.add(item.productId);
          productTxCountMap.set(item.productId, (productTxCountMap.get(item.productId) || 0) + 1);
        }
      });
    });

    const rows = physicalProducts.map((prod) => {
      const dayMap = productDailySalesMap.get(prod.id);
      let historicalSold = 0;
      const activeDays = dayMap ? dayMap.size : 0;
      if (dayMap) {
        dayMap.forEach((v) => {
          historicalSold += v;
        });
      }

      const avgDailyDemand = historicalSold / reorderLookbackDays;
      // Compute daily variance across all lookbackDays
      let sumSqDiff = 0;
      if (dayMap && historicalSold > 0) {
        dayMap.forEach((v) => {
          sumSqDiff += Math.pow(v - avgDailyDemand, 2);
        });
        const zeroDays = Math.max(0, reorderLookbackDays - activeDays);
        sumSqDiff += zeroDays * Math.pow(0 - avgDailyDemand, 2);
      }
      const dailyStdDev = historicalSold > 0 ? Math.sqrt(sumSqDiff / reorderLookbackDays) : 0;

      const lt = Math.max(1, reorderLeadTimeDays || 7);
      const cyc = Math.max(1, reorderCycleDays || 14);
      const saf = Math.max(0, reorderSafetyDays || 5);

      const calculatedRop =
        avgDailyDemand > 0
          ? Math.ceil(avgDailyDemand * lt + avgDailyDemand * saf + 1.65 * dailyStdDev * Math.sqrt(lt))
          : prod.minStockAlert;
      const reorderPoint = Math.max(prod.minStockAlert, calculatedRop);

      const targetMaxStock =
        avgDailyDemand > 0
          ? Math.max(reorderPoint + Math.ceil(avgDailyDemand * cyc), prod.minStockAlert * 2)
          : prod.minStockAlert * 2;

      const needsReorder =
        prod.stockInBaseUnit <= reorderPoint ||
        (avgDailyDemand > 0 && prod.stockInBaseUnit < reorderPoint);

      const optimalReorderQty =
        prod.stockInBaseUnit < targetMaxStock && (needsReorder || prod.stockInBaseUnit <= prod.minStockAlert)
          ? Math.max(0, Math.ceil(targetMaxStock - prod.stockInBaseUnit))
          : 0;

      const daysOfCover =
        avgDailyDemand > 0
          ? Math.round((prod.stockInBaseUnit / avgDailyDemand) * 10) / 10
          : prod.stockInBaseUnit > 0
          ? 999
          : 0;

      // Multi-unit pack conversion display (e.g., "2 Dus + 5 PCS")
      let packSuggestion = `${formatNumber(optimalReorderQty)} ${prod.baseUnit}`;
      if (optimalReorderQty > 0 && prod.units.length > 1) {
        const largestUnit = [...prod.units]
          .filter((u) => (u.conversionFactor || 1) > 1)
          .sort((a, b) => (b.conversionFactor || 1) - (a.conversionFactor || 1))[0];
        if (largestUnit && optimalReorderQty >= largestUnit.conversionFactor) {
          const packs = Math.floor(optimalReorderQty / largestUnit.conversionFactor);
          const rem = optimalReorderQty % largestUnit.conversionFactor;
          packSuggestion =
            rem > 0
              ? `${formatNumber(packs)} ${largestUnit.unitName} + ${formatNumber(rem)} ${prod.baseUnit}`
              : `${formatNumber(packs)} ${largestUnit.unitName}`;
        }
      }

      const supplier = prod.supplierId ? supplierMap.get(prod.supplierId) || null : null;
      const estimatedOrderCost = optimalReorderQty * (prod.costPrice || 0);

      return {
        product: prod,
        supplier,
        historicalSold,
        txFrequency: productTxCountMap.get(prod.id) || 0,
        activeDays,
        avgDailyDemand: Math.round(avgDailyDemand * 100) / 100,
        dailyStdDev: Math.round(dailyStdDev * 100) / 100,
        reorderPoint,
        targetMaxStock,
        optimalReorderQty,
        packSuggestion,
        estimatedOrderCost,
        daysOfCover,
        needsReorder: optimalReorderQty > 0,
      };
    });

    return rows.sort((a, b) => {
      if (a.needsReorder !== b.needsReorder) return a.needsReorder ? -1 : 1;
      if (b.optimalReorderQty !== a.optimalReorderQty) return b.optimalReorderQty - a.optimalReorderQty;
      return b.historicalSold - a.historicalSold;
    });
  }, [
    physicalProducts,
    physicalProductMap,
    transactions,
    supplierMap,
    reorderLookbackDays,
    reorderLeadTimeDays,
    reorderCycleDays,
    reorderSafetyDays,
  ]);

  const filteredOptimalReorderList = useMemo(() => {
    const q = deferredReorderSearch.trim().toLowerCase();
    return optimalReorderList.filter((row) => {
      if (reorderFilterMode === 'NEED_REORDER' && !row.needsReorder) return false;
      if (reorderFilterMode === 'WITH_HISTORY' && row.historicalSold <= 0) return false;
      if (reorderSupplierFilter !== 'ALL' && (row.product.supplierId || 'NONE') !== reorderSupplierFilter) {
        return false;
      }
      if (q) {
        const matchName = row.product.name.toLowerCase().includes(q);
        const matchSku = (row.product.sku || row.product.barcode).toLowerCase().includes(q);
        const matchCat = row.product.category.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchCat) return false;
      }
      return true;
    });
  }, [optimalReorderList, reorderFilterMode, reorderSupplierFilter, deferredReorderSearch]);

  const reorderTotalPages = Math.max(1, Math.ceil(filteredOptimalReorderList.length / STOCK_PAGE_SIZE));
  const safeReorderPage = Math.min(reorderPage, reorderTotalPages);

  useEffect(() => {
    setReorderPage(1);
  }, [deferredReorderSearch, reorderFilterMode, reorderSupplierFilter, reorderLookbackDays]);

  const paginatedReorderList = useMemo(() => {
    const start = (safeReorderPage - 1) * STOCK_PAGE_SIZE;
    return filteredOptimalReorderList.slice(start, start + STOCK_PAGE_SIZE);
  }, [filteredOptimalReorderList, safeReorderPage]);

  const handleExportOptimalReorderCsv = () => {
    sound.playTap();
    const headers = [
      'SKU/Barcode',
      'Nama Produk',
      'Kategori',
      'Supplier',
      'Stok Saat Ini',
      'Satuan',
      `Terjual (${reorderLookbackDays}h)`,
      'Rata-rata / Hari',
      'Reorder Point (ROP)',
      'Target Stok Maks',
      'Optimal Reorder Qty',
      'Konversi Kemasan',
      'Estimasi Modal PO (Rp)',
    ];
    const rows = filteredOptimalReorderList.map((r) => [
      `"${r.product.sku || r.product.barcode}"`,
      `"${r.product.name.replace(/"/g, '""')}"`,
      `"${r.product.category}"`,
      `"${r.supplier?.name || 'Umum'}"`,
      r.product.stockInBaseUnit,
      r.product.baseUnit,
      r.historicalSold,
      r.avgDailyDemand,
      r.reorderPoint,
      r.targetMaxStock,
      r.optimalReorderQty,
      `"${r.packSuggestion}"`,
      r.estimatedOrderCost,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `optimal-reorder-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export Stock Report to PDF using jsPDF (with Store Logo)
  const handleExportStockPdf = async () => {
    sound.playTap();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const effectiveSettings = storeSettings || INITIAL_STORE_SETTINGS;
    const storeTitle = effectiveSettings.storeName || 'KasirKu Tablet POS';
    const contactLine = buildStoreContactLine(effectiveSettings);
    const dateStr = new Date().toLocaleDateString('id-ID', { dateStyle: 'full' });

    if (activeSubTab === 'FORECASTING') {
      const criticalCount = demandForecastingList.filter(f => f.urgency === 'CRITICAL_ZERO' || f.urgency === 'CRITICAL_MIN').length;
      const warningCount = demandForecastingList.filter(f => f.urgency === 'DUE_SOON_3D' || f.urgency === 'WARNING_7D').length;
      const totalEstimatedBudget = filteredForecastingList.reduce((acc, f) => acc + (f.recommendedReorderQty * f.product.costPrice), 0);

      const { bannerHeight } = await drawPdfStoreHeader({
        doc,
        title: 'LAPORAN PROYEKSI DEMAND FORECASTING & RESTOCK',
        subtitle: storeTitle.toUpperCase(),
        contactLine,
        rightTopText: `Dicetak: ${dateStr}`,
        rightBottomText: `Kritis: ${criticalCount} · Est. Restock: ${formatRupiah(totalEstimatedBudget)}`,
        storeSettings: effectiveSettings,
        bannerColor: [49, 46, 129],
        accentStripeColor: [99, 102, 241],
        bannerHeight: 28,
      });

      const getUrgencyText = (u: string) => {
        switch (u) {
          case 'CRITICAL_ZERO': return 'HABIS (0)';
          case 'CRITICAL_MIN': return 'DI BAWAH MIN';
          case 'DUE_SOON_3D': return '< 3 HARI';
          case 'WARNING_7D': return '< 7 HARI';
          default: return 'AMAN';
        }
      };

      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Filter Urgensi: ${forecastingUrgency} | Item Kritis: ${criticalCount} | Menipis Segera: ${warningCount} | Estimasi Anggaran Restock: ${formatRupiah(totalEstimatedBudget)}`,
        14,
        bannerHeight + 5
      );

      const tableData = filteredForecastingList.map((item, idx) => {
        const { product, dailyVelocity, currentStock, minAlert, daysUntilMinThreshold, recommendedReorderQty, urgency } = item;
        const estCost = recommendedReorderQty * product.costPrice;
        return [
          (idx + 1).toString(),
          product.barcode,
          product.name,
          product.category,
          `${formatNumber(currentStock)} ${product.baseUnit}`,
          `${formatNumber(minAlert)} ${product.baseUnit}`,
          `${dailyVelocity} /hari`,
          daysUntilMinThreshold <= 0 ? 'Habis (0)' : daysUntilMinThreshold > 90 ? '> 90 hari' : `~${daysUntilMinThreshold} hari`,
          getUrgencyText(urgency),
          `${formatNumber(recommendedReorderQty)} ${product.baseUnit}`,
          formatRupiah(estCost),
        ];
      });

      autoTable(doc, {
        startY: bannerHeight + 8,
        head: [
          [
            'No',
            'Barcode / SKU',
            'Nama Produk',
            'Kategori',
            'Sisa Stok',
            'Batas Min',
            'Kecepatan',
            'Sisa Waktu',
            'Status Urgensi',
            'Rekomendasi PO',
            'Est. Anggaran',
          ],
        ],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: 255,
          fontSize: 8,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
      });

      addStandardPdfFooters(doc, `${storeTitle} — Analisis Demand Forecasting Stok 30 Hari Terakhir`);
      doc.save(`laporan-demand-forecasting-${new Date().toISOString().slice(0, 10)}.pdf`);
    } else if (activeSubTab === 'REORDER_REPORT') {
      const needCount = filteredOptimalReorderList.filter((r) => r.needsReorder).length;
      const totalModalPo = filteredOptimalReorderList.reduce((acc, r) => acc + r.estimatedOrderCost, 0);

      const { bannerHeight } = await drawPdfStoreHeader({
        doc,
        title: `LAPORAN OPTIMAL REORDER QUANTITY (${reorderLookbackDays} HARI)`,
        subtitle: storeTitle.toUpperCase(),
        contactLine,
        rightTopText: `SKU Perlu Order: ${needCount}`,
        rightBottomText: `Est. Biaya PO: ${formatRupiah(totalModalPo)}`,
        storeSettings: effectiveSettings,
        bannerColor: [14, 116, 144],
        accentStripeColor: [6, 182, 212],
        bannerHeight: 28,
      });

      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Dicetak: ${dateStr} | Lead Time: ${reorderLeadTimeDays}h | Siklus Order: ${reorderCycleDays}h | Buffer Aman: ${reorderSafetyDays}h`,
        14,
        bannerHeight + 5
      );

      const tableData = filteredOptimalReorderList.map((r, idx) => [
        (idx + 1).toString(),
        r.product.sku || r.product.barcode,
        r.product.name,
        r.supplier?.name || 'Umum',
        `${formatNumber(r.product.stockInBaseUnit)} ${r.product.baseUnit}`,
        `${formatNumber(r.historicalSold)} ${r.product.baseUnit}`,
        `${r.avgDailyDemand}/hr`,
        `${formatNumber(r.reorderPoint)} ${r.product.baseUnit}`,
        `${formatNumber(r.optimalReorderQty)} ${r.product.baseUnit}`,
        r.packSuggestion,
        formatRupiah(r.estimatedOrderCost),
      ]);

      autoTable(doc, {
        startY: bannerHeight + 8,
        head: [
          [
            'No',
            'SKU',
            'Nama Produk',
            'Supplier',
            'Stok Kini',
            `Terjual (${reorderLookbackDays}h)`,
            'Laju/Hari',
            'ROP',
            'Optimal Order',
            'Saran Pack',
            'Est. Biaya PO',
          ],
        ],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [14, 116, 144], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 7.5, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      addStandardPdfFooters(doc, `${storeTitle} — Laporan Optimal Reorder Supplier`);
      doc.save(`laporan-optimal-reorder-${new Date().toISOString().slice(0, 10)}.pdf`);
    } else if (activeSubTab === 'MONTHLY_AUDIT') {
      await generateMonthlyStockMovementPdf({
        data: monthlyAuditData,
        storeSettings: effectiveSettings,
        auditorName: currentUser.name,
        categoryFilter: auditCategoryFilter,
        onlyWithMovement: auditOnlyWithMovement,
      });
    } else {
      // Standard Stock Inventory & Valuation Report (with Store Logo + Summary KPI Strip)
      const outZeroCount = physicalProducts.filter((p) => p.stockInBaseUnit <= 0).length;
      const { bannerHeight } = await drawPdfStoreHeader({
        doc,
        title: 'LAPORAN INVENTARIS & VALUASI STOK GUDANG',
        subtitle: storeTitle.toUpperCase(),
        contactLine,
        rightTopText: `Dicetak: ${dateStr}`,
        rightBottomText: `Penanggung Jawab: ${currentUser.name}`,
        storeSettings: effectiveSettings,
        bannerColor: [15, 23, 42],
        accentStripeColor: [2, 132, 199],
        bannerHeight: 28,
      });

      const kpiY = bannerHeight + 4;
      const pageWidth = doc.internal.pageSize.getWidth();
      const boxW = (pageWidth - 28 - 9) / 4;
      const summaryCards = [
        { label: 'TOTAL VALUASI ASET (MODAL)', value: formatRupiah(totalValuation), bg: [240, 249, 255], txt: [3, 105, 161] },
        { label: 'TOTAL SKU FISIK AKTIF', value: `${formatNumber(physicalProducts.length)} Item`, bg: [248, 250, 252], txt: [15, 23, 42] },
        { label: 'STOK MENIPIS / KRITIS', value: `${formatNumber(lowStockProducts.length)} Item`, bg: [255, 247, 237], txt: [180, 83, 9] },
        { label: 'STOK HABIS (0)', value: `${formatNumber(outZeroCount)} Item`, bg: [254, 242, 242], txt: [185, 28, 28] },
      ];
      summaryCards.forEach((c, idx) => {
        const x = 14 + idx * (boxW + 3);
        doc.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, kpiY, boxW, 13.5, 1.8, 1.8, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(100, 116, 139);
        doc.text(c.label, x + 3, kpiY + 4.8);
        doc.setFontSize(9.5);
        doc.setTextColor(c.txt[0], c.txt[1], c.txt[2]);
        doc.text(c.value, x + 3, kpiY + 10.5);
      });

      const tableData = physicalProducts.map((prod, idx) => {
        const isLow = prod.stockInBaseUnit <= prod.minStockAlert;
        const isZero = prod.stockInBaseUnit <= 0;
        const statusText = isZero ? 'HABIS (0)' : isLow ? 'MENIPIS' : 'AMAN';
        return [
          (idx + 1).toString(),
          prod.sku || prod.barcode,
          prod.name,
          prod.category,
          `${formatNumber(prod.stockInBaseUnit)} ${prod.baseUnit}`,
          `${formatNumber(prod.minStockAlert)} ${prod.baseUnit}`,
          formatRupiah(prod.costPrice),
          formatRupiah(Math.round(prod.stockInBaseUnit * prod.costPrice)),
          statusText,
        ];
      });

      autoTable(doc, {
        startY: kpiY + 17,
        head: [
          [
            'No',
            'SKU / Barcode',
            'Nama Produk',
            'Kategori',
            'Sisa Stok',
            'Batas Min',
            'Harga Pokok',
            'Total Nilai Aset',
            'Status',
          ],
        ],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: 255,
          fontSize: 8.2,
          fontStyle: 'bold',
        },
        styles: {
          fontSize: 7.8,
          cellPadding: 2.2,
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right', font: 'courier' },
          7: { halign: 'right', font: 'courier', fontStyle: 'bold' },
          8: { halign: 'center', fontStyle: 'bold' },
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 8) {
            const val = String(data.cell.raw || '');
            if (val.startsWith('HABIS')) data.cell.styles.textColor = [190, 18, 60];
            else if (val === 'MENIPIS') data.cell.styles.textColor = [180, 83, 9];
            else data.cell.styles.textColor = [4, 120, 87];
          }
        },
      });

      addStandardPdfFooters(doc, `${storeTitle} — Laporan Inventaris & Valuasi Stok Resmi (${dateStr})`);
      doc.save(`laporan-stok-${new Date().toISOString().slice(0, 10)}.pdf`);
    }
    sound.playSuccessChime();
  };

  const handleExportStockAndPnlOwnerPdf = async () => {
    if (isExportingOwnerPdf) return;
    sound.playTap();
    setIsExportingOwnerPdf(true);
    setOwnerPdfNotice(null);
    try {
      const { filename } = await exportStockAndProfitLossPdf({
        periodMonth: auditMonthKey || getCurrentMonthKey(),
        transactions,
        products,
        purchases,
        cashflows,
        taxRecords,
        taxAdjustments,
        manualEntries: balanceSheetEntries,
        storeSettings: storeSettings || INITIAL_STORE_SETTINGS,
        preparedBy: currentUser.name || 'Manajer Gudang',
      });
      sound.playSuccessChime();
      setOwnerPdfNotice(`PDF Laporan Stok & Laba Rugi (${filename}) berhasil diunduh.`);
    } finally {
      setIsExportingOwnerPdf(false);
    }
  };

  // =========================================================================
  // TAB 2: SESI STOCK OPNAME (HITUNG FISIK & PENYESUAIAN MASSAL) STATES
  // =========================================================================
  const getTodayDateStr = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const generateDefaultSessionNumber = () => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const seq = String(stockOpnames.length + 1).padStart(3, '0');
    return `SO-${ymd}-${seq}`;
  };

  const [sessionDocNumber, setSessionDocNumber] = useState<string>(generateDefaultSessionNumber);
  const [sessionDate, setSessionDate] = useState<string>(getTodayDateStr);
  const [sessionGeneralReason, setSessionGeneralReason] = useState<string>('Stock Opname Bulanan');
  const [sessionNotes, setSessionNotes] = useState<string>('');

  // Physical counts state map: { [productId]: { physicalCount: number | '', reason: string, notes: string } }
  const [physicalCounts, setPhysicalCounts] = useState<{
    [productId: string]: {
      physicalCount: number | '';
      reason: string;
      notes: string;
    };
  }>({});

  // Multi-Batch Opname state: { [productId]: { [batchId]: number | '' } }
  const [batchCounts, setBatchCounts] = useState<Record<string, Record<string, number | ''>>>({});
  const [expandedOpnameProducts, setExpandedOpnameProducts] = useState<Record<string, boolean>>({});
  const [expandAllBatches, setExpandAllBatches] = useState<boolean>(false);

  const [opnameSearch, setOpnameSearch] = useState<string>('');
  // Empty array = semua kategori; non-empty = multi-kategori dalam satu sesi
  const [selectedOpnameCategories, setSelectedOpnameCategories] = useState<string[]>([]);
  const [opnameStatusFilter, setOpnameStatusFilter] = useState<'ALL' | 'DISCREPANT' | 'COUNTED' | 'UNCOUNTED'>('ALL');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [opnameResponsibleUserId, setOpnameResponsibleUserId] = useState<string>(currentUser.id);

  // Tab 3: Detailed Berita Acara & Delete Modal state
  const [selectedHistoricalOpname, setSelectedHistoricalOpname] = useState<StockOpnameRecord | null>(null);
  const [deletingOpname, setDeletingOpname] = useState<StockOpnameRecord | null>(null);
  const [deleteOpnameReason, setDeleteOpnameReason] = useState<string>('');
  const [deleteOpnameResponsibleId, setDeleteOpnameResponsibleId] = useState<string>(currentUser.id);
  const [revertStockOnOpnameDelete, setRevertStockOnOpnameDelete] = useState<boolean>(true);
  const [deleteOpnameError, setDeleteOpnameError] = useState<string>('');

  const availableResponsibleUsers = useMemo(() => {
    const base = users.length > 0 ? users : [currentUser];
    const hasCurrent = base.some((u) => u.id === currentUser.id);
    return hasCurrent ? base : [currentUser, ...base];
  }, [users, currentUser]);

  useEffect(() => {
    setOpnameResponsibleUserId((prev) =>
      availableResponsibleUsers.some((u) => u.id === prev) ? prev : currentUser.id
    );
    setDeleteOpnameResponsibleId((prev) =>
      availableResponsibleUsers.some((u) => u.id === prev) ? prev : currentUser.id
    );
  }, [currentUser.id, availableResponsibleUsers]);

  // Role validation
  const canExecuteAdjustment = currentUserRole === 'ADMIN' || currentUserRole === 'STORE_MANAGER';

  // Unique category list (excluding 'SEMUA') with SKU & batch metrics
  const opnameCategoryStats = useMemo(() => {
    const map = new Map<string, { skuCount: number; batchCount: number }>();
    physicalProducts.forEach((p) => {
      const prev = map.get(p.category) || { skuCount: 0, batchCount: 0 };
      map.set(p.category, {
        skuCount: prev.skuCount + 1,
        batchCount: prev.batchCount + (p.batches?.length || 0),
      });
    });
    return Array.from(map.entries()).map(([name, stat]) => ({ name, ...stat }));
  }, [physicalProducts]);

  // Opname session computations (supports both SKU-level and Multi-Batch level counting)
  const opnameEntries = useMemo(() => {
    return physicalProducts.map((product) => {
      const entry = physicalCounts[product.id];
      const batches = Array.isArray(product.batches) ? product.batches : [];
      const pBatchCounts = batchCounts[product.id] || {};
      const hasBatchLevelCount =
        batches.length > 0 &&
        Object.values(pBatchCounts).some((v) => v !== '' && v !== undefined);

      let batchDetails: StockOpnameBatchDetail[] | undefined;
      let hasCount = Boolean(entry && entry.physicalCount !== '');
      let physicalVal = hasCount ? Number(entry.physicalCount) : product.stockInBaseUnit;
      let difference = hasCount ? physicalVal - product.stockInBaseUnit : 0;
      let differenceValue = difference * product.costPrice;

      if (hasBatchLevelCount) {
        hasCount = true;
        batchDetails = batches.map((b) => {
          const rawVal = pBatchCounts[b.id];
          const systemQty = b.remainingQuantity || 0;
          const physicalQty =
            rawVal !== '' && rawVal !== undefined ? Math.max(0, Number(rawVal)) : systemQty;
          const bDiff = physicalQty - systemQty;
          const unitCost = b.costPrice ?? product.costPrice;
          return {
            batchId: b.id,
            batchNumber: b.batchNumber || b.id,
            costPrice: unitCost,
            systemQty,
            physicalQty,
            difference: bDiff,
            differenceValue: bDiff * unitCost,
          };
        });
        physicalVal = batchDetails.reduce((s, d) => s + d.physicalQty, 0);
        difference = physicalVal - product.stockInBaseUnit;
        differenceValue = batchDetails.reduce((s, d) => s + d.differenceValue, 0);
      }

      const isDiscrepant =
        hasCount &&
        (difference !== 0 ||
          Boolean(batchDetails && batchDetails.some((b) => b.difference !== 0)));

      return {
        product,
        batches,
        hasBatchLevelCount,
        batchDetails,
        hasCount,
        physicalVal,
        difference,
        differenceValue,
        isDiscrepant,
        reason: entry?.reason || (isDiscrepant ? 'Barang Rusak / Kadaluarsa' : 'Sesuai'),
        notes: entry?.notes || '',
      };
    });
  }, [physicalProducts, physicalCounts, batchCounts]);

  // Scope products for active opname (filtered by selected categories, regardless of search/status)
  const scopedOpnameEntries = useMemo(() => {
    if (selectedOpnameCategories.length === 0) return opnameEntries;
    const catSet = new Set(selectedOpnameCategories);
    return opnameEntries.filter((e) => catSet.has(e.product.category));
  }, [opnameEntries, selectedOpnameCategories]);

  // Filtered opname rows
  const filteredOpnameRows = useMemo(() => {
    const q = opnameSearch.trim().toLowerCase();
    return scopedOpnameEntries.filter((item) => {
      if (opnameStatusFilter === 'DISCREPANT' && !item.isDiscrepant) return false;
      if (opnameStatusFilter === 'COUNTED' && !item.hasCount) return false;
      if (opnameStatusFilter === 'UNCOUNTED' && item.hasCount) return false;

      if (!q) return true;
      const matchProduct =
        item.product.name.toLowerCase().includes(q) ||
        item.product.barcode.toLowerCase().includes(q) ||
        item.product.category.toLowerCase().includes(q) ||
        item.product.baseUnit.toLowerCase().includes(q);
      const matchBatch = item.batches.some((b) =>
        (b.batchNumber || '').toLowerCase().includes(q)
      );

      return matchProduct || matchBatch;
    });
  }, [scopedOpnameEntries, opnameStatusFilter, opnameSearch]);

  // Metrics for active opname session (counts all entered items across selected/all categories)
  const countedItemsCount = useMemo(() => {
    return opnameEntries.filter((e) => e.hasCount).length;
  }, [opnameEntries]);

  const multiBatchCountedCount = useMemo(() => {
    return opnameEntries.filter((e) => e.hasBatchLevelCount).length;
  }, [opnameEntries]);

  const countedCategoriesList = useMemo(() => {
    const cats = new Set<string>();
    opnameEntries.forEach((e) => {
      if (e.hasCount) cats.add(e.product.category);
    });
    return Array.from(cats);
  }, [opnameEntries]);

  const discrepantItems = useMemo(() => {
    return opnameEntries.filter((e) => e.isDiscrepant);
  }, [opnameEntries]);

  const totalDiscrepantUnits = useMemo(() => {
    return discrepantItems.reduce((acc, curr) => acc + curr.difference, 0);
  }, [discrepantItems]);

  const totalFinancialVariance = useMemo(() => {
    return discrepantItems.reduce((acc, curr) => acc + curr.differenceValue, 0);
  }, [discrepantItems]);

  // Session Handlers
  const toggleOpnameCategory = (category: string) => {
    sound.playTap();
    setSelectedOpnameCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const toggleProductBatchExpand = (productId: string) => {
    sound.playTap();
    setExpandedOpnameProducts((prev) => ({
      ...prev,
      [productId]: !(prev[productId] ?? expandAllBatches),
    }));
  };

  const handleToggleExpandAllBatches = () => {
    sound.playTap();
    const next = !expandAllBatches;
    setExpandAllBatches(next);
    const updated: Record<string, boolean> = {};
    filteredOpnameRows.forEach((r) => {
      if (r.batches.length > 0) updated[r.product.id] = next;
    });
    setExpandedOpnameProducts(updated);
  };

  const handlePhysicalCountChange = (productId: string, valStr: string) => {
    // Clearing/overriding SKU level resets explicit per-batch inputs if user clears field
    if (valStr === '') {
      setBatchCounts((prev) => {
        if (!prev[productId]) return prev;
        const next = { ...prev };
        delete next[productId];
        return next;
      });
    }
    setPhysicalCounts((prev) => {
      const old = prev[productId] || { physicalCount: '', reason: 'Sesuai', notes: '' };
      if (valStr === '') {
        return {
          ...prev,
          [productId]: { ...old, physicalCount: '' },
        };
      }
      const num = Math.max(0, parseInt(valStr, 10) || 0);
      const prod = products.find((p) => p.id === productId);
      const diff = prod ? num - prod.stockInBaseUnit : 0;
      let newReason = old.reason;
      if (diff === 0 && (old.reason === '' || old.reason === 'Barang Rusak / Kadaluarsa' || old.reason === 'Hilang / Selisih Kasir')) {
        newReason = 'Sesuai';
      } else if (diff !== 0 && old.reason === 'Sesuai') {
        newReason = diff < 0 ? 'Barang Rusak / Kadaluarsa' : 'Bonus Supplier Belum Dicatat';
      }
      return {
        ...prev,
        [productId]: { ...old, physicalCount: num, reason: newReason },
      };
    });
  };

  const handleBatchCountChange = (productId: string, batchId: string, valStr: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;
    const batches = prod.batches || [];

    const parsedVal: number | '' = valStr === '' ? '' : Math.max(0, parseInt(valStr, 10) || 0);

    setBatchCounts((prev) => {
      const prevProdBatches = { ...(prev[productId] || {}) };
      prevProdBatches[batchId] = parsedVal;

      const hasAnyBatchVal = Object.values(prevProdBatches).some(
        (v) => v !== '' && v !== undefined
      );

      // Compute synced SKU total immediately
      if (hasAnyBatchVal) {
        const syncedTotal = batches.reduce((sum, b) => {
          const bVal = prevProdBatches[b.id];
          return (
            sum +
            (bVal !== '' && bVal !== undefined
              ? Math.max(0, Number(bVal))
              : b.remainingQuantity || 0)
          );
        }, 0);

        setPhysicalCounts((pcPrev) => {
          const old = pcPrev[productId] || { physicalCount: '', reason: 'Sesuai', notes: '' };
          const diff = syncedTotal - prod.stockInBaseUnit;
          let newReason = old.reason;
          if (diff === 0 && (old.reason === '' || old.reason === 'Barang Rusak / Kadaluarsa' || old.reason === 'Hilang / Selisih Kasir')) {
            newReason = 'Sesuai';
          } else if (diff !== 0 && old.reason === 'Sesuai') {
            newReason = diff < 0 ? 'Barang Rusak / Kadaluarsa' : 'Bonus Supplier Belum Dicatat';
          }
          return {
            ...pcPrev,
            [productId]: { ...old, physicalCount: syncedTotal, reason: newReason },
          };
        });
      }

      return {
        ...prev,
        [productId]: prevProdBatches,
      };
    });
  };

  const handleStepBatchCount = (productId: string, batchId: string, step: number) => {
    sound.playTap();
    const prod = products.find((p) => p.id === productId);
    const batch = prod?.batches?.find((b) => b.id === batchId);
    const currentRaw = batchCounts[productId]?.[batchId];
    const current =
      currentRaw !== '' && currentRaw !== undefined
        ? Number(currentRaw)
        : batch?.remainingQuantity || 0;
    const nextVal = Math.max(0, current + step);
    handleBatchCountChange(productId, batchId, String(nextVal));
  };

  const handleStepCount = (productId: string, step: number) => {
    sound.playTap();
    setPhysicalCounts((prev) => {
      const prod = products.find((p) => p.id === productId);
      const current = prev[productId]?.physicalCount !== '' && prev[productId]?.physicalCount !== undefined
        ? Number(prev[productId].physicalCount)
        : (prod?.stockInBaseUnit || 0);
      const nextVal = Math.max(0, current + step);
      const diff = prod ? nextVal - prod.stockInBaseUnit : 0;
      let newReason = prev[productId]?.reason || (diff === 0 ? 'Sesuai' : 'Barang Rusak / Kadaluarsa');
      if (diff === 0) newReason = 'Sesuai';
      return {
        ...prev,
        [productId]: {
          physicalCount: nextVal,
          reason: newReason,
          notes: prev[productId]?.notes || '',
        },
      };
    });
  };

  const handleReasonChange = (productId: string, reason: string) => {
    setPhysicalCounts((prev) => {
      const old = prev[productId] || { physicalCount: '', reason, notes: '' };
      return {
        ...prev,
        [productId]: { ...old, reason },
      };
    });
  };

  const handleNotesChange = (productId: string, notes: string) => {
    setPhysicalCounts((prev) => {
      const old = prev[productId] || { physicalCount: '', reason: 'Sesuai', notes };
      return {
        ...prev,
        [productId]: { ...old, notes },
      };
    });
  };

  // Helper: Autofill scoped products (or all if no category selected) & their batches with system stock
  const handleAutofillAllWithSystem = () => {
    sound.playTap();
    const targetEntries = scopedOpnameEntries;
    setPhysicalCounts((prev) => {
      const next = { ...prev };
      targetEntries.forEach(({ product }) => {
        next[product.id] = {
          physicalCount: product.stockInBaseUnit,
          reason: 'Sesuai',
          notes: next[product.id]?.notes || '',
        };
      });
      return next;
    });
    setBatchCounts((prev) => {
      const next = { ...prev };
      targetEntries.forEach(({ product, batches }) => {
        if (batches.length > 0) {
          const bMap: Record<string, number | ''> = {};
          batches.forEach((b) => {
            bMap[b.id] = b.remainingQuantity || 0;
          });
          next[product.id] = bMap;
        }
      });
      return next;
    });
  };

  // Helper: Clear all counts (including multi-batch inputs)
  const handleResetSessionCounts = () => {
    sound.playTap();
    setPhysicalCounts({});
    setBatchCounts({});
    setExpandedOpnameProducts({});
  };

  // Apply Mass Stock Opname Adjustment (Multi-Category & Multi-Batch)
  const handleConfirmMassAdjustment = () => {
    if (!canExecuteAdjustment) {
      sound.playError();
      alert('Akses Ditolak: Hanya Store Manager atau Admin yang berhak memperbarui stok sistem.');
      return;
    }

    sound.playSuccessChime();

    // 1. Build adjustments list & StockOpnameItem[] for counted products
    const adjustments: { productId: string; newStock: number }[] = [];
    const auditedItemsRecord: StockOpnameItem[] = [];
    const categorySet = new Set<string>(selectedOpnameCategories);

    opnameEntries.forEach((entry) => {
      if (entry.hasCount) {
        categorySet.add(entry.product.category);
        adjustments.push({
          productId: entry.product.id,
          newStock: entry.physicalVal,
        });

        const itemPayload: StockOpnameItem = {
          productId: entry.product.id,
          productName: entry.product.name,
          category: entry.product.category,
          baseUnit: entry.product.baseUnit,
          costPrice: entry.product.costPrice,
          systemStock: entry.product.stockInBaseUnit,
          physicalStock: entry.physicalVal,
          difference: entry.difference,
          differenceValue: entry.differenceValue,
          reason: entry.reason,
          notes: entry.notes,
        };
        if (entry.batchDetails && entry.batchDetails.length > 0) {
          itemPayload.batchDetails = entry.batchDetails;
        }
        auditedItemsRecord.push(itemPayload);
      }
    });

    if (adjustments.length === 0) {
      alert('Belum ada barang yang dihitung fisik dalam sesi ini.');
      return;
    }

    // 2. Build full StockOpnameRecord with multi-category & multi-batch metadata
    const chosenResponsible =
      availableResponsibleUsers.find((u) => u.id === opnameResponsibleUserId) || currentUser;
    const auditedCategories = Array.from(categorySet);
    const isMultiBatchMode =
      auditedItemsRecord.some((it) => it.batchDetails && it.batchDetails.length > 0) ||
      auditedCategories.length > 1;

    const newSessionRecord: StockOpnameRecord = {
      id: 'so_' + Date.now(),
      sessionNumber: sessionDocNumber,
      date: sessionDate,
      timestamp: Date.now(),
      auditorName: chosenResponsible.name,
      auditorRole: chosenResponsible.role,
      totalItemsAudited: auditedItemsRecord.length,
      totalDiscrepancies: discrepantItems.length,
      totalDifferenceValue: totalFinancialVariance,
      generalReason: sessionGeneralReason,
      notes: sessionNotes,
      auditedCategories,
      auditMode: isMultiBatchMode ? 'MULTI_BATCH' : 'SKU',
      items: auditedItemsRecord,
    };

    // 3. Execute bulk update in App state
    onBulkUpdateStock(adjustments, newSessionRecord);

    // 4. Close modal, reset session inputs, and navigate to History
    setIsConfirmModalOpen(false);
    setPhysicalCounts({});
    setBatchCounts({});
    setExpandedOpnameProducts({});
    setExpandAllBatches(false);
    setSelectedOpnameCategories([]);
    setSessionNotes('');
    setSessionDocNumber(generateDefaultSessionNumber());
    setActiveSubTab('OPNAME_HISTORY');
    setSelectedHistoricalOpname(newSessionRecord);
  };

  // WhatsApp Restock Summary Share
  const handleShareRestockWhatsApp = () => {
    sound.playTap();
    if (lowStockProducts.length === 0) {
      alert('Tidak ada produk yang perlu di-restock saat ini.');
      return;
    }

    const lines = [
      `*LAPORAN REKAP PRODUK MENIPIS & RESTOCK*`,
      `Tanggal: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}`,
      `Total Barang Kritis/Menipis: ${lowStockProducts.length} item`,
      `------------------------------------------`,
    ];

    lowStockProducts.forEach((p, idx) => {
      const deficit = Math.max(0, p.minStockAlert * 2 - p.stockInBaseUnit);
      lines.push(`${idx + 1}. *${p.name}*`);
      lines.push(`   Stok Saat Ini : ${p.stockInBaseUnit} ${p.baseUnit}`);
      lines.push(`   Batas Minimum : ${p.minStockAlert} ${p.baseUnit}`);
      lines.push(`   Saran Order   : +${deficit > 0 ? deficit : p.minStockAlert} ${p.baseUnit}`);
    });

    lines.push(`------------------------------------------`);
    lines.push(`Mohon diproses untuk pengajuan Purchase Order. Terima kasih.`);

    const targetPhone = suppliers[0]?.whatsapp || '';
    const url = formatWhatsAppUrl(targetPhone, lines.join('\n'));
    window.open(url, '_blank');
  };

  // Single Product Quick Opname Submit
  const handleSingleStockAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;

    sound.playSuccessChime();
    const inputNum = parseFloat(stockAdjustmentVal) || 0;
    let finalStock = adjustingProduct.stockInBaseUnit;

    if (adjustmentType === 'SET') {
      finalStock = Math.max(0, inputNum);
    } else if (adjustmentType === 'ADD') {
      finalStock = adjustingProduct.stockInBaseUnit + inputNum;
    } else if (adjustmentType === 'SUBTRACT') {
      finalStock = Math.max(0, adjustingProduct.stockInBaseUnit - inputNum);
    }

    onUpdateStock(
      adjustingProduct.id,
      finalStock,
      adjustmentReason.trim() || 'Koreksi Cepat Stok Manual'
    );
    setAdjustingProduct(null);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto select-none">
      <div className="max-w-6xl mx-auto space-y-5">
        
        {/* Top Header Card */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-sky-600" />
              <h2 className="text-lg md:text-xl font-bold text-slate-900">
                Manajemen & Kontrol Inventaris Stok
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoring stok real-time, valuasi nilai modal gudang, dan sesi Stock Opname hitung fisik massal.
            </p>
          </div>

          {/* Quick Sub-navigation Tabs */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1 overflow-x-auto no-scrollbar">
            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('MONITORING');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeSubTab === 'MONITORING'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-sky-600" />
              <span>Monitoring Stok</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('BATCH_HPP');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                activeSubTab === 'BATCH_HPP'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className={`w-3.5 h-3.5 ${activeSubTab === 'BATCH_HPP' ? 'text-sky-400' : 'text-indigo-600'}`} />
              <span>HPP per Batch</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('STOCK_HEATMAP');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                activeSubTab === 'STOCK_HEATMAP'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Flame className={`w-3.5 h-3.5 ${activeSubTab === 'STOCK_HEATMAP' ? 'text-amber-300' : 'text-emerald-600'}`} />
              <span>Heatmap Stok</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setTurnoverSpeedFilter('ALL');
                setActiveSubTab('TURNOVER');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeSubTab === 'TURNOVER'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className={`w-3.5 h-3.5 ${activeSubTab === 'TURNOVER' ? 'text-white' : 'text-rose-600'}`} />
              <span>Perputaran Stok</span>
              {stockTurnoverAnalysis.summary.verySlowCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black font-mono tabular-nums ${
                  activeSubTab === 'TURNOVER'
                    ? 'bg-white/20 text-white'
                    : 'bg-rose-100 text-rose-700'
                }`}>
                  {stockTurnoverAnalysis.summary.verySlowCount}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('MONTHLY_AUDIT');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                activeSubTab === 'MONTHLY_AUDIT'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileDown className={`w-3.5 h-3.5 ${activeSubTab === 'MONTHLY_AUDIT' ? 'text-sky-400' : 'text-indigo-600'}`} />
              <span>Audit Bulanan (PDF)</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('OPNAME_SESSION');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeSubTab === 'OPNAME_SESSION'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              <span>Sesi Stock Opname</span>
              {discrepantItems.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              )}
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('OPNAME_HISTORY');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeSubTab === 'OPNAME_HISTORY'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <History className="w-3.5 h-3.5 text-emerald-600" />
              <span>Riwayat Audit ({stockOpnames.length})</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('FORECASTING');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeSubTab === 'FORECASTING'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
              <span>Demand Forecasting</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('REORDER_REPORT');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeSubTab === 'REORDER_REPORT'
                  ? 'bg-cyan-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calculator className="w-3.5 h-3.5 text-cyan-500" />
              <span>Optimal Reorder Qty</span>
              {optimalReorderList.filter((r) => r.needsReorder).length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-cyan-500 text-white">
                  {optimalReorderList.filter((r) => r.needsReorder).length}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setActiveSubTab('EXPIRY_TRACKER');
              }}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                activeSubTab === 'EXPIRY_TRACKER'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>Pelacakan Kadaluarsa</span>
              {expiryAnalytics.alertCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-rose-500 text-white">
                  {expiryAnalytics.alertCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsMonthlyMovementModalOpen(true);
              }}
              className="px-3 py-2 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Buka modal ringkasan pergerakan stok In/Out bulanan untuk audit fisik"
            >
              <Package className="w-3.5 h-3.5 text-sky-600" />
              <span>Ringkasan In/Out</span>
            </button>

            <button
              onClick={handleExportStockPdf}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-2xs ml-1 cursor-pointer"
              title="Unduh Arsip Laporan Stok Digital (.PDF)"
            >
              <FileText className="w-3.5 h-3.5 text-sky-400" />
              <span>Ekspor PDF</span>
            </button>
          </div>
        </div>

        {/* Slow-Moving Stock (>90 Days) Liquidation Alert Notification */}
        {stockTurnoverAnalysis.summary.verySlowCount > 0 &&
          !dismissedSlowAlert &&
          !(activeSubTab === 'TURNOVER' && turnoverSpeedFilter === 'VERY_SLOW') && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 md:px-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-rose-600 text-white shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs md:text-sm font-bold text-rose-950">
                    Notifikasi Likuidasi: {stockTurnoverAnalysis.summary.verySlowCount} Produk Berputar Sangat Lambat (&gt;90 Hari)
                  </div>
                  <p className="text-xs text-rose-800 mt-0.5 tabular-nums">
                    Total modal tertahan sebesar{' '}
                    <strong>{formatRupiah(stockTurnoverAnalysis.summary.verySlowCapitalValue)}</strong> pada stok yang minim pergerakan dalam {turnoverLookbackDays} hari terakhir (contoh:{' '}
                    {stockTurnoverAnalysis.verySlowItems
                      .slice(0, 3)
                      .map((item) => item.product.name)
                      .join(', ')}
                    {stockTurnoverAnalysis.summary.verySlowCount > 3
                      ? `, +${stockTurnoverAnalysis.summary.verySlowCount - 3} lainnya`
                      : ''}
                    ). Pertimbangkan diskon likuidasi untuk mencairkan kas.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setTurnoverSpeedFilter('VERY_SLOW');
                    setActiveSubTab('TURNOVER');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Buka Daftar Likuidasi</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDismissedSlowAlert(true)}
                  title="Tutup notifikasi sementara"
                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-100 hover:text-rose-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        {/* =================================================================== */}
        {/* SUBTAB 1: MONITORING & RINGKASAN STOK                              */}
        {/* =================================================================== */}
        {activeSubTab === 'MONITORING' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Top Toolbar Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Callout to start Opname */}
              <div className="flex items-center gap-2 bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 px-3.5 py-2 rounded-xl text-xs text-sky-900">
                <Sparkles className="w-4 h-4 text-sky-600 shrink-0" />
                <span>
                  Waktunya audit fisik berkala? Buka <strong>Sesi Stock Opname</strong> untuk menghitung dan mencocokkan stok fisik secara massal.
                </span>
                <button
                  onClick={() => {
                    sound.playTap();
                    setActiveSubTab('OPNAME_SESSION');
                  }}
                  className="ml-2 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg text-[11px] shadow-2xs whitespace-nowrap flex items-center gap-1"
                >
                  <span>Mulai Hitung Fisik</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setShowVerifyStockPanel((prev) => !prev);
                    setVerifyFeedbackMsg(null);
                  }}
                  className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors border shadow-2xs cursor-pointer ${
                    stockVerification.issueItems.length > 0
                      ? showVerifyStockPanel
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-300 ring-1 ring-rose-400/40'
                      : showVerifyStockPanel
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}
                  title="Periksa stok batch negatif & kecocokan total stok produk vs jumlah batch"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify Stock</span>
                  {stockVerification.issueItems.length > 0 ? (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-600 text-white">
                      {stockVerification.issueItems.length} Masalah
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-600 text-white">
                      OK
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setIsMonthlyMovementModalOpen(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 font-bold text-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Tampilkan modal ringkasan pergerakan stok masuk/keluar bulanan untuk audit fisik"
                >
                  <Package className="w-3.5 h-3.5 text-sky-600" />
                  <span>Ringkasan In/Out Bulanan</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportStockAndPnlOwnerPdf}
                  disabled={isExportingOwnerPdf}
                  className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer whitespace-nowrap shrink-0"
                  title="Ekspor PDF gabungan Laporan Stok Gudang & Ringkasan Laba Rugi dengan Logo Toko untuk Pemilik Bisnis"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-200" />
                  <span>{isExportingOwnerPdf ? 'Menyusun PDF...' : 'PDF Stok & Laba Rugi'}</span>
                </button>

                <button
                  onClick={handleExportStockPdf}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  title="Ekspor Arsip Digital Laporan Stok ke PDF (jsPDF)"
                >
                  <FileDown className="w-3.5 h-3.5 text-sky-400" />
                  <span>Ekspor PDF</span>
                </button>

                <button
                  onClick={() => {
                    sound.playTap();
                    window.print();
                  }}
                  className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors border border-slate-200 shadow-2xs"
                  title="Cetak Laporan Stok"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Cetak Laporan</span>
                </button>

                <button
                  onClick={handleShareRestockWhatsApp}
                  className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center gap-1.5 transition-colors border border-emerald-200"
                  title="Kirim Daftar Barang Menipis ke WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Kirim Rekap WA</span>
                </button>

                <button
                  onClick={() => {
                    sound.playTap();
                    onOpenThresholdSettings();
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 transition-colors border border-amber-200"
                  title="Atur Ambang Batas Minimum"
                >
                  <Sliders className="w-3.5 h-3.5 text-amber-700" />
                  <span>Atur Batas Stok</span>
                </button>
              </div>
            </div>

            {ownerPdfNotice && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5 text-xs text-emerald-900 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{ownerPdfNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setOwnerPdfNotice(null)}
                  className="p-1 rounded-lg hover:bg-emerald-100 text-emerald-700 cursor-pointer"
                  aria-label="Tutup notifikasi PDF"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Verify Stock Audit Panel */}
            {showVerifyStockPanel && (
              <div
                className={`rounded-2xl border-2 p-4 space-y-3 animate-in fade-in duration-150 ${
                  stockVerification.issueItems.length > 0
                    ? 'bg-rose-50/90 border-rose-300'
                    : 'bg-emerald-50/90 border-emerald-300'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-black/10">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        stockVerification.issueItems.length > 0
                          ? 'bg-rose-600 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}
                    >
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-black text-slate-900">
                          Hasil Verifikasi Integritas Stok &amp; Batch FIFO
                        </h4>
                        <span className="px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-[10px] font-bold text-slate-600">
                          {stockVerification.report.source === 'STARTUP'
                            ? 'Startup Otomatis'
                            : stockVerification.report.source === 'CLOUD_SYNC'
                            ? 'Sinkronisasi Cloud'
                            : stockVerification.report.source === 'POST_OPNAME'
                            ? 'Pasca Opname'
                            : 'Pemeriksaan Manual'}
                          {' · '}
                          {new Date(stockVerification.report.checkedAt).toLocaleTimeString('id-ID', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Memeriksa {stockVerification.results.length} SKU fisik ({formatNumber(stockVerification.report.totalBatchesScanned)} batch FIFO) terhadap stok batch negatif, HPP negatif, atau selisih stok produk vs jumlah batch.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {onRecheckBatchIntegrity && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          const nextRep = onRecheckBatchIntegrity();
                          if (nextRep && nextRep.criticalIssuesCount === 0) {
                            setVerifyFeedbackMsg('Pemeriksaan ulang selesai: seluruh stok & batch FIFO valid (0 masalah).');
                          } else if (nextRep) {
                            setVerifyFeedbackMsg(`Pemeriksaan ulang mendeteksi ${nextRep.criticalIssuesCount} produk bermasalah.`);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-sky-600" />
                        <span>Cek Ulang Integritas</span>
                      </button>
                    )}

                    {stockVerification.issueItems.length > 0 && onAutoFixAllBatchIntegrity && canExecuteAdjustment && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playSuccessChime();
                          const fixedCount = onAutoFixAllBatchIntegrity() || 0;
                          if (fixedCount > 0) {
                            setVerifyFeedbackMsg(
                              `${fixedCount} produk bermasalah telah diperbaiki otomatis (batch negatif dinolkan & total stok disinkronkan ke batch FIFO).`
                            );
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 whitespace-nowrap shadow-2xs"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Perbaiki Otomatis Semua</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setVerifyShowOnlyIssues((v) => !v)}
                      className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
                    >
                      {verifyShowOnlyIssues
                        ? `Tampilkan Semua (${stockVerification.results.length})`
                        : `Hanya Bermasalah (${stockVerification.issueItems.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowVerifyStockPanel(false)}
                      className="p-1.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mini Verification Counters */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-slate-200">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Total SKU Diperiksa</div>
                    <div className="text-base font-black font-mono text-slate-900">
                      {formatNumber(stockVerification.results.length)} SKU
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-rose-200">
                    <div className="text-[10px] font-bold text-rose-600 uppercase">Stok / Batch Negatif</div>
                    <div className="text-base font-black font-mono text-rose-700">
                      {formatNumber(stockVerification.negativeBatchCount)} SKU
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-rose-200">
                    <div className="text-[10px] font-bold text-rose-600 uppercase">Mismatch Stok vs Batch</div>
                    <div className="text-base font-black font-mono text-rose-700">
                      {formatNumber(stockVerification.mismatchCount)} SKU
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white border border-amber-200">
                    <div className="text-[10px] font-bold text-amber-700 uppercase">HPP Batch Negatif</div>
                    <div className="text-base font-black font-mono text-amber-700">
                      {formatNumber(stockVerification.negativeCostCount)} SKU
                    </div>
                  </div>
                </div>

                {verifyFeedbackMsg && (
                  <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{verifyFeedbackMsg}</span>
                  </div>
                )}

                {(() => {
                  const rows = verifyShowOnlyIssues
                    ? stockVerification.issueItems
                    : stockVerification.results;
                  if (rows.length === 0) {
                    return (
                      <div className="p-5 rounded-xl bg-white border border-emerald-200 text-center space-y-1">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                        <p className="text-sm font-black text-emerald-900">Semua Stok Terverifikasi Bersih!</p>
                        <p className="text-xs text-slate-500">
                          Tidak ditemukan stok batch negatif, HPP negatif, ataupun ketidakcocokan antara total stok produk dan penjumlahan batch.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto max-h-72 overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0">
                          <tr>
                            <th className="py-2 px-3">Produk &amp; SKU</th>
                            <th className="py-2 px-3">Stok Produk</th>
                            <th className="py-2 px-3">Total Batch FIFO</th>
                            <th className="py-2 px-3">Selisih / Detail Masalah</th>
                            <th className="py-2 px-3 text-right">Tindakan Cepat</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.map((r) => (
                            <tr
                              key={r.product.id}
                              className={
                                r.hasIssue
                                  ? 'bg-rose-50/90 text-rose-950 font-medium'
                                  : 'bg-white'
                              }
                            >
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-900">{r.product.name}</div>
                                <div className="text-[10px] font-mono text-slate-500">
                                  {r.product.sku || r.product.barcode} • {r.batchCount} Batch
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold">
                                <span className={r.hasNegativeTotal ? 'text-rose-700 font-black' : ''}>
                                  {formatNumber(r.product.stockInBaseUnit)} {r.product.baseUnit}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold">
                                {r.hasBatches ? (
                                  <span>
                                    {formatNumber(r.batchSum)} {r.product.baseUnit}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic">Tanpa data batch</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex flex-wrap gap-1">
                                  {r.hasNegativeTotal && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">
                                      Stok Negatif ({r.product.stockInBaseUnit})
                                    </span>
                                  )}
                                  {r.negativeBatches.length > 0 && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">
                                      {r.negativeBatches.length} Batch Negatif (
                                      {r.negativeBatches
                                        .map((b) => `${b.batchNumber || 'Batch'}: ${b.remainingQuantity}`)
                                        .join(', ')}
                                      )
                                    </span>
                                  )}
                                  {r.hasBatchMismatch && (
                                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-black">
                                      Mismatch {r.discrepancy > 0 ? `+${r.discrepancy}` : r.discrepancy}{' '}
                                      {r.product.baseUnit}
                                    </span>
                                  )}
                                  {r.hasNegativeCost && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[10px] font-black">
                                      HPP Batch Negatif ({r.negativeCostBatches.length})
                                    </span>
                                  )}
                                  {!r.hasIssue && (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                                      Cocok &amp; Valid
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {r.hasBatchMismatch && r.batchSum >= 0 && r.negativeBatches.length === 0 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        sound.playSuccessChime();
                                        onUpdateStock(
                                          r.product.id,
                                          r.batchSum,
                                          'Sinkronisasi otomatis Verify Stock ke total batch FIFO'
                                        );
                                        setVerifyFeedbackMsg(
                                          `Stok "${r.product.name}" disinkronkan ke total batch (${formatNumber(r.batchSum)} ${r.product.baseUnit}).`
                                        );
                                      }}
                                      className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
                                    >
                                      Samakan ke Batch ({formatNumber(r.batchSum)})
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      sound.playTap();
                                      setAdjustingProduct(r.product);
                                      setStockAdjustmentVal(Math.max(0, r.product.stockInBaseUnit).toString());
                                      setAdjustmentType('SET');
                                      setAdjustmentReason('Koreksi Audit Verify Stock');
                                    }}
                                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-[10.5px] font-bold cursor-pointer"
                                  >
                                    Sesuaikan
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Inventory Health Score Widget (Moved from Kasir POS to Stock Report) */}
            <InventoryHealthWidget
              products={products}
              transactions={transactions || []}
              onHighlightProduct={(id) => {
                const prod = products.find((p) => p.id === id);
                if (prod) setSearch(prod.name);
              }}
              onOpenThresholdSettings={onOpenThresholdSettings}
            />

            {/* Top & Bottom Moving Products Bar Chart (Fastest vs Slowest Stock Turnover) */}
            <TopBottomMovingProductsChart
              analysis={stockTurnoverAnalysis}
              lookbackDays={turnoverLookbackDays}
              onChangeLookbackDays={setTurnoverLookbackDays}
              onSelectProduct={(productId, speedCategory) => {
                const prod = products.find((p) => p.id === productId);
                if (prod) setSearch(prod.name);
                if (speedCategory === 'VERY_SLOW' || speedCategory === 'SLOW') {
                  setTurnoverSpeedFilter(speedCategory);
                }
              }}
              onOpenTurnoverTab={() => {
                setTurnoverSpeedFilter('VERY_SLOW');
                setActiveSubTab('TURNOVER');
              }}
            />

            {/* Batch Acquisition Cost (HPP) Visualization Summary */}
            <BatchHppSummarySection
              products={products}
              onSelectProductForStock={(prod) => {
                setSearch(prod.name);
                setActiveSubTab('MONITORING');
              }}
            />

            {/* 30-Day Expiring Products Clearance & Promo Module */}
            <ExpiringClearanceModule
              products={products}
              storeSettings={storeSettings}
              currentUserRole={currentUserRole}
              onUpdateProduct={onUpdateProduct}
              onAdjustStockForProduct={(p, reason) => {
                setAdjustingProduct(p);
                setStockAdjustmentVal(p.stockInBaseUnit.toString());
                setAdjustmentType('SET');
                setAdjustmentReason(reason);
              }}
            />

            {/* 4 KPI Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Total Valuasi Nilai Stok
                </div>
                <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1">
                  {formatRupiah(totalValuation)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Berdasarkan harga modal beli dasar
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Total Fisik Unit Barang
                </div>
                <div className="text-xl md:text-2xl font-black text-sky-700 font-mono mt-1">
                  {formatNumber(totalBaseUnitsCount)} Unit
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Dari {products.length} SKU terdaftar
                </div>
              </div>

              <div className={`p-4 rounded-2xl border shadow-2xs transition-all ${
                lowStockProducts.length > 0
                  ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300'
                  : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
                    Perlu Restock Segera
                  </span>
                  {lowStockProducts.length > 0 && (
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  )}
                </div>
                <div className="text-xl md:text-2xl font-black text-amber-700 font-mono mt-1 flex items-baseline gap-1.5">
                  <span>{lowStockProducts.length} Produk</span>
                </div>
                <div className="text-[10px] text-amber-800 mt-0.5 font-medium">
                  Stok ≤ ambang batas minimum
                </div>
              </div>

              <div className={`p-4 rounded-2xl border shadow-2xs ${
                outOfStockProducts.length > 0
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-white border-slate-200'
              }`}>
                <div className="text-[11px] font-bold text-rose-900 uppercase tracking-wider">
                  Stok Kosong / Habis
                </div>
                <div className="text-xl md:text-2xl font-black text-rose-700 font-mono mt-1">
                  {outOfStockProducts.length} Produk
                </div>
                <div className="text-[10px] text-rose-800 mt-0.5">
                  Harus segera dipesan ke supplier
                </div>
              </div>
            </div>

            {/* Predictive Restock Control Bar (Linear Regression Forecasting) */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-4 rounded-2xl text-white shadow-md border border-indigo-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                    <Sparkles className="w-4 h-4 text-indigo-300" />
                  </span>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Fitur Predictive Restock (Regresi Linier 30 Hari)</span>
                    <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 font-bold">
                      y = mx + b
                    </span>
                  </h3>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  Gunakan kalkulasi regresi linier sederhana berdasarkan data transaksi 30 hari terakhir untuk memprediksi kelangkaan stok mendatang dan menandai (highlight) barang yang akan habis dalam waktu 7 hari.
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0 flex-wrap">
                {isPredictiveRestockActive && critical7DaysProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setOnlyShowCritical7Days(!onlyShowCritical7Days);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                      onlyShowCritical7Days
                        ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 ring-2 ring-white/30'
                        : 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-700/60'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-300 shrink-0" />
                    <span>Habis &lt; 7 Hari ({critical7DaysProducts.length})</span>
                  </button>
                )}

                {/* Explicit Predictive Restock Toggle */}
                <label 
                  className="flex items-center gap-3 cursor-pointer bg-slate-800/90 hover:bg-slate-800 px-3.5 py-2 rounded-xl border border-indigo-500/40 select-none shadow-inner transition-all"
                  title="Toggle fitur Predictive Restock (Regresi Linier 30 Hari)"
                >
                  <div className="flex flex-col text-right">
                    <span className="text-xs font-black text-white flex items-center justify-end gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      Predictive Restock
                    </span>
                    <span className="text-[10px] font-medium text-slate-300">
                      {isPredictiveRestockActive ? 'Regresi Linier Aktif' : 'Model Prediksi Nonaktif'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={isPredictiveRestockActive}
                    onChange={(e) => {
                      sound.playTap();
                      setIsPredictiveRestockActive(e.target.checked);
                      if (!e.target.checked) setOnlyShowCritical7Days(false);
                    }}
                    className="sr-only peer"
                    aria-label="Predictive Restock"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 relative shadow-inner"></div>
                  <span className={`text-xs font-mono font-black ${isPredictiveRestockActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {isPredictiveRestockActive ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>
            </div>

            {/* Critical Shortage Warning Banner (< 7 Days) */}
            {isPredictiveRestockActive && critical7DaysProducts.length > 0 && (
              <div className="p-3.5 bg-gradient-to-r from-rose-500/10 via-amber-500/10 to-orange-500/10 border-2 border-rose-400/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in">
                <div className="flex items-start gap-2.5">
                  <div className="p-1.5 bg-rose-500 text-white rounded-xl shrink-0 mt-0.5">
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-rose-950 uppercase tracking-wide flex items-center gap-2">
                      <span>Peringatan Dini: {critical7DaysProducts.length} Produk Diprediksi Habis Dalam 7 Hari</span>
                    </h4>
                    <p className="text-[11.5px] text-slate-700 mt-0.5">
                      Berdasarkan akselerasi transaksi kasir 30 hari terakhir, barang ini akan kosong sebelum tanggal jatuh tempo berikutnya jika tidak segera dilakukan pemesanan ulang (Purchase Order).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setOnlyShowCritical7Days(true);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white text-rose-700 hover:bg-rose-50 border border-rose-300 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  >
                    Filter Tabel Kritis
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      onNavigateToSuppliers();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Buat Draft PO Kritis</span>
                  </button>
                </div>
              </div>
            )}

            {/* Filter and Quick Tabs */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama barang, barcode SKU, atau satuan dasar..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto shrink-0">
                {[
                  { id: 'ALL', label: `Semua (${products.length})` },
                  { id: 'NEED_RESTOCK', label: `Perlu Restock (${lowStockProducts.length})` },
                  { id: 'OUT_OF_STOCK', label: `Habis (${outOfStockProducts.length})` },
                  { id: 'SAFE', label: `Aman (${safeStockProducts.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      sound.playTap();
                      setStatusFilter(tab.id as any);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      statusFilter === tab.id
                        ? tab.id === 'NEED_RESTOCK'
                          ? 'bg-amber-600 text-white font-bold shadow-2xs'
                          : tab.id === 'OUT_OF_STOCK'
                          ? 'bg-rose-600 text-white font-bold shadow-2xs'
                          : 'bg-sky-600 text-white font-bold shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Horizontal Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
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
                      : 'bg-white hover:bg-slate-200 text-slate-600 border border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Stock Report Data Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Nama Produk & Barcode</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4">Stok Satuan Dasar</th>
                      <th className="py-3 px-4">Ambang Batas Minimum</th>
                      <th className="py-3 px-4">Rasio & Status</th>
                      {isPredictiveRestockActive && (
                        <>
                          <th className="py-3 px-4">Laju & Tren Regresi (30 Hari)</th>
                          <th className="py-3 px-4">Prediksi Habis Stok</th>
                        </>
                      )}
                      <th className="py-3 px-4">Nilai Aset Stok</th>
                      <th className="py-3 px-4">{isPredictiveRestockActive ? 'Rekomendasi Restock' : 'Saran Restock'}</th>
                      <th className="py-3 px-4 text-right">Aksi Manajer</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={isPredictiveRestockActive ? 10 : 8} className="py-8 text-center text-slate-400">
                          Tidak ada barang pada kategori atau status filter ini.
                        </td>
                      </tr>
                    ) : (
                      paginatedMonitoringProducts.map((p) => {
                        const isZero = p.stockInBaseUnit <= 0;
                        const isLow = p.stockInBaseUnit <= p.minStockAlert;
                        const ratio = p.minStockAlert > 0 ? (p.stockInBaseUnit / p.minStockAlert) * 100 : 100;
                        const assetValue = p.stockInBaseUnit * p.costPrice;
                        const pred = predictiveStockMap.get(p.id);
                        const verifyInfo = stockVerification.resultMap.get(p.id);
                        const hasVerifyIssue = Boolean(verifyInfo?.hasIssue);
                        const isDepletingCritical = isPredictiveRestockActive && Boolean(pred?.isDepletingSoon7Days);
                        const recommendedRestock = isPredictiveRestockActive && pred && pred.recommendedRestockUnits > 0
                          ? pred.recommendedRestockUnits
                          : Math.max(0, p.minStockAlert * 2 - p.stockInBaseUnit);

                        return (
                          <tr 
                            key={p.id} 
                            className={`hover:bg-slate-50/80 transition-colors ${
                              hasVerifyIssue
                                ? 'bg-rose-100/90 ring-1 ring-inset ring-rose-300'
                                : isDepletingCritical
                                ? 'bg-rose-50/80 ring-1 ring-inset ring-rose-200/90 shadow-2xs'
                                : isZero
                                ? 'bg-rose-50/30'
                                : isLow
                                ? 'bg-amber-50/20'
                                : ''
                            }`}
                          >
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                <span>{p.name}</span>
                                {verifyInfo?.hasNegativeTotal && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-700 text-white">
                                    Stok Negatif
                                  </span>
                                )}
                                {verifyInfo && verifyInfo.negativeBatches.length > 0 && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-700 text-white">
                                    Batch Negatif ({verifyInfo.negativeBatches.length})
                                  </span>
                                )}
                                {verifyInfo?.hasBatchMismatch && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-600 text-white">
                                    Mismatch Batch ({verifyInfo.discrepancy > 0 ? `+${verifyInfo.discrepancy}` : verifyInfo.discrepancy})
                                  </span>
                                )}
                                {isDepletingCritical && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-600 text-white shadow-2xs flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-white shrink-0" />
                                    <span>Habis &lt; 7 Hari</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <span>SKU: {p.sku || p.barcode}</span>
                                <span>·</span>
                                <span className="text-sky-600 font-medium">{p.units.length} Satuan</span>
                                {verifyInfo?.hasBatches && (
                                  <>
                                    <span>·</span>
                                    <span className={verifyInfo.hasIssue ? 'text-rose-700 font-bold' : 'text-slate-500'}>
                                      Batch Sum: {formatNumber(verifyInfo.batchSum)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-slate-600 font-medium">
                              {p.category}
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="flex items-baseline gap-1">
                                <span className={`text-base font-black font-mono tabular-nums ${
                                  isZero
                                    ? 'text-rose-600'
                                    : isLow
                                    ? 'text-amber-700 font-extrabold'
                                    : 'text-slate-900'
                                }`}>
                                  {formatNumber(p.stockInBaseUnit)}
                                </span>
                                <span className="text-xs font-bold text-slate-500 font-mono uppercase">
                                  {p.baseUnit}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Harga modal @ {formatRupiah(p.costPrice)}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 font-mono">
                              <span className="font-bold text-slate-700">
                                {formatNumber(p.minStockAlert)}
                              </span>
                              <span className="text-xs text-slate-400 ml-1">{p.baseUnit}</span>
                            </td>

                            <td className="py-3.5 px-4 w-36">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-[10px] font-bold">
                                  {isZero ? (
                                    <span className="text-rose-600 uppercase">Habis Total</span>
                                  ) : isLow ? (
                                    <span className="text-amber-700 uppercase flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                      <span>Menipis</span>
                                    </span>
                                  ) : (
                                    <span className="text-emerald-700 uppercase">Aman</span>
                                  )}
                                  <span className="font-mono text-slate-500">{Math.round(ratio)}%</span>
                                </div>

                                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isZero ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(isZero ? 0 : 5, ratio))}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>

                            {/* Predictive Restock Columns */}
                            {isPredictiveRestockActive && (
                              <>
                                <td className="py-3.5 px-4 font-mono text-xs">
                                  <div className="font-bold text-slate-800">
                                    {pred?.dailyVelocity || 0} <span className="text-[10px] text-slate-400 font-normal">{p.baseUnit}/hari</span>
                                  </div>
                                  <div className="mt-0.5">
                                    {pred?.trendDirection === 'RISING' ? (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                        <TrendingUp className="w-3 h-3 text-emerald-600" />
                                        <span>+{pred.trendPercent}% (Naik)</span>
                                      </span>
                                    ) : pred?.trendDirection === 'DECLINING' ? (
                                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                        <TrendingDown className="w-3 h-3 text-rose-600" />
                                        <span>{pred.trendPercent}% (Turun)</span>
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-medium">
                                        Stabil (→)
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="py-3.5 px-4">
                                  {isDepletingCritical ? (
                                    <div className="space-y-0.5">
                                      <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-black text-[10.5px] font-mono shadow-2xs flex items-center gap-1 w-fit">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                        <span>{(pred?.daysUntilDepletion ?? 0) <= 0 ? 'Habis Hari Ini' : `Habis ~${pred?.daysUntilDepletion} hari`}</span>
                                      </span>
                                      <div className="text-[10px] text-rose-800 font-mono font-bold">
                                        Est: {pred?.depletionDateStr}
                                      </div>
                                    </div>
                                  ) : pred && pred.daysUntilDepletion <= 14 ? (
                                    <div className="space-y-0.5">
                                      <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-bold text-[10.5px] font-mono w-fit flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-slate-900" />
                                        <span>~{pred.daysUntilDepletion} hari</span>
                                      </span>
                                      <div className="text-[10px] text-amber-800 font-mono">
                                        Est: {pred.depletionDateStr}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="font-mono text-xs font-semibold text-slate-600">
                                      {pred && pred.daysUntilDepletion > 90 ? '> 90 Hari (Aman)' : `~${pred?.daysUntilDepletion || 99} Hari`}
                                    </div>
                                  )}
                                </td>
                              </>
                            )}

                            <td className="py-3.5 px-4 font-mono font-bold text-slate-900 tabular-nums">
                              {formatRupiah(assetValue)}
                            </td>

                            <td className="py-3.5 px-4">
                              {recommendedRestock > 0 ? (
                                <div>
                                  <span className="font-mono font-bold text-sky-700 text-xs">
                                    +{recommendedRestock} {p.baseUnit}
                                  </span>
                                  {isPredictiveRestockActive && (
                                    <span className="text-[9.5px] text-indigo-600 font-semibold block">
                                      Lead Time + 14h Buffer
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs">Cukup</span>
                              )}
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    onNavigateToSuppliers();
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold transition-colors flex items-center gap-1 border border-sky-200"
                                  title="Pesan barang ke supplier"
                                >
                                  <Truck className="w-3.5 h-3.5 text-sky-600" />
                                  <span>PO</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    setAdjustingProduct(p);
                                    setStockAdjustmentVal(p.stockInBaseUnit.toString());
                                    setAdjustmentType('SET');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors shadow-2xs"
                                  title="Sesuaikan stok satuan cepat"
                                >
                                  <span>Koreksi</span>
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

              {filteredProducts.length > STOCK_PAGE_SIZE && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Menampilkan{' '}
                    <strong className="text-slate-900">
                      {(safeMonitoringPage - 1) * STOCK_PAGE_SIZE + 1}–{Math.min(safeMonitoringPage * STOCK_PAGE_SIZE, filteredProducts.length)}
                    </strong>{' '}
                    dari <strong className="text-slate-900">{filteredProducts.length}</strong> produk
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeMonitoringPage <= 1}
                      onClick={() => {
                        sound.playTap();
                        setMonitoringPage((p) => Math.max(1, p - 1));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      Sebelumnya
                    </button>
                    <span className="px-2.5 font-mono font-bold text-slate-800">
                      Hal {safeMonitoringPage} / {monitoringTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeMonitoringPage >= monitoringTotalPages}
                      onClick={() => {
                        sound.playTap();
                        setMonitoringPage((p) => Math.min(monitoringTotalPages, p + 1));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUBTAB: RINGKASAN BIAYA PEROLEHAN (HPP) PER BATCH                   */}
        {/* =================================================================== */}
        {activeSubTab === 'BATCH_HPP' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <BatchHppSummarySection
              products={products}
              onSelectProductForStock={(prod) => {
                setSearch(prod.name);
                setActiveSubTab('MONITORING');
              }}
            />
          </div>
        )}

        {/* =================================================================== */}
        {/* SUBTAB 2: SESI STOCK OPNAME (HITUNG FISIK & PENYESUAIAN MASSAL)    */}
        {/* =================================================================== */}
        {activeSubTab === 'OPNAME_SESSION' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Session Metadata Configuration Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                    <ClipboardCheck className="w-5 h-5 text-sky-600" />
                    <span>Lembar Kerja Multi-Batch Stock Opname</span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold uppercase">
                      Multi-Kategori &amp; Per-Batch FIFO
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pilih satu atau lebih kategori sekaligus dalam satu nomor referensi sesi ({sessionDocNumber}), lalu hitung stok total SKU maupun rincian tiap batch FIFO.
                  </p>
                </div>

                {/* Auditor Info Badge */}
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl self-start sm:self-auto">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <div className="text-xs">
                    <span className="text-slate-500">Auditor: </span>
                    <strong className="text-slate-800">{currentUser.name}</strong>
                    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                      currentUserRole === 'ADMIN'
                        ? 'bg-indigo-100 text-indigo-700'
                        : currentUserRole === 'STORE_MANAGER'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {currentUserRole}
                    </span>
                  </div>
                </div>
              </div>

              {/* Form Session Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Nomor Dokumen / Sesi
                  </label>
                  <input
                    type="text"
                    value={sessionDocNumber}
                    onChange={(e) => setSessionDocNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                    placeholder="Contoh: SO-20261028-001"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Tanggal Pelaksanaan
                  </label>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Alasan / Kategori Opname
                  </label>
                  <select
                    value={sessionGeneralReason}
                    onChange={(e) => setSessionGeneralReason(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                  >
                    {GENERAL_REASON_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">
                    Catatan Pelaksanaan (Opsional)
                  </label>
                  <input
                    type="text"
                    value={sessionNotes}
                    onChange={(e) => setSessionNotes(e.target.value)}
                    placeholder="Contoh: Audit multi-kategori gudang A & B"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Multi-Category Scope Selector inside the same Opname Session */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Cakupan Kategori Audit Sekaligus:</span>
                    </span>
                    <span className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                      {selectedOpnameCategories.length === 0
                        ? `Semua Kategori (${opnameCategoryStats.length})`
                        : `${selectedOpnameCategories.length} Kategori Terpilih`}
                      {' · '}
                      {scopedOpnameEntries.length} SKU
                      {' · '}
                      {scopedOpnameEntries.reduce((s, e) => s + e.batches.length, 0)} Batch
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {selectedOpnameCategories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setSelectedOpnameCategories([]);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer"
                      >
                        Tampilkan Semua Kategori
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setSelectedOpnameCategories(opnameCategoryStats.map((c) => c.name));
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[11px] font-bold cursor-pointer"
                    >
                      Pilih Semua ({opnameCategoryStats.length})
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {opnameCategoryStats.map((cat) => {
                    const isSelected = selectedOpnameCategories.includes(cat.name);
                    return (
                      <button
                        key={cat.name}
                        type="button"
                        onClick={() => toggleOpnameCategory(cat.name)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 text-sky-400" />}
                        <span>{cat.name}</span>
                        <span className={`font-mono text-[10px] ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                          ({cat.skuCount} SKU{cat.batchCount > 0 ? ` · ${cat.batchCount}B` : ''})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cashier Read-Only Notice */}
              {!canExecuteAdjustment && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-900">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Otoritas Terbatas:</strong> Anda masuk sebagai Kasir ({currentUser.name}). Anda dapat mengisi lembar hitung fisik, namun persetujuan dan eksekusi pembaharuan stok massal ke sistem membutuhkan akun <strong>Store Manager</strong> atau <strong>Admin</strong>.
                  </span>
                </div>
              )}
            </div>

            {/* Live Opname Session KPI Dashboard */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Total Item Dihitung
                </div>
                <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1 flex items-baseline gap-1">
                  <span>{countedItemsCount}</span>
                  <span className="text-xs text-slate-400 font-normal">/ {scopedOpnameEntries.length} SKU</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {multiBatchCountedCount > 0
                    ? `${multiBatchCountedCount} SKU mode per-batch FIFO`
                    : `${countedCategoriesList.length || selectedOpnameCategories.length || 0} kategori aktif`}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  SKU Berselisih
                </div>
                <div className={`text-xl md:text-2xl font-black font-mono mt-1 ${
                  discrepantItems.length > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}>
                  {discrepantItems.length} Produk
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {discrepantItems.length > 0 ? 'Terdapat perbedaan fisik vs sistem' : 'Semua stok fisik cocok 100%'}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Total Selisih Unit Fisik
                </div>
                <div className={`text-xl md:text-2xl font-black font-mono mt-1 ${
                  totalDiscrepantUnits < 0 
                    ? 'text-rose-600' 
                    : totalDiscrepantUnits > 0 
                    ? 'text-emerald-600' 
                    : 'text-slate-900'
                }`}>
                  {totalDiscrepantUnits > 0 ? `+${totalDiscrepantUnits}` : totalDiscrepantUnits} Unit
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Akumulasi kuantitas satuan dasar
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Net Nilai Selisih Finansial
                </div>
                <div className={`text-xl md:text-2xl font-black font-mono mt-1 ${
                  totalFinancialVariance < 0 
                    ? 'text-rose-600' 
                    : totalFinancialVariance > 0 
                    ? 'text-emerald-600' 
                    : 'text-slate-900'
                }`}>
                  {totalFinancialVariance > 0 ? `+${formatRupiah(totalFinancialVariance)}` : formatRupiah(totalFinancialVariance)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Akurat berdasarkan HPP batch terkait
                </div>
              </div>
            </div>

            {/* Quick Helper Actions & Filters */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={opnameSearch}
                    onChange={(e) => setOpnameSearch(e.target.value)}
                    placeholder="Cari nama barang, barcode, kategori, atau nomor batch FIFO..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>

                {/* Quick Automation Helpers */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleToggleExpandAllBatches}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors border flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      expandAllBatches
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                    }`}
                    title="Buka / tutup rincian hitung fisik per batch FIFO untuk semua produk ber-batch"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{expandAllBatches ? 'Tutup Semua Batch' : 'Buka Semua Batch FIFO'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAutofillAllWithSystem}
                    className="px-3 py-2 bg-sky-50 hover:bg-sky-100 text-sky-800 rounded-xl text-xs font-bold transition-colors border border-sky-200 flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
                    title="Isi otomatis hitungan fisik SKU & batch sesuai stok sistem agar hanya selisih yang perlu diubah"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                    <span>Samakan Kategori Terpilih</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetSessionCounts}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors border border-slate-200 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    title="Kosongkan semua angka hitungan fisik"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                    <span>Kosongkan Hitungan</span>
                  </button>
                </div>
              </div>

              {/* Filter Tabs & Scope Indicator */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {[
                    { id: 'ALL', label: `Produk Cakupan (${scopedOpnameEntries.length})` },
                    { id: 'DISCREPANT', label: `Berselisih (${discrepantItems.length})` },
                    { id: 'COUNTED', label: `Sudah Dihitung (${countedItemsCount})` },
                    { id: 'UNCOUNTED', label: `Belum Diisi (${scopedOpnameEntries.filter((e) => !e.hasCount).length})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        sound.playTap();
                        setOpnameStatusFilter(tab.id as any);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                        opnameStatusFilter === tab.id
                          ? tab.id === 'DISCREPANT'
                            ? 'bg-amber-600 text-white font-bold shadow-2xs'
                            : 'bg-slate-900 text-white font-bold shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="text-[11px] text-slate-500 font-medium">
                  Menampilkan <strong className="text-slate-800">{filteredOpnameRows.length}</strong> SKU
                </div>
              </div>
            </div>

            {/* Interactive Physical Count Spreadsheet Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
                    <tr>
                      <th className="py-3 px-3 w-8 text-center">#</th>
                      <th className="py-3 px-4 min-w-[220px]">Nama Produk, Batch &amp; SKU</th>
                      <th className="py-3 px-3">Satuan</th>
                      <th className="py-3 px-3">Harga Modal</th>
                      <th className="py-3 px-3 text-center">Stok Sistem</th>
                      <th className="py-3 px-4 min-w-[170px] text-center bg-sky-50/70 border-x border-sky-100 text-sky-900">
                        Input Stok Fisik
                      </th>
                      <th className="py-3 px-3 text-center">Selisih Fisik</th>
                      <th className="py-3 px-3 text-right">Nilai Selisih (Rp)</th>
                      <th className="py-3 px-4 min-w-[200px]">Alasan Penyesuaian</th>
                      <th className="py-3 px-4 min-w-[150px]">Catatan Baris</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOpnameRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-400">
                          Tidak ada produk sesuai filter atau kategori yang dipilih.
                        </td>
                      </tr>
                    ) : (
                      filteredOpnameRows.map((entry, idx) => {
                        const {
                          product,
                          batches,
                          hasBatchLevelCount,
                          batchDetails,
                          hasCount,
                          physicalVal,
                          difference,
                          differenceValue,
                          isDiscrepant,
                          reason,
                          notes,
                        } = entry;
                        const isZeroSystem = product.stockInBaseUnit <= 0;
                        const hasBatches = batches.length > 0;
                        const isExpanded = hasBatches && (expandedOpnameProducts[product.id] ?? expandAllBatches);

                        return (
                          <React.Fragment key={product.id}>
                            <tr
                              className={`hover:bg-slate-50/80 transition-colors ${
                                isDiscrepant
                                  ? difference < 0
                                    ? 'bg-rose-50/30'
                                    : 'bg-emerald-50/30'
                                  : hasCount
                                  ? 'bg-slate-50/40'
                                  : ''
                              }`}
                            >
                              {/* Number */}
                              <td className="py-3 px-3 text-center text-slate-400 font-mono text-xs">
                                {idx + 1}
                              </td>

                              {/* Product Info + Batch Toggle */}
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                  <span>{product.name}</span>
                                  {hasBatchLevelCount && (
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9.5px] font-black uppercase">
                                      Per-Batch Aktif
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1.5 mt-0.5 flex-wrap">
                                  <span>SKU: {product.barcode}</span>
                                  <span>·</span>
                                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded text-[10px] font-sans">
                                    {product.category}
                                  </span>
                                  {hasBatches && (
                                    <button
                                      type="button"
                                      onClick={() => toggleProductBatchExpand(product.id)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-sans font-bold cursor-pointer"
                                    >
                                      <Layers className="w-3 h-3" />
                                      <span>{batches.length} Batch FIFO</span>
                                      {isExpanded ? (
                                        <ChevronUp className="w-3 h-3" />
                                      ) : (
                                        <ChevronDown className="w-3 h-3" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* Base Unit */}
                              <td className="py-3 px-3 font-mono font-bold text-slate-700">
                                {product.baseUnit}
                              </td>

                              {/* Cost Price */}
                              <td className="py-3 px-3 font-mono text-slate-600">
                                {formatRupiah(product.costPrice)}
                              </td>

                              {/* System Stock */}
                              <td className="py-3 px-3 text-center font-mono">
                                <span className={`px-2.5 py-1 rounded-lg font-bold ${
                                  isZeroSystem ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800'
                                }`}>
                                  {formatNumber(product.stockInBaseUnit)}
                                </span>
                              </td>

                              {/* Physical Input (Interactive) */}
                              <td className="py-2.5 px-4 bg-sky-50/30 border-x border-sky-100">
                                {hasBatchLevelCount ? (
                                  <div className="text-center space-y-0.5">
                                    <div className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-200 font-mono font-black text-sm text-indigo-900">
                                      {formatNumber(physicalVal)}
                                    </div>
                                    <div className="text-[10px] font-semibold text-indigo-700">
                                      Total {batches.length} batch
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1 justify-center">
                                    <button
                                      type="button"
                                      onClick={() => handleStepCount(product.id, -1)}
                                      className="w-7 h-7 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 active:scale-95"
                                      title="Kurang 1"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => {
                                        sound.playTap();
                                        const currentVal = physicalCounts[product.id]?.physicalCount !== '' && physicalCounts[product.id]?.physicalCount !== undefined
                                          ? Number(physicalCounts[product.id].physicalCount)
                                          : product.stockInBaseUnit;
                                        setActiveKeypad({
                                          title: 'Hitung Fisik (Stock Opname)',
                                          subtitle: `${product.name} (${product.barcode})`,
                                          initialValue: currentVal,
                                          unitName: product.baseUnit,
                                          onConfirm: (val) => handlePhysicalCountChange(product.id, String(val)),
                                        });
                                      }}
                                      className={`w-20 text-center py-1.5 px-2 rounded-lg font-mono font-black text-sm border focus:outline-none cursor-pointer transition-all active:scale-95 ${
                                        hasCount
                                          ? isDiscrepant
                                            ? difference < 0
                                              ? 'border-rose-400 bg-rose-50/80 text-rose-800'
                                              : 'border-emerald-400 bg-emerald-50/80 text-emerald-800'
                                            : 'border-slate-300 bg-white text-slate-900'
                                          : 'border-dashed border-slate-300 bg-white text-slate-400'
                                      }`}
                                      title="Sentuh untuk Input via Numpad Layar Sentuh Tablet"
                                    >
                                      {physicalCounts[product.id]?.physicalCount !== undefined && physicalCounts[product.id]?.physicalCount !== ''
                                        ? physicalCounts[product.id].physicalCount
                                        : <span className="text-slate-400 font-normal">{product.stockInBaseUnit}</span>}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => handleStepCount(product.id, 1)}
                                      className="w-7 h-7 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 active:scale-95"
                                      title="Tambah 1"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </td>

                              {/* Discrepancy Badge */}
                              <td className="py-3 px-3 text-center">
                                {!hasCount ? (
                                  <span className="text-[10px] text-slate-400 italic">Belum diisi</span>
                                ) : difference === 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                                    <Check className="w-3 h-3 text-slate-500" />
                                    <span>0 Cocok</span>
                                  </span>
                                ) : difference < 0 ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-mono">
                                    <TrendingDown className="w-3 h-3 text-rose-600" />
                                    <span>{difference} {product.baseUnit}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-mono">
                                    <span>+{difference} {product.baseUnit}</span>
                                  </span>
                                )}
                              </td>

                              {/* Difference Value in Rupiah */}
                              <td className="py-3 px-3 text-right font-mono font-bold">
                                {!hasCount ? (
                                  <span className="text-slate-300">-</span>
                                ) : difference === 0 && differenceValue === 0 ? (
                                  <span className="text-slate-400">Rp 0</span>
                                ) : differenceValue < 0 ? (
                                  <span className="text-rose-600">{formatRupiah(differenceValue)}</span>
                                ) : (
                                  <span className="text-emerald-600">+{formatRupiah(differenceValue)}</span>
                                )}
                              </td>

                              {/* Reason Selector */}
                              <td className="py-2.5 px-4">
                                <select
                                  value={reason}
                                  disabled={!hasCount || !isDiscrepant}
                                  onChange={(e) => handleReasonChange(product.id, e.target.value)}
                                  className={`w-full py-1.5 px-2.5 rounded-lg border text-xs focus:outline-none ${
                                    !hasCount || !isDiscrepant
                                      ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                                      : 'bg-white border-amber-300 text-amber-900 font-medium focus:border-amber-500'
                                  }`}
                                >
                                  {REASON_PRESETS.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                                </select>
                              </td>

                              {/* Row Notes */}
                              <td className="py-2.5 px-4">
                                <input
                                  type="text"
                                  value={notes}
                                  onChange={(e) => handleNotesChange(product.id, e.target.value)}
                                  placeholder="Keterangan..."
                                  className="w-full py-1.5 px-2.5 rounded-lg border border-slate-200 text-xs bg-white focus:outline-none focus:border-sky-500"
                                />
                              </td>
                            </tr>

                            {/* Expandable Multi-Batch Sub-Rows */}
                            {isExpanded &&
                              batches.map((batch) => {
                                const rawVal = batchCounts[product.id]?.[batch.id];
                                const batchEntered = rawVal !== '' && rawVal !== undefined;
                                const sysQty = batch.remainingQuantity || 0;
                                const physQty = batchEntered ? Number(rawVal) : sysQty;
                                const bDetail = batchDetails?.find((d) => d.batchId === batch.id);
                                const bDiff = batchEntered ? physQty - sysQty : (bDetail?.difference || 0);
                                const unitCost = batch.costPrice ?? product.costPrice;
                                const bDiffVal = bDiff * unitCost;

                                return (
                                  <tr
                                    key={`${product.id}_${batch.id}`}
                                    className="bg-indigo-50/40 text-xs border-b border-indigo-100/70"
                                  >
                                    <td className="py-2 px-3 text-center text-indigo-400 font-mono">
                                      ↳
                                    </td>
                                    <td className="py-2 px-4 pl-7">
                                      <div className="font-mono font-bold text-indigo-950 flex items-center gap-1.5 flex-wrap">
                                        <span>Batch: {batch.batchNumber || batch.id}</span>
                                        {batch.expiryDate && (
                                          <span className="px-1.5 py-0.2 rounded bg-white border border-slate-200 text-[10px] font-normal text-slate-600">
                                            Exp: {formatDateOnly(batch.expiryDate)}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-[10px] text-slate-500 mt-0.5">
                                        Masuk: {formatDateOnly(batch.receivedAt)} · Awal: {formatNumber(batch.initialQuantity)} {product.baseUnit}
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 font-mono text-slate-500">
                                      {product.baseUnit}
                                    </td>
                                    <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                                      {formatRupiah(unitCost)}
                                    </td>
                                    <td className="py-2 px-3 text-center font-mono">
                                      <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-bold text-slate-700">
                                        {formatNumber(sysQty)}
                                      </span>
                                    </td>
                                    <td className="py-2 px-4 bg-indigo-50/70 border-x border-indigo-100">
                                      <div className="flex items-center gap-1 justify-center">
                                        <button
                                          type="button"
                                          onClick={() => handleStepBatchCount(product.id, batch.id, -1)}
                                          className="w-6 h-6 rounded-md bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-800 font-bold flex items-center justify-center shrink-0 cursor-pointer"
                                          title="Kurang 1 batch"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            sound.playTap();
                                            setActiveKeypad({
                                              title: `Hitung Batch ${batch.batchNumber || batch.id}`,
                                              subtitle: `${product.name} · HPP ${formatRupiah(unitCost)}/${product.baseUnit}`,
                                              initialValue: physQty,
                                              unitName: product.baseUnit,
                                              onConfirm: (val) =>
                                                handleBatchCountChange(product.id, batch.id, String(val)),
                                            });
                                          }}
                                          className={`w-16 text-center py-1 px-1.5 rounded-md font-mono font-black text-xs border cursor-pointer ${
                                            batchEntered
                                              ? bDiff !== 0
                                                ? bDiff < 0
                                                  ? 'border-rose-400 bg-rose-50 text-rose-800'
                                                  : 'border-emerald-400 bg-emerald-50 text-emerald-800'
                                                : 'border-indigo-400 bg-white text-indigo-950'
                                              : 'border-dashed border-indigo-300 bg-white text-slate-400'
                                          }`}
                                          title="Sentuh untuk ubah stok fisik batch ini"
                                        >
                                          {batchEntered ? rawVal : sysQty}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleStepBatchCount(product.id, batch.id, 1)}
                                          className="w-6 h-6 rounded-md bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-800 font-bold flex items-center justify-center shrink-0 cursor-pointer"
                                          title="Tambah 1 batch"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </td>
                                    <td className="py-2 px-3 text-center font-mono text-[11px] font-bold">
                                      {!batchEntered && !hasBatchLevelCount ? (
                                        <span className="text-slate-400 italic">-</span>
                                      ) : bDiff === 0 ? (
                                        <span className="text-slate-500">0</span>
                                      ) : bDiff < 0 ? (
                                        <span className="text-rose-600">
                                          {bDiff} {product.baseUnit}
                                        </span>
                                      ) : (
                                        <span className="text-emerald-600">
                                          +{bDiff} {product.baseUnit}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-2 px-3 text-right font-mono text-[11px] font-bold">
                                      {!batchEntered && !hasBatchLevelCount ? (
                                        <span className="text-slate-300">-</span>
                                      ) : bDiffVal === 0 ? (
                                        <span className="text-slate-400">Rp 0</span>
                                      ) : bDiffVal < 0 ? (
                                        <span className="text-rose-600">{formatRupiah(bDiffVal)}</span>
                                      ) : (
                                        <span className="text-emerald-600">+{formatRupiah(bDiffVal)}</span>
                                      )}
                                    </td>
                                    <td colSpan={2} className="py-2 px-4 text-[10.5px] text-indigo-700/80">
                                      Audit FIFO batch individu (HPP {formatRupiah(unitCost)})
                                    </td>
                                  </tr>
                                );
                              })}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Execution Bar */}
            <div className="sticky bottom-4 z-20 bg-slate-900 text-white p-4 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800">
              <div className="space-y-0.5">
                <div className="text-xs text-slate-400 font-medium">
                  Ringkasan Penyesuaian Sesi ({sessionDocNumber}):
                </div>
                <div className="text-sm font-bold flex items-center gap-3 flex-wrap">
                  <span>
                    Diperiksa: <strong>{countedItemsCount}</strong> SKU
                  </span>
                  {countedCategoriesList.length > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-sky-300">
                        {countedCategoriesList.length} Kategori
                      </span>
                    </>
                  )}
                  {multiBatchCountedCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-indigo-300">
                        {multiBatchCountedCount} SKU Per-Batch
                      </span>
                    </>
                  )}
                  <span>·</span>
                  <span className={discrepantItems.length > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                    Selisih: <strong>{discrepantItems.length}</strong> SKU ({totalDiscrepantUnits > 0 ? `+${totalDiscrepantUnits}` : totalDiscrepantUnits} unit)
                  </span>
                  <span>·</span>
                  <span className={totalFinancialVariance < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                    Varians Modal: {totalFinancialVariance > 0 ? `+${formatRupiah(totalFinancialVariance)}` : formatRupiah(totalFinancialVariance)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={countedItemsCount === 0 || !canExecuteAdjustment}
                  onClick={() => {
                    sound.playTap();
                    setIsConfirmModalOpen(true);
                  }}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 ${
                    countedItemsCount === 0 || !canExecuteAdjustment
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95 shadow-emerald-900/40 cursor-pointer'
                  }`}
                  title={!canExecuteAdjustment ? 'Hanya Store Manager & Admin' : 'Terapkan penyesuaian stok massal'}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Terapkan Penyesuaian Stok Massal</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUBTAB 3: RIWAYAT STOCK OPNAME & AUDIT BERITA ACARA                 */}
        {/* =================================================================== */}
        {activeSubTab === 'OPNAME_HISTORY' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-5 h-5 text-emerald-600" />
                  <span>Riwayat Audit & Berita Acara Stock Opname</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Arsip permanen dari setiap sesi rekonsiliasi fisik yang pernah dilakukan, lengkap dengan rincian varians dan cetak Berita Acara.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setActiveSubTab('OPNAME_SESSION');
                }}
                className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buat Sesi Opname Baru</span>
              </button>
            </div>

            {/* List of Historical Opnames */}
            <div className="space-y-3">
              {stockOpnames.length === 0 ? (
                <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center space-y-2">
                  <ClipboardCheck className="w-10 h-10 text-slate-300 mx-auto" />
                  <div className="text-sm font-bold text-slate-700">Belum Ada Riwayat Stock Opname</div>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Mulai perhitungan fisik barang pertama kali pada tab "Sesi Stock Opname" untuk mencatat audit inventaris toko.
                  </p>
                </div>
              ) : (
                stockOpnames.map((record) => {
                  const dateFormatted = new Date(record.timestamp || record.date).toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  });

                  return (
                    <div
                      key={record.id}
                      className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-slate-900 text-sm bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                            {record.sessionNumber}
                          </span>
                          <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{dateFormatted}</span>
                          </span>
                          <span className="text-[10px] bg-sky-50 text-sky-800 font-bold px-2 py-0.5 rounded-md border border-sky-200">
                            {record.generalReason}
                          </span>
                          {record.auditMode === 'MULTI_BATCH' && (
                            <span className="text-[10px] bg-indigo-50 text-indigo-800 font-bold px-2 py-0.5 rounded-md border border-indigo-200">
                              Multi-Batch FIFO
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                          <span>
                            Auditor: <strong>{record.auditorName}</strong> ({record.auditorRole})
                          </span>
                          <span>·</span>
                          <span>
                            Total SKU Diaudit: <strong>{record.totalItemsAudited}</strong>
                          </span>
                          <span>·</span>
                          <span className={record.totalDiscrepancies > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                            Selisih: {record.totalDiscrepancies} SKU
                          </span>
                          <span>·</span>
                          <span className={`font-mono font-bold ${
                            record.totalDifferenceValue < 0 
                              ? 'text-rose-600' 
                              : record.totalDifferenceValue > 0 
                              ? 'text-emerald-600' 
                              : 'text-slate-700'
                          }`}>
                            Varians: {record.totalDifferenceValue > 0 ? `+${formatRupiah(record.totalDifferenceValue)}` : formatRupiah(record.totalDifferenceValue)}
                          </span>
                        </div>

                        {record.auditedCategories && record.auditedCategories.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 text-[10px]">
                            <span className="text-slate-500 font-semibold">Kategori Audit:</span>
                            {record.auditedCategories.map((cat) => (
                              <span
                                key={cat}
                                className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium"
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}

                        {record.notes && (
                          <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl italic border border-slate-100">
                            "{record.notes}"
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setSelectedHistoricalOpname(record);
                          }}
                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                        >
                          <FileText className="w-3.5 h-3.5 text-slate-600" />
                          <span>Berita Acara & Detail</span>
                        </button>

                        {onDeleteStockOpname && canExecuteAdjustment && (
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setDeletingOpname(record);
                              setDeleteOpnameReason('');
                              setDeleteOpnameResponsibleId(currentUser.id);
                              setRevertStockOnOpnameDelete(true);
                              setDeleteOpnameError('');
                            }}
                            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap"
                            title="Hapus sesi Stock Opname dengan catatan audit"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUBTAB 4: DEMAND FORECASTING (PREDIKSI KEBUTUHAN & RESTOCK PROAKTIF)*/}
        {/* =================================================================== */}
        {activeSubTab === 'FORECASTING' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* KPI Overview for Forecasting */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Produk Teranalisis
                </div>
                <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1">
                  {demandForecastingList.length} SKU
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Berdasarkan riwayat transaksi 30 hari</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-2xs bg-rose-50/20">
                <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Kritis / Bawah Ambang</span>
                </div>
                <div className="text-xl md:text-2xl font-black text-rose-600 font-mono mt-1">
                  {demandForecastingList.filter((i) => i.urgency === 'CRITICAL_ZERO' || i.urgency === 'CRITICAL_MIN').length} SKU
                </div>
                <div className="text-[10px] text-rose-600/80 mt-0.5">Perlu restock hari ini juga</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-2xs bg-amber-50/20">
                <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Ambang Min &lt; 7 Hari</span>
                </div>
                <div className="text-xl md:text-2xl font-black text-amber-700 font-mono mt-1">
                  {demandForecastingList.filter((i) => i.urgency === 'DUE_SOON_3D' || i.urgency === 'WARNING_7D').length} SKU
                </div>
                <div className="text-[10px] text-amber-600 mt-0.5">Mendekati ambang batas minimum</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-2xs bg-emerald-50/20">
                <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Stok Aman (&gt; 7 Hari)</span>
                </div>
                <div className="text-xl md:text-2xl font-black text-emerald-700 font-mono mt-1">
                  {demandForecastingList.filter((i) => i.urgency === 'SAFE').length} SKU
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">Kapasitas persediaan stabil</div>
              </div>
            </div>

            {/* Forecasting Filter Bar */}
            <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={forecastingSearch}
                  onChange={(e) => setForecastingSearch(e.target.value)}
                  placeholder="Cari produk, kategori, atau barcode untuk cek prediksi restock..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto shrink-0">
                {[
                  { id: 'ALL', label: 'Semua Produk' },
                  { id: 'CRITICAL', label: 'Kritis (Hari Ini)' },
                  { id: 'SOON_7D', label: 'Menipis (< 7 Hari)' },
                  { id: 'SAFE', label: 'Aman' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      sound.playTap();
                      setForecastingUrgency(tab.id as any);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      forecastingUrgency === tab.id
                        ? 'bg-indigo-600 text-white font-bold shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Supplier Lead Time & Safety Stock Automated Restock Parameters */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3.5 flex-wrap">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  <span>Parameter Otomasi Restock Supplier:</span>
                </span>

                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <span className="text-slate-600 font-semibold">Lead Time Supplier:</span>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={leadTimeDays}
                    onChange={(e) => setLeadTimeDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 p-1 bg-white border border-slate-300 rounded text-center font-bold font-mono focus:outline-none"
                  />
                  <span className="text-slate-400">Hari</span>
                </div>

                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <span className="text-slate-600 font-semibold">Target Stok Pengaman:</span>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={safetyStockDays}
                    onChange={(e) => setSafetyStockDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 p-1 bg-white border border-slate-300 rounded text-center font-bold font-mono focus:outline-none"
                  />
                  <span className="text-slate-400">Hari</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-[11px] text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-200 font-medium">
                  Total Buffer: <strong>{leadTimeDays + safetyStockDays} Hari</strong> penjualan harian
                </div>
              </div>
            </div>

            {/* Forecasting Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-indigo-400" />
                    <span>Tabel Analisis Prediksi Permintaan (Demand Forecasting)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Perhitungan otomatis rekomendasi restock berdasarkan rata-rata laju jual harian (daily velocity) dan lead time supplier {leadTimeDays} hari.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setIsDraftPOModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer border border-emerald-400/40"
                    title="Generate Draft Surat Pesanan (PO) Otomatis Berdasarkan Laju Jual & Lead Time"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Generate Draft PO Otomatis</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportStockPdf}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 shadow-xs flex items-center gap-1.5 cursor-pointer"
                    title="Ekspor Laporan Demand Forecasting & Rekomendasi PO ke PDF (jsPDF)"
                  >
                    <FileDown className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Ekspor PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={onNavigateToSuppliers}
                    className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Buka Modul Supplier & PO</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Produk</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4 text-center">Stok Saat Ini</th>
                      <th className="py-3 px-4 text-center">Laju Jual Harian</th>
                      <th className="py-3 px-4 text-center">Prediksi Capai Batas Min</th>
                      <th className="py-3 px-4 text-center">Rekomendasi Restock</th>
                      <th className="py-3 px-4 text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredForecastingList.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-10 text-center text-slate-400">
                          Tidak ada produk sesuai filter prediksi.
                        </td>
                      </tr>
                    ) : (
                      filteredForecastingList.map((item) => {
                        const { product, dailyVelocity, currentStock, minAlert, daysUntilMinThreshold, recommendedReorderQty, urgency } = item;
                        return (
                          <tr key={product.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{product.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{product.barcode}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700">
                                {product.category}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center font-mono">
                              <span className={`font-bold ${
                                urgency === 'CRITICAL_ZERO'
                                  ? 'text-rose-600'
                                  : urgency === 'CRITICAL_MIN'
                                  ? 'text-amber-700'
                                  : 'text-slate-800'
                              }`}>
                                {currentStock} {product.baseUnit}
                              </span>
                              <div className="text-[10px] text-slate-400">Min: {minAlert} {product.baseUnit}</div>
                            </td>
                            <td className="py-3 px-4 text-center font-mono">
                              {dailyVelocity > 0 ? (
                                <div>
                                  <span className="font-bold text-slate-800">{dailyVelocity.toFixed(1)} {product.baseUnit}</span>
                                  <div className="text-[10px] text-slate-400">/ hari (30d)</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs italic">Belum ada transaksi</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {urgency === 'CRITICAL_ZERO' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-black animate-pulse shadow-xs">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  <span>STOK HABIS (0)</span>
                                </span>
                              ) : urgency === 'CRITICAL_MIN' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Di Bawah Ambang Min!</span>
                                </span>
                              ) : urgency === 'DUE_SOON_3D' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold">
                                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                                  <span>Tersisa {daysUntilMinThreshold} hari</span>
                                </span>
                              ) : urgency === 'WARNING_7D' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-yellow-100 text-yellow-900 border border-yellow-300 text-[11px] font-semibold">
                                  <span>~{daysUntilMinThreshold} hari</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-medium">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Stok Stabil (&gt;14d)</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center font-mono">
                              {recommendedReorderQty > 0 ? (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold text-xs">
                                  +{recommendedReorderQty} {product.baseUnit}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={onNavigateToSuppliers}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors inline-flex items-center gap-1"
                                title="Buat PO Pemesanan ke Supplier"
                              >
                                <span>Pesan PO</span>
                                <ArrowRight className="w-3 h-3 text-sky-400" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUBTAB 5: PELACAKAN KADALUARSA (EXPIRED DATE TRACKER & REPORTS)    */}
        {/* =================================================================== */}
        {activeSubTab === 'EXPIRY_TRACKER' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* 30-Day Expiring Clearance & Discount Module */}
            <ExpiringClearanceModule
              products={products}
              storeSettings={storeSettings}
              currentUserRole={currentUserRole}
              onUpdateProduct={onUpdateProduct}
              onAdjustStockForProduct={(p, reason) => {
                setAdjustingProduct(p);
                setStockAdjustmentVal(p.stockInBaseUnit.toString());
                setAdjustmentType('SET');
                setAdjustmentReason(reason);
              }}
            />

            {/* KPI Overview for Expiry Tracking */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Total Dipantau
                </div>
                <div className="text-xl md:text-2xl font-black text-slate-900 mt-1 font-mono">
                  {expiryAnalytics.totalTracked} <span className="text-xs font-semibold text-slate-500">SKU</span>
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Produk fisik ber-expired date</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-rose-200 bg-rose-50/20 shadow-2xs">
                <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Sudah Kadaluarsa</span>
                </div>
                <div className="text-xl md:text-2xl font-black text-rose-600 mt-1 font-mono">
                  {expiryAnalytics.expiredItems.length} <span className="text-xs font-semibold text-rose-500">SKU</span>
                </div>
                <div className="text-[10px] text-rose-600/80 mt-0.5">Harus segera ditarik / dimusnahkan</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-amber-200 bg-amber-50/20 shadow-2xs">
                <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Kritis (&le; 7 Hari)</span>
                </div>
                <div className="text-xl md:text-2xl font-black text-amber-700 mt-1 font-mono">
                  {expiryAnalytics.expiringIn7Days.length} <span className="text-xs font-semibold text-amber-600">SKU</span>
                </div>
                <div className="text-[10px] text-amber-700/80 mt-0.5">Segera flash sale atau retur supplier</div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
                <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Aman (&gt; 30 Hari)</span>
                </div>
                <div className="text-xl md:text-2xl font-black text-emerald-700 mt-1 font-mono">
                  {expiryAnalytics.safeItems.length} <span className="text-xs font-semibold text-emerald-600">SKU</span>
                </div>
                <div className="text-[10px] text-emerald-700/80 mt-0.5">Masa simpan produk masih panjang</div>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={expirySearch}
                    onChange={(e) => setExpirySearch(e.target.value)}
                    placeholder="Cari nama produk kadaluarsa, barcode, atau kategori..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
                  {[
                    { id: 'ALL', label: `Semua (${expiryAnalytics.totalTracked})` },
                    { id: 'EXPIRED', label: `Kadaluarsa (${expiryAnalytics.expiredItems.length})`, color: 'text-rose-700 bg-rose-50 border-rose-200' },
                    { id: 'CRITICAL_7D', label: `Kritis 7 Hari (${expiryAnalytics.expiringIn7Days.length})`, color: 'text-amber-800 bg-amber-50 border-amber-200' },
                    { id: 'WARNING_30D', label: `Mendekati 30 Hari (${expiryAnalytics.expiringIn30Days.length})` },
                    { id: 'SAFE', label: `Aman (${expiryAnalytics.safeItems.length})` },
                  ].map((filterTab) => (
                    <button
                      key={filterTab.id}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setExpiryStatusFilter(filterTab.id as any);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                        expiryStatusFilter === filterTab.id
                          ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {filterTab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table of Expiring Products */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Produk</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4">Sisa Stok</th>
                      <th className="py-3 px-4">Tanggal Kadaluarsa</th>
                      <th className="py-3 px-4">Status &amp; Sisa Waktu</th>
                      <th className="py-3 px-4 text-right">Aksi Cepat</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredExpiryProducts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-12 text-slate-400 space-y-2">
                          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                          <p className="text-sm font-bold text-slate-700">Tidak ada produk dalam filter ini!</p>
                          <p className="text-xs text-slate-400">
                            Semua stok dalam kondisi masa simpan yang baik atau belum diatur tanggal kadaluarsanya.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredExpiryProducts.map((p) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const expDate = new Date(p.expiryDate!);
                        const isExpired = expDate < today;
                        const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        const is7Days = !isExpired && diffDays <= 7;
                        const is30Days = !isExpired && diffDays <= 30;

                        return (
                          <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{p.name}</div>
                              <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                                <span>SKU: {p.sku || p.barcode}</span>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                {p.category}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-slate-800">
                              {formatNumber(p.stockInBaseUnit)} {p.baseUnit}
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              <span className="flex items-center gap-1.5">
                                <CalendarDays className="w-3.5 h-3.5 text-slate-400" />
                                <span>{p.expiryDate}</span>
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              {isExpired ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-100 text-rose-700 border border-rose-300 shadow-2xs animate-pulse">
                                  <ShieldAlert className="w-3 h-3" />
                                  <span>KADALUARSA (LEWAT {Math.abs(diffDays)} HARI)</span>
                                </span>
                              ) : is7Days ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>KRITIS (SISA {diffDays} HARI)</span>
                                </span>
                              ) : is30Days ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  <span>Waspada (Sisa {diffDays} Hari)</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check className="w-3 h-3" />
                                  <span>Aman ({diffDays} Hari)</span>
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {onInitiateRestockForProduct && (
                                  <button
                                    type="button"
                                    onClick={() => onInitiateRestockForProduct(p, Math.max(1, (p.minStockAlert * 2) - p.stockInBaseUnit))}
                                    className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-xs shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    <Truck className="w-3 h-3" />
                                    <span>Pesan PO</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    setAdjustingProduct(p);
                                    setStockAdjustmentVal(p.stockInBaseUnit.toString());
                                    setAdjustmentType('SET');
                                    setAdjustmentReason('Pemusnahan Barang Kadaluarsa');
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 rounded-lg font-bold text-xs transition-colors border border-slate-200"
                                >
                                  Sesuaikan Stok
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
          </div>
        )}

        {/* =================================================================== */}
        {/* SUBTAB: OPTIMAL REORDER QUANTITY REPORT (HISTORICAL DEMAND)         */}
        {/* =================================================================== */}
        {activeSubTab === 'REORDER_REPORT' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-white p-4 rounded-2xl border border-cyan-200 shadow-2xs">
                <div className="text-[11px] font-bold text-cyan-700 uppercase">Perlu Reorder Sekarang</div>
                <div className="text-2xl font-black text-slate-900 font-mono mt-1">
                  {formatNumber(optimalReorderList.filter((r) => r.needsReorder).length)}{' '}
                  <span className="text-xs font-bold text-slate-400">SKU</span>
                </div>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Di bawah Reorder Point (ROP)</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Total Unit Reorder Disarankan</div>
                <div className="text-2xl font-black text-cyan-700 font-mono mt-1">
                  {formatNumber(filteredOptimalReorderList.reduce((acc, r) => acc + r.optimalReorderQty, 0))}
                </div>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Siklus {reorderCycleDays} hari + Safety {reorderSafetyDays} hari</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-2xs">
                <div className="text-[11px] font-bold text-emerald-700 uppercase">Estimasi Anggaran PO</div>
                <div className="text-xl md:text-2xl font-black text-emerald-700 font-mono mt-1">
                  {formatRupiah(filteredOptimalReorderList.reduce((acc, r) => acc + r.estimatedOrderCost, 0))}
                </div>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Berdasarkan harga modal pokok saat ini</p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500 uppercase">Produk Memiliki Histori Jual</div>
                <div className="text-2xl font-black text-slate-900 font-mono mt-1">
                  {formatNumber(optimalReorderList.filter((r) => r.historicalSold > 0).length)}{' '}
                  <span className="text-xs font-bold text-slate-400">/ {optimalReorderList.length}</span>
                </div>
                <p className="text-[10.5px] text-slate-500 mt-0.5">Periode data {reorderLookbackDays} hari terakhir</p>
              </div>
            </div>

            {/* Parameters & Action Controls */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-cyan-600" />
                    <span>Parameter Perhitungan Optimal Reorder Quantity</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    ROP = (Rata-rata Harian × Lead Time) + (Rata-rata Harian × Buffer) + Cadangan Fluktuasi Permintaan (95% Service Level)
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportOptimalReorderCsv}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Ekspor CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportStockPdf}
                    className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <FileDown className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Ekspor PDF</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Histori Penjualan</label>
                  <select
                    value={reorderLookbackDays}
                    onChange={(e) => setReorderLookbackDays(Number(e.target.value) as 30 | 60 | 90)}
                    className="w-full p-2 rounded-xl border border-slate-300 bg-slate-50 font-bold text-slate-800"
                  >
                    <option value={30}>30 Hari Terakhir</option>
                    <option value={60}>60 Hari Terakhir</option>
                    <option value={90}>90 Hari Terakhir</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Lead Time Supplier (Hari)</label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={reorderLeadTimeDays}
                    onChange={(e) => setReorderLeadTimeDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2 rounded-xl border border-slate-300 bg-slate-50 font-mono font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Siklus Pembelian / Order (Hari)</label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={reorderCycleDays}
                    onChange={(e) => setReorderCycleDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full p-2 rounded-xl border border-slate-300 bg-slate-50 font-mono font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Safety Buffer Tambahan (Hari)</label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={reorderSafetyDays}
                    onChange={(e) => setReorderSafetyDays(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full p-2 rounded-xl border border-slate-300 bg-slate-50 font-mono font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Filters Row */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 pt-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={reorderSearch}
                    onChange={(e) => setReorderSearch(e.target.value)}
                    placeholder="Cari nama produk, SKU, atau kategori..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs focus:outline-none focus:border-cyan-500 focus:bg-white"
                  />
                </div>

                <select
                  value={reorderSupplierFilter}
                  onChange={(e) => setReorderSupplierFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"
                >
                  <option value="ALL">Semua Supplier</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      Supplier: {s.name}
                    </option>
                  ))}
                  <option value="NONE">Tanpa Supplier Tetap</option>
                </select>

                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                  {[
                    { key: 'ALL' as const, label: 'Semua' },
                    { key: 'NEED_REORDER' as const, label: 'Perlu Reorder' },
                    { key: 'WITH_HISTORY' as const, label: 'Ada Penjualan' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setReorderFilterMode(f.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        reorderFilterMode === f.key
                          ? 'bg-cyan-700 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Optimal Reorder Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Produk &amp; Supplier</th>
                      <th className="py-3 px-4">Stok &amp; Ketahanan</th>
                      <th className="py-3 px-4">Terjual ({reorderLookbackDays}h)</th>
                      <th className="py-3 px-4">Rata-rata / Hari</th>
                      <th className="py-3 px-4">Reorder Point (ROP)</th>
                      <th className="py-3 px-4">Optimal Reorder Qty</th>
                      <th className="py-3 px-4">Est. Biaya Order</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOptimalReorderList.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-400">
                          Tidak ada produk yang sesuai filter laporan reorder ini.
                        </td>
                      </tr>
                    ) : (
                      paginatedReorderList.map((r) => (
                        <tr
                          key={r.product.id}
                          className={
                            r.needsReorder
                              ? 'bg-cyan-50/40 hover:bg-cyan-50/80'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{r.product.name}</div>
                            <div className="text-[10.5px] text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="font-mono">{r.product.sku || r.product.barcode}</span>
                              <span>•</span>
                              <span className="font-semibold text-sky-700">
                                {r.supplier ? r.supplier.name : 'Supplier Umum'}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono">
                            <div
                              className={`font-black ${
                                r.product.stockInBaseUnit <= 0
                                  ? 'text-rose-600'
                                  : r.needsReorder
                                  ? 'text-amber-700'
                                  : 'text-slate-900'
                              }`}
                            >
                              {formatNumber(r.product.stockInBaseUnit)} {r.product.baseUnit}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {r.daysOfCover >= 999
                                ? 'Cukup (>99 hari)'
                                : `Tahan ~${r.daysOfCover} hari`}
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono">
                            <div className="font-bold text-slate-800">
                              {formatNumber(r.historicalSold)} {r.product.baseUnit}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {r.txFrequency} transaksi
                            </div>
                          </td>

                          <td className="py-3 px-4 font-mono">
                            <div className="font-bold text-indigo-700">
                              {r.avgDailyDemand} {r.product.baseUnit}/hr
                            </div>
                            {r.dailyStdDev > 0 && (
                              <div className="text-[10px] text-slate-400">σ ±{r.dailyStdDev}</div>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono">
                            <div className="font-bold text-slate-800">
                              {formatNumber(r.reorderPoint)} {r.product.baseUnit}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Target Maks: {formatNumber(r.targetMaxStock)}
                            </div>
                          </td>

                          <td className="py-3 px-4">
                            {r.optimalReorderQty > 0 ? (
                              <div>
                                <span className="px-2.5 py-1 rounded-lg bg-cyan-700 text-white font-mono font-black text-xs inline-block">
                                  +{formatNumber(r.optimalReorderQty)} {r.product.baseUnit}
                                </span>
                                {r.packSuggestion !== `${formatNumber(r.optimalReorderQty)} ${r.product.baseUnit}` && (
                                  <div className="text-[10px] font-bold text-cyan-800 mt-1">
                                    ≈ {r.packSuggestion}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10.5px] font-bold">
                                Stok Optimal
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {r.optimalReorderQty > 0 ? formatRupiah(r.estimatedOrderCost) : '-'}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                if (onInitiateRestockForProduct && r.optimalReorderQty > 0) {
                                  onInitiateRestockForProduct(r.product, r.optimalReorderQty);
                                } else {
                                  onNavigateToSuppliers();
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <Truck className="w-3.5 h-3.5" />
                              <span>Order PO</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {filteredOptimalReorderList.length > STOCK_PAGE_SIZE && (
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
                  <span>
                    Menampilkan{' '}
                    <strong className="text-slate-900">
                      {(safeReorderPage - 1) * STOCK_PAGE_SIZE + 1}–{Math.min(safeReorderPage * STOCK_PAGE_SIZE, filteredOptimalReorderList.length)}
                    </strong>{' '}
                    dari <strong className="text-slate-900">{filteredOptimalReorderList.length}</strong> produk
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={safeReorderPage <= 1}
                      onClick={() => {
                        sound.playTap();
                        setReorderPage((p) => Math.max(1, p - 1));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      Sebelumnya
                    </button>
                    <span className="px-2.5 font-mono font-bold text-slate-800">
                      Hal {safeReorderPage} / {reorderTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safeReorderPage >= reorderTotalPages}
                      onClick={() => {
                        sound.playTap();
                        setReorderPage((p) => Math.min(reorderTotalPages, p + 1));
                      }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* SUBTAB: HEATMAP PERPUTARAN STOK (30 HARI TERAKHIR)                  */}
        {/* =================================================================== */}
        {activeSubTab === 'STOCK_HEATMAP' && (
          <StockTurnoverHeatmap
            products={products}
            transactions={transactions}
            onInitiateRestockForProduct={onInitiateRestockForProduct}
            onSelectProductForMonitoring={(prod) => {
              setSearch(prod.name);
              setActiveSubTab('MONITORING');
            }}
          />
        )}

        {/* =================================================================== */}
        {/* SUBTAB: RINGKASAN PERGERAKAN STOK BULANAN & AUDIT PDF               */}
        {/* =================================================================== */}
        {activeSubTab === 'MONTHLY_AUDIT' && (
          <div className="space-y-5 animate-in fade-in duration-150">
            {/* Control & PDF Action Header Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <FileDown className="w-5 h-5 text-indigo-600 shrink-0" />
                    <span>Ringkasan Pergerakan Stok Bulanan &amp; Generator PDF Audit</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Konsolidasi otomatis total stok masuk (Purchase Order selesai), stok keluar (penjualan POS), dan selisih penyesuaian Stock Opname per bulan untuk audit gudang resmi.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await generateMonthlyStockMovementPdf({
                      data: monthlyAuditData,
                      storeSettings: storeSettings || INITIAL_STORE_SETTINGS,
                      auditorName: currentUser.name,
                      categoryFilter: auditCategoryFilter,
                      onlyWithMovement: auditOnlyWithMovement,
                    });
                    sound.playSuccessChime();
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-sm whitespace-nowrap shrink-0 cursor-pointer transition-colors self-start lg:self-auto"
                >
                  <FileDown className="w-4 h-4 text-sky-400" />
                  <span>Generate PDF Audit ({monthlyAuditData.monthLabel})</span>
                </button>
              </div>

              {/* Filter Toolbar */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-4 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Periode Bulan Audit
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <input
                      type="month"
                      value={auditMonthKey}
                      onChange={(e) => {
                        if (e.target.value) setAuditMonthKey(e.target.value);
                      }}
                      className="p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                    {[
                      { label: 'Bulan Ini', key: getCurrentMonthKey() },
                      { label: 'Bulan Lalu', key: shiftMonthKey(getCurrentMonthKey(), -1) },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setAuditMonthKey(preset.key);
                        }}
                        className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          auditMonthKey === preset.key
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Filter Kategori Produk
                  </label>
                  <select
                    value={auditCategoryFilter}
                    onChange={(e) => setAuditCategoryFilter(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:outline-none"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat === 'SEMUA' ? 'Semua Kategori' : cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    Cari Produk / SKU
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Nama produk atau SKU..."
                      className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 flex items-center pb-1">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={auditOnlyWithMovement}
                      onChange={(e) => {
                        sound.playTap();
                        setAuditOnlyWithMovement(e.target.checked);
                      }}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                    <span>Hanya yg bergerak</span>
                  </label>
                </div>
              </div>
            </div>

            {/* 4 Monthly Audit KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-emerald-700 flex items-center justify-between">
                  <span>Total Stok Masuk (PO)</span>
                  <span className="font-mono">{formatNumber(monthlyAuditData.totalCompletedPoCount)} PO</span>
                </div>
                <div className="text-2xl font-black font-mono text-emerald-700 tabular-nums">
                  +{formatNumber(monthlyAuditData.totalStockInUnits)} unit
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                  Nilai Belanja: {formatRupiah(monthlyAuditData.totalStockInValue)}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-sky-700 flex items-center justify-between">
                  <span>Total Stok Keluar (Jual)</span>
                  <span className="font-mono">{formatNumber(monthlyAuditData.totalSalesTxCount)} Nota</span>
                </div>
                <div className="text-2xl font-black font-mono text-sky-700 tabular-nums">
                  -{formatNumber(monthlyAuditData.totalStockOutUnits)} unit
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                  HPP FIFO: {formatRupiah(monthlyAuditData.totalStockOutCogs)}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-amber-700 flex items-center justify-between">
                  <span>Penyesuaian Opname</span>
                  <span className="font-mono">{formatNumber(monthlyAuditData.totalOpnameSessionCount)} Sesi</span>
                </div>
                <div
                  className={`text-2xl font-black font-mono tabular-nums ${
                    monthlyAuditData.totalOpnameNetUnits < 0
                      ? 'text-rose-700'
                      : monthlyAuditData.totalOpnameNetUnits > 0
                      ? 'text-emerald-700'
                      : 'text-slate-800'
                  }`}
                >
                  {monthlyAuditData.totalOpnameNetUnits > 0 ? '+' : ''}
                  {formatNumber(monthlyAuditData.totalOpnameNetUnits)} unit
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                  Selisih Nilai: {monthlyAuditData.totalOpnameNetValue > 0 ? '+' : ''}
                  {formatRupiah(monthlyAuditData.totalOpnameNetValue)} (+{formatNumber(monthlyAuditData.totalOpnamePositiveUnits)} / -{formatNumber(monthlyAuditData.totalOpnameNegativeUnits)})
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-600 flex items-center justify-between">
                  <span>Netto &amp; Valuasi Kini</span>
                  <span className="font-mono">{formatNumber(monthlyAuditData.activeMovedSkuCount)}/{formatNumber(monthlyAuditData.totalSkuCount)} SKU</span>
                </div>
                <div className="text-2xl font-black font-mono text-slate-900 tabular-nums">
                  {monthlyAuditData.totalNetMovementUnits > 0 ? '+' : ''}
                  {formatNumber(monthlyAuditData.totalNetMovementUnits)} unit
                </div>
                <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                  Aset Stok: {formatRupiah(monthlyAuditData.totalEndingValuation)}
                </div>
              </div>
            </div>

            {/* Interactive Preview Table of Monthly Stock Movement */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-900">
                  Pratinjau Pergerakan Stok Bulan {monthlyAuditData.monthLabel} ({formatNumber(filteredMonthlyAuditRows.length)} SKU)
                </div>
                <div className="text-[11px] text-slate-500">
                  Formula Netto = Stok Masuk (+) − Stok Keluar (−) + Penyesuaian Opname (±)
                </div>
              </div>

              <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Produk &amp; SKU</th>
                      <th className="py-2.5 px-3">Kategori</th>
                      <th className="py-2.5 px-3 text-right text-emerald-700">Masuk (+)</th>
                      <th className="py-2.5 px-3 text-right text-sky-700">Keluar (−)</th>
                      <th className="py-2.5 px-3 text-right text-amber-700">Opname (±)</th>
                      <th className="py-2.5 px-3 text-right">Netto Bln</th>
                      <th className="py-2.5 px-3 text-right">Stok Saat Ini</th>
                      <th className="py-2.5 px-3 text-right">Valuasi Modal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMonthlyAuditRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                          Tidak ada data pergerakan stok yang sesuai filter untuk bulan {monthlyAuditData.monthLabel}.
                        </td>
                      </tr>
                    ) : (
                      filteredMonthlyAuditRows.map((row) => (
                        <tr key={row.productId} className="hover:bg-slate-50/90">
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{row.productName}</div>
                            <div className="text-[10px] font-mono text-slate-500">{row.barcode}</div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">{row.category}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-emerald-700">
                            {row.stockInUnits > 0 ? `+${formatNumber(row.stockInUnits)}` : '0'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-sky-700">
                            {row.stockOutUnits > 0 ? `-${formatNumber(row.stockOutUnits)}` : '0'}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums ${
                              row.opnameAdjustmentUnits < 0
                                ? 'text-rose-700'
                                : row.opnameAdjustmentUnits > 0
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                            }`}
                          >
                            {row.opnameAdjustmentUnits > 0 ? '+' : ''}
                            {formatNumber(row.opnameAdjustmentUnits)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-black tabular-nums ${
                              row.netMovementUnits > 0
                                ? 'text-emerald-800'
                                : row.netMovementUnits < 0
                                ? 'text-rose-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {row.netMovementUnits > 0 ? '+' : ''}
                            {formatNumber(row.netMovementUnits)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                            {formatNumber(row.currentEndingStock)} {row.baseUnit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700 tabular-nums">
                            {formatRupiah(row.endingStockValuation)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Opname Audit Sessions inside Selected Month */}
            {monthlyAuditData.monthOpnames.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                    <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                    <span>Log Sesi Stock Opname Bulan {monthlyAuditData.monthLabel} ({monthlyAuditData.monthOpnames.length} Sesi)</span>
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Turut disertakan otomatis di halaman PDF Audit Bulanan
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-bold">
                      <tr>
                        <th className="py-2 px-3">No. Sesi</th>
                        <th className="py-2 px-3">Tanggal</th>
                        <th className="py-2 px-3">Auditor</th>
                        <th className="py-2 px-3">Jenis / Alasan</th>
                        <th className="py-2 px-3 text-right">SKU / Selisih</th>
                        <th className="py-2 px-3 text-right">Nilai Selisih</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {monthlyAuditData.monthOpnames.map((op) => (
                        <tr key={op.id}>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">{op.sessionNumber}</td>
                          <td className="py-2 px-3 font-mono text-slate-600">{op.date}</td>
                          <td className="py-2 px-3 text-slate-700">{op.auditorName}</td>
                          <td className="py-2 px-3 text-slate-600">{op.generalReason}</td>
                          <td className="py-2 px-3 text-right font-mono tabular-nums">
                            {formatNumber(op.totalItemsAudited)} SKU ({formatNumber(op.totalDiscrepancies)} selisih)
                          </td>
                          <td
                            className={`py-2 px-3 text-right font-mono font-bold tabular-nums ${
                              op.totalDifferenceValue < 0
                                ? 'text-rose-700'
                                : op.totalDifferenceValue > 0
                                ? 'text-emerald-700'
                                : 'text-slate-600'
                            }`}
                          >
                            {op.totalDifferenceValue > 0 ? '+' : ''}
                            {formatRupiah(op.totalDifferenceValue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* SUBTAB: STOCK TURN RATE & LIKUIDASI (>90 HARI)                      */}
        {/* =================================================================== */}
        {activeSubTab === 'TURNOVER' && (
          <div className="space-y-4">
            <TopBottomMovingProductsChart
              analysis={stockTurnoverAnalysis}
              lookbackDays={turnoverLookbackDays}
              onChangeLookbackDays={setTurnoverLookbackDays}
              onSelectProduct={(_productId, speedCategory) => {
                if (speedCategory !== 'OUT_OF_STOCK') {
                  setTurnoverSpeedFilter(speedCategory);
                }
              }}
            />
            <StockTurnRateModule
              analysis={stockTurnoverAnalysis}
              lookbackDays={turnoverLookbackDays}
              onChangeLookbackDays={setTurnoverLookbackDays}
              currentUserRole={currentUserRole}
              initialSpeedFilter={turnoverSpeedFilter}
              onUpdateProduct={onUpdateProduct}
              onNavigateToSuppliers={onNavigateToSuppliers}
            />
          </div>
        )}

      </div>

      {/* =================================================================== */}
      {/* MODAL 1: KONFIRMASI PENYESUAIAN STOK MASSAL                         */}
      {/* =================================================================== */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Konfirmasi Penyesuaian Stok Massal
                </h3>
              </div>
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1">
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Perhatian Manajerial:</span>
                </div>
                <p>
                  Tindakan ini akan langsung mengupdate nilai stok sistem di database untuk <strong>{countedItemsCount} produk</strong> dan mendokumentasikannya ke dalam riwayat Stock Opname <strong>{sessionDocNumber}</strong>.
                </p>
              </div>

              {/* Session Meta Preview */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-slate-500">Nomor Sesi:</span>{' '}
                  <strong className="font-mono text-slate-800">{sessionDocNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Tanggal:</span>{' '}
                  <strong className="text-slate-800">{sessionDate}</strong>
                </div>
                <div>
                  <span className="text-slate-500">User Penanggung Jawab:</span>{' '}
                  <strong className="text-slate-800">
                    {(availableResponsibleUsers.find((u) => u.id === opnameResponsibleUserId) || currentUser).name}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-500">Alasan:</span>{' '}
                  <strong className="text-slate-800">{sessionGeneralReason}</strong>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-500">Kategori Diaudit:</span>{' '}
                  <strong className="text-slate-800">
                    {Array.from(new Set([...selectedOpnameCategories, ...countedCategoriesList])).join(', ') || 'Semua'}
                  </strong>
                  {multiBatchCountedCount > 0 && (
                    <span className="ml-2 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                      {multiBatchCountedCount} SKU Per-Batch
                    </span>
                  )}
                </div>
              </div>

              {/* User Penanggung Jawab Selector */}
              <div className="bg-white p-3 rounded-2xl border border-slate-200">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5 mb-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>User Penanggung Jawab Audit Stock Opname</span>
                </label>
                <select
                  value={opnameResponsibleUserId}
                  onChange={(e) => setOpnameResponsibleUserId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                >
                  {availableResponsibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Nama penanggung jawab tercatat pada Berita Acara & Log Aktivitas Stock Opname.
                </p>
              </div>

              {/* Items with Discrepancy Preview */}
              <div>
                <div className="text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
                  <span>Daftar Barang Berselisih ({discrepantItems.length} SKU):</span>
                  <span className="font-mono font-bold text-slate-900">
                    Net Varians: {totalFinancialVariance > 0 ? `+${formatRupiah(totalFinancialVariance)}` : formatRupiah(totalFinancialVariance)}
                  </span>
                </div>

                {discrepantItems.length === 0 ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center text-xs text-emerald-800 font-bold">
                    Semua stok fisik yang dihitung sama persis dengan stok sistem! (Nol Selisih)
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-2">Produk</th>
                          <th className="p-2 text-center">Sistem → Fisik</th>
                          <th className="p-2 text-center">Selisih</th>
                          <th className="p-2 text-right">Nilai Selisih</th>
                          <th className="p-2">Alasan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {discrepantItems.map(({ product, physicalVal, difference, differenceValue, reason, batchDetails }) => (
                          <tr key={product.id} className="hover:bg-slate-50">
                            <td className="p-2 font-bold text-slate-800">
                              <div>{product.name}</div>
                              {batchDetails && batchDetails.length > 0 && (
                                <div className="mt-1 space-y-0.5 font-normal text-[10px] font-mono text-indigo-800">
                                  {batchDetails
                                    .filter((bd) => bd.difference !== 0)
                                    .map((bd) => (
                                      <div key={bd.batchId}>
                                        • {bd.batchNumber}: {bd.systemQty}→{bd.physicalQty} ({bd.difference > 0 ? `+${bd.difference}` : bd.difference})
                                      </div>
                                    ))}
                                </div>
                              )}
                            </td>
                            <td className="p-2 text-center font-mono">
                              {product.stockInBaseUnit} → <strong>{physicalVal}</strong> {product.baseUnit}
                            </td>
                            <td className="p-2 text-center font-mono font-bold">
                              <span className={difference < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                {difference > 0 ? `+${difference}` : difference}
                              </span>
                            </td>
                            <td className="p-2 text-right font-mono font-bold">
                              <span className={differenceValue < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                                {differenceValue > 0 ? `+${formatRupiah(differenceValue)}` : formatRupiah(differenceValue)}
                              </span>
                            </td>
                            <td className="p-2 text-slate-600 text-[11px]">
                              {reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
              >
                Kembali Periksa
              </button>
              <button
                type="button"
                onClick={handleConfirmMassAdjustment}
                className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95"
              >
                Ya, Konfirmasi & Terapkan Penyesuaian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: BERITA ACARA DETAIL & CETAK HASIL AUDIT                   */}
      {/* =================================================================== */}
      {selectedHistoricalOpname && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0 no-print">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" />
                  <span>Berita Acara Stock Opname ({selectedHistoricalOpname.sessionNumber})</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Dokumen rekonsiliasi stok fisik dan pembukuan resmi toko.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    window.print();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs"
                  title="Cetak Berita Acara ke Printer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak Dokumen</span>
                </button>
                <button
                  onClick={() => setSelectedHistoricalOpname(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div id="stock-opname-print-area" className="py-4 space-y-4 overflow-y-auto flex-1 font-sans">
              {/* Official Document Header */}
              <div className="border-b-2 border-slate-900 pb-3 text-center space-y-1">
                <h2 className="text-lg font-black tracking-wider text-slate-900 uppercase">
                  {storeSettings?.storeName || 'TOKO BERKAH JAYA'}
                </h2>
                <p className="text-xs text-slate-600">
                  {storeSettings?.storeAddress || 'Jl. Merdeka Barat No. 88, Jakarta Pusat'} · Telp: {storeSettings?.storePhone || '0812-3456-7890'}
                </p>
                <div className="pt-2">
                  <span className="inline-block bg-slate-900 text-white text-xs font-bold uppercase tracking-widest px-3 py-1 rounded">
                    BERITA ACARA HASIL STOCK OPNAME FISIK
                  </span>
                </div>
              </div>

              {/* Metadata Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 block">No. Dokumen</span>
                  <strong className="font-mono text-slate-900">{selectedHistoricalOpname.sessionNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Tanggal Audit</span>
                  <strong className="text-slate-900">{selectedHistoricalOpname.date}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Auditor / Pelaksana</span>
                  <strong className="text-slate-900">{selectedHistoricalOpname.auditorName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 block">Jenis Pemeriksaan</span>
                  <strong className="text-slate-900">
                    {selectedHistoricalOpname.generalReason}
                    {selectedHistoricalOpname.auditMode === 'MULTI_BATCH' ? ' (Multi-Batch)' : ''}
                  </strong>
                </div>
                {selectedHistoricalOpname.auditedCategories && selectedHistoricalOpname.auditedCategories.length > 0 && (
                  <div className="col-span-2 sm:col-span-4 pt-1 border-t border-slate-200/70">
                    <span className="text-slate-500">Kategori Diaudit: </span>
                    <strong className="text-slate-800">
                      {selectedHistoricalOpname.auditedCategories.join(', ')}
                    </strong>
                  </div>
                )}
              </div>

              {selectedHistoricalOpname.notes && (
                <div className="text-xs text-slate-700 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60">
                  <span className="font-bold text-amber-900">Catatan Auditor: </span>
                  {selectedHistoricalOpname.notes}
                </div>
              )}

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase text-[10px]">
                    <tr>
                      <th className="p-2 w-8 text-center">#</th>
                      <th className="p-2">Nama Barang &amp; Batch</th>
                      <th className="p-2 text-center">Satuan</th>
                      <th className="p-2 text-right">Modal (@)</th>
                      <th className="p-2 text-center">Stok Sistem</th>
                      <th className="p-2 text-center">Stok Fisik</th>
                      <th className="p-2 text-center">Selisih</th>
                      <th className="p-2 text-right">Nilai Selisih</th>
                      <th className="p-2">Alasan &amp; Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedHistoricalOpname.items.map((item, i) => (
                      <React.Fragment key={i}>
                        <tr className="hover:bg-slate-50/50">
                          <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{i + 1}</td>
                          <td className="p-2 font-bold text-slate-900">
                            <div>{item.productName}</div>
                            <div className="text-[10px] font-normal text-slate-500">{item.category}</div>
                          </td>
                          <td className="p-2 text-center font-mono">{item.baseUnit}</td>
                          <td className="p-2 text-right font-mono">{formatRupiah(item.costPrice)}</td>
                          <td className="p-2 text-center font-mono">{formatNumber(item.systemStock)}</td>
                          <td className="p-2 text-center font-mono font-bold bg-slate-50">{formatNumber(item.physicalStock)}</td>
                          <td className="p-2 text-center font-mono font-bold">
                            <span className={item.difference < 0 ? 'text-rose-600' : item.difference > 0 ? 'text-emerald-600' : 'text-slate-500'}>
                              {item.difference > 0 ? `+${item.difference}` : item.difference}
                            </span>
                          </td>
                          <td className="p-2 text-right font-mono font-bold">
                            <span className={item.differenceValue < 0 ? 'text-rose-600' : item.differenceValue > 0 ? 'text-emerald-600' : 'text-slate-400'}>
                              {item.differenceValue > 0 ? `+${formatRupiah(item.differenceValue)}` : formatRupiah(item.differenceValue)}
                            </span>
                          </td>
                          <td className="p-2 text-[11px] text-slate-700">
                            <span className="font-medium text-slate-900">{item.reason}</span>
                            {item.notes && <span className="text-slate-500 block italic">{item.notes}</span>}
                          </td>
                        </tr>
                        {item.batchDetails &&
                          item.batchDetails.map((bd) => (
                            <tr key={`${i}_${bd.batchId}`} className="bg-indigo-50/30 text-[10.5px]">
                              <td className="p-1.5 text-center text-indigo-400 font-mono">↳</td>
                              <td className="p-1.5 pl-4 font-mono font-semibold text-indigo-950">
                                Batch {bd.batchNumber}
                              </td>
                              <td className="p-1.5 text-center font-mono text-slate-500">{item.baseUnit}</td>
                              <td className="p-1.5 text-right font-mono text-slate-600">{formatRupiah(bd.costPrice)}</td>
                              <td className="p-1.5 text-center font-mono text-slate-600">{formatNumber(bd.systemQty)}</td>
                              <td className="p-1.5 text-center font-mono font-bold text-indigo-950">{formatNumber(bd.physicalQty)}</td>
                              <td className="p-1.5 text-center font-mono font-bold">
                                <span className={bd.difference < 0 ? 'text-rose-600' : bd.difference > 0 ? 'text-emerald-600' : 'text-slate-500'}>
                                  {bd.difference > 0 ? `+${bd.difference}` : bd.difference}
                                </span>
                              </td>
                              <td className="p-1.5 text-right font-mono font-bold">
                                <span className={bd.differenceValue < 0 ? 'text-rose-600' : bd.differenceValue > 0 ? 'text-emerald-600' : 'text-slate-400'}>
                                  {bd.differenceValue > 0 ? `+${formatRupiah(bd.differenceValue)}` : formatRupiah(bd.differenceValue)}
                                </span>
                              </td>
                              <td className="p-1.5 text-slate-500">Audit Per-Batch FIFO</td>
                            </tr>
                          ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Summary */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center text-xs font-bold">
                <span>
                  Total Barang Diaudit: <strong>{selectedHistoricalOpname.totalItemsAudited}</strong> | Berselisih: <strong>{selectedHistoricalOpname.totalDiscrepancies}</strong>
                </span>
                <span className="text-sm font-mono">
                  Net Varians Finansial:{' '}
                  <span className={selectedHistoricalOpname.totalDifferenceValue < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                    {selectedHistoricalOpname.totalDifferenceValue > 0 ? `+${formatRupiah(selectedHistoricalOpname.totalDifferenceValue)}` : formatRupiah(selectedHistoricalOpname.totalDifferenceValue)}
                  </span>
                </span>
              </div>

              {/* Signatures for Official Berita Acara */}
              <div className="pt-6 grid grid-cols-3 gap-4 text-center text-xs">
                <div className="space-y-12">
                  <div className="text-slate-500">Pemeriksa / Auditor</div>
                  <div className="font-bold border-t border-slate-300 pt-1 text-slate-800">
                    ({selectedHistoricalOpname.auditorName})
                  </div>
                </div>

                <div className="space-y-12">
                  <div className="text-slate-500">Store Manager / Penanggung Jawab</div>
                  <div className="font-bold border-t border-slate-300 pt-1 text-slate-800">
                    (.......................................)
                  </div>
                </div>

                <div className="space-y-12">
                  <div className="text-slate-500">Pimpinan / Pemilik Toko</div>
                  <div className="font-bold border-t border-slate-300 pt-1 text-slate-800">
                    (.......................................)
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 shrink-0 no-print">
              <button
                type="button"
                onClick={() => setSelectedHistoricalOpname(null)}
                className="py-2 px-5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: QUICK INDIVIDUAL STOCK ADJUSTMENT (FROM TAB 1)              */}
      {/* =================================================================== */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Koreksi Cepat Satuan Stok</h3>
                <p className="text-xs text-slate-500">{adjustingProduct.name}</p>
              </div>
              <button
                onClick={() => setAdjustingProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSingleStockAdjustSubmit} className="py-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-2xl flex justify-between items-baseline">
                <span className="text-xs text-slate-500">Stok Sistem Saat Ini:</span>
                <span className="text-base font-bold font-mono text-slate-900">
                  {formatNumber(adjustingProduct.stockInBaseUnit)} {adjustingProduct.baseUnit}
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Metode Penyesuaian
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'SET', label: 'Tetapkan Angka' },
                    { id: 'ADD', label: '+ Tambah Stok' },
                    { id: 'SUBTRACT', label: '- Kurang Stok' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setAdjustmentType(t.id as any);
                      }}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        adjustmentType === t.id
                          ? 'bg-sky-600 text-white shadow-2xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Jumlah Satuan Dasar ({adjustingProduct.baseUnit})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setActiveKeypad({
                        title: 'Koreksi Stok Fisik',
                        subtitle: `${adjustingProduct.name} (${adjustingProduct.barcode})`,
                        initialValue: parseFloat(stockAdjustmentVal) || 0,
                        unitName: adjustingProduct.baseUnit,
                        onConfirm: (val) => setStockAdjustmentVal(val.toString()),
                      });
                    }}
                    className="text-[11px] font-bold text-sky-700 hover:text-sky-800 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200 flex items-center gap-1 active:scale-95"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Numpad Sentuh</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={stockAdjustmentVal}
                    onChange={(e) => setStockAdjustmentVal(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-300 text-base font-mono font-bold focus:border-sky-500 focus:outline-none pr-12"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase pointer-events-none">
                    {adjustingProduct.baseUnit}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Alasan Penyesuaian
                </label>
                <input
                  type="text"
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  placeholder="Contoh: Barang rusak di rak, dsb"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustingProduct(null)}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20"
                >
                  Simpan Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: DRAFT PURCHASE ORDER (PO) GENERATOR                        */}
      {/* =================================================================== */}
      {isDraftPOModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center text-sky-400">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Draft Purchase Order (PO) Otomatis</h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-400/30 font-bold">
                      REKOMENDASI SISTEM
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    No. PO: PO-{new Date().toISOString().slice(0, 10).replace(/-/g, '')}-DRAFT • Lead Time: {leadTimeDays} Hari • Safety Stock: {safetyStockDays} Hari
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsDraftPOModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter & Summary stats */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-slate-700 whitespace-nowrap">Filter Supplier:</label>
                  <select
                    value={selectedPOSupplierId}
                    onChange={(e) => setSelectedPOSupplierId(e.target.value)}
                    className="p-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
                  >
                    <option value="ALL">Semua Supplier Rekanan</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.contactPerson})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Calculation notice */}
                <div className="text-[11px] text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                  Buffer Total: <span className="font-bold text-slate-800">{leadTimeDays + safetyStockDays} hari penjualan</span>
                </div>
              </div>

              {/* KPI Badges */}
              {(() => {
                const poItems = demandForecastingList.filter((item) => {
                  if (item.recommendedReorderQty <= 0) return false;
                  if (selectedPOSupplierId !== 'ALL' && item.product.supplierId !== selectedPOSupplierId) return false;
                  return true;
                });
                const totalUnits = poItems.reduce((acc, it) => acc + it.recommendedReorderQty, 0);
                const totalEstBudget = poItems.reduce((acc, it) => acc + (it.recommendedReorderQty * it.product.costPrice), 0);

                return (
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Item yang Dipesan</div>
                      <div className="text-lg font-black text-slate-900 font-mono">{poItems.length} SKU</div>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Total Unit Restock</div>
                      <div className="text-lg font-black text-sky-700 font-mono">{formatNumber(totalUnits)} Unit</div>
                    </div>
                    <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
                      <div className="text-[10px] font-bold text-slate-500 uppercase">Estimasi Total Biaya Modal</div>
                      <div className="text-lg font-black text-emerald-700 font-mono">{formatRupiah(totalEstBudget)}</div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Items Table */}
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const poItems = demandForecastingList.filter((item) => {
                  if (item.recommendedReorderQty <= 0) return false;
                  if (selectedPOSupplierId !== 'ALL' && item.product.supplierId !== selectedPOSupplierId) return false;
                  return true;
                });

                if (poItems.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400">
                      <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500 mb-2 opacity-80" />
                      <p className="font-bold text-slate-700">Tidak ada produk yang memerlukan restock untuk filter ini.</p>
                      <p className="text-xs text-slate-500 mt-1">Stok aman atau belum melampaui buffer batas waktu pemesanan.</p>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto rounded-2xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100/90 text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">No</th>
                          <th className="py-2.5 px-3">Produk & Barcode</th>
                          <th className="py-2.5 px-3">Supplier</th>
                          <th className="py-2.5 px-3 text-right">Sisa Stok</th>
                          <th className="py-2.5 px-3 text-right">Kecepatan/Hari</th>
                          <th className="py-2.5 px-3 text-center bg-sky-50 text-sky-900">Saran Order</th>
                          <th className="py-2.5 px-3 text-right">Harga Modal</th>
                          <th className="py-2.5 px-3 text-right">Subtotal Estimasi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poItems.map((item, idx) => {
                          const supp = suppliers.find((s) => s.id === item.product.supplierId);
                          const subtotal = item.recommendedReorderQty * item.product.costPrice;
                          return (
                            <tr key={item.product.id} className="hover:bg-slate-50/80">
                              <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                              <td className="py-2.5 px-3">
                                <div className="font-bold text-slate-800">{item.product.name}</div>
                                <div className="font-mono text-[10px] text-slate-400">{item.product.barcode}</div>
                              </td>
                              <td className="py-2.5 px-3 text-slate-600 font-medium">
                                {supp ? supp.name : <span className="text-slate-400 italic">Umum</span>}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                                {formatNumber(item.currentStock)} {item.product.baseUnit}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                {item.dailyVelocity} /hr
                              </td>
                              <td className="py-2.5 px-3 text-center bg-sky-50/60 font-mono font-black text-sky-700 text-sm">
                                {formatNumber(item.recommendedReorderQty)} {item.product.baseUnit}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                {formatRupiah(item.product.costPrice)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                                {formatRupiah(subtotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Footer with Actions */}
            <div className="p-4 border-t border-slate-100 bg-white flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="text-xs text-slate-400">
                Tekan tombol di kanan untuk mengirim atau menyimpan dokumen pemesanan.
              </div>

              <div className="flex items-center gap-2">
                {/* Share to WhatsApp */}
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    const poItems = demandForecastingList.filter((item) => {
                      if (item.recommendedReorderQty <= 0) return false;
                      if (selectedPOSupplierId !== 'ALL' && item.product.supplierId !== selectedPOSupplierId) return false;
                      return true;
                    });
                    if (poItems.length === 0) return;

                    const supp = suppliers.find((s) => s.id === selectedPOSupplierId);
                    const totalUnits = poItems.reduce((acc, it) => acc + it.recommendedReorderQty, 0);
                    const totalEstBudget = poItems.reduce((acc, it) => acc + (it.recommendedReorderQty * it.product.costPrice), 0);
                    const storeName = storeSettings?.storeName || 'Toko Retail POS';
                    const poNo = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-DRAFT`;
                    const dateFormatted = new Date().toLocaleDateString('id-ID', { dateStyle: 'long' });

                    let msg = `*DRAFT PURCHASE ORDER (PO)*\n`;
                    msg += `No: ${poNo}\n`;
                    msg += `Tanggal: ${dateFormatted}\n`;
                    msg += `Toko: ${storeName}\n`;
                    msg += `Supplier: ${supp ? supp.name : 'Supplier Rekanan'}\n\n`;
                    msg += `*Daftar Pesanan Restock:*\n`;
                    poItems.forEach((it, idx) => {
                      msg += `${idx + 1}. ${it.product.name} (${it.product.barcode})\n`;
                      msg += `   Jumlah: ${it.recommendedReorderQty} ${it.product.baseUnit} @ ${formatRupiah(it.product.costPrice)}\n`;
                    });
                    msg += `\n*Total Pesanan:* ${totalUnits} unit (${poItems.length} SKU)\n`;
                    msg += `*Estimasi Biaya:* ${formatRupiah(totalEstBudget)}\n`;
                    msg += `_Catatan: Berdasarkan lead time ${leadTimeDays} hari kerja & safety stock ${safetyStockDays} hari._`;

                    const phone = supp?.phone || '';
                    window.open(formatWhatsAppUrl(phone, msg), '_blank');
                  }}
                  className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Kirim PO via WhatsApp</span>
                </button>

                {/* Export PDF */}
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    const poItems = demandForecastingList.filter((item) => {
                      if (item.recommendedReorderQty <= 0) return false;
                      if (selectedPOSupplierId !== 'ALL' && item.product.supplierId !== selectedPOSupplierId) return false;
                      return true;
                    });
                    if (poItems.length === 0) return;

                    const supp = suppliers.find((s) => s.id === selectedPOSupplierId);
                    const storeName = storeSettings?.storeName || 'Toko Retail POS';
                    const poNo = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-DRAFT`;

                    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
                    doc.setFontSize(16);
                    doc.setTextColor(15, 23, 42);
                    doc.text(`DRAFT PURCHASE ORDER - ${storeName.toUpperCase()}`, 14, 15);

                    doc.setFontSize(9);
                    doc.setTextColor(100, 116, 139);
                    doc.text(`Nomor PO: ${poNo} | Tanggal: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}`, 14, 21);
                    doc.text(`Supplier: ${supp ? supp.name : 'Semua Supplier'} | Parameter: Lead Time ${leadTimeDays} Hari, Safety Stock ${safetyStockDays} Hari`, 14, 26);

                    const tableData = poItems.map((it, idx) => {
                      const itemSupp = suppliers.find((s) => s.id === it.product.supplierId);
                      return [
                        (idx + 1).toString(),
                        it.product.barcode,
                        it.product.name,
                        itemSupp ? itemSupp.name : 'Umum',
                        `${formatNumber(it.currentStock)} ${it.product.baseUnit}`,
                        `${formatNumber(it.recommendedReorderQty)} ${it.product.baseUnit}`,
                        formatRupiah(it.product.costPrice),
                        formatRupiah(it.recommendedReorderQty * it.product.costPrice),
                      ];
                    });

                    autoTable(doc, {
                      startY: 31,
                      head: [['No', 'Barcode', 'Nama Barang', 'Supplier', 'Stok Kini', 'Jumlah Order', 'Harga Pokok', 'Subtotal']],
                      body: tableData,
                      theme: 'grid',
                      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
                      styles: { fontSize: 8, cellPadding: 2.5 },
                      alternateRowStyles: { fillColor: [248, 250, 252] },
                    });

                    const finalY = (doc as any).lastAutoTable?.finalY || 40;
                    const totalEst = poItems.reduce((acc, it) => acc + it.recommendedReorderQty * it.product.costPrice, 0);
                    doc.setFontSize(10);
                    doc.setTextColor(15, 23, 42);
                    doc.text(`TOTAL ESTIMASI DRAFT PO: ${formatRupiah(totalEst)}`, 14, finalY + 8);

                    doc.save(`Draft-PO-${new Date().toISOString().slice(0, 10)}.pdf`);
                  }}
                  className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2 shadow-2xs active:scale-95"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Ekspor PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsDraftPOModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 5: HAPUS SESI STOCK OPNAME DENGAN KETERANGAN & PENANGGUNG JAWAB*/}
      {/* =================================================================== */}
      {deletingOpname && onDeleteStockOpname && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Hapus Sesi Stock Opname</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {deletingOpname.sessionNumber} · {deletingOpname.date}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingOpname(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Pencatatan Audit Penghapusan Permanen</span>
                </div>
                <p>
                  Penghapusan sesi opname ({deletingOpname.totalItemsAudited} SKU) akan langsung dicatat ke Log Aktivitas Stock Opname beserta{' '}
                  <strong>Keterangan Penghapusan</strong> dan <strong>User Penanggung Jawab</strong>.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  User Penanggung Jawab <span className="text-rose-600">*</span>
                </label>
                <select
                  value={deleteOpnameResponsibleId}
                  onChange={(e) => setDeleteOpnameResponsibleId(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-rose-500"
                >
                  {availableResponsibleUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  Keterangan Penghapusan <span className="text-rose-600">*</span>
                </label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    'Salah input hitung fisik',
                    'Sesi opname duplikat',
                    'Batal koreksi audit',
                    'Retur / koreksi transaksi salah',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setDeleteOpnameReason(preset);
                        setDeleteOpnameError('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                        deleteOpnameReason === preset
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={2}
                  value={deleteOpnameReason}
                  onChange={(e) => {
                    setDeleteOpnameReason(e.target.value);
                    if (deleteOpnameError) setDeleteOpnameError('');
                  }}
                  placeholder="Tuliskan alasan penghapusan sesi stock opname ini..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs text-slate-900 focus:border-rose-500 focus:outline-none"
                />
                {deleteOpnameError && (
                  <p className="text-[11px] font-bold text-rose-600 mt-1">{deleteOpnameError}</p>
                )}
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={revertStockOnOpnameDelete}
                  onChange={(e) => setRevertStockOnOpnameDelete(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <div className="text-xs text-slate-700">
                  <span className="font-bold text-slate-900 block">
                    Kembalikan stok produk ke kondisi sebelum opname ini
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Jika dicentang, selisih stok dari sesi {deletingOpname.sessionNumber} akan dibalikkan pada stok sistem saat ini.
                  </span>
                </div>
              </label>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingOpname(null)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const trimmed = deleteOpnameReason.trim();
                  if (!trimmed) {
                    sound.playError();
                    setDeleteOpnameError('Keterangan penghapusan wajib diisi untuk audit trail.');
                    return;
                  }
                  const chosen =
                    availableResponsibleUsers.find((u) => u.id === deleteOpnameResponsibleId) ||
                    currentUser;
                  sound.playTap();
                  onDeleteStockOpname(
                    deletingOpname,
                    trimmed,
                    { id: chosen.id, name: chosen.name, role: chosen.role },
                    revertStockOnOpnameDelete
                  );
                  setDeletingOpname(null);
                  setDeleteOpnameReason('');
                }}
                className="py-2.5 px-5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 active:scale-95"
              >
                Hapus & Catat Log Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tactile Touch Keypad Modal for Tablet Numbers */}
      {activeKeypad && (
        <TouchKeypadModal
          isOpen={!!activeKeypad}
          onClose={() => setActiveKeypad(null)}
          title={activeKeypad.title}
          subtitle={activeKeypad.subtitle}
          initialValue={activeKeypad.initialValue}
          unitName={activeKeypad.unitName}
          min={0}
          max={999999}
          quickPresets={[1, 5, 10, 20, 50, 100]}
          onConfirm={(val) => {
            activeKeypad.onConfirm(val);
            setActiveKeypad(null);
          }}
        />
      )}
      {/* Monthly Stock Movement Audit Modal (In / Out / Opname) */}
      <MonthlyStockMovementModal
        isOpen={isMonthlyMovementModalOpen}
        onClose={() => setIsMonthlyMovementModalOpen(false)}
        products={products}
        purchases={purchases}
        transactions={transactions}
        stockOpnames={stockOpnames}
        storeSettings={storeSettings}
        auditorName={currentUser?.name || 'Admin Gudang'}
        initialMonthKey={auditMonthKey}
        onStartOpnameSession={() => setActiveSubTab('OPNAME_SESSION')}
      />
    </div>
  );
};
