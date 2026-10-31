import React, { useState, useEffect, useMemo } from 'react';
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
  Award
} from 'lucide-react';
import { PaymentMethod, Customer, StoreSettings } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  pointsDiscount: number;
  pointsUsed: number;
  grandTotal: number;
  selectedCustomer: Customer | null;
  storeSettings: StoreSettings;
  membershipDiscount?: number;
  customerTier?: string;
  tierDiscountPercent?: number;
  onConfirmPayment: (paymentData: {
    paymentMethod: PaymentMethod;
    cashPaid?: number;
    cashChange?: number;
    bankApprovalCode?: string;
    bankRefNumber?: string;
    dueDate?: string;
    notes?: string;
  }) => void;
  onOpenCustomerModal: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  subtotal,
  pointsDiscount,
  pointsUsed,
  grandTotal,
  selectedCustomer,
  storeSettings,
  membershipDiscount = 0,
  customerTier = 'REGULER',
  tierDiscountPercent = 0,
  onConfirmPayment,
  onOpenCustomerModal,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('CASH');

  // Cash method states
  const [cashInput, setCashInput] = useState<string>(grandTotal.toString());

  // EDC BCA states
  const [cardType, setCardType] = useState<string>('DEBIT_BCA');
  const [approvalCode, setApprovalCode] = useState<string>('');
  const [traceNumber, setTraceNumber] = useState<string>('');

  // Transfer BCA states
  const [transferRef, setTransferRef] = useState<string>('');
  const [copiedAccount, setCopiedAccount] = useState<boolean>(false);

  // Piutang states
  const [tenorDays, setTenorDays] = useState<number>(14);
  const [customDueDate, setCustomDueDate] = useState<string>('');
  const [debtNotes, setDebtNotes] = useState<string>('');

  // QRIS BCA simulation states
  const [qrisTimer, setQrisTimer] = useState<number>(300); // 5 mins

  // Sync cash input with grand total upon open
  useEffect(() => {
    if (isOpen) {
      setCashInput(grandTotal.toString());
      setApprovalCode(Math.floor(100000 + Math.random() * 900000).toString());
      setTraceNumber(Math.floor(1000 + Math.random() * 9000).toString());
      setQrisTimer(300);
      
      // Default due date: 14 days from now
      const due = new Date();
      due.setDate(due.getDate() + 14);
      setCustomDueDate(due.toISOString().split('T')[0]);
    }
  }, [isOpen, grandTotal]);

  // QRIS countdown timer
  useEffect(() => {
    if (!isOpen || selectedMethod !== 'QRIS_BCA') return;
    const interval = setInterval(() => {
      setQrisTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, selectedMethod]);

  if (!isOpen) return null;

  const cashAmount = parseFloat(cashInput) || 0;
  const cashChange = Math.max(0, cashAmount - grandTotal);
  const isCashSufficient = cashAmount >= grandTotal;

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
    navigator.clipboard.writeText(storeSettings.bcaAccountNumber);
    setCopiedAccount(true);
    sound.playTap();
    setTimeout(() => setCopiedAccount(false), 2000);
  };

  const handleProcessPayment = () => {
    sound.playSuccessChime();

    let calculatedDueDate: string | undefined = undefined;
    if (selectedMethod === 'PIUTANG') {
      if (customDueDate) {
        calculatedDueDate = customDueDate;
      } else {
        const d = new Date();
        d.setDate(d.getDate() + tenorDays);
        calculatedDueDate = d.toISOString().split('T')[0];
      }
    }

    onConfirmPayment({
      paymentMethod: selectedMethod,
      cashPaid: selectedMethod === 'CASH' ? cashAmount : grandTotal,
      cashChange: selectedMethod === 'CASH' ? cashChange : 0,
      bankApprovalCode: selectedMethod === 'EDC_BCA' ? approvalCode : undefined,
      bankRefNumber: selectedMethod === 'TRANSFER_BCA' ? transferRef : undefined,
      dueDate: calculatedDueDate,
      notes: selectedMethod === 'PIUTANG' ? debtNotes : undefined,
    });
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

      // Escape: close modal
      if (e.key === 'Escape') {
        e.preventDefault();
        sound.playTap();
        onClose();
        return;
      }

      // Enter: confirm payment if valid
      if (e.key === 'Enter') {
        const canSubmit =
          (selectedMethod === 'CASH' && isCashSufficient) ||
          (selectedMethod === 'PIUTANG' && isCustomerValidForPiutang) ||
          (selectedMethod !== 'CASH' && selectedMethod !== 'PIUTANG');

        if (canSubmit) {
          e.preventDefault();
          handleProcessPayment();
        }
        return;
      }

      // F1-F5 quick method selection
      if (e.key === 'F1') {
        e.preventDefault();
        sound.playTap();
        setSelectedMethod('CASH');
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        sound.playTap();
        setSelectedMethod('QRIS_BCA');
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        sound.playTap();
        setSelectedMethod('EDC_BCA');
        return;
      }
      if (e.key === 'F4') {
        e.preventDefault();
        sound.playTap();
        setSelectedMethod('TRANSFER_BCA');
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        sound.playTap();
        setSelectedMethod('PIUTANG');
        return;
      }

      // If NOT typing in an input/textarea, number keys 1-5 also switch methods
      if (!isInput) {
        if (e.key === '1') {
          e.preventDefault();
          sound.playTap();
          setSelectedMethod('CASH');
        } else if (e.key === '2') {
          e.preventDefault();
          sound.playTap();
          setSelectedMethod('QRIS_BCA');
        } else if (e.key === '3') {
          e.preventDefault();
          sound.playTap();
          setSelectedMethod('EDC_BCA');
        } else if (e.key === '4') {
          e.preventDefault();
          sound.playTap();
          setSelectedMethod('TRANSFER_BCA');
        } else if (e.key === '5') {
          e.preventDefault();
          sound.playTap();
          setSelectedMethod('PIUTANG');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    selectedMethod,
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
    onClose
  ]);

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

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-400 uppercase font-medium tracking-wide">
                Total Tagihan
              </div>
              <div className="text-xl font-black text-amber-400 font-mono tabular-nums">
                {formatRupiah(grandTotal)}
              </div>
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
          <div className="w-full md:w-56 bg-slate-50 border-r border-slate-200 p-3 space-y-1.5 overflow-y-auto shrink-0">
            {[
              {
                id: 'CASH',
                label: 'Tunai (Cash)',
                icon: Banknote,
                color: 'text-emerald-600',
              },
              {
                id: 'QRIS_BCA',
                label: 'QRIS BCA',
                icon: QrCode,
                color: 'text-sky-600',
              },
              {
                id: 'EDC_BCA',
                label: 'EDC BCA (Kartu)',
                icon: CreditCard,
                color: 'text-indigo-600',
              },
              {
                id: 'TRANSFER_BCA',
                label: 'Transfer BCA',
                icon: ArrowRightLeft,
                color: 'text-blue-600',
              },
              {
                id: 'PIUTANG',
                label: 'Piutang (Tempo)',
                icon: Calendar,
                color: 'text-amber-600',
              },
            ].map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = selectedMethod === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    sound.playTap();
                    setSelectedMethod(tab.id as PaymentMethod);
                  }}
                  className={`w-full text-left p-3 rounded-2xl flex items-center justify-between transition-all ${
                    isActive
                      ? 'bg-sky-600 text-white font-bold shadow-md shadow-sky-600/20'
                      : 'hover:bg-slate-200/70 text-slate-700 font-medium'
                  }`}
                  title={`${tab.label} (Tekan ${idx + 1} atau F${idx + 1})`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : tab.color}`} />
                    <span className="text-xs md:text-sm truncate">{tab.label}</span>
                  </div>
                  <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                    isActive ? 'bg-sky-700 text-sky-100 border border-sky-400' : 'bg-slate-200 text-slate-600 border border-slate-300'
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

            {/* Loyalty point summary reminder */}
            {pointsDiscount > 0 && (
              <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Poin Dipotong</span>
                </div>
                <div>{pointsUsed} Poin = -{formatRupiah(pointsDiscount)}</div>
              </div>
            )}
          </div>

          {/* Right Form Display for selected payment method */}
          <div className="flex-1 p-5 overflow-y-auto bg-white flex flex-col justify-between">
            {/* 1. TUNAI (CASH) */}
            {selectedMethod === 'CASH' && (
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

            {/* 2. QRIS BCA */}
            {selectedMethod === 'QRIS_BCA' && (
              <div className="flex flex-col items-center justify-center text-center p-4 space-y-4">
                <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-lg max-w-xs w-full">
                  {/* Header QRIS */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="font-extrabold text-sm text-red-600 tracking-wider">QRIS</span>
                    <span className="font-extrabold text-sm text-blue-700 tracking-wider">BCA</span>
                  </div>

                  {/* QR Matrix SVG Mockup */}
                  <div className="my-4 p-3 bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-44 h-44">
                      {/* Realistic QR pattern */}
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

                      {/* Random data grid simulation */}
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
                      NMID: {storeSettings.bcaMerchantId}
                    </div>
                  </div>

                  <div className="text-xs font-bold text-slate-800">{storeSettings.storeName}</div>
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
                  Tunjukkan QR code ini kepada pembeli untuk di-scan lewat BCA mobile, myBCA, GoPay, OVO, Dana, atau ShopeePay.
                </p>
              </div>
            )}

            {/* 3. EDC BCA */}
            {selectedMethod === 'EDC_BCA' && (
              <div className="space-y-4 max-w-lg mx-auto">
                <div className="p-4 bg-sky-50 border border-sky-200 rounded-2xl flex items-center gap-3">
                  <CreditCard className="w-8 h-8 text-sky-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-sky-900">Mesin EDC BCA Terhubung</h4>
                    <p className="text-xs text-sky-700">
                      Gesek atau masukkan kartu nasabah ke terminal EDC BCA lalu masukkan PIN.
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

                  <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
                    Slip EDC akan tercatat pada invoice dan rekap settlement harian kasir.
                  </div>
                </div>
              </div>
            )}

            {/* 4. TRANSFER BCA */}
            {selectedMethod === 'TRANSFER_BCA' && (
              <div className="space-y-4 max-w-lg mx-auto">
                <div className="p-5 bg-gradient-to-br from-blue-700 to-indigo-800 text-white rounded-3xl shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-widest uppercase opacity-80">
                      Bank Central Asia (BCA)
                    </span>
                    <span className="text-base font-black tracking-tight">BCA</span>
                  </div>

                  <div>
                    <div className="text-[11px] opacity-80">Nomor Rekening Toko:</div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xl md:text-2xl font-mono font-bold tracking-wider">
                        {storeSettings.bcaAccountNumber}
                      </span>
                      <button
                        onClick={handleCopyBCA}
                        className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white transition-colors"
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
                      <span className="font-bold">{storeSettings.bcaAccountName}</span>
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
                    Pastikan dana transfer telah masuk ke m-BCA / KlikBCA sebelum menyelesaikan transaksi.
                  </p>
                </div>
              </div>
            )}

            {/* 5. PIUTANG (KASBON / TEMPO) */}
            {selectedMethod === 'PIUTANG' && (
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

            {/* Bottom Confirmation Bar */}
            <div className="pt-4 mt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  sound.playTap();
                  onClose();
                }}
                className="py-3 px-5 rounded-2xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs md:text-sm flex items-center gap-1.5"
                title="Batal / Tutup (Esc)"
              >
                <span>Batal</span>
                <kbd className="px-1 py-0.2 text-[9px] font-mono bg-slate-200 text-slate-600 rounded">Esc</kbd>
              </button>

              <button
                onClick={handleProcessPayment}
                disabled={
                  (selectedMethod === 'CASH' && !isCashSufficient) ||
                  (selectedMethod === 'PIUTANG' && !isCustomerValidForPiutang)
                }
                className="flex-1 py-3.5 px-6 rounded-2xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-40 disabled:hover:bg-sky-600 text-white font-extrabold text-sm md:text-base shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2 transition-all"
                title="Selesaikan Transaksi (Enter)"
              >
                <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                <span>
                  {selectedMethod === 'PIUTANG' ? 'Simpan Piutang & Cetak Nota' : 'Konfirmasi & Selesaikan Transaksi'}
                </span>
                <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-black bg-sky-700 text-sky-100 rounded border border-sky-400 shadow-2xs">
                  Enter ↵
                </kbd>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
