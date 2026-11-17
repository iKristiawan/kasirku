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

export type ProductType = 'BARANG' | 'JASA';

export interface ProductVariant {
  id: string;
  name: string; // e.g. 'Cokelat', 'Keju', 'Vanilla', 'Merah', 'XL'
  sku?: string;
  barcode?: string;
  price?: number; // Specific selling price for this variant
  priceAdjustment?: number; // Price difference / modifier
}

export interface ProductBatch {
  id: string; // Unique batch ID e.g. 'batch_1730000_abc'
  batchNumber: string; // e.g. 'BATCH-001' or purchase invoice #
  receivedAt: number; // Unix timestamp in ms
  receivedDate: string; // YYYY-MM-DD
  expiryDate?: string; // YYYY-MM-DD
  initialQuantity: number; // Initial received quantity in atomic base unit
  remainingQuantity: number; // Current unsold quantity in atomic base unit
  costPrice: number; // Cost price per atomic base unit for this batch
  supplierName?: string;
  purchaseOrderId?: string;
}

export interface BatchDeduction {
  batchId: string;
  batchNumber?: string;
  quantity: number; // in base units
  costPrice: number; // per base unit
  expiryDate?: string;
}

export interface Product {
  id: string;
  barcode: string; // Primary identifier / barcode / SKU
  sku?: string; // Explicit SKU (Stock Keeping Unit)
  name: string;
  category: string;
  categoryId?: string;
  categoryColor?: string;
  productType?: ProductType; // 'BARANG' (default barang fisik) | 'JASA' (layanan / service)
  baseUnit: string; // The primary atomic unit, e.g., 'PCS' or 'KG' (or 'SESI', 'JAM', 'PAKET' for jasa)
  stockInBaseUnit: number; // Stored in base units (treated as unlimited for jasa)
  minStockAlert: number;
  costPrice: number; // Cost price per base unit or operational cost / komisi
  supplierId?: string; // Optional linked supplier ID
  units: ProductUnit[]; // Multi-satuan array (always includes 1 unit that represents the base unit)
  variants?: ProductVariant[]; // Daftar varian produk (Rasa, Warna, Ukuran, dll.)
  variantLabel?: string; // Label tipe varian, misal: 'Rasa', 'Ukuran', 'Warna'
  imageUrl?: string;
  serviceDurationMinutes?: number; // Optional duration e.g. 30, 60 mins
  technicianName?: string; // Optional default technician / officer
  serviceNotes?: string; // Additional service notes
  expiryDate?: string; // Tanggal Kadaluarsa (YYYY-MM-DD)
  batches?: ProductBatch[]; // FIFO / FEFO inventory stock batches
  customerPrices?: CustomerSpecialPrice[]; // Harga jual khusus per kategori pelanggan
}

export interface CustomerSpecialPrice {
  id: string;
  customerCategory: string; // Misal 'UMUM', 'REGULER', 'MEMBER', 'VIP', 'RESELLER', 'GROSIR'
  price: number; // Harga jual khusus untuk kategori pelanggan ini
  unitName?: string; // Satuan spesifik (opsional jika multi-satuan, default satuan dasar)
  minQuantity?: number; // Syarat minimal jumlah pembelian (x satuan) agar harga khusus berlaku untuk jumlah tersebut dan selanjutnya (default: 1)
  notes?: string;
}

