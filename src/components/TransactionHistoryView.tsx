import React, { useState, useMemo, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  Calendar, 
  Printer, 
  MessageCircle, 
  CreditCard, 
  Sparkles,
  Eye,
  FileDown,
  User,
  Phone,
  Tag,
  Layers,
  ChevronDown,
  CheckCircle,
  X,
  Clock,
  Send,
  AlertCircle,
  FileSpreadsheet,
  TrendingUp,
  Share2,
  Copy,
  CheckSquare,
  Square,
  FileText,
  Edit3,
  History,
  ShieldCheck,
  Save
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  Transaction,
  StoreSettings,
  ProductCategory,
  Product,
  Customer,
  User as PosUser,
  PaymentMethod,
  PaymentMethodType,
  TransactionAuditChange,
  TransactionAuditLogEntry,
} from '../types/pos';
import { DEFAULT_PAYMENT_METHODS } from '../utils/mockData';
import { formatRupiah, formatDateTime, formatWhatsAppUrl, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { getCustomerCategoryBadge } from '../utils/customerUtils';
import {
  getLocalDateKey,
  computeDailyProfitLossData,
  generateSelectedTransactionsPdf,
  generateDailyProfitLossPdf,
  generateSingleTransactionPdf,
  buildTransactionsWaSummary,
  buildDailyProfitLossWaSummary,
  buildWhatsAppShareHref,
} from '../utils/pdfReportGenerator';

interface TransactionHistoryViewProps {
  transactions: Transaction[];
  storeSettings?: StoreSettings;
  categories?: ProductCategory[];
  products?: Product[];
  customers?: Customer[];
  currentUser?: PosUser;
  onUpdateTransaction?: (updatedTx: Transaction, prevTx?: Transaction) => void;
  onViewReceipt: (tx: Transaction) => void;
  onOpenFifoReconcile?: () => void;
  onStartBackdatedTransaction?: () => void;
}

export const TransactionHistoryView: React.FC<TransactionHistoryViewProps> = ({
  transactions,
  storeSettings,
  categories = [],
  products = [],
  customers = [],
  currentUser,
  onUpdateTransaction,
  onViewReceipt,
  onOpenFifoReconcile,
  onStartBackdatedTransaction,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [customerNameFilter, setCustomerNameFilter] = useState<string>('');
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);
  const [selectedDetailTx, setSelectedDetailTx] = useState<Transaction | null>(null);
  const [selectedTxForWa, setSelectedTxForWa] = useState<Transaction | null>(null);
  const [waPhoneNumber, setWaPhoneNumber] = useState('');
  const [waCustomMessage, setWaCustomMessage] = useState('');
  const [waNotice, setWaNotice] = useState<string>('');
  const [actionBanner, setActionBanner] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);

  // Admin Edit Invoice Modal states
  const [editingInvoiceTx, setEditingInvoiceTx] = useState<Transaction | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('CASH');
  const [editPaymentStatus, setEditPaymentStatus] = useState<'LUNAS' | 'BELUM_LUNAS'>('LUNAS');
  const [editCashPaid, setEditCashPaid] = useState<string>('');
  const [editBankApprovalCode, setEditBankApprovalCode] = useState('');
  const [editBankRefNumber, setEditBankRefNumber] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editError, setEditError] = useState('');

  // PDF Export & WhatsApp Share Modal states
  const [isPdfExportModalOpen, setIsPdfExportModalOpen] = useState(false);
  const [pdfReportType, setPdfReportType] = useState<'TRANSACTIONS' | 'DAILY_PNL'>('TRANSACTIONS');
  const [txExportScope, setTxExportScope] = useState<'SELECTED' | 'FILTERED'>('FILTERED');
  const [includeItemDetailsInPdf, setIncludeItemDetailsInPdf] = useState<boolean>(true);
  const [dailyReportDate, setDailyReportDate] = useState<string>(() => getLocalDateKey(Date.now()));
  const [pdfWaPhone, setPdfWaPhone] = useState<string>('');
  const [pdfWaMessage, setPdfWaMessage] = useState<string>('');
  const [pdfModalFeedback, setPdfModalFeedback] = useState<{ type: 'success' | 'info' | 'warning'; text: string } | null>(null);
  const [isCopiedWaText, setIsCopiedWaText] = useState(false);

  // Payment method options derived from storeSettings or default methods
  const availablePaymentMethodOptions = useMemo(() => {
    const source =
      storeSettings?.customPaymentMethods && storeSettings.customPaymentMethods.length > 0
        ? storeSettings.customPaymentMethods.filter((pm) => pm.isActive !== false)
        : DEFAULT_PAYMENT_METHODS;

    const options: Array<{ value: string; label: string; type: PaymentMethodType }> = [];
    const seen = new Set<string>();

    source.forEach((pm) => {
      const val =
        pm.type === 'PIUTANG'
          ? 'PIUTANG'
          : pm.type === 'CASH'
          ? 'CASH'
          : pm.name || 'CASH';
      if (!seen.has(val)) {
        seen.add(val);
        options.push({
          value: val,
          label: pm.name,
          type: pm.type,
        });
      }
    });

    if (!seen.has('CASH')) {
      seen.add('CASH');
      options.unshift({ value: 'CASH', label: 'Tunai (Cash)', type: 'CASH' });
    }
    if (!seen.has('PIUTANG')) {
      seen.add('PIUTANG');
      options.push({ value: 'PIUTANG', label: 'Piutang (Tempo / Kasbon)', type: 'PIUTANG' });
    }

    if (editingInvoiceTx && !seen.has(editingInvoiceTx.paymentMethod)) {
      const legacyVal = editingInvoiceTx.paymentMethod;
      const inferredType: PaymentMethodType =
        legacyVal === 'CASH'
          ? 'CASH'
          : legacyVal === 'PIUTANG'
          ? 'PIUTANG'
          : legacyVal.toUpperCase().includes('EDC') || legacyVal.toUpperCase().includes('CARD')
          ? 'CARD'
          : legacyVal.toUpperCase().includes('QRIS')
          ? 'QRIS'
          : legacyVal.toUpperCase().includes('TRANSFER')
          ? 'BANK_TRANSFER'
          : 'OTHER';
      options.push({
        value: legacyVal,
        label: legacyVal.replace(/_/g, ' '),
        type: inferredType,
      });
    }

    return options;
  }, [storeSettings?.customPaymentMethods, editingInvoiceTx]);

  const selectedEditMethodType: PaymentMethodType = useMemo(() => {
    const found = availablePaymentMethodOptions.find((opt) => opt.value === editPaymentMethod);
    if (found) return found.type;
    const upper = String(editPaymentMethod || '').toUpperCase();
    if (upper === 'CASH') return 'CASH';
    if (upper === 'PIUTANG') return 'PIUTANG';
    if (upper.includes('EDC') || upper.includes('CARD') || upper.includes('DEBIT') || upper.includes('KREDIT')) return 'CARD';
    if (upper.includes('QRIS')) return 'QRIS';
    if (upper.includes('TRANSFER') || upper.includes('BANK')) return 'BANK_TRANSFER';
    return 'OTHER';
  }, [availablePaymentMethodOptions, editPaymentMethod]);

  const handleOpenEditInvoiceModal = (tx: Transaction) => {
    if (!isAdmin) return;
    sound.playTap();
    setEditingInvoiceTx(tx);
    setEditNotes(tx.notes || '');
    setEditPaymentMethod(tx.paymentMethod);
    setEditPaymentStatus(tx.paymentStatus);
    setEditCashPaid(
      tx.cashPaid !== undefined ? String(tx.cashPaid) : String(tx.finalAmount)
    );
    setEditBankApprovalCode(tx.bankApprovalCode || '');
    setEditBankRefNumber(tx.bankRefNumber || '');
    setEditDueDate(tx.dueDate || '');
    setEditReason('');
    setEditError('');
  };

  const handleSaveEditedInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingInvoiceTx || !currentUser || !onUpdateTransaction) return;

    const trimmedNotes = editNotes.trim();
    const oldNotes = (editingInvoiceTx.notes || '').trim();
    const isNonCashMethod =
      selectedEditMethodType !== 'CASH' && selectedEditMethodType !== 'PIUTANG';
    const trimmedApproval = isNonCashMethod ? editBankApprovalCode.trim() : '';
    const oldApproval = (editingInvoiceTx.bankApprovalCode || '').trim();
    const trimmedRef = isNonCashMethod ? editBankRefNumber.trim() : '';
    const oldRef = (editingInvoiceTx.bankRefNumber || '').trim();
    const trimmedDue = editPaymentMethod === 'PIUTANG' ? editDueDate.trim() : '';
    const oldDue = (editingInvoiceTx.dueDate || '').trim();

    let parsedCashPaid = editingInvoiceTx.finalAmount;
    if (editPaymentMethod === 'CASH') {
      parsedCashPaid = Number(editCashPaid);
      if (!Number.isFinite(parsedCashPaid) || parsedCashPaid < editingInvoiceTx.finalAmount) {
        setEditError(
          `Nominal bayar tunai minimal ${formatRupiah(editingInvoiceTx.finalAmount)}.`
        );
        return;
      }
    }

    const changes: TransactionAuditChange[] = [];

    if (oldNotes !== trimmedNotes) {
      changes.push({
        field: 'notes',
        label: 'Catatan Transaksi',
        oldValue: oldNotes || '(Kosong)',
        newValue: trimmedNotes || '(Kosong)',
      });
    }

    if (editingInvoiceTx.paymentMethod !== editPaymentMethod) {
      changes.push({
        field: 'paymentMethod',
        label: 'Metode Pembayaran',
        oldValue: editingInvoiceTx.paymentMethod.replace(/_/g, ' '),
        newValue: editPaymentMethod.replace(/_/g, ' '),
      });
    }

    if (editingInvoiceTx.paymentStatus !== editPaymentStatus) {
      changes.push({
        field: 'paymentStatus',
        label: 'Status Pembayaran',
        oldValue: editingInvoiceTx.paymentStatus,
        newValue: editPaymentStatus,
      });
    }

    if (editingInvoiceTx.paymentMethod === 'CASH' || editPaymentMethod === 'CASH') {
      const oldCashPaidVal =
        editingInvoiceTx.paymentMethod === 'CASH'
          ? editingInvoiceTx.cashPaid ?? editingInvoiceTx.finalAmount
          : null;
      const newCashPaidVal = editPaymentMethod === 'CASH' ? parsedCashPaid : null;
      if (oldCashPaidVal !== newCashPaidVal) {
        changes.push({
          field: 'cashPaid',
          label: 'Nominal Tunai Dibayar',
          oldValue: oldCashPaidVal !== null ? formatRupiah(oldCashPaidVal) : '-',
          newValue: newCashPaidVal !== null ? formatRupiah(newCashPaidVal) : '-',
        });
      }

      const oldCashChangeVal =
        editingInvoiceTx.paymentMethod === 'CASH' ? editingInvoiceTx.cashChange ?? 0 : null;
      const newCashChangeVal =
        editPaymentMethod === 'CASH'
          ? Math.max(0, parsedCashPaid - editingInvoiceTx.finalAmount)
          : null;
      if (oldCashChangeVal !== newCashChangeVal) {
        changes.push({
          field: 'cashChange',
          label: 'Kembalian Tunai',
          oldValue: oldCashChangeVal !== null ? formatRupiah(oldCashChangeVal) : '-',
          newValue: newCashChangeVal !== null ? formatRupiah(newCashChangeVal) : '-',
        });
      }
    }

    if (oldApproval !== trimmedApproval) {
      changes.push({
        field: 'bankApprovalCode',
        label: 'Kode Approval EDC',
        oldValue: oldApproval || '(Kosong)',
        newValue: trimmedApproval || '(Kosong)',
      });
    }

    if (oldRef !== trimmedRef) {
      changes.push({
        field: 'bankRefNumber',
        label: 'No. Referensi / Bank / QRIS',
        oldValue: oldRef || '(Kosong)',
        newValue: trimmedRef || '(Kosong)',
      });
    }

    if (oldDue !== trimmedDue) {
      changes.push({
        field: 'dueDate',
        label: 'Jatuh Tempo Piutang',
        oldValue: oldDue || '(Kosong)',
        newValue: trimmedDue || '(Kosong)',
      });
    }

    if (changes.length === 0) {
      setEditError('Belum ada perubahan pada catatan atau detail metode pembayaran.');
      return;
    }

    const auditEntry: TransactionAuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      editedByUserId: currentUser.id,
      editedByName: currentUser.name,
      editedByRole: currentUser.role,
      ...(editReason.trim() ? { reason: editReason.trim() } : {}),
      changes,
    };

    const updatedTx: Transaction = {
      ...editingInvoiceTx,
      paymentMethod: editPaymentMethod,
      paymentStatus: editPaymentStatus,
      auditLogs: [...(editingInvoiceTx.auditLogs || []), auditEntry],
    };

    if (trimmedNotes) {
      updatedTx.notes = trimmedNotes;
    } else {
      delete updatedTx.notes;
    }

    if (editPaymentMethod === 'CASH') {
      updatedTx.cashPaid = parsedCashPaid;
      updatedTx.cashChange = Math.max(0, parsedCashPaid - editingInvoiceTx.finalAmount);
    } else {
      delete updatedTx.cashPaid;
      delete updatedTx.cashChange;
    }

    if (trimmedApproval) {
      updatedTx.bankApprovalCode = trimmedApproval;
    } else {
      delete updatedTx.bankApprovalCode;
    }

    if (trimmedRef) {
      updatedTx.bankRefNumber = trimmedRef;
    } else {
      delete updatedTx.bankRefNumber;
    }

    if (editPaymentMethod === 'PIUTANG' && trimmedDue) {
      updatedTx.dueDate = trimmedDue;
    } else {
      delete updatedTx.dueDate;
    }

    if (
      editingInvoiceTx.paymentMethod === 'PIUTANG' &&
      editPaymentMethod !== 'PIUTANG' &&
      editPaymentStatus === 'LUNAS'
    ) {
      updatedTx.paidAt = updatedTx.paidAt || new Date().toISOString();
      updatedTx.settledPaymentMethod = editPaymentMethod;
    }

    sound.playTap();
    onUpdateTransaction(updatedTx, editingInvoiceTx);

    if (selectedDetailTx && selectedDetailTx.id === updatedTx.id) {
      setSelectedDetailTx(updatedTx);
    }

    setEditingInvoiceTx(null);
    setActionBanner({
      type: 'success',
      text: `Invoice ${updatedTx.invoiceNumber} berhasil diperbarui (${changes.length} perubahan dicatat dalam Audit Log).`,
    });
  };

  // Helper to find customer profile from customers prop
  const getCustomerProfile = (tx: Transaction): Customer | null => {
    if (!customers || customers.length === 0) return null;
    if (tx.customerId) {
      const matchById = customers.find((c) => c.id === tx.customerId);
      if (matchById) return matchById;
    }
    if (tx.customerName) {
      const matchByName = customers.find(
        (c) => c.name.trim().toLowerCase() === tx.customerName?.trim().toLowerCase()
      );
      if (matchByName) return matchByName;
    }
    return null;
  };

  // Helper to get WhatsApp phone number prioritizing customer profile
  const getCustomerWhatsAppNumber = (tx: Transaction): string => {
    const profile = getCustomerProfile(tx);
    return profile?.whatsapp || profile?.phone || tx.customerWhatsapp || '';
  };

  // Helper to get product category for an item
  const getItemCategory = (item: { productId: string; productName: string; isService?: boolean }): string => {
    if (item.isService) return 'Jasa';
    const prod = products.find(
      (p) => p.id === item.productId || p.name.trim().toLowerCase() === item.productName.trim().toLowerCase()
    );
    return prod?.category || (item.isService ? 'Jasa' : 'Umum');
  };

  const buildWaMessage = (tx: Transaction) => {
    const storeName = storeSettings?.storeName || 'KasirKu Tablet POS';
    const storePhone = storeSettings?.storePhone || '';
    const storeAddress = storeSettings?.storeAddress || '';
    const profile = getCustomerProfile(tx);
    const custName = profile?.name || tx.customerName || 'Pelanggan Setia';
    const tier = profile?.membershipTier || tx.customerTier;

    const itemsSummary = tx.items
      .map((item) => {
        const variantText = item.selectedVariant ? ` (${item.selectedVariant})` : '';
        const tag = item.isService ? '[Jasa]' : '';
        return `• ${tag} ${item.productName}${variantText}\n  ${item.quantity} ${item.unitName || ''} x ${formatRupiah(item.unitPrice)} = *${formatRupiah(item.totalAmount)}*`;
      })
      .join('\n');

    let msg = `Halo Kak *${custName}*${tier ? ` (${tier})` : ''},\n` +
      `Terima kasih telah bertransaksi di *${storeName}*! 🙏✨\n\n` +
      `🧾 *NOTA TRANSAKSI DIGITAL*\n` +
      `--------------------------------\n` +
      `No. Invoice : *${tx.invoiceNumber}*\n` +
      `Waktu       : ${formatDateTime(tx.timestamp)}\n` +
      `Kasir       : ${tx.cashierName}\n` +
      `Metode      : ${tx.paymentMethod.replace(/_/g, ' ')}\n` +
      `--------------------------------\n` +
      `📦 *Rincian Belanja / Layanan:*\n` +
      `${itemsSummary}\n` +
      `--------------------------------\n` +
      `Subtotal : ${formatRupiah(tx.subtotal)}\n`;

    if (tx.discount > 0) {
      msg += `Diskon Transaksi : -${formatRupiah(tx.discount)}\n`;
    }
    if (tx.membershipDiscountAmount && tx.membershipDiscountAmount > 0) {
      msg += `Diskon Member : -${formatRupiah(tx.membershipDiscountAmount)}\n`;
    }
    if (tx.pointsDiscountAmount > 0) {
      msg += `Diskon Poin (${tx.pointsUsed || 0} Pts) : -${formatRupiah(tx.pointsDiscountAmount)}\n`;
    }

    msg += `*TOTAL PEMBAYARAN : ${formatRupiah(tx.finalAmount)}*\n`;

    if (tx.paymentMethod === 'CASH') {
      msg += `Bayar Tunai : ${formatRupiah(tx.cashPaid || tx.finalAmount)}\n`;
      msg += `Kembalian   : ${formatRupiah(tx.cashChange || 0)}\n`;
    } else if (tx.paymentMethod === 'PIUTANG') {
      msg += `Status      : BELUM LUNAS (PIUTANG)\n`;
      if (tx.dueDate) msg += `Jatuh Tempo : ${tx.dueDate}\n`;
    }

    if (tx.pointsEarned > 0) {
      msg += `Poin Didapat : +${tx.pointsEarned} Poin\n`;
    }
    if (profile) {
      msg += `Total Poin Member : ${profile.totalPoints} Poin\n`;
    }

    msg += `--------------------------------\n`;
    if (storeAddress) msg += `${storeAddress}\n`;
    if (storePhone) msg += `Telp/WA Toko: ${storePhone}\n`;
    msg += `\n${storeSettings?.storeFooterReceipt || 'Semoga berkah & ditunggu kunjungan berikutnya! 😊🛍️'}`;

    return msg;
  };

  const handleOpenWaModal = (tx: Transaction) => {
    sound.playTap();
    const phone = getCustomerWhatsAppNumber(tx);
    const profile = getCustomerProfile(tx);
    setSelectedTxForWa(tx);
    setWaPhoneNumber(phone);
    setWaCustomMessage(buildWaMessage(tx));
    if (profile && (profile.whatsapp || profile.phone)) {
      setWaNotice(`Nomor WhatsApp otomatis diambil dari profil pelanggan: ${profile.name}`);
    } else if (tx.customerWhatsapp) {
      setWaNotice(`Nomor WhatsApp diambil dari catatan transaksi saat checkout.`);
    } else {
      setWaNotice(`Pelanggan belum memiliki nomor WhatsApp di profil. Silakan masukkan nomor tujuan.`);
    }
  };

  const handleDirectSendWaFromDetail = (tx: Transaction) => {
    sound.playTap();
    const phone = getCustomerWhatsAppNumber(tx);
    if (!phone || !phone.trim()) {
      // If no phone number in profile or transaction, open the modal to enter it
      handleOpenWaModal(tx);
      return;
    }
    const message = buildWaMessage(tx);
    const url = formatWhatsAppUrl(phone.trim(), message);
    window.open(url, '_blank');
  };

  const handleSendWa = () => {
    sound.playTap();
    if (!waPhoneNumber.trim()) {
      return;
    }
    const url = formatWhatsAppUrl(waPhoneNumber.trim(), waCustomMessage);
    window.open(url, '_blank');
    setSelectedTxForWa(null);
  };

  const filtered = transactions.filter((tx) => {
    // 1. Payment Method Filter
    const matchMethod = methodFilter === 'ALL' || tx.paymentMethod === methodFilter;

    // 2. Search query Filter
    const query = search.toLowerCase().trim();
    const matchSearch =
      !query ||
      tx.invoiceNumber.toLowerCase().includes(query) ||
      (tx.customerName || '').toLowerCase().includes(query) ||
      (tx.notes || '').toLowerCase().includes(query) ||
      tx.cashierName.toLowerCase().includes(query) ||
      tx.items.some((item) => item.productName.toLowerCase().includes(query));

    // 3. Category Filter
    let matchCategory = true;
    if (categoryFilter === 'ALL_BARANG') {
      matchCategory = tx.items.some((item) => !item.isService);
    } else if (categoryFilter === 'ALL_JASA') {
      matchCategory = tx.items.some((item) => !!item.isService);
    } else if (categoryFilter !== 'ALL') {
      matchCategory = tx.items.some((item) => {
        const cat = getItemCategory(item);
        return cat.toLowerCase() === categoryFilter.toLowerCase();
      });
    }

    // 4. Date Range Filter (Local Calendar YYYY-MM-DD)
    const txDateKey = getLocalDateKey(tx.timestamp);
    const matchStartDate = !startDate || txDateKey >= startDate;
    const matchEndDate = !endDate || txDateKey <= endDate;

    // 5. Customer Name Filter (matches profile name, tx customerName, or 'Pelanggan Umum')
    const custQuery = customerNameFilter.trim().toLowerCase();
    const resolvedCustName = (getCustomerProfile(tx)?.name || tx.customerName || 'Pelanggan Umum').toLowerCase();
    const matchCustomer = !custQuery || resolvedCustName.includes(custQuery);

    return matchMethod && matchSearch && matchCategory && matchStartDate && matchEndDate && matchCustomer;
  });

  // Unique customer name suggestions for Customer Name filter datalist
  const customerNameSuggestions = useMemo(() => {
    const names = new Set<string>();
    names.add('Pelanggan Umum');
    customers.forEach((c) => {
      if (c.name && c.name.trim()) names.add(c.name.trim());
    });
    transactions.forEach((tx) => {
      const profile = getCustomerProfile(tx);
      const name = profile?.name || tx.customerName;
      if (name && name.trim()) names.add(name.trim());
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'id-ID'));
  }, [customers, transactions]);

  const hasActiveFilters = Boolean(
    search.trim() ||
    methodFilter !== 'ALL' ||
    categoryFilter !== 'ALL' ||
    startDate ||
    endDate ||
    customerNameFilter.trim()
  );

  const resetAllFilters = () => {
    sound.playTap();
    setSearch('');
    setMethodFilter('ALL');
    setCategoryFilter('ALL');
    setStartDate('');
    setEndDate('');
    setCustomerNameFilter('');
  };

  const applyDateRangePreset = (preset: 'TODAY' | '7_DAYS' | 'THIS_MONTH' | 'CLEAR') => {
    sound.playTap();
    const now = new Date();
    const todayKey = getLocalDateKey(now);
    if (preset === 'TODAY') {
      setStartDate(todayKey);
      setEndDate(todayKey);
    } else if (preset === '7_DAYS') {
      const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      setStartDate(getLocalDateKey(sevenDaysAgo));
      setEndDate(todayKey);
    } else if (preset === 'THIS_MONTH') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(getLocalDateKey(monthStart));
      setEndDate(todayKey);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  // Available unique dates with transactions (most recent first)
  const availableTxDates = useMemo(() => {
    const datesSet = new Set<string>();
    transactions.forEach((tx) => {
      const k = getLocalDateKey(tx.timestamp);
      if (k) datesSet.add(k);
    });
    return Array.from(datesSet).sort((a, b) => b.localeCompare(a)).slice(0, 7);
  }, [transactions]);

  // Selected transactions derived from checkboxes
  const selectedTransactionsList = useMemo(
    () => transactions.filter((tx) => selectedTxIds.includes(tx.id)),
    [transactions, selectedTxIds]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((tx) => selectedTxIds.includes(tx.id));

  const toggleSelectTx = (txId: string) => {
    sound.playTap();
    setSelectedTxIds((prev) =>
      prev.includes(txId) ? prev.filter((id) => id !== txId) : [...prev, txId]
    );
  };

  const toggleSelectAllFiltered = () => {
    sound.playTap();
    if (allFilteredSelected) {
      const filteredSet = new Set(filtered.map((t) => t.id));
      setSelectedTxIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const merged = new Set([...selectedTxIds, ...filtered.map((t) => t.id)]);
      setSelectedTxIds(Array.from(merged));
    }
  };

  const targetTransactionsForPdf = useMemo(() => {
    if (txExportScope === 'SELECTED' && selectedTransactionsList.length > 0) {
      return selectedTransactionsList;
    }
    return filtered;
  }, [txExportScope, selectedTransactionsList, filtered]);

  const txPdfPreviewStats = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    targetTransactionsForPdf.forEach((tx) => {
      revenue += tx.finalAmount || 0;
      (tx.items || []).forEach((item) => {
        const prod = products.find((p) => p.id === item.productId);
        cogs += getItemFifoCogs(item, prod);
      });
    });
    const profit = revenue - cogs;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { count: targetTransactionsForPdf.length, revenue, cogs, profit, margin };
  }, [targetTransactionsForPdf, products]);

  const dailyPnlPreviewData = useMemo(
    () => computeDailyProfitLossData(transactions, dailyReportDate, products),
    [transactions, dailyReportDate, products]
  );

  // Keep WhatsApp summary message synced with current modal selection
  useEffect(() => {
    if (!isPdfExportModalOpen) return;
    if (pdfReportType === 'DAILY_PNL') {
      setPdfWaMessage(buildDailyProfitLossWaSummary(dailyPnlPreviewData, storeSettings));
    } else {
      const dateRangePart = startDate || endDate ? `, ${startDate || '...'} s/d ${endDate || '...'}` : '';
      const custPart = customerNameFilter.trim() ? `, Pelanggan: ${customerNameFilter.trim()}` : '';
      const scopeLabel =
        txExportScope === 'SELECTED' && selectedTransactionsList.length > 0
          ? `${selectedTransactionsList.length} Transaksi Terpilih`
          : `Filter (${categoryFilter}, ${methodFilter}${dateRangePart}${custPart})`;
      setPdfWaMessage(
        buildTransactionsWaSummary(targetTransactionsForPdf, storeSettings, products, scopeLabel)
      );
    }
  }, [
    isPdfExportModalOpen,
    pdfReportType,
    txExportScope,
    targetTransactionsForPdf,
    selectedTransactionsList.length,
    dailyPnlPreviewData,
    storeSettings,
    products,
    categoryFilter,
    methodFilter,
    startDate,
    endDate,
    customerNameFilter,
  ]);

  const totalRevenue = transactions.reduce((acc, tx) => acc + tx.finalAmount, 0);
  const totalTxCount = transactions.length;
  const avgBasket = totalTxCount > 0 ? totalRevenue / totalTxCount : 0;
  const totalPointsDistributed = transactions.reduce((acc, tx) => acc + tx.pointsEarned, 0);

  const handleExportExcel = () => {
    sound.playTap();
    if (filtered.length === 0) {
      setActionBanner({
        type: 'warning',
        text: 'Tidak ada data transaksi yang dapat diekspor sesuai filter saat ini.',
      });
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';

    // Sheet 1: Ringkasan Transaksi dengan Kolom Khusus Rincian Detail Batch (batchNumber) & HPP (costPrice)
    const summaryData = filtered.map((tx, idx) => {
      const profile = getCustomerProfile(tx);
      const custName = profile?.name || tx.customerName || 'Pelanggan Umum';
      const custTier = profile?.membershipTier || tx.customerTier || 'REGULER';

      // String ringkasan produk
      const productSummary = tx.items
        .map((item) => {
          const variantText = item.selectedVariant ? ` (${item.selectedVariant})` : '';
          return `${item.productName}${variantText} [${item.quantity} ${item.unitName || 'PCS'}]`;
        })
        .join('; ');

      // Kolom Khusus FIFO: Merinci detail batch (batchNumber) dan HPP (costPrice) per item
      let totalTxFifoCogs = 0;
      const batchDetailsList: string[] = [];

      tx.items.forEach((item) => {
        const prod = products.find((p) => p.id === item.productId || p.name === item.productName);
        const itemCogs = getItemFifoCogs(item, prod);
        totalTxFifoCogs += itemCogs;

        if (item.isService) {
          batchDetailsList.push(`${item.productName}: [Layanan/Jasa - HPP Rp 0]`);
        } else if (item.batchDeductions && item.batchDeductions.length > 0) {
          const deductionsStr = item.batchDeductions
            .map((b) => {
              const bNum = b.batchNumber || b.batchId;
              const bCost = b.costPrice !== undefined ? b.costPrice : (item.costPrice || prod?.costPrice || 0);
              return `Batch: ${bNum} (Qty: ${b.quantity}, HPP: Rp ${bCost.toLocaleString('id-ID')}, Sub: Rp ${(b.quantity * bCost).toLocaleString('id-ID')})`;
            })
            .join(' + ');
          batchDetailsList.push(`${item.productName}: [${deductionsStr}]`);
        } else {
          const unitCost = item.costPrice !== undefined ? item.costPrice : (prod?.costPrice || 0);
          const baseUnits = (item.quantity || 0) * (item.conversionFactor || 1);
          batchDetailsList.push(
            `${item.productName}: [HPP Tersimpan: Rp ${unitCost.toLocaleString('id-ID')}/unit x ${baseUnits} unit = Rp ${(baseUnits * unitCost).toLocaleString('id-ID')}]`
          );
        }
      });

      const fifoBatchDetailString = batchDetailsList.join(' | ');
      const grossProfitFifo = tx.finalAmount - totalTxFifoCogs;
      const marginFifoPercent = tx.finalAmount > 0 ? ((grossProfitFifo / tx.finalAmount) * 100).toFixed(1) : '0.0';

      return {
        'No': idx + 1,
        'No. Invoice': tx.invoiceNumber,
        'Tanggal & Waktu': formatDateTime(tx.timestamp),
        'Kasir': tx.cashierName,
        'Pelanggan': custName,
        'Kategori Pelanggan': profile?.customerCategory || tx.customerCategory || 'UMUM',
        'Membership Tier': custTier,
        'Metode Pembayaran': tx.paymentMethod.replace(/_/g, ' '),
        'Status Bayar': tx.paymentStatus,
        'Jumlah Item': tx.items.length,
        'Daftar Produk Terjual': productSummary,
        'Detail Batch & HPP FIFO (batchNumber & costPrice)': fifoBatchDetailString,
        'Subtotal (Rp)': tx.subtotal,
        'Total Diskon (Rp)': (tx.discount || 0) + (tx.membershipDiscountAmount || 0) + (tx.pointsDiscountAmount || 0),
        'Total Akhir (Omzet) (Rp)': tx.finalAmount,
        'Total HPP FIFO (Rp)': totalTxFifoCogs,
        'Laba Kotor FIFO (Rp)': grossProfitFifo,
        'Margin Laba FIFO (%)': `${marginFifoPercent}%`,
      };
    });

    // Sheet 2: Breakdown Rinci Tiap Item & Pecahan Batch Alokasi FIFO
    const itemDetailRows: any[] = [];
    filtered.forEach((tx) => {
      const profile = getCustomerProfile(tx);
      const custName = profile?.name || tx.customerName || 'Pelanggan Umum';

      tx.items.forEach((item) => {
        const prod = products.find((p) => p.id === item.productId || p.name === item.productName);
        const itemCat = getItemCategory(item);
        const itemSubtotal = item.totalAmount || ((item.quantity || 0) * (item.unitPrice || 0));

        if (item.batchDeductions && item.batchDeductions.length > 0) {
          item.batchDeductions.forEach((b) => {
            const bCost = b.costPrice !== undefined ? b.costPrice : (item.costPrice || prod?.costPrice || 0);
            const bTotalCost = (b.quantity || 0) * bCost;

            itemDetailRows.push({
              'No. Invoice': tx.invoiceNumber,
              'Tanggal Transaksi': formatDateTime(tx.timestamp),
              'Kasir': tx.cashierName,
              'Pelanggan': custName,
              'Kategori Pelanggan': profile?.customerCategory || tx.customerCategory || 'UMUM',
              'Nama Produk': item.productName + (item.selectedVariant ? ` (${item.selectedVariant})` : ''),
              'Kategori': itemCat,
              'Harga Khusus Kategori': item.isCustomerSpecialPrice ? `Khusus (${item.customerPriceCategory || 'Kategori'})` : 'Standar',
              'Qty Terjual': item.quantity,
              'Satuan': item.unitName || 'PCS',
              'Harga Jual Satuan (Rp)': item.unitPrice,
              'Subtotal Omzet Item (Rp)': itemSubtotal,
              'No. Batch Terpakai (batchNumber)': b.batchNumber || b.batchId,
              'Tgl Kadaluarsa Batch': b.expiryDate || '-',
              'Qty Diambil dari Batch': b.quantity,
              'HPP Modal Batch (costPrice) (Rp)': bCost,
              'Total Beban HPP Batch (Rp)': bTotalCost,
              'Status Alokasi FIFO': 'Alokasi Batch FIFO Murni',
            });
          });
        } else {
          const unitCost = item.isService ? 0 : (item.costPrice !== undefined ? item.costPrice : (prod?.costPrice || 0));
          const baseUnits = (item.quantity || 0) * (item.conversionFactor || 1);
          const totalCost = baseUnits * unitCost;

          itemDetailRows.push({
            'No. Invoice': tx.invoiceNumber,
            'Tanggal Transaksi': formatDateTime(tx.timestamp),
            'Kasir': tx.cashierName,
            'Pelanggan': custName,
            'Kategori Pelanggan': profile?.customerCategory || tx.customerCategory || 'UMUM',
            'Nama Produk': item.productName + (item.selectedVariant ? ` (${item.selectedVariant})` : ''),
            'Kategori': itemCat,
            'Harga Khusus Kategori': item.isCustomerSpecialPrice ? `Khusus (${item.customerPriceCategory || 'Kategori'})` : 'Standar',
            'Qty Terjual': item.quantity,
            'Satuan': item.unitName || 'PCS',
            'Harga Jual Satuan (Rp)': item.unitPrice,
            'Subtotal Omzet Item (Rp)': itemSubtotal,
            'No. Batch Terpakai (batchNumber)': item.isService ? 'Layanan/Jasa' : 'Non-Batch / Rekaman Awal',
            'Tgl Kadaluarsa Batch': '-',
            'Qty Diambil dari Batch': baseUnits,
            'HPP Modal Batch (costPrice) (Rp)': unitCost,
            'Total Beban HPP Batch (Rp)': totalCost,
            'Status Alokasi FIFO': item.isService ? 'Jasa Tanpa HPP' : 'HPP Tersimpan (Fallback)',
          });
        }
      });
    });

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    const ws2 = XLSX.utils.json_to_sheet(itemDetailRows);

    // Auto-fit column widths
    const setColWidths = (ws: any, data: any[]) => {
      if (!data || data.length === 0) return;
      const keys = Object.keys(data[0]);
      ws['!cols'] = keys.map((k) => {
        const maxLen = Math.max(k.length, ...data.map((d) => String(d[k] || '').length));
        return { wch: Math.min(Math.max(maxLen + 3, 10), 70) };
      });
    };
    setColWidths(ws1, summaryData);
    setColWidths(ws2, itemDetailRows);

    XLSX.utils.book_append_sheet(wb, ws1, 'Ringkasan Transaksi FIFO');
    XLSX.utils.book_append_sheet(wb, ws2, 'Detail Item & Batch FIFO');

    const cleanTitle = storeTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Laporan_Transaksi_FIFO_${cleanTitle}_${todayStr}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const openPdfExportModal = (preferredMode?: 'TRANSACTIONS' | 'DAILY_PNL') => {
    sound.playTap();
    setPdfModalFeedback(null);
    setIsCopiedWaText(false);
    if (preferredMode) {
      setPdfReportType(preferredMode);
    } else if (selectedTxIds.length > 0) {
      setPdfReportType('TRANSACTIONS');
    }
    setTxExportScope(selectedTxIds.length > 0 ? 'SELECTED' : 'FILTERED');
    if (startDate && (!endDate || startDate === endDate)) {
      setDailyReportDate(startDate);
    } else if (endDate && !startDate) {
      setDailyReportDate(endDate);
    }
    setIsPdfExportModalOpen(true);
  };

  const buildCurrentPdfDocument = () => {
    if (pdfReportType === 'DAILY_PNL') {
      const { doc, filename } = generateDailyProfitLossPdf(
        transactions,
        dailyReportDate,
        storeSettings,
        products,
        customers
      );
      return { doc, filename };
    }

    const dateRangeStr = startDate || endDate ? ` • ${startDate || '...'} s/d ${endDate || '...'}` : '';
    const custStr = customerNameFilter.trim() ? ` • Pelanggan: ${customerNameFilter.trim()}` : '';
    const scopeLabel =
      txExportScope === 'SELECTED' && selectedTransactionsList.length > 0
        ? `${selectedTransactionsList.length} Transaksi Terpilih`
        : `Filter: ${categoryFilter} • ${methodFilter}${dateRangeStr}${custStr}`;

    const { doc, filename } = generateSelectedTransactionsPdf(
      targetTransactionsForPdf,
      storeSettings,
      products,
      customers,
      {
        titleLabel:
          txExportScope === 'SELECTED' && selectedTransactionsList.length > 0
            ? 'LAPORAN TRANSAKSI TERPILIH'
            : 'LAPORAN TRANSAKSI PENJUALAN',
        filterSubtitle: scopeLabel,
        includeItemDetails: includeItemDetailsInPdf,
      }
    );
    return { doc, filename };
  };

  const handleSavePdfLocally = () => {
    sound.playTap();
    const hasData =
      pdfReportType === 'DAILY_PNL'
        ? dailyPnlPreviewData.transactionCount > 0
        : targetTransactionsForPdf.length > 0;
    if (!hasData) {
      setPdfModalFeedback({
        type: 'warning',
        text: 'Tidak ada data transaksi untuk diekspor pada pilihan saat ini.',
      });
      return;
    }
    const { doc, filename } = buildCurrentPdfDocument();
    doc.save(filename);
    setPdfModalFeedback({
      type: 'success',
      text: `File PDF "${filename}" berhasil disimpan ke perangkat Anda.`,
    });
  };

  const handleSharePdfViaWhatsApp = async () => {
    sound.playTap();
    const hasData =
      pdfReportType === 'DAILY_PNL'
        ? dailyPnlPreviewData.transactionCount > 0
        : targetTransactionsForPdf.length > 0;
    if (!hasData) {
      setPdfModalFeedback({
        type: 'warning',
        text: 'Tidak ada data transaksi untuk dibagikan pada pilihan saat ini.',
      });
      return;
    }

    const { doc, filename } = buildCurrentPdfDocument();
    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

    const shareTitle =
      pdfReportType === 'DAILY_PNL'
        ? `Ringkasan Laba Rugi Harian (${dailyReportDate})`
        : `Laporan Transaksi (${targetTransactionsForPdf.length} Nota)`;

    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };

    if (typeof nav.share === 'function' && nav.canShare && nav.canShare({ files: [pdfFile] })) {
      try {
        await nav.share({
          files: [pdfFile],
          title: shareTitle,
          text: pdfWaMessage,
        });
        setPdfModalFeedback({
          type: 'success',
          text: `Berhasil membuka menu berbagi dengan file PDF "${filename}". Pilih WhatsApp untuk mengirim.`,
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    // Fallback: download PDF locally so user can attach it directly in WhatsApp
    doc.save(filename);
    setPdfModalFeedback({
      type: 'info',
      text: `PDF "${filename}" telah diunduh otomatis. Klik tombol "Buka WhatsApp Sekarang" di bawah lalu lampirkan file PDF tersebut ke chat WhatsApp.`,
    });
  };

  const handleCopyWaSummary = async () => {
    sound.playTap();
    try {
      await navigator.clipboard.writeText(pdfWaMessage);
      setIsCopiedWaText(true);
      setTimeout(() => setIsCopiedWaText(false), 2000);
    } catch {
      setPdfModalFeedback({
        type: 'info',
        text: 'Silakan salin teks ringkasan secara manual dari kotak pratinjau pesan.',
      });
    }
  };

  const handleDownloadSingleTxPdf = (tx: Transaction) => {
    sound.playTap();
    const { doc, filename } = generateSingleTransactionPdf(tx, storeSettings, products, customers);
    doc.save(filename);
    setActionBanner({
      type: 'success',
      text: `Invoice PDF "${filename}" berhasil diunduh.`,
    });
  };

  const handleShareSingleTxPdf = async (tx: Transaction) => {
    sound.playTap();
    const { doc, filename } = generateSingleTransactionPdf(tx, storeSettings, products, customers);
    const pdfBlob = doc.output('blob');
    const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };

    if (typeof nav.share === 'function' && nav.canShare && nav.canShare({ files: [pdfFile] })) {
      try {
        await nav.share({
          files: [pdfFile],
          title: `Invoice ${tx.invoiceNumber}`,
          text: buildWaMessage(tx),
        });
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    doc.save(filename);
    handleOpenWaModal(tx);
    setWaNotice(`PDF "${filename}" telah diunduh. Lampirkan file PDF tersebut setelah WhatsApp terbuka.`);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Omzet Penjualan
            </div>
            <div className="text-xl md:text-2xl font-black text-slate-900 font-mono mt-1">
              {formatRupiah(totalRevenue)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Dari seluruh metode bayar</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Jumlah Transaksi
            </div>
            <div className="text-xl md:text-2xl font-black text-sky-700 font-mono mt-1">
              {totalTxCount} Nota
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Struk tercetak</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Rata-rata Transaksi
            </div>
            <div className="text-xl md:text-2xl font-black text-indigo-700 font-mono mt-1">
              {formatRupiah(avgBasket)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Nilai per keranjang</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Poin Diberikan
            </div>
            <div className="text-xl md:text-2xl font-black text-amber-600 font-mono mt-1">
              +{totalPointsDistributed} Pts
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Loyalitas member</div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          {/* Row 1: Search Invoice/Item, Filter Nama Pelanggan, & Filter Kategori */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
            {/* Search Input */}
            <div className="relative md:col-span-5 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari no. invoice, kasir, atau nama produk/jasa..."
                className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500 font-medium"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Hapus kata kunci pencarian"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Nama Pelanggan */}
            <div className="relative md:col-span-4 w-full">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600 pointer-events-none" />
              <input
                type="text"
                list="tx-customer-names-list"
                value={customerNameFilter}
                onChange={(e) => setCustomerNameFilter(e.target.value)}
                placeholder="Filter nama pelanggan (pilih / ketik)..."
                className="w-full pl-10 pr-8 py-2.5 bg-emerald-50/40 border border-emerald-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-emerald-500 font-semibold"
              />
              <datalist id="tx-customer-names-list">
                {customerNameSuggestions.map((custName) => (
                  <option key={custName} value={custName} />
                ))}
              </datalist>
              {customerNameFilter && (
                <button
                  type="button"
                  onClick={() => setCustomerNameFilter('')}
                  title="Hapus filter nama pelanggan"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Dropdown Filter Kategori (Barang / Jasa) */}
            <div className="relative md:col-span-3 w-full">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-sky-600">
                <Tag className="w-4 h-4" />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => {
                  sound.playTap();
                  setCategoryFilter(e.target.value);
                }}
                className="w-full pl-10 pr-9 py-2.5 bg-sky-50/60 border border-sky-200 rounded-xl text-xs md:text-sm font-bold text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer appearance-none shadow-2xs"
              >
                <option value="ALL">Semua Kategori (Barang & Jasa)</option>
                <option value="ALL_BARANG">📦 Hanya Barang Fisik</option>
                <option value="ALL_JASA">✂️ Hanya Jasa & Layanan</option>
                {categories.length > 0 && (
                  <optgroup label="Spesifik Kategori Produk / Jasa">
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        🏷️ Kategori: {c.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Row 2: Rentang Tanggal & Action / Export Buttons */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            {/* Rentang Tanggal (Dari - Sampai + Preset Cepat) */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                <Calendar className="w-3.5 h-3.5 text-sky-600" />
                <span>Rentang Tanggal:</span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="relative">
                  <input
                    type="date"
                    value={startDate}
                    max={endDate || undefined}
                    onChange={(e) => {
                      sound.playTap();
                      setStartDate(e.target.value);
                    }}
                    title="Tanggal Mulai"
                    aria-label="Tanggal Mulai"
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <span className="text-xs font-bold text-slate-400">s/d</span>
                <div className="relative">
                  <input
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => {
                      sound.playTap();
                      setEndDate(e.target.value);
                    }}
                    title="Tanggal Akhir"
                    aria-label="Tanggal Akhir"
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => applyDateRangePreset('TODAY')}
                  className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                    startDate && startDate === endDate && startDate === getLocalDateKey(Date.now())
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => applyDateRangePreset('7_DAYS')}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => applyDateRangePreset('THIS_MONTH')}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                >
                  Bulan Ini
                </button>
                {(startDate || endDate) && (
                  <button
                    type="button"
                    onClick={() => applyDateRangePreset('CLEAR')}
                    title="Hapus filter rentang tanggal"
                    className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                    <span>Hapus Tgl</span>
                  </button>
                )}
              </div>
            </div>

            {/* Export Buttons: Input Backdated, Excel (.xlsx), PDF Transaksi, PDF Laba Rugi Harian, & FIFO Audit */}
            <div className="flex items-center gap-2 w-full lg:w-auto shrink-0 flex-wrap">
              {isAdmin && onStartBackdatedTransaction && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onStartBackdatedTransaction();
                  }}
                  className="flex-1 lg:flex-initial px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Input Transaksi untuk Tanggal yang Sudah Lalu (Khusus Admin + Hitung Ulang Stok FIFO)"
                >
                  <History className="w-4 h-4 text-amber-100" />
                  <span>+ Transaksi Tanggal Lalu</span>
                </button>
              )}

              {onOpenFifoReconcile && (
                <button
                  onClick={() => {
                    sound.playTap();
                    onOpenFifoReconcile();
                  }}
                  className="flex-1 lg:flex-initial px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Audit & Rekonsiliasi Laba Hasil FIFO Massal"
                >
                  <Sparkles className="w-4 h-4 text-purple-300" />
                  <span>Audit Laba FIFO</span>
                </button>
              )}

              <button
                onClick={handleExportExcel}
                className="flex-1 lg:flex-initial px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Unduh Data Transaksi ke Format Excel (.xlsx) Lengkap dengan Rincian Kolom Batch (batchNumber) & HPP (costPrice)"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                <span>Excel</span>
              </button>

              <button
                type="button"
                onClick={() => openPdfExportModal('DAILY_PNL')}
                className="flex-1 lg:flex-initial px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Ekspor atau Bagikan Ringkasan Laba Rugi Harian (FIFO) ke PDF / WhatsApp"
              >
                <TrendingUp className="w-4 h-4 text-teal-200" />
                <span>PDF Laba Rugi Harian</span>
              </button>

              <button
                type="button"
                onClick={() => openPdfExportModal('TRANSACTIONS')}
                className="flex-1 lg:flex-initial px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                title="Ekspor Laporan Transaksi Terpilih / Terfilter ke PDF untuk Simpan Lokal atau Bagikan via WhatsApp"
              >
                <FileDown className="w-4 h-4 text-sky-400" />
                <span>
                  {selectedTxIds.length > 0 ? `PDF Terpilih (${selectedTxIds.length})` : 'Ekspor / Share PDF'}
                </span>
              </button>
            </div>
          </div>

          {/* Payment Method Pills & Active Filter Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5" />
                Metode:
              </span>
              {[
                { id: 'ALL', label: 'Semua Metode' },
                { id: 'CASH', label: 'Tunai (Cash)' },
                { id: 'QRIS_BCA', label: 'QRIS BCA' },
                { id: 'EDC_BCA', label: 'EDC BCA' },
                { id: 'TRANSFER_BCA', label: 'Transfer BCA' },
                { id: 'PIUTANG', label: 'Piutang' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    sound.playTap();
                    setMethodFilter(tab.id);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    methodFilter === tab.id
                      ? 'bg-sky-600 text-white font-bold shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-xs ml-auto">
              <span className="text-slate-500 font-medium">
                Menampilkan <strong className="text-slate-900">{filtered.length}</strong> dari {transactions.length} nota
                {hasActiveFilters && (
                  <>
                    {' '}• Omzet:{' '}
                    <strong className="text-sky-700 font-mono">
                      {formatRupiah(filtered.reduce((s, t) => s + t.finalAmount, 0))}
                    </strong>
                  </>
                )}
              </span>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Inline Action Feedback Banner */}
        {actionBanner && (
          <div className={`p-3 rounded-2xl border flex items-center justify-between gap-2 text-xs font-bold ${
            actionBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : actionBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-sky-50 border-sky-200 text-sky-800'
          }`}>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{actionBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionBanner(null)}
              className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Selected Transactions Floating Action Bar */}
        {selectedTxIds.length > 0 && (
          <div className="bg-slate-900 text-white p-3 md:px-4 rounded-2xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-400/30 text-sky-300 font-black font-mono">
                {selectedTransactionsList.length} Transaksi Dipilih
              </span>
              <span className="text-slate-300">
                Total Omzet:{' '}
                <strong className="text-white font-mono">
                  {formatRupiah(selectedTransactionsList.reduce((sum, t) => sum + t.finalAmount, 0))}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSelectedTxIds([]);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold cursor-pointer"
              >
                Batal Pilih
              </button>
              <button
                type="button"
                onClick={() => openPdfExportModal('TRANSACTIONS')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>Ekspor / Share PDF Terpilih</span>
              </button>
            </div>
          </div>
        )}

        {/* Transactions Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 pl-4 pr-2 w-10">
                    <button
                      type="button"
                      onClick={toggleSelectAllFiltered}
                      title={allFilteredSelected ? 'Batal pilih semua transaksi terfilter' : 'Pilih semua transaksi terfilter'}
                      className="text-slate-500 hover:text-sky-600 flex items-center justify-center cursor-pointer"
                    >
                      {allFilteredSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4">No. Invoice</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Kasir</th>
                  <th className="py-3 px-4">Pelanggan</th>
                  <th className="py-3 px-4">Komposisi Item</th>
                  <th className="py-3 px-4">Metode Bayar</th>
                  <th className="py-3 px-4">Total Akhir</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                      <p className="font-semibold text-slate-600 text-sm">Tidak ada riwayat transaksi</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Sesuaikan kata kunci pencarian, filter kategori, atau metode pembayaran.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((tx) => {
                    const custProfile = getCustomerProfile(tx);
                    const waPhone = getCustomerWhatsAppNumber(tx);
                    const hasService = tx.items.some((i) => i.isService);
                    const hasGoods = tx.items.some((i) => !i.isService);
                    const isChecked = selectedTxIds.includes(tx.id);

                    return (
                      <tr 
                        key={tx.id} 
                        className={`transition-colors cursor-pointer group ${
                          isChecked ? 'bg-sky-50/70 hover:bg-sky-100/60' : 'hover:bg-sky-50/40'
                        }`}
                        onClick={() => {
                          sound.playTap();
                          setSelectedDetailTx(tx);
                        }}
                      >
                        <td
                          className="py-3.5 pl-4 pr-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectTx(tx.id);
                          }}
                        >
                          <button
                            type="button"
                            aria-label={`Pilih transaksi ${tx.invoiceNumber}`}
                            className="text-slate-400 hover:text-sky-600 flex items-center justify-center cursor-pointer"
                          >
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-sky-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-black text-slate-900 group-hover:text-sky-700">
                          <div>{tx.invoiceNumber}</div>
                          {tx.auditLogs && tx.auditLogs.length > 0 && (
                            <span
                              title={`Invoice ini telah diubah ${tx.auditLogs.length}× oleh Admin`}
                              className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9.5px] font-sans font-bold"
                            >
                              <History className="w-2.5 h-2.5" />
                              Diubah ×{tx.auditLogs.length}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-slate-500 text-xs">
                          {formatDateTime(tx.timestamp)}
                        </td>

                        <td className="py-3.5 px-4 text-slate-700 font-medium">
                          {tx.cashierName.split(' ')[0]}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">
                              {tx.customerName || 'Pelanggan Umum'}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              {(custProfile?.customerCategory || tx.customerCategory) && (
                                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-black uppercase border ${getCustomerCategoryBadge(custProfile?.customerCategory || tx.customerCategory).bg} ${getCustomerCategoryBadge(custProfile?.customerCategory || tx.customerCategory).text} ${getCustomerCategoryBadge(custProfile?.customerCategory || tx.customerCategory).border}`}>
                                  🏷️ {custProfile?.customerCategory || tx.customerCategory}
                                </span>
                              )}
                              {custProfile?.membershipTier && (
                                <span className="text-[10px] font-bold text-sky-600">
                                  Member: {custProfile.membershipTier}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-800">
                              {tx.items.length} item ({tx.items.reduce((a, b) => a + b.quantity, 0)} unit)
                            </span>
                            {hasGoods && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Barang
                              </span>
                            )}
                            {hasService && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                                Jasa
                              </span>
                            )}
                          </div>
                          {tx.notes?.trim() && (
                            <div
                              className="mt-1 text-[10.5px] font-sans text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md truncate max-w-[220px]"
                              title={tx.notes.trim()}
                            >
                              📝 {tx.notes.trim()}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                            tx.paymentMethod === 'PIUTANG'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}>
                            {tx.paymentMethod.replace(/_/g, ' ')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-black text-sky-700 text-sm tabular-nums">
                          {formatRupiah(tx.finalAmount)}
                        </td>

                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Tombol Edit Invoice (Khusus Admin) */}
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditInvoiceModal(tx)}
                                title="Edit Invoice (Catatan / Detail Pembayaran) — Khusus Admin"
                                className="px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-2xs border border-amber-200 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                                <span>Edit Invoice</span>
                              </button>
                            )}

                            {/* Tombol Detail Transaksi */}
                            <button
                              onClick={() => {
                                sound.playTap();
                                setSelectedDetailTx(tx);
                              }}
                              title="Buka Detail Transaksi & Kirim Struk WhatsApp"
                              className="px-2.5 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-2xs border border-sky-200 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5 text-sky-600" />
                              <span>Detail</span>
                            </button>

                            {/* Tombol WhatsApp Cepat */}
                            <button
                              onClick={() => handleOpenWaModal(tx)}
                              title={waPhone ? `Kirim WhatsApp ke ${waPhone}` : 'Kirim Struk via WhatsApp'}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-2xs border border-emerald-200 cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="hidden sm:inline">WA</span>
                            </button>

                            {/* Tombol Struk Thermal */}
                            <button
                              onClick={() => {
                                sound.playTap();
                                onViewReceipt(tx);
                              }}
                              title="Cetak Struk Thermal (ESC/POS)"
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span className="hidden md:inline">Struk</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* MODAL DETAIL TRANSAKSI */}
        {selectedDetailTx && (() => {
          const custProfile = getCustomerProfile(selectedDetailTx);
          const profileWaNumber = custProfile?.whatsapp || custProfile?.phone || '';
          const effectiveWaNumber = getCustomerWhatsAppNumber(selectedDetailTx);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs select-none overflow-y-auto">
              <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto flex flex-col max-h-[92vh]">
                
                {/* Header Modal Detail */}
                <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-400/30">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-sm md:text-base">Detail Transaksi</h3>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                          {selectedDetailTx.invoiceNumber}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatDateTime(selectedDetailTx.timestamp)} • Kasir: {selectedDetailTx.cashierName}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedDetailTx(null)}
                    className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-5 overflow-y-auto space-y-4 text-xs md:text-sm">
                  
                  {/* Card Profil Pelanggan & Tombol WhatsApp Utama */}
                  <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-emerald-700" />
                          <span className="font-bold text-slate-900 text-sm">
                            {selectedDetailTx.customerName || 'Pelanggan Umum (Walk-in)'}
                          </span>
                          {custProfile?.membershipTier && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-200 text-emerald-900">
                              {custProfile.membershipTier}
                            </span>
                          )}
                        </div>

                        {/* Status Nomor WhatsApp Pelanggan */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                          {profileWaNumber ? (
                            <div className="flex items-center gap-1.5 font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                              <Phone className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{profileWaNumber}</span>
                              <span className="text-[10px] font-sans font-semibold text-emerald-700 bg-white/70 px-1.5 py-0.5 rounded">
                                Profil Pelanggan
                              </span>
                            </div>
                          ) : effectiveWaNumber ? (
                            <div className="flex items-center gap-1.5 font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg">
                              <Phone className="w-3.5 h-3.5 text-emerald-600" />
                              <span>{effectiveWaNumber}</span>
                              <span className="text-[10px] font-sans font-semibold text-slate-600 bg-white/70 px-1.5 py-0.5 rounded">
                                Dari Nota Checkout
                              </span>
                            </div>
                          ) : (
                            <span className="text-amber-700 bg-amber-100/80 px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Belum ada nomor WhatsApp tersimpan di profil
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Tombol Kirim Struk via WhatsApp */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleDirectSendWaFromDetail(selectedDetailTx)}
                          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition-all active:scale-98"
                          title="Kirim Struk Transaksi Lengkap ke WhatsApp Pelanggan"
                        >
                          <MessageCircle className="w-4 h-4 fill-white" />
                          <span>Kirim Struk via WhatsApp</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Rincian Produk & Jasa dalam Transaksi */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-800 flex items-center gap-1.5">
                        <Layers className="w-4 h-4 text-sky-600" />
                        <span>Daftar Item & Layanan</span>
                      </h4>
                      <span className="text-xs text-slate-500 font-mono">
                        {selectedDetailTx.items.length} item • {selectedDetailTx.items.reduce((a, b) => a + b.quantity, 0)} total unit
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2.5 px-3">Item / Layanan</th>
                            <th className="py-2.5 px-3">Kategori</th>
                            <th className="py-2.5 px-3 text-center">Qty & Satuan</th>
                            <th className="py-2.5 px-3 text-right">Harga</th>
                            <th className="py-2.5 px-3 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                          {selectedDetailTx.items.map((item, idx) => {
                            const cat = getItemCategory(item);
                            return (
                              <tr key={idx} className="hover:bg-slate-50/60">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-slate-900">
                                    {item.productName}
                                  </div>
                                  {item.selectedVariant && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 mt-0.5">
                                      Varian: {item.selectedVariant}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                                    item.isService
                                      ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                      : 'bg-sky-100 text-sky-800 border border-sky-200'
                                  }`}>
                                    {item.isService ? '✂️' : '📦'} {cat}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center font-mono">
                                  <span className="font-bold text-slate-800">{item.quantity}</span> {item.unitName}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                                  {formatRupiah(item.unitPrice)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                  {formatRupiah(item.totalAmount)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Rekap Finansial & Pembayaran */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                    <div className="flex justify-between text-slate-600">
                      <span>Subtotal Belanja:</span>
                      <span className="font-mono font-semibold">{formatRupiah(selectedDetailTx.subtotal)}</span>
                    </div>

                    {selectedDetailTx.discount > 0 && (
                      <div className="flex justify-between text-rose-600">
                        <span>Diskon Transaksi:</span>
                        <span className="font-mono font-semibold">-{formatRupiah(selectedDetailTx.discount)}</span>
                      </div>
                    )}

                    {selectedDetailTx.membershipDiscountAmount && selectedDetailTx.membershipDiscountAmount > 0 ? (
                      <div className="flex justify-between text-emerald-600">
                        <span>Diskon Membership:</span>
                        <span className="font-mono font-semibold">-{formatRupiah(selectedDetailTx.membershipDiscountAmount)}</span>
                      </div>
                    ) : null}

                    {selectedDetailTx.pointsDiscountAmount > 0 && (
                      <div className="flex justify-between text-amber-600">
                        <span>Diskon Tukar Poin ({selectedDetailTx.pointsUsed || 0} Pts):</span>
                        <span className="font-mono font-semibold">-{formatRupiah(selectedDetailTx.pointsDiscountAmount)}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm md:text-base font-black text-slate-900">
                      <span>Total Akhir Pembayaran:</span>
                      <span className="font-mono text-sky-700 text-lg">{formatRupiah(selectedDetailTx.finalAmount)}</span>
                    </div>

                    {/* Info Metode Bayar & Kembalian */}
                    <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Metode Pembayaran:</span>
                        <span className="font-bold text-slate-800 font-mono">
                          {selectedDetailTx.paymentMethod.replace(/_/g, ' ')}
                        </span>
                      </div>
                      {selectedDetailTx.paymentMethod === 'CASH' ? (
                        <div>
                          <span className="text-slate-400 block text-[10px]">Tunai / Kembalian:</span>
                          <span className="font-bold text-slate-800 font-mono">
                            {formatRupiah(selectedDetailTx.cashPaid || selectedDetailTx.finalAmount)} / Kembalian {formatRupiah(selectedDetailTx.cashChange || 0)}
                          </span>
                        </div>
                      ) : selectedDetailTx.paymentMethod === 'PIUTANG' ? (
                        <div>
                          <span className="text-rose-500 block text-[10px] font-bold">Status / Jatuh Tempo:</span>
                          <span className="font-bold text-rose-700 font-mono">
                            {selectedDetailTx.paymentStatus} {selectedDetailTx.dueDate ? `• ${selectedDetailTx.dueDate}` : ''}
                          </span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-slate-400 block text-[10px]">Status Pembayaran:</span>
                          <span className="font-bold text-emerald-700 font-mono">
                            {selectedDetailTx.paymentStatus}
                          </span>
                        </div>
                      )}

                      {selectedDetailTx.bankApprovalCode && (
                        <div>
                          <span className="text-slate-400 block text-[10px]">Kode Approval EDC:</span>
                          <span className="font-bold text-slate-800 font-mono">
                            {selectedDetailTx.bankApprovalCode}
                          </span>
                        </div>
                      )}

                      {selectedDetailTx.bankRefNumber && (
                        <div>
                          <span className="text-slate-400 block text-[10px]">No. Referensi / QRIS / Bank:</span>
                          <span className="font-bold text-slate-800 font-mono">
                            {selectedDetailTx.bankRefNumber}
                          </span>
                        </div>
                      )}
                    </div>

                    {selectedDetailTx.notes?.trim() && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-amber-700 block text-[10px] font-bold uppercase tracking-wider mb-1">
                          Catatan Transaksi (Permintaan Khusus / Internal):
                        </span>
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-950 whitespace-pre-wrap break-words">
                          {selectedDetailTx.notes.trim()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Audit Log Perubahan Invoice (Admin) */}
                  {selectedDetailTx.auditLogs && selectedDetailTx.auditLogs.length > 0 && (
                    <div className="bg-indigo-50/70 rounded-2xl p-4 border border-indigo-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs md:text-sm">
                          <History className="w-4 h-4 text-indigo-600" />
                          <span>Audit Log Perubahan Invoice</span>
                        </h4>
                        <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-black font-mono">
                          {selectedDetailTx.auditLogs.length} Riwayat
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {[...selectedDetailTx.auditLogs].reverse().map((entry) => (
                          <div
                            key={entry.id}
                            className="bg-white rounded-xl p-3 border border-indigo-100 shadow-2xs space-y-2"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                                <span>{entry.editedByName}</span>
                                <span className="px-1.5 py-0.2 rounded bg-slate-900 text-white text-[9.5px] font-mono">
                                  {entry.editedByRole}
                                </span>
                              </div>
                              <span className="text-slate-500 font-mono text-[10.5px]">
                                {formatDateTime(entry.timestamp)}
                              </span>
                            </div>

                            {entry.reason && (
                              <div className="text-[11px] text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
                                <span className="font-bold text-slate-500">Alasan:</span> {entry.reason}
                              </div>
                            )}

                            <div className="space-y-1">
                              {entry.changes.map((chg, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="text-[11px] flex flex-wrap items-baseline gap-1.5 text-slate-700"
                                >
                                  <span className="font-bold text-indigo-900">{chg.label}:</span>
                                  <span className="line-through text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded font-mono text-[10.5px]">
                                    {chg.oldValue}
                                  </span>
                                  <span className="text-slate-400">→</span>
                                  <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded font-mono font-bold text-[10.5px]">
                                    {chg.newValue}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* Footer Modal Detail */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedDetailTx(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-200 font-bold text-xs cursor-pointer"
                  >
                    Tutup
                  </button>

                  <div className="flex flex-wrap items-center gap-2">
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleOpenEditInvoiceModal(selectedDetailTx)}
                        className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        title="Edit Catatan atau Detail Pembayaran Invoice (Admin)"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                        <span>Edit Invoice</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDownloadSingleTxPdf(selectedDetailTx)}
                      className="px-3.5 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      title="Unduh Invoice Transaksi Ini ke File PDF"
                    >
                      <FileDown className="w-3.5 h-3.5 text-sky-600" />
                      <span>Simpan PDF</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShareSingleTxPdf(selectedDetailTx)}
                      className="px-3.5 py-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                      title="Bagikan PDF Invoice via WhatsApp"
                    >
                      <Share2 className="w-3.5 h-3.5 text-teal-600" />
                      <span>Bagikan PDF</span>
                    </button>

                    <button
                      onClick={() => {
                        sound.playTap();
                        onViewReceipt(selectedDetailTx);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak Struk Thermal</span>
                    </button>

                    <button
                      onClick={() => handleOpenWaModal(selectedDetailTx)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5 fill-white" />
                      <span>Kirim WA</span>
                    </button>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

        {/* Modal Hubungi via WhatsApp / Pratinjau Pesan */}
        {selectedTxForWa && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
              <div className="p-4 bg-emerald-600 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <MessageCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm">Kirim Struk via WhatsApp</h3>
                    <p className="text-[11px] text-emerald-100">
                      Invoice: {selectedTxForWa.invoiceNumber}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedTxForWa(null)}
                  className="p-1 rounded-lg text-emerald-200 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4">
                {waNotice && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{waNotice}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor WhatsApp Tujuan:
                  </label>
                  <input
                    type="tel"
                    placeholder="Contoh: 08123456789 atau 628123456789"
                    value={waPhoneNumber}
                    onChange={(e) => setWaPhoneNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Sistem otomatis mengonversi awalan 08 ke kode negara +62 Indonesia.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Template Pesan Struk / Ringkasan:
                  </label>
                  <textarea
                    rows={8}
                    value={waCustomMessage}
                    onChange={(e) => setWaCustomMessage(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setSelectedTxForWa(null)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    onClick={handleSendWa}
                    disabled={!waPhoneNumber.trim()}
                    className="px-5 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white shadow-md shadow-emerald-500/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Buka WhatsApp Sekarang</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL EKSPOR & BAGIKAN LAPORAN PDF (TRANSAKSI TERPILIH / LABA RUGI HARIAN) */}
        {isPdfExportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs select-none overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 my-auto flex flex-col max-h-[92vh]">
              {/* Header */}
              <div className="p-4 md:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-400/30">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm md:text-base">Ekspor &amp; Bagikan Laporan PDF</h3>
                    <p className="text-[11px] text-slate-400">
                      Simpan laporan terformat ke perangkat atau bagikan langsung melalui WhatsApp
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPdfExportModalOpen(false)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-5 overflow-y-auto space-y-4 text-xs">
                {/* Report Type Switcher */}
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setPdfReportType('TRANSACTIONS');
                      setPdfModalFeedback(null);
                    }}
                    className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      pdfReportType === 'TRANSACTIONS'
                        ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Receipt className="w-4 h-4 text-sky-600" />
                    <span>Laporan Transaksi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setPdfReportType('DAILY_PNL');
                      setPdfModalFeedback(null);
                    }}
                    className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      pdfReportType === 'DAILY_PNL'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-emerald-700'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>Ringkasan Laba Rugi Harian</span>
                  </button>
                </div>

                {/* Config for Selected / Filtered Transactions */}
                {pdfReportType === 'TRANSACTIONS' ? (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <div className="font-bold text-slate-800">Sumber Data Transaksi PDF:</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={selectedTransactionsList.length === 0}
                        onClick={() => {
                          sound.playTap();
                          setTxExportScope('SELECTED');
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          txExportScope === 'SELECTED' && selectedTransactionsList.length > 0
                            ? 'bg-sky-50 border-sky-500 text-sky-900 ring-1 ring-sky-500'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-black flex items-center justify-between">
                          <span>Transaksi Terpilih (Checkbox)</span>
                          <span className="font-mono text-sky-700">{selectedTransactionsList.length}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {selectedTransactionsList.length > 0
                            ? 'Hanya mengekspor nota yang Anda centang'
                            : 'Centang baris transaksi pada tabel terlebih dahulu'}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setTxExportScope('FILTERED');
                        }}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          txExportScope === 'FILTERED' || selectedTransactionsList.length === 0
                            ? 'bg-sky-50 border-sky-500 text-sky-900 ring-1 ring-sky-500'
                            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-black flex items-center justify-between">
                          <span>Semua Transaksi Terfilter</span>
                          <span className="font-mono text-sky-700">{filtered.length}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Mengikuti pencarian, kategori, metode &amp; tanggal aktif
                        </div>
                      </button>
                    </div>

                    <label className="flex items-center gap-2 pt-1 cursor-pointer select-none text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={includeItemDetailsInPdf}
                        onChange={(e) => setIncludeItemDetailsInPdf(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>Sertakan tabel rincian item &amp; HPP FIFO per transaksi di PDF</span>
                    </label>
                  </div>
                ) : (
                  <div className="space-y-3 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-slate-900">Pilih Tanggal Laporan Laba Rugi:</div>
                        <div className="text-[11px] text-slate-500">
                          Menghitung Omzet, Diskon, HPP Metode FIFO, Laba Kotor, dan Top Produk harian
                        </div>
                      </div>
                      <input
                        type="date"
                        value={dailyReportDate}
                        onChange={(e) => {
                          sound.playTap();
                          if (e.target.value) setDailyReportDate(e.target.value);
                        }}
                        className="px-3 py-2 bg-white border border-emerald-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:border-emerald-600"
                      />
                    </div>

                    {/* Quick Date Presets */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setDailyReportDate(getLocalDateKey(Date.now()));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          dailyReportDate === getLocalDateKey(Date.now())
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Hari Ini
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setDailyReportDate(getLocalDateKey(Date.now() - 86400000));
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          dailyReportDate === getLocalDateKey(Date.now() - 86400000)
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Kemarin
                      </button>
                      {availableTxDates
                        .filter(
                          (d) =>
                            d !== getLocalDateKey(Date.now()) &&
                            d !== getLocalDateKey(Date.now() - 86400000)
                        )
                        .slice(0, 4)
                        .map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setDailyReportDate(d);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border cursor-pointer ${
                              dailyReportDate === d
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                    </div>
                  </div>
                )}

                {/* Live Summary Preview */}
                {(() => {
                  const previewCount =
                    pdfReportType === 'DAILY_PNL'
                      ? dailyPnlPreviewData.transactionCount
                      : txPdfPreviewStats.count;
                  const previewRevenue =
                    pdfReportType === 'DAILY_PNL'
                      ? dailyPnlPreviewData.totalNetRevenue
                      : txPdfPreviewStats.revenue;
                  const previewCogs =
                    pdfReportType === 'DAILY_PNL'
                      ? dailyPnlPreviewData.totalFifoCogs
                      : txPdfPreviewStats.cogs;
                  const previewProfit =
                    pdfReportType === 'DAILY_PNL'
                      ? dailyPnlPreviewData.grossProfit
                      : txPdfPreviewStats.profit;
                  const previewMargin =
                    pdfReportType === 'DAILY_PNL'
                      ? dailyPnlPreviewData.grossMarginPercent
                      : txPdfPreviewStats.margin;

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="text-[10.5px] font-bold text-slate-500">Jumlah Nota</div>
                        <div className="text-sm font-black font-mono text-slate-900 mt-0.5">
                          {formatNumber(previewCount)} Nota
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
                        <div className="text-[10.5px] font-bold text-sky-800">Total Omzet</div>
                        <div className="text-sm font-black font-mono text-sky-700 mt-0.5">
                          {formatRupiah(previewRevenue)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="text-[10.5px] font-bold text-slate-500">Total HPP FIFO</div>
                        <div className="text-sm font-black font-mono text-slate-700 mt-0.5">
                          {formatRupiah(previewCogs)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                        <div className="text-[10.5px] font-bold text-emerald-800">
                          Laba Kotor ({previewMargin.toFixed(1)}%)
                        </div>
                        <div
                          className={`text-sm font-black font-mono mt-0.5 ${
                            previewProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {formatRupiah(previewProfit)}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* WhatsApp Sharing Options */}
                <div className="bg-emerald-50/40 border border-emerald-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                      <span>Bagikan via WhatsApp</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyWaSummary}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{isCopiedWaText ? 'Tersalin!' : 'Salin Teks Ringkasan'}</span>
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Nomor WhatsApp Tujuan (Opsional — Owner / Akunting / Grup):
                    </label>
                    <input
                      type="tel"
                      value={pdfWaPhone}
                      onChange={(e) => setPdfWaPhone(e.target.value)}
                      placeholder="Contoh: 08123456789 (kosongkan untuk pilih kontak di WhatsApp)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Pratinjau Pesan Ringkasan WhatsApp:
                    </label>
                    <textarea
                      rows={5}
                      value={pdfWaMessage}
                      onChange={(e) => setPdfWaMessage(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-[11px] font-mono focus:outline-none focus:border-emerald-500 resize-none"
                    />
                  </div>
                </div>

                {/* Inline Modal Feedback */}
                {pdfModalFeedback && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 ${
                      pdfModalFeedback.type === 'success'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : pdfModalFeedback.type === 'warning'
                        ? 'bg-amber-50 border-amber-200 text-amber-800'
                        : 'bg-sky-50 border-sky-200 text-sky-800'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{pdfModalFeedback.text}</span>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPdfExportModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-200 font-bold text-xs cursor-pointer"
                >
                  Tutup
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSavePdfLocally}
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <FileDown className="w-4 h-4 text-sky-400" />
                    <span>Simpan PDF ke Perangkat</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSharePdfViaWhatsApp}
                    className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Bagikan file PDF secara langsung atau unduh otomatis untuk dilampirkan"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Bagikan File PDF</span>
                  </button>

                  <a
                    href={buildWhatsAppShareHref(pdfWaPhone, pdfWaMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      sound.playTap();
                      const hasData =
                        pdfReportType === 'DAILY_PNL'
                          ? dailyPnlPreviewData.transactionCount > 0
                          : targetTransactionsForPdf.length > 0;
                      if (hasData) {
                        const { doc, filename } = buildCurrentPdfDocument();
                        doc.save(filename);
                        setPdfModalFeedback({
                          type: 'info',
                          text: `PDF "${filename}" diunduh ke perangkat & WhatsApp dibuka. Silakan lampirkan PDF tersebut di chat WhatsApp.`,
                        });
                      }
                    }}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <MessageCircle className="w-4 h-4 fill-white" />
                    <span>Kirim via WhatsApp</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL EDIT INVOICE (KHUSUS ADMIN) */}
        {isAdmin && editingInvoiceTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 my-auto flex flex-col max-h-[92vh]">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
                    <Edit3 className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm">Edit Invoice</h3>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-mono font-bold">
                        ADMIN ONLY
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                      {editingInvoiceTx.invoiceNumber} • Total {formatRupiah(editingInvoiceTx.finalAmount)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingInvoiceTx(null)}
                  className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditedInvoice} className="p-5 overflow-y-auto space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Perubahan catatan atau detail metode pembayaran pasca-transaksi oleh{' '}
                    <strong>{currentUser?.name}</strong> akan otomatis direkam permanen ke{' '}
                    <strong>Audit Log Transaksi</strong>.
                  </p>
                </div>

                {/* Metode & Status Pembayaran */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Metode Pembayaran
                    </label>
                    <select
                      value={editPaymentMethod}
                      onChange={(e) => {
                        const nextMethod = e.target.value;
                        setEditPaymentMethod(nextMethod);
                        if (nextMethod === 'PIUTANG') {
                          setEditPaymentStatus('BELUM_LUNAS');
                        } else {
                          setEditPaymentStatus('LUNAS');
                        }
                        if (nextMethod === 'CASH' && (!editCashPaid || Number(editCashPaid) < editingInvoiceTx.finalAmount)) {
                          setEditCashPaid(String(editingInvoiceTx.finalAmount));
                        }
                        setEditError('');
                      }}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                    >
                      {availablePaymentMethodOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Status Pembayaran
                    </label>
                    <select
                      value={editPaymentStatus}
                      onChange={(e) => {
                        setEditPaymentStatus(e.target.value as 'LUNAS' | 'BELUM_LUNAS');
                        setEditError('');
                      }}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                    >
                      <option value="LUNAS">LUNAS</option>
                      <option value="BELUM_LUNAS">BELUM LUNAS</option>
                    </select>
                  </div>
                </div>

                {/* Detail Pembayaran Kontekstual */}
                {selectedEditMethodType === 'CASH' && (
                  <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-emerald-900 mb-1">
                        Nominal Uang Tunai Dibayar (Rp)
                      </label>
                      <input
                        type="number"
                        min={editingInvoiceTx.finalAmount}
                        value={editCashPaid}
                        onChange={(e) => {
                          setEditCashPaid(e.target.value);
                          setEditError('');
                        }}
                        className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-600"
                      />
                    </div>
                    <div>
                      <span className="block text-[11px] font-bold text-emerald-900 mb-1">
                        Kembalian Otomatis
                      </span>
                      <div className="px-3 py-2 bg-white/80 border border-emerald-200 rounded-xl font-mono font-black text-emerald-700">
                        {formatRupiah(
                          Math.max(0, (Number(editCashPaid) || 0) - editingInvoiceTx.finalAmount)
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {selectedEditMethodType === 'PIUTANG' && (
                  <div className="p-3.5 rounded-2xl bg-rose-50/70 border border-rose-200 space-y-2">
                    <label className="block text-[11px] font-bold text-rose-900">
                      Tanggal Jatuh Tempo Piutang
                    </label>
                    <input
                      type="date"
                      value={editDueDate}
                      onChange={(e) => {
                        setEditDueDate(e.target.value);
                        setEditError('');
                      }}
                      className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:border-rose-500"
                    />
                    {editingInvoiceTx.customerId && (
                      <p className="text-[11px] text-rose-800">
                        Saldo piutang pelanggan{' '}
                        <strong>{editingInvoiceTx.customerName || 'terdaftar'}</strong> akan
                        otomatis disesuaikan saat status piutang berubah.
                      </p>
                    )}
                  </div>
                )}

                {selectedEditMethodType !== 'CASH' && selectedEditMethodType !== 'PIUTANG' && (
                  <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-sky-950 mb-1">
                        Kode Approval EDC (Opsional)
                      </label>
                      <input
                        type="text"
                        value={editBankApprovalCode}
                        onChange={(e) => {
                          setEditBankApprovalCode(e.target.value);
                          setEditError('');
                        }}
                        placeholder="Misal: APPR-882910"
                        className="w-full px-3 py-2 bg-white border border-sky-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-sky-950 mb-1">
                        No. Referensi Transfer / QRIS
                      </label>
                      <input
                        type="text"
                        value={editBankRefNumber}
                        onChange={(e) => {
                          setEditBankRefNumber(e.target.value);
                          setEditError('');
                        }}
                        placeholder="Misal: REF-QRIS-99102"
                        className="w-full px-3 py-2 bg-white border border-sky-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                )}

                {/* Catatan Transaksi */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Catatan Transaksi (Permintaan Khusus / Keterangan Internal)
                  </label>
                  <textarea
                    rows={3}
                    value={editNotes}
                    onChange={(e) => {
                      setEditNotes(e.target.value);
                      setEditError('');
                    }}
                    placeholder="Tambahkan atau perbarui catatan transaksi..."
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-sky-500 resize-none"
                  />
                </div>

                {/* Alasan Perubahan (Audit Remark) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Alasan Perubahan (Audit Remark — Opsional)
                  </label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Misal: Koreksi metode bayar dari Tunai ke QRIS sesuai mutasi bank"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:border-sky-500"
                  />
                </div>

                {editError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingInvoiceTx(null)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-black flex items-center gap-1.5 shadow-md shadow-amber-600/20 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Simpan Perubahan &amp; Catat Audit</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
