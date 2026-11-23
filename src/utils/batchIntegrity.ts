import { Product, ProductBatch, StockOpnameBatchDetail, StockOpnameItem } from '../types/pos';
import { reconcileBatchStockIntegrity } from './fifoUtils';

export type BatchIntegrityIssueCode =
  | 'NEGATIVE_BATCH_QTY'
  | 'NEGATIVE_TOTAL_STOCK'
  | 'STOCK_BATCH_MISMATCH'
  | 'NEGATIVE_BATCH_COST'
  | 'NO_BATCHES';

export type BatchIntegritySeverity = 'CRITICAL' | 'WARNING';

export interface BatchIntegrityIssue {
  code: BatchIntegrityIssueCode;
  severity: BatchIntegritySeverity;
  message: string;
  batchId?: string;
  batchNumber?: string;
  recordedValue?: number;
  expectedValue?: number;
}

export interface ProductBatchIntegrityResult {
  product: Product;
  hasBatches: boolean;
  batchCount: number;
  batchSum: number;
  discrepancy: number; // stockInBaseUnit - batchSum
  negativeBatches: ProductBatch[];
  negativeCostBatches: ProductBatch[];
  hasNegativeTotal: boolean;
  hasNegativeBatch: boolean;
  hasBatchMismatch: boolean;
  hasNegativeCost: boolean;
  hasMissingBatches: boolean;
  hasCriticalIssue: boolean;
  hasIssue: boolean;
  issues: BatchIntegrityIssue[];
}

export interface BatchIntegrityCheckReport {
  checkedAt: number;
  source: 'STARTUP' | 'CLOUD_SYNC' | 'POST_OPNAME' | 'MANUAL';
  totalPhysicalProducts: number;
  totalBatchesScanned: number;
  validProductsCount: number;
  criticalIssuesCount: number;
  warningIssuesCount: number;
  negativeBatchProductsCount: number;
  negativeBatchEntriesCount: number;
  negativeTotalStockCount: number;
  mismatchProductsCount: number;
  negativeCostProductsCount: number;
  missingBatchesCount: number;
  isClean: boolean;
  issueItems: ProductBatchIntegrityResult[];
  warningItems: ProductBatchIntegrityResult[];
  results: ProductBatchIntegrityResult[];
}

const EPSILON = 0.0001;

const roundStock = (value: number): number => {
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
};

/**
 * Automated batch integrity verification script executed on startup, cloud hydration,
 * and after stock opname/mutations. Detects:
 * 1. Negative batch quantities (`remainingQuantity < 0` or `initialQuantity < 0`)
 * 2. Negative product master stock (`stockInBaseUnit < 0`)
 * 3. Mismatch between `stockInBaseUnit` and `sum(batches.remainingQuantity)`
 * 4. Negative batch unit cost (`costPrice < 0`)
 * 5. Physical stock > 0 with missing batch records (warning)
 */
