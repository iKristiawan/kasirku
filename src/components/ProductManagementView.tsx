import React, { useState, useMemo, useRef, useDeferredValue, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  Layers, 
  Edit3, 
  Trash2, 
  X, 
  Barcode, 
  AlertTriangle,
  Check,
  Sliders,
  Palette,
  Tag,
  FolderPlus,
  Sparkles,
  RefreshCw,
  TrendingUp,
  Trophy,
  Flame,
  Award,
  Camera,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Truck,
  RotateCcw,
  BarChart3,
  SwitchCamera,
  Wrench,
  Clock,
  UserCheck,
  Briefcase,
  FileSpreadsheet,
  Download,
  CalendarDays,
  Users,
  Calculator,
  Coins,
  ArrowUpDown,
  QrCode,
  Printer,
  History,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Filter
} from 'lucide-react';
import QRCode from 'qrcode';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  AreaChart,
  Area,
  CartesianGrid,
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell 
} from 'recharts';
import { Product, ProductUnit, ProductVariant, ProductCategory, UserRole, Transaction, CustomerSpecialPrice, CustomerCategoryItem, EmployeeActivityLog } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime } from '../utils/formatters';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { sound } from '../utils/audio';
import { CATEGORY_COLOR_PRESETS, getCategoryColor, isDarkColor } from '../utils/categoryColors';
import { deleteDocumentFromFirestore } from '../utils/firebaseSync';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { LazyProductImage } from './LazyProductImage';
import { getCustomerCategoryBadge, DEFAULT_CUSTOMER_CATEGORIES } from '../utils/customerUtils';
import * as XLSX from 'xlsx';

/**
 * Automatically forwards and increments the highest sequential SKU in store
 */
export const getNextSequentialSku = (existingProducts: Product[], isService: boolean = false): string => {
  const prefix = isService ? 'JSA-' : 'SKU-';
  const targetProducts = existingProducts.filter((p) => isService ? p.productType === 'JASA' : p.productType !== 'JASA');
  let maxNum = 0;
  let detectedPrefix = prefix;

  targetProducts.forEach((p) => {
    const code = (p.sku || p.barcode || '').trim();
    if (!code) return;
    const match = code.match(/^(.*?)(\d+)$/);
    if (match) {
      const pfx = match[1];
      const num = parseInt(match[2], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
        if (pfx) detectedPrefix = pfx;
      }
    }
  });

  const nextNum = maxNum + 1;
  return `${detectedPrefix}${String(nextNum).padStart(4, '0')}`;
};

export interface UnitMarginEvaluation {
  unitId: string;
  unitName: string;
  costPrice: number;
  sellingPrice: number;
  profitPerUnit: number;
  marginPercent: number;
  isLowMargin: boolean;
  isLoss: boolean;
}

export interface ProductMarginEvaluation {
  hasConfiguredCost: boolean;
  isLowMargin: boolean;
  isLoss: boolean;
  worstMarginPercent: number;
  worstUnit: UnitMarginEvaluation | null;
  unitMap: Map<string, UnitMarginEvaluation>;
}

export const evaluateProductMargin = (prod: Product): ProductMarginEvaluation => {
  const unitMap = new Map<string, UnitMarginEvaluation>();
  let worstUnit: UnitMarginEvaluation | null = null;
  const baseCost = Number(prod.costPrice) || 0;

  (prod.units || []).forEach((u, idx) => {
    const conv = Number(u.conversionFactor) || 1;
    const rawUnitCost = Number(u.costPrice) || 0;
    const effectiveCost =
      idx === 0
        ? rawUnitCost > 0
          ? rawUnitCost
          : baseCost
        : rawUnitCost > 0
        ? rawUnitCost
        : Math.round(baseCost * conv);
    const sellPrice = Number(u.sellingPrice) || 0;

    if (effectiveCost <= 0) return;

    const profitPerUnit = sellPrice - effectiveCost;
    const marginPercent = sellPrice > 0 ? (profitPerUnit / sellPrice) * 100 : -100;
    const evalItem: UnitMarginEvaluation = {
      unitId: u.id,
      unitName: u.unitName,
      costPrice: effectiveCost,
      sellingPrice: sellPrice,
      profitPerUnit,
      marginPercent,
      isLowMargin: marginPercent < 2,
      isLoss: marginPercent <= 0,
    };
    unitMap.set(u.id, evalItem);
    if (!worstUnit || evalItem.marginPercent < worstUnit.marginPercent) {
      worstUnit = evalItem;
    }
  });

  if (!worstUnit) {
    return {
      hasConfiguredCost: false,
      isLowMargin: false,
      isLoss: false,
      worstMarginPercent: 0,
      worstUnit: null,
      unitMap,
    };
  }

  const finalWorst = worstUnit as UnitMarginEvaluation;
  return {
    hasConfiguredCost: true,
    isLowMargin: finalWorst.marginPercent < 2,
    isLoss: finalWorst.marginPercent <= 0,
    worstMarginPercent: finalWorst.marginPercent,
    worstUnit: finalWorst,
    unitMap,
  };
};

interface ProductManagementViewProps {
  products: Product[];
  categories: ProductCategory[];
  customerCategories?: CustomerCategoryItem[];
  currentUserRole: UserRole;
  transactions?: Transaction[];
  activityLogs?: EmployeeActivityLog[];
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onBatchAddProducts?: (products: Omit<Product, 'id'>[]) => void;
  onUpdateProduct: (product: Product, priceChangeReason?: string) => void;
  onDeleteProduct: (productId: string) => void;
  onAddCategory?: (category: Omit<ProductCategory, 'id'>) => ProductCategory;
  onBatchAddCategories?: (categories: Omit<ProductCategory, 'id'>[]) => void;
  onUpdateCategory?: (category: ProductCategory) => void;
  onDeleteCategory?: (categoryId: string) => void;
  onOpenThresholdSettings?: () => void;
  onNavigateToSuppliers?: () => void;
  onNavigateToServices?: () => void;
}

