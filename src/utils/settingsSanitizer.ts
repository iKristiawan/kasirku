import { StoreSettings } from '../types/pos';

export const STORE_SETTINGS_LIMITS = {
  MAX_TOP_LEVEL_KEYS: 85,
  MAX_STORE_NAME: 160,
  MAX_STORE_ADDRESS: 500,
  MAX_STORE_PHONE: 80,
  MAX_HEADER_RECEIPT: 500,
  MAX_FOOTER_RECEIPT: 1000,
  MAX_ADMIN_WA: 80,
  MAX_LOGO_LENGTH: 550000,
  MAX_QRIS_IMAGE_LENGTH: 550000,
  MAX_DAILY_GOAL: 1_000_000_000_000,
  MAX_WEEKLY_GOAL: 1_000_000_000_000,
  MAX_MONTHLY_GOAL: 1_000_000_000_000,
  MIN_LOW_STOCK_TRIGGER: 1,
  MAX_LOW_STOCK_TRIGGER: 100,
  MAX_SPEND_PER_POINT: 1_000_000_000,
  MAX_POINTS_PER_SPEND: 100_000,
  MAX_POINT_VALUE_RUPIAH: 10_000_000,
  MAX_PAYMENT_METHODS: 25,
  MAX_STORE_UNITS: 50,
  MAX_STOCK_TRANSFERS: 100,
  MAX_CATEGORY_GOALS: 100,
  MAX_LOW_STOCK_SCHEDULE_KEYS: 15,
  MAX_DAILY_SALES_SCHEDULE_KEYS: 15,
  MAX_MEMBERSHIP_DISCOUNT_KEYS: 10,
  MAX_CHART_THEME_KEYS: 10,
  MAX_TAX_CONFIG_KEYS: 30,
  MAX_DOC_JSON_BYTES: 850000,
} as const;

const KNOWN_STORE_SETTINGS_KEYS = new Set<string>([
  'id',
  'storeName',
  'storeAddress',
  'storePhone',
  'storeHeaderReceipt',
  'storeFooterReceipt',
  'storeLogo',
  'showLogoOnReceipt',
  'manualOfflineMode',
  'dailySalesGoal',
  'weeklySalesGoal',
  'monthlySalesGoal',
  'categorySalesGoals',
  'autoSendWhatsAppReceipt',
  'includeReceiptSummaryInAutoWa',
  'includeLoyaltyPointsInAutoWa',
  'useCustomWhatsAppTemplate',
  'customWhatsAppTemplate',
  'autoAdminLowStockWhatsApp',
  'adminWhatsAppNumber',
  'adminLowStockTriggerCount',
  'useCustomLowStockWhatsAppTemplate',
  'customLowStockWhatsAppTemplate',
  'scheduledAdminLowStockWhatsApp',
  'scheduledDailySalesReportWhatsApp',
  'printerConnectionType',
  'printerPaperWidth',
  'printerDeviceName',
  'printerAutoCut',
  'autoPrintReceipt',
  'requireTransactionNote',
  'enablePoints',
  'spendPerPoint',
  'pointsPerSpend',
  'pointValueRupiah',
  'autoApplyMaxPoints',
  'enableMembershipDiscount',
  'membershipDiscounts',
  'bcaAccountNumber',
  'bcaAccountName',
  'bcaMerchantId',
  'qrisImageUrl',
  'qrisImageName',
  'qrisNmid',
  'customPaymentMethods',
  'onlineStoreEnabled',
  'onlineStoreTagline',
  'onlineStoreHours',
  'onlineStoreDeliveryFee',
  'onlineStoreMinFreeDelivery',
  'onlineStorePickupEnabled',
  'onlineStoreDeliveryEnabled',
  'chartTheme',
  'taxConfig',
  'storeUnits',
  'stockTransferRequests',
]);

function clampString(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

function clampNonNegNum(val: unknown, maxVal: number, fallback?: number): number | undefined {
  if (val === undefined || val === null || val === '') return fallback;
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0) return fallback ?? 0;
  return Math.min(num, maxVal);
}

function clampBoundedInt(val: unknown, minVal: number, maxVal: number, fallback: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(minVal, Math.min(maxVal, Math.floor(num)));
}