export function runBatchIntegrityCheck(
  products: Product[],
  options?: { source?: 'STARTUP' | 'CLOUD_SYNC' | 'POST_OPNAME' | 'MANUAL'; checkedAt?: number }
): BatchIntegrityCheckReport {
  const checkedAt = options?.checkedAt ?? Date.now();
  const source = options?.source ?? 'STARTUP';
  const physicalProducts = (products || []).filter((p) => (p.productType || 'BARANG') !== 'JASA');

  let totalBatchesScanned = 0;
  let validProductsCount = 0;
  let negativeBatchProductsCount = 0;
  let negativeBatchEntriesCount = 0;
  let negativeTotalStockCount = 0;
  let mismatchProductsCount = 0;
  let negativeCostProductsCount = 0;
  let missingBatchesCount = 0;

  const results: ProductBatchIntegrityResult[] = physicalProducts.map((p) => {
    const batches = Array.isArray(p.batches) ? p.batches : [];
    totalBatchesScanned += batches.length;

    const hasBatches = batches.length > 0;
    const stockInBaseUnit = Number.isFinite(p.stockInBaseUnit) ? p.stockInBaseUnit : 0;
    const batchSum = roundStock(
      batches.reduce((acc, b) => acc + (Number.isFinite(b.remainingQuantity) ? b.remainingQuantity : 0), 0)
    );

    const negativeBatches = batches.filter(
      (b) => (b.remainingQuantity ?? 0) < 0 || (b.initialQuantity ?? 0) < 0
    );
    const negativeCostBatches = batches.filter((b) => (b.costPrice ?? 0) < 0);
    const hasNegativeTotal = stockInBaseUnit < 0;
    const hasNegativeBatch = negativeBatches.length > 0;
    const hasNegativeCost = negativeCostBatches.length > 0;
    const discrepancy = hasBatches ? roundStock(stockInBaseUnit - batchSum) : 0;
    const hasBatchMismatch = hasBatches && Math.abs(discrepancy) > EPSILON;
    const hasMissingBatches = !hasBatches && stockInBaseUnit > EPSILON;

    const issues: BatchIntegrityIssue[] = [];

    if (hasNegativeTotal) {
      negativeTotalStockCount++;
      issues.push({
        code: 'NEGATIVE_TOTAL_STOCK',
        severity: 'CRITICAL',
        message: `Total stok produk "${p.name}" bernilai negatif (${stockInBaseUnit} ${p.baseUnit}).`,
        recordedValue: stockInBaseUnit,
        expectedValue: Math.max(0, batchSum),
      });
    }

    if (hasNegativeBatch) {
      negativeBatchProductsCount++;
      negativeBatchEntriesCount += negativeBatches.length;
      negativeBatches.forEach((b) => {
        issues.push({
          code: 'NEGATIVE_BATCH_QTY',
          severity: 'CRITICAL',
          batchId: b.id,
          batchNumber: b.batchNumber || b.id,
          recordedValue: b.remainingQuantity ?? 0,
          expectedValue: 0,
          message: `Batch ${b.batchNumber || b.id} memiliki sisa stok negatif (${b.remainingQuantity ?? 0} ${p.baseUnit}).`,
        });
      });
    }

    if (hasBatchMismatch) {
      mismatchProductsCount++;
      issues.push({
        code: 'STOCK_BATCH_MISMATCH',
        severity: 'CRITICAL',
        recordedValue: stockInBaseUnit,
        expectedValue: batchSum,
        message: `Total stok utama (${stockInBaseUnit} ${p.baseUnit}) tidak cocok dengan jumlah seluruh batch (${batchSum} ${p.baseUnit}), selisih ${discrepancy > 0 ? `+${discrepancy}` : discrepancy}.`,
      });
    }

    if (hasNegativeCost) {
      negativeCostProductsCount++;
      negativeCostBatches.forEach((b) => {
        issues.push({
          code: 'NEGATIVE_BATCH_COST',
          severity: 'CRITICAL',
          batchId: b.id,
          batchNumber: b.batchNumber || b.id,
          recordedValue: b.costPrice,
          expectedValue: Math.max(0, p.costPrice || 0),
          message: `Batch ${b.batchNumber || b.id} memiliki HPP negatif (${b.costPrice}).`,
        });
      });
    }

    if (hasMissingBatches) {
      missingBatchesCount++;
      issues.push({
        code: 'NO_BATCHES',
        severity: 'WARNING',
        recordedValue: 0,
        expectedValue: stockInBaseUnit,
        message: `Produk memiliki stok ${stockInBaseUnit} ${p.baseUnit} tetapi belum memiliki kartu batch FIFO.`,
      });
    }

    const hasCriticalIssue =
      hasNegativeTotal || hasNegativeBatch || hasBatchMismatch || hasNegativeCost;
    const hasIssue = hasCriticalIssue;

    if (!hasCriticalIssue && !hasMissingBatches) {
      validProductsCount++;
    }

    return {
      product: p,
      hasBatches,
      batchCount: batches.length,
      batchSum,
      discrepancy,
      negativeBatches,
      negativeCostBatches,
      hasNegativeTotal,
      hasNegativeBatch,
      hasBatchMismatch,
      hasNegativeCost,
      hasMissingBatches,
      hasCriticalIssue,
      hasIssue,
      issues,
    };
  });

  const issueItems = results
    .filter((r) => r.hasCriticalIssue)
    .sort((a, b) => {
      const aScore = (a.hasNegativeBatch || a.hasNegativeTotal ? 1000 : 0) + Math.abs(a.discrepancy);
      const bScore = (b.hasNegativeBatch || b.hasNegativeTotal ? 1000 : 0) + Math.abs(b.discrepancy);
      return bScore - aScore;
    });

  const warningItems = results.filter((r) => !r.hasCriticalIssue && r.hasMissingBatches);

  return {
    checkedAt,
    source,
    totalPhysicalProducts: physicalProducts.length,
    totalBatchesScanned,
    validProductsCount,
    criticalIssuesCount: issueItems.length,
    warningIssuesCount: warningItems.length,
    negativeBatchProductsCount,
    negativeBatchEntriesCount,
    negativeTotalStockCount,
    mismatchProductsCount,
    negativeCostProductsCount,
    missingBatchesCount,
    isClean: issueItems.length === 0,
    issueItems,
    warningItems,
    results,
  };
}

