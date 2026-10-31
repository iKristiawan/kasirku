import React, { useState, useEffect } from 'react';
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
  QrCode as QrCodeIcon
} from 'lucide-react';
import { Transaction, StoreSettings } from '../types/pos';
import { formatRupiah, formatDateTime, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';
import { 
  PaperSize, 
  isWebBluetoothSupported, 
  printDirectBluetooth, 
  openRawBtPrint 
} from '../utils/bluetoothPrinter';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  storeSettings: StoreSettings;
  onNewTransaction: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  transaction,
  storeSettings,
  onNewTransaction,
}) => {
  // Thermal paper roll size selection: '58mm' (Mobile Bluetooth) or '80mm' (Desktop)
  const [paperSize, setPaperSize] = useState<PaperSize>('58mm');
  const [isBluetoothPrinting, setIsBluetoothPrinting] = useState<boolean>(false);
  const [bluetoothStatus, setBluetoothStatus] = useState<string | null>(null);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

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

  if (!isOpen || !transaction) return null;

  // 1. Primary Print handler using window.print() + @media print thermal formatting
  const handlePrint = () => {
    sound.playTap();
    // Allow React state to update if needed before opening system print dialog
    setTimeout(() => {
      window.print();
    }, 50);
  };

  // 2. Direct Web Bluetooth Print (ESC/POS binary stream)
  const handleBluetoothPrint = async () => {
    sound.playTap();
    setIsBluetoothPrinting(true);
    setBluetoothError(null);
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
      } else {
        setBluetoothError(err?.message || 'Gagal mencetak via Bluetooth. Pastikan Bluetooth aktif.');
      }
    } finally {
      setIsBluetoothPrinting(false);
    }
  };

  // 3. RawBT / External Bluetooth Print app launch for Android tablet
  const handleRawBtLaunch = () => {
    sound.playTap();
    openRawBtPrint(transaction, storeSettings, paperSize);
  };

  // 4. WhatsApp Receipt generation
  const generateWhatsAppMessage = (): string => {
    const lines = [
      `*NOTA PEMBELIAN - ${storeSettings.storeName}*`,
      `${storeSettings.storeAddress}`,
      `Telp: ${storeSettings.storePhone}`,
      `--------------------------------`,
      `No. Nota : ${transaction.invoiceNumber}`,
      `Waktu    : ${formatDateTime(transaction.timestamp)}`,
      `Kasir    : ${transaction.cashierName}`,
      transaction.customerName ? `Pelanggan: ${transaction.customerName}` : '',
      `--------------------------------`,
    ];

    transaction.items.forEach((item) => {
      lines.push(`${item.productName}`);
      lines.push(`  ${item.quantity} ${item.unitName} x ${formatRupiah(item.unitPrice)} = ${formatRupiah(item.totalAmount)}`);
    });

    lines.push(`--------------------------------`);
    lines.push(`Subtotal     : ${formatRupiah(transaction.subtotal)}`);

    if (transaction.pointsDiscountAmount > 0) {
      lines.push(`Potongan Poin: -${formatRupiah(transaction.pointsDiscountAmount)} (${transaction.pointsUsed} Pts)`);
    }

    if (transaction.discount > 0) {
      lines.push(`Diskon       : -${formatRupiah(transaction.discount)}`);
    }

    lines.push(`*TOTAL AKHIR : ${formatRupiah(transaction.finalAmount)}*`);
    lines.push(`Metode Bayar : ${transaction.paymentMethod.replace('_', ' ')}`);

    if (transaction.paymentMethod === 'CASH') {
      lines.push(`Bayar Tunai  : ${formatRupiah(transaction.cashPaid || transaction.finalAmount)}`);
      lines.push(`Kembalian    : ${formatRupiah(transaction.cashChange || 0)}`);
    } else if (transaction.paymentMethod === 'PIUTANG') {
      lines.push(`Status       : BELUM LUNAS (PIUTANG)`);
      if (transaction.dueDate) {
        lines.push(`Jatuh Tempo  : ${transaction.dueDate}`);
      }
    }

    if (transaction.pointsEarned > 0) {
      lines.push(`Poin Diperoleh: +${transaction.pointsEarned} Poin`);
    }

    lines.push(`--------------------------------`);
    lines.push(`${storeSettings.storeFooterReceipt}`);

    return lines.filter(Boolean).join('\n');
  };

  const handleSendWhatsApp = () => {
    sound.playTap();
    const phone = transaction.customerWhatsapp || '';
    const message = generateWhatsAppMessage();
    const url = formatWhatsAppUrl(phone, message);
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 select-none overflow-y-auto receipt-modal-backdrop">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150 receipt-modal-card">
        
        {/* Top Notification Bar (Hidden on print) */}
        <div className="p-4 bg-emerald-600 text-white flex items-center justify-between no-print">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="w-6 h-6 text-white stroke-[2.5]" />
            <div>
              <h3 className="text-sm font-bold">Transaksi Berhasil</h3>
              <p className="text-[11px] text-emerald-100 font-mono">
                {transaction.invoiceNumber}
              </p>
            </div>
          </div>

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
            <div className="flex-1">
              <span className="font-medium">{bluetoothError}</span>
              <p className="text-[11px] text-amber-700 mt-1">
                Tip: Anda juga dapat menggunakan tombol <strong>Cetak Struk (System Print)</strong> atau <strong>Buka RawBT</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Thermal Receipt Paper View */}
        <div className="p-4 md:p-6 bg-slate-100 flex justify-center overflow-y-auto max-h-[50vh]">
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
                  <span className="font-bold text-slate-900">{transaction.customerName}</span>
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="thermal-dash my-2 border-t border-dashed border-slate-400"></div>

            {/* Product Items List */}
            <div className="space-y-1.5">
              {transaction.items.map((item, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="font-bold text-slate-900 text-[11px]">
                    {item.productName}
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
                <span className="font-bold">{transaction.paymentMethod.replace('_', ' ')}</span>
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
            </div>

            {/* Separator */}
            <div className="thermal-dash my-2 border-t border-dashed border-slate-400"></div>

            {/* Footer Message & Digital QR Code */}
            <div className="text-center text-[10px] text-slate-600 leading-tight pt-1">
              <p>{storeSettings.storeFooterReceipt || 'Terima kasih atas kunjungan Anda'}</p>
              <p className="text-[9.5px] text-slate-400 mt-0.5">Barang yang dibeli tidak dapat ditukar</p>

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

        {/* Action Controls (Hidden on print) */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2.5 no-print">
          
          {/* Main Print Actions Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            
            {/* Primary Print Button using window.print() + Thermal CSS */}
            <button
              onClick={handlePrint}
              className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98"
              title={`Cetak menggunakan driver printer sistem (${paperSize})`}
            >
              <Printer className="w-4 h-4 text-sky-400" />
              <span>Cetak Struk ({paperSize})</span>
            </button>

            {/* Direct Bluetooth Thermal Print (ESC/POS) */}
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

            <button
              onClick={handleSendWhatsApp}
              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Kirim Nota ke WhatsApp</span>
            </button>
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
