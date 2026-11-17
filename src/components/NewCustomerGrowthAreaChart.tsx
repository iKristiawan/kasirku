import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts';
import {
  UserPlus,
  Users,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react';
import { Customer } from '../types/pos';
import { formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

interface NewCustomerGrowthAreaChartProps {
  customers?: Customer[];
}

type GrowthChartMode = 'DAILY' | 'CUMULATIVE';

interface CustomerGrowthPoint {
  idx: number;
  dayStart: number;
  dateLabel: string;
  fullDateLabel: string;
  newCustomers: number;
  memberCount: number;
  nonMemberCount: number;
  cumulative30d: number;
  totalCustomerBase: number;
  movingAvg7d: number;
  isToday: boolean;
  sampleNames: string[];
}

const parseCustomerCreatedAtMs = (raw?: string): number | null => {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Date-only YYYY-MM-DD should always map cleanly to local calendar day (no UTC shift)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    const localDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    return isNaN(localDate.getTime()) ? null : localDate.getTime();
  }

  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime();
};

export const NewCustomerGrowthAreaChart: React.FC<NewCustomerGrowthAreaChartProps> = ({
  customers = [],
}) => {
  const { palette } = useChartTheme();
  const [viewMode, setViewMode] = useState<GrowthChartMode>('DAILY');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const summary = useMemo(() => {
    const now = new Date();
    const oneDayMs = 86400000;
    const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const start30dMs = todayStartMs - 29 * oneDayMs;
    const end30dMs = todayStartMs + oneDayMs - 1;
    const prev30dStartMs = start30dMs - 30 * oneDayMs;
    const prev30dEndMs = start30dMs - 1;

    const buckets = Array.from({ length: 30 }, (_, idx) => {
      const dayTs = start30dMs + idx * oneDayMs;
      const d = new Date(dayTs);
      const isToday = dayTs === todayStartMs;
      return {
        idx,
        dayStart: dayTs,
        dateLabel: isToday
          ? 'Hari Ini'
          : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
        fullDateLabel: d.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        newCustomers: 0,
        memberCount: 0,
        nonMemberCount: 0,
        sampleNames: [] as string[],
      };
    });

    let baselineBeforeWindow = 0;
    let prev30dTotal = 0;
    let totalRegisteredMembers = 0;

    customers.forEach((cust) => {
      if (cust.isMember !== false) {
        totalRegisteredMembers += 1;
      }

      const regDayMs = parseCustomerCreatedAtMs(cust.createdAt);
      if (regDayMs === null) {
        baselineBeforeWindow += 1;
        return;
      }

      if (regDayMs < start30dMs) {
        baselineBeforeWindow += 1;
        if (regDayMs >= prev30dStartMs && regDayMs <= prev30dEndMs) {
          prev30dTotal += 1;
        }
        return;
      }

      if (regDayMs >= start30dMs && regDayMs <= end30dMs) {
        const idx = Math.round((regDayMs - start30dMs) / oneDayMs);
        const bucket = buckets[idx];
        if (bucket) {
          bucket.newCustomers += 1;
          if (cust.isMember !== false) {
            bucket.memberCount += 1;
          } else {
            bucket.nonMemberCount += 1;
          }
          if (cust.name && bucket.sampleNames.length < 4) {
            bucket.sampleNames.push(cust.name);
          }
        }
      }
    });

    let running30d = 0;
    let activeRegistrationDays = 0;
    let bestDay: CustomerGrowthPoint | null = null;

    const chartPoints: CustomerGrowthPoint[] = buckets.map((b, i) => {
      running30d += b.newCustomers;
      if (b.newCustomers > 0) activeRegistrationDays += 1;

      const winStart = Math.max(0, i - 6);
      let winSum = 0;
      for (let j = winStart; j <= i; j++) {
        winSum += buckets[j].newCustomers;
      }
      const movingAvg7d = Number((winSum / (i - winStart + 1)).toFixed(2));

      const pt: CustomerGrowthPoint = {
        idx: b.idx,
        dayStart: b.dayStart,
        dateLabel: b.dateLabel,
        fullDateLabel: b.fullDateLabel,
        newCustomers: b.newCustomers,
        memberCount: b.memberCount,
        nonMemberCount: b.nonMemberCount,
        cumulative30d: running30d,
        totalCustomerBase: baselineBeforeWindow + running30d,
        movingAvg7d,
        isToday: b.dayStart === todayStartMs,
        sampleNames: b.sampleNames,
      };

      if (!bestDay || pt.newCustomers > bestDay.newCustomers) {
        bestDay = pt;
      }

      return pt;
    });

    const totalNew30d = running30d;
    const avgDailyNew = totalNew30d / 30;
    const growthPercent =
      prev30dTotal > 0
        ? ((totalNew30d - prev30dTotal) / prev30dTotal) * 100
        : totalNew30d > 0
        ? 100
        : 0;

    const rangeStartD = new Date(start30dMs);
    const rangeEndD = new Date(todayStartMs);
    const rangeLabel = `${rangeStartD.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
    })} – ${rangeEndD.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;

    return {
      chartPoints,
      rangeLabel,
      totalNew30d,
      prev30dTotal,
      growthPercent,
      hasPrev30dBaseline: prev30dTotal > 0,
      avgDailyNew,
      activeRegistrationDays,
      bestDay: bestDay && (bestDay as CustomerGrowthPoint).newCustomers > 0
        ? (bestDay as CustomerGrowthPoint)
        : null,
      totalCustomersAllTime: customers.length,
      totalRegisteredMembers,
      hasAny30dSignups: totalNew30d > 0,
    };
  }, [customers]);

  const isPositiveGrowth = summary.growthPercent >= 0;

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title="Tren Pertumbuhan Pelanggan Baru (30 Hari Terakhir)"
    >
    <div className="bg-white p-4 md:p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-600" />
              <span>Tren Pertumbuhan Pelanggan Baru (30 Hari Terakhir)</span>
            </h3>
            <span className="text-[11px] font-mono font-semibold text-slate-500 inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>{summary.rangeLabel}</span>
            </span>
            {summary.hasAny30dSignups && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-mono font-bold ${
                  isPositiveGrowth ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {isPositiveGrowth ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                <span>
                  {summary.hasPrev30dBaseline
                    ? `${isPositiveGrowth ? '+' : ''}${summary.growthPercent.toFixed(1)}% vs 30 hr lalu`
                    : `${formatNumber(summary.totalNew30d)} pendaftar baru`}
                </span>
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Grafik area memantau jumlah pelanggan yang mendaftar setiap hari selama 30 hari terakhir beserta laju pertumbuhan basis pelanggan toko.
          </p>
        </div>

        {/* Mode Toggle + Full Screen */}
        <div className="flex items-center gap-2 flex-wrap self-start xl:self-auto shrink-0">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setViewMode('DAILY');
              }}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'DAILY'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pendaftaran Harian
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setViewMode('CUMULATIVE');
              }}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                viewMode === 'CUMULATIVE'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pertumbuhan Kumulatif
            </button>
          </div>
          <FullscreenToggleButton
            isFullscreen={isFullscreen}
            onToggle={() => setIsFullscreen((prev) => !prev)}
          />
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        <div className="p-3 rounded-2xl bg-indigo-50/80 border border-indigo-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">
            Pelanggan Baru (30 Hari)
          </div>
          <div className="text-sm md:text-base font-black font-mono text-indigo-950 mt-0.5 tabular-nums">
            +{formatNumber(summary.totalNew30d)} Pelanggan
          </div>
          <div className="text-[10px] text-indigo-700 mt-0.5">
            Aktif daftar di {summary.activeRegistrationDays} hari berbeda
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-sky-50/75 border border-sky-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
            Rata-rata / Hari (30H)
          </div>
          <div className="text-sm md:text-base font-black font-mono text-slate-900 mt-0.5 tabular-nums">
            {summary.avgDailyNew.toFixed(1)} <span className="text-xs font-semibold">plg/hari</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Periode 30H lalu: {formatNumber(summary.prev30dTotal)} pendaftar
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-emerald-50/75 border border-emerald-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
            Puncak Pendaftaran Harian
          </div>
          <div className="text-sm md:text-base font-black font-mono text-emerald-950 mt-0.5 tabular-nums truncate">
            {summary.bestDay
              ? `${formatNumber(summary.bestDay.newCustomers)} plg (${summary.bestDay.dateLabel})`
              : '—'}
          </div>
          <div className="text-[10px] text-emerald-700 mt-0.5 truncate">
            {summary.bestDay ? summary.bestDay.fullDateLabel : 'Belum ada pendaftaran baru'}
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Total Database Pelanggan
          </div>
          <div className="text-sm md:text-base font-black font-mono text-slate-900 mt-0.5 tabular-nums flex items-center gap-1.5">
            <Users className="w-4 h-4 text-slate-500 shrink-0" />
            <span>{formatNumber(summary.totalCustomersAllTime)}</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {formatNumber(summary.totalRegisteredMembers)} Member aktif
          </div>
        </div>
      </div>

      {/* Area Chart */}
      <AnimatedChartStage
        filterKey={`cust-growth-30d-${viewMode}-${customers.length}`}
        accent="indigo"
        delayMs={100}
        className={isFullscreen ? 'w-full h-[60vh] min-h-[380px]' : 'w-full h-72 md:h-80'}
      >
        {!summary.hasAny30dSignups ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6 text-center">
            <UserPlus className="w-8 h-8 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">
              Belum ada pendaftaran pelanggan baru dalam 30 hari terakhir ({summary.rangeLabel})
            </p>
            <p className="text-[11px] text-slate-400 max-w-md">
              Saat ini terdapat {formatNumber(summary.totalCustomersAllTime)} pelanggan terdaftar di database toko. Tambahkan pelanggan baru dari menu Pelanggan atau saat checkout kasir untuk melihat grafik pertumbuhan harian.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={summary.chartPoints}
              margin={{ top: 16, right: 16, left: 4, bottom: 8 }}
            >
              <defs>
                <linearGradient id="newCustomerDailyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={palette.secondary} stopOpacity={0.38} />
                  <stop offset="95%" stopColor={palette.secondary} stopOpacity={0.03} />
                </linearGradient>
                <linearGradient id="newCustomerCumulGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={palette.primary} stopOpacity={0.36} />
                  <stop offset="95%" stopColor={palette.primary} stopOpacity={0.03} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={palette.grid} />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 10.5, fill: '#64748b', fontWeight: 600 }}
                axisLine={{ stroke: '#cbd5e1' }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                allowDecimals={false}
                tickFormatter={(val) => `${val}`}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={38}
              />

              {viewMode === 'DAILY' && summary.avgDailyNew > 0 && (
                <ReferenceLine
                  y={summary.avgDailyNew}
                  stroke={palette.warning}
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{
                    value: `Avg ${summary.avgDailyNew.toFixed(1)}/hr`,
                    position: 'insideTopRight',
                    fill: palette.warning,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}

              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const pt = payload[0]?.payload as CustomerGrowthPoint | undefined;
                  if (!pt) return null;

                  return (
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs font-sans min-w-[240px] space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
                        <span className="font-bold text-slate-100">{pt.fullDateLabel}</span>
                        {pt.isToday && (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">
                            Hari Ini
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 font-mono text-[11px]">
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-indigo-300 font-sans">Pelanggan Baru:</span>
                          <span className="font-black text-white tabular-nums">
                            +{formatNumber(pt.newCustomers)} orang
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-slate-400 font-sans">Member / Non-Member:</span>
                          <span className="font-semibold text-slate-200 tabular-nums">
                            {formatNumber(pt.memberCount)} / {formatNumber(pt.nonMemberCount)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-sky-300 font-sans">Akumulasi 30H:</span>
                          <span className="font-bold text-sky-300 tabular-nums">
                            +{formatNumber(pt.cumulative30d)} pelanggan
                          </span>
                        </div>
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-slate-400 font-sans">Total Basis Pelanggan:</span>
                          <span className="font-bold text-emerald-400 tabular-nums">
                            {formatNumber(pt.totalCustomerBase)} orang
                          </span>
                        </div>
                      </div>

                      {pt.sampleNames.length > 0 && (
                        <div className="pt-1.5 border-t border-slate-800 text-[10px] text-slate-300">
                          <span className="text-slate-400">Terdaftar: </span>
                          <span className="font-semibold">
                            {pt.sampleNames.join(', ')}
                            {pt.newCustomers > pt.sampleNames.length
                              ? ` +${pt.newCustomers - pt.sampleNames.length} lainnya`
                              : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }}
              />

              {viewMode === 'DAILY' ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="newCustomers"
                    name="Pelanggan Baru / Hari"
                    stroke={palette.secondary}
                    strokeWidth={2.5}
                    fill="url(#newCustomerDailyGrad)"
                    dot={{ r: 2.5, fill: palette.secondary, stroke: '#ffffff', strokeWidth: 1.5 }}
                    activeDot={{ r: 5.5, fill: palette.secondary, stroke: '#ffffff', strokeWidth: 2 }}
                    isAnimationActive={true}
                    animationDuration={600}
                    animationEasing="ease-out"
                  />
                  <Area
                    type="monotone"
                    dataKey="movingAvg7d"
                    name="Rata-rata Bergerak 7H"
                    stroke={palette.primary}
                    strokeWidth={1.75}
                    strokeDasharray="4 4"
                    fill="none"
                    dot={false}
                    activeDot={{ r: 4, fill: palette.primary }}
                    isAnimationActive={true}
                    animationDuration={550}
                    animationEasing="ease-out"
                  />
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="cumulative30d"
                  name="Akumulasi Pelanggan Baru (30H)"
                  stroke={palette.primary}
                  strokeWidth={2.75}
                  fill="url(#newCustomerCumulGrad)"
                  dot={{ r: 2.5, fill: palette.primary, stroke: '#ffffff', strokeWidth: 1.5 }}
                  activeDot={{ r: 5.5, fill: palette.primary, stroke: '#ffffff', strokeWidth: 2 }}
                  isAnimationActive={true}
                  animationDuration={620}
                  animationEasing="ease-out"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </AnimatedChartStage>

      {/* Footer Insight */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-4 flex-wrap">
          {viewMode === 'DAILY' ? (
            <>
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
                <span className="w-4 h-1 rounded-full inline-block" style={{ backgroundColor: palette.secondary }} />
                <span>Pendaftar Baru Harian</span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
                <span className="w-4 border-t-2 border-dashed inline-block" style={{ borderColor: palette.primary }} />
                <span>Moving Avg 7 Hari</span>
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700">
              <span className="w-4 h-1 rounded-full inline-block" style={{ backgroundColor: palette.primary }} />
              <span>Akumulasi Pelanggan Baru (30 Hari Terakhir)</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-indigo-700 font-semibold">
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span>
            Akuisisi bulan ini menambah{' '}
            {summary.totalCustomersAllTime > 0
              ? `${((summary.totalNew30d / summary.totalCustomersAllTime) * 100).toFixed(1)}%`
              : '0%'}{' '}
            basis pelanggan aktif toko.
          </span>
        </div>
      </div>
    </div>
    </ChartFullscreenShell>
  );
};
