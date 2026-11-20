import React, { useState, useMemo, useEffect, useRef, useDeferredValue, useCallback, memo } from 'react';
import { 
  Search, 
  Barcode, 
  Trash2, 
  Plus, 
  Minus, 
  UserPlus, 
  Sparkles, 
  Layers, 
  X, 
  CreditCard, 
  Phone, 
  MessageCircle, 
  AlertCircle, 
  Tag,
  Bell,
  BellRing,
  AlertTriangle,
  Volume2,
  VolumeX,
  Eye,
  ShieldAlert,
  ArrowRight,
  Truck,
  CheckCircle2,
  Sliders,
  Award,
  Keyboard,
  HelpCircle,
  CornerDownLeft,
  ShoppingCart,
  BarChart2,
  TrendingUp,
  ChevronUp,
  ChevronDown,
  Target,
  Check,
  Trophy,
  GripVertical,
  ArrowUpDown,
  SlidersHorizontal,
  RotateCcw,
  Wrench,
  Clock,
  UserCheck,
  Edit3,
  Zap,
  QrCode,
  PackageSearch,
  History,
  User,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip as RechartsTooltip, 
  CartesianGrid 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Product, ProductUnit, ProductCategory, Customer, CartItem, StoreSettings, StockAlertNotification, Transaction } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getCategoryColor } from '../utils/categoryColors';
import {
  getCustomerCategoryBadge,
  findCustomerSpecialPrice,
  findUpcomingCustomerSpecialPrice,
  isCustomerMember,
  calculatePointsEarned,
  getCustomerMembershipId,
} from '../utils/customerUtils';
import { 
  isNotificationSupported, 
  requestNotificationPermission, 
  sendWebPushNotification, 
  getNotificationPermission 
} from '../utils/notifications';
import { StockAlertWidget } from './StockAlertWidget';
import { StockNotificationToast } from './StockNotificationToast';
import { TouchKeypadModal } from './TouchKeypadModal';

interface TabletPOSViewProps {
  products: Product[];
  categories?: ProductCategory[];
  customers: Customer[];
  cart: CartItem[];
  selectedCustomer: Customer | null;
  usePoints: boolean;
  pointsToUse: number;
  storeSettings: StoreSettings;
  onAddToCart: (product: Product, unit: ProductUnit, qty?: number, selectedVariant?: string) => void;
  onAddQuickSaleItem?: (item: {
    description: string;
    amount: number;
    adminFee?: number;
    quantity: number;
    unitName?: string;
    isCashWithdrawal?: boolean;
  }) => { ok: boolean; error?: string; availableCashBalance?: number; blocked?: boolean } | void;
  onUpdateCartItemQty: (cartItemId: string, newQty: number) => void;
  onUpdateCartItemPrice?: (cartItemId: string, newUnitPrice: number, reason?: string) => void;
  onChangeCartItemUnit: (cartItemId: string, newUnit: ProductUnit) => void;
  onRemoveCartItem: (cartItemId: string) => void;
  onClearCart: () => void;
  onSelectCustomer: (customer: Customer | null) => void;
  onOpenCustomerModal: () => void;
  onToggleUsePoints: (use: boolean) => void;
  onChangePointsToUse?: (points: number) => void;
  onOpenPaymentModal: () => void;
  onOpenScannerModal: (mode?: 'SCAN' | 'STOCK_LOOKUP' | 'MEMBER_QR') => void;
  onDirectScanInput?: (rawCode: string) => void;
  scanFeedbackNotice?: { type: 'success' | 'error'; message: string } | null;
  onDismissScanFeedback?: () => void;
  onOpenThresholdSettings: () => void;
  onNavigateToSuppliers?: () => void;
  transactions?: Transaction[];
  availableStoreCashBalance?: number;
  specialPriceNotice?: {
    customerName: string;
    category: string;
    updatedCount: number;
    totalSaved: number;
    itemNames: string[];
    timestamp: number;
  } | null;
  onDismissSpecialPriceNotice?: () => void;
}

const POS_VISIBLE_BATCH = 48;

const escapeSearchRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const HighlightMatchText: React.FC<{ text: string; query?: string; highlightClassName?: string }> = ({
  text,
  query,
  highlightClassName = 'bg-amber-200 text-slate-950 font-bold rounded-[3px] px-0.5',
}) => {
  const trimmed = (query || '').trim();
  if (!trimmed || !text) return <>{text}</>;
  const regex = new RegExp(`(${escapeSearchRegex(trimmed)})`, 'gi');
  const parts = text.split(regex);
  const lowerQuery = trimmed.toLowerCase();

  return (
    <>
      {parts.map((part, idx) =>
        part.toLowerCase() === lowerQuery ? (
          <mark key={idx} className={highlightClassName}>
            {part}
          </mark>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        )
      )}
    </>
  );
};

interface POSProductCardProps {
  product: Product;
  catColor: string;
  customerCategory?: string;
  isHighlighted: boolean;
  searchQuery?: string;
  onSelect: (product: Product) => void;
  onNavigateToSuppliers?: () => void;
}

