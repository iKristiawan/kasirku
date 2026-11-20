import { Product, RestockOrder, Transaction } from '../types/pos';
import { getItemFifoCogs } from './fifoUtils';

export type TurnoverSpeedCategory =
  | 'VERY_SLOW'
  | 'SLOW'
  | 'NORMAL'
  | 'FAST'
  | 'OUT_OF_STOCK';

export interface ProductTurnoverMetric {
  product: Product;
  currentStock: number;
  inventoryCostValue: number;
  sellingPriceBase: number;
  unitsSoldInPeriod: number;
  cogsSoldInPeriod: number;
  revenueInPeriod: number;
  avgDailySales: number;
  /** Annualized Stock Turn Rate (x per year) */
  turnRatePerYear: number;
  /** Estimated Days of Inventory / turnover cycle days (Infinity if stock > 0 and zero sales in period) */
  daysOfInventory: number;
  daysSinceLastMovement: number | null;
  lastSoldTimestamp: number | null;
  speedCategory: TurnoverSpeedCategory;
  isSlowOver90Days: boolean;
  recommendedDiscountPercent: number;
  suggestedLiquidationPrice: number;
  estimatedMarginAfterDiscountPercent: number;
  isSuggestedBelowCost: boolean;
  potentialCashRecovered: number;
}

export interface StockTurnoverAnalysisResult {
  lookbackDays: 30 | 60 | 90;
  items: ProductTurnoverMetric[];
  verySlowItems: ProductTurnoverMetric[];
  summary: {
    totalPhysicalSkus: number;
    verySlowCount: number;
    slowCount: number;
    normalCount: number;
    fastCount: number;
    outOfStockCount: number;
    verySlowCapitalValue: number;
    totalInventoryValue: number;
    avgTurnRate: number;
    avgDaysToTurn: number | null;
    potentialCashRecovered: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function analyzeStockTurnRate(params: {
  products: Product[];
  transactions: Transaction[];
  purchases?: RestockOrder[];
  lookbackDays?: 30 | 60 | 90;
  nowTs?: number;
}): StockTurnoverAnalysisResult {
  const {
    products,
    transactions,
    purchases = [],
    lookbackDays = 90,
    nowTs = Date.now(),
  } = params;

  const physicalProducts = products.filter((p) => p.productType !== 'JASA');
  const cutoffTs = nowTs - lookbackDays * DAY_MS;

  const salesByProduct = new Map<
    string,
    {
      unitsSold: number;
      cogsSold: number;
      revenue: number;
      lastSoldTs: number;
    }
  >();

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];
    if (!tx || tx.timestamp < cutoffTs || tx.timestamp > nowTs) continue;
    for (let j = 0; j < tx.items.length; j++) {
      const item = tx.items[j];
      if (!item || item.isService || item.isQuickSale) continue;
      const baseUnits = Math.max(0, (item.quantity || 0) * (item.conversionFactor || 1));
      if (baseUnits <= 0) continue;
      const fifoCogs = getItemFifoCogs(item);
      const current = salesByProduct.get(item.productId) || {
        unitsSold: 0,
        cogsSold: 0,
        revenue: 0,
        lastSoldTs: 0,
      };
      current.unitsSold += baseUnits;
      current.cogsSold += fifoCogs;
      current.revenue += item.totalAmount || 0;
      if (tx.timestamp > current.lastSoldTs) {
        current.lastSoldTs = tx.timestamp;
      }
      salesByProduct.set(item.productId, current);
    }
  }

  // Fallback last purchase/batch timestamp to measure idle age for dead stock
  const lastPurchaseByProduct = new Map<string, number>();
  for (let i = 0; i < purchases.length; i++) {
    const po = purchases[i];
    if (!po || po.status !== 'SELESAI') continue;
    const poTs = po.createdAt || (po.date ? new Date(po.date).getTime() : 0);
    if (!poTs || !Number.isFinite(poTs)) continue;
    for (let j = 0; j < po.items.length; j++) {
      const item = po.items[j];
      const prev = lastPurchaseByProduct.get(item.productId) || 0;
      if (poTs > prev) lastPurchaseByProduct.set(item.productId, poTs);
    }
  }

