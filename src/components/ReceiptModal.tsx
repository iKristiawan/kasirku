import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  Printer, 
  Bluetooth, 
  CheckCircle, 
  X, 
  RotateCcw, 
  MessageCircle, 
  Smartphone,
  Check,
  AlertCircle,
  Loader2,
  Sliders,
  ExternalLink,
  QrCode as QrCodeIcon,
  Copy,
  Link2,
  Sparkles,
  Usb,
  Star,
  Send,
  Edit3,
  MessageSquare
} from 'lucide-react';
import { Transaction, StoreSettings, Customer } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';
import { 
  PaperSize, 
  isWebBluetoothSupported, 
  isBluetoothAllowedByPolicy,
  isUsbAllowedByPolicy,
  isPrinterPolicyError,
  printDirectBluetooth, 
  printDirectUsb,
  openRawBtPrint,
  getPrinterConnectionInfo,
  parseReceiptFooterLines
} from '../utils/bluetoothPrinter';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  storeSettings: StoreSettings;
  customers?: Customer[];
  onNewTransaction: () => void;
  autoSendWhatsApp?: boolean;
  onAutoSendWhatsAppHandled?: () => void;
  autoPrintReceipt?: boolean;
  onAutoPrintHandled?: () => void;
  isDigitalLinkMode?: boolean;
  onRateTransaction?: (
    transactionId: string,
    payload: {
      rating: number;
      tags?: string[];
      comment?: string;
      channel?: 'RECEIPT_MODAL' | 'DIGITAL_LINK';
    }
  ) => void;
}

const POSITIVE_RATING_TAGS = [
  'Pelayanan Ramah',
  'Proses Kasir Cepat',
  'Produk Lengkap',
  'Harga Bersahabat',
  'Toko Bersih & Rapi',
];

const IMPROVEMENT_RATING_TAGS = [
  'Antrean Cukup Lama',
  'Pelayanan Perlu Ditingkatkan',
  'Stok Barang Kurang',
  'Harga Kurang Sesuai',
  'Kebersihan / Tata Toko',
];

