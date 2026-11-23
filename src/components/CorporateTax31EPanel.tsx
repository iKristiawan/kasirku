import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Calculator,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Landmark,
  Plus,
  RotateCcw,
  Save,
  TrendingDown,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CashflowRecord,
  Product,
  StoreSettings,
  TaxConfig,
  TaxRecord,
  TaxRecordType,
  Transaction,
} from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  calculatePphBadan31E,
  computeAnnualStoreBookkeepingMetrics,
  exportCorporateTax31EExcel,
  PPH_31E_FACILITY_TURNOVER,
  PPH_31E_REVENUE_CAP,
  PPH_BADAN_GENERAL_RATE,
} from '../utils/taxUtils';
import { exportCorporateTax31EPdf } from '../utils/taxPdfExport';

interface CorporateTax31EPanelProps {
  transactions: Transaction[];
  products: Product[];
  cashflows: CashflowRecord[];
  taxRecords: TaxRecord[];
  storeSettings: StoreSettings;
  taxConfig: TaxConfig;
  selectedYear: number;
  availableYears: number[];
  onChangeYear: (year: number) => void;
  preparedBy: string;
  onUpdateTaxConfig: (nextConfig: TaxConfig) => Promise<void> | void;
  onOpenRecordModal: (prefill: {
    periodMonth?: string;
    taxType?: TaxRecordType;
    taxBaseAmount?: number;
    taxRatePercent?: number;
    taxAmountDue?: number;
    notes?: string;
  }) => void;
  onNotice: (message: string) => void;
}

