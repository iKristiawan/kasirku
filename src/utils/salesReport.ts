import { Product, Transaction } from '../types/pos';
import { getItemFifoCogs } from './fifoUtils';

export type SalesReportPeriodType = 'HARIAN' | 'MINGGUAN' | 'BULANAN' | 'KUSTOM';
export type SalesReportSortBy = 'QUANTITY' | 'REVENUE' | 'GROSS_PROFIT';

export interface SalesReportDateRange {
  type: SalesReportPeriodType;
  label: string;
  shortLabel: string;
  startDateStr: string; // YYYY-MM-DD (local)
  endDateStr: string;   // YYYY-MM-DD (local)
  startTimestamp: number;
  endTimestamp: number;
  daysCount: number;
}

export interface GenerateSalesReportOptions {
  transactions: Transaction[];
  products: Product[];
  periodType: SalesReportPeriodType;
  anchorDate?: string; // YYYY-MM-DD for HARIAN / MINGGUAN
  startDate?: string;  // YYYY-MM-DD for KUSTOM
  endDate?: string;    // YYYY-MM-DD for KUSTOM
  month?: number;      // 0..11 for BULANAN
  year?: number;       // full year for BULANAN
  categoryFilter?: string;
  paymentMethodFilter?: string;
  searchQuery?: string;
  sortBy?: SalesReportSortBy;
}

export interface BestSellingProductItem {
  rank: number;
  productId: string;
  productName: string;
  category: string;
  baseUnit: string;
  isService: boolean;
  totalQuantitySold: number; // In base unit (net after returns)
  totalLineQuantity: number; // Raw line item quantity across sold units
  unitBreakdown: Array<{ unitName: string; quantity: number }>;
  unitBreakdownLabel: string;
  transactionCount: number;
  totalSales: number; // Net revenue attributed to this product
  estimatedCogs: number;
  estimatedGrossProfit: number;
  grossMarginPercent: number;
  revenueSharePercent: number;
}

export interface SalesTrendPoint {
  key: string;
  label: string;
  fullLabel: string;
  pendapatan: number;
  hpp: number;
  keuntunganKotor: number;
  transaksi: number;
  kuantitas: number;
}

export interface PaymentBreakdownItem {
  method: string;
  transactionCount: number;
  totalAmount: number;
  sharePercent: number;
}

export interface SalesReportSummary {
  totalRevenue: number;
  grossSalesBeforeDiscount: number;
  totalDiscountAndPoints: number;
  totalReturnedAmount: number;
  totalEstimatedCogs: number;
  estimatedGrossProfit: number;
  grossMarginPercent: number;
  fifoVerifiedSharePercent: number;
  transactionCount: number;
  fullReturnCount: number;
  averageBasket: number;
  totalUnitsSold: number;
  uniqueProductsSold: number;
}

