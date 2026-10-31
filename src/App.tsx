import React, { useState, useEffect } from 'react';
import { 
  User, 
  Product, 
  ProductCategory,
  Customer, 
  Supplier, 
  Transaction, 
  StoreSettings, 
  CartItem, 
  ProductUnit, 
  PaymentMethod,
  RestockItem,
  BackupPayload,
  AttendanceRecord,
  StockOpnameRecord,
  MembershipTier
} from './types/pos';
import { 
  INITIAL_USERS, 
  INITIAL_PRODUCTS, 
  INITIAL_CATEGORIES,
  INITIAL_CUSTOMERS, 
  INITIAL_SUPPLIERS, 
  INITIAL_TRANSACTIONS, 
  INITIAL_STORE_SETTINGS,
  INITIAL_ATTENDANCES,
  INITIAL_STOCK_OPNAMES
} from './utils/mockData';
import { Navbar } from './components/Navbar';
import { TabletPOSView } from './components/TabletPOSView';
import { PaymentModal } from './components/PaymentModal';
import { ReceiptModal } from './components/ReceiptModal';
import { BarcodeScannerModal } from './components/BarcodeScannerModal';
import { CustomerModal } from './components/CustomerModal';
import { CustomerManagementView } from './components/CustomerManagementView';
import { ProductManagementView } from './components/ProductManagementView';
import { SupplierManagementView } from './components/SupplierManagementView';
import { PiutangManagementView } from './components/PiutangManagementView';
import { TransactionHistoryView } from './components/TransactionHistoryView';
import { SettingsView } from './components/SettingsView';
import { AttendanceView } from './components/AttendanceView';
import { UserSwitchModal } from './components/UserSwitchModal';
import { ShiftSummaryModal } from './components/ShiftSummaryModal';
import { StockThresholdSettingsModal } from './components/StockThresholdSettingsModal';
import { StockReportView } from './components/StockReportView';
import { DailyProfitLossView } from './components/DailyProfitLossView';
import { generateInvoiceNumber } from './utils/formatters';
import { sound } from './utils/audio';
import { 
  seedCollectionIfEmpty, 
  subscribeToCollection, 
  saveDocumentToFirestore, 
  deleteDocumentFromFirestore, 
  saveBatchToFirestore, 
  saveStoreSettingsToFirestore,
  CloudSyncStatus
} from './utils/firebaseSync';

