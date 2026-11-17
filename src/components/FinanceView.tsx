import React, { useState, useMemo } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  PlusCircle, 
  MinusCircle, 
  Calendar, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Printer, 
  Edit3, 
  Trash2, 
  X, 
  Check, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight, 
  Tag, 
  Receipt, 
  Clock, 
  User, 
  Wallet,
  AlertCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend as RechartsLegend 
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CashflowRecord, CashflowType, User as PosUser } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime, formatDateOnly } from '../utils/formatters';
import { sound } from '../utils/audio';

interface FinanceViewProps {
  cashflows: CashflowRecord[];
  onAddCashflow: (record: Omit<CashflowRecord, 'id' | 'createdAt'>) => Promise<void> | void;
  onUpdateCashflow: (record: CashflowRecord) => Promise<void> | void;
  onDeleteCashflow: (id: string) => Promise<void> | void;
  currentUser: PosUser;
  storeName?: string;
}

const DEFAULT_EXPENSE_CATEGORIES = [
  'Operasional Toko (Listrik, Air, Wifi)',
  'Gaji & Bonus Karyawan',
  'Sewa Tempat / Gedung',
  'Perlengkapan Toko & ATK',
  'Transportasi & Logistik / BBM',
  'Pemeliharaan & Servis Alat',
  'Pajak, Iuran & Retribusi',
  'Konsumsi Karyawan / Snack',
  'Lain-lain (Pengeluaran)',
];

const DEFAULT_INCOME_CATEGORIES = [
  'Modal / Suntikan Dana Pemilik',
  'Pendapatan Tambahan / Jasa Lain',
  'Komisi / Bonus / Cashback',
  'Bunga Simpanan / Giro Bank',
  'Pengembalian Dana (Refund)',
  'Lain-lain (Pemasukan)',
];