export interface CustomerCategoryItem {
  id: string;
  name: string; // Nama kategori pelanggan (e.g. 'UMUM', 'REGULER', 'MEMBER', 'VIP', 'RESELLER', 'GROSIR')
  color?: string; // Tema warna (purple, sky, emerald, amber, blue, rose, slate)
  description?: string;
  isSystemDefault?: boolean;
  createdAt?: string;
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
  membershipId?: string; // ID keanggotaan unik untuk kartu & pemindaian QR Member saat checkout
  customerCategory?: string; // Kategori pelanggan: UMUM | REGULER | MEMBER | VIP | RESELLER | GROSIR dll.
  isMember?: boolean; // Status member resmi: hanya member yang berhak mendapatkan & menukar poin
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

export type PaymentMethodType = 'CASH' | 'QRIS' | 'BANK_TRANSFER' | 'CARD' | 'PIUTANG' | 'OTHER';

export interface CustomPaymentMethod {
  id: string;
  name: string; // e.g., 'QRIS Toko Berkah', 'QRIS Mandiri Statis', 'Transfer Bank BRI'
  type: PaymentMethodType;
  isActive: boolean;
  isDefault?: boolean;
  qrisImageUrl?: string; // Static QRIS JPG file as Base64 data URL
  qrisImageName?: string; // Original uploaded file name e.g. 'qris_toko.jpg'
  accountNumber?: string; // e.g. NMID, Nomor Rekening, atau EDC Terminal
  accountName?: string; // e.g. Nama Merchant atau Nama Pemilik Rekening
  description?: string; // Instruksi tambahan kasir / pelanggan
  createdAt?: string;
}

export type PaymentMethod = 'CASH' | 'QRIS_BCA' | 'EDC_BCA' | 'TRANSFER_BCA' | 'PIUTANG' | string;

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
  isService?: boolean;
  isQuickSale?: boolean;
  serviceNotes?: string;
  selectedVariant?: string; // Varian terpilih misal: 'Cokelat' atau 'XL'
  isCustomPrice?: boolean;
  originalUnitPrice?: number;
  isCustomerSpecialPrice?: boolean;
  customerPriceCategory?: string;
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
  isService?: boolean;
  isQuickSale?: boolean;
  serviceNotes?: string;
  selectedVariant?: string; // Varian terpilih misal: 'Cokelat' atau 'XL'
  batchDeductions?: BatchDeduction[]; // Audit trail of FIFO batches deducted for this sale
  isCustomerSpecialPrice?: boolean;
  customerPriceCategory?: string;
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
  customerCategory?: string; // Kategori pelanggan saat transaksi berlangsung
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
  notes?: string; // Catatan transaksi / permintaan khusus pelanggan atau keterangan internal
  auditLogs?: TransactionAuditLogEntry[]; // Riwayat audit perubahan invoice pasca-transaksi oleh Admin
  customerRating?: number; // Penilaian kepuasan pelanggan (1-5 bintang) pada struk digital
  customerRatingTags?: string[]; // Tag cepat penilaian kualitas layanan
  customerRatingComment?: string; // Ulasan/masukan singkat pelanggan
  customerRatedAt?: number; // Timestamp (ms) saat penilaian kepuasan dikirim
  customerRatingChannel?: 'RECEIPT_MODAL' | 'DIGITAL_LINK'; // Sumber penilaian struk digital
  items: TransactionItem[];
}

export interface TransactionAuditChange {
  field: string;
  label: string;
  oldValue: string;
  newValue: string;
}

export interface TransactionAuditLogEntry {
  id: string;
  timestamp: number;
  editedByUserId: string;
  editedByName: string;
  editedByRole: UserRole;
  reason?: string;
  changes: TransactionAuditChange[];
}

export interface CategorySalesGoal {
  daily: number;
  weekly: number;
  monthly: number;
}

export type LowStockScheduleFrequency = 'DAILY' | 'WEEKLY' | 'DAYS_OF_WEEK';

export interface LowStockReportScheduleConfig {
  enabled: boolean;
  frequency: LowStockScheduleFrequency;
  time: string; // HH:mm (24-jam)
  daysOfWeek: number[]; // 0 = Minggu ... 6 = Sabtu
  sendEvenIfAllSafe?: boolean;
  includeOutOfStockSummary?: boolean;
}

export interface StoreSettings {
  storeName: string;
  storeAddress: string;
  storePhone?: string;
  storeHeaderReceipt?: string; // Custom header message printed on thermal receipt
  storeFooterReceipt: string; // Custom 2-line Receipt Footer printed at the bottom of all receipts
  storeLogo?: string; // Base64 data URL or image URL for thermal receipt header
  showLogoOnReceipt?: boolean; // Whether logo is enabled on thermal receipt
  manualOfflineMode?: boolean; // Manual offline toggle to pause Firebase synchronization
  dailySalesGoal?: number; // Target penjualan harian toko dalam Rupiah (e.g. 5000000)
  weeklySalesGoal?: number; // Target penjualan mingguan toko dalam Rupiah (e.g. 30000000)
  monthlySalesGoal?: number; // Target penjualan bulanan toko dalam Rupiah (e.g. 120000000)
  categorySalesGoals?: Record<string, CategorySalesGoal>; // Target penjualan harian, mingguan & bulanan per kategori produk
  // Auto WhatsApp notification settings
  autoSendWhatsAppReceipt?: boolean; // Kirim notifikasi WhatsApp otomatis saat transaksi berhasil
  includeReceiptSummaryInAutoWa?: boolean; // Sertakan link ringkasan transaksi dalam notifikasi WA
  includeLoyaltyPointsInAutoWa?: boolean; // Sertakan info poin loyalitas member dalam notifikasi WA
  useCustomWhatsAppTemplate?: boolean; // Aktifkan template pesan WhatsApp kustom untuk struk
  customWhatsAppTemplate?: string; // Template kustom pesan WhatsApp struk dengan placeholder
  // Automated Admin Low-Stock WhatsApp Alert Settings
  autoAdminLowStockWhatsApp?: boolean; // Otomatis kirim WA ke Admin jika beberapa produk menyentuh stok minimum dalam 1 hari
  adminWhatsAppNumber?: string; // Nomor WhatsApp Admin/Owner penerima alert stok minimum
  adminLowStockTriggerCount?: number; // Jumlah minimum produk berbeda dalam 1 hari untuk memicu alert WA (default: 2)
  useCustomLowStockWhatsAppTemplate?: boolean; // Aktifkan template pesan WhatsApp kustom untuk alert stok menipis
  customLowStockWhatsAppTemplate?: string; // Template kustom pesan WhatsApp alert stok menipis dengan placeholder
  scheduledAdminLowStockWhatsApp?: LowStockReportScheduleConfig; // Jadwal pengiriman otomatis laporan stok rendah via WhatsApp ke Admin
  // Printer connection settings
  printerConnectionType?: 'BLUETOOTH' | 'USB'; // Mode koneksi printer thermal
  printerPaperWidth?: '58mm' | '80mm'; // Lebar kertas thermal
  printerDeviceName?: string; // Nama perangkat printer tersimpan
  printerAutoCut?: boolean; // Potong kertas otomatis setelah cetak (untuk printer yang mendukung)
  autoPrintReceipt?: boolean; // Otomatis cetak struk segera setelah transaksi pembayaran berhasil
  requireTransactionNote?: boolean; // Wajibkan prompt Catatan Transaksi sebelum menyelesaikan penjualan
  // Loyalty point settings
  enablePoints: boolean;
  spendPerPoint: number; // Nominal belanja "x" Rupiah untuk mendapatkan "y" poin (e.g. Rp 10.000)
  pointsPerSpend?: number; // Jumlah "y" poin yang didapat per kelipatan belanja "x" Rupiah (default: 1)
  pointValueRupiah: number; // e.g. 1 point = Rp 100 discount
  autoApplyMaxPoints?: boolean; // Otomatis tukar poin maksimal jika member memiliki poin cukup saat checkout
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
  // Static QRIS store settings
  qrisImageUrl?: string; // Static QR Code URL / Base64 image
  qrisImageName?: string;
  qrisNmid?: string;
  // Custom Payment Methods (including Static QRIS JPGs)
  customPaymentMethods?: CustomPaymentMethod[];
  // Customer-Facing Online Storefront Settings
  onlineStoreEnabled?: boolean;
  onlineStoreTagline?: string;
  onlineStoreHours?: string;
  onlineStoreDeliveryFee?: number;
  onlineStoreMinFreeDelivery?: number;
  onlineStorePickupEnabled?: boolean;
  onlineStoreDeliveryEnabled?: boolean;
  // Dashboard Chart Color Theme Settings
  chartTheme?: ChartColorThemeConfig;
}

