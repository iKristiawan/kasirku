import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  EyeOff,
  FileSpreadsheet,
  Landmark,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  RestockOrder,
  StoreSettings,
  TaxAdjustment,
  TaxConfig,
  TaxRecord,
  Transaction,
} from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getLocalDateKey } from '../utils/adminLowStockAlert';
import {
  exportMonthlyTaxSummaryExcel,
  getEffectiveTaxConfig,
  getTaxDueAlertSummary,
  TaxDueAlertItem,
} from '../utils/taxUtils';

interface TaxDueAlertBannerProps {
  transactions: Transaction[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  taxAdjustments?: TaxAdjustment[];
  storeSettings: StoreSettings;
  taxConfigOverride?: TaxConfig;
  variant?: 'DASHBOARD' | 'TAX_VIEW';
  onNavigateToTax?: () => void;
  onSelectPeriod?: (year: number, monthIndex: number) => void;
  onRecordTaxPayment?: (alert: TaxDueAlertItem) => void;
  onExcelDownloaded?: (filename: string, periodLabel: string, txCount: number) => void;
}

const TAX_DUE_SNOOZE_PREFIX = 'kasir_tax_due_alert_snooze_';

export const TaxDueAlertBanner: React.FC<TaxDueAlertBannerProps> = ({
  transactions = [],
  purchases = [],
  taxRecords = [],
  taxAdjustments = [],
  storeSettings,
  taxConfigOverride,
  variant = 'DASHBOARD',
  onNavigateToTax,
  onSelectPeriod,
  onRecordTaxPayment,
  onExcelDownloaded,
}) => {
  const todayKey = getLocalDateKey();
  const storageKey = `${TAX_DUE_SNOOZE_PREFIX}${todayKey}`;

  const [isSnoozedToday, setIsSnoozedToday] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  const effectiveTaxConfig = useMemo(
    () =>
      taxConfigOverride
        ? getEffectiveTaxConfig(taxConfigOverride, storeSettings.storeName)
        : getEffectiveTaxConfig(storeSettings),
    [storeSettings, taxConfigOverride]
  );

  const alertSummary = useMemo(
    () =>
      getTaxDueAlertSummary({
        transactions,
        purchases,
        taxRecords,
        taxConfig: effectiveTaxConfig,
        taxAdjustments,
      }),
    [transactions, purchases, taxRecords, effectiveTaxConfig, taxAdjustments]
  );

  const toggleSnooze = (nextSnooze: boolean) => {
    sound.playTap();
    setIsSnoozedToday(nextSnooze);
    try {
      if (nextSnooze) {
        localStorage.setItem(storageKey, '1');
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage write errors
    }
  };

  const handleDownloadPeriodExcel = (alert: TaxDueAlertItem) => {
    sound.playTap();
    const res = exportMonthlyTaxSummaryExcel({
      transactions,
      purchases,
      taxRecords,
      storeSettings,
      taxConfig: effectiveTaxConfig,
      year: alert.year,
      monthIndex: alert.monthIndex,
      taxAdjustments,
    });
    if (onExcelDownloaded) {
      onExcelDownloaded(res.filename, res.periodLabel, res.txCount);
    }
  };

  const { urgentAlerts, overdueCount, totalRemainingDue, dueDay, reminderWindowDays, nextScheduledDue } =
    alertSummary;

  const isNextScheduledWithinWindow = nextScheduledDue.daysUntilDue <= reminderWindowDays;
  const hasFiledNextScheduledPeriod = taxRecords.some(
    (r) => r.periodMonth === nextScheduledDue.periodKey && r.status === 'SUDAH_SETOR'
  );

  // On Manager Dashboard: stay quiet unless there are urgent unpaid/overdue alerts OR we are within H-7 before the 15th without a filed record
  if (urgentAlerts.length === 0) {
    if (variant === 'DASHBOARD') {
      if (!isNextScheduledWithinWindow || hasFiledNextScheduledPeriod) {
        return null;
      }

      if (isSnoozedToday) {
        return (
          <div className="bg-white px-4 py-2.5 rounded-2xl border border-amber-300 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs text-slate-700 min-w-0">
              <CalendarClock className="w-4 h-4 shrink-0 text-amber-600" />
              <span className="font-bold text-slate-900">Pengingat Lapor &amp; Setor Pajak:</span>
              <span className="font-mono tabular-nums font-bold text-amber-800">
                Masa {nextScheduledDue.periodLabel} · H-{nextScheduledDue.daysUntilDue} (Tgl {dueDay})
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggleSnooze(false)}
                className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tampilkan</span>
              </button>
              {onNavigateToTax && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onNavigateToTax();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Landmark className="w-3.5 h-3.5 text-sky-400" />
                  <span>Menu Pajak</span>
                </button>
              )}
            </div>
          </div>
        );
      }

      return (
        <section
          aria-label="Pengingat Pelaporan Pajak Bulanan"
          className="bg-white rounded-2xl border border-amber-300 px-4 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="p-2 rounded-xl border bg-amber-100 text-amber-800 border-amber-200 shrink-0">
              <CalendarClock className="w-4 h-4" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Pengingat Proaktif: Batas Lapor &amp; Setor Pajak {nextScheduledDue.daysUntilDue === 0 ? 'Hari Ini' : `H-${nextScheduledDue.daysUntilDue}`} (Tgl {nextScheduledDue.dueDateDisplay})
              </h3>
              <p className="text-xs text-slate-600 tabular-nums">
                Jadwal penyetoran &amp; pelaporan pajak masa <strong>{nextScheduledDue.periodLabel}</strong>{' '}
                kurang dari {reminderWindowDays} hari lagi (batas tanggal {dueDay}). Siapkan dokumen &amp;
                bukti lapor (termasuk SPT Nihil bila Rp 0) agar terhindar dari denda keterlambatan.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onNavigateToTax && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onNavigateToTax();
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Landmark className="w-3.5 h-3.5 text-sky-400" />
                <span>Buka Menu Pajak</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => toggleSnooze(true)}
              className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer shrink-0"
              title="Sembunyikan notifikasi hari ini"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          </div>
        </section>
      );
    }

