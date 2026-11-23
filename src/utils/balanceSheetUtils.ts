import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BalanceSheetEntry,
  BalanceSheetSection,
  CashflowRecord,
  Customer,
  Product,
  RestockOrder,
  StoreSettings,
  TaxAdjustment,
  TaxRecord,
  Transaction,
} from '../types/pos';
import { getItemFifoCogs } from './fifoUtils';
import {
  computeAnnualTaxBuckets,
  computeTxTaxableBreakdown,
  getEffectiveTaxConfig,
  getPurchaseLocalMs,
} from './taxUtils';
import { formatNumber, formatRupiah } from './formatters';
import {
  addStandardPdfFooters,
  buildStoreContactLine,
  drawPdfStoreHeader,
  resolvePdfLogoAsset,
} from './pdfLogoHelper';

export const BALANCE_SHEET_SECTION_LABELS: Record<BalanceSheetSection, string> = {
  AKTIVA_LANCAR: 'Aktiva Lancar (Current Assets)',
  AKTIVA_TETAP: 'Aktiva Tetap (Fixed Assets)',
  KEWAJIBAN_LANCAR: 'Kewajiban Lancar (Current Liabilities)',
  KEWAJIBAN_JANGKA_PANJANG: 'Kewajiban Jangka Panjang (Long-Term Liabilities)',
  EKUITAS: 'Ekuitas & Modal (Equity)',
};

export interface BalanceSheetLineItem {
  id: string;
  code: string;
  name: string;
  section: BalanceSheetSection;
  amount: number; // Always non-negative display magnitude for contra accounts, signed in signedAmount
  signedAmount: number;
  isContra: boolean;
  source: 'OTOMATIS_POS' | 'MANUAL';
  detailNote: string;
  asOfDate?: string;
  manualEntry?: BalanceSheetEntry;
}

export interface BalanceSheetRatios {
  workingCapital: number;
  currentRatio: number | null; // Aktiva Lancar / Kewajiban Lancar
  cashRatio: number | null; // (Kas + Bank) / Kewajiban Lancar
  debtToEquityRatio: number | null; // Total Kewajiban / Total Ekuitas
  debtToAssetRatioPercent: number; // (Total Kewajiban / Total Aktiva) * 100
}

export interface BalanceSheetDonutSlice {
  key: string;
  label: string;
  amount: number;
  percent: number;
  color: string;
  description: string;
}

export interface FixedAssetDepreciationSchedule {
  entryId: string;
  accountCode: string;
  accountName: string;
  acquisitionDate: string;
  acquisitionCost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  depreciableBase: number;
  monthlyDepreciation: number;
  annualDepreciation: number;
  elapsedMonths: number;
  remainingMonths: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  depreciatedPercent: number;
  isFullyDepreciated: boolean;
  entry: BalanceSheetEntry;
}

export interface ReceivableCustomerSummary {
  customerKey: string;
  customerName: string;
  customerWhatsapp?: string;
  totalDebt: number;
  overdueAmount: number;
  invoiceCount: number;
  overdueCount: number;
  nearestDueDate?: string;
  sharePercent: number;
}

export interface ReceivablesSummary {
  totalAmount: number;
  unpaidInvoiceCount: number;
  overdueInvoiceCount: number;
  overdueAmount: number;
  receivableToAssetPercent: number;
  topCustomers: ReceivableCustomerSummary[];
}

export interface BalanceSheetMonthlyTrendPoint {
  periodMonth: string; // YYYY-MM
  label: string;
  asOfDate: string;
  totalAktiva: number;
  totalPasiva: number;
  totalKewajiban: number;
  totalEkuitas: number;
  totalAktivaTetapNetto: number;
  totalAutoDepreciation: number;
}

export interface BalanceSheetReport {
  asOfDate: string;
  storeName: string;
  aktivaLancar: BalanceSheetLineItem[];
  aktivaTetap: BalanceSheetLineItem[];
  kewajibanLancar: BalanceSheetLineItem[];
  kewajibanJangkaPanjang: BalanceSheetLineItem[];
  ekuitas: BalanceSheetLineItem[];
  totalAktivaLancar: number;
  totalAktivaTetap: number;
  totalAktiva: number;
  totalKewajibanLancar: number;
  totalKewajibanJangkaPanjang: number;
  totalKewajiban: number;
  totalEkuitas: number;
  totalPasiva: number;
  balanceDelta: number; // totalAktiva - totalPasiva
  isBalanced: boolean;
  ratios: BalanceSheetRatios;
  assetComposition: BalanceSheetDonutSlice[];
  pasivaComposition: BalanceSheetDonutSlice[];
  fixedAssetSchedules: FixedAssetDepreciationSchedule[];
  receivablesSummary: ReceivablesSummary;
  diagnostics: {
    cashInHand: number;
    bankAndNonCash: number;
    accountsReceivable: number;
    inventoryValuation: number;
    prepaidTaxVat: number;
    accountsPayable: number;
    taxesPayable: number;
    cumulativeNetIncome: number;
    cashflowCapitalInjections: number;
    grossSalesNetReturns: number;
    totalFifoCogs: number;
    operatingIncomeCashflow: number;
    operatingExpenseCashflow: number;
    cumulativeTaxExpense: number;
    totalAutoDepreciation: number;
    isHistoricalCutoff: boolean;
  };
}

export interface MonthlyProfitExpenseCategory {
  category: string;
  amount: number;
  count: number;
}

export interface MonthlyProfitAndLossReport {
  periodMonth: string; // YYYY-MM
  periodLabel: string;
  monthStartDate: string;
  monthEndDate: string;
  effectiveBalanceSheetAsOfDate: string;
  txCount: number;
  grossSalesNetReturns: number;
  totalFifoCogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  otherIncome: number;
  operatingExpenses: number;
  expenseBreakdown: MonthlyProfitExpenseCategory[];
  depreciationExpense: number;
  operatingProfitBeforeTax: number;
  estimatedTaxExpense: number;
  netProfit: number;
  netMarginPercent: number;
  opexRatioPercent: number; // (operatingExpenses + depreciationExpense) / revenue * 100
  profitRetentionPercent: number; // netProfit / grossProfit * 100
}

export interface MonthlyProfitComparisonPoint {
  periodMonth: string;
  label: string;
  fullLabel: string;
  omzet: number;
  hppFifo: number;
  labaKotor: number;
  bebanOperasional: number;
  penyusutan: number;
  estimasiPajak: number;
  pendapatanLain: number;
  labaBersih: number;
  grossMarginPercent: number;
  netMarginPercent: number;
  opexRatioPercent: number;
  profitRetentionPercent: number;
  txCount: number;
}

const parseLocalDateEndMs = (yyyyMmDd: string): number => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    const [y, m, d] = yyyyMmDd.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
};

const getLocalDateStr = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const isCashMethod = (method?: string): boolean => {
  const m = String(method || '').toUpperCase().trim();
  return m === 'CASH' || m === 'TUNAI';
};

export const computeFixedAssetDepreciation = (
  entry: BalanceSheetEntry,
  asOfDate: string
): FixedAssetDepreciationSchedule => {
  const acquisitionCost = Math.max(0, Math.round(entry.amount || 0));
  const salvageValue = Math.min(acquisitionCost, Math.max(0, Math.round(entry.salvageValue || 0)));
  const usefulLifeMonths = Math.max(1, Math.round(entry.usefulLifeMonths || 48));
  const depreciableBase = Math.max(0, acquisitionCost - salvageValue);
  const monthlyDepreciation = Math.round(depreciableBase / usefulLifeMonths);
  const annualDepreciation = Math.round((depreciableBase * 12) / usefulLifeMonths);
  const acquisitionDate = /^\d{4}-\d{2}-\d{2}$/.test(entry.asOfDate) ? entry.asOfDate : asOfDate;

  let elapsedMonths = 0;
  if (asOfDate >= acquisitionDate && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    const [ay, am, ad] = acquisitionDate.split('-').map(Number);
    const [cy, cm, cd] = asOfDate.split('-').map(Number);
    const baseMonths = (cy - ay) * 12 + (cm - am) - (cd < ad ? 1 : 0) + (ad <= 5 && cd >= 28 ? 1 : 0);
    elapsedMonths = Math.max(0, Math.min(usefulLifeMonths, baseMonths));
  }

  const accumulatedDepreciation =
    elapsedMonths >= usefulLifeMonths
      ? depreciableBase
      : Math.min(depreciableBase, Math.round((depreciableBase * elapsedMonths) / usefulLifeMonths));
  const netBookValue = Math.max(salvageValue, acquisitionCost - accumulatedDepreciation);
  const remainingMonths = Math.max(0, usefulLifeMonths - elapsedMonths);
  const depreciatedPercent =
    depreciableBase > 0 ? Number(((accumulatedDepreciation / depreciableBase) * 100).toFixed(1)) : 0;

  return {
    entryId: entry.id,
    accountCode: entry.accountCode,
    accountName: entry.accountName,
    acquisitionDate,
    acquisitionCost,
    salvageValue,
    usefulLifeMonths,
    depreciableBase,
    monthlyDepreciation,
    annualDepreciation,
    elapsedMonths,
    remainingMonths,
    accumulatedDepreciation,
    netBookValue,
    depreciatedPercent,
    isFullyDepreciated: elapsedMonths >= usefulLifeMonths && depreciableBase > 0,
    entry,
  };
};

