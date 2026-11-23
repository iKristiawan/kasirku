import React, { useMemo, useState } from 'react';
import {
  Scale,
  Plus,
  Download,
  FileText,
  FileSpreadsheet,
  PieChart as PieChartIcon,
  TrendingUp,
  Users,
  Edit3,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Columns2,
  Rows3,
  HelpCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  BalanceSheetEntry,
  BalanceSheetSection,
  CashflowRecord,
  Customer,
  Product,
  RestockOrder,
  StoreSettings,
  TaxAdjustment,
  TaxRecord,
  Transaction,
  User,
} from '../types/pos';
import { formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  BALANCE_SHEET_SECTION_LABELS,
  BalanceSheetDonutSlice,
  BalanceSheetLineItem,
  BalanceSheetMonthlyTrendPoint,
  computeBalanceSheet,
  computeBalanceSheetMonthlyTrend,
  exportBalanceSheetCsv,
  exportBalanceSheetExcel,
  exportBalanceSheetPdf,
} from '../utils/balanceSheetUtils';

interface BalanceSheetViewProps {
  transactions: Transaction[];
  products: Product[];
  purchases: RestockOrder[];
  cashflows: CashflowRecord[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  balanceSheetEntries: BalanceSheetEntry[];
  storeSettings: StoreSettings;
  currentUser: User;
  customers?: Customer[];
  onSaveEntry: (entry: BalanceSheetEntry, isEdit?: boolean) => Promise<void> | void;
  onDeleteEntry: (entry: BalanceSheetEntry) => Promise<void> | void;
  onNavigateToFinance?: () => void;
  embedded?: boolean;
}

interface QuickAccountTemplate {
  label: string;
  accountCode: string;
  accountName: string;
  section: BalanceSheetSection;
  isContra: boolean;
  notes: string;
}

const QUICK_ACCOUNT_TEMPLATES: QuickAccountTemplate[] = [
  {
    label: 'Kas / Saldo Awal Bank',
    accountCode: '1115',
    accountName: 'Saldo Awal Rekening / Kas Toko',
    section: 'AKTIVA_LANCAR',
    isContra: false,
    notes: 'Saldo kas/bank awal sebelum transaksi POS tercatat',
  },
  {
    label: 'Peralatan & Rak Toko',
    accountCode: '1210',
    accountName: 'Peralatan Kasir, Rak Display & Chiller',
    section: 'AKTIVA_TETAP',
    isContra: false,
    notes: 'Nilai perolehan inventaris dan perlengkapan operasional toko',
  },
  {
    label: 'Kendaraan Operasional',
    accountCode: '1220',
    accountName: 'Kendaraan Operasional / Kurir Toko',
    section: 'AKTIVA_TETAP',
    isContra: false,
    notes: 'Aset kendaraan niaga / pengiriman toko',
  },
  {
    label: 'Akumulasi Penyusutan (−)',
    accountCode: '1290',
    accountName: 'Akumulasi Penyusutan Aset Tetap',
    section: 'AKTIVA_TETAP',
    isContra: true,
    notes: 'Akun kontra pengurang nilai buku aset tetap',
  },
  {
    label: 'Utang Bank / KUR',
    accountCode: '2210',
    accountName: 'Pinjaman Modal Kerja / KUR Bank',
    section: 'KEWAJIBAN_JANGKA_PANJANG',
    isContra: false,
    notes: 'Sisa pokok pinjaman bank jangka panjang',
  },
  {
    label: 'Modal Disetor Pemilik',
    accountCode: '3100',
    accountName: 'Modal Disetor Awal Pemilik',
    section: 'EKUITAS',
    isContra: false,
    notes: 'Setoran modal pendirian atau saldo awal barang & aset toko',
  },
  {
    label: 'Laba Ditahan Lalu',
    accountCode: '3200',
    accountName: 'Laba Ditahan Periode Sebelumnya',
    section: 'EKUITAS',
    isContra: false,
    notes: 'Akumulasi saldo laba sebelum pembukuan POS berjalan',
  },
  {
    label: 'Prive Pemilik (−)',
    accountCode: '3300',
    accountName: 'Prive / Penarikan Modal Pemilik',
    section: 'EKUITAS',
    isContra: true,
    notes: 'Penarikan dana pribadi pemilik yang mengurangi ekuitas',
  },
];

const getTodayLocalStr = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const BalanceSheetView: React.FC<BalanceSheetViewProps> = ({
  transactions,
  products,
  purchases,
  cashflows,
  taxRecords,
  taxAdjustments,
  balanceSheetEntries,
  storeSettings,
  currentUser,
  customers = [],
  onSaveEntry,
  onDeleteEntry,
  onNavigateToFinance,
  embedded = false,
}) => {
  const todayStr = useMemo(() => getTodayLocalStr(), []);
  const [asOfDate, setAsOfDate] = useState<string>(todayStr);
  const [layoutMode, setLayoutMode] = useState<'SKONTRO' | 'STAFFEL'>('SKONTRO');
  const [trendMonths, setTrendMonths] = useState<6 | 12>(12);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);
  const [showReconcileGuide, setShowReconcileGuide] = useState<boolean>(false);

