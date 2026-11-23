import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calculator,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  History,
  Landmark,
  Percent,
  Plus,
  Printer,
  Receipt,
  Save,
  Scale,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CashflowRecord,
  Product,
  RestockOrder,
  StoreSettings,
  TaxAdjustment,
  TaxAuditCategory,
  TaxAuditChangeItem,
  TaxAuditLog,
  TaxCalculationMode,
  TaxConfig,
  TaxRecord,
  TaxRecordStatus,
  TaxRecordType,
  TaxRegimeType,
  Transaction,
  User,
} from '../types/pos';
import { formatDateOnly, formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  calculatePphBadan31E,
  computeAnnualStoreBookkeepingMetrics,
  computeAnnualTaxBuckets,
  computeTxTaxableBreakdown,
  exportMonthlyTaxSummaryExcel,
  getEffectiveTaxConfig,
  MONTH_NAMES_ID,
  REGIME_LABELS,
  SHORT_MONTH_NAMES_ID,
  TAX_TYPE_LABELS,
  TaxDueAlertItem,
} from '../utils/taxUtils';
import { exportMonthlyTaxPdfReport } from '../utils/taxPdfExport';
import { TaxDueAlertBanner } from './TaxDueAlertBanner';
import { CorporateTax31EPanel } from './CorporateTax31EPanel';
import { TaxAdjustmentAndVatPanel } from './TaxAdjustmentAndVatPanel';
import { TaxAuditLogPanel } from './TaxAuditLogPanel';

interface TaxManagementViewProps {
  transactions: Transaction[];
  products?: Product[];
  purchases: RestockOrder[];
  cashflows: CashflowRecord[];
  taxRecords: TaxRecord[];
  taxAuditLogs?: TaxAuditLog[];
  taxAdjustments?: TaxAdjustment[];
  storeSettings: StoreSettings;
  currentUser: User;
  onUpdateTaxConfig: (nextConfig: TaxConfig, auditReason?: string) => Promise<void> | void;
  onSaveTaxRecord: (record: TaxRecord, alsoRecordCashflow: boolean) => Promise<void> | void;
  onDeleteTaxRecord: (id: string) => Promise<void> | void;
  onRecordTaxAuditLog?: (entry: {
    category: TaxAuditCategory;
    actionLabel: string;
    summary: string;
    changes?: TaxAuditChangeItem[];
    reason?: string;
    periodMonth?: string;
  }) => Promise<void> | void;
  onSaveTaxAdjustment?: (
    adjustment: TaxAdjustment,
    isEdit?: boolean,
    auditReason?: string
  ) => Promise<void> | void;
  onDeleteTaxAdjustment?: (adjustment: TaxAdjustment, auditReason?: string) => Promise<void> | void;
  onNavigateToPOS?: () => void;
}

type TaxSubTab =
  | 'CALCULATION'
  | 'PPH_BADAN_31E'
  | 'ADJUSTMENT_VAT'
  | 'RECORDS'
  | 'AUDIT_LOG'
  | 'SETTINGS';