export const computeBalanceSheet = (params: {
  asOfDate: string;
  transactions: Transaction[];
  products: Product[];
  purchases: RestockOrder[];
  cashflows: CashflowRecord[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  manualEntries: BalanceSheetEntry[];
  storeSettings: StoreSettings;
  customers?: Customer[];
  precomputedAnnualTaxByYear?: Map<number, ReturnType<typeof computeAnnualTaxBuckets>>;
}): BalanceSheetReport => {
  const {
    asOfDate,
    transactions,
    products,
    purchases,
    cashflows,
    taxRecords,
    taxAdjustments,
    manualEntries,
    storeSettings,
    customers = [],
    precomputedAnnualTaxByYear,
  } = params;

  const todayStr = getLocalDateStr(Date.now());
  const effectiveAsOfDate = /^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ? asOfDate : todayStr;
  const cutoffEndMs = parseLocalDateEndMs(effectiveAsOfDate);
  const isHistoricalCutoff = effectiveAsOfDate < todayStr;
  const taxConfig = getEffectiveTaxConfig(storeSettings);

  const customerLookupById = new Map<string, Customer>();
  customers.forEach((c) => {
    if (c.id) customerLookupById.set(c.id, c);
  });

  // ---------------------------------------------------------------------------
  // 1. TRANSACTIONS UP TO CUTOFF (Kas, Bank, Piutang, Revenue, COGS)
  // ---------------------------------------------------------------------------
  let salesCashReceived = 0;
  let salesBankReceived = 0;
  let accountsReceivable = 0;
  let arCount = 0;
  let overdueInvoiceCount = 0;
  let overdueAmount = 0;
  let grossSalesNetReturns = 0;
  let totalFifoCogs = 0;
  let postCutoffCogs = 0;

  const customerReceivablesMap = new Map<
    string,
    {
      customerKey: string;
      customerName: string;
      customerWhatsapp?: string;
      totalDebt: number;
      overdueAmount: number;
      invoiceCount: number;
      overdueCount: number;
      nearestDueDate?: string;
    }
  >();

  transactions.forEach((tx) => {
    const bd = computeTxTaxableBreakdown(tx, true);
    const netCollectible = Math.max(0, (tx.finalAmount || 0) - (tx.returnedAmount || 0));

    let txCogs = 0;
    (tx.items || []).forEach((item) => {
      if (item.isCashWithdrawal || /tarik\s*tunai/i.test(item.productName || '')) return;
      txCogs += Math.max(0, getItemFifoCogs(item));
    });

    // Reduce COGS proportionally on partial/full returns when exact returnedQty isn't recorded separately
    if ((tx.finalAmount || 0) > 0 && (tx.returnedAmount || 0) > 0) {
      const keepRatio = Math.max(0, Math.min(1, netCollectible / (tx.finalAmount || 1)));
      txCogs = Math.round(txCogs * keepRatio);
    }

    if (tx.timestamp > cutoffEndMs) {
      postCutoffCogs += txCogs;
      return;
    }

    grossSalesNetReturns += bd.netTaxable;
    totalFifoCogs += txCogs;

    const paidAtMs = tx.paidAt ? Date.parse(tx.paidAt) : NaN;
    const isSettledAsOfCutoff =
      tx.paymentStatus === 'LUNAS' &&
      (Number.isNaN(paidAtMs) || paidAtMs <= cutoffEndMs);

    if (isSettledAsOfCutoff) {
      const effectiveChannel = tx.settledPaymentMethod || tx.paymentMethod;
      if (isCashMethod(effectiveChannel)) {
        salesCashReceived += netCollectible;
      } else {
        salesBankReceived += netCollectible;
      }
    } else if (netCollectible > 0) {
      accountsReceivable += netCollectible;
      arCount += 1;

      const isOverdue = Boolean(tx.dueDate && tx.dueDate < effectiveAsOfDate);
      if (isOverdue) {
        overdueInvoiceCount += 1;
        overdueAmount += netCollectible;
      }

      const matchedCustomer = tx.customerId ? customerLookupById.get(tx.customerId) : undefined;
      const resolvedName =
        (tx.customerName || matchedCustomer?.name || '').trim() || 'Pelanggan Umum / Kasbon';
      const customerKey = tx.customerId
        ? `id:${tx.customerId}`
        : `name:${resolvedName.toLowerCase()}`;
      const resolvedWa = (tx.customerWhatsapp || matchedCustomer?.whatsapp || matchedCustomer?.phone || '').trim() || undefined;

      const existing = customerReceivablesMap.get(customerKey) || {
        customerKey,
        customerName: resolvedName,
        customerWhatsapp: resolvedWa,
        totalDebt: 0,
        overdueAmount: 0,
        invoiceCount: 0,
        overdueCount: 0,
        nearestDueDate: undefined,
      };
      existing.totalDebt += netCollectible;
      existing.invoiceCount += 1;
      if (isOverdue) {
        existing.overdueAmount += netCollectible;
        existing.overdueCount += 1;
      }
      if (!existing.customerWhatsapp && resolvedWa) {
        existing.customerWhatsapp = resolvedWa;
      }
      if (tx.dueDate && (!existing.nearestDueDate || tx.dueDate < existing.nearestDueDate)) {
        existing.nearestDueDate = tx.dueDate;
      }
      customerReceivablesMap.set(customerKey, existing);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. CASHFLOWS UP TO CUTOFF (Kas, Bank, Operasional, Modal Disetor)
  // ---------------------------------------------------------------------------
  let cfCashIn = 0;
  let cfCashOut = 0;
  let cfBankIn = 0;
  let cfBankOut = 0;
  let operatingIncomeCashflow = 0;
  let operatingExpenseCashflow = 0;
  let cashflowCapitalInjections = 0;

  cashflows.forEach((cf) => {
    const cfDate = cf.date || getLocalDateStr(cf.timestamp || 0);
    if (cfDate > effectiveAsOfDate) return;

    const amt = Math.max(0, Math.round(cf.amount || 0));
    if (amt <= 0) return;

    const isCash = isCashMethod(cf.paymentMethod);

    if (cf.type === 'PEMASUKAN') {
      // Admin profit from Tarik Tunai is already inside tx.finalAmount — avoid double-counting cash/profit
      if (cf.isCashWithdrawalAdminProfit) {
        return;
      }
      if (isCash) cfCashIn += amt;
      else cfBankIn += amt;

      if (/modal|suntikan/i.test(cf.category || '')) {
        cashflowCapitalInjections += amt;
      } else {
        operatingIncomeCashflow += amt;
      }
    } else {
      if (isCash) cfCashOut += amt;
      else cfBankOut += amt;

      const isTaxCashPayment =
        cf.category === 'Pajak, Iuran & Retribusi' || cf.id.startsWith('cf_tax_');
      if (!cf.isCashWithdrawalOutflow && !isTaxCashPayment) {
        operatingExpenseCashflow += amt;
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 3. PURCHASES (PO SELESAI) UP TO CUTOFF (Kas/Bank, Utang Usaha, Inventory Roll-back)
  // ---------------------------------------------------------------------------
  let poCashPaid = 0;
  let poBankPaid = 0;
  let accountsPayable = 0;
  let unpaidPoCount = 0;
  let postCutoffPurchases = 0;

  purchases.forEach((po) => {
    if (po.status !== 'SELESAI') return;
    const poMs = getPurchaseLocalMs(po);
    const poDateStr = po.date || getLocalDateStr(poMs);
    const total = Math.max(0, Math.round(po.totalAmount || 0));

    if (poDateStr > effectiveAsOfDate) {
      postCutoffPurchases += total;
      return;
    }

    if (po.paymentMethod === 'HUTANG') {
      const paid = Math.min(total, Math.max(0, Math.round(po.paidAmount || 0)));
      const remaining = Math.max(0, total - paid);
      poBankPaid += paid;
      if (remaining > 0) {
        accountsPayable += remaining;
        unpaidPoCount += 1;
      }
    } else if (isCashMethod(po.paymentMethod)) {
      const paid = po.paidAmount !== undefined ? Math.min(total, Math.max(0, Math.round(po.paidAmount))) : total;
      poCashPaid += paid;
    } else {
      const paid = po.paidAmount !== undefined ? Math.min(total, Math.max(0, Math.round(po.paidAmount))) : total;
      poBankPaid += paid;
    }
  });

  // ---------------------------------------------------------------------------
  // 4. INVENTORY VALUATION (FIFO Batches or Product Stock * Cost Price)
  // ---------------------------------------------------------------------------
  let currentInventoryValue = 0;
  let physicalSkuCount = 0;

  products.forEach((p) => {
    if (p.productType === 'JASA') return;
    physicalSkuCount += 1;
    if (Array.isArray(p.batches) && p.batches.length > 0) {
      let batchVal = 0;
      p.batches.forEach((b) => {
        const rem = Math.max(0, Number(b.remainingQuantity || 0));
        const unitCost = Math.max(0, Number(b.costPrice ?? p.costPrice ?? 0));
        batchVal += rem * unitCost;
      });
      currentInventoryValue += Math.round(batchVal);
    } else {
      const qty = Math.max(0, Number(p.stockInBaseUnit || 0));
      const cost = Math.max(0, Number(p.costPrice || 0));
      currentInventoryValue += Math.round(qty * cost);
    }
  });

  const inventoryValuation = isHistoricalCutoff
    ? Math.max(0, Math.round(currentInventoryValue + postCutoffCogs - postCutoffPurchases))
    : currentInventoryValue;

  // ---------------------------------------------------------------------------
  // 5. TAXES PAYABLE / PREPAID VAT UP TO CUTOFF (Across all active years <= cutoffYear)
  // ---------------------------------------------------------------------------
  const cutoffYear = Number(effectiveAsOfDate.slice(0, 4));
  const cutoffMonthIdx = Math.max(0, Math.min(11, Number(effectiveAsOfDate.slice(5, 7)) - 1));

  const yearSet = new Set<number>([cutoffYear]);
  transactions.forEach((tx) => {
    const y = new Date(tx.timestamp).getFullYear();
    if (y <= cutoffYear) yearSet.add(y);
  });
  taxRecords.forEach((r) => {
    const y = Number((r.periodMonth || '').slice(0, 4));
    if (y > 2000 && y <= cutoffYear) yearSet.add(y);
  });
  taxAdjustments.forEach((a) => {
    if (a.status !== 'ACTIVE') return;
    const y = Number((a.periodMonth || '').slice(0, 4));
    if (y > 2000 && y <= cutoffYear) yearSet.add(y);
  });

  let cumulativeTaxExpense = 0;
  let totalPaidTaxes = 0;
  let prepaidTaxVat = 0;

  Array.from(yearSet)
    .sort((a, b) => a - b)
    .forEach((yr) => {
      const analysis =
        precomputedAnnualTaxByYear?.get(yr) ||
        computeAnnualTaxBuckets({
          transactions,
          purchases,
          taxRecords,
          taxConfig,
          year: yr,
          taxAdjustments,
        });
      const maxMonth = yr === cutoffYear ? cutoffMonthIdx : 11;
      for (let m = 0; m <= maxMonth; m += 1) {
        const b = analysis.buckets[m];
        if (!b) continue;
        cumulativeTaxExpense += b.totalEstimatedTax;
        if (b.ppnOverpaymentAmount > 0) {
          prepaidTaxVat += b.ppnOverpaymentAmount;
        }
      }
    });

  taxRecords.forEach((rec) => {
    if (rec.status !== 'SUDAH_SETOR') return;
    const paidDate = rec.paidDate || `${rec.periodMonth}-28`;
    if (paidDate <= effectiveAsOfDate) {
      totalPaidTaxes += Math.max(0, Math.round(rec.paidAmount || rec.taxAmountDue || 0));
    }
  });

  const taxesPayable = Math.max(0, cumulativeTaxExpense - totalPaidTaxes);

  // ---------------------------------------------------------------------------
  // 6. NET CASH & BANK (Net income finalized after straight-line depreciation)
  // ---------------------------------------------------------------------------
  const cashInHand = salesCashReceived + cfCashIn - cfCashOut - poCashPaid;
  const bankAndNonCash = salesBankReceived + cfBankIn - cfBankOut - poBankPaid;

  // ---------------------------------------------------------------------------
  // 7. ASSEMBLE STRUCTURED BALANCE SHEET LINE ITEMS
  // ---------------------------------------------------------------------------
  const aktivaLancar: BalanceSheetLineItem[] = [
    {
      id: 'auto_cash',
      code: '1110',
      name: 'Kas Tunai (Laci Kasir & Kas Kecil)',
      section: 'AKTIVA_LANCAR',
      amount: Math.abs(cashInHand),
      signedAmount: cashInHand,
      isContra: cashInHand < 0,
      source: 'OTOMATIS_POS',
      detailNote: `Penjualan Tunai ${formatRupiah(salesCashReceived)} + Kas Masuk ${formatRupiah(cfCashIn)} − Kas Keluar ${formatRupiah(cfCashOut)} − Beli Tunai ${formatRupiah(poCashPaid)}`,
    },
    {
      id: 'auto_bank',
      code: '1120',
      name: 'Kas Bank & Saldo Non-Tunai (BCA / QRIS / EDC)',
      section: 'AKTIVA_LANCAR',
      amount: Math.abs(bankAndNonCash),
      signedAmount: bankAndNonCash,
      isContra: bankAndNonCash < 0,
      source: 'OTOMATIS_POS',
      detailNote: `Omzet QRIS/Transfer/EDC ${formatRupiah(salesBankReceived)} + Bank Masuk ${formatRupiah(cfBankIn)} − Bank Keluar ${formatRupiah(cfBankOut)} − PO Transfer ${formatRupiah(poBankPaid)}`,
    },
    {
      id: 'auto_ar',
      code: '1130',
      name: 'Piutang Usaha Pelanggan',
      section: 'AKTIVA_LANCAR',
      amount: accountsReceivable,
      signedAmount: accountsReceivable,
      isContra: false,
      source: 'OTOMATIS_POS',
      detailNote: `${arCount} nota transaksi berstatus Belum Lunas per ${effectiveAsOfDate}`,
    },
    {
      id: 'auto_inventory',
      code: '1140',
      name: 'Persediaan Barang Dagang (Valuasi HPP / FIFO)',
      section: 'AKTIVA_LANCAR',
      amount: inventoryValuation,
      signedAmount: inventoryValuation,
      isContra: false,
      source: 'OTOMATIS_POS',
      detailNote: isHistoricalCutoff
        ? `${physicalSkuCount} SKU fisik (estimasi posisi mundur FIFO per ${effectiveAsOfDate})`
        : `${physicalSkuCount} SKU fisik bernilai modal aktif di gudang`,
    },
  ];

  if (prepaidTaxVat > 0) {
    aktivaLancar.push({
      id: 'auto_prepaid_vat',
      code: '1150',
      name: 'PPN Masukan / Lebih Bayar Pajak',
      section: 'AKTIVA_LANCAR',
      amount: prepaidTaxVat,
      signedAmount: prepaidTaxVat,
      isContra: false,
      source: 'OTOMATIS_POS',
      detailNote: 'Kelebihan PPN Masukan yang dapat dikompensasikan / direstitusi',
    });
  }

  const aktivaTetap: BalanceSheetLineItem[] = [];
  const kewajibanLancar: BalanceSheetLineItem[] = [
    {
      id: 'auto_ap',
      code: '2110',
      name: 'Utang Usaha / Hutang Supplier (PO Belum Lunas)',
      section: 'KEWAJIBAN_LANCAR',
      amount: accountsPayable,
      signedAmount: accountsPayable,
      isContra: false,
      source: 'OTOMATIS_POS',
      detailNote: `${unpaidPoCount} Purchase Order pembelian tempo belum terbayar`,
    },
    {
      id: 'auto_tax_payable',
      code: '2120',
      name: 'Utang Pajak Terutang (PPh / PPN / PB1)',
      section: 'KEWAJIBAN_LANCAR',
      amount: taxesPayable,
      signedAmount: taxesPayable,
      isContra: false,
      source: 'OTOMATIS_POS',
      detailNote: `Akrual pajak ${formatRupiah(cumulativeTaxExpense)} − sudah disetor ${formatRupiah(totalPaidTaxes)}`,
    },
  ];

  const kewajibanJangkaPanjang: BalanceSheetLineItem[] = [];
  const ekuitas: BalanceSheetLineItem[] = [];

  if (cashflowCapitalInjections > 0) {
    ekuitas.push({
      id: 'auto_cf_capital',
      code: '3110',
      name: 'Suntikan Modal Pemilik (dari Buku Kas)',
      section: 'EKUITAS',
      amount: cashflowCapitalInjections,
      signedAmount: cashflowCapitalInjections,
      isContra: false,
      source: 'OTOMATIS_POS',
      detailNote: 'Akumulasi catatan Pemasukan kategori Modal / Suntikan Dana Pemilik',
    });
  }

  const fixedAssetSchedules: FixedAssetDepreciationSchedule[] = [];
  let totalAutoDepreciation = 0;

  // Merge user manual entries with asOfDate <= effectiveAsOfDate
  const activeManualEntries = [...manualEntries]
    .filter((entry) => !entry.asOfDate || entry.asOfDate <= effectiveAsOfDate)
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.timestamp - b.timestamp);

  activeManualEntries.forEach((entry) => {
    const absAmt = Math.max(0, Math.round(entry.amount || 0));
    const isContra = Boolean(entry.isContra);
    const signedAmt = isContra ? -absAmt : absAmt;

    const usesStraightLine =
      entry.section === 'AKTIVA_TETAP' &&
      !isContra &&
      entry.depreciationMethod === 'STRAIGHT_LINE' &&
      (entry.usefulLifeMonths || 0) > 0;

    const schedule = usesStraightLine
      ? computeFixedAssetDepreciation(entry, effectiveAsOfDate)
      : null;

    if (schedule) {
      fixedAssetSchedules.push(schedule);
      totalAutoDepreciation += schedule.accumulatedDepreciation;
    }

    const line: BalanceSheetLineItem = {
      id: entry.id,
      code: entry.accountCode,
      name: entry.accountName,
      section: entry.section,
      amount: absAmt,
      signedAmount: signedAmt,
      isContra,
      source: 'MANUAL',
      detailNote: schedule
        ? `Perolehan ${schedule.acquisitionDate} · Garis Lurus ${schedule.usefulLifeMonths} bln · Nilai Buku ${formatRupiah(schedule.netBookValue)}`
        : entry.notes?.trim() || `Efektif ${entry.asOfDate} · oleh ${entry.createdBy}`,
      asOfDate: entry.asOfDate,
      manualEntry: entry,
    };

    if (entry.section === 'AKTIVA_LANCAR') aktivaLancar.push(line);
    else if (entry.section === 'AKTIVA_TETAP') {
      aktivaTetap.push(line);
      if (schedule && schedule.accumulatedDepreciation > 0) {
        aktivaTetap.push({
          id: `auto_dep_${entry.id}`,
          code: `${entry.accountCode}-DEP`,
          name: `Akum. Penyusutan: ${entry.accountName}`,
          section: 'AKTIVA_TETAP',
          amount: schedule.accumulatedDepreciation,
          signedAmount: -schedule.accumulatedDepreciation,
          isContra: true,
          source: 'OTOMATIS_POS',
          detailNote: `Garis lurus ${schedule.elapsedMonths}/${schedule.usefulLifeMonths} bln (${formatRupiah(
            schedule.monthlyDepreciation
          )}/bln, residu ${formatRupiah(schedule.salvageValue)})`,
        });
      }
    } else if (entry.section === 'KEWAJIBAN_LANCAR') kewajibanLancar.push(line);
    else if (entry.section === 'KEWAJIBAN_JANGKA_PANJANG') kewajibanJangkaPanjang.push(line);
    else ekuitas.push(line);
  });

  const cumulativeNetIncome =
    grossSalesNetReturns -
    totalFifoCogs +
    operatingIncomeCashflow -
    operatingExpenseCashflow -
    cumulativeTaxExpense -
    totalAutoDepreciation;

  // Always append Laba/Rugi Berjalan (POS Otomatis) as last item of Ekuitas
  ekuitas.push({
    id: 'auto_net_income',
    code: '3900',
    name: cumulativeNetIncome >= 0 ? 'Laba Periode Berjalan (Otomatis POS)' : 'Rugi Periode Berjalan (Otomatis POS)',
    section: 'EKUITAS',
    amount: Math.abs(cumulativeNetIncome),
    signedAmount: cumulativeNetIncome,
    isContra: cumulativeNetIncome < 0,
    source: 'OTOMATIS_POS',
    detailNote:
      `Penjualan ${formatRupiah(grossSalesNetReturns)} − HPP FIFO ${formatRupiah(totalFifoCogs)} + Kas Lain ${formatRupiah(
        operatingIncomeCashflow
      )} − Beban Ops ${formatRupiah(operatingExpenseCashflow)} − Pajak ${formatRupiah(cumulativeTaxExpense)}` +
      (totalAutoDepreciation > 0 ? ` − Penyusutan ${formatRupiah(totalAutoDepreciation)}` : ''),
  });

  const sumSigned = (items: BalanceSheetLineItem[]) =>
    items.reduce((acc, item) => acc + item.signedAmount, 0);

  const totalAktivaLancar = sumSigned(aktivaLancar);
  const totalAktivaTetap = sumSigned(aktivaTetap);
  const totalAktiva = totalAktivaLancar + totalAktivaTetap;

  const totalKewajibanLancar = sumSigned(kewajibanLancar);
  const totalKewajibanJangkaPanjang = sumSigned(kewajibanJangkaPanjang);
  const totalKewajiban = totalKewajibanLancar + totalKewajibanJangkaPanjang;
  const totalEkuitas = sumSigned(ekuitas);
  const totalPasiva = totalKewajiban + totalEkuitas;

  const balanceDelta = totalAktiva - totalPasiva;
  const isBalanced = Math.abs(balanceDelta) <= 1; // tolerance Rp 1 rounding

  const cashPlusBank = cashInHand + bankAndNonCash;
  const workingCapital = totalAktivaLancar - totalKewajibanLancar;
  const currentRatio =
    totalKewajibanLancar > 0
      ? Number((totalAktivaLancar / totalKewajibanLancar).toFixed(2))
      : null;
  const cashRatio =
    totalKewajibanLancar > 0
      ? Number((cashPlusBank / totalKewajibanLancar).toFixed(2))
      : null;
  const debtToEquityRatio =
    totalEkuitas !== 0 ? Number((totalKewajiban / totalEkuitas).toFixed(2)) : null;
  const debtToAssetRatioPercent =
    totalAktiva > 0 ? Number(((totalKewajiban / totalAktiva) * 100).toFixed(1)) : 0;

  const manualAktivaLancarNet = aktivaLancar
    .filter((item) => item.source === 'MANUAL')
    .reduce((acc, item) => acc + item.signedAmount, 0);

  const normalizeDonutSlices = (
    raw: Array<Omit<BalanceSheetDonutSlice, 'percent'>>
  ): BalanceSheetDonutSlice[] => {
    const positiveTotal = raw.reduce((acc, item) => acc + Math.max(0, item.amount), 0);
    return raw.map((item) => {
      const clampedAmount = Math.max(0, Math.round(item.amount));
      return {
        ...item,
        amount: clampedAmount,
        percent:
          positiveTotal > 0 ? Number(((clampedAmount / positiveTotal) * 100).toFixed(1)) : 0,
      };
    });
  };

  const assetComposition = normalizeDonutSlices([
    {
      key: 'KAS_BANK',
      label: 'Kas & Bank',
      amount: Math.max(0, cashInHand + bankAndNonCash),
      color: '#0ea5e9',
      description: 'Kas Tunai laci kasir & saldo Bank / QRIS / EDC',
    },
    {
      key: 'PIUTANG',
      label: 'Piutang Usaha',
      amount: Math.max(0, accountsReceivable),
      color: '#6366f1',
      description: 'Tagihan transaksi pelanggan berstatus Belum Lunas',
    },
    {
      key: 'PERSEDIAAN',
      label: 'Persediaan Stok',
      amount: Math.max(0, inventoryValuation),
      color: '#10b981',
      description: 'Valuasi modal stok barang dagang (FIFO / HPP)',
    },
    {
      key: 'ASET_LANCAR_LAIN',
      label: 'Aset Lancar Lain',
      amount: Math.max(0, prepaidTaxVat + manualAktivaLancarNet),
      color: '#14b8a6',
      description: 'PPN Lebih Bayar & saldo lancar manual lainnya',
    },
    {
      key: 'ASET_TETAP',
      label: 'Aset Tetap (Netto)',
      amount: Math.max(0, totalAktivaTetap),
      color: '#f59e0b',
      description: 'Peralatan toko, kendaraan & inventaris setelah penyusutan',
    },
  ]);

  const pasivaComposition = normalizeDonutSlices([
    {
      key: 'KEWAJIBAN_LANCAR',
      label: 'Kewajiban Lancar',
      amount: Math.max(0, totalKewajibanLancar),
      color: '#f59e0b',
      description: 'Utang supplier PO tempo & utang pajak berjalan',
    },
    {
      key: 'KEWAJIBAN_JANGKA_PANJANG',
      label: 'Kewajiban Jk. Panjang',
      amount: Math.max(0, totalKewajibanJangkaPanjang),
      color: '#ef4444',
      description: 'Pinjaman bank / KUR / pembiayaan > 1 tahun',
    },
    {
      key: 'EKUITAS',
      label: 'Ekuitas & Modal',
      amount: Math.max(0, totalEkuitas),
      color: '#16a34a',
      description: 'Modal disetor pemilik, laba ditahan & laba periode berjalan',
    },
  ]);

  const topReceivableCustomers: ReceivableCustomerSummary[] = Array.from(
    customerReceivablesMap.values()
  )
    .sort((a, b) => b.totalDebt - a.totalDebt || b.overdueAmount - a.overdueAmount)
    .slice(0, 5)
    .map((c) => ({
      ...c,
      sharePercent:
        accountsReceivable > 0 ? Number(((c.totalDebt / accountsReceivable) * 100).toFixed(1)) : 0,
    }));

  const receivablesSummary: ReceivablesSummary = {
    totalAmount: accountsReceivable,
    unpaidInvoiceCount: arCount,
    overdueInvoiceCount,
    overdueAmount,
    receivableToAssetPercent:
      totalAktiva > 0 ? Number(((accountsReceivable / totalAktiva) * 100).toFixed(1)) : 0,
    topCustomers: topReceivableCustomers,
  };

  return {
    asOfDate: effectiveAsOfDate,
    storeName: storeSettings.storeName || 'KasirKu Tablet POS',
    aktivaLancar,
    aktivaTetap,
    kewajibanLancar,
    kewajibanJangkaPanjang,
    ekuitas,
    totalAktivaLancar,
    totalAktivaTetap,
    totalAktiva,
    totalKewajibanLancar,
    totalKewajibanJangkaPanjang,
    totalKewajiban,
    totalEkuitas,
    totalPasiva,
    balanceDelta,
    isBalanced,
    ratios: {
      workingCapital,
      currentRatio,
      cashRatio,
      debtToEquityRatio,
      debtToAssetRatioPercent,
    },
    assetComposition,
    pasivaComposition,
    fixedAssetSchedules,
    receivablesSummary,
    diagnostics: {
      cashInHand,
      bankAndNonCash,
      accountsReceivable,
      inventoryValuation,
      prepaidTaxVat,
      accountsPayable,
      taxesPayable,
      cumulativeNetIncome,
      cashflowCapitalInjections,
      grossSalesNetReturns,
      totalFifoCogs,
      operatingIncomeCashflow,
      operatingExpenseCashflow,
      cumulativeTaxExpense,
      totalAutoDepreciation,
      isHistoricalCutoff,
    },
  };
};

const MONTH_SHORT_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

export const computeBalanceSheetMonthlyTrend = (params: {
  endAsOfDate: string;
  monthsCount: number;
  transactions: Transaction[];
  products: Product[];
  purchases: RestockOrder[];
  cashflows: CashflowRecord[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  manualEntries: BalanceSheetEntry[];
  storeSettings: StoreSettings;
  customers?: Customer[];
}): BalanceSheetMonthlyTrendPoint[] => {
  const {
    endAsOfDate,
    monthsCount,
    transactions,
    products,
    purchases,
    cashflows,
    taxRecords,
    taxAdjustments,
    manualEntries,
    storeSettings,
    customers = [],
  } = params;

  const todayStr = getLocalDateStr(Date.now());
  const effectiveEnd = /^\d{4}-\d{2}-\d{2}$/.test(endAsOfDate) ? endAsOfDate : todayStr;
  const endYear = Number(effectiveEnd.slice(0, 4));
  const endMonth = Number(effectiveEnd.slice(5, 7)); // 1-12
  const endPeriodMonth = effectiveEnd.slice(0, 7);
  const count = Math.max(2, Math.min(24, Math.round(monthsCount || 12)));

  // Precompute annual tax buckets once across all years up to endYear for fast snapshot calculation
  const taxConfig = getEffectiveTaxConfig(storeSettings);
  const yearSet = new Set<number>([endYear]);
  transactions.forEach((tx) => {
    const y = new Date(tx.timestamp).getFullYear();
    if (y <= endYear) yearSet.add(y);
  });
  taxRecords.forEach((r) => {
    const y = Number((r.periodMonth || '').slice(0, 4));
    if (y > 2000 && y <= endYear) yearSet.add(y);
  });
  taxAdjustments.forEach((a) => {
    if (a.status !== 'ACTIVE') return;
    const y = Number((a.periodMonth || '').slice(0, 4));
    if (y > 2000 && y <= endYear) yearSet.add(y);
  });

  const precomputedAnnualTaxByYear = new Map<number, ReturnType<typeof computeAnnualTaxBuckets>>();
  yearSet.forEach((yr) => {
    precomputedAnnualTaxByYear.set(
      yr,
      computeAnnualTaxBuckets({
        transactions,
        purchases,
        taxRecords,
        taxConfig,
        year: yr,
        taxAdjustments,
      })
    );
  });

  const points: BalanceSheetMonthlyTrendPoint[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const d = new Date(endYear, endMonth - 1 - offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const pad = (n: number) => String(n).padStart(2, '0');
    const periodMonth = `${y}-${pad(m)}`;
    const lastDay = new Date(y, m, 0).getDate();
    const pointAsOfDate = periodMonth === endPeriodMonth ? effectiveEnd : `${periodMonth}-${pad(lastDay)}`;

    const snapshot = computeBalanceSheet({
      asOfDate: pointAsOfDate,
      transactions,
      products,
      purchases,
      cashflows,
      taxRecords,
      taxAdjustments,
      manualEntries,
      storeSettings,
      customers,
      precomputedAnnualTaxByYear,
    });

    points.push({
      periodMonth,
      label: `${MONTH_SHORT_ID[m - 1]} ${String(y).slice(2)}`,
      asOfDate: pointAsOfDate,
      totalAktiva: snapshot.totalAktiva,
      totalPasiva: snapshot.totalPasiva,
      totalKewajiban: snapshot.totalKewajiban,
      totalEkuitas: snapshot.totalEkuitas,
      totalAktivaTetapNetto: snapshot.totalAktivaTetap,
      totalAutoDepreciation: snapshot.diagnostics.totalAutoDepreciation,
    });
  }

  return points;
};

const csvEscape = (value: string | number): string => {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const buildBalanceSheetCsvContent = (report: BalanceSheetReport): string => {
  const rows: Array<Array<string | number>> = [
    ['LAPORAN POSISI KEUANGAN (NERACA)', report.storeName],
    ['Per Tanggal', report.asOfDate],
    ['Status Keseimbangan', report.isBalanced ? 'SEIMBANG (Aktiva = Pasiva)' : `Selisih Rp ${report.balanceDelta}`],
    [],
    ['Sisi', 'Kelompok', 'Kode Akun', 'Nama Akun', 'Sumber', 'Sifat', 'Saldo (Rp)', 'Keterangan'],
  ];

  const pushSectionRows = (side: 'AKTIVA' | 'PASIVA', groupLabel: string, items: BalanceSheetLineItem[], subtotal: number) => {
    items.forEach((item) => {
      rows.push([
        side,
        groupLabel,
        item.code,
        item.name,
        item.source === 'OTOMATIS_POS' ? 'Otomatis POS' : 'Manual',
        item.isContra ? 'Kontra (-)' : 'Normal (+)',
        item.signedAmount,
        item.detailNote,
      ]);
    });
    rows.push([side, groupLabel, '', `Subtotal ${groupLabel}`, '', '', subtotal, '']);
  };

  pushSectionRows('AKTIVA', 'Aktiva Lancar', report.aktivaLancar, report.totalAktivaLancar);
  pushSectionRows('AKTIVA', 'Aktiva Tetap', report.aktivaTetap, report.totalAktivaTetap);
  rows.push(['AKTIVA', 'TOTAL AKTIVA', '', 'TOTAL AKTIVA (LANCAR + TETAP)', '', '', report.totalAktiva, '']);

  rows.push([]);
  pushSectionRows('PASIVA', 'Kewajiban Lancar', report.kewajibanLancar, report.totalKewajibanLancar);
  pushSectionRows('PASIVA', 'Kewajiban Jangka Panjang', report.kewajibanJangkaPanjang, report.totalKewajibanJangkaPanjang);
  pushSectionRows('PASIVA', 'Ekuitas & Modal', report.ekuitas, report.totalEkuitas);
  rows.push(['PASIVA', 'TOTAL PASIVA', '', 'TOTAL PASIVA (KEWAJIBAN + EKUITAS)', '', '', report.totalPasiva, '']);

  rows.push([]);
  rows.push(['RASIO', 'Working Capital', '', 'Modal Kerja Bersih', '', '', report.ratios.workingCapital, 'Aktiva Lancar - Kewajiban Lancar']);
  rows.push(['RASIO', 'Current Ratio', '', 'Rasio Lancar', '', '', report.ratios.currentRatio !== null ? `${report.ratios.currentRatio}x` : 'N/A', 'Aktiva Lancar / Kewajiban Lancar']);
  rows.push(['RASIO', 'Debt to Asset', '', 'Rasio Utang terhadap Aset', '', '', `${report.ratios.debtToAssetRatioPercent}%`, 'Total Kewajiban / Total Aktiva']);

  return '\uFEFF' + rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
};

export const exportBalanceSheetCsv = (report: BalanceSheetReport): string => {
  const safeSlug = (report.storeName || 'KasirKu')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const filename = `Neraca_Aktiva_Pasiva_${report.asOfDate}_${safeSlug || 'Toko'}.csv`;
  const csvContent = buildBalanceSheetCsvContent(report);

  if (typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return filename;
};

export const exportBalanceSheetExcel = (report: BalanceSheetReport): string => {
  const wb = XLSX.utils.book_new();

  const summaryRows: Array<Array<string | number>> = [
    [`NERACA KEUANGAN (AKTIVA & PASIVA) — ${report.storeName.toUpperCase()}`],
    ['Tanggal Posisi Neraca', report.asOfDate],
    ['Tanggal Unduh', new Date().toLocaleString('id-ID')],
    ['Status Keseimbangan', report.isBalanced ? 'SEIMBANG (Aktiva = Pasiva)' : `Selisih Rp ${report.balanceDelta}`],
    [],
    ['AKTIVA (ASET)', 'Kode', 'Sumber', 'Nominal (Rp)', 'PASIVA (KEWAJIBAN & EKUITAS)', 'Kode', 'Sumber', 'Nominal (Rp)'],
  ];

  const aktivaFlat: BalanceSheetLineItem[] = [
    ...report.aktivaLancar,
    ...report.aktivaTetap,
  ];
  const pasivaFlat: BalanceSheetLineItem[] = [
    ...report.kewajibanLancar,
    ...report.kewajibanJangkaPanjang,
    ...report.ekuitas,
  ];

  const maxRows = Math.max(aktivaFlat.length, pasivaFlat.length);
  for (let i = 0; i < maxRows; i += 1) {
    const left = aktivaFlat[i];
    const right = pasivaFlat[i];
    summaryRows.push([
      left ? `${left.name}${left.isContra ? ' (Kontra −)' : ''}` : '',
      left ? left.code : '',
      left ? (left.source === 'OTOMATIS_POS' ? 'Otomatis POS' : 'Manual') : '',
      left ? left.signedAmount : '',
      right ? `${right.name}${right.isContra ? ' (Kontra −)' : ''}` : '',
      right ? right.code : '',
      right ? (right.source === 'OTOMATIS_POS' ? 'Otomatis POS' : 'Manual') : '',
      right ? right.signedAmount : '',
    ]);
  }

  summaryRows.push([]);
  summaryRows.push([
    'TOTAL AKTIVA',
    '',
    '',
    report.totalAktiva,
    'TOTAL PASIVA (KEWAJIBAN + EKUITAS)',
    '',
    '',
    report.totalPasiva,
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [
    { wch: 42 },
    { wch: 10 },
    { wch: 14 },
    { wch: 18 },
    { wch: 44 },
    { wch: 10 },
    { wch: 14 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Neraca Skontro');

  const buildDetailRows = (items: BalanceSheetLineItem[]) =>
    items.map((item) => ({
      Kode: item.code,
      Kelompok: BALANCE_SHEET_SECTION_LABELS[item.section],
      'Nama Akun': item.name,
      Sumber: item.source === 'OTOMATIS_POS' ? 'Otomatis POS' : 'Manual',
      Sifat: item.isContra ? 'Kontra (−)' : 'Normal (+)',
      'Nominal (Rp)': item.signedAmount,
      Keterangan: item.detailNote,
    }));

  const wsAktiva = XLSX.utils.json_to_sheet(buildDetailRows(aktivaFlat));
  wsAktiva['!cols'] = [
    { wch: 10 },
    { wch: 30 },
    { wch: 38 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 52 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAktiva, 'Rincian Aktiva');

  const wsPasiva = XLSX.utils.json_to_sheet(buildDetailRows(pasivaFlat));
  wsPasiva['!cols'] = [
    { wch: 10 },
    { wch: 36 },
    { wch: 38 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 52 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPasiva, 'Rincian Pasiva');

  const wsRatio = XLSX.utils.aoa_to_sheet([
    ['INDIKATOR KESEHATAN NERACA', 'Nilai', 'Keterangan'],
    ['Total Aktiva Lancar', report.totalAktivaLancar, 'Kas + Bank + Piutang + Persediaan + PPN Lebih Bayar'],
    ['Total Aktiva Tetap (Netto)', report.totalAktivaTetap, 'Aset Tetap dikurangi Akumulasi Penyusutan'],
    ['Total Kewajiban Lancar', report.totalKewajibanLancar, 'Utang Supplier + Utang Pajak + Kewajiban Lancar Lainnya'],
    ['Total Kewajiban Jangka Panjang', report.totalKewajibanJangkaPanjang, 'Pinjaman Bank / Leasing > 1 tahun'],
    ['Total Ekuitas', report.totalEkuitas, 'Modal Disetor + Laba Ditahan + Laba Periode Berjalan'],
    ['Modal Kerja Bersih (Working Capital)', report.ratios.workingCapital, 'Aktiva Lancar − Kewajiban Lancar'],
    ['Current Ratio', report.ratios.currentRatio ?? 'N/A (Tanpa Utang Lancar)', 'Rasio Likuiditas Jangka Pendek (Ideal ≥ 1.5x)'],
    ['Cash Ratio', report.ratios.cashRatio ?? 'N/A (Tanpa Utang Lancar)', 'Kemampuan Kas & Bank menutup Kewajiban Lancar'],
    ['Debt to Equity Ratio (DER)', report.ratios.debtToEquityRatio ?? 'N/A', 'Total Kewajiban / Total Ekuitas'],
    ['Debt to Asset Ratio (%)', `${report.ratios.debtToAssetRatioPercent}%`, 'Porsi Aset yang dibiayai Kewajiban'],
  ]);
  wsRatio['!cols'] = [{ wch: 34 }, { wch: 24 }, { wch: 52 }];
  XLSX.utils.book_append_sheet(wb, wsRatio, 'Rasio Keuangan');

  const safeSlug = (report.storeName || 'KasirKu')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const filename = `Neraca_Aktiva_Pasiva_${report.asOfDate}_${safeSlug || 'Toko'}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
};

export const exportBalanceSheetPdf = async (
  report: BalanceSheetReport,
  storeSettings?: StoreSettings
): Promise<string> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const contactLine = buildStoreContactLine(storeSettings);

  const { bannerHeight } = await drawPdfStoreHeader({
    doc,
    title: 'LAPORAN POSISI KEUANGAN (NERACA)',
    subtitle: `${report.storeName} · Per Tanggal ${report.asOfDate}`,
    contactLine,
    rightTopText: report.isBalanced ? 'STATUS: SEIMBANG' : `Selisih ${formatRupiah(report.balanceDelta)}`,
    rightBottomText: `Dicetak: ${new Date().toLocaleDateString('id-ID')}`,
    storeSettings,
    bannerColor: [15, 23, 42],
    accentStripeColor: [2, 132, 199],
    bannerHeight: 28,
  });

  // AKTIVA TABLE
  const aktivaBody: Array<[string, string, string, string]> = [
    ['1100', 'AKTIVA LANCAR', '', ''],
    ...report.aktivaLancar.map((item) => [
      item.code,
      `${item.name}${item.isContra ? ' (−)' : ''}`,
      item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
      item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
    ] as [string, string, string, string]),
    ['', 'Subtotal Aktiva Lancar', '', formatRupiah(report.totalAktivaLancar)],
    ['1200', 'AKTIVA TETAP', '', ''],
    ...(report.aktivaTetap.length > 0
      ? report.aktivaTetap.map((item) => [
          item.code,
          `${item.name}${item.isContra ? ' (−)' : ''}`,
          item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
          item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
        ] as [string, string, string, string])
      : [['-', 'Belum ada akun Aktiva Tetap tercatat', '-', 'Rp 0'] as [string, string, string, string]]),
    ['', 'Subtotal Aktiva Tetap (Netto)', '', formatRupiah(report.totalAktivaTetap)],
    ['', 'TOTAL AKTIVA', '', formatRupiah(report.totalAktiva)],
  ];

  autoTable(doc, {
    startY: bannerHeight + 5,
    head: [['Kode', 'Kelompok / Nama Akun AKTIVA', 'Sumber', 'Saldo (Rp)']],
    body: aktivaBody,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.2 },
    columnStyles: {
      0: { cellWidth: 16, font: 'courier' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 36, halign: 'right', font: 'courier' },
    },
    didParseCell: (data) => {
      const rowRaw = data.row.raw as string[];
      if (rowRaw && (rowRaw[1] === 'AKTIVA LANCAR' || rowRaw[1] === 'AKTIVA TETAP')) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
      if (rowRaw && (rowRaw[1]?.startsWith('Subtotal') || rowRaw[1] === 'TOTAL AKTIVA')) {
        data.cell.styles.fontStyle = 'bold';
        if (rowRaw[1] === 'TOTAL AKTIVA') {
          data.cell.styles.fillColor = [224, 242, 254];
        }
      }
    },
  });

  const nextY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 120) + 6;

  // PASIVA TABLE
  const pasivaBody: Array<[string, string, string, string]> = [
    ['2100', 'KEWAJIBAN LANCAR', '', ''],
    ...report.kewajibanLancar.map((item) => [
      item.code,
      `${item.name}${item.isContra ? ' (−)' : ''}`,
      item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
      item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
    ] as [string, string, string, string]),
    ['', 'Subtotal Kewajiban Lancar', '', formatRupiah(report.totalKewajibanLancar)],
    ['2200', 'KEWAJIBAN JANGKA PANJANG', '', ''],
    ...(report.kewajibanJangkaPanjang.length > 0
      ? report.kewajibanJangkaPanjang.map((item) => [
          item.code,
          `${item.name}${item.isContra ? ' (−)' : ''}`,
          item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
          item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
        ] as [string, string, string, string])
      : [['-', 'Tidak ada Kewajiban Jangka Panjang tercatat', '-', 'Rp 0'] as [string, string, string, string]]),
    ['', 'Subtotal Kewajiban Jangka Panjang', '', formatRupiah(report.totalKewajibanJangkaPanjang)],
    ['3000', 'EKUITAS / MODAL', '', ''],
    ...report.ekuitas.map((item) => [
      item.code,
      `${item.name}${item.isContra ? ' (−)' : ''}`,
      item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
      item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
    ] as [string, string, string, string]),
    ['', 'Subtotal Ekuitas', '', formatRupiah(report.totalEkuitas)],
    ['', 'TOTAL PASIVA (KEWAJIBAN + EKUITAS)', '', formatRupiah(report.totalPasiva)],
  ];

  autoTable(doc, {
    startY: nextY,
    head: [['Kode', 'Kelompok / Nama Akun PASIVA', 'Sumber', 'Saldo (Rp)']],
    body: pasivaBody,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8, cellPadding: 2.2 },
    columnStyles: {
      0: { cellWidth: 16, font: 'courier' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 36, halign: 'right', font: 'courier' },
    },
    didParseCell: (data) => {
      const rowRaw = data.row.raw as string[];
      if (
        rowRaw &&
        (rowRaw[1] === 'KEWAJIBAN LANCAR' ||
          rowRaw[1] === 'KEWAJIBAN JANGKA PANJANG' ||
          rowRaw[1] === 'EKUITAS / MODAL')
      ) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
      if (rowRaw && (rowRaw[1]?.startsWith('Subtotal') || rowRaw[1]?.startsWith('TOTAL PASIVA'))) {
        data.cell.styles.fontStyle = 'bold';
        if (rowRaw[1]?.startsWith('TOTAL PASIVA')) {
          data.cell.styles.fillColor = [226, 232, 240];
        }
      }
    },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 220) + 8;
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Modal Kerja Bersih: ${formatRupiah(report.ratios.workingCapital)} | Current Ratio: ${
      report.ratios.currentRatio !== null ? `${report.ratios.currentRatio}x` : 'N/A'
    } | DER: ${
      report.ratios.debtToEquityRatio !== null ? `${report.ratios.debtToEquityRatio}x` : 'N/A'
    } | Dicetak: ${new Date().toLocaleString('id-ID')}`,
    14,
    Math.min(286, finalY)
  );

  const safeSlug = (report.storeName || 'KasirKu')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const filename = `Neraca_Aktiva_Pasiva_${report.asOfDate}_${safeSlug || 'Toko'}.pdf`;
  doc.save(filename);
  return filename;
};

const MONTH_FULL_ID = [
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

const resolveMonthBoundaries = (periodMonth: string): {
  validMonth: string;
  year: number;
  monthNum: number;
  monthStartDate: string;
  monthEndDate: string;
  prevMonthEndDate: string;
  periodLabel: string;
  shortLabel: string;
} => {
  const today = new Date();
  const fallbackMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const validMonth = /^\d{4}-\d{2}$/.test(periodMonth) ? periodMonth : fallbackMonth;
  const year = Number(validMonth.slice(0, 4));
  const monthNum = Math.max(1, Math.min(12, Number(validMonth.slice(5, 7))));
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, monthNum, 0).getDate();
  const prevLastDate = new Date(year, monthNum - 1, 0);

  return {
    validMonth,
    year,
    monthNum,
    monthStartDate: `${year}-${pad(monthNum)}-01`,
    monthEndDate: `${year}-${pad(monthNum)}-${pad(lastDay)}`,
    prevMonthEndDate: `${prevLastDate.getFullYear()}-${pad(prevLastDate.getMonth() + 1)}-${pad(
      prevLastDate.getDate()
    )}`,
    periodLabel: `${MONTH_FULL_ID[monthNum - 1]} ${year}`,
    shortLabel: `${MONTH_SHORT_ID[monthNum - 1]} ${String(year).slice(2)}`,
  };
};

export const computeMonthlyProfitAndLoss = (params: {
  periodMonth: string; // YYYY-MM
  transactions: Transaction[];
  cashflows: CashflowRecord[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  manualEntries: BalanceSheetEntry[];
  storeSettings: StoreSettings;
  precomputedAnnualTaxByYear?: Map<number, ReturnType<typeof computeAnnualTaxBuckets>>;
}): MonthlyProfitAndLossReport => {
  const {
    periodMonth,
    transactions = [],
    cashflows = [],
    purchases = [],
    taxRecords = [],
    taxAdjustments = [],
    manualEntries = [],
    storeSettings,
    precomputedAnnualTaxByYear,
  } = params;

  const bounds = resolveMonthBoundaries(periodMonth);
  const todayStr = getLocalDateStr(Date.now());
  const currentMonthStr = todayStr.slice(0, 7);
  const effectiveBalanceSheetAsOfDate =
    bounds.validMonth === currentMonthStr ? todayStr : bounds.monthEndDate;

  const startMs = new Date(bounds.year, bounds.monthNum - 1, 1, 0, 0, 0, 0).getTime();
  const endMs = parseLocalDateEndMs(bounds.monthEndDate);

  let grossSalesNetReturns = 0;
  let totalFifoCogs = 0;
  let txCount = 0;

  transactions.forEach((tx) => {
    if (tx.timestamp < startMs || tx.timestamp > endMs) return;
    txCount += 1;
    const bd = computeTxTaxableBreakdown(tx, true);
    const netCollectible = Math.max(0, (tx.finalAmount || 0) - (tx.returnedAmount || 0));

    let txCogs = 0;
    (tx.items || []).forEach((item) => {
      if (item.isCashWithdrawal || /tarik\s*tunai/i.test(item.productName || '')) return;
      txCogs += Math.max(0, getItemFifoCogs(item));
    });

    if ((tx.finalAmount || 0) > 0 && (tx.returnedAmount || 0) > 0) {
      const keepRatio = Math.max(0, Math.min(1, netCollectible / (tx.finalAmount || 1)));
      txCogs = Math.round(txCogs * keepRatio);
    }

    grossSalesNetReturns += bd.netTaxable;
    totalFifoCogs += txCogs;
  });

  let otherIncome = 0;
  let operatingExpenses = 0;
  const expenseMap = new Map<string, MonthlyProfitExpenseCategory>();

  cashflows.forEach((cf) => {
    const cfDate = cf.date || getLocalDateStr(cf.timestamp || 0);
    if (!cfDate.startsWith(bounds.validMonth)) return;
    const amt = Math.max(0, Math.round(cf.amount || 0));
    if (amt <= 0) return;

    if (cf.type === 'PEMASUKAN') {
      if (cf.isCashWithdrawalAdminProfit) return;
      if (/modal|suntikan/i.test(cf.category || '')) return;
      otherIncome += amt;
    } else {
      const isTaxCashPayment =
        cf.category === 'Pajak, Iuran & Retribusi' || cf.id.startsWith('cf_tax_');
      if (cf.isCashWithdrawalOutflow || isTaxCashPayment) return;
      operatingExpenses += amt;
      const catKey = (cf.category || 'Lain-lain (Pengeluaran)').trim();
      const prev = expenseMap.get(catKey) || { category: catKey, amount: 0, count: 0 };
      prev.amount += amt;
      prev.count += 1;
      expenseMap.set(catKey, prev);
    }
  });

  const expenseBreakdown = Array.from(expenseMap.values()).sort((a, b) => b.amount - a.amount);

  // Monthly incremental straight-line depreciation so monthly P&L reconciles cleanly with Neraca
  let depreciationExpense = 0;
  manualEntries.forEach((entry) => {
    if (
      entry.section !== 'AKTIVA_TETAP' ||
      entry.isContra ||
      entry.depreciationMethod !== 'STRAIGHT_LINE' ||
      (entry.usefulLifeMonths || 0) <= 0
    ) {
      return;
    }
    if (entry.asOfDate && entry.asOfDate > bounds.monthEndDate) return;
    const endSchedule = computeFixedAssetDepreciation(entry, bounds.monthEndDate);
    const prevSchedule = computeFixedAssetDepreciation(entry, bounds.prevMonthEndDate);
    depreciationExpense += Math.max(0, endSchedule.accumulatedDepreciation - prevSchedule.accumulatedDepreciation);
  });

  const taxConfig = getEffectiveTaxConfig(storeSettings);
  const annualTax =
    precomputedAnnualTaxByYear?.get(bounds.year) ||
    computeAnnualTaxBuckets({
      transactions,
      purchases,
      taxRecords,
      taxConfig,
      year: bounds.year,
      taxAdjustments,
    });
  const monthBucket = annualTax.buckets[bounds.monthNum - 1];
  const estimatedTaxExpense = monthBucket ? Math.max(0, Math.round(monthBucket.totalEstimatedTax || 0)) : 0;

  const grossProfit = grossSalesNetReturns - totalFifoCogs;
  const operatingProfitBeforeTax = grossProfit + otherIncome - operatingExpenses - depreciationExpense;
  const netProfit = operatingProfitBeforeTax - estimatedTaxExpense;

  const totalRevenueBase = grossSalesNetReturns + otherIncome;
  const grossMarginPercent =
    grossSalesNetReturns > 0 ? Number(((grossProfit / grossSalesNetReturns) * 100).toFixed(1)) : 0;
  const netMarginPercent =
    totalRevenueBase > 0 ? Number(((netProfit / totalRevenueBase) * 100).toFixed(1)) : 0;
  const opexRatioPercent =
    totalRevenueBase > 0
      ? Number((((operatingExpenses + depreciationExpense) / totalRevenueBase) * 100).toFixed(1))
      : 0;
  const profitRetentionPercent =
    grossProfit > 0 ? Number(((netProfit / grossProfit) * 100).toFixed(1)) : 0;

  return {
    periodMonth: bounds.validMonth,
    periodLabel: bounds.periodLabel,
    monthStartDate: bounds.monthStartDate,
    monthEndDate: bounds.monthEndDate,
    effectiveBalanceSheetAsOfDate,
    txCount,
    grossSalesNetReturns,
    totalFifoCogs,
    grossProfit,
    grossMarginPercent,
    otherIncome,
    operatingExpenses,
    expenseBreakdown,
    depreciationExpense,
    operatingProfitBeforeTax,
    estimatedTaxExpense,
    netProfit,
    netMarginPercent,
    opexRatioPercent,
    profitRetentionPercent,
  };
};

export const computeMonthlyProfitComparisonTrend = (params: {
  endPeriodMonth: string; // YYYY-MM
  monthsCount: number;
  transactions: Transaction[];
  cashflows: CashflowRecord[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  manualEntries: BalanceSheetEntry[];
  storeSettings: StoreSettings;
}): MonthlyProfitComparisonPoint[] => {
  const {
    endPeriodMonth,
    monthsCount,
    transactions,
    cashflows,
    purchases,
    taxRecords,
    taxAdjustments,
    manualEntries,
    storeSettings,
  } = params;

  const bounds = resolveMonthBoundaries(endPeriodMonth);
  const count = Math.max(1, Math.min(24, monthsCount));
  const taxConfig = getEffectiveTaxConfig(storeSettings);
  const pad = (n: number) => String(n).padStart(2, '0');

  const monthSpecs: Array<{ periodMonth: string; year: number; shortLabel: string; fullLabel: string }> = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const dt = new Date(bounds.year, bounds.monthNum - 1 - offset, 1);
    const y = dt.getFullYear();
    const m = dt.getMonth() + 1;
    monthSpecs.push({
      periodMonth: `${y}-${pad(m)}`,
      year: y,
      shortLabel: `${MONTH_SHORT_ID[m - 1]} ${String(y).slice(2)}`,
      fullLabel: `${MONTH_FULL_ID[m - 1]} ${y}`,
    });
  }

  const precomputedAnnualTaxByYear = new Map<number, ReturnType<typeof computeAnnualTaxBuckets>>();
  Array.from(new Set(monthSpecs.map((s) => s.year))).forEach((yr) => {
    precomputedAnnualTaxByYear.set(
      yr,
      computeAnnualTaxBuckets({
        transactions,
        purchases,
        taxRecords,
        taxConfig,
        year: yr,
        taxAdjustments,
      })
    );
  });

  return monthSpecs.map((spec) => {
    const pnl = computeMonthlyProfitAndLoss({
      periodMonth: spec.periodMonth,
      transactions,
      cashflows,
      purchases,
      taxRecords,
      taxAdjustments,
      manualEntries,
      storeSettings,
      precomputedAnnualTaxByYear,
    });

    return {
      periodMonth: spec.periodMonth,
      label: spec.shortLabel,
      fullLabel: spec.fullLabel,
      omzet: pnl.grossSalesNetReturns,
      hppFifo: pnl.totalFifoCogs,
      labaKotor: pnl.grossProfit,
      bebanOperasional: pnl.operatingExpenses,
      penyusutan: pnl.depreciationExpense,
      estimasiPajak: pnl.estimatedTaxExpense,
      pendapatanLain: pnl.otherIncome,
      labaBersih: pnl.netProfit,
      grossMarginPercent: pnl.grossMarginPercent,
      netMarginPercent: pnl.netMarginPercent,
      opexRatioPercent: pnl.opexRatioPercent,
      profitRetentionPercent: pnl.profitRetentionPercent,
      txCount: pnl.txCount,
    };
  });
};

export const exportMonthlyFinancialReportPdf = async (params: {
  periodMonth: string;
  transactions: Transaction[];
  products: Product[];
  purchases: RestockOrder[];
  cashflows: CashflowRecord[];
  customers?: Customer[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  manualEntries: BalanceSheetEntry[];
  storeSettings: StoreSettings;
  preparedBy?: string;
}): Promise<string> => {
  const {
    periodMonth,
    transactions,
    products,
    purchases,
    cashflows,
    customers = [],
    taxRecords,
    taxAdjustments,
    manualEntries,
    storeSettings,
    preparedBy = 'Manajer / Admin',
  } = params;

  const pnl = computeMonthlyProfitAndLoss({
    periodMonth,
    transactions,
    cashflows,
    purchases,
    taxRecords,
    taxAdjustments,
    manualEntries,
    storeSettings,
  });

  const balanceSheet = computeBalanceSheet({
    asOfDate: pnl.effectiveBalanceSheetAsOfDate,
    transactions,
    products,
    purchases,
    cashflows,
    customers,
    taxRecords,
    taxAdjustments,
    manualEntries,
    storeSettings,
  });

  const storeDisplayName = storeSettings.storeName || balanceSheet.storeName || 'KasirKu Tablet POS';
  const contactLine = buildStoreContactLine(storeSettings);
  const logoAsset = await resolvePdfLogoAsset(storeSettings.storeLogo);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // ===========================================================================
  // PAGE 1: LAPORAN LABA RUGI BULANAN (INCOME STATEMENT)
  // ===========================================================================
  const { bannerHeight: page1BannerH } = await drawPdfStoreHeader({
    doc,
    title: 'LAPORAN KEUANGAN — LABA RUGI',
    subtitle: `${storeDisplayName} · Periode: ${pnl.periodLabel} (${pnl.monthStartDate} s/d ${pnl.monthEndDate})`,
    contactLine: contactLine || `Disiapkan oleh: ${preparedBy}`,
    rightTopText: `Transaksi: ${pnl.txCount} nota`,
    rightBottomText: `Dicetak: ${new Date().toLocaleDateString('id-ID')}`,
    storeSettings,
    preloadedLogo: logoAsset,
    bannerColor: [15, 23, 42],
    accentStripeColor: [13, 148, 136],
    bannerHeight: 28,
  });

  const fmtSigned = (val: number) =>
    val < 0 ? `(${formatRupiah(Math.abs(val))})` : formatRupiah(val);

  const pnlRows: Array<[string, string, string]> = [
    ['PENDAPATAN USAHA', '', ''],
    ['Penjualan Usaha (Netto Retur & Bebas Pajak)', `${pnl.txCount} Transaksi`, formatRupiah(pnl.grossSalesNetReturns)],
    ['Harga Pokok Penjualan (HPP Metode FIFO)', 'Beban Pokok', `(${formatRupiah(pnl.totalFifoCogs)})`],
    ['LABA KOTOR (GROSS PROFIT)', `Margin ${pnl.grossMarginPercent.toFixed(1)}%`, fmtSigned(pnl.grossProfit)],
    ['Pendapatan Kas Lain-Lain (Non-Modal)', 'Buku Kas', formatRupiah(pnl.otherIncome)],
    ['BEBAN OPERASIONAL, PENYUSUTAN & PAJAK', '', ''],
    ...(pnl.expenseBreakdown.length > 0
      ? pnl.expenseBreakdown.map((item) => [
          `  • ${item.category}`,
          `${item.count} Catatan`,
          `(${formatRupiah(item.amount)})`,
        ] as [string, string, string])
      : [['  • Tidak ada beban kas operasional tercatat', '-', 'Rp 0'] as [string, string, string]]),
    ['Beban Penyusutan Aset Tetap (Garis Lurus)', 'Aktiva Tetap', `(${formatRupiah(pnl.depreciationExpense)})`],
    ['Total Beban Operasional & Penyusutan', `Rasio ${pnl.opexRatioPercent.toFixed(1)}%`, `(${formatRupiah(pnl.operatingExpenses + pnl.depreciationExpense)})`],
    ['LABA OPERASIONAL SEBELUM PAJAK', 'EBIT', fmtSigned(pnl.operatingProfitBeforeTax)],
    ['Estimasi / Beban Pajak Bulanan (PPh / PPN / PB1)', 'Akrual Pajak', `(${formatRupiah(pnl.estimatedTaxExpense)})`],
    ['LABA / RUGI BERSIH BULAN INI', `Net Margin ${pnl.netMarginPercent.toFixed(1)}%`, fmtSigned(pnl.netProfit)],
  ];

  autoTable(doc, {
    startY: page1BannerH + 5,
    head: [['Pos / Akun Laba Rugi', 'Keterangan / Rasio', 'Nominal (Rp)']],
    body: pnlRows,
    theme: 'grid',
    headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8.3, cellPadding: 2.5 },
    columnStyles: {
      1: { cellWidth: 40, halign: 'center' },
      2: { cellWidth: 42, halign: 'right', font: 'courier' },
    },
    didParseCell: (data) => {
      const rowRaw = data.row.raw as string[];
      const label = rowRaw?.[0] || '';
      if (label === 'PENDAPATAN USAHA' || label === 'BEBAN OPERASIONAL, PENYUSUTAN & PAJAK') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      } else if (
        label === 'LABA KOTOR (GROSS PROFIT)' ||
        label === 'LABA OPERASIONAL SEBELUM PAJAK' ||
        label === 'Total Beban Operasional & Penyusutan'
      ) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [248, 250, 252];
      } else if (label === 'LABA / RUGI BERSIH BULAN INI') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = pnl.netProfit >= 0 ? [209, 250, 229] : [254, 226, 226];
        data.cell.styles.textColor = pnl.netProfit >= 0 ? [6, 95, 70] : [153, 27, 27];
      }
    },
  });

  const pnlEndY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 180) + 8;
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Efisiensi Operasional: Retensi Laba Kotor → Bersih ${pnl.profitRetentionPercent.toFixed(1)}% · Rasio Beban Ops/Omzet ${pnl.opexRatioPercent.toFixed(1)}%`,
    14,
    Math.min(276, pnlEndY)
  );
  doc.text(
    `Halaman 1/2 — Dilanjutkan ke Laporan Posisi Keuangan (Neraca) per ${balanceSheet.asOfDate}`,
    14,
    284
  );

  // ===========================================================================
  // PAGE 2: LAPORAN POSISI KEUANGAN (NERACA AKTIVA & PASIVA)
  // ===========================================================================
  doc.addPage();
  const { bannerHeight: page2BannerH } = await drawPdfStoreHeader({
    doc,
    title: 'LAPORAN POSISI KEUANGAN (NERACA)',
    subtitle: `${storeDisplayName} · Posisi Per Tanggal ${balanceSheet.asOfDate}`,
    contactLine,
    rightTopText: balanceSheet.isBalanced
      ? 'STATUS: SEIMBANG'
      : `Selisih ${formatRupiah(balanceSheet.balanceDelta)}`,
    rightBottomText: `Arsip ${pnl.periodLabel}`,
    storeSettings,
    preloadedLogo: logoAsset,
    bannerColor: [15, 23, 42],
    accentStripeColor: [2, 132, 199],
    bannerHeight: 28,
  });

  const aktivaBody: Array<[string, string, string, string]> = [
    ['1100', 'AKTIVA LANCAR', '', ''],
    ...balanceSheet.aktivaLancar.map((item) => [
      item.code,
      `${item.name}${item.isContra ? ' (−)' : ''}`,
      item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
      item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
    ] as [string, string, string, string]),
    ['', 'Subtotal Aktiva Lancar', '', formatRupiah(balanceSheet.totalAktivaLancar)],
    ['1200', 'AKTIVA TETAP', '', ''],
    ...(balanceSheet.aktivaTetap.length > 0
      ? balanceSheet.aktivaTetap.map((item) => [
          item.code,
          `${item.name}${item.isContra ? ' (−)' : ''}`,
          item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
          item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
        ] as [string, string, string, string])
      : [['-', 'Belum ada akun Aktiva Tetap tercatat', '-', 'Rp 0'] as [string, string, string, string]]),
    ['', 'Subtotal Aktiva Tetap (Netto)', '', formatRupiah(balanceSheet.totalAktivaTetap)],
    ['', 'TOTAL AKTIVA', '', formatRupiah(balanceSheet.totalAktiva)],
  ];

  autoTable(doc, {
    startY: page2BannerH + 5,
    head: [['Kode', 'Kelompok / Nama Akun AKTIVA', 'Sumber', 'Saldo (Rp)']],
    body: aktivaBody,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 7.9, cellPadding: 2.1 },
    columnStyles: {
      0: { cellWidth: 16, font: 'courier' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 36, halign: 'right', font: 'courier' },
    },
    didParseCell: (data) => {
      const rowRaw = data.row.raw as string[];
      if (rowRaw && (rowRaw[1] === 'AKTIVA LANCAR' || rowRaw[1] === 'AKTIVA TETAP')) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
      if (rowRaw && (rowRaw[1]?.startsWith('Subtotal') || rowRaw[1] === 'TOTAL AKTIVA')) {
        data.cell.styles.fontStyle = 'bold';
        if (rowRaw[1] === 'TOTAL AKTIVA') {
          data.cell.styles.fillColor = [224, 242, 254];
        }
      }
    },
  });

  const pasivaStartY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 120) + 6;
  const pasivaBody: Array<[string, string, string, string]> = [
    ['2100', 'KEWAJIBAN LANCAR', '', ''],
    ...balanceSheet.kewajibanLancar.map((item) => [
      item.code,
      `${item.name}${item.isContra ? ' (−)' : ''}`,
      item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
      item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
    ] as [string, string, string, string]),
    ['', 'Subtotal Kewajiban Lancar', '', formatRupiah(balanceSheet.totalKewajibanLancar)],
    ['2200', 'KEWAJIBAN JANGKA PANJANG', '', ''],
    ...(balanceSheet.kewajibanJangkaPanjang.length > 0
      ? balanceSheet.kewajibanJangkaPanjang.map((item) => [
          item.code,
          `${item.name}${item.isContra ? ' (−)' : ''}`,
          item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
          item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
        ] as [string, string, string, string])
      : [['-', 'Tidak ada Kewajiban Jangka Panjang tercatat', '-', 'Rp 0'] as [string, string, string, string]]),
    ['', 'Subtotal Kewajiban Jangka Panjang', '', formatRupiah(balanceSheet.totalKewajibanJangkaPanjang)],
    ['3000', 'EKUITAS / MODAL', '', ''],
    ...balanceSheet.ekuitas.map((item) => [
      item.code,
      `${item.name}${item.isContra ? ' (−)' : ''}`,
      item.source === 'OTOMATIS_POS' ? 'POS' : 'Manual',
      item.signedAmount < 0 ? `(${formatRupiah(Math.abs(item.signedAmount))})` : formatRupiah(item.signedAmount),
    ] as [string, string, string, string]),
    ['', 'Subtotal Ekuitas', '', formatRupiah(balanceSheet.totalEkuitas)],
    ['', 'TOTAL PASIVA (KEWAJIBAN + EKUITAS)', '', formatRupiah(balanceSheet.totalPasiva)],
  ];

  autoTable(doc, {
    startY: pasivaStartY,
    head: [['Kode', 'Kelompok / Nama Akun PASIVA', 'Sumber', 'Saldo (Rp)']],
    body: pasivaBody,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 7.9, cellPadding: 2.1 },
    columnStyles: {
      0: { cellWidth: 16, font: 'courier' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 36, halign: 'right', font: 'courier' },
    },
    didParseCell: (data) => {
      const rowRaw = data.row.raw as string[];
      if (
        rowRaw &&
        (rowRaw[1] === 'KEWAJIBAN LANCAR' ||
          rowRaw[1] === 'KEWAJIBAN JANGKA PANJANG' ||
          rowRaw[1] === 'EKUITAS / MODAL')
      ) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
      }
      if (rowRaw && (rowRaw[1]?.startsWith('Subtotal') || rowRaw[1]?.startsWith('TOTAL PASIVA'))) {
        data.cell.styles.fontStyle = 'bold';
        if (rowRaw[1]?.startsWith('TOTAL PASIVA')) {
          data.cell.styles.fillColor = [226, 232, 240];
        }
      }
    },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 235) + 7;
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Modal Kerja Bersih: ${formatRupiah(balanceSheet.ratios.workingCapital)} | Current Ratio: ${
      balanceSheet.ratios.currentRatio !== null ? `${balanceSheet.ratios.currentRatio}x` : 'N/A'
    } | DER: ${
      balanceSheet.ratios.debtToEquityRatio !== null ? `${balanceSheet.ratios.debtToEquityRatio}x` : 'N/A'
    } | Dicetak: ${new Date().toLocaleString('id-ID')}`,
    14,
    Math.min(282, finalY)
  );
  doc.text(`Halaman 2/2 — Arsip Resmi Laporan Keuangan ${storeDisplayName} (${pnl.periodLabel})`, 14, 288);

  const safeSlug = storeDisplayName
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const filename = `Laporan_Keuangan_LabaRugi_Neraca_${pnl.periodMonth}_${safeSlug || 'Toko'}.pdf`;
  doc.save(filename);
  return filename;
};

/**
 * Print-ready Executive PDF Packet for Business Owner:
 * Combines Monthly Profit & Loss Summary + Warehouse Stock & Valuation Report
 * with crisp Store Logo header, KPI overview cards, category breakdown, and SKU table.
 */
export const exportStockAndProfitLossPdf = async (params: {
  periodMonth: string;
  transactions: Transaction[];
  products: Product[];
  purchases?: RestockOrder[];
  cashflows?: CashflowRecord[];
  taxRecords?: TaxRecord[];
  taxAdjustments?: TaxAdjustment[];
  manualEntries?: BalanceSheetEntry[];
  storeSettings: StoreSettings;
  preparedBy?: string;
  autoSave?: boolean;
}): Promise<{ doc: jsPDF; filename: string; netProfit: number; totalStockValuation: number }> => {
  const {
    periodMonth,
    transactions = [],
    products = [],
    purchases = [],
    cashflows = [],
    taxRecords = [],
    taxAdjustments = [],
    manualEntries = [],
    storeSettings,
    preparedBy = 'Manajer Toko',
    autoSave = true,
  } = params;

  const pnl = computeMonthlyProfitAndLoss({
    periodMonth,
    transactions,
    cashflows,
    purchases,
    taxRecords,
    taxAdjustments,
    manualEntries,
    storeSettings,
  });

  const physicalProducts = products.filter((p) => p.productType !== 'JASA');
  let totalStockValuation = 0;
  let totalRetailPotential = 0;
  let totalBaseUnits = 0;
  let outOfStockCount = 0;
  let lowStockCount = 0;

  const categoryStockMap = new Map<
    string,
    { category: string; skuCount: number; totalUnits: number; modalValuation: number; retailPotential: number; criticalCount: number }
  >();

  physicalProducts.forEach((p) => {
    const qty = Math.max(0, p.stockInBaseUnit || 0);
    const modalVal = Math.round(qty * (p.costPrice || 0));
    const sellUnitPrice = p.units?.[0]?.sellingPrice || p.costPrice || 0;
    const sellFactor = Math.max(1, p.units?.[0]?.conversionFactor || 1);
    const baseSellPrice = sellUnitPrice / sellFactor;
    const retailVal = Math.round(qty * baseSellPrice);

    totalStockValuation += modalVal;
    totalRetailPotential += retailVal;
    totalBaseUnits += qty;

    const isZero = qty <= 0;
    const isLow = qty <= (p.minStockAlert || 0);
    if (isZero) outOfStockCount += 1;
    else if (isLow) lowStockCount += 1;

    const catKey = p.category || 'Umum';
    const existing = categoryStockMap.get(catKey) || {
      category: catKey,
      skuCount: 0,
      totalUnits: 0,
      modalValuation: 0,
      retailPotential: 0,
      criticalCount: 0,
    };
    existing.skuCount += 1;
    existing.totalUnits += qty;
    existing.modalValuation += modalVal;
    existing.retailPotential += retailVal;
    if (isLow) existing.criticalCount += 1;
    categoryStockMap.set(catKey, existing);
  });

  const categoryStockRows = Array.from(categoryStockMap.values()).sort(
    (a, b) => b.modalValuation - a.modalValuation
  );

  const storeDisplayName = storeSettings.storeName || 'KasirKu Tablet POS';
  const contactLine = buildStoreContactLine(storeSettings);
  const printedAt = new Date().toLocaleString('id-ID');
  const logoAsset = await resolvePdfLogoAsset(storeSettings.storeLogo);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // ===========================================================================
  // PAGE 1: RINGKASAN LABA RUGI & IKHTISAR EKSEKUTIF PEMILIK
  // ===========================================================================
  const { bannerHeight: p1BannerH } = await drawPdfStoreHeader({
    doc,
    title: 'LAPORAN STOK & RINGKASAN LABA RUGI',
    subtitle: `${storeDisplayName.toUpperCase()} · Periode: ${pnl.periodLabel} (${pnl.monthStartDate} s/d ${pnl.monthEndDate})`,
    contactLine: contactLine || `Disiapkan oleh: ${preparedBy}`,
    rightTopText: `Untuk: Pemilik Bisnis`,
    rightBottomText: `Dicetak: ${printedAt}`,
    storeSettings,
    preloadedLogo: logoAsset,
    bannerColor: [15, 23, 42],
    accentStripeColor: [16, 185, 129],
    bannerHeight: 28,
  });

  // Executive KPI Strip (4 compact cards)
  const kpiY = p1BannerH + 5;
  const kpiW = (pageWidth - 28 - 9) / 4;
  const kpiCards = [
    {
      label: 'OMZET BERSIH',
      value: formatRupiah(pnl.grossSalesNetReturns),
      sub: `${formatNumber(pnl.txCount)} Transaksi POS`,
      bg: [240, 249, 255],
      txt: [3, 105, 161],
    },
    {
      label: 'LABA KOTOR (FIFO)',
      value: formatRupiah(pnl.grossProfit),
      sub: `Margin ${pnl.grossMarginPercent.toFixed(1)}%`,
      bg: [236, 253, 245],
      txt: [4, 120, 87],
    },
    {
      label: 'LABA BERSIH BULAN INI',
      value: formatRupiah(pnl.netProfit),
      sub: `Net Margin ${pnl.netMarginPercent.toFixed(1)}%`,
      bg: pnl.netProfit >= 0 ? [209, 250, 229] : [254, 226, 226],
      txt: pnl.netProfit >= 0 ? [6, 95, 70] : [185, 28, 28],
    },
    {
      label: 'VALUASI STOK (MODAL)',
      value: formatRupiah(totalStockValuation),
      sub: `${formatNumber(physicalProducts.length)} SKU · ${outOfStockCount + lowStockCount} Kritis`,
      bg: [248, 250, 252],
      txt: [15, 23, 42],
    },
  ];

  kpiCards.forEach((card, i) => {
    const x = 14 + i * (kpiW + 3);
    doc.setFillColor(card.bg[0], card.bg[1], card.bg[2]);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, kpiY, kpiW, 17, 1.8, 1.8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, x + 2.5, kpiY + 5);
    doc.setFontSize(8.8);
    doc.setTextColor(card.txt[0], card.txt[1], card.txt[2]);
    doc.text(card.value, x + 2.5, kpiY + 10.5, { maxWidth: kpiW - 5 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(71, 85, 105);
    doc.text(card.sub, x + 2.5, kpiY + 14.8, { maxWidth: kpiW - 5 });
  });

  const fmtSigned = (val: number) =>
    val < 0 ? `(${formatRupiah(Math.abs(val))})` : formatRupiah(val);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`1. Ringkasan Laba Rugi (${pnl.periodLabel})`, 14, kpiY + 23);

  const pnlRows: Array<[string, string, string]> = [
    ['Penjualan Usaha (Netto Retur & Bebas Pajak)', `${formatNumber(pnl.txCount)} Nota`, formatRupiah(pnl.grossSalesNetReturns)],
    ['Harga Pokok Penjualan (HPP Metode FIFO)', 'Beban Pokok', `(${formatRupiah(pnl.totalFifoCogs)})`],
    ['LABA KOTOR (GROSS PROFIT)', `Margin ${pnl.grossMarginPercent.toFixed(1)}%`, fmtSigned(pnl.grossProfit)],
    ['Pendapatan Kas Lain-Lain (Non-Modal)', 'Buku Kas', formatRupiah(pnl.otherIncome)],
    ...(pnl.expenseBreakdown.length > 0
      ? [
          ...pnl.expenseBreakdown.map((item) => [
            `  • Beban: ${item.category}`,
            `${item.count} Catatan`,
            `(${formatRupiah(item.amount)})`,
          ] as [string, string, string]),
          [
            'TOTAL BEBAN OPERASIONAL (OPEX)',
            `${pnl.expenseBreakdown.length} Pos Beban`,
            `(${formatRupiah(pnl.operatingExpenses)})`,
          ] as [string, string, string],
        ]
      : [['  • Tidak ada beban operasional tercatat', '-', 'Rp 0'] as [string, string, string]]),
    ['Beban Penyusutan Aset Tetap (Garis Lurus)', 'Aktiva Tetap', `(${formatRupiah(pnl.depreciationExpense)})`],
    ['LABA OPERASIONAL SEBELUM PAJAK (EBIT)', `Rasio Ops ${pnl.opexRatioPercent.toFixed(1)}%`, fmtSigned(pnl.operatingProfitBeforeTax)],
    ['Estimasi Pajak Bulanan (PPh / PPN / PB1)', 'Akrual Pajak', `(${formatRupiah(pnl.estimatedTaxExpense)})`],
    ['LABA / RUGI BERSIH PERIODE INI', `Net Margin ${pnl.netMarginPercent.toFixed(1)}%`, fmtSigned(pnl.netProfit)],
  ];

  autoTable(doc, {
    startY: kpiY + 26,
    margin: { left: 14, right: 14 },
    head: [['Komponen Laba Rugi', 'Keterangan / Rasio', 'Nominal (Rp)']],
    body: pnlRows,
    theme: 'grid',
    headStyles: { fillColor: [6, 95, 70], textColor: 255, fontSize: 8.2, fontStyle: 'bold' },
    styles: { fontSize: 7.9, cellPadding: 2.0 },
    columnStyles: {
      1: { cellWidth: 38, halign: 'center' },
      2: { cellWidth: 42, halign: 'right', font: 'courier' },
    },
    didParseCell: (data) => {
      const label = (data.row.raw as string[])?.[0] || '';
      if (
        label === 'LABA KOTOR (GROSS PROFIT)' ||
        label === 'TOTAL BEBAN OPERASIONAL (OPEX)' ||
        label === 'LABA OPERASIONAL SEBELUM PAJAK (EBIT)'
      ) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [248, 250, 252];
      } else if (label === 'LABA / RUGI BERSIH PERIODE INI') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = pnl.netProfit >= 0 ? [209, 250, 229] : [254, 226, 226];
        data.cell.styles.textColor = pnl.netProfit >= 0 ? [6, 95, 70] : [153, 27, 27];
      }
    },
  });

  // Category Stock Valuation Summary on Page 1 if room allows
  const afterPnlY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 140) + 7;
  const catStockStartY = afterPnlY > pageHeight - 62 ? (doc.addPage(), 18) : afterPnlY;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Rekapitulasi Valuasi Stok per Kategori', 14, catStockStartY);

  autoTable(doc, {
    startY: catStockStartY + 3,
    margin: { left: 14, right: 14 },
    head: [['Kategori Produk', 'SKU', 'Total Unit', 'SKU Kritis', 'Valuasi Modal (Rp)', 'Potensi Omzet Jual']],
    body: [
      ...categoryStockRows.map((c) => [
        c.category,
        `${formatNumber(c.skuCount)}`,
        formatNumber(c.totalUnits),
        c.criticalCount > 0 ? `${c.criticalCount} Kritis` : 'Aman',
        formatRupiah(c.modalValuation),
        formatRupiah(c.retailPotential),
      ]),
      [
        'TOTAL INVENTARIS GUDANG',
        `${formatNumber(physicalProducts.length)} SKU`,
        formatNumber(totalBaseUnits),
        `${outOfStockCount + lowStockCount} Perlu Restock`,
        formatRupiah(totalStockValuation),
        formatRupiah(totalRetailPotential),
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    styles: { fontSize: 7.7, cellPadding: 2 },
    columnStyles: {
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 38, font: 'courier' },
      5: { halign: 'right', cellWidth: 38, font: 'courier' },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === categoryStockRows.length) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [224, 242, 254];
      }
    },
  });

  // ===========================================================================
  // PAGE 2+: RINCIAN STOK PRODUK GUDANG
  // ===========================================================================
  doc.addPage();
  const { bannerHeight: p2BannerH } = await drawPdfStoreHeader({
    doc,
    title: 'RINCIAN INVENTARIS & VALUASI STOK PRODUK',
    subtitle: `${storeDisplayName.toUpperCase()} · Total Aset Modal: ${formatRupiah(totalStockValuation)}`,
    contactLine,
    rightTopText: `${formatNumber(physicalProducts.length)} SKU Fisik`,
    rightBottomText: `Habis: ${outOfStockCount} · Menipis: ${lowStockCount}`,
    storeSettings,
    preloadedLogo: logoAsset,
    bannerColor: [15, 23, 42],
    accentStripeColor: [2, 132, 199],
    bannerHeight: 28,
  });

  const safeStockCount = Math.max(0, physicalProducts.length - outOfStockCount - lowStockCount);
  const p2SummaryY = p2BannerH + 4;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, p2SummaryY, pageWidth - 28, 10, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Ringkasan Gudang: ${formatNumber(physicalProducts.length)} SKU (${formatNumber(totalBaseUnits)} Unit)  |  Aman: ${safeStockCount}  |  Menipis: ${lowStockCount}  |  Habis: ${outOfStockCount}  |  Potensi Jual: ${formatRupiah(totalRetailPotential)}`,
    17,
    p2SummaryY + 6.2,
    { maxWidth: pageWidth - 34 }
  );

  const sortedProductsForStock = [...physicalProducts].sort((a, b) => {
    const valB = (b.stockInBaseUnit || 0) * (b.costPrice || 0);
    const valA = (a.stockInBaseUnit || 0) * (a.costPrice || 0);
    return valB - valA;
  });

  autoTable(doc, {
    startY: p2SummaryY + 13,
    margin: { left: 14, right: 14 },
    showHead: 'everyPage',
    head: [['No', 'SKU / Barcode', 'Nama Produk', 'Kategori', 'Sisa Stok', 'Min', 'HPP / Unit', 'Valuasi Modal', 'Status']],
    body: sortedProductsForStock.map((prod, idx) => {
      const qty = prod.stockInBaseUnit || 0;
      const statusText = qty <= 0 ? 'HABIS' : qty <= (prod.minStockAlert || 0) ? 'MENIPIS' : 'AMAN';
      return [
        String(idx + 1),
        prod.sku || prod.barcode || '-',
        prod.name,
        prod.category || 'Umum',
        `${formatNumber(qty)} ${prod.baseUnit}`,
        formatNumber(prod.minStockAlert || 0),
        formatRupiah(prod.costPrice || 0),
        formatRupiah(Math.round(qty * (prod.costPrice || 0))),
        statusText,
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.4, fontStyle: 'bold' },
    styles: { fontSize: 7.0, cellPadding: 1.7, overflow: 'linebreak' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 23 },
      2: { cellWidth: 41 },
      3: { cellWidth: 22 },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'right', cellWidth: 11 },
      6: { halign: 'right', cellWidth: 20, font: 'courier' },
      7: { halign: 'right', cellWidth: 23, font: 'courier', fontStyle: 'bold' },
      8: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 8) {
        const val = String(data.cell.raw || '');
        if (val === 'HABIS') data.cell.styles.textColor = [190, 18, 60];
        else if (val === 'MENIPIS') data.cell.styles.textColor = [180, 83, 9];
        else data.cell.styles.textColor = [4, 120, 87];
      }
    },
  });

  // Signature block for printing / owner sign-off
  const finalStockY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 140) + 10;
  const sigY = finalStockY > pageHeight - 44 ? (doc.addPage(), 22) : finalStockY;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(51, 65, 85);
  doc.text('Disiapkan Oleh (Manajer / Admin),', 18, sigY);
  doc.text('Diterima & Diperiksa Oleh (Pemilik Bisnis),', pageWidth - 82, sigY);
  doc.setDrawColor(148, 163, 184);
  doc.line(18, sigY + 17, 74, sigY + 17);
  doc.line(pageWidth - 82, sigY + 17, pageWidth - 18, sigY + 17);
  doc.setFont('helvetica', 'bold');
  doc.text(`( ${preparedBy} )`, 18, sigY + 22);
  doc.text(`( Pemilik ${storeDisplayName} )`, pageWidth - 82, sigY + 22);

  addStandardPdfFooters(
    doc,
    `${storeDisplayName} — Laporan Stok & Ringkasan Laba Rugi (${pnl.periodLabel}) • Dicetak ${printedAt}`
  );

  const safeSlug = storeDisplayName
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const filename = `Laporan_Stok_dan_Laba_Rugi_${pnl.periodMonth}_${safeSlug || 'Toko'}.pdf`;
  if (autoSave) {
    doc.save(filename);
  }
  return {
    doc,
    filename,
    netProfit: pnl.netProfit,
    totalStockValuation,
  };
};
