import React, { useState } from 'react';
import { 
  CreditCard, 
  Search, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  MessageCircle, 
  Phone, 
  Banknote, 
  ArrowRightLeft, 
  QrCode,
  X
} from 'lucide-react';
import { Transaction, PaymentMethod } from '../types/pos';
import { formatRupiah, formatDateTime, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';

interface PiutangManagementViewProps {
  transactions: Transaction[];
  onSettleDebt: (transactionId: string, paymentMethod: PaymentMethod) => void;
}

export const PiutangManagementView: React.FC<PiutangManagementViewProps> = ({
  transactions,
  onSettleDebt,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNPAID' | 'OVERDUE' | 'PAID'>('UNPAID');
  const [settlingTransaction, setSettlingTransaction] = useState<Transaction | null>(null);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('CASH');

  // Filter only transactions with paymentMethod === 'PIUTANG' or paid piutang
  const piutangTransactions = transactions.filter(
    (tx) => tx.paymentMethod === 'PIUTANG' || tx.settledPaymentMethod
  );

  const todayStr = new Date().toISOString().split('T')[0];

  const filtered = piutangTransactions.filter((tx) => {
    const isUnpaid = tx.paymentStatus === 'BELUM_LUNAS';
    const isOverdue = isUnpaid && tx.dueDate && tx.dueDate < todayStr;
    const isPaid = tx.paymentStatus === 'LUNAS';

    if (statusFilter === 'UNPAID' && !isUnpaid) return false;
    if (statusFilter === 'OVERDUE' && !isOverdue) return false;
    if (statusFilter === 'PAID' && !isPaid) return false;

    const matchSearch =
      (tx.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
      tx.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      (tx.customerWhatsapp || '').includes(search);

    return matchSearch;
  });

  const totalOutstanding = piutangTransactions
    .filter((tx) => tx.paymentStatus === 'BELUM_LUNAS')
    .reduce((acc, tx) => acc + tx.finalAmount, 0);

  const totalOverdue = piutangTransactions
    .filter((tx) => tx.paymentStatus === 'BELUM_LUNAS' && tx.dueDate && tx.dueDate < todayStr)
    .reduce((acc, tx) => acc + tx.finalAmount, 0);

  const handleSendReminderWA = (tx: Transaction) => {
    sound.playTap();
    const dueDateStr = tx.dueDate || 'segera';
    const msg = `Halo Bapak/Ibu ${tx.customerName}, kami dari toko ingin menginformasikan tagihan belanja kasbon/tempo Anda:
- No. Nota: ${tx.invoiceNumber}
- Total Tagihan: ${formatRupiah(tx.finalAmount)}
- Jatuh Tempo: ${dueDateStr}

Mohon dapat melakukan pelunasan melalui transfer BCA atau langsung ke toko kami. Terima kasih atas kerja samanya.`;

    const url = formatWhatsAppUrl(tx.customerWhatsapp || '', msg);
    window.open(url, '_blank');
  };

  const handleConfirmSettlement = () => {
    if (!settlingTransaction) return;
    sound.playSuccessChime();
    onSettleDebt(settlingTransaction.id, settleMethod);
    setSettlingTransaction(null);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-600" />
              <span>Manajemen Piutang & Kasbon Pelanggan</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau tagihan yang belum lunas, kirim pengingat WhatsApp, dan proses pelunasan kasbon.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-200 text-right">
              <div className="text-[10px] text-amber-800 font-bold uppercase">Total Belum Lunas</div>
              <div className="text-base font-black text-amber-700 font-mono">
                {formatRupiah(totalOutstanding)}
              </div>
            </div>

            {totalOverdue > 0 && (
              <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-right">
                <div className="text-[10px] text-rose-800 font-bold uppercase">Jatuh Tempo</div>
                <div className="text-base font-black text-rose-700 font-mono">
                  {formatRupiah(totalOverdue)}
                </div>
              </div>
            )}
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
              placeholder="Cari nama pelanggan, nomor nota, atau WhatsApp..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full md:w-auto shrink-0">
            {[
              { id: 'UNPAID', label: 'Belum Lunas' },
              { id: 'OVERDUE', label: 'Jatuh Tempo' },
              { id: 'PAID', label: 'Sudah Lunas' },
              { id: 'ALL', label: 'Semua Status' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  sound.playTap();
                  setStatusFilter(tab.id as any);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-amber-600 text-white font-bold shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Piutang Table / Cards */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
              <p className="text-sm font-semibold text-slate-700">Tidak ada catatan piutang pada filter ini</p>
              <p className="text-xs text-slate-400 mt-0.5">Semua tagihan terkendali dengan baik.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Nota & Waktu</th>
                    <th className="py-3 px-4">Pelanggan</th>
                    <th className="py-3 px-4">Item Belanja</th>
                    <th className="py-3 px-4">Jatuh Tempo</th>
                    <th className="py-3 px-4">Total Piutang</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((tx) => {
                    const isUnpaid = tx.paymentStatus === 'BELUM_LUNAS';
                    const isOverdue = isUnpaid && tx.dueDate && tx.dueDate < todayStr;

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-900">{tx.invoiceNumber}</div>
                          <div className="text-[11px] text-slate-400">{formatDateTime(tx.timestamp)}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{tx.customerName || 'Umum'}</div>
                          {tx.customerWhatsapp && (
                            <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{tx.customerWhatsapp}</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-slate-600">
                          <span className="truncate max-w-[200px] block">
                            {tx.items.map((i) => `${i.productName} (${i.quantity} ${i.unitName})`).join(', ')}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono">
                          <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-700'}>
                            {tx.dueDate || '-'}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                          {formatRupiah(tx.finalAmount)}
                        </td>

                        <td className="py-3 px-4">
                          {isOverdue ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                              Jatuh Tempo
                            </span>
                          ) : isUnpaid ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                              Belum Lunas
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                              Lunas ({tx.settledPaymentMethod || 'PAID'})
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {isUnpaid && (
                              <>
                                <button
                                  onClick={() => handleSendReminderWA(tx)}
                                  title="Kirim Pesan WhatsApp Pengingat"
                                  className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    sound.playTap();
                                    setSettlingTransaction(tx);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-2xs transition-colors"
                                >
                                  Lunasi
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Settle Debt Modal */}
      {settlingTransaction && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Pelunasan Piutang Kasbon</h3>
                <p className="text-xs text-slate-500">{settlingTransaction.invoiceNumber}</p>
              </div>
              <button
                onClick={() => setSettlingTransaction(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl flex justify-between items-baseline">
                <span className="text-xs text-slate-500">Pelanggan:</span>
                <span className="text-sm font-bold text-slate-800">{settlingTransaction.customerName}</span>
              </div>

              <div className="p-3 bg-sky-50 rounded-2xl flex justify-between items-baseline">
                <span className="text-xs font-bold text-sky-800">Total Pelunasan:</span>
                <span className="text-lg font-black text-sky-700 font-mono">
                  {formatRupiah(settlingTransaction.finalAmount)}
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Pilih Cara Pembayaran Pelunasan
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'CASH', label: 'Tunai', icon: Banknote },
                    { id: 'TRANSFER_BCA', label: 'Transfer BCA', icon: ArrowRightLeft },
                    { id: 'QRIS_BCA', label: 'QRIS BCA', icon: QrCode },
                  ].map((m) => {
                    const Icon = m.icon;
                    const isSel = settleMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setSettleMethod(m.id as PaymentMethod);
                        }}
                        className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                          isSel
                            ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSettlingTransaction(null)}
                className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmSettlement}
                className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20"
              >
                Konfirmasi Lunas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
