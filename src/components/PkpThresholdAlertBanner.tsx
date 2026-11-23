import React, { useMemo, useState } from 'react';
import { AlertTriangle, EyeOff, Landmark, RotateCcw, ShieldAlert } from 'lucide-react';
import { RestockOrder, StoreSettings, TaxAdjustment, TaxRecord, Transaction } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getLocalDateKey } from '../utils/adminLowStockAlert';
import { computeAnnualTaxBuckets, getEffectiveTaxConfig } from '../utils/taxUtils';

interface PkpThresholdAlertBannerProps {
  transactions: Transaction[];
  purchases?: RestockOrder[];
  taxRecords?: TaxRecord[];
  taxAdjustments?: TaxAdjustment[];
  storeSettings: StoreSettings;
  onNavigateToTax?: () => void;
}

const PKP_ALERT_SNOOZE_PREFIX = 'kasir_pkp_threshold_alert_snooze_';

export const PkpThresholdAlertBanner: React.FC<PkpThresholdAlertBannerProps> = ({
  transactions = [],
  purchases = [],
  taxRecords = [],
  taxAdjustments = [],
  storeSettings,
  onNavigateToTax,
}) => {
  const todayKey = getLocalDateKey();
  const storageKey = `${PKP_ALERT_SNOOZE_PREFIX}${todayKey}`;

  const [isSnoozedToday, setIsSnoozedToday] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  const taxConfig = useMemo(() => getEffectiveTaxConfig(storeSettings), [storeSettings]);

  const statusInfo = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const isAlreadyPkp =
      taxConfig.taxpayerStatus === 'PKP_UMUM' || Boolean(taxConfig.enablePpn);

    const analysis = computeAnnualTaxBuckets({
      transactions,
      purchases,
      taxRecords,
      taxConfig,
      year: currentYear,
      taxAdjustments,
    });

    const ytdTurnover = analysis.totalAnnualTurnover;
    const pkpLimit = analysis.pkpThreshold; // Rp 4.800.000.000
    const progressPct = analysis.pkpThresholdProgress;
    const remainingHeadroom = Math.max(0, pkpLimit - ytdTurnover);

    // Count months with revenue to estimate annualized run rate
    const activeMonths = analysis.buckets.filter((b) => b.taxableTurnover > 0).length;
    const avgMonthlyTurnover = activeMonths > 0 ? Math.round(ytdTurnover / activeMonths) : 0;
    const projectedAnnualTurnover = avgMonthlyTurnover * 12;
    const estimatedMonthsToReachLimit =
      avgMonthlyTurnover > 0 && remainingHeadroom > 0
        ? Math.ceil(remainingHeadroom / avgMonthlyTurnover)
        : 0;

    // Trigger when still Non-PKP and either:
    // 1. Actual YTD >= 75% (Rp 3,6 Miliar) or >= 100% (Rp 4,8 Miliar), OR
    // 2. Active >= 2 months with >= Rp 1,2M YTD AND annualized run-rate >= Rp 4,0 Miliar (approaching 4.8B pace)
    const isExceeded = ytdTurnover > pkpLimit;
    const isActualApproaching = ytdTurnover >= pkpLimit * 0.75;
    const isRunRateApproaching =
      activeMonths >= 2 && ytdTurnover >= 1_200_000_000 && projectedAnnualTurnover >= 4_000_000_000;

    const shouldAlert = !isAlreadyPkp && (isExceeded || isActualApproaching || isRunRateApproaching);

    return {
      currentYear,
      shouldAlert,
      isExceeded,
      ytdTurnover,
      pkpLimit,
      progressPct,
      remainingHeadroom,
      activeMonths,
      avgMonthlyTurnover,
      projectedAnnualTurnover,
      estimatedMonthsToReachLimit,
    };
  }, [transactions, purchases, taxRecords, taxAdjustments, taxConfig]);

  if (!statusInfo.shouldAlert) return null;

  const handleToggleSnooze = (snooze: boolean) => {
    sound.playTap();
    setIsSnoozedToday(snooze);
    try {
      if (snooze) {
        localStorage.setItem(storageKey, '1');
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      // ignore storage errors
    }
  };

  if (isSnoozedToday) {
    return (
      <div
        className={`bg-white px-4 py-2.5 rounded-2xl border ${
          statusInfo.isExceeded ? 'border-rose-300' : 'border-amber-300'
        } flex items-center justify-between gap-3 flex-wrap`}
      >
        <div className="flex items-center gap-2 text-xs text-slate-700">
          <ShieldAlert
            className={`w-4 h-4 shrink-0 ${
              statusInfo.isExceeded ? 'text-rose-600' : 'text-amber-600'
            }`}
          />
          <span className="font-bold text-slate-900">
            {statusInfo.isExceeded
              ? 'Wajib Pengukuhan PKP (> Rp 4,8 Miliar):'
              : 'Omzet Mendekati Ambang Batas PKP (Rp 4,8 Miliar):'}
          </span>
          <span className="font-mono tabular-nums font-bold text-slate-900">
            {formatRupiah(statusInfo.ytdTurnover)} ({statusInfo.progressPct.toFixed(1)}%)
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleToggleSnooze(false)}
            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tampilkan Detail PKP</span>
          </button>
          {onNavigateToTax && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToTax();
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
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
      aria-label="Peringatan Ambang Batas Omzet PKP Rp 4,8 Miliar"
      className={`bg-white rounded-2xl border overflow-hidden ${
        statusInfo.isExceeded ? 'border-rose-300' : 'border-amber-300'
      }`}
    >
      <div
        className={`px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${
          statusInfo.isExceeded ? 'bg-rose-50/80' : 'bg-amber-50/75'
        }`}
      >
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`p-2 rounded-xl border shrink-0 ${
              statusInfo.isExceeded
                ? 'bg-rose-100 text-rose-700 border-rose-200'
                : 'bg-amber-100 text-amber-800 border-amber-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-1.5 min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900">
              {statusInfo.isExceeded
                ? `Wajib PKP: Omzet Tahun ${statusInfo.currentYear} Telah Melewati Rp 4,8 Miliar`
                : `Peringatan Omzet Mendekati Ambang Batas PKP (Rp 4,8 Miliar) — Tahun ${statusInfo.currentYear}`}
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed tabular-nums">
              {statusInfo.isExceeded ? (
                <>
                  Omzet berjalan tercatat{' '}
                  <strong className="font-mono text-rose-800">
                    {formatRupiah(statusInfo.ytdTurnover)}
                  </strong>{' '}
                  ({statusInfo.progressPct.toFixed(1)}% dari batas Rp 4,8 Miliar). Toko wajib
                  segera dikukuhkan sebagai <strong>Pengusaha Kena Pajak (PKP)</strong>,
                  melaksanakan pembukuan PPh, memungut PPN, dan menerbitkan Faktur Pajak.
                </>
              ) : (
                <>
                  Omzet berjalan tahun {statusInfo.currentYear} telah mencapai{' '}
                  <strong className="font-mono text-amber-900">
                    {formatRupiah(statusInfo.ytdTurnover)}
                  </strong>{' '}
                  (<strong>{statusInfo.progressPct.toFixed(1)}%</strong> dari batas PKP Rp 4,8
                  Miliar · sisa ruang{' '}
                  <strong className="font-mono">
                    {formatRupiah(statusInfo.remainingHeadroom)}
                  </strong>
                  ). Dengan rata-rata{' '}
                  <span className="font-mono font-semibold">
                    {formatRupiah(statusInfo.avgMonthlyTurnover)}/bln
                  </span>
                  {statusInfo.estimatedMonthsToReachLimit > 0
                    ? `, ambang batas PKP diperkirakan tercapai dalam ±${formatNumber(
                        statusInfo.estimatedMonthsToReachLimit
                      )} bulan.`
                    : '.'}{' '}
                  Manajer dapat mempertimbangkan pengajuan PKP lebih awal.
                </>
              )}
            </p>

            {/* Progress Bar toward 4.8B PKP Threshold */}
            <div className="pt-1 max-w-xl">
              <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600 mb-1">
                <span>Realisasi: {formatRupiah(statusInfo.ytdTurnover)}</span>
                <span>Batas PKP: Rp 4.800.000.000</span>
              </div>
              <div className="w-full h-2 bg-white/90 rounded-full overflow-hidden border border-slate-200">
                <div
                  className={`h-full transition-all ${
                    statusInfo.isExceeded ? 'bg-rose-600' : 'bg-amber-500'
                  }`}
                  style={{ width: `${Math.min(100, statusInfo.progressPct)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start lg:self-center">
          {onNavigateToTax && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToTax();
              }}
              className={`px-3.5 py-2 rounded-xl text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                statusInfo.isExceeded
                  ? 'bg-rose-700 hover:bg-rose-600'
                  : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              <Landmark className="w-3.5 h-3.5 text-sky-300" />
              <span>{statusInfo.isExceeded ? 'Aktifkan Status PKP' : 'Evaluasi Status PKP'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => handleToggleSnooze(true)}
            className="p-2 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer shrink-0"
            title="Sembunyikan peringatan hari ini"
          >
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