const POSProductCard = memo<POSProductCardProps>(({
  product,
  catColor,
  customerCategory,
  isHighlighted,
  searchQuery,
  onSelect,
  onNavigateToSuppliers,
}) => {
  const isService = product.productType === 'JASA';
  const isOutOfStock = !isService && product.stockInBaseUnit <= 0;
  const isLowStock = !isService && product.stockInBaseUnit > 0 && product.stockInBaseUnit <= product.minStockAlert;
  const defaultUnit = product.units[0];
  const stockRatio = product.minStockAlert > 0 ? (product.stockInBaseUnit / product.minStockAlert) * 100 : 0;

  const trimmedQuery = (searchQuery || '').trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const matchedCode = normalizedQuery
    ? (product.sku && product.sku.toLowerCase().includes(normalizedQuery)
        ? `SKU: ${product.sku}`
        : product.barcode && product.barcode.toLowerCase().includes(normalizedQuery)
        ? `Barcode: ${product.barcode}`
        : product.units.find((u) => u.barcode && u.barcode.toLowerCase().includes(normalizedQuery))?.barcode
        ? `Barcode: ${product.units.find((u) => u.barcode && u.barcode.toLowerCase().includes(normalizedQuery))?.barcode}`
        : null)
    : null;
  const matchedVariant = normalizedQuery
    ? product.variants?.find(
        (v) =>
          v.name.toLowerCase().includes(normalizedQuery) ||
          (v.barcode && v.barcode.toLowerCase().includes(normalizedQuery))
      )
    : undefined;

  const activeSpecial = customerCategory
    ? findCustomerSpecialPrice(product, customerCategory, defaultUnit, 1)
    : null;
  const upcomingSpecial = customerCategory && !activeSpecial
    ? findUpcomingCustomerSpecialPrice(product, customerCategory, defaultUnit, 0)
    : null;

  return (
    <div
      id={`product-card-${product.id}`}
      onClick={() => !isOutOfStock && onSelect(product)}
      className={`group bg-white rounded-2xl border p-3 flex flex-col justify-between transition-colors duration-150 relative select-none ${
        isHighlighted
          ? 'ring-4 ring-sky-500 shadow-xl z-20 border-sky-500 bg-sky-50/20'
          : isOutOfStock
          ? 'opacity-75 cursor-not-allowed border-rose-300 bg-rose-50/20 ring-1 ring-rose-400/30'
          : isLowStock
          ? 'border-amber-400 bg-amber-50/20 shadow-xs ring-2 ring-amber-400/40 hover:border-amber-500'
          : isService
          ? 'hover:border-purple-500 hover:shadow-md cursor-pointer border-purple-100 bg-purple-50/10 active:scale-[0.98]'
          : 'hover:border-sky-500 hover:shadow-md cursor-pointer border-slate-200/90 active:scale-[0.98]'
      }`}
    >
      <div>
        {/* Image & Badges */}
        <div className="relative aspect-4/3 rounded-xl bg-slate-100 overflow-hidden mb-2.5">
          {isHighlighted && (
            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-black tracking-wide shadow-md flex items-center gap-1 z-20">
              <Sparkles className="w-3 h-3" />
              <span>DISOROT</span>
            </div>
          )}

          {!isHighlighted && isService && (
            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-purple-600 text-white text-[10px] font-black shadow-xs flex items-center gap-1 z-10">
              <Wrench className="w-3 h-3 stroke-[2.5]" />
              <span>JASA</span>
              {product.serviceDurationMinutes && product.serviceDurationMinutes > 0 ? (
                <span className="text-purple-200 ml-0.5 font-mono">· {product.serviceDurationMinutes}m</span>
              ) : null}
            </div>
          )}

          {!isHighlighted && !isService && isLowStock && (
            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black shadow-xs flex items-center gap-1 z-10">
              <AlertTriangle className="w-3 h-3 stroke-[2.5]" />
              <span>BATAS MINIMUM</span>
            </div>
          )}

          {!isHighlighted && !isService && isOutOfStock && (
            <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black shadow-xs flex items-center gap-1 z-10">
              <AlertCircle className="w-3 h-3" />
              <span>HABIS (0)</span>
            </div>
          )}

          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center font-bold text-xs"
              style={{
                backgroundColor: isService ? '#9333ea15' : `${catColor}12`,
                color: isService ? '#7e22ce' : catColor,
              }}
            >
              {isService ? (
                <>
                  <Wrench className="w-8 h-8 mb-1 opacity-80" />
                  <span className="text-[10px] font-bold">Layanan Jasa</span>
                </>
              ) : (
                <>
                  <span className="text-lg font-black">{product.name.charAt(0)}</span>
                  <span className="text-[10px] opacity-80">{product.category}</span>
                </>
              )}
            </div>
          )}

          {/* Stock indicator badge */}
          <div className={`absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs font-mono ${
            isService
              ? 'bg-purple-950/90 text-purple-100 border border-purple-400/40'
              : isOutOfStock
              ? 'bg-rose-900/95 text-white'
              : isLowStock
              ? 'bg-amber-600/95 text-white border border-amber-300/60'
              : 'bg-slate-900/85 text-white'
          }`}>
            {isService ? `Non-Stok (∞) / ${product.baseUnit}` : `Stok: ${formatNumber(product.stockInBaseUnit)} ${product.baseUnit}`}
          </div>

          {/* Multi-unit and/or Variant badge */}
          <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1 z-10">
            {product.units.length > 1 && (
              <div className={`px-1.5 py-0.5 rounded text-white text-[10px] font-bold shadow-xs flex items-center gap-1 ${
                isService ? 'bg-purple-600' : 'bg-sky-500'
              }`}>
                <Layers className="w-3 h-3" />
                <span>{product.units.length} {isService ? 'Paket' : 'Satuan'}</span>
              </div>
            )}
            {product.variants && product.variants.length > 0 && (
              <div className="px-1.5 py-0.5 rounded text-white text-[9.5px] font-bold shadow-xs flex items-center gap-1 bg-indigo-600">
                <Sliders className="w-2.5 h-2.5" />
                <span>{product.variants.length} {product.variantLabel || 'Varian'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Color-Coded Category Pill */}
        <div className="mb-1 flex items-center gap-1">
          <span
            style={{
              backgroundColor: `${catColor}14`,
              color: catColor,
              borderColor: `${catColor}35`,
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border max-w-full truncate"
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: catColor }}
            />
            <span className="truncate">
              <HighlightMatchText text={product.category} query={trimmedQuery} />
            </span>
          </span>

          {isService && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9.5px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
              JASA
            </span>
          )}
        </div>

        <h3 className="text-xs md:text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
          <HighlightMatchText text={product.name} query={trimmedQuery} />
        </h3>

        {(matchedCode || matchedVariant) && (
          <div className="mt-1 text-[10px] font-mono text-slate-600 truncate">
            {matchedCode && (
              <HighlightMatchText text={matchedCode} query={trimmedQuery} />
            )}
            {matchedCode && matchedVariant ? ' · ' : ''}
            {matchedVariant && (
              <span>
                Varian: <HighlightMatchText text={matchedVariant.name} query={trimmedQuery} />
              </span>
            )}
          </div>
        )}

        {isService && product.technicianName && (
          <div className="mt-1 flex items-center gap-1 text-[10.5px] text-purple-700 font-semibold truncate">
            <UserCheck className="w-3 h-3 text-purple-600 shrink-0" />
            <span className="truncate">Petugas: {product.technicianName}</span>
          </div>
        )}
      </div>

      {/* Pricing and Unit selection indicator */}
      <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
        <div className="min-w-0 pr-1">
          <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center gap-1 flex-wrap">
            <span>
              {isService ? 'Tarif / ' : ''}
              <HighlightMatchText text={defaultUnit.unitName} query={trimmedQuery} />
            </span>
            {activeSpecial && (
              <span className="px-1 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 text-[8.5px] font-black">
                🏷️ {customerCategory}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <div className={`text-sm md:text-base font-bold font-mono tabular-nums ${
              activeSpecial
                ? 'text-purple-700'
                : isService
                ? 'text-purple-700'
                : 'text-sky-700'
            }`}>
              {formatRupiah(activeSpecial ? activeSpecial.specialPrice : defaultUnit.sellingPrice)}
            </div>
            {activeSpecial && activeSpecial.specialPrice !== defaultUnit.sellingPrice && (
              <span className="text-[10px] text-slate-400 line-through font-mono">
                {formatRupiah(defaultUnit.sellingPrice)}
              </span>
            )}
          </div>
          {upcomingSpecial && (
            <div className="text-[9.5px] font-bold text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5 mt-0.5 inline-block truncate max-w-full">
              🎯 {formatRupiah(upcomingSpecial.nextRule.price)} (Min. {upcomingSpecial.minQuantity} {defaultUnit.unitName})
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(product);
          }}
          disabled={isOutOfStock}
          className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shadow-xs ${
            isService
              ? 'bg-purple-50 group-hover:bg-purple-600 text-purple-600 group-hover:text-white'
              : 'bg-sky-50 group-hover:bg-sky-600 text-sky-600 group-hover:text-white'
          }`}
          title={isService ? 'Tambahkan Jasa ke Transaksi' : 'Tambahkan Barang'}
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      {/* Explicit visual stock threshold alert meter */}
      {isLowStock && (
        <div className="mt-2 p-1.5 rounded-lg bg-amber-500/15 border border-amber-400/50 space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold text-amber-900">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-600"></span>
              <span>KRITIS: Sisa {formatNumber(product.stockInBaseUnit)} {product.baseUnit}</span>
            </span>
            <span className="font-mono text-slate-600">Min {product.minStockAlert}</span>
          </div>
          <div className="w-full h-1.5 bg-amber-200/70 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-600 rounded-full"
              style={{ width: `${Math.min(100, Math.max(8, stockRatio))}%` }}
            />
          </div>
        </div>
      )}

      {isOutOfStock && (
        <div className="mt-2 p-1.5 rounded-lg bg-rose-500/15 border border-rose-400/50 flex items-center justify-between text-[10px] font-black text-rose-800">
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>STOK KOSONG (0 {product.baseUnit})</span>
          </span>
          {onNavigateToSuppliers && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToSuppliers();
              }}
              className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold text-[9px] shadow-2xs"
            >
              Restock PO
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export const TabletPOSView: React.FC<TabletPOSViewProps> = ({
  products,
  categories = [],
  customers,
  cart,
  selectedCustomer,
  usePoints,
  pointsToUse,
  storeSettings,
  transactions = [],
  availableStoreCashBalance,
  specialPriceNotice = null,
  onDismissSpecialPriceNotice,
  onAddToCart,
  onAddQuickSaleItem,
  onUpdateCartItemQty,
  onUpdateCartItemPrice,
  onChangeCartItemUnit,
  onRemoveCartItem,
  onClearCart,
  onSelectCustomer,
  onOpenCustomerModal,
  onToggleUsePoints,
  onChangePointsToUse,
  onOpenPaymentModal,
  onOpenScannerModal,
  onDirectScanInput,
  scanFeedbackNotice = null,
  onDismissScanFeedback,
  onOpenThresholdSettings,
  onNavigateToSuppliers,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');
  const [visibleLimit, setVisibleLimit] = useState<number>(POS_VISIBLE_BATCH);
  const productGridScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const [unitSelectModalProduct, setUnitSelectModalProduct] = useState<Product | null>(null);
  const [selectedVariantForModal, setSelectedVariantForModal] = useState<string>('');
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = useState(false);
  const [isQuickReportsOpen, setIsQuickReportsOpen] = useState(false);
  const [isQuickSaleModalOpen, setIsQuickSaleModalOpen] = useState(false);
  const [quickSaleDescription, setQuickSaleDescription] = useState('');
  const [quickSaleAmount, setQuickSaleAmount] = useState('');
  const [quickSaleAdminFee, setQuickSaleAdminFee] = useState('');
  const [quickSaleQty, setQuickSaleQty] = useState(1);
  const [quickSaleUnit, setQuickSaleUnit] = useState('ITEM');
  const [quickSaleError, setQuickSaleError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quickSaleDescInputRef = useRef<HTMLInputElement>(null);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (let i = 0; i < products.length; i++) {
      map.set(products[i].id, products[i]);
    }
    return map;
  }, [products]);

  const categoryCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < products.length; i++) {
      const catKey = (products[i].category || '').toLowerCase();
      map.set(catKey, (map.get(catKey) || 0) + 1);
    }
    return map;
  }, [products]);

  // Touch Price Editor Modal state
  const [priceEditTarget, setPriceEditTarget] = useState<{
    cartItemId: string;
    productId: string;
    productName: string;
    unitName: string;
    originalPrice: number;
    currentPrice: number;
    quantity: number;
  } | null>(null);

  // Customer Product Selling Price History Modal state
  const [priceHistoryTarget, setPriceHistoryTarget] = useState<CartItem | null>(null);
  const [priceHistoryCustomerQuery, setPriceHistoryCustomerQuery] = useState<string>('');
  const [priceHistoryShowAllCustomers, setPriceHistoryShowAllCustomers] = useState<boolean>(false);

  interface CustomerProductPriceRecord {
    id: string;
    txId: string;
    invoiceNumber: string;
    timestamp: number;
    cashierName: string;
    customerId?: string;
    customerName: string;
    productId: string;
    productName: string;
    unitName: string;
    selectedVariant?: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    isCustomerSpecialPrice?: boolean;
  }

  const allProductCustomerSales = useMemo<CustomerProductPriceRecord[]>(() => {
    const records: CustomerProductPriceRecord[] = [];
    (transactions || []).forEach((tx) => {
      const custName = (tx.customerName || 'Pelanggan Umum').trim();
      (tx.items || []).forEach((it, idx) => {
        records.push({
          id: `${tx.id}_${idx}`,
          txId: tx.id,
          invoiceNumber: tx.invoiceNumber,
          timestamp: tx.timestamp,
          cashierName: tx.cashierName || '-',
          customerId: tx.customerId,
          customerName: custName,
          productId: it.productId,
          productName: it.productName,
          unitName: it.unitName,
          selectedVariant: it.selectedVariant,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalAmount: it.totalAmount,
          isCustomerSpecialPrice: it.isCustomerSpecialPrice,
        });
      });
    });
    return records.sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions]);

  const getProductSalesHistory = useCallback(
    (cartItem: CartItem, customer?: Customer | null): CustomerProductPriceRecord[] => {
      const normItemName = (cartItem.productName || '').trim().toLowerCase();
      const normCustName = (customer?.name || '').trim().toLowerCase();

      return allProductCustomerSales.filter((rec) => {
        const sameProduct =
          (rec.productId && cartItem.productId && rec.productId === cartItem.productId) ||
          (normItemName !== '' && rec.productName.trim().toLowerCase() === normItemName);
        if (!sameProduct) return false;

        if (!customer) return true;
        const matchId = Boolean(customer.id && rec.customerId && rec.customerId === customer.id);
        const matchName =
          normCustName !== '' && rec.customerName.trim().toLowerCase() === normCustName;
        return matchId || matchName;
      });
    },
    [allProductCustomerSales]
  );

  const openCartPriceHistory = useCallback(
    (item: CartItem) => {
      setPriceHistoryTarget(item);
      setPriceHistoryCustomerQuery('');
      setPriceHistoryShowAllCustomers(!selectedCustomer);
    },
    [selectedCustomer]
  );

  // Portrait Tablet Mode & Tabbed Layout State
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        if (typeof window.matchMedia === 'function') {
          const mql = window.matchMedia('(orientation: portrait)');
          if (mql && typeof mql.matches === 'boolean') {
            return mql.matches || window.innerWidth < 768;
          }
        }
      } catch {}
      return window.innerWidth < 768;
    }
    return false;
  });
  const [portraitTab, setPortraitTab] = useState<'CATALOG' | 'CART'>('CATALOG');

  // Dynamic Keypad Modal state
  const [keypadTarget, setKeypadTarget] = useState<{
    cartItemId: string;
    productName: string;
    unitName: string;
    currentQty: number;
  } | null>(null);

  useEffect(() => {
    const handleCheckOrientation = () => {
      let isPort = false;
      try {
        if (typeof window.matchMedia === 'function') {
          const mql = window.matchMedia('(orientation: portrait)');
          if (mql && typeof mql.matches === 'boolean') {
            isPort = mql.matches;
          }
        }
      } catch {}
      setIsPortrait(isPort || window.innerWidth < 768);
    };

    window.addEventListener('resize', handleCheckOrientation);
    window.addEventListener('orientationchange', handleCheckOrientation);
    return () => {
      window.removeEventListener('resize', handleCheckOrientation);
      window.removeEventListener('orientationchange', handleCheckOrientation);
    };
  }, []);

  // Automated Stock Alert & Push Notification System states
  const [activePushToast, setActivePushToast] = useState<StockAlertNotification | null>(null);
  const [alertHistory, setAlertHistory] = useState<StockAlertNotification[]>(() => {
    try {
      const saved = localStorage.getItem('kasir_stock_alert_history');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          // Clean out any stale alerts for deleted items or items not in current products list
          const validIds = new Set(products.map((p) => p.id));
          const validNames = new Set(products.map((p) => p.name.toLowerCase()));
          return parsed.filter(
            (a: StockAlertNotification) =>
              validIds.has(a.productId) || (a.productName && validNames.has(a.productName.toLowerCase()))
          );
        }
      }
      return [];
    } catch {
      return [];
    }
  });
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
    } catch {
      return false;
    }
  });
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('kasir_sound_alerts_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  // Automatically prune orphan notifications when products list changes (e.g. when Bimoli or any product is deleted)
  useEffect(() => {
    const validIds = new Set(products.map((p) => p.id));
    const validNames = new Set(products.map((p) => p.name.toLowerCase()));

    setAlertHistory((prev) => {
      const validAlerts = prev.filter(
        (a) => validIds.has(a.productId) || (a.productName && validNames.has(a.productName.toLowerCase()))
      );
      if (validAlerts.length !== prev.length) {
        try {
          localStorage.setItem('kasir_stock_alert_history', JSON.stringify(validAlerts));
        } catch {}
        return validAlerts;
      }
      return prev;
    });

    if (activePushToast) {
      const exists =
        validIds.has(activePushToast.productId) ||
        (activePushToast.productName && validNames.has(activePushToast.productName.toLowerCase()));
      if (!exists) {
        setActivePushToast(null);
      }
    }
  }, [products]);

  const handleClearAllAlerts = () => {
    sound.playTap();
    setAlertHistory([]);
    setActivePushToast(null);
    try {
      localStorage.removeItem('kasir_stock_alert_history');
    } catch {}
  };

  // Track stock levels to trigger automated push alert when a product reaches minimum threshold
  const prevStocksRef = useRef<Map<string, number>>(new Map());
  const initialLoadRef = useRef(true);

  // Low stock products count (physical products only, JASA is non-stock)
  const lowStockProducts = useMemo(() => {
    return products.filter((p) => p.productType !== 'JASA' && p.stockInBaseUnit <= p.minStockAlert);
  }, [products]);

  // Automated Stock Reduction Detection: Triggers Push Alert & Visual Chime
  useEffect(() => {
    const prevMap = prevStocksRef.current;

    products.forEach((prod) => {
      if (prod.productType === 'JASA') return; // Jasa tidak memiliki stok fisik
      const prev = prevMap.get(prod.id);
      if (prev !== undefined) {
        // Did this product just reach or fall below minimum threshold?
        const crossedThreshold = prev > prod.minStockAlert && prod.stockInBaseUnit <= prod.minStockAlert;
        const reachedZero = prev > 0 && prod.stockInBaseUnit <= 0;

        if (crossedThreshold || reachedZero) {
          const newAlert: StockAlertNotification = {
            id: 'alert_' + Date.now() + '_' + prod.id,
            productId: prod.id,
            productName: prod.name,
            category: prod.category,
            currentStock: prod.stockInBaseUnit,
            minThreshold: prod.minStockAlert,
            baseUnit: prod.baseUnit,
            timestamp: Date.now(),
            read: false,
            type: prod.stockInBaseUnit <= 0 ? 'CRITICAL_ZERO' : 'WARNING',
          };

          // Trigger automated visual toast banner
          setActivePushToast(newAlert);

          // Add to alert history log
          setAlertHistory((prevList) => [newAlert, ...prevList.slice(0, 49)]);

          // Audio alert
          if (soundAlertsEnabled) {
            sound.playWarningChime();
          }

          // Native OS push notification
          if (browserNotificationsEnabled) {
            sendWebPushNotification(
              prod.stockInBaseUnit <= 0 ? `🚨 STOK HABIS: ${prod.name}` : `⚠️ AMBANG BATAS: ${prod.name}`,
              {
                body: `Sisa stok ${prod.stockInBaseUnit} ${prod.baseUnit} (Batas minimum: ${prod.minStockAlert} ${prod.baseUnit}). Segera restock!`,
                tag: 'stock-alert-' + prod.id,
              }
            );
          }
        }
      }
      prevMap.set(prod.id, prod.stockInBaseUnit);
    });

    initialLoadRef.current = false;
  }, [products, browserNotificationsEnabled, soundAlertsEnabled]);

  // Persist alert settings
  useEffect(() => {
    try {
      localStorage.setItem('kasir_stock_alert_history', JSON.stringify(alertHistory));
    } catch {}
  }, [alertHistory]);

  useEffect(() => {
    try {
      localStorage.setItem('kasir_sound_alerts_enabled', String(soundAlertsEnabled));
    } catch {}
  }, [soundAlertsEnabled]);

  // =========================================================================
  // SMART LOW-STOCK ALERT (WARN WHEN ADDING TO CART PUSHES STOCK <= MIN ALERT)
  // =========================================================================
  interface SmartStockAlertInfo {
    id: string;
    productName: string;
    projectedStock: number;
    minThreshold: number;
    baseUnit: string;
    productId: string;
  }
  const [smartStockWarning, setSmartStockWarning] = useState<SmartStockAlertInfo | null>(null);

  // Auto-dismiss smart low stock warning after 7 seconds
  useEffect(() => {
    if (!smartStockWarning) return;
    const timer = setTimeout(() => {
      setSmartStockWarning(null);
    }, 7000);
    return () => clearTimeout(timer);
  }, [smartStockWarning]);

  // Smart check if adding quantity will push inventory below safety threshold
  const checkSmartStockWarning = (product: Product, addingBaseUnits: number) => {
    if (product.productType === 'JASA') return; // Jasa tidak memiliki stok fisik
    const currentCartBaseUnits = cart
      .filter((c) => c.productId === product.id)
      .reduce((sum, c) => sum + c.quantity * (c.selectedUnit?.conversionFactor || 1), 0);

    const projectedStock = product.stockInBaseUnit - (currentCartBaseUnits + addingBaseUnits);

    if (projectedStock <= product.minStockAlert) {
      setSmartStockWarning({
        id: 'smart_warn_' + Date.now(),
        productName: product.name,
        projectedStock: Math.max(0, projectedStock),
        minThreshold: product.minStockAlert,
        baseUnit: product.baseUnit,
        productId: product.id,
      });

      if (soundAlertsEnabled) {
        sound.playWarningChime();
      }

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        sendWebPushNotification(`⚠️ Peringatan Stok Kritis: ${product.name}`, {
          body: `Stok tersisa akan menjadi ${Math.max(0, projectedStock)} ${product.baseUnit} (Batas minimum: ${product.minStockAlert} ${product.baseUnit}).`,
          tag: 'smart-low-stock-' + product.id,
        });
      }
    }
  };

  // =========================================================================
  // MINI-DASHBOARD REAL-TIME PERFORMANCE KPIS IN POS FOOTER
  // =========================================================================
  const [isMiniDashboardOpen, setIsMiniDashboardOpen] = useState<boolean>(false);

  interface TopSellingProductToday {
    productId: string;
    name: string;
    qty: number;
    revenue: number;
    unitName: string;
  }

  interface TodayPerformanceStats {
    todayTxs: Transaction[];
    totalRevenue: number;
    totalTransactions: number;
    avgBasketSize: number;
    topProduct: { name: string; qty: number } | null;
    top3Products: TopSellingProductToday[];
  }

  const todayStats = useMemo<TodayPerformanceStats>(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startTs = startOfToday.getTime();

    const todayTxs = (transactions || []).filter((tx) => tx.timestamp >= startTs);
    const totalRevenue = todayTxs.reduce((sum, tx) => sum + (tx.finalAmount || 0), 0);
    const totalTransactions = todayTxs.length;
    const avgBasketSize = totalTransactions > 0 ? Math.round(totalRevenue / totalTransactions) : 0;

    const productCountMap = new Map<string, TopSellingProductToday>();
    todayTxs.forEach((tx) => {
      tx.items.forEach((item) => {
        const key = item.productId || item.productName;
        const cur = productCountMap.get(key) || {
          productId: key,
          name: item.productName,
          qty: 0,
          revenue: 0,
          unitName: item.unitName || 'PCS',
        };
        cur.qty += item.quantity;
        cur.revenue += item.totalAmount || 0;
        productCountMap.set(key, cur);
      });
    });

    const sortedProducts = Array.from(productCountMap.values()).sort((a, b) => {
      if (b.qty !== a.qty) return b.qty - a.qty;
      return b.revenue - a.revenue;
    });

    const topProductItem = sortedProducts[0]
      ? { name: sortedProducts[0].name, qty: sortedProducts[0].qty }
      : null;

    return {
      todayTxs,
      totalRevenue,
      totalTransactions,
      avgBasketSize,
      topProduct: topProductItem,
      top3Products: sortedProducts.slice(0, 3),
    };
  }, [transactions]);

  // Mini-Dashboard view mode: 'OVERVIEW' vs 'TREND'
  const [miniDashboardTab, setMiniDashboardTab] = useState<'OVERVIEW' | 'TREND'>('OVERVIEW');

  // Milestone celebration toast state for daily sales target
  const [milestoneToast, setMilestoneToast] = useState<{ goal: number; revenue: number } | null>(null);

  // 7-Day Sales Trend Calculation for Recharts
  const sevenDaysTrend = useMemo(() => {
    const days: { dateKey: string; label: string; fullDate: string; revenue: number; txCount: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = i === 0 ? 'Hari Ini' : d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
      const fullDate = d.toLocaleDateString('id-ID', { dateStyle: 'full' });
      days.push({
        dateKey,
        label,
        fullDate,
        revenue: 0,
        txCount: 0,
      });
    }

    const map = new Map(days.map((item) => [item.dateKey, item]));

    (transactions || []).forEach((tx) => {
      const txD = new Date(tx.timestamp);
      const key = `${txD.getFullYear()}-${String(txD.getMonth() + 1).padStart(2, '0')}-${String(txD.getDate()).padStart(2, '0')}`;
      const existing = map.get(key);
      if (existing) {
        existing.revenue += tx.finalAmount || 0;
        existing.txCount += 1;
      }
    });

    return days;
  }, [transactions]);

  // Daily Sales Milestone Alert Trigger
  useEffect(() => {
    const dailyGoal = storeSettings?.dailySalesGoal && storeSettings.dailySalesGoal > 0 ? storeSettings.dailySalesGoal : 5000000;
    if (todayStats.totalRevenue >= dailyGoal && dailyGoal > 0) {
      const todayStr = new Date().toISOString().split('T')[0];
      const storageKey = 'kasir_milestone_celebrated_' + todayStr;
      const alreadyCelebrated = localStorage.getItem(storageKey);

      if (!alreadyCelebrated) {
        try {
          localStorage.setItem(storageKey, 'true');
        } catch {}
        setMilestoneToast({
          goal: dailyGoal,
          revenue: todayStats.totalRevenue,
        });

        if (soundAlertsEnabled) {
          sound.playSuccessChime();
        }

        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          sendWebPushNotification('🎉 Target Omzet Harian Tercapai!', {
            body: `Selamat! Toko telah mencapai omzet ${formatRupiah(todayStats.totalRevenue)} dari target ${formatRupiah(dailyGoal)}. Pencapaian luar biasa tim!`,
            tag: 'milestone-daily-goal-reached',
          });
        }
      }
    }
  }, [todayStats.totalRevenue, storeSettings?.dailySalesGoal, soundAlertsEnabled]);

  const handleToggleBrowserNotifications = async () => {
    sound.playTap();
    if (!isNotificationSupported()) {
      alert('Browser Anda tidak mendukung Web Notification API.');
      return;
    }

    if (Notification.permission === 'granted') {
      setBrowserNotificationsEnabled(!browserNotificationsEnabled);
      return;
    }

    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      setBrowserNotificationsEnabled(true);
      sendWebPushNotification('Notifikasi Ambang Batas Aktif', {
        body: 'Anda akan menerima notifikasi saat produk mencapai batas minimum.',
      });
    } else {
      alert('Izin notifikasi ditolak oleh browser. Harap aktifkan izin di pengaturan browser.');
      setBrowserNotificationsEnabled(false);
    }
  };

  const handleHighlightProduct = (prodId: string) => {
    sound.playTap();
    setHighlightedProductId(prodId);
    setSelectedCategory('SEMUA');
    setSearchQuery('');
    const idx = products.findIndex((p) => p.id === prodId);
    if (idx >= POS_VISIBLE_BATCH) {
      setVisibleLimit((curr) => Math.max(curr, idx + 12));
    }

    // Scroll to the element
    setTimeout(() => {
      const el = document.getElementById(`product-card-${prodId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    // Auto clear highlight after 6s
    setTimeout(() => {
      setHighlightedProductId((curr) => (curr === prodId ? null : curr));
    }, 6000);
  };

  const handleTriggerTestAlert = () => {
    sound.playTap();
    const candidate = lowStockProducts[0] || products[0];
    if (!candidate) return;

    const testAlert: StockAlertNotification = {
      id: 'test_alert_' + Date.now(),
      productId: candidate.id,
      productName: candidate.name,
      category: candidate.category,
      currentStock: candidate.stockInBaseUnit,
      minThreshold: candidate.minStockAlert,
      baseUnit: candidate.baseUnit,
      timestamp: Date.now(),
      read: false,
      type: candidate.stockInBaseUnit <= 0 ? 'CRITICAL_ZERO' : 'WARNING',
    };

    setActivePushToast(testAlert);
    setAlertHistory((prev) => [testAlert, ...prev]);

    if (soundAlertsEnabled) {
      sound.playWarningChime();
    }

    if (browserNotificationsEnabled) {
      sendWebPushNotification(`[UJI COBA] Ambang Batas: ${candidate.name}`, {
        body: `Uji coba sistem notifikasi berhasil. Sisa ${candidate.stockInBaseUnit} / Min ${candidate.minStockAlert} ${candidate.baseUnit}.`,
      });
    }
  };

  const handleMarkAllAlertsRead = () => {
    sound.playTap();
    setAlertHistory((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  // Personalized Drag-and-Drop Category Ordering State
  const [customCategoryOrder, setCustomCategoryOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('pos_custom_category_order');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [isCategoryReorderMenuOpen, setIsCategoryReorderMenuOpen] = useState(false);

  // Extract unique category tabs respecting cashier's personal Drag-and-Drop arrangement
  const categoryTabList = useMemo(() => {
    const rawCategories: string[] = [];
    const seen = new Set<string>();

    categories.forEach((c) => {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        rawCategories.push(c.name);
      }
    });
    products.forEach((p) => {
      if (p.category && !seen.has(p.category)) {
        seen.add(p.category);
        rawCategories.push(p.category);
      }
    });

    // Apply custom personalized drag-and-drop order
    let orderedCategories: string[] = [];
    if (customCategoryOrder && customCategoryOrder.length > 0) {
      customCategoryOrder.forEach((catName) => {
        if (seen.has(catName)) {
          orderedCategories.push(catName);
        }
      });
      rawCategories.forEach((catName) => {
        if (!orderedCategories.includes(catName)) {
          orderedCategories.push(catName);
        }
      });
    } else {
      orderedCategories = rawCategories;
    }

    return ['SEMUA', ...orderedCategories];
  }, [categories, products, customCategoryOrder]);

  // Drag and Drop handlers for category reordering
  const handleCategoryDragStart = (e: React.DragEvent, cat: string) => {
    if (cat === 'SEMUA') return;
    setDraggedCategory(cat);
    e.dataTransfer.setData('text/plain', cat);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCategoryDragOver = (e: React.DragEvent, cat: string) => {
    if (cat === 'SEMUA') return;
    e.preventDefault();
    if (draggedCategory && draggedCategory !== cat) {
      setDragOverCategory(cat);
    }
  };

  const handleCategoryDrop = (e: React.DragEvent, targetCat: string) => {
    e.preventDefault();
    if (!draggedCategory || draggedCategory === targetCat || targetCat === 'SEMUA') {
      setDraggedCategory(null);
      setDragOverCategory(null);
      return;
    }

    const currentCategories = categoryTabList.filter((c) => c !== 'SEMUA');
    const fromIndex = currentCategories.indexOf(draggedCategory);
    const toIndex = currentCategories.indexOf(targetCat);

    if (fromIndex !== -1 && toIndex !== -1) {
      const newOrder = [...currentCategories];
      newOrder.splice(fromIndex, 1);
      newOrder.splice(toIndex, 0, draggedCategory);

      setCustomCategoryOrder(newOrder);
      localStorage.setItem('pos_custom_category_order', JSON.stringify(newOrder));
      sound.playTap();
    }

    setDraggedCategory(null);
    setDragOverCategory(null);
  };

  const handleMoveCategoryStep = (cat: string, direction: 'LEFT' | 'RIGHT') => {
    sound.playTap();
    const currentCategories = categoryTabList.filter((c) => c !== 'SEMUA');
    const index = currentCategories.indexOf(cat);
    if (index === -1) return;

    const targetIndex = direction === 'LEFT' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= currentCategories.length) return;

    const newOrder = [...currentCategories];
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    setCustomCategoryOrder(newOrder);
    localStorage.setItem('pos_custom_category_order', JSON.stringify(newOrder));
  };

  const handleAutoSortCategoriesByTopSales = () => {
    sound.playTap();
    const categoryVolumeMap = new Map<string, number>();
    transactions.forEach((tx) => {
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const cat = prod?.category || 'Umum';
        categoryVolumeMap.set(cat, (categoryVolumeMap.get(cat) || 0) + item.quantity);
      });
    });

    const nonAllCategories = categoryTabList.filter((c) => c !== 'SEMUA');
    const sorted = [...nonAllCategories].sort((a, b) => {
      const volA = categoryVolumeMap.get(a) || 0;
      const volB = categoryVolumeMap.get(b) || 0;
      return volB - volA;
    });

    setCustomCategoryOrder(sorted);
    localStorage.setItem('pos_custom_category_order', JSON.stringify(sorted));
    setIsCategoryReorderMenuOpen(false);
  };

  const handleResetCategoryOrder = () => {
    sound.playTap();
    setCustomCategoryOrder([]);
    localStorage.removeItem('pos_custom_category_order');
    setIsCategoryReorderMenuOpen(false);
  };

  // Filter products by category and deferred search
  const filteredProducts = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    return products.filter((p) => {
      let matchCat = true;
      if (selectedCategory === '__LOW_STOCK__') {
        matchCat = p.stockInBaseUnit <= p.minStockAlert;
      } else if (selectedCategory !== 'SEMUA') {
        matchCat = p.category === selectedCategory;
      }
      if (!matchCat) return false;
      if (!q) return true;

      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q) ||
        p.units.some((u) => (u.barcode && u.barcode.toLowerCase().includes(q)) || u.unitName.toLowerCase().includes(q)) ||
        (p.variants && p.variants.some((v) => v.name.toLowerCase().includes(q) || (v.barcode && v.barcode.toLowerCase().includes(q))))
      );
    });
  }, [products, selectedCategory, deferredSearchQuery]);

  // Reset progressive render window when category or search filter changes
  useEffect(() => {
    setVisibleLimit(POS_VISIBLE_BATCH);
  }, [selectedCategory, deferredSearchQuery]);

  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, visibleLimit),
    [filteredProducts, visibleLimit]
  );

  // Progressive infinite scroll inside POS catalog grid
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    const root = productGridScrollRef.current;
    if (!sentinel || visibleLimit >= filteredProducts.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleLimit((prev) => Math.min(filteredProducts.length, prev + POS_VISIBLE_BATCH));
        }
      },
      { root: root || null, rootMargin: '250px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleLimit, filteredProducts.length]);

  // Cart calculations
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.subtotal, 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.quantity, 0);
  }, [cart]);

  // Membership Tier Discount: DITIADAKAN sesuai preferensi bisnis pelanggan.
  // Harga khusus pelanggan mengikuti harga khusus kategori produk/jasa & syarat minimal beli (minQuantity).
  const customerTier = selectedCustomer?.membershipTier || 'REGULER';
  const tierDiscountPercent = 0;
  const membershipDiscountAmount = 0;
  const afterTierSubtotal = subtotal;

  const isSelectedMember = useMemo(() => isCustomerMember(selectedCustomer), [selectedCustomer]);

  // Point calculations (Hanya pelanggan Member yang berhak mendapatkan & menukar poin)
  const maxRedeemablePoints = useMemo(() => {
    if (!selectedCustomer || !isSelectedMember || !storeSettings.enablePoints || storeSettings.pointValueRupiah <= 0) return 0;
    // Points value cannot exceed subtotal after tier discount
    const maxPointsForSubtotal = Math.floor(afterTierSubtotal / storeSettings.pointValueRupiah);
    return Math.min(selectedCustomer.totalPoints || 0, maxPointsForSubtotal);
  }, [selectedCustomer, isSelectedMember, storeSettings, afterTierSubtotal]);

  const effectivePointsToUse = useMemo(() => {
    if (!isSelectedMember || !storeSettings.enablePoints || storeSettings.pointValueRupiah <= 0) return 0;
    return Math.max(0, Math.min(Math.floor(pointsToUse) || 0, maxRedeemablePoints));
  }, [isSelectedMember, storeSettings.enablePoints, storeSettings.pointValueRupiah, pointsToUse, maxRedeemablePoints]);

  const pointDiscountAmount = useMemo(() => {
    if (!isSelectedMember || !storeSettings.enablePoints) return 0;
    return effectivePointsToUse * storeSettings.pointValueRupiah;
  }, [isSelectedMember, effectivePointsToUse, storeSettings]);

  const grandTotal = Math.max(0, afterTierSubtotal - pointDiscountAmount);

  const potentialPointsEarned = useMemo(() => {
    return calculatePointsEarned(grandTotal, storeSettings, selectedCustomer);
  }, [selectedCustomer, storeSettings, grandTotal]);

  const latestCartRef = useRef(cart);
  latestCartRef.current = cart;

  const handleProductCardClick = useCallback((product: Product) => {
    sound.playTap();
    if (product.units.length > 1 || (product.variants && product.variants.length > 0)) {
      setUnitSelectModalProduct(product);
      setSelectedVariantForModal(product.variants?.[0]?.name || '');
    } else {
      const unit = product.units[0];
      if (product.productType !== 'JASA') {
        const addingBaseUnits = unit?.conversionFactor || 1;
        const currentCartBaseUnits = latestCartRef.current
          .filter((c) => c.productId === product.id)
          .reduce((sum, c) => sum + c.quantity * (c.selectedUnit?.conversionFactor || 1), 0);
        const projectedStock = product.stockInBaseUnit - (currentCartBaseUnits + addingBaseUnits);
        if (projectedStock <= product.minStockAlert) {
          checkSmartStockWarning(product, addingBaseUnits);
        }
      }
      onAddToCart(product, unit);
    }
  }, [onAddToCart]);

  // Physical Keyboard Shortcuts Support (for Bluetooth/USB keyboards on tablets or PC POS)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      // Function keys (F1 - F12) are intercepted regardless of focus to prevent browser defaults
      // F1: Focus Search Input
      if (e.key === 'F1') {
        e.preventDefault();
        sound.playTap();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // F2: Checkout / Payment Modal
      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length > 0) {
          sound.playTap();
          onOpenPaymentModal();
        } else {
          sound.playWarningChime();
        }
        return;
      }

      // F3: Barcode Scanner Modal
      if (e.key === 'F3') {
        e.preventDefault();
        sound.playTap();
        onOpenScannerModal();
        return;
      }

      // F4: Select / Change Customer Member
      if (e.key === 'F4') {
        e.preventDefault();
        sound.playTap();
        onOpenCustomerModal();
        return;
      }

      // F6: Quick Sale ad-hoc entry modal
      if (e.key === 'F6') {
        e.preventDefault();
        sound.playTap();
        setQuickSaleError(null);
        setIsQuickSaleModalOpen(true);
        setTimeout(() => quickSaleDescInputRef.current?.focus(), 60);
        return;
      }

      // F7: Toggle Quick Reports side panel
      if (e.key === 'F7') {
        e.preventDefault();
        sound.playTap();
        setIsQuickReportsOpen((prev) => !prev);
        return;
      }

      // F8: Clear Cart
      if (e.key === 'F8') {
        e.preventDefault();
        if (cart.length > 0) {
          sound.playTap();
          if (window.confirm('Kosongkan semua barang dari keranjang belanja kasir?')) {
            onClearCart();
          }
        }
        return;
      }

      // F9: Toggle Member Loyalty Points
      if (e.key === 'F9') {
        e.preventDefault();
        if (selectedCustomer && storeSettings.enablePoints && maxRedeemablePoints > 0) {
          sound.playTap();
          onToggleUsePoints(!usePoints);
        }
        return;
      }

      // F10: Toggle Stock Alert Notification Center
      if (e.key === 'F10') {
        e.preventDefault();
        sound.playTap();
        setIsNotificationCenterOpen((prev) => !prev);
        return;
      }

      // F11: Open Stock Threshold Settings
      if (e.key === 'F11') {
        e.preventDefault();
        sound.playTap();
        onOpenThresholdSettings();
        return;
      }

      // F12: Open Keyboard Shortcuts Cheatsheet
      if (e.key === 'F12') {
        e.preventDefault();
        sound.playTap();
        setIsKeyboardHelpOpen((prev) => !prev);
        return;
      }

      // Escape: Close active overlays or blur search
      if (e.key === 'Escape') {
        if (isQuickReportsOpen) {
          e.preventDefault();
          setIsQuickReportsOpen(false);
          return;
        }
        if (isQuickSaleModalOpen) {
          e.preventDefault();
          setIsQuickSaleModalOpen(false);
          return;
        }
        if (isKeyboardHelpOpen) {
          e.preventDefault();
          setIsKeyboardHelpOpen(false);
          return;
        }
        if (unitSelectModalProduct) {
          e.preventDefault();
          setUnitSelectModalProduct(null);
          return;
        }
        if (isNotificationCenterOpen) {
          e.preventDefault();
          setIsNotificationCenterOpen(false);
          return;
        }
        if (document.activeElement === searchInputRef.current) {
          e.preventDefault();
          setSearchQuery('');
          searchInputRef.current?.blur();
          return;
        }
      }

      // Numeric keys 1-9 for multi-unit selection modal when active
      if (unitSelectModalProduct) {
        const num = parseInt(e.key, 10);
        if (!isNaN(num) && num >= 1 && num <= unitSelectModalProduct.units.length) {
          e.preventDefault();
          const targetUnit = unitSelectModalProduct.units[num - 1];
          const maxAvail = Math.floor(unitSelectModalProduct.stockInBaseUnit / targetUnit.conversionFactor);
          if (maxAvail > 0) {
            sound.playTap();
            onAddToCart(unitSelectModalProduct, targetUnit, 1);
            setUnitSelectModalProduct(null);
          } else {
            sound.playWarningChime();
          }
          return;
        }
      }

      // Non-input navigation shortcuts
      if (!isInput) {
        // '?' opens shortcuts cheatsheet
        if (e.key === '?') {
          e.preventDefault();
          sound.playTap();
          setIsKeyboardHelpOpen((prev) => !prev);
          return;
        }

        // '/' quick-focuses search bar
        if (e.key === '/') {
          e.preventDefault();
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
          return;
        }

        // '+' or '=' increments quantity of last item in cart
        if ((e.key === '+' || e.key === '=') && cart.length > 0) {
          e.preventDefault();
          const lastItem = cart[cart.length - 1];
          sound.playTap();
          onUpdateCartItemQty(lastItem.cartItemId, lastItem.quantity + 1);
          return;
        }

        // '-' decrements quantity of last item in cart
        if (e.key === '-' && cart.length > 0) {
          e.preventDefault();
          const lastItem = cart[cart.length - 1];
          sound.playTap();
          onUpdateCartItemQty(lastItem.cartItemId, lastItem.quantity - 1);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cart,
    selectedCustomer,
    storeSettings,
    maxRedeemablePoints,
    usePoints,
    isKeyboardHelpOpen,
    isQuickReportsOpen,
    isQuickSaleModalOpen,
    unitSelectModalProduct,
    isNotificationCenterOpen,
    onOpenPaymentModal,
    onOpenScannerModal,
    onOpenCustomerModal,
    onClearCart,
    onToggleUsePoints,
    onOpenThresholdSettings,
    onAddToCart,
    onUpdateCartItemQty,
  ]);

  return (
    <div className={`pos-tablet-shell flex-1 min-h-0 flex ${isPortrait ? 'flex-col' : 'flex-row'} overflow-hidden bg-slate-100 relative`}>
      {/* Automated Floating Push Notification Toast */}
      <StockNotificationToast
        alert={activePushToast}
        categories={categories}
        onDismiss={() => setActivePushToast(null)}
        onHighlightProduct={handleHighlightProduct}
        onNavigateToSuppliers={onNavigateToSuppliers}
      />

      {/* Portrait Tablet Tab Switcher Bar */}
      {isPortrait && (
        <div className="pos-portrait-switcher bg-slate-900 text-white px-3 py-2 flex flex-col gap-2 border-b border-slate-800 shrink-0 z-20">
          <div className="flex items-center gap-2 w-full">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setPortraitTab('CATALOG');
              }}
              className={`pos-touch-target flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                portraitTab === 'CATALOG'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Katalog Produk</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setPortraitTab('CART');
              }}
              className={`pos-touch-target flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all relative cursor-pointer ${
                portraitTab === 'CART'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Keranjang ({cartItemCount})</span>
              {subtotal > 0 && (
                <span className="font-mono text-[10px] bg-black/30 px-1.5 py-0.2 rounded-md">
                  {formatRupiah(subtotal)}
                </span>
              )}
            </button>
          </div>

          {/* Selected Customer & Points Quick Bar in Portrait Mode */}
          {selectedCustomer && (
            <div className="px-3 py-2 rounded-xl bg-slate-800/90 border border-slate-700 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-bold text-white truncate">{selectedCustomer.name}</span>
                {isSelectedMember ? (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 shrink-0">
                    ⭐ MEMBER
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-700 text-slate-300 shrink-0">
                    Non-Member
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2.5 shrink-0 font-mono text-[11px]">
                <span className="text-amber-300 font-bold" title="Poin Pelanggan Saat Ini">
                  Saldo: {isSelectedMember ? `${formatNumber(selectedCustomer.totalPoints || 0)} Pts` : '0 Pts'}
                </span>
                <span className="text-slate-600">|</span>
                <span className={isSelectedMember && storeSettings.enablePoints ? 'text-emerald-400 font-black' : 'text-slate-400 font-semibold'} title="Poin yang akan didapat pada transaksi ini">
                  +{isSelectedMember && storeSettings.enablePoints ? formatNumber(potentialPointsEarned) : 0} Pts
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* LEFT PANEL: PRODUCT CATALOG (65% width on tablet landscape)     */}
      {/* ============================================================== */}
      <section className={`pos-catalog-panel flex flex-col min-h-0 h-full bg-slate-50 overflow-hidden ${
        isPortrait 
          ? (portraitTab === 'CATALOG' ? 'flex-1' : 'hidden') 
          : 'w-[65%] shrink-0 border-r border-slate-200/80'
      }`}>
        {/* Top Control Bar: Search, Shortcuts, Notification Center, & Barcode Scan */}
        <div className="pos-catalog-toolbar p-3 md:p-4 bg-white border-b border-slate-200 shadow-xs flex items-center gap-2 shrink-0">
          <div className="pos-catalog-search-wrap relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && searchQuery.trim() && onDirectScanInput) {
                  e.preventDefault();
                  onDirectScanInput(searchQuery.trim());
                  setSearchQuery('');
                }
              }}
              placeholder="Cari produk, scan SKU / QR Member + Enter... (F1)"
              className="w-full pl-10 pr-14 py-2.5 bg-slate-100 hover:bg-slate-200/70 focus:bg-white text-slate-900 rounded-xl text-sm border border-transparent focus:border-sky-500 focus:outline-none transition-all placeholder:text-slate-400"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-slate-400 hover:text-slate-600 p-0.5"
                  title="Bersihkan Pencarian (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-500 bg-slate-200/80 rounded border border-slate-300 shadow-2xs">
                  F1
                </kbd>
              )}
            </div>
          </div>

          {/* Quick Sale (Ad-Hoc Item) Icon Button */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setQuickSaleError(null);
              setIsQuickSaleModalOpen(true);
              setTimeout(() => quickSaleDescInputRef.current?.focus(), 60);
            }}
            className="pos-toolbar-action-btn flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 transition-colors shrink-0 cursor-pointer"
            title="Quick Sale — Input nominal & deskripsi item langsung tanpa katalog (F6)"
            aria-label="Quick Sale (F6)"
          >
            <Zap className="w-4 h-4 text-amber-300" />
          </button>

          {/* Quick Reports Side-Panel Toggle Icon Button */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsQuickReportsOpen(true);
            }}
            className={`pos-toolbar-action-btn flex items-center justify-center w-10 h-10 rounded-xl border transition-colors shrink-0 shadow-2xs cursor-pointer ${
              isQuickReportsOpen
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
            }`}
            title="Quick Reports — Ringkasan omzet, total transaksi & 3 produk terlaris hari ini (F7)"
            aria-label="Quick Reports (F7)"
          >
            <BarChart2 className={`w-4 h-4 ${isQuickReportsOpen ? 'text-white' : 'text-indigo-600'}`} />
          </button>

          {/* Physical Keyboard Shortcuts Cheatsheet Button */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsKeyboardHelpOpen(true);
            }}
            className="pos-toolbar-action-btn flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors shrink-0 shadow-2xs"
            title="Daftar Pintasan Keyboard Fisik Kasir (F12 atau ?)"
          >
            <Keyboard className="w-4 h-4 text-slate-600" />
            <span className="hidden xl:inline">Pintasan</span>
            <kbd className="px-1.5 py-0.2 text-[9.5px] font-mono font-bold bg-white text-slate-700 rounded border border-slate-300 shadow-2xs">
              F12
            </kbd>
          </button>

          {/* Automated Stock Threshold Alert Notification Center Icon Button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsNotificationCenterOpen(!isNotificationCenterOpen);
              }}
              className={`pos-toolbar-action-btn relative flex items-center justify-center w-10 h-10 rounded-xl border transition-all cursor-pointer ${
                lowStockProducts.length > 0
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300 shadow-xs ring-2 ring-amber-400/30'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Peringatan Stok — Pusat Notifikasi Ambang Batas Stok (F10)"
              aria-label="Peringatan Stok (F10)"
            >
              <div className="relative flex items-center justify-center">
                <Bell className={`w-4 h-4 ${lowStockProducts.length > 0 ? 'text-amber-600 animate-bounce' : 'text-slate-500'}`} />
                {lowStockProducts.length > 0 && (
                  <span className="absolute -top-2 -right-2 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-600 text-white text-[9px] font-black items-center justify-center">
                      {lowStockProducts.length}
                    </span>
                  </span>
                )}
              </div>
            </button>

            {/* Notification Center Popover Dropdown */}
            {isNotificationCenterOpen && (
              <div className="absolute right-0 top-12 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Notifikasi Ambang Batas Stok
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        {lowStockProducts.length} produk menyentuh batas minimum
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setIsNotificationCenterOpen(false)}
                    className="p-1 rounded-md text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Automation & Controls Row */}
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      <BellRing className="w-3.5 h-3.5 text-sky-600" />
                      <span>Push Notifikasi Web:</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleToggleBrowserNotifications}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-colors ${
                        browserNotificationsEnabled
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {browserNotificationsEnabled ? 'Aktif (Browser OS)' : 'Klik Aktifkan'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                    <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                      {soundAlertsEnabled ? (
                        <Volume2 className="w-3.5 h-3.5 text-amber-600" />
                      ) : (
                        <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Suara Peringatan:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setSoundAlertsEnabled(!soundAlertsEnabled)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        soundAlertsEnabled
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {soundAlertsEnabled ? 'Bunyi Aktif' : 'Mute'}
                    </button>
                  </div>

                  <div className="pt-1 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={handleTriggerTestAlert}
                      className="text-[10px] text-sky-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Uji Coba Alert</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {alertHistory.length > 0 && (
                        <button
                          type="button"
                          onClick={handleMarkAllAlertsRead}
                          className="text-[10px] text-slate-500 font-medium hover:underline cursor-pointer"
                        >
                          Tandai Dibaca
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClearAllAlerts}
                        className="text-[10px] text-rose-600 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                        title="Bersihkan seluruh riwayat notifikasi stok"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                        <span>Hapus Riwayat</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* List of Low Stock Items in Popover */}
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {lowStockProducts.length === 0 ? (
                    <div className="py-6 text-center text-slate-400">
                      <CheckCircle2 className="w-8 h-8 mx-auto mb-1 text-emerald-500 stroke-[1.5]" />
                      <p className="text-xs font-bold text-slate-700">Semua Stok Aman</p>
                      <p className="text-[10px] text-slate-500">Tidak ada produk di bawah ambang batas.</p>
                    </div>
                  ) : (
                    lowStockProducts.map((p) => {
                      const isZero = p.stockInBaseUnit <= 0;
                      return (
                        <div
                          key={p.id}
                          className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                            isZero
                              ? 'bg-rose-50/80 border-rose-200'
                              : 'bg-amber-50/70 border-amber-200'
                          }`}
                        >
                          <div className="truncate flex-1">
                            <div className="font-bold text-slate-900 truncate">{p.name}</div>
                            <div className="text-[10px] font-mono text-slate-500">
                              Sisa: <b className={isZero ? 'text-rose-600' : 'text-amber-700'}>{p.stockInBaseUnit}</b> / Min {p.minStockAlert} {p.baseUnit}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                handleHighlightProduct(p.id);
                                setIsNotificationCenterOpen(false);
                              }}
                              className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-[10px] shadow-2xs flex items-center gap-1"
                              title="Sorot Produk di Kasir"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Sorot</span>
                            </button>
                            {onNavigateToSuppliers && (
                              <button
                                type="button"
                                onClick={() => {
                                  onNavigateToSuppliers();
                                  setIsNotificationCenterOpen(false);
                                }}
                                className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px]"
                                title="Buat PO Restock"
                              >
                                <Truck className="w-3 h-3 text-sky-400" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('__LOW_STOCK__');
                      setIsNotificationCenterOpen(false);
                    }}
                    className="text-xs font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1"
                  >
                    <span>Filter Tampilan Kasir</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenThresholdSettings()}
                    className="text-xs font-bold text-sky-600 hover:underline flex items-center gap-1"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Ubah Batas</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onOpenScannerModal('STOCK_LOOKUP');
            }}
            className="pos-toolbar-action-btn flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold shadow-2xs transition-colors shrink-0 cursor-pointer"
            title="Cek Stok & Harga Produk via Scan QR SKU / Barcode"
          >
            <PackageSearch className="w-4 h-4 text-emerald-600" />
            <span className="hidden xl:inline">Cek Stok</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onOpenScannerModal('SCAN');
            }}
            className="pos-toolbar-action-btn flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-sm transition-colors shrink-0 cursor-pointer"
            title="Scan Barcode / QR Produk & Member (F3)"
          >
            <Barcode className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">Scan Barcode</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[9.5px] font-mono font-bold bg-slate-800 text-sky-300 rounded border border-slate-700">
              F3
            </kbd>
          </button>
        </div>

        {/* Non-blocking Scan Result Feedback Banner */}
        {scanFeedbackNotice && (
          <div
            className={`mx-3 mt-2.5 px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in duration-150 shrink-0 ${
              scanFeedbackNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {scanFeedbackNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="truncate">{scanFeedbackNotice.message}</span>
            </div>
            {onDismissScanFeedback && (
              <button
                type="button"
                onClick={onDismissScanFeedback}
                className="p-0.5 rounded hover:bg-black/5 shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Category Filter Horizontal Scroll with Color Badges + Low Stock Critical Filter */}
        <div className="pos-category-strip px-3 md:px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          {/* Dedicated Low Stock Alert Filter Tab */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setSelectedCategory(selectedCategory === '__LOW_STOCK__' ? 'SEMUA' : '__LOW_STOCK__');
            }}
            className={`pos-category-chip px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border shrink-0 ${
              selectedCategory === '__LOW_STOCK__'
                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                : lowStockProducts.length > 0
                ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 ring-1 ring-amber-400/40'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${selectedCategory === '__LOW_STOCK__' ? 'text-white' : 'text-amber-600'}`} />
            <span>Kritis & Menipis</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
              selectedCategory === '__LOW_STOCK__'
                ? 'bg-white/20 text-white'
                : lowStockProducts.length > 0
                ? 'bg-amber-200 text-amber-900 animate-pulse'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {lowStockProducts.length}
            </span>
          </button>

          <div className="w-px h-5 bg-slate-200 shrink-0" />

          {categoryTabList.map((cat) => {
            const isSelected = selectedCategory === cat;
            const catColor = cat === 'SEMUA' ? '#0284c7' : getCategoryColor(cat, categories);
            const count =
              cat === 'SEMUA'
                ? products.length
                : categoryCountMap.get(cat.toLowerCase()) || 0;
            const isDraggable = cat !== 'SEMUA';
            const isBeingDragged = draggedCategory === cat;
            const isDropTarget = dragOverCategory === cat;

            return (
              <button
                key={cat}
                type="button"
                draggable={isDraggable}
                onDragStart={(e) => handleCategoryDragStart(e, cat)}
                onDragOver={(e) => handleCategoryDragOver(e, cat)}
                onDragLeave={() => setDragOverCategory(null)}
                onDrop={(e) => handleCategoryDrop(e, cat)}
                onDragEnd={() => {
                  setDraggedCategory(null);
                  setDragOverCategory(null);
                }}
                onClick={() => {
                  sound.playTap();
                  setSelectedCategory(cat);
                }}
                style={
                  isSelected
                    ? {
                        backgroundColor: catColor,
                        color: '#ffffff',
                        borderColor: catColor,
                      }
                    : undefined
                }
                title={isDraggable ? `Tarik & Lepas (Drag & Drop) untuk menggeser kategori "${cat}" ke urutan pertama` : undefined}
                className={`pos-category-chip group px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border select-none ${
                  isDraggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                } ${
                  isBeingDragged
                    ? 'opacity-40 scale-95 border-dashed border-sky-500'
                    : isDropTarget
                    ? 'border-2 border-dashed border-sky-600 bg-sky-50 scale-105 shadow-md ring-2 ring-sky-300'
                    : isSelected
                    ? 'shadow-xs font-bold'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                {isDraggable && (
                  <GripVertical className={`w-3 h-3 -ml-0.5 opacity-50 group-hover:opacity-100 transition-opacity ${isSelected ? 'text-white/80' : 'text-slate-400'}`} />
                )}
                {cat !== 'SEMUA' && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: isSelected ? '#ffffff' : catColor }}
                  />
                )}
                <span>{cat}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}

          {/* Quick Category Arrangement & Auto-sort by Top Sales Button */}
          <div className="relative shrink-0 ml-auto">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsCategoryReorderMenuOpen((prev) => !prev);
              }}
              className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
              title="Atur Urutan Kategori (Drag & Drop atau Urutkan Otomatis)"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-sky-600" />
              <span className="hidden xl:inline text-[11px]">Atur Urutan</span>
            </button>

            {isCategoryReorderMenuOpen && (
              <div className="absolute right-0 top-9 z-40 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600" />
                    <span>Susunan Kategori Kasir</span>
                  </div>
                  <button
                    onClick={() => setIsCategoryReorderMenuOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Tarik dan lepas (drag-and-drop) tombol kategori langsung pada bilah kasir untuk menempatkan kategori favorit di urutan pertama.
                </p>

                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleAutoSortCategoriesByTopSales}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                    <span>Urutkan Terlaris Otomatis</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetCategoryOrder}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-xs flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Reset ke Urutan Bawaan</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Dashboard Widget 1: Real-time Stock Minimum Threshold Alerts */}
        <StockAlertWidget
          products={products}
          onOpenThresholdSettings={onOpenThresholdSettings}
          onNavigateToSuppliers={onNavigateToSuppliers}
          onQuickSelectProduct={(p) => handleHighlightProduct(p.id)}
        />

        {/* Milestone Daily Sales Target Reached Celebration Toast Banner */}
        {milestoneToast && (
          <div className="mx-3 md:mx-4 mt-2 mb-1 p-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-sky-600 text-white rounded-2xl shadow-xl flex items-center justify-between gap-3 animate-in slide-in-from-top-3 duration-300 border border-emerald-300/40 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-white/20 rounded-xl shrink-0 animate-bounce">
                <Trophy className="w-5 h-5 text-amber-300 stroke-[2.5]" />
              </div>
              <div className="text-xs min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-black uppercase tracking-wider bg-black/20 px-2 py-0.5 rounded-full text-[10px] text-amber-200 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>Milestone Toko Tercapai!</span>
                  </span>
                  <span className="font-extrabold text-white">Target Omzet Harian Sukses Terlampaui 🎉</span>
                </div>
                <div className="text-[11.5px] text-emerald-100 mt-0.5">
                  Selamat! Total omzet kasir hari ini telah menembus <strong className="text-white font-mono font-black">{formatRupiah(milestoneToast.revenue)}</strong> (Target: {formatRupiah(milestoneToast.goal)}). Kerja hebat tim!
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsMiniDashboardOpen(true);
                  setMilestoneToast(null);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-white text-emerald-800 font-bold text-[11px] hover:bg-emerald-50 transition-colors shadow-xs cursor-pointer"
              >
                Lihat Mini-Dashboard
              </button>
              <button
                type="button"
                onClick={() => setMilestoneToast(null)}
                className="p-1 rounded-lg text-emerald-200 hover:text-white hover:bg-black/20 transition-colors cursor-pointer"
                title="Tutup Peringatan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Smart Low-Stock Alert Banner: Triggers when cashier action pushes stock <= safety threshold */}
        {smartStockWarning && (
          <div className="mx-3 md:mx-4 mt-2 mb-1 p-3 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white rounded-2xl shadow-md flex items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200 border border-amber-300/40 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 bg-black/20 rounded-xl shrink-0">
                <AlertTriangle className="w-4 h-4 text-white stroke-[2.5]" />
              </div>
              <div className="text-xs min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-black uppercase tracking-wider bg-black/30 px-1.5 py-0.2 rounded text-[10px]">
                    Peringatan Ambang Batas Stok
                  </span>
                  <span className="font-bold truncate">{smartStockWarning.productName}</span>
                </div>
                <div className="text-[11px] text-amber-50 mt-0.5">
                  Item ditambahkan ke keranjang. Sisa persediaan tersisa{' '}
                  <strong className="underline text-white font-mono font-black">{smartStockWarning.projectedStock} {smartStockWarning.baseUnit}</strong>{' '}
                  (Batas minimum toko: {smartStockWarning.minThreshold} {smartStockWarning.baseUnit}).
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onNavigateToSuppliers && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onNavigateToSuppliers();
                  }}
                  className="px-2.5 py-1.5 bg-white text-slate-900 font-bold text-xs rounded-xl shadow-xs hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Truck className="w-3.5 h-3.5 text-sky-600" />
                  <span>Restock PO</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSmartStockWarning(null)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-black/20 rounded-xl transition-colors cursor-pointer"
                title="Tutup Peringatan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Product Grid */}
        <div ref={productGridScrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 md:p-4">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <AlertCircle className="w-12 h-12 mb-3 stroke-[1.5]" />
              <p className="text-base font-semibold text-slate-700">Tidak ada produk ditemukan</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Coba sesuaikan kata kunci pencarian atau ubah filter kategori di atas.
              </p>
            </div>
          ) : (
            <>
              {deferredSearchQuery.trim() && (
                <div className="mb-2.5 flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Search className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span className="truncate">
                      Menampilkan <strong className="tabular-nums">{filteredProducts.length}</strong> produk cocok untuk{' '}
                      <span className="font-semibold">"{deferredSearchQuery.trim()}"</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setSearchQuery('');
                    }}
                    className="px-2 py-0.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold text-[11px] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              )}

              <div className="pos-catalog-grid grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {displayedProducts.map((product) => (
                  <POSProductCard
                    key={product.id}
                    product={product}
                    catColor={getCategoryColor(product.category, categories, product)}
                    customerCategory={selectedCustomer?.customerCategory}
                    isHighlighted={highlightedProductId === product.id}
                    searchQuery={deferredSearchQuery.trim()}
                    onSelect={handleProductCardClick}
                    onNavigateToSuppliers={onNavigateToSuppliers}
                  />
                ))}
              </div>

              {visibleLimit < filteredProducts.length && (
                <div ref={loadMoreSentinelRef} className="mt-4 pb-2 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setVisibleLimit((prev) => Math.min(filteredProducts.length, prev + POS_VISIBLE_BATCH));
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors cursor-pointer"
                  >
                    Tampilkan +{Math.min(POS_VISIBLE_BATCH, filteredProducts.length - visibleLimit)} Produk Lainnya ({visibleLimit}/{filteredProducts.length})
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Floating Quick Cart Switcher in Portrait Catalog Mode */}
        {isPortrait && portraitTab === 'CATALOG' && cartItemCount > 0 && (
          <div className="pos-portrait-sticky-cta p-3 bg-white border-t border-slate-200 shadow-lg shrink-0">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setPortraitTab('CART');
              }}
              className="w-full bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-black text-xs">
                  {cartItemCount}
                </div>
                <div className="text-left">
                  <div className="text-xs font-bold text-white">Lihat Keranjang Belanja ({cartItemCount} item)</div>
                  <div className="text-[11px] text-sky-400 font-mono font-bold">{formatRupiah(subtotal)}</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                <span>Bayar Kasir</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>
          </div>
        )}
      </section>

      {/* ============================================================== */}
      {/* RIGHT PANEL: CART & CHECKOUT (35% width on tablet landscape)   */}
      {/* ============================================================== */}
      <section className={`pos-cart-panel flex flex-col min-h-0 h-full bg-white overflow-hidden ${
        isPortrait 
          ? (portraitTab === 'CART' ? 'flex-1' : 'hidden') 
          : 'w-[35%] shrink-0 border-l border-slate-200 shadow-sm'
      }`}>
        {/* Portrait Mode: Back to Catalog Bar */}
        {isPortrait && (
          <div className="p-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between shrink-0">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setPortraitTab('CATALOG');
              }}
              className="pos-touch-target px-3 py-2 bg-white text-slate-800 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-300 shadow-2xs cursor-pointer"
            >
              <span>&larr; Tambah Produk Lain</span>
            </button>
            <span className="text-xs font-bold text-slate-600">
              Total {cartItemCount} Item Dipilih
            </span>
          </div>
        )}

        {/* Customer & Loyalty Header Card */}
        <div className="pos-cart-customer-bar p-3 bg-slate-50 border-b border-slate-200 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 truncate">
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0">
                {selectedCustomer ? selectedCustomer.name.charAt(0) : 'U'}
              </div>
              <div className="truncate text-left">
                <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                  <span>{selectedCustomer ? selectedCustomer.name : 'Pelanggan Umum (Non-Member)'}</span>
                  {selectedCustomer && (
                    <div className="flex items-center gap-1 shrink-0 flex-wrap">
                      {selectedCustomer.customerCategory && (
                        <span className={`px-1.5 py-0.2 rounded-md text-[9.5px] font-black uppercase border ${getCustomerCategoryBadge(selectedCustomer.customerCategory).bg} ${getCustomerCategoryBadge(selectedCustomer.customerCategory).text} ${getCustomerCategoryBadge(selectedCustomer.customerCategory).border}`}>
                          🏷️ {selectedCustomer.customerCategory}
                        </span>
                      )}
                      {isSelectedMember ? (
                        <span className="px-1.5 py-0.2 rounded-md text-[9.5px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ⭐ MEMBER
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded-md text-[9.5px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                          Non-Member
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {selectedCustomer ? (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
                    <span className="font-mono font-bold text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded border border-sky-200">
                      {getCustomerMembershipId(selectedCustomer)}
                    </span>
                    <span className="font-mono">{selectedCustomer.phone}</span>
                    <span>·</span>
                    {isSelectedMember ? (
                      <span className="font-semibold text-amber-600 flex items-center gap-0.5">
                        <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" />
                        {formatNumber(selectedCustomer.totalPoints)} Poin
                      </span>
                    ) : (
                      <span className="text-slate-400">Tidak mendapatkan poin</span>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">Pilih atau scan QR member pelanggan</div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {selectedCustomer && (
                <button
                  onClick={() => {
                    sound.playTap();
                    onSelectCustomer(null);
                  }}
                  title="Hapus Pelanggan"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onOpenScannerModal('MEMBER_QR');
                }}
                title="Scan QR Member Pelanggan"
                className="px-2 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold shadow-2xs transition-colors flex items-center gap-1 cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">QR</span>
              </button>
              <button
                onClick={() => {
                  sound.playTap();
                  onOpenCustomerModal();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-sky-500 text-slate-700 text-xs font-semibold shadow-2xs hover:text-sky-600 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Pilih Data Pelanggan / Member (F4)"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{selectedCustomer ? 'Ganti' : 'Pilih'}</span>
                <kbd className="hidden sm:inline-block px-1 py-0.2 text-[9px] font-mono font-bold bg-slate-100 text-slate-600 rounded border border-slate-200">
                  F4
                </kbd>
              </button>
            </div>
          </div>

          {/* Customer Points Summary Strip (if customer selected) */}
          {selectedCustomer && (
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div className={`p-2 rounded-xl border ${
                isSelectedMember
                  ? 'bg-amber-50/80 border-amber-200'
                  : 'bg-white border-slate-200'
              }`}>
                <div className="text-[10px] font-semibold text-slate-500">
                  Poin Pelanggan Saat Ini
                </div>
                <div className={`text-sm font-black font-mono mt-0.5 flex items-center gap-1 ${
                  isSelectedMember ? 'text-amber-700' : 'text-slate-500'
                }`}>
                  <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isSelectedMember ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                  <span>
                    {isSelectedMember ? `${formatNumber(selectedCustomer.totalPoints || 0)} Poin` : '0 Poin'}
                  </span>
                </div>
                <div className="text-[9.5px] text-slate-500 mt-0.5 truncate">
                  {isSelectedMember
                    ? 'Saldo poin member aktif'
                    : 'Status Non-Member'}
                </div>
              </div>

              <div className={`p-2 rounded-xl border ${
                isSelectedMember && storeSettings.enablePoints
                  ? 'bg-emerald-50/80 border-emerald-200'
                  : 'bg-white border-slate-200'
              }`}>
                <div className="text-[10px] font-semibold text-slate-500">
                  Poin Didapat Transaksi Ini
                </div>
                <div className={`text-sm font-black font-mono mt-0.5 ${
                  isSelectedMember && storeSettings.enablePoints
                    ? 'text-emerald-700'
                    : 'text-slate-500'
                }`}>
                  {isSelectedMember && storeSettings.enablePoints
                    ? `+${formatNumber(potentialPointsEarned)} Poin`
                    : '0 Poin'}
                </div>
                <div className="text-[9.5px] text-slate-500 mt-0.5 truncate">
                  {!storeSettings.enablePoints
                    ? 'Program poin nonaktif'
                    : !isSelectedMember
                    ? 'Khusus pelanggan Member'
                    : potentialPointsEarned > 0
                    ? `Total nanti: ${formatNumber(Math.max(0, (selectedCustomer.totalPoints || 0) - (usePoints ? pointsToUse : 0) + potentialPointsEarned))} Poin`
                    : (storeSettings.spendPerPoint || 0) > 0 && grandTotal > 0
                    ? `Kurang ${formatRupiah(Math.max(0, storeSettings.spendPerPoint - grandTotal))} → +${formatNumber(storeSettings.pointsPerSpend ?? 1)} Poin`
                    : `Belanja ${formatRupiah(storeSettings.spendPerPoint || 0)} → +${formatNumber(storeSettings.pointsPerSpend ?? 1)} Poin`}
                </div>
              </div>
            </div>
          )}

          {/* Loyalty Point Redemption Card (hanya jika pelanggan berstatus Member & memiliki poin) */}
          {selectedCustomer && isSelectedMember && storeSettings.enablePoints && selectedCustomer.totalPoints > 0 && (
            <div className="mt-2 p-2.5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200/90 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-amber-900 truncate flex items-center gap-1.5">
                      <span>Tukar Poin Kurangi Tagihan</span>
                      {storeSettings.autoApplyMaxPoints && effectivePointsToUse > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-black shrink-0">
                          Auto-Apply
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-amber-700">
                      Maks. {formatNumber(maxRedeemablePoints)} Poin (1 Poin = {formatRupiah(storeSettings.pointValueRupiah)})
                    </div>
                  </div>
                </div>

                {effectivePointsToUse > 0 && (
                  <span className="px-2 py-0.5 rounded-lg bg-amber-600 text-white text-[10.5px] font-black font-mono shrink-0">
                    -{formatRupiah(pointDiscountAmount)}
                  </span>
                )}
              </div>

              {maxRedeemablePoints > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        const next = Math.max(0, effectivePointsToUse - 1);
                        if (onChangePointsToUse) onChangePointsToUse(next);
                        else onToggleUsePoints(next > 0);
                      }}
                      disabled={effectivePointsToUse <= 0}
                      className="w-8 h-8 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 disabled:opacity-40 text-amber-900 font-bold flex items-center justify-center shrink-0 cursor-pointer"
                      title="Kurangi 1 Poin"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="0"
                        max={maxRedeemablePoints}
                        step="any"
                        value={effectivePointsToUse === 0 ? '' : effectivePointsToUse}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const val = raw === '' ? 0 : Math.max(0, Math.min(maxRedeemablePoints, Math.floor(parseFloat(raw) || 0)));
                          if (onChangePointsToUse) onChangePointsToUse(val);
                          else onToggleUsePoints(val > 0);
                        }}
                        placeholder="0"
                        className="w-full h-8 px-2.5 pr-11 rounded-lg border border-amber-300 bg-white text-xs font-mono font-bold text-amber-950 focus:outline-none focus:border-amber-600"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-amber-600 pointer-events-none">
                        Poin
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        const next = Math.min(maxRedeemablePoints, effectivePointsToUse + 1);
                        if (onChangePointsToUse) onChangePointsToUse(next);
                        else onToggleUsePoints(next > 0);
                      }}
                      disabled={effectivePointsToUse >= maxRedeemablePoints}
                      className="w-8 h-8 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 disabled:opacity-40 text-amber-900 font-bold flex items-center justify-center shrink-0 cursor-pointer"
                      title="Tambah 1 Poin"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Quick Point Amount Chips */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        if (onChangePointsToUse) onChangePointsToUse(0);
                        else onToggleUsePoints(false);
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                        effectivePointsToUse === 0
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      0
                    </button>
                    {maxRedeemablePoints >= 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          const half = Math.max(1, Math.floor(maxRedeemablePoints / 2));
                          if (onChangePointsToUse) onChangePointsToUse(half);
                          else onToggleUsePoints(true);
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                          effectivePointsToUse === Math.floor(maxRedeemablePoints / 2)
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        50% ({formatNumber(Math.floor(maxRedeemablePoints / 2))})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        if (onChangePointsToUse) onChangePointsToUse(maxRedeemablePoints);
                        else onToggleUsePoints(true);
                      }}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                        effectivePointsToUse === maxRedeemablePoints && maxRedeemablePoints > 0
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      Maks ({formatNumber(maxRedeemablePoints)})
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-amber-700/90 italic">
                  Tambahkan produk ke keranjang untuk menukar poin.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Automatic Customer Special Price Notification Banner */}
        {specialPriceNotice && (
          <div className="mx-3 mt-2.5 p-2.5 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 flex items-start justify-between gap-2 animate-in fade-in slide-in-from-top-1 duration-150 shrink-0">
            <div className="flex items-start gap-2 min-w-0">
              <Tag className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold text-purple-950">
                  Harga Khusus {specialPriceNotice.category} Otomatis Diterapkan
                </div>
                <p className="text-[10px] text-purple-800 leading-snug mt-0.5">
                  {specialPriceNotice.updatedCount} barang di keranjang disesuaikan untuk{' '}
                  <b>{specialPriceNotice.customerName}</b>
                  {specialPriceNotice.totalSaved > 0 ? ` (Hemat ${formatRupiah(specialPriceNotice.totalSaved)})` : ''}.
                </p>
              </div>
            </div>
            {onDismissSpecialPriceNotice && (
              <button
                type="button"
                onClick={onDismissSpecialPriceNotice}
                className="p-1 rounded-lg text-purple-500 hover:text-purple-800 hover:bg-purple-100 transition-colors shrink-0 cursor-pointer"
                title="Tutup info"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Cart Items List */}
        <div className="pos-cart-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-3 space-y-2">
          {cart.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <Search className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-700">Keranjang Masih Kosong</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[210px]">
                Pilih produk dari katalog atau gunakan Quick Sale untuk item non-katalog.
              </p>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setQuickSaleError(null);
                  setIsQuickSaleModalOpen(true);
                  setTimeout(() => quickSaleDescInputRef.current?.focus(), 60);
                }}
                className="mt-3 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5 text-emerald-600" />
                <span>Quick Sale (Item Bebas)</span>
              </button>
            </div>
          )}
          <AnimatePresence initial={false}>
            {cart.map((item) => {
              const selectedCustomerItemHistory = selectedCustomer
                ? getProductSalesHistory(item, selectedCustomer)
                : [];
              const latestCustomerSale = selectedCustomerItemHistory[0] || null;

              return (
              <motion.div
                key={item.cartItemId}
                layout="position"
                initial={{ opacity: 0, x: 24, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 18, scale: 0.97, transition: { duration: 0.16, ease: 'easeIn' } }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div 
                    onClick={() => {
                      sound.playTap();
                      setPriceEditTarget({
                        cartItemId: item.cartItemId,
                        productId: item.productId,
                        productName: item.productName,
                        unitName: item.selectedUnit.unitName,
                        originalPrice: item.originalUnitPrice || item.selectedUnit.sellingPrice || item.unitPrice,
                        currentPrice: item.unitPrice,
                        quantity: item.quantity,
                      });
                    }}
                    className="truncate cursor-pointer group/title flex-1 select-none"
                    title="Klik produk untuk ubah harga jual per item"
                  >
                    <h4 className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5 group-hover/title:text-sky-600 transition-colors">
                      <span className="truncate">{item.productName}</span>
                      <Edit3 className="w-3 h-3 text-slate-400 group-hover/title:text-sky-600 transition-colors shrink-0" />
                      {item.isQuickSale && (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-black shrink-0 border ${
                            item.isCashWithdrawal
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {item.isCashWithdrawal ? 'TARIK TUNAI' : 'QUICK SALE'}
                        </span>
                      )}
                      {item.isService && (
                        <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 text-[9px] font-black shrink-0 border border-purple-200">
                          JASA
                        </span>
                      )}
                    </h4>
                    
                    {/* Multi-unit & Variant badge & Interactive Custom Price */}
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                        item.isService ? 'bg-purple-100 text-purple-800' : 'bg-sky-100 text-sky-800'
                      }`}>
                        {item.selectedUnit.unitName}
                      </span>
                      {item.selectedVariant && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {item.selectedVariant}
                        </span>
                      )}
                      {item.selectedUnit.conversionFactor > 1 && (
                        <span className="text-[10px] text-slate-400">
                          (Isi {item.selectedUnit.conversionFactor} {item.baseUnit})
                        </span>
                      )}

                      {/* Clickable Price Tag / Ubah Harga Button */}
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold font-mono tabular-nums border transition-all ${
                        item.isCustomPrice
                          ? 'bg-amber-100 text-amber-950 border-amber-300 shadow-2xs'
                          : 'bg-slate-100 text-slate-700 border-slate-200 group-hover/title:bg-sky-100 group-hover/title:text-sky-800 group-hover/title:border-sky-300'
                      }`}>
                        <Edit3 className="w-2.5 h-2.5 text-amber-600" />
                        <span>@ {formatRupiah(item.unitPrice)}</span>
                        {item.isCustomPrice && (
                          <span className="text-[8px] font-black text-amber-800 bg-white/90 px-1 py-0.2 rounded border border-amber-200">
                            Diedit
                          </span>
                        )}
                      </span>

                      {/* Special Category Price indicator & Min. Qty Trigger */}
                      {(() => {
                        const cartProd = productMap.get(item.productId);
                        const activeRuleInfo = cartProd && item.isCustomerSpecialPrice
                          ? findCustomerSpecialPrice(cartProd, selectedCustomer?.customerCategory || item.customerPriceCategory, item.selectedUnit, item.quantity)
                          : null;
                        const activeMinQty = activeRuleInfo?.rule?.minQuantity || 1;
                        const upcomingRuleInfo = cartProd && selectedCustomer?.customerCategory && !item.isCustomPrice
                          ? findUpcomingCustomerSpecialPrice(cartProd, selectedCustomer.customerCategory, item.selectedUnit, item.quantity)
                          : null;

                        return (
                          <>
                            {item.isCustomerSpecialPrice && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                                <span>
                                  🏷️ Khusus {item.customerPriceCategory || 'Kategori'}
                                  {activeMinQty > 1 ? ` (Min. ${activeMinQty} ${item.selectedUnit.unitName})` : ''}
                                </span>
                                {item.originalUnitPrice && item.originalUnitPrice !== item.unitPrice && (
                                  <span className="line-through text-slate-400 font-normal">
                                    {formatRupiah(item.originalUnitPrice)}
                                  </span>
                                )}
                              </span>
                            )}
                            {upcomingRuleInfo && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sound.playTap();
                                  if (upcomingRuleInfo.minQuantity <= item.availableStockInUnits || item.isService) {
                                    onUpdateCartItemQty(item.cartItemId, upcomingRuleInfo.minQuantity);
                                  }
                                }}
                                title="Klik untuk langsung set jumlah ke syarat minimal harga khusus"
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 transition-colors cursor-pointer"
                              >
                                <span>
                                  🎯 +{upcomingRuleInfo.neededMore} {item.selectedUnit.unitName} lagi → {formatRupiah(upcomingRuleInfo.nextRule.price)} (Min. {upcomingRuleInfo.minQuantity})
                                </span>
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {selectedCustomer && latestCustomerSale && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          sound.playTap();
                          openCartPriceHistory(item);
                        }}
                        title={`Lihat seluruh riwayat harga ${item.productName} untuk ${selectedCustomer.name}`}
                        className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-sky-700 hover:text-sky-900 font-semibold max-w-full truncate cursor-pointer"
                      >
                        <History className="w-3 h-3 shrink-0" />
                        <span className="truncate font-mono tabular-nums">
                          Terakhir {selectedCustomer.name}: {formatRupiah(latestCustomerSale.unitPrice)}/{latestCustomerSale.unitName} ·{' '}
                          {new Date(latestCustomerSale.timestamp).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                      </button>
                    )}

                    {((item.adminFee || 0) > 0 || item.isCashWithdrawal) && item.principalAmount !== undefined && (
                      <div className="mt-1 text-[10px] font-mono text-slate-600 flex items-center gap-1.5 flex-wrap">
                        <span>Nominal: {formatRupiah(item.principalAmount)}</span>
                        <span>•</span>
                        <span className="text-emerald-700 font-bold">
                          Admin: +{formatRupiah(item.adminFee || 0)}
                        </span>
                        {item.isCashWithdrawal && (
                          <span className="px-1 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200 font-sans font-bold text-[9px]">
                            Kas -{formatRupiah(item.principalAmount * item.quantity)}
                          </span>
                        )}
                      </div>
                    )}

                    {item.serviceNotes && (
                      <div className="text-[10px] text-purple-600 truncate mt-0.5 italic">
                        SOP: {item.serviceNotes}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        sound.playTap();
                        openCartPriceHistory(item);
                      }}
                      title={
                        selectedCustomer
                          ? `Riwayat harga ${item.productName} untuk ${selectedCustomer.name}`
                          : `Lihat riwayat harga jual ${item.productName} per pelanggan`
                      }
                      className={`px-2 py-1 min-h-[28px] rounded-lg border text-[10.5px] font-bold flex items-center gap-1 transition-colors shrink-0 whitespace-nowrap cursor-pointer ${
                        selectedCustomerItemHistory.length > 0
                          ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      <History className="w-3 h-3 shrink-0" />
                      {selectedCustomerItemHistory.length > 0 && (
                        <span className="font-mono tabular-nums font-extrabold text-[10px]">
                          {selectedCustomerItemHistory.length}x
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        onRemoveCartItem(item.cartItemId);
                      }}
                      title="Batalkan item ini dari keranjang (Void)"
                      className="px-2 py-1 min-h-[28px] rounded-lg bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 text-[10.5px] font-bold flex items-center gap-1 transition-colors shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3 text-rose-600 shrink-0" />
                      <span>Batalkan</span>
                    </button>
                  </div>
                </div>

                {/* Stepper & Subtotal */}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
                    <button
                      onClick={() => {
                        sound.playTap();
                        onUpdateCartItemQty(item.cartItemId, item.quantity - 1);
                      }}
                      className="pos-stepper-btn w-7 h-7 rounded-md bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shadow-2xs transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setKeypadTarget({
                          cartItemId: item.cartItemId,
                          productName: item.productName,
                          unitName: item.selectedUnit.unitName,
                          currentQty: item.quantity,
                        });
                      }}
                      className="pos-stepper-btn px-2 py-0.5 min-w-[32px] text-center text-xs font-black text-slate-900 font-mono bg-white hover:bg-sky-50 hover:text-sky-700 rounded border border-slate-200 transition-colors shadow-2xs cursor-pointer active:scale-95"
                      title="Klik untuk ubah jumlah via Numpad Layar Sentuh Tablet"
                    >
                      {item.quantity}
                    </button>

                    <button
                      onClick={() => {
                        sound.playTap();
                        onUpdateCartItemQty(item.cartItemId, item.quantity + 1);
                      }}
                      className="pos-stepper-btn w-7 h-7 rounded-md bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shadow-2xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                      {formatRupiah(item.subtotal)}
                    </div>
                  </div>
                </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Footer Checkout Summary */}
        <div className="pos-cart-footer p-3 bg-slate-50 border-t border-slate-200 space-y-2 shrink-0 max-h-[65%] overflow-y-auto overscroll-contain">
          {/* Subtotal & Discount rows */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal Belanja:</span>
              <span className="font-mono tabular-nums font-semibold">{formatRupiah(subtotal)}</span>
            </div>

            {membershipDiscountAmount > 0 && (
              <div className="flex justify-between text-indigo-700 font-semibold">
                <span className="flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Diskon Member {customerTier} ({tierDiscountPercent}%):</span>
                </span>
                <span className="font-mono tabular-nums">-{formatRupiah(membershipDiscountAmount)}</span>
              </div>
            )}

            {effectivePointsToUse > 0 && pointDiscountAmount > 0 && (
              <div className="flex justify-between text-amber-700 font-semibold">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Potongan Poin ({formatNumber(effectivePointsToUse)} pts):
                </span>
                <span className="font-mono tabular-nums">-{formatRupiah(pointDiscountAmount)}</span>
              </div>
            )}

            {selectedCustomer && (
              <>
                <div className="flex justify-between text-amber-700 text-[11px]">
                  <span>Poin Pelanggan Saat Ini:</span>
                  <span className="font-mono font-bold">
                    {isSelectedMember ? `${formatNumber(selectedCustomer.totalPoints || 0)} Poin` : 'Non-Member (0 Poin)'}
                  </span>
                </div>
                {storeSettings.enablePoints && (
                  <div className={`flex justify-between text-[11px] ${
                    isSelectedMember && potentialPointsEarned > 0 ? 'text-emerald-700' : 'text-slate-500'
                  }`}>
                    <span>
                      Poin Didapat Transaksi Ini
                      {isSelectedMember ? ` (Rp ${formatNumber(storeSettings.spendPerPoint || 0)} → ${formatNumber(storeSettings.pointsPerSpend ?? 1)} Poin)` : ''}:
                    </span>
                    <span className="font-mono font-bold">
                      {isSelectedMember ? `+${formatNumber(potentialPointsEarned)} Poin` : '0 Poin (Non-Member)'}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
            <span className="text-sm font-bold text-slate-800">Total Tagihan:</span>
            <span className="text-xl md:text-2xl font-extrabold text-sky-700 font-mono tabular-nums">
              {formatRupiah(grandTotal)}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pos-checkout-actions grid grid-cols-4 gap-2 pt-1">
            <button
              onClick={() => {
                sound.playTap();
                if (cart.length > 0 && window.confirm('Kosongkan semua barang dari keranjang kasir?')) {
                  onClearCart();
                }
              }}
              disabled={cart.length === 0}
              className="pos-cta-primary col-span-1 py-3 px-2 rounded-xl bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
              title="Kosongkan Keranjang (F8)"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Batal</span>
              <kbd className="hidden sm:inline-block px-1 py-0.2 text-[9px] font-mono font-bold bg-slate-300/80 text-slate-700 rounded">
                F8
              </kbd>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                onOpenPaymentModal();
              }}
              disabled={cart.length === 0}
              className="pos-cta-primary col-span-3 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-40 disabled:hover:bg-sky-600 text-white font-extrabold text-sm md:text-base shadow-md shadow-sky-600/30 transition-all flex items-center justify-center gap-2"
              title="Selesaikan & Buka Pembayaran (F2)"
            >
              <CreditCard className="w-5 h-5 stroke-[2.5]" />
              <span>BAYAR ({formatRupiah(grandTotal)})</span>
              <kbd className="px-1.5 py-0.5 text-[11px] font-mono font-black bg-sky-700 text-sky-100 rounded border border-sky-500 shadow-2xs">
                F2
              </kbd>
            </button>
          </div>

          {/* Real-time Mini-Dashboard Footer Toggle & Live Performance KPIs */}
          <div className="pt-2 border-t border-slate-200">
            {(() => {
              const dailySalesGoal = storeSettings?.dailySalesGoal && storeSettings.dailySalesGoal > 0 
                ? storeSettings.dailySalesGoal 
                : 5000000;
              const goalPercentage = Math.round((todayStats.totalRevenue / dailySalesGoal) * 100);
              const clampedGoalPercentage = Math.min(100, Math.max(0, goalPercentage));
              const circleRadius = 34;
              const circleCircumference = 2 * Math.PI * circleRadius; // ~213.63
              const circleOffset = circleCircumference - (clampedGoalPercentage / 100) * circleCircumference;
              const isGoalAchieved = todayStats.totalRevenue >= dailySalesGoal;

              const strokeColor = isGoalAchieved 
                ? '#34d399' // emerald-400
                : goalPercentage >= 50 
                ? '#38bdf8' // sky-400
                : '#fbbf24'; // amber-400

              return (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setIsMiniDashboardOpen(!isMiniDashboardOpen);
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer border border-slate-200"
                    title="Tampilkan / Sembunyikan Mini-Dashboard Kinerja Kasir Hari Ini"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <BarChart2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span className="truncate">
                        Mini-Dashboard: <strong className="font-mono text-slate-900">{formatRupiah(todayStats.totalRevenue)}</strong> ({todayStats.totalTransactions} Trx)
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 border ${
                          isGoalAchieved
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : goalPercentage >= 50
                            ? 'bg-sky-100 text-sky-800 border-sky-300'
                            : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {goalPercentage}% Target
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-slate-500 font-semibold text-[10px]">
                      <span className="uppercase">{isMiniDashboardOpen ? 'Tutup' : 'Lihat'}</span>
                      {isMiniDashboardOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </div>
                  </button>

                  {isMiniDashboardOpen && (
                    <div className="mt-2 p-3 rounded-2xl bg-slate-900 text-white space-y-2.5 animate-in slide-in-from-bottom-2 duration-150 shadow-xl border border-slate-800">
                      {/* Live Header & Sub-Tab Switcher */}
                      <div className="flex items-center justify-between text-[10.5px] text-slate-400 pb-1.5 border-b border-slate-800">
                        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-sky-400">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Live KPI Kasir Hari Ini</span>
                        </div>

                        {/* View Mode Switcher */}
                        <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setMiniDashboardTab('OVERVIEW');
                            }}
                            className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all cursor-pointer ${
                              miniDashboardTab === 'OVERVIEW'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Ringkasan & Goal
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setMiniDashboardTab('TREND');
                            }}
                            className={`px-2 py-0.5 rounded text-[9.5px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
                              miniDashboardTab === 'TREND'
                                ? 'bg-sky-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            <TrendingUp className="w-2.5 h-2.5" />
                            <span>Tren 7 Hari</span>
                          </button>
                        </div>
                      </div>

                      {miniDashboardTab === 'OVERVIEW' ? (
                        <>
                          {/* Daily Sales Goal Section with Circular Progress Bar */}
                          <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700/80 flex flex-col sm:flex-row items-center gap-3.5">
                            {/* Circular Progress Bar (SVG) */}
                            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                              <svg className="w-full h-full" viewBox="0 0 88 88">
                                {/* Background Circle Ring */}
                                <circle
                                  cx="44"
                                  cy="44"
                                  r={circleRadius}
                                  stroke="#334155"
                                  strokeWidth="7"
                                  fill="transparent"
                                />
                                {/* Foreground Animated Progress Arc */}
                                <circle
                                  cx="44"
                                  cy="44"
                                  r={circleRadius}
                                  stroke={strokeColor}
                                  strokeWidth="7"
                                  strokeDasharray={circleCircumference}
                                  strokeDashoffset={circleOffset}
                                  strokeLinecap="round"
                                  fill="transparent"
                                  transform="rotate(-90 44 44)"
                                  className="transition-all duration-700 ease-out"
                                />
                              </svg>

                              {/* Inner Percentage & Label */}
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-sm font-black font-mono leading-none tracking-tight text-white">
                                  {goalPercentage}%
                                </span>
                                <span className="text-[8px] font-bold uppercase text-slate-400 tracking-wider mt-0.5 flex items-center gap-0.5">
                                  {isGoalAchieved ? (
                                    <>
                                      <Check className="w-2.5 h-2.5 text-emerald-400" />
                                      <span className="text-emerald-400">LUNAS</span>
                                    </>
                                  ) : (
                                    'TARGET'
                                  )}
                                </span>
                              </div>
                            </div>

                            {/* Goal Information & Progress Text */}
                            <div className="flex-1 w-full text-left space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                                  <Target className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Target Penjualan Harian</span>
                                </span>
                                <span className="text-xs font-mono font-bold text-slate-300">
                                  {formatRupiah(dailySalesGoal)}
                                </span>
                              </div>

                              <div className="flex items-baseline justify-between">
                                <span className="text-xs text-slate-400">Tercapai:</span>
                                <span className="text-sm font-black font-mono text-emerald-400 tabular-nums">
                                  {formatRupiah(todayStats.totalRevenue)}
                                </span>
                              </div>

                              {/* Linear progress track helper */}
                              <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700 ease-out"
                                  style={{
                                    width: `${clampedGoalPercentage}%`,
                                    backgroundColor: strokeColor,
                                  }}
                                />
                              </div>

                              {/* Goal remaining / exceeded badge */}
                              <div className="pt-0.5">
                                {isGoalAchieved ? (
                                  <p className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                                    <span>🎉 Target hari ini tercapai! (+{formatRupiah(todayStats.totalRevenue - dailySalesGoal)})</span>
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-slate-400">
                                    Sisa <strong className="text-amber-300 font-mono">{formatRupiah(dailySalesGoal - todayStats.totalRevenue)}</strong> lagi untuk mencapai target
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 4 Standard Metrics Grid */}
                          <div className="grid grid-cols-2 gap-2 text-left">
                            <div className="p-2 bg-slate-800/90 rounded-xl border border-slate-700/60">
                              <div className="text-[10px] uppercase font-bold text-slate-400">Omzet Penjualan</div>
                              <div className="text-sm font-black font-mono text-emerald-400 mt-0.5 tabular-nums">
                                {formatRupiah(todayStats.totalRevenue)}
                              </div>
                            </div>

                            <div className="p-2 bg-slate-800/90 rounded-xl border border-slate-700/60">
                              <div className="text-[10px] uppercase font-bold text-slate-400">Total Transaksi</div>
                              <div className="text-sm font-black font-mono text-sky-400 mt-0.5 tabular-nums">
                                {todayStats.totalTransactions} Nota Kasir
                              </div>
                            </div>

                            <div className="p-2 bg-slate-800/90 rounded-xl border border-slate-700/60">
                              <div className="text-[10px] uppercase font-bold text-slate-400">Rata-rata Nota</div>
                              <div className="text-xs font-black font-mono text-amber-300 mt-0.5 tabular-nums">
                                {formatRupiah(todayStats.avgBasketSize)}
                              </div>
                            </div>

                            <div className="p-2 bg-slate-800/90 rounded-xl border border-slate-700/60">
                              <div className="text-[10px] uppercase font-bold text-slate-400">Top Produk Terjual</div>
                              <div className="text-xs font-bold text-slate-200 mt-0.5 truncate" title={todayStats.topProduct?.name || 'Belum ada transaksi hari ini'}>
                                {todayStats.topProduct ? `${todayStats.topProduct.name} (${todayStats.topProduct.qty})` : 'Belum ada'}
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        /* 7-Day Sales Trend with Recharts */
                        <div className="p-3 bg-slate-800/90 rounded-xl border border-slate-700/80 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-slate-300 font-bold">
                              <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                              <span>Pola Fluktuasi Omzet 7 Hari Terakhir</span>
                            </div>
                            <div className="text-[11px] font-mono text-emerald-400 font-bold">
                              Total: {formatRupiah(sevenDaysTrend.reduce((sum, d) => sum + d.revenue, 0))}
                            </div>
                          </div>

                          <div className="h-32 w-full pt-1">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={sevenDaysTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="posSevenDayGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.8}/>
                                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0.05}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                                <XAxis 
                                  dataKey="label" 
                                  stroke="#94a3b8" 
                                  fontSize={9} 
                                  tickLine={false} 
                                />
                                <YAxis 
                                  stroke="#94a3b8" 
                                  fontSize={9} 
                                  tickLine={false}
                                  tickFormatter={(val) => val >= 1000000 ? `${(val / 1000000).toFixed(1)}jt` : `${Math.round(val / 1000)}k`} 
                                />
                                <RechartsTooltip 
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      const data = payload[0].payload;
                                      return (
                                        <div className="p-2 bg-slate-950 border border-slate-700 rounded-lg shadow-xl text-[10.5px]">
                                          <div className="font-bold text-slate-300">{data.fullDate || data.label}</div>
                                          <div className="text-emerald-400 font-mono font-bold mt-0.5">
                                            Omzet: {formatRupiah(data.revenue)}
                                          </div>
                                          <div className="text-sky-400 font-mono text-[9.5px]">
                                            {data.txCount} Transaksi Selesai
                                          </div>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Area 
                                  type="monotone" 
                                  dataKey="revenue" 
                                  stroke="#38bdf8" 
                                  strokeWidth={2}
                                  fillOpacity={1} 
                                  fill="url(#posSevenDayGradient)" 
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* MULTI-UNIT SELECTION MODAL                                     */}
      {/* Triggered when a product has multiple units (PCS, PACK, DUS)   */}
      {/* ============================================================== */}
      {unitSelectModalProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-sky-600 uppercase tracking-wider">
                    Pilih Satuan Penjualan
                  </span>
                  {(() => {
                    const catColor = getCategoryColor(unitSelectModalProduct.category, categories, unitSelectModalProduct);
                    return (
                      <span
                        style={{
                          backgroundColor: `${catColor}15`,
                          color: catColor,
                          borderColor: `${catColor}35`,
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md text-[10px] font-bold border"
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor }} />
                        <span>{unitSelectModalProduct.category}</span>
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">
                  {unitSelectModalProduct.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stok total: {formatNumber(unitSelectModalProduct.stockInBaseUnit)} {unitSelectModalProduct.baseUnit}
                </p>
              </div>
              <button
                onClick={() => setUnitSelectModalProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Variant Selector (if product has variants) */}
            {unitSelectModalProduct.variants && unitSelectModalProduct.variants.length > 0 && (
              <div className="p-3.5 bg-indigo-50/70 rounded-2xl border border-indigo-100 my-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Pilih {unitSelectModalProduct.variantLabel || 'Varian Produk'}:</span>
                  </label>
                  <span className="text-[11px] font-bold text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-indigo-200">
                    {selectedVariantForModal || 'Default'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {unitSelectModalProduct.variants.map((v) => {
                    const isSelected = selectedVariantForModal === v.name;
                    return (
                      <button
                        key={v.id || v.name}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setSelectedVariantForModal(v.name);
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs scale-105 ring-2 ring-indigo-400'
                            : 'bg-white text-slate-700 border border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-indigo-500'}`} />
                        <span>{v.name}</span>
                        {v.price !== undefined && v.price > 0 && (
                          <span className={`text-[10px] ml-0.5 ${isSelected ? 'text-indigo-100' : 'text-indigo-600'}`}>
                            ({formatRupiah(v.price)})
                          </span>
                        )}
                        {v.barcode && (
                          <span className={`text-[9px] font-mono ml-0.5 opacity-70`}>
                            [{v.barcode}]
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="py-2 space-y-2">
              {unitSelectModalProduct.units.map((unit, idx) => {
                const maxUnitsAvailable = Math.floor(
                  unitSelectModalProduct.stockInBaseUnit / unit.conversionFactor
                );
                const isOutOfStock = maxUnitsAvailable <= 0;

                // Calculate displayed price reflecting selected variant custom price
                const selectedVarObj = unitSelectModalProduct.variants?.find((v) => v.name === selectedVariantForModal);
                let effectivePrice = unit.sellingPrice;
                if (selectedVarObj?.price !== undefined && selectedVarObj.price > 0) {
                  effectivePrice = selectedVarObj.price * (unit.conversionFactor || 1);
                } else if (selectedVarObj?.priceAdjustment) {
                  effectivePrice = Math.max(0, unit.sellingPrice + (selectedVarObj.priceAdjustment * (unit.conversionFactor || 1)));
                }

                return (
                  <button
                    key={unit.id}
                    disabled={isOutOfStock}
                    onClick={() => {
                      sound.playTap();
                      checkSmartStockWarning(unitSelectModalProduct, (unit.conversionFactor || 1) * 1);
                      onAddToCart(unitSelectModalProduct, unit, 1, selectedVariantForModal || undefined);
                      setUnitSelectModalProduct(null);
                    }}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                      isOutOfStock
                        ? 'opacity-40 bg-slate-50 border-slate-200 cursor-not-allowed'
                        : 'bg-white hover:bg-sky-50/50 hover:border-sky-500 border-slate-200 active:scale-[0.99] shadow-2xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          [{idx + 1}]
                        </kbd>
                        <span className="font-bold text-sm text-slate-900">{unit.unitName}</span>
                        {selectedVariantForModal && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                            {selectedVariantForModal}
                          </span>
                        )}
                        {unit.conversionFactor > 1 && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            1 {unit.unitName} = {unit.conversionFactor} {unitSelectModalProduct.baseUnit}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        Sedia: {formatNumber(maxUnitsAvailable)} {unit.unitName}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-extrabold text-sky-700 font-mono tabular-nums">
                        {formatRupiah(effectivePrice)}
                      </div>
                      <span className="text-[11px] font-bold text-sky-600 group-hover:underline">
                        + Tambah
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setUnitSelectModalProduct(null)}
                className="w-full py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <span>Batal</span>
                <kbd className="px-1 py-0.2 text-[9px] font-mono bg-slate-200 text-slate-600 rounded">Esc</kbd>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* PHYSICAL KEYBOARD SHORTCUTS CHEATSHEET MODAL (F12 / ?)         */}
      {/* ============================================================== */}
      {isKeyboardHelpOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 select-none animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-400/30">
                  <Keyboard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Pintasan Keyboard Fisik Kasir</span>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-400/20 text-sky-300 border border-sky-400/30">
                      External Keyboard
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Didesain untuk keyboard Bluetooth / USB pada tablet kasir atau komputer POS
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  sound.playTap();
                  setIsKeyboardHelpOpen(false);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Shortcuts Content */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Category 1: Operasional Kasir Utama */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  Operasional Kasir Utama (Primary POS)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Cari Produk / SKU / Barcode</span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">F1</kbd>
                      <span className="text-[10px] text-slate-400">atau</span>
                      <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">/</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-sky-50/50 rounded-xl border border-sky-200">
                    <span className="text-xs font-bold text-sky-950">Bayar / Buka Checkout</span>
                    <kbd className="px-2.5 py-1 bg-sky-600 text-white font-mono text-xs font-black rounded-lg shadow-2xs">F2</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Scan Barcode (Kamera / USB)</span>
                    <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">F3</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Pilih / Ganti Member Pelanggan</span>
                    <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">F4</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-emerald-50/70 rounded-xl border border-emerald-200">
                    <span className="text-xs font-bold text-emerald-950">Quick Sale (Item Bebas Tanpa Katalog)</span>
                    <kbd className="px-2 py-1 bg-emerald-600 text-white font-mono text-xs font-bold rounded-lg shadow-2xs">F6</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Kosongkan / Batal Keranjang</span>
                    <kbd className="px-2 py-1 bg-white text-rose-700 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">F8</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Tukar Poin Member Loyalty</span>
                    <kbd className="px-2 py-1 bg-white text-amber-700 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">F9</kbd>
                  </div>
                </div>
              </div>

              {/* Category 2: Navigasi & Sistem */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  Notifikasi & Navigasi
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Pusat Notifikasi Ambang Batas</span>
                    <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">F10</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Pengaturan Ambang Batas Stok</span>
                    <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">F11</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Panduan Pintasan Keyboard</span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">F12</kbd>
                      <span className="text-[10px] text-slate-400">atau</span>
                      <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">?</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Tutup Modal / Bersihkan Search</span>
                    <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">Esc</kbd>
                  </div>
                </div>
              </div>

              {/* Category 3: Item Keranjang & Pemilihan Satuan */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Kuantitas & Pemilihan Satuan Multi-Level
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Tambah Qty (+1) Item Terakhir</span>
                    <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">+</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Kurangi Qty (-1) Item Terakhir</span>
                    <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">-</kbd>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200 sm:col-span-2">
                    <span className="text-xs font-semibold text-slate-800">Pilih Satuan Produk saat dialog terbuka (Pcs, Pack, Dus)</span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-2 py-1 bg-white text-sky-700 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">[ 1 ]</kbd>
                      <kbd className="px-2 py-1 bg-white text-sky-700 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">[ 2 ]</kbd>
                      <kbd className="px-2 py-1 bg-white text-sky-700 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">[ 3 ]</kbd>
                    </div>
                  </div>
                </div>
              </div>

              {/* Category 4: Modal Pembayaran */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  Di Dalam Modal Pembayaran
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Pilih Tunai / QRIS / EDC / Transfer / Piutang</span>
                    <div className="flex items-center gap-1">
                      <kbd className="px-2 py-1 bg-white text-slate-800 font-mono text-xs font-bold rounded-lg border border-slate-300 shadow-2xs">1 - 5</kbd>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="text-xs font-semibold text-slate-800">Selesaikan & Konfirmasi Transaksi</span>
                    <kbd className="px-2.5 py-1 bg-emerald-600 text-white font-mono text-xs font-bold rounded-lg shadow-2xs">Enter ↵</kbd>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Tekan <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-[11px] font-mono font-bold text-slate-700">Esc</kbd> untuk menutup
              </span>
              <button
                onClick={() => {
                  sound.playTap();
                  setIsKeyboardHelpOpen(false);
                }}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* High-Contrast Touch Numpad Modal for Cart Item Quantity */}
      {keypadTarget && (
        <TouchKeypadModal
          isOpen={!!keypadTarget}
          onClose={() => setKeypadTarget(null)}
          title="Ubah Jumlah (Qty) Barang"
          subtitle={keypadTarget.productName}
          initialValue={keypadTarget.currentQty}
          unitName={keypadTarget.unitName}
          min={1}
          max={9999}
          quickPresets={[1, 2, 5, 10, 24, 40, 50]}
          onConfirm={(newQty) => {
            onUpdateCartItemQty(keypadTarget.cartItemId, newQty);
          }}
        />
      )}

      {/* High-Contrast Touch Numpad Modal for Custom Selling Price per Item */}
      {priceEditTarget && (
        <TouchKeypadModal
          isOpen={!!priceEditTarget}
          onClose={() => setPriceEditTarget(null)}
          title="Manual Override / Edit Harga Item"
          subtitle={`${priceEditTarget.productName} (${priceEditTarget.unitName}) • ${priceEditTarget.quantity} ${priceEditTarget.unitName}`}
          initialValue={priceEditTarget.currentPrice}
          unitName="Rupiah"
          isCurrency={true}
          min={0}
          max={999999999}
          quickPresets={[
            priceEditTarget.originalPrice,
            Math.round(priceEditTarget.originalPrice * 0.95),
            Math.round(priceEditTarget.originalPrice * 0.9),
            Math.round(priceEditTarget.originalPrice * 0.85),
            Math.round(priceEditTarget.originalPrice * 0.8),
          ]}
          manualOverrideContext={{
            originalPrice: priceEditTarget.originalPrice,
            quantity: priceEditTarget.quantity,
          }}
          onConfirm={(newPrice, reason) => {
            if (onUpdateCartItemPrice) {
              onUpdateCartItemPrice(priceEditTarget.cartItemId, newPrice, reason);
            }
            setPriceEditTarget(null);
          }}
        />
      )}

      {/* Customer Product Selling Price History Modal */}
      {priceHistoryTarget && (() => {
        const allForProduct = getProductSalesHistory(priceHistoryTarget, null);
        const customerOnlyRecords = selectedCustomer
          ? getProductSalesHistory(priceHistoryTarget, selectedCustomer)
          : [];
        const baseList =
          priceHistoryShowAllCustomers || !selectedCustomer ? allForProduct : customerOnlyRecords;

        const qCust = priceHistoryCustomerQuery.trim().toLowerCase();
        const visibleRecords = qCust
          ? baseList.filter((r) => r.customerName.toLowerCase().includes(qCust))
          : baseList;

        const distinctCustomerNames = Array.from(
          new Set(allForProduct.map((r) => r.customerName).filter(Boolean))
        ).slice(0, 8);

        const prices = visibleRecords.map((r) => r.unitPrice);
        const latestRec = visibleRecords[0] || null;
        const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
        const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
        const totalQtyBought = visibleRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-5 py-4 bg-slate-900 text-white flex items-start justify-between gap-3 shrink-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-400/30 text-sky-300 flex items-center justify-center shrink-0">
                    <History className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold leading-tight truncate">
                      Riwayat Harga Jual Pelanggan
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5 truncate">
                      {priceHistoryTarget.productName} · Harga keranjang saat ini{' '}
                      <span className="font-mono tabular-nums font-bold text-sky-300">
                        {formatRupiah(priceHistoryTarget.unitPrice)}/{priceHistoryTarget.selectedUnit.unitName}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPriceHistoryTarget(null)}
                  className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Customer Filter Controls */}
              <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-2.5 shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {selectedCustomer ? (
                    <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setPriceHistoryShowAllCustomers(false);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          !priceHistoryShowAllCustomers
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Pelanggan: {selectedCustomer.name} ({customerOnlyRecords.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setPriceHistoryShowAllCustomers(true);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          priceHistoryShowAllCustomers
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Semua Pelanggan ({allForProduct.length})
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setPriceHistoryTarget(null);
                        onOpenCustomerModal();
                      }}
                      className="px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <User className="w-3.5 h-3.5" />
                      <span>Pilih Pelanggan di Kasir</span>
                    </button>
                  )}

                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={priceHistoryCustomerQuery}
                      onChange={(e) => {
                        setPriceHistoryCustomerQuery(e.target.value);
                        if (selectedCustomer && e.target.value.trim() && !priceHistoryShowAllCustomers) {
                          setPriceHistoryShowAllCustomers(true);
                        }
                      }}
                      placeholder="Filter berdasarkan nama pelanggan..."
                      className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-xl bg-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>

                {distinctCustomerNames.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    <span className="text-[10.5px] font-semibold text-slate-500 shrink-0">
                      Pernah membeli:
                    </span>
                    {distinctCustomerNames.map((custName) => {
                      const active =
                        priceHistoryCustomerQuery.trim().toLowerCase() === custName.toLowerCase();
                      return (
                        <button
                          key={custName}
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setPriceHistoryShowAllCustomers(true);
                            setPriceHistoryCustomerQuery(active ? '' : custName);
                          }}
                          className={`px-2 py-1 rounded-lg text-[10.5px] font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            active
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {custName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Summary Strip */}
              <div className="px-4 py-3 border-b border-slate-100 grid grid-cols-3 gap-2.5 bg-white shrink-0">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500">Harga Terakhir</div>
                  <div className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                    {latestRec ? formatRupiah(latestRec.unitPrice) : '-'}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {latestRec ? `${latestRec.customerName} (${latestRec.unitName})` : 'Belum ada data'}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500">Rentang Harga</div>
                  <div className="text-xs md:text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                    {prices.length > 0
                      ? minPrice === maxPrice
                        ? formatRupiah(minPrice)
                        : `${formatRupiah(minPrice)} – ${formatRupiah(maxPrice)}`
                      : '-'}
                  </div>
                  <div className="text-[10px] text-slate-500">Terendah s/d tertinggi</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] font-semibold text-slate-500">Frekuensi Transaksi</div>
                  <div className="text-sm font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                    {formatNumber(visibleRecords.length)}x · {formatNumber(totalQtyBought)} item
                  </div>
                  <div className="text-[10px] text-slate-500">Riwayat tercatat</div>
                </div>
              </div>

              {/* Scrollable List of Customer Transactions */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/40">
                {visibleRecords.length === 0 ? (
                  <div className="py-10 text-center space-y-2.5">
                    <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                      <History className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-bold text-slate-800">
                      Belum Ada Riwayat Harga untuk Filter Ini
                    </p>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      {selectedCustomer && !priceHistoryShowAllCustomers
                        ? `${selectedCustomer.name} belum pernah tercatat membeli ${priceHistoryTarget.productName}.`
                        : `Belum ada transaksi tersimpan untuk produk ${priceHistoryTarget.productName}.`}
                    </p>
                    {selectedCustomer && !priceHistoryShowAllCustomers && allForProduct.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setPriceHistoryShowAllCustomers(true);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>Lihat Semua Pelanggan ({allForProduct.length})</span>
                      </button>
                    )}
                  </div>
                ) : (
                  visibleRecords.map((rec) => {
                    const priceDiff = rec.unitPrice - priceHistoryTarget.unitPrice;
                    return (
                      <div
                        key={rec.id}
                        className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-slate-500" />
                              <span>{rec.customerName}</span>
                            </span>
                            <span className="font-mono text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                              {rec.invoiceNumber}
                            </span>
                            {rec.isCustomerSpecialPrice && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                Harga Khusus
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap font-mono tabular-nums">
                            <span>{formatDateTime(rec.timestamp)}</span>
                            <span>·</span>
                            <span>
                              {formatNumber(rec.quantity)} {rec.unitName}
                              {rec.selectedVariant ? ` (${rec.selectedVariant})` : ''}
                            </span>
                            <span>·</span>
                            <span className="font-sans">Kasir: {rec.cashierName}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <div className="text-left sm:text-right font-mono tabular-nums">
                            <div className="text-sm font-bold text-slate-900">
                              {formatRupiah(rec.unitPrice)}
                              <span className="text-[11px] font-normal text-slate-500">/{rec.unitName}</span>
                            </div>
                            <div className="text-[10.5px] font-semibold flex items-center sm:justify-end gap-0.5">
                              {priceDiff === 0 ? (
                                <span className="text-slate-500">Sama dgn keranjang</span>
                              ) : priceDiff < 0 ? (
                                <span className="text-emerald-700 flex items-center gap-0.5">
                                  <ArrowDownRight className="w-3 h-3" />
                                  {formatRupiah(Math.abs(priceDiff))} lebih murah
                                </span>
                              ) : (
                                <span className="text-amber-700 flex items-center gap-0.5">
                                  <ArrowUpRight className="w-3 h-3" />+{formatRupiah(priceDiff)} lebih tinggi
                                </span>
                              )}
                            </div>
                          </div>

                          {onUpdateCartItemPrice && (
                            <button
                              type="button"
                              onClick={() => {
                                sound.playSuccessChime();
                                onUpdateCartItemPrice(
                                  priceHistoryTarget.cartItemId,
                                  rec.unitPrice,
                                  `Mengikuti riwayat harga ${rec.customerName} (${rec.invoiceNumber})`
                                );
                                setPriceHistoryTarget(null);
                              }}
                              disabled={priceDiff === 0}
                              className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-default transition-colors"
                            >
                              {priceDiff === 0 ? 'Aktif' : 'Terapkan'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 bg-white border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
                <span className="text-[11px] text-slate-500">
                  Menerapkan harga historis otomatis menyesuaikan total item di keranjang.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setPriceHistoryTarget(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Quick Sale Ad-Hoc Item Entry Modal */}
      {isQuickSaleModalOpen && (() => {
        const parsedNominal = Math.max(0, Number(String(quickSaleAmount).replace(/[^0-9]/g, '')) || 0);
        const parsedAdminFee = Math.max(0, Number(String(quickSaleAdminFee).replace(/[^0-9]/g, '')) || 0);
        const safeQty = Math.max(1, quickSaleQty);
        const unitTotal = parsedNominal + parsedAdminFee;
        const subtotalQuickSale = unitTotal * safeQty;
        const isTarikTunaiDesc = /tarik\s*tunai/i.test(quickSaleDescription.trim());

        const fallbackCashBalance = transactions.reduce((sum, tx) => {
          const isCash = tx.paymentMethod === 'CASH' || tx.settledPaymentMethod === 'CASH';
          const cashIn = isCash ? Math.max(0, (tx.finalAmount || 0) - (tx.returnedAmount || 0)) : 0;
          const wdOut = (tx.items || []).reduce((iSum, it) => {
            const isWd =
              Boolean(it.isCashWithdrawal) ||
              (Boolean(it.isQuickSale) && /tarik\s*tunai/i.test(it.productName || ''));
            if (!isWd) return iSum;
            const p = it.principalAmount !== undefined ? Math.max(0, it.principalAmount) : Math.max(0, it.costPrice || 0);
            return iSum + Math.max(1, it.quantity || 1) * p;
          }, 0);
          return sum + cashIn - wdOut;
        }, 0);
        const effectiveStoreCashBalance = Math.max(
          0,
          availableStoreCashBalance !== undefined ? availableStoreCashBalance : fallbackCashBalance
        );

        const cartWithdrawalCashTotal = cart.reduce((sum, item) => {
          const itemIsWd =
            Boolean(item.isCashWithdrawal) ||
            (Boolean(item.isQuickSale) && /tarik\s*tunai/i.test(item.productName || ''));
          if (!itemIsWd) return sum;
          const principal =
            item.principalAmount !== undefined ? Math.max(0, item.principalAmount) : Math.max(0, item.unitPrice || 0);
          return sum + principal * Math.max(1, item.quantity || 1);
        }, 0);

        const remainingCashForWithdrawal = Math.max(0, effectiveStoreCashBalance - cartWithdrawalCashTotal);
        const requestedWithdrawalTotal = isTarikTunaiDesc ? parsedNominal * safeQty : 0;
        const exceedsStoreCashBalance =
          isTarikTunaiDesc && parsedNominal > 0 && requestedWithdrawalTotal > remainingCashForWithdrawal;
        const cashBalanceShortfall = Math.max(0, requestedWithdrawalTotal - remainingCashForWithdrawal);

        return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 max-h-[94vh] flex flex-col">
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  <Zap className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold leading-tight">Quick Sale (Item Bebas)</h3>
                  <p className="text-[11px] text-emerald-100">
                    Input cepat barang khusus / non-katalog langsung ke keranjang
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickSaleModalOpen(false)}
                className="p-1.5 rounded-xl text-emerald-100 hover:text-white hover:bg-white/15 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!quickSaleDescription.trim()) {
                  sound.playError();
                  setQuickSaleError('Masukkan nama atau deskripsi barang / item terlebih dahulu.');
                  return;
                }
                if (!Number.isFinite(parsedNominal) || parsedNominal <= 0) {
                  sound.playError();
                  setQuickSaleError('Masukkan nominal harga satuan yang valid (> Rp 0).');
                  return;
                }
                if (onAddQuickSaleItem) {
                  const res = onAddQuickSaleItem({
                    description: quickSaleDescription.trim(),
                    amount: parsedNominal,
                    adminFee: parsedAdminFee,
                    quantity: safeQty,
                    unitName: quickSaleUnit || 'ITEM',
                    isCashWithdrawal: isTarikTunaiDesc,
                  });
                  if (res && (res.ok === false || res.blocked)) {
                    setQuickSaleError(res.error || 'Nominal Tarik Tunai melebihi batas saldo kas toko.');
                    return;
                  }
                } else if (exceedsStoreCashBalance) {
                  sound.playError();
                  setQuickSaleError(
                    `Nominal Tarik Tunai (${formatRupiah(requestedWithdrawalTotal)}) melebihi saldo kas toko tersedia (${formatRupiah(remainingCashForWithdrawal)}). Kurangi nominal atau tambah modal kas di menu Keuangan.`
                  );
                  return;
                }
                setQuickSaleDescription('');
                setQuickSaleAmount('');
                setQuickSaleAdminFee('');
                setQuickSaleQty(1);
                setQuickSaleUnit('ITEM');
                setQuickSaleError(null);
                setIsQuickSaleModalOpen(false);
                if (isPortrait) {
                  setPortraitTab('CART');
                }
              }}
              className="p-5 space-y-3.5 overflow-y-auto flex-1"
            >
              {quickSaleError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{quickSaleError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Deskripsi Produk / Item <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={quickSaleDescInputRef}
                  type="text"
                  value={quickSaleDescription}
                  onChange={(e) => {
                    setQuickSaleDescription(e.target.value);
                    if (quickSaleError) setQuickSaleError(null);
                  }}
                  placeholder="Misal: Tarik Tunai, Jasa Bungkus Kado, Item Lain-lain..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:outline-none text-sm font-medium text-slate-900"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Tarik Tunai', 'Item Lain-lain', 'Jasa Bungkus Kado', 'Biaya Kirim / Antar', 'Barang Khusus'].map((preset) => {
                    const isSelectedPreset = quickSaleDescription.trim().toLowerCase() === preset.toLowerCase();
                    const isWithdrawalPreset = preset === 'Tarik Tunai';
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setQuickSaleDescription(preset);
                          if (isWithdrawalPreset) {
                            setQuickSaleUnit('JASA');
                          }
                          if (quickSaleError) setQuickSaleError(null);
                        }}
                        className={`px-2 py-1 rounded-lg border text-[10.5px] font-semibold transition-colors cursor-pointer ${
                          isSelectedPreset
                            ? isWithdrawalPreset
                              ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                              : 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : isWithdrawalPreset
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                            : 'bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-600 border-slate-200'
                        }`}
                      >
                        + {preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isTarikTunaiDesc && (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                    exceedsStoreCashBalance || remainingCashForWithdrawal <= 0
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-80">
                      Batas Saldo Kas Toko Tersedia
                    </div>
                    {cartWithdrawalCashTotal > 0 && (
                      <div className="text-[10px] text-slate-600">
                        Total Kas: {formatRupiah(effectiveStoreCashBalance)} − Keranjang: {formatRupiah(cartWithdrawalCashTotal)}
                      </div>
                    )}
                  </div>
                  <div className="font-mono font-black text-sm tabular-nums shrink-0">
                    {formatRupiah(remainingCashForWithdrawal)}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Harga Satuan / Nominal (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={quickSaleAmount}
                    onChange={(e) => {
                      setQuickSaleAmount(e.target.value);
                      if (quickSaleError) setQuickSaleError(null);
                    }}
                    placeholder="0"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border focus:outline-none text-base font-extrabold font-mono text-slate-900 transition-colors ${
                      exceedsStoreCashBalance
                        ? 'border-rose-500 bg-rose-50/50 focus:border-rose-600 ring-2 ring-rose-500/20'
                        : 'border-slate-300 focus:border-emerald-500'
                    }`}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[5000, 10000, 20000, 50000, 100000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setQuickSaleAmount(String(amt));
                        if (quickSaleError) setQuickSaleError(null);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                        Number(quickSaleAmount) === amt
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 hover:bg-emerald-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {formatRupiah(amt)}
                    </button>
                  ))}
                </div>
              </div>

              {exceedsStoreCashBalance && (
                <div
                  role="alert"
                  className="p-3 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 shadow-xs space-y-1 animate-in fade-in duration-150"
                >
                  <div className="flex items-center gap-2 text-xs font-extrabold text-rose-700">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 animate-pulse" />
                    <span>Peringatan: Melebihi Saldo Kas Toko!</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-800">
                    Nominal penarikan tunai{' '}
                    <strong className="font-mono">{formatRupiah(requestedWithdrawalTotal)}</strong> melebihi sisa
                    saldo kas toko tersedia{' '}
                    <strong className="font-mono">{formatRupiah(remainingCashForWithdrawal)}</strong> (kurang{' '}
                    <strong className="font-mono text-rose-700">{formatRupiah(cashBalanceShortfall)}</strong>).
                  </p>
                  <p className="text-[10.5px] text-rose-700/90 font-medium">
                    Sesuaikan nominal/jumlah tarik tunai atau catat suntikan modal kas di menu Keuangan terlebih dahulu.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Biaya Admin (Rp)
                  <span className="ml-1.5 text-[10.5px] font-normal text-slate-400">
                    {isTarikTunaiDesc ? '(Tercatat sebagai keuntungan)' : '(Opsional, ditambahkan ke subtotal)'}
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    Rp
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="1"
                    value={quickSaleAdminFee}
                    onChange={(e) => {
                      setQuickSaleAdminFee(e.target.value);
                      if (quickSaleError) setQuickSaleError(null);
                    }}
                    placeholder="0"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-500 focus:outline-none text-base font-extrabold font-mono text-slate-900"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[0, 2000, 2500, 3000, 5000, 10000].map((fee) => (
                    <button
                      key={fee}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setQuickSaleAdminFee(fee === 0 ? '' : String(fee));
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border transition-colors cursor-pointer ${
                        parsedAdminFee === fee
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-slate-50 hover:bg-sky-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {formatRupiah(fee)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Jumlah (Qty)
                  </label>
                  <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setQuickSaleQty((q) => Math.max(1, q - 1));
                      }}
                      className="w-8 h-8 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold shadow-2xs"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={quickSaleQty}
                      onChange={(e) => setQuickSaleQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full text-center bg-transparent text-sm font-black font-mono text-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setQuickSaleQty((q) => q + 1);
                      }}
                      className="w-8 h-8 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Satuan
                  </label>
                  <select
                    value={quickSaleUnit}
                    onChange={(e) => setQuickSaleUnit(e.target.value)}
                    className="w-full h-[42px] px-3 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ITEM">ITEM</option>
                    <option value="PCS">PCS</option>
                    <option value="PAKET">PAKET</option>
                    <option value="JASA">JASA</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] text-emerald-800">
                  <span>Harga Satuan + Biaya Admin{safeQty > 1 ? ` (${safeQty}x)` : ''}:</span>
                  <span className="font-mono font-bold tabular-nums">
                    {formatRupiah(parsedNominal)} + {formatRupiah(parsedAdminFee)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-emerald-200/70">
                  <span className="text-xs font-bold text-emerald-900">Subtotal Item Quick Sale:</span>
                  <span className="text-lg font-black font-mono text-emerald-700 tabular-nums">
                    {formatRupiah(subtotalQuickSale)}
                  </span>
                </div>
              </div>

              {isTarikTunaiDesc && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950 space-y-1">
                  <div className="font-extrabold text-amber-900">
                    Pencatatan Otomatis Mode Tarik Tunai:
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Pengurangan Uang Cash (Nominal):</span>
                    <span className="font-mono font-bold text-rose-700 tabular-nums">
                      -{formatRupiah(parsedNominal * safeQty)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tercatat sebagai Keuntungan (Biaya Admin):</span>
                    <span className="font-mono font-bold text-emerald-700 tabular-nums">
                      +{formatRupiah(parsedAdminFee * safeQty)}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsQuickSaleModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`flex-[2] py-2.5 px-4 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    exceedsStoreCashBalance
                      ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border-2 border-rose-400'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
                  }`}
                >
                  {exceedsStoreCashBalance ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Saldo Kas Tidak Cukup (Diblokir)</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Tambahkan ke Keranjang</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
        );
      })()}

      {/* ===================================================================== */}
      {/* QUICK REPORTS SIDE-PANEL (Today's Revenue, Transactions & Top 3)      */}
      {/* ===================================================================== */}
      {isQuickReportsOpen && (() => {
        const dailyGoal =
          storeSettings?.dailySalesGoal && storeSettings.dailySalesGoal > 0
            ? storeSettings.dailySalesGoal
            : 5000000;
        const goalPct = Math.min(100, Math.round((todayStats.totalRevenue / dailyGoal) * 100));
        const maxTopQty = todayStats.top3Products[0]?.qty || 1;
        const todayDateLabel = new Date().toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        const cashRevenueToday = todayStats.todayTxs
          .filter((tx) => tx.paymentMethod === 'CASH')
          .reduce((sum, tx) => sum + (tx.finalAmount || 0), 0);
        const cashWithdrawalOutToday = todayStats.todayTxs.reduce((sum, tx) => {
          return (
            sum +
            (tx.items || []).reduce((itemSum, it) => {
              const isTarikTunai =
                Boolean(it.isCashWithdrawal) ||
                (Boolean(it.isQuickSale) && /tarik\s*tunai/i.test(it.productName || ''));
              if (!isTarikTunai) return itemSum;
              const principal =
                it.principalAmount !== undefined
                  ? Math.max(0, it.principalAmount)
                  : Math.max(0, it.costPrice || 0);
              return itemSum + (it.quantity || 0) * principal;
            }, 0)
          );
        }, 0);
        const netCashToday = cashRevenueToday - cashWithdrawalOutToday;
        const nonCashRevenueToday = Math.max(0, todayStats.totalRevenue - cashRevenueToday);

        return (
          <div
            className="fixed inset-0 z-50 flex justify-end bg-slate-900/45 backdrop-blur-[1px] animate-in fade-in duration-150"
            onClick={() => {
              sound.playTap();
              setIsQuickReportsOpen(false);
            }}
          >
            <aside
              role="dialog"
              aria-label="Quick Reports Penjualan Hari Ini"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200"
            >
              {/* Side-Panel Header */}
              <div className="px-5 py-4 bg-slate-900 text-white flex items-start justify-between gap-3 shrink-0">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                    <BarChart2 className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-extrabold tracking-tight">Quick Reports</h2>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase">
                        Hari Ini
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{todayDateLabel}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setIsQuickReportsOpen(false);
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Tutup Quick Reports (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Side-Panel Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50">
                {/* Key Snapshot KPIs: Today's Total Revenue & Total Transactions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-gradient-to-br from-sky-600 to-indigo-700 text-white p-4 rounded-2xl shadow-md shadow-sky-600/20 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-sky-100 uppercase tracking-wider">
                      <span>Omzet Hari Ini</span>
                      <TrendingUp className="w-4 h-4 text-emerald-300" />
                    </div>
                    <div className="text-xl font-black font-mono tabular-nums leading-tight">
                      {formatRupiah(todayStats.totalRevenue)}
                    </div>
                    <div className="text-[11px] text-sky-100/90 font-medium pt-0.5">
                      Rata-rata/nota: <span className="font-mono font-bold text-white">{formatRupiah(todayStats.avgBasketSize)}</span>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col justify-between space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      <span>Total Transaksi</span>
                      <ShoppingCart className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="text-2xl font-black font-mono text-slate-900 tabular-nums">
                      {formatNumber(todayStats.totalTransactions)}
                      <span className="text-xs font-sans font-bold text-slate-500 ml-1.5">Nota</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center justify-between pt-0.5">
                      <span>
                        Tunai:{' '}
                        <strong className="font-mono text-slate-700">
                          {formatRupiah(netCashToday)}
                        </strong>
                      </span>
                      {cashWithdrawalOutToday > 0 && (
                        <span className="text-[10px] font-mono font-bold text-rose-600">
                          (Tarik Tunai -{formatRupiah(cashWithdrawalOutToday)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Daily Sales Target Progress */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-emerald-600" />
                      <span>Progres Target Penjualan Harian</span>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono ${
                        goalPct >= 100
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-sky-100 text-sky-800'
                      }`}
                    >
                      {goalPct}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        goalPct >= 100 ? 'bg-emerald-500' : 'bg-sky-600'
                      }`}
                      style={{ width: `${goalPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>Tercapai: <strong className="font-mono text-slate-800">{formatRupiah(todayStats.totalRevenue)}</strong></span>
                    <span>Target: <strong className="font-mono text-slate-800">{formatRupiah(dailyGoal)}</strong></span>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Pembayaran Non-Tunai / Piutang:</span>
                    <span className="font-mono font-bold text-indigo-700">{formatRupiah(nonCashRevenueToday)}</span>
                  </div>
                </div>

                {/* Top 3 Best-Selling Products Today */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      <div>
                        <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                          Top 3 Produk Terlaris Hari Ini
                        </h3>
                        <p className="text-[10.5px] text-slate-500">
                          Berdasarkan jumlah unit terjual hari ini
                        </p>
                      </div>
                    </div>
                  </div>

                  {todayStats.top3Products.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 space-y-1.5">
                      <Trophy className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
                      <p className="text-xs font-bold text-slate-600">Belum ada penjualan hari ini</p>
                      <p className="text-[11px] text-slate-400 max-w-[240px] mx-auto">
                        Produk terlaris hari ini akan muncul otomatis setelah transaksi pertama selesai.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {todayStats.top3Products.map((item, idx) => {
                        const rankBadgeStyles = [
                          'bg-amber-100 text-amber-800 border-amber-300',
                          'bg-slate-200 text-slate-700 border-slate-300',
                          'bg-orange-100 text-orange-800 border-orange-300',
                        ][idx] || 'bg-slate-100 text-slate-700 border-slate-200';
                        const barPct = Math.max(12, Math.round((item.qty / maxTopQty) * 100));

                        return (
                          <div
                            key={item.productId}
                            className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-6 h-6 rounded-lg border text-[11px] font-black flex items-center justify-center shrink-0 ${rankBadgeStyles}`}
                                >
                                  #{idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-slate-900 truncate" title={item.name}>
                                    {item.name}
                                  </div>
                                  <div className="text-[10.5px] text-slate-500 font-medium">
                                    Omzet: <span className="font-mono font-bold text-slate-700">{formatRupiah(item.revenue)}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-xs font-black font-mono text-indigo-700">
                                  {formatNumber(item.qty)} {item.unitName}
                                </div>
                                <div className="text-[9.5px] text-slate-400 font-semibold uppercase">Terjual</div>
                              </div>
                            </div>

                            <div className="w-full h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  idx === 0
                                    ? 'bg-amber-500'
                                    : idx === 1
                                    ? 'bg-sky-500'
                                    : 'bg-indigo-500'
                                }`}
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recent Transactions Snapshot Today */}
                {todayStats.todayTxs.length > 0 && (
                  <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2.5">
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>Transaksi Terakhir Hari Ini</span>
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {Math.min(3, todayStats.todayTxs.length)} terbaru
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {todayStats.todayTxs.slice(0, 3).map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-mono font-bold text-slate-800 text-[11px] truncate">
                              {tx.invoiceNumber}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {new Date(tx.timestamp).toLocaleTimeString('id-ID', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}{' '}
                              • {tx.customerName || 'Pelanggan Umum'}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono font-black text-slate-900 text-[11.5px]">
                              {formatRupiah(tx.finalAmount)}
                            </div>
                            <div className="text-[9.5px] font-bold text-slate-500">
                              {String(tx.paymentMethod).replace(/_/g, ' ')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Side-Panel Footer */}
              <div className="p-4 bg-white border-t border-slate-200 shrink-0 flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-slate-500">
                  Keranjang kasir tetap aktif ({cartItemCount} item)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setIsQuickReportsOpen(false);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-colors cursor-pointer"
                >
                  Tutup &amp; Lanjut Kasir
                </button>
              </div>
            </aside>
          </div>
        );
      })()}
    </div>
  );
};
