import { LowStockReportScheduleConfig, Product } from '../types/pos';
import { formatDateTime, formatNumber, formatWhatsAppUrl } from './formatters';

export const DAILY_LOW_STOCK_LEDGER_KEY = 'kasir_daily_admin_wa_low_stock_ledger';
export const SCHEDULED_LOW_STOCK_DISPATCH_KEY = 'kasir_scheduled_admin_wa_low_stock_dispatch';

export const DEFAULT_LOW_STOCK_SCHEDULE: LowStockReportScheduleConfig = {
  enabled: false,
  frequency: 'DAILY',
  time: '18:00',
  daysOfWeek: [1, 2, 3, 4, 5, 6],
  sendEvenIfAllSafe: false,
  includeOutOfStockSummary: true,
};

export interface ScheduledLowStockDispatchState {
  lastDispatchedSlotKey: string;
  lastDispatchedAt?: number;
  lastLowStockCount?: number;
}

export interface DailyLowStockHit {
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  minThreshold: number;
  baseUnit: string;
  hitAt: number;
}

export interface DailyLowStockLedger {
  date: string; // YYYY-MM-DD (local time)
  hits: DailyLowStockHit[];
  triggeredProductIds: string[];
  lastTriggeredAt?: number;
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function loadDailyLowStockLedger(dateKey: string = getLocalDateKey()): DailyLowStockLedger {
  try {
    const raw = localStorage.getItem(DAILY_LOW_STOCK_LEDGER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyLowStockLedger;
      if (parsed && parsed.date === dateKey && Array.isArray(parsed.hits)) {
        return {
          date: dateKey,
          hits: parsed.hits,
          triggeredProductIds: Array.isArray(parsed.triggeredProductIds)
            ? parsed.triggeredProductIds
            : [],
          lastTriggeredAt: parsed.lastTriggeredAt,
        };
      }
    }
  } catch {
    // Ignore storage read/parse failures
  }

  return {
    date: dateKey,
    hits: [],
    triggeredProductIds: [],
  };
}

export function saveDailyLowStockLedger(ledger: DailyLowStockLedger): void {
  try {
    localStorage.setItem(DAILY_LOW_STOCK_LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Ignore storage write failures
  }
}

export function resetDailyLowStockLedger(dateKey: string = getLocalDateKey()): DailyLowStockLedger {
  const emptyLedger: DailyLowStockLedger = {
    date: dateKey,
    hits: [],
    triggeredProductIds: [],
  };
  saveDailyLowStockLedger(emptyLedger);
  return emptyLedger;
}

/**
 * Records products that hit/crossed their minimum stock alert threshold today
 * and returns whether an automated Admin WhatsApp alert should fire.
 */
export function recordDailyLowStockHits(
  crossedProducts: Product[],
  allCurrentProducts: Product[],
  minTriggerCount: number = 2
): {
  ledger: DailyLowStockLedger;
  shouldTrigger: boolean;
  newlyRecordedCount: number;
} {
  const todayKey = getLocalDateKey();
  const ledger = loadDailyLowStockLedger(todayKey);

  // Build quick map of latest product data so existing hits reflect current stock
  const productMap = new Map<string, Product>();
  allCurrentProducts.forEach((p) => productMap.set(p.id, p));

  const hitsMap = new Map<string, DailyLowStockHit>();
  ledger.hits.forEach((hit) => {
    const latestProd = productMap.get(hit.productId);
    if (latestProd && (latestProd.productType || 'BARANG') !== 'JASA') {
      hitsMap.set(hit.productId, {
        ...hit,
        productName: latestProd.name,
        category: latestProd.category,
        currentStock: latestProd.stockInBaseUnit,
        minThreshold: latestProd.minStockAlert,
        baseUnit: latestProd.baseUnit,
      });
    } else {
      hitsMap.set(hit.productId, hit);
    }
  });

  const now = Date.now();
  let newlyRecordedCount = 0;

  crossedProducts.forEach((prod) => {
    if ((prod.productType || 'BARANG') === 'JASA') return;
    const existing = hitsMap.get(prod.id);
    if (!existing) {
      newlyRecordedCount += 1;
    }
    hitsMap.set(prod.id, {
      productId: prod.id,
      productName: prod.name,
      category: prod.category,
      currentStock: prod.stockInBaseUnit,
      minThreshold: prod.minStockAlert,
      baseUnit: prod.baseUnit,
      hitAt: existing?.hitAt || now,
    });
  });

  const updatedHits = Array.from(hitsMap.values()).sort((a, b) => {
    // Show out-of-stock (0) first, then lowest stock, then newest hit
    if (a.currentStock <= 0 && b.currentStock > 0) return -1;
    if (a.currentStock > 0 && b.currentStock <= 0) return 1;
    return b.hitAt - a.hitAt;
  });

  const updatedLedger: DailyLowStockLedger = {
    ...ledger,
    date: todayKey,
    hits: updatedHits,
  };

  saveDailyLowStockLedger(updatedLedger);

  const normalizedThreshold = Math.max(1, Math.floor(minTriggerCount || 2));
  const triggeredSet = new Set(updatedLedger.triggeredProductIds);
  const hasUntriggeredHit = updatedHits.some((h) => !triggeredSet.has(h.productId));
  const shouldTrigger = updatedHits.length >= normalizedThreshold && hasUntriggeredHit;

  return {
    ledger: updatedLedger,
    shouldTrigger,
    newlyRecordedCount,
  };
}

export function markDailyLowStockTriggered(
  productIds: string[],
  dateKey: string = getLocalDateKey()
): DailyLowStockLedger {
  const ledger = loadDailyLowStockLedger(dateKey);
  const mergedIds = Array.from(new Set([...ledger.triggeredProductIds, ...productIds]));
  const updated: DailyLowStockLedger = {
    ...ledger,
    triggeredProductIds: mergedIds,
    lastTriggeredAt: Date.now(),
  };
  saveDailyLowStockLedger(updated);
  return updated;
}

export function buildAdminWhatsAppUrl(rawPhone: string | undefined, message: string): string {
  const digits = (rawPhone || '').replace(/\D/g, '');
  if (digits.length >= 8) {
    return formatWhatsAppUrl(digits, message);
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
}

export const DEFAULT_LOW_STOCK_WHATSAPP_TEMPLATE = `⚠️ *PERINGATAN STOK MINIMUM HARIAN*
🏪 *{storeName}*
📅 Waktu: {dateTime}
--------------------------------
Hari ini terdapat *{hitCount} produk* yang menyentuh atau di bawah batas minimum stok:

{productList}

--------------------------------
Mohon segera lakukan pengecekan gudang & penjadwalan restock ke supplier.
_Notifikasi otomatis sistem KasirKu POS._`;

export const LOW_STOCK_WHATSAPP_PLACEHOLDERS = [
  { token: '{productName}', label: 'Nama Produk' },
  { token: '{currentStock}', label: 'Stok Saat Ini' },
  { token: '{minThreshold}', label: 'Batas Minimum' },
  { token: '{productNames}', label: 'Semua Nama Produk' },
  { token: '{stockLevels}', label: 'Ringkasan Stok Produk' },
  { token: '{productList}', label: 'Daftar Lengkap Produk & Stok' },
  { token: '{hitCount}', label: 'Jumlah Produk Alert' },
  { token: '{totalLowStockCount}', label: 'Total Stok Menipis' },
  { token: '{storeName}', label: 'Nama Toko' },
  { token: '{dateTime}', label: 'Waktu' },
] as const;

export function buildAdminLowStockWhatsAppMessage(params: {
  storeName?: string;
  hits: DailyLowStockHit[];
  totalLowStockProducts: number;
  timestamp?: number;
  useCustomTemplate?: boolean;
  customTemplate?: string;
}): string {
  const {
    storeName,
    hits,
    totalLowStockProducts,
    timestamp = Date.now(),
    useCustomTemplate = false,
    customTemplate,
  } = params;

  if (useCustomTemplate && customTemplate && customTemplate.trim().length > 0) {
    const primaryHit = hits[0];
    const productNamesText = hits.map((h) => h.productName).join(', ') || '-';
    const stockLevelsText =
      hits
        .map(
          (h) =>
            `${h.productName} (${formatNumber(h.currentStock)} ${h.baseUnit})`
        )
        .join(', ') || '-';
    const productListText =
      hits
        .map((item, idx) => {
          const statusLabel = item.currentStock <= 0 ? 'HABIS (0)' : 'MENIPIS';
          return `${idx + 1}. *${item.productName}* [${statusLabel}]\n   • Sisa Stok: ${formatNumber(item.currentStock)} ${item.baseUnit} (Batas Min: ${formatNumber(item.minThreshold)} ${item.baseUnit})`;
        })
        .join('\n') || '-';

    return customTemplate
      .replace(/\{storeName\}/g, storeName || 'TOKO BERKAH JAYA')
      .replace(/\{dateTime\}/g, formatDateTime(timestamp))
      .replace(/\{hitCount\}/g, String(hits.length))
      .replace(/\{totalLowStockCount\}/g, String(totalLowStockProducts))
      .replace(/\{productNames\}/g, productNamesText)
      .replace(/\{stockLevels\}/g, stockLevelsText)
      .replace(/\{productList\}/g, productListText)
      .replace(/\{productName\}/g, primaryHit ? primaryHit.productName : '-')
      .replace(
        /\{currentStock\}/g,
        primaryHit ? `${formatNumber(primaryHit.currentStock)} ${primaryHit.baseUnit}` : '0'
      )
      .replace(
        /\{minThreshold\}/g,
        primaryHit ? `${formatNumber(primaryHit.minThreshold)} ${primaryHit.baseUnit}` : '0'
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const lines: string[] = [];

  lines.push(`⚠️ *PERINGATAN STOK MINIMUM HARIAN*`);
  lines.push(`🏪 *${storeName || 'TOKO BERKAH JAYA'}*`);
  lines.push(`📅 Waktu: ${formatDateTime(timestamp)}`);
  lines.push(`--------------------------------`);
  lines.push(
    `Hari ini terdapat *${hits.length} produk* yang menyentuh atau di bawah batas minimum stok:`
  );
  lines.push('');

  hits.forEach((item, idx) => {
    const statusLabel = item.currentStock <= 0 ? 'HABIS (0)' : 'MENIPIS';
    lines.push(`${idx + 1}. *${item.productName}* [${statusLabel}]`);
    lines.push(
      `   • Sisa Stok: ${formatNumber(item.currentStock)} ${item.baseUnit} (Batas Min: ${formatNumber(item.minThreshold)})`
    );
  });

  lines.push('');
  lines.push(`--------------------------------`);
  if (totalLowStockProducts > hits.length) {
    lines.push(
      `📊 Total seluruh produk stok menipis saat ini: *${totalLowStockProducts} produk*`
    );
  }
  lines.push(`Mohon segera lakukan pengecekan gudang & penjadwalan restock ke supplier.`);
  lines.push(`_Notifikasi otomatis sistem KasirKu POS._`);

  return lines.join('\n');
}

const WEEKDAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const WEEKDAY_SHORT_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function normalizeLowStockSchedule(
  raw?: Partial<LowStockReportScheduleConfig> | null
): LowStockReportScheduleConfig {
  const timeMatch = /^\d{2}:\d{2}$/.test((raw?.time || '').trim())
    ? (raw?.time || '18:00').trim()
    : '18:00';
  const [hhRaw, mmRaw] = timeMatch.split(':').map((v) => parseInt(v, 10));
  const hh = Number.isFinite(hhRaw) ? Math.min(23, Math.max(0, hhRaw)) : 18;
  const mm = Number.isFinite(mmRaw) ? Math.min(59, Math.max(0, mmRaw)) : 0;
  const normalizedTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

  const rawFreq = raw?.frequency;
  const frequency =
    rawFreq === 'DAILY' || rawFreq === 'WEEKLY' || rawFreq === 'DAYS_OF_WEEK'
      ? rawFreq
      : 'DAILY';

  const cleanDays = Array.isArray(raw?.daysOfWeek)
    ? Array.from(
        new Set(
          raw.daysOfWeek
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        )
      ).sort((a, b) => a - b)
    : [...DEFAULT_LOW_STOCK_SCHEDULE.daysOfWeek];

  return {
    enabled: Boolean(raw?.enabled),
    frequency,
    time: normalizedTime,
    daysOfWeek: cleanDays.length > 0 ? cleanDays : [1],
    sendEvenIfAllSafe: Boolean(raw?.sendEvenIfAllSafe),
    includeOutOfStockSummary:
      raw?.includeOutOfStockSummary !== undefined ? Boolean(raw.includeOutOfStockSummary) : true,
  };
}

export function loadScheduledLowStockDispatch(): ScheduledLowStockDispatchState {
  try {
    const raw = localStorage.getItem(SCHEDULED_LOW_STOCK_DISPATCH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ScheduledLowStockDispatchState;
      if (parsed && typeof parsed.lastDispatchedSlotKey === 'string') {
        return parsed;
      }
    }
  } catch {
    // Ignore storage read failures
  }
  return { lastDispatchedSlotKey: '' };
}

export function markScheduledLowStockDispatched(
  slotKey: string,
  lowStockCount: number
): ScheduledLowStockDispatchState {
  const nextState: ScheduledLowStockDispatchState = {
    lastDispatchedSlotKey: slotKey,
    lastDispatchedAt: Date.now(),
    lastLowStockCount: lowStockCount,
  };
  try {
    localStorage.setItem(SCHEDULED_LOW_STOCK_DISPATCH_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage write failures
  }
  return nextState;
}

export function resetScheduledLowStockDispatch(): ScheduledLowStockDispatchState {
  const emptyState: ScheduledLowStockDispatchState = { lastDispatchedSlotKey: '' };
  try {
    localStorage.removeItem(SCHEDULED_LOW_STOCK_DISPATCH_KEY);
  } catch {
    // Ignore storage remove failures
  }
  return emptyState;
}

function isDateMatchingScheduleDay(
  date: Date,
  schedule: LowStockReportScheduleConfig
): boolean {
  const day = date.getDay();
  if (schedule.frequency === 'DAILY') return true;
  if (schedule.frequency === 'WEEKLY') {
    const targetDay = schedule.daysOfWeek[0] ?? 1;
    return day === targetDay;
  }
  return schedule.daysOfWeek.includes(day);
}

export function formatScheduleSummaryLabel(
  rawSchedule?: Partial<LowStockReportScheduleConfig> | null
): string {
  const schedule = normalizeLowStockSchedule(rawSchedule);
  if (schedule.frequency === 'DAILY') {
    return `Harian · ${schedule.time}`;
  }
  if (schedule.frequency === 'WEEKLY') {
    const dayIdx = schedule.daysOfWeek[0] ?? 1;
    return `Setiap ${WEEKDAY_NAMES_ID[dayIdx]} · ${schedule.time}`;
  }
  const dayLabels = schedule.daysOfWeek.map((d) => WEEKDAY_SHORT_ID[d]).join(', ');
  return `${dayLabels} · ${schedule.time}`;
}

export function evaluateScheduledLowStockDue(
  rawSchedule?: Partial<LowStockReportScheduleConfig> | null,
  now: Date = new Date(),
  lastDispatchedSlotKey: string = ''
): {
  isDue: boolean;
  slotKey: string;
  schedule: LowStockReportScheduleConfig;
} {
  const schedule = normalizeLowStockSchedule(rawSchedule);
  const todayKey = getLocalDateKey(now);
  const slotKey = `${todayKey}@${schedule.time}`;

  if (!schedule.enabled) {
    return { isDue: false, slotKey, schedule };
  }

  if (!isDateMatchingScheduleDay(now, schedule)) {
    return { isDue: false, slotKey, schedule };
  }

  const [hh, mm] = schedule.time.split(':').map((v) => parseInt(v, 10));
  const dueToday = new Date(now);
  dueToday.setHours(hh, mm, 0, 0);

  const isDue = now.getTime() >= dueToday.getTime() && lastDispatchedSlotKey !== slotKey;
  return { isDue, slotKey, schedule };
}

export function getNextScheduledDispatchInfo(
  rawSchedule?: Partial<LowStockReportScheduleConfig> | null,
  now: Date = new Date(),
  lastDispatchedSlotKey: string = ''
): string {
  const schedule = normalizeLowStockSchedule(rawSchedule);
  if (!schedule.enabled) {
    return 'Jadwal nonaktif';
  }

  const [hh, mm] = schedule.time.split(':').map((v) => parseInt(v, 10));
  for (let offset = 0; offset <= 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hh, mm, 0, 0);

    if (!isDateMatchingScheduleDay(candidate, schedule)) continue;
    const slotKey = `${getLocalDateKey(candidate)}@${schedule.time}`;
    if (offset === 0 && (candidate.getTime() <= now.getTime() || lastDispatchedSlotKey === slotKey)) {
      continue;
    }

    if (offset === 0) return `Hari ini pukul ${schedule.time}`;
    if (offset === 1) return `Besok (${WEEKDAY_NAMES_ID[candidate.getDay()]}) pukul ${schedule.time}`;
    return `${WEEKDAY_NAMES_ID[candidate.getDay()]}, ${candidate.getDate()}/${candidate.getMonth() + 1} pukul ${schedule.time}`;
  }

  return `Pukul ${schedule.time}`;
}

export function collectLowStockHitsFromProducts(
  products: Product[],
  prioritizeOutOfStock: boolean = true
): DailyLowStockHit[] {
  const now = Date.now();
  const hits: DailyLowStockHit[] = products
    .filter(
      (p) =>
        (p.productType || 'BARANG') !== 'JASA' &&
        p.stockInBaseUnit <= p.minStockAlert
    )
    .map((p) => ({
      productId: p.id,
      productName: p.name,
      category: p.category || 'Umum',
      currentStock: p.stockInBaseUnit,
      minThreshold: p.minStockAlert,
      baseUnit: p.baseUnit,
      hitAt: now,
    }));

  hits.sort((a, b) => {
    if (prioritizeOutOfStock) {
      if (a.currentStock <= 0 && b.currentStock > 0) return -1;
      if (a.currentStock > 0 && b.currentStock <= 0) return 1;
    }
    const ratioA = a.minThreshold > 0 ? a.currentStock / a.minThreshold : a.currentStock;
    const ratioB = b.minThreshold > 0 ? b.currentStock / b.minThreshold : b.currentStock;
    if (ratioA !== ratioB) return ratioA - ratioB;
    return a.productName.localeCompare(b.productName);
  });

  return hits;
}

export function buildScheduledLowStockWhatsAppMessage(params: {
  storeName?: string;
  hits: DailyLowStockHit[];
  totalPhysicalProducts: number;
  schedule: LowStockReportScheduleConfig;
  timestamp?: number;
  useCustomTemplate?: boolean;
  customTemplate?: string;
}): string {
  const {
    storeName,
    hits,
    totalPhysicalProducts,
    schedule,
    timestamp = Date.now(),
    useCustomTemplate = false,
    customTemplate,
  } = params;

  const scheduleSummary = formatScheduleSummaryLabel(schedule);

  if (
    hits.length > 0 &&
    useCustomTemplate &&
    customTemplate &&
    customTemplate.trim().length > 0
  ) {
    const customBody = buildAdminLowStockWhatsAppMessage({
      storeName,
      hits,
      totalLowStockProducts: hits.length,
      timestamp,
      useCustomTemplate: true,
      customTemplate,
    });
    return `🗓️ *LAPORAN TERJADWAL (${scheduleSummary})*\n\n${customBody}`;
  }

  const outOfStockCount = hits.filter((h) => h.currentStock <= 0).length;
  const nearEmptyCount = hits.length - outOfStockCount;

  const lines: string[] = [];
  lines.push(`📋 *LAPORAN TERJADWAL STOK RENDAH*`);
  lines.push(`🏪 *${storeName || 'TOKO BERKAH JAYA'}*`);
  lines.push(`🗓️ Jadwal: ${scheduleSummary}`);
  lines.push(`📅 Waktu Kirim: ${formatDateTime(timestamp)}`);
  lines.push(`--------------------------------`);

  if (hits.length === 0) {
    lines.push(
      `✅ *SEMUA STOK AMAN*\nSeluruh *${formatNumber(totalPhysicalProducts)} produk barang* saat ini berada di atas batas minimum stok.`
    );
    lines.push(`--------------------------------`);
    lines.push(`_Laporan otomatis terjadwal KasirKu POS._`);
    return lines.join('\n');
  }

  lines.push(
    `Ringkasan saat ini: *${formatNumber(hits.length)} produk* memerlukan perhatian restock:`
  );
  if (schedule.includeOutOfStockSummary !== false && outOfStockCount > 0) {
    lines.push(
      `• Stok Habis (0): *${formatNumber(outOfStockCount)} produk*\n• Stok Menipis: *${formatNumber(nearEmptyCount)} produk*`
    );
  }
  lines.push('');

  const maxListed = 25;
  hits.slice(0, maxListed).forEach((item, idx) => {
    const statusLabel = item.currentStock <= 0 ? 'HABIS (0)' : 'MENIPIS';
    lines.push(`${idx + 1}. *${item.productName}* [${statusLabel}]`);
    lines.push(
      `   • Sisa: ${formatNumber(item.currentStock)} ${item.baseUnit} (Batas Min: ${formatNumber(item.minThreshold)})`
    );
  });

  if (hits.length > maxListed) {
    lines.push(`...dan *${formatNumber(hits.length - maxListed)} produk* lainnya di daftar stok rendah.`);
  }

  lines.push('');
  lines.push(`--------------------------------`);
  lines.push(`Mohon jadwalkan pemesanan ulang (PO) ke supplier sesuai kebutuhan.`);
  lines.push(`_Laporan otomatis terjadwal KasirKu POS._`);

  return lines.join('\n');
}
