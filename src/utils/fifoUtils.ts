import { Product, ProductBatch, Transaction, TransactionItem, BatchDeduction, BatchReturnRestoration } from '../types/pos';

/**
 * Calculates the exact FIFO Cost of Goods Sold (HPP / COGS) for a sold item.
 * 
 * Rules:
 * 1. If batch deductions were recorded at time of transaction (pure FIFO audit trail),
 *    sum(deduction.quantity * deduction.costPrice) is the exact FIFO COGS incurred.
 * 2. If item.costPrice was recorded at checkout (weighted average FIFO HPP per base unit),
 *    baseUnits * item.costPrice is used.
 * 3. Fallback (for older data without FIFO tracking):
 *    baseUnits * (prod.costPrice || 0)
 */
export function getItemFifoCogs(item: TransactionItem, prod?: Product): number {
  const isTarikTunai =
    Boolean(item.isCashWithdrawal) ||
    (Boolean(item.isQuickSale) && /tarik\s*tunai/i.test(item.productName || ''));
  if (isTarikTunai) {
    const principalPerUnit =
      item.principalAmount !== undefined
        ? Math.max(0, item.principalAmount)
        : Math.max(0, item.costPrice || 0);
    return Math.round((item.quantity || 0) * principalPerUnit);
  }
  if (item.isService || item.isQuickSale) {
    return 0;
  }
  // 1. Audit trail from actual deducted FIFO batches
  if (item.batchDeductions && item.batchDeductions.length > 0) {
    const batchCostSum = item.batchDeductions.reduce((acc, b) => {
      const bQty = b.quantity || 0;
      const bCost = b.costPrice !== undefined ? b.costPrice : (prod?.costPrice || 0);
      return acc + (bQty * bCost);
    }, 0);

    if (batchCostSum > 0) {
      return Math.round(batchCostSum);
    }
  }

  // 2. FIFO weighted average cost price per base unit recorded at transaction time
  const baseUnits = (item.quantity || 0) * (item.conversionFactor || 1);
  if (item.costPrice !== undefined && item.costPrice > 0) {
    return Math.round(baseUnits * item.costPrice);
  }

  // 3. Fallback to product cost price if historical transaction had no cost price
  return Math.round(baseUnits * (prod?.costPrice || 0));
}

/**
 * Calculates the effective FIFO cost per base unit for a transaction item
 */
export function getItemFifoUnitCost(item: TransactionItem, prod?: Product): number {
  const baseUnits = (item.quantity || 0) * (item.conversionFactor || 1);
  if (baseUnits <= 0) {
    return item.costPrice || prod?.costPrice || 0;
  }
  const totalCogs = getItemFifoCogs(item, prod);
  return Math.round(totalCogs / baseUnits);
}

/**
 * Calculates total valuation of remaining product inventory using FIFO batch cost
 */
export function getProductFifoInventoryValue(prod: Product): number {
  if (prod.batches && prod.batches.length > 0) {
    const batchValue = prod.batches.reduce((sum, b) => {
      const rem = Math.max(0, b.remainingQuantity || 0);
      const cost = b.costPrice !== undefined ? b.costPrice : (prod.costPrice || 0);
      return sum + (rem * cost);
    }, 0);
    if (batchValue > 0) return batchValue;
  }
  return (prod.stockInBaseUnit || 0) * (prod.costPrice || 0);
}

// ============================================================================
// FIFO GROSS PROFIT VALIDATOR & AUDIT INTERFACES
// ============================================================================

export interface BatchDeductionDetail {
  batchId: string;
  batchNumber?: string;
  quantity: number; // in base units
  costPrice: number; // cost per base unit
  totalCost: number; // quantity * costPrice
  expiryDate?: string;
}

export interface ItemFifoValidationResult {
  productId: string;
  productName: string;
  quantity: number;
  conversionFactor: number;
  baseUnits: number;
  unitName: string;
  unitPrice: number;
  subtotal: number;
  isService?: boolean;
  // Stored values
  storedCostPrice: number;
  storedTotalCogs: number;
  storedGrossProfit: number;
  // FIFO Batch deductions values
  batchDeductions: BatchDeductionDetail[];
  exactFifoCogs: number;
  exactFifoGrossProfit: number;
  effectiveFifoUnitCost: number;
  // Comparison & Discrepancies
  hasDiscrepancy: boolean;
  cogsDifference: number; // exactFifoCogs - storedTotalCogs
  profitDifference: number; // exactFifoGrossProfit - storedGrossProfit
  isHistoricalFallback: boolean;
}

export interface TransactionFifoValidationResult {
  transactionId: string;
  invoiceNumber: string;
  timestamp: number;
  dateStr: string;
  customerName?: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  finalAmount: number;
  items: ItemFifoValidationResult[];
  totalStoredCogs: number;
  totalExactFifoCogs: number;
  totalStoredGrossProfit: number;
  totalExactFifoGrossProfit: number;
  cogsDifference: number;
  profitDifference: number;
  hasDiscrepancy: boolean;
  hasBatchDeductions: boolean;
}