/**
 * Repairs a single product so that:
 * - No batch has negative remainingQuantity, initialQuantity, or costPrice
 * - stockInBaseUnit >= 0
 * - sum(batches.remainingQuantity) === stockInBaseUnit
 */
export function buildBatchIntegrityAutoFix(product: Product): Product {
  if ((product.productType || 'BARANG') === 'JASA') return product;

  const fallbackCost = Math.max(0, product.costPrice || 0);
  const rawBatches = Array.isArray(product.batches) ? product.batches : [];
  const fixedBatches: ProductBatch[] = rawBatches.map((b) => {
    const cleanRemaining = Math.max(0, roundStock(Number.isFinite(b.remainingQuantity) ? b.remainingQuantity : 0));
    const cleanInitial = Math.max(
      cleanRemaining,
      roundStock(Number.isFinite(b.initialQuantity) ? b.initialQuantity : cleanRemaining)
    );
    const cleanCost = Math.max(0, Number.isFinite(b.costPrice) ? b.costPrice : fallbackCost);
    return {
      ...b,
      remainingQuantity: cleanRemaining,
      initialQuantity: cleanInitial,
      costPrice: cleanCost,
    };
  });

  const clampedBatchSum = roundStock(
    fixedBatches.reduce((sum, b) => sum + b.remainingQuantity, 0)
  );
  const targetStock =
    (product.stockInBaseUnit ?? 0) < 0
      ? Math.max(0, clampedBatchSum)
      : roundStock(Math.max(0, product.stockInBaseUnit || 0));

  const prepped: Product = {
    ...product,
    costPrice: fallbackCost,
    stockInBaseUnit: targetStock,
    batches: fixedBatches,
  };

  if (fixedBatches.length === 0 && targetStock === 0) {
    return prepped;
  }

  return reconcileBatchStockIntegrity(prepped);
}

/**
 * Fixes all products reported by `runBatchIntegrityCheck` (including negative batches,
 * negative master stocks, negative costs, and stock-vs-batch discrepancies).
 */
export function reconcileBatchIntegrityIssues(products: Product[]): {
  updatedProducts: Product[];
  fixedCount: number;
  fixedProducts: Product[];
} {
  const report = runBatchIntegrityCheck(products, { source: 'MANUAL' });
  const issueProductIds = new Set(report.issueItems.map((r) => r.product.id));

  if (issueProductIds.size === 0) {
    return {
      updatedProducts: products,
      fixedCount: 0,
      fixedProducts: [],
    };
  }

  const fixedProducts: Product[] = [];
  const updatedProducts = products.map((p) => {
    if (!issueProductIds.has(p.id)) return p;
    const fixed = buildBatchIntegrityAutoFix(p);
    fixedProducts.push(fixed);
    return fixed;
  });

  return {
    updatedProducts,
    fixedCount: fixedProducts.length,
    fixedProducts,
  };
}

/**
 * Applies multi-batch or SKU-level stock opname physical counts cleanly to both
 * `product.stockInBaseUnit` and `product.batches`, guaranteeing zero post-opname mismatch.
 */
