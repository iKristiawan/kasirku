import * as XLSX from 'xlsx';
import {
  CashflowRecord,
  Product,
  RestockOrder,
  StoreSettings,
  TaxAdjustment,
  TaxAdjustmentReasonType,
  TaxAdjustmentTargetType,
  TaxAuditChangeItem,
  TaxAuditLog,
  TaxCalculationMode,
  TaxConfig,
  TaxRecord,
  TaxRecordType,
  TaxRegimeType,
  Transaction,
} from '../types/pos';
import { formatDateTime } from './formatters';
import { getItemFifoCogs } from './fifoUtils';

export const MONTH_NAMES_ID = [
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

export const SHORT_MONTH_NAMES_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agt',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export const TAX_TYPE_LABELS: Record<TaxRecordType, string> = {
  PPH_FINAL_UMKM: 'PPh Final UMKM (PP 55/2022)',
  PPH_BADAN: 'PPh Badan (Pasal 17 / Pasal 31E / PPh 25 & 29)',
  PPN: 'PPN (Pajak Pertambahan Nilai)',
  PB1: 'Pajak Daerah / PB1',
  PPH_21: 'PPh Pasal 21 Karyawan',
  LAINNYA: 'Pajak / Retribusi Lainnya',
};

export const PPH_BADAN_GENERAL_RATE = 22;
export const PPH_31E_FACILITY_TURNOVER = 4_800_000_000;
export const PPH_31E_REVENUE_CAP = 50_000_000_000;

export const TAX_ADJUSTMENT_REASON_LABELS: Record<TaxAdjustmentReasonType, string> = {
  PEMBATALAN_FAKTUR: 'Pembatalan Faktur Pajak / Nota',
  KESALAHAN_INPUT: 'Koreksi Kesalahan Input Nominal / Tarif',
  RETUR_NOTA_RETUR: 'Nota Retur Penjualan / Pembelian',
  KOREKSI_TARIF_DPP: 'Penyesuaian DPP / Klasifikasi Barang',
  LAINNYA: 'Adjustment Pajak Lainnya',
};

export const TAX_ADJUSTMENT_TARGET_LABELS: Record<TaxAdjustmentTargetType, string> = {
  DPP_OMZET: 'DPP / Peredaran Bruto (Omzet)',
  PPH_FINAL_UMKM: 'PPh Final UMKM (0,5%)',
  PPN_KELUARAN: 'PPN Keluaran',
  PPN_MASUKAN: 'PPN Masukan (Kredit Faktur)',
  PB1: 'Pajak Daerah / PB1',
};

export const REGIME_LABELS: Record<TaxRegimeType, string> = {
  UMKM_OP: 'WP Orang Pribadi Non-PKP (PPh Final · Bebas ≤ Rp 500 Jt/Thn)',
  UMKM_BADAN: 'WP Badan (PT/CV) Non-PKP — Kewajiban PPh Saja',
  PKP_UMUM: 'WP PKP (Omzet > Rp 4,8 M / Sukarela) — Wajib PPh & PPN',
  NON_PAJAK: 'Non-PKP / Mode Simulasi Internal',
};

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  taxpayerStatus: 'UMKM_OP',
  npwp: '',
  taxpayerName: '',
  enablePphFinalUmkm: true,
  pphFinalRatePercent: 0.5,
  applyUmkmOpThreshold500Jt: true,
  enablePphBadan31E: false,
  applyPasal31EFacility: true,
  pphBadanRatePercent: PPH_BADAN_GENERAL_RATE,
  pphBadanFiscalAdjustment: 0,
  pphBadanLossCompensation: 0,
  enablePpn: false,
  ppnRatePercent: 11,
  ppnMode: 'INCLUSIVE',
  deductInputVatFromPurchases: true,
  enablePb1: false,
  pb1RatePercent: 10,
  excludeCashWithdrawalPrincipal: true,
  monthlyDueDay: 15,
  dueReminderDaysBefore: 7,
};

export const getEffectiveTaxConfig = (
  settingsOrConfig?: StoreSettings | Partial<TaxConfig> | null,
  fallbackStoreName?: string
): TaxConfig => {
  if (settingsOrConfig && 'storeName' in settingsOrConfig) {
    return {
      ...DEFAULT_TAX_CONFIG,
      taxpayerName: settingsOrConfig.storeName || fallbackStoreName || '',
      ...(settingsOrConfig.taxConfig || {}),
    };
  }
  return {
    ...DEFAULT_TAX_CONFIG,
    taxpayerName: fallbackStoreName || '',
    ...((settingsOrConfig as Partial<TaxConfig>) || {}),
  };
};

export const getPurchaseLocalMs = (p: RestockOrder): number => {
  if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date.trim())) {
    const [y, m, d] = p.date.trim().split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }
  return p.createdAt || 0;
};

export const computeTxTaxableBreakdown = (tx: Transaction, excludeWithdrawalPrincipal: boolean) => {
  const rawGross = Math.max(0, tx.finalAmount || 0);
  const returned = Math.max(0, tx.returnedAmount || 0);
  let withdrawalPrincipal = 0;

  if (excludeWithdrawalPrincipal) {
    (tx.items || []).forEach((item) => {
      const isTarikTunai =
        Boolean(item.isCashWithdrawal) || /tarik\s*tunai/i.test(item.productName || '');
      if (!isTarikTunai) return;
      const principal =
        typeof item.principalAmount === 'number'
          ? item.principalAmount
          : Math.max(0, (item.totalAmount || 0) - (item.adminFee || 0));
      withdrawalPrincipal += Math.max(0, principal);
    });
  }

  const netTaxable = Math.max(0, rawGross - returned - withdrawalPrincipal);
  return {
    rawGross,
    returned,
    withdrawalPrincipal,
    netTaxable,
  };
};

export interface MonthlyTaxBucket {
  year: number;
  monthIndex: number;
  monthShort: string;
  monthName: string;
  periodKey: string;
  txCount: number;
  rawGrossSales: number;
  returnedSales: number;
  excludedWithdrawalPrincipal: number;
  taxableTurnover: number;
  purchaseTotalCompleted: number;
  cumulativeTurnoverBeforeMonth: number;
  cumulativeTurnoverAfterMonth: number;
  pphTaxableSlice: number;
  pphExemptSlice: number;
  pphFinalDue: number;
  ppnDpp: number;
  ppnOutput: number;
  ppnInputEstimate: number;
  ppnNetPayable: number;
  ppnOverpaymentAmount: number;
  pb1Due: number;
  adjustmentCount: number;
  dppAdjustmentNet: number;
  pphFinalAdjustmentNet: number;
  ppnOutputAdjustmentNet: number;
  ppnInputAdjustmentNet: number;
  pb1AdjustmentNet: number;
  totalTaxAdjustmentNet: number;
  totalEstimatedTax: number;
  recordedPaidTax: number;
  recordedDueTax: number;
  manualUnpaidRecordsAmount: number;
  taxPaidBurdenPercent: number;
  taxEstimatedBurdenPercent: number;
}

export interface AnnualTaxAnalysis {
  buckets: MonthlyTaxBucket[];
  totalAnnualGrossSales: number;
  totalAnnualTurnover: number;
  totalAnnualTaxDue: number;
  totalAnnualTaxPaid: number;
  paidBurdenRatioPercent: number;
  estimatedBurdenRatioPercent: number;
  umkmThreshold: number;
  pkpThreshold: number;
  umkmThresholdProgress: number;
  pkpThresholdProgress: number;
}