export interface FifoValidationSummary {
  totalTransactionsValidated: number;
  totalItemsValidated: number;
  totalRevenue: number;
  totalStoredCogs: number;
  totalExactFifoCogs: number;
  totalStoredGrossProfit: number;
  totalExactFifoGrossProfit: number;
  netDiscrepancyAmount: number;
  transactionsWithDiscrepancyCount: number;
  transactionsWithBatchDeductionsCount: number;
  historicalFallbackCount: number;
  validationStatus: 'VALID_MATCH' | 'DISCREPANCY_DETECTED' | 'HISTORICAL_NO_BATCHES';
  results: TransactionFifoValidationResult[];
}

/**
 * calculateFIFOGrossProfit
 * 
 * Revalidates historical transactions against exact FIFO batch deductions.
 * Traverses batchDeductions for every transaction item, retrieves costPrice from each batch,
 * and compares it with the stored average HPP (costPrice) to ensure subtotal - (quantity * costPrice)
 * generates accurate FIFO gross profit.
 * 
 * @param input Single Transaction or Transaction[] array
 * @param products Optional Product list for name & fallback cost resolution
 */
export function calculateFIFOGrossProfit(
  input: Transaction | Transaction[],
  products?: Product[]
): FifoValidationSummary {
  const transactions: Transaction[] = Array.isArray(input) ? input : [input];
  const productMap = new Map<string, Product>();
  if (products && products.length > 0) {
    products.forEach(p => productMap.set(p.id, p));
  }

  const results: TransactionFifoValidationResult[] = [];
  let totalRevenue = 0;
  let totalStoredCogs = 0;
  let totalExactFifoCogs = 0;
  let totalStoredGrossProfit = 0;
  let totalExactFifoGrossProfit = 0;
  let totalItemsValidated = 0;
  let transactionsWithDiscrepancyCount = 0;
  let transactionsWithBatchDeductionsCount = 0;
  let historicalFallbackCount = 0;

  for (const tx of transactions) {
    const validatedItems: ItemFifoValidationResult[] = [];
    let txStoredCogs = 0;
    let txExactFifoCogs = 0;
    let txHasBatchDeductions = false;
    let txHasDiscrepancy = false;

    const txDate = new Date(tx.timestamp);
    const dateStr = !isNaN(txDate.getTime()) 
      ? txDate.toISOString().slice(0, 10) 
      : 'Unknown Date';

    for (const item of tx.items || []) {
      totalItemsValidated++;
      const prod = productMap.get(item.productId);
      const baseUnits = (item.quantity || 0) * (item.conversionFactor || 1);
      const itemSubtotal = item.totalAmount || ((item.quantity || 0) * (item.unitPrice || 0));

      const isNonInventoryItem = Boolean(item.isService || item.isQuickSale);

      // 1. Stored Cost & COGS
      const storedCostPrice = item.costPrice !== undefined 
        ? item.costPrice 
        : (prod?.costPrice || 0);
      const storedItemCogs = isNonInventoryItem 
        ? 0 
        : Math.round(baseUnits * storedCostPrice);
      const storedItemProfit = Math.round(itemSubtotal - storedItemCogs);

      // 2. FIFO Batch deductions traversal
      const deductionDetails: BatchDeductionDetail[] = [];
      let exactBatchCogs = 0;
      let hasItemBatchDeductions = false;

      if (!isNonInventoryItem && item.batchDeductions && item.batchDeductions.length > 0) {
        hasItemBatchDeductions = true;
        txHasBatchDeductions = true;

        for (const b of item.batchDeductions) {
          const bQty = b.quantity || 0;
          const bCost = b.costPrice !== undefined ? b.costPrice : storedCostPrice;
          const bTotal = bQty * bCost;
          exactBatchCogs += bTotal;

          deductionDetails.push({
            batchId: b.batchId,
            batchNumber: b.batchNumber,
            quantity: bQty,
            costPrice: bCost,
            totalCost: bTotal,
            expiryDate: b.expiryDate
          });
        }
      }

      const exactFifoCogs = isNonInventoryItem 
        ? 0 
        : (hasItemBatchDeductions ? Math.round(exactBatchCogs) : storedItemCogs);

      const exactFifoGrossProfit = Math.round(itemSubtotal - exactFifoCogs);
      const effectiveFifoUnitCost = baseUnits > 0 
        ? Math.round(exactFifoCogs / baseUnits) 
        : storedCostPrice;

      // Discrepancy check: difference > 1 Rupiah indicates mismatch between stored HPP and pure FIFO batches
      const cogsDifference = exactFifoCogs - storedItemCogs;
      const profitDifference = exactFifoGrossProfit - storedItemProfit;
      const itemHasDiscrepancy = Math.abs(cogsDifference) > 1;

      if (itemHasDiscrepancy) {
        txHasDiscrepancy = true;
      }

      if (!hasItemBatchDeductions && !isNonInventoryItem) {
        historicalFallbackCount++;
      }

      txStoredCogs += storedItemCogs;
      txExactFifoCogs += exactFifoCogs;

      validatedItems.push({
        productId: item.productId,
        productName: item.productName || prod?.name || 'Produk',
        quantity: item.quantity,
        conversionFactor: item.conversionFactor || 1,
        baseUnits,
        unitName: item.unitName || prod?.baseUnit || 'PCS',
        unitPrice: item.unitPrice,
        subtotal: itemSubtotal,
        isService: item.isService,
        storedCostPrice,
        storedTotalCogs: storedItemCogs,
        storedGrossProfit: storedItemProfit,
        batchDeductions: deductionDetails,
        exactFifoCogs,
        exactFifoGrossProfit,
        effectiveFifoUnitCost,
        hasDiscrepancy: itemHasDiscrepancy,
        cogsDifference,
        profitDifference,
        isHistoricalFallback: !hasItemBatchDeductions && !isNonInventoryItem
      });
    }

    const txSubtotal = tx.subtotal || validatedItems.reduce((s, i) => s + i.subtotal, 0);
    const txFinalAmount = tx.finalAmount || (txSubtotal - (tx.discount || 0));
    const txStoredGrossProfit = Math.round(txFinalAmount - txStoredCogs);
    const txExactGrossProfit = Math.round(txFinalAmount - txExactFifoCogs);
    const txCogsDiff = txExactFifoCogs - txStoredCogs;
    const txProfitDiff = txExactGrossProfit - txStoredGrossProfit;

    if (txHasBatchDeductions) {
      transactionsWithBatchDeductionsCount++;
    }
    if (txHasDiscrepancy) {
      transactionsWithDiscrepancyCount++;
    }

    totalRevenue += txFinalAmount;
    totalStoredCogs += txStoredCogs;
    totalExactFifoCogs += txExactFifoCogs;
    totalStoredGrossProfit += txStoredGrossProfit;
    totalExactFifoGrossProfit += txExactGrossProfit;

    results.push({
      transactionId: tx.id,
      invoiceNumber: tx.invoiceNumber,
      timestamp: tx.timestamp,
      dateStr,
      customerName: tx.customerName,
      paymentMethod: tx.paymentMethod,
      subtotal: txSubtotal,
      discount: tx.discount || 0,
      finalAmount: txFinalAmount,
      items: validatedItems,
      totalStoredCogs: txStoredCogs,
      totalExactFifoCogs: txExactFifoCogs,
      totalStoredGrossProfit: txStoredGrossProfit,
      totalExactFifoGrossProfit: txExactGrossProfit,
      cogsDifference: txCogsDiff,
      profitDifference: txProfitDiff,
      hasDiscrepancy: txHasDiscrepancy,
      hasBatchDeductions: txHasBatchDeductions
    });
  }

  const netDiscrepancyAmount = totalExactFifoGrossProfit - totalStoredGrossProfit;
  
  let validationStatus: 'VALID_MATCH' | 'DISCREPANCY_DETECTED' | 'HISTORICAL_NO_BATCHES' = 'VALID_MATCH';
  if (transactionsWithDiscrepancyCount > 0) {
    validationStatus = 'DISCREPANCY_DETECTED';
  } else if (transactionsWithBatchDeductionsCount === 0 && historicalFallbackCount > 0) {
    validationStatus = 'HISTORICAL_NO_BATCHES';
  }

  return {
    totalTransactionsValidated: transactions.length,
    totalItemsValidated,
    totalRevenue,
    totalStoredCogs,
    totalExactFifoCogs,
    totalStoredGrossProfit,
    totalExactFifoGrossProfit,
    netDiscrepancyAmount,
    transactionsWithDiscrepancyCount,
    transactionsWithBatchDeductionsCount,
    historicalFallbackCount,
    validationStatus,
    results
  };
}