  const items: ProductTurnoverMetric[] = physicalProducts.map((product) => {
    const currentStock = Math.max(0, product.stockInBaseUnit || 0);
    const costPrice = Math.max(0, product.costPrice || 0);
    const inventoryCostValue = currentStock * costPrice;
    const sellingPriceBase = product.units?.[0]?.sellingPrice || 0;

    const salesStats = salesByProduct.get(product.id);
    const unitsSoldInPeriod = salesStats?.unitsSold || 0;
    const cogsSoldInPeriod =
      salesStats && salesStats.cogsSold > 0
        ? salesStats.cogsSold
        : unitsSoldInPeriod * costPrice;
    const revenueInPeriod = salesStats?.revenue || 0;
    const lastSoldTimestamp = salesStats?.lastSoldTs || null;

    const avgDailySales = unitsSoldInPeriod / lookbackDays;

    // Annualized turnover rate (how many times stock turns in 365 days)
    let turnRatePerYear = 0;
    if (currentStock > 0 && unitsSoldInPeriod > 0) {
      if (inventoryCostValue > 0 && cogsSoldInPeriod > 0) {
        turnRatePerYear = (cogsSoldInPeriod * (365 / lookbackDays)) / inventoryCostValue;
      } else {
        turnRatePerYear = (unitsSoldInPeriod * (365 / lookbackDays)) / currentStock;
      }
      turnRatePerYear = Math.round(turnRatePerYear * 100) / 100;
    }

    // Days of inventory (perputaran stok dalam hari)
    let daysOfInventory = 0;
    if (currentStock <= 0) {
      daysOfInventory = 0;
    } else if (avgDailySales > 0) {
      daysOfInventory = Math.max(1, Math.round(currentStock / avgDailySales));
    } else {
      daysOfInventory = Number.POSITIVE_INFINITY;
    }

    // Determine idle days since last sale or batch arrival
    let referenceTs = lastSoldTimestamp || 0;
    if (!referenceTs && Array.isArray(product.batches) && product.batches.length > 0) {
      for (let b = 0; b < product.batches.length; b++) {
        const bTs = product.batches[b].receivedAt || 0;
        if (bTs > referenceTs) referenceTs = bTs;
      }
    }
    if (!referenceTs) {
      referenceTs = lastPurchaseByProduct.get(product.id) || 0;
    }
    const daysSinceLastMovement =
      referenceTs > 0 ? Math.max(0, Math.floor((nowTs - referenceTs) / DAY_MS)) : null;

    let speedCategory: TurnoverSpeedCategory;
    if (currentStock <= 0) {
      speedCategory = 'OUT_OF_STOCK';
    } else if (daysOfInventory > 90 || unitsSoldInPeriod === 0) {
      speedCategory = 'VERY_SLOW';
    } else if (daysOfInventory > 60) {
      speedCategory = 'SLOW';
    } else if (daysOfInventory > 30) {
      speedCategory = 'NORMAL';
    } else {
      speedCategory = 'FAST';
    }

    const isSlowOver90Days = speedCategory === 'VERY_SLOW';

    // Liquidation discount recommendation based on slow-moving severity while protecting margin where possible
    let recommendedDiscountPercent = 0;
    if (currentStock > 0 && sellingPriceBase > 0) {
      if (unitsSoldInPeriod === 0 || daysOfInventory > 180) {
        recommendedDiscountPercent = 25;
      } else if (daysOfInventory > 120) {
        recommendedDiscountPercent = 15;
      } else if (daysOfInventory > 90) {
        recommendedDiscountPercent = 10;
      } else if (daysOfInventory > 60) {
        recommendedDiscountPercent = 5;
      }
    }

    const rawDiscountedPrice = sellingPriceBase * (1 - recommendedDiscountPercent / 100);
    const suggestedLiquidationPrice =
      sellingPriceBase > 0
        ? Math.max(100, Math.round(rawDiscountedPrice / 100) * 100)
        : 0;

    const estimatedMarginAfterDiscountPercent =
      suggestedLiquidationPrice > 0
        ? Math.round(((suggestedLiquidationPrice - costPrice) / suggestedLiquidationPrice) * 1000) / 10
        : 0;

    const isSuggestedBelowCost =
      costPrice > 0 && suggestedLiquidationPrice > 0 && suggestedLiquidationPrice < costPrice;

    const potentialCashRecovered =
      isSlowOver90Days && suggestedLiquidationPrice > 0
        ? currentStock * suggestedLiquidationPrice
        : 0;

    return {
      product,
      currentStock,
      inventoryCostValue,
      sellingPriceBase,
      unitsSoldInPeriod,
      cogsSoldInPeriod,
      revenueInPeriod,
      avgDailySales,
      turnRatePerYear,
      daysOfInventory,
      daysSinceLastMovement,
      lastSoldTimestamp,
      speedCategory,
      isSlowOver90Days,
      recommendedDiscountPercent,
      suggestedLiquidationPrice,
      estimatedMarginAfterDiscountPercent,
      isSuggestedBelowCost,
      potentialCashRecovered,
    };
  });

