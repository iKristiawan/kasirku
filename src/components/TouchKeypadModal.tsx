import React, { useState, useEffect } from 'react';
import { 
  X, 
  Delete, 
  Check, 
  RotateCcw, 
  Plus, 
  Minus, 
  Calculator,
  Hash
} from 'lucide-react';
import { sound } from '../utils/audio';
import { formatNumber, formatRupiah } from '../utils/formatters';

interface ManualOverrideContext {
  originalPrice: number;
  quantity: number;
  presetReasons?: string[];
}

interface TouchKeypadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  initialValue: number | string;
  unitName?: string;
  isCurrency?: boolean;
  min?: number;
  max?: number;
  quickPresets?: number[];
  manualOverrideContext?: ManualOverrideContext;
  onConfirm: (val: number, reason?: string) => void;
}

const DEFAULT_OVERRIDE_REASONS = [
  'Nego Pelanggan Tetap',
  'Promo / Diskon Khusus Kasir',
  'Barang Kemasan Kurang Mulus',
  'Penyesuaian Harga Kompetitor',
];

export const TouchKeypadModal: React.FC<TouchKeypadModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  initialValue,
  unitName = 'PCS',
  isCurrency = false,
  min = 0,
  max = 999999999,
  quickPresets = [1, 5, 10, 20, 50, 100],
  manualOverrideContext,
  onConfirm,
}) => {
  const [displayValue, setDisplayValue] = useState<string>('0');
  const [overrideReason, setOverrideReason] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const initNum = typeof initialValue === 'number' ? initialValue : parseFloat(initialValue) || 0;
      setDisplayValue(String(initNum));
      setOverrideReason('');
    }
  }, [isOpen, initialValue]);

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      const isTextInput = activeTag === 'INPUT' || activeTag === 'TEXTAREA';

      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
        return;
      }
      if (isTextInput) return;

      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, displayValue, overrideReason]);

  if (!isOpen) return null;

  const currentNumeric = parseFloat(displayValue) || 0;
  const catalogBaseline = manualOverrideContext?.originalPrice ?? 0;
  const overrideQty = Math.max(1, manualOverrideContext?.quantity ?? 1);
  const diffFromCatalog = manualOverrideContext ? currentNumeric - catalogBaseline : 0;
  const discountPct =
    manualOverrideContext && catalogBaseline > 0
      ? Math.round(((catalogBaseline - currentNumeric) / catalogBaseline) * 1000) / 10
      : 0;

  const handleDigit = (digit: string) => {
    sound.playTap();
    setDisplayValue((prev) => {
      if (prev === '0') return digit;
      if (prev.length >= 10) return prev; // Limit to 10 digits
      return prev + digit;
    });
  };

  const handleAddZeroes = (zeroes: string) => {
    sound.playTap();
    setDisplayValue((prev) => {
      if (prev === '0') return '0';
      if (prev.length + zeroes.length > 10) return prev;
      return prev + zeroes;
    });
  };

  const handleBackspace = () => {
    sound.playTap();
    setDisplayValue((prev) => {
      if (prev.length <= 1) return '0';
      return prev.slice(0, -1);
    });
  };

  const handleClear = () => {
    sound.playTap();
    setDisplayValue('0');
  };

  const handleApplyPreset = (delta: number) => {
    sound.playTap();
    const nextVal = Math.max(min, Math.min(max, currentNumeric + delta));
    setDisplayValue(String(nextVal));
  };

  const handleSetExactPreset = (presetVal: number) => {
    sound.playTap();
    const nextVal = Math.max(min, Math.min(max, presetVal));
    setDisplayValue(String(nextVal));
  };

  const handleConfirm = () => {
    const finalVal = Math.max(min, Math.min(max, currentNumeric));
    sound.playSuccessChime();
    onConfirm(finalVal, overrideReason.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 select-none animate-in fade-in duration-150 overflow-y-auto">
      <div 
        className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-300 flex flex-col space-y-3.5 animate-in zoom-in-95 duration-150 my-auto"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <Calculator className="w-4 h-4 text-sky-400" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900 leading-tight truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* High-Contrast Large Numeric Display */}
        <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 text-right shadow-inner flex flex-col justify-between min-h-[84px]">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-1 font-mono text-sky-400">
              <Hash className="w-3.5 h-3.5" />
              <span>{manualOverrideContext ? 'Manual Override Harga' : 'Input Nilai Tablet'}</span>
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
              {unitName}
            </span>
          </div>

          <div className="mt-1 font-mono text-3xl font-black text-white tracking-tight tabular-nums flex items-baseline justify-end gap-1.5 overflow-x-auto no-scrollbar">
            {isCurrency && <span className="text-sky-400 text-xl font-bold">Rp</span>}
            <span>{isCurrency ? formatNumber(currentNumeric) : displayValue}</span>
            {!isCurrency && unitName && (
              <span className="text-xs font-semibold text-slate-400 ml-1">
                {unitName}
              </span>
            )}
          </div>

          {manualOverrideContext && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 flex items-center justify-between text-[10.5px] font-mono tabular-nums">
              <span className="text-slate-400">
                Normal: <strong className="text-slate-200">{formatRupiah(catalogBaseline)}</strong>
              </span>
              {diffFromCatalog < 0 ? (
                <span className="text-amber-300 font-bold">
                  Diskon {discountPct}% (-{formatRupiah(Math.abs(diffFromCatalog) * overrideQty)} total)
                </span>
              ) : diffFromCatalog > 0 ? (
                <span className="text-emerald-300 font-bold">
                  +{formatRupiah(diffFromCatalog)}/unit
                </span>
              ) : (
                <span className="text-slate-400">Harga Normal</span>
              )}
            </div>
          )}
        </div>

        {/* Quick Presets / Steppers Row */}
        {quickPresets && quickPresets.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <button
              type="button"
              onClick={() => handleApplyPreset(-1)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold font-mono transition-colors flex items-center gap-0.5 shrink-0"
              title="Kurang 1"
            >
              <Minus className="w-3 h-3" />
              <span>1</span>
            </button>

            {quickPresets.map((preset) => {
              const discBadge =
                manualOverrideContext && catalogBaseline > 0
                  ? Math.round(((catalogBaseline - preset) / catalogBaseline) * 100)
                  : null;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    if (isCurrency || preset >= 50) {
                      handleSetExactPreset(preset);
                    } else {
                      handleApplyPreset(preset);
                    }
                  }}
                  className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 active:bg-sky-200 text-sky-800 rounded-xl text-xs font-bold font-mono transition-colors shrink-0 border border-sky-200/60"
                >
                  {manualOverrideContext && discBadge !== null && discBadge > 0
                    ? `-${discBadge}% (${formatNumber(preset)})`
                    : manualOverrideContext && preset === catalogBaseline
                    ? `Normal (${formatNumber(preset)})`
                    : isCurrency
                    ? formatNumber(preset)
                    : `+${preset}`}
                </button>
              );
            })}
          </div>
        )}

        {/* Manual Override Reason Selector & Note (Logged to Audit Trail) */}
        {manualOverrideContext && (
          <div className="space-y-1.5 bg-amber-50/70 border border-amber-200 rounded-2xl p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-bold text-amber-900">
                Alasan Override / Diskon Manual (Tercatat Otomatis)
              </span>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {(manualOverrideContext.presetReasons || DEFAULT_OVERRIDE_REASONS).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setOverrideReason(r);
                  }}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap shrink-0 border transition-colors cursor-pointer ${
                    overrideReason === r
                      ? 'bg-amber-700 text-white border-amber-700'
                      : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Atau ketik alasan singkat diskon manual (opsional)..."
              maxLength={160}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-amber-200 text-xs text-slate-900 focus:outline-none focus:border-amber-500 placeholder:text-slate-400"
            />
          </div>
        )}

        {/* Tactile High-Contrast Numpad Grid (Oversized for tablet touches) */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 text-xl font-black font-mono shadow-2xs border border-slate-200/80 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}

          {/* Bottom row: Clear (C), 0, Backspace */}
          <button
            type="button"
            onClick={handleClear}
            className="h-12 rounded-2xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 text-sm font-extrabold shadow-2xs border border-rose-200 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
            title="Reset ke Nol"
          >
            C
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 text-xl font-black font-mono shadow-2xs border border-slate-200/80 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 rounded-2xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-800 text-lg font-bold shadow-2xs border border-amber-200 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
            title="Hapus Satu Digit"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Double Zero & Confirm Actions */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => handleAddZeroes('00')}
            className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono font-bold text-sm border border-slate-200 active:scale-95 transition-transform"
          >
            00
          </button>

          <button
            type="button"
            onClick={() => handleAddZeroes('000')}
            className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-mono font-bold text-sm border border-slate-200 active:scale-95 transition-transform"
          >
            000
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-sm shadow-md shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>OK</span>
          </button>
        </div>
      </div>
    </div>
  );
};
