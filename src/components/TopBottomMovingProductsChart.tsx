import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  ArrowRight,
  Flame,
  Hourglass,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  ProductTurnoverMetric,
  StockTurnoverAnalysisResult,
  TurnoverSpeedCategory,
} from '../utils/stockTurnRate';

interface TopBottomMovingProductsChartProps {
  analysis: StockTurnoverAnalysisResult;
  lookbackDays: 30 | 60 | 90;
  onChangeLookbackDays: (days: 30 | 60 | 90) => void;
  onSelectProduct?: (productId: string, speedCategory: TurnoverSpeedCategory) => void;
  onOpenTurnoverTab?: () => void;
}

type ChartMetricMode = 'TURN_RATE' | 'UNITS_SOLD';

interface ChartDatum {
  productId: string;
  name: string;
  shortName: string;
  category: string;
  baseUnit: string;
  currentStock: number;
  unitsSoldInPeriod: number;
  turnRatePerYear: number;
  daysOfInventory: number;
  daysDisplayCapped: number;
  inventoryCostValue: number;
  speedCategory: TurnoverSpeedCategory;
  isDeadStock: boolean;
  value: number;
}

const MAX_DAYS_BAR_CAP = 365;

const truncateLabel = (text: string, maxLen = 20): string => {
  if (!text) return '-';
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
};

