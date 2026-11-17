import React from 'react';
import { Filter, Check, EyeOff, RotateCcw, Flame } from 'lucide-react';
import { formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';

export interface CategoryFilterOption {
  name: string;
  color: string;
  currentRevenue: number;
  sharePercent: number;
}

interface CategoryTrendFilterBarProps {
  categories: CategoryFilterOption[];
  hiddenCategories: string[];
  onToggleCategory: (categoryName: string) => void;
  onSelectAll: () => void;
  onFocusTopPerformers: (count: number) => void;
  onClearAll: () => void;
}

export const CategoryTrendFilterBar: React.FC<CategoryTrendFilterBarProps> = ({
  categories,
  hiddenCategories,
  onToggleCategory,
  onSelectAll,
  onFocusTopPerformers,
  onClearAll,
}) => {
  if (categories.length === 0) return null;

  const hiddenSet = new Set(hiddenCategories);
  const activeCount = categories.filter((c) => !hiddenSet.has(c.name)).length;
  const totalCount = categories.length;
  const isFiltered = activeCount < totalCount;
  const isTop3Mode =
    totalCount > 3 &&
    activeCount === 3 &&
    [...categories]
      .sort((a, b) => b.currentRevenue - a.currentRevenue)
      .slice(0, 3)
      .every((c) => !hiddenSet.has(c.name));

  return (
    <div className="p-3.5 rounded-2xl bg-slate-50/90 border border-slate-200/90 space-y-2.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <Filter className="w-3.5 h-3.5 text-sky-600" />
            <span>Filter Kategori pada Grafik Tren Penjualan</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold font-mono ${
              activeCount === 0
                ? 'bg-rose-100 text-rose-700'
                : isFiltered
                ? 'bg-sky-100 text-sky-800 border border-sky-200'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {activeCount}/{totalCount} Kategori Aktif
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onSelectAll();
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
              !isFiltered
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            Semua ({totalCount})
          </button>

          {totalCount > 3 && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onFocusTopPerformers(3);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors flex items-center gap-1 cursor-pointer ${
                isTop3Mode
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white hover:bg-amber-50 text-amber-800 border-amber-200'
              }`}
              title="Fokus hanya pada 3 kategori dengan omzet tertinggi"
            >
              <Flame className="w-3 h-3" />
              <span>Fokus Top 3</span>
            </button>
          )}

          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onClearAll();
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 transition-colors cursor-pointer"
            >
              Nonaktifkan Semua
            </button>
          )}

          {isFiltered && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onSelectAll();
              }}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Category Toggle Buttons */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => {
          const isActive = !hiddenSet.has(cat.name);
          return (
            <button
              key={cat.name}
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                sound.playTap();
                onToggleCategory(cat.name);
              }}
              title={
                isActive
                  ? `Klik untuk menyembunyikan kategori ${cat.name} (${formatRupiah(cat.currentRevenue)})`
                  : `Klik untuk menampilkan kembali kategori ${cat.name}`
              }
              className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer select-none ${
                isActive
                  ? 'bg-white text-slate-900 border-slate-300 shadow-2xs hover:border-sky-400'
                  : 'bg-slate-100/80 text-slate-400 border-slate-200/70 opacity-75 hover:opacity-100 hover:bg-white'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 transition-transform ${
                  isActive ? 'scale-100' : 'scale-75 opacity-40'
                }`}
                style={{ backgroundColor: cat.color }}
              />
              <span className={isActive ? '' : 'line-through'}>{cat.name}</span>
              {cat.currentRevenue > 0 && (
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                    isActive
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-slate-200/60 text-slate-400'
                  }`}
                >
                  {cat.sharePercent.toFixed(0)}%
                </span>
              )}
              {isActive ? (
                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
              ) : (
                <EyeOff className="w-3 h-3 text-slate-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