export const FinanceView: React.FC<FinanceViewProps> = ({
  cashflows = [],
  onAddCashflow,
  onUpdateCashflow,
  onDeleteCashflow,
  currentUser,
  storeName = 'KasirKu Tablet POS',
}) => {
  // Modal states
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CashflowRecord | null>(null);

  // Form input states
  const [formData, setFormData] = useState<{
    type: CashflowType;
    category: string;
    amount: string;
    date: string;
    paymentMethod: string;
    description: string;
    referenceNumber: string;
  }>({
    type: 'PENGELUARAN',
    category: DEFAULT_EXPENSE_CATEGORIES[0],
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'CASH',
    description: '',
    referenceNumber: '',
  });

  // Filter states
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'PENGELUARAN' | 'PEMASUKAN'>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL'>('THIS_MONTH');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Open Form for Adding
  const handleOpenAdd = (type: CashflowType = 'PENGELUARAN') => {
    sound.playTap();
    setEditingRecord(null);
    setFormData({
      type,
      category: type === 'PENGELUARAN' ? DEFAULT_EXPENSE_CATEGORIES[0] : DEFAULT_INCOME_CATEGORIES[0],
      amount: '',
      date: new Date().toISOString().slice(0, 10),
      paymentMethod: 'CASH',
      description: '',
      referenceNumber: '',
    });
    setIsFormModalOpen(true);
  };

  // Open Form for Editing
  const handleOpenEdit = (record: CashflowRecord) => {
    sound.playTap();
    setEditingRecord(record);
    setFormData({
      type: record.type,
      category: record.category,
      amount: record.amount.toString(),
      date: record.date,
      paymentMethod: record.paymentMethod,
      description: record.description,
      referenceNumber: record.referenceNumber || '',
    });
    setIsFormModalOpen(true);
  };

  // Submit Form
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(formData.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Masukkan nominal uang yang valid (lebih dari 0).');
      return;
    }
    if (!formData.description.trim()) {
      alert('Mohon masukkan keterangan catatan keuangan.');
      return;
    }

    sound.playTap();

    const timestamp = new Date(formData.date).getTime() || Date.now();

    if (editingRecord) {
      // Update
      const updated: CashflowRecord = {
        ...editingRecord,
        type: formData.type,
        category: formData.category,
        amount: numAmount,
        date: formData.date,
        timestamp,
        paymentMethod: formData.paymentMethod,
        description: formData.description.trim(),
        referenceNumber: formData.referenceNumber.trim() || undefined,
      };
      await onUpdateCashflow(updated);
    } else {
      // Add new
      await onAddCashflow({
        type: formData.type,
        category: formData.category,
        amount: numAmount,
        date: formData.date,
        timestamp,
        paymentMethod: formData.paymentMethod,
        description: formData.description.trim(),
        referenceNumber: formData.referenceNumber.trim() || undefined,
        recordedBy: currentUser.name || 'Admin',
        recordedById: currentUser.id,
      });
    }

    sound.playSuccess();
    setIsFormModalOpen(false);
  };

  // Delete Record
  const handleDelete = async (id: string, description: string) => {
    if (!confirm(`Hapus catatan keuangan "${description}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    sound.playTap();
    await onDeleteCashflow(id);
  };

  // Date boundary filtering
  const filteredCashflows = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayDate = new Date(now.getTime() - 86400000);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const currentMonthPrefix = now.toISOString().slice(0, 7); // YYYY-MM

    return cashflows.filter((item) => {
      // Type Filter
      if (typeFilter !== 'ALL' && item.type !== typeFilter) return false;

      // Period Filter
      if (periodFilter === 'TODAY' && item.date !== todayStr) return false;
      if (periodFilter === 'YESTERDAY' && item.date !== yesterdayStr) return false;
      if (periodFilter === 'THIS_WEEK' && item.date < sevenDaysAgo) return false;
      if (periodFilter === 'THIS_MONTH' && !item.date.startsWith(currentMonthPrefix)) return false;

      // Category Filter
      if (selectedCategoryFilter !== 'ALL' && item.category !== selectedCategoryFilter) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchCat = item.category.toLowerCase().includes(q);
        const matchRef = (item.referenceNumber || '').toLowerCase().includes(q);
        const matchBy = item.recordedBy.toLowerCase().includes(q);
        return matchDesc || matchCat || matchRef || matchBy;
      }

      return true;
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [cashflows, typeFilter, periodFilter, selectedCategoryFilter, searchQuery]);

  // Overall Financial KPIs
  const kpiStats = useMemo(() => {
    const currentMonthPrefix = new Date().toISOString().slice(0, 7);

    let totalIncomesAll = 0;
    let totalExpensesAll = 0;
    let totalIncomesMonth = 0;
    let totalExpensesMonth = 0;

    cashflows.forEach((c) => {
      if (c.type === 'PEMASUKAN') {
        totalIncomesAll += c.amount;
        if (c.date.startsWith(currentMonthPrefix)) totalIncomesMonth += c.amount;
      } else {
        totalExpensesAll += c.amount;
        if (c.date.startsWith(currentMonthPrefix)) totalExpensesMonth += c.amount;
      }
    });

    const netCashAll = totalIncomesAll - totalExpensesAll;
    const netCashMonth = totalIncomesMonth - totalExpensesMonth;

    return {
      totalIncomesAll,
      totalExpensesAll,
      netCashAll,
      totalIncomesMonth,
      totalExpensesMonth,
      netCashMonth,
    };
  }, [cashflows]);

  // Chart data: Last 7 days cash flow comparison
  const chartData = useMemo(() => {
    const daysMap = new Map<string, { date: string; pemasukan: number; pengeluaran: number }>();
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });
      daysMap.set(dateStr, { date: dayLabel, pemasukan: 0, pengeluaran: 0 });
    }

    cashflows.forEach((c) => {
      if (daysMap.has(c.date)) {
        const obj = daysMap.get(c.date)!;
        if (c.type === 'PEMASUKAN') obj.pemasukan += c.amount;
        else obj.pengeluaran += c.amount;
      }
    });

    return Array.from(daysMap.values());
  }, [cashflows]);

  // Export Excel
  const handleExportExcel = () => {
    sound.playTap();
    if (filteredCashflows.length === 0) {
      alert('Tidak ada data keuangan yang cocok dengan filter untuk diekspor.');
      return;
    }

    const exportData = filteredCashflows.map((c, idx) => ({
      'No': idx + 1,
      'Tanggal': c.date,
      'Jenis': c.type === 'PEMASUKAN' ? 'Pemasukan Kas (+)' : 'Pengeluaran Kas (-)',
      'Kategori': c.category,
      'Keterangan': c.description,
      'No. Referensi / Kuitansi': c.referenceNumber || '-',
      'Metode Pembayaran': c.paymentMethod.replace(/_/g, ' '),
      'Dicatat Oleh': c.recordedBy,
      'Nominal (Rp)': c.amount,
      'Arus Kas': c.type === 'PEMASUKAN' ? c.amount : -c.amount,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Catatan Keuangan Kas');
    XLSX.writeFile(wb, `Laporan_Keuangan_KasirKu_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Export PDF / Print
  const handlePrintPdf = () => {
    sound.playTap();
    const doc = new jsPDF({ orientation: 'portrait' });
    const todayStr = new Date().toLocaleDateString('id-ID', { dateStyle: 'full' });

    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(`LAPORAN KAS & KEUANGAN - ${storeName.toUpperCase()}`, 14, 15);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Tanggal Cetak: ${todayStr} | Total Catatan: ${filteredCashflows.length} Transaksi`, 14, 22);

    const tableRows = filteredCashflows.map((c, idx) => [
      (idx + 1).toString(),
      c.date,
      c.type,
      c.category,
      c.description,
      c.paymentMethod.replace(/_/g, ' '),
      c.type === 'PEMASUKAN' ? `+${formatRupiah(c.amount)}` : `-${formatRupiah(c.amount)}`,
    ]);

    autoTable(doc, {
      startY: 28,
      head: [['No', 'Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Metode', 'Nominal']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 2.5 },
    });

    doc.save(`Laporan_Kas_Keuangan_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-100 overflow-y-auto select-none font-sans">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-5">
        
        {/* Top Header Banner */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl text-teal-700 shrink-0">
              <Wallet className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Manajemen Keuangan &amp; Arus Kas</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-100 text-teal-800 font-bold uppercase">
                  Buku Kas
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Catat seluruh arus kas keluar (pengeluaran) dan arus kas masuk (pemasukan) untuk transparansi keuangan toko.
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenAdd('PEMASUKAN')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-emerald-200" />
              <span>+ Catat Pemasukan</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAdd('PENGELUARAN')}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            >
              <MinusCircle className="w-4 h-4 text-rose-200" />
              <span>- Catat Pengeluaran</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
              title="Unduh Buku Kas ke Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Excel</span>
            </button>

            <button
              type="button"
              onClick={handlePrintPdf}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 border border-slate-200 transition-colors cursor-pointer"
              title="Cetak Laporan Kas ke PDF"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span className="hidden sm:inline">Cetak</span>
            </button>
          </div>
        </div>

        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Pemasukan */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider flex items-center justify-between">
              <span>Total Pemasukan</span>
              <ArrowUpRight className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl md:text-2xl font-black text-emerald-700 font-mono mt-1">
              +{formatRupiah(kpiStats.totalIncomesAll)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Bulan ini: +{formatRupiah(kpiStats.totalIncomesMonth)}
            </div>
          </div>

          {/* Total Pengeluaran */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center justify-between">
              <span>Total Pengeluaran</span>
              <ArrowDownRight className="w-4 h-4 text-rose-600" />
            </div>
            <div className="text-xl md:text-2xl font-black text-rose-700 font-mono mt-1">
              -{formatRupiah(kpiStats.totalExpensesAll)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Bulan ini: -{formatRupiah(kpiStats.totalExpensesMonth)}
            </div>
          </div>

          {/* Saldo Kas Bersih */}
          <div className={`p-4 rounded-2xl border shadow-2xs ${
            kpiStats.netCashAll >= 0 ? 'bg-teal-50/70 border-teal-200' : 'bg-amber-50/70 border-amber-200'
          }`}>
            <div className={`text-[11px] font-bold uppercase tracking-wider flex items-center justify-between ${
              kpiStats.netCashAll >= 0 ? 'text-teal-800' : 'text-amber-800'
            }`}>
              <span>Saldo Kas Bersih</span>
              <DollarSign className="w-4 h-4" />
            </div>
            <div className={`text-xl md:text-2xl font-black font-mono mt-1 ${
              kpiStats.netCashAll >= 0 ? 'text-teal-900' : 'text-amber-900'
            }`}>
              {kpiStats.netCashAll >= 0 ? '+' : ''}{formatRupiah(kpiStats.netCashAll)}
            </div>
            <div className={`text-[10px] mt-0.5 font-medium ${
              kpiStats.netCashAll >= 0 ? 'text-teal-700' : 'text-amber-700'
            }`}>
              Akumulasi pemasukan dikurangi pengeluaran
            </div>
          </div>

          {/* Arus Kas Bulan Ini */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Arus Kas Bulan Ini</span>
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
            <div className={`text-xl md:text-2xl font-black font-mono mt-1 ${
              kpiStats.netCashMonth >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              {kpiStats.netCashMonth >= 0 ? '+' : ''}{formatRupiah(kpiStats.netCashMonth)}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Periode {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* 7-Day Cashflow Chart */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs md:text-sm font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal-600" />
              <span>Tren Arus Kas 7 Hari Terakhir</span>
            </h3>
            <span className="text-[11px] text-slate-400">Komparasi Pemasukan vs Pengeluaran</span>
          </div>

          <div className="h-44 md:h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis 
                  tickFormatter={(val) => `Rp ${(val / 1000).toLocaleString('id-ID')}k`} 
                  tick={{ fontSize: 10, fill: '#64748b' }} 
                  axisLine={false} 
                  tickLine={false} 
                />
                <RechartsTooltip 
                  formatter={(val: any) => formatRupiah(Number(val) || 0)} 
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <RechartsLegend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                <Bar dataKey="pemasukan" name="Pemasukan (+)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                <Bar dataKey="pengeluaran" name="Pengeluaran (-)" fill="#f43f5e" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Filter and Control Bar */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
            
            {/* Type Filter Buttons */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl w-full lg:w-auto overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setTypeFilter('ALL');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  typeFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({cashflows.length})
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setTypeFilter('PEMASUKAN');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  typeFilter === 'PEMASUKAN'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-700 hover:text-emerald-900'
                }`}
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>Pemasukan</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setTypeFilter('PENGELUARAN');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  typeFilter === 'PENGELUARAN'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-rose-700 hover:text-rose-900'
                }`}
              >
                <MinusCircle className="w-3.5 h-3.5" />
                <span>Pengeluaran</span>
              </button>
            </div>

            {/* Period Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full lg:w-auto">
              {[
                { id: 'TODAY', label: 'Hari Ini' },
                { id: 'YESTERDAY', label: 'Kemarin' },
                { id: 'THIS_WEEK', label: '7 Hari' },
                { id: 'THIS_MONTH', label: 'Bulan Ini' },
                { id: 'ALL', label: 'Semua Periode' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setPeriodFilter(p.id as any);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    periodFilter === p.id
                      ? 'bg-slate-900 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full lg:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari keterangan, kategori..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/90 text-slate-500 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3.5">Tanggal</th>
                  <th className="py-3 px-3">Jenis</th>
                  <th className="py-3 px-3">Kategori</th>
                  <th className="py-3 px-3">Keterangan &amp; No. Referensi</th>
                  <th className="py-3 px-3">Metode</th>
                  <th className="py-3 px-3">Dicatat Oleh</th>
                  <th className="py-3 px-3 text-right">Nominal (Rp)</th>
                  <th className="py-3 px-3.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCashflows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Wallet className="w-8 h-8 text-slate-300" />
                        <div>Belum ada catatan keuangan yang cocok dengan filter.</div>
                        <div className="flex gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenAdd('PEMASUKAN')}
                            className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100"
                          >
                            + Tambah Pemasukan
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenAdd('PENGELUARAN')}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 font-bold text-xs hover:bg-rose-100"
                          >
                            - Tambah Pengeluaran
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCashflows.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Tanggal */}
                      <td className="py-3 px-3.5 font-mono text-slate-700">
                        {item.date}
                      </td>

                      {/* Jenis */}
                      <td className="py-3 px-3">
                        {item.type === 'PEMASUKAN' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                            Pemasukan
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <ArrowDownRight className="w-3 h-3 text-rose-600" />
                            Pengeluaran
                          </span>
                        )}
                      </td>

                      {/* Kategori */}
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {item.category}
                      </td>

                      {/* Keterangan & Referensi */}
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900">{item.description}</div>
                        {item.referenceNumber && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            Ref: {item.referenceNumber}
                          </div>
                        )}
                      </td>

                      {/* Metode */}
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {item.paymentMethod.replace(/_/g, ' ')}
                      </td>

                      {/* Dicatat Oleh */}
                      <td className="py-3 px-3 text-slate-500">
                        {item.recordedBy}
                      </td>

                      {/* Nominal */}
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {item.type === 'PEMASUKAN' ? (
                          <span className="text-emerald-700">+{formatRupiah(item.amount)}</span>
                        ) : (
                          <span className="text-rose-700">-{formatRupiah(item.amount)}</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3 px-3.5 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Catatan"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item.id, item.description)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Catatan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* =========================================================================
          MODAL: TAMBAH / EDIT CATATAN KEUANGAN
         ========================================================================= */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            
            {/* Modal Header */}
            <div className={`p-4 sm:p-5 text-white flex items-center justify-between ${
              formData.type === 'PEMASUKAN'
                ? 'bg-gradient-to-r from-emerald-800 to-teal-900'
                : 'bg-gradient-to-r from-rose-800 to-slate-900'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  {formData.type === 'PEMASUKAN' ? <PlusCircle className="w-5 h-5" /> : <MinusCircle className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingRecord ? 'Edit Catatan Keuangan' : formData.type === 'PEMASUKAN' ? 'Catat Pemasukan Kas (+)' : 'Catat Pengeluaran Kas (-)'}
                  </h3>
                  <p className="text-xs text-white/80">
                    Masukkan nominal dan rincian transaksi kas.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmitForm} className="p-4 sm:p-6 space-y-4">
              
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Jenis Transaksi
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setFormData({
                        ...formData,
                        type: 'PENGELUARAN',
                        category: DEFAULT_EXPENSE_CATEGORIES[0],
                      });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      formData.type === 'PENGELUARAN'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <MinusCircle className="w-4 h-4" />
                    <span>Pengeluaran Kas (-)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setFormData({
                        ...formData,
                        type: 'PEMASUKAN',
                        category: DEFAULT_INCOME_CATEGORIES[0],
                      });
                    }}
                    className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      formData.type === 'PEMASUKAN'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Pemasukan Kas (+)</span>
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nominal Uang (Rp) *
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    Rp
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                  />
                </div>
                {formData.amount && !isNaN(Number(formData.amount)) && (
                  <div className="text-[11px] font-mono text-slate-500 mt-1">
                    Terbilang: {formatRupiah(Number(formData.amount))}
                  </div>
                )}
              </div>

              {/* Category Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Kategori {formData.type === 'PEMASUKAN' ? 'Pemasukan' : 'Pengeluaran'} *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white cursor-pointer"
                >
                  {(formData.type === 'PEMASUKAN' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Date & Payment Method */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tanggal Transaksi *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Sumber Kas / Bank *
                  </label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white cursor-pointer"
                  >
                    <option value="CASH">Kas Tunai Toko (Cash)</option>
                    <option value="TRANSFER_BCA">Rekening BCA</option>
                    <option value="QRIS">QRIS Toko</option>
                    <option value="LAINNYA">Kas Lainnya</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Keterangan / Catatan *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Bayar tagihan listrik PLN, Beli snack karyawan..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              {/* Reference / Invoice Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Nomor Referensi / Kuitansi (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Misal: KWT-PLN-112026 atau No. Nota Toko ATK"
                  value={formData.referenceNumber}
                  onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white"
                />
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                >
                  Batal
                </button>

                <button
                  type="submit"
                  className={`px-5 py-2 rounded-xl text-white font-bold text-xs shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                    formData.type === 'PEMASUKAN' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>{editingRecord ? 'Perbarui Catatan' : 'Simpan Catatan'}</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