export function applyMultiBatchOpnameToProduct(
  product: Product,
  params: {
    newStock: number;
    batchDetails?: StockOpnameBatchDetail[];
  }
): Product {
  if ((product.productType || 'BARANG') === 'JASA') return product;

  const { newStock, batchDetails } = params;
  const rawBatches = Array.isArray(product.batches) ? product.batches : [];

  if (batchDetails && batchDetails.length > 0 && rawBatches.length > 0) {
    const detailMap = new Map(batchDetails.map((d) => [d.batchId, d]));
    const updatedBatches: ProductBatch[] = rawBatches.map((b) => {
      const counted = detailMap.get(b.id);
      if (!counted) return { ...b, remainingQuantity: Math.max(0, b.remainingQuantity || 0) };
      const cleanQty = Math.max(0, roundStock(counted.physicalQty));
      return {
        ...b,
        remainingQuantity: cleanQty,
        initialQuantity: Math.max(b.initialQuantity || 0, cleanQty),
      };
    });

    const totalFromBatches = roundStock(
      updatedBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0)
    );

    const activeFifoBatch = [...updatedBatches]
      .sort((a, b) => {
        if (a.expiryDate && b.expiryDate) {
          return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        }
        if (a.expiryDate) return -1;
        if (b.expiryDate) return 1;
        return (a.receivedAt || 0) - (b.receivedAt || 0);
      })
      .find((b) => b.remainingQuantity > 0);

    return {
      ...product,
      stockInBaseUnit: totalFromBatches,
      batches: updatedBatches,
      costPrice:
        activeFifoBatch && activeFifoBatch.costPrice !== undefined
          ? activeFifoBatch.costPrice
          : product.costPrice,
    };
  }

  const clampedStock = Math.max(0, roundStock(newStock));
  if (rawBatches.length > 0) {
    return reconcileBatchStockIntegrity({
      ...product,
      stockInBaseUnit: clampedStock,
    });
  }

  return {
    ...product,
    stockInBaseUnit: clampedStock,
  };
}

/**
 * Reverts a previously applied StockOpnameItem (including batch-level adjustments if recorded).
 */
export function revertMultiBatchOpnameFromProduct(
  product: Product,
  item: StockOpnameItem
): Product {
  if ((product.productType || 'BARANG') === 'JASA') return product;

  const rawBatches = Array.isArray(product.batches) ? product.batches : [];
  if (item.batchDetails && item.batchDetails.length > 0 && rawBatches.length > 0) {
    const diffMap = new Map(item.batchDetails.map((d) => [d.batchId, d.difference]));
    const updatedBatches = rawBatches.map((b) => {
      const diff = diffMap.get(b.id);
      if (diff === undefined) return b;
      const revertedQty = Math.max(0, roundStock((b.remainingQuantity || 0) - diff));
      return {
        ...b,
        remainingQuantity: revertedQty,
      };
    });
    const revertedSum = roundStock(
      updatedBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0)
    );
    return {
      ...product,
      stockInBaseUnit: revertedSum,
      batches: updatedBatches,
    };
  }

  const revertedStock = Math.max(0, roundStock((product.stockInBaseUnit || 0) - item.difference));
  if (rawBatches.length > 0) {
    return reconcileBatchStockIntegrity({
      ...product,
      stockInBaseUnit: revertedStock,
    });
  }
  return {
    ...product,
    stockInBaseUnit: revertedStock,
  };
}

// ============================================================================
// BATCH ACQUISITION COST (HPP) SUMMARY & COMPARISON ANALYTICS
// ============================================================================

export interface BatchHppRow {
  rowId: string;
  productId: string;
  productName: string;
  sku: string;
  category: string;
  baseUnit: string;
  batchId: string;
  batchNumber: string;
  receivedDate: string;
  expiryDate?: string;
  supplierName: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitHpp: number;
  totalRemainingCostValue: number;
  productWeightedAvgHpp: number;
  hppDiffFromAvgPct: number;
  sellingPrice: number;
  unitMarginRp: number;
  unitMarginPct: number;
  isHighestUnitHppInProduct: boolean;
  isSyntheticBatch: boolean;
}

