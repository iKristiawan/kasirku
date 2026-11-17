import React, { useMemo, useState } from 'react';
import {
  Users,
  Clock,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  UserCheck,
  Zap,
} from 'lucide-react';
import { AttendanceRecord, Product, Transaction } from '../types/pos';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';

interface ShiftEfficiencyCardProps {
  transactions: Transaction[];
  attendances?: AttendanceRecord[];
  productMap: Map<string, Product>;
  hiddenCategorySet: Set<string>;
  currentStart: number;
  currentEnd: number;
  periodLabel: string;
}

type PeakScope = 'TOP_3_HOURS' | 'PEAK_HOUR';

const toLocalDateStr = (ms: number): string => {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseLocalDateBounds = (dateStr: string): { startMs: number; endMs: number } | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const start = new Date(year, month, day, 0, 0, 0, 0).getTime();
  const end = new Date(year, month, day, 23, 59, 59, 999).getTime();
  return { startMs: start, endMs: end };
};

export const ShiftEfficiencyCard: React.FC<ShiftEfficiencyCardProps> = ({
  transactions,
  attendances = [],
  productMap,
  hiddenCategorySet,
  currentStart,
  currentEnd,
  periodLabel,
}) => {
  const [peakScope, setPeakScope] = useState<PeakScope>('TOP_3_HOURS');

  const analysis = useMemo(() => {
    const isFiltered = hiddenCategorySet.size > 0;
    const nowMs = Date.now();
    const todayStr = toLocalDateStr(nowMs);

    // 1. Aggregate transactions in active period by hour (0..23) and by (dateStr + hour) slot
    const hourlyTxTotals = new Array<number>(24).fill(0);
    const hourlyRevTotals = new Array<number>(24).fill(0);
    const slotStatsMap = new Map<
      string,
      { dateStr: string; hour: number; txCount: number; revenue: number }
    >();

    let periodTotalTx = 0;

    transactions.forEach((tx) => {
      if (tx.timestamp < currentStart || tx.timestamp > currentEnd) return;

      let matchedRevenue = Number(tx.finalAmount) || 0;
      let hasMatch = !isFiltered;

      if (isFiltered) {
        matchedRevenue = 0;
        hasMatch = false;
        tx.items.forEach((item) => {
          const prod = productMap.get(item.productId);
          const catName = (prod?.category || 'Umum').trim() || 'Umum';
          if (!hiddenCategorySet.has(catName)) {
            matchedRevenue += Number(item.totalAmount) || 0;
            hasMatch = true;
          }
        });
      }

      if (!hasMatch) return;

      const d = new Date(tx.timestamp);
      const hour = d.getHours();
      const dateStr = toLocalDateStr(tx.timestamp);
      const slotKey = `${dateStr}|${hour}`;

      periodTotalTx += 1;
      hourlyTxTotals[hour] += 1;
      hourlyRevTotals[hour] += matchedRevenue;

      const existing = slotStatsMap.get(slotKey);
      if (existing) {
        existing.txCount += 1;
        existing.revenue += matchedRevenue;
      } else {
        slotStatsMap.set(slotKey, {
          dateStr,
          hour,
          txCount: 1,
          revenue: matchedRevenue,
        });
      }
    });

    // 2. Identify busy hours in period
    const activeHourRanks = hourlyTxTotals
      .map((count, hour) => ({ hour, count, revenue: hourlyRevTotals[hour] }))
      .filter((h) => h.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return b.revenue - a.revenue;
      });

    const selectedBusyHourObjects =
      peakScope === 'PEAK_HOUR'
        ? activeHourRanks.slice(0, 1)
        : activeHourRanks.slice(0, Math.min(3, activeHourRanks.length));

    const busyHoursSet = new Set<number>(selectedBusyHourObjects.map((h) => h.hour));
    const busyHoursSortedLabel = [...selectedBusyHourObjects]
      .sort((a, b) => a.hour - b.hour)
      .map((h) => `${String(h.hour).padStart(2, '0')}:00`)
      .join(', ');

    const busyHourTxTotal = selectedBusyHourObjects.reduce((s, h) => s + h.count, 0);
    const busyHourRevenueTotal = selectedBusyHourObjects.reduce((s, h) => s + h.revenue, 0);
    const busyTxSharePercent =
      periodTotalTx > 0 ? (busyHourTxTotal / periodTotalTx) * 100 : 0;

    // 3. Parse AttendanceRecord effective time intervals overlapping active period
    interface ResolvedAttendance {
      userId: string;
      userName: string;
      userRole: string;
      dateStr: string;
      startMs: number;
      endMs: number;
    }

    const periodAttendances: ResolvedAttendance[] = [];
    const allPeriodLoggedInUsers = new Map<string, { name: string; role: string }>();

    attendances.forEach((att) => {
      const bounds = parseLocalDateBounds(att.date);
      const startMs = Number(att.checkInTimestamp) || bounds?.startMs || 0;
      if (!startMs) return;

      let endMs: number;
      if (att.checkOutTimestamp && att.checkOutTimestamp >= startMs) {
        endMs = att.checkOutTimestamp;
      } else if (att.date === todayStr) {
        endMs = Math.max(startMs, nowMs);
      } else {
        const dayEnd = bounds?.endMs ?? startMs + 9 * 3600000;
        endMs = Math.min(dayEnd, startMs + 9 * 3600000);
      }

      if (endMs < currentStart || startMs > currentEnd) return;

      periodAttendances.push({
        userId: att.userId,
        userName: att.userName,
        userRole: att.userRole,
        dateStr: att.date,
        startMs,
        endMs,
      });

      if (!allPeriodLoggedInUsers.has(att.userId)) {
        allPeriodLoggedInUsers.set(att.userId, {
          name: att.userName,
          role: att.userRole,
        });
      }
    });

    // 4. Match active busy-hour slots with logged-in employees from AttendanceRecord
    const busySlots = Array.from(slotStatsMap.values()).filter((s) =>
      busyHoursSet.has(s.hour)
    );

    let totalStaffSlotPresences = 0;
    const uniquePeakStaffMap = new Map<string, { name: string; role: string; busyHoursCount: number }>();

    busySlots.forEach((slot) => {
      const bounds = parseLocalDateBounds(slot.dateStr);
      if (!bounds) return;
      const slotDate = new Date(bounds.startMs);
      const slotStartMs = new Date(
        slotDate.getFullYear(),
        slotDate.getMonth(),
        slotDate.getDate(),
        slot.hour,
        0,
        0,
        0
      ).getTime();
      const slotEndMs = slotStartMs + 3600000 - 1;

      const loggedInDuringSlot = new Set<string>();
      periodAttendances.forEach((att) => {
        if (att.startMs <= slotEndMs && att.endMs >= slotStartMs) {
          if (!loggedInDuringSlot.has(att.userId)) {
            loggedInDuringSlot.add(att.userId);
            const prev = uniquePeakStaffMap.get(att.userId);
            if (prev) {
              prev.busyHoursCount += 1;
            } else {
              uniquePeakStaffMap.set(att.userId, {
                name: att.userName,
                role: att.userRole,
                busyHoursCount: 1,
              });
            }
          }
        }
      });

      totalStaffSlotPresences += loggedInDuringSlot.size;
    });

    const activeBusySlotCount = busySlots.length;
    const avgBusyTxPerHour =
      activeBusySlotCount > 0 ? busyHourTxTotal / activeBusySlotCount : 0;
    const avgStaffPerBusyHour =
      activeBusySlotCount > 0 ? totalStaffSlotPresences / activeBusySlotCount : 0;

    // Transactions handled per logged-in employee per busy hour
    const txPerStaffPerBusyHour =
      totalStaffSlotPresences > 0
        ? busyHourTxTotal / totalStaffSlotPresences
        : null;

    // Recommended cashiers based on standard ~8 trx/jam/karyawan peak throughput
    const recommendedStaffPerBusyHour =
      avgBusyTxPerHour > 0 ? Math.max(1, Math.ceil(avgBusyTxPerHour / 8)) : 0;
    const staffGap =
      recommendedStaffPerBusyHour > 0
        ? recommendedStaffPerBusyHour - Math.round(avgStaffPerBusyHour)
        : 0;

    // Overall period ratio (busy transactions divided by unique staff logged in at busy hours)
    const uniquePeakStaffList = Array.from(uniquePeakStaffMap.entries()).map(
      ([userId, info]) => ({ userId, ...info })
    );

    type EfficiencyStatus =
      | 'OPTIMAL'
      | 'HIGH_LOAD'
      | 'UNDERUTILIZED'
      | 'NO_PEAK_STAFF'
      | 'NO_ATTENDANCE'
      | 'NO_TX';

    let status: EfficiencyStatus = 'OPTIMAL';
    let statusBadgeLabel = 'Shift Efisien';
    let recommendationText = 'Jumlah karyawan seimbang dengan kepadatan jam sibuk.';

    if (periodTotalTx === 0) {
      status = 'NO_TX';
      statusBadgeLabel = 'Belum Ada Transaksi';
      recommendationText = 'Belum ada transaksi pada periode terpilih.';
    } else if (periodAttendances.length === 0) {
      status = 'NO_ATTENDANCE';
      statusBadgeLabel = 'Butuh Data Absensi';
      recommendationText = `Tercatat ${formatNumber(busyHourTxTotal)} trx di jam sibuk (${busyHoursSortedLabel}). Minta staf check-in di menu Absensi untuk ukur efisiensi.`;
    } else if (uniquePeakStaffList.length === 0) {
      status = 'NO_PEAK_STAFF';
      statusBadgeLabel = '0 Staf di Jam Sibuk';
      recommendationText = `Ada ${formatNumber(allPeriodLoggedInUsers.size)} staf absen periode ini, tetapi belum bertindih dengan jam sibuk (${busyHoursSortedLabel}).`;
    } else if (txPerStaffPerBusyHour !== null && txPerStaffPerBusyHour > 9) {
      status = 'HIGH_LOAD';
      statusBadgeLabel = 'Beban Tinggi';
      recommendationText =
        staffGap > 0
          ? `Antrean berisiko padat. Tambah +${staffGap} staf saat jam ${busyHoursSortedLabel}.`
          : `Beban tinggi (${txPerStaffPerBusyHour.toFixed(1)} trx/staf/jam). Optimalkan kasir cadangan.`;
    } else if (
      txPerStaffPerBusyHour !== null &&
      txPerStaffPerBusyHour < 3 &&
      avgStaffPerBusyHour > 1.2
    ) {
      status = 'UNDERUTILIZED';
      statusBadgeLabel = 'Shift Longgar';
      recommendationText = `Rasio rendah (${txPerStaffPerBusyHour.toFixed(1)} trx/staf/jam). Pertimbangkan geser 1 staf ke jam puncak.`;
    } else {
      status = 'OPTIMAL';
      statusBadgeLabel = 'Shift Optimal';
      recommendationText = `Beban ideal ${txPerStaffPerBusyHour?.toFixed(1) ?? '0'} trx/staf/jam (target ideal 4–9 trx/staf/jam).`;
    }

    return {
      periodTotalTx,
      busyHourTxTotal,
      busyHourRevenueTotal,
      busyTxSharePercent,
      busyHoursSortedLabel,
      activeBusySlotCount,
      avgBusyTxPerHour,
      avgStaffPerBusyHour,
      totalStaffSlotPresences,
      uniquePeakStaffList,
      allPeriodStaffCount: allPeriodLoggedInUsers.size,
      totalAttendanceRecordsInPeriod: periodAttendances.length,
      txPerStaffPerBusyHour,
      recommendedStaffPerBusyHour,
      staffGap,
      status,
      statusBadgeLabel,
      recommendationText,
    };
  }, [
    transactions,
    attendances,
    productMap,
    hiddenCategorySet,
    currentStart,
    currentEnd,
    peakScope,
  ]);

  const statusTone = useMemo(() => {
    switch (analysis.status) {
      case 'HIGH_LOAD':
      case 'NO_PEAK_STAFF':
        return {
          container: 'bg-gradient-to-r from-rose-50/90 via-white to-amber-50/60 border-rose-200',
          badge: 'bg-rose-100 text-rose-800 border-rose-200',
          icon: 'text-rose-600',
          value: 'text-rose-800',
        };
      case 'UNDERUTILIZED':
        return {
          container: 'bg-gradient-to-r from-sky-50/90 via-white to-indigo-50/50 border-sky-200',
          badge: 'bg-sky-100 text-sky-800 border-sky-200',
          icon: 'text-sky-600',
          value: 'text-sky-900',
        };
      case 'NO_ATTENDANCE':
      case 'NO_TX':
        return {
          container: 'bg-gradient-to-r from-amber-50/85 via-white to-slate-50 border-amber-200',
          badge: 'bg-amber-100 text-amber-800 border-amber-200',
          icon: 'text-amber-600',
          value: 'text-slate-800',
        };
      default:
        return {
          container: 'bg-gradient-to-r from-indigo-50/90 via-white to-emerald-50/50 border-indigo-200',
          badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
          icon: 'text-indigo-600',
          value: 'text-indigo-950',
        };
    }
  }, [analysis.status]);

  // Utilization gauge normalized vs 9 trx/staf/jam ceiling
  const loadGaugePercent =
    analysis.txPerStaffPerBusyHour !== null
      ? Math.min(100, Math.round((analysis.txPerStaffPerBusyHour / 12) * 100))
      : 0;

  return (
    <div className={`rounded-xl border p-3 md:p-3.5 transition-colors ${statusTone.container}`}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 items-center">
        {/* Left: Primary Ratio & Status */}
        <div className="lg:col-span-5 space-y-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-slate-700">
              <Zap className={`w-3.5 h-3.5 shrink-0 ${statusTone.icon}`} />
              <span>Efisiensi Shift ({periodLabel})</span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <div className="inline-flex items-center bg-white/90 border border-slate-200 rounded-lg p-0.5 text-[9.5px]">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setPeakScope('TOP_3_HOURS');
                  }}
                  className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    peakScope === 'TOP_3_HOURS'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Top 3 Jam Sibuk
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setPeakScope('PEAK_HOUR');
                  }}
                  className={`px-1.5 py-0.5 rounded font-bold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    peakScope === 'PEAK_HOUR'
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Jam Puncak
                </button>
              </div>

              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold border ${statusTone.badge}`}
              >
                {analysis.status === 'OPTIMAL' ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : analysis.status === 'HIGH_LOAD' || analysis.status === 'NO_PEAK_STAFF' ? (
                  <AlertTriangle className="w-3 h-3" />
                ) : (
                  <TrendingUp className="w-3 h-3" />
                )}
                <span>{analysis.statusBadgeLabel}</span>
              </span>
            </div>
          </div>

          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span
              className={`text-2xl md:text-[26px] font-black font-mono tabular-nums tracking-tight leading-none ${statusTone.value}`}
            >
              {analysis.txPerStaffPerBusyHour !== null
                ? `${analysis.txPerStaffPerBusyHour.toFixed(1)}`
                : '—'}
            </span>
            <span className="text-xs font-bold text-slate-600">
              {analysis.txPerStaffPerBusyHour !== null
                ? 'trx / staf / jam sibuk'
                : 'data absensi jam sibuk'}
            </span>

            {analysis.busyHoursSortedLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-[10px] font-mono font-bold text-slate-700">
                <Clock className="w-3 h-3 text-amber-600" />
                <span>{analysis.busyHoursSortedLabel}</span>
              </span>
            )}
          </div>

          <p className="text-[10.5px] text-slate-600 leading-snug">
            {analysis.recommendationText}
          </p>
        </div>

        {/* Right: 3 Breakdown Columns */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3 lg:border-l lg:border-slate-200/80 lg:pl-4">
          {/* Col 1: Total Transaksi Jam Sibuk */}
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Transaksi Jam Sibuk
            </div>
            <div className="text-sm md:text-base font-black font-mono text-slate-900 tabular-nums">
              {formatNumber(analysis.busyHourTxTotal)} trx
              <span className="text-[10px] font-semibold text-slate-500 ml-1">
                ({analysis.busyTxSharePercent.toFixed(0)}%)
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono tabular-nums truncate">
              {analysis.activeBusySlotCount > 0
                ? `${analysis.avgBusyTxPerHour.toFixed(1)} trx/jam · ${formatRupiah(analysis.busyHourRevenueTotal)}`
                : 'Belum ada transaksi jam sibuk'}
            </div>
          </div>

          {/* Col 2: Karyawan Login (AttendanceRecord) */}
          <div className="space-y-0.5 sm:border-l sm:border-slate-200/75 sm:pl-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 flex items-center gap-1">
              <UserCheck className="w-3 h-3 shrink-0" />
              <span>Karyawan Login (Shift)</span>
            </div>
            <div className="text-sm md:text-base font-black font-mono text-indigo-950 tabular-nums">
              {formatNumber(analysis.uniquePeakStaffList.length)} staf
              <span className="text-[10px] font-semibold text-slate-500 ml-1">
                ({analysis.avgStaffPerBusyHour.toFixed(1)} avg/jam)
              </span>
            </div>
            <div
              className="text-[10px] text-slate-600 truncate"
              title={
                analysis.uniquePeakStaffList.length > 0
                  ? analysis.uniquePeakStaffList
                      .map((s) => `${s.name} (${s.role})`)
                      .join(', ')
                  : 'Belum ada karyawan check-in saat jam sibuk'
              }
            >
              {analysis.uniquePeakStaffList.length > 0 ? (
                analysis.uniquePeakStaffList.map((s) => s.name).join(', ')
              ) : (
                <span className="text-slate-400">
                  {analysis.allPeriodStaffCount > 0
                    ? `${analysis.allPeriodStaffCount} absen di luar jam sibuk`
                    : '0 check-in AttendanceRecord'}
                </span>
              )}
            </div>
          </div>

          {/* Col 3: Beban & Rekomendasi Jadwal */}
          <div className="space-y-1 sm:border-l sm:border-slate-200/75 sm:pl-3">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1">
                <Users className="w-3 h-3 shrink-0" />
                <span>Saran Jadwal</span>
              </span>
              <span className="font-mono font-bold text-slate-800 tabular-nums">
                {analysis.recommendedStaffPerBusyHour > 0
                  ? `${analysis.recommendedStaffPerBusyHour} Kasir`
                  : '-'}
              </span>
            </div>

            {/* Clean static load gauge */}
            <div className="w-full h-2 rounded-full bg-slate-200/90 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  analysis.status === 'HIGH_LOAD'
                    ? 'bg-rose-500'
                    : analysis.status === 'UNDERUTILIZED'
                    ? 'bg-sky-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${loadGaugePercent}%` }}
              />
            </div>

            <div className="text-[10px] font-semibold text-slate-600 truncate">
              {analysis.recommendedStaffPerBusyHour > 0 && analysis.uniquePeakStaffList.length > 0 ? (
                analysis.staffGap > 0 ? (
                  <span className="text-rose-700 font-bold">
                    Perlu +{analysis.staffGap} staf saat jam sibuk
                  </span>
                ) : analysis.staffGap < 0 ? (
                  <span className="text-sky-700 font-bold">
                    Surplus {Math.abs(analysis.staffGap)} staf di jam sibuk
                  </span>
                ) : (
                  <span className="text-emerald-700 font-bold">
                    Jumlah staf sesuai kebutuhan puncak
                  </span>
                )
              ) : (
                <span>Acuan: 1 kasir per ±8 trx/jam</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
