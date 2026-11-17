import React, { useMemo, useState } from 'react';
import {
  Star,
  MessageSquare,
  ThumbsUp,
  AlertTriangle,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Receipt,
  Sparkles,
} from 'lucide-react';
import { Transaction } from '../types/pos';
import { formatDateTime, formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';

interface CustomerSatisfactionReportPanelProps {
  transactions: Transaction[];
  currentStart: number;
  currentEnd: number;
  previousStart: number;
  previousEnd: number;
  periodLabel: string;
}

export const CustomerSatisfactionReportPanel: React.FC<CustomerSatisfactionReportPanelProps> = ({
  transactions,
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  periodLabel,
}) => {
  const [scope, setScope] = useState<'PERIOD' | 'ALL'>('ALL');
  const [ratingFilter, setRatingFilter] = useState<'ALL' | 'POSITIVE' | 'ATTENTION'>('ALL');

  const summary = useMemo(() => {
    const allRated = transactions.filter(
      (t) => typeof t.customerRating === 'number' && t.customerRating >= 1 && t.customerRating <= 5
    );

    const inCurrentTx = transactions.filter(
      (t) => t.timestamp >= currentStart && t.timestamp <= currentEnd
    );
    const inPreviousRated = allRated.filter(
      (t) => t.timestamp >= previousStart && t.timestamp <= previousEnd
    );

    const activeRated =
      scope === 'PERIOD'
        ? allRated.filter((t) => t.timestamp >= currentStart && t.timestamp <= currentEnd)
        : allRated;

    const totalBaseTx = scope === 'PERIOD' ? inCurrentTx.length : transactions.length;
    const totalRated = activeRated.length;

    const sumRating = activeRated.reduce((acc, t) => acc + (t.customerRating || 0), 0);
    const avgRating = totalRated > 0 ? sumRating / totalRated : 0;

    const prevSum = inPreviousRated.reduce((acc, t) => acc + (t.customerRating || 0), 0);
    const prevAvg = inPreviousRated.length > 0 ? prevSum / inPreviousRated.length : 0;
    const avgDelta =
      scope === 'PERIOD' && inPreviousRated.length > 0 && totalRated > 0
        ? avgRating - prevAvg
        : null;

    const satisfiedCount = activeRated.filter((t) => (t.customerRating || 0) >= 4).length;
    const attentionCount = activeRated.filter((t) => (t.customerRating || 0) <= 3).length;
    const csatPercent = totalRated > 0 ? (satisfiedCount / totalRated) * 100 : 0;
    const responseRatePercent = totalBaseTx > 0 ? (totalRated / totalBaseTx) * 100 : 0;

    const distribution = [5, 4, 3, 2, 1].map((stars) => {
      const count = activeRated.filter((t) => Math.round(t.customerRating || 0) === stars).length;
      const percent = totalRated > 0 ? (count / totalRated) * 100 : 0;
      return { stars, count, percent };
    });

    // Tag aggregation
    const tagMap = new Map<string, number>();
    activeRated.forEach((t) => {
      (t.customerRatingTags || []).forEach((tag) => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });
    });
    const topTags = Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    // Cashier service breakdown
    const cashierMap = new Map<
      string,
      { name: string; count: number; sum: number; lowCount: number }
    >();
    activeRated.forEach((t) => {
      const key = t.cashierName || t.cashierId || 'Kasir';
      const cur = cashierMap.get(key) || { name: key, count: 0, sum: 0, lowCount: 0 };
      cur.count += 1;
      cur.sum += t.customerRating || 0;
      if ((t.customerRating || 0) <= 3) cur.lowCount += 1;
      cashierMap.set(key, cur);
    });
    const cashierBreakdown = Array.from(cashierMap.values())
      .map((c) => ({
        ...c,
        avg: c.count > 0 ? c.sum / c.count : 0,
      }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);

    // Recent rated reviews
    const filteredReviews = activeRated
      .filter((t) => {
        if (ratingFilter === 'POSITIVE') return (t.customerRating || 0) >= 4;
        if (ratingFilter === 'ATTENTION') return (t.customerRating || 0) <= 3;
        return true;
      })
      .sort((a, b) => (b.customerRatedAt || b.timestamp) - (a.customerRatedAt || a.timestamp));

    const digitalLinkCount = activeRated.filter(
      (t) => t.customerRatingChannel === 'DIGITAL_LINK'
    ).length;

    return {
      totalRated,
      totalBaseTx,
      avgRating,
      avgDelta,
      satisfiedCount,
      attentionCount,
      csatPercent,
      responseRatePercent,
      distribution,
      topTags,
      cashierBreakdown,
      filteredReviews,
      digitalLinkCount,
      allTimeRatedCount: allRated.length,
    };
  }, [transactions, currentStart, currentEnd, previousStart, previousEnd, scope, ratingFilter]);

  const starBarColor = (stars: number) => {
    if (stars === 5) return 'bg-emerald-500';
    if (stars === 4) return 'bg-teal-500';
    if (stars === 3) return 'bg-amber-400';
    if (stars === 2) return 'bg-orange-500';
    return 'bg-rose-500';
  };

  return (
    <AnimatedChartStage
      filterKey={`csat-${scope}-${ratingFilter}-${summary.totalRated}-${summary.avgRating.toFixed(2)}`}
      accent="amber"
      className="bg-white rounded-3xl border border-slate-200 shadow-2xs p-4 md:p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 shrink-0">
            <Star className="w-5 h-5 fill-amber-400 text-amber-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm md:text-base font-bold text-slate-900">
                Laporan Kualitas Layanan &amp; Kepuasan Pelanggan
              </h3>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                Rating Struk Digital (1–5★)
              </span>
              {summary.attentionCount > 0 && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 inline-flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{summary.attentionCount} Perlu Evaluasi</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pantau rating kepuasan pelanggan dari struk kasir dan tautan struk digital untuk menjaga standar layanan toko.
            </p>
          </div>
        </div>

        {/* Scope Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs self-start lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setScope('ALL');
            }}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              scope === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua Riwayat ({summary.allTimeRatedCount})
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setScope('PERIOD');
            }}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              scope === 'PERIOD'
                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {periodLabel}
          </button>
        </div>
      </div>

      {/* 4 KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Skor Rata-rata */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 border border-amber-200 space-y-1.5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-amber-800 flex items-center justify-between">
            <span>Skor Rata-Rata</span>
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-black font-mono text-slate-900 tabular-nums leading-none">
              {summary.totalRated > 0 ? summary.avgRating.toFixed(1) : '0.0'}
            </span>
            <span className="text-xs font-mono font-bold text-slate-500">/ 5.0</span>
            {summary.avgDelta !== null && (
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] font-extrabold ${
                  summary.avgDelta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {summary.avgDelta >= 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                {summary.avgDelta >= 0 ? '+' : ''}
                {summary.avgDelta.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 pt-0.5">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`w-3.5 h-3.5 ${
                  s <= Math.round(summary.avgRating)
                    ? 'text-amber-400 fill-amber-400'
                    : 'text-slate-200 fill-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* CSAT % */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 border border-emerald-200 space-y-1.5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-emerald-800 flex items-center justify-between">
            <span>Indeks Puas (4–5★)</span>
            <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-900 tabular-nums leading-none">
            {summary.totalRated > 0 ? `${summary.csatPercent.toFixed(1)}%` : '0.0%'}
          </div>
          <div className="text-[11px] text-slate-600">
            <strong className="font-mono text-emerald-800">{formatNumber(summary.satisfiedCount)}</strong> dari{' '}
            <strong className="font-mono">{formatNumber(summary.totalRated)}</strong> ulasan positif
          </div>
        </div>

        {/* Total Dinilai & Response Rate */}
        <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-1.5">
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-slate-600 flex items-center justify-between">
            <span>Total Struk Dinilai</span>
            <Receipt className="w-3.5 h-3.5 text-sky-600" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black font-mono text-slate-900 tabular-nums leading-none">
              {formatNumber(summary.totalRated)}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              / {formatNumber(summary.totalBaseTx)} trx
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Partisipasi:{' '}
            <strong className="font-mono text-sky-700">{summary.responseRatePercent.toFixed(1)}%</strong>
            {summary.digitalLinkCount > 0 && ` · ${summary.digitalLinkCount} via Link`}
          </div>
        </div>

        {/* Low Rating Alert */}
        <div
          className={`p-3.5 rounded-2xl border space-y-1.5 ${
            summary.attentionCount > 0
              ? 'bg-gradient-to-br from-rose-50/90 via-white to-amber-50/40 border-rose-200'
              : 'bg-slate-50/80 border-slate-200'
          }`}
        >
          <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-rose-800 flex items-center justify-between">
            <span>Perlu Perhatian (1–3★)</span>
            <AlertTriangle
              className={`w-3.5 h-3.5 ${
                summary.attentionCount > 0 ? 'text-rose-600' : 'text-slate-400'
              }`}
            />
          </div>
          <div
            className={`text-2xl font-black font-mono tabular-nums leading-none ${
              summary.attentionCount > 0 ? 'text-rose-700' : 'text-slate-700'
            }`}
          >
            {formatNumber(summary.attentionCount)}
          </div>
          <div className="text-[11px] text-slate-500">
            {summary.attentionCount > 0
              ? 'Tinjau catatan pelanggan di panel ulasan'
              : 'Belum ada keluhan layanan tercatat'}
          </div>
        </div>
      </div>

      {summary.totalRated === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 text-center space-y-2">
          <Sparkles className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="text-sm font-bold text-slate-800">
            Belum ada penilaian kepuasan pelanggan pada {scope === 'PERIOD' ? 'periode ini' : 'riwayat struk'}.
          </p>
          <p className="text-xs text-slate-500 max-w-lg mx-auto">
            Setelah transaksi selesai atau ketika pelanggan membuka struk digital, minta pelanggan memilih bintang 1–5 di halaman struk digital untuk melihat analisis kualitas layanan di sini.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Star Breakdown, Top Feedback Tags & Cashier Rating */}
          <div className="lg:col-span-5 space-y-4">
            {/* Star Distribution Bars */}
            <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2.5">
              <div className="text-xs font-extrabold text-slate-800">Distribusi Bintang (5★ – 1★)</div>
              <div className="space-y-2">
                {summary.distribution.map((row) => (
                  <div key={row.stars} className="flex items-center gap-2.5 text-xs">
                    <span className="w-9 font-mono font-bold text-slate-700 flex items-center gap-0.5 shrink-0">
                      <span>{row.stars}</span>
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    </span>
                    <div className="flex-1 h-2.5 bg-slate-200/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${starBarColor(row.stars)}`}
                        style={{ width: `${row.percent}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono font-bold text-slate-700 tabular-nums shrink-0 text-[11px]">
                      {row.count} ({row.percent.toFixed(0)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Customer Tags */}
            {summary.topTags.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2.5">
                <div className="text-xs font-extrabold text-slate-800">Poin Masukan Terbanyak</div>
                <div className="flex flex-wrap gap-1.5">
                  {summary.topTags.map((item) => (
                    <span
                      key={item.tag}
                      className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-800 text-[11px] font-semibold flex items-center gap-1.5 shadow-2xs"
                    >
                      <span>{item.tag}</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-mono text-[10px] font-black">
                        {item.count}x
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Cashier Service Breakdown */}
            {summary.cashierBreakdown.length > 0 && (
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-sky-600" />
                    <span>Kualitas Layanan per Kasir</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">
                    {summary.cashierBreakdown.length} Staf
                  </span>
                </div>
                <div className="divide-y divide-slate-200/80 bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {summary.cashierBreakdown.map((c) => (
                    <div
                      key={c.name}
                      className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{c.name}</div>
                        <div className="text-[10px] text-slate-500">
                          {c.count} penilaian{c.lowCount > 0 ? ` · ${c.lowCount} rendah` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 font-mono font-black text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg shrink-0">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-400" />
                        <span>{c.avg.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Recent Feedback Feed */}
          <div className="lg:col-span-7 flex flex-col bg-slate-50/80 rounded-2xl border border-slate-200 overflow-hidden">
            <div className="p-3.5 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                <span>Ulasan Struk Digital Terbaru ({summary.filteredReviews.length})</span>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                {[
                  { id: 'ALL' as const, label: 'Semua' },
                  { id: 'POSITIVE' as const, label: 'Puas (4–5★)' },
                  { id: 'ATTENTION' as const, label: 'Evaluasi (1–3★)' },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setRatingFilter(f.id);
                    }}
                    className={`px-2.5 py-1 rounded-md font-bold transition-colors cursor-pointer ${
                      ratingFilter === f.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-3 space-y-2.5 max-h-[340px] overflow-y-auto">
              {summary.filteredReviews.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Tidak ada ulasan pada filter rating ini.
                </div>
              ) : (
                summary.filteredReviews.slice(0, 20).map((tx) => {
                  const ratingVal = tx.customerRating || 0;
                  const isLow = ratingVal <= 3;
                  return (
                    <div
                      key={tx.id}
                      className={`p-3 rounded-xl border bg-white space-y-1.5 ${
                        isLow ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((s) => (
                              <Star
                                key={s}
                                className={`w-3.5 h-3.5 ${
                                  s <= ratingVal
                                    ? 'text-amber-400 fill-amber-400'
                                    : 'text-slate-200'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {tx.invoiceNumber}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-100 text-slate-600">
                            {tx.customerRatingChannel === 'DIGITAL_LINK'
                              ? 'Link Digital'
                              : 'Struk Kasir'}
                          </span>
                        </div>

                        <span className="text-[10.5px] font-mono font-bold text-slate-700 tabular-nums">
                          {formatRupiah(tx.finalAmount)}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                        <span>
                          Pelanggan: <strong className="text-slate-800">{tx.customerName || 'Pelanggan Umum'}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Kasir: <strong className="text-slate-800">{tx.cashierName}</strong>
                        </span>
                        <span>•</span>
                        <span>{formatDateTime(tx.customerRatedAt || tx.timestamp)}</span>
                      </div>

                      {tx.customerRatingTags && tx.customerRatingTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {tx.customerRatingTags.map((tag) => (
                            <span
                              key={tag}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                                isLow
                                  ? 'bg-rose-50 text-rose-800 border-rose-200'
                                  : 'bg-sky-50 text-sky-800 border-sky-200'
                              }`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {tx.customerRatingComment && (
                        <p className="text-xs text-slate-700 italic bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/80">
                          "{tx.customerRatingComment}"
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </AnimatedChartStage>
  );
};