  // Modal Add/Edit Manual Balance Sheet Entry
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<BalanceSheetEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formState, setFormState] = useState<{
    accountCode: string;
    accountName: string;
    section: BalanceSheetSection;
    amount: string;
    isContra: boolean;
    asOfDate: string;
    notes: string;
    enableDepreciation: boolean;
    usefulLifeMonths: string;
    salvageValue: string;
  }>({
    accountCode: '1210',
    accountName: '',
    section: 'AKTIVA_TETAP',
    amount: '',
    isContra: false,
    asOfDate: todayStr,
    notes: '',
    enableDepreciation: false,
    usefulLifeMonths: '48',
    salvageValue: '0',
  });

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 5500);
  };

  const report = useMemo(
    () =>
      computeBalanceSheet({
        asOfDate,
        transactions,
        products,
        purchases,
        cashflows,
        taxRecords,
        taxAdjustments,
        manualEntries: balanceSheetEntries,
        storeSettings,
        customers,
      }),
    [
      asOfDate,
      transactions,
      products,
      purchases,
      cashflows,
      taxRecords,
      taxAdjustments,
      balanceSheetEntries,
      storeSettings,
      customers,
    ]
  );

  const monthlyTrend = useMemo(
    () =>
      computeBalanceSheetMonthlyTrend({
        endAsOfDate: asOfDate,
        monthsCount: trendMonths,
        transactions,
        products,
        purchases,
        cashflows,
        taxRecords,
        taxAdjustments,
        manualEntries: balanceSheetEntries,
        storeSettings,
        customers,
      }),
    [
      asOfDate,
      trendMonths,
      transactions,
      products,
      purchases,
      cashflows,
      taxRecords,
      taxAdjustments,
      balanceSheetEntries,
      storeSettings,
      customers,
    ]
  );

  const trendGrowth = useMemo(() => {
    if (monthlyTrend.length < 2) {
      return {
        aktivaDelta: 0,
        aktivaPct: null as number | null,
        ekuitasDelta: 0,
        ekuitasPct: null as number | null,
      };
    }
    const first = monthlyTrend[0];
    const last = monthlyTrend[monthlyTrend.length - 1];
    const aktivaDelta = last.totalAktiva - first.totalAktiva;
    const ekuitasDelta = last.totalEkuitas - first.totalEkuitas;
    return {
      aktivaDelta,
      aktivaPct:
        first.totalAktiva > 0
          ? Number(((aktivaDelta / first.totalAktiva) * 100).toFixed(1))
          : null,
      ekuitasDelta,
      ekuitasPct:
        first.totalEkuitas !== 0
          ? Number(((ekuitasDelta / Math.abs(first.totalEkuitas)) * 100).toFixed(1))
          : null,
    };
  }, [monthlyTrend]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filterLines = (items: BalanceSheetLineItem[]) => {
    if (!normalizedQuery) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(normalizedQuery) ||
        i.code.toLowerCase().includes(normalizedQuery) ||
        i.detailNote.toLowerCase().includes(normalizedQuery)
    );
  };

  const positiveAssetSlices = useMemo(
    () => report.assetComposition.filter((s) => s.amount > 0),
    [report.assetComposition]
  );

  const positivePasivaSlices = useMemo(
    () => report.pasivaComposition.filter((s) => s.amount > 0),
    [report.pasivaComposition]
  );

  const openNewEntryModal = (defaultSection: BalanceSheetSection = 'AKTIVA_TETAP') => {
    sound.playTap();
    setEditingEntry(null);
    setFormError(null);
    const defaultCode =
      defaultSection === 'AKTIVA_LANCAR'
        ? '1115'
        : defaultSection === 'AKTIVA_TETAP'
        ? '1210'
        : defaultSection === 'KEWAJIBAN_LANCAR'
        ? '2130'
        : defaultSection === 'KEWAJIBAN_JANGKA_PANJANG'
        ? '2210'
        : '3100';
    setFormState({
      accountCode: defaultCode,
      accountName: '',
      section: defaultSection,
      amount: '',
      isContra: false,
      asOfDate,
      notes: '',
      enableDepreciation: false,
      usefulLifeMonths: '48',
      salvageValue: '0',
    });
    setIsModalOpen(true);
  };

  const openEditEntryModal = (entry: BalanceSheetEntry) => {
    sound.playTap();
    setEditingEntry(entry);
    setFormError(null);
    setFormState({
      accountCode: entry.accountCode,
      accountName: entry.accountName,
      section: entry.section,
      amount: String(entry.amount),
      isContra: Boolean(entry.isContra),
      asOfDate: entry.asOfDate || asOfDate,
      notes: entry.notes || '',
      enableDepreciation:
        entry.depreciationMethod === 'STRAIGHT_LINE' && (entry.usefulLifeMonths || 0) > 0,
      usefulLifeMonths: String(entry.usefulLifeMonths || 48),
      salvageValue: String(entry.salvageValue ?? 0),
    });
    setIsModalOpen(true);
  };

  const openBalancingModalAdjustment = () => {
    sound.playTap();
    setEditingEntry(null);
    setFormError(null);
    const delta = report.balanceDelta;
    // If Aktiva > Pasiva (delta > 0), Ekuitas needs +delta (Modal Awal / Saldo Penyeimbang)
    // If Aktiva < Pasiva (delta < 0), either Prive/Penyesuaian Ekuitas (-) or Kas Awal (+)
    setFormState({
      accountCode: '3100',
      accountName:
        delta >= 0
          ? 'Modal Awal & Nilai Persediaan Pembukaan'
          : 'Penyesuaian Penyeimbang Ekuitas Awal',
      section: 'EKUITAS',
      amount: String(Math.abs(Math.round(delta))),
      isContra: delta < 0,
      asOfDate,
      notes: `Penyeimbang otomatis saldo awal aktiva (stok gudang & aset pembukaan) per ${asOfDate}`,
      enableDepreciation: false,
      usefulLifeMonths: '48',
      salvageValue: '0',
    });
    setIsModalOpen(true);
  };

  const applyTemplate = (tpl: QuickAccountTemplate) => {
    sound.playTap();
    setFormState((prev) => ({
      ...prev,
      accountCode: tpl.accountCode,
      accountName: tpl.accountName,
      section: tpl.section,
      isContra: tpl.isContra,
      notes: prev.notes.trim() ? prev.notes : tpl.notes,
      enableDepreciation: tpl.section === 'AKTIVA_TETAP' && !tpl.isContra,
    }));
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formState.accountCode.trim()) {
      setFormError('Kode akun wajib diisi (misal: 1210 atau 3100).');
      return;
    }
    if (!formState.accountName.trim()) {
      setFormError('Nama akun neraca wajib diisi.');
      return;
    }
    const parsedAmount = Math.round(parseFloat(formState.amount) || 0);
    if (parsedAmount <= 0) {
      setFormError('Nominal akun harus lebih dari Rp 0.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formState.asOfDate)) {
      setFormError('Tanggal efektif akun harus berformat YYYY-MM-DD.');
      return;
    }

    const useDepreciation =
      formState.section === 'AKTIVA_TETAP' &&
      !formState.isContra &&
      formState.enableDepreciation;
    const parsedLife = Math.round(parseFloat(formState.usefulLifeMonths) || 0);
    const parsedSalvage = Math.max(0, Math.round(parseFloat(formState.salvageValue) || 0));

    if (useDepreciation) {
      if (parsedLife < 1 || parsedLife > 1200) {
        setFormError('Umur ekonomis aset harus antara 1 hingga 1200 bulan.');
        return;
      }
      if (parsedSalvage > parsedAmount) {
        setFormError('Nilai residu tidak boleh lebih besar dari harga perolehan aset.');
        return;
      }
    }

    const nowIso = new Date().toISOString();
    const entry: BalanceSheetEntry = {
      id: editingEntry?.id || `bs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      accountCode: formState.accountCode.trim().slice(0, 24),
      accountName: formState.accountName.trim().slice(0, 160),
      section: formState.section,
      amount: parsedAmount,
      isContra: formState.isContra,
      asOfDate: formState.asOfDate,
      depreciationMethod: useDepreciation ? 'STRAIGHT_LINE' : 'NONE',
      ...(useDepreciation
        ? {
            usefulLifeMonths: parsedLife,
            salvageValue: parsedSalvage,
          }
        : {}),
      notes: formState.notes.trim().slice(0, 600),
      createdBy: editingEntry?.createdBy || currentUser.name,
      createdById: editingEntry?.createdById || currentUser.id,
      timestamp: editingEntry?.timestamp || Date.now(),
      createdAt: editingEntry?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    sound.playSuccessChime();
    await onSaveEntry(entry, Boolean(editingEntry));
    setIsModalOpen(false);
    showNotice(
      editingEntry
        ? `Akun neraca "${entry.accountName}" berhasil diperbarui.`
        : `Akun neraca "${entry.accountName}" (${formatRupiah(entry.amount)}) berhasil ditambahkan.`
    );
  };

  const handleDelete = async (entry: BalanceSheetEntry) => {
    sound.playTap();
    await onDeleteEntry(entry);
    showNotice(`Akun neraca "${entry.accountName}" dihapus dari pembukuan.`);
  };

  const handleDownloadCsv = () => {
    sound.playSuccessChime();
    const fileName = exportBalanceSheetCsv(report);
    showNotice(`Neraca Aktiva & Pasiva diekspor ke CSV: ${fileName}`);
  };

  const handleDownloadExcel = () => {
    sound.playSuccessChime();
    const fileName = exportBalanceSheetExcel(report);
    showNotice(`Neraca Aktiva & Pasiva diekspor ke Excel: ${fileName}`);
  };

  const handleDownloadPdf = async () => {
    sound.playSuccessChime();
    const fileName = await exportBalanceSheetPdf(report, storeSettings);
    showNotice(`Laporan Neraca PDF siap diarsipkan: ${fileName}`);
  };

  const formatLineAmount = (item: BalanceSheetLineItem) => {
    if (item.signedAmount < 0) {
      return `(${formatRupiah(Math.abs(item.signedAmount))})`;
    }
    return formatRupiah(item.signedAmount);
  };

  const renderSectionGroup = (
    title: string,
    sectionKey: BalanceSheetSection,
    items: BalanceSheetLineItem[],
    subtotal: number,
    emptyHint: string
  ) => {
    const visibleItems = filterLines(items);
    return (
      <div>
        <div className="px-4 py-2.5 bg-slate-50 border-y border-slate-200 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-800">{title}</span>
          <button
            type="button"
            onClick={() => openNewEntryModal(sectionKey)}
            className="text-xs font-semibold text-sky-700 hover:text-sky-900 inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Akun</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {visibleItems.length === 0 ? (
            <div className="px-4 py-4 flex items-center justify-between gap-3 text-xs text-slate-500">
              <span>{normalizedQuery ? 'Tidak ada akun yang cocok dengan pencarian.' : emptyHint}</span>
              {!normalizedQuery && (
                <button
                  type="button"
                  onClick={() => openNewEntryModal(sectionKey)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  + Input Akun
                </button>
              )}
            </div>
          ) : (
            visibleItems.map((item) => (
              <div
                key={item.id}
                className="px-4 py-2.5 hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-xs font-semibold text-slate-500 tabular-nums shrink-0">
                      {item.code}
                    </span>
                    <span className="text-xs md:text-sm font-semibold text-slate-900">
                      {item.name}
                    </span>
                    {item.isContra && (
                      <span className="text-[11px] font-semibold text-rose-700">
                        · Kontra (−)
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>
                      {item.source === 'OTOMATIS_POS' ? 'Otomatis POS' : 'Akun Manual'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{item.detailNote}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs md:text-sm font-mono font-bold tabular-nums text-right ${
                      item.signedAmount < 0 ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {formatLineAmount(item)}
                  </span>

                  {item.source === 'MANUAL' && item.manualEntry && (
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => openEditEntryModal(item.manualEntry!)}
                        title="Edit akun neraca"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.manualEntry!)}
                        title="Hapus akun neraca"
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2.5 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between gap-2 text-xs font-bold text-slate-800">
          <span>Subtotal {title}</span>
          <span className="font-mono tabular-nums text-slate-900">
            {subtotal < 0 ? `(${formatRupiah(Math.abs(subtotal))})` : formatRupiah(subtotal)}
          </span>
        </div>
      </div>
    );
  };

  const renderCompositionCard = (params: {
    title: string;
    subtitle: string;
    totalLabel: string;
    totalAmount: number;
    slices: BalanceSheetDonutSlice[];
    positiveSlices: BalanceSheetDonutSlice[];
    deficitNote?: string | null;
  }) => {
    const { title, subtitle, totalLabel, totalAmount, slices, positiveSlices, deficitNote } = params;
    return (
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 flex flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-sky-600 shrink-0" />
              <span>{title}</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] font-semibold text-slate-500">{totalLabel}</div>
            <div className="text-sm font-mono font-bold tabular-nums text-slate-900">
              {totalAmount < 0 ? `(${formatRupiah(Math.abs(totalAmount))})` : formatRupiah(totalAmount)}
            </div>
          </div>
        </div>

        {deficitNote && (
          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-medium">
            {deficitNote}
          </div>
        )}

        {positiveSlices.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            Belum ada saldo positif pada kelompok ini untuk ditampilkan pada grafik donat.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
            <div className="sm:col-span-5 relative h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={positiveSlices}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={54}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {positiveSlices.map((slice) => (
                      <Cell key={slice.key} fill={slice.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: unknown, _name: unknown, item: { payload?: BalanceSheetDonutSlice }) => [
                      `${formatRupiah(Number(value || 0))} (${item?.payload?.percent ?? 0}%)`,
                      item?.payload?.label || '',
                    ]}
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #e2e8f0',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {totalLabel}
                </span>
                <span className="text-xs font-mono font-bold tabular-nums text-slate-900 mt-0.5">
                  {totalAmount >= 1_000_000_000
                    ? `Rp ${(totalAmount / 1_000_000_000).toFixed(2)} M`
                    : totalAmount >= 1_000_000
                    ? `Rp ${(totalAmount / 1_000_000).toFixed(1)} Jt`
                    : formatRupiah(Math.max(0, totalAmount))}
                </span>
              </div>
            </div>

            <div className="sm:col-span-7 divide-y divide-slate-100">
              {slices.map((slice) => (
                <div key={slice.key} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                      style={{ backgroundColor: slice.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">{slice.label}</div>
                      <div className="text-[10.5px] text-slate-500 truncate">{slice.description}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold tabular-nums text-slate-900">
                      {slice.percent.toFixed(1)}%
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      {formatRupiah(slice.amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const innerBody = (
    <div className={embedded ? 'space-y-4' : 'max-w-7xl mx-auto space-y-4'}>
      {/* Top Action & Period Bar */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>Laporan Keuangan</span>
            <span aria-hidden="true">/</span>
            <span>Neraca Posisi Keuangan (SAK EMKM)</span>
          </div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 mt-0.5 flex items-center gap-2">
            <Scale className="w-5 h-5 text-sky-600 shrink-0" />
            <span>Neraca Aktiva &amp; Pasiva</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Menggabungkan kas, bank, piutang, persediaan FIFO, utang supplier &amp; utang pajak POS secara otomatis dengan aset tetap dan modal manual.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">Per Tgl:</span>
            <input
              type="date"
              value={asOfDate}
              max={todayStr}
              onChange={(e) => {
                sound.playTap();
                if (e.target.value) setAsOfDate(e.target.value);
              }}
              className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
            />
            {asOfDate !== todayStr && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setAsOfDate(todayStr);
                }}
                className="text-[11px] font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0 cursor-pointer ml-1"
              >
                Hari Ini
              </button>
            )}
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setLayoutMode('SKONTRO');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                layoutMode === 'SKONTRO'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
              <span>Skontro</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setLayoutMode('STAFFEL');
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                layoutMode === 'STAFFEL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Rows3 className="w-3.5 h-3.5" />
              <span>Staffel</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleDownloadCsv}
            title="Ekspor laporan Neraca ke CSV"
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-teal-600" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadExcel}
            title="Ekspor laporan Neraca ke Excel (.xlsx)"
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            title="Cetak & unduh laporan Neraca ke PDF"
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-sky-600" />
            <span>PDF</span>
          </button>

          <button
            type="button"
            onClick={() => openNewEntryModal('AKTIVA_TETAP')}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            <span>Tambah Akun Manual</span>
          </button>
        </div>
      </div>

        {/* Transient Action Notice */}
        {notice && (
          <div className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{notice}</span>
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Balance Verification Strip */}
        <div
          className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
            report.isBalanced
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
              : 'bg-amber-50/90 border-amber-200 text-amber-950'
          }`}
        >
          <div className="flex items-start gap-3">
            {report.isBalanced ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="text-xs">
              <div className="font-bold text-sm">
                {report.isBalanced
                  ? 'Neraca Seimbang — Total Aktiva = Total Pasiva (Selisih Rp 0)'
                  : `Terdapat Selisih Saldo Awal Aktiva vs Pasiva sebesar ${formatRupiah(
                      Math.abs(report.balanceDelta)
                    )}`}
              </div>
              <p className="mt-0.5 opacity-90">
                {report.isBalanced
                  ? 'Persamaan akuntansi terpenuhi per tanggal posisi neraca yang dipilih.'
                  : report.balanceDelta > 0
                  ? 'Umumnya terjadi karena stok barang awal atau aset pembukaan belum dicatat ke akun Modal Disetor Awal / Laba Ditahan di sisi Ekuitas.'
                  : 'Total Kewajiban + Ekuitas melampaui Aktiva tercatat (periksa kembali saldo awal Kas/Bank atau Aset Tetap yang belum diinput).'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {!report.isBalanced && (
              <button
                type="button"
                onClick={openBalancingModalAdjustment}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sesuaikan ke Modal Awal
              </button>
            )}
            {onNavigateToFinance && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onNavigateToFinance();
                }}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                Buka Buku Kas
              </button>
            )}
          </div>
        </div>

        {/* 4-Column Financial Health KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500">Total Aktiva (Harta)</div>
            <div className="text-xl font-bold font-mono tabular-nums text-sky-700 mt-1">
              {formatRupiah(report.totalAktiva)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Lancar {formatRupiah(report.totalAktivaLancar)} · Tetap {formatRupiah(report.totalAktivaTetap)}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500">Total Pasiva (Kewajiban + Ekuitas)</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatRupiah(report.totalPasiva)}
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              Utang {formatRupiah(report.totalKewajiban)} · Ekuitas {formatRupiah(report.totalEkuitas)}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500">Modal Kerja Bersih (Working Capital)</div>
            <div
              className={`text-xl font-bold font-mono tabular-nums mt-1 ${
                report.ratios.workingCapital >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatRupiah(report.ratios.workingCapital)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Aktiva Lancar − Kewajiban Lancar
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500">Rasio Likuiditas &amp; Utang</div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {report.ratios.currentRatio !== null ? `${report.ratios.currentRatio}x` : 'N/A'}
              <span className="text-xs font-normal text-slate-500 ml-1.5">Current Ratio</span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
              DER {report.ratios.debtToEquityRatio !== null ? `${report.ratios.debtToEquityRatio}x` : '0x'} · Debt/Asset {report.ratios.debtToAssetRatioPercent}%
            </div>
          </div>
        </div>

        {/* Search & Reconciliation Toggle Toolbar */}
        <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari kode atau nama akun neraca (Kas, Piutang, Persediaan, Modal...)"
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 font-mono tabular-nums">
              {balanceSheetEntries.length} akun manual tersimpan
            </span>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setShowReconcileGuide((v) => !v);
              }}
              className="inline-flex items-center gap-1.5 text-sky-700 hover:text-sky-900 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showReconcileGuide ? 'Sembunyikan Sumber Angka' : 'Lihat Sumber Angka POS'}</span>
            </button>
          </div>
        </div>

        {/* Optional Transparent POS Source Breakdown */}
        {showReconcileGuide && (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="font-bold text-slate-900 mb-1">Sumber Otomatis Aktiva</div>
              <p className="text-slate-600 leading-relaxed">
                Kas Tunai &amp; Bank dihitung dari penjualan lunas (termasuk pelunasan piutang sesuai metode bayar), catatan Buku Kas (kecuali duplikasi admin Tarik Tunai), dikurangi PO dibayar. Piutang berasal dari nota belum lunas, dan Persediaan dihitung dari stok batch FIFO gudang.
              </p>
            </div>
            <div>
              <div className="font-bold text-slate-900 mb-1">Sumber Otomatis Kewajiban</div>
              <p className="text-slate-600 leading-relaxed">
                Utang Usaha ditarik dari Purchase Order berstatus Selesai dengan metode Hutang yang belum dilunasi. Utang Pajak berasal dari total estimasi kewajiban pajak di modul Pajak dikurangi setoran yang berstatus Sudah Setor.
              </p>
            </div>
            <div>
              <div className="font-bold text-slate-900 mb-1">Sumber Otomatis Ekuitas</div>
              <p className="text-slate-600 leading-relaxed">
                Laba Berjalan POS adalah total Penjualan Bersih (<span className="font-mono">{formatRupiah(report.diagnostics.grossSalesNetReturns)}</span>) − HPP FIFO (<span className="font-mono">{formatRupiah(report.diagnostics.totalFifoCogs)}</span>) + Kas Lain (<span className="font-mono">{formatRupiah(report.diagnostics.operatingIncomeCashflow)}</span>) − Beban Ops (<span className="font-mono">{formatRupiah(report.diagnostics.operatingExpenseCashflow)}</span>) − Pajak (<span className="font-mono">{formatRupiah(report.diagnostics.cumulativeTaxExpense)}</span>).
              </p>
            </div>
          </div>
        )}

        {/* Main Neraca Statement: Skontro (2-Column) or Staffel (Vertical) */}
        <div
          className={
            layoutMode === 'SKONTRO'
              ? 'grid grid-cols-1 xl:grid-cols-2 gap-4 items-start'
              : 'space-y-4'
          }
        >
          {/* LEFT: AKTIVA (ASET) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">AKTIVA (ASET / HARTA)</h3>
                <p className="text-[11px] text-slate-300">Per tanggal {report.asOfDate}</p>
              </div>
              <span className="text-sm font-mono font-bold tabular-nums text-sky-300">
                {formatRupiah(report.totalAktiva)}
              </span>
            </div>

            {renderSectionGroup(
              '1100 · Aktiva Lancar',
              'AKTIVA_LANCAR',
              report.aktivaLancar,
              report.totalAktivaLancar,
              'Belum ada pos Aktiva Lancar.'
            )}

            {renderSectionGroup(
              '1200 · Aktiva Tetap',
              'AKTIVA_TETAP',
              report.aktivaTetap,
              report.totalAktivaTetap,
              'Belum ada Aset Tetap (seperti peralatan kasir, rak toko, chiller, kendaraan).'
            )}

            <div className="px-4 py-3.5 bg-sky-50 border-t border-sky-200 flex items-center justify-between gap-2">
              <span className="text-xs md:text-sm font-bold text-slate-900">
                TOTAL AKTIVA (LANCAR + TETAP)
              </span>
              <span className="text-sm md:text-base font-mono font-bold tabular-nums text-sky-800">
                {formatRupiah(report.totalAktiva)}
              </span>
            </div>
          </div>

          {/* RIGHT: PASIVA (KEWAJIBAN + EKUITAS) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">PASIVA (KEWAJIBAN &amp; EKUITAS)</h3>
                <p className="text-[11px] text-slate-300">Per tanggal {report.asOfDate}</p>
              </div>
              <span className="text-sm font-mono font-bold tabular-nums text-emerald-300">
                {formatRupiah(report.totalPasiva)}
              </span>
            </div>

            {renderSectionGroup(
              '2100 · Kewajiban Lancar',
              'KEWAJIBAN_LANCAR',
              report.kewajibanLancar,
              report.totalKewajibanLancar,
              'Tidak ada Kewajiban Lancar.'
            )}

            {renderSectionGroup(
              '2200 · Kewajiban Jangka Panjang',
              'KEWAJIBAN_JANGKA_PANJANG',
              report.kewajibanJangkaPanjang,
              report.totalKewajibanJangkaPanjang,
              'Belum ada Kewajiban Jangka Panjang (misal pinjaman KUR atau kredit peralatan).'
            )}

            {renderSectionGroup(
              '3000 · Ekuitas & Modal',
              'EKUITAS',
              report.ekuitas,
              report.totalEkuitas,
              'Belum ada akun modal tambahan.'
            )}

            <div className="px-4 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-2">
              <span className="text-xs md:text-sm font-bold text-slate-900">
                TOTAL PASIVA (KEWAJIBAN + EKUITAS)
              </span>
              <span className="text-sm md:text-base font-mono font-bold tabular-nums text-slate-900">
                {formatRupiah(report.totalPasiva)}
              </span>
            </div>
          </div>
        </div>

      {/* Dual Donut Composition Charts: Komposisi Aset & Komposisi Pasiva */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderCompositionCard({
          title: 'Komposisi Aset (Aktiva)',
          subtitle: 'Proporsi Kas & Bank, Piutang, Persediaan Stok, dan Aset Tetap',
          totalLabel: 'Total Aktiva',
          totalAmount: report.totalAktiva,
          slices: report.assetComposition,
          positiveSlices: positiveAssetSlices,
          deficitNote:
            report.diagnostics.cashInHand + report.diagnostics.bankAndNonCash < 0
              ? `Saldo gabungan Kas & Bank tercatat negatif (${formatRupiah(
                  report.diagnostics.cashInHand + report.diagnostics.bankAndNonCash
                )}) sehingga tidak diplot sebagai irisan positif pada diagram.`
              : null,
        })}

        {renderCompositionCard({
          title: 'Komposisi Pasiva (Kewajiban & Ekuitas)',
          subtitle: 'Struktur pendanaan toko: porsi utang jangka pendek/panjang vs modal pemilik',
          totalLabel: 'Total Pasiva',
          totalAmount: report.totalPasiva,
          slices: report.pasivaComposition,
          positiveSlices: positivePasivaSlices,
          deficitNote:
            report.totalEkuitas < 0
              ? `Ekuitas bersih saat ini defisit (${formatRupiah(
                  report.totalEkuitas
                )}) karena rugi/penarikan melampaui modal disetor.`
              : null,
        })}
      </div>

      {/* Monthly Aktiva vs Pasiva Area Chart */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Tren Pertumbuhan Total Aktiva vs Pasiva Bulanan</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau akumulasi harta, kewajiban, dan nilai buku bersih dari bulan ke bulan hingga {report.asOfDate}.
            </p>
          </div>

          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 self-start">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setTrendMonths(6);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                trendMonths === 6
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              6 Bulan
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setTrendMonths(12);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                trendMonths === 12
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              12 Bulan
            </button>
          </div>
        </div>

        {/* Period Growth Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-xl bg-slate-50/50">
          <div className="px-4 py-2.5">
            <div className="text-[11px] font-semibold text-slate-500">
              Pertumbuhan Aktiva ({trendMonths} Bln)
            </div>
            <div
              className={`text-sm font-mono font-bold tabular-nums mt-0.5 ${
                trendGrowth.aktivaDelta >= 0 ? 'text-sky-700' : 'text-rose-700'
              }`}
            >
              {trendGrowth.aktivaDelta >= 0 ? '+' : ''}
              {formatRupiah(trendGrowth.aktivaDelta)}
              {trendGrowth.aktivaPct !== null && (
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  ({trendGrowth.aktivaPct >= 0 ? '+' : ''}
                  {trendGrowth.aktivaPct}%)
                </span>
              )}
            </div>
          </div>

          <div className="px-4 py-2.5">
            <div className="text-[11px] font-semibold text-slate-500">
              Pertumbuhan Ekuitas ({trendMonths} Bln)
            </div>
            <div
              className={`text-sm font-mono font-bold tabular-nums mt-0.5 ${
                trendGrowth.ekuitasDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {trendGrowth.ekuitasDelta >= 0 ? '+' : ''}
              {formatRupiah(trendGrowth.ekuitasDelta)}
              {trendGrowth.ekuitasPct !== null && (
                <span className="text-xs font-normal text-slate-500 ml-1.5">
                  ({trendGrowth.ekuitasPct >= 0 ? '+' : ''}
                  {trendGrowth.ekuitasPct}%)
                </span>
              )}
            </div>
          </div>

          <div className="px-4 py-2.5">
            <div className="text-[11px] font-semibold text-slate-500">
              Penyusutan Garis Lurus Tercatat
            </div>
            <div className="text-sm font-mono font-bold tabular-nums text-slate-900 mt-0.5">
              {formatRupiah(report.diagnostics.totalAutoDepreciation)}
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={monthlyTrend}
              margin={{ top: 10, right: 18, left: 6, bottom: 4 }}
            >
              <defs>
                <linearGradient id="neracaAktivaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0284c7" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="neracaPasivaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  Math.abs(v) >= 1_000_000_000
                    ? `${(v / 1_000_000_000).toFixed(1)}M`
                    : Math.abs(v) >= 1_000_000
                    ? `${(v / 1_000_000).toFixed(0)}Jt`
                    : Math.abs(v) >= 1_000
                    ? `${(v / 1_000).toFixed(0)}rb`
                    : String(v)
                }
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const pt = payload[0]?.payload as BalanceSheetMonthlyTrendPoint | undefined;
                  if (!pt) return null;
                  const diff = pt.totalAktiva - pt.totalPasiva;
                  return (
                    <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-lg text-xs space-y-1 min-w-[210px]">
                      <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                        {pt.label} · Per {pt.asOfDate}
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-sky-700 font-semibold">Total Aktiva</span>
                        <span className="font-mono font-bold tabular-nums text-slate-900">
                          {formatRupiah(pt.totalAktiva)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-emerald-700 font-semibold">Total Pasiva</span>
                        <span className="font-mono font-bold tabular-nums text-slate-900">
                          {formatRupiah(pt.totalPasiva)}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                        <span>Kewajiban / Utang</span>
                        <span className="font-mono tabular-nums">{formatRupiah(pt.totalKewajiban)}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-[11px] text-slate-500">
                        <span>Ekuitas Bersih</span>
                        <span className="font-mono tabular-nums">{formatRupiah(pt.totalEkuitas)}</span>
                      </div>
                      <div className="flex justify-between gap-4 text-[11px] text-slate-500">
                        <span>Selisih Neraca</span>
                        <span className="font-mono tabular-nums">{formatRupiah(Math.abs(diff))}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="totalAktiva"
                name="Total Aktiva"
                stroke="#0284c7"
                strokeWidth={2.5}
                fill="url(#neracaAktivaGrad)"
                dot={{ r: 3, fill: '#0284c7', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Area
                type="monotone"
                dataKey="totalPasiva"
                name="Total Pasiva"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="url(#neracaPasivaGrad)"
                dot={{ r: 2.5, fill: '#10b981', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-sky-600 inline-block" />
              <span className="font-semibold text-slate-700">Total Aktiva (Garis Utuh)</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block" />
              <span className="font-semibold text-slate-700">Total Pasiva (Garis Putus-Putus)</span>
            </span>
          </div>
          <span>Saat Aktiva dan Pasiva berhimpit, neraca dalam posisi seimbang.</span>
        </div>
      </div>

      {/* Receivables Summary Card (Total Piutang, Tagihan Jatuh Tempo, Top 5 Pelanggan) */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Ringkasan Piutang Pelanggan &amp; Modal Tertahan</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Monitoring tagihan belum lunas, nota jatuh tempo per {report.asOfDate}, serta 5 pelanggan dengan piutang tertinggi.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            Akun 1130 · {report.receivablesSummary.receivableToAssetPercent}% dari Total Aktiva
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-xl bg-slate-50/50">
          <div className="px-4 py-3">
            <div className="text-xs font-semibold text-slate-500">Total Piutang Aktif</div>
            <div className="text-lg font-bold font-mono tabular-nums text-indigo-700 mt-0.5">
              {formatRupiah(report.receivablesSummary.totalAmount)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
              {report.receivablesSummary.unpaidInvoiceCount} nota belum lunas
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-xs font-semibold text-slate-500">Jumlah Tagihan Jatuh Tempo</div>
            <div
              className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                report.receivablesSummary.overdueInvoiceCount > 0
                  ? 'text-rose-700'
                  : 'text-emerald-700'
              }`}
            >
              {report.receivablesSummary.overdueInvoiceCount} Tagihan
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
              {report.receivablesSummary.overdueInvoiceCount > 0
                ? `Nominal terlambat: ${formatRupiah(report.receivablesSummary.overdueAmount)}`
                : 'Tidak ada tagihan lewat jatuh tempo'}
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="text-xs font-semibold text-slate-500">Eksposur Modal Tertahan</div>
            <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {report.receivablesSummary.receivableToAssetPercent}%
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Porsi Piutang Usaha terhadap Total Aktiva
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-slate-800 mb-2">
            5 Pelanggan dengan Piutang Tertinggi
          </div>
          {report.receivablesSummary.topCustomers.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              Belum ada piutang usaha aktif pada pelanggan per tanggal {report.asOfDate}.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Nama Pelanggan</th>
                    <th className="py-2.5 px-3">Nota &amp; Jatuh Tempo</th>
                    <th className="py-2.5 px-3 text-right">Porsi Piutang</th>
                    <th className="py-2.5 px-3 text-right">Total Piutang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.receivablesSummary.topCustomers.map((cust, idx) => (
                    <tr key={cust.customerKey} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-500 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">{cust.customerName}</div>
                        {cust.customerWhatsapp && (
                          <div className="text-[11px] font-mono text-slate-500">
                            {cust.customerWhatsapp}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600">
                        <span className="font-mono tabular-nums">{cust.invoiceCount} nota</span>
                        <span aria-hidden="true" className="mx-1.5">·</span>
                        {cust.overdueCount > 0 ? (
                          <span className="font-semibold text-rose-700 font-mono tabular-nums">
                            {cust.overdueCount} jatuh tempo ({formatRupiah(cust.overdueAmount)})
                          </span>
                        ) : cust.nearestDueDate ? (
                          <span className="font-mono text-slate-500">
                            Tempo {cust.nearestDueDate}
                          </span>
                        ) : (
                          <span className="text-slate-500">Belum lewat tempo</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-2 justify-end">
                          <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-indigo-600 rounded-full"
                              style={{ width: `${Math.min(100, cust.sharePercent)}%` }}
                            />
                          </div>
                          <span className="font-mono tabular-nums text-slate-700 font-semibold">
                            {cust.sharePercent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                        {formatRupiah(cust.totalDebt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const modalNode = isModalOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingEntry ? 'Edit Akun Neraca Manual' : 'Tambah Akun Neraca Manual'}
                </h3>
                <p className="text-xs text-slate-500">
                  Untuk Aset Tetap, Penyusutan, Utang Bank, Modal Disetor Awal, atau Prive.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitEntry} className="p-5 space-y-4 text-xs">
              {!editingEntry && (
                <div>
                  <div className="font-semibold text-slate-700 mb-1.5">
                    Pilih Template Akun Cepat:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ACCOUNT_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.accountCode + tpl.label}
                        type="button"
                        onClick={() => applyTemplate(tpl)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-800 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kode Akun</label>
                  <input
                    type="text"
                    value={formState.accountCode}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, accountCode: e.target.value }))
                    }
                    placeholder="Contoh: 1210"
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Kelompok Neraca</label>
                  <select
                    value={formState.section}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        section: e.target.value as BalanceSheetSection,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900"
                  >
                    {Object.entries(BALANCE_SHEET_SECTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Akun</label>
                <input
                  type="text"
                  value={formState.accountName}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, accountName: e.target.value }))
                  }
                  placeholder="Contoh: Rak Display, Chiller & Mesin Kasir"
                  required
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nominal Saldo (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={formState.amount}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, amount: e.target.value }))
                    }
                    placeholder="0"
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Efektif</label>
                  <input
                    type="date"
                    value={formState.asOfDate}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, asOfDate: e.target.value }))
                    }
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formState.isContra}
                  onChange={(e) =>
                    setFormState((prev) => ({
                      ...prev,
                      isContra: e.target.checked,
                      enableDepreciation: e.target.checked ? false : prev.enableDepreciation,
                    }))
                  }
                  className="mt-0.5 rounded border-slate-300 text-sky-600"
                />
                <span>
                  <span className="font-bold text-slate-900 block">
                    Akun Kontra / Pengurang Nilai Kelompok (−)
                  </span>
                  <span className="text-slate-500">
                    Aktifkan untuk Akumulasi Penyusutan Aset Tetap atau Prive (Penarikan Pemilik) agar mengurangi subtotal kelompoknya.
                  </span>
                </span>
              </label>

              {formState.section === 'AKTIVA_TETAP' && !formState.isContra && (
                <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formState.enableDepreciation}
                      onChange={(e) =>
                        setFormState((prev) => ({
                          ...prev,
                          enableDepreciation: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-slate-300 text-amber-600"
                    />
                    <span>
                      <span className="font-bold text-slate-900 block">
                        Hitung Penyusutan Garis Lurus Otomatis
                      </span>
                      <span className="text-slate-600">
                        Akumulasi penyusutan dihitung otomatis dari tanggal perolehan dan langsung mengurangi nilai buku aset di Neraca.
                      </span>
                    </span>
                  </label>

                  {formState.enableDepreciation && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Umur Ekonomis (Bulan)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="1200"
                          value={formState.usefulLifeMonths}
                          onChange={(e) =>
                            setFormState((prev) => ({
                              ...prev,
                              usefulLifeMonths: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold text-slate-700 mb-1">
                          Nilai Residu / Sisa (Rp)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formState.salvageValue}
                          onChange={(e) =>
                            setFormState((prev) => ({
                              ...prev,
                              salvageValue: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Keterangan / Bukti</label>
                <input
                  type="text"
                  value={formState.notes}
                  onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Catatan sumber penilaian, nomor sertifikat aset, atau keterangan modal"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer whitespace-nowrap"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer whitespace-nowrap"
                >
                  {editingEntry ? 'Simpan Perubahan' : 'Simpan Akun Neraca'}
                </button>
              </div>
            </form>
          </div>
        </div>
  ) : null;

  if (embedded) {
    return (
      <>
        {innerBody}
        {modalNode}
      </>
    );
  }

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-100 overflow-y-auto select-none font-sans">
      {innerBody}
      {modalNode}
    </div>
  );
};
