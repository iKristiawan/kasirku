import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
  Legend as RechartsLegend,
} from 'recharts';
import {
  AlertTriangle,
  Package,
  ShoppingCart,
  ShieldAlert,
  CheckCircle2,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import { Product, ProductCategory } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface ProductStockThresholdChartProps {
  products: Product[];
  categories: ProductCategory[];
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
}

type ChartViewMode = 'UNITS' | 'THRESHOLD_INDEX';
type StockFilterScope = 'CRITICAL_FIRST' | 'REORDER_ONLY' | 'ALL_TOP';

interface StockThresholdEntry {
  id: string;
  name: string;
  shortName: string;
  category: string;
  baseUnit: string;
  stock: number;
  minThreshold: number;
  thresholdIndexPercent: number;
  thresholdLine100: number;
  shortfall: number;
  suggestedReorderQty: number;
  estimatedReorderCost: number;
  status: 'OUT_OF_STOCK' | 'REORDER_NOW' | 'APPROACHING' | 'SAFE';
  statusLabel: string;
  barColor: string;
}

export const ProductStockThresholdChart: React.FC<ProductStockThresholdChartProps> = ({
  products,
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
}) => {
  const { palette } = useChartTheme();
  const [viewMode, setViewMode] = useState<ChartViewMode>('UNITS');
  const [filterScope, setFilterScope] = useState<StockFilterScope>('CRITICAL_FIRST');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const analysis = useMemo(() => {
    const entries: StockThresholdEntry[] = [];
    let outOfStockCount = 0;
    let reorderNowCount = 0;
    let approachingCount = 0;
    let safeCount = 0;
    let thresholdSum = 0;

    products.forEach((p) => {
      if ((p.productType || 'BARANG') === 'JASA') return;
      const catName = (p.category || 'Umum').trim() || 'Umum';
      if (hiddenCategorySet.has(catName)) return;

      const stock = Math.max(0, Number(p.stockInBaseUnit) || 0);
      const rawMin = Number(p.minStockAlert);
      const minThreshold = rawMin > 0 ? rawMin : 5;
      thresholdSum += minThreshold;

      const thresholdIndexPercent =
        minThreshold > 0 ? Number(((stock / minThreshold) * 100).toFixed(1)) : 100;

      let status: StockThresholdEntry['status'] = 'SAFE';
      let statusLabel = 'Stok Aman';
      let barColor = palette.positive;

      if (stock <= 0) {
        status = 'OUT_OF_STOCK';
        statusLabel = 'Stok Kosong (Habis)';
        barColor = palette.danger;
        outOfStockCount += 1;
        reorderNowCount += 1;
      } else if (stock <= minThreshold) {
        status = 'REORDER_NOW';
        statusLabel = 'Segera Pesan Kembali';
        barColor = palette.warning;
        reorderNowCount += 1;
      } else if (stock <= Math.ceil(minThreshold * 1.5)) {
        status = 'APPROACHING';
        statusLabel = 'Mendekati Batas Min.';
        barColor = palette.primary;
        approachingCount += 1;
      } else {
        safeCount += 1;
      }

      const shortfall = Math.max(0, minThreshold - stock);
      // Suggested reorder target brings stock safely to 2x minimum threshold
      const suggestedReorderQty =
        stock <= minThreshold ? Math.max(minThreshold, minThreshold * 2 - stock) : 0;
      const unitCost = Math.max(0, Number(p.costPrice) || 0);

      entries.push({
        id: p.id,
        name: p.name,
        shortName: p.name.length > 16 ? `${p.name.slice(0, 14)}…` : p.name,
        category: catName,
        baseUnit: p.baseUnit || 'PCS',
        stock,
        minThreshold,
        thresholdIndexPercent,
        thresholdLine100: 100,
        shortfall,
        suggestedReorderQty,
        estimatedReorderCost: suggestedReorderQty * unitCost,
        status,
        statusLabel,
        barColor,
      });
    });

    // Sort by criticality: lowest ratio (stock / minThreshold) first
    const sortedByCriticality = [...entries].sort((a, b) => {
      if (a.thresholdIndexPercent !== b.thresholdIndexPercent) {
        return a.thresholdIndexPercent - b.thresholdIndexPercent;
      }
      return a.stock - b.stock;
    });

    const reorderItems = sortedByCriticality.filter(
      (e) => e.status === 'OUT_OF_STOCK' || e.status === 'REORDER_NOW'
    );

    let displayedItems: StockThresholdEntry[] = [];
    if (filterScope === 'REORDER_ONLY') {
      displayedItems = reorderItems.slice(0, 16);
    } else if (filterScope === 'CRITICAL_FIRST') {
      displayedItems = sortedByCriticality.slice(0, 14);
    } else {
      displayedItems = sortedByCriticality.slice(0, 20);
    }

    const avgMinThreshold =
      entries.length > 0 ? Math.round(thresholdSum / entries.length) : 0;
    const avgDisplayedThreshold =
      displayedItems.length > 0
        ? Math.round(
            displayedItems.reduce((s, item) => s + item.minThreshold, 0) /
              displayedItems.length
          )
        : avgMinThreshold;

    const totalEstimatedReorderCost = reorderItems.reduce(
      (sum, item) => sum + item.estimatedReorderCost,
      0
    );

    return {
      totalItems: entries.length,
      outOfStockCount,
      reorderNowCount,
      approachingCount,
      safeCount,
      avgMinThreshold,
      avgDisplayedThreshold,
      reorderItems,
      displayedItems,
      totalEstimatedReorderCost,
    };
  }, [products, hiddenCategorySet, filterScope, palette]);

  const yDomainMaxIndex = useMemo(() => {
    if (analysis.displayedItems.length === 0) return 200;
    const maxVal = Math.max(
      140,
      ...analysis.displayedItems.map((i) => i.thresholdIndexPercent)
    );
    return Math.ceil(maxVal / 25) * 25;
  }, [analysis.displayedItems]);

  const yDomainMaxUnits = useMemo(() => {
    if (analysis.displayedItems.length === 0) return 20;
    const maxVal = Math.max(
      10,
      ...analysis.displayedItems.map((i) => Math.max(i.stock, i.minThreshold))
    );
    return Math.ceil(maxVal * 1.15);
  }, [analysis.displayedItems]);

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Grafik Stok Produk vs Garis Batas Minimum (Threshold Reorder)"
    >
    <section className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3.5 pb-3.5 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert
                className={`w-4 h-4 shrink-0 ${
                  analysis.reorderNowCount > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              />
              <span>Grafik Stok Produk vs Garis Batas Minimum (Threshold Reorder)</span>
            </h3>
            {analysis.reorderNowCount > 0 ? (
              <span className="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                {formatNumber(analysis.reorderNowCount)} Item Perlu Segera Dipesan
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md text-[10.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Semua Stok Di Atas Batas Minimum
              </span>
            )}
            {specificSelectedCategoryName ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                {specificSelectedCategoryName}
              </span>
            ) : isCategoryFiltered ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                {activeCategoryCount}/{totalCategoriesCount} Kategori
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500">
            Garis penanda merah menunjukkan batas minimum stok per produk. Item dengan batang berada pada atau di bawah garis batas menandakan perlunya pemesanan ulang segera.
          </p>
        </div>

        {/* Chart Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Scope Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px]">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setFilterScope('CRITICAL_FIRST');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                filterScope === 'CRITICAL_FIRST'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Prioritas Terkritis
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setFilterScope('REORDER_ONLY');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                filterScope === 'REORDER_ONLY'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Perlu Reorder ({formatNumber(analysis.reorderNowCount)})
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setFilterScope('ALL_TOP');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                filterScope === 'ALL_TOP'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua ({Math.min(20, analysis.totalItems)})
            </button>
          </div>

          {/* Metric View Selector */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px]">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setViewMode('UNITS');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                viewMode === 'UNITS'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unit vs Batas Min
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setViewMode('THRESHOLD_INDEX');
              }}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                viewMode === 'THRESHOLD_INDEX'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Indeks % (100% = Min)
            </button>
          </div>

          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded-xl bg-rose-50/80 border border-rose-200">
          <div className="text-[10px] font-bold uppercase text-rose-700">Stok Kosong (0)</div>
          <div className="text-lg font-black font-mono text-rose-800 tabular-nums mt-0.5">
            {formatNumber(analysis.outOfStockCount)}{' '}
            <span className="text-[11px] font-sans font-semibold">SKU</span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-amber-50/90 border border-amber-200">
          <div className="text-[10px] font-bold uppercase text-amber-800">
            Perlu Segera Dipesan
          </div>
          <div className="text-lg font-black font-mono text-amber-900 tabular-nums mt-0.5">
            {formatNumber(analysis.reorderNowCount)}{' '}
            <span className="text-[11px] font-sans font-semibold">SKU ≤ Min</span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-sky-50/80 border border-sky-200">
          <div className="text-[10px] font-bold uppercase text-sky-800">
            Mendekati Batas Min
          </div>
          <div className="text-lg font-black font-mono text-sky-900 tabular-nums mt-0.5">
            {formatNumber(analysis.approachingCount)}{' '}
            <span className="text-[11px] font-sans font-semibold">SKU</span>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200">
          <div className="text-[10px] font-bold uppercase text-emerald-800">
            Stok Aman (&gt;150% Min)
          </div>
          <div className="text-lg font-black font-mono text-emerald-800 tabular-nums mt-0.5">
            {formatNumber(analysis.safeCount)}{' '}
            <span className="text-[11px] font-sans font-semibold">SKU</span>
          </div>
        </div>
      </div>

      {/* Main Chart Body */}
      {activeCategoryCount === 0 && totalCategoriesCount > 0 ? (
        <div className="py-10 px-6 flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          <EyeOff className="w-8 h-8 text-slate-300" />
          <p className="text-xs font-bold text-slate-600">
            Semua kategori sedang dinonaktifkan pada filter dashboard
          </p>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onResetCategoryFilter();
            }}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tampilkan Semua Kategori</span>
          </button>
        </div>
      ) : analysis.displayedItems.length === 0 ? (
        <div className="py-10 px-6 flex flex-col items-center justify-center text-slate-500 space-y-1.5 bg-emerald-50/50 rounded-2xl border border-dashed border-emerald-200">
          {filterScope === 'REORDER_ONLY' && analysis.totalItems > 0 ? (
            <>
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              <p className="text-xs font-bold text-emerald-900">
                Tidak ada item di bawah batas minimum stok saat ini
              </p>
              <p className="text-[11px] text-emerald-700">
                Pilih &ldquo;Prioritas Terkritis&rdquo; untuk memantau produk yang paling dekat dengan garis batas minimum.
              </p>
            </>
          ) : (
            <>
              <Package className="w-8 h-8 text-slate-300" />
              <p className="text-xs font-bold text-slate-600">
                Belum ada data produk fisik untuk ditampilkan pada grafik stok
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Interactive Recharts Bar + Threshold Reference Line */}
          <AnimatedChartStage
            filterKey={`stock-threshold-${viewMode}-${filterScope}-${activeCategoryCount}-${Array.from(hiddenCategorySet).join(',')}`}
            accent="amber"
            delayMs={100}
            className={isFullscreen ? 'w-full h-[60vh] min-h-[380px]' : 'w-full h-72 sm:h-80'}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={analysis.displayedItems}
                margin={{ top: 22, right: 16, left: 4, bottom: 42 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
                <XAxis
                  dataKey="shortName"
                  tick={{ fill: '#475569', fontSize: 10.5, fontWeight: 600 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={62}
                />
                <YAxis
                  domain={[0, viewMode === 'UNITS' ? yDomainMaxUnits : yDomainMaxIndex]}
                  tickFormatter={(val) =>
                    viewMode === 'UNITS' ? formatNumber(val) : `${val}%`
                  }
                  tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'monospace' }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const item = payload[0]?.payload as StockThresholdEntry | undefined;
                    if (!item) return null;

                    return (
                      <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[245px] space-y-2 z-50">
                        <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
                          <div>
                            <div className="font-bold text-slate-100 leading-tight">{item.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{item.category}</div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              item.status === 'OUT_OF_STOCK'
                                ? 'bg-rose-500/25 text-rose-300'
                                : item.status === 'REORDER_NOW'
                                ? 'bg-amber-500/25 text-amber-300'
                                : item.status === 'APPROACHING'
                                ? 'bg-sky-500/25 text-sky-300'
                                : 'bg-emerald-500/25 text-emerald-300'
                            }`}
                          >
                            {item.statusLabel}
                          </span>
                        </div>

                        <div className="space-y-1 font-mono text-[11px]">
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Stok Saat Ini:</span>
                            <span className="font-bold text-slate-100 tabular-nums">
                              {formatNumber(item.stock)} {item.baseUnit}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-rose-300">Batas Minimum:</span>
                            <span className="font-bold text-rose-300 tabular-nums">
                              {formatNumber(item.minThreshold)} {item.baseUnit}
                            </span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-slate-400">Rasio vs Batas Min:</span>
                            <span className="font-bold text-amber-300 tabular-nums">
                              {item.thresholdIndexPercent.toFixed(0)}%
                            </span>
                          </div>
                          {item.suggestedReorderQty > 0 && (
                            <div className="pt-1.5 border-t border-slate-800 space-y-1">
                              <div className="flex justify-between gap-3 text-amber-300">
                                <span className="font-sans font-semibold">Saran Order Ulang:</span>
                                <span className="font-bold tabular-nums">
                                  +{formatNumber(item.suggestedReorderQty)} {item.baseUnit}
                                </span>
                              </div>
                              {item.estimatedReorderCost > 0 && (
                                <div className="flex justify-between gap-3 text-[10px] text-slate-400">
                                  <span className="font-sans">Est. Modal Restock:</span>
                                  <span className="tabular-nums text-slate-200">
                                    {formatRupiah(item.estimatedReorderCost)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
                <RechartsLegend
                  verticalAlign="top"
                  height={28}
                  wrapperStyle={{ fontSize: '11px', fontWeight: 700 }}
                />

                {/* Threshold Reference Line */}
                {viewMode === 'THRESHOLD_INDEX' ? (
                  <ReferenceLine
                    y={100}
                    stroke={palette.danger}
                    strokeWidth={2.5}
                    strokeDasharray="6 4"
                    label={{
                      value: 'Garis Batas Minimum Stok (100%)',
                      position: 'insideTopRight',
                      fill: palette.danger,
                      fontSize: 10.5,
                      fontWeight: 800,
                    }}
                  />
                ) : (
                  <ReferenceLine
                    y={analysis.avgDisplayedThreshold}
                    stroke={palette.danger}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    label={{
                      value: `Garis Threshold Rata-rata (${formatNumber(analysis.avgDisplayedThreshold)} unit)`,
                      position: 'insideTopRight',
                      fill: palette.danger,
                      fontSize: 10,
                      fontWeight: 800,
                    }}
                  />
                )}

                <Bar
                  dataKey={viewMode === 'UNITS' ? 'stock' : 'thresholdIndexPercent'}
                  name={viewMode === 'UNITS' ? 'Stok Saat Ini (Unit)' : 'Rasio Stok vs Batas Min (%)'}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={34}
                  isAnimationActive={true}
                  animationDuration={560}
                  animationEasing="ease-out"
                >
                  {analysis.displayedItems.map((entry) => (
                    <Cell key={`stock-bar-${entry.id}`} fill={entry.barColor} />
                  ))}
                </Bar>

                {viewMode === 'UNITS' && (
                  <Line
                    type="monotone"
                    dataKey="minThreshold"
                    name="Batas Minimum Per Item (Unit)"
                    stroke={palette.danger}
                    strokeWidth={2.5}
                    strokeDasharray="5 3"
                    dot={{ r: 3.5, fill: palette.danger, stroke: '#ffffff', strokeWidth: 1.5 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={true}
                    animationDuration={560}
                    animationEasing="ease-out"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </AnimatedChartStage>

          {/* Color Legend Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: palette.danger }} />
                Stok Kosong (0)
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: palette.warning }} />
                Perlu Reorder (≤ Batas Min)
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: palette.primary }} />
                Mendekati Batas
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: palette.positive }} />
                Aman
              </span>
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                <span className="w-4 border-t-2 border-dashed" style={{ borderColor: palette.danger }} />
                Garis Batas Minimum
              </span>
            </div>
            <span className="text-[10.5px] text-slate-400">
              Diurutkan dari rasio stok paling kritis
            </span>
          </div>

          {/* Actionable Reorder Priority Strip */}
          {analysis.reorderItems.length > 0 && (
            <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-950">
                  <ShoppingCart className="w-3.5 h-3.5 text-amber-700" />
                  <span>
                    Daftar Prioritas Pemesanan Ulang ({formatNumber(analysis.reorderItems.length)} Item Di Bawah Batas Minimum)
                  </span>
                </div>
                {analysis.totalEstimatedReorderCost > 0 && (
                  <span className="text-[11px] font-bold text-amber-900 font-mono tabular-nums">
                    Est. Kebutuhan Restock: {formatRupiah(analysis.totalEstimatedReorderCost)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {analysis.reorderItems.slice(0, 6).map((item) => (
                  <div
                    key={`reorder-${item.id}`}
                    className="p-2 rounded-xl bg-white border border-amber-200/80 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 truncate flex items-center gap-1">
                        <AlertTriangle
                          className={`w-3 h-3 shrink-0 ${
                            item.stock <= 0 ? 'text-rose-600' : 'text-amber-600'
                          }`}
                        />
                        <span className="truncate">{item.name}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                        Sisa:{' '}
                        <strong className={item.stock <= 0 ? 'text-rose-700' : 'text-amber-700'}>
                          {formatNumber(item.stock)}
                        </strong>{' '}
                        / Min {formatNumber(item.minThreshold)} {item.baseUnit}
                      </div>
                    </div>

                    <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-mono font-extrabold text-[10px] shrink-0 tabular-nums">
                      +{formatNumber(item.suggestedReorderQty)} {item.baseUnit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
    </ChartFullscreenShell>
  );
};
