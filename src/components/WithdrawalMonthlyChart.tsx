import React, { useMemo, useState } from 'react';
import { Banknote, TrendingUp, Layers, Coins } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from 'recharts';
import { CashflowRecord, Transaction } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';

interface WithdrawalMonthlyChartProps {
  cashflows: CashflowRecord[];
  transactions?: Transaction[];
}

interface MonthlyWithdrawalBucket {
  monthIndex: number;
  monthLabel: string;
  monthFull: string;
  totalPendapatanJasa: number;
  totalNominalDitarik: number;
  keuntunganBersihBulanan: number;
  akumulasiKeuntunganBersih: number;
  jumlahTransaksi: number;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_FULL = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const formatCompactAxis = (val: number) => {
  if (val >= 1_000_000_000) return `Rp ${(val / 1_000_000_000).toFixed(1)}M`;
  if (val >= 1_000_000) return `Rp ${(val / 1_000_000).toFixed(1)}jt`;
  if (val >= 1_000) return `Rp ${Math.round(val / 1_000).toLocaleString('id-ID')}k`;
  return `Rp ${val}`;
};

export const WithdrawalMonthlyChart: React.FC<WithdrawalMonthlyChartProps> = ({
  cashflows = [],
  transactions = [],
}) => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [profitBarMode, setProfitBarMode] = useState<'CUMULATIVE' | 'MONTHLY'>('CUMULATIVE');