export interface ChartColorCustomPalette {
  primary: string;
  secondary: string;
  positive: string;
  warning: string;
  danger: string;
  neutral: string;
}

export interface ChartColorThemeConfig {
  themeId: string;
  customColors?: ChartColorCustomPalette;
}

export type OnlineOrderStatus =
  | 'MENUNGGU_KONFIRMASI'
  | 'DIPROSES'
  | 'SIAP_DIAMBIL'
  | 'DIKIRIM'
  | 'SELESAI'
  | 'DIBATALKAN';

export type OnlineOrderFulfillment = 'AMBIL_DI_TOKO' | 'KIRIM_KURIR';

export interface OnlineOrderItem {
  productId: string;
  productName: string;
  category: string;
  unitName: string;
  conversionFactor: number;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  selectedVariant?: string;
  isService?: boolean;
  imageUrl?: string;
}

export interface OnlineOrder {
  id: string;
  orderCode: string; // e.g. ONL-20261116-4821
  createdAt: number;
  updatedAt: number;
  customerName: string;
  customerWhatsapp: string;
  customerAddress?: string;
  customerNote?: string;
  membershipId?: string;
  fulfillmentType: OnlineOrderFulfillment;
  paymentMethodId: string;
  paymentMethodName: string;
  paymentMethodType: PaymentMethodType | 'COD';
  subtotal: number;
  deliveryFee: number;
  discount: number;
  totalAmount: number;
  status: OnlineOrderStatus;
  items: OnlineOrderItem[];
  linkedTransactionId?: string;
  linkedInvoiceNumber?: string;
  processedByName?: string;
  cancelReason?: string;
}

export interface RestockItem {
  productId: string;
  productName: string;
  unitName: string;
  conversionFactor: number;
  quantity: number;
  costPrice: number;
  total: number;
  expiryDate?: string; // Tanggal Kadaluarsa batch yang dibeli
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
  invoiceNumber?: string; // Nomor nota/surat jalan dari supplier
  paymentMethod?: 'CASH' | 'TRANSFER' | 'HUTANG';
  dueDate?: string; // Jatuh tempo jika hutang
  paidAmount?: number;
  createdAt?: number;
}

export type AttendanceStatus = 'PRESENT' | 'COMPLETED';

export type CashflowType = 'PENGELUARAN' | 'PEMASUKAN';

export interface CashflowRecord {
  id: string;
  type: CashflowType;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
  timestamp: number;
  paymentMethod: string; // 'CASH' | 'TRANSFER_BCA' | 'QRIS' | dll
  description: string;
  referenceNumber?: string; // No. Nota/Kuitansi
  recordedBy: string;
  recordedById?: string;
  createdAt: string;
}

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
