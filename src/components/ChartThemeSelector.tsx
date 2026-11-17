import React, { useState, useRef, useEffect } from 'react';
import { Palette, Check, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { CHART_THEME_PRESETS } from '../utils/chartTheme';
import { ChartColorCustomPalette } from '../types/pos';
import { useChartTheme } from './ChartThemeContext';
import { sound } from '../utils/audio';

const CUSTOM_COLOR_FIELDS: Array<{
  key: keyof ChartColorCustomPalette;
  label: string;
  hint: string;
}> = [
  { key: 'primary', label: 'Utama (Primary)', hint: 'Grafik omzet, volume & seri utama' },
  { key: 'secondary', label: 'Sekunder / Tren', hint: 'Moving avg, member & pembanding' },
  { key: 'positive', label: 'Positif / Laba', hint: 'Target tercapai & margin sehat' },
  { key: 'warning', label: 'Peringatan / Promo', hint: 'Garis target, promo & stok menipis' },
  { key: 'danger', label: 'Kritis / Batas Min.', hint: 'Garis batas stok & margin rugi' },
  { key: 'neutral', label: 'Netral Pembanding', hint: 'Periode lalu & harga normal' },
];

export const ChartThemeSelector: React.FC = () => {
  const {
    themeId,
    palette,
    customColors,
    isDefaultTheme,
    selectPreset,
    updateCustomColors,
    resetTheme,
  } = useChartTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          sound.playTap();
          setIsOpen((prev) => !prev);
        }}
        className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
          isOpen
            ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
            : 'bg-slate-50 hover:bg-white text-slate-800 border-slate-200'
        }`}
        title="Atur tema warna seluruh grafik pada Sales Performance Dashboard"
      >
        <Palette className={`w-3.5 h-3.5 shrink-0 ${isOpen ? 'text-sky-300' : 'text-slate-600'}`} />
        <span>Tema Grafik:</span>
        <span className="font-extrabold">{palette.name}</span>
        <span className="inline-flex items-center gap-0.5 ml-0.5" aria-hidden="true">
          {palette.swatches.slice(0, 4).map((hex, i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full border border-white/80 shadow-2xs"
              style={{ backgroundColor: hex }}
            />
          ))}
        </span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Pengaturan Tema Warna Grafik"
          className="absolute right-0 mt-2 w-[320px] sm:w-[390px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-xl z-50 p-3.5 sm:p-4 space-y-3.5 text-left"
        >
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div>
              <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                <span>Pengaturan Tema Warna Grafik</span>
              </h4>
              <p className="text-[10.5px] text-slate-500 mt-0.5">
                Sesuaikan palet warna grafik dashboard dengan branding toko. Tersimpan otomatis.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
              aria-label="Tutup pengaturan tema warna"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Preset Palettes Grid */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Preset Palet Toko</span>
              {!isDefaultTheme && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    resetTheme();
                  }}
                  className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-900 normal-case font-bold cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Bawaan</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-0.5">
              {CHART_THEME_PRESETS.map((preset) => {
                const isSelected = themeId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      selectPreset(preset.id);
                    }}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1.5 ${
                      isSelected
                        ? 'bg-sky-50/70 border-sky-500 ring-1 ring-sky-500/30'
                        : 'bg-slate-50/70 hover:bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11.5px] font-extrabold text-slate-900 truncate">
                        {preset.name}
                      </span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-sky-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {preset.palette.swatches.map((hex, i) => (
                        <span
                          key={i}
                          className="h-3 flex-1 rounded-sm border border-black/5"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500 line-clamp-2 leading-snug">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Brand Palette Builder */}
          <div className="pt-2.5 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  selectPreset('custom');
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-slate-800 cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-600" />
                <span>Kustom Warna Branding Toko</span>
              </button>
              {themeId === 'custom' && (
                <span className="px-2 py-0.5 rounded-md text-[9.5px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Aktif
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {CUSTOM_COLOR_FIELDS.map((field) => {
                const value = customColors[field.key];
                return (
                  <label
                    key={field.key}
                    className="flex items-center gap-2 p-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors"
                    title={field.hint}
                  >
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => {
                        updateCustomColors({ [field.key]: e.target.value });
                      }}
                      className="w-6 h-6 rounded-lg border border-slate-200 bg-transparent cursor-pointer shrink-0 p-0"
                      aria-label={`Pilih warna ${field.label}`}
                    />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold text-slate-800 truncate">
                        {field.label}
                      </div>
                      <div className="text-[9.5px] font-mono text-slate-500 uppercase">
                        {value}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
