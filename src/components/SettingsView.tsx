import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Settings, 
  Store, 
  Sparkles, 
  CreditCard, 
  Users, 
  ShieldCheck, 
  Briefcase, 
  UserCheck, 
  Save, 
  Plus, 
  Trash2, 
  Lock,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  Check,
  Eye,
  Download,
  Database,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FolderArchive,
  X,
  Award,
  Clock,
  Calendar,
  RefreshCw,
  Receipt,
  QrCode,
  Banknote,
  ArrowRightLeft,
  Edit3,
  ZoomIn,
  ImagePlus,
  ExternalLink,
  Target,
  MessageCircle,
  Link2,
  Send,
  TrendingUp,
  Printer,
  Bluetooth,
  Usb,
  Loader2,
  Sliders,
  Cloud,
  CloudOff,
  Phone,
  BellRing,
  StickyNote,
  Globe,
  Layers,
  Search,
  Activity,
  Server,
  Wifi,
  WifiOff
} from 'lucide-react';
import { 
  StoreSettings, 
  User, 
  UserRole, 
  Product, 
  ProductCategory,
  Customer, 
  Supplier, 
  Transaction, 
  BackupPayload,
  AttendanceRecord,
  StockOpnameRecord,
  CustomPaymentMethod,
  PaymentMethodType,
  CategorySalesGoal,
  LowStockReportScheduleConfig,
  LowStockScheduleFrequency,
  CashflowRecord,
  DailySalesReportScheduleConfig,
  DailySalesScheduleIntervalMode,
  RestockOrder,
  CustomerCategoryItem,
  OnlineOrder,
  EmployeeActivityLog,
  TaxRecord,
  TaxAuditLog,
  TaxAdjustment,
  BalanceSheetEntry,
} from '../types/pos';
import {
  DEFAULT_PAYMENT_METHODS,
  DEFAULT_ADMIN_USER,
  DEFAULT_WHATSAPP_RECEIPT_TEMPLATE,
} from '../utils/mockData';
import { formatRupiah, formatNumber, formatDateTime } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getCategoryColor } from '../utils/categoryColors';
import {
  isWebBluetoothSupported,
  isWebUsbSupported,
  isBluetoothAllowedByPolicy,
  isUsbAllowedByPolicy,
  isPrinterPolicyError,
  connectBluetoothDevice,
  connectUsbDevice,
  printDirectBluetooth,
  printDirectUsb,
  openRawBtPrint,
  getPrinterConnectionInfo,
  createDummyTestTransaction,
  parseReceiptFooterLines,
} from '../utils/bluetoothPrinter';
import {
  loadDailyLowStockLedger,
  resetDailyLowStockLedger,
  buildAdminLowStockWhatsAppMessage,
  buildAdminWhatsAppUrl,
  DailyLowStockHit,
  DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE,
  LOW_STOCK_WHATSAPP_PLACEHOLDERS,
  DEFAULT_LOW_STOCK_SCHEDULE,
  normalizeLowStockSchedule,
  loadScheduledLowStockDispatch,
  resetScheduledLowStockDispatch,
  getNextScheduledDispatchInfo,
  formatScheduleSummaryLabel,
  collectLowStockHitsFromProducts,
  buildScheduledLowStockWhatsAppMessage,
} from '../utils/adminLowStockAlert';
import {
  DEFAULT_DAILY_SALES_SCHEDULE,
  normalizeDailySalesSchedule,
  loadScheduledDailySalesDispatch,
  resetScheduledDailySalesDispatch,
  getNextDailySalesDispatchInfo,
  formatDailySalesScheduleSummaryLabel,
  computeTodaySalesClosingSummary,
  buildDailySalesClosingWhatsAppMessage,
} from '../utils/adminDailySalesAlert';
import {
  FirestoreConnectionLogEntry,
  FirestoreVerificationResult,
  getFirestoreConnectionLogs,
  clearFirestoreConnectionLogs,
  subscribeFirestoreConnectionLogs,
  verifyFirestoreServerConnection,
} from '../utils/firebaseSync';
import { GoogleDriveBackupPanel } from './GoogleDriveBackupPanel';
import { buildFullBackupPayload as createFullBackupPayload } from '../utils/backupPayload';
import { firebaseProjectId, firebaseDatabaseId } from '../firebase';

const PRESET_LOGOS = [
  {
    id: 'supermarket',
    name: 'Toko Berkah (Supermarket)',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 50" width="160" height="50"><rect x="2" y="2" width="156" height="46" rx="8" fill="none" stroke="black" stroke-width="2.5"/><path d="M14 16 L24 16 L28 32 L40 32 L42 22 L22 22" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="29" cy="35" r="2" fill="black"/><circle cx="39" cy="35" r="2" fill="black"/><text x="48" y="24" font-family="sans-serif" font-weight="900" font-size="13" fill="black" letter-spacing="1">BERKAH JAYA</text><text x="48" y="36" font-family="sans-serif" font-weight="600" font-size="8.5" fill="black" letter-spacing="2">SUPERMARKET</text></svg>',
  },
  {
    id: 'mart',
    name: 'Mart Minimalis (Emblem Keranjang)',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 50" width="160" height="50"><circle cx="26" cy="25" r="18" fill="black"/><path d="M17 19 L21 19 L24 29 L32 29 L34 22 L19 22" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/><circle cx="25" cy="31" r="1.5" fill="white"/><circle cx="31" cy="31" r="1.5" fill="white"/><text x="52" y="24" font-family="sans-serif" font-weight="900" font-size="13" fill="black" letter-spacing="1.5">TOKO KITA</text><text x="52" y="36" font-family="sans-serif" font-weight="600" font-size="8.5" fill="black" letter-spacing="2">GROSIR &amp; RETAIL</text></svg>',
  },
  {
    id: 'coffee',
    name: 'Coffee & Snack (Badge Kafe)',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 50" width="160" height="50"><rect x="3" y="3" width="154" height="44" rx="4" fill="none" stroke="black" stroke-width="2"/><path d="M18 18 H32 V27 C32 30 29 32 25 32 C21 32 18 30 18 27 Z" fill="none" stroke="black" stroke-width="2"/><path d="M32 20 H35 C36 20 37 21 37 22 V23 C37 24 36 25 35 25 H32" fill="none" stroke="black" stroke-width="1.8"/><line x1="16" y1="35" x2="34" y2="35" stroke="black" stroke-width="2"/><text x="46" y="24" font-family="sans-serif" font-weight="900" font-size="12" fill="black" letter-spacing="1">WARUNG KOPI</text><text x="46" y="36" font-family="sans-serif" font-weight="600" font-size="8.5" fill="black" letter-spacing="1.5">&amp; SNACK CORNER</text></svg>',
  },
];

