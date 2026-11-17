import { Product, CustomerSpecialPrice, ProductUnit, Customer, StoreSettings } from '../types/pos';

export const DEFAULT_CUSTOMER_CATEGORIES = [
  'UMUM',
  'REGULER',
  'MEMBER',
  'VIP',
  'RESELLER',
  'GROSIR'
];

/**
 * Mendapatkan warna badge visual untuk kategori pelanggan
 */
export const getCustomerCategoryBadge = (category?: string, customColor?: string) => {
  const cat = (category || 'UMUM').toUpperCase();
  if (customColor) {
    switch (customColor.toLowerCase()) {
      case 'purple':
        return { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300', dot: 'bg-purple-500', label: cat };
      case 'sky':
      case 'cyan':
        return { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300', dot: 'bg-sky-500', label: cat };
      case 'emerald':
      case 'green':
        return { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-500', label: cat };
      case 'amber':
      case 'yellow':
        return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', dot: 'bg-amber-500', label: cat };
      case 'rose':
      case 'red':
        return { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300', dot: 'bg-rose-500', label: cat };
      case 'blue':
        return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', dot: 'bg-blue-500', label: cat };
      case 'indigo':
        return { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300', dot: 'bg-indigo-500', label: cat };
      default:
        break;
    }
  }

  switch (cat) {
    case 'VIP':
      return {
        bg: 'bg-purple-100',
        text: 'text-purple-800',
        border: 'border-purple-300',
        dot: 'bg-purple-500',
        label: 'VIP'
      };
    case 'RESELLER':
      return {
        bg: 'bg-sky-100',
        text: 'text-sky-800',
        border: 'border-sky-300',
        dot: 'bg-sky-500',
        label: 'RESELLER'
      };
    case 'GROSIR':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-800',
        border: 'border-emerald-300',
        dot: 'bg-emerald-500',
        label: 'GROSIR'
      };
    case 'MEMBER':
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-800',
        border: 'border-amber-300',
        dot: 'bg-amber-500',
        label: 'MEMBER'
      };
    case 'REGULER':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        dot: 'bg-blue-400',
        label: 'REGULER'
      };
    case 'UMUM':
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-200',
        dot: 'bg-slate-400',
        label: cat || 'UMUM'
      };
  }
};

/**
 * Mencari harga khusus pelanggan untuk produk, satuan tertentu, dan kuantiti pembelian.
 * Harga khusus HANYA TERPICU (berlaku) apabila kuantiti pembelian memenuhi syarat minQuantity (x satuan ke atas).
 * Jika ada beberapa tier (misal min 5 pcs dan min 10 pcs), tier tertinggi yang terpenuhi yang akan digunakan.
 */
export const findCustomerSpecialPrice = (
  product: Product,
  customerCategory?: string,
  selectedUnit?: ProductUnit,
  quantity: number = 1
): { specialPrice: number; rule: CustomerSpecialPrice } | null => {
  if (!customerCategory || !product.customerPrices || product.customerPrices.length === 0) {
    return null;
  }

  const cleanCategory = customerCategory.trim().toUpperCase();
  const unitName = selectedUnit?.unitName?.trim().toUpperCase();
  const conversionFactor = selectedUnit?.conversionFactor || 1;

  // Filter aturan khusus untuk kategori pelanggan ini
  const categoryRules = product.customerPrices.filter(
    (cp) => cp.customerCategory.trim().toUpperCase() === cleanCategory
  );
  if (categoryRules.length === 0) return null;

  // 1. Cek aturan yang cocok dengan satuan spesifik ini
  const unitSpecificRules = categoryRules.filter(
    (cp) => cp.unitName && cp.unitName.trim().toUpperCase() === unitName
  );

  // Aturan yang syarat kuantitinya terpenuhi (pemicu: quantity >= minQuantity)
  const eligibleUnitRules = unitSpecificRules.filter((cp) => {
    const requiredMin = cp.minQuantity !== undefined && cp.minQuantity > 0 ? cp.minQuantity : 1;
    return quantity >= requiredMin;
  });

  if (eligibleUnitRules.length > 0) {
    // Urutkan dari minQuantity terbesar ke terkecil untuk mendapatkan tier diskon terbaik yang terpenuhi
    eligibleUnitRules.sort((a, b) => (b.minQuantity || 1) - (a.minQuantity || 1));
    return {
      specialPrice: eligibleUnitRules[0].price,
      rule: eligibleUnitRules[0]
    };
  }

  // 2. Jika tidak ada aturan spesifik satuan yang terpenuhi, cek aturan satuan dasar (misal PCS)
  const baseRules = categoryRules.filter(
    (cp) => !cp.unitName || cp.unitName.trim().toUpperCase() === (product.baseUnit || 'PCS').toUpperCase()
  );

  // Konversi kuantiti saat ini ke satuan dasar
  const qtyInBaseUnits = quantity * conversionFactor;
  const eligibleBaseRules = baseRules.filter((cp) => {
    const requiredMin = cp.minQuantity !== undefined && cp.minQuantity > 0 ? cp.minQuantity : 1;
    return qtyInBaseUnits >= requiredMin;
  });

  if (eligibleBaseRules.length > 0) {
    eligibleBaseRules.sort((a, b) => (b.minQuantity || 1) - (a.minQuantity || 1));
    const bestRule = eligibleBaseRules[0];
    return {
      specialPrice: bestRule.price * conversionFactor,
      rule: bestRule
    };
  }

  return null;
};

/**
 * Mendapatkan informasi promo tier berikutnya yang belum tercapai (jika ada).
 * Berguna untuk menampilkan info/nudge upsell: "Beli X lagi untuk dapat harga khusus Rp Y".
 */
export const findUpcomingCustomerSpecialPrice = (
  product: Product,
  customerCategory?: string,
  selectedUnit?: ProductUnit,
  quantity: number = 1
): { nextRule: CustomerSpecialPrice; minQuantity: number; neededMore: number } | null => {
  if (!customerCategory || !product.customerPrices || product.customerPrices.length === 0) {
    return null;
  }

  const cleanCategory = customerCategory.trim().toUpperCase();
  const unitName = selectedUnit?.unitName?.trim().toUpperCase();

  const matchingRules = product.customerPrices.filter((cp) => {
    if (cp.customerCategory.trim().toUpperCase() !== cleanCategory) return false;
    const ruleUnit = (cp.unitName || product.baseUnit || 'PCS').toUpperCase();
    return ruleUnit === unitName;
  });

  // Cari aturan yang belum tercapai (minQuantity > quantity)
  const upcomingRules = matchingRules
    .filter((cp) => (cp.minQuantity || 1) > quantity)
    .sort((a, b) => (a.minQuantity || 1) - (b.minQuantity || 1));

  if (upcomingRules.length > 0) {
    const nextRule = upcomingRules[0];
    const minQty = nextRule.minQuantity || 1;
    return {
      nextRule,
      minQuantity: minQty,
      neededMore: minQty - quantity
    };
  }

  return null;
};

/**
 * Mengecek apakah pelanggan berstatus Member (berhak mendapatkan dan menukar poin).
 * Hanya pelanggan dengan status Member aktif yang memperoleh poin loyalitas saat bertransaksi.
 */
export const isCustomerMember = (customer?: Customer | null): boolean => {
  if (!customer) return false;
  if (typeof customer.isMember === 'boolean') {
    return customer.isMember;
  }
  const cat = (customer.customerCategory || '').trim().toUpperCase();
  if (cat === 'MEMBER' || cat === 'VIP') {
    return true;
  }
  if (customer.membershipTier && customer.membershipTier !== 'REGULER') {
    return true;
  }
  return false;
};

/**
 * Menghitung jumlah poin yang diperoleh berdasarkan aturan Admin:
 * Belanja setiap "x" Rupiah (spendPerPoint) mendapatkan "y" Poin (pointsPerSpend).
 * Poin HANYA diberikan jika fitur poin aktif dan pelanggan berstatus Member.
 */
export const calculatePointsEarned = (
  grandTotal: number,
  storeSettings?: StoreSettings | null,
  customer?: Customer | null
): number => {
  if (!storeSettings || !storeSettings.enablePoints) return 0;
  if (!isCustomerMember(customer)) return 0;

  const spendX = Number(storeSettings.spendPerPoint) || 0;
  const earnY = storeSettings.pointsPerSpend !== undefined ? Number(storeSettings.pointsPerSpend) : 1;

  if (spendX <= 0 || earnY <= 0 || grandTotal < spendX) return 0;

  return Math.floor(grandTotal / spendX) * earnY;
};

/**
 * Menghasilkan Membership ID unik baru yang ringkas dan mudah dibaca (contoh: MBR-M4X9P2A1).
 */
export const generateMembershipId = (): string => {
  const tsPart = Date.now().toString(36).slice(-5).toUpperCase();
  const randPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MBR-${tsPart}${randPart}`;
};

/**
 * Mengembalikan Membership ID unik milik pelanggan.
 * Jika belum tersimpan di dokumen pelanggan lama, otomatis diturunkan secara deterministik dari customer.id.
 */
export const getCustomerMembershipId = (customer: Customer): string => {
  if (customer.membershipId && customer.membershipId.trim()) {
    return customer.membershipId.trim().toUpperCase();
  }
  const cleanId = customer.id.replace(/^cust_/i, '').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
  return `MBR-${cleanId || '000'}`;
};

/**
 * Membuat payload string QR Code standar KasirKu untuk profil pelanggan.
 * Berisi membershipId dan customerId agar dapat dipindai instan saat checkout.
 */
export const buildCustomerQrPayload = (customer: Customer): string => {
  return JSON.stringify({
    type: 'KASIRKU_MEMBER',
    membershipId: getCustomerMembershipId(customer),
    customerId: customer.id,
  });
};

/**
 * Mengekstrak membershipId atau customerId dari hasil scan QR Code maupun input manual.
 * Mendukung format JSON payload KasirKu QR, prefix KASIRKU-MEMBER:, atau kode langsung (MBR-...).
 */
export const extractMembershipCodeFromScan = (
  rawInput: string
): { membershipId?: string; customerId?: string } | null => {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        type?: string;
        membershipId?: string;
        customerId?: string;
        id?: string;
      };
      if (parsed && (parsed.type === 'KASIRKU_MEMBER' || parsed.membershipId || parsed.customerId)) {
        return {
          membershipId: parsed.membershipId ? String(parsed.membershipId).trim().toUpperCase() : undefined,
          customerId: parsed.customerId
            ? String(parsed.customerId).trim()
            : parsed.id
            ? String(parsed.id).trim()
            : undefined,
        };
      }
    } catch {
      // Bukan JSON valid, lanjutkan ke pengecekan teks biasa
    }
  }

  const upper = trimmed.toUpperCase();
  const prefixes = ['KASIRKU-MEMBER:', 'KASIRKU_MEMBER:', 'MEMBER:', 'ID:'];
  for (const prefix of prefixes) {
    if (upper.startsWith(prefix)) {
      const code = trimmed.slice(prefix.length).trim();
      if (code) {
        return { membershipId: code.toUpperCase(), customerId: code };
      }
    }
  }

  return { membershipId: upper, customerId: trimmed };
};

/**
 * Mencocokkan hasil scan QR Code atau Membership ID ke daftar pelanggan toko.
 */
export const findCustomerByScanInput = (
  rawInput: string,
  customers: Customer[]
): Customer | null => {
  const extracted = extractMembershipCodeFromScan(rawInput);
  if (!extracted || customers.length === 0) return null;

  const targetMemId = extracted.membershipId?.toUpperCase();
  const targetCustId = extracted.customerId?.toLowerCase();

  for (const cust of customers) {
    const custMemId = getCustomerMembershipId(cust).toUpperCase();
    if (targetMemId && custMemId === targetMemId) {
      return cust;
    }
    if (targetCustId && cust.id.toLowerCase() === targetCustId) {
      return cust;
    }
    if (cust.membershipId && targetMemId && cust.membershipId.trim().toUpperCase() === targetMemId) {
      return cust;
    }
  }

  return null;
};
