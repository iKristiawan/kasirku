import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts';
import {
  Target,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  Settings,
  Layers,
  RotateCcw,
  EyeOff,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  Transaction,
  Product,
  ProductCategory,
  CategorySalesGoal,
  UserRole,
} from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { getCategoryColor } from '../utils/categoryColors';
import { sound } from '../utils/audio';
import { AnimatedChartStage } from './AnimatedChartStage';
import { ChartFullscreenShell, FullscreenToggleButton } from './ChartFullscreenShell';
import { useChartTheme } from './ChartThemeContext';

type TargetHorizon = 'daily' | 'weekly' | 'monthly';
type StatusFilter = 'ALL' | 'CONFIGURED' | 'MET' | 'BEHIND';
type TargetStatus = 'MET' | 'ON_TRACK' | 'BEHIND' | 'UNSET';

interface CategorySalesTargetEvaluationPanelProps {
  transactions: Transaction[];
  products: Product[];
  categories: ProductCategory[];
  productMap: Map<string, Product>;
  categorySalesGoals?: Record<string, CategorySalesGoal>;
  hiddenCategorySet: Set<string>;
  totalCategoriesCount: number;
  activeCategoryCount: number;
  isCategoryFiltered: boolean;
  specificSelectedCategoryName?: string | null;
  onResetCategoryFilter: () => void;
  onOpenSettings?: () => void;
  currentUserRole?: UserRole;
}

interface CategoryEvaluationRow {
  name: string;
  color: string;
  actualRevenue: number;
  targetRevenue: number;
  achievementPct: number | null;
  varianceRp: number;
  projectedRevenue: number;
  txCount: number;
  unitsSold: number;
  skuCount: number;
  status: TargetStatus;
}

const HORIZON_LABELS: Record<TargetHorizon, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
};

const STATUS_META: Record<
  TargetStatus,
  { label: string; textClass: string; bgClass: string }
> = {
  MET: {
    label: 'Tercapai',
    textClass: 'text-emerald-700',
    bgClass: 'bg-emerald-50 border-emerald-200',
  },
  ON_TRACK: {
    label: 'Sesuai Jalur',
    textClass: 'text-sky-700',
    bgClass: 'bg-sky-50 border-sky-200',
  },
  BEHIND: {
    label: 'Tertinggal',
    textClass: 'text-amber-700',
    bgClass: 'bg-amber-50 border-amber-200',
  },
  UNSET: {
    label: 'Tanpa Target',
    textClass: 'text-slate-500',
    bgClass: 'bg-slate-100 border-slate-200',
  },
};

export const CategorySalesTargetEvaluationPanel: React.FC<
  CategorySalesTargetEvaluationPanelProps
