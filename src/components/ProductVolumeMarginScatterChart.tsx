import React, { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { Crosshair, EyeOff, RotateCcw, Search } from 'lucide-react';
import { Product, Transaction } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { getItemFifoCogs } from '../utils/fifoUtils';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';

interface ProductVolumeMarginScatterChartProps {
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

type QuadrantType = 'STAR' | 'VOLUME_DRIVER' | 'HIGH_MARGIN_NICHE' | 'NEEDS_EVALUATION';

interface ProductScatterPoint {
  productId: string;
  name: string;
  category: string;
  baseUnit: string;
  unitsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
  marginPercent: number;
  txCount: number;
  quadrant: QuadrantType;
}

const QUADRANT_META: Record<
  QuadrantType,
  {
    label: string;
    shortDesc: string;
    recommendation: string;
    color: string;
    textClass: string;
    surfaceClass: string;
  }
> = {
  STAR: {
    label: 'Produk Bintang',
    shortDesc: 'Volume Tinggi · Margin Tinggi',
    recommendation: 'Pertahankan stok aman & tampilkan sebagai produk unggulan.',
    color: '#10b981',
    textClass: 'text-emerald-700',
    surfaceClass: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  VOLUME_DRIVER: {
    label: 'Andalan Volume',
    shortDesc: 'Volume Tinggi · Margin Rendah',
    recommendation: 'Evaluasi harga jual atau negosiasi HPP supplier agar margin naik.',
    color: '#0284c7',
    textClass: 'text-sky-700',
    surfaceClass: 'bg-sky-50 border-sky-200 text-sky-800',
  },
  HIGH_MARGIN_NICHE: {
    label: 'Potensial',
    shortDesc: 'Volume Rendah · Margin Tinggi',
    recommendation: 'Dorong volume lewat promo bundling, display kasir, atau upselling.',
    color: '#f59e0b',
    textClass: 'text-amber-700',
    surfaceClass: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  NEEDS_EVALUATION: {
    label: 'Perlu Evaluasi',
    shortDesc: 'Volume Rendah · Margin Rendah',
    recommendation: 'Tinjau ulang harga, biaya modal, atau pertimbangkan cuci gudang.',
    color: '#f43f5e',
    textClass: 'text-rose-700',
    surfaceClass: 'bg-rose-50 border-rose-200 text-rose-800',
  },
};

export const ProductVolumeMarginScatterChart: React.FC<ProductVolumeMarginScatterChartProps> = ({
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
  const [selectedQuadrant, setSelectedQuadrant] = useState<'ALL' | QuadrantType>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const { allPoints, avgUnits, avgMarginPercent, countsByQuadrant } = useMemo(() => {
    const isFiltered = hiddenCategorySet.size > 0;
    const aggMap = new Map<
      string,
      {
        productId: string;
        name: string;
        category: string;
        baseUnit: string;
        unitsSold: number;
        revenue: number;
        cogs: number;
        txIds: Set<string>;
      }
    >();

    transactions.forEach((tx) => {
      if (tx.timestamp < currentStart || tx.timestamp > currentEnd) return;

      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const category = (prod?.category || 'Umum').trim() || 'Umum';
        if (isFiltered && hiddenCategorySet.has(category)) return;

        const units = Math.max(0, item.quantity * (item.conversionFactor || 1));
        const rev = Math.max(0, item.totalAmount || 0);
        const cogs = Math.max(0, getItemFifoCogs(item, prod));
        if (units <= 0 && rev <= 0) return;

        const existing = aggMap.get(item.productId) || {
          productId: item.productId,
          name: item.productName || prod?.name || 'Produk',
          category,
          baseUnit: prod?.baseUnit || item.unitName || 'PCS',
          unitsSold: 0,
          revenue: 0,
          cogs: 0,
          txIds: new Set<string>(),
        };
        existing.unitsSold += units;
        existing.revenue += rev;
        existing.cogs += cogs;
        existing.txIds.add(tx.id);
        aggMap.set(item.productId, existing);
      });
    });

    const rawList = Array.from(aggMap.values()).filter((p) => p.unitsSold > 0 && p.revenue > 0);
    if (rawList.length === 0) {
      return {
        allPoints: [] as ProductScatterPoint[],
        avgUnits: 0,
        avgMarginPercent: 0,
        countsByQuadrant: {
          STAR: 0,
          VOLUME_DRIVER: 0,
          HIGH_MARGIN_NICHE: 0,
          NEEDS_EVALUATION: 0,
        },
      };
    }

    const totalUnitsAll = rawList.reduce((s, p) => s + p.unitsSold, 0);
    const meanUnits = totalUnitsAll / rawList.length;

    const margins = rawList.map((p) => ((p.revenue - p.cogs) / p.revenue) * 100);
    const meanMargin = margins.reduce((s, m) => s + m, 0) / margins.length;

    const counts: Record<QuadrantType, number> = {
      STAR: 0,
      VOLUME_DRIVER: 0,
      HIGH_MARGIN_NICHE: 0,
      NEEDS_EVALUATION: 0,
    };

    const points: ProductScatterPoint[] = rawList
      .map((p) => {
        const profit = p.revenue - p.cogs;
        const marginPercent = Number((((profit) / p.revenue) * 100).toFixed(1));
        const highVol = p.unitsSold >= meanUnits;
        const highMargin = marginPercent >= meanMargin;

        let quadrant: QuadrantType = 'NEEDS_EVALUATION';
        if (highVol && highMargin) quadrant = 'STAR';
        else if (highVol && !highMargin) quadrant = 'VOLUME_DRIVER';
        else if (!highVol && highMargin) quadrant = 'HIGH_MARGIN_NICHE';

        counts[quadrant] += 1;

        return {
          productId: p.productId,
          name: p.name,
          category: p.category,
          baseUnit: p.baseUnit,
          unitsSold: p.unitsSold,
          revenue: p.revenue,
          cogs: p.cogs,
          profit,
          marginPercent,
          txCount: p.txIds.size,
          quadrant,
        };
      })
      .sort((a, b) => b.profit - a.profit);

    return {
      allPoints: points,
      avgUnits: Number(meanUnits.toFixed(1)),
      avgMarginPercent: Number(meanMargin.toFixed(1)),
      countsByQuadrant: counts,
    };
  }, [transactions, productMap, currentStart, currentEnd, hiddenCategorySet]);

  const filteredPoints = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allPoints.filter((pt) => {
      if (selectedQuadrant !== 'ALL' && pt.quadrant !== selectedQuadrant) return false;
      if (q && !pt.name.toLowerCase().includes(q) && !pt.category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [allPoints, selectedQuadrant, searchTerm]);

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Scatter Plot Korelasi Volume Penjualan vs Margin Keuntungan Produk"
    >
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 space-y-4">
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Korelasi Volume Penjualan vs Margin Keuntungan per Produk</span>
            </h3>
            <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500 tabular-nums">
              <span className="font-semibold text-slate-700">{periodLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{formatNumber(allPoints.length)} produk aktif terjual</span>
              {allPoints.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Batas Kuadran: <strong className="font-mono text-slate-800">{avgUnits}</strong>{' '}
                    unit &amp; margin{' '}
                    <strong className="font-mono text-slate-800">{avgMarginPercent}%</strong>
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

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari produk..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 w-44 focus:outline-none focus:border-sky-500"
              />
            </div>

            <FullscreenToggleButton
              isFullscreen={isFullscreen}
              onToggle={() => setIsFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* 4 Quadrant Interactive Filter Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setSelectedQuadrant('ALL');
            }}
            className={`text-left p-2.5 rounded-xl border text-xs transition-colors cursor-pointer ${
              selectedQuadrant === 'ALL'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <div className="font-bold">Semua Kuadran</div>
            <div className="font-mono tabular-nums font-bold text-sm mt-0.5">
              {formatNumber(allPoints.length)} produk
            </div>
          </button>

          {(
            ['STAR', 'VOLUME_DRIVER', 'HIGH_MARGIN_NICHE', 'NEEDS_EVALUATION'] as QuadrantType[]
          ).map((qKey) => {
            const meta = QUADRANT_META[qKey];
            const active = selectedQuadrant === qKey;
            return (
              <button
                key={qKey}
                type="button"
                onClick={() => {
                  sound.playTap();
                  setSelectedQuadrant((prev) => (prev === qKey ? 'ALL' : qKey));
                }}
                className={`text-left p-2.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                  active
                    ? meta.surfaceClass
                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-bold truncate">{meta.label}</span>
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: meta.color }}
                  />
                </div>
                <div className="text-[11px] opacity-80 truncate">{meta.shortDesc}</div>
                <div className="font-mono tabular-nums font-bold text-sm mt-0.5">
                  {formatNumber(countsByQuadrant[qKey])} produk
                </div>
              </button>
            );
          })}
        </div>

        {/* Main Scatter Chart */}
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
        ) : filteredPoints.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-slate-400 text-xs text-center gap-2 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 p-6">
            <Crosshair className="w-8 h-8 text-slate-300" />
            <p className="font-semibold text-slate-600">
              Tidak ada produk terjual yang cocok dengan filter atau periode {periodLabel}.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatedChartStage
              filterKey={`scatter-${selectedQuadrant}-${periodLabel}-${filteredPoints.length}`}
              accent="emerald"
              delayMs={80}
              className={`w-full ${isFullscreen ? 'h-[56vh] min-h-[380px]' : 'h-[320px]'}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 18, right: 24, left: 4, bottom: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    dataKey="unitsSold"
                    name="Volume Terjual"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tickLine={false}
                    label={{
                      value: 'Volume Penjualan (Unit Dasar)',
                      position: 'insideBottom',
                      offset: -8,
                      style: { fontSize: 11, fill: '#64748b', fontWeight: 600 },
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="marginPercent"
                    name="Margin Keuntungan (%)"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                    label={{
                      value: 'Margin Laba (%)',
                      angle: -90,
                      position: 'insideLeft',
                      offset: 8,
                      style: { fontSize: 11, fill: '#64748b', fontWeight: 600 },
                    }}
                  />
                  <ZAxis type="number" dataKey="profit" range={[70, 420]} name="Laba Kotor" />

                  <ReferenceLine
                    x={avgUnits}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    label={{
                      value: `Rata-rata Vol (${avgUnits})`,
                      position: 'top',
                      fill: '#475569',
                      fontSize: 10,
                    }}
                  />
                  <ReferenceLine
                    y={avgMarginPercent}
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    label={{
                      value: `Rata-rata Margin (${avgMarginPercent}%)`,
                      position: 'right',
                      fill: '#475569',
                      fontSize: 10,
                    }}
                  />

                  <RechartsTooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const pt = payload[0]?.payload as ProductScatterPoint | undefined;
                      if (!pt) return null;
                      const meta = QUADRANT_META[pt.quadrant];
                      return (
                        <div className="bg-slate-900/95 text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs max-w-[280px] space-y-2 z-50">
                          <div className="border-b border-slate-800 pb-1.5">
                            <div className="font-bold text-slate-100 leading-snug">{pt.name}</div>
                            <div className="text-[11px] text-slate-400">
                              {pt.category} ·{' '}
                              <span style={{ color: meta.color }} className="font-bold">
                                {meta.label}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400 font-sans">Volume Terjual:</span>
                              <span className="font-bold text-sky-300 tabular-nums">
                                {formatNumber(pt.unitsSold)} {pt.baseUnit} ({pt.txCount} trx)
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400 font-sans">Margin Laba:</span>
                              <span
                                className="font-bold tabular-nums"
                                style={{ color: meta.color }}
                              >
                                {pt.marginPercent.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400 font-sans">Total Omzet:</span>
                              <span className="font-semibold text-slate-200 tabular-nums">
                                {formatRupiah(pt.revenue)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400 font-sans">Laba Kotor:</span>
                              <span className="font-bold text-emerald-400 tabular-nums">
                                {formatRupiah(pt.profit)}
                              </span>
                            </div>
                          </div>
                          <div className="pt-1 border-t border-slate-800 text-[11px] text-slate-300 leading-relaxed">
                            {meta.recommendation}
                          </div>
                        </div>
                      );
                    }}
                  />

                  <Scatter name="Produk" data={filteredPoints}>
                    {filteredPoints.map((pt) => (
                      <Cell
                        key={pt.productId}
                        fill={QUADRANT_META[pt.quadrant].color}
                        fillOpacity={0.85}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </AnimatedChartStage>

            {/* Compact Actionable Quadrant Product Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2 px-3">Produk</th>
                    <th className="py-2 px-3">Kuadran Strategi</th>
                    <th className="py-2 px-3 text-right">Volume</th>
                    <th className="py-2 px-3 text-right">Margin (%)</th>
                    <th className="py-2 px-3 text-right">Omzet (Rp)</th>
                    <th className="py-2 px-3 text-right">Laba Kotor (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPoints.slice(0, 8).map((pt) => {
                    const meta = QUADRANT_META[pt.quadrant];
                    return (
                      <tr key={pt.productId} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3">
                          <div className="font-bold text-slate-900">{pt.name}</div>
                          <div className="text-[11px] text-slate-500">{pt.category}</div>
                        </td>
                        <td className="py-2 px-3">
                          <div className={`font-bold ${meta.textClass}`}>{meta.label}</div>
                          <div className="text-[11px] text-slate-500">{meta.recommendation}</div>
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatNumber(pt.unitsSold)} {pt.baseUnit}
                        </td>
                        <td
                          className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${meta.textClass}`}
                        >
                          {pt.marginPercent.toFixed(1)}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-700">
                          {formatRupiah(pt.revenue)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatRupiah(pt.profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ChartFullscreenShell>
  );
};