interface SettingsViewProps {
  storeSettings: StoreSettings;
  users: User[];
  products: Product[];
  categories?: ProductCategory[];
  customerCategories?: CustomerCategoryItem[];
  customers: Customer[];
  suppliers: Supplier[];
  purchases?: RestockOrder[];
  transactions: Transaction[];
  cashflows?: CashflowRecord[];
  attendances?: AttendanceRecord[];
  stockOpnames?: StockOpnameRecord[];
  onlineOrders?: OnlineOrder[];
  activityLogs?: EmployeeActivityLog[];
  taxRecords?: TaxRecord[];
  taxAuditLogs?: TaxAuditLog[];
  taxAdjustments?: TaxAdjustment[];
  balanceSheetEntries?: BalanceSheetEntry[];
  currentUserRole?: UserRole;
  currentUserName?: string;
  onUpdateStoreSettings: (settings: StoreSettings) => void;
  onUpdateUsers: (users: User[]) => void;
  onResetToDemoData: () => void;
  onRestoreBackup: (backup: BackupPayload) => Promise<void> | void;
  onClearDatabaseExceptUsers?: () => Promise<void> | void;
  cloudSyncStatus?: 'SYNCED' | 'CONNECTING' | 'OFFLINE';
  cloudSyncError?: string | null;
  pendingSyncQueueCount?: number;
  offlineQueueCount?: number;
  onOpenOfflineQueueModal?: () => void;
  focusFirestoreSettingsNonce?: number;
  onForceVerifyCloudSync?: () => Promise<FirestoreVerificationResult>;
  onOpenSyncHealth?: () => void;
  onOpenSyncLogs?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  storeSettings,
  users,
  products,
  categories = [],
  customerCategories = [],
  customers,
  suppliers,
  purchases = [],
  transactions,
  cashflows = [],
  attendances = [],
  stockOpnames = [],
  onlineOrders = [],
  activityLogs = [],
  taxRecords = [],
  taxAuditLogs = [],
  taxAdjustments = [],
  balanceSheetEntries = [],
  currentUserRole = 'ADMIN',
  currentUserName = 'Admin',
  onUpdateStoreSettings,
  onUpdateUsers,
  onResetToDemoData,
  onRestoreBackup,
  onClearDatabaseExceptUsers,
  cloudSyncStatus = 'SYNCED',
  cloudSyncError = null,
  pendingSyncQueueCount = 0,
  offlineQueueCount = 0,
  onOpenOfflineQueueModal,
  focusFirestoreSettingsNonce = 0,
  onForceVerifyCloudSync,
  onOpenSyncHealth,
  onOpenSyncLogs,
}) => {
  const isAdminUser = currentUserRole === 'ADMIN';
  const [formSettings, setFormSettings] = useState<StoreSettings>({
    ...storeSettings,
    dailySalesGoal: storeSettings.dailySalesGoal ?? 5000000,
    weeklySalesGoal: storeSettings.weeklySalesGoal ?? 30000000,
    monthlySalesGoal: storeSettings.monthlySalesGoal ?? 120000000,
    categorySalesGoals: storeSettings.categorySalesGoals ?? {},
    autoSendWhatsAppReceipt: storeSettings.autoSendWhatsAppReceipt ?? false,
    includeReceiptSummaryInAutoWa: storeSettings.includeReceiptSummaryInAutoWa ?? true,
    includeLoyaltyPointsInAutoWa: storeSettings.includeLoyaltyPointsInAutoWa ?? true,
    useCustomWhatsAppTemplate: storeSettings.useCustomWhatsAppTemplate ?? false,
    customWhatsAppTemplate: storeSettings.customWhatsAppTemplate || DEFAULT_WHATSAPP_RECEIPT_TEMPLATE,
    autoAdminLowStockWhatsApp: storeSettings.autoAdminLowStockWhatsApp ?? true,
    adminWhatsAppNumber: storeSettings.adminWhatsAppNumber || '',
    adminLowStockTriggerCount: storeSettings.adminLowStockTriggerCount ?? 2,
    useCustomLowStockWhatsAppTemplate: storeSettings.useCustomLowStockWhatsAppTemplate ?? false,
    customLowStockWhatsAppTemplate:
      storeSettings.customLowStockWhatsAppTemplate || DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE,
    scheduledAdminLowStockWhatsApp: normalizeLowStockSchedule(
      storeSettings.scheduledAdminLowStockWhatsApp || DEFAULT_LOW_STOCK_SCHEDULE
    ),
    scheduledDailySalesReportWhatsApp: normalizeDailySalesSchedule(
      storeSettings.scheduledDailySalesReportWhatsApp || DEFAULT_DAILY_SALES_SCHEDULE
    ),
    printerConnectionType: storeSettings.printerConnectionType || 'BLUETOOTH',
    printerPaperWidth: storeSettings.printerPaperWidth || '58mm',
    printerDeviceName: storeSettings.printerDeviceName || '',
    printerAutoCut: storeSettings.printerAutoCut ?? true,
    autoPrintReceipt: storeSettings.autoPrintReceipt ?? false,
    pointsPerSpend: storeSettings.pointsPerSpend !== undefined ? storeSettings.pointsPerSpend : 1,
    autoApplyMaxPoints: storeSettings.autoApplyMaxPoints ?? false,
    requireTransactionNote: storeSettings.requireTransactionNote ?? false,
    onlineStoreEnabled: storeSettings.onlineStoreEnabled ?? true,
    onlineStoreTagline:
      storeSettings.onlineStoreTagline ||
      'Belanja kebutuhan harian & layanan toko lebih praktis, stok langsung terhubung ke kasir.',
    onlineStoreHours: storeSettings.onlineStoreHours || '08:00 - 21:00 WIB',
    onlineStoreDeliveryFee: storeSettings.onlineStoreDeliveryFee ?? 10000,
    onlineStoreMinFreeDelivery: storeSettings.onlineStoreMinFreeDelivery ?? 100000,
    onlineStorePickupEnabled: storeSettings.onlineStorePickupEnabled ?? true,
    onlineStoreDeliveryEnabled: storeSettings.onlineStoreDeliveryEnabled ?? true,
  });

  // Firestore Connection Diagnostics & Logs state
  const [firestoreLogs, setFirestoreLogs] = useState<FirestoreConnectionLogEntry[]>(() =>
    getFirestoreConnectionLogs()
  );
  const [isVerifyingFirestore, setIsVerifyingFirestore] = useState(false);
  const [lastVerificationResult, setLastVerificationResult] = useState<FirestoreVerificationResult | null>(null);
  const [showFirestoreLogs, setShowFirestoreLogs] = useState(true);
  const [isFirestoreHighlighted, setIsFirestoreHighlighted] = useState(false);
  const firestoreDiagnosticsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return subscribeFirestoreConnectionLogs((logs) => {
      setFirestoreLogs(logs);
    });
  }, []);

  useEffect(() => {
    if (focusFirestoreSettingsNonce > 0) {
      const timer = setTimeout(() => {
        firestoreDiagnosticsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setIsFirestoreHighlighted(true);
      }, 120);
      const clearHighlightTimer = setTimeout(() => {
        setIsFirestoreHighlighted(false);
      }, 2400);
      return () => {
        clearTimeout(timer);
        clearTimeout(clearHighlightTimer);
      };
    }
  }, [focusFirestoreSettingsNonce]);

  const latestSuccessLog = useMemo(
    () => firestoreLogs.find((l) => l.status === 'SUCCESS') || null,
    [firestoreLogs]
  );

  const latestErrorLog = useMemo(
    () => firestoreLogs.find((l) => l.status === 'ERROR') || null,
    [firestoreLogs]
  );

  const formatLogTimestamp = (ts: number) => {
    try {
      return new Date(ts).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return formatDateTime(ts);
    }
  };

  const handleForceSyncNow = async () => {
    sound.playTap();
    if (isVerifyingFirestore) return;
    setIsVerifyingFirestore(true);
    if (formSettings.manualOfflineMode) {
      setFormSettings((prev) => ({ ...prev, manualOfflineMode: false }));
    }
    try {
      const result = onForceVerifyCloudSync
        ? await onForceVerifyCloudSync()
        : await verifyFirestoreServerConnection({
            forceResumeNetwork: true,
            flushPendingQueue: true,
            operationLabel: 'FORCE SYNC NOW',
          });
      setLastVerificationResult(result);
    } finally {
      setIsVerifyingFirestore(false);
    }
  };

  const [dailyLowStockLedger, setDailyLowStockLedger] = useState(() => loadDailyLowStockLedger());
  const [scheduledDispatchState, setScheduledDispatchState] = useState(() =>
    loadScheduledLowStockDispatch()
  );
  const [scheduledDailySalesDispatchState, setScheduledDailySalesDispatchState] = useState(() =>
    loadScheduledDailySalesDispatch()
  );
  const [lowStockPreviewTab, setLowStockPreviewTab] = useState<'THRESHOLD' | 'SCHEDULED'>(
    storeSettings.scheduledAdminLowStockWhatsApp?.enabled ? 'SCHEDULED' : 'THRESHOLD'
  );
  const [userList, setUserList] = useState<User[]>([...users]);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isClearDbModalOpen, setIsClearDbModalOpen] = useState(false);
  const [isClearingDb, setIsClearingDb] = useState(false);
  const [categoryGoalSearch, setCategoryGoalSearch] = useState('');

  // Discover all product categories across registered categories, products, and saved category targets
  const categoryGoalEntries = useMemo(() => {
    const skuCountMap = new Map<string, number>();
    const nameOrder: string[] = [];
    const seen = new Set<string>();

    const registerCategory = (rawName: string) => {
      const clean = (rawName || '').trim();
      if (!clean || seen.has(clean)) return;
      seen.add(clean);
      nameOrder.push(clean);
    };

    categories.forEach((c) => registerCategory(c.name));
    products.forEach((p) => {
      const catName = (p.category || 'Umum').trim() || 'Umum';
      registerCategory(catName);
      skuCountMap.set(catName, (skuCountMap.get(catName) || 0) + 1);
    });
    Object.keys(formSettings.categorySalesGoals || {}).forEach((k) => registerCategory(k));

    const currentMap = formSettings.categorySalesGoals || {};
    return nameOrder.map((name) => {
      const goal = currentMap[name] || { daily: 0, weekly: 0, monthly: 0 };
      return {
        name,
        color: getCategoryColor(name, categories),
        skuCount: skuCountMap.get(name) || 0,
        daily: Math.max(0, Number(goal.daily) || 0),
        weekly: Math.max(0, Number(goal.weekly) || 0),
        monthly: Math.max(0, Number(goal.monthly) || 0),
      };
    });
  }, [categories, products, formSettings.categorySalesGoals]);

  const filteredCategoryGoalEntries = useMemo(() => {
    const q = categoryGoalSearch.trim().toLowerCase();
    if (!q) return categoryGoalEntries;
    return categoryGoalEntries.filter((c) => c.name.toLowerCase().includes(q));
  }, [categoryGoalEntries, categoryGoalSearch]);

  const categoryGoalTotals = useMemo(() => {
    let dailySum = 0;
    let weeklySum = 0;
    let monthlySum = 0;
    let configuredCount = 0;

    categoryGoalEntries.forEach((c) => {
      dailySum += c.daily;
      weeklySum += c.weekly;
      monthlySum += c.monthly;
      if (c.daily > 0 || c.weekly > 0 || c.monthly > 0) {
        configuredCount += 1;
      }
    });

    return { dailySum, weeklySum, monthlySum, configuredCount };
  }, [categoryGoalEntries]);

  const updateLowStockSchedule = (patch: Partial<LowStockReportScheduleConfig>) => {
    setFormSettings((prev) => {
      const current = normalizeLowStockSchedule(prev.scheduledAdminLowStockWhatsApp);
      return {
        ...prev,
        scheduledAdminLowStockWhatsApp: normalizeLowStockSchedule({
          ...current,
          ...patch,
        }),
      };
    });
  };

  const handleToggleScheduleDay = (dayIndex: number) => {
    sound.playTap();
    setFormSettings((prev) => {
      const current = normalizeLowStockSchedule(prev.scheduledAdminLowStockWhatsApp);
      if (current.frequency === 'WEEKLY') {
        return {
          ...prev,
          scheduledAdminLowStockWhatsApp: {
            ...current,
            daysOfWeek: [dayIndex],
          },
        };
      }
      const exists = current.daysOfWeek.includes(dayIndex);
      if (exists && current.daysOfWeek.length <= 1) {
        return prev; // Keep at least 1 day active
      }
      const nextDays = exists
        ? current.daysOfWeek.filter((d) => d !== dayIndex)
        : [...current.daysOfWeek, dayIndex].sort((a, b) => a - b);
      return {
        ...prev,
        scheduledAdminLowStockWhatsApp: {
          ...current,
          daysOfWeek: nextDays,
        },
      };
    });
  };

  const updateDailySalesSchedule = (patch: Partial<DailySalesReportScheduleConfig>) => {
    setFormSettings((prev) => {
      const current = normalizeDailySalesSchedule(prev.scheduledDailySalesReportWhatsApp);
      return {
        ...prev,
        scheduledDailySalesReportWhatsApp: normalizeDailySalesSchedule({
          ...current,
          ...patch,
        }),
      };
    });
  };

  const handleToggleDailySalesDay = (dayIndex: number) => {
    sound.playTap();
    setFormSettings((prev) => {
      const current = normalizeDailySalesSchedule(prev.scheduledDailySalesReportWhatsApp);
      const exists = current.daysOfWeek.includes(dayIndex);
      if (exists && current.daysOfWeek.length <= 1) {
        return prev;
      }
      const nextDays = exists
        ? current.daysOfWeek.filter((d) => d !== dayIndex)
        : [...current.daysOfWeek, dayIndex].sort((a, b) => a - b);
      return {
        ...prev,
        scheduledDailySalesReportWhatsApp: {
          ...current,
          daysOfWeek: nextDays,
        },
      };
    });
  };

  const handleUpdateCategoryGoalField = (
    categoryName: string,
    field: keyof CategorySalesGoal,
    rawValue: string
  ) => {
    const numeric = Math.max(0, parseFloat(rawValue) || 0);
    setFormSettings((prev) => {
      const prevMap = { ...(prev.categorySalesGoals || {}) };
      const existing = prevMap[categoryName] || { daily: 0, weekly: 0, monthly: 0 };
      prevMap[categoryName] = {
        ...existing,
        [field]: numeric,
      };
      return {
        ...prev,
        categorySalesGoals: prevMap,
      };
    });
  };

  const handleSyncCategoryWeeklyMonthly = (categoryName: string) => {
    sound.playTap();
    setFormSettings((prev) => {
      const prevMap = { ...(prev.categorySalesGoals || {}) };
      const existing = prevMap[categoryName] || { daily: 0, weekly: 0, monthly: 0 };
      const count = Math.max(1, categoryGoalEntries.length);
      const fallbackDaily = Math.max(
        50000,
        Math.round((prev.dailySalesGoal || 5000000) / count / 10000) * 10000
      );
      const baseDaily = existing.daily > 0 ? existing.daily : fallbackDaily;
      prevMap[categoryName] = {
        daily: baseDaily,
        weekly: baseDaily * 7,
        monthly: baseDaily * 30,
      };
      return {
        ...prev,
        categorySalesGoals: prevMap,
      };
    });
  };

  const handleClearSingleCategoryGoal = (categoryName: string) => {
    sound.playTap();
    setFormSettings((prev) => {
      const prevMap = { ...(prev.categorySalesGoals || {}) };
      delete prevMap[categoryName];
      return {
        ...prev,
        categorySalesGoals: prevMap,
      };
    });
  };

  const handleDistributeStoreGoalsByCategory = () => {
    if (categoryGoalEntries.length === 0) return;
    sound.playTap();
    const count = categoryGoalEntries.length;
    const round10k = (val: number) => Math.max(10000, Math.round(val / 10000) * 10000);
    const eachDaily = round10k((formSettings.dailySalesGoal || 5000000) / count);
    const eachWeekly = round10k((formSettings.weeklySalesGoal || 30000000) / count);
    const eachMonthly = round10k((formSettings.monthlySalesGoal || 120000000) / count);

    const nextMap: Record<string, CategorySalesGoal> = {};
    categoryGoalEntries.forEach((cat) => {
      nextMap[cat.name] = {
        daily: eachDaily,
        weekly: eachWeekly,
        monthly: eachMonthly,
      };
    });

    setFormSettings((prev) => ({
      ...prev,
      categorySalesGoals: nextMap,
    }));
  };

  const handleResetAllCategoryGoals = () => {
    sound.playTap();
    setFormSettings((prev) => ({
      ...prev,
      categorySalesGoals: {},
    }));
  };

  // Printer connection & Test Print states
  const [isPairingPrinter, setIsPairingPrinter] = useState(false);
  const [isTestingPrint, setIsTestingPrint] = useState(false);
  const [printerFeedback, setPrinterFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
    showOpenFullTab?: boolean;
  } | null>(null);
  const [testPrintCaptureTx, setTestPrintCaptureTx] = useState<Transaction | null>(null);
  const [livePrinterInfo, setLivePrinterInfo] = useState(() => getPrinterConnectionInfo());
  const waTemplateTextareaRef = useRef<HTMLTextAreaElement>(null);
  const lowStockWaTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bluetoothPolicyAllowed = isBluetoothAllowedByPolicy();
  const usbPolicyAllowed = isUsbAllowedByPolicy();

  // Sync userList whenever users prop changes (e.g. database cleared or synced from cloud)
  useEffect(() => {
    setUserList([...users]);
  }, [users]);

  // Backup & Restore state
  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [importCandidate, setImportCandidate] = useState<BackupPayload | null>(null);
  const [restoreUsersOption, setRestoreUsersOption] = useState<boolean>(true);
  const [isRestoringBackup, setIsRestoringBackup] = useState<boolean>(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Custom Payment Methods & Static QRIS JPG state
  const [paymentMethods, setPaymentMethods] = useState<CustomPaymentMethod[]>(() => {
    return formSettings.customPaymentMethods && formSettings.customPaymentMethods.length > 0
      ? formSettings.customPaymentMethods
      : DEFAULT_PAYMENT_METHODS;
  });

  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  const [editingMethodId, setEditingMethodId] = useState<string | null>(null);
  const [methodName, setMethodName] = useState('');
  const [methodType, setMethodType] = useState<PaymentMethodType>('QRIS');
  const [methodIsActive, setMethodIsActive] = useState(true);
  const [methodAccountNumber, setMethodAccountNumber] = useState('');
  const [methodAccountName, setMethodAccountName] = useState('');
  const [methodDescription, setMethodDescription] = useState('');
  const [qrisDataUrl, setQrisDataUrl] = useState<string>('');
  const [qrisFileName, setQrisFileName] = useState<string>('');
  const [qrisUploadError, setQrisUploadError] = useState<string | null>(null);
  const [previewZoomImage, setPreviewZoomImage] = useState<{ url: string; title: string } | null>(null);
  const qrisFileInputRef = useRef<HTMLInputElement>(null);

  // Upload handler for Static QRIS JPG
  const handleQrisJpgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setQrisUploadError(null);

    // Validate strictly JPG / JPEG format as requested:
    // "jika penambahan pembayaran di pilih qris maka tambahkan kolom untuk upload file JPG Qris statis"
    const isJpg = file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg');
    if (!isJpg) {
      sound.playError();
      setQrisUploadError('Hanya file format JPG/JPEG (.jpg atau .jpeg) yang dapat diunggah untuk QRIS statis!');
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      sound.playError();
      setQrisUploadError('Ukuran file JPG maksimal 5MB.');
      e.target.value = '';
      return;
    }

    sound.playTap();
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // High quality canvas compression to ensure optimal crispness and snappy persistence
        const canvas = document.createElement('canvas');
        const MAX_DIM = 900;
        let w = img.width;
        let h = img.height;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) {
            h = Math.round((h * MAX_DIM) / w);
            w = MAX_DIM;
          } else {
            w = Math.round((w * MAX_DIM) / h);
            h = MAX_DIM;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.88);
          setQrisDataUrl(compressed);
          setQrisFileName(file.name);
        } else {
          setQrisDataUrl(event.target?.result as string);
          setQrisFileName(file.name);
        }
      };
      img.onerror = () => {
        sound.playError();
        setQrisUploadError('File gambar JPG QRIS tidak dapat diproses.');
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      sound.playError();
      setQrisUploadError('Gagal membaca file gambar JPG.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleOpenAddMethod = () => {
    sound.playTap();
    setEditingMethodId(null);
    setMethodName('');
    setMethodType('QRIS');
    setMethodIsActive(true);
    setMethodAccountNumber('');
    setMethodAccountName(formSettings.storeName || '');
    setMethodDescription('');
    setQrisDataUrl('');
    setQrisFileName('');
    setQrisUploadError(null);
    setIsPaymentMethodModalOpen(true);
  };

  const handleOpenEditMethod = (pm: CustomPaymentMethod) => {
    sound.playTap();
    setEditingMethodId(pm.id);
    setMethodName(pm.name);
    setMethodType(pm.type);
    setMethodIsActive(pm.isActive);
    setMethodAccountNumber(pm.accountNumber || '');
    setMethodAccountName(pm.accountName || '');
    setMethodDescription(pm.description || '');
    setQrisDataUrl(pm.qrisImageUrl || '');
    setQrisFileName(pm.qrisImageName || (pm.qrisImageUrl ? 'qris-statis.jpg' : ''));
    setQrisUploadError(null);
    setIsPaymentMethodModalOpen(true);
  };

  const handleSavePaymentMethod = (e: React.FormEvent) => {
    e.preventDefault();
    if (!methodName.trim()) {
      alert('Harap isi nama jenis pembayaran!');
      return;
    }

    sound.playSuccessChime();

    let updatedList: CustomPaymentMethod[];
    if (editingMethodId) {
      updatedList = paymentMethods.map((m) => {
        if (m.id === editingMethodId) {
          return {
            ...m,
            name: methodName.trim(),
            type: methodType,
            isActive: methodIsActive,
            accountNumber: methodAccountNumber.trim() || undefined,
            accountName: methodAccountName.trim() || undefined,
            description: methodDescription.trim() || undefined,
            qrisImageUrl: methodType === 'QRIS' ? (qrisDataUrl || undefined) : undefined,
            qrisImageName: methodType === 'QRIS' ? (qrisFileName || undefined) : undefined,
          };
        }
        return m;
      });
    } else {
      const newMethod: CustomPaymentMethod = {
        id: 'pm_' + Date.now(),
        name: methodName.trim(),
        type: methodType,
        isActive: methodIsActive,
        accountNumber: methodAccountNumber.trim() || undefined,
        accountName: methodAccountName.trim() || undefined,
        description: methodDescription.trim() || undefined,
        qrisImageUrl: methodType === 'QRIS' ? (qrisDataUrl || undefined) : undefined,
        qrisImageName: methodType === 'QRIS' ? (qrisFileName || undefined) : undefined,
        createdAt: new Date().toISOString(),
      };
      updatedList = [...paymentMethods, newMethod];
    }

    setPaymentMethods(updatedList);
    const updatedSettings = {
      ...formSettings,
      customPaymentMethods: updatedList,
    };
    setFormSettings(updatedSettings);
    onUpdateStoreSettings(updatedSettings);
    setIsPaymentMethodModalOpen(false);
  };

  const handleTogglePaymentMethod = (id: string) => {
    sound.playTap();
    const updatedList = paymentMethods.map((m) =>
      m.id === id ? { ...m, isActive: !m.isActive } : m
    );
    setPaymentMethods(updatedList);
    const updatedSettings = {
      ...formSettings,
      customPaymentMethods: updatedList,
    };
    setFormSettings(updatedSettings);
    onUpdateStoreSettings(updatedSettings);
  };

  const handleDeletePaymentMethod = (id: string) => {
    if (paymentMethods.length <= 1) {
      alert('Minimal harus ada 1 metode pembayaran yang tersimpan di sistem!');
      return;
    }
    const target = paymentMethods.find((m) => m.id === id);
    if (!confirm(`Hapus metode pembayaran "${target?.name || ''}"?`)) return;

    sound.playTap();
    const updatedList = paymentMethods.filter((m) => m.id !== id);
    setPaymentMethods(updatedList);
    const updatedSettings = {
      ...formSettings,
      customPaymentMethods: updatedList,
    };
    setFormSettings(updatedSettings);
    onUpdateStoreSettings(updatedSettings);
  };

  // New user form states
  const [newUserName, setNewUserName] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('KARYAWAN');

  // Logo file upload ref & handler
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploadError(null);

    if (file.size > 2 * 1024 * 1024) {
      setLogoUploadError('Ukuran file maksimal 2MB untuk performa cetak & sinkronisasi optimal.');
      e.target.value = '';
      return;
    }

    sound.playTap();
    const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (!result) return;

      if (isSvg) {
        if (result.length > 450000) {
          setLogoUploadError('File SVG terlalu kompleks (>450KB). Mohon sederhanakan atau unggah PNG/JPG.');
          return;
        }
        setFormSettings((prev) => ({
          ...prev,
          storeLogo: result,
          showLogoOnReceipt: true,
        }));
        return;
      }

      if (result.length <= 350000) {
        setFormSettings((prev) => ({
          ...prev,
          storeLogo: result,
          showLogoOnReceipt: true,
        }));
        return;
      }

      // Automatically resize & compress large raster logos to keep Firestore sync fast & compliant
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 480;
          let targetW = img.width || maxDim;
          let targetH = img.height || maxDim;
          if (targetW > maxDim || targetH > maxDim) {
            const ratio = Math.min(maxDim / targetW, maxDim / targetH);
            targetW = Math.max(1, Math.round(targetW * ratio));
            targetH = Math.max(1, Math.round(targetH * ratio));
          }
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            setLogoUploadError('Browser gagal memproses kompresi gambar logo.');
            return;
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);
          let compressed = canvas.toDataURL('image/png');
          if (compressed.length > 400000) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetW, targetH);
            ctx.drawImage(img, 0, 0, targetW, targetH);
            compressed = canvas.toDataURL('image/jpeg', 0.85);
          }
          if (compressed.length > 480000) {
            compressed = canvas.toDataURL('image/jpeg', 0.65);
          }
          setFormSettings((prev) => ({
            ...prev,
            storeLogo: compressed,
            showLogoOnReceipt: true,
          }));
        } catch {
          setLogoUploadError('Gagal memproses gambar logo. Gunakan gambar dengan ukuran lebih kecil.');
        }
      };
      img.onerror = () => {
        setLogoUploadError('Format file gambar logo tidak dapat dibaca.');
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be re-selected if desired
    e.target.value = '';
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playSuccessChime();
    const sanitizedCategoryGoals: Record<string, CategorySalesGoal> = {};
    Object.entries(formSettings.categorySalesGoals || {}).forEach(([catName, goal]) => {
      const cleanName = catName.trim();
      if (!cleanName || !goal) return;
      const daily = Math.max(0, Number(goal.daily) || 0);
      const weekly = Math.max(0, Number(goal.weekly) || 0);
      const monthly = Math.max(0, Number(goal.monthly) || 0);
      if (daily > 0 || weekly > 0 || monthly > 0) {
        sanitizedCategoryGoals[cleanName] = { daily, weekly, monthly };
      }
    });

    const settingsToSave: StoreSettings = {
      ...formSettings,
      dailySalesGoal: formSettings.dailySalesGoal && formSettings.dailySalesGoal > 0 ? formSettings.dailySalesGoal : 5000000,
      weeklySalesGoal: formSettings.weeklySalesGoal && formSettings.weeklySalesGoal > 0 ? formSettings.weeklySalesGoal : 30000000,
      monthlySalesGoal: formSettings.monthlySalesGoal && formSettings.monthlySalesGoal > 0 ? formSettings.monthlySalesGoal : 120000000,
      categorySalesGoals: sanitizedCategoryGoals,
      autoSendWhatsAppReceipt: formSettings.autoSendWhatsAppReceipt ?? false,
      includeReceiptSummaryInAutoWa: formSettings.includeReceiptSummaryInAutoWa ?? true,
      includeLoyaltyPointsInAutoWa: formSettings.includeLoyaltyPointsInAutoWa ?? true,
      useCustomWhatsAppTemplate: formSettings.useCustomWhatsAppTemplate ?? false,
      customWhatsAppTemplate:
        formSettings.customWhatsAppTemplate?.trim() || DEFAULT_WHATSAPP_RECEIPT_TEMPLATE,
      autoAdminLowStockWhatsApp: formSettings.autoAdminLowStockWhatsApp ?? true,
      adminWhatsAppNumber: formSettings.adminWhatsAppNumber?.trim() || '',
      adminLowStockTriggerCount: Math.max(
        2,
        Math.floor(Number(formSettings.adminLowStockTriggerCount) || 2)
      ),
      useCustomLowStockWhatsAppTemplate: formSettings.useCustomLowStockWhatsAppTemplate ?? false,
      customLowStockWhatsAppTemplate:
        formSettings.customLowStockWhatsAppTemplate?.trim() || DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE,
      scheduledAdminLowStockWhatsApp: normalizeLowStockSchedule(
        formSettings.scheduledAdminLowStockWhatsApp
      ),
      scheduledDailySalesReportWhatsApp: normalizeDailySalesSchedule(
        formSettings.scheduledDailySalesReportWhatsApp
      ),
      printerConnectionType: formSettings.printerConnectionType || 'BLUETOOTH',
      printerPaperWidth: formSettings.printerPaperWidth || '58mm',
      printerDeviceName: formSettings.printerDeviceName?.trim() || '',
      printerAutoCut: formSettings.printerAutoCut ?? true,
      autoPrintReceipt: formSettings.autoPrintReceipt ?? false,
      pointsPerSpend: formSettings.pointsPerSpend !== undefined ? formSettings.pointsPerSpend : 1,
      autoApplyMaxPoints: formSettings.autoApplyMaxPoints ?? false,
      requireTransactionNote: formSettings.requireTransactionNote ?? false,
      onlineStoreEnabled: formSettings.onlineStoreEnabled ?? true,
      onlineStoreTagline:
        formSettings.onlineStoreTagline?.trim() ||
        'Belanja kebutuhan harian & layanan toko lebih praktis, stok langsung terhubung ke kasir.',
      onlineStoreHours: formSettings.onlineStoreHours?.trim() || '08:00 - 21:00 WIB',
      onlineStoreDeliveryFee: Math.max(0, Number(formSettings.onlineStoreDeliveryFee ?? 10000)),
      onlineStoreMinFreeDelivery: Math.max(0, Number(formSettings.onlineStoreMinFreeDelivery ?? 100000)),
      onlineStorePickupEnabled: formSettings.onlineStorePickupEnabled ?? true,
      onlineStoreDeliveryEnabled: formSettings.onlineStoreDeliveryEnabled ?? true,
      customPaymentMethods: paymentMethods,
    };
    onUpdateStoreSettings(settingsToSave);
    onUpdateUsers(userList);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleInsertWhatsAppPlaceholder = (placeholder: string) => {
    sound.playTap();
    const current = formSettings.customWhatsAppTemplate ?? DEFAULT_WHATSAPP_RECEIPT_TEMPLATE;
    const el = waTemplateTextareaRef.current;
    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const updated = current.slice(0, start) + placeholder + current.slice(end);
      setFormSettings({ ...formSettings, customWhatsAppTemplate: updated });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    } else {
      setFormSettings({ ...formSettings, customWhatsAppTemplate: `${current}${placeholder}` });
    }
  };

  const handleInsertLowStockPlaceholder = (placeholder: string) => {
    sound.playTap();
    const current =
      formSettings.customLowStockWhatsAppTemplate ?? DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE;
    const el = lowStockWaTextareaRef.current;
    if (el && typeof el.selectionStart === 'number' && typeof el.selectionEnd === 'number') {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const updated = current.slice(0, start) + placeholder + current.slice(end);
      setFormSettings({ ...formSettings, customLowStockWhatsAppTemplate: updated });
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + placeholder.length, start + placeholder.length);
      }, 0);
    } else {
      setFormSettings({
        ...formSettings,
        customLowStockWhatsAppTemplate: `${current}${placeholder}`,
      });
    }
  };

  // =========================================================================
  // PRINTER CONNECTION & TEST PRINT HANDLERS
  // =========================================================================
  const handlePairPrinter = async () => {
    const mode = formSettings.printerConnectionType || 'BLUETOOTH';
    sound.playTap();

    if (mode === 'BLUETOOTH' && !isBluetoothAllowedByPolicy()) {
      setPrinterFeedback({
        type: 'info',
        showOpenFullTab: true,
        message:
          'Browser memblokir akses langsung Web Bluetooth karena aplikasi sedang berjalan di dalam frame preview (Permissions-Policy). Klik "Buka Tab Browser Penuh" untuk pairing Bluetooth langsung, atau gunakan RawBT / Cetak Sistem pada Android/PC.',
      });
      return;
    }

    if (mode === 'USB' && !isUsbAllowedByPolicy()) {
      setPrinterFeedback({
        type: 'info',
        showOpenFullTab: true,
        message:
          'Browser memblokir akses langsung WebUSB karena aplikasi sedang berjalan di dalam frame preview (Permissions-Policy). Klik "Buka Tab Browser Penuh" untuk koneksi WebUSB langsung, atau cetak via Driver USB OS.',
      });
      return;
    }

    setIsPairingPrinter(true);
    setPrinterFeedback({
      type: 'info',
      message:
        mode === 'BLUETOOTH'
          ? 'Memindai perangkat printer Bluetooth...'
          : 'Membuka pemilih perangkat printer USB...',
    });

    try {
      const result =
        mode === 'BLUETOOTH' ? await connectBluetoothDevice() : await connectUsbDevice();
      setFormSettings((prev) => ({ ...prev, printerDeviceName: result.name }));
      setLivePrinterInfo(getPrinterConnectionInfo());
      sound.playSuccessChime();
      setPrinterFeedback({
        type: 'success',
        message: `Printer ${mode} "${result.name}" berhasil terhubung dan siap digunakan!`,
      });
    } catch (err: any) {
      if (err?.name === 'NotFoundError' || err?.message?.includes('User cancelled')) {
        setPrinterFeedback(null);
      } else if (isPrinterPolicyError(err)) {
        setPrinterFeedback({
          type: 'info',
          showOpenFullTab: true,
          message: err.message,
        });
      } else {
        sound.playError();
        setPrinterFeedback({
          type: 'error',
          message:
            err?.message ||
            (mode === 'BLUETOOTH'
              ? 'Gagal menghubungkan printer Bluetooth. Pastikan Bluetooth aktif atau gunakan RawBT.'
              : 'Gagal menghubungkan WebUSB. Pastikan kabel USB/OTG terpasang atau gunakan Driver USB Sistem.'),
        });
      }
    } finally {
      setIsPairingPrinter(false);
    }
  };

  const handleTestPrint = async () => {
    const mode = formSettings.printerConnectionType || 'BLUETOOTH';
    const paperWidth = formSettings.printerPaperWidth || '58mm';
    const dummyTx = createDummyTestTransaction(formSettings);

    sound.playTap();
    setTestPrintCaptureTx(dummyTx);

    if (mode === 'BLUETOOTH' && !isBluetoothAllowedByPolicy()) {
      sound.playSuccessChime();
      setPrinterFeedback({
        type: 'info',
        showOpenFullTab: true,
        message: `Dummy receipt capture (${paperWidth}) berhasil dibuat! Koneksi Web Bluetooth langsung dibatasi di dalam frame preview — uji cetak melalui tombol "Test via RawBT" / "Cetak Driver Sistem" di bawah, atau buka di Tab Browser Penuh.`,
      });
      return;
    }

    if (mode === 'USB' && !isUsbAllowedByPolicy()) {
      sound.playSuccessChime();
      setPrinterFeedback({
        type: 'info',
        showOpenFullTab: true,
        message: `Dummy receipt capture (${paperWidth}) berhasil dibuat! Koneksi WebUSB langsung dibatasi di dalam frame preview — klik "Cetak Driver Sistem" pada pratinjau di bawah atau buka di Tab Browser Penuh.`,
      });
      return;
    }

    setIsTestingPrint(true);
    setPrinterFeedback({
      type: 'info',
      message: `Menyiapkan Test Print (${mode} • ${paperWidth}) & menangkap pratinjau struk...`,
    });

    try {
      if (mode === 'BLUETOOTH') {
        if (isWebBluetoothSupported()) {
          await printDirectBluetooth(dummyTx, formSettings, paperWidth);
          setLivePrinterInfo(getPrinterConnectionInfo());
          sound.playSuccessChime();
          setPrinterFeedback({
            type: 'success',
            message: `Test Print Bluetooth (${paperWidth}) berhasil dikirim ke printer!`,
          });
        } else {
          setPrinterFeedback({
            type: 'info',
            message: `Dummy receipt (${paperWidth}) berhasil dibuat! Browser ini tidak mendukung Web Bluetooth — gunakan tombol RawBT atau Cetak Driver Sistem pada pratinjau di bawah.`,
          });
        }
      } else {
        if (isWebUsbSupported()) {
          await printDirectUsb(dummyTx, formSettings, paperWidth);
          setLivePrinterInfo(getPrinterConnectionInfo());
          sound.playSuccessChime();
          setPrinterFeedback({
            type: 'success',
            message: `Test Print USB Direct (${paperWidth}) berhasil dikirim ke printer!`,
          });
        } else {
          setPrinterFeedback({
            type: 'info',
            message: `Dummy receipt (${paperWidth}) berhasil dibuat! Browser ini memakai mode Driver USB OS — klik "Cetak Driver Sistem" pada pratinjau di bawah.`,
          });
        }
      }
    } catch (err: any) {
      if (err?.name === 'NotFoundError' || err?.message?.includes('User cancelled')) {
        setPrinterFeedback({
          type: 'info',
          message: `Pratinjau Test Print (${paperWidth}) siap di bawah. Pemilihan perangkat dibatalkan atau dapat dicetak via Driver Sistem.`,
        });
      } else if (isPrinterPolicyError(err)) {
        setPrinterFeedback({
          type: 'info',
          showOpenFullTab: true,
          message: `${err.message} Pratinjau dummy receipt tetap ditampilkan di bawah.`,
        });
      } else {
        setPrinterFeedback({
          type: 'error',
          message: `${err?.message || 'Koneksi hardware gagal.'} Pratinjau dummy struk tetap ditampilkan di bawah untuk verifikasi tata letak (${paperWidth}).`,
        });
      }
    } finally {
      setIsTestingPrint(false);
    }
  };

  const handleAddUser = () => {
    if (!newUserName.trim() || newUserPin.length !== 4) {
      alert('Harap isi nama dan PIN 4-digit!');
      return;
    }
    sound.playTap();
    const newUser: User = {
      id: 'user_' + Date.now(),
      name: newUserName.trim(),
      pin: newUserPin,
      role: newUserRole,
      avatarColor:
        newUserRole === 'ADMIN'
          ? 'bg-indigo-600'
          : newUserRole === 'STORE_MANAGER'
          ? 'bg-emerald-600'
          : 'bg-amber-600',
    };
    const updated = [...userList, newUser];
    setUserList(updated);
    onUpdateUsers(updated);
    setNewUserName('');
    setNewUserPin('');
  };

  const handleDeleteUser = (userId: string) => {
    if (userList.length <= 1) {
      alert('Minimal harus ada 1 pengguna di sistem!');
      return;
    }
    sound.playTap();
    const updated = userList.filter((u) => u.id !== userId);
    setUserList(updated);
    onUpdateUsers(updated);
  };

  const handleUpdateUserPin = (userId: string, newPin: string) => {
    const updated = userList.map((u) => (u.id === userId ? { ...u, pin: newPin } : u));
    setUserList(updated);
  };

  // =========================================================================
  // BACKUP & RESTORE HANDLERS
  // =========================================================================
  const buildFullBackupPayload = (fileNamePrefix = 'KasirKu-Backup'): {
    fileName: string;
    payload: BackupPayload;
    dateFormatted: string;
  } => {
    return createFullBackupPayload({
      fileNamePrefix,
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
      storeSettings: {
        ...formSettings,
        customPaymentMethods: paymentMethods,
      },
      users: userList,
    });
  };

  const handleExportBackup = () => {
    if (!isAdminUser) {
      sound.playError();
      setBackupNotice({
        type: 'error',
        message: 'Akses ditolak: Hanya akun dengan peran Admin yang dapat mengunduh arsip backup data.',
      });
      return;
    }
    sound.playTap();
    const { fileName, payload } = buildFullBackupPayload('backup-kasirku');

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    sound.playSuccessChime();
    setBackupNotice({
      type: 'success',
      message: `Backup database "${fileName}" berhasil diunduh (${products.length} produk, ${customers.length} pelanggan, ${suppliers.length} supplier, ${purchases.length} PO pembelian, ${transactions.length} transaksi, ${cashflows.length} cashflow, ${stockOpnames.length} stock opname, dan ${onlineOrders.length} pesanan online).`,
    });
    setTimeout(() => setBackupNotice(null), 6000);
  };

  // Recurring Sunday Midnight Backup Scheduler state
  const [autoSundayBackupEnabled, setAutoSundayBackupEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('kasir_auto_sunday_backup_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [lastSundayBackupTime, setLastSundayBackupTime] = useState<string>(() => {
    return localStorage.getItem('kasir_last_sunday_backup_time') || '';
  });
  const [latestSundayBackup, setLatestSundayBackup] = useState<{
    fileName: string;
    timestamp: number;
    dateFormatted: string;
    sizeKb: number;
    jsonString: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('kasir_latest_sunday_backup');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const createBackupPayloadObject = () => {
    const { payload, dateFormatted } = buildFullBackupPayload('kasirku-backup-mingguan');
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const fileName = `kasirku-backup-mingguan-${dateStr}.json`;
    return { fileName, payload, dateFormatted };
  };

  const handleGenerateSundayBackup = (manual = false) => {
    if (manual) sound.playTap();
    const { fileName, payload, dateFormatted } = createBackupPayloadObject();
    const jsonString = JSON.stringify(payload, null, 2);
    const sizeKb = Math.round((new Blob([jsonString]).size / 1024) * 10) / 10;

    const backupRecord = {
      fileName,
      timestamp: Date.now(),
      dateFormatted,
      sizeKb,
      jsonString,
    };

    setLatestSundayBackup(backupRecord);
    setLastSundayBackupTime(new Date().toISOString());
    try {
      localStorage.setItem('kasir_latest_sunday_backup', JSON.stringify(backupRecord));
      localStorage.setItem('kasir_last_sunday_backup_time', new Date().toISOString());
    } catch {}

    if (manual) {
      sound.playSuccessChime();
      setBackupNotice({
        type: 'success',
        message: `Cadangan mingguan (${fileName}, ${sizeKb} KB) berhasil digenerate! Tautan unduh langsung siap digunakan.`,
      });
      setTimeout(() => setBackupNotice(null), 6000);
    }
  };

  const handleDownloadSundayBackup = () => {
    sound.playTap();
    let currentBackup = latestSundayBackup;
    if (!currentBackup) {
      const { fileName, payload, dateFormatted } = createBackupPayloadObject();
      const jsonString = JSON.stringify(payload, null, 2);
      const sizeKb = Math.round((new Blob([jsonString]).size / 1024) * 10) / 10;
      currentBackup = {
        fileName,
        timestamp: Date.now(),
        dateFormatted,
        sizeKb,
        jsonString,
      };
      setLatestSundayBackup(currentBackup);
    }

    const blob = new Blob([currentBackup.jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentBackup.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    sound.playSuccessChime();
  };

  // Helper for next Sunday midnight calculation
  const getNextSundayMidnightText = () => {
    const now = new Date();
    const nextSunday = new Date(now);
    const dayOfWeek = now.getDay();
    const daysToAdd = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    nextSunday.setDate(now.getDate() + daysToAdd);
    nextSunday.setHours(0, 0, 0, 0);
    return nextSunday.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' pukul 00:00 WIB';
  };

  // Auto initialize/check on mount if enabled
  React.useEffect(() => {
    if (autoSundayBackupEnabled && !latestSundayBackup) {
      handleGenerateSundayBackup(false);
    }
  }, [autoSundayBackupEnabled]);

  const handleImportFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdminUser) {
      sound.playError();
      setBackupNotice({
        type: 'error',
        message: 'Akses ditolak: Hanya Admin yang dapat mengunggah dan memulihkan data dari file backup.',
      });
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    sound.playTap();
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Normalize format: support standard BackupPayload or direct object
        const rawData = parsed && typeof parsed === 'object' ? (parsed.data || parsed) : null;
        if (!rawData || typeof rawData !== 'object') {
          throw new Error('Struktur JSON tidak valid.');
        }

        const hasRecognizedCollection = [
          'products',
          'customers',
          'suppliers',
          'purchases',
          'transactions',
          'cashflows',
          'attendances',
          'stockOpnames',
          'categories',
          'customerCategories',
          'onlineOrders',
          'activityLogs',
          'taxRecords',
          'taxAuditLogs',
          'taxAdjustments',
          'balanceSheetEntries',
          'users',
        ].some((key) => Array.isArray(rawData[key]));
        const hasSettings = Boolean(rawData.storeSettings && typeof rawData.storeSettings === 'object');

        if (!hasRecognizedCollection && !hasSettings) {
          sound.playError();
          setBackupNotice({
            type: 'error',
            message: 'File JSON tidak dikenali sebagai file backup database aplikasi kasir.',
          });
          setTimeout(() => setBackupNotice(null), 5000);
          return;
        }

        const candidateProducts = Array.isArray(rawData.products) ? rawData.products : [];
        const candidateCustomers = Array.isArray(rawData.customers) ? rawData.customers : [];
        const candidateSuppliers = Array.isArray(rawData.suppliers) ? rawData.suppliers : [];
        const candidatePurchases = Array.isArray(rawData.purchases) ? rawData.purchases : [];
        const candidateTransactions = Array.isArray(rawData.transactions) ? rawData.transactions : [];
        const candidateCashflows = Array.isArray(rawData.cashflows) ? rawData.cashflows : [];
        const candidateAttendances = Array.isArray(rawData.attendances) ? rawData.attendances : [];
        const candidateStockOpnames = Array.isArray(rawData.stockOpnames) ? rawData.stockOpnames : [];
        const candidateOnlineOrders = Array.isArray(rawData.onlineOrders) ? rawData.onlineOrders : [];
        const candidateActivityLogs = Array.isArray(rawData.activityLogs) ? rawData.activityLogs : [];
        const candidateTaxRecords = Array.isArray(rawData.taxRecords) ? rawData.taxRecords : [];
        const candidateTaxAuditLogs = Array.isArray(rawData.taxAuditLogs) ? rawData.taxAuditLogs : [];
        const candidateTaxAdjustments = Array.isArray(rawData.taxAdjustments) ? rawData.taxAdjustments : [];
        const candidateBalanceSheetEntries = Array.isArray(rawData.balanceSheetEntries)
          ? rawData.balanceSheetEntries
          : [];
        const candidateSettings = hasSettings ? rawData.storeSettings : formSettings;
        const candidateUsers = Array.isArray(rawData.users) ? rawData.users : undefined;
        const candidateCategories = Array.isArray(rawData.categories) ? rawData.categories : [];
        const candidateCustomerCategories = Array.isArray(rawData.customerCategories)
          ? rawData.customerCategories
          : customerCategories;

        const validPayload: BackupPayload = {
          app: parsed.app || 'Kasir Toko Tablet POS',
          version: parsed.version || '2.0',
          exportedAt: parsed.exportedAt || new Date().toISOString(),
          timestamp: parsed.timestamp || Date.now(),
          stats: {
            productCount: candidateProducts.length,
            customerCount: candidateCustomers.length,
            supplierCount: candidateSuppliers.length,
            purchaseCount: candidatePurchases.length,
            transactionCount: candidateTransactions.length,
            cashflowCount: candidateCashflows.length,
            attendanceCount: candidateAttendances.length,
            userCount: candidateUsers ? candidateUsers.length : userList.length,
            categoryCount: candidateCategories.length,
            customerCategoryCount: candidateCustomerCategories.length,
            stockOpnameCount: candidateStockOpnames.length,
            onlineOrderCount: candidateOnlineOrders.length,
            activityLogCount: candidateActivityLogs.length,
            taxRecordCount: candidateTaxRecords.length,
            taxAuditLogCount: candidateTaxAuditLogs.length,
            taxAdjustmentCount: candidateTaxAdjustments.length,
            balanceSheetEntryCount: candidateBalanceSheetEntries.length,
          },
          data: {
            products: candidateProducts,
            categories: candidateCategories,
            customerCategories: candidateCustomerCategories,
            customers: candidateCustomers,
            suppliers: candidateSuppliers,
            purchases: candidatePurchases,
            transactions: candidateTransactions,
            cashflows: candidateCashflows,
            attendances: candidateAttendances,
            stockOpnames: candidateStockOpnames,
            onlineOrders: candidateOnlineOrders,
            activityLogs: candidateActivityLogs,
            taxRecords: candidateTaxRecords,
            taxAuditLogs: candidateTaxAuditLogs,
            taxAdjustments: candidateTaxAdjustments,
            balanceSheetEntries: candidateBalanceSheetEntries,
            storeSettings: candidateSettings,
            users: candidateUsers,
          },
        };

        setImportCandidate(validPayload);
      } catch (err) {
        sound.playError();
        setBackupNotice({
          type: 'error',
          message: 'Gagal membaca file JSON. Pastikan format file JSON valid dan tidak rusak.',
        });
        setTimeout(() => setBackupNotice(null), 5000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmRestore = async () => {
    if (!importCandidate || isRestoringBackup) return;

    sound.playTap();
    setIsRestoringBackup(true);
    try {
      const payloadToRestore: BackupPayload = {
        ...importCandidate,
        data: {
          ...importCandidate.data,
          users:
            restoreUsersOption && importCandidate.data.users && importCandidate.data.users.length > 0
              ? importCandidate.data.users
              : userList,
        },
      };

      await onRestoreBackup(payloadToRestore);

      if (payloadToRestore.data.storeSettings) {
        setFormSettings({ ...payloadToRestore.data.storeSettings });
        if (
          Array.isArray(payloadToRestore.data.storeSettings.customPaymentMethods) &&
          payloadToRestore.data.storeSettings.customPaymentMethods.length > 0
        ) {
          setPaymentMethods([...payloadToRestore.data.storeSettings.customPaymentMethods]);
        }
      }
      if (restoreUsersOption && payloadToRestore.data.users && payloadToRestore.data.users.length > 0) {
        setUserList([...payloadToRestore.data.users]);
      }

      const prodCount = payloadToRestore.data.products.length;
      const custCount = payloadToRestore.data.customers.length;
      const poCount = payloadToRestore.data.purchases?.length || 0;
      const txCount = payloadToRestore.data.transactions.length;
      const cfCount = payloadToRestore.data.cashflows?.length || 0;

      sound.playSuccessChime();
      setImportCandidate(null);
      setBackupNotice({
        type: 'success',
        message: `Restore from Backup berhasil! Seluruh data lama telah diganti (${prodCount} produk, ${custCount} pelanggan, ${poCount} PO pembelian, ${txCount} transaksi, ${cfCount} catatan cashflow).`,
      });
      setTimeout(() => setBackupNotice(null), 7000);
    } catch (err) {
      sound.playError();
      setBackupNotice({
        type: 'error',
        message: 'Terjadi kendala saat mengganti data di cloud. Periksa koneksi internet Anda lalu coba kembali.',
      });
      setTimeout(() => setBackupNotice(null), 6000);
    } finally {
      setIsRestoringBackup(false);
    }
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-sky-600" />
              <span>Pengaturan Toko, Loyalitas Poin & Pengguna</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khusus Admin: Atur identitas toko, nomor rekening BCA, rasio poin, dan hak akses karyawan.
            </p>
          </div>

          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              Pengaturan Tersimpan!
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Card 1: Identitas Toko & Struk */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Store className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">Identitas Toko & Struk Cetak</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Toko</label>
                <input
                  type="text"
                  required
                  value={formSettings.storeName}
                  onChange={(e) => setFormSettings({ ...formSettings, storeName: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-bold focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nomor Telepon Toko</label>
                <input
                  type="text"
                  required
                  value={formSettings.storePhone}
                  onChange={(e) => setFormSettings({ ...formSettings, storePhone: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">Alamat Toko</label>
                <input
                  type="text"
                  required
                  value={formSettings.storeAddress}
                  onChange={(e) => setFormSettings({ ...formSettings, storeAddress: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Section: Receipt Customization */}
              <div className="md:col-span-2 space-y-4 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Kustomisasi Pesan Struk Kasir (Receipt Customization)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Pesan Header Struk (Greeting / Slogan Toko)
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Selamat Datang! Belanja Hemat Setiap Hari"
                      value={formSettings.storeHeaderReceipt || ''}
                      onChange={(e) => setFormSettings({ ...formSettings, storeHeaderReceipt: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                    />
                    <p className="text-[10.5px] text-slate-400 mt-1">
                      Dicetak tepat di bawah nomor telepon / alamat toko pada bagian atas struk thermal.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        Receipt Footer — Pesan Penutup Struk (2 Baris)
                      </label>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {Math.min(2, (formSettings.storeFooterReceipt || '').split(/\r?\n/).length)}/2 Baris
                      </span>
                    </div>
                    <textarea
                      rows={2}
                      placeholder={'Baris 1: Terima kasih telah berbelanja!\nBaris 2: Barang yang sudah dibeli tidak dapat ditukar.'}
                      value={formSettings.storeFooterReceipt}
                      onChange={(e) => {
                        const limitedLines = e.target.value.split(/\r?\n/).slice(0, 2).join('\n');
                        setFormSettings({ ...formSettings, storeFooterReceipt: limitedLines });
                      }}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm leading-snug resize-none focus:border-sky-500 focus:outline-none"
                    />
                    <p className="text-[10.5px] text-slate-400 mt-1">
                      Tulis hingga 2 baris pesan (misal Baris 1: slogan toko, Baris 2: kebijakan retur). Tekan Enter untuk baris ke-2 — dicetak di bagian bawah semua struk.
                    </p>
                  </div>
                </div>

                {/* Live Thermal Receipt Preview Box */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Pratinjau Langsung Struk Thermal (Live Preview):
                  </span>
                  <div className="max-w-[240px] mx-auto bg-white p-3 border border-slate-300 rounded shadow-2xs font-mono text-[10px] text-slate-800 space-y-1">
                    <div className="text-center font-black uppercase text-xs">{formSettings.storeName || 'NAMA TOKO'}</div>
                    <div className="text-center text-[9px] text-slate-500">{formSettings.storeAddress || 'Alamat Toko'}</div>
                    <div className="text-center text-[9px] text-slate-500">Telp: {formSettings.storePhone || '0812-xxxx'}</div>
                    
                    {formSettings.storeHeaderReceipt && (
                      <div className="text-center text-[9.5px] font-bold text-sky-800 italic pt-0.5 border-t border-dashed border-slate-300">
                        {formSettings.storeHeaderReceipt}
                      </div>
                    )}
                    
                    <div className="border-t border-dashed border-slate-300 my-1"></div>
                    <div className="flex justify-between text-slate-500">
                      <span>No. Nota:</span>
                      <span className="font-bold">INV/20261101/001</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Minyak Goreng 2L</span>
                      <span>38.000</span>
                    </div>
                    <div className="border-t border-dashed border-slate-300 my-1"></div>
                    <div className="flex justify-between font-black text-[11px]">
                      <span>TOTAL:</span>
                      <span>Rp 38.000</span>
                    </div>
                    <div className="border-t border-dashed border-slate-300 my-1"></div>
                    
                    <div className="text-center pt-0.5 space-y-0.5">
                      {parseReceiptFooterLines(formSettings.storeFooterReceipt).map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            idx === 0
                              ? 'text-[9.5px] font-medium text-slate-700'
                              : 'text-[8.5px] text-slate-500'
                          }
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Logo Toko untuk Struk Thermal */}
              <div className="md:col-span-2 pt-4 border-t border-slate-100 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-sky-600" />
                      <span>Logo Toko untuk Struk Thermal</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Logo akan dicetak di bagian paling atas struk thermal (58mm/80mm) secara monokrom kontras tinggi.
                    </p>
                  </div>

                  {/* Toggle display logo on receipt */}
                  <label className="relative inline-flex items-center cursor-pointer gap-2 shrink-0">
                    <span className="text-[11px] font-semibold text-slate-600">
                      Tampilkan di Struk
                    </span>
                    <input
                      type="checkbox"
                      checked={formSettings.showLogoOnReceipt ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, showLogoOnReceipt: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:right-[20px] peer-checked:after:right-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {/* Left Column: Upload Controls & Presets */}
                  <div className="md:col-span-2 space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          fileInputRef.current?.click();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Unggah Logo (PNG / JPG / SVG)</span>
                      </button>

                      {formSettings.storeLogo && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setLogoUploadError(null);
                            setFormSettings({ ...formSettings, storeLogo: '' });
                          }}
                          className="px-3 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Hapus Logo</span>
                        </button>
                      )}
                    </div>

                    {logoUploadError && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                        {logoUploadError}
                      </div>
                    )}

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      💡 <strong>Saran:</strong> Gunakan gambar logo siluet, badge, atau teks bertransparan/putih. Sistem otomatis menerapkan filter monokrom (*grayscale &amp; high-contrast*) agar hasil bakar thermal head printer tajam dan jelas.
                    </p>

                    {/* Preset Logo Templates */}
                    <div className="pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                        Atau pilih template logo siap pakai:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {PRESET_LOGOS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setFormSettings({
                                ...formSettings,
                                storeLogo: preset.svg,
                                showLogoOnReceipt: true,
                              });
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                              formSettings.storeLogo === preset.svg
                                ? 'bg-sky-50 border-sky-400 text-sky-800 font-bold shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {formSettings.storeLogo === preset.svg && (
                              <Check className="w-3 h-3 text-sky-600" />
                            )}
                            <span>{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Live Thermal Print Simulation Preview */}
                  <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-slate-400" />
                      <span>Simulasi Cetak Thermal</span>
                    </span>

                    {formSettings.storeLogo && (formSettings.showLogoOnReceipt ?? true) ? (
                      <div className="w-full bg-slate-50 p-2.5 rounded-lg border border-dashed border-slate-300 text-center font-mono space-y-1">
                        <img
                          src={formSettings.storeLogo}
                          alt="Thermal Preview"
                          className="max-h-12 max-w-[140px] mx-auto object-contain filter grayscale contrast-150"
                        />
                        <div className="text-[11px] font-black text-slate-900 tracking-wider">
                          {formSettings.storeName || 'NAMA TOKO'}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          {formSettings.storeAddress || 'Alamat Toko'}
                        </div>
                        <div className="border-t border-dashed border-slate-400 my-1"></div>
                        <div className="text-[8px] text-slate-400 italic">
                          (Tercetak di bagian atas struk)
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-28 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-center p-2">
                        <ImageIcon className="w-7 h-7 text-slate-300 mb-1" />
                        <span className="text-[10px] font-medium leading-tight">
                          Belum ada logo atau opsi logo dinonaktifkan
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 1.2: Aturan Checkout & Prompt Catatan Transaksi */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-amber-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Aturan Checkout &amp; Catatan Transaksi (Transaction Note)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Wajibkan kasir mengisi catatan khusus pelanggan atau keterangan internal sebelum menyelesaikan pembayaran
                  </p>
                </div>
              </div>
            </div>

            <div
              className={`p-4 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                formSettings.requireTransactionNote
                  ? 'bg-amber-50/80 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs md:text-sm font-bold text-slate-900">
                    Wajibkan Prompt &lsquo;Catatan Transaksi&rsquo; Sebelum Selesai Bayar
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                      formSettings.requireTransactionNote
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {formSettings.requireTransactionNote ? 'Wajib Diisi' : 'Opsional'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Jika diaktifkan, sistem akan otomatis memunculkan prompt pengisian <b>Catatan Transaksi</b> sebelum penjualan diselesaikan apabila kasir belum mengisinya—berguna untuk melacak permintaan khusus pelanggan, instruksi pengiriman, atau catatan internal kasir.
                </p>
                <div className="text-[10.5px] font-medium text-slate-500 pt-0.5">
                  {formSettings.requireTransactionNote ? (
                    <span className="text-amber-800 font-semibold">
                      • Checkout POS akan menahan konfirmasi bayar hingga Catatan Transaksi terisi, lalu menyimpannya di riwayat &amp; struk transaksi.
                    </span>
                  ) : (
                    <span>
                      • Kasir tetap dapat menambahkan Catatan Transaksi secara opsional di layar pembayaran tanpa hambatan.
                    </span>
                  )}
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={!!formSettings.requireTransactionNote}
                  onChange={(e) => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, requireTransactionNote: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
              </label>
            </div>
          </div>

          {/* Card 1.5: Target Penjualan Toko (Harian, Mingguan & Bulanan) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Target Penjualan Toko (Harian, Mingguan &amp; Bulanan)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Tetapkan target omzet harian, mingguan, dan bulanan untuk dipantau lewat progress bar real-time di Dashboard &amp; Kasir.
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 self-start sm:self-auto shrink-0">
                {formatRupiah(formSettings.dailySalesGoal || 5000000)} / Hari
              </span>
            </div>

            {/* 3 Target Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Target Harian */}
              <div className="p-3.5 rounded-xl bg-sky-50/60 border border-sky-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-sky-950">Target Harian (Rp)</label>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 text-sky-800">
                    Hari Ini
                  </span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={formSettings.dailySalesGoal ?? 5000000}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        dailySalesGoal: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs md:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                    placeholder="5000000"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {[2000000, 5000000, 10000000].map((presetVal) => (
                    <button
                      key={presetVal}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setFormSettings({ ...formSettings, dailySalesGoal: presetVal });
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border transition-all cursor-pointer ${
                        (formSettings.dailySalesGoal || 5000000) === presetVal
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white hover:bg-sky-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {formatRupiah(presetVal)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Mingguan */}
              <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950">Target Mingguan (Rp)</label>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      const daily = formSettings.dailySalesGoal || 5000000;
                      setFormSettings({ ...formSettings, weeklySalesGoal: daily * 7 });
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 hover:bg-indigo-200 text-indigo-800 cursor-pointer transition-colors"
                    title="Hitung otomatis 7 kali target harian"
                  >
                    7× Harian
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={formSettings.weeklySalesGoal ?? 30000000}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        weeklySalesGoal: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs md:text-sm font-mono font-bold focus:border-indigo-500 focus:outline-none"
                    placeholder="30000000"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {[15000000, 30000000, 50000000].map((presetVal) => (
                    <button
                      key={presetVal}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setFormSettings({ ...formSettings, weeklySalesGoal: presetVal });
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border transition-all cursor-pointer ${
                        (formSettings.weeklySalesGoal || 30000000) === presetVal
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white hover:bg-indigo-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {formatRupiah(presetVal)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Bulanan */}
              <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-950">Target Bulanan (Rp)</label>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      const daily = formSettings.dailySalesGoal || 5000000;
                      setFormSettings({ ...formSettings, monthlySalesGoal: daily * 30 });
                    }}
                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 cursor-pointer transition-colors"
                    title="Hitung otomatis 30 kali target harian"
                  >
                    30× Harian
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={formSettings.monthlySalesGoal ?? 120000000}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        monthlySalesGoal: Math.max(0, parseFloat(e.target.value) || 0),
                      })
                    }
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs md:text-sm font-mono font-bold focus:border-emerald-500 focus:outline-none"
                    placeholder="120000000"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {[60000000, 120000000, 250000000].map((presetVal) => (
                    <button
                      key={presetVal}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setFormSettings({ ...formSettings, monthlySalesGoal: presetVal });
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border transition-all cursor-pointer ${
                        (formSettings.monthlySalesGoal || 120000000) === presetVal
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white hover:bg-emerald-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {formatRupiah(presetVal)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Target Penjualan per Kategori Produk (Harian, Mingguan & Bulanan) */}
            <div className="pt-4 border-t border-slate-200 space-y-3.5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Layers className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                        Target Penjualan Khusus per Kategori Produk
                      </h4>
                      <span className="text-[11px] font-medium text-slate-500">
                        {categoryGoalTotals.configuredCount}/{categoryGoalEntries.length} kategori diatur
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Tentukan target harian, mingguan, dan bulanan yang berbeda untuk tiap kategori agar evaluasi performa di Sales Performance Dashboard lebih akurat.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {categoryGoalEntries.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDistributeStoreGoalsByCategory}
                      className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      title="Bagi rata target toko ke semua kategori produk"
                    >
                      Bagi Rata Target Toko
                    </button>
                  )}
                  {categoryGoalTotals.configuredCount > 0 && (
                    <button
                      type="button"
                      onClick={handleResetAllCategoryGoals}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Kosongkan Semua</span>
                    </button>
                  )}
                </div>
              </div>

              {categoryGoalEntries.length === 0 ? (
                <div className="p-5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
                  Belum ada kategori produk terdaftar. Tambahkan kategori atau produk terlebih dahulu untuk mengatur target per kategori.
                </div>
              ) : (
                <>
                  {categoryGoalEntries.length > 5 && (
                    <div className="relative max-w-xs">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={categoryGoalSearch}
                        onChange={(e) => setCategoryGoalSearch(e.target.value)}
                        placeholder="Cari kategori produk..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  )}

                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                          <th className="py-2.5 px-3 min-w-[165px]">Kategori Produk</th>
                          <th className="py-2.5 px-3 min-w-[145px]">Target Harian (Rp)</th>
                          <th className="py-2.5 px-3 min-w-[145px]">Target Mingguan (Rp)</th>
                          <th className="py-2.5 px-3 min-w-[155px]">Target Bulanan (Rp)</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">Bantu Isi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredCategoryGoalEntries.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400">
                              Tidak ada kategori yang cocok dengan "{categoryGoalSearch}".
                            </td>
                          </tr>
                        ) : (
                          filteredCategoryGoalEntries.map((cat) => {
                            const hasValue = cat.daily > 0 || cat.weekly > 0 || cat.monthly > 0;
                            return (
                              <tr
                                key={cat.name}
                                className={`transition-colors ${
                                  hasValue ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/40 hover:bg-slate-50'
                                }`}
                              >
                                <td className="py-2 px-3">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: cat.color }}
                                    />
                                    <div className="min-w-0">
                                      <div className="font-bold text-slate-900 truncate">
                                        {cat.name}
                                      </div>
                                      <div className="text-[10.5px] text-slate-400 font-mono tabular-nums">
                                        {cat.skuCount} produk
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    aria-label={`Target harian kategori ${cat.name}`}
                                    value={cat.daily || ''}
                                    onChange={(e) =>
                                      handleUpdateCategoryGoalField(cat.name, 'daily', e.target.value)
                                    }
                                    placeholder="0"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-slate-900 tabular-nums focus:border-sky-500 focus:outline-none"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    aria-label={`Target mingguan kategori ${cat.name}`}
                                    value={cat.weekly || ''}
                                    onChange={(e) =>
                                      handleUpdateCategoryGoalField(cat.name, 'weekly', e.target.value)
                                    }
                                    placeholder="0"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-slate-900 tabular-nums focus:border-indigo-500 focus:outline-none"
                                  />
                                </td>
                                <td className="py-2 px-3">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    aria-label={`Target bulanan kategori ${cat.name}`}
                                    value={cat.monthly || ''}
                                    onChange={(e) =>
                                      handleUpdateCategoryGoalField(cat.name, 'monthly', e.target.value)
                                    }
                                    placeholder="0"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-bold text-slate-900 tabular-nums focus:border-emerald-500 focus:outline-none"
                                  />
                                </td>
                                <td className="py-2 px-3 text-right">
                                  <div className="inline-flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleSyncCategoryWeeklyMonthly(cat.name)}
                                      className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10.5px] font-bold cursor-pointer whitespace-nowrap shrink-0"
                                      title="Hitung otomatis target mingguan (7x) & bulanan (30x) dari target harian"
                                    >
                                      7x / 30x
                                    </button>
                                    {hasValue && (
                                      <button
                                        type="button"
                                        onClick={() => handleClearSingleCategoryGoal(cat.name)}
                                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                                        title={`Hapus target kategori ${cat.name}`}
                                        aria-label={`Hapus target kategori ${cat.name}`}
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {categoryGoalTotals.configuredCount > 0 && (
                        <tfoot>
                          <tr className="bg-slate-50 border-t border-slate-200 font-bold text-[11px] text-slate-700">
                            <td className="py-2.5 px-3">
                              Total Target Kategori ({categoryGoalTotals.configuredCount})
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-sky-800">
                              {formatRupiah(categoryGoalTotals.dailySum)}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-indigo-800">
                              {formatRupiah(categoryGoalTotals.weeklySum)}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-emerald-800">
                              {formatRupiah(categoryGoalTotals.monthlySum)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[10px] text-slate-500 whitespace-nowrap">
                              {formSettings.dailySalesGoal && formSettings.dailySalesGoal > 0
                                ? `${((categoryGoalTotals.dailySum / formSettings.dailySalesGoal) * 100).toFixed(0)}% dr toko`
                                : ''}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Visual Preview of Dashboard Progress Bars */}
            <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 text-white space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Pratinjau Progress Bar Dashboard &amp; Kasir</span>
                </div>
                <span className="text-[10px] text-slate-400">
                  Diperbarui otomatis setiap transaksi selesai
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  { label: 'Target Harian', goal: formSettings.dailySalesGoal || 5000000, pct: 72, barClass: 'bg-sky-400' },
                  { label: 'Target Mingguan', goal: formSettings.weeklySalesGoal || 30000000, pct: 64, barClass: 'bg-indigo-400' },
                  { label: 'Target Bulanan', goal: formSettings.monthlySalesGoal || 120000000, pct: 58, barClass: 'bg-emerald-400' },
                ].map((bar) => (
                  <div key={bar.label} className="bg-white/5 border border-white/10 rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-200">{bar.label}</span>
                      <span className="font-mono font-bold text-emerald-300">{bar.pct}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${bar.barClass}`} style={{ width: `${bar.pct}%` }} />
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">
                      Target: {formatRupiah(bar.goal)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 1.6: Toko Online & Pengiriman Pelanggan */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-teal-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Halaman Belanja Online Pelanggan (Toko Online)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Atur jam operasional, ongkos kirim kurir lokal, dan ketersediaan web storefront pelanggan
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formSettings.onlineStoreEnabled ?? true}
                  onChange={(e) => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, onlineStoreEnabled: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Tagline Sambutan Toko Online
                </label>
                <input
                  type="text"
                  value={formSettings.onlineStoreTagline || ''}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, onlineStoreTagline: e.target.value })
                  }
                  placeholder="Belanja kebutuhan harian lebih praktis..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Jam Operasional Order Online
                </label>
                <input
                  type="text"
                  value={formSettings.onlineStoreHours || ''}
                  onChange={(e) =>
                    setFormSettings({ ...formSettings, onlineStoreHours: e.target.value })
                  }
                  placeholder="08:00 - 21:00 WIB"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono focus:border-teal-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Ongkir Kurir (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formSettings.onlineStoreDeliveryFee ?? 10000}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        onlineStoreDeliveryFee: Math.max(0, parseInt(e.target.value || '0', 10) || 0),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-teal-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Gratis Ongkir Min (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formSettings.onlineStoreMinFreeDelivery ?? 100000}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        onlineStoreMinFreeDelivery: Math.max(
                          0,
                          parseInt(e.target.value || '0', 10) || 0
                        ),
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSettings.onlineStorePickupEnabled ?? true}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      onlineStorePickupEnabled: e.target.checked,
                    })
                  }
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>Aktifkan Ambil di Toko (Pickup)</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSettings.onlineStoreDeliveryEnabled ?? true}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      onlineStoreDeliveryEnabled: e.target.checked,
                    })
                  }
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span>Aktifkan Pengiriman Kurir Lokal</span>
              </label>
            </div>
          </div>

          {/* Card 2: Mekanisme Loyalitas Poin */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Mekanisme Poin Loyalitas Member</h3>
                  <p className="text-[11px] text-slate-500">
                    Atur nominal belanja &quot;X&quot; Rupiah untuk mendapatkan &quot;Y&quot; Poin (khusus pelanggan Member)
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSettings.enablePoints}
                  onChange={(e) => setFormSettings({ ...formSettings, enablePoints: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Award className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <b>Khusus Pelanggan Member:</b> Poin loyalitas hanya diberikan kepada pelanggan yang berstatus <b>Member</b>. Pelanggan Non-Member / Umum tidak akan mendapatkan poin saat checkout.
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Belanja Setiap &quot;X&quot; (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formSettings.spendPerPoint}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      spendPerPoint: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Kelipatan nominal belanja (Rp) pemicu poin.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Mendapatkan &quot;Y&quot; Poin
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formSettings.pointsPerSpend ?? 1}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      pointsPerSpend: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono font-bold text-amber-700 focus:border-sky-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Jumlah poin diterima per kelipatan belanja Rp {formatNumber(formSettings.spendPerPoint || 0)}.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nilai Diskon per 1 Poin (Rp) Saat Ditukar
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={formSettings.pointValueRupiah}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      pointValueRupiah: e.target.value === '' ? 0 : Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Potongan harga tiap 1 poin saat ditukar di kasir.
                </p>
              </div>
            </div>

            {/* Live Formula Preview */}
            <div className="p-3.5 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                  Aturan Poin Member Aktif
                </div>
                <div className="text-xs sm:text-sm font-bold">
                  {formSettings.enablePoints && (formSettings.spendPerPoint || 0) > 0 && (formSettings.pointsPerSpend ?? 1) > 0 ? (
                    <>
                      Belanja setiap <span className="text-amber-300 font-mono">{formatRupiah(formSettings.spendPerPoint)}</span> &rarr; Member mendapat{' '}
                      <span className="text-emerald-400 font-mono">{formatNumber(formSettings.pointsPerSpend ?? 1)} Poin</span>
                    </>
                  ) : (
                    <span className="text-slate-400">Perolehan poin saat ini nonaktif / bernilai 0</span>
                  )}
                </div>
              </div>
              {formSettings.enablePoints && (formSettings.spendPerPoint || 0) > 0 && (formSettings.pointsPerSpend ?? 1) > 0 && (
                <div className="text-[11px] text-slate-300 font-mono bg-white/10 px-3 py-1.5 rounded-lg shrink-0">
                  Simulasi: Belanja {formatRupiah((formSettings.spendPerPoint || 0) * 2)} ={' '}
                  <span className="text-emerald-300 font-bold">+{formatNumber((formSettings.pointsPerSpend ?? 1) * 2)} Poin</span>{' '}
                  (Diskon {formatRupiah((formSettings.pointsPerSpend ?? 1) * 2 * (formSettings.pointValueRupiah || 0))})
                </div>
              )}
            </div>

            {/* Auto-Apply Max Points Toggle */}
            <div className={`p-3.5 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              formSettings.autoApplyMaxPoints
                ? 'bg-emerald-50/80 border-emerald-300'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900">
                    Otomatis Gunakan Poin Maksimal (Auto-Apply) Saat Checkout
                  </span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                    formSettings.autoApplyMaxPoints
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}>
                    {formSettings.autoApplyMaxPoints ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Jika diaktifkan, saat kasir memilih pelanggan <b>Member</b> yang memiliki saldo poin cukup saat checkout, sistem otomatis menerapkan penukaran poin maksimal untuk memotong tagihan (kasir tetap bisa menyesuaikan jumlah poin secara manual).
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={!!formSettings.autoApplyMaxPoints}
                  disabled={!formSettings.enablePoints}
                  onChange={(e) => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, autoApplyMaxPoints: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-disabled:opacity-50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          {/* Card 2.2: Notifikasi WhatsApp Otomatis Saat Transaksi Berhasil */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Notifikasi WhatsApp Otomatis Pelanggan
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Otomatis siapkan dan kirim notifikasi WhatsApp kepada pelanggan saat transaksi berhasil diselesaikan.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={!!formSettings.autoSendWhatsAppReceipt}
                  onChange={(e) => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, autoSendWhatsAppReceipt: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Toggle: Link Ringkasan Transaksi */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                  (formSettings.includeReceiptSummaryInAutoWa ?? true)
                    ? 'bg-emerald-50/70 border-emerald-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Sertakan Link Ringkasan Transaksi</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Menyisipkan tautan digital e-receipt (<code>/?invoice=...</code>) agar pelanggan dapat membuka detail nota kapan saja.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formSettings.includeReceiptSummaryInAutoWa ?? true}
                  onChange={(e) => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, includeReceiptSummaryInAutoWa: e.target.checked });
                  }}
                  className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer shrink-0"
                />
              </label>

              {/* Toggle: Info Poin Loyalitas */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-colors flex items-start justify-between gap-3 ${
                  (formSettings.includeLoyaltyPointsInAutoWa ?? true)
                    ? 'bg-amber-50/70 border-amber-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Sertakan Info Poin Loyalitas Member</span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Menampilkan poin yang diperoleh pada transaksi ini, poin yang ditukar, serta total saldo poin member terbaru.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formSettings.includeLoyaltyPointsInAutoWa ?? true}
                  onChange={(e) => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, includeLoyaltyPointsInAutoWa: e.target.checked });
                  }}
                  className="mt-0.5 w-4 h-4 accent-amber-500 rounded cursor-pointer shrink-0"
                />
              </label>
            </div>

            {/* Toggle & Editor: Template Pesan Struk WhatsApp Kustom */}
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <div
                className={`p-3.5 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  formSettings.useCustomWhatsAppTemplate
                    ? 'bg-sky-50/80 border-sky-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Edit3 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span className="text-xs font-bold text-slate-900">
                      Kustomisasi Template Pesan Struk WhatsApp
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        formSettings.useCustomWhatsAppTemplate
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {formSettings.useCustomWhatsAppTemplate ? 'Template Kustom Aktif' : 'Format Bawaan Sistem'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Aktifkan untuk menyesuaikan isi teks nota WhatsApp secara bebas menggunakan variabel dinamis seperti{' '}
                    <code>{'{customerName}'}</code>, <code>{'{invoiceNumber}'}</code>, dan <code>{'{totalAmount}'}</code>.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={!!formSettings.useCustomWhatsAppTemplate}
                    onChange={(e) => {
                      sound.playTap();
                      setFormSettings({
                        ...formSettings,
                        useCustomWhatsAppTemplate: e.target.checked,
                        customWhatsAppTemplate:
                          formSettings.customWhatsAppTemplate || DEFAULT_WHATSAPP_RECEIPT_TEMPLATE,
                      });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
              </div>

              {formSettings.useCustomWhatsAppTemplate && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Editor Template Pesan Struk WhatsApp
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setFormSettings({
                          ...formSettings,
                          customWhatsAppTemplate: DEFAULT_WHATSAPP_RECEIPT_TEMPLATE,
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[11px] flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset ke Template Bawaan</span>
                    </button>
                  </div>

                  {/* Clickable Placeholder Chips */}
                  <div className="space-y-1.5">
                    <span className="text-[10.5px] font-bold text-slate-500 block">
                      Klik variabel untuk menyisipkan ke template:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { token: '{customerName}', label: 'Nama Pelanggan' },
                        { token: '{invoiceNumber}', label: 'No. Nota' },
                        { token: '{totalAmount}', label: 'Total Belanja' },
                        { token: '{storeName}', label: 'Nama Toko' },
                        { token: '{dateTime}', label: 'Waktu' },
                        { token: '{itemsList}', label: 'Daftar Item' },
                        { token: '{paymentMethod}', label: 'Metode Bayar' },
                        { token: '{pointsEarned}', label: 'Poin Didapat' },
                        { token: '{pointsBalance}', label: 'Saldo Poin' },
                        { token: '{pointsInfo}', label: 'Blok Info Poin' },
                        { token: '{summaryLink}', label: 'Link Nota' },
                        { token: '{storeFooter}', label: 'Footer Struk' },
                      ].map((item) => (
                        <button
                          key={item.token}
                          type="button"
                          onClick={() => handleInsertWhatsAppPlaceholder(item.token)}
                          className="px-2 py-1 rounded-md bg-white hover:bg-sky-50 text-sky-700 border border-sky-200 font-mono text-[10.5px] font-bold transition-colors cursor-pointer"
                          title={`Sisipkan ${item.token} (${item.label})`}
                        >
                          {item.token} <span className="font-sans font-normal text-slate-500">({item.label})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    ref={waTemplateTextareaRef}
                    rows={8}
                    value={formSettings.customWhatsAppTemplate ?? DEFAULT_WHATSAPP_RECEIPT_TEMPLATE}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        customWhatsAppTemplate: e.target.value,
                      })
                    }
                    placeholder={DEFAULT_WHATSAPP_RECEIPT_TEMPLATE}
                    className="w-full p-3 rounded-xl border border-slate-300 bg-white text-xs font-mono leading-relaxed focus:border-sky-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Live Preview of Auto WhatsApp Message */}
            <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Send className="w-3 h-3" />
                  <span>Pratinjau Pesan WhatsApp Pelanggan</span>
                </span>
                <div className="flex items-center gap-1.5">
                  {formSettings.useCustomWhatsAppTemplate && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                      Template Kustom
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      formSettings.autoSendWhatsAppReceipt
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {formSettings.autoSendWhatsAppReceipt ? 'Kirim Otomatis Aktif' : 'Manual via Modal Struk'}
                  </span>
                </div>
              </div>
              <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap leading-relaxed bg-black/30 p-3 rounded-lg border border-slate-800">
{formSettings.useCustomWhatsAppTemplate
  ? (formSettings.customWhatsAppTemplate || DEFAULT_WHATSAPP_RECEIPT_TEMPLATE)
      .replace(/\{customerName\}/g, 'Iwan (Member)')
      .replace(/\{invoiceNumber\}/g, 'INV/20261114/001')
      .replace(/\{totalAmount\}/g, 'Rp 178.000')
      .replace(/\{subtotal\}/g, 'Rp 178.000')
      .replace(/\{discount\}/g, 'Rp 0')
      .replace(/\{storeName\}/g, formSettings.storeName || 'TOKO BERKAH JAYA')
      .replace(/\{storeAddress\}/g, formSettings.storeAddress || 'Alamat Toko')
      .replace(/\{storePhone\}/g, formSettings.storePhone || '-')
      .replace(/\{storeFooter\}/g, formSettings.storeFooterReceipt || 'Terima kasih telah berbelanja!')
      .replace(/\{dateTime\}/g, formatDateTime(Date.now()))
      .replace(/\{cashierName\}/g, 'Admin')
      .replace(/\{paymentMethod\}/g, 'TUNAI (CASH)')
      .replace(/\{itemsList\}/g, 'Minyak Goreng Bimoli 2L\n  2 PCS x Rp 38.000 = Rp 76.000\nBeras Premium 5Kg\n  1 SAK x Rp 102.000 = Rp 102.000')
      .replace(/\{pointsEarned\}/g, '15')
      .replace(/\{pointsUsed\}/g, '0')
      .replace(/\{pointsBalance\}/g, '150')
      .replace(
        /\{pointsInfo\}/g,
        (formSettings.includeLoyaltyPointsInAutoWa ?? true)
          ? '*INFO POIN LOYALITAS MEMBER*\nPoin Didapat  : +15 Poin\nSaldo Poin    : 150 Poin'
          : ''
      )
      .replace(
        /\{summaryLink\}/g,
        (formSettings.includeReceiptSummaryInAutoWa ?? true)
          ? `Link Ringkasan Transaksi:\n${typeof window !== 'undefined' ? window.location.origin : 'https://toko.id'}/?invoice=INV%2F20261114%2F001`
          : ''
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  : `*NOTA PEMBELIAN - ${formSettings.storeName || 'TOKO BERKAH JAYA'}*
No. Nota : INV/20261113/001
Total    : Rp 178.000 (TUNAI)${(formSettings.includeLoyaltyPointsInAutoWa ?? true) ? `
--------------------------------
*INFO POIN LOYALITAS MEMBER*
Poin Didapat  : +15 Poin
Saldo Poin    : 150 Poin` : ''}${(formSettings.includeReceiptSummaryInAutoWa ?? true) ? `
--------------------------------
Link Ringkasan Transaksi:
${typeof window !== 'undefined' ? window.location.origin : 'https://toko.id'}/?invoice=INV%2F20261113%2F001` : ''}`}
              </pre>
            </div>
          </div>

          {/* Card 2.2b: Otomatisasi Alert WhatsApp Stok Minimum ke Admin */}
          {(() => {
            const currentLowStockItems = products.filter(
              (p) => (p.productType || 'BARANG') !== 'JASA' && p.stockInBaseUnit <= p.minStockAlert
            );
            const previewHits: DailyLowStockHit[] =
              dailyLowStockLedger.hits.length > 0
                ? dailyLowStockLedger.hits
                : currentLowStockItems.length > 0
                ? currentLowStockItems.slice(0, 5).map((p) => ({
                    productId: p.id,
                    productName: p.name,
                    category: p.category,
                    currentStock: p.stockInBaseUnit,
                    minThreshold: p.minStockAlert,
                    baseUnit: p.baseUnit,
                    hitAt: Date.now(),
                  }))
                : [
                    {
                      productId: 'sample_1',
                      productName: 'Beras Rojolele Super 5kg',
                      category: 'Sembako',
                      currentStock: 8,
                      minThreshold: 15,
                      baseUnit: 'KARUNG',
                      hitAt: Date.now(),
                    },
                    {
                      productId: 'sample_2',
                      productName: 'Minyak Goreng Bimoli 2L',
                      category: 'Sembako',
                      currentStock: 0,
                      minThreshold: 20,
                      baseUnit: 'PCS',
                      hitAt: Date.now(),
                    },
                  ];
            const adminAlertPreviewText = buildAdminLowStockWhatsAppMessage({
              storeName: formSettings.storeName || 'TOKO BERKAH JAYA',
              hits: previewHits,
              totalLowStockProducts: Math.max(previewHits.length, currentLowStockItems.length),
              useCustomTemplate: formSettings.useCustomLowStockWhatsAppTemplate,
              customTemplate: formSettings.customLowStockWhatsAppTemplate,
            });
            const adminWaTestUrl = buildAdminWhatsAppUrl(
              formSettings.adminWhatsAppNumber,
              adminAlertPreviewText
            );
            const triggerCountVal = Math.max(
              2,
              Math.floor(Number(formSettings.adminLowStockTriggerCount) || 2)
            );
            const scheduleCfg = normalizeLowStockSchedule(
              formSettings.scheduledAdminLowStockWhatsApp
            );
            const scheduledHits = collectLowStockHitsFromProducts(
              products,
              scheduleCfg.includeOutOfStockSummary !== false
            );
            const physicalProductCount = products.filter(
              (p) => (p.productType || 'BARANG') !== 'JASA'
            ).length;
            const scheduledPreviewText = buildScheduledLowStockWhatsAppMessage({
              storeName: formSettings.storeName || 'TOKO BERKAH JAYA',
              hits:
                scheduledHits.length > 0 || scheduleCfg.sendEvenIfAllSafe
                  ? scheduledHits
                  : previewHits,
              totalPhysicalProducts: physicalProductCount,
              schedule: scheduleCfg,
              useCustomTemplate: formSettings.useCustomLowStockWhatsAppTemplate,
              customTemplate: formSettings.customLowStockWhatsAppTemplate,
            });
            const scheduledTestUrl = buildAdminWhatsAppUrl(
              formSettings.adminWhatsAppNumber,
              scheduledPreviewText
            );
            const nextScheduledInfo = getNextScheduledDispatchInfo(
              scheduleCfg,
              new Date(),
              scheduledDispatchState.lastDispatchedSlotKey
            );
            const activePreviewMessage =
              lowStockPreviewTab === 'SCHEDULED' ? scheduledPreviewText : adminAlertPreviewText;
            const DAY_OPTIONS = [
              { idx: 1, label: 'Sen' },
              { idx: 2, label: 'Sel' },
              { idx: 3, label: 'Rab' },
              { idx: 4, label: 'Kam' },
              { idx: 5, label: 'Jum' },
              { idx: 6, label: 'Sab' },
              { idx: 0, label: 'Min' },
            ];

            return (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 shrink-0">
                      <BellRing className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900">
                          Otomatisasi Laporan WhatsApp Stok Rendah ke Admin
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase whitespace-nowrap ${
                            (formSettings.autoAdminLowStockWhatsApp ?? true) || scheduleCfg.enabled
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {(formSettings.autoAdminLowStockWhatsApp ?? true) && scheduleCfg.enabled
                            ? 'Threshold + Terjadwal'
                            : scheduleCfg.enabled
                            ? 'Terjadwal Aktif'
                            : (formSettings.autoAdminLowStockWhatsApp ?? true)
                            ? 'Threshold Aktif'
                            : 'Nonaktif'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Kirim laporan stok menipis atau habis ke WhatsApp Admin baik saat ambang produk terlampaui maupun sesuai jadwal berkala.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Nomor Penerima WhatsApp Admin (Dipakai bersama untuk Threshold & Jadwal) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Nomor WhatsApp Admin / Owner Penerima</span>
                    </label>
                    <input
                      type="tel"
                      value={formSettings.adminWhatsAppNumber || ''}
                      onChange={(e) =>
                        setFormSettings({
                          ...formSettings,
                          adminWhatsAppNumber: e.target.value,
                        })
                      }
                      placeholder="Contoh: 081234567890"
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:border-amber-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-500">
                      {formSettings.adminWhatsAppNumber?.trim()
                        ? 'Alert threshold dan laporan stok rendah terjadwal akan dikirim ke nomor Admin ini.'
                        : 'Isi nomor WhatsApp Admin agar notifikasi otomatis mengarah langsung ke kontak yang tepat.'}
                    </p>
                  </div>

                  {/* Mode 1: Pemicu Threshold Harian */}
                  <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Alert Saat Threshold Terlampaui</span>
                        </div>
                        <p className="text-[10.5px] text-slate-500">
                          Picu otomatis ketika stok turun di bawah minimum dalam 1 hari.
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={formSettings.autoAdminLowStockWhatsApp ?? true}
                          onChange={(e) => {
                            sound.playTap();
                            setFormSettings({
                              ...formSettings,
                              autoAdminLowStockWhatsApp: e.target.checked,
                            });
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-700">
                        Ambang Pemicu:
                      </span>
                      <input
                        type="number"
                        min={2}
                        max={50}
                        value={triggerCountVal}
                        onChange={(e) => {
                          const parsed = parseInt(e.target.value, 10);
                          setFormSettings({
                            ...formSettings,
                            adminLowStockTriggerCount: isNaN(parsed) ? 2 : Math.max(2, parsed),
                          });
                        }}
                        className="w-16 p-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 text-center focus:border-amber-500 focus:outline-none"
                      />
                      <div className="flex items-center gap-1">
                        {[2, 3, 5].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setFormSettings({
                                ...formSettings,
                                adminLowStockTriggerCount: preset,
                              });
                            }}
                            className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                              triggerCountVal === preset
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {preset} Produk
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tracking Status Hari Ini (Threshold) & Uji Kirim Threshold */}
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-amber-950">
                      Pelacakan Threshold Hari Ini ({dailyLowStockLedger.date}):{' '}
                      <span className="font-mono text-amber-700 tabular-nums">
                        {dailyLowStockLedger.hits.length} / {triggerCountVal} produk menyentuh batas minimum
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      {dailyLowStockLedger.hits.length > 0
                        ? `Produk tercatat hari ini: ${dailyLowStockLedger.hits.map((h) => h.productName).join(', ')}`
                        : `Belum ada produk yang turun menyentuh batas minimum hari ini. Saat ini terdapat ${currentLowStockItems.length} produk di bawah ambang stok.`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setDailyLowStockLedger(resetDailyLowStockLedger());
                      }}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Hitungan Hari Ini</span>
                    </button>
                    <a
                      href={adminWaTestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => sound.playTap()}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Uji Alert Threshold</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Mode 2: Jadwal Pengiriman Otomatis Laporan Stok Rendah via WhatsApp */}
                <div className="pt-4 border-t border-slate-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <div className="p-2 rounded-xl bg-sky-50 text-sky-600 border border-sky-200 shrink-0">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
                            Jadwal Pengiriman Otomatis Laporan Stok Rendah
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${
                              scheduleCfg.enabled
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {scheduleCfg.enabled
                              ? formatScheduleSummaryLabel(scheduleCfg)
                              : 'Jadwal Nonaktif'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Kirim rekap semua produk stok rendah atau habis secara rutin ke WhatsApp Admin sesuai jam dan hari pilihan, tanpa menunggu threshold harian tercapai.
                        </p>
                      </div>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0 self-start sm:self-auto">
                      <input
                        type="checkbox"
                        checked={scheduleCfg.enabled}
                        onChange={(e) => {
                          sound.playTap();
                          updateLowStockSchedule({ enabled: e.target.checked });
                          if (e.target.checked) {
                            setLowStockPreviewTab('SCHEDULED');
                          }
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Frekuensi Pengiriman */}
                    <div className="lg:col-span-5 space-y-2">
                      <label className="text-xs font-bold text-slate-700 block">
                        Frekuensi Jadwal
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                        {(
                          [
                            { id: 'DAILY', label: 'Setiap Hari' },
                            { id: 'DAYS_OF_WEEK', label: 'Hari Pilihan' },
                            { id: 'WEEKLY', label: 'Mingguan' },
                          ] as { id: LowStockScheduleFrequency; label: string }[]
                        ).map((opt) => {
                          const active = scheduleCfg.frequency === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                updateLowStockSchedule({
                                  frequency: opt.id,
                                  daysOfWeek:
                                    opt.id === 'WEEKLY'
                                      ? [scheduleCfg.daysOfWeek[0] ?? 1]
                                      : scheduleCfg.daysOfWeek.length > 0
                                      ? scheduleCfg.daysOfWeek
                                      : [1, 2, 3, 4, 5, 6],
                                });
                              }}
                              className={`px-2 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                                active
                                  ? 'bg-white text-slate-900 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10.5px] text-slate-500">
                        {scheduleCfg.frequency === 'DAILY'
                          ? 'Laporan dikirim otomatis setiap hari pada jam yang ditentukan.'
                          : scheduleCfg.frequency === 'DAYS_OF_WEEK'
                          ? 'Pilih beberapa hari operasional toko untuk menerima rekap stok.'
                          : 'Pilih satu hari dalam seminggu untuk rekap stok mingguan Admin.'}
                      </p>
                    </div>

                    {/* Jam Pengiriman & Preset Cepat */}
                    <div className="lg:col-span-4 space-y-2">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-sky-600" />
                        <span>Jam Kirim Otomatis</span>
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          type="time"
                          value={scheduleCfg.time}
                          onChange={(e) => updateLowStockSchedule({ time: e.target.value })}
                          className="p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                        />
                        <div className="flex items-center gap-1 flex-wrap">
                          {['08:00', '12:00', '18:00', '21:00'].map((tPreset) => (
                            <button
                              key={tPreset}
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                updateLowStockSchedule({ time: tPreset });
                              }}
                              className={`px-2 py-1.5 rounded-lg text-[10.5px] font-mono font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                scheduleCfg.time === tPreset
                                  ? 'bg-sky-600 text-white border-sky-600'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {tPreset}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Ringkasan Kondisi Saat Ini */}
                    <div className="lg:col-span-3 space-y-1.5">
                      <span className="text-xs font-bold text-slate-700 block">
                        Stok Rendah Saat Ini
                      </span>
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2">
                        <span className="text-slate-600 font-medium">Perlu restock</span>
                        <span className="font-mono font-black text-slate-900 tabular-nums">
                          {formatNumber(currentLowStockItems.length)} SKU
                        </span>
                      </div>
                      <p className="text-[10.5px] text-slate-500">
                        {formatNumber(
                          currentLowStockItems.filter((p) => p.stockInBaseUnit <= 0).length
                        )}{' '}
                        habis ·{' '}
                        {formatNumber(
                          currentLowStockItems.filter((p) => p.stockInBaseUnit > 0).length
                        )}{' '}
                        menipis
                      </p>
                    </div>
                  </div>

                  {/* Pemilih Hari (Untuk Mingguan / Hari Pilihan) */}
                  {scheduleCfg.frequency !== 'DAILY' && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-slate-700 block">
                        {scheduleCfg.frequency === 'WEEKLY'
                          ? 'Pilih Hari Kirim Mingguan'
                          : 'Pilih Hari Pengiriman Aktif'}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {DAY_OPTIONS.map((d) => {
                          const isSelected =
                            scheduleCfg.frequency === 'WEEKLY'
                              ? (scheduleCfg.daysOfWeek[0] ?? 1) === d.idx
                              : scheduleCfg.daysOfWeek.includes(d.idx);
                          return (
                            <button
                              key={d.idx}
                              type="button"
                              onClick={() => handleToggleScheduleDay(d.idx)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Opsi Tambahan Jadwal */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={Boolean(scheduleCfg.sendEvenIfAllSafe)}
                        onChange={(e) => {
                          sound.playTap();
                          updateLowStockSchedule({ sendEvenIfAllSafe: e.target.checked });
                        }}
                        className="mt-0.5 w-4 h-4 accent-sky-600 rounded cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Tetap kirim laporan meski semua stok aman
                        </span>
                        <span className="text-[10.5px] text-slate-500">
                          Jika tidak ada produk stok rendah saat jadwal tiba, Admin tetap menerima ringkasan konfirmasi aman.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={scheduleCfg.includeOutOfStockSummary !== false}
                        onChange={(e) => {
                          sound.playTap();
                          updateLowStockSchedule({
                            includeOutOfStockSummary: e.target.checked,
                          });
                        }}
                        className="mt-0.5 w-4 h-4 accent-sky-600 rounded cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Prioritaskan &amp; pisahkan jumlah produk stok habis (0)
                        </span>
                        <span className="text-[10.5px] text-slate-500">
                          Menampilkan rincian jumlah produk yang benar-benar habis (0) di bagian paling atas laporan terjadwal.
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* Bar Status Jadwal & Uji Kirim Terjadwal */}
                  <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-sky-950">
                        Jadwal Berikutnya:{' '}
                        <span className="font-mono text-sky-700">{nextScheduledInfo}</span>
                      </div>
                      <p className="text-[11px] text-sky-800">
                        {scheduledDispatchState.lastDispatchedAt
                          ? `Terakhir dipicu: ${formatDateTime(
                              scheduledDispatchState.lastDispatchedAt
                            )} (${formatNumber(
                              scheduledDispatchState.lastLowStockCount ?? 0
                            )} produk stok rendah)`
                          : 'Belum ada pengiriman terjadwal yang dijalankan pada perangkat ini.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setScheduledDispatchState(resetScheduledLowStockDispatch());
                        }}
                        className="px-3 py-2 rounded-xl bg-white hover:bg-sky-100 text-sky-900 border border-sky-300 text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Status Jadwal</span>
                      </button>
                      <a
                        href={scheduledTestUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => sound.playTap()}
                        className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0 transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Uji Kirim Laporan Terjadwal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Custom Low-Stock WhatsApp Template Editor */}
                <div className="pt-3 border-t border-slate-200 space-y-3">
                  <div className="flex items-start sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-900">
                          Kustomisasi Template Pesan Alert Stok Menipis
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${
                            formSettings.useCustomLowStockWhatsAppTemplate
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {formSettings.useCustomLowStockWhatsAppTemplate
                            ? 'Template Kustom Aktif'
                            : 'Format Bawaan Sistem'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        Sesuaikan format pesan peringatan WhatsApp saat stok menipis menggunakan placeholder seperti{' '}
                        <code>{'{productName}'}</code>, <code>{'{currentStock}'}</code>, <code>{'{productNames}'}</code>, dan{' '}
                        <code>{'{productList}'}</code>.
                      </p>
                    </div>

                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={!!formSettings.useCustomLowStockWhatsAppTemplate}
                        onChange={(e) => {
                          sound.playTap();
                          setFormSettings({
                            ...formSettings,
                            useCustomLowStockWhatsAppTemplate: e.target.checked,
                            customLowStockWhatsAppTemplate:
                              formSettings.customLowStockWhatsAppTemplate ||
                              DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE,
                          });
                        }}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                    </label>
                  </div>

                  {formSettings.useCustomLowStockWhatsAppTemplate && (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          Editor Template WhatsApp Alert Stok Menipis
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setFormSettings({
                              ...formSettings,
                              customLowStockWhatsAppTemplate: DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE,
                            });
                          }}
                          className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[11px] flex items-center gap-1 self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset ke Template Bawaan</span>
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <span className="text-[10.5px] font-bold text-slate-500 block">
                          Klik placeholder untuk menyisipkan ke template:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {LOW_STOCK_WHATSAPP_PLACEHOLDERS.map((item) => (
                            <button
                              key={item.token}
                              type="button"
                              onClick={() => handleInsertLowStockPlaceholder(item.token)}
                              className="px-2 py-1 rounded-md bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 font-mono text-[10.5px] font-bold transition-colors cursor-pointer"
                              title={`Sisipkan ${item.token} (${item.label})`}
                            >
                              {item.token}{' '}
                              <span className="font-sans font-normal text-slate-500">
                                ({item.label})
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <textarea
                        ref={lowStockWaTextareaRef}
                        rows={7}
                        value={
                          formSettings.customLowStockWhatsAppTemplate ??
                          DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE
                        }
                        onChange={(e) =>
                          setFormSettings({
                            ...formSettings,
                            customLowStockWhatsAppTemplate: e.target.value,
                          })
                        }
                        placeholder={DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE}
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white text-xs font-mono leading-relaxed focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>

                {/* Live Preview with Threshold / Scheduled Switcher */}
                <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <BellRing className="w-3 h-3" />
                        <span>Pratinjau Pesan WhatsApp Admin</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Target: {formSettings.adminWhatsAppNumber?.trim() || 'Pilih kontak di WhatsApp'}
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-slate-800 border border-slate-700 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setLowStockPreviewTab('THRESHOLD');
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          lowStockPreviewTab === 'THRESHOLD'
                            ? 'bg-amber-600 text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Alert Threshold
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setLowStockPreviewTab('SCHEDULED');
                        }}
                        className={`px-2.5 py-1 rounded-md text-[10.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          lowStockPreviewTab === 'SCHEDULED'
                            ? 'bg-sky-600 text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Laporan Terjadwal
                      </button>
                    </div>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap leading-relaxed bg-black/30 p-3 rounded-lg border border-slate-800">
                    {activePreviewMessage}
                  </pre>
                </div>
              </div>
            );
          })()}

          {/* Card 2.2c: Jadwal Laporan Penjualan Harian Otomatis Saat Jam Tutup Toko (WhatsApp Admin) */}
          {(() => {
            const closingSchedule = normalizeDailySalesSchedule(
              formSettings.scheduledDailySalesReportWhatsApp
            );
            const todayClosingSummary = computeTodaySalesClosingSummary({
              transactions,
              products,
              cashflows,
            });
            const closingPreviewMessage = buildDailySalesClosingWhatsAppMessage({
              storeName: formSettings.storeName || 'TOKO BERKAH JAYA',
              summary: todayClosingSummary,
              schedule: closingSchedule,
            });
            const closingTestUrl = buildAdminWhatsAppUrl(
              formSettings.adminWhatsAppNumber,
              closingPreviewMessage
            );
            const nextClosingInfo = getNextDailySalesDispatchInfo(
              closingSchedule,
              new Date(),
              scheduledDailySalesDispatchState
            );
            const DAY_OPTIONS = [
              { idx: 1, label: 'Sen' },
              { idx: 2, label: 'Sel' },
              { idx: 3, label: 'Rab' },
              { idx: 4, label: 'Kam' },
              { idx: 5, label: 'Jum' },
              { idx: 6, label: 'Sab' },
              { idx: 0, label: 'Min' },
            ];

            return (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900">
                          Jadwal Laporan Penjualan Harian (Jam Tutup Toko via WhatsApp)
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase whitespace-nowrap ${
                            closingSchedule.enabled
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {closingSchedule.enabled
                            ? formatDailySalesScheduleSummaryLabel(closingSchedule)
                            : 'Nonaktif'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Kirim rekap otomatis omzet, laba FIFO, metode bayar, dan produk terlaris hari ini ke WhatsApp Admin tepat saat jam tutup toko sesuai interval yang ditentukan.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 self-start sm:self-auto">
                    <input
                      type="checkbox"
                      checked={closingSchedule.enabled}
                      onChange={(e) => {
                        sound.playTap();
                        updateDailySalesSchedule({ enabled: e.target.checked });
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {/* Baris 1: Jam Tutup Toko + Interval Mode + Nomor Admin */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Jam Tutup Toko */}
                  <div className="lg:col-span-4 space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Jam Tutup Toko (Waktu Kirim)</span>
                    </label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="time"
                        value={closingSchedule.closingTime}
                        onChange={(e) => updateDailySalesSchedule({ closingTime: e.target.value })}
                        className="p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:border-emerald-500 focus:outline-none"
                      />
                      <div className="flex items-center gap-1 flex-wrap">
                        {['17:00', '20:00', '21:00', '22:00'].map((tPreset) => (
                          <button
                            key={tPreset}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              updateDailySalesSchedule({ closingTime: tPreset });
                            }}
                            className={`px-2 py-1.5 rounded-lg text-[10.5px] font-mono font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                              closingSchedule.closingTime === tPreset
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {tPreset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Interval Pengiriman */}
                  <div className="lg:col-span-5 space-y-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Interval Pengiriman Laporan</span>
                    </label>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                      {(
                        [
                          { id: 'DAILY', label: 'Setiap Hari Tutup' },
                          { id: 'EVERY_N_DAYS', label: 'Setiap N Hari' },
                          { id: 'DAYS_OF_WEEK', label: 'Hari Pilihan' },
                        ] as { id: DailySalesScheduleIntervalMode; label: string }[]
                      ).map((opt) => {
                        const active = closingSchedule.intervalMode === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              updateDailySalesSchedule({ intervalMode: opt.id });
                            }}
                            className={`px-2 py-2 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                              active
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {closingSchedule.intervalMode === 'EVERY_N_DAYS' && (
                      <div className="flex items-center gap-2 pt-1">
                        <span className="text-[11px] font-semibold text-slate-600">
                          Kirim otomatis setiap:
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={closingSchedule.intervalDays}
                          onChange={(e) =>
                            updateDailySalesSchedule({
                              intervalDays: Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 1)),
                            })
                          }
                          className="w-16 p-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-center text-slate-900 focus:border-emerald-500 focus:outline-none tabular-nums"
                        />
                        <span className="text-[11px] font-semibold text-slate-600">
                          hari sekali saat jam tutup
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Nomor Admin + Ringkasan Hari Ini */}
                  <div className="lg:col-span-3 space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Target WA &amp; Omzet Hari Ini</span>
                    </span>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">WA Admin</span>
                        <span className="font-mono font-bold text-slate-900 truncate">
                          {formSettings.adminWhatsAppNumber?.trim() || 'Belum diisi'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                        <span className="text-slate-500">
                          {formatNumber(todayClosingSummary.transactionCount)} nota
                        </span>
                        <span className="font-mono font-bold text-emerald-700 tabular-nums">
                          {formatRupiah(todayClosingSummary.totalNetRevenue)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pemilih Hari Pilihan */}
                {closingSchedule.intervalMode === 'DAYS_OF_WEEK' && (
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-slate-700 block">
                      Pilih Hari Operasional Pengiriman Laporan Penutupan
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {DAY_OPTIONS.map((d) => {
                        const isSelected = closingSchedule.daysOfWeek.includes(d.idx);
                        return (
                          <button
                            key={d.idx}
                            type="button"
                            onClick={() => handleToggleDailySalesDay(d.idx)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Komponen Isi Laporan Penjualan Harian */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">
                    Komponen Data yang Disertakan di Pesan WhatsApp
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={closingSchedule.includePaymentBreakdown}
                        onChange={(e) => {
                          sound.playTap();
                          updateDailySalesSchedule({ includePaymentBreakdown: e.target.checked });
                        }}
                        className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Rincian Metode Bayar
                        </span>
                        <span className="text-[10.5px] text-slate-500">
                          Cash, QRIS, Transfer BCA, dan Piutang.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={closingSchedule.includeProfitSummary}
                        onChange={(e) => {
                          sound.playTap();
                          updateDailySalesSchedule({ includeProfitSummary: e.target.checked });
                        }}
                        className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Ringkasan HPP &amp; Laba Kotor
                        </span>
                        <span className="text-[10.5px] text-slate-500">
                          HPP FIFO beserta persentase margin kotor.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={closingSchedule.includeExpenseSummary}
                        onChange={(e) => {
                          sound.playTap();
                          updateDailySalesSchedule({ includeExpenseSummary: e.target.checked });
                        }}
                        className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Biaya Cashflow &amp; Laba Bersih
                        </span>
                        <span className="text-[10.5px] text-slate-500">
                          Pemasukan/pengeluaran operasional hari ini.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors">
                      <input
                        type="checkbox"
                        checked={closingSchedule.includeTopProducts}
                        onChange={(e) => {
                          sound.playTap();
                          updateDailySalesSchedule({ includeTopProducts: e.target.checked });
                        }}
                        className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          5 Produk Terlaris Hari Ini
                        </span>
                        <span className="text-[10.5px] text-slate-500">
                          Ranking qty &amp; omzet produk teratas.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70 transition-colors sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={closingSchedule.sendOnlyIfHasTransactions}
                        onChange={(e) => {
                          sound.playTap();
                          updateDailySalesSchedule({ sendOnlyIfHasTransactions: e.target.checked });
                        }}
                        className="mt-0.5 w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                      />
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          Lewati pengiriman jika hari tersebut 0 transaksi (toko libur)
                        </span>
                        <span className="text-[10.5px] text-slate-500">
                          Jika tidak dicentang, Admin tetap menerima konfirmasi tutup toko Rp 0 saat jam tutup tiba.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Bar Status Jadwal & Uji Kirim */}
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-emerald-950">
                      Jadwal Berikutnya:{' '}
                      <span className="font-mono text-emerald-700">{nextClosingInfo}</span>
                    </div>
                    <p className="text-[11px] text-emerald-800">
                      {scheduledDailySalesDispatchState.lastDispatchedAt
                        ? `Terakhir dipicu: ${formatDateTime(
                            scheduledDailySalesDispatchState.lastDispatchedAt
                          )} (${formatNumber(
                            scheduledDailySalesDispatchState.lastTransactionCount ?? 0
                          )} nota · ${formatRupiah(
                            scheduledDailySalesDispatchState.lastNetRevenue ?? 0
                          )})`
                        : 'Belum ada laporan penutupan harian yang dijalankan pada perangkat ini.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setScheduledDailySalesDispatchState(resetScheduledDailySalesDispatch());
                      }}
                      className="px-3 py-2 rounded-xl bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Status Hari Ini</span>
                    </button>
                    <a
                      href={closingTestUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => sound.playTap()}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Uji Kirim Laporan Penutupan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <MessageCircle className="w-3 h-3" />
                      <span>Pratinjau Pesan Laporan Tutup Toko (Data Hari Ini)</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Target: {formSettings.adminWhatsAppNumber?.trim() || 'Pilih kontak di WhatsApp'}
                    </span>
                  </div>
                  <pre className="text-[11px] font-mono text-slate-200 whitespace-pre-wrap leading-relaxed bg-black/30 p-3 rounded-lg border border-slate-800">
                    {closingPreviewMessage}
                  </pre>
                </div>
              </div>
            );
          })()}

          {/* Card 2.3: Pengaturan Koneksi Printer (Bluetooth & USB) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Printer className="w-4 h-4 text-sky-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Pengaturan Koneksi Printer (Bluetooth &amp; USB)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Pilih metode koneksi printer thermal, ukuran lebar kertas (58mm / 80mm), dan lakukan Test Print verifikasi.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap self-start sm:self-auto">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                  {(formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH' ? (
                    <Bluetooth className="w-3.5 h-3.5" />
                  ) : (
                    <Usb className="w-3.5 h-3.5" />
                  )}
                  <span>
                    Mode: {(formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH' ? 'Bluetooth' : 'USB'}
                  </span>
                </span>
                <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                  {formSettings.printerPaperWidth || '58mm'}
                </span>
              </div>
            </div>

            {/* 1. Connection Mode Toggle: Bluetooth vs USB */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Mode Koneksi Printer Utama
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, printerConnectionType: 'BLUETOOTH' });
                    setPrinterFeedback(null);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    (formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH'
                      ? 'bg-sky-50/80 border-sky-500 ring-2 ring-sky-500/20 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      (formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH'
                        ? 'bg-sky-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-500'
                    }`}
                  >
                    <Bluetooth className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Printer Bluetooth (Wireless)
                      </span>
                      {(formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-sky-600 text-white">
                          Dipilih
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Cocok untuk printer thermal portable / tablet Android via Web Bluetooth ESC/POS atau aplikasi RawBT.
                    </p>
                    <div className="text-[10px] font-medium pt-0.5">
                      {!isWebBluetoothSupported() ? (
                        <span className="text-amber-700">ℹ Gunakan RawBT / Cetak Sistem pada browser ini</span>
                      ) : !bluetoothPolicyAllowed ? (
                        <span className="text-amber-700">ℹ Mode frame preview: gunakan Tab Penuh / RawBT</span>
                      ) : (
                        <span className="text-emerald-700">✓ Web Bluetooth siap digunakan</span>
                      )}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, printerConnectionType: 'USB' });
                    setPrinterFeedback(null);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                    formSettings.printerConnectionType === 'USB'
                      ? 'bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 shadow-2xs'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      formSettings.printerConnectionType === 'USB'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-500'
                    }`}
                  >
                    <Usb className="w-5 h-5" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        Printer USB (Kabel / OTG)
                      </span>
                      {formSettings.printerConnectionType === 'USB' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-600 text-white">
                          Dipilih
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      Koneksi stabil untuk kasir meja (Desktop POS) atau tablet USB OTG via WebUSB ESC/POS &amp; Driver Sistem.
                    </p>
                    <div className="text-[10px] font-medium pt-0.5">
                      {!isWebUsbSupported() ? (
                        <span className="text-amber-700">ℹ Gunakan Driver USB OS (Cetak Sistem)</span>
                      ) : !usbPolicyAllowed ? (
                        <span className="text-amber-700">ℹ Mode frame preview: gunakan Tab Penuh / Driver USB OS</span>
                      ) : (
                        <span className="text-emerald-700">✓ WebUSB siap digunakan</span>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Paper Width & Printer Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-slate-500" />
                  <span>Lebar Kertas Thermal</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      width: '58mm' as const,
                      title: '58mm (Standar)',
                      desc: '32 karakter/baris • Portable',
                    },
                    {
                      width: '80mm' as const,
                      title: '80mm (Lebar)',
                      desc: '48 karakter/baris • Desktop',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.width}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setFormSettings({ ...formSettings, printerPaperWidth: opt.width });
                      }}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        (formSettings.printerPaperWidth || '58mm') === opt.width
                          ? 'bg-white border-sky-500 ring-2 ring-sky-500/20 shadow-2xs'
                          : 'bg-slate-100/70 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black font-mono text-slate-900">{opt.width}</span>
                        {(formSettings.printerPaperWidth || '58mm') === opt.width && (
                          <CheckCircle2 className="w-3.5 h-3.5 text-sky-600" />
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-700 mt-0.5">{opt.title}</div>
                      <div className="text-[10px] text-slate-500">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nama / Label Perangkat Printer (Opsional)
                  </label>
                  <input
                    type="text"
                    value={formSettings.printerDeviceName || ''}
                    onChange={(e) =>
                      setFormSettings({ ...formSettings, printerDeviceName: e.target.value })
                    }
                    placeholder="Misal: Eppos EP58D / Epson TM-T82"
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <label className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      Potong Kertas Otomatis (Auto-Cut ESC/POS)
                    </span>
                    <span className="text-[10.5px] text-slate-500">
                      Kirim perintah cut setelah cetak (khusus printer dengan pemotong otomatis).
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formSettings.printerAutoCut ?? true}
                    onChange={(e) => {
                      sound.playTap();
                      setFormSettings({ ...formSettings, printerAutoCut: e.target.checked });
                    }}
                    className="w-4 h-4 accent-sky-600 rounded cursor-pointer shrink-0 ml-2"
                  />
                </label>
              </div>
            </div>

            {/* 2.5 Auto-Print Receipt Toggle */}
            <div
              className={`p-3.5 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                formSettings.autoPrintReceipt
                  ? 'bg-emerald-50/80 border-emerald-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Printer className={`w-4 h-4 ${formSettings.autoPrintReceipt ? 'text-emerald-600' : 'text-slate-500'}`} />
                  <span className="text-xs font-bold text-slate-900">
                    Auto-Print Receipt
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                      formSettings.autoPrintReceipt
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {formSettings.autoPrintReceipt ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Jika diaktifkan, proses cetak struk akan dijalankan secara otomatis segera setelah transaksi pembayaran berhasil (tanpa perlu menekan tombol cetak manual pada modal struk).
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={!!formSettings.autoPrintReceipt}
                  onChange={(e) => {
                    sound.playTap();
                    setFormSettings({ ...formSettings, autoPrintReceipt: e.target.checked });
                  }}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* 3. Connection Verification & Test Print Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePairPrinter}
                  disabled={isPairingPrinter}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                    (formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH'
                      ? 'bg-sky-50 hover:bg-sky-100 text-sky-800 border-sky-300'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-300'
                  }`}
                >
                  {isPairingPrinter ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menghubungkan...</span>
                    </>
                  ) : (formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH' ? (
                    <>
                      <Bluetooth className="w-4 h-4" />
                      <span>Hubungkan Printer Bluetooth</span>
                    </>
                  ) : (
                    <>
                      <Usb className="w-4 h-4" />
                      <span>Hubungkan Printer USB</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleTestPrint}
                  disabled={isTestingPrint}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  {isTestingPrint ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                      <span>Menguji Cetak...</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4 text-emerald-400" />
                      <span>Test Print</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    ((formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH' &&
                      livePrinterInfo.bluetoothConnected) ||
                    (formSettings.printerConnectionType === 'USB' && livePrinterInfo.usbConnected)
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-slate-300'
                  }`}
                />
                <span>
                  {(formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH'
                    ? livePrinterInfo.bluetoothConnected
                      ? `Terhubung: ${livePrinterInfo.bluetoothDeviceName}`
                      : 'Bluetooth belum dipasangkan di sesi ini'
                    : livePrinterInfo.usbConnected
                    ? `Terhubung: ${livePrinterInfo.usbDeviceName}`
                    : 'USB WebUSB belum dipasangkan di sesi ini'}
                </span>
              </div>
            </div>

            {/* Feedback Banner */}
            {printerFeedback && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                  printerFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : printerFeedback.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-sky-50 border-sky-200 text-sky-900'
                }`}
              >
                <div className="flex items-start gap-2.5 flex-1">
                  {printerFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : printerFeedback.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-2 flex-1">
                    <span className="leading-relaxed block">{printerFeedback.message}</span>
                    {printerFeedback.showOpenFullTab && typeof window !== 'undefined' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={window.location.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => sound.playTap()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] shadow-2xs transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Buka Tab Browser Penuh (Aktifkan Bluetooth/USB)</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPrinterFeedback(null)}
                  className="p-0.5 rounded hover:bg-black/5 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Dummy Receipt Capture Preview (Triggered on Test Print) */}
            {testPrintCaptureTx && (
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-white">
                        Dummy Receipt Capture (Verifikasi Test Print)
                      </div>
                      <div className="text-[10.5px] text-slate-400">
                        Simulasi hasil cetak pada lebar kertas{' '}
                        <span className="text-emerald-300 font-mono font-bold">
                          {formSettings.printerPaperWidth || '58mm'}
                        </span>{' '}
                        via mode{' '}
                        <span className="text-sky-300 font-mono font-bold">
                          {formSettings.printerConnectionType || 'BLUETOOTH'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {(formSettings.printerConnectionType || 'BLUETOOTH') === 'BLUETOOTH' && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          openRawBtPrint(
                            testPrintCaptureTx,
                            formSettings,
                            formSettings.printerPaperWidth || '58mm'
                          );
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Bluetooth className="w-3 h-3" />
                        <span>Test via RawBT</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        try {
                          window.print();
                        } catch {
                          // Safe no-op if sandboxed
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Cetak Driver Sistem</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTestPrintCaptureTx(null)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                      title="Tutup Pratinjau Test Print"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Captured Thermal Receipt Paper Box */}
                <div className="flex justify-center py-2">
                  <div
                    className={`bg-white text-slate-900 rounded-lg p-3.5 shadow-xl font-mono text-[10px] leading-tight space-y-1.5 transition-all ${
                      (formSettings.printerPaperWidth || '58mm') === '58mm'
                        ? 'w-[240px]'
                        : 'w-[330px]'
                    }`}
                  >
                    <div className="text-center space-y-0.5">
                      {formSettings.storeLogo && (formSettings.showLogoOnReceipt ?? true) && (
                        <img
                          src={formSettings.storeLogo}
                          alt="Logo Struk"
                          className="max-h-9 max-w-[110px] mx-auto object-contain filter grayscale contrast-150 mb-1"
                        />
                      )}
                      <div className="font-black text-xs uppercase tracking-wider">
                        {formSettings.storeName || 'TOKO BERKAH JAYA'}
                      </div>
                      <div className="text-[9px] text-slate-600">
                        {formSettings.storeAddress || 'Alamat Toko'}
                      </div>
                      {formSettings.storePhone && (
                        <div className="text-[9px] text-slate-600">
                          Telp: {formSettings.storePhone}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-dashed border-slate-400 my-1" />

                    <div className="space-y-0.5 text-[9.5px]">
                      <div className="flex justify-between">
                        <span>No. Nota:</span>
                        <span className="font-bold">{testPrintCaptureTx.invoiceNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Waktu:</span>
                        <span>{formatDateTime(testPrintCaptureTx.timestamp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Kasir:</span>
                        <span>{testPrintCaptureTx.cashierName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Koneksi:</span>
                        <span className="font-bold">
                          {formSettings.printerConnectionType || 'BLUETOOTH'} ({formSettings.printerPaperWidth || '58mm'})
                        </span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-400 my-1" />

                    <div className="space-y-1 text-[9.5px]">
                      {testPrintCaptureTx.items.map((item) => (
                        <div key={item.productId}>
                          <div className="font-bold">{item.productName}</div>
                          <div className="flex justify-between text-slate-700">
                            <span>
                              {item.quantity} {item.unitName} x {formatRupiah(item.unitPrice)}
                            </span>
                            <span>{formatRupiah(item.totalAmount)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-dashed border-slate-400 my-1" />

                    <div className="space-y-0.5 text-[9.5px]">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{formatRupiah(testPrintCaptureTx.subtotal)}</span>
                      </div>
                      <div className="flex justify-between font-black text-[11px] pt-0.5">
                        <span>TOTAL:</span>
                        <span>{formatRupiah(testPrintCaptureTx.finalAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tunai:</span>
                        <span>{formatRupiah(testPrintCaptureTx.cashPaid || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Kembalian:</span>
                        <span>{formatRupiah(testPrintCaptureTx.cashChange || 0)}</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-slate-400 my-1" />

                    <div className="text-center text-[9px] text-slate-600 pt-0.5 space-y-0.5">
                      <div className="font-bold text-slate-800">*** TEST PRINT BERHASIL ***</div>
                      {parseReceiptFooterLines(formSettings.storeFooterReceipt).map((line, idx) => (
                        <div key={idx} className={idx === 1 ? 'text-[8.5px] text-slate-500' : ''}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card 2.5: Kebijakan Harga Khusus Pelanggan */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center shrink-0">
                <Award className="w-4 h-4 text-sky-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Harga Khusus Pelanggan (Mengikuti Aturan Harga Produk &amp; Jasa)
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Diskon persentase otomatis berdasarkan Tier Membership telah ditiadakan.
                  Harga jual khusus pelanggan kini sepenuhnya mengikuti nominal <b>Harga Khusus</b> dan syarat{' '}
                  <b>Minimal Pembelian (Min. Beli)</b> yang diinput langsung pada masing-masing barang atau jasa
                  untuk setiap <b>Kategori Pelanggan</b>.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Rekening Bank BCA & QRIS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Konfigurasi Rekening BCA & QRIS</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nomor Rekening BCA</label>
                <input
                  type="text"
                  value={formSettings.bcaAccountNumber}
                  onChange={(e) => setFormSettings({ ...formSettings, bcaAccountNumber: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Pemilik Rekening</label>
                <input
                  type="text"
                  value={formSettings.bcaAccountName}
                  onChange={(e) => setFormSettings({ ...formSettings, bcaAccountName: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">BCA Merchant ID (NMID)</label>
                <input
                  type="text"
                  value={formSettings.bcaMerchantId}
                  onChange={(e) => setFormSettings({ ...formSettings, bcaMerchantId: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Store QRIS Statis Upload & Preview */}
            <div className="pt-3 border-t border-slate-100">
              <label className="text-xs font-bold text-slate-800 block mb-1">
                Foto / Barcode QRIS Statis Toko (Untuk Layar Pembayaran Kasir)
              </label>
              <p className="text-[11px] text-slate-500 mb-2">
                Unggah gambar barcode QRIS resmi toko Anda. Barcode ini akan langsung ditampilkan saat kasir memilih pembayaran QRIS di modal pembayaran kasir.
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                {formSettings.qrisImageUrl ? (
                  <div className="p-2 bg-slate-50 border border-slate-300 rounded-xl flex items-center gap-3">
                    <img 
                      src={formSettings.qrisImageUrl} 
                      alt="QRIS Toko" 
                      className="w-16 h-16 object-contain bg-white rounded border border-slate-200"
                    />
                    <div>
                      <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> QRIS Toko Siap Digunakan
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formSettings.qrisImageName || 'qris-statis-toko.jpg'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFormSettings({ ...formSettings, qrisImageUrl: '', qrisImageName: '' })}
                      className="ml-2 px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-bold border border-rose-200 cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic">
                    Belum ada gambar QRIS statis yang diunggah.
                  </div>
                )}

                <label className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{formSettings.qrisImageUrl ? 'Ganti File QRIS' : 'Upload File QRIS (JPG/PNG)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const res = evt.target?.result as string;
                        if (res) {
                          setFormSettings({
                            ...formSettings,
                            qrisImageUrl: res,
                            qrisImageName: file.name
                          });
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Card 3.5: Manajemen Metode & Jenis Pembayaran (Custom Payment Methods & QRIS Statis) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Metode &amp; Jenis Pembayaran Toko</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                      {paymentMethods.length} Jenis
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Tambah jenis pembayaran baru (QRIS, Tunai, Bank, EDC) dan unggah file JPG QRIS statis toko.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleOpenAddMethod}
                className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Jenis Pembayaran</span>
              </button>
            </div>

            {/* List of configured payment methods */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {paymentMethods.map((pm) => {
                const isQris = pm.type === 'QRIS';
                const isCash = pm.type === 'CASH';
                const isBank = pm.type === 'BANK_TRANSFER';
                const isCard = pm.type === 'CARD';
                const isPiutang = pm.type === 'PIUTANG';

                return (
                  <div
                    key={pm.id}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                      pm.isActive
                        ? 'bg-white border-slate-200 shadow-2xs hover:border-sky-300'
                        : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                            isQris
                              ? 'bg-rose-50 text-rose-600'
                              : isCash
                              ? 'bg-emerald-50 text-emerald-600'
                              : isBank
                              ? 'bg-blue-50 text-blue-600'
                              : isCard
                              ? 'bg-indigo-50 text-indigo-600'
                              : isPiutang
                              ? 'bg-amber-50 text-amber-600'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isQris ? (
                            <QrCode className="w-5 h-5" />
                          ) : isCash ? (
                            <Banknote className="w-5 h-5" />
                          ) : isBank ? (
                            <ArrowRightLeft className="w-5 h-5" />
                          ) : isCard ? (
                            <CreditCard className="w-5 h-5" />
                          ) : isPiutang ? (
                            <Calendar className="w-5 h-5" />
                          ) : (
                            <CreditCard className="w-5 h-5" />
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs md:text-sm font-bold text-slate-900">
                              {pm.name}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold tracking-wider ${
                                isQris
                                  ? 'bg-rose-100 text-rose-800'
                                  : isCash
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isBank
                                  ? 'bg-blue-100 text-blue-800'
                                  : isCard
                                  ? 'bg-indigo-100 text-indigo-800'
                                  : isPiutang
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {pm.type}
                            </span>
                          </div>

                          {pm.description && (
                            <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                              {pm.description}
                            </p>
                          )}

                          {pm.accountNumber && (
                            <div className="text-[10.5px] text-slate-600 font-mono mt-0.5 flex items-center gap-1">
                              <span className="text-slate-400">Info:</span>
                              <span className="font-bold">{pm.accountNumber}</span>
                              {pm.accountName && <span>({pm.accountName})</span>}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Active switch */}
                      <label
                        className="relative inline-flex items-center cursor-pointer shrink-0"
                        title={pm.isActive ? 'Metode Aktif' : 'Metode Dinonaktifkan'}
                      >
                        <input
                          type="checkbox"
                          checked={pm.isActive}
                          onChange={() => handleTogglePaymentMethod(pm.id)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                      </label>
                    </div>

                    {/* QRIS Static File Status Card if applicable */}
                    {isQris && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2">
                        {pm.qrisImageUrl ? (
                          <div className="flex items-center gap-2.5 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewZoomImage({
                                  url: pm.qrisImageUrl!,
                                  title: `File JPG QRIS Statis: ${pm.name}`,
                                })
                              }
                              className="relative group w-12 h-12 rounded-lg bg-white border border-slate-300 overflow-hidden shrink-0 shadow-2xs hover:ring-2 hover:ring-sky-500 transition-all cursor-zoom-in"
                              title="Klik untuk melihat perbesaran file JPG QRIS"
                            >
                              <img
                                src={pm.qrisImageUrl}
                                alt="QRIS Statis"
                                className="w-full h-full object-contain"
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                <ZoomIn className="w-3.5 h-3.5" />
                              </div>
                            </button>

                            <div className="min-w-0">
                              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>File JPG Terpasang</span>
                              </span>
                              <div className="text-[10.5px] font-medium text-slate-700 truncate mt-0.5">
                                {pm.qrisImageName || 'qris-statis.jpg'}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
                            <ImageIcon className="w-4 h-4 text-slate-400" />
                            <span>Belum ada file JPG QRIS statis terunggah</span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenEditMethod(pm)}
                          className="px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold bg-white hover:bg-sky-50 text-sky-700 border border-slate-200 hover:border-sky-300 transition-colors shrink-0 flex items-center gap-1"
                        >
                          <ImagePlus className="w-3.5 h-3.5" />
                          <span>{pm.qrisImageUrl ? 'Ganti JPG' : '+ Upload JPG'}</span>
                        </button>
                      </div>
                    )}

                    {/* Bottom actions: Edit & Delete */}
                    <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleOpenEditMethod(pm)}
                        className="px-2.5 py-1 rounded-lg text-slate-600 hover:text-sky-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePaymentMethod(pm.id)}
                        className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1 transition-colors"
                        title="Hapus metode pembayaran"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 4: Manajemen Pengguna Kasir & Role */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Users className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Manajemen Pengguna (Admin, Store Manager, Karyawan)
              </h3>
            </div>

            {/* User List */}
            <div className="space-y-2">
              {userList.map((u) => (
                <div
                  key={u.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl ${u.avatarColor} text-white flex items-center justify-center font-bold text-xs`}>
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs md:text-sm font-bold text-slate-900">{u.name}</div>
                      <div className="text-[11px] text-slate-500 font-semibold">{u.role}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">PIN:</span>
                      <input
                        type="text"
                        maxLength={4}
                        value={u.pin}
                        onChange={(e) => handleUpdateUserPin(u.id, e.target.value)}
                        className="w-16 p-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-center bg-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add User Row */}
            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
              <div className="md:col-span-5">
                <input
                  type="text"
                  placeholder="Nama Karyawan Baru..."
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 text-xs bg-white"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full p-2 rounded-lg border border-slate-300 text-xs bg-white font-medium"
                >
                  <option value="KARYAWAN">Karyawan (Kasir)</option>
                  <option value="STORE_MANAGER">Store Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <input
                  type="text"
                  maxLength={4}
                  placeholder="PIN 4-digit"
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 text-xs font-mono font-bold text-center bg-white"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                >
                  + Tambah
                </button>
              </div>
            </div>
          </div>

          {/* Card 5: Modul Backup & Restore Data */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600 shrink-0" />
                <h3 className="text-sm font-bold text-slate-900">
                  Backup &amp; Restore Data
                </h3>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 inline-flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                  <span>Khusus Admin</span>
                </span>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 inline-flex items-center gap-1">
                  <FileJson className="w-3.5 h-3.5" />
                  <span>Arsip JSON</span>
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Unduh seluruh data aplikasi (produk, kategori, pelanggan, supplier, pembelian PO, riwayat transaksi, cashflow, absensi, opname, pesanan online, log aktivitas, pengguna, dan pengaturan toko) ke dalam file JSON untuk arsip offline, atau unggah kembali file backup JSON untuk pemulihan data penuh.
            </p>

            {!isAdminUser && (
              <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Mode terkunci: Login sebagai Admin untuk mengunduh atau memulihkan file backup JSON.</span>
              </div>
            )}

            {/* Notification alert */}
            {backupNotice && (
              <div
                className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                  backupNotice.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {backupNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-medium leading-relaxed">{backupNotice.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBackupNotice(null)}
                  className="p-1 hover:opacity-75 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Live Data Summary Grid (Full Application Data) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Produk &amp; Jasa</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800 tabular-nums">
                  {formatNumber(products.length)} <span className="text-[10px] font-medium text-slate-500">item</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Pelanggan</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800 tabular-nums">
                  {formatNumber(customers.length)} <span className="text-[10px] font-medium text-slate-500">kontak</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Supplier</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800 tabular-nums">
                  {formatNumber(suppliers.length)} <span className="text-[10px] font-medium text-slate-500">vendor</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Pembelian (PO)</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800 tabular-nums">
                  {formatNumber(purchases.length)} <span className="text-[10px] font-medium text-slate-500">dok</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Transaksi</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800 tabular-nums">
                  {formatNumber(transactions.length)} <span className="text-[10px] font-medium text-slate-500">nota</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Cashflow</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800 tabular-nums">
                  {formatNumber(cashflows.length)} <span className="text-[10px] font-medium text-slate-500">catatan</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Stock Opname</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800 tabular-nums">
                  {formatNumber(stockOpnames.length)} <span className="text-[10px] font-medium text-slate-500">sesi</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Order Online</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800 tabular-nums">
                  {formatNumber(onlineOrders.length)} <span className="text-[10px] font-medium text-slate-500">order</span>
                </div>
              </div>
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Card A: Export */}
              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                      <Download className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Backup Database (Ekspor JSON)</h4>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Unduh cadangan penuh seluruh data aplikasi (produk, kategori, pelanggan, supplier, pembelian PO, transaksi, cashflow, absensi, opname, pesanan online, pengguna &amp; pengaturan) dalam satu file JSON.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={!isAdminUser}
                  onClick={handleExportBackup}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>Unduh Backup JSON</span>
                </button>
              </div>

              {/* Card B: Import */}
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                      <Upload className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Pulihkan Data dari File JSON</h4>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Unggah file JSON arsip Backup Database sebelumnya. Setelah pratinjau &amp; konfirmasi, seluruh data lokal dan Cloud Firestore akan dipulihkan sesuai isi file backup.
                  </p>
                </div>

                <div>
                  <input
                    type="file"
                    ref={importFileInputRef}
                    accept=".json,application/json"
                    onChange={handleImportFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={!isAdminUser}
                    onClick={() => importFileInputRef.current?.click()}
                    className="w-full py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FolderArchive className="w-3.5 h-3.5 shrink-0" />
                    <span>Unggah &amp; Pulihkan (.json)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Google Drive Cloud Backup & Periodic Safeguard */}
            <GoogleDriveBackupPanel
              canManageBackup={currentUserRole === 'ADMIN' || currentUserRole === 'STORE_MANAGER'}
              currentUserName={currentUserName}
              buildBackupPayload={(prefix) => buildFullBackupPayload(prefix || 'KasirKu-DriveBackup')}
              onRestoreBackup={async (payload) => {
                await onRestoreBackup(payload);
              }}
            />

            {/* Recurring Sunday Midnight Backup Scheduler */}
            <div className="p-4 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/60 rounded-2xl border border-indigo-200/80 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs md:text-sm font-bold text-slate-900">
                        Jadwal Pencadangan Otomatis Mingguan (Sunday Backup Scheduler)
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Minggu 00:00
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Sistem menjadwalkan ekspor JSON otomatis seluruh data toko (transaksi, produk, pelanggan) setiap Minggu tengah malam.
                    </p>
                  </div>
                </div>

                {/* Toggle Auto Backup */}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer self-start sm:self-auto shrink-0 select-none bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs">
                  <input
                    type="checkbox"
                    checked={autoSundayBackupEnabled}
                    onChange={(e) => {
                      sound.playTap();
                      setAutoSundayBackupEnabled(e.target.checked);
                      localStorage.setItem('kasir_auto_sunday_backup_enabled', String(e.target.checked));
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Jadwal Aktif</span>
                </label>
              </div>

              {/* Schedule Info & Status Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white rounded-xl border border-indigo-100/90 shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Jadwal Eksekusi Berikutnya</span>
                  </div>
                  <div className="font-bold text-slate-800 mt-1">
                    {getNextSundayMidnightText()}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Otomatis merangkum transaksi, katalog produk, dan kontak pelanggan
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-indigo-100/90 shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Status Snapshot Terakhir</span>
                  </div>
                  <div className="font-bold text-slate-800 mt-1 truncate">
                    {latestSundayBackup ? latestSundayBackup.fileName : 'Belum ada cadangan dibuat'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {latestSundayBackup ? `${latestSundayBackup.sizeKb} KB · ${latestSundayBackup.dateFormatted}` : 'Klik tombol di bawah untuk membuat snapshot sekarang'}
                  </div>
                </div>
              </div>

              {/* Action Buttons for Sunday Backup */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-indigo-100">
                <button
                  type="button"
                  onClick={() => handleGenerateSundayBackup(true)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Simulasikan dan generate paket snapshot cadangan data minggu ini sekarang"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Jalankan Snapshot Minggu Ini Sekarang (Simulasi)</span>
                </button>

                {latestSundayBackup && (
                  <button
                    type="button"
                    onClick={handleDownloadSundayBackup}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                    title={`Unduh ${latestSundayBackup.fileName}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Cadangan Minggu Ini ({latestSundayBackup.sizeKb} KB)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Cloud Sync Toggle Card (Real-Time Firestore vs Local Only) */}
            <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
              formSettings.manualOfflineMode
                ? 'bg-amber-50/70 border-amber-300'
                : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    formSettings.manualOfflineMode
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                  }`}>
                    {formSettings.manualOfflineMode ? (
                      <CloudOff className="w-4 h-4" />
                    ) : (
                      <Cloud className="w-4 h-4" />
                    )}
                  </div>
                  <span className="font-bold text-slate-900 text-sm">
                    Cloud Sync
                  </span>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide ${
                    formSettings.manualOfflineMode
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    {formSettings.manualOfflineMode ? 'LOCAL ONLY (SYNC DIJEDA)' : 'REAL-TIME CLOUD SYNC AKTIF'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed max-w-xl">
                  {formSettings.manualOfflineMode
                    ? 'Sinkronisasi real-time Firestore sedang dijeda. Seluruh transaksi, stok, dan data kasir tetap berjalan cepat dan tersimpan aman di perangkat (Mode Local Only).'
                    : 'Sinkronisasi real-time Google Firebase Firestore aktif. Matikan sakelar Cloud Sync untuk beralih ke mode Local Only saat koneksi internet lambat atau terputus.'}
                </p>
                <div className="flex items-center gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      const updated = { ...formSettings, manualOfflineMode: false };
                      setFormSettings(updated);
                      onUpdateStoreSettings({ ...storeSettings, manualOfflineMode: false });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer ${
                      !formSettings.manualOfflineMode
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Real-Time Sync (Cloud)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      const updated = { ...formSettings, manualOfflineMode: true };
                      setFormSettings(updated);
                      onUpdateStoreSettings({ ...storeSettings, manualOfflineMode: true });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-all cursor-pointer ${
                      formSettings.manualOfflineMode
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    Local Only (Offline)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center">
                <span className={`text-[11px] font-bold ${
                  formSettings.manualOfflineMode ? 'text-amber-800' : 'text-emerald-700'
                }`}>
                  {formSettings.manualOfflineMode ? 'Local Only' : 'Sync ON'}
                </span>
                <label className="relative inline-flex items-center cursor-pointer shrink-0" title="Aktifkan atau jeda Cloud Sync Firestore">
                  <input
                    type="checkbox"
                    aria-label="Cloud Sync"
                    checked={!formSettings.manualOfflineMode}
                    onChange={(e) => {
                      sound.playTap();
                      const nextOffline = !e.target.checked;
                      setFormSettings({ ...formSettings, manualOfflineMode: nextOffline });
                      onUpdateStoreSettings({ ...storeSettings, manualOfflineMode: nextOffline });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-6 bg-amber-400 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>
            </div>

            {/* Cloud Backend (Firebase Firestore) Info & Connection Diagnostics */}
            <div
              ref={firestoreDiagnosticsRef}
              id="firestore-diagnostics-panel"
              className={`p-4 rounded-xl border text-xs transition-all space-y-3.5 ${
                isFirestoreHighlighted
                  ? 'ring-2 ring-sky-500 ring-offset-2 shadow-md'
                  : ''
              } ${
                formSettings.manualOfflineMode
                  ? 'bg-slate-100/80 border-slate-300'
                  : cloudSyncStatus === 'OFFLINE'
                  ? 'bg-rose-50/70 border-rose-200'
                  : 'bg-gradient-to-r from-amber-50/70 to-orange-50/70 border-amber-200/80'
              }`}
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm shadow-xs shrink-0 ${
                    formSettings.manualOfflineMode
                      ? 'bg-slate-400 text-white'
                      : cloudSyncStatus === 'OFFLINE'
                      ? 'bg-rose-500 text-white'
                      : 'bg-amber-500 text-white'
                  }`}>
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">Diagnostik &amp; Status Server Firebase Firestore</span>
                      {formSettings.manualOfflineMode ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>Local Only (Dijeda)</span>
                        </span>
                      ) : cloudSyncStatus === 'SYNCED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>Terhubung Real-Time</span>
                        </span>
                      ) : cloudSyncStatus === 'CONNECTING' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-300 flex items-center gap-1">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          <span>Menghubungkan...</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1">
                          <WifiOff className="w-2.5 h-2.5" />
                          <span>Offline / Terputus</span>
                        </span>
                      )}
                      {typeof navigator !== 'undefined' && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border flex items-center gap-1 ${
                          navigator.onLine
                            ? 'bg-white/80 text-slate-700 border-slate-300'
                            : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}>
                          {navigator.onLine ? <Wifi className="w-2.5 h-2.5 text-emerald-600" /> : <WifiOff className="w-2.5 h-2.5 text-rose-600" />}
                          <span>{navigator.onLine ? 'Internet Aktif' : 'Internet Terputus'}</span>
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          pendingSyncQueueCount > 0
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {pendingSyncQueueCount > 0
                          ? `Antrean Sync: ${pendingSyncQueueCount} Tertunda`
                          : 'Antrean Sync: Bersih'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5 font-mono break-all">
                      Project: <span className="font-bold text-slate-800">{firebaseProjectId}</span> | Database: <span className="font-bold text-slate-800">{firebaseDatabaseId}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  {onOpenSyncHealth && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        onOpenSyncHealth();
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                      <span>Kesehatan Sync</span>
                    </button>
                  )}
                  {onOpenSyncLogs && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        onOpenSyncLogs();
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Log per Modul</span>
                    </button>
                  )}
                  {onOpenOfflineQueueModal && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        onOpenOfflineQueueModal();
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                        offlineQueueCount > 0
                          ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Antrean Offline ({offlineQueueCount})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleForceSyncNow}
                    disabled={isVerifyingFirestore}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed bg-sky-600 hover:bg-sky-500 text-white"
                    title="Paksa pengecekan server Firestore, bersihkan status antrean sync, dan perbarui status koneksi secara instan"
                  >
                    {isVerifyingFirestore ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Menyinkronkan Server...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Force Sync Now</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Active Error / Latest Verification Result Callout */}
              {(cloudSyncError || lastVerificationResult) && (
                <div className={`p-3 rounded-xl border text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                  lastVerificationResult && !lastVerificationResult.ok
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : cloudSyncError && cloudSyncStatus === 'OFFLINE' && !formSettings.manualOfflineMode
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}>
                  <div className="flex items-start gap-2">
                    {((lastVerificationResult && !lastVerificationResult.ok) ||
                      (cloudSyncError && cloudSyncStatus === 'OFFLINE' && !formSettings.manualOfflineMode)) ? (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <div className="font-bold">
                        {lastVerificationResult
                          ? lastVerificationResult.ok
                            ? 'Force Sync & Verifikasi Server Berhasil'
                            : 'Verifikasi Koneksi Server Gagal'
                          : 'Diagnosis Koneksi Sinkronisasi'}
                      </div>
                      <p className="leading-relaxed">
                        {lastVerificationResult?.message || cloudSyncError}
                      </p>
                      {lastVerificationResult && (
                        <div className="flex items-center gap-2 flex-wrap pt-1 text-[10px] font-semibold">
                          <span className={`px-2 py-0.5 rounded-md border ${
                            lastVerificationResult.docReadOk
                              ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100/80 text-rose-800 border-rose-300'
                          }`}>
                            Baca Dokumen: {lastVerificationResult.docReadOk ? 'OK' : 'Gagal'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md border ${
                            lastVerificationResult.listQueryOk
                              ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300'
                              : 'bg-rose-100/80 text-rose-800 border-rose-300'
                          }`}>
                            Kueri Koleksi: {lastVerificationResult.listQueryOk ? 'OK' : 'Gagal'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md border ${
                            lastVerificationResult.queueCleared
                              ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300'
                              : 'bg-amber-100/80 text-amber-800 border-amber-300'
                          }`}>
                            Antrean Sync:{' '}
                            {lastVerificationResult.queueCleared
                              ? 'Dibersihkan'
                              : lastVerificationResult.queueFlushStatus === 'SKIPPED' && pendingSyncQueueCount === 0
                              ? 'Belum Diverifikasi'
                              : 'Tertunda'}
                          </span>
                          {lastVerificationResult.latencyMs > 0 && (
                            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-mono">
                              Latensi: {lastVerificationResult.latencyMs} ms
                            </span>
                          )}
                          {lastVerificationResult.errorCode && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-100 border border-rose-300 text-rose-800 font-mono">
                              Kode: {lastVerificationResult.errorCode}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  {lastVerificationResult && (
                    <span className="text-[10px] font-mono opacity-80 shrink-0 self-end sm:self-center">
                      {formatLogTimestamp(lastVerificationResult.timestamp)}
                    </span>
                  )}
                </div>
              )}

              {/* Quick Sync History Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="px-3 py-2 rounded-xl bg-white/90 border border-slate-200/90 flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold text-slate-600">Koneksi Berhasil Terakhir:</span>
                  <span className="text-[10.5px] font-mono font-bold text-emerald-700">
                    {latestSuccessLog ? formatLogTimestamp(latestSuccessLog.timestamp) : 'Belum tercatat'}
                  </span>
                </div>
                <div className="px-3 py-2 rounded-xl bg-white/90 border border-slate-200/90 flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold text-slate-600">Kegagalan Terakhir:</span>
                  <span className={`text-[10.5px] font-mono font-bold ${latestErrorLog ? 'text-rose-700' : 'text-slate-400'}`}>
                    {latestErrorLog ? formatLogTimestamp(latestErrorLog.timestamp) : 'Tidak ada kegagalan'}
                  </span>
                </div>
              </div>

              {/* Connection History Log Panel */}
              <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setShowFirestoreLogs((prev) => !prev);
                    }}
                    className="flex items-center gap-2 text-left cursor-pointer group"
                  >
                    <Activity className="w-3.5 h-3.5 text-sky-600" />
                    <span className="text-[11px] font-bold text-slate-800 group-hover:text-sky-700 transition-colors">
                      Log Koneksi Terakhir Firebase Firestore
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-200/80 text-slate-700 text-[10px] font-bold">
                      {firestoreLogs.length}
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    {firestoreLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          clearFirestoreConnectionLogs();
                          setLastVerificationResult(null);
                        }}
                        className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 text-[10px] font-semibold text-slate-600 transition-colors cursor-pointer"
                      >
                        Bersihkan Log
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setShowFirestoreLogs((prev) => !prev);
                      }}
                      className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[10px] font-semibold text-slate-600 transition-colors cursor-pointer"
                    >
                      {showFirestoreLogs ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                  </div>
                </div>

                {showFirestoreLogs && (
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {firestoreLogs.length === 0 ? (
                      <div className="p-4 text-center text-[11px] text-slate-500">
                        Belum ada log koneksi tercatat. Klik <span className="font-bold text-slate-700">Force Sync Now</span> untuk menguji koneksi secara langsung.
                      </div>
                    ) : (
                      firestoreLogs.map((log) => (
                        <div
                          key={log.id}
                          className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] hover:bg-slate-50/70 transition-colors"
                        >
                          <div className="flex items-start gap-2 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-black tracking-wide shrink-0 mt-0.5 border ${
                                log.status === 'SUCCESS'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : log.status === 'ERROR'
                                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : log.status === 'PAUSED'
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}
                            >
                              {log.status === 'SUCCESS'
                                ? 'BERHASIL'
                                : log.status === 'ERROR'
                                ? 'GAGAL'
                                : log.status === 'PAUSED'
                                ? 'DIJEDA'
                                : 'INFO'}
                            </span>
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-slate-800 font-mono text-[10px]">
                                  {log.operation}
                                </span>
                                {log.latencyMs !== undefined && log.latencyMs > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono text-[9.5px]">
                                    {log.latencyMs} ms
                                  </span>
                                )}
                                {log.errorCode && (
                                  <span className="px-1.5 py-0.2 rounded bg-rose-100/80 text-rose-700 font-mono text-[9.5px]">
                                    {log.errorCode}
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-600 leading-snug break-words">{log.message}</p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0 self-end sm:self-center">
                            {formatLogTimestamp(log.timestamp)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsClearDbModalOpen(true);
                }}
                className="px-4 py-2.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                title="Hapus seluruh data transaksi, produk, pelanggan, dan laporan untuk input dari awal (akun kasir/admin & password tetap aman)"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Kosongkan Database (Mulai dari Awal)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm('Kembalikan semua data ke sampel bawaan awal? Data Anda saat ini akan di-reset.')) {
                    onResetToDemoData();
                  }
                }}
                className="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Muat Data Demo</span>
              </button>
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-sm shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Semua Pengaturan</span>
            </button>
          </div>
        </form>
      </div>

      {/* MODAL: Konfirmasi Kosongkan Database (Mulai dari Awal) */}
      {isClearDbModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shadow-inner">
              <Trash2 className="w-7 h-7 stroke-[2.2]" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">
                Kosongkan Database (Mulai dari Awal)?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Anda akan mengosongkan seluruh database toko agar dapat memulai operasional kasir dari nol dengan data riil toko Anda.
              </p>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-start gap-2 text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span><strong>Akan Dihapus Bersih (Kembali Kosong):</strong> Semua data barang/produk &amp; multi satuan, kategori, transaksi penjualan, pelanggan &amp; kasbon/piutang, supplier &amp; PO, laporan penjualan &amp; laba rugi, riwayat absensi, stock opname, dan riwayat notifikasi.</span>
              </div>
              <div className="flex items-start gap-2 text-indigo-950 pt-2 border-t border-slate-200">
                <Users className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600" />
                <span><strong>Manajemen Pengguna Standar:</strong> Semua akun pengguna lain akan dihapus. Pengguna kembali ke standar yaitu <strong>hanya ada 1 user saja: Admin</strong> dengan <strong>PIN: 1234</strong> (privilege sebagai Admin).</span>
              </div>
              <div className="flex items-start gap-2 text-emerald-800 pt-2 border-t border-slate-200">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span><strong>Pengaturan Toko:</strong> Profil toko, alamat, dan metode pembayaran tetap tersimpan aman.</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={isClearingDb}
                onClick={() => setIsClearDbModalOpen(false)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={isClearingDb}
                onClick={async () => {
                  sound.playTap();
                  setIsClearingDb(true);
                  try {
                    if (onClearDatabaseExceptUsers) {
                      await onClearDatabaseExceptUsers();
                    }
                    sound.playSuccessChime();
                    setUserList([DEFAULT_ADMIN_USER]);
                    setIsClearDbModalOpen(false);
                  } finally {
                    setIsClearingDb(false);
                  }
                }}
                className={`py-2.5 px-4 rounded-xl text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isClearingDb
                    ? 'bg-slate-700 cursor-not-allowed opacity-80'
                    : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20 active:scale-95'
                }`}
              >
                {isClearingDb ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Mengosongkan Cloud...</span>
                  </>
                ) : (
                  <span>Ya, Kosongkan Sekarang</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Konfirmasi Pemulihan Data (Restore Preview) */}
      {importCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Konfirmasi Pemulihan Data
                  </h3>
                  <p className="text-xs text-slate-500">
                    File cadangan valid terdeteksi. Silakan periksa rincian data di bawah.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportCandidate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Candidate Metadata Summary */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>Nama Aplikasi:</span>
                <span className="font-bold text-slate-900">{importCandidate.app}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Waktu Cadangan Dibuat:</span>
                <span className="font-mono text-slate-800">
                  {new Date(importCandidate.exportedAt || importCandidate.timestamp).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Toko di File Cadangan:</span>
                <span className="font-bold text-sky-700">
                  {importCandidate.data.storeSettings?.storeName || 'Toko Default'}
                </span>
              </div>
            </div>

            {/* Item counts breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-emerald-50/60 border border-emerald-100 rounded-xl">
                <span className="text-[10.5px] font-bold text-emerald-800 block">Produk</span>
                <span className="text-base font-extrabold text-emerald-950 tabular-nums">
                  {formatNumber(importCandidate.data.products.length)}
                </span>
              </div>

              <div className="p-2.5 bg-sky-50/60 border border-sky-100 rounded-xl">
                <span className="text-[10.5px] font-bold text-sky-800 block">Pelanggan</span>
                <span className="text-base font-extrabold text-sky-950 tabular-nums">
                  {formatNumber(importCandidate.data.customers.length)}
                </span>
              </div>

              <div className="p-2.5 bg-amber-50/60 border border-amber-100 rounded-xl">
                <span className="text-[10.5px] font-bold text-amber-800 block">Supplier</span>
                <span className="text-base font-extrabold text-amber-950 tabular-nums">
                  {formatNumber(importCandidate.data.suppliers.length)}
                </span>
              </div>

              <div className="p-2.5 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                <span className="text-[10.5px] font-bold text-indigo-800 block">Transaksi</span>
                <span className="text-base font-extrabold text-indigo-950 tabular-nums">
                  {formatNumber(importCandidate.data.transactions.length)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10.5px] font-bold text-slate-600 block">PO Pembelian</span>
                <span className="text-base font-extrabold text-slate-900 tabular-nums">
                  {formatNumber(importCandidate.data.purchases?.length || 0)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10.5px] font-bold text-slate-600 block">Cashflow</span>
                <span className="text-base font-extrabold text-slate-900 tabular-nums">
                  {formatNumber(importCandidate.data.cashflows?.length || 0)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10.5px] font-bold text-slate-600 block">Stock Opname</span>
                <span className="text-base font-extrabold text-slate-900 tabular-nums">
                  {formatNumber(importCandidate.data.stockOpnames?.length || 0)}
                </span>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10.5px] font-bold text-slate-600 block">Order Online</span>
                <span className="text-base font-extrabold text-slate-900 tabular-nums">
                  {formatNumber(importCandidate.data.onlineOrders?.length || 0)}
                </span>
              </div>
            </div>

            {/* Option to restore users if available */}
            {importCandidate.data.users && importCandidate.data.users.length > 0 && (
              <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={restoreUsersOption}
                  onChange={(e) => setRestoreUsersOption(e.target.checked)}
                  disabled={isRestoringBackup}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800">
                  Pulihkan juga akun pengguna &amp; PIN ({importCandidate.data.users.length} akun terdaftar di file)
                </span>
              </label>
            )}

            {/* Warning banner */}
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="font-bold">Peringatan:</strong> Proses Restore from Backup akan menghapus dan mengganti seluruh data aktif saat ini (lokal &amp; Cloud Firestore) dengan data dari file backup ini.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={() => setImportCandidate(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={isRestoringBackup}
                onClick={handleConfirmRestore}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-60"
              >
                {isRestoringBackup ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Mengganti Data...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Ya, Ganti &amp; Pulihkan Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Tambah / Ubah Jenis Pembayaran & Upload JPG QRIS Statis */}
      {isPaymentMethodModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 md:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4 my-auto max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingMethodId ? 'Ubah Jenis Pembayaran' : 'Tambah Jenis Pembayaran Baru'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Konfigurasi metode pembayaran kasir dan QRIS statis
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentMethodModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleSavePaymentMethod} className="space-y-4 overflow-y-auto pr-1 flex-1">
              {/* Nama Metode */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nama Metode Pembayaran <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: QRIS Toko Berkah, QRIS ShopeePay, Transfer Bank BRI"
                  value={methodName}
                  onChange={(e) => setMethodName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-semibold focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Tipe / Kategori Pembayaran */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Kategori / Tipe Pembayaran <span className="text-rose-500">*</span>
                </label>
                <select
                  value={methodType}
                  onChange={(e) => {
                    const nextType = e.target.value as PaymentMethodType;
                    setMethodType(nextType);
                    setQrisUploadError(null);
                  }}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-semibold bg-white focus:border-sky-500 focus:outline-none cursor-pointer"
                >
                  <option value="QRIS">QRIS (Scan Kode QR Indonesian Standard)</option>
                  <option value="CASH">Tunai (Uang Tunai / Kas)</option>
                  <option value="BANK_TRANSFER">Transfer Bank (BCA, BRI, Mandiri, dll)</option>
                  <option value="CARD">Mesin EDC / Kartu (Debit / Kredit / Flazz)</option>
                  <option value="PIUTANG">Piutang (Tempo / Belanja Kasbon)</option>
                  <option value="OTHER">Lainnya (E-Wallet / Voucher)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Pilih kategori pembayaran agar kasir mendapatkan antarmuka yang sesuai saat transaksi.
                </p>
              </div>

              {/* CRITICAL CONDITIONAL SECTION: IF QRIS SELECTED, SHOW JPG UPLOAD INPUT */}
              {methodType === 'QRIS' && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-50/70 via-sky-50/50 to-white border-2 border-dashed border-sky-300 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Upload File JPG QRIS Statis
                        </span>
                        <span className="text-[10px] text-slate-500">
                          Khusus format gambar JPG / JPEG (.jpg / .jpeg)
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-200">
                      JPG WAJIB
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Unggah foto barcode QRIS statis dari rekening toko Anda. Gambar JPG ini akan langsung dimunculkan di layar POS saat kasir memilih pembayaran ini, siap di-scan pembeli.
                  </p>

                  <input
                    ref={qrisFileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,image/jpeg"
                    onChange={handleQrisJpgUpload}
                    className="hidden"
                  />

                  {/* Upload button & drop area */}
                  {!qrisDataUrl ? (
                    <div
                      onClick={() => qrisFileInputRef.current?.click()}
                      className="p-5 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-sky-50/50 hover:border-sky-400 flex flex-col items-center justify-center text-center cursor-pointer transition-all space-y-2 group"
                    >
                      <div className="w-10 h-10 rounded-full bg-sky-50 text-sky-600 group-hover:scale-110 flex items-center justify-center transition-transform">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-sky-700 block">
                          Klik untuk Memilih File JPG QRIS Statis
                        </span>
                        <span className="text-[10.5px] text-slate-400 mt-0.5 block">
                          Mendukung file: .jpg atau .jpeg (Maks. 5MB)
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Uploaded JPG Preview Card */
                    <div className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div
                          onClick={() =>
                            setPreviewZoomImage({
                              url: qrisDataUrl,
                              title: `Pratinjau JPG QRIS: ${methodName || 'QRIS Baru'}`,
                            })
                          }
                          className="relative w-16 h-16 rounded-lg bg-slate-50 border border-slate-300 overflow-hidden shrink-0 group cursor-zoom-in"
                          title="Klik untuk perbesar"
                        >
                          <img
                            src={qrisDataUrl}
                            alt="QRIS Preview"
                            className="w-full h-full object-contain"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                            <ZoomIn className="w-4 h-4" />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {qrisFileName || 'qris-statis.jpg'}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-emerald-700 font-semibold block mt-0.5">
                            Format JPG Terverifikasi &amp; Siap Ditampilkan
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewZoomImage({
                                url: qrisDataUrl,
                                title: `Pratinjau JPG QRIS: ${methodName || 'QRIS Baru'}`,
                              })
                            }
                            className="text-[10px] text-sky-600 hover:text-sky-800 font-bold underline mt-0.5 inline-block"
                          >
                            Lihat Tampilan Penuh
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={() => qrisFileInputRef.current?.click()}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
                        >
                          Ganti JPG
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQrisDataUrl('');
                            setQrisFileName('');
                          }}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Error Notification if any */}
                  {qrisUploadError && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{qrisUploadError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        NMID / ID Merchant (Opsional)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: ID10200388491"
                        value={methodAccountNumber}
                        onChange={(e) => setMethodAccountNumber(e.target.value)}
                        className="w-full p-2 rounded-lg border border-slate-300 text-xs font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Nama Toko di QRIS (Opsional)
                      </label>
                      <input
                        type="text"
                        placeholder="Contoh: TOKO BERKAH JAYA"
                        value={methodAccountName}
                        onChange={(e) => setMethodAccountName(e.target.value)}
                        className="w-full p-2 rounded-lg border border-slate-300 text-xs focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Section for Bank Transfer & Card */}
              {(methodType === 'BANK_TRANSFER' || methodType === 'CARD') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {methodType === 'BANK_TRANSFER' ? 'Nomor Rekening Bank' : 'Nomor Terminal EDC / ID Mesin'}
                    </label>
                    <input
                      type="text"
                      placeholder={methodType === 'BANK_TRANSFER' ? 'Contoh: 8830192819' : 'Contoh: EDC-BCA-01'}
                      value={methodAccountNumber}
                      onChange={(e) => setMethodAccountNumber(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-slate-300 text-xs font-mono font-bold bg-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      {methodType === 'BANK_TRANSFER' ? 'Nama Pemilik Rekening' : 'Bank Penyedia EDC'}
                    </label>
                    <input
                      type="text"
                      placeholder={methodType === 'BANK_TRANSFER' ? 'Contoh: PT Toko Berkah Jaya' : 'Contoh: Bank Central Asia'}
                      value={methodAccountName}
                      onChange={(e) => setMethodAccountName(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-slate-300 text-xs bg-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Catatan / Keterangan Pembayaran */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Catatan / Instruksi Kasir (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pastikan bukti transfer / struk EDC dicek sebelum menyelesaikan transaksi"
                  value={methodDescription}
                  onChange={(e) => setMethodDescription(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Status Switch */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">
                    Status Aktif Metode Pembayaran
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Jika aktif, kasir dapat memilih metode ini pada menu pembayaran POS.
                  </span>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={methodIsActive}
                    onChange={(e) => setMethodIsActive(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPaymentMethodModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-sky-600/20 transition-all cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingMethodId ? 'Perbarui Metode' : 'Simpan Jenis Pembayaran'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Full Screen Zoom Preview of QRIS Image */}
      {previewZoomImage && (
        <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4 text-center">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 truncate text-left">
                {previewZoomImage.title}
              </span>
              <button
                type="button"
                onClick={() => setPreviewZoomImage(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-white rounded-2xl border-2 border-slate-200 shadow-inner flex items-center justify-center">
              <img
                src={previewZoomImage.url}
                alt="Zoom QRIS"
                className="max-h-72 w-auto object-contain rounded"
              />
            </div>

            <p className="text-[11px] text-slate-500">
              Pratinjau resolusi tinggi JPG QRIS siap di-scan langsung oleh kamera aplikasi m-Banking atau E-Wallet pembeli.
            </p>

            <button
              type="button"
              onClick={() => setPreviewZoomImage(null)}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs transition-colors"
            >
              Tutup Pratinjau
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
