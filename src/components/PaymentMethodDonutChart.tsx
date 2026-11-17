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
} from 'lucide-react';
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
  periodLabel: string;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

type PaymentBucketKey = 'CASH' | 'QRIS' | 'TRANSFER' | 'EDC' | 'PIUTANG';
type DonutBasis = 'REVENUE' | 'TX_COUNT';

interface PaymentBucketRow {
  key: PaymentBucketKey;
  label: string;
  description: string;
  color: string;
  revenue: number;
  txCount: number;
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
  description: string;
  color: string;
}> = [
  {
    key: 'CASH',
    label: 'Cash (Tunai)',
    description: 'Pembayaran tunai langsung di kasir',
    color: '#10b981', // emerald-500
  },
  {
    key: 'QRIS',
    label: 'QRIS',
    description: 'Scan QRIS dompet digital & mobile banking',
    color: '#0ea5e9', // sky-500
  },
  {
    key: 'TRANSFER',
    label: 'Transfer',
    description: 'Transfer rekening bank / virtual account',
    color: '#6366f1', // indigo-500
  },
  {
    key: 'EDC',
    label: 'EDC (Kartu)',
    description: 'Kartu Debit / Kredit via mesin EDC',
    color: '#f59e0b', // amber-500
  },
  {
    key: 'PIUTANG',
    label: 'Piutang (Tempo)',
    description: 'Transaksi tempo / kasbon pelanggan',
    color: '#f43f5e', // rose-500
  },
];

