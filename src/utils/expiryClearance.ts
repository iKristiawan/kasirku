import { Product } from '../types/pos';
import { formatNumber, formatRupiah } from './formatters';

export interface ExpiringProductItem {
  product: Product;
  earliestExpiryDate: string;
  expirySource: 'PRODUCT' | 'BATCH';
  batchNumber?: string;
  atRiskUnits: number;
  atRiskCostValue: number;
  normalSellingPrice: number;
  daysRemaining: number;
  isExpired: boolean;
  isWithin7Days: boolean;
  isWithin30Days: boolean;
  recommendedDiscountPercent: number;
  suggestedPromoPrice: number;
  estimatedMarginPercent: number;
  isSuggestedBelowCost: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseLocalDateStart(dateStr: string): number | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const dt = new Date(year, month, day);
    dt.setHours(0, 0, 0, 0);
    return dt.getTime();
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime();
}

export function analyzeExpiringProducts(
  products: Product[],
  nowTs: number = Date.now()
): {
  todayStartTs: number;
  allTracked: ExpiringProductItem[];
  within30Days: ExpiringProductItem[];
  within7Days: ExpiringProductItem[];
  expired: ExpiringProductItem[];
  totalAtRiskUnits30d: number;
  totalAtRiskCost30d: number;
} {
  const todayDate = new Date(nowTs);
  todayDate.setHours(0, 0, 0, 0);
  const todayStartTs = todayDate.getTime();

  const items: ExpiringProductItem[] = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    if (!product || product.productType === 'JASA') continue;
    if ((product.stockInBaseUnit || 0) <= 0) continue;

    // Inspect both product-level expiryDate and remaining FIFO batch expiry dates
    let bestExpiryTs: number | null = null;
    let bestExpiryDateStr = '';
    let expirySource: 'PRODUCT' | 'BATCH' = 'PRODUCT';
    let batchNumber: string | undefined;
    let atRiskUnits = Math.max(0, product.stockInBaseUnit || 0);

    if (product.expiryDate) {
      const prodExpTs = parseLocalDateStart(product.expiryDate);
      if (prodExpTs !== null) {
        bestExpiryTs = prodExpTs;
        bestExpiryDateStr = product.expiryDate;
        expirySource = 'PRODUCT';
      }
    }

    if (Array.isArray(product.batches) && product.batches.length > 0) {
      for (let b = 0; b < product.batches.length; b++) {
        const batch = product.batches[b];
        if (!batch || batch.remainingQuantity <= 0 || !batch.expiryDate) continue;
        const batchExpTs = parseLocalDateStart(batch.expiryDate);
        if (batchExpTs === null) continue;
        if (bestExpiryTs === null || batchExpTs < bestExpiryTs) {
          bestExpiryTs = batchExpTs;
          bestExpiryDateStr = batch.expiryDate;
          expirySource = 'BATCH';
          batchNumber = batch.batchNumber;
          atRiskUnits = Math.max(0, batch.remainingQuantity);
        }
      }
    }

    if (bestExpiryTs === null || !bestExpiryDateStr) continue;

    const daysRemaining = Math.round((bestExpiryTs - todayStartTs) / DAY_MS);
    const isExpired = daysRemaining < 0;
    const isWithin7Days = !isExpired && daysRemaining <= 7;
    const isWithin30Days = !isExpired && daysRemaining <= 30;

    const costPrice = Math.max(0, product.costPrice || 0);
    const normalSellingPrice = product.units?.[0]?.sellingPrice || 0;
    const atRiskCostValue = atRiskUnits * costPrice;

    let recommendedDiscountPercent = 0;
    if (!isExpired && normalSellingPrice > 0) {
      if (daysRemaining <= 7) {
        recommendedDiscountPercent = 30;
      } else if (daysRemaining <= 15) {
        recommendedDiscountPercent = 20;
      } else if (daysRemaining <= 30) {
        recommendedDiscountPercent = 10;
      }
    }

    const rawPromoPrice = normalSellingPrice * (1 - recommendedDiscountPercent / 100);
    const suggestedPromoPrice =
      normalSellingPrice > 0
        ? Math.max(100, Math.round(rawPromoPrice / 100) * 100)
        : 0;

    const estimatedMarginPercent =
      suggestedPromoPrice > 0
        ? Math.round(((suggestedPromoPrice - costPrice) / suggestedPromoPrice) * 1000) / 10
        : 0;

    const isSuggestedBelowCost =
      costPrice > 0 && suggestedPromoPrice > 0 && suggestedPromoPrice < costPrice;

    items.push({
      product,
      earliestExpiryDate: bestExpiryDateStr,
      expirySource,
      batchNumber,
      atRiskUnits,
      atRiskCostValue,
      normalSellingPrice,
      daysRemaining,
      isExpired,
      isWithin7Days,
      isWithin30Days,
      recommendedDiscountPercent,
      suggestedPromoPrice,
      estimatedMarginPercent,
      isSuggestedBelowCost,
    });
  }

  // Sort soonest expiry first
  items.sort((a, b) => a.daysRemaining - b.daysRemaining);

  const within30Days = items.filter((item) => item.isWithin30Days);
  const within7Days = items.filter((item) => item.isWithin7Days);
  const expired = items.filter((item) => item.isExpired);

  const totalAtRiskUnits30d = within30Days.reduce((sum, item) => sum + item.atRiskUnits, 0);
  const totalAtRiskCost30d = within30Days.reduce((sum, item) => sum + item.atRiskCostValue, 0);

  return {
    todayStartTs,
    allTracked: items,
    within30Days,
    within7Days,
    expired,
    totalAtRiskUnits30d,
    totalAtRiskCost30d,
  };
}

export function buildClearanceWhatsAppBroadcast(
  items: ExpiringProductItem[],
  storeName?: string
): string {
  const topList = items.slice(0, 12);
  const headerStore = storeName?.trim() || 'Toko Kami';
  const lines = topList.map((item, idx) => {
    const promoText =
      item.recommendedDiscountPercent > 0
        ? `Promo -${item.recommendedDiscountPercent}% -> ${formatRupiah(item.suggestedPromoPrice)} (Normal ${formatRupiah(item.normalSellingPrice)})`
        : `${formatRupiah(item.normalSellingPrice)}`;
    return `${idx + 1}. *${item.product.name}* (${formatNumber(item.atRiskUnits)} ${item.product.baseUnit} · Exp: ${item.earliestExpiryDate}) — ${promoText}`;
  });

  return [
    `*PROMO CUCI GUDANG — ${headerStore.toUpperCase()}*`,
    `Stok pilihan berkualitas dengan harga spesial terbatas sebelum masa simpan berakhir:`,
    '',
    ...lines,
    '',
    `Silakan kunjungi kasir toko atau balas pesan ini untuk pemesanan cepat selama persediaan masih ada.`,
  ].join('\n');
}
