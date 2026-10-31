import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  CornerDownLeft
} from 'lucide-react';
import { Product, ProductUnit, ProductCategory, Customer, CartItem, StoreSettings, StockAlertNotification, Transaction } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getCategoryColor } from '../utils/categoryColors';
import { 
  isNotificationSupported, 
  requestNotificationPermission, 
  sendWebPushNotification, 
  getNotificationPermission 
} from '../utils/notifications';
import { StockAlertWidget } from './StockAlertWidget';
import { StockNotificationToast } from './StockNotificationToast';
import { InventoryHealthWidget } from './InventoryHealthWidget';

interface TabletPOSViewProps {
  products: Product[];
  categories?: ProductCategory[];
  customers: Customer[];
  cart: CartItem[];
  selectedCustomer: Customer | null;
  usePoints: boolean;
  pointsToUse: number;
  storeSettings: StoreSettings;
  onAddToCart: (product: Product, unit: ProductUnit, qty?: number) => void;
  onUpdateCartItemQty: (cartItemId: string, newQty: number) => void;
  onChangeCartItemUnit: (cartItemId: string, newUnit: ProductUnit) => void;
  onRemoveCartItem: (cartItemId: string) => void;
  onClearCart: () => void;
  onSelectCustomer: (customer: Customer | null) => void;
  onOpenCustomerModal: () => void;
  onToggleUsePoints: (use: boolean) => void;
  onOpenPaymentModal: () => void;
  onOpenScannerModal: () => void;
  onOpenThresholdSettings: () => void;
  onNavigateToSuppliers?: () => void;
  transactions?: Transaction[];
}

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
  onAddToCart,
  onUpdateCartItemQty,
  onChangeCartItemUnit,
  onRemoveCartItem,
  onClearCart,
  onSelectCustomer,
  onOpenCustomerModal,
  onToggleUsePoints,
  onOpenPaymentModal,
  onOpenScannerModal,
  onOpenThresholdSettings,
  onNavigateToSuppliers,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');
  const [unitSelectModalProduct, setUnitSelectModalProduct] = useState<Product | null>(null);
  const [isKeyboardHelpOpen, setIsKeyboardHelpOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Automated Stock Alert & Push Notification System states
  const [activePushToast, setActivePushToast] = useState<StockAlertNotification | null>(null);
  const [alertHistory, setAlertHistory] = useState<StockAlertNotification[]>(() => {
    try {
      const saved = localStorage.getItem('kasir_stock_alert_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState<boolean>(() => {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted';
  });
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('kasir_sound_alerts_enabled');
    return saved !== null ? saved === 'true' : true;
  });

  // Track stock levels to trigger automated push alert when a product reaches minimum threshold
  const prevStocksRef = useRef<Map<string, number>>(new Map());
  const initialLoadRef = useRef(true);

  // Low stock products count
  const lowStockProducts = useMemo(() => {
    return products.filter((p) => p.stockInBaseUnit <= p.minStockAlert);
  }, [products]);

  // Automated Stock Reduction Detection: Triggers Push Alert & Visual Chime
  useEffect(() => {
    const prevMap = prevStocksRef.current;

    products.forEach((prod) => {
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
    localStorage.setItem('kasir_sound_alerts_enabled', String(soundAlertsEnabled));
  }, [soundAlertsEnabled]);

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

  // Extract unique category tabs
  const categoryTabList = useMemo(() => {
    const list: string[] = ['SEMUA'];
    const seen = new Set<string>();
    categories.forEach((c) => {
      if (!seen.has(c.name)) {
        seen.add(c.name);
        list.push(c.name);
      }
    });
    products.forEach((p) => {
      if (p.category && !seen.has(p.category)) {
        seen.add(p.category);
        list.push(p.category);
      }
    });
    return list;
  }, [categories, products]);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      let matchCat = true;
      if (selectedCategory === '__LOW_STOCK__') {
        matchCat = p.stockInBaseUnit <= p.minStockAlert;
      } else if (selectedCategory !== 'SEMUA') {
        matchCat = p.category === selectedCategory;
      }

      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.units.some((u) => u.barcode && u.barcode.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  // Cart calculations
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.subtotal, 0);
  }, [cart]);

  // Membership Tier Discount calculation
  const customerTier = selectedCustomer?.membershipTier || 'REGULER';
  const tierDiscountPercent = useMemo(() => {
    if (!selectedCustomer || !storeSettings.enableMembershipDiscount || !storeSettings.membershipDiscounts) return 0;
    if (customerTier === 'SILVER') return storeSettings.membershipDiscounts.silver || 0;
    if (customerTier === 'GOLD') return storeSettings.membershipDiscounts.gold || 0;
    if (customerTier === 'PLATINUM') return storeSettings.membershipDiscounts.platinum || 0;
    return 0;
  }, [selectedCustomer, customerTier, storeSettings]);

  const membershipDiscountAmount = useMemo(() => {
    if (tierDiscountPercent <= 0) return 0;
    return Math.round((subtotal * tierDiscountPercent) / 100);
  }, [subtotal, tierDiscountPercent]);

  const afterTierSubtotal = Math.max(0, subtotal - membershipDiscountAmount);

  // Point calculations
  const maxRedeemablePoints = useMemo(() => {
    if (!selectedCustomer || !storeSettings.enablePoints) return 0;
    // Points value cannot exceed subtotal after tier discount
    const maxPointsForSubtotal = Math.floor(afterTierSubtotal / storeSettings.pointValueRupiah);
    return Math.min(selectedCustomer.totalPoints, maxPointsForSubtotal);
  }, [selectedCustomer, storeSettings, afterTierSubtotal]);

  const pointDiscountAmount = useMemo(() => {
    if (!usePoints || !storeSettings.enablePoints) return 0;
    return pointsToUse * storeSettings.pointValueRupiah;
  }, [usePoints, pointsToUse, storeSettings]);

  const grandTotal = Math.max(0, afterTierSubtotal - pointDiscountAmount);

  const potentialPointsEarned = useMemo(() => {
    if (!selectedCustomer || !storeSettings.enablePoints || storeSettings.spendPerPoint <= 0) return 0;
    return Math.floor(grandTotal / storeSettings.spendPerPoint);
  }, [selectedCustomer, storeSettings, grandTotal]);

  const handleProductCardClick = (product: Product) => {
    sound.playTap();
    if (product.units.length > 1) {
      // Show multi-unit selection modal so cashier can choose PCS / PACK / DUS
      setUnitSelectModalProduct(product);
    } else {
      // Single unit, add directly
      onAddToCart(product, product.units[0]);
    }
  };

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
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-64px)] overflow-hidden bg-slate-100 relative">
      {/* Automated Floating Push Notification Toast */}
      <StockNotificationToast
        alert={activePushToast}
        categories={categories}
        onDismiss={() => setActivePushToast(null)}
        onHighlightProduct={handleHighlightProduct}
        onNavigateToSuppliers={onNavigateToSuppliers}
      />

      {/* ============================================================== */}
      {/* LEFT PANEL: PRODUCT CATALOG (65% width on tablet landscape)     */}
      {/* ============================================================== */}
      <section className="flex-1 lg:w-[65%] flex flex-col h-full border-r border-slate-200/80 bg-slate-50 overflow-hidden">
        {/* Top Control Bar: Search, Shortcuts, Notification Center, & Barcode Scan */}
        <div className="p-3 md:p-4 bg-white border-b border-slate-200 shadow-xs flex items-center gap-2.5 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama produk, SKU, barcode... (F1 / /)"
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

          {/* Physical Keyboard Shortcuts Cheatsheet Button */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsKeyboardHelpOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 transition-colors shrink-0 shadow-2xs"
            title="Daftar Pintasan Keyboard Fisik Kasir (F12 atau ?)"
          >
            <Keyboard className="w-4 h-4 text-slate-600" />
            <span className="hidden xl:inline">Pintasan</span>
            <kbd className="px-1.5 py-0.2 text-[9.5px] font-mono font-bold bg-white text-slate-700 rounded border border-slate-300 shadow-2xs">
              F12
            </kbd>
          </button>

          {/* Automated Stock Threshold Alert Notification Center Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsNotificationCenterOpen(!isNotificationCenterOpen);
              }}
              className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                lowStockProducts.length > 0
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-950 border-amber-300 shadow-xs ring-2 ring-amber-400/30'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
              title="Pusat Notifikasi Ambang Batas Stok (F10)"
            >
              <div className="relative">
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
              <span className="hidden sm:inline text-xs font-bold">
                Peringatan Stok
              </span>
              <kbd className="hidden sm:inline-block px-1 py-0.2 text-[9px] font-mono font-bold bg-slate-200/80 text-slate-600 rounded">
                F10
              </kbd>
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

                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleTriggerTestAlert}
                      className="text-[10px] text-sky-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Uji Coba Alert & Suara</span>
                    </button>

                    {alertHistory.length > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllAlertsRead}
                        className="text-[10px] text-slate-500 font-medium hover:underline"
                      >
                        Tandai Dibaca
                      </button>
                    )}
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
            onClick={() => {
              sound.playTap();
              onOpenScannerModal();
            }}
            className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-sm transition-colors shrink-0"
            title="Scan Barcode Produk (F3)"
          >
            <Barcode className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">Scan Barcode</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.2 text-[9.5px] font-mono font-bold bg-slate-800 text-sky-300 rounded border border-slate-700">
              F3
            </kbd>
          </button>
        </div>

        {/* Category Filter Horizontal Scroll with Color Badges + Low Stock Critical Filter */}
        <div className="px-3 md:px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
          {/* Dedicated Low Stock Alert Filter Tab */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setSelectedCategory(selectedCategory === '__LOW_STOCK__' ? 'SEMUA' : '__LOW_STOCK__');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 border shrink-0 ${
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
                : products.filter((p) => p.category.toLowerCase() === cat.toLowerCase()).length;

            return (
              <button
                key={cat}
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
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                  isSelected
                    ? 'shadow-xs font-bold'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
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
        </div>

        {/* Dashboard Widget 1: Real-time Stock Minimum Threshold Alerts */}
        <StockAlertWidget
          products={products}
          onOpenThresholdSettings={onOpenThresholdSettings}
          onNavigateToSuppliers={onNavigateToSuppliers}
          onQuickSelectProduct={(p) => handleHighlightProduct(p.id)}
        />

        {/* Dashboard Widget 2: Inventory Health Score & Dead Stock Identifier */}
        <InventoryHealthWidget
          products={products}
          transactions={transactions}
          onHighlightProduct={(id) => handleHighlightProduct(id)}
          onOpenThresholdSettings={onOpenThresholdSettings}
        />

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4">
          {filteredProducts.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
              <AlertCircle className="w-12 h-12 mb-3 stroke-[1.5]" />
              <p className="text-base font-semibold text-slate-700">Tidak ada produk ditemukan</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                Coba sesuaikan kata kunci pencarian atau ubah filter kategori di atas.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product) => {
                const isOutOfStock = product.stockInBaseUnit <= 0;
                const isLowStock = product.stockInBaseUnit > 0 && product.stockInBaseUnit <= product.minStockAlert;
                const isHighlighted = highlightedProductId === product.id;
                const defaultUnit = product.units[0];
                const catColor = getCategoryColor(product.category, categories, product);
                const stockRatio = product.minStockAlert > 0 ? (product.stockInBaseUnit / product.minStockAlert) * 100 : 0;

                return (
                  <div
                    id={`product-card-${product.id}`}
                    key={product.id}
                    onClick={() => !isOutOfStock && handleProductCardClick(product)}
                    className={`group bg-white rounded-2xl border p-3 flex flex-col justify-between transition-all duration-200 relative select-none ${
                      isHighlighted
                        ? 'ring-4 ring-sky-500 scale-[1.02] shadow-xl z-20 border-sky-500 bg-sky-50/20'
                        : isOutOfStock
                        ? 'opacity-75 cursor-not-allowed border-rose-300 bg-rose-50/20 ring-1 ring-rose-400/30'
                        : isLowStock
                        ? 'border-amber-400 bg-amber-50/20 shadow-xs ring-2 ring-amber-400/40 hover:border-amber-500'
                        : 'hover:border-sky-500 hover:shadow-md cursor-pointer border-slate-200/90 active:scale-[0.98]'
                    }`}
                  >
                    <div>
                      {/* Image & Badges */}
                      <div className="relative aspect-4/3 rounded-xl bg-slate-100 overflow-hidden mb-2.5">
                        {/* Highlighted Banner */}
                        {isHighlighted && (
                          <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-sky-600 text-white text-[10px] font-black tracking-wide shadow-md flex items-center gap-1 animate-pulse z-20">
                            <Sparkles className="w-3 h-3" />
                            <span>DISOROT</span>
                          </div>
                        )}

                        {/* Low stock threshold beacon ribbon */}
                        {!isHighlighted && isLowStock && (
                          <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black shadow-xs flex items-center gap-1 z-10 animate-subtle-pulse">
                            <AlertTriangle className="w-3 h-3 stroke-[2.5]" />
                            <span>BATAS MINIMUM</span>
                          </div>
                        )}

                        {/* Out of stock beacon ribbon */}
                        {!isHighlighted && isOutOfStock && (
                          <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black shadow-xs flex items-center gap-1 z-10 animate-pulse">
                            <AlertCircle className="w-3 h-3" />
                            <span>HABIS (0)</span>
                          </div>
                        )}

                        {product.imageUrl ? (
                          <img
                            src={product.imageUrl}
                            alt={product.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div
                            className="w-full h-full flex flex-col items-center justify-center font-bold text-xs"
                            style={{
                              backgroundColor: `${catColor}12`,
                              color: catColor,
                            }}
                          >
                            <span className="text-lg font-black">{product.name.charAt(0)}</span>
                            <span className="text-[10px] opacity-80">{product.category}</span>
                          </div>
                        )}

                        {/* Stock indicator badge */}
                        <div className={`absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-md shadow-xs font-mono ${
                          isOutOfStock
                            ? 'bg-rose-900/90 text-white'
                            : isLowStock
                            ? 'bg-amber-600/95 text-white animate-subtle-pulse border border-amber-300/60'
                            : 'bg-slate-900/80 text-white'
                        }`}>
                          Stok: {formatNumber(product.stockInBaseUnit)} {product.baseUnit}
                        </div>

                        {/* Multi-unit badge */}
                        {product.units.length > 1 && (
                          <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-sky-500 text-white text-[10px] font-bold shadow-xs flex items-center gap-1 z-10">
                            <Layers className="w-3 h-3" />
                            <span>{product.units.length} Satuan</span>
                          </div>
                        )}
                      </div>

                      {/* Color-Coded Category Pill */}
                      <div className="mb-1">
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
                          <span className="truncate">{product.category}</span>
                        </span>
                      </div>

                      <h3 className="text-xs md:text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">
                        {product.name}
                      </h3>
                    </div>

                    {/* Pricing and Unit selection indicator */}
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-slate-400">
                          {defaultUnit.unitName}
                        </div>
                        <div className="text-sm md:text-base font-bold text-sky-700 font-mono tabular-nums">
                          {formatRupiah(defaultUnit.sellingPrice)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProductCardClick(product);
                        }}
                        disabled={isOutOfStock}
                        className="w-8 h-8 rounded-xl bg-sky-50 group-hover:bg-sky-600 text-sky-600 group-hover:text-white flex items-center justify-center transition-colors shadow-xs"
                      >
                        <Plus className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>

                    {/* Explicit visual stock threshold alert meter */}
                    {isLowStock && (
                      <div className="mt-2 p-1.5 rounded-lg bg-amber-500/15 border border-amber-400/50 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold text-amber-900">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping"></span>
                            <span>KRITIS: Sisa {formatNumber(product.stockInBaseUnit)} {product.baseUnit}</span>
                          </span>
                          <span className="font-mono text-slate-600">Min {product.minStockAlert}</span>
                        </div>
                        <div className="w-full h-1.5 bg-amber-200/70 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-600 rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.max(8, stockRatio))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {isOutOfStock && (
                      <div className="mt-2 p-1.5 rounded-lg bg-rose-500/15 border border-rose-400/50 flex items-center justify-between text-[10px] font-black text-rose-800">
                        <span className="flex items-center gap-1 animate-pulse">
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
              })}
            </div>
          )}
        </div>
      </section>

      {/* ============================================================== */}
      {/* RIGHT PANEL: CART & CHECKOUT (35% width on tablet landscape)   */}
      {/* ============================================================== */}
      <section className="flex-1 lg:w-[35%] flex flex-col h-full bg-white border-l border-slate-200 shadow-sm overflow-hidden">
        {/* Customer & Loyalty Header Card */}
        <div className="p-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 truncate">
              <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center font-bold text-xs shrink-0">
                {selectedCustomer ? selectedCustomer.name.charAt(0) : 'U'}
              </div>
              <div className="truncate text-left">
                <div className="text-xs font-bold text-slate-800 truncate flex items-center gap-1.5">
                  <span>{selectedCustomer ? selectedCustomer.name : 'Pelanggan Umum (Non-Member)'}</span>
                  {selectedCustomer && (
                    <span className={`px-1.5 py-0.2 rounded-md text-[9.5px] font-black uppercase ${
                      customerTier === 'PLATINUM'
                        ? 'bg-purple-100 text-purple-800 border border-purple-300'
                        : customerTier === 'GOLD'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : customerTier === 'SILVER'
                        ? 'bg-slate-200 text-slate-800 border border-slate-300'
                        : 'bg-slate-100 text-slate-600'
                    }`}>
                      {customerTier} {tierDiscountPercent > 0 ? `(-${tierDiscountPercent}%)` : ''}
                    </span>
                  )}
                </div>
                {selectedCustomer ? (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span className="font-mono">{selectedCustomer.phone}</span>
                    <span>·</span>
                    <span className="font-semibold text-amber-600 flex items-center gap-0.5">
                      <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" />
                      {formatNumber(selectedCustomer.totalPoints)} Poin
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">Pilih member untuk dapatkan poin</div>
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
                onClick={() => {
                  sound.playTap();
                  onOpenCustomerModal();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-sky-500 text-slate-700 text-xs font-semibold shadow-2xs hover:text-sky-600 transition-colors flex items-center gap-1.5"
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

          {/* Loyalty Point Redemption Banner (if customer selected & has points) */}
          {selectedCustomer && storeSettings.enablePoints && selectedCustomer.totalPoints > 0 && (
            <div className="mt-2.5 p-2 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200/80 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-amber-900">
                    Tukar {maxRedeemablePoints} Poin
                  </div>
                  <div className="text-[10px] text-amber-700">
                    Potongan {formatRupiah(maxRedeemablePoints * storeSettings.pointValueRupiah)}
                  </div>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePoints}
                  onChange={(e) => {
                    sound.playTap();
                    onToggleUsePoints(e.target.checked);
                  }}
                  disabled={maxRedeemablePoints <= 0}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>
          )}
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                <Search className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-700">Keranjang Masih Kosong</p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                Pilih produk dari katalog di sebelah kiri untuk memulai transaksi kasir.
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.cartItemId}
                className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-2xs hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate">
                    <h4 className="text-xs font-bold text-slate-900 truncate">
                      {item.productName}
                    </h4>
                    
                    {/* Multi-unit badge & selection */}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 font-mono">
                        {item.selectedUnit.unitName}
                      </span>
                      {item.selectedUnit.conversionFactor > 1 && (
                        <span className="text-[10px] text-slate-400">
                          (Isi {item.selectedUnit.conversionFactor} {item.baseUnit})
                        </span>
                      )}
                      <span className="text-xs font-medium text-slate-500 font-mono tabular-nums">
                        @ {formatRupiah(item.unitPrice)}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      sound.playTap();
                      onRemoveCartItem(item.cartItemId);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Stepper & Subtotal */}
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-0.5">
                    <button
                      onClick={() => {
                        sound.playTap();
                        onUpdateCartItemQty(item.cartItemId, item.quantity - 1);
                      }}
                      className="w-7 h-7 rounded-md bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shadow-2xs transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    
                    <span className="w-8 text-center text-xs font-bold text-slate-900 font-mono">
                      {item.quantity}
                    </span>

                    <button
                      onClick={() => {
                        sound.playTap();
                        onUpdateCartItemQty(item.cartItemId, item.quantity + 1);
                      }}
                      className="w-7 h-7 rounded-md bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs shadow-2xs transition-colors"
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
              </div>
            ))
          )}
        </div>

        {/* Footer Checkout Summary */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 space-y-2">
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

            {usePoints && pointDiscountAmount > 0 && (
              <div className="flex justify-between text-amber-700 font-semibold">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Potongan Poin ({pointsToUse} pts):
                </span>
                <span className="font-mono tabular-nums">-{formatRupiah(pointDiscountAmount)}</span>
              </div>
            )}

            {selectedCustomer && potentialPointsEarned > 0 && (
              <div className="flex justify-between text-emerald-700 text-[11px]">
                <span>Poin didapat transaksi ini:</span>
                <span className="font-mono font-bold">+{potentialPointsEarned} Poin</span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
            <span className="text-sm font-bold text-slate-800">Total Tagihan:</span>
            <span className="text-xl md:text-2xl font-extrabold text-sky-700 font-mono tabular-nums">
              {formatRupiah(grandTotal)}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-4 gap-2 pt-1">
            <button
              onClick={() => {
                sound.playTap();
                if (cart.length > 0 && window.confirm('Kosongkan semua barang dari keranjang kasir?')) {
                  onClearCart();
                }
              }}
              disabled={cart.length === 0}
              className="col-span-1 py-3 px-2 rounded-xl bg-slate-200 hover:bg-slate-300 disabled:opacity-40 disabled:hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
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
              className="col-span-3 py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-40 disabled:hover:bg-sky-600 text-white font-extrabold text-sm md:text-base shadow-md shadow-sky-600/30 transition-all flex items-center justify-center gap-2"
              title="Selesaikan & Buka Pembayaran (F2)"
            >
              <CreditCard className="w-5 h-5 stroke-[2.5]" />
              <span>BAYAR ({formatRupiah(grandTotal)})</span>
              <kbd className="px-1.5 py-0.5 text-[11px] font-mono font-black bg-sky-700 text-sky-100 rounded border border-sky-500 shadow-2xs">
                F2
              </kbd>
            </button>
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

            <div className="py-4 space-y-2">
              {unitSelectModalProduct.units.map((unit, idx) => {
                const maxUnitsAvailable = Math.floor(
                  unitSelectModalProduct.stockInBaseUnit / unit.conversionFactor
                );
                const isOutOfStock = maxUnitsAvailable <= 0;

                return (
                  <button
                    key={unit.id}
                    disabled={isOutOfStock}
                    onClick={() => {
                      sound.playTap();
                      onAddToCart(unitSelectModalProduct, unit, 1);
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
                        {formatRupiah(unit.sellingPrice)}
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
    </div>
  );
};
