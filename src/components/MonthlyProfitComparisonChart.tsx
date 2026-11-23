import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  ReferenceLine,
  Cell,
} from 'recharts';
import {
  BalanceSheetEntry,
  CashflowRecord,
  RestockOrder,
  StoreSettings,
  TaxAdjustment,
  TaxRecord,
  Transaction,
} from '../types/pos';
import {
  computeMonthlyProfitComparisonTrend,
  MonthlyProfitComparisonPoint,
} from '../utils/balanceSheetUtils';
import { formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';

interface MonthlyProfitComparisonChartProps {
  selectedPeriodMonth: string;
  onSelectPeriodMonth: (periodMonth: string) => void;
  onExportMonthlyPdf: (periodMonth: string) => void;
  transactions: Transaction[];
  cashflows: CashflowRecord[];
  purchases: RestockOrder[];
  taxRecords: TaxRecord[];
  taxAdjustments: TaxAdjustment[];
  manualEntries: BalanceSheetEntry[];
  storeSettings: StoreSettings;
}

const formatAxisMillions = (val: number): string => {
  if (Math.abs(val) >= 1_000_000_000) {
    return `${(val / 1_000_000_000).toFixed(1)}M`;
  }
  if (Math.abs(val) >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}jt`;
  }
  if (Math.abs(val) >= 1_000) {
    return `${Math.round(val / 1_000)}rb`;
  }
  return `${val}`;
};

export const MonthlyProfitComparisonChart: React.FC<MonthlyProfitComparisonChartProps> = ({
  selectedPeriodMonth,
  onSelectPeriodMonth,
  onExportMonthlyPdf,
  transactions,
  cashflows,
  purchases,
  taxRecords,
  taxAdjustments,
  manualEntries,
  storeSettings,
}) => {
  const [monthsCount, setMonthsCount] = useState<6 | 12>(6);

  const trendData = useMemo<MonthlyProfitComparisonPoint[]>(
    () =>
      computeMonthlyProfitComparisonTrend({
        endPeriodMonth: selectedPeriodMonth,
        monthsCount,
        transactions,
        cashflows,
        purchases,
        taxRecords,
        taxAdjustments,
        manualEntries,
        storeSettings,
      }),
    [
      selectedPeriodMonth,
      monthsCount,
      transactions,
      cashflows,
      purchases,
      taxRecords,
      taxAdjustments,
      manualEntries,
      storeSettings,
    ]
  );

  const summary = useMemo(() => {
    const totalGross = trendData.reduce((acc, p) => acc + p.labaKotor, 0);
    const totalNet = trendData.reduce((acc, p) => acc + p.labaBersih, 0);
    const totalRevenue = trendData.reduce((acc, p) => acc + p.omzet + p.pendapatanLain, 0);
    const totalOpex = trendData.reduce(
      (acc, p) => acc + p.bebanOperasional + p.penyusutan,
      0
    );

    const avgOpexRatio =
      totalRevenue > 0 ? Number(((totalOpex / totalRevenue) * 100).toFixed(1)) : 0;
    const profitRetention =
      totalGross > 0 ? Number(((totalNet / totalGross) * 100).toFixed(1)) : 0;

    return {
      totalGross,
      totalNet,
      avgOpexRatio,
      profitRetention,
    };
  }, [trendData]);

  const activePoint = useMemo<MonthlyProfitComparisonPoint | null>(() => {
    if (trendData.length === 0) return null;
    return (
      trendData.find((pt) => pt.periodMonth === selectedPeriodMonth) ||
      trendData[trendData.length - 1]
    );
  }, [trendData, selectedPeriodMonth]);

  return (
    <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Perbandingan Laba Kotor vs Laba Bersih Bulanan</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Klik batang bulan pada grafik untuk memeriksa efisiensi biaya operasional &amp; mengunduh arsip laporan periode tersebut.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 self-start md:self-auto">
          {([6, 12] as const).map((cnt) => (
            <button
              key={cnt}
              type="button"
              onClick={() => {
                sound.playTap();
                setMonthsCount(cnt);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                monthsCount === cnt
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cnt} Bulan
            </button>
          ))}
        </div>
      </div>

      {/* 4-Column Efficiency Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-sky-50/70 border border-sky-200/80">
          <div className="text-[11px] font-bold text-sky-900">Akumulasi Laba Kotor</div>
          <div className="text-base md:text-lg font-black text-sky-700 font-mono tabular-nums mt-0.5">
            {formatRupiah(summary.totalGross)}
          </div>
          <div className="text-[10.5px] text-sky-700/80 mt-0.5">
            Penjualan bersih dikurangi HPP FIFO
          </div>
        </div>

        <div
          className={`p-3 rounded-xl border ${
            summary.totalNet >= 0
              ? 'bg-emerald-50/70 border-emerald-200/80'
              : 'bg-rose-50/70 border-rose-200/80'
          }`}
        >
          <div
            className={`text-[11px] font-bold ${
              summary.totalNet >= 0 ? 'text-emerald-900' : 'text-rose-900'
            }`}
          >
            Akumulasi Laba Bersih
          </div>
          <div
            className={`text-base md:text-lg font-black font-mono tabular-nums mt-0.5 ${
              summary.totalNet >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {formatRupiah(summary.totalNet)}
          </div>
          <div
            className={`text-[10.5px] mt-0.5 ${
              summary.totalNet >= 0 ? 'text-emerald-700/80' : 'text-rose-700/80'
            }`}
          >
            Setelah beban operasional, penyusutan &amp; pajak
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[11px] font-bold text-slate-700">Rasio Biaya Operasional</div>
          <div className="text-base md:text-lg font-black text-slate-900 font-mono tabular-nums mt-0.5">
            {summary.avgOpexRatio.toFixed(1)}%
          </div>
          <div className="text-[10.5px] text-slate-500 mt-0.5">
            Porsi biaya ops &amp; susut terhadap omzet
          </div>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div className="text-[11px] font-bold text-slate-700">Retensi Laba Kotor → Bersih</div>
          <div className="text-base md:text-lg font-black text-slate-900 font-mono tabular-nums mt-0.5">
            {summary.profitRetention.toFixed(1)}%
          </div>
          <div className="text-[10.5px] text-slate-500 mt-0.5">
            Efisiensi konversi laba kotor menjadi bersih
          </div>
        </div>
      </div>

      {/* Interactive Recharts Bar Chart */}
      <div className="h-64 md:h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={trendData}
            margin={{ top: 10, right: 12, left: 6, bottom: 4 }}
            onClick={(state) => {
              const payload = (state as { activePayload?: Array<{ payload?: MonthlyProfitComparisonPoint }> } | null)
                ?.activePayload?.[0]?.payload;
              if (payload?.periodMonth) {
                sound.playTap();
                onSelectPeriodMonth(payload.periodMonth);
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatAxisMillions}
              tick={{ fontSize: 10.5, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={54}
            />
            <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
            <RechartsTooltip
              cursor={{ fill: '#f8fafc' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const pt = payload[0].payload as MonthlyProfitComparisonPoint;
                const totalCostDeductions = pt.bebanOperasional + pt.penyusutan + pt.estimasiPajak;
                return (
                  <div className="bg-slate-900 text-white p-3 rounded-xl text-xs shadow-xl border border-slate-700 space-y-1.5 min-w-[230px]">
                    <div className="font-bold text-slate-100 border-b border-slate-700 pb-1 flex items-center justify-between gap-3">
                      <span>{pt.fullLabel}</span>
                      <span className="text-[10.5px] text-slate-400 font-mono">
                        {pt.txCount} trx
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-300">Omzet Netto</span>
                      <span className="font-mono font-bold tabular-nums">{formatRupiah(pt.omzet)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-sky-300 font-semibold">Laba Kotor ({pt.grossMarginPercent.toFixed(1)}%)</span>
                      <span className="font-mono font-bold text-sky-300 tabular-nums">
                        {formatRupiah(pt.labaKotor)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-rose-300">Beban Ops, Susut &amp; Pajak</span>
                      <span className="font-mono text-rose-300 tabular-nums">
                        −{formatRupiah(totalCostDeductions)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-slate-700 pt-1">
                      <span className="font-bold text-emerald-300">Laba Bersih ({pt.netMarginPercent.toFixed(1)}%)</span>
                      <span
                        className={`font-mono font-black tabular-nums ${
                          pt.labaBersih >= 0 ? 'text-emerald-300' : 'text-rose-400'
                        }`}
                      >
                        {formatRupiah(pt.labaBersih)}
                      </span>
                    </div>
                    <div className="text-[10.5px] text-slate-400 pt-0.5 flex justify-between gap-3">
                      <span>Rasio Ops: {pt.opexRatioPercent.toFixed(1)}%</span>
                      <span>Retensi: {pt.profitRetentionPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              }}
            />
            <RechartsLegend wrapperStyle={{ fontSize: '11.5px', paddingTop: '6px' }} />
            <Bar
              dataKey="labaKotor"
              name="Laba Kotor (Gross Profit)"
              fill="#0284c7"
              radius={[6, 6, 0, 0]}
              barSize={22}
              className="cursor-pointer"
            >
              {trendData.map((entry) => (
                <Cell
                  key={`gross-${entry.periodMonth}`}
                  fill={entry.periodMonth === activePoint?.periodMonth ? '#0369a1' : '#38bdf8'}
                />
              ))}
            </Bar>
            <Bar
              dataKey="labaBersih"
              name="Laba Bersih (Net Profit)"
              fill="#10b981"
              radius={[6, 6, 0, 0]}
              barSize={22}
              className="cursor-pointer"
            >
              {trendData.map((entry) => {
                const isSelected = entry.periodMonth === activePoint?.periodMonth;
                const baseColor = entry.labaBersih >= 0
                  ? isSelected
                    ? '#047857'
                    : '#10b981'
                  : isSelected
                    ? '#be123c'
                    : '#f43f5e';
                return <Cell key={`net-${entry.periodMonth}`} fill={baseColor} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Selected Month Efficiency Detail Strip */}
      {activePoint && (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <TrendingUp className="w-3.5 h-3.5 text-teal-600 shrink-0" />
              <span>Rincian Efisiensi Periode: {activePoint.fullLabel}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 font-mono tabular-nums">
              <span>Omzet: <strong className="text-slate-900">{formatRupiah(activePoint.omzet)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>Laba Kotor: <strong className="text-sky-700">{formatRupiah(activePoint.labaKotor)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>Beban Ops: <strong className="text-rose-700">{formatRupiah(activePoint.bebanOperasional)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>Susut &amp; Pajak: <strong className="text-slate-800">{formatRupiah(activePoint.penyusutan + activePoint.estimasiPajak)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>
                Laba Bersih:{' '}
                <strong className={activePoint.labaBersih >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                  {formatRupiah(activePoint.labaBersih)}
                </strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onExportMonthlyPdf(activePoint.periodMonth);
            }}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors self-start lg:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Unduh PDF {activePoint.fullLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
};