export const ProductManagementView: React.FC<ProductManagementViewProps> = ({
  products,
  categories,
  customerCategories = [],
  currentUserRole,
  transactions = [],
  activityLogs = [],
  onAddProduct,
  onBatchAddProducts,
  onUpdateProduct,
  onDeleteProduct,
  onAddCategory,
  onBatchAddCategories,
  onUpdateCategory,
  onDeleteCategory,
  onOpenThresholdSettings,
  onNavigateToSuppliers,
  onNavigateToServices,
}) => {
  const [activeTab, setActiveTab] = useState<'CATALOG' | 'PRICE_HISTORY'>('CATALOG');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [selectedCategory, setSelectedCategory] = useState('SEMUA');
  const [sortField, setSortField] = useState<'DEFAULT' | 'SKU' | 'NAME' | 'CATEGORY' | 'STOCK'>('DEFAULT');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(50);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [priceChangeReason, setPriceChangeReason] = useState('');
  const [skuQrProduct, setSkuQrProduct] = useState<Product | null>(null);
  const [skuQrDataUrl, setSkuQrDataUrl] = useState<string>('');

  // Riwayat Harga & Margin tab states
  const [priceHistorySearch, setPriceHistorySearch] = useState('');
  const [priceHistoryProductFilter, setPriceHistoryProductFilter] = useState<string>('ALL');
  const [priceHistoryDirectionFilter, setPriceHistoryDirectionFilter] = useState<
    'ALL' | 'NAIK' | 'TURUN' | 'MODAL_BERUBAH' | 'HARGA_AWAL' | 'OVERRIDE_KASIR'
  >('ALL');
  const [priceHistoryRangeFilter, setPriceHistoryRangeFilter] = useState<'ALL' | '7_DAYS' | '30_DAYS' | 'THIS_MONTH'>('ALL');

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
      const k = (products[i].category || '').toLowerCase();
      map.set(k, (map.get(k) || 0) + 1);
    }
    return map;
  }, [products]);

  const customerCategoryColorMap = useMemo(() => {
    const map = new Map<string, string | undefined>();
    customerCategories.forEach((c) => {
      map.set(c.name.toUpperCase(), c.color);
    });
    return map;
  }, [customerCategories]);

  interface NormalizedPriceHistoryEntry {
    id: string;
    timestamp: number;
    actorName: string;
    actorRole: UserRole;
    productId: string;
    productName: string;
    sku: string;
    category: string;
    unitName: string;
    variantName?: string;
    stage: 'CATALOG' | 'PRE_PAYMENT';
    changeDirection: 'NAIK' | 'TURUN' | 'MODAL_BERUBAH' | 'HARGA_AWAL' | 'OVERRIDE_KASIR';
    oldSellingPrice: number;
    newSellingPrice: number;
    priceDelta: number;
    priceDeltaPercent: number;
    oldCostPrice: number;
    newCostPrice: number;
    oldMarginRupiah: number;
    newMarginRupiah: number;
    oldMarginPercent: number;
    newMarginPercent: number;
    marginDeltaPercent: number;
    reason: string;
  }

  const allPriceHistoryEntries = useMemo<NormalizedPriceHistoryEntry[]>(() => {
    const parseCurrencyString = (raw?: string): number => {
      if (!raw) return 0;
      const digits = raw.split('(')[0].replace(/[^0-9-]/g, '');
      const parsed = parseInt(digits, 10);
      return isNaN(parsed) ? 0 : parsed;
    };

    const entries: NormalizedPriceHistoryEntry[] = [];
    (activityLogs || []).forEach((log) => {
      if (log.actionType !== 'MANUAL_PRICE_EDIT') return;
      const meta = (log.metadata || {}) as Record<string, any>;
      const isCatalog = meta.stage === 'CATALOG_PRICE_UPDATE' || log.targetType === 'PRODUCT';
      const resolvedProductId = String(log.productId || (log.targetType === 'PRODUCT' ? log.targetId : '') || '');
      const prod = productMap.get(resolvedProductId);

      const cleanLabelName = (log.targetLabel || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      const productName = prod?.name || cleanLabelName || log.targetLabel || 'Produk';
      const sku = String(meta.sku || prod?.sku || prod?.barcode || '-');
      const cat = String(meta.category || prod?.category || 'Umum');
      const unitName = String(meta.unitName || prod?.units?.[0]?.unitName || prod?.baseUnit || 'PCS');
      const variantName = meta.variantName ? String(meta.variantName) : undefined;

      const oldSell =
        typeof meta.oldSellingPrice === 'number'
          ? meta.oldSellingPrice
          : typeof meta.originalPrice === 'number'
          ? meta.originalPrice
          : parseCurrencyString(log.oldValue);
      const newSell =
        typeof meta.newSellingPrice === 'number'
          ? meta.newSellingPrice
          : typeof meta.newPrice === 'number'
          ? meta.newPrice
          : parseCurrencyString(log.newValue);

      const unitRef = prod?.units?.find((u) => u.unitName.toUpperCase() === unitName.toUpperCase()) || prod?.units?.[0];
      const fallbackCost = Number(unitRef?.costPrice || prod?.costPrice || 0);
      const oldCost = typeof meta.oldCostPrice === 'number' ? meta.oldCostPrice : fallbackCost;
      const newCost = typeof meta.newCostPrice === 'number' ? meta.newCostPrice : fallbackCost;

      const oldMarginRp =
        typeof meta.oldMarginRupiah === 'number' ? meta.oldMarginRupiah : oldSell - oldCost;
      const newMarginRp =
        typeof meta.newMarginRupiah === 'number' ? meta.newMarginRupiah : newSell - newCost;

      const oldMarginPct =
        typeof meta.oldMarginPercent === 'number'
          ? meta.oldMarginPercent
          : oldSell > 0
          ? Math.round((oldMarginRp / oldSell) * 1000) / 10
          : 0;
      const newMarginPct =
        typeof meta.newMarginPercent === 'number'
          ? meta.newMarginPercent
          : newSell > 0
          ? Math.round((newMarginRp / newSell) * 1000) / 10
          : 0;

      const priceDelta = newSell - oldSell;
      const priceDeltaPct =
        typeof meta.priceDeltaPercent === 'number'
          ? meta.priceDeltaPercent
          : oldSell > 0
          ? Math.round((priceDelta / oldSell) * 1000) / 10
          : 0;
      const marginDeltaPct =
        typeof meta.marginDeltaPercent === 'number'
          ? meta.marginDeltaPercent
          : Math.round((newMarginPct - oldMarginPct) * 10) / 10;

      let changeDirection: NormalizedPriceHistoryEntry['changeDirection'] = 'NAIK';
      if (!isCatalog) {
        changeDirection = 'OVERRIDE_KASIR';
      } else if (meta.changeDirection === 'HARGA_AWAL') {
        changeDirection = 'HARGA_AWAL';
      } else if (meta.changeDirection === 'MODAL_BERUBAH' || (priceDelta === 0 && oldCost !== newCost)) {
        changeDirection = 'MODAL_BERUBAH';
      } else if (priceDelta < 0 || meta.changeDirection === 'TURUN') {
        changeDirection = 'TURUN';
      } else {
        changeDirection = 'NAIK';
      }

      entries.push({
        id: log.id,
        timestamp: log.timestamp,
        actorName: log.actorName || 'System',
        actorRole: log.actorRole,
        productId: resolvedProductId,
        productName,
        sku,
        category: cat,
        unitName,
        variantName,
        stage: isCatalog ? 'CATALOG' : 'PRE_PAYMENT',
        changeDirection,
        oldSellingPrice: oldSell,
        newSellingPrice: newSell,
        priceDelta,
        priceDeltaPercent: priceDeltaPct,
        oldCostPrice: oldCost,
        newCostPrice: newCost,
        oldMarginRupiah: oldMarginRp,
        newMarginRupiah: newMarginRp,
        oldMarginPercent: oldMarginPct,
        newMarginPercent: newMarginPct,
        marginDeltaPercent: marginDeltaPct,
        reason: log.reason || log.summary || '-',
      });
    });

    return entries.sort((a, b) => b.timestamp - a.timestamp);
  }, [activityLogs, productMap]);

  const filteredPriceHistoryEntries = useMemo(() => {
    const q = priceHistorySearch.trim().toLowerCase();
    const now = Date.now();
    const startOfMonthTs = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    return allPriceHistoryEntries.filter((entry) => {
      if (priceHistoryProductFilter !== 'ALL' && entry.productId !== priceHistoryProductFilter) {
        return false;
      }
      if (priceHistoryDirectionFilter !== 'ALL' && entry.changeDirection !== priceHistoryDirectionFilter) {
        return false;
      }
      if (priceHistoryRangeFilter === '7_DAYS' && now - entry.timestamp > 7 * 86400000) {
        return false;
      }
      if (priceHistoryRangeFilter === '30_DAYS' && now - entry.timestamp > 30 * 86400000) {
        return false;
      }
      if (priceHistoryRangeFilter === 'THIS_MONTH' && entry.timestamp < startOfMonthTs) {
        return false;
      }
      if (q) {
        const hay = `${entry.productName} ${entry.sku} ${entry.category} ${entry.unitName} ${entry.variantName || ''} ${entry.actorName} ${entry.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    allPriceHistoryEntries,
    priceHistorySearch,
    priceHistoryProductFilter,
    priceHistoryDirectionFilter,
    priceHistoryRangeFilter,
  ]);

  const priceHistoryStats = useMemo(() => {
    const total = filteredPriceHistoryEntries.length;
    const upCount = filteredPriceHistoryEntries.filter((e) => e.changeDirection === 'NAIK').length;
    const downCount = filteredPriceHistoryEntries.filter(
      (e) => e.changeDirection === 'TURUN' || (e.changeDirection === 'OVERRIDE_KASIR' && e.priceDelta < 0)
    ).length;
    const marginShifts = filteredPriceHistoryEntries.filter(
      (e) => e.changeDirection !== 'HARGA_AWAL'
    );
    const avgMarginDelta =
      marginShifts.length > 0
        ? Math.round(
            (marginShifts.reduce((sum, e) => sum + e.marginDeltaPercent, 0) / marginShifts.length) * 10
          ) / 10
        : 0;
    const thinMarginProductsCount = products.filter((p) => {
      const sell = p.units?.[0]?.sellingPrice || 0;
      const cost = p.units?.[0]?.costPrice || p.costPrice || 0;
      if (sell <= 0 || cost <= 0) return false;
      const marginPct = ((sell - cost) / sell) * 100;
      return marginPct < 10;
    }).length;

    return { total, upCount, downCount, avgMarginDelta, thinMarginProductsCount };
  }, [filteredPriceHistoryEntries, products]);

  const priceHistoryChartData = useMemo(() => {
    if (priceHistoryProductFilter !== 'ALL') {
      const chronological = [...filteredPriceHistoryEntries]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);
      return chronological.map((e) => ({
        label: new Date(e.timestamp).toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
        }),
        fullDate: formatDateTime(e.timestamp),
        hargaJual: e.newSellingPrice,
        hppModal: e.newCostPrice,
        marginPct: e.newMarginPercent,
        marginRp: e.newMarginRupiah,
        unitName: e.unitName,
      }));
    }

    return [...filteredPriceHistoryEntries]
      .filter((e) => e.stage === 'CATALOG')
      .slice(0, 12)
      .reverse()
      .map((e) => ({
        label: e.productName.length > 14 ? e.productName.slice(0, 13) + '…' : e.productName,
        fullDate: formatDateTime(e.timestamp),
        hargaJual: e.newSellingPrice,
        hppModal: e.newCostPrice,
        marginPct: e.newMarginPercent,
        marginRp: e.newMarginRupiah,
        unitName: e.unitName,
      }));
  }, [filteredPriceHistoryEntries, priceHistoryProductFilter]);

  const priceHistoryProductOptions = useMemo(() => {
    const map = new Map<string, string>();
    products.forEach((p) => map.set(p.id, p.name));
    allPriceHistoryEntries.forEach((e) => {
      if (e.productId && !map.has(e.productId)) {
        map.set(e.productId, e.productName);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, allPriceHistoryEntries]);

  const handleExportPriceHistoryExcel = () => {
    sound.playTap();
    if (filteredPriceHistoryEntries.length === 0) {
      alert('Belum ada data riwayat harga yang sesuai filter untuk diekspor.');
      return;
    }

    const rows = filteredPriceHistoryEntries.map((entry) => ({
      'Waktu Perubahan': formatDateTime(entry.timestamp),
      'Pelaku / User': entry.actorName,
      'Role': entry.actorRole,
      'SKU': entry.sku,
      'Nama Produk': entry.productName,
      'Kategori': entry.category,
      'Satuan': entry.unitName + (entry.variantName ? ` (${entry.variantName})` : ''),
      'Jenis Perubahan':
        entry.changeDirection === 'NAIK'
          ? 'Harga Naik'
          : entry.changeDirection === 'TURUN'
          ? 'Harga Turun'
          : entry.changeDirection === 'MODAL_BERUBAH'
          ? 'HPP/Modal Berubah'
          : entry.changeDirection === 'HARGA_AWAL'
          ? 'Harga Awal'
          : 'Override Kasir',
      'Harga Jual Lama (Rp)': entry.oldSellingPrice,
      'Harga Jual Baru (Rp)': entry.newSellingPrice,
      'Selisih Harga (Rp)': entry.priceDelta,
      'Selisih Harga (%)': entry.priceDeltaPercent,
      'HPP Lama (Rp)': entry.oldCostPrice,
      'HPP Baru (Rp)': entry.newCostPrice,
      'Margin Lama (%)': entry.oldMarginPercent,
      'Margin Baru (%)': entry.newMarginPercent,
      'Fluktuasi Margin (%)': entry.marginDeltaPercent,
      'Keterangan / Alasan': entry.reason,
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 20 },
      { wch: 16 },
      { wch: 10 },
      { wch: 14 },
      { wch: 28 },
      { wch: 16 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 14 },
      { wch: 16 },
      { wch: 36 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat_Harga');
    const dateStamp = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Riwayat_Harga_Produk_${dateStamp}.xlsx`);
    sound.playSuccessChime();
  };

  React.useEffect(() => {
    let cancelled = false;
    if (!skuQrProduct) {
      setSkuQrDataUrl('');
      return;
    }
    const skuCode = (skuQrProduct.sku || skuQrProduct.barcode || skuQrProduct.id).trim();
    QRCode.toDataURL(skuCode, {
      width: 340,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setSkuQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setSkuQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [skuQrProduct]);

  const handleDownloadSkuQrLabel = async (prod: Product) => {
    sound.playTap();
    const skuCode = (prod.sku || prod.barcode || prod.id).trim();
    const basePrice = prod.units?.[0]?.sellingPrice || 0;
    const baseUnitName = prod.units?.[0]?.unitName || prod.baseUnit;

    try {
      const qrPng = await QRCode.toDataURL(skuCode, {
        width: 340,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });

      const canvas = document.createElement('canvas');
      canvas.width = 540;
      canvas.height = 660;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // White label card with crisp dark border
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

      // Header bar
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(12, 12, canvas.width - 24, 66);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(prod.category.toUpperCase(), canvas.width / 2, 52);

      // Product Name
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 26px sans-serif';
      const displayTitle = prod.name.length > 30 ? prod.name.slice(0, 29) + '…' : prod.name;
      ctx.fillText(displayTitle, canvas.width / 2, 120);

      // QR Code
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, (canvas.width - 320) / 2, 146, 320, 320);

        // SKU Pill
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(70, 484, canvas.width - 140, 48);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2;
        ctx.strokeRect(70, 484, canvas.width - 140, 48);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px monospace';
        ctx.fillText(skuCode, canvas.width / 2, 517);

        // Selling Price
        ctx.fillStyle = '#0369a1';
        ctx.font = 'bold 34px sans-serif';
        ctx.fillText(`${formatRupiah(basePrice)} / ${baseUnitName}`, canvas.width / 2, 588);

        ctx.fillStyle = '#64748b';
        ctx.font = '14px sans-serif';
        ctx.fillText('Scan QR Code ini di kasir untuk input cepat & cek stok', canvas.width / 2, 624);

        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `QR-SKU-${skuCode.replace(/[^a-z0-9-_]/gi, '_')}.png`;
        link.click();
      };
      img.src = qrPng;
    } catch (err) {
      console.error('Gagal membuat gambar label QR SKU:', err);
    }
  };

  // Category Manager Modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryColorInput, setCategoryColorInput] = useState(CATEGORY_COLOR_PRESETS[0].hex);
  const [categoryDescInput, setCategoryDescInput] = useState('');
  // Quick inline category create inside product form
  const [showInlineCatCreator, setShowInlineCatCreator] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');
  const [inlineCatColor, setInlineCatColor] = useState(CATEGORY_COLOR_PRESETS[2].hex);

  // Item type filter: 'ALL' | 'BARANG' | 'JASA'
  const [productTypeFilter, setProductTypeFilter] = useState<'ALL' | 'BARANG' | 'JASA'>('ALL');
  const [showLowStockOnly, setShowLowStockOnly] = useState<boolean>(false);
  const [showLowMarginOnly, setShowLowMarginOnly] = useState<boolean>(false);

  // Customer Category names list
  const availableCategoryNames = useMemo(() => {
    if (customerCategories && customerCategories.length > 0) {
      return customerCategories.map((c) => c.name);
    }
    return DEFAULT_CUSTOMER_CATEGORIES;
  }, [customerCategories]);

  // Form states for Product & Service
  const [productType, setProductType] = useState<'BARANG' | 'JASA'>('BARANG');
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('Sembako');
  const [baseUnit, setBaseUnit] = useState('PCS');
  const [stockInBaseUnit, setStockInBaseUnit] = useState('100');
  const [minStockAlert, setMinStockAlert] = useState('15');
  const [costPrice, setCostPrice] = useState('0');
  const [imageUrl, setImageUrl] = useState('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [serviceDurationMinutes, setServiceDurationMinutes] = useState('30');
  const [technicianName, setTechnicianName] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [units, setUnits] = useState<ProductUnit[]>([
    { id: 'u_1', unitName: 'PCS', conversionFactor: 1, sellingPrice: 0, costPrice: 0 },
  ]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantLabel, setVariantLabel] = useState<string>('Rasa');
  const [variantInput, setVariantInput] = useState<string>('');
  const [customerPrices, setCustomerPrices] = useState<CustomerSpecialPrice[]>([]);
  const [discountPercent, setDiscountPercent] = useState<string>('0');
  const [promoLabel, setPromoLabel] = useState<string>('');

  // CSV Import States
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRawRows, setCsvRawRows] = useState<string[][]>([]);
  const [csvMapping, setCsvMapping] = useState<{
    sku: string;
    name: string;
    category: string;
    baseUnit: string;
    sellingPrice: string;
    costPrice: string;
    stock: string;
    minStock: string;
    expiryDate: string;
    variants: string;
    imageUrl: string;
  }>({
    sku: '',
    name: '',
    category: '',
    baseUnit: '',
    sellingPrice: '',
    costPrice: '',
    stock: '',
    minStock: '',
    expiryDate: '',
    variants: '',
    imageUrl: '',
  });
  const [csvImportSuccessMessage, setCsvImportSuccessMessage] = useState<string | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [scanningUnitIndex, setScanningUnitIndex] = useState<number | null>(null);

  // Automatically compute next sequential SKU from database products
  const nextSuggestedSku = useMemo(() => {
    return getNextSequentialSku(products, productType === 'JASA');
  }, [products, productType]);

  // Top 5 Best Sellers Chart states
  const [salesTimeframe, setSalesTimeframe] = useState<'30_DAYS' | '7_DAYS' | 'ALL'>('30_DAYS');
  const [salesMetric, setSalesMetric] = useState<'QTY' | 'REVENUE'>('QTY');
  const [isChartExpanded, setIsChartExpanded] = useState<boolean>(true);

  // FIFO Gross Profit Summary Card states
  const [profitTimeframe, setProfitTimeframe] = useState<'TODAY' | '7_DAYS' | '30_DAYS' | 'ALL'>('ALL');
  const [profitSortBy, setProfitSortBy] = useState<'PROFIT' | 'REVENUE' | 'MARGIN' | 'QTY'>('PROFIT');
  const [profitSearch, setProfitSearch] = useState<string>('');
  const [isProfitCardExpanded, setIsProfitCardExpanded] = useState<boolean>(true);

  // Camera capture states
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedPhotoPreview, setCapturedPhotoPreview] = useState<string | null>(null);
  const [quickCameraTargetProduct, setQuickCameraTargetProduct] = useState<Product | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Top 5 Best Sellers calculation based on transaction history
  const topProductsAnalytics = useMemo(() => {
    const now = Date.now();
    const timeframeMs =
      salesTimeframe === '7_DAYS'
        ? 7 * 86400000
        : salesTimeframe === '30_DAYS'
        ? 30 * 86400000
        : Infinity;

    const filteredTx = transactions.filter((tx) => now - tx.timestamp <= timeframeMs);

    const statsMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        category: string;
        baseUnit: string;
        totalUnitsSold: number;
        totalRevenue: number;
        txCount: number;
      }
    >();

    filteredTx.forEach((tx) => {
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const baseUnit = prod?.baseUnit || 'PCS';
        const category = prod?.category || 'Umum';
        const unitsSold = item.quantity * (item.conversionFactor || 1);

        const current = statsMap.get(item.productId) || {
          productId: item.productId,
          productName: item.productName || prod?.name || 'Produk',
          category,
          baseUnit,
          totalUnitsSold: 0,
          totalRevenue: 0,
          txCount: 0,
        };

        current.totalUnitsSold += unitsSold;
        current.totalRevenue += item.totalAmount;
        current.txCount += 1;
        statsMap.set(item.productId, current);
      });
    });

    const list = Array.from(statsMap.values()).map((stat) => {
      const prod = productMap.get(stat.productId);
      const currentStock = prod ? prod.stockInBaseUnit : 0;
      const minAlert = prod ? prod.minStockAlert : 10;
      const costPrice = prod ? prod.costPrice : 0;
      const isZero = currentStock <= 0;
      const isLow = currentStock <= minAlert;

      const daysCount = salesTimeframe === '7_DAYS' ? 7 : 30;
      const dailyVelocity = stat.totalUnitsSold / daysCount;
      const daysLeft = dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : 999;

      return {
        ...stat,
        product: prod,
        currentStock,
        minAlert,
        costPrice,
        isZero,
        isLow,
        dailyVelocity,
        daysLeft,
      };
    });

    list.sort((a, b) =>
      salesMetric === 'QTY'
        ? b.totalUnitsSold - a.totalUnitsSold
        : b.totalRevenue - a.totalRevenue
    );

    return list.slice(0, 5);
  }, [transactions, productMap, salesTimeframe, salesMetric]);

  // FIFO Gross Profit Summary per product based on processed transactions
  const fifoGrossProfitSummary = useMemo(() => {
    const productMap = new Map<string, Product>();
    products.forEach((p) => productMap.set(p.id, p));

    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayStartMs = startOfToday.getTime();

    const filteredTx = transactions.filter((tx) => {
      if (profitTimeframe === 'TODAY') return tx.timestamp >= todayStartMs;
      if (profitTimeframe === '7_DAYS') return now - tx.timestamp <= 7 * 86400000;
      if (profitTimeframe === '30_DAYS') return now - tx.timestamp <= 30 * 86400000;
      return true;
    });

    interface FifoProductProfitAccumulator {
      productId: string;
      productName: string;
      category: string;
      baseUnit: string;
      isService: boolean;
      unitsSold: number;
      totalRevenue: number;
      totalFifoCogs: number;
      txCount: number;
      fifoBatchItemCount: number;
      totalLineItems: number;
    }

    const profitMap = new Map<string, FifoProductProfitAccumulator>();
    let grandRevenue = 0;
    let grandFifoCogs = 0;
    let fifoVerifiedItemsCount = 0;
    let totalItemsCount = 0;

    filteredTx.forEach((tx) => {
      (tx.items || []).forEach((item) => {
        const prod = productMap.get(item.productId);
        const isService = Boolean(item.isService || prod?.productType === 'JASA');
        const baseUnit = prod?.baseUnit || item.unitName || 'PCS';
        const category = prod?.category || 'Umum';
        const unitsSold = (item.quantity || 0) * (item.conversionFactor || 1);
        const revenue = item.totalAmount || 0;
        const fifoCogs = getItemFifoCogs(item, prod);
        const hasBatchAudit = Boolean(item.batchDeductions && item.batchDeductions.length > 0);

        totalItemsCount += 1;
        if (hasBatchAudit) fifoVerifiedItemsCount += 1;
        grandRevenue += revenue;
        grandFifoCogs += fifoCogs;

        const existing = profitMap.get(item.productId) || {
          productId: item.productId,
          productName: item.productName || prod?.name || 'Produk',
          category,
          baseUnit,
          isService,
          unitsSold: 0,
          totalRevenue: 0,
          totalFifoCogs: 0,
          txCount: 0,
          fifoBatchItemCount: 0,
          totalLineItems: 0,
        };

        existing.unitsSold += unitsSold;
        existing.totalRevenue += revenue;
        existing.totalFifoCogs += fifoCogs;
        existing.txCount += 1;
        existing.totalLineItems += 1;
        if (hasBatchAudit) existing.fifoBatchItemCount += 1;

        profitMap.set(item.productId, existing);
      });
    });

    const allRows = Array.from(profitMap.values()).map((row) => {
      const grossProfit = row.totalRevenue - row.totalFifoCogs;
      const marginPercent = row.totalRevenue > 0 ? (grossProfit / row.totalRevenue) * 100 : 0;
      const avgFifoCostPerUnit = row.unitsSold > 0 ? Math.round(row.totalFifoCogs / row.unitsSold) : 0;
      return {
        ...row,
        grossProfit,
        marginPercent,
        avgFifoCostPerUnit,
        product: productMap.get(row.productId),
      };
    });

    const q = profitSearch.trim().toLowerCase();
    const visibleRows = allRows
      .filter((r) => !q || r.productName.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
      .sort((a, b) => {
        if (profitSortBy === 'REVENUE') return b.totalRevenue - a.totalRevenue;
        if (profitSortBy === 'MARGIN') return b.marginPercent - a.marginPercent;
        if (profitSortBy === 'QTY') return b.unitsSold - a.unitsSold;
        return b.grossProfit - a.grossProfit;
      });

    const grandGrossProfit = grandRevenue - grandFifoCogs;
    const overallMarginPercent = grandRevenue > 0 ? (grandGrossProfit / grandRevenue) * 100 : 0;

    return {
      rows: visibleRows,
      totalProductsSold: allRows.length,
      transactionCount: filteredTx.length,
      grandRevenue,
      grandFifoCogs,
      grandGrossProfit,
      overallMarginPercent,
      fifoVerifiedItemsCount,
      totalItemsCount,
    };
  }, [transactions, products, profitTimeframe, profitSearch, profitSortBy]);

  // Camera Helper Functions
  const startCamera = async (facingModeOverride?: 'environment' | 'user') => {
    sound.playTap();
    setCameraError(null);
    setCapturedPhotoPreview(null);
    setIsCameraModalOpen(true);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Browser atau halaman saat ini tidak mendukung akses kamera. Pastikan halaman berjalan di HTTPS.');
      return;
    }

    const targetFacing = facingModeOverride || cameraFacingMode;
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: targetFacing }, width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false,
        });
      } catch (constraintErr) {
        const errName = (constraintErr as { name?: string })?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
          throw constraintErr;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      const errName = err?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
        setCameraError('Izin akses kamera ditolak browser. Aktifkan izin kamera pada ikon gembok/address bar browser.');
      } else {
        setCameraError('Izin kamera tidak aktif atau kamera tidak tersedia pada perangkat.');
      }
    }
  };

  const toggleFacingMode = () => {
    sound.playTap();
    const newMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(newMode);
    startCamera(newMode);
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCapturedPhotoPreview(null);
    setQuickCameraTargetProduct(null);
    setIsCameraModalOpen(false);
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    sound.playSuccessChime();
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const minDim = Math.min(video.videoWidth || 400, video.videoHeight || 400);
      const startX = ((video.videoWidth || 400) - minDim) / 2;
      const startY = ((video.videoHeight || 400) - minDim) / 2;
      ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 400, 400);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedPhotoPreview(dataUrl);
    }
  };

  const handleConfirmPhoto = () => {
    if (!capturedPhotoPreview) return;
    sound.playSuccessChime();

    if (quickCameraTargetProduct) {
      // Quick camera capture from product row/card
      onUpdateProduct({
        ...quickCameraTargetProduct,
        imageUrl: capturedPhotoPreview,
      });
    } else {
      // From product edit/add modal
      setImageUrl(capturedPhotoPreview);
    }
    stopCamera();
  };

  const handleRetakePhoto = () => {
    sound.playTap();
    setCapturedPhotoPreview(null);
  };

  const handleQuickCamera = (prod: Product) => {
    setQuickCameraTargetProduct(prod);
    startCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sound.playTap();
    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      // Compress and resize uploaded image on an offscreen canvas (max 400px JPEG 0.78)
      // to keep localStorage & Firestore documents lightweight and snappy
      const img = new Image();
      img.onload = () => {
        const maxDim = 400;
        let targetW = img.width || maxDim;
        let targetH = img.height || maxDim;
        if (targetW > maxDim || targetH > maxDim) {
          if (targetW >= targetH) {
            targetH = Math.max(1, Math.round((targetH * maxDim) / targetW));
            targetW = maxDim;
          } else {
            targetW = Math.max(1, Math.round((targetW * maxDim) / targetH));
            targetH = maxDim;
          }
        }
        const offscreen = document.createElement('canvas');
        offscreen.width = targetW;
        offscreen.height = targetH;
        const ctx = offscreen.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          setImageUrl(offscreen.toDataURL('image/jpeg', 0.78));
        } else {
          setImageUrl(rawDataUrl);
        }
      };
      img.onerror = () => {
        setImageUrl(rawDataUrl);
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Bind camera stream to video element when active
  React.useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream, isCameraModalOpen]);

  // Cleanup camera stream on unmount
  React.useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  const [dismissedAutoCategories, setDismissedAutoCategories] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('kasir_dismissed_auto_categories');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const updateDismissedAutoCategories = (updater: (prev: string[]) => string[]) => {
    setDismissedAutoCategories((prev) => {
      const next = updater(prev);
      try {
        localStorage.setItem('kasir_dismissed_auto_categories', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Detect any categories present in products (e.g. from imported Excel/CSV) that are not yet registered in categories list
  const autoDetectedCategories = useMemo<ProductCategory[]>(() => {
    const existingLower = new Set(
      categories.map((c) => (c.name || '').trim().toLowerCase()).filter(Boolean)
    );
    const dismissedSet = new Set(
      dismissedAutoCategories.map((n) => n.trim().toLowerCase()).filter(Boolean)
    );
    const seenLower = new Set<string>();
    const detected: ProductCategory[] = [];

    products.forEach((p) => {
      const cleanName = (p.category || '').trim();
      if (!cleanName) return;
      const lower = cleanName.toLowerCase();
      if (existingLower.has(lower) || dismissedSet.has(lower) || seenLower.has(lower)) return;
      seenLower.add(lower);

      detected.push({
        id: `auto_cat_${encodeURIComponent(lower)}`,
        name: cleanName,
        color: getCategoryColor(cleanName, categories, p),
        description: 'Terdeteksi dari produk / file impor',
      });
    });

    return detected;
  }, [categories, products, dismissedAutoCategories]);

  // Combined list of saved categories + newly detected categories from products
  const mergedCategories = useMemo<ProductCategory[]>(
    () => [...categories, ...autoDetectedCategories],
    [categories, autoDetectedCategories]
  );

  // Unique list of category names (from configured categories + any existing in products, case-insensitive deduped)
  const categoryNamesList = React.useMemo(() => {
    const names: string[] = [];
    const seenLower = new Set<string>();
    const addName = (raw?: string) => {
      const clean = (raw || '').trim();
      if (!clean) return;
      const lower = clean.toLowerCase();
      if (!seenLower.has(lower)) {
        seenLower.add(lower);
        names.push(clean);
      }
    };
    categories.forEach((c) => addName(c.name));
    products.forEach((p) => addName(p.category));
    return names;
  }, [categories, products]);

  const filterTabs = useMemo(() => ['SEMUA', ...categoryNamesList], [categoryNamesList]);

  const { physicalProductsCount, serviceProductsCount, lowStockProductsCount } = useMemo(() => {
    let physical = 0;
    let service = 0;
    let low = 0;
    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (p.productType === 'JASA') {
        service += 1;
      } else {
        physical += 1;
        if (p.stockInBaseUnit <= p.minStockAlert) {
          low += 1;
        }
      }
    }
    return { physicalProductsCount: physical, serviceProductsCount: service, lowStockProductsCount: low };
  }, [products]);

  const lowMarginSummary = useMemo(() => {
    const map = new Map<string, ProductMarginEvaluation>();
    const flagged: { product: Product; eval: ProductMarginEvaluation }[] = [];
    let lossCount = 0;
    let thinCount = 0;

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      const evaluation = evaluateProductMargin(p);
      map.set(p.id, evaluation);
      if (evaluation.isLowMargin) {
        flagged.push({ product: p, eval: evaluation });
        if (evaluation.isLoss) lossCount += 1;
        else thinCount += 1;
      }
    }

    flagged.sort((a, b) => a.eval.worstMarginPercent - b.eval.worstMarginPercent);
    return {
      map,
      items: flagged,
      count: flagged.length,
      lossCount,
      thinCount,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const list = products.filter((p) => {
      const pType = p.productType || 'BARANG';
      if (productTypeFilter !== 'ALL' && pType !== productTypeFilter) return false;
      if (showLowStockOnly && (pType === 'JASA' || p.stockInBaseUnit > p.minStockAlert)) return false;
      if (showLowMarginOnly && !lowMarginSummary.map.get(p.id)?.isLowMargin) return false;
      if (selectedCategory !== 'SEMUA' && p.category !== selectedCategory) return false;
      if (!q) return true;

      return (
        p.name.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q) ||
        (p.technicianName && p.technicianName.toLowerCase().includes(q)) ||
        p.units.some((u) => u.unitName.toLowerCase().includes(q) || (u.barcode && u.barcode.toLowerCase().includes(q))) ||
        (p.variants && p.variants.some((v) => v.name.toLowerCase().includes(q) || (v.barcode && v.barcode.toLowerCase().includes(q))))
      );
    });

    if (sortField === 'DEFAULT') return list;

    const dir = sortDirection === 'asc' ? 1 : -1;
    const compareText = (aVal: string, bVal: string) =>
      aVal.localeCompare(bVal, 'id', { numeric: true, sensitivity: 'base' });

    return [...list].sort((a, b) => {
      if (sortField === 'SKU') {
        const skuA = (a.sku || a.barcode || '').trim();
        const skuB = (b.sku || b.barcode || '').trim();
        if (!skuA && skuB) return 1;
        if (skuA && !skuB) return -1;
        const cmp = compareText(skuA, skuB) * dir;
        if (cmp !== 0) return cmp;
        return compareText((a.name || '').trim(), (b.name || '').trim());
      }

      if (sortField === 'NAME') {
        const cmp = compareText((a.name || '').trim(), (b.name || '').trim()) * dir;
        if (cmp !== 0) return cmp;
        return compareText((a.sku || a.barcode || '').trim(), (b.sku || b.barcode || '').trim());
      }

      if (sortField === 'CATEGORY') {
        const catA = (a.category || '').trim();
        const catB = (b.category || '').trim();
        if (!catA && catB) return 1;
        if (catA && !catB) return -1;
        const cmp = compareText(catA, catB) * dir;
        if (cmp !== 0) return cmp;
        return compareText((a.name || '').trim(), (b.name || '').trim());
      }

      if (sortField === 'STOCK') {
        const isServiceA = a.productType === 'JASA';
        const isServiceB = b.productType === 'JASA';
        if (isServiceA && !isServiceB) return 1;
        if (!isServiceA && isServiceB) return -1;
        const stockDiff = ((Number(a.stockInBaseUnit) || 0) - (Number(b.stockInBaseUnit) || 0)) * dir;
        if (stockDiff !== 0) return stockDiff;
        return compareText((a.name || '').trim(), (b.name || '').trim());
      }

      return 0;
    });
  }, [products, productTypeFilter, showLowStockOnly, showLowMarginOnly, lowMarginSummary, selectedCategory, deferredSearch, sortField, sortDirection]);

  const handleToggleSortField = (field: 'SKU' | 'NAME' | 'CATEGORY' | 'STOCK') => {
    sound.playTap();
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, selectedCategory, productTypeFilter, showLowStockOnly, showLowMarginOnly, pageSize, sortField, sortDirection]);

  const paginatedProducts = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, safeCurrentPage, pageSize]);

  const openAddModal = () => {
    sound.playTap();
    setProductType('BARANG');
    setName('');
    // Leave barcode empty without hardcoding so it cleanly continues sequential SKU
    setBarcode('');
    const defaultCat = categories.find((c) => !c.name.toLowerCase().includes('jasa') && !c.name.toLowerCase().includes('layanan'))?.name || categories[0]?.name || 'Sembako';
    setCategory(defaultCat);
    setBaseUnit('PCS');
    setStockInBaseUnit('100');
    setMinStockAlert('15');
    setCostPrice('0');
    setImageUrl('');
    setExpiryDate('');
    setServiceDurationMinutes('30');
    setTechnicianName('');
    setServiceNotes('');
    setUnits([
      { id: 'u_base', unitName: 'PCS', conversionFactor: 1, sellingPrice: 0, costPrice: 0 },
    ]);
    setVariants([]);
    setVariantLabel('Rasa');
    setVariantInput('');
    setCustomerPrices([]);
    setDiscountPercent('0');
    setPromoLabel('');
    setShowInlineCatCreator(false);
    setPriceChangeReason('');
    setIsAddingNew(true);
    setEditingProduct(null);
  };

  const openAddServiceModal = () => {
    sound.playTap();
    setProductType('JASA');
    setName('');
    setBarcode('');
    const serviceCat = categories.find((c) => c.name.toLowerCase().includes('jasa') || c.name.toLowerCase().includes('layanan') || c.name.toLowerCase().includes('service'))?.name || 'Jasa & Layanan';
    setCategory(serviceCat);
    setBaseUnit('SESI');
    setStockInBaseUnit('99999'); // Non-inventoried unlimited
    setMinStockAlert('0');
    setCostPrice('0'); // Biaya modal / komisi teknisi
    setImageUrl('');
    setExpiryDate('');
    setServiceDurationMinutes('45');
    setTechnicianName('');
    setServiceNotes('');
    setUnits([
      { id: 'u_jasa_base', unitName: 'SESI', conversionFactor: 1, sellingPrice: 50000, costPrice: 0 },
    ]);
    setVariants([]);
    setVariantLabel('Tipe');
    setVariantInput('');
    setCustomerPrices([]);
    setDiscountPercent('0');
    setPromoLabel('');
    setShowInlineCatCreator(false);
    setPriceChangeReason('');
    setIsAddingNew(true);
    setEditingProduct(null);
  };

  const openEditModal = (prod: Product) => {
    sound.playTap();
    setEditingProduct(prod);
    setProductType(prod.productType || 'BARANG');
    setName(prod.name);
    setBarcode(prod.sku || prod.barcode);
    setCategory(prod.category);
    setBaseUnit(prod.baseUnit);
    setStockInBaseUnit(prod.stockInBaseUnit.toString());
    setMinStockAlert(prod.minStockAlert.toString());
    const effectiveCost = prod.costPrice !== undefined ? prod.costPrice : (prod.units[0]?.costPrice || 0);
    setCostPrice(effectiveCost.toString());
    setImageUrl(prod.imageUrl || '');
    setExpiryDate(prod.expiryDate || '');
    setServiceDurationMinutes((prod.serviceDurationMinutes || 30).toString());
    setTechnicianName(prod.technicianName || '');
    setServiceNotes(prod.serviceNotes || '');
    setUnits(
      prod.units.map((u, i) => {
        const factor = u.conversionFactor || 1;
        let uCost = u.costPrice;
        if (i === 0) {
          uCost = effectiveCost;
        } else if (uCost === undefined || uCost === null || uCost <= 0 || (uCost === 120000 && factor !== 12)) {
          uCost = Math.round(effectiveCost * factor);
        }
        return {
          ...u,
          costPrice: uCost,
        };
      })
    );
    setVariants(prod.variants ? [...prod.variants] : []);
    setVariantLabel(prod.variantLabel || 'Rasa');
    setVariantInput('');
    setCustomerPrices(prod.customerPrices ? [...prod.customerPrices] : []);
    setDiscountPercent(
      prod.discountPercent && prod.discountPercent > 0 ? String(prod.discountPercent) : '0'
    );
    setPromoLabel(prod.promoLabel || '');
    setShowInlineCatCreator(false);
    setPriceChangeReason('');
    setIsAddingNew(false);
  };

  // Reaktif update state costPrice dan satuan dasar (units[0]) serta satuan turunan
  const handleCostPriceChange = (val: string) => {
    setCostPrice(val);
    const parsedCost = Math.max(0, parseFloat(val) || 0);
    setUnits((prevUnits) =>
      prevUnits.map((u, i) => {
        if (i === 0) {
          return { ...u, costPrice: parsedCost };
        }
        return {
          ...u,
          costPrice: Math.round(parsedCost * (u.conversionFactor || 1)),
        };
      })
    );
  };

  const isDuplicateSku = useMemo(() => {
    const trimmed = barcode.trim().toUpperCase();
    if (!trimmed) return false;
    return products.some((p) => {
      if (editingProduct && p.id === editingProduct.id) return false;
      return (p.sku && p.sku.toUpperCase() === trimmed) || (p.barcode && p.barcode.toUpperCase() === trimmed);
    });
  }, [barcode, products, editingProduct]);

  const handleAddVariant = (customName?: string) => {
    const val = (customName || variantInput).trim();
    if (!val) return;
    if (variants.some((v) => v.name.toLowerCase() === val.toLowerCase())) {
      setVariantInput('');
      return;
    }
    sound.playTap();
    const defaultPrice = units[0]?.sellingPrice || 0;
    setVariants([
      ...variants,
      {
        id: 'var_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        name: val,
        price: defaultPrice,
        barcode: '',
      },
    ]);
    setVariantInput('');
  };

  const handleVariantChange = (index: number, field: keyof ProductVariant, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  // Add unit row to form
  const handleAddUnitRow = () => {
    sound.playTap();
    const newId = 'u_' + Date.now();
    const defaultUnitName = productType === 'JASA' ? 'PAKET' : 'DUS';
    const defaultFactor = productType === 'JASA' ? 1 : 12;
    const baseCost = Math.max(0, parseFloat(units[0]?.costPrice?.toString() || costPrice || '0') || 0);
    const baseSelling = units[0]?.sellingPrice || 0;
    setUnits([
      ...units,
      {
        id: newId,
        unitName: defaultUnitName,
        conversionFactor: defaultFactor,
        sellingPrice: baseSelling > 0 ? baseSelling * (productType === 'JASA' ? 2 : defaultFactor) : 0,
        costPrice: Math.round(baseCost * defaultFactor),
      },
    ]);
  };

  const handleRemoveUnitRow = (index: number) => {
    sound.playTap();
    if (units.length <= 1) {
      alert(productType === 'JASA' ? 'Jasa harus memiliki minimal 1 satuan tarif dasar!' : 'Produk harus memiliki minimal 1 satuan dasar!');
      return;
    }
    const updated = [...units];
    updated.splice(index, 1);
    setUnits(updated);
  };

  const handleUnitChange = (index: number, field: keyof ProductUnit, value: any) => {
    setUnits((prevUnits) => {
      const updated = [...prevUnits];
      let val = value;
      if (field === 'conversionFactor') {
        const factor = Math.max(1, parseFloat(value) || 1);
        val = factor;
        const baseCost = Math.max(0, parseFloat(prevUnits[0]?.costPrice?.toString() || costPrice || '0') || 0);
        const baseSelling = Math.max(0, parseFloat(prevUnits[0]?.sellingPrice?.toString() || '0') || 0);
        updated[index] = {
          ...updated[index],
          conversionFactor: factor,
          costPrice: Math.round(baseCost * factor),
          sellingPrice: Math.round(baseSelling * factor),
        };
        return updated;
      }
      if (field === 'sellingPrice') {
        const parsedSelling = Math.max(0, parseFloat(value) || 0);
        val = parsedSelling;
        if (index === 0) {
          // Base selling price updated -> auto-adjust all higher units proportionally
          return updated.map((u, i) => {
            if (i === 0) return { ...u, sellingPrice: parsedSelling };
            return {
              ...u,
              sellingPrice: Math.round(parsedSelling * (u.conversionFactor || 1)),
            };
          });
        }
      }
      if (field === 'costPrice') {
        const parsedCost = Math.max(0, parseFloat(value) || 0);
        val = parsedCost;
        if (index === 0) {
          setCostPrice(parsedCost.toString());
          return updated.map((u, i) => {
            if (i === 0) return { ...u, costPrice: parsedCost };
            return { ...u, costPrice: Math.round(parsedCost * (u.conversionFactor || 1)) };
          });
        }
      }
      updated[index] = { ...updated[index], [field]: val };
      return updated;
    });
  };

  // Helper fungsi untuk kelola Harga Khusus Pelanggan
  const handleAddCustomerPrice = (presetCategory: string = 'VIP') => {
    sound.playTap();
    const baseSelling = units[0]?.sellingPrice || 0;
    const newPrice: CustomerSpecialPrice = {
      id: 'cp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      customerCategory: presetCategory,
      price: Math.max(0, Math.round(baseSelling * 0.9)), // default perkiraan hemat 10%
      unitName: baseUnit,
      minQuantity: 1, // default syarat minimal pembelian
      notes: '',
    };
    setCustomerPrices((prev) => [...prev, newPrice]);
  };

  const handleUpdateCustomerPrice = (index: number, field: keyof CustomerSpecialPrice, value: any) => {
    setCustomerPrices((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveCustomerPrice = (index: number) => {
    sound.playTap();
    setCustomerPrices((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveSku = (barcode.trim() || nextSuggestedSku || `SKU-${Date.now().toString().slice(-4)}`).toUpperCase();
    if (!name.trim() || units.length === 0) return;

    if (barcode.trim() && isDuplicateSku) {
      sound.playWarningChime();
      alert(`SKU "${barcode.trim()}" sudah digunakan oleh produk lain! Setiap produk wajib memiliki SKU unik.`);
      return;
    }

    sound.playSuccessChime();

    const catColor = getCategoryColor(category, categories);
    const isService = productType === 'JASA';
    const parsedBaseCost = Math.max(0, parseFloat(units[0]?.costPrice?.toString() || costPrice || '0') || 0);

    const productPayload: Omit<Product, 'id'> = {
      productType,
      barcode: effectiveSku,
      sku: effectiveSku,
      name: name.trim(),
      category: category.trim(),
      categoryColor: catColor,
      baseUnit: baseUnit.trim().toUpperCase(),
      stockInBaseUnit: isService ? 99999 : (parseFloat(stockInBaseUnit) || 0),
      minStockAlert: isService ? 0 : (parseFloat(minStockAlert) || 0),
      costPrice: parsedBaseCost,
      imageUrl: imageUrl.trim(),
      serviceDurationMinutes: isService ? (parseInt(serviceDurationMinutes) || 0) : undefined,
      technicianName: isService ? technicianName.trim() : undefined,
      serviceNotes: isService ? serviceNotes.trim() : undefined,
      expiryDate: (!isService && expiryDate.trim()) ? expiryDate.trim() : undefined,
      discountPercent: (() => {
        const parsed = Math.min(99, Math.max(0, parseFloat(discountPercent) || 0));
        return parsed > 0 ? Math.round(parsed * 10) / 10 : undefined;
      })(),
      promoLabel:
        (parseFloat(discountPercent) || 0) > 0 && promoLabel.trim()
          ? promoLabel.trim()
          : undefined,
      customerPrices: customerPrices.length > 0 ? customerPrices.map((cp) => ({
        id: cp.id || ('cp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
        customerCategory: cp.customerCategory.trim().toUpperCase(),
        price: Math.max(0, parseFloat(cp.price.toString()) || 0),
        unitName: cp.unitName ? cp.unitName.trim().toUpperCase() : undefined,
        minQuantity: Math.max(1, parseInt(cp.minQuantity?.toString() || '1') || 1),
        notes: cp.notes?.trim() || undefined,
      })) : undefined,
      variants: variants.length > 0 ? variants.map((v) => ({
        ...v,
        name: v.name.trim(),
        price: v.price !== undefined ? Math.max(0, parseFloat(v.price.toString()) || 0) : undefined,
        barcode: v.barcode?.trim() || undefined,
      })) : undefined,
      variantLabel: variants.length > 0 ? variantLabel.trim() : undefined,
      units: units.map((u, i) => {
        const factor = i === 0 ? 1 : Math.max(1, parseFloat(u.conversionFactor.toString()) || 1);
        const parsedUnitCost = parseFloat(u.costPrice?.toString() || '0');
        const unitCost = i === 0 
          ? parsedBaseCost 
          : (parsedUnitCost > 0 ? parsedUnitCost : Math.round(parsedBaseCost * factor));
        return {
          ...u,
          unitName: u.unitName.trim().toUpperCase(),
          conversionFactor: factor,
          sellingPrice: Math.max(0, parseFloat(u.sellingPrice.toString()) || 0),
          costPrice: unitCost,
          barcode: u.barcode?.trim() || undefined,
        };
      }),
    };

    if (editingProduct) {
      onUpdateProduct(
        {
          ...productPayload,
          id: editingProduct.id,
        },
        priceChangeReason.trim() || undefined
      );
      setEditingProduct(null);
      setPriceChangeReason('');
    } else {
      onAddProduct(productPayload);
      setIsAddingNew(false);
      setPriceChangeReason('');
    }
  };

  // =========================================================================
  // CSV IMPORT PRODUK MASSAL HANDLERS
  // =========================================================================
  // EXCEL & CSV IMPORT / EXPORT PRODUK MASSAL HANDLERS
  // =========================================================================

  // 1. Ekspor Seluruh Data Produk ke File EXCEL (.XLSX)
  const handleExportExcel = () => {
    sound.playTap();
    if (products.length === 0) {
      alert('Belum ada produk untuk diekspor.');
      return;
    }

    const exportData = products.map((p, idx) => {
      const baseUnit = p.baseUnit || p.units[0]?.unitName || 'PCS';
      const baseSellPrice = p.units[0]?.sellingPrice || 0;
      const baseCostPrice = p.costPrice || p.units[0]?.costPrice || 0;

      // Format multi-satuan additional units
      const multiUnitsStr = p.units
        .filter((u, uIdx) => uIdx > 0 || u.conversionFactor > 1)
        .map((u) => `${u.unitName}:${u.conversionFactor}:${u.sellingPrice}:${u.costPrice || 0}:${u.barcode || ''}`)
        .join('; ');

      // Format variants
      const variantsStr = (p.variants || [])
        .map((v) => `${v.name}:${v.price}:${v.barcode || ''}`)
        .join('; ');

      // Guard Excel cell 32,767 char limit (e.g. if product uses huge legacy inline base64 photo)
      const rawImageUrl = (p.imageUrl || '').trim();
      const safeImageUrl = rawImageUrl.length <= 32767 ? rawImageUrl : '';

      return {
        "No": idx + 1,
        "SKU": p.sku || p.barcode || `SKU-${idx + 1}`,
        "Barcode": p.barcode || '',
        "Nama Produk": p.name,
        "Kategori": p.category || 'Umum',
        "Tipe": p.productType || 'BARANG',
        "Satuan Dasar": baseUnit,
        "Stok Dasar": p.stockInBaseUnit || 0,
        "Batas Peringatan": p.minStockAlert || 10,
        "Harga Modal / Beli (Rp)": baseCostPrice,
        "Harga Jual Dasar (Rp)": baseSellPrice,
        "Tanggal Kadaluarsa": p.expiryDate || '-',
        "Konfigurasi Multi Satuan": multiUnitsStr,
        "Varian": variantsStr,
        "URL Gambar": safeImageUrl,
        "Jumlah Batch FIFO": p.batches?.length || 0
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Data Produk Kasirku');

    const todayStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Data_Produk_Kasirku_${todayStr}.xlsx`);
  };

  // 1b. Ekspor Daftar Produk untuk Audit Stok Offline (.XLSX) dengan kolom SKU, Nama Barang, Stok, Harga Jual
  const handleExportAuditExcel = () => {
    sound.playTap();
    const sourceProducts = filteredProducts.length > 0 ? filteredProducts : products;
    if (sourceProducts.length === 0) {
      alert('Belum ada produk untuk diekspor ke audit stok.');
      return;
    }

    const auditRows = sourceProducts.map((p, idx) => {
      const baseUnit = p.baseUnit || p.units[0]?.unitName || 'PCS';
      const baseSellPrice = p.units[0]?.sellingPrice || 0;
      return {
        SKU: p.sku || p.barcode || `SKU-${idx + 1}`,
        'Nama Barang': p.name,
        Stok: Number(p.stockInBaseUnit || 0),
        'Harga Jual': Number(baseSellPrice),
        Satuan: baseUnit,
        Kategori: p.category || 'Umum',
        'Stok Fisik (Audit)': '',
        'Catatan Audit': '',
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(auditRows);
    ws['!cols'] = [
      { wch: 16 }, // SKU
      { wch: 36 }, // Nama Barang
      { wch: 12 }, // Stok
      { wch: 16 }, // Harga Jual
      { wch: 12 }, // Satuan
      { wch: 18 }, // Kategori
      { wch: 18 }, // Stok Fisik (Audit)
      { wch: 24 }, // Catatan Audit
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Audit Stok Produk');

    const todayStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Audit_Stok_Produk_${todayStr}.xlsx`);
  };

  // 2. Unduh Template Excel (.XLSX) dengan Contoh Pengisian Realistis & Petunjuk
  const handleDownloadExcelTemplate = () => {
    sound.playTap();
    
    // Sheet 1: Contoh Pengisian Realistis (Berbagai Kategori & Multi-Satuan)
    const sampleRows = [
      {
        "SKU": "BRG-0001",
        "Barcode": "899238810011",
        "Nama Produk": "Beras Rojolele Super 5kg",
        "Kategori": "Sembako",
        "Tipe (BARANG/JASA)": "BARANG",
        "Satuan Dasar": "KARUNG",
        "Stok Dasar": 50,
        "Batas Peringatan": 10,
        "Harga Modal / Beli (Rp)": 66000,
        "Harga Jual Dasar (Rp)": 76000,
        "Tanggal Kadaluarsa": "2027-06-30",
        "Satuan Tambahan": "BAL (Isi 5):5:370000:325000:899238810012",
        "Varian": "",
        "URL Gambar": "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=300&auto=format&fit=crop&q=80"
      },
      {
        "SKU": "BRG-0002",
        "Barcode": "899886620022",
        "Nama Produk": "Indomie Goreng Spesial",
        "Kategori": "Makanan Instan",
        "Tipe (BARANG/JASA)": "BARANG",
        "Satuan Dasar": "BUNGKUS",
        "Stok Dasar": 240,
        "Batas Peringatan": 40,
        "Harga Modal / Beli (Rp)": 2900,
        "Harga Jual Dasar (Rp)": 3500,
        "Tanggal Kadaluarsa": "2026-12-15",
        "Satuan Tambahan": "DUS (Isi 40):40:128000:112000:899886620024; RENCENG (Isi 10):10:33000:28500:899886620023",
        "Varian": "Pedas:3500:899886620025; Rendang:3500:899886620026",
        "URL Gambar": "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=300&auto=format&fit=crop&q=80"
      },
      {
        "SKU": "BRG-0003",
        "Barcode": "899300550055",
        "Nama Produk": "Teh Pucuk Harum 350ml",
        "Kategori": "Minuman",
        "Tipe (BARANG/JASA)": "BARANG",
        "Satuan Dasar": "BOTOL",
        "Stok Dasar": 120,
        "Batas Peringatan": 24,
        "Harga Modal / Beli (Rp)": 4800,
        "Harga Jual Dasar (Rp)": 6500,
        "Tanggal Kadaluarsa": "2026-11-30",
        "Satuan Tambahan": "DUS (Isi 24):24:148000:112000:899300550056",
        "Varian": "Jasmine:6500:899300550057; Less Sugar:6500:899300550058",
        "URL Gambar": "https://images.unsplash.com/photo-1556881286-fc6915169721?w=300&auto=format&fit=crop&q=80"
      },
      {
        "SKU": "BRG-0004",
        "Barcode": "899455660066",
        "Nama Produk": "Whiskas Pouch Tuna 85g",
        "Kategori": "Perawatan Diri",
        "Tipe (BARANG/JASA)": "BARANG",
        "Satuan Dasar": "PCS",
        "Stok Dasar": 80,
        "Batas Peringatan": 15,
        "Harga Modal / Beli (Rp)": 15500,
        "Harga Jual Dasar (Rp)": 18500,
        "Tanggal Kadaluarsa": "2027-02-28",
        "Satuan Tambahan": "DUS (Isi 24):24:430000:365000:899455660067",
        "Varian": "Tuna:18500:899455660068; Salmon:18500:899455660069",
        "URL Gambar": ""
      },
      {
        "SKU": "JSA-0001",
        "Barcode": "",
        "Nama Produk": "Grooming Kucing Lengkap",
        "Kategori": "Layanan Jasa",
        "Tipe (BARANG/JASA)": "JASA",
        "Satuan Dasar": "SESI",
        "Stok Dasar": 0,
        "Batas Peringatan": 0,
        "Harga Modal / Beli (Rp)": 25000,
        "Harga Jual Dasar (Rp)": 75000,
        "Tanggal Kadaluarsa": "",
        "Satuan Tambahan": "",
        "Varian": "Kutu & Jamur:85000:; Mandi Biasa:65000:",
        "URL Gambar": ""
      }
    ];

    // Sheet 2: Petunjuk Format Pengisian
    const instructions = [
      { "Kolom": "SKU", "Keterangan": "Kode unik produk (wajib). Kosongkan jika ingin sistem membuatkan otomatis (SKU-XXXX)." },
      { "Kolom": "Barcode", "Keterangan": "Nomor barcode fisik untuk scan menggunakan kamera atau alat barcode scanner." },
      { "Kolom": "Nama Produk", "Keterangan": "Nama lengkap barang atau jasa (wajib)." },
      { "Kolom": "Kategori", "Keterangan": "Kategori barang (cth: Sembako, Minuman, Makanan). Kategori baru akan otomatis ditambahkan ke sistem." },
      { "Kolom": "Tipe (BARANG/JASA)", "Keterangan": "Isi BARANG untuk stok fisik, atau JASA untuk layanan jasa yang tidak membutuhkan stok." },
      { "Kolom": "Satuan Dasar", "Keterangan": "Satuan terkecil produk (cth: PCS, BOTOL, BUNGKUS, KARUNG)." },
      { "Kolom": "Stok Dasar", "Keterangan": "Jumlah stok awal dalam satuan dasar (cth: 100)." },
      { "Kolom": "Batas Peringatan", "Keterangan": "Batas minimum stok untuk memunculkan notifikasi habis (cth: 15)." },
      { "Kolom": "Harga Modal / Beli (Rp)", "Keterangan": "Harga modal/pembelian awal per satuan dasar (HPP FIFO)." },
      { "Kolom": "Harga Jual Dasar (Rp)", "Keterangan": "Harga jual kepada konsumen untuk 1 satuan dasar (wajib)." },
      { "Kolom": "Tanggal Kadaluarsa", "Keterangan": "Format tanggal YYYY-MM-DD (cth: 2026-12-31) untuk pelacakan batch expired." },
      { "Kolom": "Satuan Tambahan", "Keterangan": "Format: NamaSatuan:FaktorKonversi:HargaJual:HargaBeli:Barcode. Pisahkan dengan tanda titik koma (;) jika lebih dari 1 satuan." },
      { "Kolom": "Varian", "Keterangan": "Format: NamaVarian:HargaJual:Barcode. Pisahkan dengan titik koma (;) jika lebih dari 1 varian." },
      { "Kolom": "URL Gambar", "Keterangan": "Link URL gambar produk (opsional, cth: https://domain.com/gambar-produk.jpg). Kosongkan jika tidak ada gambar." }
    ];

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sampleRows);
    const ws2 = XLSX.utils.json_to_sheet(instructions);

    XLSX.utils.book_append_sheet(wb, ws1, 'Contoh Pengisian Produk');
    XLSX.utils.book_append_sheet(wb, ws2, 'Petunjuk Format Pengisian');

    XLSX.writeFile(wb, 'template_import_produk_kasirku.xlsx');
  };

  // Helper parser for line CSV fallback
  const parseCsvLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let current = '';
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map((col) => col.replace(/^"(.*)"$/, '$1').trim());
  };

  // 3. Upload File Handler (Mendukung Excel .xlsx, .xls dan .csv)
  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    sound.playTap();
    setCsvFileName(file.name);
    setCsvImportSuccessMessage(null);

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rawSheetData = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, defval: '' });

          if (!rawSheetData || rawSheetData.length < 2) {
            alert('File Excel harus memiliki minimal 1 baris judul kolom dan 1 baris data produk.');
            return;
          }

          const headers = (rawSheetData[0] || []).map((h) => String(h).trim()).filter(Boolean);
          const rows: string[][] = [];

          for (let i = 1; i < rawSheetData.length; i++) {
            const rowCols = (rawSheetData[i] || []).map((c) => String(c).trim());
            if (rowCols.some((c) => c.length > 0)) {
              rows.push(rowCols);
            }
          }

          setCsvHeaders(headers);
          setCsvRawRows(rows);

          // Auto mapping
          const autoMap = {
            sku: headers.find((h) => /sku|kode|barcode/i.test(h)) || headers[0] || '',
            name: headers.find((h) => /nama|name|produk|barang/i.test(h)) || headers[1] || '',
            category: headers.find((h) => /kategori|category/i.test(h)) || '',
            baseUnit: headers.find((h) => /satuan dasar|satuan|unit/i.test(h)) || '',
            sellingPrice: headers.find((h) => /harga jual|selling|harga|price|jual/i.test(h)) || '',
            costPrice: headers.find((h) => /modal|beli|cost|hpp/i.test(h)) || '',
            stock: headers.find((h) => /stok|stock|qty|jumlah/i.test(h)) || '',
            minStock: headers.find((h) => /min|peringatan|alert|batas/i.test(h)) || '',
            expiryDate: headers.find((h) => /kadaluarsa|expired|exp/i.test(h)) || '',
            variants: headers.find((h) => /varian|variant|variasi/i.test(h)) || '',
            imageUrl: headers.find((h) => /url\s*gambar|gambar|image\s*url|imageurl|image|foto|photo|link\s*gambar|thumbnail/i.test(h)) || '',
          };

          setCsvMapping(autoMap);
        } catch (err) {
          console.error('Gagal membaca file Excel:', err);
          alert('Format file Excel tidak dapat dibaca. Pastikan format file .xlsx atau .xls valid.');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV Fallback
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (!text) return;

        const lines = text
          .split(/\r\n|\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (lines.length < 2) {
          alert('File harus memiliki minimal 1 baris judul kolom dan 1 baris data produk.');
          return;
        }

        const firstLine = lines[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';
        const headers = parseCsvLine(firstLine, delimiter);
        const rows: string[][] = [];

        for (let i = 1; i < lines.length; i++) {
          const rowCols = parseCsvLine(lines[i], delimiter);
          if (rowCols.some((col) => col.length > 0)) {
            rows.push(rowCols);
          }
        }

        setCsvHeaders(headers);
        setCsvRawRows(rows);

        const autoMap = {
          sku: headers.find((h) => /sku|kode|barcode/i.test(h)) || headers[0] || '',
          name: headers.find((h) => /nama|name|produk|barang/i.test(h)) || headers[1] || '',
          category: headers.find((h) => /kategori|category/i.test(h)) || '',
          baseUnit: headers.find((h) => /satuan|unit/i.test(h)) || '',
          sellingPrice: headers.find((h) => /harga jual|selling|harga|price|jual/i.test(h)) || '',
          costPrice: headers.find((h) => /modal|beli|cost|hpp/i.test(h)) || '',
          stock: headers.find((h) => /stok|stock|qty|jumlah/i.test(h)) || '',
          minStock: headers.find((h) => /min|peringatan|alert|batas/i.test(h)) || '',
          expiryDate: headers.find((h) => /kadaluarsa|expired|exp/i.test(h)) || '',
          variants: headers.find((h) => /varian|variant|variasi/i.test(h)) || '',
          imageUrl: headers.find((h) => /url\s*gambar|gambar|image\s*url|imageurl|image|foto|photo|link\s*gambar|thumbnail/i.test(h)) || '',
        };

        setCsvMapping(autoMap);
      };
      reader.readAsText(file);
    }
  };

  const handleExecuteCsvImport = () => {
    sound.playTap();
    if (!csvMapping.sku || !csvMapping.name || !csvMapping.sellingPrice) {
      alert('Mohon pilih pemetaan kolom wajib: SKU, Nama Produk, dan Harga Jual.');
      return;
    }

    const skuIdx = csvHeaders.indexOf(csvMapping.sku);
    const nameIdx = csvHeaders.indexOf(csvMapping.name);
    const catIdx = csvHeaders.indexOf(csvMapping.category);
    const unitIdx = csvHeaders.indexOf(csvMapping.baseUnit);
    const sellPriceIdx = csvHeaders.indexOf(csvMapping.sellingPrice);
    const costPriceIdx = csvHeaders.indexOf(csvMapping.costPrice);
    const stockIdx = csvHeaders.indexOf(csvMapping.stock);
    const minStockIdx = csvHeaders.indexOf(csvMapping.minStock);
    const expIdx = csvHeaders.indexOf(csvMapping.expiryDate);
    const varIdx = csvHeaders.indexOf(csvMapping.variants);
    const imageUrlIdx = csvHeaders.indexOf(csvMapping.imageUrl);

    const existingSkus = new Set(
      products.map((p) => (p.sku || p.barcode || '').toUpperCase().trim()).filter(Boolean)
    );

    const newProductsToCreate: Omit<Product, 'id'>[] = [];
    const skippedSkus: string[] = [];
    const seenImportSkus = new Set<string>();

    csvRawRows.forEach((row, rowIdx) => {
      const rawSku = (skuIdx >= 0 ? row[skuIdx] : '') || `SKU-${Date.now()}-${rowIdx + 1}`;
      const cleanSku = rawSku.trim().toUpperCase();
      const rawName = (nameIdx >= 0 ? row[nameIdx] : '').trim();

      if (!rawName) return;

      if (existingSkus.has(cleanSku) || seenImportSkus.has(cleanSku)) {
        skippedSkus.push(cleanSku);
        return;
      }

      seenImportSkus.add(cleanSku);

      const rawCat = (catIdx >= 0 ? row[catIdx] : '').trim() || 'Umum';
      const rawUnit = (unitIdx >= 0 ? row[unitIdx] : '').trim().toUpperCase() || 'PCS';
      const rawSellPrice = parseFloat((sellPriceIdx >= 0 ? row[sellPriceIdx] : '').replace(/[^\d.]/g, '')) || 0;
      const rawCostPrice = parseFloat((costPriceIdx >= 0 ? row[costPriceIdx] : '').replace(/[^\d.]/g, '')) || 0;
      const rawStock = parseFloat((stockIdx >= 0 ? row[stockIdx] : '').replace(/[^\d.]/g, '')) || 0;
      const rawMinStock = parseFloat((minStockIdx >= 0 ? row[minStockIdx] : '').replace(/[^\d.]/g, '')) || 10;
      const rawExpDate = (expIdx >= 0 ? row[expIdx] : '').trim();
      const rawImageUrl = (imageUrlIdx >= 0 ? row[imageUrlIdx] : '').trim();

      // Parse variants column if provided: format "Nama:Harga:Barcode;Nama2:Harga2:Barcode2" or "Rasa A, Rasa B"
      let parsedVariants: ProductVariant[] | undefined = undefined;
      const rawVariantsStr = (varIdx >= 0 ? row[varIdx] : '').trim();
      if (rawVariantsStr) {
        const parts = rawVariantsStr.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
        if (parts.length > 0) {
          parsedVariants = parts.map((part, vIdx) => {
            const tokens = part.split(':').map((t) => t.trim());
            const vName = tokens[0] || `Varian ${vIdx + 1}`;
            const vPrice = tokens[1] ? (parseFloat(tokens[1]) || rawSellPrice) : rawSellPrice;
            const vBarcode = tokens[2] || '';
            return {
              id: `var_${Date.now()}_${vIdx}_${Math.random().toString(36).substring(2, 6)}`,
              name: vName,
              price: vPrice,
              barcode: vBarcode,
            };
          });
        }
      }

      const catColor = getCategoryColor(rawCat, categories);

      newProductsToCreate.push({
        productType: 'BARANG',
        sku: cleanSku,
        barcode: cleanSku,
        name: rawName,
        category: rawCat,
        categoryColor: catColor,
        baseUnit: rawUnit,
        stockInBaseUnit: rawStock,
        minStockAlert: rawMinStock,
        costPrice: rawCostPrice,
        imageUrl: rawImageUrl || undefined,
        expiryDate: rawExpDate || undefined,
        units: [
          {
            id: `u_${Date.now()}_${rowIdx}`,
            unitName: rawUnit,
            conversionFactor: 1,
            sellingPrice: rawSellPrice,
            costPrice: rawCostPrice,
            barcode: cleanSku,
          },
        ],
        variants: parsedVariants,
        variantLabel: parsedVariants && parsedVariants.length > 0 ? 'Varian' : undefined,
      });
    });

    if (newProductsToCreate.length === 0) {
      alert('Tidak ada produk valid yang dapat diimpor. Periksa apakah SKU sudah terdaftar atau nama produk kosong.');
      return;
    }

    // Ensure imported category names are not suppressed if previously dismissed
    const importedCategoryLowers = new Set(
      newProductsToCreate.map((p) => (p.category || '').trim().toLowerCase()).filter(Boolean)
    );
    if (importedCategoryLowers.size > 0) {
      updateDismissedAutoCategories((prev) =>
        prev.filter((name) => !importedCategoryLowers.has(name.trim().toLowerCase()))
      );
    }

    // Batch insert
    if (onBatchAddProducts) {
      onBatchAddProducts(newProductsToCreate);
    } else {
      newProductsToCreate.forEach((p) => onAddProduct(p));
      // Fallback category registration when parent didn't pass onBatchAddProducts
      if (onAddCategory) {
        const existingLower = new Set(categories.map((c) => (c.name || '').trim().toLowerCase()));
        newProductsToCreate.forEach((p) => {
          const cleanCat = (p.category || '').trim();
          if (cleanCat && !existingLower.has(cleanCat.toLowerCase())) {
            existingLower.add(cleanCat.toLowerCase());
            onAddCategory({
              name: cleanCat,
              color: p.categoryColor || getCategoryColor(cleanCat, categories),
              description: 'Otomatis ditambahkan dari impor Excel/CSV',
            });
          }
        });
      }
    }

    sound.playSuccessChime();
    setCsvImportSuccessMessage(
      `Berhasil mengimpor ${newProductsToCreate.length} produk baru!` +
      (skippedSkus.length > 0 ? ` (${skippedSkus.length} SKU dilewati karena duplikat)` : '')
    );

    setTimeout(() => {
      setIsCsvModalOpen(false);
      setCsvRawRows([]);
      setCsvHeaders([]);
      setCsvFileName('');
      setCsvImportSuccessMessage(null);
    }, 2000);
  };

  // =========================================================================
  // CATEGORY MANAGEMENT HANDLERS
  // =========================================================================
  const handleSyncDetectedCategories = (catsToSync = autoDetectedCategories) => {
    if (catsToSync.length === 0) return;
    const payload = catsToSync.map((c) => ({
      name: c.name,
      color: c.color,
      description: 'Terdeteksi dari impor produk',
    }));
    if (onBatchAddCategories) {
      onBatchAddCategories(payload);
    } else if (onAddCategory) {
      payload.forEach((c) => onAddCategory(c));
    }
  };

  const openCategoryManager = () => {
    sound.playTap();
    // Auto-register any categories from previously imported files so they appear as permanent categories
    if (autoDetectedCategories.length > 0) {
      handleSyncDetectedCategories(autoDetectedCategories);
    }
    setEditingCategory(null);
    setCategoryNameInput('');
    setCategoryColorInput(CATEGORY_COLOR_PRESETS[0].hex);
    setCategoryDescInput('');
    setIsCategoryModalOpen(true);
  };

  const handleStartEditCategory = (cat: ProductCategory) => {
    sound.playTap();
    setEditingCategory(cat);
    setCategoryNameInput(cat.name);
    setCategoryColorInput(cat.color || '#0284c7');
    setCategoryDescInput(cat.description || '');
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = categoryNameInput.trim();
    if (!cleanName) return;

    sound.playSuccessChime();
    updateDismissedAutoCategories((prev) =>
      prev.filter((n) => n.trim().toLowerCase() !== cleanName.toLowerCase())
    );

    if (editingCategory) {
      if (editingCategory.id.startsWith('auto_cat_')) {
        // Persist newly promoted auto-detected category & sync matching products
        if (onAddCategory) {
          onAddCategory({
            name: cleanName,
            color: categoryColorInput,
            description: categoryDescInput.trim() || 'Kategori dari produk impor',
          });
        }
        const oldLower = editingCategory.name.trim().toLowerCase();
        products.forEach((p) => {
          if ((p.category || '').trim().toLowerCase() === oldLower) {
            onUpdateProduct({
              ...p,
              category: cleanName,
              categoryColor: categoryColorInput,
            });
          }
        });
      } else if (onUpdateCategory) {
        onUpdateCategory({
          ...editingCategory,
          name: cleanName,
          color: categoryColorInput,
          description: categoryDescInput.trim(),
        });
      }
      setEditingCategory(null);
    } else {
      if (onAddCategory) {
        onAddCategory({
          name: cleanName,
          color: categoryColorInput,
          description: categoryDescInput.trim(),
        });
      }
    }

    setCategoryNameInput('');
    setCategoryColorInput(CATEGORY_COLOR_PRESETS[Math.floor(Math.random() * CATEGORY_COLOR_PRESETS.length)].hex);
    setCategoryDescInput('');
  };

  const handleDeleteCategory = (cat: ProductCategory) => {
    const catLower = cat.name.trim().toLowerCase();
    const productsInCat = products.filter((p) => (p.category || '').trim().toLowerCase() === catLower);
    if (productsInCat.length > 0) {
      const confirmDelete = confirm(
        `Kategori "${cat.name}" sedang digunakan oleh ${productsInCat.length} produk. Apakah Anda yakin ingin menghapusnya? Produk akan tetap tersimpan.`
      );
      if (!confirmDelete) return;
      updateDismissedAutoCategories((prev) =>
        prev.includes(catLower) ? prev : [...prev, catLower]
      );
    } else {
      if (!confirm(`Hapus kategori "${cat.name}"?`)) return;
    }

    sound.playTap();
    if (!cat.id.startsWith('auto_cat_') && onDeleteCategory) {
      onDeleteCategory(cat.id);
    }
    if (editingCategory?.id === cat.id) {
      setEditingCategory(null);
      setCategoryNameInput('');
    }
  };

  const handleCreateInlineCategory = () => {
    if (!inlineCatName.trim()) return;
    sound.playSuccessChime();
    const clean = inlineCatName.trim();
    updateDismissedAutoCategories((prev) =>
      prev.filter((n) => n.trim().toLowerCase() !== clean.toLowerCase())
    );
    let newCat: ProductCategory | null = null;
    if (onAddCategory) {
      newCat = onAddCategory({
        name: clean,
        color: inlineCatColor,
        description: 'Dibuat saat tambah produk',
      });
    }
    setCategory(newCat ? newCat.name : clean);
    setInlineCatName('');
    setShowInlineCatCreator(false);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-sky-600" />
                <span>Katalog Barang &amp; Input Jasa Layanan</span>
              </h2>
              {lowStockProductsCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setShowLowStockOnly((prev) => !prev);
                    setProductTypeFilter('BARANG');
                  }}
                  title="Klik untuk menyaring produk dengan stok di bawah/pada ambang batas minimum"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black border transition-all cursor-pointer ${
                    showLowStockOnly
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{lowStockProductsCount} Stok Menipis</span>
                </button>
              )}
              {lowMarginSummary.count > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setShowLowMarginOnly((prev) => !prev);
                    setActiveTab('CATALOG');
                  }}
                  title="Klik untuk menyaring produk dengan margin keuntungan di bawah 2%"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black border transition-all cursor-pointer ${
                    showLowMarginOnly
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{lowMarginSummary.count} Margin &lt; 2%</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur produk fisik, tarif jasa/layanan non-stok, harga jual bertingkat, dan pantau stok toko.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
            {/* Category Manager Button */}
            <button
              type="button"
              onClick={openCategoryManager}
              className="px-3.5 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 font-bold text-xs md:text-sm flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              title="Kelola warna dan daftar kategori produk"
            >
              <Palette className="w-4 h-4 text-sky-600" />
              <span>Kelola Kategori</span>
              <span className="ml-1 px-1.5 py-0.2 bg-sky-600 text-white text-[10px] rounded-full">
                {mergedCategories.length}
              </span>
            </button>

            {onOpenThresholdSettings && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onOpenThresholdSettings();
                }}
                className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs md:text-sm flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                title="Kelola Ambang Batas Minimum Stok untuk seluruh produk"
              >
                <Sliders className="w-4 h-4 text-amber-700" />
                <span>Atur Ambang Batas</span>
              </button>
            )}

            {/* Dedicated Input Jasa Button */}
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                if (onNavigateToServices) {
                  onNavigateToServices();
                } else {
                  openAddServiceModal();
                }
              }}
              className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs md:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer hover:shadow-md"
              title="Buka Menu Khusus Jasa & Layanan (Servis, Bengkel, Salon, Cuci, Laundry, dll.)"
            >
              <Wrench className="w-4 h-4" />
              <span>Menu Jasa ({serviceProductsCount})</span>
            </button>

            {/* Button Audit Stok Excel (.XLSX) */}
            <button
              type="button"
              onClick={handleExportAuditExcel}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs md:text-sm flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Ekspor daftar produk untuk audit stok offline (SKU, Nama Barang, Stok, Harga Jual)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Audit Stok (.XLSX)</span>
            </button>

            {/* Button Ekspor Excel (.XLSX) */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3.5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-bold text-xs md:text-sm flex items-center gap-1.5 shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Ekspor seluruh database produk ke format file Excel (.xlsx)"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor Excel (.XLSX)</span>
            </button>

            {/* Button Import Excel (.XLSX) */}
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsCsvModalOpen(true);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs md:text-sm flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              title="Impor data produk secara massal dengan file Excel (.xlsx) atau CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import Excel (.XLSX)</span>
            </button>

            {/* Button Tambah Barang Fisik */}
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs md:text-sm flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>+ Tambah Barang</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs: Katalog Produk vs Riwayat Harga */}
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200 flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setActiveTab('CATALOG');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'CATALOG'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Daftar Produk &amp; Jasa</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums ${
                activeTab === 'CATALOG'
                  ? 'bg-white/15 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {formatNumber(products.length)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setActiveTab('PRICE_HISTORY');
            }}
            className={`px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'PRICE_HISTORY'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Riwayat Harga</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono tabular-nums ${
                activeTab === 'PRICE_HISTORY'
                  ? 'bg-sky-400/20 text-sky-200'
                  : 'bg-sky-50 text-sky-700'
              }`}
            >
              {formatNumber(allPriceHistoryEntries.length)}
            </span>
          </button>
        </div>

        {activeTab === 'CATALOG' ? (
          <>
        {/* =================================================================== */}
        {/* TOP 5 PRODUK TERLARIS & PRIORITAS STOK CHART                       */}
        {/* =================================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Header of the Chart Section */}
          <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-amber-50/50 via-white to-sky-50/40">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                <Trophy className="w-5 h-5 text-amber-100" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Top 5 Produk Terlaris</span>
                    <span className="text-amber-600 flex items-center gap-0.5 text-xs font-black">
                      <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>Best Sellers</span>
                    </span>
                  </h3>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    Prioritas Kontrol Stok
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Analisis perputaran produk terlaris untuk memprioritaskan pemesanan stok dan mencegah kekosongan barang.
                </p>
              </div>
            </div>

            {/* Timeframe & Metric Switchers */}
            <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
              {/* Timeframe Filter */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                {[
                  { id: '7_DAYS', label: '7 Hari' },
                  { id: '30_DAYS', label: '30 Hari' },
                  { id: 'ALL', label: 'Semua' },
                ].map((tf) => (
                  <button
                    key={tf.id}
                    onClick={() => {
                      sound.playTap();
                      setSalesTimeframe(tf.id as any);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      salesTimeframe === tf.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {/* Metric Filter */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => {
                    sound.playTap();
                    setSalesMetric('QTY');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    salesMetric === 'QTY'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unit
                </button>
                <button
                  onClick={() => {
                    sound.playTap();
                    setSalesMetric('REVENUE');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    salesMetric === 'REVENUE'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Omzet
                </button>
              </div>

              {/* Toggle Expand / Collapse */}
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsChartExpanded(!isChartExpanded);
                }}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                title={isChartExpanded ? 'Ciutkan Bagan' : 'Perluas Bagan'}
              >
                {isChartExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Chart & Cards Body */}
          {isChartExpanded && (
            <div className="p-4 md:p-5">
              {topProductsAnalytics.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-1">
                  <TrendingUp className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700 text-xs">Belum ada data penjualan pada periode ini</p>
                  <p className="text-[11px] text-slate-400">Lakukan transaksi di menu POS untuk melihat chart produk terlaris.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                  {/* Left: Recharts Bar Chart (7 Cols) */}
                  <div className="lg:col-span-7 bg-slate-50/70 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-sky-600" />
                        <span>
                          Grafik Perbandingan {salesMetric === 'QTY' ? 'Volume Unit Terjual' : 'Total Omzet Penjualan'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Top 5 SKU</span>
                    </div>

                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topProductsAnalytics.map((item, idx) => ({
                            name: item.productName.length > 18 ? item.productName.slice(0, 16) + '...' : item.productName,
                            fullName: item.productName,
                            unit: item.baseUnit,
                            value: salesMetric === 'QTY' ? item.totalUnitsSold : item.totalRevenue,
                            rank: idx + 1,
                            currentStock: item.currentStock,
                            minAlert: item.minAlert,
                            isLow: item.isLow,
                          }))}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <XAxis 
                            type="number" 
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickFormatter={(v) => salesMetric === 'QTY' ? formatNumber(v) : `${Math.round(v / 1000)}k`}
                          />
                          <YAxis 
                            type="category" 
                            dataKey="name" 
                            width={110} 
                            tick={{ fontSize: 10, fill: '#1e293b', fontWeight: 600 }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs shadow-xl space-y-1 font-sans">
                                    <div className="font-bold text-amber-400 flex items-center gap-1">
                                      <span>#{data.rank}</span>
                                      <span>{data.fullName}</span>
                                    </div>
                                    <div className="text-slate-300">
                                      {salesMetric === 'QTY' ? 'Volume Terjual: ' : 'Total Omzet: '}
                                      <strong className="text-white font-mono">
                                        {salesMetric === 'QTY' ? `${formatNumber(data.value)} ${data.unit}` : formatRupiah(data.value)}
                                      </strong>
                                    </div>
                                    <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-700 flex justify-between gap-3">
                                      <span>Sisa Stok: {data.currentStock} {data.unit}</span>
                                      <span className={data.isLow ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                                        {data.isLow ? 'Perlu Restock!' : 'Stok Cukup'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                            {topProductsAnalytics.map((entry, index) => {
                              const colors = [
                                '#f59e0b', // #1 Gold
                                '#0284c7', // #2 Blue
                                '#059669', // #3 Emerald
                                '#8b5cf6', // #4 Purple
                                '#ec4899', // #5 Pink
                              ];
                              return (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={colors[index % colors.length]}
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200 mt-2">
                      <span>Rata-rata penjualan harian otomatis dihitung dari histori transaksi POS</span>
                      <span className="font-semibold text-slate-700">Sumber: Data Penjualan Toko</span>
                    </div>
                  </div>

                  {/* Right: Ranking Cards with Stock Priority Alerts (5 Cols) */}
                  <div className="lg:col-span-5 space-y-2.5">
                    <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>Status Stok & Prioritas Restock:</span>
                      <span className="text-[10px] text-slate-500">Urutan Terlaris #1 - #5</span>
                    </div>

                    <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
                      {topProductsAnalytics.map((item, idx) => {
                        const rankColors = [
                          'bg-amber-500 text-white shadow-amber-500/30 ring-2 ring-amber-300',
                          'bg-slate-400 text-white shadow-slate-400/30 ring-2 ring-slate-200',
                          'bg-amber-700 text-white shadow-amber-700/30 ring-2 ring-amber-600',
                          'bg-sky-100 text-sky-800 font-bold',
                          'bg-slate-100 text-slate-800 font-bold',
                        ];

                        return (
                          <div
                            key={item.productId}
                            className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              item.isZero
                                ? 'bg-rose-50/80 border-rose-300 shadow-2xs'
                                : item.isLow
                                ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${rankColors[idx]}`}>
                                {idx + 1}
                              </div>

                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1.5">
                                  <span>{item.productName}</span>
                                  {item.isZero ? (
                                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                                  ) : item.isLow ? (
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                  ) : null}
                                </div>

                                <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                                  <span>Terjual: <strong className="text-slate-800">{formatNumber(item.totalUnitsSold)} {item.baseUnit}</strong></span>
                                  <span>·</span>
                                  <span>Omzet: {formatRupiah(item.totalRevenue)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Stock Health & Restock Advice */}
                            <div className="text-right shrink-0">
                              <div className="flex items-center justify-end gap-1 font-mono">
                                <span className="text-[10px] text-slate-400">Stok:</span>
                                <span className={`text-xs font-black ${
                                  item.isZero
                                    ? 'text-rose-600'
                                    : item.isLow
                                    ? 'text-amber-700'
                                    : 'text-slate-800'
                                }`}>
                                  {formatNumber(item.currentStock)} {item.baseUnit}
                                </span>
                              </div>

                              <div className="mt-0.5">
                                {item.isZero ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9.5px] font-black uppercase tracking-wider animate-pulse">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>STOK HABIS!</span>
                                  </span>
                                ) : item.isLow ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[9.5px] font-bold">
                                    <span>PRIORITAS RESTOCK</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-700 text-[10px] font-bold">
                                    <Check className="w-3 h-3" />
                                    <span>Stok Aman</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Proactive Tip for Manager */}
                    <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-[11px] text-sky-900 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>
                          {topProductsAnalytics.some((p) => p.isLow)
                            ? 'Ada produk terlaris yang stoknya menipis! Segera ajukan PO.'
                            : 'Stok 5 produk terlaris saat ini dalam batas aman.'}
                        </span>
                      </div>
                      {onNavigateToSuppliers && topProductsAnalytics.some((p) => p.isLow) && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            onNavigateToSuppliers();
                          }}
                          className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-[10px] shadow-2xs whitespace-nowrap flex items-center gap-1"
                        >
                          <Truck className="w-3 h-3" />
                          <span>Pesan PO</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* KARTU RINGKASAN LABA KOTOR PER PRODUK (METODE FIFO)                 */}
        {/* =================================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-emerald-50/60 via-white to-teal-50/40">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20 shrink-0">
                <Coins className="w-5 h-5 text-emerald-50" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900">
                    Ringkasan Laba Kotor per Produk (FIFO)
                  </h3>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-md border border-emerald-200">
                    HPP Batch FIFO
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Total akumulasi laba kotor (Omzet &minus; HPP FIFO) yang dihasilkan tiap produk dari transaksi yang telah diproses.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                {[
                  { id: 'TODAY', label: 'Hari Ini' },
                  { id: '7_DAYS', label: '7 Hari' },
                  { id: '30_DAYS', label: '30 Hari' },
                  { id: 'ALL', label: 'Semua' },
                ].map((tf) => (
                  <button
                    key={tf.id}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setProfitTimeframe(tf.id as 'TODAY' | '7_DAYS' | '30_DAYS' | 'ALL');
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                      profitTimeframe === tf.id
                        ? 'bg-white text-emerald-800 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsProfitCardExpanded(!isProfitCardExpanded);
                }}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                title={isProfitCardExpanded ? 'Ciutkan Ringkasan Laba Kotor' : 'Perluas Ringkasan Laba Kotor'}
              >
                {isProfitCardExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {isProfitCardExpanded && (
            <div className="p-4 md:p-5 space-y-4">
              {/* KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-200">
                  <div className="text-[11px] font-bold text-emerald-800 flex items-center justify-between">
                    <span>Total Laba Kotor FIFO</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black font-mono">
                      {fifoGrossProfitSummary.overallMarginPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className={`text-lg md:text-xl font-black font-mono mt-1 ${
                    fifoGrossProfitSummary.grandGrossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}>
                    {formatRupiah(fifoGrossProfitSummary.grandGrossProfit)}
                  </div>
                  <div className="text-[10px] text-emerald-700/80 mt-0.5">
                    Margin rata-rata dari omzet
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-600">Total Omzet Produk</div>
                  <div className="text-base md:text-lg font-black font-mono text-slate-900 mt-1">
                    {formatRupiah(fifoGrossProfitSummary.grandRevenue)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Dari {formatNumber(fifoGrossProfitSummary.transactionCount)} transaksi
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-bold text-slate-600">Total HPP (Modal FIFO)</div>
                  <div className="text-base md:text-lg font-black font-mono text-slate-800 mt-1">
                    {formatRupiah(fifoGrossProfitSummary.grandFifoCogs)}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {formatNumber(fifoGrossProfitSummary.fifoVerifiedItemsCount)}/{formatNumber(fifoGrossProfitSummary.totalItemsCount)} baris teraudit batch FIFO
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200">
                  <div className="text-[11px] font-bold text-sky-900">Produk Terjual</div>
                  <div className="text-base md:text-lg font-black font-mono text-sky-700 mt-1">
                    {formatNumber(fifoGrossProfitSummary.totalProductsSold)} Produk
                  </div>
                  <div className="text-[10px] text-sky-700/80 mt-0.5">
                    {fifoGrossProfitSummary.totalProductsSold > 0
                      ? `Rata-rata ${formatRupiah(Math.round(fifoGrossProfitSummary.grandGrossProfit / fifoGrossProfitSummary.totalProductsSold))}/produk`
                      : 'Belum ada penjualan'}
                  </div>
                </div>
              </div>

              {fifoGrossProfitSummary.totalProductsSold === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 space-y-1">
                  <Calculator className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700 text-xs">Belum ada transaksi FIFO pada periode ini</p>
                  <p className="text-[11px] text-slate-400">
                    Proses transaksi penjualan di menu Kasir POS untuk menghitung laba kotor FIFO per produk secara otomatis.
                  </p>
                </div>
              ) : (
                <>
                  {/* Search & Sort Controls */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={profitSearch}
                        onChange={(e) => setProfitSearch(e.target.value)}
                        placeholder="Cari nama produk atau kategori..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                      <span className="text-slate-500 font-semibold flex items-center gap-1 mr-0.5">
                        <ArrowUpDown className="w-3 h-3" />
                        <span>Urutkan:</span>
                      </span>
                      {[
                        { id: 'PROFIT', label: 'Laba Tertinggi' },
                        { id: 'MARGIN', label: 'Margin %' },
                        { id: 'REVENUE', label: 'Omzet' },
                        { id: 'QTY', label: 'Unit Terjual' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setProfitSortBy(opt.id as 'PROFIT' | 'REVENUE' | 'MARGIN' | 'QTY');
                          }}
                          className={`px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer ${
                            profitSortBy === opt.id
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Per-Product FIFO Gross Profit Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200 sticky top-0 z-10">
                          <tr>
                            <th className="py-2.5 px-3">Produk</th>
                            <th className="py-2.5 px-3 text-right">Terjual</th>
                            <th className="py-2.5 px-3 text-right">Omzet</th>
                            <th className="py-2.5 px-3 text-right">HPP FIFO</th>
                            <th className="py-2.5 px-3 text-right">Laba Kotor</th>
                            <th className="py-2.5 px-3 text-right">Margin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {fifoGrossProfitSummary.rows.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="py-6 text-center text-slate-400 text-xs">
                                Tidak ada produk yang cocok dengan pencarian &ldquo;{profitSearch}&rdquo;.
                              </td>
                            </tr>
                          ) : (
                            fifoGrossProfitSummary.rows.map((row, idx) => {
                              const catColor = getCategoryColor(row.category, categories, row.product);
                              const isPositive = row.grossProfit >= 0;
                              return (
                                <tr key={row.productId} className="hover:bg-emerald-50/30 transition-colors">
                                  <td className="py-2.5 px-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="w-5 h-5 rounded-md bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                                        {idx + 1}
                                      </span>
                                      <div className="min-w-0">
                                        <div className="font-bold text-slate-900 truncate flex items-center gap-1.5">
                                          <span>{row.productName}</span>
                                          {row.isService && (
                                            <span className="px-1 py-0.2 rounded bg-purple-100 text-purple-700 text-[9px] font-bold">
                                              JASA
                                            </span>
                                          )}
                                          {row.fifoBatchItemCount > 0 && (
                                            <span
                                              className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold inline-flex items-center gap-0.5"
                                              title={`${row.fifoBatchItemCount} dari ${row.totalLineItems} item transaksi menggunakan catatan batch FIFO`}
                                            >
                                              <Layers className="w-2.5 h-2.5" />
                                              <span>FIFO</span>
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span
                                            className="inline-flex items-center gap-1 text-[10px] font-semibold"
                                            style={{ color: catColor }}
                                          >
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: catColor }} />
                                            <span>{row.category}</span>
                                          </span>
                                          <span className="text-[10px] text-slate-400">&middot; {row.txCount} trx</span>
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 whitespace-nowrap">
                                    {formatNumber(row.unitsSold)} {row.baseUnit}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
                                    {formatRupiah(row.totalRevenue)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                                    <div>{formatRupiah(row.totalFifoCogs)}</div>
                                    {row.unitsSold > 0 && (
                                      <div className="text-[9.5px] text-slate-400">
                                        @{formatRupiah(row.avgFifoCostPerUnit)}/{row.baseUnit}
                                      </div>
                                    )}
                                  </td>
                                  <td className={`py-2.5 px-3 text-right font-mono font-black whitespace-nowrap ${
                                    isPositive ? 'text-emerald-700' : 'text-rose-600'
                                  }`}>
                                    {formatRupiah(row.grossProfit)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    <span className={`inline-block px-2 py-0.5 rounded-md font-mono font-bold text-[10.5px] ${
                                      row.marginPercent >= 25
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : row.marginPercent >= 10
                                        ? 'bg-sky-100 text-sky-800'
                                        : row.marginPercent >= 0
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}>
                                      {row.marginPercent.toFixed(1)}%
                                    </span>
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

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                <span>Dihitung dari selisih omzet penjualan terhadap HPP batch FIFO aktual per transaksi.</span>
                <span className="font-semibold text-slate-700">Metode Akuntansi: FIFO</span>
              </div>
            </div>
          )}
        </div>

        {/* Filter & Search Bar with Color-coded category tags & Type Switcher */}
        <div className="bg-white p-3 md:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          {/* Top Row: Type Tabs (Semua, Barang Fisik, Jasa/Layanan) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setProductTypeFilter('ALL');
                    setShowLowStockOnly(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    productTypeFilter === 'ALL' && !showLowStockOnly
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semua Item ({products.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setProductTypeFilter('BARANG');
                    setShowLowStockOnly(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    productTypeFilter === 'BARANG' && !showLowStockOnly
                      ? 'bg-white text-sky-800 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="w-3.5 h-3.5 text-sky-600" />
                  <span>Barang Fisik ({physicalProductsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setProductTypeFilter('JASA');
                    setShowLowStockOnly(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    productTypeFilter === 'JASA' && !showLowStockOnly
                      ? 'bg-purple-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-purple-700'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>Jasa &amp; Layanan ({serviceProductsCount})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setShowLowStockOnly((prev) => !prev);
                  if (!showLowStockOnly) setProductTypeFilter('BARANG');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                  showLowStockOnly
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : lowStockProductsCount > 0
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Stok Menipis</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  showLowStockOnly
                    ? 'bg-white text-rose-600'
                    : lowStockProductsCount > 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {lowStockProductsCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setShowLowMarginOnly((prev) => !prev);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  showLowMarginOnly
                    ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                    : lowMarginSummary.count > 0
                    ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                }`}
                title="Saring produk dengan margin keuntungan di bawah 2%"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Margin &lt; 2%</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  showLowMarginOnly
                    ? 'bg-white text-amber-700'
                    : lowMarginSummary.count > 0
                    ? 'bg-amber-600 text-white'
                    : 'bg-slate-200 text-slate-600'
                }`}>
                  {lowMarginSummary.count}
                </span>
              </button>
            </div>

            <div className="text-xs text-slate-500 font-semibold self-end sm:self-auto">
              Total: <span className="font-bold text-slate-800">{filteredProducts.length}</span> item
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama produk / jasa, barcode, kategori, teknisi, atau satuan..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Category Dropdown Filter */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div
                className={`flex items-center gap-1.5 border px-3 py-2 rounded-xl text-xs transition-colors ${
                  selectedCategory !== 'SEMUA'
                    ? 'bg-sky-50 border-sky-300 text-sky-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <Filter
                  className={`w-3.5 h-3.5 shrink-0 ${
                    selectedCategory !== 'SEMUA' ? 'text-sky-600' : 'text-slate-400'
                  }`}
                />
                <span className="text-slate-500 font-bold whitespace-nowrap">Kategori:</span>
                <select
                  aria-label="Filter Kategori Produk"
                  value={selectedCategory}
                  onChange={(e) => {
                    sound.playTap();
                    setSelectedCategory(e.target.value);
                  }}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer max-w-[180px]"
                >
                  <option value="SEMUA">Semua Kategori ({products.length})</option>
                  {categoryNamesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat} ({categoryCountMap.get(cat.toLowerCase()) || 0})
                    </option>
                  ))}
                </select>
              </div>

              <div
                className={`flex items-center gap-1.5 border px-3 py-2 rounded-xl text-xs transition-colors ${
                  sortField !== 'DEFAULT'
                    ? 'bg-sky-50 border-sky-300 text-sky-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <ArrowUpDown
                  className={`w-3.5 h-3.5 shrink-0 ${
                    sortField !== 'DEFAULT' ? 'text-sky-600' : 'text-slate-400'
                  }`}
                />
                <span className="text-slate-500 font-bold">Urutkan:</span>
                <select
                  aria-label="Urutkan Daftar Barang"
                  value={sortField}
                  onChange={(e) => {
                    sound.playTap();
                    const next = e.target.value as 'DEFAULT' | 'SKU' | 'NAME' | 'CATEGORY' | 'STOCK';
                    setSortField(next);
                    if (next === 'DEFAULT') setSortDirection('asc');
                  }}
                  className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="DEFAULT">Default</option>
                  <option value="SKU">SKU</option>
                  <option value="NAME">Produk</option>
                  <option value="CATEGORY">Kategori</option>
                  <option value="STOCK">Stok Dasar</option>
                </select>
              </div>

              {sortField !== 'DEFAULT' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    }}
                    title="Ubah arah urutan"
                    className="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-slate-700 transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    {sortDirection === 'asc' ? (
                      <>
                        <ChevronUp className="w-3.5 h-3.5 text-sky-600" />
                        <span>{sortField === 'STOCK' ? 'Terkecil' : 'A → Z'}</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-3.5 h-3.5 text-sky-600" />
                        <span>{sortField === 'STOCK' ? 'Terbesar' : 'Z → A'}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setSortField('DEFAULT');
                      setSortDirection('asc');
                    }}
                    title="Reset urutan"
                    className="p-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Color-coded category filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              <span>Kategori:</span>
            </span>

            {filterTabs.map((cat) => {
              const isSelected = selectedCategory === cat;
              const catColor = cat === 'SEMUA' ? '#0284c7' : getCategoryColor(cat, categories);
              const count =
                cat === 'SEMUA'
                  ? products.length
                  : categoryCountMap.get(cat.toLowerCase()) || 0;

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
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {cat !== 'SEMUA' && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: isSelected ? '#ffffff' : catColor,
                      }}
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
        </div>

        {/* Automated Margin Warning Banner (< 2%) */}
        {lowMarginSummary.count > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-600 text-white shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs md:text-sm font-bold text-amber-950">
                    Peringatan Margin Tipis: {lowMarginSummary.count} Produk Memiliki Margin Keuntungan &lt; 2%
                  </div>
                  <p className="text-xs text-amber-900 mt-0.5 tabular-nums">
                    {lowMarginSummary.lossCount > 0 && (
                      <>
                        <strong className="text-rose-700">{lowMarginSummary.lossCount} produk berpotensi rugi (margin ≤ 0%)</strong>
                        {lowMarginSummary.thinCount > 0 ? ' dan ' : '. '}
                      </>
                    )}
                    {lowMarginSummary.thinCount > 0 && (
                      <>
                        <strong>{lowMarginSummary.thinCount} produk bermargin tipis (0–2%)</strong>.
                      </>
                    )}{' '}
                    Klik produk di bawah atau tombol &ldquo;Sesuaikan Harga&rdquo; pada tabel untuk memperbarui harga jual.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setShowLowMarginOnly((prev) => !prev);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-colors ${
                    showLowMarginOnly
                      ? 'bg-slate-900 text-white hover:bg-slate-800'
                      : 'bg-amber-600 hover:bg-amber-700 text-white'
                  }`}
                >
                  {showLowMarginOnly ? 'Tampilkan Semua Produk' : `Saring ${lowMarginSummary.count} Produk (< 2%)`}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-amber-200/70">
              {lowMarginSummary.items.slice(0, 5).map(({ product: lp, eval: ev }) => (
                <button
                  key={lp.id}
                  type="button"
                  onClick={() => openEditModal(lp)}
                  className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    ev.isLoss
                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200'
                      : 'bg-white hover:bg-amber-100 text-amber-900 border-amber-200'
                  }`}
                  title={`Klik untuk menyesuaikan harga jual ${lp.name}`}
                >
                  <span className="truncate max-w-[160px]">{lp.name}</span>
                  <span className="font-mono tabular-nums">
                    ({ev.worstMarginPercent.toFixed(1)}%)
                  </span>
                </button>
              ))}
              {lowMarginSummary.items.length > 5 && (
                <span className="text-[11px] font-semibold text-amber-800 px-1.5">
                  +{lowMarginSummary.items.length - 5} produk lainnya
                </span>
              )}
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="py-3 px-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleToggleSortField('NAME')}
                        className={`inline-flex items-center gap-1 uppercase transition-colors cursor-pointer ${
                          sortField === 'NAME' ? 'text-sky-700 font-black' : 'hover:text-slate-900'
                        }`}
                      >
                        <span>Produk</span>
                        {sortField === 'NAME' ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 text-sky-600" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-sky-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        )}
                      </button>
                      <span className="text-slate-300">/</span>
                      <button
                        type="button"
                        onClick={() => handleToggleSortField('SKU')}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] uppercase transition-colors cursor-pointer ${
                          sortField === 'SKU'
                            ? 'bg-sky-100 border-sky-300 text-sky-800 font-black'
                            : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <span>SKU</span>
                        {sortField === 'SKU' ? (
                          sortDirection === 'asc' ? (
                            <ChevronUp className="w-3 h-3 text-sky-600" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-sky-600" />
                          )
                        ) : (
                          <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                        )}
                      </button>
                    </div>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleToggleSortField('CATEGORY')}
                      className={`inline-flex items-center gap-1 uppercase transition-colors cursor-pointer ${
                        sortField === 'CATEGORY' ? 'text-sky-700 font-black' : 'hover:text-slate-900'
                      }`}
                    >
                      <span>Kategori Berwarna</span>
                      {sortField === 'CATEGORY' ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5 text-sky-600" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-sky-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => handleToggleSortField('STOCK')}
                      className={`inline-flex items-center gap-1 uppercase transition-colors cursor-pointer ${
                        sortField === 'STOCK' ? 'text-sky-700 font-black' : 'hover:text-slate-900'
                      }`}
                    >
                      <span>Stok Dasar</span>
                      {sortField === 'STOCK' ? (
                        sortDirection === 'asc' ? (
                          <ChevronUp className="w-3.5 h-3.5 text-sky-600" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-sky-600" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">Multi Satuan & Harga Jual</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Package className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-700">Tidak ada produk ditemukan</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Sesuaikan kata kunci pencarian atau ganti filter kategori di atas.
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedProducts.map((prod) => {
                    const isLow = prod.stockInBaseUnit <= prod.minStockAlert;
                    const catColor = getCategoryColor(prod.category, categories, prod);
                    const marginEval = lowMarginSummary.map.get(prod.id);
                    const isLowMargin = Boolean(marginEval?.isLowMargin);
                    const isLossMargin = Boolean(marginEval?.isLoss);

                    return (
                      <tr
                        key={prod.id}
                        className={`transition-colors ${
                          isLossMargin
                            ? 'bg-rose-50/60 hover:bg-rose-50/90'
                            : isLowMargin
                            ? 'bg-amber-50/60 hover:bg-amber-50/90'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {/* Product Name & Barcode */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div 
                              onClick={() => handleQuickCamera(prod)}
                              title="Klik untuk ambil/ganti foto profil dengan kamera"
                              className="relative group/thumb w-10 h-10 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200/60 cursor-pointer shadow-2xs"
                            >
                              <LazyProductImage
                                src={prod.imageUrl}
                                alt={prod.name}
                                className="w-full h-full object-cover"
                                containerClassName="w-full h-full relative"
                                unloadFarOffscreen={true}
                                fallback={
                                  <div
                                    className="w-full h-full flex items-center justify-center font-bold text-xs"
                                    style={{
                                      backgroundColor: `${catColor}15`,
                                      color: catColor,
                                    }}
                                  >
                                    {prod.name.charAt(0)}
                                  </div>
                                }
                              />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Camera className="w-4 h-4" />
                              </div>
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900">{prod.name}</span>
                                {prod.discountPercent && prod.discountPercent > 0 && (
                                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1 tabular-nums">
                                    <span>-{prod.discountPercent}% {prod.promoLabel || 'PROMO'}</span>
                                  </span>
                                )}
                                {prod.productType === 'JASA' && (
                                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-black bg-purple-100 text-purple-800 border border-purple-200 inline-flex items-center gap-1 shadow-2xs">
                                    <Wrench className="w-2.5 h-2.5 text-purple-600" />
                                    <span>JASA</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 mt-0.5 flex-wrap">
                                <div className="flex items-center gap-1">
                                  <Barcode className="w-3.5 h-3.5 text-slate-500" />
                                  <span>SKU: {prod.sku || prod.barcode}</span>
                                </div>
                                {prod.variants && prod.variants.length > 0 && (
                                  <span className="px-1.5 py-0.2 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-sans font-bold flex items-center gap-1">
                                    <Sliders className="w-2.5 h-2.5" />
                                    <span>{prod.variants.length} {prod.variantLabel || 'Varian'} ({prod.variants.map((v) => v.name).slice(0, 3).join(', ')}{prod.variants.length > 3 ? '...' : ''})</span>
                                  </span>
                                )}
                                {prod.technicianName && (
                                  <span className="text-slate-600 font-sans flex items-center gap-1 font-medium">
                                    <UserCheck className="w-3 h-3 text-slate-500" />
                                    <span>{prod.technicianName}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Color-Coded Category Badge */}
                        <td className="py-3 px-4">
                          <span
                            style={{
                              backgroundColor: `${catColor}14`,
                              color: catColor,
                              borderColor: `${catColor}35`,
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                              style={{ backgroundColor: catColor }}
                            />
                            <span>{prod.category}</span>
                          </span>
                        </td>

                        {/* Stock in Base Unit / Service Non-Stock Indicator */}
                        <td className="py-3 px-4">
                          {prod.productType === 'JASA' ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 font-bold text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                                <span>Non-Stok (∞)</span>
                              </span>
                              <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                {prod.serviceDurationMinutes ? (
                                  <span className="flex items-center gap-0.5 font-medium">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <span>{prod.serviceDurationMinutes} Mnt</span>
                                  </span>
                                ) : (
                                  <span>Layanan Bebas Stok</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="font-mono font-bold text-slate-800">
                                {formatNumber(prod.stockInBaseUnit)} {prod.baseUnit}
                              </div>
                              {isLow && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                                  <AlertTriangle className="w-3 h-3" />
                                  Min. {prod.minStockAlert}
                                </span>
                              )}
                              {prod.expiryDate && (
                                <div className="mt-1">
                                  {(() => {
                                    const expDate = new Date(prod.expiryDate);
                                    const today = new Date();
                                    today.setHours(0, 0, 0, 0);
                                    const isExpired = expDate < today;
                                    const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                    const isNearExpiry = diffDays <= 30;

                                    return (
                                      <span
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                          isExpired
                                            ? 'bg-rose-100 text-rose-700 font-black border border-rose-200'
                                            : isNearExpiry
                                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                            : 'bg-slate-100 text-slate-600'
                                        }`}
                                        title={`Tanggal Kadaluarsa: ${prod.expiryDate}`}
                                      >
                                        <CalendarDays className="w-2.5 h-2.5" />
                                        <span>
                                          {isExpired ? 'EXPIRED' : isNearExpiry ? `Exp: ${diffDays}hr` : prod.expiryDate}
                                        </span>
                                      </span>
                                    );
                                  })()}
                                </div>
                              )}
                            </>
                          )}
                        </td>

                        {/* Multi Units & Service Tariffs Breakdown */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {prod.units.map((u) => {
                              const unitEval = marginEval?.unitMap.get(u.id);
                              return (
                                <div key={u.id} className="flex items-center gap-2 text-xs flex-wrap">
                                  <span className={`px-1.5 py-0.5 rounded font-mono font-bold ${
                                    prod.productType === 'JASA'
                                      ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {u.unitName}
                                  </span>
                                  {prod.productType !== 'JASA' && u.conversionFactor > 1 && (
                                    <span className="text-[11px] text-slate-400">
                                      ({u.conversionFactor} {prod.baseUnit})
                                    </span>
                                  )}
                                  <span className={`font-mono font-bold ${
                                    prod.productType === 'JASA' ? 'text-purple-700' : 'text-sky-700'
                                  }`}>
                                    {formatRupiah(u.sellingPrice)}
                                  </span>
                                  {unitEval && (
                                    <span
                                      className={`text-[10.5px] font-mono tabular-nums font-bold ${
                                        unitEval.isLoss
                                          ? 'text-rose-700'
                                          : unitEval.isLowMargin
                                          ? 'text-amber-700'
                                          : 'text-emerald-700'
                                      }`}
                                      title={`Modal ${formatRupiah(unitEval.costPrice)} • Laba ${formatRupiah(unitEval.profitPerUnit)}/${u.unitName}`}
                                    >
                                      {unitEval.isLoss
                                        ? `Rugi (${unitEval.marginPercent.toFixed(1)}%)`
                                        : unitEval.isLowMargin
                                        ? `Margin < 2% (${unitEval.marginPercent.toFixed(1)}%)`
                                        : `Margin ${unitEval.marginPercent.toFixed(1)}%`}
                                    </span>
                                  )}
                                  {u.barcode && (
                                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-0.5 bg-slate-50 px-1 py-0.2 rounded border border-slate-200" title={`Barcode Satuan: ${u.barcode}`}>
                                      <Barcode className="w-2.5 h-2.5" />
                                      <span>{u.barcode}</span>
                                    </span>
                                  )}
                                  {prod.productType === 'JASA' && u.costPrice ? (
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      (Komisi: {formatRupiah(u.costPrice)})
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}

                            {/* Badges Harga Khusus Pelanggan */}
                            {prod.customerPrices && prod.customerPrices.length > 0 && (
                              <div className="pt-1 flex flex-wrap gap-1">
                                {prod.customerPrices.map((cp, idx) => {
                                  const catColorVal = customerCategoryColorMap.get(cp.customerCategory.toUpperCase());
                                  const badge = getCustomerCategoryBadge(cp.customerCategory, catColorVal);
                                  const minQty = cp.minQuantity && cp.minQuantity > 1 ? cp.minQuantity : 1;
                                  return (
                                    <span
                                      key={cp.id || idx}
                                      className={`inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${badge.bg} ${badge.text} ${badge.border}`}
                                      title={`Harga Khusus ${cp.customerCategory}: ${formatRupiah(cp.price)} (${cp.unitName || prod.baseUnit})${minQty > 1 ? ` — Berlaku mulai beli ${minQty} ${cp.unitName || prod.baseUnit}` : ''}`}
                                    >
                                      <span className={`w-1 h-1 rounded-full ${badge.dot}`} />
                                      <span>
                                        {cp.customerCategory}: {formatRupiah(cp.price)}
                                        {minQty > 1 ? ` (≥${minQty} ${cp.unitName || prod.baseUnit})` : ''}
                                      </span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isLowMargin && (
                              <button
                                type="button"
                                onClick={() => openEditModal(prod)}
                                title="Sesuaikan harga jual karena margin keuntungan di bawah 2%"
                                className="px-2 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10.5px] font-bold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Sesuaikan Harga</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setPriceHistoryProductFilter(prod.id);
                                setPriceHistoryDirectionFilter('ALL');
                                setPriceHistorySearch('');
                                setActiveTab('PRICE_HISTORY');
                              }}
                              title="Lihat Riwayat Perubahan Harga & Margin Produk Ini"
                              className="px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200 hover:border-sky-200 text-[10.5px] font-bold flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">Riwayat</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setSkuQrProduct(prod);
                              }}
                              title="Generate & Unduh QR Code Label SKU"
                              className="px-2 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10.5px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span className="hidden xl:inline">QR SKU</span>
                            </button>
                            <button
                              onClick={() => handleQuickCamera(prod)}
                              title="Ambil / Ganti Foto Profil Produk via Kamera"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                            >
                              <Camera className="w-4 h-4 text-emerald-600" />
                            </button>
                            <button
                              onClick={() => openEditModal(prod)}
                              title="Edit Produk & Satuan"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setProductToDelete(prod);
                              }}
                              title="Hapus Produk"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
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

          {filteredProducts.length > 0 && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span>
                  Menampilkan{' '}
                  <strong className="text-slate-900">
                    {(safeCurrentPage - 1) * pageSize + 1}–{Math.min(safeCurrentPage * pageSize, filteredProducts.length)}
                  </strong>{' '}
                  dari <strong className="text-slate-900">{filteredProducts.length}</strong> produk
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) as 25 | 50 | 100)}
                  className="px-2 py-1 rounded-lg border border-slate-300 bg-white font-bold text-slate-700"
                >
                  <option value={25}>25 / hal</option>
                  <option value={50}>50 / hal</option>
                  <option value={100}>100 / hal</option>
                </select>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => {
                      sound.playTap();
                      setCurrentPage((p) => Math.max(1, p - 1));
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                  >
                    Sebelumnya
                  </button>
                  <span className="px-2.5 font-mono font-bold text-slate-800">
                    Hal {safeCurrentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => {
                      sound.playTap();
                      setCurrentPage((p) => Math.min(totalPages, p + 1));
                    }}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-bold cursor-pointer"
                  >
                    Berikutnya
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
          </>
        ) : (
          <div className="space-y-5">
            {/* 4-Card KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500">Total Log Perubahan</div>
                <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                  {formatNumber(priceHistoryStats.total)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Catatan perubahan katalog &amp; harga kasir
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500">Harga Naik / Turun</div>
                <div className="flex items-baseline gap-2.5 mt-1 font-mono tabular-nums">
                  <span className="text-xl font-bold text-emerald-700 flex items-center gap-0.5">
                    <ArrowUpRight className="w-4 h-4" />
                    {formatNumber(priceHistoryStats.upCount)}
                  </span>
                  <span className="text-slate-300">/</span>
                  <span className="text-xl font-bold text-rose-700 flex items-center gap-0.5">
                    <ArrowDownRight className="w-4 h-4" />
                    {formatNumber(priceHistoryStats.downCount)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Frekuensi kenaikan vs penurunan harga
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500">Rata-rata Fluktuasi Margin</div>
                <div
                  className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                    priceHistoryStats.avgMarginDelta > 0
                      ? 'text-emerald-700'
                      : priceHistoryStats.avgMarginDelta < 0
                      ? 'text-rose-700'
                      : 'text-slate-900'
                  }`}
                >
                  {priceHistoryStats.avgMarginDelta >= 0 ? '+' : ''}
                  {priceHistoryStats.avgMarginDelta.toFixed(1)}%
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Rata-rata pergeseran persentase margin
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500">Produk Margin Tipis (&lt;10%)</div>
                <div
                  className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
                    priceHistoryStats.thinMarginProductsCount > 0 ? 'text-amber-700' : 'text-slate-900'
                  }`}
                >
                  {formatNumber(priceHistoryStats.thinMarginProductsCount)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Produk aktif perlu evaluasi harga jual
                </div>
              </div>
            </div>

            {/* Filter & Export Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  <div className="relative flex-1 min-w-[210px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={priceHistorySearch}
                      onChange={(e) => setPriceHistorySearch(e.target.value)}
                      placeholder="Cari nama produk, SKU, pelaku, atau alasan..."
                      className="w-full pl-9 pr-3 py-2 text-xs md:text-sm border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <select
                    value={priceHistoryProductFilter}
                    onChange={(e) => setPriceHistoryProductFilter(e.target.value)}
                    className="px-3 py-2 text-xs md:text-sm border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:border-sky-500 focus:outline-none max-w-[230px]"
                  >
                    <option value="ALL">Semua Produk ({priceHistoryProductOptions.length})</option>
                    {priceHistoryProductOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={priceHistoryDirectionFilter}
                    onChange={(e) => setPriceHistoryDirectionFilter(e.target.value as any)}
                    className="px-3 py-2 text-xs md:text-sm border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:border-sky-500 focus:outline-none"
                  >
                    <option value="ALL">Semua Jenis Perubahan</option>
                    <option value="NAIK">Harga Naik</option>
                    <option value="TURUN">Harga Turun</option>
                    <option value="MODAL_BERUBAH">HPP / Modal Berubah</option>
                    <option value="HARGA_AWAL">Harga Awal Produk</option>
                    <option value="OVERRIDE_KASIR">Override Harga di Kasir</option>
                  </select>

                  <select
                    value={priceHistoryRangeFilter}
                    onChange={(e) => setPriceHistoryRangeFilter(e.target.value as any)}
                    className="px-3 py-2 text-xs md:text-sm border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:border-sky-500 focus:outline-none"
                  >
                    <option value="ALL">Semua Periode</option>
                    <option value="7_DAYS">7 Hari Terakhir</option>
                    <option value="30_DAYS">30 Hari Terakhir</option>
                    <option value="THIS_MONTH">Bulan Ini</option>
                  </select>

                  {(priceHistorySearch ||
                    priceHistoryProductFilter !== 'ALL' ||
                    priceHistoryDirectionFilter !== 'ALL' ||
                    priceHistoryRangeFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setPriceHistorySearch('');
                        setPriceHistoryProductFilter('ALL');
                        setPriceHistoryDirectionFilter('ALL');
                        setPriceHistoryRangeFilter('ALL');
                      }}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleExportPriceHistoryExcel}
                  className="px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-600 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer self-start lg:self-auto"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Ekspor Excel (.XLSX)</span>
                </button>
              </div>
            </div>

            {/* Trend Chart Card */}
            {priceHistoryChartData.length > 0 && (
              <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-sky-600" />
                      <span>
                        {priceHistoryProductFilter !== 'ALL'
                          ? `Tren Harga Jual & Margin: ${
                              productMap.get(priceHistoryProductFilter)?.name || 'Produk Terpilih'
                            }`
                          : 'Ringkasan Fluktuasi Harga & Margin Katalog Terbaru'}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {priceHistoryProductFilter !== 'ALL'
                        ? 'Menampilkan pergerakan harga jual terhadap HPP modal secara kronologis.'
                        : 'Pilih salah satu produk pada filter di atas untuk melihat tren historis khusus per produk.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-sky-600 inline-block" />
                      Harga Jual (Rp)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-slate-400 inline-block" />
                      HPP Modal (Rp)
                    </span>
                  </div>
                </div>

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={priceHistoryChartData} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
                      <defs>
                        <linearGradient id="priceHistorySellFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0284c7" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(val) => `${Math.round(Number(val) / 1000)}rb`}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0',
                          fontSize: '12px',
                          boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
                        }}
                        formatter={(value: any, name: any) => [
                          formatRupiah(Number(value || 0)),
                          name === 'hargaJual' ? 'Harga Jual' : 'HPP Modal',
                        ]}
                        labelFormatter={(lbl, payload: any) => {
                          const p = payload?.[0]?.payload;
                          if (!p) return String(lbl);
                          return `${p.fullDate} · Margin ${p.marginPct.toFixed(1)}% (${formatRupiah(p.marginRp)})`;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="hargaJual"
                        stroke="#0284c7"
                        strokeWidth={2.2}
                        fill="url(#priceHistorySellFill)"
                        dot={{ r: 3.5, fill: '#0284c7' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="hppModal"
                        stroke="#94a3b8"
                        strokeWidth={1.8}
                        fill="transparent"
                        strokeDasharray="4 4"
                        dot={{ r: 3, fill: '#64748b' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Price History Audit Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {filteredPriceHistoryEntries.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto">
                    <History className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-900">
                      {allPriceHistoryEntries.length === 0
                        ? 'Belum Ada Log Perubahan Harga Produk'
                        : 'Tidak Ada Log yang Cocok dengan Filter'}
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      {allPriceHistoryEntries.length === 0
                        ? 'Setiap perubahan harga jual, HPP modal, atau penambahan produk baru akan otomatis tercatat di sini lengkap dengan fluktuasi marginnya.'
                        : 'Coba ubah kata kunci pencarian, periode, atau reset filter produk di atas.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setActiveTab('CATALOG');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>Kembali ke Daftar Produk</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-4">Waktu &amp; Pelaku</th>
                        <th className="py-3 px-4">Produk / Satuan</th>
                        <th className="py-3 px-4">Perubahan Harga Jual</th>
                        <th className="py-3 px-4">HPP / Modal</th>
                        <th className="py-3 px-4">Fluktuasi Margin</th>
                        <th className="py-3 px-4">Keterangan / Alasan</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredPriceHistoryEntries.map((entry) => {
                        const dirBadge =
                          entry.changeDirection === 'NAIK'
                            ? { label: 'Harga Naik', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                            : entry.changeDirection === 'TURUN'
                            ? { label: 'Harga Turun', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
                            : entry.changeDirection === 'MODAL_BERUBAH'
                            ? { label: 'HPP Berubah', cls: 'bg-amber-50 text-amber-800 border-amber-200' }
                            : entry.changeDirection === 'HARGA_AWAL'
                            ? { label: 'Harga Awal', cls: 'bg-sky-50 text-sky-700 border-sky-200' }
                            : { label: 'Override Kasir', cls: 'bg-purple-50 text-purple-700 border-purple-200' };

                        return (
                          <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 whitespace-nowrap align-top">
                              <div className="font-mono tabular-nums font-semibold text-slate-900">
                                {formatDateTime(entry.timestamp)}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                {entry.actorName} · <span className="font-semibold">{entry.actorRole}</span>
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top">
                              <div className="font-bold text-slate-900">{entry.productName}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[11px] text-slate-500">
                                <span className="font-mono">{entry.sku}</span>
                                <span>·</span>
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold">
                                  {entry.unitName}
                                </span>
                                {entry.variantName && (
                                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-semibold">
                                    {entry.variantName}
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap align-top font-mono tabular-nums">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-400 line-through">
                                  {formatRupiah(entry.oldSellingPrice)}
                                </span>
                                <span className="text-slate-400">→</span>
                                <span className="font-bold text-slate-900">
                                  {formatRupiah(entry.newSellingPrice)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border ${dirBadge.cls}`}>
                                  {dirBadge.label}
                                </span>
                                {entry.priceDelta !== 0 && entry.changeDirection !== 'HARGA_AWAL' && (
                                  <span
                                    className={`text-[11px] font-bold ${
                                      entry.priceDelta > 0 ? 'text-emerald-700' : 'text-rose-700'
                                    }`}
                                  >
                                    {entry.priceDelta > 0 ? '+' : ''}
                                    {formatRupiah(entry.priceDelta)} ({entry.priceDeltaPercent >= 0 ? '+' : ''}
                                    {entry.priceDeltaPercent.toFixed(1)}%)
                                  </span>
                                )}
                              </div>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap align-top font-mono tabular-nums">
                              {entry.oldCostPrice !== entry.newCostPrice ? (
                                <div>
                                  <div className="text-slate-400 line-through text-[11px]">
                                    {formatRupiah(entry.oldCostPrice)}
                                  </div>
                                  <div className="font-semibold text-slate-800">
                                    {formatRupiah(entry.newCostPrice)}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-700 font-semibold">
                                  {formatRupiah(entry.newCostPrice)}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap align-top font-mono tabular-nums">
                              <div className="flex items-center gap-1 font-bold">
                                {entry.changeDirection === 'HARGA_AWAL' ? (
                                  <span className="text-sky-700">
                                    {entry.newMarginPercent.toFixed(1)}% ({formatRupiah(entry.newMarginRupiah)})
                                  </span>
                                ) : (
                                  <>
                                    <span className="text-slate-500 font-normal">
                                      {entry.oldMarginPercent.toFixed(1)}%
                                    </span>
                                    <span className="text-slate-400">→</span>
                                    <span
                                      className={
                                        entry.newMarginPercent < 10
                                          ? 'text-amber-700'
                                          : entry.marginDeltaPercent >= 0
                                          ? 'text-emerald-700'
                                          : 'text-rose-700'
                                      }
                                    >
                                      {entry.newMarginPercent.toFixed(1)}%
                                    </span>
                                  </>
                                )}
                              </div>
                              {entry.changeDirection !== 'HARGA_AWAL' && (
                                <div
                                  className={`text-[11px] font-bold flex items-center gap-0.5 mt-0.5 ${
                                    entry.marginDeltaPercent > 0
                                      ? 'text-emerald-700'
                                      : entry.marginDeltaPercent < 0
                                      ? 'text-rose-700'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {entry.marginDeltaPercent > 0 ? (
                                    <TrendingUp className="w-3 h-3" />
                                  ) : entry.marginDeltaPercent < 0 ? (
                                    <TrendingDown className="w-3 h-3" />
                                  ) : (
                                    <Minus className="w-3 h-3" />
                                  )}
                                  <span>
                                    {entry.marginDeltaPercent >= 0 ? '+' : ''}
                                    {entry.marginDeltaPercent.toFixed(1)}% · {formatRupiah(entry.newMarginRupiah)}
                                  </span>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 align-top max-w-[260px]">
                              <p className="text-slate-700 leading-snug break-words">{entry.reason}</p>
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                              {entry.productId && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    setPriceHistoryProductFilter(
                                      priceHistoryProductFilter === entry.productId ? 'ALL' : entry.productId
                                    );
                                  }}
                                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                    priceHistoryProductFilter === entry.productId
                                      ? 'bg-sky-600 text-white border-sky-600'
                                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  <Filter className="w-3 h-3" />
                                  <span>
                                    {priceHistoryProductFilter === entry.productId ? 'Semua' : 'Tren Produk'}
                                  </span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: PRODUCT ADD / EDIT MODAL WITH COLOR-CODED CATEGORY PICKER        */}
      {/* ========================================================================= */}
      {(editingProduct || isAddingNew) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  {productType === 'JASA' ? (
                    <>
                      <Wrench className="w-5 h-5 text-purple-600" />
                      <span>{isAddingNew ? 'Input Jasa & Layanan Baru' : `Edit Jasa: ${editingProduct?.name}`}</span>
                    </>
                  ) : (
                    <>
                      <Package className="w-5 h-5 text-sky-600" />
                      <span>{isAddingNew ? 'Tambah Master Produk Baru' : `Edit Produk: ${editingProduct?.name}`}</span>
                    </>
                  )}
                </h3>
                <p className="text-xs text-slate-500">
                  {productType === 'JASA'
                    ? 'Input data layanan, tarif jasa per sesi/jam/paket, dan komisi atau biaya operasional.'
                    : 'Lengkapi data produk, kategori berwarna, stok gudang, dan konversi multi-satuan.'}
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingProduct(null);
                  setIsAddingNew(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Type Switcher: Barang Fisik vs Jasa & Layanan */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200 mt-3">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setProductType('BARANG');
                  if (baseUnit === 'SESI' || baseUnit === 'JAM' || baseUnit === 'KALI') setBaseUnit('PCS');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  productType === 'BARANG'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-extrabold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Package className="w-4 h-4 text-sky-600" />
                <span>Barang Fisik (Stok Gudang)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setProductType('JASA');
                  if (baseUnit === 'PCS') setBaseUnit('SESI');
                  setStockInBaseUnit('99999');
                  setMinStockAlert('0');
                }}
                className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  productType === 'JASA'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs font-extrabold'
                    : 'text-slate-600 hover:text-purple-700'
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>Jasa &amp; Layanan (Non-Stok)</span>
              </button>
            </div>

            {productType === 'JASA' && (
              <div className="p-3 bg-purple-50/90 border border-purple-200 rounded-2xl flex items-start gap-2.5 text-xs text-purple-900 mt-2.5">
                <Wrench className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Layanan Non-Stok:</span> Jasa tidak memerlukan penghitungan stok gudang. Sistem otomatis menetapkan stok tidak terbatas (unlimited) tanpa peringatan stok habis.
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="py-4 space-y-4">
              {/* Row 1: Name & Barcode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    {productType === 'JASA' ? 'Nama Jasa / Layanan *' : 'Nama Produk *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={productType === 'JASA' ? 'Contoh: Jasa Servis Ringan, Ongkir, Cuci AC' : 'Contoh: Kopi Kapal Api Mix 24g'}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span>{productType === 'JASA' ? 'Kode Jasa' : 'SKU (Stock Keeping Unit)'}</span>
                      <span className="text-[10px] text-slate-400 font-normal">Wajib Unik</span>
                    </label>
                    <div className="flex items-center gap-2">
                      {nextSuggestedSku && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setBarcode(nextSuggestedSku);
                          }}
                          className="text-[10px] font-bold text-sky-600 hover:text-sky-700 hover:underline cursor-pointer flex items-center gap-1 bg-sky-50 px-2 py-0.5 rounded border border-sky-200"
                          title="Klik untuk mengisi otomatis kode SKU urutan berikutnya"
                        >
                          <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                          <span>Gunakan SKU Urut: <strong>{nextSuggestedSku}</strong></span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setScanningUnitIndex(-1);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center gap-1 cursor-pointer border border-slate-200"
                        title="Scan Barcode / SKU dengan Kamera atau Scanner Fisik"
                      >
                        <Camera className="w-3 h-3 text-slate-600" />
                        <span>Scan</span>
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder={nextSuggestedSku ? `Otomatis: ${nextSuggestedSku} (atau ketik SKU manual)` : 'Contoh: SKU-0001'}
                      className={`w-full p-2.5 pr-10 rounded-xl border text-xs md:text-sm font-mono font-bold focus:outline-none transition-colors ${
                        isDuplicateSku
                          ? 'border-rose-500 bg-rose-50/40 text-rose-800 focus:border-rose-600'
                          : 'border-slate-300 focus:border-sky-500 bg-white'
                      }`}
                    />
                    {barcode && (
                      <button
                        type="button"
                        onClick={() => setBarcode('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                        title="Kosongkan kolom SKU"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>Biarkan kosong untuk otomatis menggunakan nomor urut SKU selanjutnya ({nextSuggestedSku})</span>
                  </div>
                  {isDuplicateSku && (
                    <div className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>SKU sudah digunakan oleh produk lain! Harap gunakan SKU yang unik.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Photo & Image Capture Section */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-sky-600" />
                    <span>Foto Profil Produk (Identifikasi Visual POS)</span>
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="text-[11px] font-bold text-rose-500 hover:text-rose-700"
                    >
                      Hapus Foto
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  {/* Photo Preview Thumbnail */}
                  <div className="w-20 h-20 rounded-xl bg-white border border-slate-300 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Preview Produk"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="w-6 h-6 stroke-[1.5]" />
                        <span className="text-[9px] mt-0.5">Tanpa Foto</span>
                      </div>
                    )}
                  </div>

                  {/* Buttons for Camera, File Upload, and URL */}
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Ambil Foto via Kamera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition-colors"
                      >
                        <Upload className="w-4 h-4 text-slate-600" />
                        <span>Pilih Gambar</span>
                      </button>
                    </div>

                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Atau paste link URL gambar langsung..."
                      className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Category Selector with color badge & quick create */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-sky-600" />
                    <span>Pilih Kategori Berwarna *</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setShowInlineCatCreator(!showInlineCatCreator);
                    }}
                    className="text-[11px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showInlineCatCreator ? 'Tutup Kategori Baru' : '+ Buat Kategori Baru'}</span>
                  </button>
                </div>

                {/* Inline Quick Category Creator */}
                {showInlineCatCreator && (
                  <div className="p-3 bg-white rounded-xl border border-sky-200 shadow-2xs space-y-3 animate-in fade-in">
                    <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-sky-600" />
                      <span>Buat Kategori Baru Cepat:</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        placeholder="Nama Kategori (misal: Roti & Kue)"
                        className="p-2 text-xs border border-slate-300 rounded-lg focus:border-sky-500 focus:outline-none font-medium"
                      />

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-1 overflow-x-auto py-1">
                          {CATEGORY_COLOR_PRESETS.slice(0, 8).map((preset) => (
                            <button
                              key={preset.hex}
                              type="button"
                              onClick={() => setInlineCatColor(preset.hex)}
                              style={{ backgroundColor: preset.hex }}
                              className={`w-6 h-6 rounded-full shrink-0 transition-transform ${
                                inlineCatColor === preset.hex ? 'scale-125 ring-2 ring-slate-800 ring-offset-1' : ''
                              }`}
                              title={preset.label}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleCreateInlineCategory}
                          disabled={!inlineCatName.trim()}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shrink-0 shadow-2xs"
                        >
                          Simpan
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Existing categories list radio/badges */}
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                  {mergedCategories.map((cat) => {
                    const isChosen = category.toLowerCase() === cat.name.toLowerCase();
                    const color = cat.color || '#0284c7';
                    return (
                      <button
                        key={cat.id || cat.name}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setCategory(cat.name);
                        }}
                        style={{
                          backgroundColor: isChosen ? color : `${color}14`,
                          color: isChosen ? '#ffffff' : color,
                          borderColor: isChosen ? color : `${color}40`,
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                          isChosen ? 'shadow-xs scale-102' : 'hover:bg-slate-100 opacity-90'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: isChosen ? '#ffffff' : color,
                          }}
                        />
                        <span>{cat.name}</span>
                        {isChosen && <Check className="w-3.5 h-3.5 ml-0.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional Fields based on productType: BARANG vs JASA */}
              {productType === 'JASA' ? (
                <div className="space-y-3 bg-purple-50/70 p-4 rounded-2xl border border-purple-100">
                  <div className="flex items-center gap-2 text-purple-800 text-xs font-bold uppercase tracking-wider">
                    <Wrench className="w-4 h-4 text-purple-600" />
                    <span>Parameter & Spesifikasi Jasa / Layanan</span>
                  </div>

                  {/* Service Row 1: Satuan Layanan & Preset */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Satuan Tarif Layanan *
                    </label>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      {['SESI', 'JAM', 'PAKET', 'KALI', 'ORDER', 'TINDAKAN', 'ORANG'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setBaseUnit(preset);
                            if (units.length > 0) {
                              const copy = [...units];
                              copy[0].unitName = preset;
                              setUnits(copy);
                            }
                          }}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
                            baseUnit.toUpperCase() === preset
                              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      required
                      value={baseUnit}
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        setBaseUnit(val);
                        if (units.length > 0) {
                          const copy = [...units];
                          copy[0].unitName = val;
                          setUnits(copy);
                        }
                      }}
                      placeholder="Misal: SESI, JAM, PAKET"
                      className="w-full p-2.5 rounded-xl border border-purple-200 bg-white text-xs font-bold font-mono focus:border-purple-500 focus:outline-none uppercase"
                    />
                  </div>

                  {/* Service Row 2: Estimasi Durasi & Petugas Default */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                        <Clock className="w-3.5 h-3.5 text-purple-600" />
                        <span>Estimasi Durasi Pengerjaan (Menit)</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={serviceDurationMinutes || ''}
                        onChange={(e) => setServiceDurationMinutes(e.target.value)}
                        placeholder="Contoh: 30, 45, 60 menit"
                        className="w-full p-2.5 rounded-xl border border-purple-200 bg-white text-xs font-mono font-bold focus:border-purple-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Digunakan untuk estimasi antrian dan jadwal pelanggan.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-1">
                        <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                        <span>Teknisi / Petugas Default (Opsional)</span>
                      </label>
                      <input
                        type="text"
                        value={technicianName}
                        onChange={(e) => setTechnicianName(e.target.value)}
                        placeholder="Misal: Budi Santoso / Tim A"
                        className="w-full p-2.5 rounded-xl border border-purple-200 bg-white text-xs focus:border-purple-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Bisa disesuaikan atau diganti saat kasir melayani transaksi.
                      </p>
                    </div>
                  </div>

                  {/* Service Row 3: Biaya Operasional / Komisi Petugas (HPP) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Biaya Operasional / Komisi Petugas (HPP Rp)
                      </label>
                      <input
                        type="number"
                        value={costPrice}
                        onChange={(e) => handleCostPriceChange(e.target.value)}
                        placeholder="0 jika murni jasa tanpa komisi"
                        className="w-full p-2.5 rounded-xl border border-purple-200 bg-white text-xs font-mono focus:border-purple-500 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Biaya material yang terpakai atau komisi per pengerjaan jasa.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        URL Foto / Icon Layanan (Opsional)
                      </label>
                      <input
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full p-2.5 rounded-xl border border-purple-200 bg-white text-xs focus:border-purple-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Service Row 4: Catatan SOP Layanan */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Catatan SOP / Instruksi Layanan (Opsional)
                    </label>
                    <textarea
                      rows={2}
                      value={serviceNotes}
                      onChange={(e) => setServiceNotes(e.target.value)}
                      placeholder="Contoh: Periksa keluhan fisik pelanggan dulu, gunakan alat steril, konfirmasi kepuasan sebelum selesai..."
                      className="w-full p-2.5 rounded-xl border border-purple-200 bg-white text-xs focus:border-purple-500 focus:outline-none resize-none"
                    />
                  </div>

                  {/* Stock notice for service */}
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-purple-100/70 text-purple-900 text-xs">
                    <span className="font-bold">⚡ Non-Stok:</span>
                    <span>Item jasa tidak membatasi kuota stok fisik dan selalu tersedia untuk ditransaksikan di kasir.</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Row 3: Base Unit, Stock, Minimum Alert for Physical Products */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Satuan Dasar *</label>
                      <input
                        type="text"
                        required
                        value={baseUnit}
                        onChange={(e) => {
                          setBaseUnit(e.target.value);
                          if (units.length > 0) {
                            const copy = [...units];
                            copy[0].unitName = e.target.value;
                            setUnits(copy);
                          }
                        }}
                        placeholder="PCS / KG / BUNGKUS"
                        className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-bold font-mono focus:border-sky-500 focus:outline-none uppercase"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Stok Dasar *</label>
                      <input
                        type="number"
                        required
                        value={stockInBaseUnit}
                        onChange={(e) => setStockInBaseUnit(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Batas Peringatan
                      </label>
                      <input
                        type="number"
                        value={minStockAlert}
                        onChange={(e) => setMinStockAlert(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Row 4: Cost Price, Expiry Date & Image URL */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Harga Modal / Beli (Rp)
                      </label>
                      <input
                        type="number"
                        value={costPrice}
                        onChange={(e) => handleCostPriceChange(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1 flex items-center justify-between">
                        <span>Tgl Kadaluarsa</span>
                        <span className="text-[10px] text-slate-400 font-normal">Opsional</span>
                      </label>
                      <input
                        type="date"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        URL Gambar Produk
                      </label>
                      <input
                        type="url"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* MULTI SATUAN / TARIF CONFIGURATOR SECTION */}
              <div className={`p-4 rounded-2xl border space-y-3 ${productType === 'JASA' ? 'bg-purple-50/40 border-purple-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {productType === 'JASA' ? (
                      <Wrench className="w-4 h-4 text-purple-600" />
                    ) : (
                      <Layers className="w-4 h-4 text-sky-600" />
                    )}
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      {productType === 'JASA' ? 'Tarif Layanan & Varian Paket' : 'Konfigurasi Multi Satuan & Harga Jual'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddUnitRow}
                    className={`px-2.5 py-1 rounded-lg text-white font-bold text-xs flex items-center gap-1 shadow-2xs ${
                      productType === 'JASA' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-sky-600 hover:bg-sky-500'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{productType === 'JASA' ? '+ Tambah Opsi / Varian Paket' : '+ Tambah Satuan'}</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {units.map((unit, idx) => (
                    <div
                      key={unit.id || idx}
                      className="p-3 bg-white rounded-xl border border-slate-200 space-y-2.5 shadow-2xs"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                        <div className="md:col-span-5">
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">Nama Satuan</label>
                          <input
                            type="text"
                            required
                            value={unit.unitName}
                            onChange={(e) => handleUnitChange(idx, 'unitName', e.target.value)}
                            placeholder="PCS / PACK / DUS"
                            className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold font-mono focus:border-sky-500 uppercase"
                          />
                        </div>

                        <div className="md:col-span-5">
                          <label className="text-[10px] font-bold text-slate-500 block mb-1">
                            Faktor Konversi (x {baseUnit})
                          </label>
                          <input
                            type="number"
                            min="1"
                            required
                            disabled={idx === 0}
                            value={unit.conversionFactor}
                            onChange={(e) => handleUnitChange(idx, 'conversionFactor', e.target.value)}
                            className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold font-mono focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </div>

                        <div className="md:col-span-2 text-right">
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveUnitRow(idx)}
                              className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Hapus Satuan Ini"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Grid 2 Kolom: Harga Modal / Beli Satuan & Harga Jual Satuan */}
                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] font-bold text-slate-600 block mb-1">
                              {idx === 0 
                                ? 'Harga Modal / Beli Dasar (Rp) *' 
                                : `Harga Beli Satuan ${unit.unitName || ''} (Rp)`}
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={unit.costPrice !== undefined ? unit.costPrice : ''}
                              onChange={(e) => handleUnitChange(idx, 'costPrice', e.target.value)}
                              placeholder="0"
                              className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold font-mono text-emerald-700 bg-emerald-50/40 focus:border-emerald-500 focus:bg-white"
                            />
                            {idx > 0 && (
                              <span className="text-[9px] text-slate-400 mt-0.5 block">
                                Estimasi konversi: {unit.conversionFactor} x Rp {formatNumber(units[0]?.costPrice || 0)} = Rp {formatNumber((units[0]?.costPrice || 0) * (unit.conversionFactor || 1))}
                              </span>
                            )}
                          </div>

                          <div>
                            <label className="text-[10px] font-bold text-slate-600 block mb-1">
                              Harga Jual (Rp) *
                            </label>
                            <input
                              type="number"
                              min="0"
                              required
                              value={unit.sellingPrice !== undefined ? unit.sellingPrice : ''}
                              onChange={(e) => handleUnitChange(idx, 'sellingPrice', e.target.value)}
                              placeholder="0"
                              className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold font-mono text-sky-700 focus:border-sky-500"
                            />
                          </div>
                        </div>

                        {/* Live Margin Indicator & Quick Adjustment Presets */}
                        {(() => {
                          const baseCostNum = Number(units[0]?.costPrice) || Number(costPrice) || 0;
                          const rawCostNum = Number(unit.costPrice) || 0;
                          const effectiveCost =
                            idx === 0
                              ? rawCostNum > 0
                                ? rawCostNum
                                : baseCostNum
                              : rawCostNum > 0
                              ? rawCostNum
                              : Math.round(baseCostNum * (Number(unit.conversionFactor) || 1));
                          const sellNum = Number(unit.sellingPrice) || 0;
                          if (effectiveCost <= 0) return null;

                          const profit = sellNum - effectiveCost;
                          const marginPct = sellNum > 0 ? (profit / sellNum) * 100 : -100;
                          const isThinOrLoss = marginPct < 2;

                          const applyTargetMargin = (targetRate: number) => {
                            sound.playTap();
                            const suggested = Math.ceil(effectiveCost / (1 - targetRate) / 100) * 100;
                            handleUnitChange(idx, 'sellingPrice', String(suggested));
                          };

                          return (
                            <div
                              className={`px-2.5 py-2 rounded-lg border text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                                marginPct <= 0
                                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                                  : isThinOrLoss
                                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                                  : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                              }`}
                            >
                              <div className="font-mono tabular-nums font-bold">
                                Laba: {formatRupiah(profit)} · Margin: {marginPct.toFixed(1)}%
                                {isThinOrLoss && (
                                  <span className="ml-1.5 font-sans font-extrabold">
                                    ({marginPct <= 0 ? 'Rugi — di bawah modal' : 'Peringatan Margin < 2%'})
                                  </span>
                                )}
                              </div>
                              {isThinOrLoss && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => applyTargetMargin(0.05)}
                                    className="px-2 py-0.5 rounded bg-white border border-amber-300 hover:bg-amber-100 text-amber-900 font-bold text-[10px] cursor-pointer"
                                  >
                                    Set Margin 5%
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyTargetMargin(0.1)}
                                    className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] cursor-pointer"
                                  >
                                    Set Margin 10%
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Kolom Barcode Satuan berada tepat di bawah Harga Jual dengan Tombol Scan Kamera / Alat Scanner */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                              <Barcode className="w-3.5 h-3.5 text-sky-600" />
                              <span>Barcode Satuan (Scan Fisik Khusus Satuan Ini)</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setScanningUnitIndex(idx);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                              title={`Scan Barcode Kemasan ${unit.unitName || ''} via Kamera atau Barcode Scanner Fisik`}
                            >
                              <Camera className="w-3 h-3 text-sky-600" />
                              <span>Scan Kamera</span>
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              type="text"
                              value={unit.barcode || ''}
                              onChange={(e) => handleUnitChange(idx, 'barcode', e.target.value)}
                              placeholder={`Contoh: Barcode pada kemasan ${unit.unitName || 'satuan'}...`}
                              className="w-full p-2 pr-9 rounded-lg border border-slate-200 text-xs font-mono font-medium focus:border-sky-500 bg-slate-50/50"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setScanningUnitIndex(idx);
                              }}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-sky-600 cursor-pointer"
                              title="Buka Scanner Kamera"
                            >
                              <Camera className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Varian Produk Section (Rasa, Warna, Ukuran, dll.) */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                      <Sliders className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                        Varian Produk
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Opsi variasi seperti Rasa, Ukuran, Warna, Aroma, dll.
                      </span>
                    </div>
                  </div>
                  {variants.length > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                      {variants.length} Varian Aktif
                    </span>
                  )}
                </div>

                {/* Tipe / Label Varian */}
                <div>
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">
                    Tipe / Label Varian:
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {['Rasa', 'Ukuran', 'Warna', 'Aroma', 'Model'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setVariantLabel(preset);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          variantLabel === preset
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                    <input
                      type="text"
                      value={variantLabel}
                      onChange={(e) => setVariantLabel(e.target.value)}
                      placeholder="Label kustom..."
                      className="w-28 p-1 px-2 rounded-lg border border-slate-200 text-xs font-medium focus:border-indigo-500 bg-white"
                    />
                  </div>

                  {/* Saran Cepat */}
                  <div className="text-[10px] text-slate-500 mb-2 flex items-center gap-1 flex-wrap">
                    <span className="font-semibold text-slate-600">Saran Cepat:</span>
                    {(variantLabel === 'Rasa'
                      ? ['Cokelat', 'Keju', 'Vanilla', 'Stroberi', 'Original', 'Pedas', 'Balado']
                      : variantLabel === 'Ukuran'
                      ? ['S', 'M', 'L', 'XL', 'XXL', '250ml', '500ml', '1 Liter']
                      : variantLabel === 'Warna'
                      ? ['Hitam', 'Putih', 'Merah', 'Biru', 'Hijau', 'Kuning']
                      : variantLabel === 'Aroma'
                      ? ['Lavender', 'Lemon', 'Apel', 'Melati', 'Kopi']
                      : ['Reguler', 'Premium', 'Special', 'Dingin', 'Hangat']
                    ).map((sug) => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => handleAddVariant(sug)}
                        className="px-2 py-0.5 rounded-md bg-white hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 text-slate-600 text-[10px] transition-colors cursor-pointer"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input Varian Baru */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={variantInput}
                    onChange={(e) => setVariantInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddVariant();
                      }
                    }}
                    placeholder={`Ketik nama ${variantLabel.toLowerCase()} (lalu tekan Enter atau tombol Tambah)...`}
                    className="flex-1 p-2 rounded-xl border border-slate-300 text-xs focus:border-indigo-500 focus:outline-none bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddVariant()}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1 shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah</span>
                  </button>
                </div>

                {/* List Varian Terdaftar dengan Pengaturan Harga & Barcode Unik */}
                {variants.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase px-3">
                      <div className="col-span-4">Nama Varian</div>
                      <div className="col-span-3">Harga Jual (Rp)</div>
                      <div className="col-span-4">Barcode Unik Varian</div>
                      <div className="col-span-1 text-right">Aksi</div>
                    </div>
                    {variants.map((v, vIdx) => (
                      <div
                        key={v.id || vIdx}
                        className="p-2.5 sm:p-3 bg-white border border-slate-200 rounded-xl grid grid-cols-1 sm:grid-cols-12 gap-2 items-center shadow-2xs"
                      >
                        <div className="sm:col-span-4 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                          <input
                            type="text"
                            required
                            value={v.name}
                            onChange={(e) => handleVariantChange(vIdx, 'name', e.target.value)}
                            placeholder="Nama varian"
                            className="w-full p-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-900 focus:border-indigo-500"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <label className="sm:hidden text-[10px] font-bold text-slate-500 block mb-0.5">Harga Jual (Rp)</label>
                          <input
                            type="number"
                            value={v.price ?? (units[0]?.sellingPrice || 0)}
                            onChange={(e) => handleVariantChange(vIdx, 'price', Math.max(0, parseFloat(e.target.value) || 0))}
                            placeholder="Harga varian"
                            className="w-full p-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold text-indigo-700 focus:border-indigo-500"
                          />
                        </div>

                        <div className="sm:col-span-4">
                          <label className="sm:hidden text-[10px] font-bold text-slate-500 block mb-0.5">Barcode Unik Varian</label>
                          <div className="relative">
                            <Barcode className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={v.barcode || ''}
                              onChange={(e) => handleVariantChange(vIdx, 'barcode', e.target.value)}
                              placeholder="Barcode unik varian..."
                              className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs font-mono focus:border-indigo-500 bg-slate-50/50"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setVariants(variants.filter((_, idx) => idx !== vIdx));
                            }}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus Varian Ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">
                    Belum ada varian ditambahkan. Produk akan dijual standar tanpa pilihan variasi.
                  </p>
                )}
              </div>

              {/* PROMO & DISKON PRODUK */}
              <div className="p-4 rounded-2xl border border-rose-200/80 bg-gradient-to-r from-rose-50/60 via-amber-50/40 to-white space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-rose-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs shrink-0 font-black text-xs">
                      %
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Diskon &amp; Promo Produk Langsung
                        </span>
                        {(parseFloat(discountPercent) || 0) > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-extrabold tabular-nums">
                            Aktif -{parseFloat(discountPercent)}%
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Ditampilkan otomatis dengan harga coret &amp; badge promo di katalog kasir dan keranjang belanja.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-wrap">
                    {[0, 5, 10, 15, 20, 25].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setDiscountPercent(String(pct));
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer tabular-nums ${
                          (parseFloat(discountPercent) || 0) === pct
                            ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50'
                        }`}
                      >
                        {pct === 0 ? 'Normal' : `${pct}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-4">
                    <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                      Persentase Diskon (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="99"
                      step="0.5"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      className="w-full p-2 rounded-xl border border-slate-200 text-xs font-bold font-mono focus:border-rose-500 bg-white"
                      placeholder="0"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="text-[10.5px] font-bold text-slate-600 block mb-1">
                      Label Promo (Opsional)
                    </label>
                    <input
                      type="text"
                      maxLength={32}
                      value={promoLabel}
                      onChange={(e) => setPromoLabel(e.target.value)}
                      disabled={(parseFloat(discountPercent) || 0) <= 0}
                      className="w-full p-2 rounded-xl border border-slate-200 text-xs focus:border-rose-500 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                      placeholder="Contoh: Promo Akhir Pekan"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    {(() => {
                      const basePrice = Number(units[0]?.sellingPrice) || 0;
                      const pct = Math.min(99, Math.max(0, parseFloat(discountPercent) || 0));
                      const finalPrice = Math.max(0, Math.round(basePrice * (1 - pct / 100)));
                      return (
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs tabular-nums">
                          <div className="text-[10px] font-bold text-slate-400 uppercase">
                            Harga Jual di Kasir ({units[0]?.unitName || baseUnit})
                          </div>
                          {pct > 0 ? (
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="line-through text-slate-400 text-[11px] font-mono">
                                {formatRupiah(basePrice)}
                              </span>
                              <span className="font-extrabold text-rose-700 font-mono text-sm">
                                {formatRupiah(finalPrice)}
                              </span>
                            </div>
                          ) : (
                            <div className="font-extrabold text-slate-800 font-mono text-sm mt-0.5">
                              {formatRupiah(basePrice)} (Harga Normal)
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* MENU PELANGGAN: HARGA KHUSUS KATEGORI PELANGGAN */}
              <div className="p-4 bg-gradient-to-r from-sky-50/50 via-indigo-50/30 to-purple-50/50 rounded-2xl border border-sky-200/80 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-sky-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Menu Pelanggan: Harga Khusus Kategori
                        </span>
                        {customerPrices.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-sky-600 text-white">
                            {customerPrices.length} Aturan Harga
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Atur harga jual khusus otomatis saat pelanggan dengan kategori tertentu (VIP, Reseller, Grosir, dll.) dipilih di kasir.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {availableCategoryNames.slice(0, 5).map((catName) => (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => handleAddCustomerPrice(catName)}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3 h-3 text-sky-600" />
                        <span>+ {catName}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleAddCustomerPrice('MEMBER')}
                      className="px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Lainnya</span>
                    </button>
                  </div>
                </div>

                {customerPrices.length === 0 ? (
                  <div className="p-3.5 bg-white/70 rounded-xl border border-dashed border-sky-200 text-center space-y-1.5">
                    <p className="text-xs font-medium text-slate-600">
                      Belum ada harga khusus pelanggan yang diatur untuk produk ini.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Semua pelanggan akan mendapatkan harga jual standar normal: <strong className="text-slate-700">{formatRupiah(units[0]?.sellingPrice || 0)}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleAddCustomerPrice('VIP')}
                      className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Harga Khusus Pelanggan Sekarang</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customerPrices.map((cp, cpIdx) => {
                      const badge = getCustomerCategoryBadge(cp.customerCategory);
                      const baseNormalPrice = units[0]?.sellingPrice || 0;
                      // Target unit selling price
                      const targetUnit = units.find(u => u.unitName.toUpperCase() === (cp.unitName || baseUnit).toUpperCase()) || units[0];
                      const normalPriceForUnit = targetUnit ? targetUnit.sellingPrice : baseNormalPrice;
                      const diff = normalPriceForUnit - cp.price;
                      const diffPercent = normalPriceForUnit > 0 ? Math.round((diff / normalPriceForUnit) * 100) : 0;
                      const currentUnitName = cp.unitName || baseUnit || 'PCS';
                      const minQty = cp.minQuantity !== undefined && cp.minQuantity > 0 ? cp.minQuantity : 1;

                      return (
                        <div
                          key={cp.id || cpIdx}
                          className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2.5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                            {/* Kategori Pelanggan Dropdown / Datalist */}
                            <div className="sm:col-span-3 space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 block">
                                Kategori Pelanggan *
                              </label>
                              <div className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${badge.dot} shrink-0`} />
                                <input
                                  type="text"
                                  required
                                  value={cp.customerCategory}
                                  onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'customerCategory', e.target.value.toUpperCase())}
                                  placeholder="VIP / MEMBER / GROSIR"
                                  className="w-full p-2 rounded-lg border border-slate-200 text-xs font-black font-mono focus:border-sky-500 uppercase bg-slate-50/50"
                                  list={`cat-suggestions-${cpIdx}`}
                                />
                                <datalist id={`cat-suggestions-${cpIdx}`}>
                                  {availableCategoryNames.map((c) => (
                                    <option key={c} value={c} />
                                  ))}
                                </datalist>
                              </div>
                            </div>

                            {/* Satuan Terkait */}
                            <div className="sm:col-span-3 space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 block">
                                Berlaku Untuk Satuan
                              </label>
                              <select
                                value={cp.unitName || baseUnit}
                                onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'unitName', e.target.value)}
                                className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold font-mono focus:border-sky-500 bg-white"
                              >
                                {units.map((u) => (
                                  <option key={u.unitName} value={u.unitName}>
                                    {u.unitName} (Normal: {formatRupiah(u.sellingPrice)})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Syarat Minimal Pembelian (x satuan dan berlaku untuk jumlah selanjutnya) */}
                            <div className="sm:col-span-2 space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-indigo-700 block truncate" title="Jumlah minimal agar harga khusus berlaku">
                                  Min. Beli (Qty) *
                                </label>
                              </div>
                              <div className="relative">
                                <input
                                  type="number"
                                  required
                                  min="1"
                                  value={minQty}
                                  onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'minQuantity', Math.max(1, parseInt(e.target.value) || 1))}
                                  placeholder="1"
                                  className="w-full p-2 pr-7 rounded-lg border border-indigo-200 text-xs font-mono font-black text-indigo-700 focus:border-indigo-500 bg-indigo-50/30 text-center"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-indigo-500 pointer-events-none truncate max-w-[28px]">
                                  {currentUnitName}
                                </span>
                              </div>
                            </div>

                            {/* Harga Khusus (Rp) */}
                            <div className="sm:col-span-3 space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-slate-700 block">
                                  Harga Khusus (Rp) *
                                </label>
                                {diff > 0 ? (
                                  <span className="text-[9.5px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded">
                                    Hemat {diffPercent}%
                                  </span>
                                ) : diff < 0 ? (
                                  <span className="text-[9.5px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded">
                                    +{formatRupiah(Math.abs(diff))}
                                  </span>
                                ) : null}
                              </div>
                              <input
                                type="number"
                                required
                                min="0"
                                step="any"
                                value={cp.price !== undefined ? cp.price : ''}
                                onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'price', Math.max(0, parseFloat(e.target.value) || 0))}
                                placeholder="0"
                                className="w-full p-2 rounded-lg border border-slate-200 text-xs font-mono font-black text-sky-700 focus:border-sky-500 bg-sky-50/30"
                              />
                            </div>

                            {/* Hapus Baris */}
                            <div className="sm:col-span-1 text-right pt-2 sm:pt-0">
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomerPrice(cpIdx)}
                                className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Hapus Harga Khusus Ini"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Pemicu Syarat Harga Khusus (Live Explanation) */}
                          <div className="p-2 rounded-xl bg-gradient-to-r from-sky-50 via-indigo-50/40 to-slate-50 border border-sky-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]">
                            <div className="flex items-center gap-1.5 text-slate-700 truncate">
                              <span className="font-bold text-sky-700 shrink-0">🎯 Pemicu Harga:</span>
                              <span className="truncate">
                                Harga <strong>{formatRupiah(cp.price)}</strong>/{currentUnitName} otomatis berlaku untuk pelanggan <strong>{cp.customerCategory || 'MEMBER'}</strong> jika membeli mulai <strong>{minQty} {currentUnitName} ke atas</strong>.
                              </span>
                            </div>
                            {minQty > 1 && (
                              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-bold text-[9.5px] shrink-0 border border-indigo-200">
                                Berlaku mulai pembelian {minQty} {currentUnitName} &amp; seterusnya
                              </span>
                            )}
                          </div>

                          {/* Catatan Khusus baris ini */}
                          <div className="pt-1 flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 shrink-0 font-medium">Catatan / Syarat:</span>
                            <input
                              type="text"
                              value={cp.notes || ''}
                              onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'notes', e.target.value)}
                              placeholder="Misal: Pembelian partai mulai 5 pcs keatas, khusus member..."
                              className="w-full p-1 text-[11px] border border-slate-200 rounded-lg focus:border-sky-500 focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Live Price & Margin Impact Preview + Optional Reason (only when editing existing product with price/HPP change) */}
              {editingProduct && (() => {
                const prevBaseSell = editingProduct.units?.[0]?.sellingPrice || 0;
                const prevBaseCost = editingProduct.costPrice ?? editingProduct.units?.[0]?.costPrice ?? 0;
                const nextBaseSell = Math.max(0, parseFloat(units[0]?.sellingPrice?.toString() || '0') || 0);
                const nextBaseCost = Math.max(0, parseFloat(units[0]?.costPrice?.toString() || costPrice || '0') || 0);
                const hasAnyUnitPriceDiff = units.some((u, idx) => {
                  const orig = editingProduct.units?.[idx];
                  if (!orig) return false;
                  return (
                    Number(orig.sellingPrice || 0) !== Number(u.sellingPrice || 0) ||
                    Number(orig.costPrice || prevBaseCost) !== Number(u.costPrice || nextBaseCost)
                  );
                });
                const hasBaseDiff = prevBaseSell !== nextBaseSell || prevBaseCost !== nextBaseCost;
                if (!hasAnyUnitPriceDiff && !hasBaseDiff) return null;

                const oldMarginPct = prevBaseSell > 0 ? ((prevBaseSell - prevBaseCost) / prevBaseSell) * 100 : 0;
                const newMarginPct = nextBaseSell > 0 ? ((nextBaseSell - nextBaseCost) / nextBaseSell) * 100 : 0;
                const marginDelta = newMarginPct - oldMarginPct;

                return (
                  <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <History className="w-4 h-4 text-sky-600" />
                        <span>Perubahan Harga &amp; Margin Akan Dicatat ke Riwayat Harga</span>
                      </span>
                      <span
                        className={`text-xs font-mono tabular-nums font-bold ${
                          marginDelta > 0 ? 'text-emerald-700' : marginDelta < 0 ? 'text-rose-700' : 'text-slate-700'
                        }`}
                      >
                        Margin Dasar: {oldMarginPct.toFixed(1)}% → {newMarginPct.toFixed(1)}% (
                        {marginDelta >= 0 ? '+' : ''}
                        {marginDelta.toFixed(1)}%)
                      </span>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Catatan / Alasan Perubahan Harga (Opsional)
                      </label>
                      <input
                        type="text"
                        value={priceChangeReason}
                        onChange={(e) => setPriceChangeReason(e.target.value)}
                        placeholder="Misal: Kenaikan harga supplier, penyesuaian margin, atau promo..."
                        className="w-full px-3 py-2 text-xs border border-sky-200 rounded-xl bg-white focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div>
                  {editingProduct && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        const prod = editingProduct;
                        setEditingProduct(null);
                        setIsAddingNew(false);
                        setProductToDelete(prod);
                      }}
                      className="py-2.5 px-3.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Produk Ini</span>
                    </button>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProduct(null);
                      setIsAddingNew(false);
                    }}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20 cursor-pointer"
                  >
                    Simpan Produk & Satuan
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DEDICATED CATEGORY MANAGEMENT MODAL (COLORS, NAMES, CRUD)        */}
      {/* ========================================================================= */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Kelola Kategori Berwarna POS
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tambahkan atau edit warna kategori agar kasir mudah memfilter produk di tablet.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  sound.playTap();
                  setIsCategoryModalOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Form: Add / Edit */}
            <form onSubmit={handleSaveCategory} className="py-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4 text-sky-600" />
                  <span>{editingCategory ? `Edit Kategori: "${editingCategory.name}"` : 'Tambah Kategori Baru'}</span>
                </span>

                {editingCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryNameInput('');
                      setCategoryDescInput('');
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
                  >
                    Batal Edit (Mode Tambah Baru)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Nama Kategori *
                  </label>
                  <input
                    type="text"
                    required
                    value={categoryNameInput}
                    onChange={(e) => setCategoryNameInput(e.target.value)}
                    placeholder="Contoh: Roti & Kue Basah"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Deskripsi Kategori (Opsional)
                  </label>
                  <input
                    type="text"
                    value={categoryDescInput}
                    onChange={(e) => setCategoryDescInput(e.target.value)}
                    placeholder="Contoh: Aneka roti tawar dan kue manis"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Color Picker Swatches */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700">
                    Pilih Warna Badge (12 Preset Warna Kontras)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-600">
                      {categoryColorInput}
                    </span>
                    <input
                      type="color"
                      value={categoryColorInput}
                      onChange={(e) => setCategoryColorInput(e.target.value)}
                      className="w-6 h-6 rounded-md cursor-pointer border-0 p-0"
                      title="Pilih Warna Kustom"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 pt-1">
                  {CATEGORY_COLOR_PRESETS.map((preset) => {
                    const isSelected = categoryColorInput.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setCategoryColorInput(preset.hex)}
                        style={{ backgroundColor: preset.hex }}
                        className={`h-8 rounded-xl flex items-center justify-center transition-all ${
                          isSelected
                            ? 'ring-2 ring-slate-900 ring-offset-2 scale-110 shadow-sm'
                            : 'hover:scale-105 opacity-90'
                        }`}
                        title={preset.label}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview & Submit */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Pratinjau Badge:</span>
                  <span
                    style={{
                      backgroundColor: `${categoryColorInput}18`,
                      color: categoryColorInput,
                      borderColor: `${categoryColorInput}40`,
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: categoryColorInput }}
                    />
                    <span>{categoryNameInput.trim() || 'Nama Kategori'}</span>
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!categoryNameInput.trim()}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingCategory ? 'Simpan Perubahan' : 'Tambah Kategori'}</span>
                </button>
              </div>
            </form>

            {/* List of Existing Categories */}
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 uppercase tracking-wider">
                  Daftar Kategori Tersedia ({mergedCategories.length})
                </span>
                <span className="text-slate-400">Klik ikon pensil untuk mengubah warna</span>
              </div>

              {autoDetectedCategories.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-amber-900">
                    Terdeteksi <strong>{autoDetectedCategories.length} kategori baru</strong> dari produk hasil impor yang siap disimpan permanen.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playSuccessChime();
                      handleSyncDetectedCategories(autoDetectedCategories);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                  >
                    Simpan Semua ({autoDetectedCategories.length})
                  </button>
                </div>
              )}

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {mergedCategories.map((cat) => {
                  const productCount = products.filter(
                    (p) => (p.category || '').trim().toLowerCase() === cat.name.trim().toLowerCase()
                  ).length;
                  const color = cat.color || '#0284c7';
                  const isAutoDetected = cat.id.startsWith('auto_cat_');

                  return (
                    <div
                      key={cat.id || cat.name}
                      className="p-3 bg-slate-50 rounded-2xl border border-slate-200/90 flex items-center justify-between gap-3 hover:bg-slate-100/70 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Color swatch circle */}
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs font-bold text-xs"
                          style={{ backgroundColor: color }}
                        >
                          {cat.name.charAt(0)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs md:text-sm">
                              {cat.name}
                            </span>
                            <span
                              style={{
                                backgroundColor: `${color}15`,
                                color: color,
                                borderColor: `${color}35`,
                              }}
                              className="px-2 py-0.2 rounded-md text-[10px] font-mono font-bold border"
                            >
                              {color}
                            </span>
                            {isAutoDetected && (
                              <span className="px-2 py-0.2 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                Terdeteksi Impor
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {cat.description || 'Tidak ada deskripsi'} •{' '}
                            <span className="font-bold text-slate-700">{productCount} produk</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEditCategory(cat)}
                          className="p-2 rounded-xl text-slate-600 hover:text-sky-600 hover:bg-white transition-colors"
                          title="Edit Warna & Nama"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-white transition-colors"
                          title="Hapus Kategori"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsCategoryModalOpen(false);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CAMERA CAPTURE VIEWFINDER MODAL                                  */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MODAL 3: CAMERA CAPTURE VIEWFINDER MODAL                                  */}
      {/* ========================================================================= */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col">
            {/* Camera Header */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {quickCameraTargetProduct ? `Foto: ${quickCameraTargetProduct.name}` : 'Ambil Foto Produk'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {capturedPhotoPreview ? 'Periksa hasil foto sebelum disimpan' : 'Posisikan produk di tengah bingkai'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {!capturedPhotoPreview && !cameraError && (
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    title="Putar Kamera (Depan / Belakang)"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewfinder or Preview Window */}
            <div className="relative aspect-square bg-black flex items-center justify-center overflow-hidden">
              {capturedPhotoPreview ? (
                <div className="relative w-full h-full">
                  <img
                    src={capturedPhotoPreview}
                    alt="Preview Jepretan"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Hasil Jepretan Siap Disimpan</span>
                  </div>
                </div>
              ) : cameraError ? (
                <div className="p-6 text-center text-slate-300 space-y-3">
                  <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                  <p className="text-xs font-semibold">{cameraError}</p>
                  <p className="text-[11px] text-slate-400">
                    Anda juga dapat memilih foto langsung dari galeri atau penyimpanan perangkat.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      fileInputRef.current?.click();
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl"
                  >
                    Pilih dari File / Galeri
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  {/* Grid Overlay Guide */}
                  <div className="absolute inset-8 border border-white/40 rounded-2xl pointer-events-none flex items-center justify-center">
                    <div className="w-8 h-8 border-t-2 border-l-2 border-emerald-400 absolute top-0 left-0 rounded-tl-xl" />
                    <div className="w-8 h-8 border-t-2 border-r-2 border-emerald-400 absolute top-0 right-0 rounded-tr-xl" />
                    <div className="w-8 h-8 border-b-2 border-l-2 border-emerald-400 absolute bottom-0 left-0 rounded-bl-xl" />
                    <div className="w-8 h-8 border-b-2 border-r-2 border-emerald-400 absolute bottom-0 right-0 rounded-br-xl" />
                    <span className="text-[11px] font-bold text-white/80 bg-black/50 px-2 py-0.5 rounded-md backdrop-blur-xs">
                      Pusat Produk
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Shutter & Controls */}
            <div className="p-4 bg-slate-950 flex items-center justify-between border-t border-slate-800">
              {capturedPhotoPreview ? (
                <>
                  <button
                    type="button"
                    onClick={handleRetakePhoto}
                    className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Foto Ulang</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmPhoto}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Gunakan Foto Ini</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>

                  {!cameraError && (
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Jepret Foto</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      fileInputRef.current?.click();
                    }}
                    className="px-3 py-2 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Pilih File
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* =================================================================== */}
      {/* MODAL IMPORT PRODUK MASSAL (EXCEL .XLSX / .XLS)                     */}
      {/* =================================================================== */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            {/* Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shadow-inner">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-100" />
                </div>
                <div>
                  <h3 className="font-black text-base md:text-lg leading-tight">Import Produk Massal (Excel .XLSX / .XLS)</h3>
                  <p className="text-xs text-emerald-100">
                    Unggah file Excel dengan pemetaan kolom SKU, harga modal/beli, harga jual, stok, satuan, kadaluarsa &amp; URL gambar
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsCsvModalOpen(false);
                }}
                className="p-1.5 rounded-xl text-emerald-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
              {/* Alert Notification */}
              {csvImportSuccessMessage && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{csvImportSuccessMessage}</span>
                </div>
              )}

              {/* Step 1: Download Template */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Langkah 1: Unduh Format Template Excel (.XLSX)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    File Excel resmi telah menyertakan lembar <strong>Contoh Pengisian Realistis</strong> dan <strong>Petunjuk Format</strong> kolom.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadExcelTemplate}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs shrink-0 cursor-pointer transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Template Excel (.XLSX)</span>
                </button>
              </div>

              {/* Step 2: Upload Excel File */}
              <div className="p-4 border-2 border-dashed border-slate-300 hover:border-emerald-500 rounded-2xl text-center transition-colors bg-slate-50/50">
                <input
                  type="file"
                  id="csv-file-input"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onChange={handleCsvFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="csv-file-input"
                  className="cursor-pointer flex flex-col items-center justify-center py-4 space-y-2"
                >
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-800 hover:underline">
                      {csvFileName ? `File Terpilih: ${csvFileName}` : 'Klik untuk memilih file Excel (.xlsx / .xls) dari komputer/tablet'}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">Mendukung format file spreadsheet Excel (.xlsx, .xls) dan .csv</p>
                  </div>
                  {csvRawRows.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-black">
                      <Check className="w-3 h-3" />
                      <span>{csvRawRows.length} Baris Produk Ditemukan</span>
                    </span>
                  )}
                </label>
              </div>

              {/* Step 3: Column Mapping (if file loaded) */}
              {csvHeaders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-sky-600" />
                      <span>Langkah 2: Pemetaan Kolom CSV</span>
                    </h4>
                    <span className="text-[10px] text-slate-400">Cocokkan kolom tabel Anda dengan sistem</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom SKU / Barcode *
                      </label>
                      <select
                        value={csvMapping.sku}
                        onChange={(e) => setCsvMapping({ ...csvMapping, sku: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Pilih Kolom --</option>
                        {csvHeaders.map((h) => (
                          <option key={`sku-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Nama Produk *
                      </label>
                      <select
                        value={csvMapping.name}
                        onChange={(e) => setCsvMapping({ ...csvMapping, name: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Pilih Kolom --</option>
                        {csvHeaders.map((h) => (
                          <option key={`name-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Harga Jual *
                      </label>
                      <select
                        value={csvMapping.sellingPrice}
                        onChange={(e) => setCsvMapping({ ...csvMapping, sellingPrice: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Pilih Kolom --</option>
                        {csvHeaders.map((h) => (
                          <option key={`price-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Kategori
                      </label>
                      <select
                        value={csvMapping.category}
                        onChange={(e) => setCsvMapping({ ...csvMapping, category: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Tidak Dipetakan (Default: Umum) --</option>
                        {csvHeaders.map((h) => (
                          <option key={`cat-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Satuan Dasar
                      </label>
                      <select
                        value={csvMapping.baseUnit}
                        onChange={(e) => setCsvMapping({ ...csvMapping, baseUnit: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Tidak Dipetakan (Default: PCS) --</option>
                        {csvHeaders.map((h) => (
                          <option key={`unit-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Harga Beli / Modal
                      </label>
                      <select
                        value={csvMapping.costPrice}
                        onChange={(e) => setCsvMapping({ ...csvMapping, costPrice: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Tidak Dipetakan (Default: 0) --</option>
                        {csvHeaders.map((h) => (
                          <option key={`cost-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Stok Awal
                      </label>
                      <select
                        value={csvMapping.stock}
                        onChange={(e) => setCsvMapping({ ...csvMapping, stock: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Tidak Dipetakan (Default: 0) --</option>
                        {csvHeaders.map((h) => (
                          <option key={`stk-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Batas Min. Stok
                      </label>
                      <select
                        value={csvMapping.minStock}
                        onChange={(e) => setCsvMapping({ ...csvMapping, minStock: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Tidak Dipetakan (Default: 10) --</option>
                        {csvHeaders.map((h) => (
                          <option key={`min-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Tanggal Kadaluarsa
                      </label>
                      <select
                        value={csvMapping.expiryDate}
                        onChange={(e) => setCsvMapping({ ...csvMapping, expiryDate: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Tidak Ada / Kosong --</option>
                        {csvHeaders.map((h) => (
                          <option key={`exp-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2 md:col-span-2">
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom Varian Produk (Format: Rasa:Harga:Barcode;...)
                      </label>
                      <select
                        value={csvMapping.variants}
                        onChange={(e) => setCsvMapping({ ...csvMapping, variants: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Tanpa Varian --</option>
                        {csvHeaders.map((h) => (
                          <option key={`var-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-2 md:col-span-1">
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">
                        Kolom URL Gambar (Opsional)
                      </label>
                      <select
                        value={csvMapping.imageUrl}
                        onChange={(e) => setCsvMapping({ ...csvMapping, imageUrl: e.target.value })}
                        className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold"
                      >
                        <option value="">-- Tanpa URL Gambar --</option>
                        {csvHeaders.map((h) => (
                          <option key={`img-${h}`} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Preview First 3 Rows */}
                  <div className="space-y-1.5">
                    <h5 className="text-[11px] font-bold text-slate-700">Pratinjau Data (3 Baris Teratas):</h5>
                    <div className="overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">SKU</th>
                            <th className="py-2 px-3">Nama Produk</th>
                            <th className="py-2 px-3">Kategori</th>
                            <th className="py-2 px-3">Satuan</th>
                            <th className="py-2 px-3">Harga Jual</th>
                            <th className="py-2 px-3">Stok</th>
                            <th className="py-2 px-3">Kadaluarsa</th>
                            <th className="py-2 px-3">Varian</th>
                            <th className="py-2 px-3">URL Gambar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {csvRawRows.slice(0, 3).map((r, i) => {
                            const skuVal = csvMapping.sku ? r[csvHeaders.indexOf(csvMapping.sku)] : '-';
                            const nameVal = csvMapping.name ? r[csvHeaders.indexOf(csvMapping.name)] : '-';
                            const catVal = csvMapping.category ? r[csvHeaders.indexOf(csvMapping.category)] : 'Umum';
                            const unitVal = csvMapping.baseUnit ? r[csvHeaders.indexOf(csvMapping.baseUnit)] : 'PCS';
                            const priceVal = csvMapping.sellingPrice ? r[csvHeaders.indexOf(csvMapping.sellingPrice)] : '0';
                            const stockVal = csvMapping.stock ? r[csvHeaders.indexOf(csvMapping.stock)] : '0';
                            const expVal = csvMapping.expiryDate ? r[csvHeaders.indexOf(csvMapping.expiryDate)] : '-';
                            const varVal = csvMapping.variants ? r[csvHeaders.indexOf(csvMapping.variants)] : '-';
                            const imageUrlVal = csvMapping.imageUrl ? r[csvHeaders.indexOf(csvMapping.imageUrl)] : '';

                            return (
                              <tr key={`prev-${i}`} className="hover:bg-slate-50 font-mono">
                                <td className="py-2 px-3 font-bold text-slate-900">{skuVal}</td>
                                <td className="py-2 px-3 font-sans font-medium text-slate-800">{nameVal}</td>
                                <td className="py-2 px-3">{catVal}</td>
                                <td className="py-2 px-3">{unitVal}</td>
                                <td className="py-2 px-3 text-sky-700 font-bold">{priceVal}</td>
                                <td className="py-2 px-3">{stockVal}</td>
                                <td className="py-2 px-3 text-rose-700">{expVal || '-'}</td>
                                <td className="py-2 px-3 text-slate-500 max-w-xs truncate">{varVal || '-'}</td>
                                <td className="py-2 px-3 text-slate-500 max-w-[160px] truncate" title={imageUrlVal || ''}>{imageUrlVal || '-'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsCsvModalOpen(false);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>

              <button
                type="button"
                disabled={csvRawRows.length === 0}
                onClick={handleExecuteCsvImport}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs shadow-md shadow-emerald-500/20 flex items-center gap-2 cursor-pointer transition-all"
              >
                <Check className="w-4 h-4" />
                <span>Impor {csvRawRows.length > 0 ? `${csvRawRows.length} Produk` : ''} Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BARCODE SCANNER MODAL (FOR CAMERA & HANDHELD BARCODE SCANNER) */}
      {scanningUnitIndex !== null && (
        <BarcodeScannerModal
          isOpen={true}
          onClose={() => setScanningUnitIndex(null)}
          products={products}
          onBarcodeScanned={(scannedCode) => {
            sound.playScanBeep();
            if (scanningUnitIndex === -1) {
              setBarcode(scannedCode);
            } else if (scanningUnitIndex >= 0) {
              handleUnitChange(scanningUnitIndex, 'barcode', scannedCode);
            }
            setScanningUnitIndex(null);
          }}
        />
      )}

      {/* IN-APP CONFIRMATION MODAL: DELETE PRODUCT */}
      {productToDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Hapus Produk Ini?</h3>
                <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="text-xs font-bold text-slate-900">{productToDelete.name}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                SKU / Barcode: {productToDelete.sku || productToDelete.barcode} • Kategori: {productToDelete.category}
              </div>
              <div className="text-[11px] text-slate-500">
                Stok: {productToDelete.stockInBaseUnit} {productToDelete.baseUnit}
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus produk ini? Produk akan segera dihapus secara permanen dari database toko dan sinkronisasi cloud.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  sound.playSuccessChime();
                  const targetId = productToDelete.id;
                  setProductToDelete(null);
                  try {
                    await deleteDocumentFromFirestore('products', targetId);
                  } catch (err) {
                    console.warn('[Firestore] Delete product notice:', err);
                  }
                  onDeleteProduct(targetId);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable SKU QR Code Label Modal */}
      {skuQrProduct && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-900 text-white p-5 relative no-print">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSkuQrProduct(null);
                }}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 text-indigo-300 text-[11px] font-bold uppercase tracking-wider">
                <QrCode className="w-4 h-4" />
                <span>Label QR Code SKU Produk</span>
              </div>
              <h3 className="text-base font-black mt-1 pr-8">{skuQrProduct.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {skuQrProduct.category} • Stok: {formatNumber(skuQrProduct.stockInBaseUnit)} {skuQrProduct.baseUnit}
              </p>
            </div>

            <div className="p-6 flex flex-col items-center text-center space-y-4">
              {/* Printable Sticker Preview Frame */}
              <div className="w-full max-w-[300px] p-4 rounded-2xl border-2 border-slate-900 bg-white shadow-sm space-y-2">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {skuQrProduct.category}
                </div>
                <div className="text-sm font-black text-slate-900 leading-tight line-clamp-2">
                  {skuQrProduct.name}
                </div>
                <div className="flex justify-center py-1">
                  {skuQrDataUrl ? (
                    <img
                      src={skuQrDataUrl}
                      alt={`QR SKU ${skuQrProduct.sku || skuQrProduct.barcode}`}
                      className="w-44 h-44 object-contain"
                    />
                  ) : (
                    <div className="w-44 h-44 flex items-center justify-center text-xs text-slate-400">
                      Membuat QR...
                    </div>
                  )}
                </div>
                <div className="px-3 py-1 rounded-lg bg-slate-100 border border-slate-300 font-mono text-xs font-black text-slate-900">
                  {skuQrProduct.sku || skuQrProduct.barcode}
                </div>
                <div className="text-base font-black text-sky-700 font-mono">
                  {formatRupiah(skuQrProduct.units?.[0]?.sellingPrice || 0)}
                  <span className="text-xs font-bold text-slate-500">
                    {' '}
                    / {skuQrProduct.units?.[0]?.unitName || skuQrProduct.baseUnit}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed no-print">
                Tempelkan label ini pada rak atau kemasan produk agar kasir dapat melakukan <strong>Scan Cepat ke Keranjang</strong> atau <strong>Cek Stok SKU</strong> di layar POS.
              </p>

              <div className="w-full grid grid-cols-2 gap-2.5 pt-1 no-print">
                <button
                  type="button"
                  onClick={() => handleDownloadSkuQrLabel(skuQrProduct)}
                  className="py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Unduh Label PNG</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    window.print();
                  }}
                  className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Label</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input & canvas for processing photo captures */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
