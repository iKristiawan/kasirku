import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  Truck,
  Store,
  QrCode,
  Building2,
  Banknote,
  MessageCircle,
  ExternalLink,
  Copy,
  Package,
  ArrowRight,
  ChevronRight,
  Sparkles,
  Wrench,
  AlertCircle,
  Receipt,
  SlidersHorizontal,
  ArrowLeft,
} from 'lucide-react';
import storefrontHeroImg from '../assets/images/online_store_hero_1794833654577.jpg';
import {
  Product,
  ProductCategory,
  ProductUnit,
  StoreSettings,
  OnlineOrder,
  OnlineOrderItem,
  OnlineOrderFulfillment,
  OnlineOrderStatus,
  CustomPaymentMethod,
} from '../types/pos';
import {
  formatRupiah,
  formatNumber,
  formatDateTime,
  formatWhatsAppUrl,
  generateOnlineOrderCode,
} from '../utils/formatters';
import { sound } from '../utils/audio';

interface OnlineCartItem {
  cartKey: string;
  productId: string;
  productName: string;
  category: string;
  selectedUnit: ProductUnit;
  selectedVariant?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  maxStockInUnits: number;
  isService?: boolean;
  imageUrl?: string;
}

interface OnlineStorefrontPageProps {
  products: Product[];
  categories: ProductCategory[];
  storeSettings: StoreSettings;
  onlineOrders: OnlineOrder[];
  onSubmitOnlineOrder: (order: OnlineOrder) => Promise<void>;
  onReturnToPOS?: () => void;
  initialSection?: 'catalog' | 'tracking';
  initialOrderCode?: string;
}

const ONLINE_CART_STORAGE_KEY = 'kasirku_online_cart_v1';
const MY_ONLINE_ORDERS_STORAGE_KEY = 'kasirku_my_online_orders_v1';

const STATUS_META: Record<
  OnlineOrderStatus,
  { label: string; desc: string; badgeClass: string; step: number }
> = {
  MENUNGGU_KONFIRMASI: {
    label: 'Menunggu Konfirmasi',
    desc: 'Pesanan Anda sudah masuk dan menunggu konfirmasi dari kasir toko.',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    step: 1,
  },
  DIPROSES: {
    label: 'Sedang Disiapkan',
    desc: 'Tim toko sedang mengecek & mengemas barang pesanan Anda.',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    step: 2,
  },
  SIAP_DIAMBIL: {
    label: 'Siap Diambil di Toko',
    desc: 'Pesanan sudah siap. Silakan tunjukkan kode pesanan saat mengambil di kasir.',
    badgeClass: 'bg-teal-50 text-teal-800 border-teal-200',
    step: 3,
  },
  DIKIRIM: {
    label: 'Dalam Pengiriman Kurir',
    desc: 'Kurir toko sedang mengantarkan pesanan menuju alamat Anda.',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    step: 3,
  },
  SELESAI: {
    label: 'Pesanan Selesai',
    desc: 'Transaksi selesai dan tercatat resmi di kasir toko.',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    step: 4,
  },
  DIBATALKAN: {
    label: 'Dibatalkan',
    desc: 'Pesanan dibatalkan.',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    step: 0,
  },
};