function slicePlainObject(val: unknown, maxKeys: number): Record<string, unknown> | undefined {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return undefined;
  const out: Record<string, unknown> = {};
  const entries = Object.entries(val as Record<string, unknown>).slice(0, maxKeys);
  for (const [k, v] of entries) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Guarantees that any StoreSettings payload sent to Firestore (`settings/store_config`)
 * strictly conforms to `firestore.rules` (`isValidStoreSettings`) and Firestore's 1 MiB doc limit.
 */
export function sanitizeStoreSettingsForFirestore(
  rawSettings: Partial<StoreSettings> & Record<string, any>,
  options?: { includeDocId?: boolean }
): Record<string, any> {
  const src = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const result: Record<string, any> = {};

  for (const key of Object.keys(src)) {
    if (!KNOWN_STORE_SETTINGS_KEYS.has(key)) continue;
    if (key === 'id' && !options?.includeDocId) continue;
    const val = src[key];
    if (val !== undefined) {
      result[key] = val;
    }
  }

  if (options?.includeDocId) {
    result.id = 'store_config';
  }

  const cleanName = typeof result.storeName === 'string' ? result.storeName.trim() : '';
  result.storeName = (cleanName || 'TOKO BERKAH JAYA').slice(0, STORE_SETTINGS_LIMITS.MAX_STORE_NAME);

  if (result.storeAddress !== undefined && result.storeAddress !== null) {
    result.storeAddress = clampString(String(result.storeAddress), STORE_SETTINGS_LIMITS.MAX_STORE_ADDRESS) ?? '';
  }
  if (result.storePhone !== undefined && result.storePhone !== null) {
    result.storePhone = clampString(String(result.storePhone), STORE_SETTINGS_LIMITS.MAX_STORE_PHONE) ?? '';
  }
  if (result.storeHeaderReceipt !== undefined && result.storeHeaderReceipt !== null) {
    result.storeHeaderReceipt = clampString(String(result.storeHeaderReceipt), STORE_SETTINGS_LIMITS.MAX_HEADER_RECEIPT) ?? '';
  }
  if (result.storeFooterReceipt !== undefined && result.storeFooterReceipt !== null) {
    result.storeFooterReceipt = clampString(String(result.storeFooterReceipt), STORE_SETTINGS_LIMITS.MAX_FOOTER_RECEIPT) ?? '';
  }
  if (result.adminWhatsAppNumber !== undefined && result.adminWhatsAppNumber !== null) {
    result.adminWhatsAppNumber = clampString(String(result.adminWhatsAppNumber), STORE_SETTINGS_LIMITS.MAX_ADMIN_WA) ?? '';
  }

  // Guard huge base64 data URLs from triggering PERMISSION_DENIED or >1MiB document size failures
  if (typeof result.storeLogo === 'string' && result.storeLogo.length > STORE_SETTINGS_LIMITS.MAX_LOGO_LENGTH) {
    console.warn(
      `[FirebaseSync] storeLogo terlalu besar (${result.storeLogo.length} chars > ${STORE_SETTINGS_LIMITS.MAX_LOGO_LENGTH}); dilewati pada payload cloud agar sinkronisasi pengaturan tetap berjalan.`
    );
    delete result.storeLogo;
  }
  if (typeof result.qrisImageUrl === 'string' && result.qrisImageUrl.length > STORE_SETTINGS_LIMITS.MAX_QRIS_IMAGE_LENGTH) {
    console.warn('[FirebaseSync] qrisImageUrl terlalu besar; dilewati pada payload cloud.');
    delete result.qrisImageUrl;
  }

  if (result.dailySalesGoal !== undefined) {
    result.dailySalesGoal = clampNonNegNum(result.dailySalesGoal, STORE_SETTINGS_LIMITS.MAX_DAILY_GOAL, 5_000_000);
  }
  if (result.weeklySalesGoal !== undefined) {
    result.weeklySalesGoal = clampNonNegNum(result.weeklySalesGoal, STORE_SETTINGS_LIMITS.MAX_WEEKLY_GOAL, 30_000_000);
  }
  if (result.monthlySalesGoal !== undefined) {
    result.monthlySalesGoal = clampNonNegNum(result.monthlySalesGoal, STORE_SETTINGS_LIMITS.MAX_MONTHLY_GOAL, 120_000_000);
  }
  if (result.adminLowStockTriggerCount !== undefined && result.adminLowStockTriggerCount !== null) {
    result.adminLowStockTriggerCount = clampBoundedInt(
      result.adminLowStockTriggerCount,
      STORE_SETTINGS_LIMITS.MIN_LOW_STOCK_TRIGGER,
      STORE_SETTINGS_LIMITS.MAX_LOW_STOCK_TRIGGER,
      2
    );
  }
  if (result.spendPerPoint !== undefined) {
    result.spendPerPoint = clampNonNegNum(result.spendPerPoint, STORE_SETTINGS_LIMITS.MAX_SPEND_PER_POINT, 10_000);
  }
  if (result.pointsPerSpend !== undefined) {
    result.pointsPerSpend = clampNonNegNum(result.pointsPerSpend, STORE_SETTINGS_LIMITS.MAX_POINTS_PER_SPEND, 1);
  }
  if (result.pointValueRupiah !== undefined) {
    result.pointValueRupiah = clampNonNegNum(result.pointValueRupiah, STORE_SETTINGS_LIMITS.MAX_POINT_VALUE_RUPIAH, 100);
  }
  if (result.onlineStoreDeliveryFee !== undefined) {
    result.onlineStoreDeliveryFee = clampNonNegNum(result.onlineStoreDeliveryFee, 100_000_000, 10_000);
  }
  if (result.onlineStoreMinFreeDelivery !== undefined) {
    result.onlineStoreMinFreeDelivery = clampNonNegNum(result.onlineStoreMinFreeDelivery, 1_000_000_000, 100_000);
  }

  if (Array.isArray(result.customPaymentMethods)) {
    result.customPaymentMethods = result.customPaymentMethods
      .slice(0, STORE_SETTINGS_LIMITS.MAX_PAYMENT_METHODS)
      .map((pm: any) => {
        if (!pm || typeof pm !== 'object') return pm;
        const copy = { ...pm };
        if (typeof copy.qrisImageUrl === 'string' && copy.qrisImageUrl.length > 350000) {
          delete copy.qrisImageUrl;
        }
        return copy;
      });
  } else if (result.customPaymentMethods !== undefined && result.customPaymentMethods !== null) {
    delete result.customPaymentMethods;
  }

  if (Array.isArray(result.storeUnits)) {
    result.storeUnits = result.storeUnits.slice(0, STORE_SETTINGS_LIMITS.MAX_STORE_UNITS);
  } else if (result.storeUnits !== undefined && result.storeUnits !== null) {
    delete result.storeUnits;
  }

  if (Array.isArray(result.stockTransferRequests)) {
    result.stockTransferRequests = result.stockTransferRequests.slice(0, STORE_SETTINGS_LIMITS.MAX_STOCK_TRANSFERS);
  } else if (result.stockTransferRequests !== undefined && result.stockTransferRequests !== null) {
    delete result.stockTransferRequests;
  }

  if (result.categorySalesGoals !== undefined && result.categorySalesGoals !== null) {
    result.categorySalesGoals = slicePlainObject(result.categorySalesGoals, STORE_SETTINGS_LIMITS.MAX_CATEGORY_GOALS) ?? {};
  }
  if (result.scheduledAdminLowStockWhatsApp !== undefined && result.scheduledAdminLowStockWhatsApp !== null) {
    result.scheduledAdminLowStockWhatsApp =
      slicePlainObject(result.scheduledAdminLowStockWhatsApp, STORE_SETTINGS_LIMITS.MAX_LOW_STOCK_SCHEDULE_KEYS) ?? {};
  }
  if (result.scheduledDailySalesReportWhatsApp !== undefined && result.scheduledDailySalesReportWhatsApp !== null) {
    result.scheduledDailySalesReportWhatsApp =
      slicePlainObject(result.scheduledDailySalesReportWhatsApp, STORE_SETTINGS_LIMITS.MAX_DAILY_SALES_SCHEDULE_KEYS) ?? {};
  }
  if (result.membershipDiscounts !== undefined && result.membershipDiscounts !== null) {
    result.membershipDiscounts =
      slicePlainObject(result.membershipDiscounts, STORE_SETTINGS_LIMITS.MAX_MEMBERSHIP_DISCOUNT_KEYS) ?? {};
  }
  if (result.chartTheme !== undefined && result.chartTheme !== null) {
    result.chartTheme = slicePlainObject(result.chartTheme, STORE_SETTINGS_LIMITS.MAX_CHART_THEME_KEYS);
    if (!result.chartTheme) delete result.chartTheme;
  }
  if (result.taxConfig !== undefined && result.taxConfig !== null) {
    result.taxConfig = slicePlainObject(result.taxConfig, STORE_SETTINGS_LIMITS.MAX_TAX_CONFIG_KEYS) ?? {};
  }

  // Final document payload byte guard (< 850KB) so combined images never hit Firestore 1 MiB limit
  try {
    let jsonLen = JSON.stringify(result).length;
    if (jsonLen > STORE_SETTINGS_LIMITS.MAX_DOC_JSON_BYTES && typeof result.storeLogo === 'string') {
      delete result.storeLogo;
      jsonLen = JSON.stringify(result).length;
    }
    if (jsonLen > STORE_SETTINGS_LIMITS.MAX_DOC_JSON_BYTES && typeof result.qrisImageUrl === 'string') {
      delete result.qrisImageUrl;
      jsonLen = JSON.stringify(result).length;
    }
    if (jsonLen > STORE_SETTINGS_LIMITS.MAX_DOC_JSON_BYTES && Array.isArray(result.customPaymentMethods)) {
      result.customPaymentMethods = result.customPaymentMethods.map((pm: any) => {
        if (!pm || typeof pm !== 'object') return pm;
        const { qrisImageUrl: _drop, ...rest } = pm;
        return rest;
      });
    }
  } catch {
    // ignore JSON length fallback
  }

  return result;
}