export const TopBottomMovingProductsChart: React.FC<TopBottomMovingProductsChartProps> = ({
  analysis,
  lookbackDays,
  onChangeLookbackDays,
  onSelectProduct,
  onOpenTurnoverTab,
}) => {
  const [metricMode, setMetricMode] = useState<ChartMetricMode>('TURN_RATE');

  const topMovingData = useMemo<ChartDatum[]>(() => {
    const candidates = analysis.items.filter((m) => m.unitsSoldInPeriod > 0);
    const sorted = [...candidates].sort((a, b) => {
      if (metricMode === 'UNITS_SOLD') {
        if (b.unitsSoldInPeriod !== a.unitsSoldInPeriod) {
          return b.unitsSoldInPeriod - a.unitsSoldInPeriod;
        }
        return b.turnRatePerYear - a.turnRatePerYear;
      }
      if (b.turnRatePerYear !== a.turnRatePerYear) {
        return b.turnRatePerYear - a.turnRatePerYear;
      }
      return b.unitsSoldInPeriod - a.unitsSoldInPeriod;
    });

    return sorted.slice(0, 6).map((m) => ({
      productId: m.product.id,
      name: m.product.name,
      shortName: truncateLabel(m.product.name, 20),
      category: m.product.category || 'Umum',
      baseUnit: m.product.baseUnit,
      currentStock: m.currentStock,
      unitsSoldInPeriod: m.unitsSoldInPeriod,
      turnRatePerYear: m.turnRatePerYear,
      daysOfInventory: m.daysOfInventory,
      daysDisplayCapped: Number.isFinite(m.daysOfInventory)
        ? Math.min(MAX_DAYS_BAR_CAP, m.daysOfInventory)
        : MAX_DAYS_BAR_CAP,
      inventoryCostValue: m.inventoryCostValue,
      speedCategory: m.speedCategory,
      isDeadStock: false,
      value: metricMode === 'UNITS_SOLD' ? m.unitsSoldInPeriod : m.turnRatePerYear,
    }));
  }, [analysis.items, metricMode]);

  const bottomMovingData = useMemo<ChartDatum[]>(() => {
    const candidates = analysis.items.filter((m) => m.currentStock > 0);
    const sorted = [...candidates].sort((a, b) => {
      // Slowest turnover first; break ties by longest days & highest locked capital
      if (a.turnRatePerYear !== b.turnRatePerYear) {
        return a.turnRatePerYear - b.turnRatePerYear;
      }
      const da = Number.isFinite(a.daysOfInventory) ? a.daysOfInventory : 999999;
      const db = Number.isFinite(b.daysOfInventory) ? b.daysOfInventory : 999999;
      if (db !== da) return db - da;
      return b.inventoryCostValue - a.inventoryCostValue;
    });

    return sorted.slice(0, 6).map((m) => {
      const finiteDays = Number.isFinite(m.daysOfInventory);
      return {
        productId: m.product.id,
        name: m.product.name,
        shortName: truncateLabel(m.product.name, 20),
        category: m.product.category || 'Umum',
        baseUnit: m.product.baseUnit,
        currentStock: m.currentStock,
        unitsSoldInPeriod: m.unitsSoldInPeriod,
        turnRatePerYear: m.turnRatePerYear,
        daysOfInventory: m.daysOfInventory,
        daysDisplayCapped: finiteDays ? Math.min(MAX_DAYS_BAR_CAP, m.daysOfInventory) : MAX_DAYS_BAR_CAP,
        inventoryCostValue: m.inventoryCostValue,
        speedCategory: m.speedCategory,
        isDeadStock: !finiteDays || m.unitsSoldInPeriod === 0,
        // Always plot capped days of inventory on Bottom chart so dead-stock items (0 sales) stay visibly ranked!
        value: finiteDays ? Math.min(MAX_DAYS_BAR_CAP, m.daysOfInventory) : MAX_DAYS_BAR_CAP,
      };
    });
  }, [analysis.items]);

  const topChartHeight = Math.max(200, topMovingData.length * 42 + 24);
  const bottomChartHeight = Math.max(200, bottomMovingData.length * 42 + 24);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4.5 h-4.5 text-sky-600 shrink-0" />
            <span>Top &amp; Bottom Moving Products (Kecepatan Perputaran Stok)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Perbandingan visual produk tercepat untuk prioritas restock PO dan produk terlambat untuk pengurangan pengadaan / diskon likuidasi.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* Metric Switcher for Top Moving Chart */}
          <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setMetricMode('TURN_RATE');
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                metricMode === 'TURN_RATE'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Turn Rate (×/Thn)
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setMetricMode('UNITS_SOLD');
              }}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                metricMode === 'UNITS_SOLD'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unit Terjual
            </button>
          </div>

          {/* Lookback Period Switcher */}
          <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            {([30, 60, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => {
                  sound.playTap();
                  onChangeLookbackDays(days);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  lookbackDays === days
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {days}H
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dual Bar Chart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: TOP MOVING PRODUCTS (FASTEST TURNOVER) */}
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/20 p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                  <Flame className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                    Top Moving — Perputaran Tercepat
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {metricMode === 'TURN_RATE'
                      ? `Rasio perputaran tahunan tertinggi (periode ${lookbackDays} hari)`
                      : `Total volume penjualan tertinggi (${lookbackDays} hari terakhir)`}
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold whitespace-nowrap shrink-0">
                Top {topMovingData.length} SKU
              </span>
            </div>

            {topMovingData.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center text-center text-slate-400 text-xs px-4">
                <TrendingUp className="w-8 h-8 mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">Belum ada data penjualan fisik dalam {lookbackDays} hari terakhir.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Grafik produk tercepat otomatis terisi setelah transaksi kasir tercatat.
                </p>
              </div>
            ) : (
              <div style={{ width: '100%', height: topChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topMovingData}
                    layout="vertical"
                    margin={{ top: 6, right: 20, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickFormatter={(val) =>
                        metricMode === 'TURN_RATE' ? `${val}×` : formatNumber(Number(val))
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={132}
                      tick={{ fontSize: 11, fill: '#0f172a', fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(16, 185, 129, 0.08)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload[0]) return null;
                        const d = payload[0].payload as ChartDatum;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 shadow-lg text-xs space-y-1 max-w-[240px]">
                            <div className="font-bold text-emerald-300 leading-snug">{d.name}</div>
                            <div className="text-[10px] text-slate-400">{d.category}</div>
                            <div className="pt-1 border-t border-slate-700/80 space-y-0.5 font-mono tabular-nums text-[11px]">
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Turn Rate:</span>
                                <span className="font-bold text-emerald-400">{d.turnRatePerYear.toFixed(1)}× / thn</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Terjual ({lookbackDays}H):</span>
                                <span className="font-bold text-white">{formatNumber(d.unitsSoldInPeriod)} {d.baseUnit}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Stok Tersedia:</span>
                                <span>{formatNumber(d.currentStock)} {d.baseUnit}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Siklus Habis:</span>
                                <span>
                                  {Number.isFinite(d.daysOfInventory)
                                    ? `${formatNumber(d.daysOfInventory)} Hari`
                                    : '∞'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 6, 6, 0]}
                      barSize={22}
                      onClick={(entry) => {
                        const datum = entry?.payload as ChartDatum | undefined;
                        if (datum && onSelectProduct) {
                          sound.playTap();
                          onSelectProduct(datum.productId, datum.speedCategory);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {topMovingData.map((entry, idx) => (
                        <Cell
                          key={entry.productId}
                          fill={idx === 0 ? '#059669' : idx < 3 ? '#10b981' : '#34d399'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-emerald-200/70 flex items-center justify-between gap-2 text-[11px] text-emerald-900">
            <span>
              <strong>Strategi PO:</strong> Jaga buffer stok &amp; percepat repeat order untuk SKU terlaris agar tidak kehabisan.
            </span>
          </div>
        </div>

        {/* RIGHT: BOTTOM MOVING PRODUCTS (SLOWEST TURNOVER / HIGH DAYS OF INVENTORY) */}
        <div className="rounded-xl border border-rose-200/80 bg-rose-50/20 p-3.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-1.5">
                <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
                  <Hourglass className="w-3.5 h-3.5" />
                </span>
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                    Bottom Moving — Perputaran Terlambat
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Estimasi durasi stok bertahan (Hari, skala maks {MAX_DAYS_BAR_CAP}H; garis putus = 90H)
                  </p>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold whitespace-nowrap shrink-0">
                Bottom {bottomMovingData.length} SKU
              </span>
            </div>

            {bottomMovingData.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center text-center text-slate-400 text-xs px-4">
                <TrendingDown className="w-8 h-8 mb-2 text-slate-300" />
                <p className="font-semibold text-slate-600">Tidak ada stok fisik menumpuk saat ini.</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Semua produk fisik berada dalam kondisi stok kosong atau bergerak lancar.
                </p>
              </div>
            ) : (
              <div style={{ width: '100%', height: bottomChartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={bottomMovingData}
                    layout="vertical"
                    margin={{ top: 6, right: 20, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis
                      type="number"
                      domain={[0, MAX_DAYS_BAR_CAP]}
                      tick={{ fontSize: 10, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickFormatter={(val) => (Number(val) >= MAX_DAYS_BAR_CAP ? '365+H' : `${val}H`)}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortName"
                      width={132}
                      tick={{ fontSize: 11, fill: '#0f172a', fontWeight: 600 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ReferenceLine
                      x={90}
                      stroke="#be123c"
                      strokeDasharray="4 3"
                      label={{
                        value: '90H',
                        position: 'top',
                        fill: '#be123c',
                        fontSize: 9,
                        fontWeight: 700,
                      }}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(225, 29, 72, 0.08)' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload[0]) return null;
                        const d = payload[0].payload as ChartDatum;
                        return (
                          <div className="bg-slate-900 text-white p-2.5 rounded-xl border border-slate-700 shadow-lg text-xs space-y-1 max-w-[250px]">
                            <div className="font-bold text-rose-300 leading-snug">{d.name}</div>
                            <div className="text-[10px] text-slate-400">{d.category}</div>
                            <div className="pt-1 border-t border-slate-700/80 space-y-0.5 font-mono tabular-nums text-[11px]">
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Estimasi Siklus:</span>
                                <span className="font-bold text-rose-400">
                                  {d.isDeadStock
                                    ? `Dead Stock (0 terjual / ${lookbackDays}H)`
                                    : `${formatNumber(d.daysOfInventory)} Hari`}
                                </span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Turn Rate:</span>
                                <span>{d.turnRatePerYear.toFixed(2)}× / thn</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Terjual ({lookbackDays}H):</span>
                                <span>{formatNumber(d.unitsSoldInPeriod)} {d.baseUnit}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Stok Mengendap:</span>
                                <span>{formatNumber(d.currentStock)} {d.baseUnit}</span>
                              </div>
                              <div className="flex justify-between gap-3">
                                <span className="text-slate-400">Modal Tertahan:</span>
                                <span className="font-bold text-amber-300">{formatRupiah(d.inventoryCostValue)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="value"
                      radius={[0, 6, 6, 0]}
                      barSize={22}
                      onClick={(entry) => {
                        const datum = entry?.payload as ChartDatum | undefined;
                        if (datum && onSelectProduct) {
                          sound.playTap();
                          onSelectProduct(datum.productId, datum.speedCategory);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {bottomMovingData.map((entry) => (
                        <Cell
                          key={entry.productId}
                          fill={
                            entry.speedCategory === 'VERY_SLOW'
                              ? '#e11d48'
                              : entry.speedCategory === 'SLOW'
                              ? '#f59e0b'
                              : '#64748b'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-2 pt-2 border-t border-rose-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-rose-900">
            <span>
              <strong>Strategi PO:</strong> Tahan pembelian ulang &amp; siapkan promo likuidasi.
            </span>
            {onOpenTurnoverTab && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onOpenTurnoverTab();
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Buka Likuidasi</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
