import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Receipt, 
  Search, 
  Calendar, 
  Printer, 
  MessageCircle, 
  CreditCard, 
  Sparkles,
  Eye,
  Filter,
  FileDown
} from 'lucide-react';
import { Transaction, StoreSettings } from '../types/pos';
import { formatRupiah, formatDateTime, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';

interface TransactionHistoryViewProps {
  transactions: Transaction[];
  storeSettings?: StoreSettings;
  onViewReceipt: (tx: Transaction) => void;
}

export const TransactionHistoryView: React.FC<TransactionHistoryViewProps> = ({
  transactions,
  storeSettings,
  onViewReceipt,
}) => {
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');

  const filtered = transactions.filter((tx) => {
    const matchMethod = methodFilter === 'ALL' || tx.paymentMethod === methodFilter;
    const matchSearch =
      tx.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      (tx.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
      tx.cashierName.toLowerCase().includes(search.toLowerCase());
    return matchMethod && matchSearch;
  });

  const totalRevenue = transactions.reduce((acc, tx) => acc + tx.finalAmount, 0);
  const totalTxCount = transactions.length;
  const avgBasket = totalTxCount > 0 ? totalRevenue / totalTxCount : 0;
  const totalPointsDistributed = transactions.reduce((acc, tx) => acc + tx.pointsEarned, 0);

  const handleExportPdf = () => {
    sound.playTap();
    const doc = new jsPDF({ orientation: 'landscape' });

    const storeTitle = storeSettings?.storeName || 'KasirKu Tablet POS';
    const storeAddress = storeSettings?.storeAddress || '';
    const storePhone = storeSettings?.storePhone || '';

    // Document Header Banner
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(`LAPORAN TRANSAKSI PENJUALAN - ${storeTitle.toUpperCase()}`, 14, 15);

    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const dateStr = new Date().toLocaleDateString('id-ID', { dateStyle: 'full' });
    const locationStr = [storeAddress, storePhone ? `Telp: ${storePhone}` : ''].filter(Boolean).join(' • ');
    if (locationStr) {
      doc.text(locationStr, 14, 20);
    }

    const filteredRevenue = filtered.reduce((acc, t) => acc + t.finalAmount, 0);
    const filteredDiscounts = filtered.reduce((acc, t) => acc + (t.discount || 0) + (t.membershipDiscountAmount || 0) + (t.pointsDiscountAmount || 0), 0);

    doc.text(
      `Tanggal Cetak: ${dateStr} | Total Filter: ${filtered.length} Transaksi | Total Omzet: ${formatRupiah(filteredRevenue)} | Total Diskon/Poin: ${formatRupiah(filteredDiscounts)} | Metode: ${methodFilter}`,
      14,
      locationStr ? 25 : 21
    );

    // Table mapping
    const tableData = filtered.map((tx, idx) => [
      (idx + 1).toString(),
      tx.invoiceNumber,
      formatDateTime(tx.timestamp),
      tx.cashierName,
      tx.customerName ? `${tx.customerName} (${tx.customerTier || 'REGULER'})` : 'Pelanggan Umum',
      tx.paymentMethod.replace('_', ' '),
      tx.items.length.toString() + ' item',
      formatRupiah(tx.subtotal),
      tx.membershipDiscountAmount ? formatRupiah(tx.membershipDiscountAmount) : '-',
      tx.pointsDiscountAmount ? formatRupiah(tx.pointsDiscountAmount) : '-',
      formatRupiah(tx.finalAmount),
    ]);

    autoTable(doc, {
      startY: 32,
      head: [
        [
          'No',
          'No. Invoice',
          'Waktu Transaksi',
          'Kasir',
          'Pelanggan',
          'Metode',
          'Item',
          'Subtotal',
          'Diskon Member',
          'Poin',
          'Total Akhir',
        ],
      ],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [2, 132, 199],
        textColor: 255,
        fontSize: 8.5,
        fontStyle: 'bold',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 40;
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `* Arsip Digital Laporan Transaksi Keuangan KasirKu Tablet POS.`,
      14,
      finalY + 8
    );

    const filename = `laporan-transaksi-${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
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
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nomor invoice, nama pelanggan, atau nama kasir..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto shrink-0">
            {[
              { id: 'ALL', label: 'Semua Metode' },
              { id: 'CASH', label: 'Cash' },
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

            <button
              onClick={handleExportPdf}
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer ml-1"
              title="Unduh Arsip Laporan Transaksi Digital (.PDF)"
            >
              <FileDown className="w-3.5 h-3.5 text-sky-400" />
              <span>Ekspor PDF</span>
            </button>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">No. Invoice</th>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Kasir</th>
                  <th className="py-3 px-4">Pelanggan</th>
                  <th className="py-3 px-4">Total Item</th>
                  <th className="py-3 px-4">Metode Bayar</th>
                  <th className="py-3 px-4">Total Akhir</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {tx.invoiceNumber}
                    </td>

                    <td className="py-3 px-4 text-slate-500 text-xs">
                      {formatDateTime(tx.timestamp)}
                    </td>

                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {tx.cashierName.split(' ')[0]}
                    </td>

                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800">
                        {tx.customerName || 'Pelanggan Umum'}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono text-slate-600">
                      {tx.items.length} item ({tx.items.reduce((a, b) => a + b.quantity, 0)} unit)
                    </td>

                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 font-mono">
                        {tx.paymentMethod}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-sky-700 tabular-nums">
                      {formatRupiah(tx.finalAmount)}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => {
                          sound.playTap();
                          onViewReceipt(tx);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-700 text-xs font-bold transition-colors inline-flex items-center gap-1 shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Struk</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