export const computeAnnualTaxBuckets = (params: {
  transactions: Transaction[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  taxConfig: TaxConfig;
  year: number;
  taxAdjustments?: TaxAdjustment[];
}): AnnualTaxAnalysis => {
  const { transactions, purchases, taxRecords, taxConfig, year, taxAdjustments = [] } = params;

  const excludeWithdrawal = taxConfig.excludeCashWithdrawalPrincipal !== false;
  const pphEnabled = Boolean(taxConfig.enablePphFinalUmkm);
  const pphRate = Math.max(0, Number(taxConfig.pphFinalRatePercent ?? 0.5));
  const apply500JtThreshold =
    taxConfig.taxpayerStatus === 'UMKM_OP' && taxConfig.applyUmkmOpThreshold500Jt !== false;

  const ppnEnabled = Boolean(taxConfig.enablePpn);
  const ppnRate = Math.max(0, Number(taxConfig.ppnRatePercent ?? 11));
  const ppnMode: TaxCalculationMode = taxConfig.ppnMode || 'INCLUSIVE';
  const deductInputVat = taxConfig.deductInputVatFromPurchases !== false;

  const pb1Enabled = Boolean(taxConfig.enablePb1);
  const pb1Rate = Math.max(0, Number(taxConfig.pb1RatePercent ?? 10));

  const buckets: MonthlyTaxBucket[] = Array.from({ length: 12 }, (_, mIdx) => ({
    year,
    monthIndex: mIdx,
    monthShort: SHORT_MONTH_NAMES_ID[mIdx],
    monthName: MONTH_NAMES_ID[mIdx],
    periodKey: `${year}-${String(mIdx + 1).padStart(2, '0')}`,
    txCount: 0,
    rawGrossSales: 0,
    returnedSales: 0,
    excludedWithdrawalPrincipal: 0,
    taxableTurnover: 0,
    purchaseTotalCompleted: 0,
    cumulativeTurnoverBeforeMonth: 0,
    cumulativeTurnoverAfterMonth: 0,
    pphTaxableSlice: 0,
    pphExemptSlice: 0,
    pphFinalDue: 0,
    ppnDpp: 0,
    ppnOutput: 0,
    ppnInputEstimate: 0,
    ppnNetPayable: 0,
    ppnOverpaymentAmount: 0,
    pb1Due: 0,
    adjustmentCount: 0,
    dppAdjustmentNet: 0,
    pphFinalAdjustmentNet: 0,
    ppnOutputAdjustmentNet: 0,
    ppnInputAdjustmentNet: 0,
    pb1AdjustmentNet: 0,
    totalTaxAdjustmentNet: 0,
    totalEstimatedTax: 0,
    recordedPaidTax: 0,
    recordedDueTax: 0,
    manualUnpaidRecordsAmount: 0,
    taxPaidBurdenPercent: 0,
    taxEstimatedBurdenPercent: 0,
  }));

  transactions.forEach((tx) => {
    const d = new Date(tx.timestamp);
    if (d.getFullYear() !== year) return;
    const b = buckets[d.getMonth()];
    if (!b) return;
    const bd = computeTxTaxableBreakdown(tx, excludeWithdrawal);
    b.txCount += 1;
    b.rawGrossSales += bd.rawGross;
    b.returnedSales += bd.returned;
    b.excludedWithdrawalPrincipal += bd.withdrawalPrincipal;
    b.taxableTurnover += bd.netTaxable;
  });

  purchases.forEach((po) => {
    if (po.status !== 'SELESAI') return;
    const ms = getPurchaseLocalMs(po);
    const d = new Date(ms);
    if (d.getFullYear() !== year) return;
    const b = buckets[d.getMonth()];
    if (!b) return;
    b.purchaseTotalCompleted += Math.max(0, po.totalAmount || 0);
  });

  taxRecords.forEach((rec) => {
    if (!rec.periodMonth.startsWith(`${year}-`)) return;
    const mNum = Number(rec.periodMonth.slice(5, 7));
    if (mNum >= 1 && mNum <= 12) {
      const b = buckets[mNum - 1];
      b.recordedDueTax += Math.max(0, rec.taxAmountDue || 0);
      if (rec.status === 'SUDAH_SETOR') {
        b.recordedPaidTax += Math.max(0, rec.paidAmount || rec.taxAmountDue || 0);
      } else {
        b.manualUnpaidRecordsAmount += Math.max(0, rec.taxAmountDue || 0);
      }
    }
  });

  // Aggregate active TaxAdjustments per period
  taxAdjustments.forEach((adj) => {
    if (adj.status !== 'ACTIVE' || !adj.periodMonth.startsWith(`${year}-`)) return;
    const mNum = Number(adj.periodMonth.slice(5, 7));
    if (mNum < 1 || mNum > 12) return;
    const b = buckets[mNum - 1];
    if (!b) return;
    b.adjustmentCount += 1;
    const dppDelta = Math.round(adj.dppDelta || 0);
    const taxDelta = Math.round(adj.taxDelta || 0);

    if (adj.affectedTaxType === 'DPP_OMZET') {
      b.dppAdjustmentNet += dppDelta !== 0 ? dppDelta : taxDelta;
    } else {
      if (dppDelta !== 0) {
        b.dppAdjustmentNet += dppDelta;
      }
      if (adj.affectedTaxType === 'PPH_FINAL_UMKM') {
        b.pphFinalAdjustmentNet += taxDelta;
      } else if (adj.affectedTaxType === 'PPN_KELUARAN') {
        b.ppnOutputAdjustmentNet += taxDelta;
      } else if (adj.affectedTaxType === 'PPN_MASUKAN') {
        b.ppnInputAdjustmentNet += taxDelta;
      } else if (adj.affectedTaxType === 'PB1') {
        b.pb1AdjustmentNet += taxDelta;
      }
    }
  });

  const UMKM_THRESHOLD = 500_000_000;
  const PKP_THRESHOLD = 4_800_000_000;
  let runningYtdTurnover = 0;

  buckets.forEach((b) => {
    b.taxableTurnover = Math.max(0, b.taxableTurnover + b.dppAdjustmentNet);
    b.cumulativeTurnoverBeforeMonth = runningYtdTurnover;
    runningYtdTurnover += b.taxableTurnover;
    b.cumulativeTurnoverAfterMonth = runningYtdTurnover;

    if (pphEnabled && taxConfig.taxpayerStatus !== 'NON_PAJAK') {
      if (b.taxableTurnover > 0) {
        if (apply500JtThreshold) {
          const prevOver = Math.max(0, b.cumulativeTurnoverBeforeMonth - UMKM_THRESHOLD);
          const curOver = Math.max(0, b.cumulativeTurnoverAfterMonth - UMKM_THRESHOLD);
          const taxableSlice = Math.max(0, curOver - prevOver);
          b.pphTaxableSlice = taxableSlice;
          b.pphExemptSlice = Math.max(0, b.taxableTurnover - taxableSlice);
          b.pphFinalDue = Math.round(taxableSlice * (pphRate / 100));
        } else {
          b.pphTaxableSlice = b.taxableTurnover;
          b.pphExemptSlice = 0;
          b.pphFinalDue = Math.round(b.taxableTurnover * (pphRate / 100));
        }
      }
      b.pphFinalDue = Math.max(0, b.pphFinalDue + b.pphFinalAdjustmentNet);
    } else if (b.pphFinalAdjustmentNet !== 0 && taxConfig.taxpayerStatus !== 'NON_PAJAK') {
      b.pphFinalDue = Math.max(0, b.pphFinalAdjustmentNet);
    }

    if (
      (ppnEnabled || b.ppnOutputAdjustmentNet !== 0 || b.ppnInputAdjustmentNet !== 0) &&
      taxConfig.taxpayerStatus !== 'NON_PAJAK'
    ) {
      if (ppnEnabled && b.taxableTurnover > 0) {
        if (ppnMode === 'INCLUSIVE') {
          b.ppnDpp = Math.round(b.taxableTurnover / (1 + ppnRate / 100));
          b.ppnOutput = Math.max(0, b.taxableTurnover - b.ppnDpp);
        } else {
          b.ppnDpp = b.taxableTurnover;
          b.ppnOutput = Math.round(b.taxableTurnover * (ppnRate / 100));
        }
      }
      if (ppnEnabled && deductInputVat && b.purchaseTotalCompleted > 0) {
        b.ppnInputEstimate =
          ppnMode === 'INCLUSIVE'
            ? Math.round(
                b.purchaseTotalCompleted - b.purchaseTotalCompleted / (1 + ppnRate / 100)
              )
            : Math.round(b.purchaseTotalCompleted * (ppnRate / 100));
      }
      b.ppnOutput = Math.max(0, b.ppnOutput + b.ppnOutputAdjustmentNet);
      b.ppnInputEstimate = Math.max(0, b.ppnInputEstimate + b.ppnInputAdjustmentNet);
      b.ppnNetPayable = Math.max(0, b.ppnOutput - b.ppnInputEstimate);
      b.ppnOverpaymentAmount = Math.max(0, b.ppnInputEstimate - b.ppnOutput);
    }

    if ((pb1Enabled || b.pb1AdjustmentNet !== 0) && taxConfig.taxpayerStatus !== 'NON_PAJAK') {
      const basePb1 = pb1Enabled && b.taxableTurnover > 0 ? Math.round(b.taxableTurnover * (pb1Rate / 100)) : 0;
      b.pb1Due = Math.max(0, basePb1 + b.pb1AdjustmentNet);
    }

    b.totalTaxAdjustmentNet =
      b.pphFinalAdjustmentNet + b.ppnOutputAdjustmentNet - b.ppnInputAdjustmentNet + b.pb1AdjustmentNet;
    b.totalEstimatedTax = b.pphFinalDue + b.ppnNetPayable + b.pb1Due;
    b.taxPaidBurdenPercent =
      b.rawGrossSales > 0 ? Number(((b.recordedPaidTax / b.rawGrossSales) * 100).toFixed(2)) : 0;
    b.taxEstimatedBurdenPercent =
      b.rawGrossSales > 0
        ? Number(((b.totalEstimatedTax / b.rawGrossSales) * 100).toFixed(2))
        : 0;
  });

  const totalAnnualGrossSales = buckets.reduce((s, b) => s + b.rawGrossSales, 0);
  const totalAnnualTurnover = buckets.reduce((s, b) => s + b.taxableTurnover, 0);
  const totalAnnualTaxDue = buckets.reduce((s, b) => s + b.totalEstimatedTax, 0);
  const totalAnnualTaxPaid = buckets.reduce((s, b) => s + b.recordedPaidTax, 0);
  const paidBurdenRatioPercent =
    totalAnnualGrossSales > 0
      ? Number(((totalAnnualTaxPaid / totalAnnualGrossSales) * 100).toFixed(2))
      : 0;
  const estimatedBurdenRatioPercent =
    totalAnnualGrossSales > 0
      ? Number(((totalAnnualTaxDue / totalAnnualGrossSales) * 100).toFixed(2))
      : 0;

  return {
    buckets,
    totalAnnualGrossSales,
    totalAnnualTurnover,
    totalAnnualTaxDue,
    totalAnnualTaxPaid,
    paidBurdenRatioPercent,
    estimatedBurdenRatioPercent,
    umkmThreshold: UMKM_THRESHOLD,
    pkpThreshold: PKP_THRESHOLD,
    umkmThresholdProgress: Math.min(100, (totalAnnualTurnover / UMKM_THRESHOLD) * 100),
    pkpThresholdProgress: Math.min(100, (totalAnnualTurnover / PKP_THRESHOLD) * 100),
  };
};

export interface TaxDueAlertItem {
  year: number;
  monthIndex: number;
  periodKey: string;
  periodLabel: string;
  dueDateDisplay: string;
  dueDay: number;
  daysUntilDue: number; // < 0 = overdue, 0 = due today, 1..N = upcoming
  urgencyStatus: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';
  urgencyLabel: string;
  txCount: number;
  taxableTurnover: number;
  pphFinalDue: number;
  ppnNetPayable: number;
  pb1Due: number;
  totalEstimatedTax: number;
  recordedPaidTax: number;
  manualUnpaidRecordsAmount: number;
  remainingDue: number;
  primaryTaxType: TaxRecordType;
}

export interface TaxDueAlertSummary {
  urgentAlerts: TaxDueAlertItem[];
  overdueCount: number;
  upcomingCount: number;
  totalRemainingDue: number;
  dueDay: number;
  reminderWindowDays: number;
  nextScheduledDue: {
    periodKey: string;
    periodLabel: string;
    dueDateDisplay: string;
    daysUntilDue: number;
    remainingDue: number;
    totalEstimatedTax: number;
    recordedPaidTax: number;
  };
}

export const getTaxDueAlertSummary = (params: {
  transactions: Transaction[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  taxConfig: TaxConfig;
  now?: Date;
  taxAdjustments?: TaxAdjustment[];
}): TaxDueAlertSummary => {
  const {
    transactions,
    purchases,
    taxRecords,
    taxConfig,
    now = new Date(),
    taxAdjustments = [],
  } = params;

  const dueDay = Math.max(1, Math.min(28, Number(taxConfig.monthlyDueDay ?? 15)));
  const reminderWindowDays = Math.max(
    1,
    Math.min(20, Number(taxConfig.dueReminderDaysBefore ?? 7))
  );
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayMs = todayMidnight.getTime();

  // Collect candidate (year, monthIndex) periods: last 3 months + current month + any period with BELUM_SETOR records
  const candidateMap = new Map<string, { year: number; monthIndex: number }>();
  for (let offset = -3; offset <= 0; offset += 1) {
    const dt = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    candidateMap.set(key, { year: dt.getFullYear(), monthIndex: dt.getMonth() });
  }
  taxRecords.forEach((rec) => {
    if (rec.status === 'BELUM_SETOR' && /^\d{4}-\d{2}$/.test(rec.periodMonth)) {
      const [y, m] = rec.periodMonth.split('-').map(Number);
      if (y > 2000 && m >= 1 && m <= 12) {
        candidateMap.set(rec.periodMonth, { year: y, monthIndex: m - 1 });
      }
    }
  });

  // Compute annual buckets per unique year involved
  const yearAnalysisCache = new Map<number, AnnualTaxAnalysis>();
  const getYearAnalysis = (yr: number) => {
    let cached = yearAnalysisCache.get(yr);
    if (!cached) {
      cached = computeAnnualTaxBuckets({
        transactions,
        purchases,
        taxRecords,
        taxConfig,
        year: yr,
        taxAdjustments,
      });
      yearAnalysisCache.set(yr, cached);
    }
    return cached;
  };

  const urgentAlerts: TaxDueAlertItem[] = [];

  candidateMap.forEach(({ year, monthIndex }) => {
    const analysis = getYearAnalysis(year);
    const bucket = analysis.buckets[monthIndex];
    if (!bucket) return;

    const dueMonthIndex = (monthIndex + 1) % 12;
    const dueYear = monthIndex === 11 ? year + 1 : year;
    const dueDate = new Date(dueYear, dueMonthIndex, dueDay, 0, 0, 0, 0);
    const daysUntilDue = Math.round((dueDate.getTime() - todayMs) / 86400000);

    const estimatedRemaining = Math.max(0, bucket.totalEstimatedTax - bucket.recordedPaidTax);
    const remainingDue = Math.max(estimatedRemaining, bucket.manualUnpaidRecordsAmount);

    if (remainingDue <= 0) return;
    if (daysUntilDue > reminderWindowDays) return;

    const urgencyStatus: TaxDueAlertItem['urgencyStatus'] =
      daysUntilDue < 0 ? 'OVERDUE' : daysUntilDue === 0 ? 'DUE_TODAY' : 'UPCOMING';

    const urgencyLabel =
      daysUntilDue < 0
        ? `Lewat ${Math.abs(daysUntilDue)} hari (H+${Math.abs(daysUntilDue)})`
        : daysUntilDue === 0
        ? 'Jatuh Tempo Hari Ini'
        : `${daysUntilDue} hari lagi (H-${daysUntilDue})`;

    let primaryTaxType: TaxRecordType = 'PPH_FINAL_UMKM';
    if (bucket.ppnNetPayable >= bucket.pphFinalDue && bucket.ppnNetPayable > 0) {
      primaryTaxType = 'PPN';
    } else if (bucket.pb1Due > bucket.pphFinalDue && bucket.pb1Due > 0) {
      primaryTaxType = 'PB1';
    }

    urgentAlerts.push({
      year,
      monthIndex,
      periodKey: bucket.periodKey,
      periodLabel: `${bucket.monthName} ${year}`,
      dueDateDisplay: `${String(dueDay).padStart(2, '0')} ${MONTH_NAMES_ID[dueMonthIndex]} ${dueYear}`,
      dueDay,
      daysUntilDue,
      urgencyStatus,
      urgencyLabel,
      txCount: bucket.txCount,
      taxableTurnover: bucket.taxableTurnover,
      pphFinalDue: bucket.pphFinalDue,
      ppnNetPayable: bucket.ppnNetPayable,
      pb1Due: bucket.pb1Due,
      totalEstimatedTax: bucket.totalEstimatedTax,
      recordedPaidTax: bucket.recordedPaidTax,
      manualUnpaidRecordsAmount: bucket.manualUnpaidRecordsAmount,
      remainingDue,
      primaryTaxType,
    });
  });

  urgentAlerts.sort((a, b) => a.daysUntilDue - b.daysUntilDue || b.remainingDue - a.remainingDue);

  // Next scheduled monthly due date (either dueDay of current month if >= today, or dueDay of next month)
  const isBeforeOrOnDueDayThisMonth = now.getDate() <= dueDay;
  const nextDueCalDate = isBeforeOrOnDueDayThisMonth
    ? new Date(now.getFullYear(), now.getMonth(), dueDay, 0, 0, 0, 0)
    : new Date(now.getFullYear(), now.getMonth() + 1, dueDay, 0, 0, 0, 0);
  const nextTargetPeriodDate = new Date(
    nextDueCalDate.getFullYear(),
    nextDueCalDate.getMonth() - 1,
    1
  );
  const targetYear = nextTargetPeriodDate.getFullYear();
  const targetMonthIndex = nextTargetPeriodDate.getMonth();
  const targetBucket = getYearAnalysis(targetYear).buckets[targetMonthIndex];
  const nextEstRemaining = targetBucket
    ? Math.max(0, targetBucket.totalEstimatedTax - targetBucket.recordedPaidTax)
    : 0;
  const nextRemainingDue = targetBucket
    ? Math.max(nextEstRemaining, targetBucket.manualUnpaidRecordsAmount)
    : 0;

  return {
    urgentAlerts,
    overdueCount: urgentAlerts.filter((a) => a.urgencyStatus === 'OVERDUE').length,
    upcomingCount: urgentAlerts.filter((a) => a.urgencyStatus !== 'OVERDUE').length,
    totalRemainingDue: urgentAlerts.reduce((s, a) => s + a.remainingDue, 0),
    dueDay,
    reminderWindowDays,
    nextScheduledDue: {
      periodKey: `${targetYear}-${String(targetMonthIndex + 1).padStart(2, '0')}`,
      periodLabel: `${MONTH_NAMES_ID[targetMonthIndex]} ${targetYear}`,
      dueDateDisplay: `${String(dueDay).padStart(2, '0')} ${MONTH_NAMES_ID[nextDueCalDate.getMonth()]} ${nextDueCalDate.getFullYear()}`,
      daysUntilDue: Math.max(0, Math.round((nextDueCalDate.getTime() - todayMs) / 86400000)),
      remainingDue: nextRemainingDue,
      totalEstimatedTax: targetBucket?.totalEstimatedTax || 0,
      recordedPaidTax: targetBucket?.recordedPaidTax || 0,
    },
  };
};

export interface ExcelExportResult {
  periodKey: string;
  periodLabel: string;
  txCount: number;
  totalTaxableTurnover: number;
  totalPpn: number;
  totalPphFinal: number;
  filename: string;
}

export const exportMonthlyTaxSummaryExcel = (params: {
  transactions: Transaction[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  storeSettings: StoreSettings;
  taxConfig: TaxConfig;
  year: number;
  monthIndex: number;
  taxAdjustments?: TaxAdjustment[];
}): ExcelExportResult => {
  const {
    transactions,
    purchases,
    taxRecords,
    storeSettings,
    taxConfig,
    year,
    monthIndex,
    taxAdjustments = [],
  } = params;

  const periodKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const periodLabel = `${MONTH_NAMES_ID[monthIndex]} ${year}`;
  const excludeWithdrawal = taxConfig.excludeCashWithdrawalPrincipal !== false;

  const pphEnabled = Boolean(taxConfig.enablePphFinalUmkm) && taxConfig.taxpayerStatus !== 'NON_PAJAK';
  const pphRate = Math.max(0, Number(taxConfig.pphFinalRatePercent ?? 0.5));
  const ppnEnabled = Boolean(taxConfig.enablePpn) && taxConfig.taxpayerStatus !== 'NON_PAJAK';
  const ppnRate = Math.max(0, Number(taxConfig.ppnRatePercent ?? 11));
  const ppnMode: TaxCalculationMode = taxConfig.ppnMode || 'INCLUSIVE';
  const pb1Enabled = Boolean(taxConfig.enablePb1) && taxConfig.taxpayerStatus !== 'NON_PAJAK';
  const pb1Rate = Math.max(0, Number(taxConfig.pb1RatePercent ?? 10));

  const annual = computeAnnualTaxBuckets({
    transactions,
    purchases,
    taxRecords,
    taxConfig,
    year,
    taxAdjustments,
  });
  const monthStats = annual.buckets[monthIndex];
  const monthActiveAdjustments = taxAdjustments.filter(
    (adj) => adj.periodMonth === periodKey && adj.status === 'ACTIVE'
  );

  // Ratio for UMKM OP threshold crossing within this month
  const pphTaxableRatio =
    monthStats.taxableTurnover > 0
      ? Math.min(1, Math.max(0, monthStats.pphTaxableSlice / monthStats.taxableTurnover))
      : 0;

  const periodTransactions = transactions
    .filter((tx) => {
      const d = new Date(tx.timestamp);
      return d.getFullYear() === year && d.getMonth() === monthIndex;
    })
    .sort((a, b) => a.timestamp - b.timestamp);

  let sumRawGross = 0;
  let sumReturned = 0;
  let sumWithdrawal = 0;
  let sumNetTaxable = 0;
  let sumPpnDpp = 0;
  let sumPpn = 0;
  let sumPphFinal = 0;
  let sumPb1 = 0;
  let sumTotalTax = 0;

  const txRows = periodTransactions.map((tx, idx) => {
    const bd = computeTxTaxableBreakdown(tx, excludeWithdrawal);

    let txPpnDpp = bd.netTaxable;
    let txPpn = 0;
    if (ppnEnabled && bd.netTaxable > 0) {
      if (ppnMode === 'INCLUSIVE') {
        txPpnDpp = Math.round(bd.netTaxable / (1 + ppnRate / 100));
        txPpn = Math.max(0, bd.netTaxable - txPpnDpp);
      } else {
        txPpnDpp = bd.netTaxable;
        txPpn = Math.round(bd.netTaxable * (ppnRate / 100));
      }
    }

    let txPphFinal = 0;
    if (pphEnabled && bd.netTaxable > 0) {
      txPphFinal = Math.round(bd.netTaxable * pphTaxableRatio * (pphRate / 100));
    }

    let txPb1 = 0;
    if (pb1Enabled && bd.netTaxable > 0) {
      txPb1 = Math.round(bd.netTaxable * (pb1Rate / 100));
    }

    const totalTxTax = txPpn + txPphFinal + txPb1;

    sumRawGross += bd.rawGross;
    sumReturned += bd.returned;
    sumWithdrawal += bd.withdrawalPrincipal;
    sumNetTaxable += bd.netTaxable;
    sumPpnDpp += txPpnDpp;
    sumPpn += txPpn;
    sumPphFinal += txPphFinal;
    sumPb1 += txPb1;
    sumTotalTax += totalTxTax;

    const statusNotes: string[] = [];
    if (tx.paymentStatus === 'BELUM_LUNAS') statusNotes.push('Piutang Belum Lunas');
    if (bd.returned > 0) statusNotes.push('Ada Retur');
    if (pphEnabled && monthStats.pphTaxableSlice === 0) statusNotes.push('Bebas PPh OP <= 500Jt');
    if (taxConfig.taxpayerStatus === 'NON_PAJAK') statusNotes.push('Mode Non-PKP');

    return {
      No: idx + 1,
      'Masa Pajak': periodKey,
      'Tanggal & Waktu': formatDateTime(tx.timestamp),
      'No. Invoice / Nota': tx.invoiceNumber || tx.id,
      Pelanggan: tx.customerName || 'Pelanggan Umum',
      Kasir: tx.cashierName || '-',
      'Metode Bayar': tx.paymentMethod || '-',
      'Penjualan Bruto (Rp)': bd.rawGross,
      'Retur (Rp)': bd.returned,
      'Pokok Tarik Tunai (Rp)': bd.withdrawalPrincipal,
      'Harga Jual (Rp)': bd.netTaxable,
      'DPP PPN (Rp)': txPpnDpp,
      'Tarif PPN (%)': ppnEnabled ? ppnRate : 0,
      'PPN (Rp)': txPpn,
      'Tarif PPh Final (%)': pphEnabled ? pphRate : 0,
      'PPh Final (Rp)': txPphFinal,
      'PB1 (Rp)': txPb1,
      'Total Pajak (Rp)': totalTxTax,
      Keterangan: statusNotes.length > 0 ? statusNotes.join('; ') : 'Normal',
    };
  });

  if (txRows.length > 0) {
    txRows.push({
      No: '' as unknown as number,
      'Masa Pajak': periodKey,
      'Tanggal & Waktu': 'TOTAL PERIODE',
      'No. Invoice / Nota': `${periodTransactions.length} Transaksi`,
      Pelanggan: '',
      Kasir: '',
      'Metode Bayar': '',
      'Penjualan Bruto (Rp)': sumRawGross,
      'Retur (Rp)': sumReturned,
      'Pokok Tarik Tunai (Rp)': sumWithdrawal,
      'Harga Jual (Rp)': sumNetTaxable,
      'DPP PPN (Rp)': sumPpnDpp,
      'Tarif PPN (%)': ppnEnabled ? ppnRate : 0,
      'PPN (Rp)': sumPpn,
      'Tarif PPh Final (%)': pphEnabled ? pphRate : 0,
      'PPh Final (Rp)': sumPphFinal,
      'PB1 (Rp)': sumPb1,
      'Total Pajak (Rp)': sumTotalTax,
      Keterangan: 'Rekap Total Transaksi Masa Pajak',
    });
  } else {
    txRows.push({
      No: 0,
      'Masa Pajak': periodKey,
      'Tanggal & Waktu': '-',
      'No. Invoice / Nota': 'Belum ada transaksi tercatat',
      Pelanggan: '-',
      Kasir: '-',
      'Metode Bayar': '-',
      'Penjualan Bruto (Rp)': 0,
      'Retur (Rp)': 0,
      'Pokok Tarik Tunai (Rp)': 0,
      'Harga Jual (Rp)': 0,
      'DPP PPN (Rp)': 0,
      'Tarif PPN (%)': ppnEnabled ? ppnRate : 0,
      'PPN (Rp)': 0,
      'Tarif PPh Final (%)': pphEnabled ? pphRate : 0,
      'PPh Final (Rp)': 0,
      'PB1 (Rp)': 0,
      'Total Pajak (Rp)': 0,
      Keterangan: `Periode ${periodLabel} nihil`,
    });
  }

  const dueMonthIdx = (monthIndex + 1) % 12;
  const dueYear = monthIndex === 11 ? year + 1 : year;
  const dueDayStr = String(taxConfig.monthlyDueDay ?? 15).padStart(2, '0');
  const dueDateDisplay = `${dueDayStr} ${MONTH_NAMES_ID[dueMonthIdx]} ${dueYear}`;

  const monthTaxRecords = taxRecords.filter((r) => r.periodMonth === periodKey);

  const summarySheetRows: Array<Array<string | number>> = [
    ['RINGKASAN PAJAK BULANAN (UNTUK INPUT MANUAL e-BUPOT / DJP ONLINE)'],
    ['Nama Usaha', storeSettings.storeName],
    ['Nama Wajib Pajak', taxConfig.taxpayerName || storeSettings.storeName],
    ['NPWP', taxConfig.npwp || '-'],
    ['Status Wajib Pajak', REGIME_LABELS[taxConfig.taxpayerStatus]],
    ['Masa Pajak', `${periodKey} (${periodLabel})`],
    ['Jatuh Tempo Setor / Lapor', dueDateDisplay],
    ['Tanggal Unduh File', new Date().toLocaleString('id-ID')],
    [],
    ['Komponen Ringkasan Periode', 'Kode KAP / KJS', 'Status', 'DPP / Dasar (Rp)', 'Tarif (%)', 'Nominal Pajak (Rp)', 'Catatan'],
    [
      'Total Nilai Transaksi Kena Pajak',
      '-',
      'Dasar Pajak',
      monthStats.taxableTurnover,
      '-',
      0,
      `${monthStats.txCount} transaksi POS | Bruto: ${monthStats.rawGrossSales} | Retur: ${monthStats.returnedSales}`,
    ],
    [
      'PPh Final UMKM (PP 55/2022)',
      '411128 / 420',
      pphEnabled ? 'AKTIF' : 'NON-AKTIF',
      monthStats.pphTaxableSlice,
      pphRate,
      monthStats.pphFinalDue,
      `Omzet Kumulatif YTD: ${monthStats.cumulativeTurnoverAfterMonth}`,
    ],
    [
      `PPN Keluaran (${ppnMode === 'INCLUSIVE' ? 'Inklusif' : 'Eksklusif'})`,
      '411211 / 100',
      ppnEnabled ? 'AKTIF' : 'NON-AKTIF',
      monthStats.ppnDpp,
      ppnRate,
      monthStats.ppnOutput,
      `Estimasi PPN Masukan PO: ${monthStats.ppnInputEstimate} | Kurang Bayar: ${monthStats.ppnNetPayable}`,
    ],
    [
      'Pajak Daerah / PB1',
      'Daerah',
      pb1Enabled ? 'AKTIF' : 'NON-AKTIF',
      pb1Enabled ? monthStats.taxableTurnover : 0,
      pb1Rate,
      monthStats.pb1Due,
      'Pajak Daerah / Restoran',
    ],
    [
      'TOTAL ESTIMASI PAJAK PERIODE',
      '-',
      '-',
      monthStats.taxableTurnover,
      '-',
      monthStats.totalEstimatedTax,
      `Sudah Disetor: ${monthStats.recordedPaidTax} | Sisa Kewajiban: ${Math.max(0, monthStats.totalEstimatedTax - monthStats.recordedPaidTax)}`,
    ],
    [],
    ['ADJUSTMENT PAJAK / KOREKSI FAKTUR AKTIF PERIODE INI', 'Alasan', 'Objek Pajak', 'Delta DPP (Rp)', 'Delta Pajak (Rp)', 'Status', 'No. Referensi & Catatan'],
    ...(monthActiveAdjustments.length > 0
      ? monthActiveAdjustments.map((adj) => [
          adj.adjustmentNumber,
          TAX_ADJUSTMENT_REASON_LABELS[adj.reasonType],
          TAX_ADJUSTMENT_TARGET_LABELS[adj.affectedTaxType],
          adj.dppDelta,
          adj.taxDelta,
          adj.status,
          `Ref: ${adj.referenceInvoiceNumber || '-'} | ${adj.notes}`,
        ])
      : [['Tidak ada adjustment / pembatalan faktur pada masa pajak ini', '-', '-', 0, 0, '-', '-']]),
    [],
    ['ARSIP KODE BILLING & NTPN MASA INI', 'Jenis Pajak', 'Status', 'DPP (Rp)', 'Terutang (Rp)', 'Disetor (Rp)', 'Kode Billing / NTPN'],
    ...(monthTaxRecords.length > 0
      ? monthTaxRecords.map((rec) => [
          rec.periodMonth,
          rec.taxTypeLabel,
          rec.status,
          rec.taxBaseAmount,
          rec.taxAmountDue,
          rec.paidAmount,
          `Billing: ${rec.billingCode || '-'} | NTPN: ${rec.ntpnCode || '-'}`,
        ])
      : [['Belum ada catatan billing/NTPN untuk periode ini', '-', '-', 0, 0, 0, '-']]),
  ];

  const wb = XLSX.utils.book_new();
  const wsTransactions = XLSX.utils.json_to_sheet(txRows);
  wsTransactions['!cols'] = [
    { wch: 5 },
    { wch: 11 },
    { wch: 20 },
    { wch: 22 },
    { wch: 22 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 20 },
    { wch: 22 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 18 },
    { wch: 28 },
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summarySheetRows);
  wsSummary['!cols'] = [
    { wch: 34 },
    { wch: 16 },
    { wch: 18 },
    { wch: 20 },
    { wch: 14 },
    { wch: 20 },
    { wch: 46 },
  ];

  XLSX.utils.book_append_sheet(wb, wsTransactions, 'Daftar Transaksi Pajak');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan e-Bupot & DJP');

  if (monthActiveAdjustments.length > 0) {
    const adjRows = monthActiveAdjustments.map((adj, idx) => ({
      No: idx + 1,
      'No. Adjustment': adj.adjustmentNumber,
      'Masa Pajak': adj.periodMonth,
      Tanggal: adj.adjustmentDate,
      Alasan: TAX_ADJUSTMENT_REASON_LABELS[adj.reasonType],
      'Komponen Pajak': TAX_ADJUSTMENT_TARGET_LABELS[adj.affectedTaxType],
      Arah: adj.direction === 'DECREASE' ? 'Pengurangan (-)' : 'Penambahan (+)',
      'Ref. Invoice/Faktur': adj.referenceInvoiceNumber || '-',
      'Delta DPP (Rp)': adj.dppDelta,
      'Delta Pajak (Rp)': adj.taxDelta,
      Catatan: adj.notes,
      'Dibuat Oleh': adj.createdBy,
    }));
    const wsAdj = XLSX.utils.json_to_sheet(adjRows);
    wsAdj['!cols'] = [
      { wch: 5 },
      { wch: 18 },
      { wch: 11 },
      { wch: 12 },
      { wch: 28 },
      { wch: 26 },
      { wch: 16 },
      { wch: 22 },
      { wch: 16 },
      { wch: 16 },
      { wch: 34 },
      { wch: 18 },
    ];
    XLSX.utils.book_append_sheet(wb, wsAdj, 'Adjustment Pajak');
  }

  const safeStoreSlug = (storeSettings.storeName || 'KasirKu')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const filename = `Ringkasan_Pajak_${periodKey}${safeStoreSlug ? `_${safeStoreSlug}` : ''}.xlsx`;

  XLSX.writeFile(wb, filename);

  return {
    periodKey,
    periodLabel,
    txCount: periodTransactions.length,
    totalTaxableTurnover: sumNetTaxable,
    totalPpn: sumPpn,
    totalPphFinal: sumPphFinal,
    filename,
  };
};

// =============================================================================
// PPH BADAN (PASAL 17 UU HPP 22%) & FASILITAS PASAL 31E UU PPH
// =============================================================================

export interface AnnualBookkeepingSummary {
  year: number;
  txCount: number;
  activeMonthsCount: number;
  annualTurnover: number;
  annualCogsFifo: number;
  grossProfit: number;
  operatingExpensesDeductible: number;
  otherBusinessIncome: number;
  recordedTaxOutflowNonDeductible: number;
  recordedPphBadanCredits: number;
}

export const computeAnnualStoreBookkeepingMetrics = (params: {
  transactions: Transaction[];
  products: Product[];
  cashflows: CashflowRecord[];
  taxRecords: TaxRecord[];
  year: number;
  excludeWithdrawalPrincipal?: boolean;
}): AnnualBookkeepingSummary => {
  const {
    transactions,
    products,
    cashflows,
    taxRecords,
    year,
    excludeWithdrawalPrincipal = true,
  } = params;

  const productMap = new Map<string, Product>();
  products.forEach((p) => productMap.set(p.id, p));

  let txCount = 0;
  let annualTurnover = 0;
  let annualCogsFifo = 0;
  const activeMonthsSet = new Set<number>();

  transactions.forEach((tx) => {
    const d = new Date(tx.timestamp);
    if (d.getFullYear() !== year) return;
    txCount += 1;
    activeMonthsSet.add(d.getMonth());

    const bd = computeTxTaxableBreakdown(tx, excludeWithdrawalPrincipal);
    annualTurnover += bd.netTaxable;

    if (bd.rawGross > 0 && bd.netTaxable > 0) {
      const returnRetentionRatio = Math.max(0, Math.min(1, 1 - bd.returned / bd.rawGross));
      let txCogs = 0;
      (tx.items || []).forEach((item) => {
        if (item.isCashWithdrawal || /tarik\s*tunai/i.test(item.productName || '')) return;
        const prod = productMap.get(item.productId);
        txCogs += Math.max(0, getItemFifoCogs(item, prod));
      });
      annualCogsFifo += Math.round(txCogs * returnRetentionRatio);
    }
  });

  let operatingExpensesDeductible = 0;
  let otherBusinessIncome = 0;
  let recordedTaxOutflowNonDeductible = 0;

  cashflows.forEach((cf) => {
    const cfYear =
      cf.date && /^\d{4}-\d{2}-\d{2}$/.test(cf.date)
        ? Number(cf.date.slice(0, 4))
        : new Date(cf.timestamp).getFullYear();
    if (cfYear !== year) return;

    const amt = Math.max(0, Number(cf.amount) || 0);
    if (amt <= 0) return;

    if (cf.type === 'PENGELUARAN') {
      if (
        cf.isCashWithdrawalOutflow ||
        /tarik\s*tunai/i.test(`${cf.category} ${cf.description}`)
      ) {
        return;
      }
      if (/pajak|pph|ppn/i.test(`${cf.category} ${cf.description}`)) {
        recordedTaxOutflowNonDeductible += amt;
        return;
      }
      operatingExpensesDeductible += amt;
    } else if (cf.type === 'PEMASUKAN') {
      if (
        cf.isCashWithdrawalAdminProfit ||
        /modal|suntikan\s*dana/i.test(`${cf.category} ${cf.description}`)
      ) {
        return;
      }
      otherBusinessIncome += amt;
    }
  });

  const recordedPphBadanCredits = taxRecords
    .filter(
      (r) =>
        r.periodMonth.startsWith(`${year}-`) &&
        r.taxType === 'PPH_BADAN' &&
        r.status === 'SUDAH_SETOR'
    )
    .reduce((s, r) => s + Math.max(0, r.paidAmount || r.taxAmountDue || 0), 0);

  return {
    year,
    txCount,
    activeMonthsCount: Math.max(1, activeMonthsSet.size),
    annualTurnover: Math.round(annualTurnover),
    annualCogsFifo: Math.round(annualCogsFifo),
    grossProfit: Math.round(annualTurnover - annualCogsFifo),
    operatingExpensesDeductible: Math.round(operatingExpensesDeductible),
    otherBusinessIncome: Math.round(otherBusinessIncome),
    recordedTaxOutflowNonDeductible: Math.round(recordedTaxOutflowNonDeductible),
    recordedPphBadanCredits: Math.round(recordedPphBadanCredits),
  };
};

export interface CorporateTax31EInput {
  grossTurnover: number;
  cogsAmount: number;
  operatingExpenses: number;
  otherBusinessIncome?: number;
  fiscalAdjustmentNet?: number;
  lossCompensation?: number;
  generalRatePercent?: number;
  applyPasal31EFacility?: boolean;
  taxCreditsPaid?: number;
  pphFinalRatePercent?: number;
}

export type CorporateTaxBracketTier =
  | 'LOSS_OR_ZERO'
  | 'FULL_31E'
  | 'PROPORTIONAL_31E'
  | 'GENERAL_22';

export interface CorporateTax31EResult {
  grossTurnover: number;
  cogsAmount: number;
  grossProfit: number;
  operatingExpenses: number;
  otherBusinessIncome: number;
  commercialNetProfit: number;
  fiscalAdjustmentNet: number;
  fiscalNetProfit: number;
  lossCompensation: number;
  rawTaxableIncome: number;
  taxableIncomePkp: number; // Dibulatkan ke ribuan penuh ke bawah sesuai Pasal 17 ayat (4) UU PPh
  applyPasal31EFacility: boolean;
  isEligibleUnder48M: boolean;
  isEligible31EByRevenue: boolean;
  bracketTier: CorporateTaxBracketTier;
  bracketLabel: string;
  generalRatePercent: number;
  facilityRatePercent: number;
  facilityShareRatio: number;
  facilityTaxableIncome: number;
  nonFacilityTaxableIncome: number;
  pphFacilityDue: number;
  pphNonFacilityDue: number;
  totalPphBadanDue: number;
  effectiveTaxRateOnPkp: number;
  effectiveTaxRateOnTurnover: number;
  taxWithoutFacility22: number;
  taxSavingsFrom31E: number;
  normalRatePphBadanDue: number;
  normalRatePph29Underpayment: number;
  normalRatePph28aOverpayment: number;
  normalRateMonthlyPph25: number;
  withFacility31EDue: number;
  withFacility31EPph29Underpayment: number;
  withFacility31EMonthlyPph25: number;
  potentialSavings31E: number;
  potentialSavingsPercent: number;
  taxCreditsPaid: number;
  pph29Underpayment: number;
  pph28aOverpayment: number;
  estimatedMonthlyPph25: number;
  comparisonPphFinal05: number;
  netMarginPercent: number;
  breakEvenMarginPercent: number;
  recommendedScheme: 'PPH_BADAN_31E' | 'PPH_FINAL_UMKM' | 'EQUAL';
}

export const calculatePphBadan31E = (input: CorporateTax31EInput): CorporateTax31EResult => {
  const grossTurnover = Math.max(0, Math.round(input.grossTurnover || 0));
  const cogsAmount = Math.max(0, Math.round(input.cogsAmount || 0));
  const operatingExpenses = Math.max(0, Math.round(input.operatingExpenses || 0));
  const otherBusinessIncome = Math.max(0, Math.round(input.otherBusinessIncome || 0));
  const fiscalAdjustmentNet = Math.round(input.fiscalAdjustmentNet || 0);
  const lossCompensation = Math.max(0, Math.round(input.lossCompensation || 0));
  const generalRatePercent = Math.max(
    0,
    Math.min(100, Number(input.generalRatePercent ?? PPH_BADAN_GENERAL_RATE))
  );
  const applyPasal31EFacility = input.applyPasal31EFacility !== false;
  const facilityRatePercent = Number((generalRatePercent * 0.5).toFixed(2));
  const taxCreditsPaid = Math.max(0, Math.round(input.taxCreditsPaid || 0));
  const pphFinalRatePercent = Math.max(0, Number(input.pphFinalRatePercent ?? 0.5));

  const grossProfit = grossTurnover - cogsAmount;
  const commercialNetProfit = grossProfit + otherBusinessIncome - operatingExpenses;
  const fiscalNetProfit = commercialNetProfit + fiscalAdjustmentNet;
  const rawTaxableIncome = Math.max(0, fiscalNetProfit - lossCompensation);
  // Pasal 17 ayat (4) UU PPh: PKP dibulatkan ke bawah dalam ribuan rupiah penuh
  const taxableIncomePkp =
    rawTaxableIncome > 0 ? Math.floor(rawTaxableIncome / 1000) * 1000 : 0;

  const isEligibleUnder48M = grossTurnover > 0 && grossTurnover <= PPH_31E_FACILITY_TURNOVER;
  const isEligible31EByRevenue = grossTurnover > 0 && grossTurnover <= PPH_31E_REVENUE_CAP;

  let bracketTier: CorporateTaxBracketTier = 'LOSS_OR_ZERO';
  let bracketLabel = 'Nihil / Rugi Fiskal (PKP ≤ Rp 0)';
  let facilityShareRatio = 0;

  if (taxableIncomePkp <= 0 || grossTurnover <= 0) {
    bracketTier = 'LOSS_OR_ZERO';
    bracketLabel = 'Nihil / Rugi Fiskal (PKP ≤ Rp 0)';
    facilityShareRatio = applyPasal31EFacility && grossTurnover <= PPH_31E_FACILITY_TURNOVER ? 1 : 0;
  } else if (!applyPasal31EFacility && isEligible31EByRevenue) {
    bracketTier = 'GENERAL_22';
    bracketLabel = `Tarif Normal Pasal 17 (${generalRatePercent}%) · Opsi Fasilitas Pasal 31E Dinonaktifkan`;
    facilityShareRatio = 0;
  } else if (grossTurnover <= PPH_31E_FACILITY_TURNOVER) {
    bracketTier = 'FULL_31E';
    bracketLabel = `Omzet ≤ Rp 4,8 Miliar · 100% Fasilitas Pasal 31E (Tarif ${facilityRatePercent}%)`;
    facilityShareRatio = 1;
  } else if (grossTurnover <= PPH_31E_REVENUE_CAP) {
    bracketTier = 'PROPORTIONAL_31E';
    bracketLabel = `Rp 4,8 M < Omzet ≤ Rp 50 Miliar · Proporsional Pasal 31E (${facilityRatePercent}% & ${generalRatePercent}%)`;
    facilityShareRatio = PPH_31E_FACILITY_TURNOVER / grossTurnover;
  } else {
    bracketTier = 'GENERAL_22';
    bracketLabel = `Omzet > Rp 50 Miliar · Tarif Normal Penuh (${generalRatePercent}% Non-Fasilitas)`;
    facilityShareRatio = 0;
  }

  // Always compute potential Pasal 31E benchmark so comparison vs normal rate is always available
  let benchmarkFacilityPkp = 0;
  let benchmarkNonFacilityPkp = taxableIncomePkp;
  if (taxableIncomePkp > 0 && isEligible31EByRevenue) {
    if (grossTurnover <= PPH_31E_FACILITY_TURNOVER) {
      benchmarkFacilityPkp = taxableIncomePkp;
      benchmarkNonFacilityPkp = 0;
    } else {
      benchmarkFacilityPkp = Math.min(
        taxableIncomePkp,
        Math.max(0, Math.round((PPH_31E_FACILITY_TURNOVER / grossTurnover) * taxableIncomePkp))
      );
      benchmarkNonFacilityPkp = Math.max(0, taxableIncomePkp - benchmarkFacilityPkp);
    }
  }
  const withFacility31EDue =
    Math.round(benchmarkFacilityPkp * (facilityRatePercent / 100)) +
    Math.round(benchmarkNonFacilityPkp * (generalRatePercent / 100));
  const withFacility31EPph29Underpayment = Math.max(0, withFacility31EDue - taxCreditsPaid);
  const withFacility31EMonthlyPph25 = Math.round(withFacility31EDue / 12);

  const normalRatePphBadanDue = Math.round(taxableIncomePkp * (generalRatePercent / 100));
  const normalRatePph29Underpayment = Math.max(0, normalRatePphBadanDue - taxCreditsPaid);
  const normalRatePph28aOverpayment = Math.max(0, taxCreditsPaid - normalRatePphBadanDue);
  const normalRateMonthlyPph25 = Math.round(normalRatePphBadanDue / 12);

  const potentialSavings31E = Math.max(0, normalRatePphBadanDue - withFacility31EDue);
  const potentialSavingsPercent =
    normalRatePphBadanDue > 0
      ? Number(((potentialSavings31E / normalRatePphBadanDue) * 100).toFixed(1))
      : 0;

  let facilityTaxableIncome = 0;
  let nonFacilityTaxableIncome = 0;

  if (taxableIncomePkp > 0) {
    if (bracketTier === 'FULL_31E') {
      facilityTaxableIncome = taxableIncomePkp;
      nonFacilityTaxableIncome = 0;
    } else if (bracketTier === 'PROPORTIONAL_31E') {
      facilityTaxableIncome = benchmarkFacilityPkp;
      nonFacilityTaxableIncome = benchmarkNonFacilityPkp;
    } else if (bracketTier === 'GENERAL_22') {
      facilityTaxableIncome = 0;
      nonFacilityTaxableIncome = taxableIncomePkp;
    }
  }

  const pphFacilityDue = Math.round(facilityTaxableIncome * (facilityRatePercent / 100));
  const pphNonFacilityDue = Math.round(nonFacilityTaxableIncome * (generalRatePercent / 100));
  const totalPphBadanDue = pphFacilityDue + pphNonFacilityDue;

  const taxWithoutFacility22 = normalRatePphBadanDue;
  const taxSavingsFrom31E = Math.max(0, taxWithoutFacility22 - totalPphBadanDue);

  const effectiveTaxRateOnPkp =
    taxableIncomePkp > 0 ? Number(((totalPphBadanDue / taxableIncomePkp) * 100).toFixed(2)) : 0;
  const effectiveTaxRateOnTurnover =
    grossTurnover > 0 ? Number(((totalPphBadanDue / grossTurnover) * 100).toFixed(3)) : 0;

  const pph29Underpayment = Math.max(0, totalPphBadanDue - taxCreditsPaid);
  const pph28aOverpayment = Math.max(0, taxCreditsPaid - totalPphBadanDue);
  const estimatedMonthlyPph25 = Math.round(totalPphBadanDue / 12);

  const comparisonPphFinal05 = Math.round(grossTurnover * (pphFinalRatePercent / 100));
  const netMarginPercent =
    grossTurnover > 0 ? Number(((commercialNetProfit / grossTurnover) * 100).toFixed(2)) : 0;
  const breakEvenMarginPercent =
    facilityRatePercent > 0
      ? Number(((pphFinalRatePercent / facilityRatePercent) * 100).toFixed(2))
      : 0;

  const recommendedScheme: CorporateTax31EResult['recommendedScheme'] =
    totalPphBadanDue < comparisonPphFinal05
      ? 'PPH_BADAN_31E'
      : totalPphBadanDue > comparisonPphFinal05
      ? 'PPH_FINAL_UMKM'
      : 'EQUAL';

  return {
    grossTurnover,
    cogsAmount,
    grossProfit,
    operatingExpenses,
    otherBusinessIncome,
    commercialNetProfit,
    fiscalAdjustmentNet,
    fiscalNetProfit,
    lossCompensation,
    rawTaxableIncome,
    taxableIncomePkp,
    applyPasal31EFacility,
    isEligibleUnder48M,
    isEligible31EByRevenue,
    bracketTier,
    bracketLabel,
    generalRatePercent,
    facilityRatePercent,
    facilityShareRatio,
    facilityTaxableIncome,
    nonFacilityTaxableIncome,
    pphFacilityDue,
    pphNonFacilityDue,
    totalPphBadanDue,
    effectiveTaxRateOnPkp,
    effectiveTaxRateOnTurnover,
    taxWithoutFacility22,
    taxSavingsFrom31E,
    normalRatePphBadanDue,
    normalRatePph29Underpayment,
    normalRatePph28aOverpayment,
    normalRateMonthlyPph25,
    withFacility31EDue,
    withFacility31EPph29Underpayment,
    withFacility31EMonthlyPph25,
    potentialSavings31E,
    potentialSavingsPercent,
    taxCreditsPaid,
    pph29Underpayment,
    pph28aOverpayment,
    estimatedMonthlyPph25,
    comparisonPphFinal05,
    netMarginPercent,
    breakEvenMarginPercent,
    recommendedScheme,
  };
};

export const exportCorporateTax31EExcel = (params: {
  storeSettings: StoreSettings;
  taxConfig: TaxConfig;
  year: number;
  sourceLabel: string;
  result: CorporateTax31EResult;
}): string => {
  const { storeSettings, taxConfig, year, sourceLabel, result } = params;

  const rows: Array<Array<string | number>> = [
    ['KERTAS KERJA PERHITUNGAN PPH BADAN & FASILITAS PASAL 31E UU PPH (SPT 1771)'],
    ['Nama Badan Usaha / Toko', storeSettings.storeName],
    ['Nama Wajib Pajak', taxConfig.taxpayerName || storeSettings.storeName],
    ['NPWP / NITKU', taxConfig.npwp || '-'],
    ['Tahun Pajak', year],
    ['Sumber Angka', sourceLabel],
    ['Kategori Tarif Pasal 31E', result.bracketLabel],
    ['Tanggal Ekspor', new Date().toLocaleString('id-ID')],
    [],
    ['I. REKONSILIASI LABA KOMERSIAL KE LABA FISKAL (PKP)', 'Nominal (Rp)', 'Keterangan / Rumus'],
    ['Peredaran Bruto / Omzet Setahun', result.grossTurnover, 'Penjualan bersih kena pajak'],
    ['Harga Pokok Penjualan (HPP / COGS)', result.cogsAmount, 'Pengurang langsung peredaran bruto'],
    ['Laba Kotor Usaha', result.grossProfit, 'Omzet - HPP'],
    ['Pendapatan Usaha Lainnya (Non-Final)', result.otherBusinessIncome, 'Penambah penghasilan komersial'],
    ['Biaya Operasional Usaha (Deductible)', result.operatingExpenses, 'Gaji, sewa, listrik, logistik, dll'],
    ['Laba (Rugi) Bersih Komersial', result.commercialNetProfit, `Net Margin: ${result.netMarginPercent}%`],
    ['Koreksi Fiskal Netto (+ Positif / - Negatif)', result.fiscalAdjustmentNet, 'Penyesuaian Pasal 6 & Pasal 9 UU PPh'],
    ['Laba (Rugi) Fiskal Tahun Berjalan', result.fiscalNetProfit, 'Laba Komersial + Koreksi Fiskal Netto'],
    ['Kompensasi Kerugian Fiskal (Pasal 6 ayat 2)', result.lossCompensation, 'Maks. 5 tahun ke depan'],
    ['Penghasilan Kena Pajak (PKP) - Dibulatkan Ribuan', result.taxableIncomePkp, 'Pasal 17 ayat (4) UU PPh (dibulatkan ribuan penuh ke bawah)'],
    [],
    ['II. PERHITUNGAN PPH BADAN TERUTANG (PASAL 17 & PASAL 31E)', 'Nominal (Rp)', 'Rumus / Tarif'],
    [
      'PKP Mendapat Fasilitas Pasal 31E (50% Diskon Tarif)',
      result.facilityTaxableIncome,
      result.bracketTier === 'FULL_31E'
        ? '100% PKP (Omzet <= Rp 4,8 Miliar)'
        : result.bracketTier === 'PROPORTIONAL_31E'
        ? `(Rp 4,8 M / ${result.grossTurnover}) x PKP (${(result.facilityShareRatio * 100).toFixed(2)}%)`
        : '0% (Omzet > Rp 50 Miliar / PKP Nihil)',
    ],
    [
      `PPh Badan Fasilitas Pasal 31E (${result.facilityRatePercent}%)`,
      result.pphFacilityDue,
      `50% x ${result.generalRatePercent}% x PKP Fasilitas`,
    ],
    [
      'PKP Tidak Mendapat Fasilitas (Tarif Umum)',
      result.nonFacilityTaxableIncome,
      'PKP Total - PKP Fasilitas 31E',
    ],
    [
      `PPh Badan Non-Fasilitas (${result.generalRatePercent}%)`,
      result.pphNonFacilityDue,
      `${result.generalRatePercent}% x PKP Non-Fasilitas`,
    ],
    [
      'TOTAL PPH BADAN TERUTANG SETAHUN',
      result.totalPphBadanDue,
      `Tarif Efektif thd PKP: ${result.effectiveTaxRateOnPkp}% | thd Omzet: ${result.effectiveTaxRateOnTurnover}%`,
    ],
    [
      'Penghematan Pajak dari Fasilitas Pasal 31E',
      result.taxSavingsFrom31E,
      `Banding Tarif Normal ${result.generalRatePercent}% (${result.normalRatePphBadanDue}) - PPh Terutang (${result.totalPphBadanDue})`,
    ],
    [],
    ['III. PERBANDINGAN FASILITAS PASAL 31E VS TARIF NORMAL PASAL 17', 'Nominal (Rp)', 'Keterangan'],
    ['Opsi Penerapan Fasilitas Pasal 31E', result.applyPasal31EFacility ? 'AKTIF (Diskon 50%)' : 'NON-AKTIF (Tarif Normal)', result.isEligibleUnder48M ? 'Omzet <= Rp 4,8 M (100% Diskon Tarif)' : result.isEligible31EByRevenue ? 'Omzet Rp 4,8 M - Rp 50 M (Proporsional)' : 'Omzet > Rp 50 M (Tidak berhak 31E)'],
    [`PPh Badan Dengan Fasilitas Pasal 31E (${result.facilityRatePercent}% / Proporsional)`, result.withFacility31EDue, `Angsuran PPh 25/bln: ${result.withFacility31EMonthlyPph25}`],
    [`PPh Badan Tarif Normal Pasal 17 (${result.generalRatePercent}%)`, result.normalRatePphBadanDue, `Angsuran PPh 25/bln: ${result.normalRateMonthlyPph25}`],
    ['Selisih / Potensi Penghematan Fasilitas 31E', result.potentialSavings31E, `Lebih hemat ${result.potentialSavingsPercent}% dibanding tarif normal`],
    [],
    ['IV. REKONSILIASI KREDIT PAJAK & ANGSURAN PASAL 25', 'Nominal (Rp)', 'Keterangan'],
    ['Kredit Pajak (Angsuran PPh 25 / PPh 22 / 23 Telah Disetor)', result.taxCreditsPaid, 'Mengurangi PPh terutang akhir tahun'],
    ['PPh Pasal 29 (Kurang Bayar SPT Tahunan)', result.pph29Underpayment, 'Disetor sebelum lapor SPT Tahunan Badan (30 April)'],
    ['PPh Pasal 28A (Lebih Bayar)', result.pph28aOverpayment, 'Bila kredit pajak melebihi PPh terutang'],
    ['Estimasi Angsuran PPh Pasal 25 / Bulan Tahun Berikutnya', result.estimatedMonthlyPph25, 'PPh Terutang / 12 Bulan'],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 52 }, { wch: 22 }, { wch: 52 }];
  XLSX.utils.book_append_sheet(wb, ws, 'PPh Badan Pasal 31E');

  const safeSlug = (storeSettings.storeName || 'KasirKu')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const filename = `Kertas_Kerja_PPh_Badan_31E_${year}${safeSlug ? `_${safeSlug}` : ''}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
};

// =============================================================================
// AUDIT TRAIL DIFF, SIMULASI RESTITUSI VS KOMPENSASI PPN, & JURNAL PAJAK
// =============================================================================

export interface TaxConfigDiffResult {
  changes: TaxAuditChangeItem[];
  isRateOverride: boolean;
  summary: string;
}

export const diffTaxConfigs = (
  prevConfig: TaxConfig,
  nextConfig: TaxConfig
): TaxConfigDiffResult => {
  const prev = getEffectiveTaxConfig(prevConfig);
  const next = getEffectiveTaxConfig(nextConfig);

  const fmtBool = (val: boolean | undefined) => (val ? 'Aktif' : 'Non-Aktif');
  const fmtStr = (val: string | undefined) => (val && val.trim() ? val.trim() : '-');
  const fmtNum = (val: number | undefined, suffix = '') => `${Number(val ?? 0)}${suffix}`;

  const fields: Array<{
    key: keyof TaxConfig;
    label: string;
    isRate?: boolean;
    format: (cfg: TaxConfig) => string;
  }> = [
    { key: 'taxpayerStatus', label: 'Status Wajib Pajak', format: (c) => REGIME_LABELS[c.taxpayerStatus] },
    { key: 'taxpayerName', label: 'Nama Wajib Pajak', format: (c) => fmtStr(c.taxpayerName) },
    { key: 'npwp', label: 'NPWP / NITKU', format: (c) => fmtStr(c.npwp) },
    { key: 'enablePphFinalUmkm', label: 'PPh Final UMKM', format: (c) => fmtBool(c.enablePphFinalUmkm) },
    {
      key: 'pphFinalRatePercent',
      label: 'Tarif PPh Final',
      isRate: true,
      format: (c) => fmtNum(c.pphFinalRatePercent, '%'),
    },
    {
      key: 'applyUmkmOpThreshold500Jt',
      label: 'Batas Bebas PPh OP 500 Jt',
      format: (c) => fmtBool(c.applyUmkmOpThreshold500Jt !== false),
    },
    { key: 'enablePpn', label: 'Status PKP / PPN', format: (c) => fmtBool(c.enablePpn) },
    {
      key: 'ppnRatePercent',
      label: 'Tarif PPN',
      isRate: true,
      format: (c) => fmtNum(c.ppnRatePercent, '%'),
    },
    {
      key: 'ppnMode',
      label: 'Basis Harga PPN',
      isRate: true,
      format: (c) => (c.ppnMode === 'EXCLUSIVE' ? 'Eksklusif (+ PPN)' : 'Inklusif (Termasuk)'),
    },
    {
      key: 'deductInputVatFromPurchases',
      label: 'Kredit PPN Masukan PO',
      format: (c) => fmtBool(c.deductInputVatFromPurchases !== false),
    },
    { key: 'enablePb1', label: 'Pajak Daerah / PB1', format: (c) => fmtBool(c.enablePb1) },
    {
      key: 'pb1RatePercent',
      label: 'Tarif PB1',
      isRate: true,
      format: (c) => fmtNum(c.pb1RatePercent, '%'),
    },
    {
      key: 'enablePphBadan31E',
      label: 'Pelaporan PPh Badan',
      format: (c) => fmtBool(c.enablePphBadan31E),
    },
    {
      key: 'applyPasal31EFacility',
      label: 'Fasilitas Pasal 31E (Diskon 50%)',
      format: (c) => fmtBool(c.applyPasal31EFacility !== false),
    },
    {
      key: 'pphBadanRatePercent',
      label: 'Tarif Umum PPh Badan',
      isRate: true,
      format: (c) => fmtNum(c.pphBadanRatePercent, '%'),
    },
    {
      key: 'pphBadanFiscalAdjustment',
      label: 'Koreksi Fiskal Netto',
      format: (c) => fmtNum(c.pphBadanFiscalAdjustment, ' Rp'),
    },
    {
      key: 'pphBadanLossCompensation',
      label: 'Kompensasi Rugi Fiskal',
      format: (c) => fmtNum(c.pphBadanLossCompensation, ' Rp'),
    },
    {
      key: 'excludeCashWithdrawalPrincipal',
      label: 'Kecualikan Pokok Tarik Tunai',
      format: (c) => fmtBool(c.excludeCashWithdrawalPrincipal !== false),
    },
    {
      key: 'monthlyDueDay',
      label: 'Tanggal Jatuh Tempo Bulanan',
      format: (c) => `Tanggal ${Number(c.monthlyDueDay ?? 15)}`,
    },
    {
      key: 'dueReminderDaysBefore',
      label: 'Pengingat Jatuh Tempo',
      format: (c) => `H-${Number(c.dueReminderDaysBefore ?? 7)}`,
    },
  ];

  const changes: TaxAuditChangeItem[] = [];
  let isRateOverride = false;

  fields.forEach((f) => {
    const oldVal = f.format(prev);
    const newVal = f.format(next);
    if (oldVal !== newVal) {
      changes.push({
        field: String(f.key),
        label: f.label,
        oldValue: oldVal,
        newValue: newVal,
      });
      if (f.isRate) isRateOverride = true;
    }
  });

  const summary =
    changes.length > 0
      ? changes.map((c) => `${c.label}: ${c.oldValue} -> ${c.newValue}`).join('; ')
      : 'Pembaruan konfigurasi pajak';

  return { changes, isRateOverride, summary };
};

export interface VatOverpaymentSimulationInput {
  ppnOutput: number;
  ppnInput: number;
  manualOverpaymentOverride?: number;
  refundTrack: 'REGULER' | 'DIPERCEPAT';
  projectedMonthlyNetVatPayable: number;
  costOfCapitalAnnualPercent: number;
  auditPreparationCost: number;
}

export interface VatOverpaymentMonthRow {
  monthNumber: number;
  monthLabel: string;
  openingCredit: number;
  monthlyPayableBeforeCredit: number;
  creditAbsorbed: number;
  vatCashPaid: number;
  endingCredit: number;
  refundCumulativeCash: number;
  compensationCumulativeCashSaved: number;
}

export interface VatOverpaymentSimulationResult {
  ppnOutput: number;
  ppnInput: number;
  overpaymentAmount: number;
  refundTrack: 'REGULER' | 'DIPERCEPAT';
  refund: {
    monthsToCash: number;
    grossRefund: number;
    auditCost: number;
    financingOpportunityCost: number;
    netEconomicValue: number;
    effectiveRecoveryPercent: number;
    riskLevel: 'TINGGI (Pemeriksaan Pajak Lengkap)' | 'RENDAH (Penelitian Pendahuluan)';
    complianceNotes: string[];
  };
  compensation: {
    monthsToAbsorb: number | null;
    absorbedIn6Months: number;
    carriedBalanceAfter6Months: number;
    monthlyAverageAbsorption: number;
    financingOpportunityCost: number;
    netEconomicValue: number;
    effectiveRecoveryPercent: number;
    cashSavingsMonth1: number;
    complianceNotes: string[];
  };
  schedule6Months: VatOverpaymentMonthRow[];
  recommendedStrategy: 'KOMPENSASI' | 'RESTITUSI' | 'NETRAL';
  recommendationReason: string;
  netAdvantageRupiah: number;
}

export const simulateVatOverpaymentScenarios = (
  input: VatOverpaymentSimulationInput
): VatOverpaymentSimulationResult => {
  const ppnOutput = Math.max(0, Math.round(input.ppnOutput || 0));
  const ppnInput = Math.max(0, Math.round(input.ppnInput || 0));
  const computedOverpay = Math.max(0, ppnInput - ppnOutput);
  const overpaymentAmount =
    input.manualOverpaymentOverride !== undefined && input.manualOverpaymentOverride >= 0
      ? Math.round(input.manualOverpaymentOverride)
      : computedOverpay;

  const refundTrack = input.refundTrack;
  const monthlyPayable = Math.max(0, Math.round(input.projectedMonthlyNetVatPayable || 0));
  const annualCostPct = Math.max(0, Math.min(100, Number(input.costOfCapitalAnnualPercent ?? 12)));
  const monthlyRate = annualCostPct / 100 / 12;
  const auditCost = Math.max(0, Math.round(input.auditPreparationCost || 0));

  // Skenario A: Restitusi PPN
  const monthsToCash = refundTrack === 'REGULER' ? 12 : 2;
  const effectiveAuditCost = refundTrack === 'REGULER' ? auditCost : Math.round(auditCost * 0.2);
  const refundOpportunityCost = Math.round(overpaymentAmount * monthlyRate * monthsToCash);
  const refundNetValue = Math.max(
    0,
    overpaymentAmount - effectiveAuditCost - refundOpportunityCost
  );
  const refundRecoveryPct =
    overpaymentAmount > 0 ? Number(((refundNetValue / overpaymentAmount) * 100).toFixed(1)) : 0;

  // Skenario B: Kompensasi ke Masa Pajak Berikutnya (6-month absorption model + full horizon)
  const monthsToAbsorb =
    overpaymentAmount <= 0
      ? 0
      : monthlyPayable > 0
      ? Math.ceil(overpaymentAmount / monthlyPayable)
      : null;

  const horizonMonths = Math.min(24, monthsToAbsorb ?? 24);
  let remaining = overpaymentAmount;
  let totalCompOpportunityCost = 0;
  for (let m = 1; m <= horizonMonths && remaining > 0; m += 1) {
    totalCompOpportunityCost += remaining * monthlyRate;
    const absorbed = Math.min(remaining, monthlyPayable);
    remaining = Math.max(0, remaining - absorbed);
  }
  const compOpportunityRounded = Math.round(totalCompOpportunityCost);
  const absorbedWithinHorizon = overpaymentAmount - remaining;
  const compNetValue = Math.max(0, absorbedWithinHorizon - compOpportunityRounded);
  const compRecoveryPct =
    overpaymentAmount > 0 ? Number(((compNetValue / overpaymentAmount) * 100).toFixed(1)) : 0;

  // Build 6-month projection table
  const schedule6Months: VatOverpaymentMonthRow[] = [];
  let runningCredit = overpaymentAmount;
  let cumulativeSaved = 0;

  for (let m = 1; m <= 6; m += 1) {
    const openingCredit = runningCredit;
    const absorbed = Math.min(openingCredit, monthlyPayable);
    const vatCashPaid = Math.max(0, monthlyPayable - absorbed);
    const endingCredit = Math.max(0, openingCredit - absorbed);
    cumulativeSaved += absorbed;
    runningCredit = endingCredit;

    const refundCashAtM = m >= monthsToCash ? Math.max(0, overpaymentAmount - effectiveAuditCost) : 0;

    schedule6Months.push({
      monthNumber: m,
      monthLabel: `Masa +${m}`,
      openingCredit,
      monthlyPayableBeforeCredit: monthlyPayable,
      creditAbsorbed: absorbed,
      vatCashPaid,
      endingCredit,
      refundCumulativeCash: refundCashAtM,
      compensationCumulativeCashSaved: cumulativeSaved,
    });
  }

  const absorbedIn6Months = schedule6Months.reduce((s, r) => s + r.creditAbsorbed, 0);
  const carriedBalanceAfter6Months = Math.max(0, overpaymentAmount - absorbedIn6Months);
  const cashSavingsMonth1 = schedule6Months[0]?.creditAbsorbed || 0;
  const monthlyAverageAbsorption = Math.round(absorbedIn6Months / 6);

  let recommendedStrategy: 'KOMPENSASI' | 'RESTITUSI' | 'NETRAL' = 'NETRAL';
  let recommendationReason =
    'Tidak terdapat saldo PPN Lebih Bayar pada skenario ini (nilai Rp 0).';

  if (overpaymentAmount > 0) {
    if (monthsToAbsorb !== null && monthsToAbsorb <= monthsToCash && compNetValue >= refundNetValue) {
      recommendedStrategy = 'KOMPENSASI';
      recommendationReason = `Kelebihan bayar PPN terserap habis dalam ${monthsToAbsorb} bulan (lebih cepat dari cairnya restitusi ±${monthsToCash} bulan) tanpa biaya pemeriksaan dan langsung menghemat kas PPN mulai bulan depan.`;
    } else if (refundNetValue > compNetValue) {
      recommendedStrategy = 'RESTITUSI';
      recommendationReason = `Karena estimasi PPN Kurang Bayar masa depan rendah atau tidak mencukupi untuk menyerap kredit pajak dalam ${monthsToCash} bulan, pengajuan Restitusi (${
        refundTrack === 'DIPERCEPAT' ? 'Pengembalian Pendahuluan' : 'Reguler'
      }) menghasilkan nilai bersih kas lebih tinggi.`;
    } else {
      recommendedStrategy = 'KOMPENSASI';
      recommendationReason =
        'Kompensasi ke masa pajak berikutnya menghindari pemeriksaan pajak lengkap serta menjaga likuiditas bulanan secara bertahap.';
    }
  }

  return {
    ppnOutput,
    ppnInput,
    overpaymentAmount,
    refundTrack,
    refund: {
      monthsToCash,
      grossRefund: overpaymentAmount,
      auditCost: effectiveAuditCost,
      financingOpportunityCost: refundOpportunityCost,
      netEconomicValue: refundNetValue,
      effectiveRecoveryPercent: refundRecoveryPct,
      riskLevel:
        refundTrack === 'REGULER'
          ? 'TINGGI (Pemeriksaan Pajak Lengkap)'
          : 'RENDAH (Penelitian Pendahuluan)',
      complianceNotes:
        refundTrack === 'REGULER'
          ? [
              'Memicu pemeriksaan pajak oleh KPP (Pasal 17B UU KUP, maksimal 12 bulan sejak permohonan lengkap).',
              'Wajib menyiapkan seluruh arsip Faktur Pajak Masukan, rekening koran, bukti bayar PO, dan buku persediaan.',
              'Pengembalian tunai penuh berpotensi dikurangi SKPKB bila ada koreksi pemeriksa.',
            ]
          : [
              'Berlaku untuk PKP Berisiko Rendah / Wajib Pajak Kriteria Tertentu (Pasal 9 ayat 4c / Pasal 17D UU KUP).',
              'SKPPKP diterbitkan setelah penelitian formal (±1–3 bulan), tanpa pemeriksaan lapangan awal.',
              'DJP tetap berwenang melakukan pemeriksaan pasca-pengembalian di kemudian hari.',
            ],
    },
    compensation: {
      monthsToAbsorb,
      absorbedIn6Months,
      carriedBalanceAfter6Months,
      monthlyAverageAbsorption,
      financingOpportunityCost: compOpportunityRounded,
      netEconomicValue: compNetValue,
      effectiveRecoveryPercent: compRecoveryPct,
      cashSavingsMonth1,
      complianceNotes: [
        'Memindahkan saldo Lebih Bayar (bagian II.F SPT Masa PPN) ke Masa Pajak berikutnya secara langsung.',
        'Tidak memicu pemeriksaan restitusi saat pelaporan SPT Masa berjalan (kecuali akhir tahun buku jika diminta restitusi).',
        'Mengurangi langsung setoran kas PPN Kurang Bayar pada bulan-bulan penjualan ramai berikutnya.',
      ],
    },
    schedule6Months,
    recommendedStrategy,
    recommendationReason,
    netAdvantageRupiah: Math.abs(refundNetValue - compNetValue),
  };
};

export interface TaxJournalEntry {
  id: string;
  date: string;
  source: 'POS_OTOMATIS' | 'ADJUSTMENT' | 'SETORAN_KAS';
  reference: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
}

export interface MonthlyTaxJournalResult {
  periodKey: string;
  entries: TaxJournalEntry[];
  totalDebit: number;
  totalCredit: number;
  activeAdjustments: TaxAdjustment[];
}

export const buildMonthlyTaxJournal = (params: {
  transactions: Transaction[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  taxConfig: TaxConfig;
  year: number;
  monthIndex: number;
}): MonthlyTaxJournalResult => {
  const {
    transactions,
    purchases,
    taxRecords,
    taxAdjustments,
    taxConfig,
    year,
    monthIndex,
  } = params;

  const periodKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0).getDate();
  const periodEndDate = `${periodKey}-${String(lastDayOfMonth).padStart(2, '0')}`;

  // Base buckets WITHOUT adjustments first so adjustment entries appear transparently as explicit journal lines
  const baseAnalysis = computeAnnualTaxBuckets({
    transactions,
    purchases,
    taxRecords,
    taxConfig,
    year,
    taxAdjustments: [],
  });
  const baseBucket = baseAnalysis.buckets[monthIndex];

  const entries: TaxJournalEntry[] = [];

  // 1. Base POS / PO accrual entries
  if (baseBucket.pphFinalDue > 0) {
    entries.push({
      id: `jrn_base_pph_${periodKey}`,
      date: periodEndDate,
      source: 'POS_OTOMATIS',
      reference: `POS-${periodKey}`,
      accountCode: '5210 / 2131',
      accountName: 'Beban & Utang PPh Final UMKM (0,5%)',
      description: `Akrual PPh Final UMKM dari omzet kena pajak ${baseBucket.txCount} transaksi`,
      debit: baseBucket.pphFinalDue,
      credit: baseBucket.pphFinalDue,
    });
  }

  if (baseBucket.ppnOutput > 0) {
    entries.push({
      id: `jrn_base_ppn_out_${periodKey}`,
      date: periodEndDate,
      source: 'POS_OTOMATIS',
      reference: `PK-${periodKey}`,
      accountCode: '1110 / 2132',
      accountName: 'Piutang/Kas vs PPN Keluaran Terutang',
      description: `Pemungutan PPN Keluaran penjualan masa ${baseBucket.monthName} ${year}`,
      debit: baseBucket.ppnOutput,
      credit: baseBucket.ppnOutput,
    });
  }

  if (baseBucket.ppnInputEstimate > 0) {
    entries.push({
      id: `jrn_base_ppn_in_${periodKey}`,
      date: periodEndDate,
      source: 'POS_OTOMATIS',
      reference: `PM-${periodKey}`,
      accountCode: '1151 / 2110',
      accountName: 'PPN Masukan (Faktur Pembelian PO)',
      description: `Pengkreditan estimasi PPN Masukan dari pembelian stok PO Selesai`,
      debit: baseBucket.ppnInputEstimate,
      credit: baseBucket.ppnInputEstimate,
    });
  }

  if (baseBucket.pb1Due > 0) {
    entries.push({
      id: `jrn_base_pb1_${periodKey}`,
      date: periodEndDate,
      source: 'POS_OTOMATIS',
      reference: `PB1-${periodKey}`,
      accountCode: '5212 / 2133',
      accountName: 'Beban & Utang Pajak Daerah / PB1',
      description: `Akrual PB1 masa ${baseBucket.monthName} ${year}`,
      debit: baseBucket.pb1Due,
      credit: baseBucket.pb1Due,
    });
  }

  // 2. Explicit Tax Adjustments (only ACTIVE adjustments adjust the tax ledger)
  const periodAdjustments = taxAdjustments
    .filter((a) => a.periodMonth === periodKey)
    .sort((a, b) => b.timestamp - a.timestamp);

  const activeAdjustments = periodAdjustments.filter((a) => a.status === 'ACTIVE');

  activeAdjustments.forEach((adj) => {
    const absTax = Math.abs(Math.round(adj.taxDelta || 0));
    const absDpp = Math.abs(Math.round(adj.dppDelta || 0));
    const displayAmount = absTax > 0 ? absTax : absDpp;
    const isDecrease = adj.direction === 'DECREASE' || adj.taxDelta < 0 || adj.dppDelta < 0;

    let accCode = '2139 / 4190';
    let accName = TAX_ADJUSTMENT_TARGET_LABELS[adj.affectedTaxType];

    if (adj.affectedTaxType === 'PPN_KELUARAN') {
      accCode = isDecrease ? '2132 / 1110' : '1110 / 2132';
      accName = isDecrease
        ? 'Pembalikan PPN Keluaran (Pembatalan/Retur)'
        : 'Koreksi Penambahan PPN Keluaran';
    } else if (adj.affectedTaxType === 'PPN_MASUKAN') {
      accCode = isDecrease ? '2110 / 1151' : '1151 / 2110';
      accName = isDecrease
        ? 'Koreksi Pengurangan PPN Masukan'
        : 'Penambahan Kredit PPN Masukan';
    } else if (adj.affectedTaxType === 'PPH_FINAL_UMKM') {
      accCode = isDecrease ? '2131 / 5210' : '5210 / 2131';
      accName = isDecrease
        ? 'Koreksi Pengurangan Utang PPh Final'
        : 'Koreksi Penambahan Utang PPh Final';
    } else if (adj.affectedTaxType === 'PB1') {
      accCode = isDecrease ? '2133 / 5212' : '5212 / 2133';
      accName = 'Koreksi Utang Pajak Daerah / PB1';
    } else {
      accCode = isDecrease ? '4120 / 1120' : '1120 / 4110';
      accName = isDecrease
        ? 'Koreksi Pengurangan DPP / Pembatalan Nota Penjualan'
        : 'Koreksi Penambahan DPP / Penjualan';
    }

    entries.push({
      id: `jrn_adj_${adj.id}`,
      date: adj.adjustmentDate,
      source: 'ADJUSTMENT',
      reference: adj.adjustmentNumber + (adj.referenceInvoiceNumber ? ` (${adj.referenceInvoiceNumber})` : ''),
      accountCode: accCode,
      accountName: accName,
      description: `${TAX_ADJUSTMENT_REASON_LABELS[adj.reasonType]} (${isDecrease ? 'Pengurangan −' : 'Penambahan +'}): ${adj.notes}`,
      debit: displayAmount,
      credit: displayAmount,
    });
  });

  // 3. Recorded tax payments
  taxRecords
    .filter((r) => r.periodMonth === periodKey && r.status === 'SUDAH_SETOR')
    .forEach((rec) => {
      const paidAmt = Math.max(0, rec.paidAmount || rec.taxAmountDue || 0);
      if (paidAmt <= 0) return;
      entries.push({
        id: `jrn_pay_${rec.id}`,
        date: rec.paidDate || periodEndDate,
        source: 'SETORAN_KAS',
        reference: rec.ntpnCode || rec.billingCode || `SETOR-${rec.periodMonth}`,
        accountCode: '2130 / 1111',
        accountName: `Pelunasan Utang ${rec.taxTypeLabel}`,
        description: `Setoran kas negara (${rec.paymentMethod || 'Transfer'}) · NTPN: ${rec.ntpnCode || '-'}`,
        debit: paidAmt,
        credit: paidAmt,
      });
    });

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

  return {
    periodKey,
    entries,
    totalDebit,
    totalCredit,
    activeAdjustments,
  };
};

export const exportTaxAuditLogsCsv = (logs: TaxAuditLog[], storeName: string): string => {
  const escapeCsv = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const headers = [
    'Waktu',
    'Kategori',
    'Aksi',
    'Masa Pajak',
    'Pengguna',
    'Jabatan',
    'Ringkasan Perubahan',
    'Detail Perubahan (Lama -> Baru)',
    'Alasan / Catatan Audit',
  ];
  const rows = logs.map((log) => [
    formatDateTime(log.timestamp),
    log.category,
    log.actionLabel,
    log.periodMonth || '-',
    log.actorName,
    log.actorRole,
    log.summary,
    (log.changes || []).map((c) => `${c.label}: ${c.oldValue} -> ${c.newValue}`).join(' | ') || '-',
    log.reason || '-',
  ]);
  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map((r) => r.map(escapeCsv).join(',')),
  ].join('\n');

  const safeSlug = (storeName || 'KasirKu')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);
  const filename = `Audit_Log_Pajak_${new Date().toISOString().slice(0, 10)}${
    safeSlug ? `_${safeSlug}` : ''
  }.csv`;

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return filename;
};