  // Sort: VERY_SLOW with highest capital tied up first, then SLOW, NORMAL, FAST, OUT_OF_STOCK
  const speedOrder: Record<TurnoverSpeedCategory, number> = {
    VERY_SLOW: 0,
    SLOW: 1,
    NORMAL: 2,
    FAST: 3,
    OUT_OF_STOCK: 4,
  };

  items.sort((a, b) => {
    const orderDiff = speedOrder[a.speedCategory] - speedOrder[b.speedCategory];
    if (orderDiff !== 0) return orderDiff;
    if (b.inventoryCostValue !== a.inventoryCostValue) {
      return b.inventoryCostValue - a.inventoryCostValue;
    }
    return b.daysOfInventory - a.daysOfInventory;
  });

  const verySlowItems = items.filter((item) => item.isSlowOver90Days);
  const slowCount = items.filter((i) => i.speedCategory === 'SLOW').length;
  const normalCount = items.filter((i) => i.speedCategory === 'NORMAL').length;
  const fastCount = items.filter((i) => i.speedCategory === 'FAST').length;
  const outOfStockCount = items.filter((i) => i.speedCategory === 'OUT_OF_STOCK').length;

  const activeItems = items.filter((i) => i.currentStock > 0);
  const finiteDaysItems = activeItems.filter((i) => Number.isFinite(i.daysOfInventory));
  const avgTurnRate =
    activeItems.length > 0
      ? Math.round((activeItems.reduce((s, i) => s + i.turnRatePerYear, 0) / activeItems.length) * 100) /
        100
      : 0;
  const avgDaysToTurn =
    finiteDaysItems.length > 0
      ? Math.round(
          finiteDaysItems.reduce((s, i) => s + i.daysOfInventory, 0) / finiteDaysItems.length
        )
      : null;

  const verySlowCapitalValue = verySlowItems.reduce((s, i) => s + i.inventoryCostValue, 0);
  const totalInventoryValue = items.reduce((s, i) => s + i.inventoryCostValue, 0);
  const potentialCashRecovered = verySlowItems.reduce(
    (s, i) => s + i.potentialCashRecovered,
    0
  );

  return {
    lookbackDays,
    items,
    verySlowItems,
    summary: {
      totalPhysicalSkus: items.length,
      verySlowCount: verySlowItems.length,
      slowCount,
      normalCount,
      fastCount,
      outOfStockCount,
      verySlowCapitalValue,
      totalInventoryValue,
      avgTurnRate,
      avgDaysToTurn,
      potentialCashRecovered,
    },
  };
}