export const CorporateTax31EPanel: React.FC<CorporateTax31EPanelProps> = ({
  transactions,
  products,
  cashflows,
  taxRecords,
  storeSettings,
  taxConfig,
  selectedYear,
  availableYears,
  onChangeYear,
  preparedBy,
  onUpdateTaxConfig,
  onOpenRecordModal,
  onNotice,
}) => {
  const [dataSourceMode, setDataSourceMode] = useState<'AUTO_POS' | 'PROJECTED_12M' | 'MANUAL'>(
    'AUTO_POS'
  );

  const bookkeeping = useMemo(
    () =>
      computeAnnualStoreBookkeepingMetrics({
        transactions,
        products,
        cashflows,
        taxRecords,
        year: selectedYear,
        excludeWithdrawalPrincipal: taxConfig.excludeCashWithdrawalPrincipal !== false,
      }),
    [transactions, products, cashflows, taxRecords, selectedYear, taxConfig.excludeCashWithdrawalPrincipal]
  );

  // Manual simulation overrides (initialized from actual POS bookkeeping)
  const [manualTurnover, setManualTurnover] = useState<string>(String(bookkeeping.annualTurnover));
  const [manualCogs, setManualCogs] = useState<string>(String(bookkeeping.annualCogsFifo));
  const [manualOpex, setManualOpex] = useState<string>(
    String(bookkeeping.operatingExpensesDeductible)
  );
  const [manualOtherIncome, setManualOtherIncome] = useState<string>(
    String(bookkeeping.otherBusinessIncome)
  );

  // Shared fiscal & credit inputs (apply in both Auto and Manual modes)
  const [generalRateInput, setGeneralRateInput] = useState<string>(
    String(taxConfig.pphBadanRatePercent ?? PPH_BADAN_GENERAL_RATE)
  );
  const [fiscalAdjInput, setFiscalAdjInput] = useState<string>(
    String(taxConfig.pphBadanFiscalAdjustment ?? 0)
  );
  const [lossCompInput, setLossCompInput] = useState<string>(
    String(taxConfig.pphBadanLossCompensation ?? 0)
  );
  const [extraTaxCreditInput, setExtraTaxCreditInput] = useState<string>('0');
  const [apply31EFacility, setApply31EFacility] = useState<boolean>(
    taxConfig.applyPasal31EFacility !== false
  );
  const [isSavingFiscal, setIsSavingFiscal] = useState<boolean>(false);

  // Sync manual defaults when switching year while in AUTO_POS
  useEffect(() => {
    if (dataSourceMode === 'AUTO_POS') {
      setManualTurnover(String(bookkeeping.annualTurnover));
      setManualCogs(String(bookkeeping.annualCogsFifo));
      setManualOpex(String(bookkeeping.operatingExpensesDeductible));
      setManualOtherIncome(String(bookkeeping.otherBusinessIncome));
    }
  }, [bookkeeping, dataSourceMode]);

  useEffect(() => {
    setGeneralRateInput(String(taxConfig.pphBadanRatePercent ?? PPH_BADAN_GENERAL_RATE));
    setFiscalAdjInput(String(taxConfig.pphBadanFiscalAdjustment ?? 0));
    setLossCompInput(String(taxConfig.pphBadanLossCompensation ?? 0));
    setApply31EFacility(taxConfig.applyPasal31EFacility !== false);
  }, [
    taxConfig.pphBadanRatePercent,
    taxConfig.pphBadanFiscalAdjustment,
    taxConfig.pphBadanLossCompensation,
    taxConfig.applyPasal31EFacility,
  ]);

  const projectionScale =
    dataSourceMode === 'PROJECTED_12M' && bookkeeping.txCount > 0
      ? 12 / bookkeeping.activeMonthsCount
      : 1;

  const activeTurnover =
    dataSourceMode === 'MANUAL'
      ? Math.max(0, parseFloat(manualTurnover) || 0)
      : Math.round(bookkeeping.annualTurnover * projectionScale);
  const activeCogs =
    dataSourceMode === 'MANUAL'
      ? Math.max(0, parseFloat(manualCogs) || 0)
      : Math.round(bookkeeping.annualCogsFifo * projectionScale);
  const activeOpex =
    dataSourceMode === 'MANUAL'
      ? Math.max(0, parseFloat(manualOpex) || 0)
      : Math.round(bookkeeping.operatingExpensesDeductible * projectionScale);
  const activeOtherIncome =
    dataSourceMode === 'MANUAL'
      ? Math.max(0, parseFloat(manualOtherIncome) || 0)
      : Math.round(bookkeeping.otherBusinessIncome * projectionScale);

  const extraCredits = Math.max(0, parseFloat(extraTaxCreditInput) || 0);
  const totalTaxCredits =
    (dataSourceMode !== 'MANUAL' ? bookkeeping.recordedPphBadanCredits : 0) + extraCredits;

  const result = useMemo(
    () =>
      calculatePphBadan31E({
        grossTurnover: activeTurnover,
        cogsAmount: activeCogs,
        operatingExpenses: activeOpex,
        otherBusinessIncome: activeOtherIncome,
        fiscalAdjustmentNet: parseFloat(fiscalAdjInput) || 0,
        lossCompensation: Math.max(0, parseFloat(lossCompInput) || 0),
        generalRatePercent: Math.max(0, parseFloat(generalRateInput) || PPH_BADAN_GENERAL_RATE),
        applyPasal31EFacility: apply31EFacility,
        taxCreditsPaid: totalTaxCredits,
        pphFinalRatePercent: Number(taxConfig.pphFinalRatePercent ?? 0.5),
      }),
    [
      activeTurnover,
      activeCogs,
      activeOpex,
      activeOtherIncome,
      fiscalAdjInput,
      lossCompInput,
      generalRateInput,
      apply31EFacility,
      totalTaxCredits,
      taxConfig.pphFinalRatePercent,
    ]
  );

  const sourceLabel =
    dataSourceMode === 'AUTO_POS'
      ? `Pembukuan POS Aktual (${formatNumber(bookkeeping.txCount)} Trx)`
      : dataSourceMode === 'PROJECTED_12M'
      ? `Proyeksi 12 Bulan (Rata-rata ${bookkeeping.activeMonthsCount} Bulan Aktif × 12)`
      : 'Simulasi / Input Manual';

  const applyScenarioPreset = (preset: 'POS' | 'UNDER_48M' | 'MID_12B' | 'OVER_50B') => {
    sound.playTap();
    if (preset === 'POS') {
      setDataSourceMode('AUTO_POS');
      setManualTurnover(String(bookkeeping.annualTurnover));
      setManualCogs(String(bookkeeping.annualCogsFifo));
      setManualOpex(String(bookkeeping.operatingExpensesDeductible));
      setManualOtherIncome(String(bookkeeping.otherBusinessIncome));
      return;
    }
    setDataSourceMode('MANUAL');
    if (preset === 'UNDER_48M') {
      setManualTurnover('3600000000');
      setManualCogs('2520000000');
      setManualOpex('540000000');
      setManualOtherIncome('0');
    } else if (preset === 'MID_12B') {
      setManualTurnover('12000000000');
      setManualCogs('8400000000');
      setManualOpex('1800000000');
      setManualOtherIncome('0');
    } else if (preset === 'OVER_50B') {
      setManualTurnover('55000000000');
      setManualCogs('38500000000');
      setManualOpex('8250000000');
      setManualOtherIncome('0');
    }
  };

  const handleSaveFiscalDefaults = async () => {
    sound.playTap();
    setIsSavingFiscal(true);
    try {
      await onUpdateTaxConfig({
        ...taxConfig,
        enablePphBadan31E: true,
        applyPasal31EFacility: apply31EFacility,
        pphBadanRatePercent: Math.max(
          0,
          Math.min(100, parseFloat(generalRateInput) || PPH_BADAN_GENERAL_RATE)
        ),
        pphBadanFiscalAdjustment: Math.round(parseFloat(fiscalAdjInput) || 0),
        pphBadanLossCompensation: Math.max(0, Math.round(parseFloat(lossCompInput) || 0)),
      });
      onNotice('Parameter tarif PPh Badan, opsi Pasal 31E & penyesuaian fiskal berhasil disimpan.');
    } finally {
      setIsSavingFiscal(false);
    }
  };

  const handleExportPdf = () => {
    sound.playTap();
    const filename = exportCorporateTax31EPdf({
      storeSettings,
      taxConfig,
      year: selectedYear,
      sourceLabel,
      preparedBy,
      result,
    });
    onNotice(`Kertas kerja PDF PPh Badan "${filename}" berhasil diunduh.`);
  };

  const handleExportExcel = () => {
    sound.playTap();
    const filename = exportCorporateTax31EExcel({
      storeSettings,
      taxConfig,
      year: selectedYear,
      sourceLabel,
      result,
    });
    onNotice(`Kertas kerja Excel "${filename}" berhasil diunduh.`);
  };

  const facilityEffectiveRatePercent =
    result.taxableIncomePkp > 0
      ? Number(((result.withFacility31EDue / result.taxableIncomePkp) * 100).toFixed(2))
      : result.facilityRatePercent;

  const chartData = useMemo(
    () => [
      {
        name: `Tarif Normal (${result.generalRatePercent}%)`,
        amount: result.normalRatePphBadanDue,
        fill: '#64748b',
      },
      {
        name: result.isEligibleUnder48M
          ? `Pasal 31E (${result.facilityRatePercent}%)`
          : 'Pasal 31E (Proporsional)',
        amount: result.withFacility31EDue,
        fill: '#0284c7',
      },
      {
        name: result.applyPasal31EFacility ? 'Terutang (31E Aktif)' : 'Terutang (Tarif Normal)',
        amount: result.totalPphBadanDue,
        fill: '#0f172a',
      },
      {
        name: 'Penghematan 31E',
        amount: result.potentialSavings31E,
        fill: '#10b981',
      },
    ],
    [result]
  );

  return (
    <div className="space-y-4">
      {/* Control Strip: Mode Selector, Year, Actions */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 flex-wrap">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setDataSourceMode('AUTO_POS');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                dataSourceMode === 'AUTO_POS'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Aktual POS (YTD)
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setDataSourceMode('PROJECTED_12M');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                dataSourceMode === 'PROJECTED_12M'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title={`Proyeksikan laju omzet & laba dari ${bookkeeping.activeMonthsCount} bulan aktif menjadi setahun penuh (12 bulan)`}
            >
              Proyeksi 12 Bulan
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setDataSourceMode('MANUAL');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                dataSourceMode === 'MANUAL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Simulasi / Input Manual
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="pph-badan-year" className="text-xs font-semibold text-slate-600">
              Tahun Pajak:
            </label>
            <select
              id="pph-badan-year"
              value={selectedYear}
              onChange={(e) => {
                sound.playTap();
                onChangeYear(Number(e.target.value));
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold font-mono tabular-nums text-slate-900 cursor-pointer focus:outline-none focus:border-sky-500"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel Kertas Kerja</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF PPh Badan ({selectedYear})</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onOpenRecordModal({
                periodMonth: `${selectedYear}-12`,
                taxType: 'PPH_BADAN',
                taxBaseAmount: result.taxableIncomePkp,
                taxRatePercent: result.effectiveTaxRateOnPkp || result.facilityRatePercent,
                taxAmountDue:
                  result.pph29Underpayment > 0 ? result.pph29Underpayment : result.totalPphBadanDue,
                notes: `Setoran PPh Badan Pasal 17/31E Tahun Pajak ${selectedYear}`,
              })
            }
            className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5 text-sky-400" />
            <span>Catat Setor PPh Badan</span>
          </button>
        </div>
      </div>

      {/* Opsi Penerapan Fasilitas Pasal 31E (Diskon 50% Tarif Pajak) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-sm font-bold text-slate-900 flex items-center gap-2 flex-wrap">
            <span>Skema Tarif PPh Badan:</span>
            <span
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                result.isEligibleUnder48M
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : result.isEligible31EByRevenue
                  ? 'bg-sky-50 text-sky-800 border border-sky-200'
                  : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}
            >
              {result.grossTurnover <= 0
                ? 'Menunggu Omzet'
                : result.isEligibleUnder48M
                ? `Omzet ≤ Rp 4,8 M · Layak Diskon 50% (${result.facilityRatePercent}%)`
                : result.isEligible31EByRevenue
                ? 'Omzet Rp 4,8 M – 50 M · Layak 31E Proporsional'
                : `Omzet > Rp 50 M · Tarif Normal ${result.generalRatePercent}%`}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Bandingkan perhitungan dengan diskon tarif 50% Pasal 31E ({result.facilityRatePercent}%
            untuk omzet s.d. Rp 4,8 M) terhadap tarif normal Pasal 17 ({result.generalRatePercent}%).
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setApply31EFacility(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              apply31EFacility
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Terapkan Fasilitas 31E (Diskon 50% · {result.facilityRatePercent}%)
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setApply31EFacility(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              !apply31EFacility
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tarif Normal Pasal 17 ({result.generalRatePercent}%)
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500">
            Peredaran Bruto ({selectedYear})
          </div>
          <div className="text-lg md:text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatRupiah(result.grossTurnover)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            {result.bracketTier === 'FULL_31E'
              ? '≤ Rp 4,8 M (100% Fasilitas 31E)'
              : result.bracketTier === 'PROPORTIONAL_31E'
              ? `Proporsi 31E: ${(result.facilityShareRatio * 100).toFixed(1)}%`
              : result.bracketTier === 'GENERAL_22'
              ? `Tarif Normal ${result.generalRatePercent}%`
              : 'Belum ada omzet kena pajak'}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500">
            Laba Fiskal / PKP (Dibulatkan)
          </div>
          <div className="text-lg md:text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatRupiah(result.taxableIncomePkp)}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            Laba Komersial {formatRupiah(result.commercialNetProfit)} ({result.netMarginPercent}%)
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-sky-700">
            {result.applyPasal31EFacility
              ? 'PPh Badan Terutang (31E)'
              : `PPh Badan Tarif Normal (${result.generalRatePercent}%)`}
          </div>
          <div className="text-lg md:text-xl font-bold font-mono tabular-nums text-sky-700 mt-1">
            {formatRupiah(result.totalPphBadanDue)}
          </div>
          <div className="text-xs text-emerald-700 font-semibold mt-1 tabular-nums">
            {result.taxSavingsFrom31E > 0
              ? `Hemat ${formatRupiah(result.taxSavingsFrom31E)} vs ${result.generalRatePercent}%`
              : result.potentialSavings31E > 0
              ? `Potensi hemat 31E: ${formatRupiah(result.potentialSavings31E)}`
              : `Tarif efektif ${result.effectiveTaxRateOnPkp}% dari PKP`}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-amber-700">
            {result.pph28aOverpayment > 0
              ? 'PPh Pasal 28A (Lebih Bayar)'
              : 'PPh Pasal 29 (Kurang Bayar)'}
          </div>
          <div
            className={`text-lg md:text-xl font-bold font-mono tabular-nums mt-1 ${
              result.pph28aOverpayment > 0
                ? 'text-emerald-700'
                : result.pph29Underpayment > 0
                ? 'text-amber-700'
                : 'text-slate-900'
            }`}
          >
            {formatRupiah(
              result.pph28aOverpayment > 0
                ? result.pph28aOverpayment
                : result.pph29Underpayment
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">
            Est. PPh 25/bln: {formatRupiah(result.estimatedMonthlyPph25)}
          </div>
        </div>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT (7 cols): Fiscal Reconciliation & Article 31E Calculation Breakdown */}
        <div className="lg:col-span-7 space-y-4">
          {/* Tier Status Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
                  <span>Kertas Kerja PPh Badan &amp; Fasilitas Pasal 31E UU PPh</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{result.bracketLabel}</p>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold text-slate-700 shrink-0">
                Tarif Efektif: {result.effectiveTaxRateOnPkp}% PKP
              </span>
            </div>

            {/* 3-Tier Visual Bracket Selector Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div
                className={`p-2.5 rounded-xl border ${
                  result.bracketTier === 'FULL_31E'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="font-bold">1. Omzet ≤ Rp 4,8 M</div>
                <div className="mt-0.5">100% Fasilitas 31E ({result.facilityRatePercent}%)</div>
              </div>
              <div
                className={`p-2.5 rounded-xl border ${
                  result.bracketTier === 'PROPORTIONAL_31E'
                    ? 'bg-sky-50 border-sky-300 text-sky-900'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="font-bold">2. Rp 4,8 M – Rp 50 M</div>
                <div className="mt-0.5">
                  Proporsional 31E ({result.facilityRatePercent}% &amp; {result.generalRatePercent}%)
                </div>
              </div>
              <div
                className={`p-2.5 rounded-xl border ${
                  result.bracketTier === 'GENERAL_22'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-slate-50 border-slate-200 text-slate-500'
                }`}
              >
                <div className="font-bold">3. Omzet &gt; Rp 50 M</div>
                <div className="mt-0.5">Tarif Umum Penuh ({result.generalRatePercent}%)</div>
              </div>
            </div>

            {/* Part I: Commercial to Fiscal Reconciliation */}
            <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
              <div className="font-bold text-slate-800">
                I. Rekonsiliasi Laba Komersial ke Penghasilan Kena Pajak (PKP)
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Peredaran Bruto / Omzet Usaha ({selectedYear})</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatRupiah(result.grossTurnover)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-rose-700">
                  <span>Dikurangi: Harga Pokok Penjualan (HPP / COGS)</span>
                  <span className="font-mono tabular-nums font-semibold">
                    −{formatRupiah(result.cogsAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 font-semibold text-slate-900">
                  <span>Laba Kotor Usaha</span>
                  <span className="font-mono tabular-nums">{formatRupiah(result.grossProfit)}</span>
                </div>
                {result.otherBusinessIncome > 0 && (
                  <div className="flex items-center justify-between text-emerald-700">
                    <span>Ditambah: Pendapatan Usaha Lainnya (Non-Final)</span>
                    <span className="font-mono tabular-nums font-semibold">
                      +{formatRupiah(result.otherBusinessIncome)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between text-rose-700">
                  <span>Dikurangi: Beban Operasional Usaha (Deductible)</span>
                  <span className="font-mono tabular-nums font-semibold">
                    −{formatRupiah(result.operatingExpenses)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-100 font-bold text-slate-900">
                  <span>Laba (Rugi) Bersih Komersial (Net Margin {result.netMarginPercent}%)</span>
                  <span
                    className={`font-mono tabular-nums ${
                      result.commercialNetProfit < 0 ? 'text-rose-700' : 'text-slate-900'
                    }`}
                  >
                    {result.commercialNetProfit < 0
                      ? `−${formatRupiah(Math.abs(result.commercialNetProfit))}`
                      : formatRupiah(result.commercialNetProfit)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Koreksi Fiskal Netto (Pasal 6 &amp; 9 UU PPh)</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {result.fiscalAdjustmentNet >= 0
                      ? `+${formatRupiah(result.fiscalAdjustmentNet)}`
                      : `−${formatRupiah(Math.abs(result.fiscalAdjustmentNet))}`}
                  </span>
                </div>
                {result.lossCompensation > 0 && (
                  <div className="flex items-center justify-between text-slate-600">
                    <span>Dikurangi: Kompensasi Kerugian Fiskal Tahun Lalu</span>
                    <span className="font-mono tabular-nums font-semibold">
                      −{formatRupiah(result.lossCompensation)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200 font-bold text-slate-900 text-sm">
                  <span>Penghasilan Kena Pajak (PKP) — Dibulatkan Ribuan</span>
                  <span className="font-mono tabular-nums text-sky-700">
                    {formatRupiah(result.taxableIncomePkp)}
                  </span>
                </div>
              </div>

              {dataSourceMode === 'AUTO_POS' && bookkeeping.recordedTaxOutflowNonDeductible > 0 && (
                <p className="text-[11px] text-slate-500 pt-1">
                  Catatan: Pengeluaran setoran pajak/PPh sebesar{' '}
                  <strong className="font-mono tabular-nums text-slate-700">
                    {formatRupiah(bookkeeping.recordedTaxOutflowNonDeductible)}
                  </strong>{' '}
                  di menu Keuangan otomatis dikecualikan dari beban operasional sesuai Pasal 9 ayat (1)
                  huruf h UU PPh (non-deductible).
                </p>
              )}
            </div>

            {/* Part II: Pasal 17 & Pasal 31E Layer Breakdown */}
            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="font-bold text-slate-800">
                II. Lapisan Perhitungan Tarif Pasal 17 &amp; Fasilitas Pasal 31E
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Komponen Tarif PPh Badan</th>
                      <th className="py-2.5 px-3 text-right">PKP / Dasar</th>
                      <th className="py-2.5 px-3 text-center">Tarif</th>
                      <th className="py-2.5 px-3 text-right">PPh Terutang</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-emerald-800">
                          Bagian PKP Mendapat Fasilitas Pasal 31E
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {result.bracketTier === 'FULL_31E'
                            ? '100% × PKP (Omzet ≤ Rp 4,8 Miliar)'
                            : result.bracketTier === 'PROPORTIONAL_31E'
                            ? `(Rp 4,8 M ÷ ${formatRupiah(result.grossTurnover)}) × ${formatRupiah(
                                result.taxableIncomePkp
                              )} = ${(result.facilityShareRatio * 100).toFixed(2)}%`
                            : result.bracketTier === 'GENERAL_22'
                            ? 'Tidak berhak fasilitas (Omzet > Rp 50 Miliar)'
                            : 'PKP Nihil / Rugi Fiskal'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                        {formatRupiah(result.facilityTaxableIncome)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums font-semibold text-emerald-700">
                        {result.facilityRatePercent}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {formatRupiah(result.pphFacilityDue)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">
                          Bagian PKP Tidak Mendapat Fasilitas
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          PKP Total − PKP Fasilitas 31E
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                        {formatRupiah(result.nonFacilityTaxableIncome)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums font-semibold text-sky-700">
                        {result.generalRatePercent}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-sky-700">
                        {formatRupiah(result.pphNonFacilityDue)}
                      </td>
                    </tr>
                    <tr className="bg-slate-50 font-bold text-slate-900">
                      <td className="py-2.5 px-3">Total PPh Badan Terutang Setahun</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {formatRupiah(result.taxableIncomePkp)}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums">
                        {result.effectiveTaxRateOnPkp}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sm">
                        {formatRupiah(result.totalPphBadanDue)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {result.taxSavingsFrom31E > 0 && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2 text-emerald-900">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      Penghematan pajak berkat fasilitas Pasal 31E (vs tarif normal {result.generalRatePercent}%{' '}
                      senilai {formatRupiah(result.normalRatePphBadanDue)})
                    </span>
                  </div>
                  <span className="font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                    {formatRupiah(result.taxSavingsFrom31E)}
                  </span>
                </div>
              )}
            </div>

            {/* Part III: Direct Comparison Fasilitas Pasal 31E vs Tarif Normal */}
            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="font-bold text-slate-800">
                  III. Perbandingan Langsung: Fasilitas Pasal 31E vs Tarif Normal ({result.generalRatePercent}%)
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {result.isEligibleUnder48M
                    ? 'Omzet ≤ Rp 4,8 M · Diskon 50% Berlaku Penuh'
                    : result.isEligible31EByRevenue
                    ? 'Omzet ≤ Rp 50 M · Diskon 50% Proporsional'
                    : 'Omzet > Rp 50 M · Tanpa Fasilitas 31E'}
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Indikator Perbandingan</th>
                      <th className="py-2.5 px-3 text-right text-emerald-800">
                        Fasilitas Pasal 31E
                      </th>
                      <th className="py-2.5 px-3 text-right text-slate-700">
                        Tarif Normal ({result.generalRatePercent}%)
                      </th>
                      <th className="py-2.5 px-3 text-right text-sky-800">
                        Selisih / Hemat
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        Tarif Efektif pada PKP
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {result.isEligible31EByRevenue ? `${facilityEffectiveRatePercent}%` : `${result.generalRatePercent}%`}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-700">
                        {result.generalRatePercent}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-sky-700">
                        {result.isEligible31EByRevenue
                          ? `−${(result.generalRatePercent - facilityEffectiveRatePercent).toFixed(2)}%`
                          : '0%'}
                      </td>
                    </tr>
                    <tr className="bg-emerald-50/40">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        PPh Badan Terutang Setahun
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {formatRupiah(result.withFacility31EDue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-800">
                        {formatRupiah(result.normalRatePphBadanDue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                        {result.potentialSavings31E > 0
                          ? `Hemat ${formatRupiah(result.potentialSavings31E)} (${result.potentialSavingsPercent}%)`
                          : formatRupiah(0)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        Kurang Bayar SPT (PPh Pasal 29)
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatRupiah(result.withFacility31EPph29Underpayment)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-700">
                        {formatRupiah(result.normalRatePph29Underpayment)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-sky-700">
                        {formatRupiah(
                          Math.max(
                            0,
                            result.normalRatePph29Underpayment - result.withFacility31EPph29Underpayment
                          )
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-slate-700 font-medium">
                        Estimasi Angsuran PPh 25 / Bulan
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {formatRupiah(result.withFacility31EMonthlyPph25)}/bln
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-700">
                        {formatRupiah(result.normalRateMonthlyPph25)}/bln
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-sky-700">
                        {formatRupiah(
                          Math.max(
                            0,
                            result.normalRateMonthlyPph25 - result.withFacility31EMonthlyPph25
                          )
                        )}
                        /bln
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Part IV: Tax Credit & PPh 25 / 29 */}
            <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
              <div className="font-bold text-slate-800">
                IV. Kredit Pajak &amp; Kurang/Lebih Bayar SPT Tahunan (PPh Pasal 29 / 25) — Skema Aktif
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Kredit Pajak (PPh 25/22/23)</div>
                  <div className="font-mono tabular-nums font-bold text-slate-900 text-sm mt-0.5">
                    {formatRupiah(result.taxCreditsPaid)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">
                    {result.pph28aOverpayment > 0 ? 'PPh 28A (Lebih Bayar)' : 'PPh 29 (Kurang Bayar)'}
                  </div>
                  <div
                    className={`font-mono tabular-nums font-bold text-sm mt-0.5 ${
                      result.pph28aOverpayment > 0
                        ? 'text-emerald-700'
                        : result.pph29Underpayment > 0
                        ? 'text-amber-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {formatRupiah(
                      result.pph28aOverpayment > 0
                        ? result.pph28aOverpayment
                        : result.pph29Underpayment
                    )}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-slate-500">Est. Angsuran PPh 25 / Bln</div>
                  <div className="font-mono tabular-nums font-bold text-sky-700 text-sm mt-0.5">
                    {formatRupiah(result.estimatedMonthlyPph25)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Chart Visual Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Perbandingan Visual: Tarif Normal {result.generalRatePercent}% vs Fasilitas Pasal 31E ({selectedYear})
              </h3>
              <p className="text-xs text-slate-500">
                Menampilkan selisih beban pajak antara tarif normal {result.generalRatePercent}% dan fasilitas diskon 50% Pasal 31E ({result.facilityRatePercent}%).
              </p>
            </div>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 16, left: 6, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10.5, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 1_000_000_000
                        ? `${(v / 1_000_000_000).toFixed(1)}M`
                        : v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}jt`
                        : `${(v / 1000).toFixed(0)}rb`
                    }
                  />
                  <RechartsTooltip
                    formatter={(value: any) => [formatRupiah(Number(value) || 0), 'Nominal']}
                  />
                  <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={64}>
                    {chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT (5 cols): Editable Parameters, Scenarios, & Strategic Comparison */}
        <div className="lg:col-span-5 space-y-4">
          {/* Parameters & Scenarios */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-sky-600" />
                <span>Parameter &amp; Simulasi PPh Badan</span>
              </h3>
              <button
                type="button"
                onClick={() => applyScenarioPreset('POS')}
                className="text-xs font-semibold text-sky-700 hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Data POS</span>
              </button>
            </div>

            {/* Scenario Preset Buttons */}
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'POS' as const, label: 'Data Aktual POS' },
                { id: 'UNDER_48M' as const, label: 'Simulasi Rp 3,6 M' },
                { id: 'MID_12B' as const, label: 'Simulasi Rp 12 M (31E)' },
                { id: 'OVER_50B' as const, label: 'Simulasi Rp 55 M (22%)' },
              ].map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => applyScenarioPreset(sc.id)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 whitespace-nowrap cursor-pointer transition-colors"
                >
                  {sc.label}
                </button>
              ))}
            </div>

            {dataSourceMode === 'MANUAL' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Peredaran Bruto / Omzet (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualTurnover}
                    onChange={(e) => setManualTurnover(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    HPP / COGS (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualCogs}
                    onChange={(e) => setManualCogs(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Biaya Operasional (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualOpex}
                    onChange={(e) => setManualOpex(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Pendapatan Lainnya (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualOtherIncome}
                    onChange={(e) => setManualOtherIncome(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tarif Umum Pasal 17 (%)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={generalRateInput}
                  onChange={(e) => setGeneralRateInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Koreksi Fiskal Netto (+/− Rp)
                </label>
                <input
                  type="number"
                  value={fiscalAdjInput}
                  onChange={(e) => setFiscalAdjInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kompensasi Rugi Fiskal (Rp)
                </label>
                <input
                  type="number"
                  min="0"
                  value={lossCompInput}
                  onChange={(e) => setLossCompInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Kredit PPh 25 / 22 / 23 Tambahan
                </label>
                <input
                  type="number"
                  min="0"
                  value={extraTaxCreditInput}
                  onChange={(e) => setExtraTaxCreditInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <button
              type="button"
              disabled={isSavingFiscal}
              onClick={handleSaveFiscalDefaults}
              className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              <Save className="w-3.5 h-3.5 text-sky-400" />
              <span>
                {isSavingFiscal
                  ? 'Menyimpan...'
                  : 'Simpan Tarif & Penyesuaian Fiskal ke Profil'}
              </span>
            </button>
          </div>

          {/* Strategic Comparison: PPh Badan 31E vs PPh Final UMKM 0.5% */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 text-xs">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-emerald-600" />
                <span>Komparasi: PPh Badan Pasal 31E vs PPh Final {taxConfig.pphFinalRatePercent ?? 0.5}%</span>
              </h3>
              <p className="text-slate-500 mt-0.5">
                Evaluasi efisiensi pajak WP Badan saat omzet ≤ Rp 4,8 Miliar atau pasca masa PP 55/2022 berakhir.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div
                className={`p-3 rounded-xl border ${
                  result.recommendedScheme === 'PPH_BADAN_31E'
                    ? 'bg-emerald-50 border-emerald-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-semibold text-slate-700">PPh Badan (Pasal 31E)</div>
                <div className="font-mono tabular-nums font-bold text-slate-900 text-sm mt-1">
                  {formatRupiah(result.totalPphBadanDue)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Basis Laba Fiskal ({result.effectiveTaxRateOnTurnover}% omzet)
                </div>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  result.recommendedScheme === 'PPH_FINAL_UMKM' &&
                  result.grossTurnover <= PPH_31E_FACILITY_TURNOVER
                    ? 'bg-sky-50 border-sky-300'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="font-semibold text-slate-700">
                  PPh Final UMKM ({taxConfig.pphFinalRatePercent ?? 0.5}%)
                </div>
                <div className="font-mono tabular-nums font-bold text-slate-900 text-sm mt-1">
                  {formatRupiah(result.comparisonPphFinal05)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {result.grossTurnover > PPH_31E_FACILITY_TURNOVER
                    ? 'Tidak berlaku (Omzet > Rp 4,8 M)'
                    : 'Basis Peredaran Bruto'}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-slate-700 leading-relaxed">
              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {result.grossTurnover > PPH_31E_FACILITY_TURNOVER
                    ? 'Wajib Pembukuan & PPh Badan (Omzet > Rp 4,8 Miliar)'
                    : result.recommendedScheme === 'PPH_BADAN_31E'
                    ? `PPh Badan Pasal 31E lebih hemat ${formatRupiah(
                        result.comparisonPphFinal05 - result.totalPphBadanDue
                      )}`
                    : result.recommendedScheme === 'PPH_FINAL_UMKM'
                    ? `PPh Final UMKM lebih hemat ${formatRupiah(
                        result.totalPphBadanDue - result.comparisonPphFinal05
                      )}`
                    : 'Beban kedua skema setara'}
                </span>
              </div>
              <p>
                Titik impas net margin adalah{' '}
                <strong className="font-mono tabular-nums">{result.breakEvenMarginPercent}%</strong>.
                Jika margin laba bersih usaha di bawah {result.breakEvenMarginPercent}% (atau rugi),
                skema pembukuan <strong>PPh Badan Pasal 31E</strong> lebih ringan. Batas maksimal
                fasilitas pengurangan tarif 50% Pasal 31E adalah peredaran bruto{' '}
                <strong>{formatRupiah(PPH_31E_REVENUE_CAP)}</strong> per tahun.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