  const summary = useMemo(() => {
    const availableYearsSet = new Set<number>([currentYear]);
    const outflowByTxRef = new Map<string, { amount: number; date: string; timestamp: number }>();
    const recordedAdminTxIds = new Set<string>();
    const recordedAdminRefs = new Set<string>();
    const matchedOutflowRefs = new Set<string>();

    cashflows.forEach((cf) => {
      const y = Number((cf.date || '').slice(0, 4)) || new Date(cf.timestamp || Date.now()).getFullYear();
      if (cf.isCashWithdrawalOutflow || cf.category === 'Tarik Tunai (Kas Keluar)') {
        if (y >= 2020 && y <= 2100) availableYearsSet.add(y);
        if (cf.referenceNumber) {
          const prev = outflowByTxRef.get(cf.referenceNumber);
          outflowByTxRef.set(cf.referenceNumber, {
            amount: (prev?.amount || 0) + Math.max(0, cf.amount || 0),
            date: cf.date || prev?.date || '',
            timestamp: cf.timestamp || prev?.timestamp || Date.now(),
          });
        }
      }
      if (cf.isCashWithdrawalAdminProfit || cf.category === 'Keuntungan Biaya Admin (Tarik Tunai)') {
        if (y >= 2020 && y <= 2100) availableYearsSet.add(y);
        if (cf.id.startsWith('cf_tarik_admin_')) {
          recordedAdminTxIds.add(cf.id.replace('cf_tarik_admin_', ''));
        }
        if (cf.referenceNumber) {
          recordedAdminRefs.add(cf.referenceNumber);
        }
      }
    });

    transactions.forEach((tx) => {
      const hasWd = (tx.items || []).some(
        (it) =>
          Boolean(it.isCashWithdrawal) ||
          (Boolean(it.isQuickSale) && /tarik\s*tunai/i.test(it.productName || ''))
      );
      if (hasWd && tx.timestamp) {
        availableYearsSet.add(new Date(tx.timestamp).getFullYear());
      }
    });

    const buckets: MonthlyWithdrawalBucket[] = MONTH_SHORT.map((label, idx) => ({
      monthIndex: idx,
      monthLabel: label,
      monthFull: MONTH_FULL[idx],
      totalPendapatanJasa: 0,
      totalNominalDitarik: 0,
      keuntunganBersihBulanan: 0,
      akumulasiKeuntunganBersih: 0,
      jumlahTransaksi: 0,
    }));

    const getMonthIdx = (dateStr?: string, timestamp?: number) => {
      const parsedMonth = Number((dateStr || '').slice(5, 7));
      if (parsedMonth >= 1 && parsedMonth <= 12) return parsedMonth - 1;
      return new Date(timestamp || Date.now()).getMonth();
    };

    const getYear = (dateStr?: string, timestamp?: number) => {
      const parsedYear = Number((dateStr || '').slice(0, 4));
      if (parsedYear >= 2020 && parsedYear <= 2100) return parsedYear;
      return new Date(timestamp || Date.now()).getFullYear();
    };

    // 1. Primary source: explicit cashflow admin-profit income records (+ paired withdrawal principal)
    cashflows.forEach((cf) => {
      const isAdminIncome =
        cf.type === 'PEMASUKAN' &&
        (cf.isCashWithdrawalAdminProfit || cf.category === 'Keuntungan Biaya Admin (Tarik Tunai)');
      if (!isAdminIncome) return;

      if (getYear(cf.date, cf.timestamp) !== selectedYear) return;

      const monthIdx = getMonthIdx(cf.date, cf.timestamp);
      if (monthIdx < 0 || monthIdx >= 12) return;

      const adminFee = Math.max(0, cf.amount || 0);
      const pairedOutflow = cf.referenceNumber ? outflowByTxRef.get(cf.referenceNumber) : undefined;
      if (cf.referenceNumber && pairedOutflow) {
        matchedOutflowRefs.add(cf.referenceNumber);
      }
      const principal =
        cf.withdrawalPrincipalAmount !== undefined
          ? Math.max(0, cf.withdrawalPrincipalAmount)
          : pairedOutflow?.amount || 0;

      buckets[monthIdx].keuntunganBersihBulanan += adminFee;
      buckets[monthIdx].totalNominalDitarik += principal;
      buckets[monthIdx].totalPendapatanJasa += principal + adminFee;
      buckets[monthIdx].jumlahTransaksi += 1;
    });

    // 2. Fallback for historical POS transactions not yet split into cf_tarik_admin_*
    transactions.forEach((tx) => {
      if (recordedAdminTxIds.has(tx.id) || (tx.invoiceNumber && recordedAdminRefs.has(tx.invoiceNumber))) {
        return;
      }
      const d = new Date(tx.timestamp);
      if (d.getFullYear() !== selectedYear) return;

      let txNominal = 0;
      let txAdminProfit = 0;
      let txGrossRevenue = 0;
      let hasWd = false;

      (tx.items || []).forEach((item) => {
        const isWd =
          Boolean(item.isCashWithdrawal) ||
          (Boolean(item.isQuickSale) && /tarik\s*tunai/i.test(item.productName || ''));
        if (!isWd) return;
        hasWd = true;
        const qty = Math.max(1, item.quantity || 1);
        const principal =
          item.principalAmount !== undefined
            ? Math.max(0, item.principalAmount)
            : Math.max(0, item.costPrice || 0);
        const adminFee =
          item.adminFee !== undefined
            ? Math.max(0, item.adminFee)
            : Math.max(0, (item.unitPrice || 0) - principal);
        const lineRevenue = item.totalAmount > 0 ? item.totalAmount : qty * (principal + adminFee);
        txNominal += qty * principal;
        txAdminProfit += qty * adminFee;
        txGrossRevenue += lineRevenue;
      });

      if (!hasWd || (txNominal <= 0 && txAdminProfit <= 0 && txGrossRevenue <= 0)) return;
      if (tx.invoiceNumber) matchedOutflowRefs.add(tx.invoiceNumber);

      const monthIdx = d.getMonth();
      if (monthIdx >= 0 && monthIdx < 12) {
        buckets[monthIdx].keuntunganBersihBulanan += txAdminProfit;
        buckets[monthIdx].totalNominalDitarik += txNominal;
        buckets[monthIdx].totalPendapatanJasa += txGrossRevenue;
        buckets[monthIdx].jumlahTransaksi += 1;
      }
    });

    // 3. Any standalone Tarik Tunai outflow cashflow records (if admin fee was Rp 0 and no transaction record matched)
    cashflows.forEach((cf) => {
      const isOutflow =
        cf.type === 'PENGELUARAN' &&
        (cf.isCashWithdrawalOutflow || cf.category === 'Tarik Tunai (Kas Keluar)');
      if (!isOutflow) return;
      if (cf.referenceNumber && (matchedOutflowRefs.has(cf.referenceNumber) || recordedAdminRefs.has(cf.referenceNumber))) {
        return;
      }
      if (getYear(cf.date, cf.timestamp) !== selectedYear) return;

      const monthIdx = getMonthIdx(cf.date, cf.timestamp);
      if (monthIdx < 0 || monthIdx >= 12) return;

      const principal = Math.max(0, cf.amount || 0);
      const adminFee = Math.max(0, cf.withdrawalAdminFeeAmount || 0);
      buckets[monthIdx].totalNominalDitarik += principal;
      buckets[monthIdx].keuntunganBersihBulanan += adminFee;
      buckets[monthIdx].totalPendapatanJasa += principal + adminFee;
      buckets[monthIdx].jumlahTransaksi += 1;
    });

    // Compute running cumulative YTD admin profit per month
    let runningProfit = 0;
    buckets.forEach((b) => {
      runningProfit += b.keuntunganBersihBulanan;
      b.akumulasiKeuntunganBersih = runningProfit;
    });

    const activeMonthIdx = selectedYear === currentYear ? new Date().getMonth() : 11;
    const totalGrossRevenueYear = buckets.reduce((s, m) => s + m.totalPendapatanJasa, 0);
    const totalAdminProfitYear = buckets.reduce((s, m) => s + m.keuntunganBersihBulanan, 0);
    const totalPrincipalYear = buckets.reduce((s, m) => s + m.totalNominalDitarik, 0);
    const totalTxYear = buckets.reduce((s, m) => s + m.jumlahTransaksi, 0);

    return {
      years: Array.from(availableYearsSet).sort((a, b) => b - a),
      months: buckets,
      currentMonthLabel: MONTH_FULL[activeMonthIdx],
      currentMonthRevenue: buckets[activeMonthIdx]?.totalPendapatanJasa || 0,
      currentMonthProfit: buckets[activeMonthIdx]?.keuntunganBersihBulanan || 0,
      totalGrossRevenueYear,
      totalAdminProfitYear,
      totalPrincipalYear,
      totalTxYear,
    };
  }, [cashflows, transactions, selectedYear, currentYear]);