export interface SalesReportResult {
  range: SalesReportDateRange;
  summary: SalesReportSummary;
  bestSellingProducts: BestSellingProductItem[];
  trendSeries: SalesTrendPoint[];
  paymentBreakdown: PaymentBreakdownItem[];
  includedTransactions: Transaction[];
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function formatLocalDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalYmd(ymd?: string): Date {
  if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function formatShortDateId(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function startOfDayTs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

function endOfDayTs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}

/**
 * Resolves exact local start/end boundaries for Harian, Mingguan (Senin-Minggu),
 * Bulanan, or Kustom date ranges.
 */
export function resolveSalesReportDateRange(
  periodType: SalesReportPeriodType,
  options?: {
    anchorDate?: string;
    startDate?: string;
    endDate?: string;
    month?: number;
    year?: number;
  }
): SalesReportDateRange {
  const now = new Date();
  const anchor = parseLocalYmd(options?.anchorDate);

  if (periodType === 'HARIAN') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    const startStr = formatLocalDateYmd(start);
    const todayStr = formatLocalDateYmd(now);
    const formatted = start.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    return {
      type: 'HARIAN',
      label: startStr === todayStr ? `Hari Ini (${formatShortDateId(start)})` : formatted,
      shortLabel: formatShortDateId(start),
      startDateStr: startStr,
      endDateStr: startStr,
      startTimestamp: startOfDayTs(start),
      endTimestamp: endOfDayTs(start),
      daysCount: 1,
    };
  }

  if (periodType === 'MINGGUAN') {
    // Indonesia calendar week: Senin (1) .. Minggu (0 -> offset 6)
    const dayOfWeek = anchor.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + diffToMonday);
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    const startStr = formatLocalDateYmd(monday);
    const endStr = formatLocalDateYmd(sunday);
    const mondayShort = monday.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
    const sundayShort = formatShortDateId(sunday);

    return {
      type: 'MINGGUAN',
      label: `Mingguan · ${mondayShort} – ${sundayShort}`,
      shortLabel: `${mondayShort} – ${sundayShort}`,
      startDateStr: startStr,
      endDateStr: endStr,
      startTimestamp: startOfDayTs(monday),
      endTimestamp: endOfDayTs(sunday),
      daysCount: 7,
    };
  }

  if (periodType === 'BULANAN') {
    const year = options?.year ?? now.getFullYear();
    const month = options?.month ?? now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysCount = lastDay.getDate();
    const monthTitle = `${MONTH_NAMES_ID[month] || ''} ${year}`.trim();
    return {
      type: 'BULANAN',
      label: `Bulan ${monthTitle}`,
      shortLabel: monthTitle,
      startDateStr: formatLocalDateYmd(firstDay),
      endDateStr: formatLocalDateYmd(lastDay),
      startTimestamp: startOfDayTs(firstDay),
      endTimestamp: endOfDayTs(lastDay),
      daysCount,
    };
  }

  // KUSTOM
  const rawStart = parseLocalYmd(options?.startDate || options?.anchorDate);
  const rawEnd = parseLocalYmd(options?.endDate || options?.startDate || options?.anchorDate);
  const start = rawStart.getTime() <= rawEnd.getTime() ? rawStart : rawEnd;
  const end = rawStart.getTime() <= rawEnd.getTime() ? rawEnd : rawStart;
  const daysCount = Math.max(
    1,
    Math.round((startOfDayTs(end) - startOfDayTs(start)) / 86400000) + 1
  );

  return {
    type: 'KUSTOM',
    label: `${formatShortDateId(start)} – ${formatShortDateId(end)}`,
    shortLabel: `${formatShortDateId(start)} – ${formatShortDateId(end)}`,
    startDateStr: formatLocalDateYmd(start),
    endDateStr: formatLocalDateYmd(end),
    startTimestamp: startOfDayTs(start),
    endTimestamp: endOfDayTs(end),
    daysCount,
  };
}

/**
 * Menghasilkan laporan penjualan lengkap (total pendapatan, produk terlaris beserta
 * kuantitas dan total penjualannya, estimasi keuntungan kotor, serta seri tren waktu)
 * berdasarkan rentang tanggal yang dipilih (harian, mingguan, bulanan, atau kustom).
 */