const classifyPaymentMethod = (rawMethod: string): PaymentBucketKey => {
  const m = String(rawMethod || 'CASH').trim().toUpperCase();
  if (m.includes('QRIS')) return 'QRIS';
  if (m.includes('TRANSFER') || m.includes('BANK') || m.includes('VA')) return 'TRANSFER';
  if (
    m.includes('EDC') ||
    m.includes('CARD') ||
    m.includes('DEBIT') ||
    m.includes('KREDIT') ||
    m.includes('CREDIT')
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
  periodLabel,
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette } = useChartTheme();
  const [basis, setBasis] = useState<DonutBasis>('REVENUE');
  const [hoveredKey, setHoveredKey] = useState<PaymentBucketKey | null>(null);
  const [pinnedKey, setPinnedKey] = useState<PaymentBucketKey | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const {
    allBuckets,
    activeSlices,
    totalRevenue,
    totalTxCount,
    topBucket,
  } = useMemo(() => {
    const isFiltered = hiddenCategorySet.size > 0;
    const aggMap = new Map<
      PaymentBucketKey,
      { revenue: number; txCount: number; unpaidAmount: number }
    >();

    BUCKET_DEFINITIONS.forEach((def) => {
      aggMap.set(def.key, { revenue: 0, txCount: 0, unpaidAmount: 0 });
    });

    transactions.forEach((tx) => {
      if (tx.timestamp < currentStart || tx.timestamp > currentEnd) return;

      let matchedRevenue = tx.finalAmount || 0;
      let hasMatch = !isFiltered;

      if (isFiltered) {
        matchedRevenue = 0;
        hasMatch = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (!hiddenCategorySet.has(catName)) {
            matchedRevenue += item.totalAmount || 0;
            hasMatch = true;
          }
        });
      }

      if (!hasMatch) return;

      const bucketKey = classifyPaymentMethod(tx.paymentMethod);
      const entry = aggMap.get(bucketKey)!;
      entry.revenue += matchedRevenue;
      entry.txCount += 1;
      if (bucketKey === 'PIUTANG' && tx.paymentStatus !== 'LUNAS') {
        entry.unpaidAmount += matchedRevenue;
      }
    });

    let totRev = 0;
    let totTx = 0;
    aggMap.forEach((v) => {
      totRev += v.revenue;
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

      return {
        key: def.key,
        label: def.label,
        description: def.description,
        color: bucketColorByKey[def.key] || def.color,
        revenue: stats.revenue,
        txCount: stats.txCount,
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
      totalTxCount: totTx,
      topBucket: top,
    };
  }, [transactions, productMap, currentStart, currentEnd, hiddenCategorySet, basis, palette]);

  const focusedKey = hoveredKey ?? pinnedKey;
  const activeItem = focusedKey
    ? allBuckets.find((b) => b.key === focusedKey) || null
    : null;

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Distribusi Metode Pembayaran (Cash, QRIS, Transfer, EDC, Piutang)"
    >
    <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <div className="flex items-center flex-wrap gap-2">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-sky-600" />
              <span>Distribusi Metode Pembayaran (Cash, QRIS, Transfer, EDC, Piutang)</span>
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
              {periodLabel}
            </span>
            {topBucket && (
              <span
                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold text-white shadow-2xs"
                style={{ backgroundColor: topBucket.color }}
              >
                Favorit: {topBucket.label} ({topBucket.sharePercent.toFixed(1)}%)
              </span>
            )}
            {specificSelectedCategoryName ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                Kategori: {specificSelectedCategoryName}
              </span>
            ) : isCategoryFiltered ? (
              <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {activeCategoryCount}/{totalCategoriesCount} Kategori
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">
            Persentase preferensi kanal pembayaran pelanggan untuk evaluasi biaya transaksi, likuiditas tunai, dan pengawasan piutang.
          </p>
        </div>

        {/* Basis Toggle */}
        <div className="flex items-center gap-2 flex-wrap">
          {pinnedKey && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setPinnedKey(null);
              }}
              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              Reset Fokus
            </button>
          )}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setBasis('REVENUE');
              }}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                basis === 'REVENUE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
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
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                basis === 'TX_COUNT'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Jumlah Transaksi
            </button>
          </div>

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
      ) : activeSlices.length === 0 ? (
        <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs text-center gap-2 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 p-6">
          <Wallet className="w-8 h-8 text-slate-300" />
          <p className="font-semibold text-slate-600">
            Belum ada transaksi pembayaran tercatat pada periode {periodLabel}.
          </p>
        </div>
      ) : (
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
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/10 text-sky-300 font-mono">
                            {item.sharePercent.toFixed(1)}%
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-slate-400 font-sans">Total Nominal:</span>
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
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black text-white shadow-2xs"
                    style={{ backgroundColor: activeItem.color }}
                  >
                    {activeItem.sharePercent.toFixed(1)}%
                  </span>
                  <div className="text-xs font-bold text-slate-900 leading-tight pt-0.5">
                    {activeItem.label}
                  </div>
                  <div className="text-sm font-black font-mono text-slate-900 tabular-nums">
                    {basis === 'REVENUE'
                      ? formatRupiah(activeItem.revenue)
                      : `${formatNumber(activeItem.txCount)} Trx`}
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold">
                    {basis === 'REVENUE'
                      ? `${formatNumber(activeItem.txCount)} transaksi`
                      : formatRupiah(activeItem.revenue)}
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5 max-w-[145px]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {basis === 'REVENUE' ? 'Total Pembayaran' : 'Total Transaksi'}
                  </span>
                  <div className="text-sm sm:text-base font-black font-mono text-slate-900 tabular-nums leading-tight">
                    {basis === 'REVENUE'
                      ? formatRupiah(totalRevenue)
                      : `${formatNumber(totalTxCount)} Trx`}
                  </div>
                  <div className="text-[11px] font-bold text-sky-600">
                    {activeSlices.length} Kanal Aktif
                  </div>
                  <div className="text-[10px] text-slate-400">
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
                  className={`w-full text-left p-3 rounded-2xl border transition-all ${
                    item.value > 0 ? 'cursor-pointer' : 'cursor-default opacity-65'
                  } ${
                    isActive
                      ? 'bg-slate-50 border-slate-900 shadow-xs scale-[1.01]'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
                  } ${isDimmed ? 'opacity-55' : 'opacity-100'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs"
                        style={{ backgroundColor: item.color }}
                      >
                        {getBucketIcon(item.key, 'w-4 h-4')}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs sm:text-sm">
                            {item.label}
                          </span>
                          {isPinned && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-900 text-white">
                              Terkunci
                            </span>
                          )}
                          {item.key === 'PIUTANG' && item.unpaidAmount > 0 && (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              Belum Lunas: {formatRupiah(item.unpaidAmount)}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                          <span>{formatNumber(item.txCount)} transaksi</span>
                          <span>•</span>
                          <span>Rata-rata nota: {formatRupiah(item.avgTicket)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-xs sm:text-sm text-slate-900 tabular-nums">
                        {formatRupiah(item.revenue)}
                      </div>
                      <div className="text-[11px] font-mono font-bold tabular-nums" style={{ color: item.color }}>
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
                    <span className="text-[10.5px] font-mono font-semibold text-slate-500 tabular-nums shrink-0 w-24 text-right">
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
            <strong className="font-mono text-slate-900">
              {topBucket?.revenueSharePercent.toFixed(1)}%
            </strong>{' '}
            omzet ({formatNumber(topBucket?.txCount || 0)} dari {formatNumber(totalTxCount)} transaksi).
          </span>
          <span className="text-[10.5px] text-slate-400">
            * Klik kanal atau irisan donut untuk mengunci fokus detail metode pembayaran.
          </span>
        </div>
      )}
    </div>
    </ChartFullscreenShell>
  );
};
