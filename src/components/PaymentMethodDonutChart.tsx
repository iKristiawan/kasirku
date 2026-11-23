import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from 'recharts';
import {
  CreditCard,
  Banknote,
  QrCode,
  ArrowLeftRight,
  Clock,
  Wallet,
  EyeOff,
  RotateCcw,
  Table2,
  PieChart as PieChartIcon,
  TrendingUp,
  TrendingDown,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Transaction, Product } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface PaymentMethodDonutChartProps {
  transactions: Transaction[];
  productMap: Map<string, Product>;
  currentStart: number;
  currentEnd: number;
  previousStart?: number;
  previousEnd?: number;
  periodLabel: string;
  previousLabel?: string;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

type PaymentBucketKey = 'CASH' | 'QRIS' | 'TRANSFER' | 'EDC' | 'PIUTANG';
type DonutBasis = 'REVENUE' | 'TX_COUNT';
type ViewMode = 'DONUT' | 'TABLE';

interface PaymentBucketRow {
  key: PaymentBucketKey;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  revenue: number;
  prevRevenue: number;
  revenueGrowthPercent: number | null;
  txCount: number;
  prevTxCount: number;
  value: number;
  revenueSharePercent: number;
  txSharePercent: number;
  sharePercent: number;
  avgTicket: number;
  unpaidAmount: number;
}

const BUCKET_DEFINITIONS: Array<{
  key: PaymentBucketKey;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
}> = [
  {
    key: 'CASH',
    label: 'Cash (Tunai)',
    shortLabel: 'Cash',
    description: 'Pembayaran tunai langsung di kasir',
    color: '#10b981',
  },
  {
    key: 'QRIS',
    label: 'QRIS',
    shortLabel: 'QRIS',
    description: 'Scan QRIS dompet digital & mobile banking',
    color: '#0ea5e9',
  },
  {
    key: 'TRANSFER',
    label: 'Transfer',
    shortLabel: 'Transfer',
    description: 'Transfer rekening bank / virtual account',
    color: '#6366f1',
  },
  {
    key: 'EDC',
    label: 'EDC (Kartu)',
    shortLabel: 'EDC',
    description: 'Kartu Debit / Kredit via mesin EDC',
    color: '#f59e0b',
  },
  {
    key: 'PIUTANG',
    label: 'Piutang (Tempo)',
    shortLabel: 'Piutang',
    description: 'Transaksi tempo / kasbon pelanggan',
    color: '#f43f5e',
  },
];

const classifyPaymentMethod = (rawMethod: string): PaymentBucketKey => {
  const m = String(rawMethod || 'CASH').trim().toUpperCase();
  if (
    m.includes('QRIS') ||
    m.includes('GOPAY') ||
    m.includes('OVO') ||
    m.includes('DANA') ||
    m.includes('SHOPEEPAY') ||
    m.includes('EWALLET')
  ) {
    return 'QRIS';
  }
  if (m.includes('TRANSFER') || m.includes('BANK') || m.includes('VA')) return 'TRANSFER';
  if (
    m.includes('EDC') ||
    m.includes('CARD') ||
    m.includes('DEBIT') ||
    m.includes('KREDIT') ||
    m.includes('CREDIT') ||
    m.includes('KARTU')
  ) {
    return 'EDC';
  }
  if (m.includes('PIUTANG') || m.includes('TEMPO') || m.includes('KASBON') || m.includes('HUTANG')) {
    return 'PIUTANG';
  }
  return 'CASH';
};

const getBucketIcon = (key: PaymentBucketKey, className = 'w-4 h-4') => {
  switch (key) {
    case 'CASH':
      return <Banknote className={className} />;
    case 'QRIS':
      return <QrCode className={className} />;
    case 'TRANSFER':
      return <ArrowLeftRight className={className} />;
    case 'EDC':
      return <CreditCard className={className} />;
    case 'PIUTANG':
      return <Clock className={className} />;
  }
};

export const PaymentMethodDonutChart: React.FC<PaymentMethodDonutChartProps> = ({
  transactions,
  productMap,
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  periodLabel,
  previousLabel = 'Periode Lalu',
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette } = useChartTheme();
  const [basis, setBasis] = useState<DonutBasis>('REVENUE');
  const [viewMode, setViewMode] = useState<ViewMode>('DONUT');
  const [hoveredKey, setHoveredKey] = useState<PaymentBucketKey | null>(null);
  const [pinnedKey, setPinnedKey] = useState<PaymentBucketKey | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const hasPreviousRange =
    typeof previousStart === 'number' &&
    typeof previousEnd === 'number' &&
    previousEnd >= previousStart;

  const {
    allBuckets,
    activeSlices,
    totalRevenue,
    totalPrevRevenue,
    totalTxCount,
    topBucket,
  } = useMemo(() => {
    const isFiltered = hiddenCategorySet.size > 0;
    const aggMap = new Map<
      PaymentBucketKey,
      {
        revenue: number;
        txCount: number;
        unpaidAmount: number;
        prevRevenue: number;
        prevTxCount: number;
      }
    >();

    BUCKET_DEFINITIONS.forEach((def) => {
      aggMap.set(def.key, {
        revenue: 0,
        txCount: 0,
        unpaidAmount: 0,
        prevRevenue: 0,
        prevTxCount: 0,
      });
    });

    const getTxMatchedRevenue = (tx: Transaction): { matchedRevenue: number; hasMatch: boolean } => {
      const rawNet = Math.max(0, (tx.finalAmount || 0) - (tx.returnedAmount || 0));
      if (!isFiltered) {
        return { matchedRevenue: rawNet, hasMatch: true };
      }

      let matchedItemsSum = 0;
      let totalItemsSum = 0;
      let hasMatch = false;

      tx.items.forEach((item) => {
        const lineTotal = item.totalAmount || 0;
        totalItemsSum += lineTotal;
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        if (!hiddenCategorySet.has(catName)) {
          matchedItemsSum += lineTotal;
          hasMatch = true;
        }
      });

      if (!hasMatch) return { matchedRevenue: 0, hasMatch: false };
      if (tx.returnedAmount && tx.returnedAmount > 0 && totalItemsSum > 0) {
        const netRatio = Math.max(0, rawNet / totalItemsSum);
        return { matchedRevenue: Math.round(matchedItemsSum * netRatio), hasMatch: true };
      }
      return { matchedRevenue: matchedItemsSum, hasMatch: true };
    };

    transactions.forEach((tx) => {
      const inCurrent = tx.timestamp >= currentStart && tx.timestamp <= currentEnd;
      const inPrevious =
        hasPreviousRange && tx.timestamp >= (previousStart as number) && tx.timestamp <= (previousEnd as number);

      if (!inCurrent && !inPrevious) return;

      const { matchedRevenue, hasMatch } = getTxMatchedRevenue(tx);
      if (!hasMatch) return;

      const bucketKey = classifyPaymentMethod(tx.paymentMethod);
      const entry = aggMap.get(bucketKey)!;

      if (inCurrent) {
        entry.revenue += matchedRevenue;
        entry.txCount += 1;
        if (bucketKey === 'PIUTANG' && tx.paymentStatus !== 'LUNAS') {
          entry.unpaidAmount += matchedRevenue;
        }
      } else if (inPrevious) {
        entry.prevRevenue += matchedRevenue;
        entry.prevTxCount += 1;
      }
    });

    let totRev = 0;
    let totPrevRev = 0;
    let totTx = 0;
    aggMap.forEach((v) => {
      totRev += v.revenue;
      totPrevRev += v.prevRevenue;
      totTx += v.txCount;
    });

    const bucketColorByKey: Record<PaymentBucketKey, string> = {
      CASH: palette.positive,
      QRIS: palette.primary,
      TRANSFER: palette.secondary,
      EDC: palette.warning,
      PIUTANG: palette.danger,
    };

    const rows: PaymentBucketRow[] = BUCKET_DEFINITIONS.map((def) => {
      const stats = aggMap.get(def.key)!;
      const revShare = totRev > 0 ? (stats.revenue / totRev) * 100 : 0;
      const txShare = totTx > 0 ? (stats.txCount / totTx) * 100 : 0;
      const value = basis === 'REVENUE' ? stats.revenue : stats.txCount;
      const sharePercent = basis === 'REVENUE' ? revShare : txShare;
      const revenueGrowthPercent =
        hasPreviousRange && stats.prevRevenue > 0
          ? ((stats.revenue - stats.prevRevenue) / stats.prevRevenue) * 100
          : null;

      return {
        key: def.key,
        label: def.label,
        shortLabel: def.shortLabel,
        description: def.description,
        color: bucketColorByKey[def.key] || def.color,
        revenue: stats.revenue,
        prevRevenue: stats.prevRevenue,
        revenueGrowthPercent,
        txCount: stats.txCount,
        prevTxCount: stats.prevTxCount,
        value,
        revenueSharePercent: revShare,
        txSharePercent: txShare,
        sharePercent,
        avgTicket: stats.txCount > 0 ? Math.round(stats.revenue / stats.txCount) : 0,
        unpaidAmount: stats.unpaidAmount,
      };
    }).sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return b.revenue - a.revenue;
    });

    const slices = rows.filter((r) => r.value > 0);
    const top = slices[0] || null;

    return {
      allBuckets: rows,
      activeSlices: slices,
      totalRevenue: totRev,
      totalPrevRevenue: totPrevRev,
      totalTxCount: totTx,
      topBucket: top,
    };
  }, [
    transactions,
    productMap,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    hasPreviousRange,
    hiddenCategorySet,
    basis,
    palette,
  ]);

  const focusedKey = hoveredKey ?? pinnedKey;
  const activeItem = focusedKey
    ? allBuckets.find((b) => b.key === focusedKey) || null
    : null;

  const handleExportExcel = () => {
    sound.playTap();
    const rows = allBuckets.map((row, idx) => ({
      Peringkat: idx + 1,
      'Metode Pembayaran': row.label,
      'Jumlah Transaksi': row.txCount,
      'Porsi Frekuensi (%)': Number(row.txSharePercent.toFixed(2)),
      'Omzet Periode Ini (Rp)': row.revenue,
      'Porsi Omzet (%)': Number(row.revenueSharePercent.toFixed(2)),
      'Rata-rata / Nota (Rp)': row.avgTicket,
      ...(hasPreviousRange
        ? {
            [`Omzet ${previousLabel} (Rp)`]: row.prevRevenue,
            'Pertumbuhan (%)':
              row.revenueGrowthPercent !== null ? Number(row.revenueGrowthPercent.toFixed(2)) : 0,
          }
        : {}),
      'Piutang Belum Lunas (Rp)': row.unpaidAmount,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 },
      { wch: 22 },
      { wch: 16 },
      { wch: 18 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
      ...(hasPreviousRange ? [{ wch: 22 }, { wch: 16 }] : []),
      { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Omzet Metode Pembayaran');
    XLSX.writeFile(
      wb,
      `Breakdown_Metode_Pembayaran_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  };

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Breakdown Omzet per Metode Pembayaran (Cash, QRIS, Transfer, EDC, Piutang)"
    >
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 space-y-4">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Breakdown Omzet per Metode Pembayaran (Cash, QRIS, Transfer, EDC, Piutang)</span>
            </h3>
            <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{periodLabel}</span>
              {topBucket && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Dominasi:{' '}
                    <strong className="text-slate-900">{topBucket.label}</strong> (
                    <span className="font-mono tabular-nums font-bold text-slate-900">
                      {topBucket.sharePercent.toFixed(1)}%
                    </span>
                    )
                  </span>
                </>
              )}
              {specificSelectedCategoryName ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-amber-700">
                    Kategori: {specificSelectedCategoryName}
                  </span>
                </>
              ) : isCategoryFiltered ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-amber-700">
                    {activeCategoryCount}/{totalCategoriesCount} Kategori
                  </span>
                </>
              ) : null}
            </div>
          </div>

          {/* View Mode & Basis Controls */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {pinnedKey && viewMode === 'DONUT' && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setPinnedKey(null);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Reset Fokus
              </button>
            )}

            {/* Donut vs Table Switch */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setViewMode('DONUT');
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'DONUT'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <PieChartIcon className="w-3.5 h-3.5" />
                <span>Grafik Donat</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setViewMode('TABLE');
                }}
                className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  viewMode === 'TABLE'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Tabel Rincian</span>
              </button>
            </div>

            {viewMode === 'DONUT' && (
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setBasis('REVENUE');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    basis === 'REVENUE'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Nominal (Rp)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setBasis('TX_COUNT');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    basis === 'TX_COUNT'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Transaksi
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="Unduh tabel breakdown omzet per metode pembayaran ke Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Excel</span>
            </button>

            <FullscreenToggleButton
              isFullscreen={isFullscreen}
              onToggle={() => setIsFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Main Content */}
        {activeCategoryCount === 0 && totalCategoriesCount > 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
            <EyeOff className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Semua kategori sedang dinonaktifkan pada filter grafik
            </p>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onResetCategoryFilter();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tampilkan Semua Kategori</span>
            </button>
          </div>
        ) : totalTxCount === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs text-center gap-2 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 p-6">
            <Wallet className="w-8 h-8 text-slate-300" />
            <p className="font-semibold text-slate-600">
              Belum ada transaksi pembayaran tercatat pada periode {periodLabel}.
            </p>
          </div>
        ) : viewMode === 'TABLE' ? (
          /* Structured Payment Breakdown Table */
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3 w-10 text-center">#</th>
                  <th className="py-2.5 px-3">Metode Pembayaran</th>
                  <th className="py-2.5 px-3 text-right">Transaksi</th>
                  <th className="py-2.5 px-3 text-right">Porsi Trx</th>
                  <th className="py-2.5 px-3 text-right">Omzet (Rp)</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Porsi Omzet &amp; Dominasi</th>
                  <th className="py-2.5 px-3 text-right">Rata-rata / Nota</th>
                  {hasPreviousRange && (
                    <th className="py-2.5 px-3 text-right">vs {previousLabel}</th>
                  )}
                  <th className="py-2.5 px-3 text-right">Status / Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allBuckets.map((row, idx) => {
                  const isTop = idx === 0 && row.revenue > 0;
                  return (
                    <tr key={row.key} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums font-bold text-slate-500">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: row.color }}
                          >
                            {getBucketIcon(row.key, 'w-3.5 h-3.5')}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{row.label}</span>
                              {isTop && (
                                <span className="text-[10px] font-semibold text-emerald-700">
                                  · Terbanyak
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500">{row.description}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-800">
                        {formatNumber(row.txCount)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600">
                        {row.txSharePercent.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                        {formatRupiah(row.revenue)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${row.revenue > 0 ? Math.min(100, Math.max(3, row.revenueSharePercent)) : 0}%`,
                                backgroundColor: row.color,
                              }}
                            />
                          </div>
                          <span className="w-12 text-right font-mono tabular-nums font-bold text-slate-800">
                            {row.revenueSharePercent.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                        {formatRupiah(row.avgTicket)}
                      </td>
                      {hasPreviousRange && (
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {row.revenueGrowthPercent === null ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span
                              className={`inline-flex items-center justify-end gap-0.5 font-semibold ${
                                row.revenueGrowthPercent >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {row.revenueGrowthPercent >= 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              <span>
                                {row.revenueGrowthPercent >= 0 ? '+' : ''}
                                {row.revenueGrowthPercent.toFixed(1)}%
                              </span>
                            </span>
                          )}
                        </td>
                      )}
                      <td className="py-2.5 px-3 text-right">
                        {row.key === 'PIUTANG' && row.unpaidAmount > 0 ? (
                          <span className="font-mono tabular-nums font-semibold text-rose-700">
                            Belum Lunas: {formatRupiah(row.unpaidAmount)}
                          </span>
                        ) : row.txCount === 0 ? (
                          <span className="text-slate-400">Nihil</span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">Aktif</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 font-bold text-slate-900">
                  <td className="py-2.5 px-3" />
                  <td className="py-2.5 px-3">Total Keseluruhan ({periodLabel})</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {formatNumber(totalTxCount)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">100.0%</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {formatRupiah(totalRevenue)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">100.0%</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {formatRupiah(totalTxCount > 0 ? Math.round(totalRevenue / totalTxCount) : 0)}
                  </td>
                  {hasPreviousRange && (
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {totalPrevRevenue > 0 ? (
                        <span
                          className={
                            totalRevenue >= totalPrevRevenue ? 'text-emerald-700' : 'text-rose-700'
                          }
                        >
                          {totalRevenue >= totalPrevRevenue ? '+' : ''}
                          {(((totalRevenue - totalPrevRevenue) / totalPrevRevenue) * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  )}
                  <td className="py-2.5 px-3 text-right text-slate-500 font-medium">
                    {activeSlices.length} Kanal Aktif
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* Donut Chart + Breakdown Rows */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Left: Interactive Recharts Donut Chart */}
            <AnimatedChartStage
              filterKey={`pay-donut-${basis}-${periodLabel}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
              accent="indigo"
              delayMs={100}
              className={`lg:col-span-5 relative w-full flex items-center justify-center ${
                isFullscreen ? 'h-[58vh] min-h-[380px]' : 'h-72 sm:h-80'
              }`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const item = payload[0]?.payload as PaymentBucketRow | undefined;
                      if (!item) return null;

                      return (
                        <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[235px] space-y-2 z-50">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                            <div className="flex items-center gap-2">
                              <span
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="font-bold text-slate-100">{item.label}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-sky-300 font-mono tabular-nums">
                              {item.sharePercent.toFixed(1)}%
                            </span>
                          </div>

                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between items-center gap-3">
                              <span className="text-slate-400 font-sans">Total Omzet:</span>
                              <span className="font-bold text-emerald-400 tabular-nums">
                                {formatRupiah(item.revenue)} ({item.revenueSharePercent.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="flex justify-between items-center gap-3">
                              <span className="text-slate-400 font-sans">Frekuensi Pakai:</span>
                              <span className="font-bold text-sky-300 tabular-nums">
                                {formatNumber(item.txCount)} trx ({item.txSharePercent.toFixed(1)}%)
                              </span>
                            </div>
                            <div className="flex justify-between items-center gap-3">
                              <span className="text-slate-400 font-sans">Rata-rata / Nota:</span>
                              <span className="font-semibold text-slate-200 tabular-nums">
                                {formatRupiah(item.avgTicket)}
                              </span>
                            </div>
                            {hasPreviousRange && item.revenueGrowthPercent !== null && (
                              <div className="flex justify-between items-center gap-3">
                                <span className="text-slate-400 font-sans">vs {previousLabel}:</span>
                                <span
                                  className={`font-bold tabular-nums ${
                                    item.revenueGrowthPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {item.revenueGrowthPercent >= 0 ? '+' : ''}
                                  {item.revenueGrowthPercent.toFixed(1)}%
                                </span>
                              </div>
                            )}
                            {item.key === 'PIUTANG' && item.unpaidAmount > 0 && (
                              <div className="flex justify-between items-center gap-3 pt-1 border-t border-slate-800">
                                <span className="text-rose-300 font-sans">Belum Lunas:</span>
                                <span className="font-bold text-rose-400 tabular-nums">
                                  {formatRupiah(item.unpaidAmount)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Pie
                    data={activeSlices}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="86%"
                    paddingAngle={4}
                    cornerRadius={6}
                    isAnimationActive={true}
                    animationDuration={600}
                    animationEasing="ease-out"
                    onMouseEnter={(_, idx) => {
                      const target = activeSlices[idx];
                      if (target) setHoveredKey(target.key);
                    }}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={(_, idx) => {
                      const target = activeSlices[idx];
                      if (!target) return;
                      sound.playTap();
                      setPinnedKey((prev) => (prev === target.key ? null : target.key));
                    }}
                  >
                    {activeSlices.map((entry) => {
                      const isDimmed = focusedKey !== null && focusedKey !== entry.key;
                      const isFocused = focusedKey === entry.key;
                      return (
                        <Cell
                          key={entry.key}
                          fill={entry.color}
                          fillOpacity={isDimmed ? 0.25 : 1}
                          stroke={isFocused ? '#0f172a' : '#ffffff'}
                          strokeWidth={isFocused ? 2.5 : 1.5}
                          className="cursor-pointer transition-all duration-200 outline-none"
                        />
                      );
                    })}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              {/* Center Overlay */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center px-12">
                {activeItem ? (
                  <div className="space-y-0.5 max-w-[145px]">
                    <div
                      className="text-xs font-mono tabular-nums font-black"
                      style={{ color: activeItem.color }}
                    >
                      {activeItem.sharePercent.toFixed(1)}%
                    </div>
                    <div className="text-xs font-bold text-slate-900 leading-tight">
                      {activeItem.label}
                    </div>
                    <div className="text-sm font-black font-mono text-slate-900 tabular-nums">
                      {basis === 'REVENUE'
                        ? formatRupiah(activeItem.revenue)
                        : `${formatNumber(activeItem.txCount)} Trx`}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold tabular-nums">
                      {basis === 'REVENUE'
                        ? `${formatNumber(activeItem.txCount)} transaksi`
                        : formatRupiah(activeItem.revenue)}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5 max-w-[145px]">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {basis === 'REVENUE' ? 'Total Omzet' : 'Total Transaksi'}
                    </span>
                    <div className="text-sm sm:text-base font-black font-mono text-slate-900 tabular-nums leading-tight">
                      {basis === 'REVENUE'
                        ? formatRupiah(totalRevenue)
                        : `${formatNumber(totalTxCount)} Trx`}
                    </div>
                    <div className="text-[11px] font-bold text-sky-600">
                      {activeSlices.length} Kanal Aktif
                    </div>
                    <div className="text-[10px] text-slate-400 tabular-nums">
                      {basis === 'REVENUE'
                        ? `${formatNumber(totalTxCount)} nota kasir`
                        : formatRupiah(totalRevenue)}
                    </div>
                  </div>
                )}
              </div>
            </AnimatedChartStage>

            {/* Right: 5 Payment Method Breakdown Rows */}
            <div className="lg:col-span-7 space-y-2">
              {allBuckets.map((item) => {
                const isActive = focusedKey === item.key;
                const isPinned = pinnedKey === item.key;
                const isDimmed = focusedKey !== null && !isActive;

                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => {
                      if (item.value > 0) setHoveredKey(item.key);
                    }}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={() => {
                      if (item.value <= 0) return;
                      sound.playTap();
                      setPinnedKey((prev) => (prev === item.key ? null : item.key));
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      item.value > 0 ? 'cursor-pointer' : 'cursor-default opacity-65'
                    } ${
                      isActive
                        ? 'bg-slate-50 border-slate-900'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                    } ${isDimmed ? 'opacity-55' : 'opacity-100'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: item.color }}
                        >
                          {getBucketIcon(item.key, 'w-4 h-4')}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">
                              {item.label}
                            </span>
                            {isPinned && (
                              <span className="text-[10px] font-bold text-slate-600">
                                · Terkunci
                              </span>
                            )}
                            {item.key === 'PIUTANG' && item.unpaidAmount > 0 && (
                              <span className="text-[11px] font-mono tabular-nums font-bold text-rose-700">
                                · Belum Lunas {formatRupiah(item.unpaidAmount)}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap mt-0.5 tabular-nums">
                            <span>{formatNumber(item.txCount)} transaksi</span>
                            <span aria-hidden="true">·</span>
                            <span>Rata-rata nota {formatRupiah(item.avgTicket)}</span>
                            {hasPreviousRange && item.revenueGrowthPercent !== null && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-mono font-semibold ${
                                    item.revenueGrowthPercent >= 0
                                      ? 'text-emerald-700'
                                      : 'text-rose-700'
                                  }`}
                                >
                                  {item.revenueGrowthPercent >= 0 ? '+' : ''}
                                  {item.revenueGrowthPercent.toFixed(1)}% vs {previousLabel}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-xs sm:text-sm text-slate-900 tabular-nums">
                          {formatRupiah(item.revenue)}
                        </div>
                        <div
                          className="text-[11px] font-mono font-bold tabular-nums"
                          style={{ color: item.color }}
                        >
                          {item.sharePercent.toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Share Progress Bar */}
                    <div className="mt-2 flex items-center gap-2.5">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${item.value > 0 ? Math.min(100, Math.max(3, item.sharePercent)) : 0}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-slate-500 tabular-nums shrink-0 w-24 text-right">
                        {basis === 'REVENUE'
                          ? `${item.txSharePercent.toFixed(0)}% freq`
                          : `${item.revenueSharePercent.toFixed(0)}% omzet`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer Note */}
        {activeSlices.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Dominasi Pembayaran:{' '}
              <strong className="text-slate-800">{topBucket?.label}</strong> menyumbang{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                {topBucket?.revenueSharePercent.toFixed(1)}%
              </strong>{' '}
              omzet ({formatNumber(topBucket?.txCount || 0)} dari {formatNumber(totalTxCount)} transaksi).
            </span>
            <span className="text-[11px] text-slate-400">
              {viewMode === 'DONUT'
                ? 'Klik kanal atau irisan donat untuk fokus detail, atau beralih ke Tabel Rincian.'
                : 'Klik Grafik Donat untuk melihat visualisasi proporsi interaktif.'}
            </span>
          </div>
        )}
      </div>
    </ChartFullscreenShell>
  );
};
