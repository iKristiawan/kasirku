import React, { useState } from 'react';
import jsPDF from 'jspdf';
import { 
  Clock, 
  X, 
  Printer, 
  LogOut, 
  Banknote, 
  QrCode, 
  CreditCard, 
  ArrowRightLeft, 
  Calendar,
  CheckCircle,
  FileDown,
  Receipt,
  AlertTriangle,
  Sparkles,
  Calculator
} from 'lucide-react';
import { Transaction, User, StoreSettings } from '../types/pos';
import { formatRupiah, formatDateTime, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';

interface ShiftSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  transactions: Transaction[];
  storeSettings: StoreSettings;
  onEndShift: () => void;
}

export const ShiftSummaryModal: React.FC<ShiftSummaryModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  transactions,
  storeSettings,
  onEndShift,
}) => {
  const [printerPaperSize, setPrinterPaperSize] = useState<'58mm' | '80mm'>('80mm');
  const [openingCashFloat, setOpeningCashFloat] = useState<number>(200000);
  const [countedPhysicalCash, setCountedPhysicalCash] = useState<string>('200000');
  const [autoDownloadPdfOnClose, setAutoDownloadPdfOnClose] = useState<boolean>(true);

  if (!isOpen) return null;

  // Filter transactions for current shift session
  const shiftTx = transactions;

  const cashTotal = shiftTx
    .filter((tx) => tx.paymentMethod === 'CASH')
    .reduce((acc, tx) => acc + tx.finalAmount, 0);

  const qrisTotal = shiftTx
    .filter((tx) => tx.paymentMethod === 'QRIS_BCA')
    .reduce((acc, tx) => acc + tx.finalAmount, 0);

  const edcTotal = shiftTx
    .filter((tx) => tx.paymentMethod === 'EDC_BCA')
    .reduce((acc, tx) => acc + tx.finalAmount, 0);

  const transferTotal = shiftTx
    .filter((tx) => tx.paymentMethod === 'TRANSFER_BCA')
    .reduce((acc, tx) => acc + tx.finalAmount, 0);

  const piutangTotal = shiftTx
    .filter((tx) => tx.paymentMethod === 'PIUTANG')
    .reduce((acc, tx) => acc + tx.finalAmount, 0);

  const grandTotalShift = cashTotal + qrisTotal + edcTotal + transferTotal + piutangTotal;

  // Cash drawer reconciliation
  const expectedCashInDrawer = openingCashFloat + cashTotal;
  const parsedPhysicalCash = parseFloat(countedPhysicalCash) || 0;
  const cashDiscrepancy = parsedPhysicalCash - expectedCashInDrawer;

  // Generate Automated Shift Audit PDF formatted specifically for 58mm / 80mm thermal receipt printer
  const generateShiftAuditPdf = (paperSize: '58mm' | '80mm') => {
    sound.playTap();
    const is58 = paperSize === '58mm';
    const paperWidth = is58 ? 58 : 80;
    const leftMargin = is58 ? 3 : 5;
    const rightMargin = paperWidth - leftMargin;
    const contentWidth = rightMargin - leftMargin;

    // Estimate receipt length dynamically
    const estimatedHeight = is58 ? 230 : 210;

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [paperWidth, estimatedHeight],
    });

    let y = 8;
    const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
    const storeAddress = storeSettings?.storeAddress || '';
    const storePhone = storeSettings?.storePhone || '';
    const dateFormatted = formatDateTime(Date.now());

    // Monospace font for exact thermal receipt alignment
    doc.setFont('courier', 'bold');

    // Store Header (Centered)
    doc.setFontSize(is58 ? 10 : 12);
    doc.setTextColor(0, 0, 0);
    doc.text(storeTitle.toUpperCase(), paperWidth / 2, y, { align: 'center' });
    y += is58 ? 4 : 5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(is58 ? 7 : 8);
    if (storeAddress) {
      const splitAddress = doc.splitTextToSize(storeAddress, contentWidth);
      doc.text(splitAddress, paperWidth / 2, y, { align: 'center' });
      y += splitAddress.length * (is58 ? 3.2 : 3.8);
    }
    if (storePhone) {
      doc.text(`Telp: ${storePhone}`, paperWidth / 2, y, { align: 'center' });
      y += is58 ? 3.5 : 4;
    }

    // Divider Line
    const divider = is58 ? '----------------------------' : '----------------------------------------';
    doc.text(divider, paperWidth / 2, y, { align: 'center' });
    y += is58 ? 3.5 : 4;

    // Report Title
    doc.setFont('courier', 'bold');
    doc.setFontSize(is58 ? 8 : 9.5);
    doc.text('AUDIT PENUTUPAN SHIFT KASIR', paperWidth / 2, y, { align: 'center' });
    y += is58 ? 3.5 : 4;
    doc.setFont('courier', 'normal');
    doc.setFontSize(is58 ? 6.5 : 7.5);
    doc.text(`Format Kertas: ${paperSize} Thermal`, paperWidth / 2, y, { align: 'center' });
    y += is58 ? 4 : 4.5;

    doc.text(divider, paperWidth / 2, y, { align: 'center' });
    y += is58 ? 3.5 : 4.5;

    // Meta Details
    const printRow = (label: string, value: string, isBold = false) => {
      doc.setFont('courier', isBold ? 'bold' : 'normal');
      doc.text(label, leftMargin, y);
      doc.text(value, rightMargin, y, { align: 'right' });
      y += is58 ? 3.5 : 4;
    };

    printRow('Waktu Audit', dateFormatted.slice(0, 16));
    printRow('Kasir / Staff', `${currentUser.name} (${currentUser.role})`);
    printRow('Total Transaksi', `${shiftTx.length} Struk`);

    doc.text(divider, paperWidth / 2, y, { align: 'center' });
    y += is58 ? 3.5 : 4.5;

    // Sales by Payment Method
    doc.setFont('courier', 'bold');
    doc.text('RINCIAN PENERIMAAN SHIFT:', leftMargin, y);
    y += is58 ? 4 : 4.5;

    printRow('1. Tunai (Cash)', formatRupiah(cashTotal));
    printRow('2. QRIS BCA', formatRupiah(qrisTotal));
    printRow('3. Kartu Kredit/EDC', formatRupiah(edcTotal));
    printRow('4. Transfer Bank', formatRupiah(transferTotal));
    printRow('5. Piutang / Kasbon', formatRupiah(piutangTotal));

    doc.text(divider, paperWidth / 2, y, { align: 'center' });
    y += is58 ? 3.5 : 4.5;

    // Grand Total Omzet
    printRow('TOTAL OMZET SHIFT', formatRupiah(grandTotalShift), true);

    doc.text(divider, paperWidth / 2, y, { align: 'center' });
    y += is58 ? 3.5 : 4.5;

    // Cash Reconciliation
    doc.setFont('courier', 'bold');
    doc.text('REKONSILIASI KAS LACI:', leftMargin, y);
    y += is58 ? 4 : 4.5;

    printRow('Modal Awal (Float)', formatRupiah(openingCashFloat));
    printRow('Penerimaan Tunai', formatRupiah(cashTotal));
    printRow('Target Uang di Laci', formatRupiah(expectedCashInDrawer), true);
    printRow('Kas Fisik Aktual', formatRupiah(parsedPhysicalCash), true);

    const selisihLabel = cashDiscrepancy === 0 ? 'SELISIH KAS (PAS)' : cashDiscrepancy > 0 ? 'SELISIH LEBIH' : 'SELISIH KURANG';
    printRow(selisihLabel, (cashDiscrepancy > 0 ? '+' : '') + formatRupiah(cashDiscrepancy), true);

    doc.text(divider, paperWidth / 2, y, { align: 'center' });
    y += is58 ? 5 : 6;

    // Signatures
    doc.setFont('courier', 'normal');
    doc.setFontSize(is58 ? 6.5 : 7.5);
    const colHalf = paperWidth / 2;
    doc.text('Petugas Kasir', leftMargin + (colHalf - leftMargin) / 2, y, { align: 'center' });
    doc.text('Supervisor/Manager', colHalf + (rightMargin - colHalf) / 2, y, { align: 'center' });
    y += is58 ? 14 : 16;

    doc.text(`( ${currentUser.name} )`, leftMargin + (colHalf - leftMargin) / 2, y, { align: 'center' });
    doc.text('( ................. )', colHalf + (rightMargin - colHalf) / 2, y, { align: 'center' });
    y += is58 ? 5 : 6;

    // Footer note
    doc.setFontSize(is58 ? 5.5 : 6.5);
    doc.text('* Dicetak otomatis oleh KasirKu POS *', paperWidth / 2, y, { align: 'center' });

    // Download PDF
    const fileName = `audit-shift-${paperSize}-${currentUser.name.replace(/\s+/g, '_')}-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
  };

  const handleCloseShiftWithAudit = () => {
    sound.playSuccessChime();
    if (autoDownloadPdfOnClose) {
      generateShiftAuditPdf(printerPaperSize);
    }
    onEndShift();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 md:p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-sky-100 text-sky-700">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                <span>Audit Penutupan Shift Kasir</span>
                <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold">
                  Auto-Audit
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Petugas: <b>{currentUser.name}</b> ({currentUser.role}) · {formatDateTime(Date.now()).slice(0, 16)}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="py-3 space-y-3.5 overflow-y-auto flex-1">
          {/* Printer Format Selector (58mm vs 80mm) */}
          <div className="p-3 bg-slate-900 text-white rounded-2xl flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] text-slate-300 font-bold flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-sky-400" />
                <span>Format Printer Thermal Struk:</span>
              </div>
              <div className="text-[10px] text-slate-400">Pilih lebar kertas printer kasir Anda</div>
            </div>

            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
              {(['58mm', '80mm'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setPrinterPaperSize(fmt);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    printerPaperSize === fmt
                      ? 'bg-sky-500 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Grand Total Omzet Card */}
          <div className="p-4 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl flex items-center justify-between shadow-2xs">
            <div>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                Total Omzet Penjualan Shift
              </div>
              <div className="text-2xl font-black font-mono text-sky-400 mt-0.5">
                {formatRupiah(grandTotalShift)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Struk</div>
              <div className="text-xl font-black font-mono text-white">{shiftTx.length} Nota</div>
            </div>
          </div>

          {/* Breakdown per Payment Method (Cash, QRIS, Credit/EDC, Transfer, Piutang) */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
            <div className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1 flex items-center justify-between">
              <span>Rincian Pembayaran Kasir:</span>
              <span className="text-slate-400 font-mono">5 Metode</span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100 shadow-2xs">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <Banknote className="w-4 h-4 text-emerald-600" />
                <span>Total Tunai (Uang Fisik Kasir)</span>
              </span>
              <span className="font-mono font-bold text-emerald-700 text-sm">
                {formatRupiah(cashTotal)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100 shadow-2xs">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <QrCode className="w-4 h-4 text-sky-600" />
                <span>Total QRIS BCA (Rekening)</span>
              </span>
              <span className="font-mono font-bold text-sky-700 text-sm">
                {formatRupiah(qrisTotal)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100 shadow-2xs">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <CreditCard className="w-4 h-4 text-indigo-600" />
                <span>Total Kartu Kredit / Mesin EDC</span>
              </span>
              <span className="font-mono font-bold text-indigo-700 text-sm">
                {formatRupiah(edcTotal)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100 shadow-2xs">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                <span>Total Transfer Bank BCA</span>
              </span>
              <span className="font-mono font-bold text-blue-700 text-sm">
                {formatRupiah(transferTotal)}
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-100 shadow-2xs">
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <Calendar className="w-4 h-4 text-amber-600" />
                <span>Total Piutang / Kasbon</span>
              </span>
              <span className="font-mono font-bold text-amber-700 text-sm">
                {formatRupiah(piutangTotal)}
              </span>
            </div>
          </div>

          {/* Cash Drawer Count & Reconciliation */}
          <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-2.5 text-xs">
            <div className="font-bold text-amber-900 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Calculator className="w-3.5 h-3.5 text-amber-700" />
              <span>Rekonsiliasi Kas Laci (Cash Audit)</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Modal Awal Laci
                </label>
                <input
                  type="number"
                  value={openingCashFloat}
                  onChange={(e) => setOpeningCashFloat(parseFloat(e.target.value) || 0)}
                  className="w-full p-2 bg-white rounded-xl border border-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Hitungan Kas Fisik Akhir
                </label>
                <input
                  type="number"
                  value={countedPhysicalCash}
                  onChange={(e) => setCountedPhysicalCash(e.target.value)}
                  placeholder="Jumlah uang di laci"
                  className="w-full p-2 bg-white rounded-xl border border-amber-300 font-mono font-bold text-xs focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between font-mono">
              <div>
                <span className="text-[10px] text-slate-500 block">Target di Laci (Modal + Tunai)</span>
                <span className="font-bold text-slate-800 text-xs">{formatRupiah(expectedCashInDrawer)}</span>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-500 block">Status Selisih</span>
                <span className={`font-bold text-xs ${
                  cashDiscrepancy === 0 
                    ? 'text-emerald-700' 
                    : cashDiscrepancy > 0 
                    ? 'text-sky-700' 
                    : 'text-rose-600'
                }`}>
                  {cashDiscrepancy === 0 
                    ? 'COCOK / PAS (Rp 0)' 
                    : `${cashDiscrepancy > 0 ? 'LEBIH +' : 'KURANG -'}${formatRupiah(Math.abs(cashDiscrepancy))}`}
                </span>
              </div>
            </div>
          </div>

          {/* Auto Download Checkbox */}
          <label className="flex items-center gap-2 text-xs text-slate-700 font-semibold cursor-pointer select-none px-1">
            <input
              type="checkbox"
              checked={autoDownloadPdfOnClose}
              onChange={(e) => setAutoDownloadPdfOnClose(e.target.checked)}
              className="rounded text-sky-600 focus:ring-sky-500"
            />
            <span>Otomatis unduh PDF audit thermal ({printerPaperSize}) saat menutup shift</span>
          </label>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => generateShiftAuditPdf(printerPaperSize)}
              className="flex-1 sm:flex-none py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
              title={`Unduh Laporan Audit Format Thermal ${printerPaperSize}`}
            >
              <FileDown className="w-3.5 h-3.5 text-sky-400" />
              <span>Unduh PDF Audit ({printerPaperSize})</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playTap();
                window.print();
              }}
              className="py-2 px-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Cetak lewat dialog browser"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cetak Browser</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCloseShiftWithAudit}
            className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Tutup Kasir &amp; Selesaikan Shift</span>
          </button>
        </div>
      </div>
    </div>
  );
};