/**
 * Reconciles historical transactions so that each item with batch deductions has its
 * stored costPrice updated to match its exact effective FIFO unit cost.
 * This aligns stored subtotal - (quantity * costPrice) with exact FIFO gross profit.
 */
export function reconcileTransactionsFifo(
  transactions: Transaction[],
  products?: Product[]
): {
  reconciledTransactions: Transaction[];
  reconciledCount: number;
  reconciledItemCount: number;
  totalProfitAdjustment: number;
} {
  const summary = calculateFIFOGrossProfit(transactions, products);
  const txDiscrepancyMap = new Map<string, TransactionFifoValidationResult>();
  summary.results.forEach((r) => {
    if (r.hasDiscrepancy) {
      txDiscrepancyMap.set(r.transactionId, r);
    }
  });

  let reconciledCount = 0;
  let reconciledItemCount = 0;
  let totalProfitAdjustment = 0;

  const reconciledTransactions = transactions.map((tx) => {
    const valResult = txDiscrepancyMap.get(tx.id);
    if (!valResult) return tx;

    let txModified = false;
    const updatedItems = tx.items.map((item, idx) => {
      const itemVal = valResult.items[idx];
      if (itemVal && itemVal.hasDiscrepancy && itemVal.batchDeductions.length > 0) {
        txModified = true;
        reconciledItemCount++;
        totalProfitAdjustment += itemVal.profitDifference;
        return {
          ...item,
          costPrice: itemVal.effectiveFifoUnitCost,
        };
      }
      return item;
    });

    if (txModified) {
      reconciledCount++;
      return {
        ...tx,
        items: updatedItems,
      };
    }
    return tx;
  });

  return {
    reconciledTransactions,
    reconciledCount,
    reconciledItemCount,
    totalProfitAdjustment,
  };
}

// ============================================================================
// BATCH STOCK INTEGRITY VERIFIER & RECONCILIATION
// ============================================================================

export type BatchIntegrityStatus = 'MATCH' | 'BATCH_DEFICIT' | 'BATCH_SURPLUS' | 'NO_BATCHES';

