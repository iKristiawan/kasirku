import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertTriangle,
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  X,
  Settings as SettingsIcon,
  TrendingUp,
  Printer,
  Bluetooth,
  RotateCcw,
  WifiOff,
  RefreshCw,
  HardDrive,
  CheckCircle2,
  ShieldAlert
} from 'lucide-react';
import { 
  User, 
  UserRole,
  Product, 
  ProductCategory,
  Customer, 
  Supplier, 
  Transaction, 
  StoreSettings, 
  CartItem, 
  ProductUnit, 
  PaymentMethod,
  RestockItem,
  RestockOrder,
  BackupPayload,
  AttendanceRecord,
  StockOpnameRecord,
  MembershipTier,
  ProductBatch,
  BatchDeduction,
  CashflowRecord,
  CustomerCategoryItem,
  OnlineOrder,
  OnlineOrderStatus,
  EmployeeActivityLog,
  TransactionReturnItem,
  TransactionReturnRecord,
  TransactionAuditLogEntry,
  TaxConfig,
  TaxRecord,
  TaxAuditCategory,
  TaxAuditChangeItem,
  TaxAuditLog,
  TaxAdjustment,
  BalanceSheetEntry,
} from './types/pos';
import { 
  DEFAULT_ADMIN_USER,
  DEMO_USERS,
  INITIAL_USERS, 
  INITIAL_PRODUCTS, 
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS, 
  INITIAL_SUPPLIERS, 
  INITIAL_TRANSACTIONS, 
  INITIAL_STORE_SETTINGS,
  INITIAL_ATTENDANCES,
  INITIAL_STOCK_OPNAMES,
  DEFAULT_PAYMENT_METHODS,
  INITIAL_CUSTOMER_CATEGORIES
} from './utils/mockData';
import { Navbar } from './components/Navbar';
import { TabletPOSView } from './components/TabletPOSView';
import { PaymentModal } from './components/PaymentModal';
import { ReceiptModal } from './components/ReceiptModal';
import { BarcodeScannerModal, ScannerModalMode } from './components/BarcodeScannerModal';
import { CustomerModal } from './components/CustomerModal';
import { CustomerManagementView } from './components/CustomerManagementView';
import { ProductManagementView } from './components/ProductManagementView';
import { ServiceManagementView } from './components/ServiceManagementView';
import { PurchaseManagementView } from './components/PurchaseManagementView';
import { SupplierManagementView } from './components/SupplierManagementView';
import { PiutangManagementView } from './components/PiutangManagementView';
import { TransactionHistoryView } from './components/TransactionHistoryView';
import { SettingsView } from './components/SettingsView';
import { AttendanceView } from './components/AttendanceView';
import { UserSwitchModal } from './components/UserSwitchModal';
import { ShiftSummaryModal } from './components/ShiftSummaryModal';
import { StockThresholdSettingsModal } from './components/StockThresholdSettingsModal';
import { StockReportView } from './components/StockReportView';
import { DailyProfitLossView } from './components/DailyProfitLossView';
import { MonthlySalesReportView } from './components/MonthlySalesReportView';
import { SalesPerformanceDashboard } from './components/SalesPerformanceDashboard';
import { SalesReportView } from './components/SalesReportView';
import { FinanceView } from './components/FinanceView';
import { FifoReconciliationModal } from './components/FifoReconciliationModal';
import { OnlineStorefrontPage } from './components/OnlineStorefrontPage';
import { OnlineOrdersManagementView } from './components/OnlineOrdersManagementView';
import { EmployeeActivityView } from './components/EmployeeActivityView';
import { TaxManagementView } from './components/TaxManagementView';
import { BalanceSheetView } from './components/BalanceSheetView';
import { GoogleDriveBackupPanel } from './components/GoogleDriveBackupPanel';
import { OfflineQueueModal } from './components/OfflineQueueModal';
import { BackgroundSyncProgressIndicator } from './components/BackgroundSyncProgressIndicator';
import { SyncHealthDashboardView } from './components/SyncHealthDashboardView';
import { SyncActivityLogView } from './components/SyncActivityLogView';
import { buildFullBackupPayload } from './utils/backupPayload';
import { resolveProductDiscount } from './utils/promoUtils';
import {
  subscribeOfflineSyncQueue,
  mergeOfflinePendingCollection,
  mergeOfflinePendingSettings,
  removeOfflineSyncJob,
  clearOfflineSyncQueue,
  getOfflineQueueCount,
  OfflineSyncJob,
} from './utils/offlineQueue';
import {
  findCustomerSpecialPrice,
  isCustomerMember,
  calculatePointsEarned,
  findCustomerByScanInput,
  generateMembershipId,
  getCustomerMembershipId,
} from './utils/customerUtils';
import { generateInvoiceNumber, formatNumber, formatRupiah } from './utils/formatters';
import { recalculateChronologicalFifoForNewTransaction, restoreProductBatchesForReturn } from './utils/fifoUtils';
import {
  runBatchIntegrityCheck,
  reconcileBatchIntegrityIssues,
  applyMultiBatchOpnameToProduct,
  revertMultiBatchOpnameFromProduct,
  BatchIntegrityCheckReport,
} from './utils/batchIntegrity';
import { getCategoryColor } from './utils/categoryColors';
import {
  diffTaxConfigs,
  getEffectiveTaxConfig,
  TAX_ADJUSTMENT_REASON_LABELS,
  TAX_ADJUSTMENT_TARGET_LABELS,
} from './utils/taxUtils';
import { sound } from './utils/audio';
import {
  printDirectBluetooth,
  openRawBtPrint,
  getPrinterConnectionInfo,
  isPrinterPolicyError,
} from './utils/bluetoothPrinter';
import {
  DAILY_LOW_STOCK_LEDGER_KEY,
  DailyLowStockHit,
  recordDailyLowStockHits,
  markDailyLowStockTriggered,
  buildAdminLowStockWhatsAppMessage,
  buildAdminWhatsAppUrl,
  DEFAULT_LOW_STOCK_SCHEDULE,
  normalizeLowStockSchedule,
  loadScheduledLowStockDispatch,
  markScheduledLowStockDispatched,
  evaluateScheduledLowStockDue,
  formatScheduleSummaryLabel,
  collectLowStockHitsFromProducts,
  buildScheduledLowStockWhatsAppMessage,
} from './utils/adminLowStockAlert';
import {
  DailySalesClosingSummary,
  DEFAULT_DAILY_SALES_SCHEDULE,
  normalizeDailySalesSchedule,
  loadScheduledDailySalesDispatch,
  markScheduledDailySalesDispatched,
  evaluateScheduledDailySalesDue,
  formatDailySalesScheduleSummaryLabel,
  computeTodaySalesClosingSummary,
  buildDailySalesClosingWhatsAppMessage,
} from './utils/adminDailySalesAlert';
import { 
  seedCollectionIfEmpty, 
  seedCollectionIfEmptyWithResult,
  subscribeToCollection, 
  saveDocumentToFirestore, 
  deleteDocumentFromFirestore, 
  saveBatchToFirestore, 
  replaceCollectionInFirestore,
  saveStoreSettingsToFirestore,
  clearAllDatabaseExceptUsers,
  pauseFirestoreCloudSync,
  resumeFirestoreCloudSync,
  setCloudSyncPaused,
  testFirestoreConnection,
  verifyFirestoreServerConnection,
  forceSyncFirestoreNow,
  clearPendingSyncQueueStatus,
  subscribePendingSyncQueue,
  appendFirestoreConnectionLog,
  logFirestoreError,
  formatFirestoreSyncErrorMessage,
  handleFirestoreError,
  OperationType,
  CloudSyncStatus,
  FirestoreVerificationResult,
  runFirestoreSyncHealthAudit,
  executeSingleOfflineSyncJobNow,
} from './utils/firebaseSync';
import {
  recordCloudNonEmptyCollection,
  clearCloudCollectionHistory,
  wasPreviouslyNonEmptyOnServer,
  isUserExplicitlyClearedDatabase,
  evaluateCloudEmptySnapshotProtection,
} from './utils/syncSafeguard';
import {
  BackgroundSyncProgressSnapshot,
  SyncActivityLogEntry,
  SyncModuleSummary,
  clearSyncActivityLogs,
  getBackgroundSyncProgress,
  getSyncActivityLogs,
  getSyncModuleLabel,
  getSyncModuleSummaries,
  recordModuleSyncActivity,
  subscribeBackgroundSyncProgress,
  subscribeSyncActivityLogs,
} from './utils/syncTelemetry';
import {
  SyncConflictItem,
  SyncHealthAuditReport,
  SyncRecommendedAction,
} from './utils/syncConflictDetector';

const detectStorefrontRouteFromUrl = (): { isShop: boolean; trackCode: string } => {
  if (typeof window === 'undefined') return { isShop: false, trackCode: '' };
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const shopParam = params.get('shop') || params.get('toko') || params.get('store');
  const trackParam = params.get('track') || params.get('order') || '';
  const isShop =
    shopParam === '1' ||
    shopParam === 'true' ||
    path === '/shop' ||
    path === '/toko' ||
    path === '/belanja' ||
    hash.startsWith('#/shop') ||
    hash.startsWith('#/toko') ||
    hash.startsWith('#/belanja') ||
    Boolean(trackParam);
  return { isShop, trackCode: trackParam };
};