export const OnlineStorefrontPage: React.FC<OnlineStorefrontPageProps> = ({
  products,
  categories,
  storeSettings,
  onlineOrders,
  onSubmitOnlineOrder,
  onReturnToPOS,
  initialSection = 'catalog',
  initialOrderCode = '',
}) => {
  const [activeView, setActiveView] = useState<'catalog' | 'tracking'>(initialSection);
  const [heroImageError, setHeroImageError] = useState(false);

  // Catalog filter & sort
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');
  const [sortBy, setSortBy] = useState<'DEFAULT' | 'PRICE_ASC' | 'PRICE_DESC' | 'NAME_ASC'>('DEFAULT');

  // Product detail modal (PDP)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailUnit, setDetailUnit] = useState<ProductUnit | null>(null);
  const [detailVariant, setDetailVariant] = useState<string | undefined>(undefined);
  const [detailQty, setDetailQty] = useState<number>(1);

  // Shopping Cart Drawer + Persistence
  const [cart, setCart] = useState<OnlineCartItem[]>(() => {
    try {
      const saved = localStorage.getItem(ONLINE_CART_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [cartToast, setCartToast] = useState<string | null>(null);

  // Customer local recent order codes
  const [myOrderCodes, setMyOrderCodes] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(MY_ONLINE_ORDERS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [trackingQuery, setTrackingQuery] = useState(initialOrderCode);
  const [activeTrackedOrderCode, setActiveTrackedOrderCode] = useState<string>(initialOrderCode);

  // Checkout Form
  const pickupEnabled = storeSettings.onlineStorePickupEnabled !== false;
  const deliveryEnabled = storeSettings.onlineStoreDeliveryEnabled !== false;
  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [membershipId, setMembershipId] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState<OnlineOrderFulfillment>(
    pickupEnabled ? 'AMBIL_DI_TOKO' : 'KIRIM_KURIR'
  );
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(ONLINE_CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(MY_ONLINE_ORDERS_STORAGE_KEY, JSON.stringify(myOrderCodes));
    } catch {}
  }, [myOrderCodes]);

  // Online-friendly payment methods (exclude internal PIUTANG kasbon)
  const onlinePaymentMethods = useMemo<CustomPaymentMethod[]>(() => {
    const methods = (storeSettings.customPaymentMethods || []).filter(
      (pm) => pm.isActive && pm.type !== 'PIUTANG' && pm.type !== 'CARD'
    );
    if (methods.length > 0) return methods;
    return [
      {
        id: 'pm_online_cash',
        name: fulfillmentType === 'KIRIM_KURIR' ? 'Bayar di Tempat (COD)' : 'Bayar di Kasir Saat Ambil',
        type: 'CASH',
        isActive: true,
        description: 'Pembayaran tunai langsung saat barang diterima atau diambil di toko.',
      },
    ];
  }, [storeSettings.customPaymentMethods, fulfillmentType]);

  useEffect(() => {
    if (!selectedPaymentId || !onlinePaymentMethods.some((m) => m.id === selectedPaymentId)) {
      const preferred =
        onlinePaymentMethods.find((m) => m.type === 'QRIS') || onlinePaymentMethods[0];
      if (preferred) setSelectedPaymentId(preferred.id);
    }
  }, [onlinePaymentMethods, selectedPaymentId]);

  const selectedPaymentMethod = useMemo(
    () => onlinePaymentMethods.find((m) => m.id === selectedPaymentId) || onlinePaymentMethods[0],
    [onlinePaymentMethods, selectedPaymentId]
  );

  // Sync live stock bounds into cart items whenever products update via Firestore
  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  const serviceCount = useMemo(
    () => products.filter((p) => p.productType === 'JASA').length,
    [products]
  );

  const visibleProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = products.filter((p) => {
      if (!p.units || p.units.length === 0) return false;
      const isService = p.productType === 'JASA';
      if (selectedCategory === 'JASA_LAYANAN') {
        if (!isService) return false;
      } else if (selectedCategory !== 'SEMUA') {
        if (p.category !== selectedCategory) return false;
      }
      if (q) {
        const hay = `${p.name} ${p.category} ${p.sku || ''} ${p.barcode || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (sortBy === 'PRICE_ASC') {
      return [...filtered].sort(
        (a, b) => (a.units[0]?.sellingPrice || 0) - (b.units[0]?.sellingPrice || 0)
      );
    }
    if (sortBy === 'PRICE_DESC') {
      return [...filtered].sort(
        (a, b) => (b.units[0]?.sellingPrice || 0) - (a.units[0]?.sellingPrice || 0)
      );
    }
    if (sortBy === 'NAME_ASC') {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'id'));
    }
    // Default: in-stock items & services first
    return [...filtered].sort((a, b) => {
      const aAvail = a.productType === 'JASA' || a.stockInBaseUnit > 0 ? 1 : 0;
      const bAvail = b.productType === 'JASA' || b.stockInBaseUnit > 0 ? 1 : 0;
      return bAvail - aAvail;
    });
  }, [products, selectedCategory, searchQuery, sortBy]);

  const resolveUnitPrice = (product: Product, unit: ProductUnit, variantName?: string): number => {
    let price = unit.sellingPrice || 0;
    if (variantName && product.variants) {
      const vObj = product.variants.find(
        (v) => v.name.toLowerCase() === variantName.toLowerCase()
      );
      if (vObj && vObj.price !== undefined && vObj.price > 0) {
        price = vObj.price * (unit.conversionFactor || 1);
      } else if (vObj && vObj.priceAdjustment) {
        price = Math.max(0, price + vObj.priceAdjustment * (unit.conversionFactor || 1));
      }
    }
    return price;
  };

  const showToast = (msg: string) => {
    setCartToast(msg);
    window.setTimeout(() => {
      setCartToast((curr) => (curr === msg ? null : curr));
    }, 2600);
  };

  const handleOpenProductDetail = (product: Product) => {
    sound.playTap();
    const firstUnit = product.units?.[0] || null;
    const firstVariant = product.variants && product.variants.length > 0 ? product.variants[0].name : undefined;
    setSelectedProduct(product);
    setDetailUnit(firstUnit);
    setDetailVariant(firstVariant);
    setDetailQty(1);
  };

  const handleAddItemToCart = (
    product: Product,
    unit: ProductUnit,
    qtyToAdd = 1,
    variantName?: string
  ) => {
    const isService = product.productType === 'JASA';
    const maxUnits = isService
      ? 999
      : Math.floor(product.stockInBaseUnit / (unit.conversionFactor || 1));

    if (!isService && maxUnits <= 0) {
      sound.playError();
      showToast(`Maaf, stok ${product.name} (${unit.unitName}) sedang habis.`);
      return;
    }

    const cartKey = `${product.id}__${unit.id}__${variantName || ''}`;
    const unitPrice = resolveUnitPrice(product, unit, variantName);

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.cartKey === cartKey);
      if (idx > -1) {
        const existing = prev[idx];
        const nextQty = Math.min(maxUnits, existing.quantity + qtyToAdd);
        if (nextQty === existing.quantity && !isService) {
          sound.playError();
          showToast(`Maksimal stok tersedia untuk ${product.name}: ${maxUnits} ${unit.unitName}`);
          return prev;
        }
        sound.playTap();
        const updated = [...prev];
        updated[idx] = {
          ...existing,
          quantity: nextQty,
          unitPrice,
          subtotal: nextQty * unitPrice,
          maxStockInUnits: maxUnits,
        };
        showToast(`${product.name} (${nextQty} ${unit.unitName}) diperbarui di keranjang.`);
        return updated;
      }

      const clampedQty = Math.min(maxUnits, Math.max(1, qtyToAdd));
      sound.playTap();
      showToast(`${product.name} ditambahkan ke keranjang.`);
      return [
        ...prev,
        {
          cartKey,
          productId: product.id,
          productName: product.name,
          category: product.category,
          selectedUnit: unit,
          selectedVariant: variantName,
          quantity: clampedQty,
          unitPrice,
          subtotal: clampedQty * unitPrice,
          maxStockInUnits: maxUnits,
          isService,
          imageUrl: product.imageUrl,
        },
      ];
    });
  };

  const handleUpdateCartQty = (cartKey: string, nextQty: number) => {
    if (nextQty <= 0) {
      setCart((prev) => prev.filter((item) => item.cartKey !== cartKey));
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartKey !== cartKey) return item;
        const prod = productMap.get(item.productId);
        const liveMax = item.isService
          ? 999
          : prod
          ? Math.floor(prod.stockInBaseUnit / (item.selectedUnit.conversionFactor || 1))
          : item.maxStockInUnits;
        const clamped = Math.min(Math.max(1, liveMax), nextQty);
        return {
          ...item,
          quantity: clamped,
          maxStockInUnits: liveMax,
          subtotal: clamped * item.unitPrice,
        };
      })
    );
  };

  const cartItemCount = useMemo(() => cart.reduce((sum, i) => sum + i.quantity, 0), [cart]);
  const cartSubtotal = useMemo(() => cart.reduce((sum, i) => sum + i.subtotal, 0), [cart]);

  const baseDeliveryFee = Math.max(0, Number(storeSettings.onlineStoreDeliveryFee ?? 10000));
  const freeDeliveryThreshold = Math.max(
    0,
    Number(storeSettings.onlineStoreMinFreeDelivery ?? 100000)
  );
  const effectiveDeliveryFee = useMemo(() => {
    if (fulfillmentType === 'AMBIL_DI_TOKO') return 0;
    if (cartSubtotal <= 0) return 0;
    if (freeDeliveryThreshold > 0 && cartSubtotal >= freeDeliveryThreshold) return 0;
    return baseDeliveryFee;
  }, [fulfillmentType, cartSubtotal, baseDeliveryFee, freeDeliveryThreshold]);

  const checkoutTotal = cartSubtotal + effectiveDeliveryFee;

  const handleCopyValue = (text: string, key: string) => {
    sound.playTap();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
    setCopiedText(key);
    setTimeout(() => setCopiedText((curr) => (curr === key ? null : curr)), 2000);
  };

  const handleSubmitCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError('Keranjang belanja masih kosong.');
      return;
    }
    const cleanName = customerName.trim();
    const cleanWa = customerWhatsapp.trim();
    if (!cleanName || cleanName.length < 2) {
      setCheckoutError('Harap isi nama lengkap Anda.');
      return;
    }
    if (!cleanWa || cleanWa.replace(/\D/g, '').length < 8) {
      setCheckoutError('Harap isi nomor WhatsApp aktif yang valid.');
      return;
    }
    if (fulfillmentType === 'KIRIM_KURIR' && customerAddress.trim().length < 8) {
      setCheckoutError('Harap isi alamat pengiriman lengkap beserta patokan.');
      return;
    }

    const orderItems: OnlineOrderItem[] = cart.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      category: item.category,
      unitName: item.selectedUnit.unitName,
      conversionFactor: item.selectedUnit.conversionFactor || 1,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalAmount: item.subtotal,
      ...(item.selectedVariant ? { selectedVariant: item.selectedVariant } : {}),
      ...(item.isService ? { isService: true } : {}),
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    }));

    const now = Date.now();
    const orderCode = generateOnlineOrderCode();
    const newOrder: OnlineOrder = {
      id: `onl_${now}_${Math.random().toString(36).substring(2, 6)}`,
      orderCode,
      createdAt: now,
      updatedAt: now,
      customerName: cleanName,
      customerWhatsapp: cleanWa,
      ...(fulfillmentType === 'KIRIM_KURIR' ? { customerAddress: customerAddress.trim() } : {}),
      ...(customerNote.trim() ? { customerNote: customerNote.trim() } : {}),
      ...(membershipId.trim() ? { membershipId: membershipId.trim().toUpperCase() } : {}),
      fulfillmentType,
      paymentMethodId: selectedPaymentMethod?.id || 'pm_cash',
      paymentMethodName: selectedPaymentMethod?.name || 'Bayar di Toko / COD',
      paymentMethodType:
        fulfillmentType === 'KIRIM_KURIR' && selectedPaymentMethod?.type === 'CASH'
          ? 'COD'
          : selectedPaymentMethod?.type || 'CASH',
      subtotal: cartSubtotal,
      deliveryFee: effectiveDeliveryFee,
      discount: 0,
      totalAmount: checkoutTotal,
      status: 'MENUNGGU_KONFIRMASI',
      items: orderItems,
    };

    setIsSubmittingOrder(true);
    try {
      await onSubmitOnlineOrder(newOrder);
      sound.playSuccessChime();
      setCart([]);
      setIsCheckoutOpen(false);
      setIsCartOpen(false);
      setMyOrderCodes((prev) => [orderCode, ...prev.filter((c) => c !== orderCode)].slice(0, 15));
      setTrackingQuery(orderCode);
      setActiveTrackedOrderCode(orderCode);
      setActiveView('tracking');
    } catch {
      sound.playError();
      setCheckoutError('Gagal mengirim pesanan. Pastikan koneksi internet aktif lalu coba lagi.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Tracked orders lookup
  const matchedTrackedOrder = useMemo(() => {
    const targetCode = (activeTrackedOrderCode || trackingQuery).trim().toLowerCase();
    if (!targetCode) return null;
    return (
      onlineOrders.find(
        (o) =>
          o.orderCode.toLowerCase() === targetCode ||
          o.customerWhatsapp.replace(/\D/g, '').endsWith(targetCode.replace(/\D/g, '')) &&
            targetCode.replace(/\D/g, '').length >= 6
      ) || null
    );
  }, [onlineOrders, activeTrackedOrderCode, trackingQuery]);

  const myRecentOrders = useMemo(() => {
    if (myOrderCodes.length === 0) return [];
    const codeSet = new Set(myOrderCodes);
    return onlineOrders
      .filter((o) => codeSet.has(o.orderCode))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [onlineOrders, myOrderCodes]);

  const buildOrderWhatsAppConfirmationUrl = (order: OnlineOrder) => {
    const storePhone = storeSettings.adminWhatsAppNumber || storeSettings.storePhone || '';
    const itemLines = order.items
      .map(
        (it) =>
          `• ${it.productName}${it.selectedVariant ? ` (${it.selectedVariant})` : ''} — ${it.quantity} ${it.unitName} (${formatRupiah(it.totalAmount)})`
      )
      .join('\n');
    const msg = [
      `Halo ${storeSettings.storeName}, saya ingin konfirmasi pesanan online:`,
      ``,
      `Kode Pesanan: *${order.orderCode}*`,
      `Nama: ${order.customerName}`,
      `No. WA: ${order.customerWhatsapp}`,
      `Pengambilan: ${order.fulfillmentType === 'AMBIL_DI_TOKO' ? 'Ambil di Toko' : 'Kirim Kurir'}`,
      order.customerAddress ? `Alamat: ${order.customerAddress}` : '',
      `Pembayaran: ${order.paymentMethodName}`,
      ``,
      `Rincian Belanja:`,
      itemLines,
      order.deliveryFee > 0 ? `Ongkos Kirim: ${formatRupiah(order.deliveryFee)}` : '',
      `*Total Pembayaran: ${formatRupiah(order.totalAmount)}*`,
      order.customerNote ? `Catatan: ${order.customerNote}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return storePhone
      ? formatWhatsAppUrl(storePhone, msg)
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  };

  // Closed storefront banner if Admin temporarily pauses online store
  const isStoreClosed = storeSettings.onlineStoreEnabled === false;

  // Detail modal calculated values
  const detailMaxUnits = selectedProduct && detailUnit
    ? selectedProduct.productType === 'JASA'
      ? 999
      : Math.floor(selectedProduct.stockInBaseUnit / (detailUnit.conversionFactor || 1))
    : 0;
  const detailPrice =
    selectedProduct && detailUnit
      ? resolveUnitPrice(selectedProduct, detailUnit, detailVariant)
      : 0;

  // Resolving QRIS / Bank details for Checkout & Tracked Invoice
  const resolveQrisImageForMethod = (pm?: CustomPaymentMethod) =>
    pm?.qrisImageUrl || storeSettings.qrisImageUrl || '';
  const resolveBankInfoForMethod = (pm?: CustomPaymentMethod) => ({
    accountNumber: pm?.accountNumber || storeSettings.bcaAccountNumber,
    accountName: pm?.accountName || storeSettings.bcaAccountName || storeSettings.storeName,
  });

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col font-sans select-text">
      {/* Slim Top Storefront Notice */}
      <div className="bg-teal-900 text-teal-50 text-xs py-2 px-4 text-center font-medium">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span>
            Jam Operasional Toko Online:{' '}
            <strong className="font-semibold text-white">
              {storeSettings.onlineStoreHours || '08:00 - 21:00 WIB'}
            </strong>
          </span>
          {deliveryEnabled && freeDeliveryThreshold > 0 && (
            <span className="hidden sm:inline text-teal-200">
              • Gratis Ongkir Kurir Toko min. belanja{' '}
              <strong className="text-white">{formatRupiah(freeDeliveryThreshold)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Header (3-Zone Top Bar Contract) */}
      <header className="sticky top-0 z-30 bg-[#FAF8F5]/95 backdrop-blur-md border-b border-stone-200/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Left: Store Identity */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setActiveView('catalog');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-3 text-left cursor-pointer shrink-0"
          >
            <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shadow-xs">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm sm:text-base font-extrabold tracking-tight text-stone-900 leading-tight">
                {storeSettings.storeName}
              </div>
              <div className="text-[11px] font-medium text-teal-700 tracking-wide uppercase">
                Toko Online Resmi
              </div>
            </div>
          </button>

          {/* Center: Clean Section Navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-stone-600">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setActiveView('catalog');
                setSelectedCategory('SEMUA');
              }}
              className={`cursor-pointer transition-colors ${
                activeView === 'catalog' && selectedCategory === 'SEMUA'
                  ? 'text-teal-800 font-bold'
                  : 'hover:text-stone-900'
              }`}
            >
              Katalog Produk
            </button>
            {serviceCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setActiveView('catalog');
                  setSelectedCategory('JASA_LAYANAN');
                }}
                className={`cursor-pointer transition-colors ${
                  activeView === 'catalog' && selectedCategory === 'JASA_LAYANAN'
                    ? 'text-teal-800 font-bold'
                    : 'hover:text-stone-900'
                }`}
              >
                Layanan Toko
              </button>
            )}
            <a
              href="#cara-pesan"
              onClick={() => setActiveView('catalog')}
              className="hover:text-stone-900 transition-colors"
            >
              Cara Pesan
            </a>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setActiveView('tracking');
              }}
              className={`cursor-pointer transition-colors ${
                activeView === 'tracking' ? 'text-teal-800 font-bold' : 'hover:text-stone-900'
              }`}
            >
              Lacak Pesanan
            </button>
          </nav>

          {/* Right: Tracking, Cart, Optional POS Return */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {onReturnToPOS && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onReturnToPOS();
                }}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold transition-colors cursor-pointer"
                title="Kembali ke Tampilan Kasir POS"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Portal Kasir</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setActiveView(activeView === 'tracking' ? 'catalog' : 'tracking');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                activeView === 'tracking'
                  ? 'bg-teal-50 border-teal-300 text-teal-800'
                  : 'bg-white border-stone-200 hover:bg-stone-50 text-stone-700'
              }`}
            >
              <Receipt className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Lacak Pesanan</span>
              {myRecentOrders.length > 0 && (
                <span className="font-mono text-[11px] bg-stone-100 text-stone-700 px-1.5 py-0.5 rounded-md">
                  {myRecentOrders.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsCartOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-teal-300" />
              <span>Keranjang</span>
              <span className="px-2 py-0.5 rounded-lg bg-teal-600 text-white font-mono text-xs tabular-nums">
                {cartItemCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Cart Add Toast Feedback */}
      {cartToast && (
        <div className="fixed bottom-5 right-5 z-40 max-w-sm bg-stone-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-stone-700 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
          <span className="text-xs font-semibold flex-1">{cartToast}</span>
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="text-xs font-bold text-teal-300 hover:text-teal-200 underline cursor-pointer shrink-0"
          >
            Lihat
          </button>
        </div>
      )}

      {/* Closed Storefront Notice */}
      {isStoreClosed && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Pemesanan toko online sedang ditutup sementara oleh admin. Anda tetap dapat melihat katalog produk &amp; melacak pesanan yang sudah ada.
              </span>
            </div>
            {onReturnToPOS && (
              <button
                type="button"
                onClick={onReturnToPOS}
                className="px-3 py-1 rounded-lg bg-amber-900 text-white font-bold cursor-pointer shrink-0"
              >
                Kembali ke Kasir
              </button>
            )}
          </div>
        </div>
      )}

      {/* MAIN CONTENT: CATALOG vs ORDER TRACKING */}
      <main className="flex-1">
        {activeView === 'catalog' ? (
          <>
            {/* SECTION 1: Editorial Split Hero Showcase */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 pb-8 sm:pt-10 sm:pb-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center bg-white rounded-3xl border border-stone-200/80 p-5 sm:p-8 lg:p-10 shadow-xs">
                <div className="lg:col-span-6 space-y-5">
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-teal-800">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Belanja Langsung Dari Toko</span>
                  </div>

                  <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-extrabold text-stone-900 tracking-tight leading-[1.12]">
                    Kebutuhan Harian &amp; Produk Pilihan dari {storeSettings.storeName}
                  </h1>

                  <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
                    {storeSettings.onlineStoreTagline ||
                      'Belanja kebutuhan harian lebih praktis dengan ketersediaan stok real-time yang terhubung langsung ke sistem kasir toko.'}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <a
                      href="#katalog-belanja"
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold shadow-sm transition-colors"
                    >
                      <span>Jelajahi Katalog</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setActiveView('tracking');
                      }}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-stone-800 text-sm font-semibold transition-colors cursor-pointer"
                    >
                      <Receipt className="w-4 h-4 text-teal-700" />
                      <span>Cek Status Pesanan</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-stone-100 text-xs text-stone-600">
                    {pickupEnabled && (
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-teal-700 shrink-0" />
                        <span className="font-medium">Ambil Cepat di Toko</span>
                      </div>
                    )}
                    {deliveryEnabled && (
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-teal-700 shrink-0" />
                        <span className="font-medium">Kirim Kurir Lokal</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-teal-700 shrink-0" />
                      <span className="font-medium">QRIS, Transfer &amp; COD</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="relative aspect-16/10 sm:aspect-4/3 w-full rounded-2xl overflow-hidden bg-stone-100 border border-stone-200/80">
                    {!heroImageError ? (
                      <img
                        src={storefrontHeroImg}
                        alt={`Etalase ${storeSettings.storeName}`}
                        onError={() => setHeroImageError(true)}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-teal-900 via-teal-800 to-stone-900 text-white">
                        <Store className="w-12 h-12 text-teal-300 mb-3" />
                        <p className="text-lg font-bold">{storeSettings.storeName}</p>
                        <p className="text-xs text-teal-100 mt-1">{storeSettings.storeAddress}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 2: Catalog Filter & Product Grid */}
            <section id="katalog-belanja" className="max-w-7xl mx-auto px-4 sm:px-6 pb-14 space-y-6">
              {/* Filter Bar */}
              <div className="bg-white rounded-2xl border border-stone-200/90 p-4 sm:p-5 space-y-4 shadow-2xs">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari nama produk, kategori, atau layanan..."
                      className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-teal-600 focus:bg-white transition-colors"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Sort Dropdown */}
                  <div className="flex items-center gap-2 shrink-0">
                    <SlidersHorizontal className="w-4 h-4 text-stone-500 shrink-0" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="px-3 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-xs sm:text-sm font-semibold text-stone-700 focus:outline-none focus:border-teal-600"
                    >
                      <option value="DEFAULT">Urutan Rekomendasi</option>
                      <option value="PRICE_ASC">Harga Terendah</option>
                      <option value="PRICE_DESC">Harga Tertinggi</option>
                      <option value="NAME_ASC">Nama Produk A – Z</option>
                    </select>
                  </div>
                </div>

                {/* Category Filter Strip */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setSelectedCategory('SEMUA');
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === 'SEMUA'
                        ? 'bg-stone-900 text-white'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    Semua Produk ({products.length})
                  </button>

                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setSelectedCategory(cat.name);
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                        selectedCategory === cat.name
                          ? 'bg-teal-700 text-white'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}

                  {serviceCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setSelectedCategory('JASA_LAYANAN');
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        selectedCategory === 'JASA_LAYANAN'
                          ? 'bg-teal-700 text-white'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <Wrench className="w-3.5 h-3.5" />
                      <span>Jasa &amp; Layanan ({serviceCount})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Catalog Results Count */}
              <div className="flex items-center justify-between text-xs text-stone-500 px-1">
                <span>
                  Menampilkan <strong className="text-stone-900">{visibleProducts.length}</strong> produk
                  {selectedCategory !== 'SEMUA' && ` pada kategori ${selectedCategory === 'JASA_LAYANAN' ? 'Jasa & Layanan' : selectedCategory}`}
                </span>
              </div>

              {/* Uniform 3-Col Desktop / 2-Col Tablet Product Grid */}
              {visibleProducts.length === 0 ? (
                <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center space-y-3">
                  <Package className="w-10 h-10 text-stone-300 mx-auto" />
                  <h3 className="text-base font-bold text-stone-900">Produk Tidak Ditemukan</h3>
                  <p className="text-xs text-stone-500 max-w-md mx-auto">
                    Coba ubah kata kunci pencarian atau pilih kategori lain untuk melihat koleksi yang tersedia.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('SEMUA');
                    }}
                    className="px-4 py-2 rounded-xl bg-teal-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Tampilkan Semua Produk
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {visibleProducts.map((product) => {
                    const isService = product.productType === 'JASA';
                    const baseUnitObj = product.units[0];
                    const basePrice = baseUnitObj?.sellingPrice || 0;
                    const maxUnits = isService
                      ? 999
                      : Math.floor(product.stockInBaseUnit / (baseUnitObj.conversionFactor || 1));
                    const isOutOfStock = !isService && maxUnits <= 0;
                    const isLowStock =
                      !isService &&
                      maxUnits > 0 &&
                      product.stockInBaseUnit <= Math.max(5, product.minStockAlert);

                    const statusText = isService
                      ? 'Layanan'
                      : isOutOfStock
                      ? 'Stok Habis'
                      : isLowStock
                      ? 'Stok Terbatas'
                      : 'Tersedia';

                    return (
                      <article
                        key={product.id}
                        className="group bg-white rounded-2xl border border-stone-200/90 overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                      >
                        {/* 65-75% Visual Lead Container with uniform 4:3 aspect ratio */}
                        <button
                          type="button"
                          onClick={() => handleOpenProductDetail(product)}
                          className="relative aspect-4/3 w-full bg-[#F5F3EE] overflow-hidden text-left cursor-pointer"
                        >
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03] ${
                                isOutOfStock ? 'opacity-50 grayscale' : ''
                              }`}
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#F5F3EE] to-[#EAE5DC]">
                              <div className="w-16 h-16 rounded-2xl bg-white/90 border border-stone-200/80 shadow-2xs flex items-center justify-center text-teal-800 font-extrabold text-xl tracking-tight">
                                {isService ? (
                                  <Wrench className="w-7 h-7" />
                                ) : (
                                  product.name.slice(0, 2).toUpperCase()
                                )}
                              </div>
                              <span className="mt-2.5 text-[11px] font-semibold uppercase tracking-widest text-stone-500">
                                {product.category}
                              </span>
                            </div>
                          )}

                          {/* Single clean availability tag */}
                          <span
                            className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-wide border ${
                              isOutOfStock
                                ? 'bg-white/95 text-rose-700 border-rose-200'
                                : isLowStock
                                ? 'bg-white/95 text-amber-800 border-amber-200'
                                : 'bg-white/95 text-stone-700 border-stone-200'
                            }`}
                          >
                            {statusText}
                          </span>
                        </button>

                        {/* Clean Metadata Footer */}
                        <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between gap-4">
                          <div className="space-y-1.5">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                              {product.category}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenProductDetail(product)}
                              className="text-left block w-full cursor-pointer"
                            >
                              <h3 className="text-base font-semibold text-stone-900 leading-snug line-clamp-2 group-hover:text-teal-800 transition-colors">
                                {product.name}
                              </h3>
                            </button>
                            {product.units.length > 1 && (
                              <p className="text-xs text-stone-500">
                                Pilihan satuan: {product.units.map((u) => u.unitName).join(', ')}
                              </p>
                            )}
                            {product.variants && product.variants.length > 0 && (
                              <p className="text-xs text-stone-500">
                                {product.variantLabel || 'Varian'}:{' '}
                                {product.variants.map((v) => v.name).join(', ')}
                              </p>
                            )}
                          </div>

                          <div className="pt-3 border-t border-stone-100 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-[15px] font-bold text-stone-900 tabular-nums font-mono">
                                {formatRupiah(basePrice)}
                              </div>
                              <div className="text-[11px] text-stone-500">
                                per {baseUnitObj.unitName}
                              </div>
                            </div>

                            {product.units.length > 1 || (product.variants && product.variants.length > 0) ? (
                              <button
                                type="button"
                                disabled={isStoreClosed || isOutOfStock}
                                onClick={() => handleOpenProductDetail(product)}
                                className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-teal-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                              >
                                <span>Pilih Opsi</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isStoreClosed || isOutOfStock}
                                onClick={() => handleAddItemToCart(product, baseUnitObj, 1)}
                                className="px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>{isOutOfStock ? 'Habis' : 'Keranjang'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* SECTION 3: How It Works / Craft & Store Trust */}
            <section id="cara-pesan" className="bg-white border-t border-stone-200 py-12 px-4 sm:px-6">
              <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl bg-[#FAF8F5] border border-stone-200/80 space-y-2">
                  <div className="text-xs font-mono font-bold text-teal-800">01 / PILIH PRODUK</div>
                  <h3 className="text-base font-bold text-stone-900">Pilih Barang &amp; Satuan</h3>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    Stok toko diperbarui real-time. Pilih satuan eceran maupun grosir (PCS, PACK, DUS) sesuai kebutuhan Anda.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-[#FAF8F5] border border-stone-200/80 space-y-2">
                  <div className="text-xs font-mono font-bold text-teal-800">02 / PENGAMBILAN</div>
                  <h3 className="text-base font-bold text-stone-900">Ambil di Toko atau Kurir</h3>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    Ambil langsung tanpa antre di kasir atau gunakan layanan antar kurir lokal ke alamat Anda.
                  </p>
                </div>
                <div className="p-6 rounded-2xl bg-[#FAF8F5] border border-stone-200/80 space-y-2">
                  <div className="text-xs font-mono font-bold text-teal-800">03 / PEMBAYARAN</div>
                  <h3 className="text-base font-bold text-stone-900">QRIS, Transfer &amp; COD</h3>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    Scan QRIS resmi toko, transfer bank, atau bayar di tempat saat pesanan diserahkan.
                  </p>
                </div>
              </div>
            </section>
          </>
        ) : (
          /* ORDER TRACKING VIEW */
          <section className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-extrabold text-stone-900 tracking-tight">
                  Lacak Status Pesanan Online
                </h1>
                <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                  Masukkan Kode Pesanan (contoh: ONL-20261116-1234) atau 6+ digit terakhir nomor WhatsApp Anda.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setActiveView('catalog');
                }}
                className="px-4 py-2 rounded-xl border border-stone-300 bg-white hover:bg-stone-50 text-xs font-bold text-stone-800 inline-flex items-center gap-1.5 cursor-pointer self-start"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Kembali Belanja</span>
              </button>
            </div>

            {/* Search Tracking Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sound.playTap();
                setActiveTrackedOrderCode(trackingQuery.trim());
              }}
              className="bg-white p-4 rounded-2xl border border-stone-200 flex flex-col sm:flex-row gap-2.5 shadow-2xs"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={trackingQuery}
                  onChange={(e) => setTrackingQuery(e.target.value)}
                  placeholder="Masukkan Kode Pesanan (ONL-...) atau Nomor WhatsApp"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm font-mono focus:outline-none focus:border-teal-600 focus:bg-white"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold cursor-pointer shrink-0"
              >
                Cek Status
              </button>
            </form>

            {/* Matched Order Details */}
            {matchedTrackedOrder ? (
              <div className="bg-white rounded-3xl border border-stone-200 p-5 sm:p-7 space-y-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                      Kode Pesanan Online
                    </div>
                    <div className="text-xl font-extrabold font-mono text-stone-900 flex items-center gap-2 mt-0.5">
                      <span>{matchedTrackedOrder.orderCode}</span>
                      <button
                        type="button"
                        onClick={() => handleCopyValue(matchedTrackedOrder.orderCode, 'track-code')}
                        className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 cursor-pointer"
                        title="Salin kode pesanan"
                      >
                        {copiedText === 'track-code' ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="text-xs text-stone-500 mt-1">
                      Dibuat pada {formatDateTime(matchedTrackedOrder.createdAt)}
                    </div>
                  </div>

                  <span
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border self-start sm:self-center ${
                      STATUS_META[matchedTrackedOrder.status].badgeClass
                    }`}
                  >
                    {STATUS_META[matchedTrackedOrder.status].label}
                  </span>
                </div>

                {/* Progress Steps */}
                {matchedTrackedOrder.status !== 'DIBATALKAN' ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { step: 1, title: 'Diterima' },
                        { step: 2, title: 'Disiapkan' },
                        {
                          step: 3,
                          title:
                            matchedTrackedOrder.fulfillmentType === 'AMBIL_DI_TOKO'
                              ? 'Siap Diambil'
                              : 'Dikirim',
                        },
                        { step: 4, title: 'Selesai' },
                      ].map((s) => {
                        const currentStep = STATUS_META[matchedTrackedOrder.status].step;
                        const active = currentStep >= s.step;
                        return (
                          <div key={s.step} className="space-y-1.5">
                            <div
                              className={`h-2 rounded-full transition-colors ${
                                active ? 'bg-teal-600' : 'bg-stone-200'
                              }`}
                            />
                            <div
                              className={`text-[11px] font-semibold ${
                                active ? 'text-teal-900' : 'text-stone-400'
                              }`}
                            >
                              {s.title}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-xl border border-stone-200/80">
                      {STATUS_META[matchedTrackedOrder.status].desc}
                    </p>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    Pesanan ini dibatalkan.{' '}
                    {matchedTrackedOrder.cancelReason && (
                      <span>Alasan: {matchedTrackedOrder.cancelReason}</span>
                    )}
                  </div>
                )}

                {/* Customer & Payment Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-stone-200/80 space-y-1.5">
                    <div className="font-bold text-stone-900">Info Pemesan &amp; Pengiriman</div>
                    <div className="text-stone-700 font-semibold">
                      {matchedTrackedOrder.customerName}
                    </div>
                    <div className="text-stone-600 font-mono">
                      WA: {matchedTrackedOrder.customerWhatsapp}
                    </div>
                    <div className="text-stone-600">
                      Metode:{' '}
                      <strong className="text-stone-900">
                        {matchedTrackedOrder.fulfillmentType === 'AMBIL_DI_TOKO'
                          ? 'Ambil Langsung di Toko'
                          : 'Kirim Kurir Toko'}
                      </strong>
                    </div>
                    {matchedTrackedOrder.customerAddress && (
                      <div className="text-stone-600">
                        Alamat: {matchedTrackedOrder.customerAddress}
                      </div>
                    )}
                    {matchedTrackedOrder.customerNote && (
                      <div className="text-stone-600 italic">
                        Catatan: &ldquo;{matchedTrackedOrder.customerNote}&rdquo;
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-stone-200/80 space-y-1.5">
                    <div className="font-bold text-stone-900">Info Pembayaran</div>
                    <div className="text-stone-700 font-semibold">
                      {matchedTrackedOrder.paymentMethodName}
                    </div>
                    {matchedTrackedOrder.linkedInvoiceNumber && (
                      <div className="text-emerald-700 font-mono font-bold">
                        Struk Kasir: {matchedTrackedOrder.linkedInvoiceNumber}
                      </div>
                    )}
                    {matchedTrackedOrder.paymentMethodType === 'QRIS' &&
                      matchedTrackedOrder.status !== 'SELESAI' &&
                      matchedTrackedOrder.status !== 'DIBATALKAN' && (() => {
                        const pm = onlinePaymentMethods.find(
                          (m) => m.id === matchedTrackedOrder.paymentMethodId
                        );
                        const qrUrl = resolveQrisImageForMethod(pm);
                        if (!qrUrl) return null;
                        return (
                          <div className="pt-2">
                            <img
                              src={qrUrl}
                              alt="QRIS Toko"
                              className="w-36 h-36 object-contain rounded-xl border border-stone-200 bg-white p-1.5"
                            />
                            <p className="text-[11px] text-stone-500 mt-1">
                              Scan QRIS sesuai nominal{' '}
                              <strong className="text-stone-900">
                                {formatRupiah(matchedTrackedOrder.totalAmount)}
                              </strong>
                            </p>
                          </div>
                        );
                      })()}
                    {matchedTrackedOrder.paymentMethodType === 'BANK_TRANSFER' && (() => {
                      const pm = onlinePaymentMethods.find(
                        (m) => m.id === matchedTrackedOrder.paymentMethodId
                      );
                      const bank = resolveBankInfoForMethod(pm);
                      if (!bank.accountNumber) return null;
                      return (
                        <div className="text-stone-600 pt-1">
                          <div>
                            Rekening: <strong className="font-mono text-stone-900">{bank.accountNumber}</strong>
                          </div>
                          <div>a.n. {bank.accountName}</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Order Items */}
                <div className="border border-stone-200 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-800">
                    Rincian Produk ({matchedTrackedOrder.items.length} item)
                  </div>
                  <div className="divide-y divide-stone-100">
                    {matchedTrackedOrder.items.map((item, idx) => (
                      <div key={idx} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="font-semibold text-stone-900">
                            {item.productName}
                            {item.selectedVariant ? ` (${item.selectedVariant})` : ''}
                          </div>
                          <div className="text-stone-500 font-mono mt-0.5">
                            {item.quantity} {item.unitName} × {formatRupiah(item.unitPrice)}
                          </div>
                        </div>
                        <div className="font-bold font-mono text-stone-900 tabular-nums shrink-0">
                          {formatRupiah(item.totalAmount)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 bg-stone-50 border-t border-stone-200 space-y-1 text-xs">
                    <div className="flex justify-between text-stone-600">
                      <span>Subtotal Produk</span>
                      <span className="font-mono tabular-nums">
                        {formatRupiah(matchedTrackedOrder.subtotal)}
                      </span>
                    </div>
                    {matchedTrackedOrder.deliveryFee > 0 && (
                      <div className="flex justify-between text-stone-600">
                        <span>Biaya Kurir</span>
                        <span className="font-mono tabular-nums">
                          {formatRupiah(matchedTrackedOrder.deliveryFee)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm font-extrabold text-stone-900 pt-1 border-t border-stone-200">
                      <span>Total Pembayaran</span>
                      <span className="font-mono text-teal-800 tabular-nums">
                        {formatRupiah(matchedTrackedOrder.totalAmount)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Confirmation Link */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <a
                    href={buildOrderWhatsAppConfirmationUrl(matchedTrackedOrder)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Konfirmasi / Kirim Bukti via WhatsApp Toko</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : (activeTrackedOrderCode || trackingQuery).trim() ? (
              <div className="bg-white rounded-2xl border border-stone-200 p-8 text-center space-y-2">
                <Search className="w-8 h-8 text-stone-300 mx-auto" />
                <div className="text-sm font-bold text-stone-900">Pesanan Tidak Ditemukan</div>
                <p className="text-xs text-stone-500">
                  Pastikan kode pesanan atau nomor WhatsApp yang Anda masukkan sudah benar.
                </p>
              </div>
            ) : null}

            {/* Recent Local Customer Orders */}
            {myRecentOrders.length > 0 && (
              <div className="space-y-3 pt-2">
                <h2 className="text-sm font-bold text-stone-800">Riwayat Pesanan dari Perangkat Ini</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {myRecentOrders.map((ord) => (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setTrackingQuery(ord.orderCode);
                        setActiveTrackedOrderCode(ord.orderCode);
                      }}
                      className="text-left p-4 rounded-2xl bg-white border border-stone-200 hover:border-teal-500 transition-colors cursor-pointer space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-bold text-xs text-stone-900">
                          {ord.orderCode}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                            STATUS_META[ord.status].badgeClass
                          }`}
                        >
                          {STATUS_META[ord.status].label}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-stone-600">
                        <span>{ord.items.length} item</span>
                        <span className="font-mono font-bold text-stone-900 tabular-nums">
                          {formatRupiah(ord.totalAmount)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Store Footer */}
      <footer className="bg-stone-900 text-stone-300 py-8 px-4 sm:px-6 text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-bold text-white">{storeSettings.storeName}</div>
            <div className="flex items-center gap-1.5 text-stone-400">
              <MapPin className="w-3.5 h-3.5 shrink-0" />
              <span>{storeSettings.storeAddress}</span>
            </div>
            {(storeSettings.storePhone || storeSettings.adminWhatsAppNumber) && (
              <div className="flex items-center gap-1.5 text-stone-400">
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span>{storeSettings.storePhone || storeSettings.adminWhatsAppNumber}</span>
              </div>
            )}
          </div>
          <div className="text-stone-400">
            <span>Belanja Online Resmi · Terhubung Real-Time dengan Toko</span>
          </div>
        </div>
      </footer>

      {/* PRODUCT DETAIL MODAL (PDP - Sticky Visual Left + Contiguous Purchase Module Right) */}
      {selectedProduct && detailUnit && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-stone-200 grid grid-cols-1 md:grid-cols-12">
            {/* Visual Side */}
            <div className="md:col-span-5 bg-[#F5F3EE] p-5 flex items-center justify-center relative min-h-[220px]">
              {selectedProduct.imageUrl ? (
                <img
                  src={selectedProduct.imageUrl}
                  alt={selectedProduct.name}
                  className="w-full h-full max-h-72 object-contain rounded-2xl"
                />
              ) : (
                <div className="w-32 h-32 rounded-3xl bg-white border border-stone-200 flex items-center justify-center text-teal-800 font-extrabold text-3xl">
                  {selectedProduct.productType === 'JASA' ? (
                    <Wrench className="w-10 h-10" />
                  ) : (
                    selectedProduct.name.slice(0, 2).toUpperCase()
                  )}
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="md:hidden absolute top-3 right-3 p-2 rounded-full bg-white text-stone-700 shadow-xs cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Purchase Module */}
            <div className="md:col-span-7 p-5 sm:p-7 flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
                      {selectedProduct.category}
                    </div>
                    <h2 className="text-xl font-extrabold text-stone-900 mt-0.5">
                      {selectedProduct.name}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="hidden md:flex p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold font-mono text-stone-900 tabular-nums">
                    {formatRupiah(detailPrice)}
                  </span>
                  <span className="text-xs text-stone-500">/ {detailUnit.unitName}</span>
                </div>

                <div className="text-xs font-medium text-stone-600">
                  Ketersediaan:{' '}
                  {selectedProduct.productType === 'JASA' ? (
                    <span className="text-teal-700 font-bold">Layanan Tersedia</span>
                  ) : detailMaxUnits > 0 ? (
                    <span className="text-teal-700 font-bold">
                      Tersedia ({formatNumber(detailMaxUnits)} {detailUnit.unitName})
                    </span>
                  ) : (
                    <span className="text-rose-600 font-bold">Stok Habis</span>
                  )}
                </div>

                {/* Unit Selector */}
                {selectedProduct.units.length > 1 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-700 block">Pilih Satuan</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.units.map((u) => {
                        const active = detailUnit.id === u.id;
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setDetailUnit(u);
                              setDetailQty(1);
                            }}
                            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              active
                                ? 'bg-stone-900 text-white border-stone-900'
                                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            {u.unitName}
                            {u.conversionFactor > 1 && (
                              <span className="opacity-75 ml-1">
                                ({u.conversionFactor} {selectedProduct.baseUnit})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Variant Selector */}
                {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-stone-700 block">
                      Pilih {selectedProduct.variantLabel || 'Varian'}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.variants.map((v) => {
                        const active = detailVariant === v.name;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setDetailVariant(v.name);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                              active
                                ? 'bg-teal-700 text-white border-teal-700'
                                : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            {v.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedProduct.serviceNotes && (
                  <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-xl border border-stone-200">
                    {selectedProduct.serviceNotes}
                  </p>
                )}
              </div>

              {/* Qty & Add CTA */}
              <div className="pt-4 border-t border-stone-100 flex items-center gap-3">
                <div className="flex items-center border border-stone-300 rounded-xl bg-white">
                  <button
                    type="button"
                    onClick={() => setDetailQty((q) => Math.max(1, q - 1))}
                    className="p-2.5 text-stone-700 hover:bg-stone-100 rounded-l-xl cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-bold font-mono tabular-nums">
                    {detailQty}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDetailQty((q) => Math.min(Math.max(1, detailMaxUnits), q + 1))
                    }
                    className="p-2.5 text-stone-700 hover:bg-stone-100 rounded-r-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isStoreClosed || detailMaxUnits <= 0}
                  onClick={() => {
                    handleAddItemToCart(selectedProduct, detailUnit, detailQty, detailVariant);
                    setSelectedProduct(null);
                  }}
                  className="flex-1 py-3 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-stone-200 disabled:text-stone-400 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>
                    {detailMaxUnits <= 0
                      ? 'Stok Habis'
                      : `Tambah · ${formatRupiah(detailPrice * detailQty)}`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SLIDE-OVER SHOPPING CART DRAWER */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/50 backdrop-blur-xs">
          <div
            className="flex-1"
            onClick={() => {
              if (!isCheckoutOpen) setIsCartOpen(false);
            }}
          />
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-stone-200">
            <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-teal-700" />
                <div>
                  <h2 className="text-base font-extrabold text-stone-900">
                    {isCheckoutOpen ? 'Checkout Pesanan' : 'Keranjang Belanja'}
                  </h2>
                  <p className="text-[11px] text-stone-500">{cartItemCount} item dipilih</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCheckoutOpen(false);
                  setIsCartOpen(false);
                }}
                className="p-2 rounded-xl hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isCheckoutOpen ? (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {cart.length === 0 ? (
                    <div className="py-16 text-center space-y-3">
                      <ShoppingBag className="w-12 h-12 text-stone-200 mx-auto" />
                      <p className="text-sm font-bold text-stone-700">Keranjang Anda masih kosong</p>
                      <p className="text-xs text-stone-500">
                        Pilih produk atau layanan dari katalog toko untuk memulai pesanan online.
                      </p>
                    </div>
                  ) : (
                    cart.map((item) => (
                      <div
                        key={item.cartKey}
                        className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-stone-200/80 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-sm font-bold text-stone-900 leading-snug">
                            {item.productName}
                          </div>
                          <div className="text-xs text-stone-500">
                            {item.selectedUnit.unitName}
                            {item.selectedVariant ? ` · ${item.selectedVariant}` : ''} ·{' '}
                            <span className="font-mono">{formatRupiah(item.unitPrice)}</span>
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <div className="inline-flex items-center border border-stone-300 rounded-lg bg-white">
                              <button
                                type="button"
                                onClick={() => handleUpdateCartQty(item.cartKey, item.quantity - 1)}
                                className="p-1.5 text-stone-600 hover:bg-stone-100 rounded-l-lg cursor-pointer"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-8 text-center text-xs font-bold font-mono tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateCartQty(item.cartKey, item.quantity + 1)}
                                className="p-1.5 text-stone-600 hover:bg-stone-100 rounded-r-lg cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleUpdateCartQty(item.cartKey, 0)}
                              className="p-1.5 text-stone-400 hover:text-rose-600 cursor-pointer"
                              title="Hapus item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="text-sm font-bold font-mono text-stone-900 tabular-nums shrink-0">
                          {formatRupiah(item.subtotal)}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="p-5 border-t border-stone-200 bg-stone-50 space-y-3">
                    {deliveryEnabled && freeDeliveryThreshold > 0 && (
                      <div className="text-xs text-stone-600 bg-white px-3 py-2 rounded-xl border border-stone-200">
                        {cartSubtotal >= freeDeliveryThreshold ? (
                          <span className="text-teal-700 font-semibold">
                            Belanja Anda memenuhi syarat Gratis Ongkir Kurir Toko.
                          </span>
                        ) : (
                          <span>
                            Tambah{' '}
                            <strong className="text-stone-900">
                              {formatRupiah(freeDeliveryThreshold - cartSubtotal)}
                            </strong>{' '}
                            lagi untuk Gratis Ongkir Kurir Toko.
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-stone-600">Subtotal Belanja</span>
                      <span className="text-lg font-extrabold font-mono text-stone-900 tabular-nums">
                        {formatRupiah(cartSubtotal)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isStoreClosed}
                      onClick={() => {
                        sound.playTap();
                        setIsCheckoutOpen(true);
                      }}
                      className="w-full py-3.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-stone-300 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                    >
                      <span>Lanjut ke Checkout</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* CHECKOUT FORM INSIDE DRAWER */
              <form onSubmit={handleSubmitCheckout} className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <button
                    type="button"
                    onClick={() => setIsCheckoutOpen(false)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800 hover:underline cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Kembali ke Daftar Keranjang</span>
                  </button>

                  {checkoutError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>{checkoutError}</span>
                    </div>
                  )}

                  {/* Customer Info */}
                  <div className="space-y-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      1. Data Pemesan
                    </div>
                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1">
                        Nama Lengkap <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Contoh: Siti Rahmawati"
                        className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm focus:outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1">
                        Nomor WhatsApp Aktif <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={customerWhatsapp}
                        onChange={(e) => setCustomerWhatsapp(e.target.value)}
                        placeholder="Contoh: 081234567890"
                        className="w-full px-3 py-2.5 rounded-xl border border-stone-300 text-sm font-mono focus:outline-none focus:border-teal-600"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-stone-700 block mb-1">
                        ID Member Toko (Opsional)
                      </label>
                      <input
                        type="text"
                        value={membershipId}
                        onChange={(e) => setMembershipId(e.target.value)}
                        placeholder="Jika punya kartu member, misal MBR-001"
                        className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs font-mono focus:outline-none focus:border-teal-600"
                      />
                    </div>
                  </div>

                  {/* Fulfillment Method */}
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      2. Pengambilan / Pengiriman
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      {pickupEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setFulfillmentType('AMBIL_DI_TOKO');
                          }}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            fulfillmentType === 'AMBIL_DI_TOKO'
                              ? 'bg-teal-50 border-teal-600 text-teal-950'
                              : 'bg-white border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          <Store className="w-4 h-4 text-teal-700 mb-1" />
                          <div className="text-xs font-bold">Ambil di Toko</div>
                          <div className="text-[11px] text-stone-500">Gratis Ongkir</div>
                        </button>
                      )}
                      {deliveryEnabled && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setFulfillmentType('KIRIM_KURIR');
                          }}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            fulfillmentType === 'KIRIM_KURIR'
                              ? 'bg-teal-50 border-teal-600 text-teal-950'
                              : 'bg-white border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          <Truck className="w-4 h-4 text-teal-700 mb-1" />
                          <div className="text-xs font-bold">Kirim Kurir</div>
                          <div className="text-[11px] text-stone-500 font-mono">
                            {freeDeliveryThreshold > 0 && cartSubtotal >= freeDeliveryThreshold
                              ? 'Gratis'
                              : formatRupiah(baseDeliveryFee)}
                          </div>
                        </button>
                      )}
                    </div>

                    {fulfillmentType === 'KIRIM_KURIR' ? (
                      <div>
                        <label className="text-xs font-bold text-stone-700 block mb-1">
                          Alamat Pengiriman Lengkap <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={2}
                          required
                          value={customerAddress}
                          onChange={(e) => setCustomerAddress(e.target.value)}
                          placeholder="Nama jalan, nomor rumah, RT/RW, dan patokan..."
                          className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-teal-600"
                        />
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-600">
                        <strong className="text-stone-900 block">Lokasi Pengambilan:</strong>
                        <span>{storeSettings.storeAddress}</span>
                      </div>
                    )}
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-2.5 pt-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      3. Metode Pembayaran
                    </div>
                    <div className="space-y-2">
                      {onlinePaymentMethods.map((pm) => {
                        const active = selectedPaymentMethod?.id === pm.id;
                        return (
                          <button
                            key={pm.id}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setSelectedPaymentId(pm.id);
                            }}
                            className={`w-full p-3 rounded-xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                              active
                                ? 'bg-teal-50 border-teal-600 text-stone-900'
                                : 'bg-white border-stone-200 hover:bg-stone-50'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-teal-700 shrink-0">
                              {pm.type === 'QRIS' ? (
                                <QrCode className="w-4 h-4" />
                              ) : pm.type === 'BANK_TRANSFER' ? (
                                <Building2 className="w-4 h-4" />
                              ) : (
                                <Banknote className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-stone-900">{pm.name}</div>
                              {pm.description && (
                                <div className="text-[11px] text-stone-500 line-clamp-1">
                                  {pm.description}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Show Static QRIS or Bank Transfer Info right in checkout */}
                    {selectedPaymentMethod?.type === 'QRIS' && (() => {
                      const qrUrl = resolveQrisImageForMethod(selectedPaymentMethod);
                      if (!qrUrl) return null;
                      return (
                        <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-stone-200 text-center space-y-2">
                          <div className="text-xs font-bold text-stone-800">
                            QRIS Resmi {storeSettings.storeName}
                          </div>
                          <img
                            src={qrUrl}
                            alt="QRIS Pembayaran"
                            className="w-40 h-40 mx-auto object-contain rounded-xl bg-white p-1.5 border border-stone-200"
                          />
                          <p className="text-[11px] text-stone-600">
                            Anda juga dapat melakukan scan QRIS ini setelah pesanan dibuat di halaman status pesanan.
                          </p>
                        </div>
                      );
                    })()}

                    {selectedPaymentMethod?.type === 'BANK_TRANSFER' && (() => {
                      const bank = resolveBankInfoForMethod(selectedPaymentMethod);
                      if (!bank.accountNumber) return null;
                      return (
                        <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-stone-200 flex items-center justify-between gap-2 text-xs">
                          <div>
                            <div className="font-bold text-stone-900 font-mono">
                              {bank.accountNumber}
                            </div>
                            <div className="text-stone-600">a.n. {bank.accountName}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyValue(bank.accountNumber, 'bank-rek')}
                            className="px-2.5 py-1.5 rounded-lg bg-white border border-stone-300 text-xs font-bold text-stone-700 cursor-pointer"
                          >
                            {copiedText === 'bank-rek' ? 'Tersalin' : 'Salin Rek'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Customer Note */}
                  <div>
                    <label className="text-xs font-bold text-stone-700 block mb-1">
                      Catatan Pesanan (Opsional)
                    </label>
                    <input
                      type="text"
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      placeholder="Contoh: Diambil jam 16.00 / tolong dipisah kantongnya"
                      className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs focus:outline-none focus:border-teal-600"
                    />
                  </div>
                </div>

                {/* Checkout Summary Footer */}
                <div className="p-5 border-t border-stone-200 bg-stone-50 space-y-3">
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-stone-600">
                      <span>Subtotal ({cartItemCount} item)</span>
                      <span className="font-mono tabular-nums">{formatRupiah(cartSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-stone-600">
                      <span>Ongkos Kirim</span>
                      <span className="font-mono tabular-nums">
                        {effectiveDeliveryFee === 0 ? 'Gratis' : formatRupiah(effectiveDeliveryFee)}
                      </span>
                    </div>
                    <div className="flex justify-between text-base font-extrabold text-stone-900 pt-1.5 border-t border-stone-200">
                      <span>Total Tagihan</span>
                      <span className="font-mono text-teal-800 tabular-nums">
                        {formatRupiah(checkoutTotal)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingOrder}
                    className="w-full py-3.5 px-4 rounded-xl bg-teal-700 hover:bg-teal-800 disabled:bg-stone-400 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isSubmittingOrder ? 'Mengirim Pesanan...' : 'Buat Pesanan Sekarang'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
