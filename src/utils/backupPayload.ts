import {
  Product,
  ProductCategory,
  CustomerCategoryItem,
  Customer,
  Supplier,
  RestockOrder,
  Transaction,
  CashflowRecord,
  AttendanceRecord,
  StockOpnameRecord,
  OnlineOrder,
  EmployeeActivityLog,
  TaxRecord,
  TaxAuditLog,
  TaxAdjustment,
  BalanceSheetEntry,
  StoreSettings,
  User,
  BackupPayload,
} from '../types/pos';

export interface BuildBackupPayloadInput {
  fileNamePrefix?: string;
  products: Product[];
  categories: ProductCategory[];
  customerCategories: CustomerCategoryItem[];
  customers: Customer[];
  suppliers: Supplier[];
  purchases: RestockOrder[];
  transactions: Transaction[];
  cashflows: CashflowRecord[];
  attendances: AttendanceRecord[];
  stockOpnames: StockOpnameRecord[];
  onlineOrders: OnlineOrder[];
  activityLogs: EmployeeActivityLog[];
  taxRecords: TaxRecord[];
  taxAuditLogs: TaxAuditLog[];
  taxAdjustments: TaxAdjustment[];
  balanceSheetEntries: BalanceSheetEntry[];
  storeSettings: StoreSettings;
  users: User[];
}

export function buildFullBackupPayload(input: BuildBackupPayloadInput): {
  fileName: string;
  payload: BackupPayload;
  dateFormatted: string;
} {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const prefix = input.fileNamePrefix || 'KasirKu-Backup';
  const fileName = `${prefix}-${dateStr}-${timeStr}.json`;

  const payload: BackupPayload = {
    app: 'Kasir Toko Tablet POS',
    version: '2.0',
    exportedAt: now.toISOString(),
    timestamp: now.getTime(),
    stats: {
      productCount: input.products.length,
      customerCount: input.customers.length,
      supplierCount: input.suppliers.length,
      purchaseCount: input.purchases.length,
      transactionCount: input.transactions.length,
      cashflowCount: input.cashflows.length,
      attendanceCount: input.attendances.length,
      userCount: input.users.length,
      categoryCount: input.categories.length,
      customerCategoryCount: input.customerCategories.length,
      stockOpnameCount: input.stockOpnames.length,
      onlineOrderCount: input.onlineOrders.length,
      activityLogCount: input.activityLogs.length,
      taxRecordCount: input.taxRecords.length,
      taxAuditLogCount: input.taxAuditLogs.length,
      taxAdjustmentCount: input.taxAdjustments.length,
      balanceSheetEntryCount: input.balanceSheetEntries.length,
    },
    data: {
      products: input.products,
      categories: input.categories,
      customerCategories: input.customerCategories,
      customers: input.customers,
      suppliers: input.suppliers,
      purchases: input.purchases,
      transactions: input.transactions,
      cashflows: input.cashflows,
      attendances: input.attendances,
      stockOpnames: input.stockOpnames,
      onlineOrders: input.onlineOrders,
      activityLogs: input.activityLogs,
      taxRecords: input.taxRecords,
      taxAuditLogs: input.taxAuditLogs,
      taxAdjustments: input.taxAdjustments,
      balanceSheetEntries: input.balanceSheetEntries,
      storeSettings: input.storeSettings,
      users: input.users,
    },
  };

  return {
    fileName,
    payload,
    dateFormatted: now.toLocaleString('id-ID', {
      dateStyle: 'full',
      timeStyle: 'short',
    }),
  };
}