export default function App() {
  // Persistent state helper
  const loadStorage = <T,>(key: string, fallback: T): T => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : fallback;
    } catch {
      return fallback;
    }
  };

  const saveStorage = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {}
  };

  // State
  const [users, setUsers] = useState<User[]>(() => loadStorage('kasir_users', INITIAL_USERS));
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = loadStorage<User | null>('kasir_active_user', null);
    return saved || users[2] || users[0]; // Default to Kasir or Admin
  });
  const [products, setProducts] = useState<Product[]>(() => loadStorage('kasir_products', INITIAL_PRODUCTS));
  const [categories, setCategories] = useState<ProductCategory[]>(() => loadStorage('kasir_categories', INITIAL_CATEGORIES));
  const [customers, setCustomers] = useState<Customer[]>(() => loadStorage('kasir_customers', INITIAL_CUSTOMERS));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadStorage('kasir_suppliers', INITIAL_SUPPLIERS));
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadStorage('kasir_transactions', INITIAL_TRANSACTIONS));
  const [attendances, setAttendances] = useState<AttendanceRecord[]>(() => loadStorage('kasir_attendances', INITIAL_ATTENDANCES));
  const [stockOpnames, setStockOpnames] = useState<StockOpnameRecord[]>(() => loadStorage('kasir_stock_opnames', INITIAL_STOCK_OPNAMES));
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => loadStorage('kasir_settings', INITIAL_STORE_SETTINGS));

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<string>('pos');

  // Cart State for POS
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [usePoints, setUsePoints] = useState<boolean>(false);

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [lastCompletedTransaction, setLastCompletedTransaction] = useState<Transaction | null>(null);
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isSwitchUserModalOpen, setIsSwitchUserModalOpen] = useState(false);
  const [isShiftSummaryModalOpen, setIsShiftSummaryModalOpen] = useState(false);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);

  // Cloud Sync state
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('CONNECTING');

  // Sync to localStorage
  useEffect(() => saveStorage('kasir_users', users), [users]);
  useEffect(() => saveStorage('kasir_active_user', currentUser), [currentUser]);
  useEffect(() => saveStorage('kasir_products', products), [products]);
  useEffect(() => saveStorage('kasir_categories', categories), [categories]);
  useEffect(() => saveStorage('kasir_customers', customers), [customers]);
  useEffect(() => saveStorage('kasir_suppliers', suppliers), [suppliers]);
  useEffect(() => saveStorage('kasir_transactions', transactions), [transactions]);
  useEffect(() => saveStorage('kasir_attendances', attendances), [attendances]);
  useEffect(() => saveStorage('kasir_stock_opnames', stockOpnames), [stockOpnames]);
  useEffect(() => saveStorage('kasir_settings', storeSettings), [storeSettings]);

  // Real-time Firestore Multi-Device Synchronization & Initial Seeding
  useEffect(() => {
    let active = true;

    const bootstrapAndListen = async () => {
      try {
        // 1. Seed base catalog if Firestore is empty on first device setup
        await seedCollectionIfEmpty('products', INITIAL_PRODUCTS);
        await seedCollectionIfEmpty('categories', INITIAL_CATEGORIES);
        await seedCollectionIfEmpty('customers', INITIAL_CUSTOMERS);
        await seedCollectionIfEmpty('suppliers', INITIAL_SUPPLIERS);
        await seedCollectionIfEmpty('users', INITIAL_USERS);
        await seedCollectionIfEmpty('settings', [{ ...INITIAL_STORE_SETTINGS, id: 'store_config' }]);
      } catch (err) {
        console.warn('[CloudSync] Seeding notice:', err);
      }
    };

    bootstrapAndListen();

    // 2. Real-time Listeners across all devices
    const unsubs = [
      subscribeToCollection<Product>('products', (cloudProds) => {
        if (!active) return;
        if (cloudProds.length > 0) setProducts(cloudProds);
        setCloudSyncStatus('SYNCED');
      }, () => setCloudSyncStatus('OFFLINE')),

      subscribeToCollection<ProductCategory>('categories', (cloudCats) => {
        if (!active) return;
        if (cloudCats.length > 0) setCategories(cloudCats);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<Customer>('customers', (cloudCusts) => {
        if (!active) return;
        if (cloudCusts.length > 0) setCustomers(cloudCusts);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<Supplier>('suppliers', (cloudSups) => {
        if (!active) return;
        if (cloudSups.length > 0) setSuppliers(cloudSups);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<Transaction>('transactions', (cloudTxs) => {
        if (!active) return;
        if (cloudTxs.length > 0) {
          setTransactions(cloudTxs.sort((a, b) => b.timestamp - a.timestamp));
        }
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<AttendanceRecord>('attendances', (cloudAtt) => {
        if (!active) return;
        if (cloudAtt.length > 0) setAttendances(cloudAtt);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<StockOpnameRecord>('stock_opnames', (cloudOpnames) => {
        if (!active) return;
        if (cloudOpnames.length > 0) setStockOpnames(cloudOpnames);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<User>('users', (cloudUsers) => {
        if (!active) return;
        if (cloudUsers.length > 0) setUsers(cloudUsers);
        setCloudSyncStatus('SYNCED');
      }),

      subscribeToCollection<any>('settings', (cloudSettingsList) => {
        if (!active) return;
        const cfg = cloudSettingsList.find((s) => s.id === 'store_config');
        if (cfg) {
          const { id, ...rest } = cfg;
          setStoreSettings(rest as StoreSettings);
        }
        setCloudSyncStatus('SYNCED');
      }),
    ];

    return () => {
      active = false;
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  // Keep selectedCustomer updated if customers list changes
  useEffect(() => {
    if (selectedCustomer) {
      const updated = customers.find((c) => c.id === selectedCustomer.id);
      if (updated) setSelectedCustomer(updated);
    }
  }, [customers]);

  // =========================================================================
  // CART ACTIONS & MULTI-SATUAN
  // =========================================================================
  const handleAddToCart = (product: Product, unit: ProductUnit, qtyToAdd = 1) => {
    sound.playTap();
    const existingIndex = cart.findIndex(
      (item) => item.productId === product.id && item.selectedUnit.id === unit.id
    );

    const maxUnits = Math.floor(product.stockInBaseUnit / unit.conversionFactor);

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      const newQty = updatedCart[existingIndex].quantity + qtyToAdd;
      if (newQty > maxUnits) {
        alert(`Stok tidak mencukupi! Maksimal ${maxUnits} ${unit.unitName}`);
        return;
      }
      updatedCart[existingIndex].quantity = newQty;
      updatedCart[existingIndex].subtotal = newQty * unit.sellingPrice;
      setCart(updatedCart);
    } else {
      if (qtyToAdd > maxUnits) {
        alert(`Stok tidak mencukupi! Maksimal ${maxUnits} ${unit.unitName}`);
        return;
      }
      const newItem: CartItem = {
        cartItemId: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        productId: product.id,
        productName: product.name,
        category: product.category,
        baseUnit: product.baseUnit,
        selectedUnit: unit,
        quantity: qtyToAdd,
        unitPrice: unit.sellingPrice,
        subtotal: qtyToAdd * unit.sellingPrice,
        availableStockInUnits: maxUnits,
      };
      setCart([...cart, newItem]);
    }
  };

  const handleUpdateCartItemQty = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveCartItem(cartItemId);
      return;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.cartItemId === cartItemId) {
          const product = products.find((p) => p.id === item.productId);
          const maxUnits = product
            ? Math.floor(product.stockInBaseUnit / item.selectedUnit.conversionFactor)
            : 9999;
          
          if (newQty > maxUnits) {
            alert(`Stok hanya tersisa ${maxUnits} ${item.selectedUnit.unitName}`);
            return item;
          }

          return {
            ...item,
            quantity: newQty,
            subtotal: newQty * item.unitPrice,
          };
        }
        return item;
      })
    );
  };

  const handleChangeCartItemUnit = (cartItemId: string, newUnit: ProductUnit) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartItemId === cartItemId) {
          return {
            ...item,
            selectedUnit: newUnit,
            unitPrice: newUnit.sellingPrice,
            subtotal: item.quantity * newUnit.sellingPrice,
          };
        }
        return item;
      })
    );
  };

  const handleRemoveCartItem = (cartItemId: string) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const handleClearCart = () => {
    setCart([]);
    setUsePoints(false);
  };

  // Barcode scanning resolution
  const handleBarcodeScanned = (scannedCode: string) => {
    // 1. Find product where base barcode or any unit barcode matches
    for (const product of products) {
      if (product.barcode === scannedCode) {
        handleAddToCart(product, product.units[0]);
        return;
      }
      for (const unit of product.units) {
        if (unit.barcode === scannedCode) {
          handleAddToCart(product, unit);
          return;
        }
      }
    }
    sound.playError();
    alert(`Barcode "${scannedCode}" tidak ditemukan di database produk toko.`);
  };

  // =========================================================================
  // FINANCIAL CALCULATIONS & REWARD POINTS
  // =========================================================================
  const subtotal = cart.reduce((acc, item) => acc + item.subtotal, 0);

  // Membership Tier Discount
  const customerTier: MembershipTier = selectedCustomer?.membershipTier || 'REGULER';
  const tierDiscountPercent = (storeSettings.enableMembershipDiscount && storeSettings.membershipDiscounts)
    ? (customerTier === 'SILVER'
        ? (storeSettings.membershipDiscounts.silver || 0)
        : customerTier === 'GOLD'
        ? (storeSettings.membershipDiscounts.gold || 0)
        : customerTier === 'PLATINUM'
        ? (storeSettings.membershipDiscounts.platinum || 0)
        : 0)
    : 0;

  const membershipDiscountAmount = tierDiscountPercent > 0
    ? Math.round((subtotal * tierDiscountPercent) / 100)
    : 0;

  const afterTierSubtotal = Math.max(0, subtotal - membershipDiscountAmount);

  const maxRedeemablePoints = selectedCustomer && storeSettings.enablePoints
    ? Math.min(
        selectedCustomer.totalPoints,
        Math.floor(afterTierSubtotal / storeSettings.pointValueRupiah)
      )
    : 0;

  const pointsUsed = usePoints ? maxRedeemablePoints : 0;
  const pointsDiscountAmount = pointsUsed * storeSettings.pointValueRupiah;
  const grandTotal = Math.max(0, afterTierSubtotal - pointsDiscountAmount);

  const pointsEarned = selectedCustomer && storeSettings.enablePoints && storeSettings.spendPerPoint > 0
    ? Math.floor(grandTotal / storeSettings.spendPerPoint)
    : 0;

  // =========================================================================
  // PAYMENT COMPLETION & INVENTORY DEDUCTION
  // =========================================================================
  const handleConfirmPayment = (paymentData: {
    paymentMethod: PaymentMethod;
    cashPaid?: number;
    cashChange?: number;
    bankApprovalCode?: string;
    bankRefNumber?: string;
    dueDate?: string;
    notes?: string;
  }) => {
    const invoiceNum = generateInvoiceNumber();

    // 1. Deduct Product Stock in Base Unit
    const updatedProducts = products.map((prod) => {
      let baseUnitsToDeduct = 0;
      cart.forEach((cartItem) => {
        if (cartItem.productId === prod.id) {
          baseUnitsToDeduct += cartItem.quantity * cartItem.selectedUnit.conversionFactor;
        }
      });
      if (baseUnitsToDeduct > 0) {
        return {
          ...prod,
          stockInBaseUnit: Math.max(0, prod.stockInBaseUnit - baseUnitsToDeduct),
        };
      }
      return prod;
    });
    setProducts(updatedProducts);

    // 2. Update Customer Points & Debt (if applicable)
    if (selectedCustomer) {
      const updatedCustomers = customers.map((c) => {
        if (c.id === selectedCustomer.id) {
          const newPoints = c.totalPoints - pointsUsed + pointsEarned;
          const newDebt =
            paymentData.paymentMethod === 'PIUTANG'
              ? c.totalDebt + grandTotal
              : c.totalDebt;
          return {
            ...c,
            totalPoints: Math.max(0, newPoints),
            totalDebt: newDebt,
          };
        }
        return c;
      });
      setCustomers(updatedCustomers);
    }

    // 3. Build Transaction Record
    const newTransaction: Transaction = {
      id: 'tx_' + Date.now(),
      invoiceNumber: invoiceNum,
      timestamp: Date.now(),
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      cashierRole: currentUser.role,
      customerId: selectedCustomer?.id,
      customerName: selectedCustomer?.name,
      customerWhatsapp: selectedCustomer?.whatsapp,
      customerTier,
      membershipDiscountPercent: tierDiscountPercent,
      membershipDiscountAmount,
      subtotal,
      discount: membershipDiscountAmount,
      pointsUsed,
      pointsDiscountAmount,
      pointsEarned,
      finalAmount: grandTotal,
      paymentMethod: paymentData.paymentMethod,
      paymentStatus: paymentData.paymentMethod === 'PIUTANG' ? 'BELUM_LUNAS' : 'LUNAS',
      cashPaid: paymentData.cashPaid,
      cashChange: paymentData.cashChange,
      bankApprovalCode: paymentData.bankApprovalCode,
      bankRefNumber: paymentData.bankRefNumber,
      dueDate: paymentData.dueDate,
      items: cart.map((item) => {
        const prod = products.find((p) => p.id === item.productId);
        return {
          productId: item.productId,
          productName: item.productName,
          unitName: item.selectedUnit.unitName,
          conversionFactor: item.selectedUnit.conversionFactor,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: prod?.costPrice || 0,
          totalAmount: item.subtotal,
        };
      }),
    };

    setTransactions([newTransaction, ...transactions]);
    setLastCompletedTransaction(newTransaction);
    setIsPaymentModalOpen(false);
    setIsReceiptModalOpen(true);
    setCart([]);
    setUsePoints(false);

    // Sync to Firestore Cloud Real-time
    saveDocumentToFirestore('transactions', newTransaction.id, newTransaction).catch(() => {});
    saveBatchToFirestore('products', updatedProducts).catch(() => {});
    if (selectedCustomer) {
      const custObj = customers.find((c) => c.id === selectedCustomer.id);
      if (custObj) {
        const newPoints = custObj.totalPoints - pointsUsed + pointsEarned;
        const newDebt = paymentData.paymentMethod === 'PIUTANG' ? custObj.totalDebt + grandTotal : custObj.totalDebt;
        saveDocumentToFirestore('customers', selectedCustomer.id, {
          ...custObj,
          totalPoints: Math.max(0, newPoints),
          totalDebt: newDebt,
        }).catch(() => {});
      }
    }
  };

  // Settle Debt / Piutang
  const handleSettleDebt = (transactionId: string, paymentMethod: PaymentMethod) => {
    const tx = transactions.find((t) => t.id === transactionId);
    if (!tx) return;

    // 1. Mark transaction as LUNAS
    let targetUpdatedTx: Transaction | null = null;
    const updatedTransactions = transactions.map((t) => {
      if (t.id === transactionId) {
        targetUpdatedTx = {
          ...t,
          paymentStatus: 'LUNAS' as const,
          settledPaymentMethod: paymentMethod,
          paidAt: new Date().toISOString(),
        };
        return targetUpdatedTx;
      }
      return t;
    });
    setTransactions(updatedTransactions);
    if (targetUpdatedTx) {
      saveDocumentToFirestore('transactions', transactionId, targetUpdatedTx).catch(() => {});
    }

    // 2. Reduce Customer's totalDebt
    if (tx.customerId) {
      let targetUpdatedCust: Customer | null = null;
      const updatedCustomers = customers.map((c) => {
        if (c.id === tx.customerId) {
          targetUpdatedCust = {
            ...c,
            totalDebt: Math.max(0, c.totalDebt - tx.finalAmount),
          };
          return targetUpdatedCust;
        }
        return c;
      });
      setCustomers(updatedCustomers);
      if (targetUpdatedCust) {
        saveDocumentToFirestore('customers', tx.customerId, targetUpdatedCust).catch(() => {});
      }
    }
  };

  // Complete Restock / PO from Supplier
  const handleCompleteRestock = (supplier: Supplier, restockItems: RestockItem[]) => {
    const updatedProducts = products.map((prod) => {
      let addInBaseUnit = 0;
      restockItems.forEach((item) => {
        if (item.productId === prod.id) {
          addInBaseUnit += item.quantity * item.conversionFactor;
        }
      });
      if (addInBaseUnit > 0) {
        return {
          ...prod,
          stockInBaseUnit: prod.stockInBaseUnit + addInBaseUnit,
        };
      }
      return prod;
    });
    setProducts(updatedProducts);
    saveBatchToFirestore('products', updatedProducts).catch(() => {});
  };

  // Reset to initial demo data
  const handleResetToDemoData = () => {
    localStorage.clear();
    setUsers(INITIAL_USERS);
    setCurrentUser(INITIAL_USERS[2]);
    setProducts(INITIAL_PRODUCTS);
    setCategories(INITIAL_CATEGORIES);
    setCustomers(INITIAL_CUSTOMERS);
    setSuppliers(INITIAL_SUPPLIERS);
    setTransactions(INITIAL_TRANSACTIONS);
    setStoreSettings(INITIAL_STORE_SETTINGS);
    setAttendances(INITIAL_ATTENDANCES);
    setStockOpnames(INITIAL_STOCK_OPNAMES);
    setCart([]);
    setSelectedCustomer(null);
    setUsePoints(false);

    // Sync reset state to Firestore
    saveBatchToFirestore('products', INITIAL_PRODUCTS).catch(() => {});
    saveBatchToFirestore('categories', INITIAL_CATEGORIES).catch(() => {});
    saveBatchToFirestore('customers', INITIAL_CUSTOMERS).catch(() => {});
    saveBatchToFirestore('suppliers', INITIAL_SUPPLIERS).catch(() => {});
    saveBatchToFirestore('users', INITIAL_USERS).catch(() => {});
    saveStoreSettingsToFirestore(INITIAL_STORE_SETTINGS).catch(() => {});

    sound.playSuccessChime();
    alert('Data toko telah berhasil di-reset ke data bawaan.');
  };

  // Restore application backup data
  const handleRestoreBackup = (backup: BackupPayload) => {
    if (backup.data.products && Array.isArray(backup.data.products)) {
      setProducts(backup.data.products);
      saveBatchToFirestore('products', backup.data.products).catch(() => {});
    }
    if (backup.data.categories && Array.isArray(backup.data.categories)) {
      setCategories(backup.data.categories);
      saveBatchToFirestore('categories', backup.data.categories).catch(() => {});
    }
    if (backup.data.customers && Array.isArray(backup.data.customers)) {
      setCustomers(backup.data.customers);
      saveBatchToFirestore('customers', backup.data.customers).catch(() => {});
    }
    if (backup.data.suppliers && Array.isArray(backup.data.suppliers)) {
      setSuppliers(backup.data.suppliers);
      saveBatchToFirestore('suppliers', backup.data.suppliers).catch(() => {});
    }
    if (backup.data.transactions && Array.isArray(backup.data.transactions)) {
      setTransactions(backup.data.transactions);
      saveBatchToFirestore('transactions', backup.data.transactions).catch(() => {});
    }
    if (backup.data.attendances && Array.isArray(backup.data.attendances)) {
      setAttendances(backup.data.attendances);
      saveBatchToFirestore('attendances', backup.data.attendances).catch(() => {});
    }
    if (backup.data.stockOpnames && Array.isArray(backup.data.stockOpnames)) {
      setStockOpnames(backup.data.stockOpnames);
      saveBatchToFirestore('stock_opnames', backup.data.stockOpnames).catch(() => {});
    }
    if (backup.data.storeSettings) {
      setStoreSettings(backup.data.storeSettings);
      saveStoreSettingsToFirestore(backup.data.storeSettings).catch(() => {});
    }
    if (backup.data.users && Array.isArray(backup.data.users) && backup.data.users.length > 0) {
      setUsers(backup.data.users);
      saveBatchToFirestore('users', backup.data.users).catch(() => {});
      if (!backup.data.users.some((u) => u.id === currentUser.id)) {
        setCurrentUser(backup.data.users[0]);
      }
    }
    // Reset active cart and selected customer to prevent broken references
    setCart([]);
    setSelectedCustomer(null);
    setUsePoints(false);
  };

  // Attendance Handlers
  const handleCheckIn = (userId: string, notes?: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const newAtt: AttendanceRecord = {
      id: 'att_' + Date.now(),
      userId: targetUser.id,
      userName: targetUser.name,
      userRole: targetUser.role,
      date: todayStr,
      checkInTime: timeStr,
      checkInTimestamp: now.getTime(),
      notes,
      status: 'PRESENT',
    };

    setAttendances((prev) => [newAtt, ...prev]);
    saveDocumentToFirestore('attendances', newAtt.id, newAtt).catch(() => {});
  };

  const handleCheckOut = (attendanceId: string, notes?: string) => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    let targetUpdated: AttendanceRecord | null = null;
    setAttendances((prev) =>
      prev.map((att) => {
        if (att.id === attendanceId) {
          const durationMinutes = Math.max(
            0,
            Math.round((now.getTime() - att.checkInTimestamp) / 60000)
          );
          targetUpdated = {
            ...att,
            checkOutTime: timeStr,
            checkOutTimestamp: now.getTime(),
            durationMinutes,
            notes: notes ? (att.notes ? `${att.notes} | ${notes}` : notes) : att.notes,
            status: 'COMPLETED' as const,
          };
          return targetUpdated;
        }
        return att;
      })
    );
    if (targetUpdated) {
      saveDocumentToFirestore('attendances', attendanceId, targetUpdated).catch(() => {});
    }
  };

  const handleAddManualAttendance = (record: Omit<AttendanceRecord, 'id'>) => {
    const newAtt: AttendanceRecord = {
      ...record,
      id: 'att_' + Date.now(),
    };
    setAttendances((prev) => [newAtt, ...prev]);
    saveDocumentToFirestore('attendances', newAtt.id, newAtt).catch(() => {});
  };

  const handleDeleteAttendance = (attendanceId: string) => {
    sound.playTap();
    setAttendances((prev) => prev.filter((a) => a.id !== attendanceId));
    deleteDocumentFromFirestore('attendances', attendanceId).catch(() => {});
  };

  // Customer Management CRUD
  const handleAddCustomer = (data: Omit<Customer, 'id' | 'createdAt' | 'totalPoints' | 'totalDebt'>) => {
    const newCust: Customer = {
      ...data,
      id: 'cust_' + Date.now(),
      totalPoints: 0,
      totalDebt: 0,
      createdAt: new Date().toISOString().split('T')[0],
    };
    setCustomers([newCust, ...customers]);
    setSelectedCustomer(newCust); // auto select for current cart
    saveDocumentToFirestore('customers', newCust.id, newCust).catch(() => {});
  };

  const handleUpdateCustomer = (updated: Customer) => {
    setCustomers(customers.map((c) => (c.id === updated.id ? updated : c)));
    saveDocumentToFirestore('customers', updated.id, updated).catch(() => {});
  };

  const handleDeleteCustomer = (id: string) => {
    setCustomers(customers.filter((c) => c.id !== id));
    if (selectedCustomer?.id === id) setSelectedCustomer(null);
    deleteDocumentFromFirestore('customers', id).catch(() => {});
  };

  // Product Management CRUD
  const handleAddProduct = (data: Omit<Product, 'id'>) => {
    const newProd: Product = {
      ...data,
      id: 'prod_' + Date.now(),
    };
    setProducts([newProd, ...products]);
    saveDocumentToFirestore('products', newProd.id, newProd).catch(() => {});
  };

  const handleUpdateProduct = (updated: Product) => {
    setProducts(products.map((p) => (p.id === updated.id ? updated : p)));
    saveDocumentToFirestore('products', updated.id, updated).catch(() => {});
  };

  const handleDeleteProduct = (id: string) => {
    setProducts(products.filter((p) => p.id !== id));
    deleteDocumentFromFirestore('products', id).catch(() => {});
  };

  // Category Management CRUD
  const handleAddCategory = (data: Omit<ProductCategory, 'id'>): ProductCategory => {
    const newCat: ProductCategory = {
      ...data,
      id: 'cat_' + Date.now(),
    };
    setCategories((prev) => [...prev, newCat]);
    saveDocumentToFirestore('categories', newCat.id, newCat).catch(() => {});
    return newCat;
  };

  const handleUpdateCategory = (updated: ProductCategory) => {
    setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    saveDocumentToFirestore('categories', updated.id, updated).catch(() => {});

    // If category name or color changed, sync products that use this category
    const updatedProducts = products.map((p) => {
      const oldCat = categories.find((c) => c.id === updated.id);
      if (oldCat && p.category.toLowerCase() === oldCat.name.toLowerCase()) {
        return {
          ...p,
          category: updated.name,
          categoryColor: updated.color,
        };
      }
      return p;
    });
    setProducts(updatedProducts);
    saveBatchToFirestore('products', updatedProducts).catch(() => {});
  };

  const handleDeleteCategory = (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    deleteDocumentFromFirestore('categories', categoryId).catch(() => {});
  };

  // Supplier Management CRUD
  const handleAddSupplier = (data: Omit<Supplier, 'id' | 'createdAt'>) => {
    const newSup: Supplier = {
      ...data,
      id: 'sup_' + Date.now(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    setSuppliers([newSup, ...suppliers]);
    saveDocumentToFirestore('suppliers', newSup.id, newSup).catch(() => {});
  };

  const handleUpdateSupplier = (updated: Supplier) => {
    setSuppliers(suppliers.map((s) => (s.id === updated.id ? updated : s)));
    saveDocumentToFirestore('suppliers', updated.id, updated).catch(() => {});
  };

  const handleDeleteSupplier = (id: string) => {
    setSuppliers(suppliers.filter((s) => s.id !== id));
    deleteDocumentFromFirestore('suppliers', id).catch(() => {});
  };

  const handleUpdateStock = (productId: string, newStock: number) => {
    const finalStock = Math.max(0, newStock);
    const updatedProducts = products.map((p) =>
      p.id === productId ? { ...p, stockInBaseUnit: finalStock } : p
    );
    setProducts(updatedProducts);
    const targetProd = updatedProducts.find((p) => p.id === productId);
    if (targetProd) {
      saveDocumentToFirestore('products', productId, targetProd).catch(() => {});
    }
  };

  const handleBulkUpdateStock = (
    adjustments: { productId: string; newStock: number }[],
    sessionRecord: StockOpnameRecord
  ) => {
    const updatedProducts = products.map((p) => {
      const match = adjustments.find((adj) => adj.productId === p.id);
      if (match) {
        return { ...p, stockInBaseUnit: Math.max(0, match.newStock) };
      }
      return p;
    });
    setProducts(updatedProducts);
    setStockOpnames((prev) => [sessionRecord, ...prev]);

    // Sync bulk inventory & audit record to Firestore
    saveBatchToFirestore('products', updatedProducts).catch(() => {});
    saveDocumentToFirestore('stock_opnames', sessionRecord.id, sessionRecord).catch(() => {});
  };

  const handleUpdateStoreSettings = (newSettings: StoreSettings) => {
    setStoreSettings(newSettings);
    saveStoreSettingsToFirestore(newSettings).catch(() => {});
  };

  const handleUpdateUsers = (newUsers: User[]) => {
    setUsers(newUsers);
    saveBatchToFirestore('users', newUsers).catch(() => {});
  };

  const lowStockCount = products.filter((p) => p.stockInBaseUnit <= p.minStockAlert).length;
  const activeShiftCount = attendances.filter((a) => a.status === 'PRESENT').length;
  const isCurrentUserClockedIn = attendances.some(
    (a) => a.userId === currentUser.id && a.status === 'PRESENT'
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans select-none antialiased">
      {/* Top Tablet POS Bar */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSwitchUser={() => setIsSwitchUserModalOpen(true)}
        onOpenShiftSummary={() => setIsShiftSummaryModalOpen(true)}
        storeSettings={storeSettings}
        cartItemCount={cart.reduce((a, b) => a + b.quantity, 0)}
        lowStockCount={lowStockCount}
        activeShiftCount={activeShiftCount}
        isCurrentUserClockedIn={isCurrentUserClockedIn}
        products={products}
        cloudSyncStatus={cloudSyncStatus === 'SYNCED' ? 'SYNCED' : cloudSyncStatus === 'CONNECTING' ? 'CONNECTING' : 'OFFLINE'}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'pos' && (
          <TabletPOSView
            products={products}
            categories={categories}
            customers={customers}
            cart={cart}
            selectedCustomer={selectedCustomer}
            usePoints={usePoints}
            pointsToUse={pointsUsed}
            storeSettings={storeSettings}
            transactions={transactions}
            onAddToCart={handleAddToCart}
            onUpdateCartItemQty={handleUpdateCartItemQty}
            onChangeCartItemUnit={handleChangeCartItemUnit}
            onRemoveCartItem={handleRemoveCartItem}
            onClearCart={handleClearCart}
            onSelectCustomer={setSelectedCustomer}
            onOpenCustomerModal={() => setIsCustomerModalOpen(true)}
            onToggleUsePoints={setUsePoints}
            onOpenPaymentModal={() => setIsPaymentModalOpen(true)}
            onOpenScannerModal={() => setIsScannerModalOpen(true)}
            onOpenThresholdSettings={() => setIsThresholdModalOpen(true)}
            onNavigateToSuppliers={() => setActiveTab('suppliers')}
          />
        )}

        {activeTab === 'products' && (
          <ProductManagementView
            products={products}
            categories={categories}
            currentUserRole={currentUser.role}
            transactions={transactions}
            onAddProduct={handleAddProduct}
            onUpdateProduct={handleUpdateProduct}
            onDeleteProduct={handleDeleteProduct}
            onAddCategory={handleAddCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            onOpenThresholdSettings={() => setIsThresholdModalOpen(true)}
            onNavigateToSuppliers={() => setActiveTab('suppliers')}
          />
        )}

        {activeTab === 'stock-report' && (
          <StockReportView
            products={products}
            suppliers={suppliers}
            currentUser={currentUser}
            currentUserRole={currentUser.role}
            stockOpnames={stockOpnames}
            storeSettings={storeSettings}
            transactions={transactions}
            onUpdateStock={handleUpdateStock}
            onBulkUpdateStock={handleBulkUpdateStock}
            onOpenThresholdSettings={() => setIsThresholdModalOpen(true)}
            onNavigateToSuppliers={() => setActiveTab('suppliers')}
          />
        )}

        {activeTab === 'customers' && (
          <CustomerManagementView
            customers={customers}
            transactions={transactions}
            currentUserRole={currentUser.role}
            storeSettings={storeSettings}
            onAddCustomer={handleAddCustomer}
            onUpdateCustomer={handleUpdateCustomer}
            onDeleteCustomer={handleDeleteCustomer}
          />
        )}

        {activeTab === 'suppliers' && (
          <SupplierManagementView
            suppliers={suppliers}
            products={products}
            currentUserRole={currentUser.role}
            onAddSupplier={handleAddSupplier}
            onUpdateSupplier={handleUpdateSupplier}
            onDeleteSupplier={handleDeleteSupplier}
            onCompleteRestock={handleCompleteRestock}
          />
        )}

        {activeTab === 'piutang' && (
          <PiutangManagementView
            transactions={transactions}
            onSettleDebt={handleSettleDebt}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionHistoryView
            transactions={transactions}
            storeSettings={storeSettings}
            onViewReceipt={(tx) => {
              setLastCompletedTransaction(tx);
              setIsReceiptModalOpen(true);
            }}
          />
        )}

        {activeTab === 'attendance' && (
          <AttendanceView
            currentUser={currentUser}
            users={users}
            attendances={attendances}
            storeSettings={storeSettings}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onAddManualAttendance={handleAddManualAttendance}
            onDeleteAttendance={handleDeleteAttendance}
          />
        )}

        {activeTab === 'profit-loss' && (
          <DailyProfitLossView
            transactions={transactions}
            products={products}
            categories={categories}
            currentUserRole={currentUser.role}
            storeName={storeSettings.storeName}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            storeSettings={storeSettings}
            users={users}
            products={products}
            categories={categories}
            customers={customers}
            suppliers={suppliers}
            transactions={transactions}
            attendances={attendances}
            stockOpnames={stockOpnames}
            onUpdateStoreSettings={handleUpdateStoreSettings}
            onUpdateUsers={handleUpdateUsers}
            onResetToDemoData={handleResetToDemoData}
            onRestoreBackup={handleRestoreBackup}
          />
        )}
      </main>

      {/* MODALS */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        subtotal={subtotal}
        pointsDiscount={pointsDiscountAmount}
        pointsUsed={pointsUsed}
        grandTotal={grandTotal}
        selectedCustomer={selectedCustomer}
        storeSettings={storeSettings}
        membershipDiscount={membershipDiscountAmount}
        customerTier={customerTier}
        tierDiscountPercent={tierDiscountPercent}
        onConfirmPayment={handleConfirmPayment}
        onOpenCustomerModal={() => {
          setIsPaymentModalOpen(false);
          setIsCustomerModalOpen(true);
        }}
      />

      <ReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        transaction={lastCompletedTransaction}
        storeSettings={storeSettings}
        onNewTransaction={() => {
          setIsReceiptModalOpen(false);
          setActiveTab('pos');
        }}
      />

      <BarcodeScannerModal
        isOpen={isScannerModalOpen}
        onClose={() => setIsScannerModalOpen(false)}
        products={products}
        onBarcodeScanned={handleBarcodeScanned}
      />

      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        customers={customers}
        selectedCustomer={selectedCustomer}
        onSelectCustomer={setSelectedCustomer}
        onAddCustomer={handleAddCustomer}
      />

      <UserSwitchModal
        isOpen={isSwitchUserModalOpen}
        onClose={() => setIsSwitchUserModalOpen(false)}
        users={users}
        currentUser={currentUser}
        onSelectUser={setCurrentUser}
      />

      <ShiftSummaryModal
        isOpen={isShiftSummaryModalOpen}
        onClose={() => setIsShiftSummaryModalOpen(false)}
        currentUser={currentUser}
        transactions={transactions}
        storeSettings={storeSettings}
        onEndShift={() => {
          setIsShiftSummaryModalOpen(false);
          setIsSwitchUserModalOpen(true); // Lock screen for next cashier
        }}
      />

      <StockThresholdSettingsModal
        isOpen={isThresholdModalOpen}
        onClose={() => setIsThresholdModalOpen(false)}
        products={products}
        suppliers={suppliers}
        storeSettings={storeSettings}
        onSaveThresholds={(updatedProducts) => {
          setProducts(updatedProducts);
          saveBatchToFirestore('products', updatedProducts).catch(() => {});
        }}
      />
    </div>
  );
}