export interface BatchStockIntegrityItem {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  baseUnit: string;
  costPrice: number;
  stockInBaseUnit: number; // Primary stock count in product master
  totalBatchQuantity: number; // Sum of remainingQuantity across product.batches
  difference: number; // totalBatchQuantity - stockInBaseUnit (0 = MATCH, <0 = DEFICIT, >0 = SURPLUS)
  status: BatchIntegrityStatus;
  statusLabel: string;
  batchesCount: number;
  activeBatches: Array<{
    batchId: string;
    batchNumber: string;
    remainingQuantity: number;
    initialQuantity: number;
    costPrice: number;
    receivedDate?: string;
    expiryDate?: string;
  }>;
}

export interface BatchStockIntegritySummary {
  totalProductsChecked: number;
  validMatchesCount: number;
  discrepanciesCount: number;
  noBatchesCount: number;
  deficitCount: number;
  surplusCount: number;
  totalMasterStock: number;
  totalBatchStock: number;
  netDifferenceUnits: number;
  estimatedDifferenceValue: number;
  isAllValid: boolean;
  results: BatchStockIntegrityItem[];
}

/**
 * verifyBatchStockIntegrity
 * 
 * Verifies whether the sum of remainingQuantity in all batches of each product
 * exactly matches the product's stockInBaseUnit recorded in the primary product data.
 * 
 * @param products Array of Product objects
 */
export function verifyBatchStockIntegrity(products: Product[]): BatchStockIntegritySummary {
  const physicalProducts = (products || []).filter((p) => (p.productType || 'BARANG') === 'BARANG');

  let validMatchesCount = 0;
  let discrepanciesCount = 0;
  let noBatchesCount = 0;
  let deficitCount = 0;
  let surplusCount = 0;
  let totalMasterStock = 0;
  let totalBatchStock = 0;
  let estimatedDifferenceValue = 0;

  const results: BatchStockIntegrityItem[] = physicalProducts.map((p) => {
    const stockInBaseUnit = p.stockInBaseUnit || 0;
    const rawBatches = Array.isArray(p.batches) ? p.batches : [];

    // Sum active remaining quantities in batches
    const totalBatchQuantity = rawBatches.reduce((acc, b) => acc + (b.remainingQuantity || 0), 0);
    const difference = totalBatchQuantity - stockInBaseUnit;

    totalMasterStock += stockInBaseUnit;
    totalBatchStock += totalBatchQuantity;

    let status: BatchIntegrityStatus = 'MATCH';
    let statusLabel = 'Cocok (100% Valid)';

    if (rawBatches.length === 0 && stockInBaseUnit > 0) {
      status = 'NO_BATCHES';
      statusLabel = 'Tanpa Data Batch';
      noBatchesCount++;
      discrepanciesCount++;
      estimatedDifferenceValue += Math.abs(difference) * (p.costPrice || 0);
    } else if (difference < 0) {
      status = 'BATCH_DEFICIT';
      statusLabel = `Defisit Batch (${difference} ${p.baseUnit || 'PCS'})`;
      deficitCount++;
      discrepanciesCount++;
      estimatedDifferenceValue += Math.abs(difference) * (p.costPrice || 0);
    } else if (difference > 0) {
      status = 'BATCH_SURPLUS';
      statusLabel = `Surplus Batch (+${difference} ${p.baseUnit || 'PCS'})`;
      surplusCount++;
      discrepanciesCount++;
      estimatedDifferenceValue += Math.abs(difference) * (p.costPrice || 0);
    } else {
      status = 'MATCH';
      statusLabel = 'Cocok (100% Valid)';
      validMatchesCount++;
    }

    return {
      productId: p.id,
      productName: p.name,
      sku: p.sku || p.barcode || '-',
      category: p.category || 'Umum',
      baseUnit: p.baseUnit || 'PCS',
      costPrice: p.costPrice || 0,
      stockInBaseUnit,
      totalBatchQuantity,
      difference,
      status,
      statusLabel,
      batchesCount: rawBatches.length,
      activeBatches: rawBatches.map((b) => ({
        batchId: b.id,
        batchNumber: b.batchNumber || 'Tanpa No. Batch',
        remainingQuantity: b.remainingQuantity || 0,
        initialQuantity: b.initialQuantity || b.remainingQuantity || 0,
        costPrice: b.costPrice !== undefined ? b.costPrice : (p.costPrice || 0),
        receivedDate: b.receivedDate,
        expiryDate: b.expiryDate,
      })),
    };
  });

  // Sort results: show discrepancies first, then by largest absolute difference descending
  results.sort((a, b) => {
    if (a.status !== 'MATCH' && b.status === 'MATCH') return -1;
    if (a.status === 'MATCH' && b.status !== 'MATCH') return 1;
    return Math.abs(b.difference) - Math.abs(a.difference);
  });

  const netDifferenceUnits = totalBatchStock - totalMasterStock;
  const isAllValid = discrepanciesCount === 0;

  return {
    totalProductsChecked: physicalProducts.length,
    validMatchesCount,
    discrepanciesCount,
    noBatchesCount,
    deficitCount,
    surplusCount,
    totalMasterStock,
    totalBatchStock,
    netDifferenceUnits,
    estimatedDifferenceValue,
    isAllValid,
    results,
  };
}

/**
 * reconcileBatchStockIntegrity
 * 
 * Reconciles a single product's batches so that the sum of batch remainingQuantity
 * strictly equals product.stockInBaseUnit.
 */
