import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Banknote, 
  QrCode, 
  CreditCard, 
  ArrowRightLeft, 
  Calendar, 
  CheckCircle2, 
  AlertTriangle, 
  Copy, 
  Check, 
  Sparkles,
  Smartphone,
  ShieldAlert,
  Award,
  ZoomIn,
  Plus,
  Minus,
  StickyNote,
  Clock,
  History
} from 'lucide-react';
import { PaymentMethod, Customer, StoreSettings, CustomPaymentMethod, PaymentMethodType } from '../types/pos';
import { DEFAULT_PAYMENT_METHODS } from '../utils/mockData';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { isCustomerMember, calculatePointsEarned } from '../utils/customerUtils';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  pointsDiscount: number;
  pointsUsed: number;
  maxRedeemablePoints?: number;
  onChangePointsToUse?: (points: number) => void;
  grandTotal: number;
  selectedCustomer: Customer | null;
  storeSettings: StoreSettings;
  membershipDiscount?: number;
  customerTier?: string;
  tierDiscountPercent?: number;
  isAdmin?: boolean;
  defaultBackdated?: boolean;
  onConfirmPayment: (paymentData: {
    paymentMethod: PaymentMethod;
    cashPaid?: number;
    cashChange?: number;
    bankApprovalCode?: string;
    bankRefNumber?: string;
    dueDate?: string;
    notes?: string;
    customTimestamp?: number;
  }) => void;
  onOpenCustomerModal: () => void;
}

