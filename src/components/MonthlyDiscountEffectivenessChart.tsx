import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';
import {
  BadgePercent,
  Crown,
  Tag,
  Calendar,
  TrendingUp,
  EyeOff,
  RotateCcw,
  Award,
} from 'lucide-react';
import { Transaction, Product } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface MonthlyDiscountEffectivenessChartProps {
  transactions: Transaction[];
  productMap: Map<string, Product>;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

type MonthHorizon = 6 | 12;
type VolumeMetricMode = 'UNITS' | 'REVENUE' | 'TX_COUNT';
type ChartLayoutMode = 'GROUPED' | 'STACKED';

interface MonthlyDiscountBucket {
  monthKey: string;
  monthLabel: string;
  fullMonthLabel: string;
  // Mutually exclusive segments so totals add to 100% of monthly volume
  membershipUnits: number;
  promoUnits: number;
  comboUnits: number;
  normalUnits: number;
  totalUnits: number;
  membershipRevenue: number;
  promoRevenue: number;
  comboRevenue: number;
  normalRevenue: number;
  totalRevenue: number;
  membershipTx: number;
  promoTx: number;
  comboTx: number;
  normalTx: number;
  totalTx: number;
  membershipDiscountRp: number;
  promoDiscountRp: number;
  totalDiscountRp: number;
  discountedVolumeSharePct: number;
}

const getMonthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const MonthlyDiscountEffectivenessChart: React.FC<
  MonthlyDiscountEffectivenessChartProps
> = ({
  transactions,
  productMap,
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette } = useChartTheme();
  const [monthHorizon, setMonthHorizon] = useState<MonthHorizon>(6);
  const [metricMode, setMetricMode] = useState<VolumeMetricMode>('UNITS');
  const [layoutMode, setLayoutMode] = useState<ChartLayoutMode>('GROUPED');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const analysis = useMemo(() => {
    const now = new Date();
    const isFiltered = hiddenCategorySet.size > 0;

    // Build chronological buckets for the selected horizon ending in current month
    const buckets: MonthlyDiscountBucket[] = [];
    const bucketByKey = new Map<string, MonthlyDiscountBucket>();

    for (let i = monthHorizon - 1; i >= 0; i--) {
      const mDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = getMonthKey(mDate);
      const shortLabel = mDate.toLocaleDateString('id-ID', {
        month: 'short',
        year: '2-digit',
      });
      const fullLabel = mDate.toLocaleDateString('id-ID', {
        month: 'long',
        year: 'numeric',
      });

      const bucket: MonthlyDiscountBucket = {
        monthKey: key,
        monthLabel: shortLabel,
        fullMonthLabel: fullLabel,
        membershipUnits: 0,
        promoUnits: 0,
        comboUnits: 0,
        normalUnits: 0,
        totalUnits: 0,
        membershipRevenue: 0,
        promoRevenue: 0,
        comboRevenue: 0,
        normalRevenue: 0,
        totalRevenue: 0,
        membershipTx: 0,
        promoTx: 0,
        comboTx: 0,
        normalTx: 0,
        totalTx: 0,
        membershipDiscountRp: 0,
        promoDiscountRp: 0,
        totalDiscountRp: 0,
        discountedVolumeSharePct: 0,
      };
      buckets.push(bucket);
      bucketByKey.set(key, bucket);
    }

    const rangeStartMs = new Date(
      now.getFullYear(),
      now.getMonth() - (monthHorizon - 1),
      1,
      0,
      0,
      0,
      0
    ).getTime();
    const rangeEndMs = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    ).getTime();

    // Inclusive aggregates for Effectiveness comparison (Membership vs Promo vs Normal)
    let memberTotalUnits = 0;
    let memberTotalRevenue = 0;
    let memberTotalTx = 0;
    let memberTotalDiscRp = 0;

    let promoTotalUnits = 0;
    let promoTotalRevenue = 0;
    let promoTotalTx = 0;
    let promoTotalDiscRp = 0;

    let normalTotalUnits = 0;
    let normalTotalRevenue = 0;
    let normalTotalTx = 0;

    let hasAnyComboTx = false;

    transactions.forEach((tx) => {
      if (tx.timestamp < rangeStartMs || tx.timestamp > rangeEndMs) return;
      const mKey = getMonthKey(new Date(tx.timestamp));
      const bucket = bucketByKey.get(mKey);
      if (!bucket) return;

      let visibleUnits = 0;
      let visibleItemSubtotal = 0;
      let visibleItemPromoSavings = 0;
      let hasVisibleSpecialPromoPrice = false;
      let hasVisibleItem = !isFiltered;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        if (isFiltered && hiddenCategorySet.has(catName)) return;

        hasVisibleItem = true;
        const qty = Number(item.quantity) || 0;
        const conv = Number(item.conversionFactor) || 1;
        visibleUnits += qty * conv;
        visibleItemSubtotal += Number(item.totalAmount) || 0;

        // Check special/promo price at item level compared to catalog standard unit price
        if (prod && !item.isQuickSale) {
          const matchedUnit =
            prod.units?.find((u) => u.unitName === item.unitName) ||
            prod.units?.find((u) => u.conversionFactor === conv);
          const catalogPrice =
            matchedUnit?.sellingPrice ??
            (prod.units?.[0]?.sellingPrice ? prod.units[0].sellingPrice * conv : 0);
          if (catalogPrice > item.unitPrice && qty > 0) {
            visibleItemPromoSavings += (catalogPrice - item.unitPrice) * qty;
            hasVisibleSpecialPromoPrice = true;
          }
        }
        if (item.isCustomerSpecialPrice) {
          hasVisibleSpecialPromoPrice = true;
        }
      });

      if (!hasVisibleItem) return;

      const rawSubtotal = Number(tx.subtotal) || visibleItemSubtotal || 0;
      const categoryRatio =
        isFiltered && rawSubtotal > 0
          ? Math.min(1, Math.max(0, visibleItemSubtotal / rawSubtotal))
          : 1;

      const effectiveRevenue = isFiltered
        ? visibleItemSubtotal *
          (rawSubtotal > 0 && tx.finalAmount < rawSubtotal
            ? tx.finalAmount / rawSubtotal
            : 1)
        : Number(tx.finalAmount) || 0;

      // Classify Membership Discount (Tier Discount %/Rp OR Loyalty Point Redemption by Member)
      const explicitMemberTierDisc =
        Number(tx.membershipDiscountAmount) > 0
          ? Number(tx.membershipDiscountAmount)
          : Number(tx.membershipDiscountPercent) > 0
          ? Math.round(rawSubtotal * (Number(tx.membershipDiscountPercent) / 100))
          : 0;
      const pointsDisc = Math.max(0, Number(tx.pointsDiscountAmount) || 0);
      const rawMemberDiscRp = explicitMemberTierDisc + pointsDisc;

      // Classify Promo Discount (Extra invoice promo/manual discount + item special/promo price)
      const invoiceExtraPromoRp = Math.max(
        0,
        (Number(tx.discount) || 0) - explicitMemberTierDisc
      );
      const rawPromoDiscRp = invoiceExtraPromoRp + visibleItemPromoSavings;

      const scaledMemberDiscRp = Math.round(rawMemberDiscRp * categoryRatio);
      const scaledPromoDiscRp = Math.round(
        invoiceExtraPromoRp * categoryRatio + visibleItemPromoSavings
      );

      const usesMembership = rawMemberDiscRp > 0;
      const usesPromo = invoiceExtraPromoRp > 0 || hasVisibleSpecialPromoPrice;

      // Update monthly non-overlapping segment buckets
      bucket.totalUnits += visibleUnits;
      bucket.totalRevenue += effectiveRevenue;
      bucket.totalTx += 1;
      bucket.membershipDiscountRp += scaledMemberDiscRp;
      bucket.promoDiscountRp += scaledPromoDiscRp;
      bucket.totalDiscountRp += scaledMemberDiscRp + scaledPromoDiscRp;

      if (usesMembership && usesPromo) {
        hasAnyComboTx = true;
        bucket.comboUnits += visibleUnits;
        bucket.comboRevenue += effectiveRevenue;
        bucket.comboTx += 1;
      } else if (usesMembership) {
        bucket.membershipUnits += visibleUnits;
        bucket.membershipRevenue += effectiveRevenue;
        bucket.membershipTx += 1;
      } else if (usesPromo) {
        bucket.promoUnits += visibleUnits;
        bucket.promoRevenue += effectiveRevenue;
        bucket.promoTx += 1;
      } else {
        bucket.normalUnits += visibleUnits;
        bucket.normalRevenue += effectiveRevenue;
        bucket.normalTx += 1;
      }

      // Inclusive KPI comparison buckets
      if (usesMembership) {
        memberTotalUnits += visibleUnits;
        memberTotalRevenue += effectiveRevenue;
        memberTotalTx += 1;
        memberTotalDiscRp += scaledMemberDiscRp;
      }
      if (usesPromo) {
        promoTotalUnits += visibleUnits;
        promoTotalRevenue += effectiveRevenue;
        promoTotalTx += 1;
        promoTotalDiscRp += scaledPromoDiscRp;
      }
      if (!usesMembership && !usesPromo) {
        normalTotalUnits += visibleUnits;
        normalTotalRevenue += effectiveRevenue;
        normalTotalTx += 1;
      }
    });

    let storeUnitsAll = 0;
    let storeDiscountedUnits = 0;
    let storeRevenueAll = 0;
    let storeDiscountRpAll = 0;
    let totalTxAll = 0;

    buckets.forEach((b) => {
      const discUnits = b.membershipUnits + b.promoUnits + b.comboUnits;
      b.discountedVolumeSharePct =
        b.totalUnits > 0 ? Number(((discUnits / b.totalUnits) * 100).toFixed(1)) : 0;
      storeUnitsAll += b.totalUnits;
      storeDiscountedUnits += discUnits;
      storeRevenueAll += b.totalRevenue;
      storeDiscountRpAll += b.totalDiscountRp;
      totalTxAll += b.totalTx;
    });

    const normalAvgUnitsPerTx = normalTotalTx > 0 ? normalTotalUnits / normalTotalTx : 0;
    const memberAvgUnitsPerTx = memberTotalTx > 0 ? memberTotalUnits / memberTotalTx : 0;
    const promoAvgUnitsPerTx = promoTotalTx > 0 ? promoTotalUnits / promoTotalTx : 0;

    const memberVolumeLiftPct =
      normalAvgUnitsPerTx > 0 && memberTotalTx > 0
        ? ((memberAvgUnitsPerTx - normalAvgUnitsPerTx) / normalAvgUnitsPerTx) * 100
        : null;
    const promoVolumeLiftPct =
      normalAvgUnitsPerTx > 0 && promoTotalTx > 0
        ? ((promoAvgUnitsPerTx - normalAvgUnitsPerTx) / normalAvgUnitsPerTx) * 100
        : null;

    // Revenue generated per Rp 1 of discount cost (Sales ROI Multiplier)
    const memberRevenueMultiplier =
      memberTotalDiscRp > 0 ? memberTotalRevenue / memberTotalDiscRp : null;
    const promoRevenueMultiplier =
      promoTotalDiscRp > 0 ? promoTotalRevenue / promoTotalDiscRp : null;

    // Units sold per Rp 100.000 discount granted
    const memberUnitsPer100kDisc =
      memberTotalDiscRp > 0 ? (memberTotalUnits / memberTotalDiscRp) * 100000 : null;
    const promoUnitsPer100kDisc =
      promoTotalDiscRp > 0 ? (promoTotalUnits / promoTotalDiscRp) * 100000 : null;

    // Determine winner / comparative verdict
    let effectiveWinner: 'MEMBERSHIP' | 'PROMO' | 'BALANCED' | 'NO_DISCOUNT' = 'NO_DISCOUNT';
    if (memberTotalTx > 0 || promoTotalTx > 0) {
      if (memberTotalTx > 0 && promoTotalTx === 0) {
        effectiveWinner = 'MEMBERSHIP';
      } else if (promoTotalTx > 0 && memberTotalTx === 0) {
        effectiveWinner = 'PROMO';
      } else {
        // Compare normalized volume efficiency + basket size
        const mScore =
          (memberUnitsPer100kDisc ?? 0) * 0.6 + memberAvgUnitsPerTx * 10;
        const pScore =
          (promoUnitsPer100kDisc ?? 0) * 0.6 + promoAvgUnitsPerTx * 10;
        if (Math.abs(mScore - pScore) < 1) {
          effectiveWinner = 'BALANCED';
        } else {
          effectiveWinner = mScore > pScore ? 'MEMBERSHIP' : 'PROMO';
        }
      }
    }

    const discountedSharePct =
      storeUnitsAll > 0 ? (storeDiscountedUnits / storeUnitsAll) * 100 : 0;

    const rangeLabel =
      buckets.length >= 2
        ? `${buckets[0].monthLabel} – ${buckets[buckets.length - 1].monthLabel}`
        : buckets[0]?.fullMonthLabel || '';

    return {
      buckets,
      rangeLabel,
      hasAnyData: totalTxAll > 0,
      hasAnyComboTx,
      hasAnyDiscountTx: memberTotalTx > 0 || promoTotalTx > 0,
      storeUnitsAll,
      storeDiscountedUnits,
      discountedSharePct,
      storeRevenueAll,
      storeDiscountRpAll,
      totalTxAll,
      memberTotalUnits,
      memberTotalRevenue,
      memberTotalTx,
      memberTotalDiscRp,
      memberAvgUnitsPerTx,
      memberVolumeLiftPct,
      memberRevenueMultiplier,
      memberUnitsPer100kDisc,
      promoTotalUnits,
      promoTotalRevenue,
      promoTotalTx,
      promoTotalDiscRp,
      promoAvgUnitsPerTx,
      promoVolumeLiftPct,
      promoRevenueMultiplier,
      promoUnitsPer100kDisc,
      normalTotalUnits,
      normalTotalRevenue,
      normalTotalTx,
      normalAvgUnitsPerTx,
      effectiveWinner,
    };
  }, [transactions, productMap, hiddenCategorySet, monthHorizon]);

  const seriesKeys = useMemo(() => {
    if (metricMode === 'UNITS') {
      return {
        membership: 'membershipUnits',
        promo: 'promoUnits',
        combo: 'comboUnits',
        normal: 'normalUnits',
        unitSuffix: 'unit',
      };
    }
    if (metricMode === 'REVENUE') {
      return {
        membership: 'membershipRevenue',
        promo: 'promoRevenue',
        combo: 'comboRevenue',
        normal: 'normalRevenue',
        unitSuffix: 'Rp',
      };
    }
    return {
      membership: 'membershipTx',
      promo: 'promoTx',
      combo: 'comboTx',
      normal: 'normalTx',
      unitSuffix: 'trx',
    };
  }, [metricMode]);

  const stackIdProp = layoutMode === 'STACKED' ? 'monthlyVol' : undefined;

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Analisis Efektivitas Diskon (Membership vs Promo) Terhadap Volume Penjualan Bulanan"
    >
      <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
        {/* Header Row */}
        <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-3.5 pb-4 border-b border-slate-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
                <BadgePercent className="w-4 h-4 shrink-0" style={{ color: palette.secondary }} />
                <span>Efektivitas Diskon (Membership vs Promo) vs Volume Penjualan Bulanan</span>
              </h3>
              <span className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 inline-flex items-center gap-1">
                <Calendar className="w-3 h-3 shrink-0" />
                <span>{analysis.rangeLabel}</span>
              </span>
              {analysis.effectiveWinner === 'MEMBERSHIP' && (
                <span className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200 inline-flex items-center gap-1">
                  <Crown className="w-3 h-3 shrink-0" />
                  <span>Membership Lebih Efektif</span>
                </span>
              )}
              {analysis.effectiveWinner === 'PROMO' && (
                <span className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1">
                  <Tag className="w-3 h-3 shrink-0" />
                  <span>Promo Lebih Efektif</span>
                </span>
              )}
              {specificSelectedCategoryName ? (
                <span className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                  Kategori: {specificSelectedCategoryName}
                </span>
              ) : isCategoryFiltered ? (
                <span className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {activeCategoryCount}/{totalCategoriesCount} Kategori
                </span>
              ) : null}
            </div>
            <p className="text-xs text-slate-500">
              Membandingkan kontribusi volume penjualan bulanan antara transaksi berdiskon{' '}
              <span className="font-semibold text-indigo-700">Membership (Tier &amp; Redeem Poin)</span>,{' '}
              <span className="font-semibold text-amber-700">Promo (Diskon Nota &amp; Harga Khusus)</span>, dan{' '}
              <span className="font-semibold text-slate-700">Harga Normal</span>.
            </p>
          </div>

          {/* Interactive Controls + Full Screen */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {/* Horizon Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMonthHorizon(6);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  monthHorizon === 6
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                6 Bulan
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMonthHorizon(12);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  monthHorizon === 12
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                12 Bulan
              </button>
            </div>

            {/* Metric Selector */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMetricMode('UNITS');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  metricMode === 'UNITS'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Volume (Unit)
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMetricMode('REVENUE');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  metricMode === 'REVENUE'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Omzet (Rp)
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMetricMode('TX_COUNT');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  metricMode === 'TX_COUNT'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Transaksi
              </button>
            </div>

            {/* Bar Layout Toggle */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setLayoutMode('GROUPED');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  layoutMode === 'GROUPED'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Berdampingan
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setLayoutMode('STACKED');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  layoutMode === 'STACKED'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tumpuk
              </button>
            </div>

            <FullscreenToggleButton
              isFullscreen={isFullscreen}
              onToggle={() => setIsFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Hairline-Divided Comparative Effectiveness KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border border-slate-200 rounded-2xl bg-slate-50/50">
          {/* 1. Diskon Membership Effectiveness */}
          <div className="p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 shrink-0" />
                <span>Diskon Membership</span>
              </span>
              {analysis.memberVolumeLiftPct !== null && (
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    analysis.memberVolumeLiftPct >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                  title="Selisih rata-rata unit/transaksi dibanding Harga Normal"
                >
                  {analysis.memberVolumeLiftPct >= 0 ? '+' : ''}
                  {analysis.memberVolumeLiftPct.toFixed(1)}% vol/trx
                </span>
              )}
            </div>
            <div className="text-lg font-black font-mono text-slate-900 tabular-nums">
              {formatNumber(analysis.memberTotalUnits)}{' '}
              <span className="text-xs font-sans font-semibold text-slate-500">unit</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums space-y-0.5">
              <div>
                {formatNumber(analysis.memberTotalTx)} trx · rata-rata{' '}
                <strong className="text-slate-800">
                  {analysis.memberAvgUnitsPerTx.toFixed(1)} unit/trx
                </strong>
              </div>
              <div className="text-indigo-700 font-sans font-semibold">
                Biaya: {formatRupiah(analysis.memberTotalDiscRp)}
                {analysis.memberRevenueMultiplier !== null &&
                  ` (${analysis.memberRevenueMultiplier.toFixed(1)}x omzet/Rp)`}
              </div>
            </div>
          </div>

          {/* 2. Diskon Promo Effectiveness */}
          <div className="p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 shrink-0" />
                <span>Diskon Promo</span>
              </span>
              {analysis.promoVolumeLiftPct !== null && (
                <span
                  className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                    analysis.promoVolumeLiftPct >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                  title="Selisih rata-rata unit/transaksi dibanding Harga Normal"
                >
                  {analysis.promoVolumeLiftPct >= 0 ? '+' : ''}
                  {analysis.promoVolumeLiftPct.toFixed(1)}% vol/trx
                </span>
              )}
            </div>
            <div className="text-lg font-black font-mono text-slate-900 tabular-nums">
              {formatNumber(analysis.promoTotalUnits)}{' '}
              <span className="text-xs font-sans font-semibold text-slate-500">unit</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums space-y-0.5">
              <div>
                {formatNumber(analysis.promoTotalTx)} trx · rata-rata{' '}
                <strong className="text-slate-800">
                  {analysis.promoAvgUnitsPerTx.toFixed(1)} unit/trx
                </strong>
              </div>
              <div className="text-amber-700 font-sans font-semibold">
                Biaya: {formatRupiah(analysis.promoTotalDiscRp)}
                {analysis.promoRevenueMultiplier !== null &&
                  ` (${analysis.promoRevenueMultiplier.toFixed(1)}x omzet/Rp)`}
              </div>
            </div>
          </div>

          {/* 3. Baseline Tanpa Diskon */}
          <div className="p-3.5 space-y-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
              Harga Normal (Tanpa Diskon)
            </div>
            <div className="text-lg font-black font-mono text-slate-900 tabular-nums">
              {formatNumber(analysis.normalTotalUnits)}{' '}
              <span className="text-xs font-sans font-semibold text-slate-500">unit</span>
            </div>
            <div className="text-[11px] text-slate-500 font-mono tabular-nums space-y-0.5">
              <div>
                {formatNumber(analysis.normalTotalTx)} trx · rata-rata{' '}
                <strong className="text-slate-800">
                  {analysis.normalAvgUnitsPerTx.toFixed(1)} unit/trx
                </strong>
              </div>
              <div className="text-slate-600 font-sans">
                Omzet: {formatRupiah(analysis.normalTotalRevenue)}
              </div>
            </div>
          </div>

          {/* 4. Pangsa & Verdict Efektivitas */}
          <div className="p-3.5 space-y-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
              <Award className="w-3.5 h-3.5 shrink-0" />
              <span>Pangsa Volume Berdiskon</span>
            </div>
            <div className="text-lg font-black font-mono text-emerald-800 tabular-nums">
              {analysis.discountedSharePct.toFixed(1)}%{' '}
              <span className="text-xs font-sans font-semibold text-slate-500">
                ({formatNumber(analysis.storeDiscountedUnits)} unit)
              </span>
            </div>
            <div className="text-[11px] text-slate-600 leading-snug">
              {analysis.effectiveWinner === 'NO_DISCOUNT' ? (
                'Belum ada pemakaian diskon/poin pada rentang bulan ini.'
              ) : analysis.effectiveWinner === 'MEMBERSHIP' ? (
                <span>
                  <strong className="text-indigo-700">Membership</strong> lebih efisien mendorong volume penjualan bulanan.
                </span>
              ) : analysis.effectiveWinner === 'PROMO' ? (
                <span>
                  <strong className="text-amber-700">Promo</strong> lebih agresif mendongkrak volume unit bulanan.
                </span>
              ) : (
                <span>
                  Efektivitas <strong className="text-slate-800">Membership &amp; Promo seimbang</strong> dalam mendongkrak volume.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Main Composed Chart */}
        <AnimatedChartStage
          filterKey={`disc-eff-${monthHorizon}-${metricMode}-${layoutMode}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
          accent="indigo"
          delayMs={90}
          className={isFullscreen ? 'w-full h-[58vh] min-h-[380px]' : 'w-full h-80 md:h-96'}
        >
          {activeCategoryCount === 0 && totalCategoriesCount > 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
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
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Tampilkan Semua Kategori</span>
              </button>
            </div>
          ) : !analysis.hasAnyData ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
              <TrendingUp className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-600">
                Belum ada transaksi penjualan pada rentang {analysis.rangeLabel} untuk dianalisis
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={analysis.buckets}
                margin={{ top: 18, right: 18, left: 6, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fontSize: 11, fill: '#475569', fontWeight: 700 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tickFormatter={(val) => {
                    if (metricMode === 'REVENUE') {
                      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                      if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                      return String(val);
                    }
                    return formatNumber(val);
                  }}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={false}
                  tickLine={false}
                  width={54}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(val) => `${val}%`}
                  tick={{ fontSize: 10.5, fill: '#0f766e', fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />

                <ReferenceLine
                  yAxisId="right"
                  y={50}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />

                <RechartsTooltip
                  cursor={{ fill: '#f1f5f9', opacity: 0.65 }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const row = payload[0]?.payload as MonthlyDiscountBucket | undefined;
                    if (!row) return null;

                    return (
                      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[275px] space-y-2 z-50">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                          <span className="font-bold text-slate-100">{row.fullMonthLabel}</span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                            {row.discountedVolumeSharePct.toFixed(1)}% berdiskon
                          </span>
                        </div>

                        <div className="space-y-1.5 font-mono text-[11px]">
                          <div className="flex justify-between items-center gap-3">
                            <span className="text-indigo-300 font-sans font-semibold flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-xs bg-indigo-500 inline-block" />
                              Membership:
                            </span>
                            <span className="font-bold text-white tabular-nums">
                              {formatNumber(row.membershipUnits)} unit · {formatNumber(row.membershipTx)} trx
                            </span>
                          </div>

                          <div className="flex justify-between items-center gap-3">
                            <span className="text-amber-300 font-sans font-semibold flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-xs bg-amber-500 inline-block" />
                              Promo / Khusus:
                            </span>
                            <span className="font-bold text-white tabular-nums">
                              {formatNumber(row.promoUnits)} unit · {formatNumber(row.promoTx)} trx
                            </span>
                          </div>

                          {analysis.hasAnyComboTx && (
                            <div className="flex justify-between items-center gap-3">
                              <span className="text-sky-300 font-sans font-semibold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-xs bg-sky-500 inline-block" />
                                Kombinasi:
                              </span>
                              <span className="font-bold text-white tabular-nums">
                                {formatNumber(row.comboUnits)} unit · {formatNumber(row.comboTx)} trx
                              </span>
                            </div>
                          )}

                          <div className="flex justify-between items-center gap-3">
                            <span className="text-slate-300 font-sans flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-xs bg-slate-400 inline-block" />
                              Harga Normal:
                            </span>
                            <span className="font-semibold text-slate-200 tabular-nums">
                              {formatNumber(row.normalUnits)} unit · {formatNumber(row.normalTx)} trx
                            </span>
                          </div>

                          <div className="pt-1.5 border-t border-slate-800 space-y-1">
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-400 font-sans">Total Volume Bulan:</span>
                              <span className="font-black text-emerald-300 tabular-nums">
                                {formatNumber(row.totalUnits)} unit ({formatRupiah(row.totalRevenue)})
                              </span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-400 font-sans">Potongan Member:</span>
                              <span className="font-bold text-indigo-300 tabular-nums">
                                {formatRupiah(row.membershipDiscountRp)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="text-slate-400 font-sans">Potongan Promo:</span>
                              <span className="font-bold text-amber-300 tabular-nums">
                                {formatRupiah(row.promoDiscountRp)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }}
                />

                <Bar
                  yAxisId="left"
                  dataKey={seriesKeys.membership}
                  name="Diskon Membership"
                  stackId={stackIdProp}
                  fill={palette.secondary}
                  radius={layoutMode === 'GROUPED' ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={true}
                  animationDuration={560}
                  animationEasing="ease-out"
                />
                <Bar
                  yAxisId="left"
                  dataKey={seriesKeys.promo}
                  name="Diskon Promo / Harga Khusus"
                  stackId={stackIdProp}
                  fill={palette.warning}
                  radius={layoutMode === 'GROUPED' ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={true}
                  animationDuration={560}
                  animationEasing="ease-out"
                />
                {analysis.hasAnyComboTx && (
                  <Bar
                    yAxisId="left"
                    dataKey={seriesKeys.combo}
                    name="Kombinasi Member + Promo"
                    stackId={stackIdProp}
                    fill={palette.primary}
                    radius={layoutMode === 'GROUPED' ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={true}
                    animationDuration={560}
                    animationEasing="ease-out"
                  />
                )}
                <Bar
                  yAxisId="left"
                  dataKey={seriesKeys.normal}
                  name="Tanpa Diskon (Normal)"
                  stackId={stackIdProp}
                  fill={palette.neutral}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={36}
                  isAnimationActive={true}
                  animationDuration={560}
                  animationEasing="ease-out"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="discountedVolumeSharePct"
                  name="Kontribusi Volume Berdiskon (%)"
                  stroke={palette.positive}
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: '#ffffff', stroke: palette.positive, strokeWidth: 2 }}
                  activeDot={{ r: 5.5, fill: palette.positive, stroke: '#ffffff', strokeWidth: 2 }}
                  isAnimationActive={true}
                  animationDuration={620}
                  animationEasing="ease-out"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </AnimatedChartStage>

        {/* Legend & Methodology Strip */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-3.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: palette.secondary }} />
              <span>Membership (Tier &amp; Poin)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: palette.warning }} />
              <span>Promo / Harga Khusus</span>
            </span>
            {analysis.hasAnyComboTx && (
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: palette.primary }} />
                <span>Kombinasi</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
              <span className="w-2.5 h-2.5 rounded-xs inline-block" style={{ backgroundColor: palette.neutral }} />
              <span>Tanpa Diskon</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <span className="w-3.5 h-0.5 inline-block rounded" style={{ backgroundColor: palette.positive }} />
              <span>Pangsa Volume Berdiskon (%)</span>
            </span>
          </div>

          <span className="text-[10.5px] text-slate-400">
            Total {formatNumber(analysis.totalTxAll)} transaksi • {formatNumber(analysis.storeUnitsAll)} unit ({formatRupiah(analysis.storeDiscountRpAll)} total diskon)
          </span>
        </div>
      </section>
    </ChartFullscreenShell>
  );
};