    // On TaxManagementView: show a subtle 1-line schedule strip so staff always see the active deadline
    return (
      <div className="bg-white px-4 py-2.5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-700">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>
            <strong>Tidak ada pajak jatuh tempo mendesak</strong> saat ini. Jadwal jatuh tempo berikutnya:{' '}
            <strong className="text-slate-900 font-mono tabular-nums">
              {nextScheduledDue.dueDateDisplay}
            </strong>{' '}
            (Masa {nextScheduledDue.periodLabel} ·{' '}
            <span className="font-mono tabular-nums font-semibold">
              H-{nextScheduledDue.daysUntilDue}
            </span>
            ).
          </span>
        </div>
        <div className="text-slate-500 font-mono tabular-nums shrink-0">
          Notifikasi aktif otomatis ≤ {reminderWindowDays} hari sebelum tgl {dueDay}
        </div>
      </div>
    );
  }

  const hasOverdue = overdueCount > 0;
  const containerBorder = hasOverdue ? 'border-rose-300' : 'border-amber-300';
  const headerSurface = hasOverdue
    ? 'bg-rose-50/70 border-b border-rose-200'
    : 'bg-amber-50/70 border-b border-amber-200';

  if (variant === 'DASHBOARD' && isSnoozedToday) {
    return (
      <div
        className={`bg-white px-4 py-2.5 rounded-2xl border ${containerBorder} flex items-center justify-between gap-3 flex-wrap`}
      >
        <div className="flex items-center gap-2 text-xs text-slate-700 min-w-0">
          <CalendarClock
            className={`w-4 h-4 shrink-0 ${hasOverdue ? 'text-rose-600' : 'text-amber-600'}`}
          />
          <span className="font-bold text-slate-900">Peringatan Jatuh Tempo Pajak Bulanan:</span>
          <span
            className={`font-mono tabular-nums font-bold ${
              hasOverdue ? 'text-rose-700' : 'text-amber-800'
            }`}
          >
            {formatNumber(urgentAlerts.length)} masa pajak · Sisa {formatRupiah(totalRemainingDue)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => toggleSnooze(false)}
            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tampilkan Rincian</span>
          </button>
          {onNavigateToTax && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToTax();
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Landmark className="w-3.5 h-3.5 text-sky-400" />
              <span>Menu Pajak</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Peringatan Jatuh Tempo Pajak Bulanan"
      className={`bg-white rounded-2xl border ${containerBorder} overflow-hidden`}
    >
      {/* Header Strip */}
      <div
        className={`px-4 py-3 ${headerSurface} flex flex-col lg:flex-row lg:items-center justify-between gap-3`}
      >
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`p-2 rounded-xl border shrink-0 ${
              hasOverdue
                ? 'bg-rose-100 text-rose-700 border-rose-200'
                : 'bg-amber-100 text-amber-800 border-amber-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900">
              {hasOverdue
                ? 'Peringatan: Pajak Bulanan Melewati Jatuh Tempo'
                : `Peringatan: Jatuh Tempo Pajak Bulanan Mendekat (≤ ${reminderWindowDays} Hari Sebelum Tgl ${dueDay})`}
            </h3>
            <p className="text-xs text-slate-600 tabular-nums">
              Terdapat <strong>{formatNumber(urgentAlerts.length)} masa pajak</strong> yang belum
              dilunasi dengan total sisa kewajiban{' '}
              <strong className={hasOverdue ? 'text-rose-700' : 'text-amber-800'}>
                {formatRupiah(totalRemainingDue)}
              </strong>
              . Segera siapkan dokumen setoran &amp; kode billing DJP Online.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {variant === 'DASHBOARD' && onNavigateToTax && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToTax();
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Landmark className="w-3.5 h-3.5 text-sky-400" />
              <span>Siapkan Setoran Pajak</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsExpanded((v) => !v);
            }}
            className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer shrink-0"
            title={isExpanded ? 'Perkecil peringatan' : 'Tampilkan rincian'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {variant === 'DASHBOARD' && (
            <button
              type="button"
              onClick={() => toggleSnooze(true)}
              className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer shrink-0"
              title="Sembunyikan notifikasi hari ini"
            >
              <EyeOff className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Period Rows */}
      {isExpanded && (
        <div className="divide-y divide-slate-100">
          {urgentAlerts.map((alert) => {
            const isOverdue = alert.urgencyStatus === 'OVERDUE';
            const isToday = alert.urgencyStatus === 'DUE_TODAY';
            return (
              <div
                key={alert.periodKey}
                className="px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-900">
                      Masa Pajak {alert.periodLabel}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span
                      className={`text-xs font-mono tabular-nums font-bold ${
                        isOverdue
                          ? 'text-rose-700'
                          : isToday
                          ? 'text-amber-800'
                          : 'text-amber-700'
                      }`}
                    >
                      {alert.urgencyLabel}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      Batas Setor: {alert.dueDateDisplay}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap text-xs text-slate-600 tabular-nums">
                    <span>
                      Omzet: <strong className="font-mono text-slate-800">{formatRupiah(alert.taxableTurnover)}</strong>
                    </span>
                    {alert.pphFinalDue > 0 && (
                      <span>
                        PPh Final: <strong className="font-mono text-slate-800">{formatRupiah(alert.pphFinalDue)}</strong>
                      </span>
                    )}
                    {alert.ppnNetPayable > 0 && (
                      <span>
                        PPN: <strong className="font-mono text-slate-800">{formatRupiah(alert.ppnNetPayable)}</strong>
                      </span>
                    )}
                    {alert.pb1Due > 0 && (
                      <span>
                        PB1: <strong className="font-mono text-slate-800">{formatRupiah(alert.pb1Due)}</strong>
                      </span>
                    )}
                    {alert.recordedPaidTax > 0 && (
                      <span className="text-emerald-700">
                        Sudah Setor: <strong className="font-mono">{formatRupiah(alert.recordedPaidTax)}</strong>
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <div className="text-left md:text-right mr-1">
                    <div className="text-xs text-slate-500">Sisa Kewajiban</div>
                    <div
                      className={`text-sm font-bold font-mono tabular-nums ${
                        isOverdue ? 'text-rose-700' : 'text-amber-800'
                      }`}
                    >
                      {formatRupiah(alert.remainingDue)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDownloadPeriodExcel(alert)}
                    className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                    title={`Unduh Excel ringkasan transaksi & pajak Masa ${alert.periodLabel}`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Excel ({alert.periodKey})</span>
                  </button>

                  {onSelectPeriod && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        onSelectPeriod(alert.year, alert.monthIndex);
                      }}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Lihat Rincian
                    </button>
                  )}

                  {onRecordTaxPayment && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        onRecordTaxPayment(alert);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5 text-sky-400" />
                      <span>Catat Setoran</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
