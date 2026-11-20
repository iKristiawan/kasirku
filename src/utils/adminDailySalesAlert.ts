import {
  CashflowRecord,
  DailySalesReportScheduleConfig,
  Product,
  Transaction,
} from '../types/pos';
import { formatDateOnly, formatDateTime, formatNumber, formatRupiah } from './formatters';
import { getItemFifoCogs } from './fifoUtils';
import { getLocalDateKey } from './adminLowStockAlert';

export const SCHEDULED_DAILY_SALES_DISPATCH_KEY = 'kasir_scheduled_daily_sales_wa_dispatch';

export const DEFAULT_DAILY_SALES_SCHEDULE: DailySalesReportScheduleConfig = {
  enabled: false,
  closingTime: '21:00',
  intervalMode: 'DAILY',
  intervalDays: 1,
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  includePaymentBreakdown: true,
  includeProfitSummary: true,
  includeTopProducts: true,
  includeExpenseSummary: true,
  sendOnlyIfHasTransactions: false,
};

export interface ScheduledDailySalesDispatchState {
  lastDispatchedSlotKey: string;
  lastDispatchedDateKey?: string;
  lastDispatchedAt?: number;
  lastTransactionCount?: number;
  lastNetRevenue?: number;
}

const WEEKDAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const WEEKDAY_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function normalizeDailySalesSchedule(
  raw?: Partial<DailySalesReportScheduleConfig> | null
): DailySalesReportScheduleConfig {
  const timeMatch = /^\d{2}:\d{2}$/.test((raw?.closingTime || '').trim())
    ? (raw?.closingTime || '21:00').trim()
    : '21:00';
  const [hhRaw, mmRaw] = timeMatch.split(':').map((v) => parseInt(v, 10));
  const hh = Number.isFinite(hhRaw) ? Math.min(23, Math.max(0, hhRaw)) : 21;
  const mm = Number.isFinite(mmRaw) ? Math.min(59, Math.max(0, mmRaw)) : 0;
  const normalizedClosingTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  const rawMode = raw?.intervalMode;
  const intervalMode =
    rawMode === 'DAILY' || rawMode === 'EVERY_N_DAYS' || rawMode === 'DAYS_OF_WEEK'
      ? rawMode
      : 'DAILY';

  const rawIntervalDays = Math.floor(Number(raw?.intervalDays) || 1);
  const intervalDays = Math.min(30, Math.max(1, rawIntervalDays));

  const cleanDays = Array.isArray(raw?.daysOfWeek)
    ? Array.from(
        new Set(
          raw.daysOfWeek
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        )
      ).sort((a, b) => a - b)
    : [...DEFAULT_DAILY_SALES_SCHEDULE.daysOfWeek];

  return {
    enabled: Boolean(raw?.enabled),
    closingTime: normalizedClosingTime,
    intervalMode,
    intervalDays,
    daysOfWeek: cleanDays.length > 0 ? cleanDays : [1],
    includePaymentBreakdown:
      raw?.includePaymentBreakdown !== undefined ? Boolean(raw.includePaymentBreakdown) : true,
    includeProfitSummary:
      raw?.includeProfitSummary !== undefined ? Boolean(raw.includeProfitSummary) : true,
    includeTopProducts:
      raw?.includeTopProducts !== undefined ? Boolean(raw.includeTopProducts) : true,
    includeExpenseSummary:
      raw?.includeExpenseSummary !== undefined ? Boolean(raw.includeExpenseSummary) : true,
    sendOnlyIfHasTransactions: Boolean(raw?.sendOnlyIfHasTransactions),
  };
}

export function loadScheduledDailySalesDispatch(): ScheduledDailySalesDispatchState {
  try {
    const raw = localStorage.getItem(SCHEDULED_DAILY_SALES_DISPATCH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ScheduledDailySalesDispatchState;
      if (parsed && typeof parsed.lastDispatchedSlotKey === 'string') {
        return parsed;
      }
    }
  } catch {
    // Ignore storage read failures
  }
  return { lastDispatchedSlotKey: '' };
}