export function reconcileBatchStockIntegrity(product: Product): Product {
  const stockInBaseUnit = Math.max(0, product.stockInBaseUnit || 0);
  const currentBatches = Array.isArray(product.batches) ? product.batches.map(b => ({ ...b })) : [];
  const currentBatchSum = currentBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);

  // If already exactly matching, return unchanged product
  if (currentBatchSum === stockInBaseUnit && currentBatches.length > 0) {
    return product;
  }

  // Case 1: Master stock is 0
  if (stockInBaseUnit === 0) {
    const updatedBatches = currentBatches.map(b => ({ ...b, remainingQuantity: 0 }));
    return {
      ...product,
      batches: updatedBatches,
    };
  }

  // Case 2: No batches exist, but master stock > 0
  if (currentBatches.length === 0) {
    const newBatch = {
      id: `batch_reconciled_${Date.now()}_${product.id.slice(-4)}`,
      batchNumber: 'BATCH-AWAL',
      receivedAt: Date.now(),
      receivedDate: new Date().toISOString().slice(0, 10),
      expiryDate: product.expiryDate,
      initialQuantity: stockInBaseUnit,
      remainingQuantity: stockInBaseUnit,
      costPrice: product.costPrice || 0,
      supplierName: 'Penyesuaian Integritas Stok',
    };
    return {
      ...product,
      batches: [newBatch],
    };
  }

  // Case 3: Batch sum is LESS than master stock (Batch Deficit)
  if (currentBatchSum < stockInBaseUnit) {
    const deficit = stockInBaseUnit - currentBatchSum;
    // Add supplemental batch for the unallocated physical stock
    const supplementalBatch = {
      id: `batch_adj_${Date.now()}_${product.id.slice(-4)}`,
      batchNumber: `BATCH-ADJ-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
      receivedAt: Date.now(),
      receivedDate: new Date().toISOString().slice(0, 10),
      expiryDate: product.expiryDate,
      initialQuantity: deficit,
      remainingQuantity: deficit,
      costPrice: product.costPrice || 0,
      supplierName: 'Penyesuaian Selisih Batch',
    };
    return {
      ...product,
      batches: [...currentBatches, supplementalBatch],
    };
  }

  // Case 4: Batch sum is GREATER than master stock (Batch Surplus)
  // Trim excess from batches starting from the newest
  let excessToTrim = currentBatchSum - stockInBaseUnit;
  const updatedBatches = [...currentBatches];
  for (let i = updatedBatches.length - 1; i >= 0 && excessToTrim > 0; i--) {
    const b = updatedBatches[i];
    if (b.remainingQuantity > 0) {
      const reduction = Math.min(b.remainingQuantity, excessToTrim);
      b.remainingQuantity -= reduction;
      excessToTrim -= reduction;
    }
  }

  return {
    ...product,
    batches: updatedBatches,
  };
}

/**
 * reconcileAllBatchStockIntegrity
 * 
 * Reconciles all products that exhibit discrepancies between batch remainingQuantity
 * and stockInBaseUnit.
 */
export function reconcileAllBatchStockIntegrity(products: Product[]): {
  updatedProducts: Product[];
  reconciledCount: number;
} {
  let reconciledCount = 0;
  const updatedProducts = products.map((p) => {
    if ((p.productType || 'BARANG') !== 'BARANG') return p;
    const stockInBaseUnit = Math.max(0, p.stockInBaseUnit || 0);
    const rawBatches = Array.isArray(p.batches) ? p.batches : [];
    const batchSum = rawBatches.reduce((acc, b) => acc + (b.remainingQuantity || 0), 0);

    if (batchSum !== stockInBaseUnit || (rawBatches.length === 0 && stockInBaseUnit > 0)) {
      reconciledCount++;
      return reconcileBatchStockIntegrity(p);
    }
    return p;
  });

  return {
    updatedProducts,
    reconciledCount,
  };
}

// ============================================================================
// CHRONOLOGICAL FIFO RECALCULATION (FOR BACKDATED TRANSACTIONS)
// ============================================================================

export interface ChronologicalFifoRecalcResult {
  updatedProducts: Product[];
  changedProducts: Product[];
  updatedTransactions: Transaction[];
  changedTransactions: Transaction[];
  recalculatedExistingTxCount: number;
  recalculatedItemCount: number;
}

const sortBatchesFifoFefo = (batches: ProductBatch[]): ProductBatch[] => {
  return [...batches].sort((a, b) => {
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
};

const getEffectiveBatchReceivedAt = (batch: ProductBatch): number => {
  if (
    batch.id?.startsWith('batch_init_') ||
    batch.id?.startsWith('batch_reconciled_') ||
    batch.batchNumber === 'BATCH-AWAL'
  ) {
    return 0;
  }
  if (typeof batch.receivedAt === 'number' && !isNaN(batch.receivedAt)) {
    return batch.receivedAt;
  }
  if (batch.receivedDate) {
    const parsed = new Date(`${batch.receivedDate}T00:00:00`).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
};

/**
 * Inserts a new transaction (typically backdated to a past date/time) and
 * chronologically recalculates FIFO batch deductions, weighted item HPP (costPrice),
 * batch remaining quantities, and product master stock across all affected products
 * and all batch-tracked transactions sorted by timestamp ascending.
 */
export function recalculateChronologicalFifoForNewTransaction(
  existingTransactions: Transaction[],
  newTransaction: Transaction,
  products: Product[]
): ChronologicalFifoRecalcResult {
  const affectedProductIds = new Set<string>();
  (newTransaction.items || []).forEach((item) => {
    if (!item.isService && !item.isQuickSale && item.productId) {
      affectedProductIds.add(item.productId);
    }
  });

  // Quick exit if transaction only contains services / quick sales
  if (affectedProductIds.size === 0) {
    const updatedTransactions = [newTransaction, ...existingTransactions].sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    return {
      updatedProducts: products,
      changedProducts: [],
      updatedTransactions,
      changedTransactions: [newTransaction],
      recalculatedExistingTxCount: 0,
      recalculatedItemCount: 0,
    };
  }

  // Clone all candidate transactions in ascending chronological order for replay
  const allTxsChrono: Array<{ tx: Transaction; isNew: boolean }> = [
    ...existingTransactions.map((tx) => ({
      tx: {
        ...tx,
        items: (tx.items || []).map((it) => ({
          ...it,
          batchDeductions: it.batchDeductions ? it.batchDeductions.map((b) => ({ ...b })) : undefined,
        })),
      },
      isNew: false,
    })),
    {
      tx: {
        ...newTransaction,
        items: (newTransaction.items || []).map((it) => ({
          ...it,
          batchDeductions: it.batchDeductions ? it.batchDeductions.map((b) => ({ ...b })) : undefined,
        })),
      },
      isNew: true,
    },
  ].sort((a, b) => {
    const tsDiff = (a.tx.timestamp || 0) - (b.tx.timestamp || 0);
    if (tsDiff !== 0) return tsDiff;
    if (a.isNew !== b.isNew) return a.isNew ? 1 : -1;
    return String(a.tx.id).localeCompare(String(b.tx.id));
  });

  const existingTxModifiedIds = new Set<string>();
  let recalculatedItemCount = 0;

  // Compute newly consumed base units per affected product from newTransaction
  const newTxUnitsByProduct = new Map<string, number>();
  (newTransaction.items || []).forEach((item) => {
    if (item.isService || item.isQuickSale || !item.productId) return;
    const baseUnits = (item.quantity || 0) * (item.conversionFactor || 1);
    if (baseUnits > 0) {
      newTxUnitsByProduct.set(
        item.productId,
        (newTxUnitsByProduct.get(item.productId) || 0) + baseUnits
      );
    }
  });

  const changedProducts: Product[] = [];
  const updatedProducts = products.map((prod) => {
    if (prod.productType === 'JASA' || !affectedProductIds.has(prod.id)) {
      return prod;
    }

    const newlyAddedUnits = newTxUnitsByProduct.get(prod.id) || 0;
    if (newlyAddedUnits <= 0) return prod;

    // 1. Clone or initialize product batches
    let batches: ProductBatch[] =
      Array.isArray(prod.batches) && prod.batches.length > 0
        ? prod.batches.map((b) => ({ ...b }))
        : [];

    if (batches.length === 0 && (prod.stockInBaseUnit || 0) > 0) {
      const initTs = Math.min(
        (newTransaction.timestamp || Date.now()) - 86400000,
        Date.now() - 30 * 86400000
      );
      batches.push({
        id: `batch_init_${prod.id}`,
        batchNumber: 'BATCH-AWAL',
        receivedAt: initTs,
        receivedDate: new Date(initTs).toISOString().slice(0, 10),
        expiryDate: prod.expiryDate,
        initialQuantity: prod.stockInBaseUnit,
        remainingQuantity: prod.stockInBaseUnit,
        costPrice: prod.costPrice || 0,
        supplierName: 'Stok Toko',
      });
    }

    // 2. Restore previously tracked batchDeductions from existing transactions for this product
    //    so every batch-tracked transaction + newTransaction can be replayed cleanly in timestamp order.
    const batchById = new Map<string, ProductBatch>();
    const batchByNumber = new Map<string, ProductBatch>();
    batches.forEach((b) => {
      batchById.set(b.id, b);
      if (b.batchNumber) batchByNumber.set(b.batchNumber, b);
    });

    const replayableTxIds = new Set<string>([newTransaction.id]);

    allTxsChrono.forEach(({ tx, isNew }) => {
      if (isNew) return;
      (tx.items || []).forEach((item) => {
        if (item.isService || item.isQuickSale || item.productId !== prod.id) return;
        if (item.batchDeductions && item.batchDeductions.length > 0) {
          replayableTxIds.add(tx.id);
          item.batchDeductions.forEach((ded) => {
            if (ded.batchId === 'batch_deficit') return;
            const targetBatch =
              batchById.get(ded.batchId) ||
              (ded.batchNumber ? batchByNumber.get(ded.batchNumber) : undefined);
            if (targetBatch) {
              targetBatch.remainingQuantity =
                (targetBatch.remainingQuantity || 0) + (ded.quantity || 0);
            }
          });
        }
      });
    });

    // 3. Replay all replayable transactions in ascending chronological order
    allTxsChrono.forEach(({ tx, isNew }) => {
      if (!replayableTxIds.has(tx.id)) return;

      tx.items.forEach((item) => {
        if (item.isService || item.isQuickSale || item.productId !== prod.id) return;

        const baseUnitsNeeded = (item.quantity || 0) * (item.conversionFactor || 1);
        if (baseUnitsNeeded <= 0) return;

        let unitsToDeduct = baseUnitsNeeded;
        const deductedBatches: BatchDeduction[] = [];
        let totalCostIncurred = 0;
        let totalUnitsCalculated = 0;

        // Pass 1: Chronologically eligible batches (received at or before tx.timestamp)
        const eligibleBatches = sortBatchesFifoFefo(
          batches.filter(
            (b) => (b.remainingQuantity || 0) > 0 && getEffectiveBatchReceivedAt(b) <= tx.timestamp
          )
        );

        for (const batch of eligibleBatches) {
          if (unitsToDeduct <= 0) break;
          const available = batch.remainingQuantity || 0;
          if (available <= 0) continue;

          const take = Math.min(available, unitsToDeduct);
          batch.remainingQuantity = available - take;
          unitsToDeduct -= take;

          const effectiveCost =
            batch.costPrice !== undefined ? batch.costPrice : prod.costPrice || 0;
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

        // Pass 2: Fallback to any remaining batches (e.g. restocked later when backdated pool depleted)
        if (unitsToDeduct > 0) {
          const fallbackBatches = sortBatchesFifoFefo(
            batches.filter((b) => (b.remainingQuantity || 0) > 0)
          );
          for (const batch of fallbackBatches) {
            if (unitsToDeduct <= 0) break;
            const available = batch.remainingQuantity || 0;
            if (available <= 0) continue;

            const take = Math.min(available, unitsToDeduct);
            batch.remainingQuantity = available - take;
            unitsToDeduct -= take;

            const effectiveCost =
              batch.costPrice !== undefined ? batch.costPrice : prod.costPrice || 0;
            totalCostIncurred += take * effectiveCost;
            totalUnitsCalculated += take;

            const existingDed = deductedBatches.find((d) => d.batchId === batch.id);
            if (existingDed) {
              existingDed.quantity += take;
            } else {
              deductedBatches.push({
                batchId: batch.id,
                batchNumber: batch.batchNumber,
                quantity: take,
                costPrice: effectiveCost,
                expiryDate: batch.expiryDate,
              });
            }
          }
        }

        // Pass 3: Stock deficit if physical stock wasn't enough
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
          totalUnitsCalculated > 0
            ? Math.round(totalCostIncurred / totalUnitsCalculated)
            : prod.costPrice || 0;

        if (!isNew) {
          const prevSerialized = JSON.stringify(item.batchDeductions || []);
          const nextSerialized = JSON.stringify(deductedBatches);
          if (prevSerialized !== nextSerialized || item.costPrice !== weightedHppPerBaseUnit) {
            existingTxModifiedIds.add(tx.id);
            recalculatedItemCount++;
          }
        }

        item.batchDeductions = deductedBatches;
        item.costPrice = weightedHppPerBaseUnit;
      });
    });

    // Update product stockInBaseUnit, batches, and active FIFO costPrice (oldest positive batch)
    const sortedNextBatches = sortBatchesFifoFefo(batches);
    const nextActiveBatch = sortedNextBatches.find((b) => (b.remainingQuantity || 0) > 0);
    const nextStock = Math.max(0, (prod.stockInBaseUnit || 0) - newlyAddedUnits);

    const nextProd: Product = {
      ...prod,
      stockInBaseUnit: nextStock,
      batches: sortedNextBatches,
      costPrice:
        nextActiveBatch && nextActiveBatch.costPrice !== undefined
          ? nextActiveBatch.costPrice
          : prod.costPrice,
    };

    changedProducts.push(nextProd);
    return nextProd;
  });

  // Sort resulting transactions newest first (b.timestamp - a.timestamp)
  const sortedNewestFirst = allTxsChrono
    .map((entry) => entry.tx)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  const changedTransactions = sortedNewestFirst.filter(
    (tx) => tx.id === newTransaction.id || existingTxModifiedIds.has(tx.id)
  );

  return {
    updatedProducts,
    changedProducts,
    updatedTransactions: sortedNewestFirst,
    changedTransactions,
    recalculatedExistingTxCount: existingTxModifiedIds.size,
    recalculatedItemCount,
  };
}

/**
 * Restores returned base units back into the exact source FIFO batches tracked on
 * `item.batchDeductions` (walking in reverse / LIFO order of deductions while skipping
 * any units already returned in prior partial return operations).
 */
export function restoreProductBatchesForReturn(params: {
  product: Product;
  item: TransactionItem;
  returnBaseUnits: number;
  alreadyReturnedBaseUnits?: number;
  invoiceNumber: string;
}): {
  updatedProduct: Product;
  restoredBatches: BatchReturnRestoration[];
} {
  const { product, item, returnBaseUnits, alreadyReturnedBaseUnits = 0, invoiceNumber } = params;
  if (returnBaseUnits <= 0 || product.productType === 'JASA' || item.isService) {
    return {
      updatedProduct: product,
      restoredBatches: [],
    };
  }

  const now = Date.now();
  const todayStr = new Date(now).toISOString().split('T')[0];
  const batches: ProductBatch[] = (product.batches || []).map((b) => ({ ...b }));
  const restoredBatches: BatchReturnRestoration[] = [];

  const deductions = Array.isArray(item.batchDeductions) ? item.batchDeductions : [];
  let remainingToRestore = returnBaseUnits;
  let skipAlreadyReturned = Math.max(0, alreadyReturnedBaseUnits);

  const applyToTargetBatch = (
    ded: { batchId: string; batchNumber?: string; costPrice: number; expiryDate?: string },
    qtyToAdd: number
  ) => {
    if (qtyToAdd <= 0) return;

    const existingBatch =
      ded.batchId !== 'batch_deficit'
        ? batches.find((b) => b.id === ded.batchId) ||
          (ded.batchNumber ? batches.find((b) => b.batchNumber === ded.batchNumber) : undefined)
        : undefined;

    if (existingBatch) {
      existingBatch.remainingQuantity = (existingBatch.remainingQuantity || 0) + qtyToAdd;
      if (existingBatch.initialQuantity < existingBatch.remainingQuantity) {
        existingBatch.initialQuantity = existingBatch.remainingQuantity;
      }
      restoredBatches.push({
        batchId: existingBatch.id,
        batchNumber: existingBatch.batchNumber,
        restoredBaseUnits: qtyToAdd,
        costPrice: existingBatch.costPrice ?? ded.costPrice ?? product.costPrice ?? 0,
        expiryDate: existingBatch.expiryDate || ded.expiryDate,
        createdFallbackBatch: false,
      });
    } else {
      const targetCost = ded.costPrice ?? item.costPrice ?? product.costPrice ?? 0;
      const fallbackBatchNum =
        ded.batchNumber && ded.batchId !== 'batch_deficit'
          ? ded.batchNumber
          : `RETUR-${invoiceNumber}`;

      const existingFallback = batches.find(
        (b) => b.batchNumber === fallbackBatchNum && b.costPrice === targetCost
      );
      if (existingFallback) {
        existingFallback.remainingQuantity = (existingFallback.remainingQuantity || 0) + qtyToAdd;
        existingFallback.initialQuantity = Math.max(
          existingFallback.initialQuantity || 0,
          existingFallback.remainingQuantity
        );
        restoredBatches.push({
          batchId: existingFallback.id,
          batchNumber: existingFallback.batchNumber,
          restoredBaseUnits: qtyToAdd,
          costPrice: existingFallback.costPrice,
          expiryDate: existingFallback.expiryDate,
          createdFallbackBatch: true,
        });
      } else {
        const newBatchId = `batch_ret_${now}_${Math.random().toString(36).substring(2, 7)}`;
        const createdBatch: ProductBatch = {
          id: newBatchId,
          batchNumber: fallbackBatchNum,
          receivedAt: now,
          receivedDate: todayStr,
          expiryDate: ded.expiryDate,
          initialQuantity: qtyToAdd,
          remainingQuantity: qtyToAdd,
          costPrice: targetCost,
          supplierName: `Retur ${invoiceNumber}`,
        };
        batches.push(createdBatch);
        restoredBatches.push({
          batchId: createdBatch.id,
          batchNumber: createdBatch.batchNumber,
          restoredBaseUnits: qtyToAdd,
          costPrice: createdBatch.costPrice,
          expiryDate: createdBatch.expiryDate,
          createdFallbackBatch: true,
        });
      }
    }
  };

  // Walk recorded batchDeductions from newest consumed (LIFO) back to oldest
  if (deductions.length > 0) {
    const reversedDeductions = [...deductions].reverse();
    for (const ded of reversedDeductions) {
      if (remainingToRestore <= 0) break;
      const dedQty = Math.max(0, ded.quantity || 0);
      if (dedQty <= 0) continue;

      if (skipAlreadyReturned >= dedQty) {
        skipAlreadyReturned -= dedQty;
        continue;
      }

      const eligibleFromSlot = dedQty - skipAlreadyReturned;
      skipAlreadyReturned = 0;

      const allocate = Math.min(eligibleFromSlot, remainingToRestore);
      remainingToRestore -= allocate;
      applyToTargetBatch(ded, allocate);
    }
  }

  // If still remaining (e.g. legacy transaction without batchDeductions), restore to newest active batch or create return batch
  if (remainingToRestore > 0) {
    const activeBatch = sortBatchesFifoFefo(batches).find((b) => (b.remainingQuantity || 0) >= 0);
    if (activeBatch) {
      applyToTargetBatch(
        {
          batchId: activeBatch.id,
          batchNumber: activeBatch.batchNumber,
          costPrice: activeBatch.costPrice,
          expiryDate: activeBatch.expiryDate,
        },
        remainingToRestore
      );
    } else {
      applyToTargetBatch(
        {
          batchId: 'batch_retur_fallback',
          batchNumber: `RETUR-${invoiceNumber}`,
          costPrice: item.costPrice ?? product.costPrice ?? 0,
        },
        remainingToRestore
      );
    }
  }

  const sortedBatches = sortBatchesFifoFefo(batches);
  const nextActiveBatch = sortedBatches.find((b) => (b.remainingQuantity || 0) > 0);
  const nextStock = Math.max(0, (product.stockInBaseUnit || 0) + returnBaseUnits);

  const updatedProduct: Product = {
    ...product,
    stockInBaseUnit: nextStock,
    batches: sortedBatches,
    costPrice:
      nextActiveBatch && nextActiveBatch.costPrice !== undefined
        ? nextActiveBatch.costPrice
        : product.costPrice,
  };

  return {
    updatedProduct,
    restoredBatches,
  };
}



