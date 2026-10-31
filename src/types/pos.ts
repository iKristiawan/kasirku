export type UserRole = 'ADMIN' | 'STORE_MANAGER' | 'KARYAWAN';

export interface User {
  id: string;
  name: string;
  pin: string; // 4-digit PIN
  role: UserRole;
  avatarColor: string;
}

export interface ProductUnit {
  id: string;
  unitName: string; // e.g., 'PCS', 'PACK', 'DUS', 'RENCENG', 'KG', 'LITER'
  conversionFactor: number; // e.g., 1 for PCS, 10 for PACK (10 PCS), 40 for DUS (40 PCS)
  sellingPrice: number; // Price when sold in this unit
  costPrice?: number; // Estimated cost for this unit
  barcode?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  color: string; // Hex color code e.g. '#0284c7' or '#f59e0b'
  description?: string;
  icon?: string;
}

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  categoryId?: string;
  categoryColor?: string;
  baseUnit: string; // The primary atomic unit, e.g., 'PCS' or 'KG'
  stockInBaseUnit: number; // Always stored in atomic base units
  minStockAlert: number;
  costPrice: number; // Cost price per base unit
  units: ProductUnit[]; // Multi-satuan array (always includes 1 unit that represents the base unit)
  imageUrl?: string;
}

export type MembershipTier = 'REGULER' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  whatsapp: string;
  address: string;
  totalPoints: number;
  creditLimit: number; // Max debt limit allowed
  totalDebt: number; // Current unpaid debt
  membershipTier?: MembershipTier;
  notes?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  whatsapp: string;
  address: string;
  suppliedCategories: string[];
  createdAt: string;
}

export type PaymentMethod = 'CASH' | 'QRIS_BCA' | 'EDC_BCA' | 'TRANSFER_BCA' | 'PIUTANG';

export type PaymentStatus = 'LUNAS' | 'BELUM_LUNAS';

export interface CartItem {
  cartItemId: string;
  productId: string;
  productName: string;
  category: string;
  baseUnit: string;
  selectedUnit: ProductUnit;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  availableStockInUnits: number;
}

export interface TransactionItem {
  productId: string;
  productName: string;
  unitName: string;
  conversionFactor: number;
  quantity: number;
  unitPrice: number;
  costPrice?: number; // Cost price per base unit at time of sale
  totalAmount: number;
}

export interface Transaction {
  id: string;
  invoiceNumber: string;
  timestamp: number;
  cashierId: string;
  cashierName: string;
  cashierRole: UserRole;
  customerId?: string;
  customerName?: string;
  customerWhatsapp?: string;
  customerTier?: MembershipTier;
  subtotal: number;
  discount: number;
  membershipDiscountPercent?: number;
  membershipDiscountAmount?: number;
  pointsUsed: number;
  pointsDiscountAmount: number;
  pointsEarned: number;
  finalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  cashPaid?: number;
  cashChange?: number;
  bankApprovalCode?: string;
  bankRefNumber?: string;
  dueDate?: string; // If PIUTANG
  paidAt?: string; // When debt is settled
  settledPaymentMethod?: PaymentMethod;
  qrCodeDataUrl?: string; // Digital e-receipt QR code
  items: TransactionItem[];
}

export interface StoreSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeFooterReceipt: string;
  storeLogo?: string; // Base64 data URL or image URL for thermal receipt header
  showLogoOnReceipt?: boolean; // Whether logo is enabled on thermal receipt
  // Loyalty point settings
  enablePoints: boolean;
  spendPerPoint: number; // e.g. Rp 10.000 spent = 1 point
  pointValueRupiah: number; // e.g. 1 point = Rp 100 discount
  // Membership Tier Discounts (%)
  enableMembershipDiscount?: boolean;
  membershipDiscounts?: {
    silver: number; // e.g. 3%
    gold: number;   // e.g. 5%
    platinum: number; // e.g. 10%
  };
  // Bank BCA Info
  bcaAccountNumber: string;
  bcaAccountName: string;
  bcaMerchantId: string;
}

export interface RestockItem {
  productId: string;
  productName: string;
  unitName: string;
  conversionFactor: number;
  quantity: number;
  costPrice: number;
  total: number;
}

export interface RestockOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  supplierWhatsapp: string;
  date: string;
  items: RestockItem[];
  totalAmount: number;
  status: 'DRAFT' | 'SELESAI';
  notes?: string;
}

export type AttendanceStatus = 'PRESENT' | 'COMPLETED';

export interface AttendanceRecord {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  date: string; // YYYY-MM-DD
  checkInTime: string; // HH:mm:ss
  checkInTimestamp: number;
  checkOutTime?: string; // HH:mm:ss
  checkOutTimestamp?: number;
  durationMinutes?: number;
  notes?: string;
  status: AttendanceStatus;
}

export interface StockAlertNotification {
  id: string;
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  minThreshold: number;
  baseUnit: string;
  timestamp: number;
  read: boolean;
  type: 'WARNING' | 'CRITICAL_ZERO';
}

export interface StockOpnameItem {
  productId: string;
  productName: string;
  category: string;
  baseUnit: string;
  costPrice: number;
  systemStock: number;
  physicalStock: number;
  difference: number; // physicalStock - systemStock
  differenceValue: number; // difference * costPrice
  reason: string;
  notes?: string;
}

export interface StockOpnameRecord {
  id: string;
  sessionNumber: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  auditorName: string;
  auditorRole: UserRole;
  totalItemsAudited: number;
  totalDiscrepancies: number;
  totalDifferenceValue: number;
  generalReason: string;
  notes?: string;
  items: StockOpnameItem[];
}

export interface BackupPayload {
  app: string;
  version: string;
  exportedAt: string;
  timestamp: number;
  stats?: {
    productCount: number;
    customerCount: number;
    supplierCount: number;
    transactionCount: number;
    attendanceCount?: number;
    userCount: number;
    categoryCount?: number;
    stockOpnameCount?: number;
  };
  data: {
    products: Product[];
    customers: Customer[];
    suppliers: Supplier[];
    transactions: Transaction[];
    attendances?: AttendanceRecord[];
    storeSettings: StoreSettings;
    users?: User[];
    categories?: ProductCategory[];
    stockOpnames?: StockOpnameRecord[];
  };
}