  const profitBarDataKey =
    profitBarMode === 'CUMULATIVE' ? 'akumulasiKeuntunganBersih' : 'keuntunganBersihBulanan';
  const profitBarLabel =
    profitBarMode === 'CUMULATIVE'
      ? 'Akumulasi Keuntungan Bersih (Biaya Admin YTD)'
      : 'Keuntungan Bersih Biaya Admin (Bulanan)';

  return (
    <div className="bg-white p-4 md:p-5 rounded-2xl border border-emerald-200/80 shadow-2xs space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 shrink-0">
            <Banknote className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs md:text-sm font-black text-slate-900">
              Analisis Bulanan Jasa Tarik Tunai: Pendapatan vs Akumulasi Laba Admin
            </h3>
            <p className="text-[11px] text-slate-500">
              Memisahkan total pendapatan jasa tarik tunai (nominal + admin) dan akumulasi keuntungan bersih biaya admin per bulan
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setProfitBarMode('CUMULATIVE');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                profitBarMode === 'CUMULATIVE'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Akumulasi YTD
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setProfitBarMode('MONTHLY');
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                profitBarMode === 'MONTHLY'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Per Bulan
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500">Tahun:</span>
            <select
              value={selectedYear}
              onChange={(e) => {
                sound.playTap();
                setSelectedYear(Number(e.target.value));
              }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {summary.years.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Breakdown Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200">
          <div className="text-[10.5px] font-bold text-sky-800 uppercase tracking-wider flex items-center justify-between">
            <span>Total Pendapatan Jasa ({selectedYear})</span>
            <Layers className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="text-lg font-black font-mono text-sky-900 mt-1 tabular-nums">
            {formatRupiah(summary.totalGrossRevenueYear)}
          </div>
          <div className="text-[10px] text-sky-700 mt-0.5">
            {summary.currentMonthLabel}: {formatRupiah(summary.currentMonthRevenue)} ({formatNumber(summary.totalTxYear)} transaksi)
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200">
          <div className="text-[10.5px] font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
            <span>Akumulasi Laba Bersih Admin ({selectedYear})</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-lg font-black font-mono text-emerald-800 mt-1 tabular-nums">
            +{formatRupiah(summary.totalAdminProfitYear)}
          </div>
          <div className="text-[10px] text-emerald-700 mt-0.5">
            Laba {summary.currentMonthLabel}: +{formatRupiah(summary.currentMonthProfit)}
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
          <div className="text-[10.5px] font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
            <span>Pokok Kas Disalurkan ({selectedYear})</span>
            <Coins className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-lg font-black font-mono text-amber-900 mt-1 tabular-nums">
            {formatRupiah(summary.totalPrincipalYear)}
          </div>
          <div className="text-[10px] text-amber-700 mt-0.5">
            Total dana tunai diterima pelanggan
          </div>
        </div>
      </div>

      {/* Grouped Monthly BarChart with Dual Axis for Clear Separation */}
      <div className="h-56 md:h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={summary.months}
            margin={{ top: 10, right: 12, left: 6, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="revenue"
              orientation="left"
              tickFormatter={formatCompactAxis}
              tick={{ fontSize: 10, fill: '#0369a1' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              yAxisId="profit"
              orientation="right"
              tickFormatter={formatCompactAxis}
              tick={{ fontSize: 10, fill: '#047857' }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0].payload as MonthlyWithdrawalBucket;
                return (
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-lg text-xs space-y-1.5 min-w-[235px]">
                    <div className="font-black text-slate-900 border-b border-slate-100 pb-1">
                      {row.monthFull} {selectedYear} ({row.jumlahTransaksi} transaksi)
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sky-700 font-semibold">Pendapatan Jasa Tarik Tunai:</span>
                      <span className="font-mono font-bold text-sky-900">
                        {formatRupiah(row.totalPendapatanJasa)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-slate-500">Pokok Nominal Tarik Tunai:</span>
                      <span className="font-mono font-semibold text-slate-700">
                        {formatRupiah(row.totalNominalDitarik)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-emerald-700 font-semibold">Laba Admin Bulan Ini:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        +{formatRupiah(row.keuntunganBersihBulanan)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                      <span className="text-emerald-800 font-bold">Akumulasi Laba Admin (YTD):</span>
                      <span className="font-mono font-black text-emerald-800">
                        +{formatRupiah(row.akumulasiKeuntunganBersih)}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <RechartsLegend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
            <Bar
              yAxisId="revenue"
              dataKey="totalPendapatanJasa"
              name="Total Pendapatan Jasa Tarik Tunai"
              fill="#0284c7"
              radius={[5, 5, 0, 0]}
              barSize={16}
            />
            <Bar
              yAxisId="profit"
              dataKey={profitBarDataKey}
              name={profitBarLabel}
              fill="#059669"
              radius={[5, 5, 0, 0]}
              barSize={16}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
