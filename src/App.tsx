import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  AlertTriangle,
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  X,
  Settings as SettingsIcon
} from 'lucide-react';
import { 
  User, 
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
  OnlineOrderStatus
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
import { FinanceView } from './components/FinanceView';
import { FifoReconciliationModal } from './components/FifoReconciliationModal';
import { OnlineStorefrontPage } from './components/OnlineStorefrontPage';
import { OnlineOrdersManagementView } from './components/OnlineOrdersManagementView';
import {
  findCustomerSpecialPrice,
  isCustomerMember,
  calculatePointsEarned,
  findCustomerByScanInput,
  generateMembershipId,
  getCustomerMembershipId,
} from './utils/customerUtils';
import { generateInvoiceNumber, formatNumber } from './utils/formatters';
import { recalculateChronologicalFifoForNewTransaction } from './utils/fifoUtils';
import { getCategoryColor } from './utils/categoryColors';
import { sound } from './utils/audio';
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
  seedCollectionIfEmpty, 
  subscribeToCollection, 
  saveDocumentToFirestore, 
  deleteDocumentFromFirestore, 
  saveBatchToFirestore, 
  saveStoreSettingsToFirestore,
  clearAllDatabaseExceptUsers,
  pauseFirestoreCloudSync,
  resumeFirestoreCloudSync,
  setCloudSyncPaused,
  CloudSyncStatus
} from './utils/firebaseSync';

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
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerInitialMode, setScannerInitialMode] = useState<ScannerModalMode>('SCAN');
  const [scanFeedbackNotice, setScanFeedbackNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isSwitchUserModalOpen, setIsSwitchUserModalOpen] = useState(false);
  const [isShiftSummaryModalOpen, setIsShiftSummaryModalOpen] = useState(false);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);

  // Cloud Sync state
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('CONNECTING');

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
  const prevProductsStockRef = useRef<Map<string, { stock: number; minStockAlert: number }>>(new Map());
  const hasSeededStockTrackerRef = useRef(false);

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

  // Real-time Firestore Multi-Device Synchronization & Connection
  useEffect(() => {
    if (storeSettings.manualOfflineMode) {
      pauseFirestoreCloudSync().catch(() => {});
      setCloudSyncStatus('OFFLINE');
      return;
    }

    let active = true;
    setCloudSyncStatus('CONNECTING');
    resumeFirestoreCloudSync().catch(() => {});

    // Bootstrap default accounts & settings if missing
    const bootstrapStore = async () => {
      try {
        await seedCollectionIfEmpty('users', INITIAL_USERS);
        await seedCollectionIfEmpty('settings', [{ ...INITIAL_STORE_SETTINGS, id: 'store_config' }]);
        await seedCollectionIfEmpty('customer_categories', INITIAL_CUSTOMER_CATEGORIES);
      } catch (err) {
        console.warn('[CloudSync] Bootstrap notice:', err);
      }
    };

    bootstrapStore();

    // Real-time Listeners across all devices
    const unsubs = [
      subscribeToCollection<Product>('products', (cloudProds) => {
        if (!active) return;
        const sanitized = sanitizeProducts(cloudProds);
        setProducts(sanitized);
        setCloudSyncStatus('SYNCED');
      }, () => setCloudSyncStatus('OFFLINE')),

      subscribeToCollection<RestockOrder>('purchases', (cloudPurchases) => {
        if (!active) return;
        const sorted = cloudPurchases.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setPurchases(sorted);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<ProductCategory>('categories', (cloudCats) => {
        if (!active) return;
        setCategories(cloudCats);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<CustomerCategoryItem>('customer_categories', (cloudCats) => {
        if (!active) return;
        if (cloudCats.length > 0) {
          setCustomerCategories(cloudCats);
        }
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<Customer>('customers', (cloudCusts) => {
        if (!active) return;
        setCustomers(cloudCusts);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<Supplier>('suppliers', (cloudSups) => {
        if (!active) return;
        setSuppliers(cloudSups);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<Transaction>('transactions', (cloudTxs) => {
        if (!active) return;
        const sorted = cloudTxs.sort((a, b) => b.timestamp - a.timestamp);
        setTransactions(sorted);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<AttendanceRecord>('attendances', (cloudAtt) => {
        if (!active) return;
        setAttendances(cloudAtt);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<StockOpnameRecord>('stock_opnames', (cloudOpnames) => {
        if (!active) return;
        setStockOpnames(cloudOpnames);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<CashflowRecord>('cashflows', (cloudCashflows) => {
        if (!active) return;
        const sorted = cloudCashflows.sort((a, b) => b.timestamp - a.timestamp);
        setCashflows(sorted);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<OnlineOrder>('online_orders', (cloudOrders) => {
        if (!active) return;
        const sorted = cloudOrders.sort((a, b) => b.createdAt - a.createdAt);
        setOnlineOrders(sorted);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<User>('users', (cloudUsers) => {
        if (!active) return;
        if (cloudUsers.length > 0) {
          setUsers(cloudUsers);
          setCurrentUser((current) => {
            if (!cloudUsers.some((u) => u.id === current.id)) {
              return cloudUsers[0];
            }
            return current;
          });
        }
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<any>('settings', (cloudSettingsList) => {
        if (!active) return;
        const cfg = cloudSettingsList.find((s) => s.id === 'store_config');
        if (cfg) {
          const { id, ...rest } = cfg;
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
            printerConnectionType: rest.printerConnectionType || prev.printerConnectionType || 'BLUETOOTH',
            printerPaperWidth: rest.printerPaperWidth || prev.printerPaperWidth || '58mm',
            printerDeviceName: rest.printerDeviceName !== undefined ? rest.printerDeviceName : (prev.printerDeviceName || ''),
            printerAutoCut: rest.printerAutoCut !== undefined ? rest.printerAutoCut : (prev.printerAutoCut ?? true),
            autoPrintReceipt: rest.autoPrintReceipt !== undefined ? rest.autoPrintReceipt : (prev.autoPrintReceipt ?? false),
            pointsPerSpend: rest.pointsPerSpend !== undefined ? rest.pointsPerSpend : (prev.pointsPerSpend ?? 1),
            autoApplyMaxPoints: rest.autoApplyMaxPoints !== undefined ? rest.autoApplyMaxPoints : (prev.autoApplyMaxPoints ?? false),
            requireTransactionNote: rest.requireTransactionNote !== undefined ? rest.requireTransactionNote : (prev.requireTransactionNote ?? false),
          }));
        }
        setCloudSyncStatus('SYNCED');
      }),
    ];

    return () => {
      active = false;
      unsubs.forEach((unsub) => unsub());
    };
  }, [storeSettings.manualOfflineMode]);

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

    // Check and automatically update special customer category pricing for all items already in cart
    const nextCart = cart.map((item) => {
      const product = productMap.get(item.productId);
      if (!product) return item;

      // Keep manual cashier price override if explicitly edited
      if (item.isCustomPrice) return item;

      const freshUnit =
        product.units.find((u) => u.id === item.selectedUnit.id || u.unitName === item.selectedUnit.unitName) ||
        item.selectedUnit;

      // Standard original price (with variant adjustment if applicable)
      let standardPrice = freshUnit.sellingPrice;
      if (item.selectedVariant && product.variants) {
        const vObj = product.variants.find((v) => v.name.toLowerCase() === item.selectedVariant?.toLowerCase());
        if (vObj && vObj.price !== undefined && vObj.price > 0) {
          standardPrice = vObj.price * (freshUnit.conversionFactor || 1);
        } else if (vObj && vObj.priceAdjustment) {
          standardPrice = Math.max(0, freshUnit.sellingPrice + vObj.priceAdjustment * (freshUnit.conversionFactor || 1));
        }
      }

      const specialPricing = effectiveCategory
        ? findCustomerSpecialPrice(product, effectiveCategory, freshUnit, item.quantity)
        : null;

      if (specialPricing) {
        specialAppliedCount += 1;
        totalSavedRupiah += Math.max(0, (standardPrice - specialPricing.specialPrice) * item.quantity);
        if (!appliedNames.includes(item.productName)) {
          appliedNames.push(item.productName);
        }
        return {
          ...item,
          selectedUnit: freshUnit,
          unitPrice: specialPricing.specialPrice,
          subtotal: item.quantity * specialPricing.specialPrice,
          isCustomerSpecialPrice: true,
          customerPriceCategory: effectiveCategory,
          originalUnitPrice: standardPrice,
        };
      }

      // Revert to standard price if customer has no special price for this item
      return {
        ...item,
        selectedUnit: freshUnit,
        unitPrice: standardPrice,
        subtotal: item.quantity * standardPrice,
        isCustomerSpecialPrice: false,
        customerPriceCategory: undefined,
        originalUnitPrice: standardPrice,
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

    // Calculate standard unit price with variant specific price or adjustment if applicable
    let standardUnitPrice = unit.sellingPrice;
    if (selectedVariant && product.variants) {
      const vObj = product.variants.find((v) => v.name.toLowerCase() === selectedVariant.toLowerCase());
      if (vObj && vObj.price !== undefined && vObj.price > 0) {
        standardUnitPrice = vObj.price * (unit.conversionFactor || 1);
      } else if (vObj && vObj.priceAdjustment) {
        standardUnitPrice = Math.max(0, unit.sellingPrice + (vObj.priceAdjustment * (unit.conversionFactor || 1)));
      }
    }

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      const newQty = updatedCart[existingIndex].quantity + qtyToAdd;
      if (newQty > maxUnits) {
        alert(`Stok tidak mencukupi! Maksimal ${maxUnits} ${unit.unitName}`);
        return;
      }

      // Re-evaluate customer special price with updated total quantity
      let effectivePrice = updatedCart[existingIndex].unitPrice;
      let isSpecial = updatedCart[existingIndex].isCustomerSpecialPrice;
      let cat = updatedCart[existingIndex].customerPriceCategory;

      if (!updatedCart[existingIndex].isCustomPrice) {
        const activeCat = getEffectiveCustomerCategory(selectedCustomer);
        const specialPricing = findCustomerSpecialPrice(product, activeCat, unit, newQty);
        if (specialPricing) {
          effectivePrice = specialPricing.specialPrice;
          isSpecial = true;
          cat = activeCat;
        } else {
          effectivePrice = standardUnitPrice;
          isSpecial = false;
          cat = undefined;
        }
      }

      updatedCart[existingIndex].quantity = newQty;
      updatedCart[existingIndex].unitPrice = effectivePrice;
      updatedCart[existingIndex].isCustomerSpecialPrice = isSpecial;
      updatedCart[existingIndex].customerPriceCategory = cat;
      updatedCart[existingIndex].subtotal = newQty * effectivePrice;
      setCart(updatedCart);
    } else {
      if (qtyToAdd > maxUnits) {
        alert(`Stok tidak mencukupi! Maksimal ${maxUnits} ${unit.unitName}`);
        return;
      }

      // Check special customer price with quantity trigger
      let effectiveUnitPrice = standardUnitPrice;
      let isCustomerSpecialPrice = false;
      let customerPriceCategory: string | undefined = undefined;

      const activeCat = getEffectiveCustomerCategory(selectedCustomer);
      const specialPricing = findCustomerSpecialPrice(product, activeCat, unit, qtyToAdd);
      if (specialPricing) {
        effectiveUnitPrice = specialPricing.specialPrice;
        isCustomerSpecialPrice = true;
        customerPriceCategory = activeCat;
      }

      const newItem: CartItem = {
        cartItemId: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        productId: product.id,
        productName: product.name,
        category: product.category,
        baseUnit: product.baseUnit,
        selectedUnit: unit,
        quantity: qtyToAdd,
        unitPrice: effectiveUnitPrice,
        originalUnitPrice: standardUnitPrice,
        subtotal: qtyToAdd * effectiveUnitPrice,
        availableStockInUnits: maxUnits,
        selectedVariant: selectedVariant || undefined,
        isService: product.productType === 'JASA',
        serviceNotes: product.serviceNotes,
        isCustomerSpecialPrice,
        customerPriceCategory,
      };
      setCart([...cart, newItem]);
    }
  };

  const handleAddQuickSaleItem = ({
    description,
    amount,
    quantity,
    unitName = 'ITEM',
  }: {
    description: string;
    amount: number;
    quantity: number;
    unitName?: string;
  }) => {
    const cleanDesc = description.trim();
    const safeAmount = Math.max(0, Math.round(amount));
    const safeQty = Math.max(1, quantity);
    const cleanUnit = unitName.trim().toUpperCase() || 'ITEM';
    if (!cleanDesc || safeAmount <= 0) return;

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
        sellingPrice: safeAmount,
        costPrice: 0,
      },
      quantity: safeQty,
      unitPrice: safeAmount,
      originalUnitPrice: safeAmount,
      subtotal: safeQty * safeAmount,
      availableStockInUnits: 999999,
      isService: false,
      isQuickSale: true,
    };

    setCart((prev) => [...prev, quickSaleItem]);
  };

  const handleUpdateCartItemQty = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(cartItemId);
      return;
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
          let isCustomerSpecialPrice = item.isCustomerSpecialPrice;
          let customerPriceCategory = item.customerPriceCategory;

          // Re-evaluate special pricing trigger on quantity changes
          if (!item.isCustomPrice && product) {
            let standardUnitPrice = item.originalUnitPrice || item.selectedUnit.sellingPrice;
            if (item.selectedVariant && product.variants) {
              const vObj = product.variants.find((v) => v.name.toLowerCase() === item.selectedVariant?.toLowerCase());
              if (vObj && vObj.price !== undefined && vObj.price > 0) {
                standardUnitPrice = vObj.price * (item.selectedUnit.conversionFactor || 1);
              } else if (vObj && vObj.priceAdjustment) {
                standardUnitPrice = Math.max(0, item.selectedUnit.sellingPrice + (vObj.priceAdjustment * (item.selectedUnit.conversionFactor || 1)));
              }
            }

            const activeCat = getEffectiveCustomerCategory(selectedCustomer);
            const specialPricing = findCustomerSpecialPrice(
              product,
              activeCat,
              item.selectedUnit,
              newQty
            );

            if (specialPricing) {
              unitPrice = specialPricing.specialPrice;
              isCustomerSpecialPrice = true;
              customerPriceCategory = activeCat;
            } else {
              unitPrice = standardUnitPrice;
              isCustomerSpecialPrice = false;
              customerPriceCategory = undefined;
            }
          }

          return {
            ...item,
            quantity: newQty,
            unitPrice,
            isCustomerSpecialPrice,
            customerPriceCategory,
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
          const activeCat = getEffectiveCustomerCategory(selectedCustomer);
          const specialPricing = product
            ? findCustomerSpecialPrice(product, activeCat, newUnit, item.quantity)
            : null;
          const price = specialPricing ? specialPricing.specialPrice : newUnit.sellingPrice;
          return {
            ...item,
            selectedUnit: newUnit,
            unitPrice: price,
            subtotal: item.quantity * price,
            isCustomPrice: false,
            originalUnitPrice: newUnit.sellingPrice,
            isCustomerSpecialPrice: !!specialPricing,
            customerPriceCategory: specialPricing ? activeCat : undefined,
          };
        }
        return item;
      })
    );
  };

  const handleUpdateCartItemPrice = (cartItemId: string, newUnitPrice: number) => {
    if (newUnitPrice < 0) return;
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
            costPrice: item.isQuickSale ? 0 : (prod?.costPrice || 0),
            totalAmount: item.subtotal,
            selectedVariant: item.selectedVariant,
            isService: item.isService,
            isQuickSale: item.isQuickSale,
            serviceNotes: item.serviceNotes,
            batchDeductions: [],
            isCustomerSpecialPrice: item.isCustomerSpecialPrice,
            customerPriceCategory: item.customerPriceCategory,
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
      setShouldAutoSendWaOnReceipt(Boolean(storeSettings.autoSendWhatsAppReceipt));
      setShouldAutoPrintOnReceipt(Boolean(storeSettings.autoPrintReceipt));
      setIsPaymentModalOpen(false);
      setPreferBackdatedCheckout(false);
      setIsReceiptModalOpen(true);
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
        const effectiveHpp = fifoData ? fifoData.costPrice : (item.isQuickSale ? 0 : (prod?.costPrice || 0));

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
          serviceNotes: item.serviceNotes,
          batchDeductions: fifoData?.batchDeductions || [],
          isCustomerSpecialPrice: item.isCustomerSpecialPrice,
          customerPriceCategory: item.customerPriceCategory,
        };
      }),
    };

    const nextTransactions = [newTransaction, ...transactions];
    setTransactions(nextTransactions);
    setLastCompletedTransaction(newTransaction);
    setShouldAutoSendWaOnReceipt(Boolean(storeSettings.autoSendWhatsAppReceipt));
    setShouldAutoPrintOnReceipt(Boolean(storeSettings.autoPrintReceipt));
    setIsPaymentModalOpen(false);
    setPreferBackdatedCheckout(false);
    setIsReceiptModalOpen(true);
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
      setCart([]);

      sound.playSuccessChime();
      alert('Database berhasil dikosongkan. Seluruh data barang, transaksi, pelanggan, supplier, laporan, dan riwayat telah kembali kosong (0). Manajemen pengguna telah kembali ke standar: 1 user saja (Admin, PIN: 1234, privilege Admin).');
    } catch (err) {
      console.error('Error clearing database:', err);
      alert('Terjadi kendala saat mengosongkan database di cloud. Periksa koneksi internet Anda.');
    }
  };

  // Restore application backup data
  const handleRestoreBackup = (backup: BackupPayload) => {
    if (backup.data.products && Array.isArray(backup.data.products)) {
      setProducts(backup.data.products);
      saveBatchToFirestore('products', backup.data.products).catch(() => {});
    }
    if (backup.data.categories && Array.isArray(backup.data.categories)) {
      setCategories(backup.data.categories);
      saveBatchToFirestore('categories', backup.data.categories).catch(() => {});
    }
    if (backup.data.customers && Array.isArray(backup.data.customers)) {
      setCustomers(backup.data.customers);
      saveBatchToFirestore('customers', backup.data.customers).catch(() => {});
    }
    if (backup.data.suppliers && Array.isArray(backup.data.suppliers)) {
      setSuppliers(backup.data.suppliers);
      saveBatchToFirestore('suppliers', backup.data.suppliers).catch(() => {});
    }
    if (backup.data.transactions && Array.isArray(backup.data.transactions)) {
      setTransactions(backup.data.transactions);
      saveBatchToFirestore('transactions', backup.data.transactions).catch(() => {});
    }
    if (backup.data.attendances && Array.isArray(backup.data.attendances)) {
      setAttendances(backup.data.attendances);
      saveBatchToFirestore('attendances', backup.data.attendances).catch(() => {});
    }
    if (backup.data.stockOpnames && Array.isArray(backup.data.stockOpnames)) {
      setStockOpnames(backup.data.stockOpnames);
      saveBatchToFirestore('stock_opnames', backup.data.stockOpnames).catch(() => {});
    }
    if (backup.data.storeSettings) {
      setStoreSettings(backup.data.storeSettings);
      saveStoreSettingsToFirestore(backup.data.storeSettings).catch(() => {});
    }
    if (backup.data.users && Array.isArray(backup.data.users) && backup.data.users.length > 0) {
      setUsers(backup.data.users);
      saveBatchToFirestore('users', backup.data.users).catch(() => {});
      if (!backup.data.users.some((u) => u.id === currentUser.id)) {
        setCurrentUser(backup.data.users[0]);
      }
    }
    // Reset active cart and selected customer to prevent broken references
    setCart([]);
    setSelectedCustomer(null);
    setRequestedPoints(0);
    setHasManualPointOverride(false);
    setSpecialPriceNotice(null);
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
  };

  const handleUpdateProduct = (updated: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    saveDocumentToFirestore('products', updated.id, updated).catch((err) => {
      console.error('[FirebaseSync] Failed to update product in Firestore:', err);
    });
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

  const handleUpdateStock = (productId: string, newStock: number) => {
    const finalStock = Math.max(0, newStock);
    const updatedProducts = products.map((p) =>
      p.id === productId ? { ...p, stockInBaseUnit: finalStock } : p
    );
    setProducts(updatedProducts);
    const targetProd = updatedProducts.find((p) => p.id === productId);
    if (targetProd) {
      saveDocumentToFirestore('products', productId, targetProd).catch(() => {});
    }
  };

  const handleBulkUpdateStock = (
    adjustments: { productId: string; newStock: number }[],
    sessionRecord: StockOpnameRecord
  ) => {
    const adjMap = new Map(adjustments.map((a) => [a.productId, a.newStock]));
    const changedProducts: Product[] = [];
    const updatedProducts = products.map((p) => {
      const newStockVal = adjMap.get(p.id);
      if (newStockVal !== undefined) {
        const nextProd = { ...p, stockInBaseUnit: Math.max(0, newStockVal) };
        changedProducts.push(nextProd);
        return nextProd;
      }
      return p;
    });
    setProducts(updatedProducts);
    setStockOpnames((prev) => [sessionRecord, ...prev]);

    // Sync ONLY adjusted products & audit record to Firestore
    if (changedProducts.length > 0) {
      saveBatchToFirestore('products', changedProducts).catch(() => {});
    }
    saveDocumentToFirestore('stock_opnames', sessionRecord.id, sessionRecord).catch(() => {});
  };

  const handleUpdateStoreSettings = (newSettings: StoreSettings) => {
    const isOffline = Boolean(newSettings.manualOfflineMode);
    setCloudSyncPaused(isOffline);
    setStoreSettings(newSettings);
    saveStorage('kasir_settings', newSettings);
    if (isOffline) {
      pauseFirestoreCloudSync().catch(() => {});
      setCloudSyncStatus('OFFLINE');
    } else {
      resumeFirestoreCloudSync()
        .then(() => saveStoreSettingsToFirestore(newSettings))
        .catch(() => {});
    }
  };

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

    setTransactions((prev) => [newTransaction, ...prev]);
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
    setOnlineOrders((prev) => prev.map((o) => (o.id === order.id ? completedOrder : o)));
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
        cloudSyncStatus={cloudSyncStatus === 'SYNCED' ? 'SYNCED' : cloudSyncStatus === 'CONNECTING' ? 'CONNECTING' : 'OFFLINE'}
      />

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col overflow-hidden ${activeTab === 'pos' ? 'min-h-0' : ''}`}>
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
            stockOpnames={stockOpnames}
            storeSettings={storeSettings}
            transactions={transactions}
            onUpdateStock={handleUpdateStock}
            onBulkUpdateStock={handleBulkUpdateStock}
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
            onUpdateTransaction={handleUpdateTransaction}
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
            onAddCashflow={handleAddCashflow}
            onUpdateCashflow={handleUpdateCashflow}
            onDeleteCashflow={handleDeleteCashflow}
            currentUser={currentUser}
            storeName={storeSettings.storeName}
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

        {activeTab === 'monthly-sales' && (
          <MonthlySalesReportView
            transactions={transactions}
            products={products}
            categories={categories}
            currentUserRole={currentUser.role}
            storeName={storeSettings.storeName}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            storeSettings={storeSettings}
            users={users}
            products={products}
            categories={categories}
            customers={customers}
            suppliers={suppliers}
            transactions={transactions}
            attendances={attendances}
            stockOpnames={stockOpnames}
            onUpdateStoreSettings={handleUpdateStoreSettings}
            onUpdateUsers={handleUpdateUsers}
            onResetToDemoData={handleResetToDemoData}
            onClearDatabaseExceptUsers={handleClearDatabaseExceptUsers}
            onRestoreBackup={handleRestoreBackup}
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
    </div>
  );
}