export default function App() {
  // Persistent state helper
  const loadStorage = <T,>(key: string, fallback: T): T => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  };

  const pendingStorageRef = useRef<Map<string, any>>(new Map());
  const storageTimersRef = useRef<Map<string, number>>(new Map());

  const saveStorage = (key: string, data: any) => {
    const existingTimer = storageTimersRef.current.get(key);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      storageTimersRef.current.delete(key);
    }
    pendingStorageRef.current.delete(key);
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  };

  const scheduleSaveStorage = (key: string, data: any) => {
    pendingStorageRef.current.set(key, data);
    const existingTimer = storageTimersRef.current.get(key);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
    }
    const timer = window.setTimeout(() => {
      storageTimersRef.current.delete(key);
      const payload = pendingStorageRef.current.get(key);
      pendingStorageRef.current.delete(key);
      if (payload === undefined) return;
      const runWrite = () => {
        try {
          localStorage.setItem(key, JSON.stringify(payload));
        } catch {}
      };
      if (typeof (window as any).requestIdleCallback === 'function') {
        (window as any).requestIdleCallback(runWrite, { timeout: 1000 });
      } else {
        runWrite();
      }
    }, 350);
    storageTimersRef.current.set(key, timer);
  };

  useEffect(() => {
    const flushPendingStorage = () => {
      storageTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      storageTimersRef.current.clear();
      pendingStorageRef.current.forEach((payload, key) => {
        try {
          localStorage.setItem(key, JSON.stringify(payload));
        } catch {}
      });
      pendingStorageRef.current.clear();
    };
    window.addEventListener('pagehide', flushPendingStorage);
    window.addEventListener('beforeunload', flushPendingStorage);
    return () => {
      window.removeEventListener('pagehide', flushPendingStorage);
      window.removeEventListener('beforeunload', flushPendingStorage);
      flushPendingStorage();
    };
  }, []);

  // Helper to heal any legacy products where units costPrice was left corrupted (e.g. 10000 or 120000)
  const sanitizeProducts = (prods: Product[]): Product[] => {
    return prods.map((p) => {
      if (p.costPrice > 0 && p.units && p.units.length > 0) {
        const baseCost = p.costPrice;
        const updatedUnits = p.units.map((u, idx) => {
          if (idx === 0) {
            return { ...u, costPrice: baseCost };
          }
          // If multi-unit has corrupted legacy 120000 (when conversion factor is not 12) or 0 or unscaled
          if (!u.costPrice || u.costPrice <= 0 || (u.costPrice === 120000 && u.conversionFactor !== 12) || (u.costPrice === 10000 && baseCost !== 10000)) {
            return { ...u, costPrice: Math.round(baseCost * (u.conversionFactor || 1)) };
          }
          return u;
        });
        return { ...p, units: updatedUnits };
      }
      return p;
    });
  };

  // Persistent state: instantly loads saved items from localStorage on mount, then real-time syncs with Firebase Firestore
  const [users, setUsers] = useState<User[]>(() => loadStorage('kasir_users', INITIAL_USERS));
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = loadStorage<User | null>('kasir_active_user', null);
    return saved || users[0] || DEFAULT_ADMIN_USER;
  });
  const [products, setProducts] = useState<Product[]>(() => sanitizeProducts(loadStorage('kasir_products', [])));
  const [purchases, setPurchases] = useState<RestockOrder[]>(() => loadStorage('kasir_purchases', []));
  const [categories, setCategories] = useState<ProductCategory[]>(() => loadStorage('kasir_categories', []));
  const [customerCategories, setCustomerCategories] = useState<CustomerCategoryItem[]>(() =>
    loadStorage('kasir_customer_categories', INITIAL_CUSTOMER_CATEGORIES)
  );
  const [customers, setCustomers] = useState<Customer[]>(() => loadStorage('kasir_customers', []));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadStorage('kasir_suppliers', []));
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadStorage('kasir_transactions', []));
  const [attendances, setAttendances] = useState<AttendanceRecord[]>(() => loadStorage('kasir_attendances', []));
  const [stockOpnames, setStockOpnames] = useState<StockOpnameRecord[]>(() => loadStorage('kasir_stock_opnames', []));
  const [cashflows, setCashflows] = useState<CashflowRecord[]>(() => loadStorage('kasir_cashflows', []));
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>(() => loadStorage('kasir_online_orders', []));
  const [activityLogs, setActivityLogs] = useState<EmployeeActivityLog[]>(() =>
    loadStorage('kasir_activity_logs', [])
  );
  const [taxRecords, setTaxRecords] = useState<TaxRecord[]>(() =>
    loadStorage('kasir_tax_records', [])
  );
  const [taxAuditLogs, setTaxAuditLogs] = useState<TaxAuditLog[]>(() =>
    loadStorage('kasir_tax_audit_logs', [])
  );
  const [taxAdjustments, setTaxAdjustments] = useState<TaxAdjustment[]>(() =>
    loadStorage('kasir_tax_adjustments', [])
  );
  const [balanceSheetEntries, setBalanceSheetEntries] = useState<BalanceSheetEntry[]>(() =>
    loadStorage('kasir_balance_sheet_entries', [])
  );
  const [isGlobalFifoReconcileOpen, setIsGlobalFifoReconcileOpen] = useState<boolean>(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    const loaded = loadStorage<Partial<StoreSettings>>('kasir_settings', INITIAL_STORE_SETTINGS);
    const combined = { ...INITIAL_STORE_SETTINGS, ...loaded };
    if (!combined.customPaymentMethods || combined.customPaymentMethods.length === 0) {
      combined.customPaymentMethods = DEFAULT_PAYMENT_METHODS;
    }
    if (!combined.dailySalesGoal || combined.dailySalesGoal <= 0) {
      combined.dailySalesGoal = 5000000;
    }
    if (!combined.weeklySalesGoal || combined.weeklySalesGoal <= 0) {
      combined.weeklySalesGoal = 30000000;
    }
    if (!combined.monthlySalesGoal || combined.monthlySalesGoal <= 0) {
      combined.monthlySalesGoal = 120000000;
    }
    if (!combined.categorySalesGoals || typeof combined.categorySalesGoals !== 'object') {
      combined.categorySalesGoals = {};
    }
    if (combined.autoSendWhatsAppReceipt === undefined) {
      combined.autoSendWhatsAppReceipt = false;
    }
    if (combined.includeReceiptSummaryInAutoWa === undefined) {
      combined.includeReceiptSummaryInAutoWa = true;
    }
    if (combined.includeLoyaltyPointsInAutoWa === undefined) {
      combined.includeLoyaltyPointsInAutoWa = true;
    }
    if (combined.useCustomWhatsAppTemplate === undefined) {
      combined.useCustomWhatsAppTemplate = false;
    }
    if (!combined.customWhatsAppTemplate) {
      combined.customWhatsAppTemplate = INITIAL_STORE_SETTINGS.customWhatsAppTemplate;
    }
    if (combined.autoAdminLowStockWhatsApp === undefined) {
      combined.autoAdminLowStockWhatsApp = true;
    }
    if (combined.adminWhatsAppNumber === undefined) {
      combined.adminWhatsAppNumber = '';
    }
    if (!combined.adminLowStockTriggerCount || combined.adminLowStockTriggerCount < 2) {
      combined.adminLowStockTriggerCount = 2;
    }
    combined.scheduledAdminLowStockWhatsApp = normalizeLowStockSchedule(
      combined.scheduledAdminLowStockWhatsApp || DEFAULT_LOW_STOCK_SCHEDULE
    );
    combined.scheduledDailySalesReportWhatsApp = normalizeDailySalesSchedule(
      combined.scheduledDailySalesReportWhatsApp || DEFAULT_DAILY_SALES_SCHEDULE
    );
    if (!combined.printerConnectionType) {
      combined.printerConnectionType = 'BLUETOOTH';
    }
    if (!combined.printerPaperWidth) {
      combined.printerPaperWidth = '58mm';
    }
    if (combined.printerAutoCut === undefined) {
      combined.printerAutoCut = true;
    }
    if (combined.autoPrintReceipt === undefined) {
      combined.autoPrintReceipt = false;
    }
    if (combined.pointsPerSpend === undefined) {
      combined.pointsPerSpend = 1;
    }
    if (combined.autoApplyMaxPoints === undefined) {
      combined.autoApplyMaxPoints = false;
    }
    if (combined.requireTransactionNote === undefined) {
      combined.requireTransactionNote = false;
    }
    if (combined.onlineStoreEnabled === undefined) {
      combined.onlineStoreEnabled = true;
    }
    if (!combined.onlineStoreTagline) {
      combined.onlineStoreTagline = INITIAL_STORE_SETTINGS.onlineStoreTagline;
    }
    if (!combined.onlineStoreHours) {
      combined.onlineStoreHours = INITIAL_STORE_SETTINGS.onlineStoreHours;
    }
    if (combined.onlineStoreDeliveryFee === undefined) {
      combined.onlineStoreDeliveryFee = 10000;
    }
    if (combined.onlineStoreMinFreeDelivery === undefined) {
      combined.onlineStoreMinFreeDelivery = 100000;
    }
    if (combined.onlineStorePickupEnabled === undefined) {
      combined.onlineStorePickupEnabled = true;
    }
    if (combined.onlineStoreDeliveryEnabled === undefined) {
      combined.onlineStoreDeliveryEnabled = true;
    }
    combined.taxConfig = {
      ...(INITIAL_STORE_SETTINGS.taxConfig || {
        taxpayerStatus: 'UMKM_OP',
        npwp: '',
        taxpayerName: '',
        enablePphFinalUmkm: true,
        pphFinalRatePercent: 0.5,
        applyUmkmOpThreshold500Jt: true,
        enablePpn: false,
        ppnRatePercent: 11,
        ppnMode: 'INCLUSIVE',
        deductInputVatFromPurchases: true,
        enablePb1: false,
        pb1RatePercent: 10,
        excludeCashWithdrawalPrincipal: true,
        monthlyDueDay: 15,
      }),
      ...(combined.taxConfig || {}),
    };
    return combined;
  });

  // Customer Online Storefront Mode vs Staff POS Mode
  const initialStorefrontRoute = useMemo(() => detectStorefrontRouteFromUrl(), []);
  const [isStorefrontMode, setIsStorefrontMode] = useState<boolean>(initialStorefrontRoute.isShop);
  const [storefrontTrackCode, setStorefrontTrackCode] = useState<string>(initialStorefrontRoute.trackCode);

  useEffect(() => {
    const syncRoute = () => {
      const route = detectStorefrontRouteFromUrl();
      setIsStorefrontMode(route.isShop);
      if (route.trackCode) setStorefrontTrackCode(route.trackCode);
    };
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  const openStorefrontMode = () => {
    setIsStorefrontMode(true);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('shop', '1');
      window.history.pushState({}, '', url.toString());
    } catch {}
  };

  const exitStorefrontMode = () => {
    setIsStorefrontMode(false);
    setStorefrontTrackCode('');
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('shop');
      url.searchParams.delete('toko');
      url.searchParams.delete('store');
      url.searchParams.delete('track');
      url.searchParams.delete('order');
      if (['/shop', '/toko', '/belanja'].includes(url.pathname.toLowerCase())) {
        url.pathname = '/';
      }
      if (['#/shop', '#/toko', '#/belanja'].some((h) => url.hash.toLowerCase().startsWith(h))) {
        url.hash = '';
      }
      window.history.pushState({}, '', url.toString());
    } catch {}
  };

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<string>('pos');

  // Cart State for POS
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [requestedPoints, setRequestedPoints] = useState<number>(0);
  const [hasManualPointOverride, setHasManualPointOverride] = useState<boolean>(false);
  const [specialPriceNotice, setSpecialPriceNotice] = useState<{
    customerName: string;
    category: string;
    updatedCount: number;
    totalSaved: number;
    itemNames: string[];
    timestamp: number;
  } | null>(null);

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [preferBackdatedCheckout, setPreferBackdatedCheckout] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isDigitalReceiptLinkView, setIsDigitalReceiptLinkView] = useState(false);
  const [shouldAutoSendWaOnReceipt, setShouldAutoSendWaOnReceipt] = useState(false);
  const [shouldAutoPrintOnReceipt, setShouldAutoPrintOnReceipt] = useState(false);
  const [lastCompletedTransaction, setLastCompletedTransaction] = useState<Transaction | null>(null);
  const [quickPrintFeedback, setQuickPrintFeedback] = useState<{
    status: 'PRINTING' | 'SUCCESS' | 'ERROR';
    invoiceNumber: string;
    deviceName: string;
    message: string;
    transaction: Transaction;
  } | null>(null);
  const quickPrintDismissTimerRef = useRef<number | null>(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerInitialMode, setScannerInitialMode] = useState<ScannerModalMode>('SCAN');
  const [scanFeedbackNotice, setScanFeedbackNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [cashWithdrawalAlertToast, setCashWithdrawalAlertToast] = useState<{
    title: string;
    message: string;
    requestedAmount: number;
    availableBalance: number;
    shortfall: number;
    timestamp: number;
  } | null>(null);
  const cashWithdrawalAlertTimerRef = useRef<number | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isSwitchUserModalOpen, setIsSwitchUserModalOpen] = useState(false);
  const [isShiftSummaryModalOpen, setIsShiftSummaryModalOpen] = useState(false);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);

  // Cloud Sync & Offline Mode Queue state
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('CONNECTING');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [syncRetryNonce, setSyncRetryNonce] = useState<number>(0);
  const [pendingSyncQueueCount, setPendingSyncQueueCount] = useState<number>(0);
  const [focusFirestoreSettingsNonce, setFocusFirestoreSettingsNonce] = useState<number>(0);
  const [offlineQueueJobs, setOfflineQueueJobs] = useState<OfflineSyncJob[]>([]);
  const [isBrowserOnline, setIsBrowserOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  const [isOfflineQueueModalOpen, setIsOfflineQueueModalOpen] = useState(false);
  const [isGoogleDriveBackupModalOpen, setIsGoogleDriveBackupModalOpen] = useState(false);
  const [isAutoSyncingOffline, setIsAutoSyncingOffline] = useState(false);
  const [offlineSyncResultToast, setOfflineSyncResultToast] = useState<string | null>(null);

  // Sync Telemetry, Per-Collection Background Progress & Conflict Health Audit State
  const [syncActivityLogs, setSyncActivityLogs] = useState<SyncActivityLogEntry[]>(() =>
    getSyncActivityLogs()
  );
  const [syncModuleSummaries, setSyncModuleSummaries] = useState<SyncModuleSummary[]>(() =>
    getSyncModuleSummaries()
  );
  const [backgroundSyncProgress, setBackgroundSyncProgress] =
    useState<BackgroundSyncProgressSnapshot>(() => getBackgroundSyncProgress());
  const [syncAuditReport, setSyncAuditReport] = useState<SyncHealthAuditReport | null>(null);
  const [isScanningSyncHealth, setIsScanningSyncHealth] = useState(false);
  const [isResolvingBulkSyncConflicts, setIsResolvingBulkSyncConflicts] = useState(false);
  const [resolvingConflictId, setResolvingConflictId] = useState<string | null>(null);
  const [syncHealthScanError, setSyncHealthScanError] = useState<string | null>(null);
  const hasAutoAuditedSyncRef = useRef(false);

  useEffect(() => {
    return subscribePendingSyncQueue((count) => {
      setPendingSyncQueueCount(count);
    });
  }, []);

  useEffect(() => {
    return subscribeOfflineSyncQueue((jobs) => {
      setOfflineQueueJobs(jobs);
    });
  }, []);

  useEffect(() => {
    return subscribeSyncActivityLogs(({ logs, summaries }) => {
      setSyncActivityLogs(logs);
      setSyncModuleSummaries(summaries);
    });
  }, []);

  useEffect(() => {
    return subscribeBackgroundSyncProgress((snap) => {
      setBackgroundSyncProgress(snap);
    });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => setIsBrowserOnline(true);
    const onOffline = () => setIsBrowserOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!offlineSyncResultToast) return;
    const timer = window.setTimeout(() => {
      setOfflineSyncResultToast(null);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [offlineSyncResultToast]);

  // Automatic stability-checked sync when device connectivity returns and queue has pending jobs
  useEffect(() => {
    if (!isBrowserOnline || storeSettings.manualOfflineMode || offlineQueueJobs.length === 0) {
      return;
    }

    let cancelled = false;
    const runStabilityAutoSync = async () => {
      if (cancelled || isAutoSyncingOffline) return;
      const beforeCount = getOfflineQueueCount();
      if (beforeCount <= 0) return;

      setIsAutoSyncingOffline(true);
      try {
        const result = await verifyFirestoreServerConnection({
          forceResumeNetwork: true,
          flushPendingQueue: true,
          operationLabel: 'AUTO SYNC OFFLINE',
        });
        if (cancelled) return;
        const afterCount = getOfflineQueueCount();
        const syncedNow = Math.max(0, beforeCount - afterCount);
        if (result.ok) {
          setCloudSyncError(null);
          setCloudSyncStatus('SYNCED');
        }
        if (syncedNow > 0) {
          sound.playSuccessChime();
          setOfflineSyncResultToast(
            `${syncedNow} data antrean Mode Offline berhasil disinkronkan otomatis ke Firebase.${
              afterCount > 0 ? ` Sisa antrean: ${afterCount}.` : ''
            }`
          );
        }
      } catch {
        // Queue stays safely persisted in localStorage and will retry
      } finally {
        if (!cancelled) {
          setIsAutoSyncingOffline(false);
        }
      }
    };

    const initialTimer = window.setTimeout(() => {
      void runStabilityAutoSync();
    }, 1500);
    const retryInterval = window.setInterval(() => {
      if (getOfflineQueueCount() > 0 && navigator.onLine !== false) {
        void runStabilityAutoSync();
      }
    }, 30000);

    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(retryInterval);
    };
  }, [isBrowserOnline, storeSettings.manualOfflineMode, offlineQueueJobs.length]);

  // Automated Daily Multi-Product & Scheduled Low-Stock Admin WhatsApp Alert state
  const [adminLowStockWaAlert, setAdminLowStockWaAlert] = useState<{
    hits: DailyLowStockHit[];
    totalLowStockProducts: number;
    message: string;
    waUrl: string;
    hasAdminPhone: boolean;
    triggeredAt: number;
    autoLaunchPending: boolean;
    triggerSource?: 'THRESHOLD' | 'SCHEDULED';
    scheduleLabel?: string;
  } | null>(null);
  const [copiedAdminWaAlert, setCopiedAdminWaAlert] = useState(false);
  const adminWaAnchorRef = useRef<HTMLAnchorElement>(null);

  // Scheduled Daily Closing Sales Report Admin WhatsApp Alert state
  const [adminDailySalesWaAlert, setAdminDailySalesWaAlert] = useState<{
    summary: DailySalesClosingSummary;
    scheduleLabel: string;
    message: string;
    waUrl: string;
    hasAdminPhone: boolean;
    triggeredAt: number;
    autoLaunchPending: boolean;
  } | null>(null);
  const [copiedAdminDailySalesWa, setCopiedAdminDailySalesWa] = useState(false);
  const adminDailySalesWaAnchorRef = useRef<HTMLAnchorElement>(null);

  const prevProductsStockRef = useRef<Map<string, { stock: number; minStockAlert: number }>>(new Map());
  const hasSeededStockTrackerRef = useRef(false);

  // Automatic Startup & Continuous Batch Integrity Verification Script
  const lastBatchCheckSourceRef = useRef<'STARTUP' | 'CLOUD_SYNC' | 'POST_OPNAME' | 'MANUAL'>('STARTUP');
  const [batchIntegrityReport, setBatchIntegrityReport] = useState<BatchIntegrityCheckReport>(() =>
    runBatchIntegrityCheck(products, { source: 'STARTUP' })
  );
  const [dismissedBatchAlertSig, setDismissedBatchAlertSig] = useState<string | null>(null);
  const [openVerifyStockNonce, setOpenVerifyStockNonce] = useState<number>(0);

  const batchIntegrityIssueSig = useMemo(() => {
    if (batchIntegrityReport.isClean) return '';
    return batchIntegrityReport.issueItems
      .map((item) => `${item.product.id}:${item.discrepancy}:${item.negativeBatches.length}:${item.hasNegativeTotal ? 1 : 0}`)
      .join('|');
  }, [batchIntegrityReport]);

  useEffect(() => {
    const source = lastBatchCheckSourceRef.current;
    const report = runBatchIntegrityCheck(products, { source });
    setBatchIntegrityReport(report);
    if (!report.isClean) {
      console.warn(
        `[BatchIntegrity:${source}] Ditemukan ${report.criticalIssuesCount} produk bermasalah (batch negatif: ${report.negativeBatchProductsCount}, mismatch stok-batch: ${report.mismatchProductsCount}).`
      );
    }
    lastBatchCheckSourceRef.current = 'MANUAL';
  }, [products]);

  const handleRecheckBatchIntegrity = (source: 'STARTUP' | 'CLOUD_SYNC' | 'POST_OPNAME' | 'MANUAL' = 'MANUAL') => {
    const report = runBatchIntegrityCheck(products, { source });
    setBatchIntegrityReport(report);
    setDismissedBatchAlertSig(null);
    return report;
  };

  const handleAutoFixAllBatchIntegrity = () => {
    const { updatedProducts, fixedCount, fixedProducts } = reconcileBatchIntegrityIssues(products);
    if (fixedCount <= 0) {
      setBatchIntegrityReport(runBatchIntegrityCheck(products, { source: 'MANUAL' }));
      return 0;
    }
    lastBatchCheckSourceRef.current = 'MANUAL';
    setProducts(updatedProducts);
    saveBatchToFirestore('products', fixedProducts).catch(() => {});
    recordActivityLog({
      actionType: 'MANUAL_STOCK_ADJUSTMENT',
      targetType: 'PRODUCT',
      targetId: fixedProducts[0]?.id || 'batch_integrity_fix',
      targetLabel: `Perbaikan Integritas ${fixedCount} Produk Batch`,
      summary: `Sinkronisasi & perbaikan otomatis batch negatif/selisih untuk ${fixedCount} SKU oleh ${currentUser.name}`,
      oldValue: `${batchIntegrityReport.criticalIssuesCount} SKU bermasalah`,
      newValue: '0 SKU bermasalah (Batch Valid >= 0)',
      deltaValue: `${fixedCount} SKU diperbaiki`,
      numericDelta: fixedCount,
      reason: 'Perbaikan otomatis pengecekan integritas batch barang',
    });
    sound.playSuccessChime();
    setOfflineSyncResultToast(
      `Integritas batch ${fixedCount} produk berhasil diperbaiki (nol stok negatif & batch sinkron).`
    );
    return fixedCount;
  };

  // Sync state to localStorage asynchronously in background (debounced idle write) so UI stays responsive
  useEffect(() => scheduleSaveStorage('kasir_users', users), [users]);
  useEffect(() => scheduleSaveStorage('kasir_active_user', currentUser), [currentUser]);
  useEffect(() => scheduleSaveStorage('kasir_products', products), [products]);
  useEffect(() => scheduleSaveStorage('kasir_purchases', purchases), [purchases]);
  useEffect(() => scheduleSaveStorage('kasir_categories', categories), [categories]);
  useEffect(() => scheduleSaveStorage('kasir_customer_categories', customerCategories), [customerCategories]);
  useEffect(() => scheduleSaveStorage('kasir_customers', customers), [customers]);
  useEffect(() => scheduleSaveStorage('kasir_suppliers', suppliers), [suppliers]);
  useEffect(() => scheduleSaveStorage('kasir_transactions', transactions), [transactions]);
  useEffect(() => scheduleSaveStorage('kasir_attendances', attendances), [attendances]);
  useEffect(() => scheduleSaveStorage('kasir_stock_opnames', stockOpnames), [stockOpnames]);
  useEffect(() => scheduleSaveStorage('kasir_cashflows', cashflows), [cashflows]);
  useEffect(() => scheduleSaveStorage('kasir_online_orders', onlineOrders), [onlineOrders]);
  useEffect(() => scheduleSaveStorage('kasir_activity_logs', activityLogs), [activityLogs]);
  useEffect(() => scheduleSaveStorage('kasir_tax_records', taxRecords), [taxRecords]);
  useEffect(() => scheduleSaveStorage('kasir_tax_audit_logs', taxAuditLogs), [taxAuditLogs]);
  useEffect(() => scheduleSaveStorage('kasir_tax_adjustments', taxAdjustments), [taxAdjustments]);
  useEffect(() => scheduleSaveStorage('kasir_balance_sheet_entries', balanceSheetEntries), [balanceSheetEntries]);
  useEffect(() => scheduleSaveStorage('kasir_settings', storeSettings), [storeSettings]);

  // O(1) Product & Barcode lookup indexes to avoid linear scans across large catalogs
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (let i = 0; i < products.length; i++) {
      map.set(products[i].id, products[i]);
    }
    return map;
  }, [products]);

  const scanLookupMap = useMemo(() => {
    const map = new Map<string, { product: Product; unit: ProductUnit; variantName?: string; matchLabel: string }>();
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const baseUnit = product.units?.[0];
      if (!baseUnit) continue;

      if (product.barcode) {
        const key = product.barcode.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { product, unit: baseUnit, matchLabel: `${product.name} (${product.sku || product.barcode})` });
        }
      }
      if (product.sku) {
        const key = product.sku.toLowerCase();
        if (!map.has(key)) {
          map.set(key, { product, unit: baseUnit, matchLabel: `${product.name} (${product.sku || product.barcode})` });
        }
      }
      for (let uIdx = 0; uIdx < product.units.length; uIdx++) {
        const unit = product.units[uIdx];
        if (unit.barcode) {
          const key = unit.barcode.toLowerCase();
          if (!map.has(key)) {
            map.set(key, { product, unit, matchLabel: `${product.name} - ${unit.unitName}` });
          }
        }
      }
      if (product.variants) {
        for (let vIdx = 0; vIdx < product.variants.length; vIdx++) {
          const variant = product.variants[vIdx];
          if (variant.barcode) {
            const key = variant.barcode.toLowerCase();
            if (!map.has(key)) {
              map.set(key, { product, unit: baseUnit, variantName: variant.name, matchLabel: `${product.name} (${variant.name})` });
            }
          }
          if (variant.sku) {
            const key = variant.sku.toLowerCase();
            if (!map.has(key)) {
              map.set(key, { product, unit: baseUnit, variantName: variant.name, matchLabel: `${product.name} (${variant.name})` });
            }
          }
        }
      }
    }
    return map;
  }, [products]);

  const latestSyncStateRef = useRef({
    users,
    storeSettings,
    products,
    purchases,
    categories,
    customerCategories,
    customers,
    suppliers,
    transactions,
    attendances,
    stockOpnames,
    cashflows,
    onlineOrders,
    activityLogs,
    taxRecords,
    taxAuditLogs,
    taxAdjustments,
    balanceSheetEntries,
  });
  latestSyncStateRef.current = {
    users,
    storeSettings,
    products,
    purchases,
    categories,
    customerCategories,
    customers,
    suppliers,
    transactions,
    attendances,
    stockOpnames,
    cashflows,
    onlineOrders,
    activityLogs,
    taxRecords,
    taxAuditLogs,
    taxAdjustments,
    balanceSheetEntries,
  };

  // Real-time Firestore Multi-Device Synchronization & Connection
  useEffect(() => {
    if (storeSettings.manualOfflineMode) {
      pauseFirestoreCloudSync().catch(() => {});
      setCloudSyncError(null);
      setCloudSyncStatus('OFFLINE');
      return;
    }

    let active = true;
    let hasListenerError = false;
    let unsubs: Array<() => void> = [];
    setCloudSyncError(null);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setCloudSyncStatus('OFFLINE');
      setCloudSyncError('Perangkat tidak terhubung ke internet (Offline).');
    } else {
      setCloudSyncStatus('CONNECTING');
    }

    let hasLoggedSessionSync = false;
    let bootstrapDone = false;
    let seededUsersOk = false;
    let seededSettingsOk = false;
    let seededCustCatsOk = false;
    let bootstrapPermBlocked = false;
    let bootstrapAttemptCount = 0;
    let bootstrapNextRetryAt = 0;
    const MAX_BOOTSTRAP_ATTEMPTS = 3;
    const BOOTSTRAP_RETRY_COOLDOWN_MS = 20000;
    let bootstrapInFlight: Promise<boolean> | null = null;
    let hasSettingsServerSnapshot = false;
    let hasUsersServerSnapshot = false;
    let serverHasSettingsDoc = false;
    let serverHasUsersDoc = false;
    const backfilledCollections = new Set<string>();
    const loggedSessionDownloads = new Set<string>();
    const pendingEmptyEvaluations = new Map<string, () => void>();

    const isBootstrapCoreResolved = () => hasSettingsServerSnapshot || hasUsersServerSnapshot;
    const flushPendingEmptyEvaluations = () => {
      if (!active || pendingEmptyEvaluations.size === 0) return;
      const tasks = Array.from(pendingEmptyEvaluations.values());
      pendingEmptyEvaluations.clear();
      tasks.forEach((fn) => fn());
    };

    // Bootstrap default accounts & settings if missing (throttled & halted immediately on permission-denied)
    const bootstrapStore = async (options?: { force?: boolean }): Promise<boolean> => {
      if (!active) return false;
      if (seededUsersOk && seededSettingsOk && seededCustCatsOk) {
        bootstrapDone = true;
        return true;
      }
      if (bootstrapInFlight) return bootstrapInFlight;
      if (!options?.force) {
        if (bootstrapPermBlocked) return false;
        if (bootstrapAttemptCount >= MAX_BOOTSTRAP_ATTEMPTS) return false;
        if (Date.now() < bootstrapNextRetryAt) return false;
      }

      bootstrapInFlight = (async () => {
        try {
          bootstrapAttemptCount += 1;
          const snapshot = latestSyncStateRef.current;
          const seedUsers = snapshot.users.length > 0 ? snapshot.users : INITIAL_USERS;
          const seedSettings = [{ ...(snapshot.storeSettings || INITIAL_STORE_SETTINGS), id: 'store_config' }];
          const seedCustCats =
            snapshot.customerCategories.length > 0
              ? snapshot.customerCategories
              : INITIAL_CUSTOMER_CATEGORIES;

          const [resUsers, resSettings, resCustCats] = await Promise.all([
            seededUsersOk
              ? Promise.resolve({ ok: true })
              : seedCollectionIfEmptyWithResult('users', seedUsers, { ignoreUserClearedFlag: true }),
            seededSettingsOk
              ? Promise.resolve({ ok: true })
              : seedCollectionIfEmptyWithResult('settings', seedSettings, { ignoreUserClearedFlag: true }),
            seededCustCatsOk
              ? Promise.resolve({ ok: true })
              : seedCollectionIfEmptyWithResult('customer_categories', seedCustCats, {
                  ignoreUserClearedFlag: true,
                }),
          ]);

          if (resUsers.ok) seededUsersOk = true;
          if (resSettings.ok) seededSettingsOk = true;
          if (resCustCats.ok) seededCustCatsOk = true;

          if (
            ('permissionDenied' in resUsers && resUsers.permissionDenied) ||
            ('permissionDenied' in resSettings && resSettings.permissionDenied) ||
            ('permissionDenied' in resCustCats && resCustCats.permissionDenied)
          ) {
            bootstrapPermBlocked = true;
          }

          const allOk = seededUsersOk && seededSettingsOk && seededCustCatsOk;
          if (allOk) {
            bootstrapDone = true;
            bootstrapNextRetryAt = 0;
          } else {
            bootstrapNextRetryAt = Date.now() + BOOTSTRAP_RETRY_COOLDOWN_MS;
          }
          return allOk;
        } catch (err) {
          bootstrapNextRetryAt = Date.now() + BOOTSTRAP_RETRY_COOLDOWN_MS;
          console.warn('[CloudSync] Bootstrap notice:', err);
          return false;
        } finally {
          bootstrapInFlight = null;
        }
      })();
      return bootstrapInFlight;
    };

    const handleCollectionSyncError = (collectionName: string) => (err: Error) => {
      if (!active) return;
      hasLoggedSessionSync = false;
      hasListenerError = true;
      logFirestoreError(err, OperationType.LIST, collectionName);
      const formatted = formatFirestoreSyncErrorMessage(err);
      recordModuleSyncActivity({
        collectionName,
        direction: 'DOWNLOAD',
        operation: 'SNAPSHOT_SYNC',
        status: 'ERROR',
        recordCount: 0,
        summary: `Listener real-time ${getSyncModuleLabel(collectionName)} terputus/gagal.`,
        errorMessage: formatted,
        errorCode: String((err as { code?: unknown })?.code || '') || undefined,
      });
      setCloudSyncError(formatted);
      setCloudSyncStatus('OFFLINE');
    };

    const markSynced = () => {
      if (!active) return;
      setCloudSyncError(null);
      setCloudSyncStatus('SYNCED');
      if (!hasLoggedSessionSync) {
        hasLoggedSessionSync = true;
        appendFirestoreConnectionLog({
          status: 'SUCCESS',
          operation: 'SINKRONISASI REAL-TIME',
          message: 'Seluruh listener koleksi Firebase Firestore aktif dan tersinkronisasi dengan server.',
        });
      }
    };

    const verifyServerConnection = async () => {
      if (!active) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setCloudSyncStatus('OFFLINE');
        setCloudSyncError('Perangkat tidak terhubung ke internet (Offline).');
        appendFirestoreConnectionLog({
          status: 'ERROR',
          operation: 'INISIALISASI',
          message: 'Perangkat tidak terhubung ke internet (Offline).',
          errorCode: 'network-offline',
        });
        return;
      }
      const result = await verifyFirestoreServerConnection({
        flushPendingQueue: !storeSettings.manualOfflineMode && getOfflineQueueCount() > 0,
        operationLabel: 'VERIFIKASI REKONEKSI',
      });
      if (!active) return;
      if (result.ok) {
        markSynced();
        if (!bootstrapDone && !bootstrapPermBlocked) {
          void bootstrapStore();
        }
      } else {
        setCloudSyncStatus((prev) => (prev === 'SYNCED' ? 'SYNCED' : 'OFFLINE'));
        setCloudSyncError((prev) => prev || result.message);
      }
    };

    const handleWindowOnline = () => {
      if (!active) return;
      setIsBrowserOnline(true);
      setCloudSyncError(null);
      setCloudSyncStatus('CONNECTING');
      appendFirestoreConnectionLog({
        status: 'INFO',
        operation: 'JARINGAN',
        message: 'Koneksi internet perangkat kembali online. Mencoba menghubungkan ulang Firestore...',
      });
      if (hasListenerError) {
        setSyncRetryNonce((n) => n + 1);
      } else {
        verifyServerConnection();
      }
    };

    const handleWindowOffline = () => {
      if (!active) return;
      setIsBrowserOnline(false);
      setCloudSyncStatus('OFFLINE');
      setCloudSyncError('Perangkat tidak terhubung ke internet (Offline).');
      appendFirestoreConnectionLog({
        status: 'ERROR',
        operation: 'JARINGAN',
        message: 'Perangkat kehilangan koneksi internet (Browser Offline).',
        errorCode: 'network-offline',
      });
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleWindowOnline);
      window.addEventListener('offline', handleWindowOffline);
    }

    const applyProtectedCollectionSnapshot = <T extends { id: string }>(
      collectionName: string,
      cloudItems: T[],
      getLocalItems: () => T[],
      meta: { fromCache: boolean; hasPendingWrites: boolean } | undefined,
      applyItems: (items: T[]) => void,
      transform?: (items: T[]) => T[],
      options?: { allowAutoBackfill?: boolean }
    ) => {
      if (!active) return;
      const fromCache = Boolean(meta?.fromCache);
      const localItems = getLocalItems();
      const merged = mergeOfflinePendingCollection(collectionName, cloudItems);

      if (!fromCache && cloudItems.length > 0) {
        pendingEmptyEvaluations.delete(collectionName);
        recordCloudNonEmptyCollection(collectionName, cloudItems.length);
        if (!loggedSessionDownloads.has(collectionName)) {
          loggedSessionDownloads.add(collectionName);
          recordModuleSyncActivity({
            collectionName,
            direction: 'DOWNLOAD',
            operation: 'SNAPSHOT_SYNC',
            status: 'SUCCESS',
            recordCount: cloudItems.length,
            summary: `Sinkronisasi real-time ${cloudItems.length} data ${getSyncModuleLabel(collectionName)} dari server.`,
          });
        }
      }

      const wasPrevNonEmpty = wasPreviouslyNonEmptyOnServer(collectionName);
      // Wait for settings/users server confirmation before accepting a remote-clear of previously synced data
      if (
        !fromCache &&
        merged.length === 0 &&
        localItems.length > 0 &&
        wasPrevNonEmpty &&
        !isBootstrapCoreResolved() &&
        !isUserExplicitlyClearedDatabase()
      ) {
        pendingEmptyEvaluations.set(collectionName, () => {
          applyProtectedCollectionSnapshot(
            collectionName,
            cloudItems,
            getLocalItems,
            meta,
            applyItems,
            transform,
            options
          );
        });
        return;
      }

      const protection = evaluateCloudEmptySnapshotProtection({
        collectionName,
        mergedItemsCount: merged.length,
        localItemsCount: localItems.length,
        fromCache,
        isUserClearedDb: isUserExplicitlyClearedDatabase(),
        serverHasBootstrapCore: serverHasSettingsDoc || serverHasUsersDoc,
        wasPreviouslyNonEmpty: wasPrevNonEmpty,
      });

      if (protection.action === 'KEEP_LOCAL_ONLY') {
        return;
      }

      if (protection.action === 'KEEP_LOCAL_AND_BACKFILL') {
        const allowBackfill = options?.allowAutoBackfill !== false;
        if (allowBackfill && localItems.length > 0 && !backfilledCollections.has(collectionName)) {
          backfilledCollections.add(collectionName);
          saveBatchToFirestore(collectionName, localItems).catch(() => {
            backfilledCollections.delete(collectionName);
          });
          appendFirestoreConnectionLog({
            status: 'INFO',
            operation: `PROTEKSI DATA (${collectionName})`,
            message: `Server Firestore kosong untuk koleksi ${collectionName}. Mempertahankan ${localItems.length} data lokal & menyinkronkan ulang ke server.`,
          });
          setOfflineSyncResultToast(
            `Proteksi Sinkronisasi: ${localItems.length} data ${collectionName} lokal dipertahankan & disinkronkan ke server.`
          );
        }
        if (!fromCache) markSynced();
        return;
      }

      const finalItems = transform ? transform(merged) : merged;
      applyItems(finalItems);
      if (!fromCache) markSynced();
    };

    const attachRealtimeListeners = async () => {
      await resumeFirestoreCloudSync().catch(() => {});
      if (!active) return;

      verifyServerConnection();
      void bootstrapStore();

      // Real-time Listeners across all devices (protected against empty cache wipes & empty-server overwrites)
      unsubs = [
        subscribeToCollection<Product>(
          'products',
          (cloudProds, meta) =>
            applyProtectedCollectionSnapshot(
              'products',
              cloudProds,
              () => latestSyncStateRef.current.products,
              meta,
              (next) => {
                lastBatchCheckSourceRef.current = 'CLOUD_SYNC';
                setProducts(next);
              },
              sanitizeProducts
            ),
          handleCollectionSyncError('products')
        ),

        subscribeToCollection<RestockOrder>(
          'purchases',
          (cloudPurchases, meta) =>
            applyProtectedCollectionSnapshot(
              'purchases',
              cloudPurchases,
              () => latestSyncStateRef.current.purchases,
              meta,
              setPurchases,
              (items) => [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            ),
          handleCollectionSyncError('purchases')
        ),

        subscribeToCollection<ProductCategory>(
          'categories',
          (cloudCats, meta) =>
            applyProtectedCollectionSnapshot(
              'categories',
              cloudCats,
              () => latestSyncStateRef.current.categories,
              meta,
              setCategories
            ),
          handleCollectionSyncError('categories')
        ),

        subscribeToCollection<CustomerCategoryItem>(
          'customer_categories',
          (cloudCats, meta) =>
            applyProtectedCollectionSnapshot(
              'customer_categories',
              cloudCats,
              () => latestSyncStateRef.current.customerCategories,
              meta,
              (next) => {
                if (next.length > 0) setCustomerCategories(next);
              }
            ),
          handleCollectionSyncError('customer_categories')
        ),

        subscribeToCollection<Customer>(
          'customers',
          (cloudCusts, meta) =>
            applyProtectedCollectionSnapshot(
              'customers',
              cloudCusts,
              () => latestSyncStateRef.current.customers,
              meta,
              setCustomers
            ),
          handleCollectionSyncError('customers')
        ),

        subscribeToCollection<Supplier>(
          'suppliers',
          (cloudSups, meta) =>
            applyProtectedCollectionSnapshot(
              'suppliers',
              cloudSups,
              () => latestSyncStateRef.current.suppliers,
              meta,
              setSuppliers
            ),
          handleCollectionSyncError('suppliers')
        ),

        subscribeToCollection<Transaction>(
          'transactions',
          (cloudTxs, meta) =>
            applyProtectedCollectionSnapshot(
              'transactions',
              cloudTxs,
              () => latestSyncStateRef.current.transactions,
              meta,
              setTransactions,
              (items) => [...items].sort((a, b) => b.timestamp - a.timestamp)
            ),
          handleCollectionSyncError('transactions')
        ),

        subscribeToCollection<AttendanceRecord>(
          'attendances',
          (cloudAtt, meta) =>
            applyProtectedCollectionSnapshot(
              'attendances',
              cloudAtt,
              () => latestSyncStateRef.current.attendances,
              meta,
              setAttendances
            ),
          handleCollectionSyncError('attendances')
        ),

        subscribeToCollection<StockOpnameRecord>(
          'stock_opnames',
          (cloudOpnames, meta) =>
            applyProtectedCollectionSnapshot(
              'stock_opnames',
              cloudOpnames,
              () => latestSyncStateRef.current.stockOpnames,
              meta,
              setStockOpnames
            ),
          handleCollectionSyncError('stock_opnames')
        ),

        subscribeToCollection<CashflowRecord>(
          'cashflows',
          (cloudCashflows, meta) =>
            applyProtectedCollectionSnapshot(
              'cashflows',
              cloudCashflows,
              () => latestSyncStateRef.current.cashflows,
              meta,
              setCashflows,
              (items) => [...items].sort((a, b) => b.timestamp - a.timestamp)
            ),
          handleCollectionSyncError('cashflows')
        ),

        subscribeToCollection<OnlineOrder>(
          'online_orders',
          (cloudOrders, meta) =>
            applyProtectedCollectionSnapshot(
              'online_orders',
              cloudOrders,
              () => latestSyncStateRef.current.onlineOrders,
              meta,
              setOnlineOrders,
              (items) => [...items].sort((a, b) => b.createdAt - a.createdAt)
            ),
          handleCollectionSyncError('online_orders')
        ),

        subscribeToCollection<EmployeeActivityLog>(
          'activity_logs',
          (cloudLogs, meta) =>
            applyProtectedCollectionSnapshot(
              'activity_logs',
              cloudLogs,
              () => latestSyncStateRef.current.activityLogs,
              meta,
              setActivityLogs,
              (items) => [...items].sort((a, b) => b.timestamp - a.timestamp)
            ),
          handleCollectionSyncError('activity_logs')
        ),

        subscribeToCollection<TaxRecord>(
          'tax_records',
          (cloudTaxes, meta) =>
            applyProtectedCollectionSnapshot(
              'tax_records',
              cloudTaxes,
              () => latestSyncStateRef.current.taxRecords,
              meta,
              setTaxRecords,
              (items) => [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            ),
          handleCollectionSyncError('tax_records')
        ),

        subscribeToCollection<TaxAuditLog>(
          'tax_audit_logs',
          (cloudAuditLogs, meta) =>
            applyProtectedCollectionSnapshot(
              'tax_audit_logs',
              cloudAuditLogs,
              () => latestSyncStateRef.current.taxAuditLogs,
              meta,
              setTaxAuditLogs,
              (items) => [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            ),
          handleCollectionSyncError('tax_audit_logs')
        ),

        subscribeToCollection<TaxAdjustment>(
          'tax_adjustments',
          (cloudAdjustments, meta) =>
            applyProtectedCollectionSnapshot(
              'tax_adjustments',
              cloudAdjustments,
              () => latestSyncStateRef.current.taxAdjustments,
              meta,
              setTaxAdjustments,
              (items) => [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            ),
          handleCollectionSyncError('tax_adjustments')
        ),

        subscribeToCollection<BalanceSheetEntry>(
          'balance_sheet_entries',
          (cloudEntries, meta) =>
            applyProtectedCollectionSnapshot(
              'balance_sheet_entries',
              cloudEntries,
              () => latestSyncStateRef.current.balanceSheetEntries,
              meta,
              setBalanceSheetEntries,
              (items) => [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            ),
          handleCollectionSyncError('balance_sheet_entries')
        ),

        subscribeToCollection<User>('users', (cloudUsers, meta) => {
          if (!active) return;
          const fromCache = Boolean(meta?.fromCache);
          if (!fromCache) {
            hasUsersServerSnapshot = true;
            serverHasUsersDoc = cloudUsers.length > 0;
            if (cloudUsers.length > 0) {
              seededUsersOk = true;
              recordCloudNonEmptyCollection('users', cloudUsers.length);
            } else if (!bootstrapPermBlocked) {
              seededUsersOk = false;
              bootstrapDone = false;
              void bootstrapStore();
            }
            flushPendingEmptyEvaluations();
          }
          const merged = mergeOfflinePendingCollection('users', cloudUsers);
          if (merged.length > 0) {
            setUsers(merged);
            setCurrentUser((current) => {
              if (!merged.some((u) => u.id === current.id)) {
                return merged[0];
              }
              return current;
            });
          }
          if (!fromCache) markSynced();
        }, handleCollectionSyncError('users')),

        subscribeToCollection<any>('settings', (cloudSettingsList, meta) => {
          if (!active) return;
          const fromCache = Boolean(meta?.fromCache);
          const cfg = cloudSettingsList.find((s) => s.id === 'store_config');
          if (!fromCache) {
            hasSettingsServerSnapshot = true;
            serverHasSettingsDoc = Boolean(cfg);
            if (cfg) {
              seededSettingsOk = true;
              recordCloudNonEmptyCollection('settings', cloudSettingsList.length);
            } else if (!bootstrapPermBlocked) {
              seededSettingsOk = false;
              bootstrapDone = false;
              void bootstrapStore();
            }
            flushPendingEmptyEvaluations();
          }
          if (cfg) {
            const { id, ...rawRest } = cfg;
            const rest = mergeOfflinePendingSettings(rawRest as StoreSettings);
            setStoreSettings((prev) => ({
              ...prev,
              ...rest,
              dailySalesGoal: rest.dailySalesGoal && rest.dailySalesGoal > 0 ? rest.dailySalesGoal : (prev.dailySalesGoal ?? 5000000),
              weeklySalesGoal: rest.weeklySalesGoal && rest.weeklySalesGoal > 0 ? rest.weeklySalesGoal : (prev.weeklySalesGoal ?? 30000000),
              monthlySalesGoal: rest.monthlySalesGoal && rest.monthlySalesGoal > 0 ? rest.monthlySalesGoal : (prev.monthlySalesGoal ?? 120000000),
              categorySalesGoals: rest.categorySalesGoals && typeof rest.categorySalesGoals === 'object' ? rest.categorySalesGoals : (prev.categorySalesGoals ?? {}),
              autoSendWhatsAppReceipt: rest.autoSendWhatsAppReceipt !== undefined ? rest.autoSendWhatsAppReceipt : (prev.autoSendWhatsAppReceipt ?? false),
              includeReceiptSummaryInAutoWa: rest.includeReceiptSummaryInAutoWa !== undefined ? rest.includeReceiptSummaryInAutoWa : (prev.includeReceiptSummaryInAutoWa ?? true),
              includeLoyaltyPointsInAutoWa: rest.includeLoyaltyPointsInAutoWa !== undefined ? rest.includeLoyaltyPointsInAutoWa : (prev.includeLoyaltyPointsInAutoWa ?? true),
              useCustomWhatsAppTemplate: rest.useCustomWhatsAppTemplate !== undefined ? rest.useCustomWhatsAppTemplate : (prev.useCustomWhatsAppTemplate ?? false),
              customWhatsAppTemplate: rest.customWhatsAppTemplate !== undefined ? rest.customWhatsAppTemplate : (prev.customWhatsAppTemplate ?? INITIAL_STORE_SETTINGS.customWhatsAppTemplate),
              autoAdminLowStockWhatsApp: rest.autoAdminLowStockWhatsApp !== undefined ? rest.autoAdminLowStockWhatsApp : (prev.autoAdminLowStockWhatsApp ?? true),
              adminWhatsAppNumber: rest.adminWhatsAppNumber !== undefined ? rest.adminWhatsAppNumber : (prev.adminWhatsAppNumber ?? ''),
              adminLowStockTriggerCount: rest.adminLowStockTriggerCount && rest.adminLowStockTriggerCount >= 2 ? rest.adminLowStockTriggerCount : (prev.adminLowStockTriggerCount ?? 2),
              scheduledAdminLowStockWhatsApp: rest.scheduledAdminLowStockWhatsApp
                ? normalizeLowStockSchedule(rest.scheduledAdminLowStockWhatsApp)
                : (prev.scheduledAdminLowStockWhatsApp ?? DEFAULT_LOW_STOCK_SCHEDULE),
              scheduledDailySalesReportWhatsApp: rest.scheduledDailySalesReportWhatsApp
                ? normalizeDailySalesSchedule(rest.scheduledDailySalesReportWhatsApp)
                : (prev.scheduledDailySalesReportWhatsApp ?? DEFAULT_DAILY_SALES_SCHEDULE),
              printerConnectionType: rest.printerConnectionType || prev.printerConnectionType || 'BLUETOOTH',
              printerPaperWidth: rest.printerPaperWidth || prev.printerPaperWidth || '58mm',
              printerDeviceName: rest.printerDeviceName !== undefined ? rest.printerDeviceName : (prev.printerDeviceName || ''),
              printerAutoCut: rest.printerAutoCut !== undefined ? rest.printerAutoCut : (prev.printerAutoCut ?? true),
              autoPrintReceipt: rest.autoPrintReceipt !== undefined ? rest.autoPrintReceipt : (prev.autoPrintReceipt ?? false),
              requireTransactionNote: rest.requireTransactionNote !== undefined ? rest.requireTransactionNote : (prev.requireTransactionNote ?? false),
              taxConfig: rest.taxConfig
                ? {
                    ...(INITIAL_STORE_SETTINGS.taxConfig!),
                    ...(prev.taxConfig || {}),
                    ...rest.taxConfig,
                  }
                : prev.taxConfig ?? INITIAL_STORE_SETTINGS.taxConfig,
            }));
          }
          if (!fromCache) markSynced();
        }, handleCollectionSyncError('settings')),
      ];
    };

    attachRealtimeListeners();

    return () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleWindowOnline);
        window.removeEventListener('offline', handleWindowOffline);
      }
      unsubs.forEach((unsub) => unsub());
      unsubs = [];
    };
  }, [storeSettings.manualOfflineMode, syncRetryNonce]);

  // Keep selectedCustomer updated if customers list changes
  useEffect(() => {
    if (selectedCustomer) {
      const updated = customers.find((c) => c.id === selectedCustomer.id);
      if (updated) setSelectedCustomer(updated);
    }
  }, [customers]);

  // Auto-dismiss special price applied banner after 8 seconds
  useEffect(() => {
    if (!specialPriceNotice) return;
    const timer = setTimeout(() => {
      setSpecialPriceNotice(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [specialPriceNotice]);

  // Track daily products hitting/crossing minimum stock alert threshold across ALL stock mutations
  useEffect(() => {
    const physicalProducts = products.filter((p) => (p.productType || 'BARANG') !== 'JASA');

    // Initial hydration guard: wait for initial non-empty products snapshot before tracking transitions
    if (!hasSeededStockTrackerRef.current) {
      if (physicalProducts.length === 0) return;
      const initialMap = new Map<string, { stock: number; minStockAlert: number }>();
      physicalProducts.forEach((p) => {
        initialMap.set(p.id, { stock: p.stockInBaseUnit, minStockAlert: p.minStockAlert });
      });
      prevProductsStockRef.current = initialMap;
      hasSeededStockTrackerRef.current = true;
      return;
    }

    const prevMap = prevProductsStockRef.current;
    const crossedProducts: Product[] = [];

    physicalProducts.forEach((prod) => {
      const prev = prevMap.get(prod.id);
      if (!prev) {
        // Newly added physical product that already starts at/below threshold
        if (prod.stockInBaseUnit <= prod.minStockAlert) {
          crossedProducts.push(prod);
        }
        return;
      }

      const wasAboveThreshold = prev.stock > prev.minStockAlert;
      const isNowAtOrBelow = prod.stockInBaseUnit <= prod.minStockAlert;
      const stockDecreasedWhileLow = prev.stock > prod.stockInBaseUnit && isNowAtOrBelow;

      if ((wasAboveThreshold && isNowAtOrBelow) || stockDecreasedWhileLow) {
        crossedProducts.push(prod);
      }
    });

    // Update snapshot map for next transition comparison
    const nextMap = new Map<string, { stock: number; minStockAlert: number }>();
    physicalProducts.forEach((p) => {
      nextMap.set(p.id, { stock: p.stockInBaseUnit, minStockAlert: p.minStockAlert });
    });
    prevProductsStockRef.current = nextMap;

    if (crossedProducts.length === 0) return;

    const triggerCount = Math.max(2, Math.floor(storeSettings.adminLowStockTriggerCount ?? 2));
    const { ledger, shouldTrigger } = recordDailyLowStockHits(
      crossedProducts,
      physicalProducts,
      triggerCount
    );

    if (shouldTrigger && (storeSettings.autoAdminLowStockWhatsApp ?? true)) {
      const totalLowStockCount = physicalProducts.filter(
        (p) => p.stockInBaseUnit <= p.minStockAlert
      ).length;
      const nowTs = Date.now();
      const message = buildAdminLowStockWhatsAppMessage({
        storeName: storeSettings.storeName,
        hits: ledger.hits,
        totalLowStockProducts: totalLowStockCount,
        timestamp: nowTs,
        useCustomTemplate: storeSettings.useCustomLowStockWhatsAppTemplate,
        customTemplate: storeSettings.customLowStockWhatsAppTemplate,
      });
      const adminPhone = (storeSettings.adminWhatsAppNumber || '').trim();
      const hasAdminPhone = adminPhone.replace(/\D/g, '').length >= 8;
      const waUrl = buildAdminWhatsAppUrl(adminPhone, message);

      markDailyLowStockTriggered(ledger.hits.map((h) => h.productId));
      sound.playWarningChime();
      setCopiedAdminWaAlert(false);
      setAdminLowStockWaAlert({
        hits: ledger.hits,
        totalLowStockProducts: totalLowStockCount,
        message,
        waUrl,
        hasAdminPhone,
        triggeredAt: nowTs,
        autoLaunchPending: hasAdminPhone,
        triggerSource: 'THRESHOLD',
      });
    }
  }, [
    products,
    storeSettings.autoAdminLowStockWhatsApp,
    storeSettings.adminWhatsAppNumber,
    storeSettings.adminLowStockTriggerCount,
    storeSettings.useCustomLowStockWhatsAppTemplate,
    storeSettings.customLowStockWhatsAppTemplate,
    storeSettings.storeName,
  ]);

  // Scheduled recurring Admin WhatsApp Low-Stock Report checker (independent of daily threshold crossings)
  useEffect(() => {
    const scheduleCfg = normalizeLowStockSchedule(
      storeSettings.scheduledAdminLowStockWhatsApp
    );
    if (!scheduleCfg.enabled) return;

    const physicalProducts = products.filter(
      (p) => (p.productType || 'BARANG') !== 'JASA'
    );
    if (physicalProducts.length === 0) return;

    const checkAndDispatchScheduledReport = () => {
      const dispatchState = loadScheduledLowStockDispatch();
      const { isDue, slotKey, schedule } = evaluateScheduledLowStockDue(
        scheduleCfg,
        new Date(),
        dispatchState.lastDispatchedSlotKey
      );
      if (!isDue) return;

      const lowStockHits = collectLowStockHitsFromProducts(
        physicalProducts,
        schedule.includeOutOfStockSummary !== false
      );

      if (lowStockHits.length === 0 && !schedule.sendEvenIfAllSafe) {
        markScheduledLowStockDispatched(slotKey, 0);
        return;
      }

      const nowTs = Date.now();
      const message = buildScheduledLowStockWhatsAppMessage({
        storeName: storeSettings.storeName,
        hits: lowStockHits,
        totalPhysicalProducts: physicalProducts.length,
        schedule,
        timestamp: nowTs,
        useCustomTemplate: storeSettings.useCustomLowStockWhatsAppTemplate,
        customTemplate: storeSettings.customLowStockWhatsAppTemplate,
      });

      const adminPhone = (storeSettings.adminWhatsAppNumber || '').trim();
      const hasAdminPhone = adminPhone.replace(/\D/g, '').length >= 8;
      const waUrl = buildAdminWhatsAppUrl(adminPhone, message);

      markScheduledLowStockDispatched(slotKey, lowStockHits.length);
      sound.playWarningChime();
      setCopiedAdminWaAlert(false);
      setAdminLowStockWaAlert({
        hits: lowStockHits,
        totalLowStockProducts: lowStockHits.length,
        message,
        waUrl,
        hasAdminPhone,
        triggeredAt: nowTs,
        autoLaunchPending: hasAdminPhone,
        triggerSource: 'SCHEDULED',
        scheduleLabel: formatScheduleSummaryLabel(schedule),
      });
    };

    checkAndDispatchScheduledReport();
    const intervalId = window.setInterval(checkAndDispatchScheduledReport, 20000);
    return () => window.clearInterval(intervalId);
  }, [
    products,
    storeSettings.scheduledAdminLowStockWhatsApp,
    storeSettings.adminWhatsAppNumber,
    storeSettings.useCustomLowStockWhatsAppTemplate,
    storeSettings.customLowStockWhatsAppTemplate,
    storeSettings.storeName,
  ]);

  // Automatically trigger WhatsApp launch via hidden anchor when Admin low-stock alert triggers
  useEffect(() => {
    if (!adminLowStockWaAlert?.autoLaunchPending || !adminLowStockWaAlert.hasAdminPhone) return;
    const timer = setTimeout(() => {
      adminWaAnchorRef.current?.click();
      setAdminLowStockWaAlert((prev) =>
        prev ? { ...prev, autoLaunchPending: false } : null
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [adminLowStockWaAlert]);

  // Scheduled Daily Closing Sales Report via WhatsApp checker (triggers at configured closingTime + interval)
  useEffect(() => {
    const scheduleCfg = normalizeDailySalesSchedule(
      storeSettings.scheduledDailySalesReportWhatsApp
    );
    if (!scheduleCfg.enabled) return;

    const checkAndDispatchClosingSales = () => {
      const dispatchState = loadScheduledDailySalesDispatch();
      const { isDue, slotKey, todayKey, schedule } = evaluateScheduledDailySalesDue(
        scheduleCfg,
        new Date(),
        dispatchState
      );
      if (!isDue) return;

      const summary = computeTodaySalesClosingSummary({
        transactions,
        products,
        cashflows,
        targetDateKey: todayKey,
      });

      if (schedule.sendOnlyIfHasTransactions && summary.transactionCount === 0) {
        markScheduledDailySalesDispatched(slotKey, todayKey, 0, 0);
        return;
      }

      const nowTs = Date.now();
      const message = buildDailySalesClosingWhatsAppMessage({
        storeName: storeSettings.storeName,
        summary,
        schedule,
        timestamp: nowTs,
      });

      const adminPhone = (storeSettings.adminWhatsAppNumber || '').trim();
      const hasAdminPhone = adminPhone.replace(/\D/g, '').length >= 8;
      const waUrl = buildAdminWhatsAppUrl(adminPhone, message);

      markScheduledDailySalesDispatched(
        slotKey,
        todayKey,
        summary.transactionCount,
        summary.totalNetRevenue
      );
      sound.playSuccessChime();
      setCopiedAdminDailySalesWa(false);
      setAdminDailySalesWaAlert({
        summary,
        scheduleLabel: formatDailySalesScheduleSummaryLabel(schedule),
        message,
        waUrl,
        hasAdminPhone,
        triggeredAt: nowTs,
        autoLaunchPending: hasAdminPhone,
      });
    };

    checkAndDispatchClosingSales();
    const intervalId = window.setInterval(checkAndDispatchClosingSales, 20000);
    return () => window.clearInterval(intervalId);
  }, [
    transactions,
    products,
    cashflows,
    storeSettings.scheduledDailySalesReportWhatsApp,
    storeSettings.adminWhatsAppNumber,
    storeSettings.storeName,
  ]);

  // Automatically trigger WhatsApp launch via hidden anchor when Scheduled Daily Closing Sales alert triggers
  useEffect(() => {
    if (!adminDailySalesWaAlert?.autoLaunchPending || !adminDailySalesWaAlert.hasAdminPhone) return;
    const timer = setTimeout(() => {
      adminDailySalesWaAnchorRef.current?.click();
      setAdminDailySalesWaAlert((prev) =>
        prev ? { ...prev, autoLaunchPending: false } : null
      );
    }, 450);
    return () => clearTimeout(timer);
  }, [adminDailySalesWaAlert]);

  // Support opening transaction summary modal directly from shared ?invoice=... URL
  const handledInvoiceParamRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || transactions.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const invoiceParam = params.get('invoice');
    if (!invoiceParam || handledInvoiceParamRef.current === invoiceParam) return;
    const matchedTx = transactions.find(
      (t) => t.invoiceNumber.toLowerCase() === invoiceParam.trim().toLowerCase()
    );
    if (matchedTx) {
      handledInvoiceParamRef.current = invoiceParam;
      setShouldAutoSendWaOnReceipt(false);
      setShouldAutoPrintOnReceipt(false);
      setIsDigitalReceiptLinkView(true);
      setLastCompletedTransaction(matchedTx);
      setIsReceiptModalOpen(true);
    }
  }, [transactions]);

  // Helper to resolve customer's effective pricing category
  const getEffectiveCustomerCategory = (customer: Customer | null | undefined): string | undefined => {
    if (!customer) return undefined;
    const trimmed = customer.customerCategory?.trim();
    if (trimmed) return trimmed;
    return isCustomerMember(customer) ? 'MEMBER' : 'UMUM';
  };

  // =========================================================================
  // CART ACTIONS & MULTI-SATUAN (DENGAN HARGA KHUSUS KATEGORI PELANGGAN)
  // =========================================================================
  const handleSelectCustomer = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    setHasManualPointOverride(false);

    if (!customer || customer.id !== selectedCustomer?.id || !isCustomerMember(customer)) {
      setRequestedPoints(0);
    }

    const effectiveCategory = getEffectiveCustomerCategory(customer);
    let specialAppliedCount = 0;
    let totalSavedRupiah = 0;
    const appliedNames: string[] = [];

    // Check and automatically update customer special pricing & product promos for all items in cart
    const nextCart = cart.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) return item;

      // Keep manual cashier price override if explicitly edited
      if (item.isCustomPrice) return item;

      const freshUnit =
        product.units.find((u) => u.id === item.selectedUnit.id || u.unitName === item.selectedUnit.unitName) ||
        item.selectedUnit;

      const resolved = resolveProductDiscount(
        product,
        freshUnit,
        item.selectedVariant,
        customer,
        item.quantity
      );

      if (resolved.source === 'CUSTOMER_SPECIAL' && resolved.hasDiscount) {
        specialAppliedCount += 1;
        totalSavedRupiah += resolved.savingsPerUnit * item.quantity;
        if (!appliedNames.includes(item.productName)) {
          appliedNames.push(item.productName);
        }
      }

      return {
        ...item,
        selectedUnit: freshUnit,
        unitPrice: resolved.effectiveUnitPrice,
        subtotal: item.quantity * resolved.effectiveUnitPrice,
        isCustomerSpecialPrice: resolved.source === 'CUSTOMER_SPECIAL',
        customerPriceCategory:
          resolved.source === 'CUSTOMER_SPECIAL'
            ? resolved.customerPriceCategory || effectiveCategory
            : undefined,
        productDiscountPercent:
          resolved.source === 'PRODUCT_PROMO' ? resolved.discountPercent : undefined,
        promoLabel: resolved.promoLabel,
        originalUnitPrice: resolved.baseUnitPrice,
      };
    });

    setCart(nextCart);

    if (customer && effectiveCategory && specialAppliedCount > 0) {
      sound.playSuccessChime();
      setSpecialPriceNotice({
        customerName: customer.name,
        category: effectiveCategory,
        updatedCount: specialAppliedCount,
        totalSaved: totalSavedRupiah,
        itemNames: appliedNames,
        timestamp: Date.now(),
      });
    } else {
      setSpecialPriceNotice(null);
    }
  };

  const handleAddToCart = (product: Product, unit: ProductUnit, qtyToAdd = 1, selectedVariant?: string) => {
    sound.playTap();
    const existingIndex = cart.findIndex(
      (item) =>
        item.productId === product.id &&
        item.selectedUnit.id === unit.id &&
        (item.selectedVariant || '') === (selectedVariant || '')
    );

    const maxUnits = Math.floor(product.stockInBaseUnit / unit.conversionFactor);

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      const newQty = updatedCart[existingIndex].quantity + qtyToAdd;
      if (newQty > maxUnits) {
        alert(`Stok tidak mencukupi! Maksimal ${maxUnits} ${unit.unitName}`);
        return;
      }

      if (!updatedCart[existingIndex].isCustomPrice) {
        const resolved = resolveProductDiscount(
          product,
          unit,
          selectedVariant,
          selectedCustomer,
          newQty
        );
        updatedCart[existingIndex].unitPrice = resolved.effectiveUnitPrice;
        updatedCart[existingIndex].originalUnitPrice = resolved.baseUnitPrice;
        updatedCart[existingIndex].isCustomerSpecialPrice =
          resolved.source === 'CUSTOMER_SPECIAL';
        updatedCart[existingIndex].customerPriceCategory = resolved.customerPriceCategory;
        updatedCart[existingIndex].productDiscountPercent =
          resolved.source === 'PRODUCT_PROMO' ? resolved.discountPercent : undefined;
        updatedCart[existingIndex].promoLabel = resolved.promoLabel;
      }

      updatedCart[existingIndex].quantity = newQty;
      updatedCart[existingIndex].subtotal = newQty * updatedCart[existingIndex].unitPrice;
      setCart(updatedCart);
    } else {
      if (qtyToAdd > maxUnits) {
        alert(`Stok tidak mencukupi! Maksimal ${maxUnits} ${unit.unitName}`);
        return;
      }

      const resolved = resolveProductDiscount(
        product,
        unit,
        selectedVariant,
        selectedCustomer,
        qtyToAdd
      );

      const newItem: CartItem = {
        cartItemId: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        productId: product.id,
        productName: product.name,
        category: product.category,
        baseUnit: product.baseUnit,
        selectedUnit: unit,
        quantity: qtyToAdd,
        unitPrice: resolved.effectiveUnitPrice,
        originalUnitPrice: resolved.baseUnitPrice,
        subtotal: qtyToAdd * resolved.effectiveUnitPrice,
        availableStockInUnits: maxUnits,
        selectedVariant: selectedVariant || undefined,
        isService: product.productType === 'JASA',
        serviceNotes: product.serviceNotes,
        isCustomerSpecialPrice: resolved.source === 'CUSTOMER_SPECIAL',
        customerPriceCategory: resolved.customerPriceCategory,
        productDiscountPercent:
          resolved.source === 'PRODUCT_PROMO' ? resolved.discountPercent : undefined,
        promoLabel: resolved.promoLabel,
      };
      setCart([...cart, newItem]);
    }
  };

  const availableStoreCashBalance = useMemo(() => {
    const existingCashflowIds = new Set(cashflows.map((c) => c.id));

    const cashSalesTotal = transactions.reduce((sum, tx) => {
      const isCashTx = tx.paymentMethod === 'CASH' || tx.settledPaymentMethod === 'CASH';
      if (!isCashTx) return sum;
      const netAmount = Math.max(0, (tx.finalAmount || 0) - (tx.returnedAmount || 0));
      return sum + netAmount;
    }, 0);

    const cashInFromCashflows = cashflows.reduce((sum, cf) => {
      if (cf.type !== 'PEMASUKAN') return sum;
      if ((cf.paymentMethod || '').toUpperCase() !== 'CASH') return sum;
      if (cf.isCashWithdrawalAdminProfit || cf.category === 'Keuntungan Biaya Admin (Tarik Tunai)') {
        return sum;
      }
      return sum + Math.max(0, cf.amount || 0);
    }, 0);

    const cashOutFromCashflows = cashflows.reduce((sum, cf) => {
      if (cf.type !== 'PENGELUARAN') return sum;
      if ((cf.paymentMethod || '').toUpperCase() !== 'CASH') return sum;
      return sum + Math.max(0, cf.amount || 0);
    }, 0);

    const unrecordedWithdrawalOut = transactions.reduce((sum, tx) => {
      if (existingCashflowIds.has(`cf_tarik_${tx.id}`)) return sum;
      const txWithdrawal = (tx.items || []).reduce((itemSum, item) => {
        const isWd =
          Boolean(item.isCashWithdrawal) ||
          (Boolean(item.isQuickSale) && /tarik\s*tunai/i.test(item.productName || ''));
        if (!isWd) return itemSum;
        const principal =
          item.principalAmount !== undefined
            ? Math.max(0, item.principalAmount)
            : Math.max(0, item.costPrice || 0);
        return itemSum + Math.max(1, item.quantity || 1) * principal;
      }, 0);
      return sum + txWithdrawal;
    }, 0);

    return Math.max(0, cashSalesTotal + cashInFromCashflows - cashOutFromCashflows - unrecordedWithdrawalOut);
  }, [transactions, cashflows]);

  const triggerCashWithdrawalBlockedToast = ({
    requestedAmount,
    availableBalance,
    existingCartAmount = 0,
    customMessage,
  }: {
    requestedAmount: number;
    availableBalance: number;
    existingCartAmount?: number;
    customMessage?: string;
  }) => {
    sound.playError();
    const shortfall = Math.max(0, requestedAmount - availableBalance);
    const defaultMsg =
      availableBalance <= 0
        ? `Saldo kas toko saat ini Rp 0${
            existingCartAmount > 0 ? ` (sudah terpakai ${formatRupiah(existingCartAmount)} di keranjang)` : ''
          }. Penambahan item Tarik Tunai diblokir hingga modal kas tersedia.`
        : `Nominal Tarik Tunai (${formatRupiah(requestedAmount)}) melebihi sisa saldo kas toko yang tersedia (${formatRupiah(availableBalance)})${
            existingCartAmount > 0 ? ` — ${formatRupiah(existingCartAmount)} sudah di keranjang` : ''
          }.`;
    const finalMessage = customMessage || defaultMsg;

    setScanFeedbackNotice({
      type: 'error',
      message: `${finalMessage} Kekurangan kas: ${formatRupiah(shortfall)}.`,
    });

    if (cashWithdrawalAlertTimerRef.current !== null) {
      window.clearTimeout(cashWithdrawalAlertTimerRef.current);
    }
    setCashWithdrawalAlertToast({
      title: 'Penarikan Tunai Diblokir — Saldo Kas Tidak Cukup!',
      message: finalMessage,
      requestedAmount,
      availableBalance,
      shortfall,
      timestamp: Date.now(),
    });
    cashWithdrawalAlertTimerRef.current = window.setTimeout(() => {
      setCashWithdrawalAlertToast(null);
      cashWithdrawalAlertTimerRef.current = null;
    }, 8000);
  };

  const handleAddQuickSaleItem = ({
    description,
    amount,
    adminFee = 0,
    quantity,
    unitName = 'ITEM',
    isCashWithdrawal,
  }: {
    description: string;
    amount: number;
    adminFee?: number;
    quantity: number;
    unitName?: string;
    isCashWithdrawal?: boolean;
  }): { ok: boolean; error?: string; availableCashBalance?: number; blocked?: boolean } => {
    const cleanDesc = description.trim();
    const safeNominal = Math.max(0, Math.round(amount));
    const safeAdminFee = Math.max(0, Math.round(adminFee || 0));
    const totalUnitPrice = safeNominal + safeAdminFee;
    const safeQty = Math.max(1, quantity);
    const cleanUnit = unitName.trim().toUpperCase() || 'ITEM';
    if (!cleanDesc || safeNominal <= 0) {
      return { ok: false, error: 'Masukkan deskripsi dan nominal yang valid (> Rp 0).' };
    }

    const isTarikTunai = Boolean(isCashWithdrawal) || /tarik\s*tunai/i.test(cleanDesc);

    if (isTarikTunai) {
      const existingCartWithdrawalCash = cart.reduce((sum, item) => {
        const itemIsWd =
          Boolean(item.isCashWithdrawal) ||
          (Boolean(item.isQuickSale) && /tarik\s*tunai/i.test(item.productName || ''));
        if (!itemIsWd) return sum;
        const itemPrincipal =
          item.principalAmount !== undefined ? Math.max(0, item.principalAmount) : Math.max(0, item.unitPrice || 0);
        return sum + itemPrincipal * Math.max(1, item.quantity || 1);
      }, 0);

      const remainingAvailableCash = Math.max(0, availableStoreCashBalance - existingCartWithdrawalCash);
      const requestedWithdrawalCash = safeNominal * safeQty;

      if (remainingAvailableCash <= 0 || requestedWithdrawalCash > remainingAvailableCash) {
        const deficit = requestedWithdrawalCash - remainingAvailableCash;
        const errorMsg = `Penambahan ke keranjang diblokir: Nominal Tarik Tunai (${formatRupiah(requestedWithdrawalCash)}) melebihi sisa saldo kas toko tersedia (${formatRupiah(remainingAvailableCash)})${
          existingCartWithdrawalCash > 0 ? ` (${formatRupiah(existingCartWithdrawalCash)} sudah di keranjang)` : ''
        }. Kekurangan kas: ${formatRupiah(deficit)}.`;

        triggerCashWithdrawalBlockedToast({
          requestedAmount: requestedWithdrawalCash,
          availableBalance: remainingAvailableCash,
          existingCartAmount: existingCartWithdrawalCash,
          customMessage: errorMsg,
        });

        return {
          ok: false,
          blocked: true,
          error: errorMsg,
          availableCashBalance: remainingAvailableCash,
        };
      }
    }

    sound.playTap();
    const unitId = 'unit_qs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5);
    const quickSaleItem: CartItem = {
      cartItemId: 'qs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      productId: 'quick_sale_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
      productName: cleanDesc,
      category: 'Quick Sale',
      baseUnit: cleanUnit,
      selectedUnit: {
        id: unitId,
        unitName: cleanUnit,
        conversionFactor: 1,
        sellingPrice: totalUnitPrice,
        costPrice: isTarikTunai ? safeNominal : 0,
      },
      quantity: safeQty,
      unitPrice: totalUnitPrice,
      originalUnitPrice: totalUnitPrice,
      subtotal: safeQty * totalUnitPrice,
      availableStockInUnits: 999999,
      isService: false,
      isQuickSale: true,
      isCashWithdrawal: isTarikTunai,
      principalAmount: safeNominal,
      adminFee: safeAdminFee,
    };

    setCart((prev) => [...prev, quickSaleItem]);
    return { ok: true, availableCashBalance: availableStoreCashBalance };
  };

  const handleUpdateCartItemQty = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(cartItemId);
      return;
    }

    const targetCartItem = cart.find((item) => item.cartItemId === cartItemId);
    if (targetCartItem && newQty > targetCartItem.quantity) {
      const targetIsWithdrawal =
        Boolean(targetCartItem.isCashWithdrawal) ||
        (Boolean(targetCartItem.isQuickSale) && /tarik\s*tunai/i.test(targetCartItem.productName || ''));
      if (targetIsWithdrawal) {
        const principalPerUnit =
          targetCartItem.principalAmount !== undefined
            ? Math.max(0, targetCartItem.principalAmount)
            : Math.max(0, targetCartItem.unitPrice || 0);
        const otherWithdrawalCash = cart.reduce((sum, ci) => {
          if (ci.cartItemId === cartItemId) return sum;
          const isWd =
            Boolean(ci.isCashWithdrawal) ||
            (Boolean(ci.isQuickSale) && /tarik\s*tunai/i.test(ci.productName || ''));
          if (!isWd) return sum;
          const p = ci.principalAmount !== undefined ? Math.max(0, ci.principalAmount) : Math.max(0, ci.unitPrice || 0);
          return sum + p * Math.max(1, ci.quantity || 1);
        }, 0);
        const nextTotalWithdrawalCash = otherWithdrawalCash + principalPerUnit * newQty;
        if (nextTotalWithdrawalCash > availableStoreCashBalance) {
          const remainingForItem = Math.max(0, availableStoreCashBalance - otherWithdrawalCash);
          triggerCashWithdrawalBlockedToast({
            requestedAmount: principalPerUnit * newQty,
            availableBalance: remainingForItem,
            existingCartAmount: otherWithdrawalCash,
            customMessage: `Penambahan jumlah Tarik Tunai diblokir! Total penarikan (${formatRupiah(nextTotalWithdrawalCash)}) melebihi saldo kas toko (${formatRupiah(availableStoreCashBalance)}).`,
          });
          return;
        }
      }
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.cartItemId === cartItemId) {
          const product = productMap.get(item.productId);
          const maxUnits = product
            ? Math.floor(product.stockInBaseUnit / item.selectedUnit.conversionFactor)
            : 9999;
          
          if (newQty > maxUnits) {
            alert(`Stok hanya tersisa ${maxUnits} ${item.selectedUnit.unitName}`);
            return item;
          }

          let unitPrice = item.unitPrice;
          let originalUnitPrice = item.originalUnitPrice || item.selectedUnit.sellingPrice;
          let isCustomerSpecialPrice = item.isCustomerSpecialPrice;
          let customerPriceCategory = item.customerPriceCategory;
          let productDiscountPercent = item.productDiscountPercent;
          let promoLabel = item.promoLabel;

          // Re-evaluate product promo & special pricing trigger on quantity changes
          if (!item.isCustomPrice && product) {
            const resolved = resolveProductDiscount(
              product,
              item.selectedUnit,
              item.selectedVariant,
              selectedCustomer,
              newQty
            );
            unitPrice = resolved.effectiveUnitPrice;
            originalUnitPrice = resolved.baseUnitPrice;
            isCustomerSpecialPrice = resolved.source === 'CUSTOMER_SPECIAL';
            customerPriceCategory = resolved.customerPriceCategory;
            productDiscountPercent =
              resolved.source === 'PRODUCT_PROMO' ? resolved.discountPercent : undefined;
            promoLabel = resolved.promoLabel;
          }

          return {
            ...item,
            quantity: newQty,
            unitPrice,
            originalUnitPrice,
            isCustomerSpecialPrice,
            customerPriceCategory,
            productDiscountPercent,
            promoLabel,
            subtotal: newQty * unitPrice,
          };
        }
        return item;
      })
    );
  };

  const handleChangeCartItemUnit = (cartItemId: string, newUnit: ProductUnit) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartItemId === cartItemId) {
          const product = productMap.get(item.productId);
          if (product) {
            const resolved = resolveProductDiscount(
              product,
              newUnit,
              item.selectedVariant,
              selectedCustomer,
              item.quantity
            );
            return {
              ...item,
              selectedUnit: newUnit,
              unitPrice: resolved.effectiveUnitPrice,
              subtotal: item.quantity * resolved.effectiveUnitPrice,
              isCustomPrice: false,
              originalUnitPrice: resolved.baseUnitPrice,
              isCustomerSpecialPrice: resolved.source === 'CUSTOMER_SPECIAL',
              customerPriceCategory: resolved.customerPriceCategory,
              productDiscountPercent:
                resolved.source === 'PRODUCT_PROMO' ? resolved.discountPercent : undefined,
              promoLabel: resolved.promoLabel,
            };
          }
          return {
            ...item,
            selectedUnit: newUnit,
            unitPrice: newUnit.sellingPrice,
            subtotal: item.quantity * newUnit.sellingPrice,
            isCustomPrice: false,
            originalUnitPrice: newUnit.sellingPrice,
            isCustomerSpecialPrice: false,
            customerPriceCategory: undefined,
            productDiscountPercent: undefined,
            promoLabel: undefined,
          };
        }
        return item;
      })
    );
  };

  const recordActivityLog = (
    payload: Omit<EmployeeActivityLog, 'id' | 'timestamp' | 'actorId' | 'actorName' | 'actorRole'>
  ) => {
    const newEntry: EmployeeActivityLog = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      ...payload,
    };
    setActivityLogs((prev) => [newEntry, ...prev]);
    saveDocumentToFirestore('activity_logs', newEntry.id, newEntry).catch(() => {});
  };

  const handleUpdateCartItemPrice = (
    cartItemId: string,
    newUnitPrice: number,
    overrideReason?: string
  ) => {
    if (newUnitPrice < 0) return;
    const targetItem = cart.find((item) => item.cartItemId === cartItemId);
    if (targetItem && targetItem.unitPrice !== newUnitPrice) {
      const baselinePrice =
        targetItem.originalUnitPrice || targetItem.selectedUnit.sellingPrice || targetItem.unitPrice;
      const prevPrice = targetItem.unitPrice;
      const unitDiff = newUnitPrice - prevPrice;
      const diffFromCatalog = newUnitPrice - baselinePrice;
      const totalCartDelta = unitDiff * targetItem.quantity;
      const totalDiscountFromCatalog = Math.max(0, (baselinePrice - newUnitPrice) * targetItem.quantity);
      const discountPercentFromCatalog =
        baselinePrice > 0
          ? Math.round(((baselinePrice - newUnitPrice) / baselinePrice) * 1000) / 10
          : 0;
      const sign = totalCartDelta > 0 ? '+' : '';
      const trimmedReason = overrideReason?.trim() || '';

      recordActivityLog({
        actionType: 'MANUAL_PRICE_EDIT',
        targetType: 'CART_ITEM',
        targetId: targetItem.productId,
        targetLabel: `${targetItem.productName} (${targetItem.selectedUnit.unitName})`,
        summary: `[Pra-Pembayaran] Manual Override / Edit Harga oleh ${currentUser.name} untuk ${targetItem.quantity} ${targetItem.selectedUnit.unitName}${
          discountPercentFromCatalog > 0
            ? ` (Diskon manual ${discountPercentFromCatalog}% dari normal ${formatRupiah(baselinePrice)}; potongan total -${formatRupiah(totalDiscountFromCatalog)})`
            : diffFromCatalog > 0
            ? ` (Kenaikan +${formatRupiah(diffFromCatalog)}/unit dari normal ${formatRupiah(baselinePrice)})`
            : ' (Dikembalikan ke harga normal katalog)'
        }`,
        oldValue:
          prevPrice !== baselinePrice
            ? `${formatRupiah(prevPrice)} (Normal: ${formatRupiah(baselinePrice)})`
            : formatRupiah(prevPrice),
        newValue: formatRupiah(newUnitPrice),
        deltaValue: `${sign}${formatRupiah(totalCartDelta)} (${targetItem.quantity} ${targetItem.selectedUnit.unitName})`,
        numericDelta: totalCartDelta,
        reason:
          trimmedReason ||
          (diffFromCatalog < 0
            ? 'Manual Override / Diskon manual item keranjang sebelum pembayaran'
            : 'Manual Override / Edit harga item keranjang sebelum pembayaran'),
        productId: targetItem.productId,
        metadata: {
          stage: 'PRE_PAYMENT',
          baselinePrice,
          prevPrice,
          newPrice: newUnitPrice,
          quantity: targetItem.quantity,
          discountPercentFromCatalog: Math.max(0, discountPercentFromCatalog),
          totalDiscountFromCatalog,
          customerName: selectedCustomer?.name || 'Pelanggan Umum',
        },
      });
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.cartItemId === cartItemId) {
          const originalPrice = item.originalUnitPrice || item.selectedUnit.sellingPrice || item.unitPrice;
          return {
            ...item,
            unitPrice: newUnitPrice,
            subtotal: item.quantity * newUnitPrice,
            isCustomPrice: newUnitPrice !== originalPrice,
            originalUnitPrice: originalPrice,
            ...(item.isCashWithdrawal
              ? {
                  adminFee: Math.max(0, newUnitPrice - (item.principalAmount || 0)),
                }
              : {}),
          };
        }
        return item;
      })
    );
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
    setRequestedPoints(0);
    setHasManualPointOverride(false);
    setSpecialPriceNotice(null);
  };

  // Barcode & QR Code scanning resolution (Product SKU/Barcode + Customer Member QR)
  const handleBarcodeScanned = (scannedCode: string) => {
    const trimmed = scannedCode.trim();
    if (!trimmed) return;

    // 0. Check if scanned code matches a Customer Member QR / Membership ID
    const matchedCustomer = findCustomerByScanInput(trimmed, customers);
    if (matchedCustomer) {
      sound.playScanBeep();
      handleSelectCustomer(matchedCustomer);
      setScanFeedbackNotice({
        type: 'success',
        message: `Pelanggan dipilih via QR: ${matchedCustomer.name} (${getCustomerMembershipId(matchedCustomer)})`,
      });
      return;
    }

    // Parse product QR JSON payload if applicable
    let codeToMatch = trimmed;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as { type?: string; sku?: string; barcode?: string; productId?: string };
        if (parsed.type === 'KASIRKU_PRODUCT') {
          if (parsed.productId) {
            const byId = productMap.get(parsed.productId);
            if (byId && byId.units?.[0]) {
              handleAddToCart(byId, byId.units[0]);
              setScanFeedbackNotice({
                type: 'success',
                message: `Produk ditambahkan: ${byId.name} (${byId.sku || byId.barcode})`,
              });
              return;
            }
          }
          codeToMatch = parsed.sku || parsed.barcode || trimmed;
        }
      } catch {
        // Not JSON, fall back to direct string match
      }
    }

    const lowerCode = codeToMatch.toLowerCase();
    const matchedEntry = scanLookupMap.get(lowerCode);
    if (matchedEntry) {
      handleAddToCart(matchedEntry.product, matchedEntry.unit, 1, matchedEntry.variantName);
      setScanFeedbackNotice({
        type: 'success',
        message: `Produk ditambahkan: ${matchedEntry.matchLabel}`,
      });
      return;
    }

    sound.playError();
    setScanFeedbackNotice({
      type: 'error',
      message: `Kode Barcode / SKU / Member QR "${trimmed}" tidak ditemukan di database toko.`,
    });
  };

  // =========================================================================
  // FINANCIAL CALCULATIONS & REWARD POINTS
  // =========================================================================
  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);

  // Membership Tier Discount: DITIADAKAN sesuai preferensi bisnis pelanggan.
  // Harga khusus pelanggan mengikuti harga khusus kategori produk/jasa & syarat minimal beli (minQuantity).
  const customerTier: MembershipTier = selectedCustomer?.membershipTier || 'REGULER';
  const tierDiscountPercent = 0;
  const membershipDiscountAmount = 0;
  const afterTierSubtotal = subtotal;

  const pointValue = (storeSettings.enablePoints && storeSettings.pointValueRupiah > 0)
    ? storeSettings.pointValueRupiah
    : 0;

  const isSelectedMember = isCustomerMember(selectedCustomer);

  const maxRedeemablePoints = isSelectedMember && storeSettings.enablePoints && pointValue > 0
    ? Math.min(
        selectedCustomer!.totalPoints || 0,
        Math.floor(afterTierSubtotal / pointValue)
      )
    : 0;

  const pointsUsed = isSelectedMember && storeSettings.enablePoints && pointValue > 0
    ? Math.max(0, Math.min(Math.floor(requestedPoints) || 0, maxRedeemablePoints))
    : 0;
  const usePoints = pointsUsed > 0;
  const setUsePoints = (use: boolean) => {
    setHasManualPointOverride(true);
    setRequestedPoints(use ? maxRedeemablePoints : 0);
  };
  const handleChangePointsToUse = (pts: number) => {
    const safePts = Number.isFinite(pts) ? Math.max(0, Math.floor(pts)) : 0;
    setHasManualPointOverride(true);
    setRequestedPoints(Math.min(safePts, maxRedeemablePoints));
  };

  // Auto-Apply maximum redeemable points when enabled in StoreSettings
  useEffect(() => {
    if (
      storeSettings.enablePoints &&
      storeSettings.autoApplyMaxPoints &&
      isSelectedMember &&
      pointValue > 0 &&
      !hasManualPointOverride
    ) {
      setRequestedPoints(maxRedeemablePoints);
    }
  }, [
    storeSettings.enablePoints,
    storeSettings.autoApplyMaxPoints,
    selectedCustomer?.id,
    isSelectedMember,
    pointValue,
    maxRedeemablePoints,
    hasManualPointOverride,
  ]);

  const pointsDiscountAmount = pointsUsed * pointValue;
  const grandTotal = Math.max(0, afterTierSubtotal - pointsDiscountAmount);

  const pointsEarned = calculatePointsEarned(grandTotal, storeSettings, selectedCustomer);

  const executeQuickBluetoothPrint = async (tx: Transaction) => {
    if (quickPrintDismissTimerRef.current !== null) {
      window.clearTimeout(quickPrintDismissTimerRef.current);
      quickPrintDismissTimerRef.current = null;
    }

    const paperWidth = storeSettings.printerPaperWidth || '58mm';
    const targetDeviceName =
      getPrinterConnectionInfo().bluetoothDeviceName ||
      storeSettings.printerDeviceName ||
      'Printer Bluetooth';

    setQuickPrintFeedback({
      status: 'PRINTING',
      invoiceNumber: tx.invoiceNumber,
      deviceName: targetDeviceName,
      message: `Mengirim struk ${tx.invoiceNumber} ke ${targetDeviceName}...`,
      transaction: tx,
    });

    try {
      await printDirectBluetooth(tx, storeSettings, paperWidth);
      const connectedName =
        getPrinterConnectionInfo().bluetoothDeviceName ||
        storeSettings.printerDeviceName ||
        'Printer Bluetooth';

      sound.playSuccessChime();
      setQuickPrintFeedback({
        status: 'SUCCESS',
        invoiceNumber: tx.invoiceNumber,
        deviceName: connectedName,
        message: `Struk ${tx.invoiceNumber} berhasil dicetak ke ${connectedName}.`,
        transaction: tx,
      });

      quickPrintDismissTimerRef.current = window.setTimeout(() => {
        setQuickPrintFeedback((prev) =>
          prev?.invoiceNumber === tx.invoiceNumber && prev?.status === 'SUCCESS' ? null : prev
        );
      }, 4500);
    } catch (err: any) {
      sound.playWarningChime();
      const errMessage = isPrinterPolicyError(err)
        ? err.message
        : err?.message || `Gagal mencetak langsung ke ${targetDeviceName}.`;

      setQuickPrintFeedback({
        status: 'ERROR',
        invoiceNumber: tx.invoiceNumber,
        deviceName: targetDeviceName,
        message: errMessage,
        transaction: tx,
      });
    }
  };

  // Helper: Explicitly separate Tarik Tunai principal cash outflow and net admin fee profit in cashflows
  const recordWithdrawalCashflowForTransaction = (tx: Transaction) => {
    let totalWithdrawalCashOut = 0;
    let totalWithdrawalAdminProfit = 0;

    (tx.items || []).forEach((item) => {
      const isTarikTunai =
        Boolean(item.isCashWithdrawal) ||
        (Boolean(item.isQuickSale) && /tarik\s*tunai/i.test(item.productName || ''));
      if (!isTarikTunai) return;

      const qty = Math.max(1, item.quantity || 1);
      const principalPerUnit =
        item.principalAmount !== undefined
          ? Math.max(0, item.principalAmount)
          : Math.max(0, item.costPrice || 0);
      const adminFeePerUnit =
        item.adminFee !== undefined
          ? Math.max(0, item.adminFee)
          : Math.max(0, (item.unitPrice || 0) - principalPerUnit);

      totalWithdrawalCashOut += qty * principalPerUnit;
      totalWithdrawalAdminProfit += qty * adminFeePerUnit;
    });

    if (totalWithdrawalCashOut <= 0 && totalWithdrawalAdminProfit <= 0) return;

    const txDate = new Date(tx.timestamp);
    const localDateStr = [
      txDate.getFullYear(),
      String(txDate.getMonth() + 1).padStart(2, '0'),
      String(txDate.getDate()).padStart(2, '0'),
    ].join('-');
    const createdAtIso = new Date().toISOString();
    const customerTag = tx.customerName ? ` (${tx.customerName})` : '';
    const recordsToSave: CashflowRecord[] = [];

    if (totalWithdrawalCashOut > 0) {
      recordsToSave.push({
        id: `cf_tarik_${tx.id}`,
        type: 'PENGELUARAN',
        category: 'Tarik Tunai (Kas Keluar)',
        amount: totalWithdrawalCashOut,
        date: localDateStr,
        timestamp: tx.timestamp,
        paymentMethod: 'CASH',
        description: `Kas Keluar Tarik Tunai ${tx.invoiceNumber}${customerTag} • Pokok Dana Tunai`,
        referenceNumber: tx.invoiceNumber,
        recordedBy: tx.cashierName || currentUser.name,
        recordedById: tx.cashierId || currentUser.id,
        isCashWithdrawalOutflow: true,
        withdrawalPrincipalAmount: totalWithdrawalCashOut,
        withdrawalAdminFeeAmount: totalWithdrawalAdminProfit,
        createdAt: createdAtIso,
      });
    }

    if (totalWithdrawalAdminProfit > 0) {
      recordsToSave.push({
        id: `cf_tarik_admin_${tx.id}`,
        type: 'PEMASUKAN',
        category: 'Keuntungan Biaya Admin (Tarik Tunai)',
        amount: totalWithdrawalAdminProfit,
        date: localDateStr,
        timestamp: tx.timestamp + 1,
        paymentMethod: tx.paymentMethod === 'CASH' ? 'CASH' : (tx.paymentMethod || 'CASH'),
        description: `Keuntungan Bersih Biaya Admin Tarik Tunai ${tx.invoiceNumber}${customerTag} • Pokok Tarik ${formatRupiah(totalWithdrawalCashOut)}`,
        referenceNumber: tx.invoiceNumber,
        recordedBy: tx.cashierName || currentUser.name,
        recordedById: tx.cashierId || currentUser.id,
        isCashWithdrawalAdminProfit: true,
        withdrawalPrincipalAmount: totalWithdrawalCashOut,
        withdrawalAdminFeeAmount: totalWithdrawalAdminProfit,
        createdAt: createdAtIso,
      });
    }

    if (recordsToSave.length === 0) return;

    const recordIdSet = new Set(recordsToSave.map((r) => r.id));
    setCashflows((prev) => [...recordsToSave, ...prev.filter((c) => !recordIdSet.has(c.id))]);
    if (recordsToSave.length === 1) {
      saveDocumentToFirestore('cashflows', recordsToSave[0].id, recordsToSave[0]).catch((err) => {
        console.error('[FirebaseSync] Failed to save Tarik Tunai cashflow record:', err);
      });
    } else {
      saveBatchToFirestore('cashflows', recordsToSave).catch((err) => {
        console.error('[FirebaseSync] Failed to batch save Tarik Tunai cashflow records:', err);
      });
    }
  };

  // =========================================================================
  // PAYMENT COMPLETION & INVENTORY DEDUCTION (Supports Admin Backdate + FIFO)
  // =========================================================================
  const handleConfirmPayment = (paymentData: {
    paymentMethod: PaymentMethod;
    cashPaid?: number;
    cashChange?: number;
    bankApprovalCode?: string;
    bankRefNumber?: string;
    dueDate?: string;
    notes?: string;
    customTimestamp?: number;
    quickPrint?: boolean;
  }) => {
    const isAdminUser = currentUser.role === 'ADMIN';
    const isBackdated =
      isAdminUser &&
      typeof paymentData.customTimestamp === 'number' &&
      !isNaN(paymentData.customTimestamp) &&
      paymentData.customTimestamp <= Date.now() + 30000;

    const resolvedTimestamp = isBackdated ? (paymentData.customTimestamp as number) : Date.now();
    const invoiceNum = generateInvoiceNumber(isBackdated ? resolvedTimestamp : undefined);

    if (isBackdated) {
      // Build draft transaction with past timestamp & let chronological FIFO engine replay
      const draftTransaction: Transaction = {
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        invoiceNumber: invoiceNum,
        timestamp: resolvedTimestamp,
        cashierId: currentUser.id,
        cashierName: currentUser.name,
        cashierRole: currentUser.role,
        customerId: selectedCustomer?.id,
        customerName: selectedCustomer?.name,
        customerWhatsapp: selectedCustomer?.whatsapp,
        customerTier,
        customerCategory: selectedCustomer?.customerCategory,
        membershipDiscountPercent: tierDiscountPercent,
        membershipDiscountAmount,
        subtotal,
        discount: membershipDiscountAmount,
        pointsUsed,
        pointsDiscountAmount,
        pointsEarned,
        finalAmount: grandTotal,
        paymentMethod: paymentData.paymentMethod,
        paymentStatus: paymentData.paymentMethod === 'PIUTANG' ? 'BELUM_LUNAS' : 'LUNAS',
        cashPaid: paymentData.cashPaid,
        cashChange: paymentData.cashChange,
        bankApprovalCode: paymentData.bankApprovalCode,
        bankRefNumber: paymentData.bankRefNumber,
        dueDate: paymentData.dueDate,
        ...(paymentData.notes?.trim() ? { notes: paymentData.notes.trim() } : {}),
        items: cart.map((item) => {
          const prod = productMap.get(item.productId);
          return {
            productId: item.productId,
            productName: item.productName,
            unitName: item.selectedUnit.unitName,
            conversionFactor: item.selectedUnit.conversionFactor,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            costPrice: item.isCashWithdrawal
              ? Math.max(0, item.principalAmount || 0)
              : item.isQuickSale
              ? 0
              : (prod?.costPrice || 0),
            totalAmount: item.subtotal,
            selectedVariant: item.selectedVariant,
            isService: item.isService,
            isQuickSale: item.isQuickSale,
            ...(item.isCashWithdrawal ? { isCashWithdrawal: true } : {}),
            ...(item.principalAmount !== undefined ? { principalAmount: item.principalAmount } : {}),
            ...(item.adminFee !== undefined ? { adminFee: item.adminFee } : {}),
            serviceNotes: item.serviceNotes,
            batchDeductions: [],
            isCustomerSpecialPrice: item.isCustomerSpecialPrice,
            customerPriceCategory: item.customerPriceCategory,
            ...(item.productDiscountPercent !== undefined ? { productDiscountPercent: item.productDiscountPercent } : {}),
            ...(item.promoLabel ? { promoLabel: item.promoLabel } : {}),
          };
        }),
      };

      const recalcResult = recalculateChronologicalFifoForNewTransaction(
        transactions,
        draftTransaction,
        products
      );

      const finalizedNewTransaction =
        recalcResult.updatedTransactions.find((t) => t.id === draftTransaction.id) || draftTransaction;

      setProducts(recalcResult.updatedProducts);
      setTransactions(recalcResult.updatedTransactions);
      saveStorage('kasir_products', recalcResult.updatedProducts);
      saveStorage('kasir_transactions', recalcResult.updatedTransactions);
      recordWithdrawalCashflowForTransaction(finalizedNewTransaction);

      if (selectedCustomer) {
        const updatedCustomers = customers.map((c) => {
          if (c.id === selectedCustomer.id) {
            const newPoints = c.totalPoints - pointsUsed + pointsEarned;
            const newDebt =
              paymentData.paymentMethod === 'PIUTANG'
                ? c.totalDebt + grandTotal
                : c.totalDebt;
            return {
              ...c,
              totalPoints: Math.max(0, newPoints),
              totalDebt: newDebt,
            };
          }
          return c;
        });
        setCustomers(updatedCustomers);
        saveStorage('kasir_customers', updatedCustomers);
        const custObj = customers.find((c) => c.id === selectedCustomer.id);
        if (custObj) {
          const newPoints = custObj.totalPoints - pointsUsed + pointsEarned;
          const newDebt = paymentData.paymentMethod === 'PIUTANG' ? custObj.totalDebt + grandTotal : custObj.totalDebt;
          saveDocumentToFirestore('customers', selectedCustomer.id, {
            ...custObj,
            totalPoints: Math.max(0, newPoints),
            totalDebt: newDebt,
          }).catch(() => {});
        }
      }

      setLastCompletedTransaction(finalizedNewTransaction);
      setIsPaymentModalOpen(false);
      setPreferBackdatedCheckout(false);
      if (paymentData.quickPrint) {
        setShouldAutoSendWaOnReceipt(false);
        setShouldAutoPrintOnReceipt(false);
        setIsReceiptModalOpen(false);
        void executeQuickBluetoothPrint(finalizedNewTransaction);
      } else {
        setShouldAutoSendWaOnReceipt(Boolean(storeSettings.autoSendWhatsAppReceipt));
        setShouldAutoPrintOnReceipt(Boolean(storeSettings.autoPrintReceipt));
        setIsReceiptModalOpen(true);
      }
      setCart([]);
      setRequestedPoints(0);
      setHasManualPointOverride(false);
      setSpecialPriceNotice(null);

      setScanFeedbackNotice({
        type: 'success',
        message: `Transaksi mundur ${new Date(resolvedTimestamp).toLocaleDateString('id-ID')} disimpan! Stok & FIFO ${recalcResult.changedProducts.length} produk${
          recalcResult.recalculatedExistingTxCount > 0
            ? ` + ${recalcResult.recalculatedExistingTxCount} transaksi setelahnya`
            : ''
        } telah dihitung ulang.`,
      });

      if (recalcResult.changedTransactions.length > 0) {
        saveBatchToFirestore('transactions', recalcResult.changedTransactions).catch(() => {});
      } else {
        saveDocumentToFirestore('transactions', finalizedNewTransaction.id, finalizedNewTransaction).catch(() => {});
      }
      if (recalcResult.changedProducts.length > 0) {
        saveBatchToFirestore('products', recalcResult.changedProducts).catch(() => {});
      }
      return;
    }

    // 1. Process FIFO Stock Deduction across batches for Physical Products (Real-time checkout)
    const itemDeductionsMap = new Map<string, { costPrice: number; batchDeductions: BatchDeduction[] }>();
    const cartByProductId = new Map<string, CartItem[]>();
    cart.forEach((ci) => {
      const list = cartByProductId.get(ci.productId);
      if (list) list.push(ci);
      else cartByProductId.set(ci.productId, [ci]);
    });

    const changedProducts: Product[] = [];
    const updatedProducts = products.map((prod) => {
      if (prod.productType === 'JASA') return prod;

      const productCartItems = cartByProductId.get(prod.id);
      if (!productCartItems || productCartItems.length === 0) return prod;

      const totalBaseUnitsNeeded = productCartItems.reduce(
        (sum, ci) => sum + ci.quantity * (ci.selectedUnit.conversionFactor || 1),
        0
      );
      if (totalBaseUnitsNeeded <= 0) return prod;

      let batches: ProductBatch[] = Array.isArray(prod.batches) && prod.batches.length > 0
        ? prod.batches.map((b) => ({ ...b }))
        : [];

      if (batches.length === 0 && prod.stockInBaseUnit > 0) {
        batches.push({
          id: `batch_init_${prod.id}`,
          batchNumber: 'BATCH-AWAL',
          receivedAt: Date.now() - 30 * 86400000,
          receivedDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
          expiryDate: prod.expiryDate,
          initialQuantity: prod.stockInBaseUnit,
          remainingQuantity: prod.stockInBaseUnit,
          costPrice: prod.costPrice || 0,
          supplierName: 'Stok Toko',
        });
      }

      batches.sort((a, b) => {
        if (a.expiryDate && b.expiryDate) {
          const expDiff = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
          if (expDiff !== 0) return expDiff;
        } else if (a.expiryDate && !b.expiryDate) {
          return -1;
        } else if (!a.expiryDate && b.expiryDate) {
          return 1;
        }
        return (a.receivedAt || 0) - (b.receivedAt || 0);
      });

      let unitsToDeduct = totalBaseUnitsNeeded;
      const deductedBatches: BatchDeduction[] = [];
      let totalCostIncurred = 0;
      let totalUnitsCalculated = 0;

      for (const batch of batches) {
        if (unitsToDeduct <= 0) break;
        if (batch.remainingQuantity <= 0) continue;

        const take = Math.min(batch.remainingQuantity, unitsToDeduct);
        batch.remainingQuantity -= take;
        unitsToDeduct -= take;

        const effectiveCost = batch.costPrice !== undefined ? batch.costPrice : (prod.costPrice || 0);
        totalCostIncurred += take * effectiveCost;
        totalUnitsCalculated += take;

        deductedBatches.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: take,
          costPrice: effectiveCost,
          expiryDate: batch.expiryDate,
        });
      }

      if (unitsToDeduct > 0) {
        const fallbackCost = prod.costPrice || 0;
        totalCostIncurred += unitsToDeduct * fallbackCost;
        totalUnitsCalculated += unitsToDeduct;
        deductedBatches.push({
          batchId: 'batch_deficit',
          batchNumber: 'DEFISIT-STOK',
          quantity: unitsToDeduct,
          costPrice: fallbackCost,
        });
      }

      const weightedHppPerBaseUnit = totalUnitsCalculated > 0
        ? Math.round(totalCostIncurred / totalUnitsCalculated)
        : (prod.costPrice || 0);

      itemDeductionsMap.set(prod.id, {
        costPrice: weightedHppPerBaseUnit,
        batchDeductions: deductedBatches,
      });

      const newStock = Math.max(0, prod.stockInBaseUnit - totalBaseUnitsNeeded);
      const nextProd = {
        ...prod,
        stockInBaseUnit: newStock,
        batches,
      };
      changedProducts.push(nextProd);
      return nextProd;
    });

    setProducts(updatedProducts);
    saveStorage('kasir_products', updatedProducts);

    // 2. Update Customer Points & Debt (if applicable)
    if (selectedCustomer) {
      const updatedCustomers = customers.map((c) => {
        if (c.id === selectedCustomer.id) {
          const newPoints = c.totalPoints - pointsUsed + pointsEarned;
          const newDebt =
            paymentData.paymentMethod === 'PIUTANG'
              ? c.totalDebt + grandTotal
              : c.totalDebt;
          return {
            ...c,
            totalPoints: Math.max(0, newPoints),
            totalDebt: newDebt,
          };
        }
        return c;
      });
      setCustomers(updatedCustomers);
      saveStorage('kasir_customers', updatedCustomers);
    }

    // 3. Build Transaction Record with FIFO Audit Trail
    const newTransaction: Transaction = {
      id: 'tx_' + Date.now(),
      invoiceNumber: invoiceNum,
      timestamp: Date.now(),
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      customerWhatsapp: selectedCustomer?.whatsapp,
      customerTier,
      customerCategory: selectedCustomer?.customerCategory,
      membershipDiscountPercent: tierDiscountPercent,
      membershipDiscountAmount,
      subtotal,
      discount: membershipDiscountAmount,
      pointsUsed,
      pointsDiscountAmount,
      pointsEarned,
      finalAmount: grandTotal,
      paymentMethod: paymentData.paymentMethod,
      paymentStatus: paymentData.paymentMethod === 'PIUTANG' ? 'BELUM_LUNAS' : 'LUNAS',
      cashPaid: paymentData.cashPaid,
      cashChange: paymentData.cashChange,
      bankApprovalCode: paymentData.bankApprovalCode,
      bankRefNumber: paymentData.bankRefNumber,
      dueDate: paymentData.dueDate,
      ...(paymentData.notes?.trim() ? { notes: paymentData.notes.trim() } : {}),
      items: cart.map((item) => {
        const prod = productMap.get(item.productId);
        const fifoData = itemDeductionsMap.get(item.productId);
        const effectiveHpp = fifoData
          ? fifoData.costPrice
          : item.isCashWithdrawal
          ? Math.max(0, item.principalAmount || 0)
          : item.isQuickSale
          ? 0
          : (prod?.costPrice || 0);

        return {
          productId: item.productId,
          productName: item.productName,
          unitName: item.selectedUnit.unitName,
          conversionFactor: item.selectedUnit.conversionFactor,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: effectiveHpp,
          totalAmount: item.subtotal,
          selectedVariant: item.selectedVariant,
          isService: item.isService,
          isQuickSale: item.isQuickSale,
          ...(item.isCashWithdrawal ? { isCashWithdrawal: true } : {}),
          ...(item.principalAmount !== undefined ? { principalAmount: item.principalAmount } : {}),
          ...(item.adminFee !== undefined ? { adminFee: item.adminFee } : {}),
          serviceNotes: item.serviceNotes,
          batchDeductions: fifoData?.batchDeductions || [],
          isCustomerSpecialPrice: item.isCustomerSpecialPrice,
          customerPriceCategory: item.customerPriceCategory,
          ...(item.productDiscountPercent !== undefined ? { productDiscountPercent: item.productDiscountPercent } : {}),
          ...(item.promoLabel ? { promoLabel: item.promoLabel } : {}),
        };
      }),
    };

    const nextTransactions = [newTransaction, ...transactions];
    setTransactions(nextTransactions);
    saveStorage('kasir_transactions', nextTransactions);
    recordWithdrawalCashflowForTransaction(newTransaction);
    setLastCompletedTransaction(newTransaction);
    setIsPaymentModalOpen(false);
    setPreferBackdatedCheckout(false);
    if (paymentData.quickPrint) {
      setShouldAutoSendWaOnReceipt(false);
      setShouldAutoPrintOnReceipt(false);
      setIsReceiptModalOpen(false);
      void executeQuickBluetoothPrint(newTransaction);
    } else {
      setShouldAutoSendWaOnReceipt(Boolean(storeSettings.autoSendWhatsAppReceipt));
      setShouldAutoPrintOnReceipt(Boolean(storeSettings.autoPrintReceipt));
      setIsReceiptModalOpen(true);
    }
    setCart([]);
    setRequestedPoints(0);
    setHasManualPointOverride(false);
    setSpecialPriceNotice(null);

    // Sync ONLY touched documents to Firestore Cloud Real-time (never re-upload entire product catalog)
    saveDocumentToFirestore('transactions', newTransaction.id, newTransaction).catch(() => {});
    if (changedProducts.length > 0) {
      saveBatchToFirestore('products', changedProducts).catch(() => {});
    }
    if (selectedCustomer) {
      const custObj = customers.find((c) => c.id === selectedCustomer.id);
      if (custObj) {
        const newPoints = custObj.totalPoints - pointsUsed + pointsEarned;
        const newDebt = paymentData.paymentMethod === 'PIUTANG' ? custObj.totalDebt + grandTotal : custObj.totalDebt;
        saveDocumentToFirestore('customers', selectedCustomer.id, {
          ...custObj,
          totalPoints: Math.max(0, newPoints),
          totalDebt: newDebt,
        }).catch(() => {});
      }
    }
  };

  // Settle Debt / Piutang
  const handleSettleDebt = (transactionId: string, paymentMethod: PaymentMethod) => {
    const tx = transactions.find((t) => t.id === transactionId);
    if (!tx) return;

    // 1. Mark transaction as LUNAS
    let targetUpdatedTx: Transaction | null = null;
    const updatedTransactions = transactions.map((t) => {
      if (t.id === transactionId) {
        targetUpdatedTx = {
          ...t,
          paymentStatus: 'LUNAS' as const,
          settledPaymentMethod: paymentMethod,
          paidAt: new Date().toISOString(),
        };
        return targetUpdatedTx;
      }
      return t;
    });
    setTransactions(updatedTransactions);
    if (targetUpdatedTx) {
      saveDocumentToFirestore('transactions', transactionId, targetUpdatedTx).catch(() => {});
    }

    // 2. Reduce Customer's totalDebt
    if (tx.customerId) {
      let targetUpdatedCust: Customer | null = null;
      const updatedCustomers = customers.map((c) => {
        if (c.id === tx.customerId) {
          targetUpdatedCust = {
            ...c,
            totalDebt: Math.max(0, c.totalDebt - tx.finalAmount),
          };
          return targetUpdatedCust;
        }
        return c;
      });
      setCustomers(updatedCustomers);
      if (targetUpdatedCust) {
        saveDocumentToFirestore('customers', tx.customerId, targetUpdatedCust).catch(() => {});
      }
    }
  };

  // Post-transaction Admin Invoice Edit (Notes & Payment Method Details + Audit Log)
  const handleUpdateTransaction = (updatedTx: Transaction, prevTx?: Transaction) => {
    const updatedTransactions = transactions.map((t) =>
      t.id === updatedTx.id ? updatedTx : t
    );
    setTransactions(updatedTransactions);
    saveDocumentToFirestore('transactions', updatedTx.id, updatedTx).catch(() => {});

    // Keep customer debt synchronized if payment method / status toggled between unsettled PIUTANG and paid
    if (prevTx && updatedTx.customerId) {
      const wasUnsettledPiutang =
        prevTx.paymentMethod === 'PIUTANG' && prevTx.paymentStatus !== 'LUNAS';
      const isNowUnsettledPiutang =
        updatedTx.paymentMethod === 'PIUTANG' && updatedTx.paymentStatus !== 'LUNAS';

      if (wasUnsettledPiutang !== isNowUnsettledPiutang) {
        const debtDelta = isNowUnsettledPiutang
          ? updatedTx.finalAmount
          : -updatedTx.finalAmount;

        let targetUpdatedCust: Customer | null = null;
        const updatedCustomers = customers.map((c) => {
          if (c.id === updatedTx.customerId) {
            targetUpdatedCust = {
              ...c,
              totalDebt: Math.max(0, c.totalDebt + debtDelta),
            };
            return targetUpdatedCust;
          }
          return c;
        });
        setCustomers(updatedCustomers);
        if (targetUpdatedCust) {
          saveDocumentToFirestore('customers', updatedTx.customerId, targetUpdatedCust).catch(() => {});
        }
      }
    }

    // Record centralized employee/manager accountability log if audit entry was added
    const prevAuditLen = prevTx?.auditLogs?.length || 0;
    const nextAuditLen = updatedTx.auditLogs?.length || 0;
    if (nextAuditLen > prevAuditLen) {
      const latestAudit = updatedTx.auditLogs![nextAuditLen - 1];
      recordActivityLog({
        actionType: 'EDIT_TRANSACTION',
        targetType: 'TRANSACTION',
        targetId: updatedTx.id,
        targetLabel: updatedTx.invoiceNumber,
        summary: `Edit invoice ${updatedTx.invoiceNumber} (${latestAudit.changes.length} perubahan: ${latestAudit.changes.map((c) => c.field).join(', ')})`,
        oldValue: latestAudit.changes.map((c) => `${c.field}: ${c.oldValue}`).join('; '),
        newValue: latestAudit.changes.map((c) => `${c.field}: ${c.newValue}`).join('; '),
        reason: latestAudit.reason || 'Perubahan data invoice',
        invoiceNumber: updatedTx.invoiceNumber,
      });
    }
  };

  // Delete Transaction with optional stock restoration & mandatory Activity Log
  const handleDeleteTransaction = (
    tx: Transaction,
    reason: string,
    restoreStock: boolean
  ) => {
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    deleteDocumentFromFirestore('transactions', tx.id).catch(() => {});

    const linkedWithdrawalIds = [`cf_tarik_${tx.id}`, `cf_tarik_admin_${tx.id}`];
    const existingLinkedIds = linkedWithdrawalIds.filter((id) => cashflows.some((c) => c.id === id));
    if (existingLinkedIds.length > 0) {
      setCashflows((prev) => prev.filter((c) => !existingLinkedIds.includes(c.id)));
      existingLinkedIds.forEach((id) => {
        deleteDocumentFromFirestore('cashflows', id).catch(() => {});
      });
    }

    if (restoreStock) {
      const restoreMap = new Map<string, number>();
      tx.items.forEach((item) => {
        if (item.isService || item.isQuickSale) return;
        const baseUnits = Math.max(0, (item.quantity || 0) * (item.conversionFactor || 1));
        if (baseUnits > 0) {
          restoreMap.set(item.productId, (restoreMap.get(item.productId) || 0) + baseUnits);
        }
      });

      if (restoreMap.size > 0) {
        const changedProducts: Product[] = [];
        setProducts((prev) =>
          prev.map((prod) => {
            const qtyToAdd = restoreMap.get(prod.id);
            if (!qtyToAdd) return prod;
            const nextProd = {
              ...prod,
              stockInBaseUnit: prod.stockInBaseUnit + qtyToAdd,
            };
            changedProducts.push(nextProd);
            return nextProd;
          })
        );
        if (changedProducts.length > 0) {
          saveBatchToFirestore('products', changedProducts).catch(() => {});
        }
      }
    }

    if (tx.customerId) {
      let targetUpdatedCust: Customer | null = null;
      const isUnsettledPiutang =
        tx.paymentMethod === 'PIUTANG' && tx.paymentStatus !== 'LUNAS';
      const pointsDiff = (tx.pointsUsed || 0) - (tx.pointsEarned || 0);
      if (isUnsettledPiutang || pointsDiff !== 0) {
        setCustomers((prev) =>
          prev.map((c) => {
            if (c.id !== tx.customerId) return c;
            targetUpdatedCust = {
              ...c,
              totalDebt: isUnsettledPiutang
                ? Math.max(0, c.totalDebt - tx.finalAmount)
                : c.totalDebt,
              totalPoints: Math.max(0, c.totalPoints + pointsDiff),
            };
            return targetUpdatedCust;
          })
        );
        if (targetUpdatedCust) {
          saveDocumentToFirestore('customers', tx.customerId, targetUpdatedCust).catch(() => {});
        }
      }
    }

    const totalItemsQty = tx.items.reduce((s, i) => s + i.quantity, 0);
    recordActivityLog({
      actionType: 'DELETE_TRANSACTION',
      targetType: 'TRANSACTION',
      targetId: tx.id,
      targetLabel: tx.invoiceNumber,
      summary: `Hapus transaksi ${tx.invoiceNumber} senilai ${formatRupiah(tx.finalAmount)} (${tx.items.length} jenis / ${totalItemsQty} unit${restoreStock ? ', stok dikembalikan' : ''})`,
      oldValue: formatRupiah(tx.finalAmount),
      newValue: 'DIHAPUS',
      deltaValue: `-${formatRupiah(tx.finalAmount)}`,
      numericDelta: -tx.finalAmount,
      reason: reason || 'Penghapusan transaksi',
      invoiceNumber: tx.invoiceNumber,
    });
  };

  // Merchandise Return Processing (Admin Only):
  // Restores returned stock to exact source FIFO batches, cancels loyalty points earned from returned items, and persists atomically
  const handleProcessTransactionReturn = async (payload: {
    transaction: Transaction;
    returnItems: Array<{ itemIndex: number; returnedQuantity: number }>;
    reason: string;
    restoreStock: boolean;
  }): Promise<{ updatedTx: Transaction; returnRecord: TransactionReturnRecord }> => {
    if (currentUser.role !== 'ADMIN') {
      throw new Error('Hanya Admin yang memiliki izin memproses retur barang.');
    }

    const tx = transactions.find((t) => t.id === payload.transaction.id) || payload.transaction;
    const prevReturns = Array.isArray(tx.returns) ? tx.returns : [];

    // Calculate previously returned quantities per item index
    const prevReturnedQtyMap = new Map<number, number>();
    prevReturns.forEach((ret) => {
      (ret.items || []).forEach((ri) => {
        prevReturnedQtyMap.set(
          ri.itemIndex,
          (prevReturnedQtyMap.get(ri.itemIndex) || 0) + (ri.returnedQuantity || 0)
        );
      });
    });

    const requestedMap = new Map<number, number>();
    payload.returnItems.forEach((entry) => {
      if (entry.returnedQuantity > 0) {
        requestedMap.set(entry.itemIndex, (requestedMap.get(entry.itemIndex) || 0) + entry.returnedQuantity);
      }
    });

    if (requestedMap.size === 0) {
      throw new Error('Pilih minimal 1 item dan kuantitas retur lebih dari 0.');
    }

    // Check whether after this return ALL items in transaction will be 100% returned
    const willBeFullReturn = tx.items.every((item, idx) => {
      const alreadyQty = prevReturnedQtyMap.get(idx) || 0;
      const nowQty = requestedMap.get(idx) || 0;
      return alreadyQty + nowQty >= item.quantity;
    });

    const netFactor = tx.subtotal > 0 ? Math.min(1, tx.finalAmount / tx.subtotal) : 1;
    const remainingTransactionAmount = Math.max(0, tx.finalAmount - (tx.returnedAmount || 0));
    const remainingTransactionPoints = Math.max(0, (tx.pointsEarned || 0) - (tx.returnedPoints || 0));

    // Calculate raw item refunds & stock restorations
    const workingProductsMap = new Map<string, Product>();
    products.forEach((p) => workingProductsMap.set(p.id, p));
    const changedProductIds = new Set<string>();

    const draftItems: Array<{
      itemIndex: number;
      productId: string;
      productName: string;
      unitName: string;
      conversionFactor: number;
      returnedQuantity: number;
      unitPrice: number;
      rawRefund: number;
      restoredBaseUnits: number;
      restoredBatches: TransactionReturnItem['restoredBatches'];
    }> = [];

    tx.items.forEach((item, idx) => {
      const reqQty = requestedMap.get(idx) || 0;
      if (reqQty <= 0) return;

      const alreadyQty = prevReturnedQtyMap.get(idx) || 0;
      const clampedQty = Math.min(reqQty, Math.max(0, item.quantity - alreadyQty));
      if (clampedQty <= 0) return;

      const conv = item.conversionFactor || 1;
      const returnBaseUnits = clampedQty * conv;
      const alreadyBaseUnits = alreadyQty * conv;
      const perUnitAmount = item.totalAmount / Math.max(1, item.quantity);
      const rawRefund = Math.round(perUnitAmount * clampedQty * netFactor);

      let restoredBaseUnits = 0;
      let restoredBatches: TransactionReturnItem['restoredBatches'] = [];

      if (payload.restoreStock && !item.isService && !item.isQuickSale) {
        const targetProduct = workingProductsMap.get(item.productId);
        if (targetProduct && targetProduct.productType !== 'JASA') {
          const { updatedProduct, restoredBatches: batchInfo } = restoreProductBatchesForReturn({
            product: targetProduct,
            item,
            returnBaseUnits,
            alreadyReturnedBaseUnits: alreadyBaseUnits,
            invoiceNumber: tx.invoiceNumber,
          });
          workingProductsMap.set(targetProduct.id, updatedProduct);
          changedProductIds.add(targetProduct.id);
          restoredBaseUnits = returnBaseUnits;
          restoredBatches = batchInfo;
        }
      }

      draftItems.push({
        itemIndex: idx,
        productId: item.productId,
        productName: item.productName,
        unitName: item.unitName,
        conversionFactor: conv,
        returnedQuantity: clampedQty,
        unitPrice: item.unitPrice,
        rawRefund,
        restoredBaseUnits,
        restoredBatches,
      });
    });

    if (draftItems.length === 0) {
      throw new Error('Tidak ada item valid yang masih dapat diretur pada transaksi ini.');
    }

    const rawRefundSum = draftItems.reduce((s, d) => s + d.rawRefund, 0);
    const totalRefundAmount = willBeFullReturn
      ? remainingTransactionAmount
      : Math.min(remainingTransactionAmount, rawRefundSum);

    // Adjust last item refund cleanly if full return corrected rounding by a few Rupiah
    let assignedRefundSum = 0;
    const refundAllocated = draftItems.map((d, i) => {
      if (i === draftItems.length - 1) {
        return Math.max(0, totalRefundAmount - assignedRefundSum);
      }
      const scaled =
        rawRefundSum > 0
          ? Math.round((d.rawRefund / rawRefundSum) * totalRefundAmount)
          : 0;
      assignedRefundSum += scaled;
      return scaled;
    });

    // Compute loyalty points cancelled from these returned items
    const totalPointsCancelled = willBeFullReturn
      ? remainingTransactionPoints
      : Math.min(
          remainingTransactionPoints,
          Math.round((tx.pointsEarned || 0) * (totalRefundAmount / Math.max(1, tx.finalAmount)))
        );

    let assignedPts = 0;
    const finalReturnItems: TransactionReturnItem[] = draftItems.map((d, i) => {
      const itemRefund = refundAllocated[i];
      let itemPtsCancelled = 0;
      if (totalPointsCancelled > 0) {
        if (i === draftItems.length - 1) {
          itemPtsCancelled = Math.max(0, totalPointsCancelled - assignedPts);
        } else {
          itemPtsCancelled =
            totalRefundAmount > 0
              ? Math.round((itemRefund / totalRefundAmount) * totalPointsCancelled)
              : 0;
          assignedPts += itemPtsCancelled;
        }
      }

      return {
        itemIndex: d.itemIndex,
        productId: d.productId,
        productName: d.productName,
        unitName: d.unitName,
        conversionFactor: d.conversionFactor,
        returnedQuantity: d.returnedQuantity,
        unitPrice: d.unitPrice,
        refundAmount: itemRefund,
        pointsCancelled: itemPtsCancelled,
        restoredBaseUnits: d.restoredBaseUnits,
        ...(d.restoredBatches && d.restoredBatches.length > 0
          ? { restoredBatches: d.restoredBatches }
          : {}),
      };
    });

    const now = Date.now();
    const dateSlug = new Date(now).toISOString().slice(0, 10).replace(/-/g, '');
    const returnRecord: TransactionReturnRecord = {
      id: `ret_${now}_${Math.random().toString(36).substring(2, 7)}`,
      returnNumber: `RET-${dateSlug}-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: now,
      processedByUserId: currentUser.id,
      processedByName: currentUser.name,
      processedByRole: currentUser.role,
      reason: payload.reason.trim() || 'Retur barang pelanggan',
      restoreStock: payload.restoreStock,
      totalRefundAmount,
      pointsCancelled: totalPointsCancelled,
      items: finalReturnItems,
    };

    const nextReturnedAmount = Math.min(tx.finalAmount, (tx.returnedAmount || 0) + totalRefundAmount);
    const nextReturnedPoints = Math.min(tx.pointsEarned || 0, (tx.returnedPoints || 0) + totalPointsCancelled);
    const nextReturnStatus: 'NONE' | 'PARTIAL' | 'FULL' = willBeFullReturn ? 'FULL' : 'PARTIAL';

    const totalUnitsReturned = finalReturnItems.reduce((s, it) => s + it.returnedQuantity, 0);
    const batchSummaryText = finalReturnItems
      .flatMap((it) =>
        (it.restoredBatches || []).map(
          (b) => `${b.batchNumber || b.batchId} (+${b.restoredBaseUnits})`
        )
      )
      .slice(0, 6)
      .join(', ');

    const auditEntry: TransactionAuditLogEntry = {
      id: `audit_${now}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      editedByUserId: currentUser.id,
      editedByName: currentUser.name,
      editedByRole: currentUser.role,
      reason: `Retur Barang (${returnRecord.returnNumber}): ${returnRecord.reason}`,
      changes: [
        {
          field: 'returnedAmount',
          label: 'Total Dana Diretur',
          oldValue: formatRupiah(tx.returnedAmount || 0),
          newValue: formatRupiah(nextReturnedAmount),
        },
        ...(totalPointsCancelled > 0
          ? [
              {
                field: 'returnedPoints',
                label: 'Pembatalan Poin Loyalitas',
                oldValue: `${formatNumber(tx.returnedPoints || 0)} Poin`,
                newValue: `${formatNumber(nextReturnedPoints)} Poin`,
              },
            ]
          : []),
        ...(batchSummaryText
          ? [
              {
                field: 'batchRestoration',
                label: 'Pengembalian Batch FIFO',
                oldValue: '-',
                newValue: batchSummaryText,
              },
            ]
          : []),
      ],
    };

    const updatedTx: Transaction = {
      ...tx,
      returns: [...prevReturns, returnRecord],
      returnedAmount: nextReturnedAmount,
      returnedPoints: nextReturnedPoints,
      returnStatus: nextReturnStatus,
      auditLogs: [...(tx.auditLogs || []), auditEntry],
    };

    // Prepare changed products and updated customer
    const changedProducts: Product[] = Array.from(changedProductIds)
      .map((pid) => workingProductsMap.get(pid))
      .filter((p): p is Product => Boolean(p));

    let updatedCustomerObj: Customer | null = null;
    if (tx.customerId) {
      const existingCustomer = customers.find((c) => c.id === tx.customerId);
      if (existingCustomer) {
        const isUnsettledPiutang =
          tx.paymentMethod === 'PIUTANG' && tx.paymentStatus !== 'LUNAS';
        const nextTotalPoints = Math.max(0, (existingCustomer.totalPoints || 0) - totalPointsCancelled);
        const nextTotalDebt = isUnsettledPiutang
          ? Math.max(0, (existingCustomer.totalDebt || 0) - totalRefundAmount)
          : existingCustomer.totalDebt;

        if (
          nextTotalPoints !== existingCustomer.totalPoints ||
          nextTotalDebt !== existingCustomer.totalDebt
        ) {
          updatedCustomerObj = {
            ...existingCustomer,
            totalPoints: nextTotalPoints,
            totalDebt: nextTotalDebt,
          };
        }
      }
    }

    // Persist to Firestore with explicit structured error handling
    try {
      await saveDocumentToFirestore('transactions', updatedTx.id, updatedTx);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transactions/${updatedTx.id}`);
    }

    if (changedProducts.length > 0) {
      try {
        await saveBatchToFirestore('products', changedProducts);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'products');
      }
    }

    if (updatedCustomerObj) {
      try {
        await saveDocumentToFirestore('customers', updatedCustomerObj.id, updatedCustomerObj);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `customers/${updatedCustomerObj.id}`);
      }
    }

    // Update React states cleanly after validation/persistence
    setTransactions((prev) => prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)));
    if (changedProducts.length > 0) {
      setProducts((prev) => prev.map((p) => workingProductsMap.get(p.id) || p));
    }
    if (updatedCustomerObj) {
      setCustomers((prev) =>
        prev.map((c) => (c.id === updatedCustomerObj!.id ? updatedCustomerObj! : c))
      );
    }

    // Record accountability log
    recordActivityLog({
      actionType: 'ITEM_RETURN',
      targetType: 'TRANSACTION',
      targetId: tx.id,
      targetLabel: `${tx.invoiceNumber} (${returnRecord.returnNumber})`,
      summary: `Retur ${finalReturnItems.length} jenis / ${totalUnitsReturned} unit senilai ${formatRupiah(totalRefundAmount)}${
        totalPointsCancelled > 0 ? `, batal -${formatNumber(totalPointsCancelled)} poin` : ''
      }${batchSummaryText ? ` • Batch: ${batchSummaryText}` : ''}`,
      oldValue: formatRupiah(tx.finalAmount),
      newValue: formatRupiah(Math.max(0, tx.finalAmount - nextReturnedAmount)),
      deltaValue: `-${formatRupiah(totalRefundAmount)}`,
      numericDelta: -totalRefundAmount,
      reason: returnRecord.reason,
      invoiceNumber: tx.invoiceNumber,
      metadata: {
        returnNumber: returnRecord.returnNumber,
        pointsCancelled: totalPointsCancelled,
        restoreStock: payload.restoreStock,
        returnedItemCount: finalReturnItems.length,
      },
    });

    return { updatedTx, returnRecord };
  };

  // Customer Satisfaction Rating (1-5 stars) submitted from Digital Receipt
  const handleRateTransaction = (
    transactionId: string,
    payload: {
      rating: number;
      tags?: string[];
      comment?: string;
      channel?: 'RECEIPT_MODAL' | 'DIGITAL_LINK';
    }
  ) => {
    const targetTx = transactions.find((t) => t.id === transactionId);
    if (!targetTx) return;

    const cleanTags = payload.tags?.filter(Boolean);
    const cleanComment = payload.comment?.trim();
    const updatedTx: Transaction = {
      ...targetTx,
      customerRating: Math.min(5, Math.max(1, Math.round(payload.rating))),
      customerRatedAt: Date.now(),
      customerRatingChannel: payload.channel || (isDigitalReceiptLinkView ? 'DIGITAL_LINK' : 'RECEIPT_MODAL'),
      ...(cleanTags && cleanTags.length > 0 ? { customerRatingTags: cleanTags } : {}),
      ...(cleanComment ? { customerRatingComment: cleanComment } : {}),
    };
    if (!cleanTags || cleanTags.length === 0) {
      delete updatedTx.customerRatingTags;
    }
    if (!cleanComment) {
      delete updatedTx.customerRatingComment;
    }

    setTransactions((prev) =>
      prev.map((t) => (t.id === transactionId ? updatedTx : t))
    );
    setLastCompletedTransaction((prev) =>
      prev?.id === transactionId ? updatedTx : prev
    );
    saveDocumentToFirestore('transactions', transactionId, updatedTx).catch(() => {});
  };

  // Persist receipt email metadata on transaction and optionally customer profile
  const handleSaveReceiptEmail = (
    transactionId: string,
    email: string,
    customerId?: string,
    saveToCustomerProfile?: boolean
  ) => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    const targetTx = transactions.find((t) => t.id === transactionId);
    if (targetTx) {
      const updatedTx: Transaction = {
        ...targetTx,
        customerEmail: cleanEmail,
        receiptEmailSentTo: cleanEmail,
        receiptEmailSentAt: Date.now(),
      };
      setTransactions((prev) =>
        prev.map((t) => (t.id === transactionId ? updatedTx : t))
      );
      setLastCompletedTransaction((prev) =>
        prev?.id === transactionId ? updatedTx : prev
      );
      saveDocumentToFirestore('transactions', transactionId, updatedTx).catch(() => {});
    }

    if (customerId && saveToCustomerProfile) {
      const targetCustomer = customers.find((c) => c.id === customerId);
      if (targetCustomer && targetCustomer.email !== cleanEmail) {
        const updatedCustomer: Customer = {
          ...targetCustomer,
          email: cleanEmail,
        };
        handleUpdateCustomer(updatedCustomer);
      }
    }
  };

  // Complete Restock / PO from Supplier
  const handleCompleteRestock = (supplier: Supplier, restockItems: RestockItem[]) => {
    const restockByProductId = new Map<string, RestockItem[]>();
    restockItems.forEach((item) => {
      const list = restockByProductId.get(item.productId);
      if (list) list.push(item);
      else restockByProductId.set(item.productId, [item]);
    });

    const changedProducts: Product[] = [];
    const updatedProducts = products.map((prod) => {
      const matchedItems = restockByProductId.get(prod.id);
      if (!matchedItems) return prod;

      let addInBaseUnit = 0;
      let incomingCost = prod.costPrice;
      let incomingExpiry = prod.expiryDate;
      matchedItems.forEach((item) => {
        const added = item.quantity * (item.conversionFactor || 1);
        addInBaseUnit += added;
        if (item.costPrice > 0) {
          incomingCost = item.conversionFactor > 1 ? Math.round(item.costPrice / item.conversionFactor) : item.costPrice;
        }
        if (item.expiryDate) incomingExpiry = item.expiryDate;
      });
      if (addInBaseUnit > 0) {
        const existingBatches: ProductBatch[] = Array.isArray(prod.batches) ? [...prod.batches] : [];
        const newBatch: ProductBatch = {
          id: 'batch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          batchNumber: `RESTOCK-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
          receivedAt: Date.now(),
          receivedDate: new Date().toISOString().slice(0, 10),
          expiryDate: incomingExpiry,
          initialQuantity: addInBaseUnit,
          remainingQuantity: addInBaseUnit,
          costPrice: incomingCost,
          supplierName: supplier.name,
        };
        const nextProd = {
          ...prod,
          stockInBaseUnit: prod.stockInBaseUnit + addInBaseUnit,
          batches: [...existingBatches, newBatch],
          expiryDate: incomingExpiry || prod.expiryDate,
        };
        changedProducts.push(nextProd);
        return nextProd;
      }
      return prod;
    });
    setProducts(updatedProducts);
    if (changedProducts.length > 0) {
      saveBatchToFirestore('products', changedProducts).catch(() => {});
    }
  };

  // Save Purchase Order & Restock Items (Supports both NEW purchase and EDITING existing purchase)
  const handleSavePurchase = (purchaseOrder: RestockOrder, itemsToRestock: RestockItem[]) => {
    const existingOrderIndex = purchases.findIndex((p) => p.id === purchaseOrder.id);
    const oldOrder = existingOrderIndex >= 0 ? purchases[existingOrderIndex] : null;

    const nextPurchases = [purchaseOrder, ...purchases.filter((p) => p.id !== purchaseOrder.id)];
    setPurchases(nextPurchases);
    saveDocumentToFirestore('purchases', purchaseOrder.id, purchaseOrder).catch(() => {});

    if (itemsToRestock && itemsToRestock.length > 0) {
      const newItemsMap = new Map(itemsToRestock.map((i) => [i.productId, i]));
      const oldItemsMap = new Map((oldOrder?.items || []).map((i) => [i.productId, i]));
      const changedProducts: Product[] = [];

      const updatedProducts = products.map((prod) => {
        const newItem = newItemsMap.get(prod.id);
        const oldItem = oldItemsMap.get(prod.id);

        if (!newItem && !oldItem) return prod;

        let batches: ProductBatch[] = Array.isArray(prod.batches) ? prod.batches.map((b) => ({ ...b })) : [];

        if (oldOrder) {
          batches = batches.filter((b) => b.purchaseOrderId !== purchaseOrder.id && b.batchNumber !== oldOrder.poNumber);
        }

        let newStock = prod.stockInBaseUnit;
        if (oldOrder && oldItem) {
          const oldBaseUnits = oldItem.quantity * (oldItem.conversionFactor || 1);
          newStock = Math.max(0, newStock - oldBaseUnits);
        }

        if (newItem) {
          const addedBaseUnits = newItem.quantity * (newItem.conversionFactor || 1);
          const baseCostFromRestock = newItem.costPrice > 0
            ? (newItem.conversionFactor > 1 ? Math.round(newItem.costPrice / newItem.conversionFactor) : newItem.costPrice)
            : prod.costPrice;

          const updatedUnits = prod.units.map((u, idx) => {
            if (idx === 0) return { ...u, costPrice: baseCostFromRestock };
            return { ...u, costPrice: Math.round(baseCostFromRestock * (u.conversionFactor || 1)) };
          });

          const newBatch: ProductBatch = {
            id: 'batch_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            batchNumber: purchaseOrder.poNumber || purchaseOrder.invoiceNumber || `PO-${Date.now().toString().slice(-6)}`,
            receivedAt: Date.now(),
            receivedDate: new Date().toISOString().slice(0, 10),
            expiryDate: newItem.expiryDate || prod.expiryDate,
            initialQuantity: addedBaseUnits,
            remainingQuantity: addedBaseUnits,
            costPrice: baseCostFromRestock,
            supplierName: purchaseOrder.supplierName || 'Supplier',
            purchaseOrderId: purchaseOrder.id,
          };

          batches.push(newBatch);

          batches.sort((a, b) => {
            if (a.expiryDate && b.expiryDate) {
              const diff = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
              if (diff !== 0) return diff;
            } else if (a.expiryDate && !b.expiryDate) return -1;
            else if (!a.expiryDate && b.expiryDate) return 1;
            return (a.receivedAt || 0) - (b.receivedAt || 0);
          });

          const nextProd = {
            ...prod,
            stockInBaseUnit: newStock + addedBaseUnits,
            costPrice: baseCostFromRestock,
            units: updatedUnits,
            expiryDate: newItem.expiryDate || prod.expiryDate,
            batches,
          };
          changedProducts.push(nextProd);
          return nextProd;
        } else {
          const nextProd = {
            ...prod,
            stockInBaseUnit: newStock,
            batches,
          };
          changedProducts.push(nextProd);
          return nextProd;
        }
      });

      setProducts(updatedProducts);
      if (changedProducts.length > 0) {
        saveBatchToFirestore('products', changedProducts).catch(() => {});
      }
    }
  };

  const handleDeletePurchase = (purchaseId: string) => {
    const nextPurchases = purchases.filter((p) => p.id !== purchaseId);
    setPurchases(nextPurchases);
    deleteDocumentFromFirestore('purchases', purchaseId).catch(() => {});
  };

  // Mass CSV/Excel Import handler (sync ONLY newly added products + auto-register new categories)
  const handleBatchAddProducts = (newProds: Omit<Product, 'id'>[]) => {
    const timestamp = Date.now();
    const prodsToAdd: Product[] = newProds.map((item, idx) => ({
      ...item,
      id: 'prod_' + (timestamp + idx) + '_' + Math.random().toString(36).substring(2, 6),
    }));

    setProducts((prev) => [...prodsToAdd, ...prev]);
    if (prodsToAdd.length > 0) {
      saveBatchToFirestore('products', prodsToAdd).catch(() => {});
      registerMissingCategoriesFromProducts(prodsToAdd, 'Otomatis ditambahkan dari impor Excel/CSV');
    }
    sound.playSuccessChime();
    alert(`Berhasil mengimpor ${prodsToAdd.length} produk ke dalam database.`);
  };

  // Reset to initial demo data
  const handleResetToDemoData = () => {
    localStorage.removeItem('kasir_db_cleared_by_user');
    localStorage.clear();
    setUsers(DEMO_USERS);
    setCurrentUser(DEMO_USERS[0]);
    setProducts(INITIAL_PRODUCTS);
    setCategories(INITIAL_CATEGORIES);
    setCustomers(INITIAL_CUSTOMERS);
    setSuppliers(INITIAL_SUPPLIERS);
    setPurchases([]);
    setTransactions(INITIAL_TRANSACTIONS);
    setStoreSettings(INITIAL_STORE_SETTINGS);
    setAttendances(INITIAL_ATTENDANCES);
    setStockOpnames(INITIAL_STOCK_OPNAMES);
    setCart([]);
    setSelectedCustomer(null);
    setUsePoints(false);

    // Sync reset state to Firestore
    saveBatchToFirestore('products', INITIAL_PRODUCTS).catch(() => {});
    saveBatchToFirestore('categories', INITIAL_CATEGORIES).catch(() => {});
    saveBatchToFirestore('customers', INITIAL_CUSTOMERS).catch(() => {});
    saveBatchToFirestore('suppliers', INITIAL_SUPPLIERS).catch(() => {});
    saveBatchToFirestore('users', DEMO_USERS).catch(() => {});
    saveStoreSettingsToFirestore(INITIAL_STORE_SETTINGS).catch(() => {});

    sound.playSuccessChime();
    alert('Data toko telah berhasil di-reset ke data bawaan.');
  };

  // Clear all database (products, transactions, customers, suppliers, reports, history) to clean slate
  // and reset user management to standard: 1 user only (Admin with PIN 1234 and ADMIN privilege)
  const handleClearDatabaseExceptUsers = async () => {
    try {
      localStorage.setItem('kasir_db_cleared_by_user', 'true');
      clearCloudCollectionHistory();

      // Clear operational local storage keys
      localStorage.removeItem('kasir_products');
      localStorage.removeItem('kasir_purchases');
      localStorage.removeItem('kasir_categories');
      localStorage.removeItem('kasir_customers');
      localStorage.removeItem('kasir_suppliers');
      localStorage.removeItem('kasir_transactions');
      localStorage.removeItem('kasir_attendances');
      localStorage.removeItem('kasir_stock_opnames');
      localStorage.removeItem('kasir_cart');
      localStorage.removeItem('kasir_pending_transactions');
      localStorage.removeItem('kasir_debt_reminders');
      localStorage.removeItem('kasir_stock_alert_history');
      localStorage.removeItem(DAILY_LOW_STOCK_LEDGER_KEY);
      localStorage.removeItem('kasir_latest_sunday_backup');
      localStorage.removeItem('kasir_cashflows');
      localStorage.removeItem('kasir_activity_logs');
      localStorage.removeItem('kasir_tax_records');
      localStorage.removeItem('kasir_tax_audit_logs');
      localStorage.removeItem('kasir_tax_adjustments');
      localStorage.removeItem('kasir_balance_sheet_entries');
      hasSeededStockTrackerRef.current = false;
      prevProductsStockRef.current = new Map();
      setAdminLowStockWaAlert(null);

      // Explicitly persist empty arrays so storage never falls back to legacy caches
      saveStorage('kasir_products', []);
      saveStorage('kasir_purchases', []);
      saveStorage('kasir_categories', []);
      saveStorage('kasir_customers', []);
      saveStorage('kasir_suppliers', []);
      saveStorage('kasir_transactions', []);
      saveStorage('kasir_attendances', []);
      saveStorage('kasir_stock_opnames', []);
      saveStorage('kasir_cashflows', []);
      saveStorage('kasir_activity_logs', []);
      saveStorage('kasir_tax_records', []);
      saveStorage('kasir_tax_audit_logs', []);
      saveStorage('kasir_tax_adjustments', []);
      saveStorage('kasir_balance_sheet_entries', []);

      // Reset local React state to zero/empty
      setProducts([]);
      setPurchases([]);
      setCategories([]);
      setCustomers([]);
      setSuppliers([]);
      setTransactions([]);
      setAttendances([]);
      setStockOpnames([]);
      setCashflows([]);
      setActivityLogs([]);
      setTaxRecords([]);
      setTaxAuditLogs([]);
      setTaxAdjustments([]);
      setBalanceSheetEntries([]);
      setCart([]);
      setSelectedCustomer(null);
      setRequestedPoints(0);
      setHasManualPointOverride(false);
      setSpecialPriceNotice(null);

      // Reset user management to standard: 1 user (Admin with PIN 1234)
      setUsers([DEFAULT_ADMIN_USER]);
      setCurrentUser(DEFAULT_ADMIN_USER);
      saveStorage('kasir_users', [DEFAULT_ADMIN_USER]);
      saveStorage('kasir_active_user', DEFAULT_ADMIN_USER);

      // Clean Firestore operational collections and reset users collection
      await clearAllDatabaseExceptUsers(DEFAULT_ADMIN_USER);

      // Re-assert empty states after cloud operations to guarantee UI is clean slate
      setProducts([]);
      setPurchases([]);
      setCategories([]);
      setCustomers([]);
      setSuppliers([]);
      setTransactions([]);
      setAttendances([]);
      setStockOpnames([]);
      setCashflows([]);
      setActivityLogs([]);
      setTaxRecords([]);
      setTaxAuditLogs([]);
      setTaxAdjustments([]);
      setBalanceSheetEntries([]);
      setCart([]);

      sound.playSuccessChime();
      alert('Database berhasil dikosongkan. Seluruh data barang, transaksi, pelanggan, supplier, laporan, dan riwayat telah kembali kosong (0). Manajemen pengguna telah kembali ke standar: 1 user saja (Admin, PIN: 1234, privilege Admin).');
    } catch (err) {
      console.error('Error clearing database:', err);
      alert('Terjadi kendala saat mengosongkan database di cloud. Periksa koneksi internet Anda.');
    }
  };

  // Restore application backup data (replaces existing data across local state and Cloud Firestore)
  const handleRestoreBackup = async (backup: BackupPayload): Promise<void> => {
    const nextProducts = Array.isArray(backup.data.products) ? backup.data.products : [];
    const nextCategories = Array.isArray(backup.data.categories) ? backup.data.categories : [];
    const nextCustomerCategories =
      Array.isArray(backup.data.customerCategories) && backup.data.customerCategories.length > 0
        ? backup.data.customerCategories
        : INITIAL_CUSTOMER_CATEGORIES;
    const nextCustomers = Array.isArray(backup.data.customers) ? backup.data.customers : [];
    const nextSuppliers = Array.isArray(backup.data.suppliers) ? backup.data.suppliers : [];
    const nextPurchases = Array.isArray(backup.data.purchases) ? backup.data.purchases : [];
    const nextTransactions = Array.isArray(backup.data.transactions) ? backup.data.transactions : [];
    const nextCashflows = Array.isArray(backup.data.cashflows) ? backup.data.cashflows : [];
    const nextAttendances = Array.isArray(backup.data.attendances) ? backup.data.attendances : [];
    const nextStockOpnames = Array.isArray(backup.data.stockOpnames) ? backup.data.stockOpnames : [];
    const nextOnlineOrders = Array.isArray(backup.data.onlineOrders) ? backup.data.onlineOrders : [];
    const nextActivityLogs = Array.isArray(backup.data.activityLogs) ? backup.data.activityLogs : [];
    const nextTaxRecords = Array.isArray(backup.data.taxRecords) ? backup.data.taxRecords : [];
    const nextTaxAuditLogs = Array.isArray(backup.data.taxAuditLogs) ? backup.data.taxAuditLogs : [];
    const nextTaxAdjustments = Array.isArray(backup.data.taxAdjustments) ? backup.data.taxAdjustments : [];
    const nextBalanceSheetEntries = Array.isArray(backup.data.balanceSheetEntries)
      ? backup.data.balanceSheetEntries
      : [];
    const nextSettings: StoreSettings = backup.data.storeSettings
      ? {
          ...INITIAL_STORE_SETTINGS,
          ...backup.data.storeSettings,
          scheduledAdminLowStockWhatsApp: normalizeLowStockSchedule(
            backup.data.storeSettings.scheduledAdminLowStockWhatsApp || DEFAULT_LOW_STOCK_SCHEDULE
          ),
          scheduledDailySalesReportWhatsApp: normalizeDailySalesSchedule(
            backup.data.storeSettings.scheduledDailySalesReportWhatsApp || DEFAULT_DAILY_SALES_SCHEDULE
          ),
        }
      : storeSettings;

    setProducts(nextProducts);
    setCategories(nextCategories);
    setCustomerCategories(nextCustomerCategories);
    setCustomers(nextCustomers);
    setSuppliers(nextSuppliers);
    setPurchases(nextPurchases);
    setTransactions(nextTransactions);
    setCashflows(nextCashflows);
    setAttendances(nextAttendances);
    setStockOpnames(nextStockOpnames);
    setOnlineOrders(nextOnlineOrders);
    setActivityLogs(nextActivityLogs);
    setTaxRecords(nextTaxRecords);
    setTaxAuditLogs(nextTaxAuditLogs);
    setTaxAdjustments(nextTaxAdjustments);
    setBalanceSheetEntries(nextBalanceSheetEntries);
    setStoreSettings(nextSettings);

    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('kasir_db_cleared_by_user');
      }
    } catch {}

    const hasUsersToRestore = Array.isArray(backup.data.users) && backup.data.users.length > 0;
    if (hasUsersToRestore) {
      const nextUsers = backup.data.users!;
      setUsers(nextUsers);
      if (!nextUsers.some((u) => u.id === currentUser.id)) {
        setCurrentUser(nextUsers[0]);
      }
    }

    // Reset active cart and selected customer to prevent broken references
    setCart([]);
    setSelectedCustomer(null);
    setRequestedPoints(0);
    setHasManualPointOverride(false);
    setSpecialPriceNotice(null);

    const cloudTasks: Promise<unknown>[] = [
      replaceCollectionInFirestore('products', nextProducts),
      replaceCollectionInFirestore('categories', nextCategories),
      replaceCollectionInFirestore('customer_categories', nextCustomerCategories),
      replaceCollectionInFirestore('customers', nextCustomers),
      replaceCollectionInFirestore('suppliers', nextSuppliers),
      replaceCollectionInFirestore('purchases', nextPurchases),
      replaceCollectionInFirestore('transactions', nextTransactions),
      replaceCollectionInFirestore('cashflows', nextCashflows),
      replaceCollectionInFirestore('attendances', nextAttendances),
      replaceCollectionInFirestore('stock_opnames', nextStockOpnames),
      replaceCollectionInFirestore('online_orders', nextOnlineOrders),
      replaceCollectionInFirestore('activity_logs', nextActivityLogs),
      replaceCollectionInFirestore('tax_records', nextTaxRecords),
      replaceCollectionInFirestore('tax_audit_logs', nextTaxAuditLogs),
      replaceCollectionInFirestore('tax_adjustments', nextTaxAdjustments),
      replaceCollectionInFirestore('balance_sheet_entries', nextBalanceSheetEntries),
      saveStoreSettingsToFirestore(nextSettings, true),
    ];

    if (hasUsersToRestore) {
      cloudTasks.push(replaceCollectionInFirestore('users', backup.data.users!));
    }

    await Promise.all(cloudTasks);
  };

  // Attendance Handlers
  const handleCheckIn = (userId: string, notes?: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const newAtt: AttendanceRecord = {
      id: 'att_' + Date.now(),
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      date: todayStr,
      checkInTime: timeStr,
      checkInTimestamp: now.getTime(),
      notes,
      status: 'PRESENT',
    };

    setAttendances((prev) => [newAtt, ...prev]);
    saveDocumentToFirestore('attendances', newAtt.id, newAtt).catch(() => {});
  };

  const handleCheckOut = (attendanceId: string, notes?: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    let targetUpdated: AttendanceRecord | null = null;
    setAttendances((prev) =>
      prev.map((att) => {
        if (att.id === attendanceId) {
          const durationMinutes = Math.max(
            0,
            Math.round((now.getTime() - att.checkInTimestamp) / 60000)
          );
          targetUpdated = {
            ...att,
            checkOutTime: timeStr,
            checkOutTimestamp: now.getTime(),
            durationMinutes,
            notes: notes ? (att.notes ? `${att.notes} | ${notes}` : notes) : att.notes,
            status: 'COMPLETED' as const,
          };
          return targetUpdated;
        }
        return att;
      })
    );
    if (targetUpdated) {
      saveDocumentToFirestore('attendances', attendanceId, targetUpdated).catch(() => {});
    }
  };

  const handleAddManualAttendance = (record: Omit<AttendanceRecord, 'id'>) => {
    const newAtt: AttendanceRecord = {
      ...record,
      id: 'att_' + Date.now(),
    };
    setAttendances((prev) => [newAtt, ...prev]);
    saveDocumentToFirestore('attendances', newAtt.id, newAtt).catch(() => {});
  };

  const handleDeleteAttendance = (attendanceId: string) => {
    sound.playTap();
    setAttendances((prev) => prev.filter((a) => a.id !== attendanceId));
    deleteDocumentFromFirestore('attendances', attendanceId).catch(() => {});
  };

  // Customer Management CRUD
  const handleAddCustomer = (data: Omit<Customer, 'id' | 'createdAt' | 'totalPoints' | 'totalDebt'>) => {
    const newCust: Customer = {
      ...data,
      membershipId: data.membershipId?.trim() || generateMembershipId(),
      id: 'cust_' + Date.now(),
      totalPoints: 0,
      totalDebt: 0,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setCustomers([newCust, ...customers]);
    handleSelectCustomer(newCust); // auto select for current cart
    saveDocumentToFirestore('customers', newCust.id, newCust).catch(() => {});
  };

  const handleUpdateCustomer = (updated: Customer) => {
    setCustomers(customers.map((c) => (c.id === updated.id ? updated : c)));
    if (selectedCustomer?.id === updated.id) {
      handleSelectCustomer(updated);
    }
    saveDocumentToFirestore('customers', updated.id, updated).catch(() => {});
  };

  const handleDeleteCustomer = (id: string) => {
    setCustomers(customers.filter((c) => c.id !== id));
    if (selectedCustomer?.id === id) handleSelectCustomer(null);
    deleteDocumentFromFirestore('customers', id).catch(() => {});
  };

  // Customer Category CRUD with Firestore persistence & cascade updates
  const handleAddCustomerCategory = (name: string, color?: string, description?: string) => {
    const cleanName = name.trim().toUpperCase();
    if (!cleanName) return;
    if (customerCategories.some((c) => c.name.toUpperCase() === cleanName)) return;

    const newCategory: CustomerCategoryItem = {
      id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: cleanName,
      color: color || 'sky',
      description: description?.trim() || '',
      isSystemDefault: false,
      createdAt: new Date().toISOString(),
    };

    setCustomerCategories((prev) => [...prev, newCategory]);
    saveDocumentToFirestore('customer_categories', newCategory.id, newCategory).catch(() => {});
  };

  const handleUpdateCustomerCategory = (id: string, name: string, color?: string, description?: string) => {
    const cleanName = name.trim().toUpperCase();
    if (!cleanName) return;

    const existing = customerCategories.find((c) => c.id === id);
    const oldName = existing?.name;

    const updated = customerCategories.map((c) => {
      if (c.id === id) {
        return {
          ...c,
          name: cleanName,
          color: color || c.color,
          description: description !== undefined ? description.trim() : c.description,
        };
      }
      return c;
    });

    setCustomerCategories(updated);
    const updatedItem = updated.find((c) => c.id === id);
    if (updatedItem) {
      saveDocumentToFirestore('customer_categories', id, updatedItem).catch(() => {});
    }

    // Cascade rename to customers & products if category name changed
    if (oldName && oldName.toUpperCase() !== cleanName) {
      const changedCustomers: Customer[] = [];
      const updatedCustomers = customers.map((cust) => {
        if (cust.customerCategory && cust.customerCategory.toUpperCase() === oldName.toUpperCase()) {
          const updatedCust = { ...cust, customerCategory: cleanName };
          changedCustomers.push(updatedCust);
          return updatedCust;
        }
        return cust;
      });
      setCustomers(updatedCustomers);
      if (changedCustomers.length > 0) {
        saveBatchToFirestore('customers', changedCustomers).catch(() => {});
      }

      const changedProducts: Product[] = [];
      const updatedProducts = products.map((prod) => {
        if (
          prod.customerPrices &&
          prod.customerPrices.some((csp) => csp.customerCategory.toUpperCase() === oldName.toUpperCase())
        ) {
          const updatedCp = prod.customerPrices.map((csp) =>
            csp.customerCategory.toUpperCase() === oldName.toUpperCase() ? { ...csp, customerCategory: cleanName } : csp
          );
          const updatedProd = { ...prod, customerPrices: updatedCp };
          changedProducts.push(updatedProd);
          return updatedProd;
        }
        return prod;
      });
      setProducts(updatedProducts);
      if (changedProducts.length > 0) {
        saveBatchToFirestore('products', changedProducts).catch(() => {});
      }

      if (selectedCustomer?.customerCategory && selectedCustomer.customerCategory.toUpperCase() === oldName.toUpperCase()) {
        setSelectedCustomer({ ...selectedCustomer, customerCategory: cleanName });
      }
    }
  };

  const handleDeleteCustomerCategory = (id: string) => {
    const target = customerCategories.find((c) => c.id === id);
    if (!target) return;

    const updated = customerCategories.filter((c) => c.id !== id);
    setCustomerCategories(updated);
    deleteDocumentFromFirestore('customer_categories', id).catch(() => {});

    // Fallback affected customers to 'UMUM'
    const targetName = target.name.toUpperCase();
    const changedCustomers: Customer[] = [];
    const updatedCustomers = customers.map((cust) => {
      if (cust.customerCategory && cust.customerCategory.toUpperCase() === targetName) {
        const fallbackCust = { ...cust, customerCategory: 'UMUM' };
        changedCustomers.push(fallbackCust);
        return fallbackCust;
      }
      return cust;
    });
    setCustomers(updatedCustomers);
    if (changedCustomers.length > 0) {
      saveBatchToFirestore('customers', changedCustomers).catch(() => {});
    }

    if (selectedCustomer?.customerCategory && selectedCustomer.customerCategory.toUpperCase() === targetName) {
      setSelectedCustomer({ ...selectedCustomer, customerCategory: 'UMUM' });
    }
  };

  // Product Management CRUD
  const handleAddProduct = (data: Omit<Product, 'id'>) => {
    const isPhysical = data.productType !== 'JASA';
    const initialQty = isPhysical ? (data.stockInBaseUnit || 0) : 99999;
    const initialCost = data.costPrice || 0;

    const initialBatches: ProductBatch[] = (isPhysical && initialQty > 0) ? [
      {
        id: 'batch_' + Date.now(),
        batchNumber: 'BATCH-001',
        receivedAt: Date.now(),
        receivedDate: new Date().toISOString().slice(0, 10),
        expiryDate: data.expiryDate,
        initialQuantity: initialQty,
        remainingQuantity: initialQty,
        costPrice: initialCost,
        supplierName: 'Stok Awal Toko',
      }
    ] : [];

    const newProd: Product = {
      ...data,
      id: 'prod_' + Date.now(),
      batches: data.batches && data.batches.length > 0 ? data.batches : initialBatches,
    };
    setProducts((prev) => [newProd, ...prev.filter((p) => p.id !== newProd.id)]);
    saveDocumentToFirestore('products', newProd.id, newProd).catch((err) => {
      console.error('[FirebaseSync] Failed to save product to Firestore:', err);
    });
    registerMissingCategoriesFromProducts([newProd], 'Otomatis ditambahkan dari produk');

    const baseUnit = newProd.units?.[0];
    if (baseUnit && (baseUnit.sellingPrice || 0) > 0) {
      const sell = Number(baseUnit.sellingPrice || 0);
      const cost = Number(baseUnit.costPrice || newProd.costPrice || 0);
      const marginRp = sell - cost;
      const marginPct = sell > 0 ? Math.round((marginRp / sell) * 1000) / 10 : 0;
      recordActivityLog({
        actionType: 'MANUAL_PRICE_EDIT',
        targetType: 'PRODUCT',
        targetId: newProd.id,
        targetLabel: `${newProd.name} (${baseUnit.unitName})`.slice(0, 235),
        summary: `Harga jual awal ditetapkan ${formatRupiah(sell)}/${baseUnit.unitName} (Modal ${formatRupiah(cost)}, Margin ${marginPct.toFixed(1)}%)`.slice(0, 590),
        oldValue: formatRupiah(0),
        newValue: formatRupiah(sell),
        deltaValue: `Margin ${marginPct.toFixed(1)}% (${formatRupiah(marginRp)})`,
        numericDelta: sell,
        reason: 'Harga jual awal saat produk ditambahkan',
        productId: newProd.id,
        metadata: {
          stage: 'CATALOG_PRICE_UPDATE',
          sku: String(newProd.sku || newProd.barcode || '').slice(0, 40),
          category: String(newProd.category || 'Umum').slice(0, 60),
          unitName: baseUnit.unitName,
          conversionFactor: baseUnit.conversionFactor || 1,
          oldSellingPrice: 0,
          newSellingPrice: sell,
          oldCostPrice: cost,
          newCostPrice: cost,
          oldMarginRupiah: 0,
          newMarginRupiah: marginRp,
          oldMarginPercent: 0,
          newMarginPercent: marginPct,
          marginDeltaPercent: marginPct,
          priceDeltaPercent: 0,
          changeDirection: 'HARGA_AWAL',
        },
      });
    }
  };

  const handleUpdateProduct = (updated: Product, priceChangeReason?: string) => {
    const prevProd = productMap.get(updated.id);
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    saveDocumentToFirestore('products', updated.id, updated).catch((err) => {
      console.error('[FirebaseSync] Failed to update product in Firestore:', err);
    });

    if (prevProd) {
      const cleanedReason = (priceChangeReason || '').trim();
      const prevBaseCost = Number(prevProd.costPrice || prevProd.units?.[0]?.costPrice || 0);
      const nextBaseCost = Number(updated.costPrice || updated.units?.[0]?.costPrice || 0);

      (updated.units || []).forEach((newUnit) => {
        const oldUnit =
          (prevProd.units || []).find(
            (u) =>
              u.id === newUnit.id ||
              u.unitName.trim().toUpperCase() === newUnit.unitName.trim().toUpperCase()
          ) || null;
        if (!oldUnit) return;

        const factor = newUnit.conversionFactor || 1;
        const oldSell = Number(oldUnit.sellingPrice || 0);
        const newSell = Number(newUnit.sellingPrice || 0);
        const oldCost = Number(
          oldUnit.costPrice !== undefined && oldUnit.costPrice > 0
            ? oldUnit.costPrice
            : Math.round(prevBaseCost * factor)
        );
        const newCost = Number(
          newUnit.costPrice !== undefined && newUnit.costPrice > 0
            ? newUnit.costPrice
            : Math.round(nextBaseCost * factor)
        );

        if (oldSell === newSell && oldCost === newCost) return;

        const priceDelta = newSell - oldSell;
        const priceDeltaPct = oldSell > 0 ? Math.round((priceDelta / oldSell) * 1000) / 10 : 0;
        const oldMarginRp = oldSell - oldCost;
        const newMarginRp = newSell - newCost;
        const oldMarginPct = oldSell > 0 ? Math.round((oldMarginRp / oldSell) * 1000) / 10 : 0;
        const newMarginPct = newSell > 0 ? Math.round((newMarginRp / newSell) * 1000) / 10 : 0;
        const marginDeltaPct = Math.round((newMarginPct - oldMarginPct) * 10) / 10;

        const changeDirection =
          priceDelta > 0 ? 'NAIK' : priceDelta < 0 ? 'TURUN' : 'MODAL_BERUBAH';

        const summaryText =
          priceDelta !== 0
            ? `Harga jual ${newUnit.unitName} berubah ${formatRupiah(oldSell)} → ${formatRupiah(newSell)} (${priceDelta > 0 ? '+' : ''}${priceDeltaPct.toFixed(1)}%). Margin: ${oldMarginPct.toFixed(1)}% → ${newMarginPct.toFixed(1)}% (${marginDeltaPct >= 0 ? '+' : ''}${marginDeltaPct.toFixed(1)}%)`
            : `Harga modal/HPP ${newUnit.unitName} berubah ${formatRupiah(oldCost)} → ${formatRupiah(newCost)} (Jual tetap ${formatRupiah(newSell)}). Margin: ${oldMarginPct.toFixed(1)}% → ${newMarginPct.toFixed(1)}%`;

        recordActivityLog({
          actionType: 'MANUAL_PRICE_EDIT',
          targetType: 'PRODUCT',
          targetId: updated.id,
          targetLabel: `${updated.name} (${newUnit.unitName})`.slice(0, 235),
          summary: summaryText.slice(0, 590),
          oldValue: `${formatRupiah(oldSell)} (Modal ${formatRupiah(oldCost)})`,
          newValue: `${formatRupiah(newSell)} (Modal ${formatRupiah(newCost)})`,
          deltaValue: `${priceDelta >= 0 ? '+' : ''}${formatRupiah(priceDelta)} · Margin ${marginDeltaPct >= 0 ? '+' : ''}${marginDeltaPct.toFixed(1)}%`,
          numericDelta: priceDelta !== 0 ? priceDelta : newMarginRp - oldMarginRp,
          reason:
            cleanedReason ||
            (priceDelta > 0
              ? 'Kenaikan harga jual master produk'
              : priceDelta < 0
              ? 'Penyesuaian / penurunan harga jual master produk'
              : 'Perubahan harga modal / HPP berdampak pada margin'),
          productId: updated.id,
          metadata: {
            stage: 'CATALOG_PRICE_UPDATE',
            sku: String(updated.sku || updated.barcode || '').slice(0, 40),
            category: String(updated.category || 'Umum').slice(0, 60),
            unitName: newUnit.unitName,
            conversionFactor: factor,
            oldSellingPrice: oldSell,
            newSellingPrice: newSell,
            oldCostPrice: oldCost,
            newCostPrice: newCost,
            oldMarginRupiah: oldMarginRp,
            newMarginRupiah: newMarginRp,
            oldMarginPercent: oldMarginPct,
            newMarginPercent: newMarginPct,
            marginDeltaPercent: marginDeltaPct,
            priceDeltaPercent: priceDeltaPct,
            changeDirection,
          },
        });
      });

      // Also track per-variant selling price changes if configured
      (updated.variants || []).forEach((newVar) => {
        const oldVar = (prevProd.variants || []).find(
          (v) => v.id === newVar.id || v.name.trim().toLowerCase() === newVar.name.trim().toLowerCase()
        );
        if (!oldVar) return;
        const oldVarSell = Number(oldVar.price ?? prevProd.units?.[0]?.sellingPrice ?? 0);
        const newVarSell = Number(newVar.price ?? updated.units?.[0]?.sellingPrice ?? 0);
        if (oldVarSell === newVarSell) return;

        const priceDelta = newVarSell - oldVarSell;
        const priceDeltaPct = oldVarSell > 0 ? Math.round((priceDelta / oldVarSell) * 1000) / 10 : 0;
        const oldMarginRp = oldVarSell - prevBaseCost;
        const newMarginRp = newVarSell - nextBaseCost;
        const oldMarginPct = oldVarSell > 0 ? Math.round((oldMarginRp / oldVarSell) * 1000) / 10 : 0;
        const newMarginPct = newVarSell > 0 ? Math.round((newMarginRp / newVarSell) * 1000) / 10 : 0;
        const marginDeltaPct = Math.round((newMarginPct - oldMarginPct) * 10) / 10;

        recordActivityLog({
          actionType: 'MANUAL_PRICE_EDIT',
          targetType: 'PRODUCT',
          targetId: updated.id,
          targetLabel: `${updated.name} (Varian: ${newVar.name})`.slice(0, 235),
          summary: `Harga varian "${newVar.name}" berubah ${formatRupiah(oldVarSell)} → ${formatRupiah(newVarSell)} (${priceDelta >= 0 ? '+' : ''}${priceDeltaPct.toFixed(1)}%). Margin ${oldMarginPct.toFixed(1)}% → ${newMarginPct.toFixed(1)}%`.slice(0, 590),
          oldValue: formatRupiah(oldVarSell),
          newValue: formatRupiah(newVarSell),
          deltaValue: `${priceDelta >= 0 ? '+' : ''}${formatRupiah(priceDelta)} · Margin ${marginDeltaPct >= 0 ? '+' : ''}${marginDeltaPct.toFixed(1)}%`,
          numericDelta: priceDelta,
          reason: cleanedReason || `Pembaruan harga varian ${newVar.name}`,
          productId: updated.id,
          metadata: {
            stage: 'CATALOG_PRICE_UPDATE',
            sku: String(updated.sku || updated.barcode || '').slice(0, 40),
            category: String(updated.category || 'Umum').slice(0, 60),
            unitName: `${updated.baseUnit} (${newVar.name})`.slice(0, 40),
            conversionFactor: 1,
            oldSellingPrice: oldVarSell,
            newSellingPrice: newVarSell,
            oldCostPrice: prevBaseCost,
            newCostPrice: nextBaseCost,
            oldMarginRupiah: oldMarginRp,
            newMarginRupiah: newMarginRp,
            oldMarginPercent: oldMarginPct,
            newMarginPercent: newMarginPct,
            marginDeltaPercent: marginDeltaPct,
            priceDeltaPercent: priceDeltaPct,
            changeDirection: priceDelta > 0 ? 'NAIK' : 'TURUN',
          },
        });
      });
    }
  };

  const handleDeleteProduct = (id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    // Remove obsolete notifications for this deleted product
    try {
      const raw = localStorage.getItem('kasir_stock_alert_history');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((a: any) => a.productId !== id);
          localStorage.setItem('kasir_stock_alert_history', JSON.stringify(filtered));
        }
      }
    } catch {}
    deleteDocumentFromFirestore('products', id).catch((err) => {
      console.error('[FirebaseSync] Failed to delete product from Firestore:', err);
    });
  };

  // Helper to ensure categories from imported/added products exist in categories state & Firestore
  const registerMissingCategoriesFromProducts = (
    items: Array<{ category?: string; categoryColor?: string }>,
    description = 'Otomatis ditambahkan dari file impor'
  ) => {
    const existingLower = new Set(
      categories.map((c) => (c.name || '').trim().toLowerCase()).filter(Boolean)
    );
    const seenBatchLower = new Set<string>();
    const newCats: ProductCategory[] = [];
    const ts = Date.now();

    items.forEach((item, idx) => {
      const cleanName = (item.category || '').trim();
      if (!cleanName) return;
      const lower = cleanName.toLowerCase();
      if (existingLower.has(lower) || seenBatchLower.has(lower)) return;
      seenBatchLower.add(lower);

      newCats.push({
        id: `cat_${ts}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        color: item.categoryColor || getCategoryColor(cleanName, categories),
        description,
      });
    });

    if (newCats.length > 0) {
      setCategories((prev) => {
        const prevLower = new Set(prev.map((c) => (c.name || '').trim().toLowerCase()));
        const uniqueNew = newCats.filter((nc) => !prevLower.has(nc.name.trim().toLowerCase()));
        return uniqueNew.length > 0 ? [...prev, ...uniqueNew] : prev;
      });
      saveBatchToFirestore('categories', newCats).catch((err) => {
        console.error('[FirebaseSync] Failed to save imported categories to Firestore:', err);
      });
    }
  };

  // Category Management CRUD
  const handleAddCategory = (data: Omit<ProductCategory, 'id'>): ProductCategory => {
    const cleanName = data.name.trim();
    const existing = categories.find((c) => c.name.trim().toLowerCase() === cleanName.toLowerCase());
    if (existing) return existing;

    const newCat: ProductCategory = {
      ...data,
      name: cleanName,
      id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
    };
    setCategories((prev) => {
      if (prev.some((c) => c.name.trim().toLowerCase() === cleanName.toLowerCase())) return prev;
      return [...prev.filter((c) => c.id !== newCat.id), newCat];
    });
    saveDocumentToFirestore('categories', newCat.id, newCat).catch((err) => {
      console.error('[FirebaseSync] Failed to save category to Firestore:', err);
    });
    return newCat;
  };

  const handleBatchAddCategories = (catList: Omit<ProductCategory, 'id'>[]) => {
    const existingLower = new Set(
      categories.map((c) => (c.name || '').trim().toLowerCase()).filter(Boolean)
    );
    const seenLower = new Set<string>();
    const ts = Date.now();
    const created: ProductCategory[] = [];

    catList.forEach((item, idx) => {
      const cleanName = (item.name || '').trim();
      if (!cleanName) return;
      const lower = cleanName.toLowerCase();
      if (existingLower.has(lower) || seenLower.has(lower)) return;
      seenLower.add(lower);
      created.push({
        ...item,
        name: cleanName,
        color: item.color || getCategoryColor(cleanName, categories),
        id: `cat_${ts}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      });
    });

    if (created.length > 0) {
      setCategories((prev) => {
        const prevLower = new Set(prev.map((c) => (c.name || '').trim().toLowerCase()));
        const unique = created.filter((nc) => !prevLower.has(nc.name.toLowerCase()));
        return unique.length > 0 ? [...prev, ...unique] : prev;
      });
      saveBatchToFirestore('categories', created).catch((err) => {
        console.error('[FirebaseSync] Failed to batch save categories to Firestore:', err);
      });
    }
  };

  const handleUpdateCategory = (updated: ProductCategory) => {
    const oldCat = categories.find((c) => c.id === updated.id);
    setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    saveDocumentToFirestore('categories', updated.id, updated).catch(() => {});

    // If category name or color changed, sync ONLY affected products
    if (oldCat) {
      const oldLower = oldCat.name.trim().toLowerCase();
      const changedProducts: Product[] = [];
      const updatedProducts = products.map((p) => {
        if ((p.category || '').trim().toLowerCase() === oldLower) {
          const nextProd = {
            ...p,
            category: updated.name,
            categoryColor: updated.color,
          };
          changedProducts.push(nextProd);
          return nextProd;
        }
        return p;
      });
      if (changedProducts.length > 0) {
        setProducts(updatedProducts);
        saveBatchToFirestore('products', changedProducts).catch(() => {});
      }
    }
  };

  const handleDeleteCategory = (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    deleteDocumentFromFirestore('categories', categoryId).catch(() => {});
  };

  // Supplier Management CRUD
  const handleAddSupplier = (data: Omit<Supplier, 'id' | 'createdAt'>) => {
    const newSup: Supplier = {
      ...data,
      id: 'sup_' + Date.now(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    setSuppliers([newSup, ...suppliers]);
    saveDocumentToFirestore('suppliers', newSup.id, newSup).catch(() => {});
  };

  const handleUpdateSupplier = (updated: Supplier) => {
    setSuppliers(suppliers.map((s) => (s.id === updated.id ? updated : s)));
    saveDocumentToFirestore('suppliers', updated.id, updated).catch(() => {});
  };

  const handleDeleteSupplier = (id: string) => {
    setSuppliers(suppliers.filter((s) => s.id !== id));
    deleteDocumentFromFirestore('suppliers', id).catch(() => {});
  };

  const handleUpdateStock = (productId: string, newStock: number, reason?: string) => {
    const finalStock = Math.max(0, newStock);
    const existingProd = productMap.get(productId);
    const updatedProducts = products.map((p) =>
      p.id === productId
        ? applyMultiBatchOpnameToProduct(p, { newStock: finalStock })
        : p
    );
    lastBatchCheckSourceRef.current = 'POST_OPNAME';
    setProducts(updatedProducts);
    const targetProd = updatedProducts.find((p) => p.id === productId);
    if (targetProd) {
      saveDocumentToFirestore('products', productId, targetProd).catch(() => {});
      if (existingProd && existingProd.stockInBaseUnit !== finalStock) {
        const diff = finalStock - existingProd.stockInBaseUnit;
        const sign = diff > 0 ? '+' : '';
        recordActivityLog({
          actionType: 'MANUAL_STOCK_ADJUSTMENT',
          targetType: 'PRODUCT',
          targetId: existingProd.id,
          targetLabel: existingProd.name,
          summary: `Penyesuaian stok manual ${existingProd.name} oleh ${currentUser.name} (${currentUser.role})`,
          oldValue: `${formatNumber(existingProd.stockInBaseUnit)} ${existingProd.baseUnit}`,
          newValue: `${formatNumber(finalStock)} ${existingProd.baseUnit}`,
          deltaValue: `${sign}${formatNumber(diff)} ${existingProd.baseUnit}`,
          numericDelta: diff,
          reason: reason || 'Penyesuaian stok manual',
          productId: existingProd.id,
          metadata: {
            opnameEvent: 'MANUAL_ADJUSTMENT',
            responsibleUserId: currentUser.id,
            responsibleUserName: currentUser.name,
            responsibleUserRole: currentUser.role,
          },
        });
      }
    }
  };

  const handleBulkUpdateStock = (
    adjustments: { productId: string; newStock: number }[],
    sessionRecord: StockOpnameRecord
  ) => {
    const adjMap = new Map(adjustments.map((a) => [a.productId, a.newStock]));
    const opnameItemMap = new Map(sessionRecord.items.map((item) => [item.productId, item]));
    const changedProducts: Product[] = [];
    const logsToCreate: EmployeeActivityLog[] = [];
    const baseTs = Date.now();
    const matchedResponsible = users.find(
      (u) => u.name.toLowerCase() === (sessionRecord.auditorName || '').toLowerCase()
    );
    const responsibleId = matchedResponsible?.id || currentUser.id;
    const responsibleName = sessionRecord.auditorName || currentUser.name;
    const responsibleRole = sessionRecord.auditorRole || currentUser.role;

    const updatedProducts = products.map((p) => {
      const newStockVal = adjMap.get(p.id);
      if (newStockVal !== undefined) {
        const opItem = opnameItemMap.get(p.id);
        const nextProd = applyMultiBatchOpnameToProduct(p, {
          newStock: Math.max(0, newStockVal),
          batchDetails: opItem?.batchDetails,
        });
        changedProducts.push(nextProd);

        if (nextProd.stockInBaseUnit !== p.stockInBaseUnit || (opItem?.batchDetails && opItem.batchDetails.some((b) => b.difference !== 0))) {
          const diff = nextProd.stockInBaseUnit - p.stockInBaseUnit;
          const sign = diff > 0 ? '+' : '';
          logsToCreate.push({
            id: `act_${baseTs}_${p.id}_${Math.random().toString(36).slice(2, 6)}`,
            timestamp: baseTs,
            actionType: 'MANUAL_STOCK_ADJUSTMENT',
            actorId: currentUser.id,
            actorName: currentUser.name,
            actorRole: currentUser.role,
            targetType: 'STOCK_OPNAME',
            targetId: p.id,
            targetLabel: `${p.name} (${sessionRecord.sessionNumber})`,
            summary: `Opname${opItem?.batchDetails && opItem.batchDetails.length > 0 ? ' multi-batch' : ''} stok (${sessionRecord.sessionNumber}) untuk ${p.name}`,
            oldValue: `${formatNumber(p.stockInBaseUnit)} ${p.baseUnit}`,
            newValue: `${formatNumber(nextProd.stockInBaseUnit)} ${p.baseUnit}`,
            deltaValue: `${sign}${formatNumber(diff)} ${p.baseUnit}`,
            numericDelta: diff,
            reason: opItem?.reason || sessionRecord.generalReason || 'Sesi Stock Opname',
            productId: p.id,
            metadata: {
              opnameEvent: 'OPNAME_ADJUSTMENT',
              sessionNumber: sessionRecord.sessionNumber,
              auditMode: sessionRecord.auditMode || 'SKU',
              responsibleUserId: responsibleId,
              responsibleUserName: responsibleName,
              responsibleUserRole: responsibleRole,
            },
          });
        }
        return nextProd;
      }
      return p;
    });
    lastBatchCheckSourceRef.current = 'POST_OPNAME';
    setProducts(updatedProducts);
    setStockOpnames((prev) => [sessionRecord, ...prev]);

    if (logsToCreate.length > 0) {
      setActivityLogs((prev) => [...logsToCreate, ...prev]);
      saveBatchToFirestore('activity_logs', logsToCreate).catch(() => {});
    }

    // Sync ONLY adjusted products & audit record to Firestore
    if (changedProducts.length > 0) {
      saveBatchToFirestore('products', changedProducts).catch(() => {});
    }
    saveDocumentToFirestore('stock_opnames', sessionRecord.id, sessionRecord).catch(() => {});
  };

  const handleDeleteStockOpname = (
    record: StockOpnameRecord,
    deletionReason: string,
    responsibleUser: { id: string; name: string; role: UserRole },
    revertStockChanges: boolean
  ) => {
    const cleanReason = deletionReason.trim() || 'Penghapusan riwayat Stock Opname';
    const opItemMap = new Map<string, typeof record.items[number]>();
    if (revertStockChanges && Array.isArray(record.items)) {
      record.items.forEach((item) => {
        if (item.difference !== 0 || (item.batchDetails && item.batchDetails.some((b) => b.difference !== 0))) {
          opItemMap.set(item.productId, item);
        }
      });
    }

    const changedProducts: Product[] = [];
    if (opItemMap.size > 0) {
      const updatedProducts = products.map((prod) => {
        const item = opItemMap.get(prod.id);
        if (!item) return prod;
        const nextProd = revertMultiBatchOpnameFromProduct(prod, item);
        changedProducts.push(nextProd);
        return nextProd;
      });
      lastBatchCheckSourceRef.current = 'POST_OPNAME';
      setProducts(updatedProducts);
      if (changedProducts.length > 0) {
        saveBatchToFirestore('products', changedProducts).catch(() => {});
      }
    }

    setStockOpnames((prev) => prev.filter((so) => so.id !== record.id));
    deleteDocumentFromFirestore('stock_opnames', record.id).catch(() => {});

    recordActivityLog({
      actionType: 'MANUAL_STOCK_ADJUSTMENT',
      targetType: 'STOCK_OPNAME',
      targetId: record.id,
      targetLabel: record.sessionNumber,
      summary: `[Hapus Stock Opname] Sesi ${record.sessionNumber} (${record.totalItemsAudited} SKU, varians ${
        record.totalDifferenceValue >= 0
          ? `+${formatRupiah(record.totalDifferenceValue)}`
          : formatRupiah(record.totalDifferenceValue)
      })${revertStockChanges ? ' — stok dikembalikan ke kondisi sebelum opname' : ''}`,
      oldValue: `${record.totalItemsAudited} SKU (${record.totalDiscrepancies} selisih)`,
      newValue: 'DIHAPUS',
      deltaValue: revertStockChanges
        ? `${changedProducts.length} SKU stok dikembalikan`
        : 'Arsip sesi dihapus',
      numericDelta: -record.totalDiscrepancies,
      reason: cleanReason,
      metadata: {
        opnameEvent: 'DELETE_OPNAME',
        sessionNumber: record.sessionNumber,
        responsibleUserId: responsibleUser.id,
        responsibleUserName: responsibleUser.name,
        responsibleUserRole: responsibleUser.role,
        deletionNote: cleanReason,
        revertStockApplied: revertStockChanges,
        deletedSkusCount: record.totalItemsAudited,
      },
    });
  };

  const handleUpdateStoreSettings = (newSettings: StoreSettings) => {
    const wasOffline = Boolean(storeSettings.manualOfflineMode);
    const isOffline = Boolean(newSettings.manualOfflineMode);
    setCloudSyncError(null);
    setStoreSettings(newSettings);
    saveStorage('kasir_settings', newSettings);
    if (isOffline) {
      setCloudSyncPaused(true);
      pauseFirestoreCloudSync().catch(() => {});
      setCloudSyncStatus('OFFLINE');
    } else if (wasOffline) {
      setCloudSyncStatus('CONNECTING');
      resumeFirestoreCloudSync()
        .then(() => saveStoreSettingsToFirestore(newSettings))
        .catch(() => {});
    } else {
      saveStoreSettingsToFirestore(newSettings).catch(() => {});
    }
  };

  const handleForceVerifyCloudSync = async (): Promise<FirestoreVerificationResult> => {
    const wasOffline = Boolean(storeSettings.manualOfflineMode);
    const shouldReattachListeners = wasOffline || cloudSyncStatus === 'OFFLINE' || Boolean(cloudSyncError);
    const queuedBefore = getOfflineQueueCount();

    // Force Sync Now: automatically exit manual offline mode if active, clear queue status, and verify server immediately
    if (wasOffline) {
      const nextSettings: StoreSettings = { ...storeSettings, manualOfflineMode: false };
      setStoreSettings(nextSettings);
      saveStorage('kasir_settings', nextSettings);
    }

    setCloudSyncError(null);
    setCloudSyncStatus('CONNECTING');
    setIsAutoSyncingOffline(true);
    clearPendingSyncQueueStatus();

    try {
      const result = await forceSyncFirestoreNow();
      const queuedAfter = getOfflineQueueCount();
      const flushedNow = Math.max(0, queuedBefore - queuedAfter);

      if (result.ok) {
        setCloudSyncError(null);
        setCloudSyncStatus('SYNCED');
        if (flushedNow > 0) {
          sound.playSuccessChime();
          setOfflineSyncResultToast(
            `${flushedNow} antrean Mode Offline berhasil disinkronkan ke server.`
          );
        }
        if (wasOffline) {
          saveStoreSettingsToFirestore({ ...storeSettings, manualOfflineMode: false }).catch(() => {});
        } else if (shouldReattachListeners) {
          setSyncRetryNonce((n) => n + 1);
        }
      } else {
        setCloudSyncError(result.message);
        setCloudSyncStatus('OFFLINE');
      }
      return result;
    } finally {
      setIsAutoSyncingOffline(false);
    }
  };

  const handleOpenFirestoreDiagnosticsInSettings = () => {
    setActiveTab('settings');
    setFocusFirestoreSettingsNonce((n) => n + 1);
  };

  const buildLocalCollectionsSnapshotForAudit = () => {
    const snap = latestSyncStateRef.current;
    return {
      products: snap.products as unknown as Array<Record<string, unknown> & { id: string }>,
      purchases: snap.purchases as unknown as Array<Record<string, unknown> & { id: string }>,
      categories: snap.categories as unknown as Array<Record<string, unknown> & { id: string }>,
      customer_categories: snap.customerCategories as unknown as Array<Record<string, unknown> & { id: string }>,
      customers: snap.customers as unknown as Array<Record<string, unknown> & { id: string }>,
      suppliers: snap.suppliers as unknown as Array<Record<string, unknown> & { id: string }>,
      transactions: snap.transactions as unknown as Array<Record<string, unknown> & { id: string }>,
      attendances: snap.attendances as unknown as Array<Record<string, unknown> & { id: string }>,
      stock_opnames: snap.stockOpnames as unknown as Array<Record<string, unknown> & { id: string }>,
      cashflows: snap.cashflows as unknown as Array<Record<string, unknown> & { id: string }>,
      online_orders: snap.onlineOrders as unknown as Array<Record<string, unknown> & { id: string }>,
      activity_logs: snap.activityLogs as unknown as Array<Record<string, unknown> & { id: string }>,
      tax_records: snap.taxRecords as unknown as Array<Record<string, unknown> & { id: string }>,
      tax_audit_logs: snap.taxAuditLogs as unknown as Array<Record<string, unknown> & { id: string }>,
      tax_adjustments: snap.taxAdjustments as unknown as Array<Record<string, unknown> & { id: string }>,
      balance_sheet_entries: snap.balanceSheetEntries as unknown as Array<Record<string, unknown> & { id: string }>,
      users: snap.users as unknown as Array<Record<string, unknown> & { id: string }>,
      settings: snap.storeSettings as unknown as Record<string, unknown>,
    };
  };

  const handleScanSyncHealth = async (options?: { trackBackgroundProgress?: boolean }) => {
    if (isScanningSyncHealth) return;
    setIsScanningSyncHealth(true);
    setSyncHealthScanError(null);
    try {
      const report = await runFirestoreSyncHealthAudit(
        buildLocalCollectionsSnapshotForAudit(),
        offlineQueueJobs,
        options
      );
      setSyncAuditReport(report);
    } catch (err) {
      setSyncHealthScanError(formatFirestoreSyncErrorMessage(err));
    } finally {
      setIsScanningSyncHealth(false);
    }
  };

  const applyServerRecordToLocalState = (
    collectionName: string,
    docId: string,
    serverRecord?: Record<string, unknown>,
    removeIfMissing = false
  ) => {
    const upsertOrRemove = <T extends { id: string }>(
      prev: T[],
      storageKey: string,
      sortFn?: (items: T[]) => T[]
    ): T[] => {
      let next: T[];
      if (removeIfMissing || !serverRecord) {
        next = prev.filter((it) => it.id !== docId);
      } else {
        const merged = { ...(serverRecord as unknown as T), id: docId };
        const exists = prev.some((it) => it.id === docId);
        next = exists
          ? prev.map((it) => (it.id === docId ? merged : it))
          : [merged, ...prev];
      }
      if (sortFn) next = sortFn(next);
      saveStorage(storageKey, next);
      return next;
    };

    switch (collectionName) {
      case 'products':
        lastBatchCheckSourceRef.current = 'CLOUD_SYNC';
        setProducts((prev) => upsertOrRemove(prev, 'kasir_products'));
        break;
      case 'purchases':
        setPurchases((prev) =>
          upsertOrRemove(prev, 'kasir_purchases', (arr) =>
            [...arr].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          )
        );
        break;
      case 'categories':
        setCategories((prev) => upsertOrRemove(prev, 'kasir_categories'));
        break;
      case 'customer_categories':
        setCustomerCategories((prev) => upsertOrRemove(prev, 'kasir_customer_categories'));
        break;
      case 'customers':
        setCustomers((prev) => upsertOrRemove(prev, 'kasir_customers'));
        break;
      case 'suppliers':
        setSuppliers((prev) => upsertOrRemove(prev, 'kasir_suppliers'));
        break;
      case 'transactions':
        setTransactions((prev) =>
          upsertOrRemove(prev, 'kasir_transactions', (arr) =>
            [...arr].sort((a, b) => b.timestamp - a.timestamp)
          )
        );
        break;
      case 'attendances':
        setAttendances((prev) => upsertOrRemove(prev, 'kasir_attendances'));
        break;
      case 'stock_opnames':
        setStockOpnames((prev) => upsertOrRemove(prev, 'kasir_stock_opnames'));
        break;
      case 'cashflows':
        setCashflows((prev) =>
          upsertOrRemove(prev, 'kasir_cashflows', (arr) =>
            [...arr].sort((a, b) => b.timestamp - a.timestamp)
          )
        );
        break;
      case 'online_orders':
        setOnlineOrders((prev) =>
          upsertOrRemove(prev, 'kasir_online_orders', (arr) =>
            [...arr].sort((a, b) => b.createdAt - a.createdAt)
          )
        );
        break;
      case 'activity_logs':
        setActivityLogs((prev) =>
          upsertOrRemove(prev, 'kasir_activity_logs', (arr) =>
            [...arr].sort((a, b) => b.timestamp - a.timestamp)
          )
        );
        break;
      case 'tax_records':
        setTaxRecords((prev) => upsertOrRemove(prev, 'kasir_tax_records'));
        break;
      case 'tax_audit_logs':
        setTaxAuditLogs((prev) => upsertOrRemove(prev, 'kasir_tax_audit_logs'));
        break;
      case 'tax_adjustments':
        setTaxAdjustments((prev) => upsertOrRemove(prev, 'kasir_tax_adjustments'));
        break;
      case 'balance_sheet_entries':
        setBalanceSheetEntries((prev) => upsertOrRemove(prev, 'kasir_balance_sheet_entries'));
        break;
      case 'users':
        setUsers((prev) => upsertOrRemove(prev, 'kasir_users'));
        break;
      case 'settings':
        if (serverRecord) {
          const { id: _id, ...rest } = serverRecord;
          setStoreSettings((prev) => {
            const next = { ...prev, ...(rest as Partial<StoreSettings>) };
            saveStorage('kasir_settings', next);
            return next;
          });
        }
        break;
    }
  };

  const executeSingleConflictResolution = async (
    conflict: SyncConflictItem,
    action: SyncRecommendedAction
  ) => {
    if (action === 'PUSH_LOCAL') {
      if (conflict.conflictType === 'BOOTSTRAP_MISSING') {
        const snap = latestSyncStateRef.current;
        if (conflict.collectionName === 'settings') {
          await saveStoreSettingsToFirestore(snap.storeSettings);
        } else if (conflict.collectionName === 'users') {
          await saveBatchToFirestore('users', snap.users);
        }
      } else if (conflict.collectionName === 'settings') {
        await saveStoreSettingsToFirestore(
          conflict.localRecord || (latestSyncStateRef.current.storeSettings as unknown as Record<string, unknown>)
        );
      } else if (conflict.localRecord) {
        await saveDocumentToFirestore(conflict.collectionName, conflict.docId, conflict.localRecord);
      }
      recordModuleSyncActivity({
        collectionName: conflict.collectionName,
        direction: 'CONFLICT_FIX',
        operation: 'RECONCILE',
        status: 'SUCCESS',
        recordCount: 1,
        docId: conflict.docId,
        summary: `Konflik diselesaikan dengan mengirim data lokal: ${conflict.recordTitle}`,
      });
    } else if (action === 'PULL_SERVER') {
      const shouldRemoveLocal = conflict.conflictType === 'LOCAL_ONLY' && !conflict.serverRecord;
      applyServerRecordToLocalState(
        conflict.collectionName,
        conflict.docId,
        conflict.serverRecord,
        shouldRemoveLocal
      );
      recordModuleSyncActivity({
        collectionName: conflict.collectionName,
        direction: 'CONFLICT_FIX',
        operation: 'RECONCILE',
        status: 'SUCCESS',
        recordCount: 1,
        docId: conflict.docId,
        summary: shouldRemoveLocal
          ? `Konflik diselesaikan dengan menghapus data lokal usang: ${conflict.recordTitle}`
          : `Konflik diselesaikan dengan menarik data server: ${conflict.recordTitle}`,
      });
    } else if (action === 'RETRY_QUEUE' && conflict.offlineJob) {
      const retryRes = await executeSingleOfflineSyncJobNow(conflict.offlineJob);
      if (retryRes.ok) {
        removeOfflineSyncJob(conflict.offlineJob.id);
      } else {
        throw new Error(retryRes.error || 'Gagal mengirim ulang antrean.');
      }
    } else if (action === 'DISMISS_QUEUE_JOB' && conflict.offlineJob) {
      removeOfflineSyncJob(conflict.offlineJob.id);
      recordModuleSyncActivity({
        collectionName: conflict.collectionName,
        direction: 'CONFLICT_FIX',
        operation: 'RECONCILE',
        status: 'WARNING',
        recordCount: 1,
        docId: conflict.docId,
        summary: `Antrean bermasalah dibersihkan oleh pengguna: ${conflict.recordTitle}`,
      });
    }
  };

  const handleResolveSyncConflict = async (
    conflict: SyncConflictItem,
    action: SyncRecommendedAction
  ) => {
    setResolvingConflictId(conflict.id);
    setSyncHealthScanError(null);
    try {
      await executeSingleConflictResolution(conflict, action);
      sound.playSuccessChime();
      await handleScanSyncHealth({ trackBackgroundProgress: false });
    } catch (err) {
      setSyncHealthScanError(
        err instanceof Error ? err.message : 'Gagal menerapkan resolusi konflik.'
      );
    } finally {
      setResolvingConflictId(null);
    }
  };

  const handleResolveAllSyncConflicts = async () => {
    if (!syncAuditReport || syncAuditReport.conflicts.length === 0) return;
    setIsResolvingBulkSyncConflicts(true);
    setSyncHealthScanError(null);
    try {
      for (const conflict of syncAuditReport.conflicts) {
        try {
          await executeSingleConflictResolution(conflict, conflict.recommendedAction);
        } catch {
          // continue resolving remaining conflicts cleanly
        }
      }
      sound.playSuccessChime();
      await handleScanSyncHealth({ trackBackgroundProgress: true });
    } finally {
      setIsResolvingBulkSyncConflicts(false);
    }
  };

  // Automatic lightweight Sync Health Audit when opening sync-health tab or once on initial real-time connection
  useEffect(() => {
    if (
      cloudSyncStatus === 'SYNCED' &&
      isBrowserOnline &&
      !storeSettings.manualOfflineMode &&
      !hasAutoAuditedSyncRef.current
    ) {
      hasAutoAuditedSyncRef.current = true;
      const t = window.setTimeout(() => {
        void handleScanSyncHealth({ trackBackgroundProgress: false });
      }, 2500);
      return () => window.clearTimeout(t);
    }
  }, [cloudSyncStatus, isBrowserOnline, storeSettings.manualOfflineMode]);

  useEffect(() => {
    if (activeTab === 'sync-health' && !isScanningSyncHealth) {
      void handleScanSyncHealth({ trackBackgroundProgress: false });
    }
  }, [activeTab]);

  const handleUpdateUsers = (newUsers: User[]) => {
    setUsers(newUsers);
    saveBatchToFirestore('users', newUsers).catch(() => {});
  };

  // Cashflow Management Handlers (Pemasukan & Pengeluaran)
  const handleAddCashflow = async (recordData: Omit<CashflowRecord, 'id' | 'createdAt'>) => {
    const newRecord: CashflowRecord = {
      ...recordData,
      id: 'cf_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      createdAt: new Date().toISOString(),
    };
    setCashflows((prev) => [newRecord, ...prev]);
    saveDocumentToFirestore('cashflows', newRecord.id, newRecord).catch((err) => {
      console.error('[FirebaseSync] Failed to save cashflow to Firestore:', err);
    });
  };

  const handleUpdateCashflow = async (record: CashflowRecord) => {
    setCashflows((prev) => prev.map((c) => (c.id === record.id ? record : c)));
    saveDocumentToFirestore('cashflows', record.id, record).catch((err) => {
      console.error('[FirebaseSync] Failed to update cashflow in Firestore:', err);
    });
  };

  const handleDeleteCashflow = async (id: string) => {
    setCashflows((prev) => prev.filter((c) => c.id !== id));
    deleteDocumentFromFirestore('cashflows', id).catch((err) => {
      console.error('[FirebaseSync] Failed to delete cashflow from Firestore:', err);
    });
  };

  // Tax Management Handlers (Konfigurasi Pajak, Audit Log Khusus, Adjustment Pajak & Setoran)
  const handleRecordTaxAuditLog = async (entry: {
    category: TaxAuditCategory;
    actionLabel: string;
    summary: string;
    changes?: TaxAuditChangeItem[];
    reason?: string;
    periodMonth?: string;
  }) => {
    const nowMs = Date.now();
    const auditLog: TaxAuditLog = {
      id: `txaud_${nowMs}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowMs,
      createdAt: new Date(nowMs).toISOString(),
      category: entry.category,
      actionLabel: entry.actionLabel,
      actorId: currentUser.id,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      summary: entry.summary,
      changes: (entry.changes || []).slice(0, 50),
      ...(entry.reason && entry.reason.trim() ? { reason: entry.reason.trim() } : {}),
      ...(entry.periodMonth && /^\d{4}-\d{2}$/.test(entry.periodMonth)
        ? { periodMonth: entry.periodMonth }
        : {}),
    };

    setTaxAuditLogs((prev) => [auditLog, ...prev]);
    await saveDocumentToFirestore('tax_audit_logs', auditLog.id, auditLog).catch((err) => {
      console.error('[FirebaseSync] Failed to save tax audit log to Firestore:', err);
    });
  };

  const handleUpdateTaxConfig = async (nextConfig: TaxConfig, auditReason?: string) => {
    const prevEffective = getEffectiveTaxConfig(storeSettings);
    const nextEffective = getEffectiveTaxConfig(nextConfig, storeSettings.storeName);
    const diff = diffTaxConfigs(prevEffective, nextEffective);

    const nextSettings: StoreSettings = {
      ...storeSettings,
      taxConfig: nextConfig,
    };
    handleUpdateStoreSettings(nextSettings);

    if (diff.changes.length > 0 || (auditReason && auditReason.trim())) {
      await handleRecordTaxAuditLog({
        category: diff.isRateOverride ? 'RATE_OVERRIDE' : 'CONFIG_CHANGE',
        actionLabel: diff.isRateOverride
          ? 'Perubahan / Override Tarif Pajak'
          : 'Pembaruan Konfigurasi Pajak',
        summary: diff.summary,
        changes: diff.changes,
        reason: auditReason,
      });
    }
  };

  const handleSaveTaxRecord = async (record: TaxRecord, alsoRecordCashflow: boolean) => {
    let finalRecord: TaxRecord = { ...record };
    const existingRecord = taxRecords.find((r) => r.id === finalRecord.id);

    if (
      alsoRecordCashflow &&
      finalRecord.status === 'SUDAH_SETOR' &&
      !finalRecord.linkedCashflowId
    ) {
      const cashflowAmount = finalRecord.paidAmount > 0 ? finalRecord.paidAmount : finalRecord.taxAmountDue;
      const cashflowDate = finalRecord.paidDate || new Date().toISOString().slice(0, 10);
      const cashflowTimestamp = new Date(`${cashflowDate}T12:00:00`).getTime() || Date.now();
      const cfId = 'cf_tax_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      const newCashflow: CashflowRecord = {
        id: cfId,
        type: 'PENGELUARAN',
        category: 'Pajak, Iuran & Retribusi',
        amount: cashflowAmount,
        date: cashflowDate,
        timestamp: cashflowTimestamp,
        paymentMethod: finalRecord.paymentMethod || 'TRANSFER_BCA',
        description: `${finalRecord.taxTypeLabel} (${finalRecord.periodMonth})${finalRecord.ntpnCode ? ` · NTPN ${finalRecord.ntpnCode}` : ''}`,
        referenceNumber: finalRecord.ntpnCode || finalRecord.billingCode || undefined,
        recordedBy: currentUser.name,
        recordedById: currentUser.id,
        createdAt: new Date().toISOString(),
      };
      setCashflows((prev) => [newCashflow, ...prev]);
      saveDocumentToFirestore('cashflows', newCashflow.id, newCashflow).catch((err) => {
        console.error('[FirebaseSync] Failed to save tax cashflow to Firestore:', err);
      });
      finalRecord = {
        ...finalRecord,
        linkedCashflowId: cfId,
      };
    }

    setTaxRecords((prev) => {
      const exists = prev.some((r) => r.id === finalRecord.id);
      const updated = exists
        ? prev.map((r) => (r.id === finalRecord.id ? finalRecord : r))
        : [finalRecord, ...prev];
      return updated.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    });

    await saveDocumentToFirestore('tax_records', finalRecord.id, finalRecord).catch((err) => {
      console.error('[FirebaseSync] Failed to save tax record to Firestore:', err);
    });

    // Detect manual rate override against configured tax rate
    const effCfg = getEffectiveTaxConfig(storeSettings);
    const configuredRate =
      finalRecord.taxType === 'PPH_FINAL_UMKM'
        ? Number(effCfg.pphFinalRatePercent ?? 0.5)
        : finalRecord.taxType === 'PPN'
        ? Number(effCfg.ppnRatePercent ?? 11)
        : finalRecord.taxType === 'PB1'
        ? Number(effCfg.pb1RatePercent ?? 10)
        : finalRecord.taxType === 'PPH_BADAN'
        ? Number(effCfg.pphBadanRatePercent ?? 22)
        : null;
    const hasManualRateOverride =
      configuredRate !== null &&
      Math.abs(Number(finalRecord.taxRatePercent || 0) - configuredRate) > 0.0001;

    await handleRecordTaxAuditLog({
      category: hasManualRateOverride ? 'RATE_OVERRIDE' : 'RECORD_MUTATION',
      actionLabel: existingRecord
        ? hasManualRateOverride
          ? 'Edit Setoran & Override Tarif Manual'
          : 'Edit Catatan Setoran Pajak'
        : hasManualRateOverride
        ? 'Input Setoran Dengan Override Tarif Manual'
        : 'Pencatatan Setoran / Tagihan Pajak',
      summary: `${finalRecord.taxTypeLabel} masa ${finalRecord.periodMonth}: Terutang ${formatRupiah(
        finalRecord.taxAmountDue
      )}, Disetor ${formatRupiah(finalRecord.paidAmount)} (${finalRecord.status})`,
      changes: [
        ...(hasManualRateOverride
          ? [
              {
                field: 'taxRatePercent',
                label: 'Tarif Pajak Digunakan',
                oldValue: `${configuredRate}% (Tarif Profil)`,
                newValue: `${finalRecord.taxRatePercent}% (Override Manual)`,
              },
            ]
          : []),
        ...(existingRecord
          ? [
              {
                field: 'status',
                label: 'Status Setoran',
                oldValue: existingRecord.status,
                newValue: finalRecord.status,
              },
              {
                field: 'taxAmountDue',
                label: 'Nominal Terutang',
                oldValue: formatRupiah(existingRecord.taxAmountDue),
                newValue: formatRupiah(finalRecord.taxAmountDue),
              },
            ]
          : [
              {
                field: 'taxAmountDue',
                label: 'Nominal Terutang',
                oldValue: 'Baru',
                newValue: formatRupiah(finalRecord.taxAmountDue),
              },
            ]),
      ],
      reason: finalRecord.notes,
      periodMonth: finalRecord.periodMonth,
    });
  };

  const handleDeleteTaxRecord = async (id: string) => {
    const target = taxRecords.find((r) => r.id === id);
    setTaxRecords((prev) => prev.filter((r) => r.id !== id));
    await deleteDocumentFromFirestore('tax_records', id).catch((err) => {
      console.error('[FirebaseSync] Failed to delete tax record from Firestore:', err);
    });
    if (target) {
      await handleRecordTaxAuditLog({
        category: 'RECORD_MUTATION',
        actionLabel: 'Hapus Catatan Setoran Pajak',
        summary: `Menghapus catatan ${target.taxTypeLabel} masa ${target.periodMonth} senilai ${formatRupiah(
          target.taxAmountDue
        )}`,
        changes: [
          {
            field: 'taxRecord',
            label: target.taxTypeLabel,
            oldValue: formatRupiah(target.taxAmountDue),
            newValue: 'Dihapus',
          },
        ],
        periodMonth: target.periodMonth,
      });
    }
  };

  const handleSaveTaxAdjustment = async (
    adjustment: TaxAdjustment,
    isEdit = false,
    auditReason?: string
  ) => {
    const prevAdj = taxAdjustments.find((a) => a.id === adjustment.id);
    setTaxAdjustments((prev) => {
      const exists = prev.some((a) => a.id === adjustment.id);
      const updated = exists
        ? prev.map((a) => (a.id === adjustment.id ? adjustment : a))
        : [adjustment, ...prev];
      return updated.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    });

    await saveDocumentToFirestore('tax_adjustments', adjustment.id, adjustment).catch((err) => {
      console.error('[FirebaseSync] Failed to save tax adjustment to Firestore:', err);
    });

    await handleRecordTaxAuditLog({
      category: 'ADJUSTMENT',
      actionLabel: isEdit
        ? adjustment.status === 'VOIDED' && prevAdj?.status === 'ACTIVE'
          ? `Void Adjustment ${adjustment.adjustmentNumber}`
          : `Edit Adjustment ${adjustment.adjustmentNumber}`
        : `Adjustment Pajak Baru (${adjustment.adjustmentNumber})`,
      summary: `${TAX_ADJUSTMENT_REASON_LABELS[adjustment.reasonType]} pada ${
        TAX_ADJUSTMENT_TARGET_LABELS[adjustment.affectedTaxType]
      } (Delta Pajak: ${adjustment.taxDelta >= 0 ? '+' : '-'}${formatRupiah(
        Math.abs(adjustment.taxDelta)
      )}, Delta DPP: ${adjustment.dppDelta >= 0 ? '+' : '-'}${formatRupiah(
        Math.abs(adjustment.dppDelta)
      )})`,
      changes: prevAdj
        ? [
            {
              field: 'status',
              label: 'Status Adjustment',
              oldValue: prevAdj.status,
              newValue: adjustment.status,
            },
            {
              field: 'taxDelta',
              label: 'Koreksi Pajak',
              oldValue: formatRupiah(prevAdj.taxDelta),
              newValue: formatRupiah(adjustment.taxDelta),
            },
          ]
        : [
            {
              field: 'taxDelta',
              label: TAX_ADJUSTMENT_TARGET_LABELS[adjustment.affectedTaxType],
              oldValue: 'Rp 0',
              newValue: `${adjustment.taxDelta >= 0 ? '+' : '-'}${formatRupiah(
                Math.abs(adjustment.taxDelta)
              )}`,
            },
          ],
      reason: auditReason || adjustment.notes,
      periodMonth: adjustment.periodMonth,
    });
  };

  const handleDeleteTaxAdjustment = async (adjustment: TaxAdjustment, auditReason?: string) => {
    setTaxAdjustments((prev) => prev.filter((a) => a.id !== adjustment.id));
    await deleteDocumentFromFirestore('tax_adjustments', adjustment.id).catch((err) => {
      console.error('[FirebaseSync] Failed to delete tax adjustment from Firestore:', err);
    });

    await handleRecordTaxAuditLog({
      category: 'ADJUSTMENT',
      actionLabel: `Hapus Adjustment ${adjustment.adjustmentNumber}`,
      summary: `Menghapus adjustment ${adjustment.adjustmentNumber} (${
        TAX_ADJUSTMENT_TARGET_LABELS[adjustment.affectedTaxType]
      }) masa ${adjustment.periodMonth}`,
      changes: [
        {
          field: 'taxAdjustment',
          label: adjustment.adjustmentNumber,
          oldValue: `${adjustment.taxDelta >= 0 ? '+' : '-'}${formatRupiah(
            Math.abs(adjustment.taxDelta)
          )}`,
          newValue: 'Dihapus Permanen',
        },
      ],
      reason: auditReason || adjustment.notes,
      periodMonth: adjustment.periodMonth,
    });
  };

  // Balance Sheet (Neraca Aktiva & Pasiva) Manual Account Handlers
  const handleSaveBalanceSheetEntry = async (entry: BalanceSheetEntry) => {
    setBalanceSheetEntries((prev) => {
      const exists = prev.some((item) => item.id === entry.id);
      const updated = exists
        ? prev.map((item) => (item.id === entry.id ? entry : item))
        : [entry, ...prev];
      return updated.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    });

    await saveDocumentToFirestore('balance_sheet_entries', entry.id, entry).catch((err) => {
      console.error('[FirebaseSync] Failed to save balance sheet entry to Firestore:', err);
    });
  };

  const handleDeleteBalanceSheetEntry = async (entry: BalanceSheetEntry) => {
    setBalanceSheetEntries((prev) => prev.filter((item) => item.id !== entry.id));
    await deleteDocumentFromFirestore('balance_sheet_entries', entry.id).catch((err) => {
      console.error('[FirebaseSync] Failed to delete balance sheet entry from Firestore:', err);
    });
  };

  // Mass Reconciliation for FIFO Transactions (sync only modified transactions)
  const handleReconcileTransactions = async (reconciledTxs: Transaction[]) => {
    const prevMap = new Map(transactions.map((t) => [t.id, t]));
    const changedTxs = reconciledTxs.filter((tx) => prevMap.get(tx.id) !== tx);
    setTransactions(reconciledTxs);
    try {
      if (changedTxs.length > 0) {
        await saveBatchToFirestore('transactions', changedTxs);
      }
    } catch (err) {
      console.error('[FirebaseSync] Failed to batch save reconciled transactions:', err);
    }
  };

  // Online Storefront Orders Handlers & FIFO POS Conversion
  const handleSubmitOnlineOrder = async (newOrder: OnlineOrder) => {
    setOnlineOrders((prev) => [newOrder, ...prev.filter((o) => o.id !== newOrder.id)]);
    await saveDocumentToFirestore('online_orders', newOrder.id, newOrder);
  };

  const handleUpdateOnlineOrderStatus = async (
    orderId: string,
    status: OnlineOrderStatus,
    cancelReason?: string
  ) => {
    let updatedOrder: OnlineOrder | null = null;
    setOnlineOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          updatedOrder = {
            ...o,
            status,
            updatedAt: Date.now(),
            processedByName: currentUser.name,
            ...(cancelReason ? { cancelReason } : {}),
          };
          return updatedOrder;
        }
        return o;
      })
    );
    if (updatedOrder) {
      await saveDocumentToFirestore('online_orders', orderId, updatedOrder).catch(() => {});
    }
  };

  const handleFinalizeOnlineOrderToPOS = (order: OnlineOrder) => {
    if (order.linkedTransactionId) {
      const existingTx = transactions.find((t) => t.id === order.linkedTransactionId);
      if (existingTx) {
        setLastCompletedTransaction(existingTx);
        setIsReceiptModalOpen(true);
        return;
      }
    }

    const invoiceNum = generateInvoiceNumber();

    // Group order items by productId for FIFO stock deduction
    const neededByProductId = new Map<string, number>();
    order.items.forEach((oi) => {
      if (oi.isService) return;
      const baseUnits = oi.quantity * (oi.conversionFactor || 1);
      neededByProductId.set(oi.productId, (neededByProductId.get(oi.productId) || 0) + baseUnits);
    });

    const itemDeductionsMap = new Map<string, { costPrice: number; batchDeductions: BatchDeduction[] }>();
    const changedProducts: Product[] = [];

    const updatedProducts = products.map((prod) => {
      if (prod.productType === 'JASA') return prod;
      const totalBaseUnitsNeeded = neededByProductId.get(prod.id) || 0;
      if (totalBaseUnitsNeeded <= 0) return prod;

      let batches: ProductBatch[] =
        Array.isArray(prod.batches) && prod.batches.length > 0
          ? prod.batches.map((b) => ({ ...b }))
          : [];

      if (batches.length === 0 && prod.stockInBaseUnit > 0) {
        batches.push({
          id: `batch_init_${prod.id}`,
          batchNumber: 'BATCH-AWAL',
          receivedAt: Date.now() - 30 * 86400000,
          receivedDate: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
          expiryDate: prod.expiryDate,
          initialQuantity: prod.stockInBaseUnit,
          remainingQuantity: prod.stockInBaseUnit,
          costPrice: prod.costPrice || 0,
          supplierName: 'Stok Toko',
        });
      }

      batches.sort((a, b) => {
        if (a.expiryDate && b.expiryDate) {
          const expDiff = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
          if (expDiff !== 0) return expDiff;
        } else if (a.expiryDate && !b.expiryDate) {
          return -1;
        } else if (!a.expiryDate && b.expiryDate) {
          return 1;
        }
        return (a.receivedAt || 0) - (b.receivedAt || 0);
      });

      let unitsToDeduct = totalBaseUnitsNeeded;
      const deductedBatches: BatchDeduction[] = [];
      let totalCostIncurred = 0;
      let totalUnitsCalculated = 0;

      for (const batch of batches) {
        if (unitsToDeduct <= 0) break;
        if (batch.remainingQuantity <= 0) continue;

        const take = Math.min(batch.remainingQuantity, unitsToDeduct);
        batch.remainingQuantity -= take;
        unitsToDeduct -= take;

        const effectiveCost = batch.costPrice !== undefined ? batch.costPrice : prod.costPrice || 0;
        totalCostIncurred += take * effectiveCost;
        totalUnitsCalculated += take;

        deductedBatches.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: take,
          costPrice: effectiveCost,
          expiryDate: batch.expiryDate,
        });
      }

      if (unitsToDeduct > 0) {
        const fallbackCost = prod.costPrice || 0;
        totalCostIncurred += unitsToDeduct * fallbackCost;
        totalUnitsCalculated += unitsToDeduct;
        deductedBatches.push({
          batchId: 'batch_deficit',
          batchNumber: 'DEFISIT-STOK',
          quantity: unitsToDeduct,
          costPrice: fallbackCost,
        });
      }

      const weightedHppPerBaseUnit =
        totalUnitsCalculated > 0 ? Math.round(totalCostIncurred / totalUnitsCalculated) : prod.costPrice || 0;

      itemDeductionsMap.set(prod.id, {
        costPrice: weightedHppPerBaseUnit,
        batchDeductions: deductedBatches,
      });

      const nextProd: Product = {
        ...prod,
        stockInBaseUnit: Math.max(0, prod.stockInBaseUnit - totalBaseUnitsNeeded),
        batches,
      };
      changedProducts.push(nextProd);
      return nextProd;
    });

    setProducts(updatedProducts);

    // Match customer by membershipId or normalized WhatsApp
    const cleanOrderWa = order.customerWhatsapp.replace(/\D/g, '').slice(-9);
    const matchedCustomer =
      customers.find((c) => {
        if (order.membershipId && getCustomerMembershipId(c).toUpperCase() === order.membershipId.toUpperCase()) {
          return true;
        }
        const custWa = (c.whatsapp || c.phone || '').replace(/\D/g, '').slice(-9);
        return cleanOrderWa.length >= 8 && custWa === cleanOrderWa;
      }) || null;

    const earnedPoints = matchedCustomer
      ? calculatePointsEarned(order.totalAmount, storeSettings, matchedCustomer)
      : 0;

    if (matchedCustomer && earnedPoints > 0) {
      const updatedCustomer: Customer = {
        ...matchedCustomer,
        totalPoints: (matchedCustomer.totalPoints || 0) + earnedPoints,
      };
      setCustomers((prev) => prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c)));
      saveDocumentToFirestore('customers', updatedCustomer.id, updatedCustomer).catch(() => {});
    }

    const txItems = order.items.map((item) => {
      const prod = productMap.get(item.productId);
      const fifoData = itemDeductionsMap.get(item.productId);
      const effectiveHpp = fifoData ? fifoData.costPrice : item.isService ? 0 : prod?.costPrice || 0;
      return {
        productId: item.productId,
        productName: item.productName,
        unitName: item.unitName,
        conversionFactor: item.conversionFactor || 1,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        costPrice: effectiveHpp,
        totalAmount: item.totalAmount,
        selectedVariant: item.selectedVariant,
        isService: item.isService,
        batchDeductions: fifoData?.batchDeductions || [],
      };
    });

    if (order.deliveryFee > 0) {
      txItems.push({
        productId: `online_delivery_${order.id}`,
        productName: 'Ongkos Kirim Kurir Toko (Order Online)',
        unitName: 'LAYANAN',
        conversionFactor: 1,
        quantity: 1,
        unitPrice: order.deliveryFee,
        costPrice: 0,
        totalAmount: order.deliveryFee,
        selectedVariant: undefined,
        isService: true,
        batchDeductions: [],
      });
    }

    const mappedPaymentMethod: PaymentMethod =
      order.paymentMethodType === 'QRIS'
        ? 'QRIS_BCA'
        : order.paymentMethodType === 'BANK_TRANSFER'
        ? 'TRANSFER_BCA'
        : 'CASH';

    const newTransaction: Transaction = {
      id: 'tx_' + Date.now(),
      invoiceNumber: invoiceNum,
      timestamp: Date.now(),
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      customerId: matchedCustomer?.id,
      customerName: matchedCustomer?.name || order.customerName,
      customerWhatsapp: matchedCustomer?.whatsapp || order.customerWhatsapp,
      customerTier: matchedCustomer?.membershipTier || 'REGULER',
      customerCategory: matchedCustomer?.customerCategory || 'UMUM',
      subtotal: order.totalAmount,
      discount: order.discount || 0,
      pointsUsed: 0,
      pointsDiscountAmount: 0,
      pointsEarned: earnedPoints,
      finalAmount: order.totalAmount,
      paymentMethod: mappedPaymentMethod,
      paymentStatus: 'LUNAS',
      cashPaid: order.totalAmount,
      cashChange: 0,
      notes: `Order Online ${order.orderCode} (${order.fulfillmentType === 'AMBIL_DI_TOKO' ? 'Ambil di Toko' : 'Kirim Kurir'})${order.customerNote ? ' - ' + order.customerNote : ''}`,
      items: txItems,
    };

    const nextTransactions = [newTransaction, ...transactions];
    setTransactions(nextTransactions);
    saveStorage('kasir_products', updatedProducts);
    saveStorage('kasir_transactions', nextTransactions);
    saveDocumentToFirestore('transactions', newTransaction.id, newTransaction).catch(() => {});
    if (changedProducts.length > 0) {
      saveBatchToFirestore('products', changedProducts).catch(() => {});
    }

    const completedOrder: OnlineOrder = {
      ...order,
      status: 'SELESAI',
      updatedAt: Date.now(),
      linkedTransactionId: newTransaction.id,
      linkedInvoiceNumber: newTransaction.invoiceNumber,
      processedByName: currentUser.name,
    };
    const nextOnlineOrders = onlineOrders.map((o) => (o.id === order.id ? completedOrder : o));
    setOnlineOrders(nextOnlineOrders);
    saveStorage('kasir_online_orders', nextOnlineOrders);
    saveDocumentToFirestore('online_orders', order.id, completedOrder).catch(() => {});

    setShouldAutoSendWaOnReceipt(false);
    setShouldAutoPrintOnReceipt(false);
    setLastCompletedTransaction(newTransaction);
    setIsReceiptModalOpen(true);
  };

  const pendingOnlineOrdersCount = useMemo(
    () =>
      onlineOrders.filter(
        (o) =>
          o.status === 'MENUNGGU_KONFIRMASI' ||
          o.status === 'DIPROSES' ||
          o.status === 'SIAP_DIAMBIL' ||
          o.status === 'DIKIRIM'
      ).length,
    [onlineOrders]
  );

  const lowStockCount = useMemo(
    () =>
      products.filter(
        (p) => (p.productType || 'BARANG') !== 'JASA' && p.stockInBaseUnit <= p.minStockAlert
      ).length,
    [products]
  );
  const activeShiftCount = useMemo(
    () => attendances.filter((a) => a.status === 'PRESENT').length,
    [attendances]
  );
  const isCurrentUserClockedIn = useMemo(
    () => attendances.some((a) => a.userId === currentUser.id && a.status === 'PRESENT'),
    [attendances, currentUser.id]
  );
  const cartItemCount = useMemo(
    () => cart.reduce((a, b) => a + b.quantity, 0),
    [cart]
  );

  // Render dedicated Customer Online Storefront Web Page when accessed in storefront mode
  if (isStorefrontMode) {
    return (
      <OnlineStorefrontPage
        products={products}
        categories={categories}
        storeSettings={storeSettings}
        onlineOrders={onlineOrders}
        onSubmitOnlineOrder={handleSubmitOnlineOrder}
        onReturnToPOS={exitStorefrontMode}
        initialSection={storefrontTrackCode ? 'tracking' : 'catalog'}
        initialOrderCode={storefrontTrackCode}
      />
    );
  }

  return (
    <div className={`${activeTab === 'pos' ? 'h-dvh overflow-hidden' : 'min-h-screen'} bg-slate-100 flex flex-col font-sans select-none antialiased`}>
      {/* Top Tablet POS Bar */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSwitchUser={() => setIsSwitchUserModalOpen(true)}
        onOpenShiftSummary={() => setIsShiftSummaryModalOpen(true)}
        storeSettings={storeSettings}
        cartItemCount={cartItemCount}
        lowStockCount={lowStockCount}
        pendingOnlineOrdersCount={pendingOnlineOrdersCount}
        activeShiftCount={activeShiftCount}
        isCurrentUserClockedIn={isCurrentUserClockedIn}
        products={products}
        transactions={transactions}
        customers={customers}
        cloudSyncStatus={cloudSyncStatus === 'SYNCED' ? 'SYNCED' : cloudSyncStatus === 'CONNECTING' ? 'CONNECTING' : 'OFFLINE'}
        cloudSyncError={cloudSyncError}
        pendingSyncQueueCount={pendingSyncQueueCount}
        offlineQueueCount={offlineQueueJobs.length}
        syncConflictCount={syncAuditReport?.totalConflicts || 0}
        onRetryCloudSync={() => setSyncRetryNonce((n) => n + 1)}
        onOpenFirestoreSettings={handleOpenFirestoreDiagnosticsInSettings}
        onOpenOfflineQueue={() => setIsOfflineQueueModalOpen(true)}
        onOpenGoogleDriveBackup={() => setIsGoogleDriveBackupModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'pos' ? 'min-h-0' : ''}`}>
        {batchIntegrityReport.criticalIssuesCount > 0 && dismissedBatchAlertSig !== batchIntegrityIssueSig && (
          <div
            role="alert"
            className="px-3 md:px-5 py-2.5 border-b border-rose-300 bg-rose-50 text-rose-950 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0 select-none"
          >
            <div className="flex items-start sm:items-center gap-2 min-w-0">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
              <div className="min-w-0">
                <span className="font-bold">
                  Pengecekan Integritas Batch Otomatis: ditemukan {batchIntegrityReport.criticalIssuesCount} produk bermasalah
                </span>
                <span className="text-rose-800 ml-1.5">
                  (
                  {[
                    batchIntegrityReport.negativeBatchProductsCount > 0
                      ? `${batchIntegrityReport.negativeBatchProductsCount} SKU batch negatif`
                      : null,
                    batchIntegrityReport.negativeTotalStockCount > 0
                      ? `${batchIntegrityReport.negativeTotalStockCount} SKU stok negatif`
                      : null,
                    batchIntegrityReport.mismatchProductsCount > 0
                      ? `${batchIntegrityReport.mismatchProductsCount} SKU selisih stok vs batch`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  )
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setActiveTab('stock-report');
                  setOpenVerifyStockNonce((n) => n + 1);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-rose-100 border border-rose-300 text-rose-800 font-bold text-[11px] whitespace-nowrap cursor-pointer transition-colors"
              >
                Periksa Laporan
              </button>
              {(currentUser.role === 'ADMIN' || currentUser.role === 'STORE_MANAGER') && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    handleAutoFixAllBatchIntegrity();
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] whitespace-nowrap cursor-pointer transition-colors"
                >
                  Perbaiki Otomatis
                </button>
              )}
              <button
                type="button"
                onClick={() => setDismissedBatchAlertSig(batchIntegrityIssueSig)}
                className="p-1 rounded-lg hover:bg-rose-200/70 text-rose-600 cursor-pointer"
                aria-label="Tutup peringatan integritas batch"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
        <BackgroundSyncProgressIndicator
          isBrowserOnline={isBrowserOnline}
          isManualOfflineMode={Boolean(storeSettings.manualOfflineMode)}
          cloudSyncStatus={cloudSyncStatus}
          isAutoSyncingOffline={isAutoSyncingOffline}
          offlineQueueJobs={offlineQueueJobs}
          backgroundProgress={backgroundSyncProgress}
          offlineSyncResultToast={offlineSyncResultToast}
          canAccessSyncHealth={
            currentUser.role === 'ADMIN' || currentUser.role === 'STORE_MANAGER'
          }
          onDismissToast={() => setOfflineSyncResultToast(null)}
          onOpenOfflineQueue={() => setIsOfflineQueueModalOpen(true)}
          onOpenSyncHealth={() => setActiveTab('sync-health')}
          onForceSyncNow={() => {
            void handleForceVerifyCloudSync();
          }}
        />
        {activeTab === 'online-orders' && (
          <OnlineOrdersManagementView
            onlineOrders={onlineOrders}
            storeSettings={storeSettings}
            currentUser={currentUser}
            onUpdateOrderStatus={handleUpdateOnlineOrderStatus}
            onFinalizeToPOS={handleFinalizeOnlineOrderToPOS}
            onOpenStorefrontPreview={openStorefrontMode}
          />
        )}

        {activeTab === 'pos' && (
          <TabletPOSView
            products={products}
            categories={categories}
            customers={customers}
            cart={cart}
            selectedCustomer={selectedCustomer}
            usePoints={usePoints}
            pointsToUse={pointsUsed}
            storeSettings={storeSettings}
            transactions={transactions}
            availableStoreCashBalance={availableStoreCashBalance}
            specialPriceNotice={specialPriceNotice}
            onDismissSpecialPriceNotice={() => setSpecialPriceNotice(null)}
            onAddToCart={handleAddToCart}
            onAddQuickSaleItem={handleAddQuickSaleItem}
            onUpdateCartItemQty={handleUpdateCartItemQty}
            onUpdateCartItemPrice={handleUpdateCartItemPrice}
            onChangeCartItemUnit={handleChangeCartItemUnit}
            onRemoveCartItem={handleRemoveCartItem}
            onClearCart={handleClearCart}
            onSelectCustomer={handleSelectCustomer}
            onOpenCustomerModal={() => setIsCustomerModalOpen(true)}
            onToggleUsePoints={setUsePoints}
            onChangePointsToUse={handleChangePointsToUse}
            onOpenPaymentModal={() => {
              if (
                storeSettings.enablePoints &&
                storeSettings.autoApplyMaxPoints &&
                isSelectedMember &&
                pointValue > 0 &&
                !hasManualPointOverride &&
                maxRedeemablePoints > 0
              ) {
                setRequestedPoints(maxRedeemablePoints);
              }
              setIsPaymentModalOpen(true);
            }}
            onOpenScannerModal={(mode = 'SCAN') => {
              setScannerInitialMode(mode);
              setIsScannerModalOpen(true);
            }}
            onDirectScanInput={handleBarcodeScanned}
            scanFeedbackNotice={scanFeedbackNotice}
            onDismissScanFeedback={() => setScanFeedbackNotice(null)}
            onOpenThresholdSettings={() => setIsThresholdModalOpen(true)}
            onNavigateToSuppliers={() => setActiveTab('suppliers')}
          />
        )}

        {activeTab === 'products' && (
          <ProductManagementView
            products={products}
            categories={categories}
            customerCategories={customerCategories}
            currentUserRole={currentUser.role}
            transactions={transactions}
            activityLogs={activityLogs}
            onAddProduct={handleAddProduct}
            onBatchAddProducts={handleBatchAddProducts}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onAddCategory={handleAddCategory}
            onBatchAddCategories={handleBatchAddCategories}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            onOpenThresholdSettings={() => setIsThresholdModalOpen(true)}
            onNavigateToSuppliers={() => setActiveTab('suppliers')}
            onNavigateToServices={() => setActiveTab('services')}
          />
        )}

        {activeTab === 'services' && (
          <ServiceManagementView
            products={products}
            categories={categories}
            customerCategories={customerCategories}
            currentUserRole={currentUser.role}
            transactions={transactions}
            users={users}
            onAddService={handleAddProduct}
            onUpdateService={handleUpdateProduct}
            onDeleteService={handleDeleteProduct}
            onAddCategory={handleAddCategory}
            onNavigateToPOS={(serviceId) => {
              setActiveTab('pos');
              if (serviceId) {
                const targetService = productMap.get(serviceId);
                if (targetService && targetService.units?.[0]) {
                  handleAddToCart(targetService, targetService.units[0], 1);
                }
              }
            }}
          />
        )}

        {activeTab === 'stock-report' && (
          <StockReportView
            products={products}
            suppliers={suppliers}
            currentUser={currentUser}
            currentUserRole={currentUser.role}
            users={users}
            stockOpnames={stockOpnames}
            storeSettings={storeSettings}
            transactions={transactions}
            purchases={purchases}
            cashflows={cashflows}
            taxRecords={taxRecords}
            taxAdjustments={taxAdjustments}
            balanceSheetEntries={balanceSheetEntries}
            batchIntegrityReport={batchIntegrityReport}
            openVerifyStockNonce={openVerifyStockNonce}
            onRecheckBatchIntegrity={() => handleRecheckBatchIntegrity('MANUAL')}
            onAutoFixAllBatchIntegrity={handleAutoFixAllBatchIntegrity}
            onUpdateStock={handleUpdateStock}
            onUpdateProduct={handleUpdateProduct}
            onBulkUpdateStock={handleBulkUpdateStock}
            onDeleteStockOpname={handleDeleteStockOpname}
            onOpenThresholdSettings={() => setIsThresholdModalOpen(true)}
            onNavigateToSuppliers={() => setActiveTab('suppliers')}
          />
        )}

        {activeTab === 'customers' && (
          <CustomerManagementView
            customers={customers}
            transactions={transactions}
            currentUserRole={currentUser.role}
            storeSettings={storeSettings}
            customerCategories={customerCategories}
            onAddCustomer={handleAddCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
            onAddCustomerCategory={handleAddCustomerCategory}
            onUpdateCustomerCategory={handleUpdateCustomerCategory}
            onDeleteCustomerCategory={handleDeleteCustomerCategory}
          />
        )}

        {activeTab === 'suppliers' && (
          <SupplierManagementView
            suppliers={suppliers}
            products={products}
            currentUserRole={currentUser.role}
            onAddSupplier={handleAddSupplier}
            onUpdateSupplier={handleUpdateSupplier}
            onDeleteSupplier={handleDeleteSupplier}
            onCompleteRestock={handleCompleteRestock}
          />
        )}

        {activeTab === 'purchases' && (
          <PurchaseManagementView
            purchases={purchases}
            suppliers={suppliers}
            products={products}
            currentUserRole={currentUser.role}
            storeSettings={storeSettings}
            onSavePurchase={handleSavePurchase}
            onDeletePurchase={handleDeletePurchase}
            onOpenSupplierManager={() => setActiveTab('suppliers')}
          />
        )}

        {activeTab === 'piutang' && (
          <PiutangManagementView
            transactions={transactions}
            onSettleDebt={handleSettleDebt}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionHistoryView
            transactions={transactions}
            storeSettings={storeSettings}
            categories={categories}
            products={products}
            customers={customers}
            currentUser={currentUser}
            activityLogs={activityLogs}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onProcessReturn={handleProcessTransactionReturn}
            onViewReceipt={(tx) => {
              setShouldAutoSendWaOnReceipt(false);
              setShouldAutoPrintOnReceipt(false);
              setLastCompletedTransaction(tx);
              setIsReceiptModalOpen(true);
            }}
            onOpenFifoReconcile={() => setIsGlobalFifoReconcileOpen(true)}
            onStartBackdatedTransaction={
              currentUser.role === 'ADMIN'
                ? () => {
                    setPreferBackdatedCheckout(true);
                    setActiveTab('pos');
                    setScanFeedbackNotice({
                      type: 'success',
                      message:
                        'Mode Transaksi Tanggal Lalu (Admin) aktif — Pilih barang lalu klik Bayar untuk menentukan tanggal mundur & hitung ulang FIFO.',
                    });
                  }
                : undefined
            }
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceView
            currentUser={currentUser}
            users={users}
            attendances={attendances}
            storeSettings={storeSettings}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onAddManualAttendance={handleAddManualAttendance}
            onDeleteAttendance={handleDeleteAttendance}
          />
        )}

        {activeTab === 'profit-loss' && (
          <DailyProfitLossView
            transactions={transactions}
            products={products}
            categories={categories}
            cashflows={cashflows}
            customers={customers}
            purchases={purchases}
            taxRecords={taxRecords}
            taxAdjustments={taxAdjustments}
            balanceSheetEntries={balanceSheetEntries}
            currentUserRole={currentUser.role}
            storeName={storeSettings.storeName}
            storeSettings={storeSettings}
            onOpenSettings={currentUser.role === 'ADMIN' ? () => setActiveTab('settings') : undefined}
            onReconcileTransactions={handleReconcileTransactions}
          />
        )}

        {activeTab === 'finance' && (
          <FinanceView
            cashflows={cashflows}
            transactions={transactions}
            products={products}
            purchases={purchases}
            customers={customers}
            taxRecords={taxRecords}
            taxAdjustments={taxAdjustments}
            balanceSheetEntries={balanceSheetEntries}
            storeSettings={storeSettings}
            onAddCashflow={handleAddCashflow}
            onUpdateCashflow={handleUpdateCashflow}
            onDeleteCashflow={handleDeleteCashflow}
            onSaveBalanceSheetEntry={handleSaveBalanceSheetEntry}
            onDeleteBalanceSheetEntry={handleDeleteBalanceSheetEntry}
            currentUser={currentUser}
            storeName={storeSettings.storeName}
          />
        )}

        {activeTab === 'balance-sheet' && (
          <BalanceSheetView
            transactions={transactions}
            products={products}
            purchases={purchases}
            cashflows={cashflows}
            customers={customers}
            taxRecords={taxRecords}
            taxAdjustments={taxAdjustments}
            balanceSheetEntries={balanceSheetEntries}
            storeSettings={storeSettings}
            currentUser={currentUser}
            onSaveEntry={handleSaveBalanceSheetEntry}
            onDeleteEntry={handleDeleteBalanceSheetEntry}
            onNavigateToFinance={() => setActiveTab('finance')}
          />
        )}

        {activeTab === 'tax' && (
          <TaxManagementView
            transactions={transactions}
            products={products}
            purchases={purchases}
            cashflows={cashflows}
            taxRecords={taxRecords}
            taxAuditLogs={taxAuditLogs}
            taxAdjustments={taxAdjustments}
            storeSettings={storeSettings}
            currentUser={currentUser}
            onUpdateTaxConfig={handleUpdateTaxConfig}
            onSaveTaxRecord={handleSaveTaxRecord}
            onDeleteTaxRecord={handleDeleteTaxRecord}
            onRecordTaxAuditLog={handleRecordTaxAuditLog}
            onSaveTaxAdjustment={handleSaveTaxAdjustment}
            onDeleteTaxAdjustment={handleDeleteTaxAdjustment}
            onNavigateToPOS={() => setActiveTab('pos')}
          />
        )}

        {activeTab === 'sales-dashboard' && (
          <div className="flex-1 p-3 md:p-6 bg-slate-100 overflow-y-auto select-none font-sans">
            <div className="max-w-7xl mx-auto space-y-4 md:space-y-5">
              <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
                <h2 className="text-base md:text-lg font-bold text-slate-900">
                  Sales Performance Dashboard
                </h2>
                <p className="text-xs text-slate-500">
                  Grafik batang interaktif komparasi pendapatan per kategori produk mingguan &amp; analisis tren permintaan.
                </p>
              </div>

              <SalesPerformanceDashboard
                transactions={transactions}
                products={products}
                categories={categories}
                suppliers={suppliers}
                cashflows={cashflows}
                customers={customers}
                attendances={attendances}
                currentUserRole={currentUser.role}
                storeName={storeSettings.storeName}
                dailySalesGoal={storeSettings.dailySalesGoal}
                weeklySalesGoal={storeSettings.weeklySalesGoal}
                monthlySalesGoal={storeSettings.monthlySalesGoal}
                categorySalesGoals={storeSettings.categorySalesGoals}
                chartTheme={storeSettings.chartTheme}
                onUpdateChartTheme={(nextTheme) =>
                  handleUpdateStoreSettings({
                    ...storeSettings,
                    chartTheme: nextTheme,
                  })
                }
                onOpenSettings={currentUser.role === 'ADMIN' ? () => setActiveTab('settings') : undefined}
                bcaAccountNumber={storeSettings.bcaAccountNumber}
                bcaAccountName={storeSettings.bcaAccountName}
                onNavigateToPiutang={() => setActiveTab('piutang')}
                purchases={purchases}
                taxRecords={taxRecords}
                taxAdjustments={taxAdjustments}
                storeSettings={storeSettings}
                onUpdateStoreSettings={handleUpdateStoreSettings}
                onNavigateToTax={() => setActiveTab('tax')}
                currentUserName={currentUser.name}
                onSaveProducts={async (updatedProducts) => {
                  const changedProducts = updatedProducts.filter((p) => productMap.get(p.id) !== p);
                  setProducts(updatedProducts);
                  if (changedProducts.length > 0) {
                    await saveBatchToFirestore('products', changedProducts).catch(() => {});
                  }
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'sales-report' && (
          <SalesReportView
            transactions={transactions}
            products={products}
            categories={categories}
            storeName={storeSettings.storeName}
          />
        )}

        {activeTab === 'monthly-sales' && (
          <MonthlySalesReportView
            transactions={transactions}
            products={products}
            categories={categories}
            currentUserRole={currentUser.role}
            storeName={storeSettings.storeName}
            storeSettings={storeSettings}
            cashflows={cashflows}
            purchases={purchases}
            taxRecords={taxRecords}
            taxAdjustments={taxAdjustments}
            balanceSheetEntries={balanceSheetEntries}
          />
        )}

        {activeTab === 'employee-activity' && (
          <EmployeeActivityView
            activityLogs={activityLogs}
            users={users}
            currentUser={currentUser}
            storeName={storeSettings.storeName}
            onNavigateToPOS={() => setActiveTab('pos')}
          />
        )}

        {activeTab === 'sync-health' && (currentUser.role === 'ADMIN' || currentUser.role === 'STORE_MANAGER') && (
          <SyncHealthDashboardView
            auditReport={syncAuditReport}
            isScanning={isScanningSyncHealth}
            isResolvingBulk={isResolvingBulkSyncConflicts}
            resolvingConflictId={resolvingConflictId}
            lastScanError={syncHealthScanError}
            isBrowserOnline={isBrowserOnline}
            isManualOfflineMode={Boolean(storeSettings.manualOfflineMode)}
            offlineQueueJobs={offlineQueueJobs}
            moduleSummaries={syncModuleSummaries}
            backgroundProgress={backgroundSyncProgress}
            canAccessSyncLogs={currentUser.role === 'ADMIN'}
            onRescanHealth={() => handleScanSyncHealth({ trackBackgroundProgress: true })}
            onResolveConflict={handleResolveSyncConflict}
            onResolveAllRecommended={handleResolveAllSyncConflicts}
            onNavigateToSyncLogs={() => setActiveTab('sync-logs')}
            onOpenOfflineQueue={() => setIsOfflineQueueModalOpen(true)}
          />
        )}

        {activeTab === 'sync-logs' && currentUser.role === 'ADMIN' && (
          <SyncActivityLogView
            logs={syncActivityLogs}
            moduleSummaries={syncModuleSummaries}
            isBrowserOnline={isBrowserOnline}
            isManualOfflineMode={Boolean(storeSettings.manualOfflineMode)}
            offlineQueueCount={offlineQueueJobs.length}
            onClearLogs={(resetStats) => clearSyncActivityLogs(resetStats)}
            onNavigateToSyncHealth={() => setActiveTab('sync-health')}
            onForceSyncNow={async () => {
              await handleForceVerifyCloudSync();
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            storeSettings={storeSettings}
            users={users}
            products={products}
            categories={categories}
            customerCategories={customerCategories}
            customers={customers}
            suppliers={suppliers}
            purchases={purchases}
            transactions={transactions}
            cashflows={cashflows}
            attendances={attendances}
            stockOpnames={stockOpnames}
            onlineOrders={onlineOrders}
            activityLogs={activityLogs}
            taxRecords={taxRecords}
            taxAuditLogs={taxAuditLogs}
            taxAdjustments={taxAdjustments}
            balanceSheetEntries={balanceSheetEntries}
            currentUserRole={currentUser.role}
            currentUserName={currentUser.name}
            onUpdateStoreSettings={handleUpdateStoreSettings}
            onUpdateUsers={handleUpdateUsers}
            onResetToDemoData={handleResetToDemoData}
            onClearDatabaseExceptUsers={handleClearDatabaseExceptUsers}
            onRestoreBackup={handleRestoreBackup}
            cloudSyncStatus={cloudSyncStatus === 'SYNCED' ? 'SYNCED' : cloudSyncStatus === 'CONNECTING' ? 'CONNECTING' : 'OFFLINE'}
            cloudSyncError={cloudSyncError}
            pendingSyncQueueCount={pendingSyncQueueCount}
            offlineQueueCount={offlineQueueJobs.length}
            onOpenOfflineQueueModal={() => setIsOfflineQueueModalOpen(true)}
            focusFirestoreSettingsNonce={focusFirestoreSettingsNonce}
            onForceVerifyCloudSync={handleForceVerifyCloudSync}
            onOpenSyncHealth={() => setActiveTab('sync-health')}
            onOpenSyncLogs={() => setActiveTab('sync-logs')}
          />
        )}
      </main>

      {/* MODALS */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        subtotal={subtotal}
        pointsDiscount={pointsDiscountAmount}
        pointsUsed={pointsUsed}
        maxRedeemablePoints={maxRedeemablePoints}
        onChangePointsToUse={handleChangePointsToUse}
        grandTotal={grandTotal}
        selectedCustomer={selectedCustomer}
        storeSettings={storeSettings}
        membershipDiscount={membershipDiscountAmount}
        customerTier={customerTier}
        tierDiscountPercent={tierDiscountPercent}
        isAdmin={currentUser.role === 'ADMIN'}
        defaultBackdated={preferBackdatedCheckout}
        isOfflineMode={!isBrowserOnline || Boolean(storeSettings.manualOfflineMode)}
        onConfirmPayment={handleConfirmPayment}
        onOpenCustomerModal={() => {
          setIsPaymentModalOpen(false);
          setIsCustomerModalOpen(true);
        }}
      />

      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => {
          setIsReceiptModalOpen(false);
          setIsDigitalReceiptLinkView(false);
          setShouldAutoSendWaOnReceipt(false);
          setShouldAutoPrintOnReceipt(false);
        }}
        transaction={lastCompletedTransaction}
        storeSettings={storeSettings}
        customers={customers}
        isDigitalLinkMode={isDigitalReceiptLinkView}
        onRateTransaction={handleRateTransaction}
        onSaveReceiptEmail={handleSaveReceiptEmail}
        autoSendWhatsApp={shouldAutoSendWaOnReceipt}
        onAutoSendWhatsAppHandled={() => setShouldAutoSendWaOnReceipt(false)}
        autoPrintReceipt={shouldAutoPrintOnReceipt}
        onAutoPrintHandled={() => setShouldAutoPrintOnReceipt(false)}
        onNewTransaction={() => {
          setIsReceiptModalOpen(false);
          setIsDigitalReceiptLinkView(false);
          setShouldAutoSendWaOnReceipt(false);
          setShouldAutoPrintOnReceipt(false);
          setActiveTab('pos');
        }}
      />

      <BarcodeScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        products={products}
        onBarcodeScanned={handleBarcodeScanned}
        customers={customers}
        onSelectCustomer={(cust) => {
          handleSelectCustomer(cust);
          setScanFeedbackNotice({
            type: 'success',
            message: `Member dipilih via QR: ${cust.name} (${getCustomerMembershipId(cust)})`,
          });
        }}
        onAddToCartFromLookup={(prod, unit, qty = 1, variant) => {
          handleAddToCart(prod, unit, qty, variant);
          setScanFeedbackNotice({
            type: 'success',
            message: `Ditambahkan dari Cek Stok: ${prod.name}`,
          });
        }}
        initialMode={scannerInitialMode}
      />

      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        customers={customers}
        selectedCustomer={selectedCustomer}
        customerCategories={customerCategories}
        transactions={transactions}
        onSelectCustomer={handleSelectCustomer}
        onAddCustomer={handleAddCustomer}
      />

      <UserSwitchModal
        isOpen={isSwitchUserModalOpen}
        onClose={() => setIsSwitchUserModalOpen(false)}
        users={users}
        currentUser={currentUser}
        onSelectUser={setCurrentUser}
      />

      <ShiftSummaryModal
        isOpen={isShiftSummaryModalOpen}
        onClose={() => setIsShiftSummaryModalOpen(false)}
        currentUser={currentUser}
        transactions={transactions}
        storeSettings={storeSettings}
        onEndShift={() => {
          setIsShiftSummaryModalOpen(false);
          setIsSwitchUserModalOpen(true); // Lock screen for next cashier
        }}
      />

      <StockThresholdSettingsModal
        isOpen={isThresholdModalOpen}
        onClose={() => setIsThresholdModalOpen(false)}
        products={products}
        suppliers={suppliers}
        storeSettings={storeSettings}
        onSaveThresholds={(updatedProducts) => {
          const changedProducts = updatedProducts.filter((p) => productMap.get(p.id) !== p);
          setProducts(updatedProducts);
          if (changedProducts.length > 0) {
            saveBatchToFirestore('products', changedProducts).catch(() => {});
          }
        }}
      />

      <FifoReconciliationModal
        isOpen={isGlobalFifoReconcileOpen}
        onClose={() => setIsGlobalFifoReconcileOpen(false)}
        transactions={transactions}
        products={products}
        onReconcile={handleReconcileTransactions}
      />

      {/* Hidden anchor + Floating Alert for Automated Daily Admin Low-Stock WhatsApp */}
      {adminLowStockWaAlert && (
        <>
          <a
            ref={adminWaAnchorRef}
            href={adminLowStockWaAlert.waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden"
            aria-hidden="true"
          />

          <div
            className={`fixed bottom-4 right-4 z-50 max-w-md w-[calc(100vw-2rem)] bg-white rounded-2xl border-2 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 select-none ${
              adminLowStockWaAlert.triggerSource === 'SCHEDULED'
                ? 'border-sky-400'
                : 'border-amber-400'
            }`}
          >
            <div
              className={`px-4 py-3 text-white flex items-center justify-between gap-2 ${
                adminLowStockWaAlert.triggerSource === 'SCHEDULED'
                  ? 'bg-gradient-to-r from-sky-600 to-indigo-600'
                  : 'bg-gradient-to-r from-amber-600 to-rose-600'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-extrabold tracking-tight truncate">
                    {adminLowStockWaAlert.triggerSource === 'SCHEDULED'
                      ? `Laporan Stok Rendah Terjadwal (${adminLowStockWaAlert.hits.length} Produk)`
                      : `Alert Stok Minimum Harian (${adminLowStockWaAlert.hits.length} Produk)`}
                  </div>
                  <div
                    className={`text-[10px] truncate ${
                      adminLowStockWaAlert.triggerSource === 'SCHEDULED'
                        ? 'text-sky-100'
                        : 'text-amber-100'
                    }`}
                  >
                    {adminLowStockWaAlert.triggerSource === 'SCHEDULED' &&
                    adminLowStockWaAlert.scheduleLabel
                      ? `Jadwal ${adminLowStockWaAlert.scheduleLabel} · `
                      : ''}
                    {adminLowStockWaAlert.hasAdminPhone
                      ? `WhatsApp Admin (${storeSettings.adminWhatsAppNumber}) siap dikirim`
                      : 'Nomor WhatsApp Admin belum diatur — pilih kontak manual atau atur di Pengaturan'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setAdminLowStockWaAlert(null);
                }}
                className="p-1 rounded-lg hover:bg-white/20 text-white/90 cursor-pointer shrink-0"
                title="Tutup notifikasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 space-y-3">
              {adminLowStockWaAlert.hits.length === 0 ? (
                <div className="px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
                  Seluruh produk barang saat ini berada di atas batas minimum stok.
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {adminLowStockWaAlert.hits.map((hit) => (
                    <div
                      key={hit.productId}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs"
                    >
                      <span className="font-bold text-slate-900 truncate">{hit.productName}</span>
                      <span
                        className={`px-2 py-0.5 rounded-md font-mono font-bold text-[10px] shrink-0 tabular-nums ${
                          hit.currentStock <= 0
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        Sisa {formatNumber(hit.currentStock)} / Min {formatNumber(hit.minThreshold)} {hit.baseUnit}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={adminLowStockWaAlert.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => sound.playSuccessChime()}
                  className="flex-1 min-w-[160px] py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Kirim WA ke Admin</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(adminLowStockWaAlert.message).catch(() => {});
                    }
                    setCopiedAdminWaAlert(true);
                    setTimeout(() => setCopiedAdminWaAlert(false), 2500);
                  }}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedAdminWaAlert ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Pesan</span>
                    </>
                  )}
                </button>

                {!adminLowStockWaAlert.hasAdminPhone && currentUser.role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setAdminLowStockWaAlert(null);
                      setActiveTab('settings');
                    }}
                    className="w-full py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    <span>Atur Nomor WhatsApp Admin di Pengaturan</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Hidden anchor + Floating Alert for Scheduled Daily Closing Sales WhatsApp */}
      {adminDailySalesWaAlert && (
        <>
          <a
            ref={adminDailySalesWaAnchorRef}
            href={adminDailySalesWaAlert.waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden"
            aria-hidden="true"
          />

          <div className="fixed bottom-4 left-4 z-50 max-w-md w-[calc(100vw-2rem)] bg-white rounded-2xl border-2 border-emerald-400 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 select-none">
            <div className="px-4 py-3 text-white bg-gradient-to-r from-emerald-600 to-teal-600 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TrendingUp className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-extrabold tracking-tight truncate">
                    Laporan Penutupan Penjualan Harian
                  </div>
                  <div className="text-[10px] text-emerald-100 truncate">
                    Jadwal {adminDailySalesWaAlert.scheduleLabel} ·{' '}
                    {adminDailySalesWaAlert.hasAdminPhone
                      ? `WA Admin (${storeSettings.adminWhatsAppNumber}) siap dikirim`
                      : 'Nomor WA Admin belum diatur'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setAdminDailySalesWaAlert(null);
                }}
                className="p-1 rounded-lg hover:bg-white/20 text-white/90 cursor-pointer shrink-0"
                title="Tutup notifikasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500">Transaksi</div>
                  <div className="text-xs font-black text-slate-900 tabular-nums">
                    {formatNumber(adminDailySalesWaAlert.summary.transactionCount)} Nota
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200">
                  <div className="text-[10px] font-semibold text-emerald-700">Omzet Bersih</div>
                  <div className="text-xs font-black text-emerald-900 tabular-nums">
                    Rp {formatNumber(adminDailySalesWaAlert.summary.totalNetRevenue)}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-sky-50/70 border border-sky-200">
                  <div className="text-[10px] font-semibold text-sky-700">Laba Kotor</div>
                  <div className="text-xs font-black text-sky-900 tabular-nums">
                    Rp {formatNumber(adminDailySalesWaAlert.summary.grossProfit)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={adminDailySalesWaAlert.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => sound.playSuccessChime()}
                  className="flex-1 min-w-[160px] py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Kirim WA ke Admin</span>
                  <ExternalLink className="w-3 h-3" />
                </a>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      navigator.clipboard.writeText(adminDailySalesWaAlert.message).catch(() => {});
                    }
                    setCopiedAdminDailySalesWa(true);
                    setTimeout(() => setCopiedAdminDailySalesWa(false), 2500);
                  }}
                  className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedAdminDailySalesWa ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Tersalin</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Pesan</span>
                    </>
                  )}
                </button>

                {!adminDailySalesWaAlert.hasAdminPhone && currentUser.role === 'ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setAdminDailySalesWaAlert(null);
                      setActiveTab('settings');
                    }}
                    className="w-full py-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    <span>Atur Nomor WhatsApp Admin di Pengaturan</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {/* Non-blocking Toast for Cetak Cepat Bluetooth Direct Print */}
      {quickPrintFeedback && (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-sm w-[calc(100vw-2rem)] bg-white rounded-2xl border shadow-xl overflow-hidden select-none ${
            quickPrintFeedback.status === 'SUCCESS'
              ? 'border-emerald-300'
              : quickPrintFeedback.status === 'ERROR'
              ? 'border-rose-300'
              : 'border-sky-300'
          }`}
        >
          <div
            className={`px-3.5 py-2.5 flex items-center justify-between gap-2 border-b ${
              quickPrintFeedback.status === 'SUCCESS'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : quickPrintFeedback.status === 'ERROR'
                ? 'bg-rose-50 border-rose-200 text-rose-950'
                : 'bg-sky-50 border-sky-200 text-sky-950'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Bluetooth className="w-4 h-4 shrink-0" />
              <span className="text-xs font-bold truncate">
                {quickPrintFeedback.status === 'PRINTING'
                  ? 'Cetak Cepat Bluetooth...'
                  : quickPrintFeedback.status === 'SUCCESS'
                  ? 'Cetak Cepat Berhasil'
                  : 'Cetak Cepat Bluetooth Gagal'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQuickPrintFeedback(null)}
              className="p-1 rounded-lg hover:bg-black/5 cursor-pointer shrink-0"
              title="Tutup"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 space-y-2.5">
            <p className="text-xs text-slate-700 leading-relaxed">{quickPrintFeedback.message}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {quickPrintFeedback.status === 'ERROR' && (
                <>
                  <button
                    type="button"
                    onClick={() => void executeQuickBluetoothPrint(quickPrintFeedback.transaction)}
                    className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Coba Lagi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      openRawBtPrint(
                        quickPrintFeedback.transaction,
                        storeSettings,
                        storeSettings.printerPaperWidth || '58mm'
                      );
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" />
                    <span>RawBT</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setLastCompletedTransaction(quickPrintFeedback.transaction);
                  setShouldAutoPrintOnReceipt(false);
                  setShouldAutoSendWaOnReceipt(false);
                  setIsReceiptModalOpen(true);
                  setQuickPrintFeedback(null);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Printer className="w-3 h-3" />
                <span>Lihat Struk</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High-Visibility Floating Alert Toast: Tarik Tunai Melebihi Saldo Kas */}
      {cashWithdrawalAlertToast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[80] w-[94vw] max-w-lg bg-white rounded-2xl border-2 border-rose-500 shadow-2xl shadow-rose-950/30 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200 select-none"
        >
          <div className="px-4 py-3 bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0 animate-pulse">
                <AlertTriangle className="w-5 h-5 text-amber-200" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-black tracking-tight truncate">
                  {cashWithdrawalAlertToast.title}
                </div>
                <div className="text-[10px] text-rose-100 font-medium truncate">
                  Penambahan ke keranjang otomatis diblokir oleh sistem kas
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCashWithdrawalAlertToast(null)}
              className="p-1.5 rounded-xl hover:bg-white/20 text-white/90 cursor-pointer shrink-0 transition-colors"
              title="Tutup peringatan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3.5 space-y-3 bg-rose-50/40">
            <p className="text-xs font-semibold text-slate-800 leading-relaxed">
              {cashWithdrawalAlertToast.message}
            </p>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 rounded-xl bg-white border border-rose-200">
                <div className="text-[9.5px] font-bold text-slate-500 uppercase">Diminta</div>
                <div className="text-xs font-black font-mono text-rose-700 tabular-nums mt-0.5">
                  {formatRupiah(cashWithdrawalAlertToast.requestedAmount)}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-white border border-slate-200">
                <div className="text-[9.5px] font-bold text-slate-500 uppercase">Sisa Saldo Kas</div>
                <div className="text-xs font-black font-mono text-slate-900 tabular-nums mt-0.5">
                  {formatRupiah(cashWithdrawalAlertToast.availableBalance)}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-rose-100/70 border border-rose-300">
                <div className="text-[9.5px] font-bold text-rose-700 uppercase">Kekurangan</div>
                <div className="text-xs font-black font-mono text-rose-800 tabular-nums mt-0.5">
                  -{formatRupiah(cashWithdrawalAlertToast.shortfall)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {currentUser.role !== 'KARYAWAN' && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setCashWithdrawalAlertToast(null);
                    setActiveTab('finance');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer transition-colors"
                >
                  Catat Modal Kas di Keuangan
                </button>
              )}
              <button
                type="button"
                onClick={() => setCashWithdrawalAlertToast(null)}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold cursor-pointer transition-colors"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
      <OfflineQueueModal
        isOpen={isOfflineQueueModalOpen}
        onClose={() => setIsOfflineQueueModalOpen(false)}
        jobs={offlineQueueJobs}
        isBrowserOnline={isBrowserOnline}
        isManualOfflineMode={Boolean(storeSettings.manualOfflineMode)}
        isSyncing={isAutoSyncingOffline}
        onForceSyncNow={async () => {
          await handleForceVerifyCloudSync();
        }}
        onRemoveJob={removeOfflineSyncJob}
        onClearAllJobs={clearOfflineSyncQueue}
        canClearQueue={currentUser.role === 'ADMIN'}
      />

      {isGoogleDriveBackupModalOpen && (currentUser.role === 'ADMIN' || currentUser.role === 'STORE_MANAGER') && (
        <div className="fixed inset-0 z-[105] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
                  <HardDrive className="w-5 h-5 text-sky-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm md:text-base font-extrabold truncate">
                    Backup Data Toko ke Google Drive
                  </h3>
                  <p className="text-[11px] text-slate-300 truncate">
                    Cadangkan &amp; pulihkan seluruh data toko secara aman di luar Firebase
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsGoogleDriveBackupModalOpen(false);
                }}
                className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer shrink-0"
                aria-label="Tutup Backup Google Drive"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 md:p-5 overflow-y-auto space-y-4">
              <GoogleDriveBackupPanel
                canManageBackup={currentUser.role === 'ADMIN' || currentUser.role === 'STORE_MANAGER'}
                currentUserName={currentUser.name}
                buildBackupPayload={(prefix) =>
                  buildFullBackupPayload({
                    fileNamePrefix: prefix,
                    products,
                    categories,
                    customerCategories,
                    customers,
                    suppliers,
                    purchases,
                    transactions,
                    cashflows,
                    attendances,
                    stockOpnames,
                    onlineOrders,
                    activityLogs,
                    taxRecords,
                    taxAuditLogs,
                    taxAdjustments,
                    balanceSheetEntries,
                    storeSettings,
                    users,
                  })
                }
                onRestoreBackup={handleRestoreBackup}
                onBackupCompleted={() => {
                  setOfflineSyncResultToast('Cadangan data toko berhasil diunggah ke Google Drive.');
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