export interface ProductBatchHppSummary {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  baseUnit: string;
  activeBatchCount: number;
  totalRemainingQty: number;
  totalCapitalValue: number;
  weightedAvgHpp: number;
  minUnitHpp: number;
  maxUnitHpp: number;
  hppSpreadRp: number;
  hppSpreadPct: number;
  highestUnitBatchNumber: string;
  highestTotalValueBatchNumber: string;
  highestTotalBatchValue: number;
  sellingPrice: number;
  batches: BatchHppRow[];
}

export interface BatchHppSummaryResult {
  batchRows: BatchHppRow[];
  productSummaries: ProductBatchHppSummary[];
  totalActiveBatches: number;
  totalProductsWithBatches: number;
  totalActiveUnits: number;
  totalCapitalValue: number;
  globalWeightedAvgHpp: number;
  highestUnitHppBatch: BatchHppRow | null;
  highestCapitalBatch: BatchHppRow | null;
  widestSpreadProduct: ProductBatchHppSummary | null;
}

/**
 * Computes acquisition cost (HPP) analytics across every product batch so managers
 * can identify products with highest batch unit HPP, highest locked batch capital,
 * and supplier price hikes across historical batches.
 */
export function buildBatchHppSummary(products: Product[]): BatchHppSummaryResult {
  const physicalProducts = (products || []).filter((p) => (p.productType || 'BARANG') !== 'JASA');
  const batchRows: BatchHppRow[] = [];
  const productSummaries: ProductBatchHppSummary[] = [];

  let totalActiveUnits = 0;
  let totalCapitalValue = 0;

  physicalProducts.forEach((p) => {
    const baseUnitObj = (p.units || []).find((u) => (u.conversionFactor || 1) === 1) || p.units?.[0];
    const baseSellingPrice = baseUnitObj
      ? baseUnitObj.conversionFactor > 1
        ? Math.round((baseUnitObj.sellingPrice || 0) / baseUnitObj.conversionFactor)
        : baseUnitObj.sellingPrice || 0
      : 0;

    const rawBatches = Array.isArray(p.batches) ? p.batches : [];
    const activeBatches: Array<ProductBatch & { isSynthetic: boolean }> =
      rawBatches.length > 0
        ? rawBatches
            .filter((b) => (b.remainingQuantity || 0) > 0)
            .map((b) => ({ ...b, isSynthetic: false }))
        : (p.stockInBaseUnit || 0) > 0
        ? [
            {
              id: `batch_virtual_${p.id}`,
              batchNumber: 'BATCH-AWAL',
              receivedAt: 0,
              receivedDate: '-',
              expiryDate: p.expiryDate,
              initialQuantity: p.stockInBaseUnit,
              remainingQuantity: p.stockInBaseUnit,
              costPrice: Math.max(0, p.costPrice || 0),
              supplierName: 'Stok Awal',
              isSynthetic: true,
            },
          ]
        : [];

    if (activeBatches.length === 0) return;

    const prodTotalQty = activeBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);
    const prodTotalCap = activeBatches.reduce(
      (sum, b) => sum + (b.remainingQuantity || 0) * Math.max(0, b.costPrice ?? p.costPrice ?? 0),
      0
    );
    const weightedAvgHpp = prodTotalQty > 0 ? Math.round(prodTotalCap / prodTotalQty) : Math.max(0, p.costPrice || 0);

    const unitHpps = activeBatches.map((b) => Math.max(0, b.costPrice ?? p.costPrice ?? 0));
    const minUnitHpp = Math.min(...unitHpps);
    const maxUnitHpp = Math.max(...unitHpps);
    const hppSpreadRp = Math.max(0, maxUnitHpp - minUnitHpp);
    const hppSpreadPct = minUnitHpp > 0 ? Math.round((hppSpreadRp / minUnitHpp) * 1000) / 10 : 0;

    let highestUnitBatchNumber = activeBatches[0].batchNumber || '-';
    let highestTotalValueBatchNumber = activeBatches[0].batchNumber || '-';
    let highestTotalBatchValue = -1;

    const prodRows: BatchHppRow[] = activeBatches.map((b) => {
      const unitHpp = Math.max(0, b.costPrice ?? p.costPrice ?? 0);
      const remQty = Math.max(0, b.remainingQuantity || 0);
      const totalVal = Math.round(remQty * unitHpp);
      const diffFromAvgPct =
        weightedAvgHpp > 0 ? Math.round(((unitHpp - weightedAvgHpp) / weightedAvgHpp) * 1000) / 10 : 0;
      const unitMarginRp = baseSellingPrice - unitHpp;
      const unitMarginPct =
        baseSellingPrice > 0 ? Math.round((unitMarginRp / baseSellingPrice) * 1000) / 10 : 0;

      if (unitHpp === maxUnitHpp) {
        highestUnitBatchNumber = b.batchNumber || b.id;
      }
      if (totalVal > highestTotalBatchValue) {
        highestTotalBatchValue = totalVal;
        highestTotalValueBatchNumber = b.batchNumber || b.id;
      }

      const row: BatchHppRow = {
        rowId: `${p.id}__${b.id}`,
        productId: p.id,
        productName: p.name,
        sku: p.sku || p.barcode || '-',
        category: p.category || 'Umum',
        baseUnit: p.baseUnit || 'PCS',
        batchId: b.id,
        batchNumber: b.batchNumber || 'BATCH',
        receivedDate: b.receivedDate || '-',
        expiryDate: b.expiryDate,
        supplierName: b.supplierName || 'Supplier Umum',
        initialQuantity: b.initialQuantity || remQty,
        remainingQuantity: remQty,
        unitHpp,
        totalRemainingCostValue: totalVal,
        productWeightedAvgHpp: weightedAvgHpp,
        hppDiffFromAvgPct: diffFromAvgPct,
        sellingPrice: baseSellingPrice,
        unitMarginRp,
        unitMarginPct,
        isHighestUnitHppInProduct: unitHpp === maxUnitHpp && activeBatches.length > 1 && hppSpreadRp > 0,
        isSyntheticBatch: b.isSynthetic,
      };
      batchRows.push(row);
      return row;
    });

    totalActiveUnits += prodTotalQty;
    totalCapitalValue += prodTotalCap;

    productSummaries.push({
      productId: p.id,
      productName: p.name,
      sku: p.sku || p.barcode || '-',
      category: p.category || 'Umum',
      baseUnit: p.baseUnit || 'PCS',
      activeBatchCount: activeBatches.length,
      totalRemainingQty: prodTotalQty,
      totalCapitalValue: Math.round(prodTotalCap),
      weightedAvgHpp,
      minUnitHpp,
      maxUnitHpp,
      hppSpreadRp,
      hppSpreadPct,
      highestUnitBatchNumber,
      highestTotalValueBatchNumber,
      highestTotalBatchValue: Math.max(0, highestTotalBatchValue),
      sellingPrice: baseSellingPrice,
      batches: prodRows.sort((a, b) => b.unitHpp - a.unitHpp),
    });
  });

  const sortedByUnitHpp = [...batchRows].sort((a, b) => b.unitHpp - a.unitHpp || b.totalRemainingCostValue - a.totalRemainingCostValue);
  const sortedByTotalCap = [...batchRows].sort((a, b) => b.totalRemainingCostValue - a.totalRemainingCostValue || b.unitHpp - a.unitHpp);
  const sortedSpread = [...productSummaries]
    .filter((ps) => ps.hppSpreadRp > 0)
    .sort((a, b) => b.hppSpreadRp - a.hppSpreadRp);

  productSummaries.sort((a, b) => b.maxUnitHpp - a.maxUnitHpp || b.totalCapitalValue - a.totalCapitalValue);

  return {
    batchRows: sortedByUnitHpp,
    productSummaries,
    totalActiveBatches: batchRows.length,
    totalProductsWithBatches: productSummaries.length,
    totalActiveUnits: roundStock(totalActiveUnits),
    totalCapitalValue: Math.round(totalCapitalValue),
    globalWeightedAvgHpp: totalActiveUnits > 0 ? Math.round(totalCapitalValue / totalActiveUnits) : 0,
    highestUnitHppBatch: sortedByUnitHpp[0] || null,
    highestCapitalBatch: sortedByTotalCap[0] || null,
    widestSpreadProduct: sortedSpread[0] || null,
  };
}