export const TaxManagementView: React.FC<TaxManagementViewProps> = ({
  transactions,
  products = [],
  purchases,
  cashflows,
  taxRecords,
  taxAuditLogs = [],
  taxAdjustments = [],
  storeSettings,
  currentUser,
  onUpdateTaxConfig,
  onSaveTaxRecord,
  onDeleteTaxRecord,
  onRecordTaxAuditLog,
  onSaveTaxAdjustment,
  onDeleteTaxAdjustment,
  onNavigateToPOS,
}) => {
  const canAccess = currentUser.role === 'ADMIN' || currentUser.role === 'STORE_MANAGER';
  const now = new Date();
  const [activeSubTab, setActiveSubTab] = useState<TaxSubTab>('CALCULATION');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<number>(now.getMonth()); // 0..11

  const taxConfig = useMemo(() => getEffectiveTaxConfig(storeSettings), [storeSettings]);

  // Settings draft form state
  const [configDraft, setConfigDraft] = useState<TaxConfig>(taxConfig);
  const [configAuditReason, setConfigAuditReason] = useState<string>('');
  const [configSavedNotice, setConfigSavedNotice] = useState<string | null>(null);
  const [csvExportNotice, setCsvExportNotice] = useState<string | null>(null);
  const [burdenChartMode, setBurdenChartMode] = useState<'COMPARISON' | 'PROPORTION'>('COMPARISON');
  const [ppnTrendMetric, setPpnTrendMetric] = useState<'NET' | 'OUTPUT'>('NET');
  const [applyPasal31EOption, setApplyPasal31EOption] = useState<boolean>(
    taxConfig.applyPasal31EFacility !== false
  );
  const [corporateProjectionMode, setCorporateProjectionMode] = useState<'AUTO_POS' | 'PROJECTED_12M'>(
    'PROJECTED_12M'
  );

  React.useEffect(() => {
    setConfigDraft(taxConfig);
    setApplyPasal31EOption(taxConfig.applyPasal31EFacility !== false);
  }, [taxConfig]);

  // Interactive Quick Tax Simulator state
  const [simType, setSimType] = useState<'PPH_FINAL' | 'PPN' | 'PB1' | 'CUSTOM'>('PPH_FINAL');
  const [simAmountInput, setSimAmountInput] = useState<string>('25000000');
  const [simRateInput, setSimRateInput] = useState<string>('0.5');
  const [simMode, setSimMode] = useState<TaxCalculationMode>('EXCLUSIVE');
  const [simOverrideReason, setSimOverrideReason] = useState<string>('');

  // Records filters & modal state
  const [recordStatusFilter, setRecordStatusFilter] = useState<'ALL' | TaxRecordStatus>('ALL');
  const [recordTypeFilter, setRecordTypeFilter] = useState<'ALL' | TaxRecordType>('ALL');
  const [recordSearch, setRecordSearch] = useState<string>('');
  const [isRecordModalOpen, setIsRecordModalOpen] = useState<boolean>(false);
  const [editingRecord, setEditingRecord] = useState<TaxRecord | null>(null);
  const [alsoRecordCashflow, setAlsoRecordCashflow] = useState<boolean>(true);
  const [recordForm, setRecordForm] = useState<{
    periodMonth: string;
    taxType: TaxRecordType;
    taxTypeLabel: string;
    taxBaseAmount: string;
    taxRatePercent: string;
    taxAmountDue: string;
    paidAmount: string;
    status: TaxRecordStatus;
    billingCode: string;
    ntpnCode: string;
    paidDate: string;
    paymentMethod: string;
    notes: string;
  }>({
    periodMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    taxType: 'PPH_FINAL_UMKM',
    taxTypeLabel: TAX_TYPE_LABELS.PPH_FINAL_UMKM,
    taxBaseAmount: '0',
    taxRatePercent: '0.5',
    taxAmountDue: '0',
    paidAmount: '0',
    status: 'SUDAH_SETOR',
    billingCode: '',
    ntpnCode: '',
    paidDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'TRANSFER_BCA',
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Access guard
  if (!canAccess) {
    return (
      <div className="flex-1 p-4 md:p-8 bg-slate-100 overflow-y-auto flex items-center justify-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Akses Terbatas</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Menu <strong>Pajak</strong> hanya dapat diakses oleh <strong>Admin</strong> atau{' '}
            <strong>Store Manager</strong>.
          </p>
          {onNavigateToPOS && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToPOS();
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kembali ke Kasir
            </button>
          )}
        </div>
      </div>
    );
  }

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>([now.getFullYear(), now.getFullYear() - 1]);
    transactions.forEach((tx) => {
      const y = new Date(tx.timestamp).getFullYear();
      if (!isNaN(y)) yearsSet.add(y);
    });
    taxRecords.forEach((rec) => {
      const y = Number(rec.periodMonth.slice(0, 4));
      if (!isNaN(y) && y > 2000) yearsSet.add(y);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [transactions, taxRecords, now]);

  const selectedPeriodKey = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}`;
  const selectedPeriodLabel = `${MONTH_NAMES_ID[selectedMonthIndex]} ${selectedYear}`;

  // Monthly tax breakdown across all 12 months of selectedYear (including active TaxAdjustments)
  const annualAnalysis = useMemo(
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

  const currentMonthStats = annualAnalysis.buckets[selectedMonthIndex];
  const remainingMonthLiability = Math.max(
    0,
    currentMonthStats.totalEstimatedTax - currentMonthStats.recordedPaidTax
  );

  // Quick annual projection & actual calculation for Corporate Income Tax (PPh Badan 25/29 & Pasal 31E)
  const annualCorporateProjection = useMemo(() => {
    const metrics = computeAnnualStoreBookkeepingMetrics({
      transactions,
      products,
      cashflows,
      taxRecords,
      year: selectedYear,
      excludeWithdrawalPrincipal: taxConfig.excludeCashWithdrawalPrincipal !== false,
    });
    const scale =
      corporateProjectionMode === 'PROJECTED_12M' && metrics.txCount > 0
        ? 12 / metrics.activeMonthsCount
        : 1;
    const projected = calculatePphBadan31E({
      grossTurnover: Math.round(metrics.annualTurnover * scale),
      cogsAmount: Math.round(metrics.annualCogsFifo * scale),
      operatingExpenses: Math.round(metrics.operatingExpensesDeductible * scale),
      otherBusinessIncome: Math.round(metrics.otherBusinessIncome * scale),
      fiscalAdjustmentNet: Number(taxConfig.pphBadanFiscalAdjustment ?? 0),
      lossCompensation: Math.max(0, Number(taxConfig.pphBadanLossCompensation ?? 0)),
      generalRatePercent: Number(taxConfig.pphBadanRatePercent ?? 22),
      applyPasal31EFacility: applyPasal31EOption,
      taxCreditsPaid: metrics.recordedPphBadanCredits,
      pphFinalRatePercent: Number(taxConfig.pphFinalRatePercent ?? 0.5),
    });
    return { metrics, projected };
  }, [
    transactions,
    products,
    cashflows,
    taxRecords,
    selectedYear,
    taxConfig,
    applyPasal31EOption,
    corporateProjectionMode,
  ]);

  // Simulator calculation
  const simResult = useMemo(() => {
    const rawNominal = Math.max(0, parseFloat(simAmountInput) || 0);
    const rate = Math.max(0, parseFloat(simRateInput) || 0);
    let dpp = rawNominal;
    let taxAmount = 0;
    let totalAfterTax = rawNominal;

    if (simMode === 'INCLUSIVE' && rate > 0) {
      dpp = Math.round(rawNominal / (1 + rate / 100));
      taxAmount = Math.max(0, rawNominal - dpp);
      totalAfterTax = rawNominal;
    } else {
      dpp = rawNominal;
      taxAmount = Math.round(rawNominal * (rate / 100));
      totalAfterTax = rawNominal + taxAmount;
    }

    return {
      rawNominal,
      rate,
      dpp,
      taxAmount,
      totalAfterTax,
      netAfterDirectTax: Math.max(0, rawNominal - taxAmount),
    };
  }, [simAmountInput, simRateInput, simMode]);

  const handleSelectSimPreset = (preset: 'PPH_FINAL' | 'PPN' | 'PB1' | 'CUSTOM') => {
    sound.playTap();
    setSimType(preset);
    if (preset === 'PPH_FINAL') {
      setSimRateInput(String(taxConfig.pphFinalRatePercent ?? 0.5));
      setSimMode('EXCLUSIVE');
    } else if (preset === 'PPN') {
      setSimRateInput(String(taxConfig.ppnRatePercent ?? 11));
      setSimMode(taxConfig.ppnMode || 'INCLUSIVE');
    } else if (preset === 'PB1') {
      setSimRateInput(String(taxConfig.pb1RatePercent ?? 10));
      setSimMode('EXCLUSIVE');
    }
  };

  // Filtered tax records
  const filteredTaxRecords = useMemo(() => {
    const q = recordSearch.trim().toLowerCase();
    return taxRecords
      .filter((r) => {
        if (recordStatusFilter !== 'ALL' && r.status !== recordStatusFilter) return false;
        if (recordTypeFilter !== 'ALL' && r.taxType !== recordTypeFilter) return false;
        if (!q) return true;
        return (
          r.periodMonth.toLowerCase().includes(q) ||
          r.taxTypeLabel.toLowerCase().includes(q) ||
          (r.billingCode || '').toLowerCase().includes(q) ||
          (r.ntpnCode || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth) || b.timestamp - a.timestamp);
  }, [taxRecords, recordStatusFilter, recordTypeFilter, recordSearch]);

  // Existing FinanceView tax cashflows for cross-reference
  const taxCashflows = useMemo(() => {
    return cashflows
      .filter(
        (c) =>
          c.type === 'PENGELUARAN' &&
          /pajak|ppn|pph|retribusi|npwp/i.test(`${c.category} ${c.description}`)
      )
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [cashflows]);

  const openCreateRecordModal = (prefill?: {
    periodMonth?: string;
    taxType?: TaxRecordType;
    taxBaseAmount?: number;
    taxRatePercent?: number;
    taxAmountDue?: number;
    notes?: string;
  }) => {
    sound.playTap();
    setFormError(null);
    setEditingRecord(null);
    const tType = prefill?.taxType || 'PPH_FINAL_UMKM';
    const rate =
      prefill?.taxRatePercent !== undefined
        ? prefill.taxRatePercent
        : tType === 'PPH_FINAL_UMKM'
        ? Number(taxConfig.pphFinalRatePercent ?? 0.5)
        : tType === 'PPH_BADAN'
        ? Number(taxConfig.pphBadanRatePercent ?? 22)
        : tType === 'PPN'
        ? Number(taxConfig.ppnRatePercent ?? 11)
        : tType === 'PB1'
        ? Number(taxConfig.pb1RatePercent ?? 10)
        : 0;
    const due = prefill?.taxAmountDue ?? 0;

    setRecordForm({
      periodMonth: prefill?.periodMonth || selectedPeriodKey,
      taxType: tType,
      taxTypeLabel: TAX_TYPE_LABELS[tType],
      taxBaseAmount: String(prefill?.taxBaseAmount ?? currentMonthStats.taxableTurnover),
      taxRatePercent: String(rate),
      taxAmountDue: String(due),
      paidAmount: String(due),
      status: 'SUDAH_SETOR',
      billingCode: '',
      ntpnCode: '',
      paidDate: new Date().toISOString().slice(0, 10),
      paymentMethod: 'TRANSFER_BCA',
      notes: prefill?.notes || '',
    });
    setAlsoRecordCashflow(true);
    setIsRecordModalOpen(true);
  };

  const openEditRecordModal = (rec: TaxRecord) => {
    sound.playTap();
    setFormError(null);
    setEditingRecord(rec);
    setRecordForm({
      periodMonth: rec.periodMonth,
      taxType: rec.taxType,
      taxTypeLabel: rec.taxTypeLabel,
      taxBaseAmount: String(rec.taxBaseAmount),
      taxRatePercent: String(rec.taxRatePercent),
      taxAmountDue: String(rec.taxAmountDue),
      paidAmount: String(rec.paidAmount),
      status: rec.status,
      billingCode: rec.billingCode || '',
      ntpnCode: rec.ntpnCode || '',
      paidDate: rec.paidDate || new Date().toISOString().slice(0, 10),
      paymentMethod: rec.paymentMethod || 'TRANSFER_BCA',
      notes: rec.notes || '',
    });
    setAlsoRecordCashflow(!rec.linkedCashflowId);
    setIsRecordModalOpen(true);
  };

  const handleSaveRecordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!/^\d{4}-\d{2}$/.test(recordForm.periodMonth)) {
      setFormError('Format Masa Pajak harus YYYY-MM (contoh: 2026-11).');
      return;
    }

    const base = Math.max(0, parseFloat(recordForm.taxBaseAmount) || 0);
    const rate = Math.max(0, parseFloat(recordForm.taxRatePercent) || 0);
    const due = Math.max(0, parseFloat(recordForm.taxAmountDue) || 0);
    const paid =
      recordForm.status === 'SUDAH_SETOR'
        ? Math.max(0, parseFloat(recordForm.paidAmount) || 0)
        : 0;

    if (due <= 0 && paid <= 0) {
      setFormError('Nominal pajak terutang atau dibayar harus lebih dari Rp 0.');
      return;
    }

    const nowIso = new Date().toISOString();
    const record: TaxRecord = {
      id: editingRecord?.id || `tax_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      periodMonth: recordForm.periodMonth,
      taxType: recordForm.taxType,
      taxTypeLabel: (recordForm.taxTypeLabel || TAX_TYPE_LABELS[recordForm.taxType]).trim(),
      taxBaseAmount: Math.round(base),
      taxRatePercent: rate,
      taxAmountDue: Math.round(due),
      paidAmount: Math.round(paid),
      status: recordForm.status,
      billingCode: recordForm.billingCode.trim(),
      ntpnCode: recordForm.ntpnCode.trim(),
      paidDate: recordForm.status === 'SUDAH_SETOR' ? recordForm.paidDate : '',
      paymentMethod: recordForm.paymentMethod,
      notes: recordForm.notes.trim(),
      linkedCashflowId: editingRecord?.linkedCashflowId,
      recordedBy: currentUser.name,
      timestamp: editingRecord?.timestamp || Date.now(),
      createdAt: editingRecord?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await onSaveTaxRecord(
      record,
      Boolean(alsoRecordCashflow && record.status === 'SUDAH_SETOR' && !record.linkedCashflowId)
    );
    setIsRecordModalOpen(false);
  };

  const handleSaveTaxConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playTap();
    const normalized: TaxConfig = {
      ...configDraft,
      pphFinalRatePercent: Math.max(0, Math.min(100, Number(configDraft.pphFinalRatePercent ?? 0.5))),
      pphBadanRatePercent: Math.max(0, Math.min(100, Number(configDraft.pphBadanRatePercent ?? 22))),
      ppnRatePercent: Math.max(0, Math.min(100, Number(configDraft.ppnRatePercent ?? 11))),
      pb1RatePercent: Math.max(0, Math.min(100, Number(configDraft.pb1RatePercent ?? 10))),
      monthlyDueDay: Math.max(1, Math.min(28, Number(configDraft.monthlyDueDay ?? 15))),
      dueReminderDaysBefore: Math.max(
        1,
        Math.min(20, Number(configDraft.dueReminderDaysBefore ?? 7))
      ),
    };
    const trimmedReason = configAuditReason.trim();
    await onUpdateTaxConfig(normalized, trimmedReason || undefined);
    setConfigAuditReason('');
    setConfigSavedNotice(
      'Pengaturan tarif & profil pajak berhasil disimpan, disinkronkan, dan dicatat ke Log Audit Pajak.'
    );
    window.setTimeout(() => setConfigSavedNotice(null), 4000);
  };

  const handleDownloadTaxSummaryExcel = () => {
    sound.playTap();
    const result = exportMonthlyTaxSummaryExcel({
      transactions,
      purchases,
      taxRecords,
      storeSettings,
      taxConfig,
      year: selectedYear,
      monthIndex: selectedMonthIndex,
      taxAdjustments,
    });
    setCsvExportNotice(
      `File Excel "${result.filename}" (${result.txCount} transaksi masa ${result.periodLabel}) berhasil diunduh untuk input manual e-Bupot / DJP Online.`
    );
    window.setTimeout(() => setCsvExportNotice(null), 5000);
  };

  const handleExportMonthlyPdfReport = () => {
    sound.playTap();
    const result = exportMonthlyTaxPdfReport({
      transactions,
      purchases,
      taxRecords,
      storeSettings,
      taxConfig,
      year: selectedYear,
      monthIndex: selectedMonthIndex,
      preparedBy: currentUser.name,
      taxAdjustments,
    });
    setCsvExportNotice(
      `Laporan PDF bulanan "${result.filename}" (Masa ${result.periodLabel}) siap cetak/arsip berhasil diunduh.`
    );
    window.setTimeout(() => setCsvExportNotice(null), 5000);
  };

  const handleAlertRecordPayment = (alert: TaxDueAlertItem) => {
    const rate =
      alert.primaryTaxType === 'PPN'
        ? Number(taxConfig.ppnRatePercent ?? 11)
        : alert.primaryTaxType === 'PB1'
        ? Number(taxConfig.pb1RatePercent ?? 10)
        : Number(taxConfig.pphFinalRatePercent ?? 0.5);

    openCreateRecordModal({
      periodMonth: alert.periodKey,
      taxType: alert.primaryTaxType,
      taxBaseAmount: alert.taxableTurnover,
      taxRatePercent: rate,
      taxAmountDue: alert.remainingDue,
      notes: `Setoran Pajak Masa ${alert.periodLabel} (Jatuh tempo ${alert.dueDateDisplay})`,
    });
  };

  const handleExportAnnualCsv = () => {
    sound.playTap();
    const headers = [
      'Masa Pajak',
      'Jumlah Transaksi',
      'Penjualan Bruto POS',
      'Retur Penjualan',
      'Pokok Tarik Tunai Dikecualikan',
      'Omzet Kena Pajak (DPP)',
      'Estimasi PPh Final UMKM',
      'Estimasi PPN Kurang Bayar',
      'Estimasi PB1',
      'Total Estimasi Pajak',
      'Sudah Disetor',
      'Sisa Kewajiban',
    ];
    const escapeCsv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = annualAnalysis.buckets.map((b) => [
      `${b.monthName} ${selectedYear}`,
      b.txCount,
      b.rawGrossSales,
      b.returnedSales,
      b.excludedWithdrawalPrincipal,
      b.taxableTurnover,
      b.pphFinalDue,
      b.ppnNetPayable,
      b.pb1Due,
      b.totalEstimatedTax,
      b.recordedPaidTax,
      Math.max(0, b.totalEstimatedTax - b.recordedPaidTax),
    ]);
    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rekap-pajak-${selectedYear}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setCsvExportNotice(`File CSV rekap tahunan ${selectedYear} berhasil diunduh.`);
    window.setTimeout(() => setCsvExportNotice(null), 4000);
  };

  const handleExportMonthlyDjpCsv = () => {
    sound.playTap();
    const escapeCsv = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const formatCsvRows = (rows: Array<Array<string | number>>) =>
      rows.map((r) => r.map(escapeCsv).join(','));

    const monthNumberStr = String(selectedMonthIndex + 1).padStart(2, '0');
    const dueMonthIdx = (selectedMonthIndex + 1) % 12;
    const dueYear = selectedMonthIndex === 11 ? selectedYear + 1 : selectedYear;
    const dueDateLabel = `${String(taxConfig.monthlyDueDay ?? 15).padStart(2, '0')} ${MONTH_NAMES_ID[dueMonthIdx]} ${dueYear}`;

    const excludeWithdrawal = taxConfig.excludeCashWithdrawalPrincipal !== false;
    const ppnRate = Math.max(0, Number(taxConfig.ppnRatePercent ?? 11));
    const ppnMode: TaxCalculationMode = taxConfig.ppnMode || 'INCLUSIVE';
    const pphRate = Math.max(0, Number(taxConfig.pphFinalRatePercent ?? 0.5));
    const pb1Rate = Math.max(0, Number(taxConfig.pb1RatePercent ?? 10));

    // Records belonging to selectedPeriodKey
    const monthTaxRecords = taxRecords.filter((rec) => rec.periodMonth === selectedPeriodKey);
    const paidByType = (t: TaxRecordType) =>
      monthTaxRecords
        .filter((r) => r.taxType === t && r.status === 'SUDAH_SETOR')
        .reduce((s, r) => s + Math.max(0, r.paidAmount || r.taxAmountDue || 0), 0);

    const pphPaid = paidByType('PPH_FINAL_UMKM');
    const ppnPaid = paidByType('PPN');
    const pb1Paid = paidByType('PB1');
    const otherPaid = monthTaxRecords
      .filter(
        (r) =>
          r.status === 'SUDAH_SETOR' &&
          r.taxType !== 'PPH_FINAL_UMKM' &&
          r.taxType !== 'PPN' &&
          r.taxType !== 'PB1'
      )
      .reduce((s, r) => s + Math.max(0, r.paidAmount || r.taxAmountDue || 0), 0);

    // Daily turnover breakdown for selected period (required for DJP PP 55/2022 & PPN Digunggung)
    const dailyMap = new Map<
      string,
      {
        date: string;
        txCount: number;
        rawGross: number;
        returned: number;
        excludedPrincipal: number;
        taxableTurnover: number;
      }
    >();

    transactions.forEach((tx) => {
      const d = new Date(tx.timestamp);
      if (d.getFullYear() !== selectedYear || d.getMonth() !== selectedMonthIndex) return;
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const bd = computeTxTaxableBreakdown(tx, excludeWithdrawal);
      const curr = dailyMap.get(dateKey) || {
        date: dateKey,
        txCount: 0,
        rawGross: 0,
        returned: 0,
        excludedPrincipal: 0,
        taxableTurnover: 0,
      };
      curr.txCount += 1;
      curr.rawGross += bd.rawGross;
      curr.returned += bd.returned;
      curr.excludedPrincipal += bd.withdrawalPrincipal;
      curr.taxableTurnover += bd.netTaxable;
      dailyMap.set(dateKey, curr);
    });

    const dailyRowsSorted = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    const lines: string[] = [];

    // SECTION 1: Tax Identity & Filing Metadata
    lines.push(
      ...formatCsvRows([
        ['RINGKASAN PAJAK BULANAN UNTUK PELAPORAN DJP ONLINE'],
        ['Nama Usaha', storeSettings.storeName],
        ['Nama Wajib Pajak', taxConfig.taxpayerName || storeSettings.storeName],
        ['NPWP', taxConfig.npwp || '-'],
        ['Status Wajib Pajak', REGIME_LABELS[taxConfig.taxpayerStatus]],
        ['Masa Pajak', `${monthNumberStr}-${selectedYear} (${selectedPeriodLabel})`],
        ['Jatuh Tempo Lapor / Setor', dueDateLabel],
        ['Tanggal Generate CSV', new Date().toLocaleString('id-ID')],
        [],
      ])
    );

    // SECTION 2: Monthly Tax Summary (PPN, PPh Final, PB1)
    lines.push(
      ...formatCsvRows([
        ['I. RINGKASAN KEWAJIBAN PAJAK BULANAN (DJP ONLINE)'],
        [
          'Jenis Pajak / Komponen',
          'Kode Akun Pajak (KAP) / KJS',
          'Status Aktif',
          'DPP / Dasar Pengenaan Pajak (Rp)',
          'Tarif (%)',
          'Pajak Keluaran / Bruto (Rp)',
          'Kredit PPN Masukan PO (Rp)',
          'Pajak Terutang / Estimasi (Rp)',
          'Sudah Disetor (Rp)',
          'Sisa Kurang Bayar (Rp)',
          'Catatan Perhitungan',
        ],
        [
          'Omzet Penjualan Kena Pajak',
          '-',
          'Dasar Pajak',
          currentMonthStats.taxableTurnover,
          '-',
          currentMonthStats.rawGrossSales,
          0,
          0,
          0,
          0,
          `${currentMonthStats.txCount} transaksi POS | Retur: ${currentMonthStats.returnedSales} | Tarik Tunai Dikecualikan: ${currentMonthStats.excludedWithdrawalPrincipal}`,
        ],
        [
          'PPh Final UMKM (PP 55/2022)',
          '411128 / 420',
          taxConfig.enablePphFinalUmkm && taxConfig.taxpayerStatus !== 'NON_PAJAK' ? 'AKTIF' : 'NON-AKTIF',
          currentMonthStats.pphTaxableSlice,
          pphRate,
          currentMonthStats.pphFinalDue,
          0,
          currentMonthStats.pphFinalDue,
          pphPaid,
          Math.max(0, currentMonthStats.pphFinalDue - pphPaid),
          taxConfig.taxpayerStatus === 'UMKM_OP' && taxConfig.applyUmkmOpThreshold500Jt !== false
            ? `Omzet Kumulatif YTD: ${currentMonthStats.cumulativeTurnoverAfterMonth} | Bagian Bebas Pajak (<=500Jt): ${currentMonthStats.pphExemptSlice}`
            : 'Dihitung penuh dari Omzet Kena Pajak',
        ],
        [
          `PPN (${ppnMode === 'INCLUSIVE' ? 'Termasuk Harga' : 'Ditambahkan'})`,
          '411211 / 100',
          taxConfig.enablePpn && taxConfig.taxpayerStatus !== 'NON_PAJAK' ? 'AKTIF' : 'NON-AKTIF',
          currentMonthStats.ppnDpp,
          ppnRate,
          currentMonthStats.ppnOutput,
          currentMonthStats.ppnInputEstimate,
          currentMonthStats.ppnNetPayable,
          ppnPaid,
          Math.max(0, currentMonthStats.ppnNetPayable - ppnPaid),
          `Total PO Pembelian Selesai Masa Ini: ${currentMonthStats.purchaseTotalCompleted}`,
        ],
        [
          'Pajak Daerah / PB1',
          'Pajak Daerah',
          taxConfig.enablePb1 && taxConfig.taxpayerStatus !== 'NON_PAJAK' ? 'AKTIF' : 'NON-AKTIF',
          taxConfig.enablePb1 ? currentMonthStats.taxableTurnover : 0,
          pb1Rate,
          currentMonthStats.pb1Due,
          0,
          currentMonthStats.pb1Due,
          pb1Paid,
          Math.max(0, currentMonthStats.pb1Due - pb1Paid),
          'Pajak restoran/daerah jika berlaku',
        ],
        [
          'TOTAL KEWAJIBAN PAJAK MASA INI',
          '-',
          '-',
          currentMonthStats.taxableTurnover,
          '-',
          currentMonthStats.pphFinalDue + currentMonthStats.ppnOutput + currentMonthStats.pb1Due,
          currentMonthStats.ppnInputEstimate,
          currentMonthStats.totalEstimatedTax,
          currentMonthStats.recordedPaidTax,
          Math.max(0, currentMonthStats.totalEstimatedTax - currentMonthStats.recordedPaidTax),
          otherPaid > 0 ? `Termasuk setoran PPh 21/Lainnya: ${otherPaid}` : 'Rekap gabungan masa pajak terpilih',
        ],
        [],
      ])
    );

    // SECTION 3: Recorded Billing & NTPN Receipts for Selected Month
    lines.push(
      ...formatCsvRows([
        [`II. ARSIP SETORAN, KODE BILLING & NTPN (${selectedPeriodLabel.toUpperCase()})`],
        [
          'Masa Pajak',
          'Jenis Pajak',
          'Status',
          'DPP (Rp)',
          'Tarif (%)',
          'Nominal Terutang (Rp)',
          'Nominal Disetor (Rp)',
          'Kode Billing',
          'NTPN',
          'Tanggal Setor',
          'Metode Bayar',
          'Keterangan',
        ],
        ...(monthTaxRecords.length > 0
          ? monthTaxRecords.map((rec) => [
              rec.periodMonth,
              rec.taxTypeLabel,
              rec.status === 'SUDAH_SETOR' ? 'SUDAH SETOR' : 'BELUM SETOR',
              rec.taxBaseAmount,
              rec.taxRatePercent,
              rec.taxAmountDue,
              rec.paidAmount,
              rec.billingCode || '-',
              rec.ntpnCode || '-',
              rec.paidDate || '-',
              rec.paymentMethod || '-',
              rec.notes || '-',
            ])
          : [['Belum ada arsip setoran / NTPN tercatat untuk masa pajak ini']]),
        [],
      ])
    );

    // SECTION 4: Daily Turnover Ledger for Selected Month
    lines.push(
      ...formatCsvRows([
        [`III. RINCIAN PEREDARAN BRUTO HARIAN (${selectedPeriodLabel.toUpperCase()})`],
        [
          'Tanggal',
          'Jumlah Transaksi',
          'Penjualan Bruto POS (Rp)',
          'Retur Penjualan (Rp)',
          'Pokok Tarik Tunai Dikecualikan (Rp)',
          'Omzet Kena Pajak / DPP (Rp)',
          'Estimasi PPN Harian (Rp)',
          'Estimasi PPh Final Harian (Rp)',
        ],
        ...(dailyRowsSorted.length > 0
          ? dailyRowsSorted.map((row) => {
              const dailyPpn =
                taxConfig.enablePpn && taxConfig.taxpayerStatus !== 'NON_PAJAK'
                  ? ppnMode === 'INCLUSIVE'
                    ? Math.round(row.taxableTurnover - row.taxableTurnover / (1 + ppnRate / 100))
                    : Math.round(row.taxableTurnover * (ppnRate / 100))
                  : 0;
              const dailyPph =
                taxConfig.enablePphFinalUmkm && taxConfig.taxpayerStatus !== 'NON_PAJAK'
                  ? currentMonthStats.pphTaxableSlice === 0
                    ? 0
                    : Math.round(row.taxableTurnover * (pphRate / 100))
                  : 0;
              return [
                row.date,
                row.txCount,
                row.rawGross,
                row.returned,
                row.excludedPrincipal,
                row.taxableTurnover,
                dailyPpn,
                dailyPph,
              ];
            })
          : [['Tidak ada transaksi penjualan tercatat pada masa pajak ini']]),
      ])
    );

    const csvContent = lines.join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ringkasan-pajak-djp-${selectedPeriodKey}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setCsvExportNotice(
      `CSV ringkasan pajak DJP Online (${selectedPeriodLabel}) berhasil dibuat & diunduh.`
    );
    window.setTimeout(() => setCsvExportNotice(null), 4500);
  };

  const handleExportPdfReport = () => {
    sound.playTap();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Laporan Rekapitulasi & Perhitungan Pajak - ${storeSettings.storeName}`, 14, 15);
    doc.setFontSize(10);
    doc.text(
      `Tahun Pajak: ${selectedYear} | Status: ${REGIME_LABELS[taxConfig.taxpayerStatus]}${
        taxConfig.npwp ? ` | NPWP: ${taxConfig.npwp}` : ''
      }`,
      14,
      22
    );

    autoTable(doc, {
      startY: 28,
      head: [
        [
          'Masa Pajak',
          'Trx',
          'Omzet Kena Pajak',
          'PPh Final UMKM',
          'PPN Kurang Bayar',
          'PB1',
          'Total Estimasi',
          'Sudah Disetor',
          'Sisa',
        ],
      ],
      body: annualAnalysis.buckets.map((b) => [
        `${b.monthName} ${selectedYear}`,
        formatNumber(b.txCount),
        formatRupiah(b.taxableTurnover),
        formatRupiah(b.pphFinalDue),
        formatRupiah(b.ppnNetPayable),
        formatRupiah(b.pb1Due),
        formatRupiah(b.totalEstimatedTax),
        formatRupiah(b.recordedPaidTax),
        formatRupiah(Math.max(0, b.totalEstimatedTax - b.recordedPaidTax)),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 23, 42] },
    });

    doc.save(`laporan-pajak-${selectedYear}.pdf`);
  };

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-100 overflow-y-auto select-none font-sans">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Header */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
              <span>{storeSettings.storeName}</span>
              <span aria-hidden="true">·</span>
              <span>{REGIME_LABELS[taxConfig.taxpayerStatus]}</span>
              {taxConfig.npwp && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">NPWP {taxConfig.npwp}</span>
                </>
              )}
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-sky-600 shrink-0" />
              <span>Manajemen &amp; Perhitungan Pajak</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
              Hitung otomatis PPh Final UMKM, PPN, dan Pajak Daerah dari transaksi kasir, simulasi tarif pajak, serta catat bukti setoran (ID Billing &amp; NTPN) langsung ke keuangan toko.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={handleDownloadTaxSummaryExcel}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              title={`Ekspor ke Excel daftar transaksi (Harga Jual, PPN, PPh Final) masa ${selectedPeriodLabel} sesuai format e-Bupot / DJP Online`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ekspor ke Excel</span>
            </button>
            <button
              type="button"
              onClick={handleExportMonthlyDjpCsv}
              className="px-3.5 py-2 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              title={`Unduh ringkasan CSV PPN & PPh Final masa ${selectedPeriodLabel} untuk pelaporan DJP Online`}
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>CSV Bulanan ({SHORT_MONTH_NAMES_ID[selectedMonthIndex]})</span>
            </button>
            <button
              type="button"
              onClick={handleExportAnnualCsv}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>CSV Tahunan ({selectedYear})</span>
            </button>
            <button
              type="button"
              onClick={handleExportMonthlyPdfReport}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              title={`Unduh laporan pajak bulanan format PDF siap cetak & arsip untuk masa ${selectedPeriodLabel}`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>PDF Bulanan ({SHORT_MONTH_NAMES_ID[selectedMonthIndex]})</span>
            </button>
            <button
              type="button"
              onClick={handleExportPdfReport}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>PDF Tahunan ({selectedYear})</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateRecordModal()}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" />
              <span>Catat Setoran Pajak</span>
            </button>
          </div>
        </div>

        {csvExportNotice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{csvExportNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setCsvExportNotice(null)}
              className="p-1 text-emerald-700 hover:text-emerald-950 cursor-pointer"
              aria-label="Tutup pemberitahuan"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Notifikasi Peringatan Jatuh Tempo Pajak Bulanan */}
        <TaxDueAlertBanner
          transactions={transactions}
          purchases={purchases}
          taxRecords={taxRecords}
          taxAdjustments={taxAdjustments}
          storeSettings={storeSettings}
          taxConfigOverride={taxConfig}
          variant="TAX_VIEW"
          onSelectPeriod={(yr, mIdx) => {
            setSelectedYear(yr);
            setSelectedMonthIndex(mIdx);
            setActiveSubTab('CALCULATION');
          }}
          onRecordTaxPayment={handleAlertRecordPayment}
          onExcelDownloaded={(filename, periodLabel, txCount) => {
            setCsvExportNotice(
              `File Excel "${filename}" (${txCount} transaksi masa ${periodLabel}) berhasil diunduh.`
            );
            window.setTimeout(() => setCsvExportNotice(null), 5000);
          }}
        />

        {/* Sub-tab & Period Bar */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto">
            {[
              { id: 'CALCULATION' as TaxSubTab, label: 'Perhitungan & Simulasi', icon: Calculator },
              { id: 'PPH_BADAN_31E' as TaxSubTab, label: 'PPh Badan & Pasal 31E', icon: Building2 },
              {
                id: 'ADJUSTMENT_VAT' as TaxSubTab,
                label: `Adjustment & Restitusi PPN${
                  taxAdjustments.length > 0 ? ` (${taxAdjustments.length})` : ''
                }`,
                icon: Scale,
              },
              {
                id: 'RECORDS' as TaxSubTab,
                label: `Arsip & Setoran (${taxRecords.length})`,
                icon: FileSpreadsheet,
              },
              {
                id: 'AUDIT_LOG' as TaxSubTab,
                label: `Log Audit (${taxAuditLogs.length})`,
                icon: History,
              },
              { id: 'SETTINGS' as TaxSubTab, label: 'Profil & Tarif Pajak', icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setActiveSubTab(tab.id);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {activeSubTab === 'CALCULATION' && (
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor="tax-month-select" className="text-xs font-semibold text-slate-600">
                Masa Pajak:
              </label>
              <select
                id="tax-month-select"
                value={selectedMonthIndex}
                onChange={(e) => {
                  sound.playTap();
                  setSelectedMonthIndex(Number(e.target.value));
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 cursor-pointer focus:outline-none focus:border-sky-500"
              >
                {MONTH_NAMES_ID.map((mName, idx) => (
                  <option key={mName} value={idx}>
                    {mName}
                  </option>
                ))}
              </select>

              <select
                aria-label="Tahun Pajak"
                value={selectedYear}
                onChange={(e) => {
                  sound.playTap();
                  setSelectedYear(Number(e.target.value));
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 font-mono tabular-nums cursor-pointer focus:outline-none focus:border-sky-500"
              >
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    {yr}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* SUB-TAB 1: PERHITUNGAN & SIMULASI */}
        {activeSubTab === 'CALCULATION' && (
          <div className="space-y-4">
            {/* 4 KPI Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-xs font-semibold text-slate-500">
                  Omzet Kena Pajak ({SHORT_MONTH_NAMES_ID[selectedMonthIndex]} {selectedYear})
                </div>
                <div className="text-xl md:text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatRupiah(currentMonthStats.taxableTurnover)}
                </div>
                <div className="text-xs text-slate-500 mt-1 tabular-nums">
                  {formatNumber(currentMonthStats.txCount)} trx · Bruto{' '}
                  {formatRupiah(currentMonthStats.rawGrossSales)}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-xs font-semibold text-sky-700">
                  Estimasi Pajak Masa Ini
                </div>
                <div className="text-xl md:text-2xl font-bold font-mono tabular-nums text-sky-700 mt-1">
                  {formatRupiah(currentMonthStats.totalEstimatedTax)}
                </div>
                <div className="text-xs text-slate-500 mt-1 tabular-nums">
                  Jatuh tempo tgl {taxConfig.monthlyDueDay ?? 15} bulan berikutnya
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-xs font-semibold text-emerald-700">
                  Sudah Disetor ({SHORT_MONTH_NAMES_ID[selectedMonthIndex]})
                </div>
                <div className="text-xl md:text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                  {formatRupiah(currentMonthStats.recordedPaidTax)}
                </div>
                <div className="text-xs text-slate-500 mt-1 tabular-nums">
                  Total setor {selectedYear}: {formatRupiah(annualAnalysis.totalAnnualTaxPaid)}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <div className="text-xs font-semibold text-slate-500">
                  Sisa Kewajiban Masa Ini
                </div>
                <div
                  className={`text-xl md:text-2xl font-bold font-mono tabular-nums mt-1 ${
                    remainingMonthLiability > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {formatRupiah(remainingMonthLiability)}
                </div>
                <div className="text-xs mt-1 flex items-center gap-1">
                  {remainingMonthLiability === 0 ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-emerald-700 font-semibold">Lunas / Nihil</span>
                    </>
                  ) : (
                    <>
                      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="text-amber-700 font-semibold">Perlu Setor &amp; Lapor</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Breakdown & UMKM/PKP Annual Threshold Progress */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Detailed Calculation Table for Selected Month */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Rincian Perhitungan Pajak — {selectedPeriodLabel}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Dihitung otomatis dari transaksi penjualan, retur, dan pembelian PO selesai.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleDownloadTaxSummaryExcel}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title={`Ekspor ke Excel transaksi bulanan (Harga Jual, PPN, PPh Final) masa ${selectedPeriodLabel}`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Ekspor ke Excel ({SHORT_MONTH_NAMES_ID[selectedMonthIndex]})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportMonthlyPdfReport}
                      className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                      title={`Unduh PDF laporan bulanan ${selectedPeriodLabel}`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF Bulanan ({SHORT_MONTH_NAMES_ID[selectedMonthIndex]})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportMonthlyDjpCsv}
                      className="px-2.5 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-700" />
                      <span>CSV DJP</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('SETTINGS')}
                      className="text-xs font-semibold text-sky-700 hover:underline cursor-pointer whitespace-nowrap px-1"
                    >
                      Ubah Tarif Pajak
                    </button>
                  </div>
                </div>

                <div className="p-4 space-y-3 text-xs">
                  {/* Base Reconciliation */}
                  <div className="space-y-1.5 pb-3 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Penjualan Bruto POS ({formatNumber(currentMonthStats.txCount)} transaksi)</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatRupiah(currentMonthStats.rawGrossSales)}
                      </span>
                    </div>
                    {currentMonthStats.returnedSales > 0 && (
                      <div className="flex items-center justify-between text-rose-700">
                        <span>Dikurangi: Retur Penjualan</span>
                        <span className="font-mono tabular-nums font-semibold">
                          −{formatRupiah(currentMonthStats.returnedSales)}
                        </span>
                      </div>
                    )}
                    {currentMonthStats.excludedWithdrawalPrincipal > 0 && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Dikurangi: Pokok Uang Tarik Tunai (Non-Omzet)</span>
                        <span className="font-mono tabular-nums font-semibold">
                          −{formatRupiah(currentMonthStats.excludedWithdrawalPrincipal)}
                        </span>
                      </div>
                    )}
                    {currentMonthStats.dppAdjustmentNet !== 0 && (
                      <div className="flex items-center justify-between text-amber-800">
                        <span>
                          Adjustment / Koreksi DPP Netto ({currentMonthStats.adjustmentCount} entri)
                        </span>
                        <span className="font-mono tabular-nums font-bold">
                          {currentMonthStats.dppAdjustmentNet >= 0 ? '+' : '−'}
                          {formatRupiah(Math.abs(currentMonthStats.dppAdjustmentNet))}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100 font-bold text-slate-900 text-sm">
                      <span>Peredaran Bruto / Omzet Kena Pajak</span>
                      <span className="font-mono tabular-nums">
                        {formatRupiah(currentMonthStats.taxableTurnover)}
                      </span>
                    </div>
                  </div>

                  {/* Active Tax Components */}
                  <div className="space-y-2.5">
                    {taxConfig.taxpayerStatus === 'NON_PAJAK' && (
                      <div className="py-4 text-center text-slate-500">
                        Mode profil saat ini <strong>Non-PKP / Simulasi Internal</strong>. Aktifkan jenis pajak di tab{' '}
                        <strong>Profil &amp; Tarif Pajak</strong> untuk menghitung kewajiban otomatis.
                      </div>
                    )}

                    {taxConfig.enablePphFinalUmkm && taxConfig.taxpayerStatus !== 'NON_PAJAK' && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div>
                          <div className="font-bold text-slate-900">
                            PPh Final UMKM ({taxConfig.pphFinalRatePercent ?? 0.5}%)
                          </div>
                          <div className="text-slate-500 mt-0.5 tabular-nums">
                            {taxConfig.taxpayerStatus === 'UMKM_OP' &&
                            taxConfig.applyUmkmOpThreshold500Jt !== false
                              ? currentMonthStats.pphTaxableSlice === 0
                                ? `Bebas pajak (omzet kumulatif ${formatRupiah(currentMonthStats.cumulativeTurnoverAfterMonth)} ≤ batas Rp 500 Jt)`
                                : `DPP kena pajak di atas Rp 500 Jt: ${formatRupiah(currentMonthStats.pphTaxableSlice)}`
                              : `DPP: ${formatRupiah(currentMonthStats.taxableTurnover)} × ${taxConfig.pphFinalRatePercent ?? 0.5}%`}
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                            {formatRupiah(currentMonthStats.pphFinalDue)}
                          </span>
                          {currentMonthStats.pphFinalDue > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                openCreateRecordModal({
                                  periodMonth: selectedPeriodKey,
                                  taxType: 'PPH_FINAL_UMKM',
                                  taxBaseAmount: currentMonthStats.pphTaxableSlice,
                                  taxRatePercent: Number(taxConfig.pphFinalRatePercent ?? 0.5),
                                  taxAmountDue: currentMonthStats.pphFinalDue,
                                  notes: `Setoran PPh Final UMKM Masa ${selectedPeriodLabel}`,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold whitespace-nowrap cursor-pointer"
                            >
                              Catat Setor
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {taxConfig.enablePpn && taxConfig.taxpayerStatus !== 'NON_PAJAK' && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div>
                          <div className="font-bold text-slate-900">
                            PPN {taxConfig.ppnRatePercent ?? 11}% ({taxConfig.ppnMode === 'INCLUSIVE' ? 'Termasuk Harga' : 'Ditambahkan'})
                          </div>
                          <div className="text-slate-500 mt-0.5 tabular-nums">
                            DPP: {formatRupiah(currentMonthStats.ppnDpp)} · Keluaran:{' '}
                            {formatRupiah(currentMonthStats.ppnOutput)} − Est. Masukan PO:{' '}
                            {formatRupiah(currentMonthStats.ppnInputEstimate)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                            {formatRupiah(currentMonthStats.ppnNetPayable)}
                          </span>
                          {currentMonthStats.ppnNetPayable > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                openCreateRecordModal({
                                  periodMonth: selectedPeriodKey,
                                  taxType: 'PPN',
                                  taxBaseAmount: currentMonthStats.ppnDpp,
                                  taxRatePercent: Number(taxConfig.ppnRatePercent ?? 11),
                                  taxAmountDue: currentMonthStats.ppnNetPayable,
                                  notes: `PPN Kurang Bayar Masa ${selectedPeriodLabel}`,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold whitespace-nowrap cursor-pointer"
                            >
                              Catat Setor
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {taxConfig.enablePb1 && taxConfig.taxpayerStatus !== 'NON_PAJAK' && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div>
                          <div className="font-bold text-slate-900">
                            Pajak Daerah / PB1 ({taxConfig.pb1RatePercent ?? 10}%)
                          </div>
                          <div className="text-slate-500 mt-0.5 tabular-nums">
                            DPP: {formatRupiah(currentMonthStats.taxableTurnover)} × {taxConfig.pb1RatePercent ?? 10}%
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
                            {formatRupiah(currentMonthStats.pb1Due)}
                          </span>
                          {currentMonthStats.pb1Due > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                openCreateRecordModal({
                                  periodMonth: selectedPeriodKey,
                                  taxType: 'PB1',
                                  taxBaseAmount: currentMonthStats.taxableTurnover,
                                  taxRatePercent: Number(taxConfig.pb1RatePercent ?? 10),
                                  taxAmountDue: currentMonthStats.pb1Due,
                                  notes: `Setoran PB1 Daerah Masa ${selectedPeriodLabel}`,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold whitespace-nowrap cursor-pointer"
                            >
                              Catat Setor
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {(currentMonthStats.adjustmentCount > 0 ||
                      currentMonthStats.ppnOverpaymentAmount > 0) && (
                      <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5 text-amber-950">
                          {currentMonthStats.ppnOverpaymentAmount > 0 && (
                            <div className="font-bold">
                              PPN Lebih Bayar Periode Ini:{' '}
                              <span className="font-mono tabular-nums">
                                {formatRupiah(currentMonthStats.ppnOverpaymentAmount)}
                              </span>
                            </div>
                          )}
                          {currentMonthStats.adjustmentCount > 0 && (
                            <div>
                              Termasuk{' '}
                              <strong>
                                {formatNumber(currentMonthStats.adjustmentCount)} adjustment pajak
                              </strong>{' '}
                              aktif yang menyesuaikan omzet/pajak masa ini.
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setActiveSubTab('ADJUSTMENT_VAT');
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {currentMonthStats.ppnOverpaymentAmount > 0
                            ? 'Bandingkan Restitusi vs Kompensasi'
                            : 'Kelola Adjustment & Jurnal'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Annual UMKM & PKP Threshold Meters */}
                  <div className="pt-2 space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">
                          Akumulasi Omzet {selectedYear} vs Batas Bebas PPh OP UMKM (Rp 500 Juta)
                        </span>
                        <span className="font-mono tabular-nums font-bold text-slate-900">
                          {formatRupiah(annualAnalysis.totalAnnualTurnover)} (
                          {annualAnalysis.umkmThresholdProgress.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            annualAnalysis.totalAnnualTurnover > annualAnalysis.umkmThreshold
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${annualAnalysis.umkmThresholdProgress}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-slate-700">
                          Akumulasi Omzet {selectedYear} vs Batas Wajib PKP / PPN (Rp 4,8 Miliar)
                        </span>
                        <span className="font-mono tabular-nums font-bold text-slate-900">
                          {annualAnalysis.pkpThresholdProgress.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            annualAnalysis.totalAnnualTurnover >= annualAnalysis.pkpThreshold
                              ? 'bg-rose-500'
                              : 'bg-sky-500'
                          }`}
                          style={{ width: `${annualAnalysis.pkpThresholdProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Ringkasan Kepatuhan PKP vs Non-PKP (Batasan Omzet Rp 4,8 Miliar) */}
                    {(() => {
                      const isOver48M =
                        annualAnalysis.totalAnnualTurnover > annualAnalysis.pkpThreshold;
                      const isPkpActive =
                        taxConfig.taxpayerStatus === 'PKP_UMUM' || Boolean(taxConfig.enablePpn);

                      return (
                        <div
                          className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                            isOver48M && !isPkpActive
                              ? 'bg-rose-50 border-rose-200 text-rose-900'
                              : isPkpActive
                              ? 'bg-sky-50 border-sky-200 text-sky-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="font-bold">
                              {isOver48M
                                ? 'Status Omzet > Rp 4,8 Miliar/Tahun: Wajib Pengusaha Kena Pajak (PKP)'
                                : isPkpActive
                                ? 'Status Aktif: PKP Sukarela (Omzet ≤ Rp 4,8 Miliar/Tahun)'
                                : 'Status Aktif: Non-PKP (Omzet ≤ Rp 4,8 Miliar/Tahun)'}
                            </span>
                            {isOver48M && !isPkpActive && (
                              <button
                                type="button"
                                onClick={async () => {
                                  sound.playTap();
                                  await onUpdateTaxConfig({
                                    ...taxConfig,
                                    taxpayerStatus: 'PKP_UMUM',
                                    enablePpn: true,
                                  });
                                  setCsvExportNotice(
                                    'Status pajak toko diperbarui ke PKP (PPh + PPN aktif).'
                                  );
                                  window.setTimeout(() => setCsvExportNotice(null), 4000);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                Aktifkan Mode PKP (PPh + PPN)
                              </button>
                            )}
                          </div>
                          <p className="leading-relaxed">
                            {isOver48M ? (
                              <>
                                Peredaran bruto tahunan telah melampaui <strong>Rp 4,8 Miliar</strong>.
                                Toko wajib dikukuhkan sebagai <strong>PKP</strong>, melaksanakan{' '}
                                <strong>pembukuan untuk kewajiban PPh</strong>, memungut &amp; menyetor{' '}
                                <strong>PPN terutang</strong>, serta menerbitkan{' '}
                                <strong>Faktur Pajak</strong> setiap transaksi barang &amp; jasa kena pajak.
                              </>
                            ) : isPkpActive ? (
                              <>
                                Meskipun omzet masih di bawah <strong>Rp 4,8 Miliar/tahun</strong>,
                                toko memilih/berstatus <strong>PKP</strong>. Kewajiban meliputi{' '}
                                <strong>pembukuan PPh</strong>, pemungutan &amp; penyetoran{' '}
                                <strong>PPN</strong>, serta penerbitan <strong>Faktur Pajak</strong>{' '}
                                setiap transaksi barang &amp; jasa kena pajak.
                              </>
                            ) : (
                              <>
                                Karena peredaran bruto setahun tidak melebihi{' '}
                                <strong>Rp 4,8 Miliar</strong> (Non-PKP), kewajiban toko saat ini hanya{' '}
                                <strong>membayar PPh saja</strong>. Pemilik usaha tetap dapat memilih
                                mengajukan PKP secara sukarela di tab <strong>Profil &amp; Tarif Pajak</strong>.
                              </>
                            )}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Perhitungan PPh Badan Tahunan, Opsi Fasilitas Pasal 31E & Perbandingan Tarif Normal */}
                    {(() => {
                      const corp = annualCorporateProjection.projected;
                      const facilityEffRate =
                        corp.taxableIncomePkp > 0
                          ? Number(((corp.withFacility31EDue / corp.taxableIncomePkp) * 100).toFixed(2))
                          : corp.facilityRatePercent;
                      const configMatchesChoice =
                        applyPasal31EOption === (taxConfig.applyPasal31EFacility !== false);

                      return (
                        <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-3 text-xs">
                          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
                            <div className="space-y-0.5 min-w-0">
                              <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                                <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
                                <span>
                                  Perhitungan PPh Badan {selectedYear}: Fasilitas Pasal 31E vs Tarif Normal
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-600 tabular-nums">
                                Omzet Bruto ({corporateProjectionMode === 'PROJECTED_12M' ? 'Proyeksi 12 Bln' : 'Aktual YTD'}):{' '}
                                <strong className="font-mono text-slate-900">
                                  {formatRupiah(corp.grossTurnover)}
                                </strong>{' '}
                                · PKP Fiskal:{' '}
                                <strong className="font-mono text-slate-900">
                                  {formatRupiah(corp.taxableIncomePkp)}
                                </strong>{' '}
                                ·{' '}
                                <span
                                  className={`font-semibold ${
                                    corp.isEligibleUnder48M
                                      ? 'text-emerald-700'
                                      : corp.isEligible31EByRevenue
                                      ? 'text-sky-700'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {corp.grossTurnover <= 0
                                    ? 'Belum ada omzet tahun berjalan'
                                    : corp.isEligibleUnder48M
                                    ? `Omzet ≤ Rp 4,8 M (Berhak Diskon 50% · Tarif ${corp.facilityRatePercent}%)`
                                    : corp.isEligible31EByRevenue
                                    ? `Omzet ≤ Rp 50 M (Fasilitas 31E Proporsional ${(corp.facilityShareRatio * 100).toFixed(1)}%)`
                                    : `Omzet > Rp 50 M (Tarif Normal Penuh ${corp.generalRatePercent}%)`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap shrink-0">
                              <div className="inline-flex items-center gap-1 p-0.5 bg-white rounded-lg border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    setCorporateProjectionMode('AUTO_POS');
                                  }}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                                    corporateProjectionMode === 'AUTO_POS'
                                      ? 'bg-slate-900 text-white'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Aktual YTD
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    setCorporateProjectionMode('PROJECTED_12M');
                                  }}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                                    corporateProjectionMode === 'PROJECTED_12M'
                                      ? 'bg-slate-900 text-white'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Proyeksi 12 Bln
                                </button>
                              </div>

                              <div className="inline-flex items-center gap-1 p-0.5 bg-white rounded-lg border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    setApplyPasal31EOption(true);
                                  }}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                                    applyPasal31EOption
                                      ? 'bg-emerald-600 text-white'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Pakai Fasilitas 31E ({corp.facilityRatePercent}%)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    sound.playTap();
                                    setApplyPasal31EOption(false);
                                  }}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                                    !applyPasal31EOption
                                      ? 'bg-slate-900 text-white'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  Tarif Normal ({corp.generalRatePercent}%)
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Side-by-Side Comparison Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div
                              className={`p-3 rounded-xl border ${
                                applyPasal31EOption
                                  ? 'bg-emerald-50 border-emerald-300'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-emerald-900">
                                  Dengan Fasilitas Pasal 31E
                                </span>
                                <span className="font-mono tabular-nums text-[11px] font-bold text-emerald-700">
                                  {corp.isEligible31EByRevenue ? `${facilityEffRate}%` : `${corp.generalRatePercent}%`}
                                </span>
                              </div>
                              <div className="font-mono tabular-nums text-base font-bold text-slate-900 mt-1">
                                {formatRupiah(corp.withFacility31EDue)}
                              </div>
                              <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                                Est. PPh 25: {formatRupiah(corp.withFacility31EMonthlyPph25)}/bln · Kurang
                                Bayar (29): {formatRupiah(corp.withFacility31EPph29Underpayment)}
                              </div>
                            </div>

                            <div
                              className={`p-3 rounded-xl border ${
                                !applyPasal31EOption
                                  ? 'bg-sky-50 border-sky-300'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-slate-900">
                                  Tarif Normal Pasal 17
                                </span>
                                <span className="font-mono tabular-nums text-[11px] font-bold text-slate-700">
                                  {corp.generalRatePercent}%
                                </span>
                              </div>
                              <div className="font-mono tabular-nums text-base font-bold text-slate-900 mt-1">
                                {formatRupiah(corp.normalRatePphBadanDue)}
                              </div>
                              <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                                Est. PPh 25: {formatRupiah(corp.normalRateMonthlyPph25)}/bln · Kurang
                                Bayar (29): {formatRupiah(corp.normalRatePph29Underpayment)}
                              </div>
                            </div>

                            <div className="p-3 rounded-xl bg-white border border-slate-200">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-slate-900">
                                  Penghematan Diskon 50% (31E)
                                </span>
                                <span className="font-mono tabular-nums text-[11px] font-bold text-emerald-700">
                                  {corp.potentialSavingsPercent}%
                                </span>
                              </div>
                              <div className="font-mono tabular-nums text-base font-bold text-emerald-700 mt-1">
                                {formatRupiah(corp.potentialSavings31E)}
                              </div>
                              <div className="text-[11px] text-slate-600 mt-0.5 tabular-nums">
                                {applyPasal31EOption
                                  ? `Skema aktif: Hemat ${formatRupiah(corp.taxSavingsFrom31E)}/thn`
                                  : `Jika pakai 31E bisa hemat ${formatRupiah(corp.potentialSavings31E)}/thn`}
                              </div>
                            </div>
                          </div>

                          {/* Action strip */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                            <span className="text-[11px] text-slate-500">
                              {applyPasal31EOption
                                ? `Mode aktif memakai Fasilitas Pasal 31E (${corp.bracketTier === 'FULL_31E' ? `tarif ${corp.facilityRatePercent}% penuh` : 'proporsional'}).`
                                : `Mode aktif memakai Tarif Normal Pasal 17 (${corp.generalRatePercent}%) untuk pembandingan beban pajak penuh.`}
                            </span>
                            <div className="flex items-center gap-2 flex-wrap shrink-0">
                              {!configMatchesChoice && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    sound.playTap();
                                    await onUpdateTaxConfig({
                                      ...taxConfig,
                                      enablePphBadan31E: true,
                                      applyPasal31EFacility: applyPasal31EOption,
                                    });
                                    setCsvExportNotice(
                                      applyPasal31EOption
                                        ? 'Opsi Fasilitas Pasal 31E (diskon 50%) disimpan ke profil pajak.'
                                        : 'Opsi Tarif Normal Pasal 17 (22%) disimpan ke profil pajak.'
                                    );
                                    window.setTimeout(() => setCsvExportNotice(null), 4000);
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold whitespace-nowrap cursor-pointer"
                                >
                                  Simpan Opsi Ini ke Profil
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  openCreateRecordModal({
                                    periodMonth: `${selectedYear}-12`,
                                    taxType: 'PPH_BADAN',
                                    taxBaseAmount: corp.taxableIncomePkp,
                                    taxRatePercent:
                                      corp.effectiveTaxRateOnPkp || corp.facilityRatePercent,
                                    taxAmountDue:
                                      corp.pph29Underpayment > 0
                                        ? corp.pph29Underpayment
                                        : corp.totalPphBadanDue,
                                    notes: `Setoran PPh Badan ${selectedYear} (${
                                      applyPasal31EOption ? 'Fasilitas Pasal 31E' : `Tarif Normal ${corp.generalRatePercent}%`
                                    })`,
                                  })
                                }
                                className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold whitespace-nowrap cursor-pointer"
                              >
                                Catat Setor PPh Badan
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  sound.playTap();
                                  setActiveSubTab('PPH_BADAN_31E');
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold whitespace-nowrap cursor-pointer"
                              >
                                Buka Kertas Kerja 31E
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Right: Interactive Quick Tax Simulator */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Percent className="w-4 h-4 text-sky-600" />
                    <span>Kalkulator Simulasi Pajak</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Simulasikan PPh Final, PPN Inklusif/Eksklusif, PB1, atau tarif kustom secara instan.
                  </p>
                </div>

                {/* Tax Preset Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: 'PPH_FINAL' as const, label: 'PPh 0,5%' },
                    { id: 'PPN' as const, label: 'PPN 11%' },
                    { id: 'PB1' as const, label: 'PB1 10%' },
                    { id: 'CUSTOM' as const, label: 'Kustom' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectSimPreset(item.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors border ${
                        simType === item.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label
                      htmlFor="sim-nominal"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Nominal Dasar / Harga (Rp)
                    </label>
                    <input
                      id="sim-nominal"
                      type="number"
                      min="0"
                      value={simAmountInput}
                      onChange={(e) => setSimAmountInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sim-rate"
                      className="block text-xs font-semibold text-slate-700 mb-1"
                    >
                      Tarif Pajak (%)
                    </label>
                    <input
                      id="sim-rate"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={simRateInput}
                      onChange={(e) => setSimRateInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setSimMode('EXCLUSIVE');
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      simMode === 'EXCLUSIVE'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Eksklusif (+ Pajak)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setSimMode('INCLUSIVE');
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                      simMode === 'INCLUSIVE'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Inklusif (Termasuk)
                  </button>
                </div>

                {/* Simulation Output */}
                <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Dasar Pengenaan Pajak (DPP)</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      {formatRupiah(simResult.dpp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Nominal Pajak ({simResult.rate}%)</span>
                    <span className="font-mono tabular-nums font-bold text-sky-700 text-sm">
                      {formatRupiah(simResult.taxAmount)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                    <span className="font-semibold text-slate-700">
                      {simMode === 'INCLUSIVE'
                        ? 'Harga Jual Total (Sudah Termasuk Pajak)'
                        : 'Harga Tagihan (+ Pajak Ditambahkan)'}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-slate-900">
                      {formatRupiah(simResult.totalAfterTax)}
                    </span>
                  </div>
                </div>

                {(() => {
                  const defaultRateForType =
                    simType === 'PPH_FINAL'
                      ? Number(taxConfig.pphFinalRatePercent ?? 0.5)
                      : simType === 'PPN'
                      ? Number(taxConfig.ppnRatePercent ?? 11)
                      : simType === 'PB1'
                      ? Number(taxConfig.pb1RatePercent ?? 10)
                      : null;
                  const parsedSimRate = Math.max(0, parseFloat(simRateInput) || 0);
                  const isManualRateOverride =
                    defaultRateForType === null ||
                    Math.abs(parsedSimRate - defaultRateForType) > 0.0001;

                  return (
                    <>
                      {isManualRateOverride && (
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2 text-amber-900 font-semibold">
                            <span>Override Tarif Manual Terdeteksi</span>
                            <span className="font-mono tabular-nums">
                              {defaultRateForType !== null
                                ? `${defaultRateForType}% -> ${parsedSimRate}%`
                                : `Tarif Kustom ${parsedSimRate}%`}
                            </span>
                          </div>
                          <input
                            type="text"
                            value={simOverrideReason}
                            onChange={(e) => setSimOverrideReason(e.target.value)}
                            placeholder="Alasan override tarif (opsional, untuk Log Audit)..."
                            className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              sound.playTap();
                              const reasonText =
                                simOverrideReason.trim() ||
                                'Override tarif manual dari Kalkulator Simulasi Pajak';
                              if (simType === 'PPH_FINAL') {
                                await onUpdateTaxConfig(
                                  { ...taxConfig, pphFinalRatePercent: parsedSimRate },
                                  reasonText
                                );
                              } else if (simType === 'PPN') {
                                await onUpdateTaxConfig(
                                  { ...taxConfig, ppnRatePercent: parsedSimRate, ppnMode: simMode },
                                  reasonText
                                );
                              } else if (simType === 'PB1') {
                                await onUpdateTaxConfig(
                                  { ...taxConfig, pb1RatePercent: parsedSimRate },
                                  reasonText
                                );
                              } else if (onRecordTaxAuditLog) {
                                await onRecordTaxAuditLog({
                                  category: 'RATE_OVERRIDE',
                                  actionLabel: 'Simulasi Override Tarif Kustom',
                                  summary: `Penggunaan tarif pajak kustom ${parsedSimRate}% (${simMode}) atas DPP ${formatRupiah(
                                    simResult.dpp
                                  )}`,
                                  changes: [
                                    {
                                      field: 'customRatePercent',
                                      label: 'Tarif Kustom Simulasi',
                                      oldValue: 'Tarif Standar',
                                      newValue: `${parsedSimRate}% (${simMode})`,
                                    },
                                  ],
                                  reason: reasonText,
                                  periodMonth: selectedPeriodKey,
                                });
                              }
                              setSimOverrideReason('');
                              setCsvExportNotice(
                                `Override tarif ${parsedSimRate}% dicatat ke Log Audit Kepatuhan Pajak.`
                              );
                              window.setTimeout(() => setCsvExportNotice(null), 4000);
                            }}
                            className="w-full py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold cursor-pointer transition-colors"
                          >
                            {simType === 'CUSTOM'
                              ? 'Catat Override Tarif ke Log Audit'
                              : 'Terapkan Tarif ke Profil & Catat Audit'}
                          </button>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          openCreateRecordModal({
                            periodMonth: selectedPeriodKey,
                            taxType:
                              simType === 'PPH_FINAL'
                                ? 'PPH_FINAL_UMKM'
                                : simType === 'PPN'
                                ? 'PPN'
                                : simType === 'PB1'
                                ? 'PB1'
                                : 'LAINNYA',
                            taxBaseAmount: simResult.dpp,
                            taxRatePercent: simResult.rate,
                            taxAmountDue: simResult.taxAmount,
                            notes: `Dari kalkulator simulasi (${
                              simMode === 'INCLUSIVE' ? 'Inklusif' : 'Eksklusif'
                            }${isManualRateOverride ? ' · Override Tarif Manual' : ''})`,
                          })
                        }
                        disabled={simResult.taxAmount <= 0}
                        className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        Simpan Hasil ke Catatan Setoran Pajak
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Annual 12-Month Recharts Chart + Summary Table */}
            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Rekap Omzet Kena Pajak vs Kewajiban Pajak Bulanan ({selectedYear})
                  </h3>
                  <p className="text-xs text-slate-500 tabular-nums">
                    Total Omzet {selectedYear}: {formatRupiah(annualAnalysis.totalAnnualTurnover)} ·
                    Total Estimasi Pajak: {formatRupiah(annualAnalysis.totalAnnualTaxDue)} · Sudah
                    Disetor: {formatRupiah(annualAnalysis.totalAnnualTaxPaid)}
                  </p>
                </div>
              </div>

              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={annualAnalysis.buckets}
                    margin={{ top: 10, right: 16, left: 6, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="monthShort"
                      tick={{ fontSize: 11, fill: '#475569' }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10, fill: '#475569' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1_000_000 ? `${(v / 1_000_000).toFixed(0)}jt` : `${(v / 1000).toFixed(0)}rb`
                      }
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10, fill: '#0284c7' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) =>
                        v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}jt` : `${(v / 1000).toFixed(0)}rb`
                      }
                    />
                    <RechartsTooltip
                      formatter={(value: any, name: any) => [formatRupiah(Number(value) || 0), name]}
                      labelFormatter={(label) => `Bulan ${label} ${selectedYear}`}
                    />
                    <RechartsLegend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar
                      yAxisId="left"
                      dataKey="taxableTurnover"
                      name="Omzet Kena Pajak"
                      fill="#94a3b8"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="totalEstimatedTax"
                      name="Estimasi Pajak Terutang"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      yAxisId="right"
                      dataKey="recordedPaidTax"
                      name="Sudah Disetor"
                      fill="#16a34a"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Dedicated Manager Insight BarChart: Monthly Tax Payments vs Gross Revenue */}
            <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Tren Setoran Pajak Bulanan vs Pendapatan Kotor ({selectedYear})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Evaluasi proporsi beban setoran pajak terhadap total penjualan bruto bulanan toko.
                  </p>
                </div>

                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 self-start md:self-auto shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setBurdenChartMode('COMPARISON');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      burdenChartMode === 'COMPARISON'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Nominal (Rp)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setBurdenChartMode('PROPORTION');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                      burdenChartMode === 'PROPORTION'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Rasio Beban (%)
                  </button>
                </div>
              </div>

              {/* Concise 3-Column Manager Ratio Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-xs font-medium text-slate-500">
                    Pendapatan Kotor ({selectedYear})
                  </div>
                  <div className="text-base md:text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {formatRupiah(annualAnalysis.totalAnnualGrossSales)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-xs font-medium text-slate-500">
                    Total Setoran Pajak ({selectedYear})
                  </div>
                  <div className="text-base md:text-lg font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                    {formatRupiah(annualAnalysis.totalAnnualTaxPaid)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="text-xs font-medium text-slate-500">
                    Proporsi Beban Pajak Disetor
                  </div>
                  <div className="text-base md:text-lg font-bold font-mono tabular-nums text-sky-700 mt-0.5">
                    {annualAnalysis.paidBurdenRatioPercent.toFixed(2)}%{' '}
                    <span className="text-xs font-normal text-slate-500">
                      (Est. {annualAnalysis.estimatedBurdenRatioPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>

              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {burdenChartMode === 'COMPARISON' ? (
                    <BarChart
                      data={annualAnalysis.buckets}
                      margin={{ top: 10, right: 16, left: 6, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="monthShort"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        yAxisId="gross"
                        tick={{ fontSize: 10, fill: '#475569' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) =>
                          v >= 1_000_000
                            ? `${(v / 1_000_000).toFixed(0)}jt`
                            : `${(v / 1000).toFixed(0)}rb`
                        }
                      />
                      <YAxis
                        yAxisId="paid"
                        orientation="right"
                        tick={{ fontSize: 10, fill: '#059669' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) =>
                          v >= 1_000_000
                            ? `${(v / 1_000_000).toFixed(1)}jt`
                            : `${(v / 1000).toFixed(0)}rb`
                        }
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const row = payload[0]?.payload as (typeof annualAnalysis.buckets)[number];
                          if (!row) return null;
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs space-y-1.5 min-w-[220px]">
                              <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                                {row.monthName} {selectedYear}
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-600">Pendapatan Kotor</span>
                                <span className="font-mono tabular-nums font-semibold text-slate-900">
                                  {formatRupiah(row.rawGrossSales)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-emerald-700">Setoran Pajak</span>
                                <span className="font-mono tabular-nums font-bold text-emerald-700">
                                  {formatRupiah(row.recordedPaidTax)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-sky-700">Estimasi Pajak</span>
                                <span className="font-mono tabular-nums font-semibold text-sky-700">
                                  {formatRupiah(row.totalEstimatedTax)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                                <span className="font-semibold text-slate-700">Proporsi Beban Pajak</span>
                                <span className="font-mono tabular-nums font-bold text-slate-900">
                                  {row.taxPaidBurdenPercent.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <RechartsLegend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        yAxisId="gross"
                        dataKey="rawGrossSales"
                        name="Pendapatan Kotor (Bruto)"
                        fill="#475569"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="paid"
                        dataKey="recordedPaidTax"
                        name="Setoran Pajak Bulanan"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  ) : (
                    <BarChart
                      data={annualAnalysis.buckets}
                      margin={{ top: 10, right: 16, left: 6, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis
                        dataKey="monthShort"
                        tick={{ fontSize: 11, fill: '#475569' }}
                        axisLine={{ stroke: '#cbd5e1' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#475569' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const row = payload[0]?.payload as (typeof annualAnalysis.buckets)[number];
                          if (!row) return null;
                          return (
                            <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs space-y-1.5 min-w-[220px]">
                              <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                                {row.monthName} {selectedYear}
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-slate-600">Pendapatan Kotor</span>
                                <span className="font-mono tabular-nums font-semibold text-slate-900">
                                  {formatRupiah(row.rawGrossSales)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-emerald-700">Rasio Setoran Pajak</span>
                                <span className="font-mono tabular-nums font-bold text-emerald-700">
                                  {row.taxPaidBurdenPercent.toFixed(2)}% ({formatRupiah(row.recordedPaidTax)})
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-sky-700">Rasio Estimasi Pajak</span>
                                <span className="font-mono tabular-nums font-semibold text-sky-700">
                                  {row.taxEstimatedBurdenPercent.toFixed(2)}% ({formatRupiah(row.totalEstimatedTax)})
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      />
                      <RechartsLegend wrapperStyle={{ fontSize: '12px' }} />
                      <Bar
                        dataKey="taxEstimatedBurdenPercent"
                        name="Rasio Estimasi Pajak (%)"
                        fill="#0284c7"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="taxPaidBurdenPercent"
                        name="Rasio Setoran Pajak (%)"
                        fill="#059669"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* AreaChart: Tren Bulanan Total PPN & PPh Final Tahunan */}
            {(() => {
              const totalAnnualPphFinal = annualAnalysis.buckets.reduce(
                (s, b) => s + b.pphFinalDue,
                0
              );
              const totalAnnualPpn = annualAnalysis.buckets.reduce(
                (s, b) => s + (ppnTrendMetric === 'NET' ? b.ppnNetPayable : b.ppnOutput),
                0
              );
              const totalCombinedPpnPph = totalAnnualPphFinal + totalAnnualPpn;

              return (
                <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Tren Bulanan Total PPN &amp; PPh Final ({selectedYear})
                      </h3>
                      <p className="text-xs text-slate-500">
                        Grafik area perkembangan kewajiban PPN dan PPh Final sepanjang tahun untuk memantau kewajiban pajak tahunan.
                      </p>
                    </div>

                    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 self-start md:self-auto shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setPpnTrendMetric('NET');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                          ppnTrendMetric === 'NET'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        PPN Kurang Bayar (Netto)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setPpnTrendMetric('OUTPUT');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                          ppnTrendMetric === 'OUTPUT'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        PPN Keluaran (Bruto)
                      </button>
                    </div>
                  </div>

                  {/* Annual Summary Strip */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80">
                      <div className="text-xs font-medium text-emerald-800">
                        Total PPh Final ({selectedYear})
                      </div>
                      <div className="text-base md:text-lg font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
                        {formatRupiah(totalAnnualPphFinal)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80">
                      <div className="text-xs font-medium text-sky-800">
                        Total PPN {ppnTrendMetric === 'NET' ? 'Kurang Bayar' : 'Keluaran'} ({selectedYear})
                      </div>
                      <div className="text-base md:text-lg font-bold font-mono tabular-nums text-sky-700 mt-0.5">
                        {formatRupiah(totalAnnualPpn)}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                      <div className="text-xs font-medium text-slate-600">
                        Total Gabungan PPN + PPh Final
                      </div>
                      <div className="text-base md:text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                        {formatRupiah(totalCombinedPpnPph)}
                      </div>
                    </div>
                  </div>

                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={annualAnalysis.buckets}
                        margin={{ top: 10, right: 16, left: 6, bottom: 4 }}
                      >
                        <defs>
                          <linearGradient id="taxAreaPpnGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0284c7" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                          </linearGradient>
                          <linearGradient id="taxAreaPphGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis
                          dataKey="monthShort"
                          tick={{ fontSize: 11, fill: '#475569' }}
                          axisLine={{ stroke: '#cbd5e1' }}
                          tickLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: '#475569' }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={(v) =>
                            v >= 1_000_000
                              ? `${(v / 1_000_000).toFixed(1)}jt`
                              : `${(v / 1000).toFixed(0)}rb`
                          }
                        />
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const row = payload[0]?.payload as (typeof annualAnalysis.buckets)[number];
                            if (!row) return null;
                            const activePpn =
                              ppnTrendMetric === 'NET' ? row.ppnNetPayable : row.ppnOutput;
                            return (
                              <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs space-y-1.5 min-w-[230px]">
                                <div className="font-bold text-slate-900 border-b border-slate-100 pb-1">
                                  {row.monthName} {selectedYear}
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-sky-700 font-semibold">
                                    PPN {ppnTrendMetric === 'NET' ? 'Kurang Bayar' : 'Keluaran'}
                                  </span>
                                  <span className="font-mono tabular-nums font-bold text-sky-700">
                                    {formatRupiah(activePpn)}
                                  </span>
                                </div>
                                {taxConfig.enablePpn && (
                                  <div className="text-[11px] text-slate-500 flex items-center justify-between gap-3">
                                    <span>Keluaran {formatRupiah(row.ppnOutput)}</span>
                                    <span>Masukan {formatRupiah(row.ppnInputEstimate)}</span>
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-emerald-700 font-semibold">PPh Final UMKM</span>
                                  <span className="font-mono tabular-nums font-bold text-emerald-700">
                                    {formatRupiah(row.pphFinalDue)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                                  <span className="font-bold text-slate-700">Total PPN + PPh Final</span>
                                  <span className="font-mono tabular-nums font-bold text-slate-900">
                                    {formatRupiah(activePpn + row.pphFinalDue)}
                                  </span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <RechartsLegend wrapperStyle={{ fontSize: '12px' }} />
                        <Area
                          type="monotone"
                          dataKey={ppnTrendMetric === 'NET' ? 'ppnNetPayable' : 'ppnOutput'}
                          name={
                            ppnTrendMetric === 'NET'
                              ? 'PPN Kurang Bayar (Netto)'
                              : 'PPN Keluaran (Bruto)'
                          }
                          stroke="#0284c7"
                          strokeWidth={2.5}
                          fill="url(#taxAreaPpnGrad)"
                          activeDot={{ r: 5 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="pphFinalDue"
                          name="PPh Final UMKM"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fill="url(#taxAreaPphGrad)"
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* SUB-TAB 1B: PPH BADAN & FASILITAS PASAL 31E */}
        {activeSubTab === 'PPH_BADAN_31E' && (
          <CorporateTax31EPanel
            transactions={transactions}
            products={products}
            cashflows={cashflows}
            taxRecords={taxRecords}
            storeSettings={storeSettings}
            taxConfig={taxConfig}
            selectedYear={selectedYear}
            availableYears={availableYears}
            onChangeYear={(yr) => setSelectedYear(yr)}
            preparedBy={currentUser.name}
            onUpdateTaxConfig={onUpdateTaxConfig}
            onOpenRecordModal={openCreateRecordModal}
            onNotice={(msg) => {
              setCsvExportNotice(msg);
              window.setTimeout(() => setCsvExportNotice(null), 5000);
            }}
          />
        )}

        {/* SUB-TAB 1C: ADJUSTMENT PAJAK, JURNAL & SIMULASI PPN LEBIH BAYAR */}
        {activeSubTab === 'ADJUSTMENT_VAT' && (
          <TaxAdjustmentAndVatPanel
            transactions={transactions}
            purchases={purchases}
            taxRecords={taxRecords}
            taxAdjustments={taxAdjustments}
            storeSettings={storeSettings}
            taxConfig={taxConfig}
            currentUser={currentUser}
            selectedYear={selectedYear}
            selectedMonthIndex={selectedMonthIndex}
            availableYears={availableYears}
            onChangePeriod={(yr, mIdx) => {
              setSelectedYear(yr);
              setSelectedMonthIndex(mIdx);
            }}
            onSaveTaxAdjustment={
              onSaveTaxAdjustment ||
              (() => {
                return undefined;
              })
            }
            onDeleteTaxAdjustment={
              onDeleteTaxAdjustment ||
              (() => {
                return undefined;
              })
            }
            onNotice={(msg) => {
              setCsvExportNotice(msg);
              window.setTimeout(() => setCsvExportNotice(null), 5000);
            }}
          />
        )}

        {/* SUB-TAB 2B: LOG AUDIT PAJAK KHUSUS */}
        {activeSubTab === 'AUDIT_LOG' && (
          <TaxAuditLogPanel
            taxAuditLogs={taxAuditLogs}
            storeName={storeSettings.storeName}
            onNotice={(msg) => {
              setCsvExportNotice(msg);
              window.setTimeout(() => setCsvExportNotice(null), 5000);
            }}
          />
        )}

        {/* SUB-TAB 2: ARSIP & SETORAN PAJAK */}
        {activeSubTab === 'RECORDS' && (
          <div className="space-y-4">
            {/* Filter Controls */}
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  {[
                    { id: 'ALL' as const, label: 'Semua Status' },
                    { id: 'BELUM_SETOR' as const, label: 'Belum Setor' },
                    { id: 'SUDAH_SETOR' as const, label: 'Sudah Setor' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        setRecordStatusFilter(s.id);
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                        recordStatusFilter === s.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <select
                  aria-label="Filter Jenis Pajak"
                  value={recordTypeFilter}
                  onChange={(e) => {
                    sound.playTap();
                    setRecordTypeFilter(e.target.value as 'ALL' | TaxRecordType);
                  }}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 cursor-pointer"
                >
                  <option value="ALL">Semua Jenis Pajak</option>
                  {Object.entries(TAX_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={recordSearch}
                  onChange={(e) => setRecordSearch(e.target.value)}
                  placeholder="Cari masa pajak, ID Billing, NTPN..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                />
                {recordSearch && (
                  <button
                    type="button"
                    onClick={() => setRecordSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Tax Filing / Payment Table */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Masa Pajak</th>
                      <th className="py-3 px-4">Jenis Pajak</th>
                      <th className="py-3 px-4 text-right">DPP / Omzet</th>
                      <th className="py-3 px-4 text-right">Tarif</th>
                      <th className="py-3 px-4 text-right">Pajak Terutang</th>
                      <th className="py-3 px-4 text-right">Sudah Dibayar</th>
                      <th className="py-3 px-4">ID Billing / NTPN</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTaxRecords.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-12 px-4 text-center text-slate-500">
                          <Receipt className="w-9 h-9 mx-auto mb-2 text-slate-300 stroke-1" />
                          <p className="font-semibold text-slate-700 text-sm">
                            Belum Ada Catatan Setoran Pajak
                          </p>
                          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                            Catat tagihan pajak bulanan, kode billing DJP, dan nomor NTPN setelah pembayaran agar riwayat perpajakan toko tersimpan rapi.
                          </p>
                          <button
                            type="button"
                            onClick={() => openCreateRecordModal()}
                            className="mt-3 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                          >
                            Catat Setoran Pertama
                          </button>
                        </td>
                      </tr>
                    ) : (
                      filteredTaxRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                            {rec.periodMonth}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900">{rec.taxTypeLabel}</div>
                            {rec.notes && (
                              <div className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                                {rec.notes}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatRupiah(rec.taxBaseAmount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {rec.taxRatePercent}%
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatRupiah(rec.taxAmountDue)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-700 whitespace-nowrap">
                            {formatRupiah(rec.paidAmount)}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                            <div>Billing: {rec.billingCode || '—'}</div>
                            <div>NTPN: {rec.ntpnCode || '—'}</div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs font-semibold ${
                                rec.status === 'SUDAH_SETOR'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {rec.status === 'SUDAH_SETOR' ? (
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                              ) : (
                                <Clock className="w-3 h-3 shrink-0" />
                              )}
                              <span>
                                {rec.status === 'SUDAH_SETOR' ? 'Sudah Setor' : 'Belum Setor'}
                              </span>
                            </span>
                            {rec.paidDate && (
                              <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                                {formatDateOnly(new Date(`${rec.paidDate}T12:00:00`).getTime())}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditRecordModal(rec)}
                                title="Edit catatan pajak"
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  sound.playTap();
                                  onDeleteTaxRecord(rec.id);
                                }}
                                title="Hapus catatan pajak"
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
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

            {/* Linked Finance Cashflows */}
            {taxCashflows.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-slate-900">
                  Pengeluaran Pajak Tercatat di Kas / Keuangan Toko ({taxCashflows.length})
                </h3>
                <div className="divide-y divide-slate-100 text-xs">
                  {taxCashflows.slice(0, 8).map((cf) => (
                    <div
                      key={cf.id}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 truncate">
                          {cf.description}
                        </div>
                        <div className="text-slate-500 font-mono tabular-nums">
                          {cf.date} · {cf.category} · {cf.paymentMethod}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums font-bold text-rose-700 shrink-0">
                        −{formatRupiah(cf.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUB-TAB 3: PROFIL & TARIF PAJAK */}
        {activeSubTab === 'SETTINGS' && (
          <form
            onSubmit={handleSaveTaxConfig}
            className="bg-white rounded-2xl border border-slate-200 p-4 md:p-6 space-y-5"
          >
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Konfigurasi Profil Wajib Pajak &amp; Tarif Berlaku
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Pengaturan ini disimpan secara permanen untuk menghitung kewajiban pajak toko setiap bulan.
              </p>
            </div>

            {configSavedNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{configSavedNotice}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Status Wajib Pajak Usaha
                </label>
                <select
                  value={configDraft.taxpayerStatus}
                  onChange={(e) => {
                    const status = e.target.value as TaxRegimeType;
                    setConfigDraft((prev) => ({
                      ...prev,
                      taxpayerStatus: status,
                      enablePphFinalUmkm:
                        status === 'UMKM_OP' || status === 'UMKM_BADAN'
                          ? true
                          : status === 'NON_PAJAK'
                          ? false
                          : prev.enablePphFinalUmkm,
                      enablePpn:
                        status === 'PKP_UMUM'
                          ? true
                          : status === 'UMKM_OP' || status === 'UMKM_BADAN' || status === 'NON_PAJAK'
                          ? false
                          : prev.enablePpn,
                    }));
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500"
                >
                  {Object.entries(REGIME_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Nama Wajib Pajak / Badan Usaha
                </label>
                <input
                  type="text"
                  value={configDraft.taxpayerName || ''}
                  onChange={(e) =>
                    setConfigDraft((prev) => ({ ...prev, taxpayerName: e.target.value }))
                  }
                  placeholder={storeSettings.storeName}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  NPWP / NITKU (15 atau 16 Digit)
                </label>
                <input
                  type="text"
                  value={configDraft.npwp || ''}
                  onChange={(e) => setConfigDraft((prev) => ({ ...prev, npwp: e.target.value }))}
                  placeholder="Contoh: 09.123.456.7-012.000"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Panduan Kewajiban PKP vs Non-PKP Berdasarkan Omzet Rp 4,8 Miliar */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div className="space-y-1">
                <div className="font-bold text-slate-900">
                  1. Non-PKP (Omzet ≤ Rp 4,8 Miliar / Tahun)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Usaha toko / petshop dengan peredaran bruto tidak lebih dari Rp 4,8 Miliar/tahun
                  berstatus Non-PKP dan hanya memiliki kewajiban <strong>PPh saja</strong>. Pemilik
                  usaha tetap dapat mengajukan PKP secara sukarela dengan mengaktifkan{' '}
                  <strong>PPN (Pengusaha Kena Pajak)</strong> di bawah ini.
                </p>
              </div>
              <div className="space-y-1">
                <div className="font-bold text-slate-900">
                  2. PKP (Omzet &gt; Rp 4,8 Miliar / PKP Sukarela)
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Jika omzet melampaui Rp 4,8 Miliar/tahun atau telah dikukuhkan sebagai PKP, wajib
                  melaksanakan <strong>pembukuan untuk kewajiban PPh</strong>, memungut &amp; membayar{' '}
                  <strong>PPN terutang</strong>, serta menerbitkan <strong>Faktur Pajak</strong> atas
                  transaksi barang &amp; jasa kena pajak.
                </p>
              </div>
            </div>

            {/* Tax Components Toggles */}
            <div className="pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* PPh Final UMKM */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-bold text-slate-900">PPh Final UMKM (PP 55/2022)</span>
                  <input
                    type="checkbox"
                    checked={Boolean(configDraft.enablePphFinalUmkm)}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({ ...prev, enablePphFinalUmkm: e.target.checked }))
                    }
                    className="w-4 h-4 accent-sky-600 cursor-pointer"
                  />
                </label>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Tarif PPh Final (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={configDraft.pphFinalRatePercent ?? 0.5}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        pphFinalRatePercent: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  />
                </div>
                {configDraft.taxpayerStatus === 'UMKM_OP' && (
                  <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={configDraft.applyUmkmOpThreshold500Jt !== false}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          applyUmkmOpThreshold500Jt: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 mt-0.5 accent-sky-600 cursor-pointer"
                    />
                    <span>Terapkan bebas pajak hingga omzet Rp 500 Juta/tahun (khusus WP Orang Pribadi)</span>
                  </label>
                )}
              </div>

              {/* PPN */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-bold text-slate-900">PPN (Pengusaha Kena Pajak)</span>
                  <input
                    type="checkbox"
                    checked={Boolean(configDraft.enablePpn)}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({ ...prev, enablePpn: e.target.checked }))
                    }
                    className="w-4 h-4 accent-sky-600 cursor-pointer"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Tarif PPN (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={configDraft.ppnRatePercent ?? 11}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          ppnRatePercent: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Basis Harga</label>
                    <select
                      value={configDraft.ppnMode || 'INCLUSIVE'}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          ppnMode: e.target.value as TaxCalculationMode,
                        }))
                      }
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                    >
                      <option value="INCLUSIVE">Inklusif</option>
                      <option value="EXCLUSIVE">Eksklusif</option>
                    </select>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configDraft.deductInputVatFromPurchases !== false}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        deductInputVatFromPurchases: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 mt-0.5 accent-sky-600 cursor-pointer"
                  />
                  <span>Kurangi estimasi PPN Masukan dari PO Pembelian Selesai</span>
                </label>
              </div>

              {/* PB1 & Options */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                <label className="flex items-center justify-between gap-2 cursor-pointer">
                  <span className="text-xs font-bold text-slate-900">Pajak Daerah / PB1 Resto</span>
                  <input
                    type="checkbox"
                    checked={Boolean(configDraft.enablePb1)}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({ ...prev, enablePb1: e.target.checked }))
                    }
                    className="w-4 h-4 accent-sky-600 cursor-pointer"
                  />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Tarif PB1 (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={configDraft.pb1RatePercent ?? 10}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          pb1RatePercent: parseFloat(e.target.value) || 0,
                        }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Jatuh Tempo (Tgl)</label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={configDraft.monthlyDueDay ?? 15}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          monthlyDueDay: parseInt(e.target.value, 10) || 15,
                        }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Pengingat (H-Hari)</label>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={configDraft.dueReminderDaysBefore ?? 7}
                      onChange={(e) =>
                        setConfigDraft((prev) => ({
                          ...prev,
                          dueReminderDaysBefore: parseInt(e.target.value, 10) || 7,
                        }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                    />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-xs text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configDraft.excludeCashWithdrawalPrincipal !== false}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        excludeCashWithdrawalPrincipal: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 mt-0.5 accent-sky-600 cursor-pointer"
                  />
                  <span>Kecualikan pokok uang Tarik Tunai dari omzet kena pajak (hanya hitung biaya admin)</span>
                </label>
              </div>
            </div>

            {/* PPh Badan Pasal 17 & Fasilitas Pasal 31E */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(configDraft.enablePphBadan31E)}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({ ...prev, enablePphBadan31E: e.target.checked }))
                    }
                    className="w-4 h-4 accent-sky-600 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-900">
                    Aktifkan Pelaporan PPh Badan (Pasal 17 UU HPP &amp; Fasilitas Pasal 31E)
                  </span>
                </label>
                <span className="text-[11px] text-slate-500">
                  Fasilitas diskon tarif 50% (11%) untuk bagian omzet ≤ Rp 4,8 Miliar (maks. omzet Rp 50 Miliar)
                </span>
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={configDraft.applyPasal31EFacility !== false}
                  onChange={(e) =>
                    setConfigDraft((prev) => ({ ...prev, applyPasal31EFacility: e.target.checked }))
                  }
                  className="w-4 h-4 mt-0.5 accent-emerald-600 cursor-pointer"
                />
                <span>
                  Terapkan fasilitas pengurangan tarif 50% Pasal 31E (tarif{' '}
                  <strong>
                    {Number(((configDraft.pphBadanRatePercent ?? 22) * 0.5).toFixed(2))}%
                  </strong>{' '}
                  untuk omzet bruto ≤ Rp 4,8 Miliar) secara default saat menghitung PPh Badan
                </span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Tarif Umum PPh Badan (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={configDraft.pphBadanRatePercent ?? 22}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        pphBadanRatePercent: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Default Koreksi Fiskal Netto (Rp)
                  </label>
                  <input
                    type="number"
                    value={configDraft.pphBadanFiscalAdjustment ?? 0}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        pphBadanFiscalAdjustment: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">
                    Kompensasi Rugi Fiskal (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={configDraft.pphBadanLossCompensation ?? 0}
                    onChange={(e) =>
                      setConfigDraft((prev) => ({
                        ...prev,
                        pphBadanLossCompensation: parseFloat(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Alasan / Catatan Audit Perubahan Konfigurasi (Opsional)
                </label>
                <input
                  type="text"
                  value={configAuditReason}
                  onChange={(e) => setConfigAuditReason(e.target.value)}
                  placeholder="Contoh: Penyesuaian status PKP per SK KPP atau penyesuaian tarif PPN 11%"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Save className="w-4 h-4 text-sky-400" />
                <span>Simpan Pengaturan Pajak</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Modal Catat / Edit Setoran Pajak */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-bold">
                  {editingRecord ? 'Edit Catatan Pajak' : 'Catat Tagihan / Setoran Pajak'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRecordModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecordSubmit} className="p-5 space-y-3.5 text-xs">
              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Masa Pajak (Bulan)</label>
                  <input
                    type="month"
                    value={recordForm.periodMonth}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, periodMonth: e.target.value }))
                    }
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jenis Pajak</label>
                  <select
                    value={recordForm.taxType}
                    onChange={(e) => {
                      const nextType = e.target.value as TaxRecordType;
                      setRecordForm((prev) => ({
                        ...prev,
                        taxType: nextType,
                        taxTypeLabel: TAX_TYPE_LABELS[nextType],
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                  >
                    {Object.entries(TAX_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">DPP / Omzet (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={recordForm.taxBaseAmount}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, taxBaseAmount: e.target.value }))
                    }
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tarif (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={recordForm.taxRatePercent}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, taxRatePercent: e.target.value }))
                    }
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Terutang (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={recordForm.taxAmountDue}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, taxAmountDue: e.target.value }))
                    }
                    required
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status Pembayaran</label>
                  <select
                    value={recordForm.status}
                    onChange={(e) =>
                      setRecordForm((prev) => ({
                        ...prev,
                        status: e.target.value as TaxRecordStatus,
                      }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                  >
                    <option value="SUDAH_SETOR">Sudah Setor (Lunas)</option>
                    <option value="BELUM_SETOR">Belum Setor (Tagihan)</option>
                  </select>
                </div>

                {recordForm.status === 'SUDAH_SETOR' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nominal Dibayar (Rp)</label>
                    <input
                      type="number"
                      min="0"
                      value={recordForm.paidAmount}
                      onChange={(e) =>
                        setRecordForm((prev) => ({ ...prev, paidAmount: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-emerald-700"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kode Billing DJP</label>
                  <input
                    type="text"
                    value={recordForm.billingCode}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, billingCode: e.target.value }))
                    }
                    placeholder="Opsional (15 digit ID Billing)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nomor NTPN</label>
                  <input
                    type="text"
                    value={recordForm.ntpnCode}
                    onChange={(e) =>
                      setRecordForm((prev) => ({ ...prev, ntpnCode: e.target.value }))
                    }
                    placeholder="Bukti Penerimaan Negara"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
              </div>

              {recordForm.status === 'SUDAH_SETOR' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tanggal Setor</label>
                    <input
                      type="date"
                      value={recordForm.paidDate}
                      onChange={(e) =>
                        setRecordForm((prev) => ({ ...prev, paidDate: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Sumber Dana / Bank</label>
                    <select
                      value={recordForm.paymentMethod}
                      onChange={(e) =>
                        setRecordForm((prev) => ({ ...prev, paymentMethod: e.target.value }))
                      }
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                    >
                      <option value="TRANSFER_BCA">Transfer Bank / BCA</option>
                      <option value="CASH">Kas Tunai Toko</option>
                      <option value="QRIS">QRIS / e-Wallet</option>
                      <option value="LAINNYA">Lainnya</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan</label>
                <input
                  type="text"
                  value={recordForm.notes}
                  onChange={(e) => setRecordForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Contoh: Lapor via Coretax / DJP Online"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
              </div>

              {recordForm.status === 'SUDAH_SETOR' && !editingRecord?.linkedCashflowId && (
                <label className="flex items-start gap-2 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoRecordCashflow}
                    onChange={(e) => setAlsoRecordCashflow(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-sky-600 cursor-pointer"
                  />
                  <span>
                    Catat otomatis sebagai <strong>Pengeluaran Keuangan</strong> (Kategori:{' '}
                    <em>Pajak, Iuran &amp; Retribusi</em>) agar saldo kas &amp; laba bersih tetap akurat.
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  Simpan Catatan Pajak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