export function generateSalesReport(
  options: GenerateSalesReportOptions
): SalesReportResult {
  const {
    transactions = [],
    products = [],
    periodType,
    anchorDate,
    startDate,
    endDate,
    month,
    year,
    categoryFilter = 'ALL',
    paymentMethodFilter = 'ALL',
    searchQuery = '',
    sortBy = 'QUANTITY',
  } = options;

  const range = resolveSalesReportDateRange(periodType, {
    anchorDate,
    startDate,
    endDate,
    month,
    year,
  });

  const productMap = new Map<string, Product>();
  for (let i = 0; i < products.length; i++) {
    productMap.set(products[i].id, products[i]);
  }

  const normalizedCategoryFilter = categoryFilter.trim().toUpperCase();
  const isFilteringCategory =
    normalizedCategoryFilter !== '' && normalizedCategoryFilter !== 'ALL';
  const normalizedPaymentFilter = paymentMethodFilter.trim().toUpperCase();
  const isFilteringPayment =
    normalizedPaymentFilter !== '' && normalizedPaymentFilter !== 'ALL';
  const normalizedSearch = searchQuery.trim().toLowerCase();

  // Helper to check category matching consistently with other POS reports
  const matchesCategory = (item: Transaction['items'][number], prod?: Product): boolean => {
    if (!isFilteringCategory) return true;
    const itemCat = (prod?.category || (item.isService ? 'Jasa' : 'Umum')).trim();
    const isJasa = Boolean(
      item.isService || prod?.productType === 'JASA' || itemCat.toLowerCase() === 'jasa'
    );
    if (normalizedCategoryFilter === 'ALL_BARANG') return !isJasa;
    if (normalizedCategoryFilter === 'ALL_JASA') return isJasa;
    if (normalizedCategoryFilter === 'JASA') return isJasa || itemCat.toUpperCase() === 'JASA';
    return itemCat.toUpperCase() === normalizedCategoryFilter;
  };

  // Pre-seed trend buckets across the chosen date range
  const trendMap = new Map<string, SalesTrendPoint>();
  if (range.type === 'HARIAN') {
    for (let hour = 0; hour < 24; hour++) {
      const hh = String(hour).padStart(2, '0');
      trendMap.set(hh, {
        key: hh,
        label: `${hh}:00`,
        fullLabel: `${range.shortLabel} · ${hh}:00–${hh}:59`,
        pendapatan: 0,
        hpp: 0,
        keuntunganKotor: 0,
        transaksi: 0,
        kuantitas: 0,
      });
    }
  } else {
    const startDt = parseLocalYmd(range.startDateStr);
    for (let i = 0; i < range.daysCount; i++) {
      const d = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate() + i);
      const ymd = formatLocalDateYmd(d);
      const shortDay = d.toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
      });
      const fullDay = d.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      trendMap.set(ymd, {
        key: ymd,
        label: shortDay,
        fullLabel: fullDay,
        pendapatan: 0,
        hpp: 0,
        keuntunganKotor: 0,
        transaksi: 0,
        kuantitas: 0,
      });
    }
  }

  let totalRevenue = 0;
  let grossSalesBeforeDiscount = 0;
  let totalDiscountAndPoints = 0;
  let totalReturnedAmount = 0;
  let totalEstimatedCogs = 0;
  let fifoBackedCogs = 0;
  let transactionCount = 0;
  let fullReturnCount = 0;
  let totalUnitsSold = 0;

  interface MutableProductAgg {
    productId: string;
    productName: string;
    category: string;
    baseUnit: string;
    isService: boolean;
    totalQuantitySold: number;
    totalLineQuantity: number;
    unitCounts: Map<string, number>;
    txIds: Set<string>;
    totalSales: number;
    estimatedCogs: number;
  }

  const productAggMap = new Map<string, MutableProductAgg>();
  const paymentMap = new Map<string, { transactionCount: number; totalAmount: number }>();
  const includedTransactions: Transaction[] = [];

  for (let tIdx = 0; tIdx < transactions.length; tIdx++) {
    const tx = transactions[tIdx];
    if (!tx || typeof tx.timestamp !== 'number') continue;
    if (tx.timestamp < range.startTimestamp || tx.timestamp > range.endTimestamp) {
      continue;
    }

    const txMethod = String(tx.paymentMethod || 'CASH').toUpperCase();
    if (isFilteringPayment && txMethod !== normalizedPaymentFilter) {
      continue;
    }

    const rawFinal = Math.max(0, Number(tx.finalAmount) || 0);
    const rawReturned = Math.max(0, Number(tx.returnedAmount) || 0);
    const txNetRevenue = Math.max(0, rawFinal - rawReturned);

    if (tx.returnStatus === 'FULL' || (rawFinal > 0 && txNetRevenue <= 0)) {
      fullReturnCount += 1;
      totalReturnedAmount += rawReturned;
      continue;
    }

    // Build returned quantity map per itemIndex for partial returns
    const returnedQtyByIndex = new Map<number, number>();
    const returnedAmountByIndex = new Map<number, number>();
    if (Array.isArray(tx.returns)) {
      tx.returns.forEach((ret) => {
        (ret.items || []).forEach((ri) => {
          returnedQtyByIndex.set(
            ri.itemIndex,
            (returnedQtyByIndex.get(ri.itemIndex) || 0) + Math.max(0, ri.returnedQuantity || 0)
          );
          returnedAmountByIndex.set(
            ri.itemIndex,
            (returnedAmountByIndex.get(ri.itemIndex) || 0) + Math.max(0, ri.refundAmount || 0)
          );
        });
      });
    }

    const txItems = Array.isArray(tx.items) ? tx.items : [];
    const totalTxItemGross = txItems.reduce(
      (s, it) => s + Math.max(0, Number(it.totalAmount) || 0),
      0
    );

    // Ratio between invoice finalAmount (after discounts/points) and sum of item totals
    // Allows accurate item-level revenue attribution even when invoice-level membership discount / points apply
    const invoiceDiscountFactor =
      totalTxItemGross > 0 ? Math.max(0, rawFinal) / totalTxItemGross : 1;

    let txScopedRevenue = 0;
    let txScopedGrossBeforeDiscount = 0;
    let txScopedDiscountAndPoints = 0;
    let txScopedReturned = 0;
    let txScopedCogs = 0;
    let txScopedUnits = 0;
    let txHasMatchingItem = false;

    for (let iIdx = 0; iIdx < txItems.length; iIdx++) {
      const item = txItems[iIdx];
      const prod = productMap.get(item.productId);
      if (!matchesCategory(item, prod)) continue;

      const rawQty = Math.max(0, Number(item.quantity) || 0);
      const returnedQty = Math.min(rawQty, returnedQtyByIndex.get(iIdx) || 0);
      const netQty = Math.max(0, rawQty - returnedQty);
      const convFactor = Math.max(1, Number(item.conversionFactor) || 1);
      const netBaseUnits = netQty * convFactor;

      const itemGrossBeforeRet = Math.max(0, Number(item.totalAmount) || 0);
      const explicitItemRefund = returnedAmountByIndex.get(iIdx);
      const itemQtyKeepRatio = rawQty > 0 ? netQty / rawQty : 0;

      // Attributed revenue before returns & after invoice-level discount/points
      const attributedItemFinal = itemGrossBeforeRet * invoiceDiscountFactor;
      const itemReturned =
        explicitItemRefund !== undefined
          ? Math.min(attributedItemFinal, explicitItemRefund)
          : attributedItemFinal * (1 - itemQtyKeepRatio);
      const netItemRevenue = Math.max(0, attributedItemFinal - itemReturned);

      const fullItemCogs = getItemFifoCogs(item, prod);
      const netItemCogs = Math.round(fullItemCogs * itemQtyKeepRatio);
      const hasFifoTrace = Boolean(
        (item.batchDeductions && item.batchDeductions.length > 0) ||
          (item.costPrice !== undefined && item.costPrice > 0) ||
          item.isService ||
          item.isQuickSale
      );

      txHasMatchingItem = true;
      txScopedGrossBeforeDiscount += itemGrossBeforeRet;
      txScopedDiscountAndPoints += Math.max(0, itemGrossBeforeRet - attributedItemFinal);
      txScopedReturned += itemReturned;
      txScopedRevenue += netItemRevenue;
      txScopedCogs += netItemCogs;
      txScopedUnits += netBaseUnits;
      if (hasFifoTrace) {
        fifoBackedCogs += netItemCogs;
      }

      // Skip zero-qty returned items from Best-Selling ranking unless partial remains
      if (netQty > 0) {
        const aggKey = item.isQuickSale
          ? `quick_${(item.productName || 'Quick Sale').trim().toLowerCase()}`
          : item.productId || item.productName;
        const catName = (prod?.category || (item.isQuickSale ? 'Quick Sale' : item.isService ? 'Jasa' : 'Umum')).trim();
        const baseUnit = prod?.baseUnit || item.unitName || 'PCS';
        const unitName = item.unitName || baseUnit;

        let agg = productAggMap.get(aggKey);
        if (!agg) {
          agg = {
            productId: item.productId || aggKey,
            productName: item.productName || prod?.name || 'Produk',
            category: catName,
            baseUnit,
            isService: Boolean(item.isService || prod?.productType === 'JASA'),
            totalQuantitySold: 0,
            totalLineQuantity: 0,
            unitCounts: new Map(),
            txIds: new Set(),
            totalSales: 0,
            estimatedCogs: 0,
          };
          productAggMap.set(aggKey, agg);
        }

        agg.totalQuantitySold += netBaseUnits;
        agg.totalLineQuantity += netQty;
        agg.unitCounts.set(unitName, (agg.unitCounts.get(unitName) || 0) + netQty);
        agg.txIds.add(tx.id);
        agg.totalSales += netItemRevenue;
        agg.estimatedCogs += netItemCogs;
      }
    }

    if (!txHasMatchingItem) {
      continue;
    }

    // When unfiltered by category, lock invoice revenue exactly to txNetRevenue
    // so rounding across multi-item ratios never drifts even Rp 1 from receipt totals.
    const finalTxRevenue = isFilteringCategory ? Math.round(txScopedRevenue) : txNetRevenue;
    const finalTxGross = isFilteringCategory
      ? Math.round(txScopedGrossBeforeDiscount)
      : Math.max(finalTxRevenue, Number(tx.subtotal) || Math.round(txScopedGrossBeforeDiscount));
    const finalTxDiscounts = isFilteringCategory
      ? Math.round(txScopedDiscountAndPoints)
      : Math.max(0, (Number(tx.discount) || 0) + (Number(tx.pointsDiscountAmount) || 0));
    const finalTxReturned = isFilteringCategory ? Math.round(txScopedReturned) : rawReturned;

    totalRevenue += finalTxRevenue;
    grossSalesBeforeDiscount += finalTxGross;
    totalDiscountAndPoints += finalTxDiscounts;
    totalReturnedAmount += finalTxReturned;
    totalEstimatedCogs += txScopedCogs;
    totalUnitsSold += txScopedUnits;
    transactionCount += 1;
    includedTransactions.push(tx);

    // Trend bucket update
    const txDate = new Date(tx.timestamp);
    const bucketKey =
      range.type === 'HARIAN'
        ? String(txDate.getHours()).padStart(2, '0')
        : formatLocalDateYmd(txDate);
    const bucket = trendMap.get(bucketKey);
    if (bucket) {
      bucket.pendapatan += finalTxRevenue;
      bucket.hpp += txScopedCogs;
      bucket.keuntunganKotor = bucket.pendapatan - bucket.hpp;
      bucket.transaksi += 1;
      bucket.kuantitas += txScopedUnits;
    }

    // Payment method bucket update
    const pAgg = paymentMap.get(txMethod) || { transactionCount: 0, totalAmount: 0 };
    pAgg.transactionCount += 1;
    pAgg.totalAmount += finalTxRevenue;
    paymentMap.set(txMethod, pAgg);
  }

  const estimatedGrossProfit = totalRevenue - totalEstimatedCogs;
  const grossMarginPercent = totalRevenue > 0 ? (estimatedGrossProfit / totalRevenue) * 100 : 0;
  const fifoVerifiedSharePercent =
    totalEstimatedCogs > 0 ? Math.min(100, (fifoBackedCogs / totalEstimatedCogs) * 100) : 100;
  const averageBasket = transactionCount > 0 ? totalRevenue / transactionCount : 0;

  let bestSellingProducts: BestSellingProductItem[] = Array.from(productAggMap.values()).map((agg) => {
    const roundedSales = Math.round(agg.totalSales);
    const profit = roundedSales - agg.estimatedCogs;
    const margin = roundedSales > 0 ? (profit / roundedSales) * 100 : 0;
    const revenueShare = totalRevenue > 0 ? (roundedSales / totalRevenue) * 100 : 0;

    const unitBreakdown = Array.from(agg.unitCounts.entries())
      .map(([unitName, quantity]) => ({ unitName, quantity }))
      .sort((a, b) => b.quantity - a.quantity);

    const unitBreakdownLabel =
      unitBreakdown.length > 0
        ? unitBreakdown.map((u) => `${u.quantity} ${u.unitName}`).join(' + ')
        : `${agg.totalQuantitySold} ${agg.baseUnit}`;

    return {
      rank: 0,
      productId: agg.productId,
      productName: agg.productName,
      category: agg.category,
      baseUnit: agg.baseUnit,
      isService: agg.isService,
      totalQuantitySold: agg.totalQuantitySold,
      totalLineQuantity: agg.totalLineQuantity,
      unitBreakdown,
      unitBreakdownLabel,
      transactionCount: agg.txIds.size,
      totalSales: roundedSales,
      estimatedCogs: agg.estimatedCogs,
      estimatedGrossProfit: profit,
      grossMarginPercent: margin,
      revenueSharePercent: revenueShare,
    };
  });

  if (normalizedSearch) {
    bestSellingProducts = bestSellingProducts.filter(
      (item) =>
        item.productName.toLowerCase().includes(normalizedSearch) ||
        item.category.toLowerCase().includes(normalizedSearch)
    );
  }

  bestSellingProducts.sort((a, b) => {
    if (sortBy === 'REVENUE') {
      if (b.totalSales !== a.totalSales) return b.totalSales - a.totalSales;
      return b.totalQuantitySold - a.totalQuantitySold;
    }
    if (sortBy === 'GROSS_PROFIT') {
      if (b.estimatedGrossProfit !== a.estimatedGrossProfit) {
        return b.estimatedGrossProfit - a.estimatedGrossProfit;
      }
      return b.totalSales - a.totalSales;
    }
    // Default QUANTITY (Produk Terlaris)
    if (b.totalQuantitySold !== a.totalQuantitySold) {
      return b.totalQuantitySold - a.totalQuantitySold;
    }
    return b.totalSales - a.totalSales;
  });

  bestSellingProducts = bestSellingProducts.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));

  const paymentBreakdown: PaymentBreakdownItem[] = Array.from(paymentMap.entries())
    .map(([method, data]) => ({
      method,
      transactionCount: data.transactionCount,
      totalAmount: data.totalAmount,
      sharePercent: totalRevenue > 0 ? (data.totalAmount / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  includedTransactions.sort((a, b) => b.timestamp - a.timestamp);

  return {
    range,
    summary: {
      totalRevenue,
      grossSalesBeforeDiscount,
      totalDiscountAndPoints,
      totalReturnedAmount,
      totalEstimatedCogs,
      estimatedGrossProfit,
      grossMarginPercent,
      fifoVerifiedSharePercent,
      transactionCount,
      fullReturnCount,
      averageBasket,
      totalUnitsSold,
      uniqueProductsSold: bestSellingProducts.length,
    },
    bestSellingProducts,
    trendSeries: Array.from(trendMap.values()),
    paymentBreakdown,
    includedTransactions,
  };
}
