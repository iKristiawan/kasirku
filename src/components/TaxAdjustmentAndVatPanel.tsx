import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  Edit3,
  FileWarning,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  RestockOrder,
  StoreSettings,
  TaxAdjustment,
  TaxAdjustmentDirection,
  TaxAdjustmentReasonType,
  TaxAdjustmentTargetType,
  TaxConfig,
  TaxRecord,
  Transaction,
  User,
} from '../types/pos';
import { formatDateOnly, formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  buildMonthlyTaxJournal,
  computeAnnualTaxBuckets,
  computeTxTaxableBreakdown,
  MONTH_NAMES_ID,
  SHORT_MONTH_NAMES_ID,
  simulateVatOverpaymentScenarios,
  TAX_ADJUSTMENT_REASON_LABELS,
  TAX_ADJUSTMENT_TARGET_LABELS,
} from '../utils/taxUtils';

interface TaxAdjustmentAndVatPanelProps {
  transactions: Transaction[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  storeSettings: StoreSettings;
  taxConfig: TaxConfig;
  currentUser: User;
  selectedYear: number;
  selectedMonthIndex: number;
  availableYears: number[];
  onChangePeriod: (year: number, monthIndex: number) => void;
  onSaveTaxAdjustment: (
    adjustment: TaxAdjustment,
    isEdit?: boolean,
    auditReason?: string
  ) => Promise<void> | void;
  onDeleteTaxAdjustment: (adjustment: TaxAdjustment, auditReason?: string) => Promise<void> | void;
  onNotice: (message: string) => void;
}

export const TaxAdjustmentAndVatPanel: React.FC<TaxAdjustmentAndVatPanelProps> = ({
  transactions,
  purchases,
  taxRecords,
  taxAdjustments,
  taxConfig,
  currentUser,
  selectedYear,
  selectedMonthIndex,
  availableYears,
  onChangePeriod,
  onSaveTaxAdjustment,
  onDeleteTaxAdjustment,
  onNotice,
}) => {
  const selectedPeriodKey = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}`;
  const selectedPeriodLabel = `${MONTH_NAMES_ID[selectedMonthIndex]} ${selectedYear}`;

  const [subFocus, setSubFocus] = useState<'ADJUSTMENT' | 'VAT_COMPARE'>('ADJUSTMENT');

  // Annual calculations WITH vs WITHOUT adjustments to show direct adjustment delta
  const annualWithAdj = useMemo(
    () =>
      computeAnnualTaxBuckets({
        transactions,
        purchases,
        taxRecords,
        taxConfig,
        year: selectedYear,
        taxAdjustments,
      }),
    [transactions, purchases, taxRecords, taxConfig, selectedYear, taxAdjustments]
  );

  const annualBase = useMemo(
    () =>
      computeAnnualTaxBuckets({
        transactions,
        purchases,
        taxRecords,
        taxConfig,
        year: selectedYear,
        taxAdjustments: [],
      }),
    [transactions, purchases, taxRecords, taxConfig, selectedYear]
  );

  const monthWithAdj = annualWithAdj.buckets[selectedMonthIndex];
  const monthBase = annualBase.buckets[selectedMonthIndex];

  const monthJournal = useMemo(
    () =>
      buildMonthlyTaxJournal({
        transactions,
        purchases,
        taxRecords,
        taxAdjustments,
        taxConfig,
        year: selectedYear,
        monthIndex: selectedMonthIndex,
      }),
    [
      transactions,
      purchases,
      taxRecords,
      taxAdjustments,
      taxConfig,
      selectedYear,
      selectedMonthIndex,
    ]
  );

  const periodAdjustments = useMemo(
    () =>
      taxAdjustments
        .filter((a) => a.periodMonth === selectedPeriodKey)
        .sort((a, b) => b.timestamp - a.timestamp),
    [taxAdjustments, selectedPeriodKey]
  );

  const periodTransactions = useMemo(
    () =>
      transactions
        .filter((tx) => {
          const d = new Date(tx.timestamp);
          return d.getFullYear() === selectedYear && d.getMonth() === selectedMonthIndex;
        })
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 80),
    [transactions, selectedYear, selectedMonthIndex]
  );

  // Adjustment Form State
  const [isAdjFormOpen, setIsAdjFormOpen] = useState<boolean>(false);
  const [editingAdj, setEditingAdj] = useState<TaxAdjustment | null>(null);
  const [adjFormError, setAdjFormError] = useState<string | null>(null);
  const [adjForm, setAdjForm] = useState<{
    periodMonth: string;
    adjustmentDate: string;
    reasonType: TaxAdjustmentReasonType;
    affectedTaxType: TaxAdjustmentTargetType;
    direction: TaxAdjustmentDirection;
    referenceInvoiceNumber: string;
    dppAmountAbs: string;
    taxAmountAbs: string;
    notes: string;
  }>({
    periodMonth: selectedPeriodKey,
    adjustmentDate: new Date().toISOString().slice(0, 10),
    reasonType: 'PEMBATALAN_FAKTUR',
    affectedTaxType: taxConfig.enablePpn ? 'PPN_KELUARAN' : 'PPH_FINAL_UMKM',
    direction: 'DECREASE',
    referenceInvoiceNumber: '',
    dppAmountAbs: '0',
    taxAmountAbs: '0',
    notes: '',
  });

  const openNewAdjustmentForm = () => {
    sound.playTap();
    setEditingAdj(null);
    setAdjFormError(null);
    setAdjForm({
      periodMonth: selectedPeriodKey,
      adjustmentDate: new Date().toISOString().slice(0, 10),
      reasonType: 'PEMBATALAN_FAKTUR',
      affectedTaxType: taxConfig.enablePpn ? 'PPN_KELUARAN' : 'PPH_FINAL_UMKM',
      direction: 'DECREASE',
      referenceInvoiceNumber: '',
      dppAmountAbs: '0',
      taxAmountAbs: '0',
      notes: '',
    });
    setIsAdjFormOpen(true);
  };

  const openEditAdjustmentForm = (adj: TaxAdjustment) => {
    sound.playTap();
    setEditingAdj(adj);
    setAdjFormError(null);
    setAdjForm({
      periodMonth: adj.periodMonth,
      adjustmentDate: adj.adjustmentDate,
      reasonType: adj.reasonType,
      affectedTaxType: adj.affectedTaxType,
      direction: adj.direction,
      referenceInvoiceNumber: adj.referenceInvoiceNumber || '',
      dppAmountAbs: String(Math.abs(adj.dppDelta || 0)),
      taxAmountAbs: String(Math.abs(adj.taxDelta || 0)),
      notes: adj.notes || '',
    });
    setIsAdjFormOpen(true);
  };

  const handleApplyInvoiceToAdjForm = (invoiceNo: string) => {
    setAdjForm((prev) => ({ ...prev, referenceInvoiceNumber: invoiceNo }));
    const matchedTx = transactions.find((t) => (t.invoiceNumber || t.id) === invoiceNo);
    if (!matchedTx) return;
    const bd = computeTxTaxableBreakdown(
      matchedTx,
      taxConfig.excludeCashWithdrawalPrincipal !== false
    );
    const ppnRate = Math.max(0, Number(taxConfig.ppnRatePercent ?? 11));
    const pphRate = Math.max(0, Number(taxConfig.pphFinalRatePercent ?? 0.5));
    const pb1Rate = Math.max(0, Number(taxConfig.pb1RatePercent ?? 10));

    let estDpp = bd.netTaxable;
    let estTax = 0;

    if (adjForm.affectedTaxType === 'PPN_KELUARAN' || adjForm.affectedTaxType === 'PPN_MASUKAN') {
      if ((taxConfig.ppnMode || 'INCLUSIVE') === 'INCLUSIVE') {
        estDpp = Math.round(bd.netTaxable / (1 + ppnRate / 100));
        estTax = Math.max(0, bd.netTaxable - estDpp);
      } else {
        estTax = Math.round(bd.netTaxable * (ppnRate / 100));
      }
    } else if (adjForm.affectedTaxType === 'PPH_FINAL_UMKM') {
      estTax = Math.round(bd.netTaxable * (pphRate / 100));
    } else if (adjForm.affectedTaxType === 'PB1') {
      estTax = Math.round(bd.netTaxable * (pb1Rate / 100));
    } else {
      estDpp = bd.netTaxable;
      estTax = 0;
    }

    setAdjForm((prev) => ({
      ...prev,
      referenceInvoiceNumber: invoiceNo,
      dppAmountAbs: String(estDpp),
      taxAmountAbs: String(estTax),
      notes:
        prev.notes.trim() ||
        `Koreksi atas nota ${invoiceNo} (${matchedTx.customerName || 'Pelanggan Umum'})`,
    }));
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjFormError(null);

    if (!/^\d{4}-\d{2}$/.test(adjForm.periodMonth)) {
      setAdjFormError('Format masa pajak harus YYYY-MM (contoh: 2026-11).');
      return;
    }
    if (!adjForm.notes.trim()) {
      setAdjFormError('Keterangan / dasar koreksi wajib diisi untuk jejak audit pajak.');
      return;
    }

    const rawDpp = Math.max(0, Math.round(parseFloat(adjForm.dppAmountAbs) || 0));
    const rawTax = Math.max(0, Math.round(parseFloat(adjForm.taxAmountAbs) || 0));
    if (rawDpp <= 0 && rawTax <= 0) {
      setAdjFormError('Minimal salah satu antara Nominal Koreksi DPP atau Nominal Koreksi Pajak harus > Rp 0.');
      return;
    }

    const sign = adjForm.direction === 'DECREASE' ? -1 : 1;
    const nowIso = new Date().toISOString();
    const adjustment: TaxAdjustment = {
      id: editingAdj?.id || `adj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      adjustmentNumber:
        editingAdj?.adjustmentNumber ||
        `ADJ-${adjForm.periodMonth.replace('-', '')}-${String(
          periodAdjustments.length + 1
        ).padStart(3, '0')}`,
      periodMonth: adjForm.periodMonth,
      adjustmentDate: adjForm.adjustmentDate || nowIso.slice(0, 10),
      reasonType: adjForm.reasonType,
      affectedTaxType: adjForm.affectedTaxType,
      direction: adjForm.direction,
      referenceInvoiceNumber: adjForm.referenceInvoiceNumber.trim(),
      dppDelta: sign * rawDpp,
      taxDelta: sign * rawTax,
      status: editingAdj?.status || 'ACTIVE',
      notes: adjForm.notes.trim(),
      createdBy: editingAdj?.createdBy || currentUser.name,
      createdById: editingAdj?.createdById || currentUser.id,
      timestamp: editingAdj?.timestamp || Date.now(),
      createdAt: editingAdj?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    sound.playSuccessChime();
    await onSaveTaxAdjustment(adjustment, Boolean(editingAdj), adjustment.notes);
    setIsAdjFormOpen(false);
    onNotice(
      editingAdj
        ? `Adjustment pajak ${adjustment.adjustmentNumber} diperbarui & jurnal pajak otomatis disesuaikan.`
        : `Adjustment pajak ${adjustment.adjustmentNumber} disimpan. Laporan & jurnal pajak masa ${adjustment.periodMonth} telah diperbarui.`
    );
  };

  const handleToggleVoidAdjustment = async (adj: TaxAdjustment) => {
    sound.playTap();
    const nextStatus = adj.status === 'ACTIVE' ? 'VOIDED' : 'ACTIVE';
    const updated: TaxAdjustment = {
      ...adj,
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    await onSaveTaxAdjustment(
      updated,
      true,
      nextStatus === 'VOIDED'
        ? `Membatalkan (VOID) adjustment ${adj.adjustmentNumber}`
        : `Mengaktifkan kembali adjustment ${adj.adjustmentNumber}`
    );
    onNotice(
      nextStatus === 'VOIDED'
        ? `Adjustment ${adj.adjustmentNumber} di-VOID dan dikeluarkan dari perhitungan pajak.`
        : `Adjustment ${adj.adjustmentNumber} diaktifkan kembali.`
    );
  };

  // =============================================================================
  // PPN OVERPAYMENT SIMULATOR STATE ("Dapat Restitusi" vs "Kompensasi")
  // =============================================================================
  const [vatUseActualPeriod, setVatUseActualPeriod] = useState<boolean>(true);
  const [simPpnOutput, setSimPpnOutput] = useState<string>(String(monthWithAdj.ppnOutput));
  const [simPpnInput, setSimPpnInput] = useState<string>(String(monthWithAdj.ppnInputEstimate));
  const [simRefundTrack, setSimRefundTrack] = useState<'REGULER' | 'DIPERCEPAT'>('REGULER');
  const [simNextMonthNetVat, setSimNextMonthNetVat] = useState<string>('12000000');
  const [simCostOfCapital, setSimCostOfCapital] = useState<string>('12');
  const [simAuditCost, setSimAuditCost] = useState<string>('5000000');

  React.useEffect(() => {
    if (vatUseActualPeriod) {
      setSimPpnOutput(String(monthWithAdj.ppnOutput));
      setSimPpnInput(String(monthWithAdj.ppnInputEstimate));
    }
  }, [vatUseActualPeriod, monthWithAdj.ppnOutput, monthWithAdj.ppnInputEstimate]);

  const vatSimulation = useMemo(
    () =>
      simulateVatOverpaymentScenarios({
        ppnOutput: parseFloat(simPpnOutput) || 0,
        ppnInput: parseFloat(simPpnInput) || 0,
        refundTrack: simRefundTrack,
        projectedMonthlyNetVatPayable: parseFloat(simNextMonthNetVat) || 0,
        costOfCapitalAnnualPercent: parseFloat(simCostOfCapital) || 0,
        auditPreparationCost: parseFloat(simAuditCost) || 0,
      }),
    [simPpnOutput, simPpnInput, simRefundTrack, simNextMonthNetVat, simCostOfCapital, simAuditCost]
  );

  const loadSampleOverpaymentScenario = () => {
    sound.playTap();
    setVatUseActualPeriod(false);
    setSimPpnOutput('18500000');
    setSimPpnInput('68500000'); // Lebih Bayar Rp 50.000.000
    setSimNextMonthNetVat('12500000');
    setSimCostOfCapital('12');
    setSimAuditCost('5000000');
  };

  return (
    <div className="space-y-4">
      {/* Top Toolbar: Focus Switcher & Period Selector */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setSubFocus('ADJUSTMENT');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              subFocus === 'ADJUSTMENT'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileWarning className="w-3.5 h-3.5 shrink-0" />
            <span>Adjustment Pajak &amp; Jurnal ({periodAdjustments.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setSubFocus('VAT_COMPARE');
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              subFocus === 'VAT_COMPARE'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scale className="w-3.5 h-3.5 shrink-0" />
            <span>Simulasi PPN: Restitusi vs Kompensasi</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs font-semibold text-slate-600">Masa Pajak:</label>
          <select
            value={selectedMonthIndex}
            onChange={(e) => {
              sound.playTap();
              onChangePeriod(selectedYear, Number(e.target.value));
            }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer"
          >
            {MONTH_NAMES_ID.map((mName, idx) => (
              <option key={mName} value={idx}>
                {mName}
              </option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => {
              sound.playTap();
              onChangePeriod(Number(e.target.value), selectedMonthIndex);
            }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-900 cursor-pointer"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* VIEW A: KELOLA ADJUSTMENT PAJAK & JURNAL PAJAK OTOMATIS               */}
      {/* ===================================================================== */}
      {subFocus === 'ADJUSTMENT' && (
        <div className="space-y-4">
          {/* Live Before -> After Adjustment Impact KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <div className="text-xs font-semibold text-slate-500">
                Omzet / DPP ({SHORT_MONTH_NAMES_ID[selectedMonthIndex]})
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatRupiah(monthWithAdj.taxableTurnover)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Sebelum Adj: {formatRupiah(monthBase.taxableTurnover)}
                {monthWithAdj.dppAdjustmentNet !== 0 && (
                  <span
                    className={`ml-1 font-mono font-bold ${
                      monthWithAdj.dppAdjustmentNet < 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    ({monthWithAdj.dppAdjustmentNet >= 0 ? '+' : ''}
                    {formatRupiah(monthWithAdj.dppAdjustmentNet)})
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <div className="text-xs font-semibold text-slate-500">
                PPh Final Setelah Koreksi
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1">
                {formatRupiah(monthWithAdj.pphFinalDue)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Sebelum Adj: {formatRupiah(monthBase.pphFinalDue)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <div className="text-xs font-semibold text-slate-500">
                {monthWithAdj.ppnOverpaymentAmount > 0
                  ? 'PPN Lebih Bayar (Restitusi/Kompensasi)'
                  : 'PPN Kurang Bayar Setelah Koreksi'}
              </div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-1 ${
                  monthWithAdj.ppnOverpaymentAmount > 0 ? 'text-amber-700' : 'text-sky-700'
                }`}
              >
                {formatRupiah(
                  monthWithAdj.ppnOverpaymentAmount > 0
                    ? monthWithAdj.ppnOverpaymentAmount
                    : monthWithAdj.ppnNetPayable
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                Keluaran {formatRupiah(monthWithAdj.ppnOutput)} − Masukan{' '}
                {formatRupiah(monthWithAdj.ppnInputEstimate)}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200">
              <div className="text-xs font-semibold text-slate-500">
                Total Kewajiban Masa Ini
              </div>
              <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1">
                {formatRupiah(monthWithAdj.totalEstimatedTax)}
              </div>
              <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {formatNumber(monthWithAdj.adjustmentCount)} adjustment aktif ·{' '}
                {monthWithAdj.totalEstimatedTax - monthBase.totalEstimatedTax === 0
                  ? 'Tanpa selisih pajak'
                  : `Selisih ${
                      monthWithAdj.totalEstimatedTax - monthBase.totalEstimatedTax >= 0 ? '+' : ''
                    }${formatRupiah(monthWithAdj.totalEstimatedTax - monthBase.totalEstimatedTax)}`}
              </div>
            </div>
          </div>

          {/* Adjustment CRUD Container */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Kelola Adjustment Pajak &amp; Pembatalan Faktur — {selectedPeriodLabel}
                </h3>
                <p className="text-xs text-slate-500">
                  Setiap adjustment aktif otomatis memperbarui Jurnal Pajak, grafik tren, laporan PDF bulanan, dan ringkasan Excel e-Bupot/DJP.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {monthWithAdj.ppnOverpaymentAmount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setVatUseActualPeriod(true);
                      setSubFocus('VAT_COMPARE');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Simulasikan Lebih Bayar PPN
                  </button>
                )}
                <button
                  type="button"
                  onClick={openNewAdjustmentForm}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  <span>Buat Adjustment Pajak</span>
                </button>
              </div>
            </div>

            {/* Inline Create/Edit Adjustment Form */}
            {isAdjFormOpen && (
              <form
                onSubmit={handleSubmitAdjustment}
                className="p-4 bg-slate-50/80 border-b border-slate-200 space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">
                    {editingAdj
                      ? `Edit Adjustment ${editingAdj.adjustmentNumber}`
                      : 'Input Koreksi / Pembatalan Faktur Pajak'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAdjFormOpen(false)}
                    className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {adjFormError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                    {adjFormError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Masa Pajak</label>
                    <input
                      type="month"
                      value={adjForm.periodMonth}
                      onChange={(e) =>
                        setAdjForm((prev) => ({ ...prev, periodMonth: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tanggal Adjustment
                    </label>
                    <input
                      type="date"
                      value={adjForm.adjustmentDate}
                      onChange={(e) =>
                        setAdjForm((prev) => ({ ...prev, adjustmentDate: e.target.value }))
                      }
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Jenis / Alasan Koreksi
                    </label>
                    <select
                      value={adjForm.reasonType}
                      onChange={(e) =>
                        setAdjForm((prev) => ({
                          ...prev,
                          reasonType: e.target.value as TaxAdjustmentReasonType,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900"
                    >
                      {Object.entries(TAX_ADJUSTMENT_REASON_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Komponen Pajak Terdampak
                    </label>
                    <select
                      value={adjForm.affectedTaxType}
                      onChange={(e) =>
                        setAdjForm((prev) => ({
                          ...prev,
                          affectedTaxType: e.target.value as TaxAdjustmentTargetType,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900"
                    >
                      {Object.entries(TAX_ADJUSTMENT_TARGET_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Arah Koreksi</label>
                    <select
                      value={adjForm.direction}
                      onChange={(e) =>
                        setAdjForm((prev) => ({
                          ...prev,
                          direction: e.target.value as TaxAdjustmentDirection,
                        }))
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900"
                    >
                      <option value="DECREASE">Pengurangan (−) / Pembatalan</option>
                      <option value="INCREASE">Penambahan (+) / Kurang Catat</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Ref. No. Faktur / Invoice POS
                    </label>
                    <input
                      type="text"
                      list="period-tax-invoices"
                      value={adjForm.referenceInvoiceNumber}
                      onChange={(e) => handleApplyInvoiceToAdjForm(e.target.value)}
                      placeholder="Pilih / ketik No. Invoice atau Faktur"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                    />
                    <datalist id="period-tax-invoices">
                      {periodTransactions.map((tx) => {
                        const inv = tx.invoiceNumber || tx.id;
                        return (
                          <option
                            key={tx.id}
                            value={inv}
                          >{`${inv} · ${formatRupiah(tx.finalAmount)} (${tx.customerName || 'Umum'})`}</option>
                        );
                      })}
                    </datalist>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nominal Koreksi DPP / Omzet (Rp)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={adjForm.dppAmountAbs}
                      onChange={(e) =>
                        setAdjForm((prev) => ({ ...prev, dppAmountAbs: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nominal Koreksi Pajak (Rp)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={adjForm.taxAmountAbs}
                      onChange={(e) =>
                        setAdjForm((prev) => ({ ...prev, taxAmountAbs: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                  <div className="flex-1">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Alasan &amp; Catatan Audit Pajak <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={adjForm.notes}
                      onChange={(e) => setAdjForm((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder="Contoh: Pembatalan Faktur Pajak 010.000-26.0000012 karena salah NPWP pembeli"
                      required
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900"
                    />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsAdjFormOpen(false)}
                      className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer whitespace-nowrap"
                    >
                      {editingAdj ? 'Simpan Perubahan' : 'Terapkan Adjustment'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Adjustments Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2.5 px-3 font-semibold">No. Adj &amp; Tanggal</th>
                    <th className="py-2.5 px-3 font-semibold">Alasan &amp; Referensi</th>
                    <th className="py-2.5 px-3 font-semibold">Komponen Pajak</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Delta DPP</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Delta Pajak</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Status</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {periodAdjustments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Belum ada Adjustment Pajak untuk masa <strong>{selectedPeriodLabel}</strong>.
                        Klik <strong>Buat Adjustment Pajak</strong> jika terdapat pembatalan faktur atau koreksi input.
                      </td>
                    </tr>
                  ) : (
                    periodAdjustments.map((adj) => {
                      const isVoid = adj.status === 'VOIDED';
                      return (
                        <tr
                          key={adj.id}
                          className={isVoid ? 'bg-slate-50/70 opacity-65' : 'hover:bg-slate-50/80'}
                        >
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-mono font-bold text-slate-900">
                              {adj.adjustmentNumber}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">
                              {adj.adjustmentDate} · {adj.createdBy}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 min-w-[220px]">
                            <div className="font-semibold text-slate-900">
                              {TAX_ADJUSTMENT_REASON_LABELS[adj.reasonType]}
                            </div>
                            <div className="text-[11px] text-slate-600">
                              {adj.referenceInvoiceNumber && (
                                <span className="font-mono font-semibold text-sky-700 mr-1.5">
                                  [{adj.referenceInvoiceNumber}]
                                </span>
                              )}
                              {adj.notes}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-semibold text-slate-800">
                            {TAX_ADJUSTMENT_TARGET_LABELS[adj.affectedTaxType]}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                            <span
                              className={
                                adj.dppDelta < 0
                                  ? 'text-rose-700'
                                  : adj.dppDelta > 0
                                  ? 'text-emerald-700'
                                  : 'text-slate-400'
                              }
                            >
                              {adj.dppDelta >= 0 ? '+' : '−'}
                              {formatRupiah(Math.abs(adj.dppDelta))}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                            <span
                              className={
                                adj.taxDelta < 0
                                  ? 'text-rose-700'
                                  : adj.taxDelta > 0
                                  ? 'text-emerald-700'
                                  : 'text-slate-400'
                              }
                            >
                              {adj.taxDelta >= 0 ? '+' : '−'}
                              {formatRupiah(Math.abs(adj.taxDelta))}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                isVoid
                                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {isVoid ? 'VOID' : 'AKTIF'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditAdjustmentForm(adj)}
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                                title="Edit Adjustment"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleVoidAdjustment(adj)}
                                className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer whitespace-nowrap"
                                title={isVoid ? 'Aktifkan kembali' : 'Batalkan (Void)'}
                              >
                                {isVoid ? 'Aktifkan' : 'Void'}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteTaxAdjustment(adj)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                                title="Hapus Permanen Adjustment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

          {/* Automatic Tax Journal (Jurnal Pajak Otomatis) */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-sky-600 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Jurnal Pajak Otomatis — {selectedPeriodLabel}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Rekonsiliasi akun akrual pajak POS, pembalikan/penambahan Adjustment Pajak aktif, dan setoran kas negara.
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono tabular-nums text-slate-600">
                {formatNumber(monthJournal.entries.length)} baris jurnal ·{' '}
                {formatNumber(monthJournal.activeAdjustments.length)} koreksi aktif
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2.5 px-3 font-semibold">Tanggal</th>
                    <th className="py-2.5 px-3 font-semibold">Sumber</th>
                    <th className="py-2.5 px-3 font-semibold">Referensi</th>
                    <th className="py-2.5 px-3 font-semibold">Kode &amp; Nama Akun Pajak</th>
                    <th className="py-2.5 px-3 font-semibold">Uraian Jurnal</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Debit (Rp)</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Kredit (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthJournal.entries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Belum ada entri jurnal pajak pada masa <strong>{selectedPeriodLabel}</strong>.
                      </td>
                    </tr>
                  ) : (
                    monthJournal.entries.map((entry) => (
                      <tr
                        key={entry.id}
                        className={
                          entry.source === 'ADJUSTMENT'
                            ? 'bg-amber-50/40 hover:bg-amber-50/70'
                            : 'hover:bg-slate-50/80'
                        }
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                          {entry.date}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              entry.source === 'ADJUSTMENT'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : entry.source === 'SETORAN_KAS'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {entry.source === 'ADJUSTMENT'
                              ? 'ADJUSTMENT'
                              : entry.source === 'SETORAN_KAS'
                              ? 'SETORAN KAS'
                              : 'POS OTOMATIS'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-800 whitespace-nowrap">
                          {entry.reference}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{entry.accountName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            Akun {entry.accountCode}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{entry.description}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {entry.debit > 0 ? formatRupiah(entry.debit) : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {entry.credit > 0 ? formatRupiah(entry.credit) : '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {monthJournal.entries.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                      <td colSpan={5} className="py-2.5 px-3 text-right">
                        Total Mutasi Jurnal Pajak ({selectedPeriodLabel})
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatRupiah(monthJournal.totalDebit)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatRupiah(monthJournal.totalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VIEW B: SIMULASI PPN LEBIH BAYAR (RESTITUSI VS KOMPENSASI)            */}
      {/* ===================================================================== */}
      {subFocus === 'VAT_COMPARE' && (
        <div className="space-y-4">
          {/* Input Parameters Card */}
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <ArrowLeftRight className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>
                    Pembanding Skenario PPN Lebih Bayar: Dapat Restitusi vs Kompensasi ke Masa Pajak Berikutnya
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Bandingkan dampak arus kas, biaya modal kerja, lama pencairan, dan risiko pemeriksaan KPP saat Pajak Masukan melampaui Pajak Keluaran.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setVatUseActualPeriod(true);
                    setSimPpnOutput(String(monthWithAdj.ppnOutput));
                    setSimPpnInput(String(monthWithAdj.ppnInputEstimate));
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                    vatUseActualPeriod
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Data {SHORT_MONTH_NAMES_ID[selectedMonthIndex]} {selectedYear}
                </button>
                <button
                  type="button"
                  onClick={loadSampleOverpaymentScenario}
                  className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-800 text-xs font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Simulasi Lebih Bayar Rp 50 Jt</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  PPN Keluaran (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={simPpnOutput}
                  onChange={(e) => {
                    setVatUseActualPeriod(false);
                    setSimPpnOutput(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  PPN Masukan (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={simPpnInput}
                  onChange={(e) => {
                    setVatUseActualPeriod(false);
                    setSimPpnInput(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Jalur Restitusi
                </label>
                <select
                  value={simRefundTrack}
                  onChange={(e) =>
                    setSimRefundTrack(e.target.value as 'REGULER' | 'DIPERCEPAT')
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                >
                  <option value="REGULER">Reguler (12 Bln · Ps. 17B)</option>
                  <option value="DIPERCEPAT">Dipercepat (2 Bln · Ps. 9(4c))</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Est. PPN Kurang Bayar/Bln
                </label>
                <input
                  type="number"
                  min="0"
                  value={simNextMonthNetVat}
                  onChange={(e) => setSimNextMonthNetVat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Biaya Modal (% / Thn)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={simCostOfCapital}
                  onChange={(e) => setSimCostOfCapital(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Biaya Persiapan Audit (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={simAuditCost}
                  onChange={(e) => setSimAuditCost(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>
            </div>

            {/* Strategic Verdict Banner */}
            <div
              className={`p-3.5 rounded-xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                vatSimulation.overpaymentAmount === 0
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : vatSimulation.recommendedStrategy === 'KOMPENSASI'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-sky-50 border-sky-200 text-sky-950'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {vatSimulation.overpaymentAmount === 0 ? (
                  <AlertTriangle className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                ) : (
                  <CheckCircle2
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      vatSimulation.recommendedStrategy === 'KOMPENSASI'
                        ? 'text-emerald-600'
                        : 'text-sky-600'
                    }`}
                  />
                )}
                <div className="space-y-0.5">
                  <div className="font-bold text-sm">
                    {vatSimulation.overpaymentAmount === 0
                      ? 'Status Masa Ini: Tidak Ada PPN Lebih Bayar (Keluaran ≥ Masukan)'
                      : vatSimulation.recommendedStrategy === 'KOMPENSASI'
                      ? 'Rekomendasi Sistem: Pilih Kompensasi ke Masa Pajak Berikutnya'
                      : 'Rekomendasi Sistem: Ajukan Dapat Restitusi (Pengembalian Tunai)'}
                  </div>
                  <p className="leading-relaxed">
                    {vatSimulation.overpaymentAmount === 0
                      ? `Saat ini PPN Masukan tidak melebihi PPN Keluaran. Ubah nominal PPN Masukan > PPN Keluaran atau klik tombol "Simulasi Lebih Bayar Rp 50 Jt" untuk membandingkan kedua skenario.`
                      : vatSimulation.recommendationReason}
                  </p>
                </div>
              </div>
              {vatSimulation.overpaymentAmount > 0 && (
                <div className="shrink-0 text-left md:text-right">
                  <div className="text-[11px] font-semibold opacity-80">
                    Saldo PPN Lebih Bayar
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums">
                    {formatRupiah(vatSimulation.overpaymentAmount)}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums font-semibold">
                    Keunggulan Bersih: +{formatRupiah(vatSimulation.netAdvantageRupiah)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Side-by-Side Scenario Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Skenario A: Dapat Restitusi */}
            <div
              className={`bg-white p-4 md:p-5 rounded-2xl border space-y-3 ${
                vatSimulation.recommendedStrategy === 'RESTITUSI'
                  ? 'border-sky-300'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-sky-700">
                    Skenario A
                  </span>
                  <h4 className="text-base font-bold text-slate-900">
                    Dapat Restitusi (Pengembalian Tunai ke Rekening)
                  </h4>
                </div>
                {vatSimulation.recommendedStrategy === 'RESTITUSI' && (
                  <span className="px-2.5 py-1 rounded-lg bg-sky-600 text-white text-[11px] font-bold whitespace-nowrap shrink-0">
                    Direkomendasikan
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Nilai Ekonomi Bersih</div>
                  <div className="text-base font-bold font-mono tabular-nums text-sky-700 mt-0.5">
                    {formatRupiah(vatSimulation.refund.netEconomicValue)}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    Recovery {vatSimulation.refund.effectiveRecoveryPercent}% dari pokok
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Estimasi Waktu Cair</div>
                  <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    ±{vatSimulation.refund.monthsToCash} Bulan
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {vatSimulation.refundTrack === 'REGULER'
                      ? 'Pemeriksaan Ps. 17B'
                      : 'Pendahuluan Ps. 9(4c)'}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs border-t border-slate-100 pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Pokok Lebih Bayar Dimohonkan</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatRupiah(vatSimulation.refund.grossRefund)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-rose-700">
                  <span>Dikurangi: Biaya Persiapan &amp; Audit</span>
                  <span className="font-mono tabular-nums font-semibold">
                    −{formatRupiah(vatSimulation.refund.auditCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-amber-700">
                  <span>Dikurangi: Opportunity Cost Modal Tertahan</span>
                  <span className="font-mono tabular-nums font-semibold">
                    −{formatRupiah(vatSimulation.refund.financingOpportunityCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                  <span className="font-semibold text-slate-700">Profil Risiko Pemeriksaan</span>
                  <span className="font-semibold text-slate-900">
                    {vatSimulation.refund.riskLevel}
                  </span>
                </div>
              </div>

              <ul className="space-y-1 text-[11px] text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200/80 list-disc pl-6">
                {vatSimulation.refund.complianceNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>

            {/* Skenario B: Kompensasi */}
            <div
              className={`bg-white p-4 md:p-5 rounded-2xl border space-y-3 ${
                vatSimulation.recommendedStrategy === 'KOMPENSASI'
                  ? 'border-emerald-300'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                    Skenario B
                  </span>
                  <h4 className="text-base font-bold text-slate-900">
                    Kompensasi ke Masa Pajak Berikutnya (Carry-Forward)
                  </h4>
                </div>
                {vatSimulation.recommendedStrategy === 'KOMPENSASI' && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold whitespace-nowrap shrink-0">
                    Direkomendasikan
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Nilai Ekonomi Bersih</div>
                  <div className="text-base font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                    {formatRupiah(vatSimulation.compensation.netEconomicValue)}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    Recovery {vatSimulation.compensation.effectiveRecoveryPercent}% dari pokok
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Lama Kredit Terserap Habis</div>
                  <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {vatSimulation.compensation.monthsToAbsorb === null
                      ? 'Belum Terserap'
                      : `${vatSimulation.compensation.monthsToAbsorb} Bulan`}
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    Hemat Bln +1: {formatRupiah(vatSimulation.compensation.cashSavingsMonth1)}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 text-xs border-t border-slate-100 pt-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Terserap dalam 6 Masa Pajak Berikutnya</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-700">
                    {formatRupiah(vatSimulation.compensation.absorbedIn6Months)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Sisa Saldo Kredit Setelah 6 Bulan</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatRupiah(vatSimulation.compensation.carriedBalanceAfter6Months)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-amber-700">
                  <span>Dikurangi: Opportunity Cost Selama Serapan</span>
                  <span className="font-mono tabular-nums font-semibold">
                    −{formatRupiah(vatSimulation.compensation.financingOpportunityCost)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                  <span className="font-semibold text-slate-700">Risiko Pemeriksaan Saat Lapor</span>
                  <span className="font-semibold text-emerald-700">
                    MINIMAL (Administratif SPT Masa)
                  </span>
                </div>
              </div>

              <ul className="space-y-1 text-[11px] text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-200/80 list-disc pl-6">
                {vatSimulation.compensation.complianceNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* 6-Month Cumulative Cash Impact Chart & Schedule */}
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Simulasi Dampak Arus Kas Kumulatif (6 Masa Pajak ke Depan)
              </h4>
              <p className="text-xs text-slate-500">
                Membandingkan kas masuk bersih dari Restitusi Tunai vs penghematan setoran PPN bulanan lewat Kompensasi Kredit Pajak.
              </p>
            </div>

            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={vatSimulation.schedule6Months}
                  margin={{ top: 8, right: 16, left: 6, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}jt` : `${(v / 1000).toFixed(0)}rb`
                    }
                  />
                  <RechartsTooltip
                    formatter={(value: any, name: any) => [formatRupiah(Number(value) || 0), name]}
                  />
                  <RechartsLegend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    dataKey="compensationCumulativeCashSaved"
                    name="Kompensasi: Akumulasi Hemat Kas PPN"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="refundCumulativeCash"
                    name="Restitusi: Kas Bersih Diterima"
                    fill="#0284c7"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <th className="py-2 px-3 font-semibold">Periode</th>
                    <th className="py-2 px-3 font-semibold text-right">Saldo Awal Kredit</th>
                    <th className="py-2 px-3 font-semibold text-right">PPN Kurang Bayar</th>
                    <th className="py-2 px-3 font-semibold text-right">Kredit Terserap</th>
                    <th className="py-2 px-3 font-semibold text-right">Kas PPN Disetor</th>
                    <th className="py-2 px-3 font-semibold text-right">Sisa Saldo Kredit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vatSimulation.schedule6Months.map((row) => (
                    <tr key={row.monthNumber} className="hover:bg-slate-50/70">
                      <td className="py-2 px-3 font-semibold text-slate-900">{row.monthLabel}</td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatRupiah(row.openingCredit)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatRupiah(row.monthlyPayableBeforeCredit)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {formatRupiah(row.creditAbsorbed)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-900">
                        {formatRupiah(row.vatCashPaid)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-sky-700 font-semibold">
                        {formatRupiah(row.endingCredit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