const RATING_LABELS: Record<number, { title: string; badgeClass: string }> = {
  1: { title: 'Sangat Kecewa', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200' },
  2: { title: 'Kurang Puas', badgeClass: 'bg-orange-100 text-orange-800 border-orange-200' },
  3: { title: 'Cukup Baik', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
  4: { title: 'Puas', badgeClass: 'bg-teal-100 text-teal-800 border-teal-200' },
  5: { title: 'Sangat Puas!', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
};

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  transaction,
  storeSettings,
  customers,
  onNewTransaction,
  autoSendWhatsApp = false,
  onAutoSendWhatsAppHandled,
  autoPrintReceipt = false,
  onAutoPrintHandled,
  isDigitalLinkMode = false,
  onRateTransaction,
}) => {
  // Thermal paper roll size selection: '58mm' (Mobile Bluetooth) or '80mm' (Desktop)
  const [paperSize, setPaperSize] = useState<PaperSize>(storeSettings.printerPaperWidth || '58mm');
  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState<boolean>(false);
  const [isUsbPrinting, setIsUsbPrinting] = useState<boolean>(false);
  const [bluetoothStatus, setBluetoothStatus] = useState<string | null>(null);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedWaText, setCopiedWaText] = useState<boolean>(false);
  const [autoWaBanner, setAutoWaBanner] = useState<{
    status: 'SENT' | 'NO_PHONE';
    phone?: string;
    customerName?: string;
  } | null>(null);
  const [autoPrintBanner, setAutoPrintBanner] = useState<{
    status: 'PRINTING' | 'DONE' | 'SYSTEM';
    message: string;
  } | null>(null);

  // Customer satisfaction rating (1-5 stars) states
  const [selectedRating, setSelectedRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [selectedRatingTags, setSelectedRatingTags] = useState<string[]>([]);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [isEditingRating, setIsEditingRating] = useState<boolean>(false);
  const [ratingSavedToast, setRatingSavedToast] = useState<boolean>(false);
  const [copiedDigitalLink, setCopiedDigitalLink] = useState<boolean>(false);

  const autoWaAnchorRef = useRef<HTMLAnchorElement>(null);
  const autoTriggeredTxIdRef = useRef<string | null>(null);
  const autoPrintTriggeredTxIdRef = useRef<string | null>(null);

  // Resolve customer & WhatsApp target
  const matchedCustomer = transaction
    ? customers?.find(
        (c) =>
          (transaction.customerId && c.id === transaction.customerId) ||
          (transaction.customerName &&
            c.name.trim().toLowerCase() === transaction.customerName.trim().toLowerCase())
      )
    : undefined;

  const customerPhone =
    matchedCustomer?.whatsapp ||
    matchedCustomer?.phone ||
    transaction?.customerWhatsapp ||
    '';

  const transactionSummaryUrl =
    transaction && typeof window !== 'undefined'
      ? `${window.location.origin}/?invoice=${encodeURIComponent(transaction.invoiceNumber)}`
      : '';

  // Generate unique digital invoice QR code
  useEffect(() => {
    if (!transaction) return;
    const digitalInvoicePayload = JSON.stringify({
      app: 'KasirKu Tablet POS',
      store: storeSettings.storeName,
      invoice: transaction.invoiceNumber,
      date: new Date(transaction.timestamp).toISOString(),
      cashier: transaction.cashierName,
      customer: transaction.customerName || 'Pelanggan Umum',
      subtotal: transaction.subtotal,
      discount: transaction.discount,
      total: transaction.finalAmount,
      method: transaction.paymentMethod,
      items: transaction.items.map((i) => ({
        n: i.productName,
        q: i.quantity,
        u: i.unitName,
        p: i.unitPrice,
        t: i.totalAmount,
      })),
    });

    QRCode.toDataURL(digitalInvoicePayload, {
      width: 140,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })
      .then((url) => setQrCodeDataUrl(url))
      .catch((err) => console.error('Failed to generate QR Code:', err));
  }, [transaction, storeSettings.storeName]);

  // Reset auto WhatsApp tracking when modal closes & sync configured paper width + rating form
  useEffect(() => {
    if (isOpen && transaction) {
      setPaperSize(storeSettings.printerPaperWidth || '58mm');
      setSelectedRating(transaction.customerRating || 0);
      setHoveredRating(0);
      setSelectedRatingTags(transaction.customerRatingTags || []);
      setRatingComment(transaction.customerRatingComment || '');
      setIsEditingRating(!transaction.customerRating);
      setRatingSavedToast(false);
      setCopiedDigitalLink(false);
    } else if (!isOpen) {
      autoTriggeredTxIdRef.current = null;
      autoPrintTriggeredTxIdRef.current = null;
      setAutoWaBanner(null);
      setAutoPrintBanner(null);
      setCopiedWaText(false);
      setRatingSavedToast(false);
      setCopiedDigitalLink(false);
    }
  }, [isOpen, transaction?.id, transaction?.customerRating, storeSettings.printerPaperWidth]);

  // Auto-Print Receipt immediately after successful payment if enabled in Settings
  useEffect(() => {
    if (
      !isOpen ||
      !transaction ||
      !autoPrintReceipt ||
      !storeSettings.autoPrintReceipt ||
      autoPrintTriggeredTxIdRef.current === transaction.id
    ) {
      return;
    }

    autoPrintTriggeredTxIdRef.current = transaction.id;
    const activePaperSize: PaperSize = storeSettings.printerPaperWidth || '58mm';
    const connInfo = getPrinterConnectionInfo();
    const preferredMode = storeSettings.printerConnectionType || 'BLUETOOTH';

    const runAutoPrint = async () => {
      if (preferredMode === 'BLUETOOTH' && connInfo.bluetoothConnected) {
        setAutoPrintBanner({
          status: 'PRINTING',
          message: `Auto-Print Receipt: Mengirim struk ke Bluetooth (${connInfo.bluetoothDeviceName || 'Printer'})...`,
        });
        try {
          await printDirectBluetooth(transaction, storeSettings, activePaperSize);
          sound.playSuccessChime();
          setAutoPrintBanner({
            status: 'DONE',
            message: `Auto-Print Receipt selesai via Bluetooth (${activePaperSize}).`,
          });
          onAutoPrintHandled?.();
          return;
        } catch {
          // Fall through cleanly to system print dialog
        }
      } else if (preferredMode === 'USB' && connInfo.usbConnected) {
        setAutoPrintBanner({
          status: 'PRINTING',
          message: `Auto-Print Receipt: Mengirim struk ke Printer USB (${connInfo.usbDeviceName || 'USB'})...`,
        });
        try {
          await printDirectUsb(transaction, storeSettings, activePaperSize);
          sound.playSuccessChime();
          setAutoPrintBanner({
            status: 'DONE',
            message: `Auto-Print Receipt selesai via USB (${activePaperSize}).`,
          });
          onAutoPrintHandled?.();
          return;
        } catch {
          // Fall through cleanly to system print dialog
        }
      }

      // Default / System Print fallback (triggers immediately without manual print button click)
      setAutoPrintBanner({
        status: 'SYSTEM',
        message: `Auto-Print Receipt (${activePaperSize}) dijalankan otomatis via Driver Cetak Sistem.`,
      });
      try {
        window.print();
      } catch (err) {
        console.warn('Auto-print system dialog blocked in sandboxed frame:', err);
      }
      onAutoPrintHandled?.();
    };

    const timer = setTimeout(() => {
      runAutoPrint();
    }, 240);

    return () => clearTimeout(timer);
  }, [
    isOpen,
    transaction,
    autoPrintReceipt,
    storeSettings,
    onAutoPrintHandled,
  ]);

  // Auto-trigger WhatsApp notification on newly completed transaction if enabled in Settings
  useEffect(() => {
    if (
      !isOpen ||
      !transaction ||
      !autoSendWhatsApp ||
      !storeSettings.autoSendWhatsAppReceipt ||
      autoTriggeredTxIdRef.current === transaction.id
    ) {
      return;
    }

    autoTriggeredTxIdRef.current = transaction.id;

    if (customerPhone.trim()) {
      setAutoWaBanner({
        status: 'SENT',
        phone: customerPhone,
        customerName: transaction.customerName || matchedCustomer?.name || 'Pelanggan',
      });
      const delay = autoPrintReceipt && storeSettings.autoPrintReceipt ? 650 : 180;
      const timer = setTimeout(() => {
        autoWaAnchorRef.current?.click();
        onAutoSendWhatsAppHandled?.();
      }, delay);
      return () => clearTimeout(timer);
    } else {
      setAutoWaBanner({
        status: 'NO_PHONE',
        customerName: transaction.customerName || 'Pelanggan Umum',
      });
      onAutoSendWhatsAppHandled?.();
    }
  }, [
    isOpen,
    transaction,
    autoSendWhatsApp,
    autoPrintReceipt,
    storeSettings.autoSendWhatsAppReceipt,
    storeSettings.autoPrintReceipt,
    customerPhone,
    matchedCustomer?.name,
    onAutoSendWhatsAppHandled,
  ]);

  if (!isOpen || !transaction) return null;

  // 1. Primary Print handler using window.print() + @media print thermal formatting
  const handlePrint = () => {
    sound.playTap();
    // Allow React state to update if needed before opening system print dialog
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn('Print dialog cannot be opened directly in sandboxed frame:', err);
      }
    }, 50);
  };

  // 2. Direct Web Bluetooth Print (ESC/POS binary stream)
  const handleBluetoothPrint = async () => {
    sound.playTap();
    setIsBluetoothPrinting(true);
    setBluetoothError(null);

    if (!isBluetoothAllowedByPolicy()) {
      setIsBluetoothPrinting(false);
      setBluetoothStatus(null);
      setBluetoothError(
        'Koneksi langsung Web Bluetooth dibatasi di dalam frame preview. Gunakan tombol RawBT (Android) / Cetak Struk (Driver Sistem), atau buka aplikasi di Tab Browser Penuh.'
      );
      return;
    }

    setBluetoothStatus('Mencari & menghubungkan printer Bluetooth...');

    try {
      await printDirectBluetooth(transaction, storeSettings, paperSize);
      setBluetoothStatus('Struk berhasil dicetak via Bluetooth!');
      sound.playSuccessChime();
      setTimeout(() => setBluetoothStatus(null), 3500);
    } catch (err: any) {
      console.warn('Bluetooth print error:', err);
      // If user cancelled selection dialog
      if (err?.name === 'NotFoundError' || err?.message?.includes('User cancelled')) {
        setBluetoothStatus(null);
      } else if (isPrinterPolicyError(err)) {
        setBluetoothStatus(null);
        setBluetoothError(
          'Koneksi langsung Web Bluetooth dibatasi di dalam frame preview. Gunakan RawBT / Cetak Struk, atau buka di Tab Browser Penuh.'
        );
      } else {
        setBluetoothError(err?.message || 'Gagal mencetak via Bluetooth. Pastikan Bluetooth aktif.');
      }
    } finally {
      setIsBluetoothPrinting(false);
    }
  };

  // 2b. Direct WebUSB Print (ESC/POS binary stream via USB/OTG)
  const handleUsbPrint = async () => {
    sound.playTap();
    setIsUsbPrinting(true);
    setBluetoothError(null);

    if (!isUsbAllowedByPolicy()) {
      setIsUsbPrinting(false);
      setBluetoothStatus(null);
      setBluetoothError(
        'Koneksi langsung WebUSB dibatasi di dalam frame preview. Gunakan tombol Cetak Struk (Driver USB Sistem), atau buka aplikasi di Tab Browser Penuh.'
      );
      return;
    }

    setBluetoothStatus('Menghubungkan & mengirim data ke printer USB...');

    try {
      await printDirectUsb(transaction, storeSettings, paperSize);
      setBluetoothStatus('Struk berhasil dicetak via Printer USB!');
      sound.playSuccessChime();
      setTimeout(() => setBluetoothStatus(null), 3500);
    } catch (err: any) {
      console.warn('USB print error:', err);
      if (err?.name === 'NotFoundError' || err?.message?.includes('User cancelled')) {
        setBluetoothStatus(null);
      } else if (isPrinterPolicyError(err)) {
        setBluetoothStatus(null);
        setBluetoothError(
          'Koneksi langsung WebUSB dibatasi di dalam frame preview. Gunakan tombol Cetak Struk (Driver USB Sistem) atau buka di Tab Browser Penuh.'
        );
      } else {
        setBluetoothError(
          err?.message || 'Gagal mencetak via WebUSB. Gunakan tombol Cetak Struk (Driver USB Sistem).'
        );
      }
    } finally {
      setIsUsbPrinting(false);
    }
  };

  // 3. RawBT / External Bluetooth Print app launch for Android tablet
  const handleRawBtLaunch = () => {
    sound.playTap();
    openRawBtPrint(transaction, storeSettings, paperSize);
  };

  // 4. WhatsApp Receipt generation (with optional summary link & loyalty points info)
  const includeSummaryLink = storeSettings.includeReceiptSummaryInAutoWa ?? true;
  const includeLoyaltyInfo = storeSettings.includeLoyaltyPointsInAutoWa ?? true;

  const generateWhatsAppMessage = (): string => {
    const isMemberCustomer = Boolean(
      matchedCustomer &&
        (matchedCustomer.isMember ||
          matchedCustomer.customerCategory?.toUpperCase() === 'MEMBER' ||
          matchedCustomer.totalPoints > 0)
    );
    const hasPointActivity =
      transaction.pointsEarned > 0 ||
      transaction.pointsUsed > 0 ||
      isMemberCustomer;

    // Build reusable blocks for custom template & default format
    const itemLines: string[] = [];
    transaction.items.forEach((item) => {
      const varStr = item.selectedVariant ? ` (${item.selectedVariant})` : '';
      itemLines.push(`${item.productName}${varStr}`);
      itemLines.push(
        `  ${item.quantity} ${item.unitName} x ${formatRupiah(item.unitPrice)} = ${formatRupiah(item.totalAmount)}`
      );
    });

    const pointsInfoLines: string[] = [];
    if (includeLoyaltyInfo && hasPointActivity) {
      pointsInfoLines.push(`*INFO POIN LOYALITAS MEMBER*`);
      if (transaction.pointsEarned > 0) {
        pointsInfoLines.push(`Poin Didapat  : +${formatNumber(transaction.pointsEarned)} Poin`);
      }
      if (transaction.pointsUsed > 0) {
        pointsInfoLines.push(`Poin Ditukar  : -${formatNumber(transaction.pointsUsed)} Poin`);
      }
      if (matchedCustomer) {
        pointsInfoLines.push(`Saldo Poin    : ${formatNumber(matchedCustomer.totalPoints)} Poin`);
      }
    } else if (transaction.pointsEarned > 0) {
      pointsInfoLines.push(`Poin Diperoleh: +${formatNumber(transaction.pointsEarned)} Poin`);
    }

    const summaryLinkBlock =
      includeSummaryLink && transactionSummaryUrl
        ? `Link Ringkasan Transaksi:\n${transactionSummaryUrl}`
        : '';

    // Use customized WhatsApp receipt template when enabled by Admin
    if (storeSettings.useCustomWhatsAppTemplate && storeSettings.customWhatsAppTemplate?.trim()) {
      const totalDiscount = (transaction.discount || 0) + (transaction.pointsDiscountAmount || 0);
      const rendered = storeSettings.customWhatsAppTemplate
        .replace(/\{customerName\}/g, transaction.customerName || 'Pelanggan Umum')
        .replace(/\{invoiceNumber\}/g, transaction.invoiceNumber)
        .replace(/\{totalAmount\}/g, formatRupiah(transaction.finalAmount))
        .replace(/\{subtotal\}/g, formatRupiah(transaction.subtotal))
        .replace(/\{discount\}/g, formatRupiah(totalDiscount))
        .replace(/\{storeName\}/g, storeSettings.storeName)
        .replace(/\{storeAddress\}/g, storeSettings.storeAddress || '')
        .replace(/\{storePhone\}/g, storeSettings.storePhone || '')
        .replace(/\{storeFooter\}/g, storeSettings.storeFooterReceipt || 'Terima kasih atas kunjungan Anda')
        .replace(/\{dateTime\}/g, formatDateTime(transaction.timestamp))
        .replace(/\{cashierName\}/g, transaction.cashierName)
        .replace(/\{paymentMethod\}/g, String(transaction.paymentMethod || 'TUNAI').replace(/_/g, ' '))
        .replace(/\{itemsList\}/g, itemLines.join('\n'))
        .replace(/\{pointsEarned\}/g, formatNumber(transaction.pointsEarned || 0))
        .replace(/\{pointsUsed\}/g, formatNumber(transaction.pointsUsed || 0))
        .replace(/\{pointsBalance\}/g, formatNumber(matchedCustomer?.totalPoints ?? 0))
        .replace(/\{pointsInfo\}/g, pointsInfoLines.join('\n'))
        .replace(/\{summaryLink\}/g, summaryLinkBlock);

      return rendered.replace(/\n{3,}/g, '\n\n').trim();
    }

    // Standard built-in receipt format
    const lines = [
      `*NOTA PEMBELIAN - ${storeSettings.storeName}*`,
      `${storeSettings.storeAddress}`,
      storeSettings.storePhone ? `Telp: ${storeSettings.storePhone}` : '',
      `--------------------------------`,
      `No. Nota : ${transaction.invoiceNumber}`,
      `Waktu    : ${formatDateTime(transaction.timestamp)}`,
      `Kasir    : ${transaction.cashierName}`,
      transaction.customerName
        ? `Pelanggan: ${transaction.customerName}${transaction.customerCategory ? ` [${transaction.customerCategory}]` : ''}`
        : '',
      `--------------------------------`,
      ...itemLines,
      `--------------------------------`,
      `Subtotal     : ${formatRupiah(transaction.subtotal)}`,
    ];

    if (transaction.pointsDiscountAmount > 0) {
      lines.push(`Potongan Poin: -${formatRupiah(transaction.pointsDiscountAmount)} (${transaction.pointsUsed} Pts)`);
    }

    if (transaction.discount > 0) {
      lines.push(`Diskon       : -${formatRupiah(transaction.discount)}`);
    }

    lines.push(`*TOTAL AKHIR : ${formatRupiah(transaction.finalAmount)}*`);
    lines.push(`Metode Bayar : ${String(transaction.paymentMethod || 'TUNAI').replace(/_/g, ' ')}`);

    if (transaction.paymentMethod === 'CASH') {
      lines.push(`Bayar Tunai  : ${formatRupiah(transaction.cashPaid || transaction.finalAmount)}`);
      lines.push(`Kembalian    : ${formatRupiah(transaction.cashChange || 0)}`);
    } else if (transaction.paymentMethod === 'PIUTANG') {
      lines.push(`Status       : BELUM LUNAS (PIUTANG)`);
      if (transaction.dueDate) {
        lines.push(`Jatuh Tempo  : ${transaction.dueDate}`);
      }
    }

    if (transaction.notes?.trim()) {
      lines.push(`Catatan      : ${transaction.notes.trim()}`);
    }

    if (pointsInfoLines.length > 0) {
      if (includeLoyaltyInfo && hasPointActivity) {
        lines.push(`--------------------------------`);
      }
      lines.push(...pointsInfoLines);
    }

    // Transaction summary link
    if (summaryLinkBlock) {
      lines.push(`--------------------------------`);
      lines.push(summaryLinkBlock);
    }

    lines.push(`--------------------------------`);
    lines.push(`${storeSettings.storeFooterReceipt}`);

    return lines.filter(Boolean).join('\n');
  };

  const whatsappMessage = generateWhatsAppMessage();
  const whatsappUrl = formatWhatsAppUrl(customerPhone, whatsappMessage);

  const handleCopyWhatsAppMessage = () => {
    sound.playTap();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(whatsappMessage).catch(() => {});
    }
    setCopiedWaText(true);
    setTimeout(() => setCopiedWaText(false), 2500);
  };

  const handleToggleRatingTag = (tag: string) => {
    sound.playTap();
    setSelectedRatingTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitCustomerRating = () => {
    if (!transaction || !onRateTransaction || selectedRating < 1 || selectedRating > 5) {
      sound.playError();
      return;
    }
    sound.playSuccessChime();
    onRateTransaction(transaction.id, {
      rating: selectedRating,
      tags: selectedRatingTags,
      comment: ratingComment.trim() || undefined,
      channel: isDigitalLinkMode ? 'DIGITAL_LINK' : 'RECEIPT_MODAL',
    });
    setIsEditingRating(false);
    setRatingSavedToast(true);
    setTimeout(() => setRatingSavedToast(false), 3500);
  };

  const handleCopyDigitalReceiptUrl = () => {
    if (!transactionSummaryUrl) return;
    sound.playTap();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(transactionSummaryUrl).catch(() => {});
    }
    setCopiedDigitalLink(true);
    setTimeout(() => setCopiedDigitalLink(false), 2500);
  };

  const activeStarValue = hoveredRating || selectedRating;
  const availableRatingTags =
    activeStarValue >= 1 && activeStarValue <= 3
      ? IMPROVEMENT_RATING_TAGS
      : POSITIVE_RATING_TAGS;
  const hasExistingRating = Boolean(transaction.customerRating && transaction.customerRating >= 1);

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2.5 md:p-5 select-none overflow-y-auto receipt-modal-backdrop">
      {/* Hidden anchor for automatic WhatsApp launch */}
      <a
        ref={autoWaAnchorRef}
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hidden"
        aria-hidden="true"
      />

      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[94vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150 receipt-modal-card">
        
        {/* Top Notification Bar (Hidden on print) */}
        <div className="p-4 bg-emerald-600 text-white flex items-center justify-between no-print shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle className="w-6 h-6 text-white stroke-[2.5] shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold">
                  {isDigitalLinkMode ? 'Struk Digital Resmi' : 'Transaksi Berhasil'}
                </h3>
                {hasExistingRating && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                    <Star className="w-3 h-3 fill-slate-950" />
                    <span>{transaction.customerRating}/5</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-emerald-100 font-mono truncate">
                {transaction.invoiceNumber}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {transactionSummaryUrl && (
              <button
                type="button"
                onClick={handleCopyDigitalReceiptUrl}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-800 text-white text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Salin tautan struk digital untuk pelanggan"
              >
                {copiedDigitalLink ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Link2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copiedDigitalLink ? 'Tersalin' : 'Link Struk'}</span>
              </button>
            )}
            <button
              onClick={() => {
                sound.playTap();
                onClose();
              }}
              className="p-1.5 rounded-lg hover:bg-emerald-700 text-emerald-100 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Auto-Print Receipt Banner (Hidden on print) */}
        {autoPrintBanner && (
          <div
            className={`px-4 py-2.5 border-b flex items-center justify-between gap-2 text-[11px] no-print ${
              autoPrintBanner.status === 'DONE'
                ? 'bg-sky-50 border-sky-200 text-sky-900'
                : 'bg-indigo-50 border-indigo-200 text-indigo-900'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {autoPrintBanner.status === 'PRINTING' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
              ) : (
                <Printer className="w-3.5 h-3.5 text-sky-600 shrink-0" />
              )}
              <span>{autoPrintBanner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoPrintBanner(null)}
              className="p-0.5 rounded hover:bg-black/5 shrink-0"
              aria-label="Tutup notifikasi auto-print"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Auto WhatsApp Notification Banner (Hidden on print) */}
        {autoWaBanner && (
          <div
            className={`px-4 py-3 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 no-print ${
              autoWaBanner.status === 'SENT'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-amber-50 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <MessageCircle
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  autoWaBanner.status === 'SENT' ? 'text-emerald-600' : 'text-amber-600'
                }`}
              />
              <div className="text-[11px] leading-snug">
                {autoWaBanner.status === 'SENT' ? (
                  <>
                    <div className="font-bold flex items-center gap-1.5 flex-wrap">
                      <span>Notifikasi WhatsApp Otomatis Disiapkan</span>
                      {includeSummaryLink && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-emerald-200/70 text-emerald-900 text-[9.5px] font-bold">
                          <Link2 className="w-2.5 h-2.5" /> Link Nota
                        </span>
                      )}
                      {includeLoyaltyInfo && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-200/70 text-amber-900 text-[9.5px] font-bold">
                          <Sparkles className="w-2.5 h-2.5" /> Info Poin
                        </span>
                      )}
                    </div>
                    <p className="text-emerald-700 mt-0.5">
                      Ditujukan ke <b>{autoWaBanner.customerName}</b> ({autoWaBanner.phone}). Jika tab WhatsApp tertahan browser, klik tombol di kanan.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="font-bold">Nomor WhatsApp Pelanggan Tidak Tersedia</div>
                    <p className="text-amber-800 mt-0.5">
                      Fitur WA otomatis aktif, namun {autoWaBanner.customerName} belum memiliki nomor WA terdaftar. Anda bisa kirim manual atau salin pesan.
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => sound.playTap()}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Buka WA</span>
              </a>
              <button
                type="button"
                onClick={handleCopyWhatsAppMessage}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-[11px] flex items-center gap-1 transition-colors"
              >
                {copiedWaText ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedWaText ? 'Disalin' : 'Salin'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Paper Size & Thermal Settings Bar (Hidden on print) */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700">Format Kertas Thermal:</span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-200/80 p-1 rounded-xl">
            <button
              onClick={() => {
                sound.playTap();
                setPaperSize('58mm');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                paperSize === '58mm'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>58mm</span>
              <span className="text-[10px] text-sky-600 font-normal">(Mobile BT)</span>
            </button>

            <button
              onClick={() => {
                sound.playTap();
                setPaperSize('80mm');
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                paperSize === '80mm'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>80mm</span>
              <span className="text-[10px] text-emerald-600 font-normal">(Desktop BT)</span>
            </button>
          </div>
        </div>

        {/* Status / Alert Banner for Bluetooth (Hidden on print) */}
        {bluetoothStatus && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in no-print">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{bluetoothStatus}</span>
          </div>
        )}

        {bluetoothError && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2 animate-in fade-in no-print">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <span className="font-medium block">{bluetoothError}</span>
              <div className="flex items-center gap-2 flex-wrap">
                {typeof window !== 'undefined' && (!isBluetoothAllowedByPolicy() || !isUsbAllowedByPolicy()) && (
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => sound.playTap()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-[11px] transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Buka Tab Browser Penuh</span>
                  </a>
                )}
                <p className="text-[11px] text-amber-700">
                  Atau gunakan <strong>Cetak Struk (System Print)</strong> / <strong>Buka RawBT</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Digital Receipt Body + Customer Satisfaction Rating Card */}
        <div className="flex-1 overflow-y-auto bg-slate-100 p-4 md:p-5 space-y-4">
          <div className="flex justify-center">
            <div 
              id="thermal-receipt-print-area"
              className={`bg-white shadow-md border border-slate-200 text-slate-900 font-mono relative transition-all ${
                paperSize === '58mm'
                  ? 'paper-58mm w-[270px] p-3 text-[11px] leading-tight'
                  : 'paper-80mm w-[350px] p-4 text-xs leading-normal'
              }`}
              style={{ borderRadius: '2px' }}
            >
            {/* Header: Store Identity */}
            <div className="text-center space-y-0.5">
              {/* Shop Logo (Thermal Monochromatic Output) */}
              {storeSettings.storeLogo && (storeSettings.showLogoOnReceipt ?? true) && (
                <div className="flex justify-center mb-1.5">
                  <img
                    src={storeSettings.storeLogo}
                    alt={storeSettings.storeName}
                    className={`receipt-logo mx-auto block object-contain filter grayscale contrast-150 ${
                      paperSize === '58mm' ? 'max-h-12 max-w-[140px]' : 'max-h-16 max-w-[180px]'
                    }`}
                  />
                </div>
              )}
              <h2 className="font-black tracking-wider uppercase text-slate-900 text-sm">
                {storeSettings.storeName}
              </h2>
              {storeSettings.storeAddress && (
                <p className="text-[10.5px] text-slate-600 leading-tight">
                  {storeSettings.storeAddress}
                </p>
              )}
              {storeSettings.storePhone && (
                <p className="text-[10.5px] text-slate-600">
                  Telp: {storeSettings.storePhone}
                </p>
              )}
              {storeSettings.storeHeaderReceipt && (
                <p className="text-[10.5px] text-slate-700 italic font-semibold mt-1">
                  {storeSettings.storeHeaderReceipt}
                </p>
              )}
            </div>

            {/* Separator */}
            <div className="thermal-dash my-2 border-t border-dashed border-slate-400"></div>

            {/* Transaction Metadata */}
            <div className="space-y-0.5 text-[10.5px] text-slate-700">
              <div className="flex justify-between">
                <span>No. Nota:</span>
                <span className="font-bold text-slate-900">{transaction.invoiceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Waktu:</span>
                <span>{formatDateTime(transaction.timestamp)}</span>
              </div>
              <div className="flex justify-between">
                <span>Kasir:</span>
                <span>{transaction.cashierName}</span>
              </div>
              {transaction.customerName && (
                <div className="flex justify-between">
                  <span>Pelanggan:</span>
                  <span className="font-bold text-slate-900">
                    {transaction.customerName}
                    {transaction.customerCategory && ` (${transaction.customerCategory})`}
                  </span>
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="thermal-dash my-2 border-t border-dashed border-slate-400"></div>

            {/* Product Items List */}
            <div className="space-y-1.5">
              {transaction.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold text-slate-900 text-[11px] flex items-center gap-1 flex-wrap">
                    <span>{item.productName}</span>
                    {item.selectedVariant && (
                      <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-1 py-0.2 rounded">
                        ({item.selectedVariant})
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-[10.5px] text-slate-600">
                    <span>
                      {item.quantity} {item.unitName} x {formatRupiah(item.unitPrice)}
                    </span>
                    <span className="font-bold text-slate-900 tabular-nums">
                      {formatRupiah(item.totalAmount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Separator */}
            <div className="thermal-dash my-2 border-t border-dashed border-slate-400"></div>

            {/* Financial Totals */}
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-700">
                <span>Subtotal:</span>
                <span className="tabular-nums">{formatRupiah(transaction.subtotal)}</span>
              </div>

              {transaction.membershipDiscountAmount && transaction.membershipDiscountAmount > 0 && (
                <div className="flex justify-between text-indigo-900 font-bold">
                  <span>Diskon Member ({transaction.customerTier || 'MEMBER'} {transaction.membershipDiscountPercent}%):</span>
                  <span className="tabular-nums">-{formatRupiah(transaction.membershipDiscountAmount)}</span>
                </div>
              )}

              {transaction.pointsDiscountAmount > 0 && (
                <div className="flex justify-between text-amber-800 font-semibold">
                  <span>Diskon Poin ({transaction.pointsUsed} pts):</span>
                  <span className="tabular-nums">-{formatRupiah(transaction.pointsDiscountAmount)}</span>
                </div>
              )}

              {transaction.discount > 0 && !transaction.membershipDiscountAmount && (
                <div className="flex justify-between text-rose-700 font-semibold">
                  <span>Diskon Tambahan:</span>
                  <span className="tabular-nums">-{formatRupiah(transaction.discount)}</span>
                </div>
              )}

              <div className="thermal-double-dash border-t-2 border-slate-900 my-1"></div>

              <div className="flex justify-between text-sm font-black text-slate-900">
                <span>TOTAL:</span>
                <span className="tabular-nums">{formatRupiah(transaction.finalAmount)}</span>
              </div>

              <div className="flex justify-between text-slate-700 pt-1">
                <span>Metode Bayar:</span>
                <span className="font-bold">{String(transaction.paymentMethod || 'TUNAI').replace(/_/g, ' ')}</span>
              </div>

              {transaction.paymentMethod === 'CASH' && (
                <>
                  <div className="flex justify-between text-slate-700">
                    <span>Tunai:</span>
                    <span className="tabular-nums">
                      {formatRupiah(transaction.cashPaid || transaction.finalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-700">
                    <span>Kembalian:</span>
                    <span className="tabular-nums font-bold">
                      {formatRupiah(transaction.cashChange || 0)}
                    </span>
                  </div>
                </>
              )}

              {transaction.paymentMethod === 'PIUTANG' && (
                <div className="flex justify-between text-amber-800 font-bold bg-amber-50 p-1 rounded">
                  <span>Jatuh Tempo:</span>
                  <span>{transaction.dueDate || '14 Hari'}</span>
                </div>
              )}

              {transaction.pointsEarned > 0 && (
                <div className="flex justify-between text-emerald-800 font-bold pt-1">
                  <span>Poin Diperoleh:</span>
                  <span>+{transaction.pointsEarned} Poin</span>
                </div>
              )}

              {transaction.notes?.trim() && (
                <div className="mt-1.5 pt-1.5 border-t border-dashed border-slate-300 text-[10px] text-slate-700">
                  <span className="font-bold text-slate-900">Catatan: </span>
                  <span className="whitespace-pre-wrap break-words">{transaction.notes.trim()}</span>
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="thermal-dash my-2 border-t border-dashed border-slate-400"></div>

            {/* Footer Message & Digital QR Code */}
            <div className="text-center text-[10px] text-slate-600 leading-tight pt-1 space-y-0.5">
              {parseReceiptFooterLines(storeSettings.storeFooterReceipt).map((line, idx) => (
                <p
                  key={idx}
                  className={idx === 0 ? 'text-slate-700 font-medium' : 'text-[9.5px] text-slate-500'}
                >
                  {line}
                </p>
              ))}

              {/* Unique Digital Invoice QR Code */}
              {qrCodeDataUrl && (
                <div className="mt-3 pt-2 border-t border-dashed border-slate-300 flex flex-col items-center justify-center">
                  <div className="p-1 bg-white border border-slate-300 rounded-lg inline-block">
                    <img
                      src={qrCodeDataUrl}
                      alt={`QR Struk ${transaction.invoiceNumber}`}
                      className="w-24 h-24 object-contain"
                    />
                  </div>
                  <p className="text-[9px] font-black text-slate-800 mt-1 uppercase tracking-wider">
                    Scan Struk Digital
                  </p>
                  <p className="text-[8.5px] font-mono text-slate-500">
                    {transaction.invoiceNumber}
                  </p>
                </div>
              )}
            </div>

            {/* Thermal paper feeder cut margin */}
            <div className="thermal-paper-feed"></div>
          </div>
          </div>

          {/* Customer Satisfaction Star Rating Widget (Digital Receipt Page - Hidden on Print) */}
          {onRateTransaction && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-3 no-print">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                    <h4 className="text-xs font-extrabold text-slate-900">
                      Penilaian Kepuasan Pelanggan
                    </h4>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {hasExistingRating && !isEditingRating
                      ? 'Terima kasih atas ulasan Anda! Penilaian tercatat di laporan kualitas layanan toko.'
                      : 'Berikan rating bintang 1–5 untuk pelayanan kasir dan pengalaman belanja Anda.'}
                  </p>
                </div>

                {activeStarValue > 0 && RATING_LABELS[activeStarValue] && (
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border shrink-0 ${RATING_LABELS[activeStarValue].badgeClass}`}
                  >
                    {RATING_LABELS[activeStarValue].title}
                  </span>
                )}
              </div>

              {ratingSavedToast && (
                <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Penilaian bintang {transaction.customerRating}/5 berhasil disimpan!</span>
                </div>
              )}

              {hasExistingRating && !isEditingRating ? (
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1" aria-label={`Rating ${transaction.customerRating} dari 5 bintang`}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-5 h-5 ${
                            star <= (transaction.customerRating || 0)
                              ? 'text-amber-400 fill-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      ))}
                      <span className="ml-1.5 text-xs font-black font-mono text-slate-900">
                        {transaction.customerRating}.0 / 5.0
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setSelectedRating(transaction.customerRating || 5);
                        setSelectedRatingTags(transaction.customerRatingTags || []);
                        setRatingComment(transaction.customerRatingComment || '');
                        setIsEditingRating(true);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-50 border border-amber-300 text-amber-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Ubah Rating</span>
                    </button>
                  </div>

                  {transaction.customerRatingTags && transaction.customerRatingTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {transaction.customerRatingTags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-900 text-[10px] font-bold"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {transaction.customerRatingComment && (
                    <div className="text-[11px] text-slate-700 bg-white/90 rounded-lg px-2.5 py-2 border border-amber-200/70 flex items-start gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span className="italic">"{transaction.customerRatingComment}"</span>
                    </div>
                  )}

                  {transaction.customerRatedAt && (
                    <div className="text-[10px] text-slate-500">
                      Dikirim pada {formatDateTime(transaction.customerRatedAt)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 1-5 Star Interactive Selector */}
                  <div className="flex items-center justify-center gap-2 py-2 bg-slate-50 rounded-xl border border-slate-200">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const isFilled = star <= activeStarValue;
                      return (
                        <button
                          key={star}
                          type="button"
                          onMouseEnter={() => setHoveredRating(star)}
                          onMouseLeave={() => setHoveredRating(0)}
                          onClick={() => {
                            sound.playTap();
                            setSelectedRating(star);
                          }}
                          aria-label={`Beri nilai ${star} bintang`}
                          className="p-1.5 rounded-xl transition-transform hover:scale-110 active:scale-95 cursor-pointer focus:outline-none"
                        >
                          <Star
                            className={`w-8 h-8 transition-colors ${
                              isFilled
                                ? 'text-amber-400 fill-amber-400 drop-shadow-xs'
                                : 'text-slate-300 hover:text-amber-300'
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>

                  {/* Quick Service Tags */}
                  {selectedRating > 0 && (
                    <div className="space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex flex-wrap gap-1.5">
                        {availableRatingTags.map((tag) => {
                          const isSelected = selectedRatingTags.includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleToggleRatingTag(tag)}
                              className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold border transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={ratingComment}
                          onChange={(e) => setRatingComment(e.target.value)}
                          maxLength={200}
                          placeholder="Tulis kesan atau saran singkat (opsional)..."
                          className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleSubmitCustomerRating}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Kirim</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Controls (Hidden on print) */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2.5 no-print shrink-0">
          
          {/* Main Print Actions Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            
            {/* Primary Print Button using window.print() + Thermal CSS (System / USB Driver) */}
            <button
              onClick={handlePrint}
              className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
              title={`Cetak menggunakan driver printer sistem / USB (${paperSize})`}
            >
              <Printer className="w-4 h-4 text-sky-400" />
              <span>Cetak Struk ({paperSize})</span>
            </button>

            {/* Direct Thermal Print (follows configured Printer Mode: USB vs Bluetooth) */}
            {storeSettings.printerConnectionType === 'USB' ? (
              <button
                onClick={handleUsbPrint}
                disabled={isUsbPrinting}
                className="py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-300 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
                title="Koneksikan langsung ke Thermal Printer USB (WebUSB ESC/POS)"
              >
                {isUsbPrinting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Mengirim ke USB...</span>
                  </>
                ) : (
                  <>
                    <Usb className="w-4 h-4 text-white" />
                    <span>Cetak USB Direct ({paperSize})</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleBluetoothPrint}
                disabled={isBluetoothPrinting}
                className="py-3 px-4 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-sky-300 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
                title="Koneksikan langsung ke Thermal Printer Bluetooth (ESC/POS)"
              >
                {isBluetoothPrinting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Mengirim ke BT...</span>
                  </>
                ) : (
                  <>
                    <Bluetooth className="w-4 h-4 text-white" />
                    <span>Cetak Bluetooth (Direct)</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Secondary Actions: RawBT Mobile App & WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={handleRawBtLaunch}
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center justify-center gap-2 border border-slate-200 transition-colors"
              title="Kirim ke aplikasi RawBT Print Service di Android"
            >
              <Smartphone className="w-3.5 h-3.5 text-slate-500" />
              <span>Buka RawBT (Android BT)</span>
            </button>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => sound.playTap()}
              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Kirim Nota ke WhatsApp</span>
            </a>
          </div>

          {/* New Transaction Button */}
          <button
            onClick={() => {
              sound.playTap();
              onNewTransaction();
            }}
            className="w-full py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Selesai & Transaksi Baru</span>
          </button>
        </div>

      </div>
    </div>
  );
};