const formatLocalDateInput = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatLocalTimeInput = (d: Date): string => {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
};

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  subtotal,
  pointsDiscount,
  pointsUsed,
  maxRedeemablePoints = 0,
  onChangePointsToUse,
  grandTotal,
  selectedCustomer,
  storeSettings,
  membershipDiscount = 0,
  customerTier = 'REGULER',
  tierDiscountPercent = 0,
  isAdmin = false,
  defaultBackdated = false,
  onConfirmPayment,
  onOpenCustomerModal,
}) => {
  // Active custom payment methods from store settings with guaranteed QRIS option
  const activePaymentMethods = useMemo<CustomPaymentMethod[]>(() => {
    const rawMethods = storeSettings.customPaymentMethods && storeSettings.customPaymentMethods.length > 0
      ? [...storeSettings.customPaymentMethods]
      : [...DEFAULT_PAYMENT_METHODS];

    // Ensure QRIS is always available
    const hasQris = rawMethods.some((m) => m.type === 'QRIS');
    if (!hasQris) {
      rawMethods.splice(1, 0, {
        id: 'pm_qris_standard',
        name: 'QRIS (Semua E-Wallet & M-Banking)',
        type: 'QRIS',
        isActive: true,
        isDefault: false,
        accountName: storeSettings.storeName,
        accountNumber: storeSettings.qrisNmid || storeSettings.bcaMerchantId || 'ID1020038918290',
        qrisImageUrl: storeSettings.qrisImageUrl,
        qrisImageName: storeSettings.qrisImageName,
        description: 'Scan kode QRIS langsung dari layar tablet kasir',
      });
    }

    return rawMethods.filter((m) => m.isActive);
  }, [storeSettings.customPaymentMethods, storeSettings.qrisImageUrl, storeSettings.qrisImageName, storeSettings.qrisNmid, storeSettings.bcaMerchantId, storeSettings.storeName]);

  const [selectedMethodId, setSelectedMethodId] = useState<string>('pm_cash');
  const [isQrisZoomed, setIsQrisZoomed] = useState<boolean>(false);

  const currentMethod = useMemo<CustomPaymentMethod>(() => {
    const found = activePaymentMethods.find((m) => m.id === selectedMethodId);
    return found || activePaymentMethods[0] || {
      id: 'pm_cash',
      name: 'Tunai (Cash)',
      type: 'CASH',
      isActive: true,
    };
  }, [activePaymentMethods, selectedMethodId]);

  // QRIS image resolution: prefers method-specific or storeSettings.qrisImageUrl
  const effectiveQrisImageUrl = currentMethod.qrisImageUrl || storeSettings.qrisImageUrl;
  const effectiveQrisImageName = currentMethod.qrisImageName || storeSettings.qrisImageName || 'QRIS-Statis.jpg';

  // Cash method states
  const [cashInput, setCashInput] = useState<string>(grandTotal.toString());

  // EDC / Card states
  const [cardType, setCardType] = useState<string>('DEBIT_BCA');
  const [approvalCode, setApprovalCode] = useState<string>('');
  const [traceNumber, setTraceNumber] = useState<string>('');

  // Transfer states
  const [transferRef, setTransferRef] = useState<string>('');
  const [copiedAccount, setCopiedAccount] = useState<boolean>(false);

  // Piutang states
  const [tenorDays, setTenorDays] = useState<number>(14);
  const [customDueDate, setCustomDueDate] = useState<string>('');
  const [debtNotes, setDebtNotes] = useState<string>('');

  // Transaction Note states (optional or forced per StoreSettings.requireTransactionNote)
  const [transactionNote, setTransactionNote] = useState<string>('');
  const [noteValidationError, setNoteValidationError] = useState<string | null>(null);
  const [isForceNotePromptOpen, setIsForceNotePromptOpen] = useState<boolean>(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const forcedNoteInputRef = useRef<HTMLTextAreaElement>(null);

  // QRIS simulation states
  const [qrisTimer, setQrisTimer] = useState<number>(300); // 5 mins

  // Admin Backdated Transaction states
  const [txDateMode, setTxDateMode] = useState<'NOW' | 'BACKDATED'>('NOW');
  const [backdateDateStr, setBackdateDateStr] = useState<string>(() =>
    formatLocalDateInput(new Date(Date.now() - 86400000))
  );
  const [backdateTimeStr, setBackdateTimeStr] = useState<string>(() =>
    formatLocalTimeInput(new Date())
  );

  const isNoteRequired = !!storeSettings.requireTransactionNote;

  // Reset per-checkout transient inputs when modal opens
  useEffect(() => {
    if (isOpen) {
      setTransactionNote('');
      setDebtNotes('');
      setTransferRef('');
      setNoteValidationError(null);
      setIsForceNotePromptOpen(false);
      const now = new Date();
      const yesterday = new Date(now.getTime() - 86400000);
      setTxDateMode(isAdmin && defaultBackdated ? 'BACKDATED' : 'NOW');
      setBackdateDateStr(formatLocalDateInput(yesterday));
      setBackdateTimeStr(formatLocalTimeInput(now));
    }
  }, [isOpen, isAdmin, defaultBackdated]);

  // Sync defaults upon open
  useEffect(() => {
    if (isOpen) {
      if (!activePaymentMethods.some((m) => m.id === selectedMethodId)) {
        setSelectedMethodId(activePaymentMethods[0]?.id || 'pm_cash');
      }
      setApprovalCode(Math.floor(100000 + Math.random() * 900000).toString());
      setTraceNumber(Math.floor(1000 + Math.random() * 9000).toString());
      setQrisTimer(300);
      setIsQrisZoomed(false);
      
      // Default due date: 14 days from now
      const due = new Date();
      due.setDate(due.getDate() + 14);
      setCustomDueDate(due.toISOString().split('T')[0]);
    }
  }, [isOpen, activePaymentMethods]);

  // Focus forced note textarea when forced prompt opens
  useEffect(() => {
    if (isForceNotePromptOpen) {
      const t = setTimeout(() => {
        forcedNoteInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(t);
    }
  }, [isForceNotePromptOpen]);

  // Keep cash input synced whenever modal opens or grandTotal updates (e.g. after redeeming points)
  useEffect(() => {
    if (isOpen) {
      setCashInput(grandTotal.toString());
    }
  }, [isOpen, grandTotal]);

  // QRIS countdown timer
  useEffect(() => {
    if (!isOpen || currentMethod.type !== 'QRIS') return;
    const interval = setInterval(() => {
      setQrisTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, currentMethod.type]);

  const cashAmount = parseFloat(cashInput) || 0;
  const cashChange = Math.max(0, cashAmount - grandTotal);
  const isCashSufficient = cashAmount >= grandTotal;

  const isSelectedMember = isCustomerMember(selectedCustomer);
  const potentialEarnedPoints = useMemo(() => {
    return calculatePointsEarned(grandTotal, storeSettings, selectedCustomer);
  }, [grandTotal, storeSettings, selectedCustomer]);
  const showPotentialPointsBadge = !!selectedCustomer && isSelectedMember && storeSettings.enablePoints && potentialEarnedPoints > 0;

  // Quick cash buttons
  const quickCashOptions = [
    { label: 'Uang Pas', value: grandTotal },
    { label: 'Rp 20.000', value: 20000 },
    { label: 'Rp 50.000', value: 50000 },
    { label: 'Rp 100.000', value: 100000 },
    { label: 'Rp 200.000', value: 200000 },
    { label: 'Rp 500.000', value: 500000 },
  ].filter((opt) => opt.value >= grandTotal || opt.label === 'Uang Pas');

  const handleNumpadPress = (val: string) => {
    sound.playTap();
    if (val === 'C') {
      setCashInput('0');
    } else if (val === 'BACK') {
      setCashInput((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
    } else {
      setCashInput((prev) => (prev === '0' ? val : prev + val));
    }
  };

  const handleCopyBCA = () => {
    try {
      const accToCopy = String(currentMethod.accountNumber || storeSettings.bcaAccountNumber || '');
      if (accToCopy && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(accToCopy).catch(() => {});
      }
    } catch {}
    setCopiedAccount(true);
    sound.playTap();
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  // Admin Backdated timestamp parsing & validation
  const backdateEvaluation = useMemo(() => {
    if (!isAdmin || txDateMode !== 'BACKDATED') {
      return { valid: true, timestamp: undefined as number | undefined, error: '' };
    }
    if (!backdateDateStr) {
      return { valid: false, timestamp: undefined, error: 'Pilih tanggal transaksi terlebih dahulu.' };
    }
    const timePart = backdateTimeStr && /^\d{2}:\d{2}$/.test(backdateTimeStr) ? backdateTimeStr : '12:00';
    const parsedDate = new Date(`${backdateDateStr}T${timePart}:00`);
    const ts = parsedDate.getTime();
    if (isNaN(ts)) {
      return { valid: false, timestamp: undefined, error: 'Format tanggal atau jam tidak valid.' };
    }
    if (ts > Date.now() + 30000) {
      return {
        valid: false,
        timestamp: undefined,
        error: 'Tanggal/jam transaksi mundur tidak boleh melebihi waktu saat ini.',
      };
    }
    return { valid: true, timestamp: ts, error: '' };
  }, [isAdmin, txDateMode, backdateDateStr, backdateTimeStr]);

  const completePaymentWithNote = (resolvedNote: string) => {
    sound.playSuccessChime();

    let calculatedDueDate: string | undefined = undefined;
    if (currentMethod.type === 'PIUTANG') {
      if (customDueDate) {
        calculatedDueDate = customDueDate;
      } else {
        const baseTs =
          isAdmin && txDateMode === 'BACKDATED' && backdateEvaluation.timestamp
            ? backdateEvaluation.timestamp
            : Date.now();
        const d = new Date(baseTs);
        d.setDate(d.getDate() + tenorDays);
        calculatedDueDate = formatLocalDateInput(d);
      }
    }

    onConfirmPayment({
      paymentMethod: currentMethod.type === 'PIUTANG' ? 'PIUTANG' : (currentMethod.type === 'CASH' ? 'CASH' : (currentMethod.name || 'CASH')),
      cashPaid: currentMethod.type === 'CASH' ? cashAmount : grandTotal,
      cashChange: currentMethod.type === 'CASH' ? cashChange : 0,
      bankApprovalCode: currentMethod.type === 'CARD' ? approvalCode : undefined,
      bankRefNumber: currentMethod.type === 'BANK_TRANSFER' ? transferRef : (currentMethod.type === 'QRIS' ? (currentMethod.accountNumber || storeSettings.bcaMerchantId) : undefined),
      dueDate: calculatedDueDate,
      notes: resolvedNote.trim() || undefined,
      customTimestamp:
        isAdmin && txDateMode === 'BACKDATED' && backdateEvaluation.valid
          ? backdateEvaluation.timestamp
          : undefined,
    });
  };

  const handleProcessPayment = () => {
    if (isAdmin && txDateMode === 'BACKDATED' && !backdateEvaluation.valid) {
      sound.playWarningChime();
      return;
    }

    const combinedNote =
      currentMethod.type === 'PIUTANG'
        ? (transactionNote.trim() || debtNotes.trim())
        : transactionNote.trim();

    if (isNoteRequired && !combinedNote) {
      sound.playWarningChime();
      setNoteValidationError('Catatan transaksi wajib diisi sebelum menyelesaikan penjualan.');
      setIsForceNotePromptOpen(true);
      return;
    }

    setNoteValidationError(null);
    completePaymentWithNote(combinedNote);
  };

  // Check if Piutang is allowed
  const isCustomerValidForPiutang = !!selectedCustomer;
  const newProjectedDebt = (selectedCustomer?.totalDebt || 0) + grandTotal;
  const isExceedingCreditLimit =
    selectedCustomer && selectedCustomer.creditLimit > 0 && newProjectedDebt > selectedCustomer.creditLimit;

  // Physical Keyboard Shortcuts Support in PaymentModal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      // Escape: close top-most overlay or modal
      if (e.key === 'Escape') {
        e.preventDefault();
        sound.playTap();
        if (isForceNotePromptOpen) {
          setIsForceNotePromptOpen(false);
        } else if (isQrisZoomed) {
          setIsQrisZoomed(false);
        } else {
          onClose();
        }
        return;
      }

      // When forced note prompt is open, handle Enter inside prompt
      if (isForceNotePromptOpen) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const trimmed = transactionNote.trim();
          if (trimmed) {
            setIsForceNotePromptOpen(false);
            setNoteValidationError(null);
            completePaymentWithNote(trimmed);
          } else {
            sound.playWarningChime();
            setNoteValidationError('Catatan transaksi tidak boleh kosong.');
            forcedNoteInputRef.current?.focus();
          }
        }
        return;
      }

      // Enter: confirm payment if valid (skip bare Enter while typing multiline note in textarea)
      if (e.key === 'Enter') {
        const isTextarea = activeEl instanceof HTMLTextAreaElement;
        if (isTextarea && !e.ctrlKey && !e.metaKey) {
          return;
        }
        const canSubmit =
          (currentMethod.type === 'CASH' && isCashSufficient) ||
          (currentMethod.type === 'PIUTANG' && isCustomerValidForPiutang) ||
          (currentMethod.type !== 'CASH' && currentMethod.type !== 'PIUTANG');

        if (canSubmit) {
          e.preventDefault();
          handleProcessPayment();
        }
        return;
      }

      // Function keys F1-F8 for active methods
      for (let i = 1; i <= 8; i++) {
        if (e.key === `F${i}` && activePaymentMethods[i - 1]) {
          e.preventDefault();
          sound.playTap();
          setSelectedMethodId(activePaymentMethods[i - 1].id);
          return;
        }
      }

      // If NOT typing in an input/textarea, number keys 1-9 switch methods
      if (!isInput) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= activePaymentMethods.length) {
          e.preventDefault();
          sound.playTap();
          setSelectedMethodId(activePaymentMethods[num - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    currentMethod,
    activePaymentMethods,
    isCashSufficient,
    isCustomerValidForPiutang,
    cashAmount,
    grandTotal,
    cashChange,
    approvalCode,
    transferRef,
    customDueDate,
    tenorDays,
    debtNotes,
    transactionNote,
    isNoteRequired,
    isForceNotePromptOpen,
    isQrisZoomed,
    onClose
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 select-none">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <span>Metode Pembayaran</span>
            </h2>
            <p className="text-xs text-slate-400">
              Pilih salah satu metode dan konfirmasi pelunasan tagihan kasir
            </p>
          </div>

          <div className="flex items-center gap-3 md:gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-400 uppercase font-medium tracking-wide">
                Total Tagihan
              </div>
              <div className="text-xl font-black text-amber-400 font-mono tabular-nums">
                {formatRupiah(grandTotal)}
              </div>
              {showPotentialPointsBadge && (
                <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-[10.5px] font-bold">
                  <Sparkles className="w-3 h-3 text-emerald-300 fill-emerald-300 shrink-0" />
                  <span>Berpotensi +{formatNumber(potentialEarnedPoints)} Poin Baru</span>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body: Left Tabs, Right Form */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Method Selection Tabs */}
          <div className="w-full md:w-60 bg-slate-50 border-r border-slate-200 p-3 space-y-1.5 overflow-y-auto shrink-0">
            {activePaymentMethods.map((tab, idx) => {
              const isSelected = selectedMethodId === tab.id;
              let Icon = Banknote;
              let color = 'text-emerald-600';
              if (tab.type === 'QRIS') {
                Icon = QrCode;
                color = 'text-sky-600';
              } else if (tab.type === 'CARD') {
                Icon = CreditCard;
                color = 'text-indigo-600';
              } else if (tab.type === 'BANK_TRANSFER') {
                Icon = ArrowRightLeft;
                color = 'text-blue-600';
              } else if (tab.type === 'PIUTANG') {
                Icon = Calendar;
                color = 'text-amber-600';
              } else {
                Icon = Smartphone;
                color = 'text-violet-600';
              }

              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    sound.playTap();
                    setSelectedMethodId(tab.id);
                  }}
                  className={`w-full text-left p-2.5 md:p-3 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-600/20'
                      : 'hover:bg-slate-200/70 text-slate-700 font-medium'
                  }`}
                  title={`${tab.name} (Tekan ${idx + 1} atau F${idx + 1})`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-1">
                    <Icon className={`w-5 h-5 shrink-0 ${isSelected ? 'text-white' : color}`} />
                    <div className="truncate">
                      <div className="text-xs md:text-sm font-bold truncate leading-tight">{tab.name}</div>
                      {tab.type === 'QRIS' && tab.qrisImageUrl && (
                        <span className={`text-[9.5px] font-mono px-1 rounded inline-block mt-0.5 ${
                          isSelected ? 'bg-sky-700 text-sky-100' : 'bg-emerald-100 text-emerald-800 font-bold'
                        }`}>
                          JPG Statis
                        </span>
                      )}
                    </div>
                  </div>
                  <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                    isSelected ? 'bg-sky-700 text-sky-100 border border-sky-400' : 'bg-slate-200 text-slate-600 border border-slate-300'
                  }`}>
                    {idx + 1}
                  </kbd>
                </button>
              );
            })}

            {/* Membership tier discount summary */}
            {membershipDiscount > 0 && (
              <div className="mt-3 p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1 text-indigo-700">
                  <Award className="w-3.5 h-3.5" />
                  <span>Member {customerTier} (-{tierDiscountPercent}%)</span>
                </div>
                <div>Hemat -{formatRupiah(membershipDiscount)}</div>
              </div>
            )}

            {/* Selected Customer Loyalty Points Info + Custom Point Redemption */}
            {selectedCustomer && (() => {
              const memberStatus = isCustomerMember(selectedCustomer);
              const earnedPoints = calculatePointsEarned(grandTotal, storeSettings, selectedCustomer);
              const projectedTotal = Math.max(0, (selectedCustomer.totalPoints || 0) - pointsUsed + earnedPoints);
              const canRedeemHere = memberStatus && storeSettings.enablePoints && (selectedCustomer.totalPoints || 0) > 0 && maxRedeemablePoints > 0 && !!onChangePointsToUse;
              return (
                <div className={`mt-2 p-3 rounded-xl border text-[11px] space-y-1.5 ${
                  memberStatus
                    ? 'bg-emerald-50/80 border-emerald-200 text-slate-800'
                    : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}>
                  <div className="flex items-center justify-between gap-1 font-bold">
                    <span className="truncate">{selectedCustomer.name}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-black shrink-0 ${
                      memberStatus
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {memberStatus ? '⭐ MEMBER' : 'Non-Member'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Poin Saat Ini:</span>
                    <span className="font-mono font-bold text-amber-700">
                      {memberStatus ? `${formatNumber(selectedCustomer.totalPoints || 0)} Poin` : '0 Poin'}
                    </span>
                  </div>
                  {storeSettings.enablePoints && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Poin Transaksi Ini:</span>
                        <span className={`font-mono font-bold ${memberStatus && earnedPoints > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {memberStatus ? `+${formatNumber(earnedPoints)} Poin` : '0 Poin'}
                        </span>
                      </div>
                      {memberStatus && (
                        <div className="pt-1 border-t border-emerald-200/70 flex items-center justify-between font-bold">
                          <span className="text-slate-600">Estimasi Total Poin:</span>
                          <span className="font-mono text-emerald-800">{formatNumber(projectedTotal)} Poin</span>
                        </div>
                      )}

                      {/* Interactive Custom Point Redemption Controls */}
                      {canRedeemHere && (
                        <div className="pt-2 mt-1 border-t border-emerald-200/80 space-y-1.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-bold text-amber-900 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              <span>Tukar Poin</span>
                              {storeSettings.autoApplyMaxPoints && pointsUsed > 0 && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-black">
                                  Auto
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Maks. {formatNumber(maxRedeemablePoints)} Pts
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                onChangePointsToUse!(Math.max(0, pointsUsed - 1));
                              }}
                              disabled={pointsUsed <= 0}
                              className="w-7 h-7 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 disabled:opacity-40 text-amber-900 font-bold flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min="0"
                              max={maxRedeemablePoints}
                              step="any"
                              value={pointsUsed === 0 ? '' : pointsUsed}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const val = raw === '' ? 0 : Math.max(0, Math.min(maxRedeemablePoints, Math.floor(parseFloat(raw) || 0)));
                                onChangePointsToUse!(val);
                              }}
                              placeholder="0"
                              className="w-full h-7 px-2 rounded-lg border border-amber-300 bg-white text-xs font-mono font-bold text-amber-950 focus:outline-none focus:border-amber-600 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                onChangePointsToUse!(Math.min(maxRedeemablePoints, pointsUsed + 1));
                              }}
                              disabled={pointsUsed >= maxRedeemablePoints}
                              className="w-7 h-7 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 disabled:opacity-40 text-amber-900 font-bold flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                onChangePointsToUse!(0);
                              }}
                              className={`flex-1 py-1 rounded-md text-[10px] font-bold border cursor-pointer ${
                                pointsUsed === 0 ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              0
                            </button>
                            {maxRedeemablePoints >= 2 && (
                              <button
                                type="button"
                                onClick={() => {
                                  sound.playTap();
                                  onChangePointsToUse!(Math.max(1, Math.floor(maxRedeemablePoints / 2)));
                                }}
                                className={`flex-1 py-1 rounded-md text-[10px] font-bold border cursor-pointer ${
                                  pointsUsed === Math.floor(maxRedeemablePoints / 2)
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100'
                                }`}
                              >
                                50%
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                onChangePointsToUse!(maxRedeemablePoints);
                              }}
                              className={`flex-1 py-1 rounded-md text-[10px] font-bold border cursor-pointer ${
                                pointsUsed === maxRedeemablePoints && maxRedeemablePoints > 0
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              Maks
                            </button>
                          </div>
                          {pointsDiscount > 0 && (
                            <div className="text-[10.5px] font-bold text-amber-800 bg-amber-100/80 px-2 py-1 rounded-lg flex items-center justify-between">
                              <span>Potongan Tagihan:</span>
                              <span className="font-mono">-{formatRupiah(pointsDiscount)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* Loyalty point summary reminder */}
            {pointsDiscount > 0 && (
              <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Poin Dipotong</span>
                </div>
                <div>{formatNumber(pointsUsed)} Poin = -{formatRupiah(pointsDiscount)}</div>
              </div>
            )}

            {/* Quick Select / Scan QR Member action when no customer is selected during checkout */}
            {!selectedCustomer && (
              <div className="mt-2 p-2.5 rounded-xl bg-indigo-50/80 border border-indigo-200 text-[11px] space-y-1.5">
                <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                  <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Member Pelanggan</span>
                </div>
                <p className="text-[10px] text-indigo-700/80 leading-snug">
                  Scan QR Member atau pilih pelanggan agar poin dan harga khusus otomatis diterapkan.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onOpenCustomerModal();
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Pilih / Scan QR Member</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Form Display for selected payment method */}
          <div className="flex-1 p-5 overflow-y-auto bg-white flex flex-col justify-between gap-4">
            <div className="space-y-4">
              {/* ADMIN ONLY: Transaction Date & Time Override (Backdated Entry + FIFO Recalculation) */}
              {isAdmin && (
                <div
                  className={`p-3 rounded-2xl border transition-colors ${
                    txDateMode === 'BACKDATED'
                      ? 'bg-amber-50/90 border-amber-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                          txDateMode === 'BACKDATED'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <History className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                          <span>Tanggal &amp; Jam Transaksi</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                            ADMIN
                          </span>
                        </div>
                        <p className="text-[10.5px] text-slate-500 leading-tight">
                          {txDateMode === 'BACKDATED'
                            ? 'Mode transaksi mundur aktif — stok & HPP FIFO akan dihitung ulang kronologis'
                            : 'Menggunakan waktu transaksi real-time saat ini'}
                        </p>
                      </div>
                    </div>

                    <div className="inline-flex bg-white p-0.5 rounded-xl border border-slate-200 text-[11px] shrink-0 self-start sm:self-auto">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setTxDateMode('NOW');
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          txDateMode === 'NOW'
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Sekarang
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setTxDateMode('BACKDATED');
                        }}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
                          txDateMode === 'BACKDATED'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Calendar className="w-3 h-3" />
                        <span>Tanggal Lalu</span>
                      </button>
                    </div>
                  </div>

                  {txDateMode === 'BACKDATED' && (
                    <div className="mt-2.5 pt-2.5 border-t border-amber-200/80 space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-5">
                          <label className="text-[10px] font-bold uppercase text-amber-900 block mb-0.5">
                            Tanggal Transaksi Lalu
                          </label>
                          <div className="relative">
                            <Calendar className="w-3.5 h-3.5 text-amber-700 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="date"
                              value={backdateDateStr}
                              max={formatLocalDateInput(new Date())}
                              onChange={(e) => setBackdateDateStr(e.target.value)}
                              className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-600"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-3">
                          <label className="text-[10px] font-bold uppercase text-amber-900 block mb-0.5">
                            Jam Transaksi
                          </label>
                          <div className="relative">
                            <Clock className="w-3.5 h-3.5 text-amber-700 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="time"
                              value={backdateTimeStr}
                              onChange={(e) => setBackdateTimeStr(e.target.value)}
                              className="w-full pl-8 pr-2 py-1.5 rounded-xl border border-amber-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-600"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-4 flex items-center gap-1 pt-3.5 sm:pt-4 flex-wrap">
                          {[
                            { label: 'Kemarin', days: 1 },
                            { label: '2 Hari Lalu', days: 2 },
                            { label: '7 Hari Lalu', days: 7 },
                          ].map((preset) => (
                            <button
                              key={preset.days}
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setBackdateDateStr(
                                  formatLocalDateInput(new Date(Date.now() - preset.days * 86400000))
                                );
                              }}
                              className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-[10.5px] font-bold text-amber-900 cursor-pointer"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {!backdateEvaluation.valid ? (
                        <div className="p-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{backdateEvaluation.error}</span>
                        </div>
                      ) : (
                        <div className="p-2 rounded-xl bg-amber-100/70 border border-amber-200 text-amber-950 text-[10.5px] font-medium flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>
                            Batch FIFO &amp; stok sisa transaksi sesudahnya akan otomatis dihitung ulang sesuai urutan waktu.
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            {/* 1. TUNAI (CASH) */}
            {currentMethod.type === 'CASH' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left Column: Quick Cash Buttons & Input */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-slate-700 block">
                      Nominal Uang Diterima (Rp)
                    </label>

                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                        Rp
                      </span>
                      <input
                        type="text"
                        readOnly
                        value={formatNumber(cashAmount)}
                        className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-sky-600 text-slate-900 rounded-2xl text-xl font-bold font-mono text-right focus:outline-none"
                      />
                    </div>

                    {/* Quick money chips */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {quickCashOptions.map((opt) => (
                        <button
                          key={opt.label}
                          onClick={() => {
                            sound.playTap();
                            setCashInput(opt.value.toString());
                          }}
                          className={`p-2.5 rounded-xl border text-xs font-bold font-mono transition-all ${
                            cashAmount === opt.value
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* Change (Kembalian) Box */}
                    <div className={`p-4 rounded-2xl border ${
                      isCashSufficient
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}>
                      <div className="text-xs font-bold uppercase tracking-wider">
                        {isCashSufficient ? 'Uang Kembalian:' : 'Uang Masih Kurang:'}
                      </div>
                      <div className="text-2xl font-black font-mono tabular-nums mt-1">
                        {isCashSufficient
                          ? formatRupiah(cashChange)
                          : formatRupiah(grandTotal - cashAmount)}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Tablet Touch Numpad */}
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '000'].map((digit) => (
                      <button
                        key={digit}
                        onClick={() => handleNumpadPress(digit)}
                        className="py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-sky-100 text-slate-800 font-bold text-lg font-mono transition-colors shadow-2xs"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      onClick={() => handleNumpadPress('C')}
                      className="py-3 rounded-2xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-sm"
                    >
                      CLEAR
                    </button>
                    <button
                      onClick={() => handleNumpadPress('BACK')}
                      className="col-span-2 py-3 rounded-2xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-sm"
                    >
                      HAPUS (←)
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 2. QRIS (STATIC JPG OR DYNAMIC SIMULATION) */}
            {currentMethod.type === 'QRIS' && (
              <div className="flex flex-col items-center justify-center text-center p-3 space-y-3">
                <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-lg max-w-sm w-full">
                  {/* Header QRIS */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-red-600 tracking-wider">QRIS</span>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">
                        {effectiveQrisImageUrl ? 'QRIS STATIS TOKO' : 'QRIS DINAMIS'}
                      </span>
                    </div>
                    <span className="font-bold text-xs text-sky-700 font-mono truncate max-w-[150px]">
                      {currentMethod.name}
                    </span>
                  </div>

                  {/* QR Image Display */}
                  {effectiveQrisImageUrl ? (
                    <div className="my-3 p-3 bg-slate-50 border-2 border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-2">
                      <img
                        src={effectiveQrisImageUrl}
                        alt="QRIS Statis Toko"
                        className="max-h-56 max-w-[240px] w-auto object-contain rounded-xl border border-slate-300 p-1.5 bg-white shadow-xs filter contrast-125"
                      />
                      <button
                        type="button"
                        onClick={() => setIsQrisZoomed(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                        title="Tampilkan QRIS dalam resolusi penuh untuk pembeli scan dari layar tablet"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>Perbesar Layar Penuh (Scan Pelanggan)</span>
                      </button>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {effectiveQrisImageName}
                      </div>
                    </div>
                  ) : (
                    /* Fallback dynamic SVG */
                    <div className="my-4 p-3 bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center">
                      <svg viewBox="0 0 100 100" className="w-44 h-44">
                        <rect width="100" height="100" fill="white" />
                        <rect x="5" y="5" width="25" height="25" fill="#1e293b" />
                        <rect x="9" y="9" width="17" height="17" fill="white" />
                        <rect x="13" y="13" width="9" height="9" fill="#1e293b" />
                        
                        <rect x="70" y="5" width="25" height="25" fill="#1e293b" />
                        <rect x="74" y="9" width="17" height="17" fill="white" />
                        <rect x="78" y="13" width="9" height="9" fill="#1e293b" />

                        <rect x="5" y="70" width="25" height="25" fill="#1e293b" />
                        <rect x="9" y="74" width="17" height="17" fill="white" />
                        <rect x="13" y="78" width="9" height="9" fill="#1e293b" />

                        <rect x="35" y="10" width="10" height="6" fill="#1e293b" />
                        <rect x="50" y="10" width="14" height="6" fill="#1e293b" />
                        <rect x="35" y="22" width="6" height="12" fill="#1e293b" />
                        <rect x="45" y="22" width="16" height="6" fill="#1e293b" />
                        <rect x="10" y="35" width="20" height="6" fill="#1e293b" />
                        <rect x="35" y="35" width="8" height="8" fill="#0284c7" />
                        <rect x="48" y="35" width="14" height="14" fill="#1e293b" />
                        <rect x="68" y="35" width="22" height="6" fill="#1e293b" />
                        <rect x="10" y="48" width="16" height="12" fill="#1e293b" />
                        <rect x="32" y="48" width="10" height="8" fill="#1e293b" />
                        <rect x="68" y="48" width="12" height="16" fill="#1e293b" />
                        <rect x="85" y="48" width="6" height="12" fill="#1e293b" />
                        <rect x="35" y="65" width="24" height="6" fill="#1e293b" />
                        <rect x="65" y="70" width="12" height="12" fill="#1e293b" />
                        <rect x="80" y="70" width="12" height="22" fill="#1e293b" />
                        <rect x="35" y="78" width="18" height="12" fill="#1e293b" />
                      </svg>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        NMID: {currentMethod.accountNumber || storeSettings.bcaMerchantId}
                      </div>
                    </div>
                  )}

                  <div className="text-xs font-bold text-slate-800">
                    {currentMethod.accountName || storeSettings.storeName}
                  </div>
                  <div className="text-base font-extrabold text-sky-700 font-mono mt-0.5">
                    {formatRupiah(grandTotal)}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                    <span>Kadaluarsa dalam: </span>
                    <span className="font-mono font-bold text-rose-600">
                      {Math.floor(qrisTimer / 60)}:
                      {String(qrisTimer % 60).padStart(2, '0')}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 max-w-sm">
                  {currentMethod.qrisImageUrl
                    ? 'Tunjukkan gambar QRIS statis ini kepada pembeli untuk di-scan lewat aplikasi perbankan atau e-wallet (BCA, Mandiri, BRI, GoPay, OVO, ShopeePay, Dana).'
                    : 'Tunjukkan QR code ini kepada pembeli untuk di-scan lewat BCA mobile, myBCA, GoPay, OVO, Dana, atau ShopeePay.'}
                </p>
              </div>
            )}

            {/* 3. EDC / KARTU */}
            {currentMethod.type === 'CARD' && (
              <div className="space-y-4 max-w-lg mx-auto">
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex items-center gap-3">
                  <CreditCard className="w-8 h-8 text-sky-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-sky-900">{currentMethod.name} Terhubung</h4>
                    <p className="text-xs text-sky-700">
                      Gesek atau masukkan kartu nasabah ke terminal EDC lalu masukkan PIN.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Jenis Kartu
                    </label>
                    <select
                      value={cardType}
                      onChange={(e) => setCardType(e.target.value)}
                      className="w-full p-3 rounded-xl border border-slate-300 bg-white text-sm font-medium focus:border-sky-500 focus:outline-none"
                    >
                      <option value="DEBIT_BCA">Kartu Debit BCA (Paspor BCA)</option>
                      <option value="BCA_FLAZZ">Kartu Flazz BCA</option>
                      <option value="CREDIT_BCA">Kartu Kredit BCA Card</option>
                      <option value="VISA">Kartu Visa</option>
                      <option value="MASTERCARD">Kartu Mastercard</option>
                      <option value="DEBIT_MANDIRI">Kartu Debit Mandiri</option>
                      <option value="DEBIT_BRI">Kartu Debit BRI</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Approval Code (Trace)
                      </label>
                      <input
                        type="text"
                        value={approvalCode}
                        onChange={(e) => setApprovalCode(e.target.value)}
                        placeholder="Contoh: 849201"
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Trace Number
                      </label>
                      <input
                        type="text"
                        value={traceNumber}
                        onChange={(e) => setTraceNumber(e.target.value)}
                        placeholder="Contoh: 004128"
                        className="w-full p-3 rounded-xl border border-slate-300 bg-white text-sm font-mono focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {currentMethod.description && (
                    <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
                      💡 {currentMethod.description}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 4. TRANSFER BANK */}
            {currentMethod.type === 'BANK_TRANSFER' && (
              <div className="space-y-4 max-w-lg mx-auto">
                <div className="p-5 bg-gradient-to-br from-blue-700 to-indigo-800 text-white rounded-3xl shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-widest uppercase opacity-80">
                      {currentMethod.name}
                    </span>
                    <span className="text-base font-black tracking-tight">BANK</span>
                  </div>

                  <div>
                    <div className="text-[11px] opacity-80">Nomor Rekening Toko:</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xl md:text-2xl font-mono font-bold tracking-wider">
                        {currentMethod.accountNumber || storeSettings.bcaAccountNumber}
                      </span>
                      <button
                        onClick={handleCopyBCA}
                        className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                        title="Salin No Rekening"
                      >
                        {copiedAccount ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    {copiedAccount && (
                      <span className="text-[10px] text-emerald-300 font-semibold block mt-0.5">
                        Tersalin ke clipboard!
                      </span>
                    )}
                  </div>

                  <div className="pt-2 border-t border-white/20 flex justify-between items-baseline text-xs">
                    <div>
                      <span className="opacity-80 block text-[10px]">Atas Nama:</span>
                      <span className="font-bold">
                        {currentMethod.accountName || storeSettings.bcaAccountName}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="opacity-80 block text-[10px]">Nominal Transfer:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {formatRupiah(grandTotal)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nomor Referensi Transfer / 4 Digit Pengirim (Opsional)
                  </label>
                  <input
                    type="text"
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    placeholder="Contoh: REF-882193 atau an Bpk Joni"
                    className="w-full p-3 rounded-xl border border-slate-300 bg-white text-sm focus:border-sky-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Pastikan dana transfer telah masuk ke m-Banking sebelum kasir mengonfirmasi transaksi.
                  </p>
                </div>
              </div>
            )}

            {/* 5. PIUTANG (KASBON / TEMPO) */}
            {currentMethod.type === 'PIUTANG' && (
              <div className="space-y-4 max-w-lg mx-auto">
                {!isCustomerValidForPiutang ? (
                  <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-sm font-bold">Pelanggan Belum Dipilih</h4>
                        <p className="text-xs text-amber-800 mt-0.5">
                          Metode pembayaran piutang/tempo hanya diperbolehkan untuk pelanggan yang terdaftar di database toko untuk keperluan pencatatan dan penagihan.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        sound.playTap();
                        onOpenCustomerModal();
                      }}
                      className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs"
                    >
                      Pilih / Daftarkan Pelanggan Sekarang
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Customer Piutang Profile */}
                    <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-900">
                          {selectedCustomer.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          WhatsApp: {selectedCustomer.whatsapp}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">Piutang Saat Ini</div>
                        <div className="text-xs font-mono font-bold text-amber-700">
                          {formatRupiah(selectedCustomer.totalDebt)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Limit: {formatRupiah(selectedCustomer.creditLimit)}
                        </div>
                      </div>
                    </div>

                    {isExceedingCreditLimit && (
                      <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          Peringatan: Total piutang akan melebihi limit kredit pelanggan ({formatRupiah(selectedCustomer.creditLimit)}).
                        </span>
                      </div>
                    )}

                    {/* Jatuh Tempo Selection */}
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Pilih Batas Jatuh Tempo Pembayaran
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { days: 7, label: '7 Hari' },
                          { days: 14, label: '14 Hari' },
                          { days: 30, label: '30 Hari' },
                        ].map((t) => (
                          <button
                            key={t.days}
                            onClick={() => {
                              sound.playTap();
                              setTenorDays(t.days);
                              const d = new Date();
                              d.setDate(d.getDate() + t.days);
                              setCustomDueDate(d.toISOString().split('T')[0]);
                            }}
                            className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                              tenorDays === t.days
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Tanggal Jatuh Tempo (Kustom)
                      </label>
                      <input
                        type="date"
                        value={customDueDate}
                        onChange={(e) => {
                          setCustomDueDate(e.target.value);
                          setTenorDays(0);
                        }}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-medium focus:border-sky-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Catatan / Janji Bayar (Opsional)
                      </label>
                      <input
                        type="text"
                        value={debtNotes}
                        onChange={(e) => setDebtNotes(e.target.value)}
                        placeholder="Contoh: Janji transfer saat gajian tgl 25"
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 6. OTHER / CUSTOM METHOD */}
            {currentMethod.type === 'OTHER' && (
              <div className="space-y-4 max-w-lg mx-auto p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center font-bold">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{currentMethod.name}</h4>
                    <p className="text-xs text-slate-500">
                      {currentMethod.description || 'Pembayaran menggunakan metode alternatif toko'}
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Tagihan:</span>
                    <span className="font-bold text-slate-900 font-mono">{formatRupiah(grandTotal)}</span>
                  </div>
                  {currentMethod.accountNumber && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">No. Akun / ID:</span>
                      <span className="font-mono font-bold text-slate-800">{currentMethod.accountNumber}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nomor Bukti / Keterangan Pembayaran (Opsional)
                  </label>
                  <input
                    type="text"
                    value={transferRef}
                    onChange={(e) => setTransferRef(e.target.value)}
                    placeholder="Contoh: NO-TRX-19281 atau Voucher #12"
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Catatan Transaksi (Transaction Note) — berlaku untuk semua metode pembayaran */}
            <div
              className={`mt-4 p-3.5 rounded-2xl border transition-colors space-y-2 ${
                isNoteRequired && !transactionNote.trim() && !(currentMethod.type === 'PIUTANG' && debtNotes.trim())
                  ? 'bg-amber-50/70 border-amber-300'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <StickyNote className={`w-3.5 h-3.5 ${isNoteRequired ? 'text-amber-600' : 'text-sky-600'}`} />
                  <span>Catatan Transaksi (Transaction Note)</span>
                </label>
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                    isNoteRequired
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isNoteRequired ? 'Wajib Sebelum Bayar' : 'Opsional'}
                </span>
              </div>

              <textarea
                ref={noteInputRef}
                rows={2}
                value={transactionNote}
                onChange={(e) => {
                  setTransactionNote(e.target.value);
                  if (noteValidationError && e.target.value.trim()) {
                    setNoteValidationError(null);
                  }
                }}
                placeholder="Contoh: Request bungkus terpisah, titip ambil sore, atau catatan internal kasir..."
                className={`w-full p-2.5 rounded-xl border bg-white text-xs text-slate-800 leading-snug resize-none focus:outline-none ${
                  noteValidationError && !transactionNote.trim()
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-300 focus:border-sky-500'
                }`}
              />

              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-400">Cepat:</span>
                {['Request Khusus', 'Bungkus Terpisah', 'Tanpa Kantong Plastik', 'Titip / Kirim Kurir'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setTransactionNote((prev) => (prev.trim() ? `${prev.trim()}, ${preset}` : preset));
                      setNoteValidationError(null);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 text-[10px] font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              {noteValidationError && isNoteRequired && !transactionNote.trim() && (
                <div className="text-[11px] font-bold text-rose-700 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{noteValidationError}</span>
                </div>
              )}
            </div>

            {/* Visual Indicator Badge: Potential New Points & Auto-Apply Info */}
            {showPotentialPointsBadge && (
              <div className="mt-4 p-2.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                    <Sparkles className="w-4 h-4 fill-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-extrabold text-emerald-950 truncate">
                      Potensi Poin Reward Pelanggan Member
                    </div>
                    <div className="text-[10.5px] text-emerald-700 truncate">
                      {selectedCustomer?.name} berpotensi mendapat poin baru setelah transaksi berhasil
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-mono font-black text-xs shrink-0 shadow-2xs">
                  +{formatNumber(potentialEarnedPoints)} Poin
                </span>
              </div>
            )}

            {/* Bottom Confirmation Bar */}
            <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  sound.playTap();
                  onClose();
                }}
                className="py-3 px-5 rounded-2xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs md:text-sm flex items-center gap-1.5 cursor-pointer"
                title="Batal / Tutup (Esc)"
              >
                <span>Batal</span>
                <kbd className="px-1 py-0.2 text-[9px] font-mono bg-slate-200 text-slate-600 rounded">Esc</kbd>
              </button>

              <button
                onClick={handleProcessPayment}
                disabled={
                  (currentMethod.type === 'CASH' && !isCashSufficient) ||
                  (currentMethod.type === 'PIUTANG' && !isCustomerValidForPiutang) ||
                  (isAdmin && txDateMode === 'BACKDATED' && !backdateEvaluation.valid)
                }
                className={`flex-1 py-3.5 px-6 rounded-2xl disabled:opacity-40 text-white font-extrabold text-sm md:text-base shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isAdmin && txDateMode === 'BACKDATED'
                    ? 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 disabled:hover:bg-amber-600 shadow-amber-600/30'
                    : 'bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:hover:bg-sky-600 shadow-sky-600/30'
                }`}
                title="Selesaikan Transaksi (Enter)"
              >
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                <span>
                  {isAdmin && txDateMode === 'BACKDATED'
                    ? 'Simpan Transaksi Mundur & Hitung Ulang FIFO'
                    : currentMethod.type === 'PIUTANG'
                    ? 'Simpan Piutang & Cetak Nota'
                    : 'Konfirmasi & Selesaikan Transaksi'}
                </span>
                <kbd
                  className={`px-1.5 py-0.5 text-[10px] font-mono font-black rounded border shadow-2xs ${
                    isAdmin && txDateMode === 'BACKDATED'
                      ? 'bg-amber-700 text-amber-100 border-amber-400'
                      : 'bg-sky-700 text-sky-100 border-sky-400'
                  }`}
                >
                  Enter ↵
                </kbd>
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* FULL SCREEN CUSTOMER FACING QRIS ZOOM MODAL */}
      {isQrisZoomed && effectiveQrisImageUrl && (
        <div className="fixed inset-0 z-70 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="text-left">
                <span className="font-extrabold text-sm text-red-600 tracking-wider block">QRIS PEMBAYARAN</span>
                <span className="text-xs font-bold text-slate-800">{currentMethod.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsQrisZoomed(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl border-2 border-slate-300 shadow-inner flex items-center justify-center">
              <img
                src={effectiveQrisImageUrl}
                alt="QRIS Statis Zoom"
                className="max-h-80 w-auto object-contain rounded"
              />
            </div>

            <div>
              <div className="text-xs text-slate-500">{currentMethod.accountName || storeSettings.storeName}</div>
              <div className="text-2xl font-black text-sky-700 font-mono mt-0.5">
                {formatRupiah(grandTotal)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Scan kode QRIS di atas dengan aplikasi BCA mobile, GoPay, OVO, ShopeePay, DANA, atau Livin' Mandiri
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsQrisZoomed(false)}
              className="w-full py-3 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm shadow-md shadow-sky-600/20 transition-all cursor-pointer"
            >
              Kembali ke Layar Kasir
            </button>
          </div>
        </div>
      )}

      {/* FORCED TRANSACTION NOTE PROMPT MODAL (when storeSettings.requireTransactionNote is active) */}
      {isForceNotePromptOpen && (
        <div className="fixed inset-0 z-70 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <StickyNote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Catatan Transaksi Diperlukan
                  </h3>
                  <p className="text-[11.5px] text-slate-500 leading-snug">
                    Toko mewajibkan pengisian catatan sebelum menyelesaikan transaksi ini.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsForceNotePromptOpen(false);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-bold text-slate-800">
                  Isi Permintaan Khusus / Keterangan Internal:
                </label>
                <span className="font-mono font-bold text-sky-700">{formatRupiah(grandTotal)}</span>
              </div>

              <textarea
                ref={forcedNoteInputRef}
                rows={3}
                value={transactionNote}
                onChange={(e) => {
                  setTransactionNote(e.target.value);
                  if (noteValidationError && e.target.value.trim()) {
                    setNoteValidationError(null);
                  }
                }}
                placeholder="Tulis permintaan pelanggan, keterangan pengiriman, atau remark kasir..."
                className={`w-full p-3 rounded-2xl border bg-slate-50 focus:bg-white text-xs md:text-sm text-slate-900 leading-snug resize-none focus:outline-none ${
                  noteValidationError && !transactionNote.trim()
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-300 focus:border-amber-500'
                }`}
              />

              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {['Pelanggan Walk-In Normal', 'Request Khusus', 'Bungkus Terpisah', 'Kirim Kurir'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setTransactionNote((prev) => (prev.trim() ? `${prev.trim()}, ${preset}` : preset));
                      setNoteValidationError(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-[11px] font-bold text-amber-900 transition-colors cursor-pointer"
                  >
                    + {preset}
                  </button>
                ))}
              </div>

              {noteValidationError && !transactionNote.trim() && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{noteValidationError}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsForceNotePromptOpen(false);
                }}
                className="px-4 py-3 rounded-2xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={!transactionNote.trim()}
                onClick={() => {
                  const trimmed = transactionNote.trim();
                  if (!trimmed) {
                    sound.playWarningChime();
                    setNoteValidationError('Catatan transaksi wajib diisi.');
                    forcedNoteInputRef.current?.focus();
                    return;
                  }
                  setIsForceNotePromptOpen(false);
                  setNoteValidationError(null);
                  completePaymentWithNote(trimmed);
                }}
                className="flex-1 py-3 px-4 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-extrabold text-xs md:text-sm shadow-lg shadow-amber-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Simpan Catatan &amp; Selesaikan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