> = ({
  transactions,
  products,
  categories,
  productMap,
  categorySalesGoals = {},
  hiddenCategorySet,
  totalCategoriesCount,
  activeCategoryCount,
  isCategoryFiltered,
  specificSelectedCategoryName,
  onResetCategoryFilter,
  onOpenSettings,
  currentUserRole = 'ADMIN',
}) => {
  const { palette, isDefaultTheme } = useChartTheme();
  const [horizon, setHorizon] = useState<TargetHorizon>('daily');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const evaluation = useMemo(() => {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const todayStartMs = startOfToday.getTime();

    const startOfWeek = new Date(now);
    const dayOfWeek = startOfWeek.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStartMs = startOfWeek.getTime();

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthStartMs = startOfMonth.getTime();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    const elapsedDaysInHorizon =
      horizon === 'daily'
        ? Math.max(0.15, (now.getHours() + now.getMinutes() / 60) / 24)
        : horizon === 'weekly'
        ? dayOfWeek === 0
          ? 7
          : dayOfWeek
        : dayOfMonth;
    const totalDaysInHorizon =
      horizon === 'daily' ? 1 : horizon === 'weekly' ? 7 : daysInMonth;

    const expectedPaceRatio =
      horizon === 'daily'
        ? Math.min(1, Math.max(0.25, elapsedDaysInHorizon))
        : Math.min(1, elapsedDaysInHorizon / totalDaysInHorizon);

    const activeStartMs =
      horizon === 'daily'
        ? todayStartMs
        : horizon === 'weekly'
        ? weekStartMs
        : monthStartMs;

    const horizonSubtitle =
      horizon === 'daily'
        ? now.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : horizon === 'weekly'
        ? `${startOfWeek.toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
          })} – Hari Ini (Hari ${elapsedDaysInHorizon}/7)`
        : `${now.toLocaleDateString('id-ID', {
            month: 'long',
            year: 'numeric',
          })} (Hari ${dayOfMonth}/${daysInMonth})`;

    interface CatAcc {
      name: string;
      actualRevenue: number;
      unitsSold: number;
      txIds: Set<string>;
      skuCount: number;
    }

    const catMap = new Map<string, CatAcc>();
    const ensureCat = (name: string): CatAcc => {
      const clean = name.trim() || 'Umum';
      let entry = catMap.get(clean);
      if (!entry) {
        entry = {
          name: clean,
          actualRevenue: 0,
          unitsSold: 0,
          txIds: new Set<string>(),
          skuCount: 0,
        };
        catMap.set(clean, entry);
      }
      return entry;
    };

    categories.forEach((c) => ensureCat(c.name));
    products.forEach((p) => {
      const acc = ensureCat(p.category || 'Umum');
      acc.skuCount += 1;
    });
    Object.keys(categorySalesGoals || {}).forEach((catName) => ensureCat(catName));

    transactions.forEach((tx) => {
      if (tx.timestamp < activeStartMs) return;
      tx.items.forEach((item) => {
        const prod = productMap.get(item.productId);
        const catName = (prod?.category || 'Umum').trim() || 'Umum';
        const acc = ensureCat(catName);
        acc.actualRevenue += item.totalAmount || 0;
        acc.unitsSold += item.quantity * (item.conversionFactor || 1);
        acc.txIds.add(tx.id);
      });
    });

    const allRows: CategoryEvaluationRow[] = Array.from(catMap.values())
      .filter((acc) => !hiddenCategorySet.has(acc.name))
      .map((acc) => {
        const goalObj = categorySalesGoals?.[acc.name];
        const targetRevenue = goalObj ? Number(goalObj[horizon] || 0) : 0;
        const hasTarget = targetRevenue > 0;
        const achievementPct = hasTarget
          ? (acc.actualRevenue / targetRevenue) * 100
          : null;
        const varianceRp = hasTarget ? acc.actualRevenue - targetRevenue : 0;
        const projectedRevenue =
          horizon === 'daily'
            ? acc.actualRevenue
            : (acc.actualRevenue / Math.max(1, elapsedDaysInHorizon)) *
              totalDaysInHorizon;

        let status: TargetStatus = 'UNSET';
        if (hasTarget && achievementPct !== null) {
          if (achievementPct >= 100) {
            status = 'MET';
          } else if (achievementPct >= expectedPaceRatio * 100 * 0.85) {
            status = 'ON_TRACK';
          } else {
            status = 'BEHIND';
          }
        }

        return {
          name: acc.name,
          color: getCategoryColor(acc.name, categories),
          actualRevenue: acc.actualRevenue,
          targetRevenue,
          achievementPct,
          varianceRp,
          projectedRevenue,
          txCount: acc.txIds.size,
          unitsSold: acc.unitsSold,
          skuCount: acc.skuCount,
          status,
        };
      });

    allRows.sort((a, b) => {
      const aHas = a.targetRevenue > 0 ? 1 : 0;
      const bHas = b.targetRevenue > 0 ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
      if (b.targetRevenue !== a.targetRevenue) return b.targetRevenue - a.targetRevenue;
      return b.actualRevenue - a.actualRevenue;
    });

    const configuredRows = allRows.filter((r) => r.targetRevenue > 0);
    const totalActualActive = allRows.reduce((s, r) => s + r.actualRevenue, 0);
    const totalActualConfigured = configuredRows.reduce((s, r) => s + r.actualRevenue, 0);
    const totalTargetConfigured = configuredRows.reduce((s, r) => s + r.targetRevenue, 0);
    const metCount = configuredRows.filter((r) => r.status === 'MET').length;
    const behindCount = configuredRows.filter((r) => r.status === 'BEHIND').length;
    const weightedAchievementPct =
      totalTargetConfigured > 0
        ? (totalActualConfigured / totalTargetConfigured) * 100
        : null;

    return {
      allRows,
      configuredCount: configuredRows.length,
      totalActualActive,
      totalTargetConfigured,
      metCount,
      behindCount,
      weightedAchievementPct,
      horizonSubtitle,
      expectedPacePct: Math.round(expectedPaceRatio * 100),
    };
  }, [
    transactions,
    products,
    categories,
    productMap,
    categorySalesGoals,
    hiddenCategorySet,
    horizon,
  ]);

  const filteredRows = useMemo(() => {
    switch (statusFilter) {
      case 'CONFIGURED':
        return evaluation.allRows.filter((r) => r.targetRevenue > 0);
      case 'MET':
        return evaluation.allRows.filter((r) => r.status === 'MET');
      case 'BEHIND':
        return evaluation.allRows.filter(
          (r) => r.status === 'BEHIND' || r.status === 'ON_TRACK'
        );
      default:
        return evaluation.allRows;
    }
  }, [evaluation.allRows, statusFilter]);

  const chartData = useMemo(() => {
    return filteredRows.slice(0, 12).map((row) => ({
      ...row,
      shortName: row.name.length > 14 ? `${row.name.slice(0, 13)}…` : row.name,
    }));
  }, [filteredRows]);

  const scopeLabel = specificSelectedCategoryName
    ? `Fokus Kategori: ${specificSelectedCategoryName}`
    : isCategoryFiltered
    ? `Terfilter ${activeCategoryCount}/${totalCategoriesCount} Kategori`
    : 'Semua Kategori Produk';

  return (
    <ChartFullscreenShell
      isFullscreen={isFullscreen}
      onClose={() => setIsFullscreen(false)}
      title={`Evaluasi Target Penjualan per Kategori (${HORIZON_LABELS[horizon]})`}
    >
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
        {/* Header & Primary Controls */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm md:text-base font-bold text-slate-900">
                  Evaluasi Target Penjualan per Kategori Produk
                </h3>
                {evaluation.configuredCount > 0 && (
                  <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md whitespace-nowrap">
                    {evaluation.configuredCount} Target Aktif
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                <span>{evaluation.horizonSubtitle}</span>
                <span>·</span>
                <span className="font-medium text-slate-700">{scopeLabel}</span>
                {horizon !== 'daily' && evaluation.configuredCount > 0 && (
                  <>
                    <span>·</span>
                    <span>Laju ideal saat ini {evaluation.expectedPacePct}%</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Horizon Toggle */}
            <div
              role="group"
              aria-label="Horizon Target Kategori"
              className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200"
            >
              {(['daily', 'weekly', 'monthly'] as TargetHorizon[]).map((h) => {
                const active = horizon === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setHorizon(h);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      active
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {HORIZON_LABELS[h]}
                  </button>
                );
              })}
            </div>

            {currentUserRole === 'ADMIN' && onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onOpenSettings();
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 border border-slate-200 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>Atur Target Kategori</span>
              </button>
            )}

            <FullscreenToggleButton
              isFullscreen={isFullscreen}
              onToggle={() => setIsFullscreen((prev) => !prev)}
            />
          </div>
        </div>

        {/* Hairline 4-Cell Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 bg-slate-50/80 border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">
              Omzet Kategori ({HORIZON_LABELS[horizon]})
            </div>
            <div className="text-base md:text-lg font-black font-mono text-slate-900 tabular-nums mt-0.5">
              {formatRupiah(evaluation.totalActualActive)}
            </div>
            <div className="text-[10.5px] text-slate-500 mt-0.5 font-mono tabular-nums">
              {evaluation.allRows.length} kategori ditampilkan
            </div>
          </div>

          <div className="p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">
              Akumulasi Target Kategori
            </div>
            <div className="text-base md:text-lg font-black font-mono text-indigo-700 tabular-nums mt-0.5">
              {evaluation.totalTargetConfigured > 0
                ? formatRupiah(evaluation.totalTargetConfigured)
                : 'Belum Diatur'}
            </div>
            <div className="text-[10.5px] text-slate-500 mt-0.5 font-mono tabular-nums">
              {evaluation.configuredCount} kategori bertarget {HORIZON_LABELS[horizon].toLowerCase()}
            </div>
          </div>

          <div className="p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">
              Kategori Capai Target
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-base md:text-lg font-black font-mono text-emerald-700 tabular-nums">
                {evaluation.configuredCount > 0
                  ? `${evaluation.metCount} / ${evaluation.configuredCount}`
                  : '0 / 0'}
              </span>
              {evaluation.behindCount > 0 && (
                <span className="text-[10.5px] font-semibold text-amber-700">
                  · {evaluation.behindCount} tertinggal
                </span>
              )}
            </div>
            <div className="text-[10.5px] text-slate-500 mt-0.5">
              Evaluasi target periode {HORIZON_LABELS[horizon].toLowerCase()}
            </div>
          </div>

          <div className="p-3.5">
            <div className="text-[11px] font-semibold text-slate-500">
              Rasio Pencapaian Terbobot
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-base md:text-lg font-black font-mono tabular-nums ${
                  evaluation.weightedAchievementPct === null
                    ? 'text-slate-400'
                    : evaluation.weightedAchievementPct >= 100
                    ? 'text-emerald-700'
                    : evaluation.weightedAchievementPct >= 70
                    ? 'text-sky-700'
                    : 'text-amber-700'
                }`}
              >
                {evaluation.weightedAchievementPct !== null
                  ? `${evaluation.weightedAchievementPct.toFixed(1)}%`
                  : '—'}
              </span>
            </div>
            <div className="text-[10.5px] text-slate-500 mt-0.5">
              {evaluation.weightedAchievementPct !== null
                ? 'Omzet vs akumulasi target kategori'
                : 'Tetapkan target per kategori di Pengaturan'}
            </div>
          </div>
        </div>

        {/* Status Filter Bar & Legend */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(
              [
                { id: 'ALL', label: `Semua (${evaluation.allRows.length})` },
                { id: 'CONFIGURED', label: `Bertarget (${evaluation.configuredCount})` },
                { id: 'MET', label: `Tercapai (${evaluation.metCount})` },
                { id: 'BEHIND', label: 'Belum Capai' },
              ] as { id: StatusFilter; label: string }[]
            ).map((opt) => {
              const active = statusFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setStatusFilter(opt.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs inline-block"
                style={{ backgroundColor: palette.primary }}
              />
              <span>Omzet Aktual</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs inline-block"
                style={{ backgroundColor: palette.positive }}
              />
              <span>Capai Target</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-xs border border-slate-300 inline-block"
                style={{ backgroundColor: palette.grid }}
              />
              <span>Target Kategori</span>
            </span>
          </div>
        </div>

        {/* Main Content: Empty / Unconfigured Notice OR BarChart + Breakdown Table */}
        {activeCategoryCount === 0 && totalCategoriesCount > 0 ? (
          <div className="h-56 flex flex-col items-center justify-center text-slate-400 space-y-2.5 bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
            <EyeOff className="w-7 h-7 text-slate-300" />
            <p className="text-xs font-bold text-slate-600 text-center">
              Semua kategori sedang disembunyikan oleh filter dashboard
            </p>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onResetCategoryFilter();
              }}
              className="px-3.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Tampilkan Semua Kategori</span>
            </button>
          </div>
        ) : (
          <>
            {evaluation.configuredCount === 0 && (
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                <div className="flex items-start sm:items-center gap-2 text-amber-900">
                  <Target className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                  <span>
                    Belum ada target khusus untuk periode{' '}
                    <strong>{HORIZON_LABELS[horizon]}</strong>. Atur target masing-masing kategori
                    di menu Pengaturan agar persentase pencapaian &amp; selisih terhitung otomatis.
                  </span>
                </div>
                {currentUserRole === 'ADMIN' && onOpenSettings && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      onOpenSettings();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs whitespace-nowrap shrink-0 self-start sm:self-auto cursor-pointer transition-colors"
                  >
                    Tetapkan Target Sekarang
                  </button>
                )}
              </div>
            )}

            {/* Chart Stage */}
            <AnimatedChartStage
              filterKey={`cat-target-${horizon}-${statusFilter}-${filteredRows.length}-${evaluation.totalTargetConfigured}-${hiddenCategorySet.size}`}
              accent="indigo"
              delayMs={40}
              className={
                isFullscreen ? 'w-full h-[46vh] min-h-[320px]' : 'w-full h-64 md:h-72'
              }
            >
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs p-6 text-center space-y-2">
                  <AlertTriangle className="w-6 h-6 text-slate-300" />
                  <p className="font-semibold">
                    Tidak ada kategori yang cocok dengan filter status saat ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setStatusFilter('ALL');
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Tampilkan Semua Status
                  </button>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 14, right: 16, left: 6, bottom: 10 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={palette.grid}
                    />
                    <XAxis
                      dataKey="shortName"
                      tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }}
                      axisLine={{ stroke: '#cbd5e1' }}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tickFormatter={(val) => {
                        if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                        if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
                        return String(val);
                      }}
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      axisLine={false}
                      tickLine={false}
                      width={52}
                    />
                    <RechartsTooltip
                      cursor={{ fill: '#f1f5f9', opacity: 0.6 }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const row = payload[0]?.payload as CategoryEvaluationRow;
                        if (!row) return null;
                        const meta = STATUS_META[row.status];
                        return (
                          <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs min-w-[240px] space-y-2">
                            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                              <span className="font-bold text-slate-100 flex items-center gap-1.5">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: row.color }}
                                />
                                <span>{row.name}</span>
                              </span>
                              <span className="text-[10px] font-bold text-slate-300">
                                {meta.label}
                              </span>
                            </div>
                            <div className="space-y-1 font-mono text-[11px]">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">Omzet Aktual:</span>
                                <span className="font-bold text-sky-300 tabular-nums">
                                  {formatRupiah(row.actualRevenue)}
                                </span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-400">
                                  Target {HORIZON_LABELS[horizon]}:
                                </span>
                                <span className="font-semibold text-slate-200 tabular-nums">
                                  {row.targetRevenue > 0
                                    ? formatRupiah(row.targetRevenue)
                                    : 'Belum diatur'}
                                </span>
                              </div>
                              {row.targetRevenue > 0 && row.achievementPct !== null && (
                                <>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-slate-400">Pencapaian:</span>
                                    <span
                                      className={`font-bold tabular-nums ${
                                        row.achievementPct >= 100
                                          ? 'text-emerald-400'
                                          : 'text-amber-300'
                                      }`}
                                    >
                                      {row.achievementPct.toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-slate-400">Selisih:</span>
                                    <span
                                      className={`font-bold tabular-nums ${
                                        row.varianceRp >= 0
                                          ? 'text-emerald-400'
                                          : 'text-amber-400'
                                      }`}
                                    >
                                      {row.varianceRp >= 0
                                        ? `+${formatRupiah(row.varianceRp)}`
                                        : formatRupiah(row.varianceRp)}
                                    </span>
                                  </div>
                                </>
                              )}
                              <div className="flex justify-between gap-4 pt-1 border-t border-slate-800 text-slate-300">
                                <span className="text-slate-400">Volume:</span>
                                <span className="tabular-nums">
                                  {formatNumber(row.unitsSold)} unit · {formatNumber(row.txCount)} trx
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar
                      dataKey="targetRevenue"
                      name={`Target ${HORIZON_LABELS[horizon]}`}
                      fill={palette.grid}
                      radius={[6, 6, 0, 0]}
                      maxBarSize={24}
                      isAnimationActive={true}
                      animationDuration={500}
                    />
                    <Bar
                      dataKey="actualRevenue"
                      name="Omzet Aktual"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={30}
                      isAnimationActive={true}
                      animationDuration={580}
                    >
                      {chartData.map((entry, idx) => (
                        <Cell
                          key={`cat-eval-cell-${entry.name}`}
                          fill={
                            entry.status === 'MET'
                              ? palette.positive
                              : isDefaultTheme
                              ? entry.color
                              : palette.series[idx % palette.series.length]
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </AnimatedChartStage>

            {/* Detailed Category Evaluation Table */}
            {filteredRows.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10.5px]">
                      <th className="py-2.5 px-3.5">Kategori Produk</th>
                      <th className="py-2.5 px-3 text-right">Omzet Aktual</th>
                      <th className="py-2.5 px-3 text-right">
                        Target {HORIZON_LABELS[horizon]}
                      </th>
                      <th className="py-2.5 px-3 min-w-[165px]">Pencapaian</th>
                      <th className="py-2.5 px-3 text-right">Selisih</th>
                      <th className="py-2.5 px-3.5 text-right">
                        {horizon === 'daily' ? 'Status' : 'Proyeksi Akhir Periode'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredRows.map((row) => {
                      const hasTarget = row.targetRevenue > 0;
                      const pct = row.achievementPct ?? 0;
                      const clampedPct = Math.min(100, Math.max(0, pct));
                      const meta = STATUS_META[row.status];

                      return (
                        <tr
                          key={row.name}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-2.5 px-3.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: row.color }}
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">
                                  {row.name}
                                </div>
                                <div className="text-[10.5px] text-slate-500 font-mono tabular-nums">
                                  {formatNumber(row.skuCount)} SKU ·{' '}
                                  {formatNumber(row.unitsSold)} unit ·{' '}
                                  {formatNumber(row.txCount)} trx
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                            {formatRupiah(row.actualRevenue)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-600 tabular-nums whitespace-nowrap">
                            {hasTarget ? formatRupiah(row.targetRevenue) : '—'}
                          </td>

                          <td className="py-2.5 px-3">
                            {hasTarget ? (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-2 text-[10.5px] font-mono tabular-nums">
                                  <span className={`font-bold ${meta.textClass}`}>
                                    {pct.toFixed(1)}%
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.2 rounded border text-[9.5px] font-sans font-bold ${meta.bgClass} ${meta.textClass}`}
                                  >
                                    {meta.label}
                                  </span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                      row.status === 'MET'
                                        ? 'bg-emerald-500'
                                        : row.status === 'ON_TRACK'
                                        ? 'bg-sky-500'
                                        : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${clampedPct}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10.5px] text-slate-400 italic">
                                Belum ada target
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            {hasTarget ? (
                              <span
                                className={`inline-flex items-center gap-0.5 font-bold ${
                                  row.varianceRp >= 0
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {row.varianceRp >= 0 ? (
                                  <ArrowUpRight className="w-3 h-3 shrink-0" />
                                ) : (
                                  <ArrowDownRight className="w-3 h-3 shrink-0" />
                                )}
                                <span>
                                  {row.varianceRp >= 0
                                    ? `+${formatRupiah(row.varianceRp)}`
                                    : formatRupiah(row.varianceRp)}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                            {horizon === 'daily' ? (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta.bgClass} ${meta.textClass}`}
                              >
                                {row.status === 'MET' && (
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                )}
                                {row.status === 'ON_TRACK' && (
                                  <TrendingUp className="w-3 h-3 shrink-0" />
                                )}
                                {row.status === 'BEHIND' && (
                                  <AlertTriangle className="w-3 h-3 shrink-0" />
                                )}
                                <span>{meta.label}</span>
                              </span>
                            ) : (
                              <div className="font-mono tabular-nums">
                                <div className="font-semibold text-slate-800">
                                  {formatRupiah(Math.round(row.projectedRevenue))}
                                </div>
                                {hasTarget && (
                                  <div
                                    className={`text-[10px] font-bold ${
                                      row.projectedRevenue >= row.targetRevenue
                                        ? 'text-emerald-600'
                                        : 'text-amber-600'
                                    }`}
                                  >
                                    {row.projectedRevenue >= row.targetRevenue
                                      ? 'Proyeksi lolos target'
                                      : 'Di bawah laju target'}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </ChartFullscreenShell>
  );
};
