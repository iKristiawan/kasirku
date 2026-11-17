import React, { useState, useEffect } from 'react';
import { 
  X, 
  Delete, 
  Check, 
  RotateCcw, 
  Calculator, 
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';

export interface TouchNumpadPreset {
  label: string;
  value: number;
  isAdditive?: boolean; // if true, adds to current; if false, sets to value
}

interface TouchNumpadModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  initialValue: number | string;
  unitLabel?: string;
  isCurrency?: boolean;
  min?: number;
  max?: number;
  quickPresets?: TouchNumpadPreset[];
  onConfirm: (val: number) => void;
}

export const TouchNumpadModal: React.FC<TouchNumpadModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  initialValue,
  unitLabel = '',
  isCurrency = false,
  min = 0,
  max,
  quickPresets,
  onConfirm,
}) => {
  const [valStr, setValStr] = useState<string>('0');

  useEffect(() => {
    if (isOpen) {
      const initNum = typeof initialValue === 'number' ? initialValue : parseFloat(initialValue) || 0;
      setValStr(initNum.toString());
    }
  }, [isOpen, initialValue]);

  // Physical keyboard support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, valStr]);

  if (!isOpen) return null;

  const currentNum = parseFloat(valStr) || 0;

  const handleDigit = (digit: string) => {
    sound.playTap();
    if (valStr === '0') {
      setValStr(digit);
    } else {
      if (valStr.length >= 10) return; // Prevent overflow
      setValStr((prev) => prev + digit);
    }
  };

  const handleDoubleZero = () => {
    sound.playTap();
    if (valStr === '0') return;
    if (valStr.length >= 9) return;
    setValStr((prev) => prev + '00');
  };

  const handleBackspace = () => {
    sound.playTap();
    if (valStr.length <= 1) {
      setValStr('0');
    } else {
      setValStr((prev) => prev.slice(0, -1));
    }
  };

  const handleClear = () => {
    sound.playTap();
    setValStr('0');
  };

  const handleApplyPreset = (preset: TouchNumpadPreset) => {
    sound.playTap();
    if (preset.isAdditive) {
      const next = Math.max(min, currentNum + preset.value);
      if (max !== undefined && next > max) return;
      setValStr(next.toString());
    } else {
      setValStr(preset.value.toString());
    }
  };

  const handleConfirm = () => {
    let finalVal = parseFloat(valStr) || 0;
    if (finalVal < min) finalVal = min;
    if (max !== undefined && finalVal > max) finalVal = max;

    sound.playSuccessChime();
    onConfirm(finalVal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 select-none animate-in fade-in duration-150">
      <div className="bg-slate-900 border-2 border-slate-700/80 rounded-3xl max-w-sm w-full p-5 shadow-2xl text-white flex flex-col space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400">
              <Calculator className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
              {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* High-Contrast Value Display Screen */}
        <div className="bg-slate-950 p-4 rounded-2xl border-2 border-sky-500/40 shadow-inner flex flex-col items-end justify-center min-h-[76px]">
          <div className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
            {isCurrency ? 'Nominal Nilai (IDR)' : unitLabel ? `Jumlah (${unitLabel})` : 'Kuantitas'}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-3xl md:text-4xl font-black font-mono tracking-tight text-white tabular-nums">
              {isCurrency ? formatRupiah(currentNum) : formatNumber(currentNum)}
            </span>
            {!isCurrency && unitLabel && (
              <span className="text-xs font-bold text-slate-400 uppercase font-mono">
                {unitLabel}
              </span>
            )}
          </div>
        </div>

        {/* Quick Presets (if provided) */}
        {quickPresets && quickPresets.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {quickPresets.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(preset)}
                className="py-2 px-1 rounded-xl bg-slate-800 hover:bg-sky-600/30 active:bg-sky-600 border border-slate-700 text-xs font-bold font-mono text-sky-300 hover:text-white transition-all text-center truncate cursor-pointer shadow-2xs"
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* 3x4 Touch Numeric Grid */}
        <div className="grid grid-cols-3 gap-2">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-sky-600 active:scale-95 text-2xl font-black font-mono text-white shadow-md border border-slate-700/60 transition-all flex items-center justify-center cursor-pointer select-none"
            >
              {digit}
            </button>
          ))}

          {/* Bottom Row: 00, 0, Backspace */}
          <button
            type="button"
            onClick={handleDoubleZero}
            className="h-14 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-sky-600 text-xl font-bold font-mono text-slate-300 shadow-md border border-slate-700/60 transition-all flex items-center justify-center cursor-pointer"
          >
            00
          </button>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-sky-600 active:scale-95 text-2xl font-black font-mono text-white shadow-md border border-slate-700/60 transition-all flex items-center justify-center cursor-pointer select-none"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            className="h-14 rounded-2xl bg-slate-800/90 hover:bg-rose-950/60 active:bg-rose-600 text-slate-300 hover:text-rose-400 active:text-white shadow-md border border-slate-700/60 transition-all flex items-center justify-center cursor-pointer"
            title="Hapus Digit Terakhir (Backspace)"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        {/* Action Controls: Clear & Big OK Confirmation */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <button
            type="button"
            onClick={handleClear}
            className="h-12 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="col-span-2 h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer border border-emerald-400/40"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Selesai (OK)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