export function markScheduledDailySalesDispatched(
  slotKey: string,
  dispatchedDateKey: string,
  transactionCount: number,
  netRevenue: number
): ScheduledDailySalesDispatchState {
  const nextState: ScheduledDailySalesDispatchState = {
    lastDispatchedSlotKey: slotKey,
    lastDispatchedDateKey: dispatchedDateKey,
    lastDispatchedAt: Date.now(),
    lastTransactionCount: transactionCount,
    lastNetRevenue: netRevenue,
  };
  try {
    localStorage.setItem(SCHEDULED_DAILY_SALES_DISPATCH_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage write failures
  }
  return nextState;
}

export function resetScheduledDailySalesDispatch(): ScheduledDailySalesDispatchState {
  const emptyState: ScheduledDailySalesDispatchState = { lastDispatchedSlotKey: '' };
  try {
    localStorage.removeItem(SCHEDULED_DAILY_SALES_DISPATCH_KEY);
  } catch {
    // Ignore storage remove failures
  }
  return emptyState;
}

function parseLocalDateKeyMs(dateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return NaN;
  const [y, m, d] = dateKey.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  return dt.getTime();
}

function isDateMatchingDailySalesInterval(
  candidateDate: Date,
  schedule: DailySalesReportScheduleConfig,
  lastDispatchedDateKey?: string
): boolean {
  if (schedule.intervalMode === 'DAILY') return true;
  if (schedule.intervalMode === 'DAYS_OF_WEEK') {
    return schedule.daysOfWeek.includes(candidateDate.getDay());
  }
  // EVERY_N_DAYS
  if (!lastDispatchedDateKey) return true;
  const lastMs = parseLocalDateKeyMs(lastDispatchedDateKey);
  if (isNaN(lastMs)) return true;
  const candidateMidnight = new Date(
    candidateDate.getFullYear(),
    candidateDate.getMonth(),
    candidateDate.getDate(),
    0,
    0,
    0,
    0
  ).getTime();
  const diffDays = Math.round((candidateMidnight - lastMs) / 86400000);
  return diffDays >= Math.max(1, schedule.intervalDays);
}

export function formatDailySalesScheduleSummaryLabel(
  rawSchedule?: Partial<DailySalesReportScheduleConfig> | null
): string {
  const schedule = normalizeDailySalesSchedule(rawSchedule);
  if (schedule.intervalMode === 'DAILY') {
    return `Setiap Hari Tutup · ${schedule.closingTime}`;
  }
  if (schedule.intervalMode === 'EVERY_N_DAYS') {
    return `Setiap ${schedule.intervalDays} Hari · ${schedule.closingTime}`;
  }
  const dayLabels = schedule.daysOfWeek.map((d) => WEEKDAY_SHORT_ID[d]).join(', ');
  return `${dayLabels} · ${schedule.closingTime}`;
}

export function evaluateScheduledDailySalesDue(
  rawSchedule?: Partial<DailySalesReportScheduleConfig> | null,
  now: Date = new Date(),
  dispatchState: ScheduledDailySalesDispatchState = { lastDispatchedSlotKey: '' }
): {
  isDue: boolean;
  slotKey: string;
  todayKey: string;
  schedule: DailySalesReportScheduleConfig;
} {
  const schedule = normalizeDailySalesSchedule(rawSchedule);
  const todayKey = getLocalDateKey(now);
  const slotKey = `${todayKey}@${schedule.closingTime}`;

  if (!schedule.enabled) {
    return { isDue: false, slotKey, todayKey, schedule };
  }

  if (dispatchState.lastDispatchedSlotKey === slotKey) {
    return { isDue: false, slotKey, todayKey, schedule };
  }

  if (!isDateMatchingDailySalesInterval(now, schedule, dispatchState.lastDispatchedDateKey)) {
    return { isDue: false, slotKey, todayKey, schedule };
  }

  const [hh, mm] = schedule.closingTime.split(':').map((v) => parseInt(v, 10));
  const closingToday = new Date(now);
  closingToday.setHours(hh, mm, 0, 0);

  const isDue = now.getTime() >= closingToday.getTime();
  return { isDue, slotKey, todayKey, schedule };
}

export function getNextDailySalesDispatchInfo(
  rawSchedule?: Partial<DailySalesReportScheduleConfig> | null,
  now: Date = new Date(),
  dispatchState: ScheduledDailySalesDispatchState = { lastDispatchedSlotKey: '' }
): string {
  const schedule = normalizeDailySalesSchedule(rawSchedule);
  if (!schedule.enabled) {
    return 'Jadwal nonaktif';
  }

  const [hh, mm] = schedule.closingTime.split(':').map((v) => parseInt(v, 10));
  for (let offset = 0; offset <= 31; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hh, mm, 0, 0);

    if (!isDateMatchingDailySalesInterval(candidate, schedule, dispatchState.lastDispatchedDateKey)) {
      continue;
    }

    const slotKey = `${getLocalDateKey(candidate)}@${schedule.closingTime}`;
    if (
      offset === 0 &&
      (candidate.getTime() <= now.getTime() || dispatchState.lastDispatchedSlotKey === slotKey)
    ) {
      continue;
    }

    if (offset === 0) return `Hari ini jam tutup ${schedule.closingTime}`;
    if (offset === 1) {
      return `Besok (${WEEKDAY_NAMES_ID[candidate.getDay()]}) pukul ${schedule.closingTime}`;
    }
    return `${WEEKDAY_NAMES_ID[candidate.getDay()]}, ${candidate.getDate()}/${candidate.getMonth() + 1} pukul ${schedule.closingTime}`;
  }

  return `Jam tutup ${schedule.closingTime}`;
}

