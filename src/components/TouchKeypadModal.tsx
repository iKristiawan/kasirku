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
  onConfirm: (val: number) => void;
}

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
  onConfirm,
}) => {
  const [displayValue, setDisplayValue] = useState<string>('0');

  useEffect(() => {
    if (isOpen) {
      const initNum = typeof initialValue === 'number' ? initialValue : parseFloat(initialValue) || 0;
      setDisplayValue(String(initNum));
    }
  }, [isOpen, initialValue]);

  // Keyboard shortcut listener
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, displayValue]);

  if (!isOpen) return null;

  const currentNumeric = parseFloat(displayValue) || 0;

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
    onConfirm(finalVal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 select-none animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-300 flex flex-col space-y-4 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Calculator className="w-4 h-4 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 leading-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-slate-500 font-medium truncate max-w-[200px]">
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
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* High-Contrast Large Numeric Display */}
        <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 text-right shadow-inner flex flex-col justify-between min-h-[84px]">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-1 font-mono text-sky-400">
              <Hash className="w-3.5 h-3.5" />
              <span>Input Nilai Tablet</span>
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

            {quickPresets.map((preset) => (
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
                {isCurrency ? formatNumber(preset) : `+${preset}`}
              </button>
            ))}
          </div>
        )}

        {/* Tactile High-Contrast Numpad Grid (Oversized for tablet touches) */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-13 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 text-xl font-black font-mono shadow-2xs border border-slate-200/80 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
            >
              {digit}
            </button>
          ))}

          {/* Bottom row: Clear (C), 0, Backspace */}
          <button
            type="button"
            onClick={handleClear}
            className="h-13 rounded-2xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 text-sm font-extrabold shadow-2xs border border-rose-200 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
            title="Reset ke Nol"
          >
            C
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-13 rounded-2xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 text-xl font-black font-mono shadow-2xs border border-slate-200/80 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            className="h-13 rounded-2xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-amber-800 text-lg font-bold shadow-2xs border border-amber-200 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
            title="Hapus Satu Digit"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Double Zero & Confirm Actions */}
        <div className="grid grid-cols-3 gap-2 pt-1">
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
