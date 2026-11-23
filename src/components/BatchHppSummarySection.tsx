import React, { useMemo, useState, useDeferredValue } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import {
  Search,
  Layers,
  TrendingUp,
  ArrowUpDown,
  DollarSign,
  Package,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Product } from '../types/pos';
import { formatRupiah, formatNumber, formatDateOnly } from '../utils/formatters';
import { buildBatchHppSummary, BatchHppRow } from '../utils/batchIntegrity';
import { sound } from '../utils/audio';

interface BatchHppSummarySectionProps {
  products: Product[];
  onSelectProductForStock?: (product: Product) => void;
}

type HppSortMetric = 'UNIT_HPP_DESC' | 'TOTAL_COST_DESC' | 'MARGIN_ASC';
type HppViewMode = 'PER_BATCH' | 'PER_PRODUCT';

const BAR_COLORS = [
  '#0f172a',
  '#0284c7',
  '#0369a1',
  '#0d9488',
  '#059669',
  '#4f46e5',
  '#6366f1',
  '#d97706',
  '#ea580c',
  '#64748b',
];

export const BatchHppSummarySection: React.FC<BatchHppSummarySectionProps> = ({
  products,
  onSelectProductForStock,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortMetric, setSortMetric] = useState<HppSortMetric>('UNIT_HPP_DESC');
  const [viewMode, setViewMode] = useState<HppViewMode>('PER_BATCH');
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [expandedProductIds, setExpandedProductIds] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 20;

  const hppSummary = useMemo(() => buildBatchHppSummary(products), [products]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    hppSummary.batchRows.forEach((r) => {
      if (r.category) set.add(r.category);
    });
    return Array.from(set).sort();
  }, [hppSummary.batchRows]);

  const filteredBatchRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const list = hppSummary.batchRows.filter((row) => {
      if (selectedCategory !== 'ALL' && row.category !== selectedCategory) return false;
      if (highlightedProductId && row.productId !== highlightedProductId) return false;
      if (!q) return true;
      return (
        row.productName.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.batchNumber.toLowerCase().includes(q) ||
        row.supplierName.toLowerCase().includes(q) ||
        row.category.toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortMetric === 'TOTAL_COST_DESC') {
        return b.totalRemainingCostValue - a.totalRemainingCostValue || b.unitHpp - a.unitHpp;
      }
      if (sortMetric === 'MARGIN_ASC') {
        return a.unitMarginPct - b.unitMarginPct || b.unitHpp - a.unitHpp;
      }
      return b.unitHpp - a.unitHpp || b.totalRemainingCostValue - a.totalRemainingCostValue;
    });
  }, [hppSummary.batchRows, deferredSearch, selectedCategory, sortMetric, highlightedProductId]);

  const filteredProductSummaries = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const list = hppSummary.productSummaries.filter((ps) => {
      if (selectedCategory !== 'ALL' && ps.category !== selectedCategory) return false;
      if (highlightedProductId && ps.productId !== highlightedProductId) return false;
      if (!q) return true;
      return (
        ps.productName.toLowerCase().includes(q) ||
        ps.sku.toLowerCase().includes(q) ||
        ps.category.toLowerCase().includes(q) ||
        ps.batches.some((b) => b.batchNumber.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      if (sortMetric === 'TOTAL_COST_DESC') {
        return b.totalCapitalValue - a.totalCapitalValue || b.maxUnitHpp - a.maxUnitHpp;
      }
      if (sortMetric === 'MARGIN_ASC') {
        const aMargin = a.sellingPrice > 0 ? (a.sellingPrice - a.maxUnitHpp) / a.sellingPrice : 0;
        const bMargin = b.sellingPrice > 0 ? (b.sellingPrice - b.maxUnitHpp) / b.sellingPrice : 0;
        return aMargin - bMargin || b.maxUnitHpp - a.maxUnitHpp;
      }
      return b.maxUnitHpp - a.maxUnitHpp || b.totalCapitalValue - a.totalCapitalValue;
    });
  }, [hppSummary.productSummaries, deferredSearch, selectedCategory, sortMetric, highlightedProductId]);

  // Top 10 batches for Recharts bar chart (independent of highlightedProductId filter so chart stays navigable)
  const chartData = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const base = hppSummary.batchRows.filter((row) => {
      if (selectedCategory !== 'ALL' && row.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        row.productName.toLowerCase().includes(q) ||
        row.sku.toLowerCase().includes(q) ||
        row.batchNumber.toLowerCase().includes(q) ||
        row.supplierName.toLowerCase().includes(q)
      );
    });

    const sorted = [...base].sort((a, b) => {
      if (sortMetric === 'TOTAL_COST_DESC') {
        return b.totalRemainingCostValue - a.totalRemainingCostValue || b.unitHpp - a.unitHpp;
      }
      if (sortMetric === 'MARGIN_ASC') {
        return a.unitMarginPct - b.unitMarginPct || b.unitHpp - a.unitHpp;
      }
      return b.unitHpp - a.unitHpp || b.totalRemainingCostValue - a.totalRemainingCostValue;
    });

    return sorted.slice(0, 10).map((row) => {
      const shortProd = row.productName.length > 18 ? `${row.productName.slice(0, 17)}…` : row.productName;
      const shortBatch = row.batchNumber.length > 12 ? `${row.batchNumber.slice(0, 11)}…` : row.batchNumber;
      return {
        ...row,
        label: `${shortProd} (${shortBatch})`,
        chartValue: sortMetric === 'TOTAL_COST_DESC' ? row.totalRemainingCostValue : row.unitHpp,
      };
    });
  }, [hppSummary.batchRows, deferredSearch, selectedCategory, sortMetric]);

  const activeListLength =
    viewMode === 'PER_BATCH' ? filteredBatchRows.length : filteredProductSummaries.length;
  const totalPages = Math.max(1, Math.ceil(activeListLength / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginatedBatches = filteredBatchRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const paginatedProducts = filteredProductSummaries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleProductExpand = (productId: string) => {
    sound.playTap();
    setExpandedProductIds((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Section Header */}
      <div className="p-4 md:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm md:text-base font-black text-slate-900">
                Ringkasan Biaya Perolehan (HPP) per Batch Produk
              </h3>
              <p className="text-xs text-slate-500">
                Visualisasi HPP satuan dan total nilai modal per batch untuk mengidentifikasi produk dengan biaya batch tertinggi dan selisih harga beli antar batch.
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 self-start lg:self-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setViewMode('PER_BATCH');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
              viewMode === 'PER_BATCH'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Semua Batch ({formatNumber(filteredBatchRows.length)})
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setViewMode('PER_PRODUCT');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
              viewMode === 'PER_PRODUCT'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Komparasi Per Produk ({formatNumber(filteredProductSummaries.length)})
          </button>
        </div>
      </div>

      <div className="p-4 md:p-5 space-y-5">
        {/* 4 Clean KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Batch HPP Satuan Tertinggi
            </div>
            {hppSummary.highestUnitHppBatch ? (
              <>
                <div className="text-lg md:text-xl font-black font-mono text-slate-900 tabular-nums mt-1">
                  {formatRupiah(hppSummary.highestUnitHppBatch.unitHpp)}
                  <span className="text-xs font-semibold text-slate-500 ml-1">
                    /{hppSummary.highestUnitHppBatch.baseUnit}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1 truncate">
                  {hppSummary.highestUnitHppBatch.productName} ·{' '}
                  <span className="font-mono font-semibold">
                    {hppSummary.highestUnitHppBatch.batchNumber}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-400 mt-1">Belum ada batch aktif</div>
            )}
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Nilai Modal Batch Tertinggi
            </div>
            {hppSummary.highestCapitalBatch ? (
              <>
                <div className="text-lg md:text-xl font-black font-mono text-sky-700 tabular-nums mt-1">
                  {formatRupiah(hppSummary.highestCapitalBatch.totalRemainingCostValue)}
                </div>
                <div className="text-[11px] text-slate-600 mt-1 truncate">
                  {hppSummary.highestCapitalBatch.productName} ·{' '}
                  <span className="font-mono">
                    {formatNumber(hppSummary.highestCapitalBatch.remainingQuantity)}{' '}
                    {hppSummary.highestCapitalBatch.baseUnit}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-400 mt-1">Belum ada batch aktif</div>
            )}
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Modal Batch Aktif
            </div>
            <div className="text-lg md:text-xl font-black font-mono text-emerald-700 tabular-nums mt-1">
              {formatRupiah(hppSummary.totalCapitalValue)}
            </div>
            <div className="text-[11px] text-slate-600 mt-1 font-mono tabular-nums">
              {formatNumber(hppSummary.totalActiveBatches)} Batch ·{' '}
              {formatNumber(hppSummary.totalActiveUnits)} Unit
            </div>
          </div>

          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/70">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {hppSummary.widestSpreadProduct
                ? 'Kenaikan HPP Antar Batch Terbesar'
                : 'Rata-rata HPP Tertimbang'}
            </div>
            {hppSummary.widestSpreadProduct ? (
              <>
                <div className="text-lg md:text-xl font-black font-mono text-amber-700 tabular-nums mt-1">
                  +{formatRupiah(hppSummary.widestSpreadProduct.hppSpreadRp)}
                  <span className="text-xs font-semibold text-amber-600 ml-1">
                    (+{hppSummary.widestSpreadProduct.hppSpreadPct}%)
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1 truncate">
                  {hppSummary.widestSpreadProduct.productName} ({hppSummary.widestSpreadProduct.activeBatchCount} batch)
                </div>
              </>
            ) : (
              <>
                <div className="text-lg md:text-xl font-black font-mono text-slate-900 tabular-nums mt-1">
                  {formatRupiah(hppSummary.globalWeightedAvgHpp)}
                </div>
                <div className="text-[11px] text-slate-600 mt-1">
                  Rata-rata per unit dasar di gudang
                </div>
              </>
            )}
          </div>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Cari produk, SKU, nomor batch, atau nama supplier..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedCategory}
              onChange={(e) => {
                sound.playTap();
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              aria-label="Filter kategori HPP batch"
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 cursor-pointer"
            >
              <option value="ALL">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
              {[
                { id: 'UNIT_HPP_DESC' as const, label: 'HPP/Unit Tertinggi' },
                { id: 'TOTAL_COST_DESC' as const, label: 'Total Modal Batch' },
                { id: 'MARGIN_ASC' as const, label: 'Margin Terendah' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setSortMetric(opt.id);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    sortMetric === opt.id
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {highlightedProductId && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setHighlightedProductId(null);
                  setPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Reset Pilihan Grafik</span>
              </button>
            )}
          </div>
        </div>

        {/* Interactive Bar Chart: Top 10 Highest HPP Batches */}
        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/40 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-xs md:text-sm font-black text-slate-900 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-sky-600" />
                <span>
                  Top 10 Batch Berdasarkan{' '}
                  {sortMetric === 'TOTAL_COST_DESC'
                    ? 'Total Nilai Modal Batch (Sisa × HPP)'
                    : sortMetric === 'MARGIN_ASC'
                    ? 'HPP dengan Margin Paling Tipis'
                    : 'HPP Perolehan Tertinggi per Satuan'}
                </span>
              </h4>
              <p className="text-[11px] text-slate-500">
                Klik salah satu batang grafik untuk memfokuskan seluruh batch milik produk tersebut pada tabel rincian di bawah.
              </p>
            </div>
            <span className="text-[11px] font-mono text-slate-500 shrink-0">
              Menampilkan {chartData.length} dari {formatNumber(hppSummary.totalActiveBatches)} batch aktif
            </span>
          </div>

          {chartData.length === 0 ? (
            <div className="h-[220px] flex flex-col items-center justify-center text-slate-400 text-xs">
              <Layers className="w-8 h-8 mb-1.5 text-slate-300" />
              <span>Tidak ada batch aktif yang cocok dengan filter saat ini.</span>
            </div>
          ) : (
            <div className="w-full h-[300px]">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 6, right: 24, left: 10, bottom: 6 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `${(v / 1_000_000).toFixed(1)}jt`
                        : v >= 1_000
                        ? `${Math.round(v / 1_000)}rb`
                        : String(v)
                    }
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={175}
                    tick={{ fontSize: 11, fill: '#0f172a', fontWeight: 600 }}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(2, 132, 199, 0.08)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const d = payload[0].payload as BatchHppRow & { chartValue: number };
                      return (
                        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs space-y-1 max-w-xs">
                          <div className="font-bold text-white">{d.productName}</div>
                          <div className="text-[11px] text-sky-300 font-mono">
                            Batch: {d.batchNumber} · {d.category}
                          </div>
                          <div className="border-t border-slate-700 pt-1.5 space-y-0.5 font-mono text-[11px] tabular-nums">
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">HPP / {d.baseUnit}:</span>
                              <span className="font-bold text-amber-300">{formatRupiah(d.unitHpp)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Sisa Stok Batch:</span>
                              <span className="font-bold">
                                {formatNumber(d.remainingQuantity)} {d.baseUnit}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Total Modal Batch:</span>
                              <span className="font-bold text-emerald-300">
                                {formatRupiah(d.totalRemainingCostValue)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Harga Jual Dasar:</span>
                              <span>{formatRupiah(d.sellingPrice)}</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">Estimasi Margin:</span>
                              <span className={d.unitMarginPct < 5 ? 'text-rose-400 font-bold' : 'text-sky-300 font-bold'}>
                                {formatRupiah(d.unitMarginRp)} ({d.unitMarginPct}%)
                              </span>
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-400 pt-1">
                            Supplier: {d.supplierName}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="chartValue"
                    radius={[0, 6, 6, 0]}
                    cursor="pointer"
                    onClick={(entry) => {
                      const row = entry as unknown as BatchHppRow;
                      if (row?.productId) {
                        sound.playTap();
                        setHighlightedProductId((prev) =>
                          prev === row.productId ? null : row.productId
                        );
                        setPage(1);
                      }
                    }}
                  >
                    {chartData.map((entry, idx) => (
                      <Cell
                        key={entry.rowId}
                        fill={
                          highlightedProductId && highlightedProductId !== entry.productId
                            ? '#cbd5e1'
                            : BAR_COLORS[idx % BAR_COLORS.length]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Detailed Ledger Table */}
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          {viewMode === 'PER_BATCH' ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3">Produk &amp; SKU</th>
                    <th className="py-3 px-3">Nomor Batch &amp; Sumber</th>
                    <th className="py-3 px-3 text-right">Sisa Stok</th>
                    <th className="py-3 px-3 text-right">HPP / Satuan</th>
                    <th className="py-3 px-3 text-right">Total Modal Batch</th>
                    <th className="py-3 px-3 text-right">vs Rata-rata SKU</th>
                    <th className="py-3 px-3 text-right">Margin / Unit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedBatches.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        Tidak ada data batch yang sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedBatches.map((row, index) => {
                      const rank = (safePage - 1) * PAGE_SIZE + index + 1;
                      const prodObj = products.find((p) => p.id === row.productId);
                      return (
                        <tr key={row.rowId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                            {rank}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (prodObj && onSelectProductForStock) {
                                  onSelectProductForStock(prodObj);
                                }
                              }}
                              className="text-left font-bold text-slate-900 hover:text-sky-700 transition-colors cursor-pointer"
                            >
                              {row.productName}
                            </button>
                            <div className="text-[10.5px] text-slate-500 mt-0.5">
                              <span className="font-mono">{row.sku}</span> · {row.category}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{row.batchNumber}</span>
                              {row.isHighestUnitHppInProduct && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-sans font-bold">
                                  Termahal
                                </span>
                              )}
                            </div>
                            <div className="text-[10.5px] text-slate-500 mt-0.5">
                              {row.supplierName}
                              {row.receivedDate && row.receivedDate !== '-' && (
                                <> · Masuk {formatDateOnly(row.receivedDate)}</>
                              )}
                              {row.expiryDate && <> · Exp {formatDateOnly(row.expiryDate)}</>}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800 tabular-nums">
                            {formatNumber(row.remainingQuantity)} {row.baseUnit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 tabular-nums">
                            {formatRupiah(row.unitHpp)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-700 tabular-nums">
                            {formatRupiah(row.totalRemainingCostValue)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            {row.hppDiffFromAvgPct === 0 ? (
                              <span className="text-slate-400">0%</span>
                            ) : (
                              <span
                                className={`font-bold ${
                                  row.hppDiffFromAvgPct > 0 ? 'text-rose-600' : 'text-emerald-600'
                                }`}
                              >
                                {row.hppDiffFromAvgPct > 0 ? '+' : ''}
                                {row.hppDiffFromAvgPct}%
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                            <div
                              className={`font-bold ${
                                row.unitMarginRp <= 0
                                  ? 'text-rose-600'
                                  : row.unitMarginPct < 5
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {formatRupiah(row.unitMarginRp)}
                            </div>
                            <div className="text-[10px] text-slate-400">{row.unitMarginPct}%</div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10.5px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-3">Produk &amp; SKU</th>
                    <th className="py-3 px-3 text-center">Batch Aktif</th>
                    <th className="py-3 px-3 text-right">HPP Terendah</th>
                    <th className="py-3 px-3 text-right">HPP Tertimbang</th>
                    <th className="py-3 px-3 text-right">HPP Tertinggi</th>
                    <th className="py-3 px-3 text-right">Selisih (Spread)</th>
                    <th className="py-3 px-3 text-right">Total Modal Batch</th>
                    <th className="py-3 px-3 text-right">Rincian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        Tidak ada produk dengan batch aktif sesuai filter.
                      </td>
                    </tr>
                  ) : (
                    paginatedProducts.map((ps) => {
                      const isExpanded = Boolean(expandedProductIds[ps.productId]);
                      return (
                        <React.Fragment key={ps.productId}>
                          <tr className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{ps.productName}</div>
                              <div className="text-[10.5px] text-slate-500">
                                <span className="font-mono">{ps.sku}</span> · {ps.category} ·{' '}
                                <span className="font-mono font-semibold text-slate-700">
                                  {formatNumber(ps.totalRemainingQty)} {ps.baseUnit}
                                </span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                              {ps.activeBatchCount}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums">
                              {formatRupiah(ps.minUnitHpp)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800 tabular-nums">
                              {formatRupiah(ps.weightedAvgHpp)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 tabular-nums">
                              <div>{formatRupiah(ps.maxUnitHpp)}</div>
                              <div className="text-[10px] font-normal text-slate-500">
                                {ps.highestUnitBatchNumber}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                              {ps.hppSpreadRp > 0 ? (
                                <span className="font-bold text-amber-700">
                                  +{formatRupiah(ps.hppSpreadRp)} ({ps.hppSpreadPct}%)
                                </span>
                              ) : (
                                <span className="text-slate-400">Seragam</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-sky-700 tabular-nums">
                              {formatRupiah(ps.totalCapitalValue)}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => toggleProductExpand(ps.productId)}
                                className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Package className="w-3 h-3" />
                                <span>{isExpanded ? 'Tutup' : 'Batch'}</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={8} className="p-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                  {ps.batches.map((b) => (
                                    <div
                                      key={b.batchId}
                                      className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs flex flex-col justify-between gap-1.5"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono font-bold text-slate-900">
                                          {b.batchNumber}
                                        </span>
                                        {b.isHighestUnitHppInProduct && (
                                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                            HPP Tertinggi
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                                        <span className="text-slate-500">HPP/Unit:</span>
                                        <span className="font-black text-slate-900">
                                          {formatRupiah(b.unitHpp)}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                                        <span className="text-slate-500">Sisa Stok:</span>
                                        <span className="font-bold text-slate-700">
                                          {formatNumber(b.remainingQuantity)} {b.baseUnit}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums border-t border-slate-100 pt-1">
                                        <span className="text-slate-500">Total Modal:</span>
                                        <span className="font-bold text-sky-700">
                                          {formatRupiah(b.totalRemainingCostValue)}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeListLength > PAGE_SIZE && (
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="tabular-nums">
                Menampilkan {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, activeListLength)} dari{' '}
                {formatNumber(activeListLength)} entri
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => {
                    sound.playTap();
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold cursor-pointer"
                >
                  Sebelumnya
                </button>
                <span className="px-2 font-mono font-bold text-slate-800">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => {
                    sound.playTap();
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold cursor-pointer"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