export interface DailySalesClosingSummary {
  dateKey: string;
  formattedDate: string;
  transactionCount: number;
  totalUnitsSold: number;
  grossSubtotal: number;
  totalAllDiscounts: number;
  totalNetRevenue: number;
  totalFifoCogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  todayExpenses: number;
  todayOtherIncome: number;
  netProfit: number;
  piutangCreatedCount: number;
  piutangCreatedAmount: number;
  paymentBreakdown: Array<{ method: string; count: number; totalAmount: number }>;
  topProducts: Array<{ productName: string; unitsSold: number; baseUnit: string; revenue: number; profit: number }>;
}

export function computeTodaySalesClosingSummary(params: {
  transactions: Transaction[];
  products: Product[];
  cashflows?: CashflowRecord[];
  targetDateKey?: string;
}): DailySalesClosingSummary {
  const {
    transactions = [],
    products = [],
    cashflows = [],
    targetDateKey = getLocalDateKey(),
  } = params;

  const productMap = new Map<string, Product>();
  products.forEach((p) => productMap.set(p.id, p));

  const dayTxs = transactions.filter((tx) => getLocalDateKey(new Date(tx.timestamp)) === targetDateKey);

  let totalUnitsSold = 0;
  let grossSubtotal = 0;
  let totalAllDiscounts = 0;
  let totalNetRevenue = 0;
  let totalFifoCogs = 0;
  let piutangCreatedCount = 0;
  let piutangCreatedAmount = 0;

  const paymentMap = new Map<string, { count: number; totalAmount: number }>();
  const topProductMap = new Map<
    string,
    { productName: string; unitsSold: number; baseUnit: string; revenue: number; profit: number }
  >();

  dayTxs.forEach((tx) => {
    grossSubtotal += tx.subtotal || 0;
    totalAllDiscounts +=
      (tx.discount || 0) + (tx.membershipDiscountAmount || 0) + (tx.pointsDiscountAmount || 0);
    totalNetRevenue += tx.finalAmount || 0;

    if (tx.paymentMethod === 'PIUTANG') {
      piutangCreatedCount += 1;
      piutangCreatedAmount += tx.finalAmount || 0;
    }

    const methodLabel = (tx.paymentMethod || 'CASH').replace(/_/g, ' ');
    const payEntry = paymentMap.get(methodLabel) || { count: 0, totalAmount: 0 };
    payEntry.count += 1;
    payEntry.totalAmount += tx.finalAmount || 0;
    paymentMap.set(methodLabel, payEntry);

    (tx.items || []).forEach((item) => {
      const prod = productMap.get(item.productId);
      const itemCogs = getItemFifoCogs(item, prod);
      const units = (item.quantity || 0) * (item.conversionFactor || 1);
      const rev = item.totalAmount || 0;

      totalFifoCogs += itemCogs;
      totalUnitsSold += units;

      const existing = topProductMap.get(item.productId) || {
        productName: item.productName || prod?.name || 'Produk',
        unitsSold: 0,
        baseUnit: prod?.baseUnit || item.unitName || 'PCS',
        revenue: 0,
        profit: 0,
      };
      existing.unitsSold += units;
      existing.revenue += rev;
      existing.profit += rev - itemCogs;
      topProductMap.set(item.productId, existing);
    });
  });

  const grossProfit = totalNetRevenue - totalFifoCogs;
  const grossMarginPercent = totalNetRevenue > 0 ? (grossProfit / totalNetRevenue) * 100 : 0;

  let todayExpenses = 0;
  let todayOtherIncome = 0;
  cashflows.forEach((cf) => {
    const cfDateKey = cf.date || getLocalDateKey(new Date(cf.timestamp));
    if (cfDateKey !== targetDateKey) return;
    if (cf.type === 'PENGELUARAN') {
      if (cf.isCashWithdrawalOutflow || cf.category === 'Tarik Tunai (Kas Keluar)') return;
      todayExpenses += cf.amount || 0;
    }
    if (cf.type === 'PEMASUKAN') {
      if (cf.isCashWithdrawalAdminProfit || cf.category === 'Keuntungan Biaya Admin (Tarik Tunai)') return;
      todayOtherIncome += cf.amount || 0;
    }
  });

  const netProfit = grossProfit + todayOtherIncome - todayExpenses;

  const paymentBreakdown = Array.from(paymentMap.entries())
    .map(([method, val]) => ({ method, count: val.count, totalAmount: val.totalAmount }))
    .sort((a, b) => b.totalAmount - a.totalAmount);

  const topProducts = Array.from(topProductMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const parsedDate = new Date(`${targetDateKey}T00:00:00`);
  const formattedDate = !isNaN(parsedDate.getTime())
    ? formatDateOnly(parsedDate.getTime())
    : targetDateKey;

  return {
    dateKey: targetDateKey,
    formattedDate,
    transactionCount: dayTxs.length,
    totalUnitsSold,
    grossSubtotal,
    totalAllDiscounts,
    totalNetRevenue,
    totalFifoCogs,
    grossProfit,
    grossMarginPercent,
    todayExpenses,
    todayOtherIncome,
    netProfit,
    piutangCreatedCount,
    piutangCreatedAmount,
    paymentBreakdown,
    topProducts,
  };
}

export function buildDailySalesClosingWhatsAppMessage(params: {
  storeName?: string;
  summary: DailySalesClosingSummary;
  schedule: DailySalesReportScheduleConfig;
  timestamp?: number;
}): string {
  const { storeName, summary, schedule, timestamp = Date.now() } = params;
  const scheduleLabel = formatDailySalesScheduleSummaryLabel(schedule);

  const lines: string[] = [];
  lines.push(`📊 *LAPORAN PENUTUPAN PENJUALAN HARIAN*`);
  lines.push(`🏪 *${storeName || 'TOKO BERKAH JAYA'}*`);
  lines.push(`📅 Tanggal: ${summary.formattedDate}`);
  lines.push(`🕒 Jam Tutup & Interval: ${scheduleLabel}`);
  lines.push(`⏱️ Waktu Kirim: ${formatDateTime(timestamp)}`);
  lines.push(`--------------------------------`);

  if (summary.transactionCount === 0) {
    lines.push(`Total Transaksi : *0 Nota*`);
    lines.push(`Total Omzet     : *Rp 0*`);
    if (schedule.includeExpenseSummary !== false && summary.todayExpenses > 0) {
      lines.push(`Pengeluaran Hari Ini : -${formatRupiah(summary.todayExpenses)}`);
    }
    lines.push(`--------------------------------`);
    lines.push(`Belum ada transaksi tercatat hingga jam tutup toko.`);
    lines.push(`_Laporan penutupan otomatis KasirKu POS._`);
    return lines.join('\n');
  }

  lines.push(`Total Transaksi  : *${formatNumber(summary.transactionCount)} Nota*`);
  lines.push(`Total Unit Terjual: ${formatNumber(summary.totalUnitsSold)} unit`);
  lines.push(`Subtotal Kotor   : ${formatRupiah(summary.grossSubtotal)}`);
  if (summary.totalAllDiscounts > 0) {
    lines.push(`Diskon & Poin    : -${formatRupiah(summary.totalAllDiscounts)}`);
  }
  lines.push(`💵 *OMZET BERSIH  : ${formatRupiah(summary.totalNetRevenue)}*`);

  if (schedule.includeProfitSummary !== false) {
    lines.push(`HPP (FIFO)       : -${formatRupiah(summary.totalFifoCogs)}`);
    lines.push(
      `📈 *LABA KOTOR    : ${formatRupiah(summary.grossProfit)}* (${summary.grossMarginPercent.toFixed(1)}%)`
    );
  }

  if (schedule.includeExpenseSummary !== false && (summary.todayExpenses > 0 || summary.todayOtherIncome > 0)) {
    if (summary.todayOtherIncome > 0) {
      lines.push(`Pemasukan Lain   : +${formatRupiah(summary.todayOtherIncome)}`);
    }
    if (summary.todayExpenses > 0) {
      lines.push(`Biaya Cashflow   : -${formatRupiah(summary.todayExpenses)}`);
    }
    lines.push(`💰 *LABA BERSIH   : ${formatRupiah(summary.netProfit)}*`);
  }

  if (summary.piutangCreatedCount > 0) {
    lines.push(
      `⏳ Piutang Baru Hari Ini: ${formatNumber(summary.piutangCreatedCount)} nota (${formatRupiah(summary.piutangCreatedAmount)})`
    );
  }

  if (schedule.includePaymentBreakdown !== false && summary.paymentBreakdown.length > 0) {
    lines.push('');
    lines.push(`💳 *Rincian Metode Bayar:*`);
    summary.paymentBreakdown.forEach((pm) => {
      lines.push(`• ${pm.method}: ${formatNumber(pm.count)} nota (${formatRupiah(pm.totalAmount)})`);
    });
  }

  if (schedule.includeTopProducts !== false && summary.topProducts.length > 0) {
    lines.push('');
    lines.push(`🏆 *Produk Terlaris Hari Ini:*`);
    summary.topProducts.forEach((p, idx) => {
      lines.push(
        `${idx + 1}. *${p.productName}* — ${formatNumber(p.unitsSold)} ${p.baseUnit} (${formatRupiah(p.revenue)})`
      );
    });
  }

  lines.push('');
  lines.push(`--------------------------------`);
  lines.push(`_Laporan penutupan otomatis KasirKu POS._`);

  return lines.join('\n');
}
