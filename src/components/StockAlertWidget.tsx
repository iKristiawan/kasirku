import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Sliders, 
  ChevronDown, 
  ChevronUp, 
  Package, 
  Truck, 
  ArrowRight,
  ShieldAlert,
  X
} from 'lucide-react';
import { Product } from '../types/pos';
import { formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';

interface StockAlertWidgetProps {
  products: Product[];
  onOpenThresholdSettings: () => void;
  onNavigateToSuppliers?: () => void;
  onQuickSelectProduct?: (product: Product) => void;
}

export const StockAlertWidget: React.FC<StockAlertWidgetProps> = ({
  products,
  onOpenThresholdSettings,
  onNavigateToSuppliers,
  onQuickSelectProduct,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Compute products below or at minimum threshold
  const lowStockProducts = products.filter(
    (p) => p.stockInBaseUnit <= p.minStockAlert
  );

  const outOfStockProducts = lowStockProducts.filter(
    (p) => p.stockInBaseUnit <= 0
  );
  
  const warningProducts = lowStockProducts.filter(
    (p) => p.stockInBaseUnit > 0
  );

  if (lowStockProducts.length === 0) {
    return (
      <div className="mx-3 md:mx-4 mt-3 px-3.5 py-2 bg-emerald-50/90 border border-emerald-200/80 rounded-2xl flex items-center justify-between text-xs text-emerald-900 shadow-2xs">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">
            Semua stok produk aman di atas ambang batas minimum ({products.length} barang terpantau).
          </span>
        </div>

        <button
          onClick={() => {
            sound.playTap();
            onOpenThresholdSettings();
          }}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold text-[11px] transition-colors shrink-0"
        >
          <Sliders className="w-3 h-3" />
          <span>Atur Batas Minimum</span>
        </button>
      </div>
    );
  }

  // If dismissed by user, show a compact floating or mini alert indicator
  if (isDismissed) {
    return (
      <div className="mx-3 md:mx-4 mt-2 px-3 py-1.5 bg-amber-500 text-slate-900 rounded-xl flex items-center justify-between text-xs font-bold shadow-xs animate-subtle-pulse">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-slate-950 text-amber-400 flex items-center justify-center animate-ring-pulse">
            <AlertTriangle className="w-2.5 h-2.5 stroke-[2.5]" />
          </div>
          <span>
            Peringatan: {lowStockProducts.length} produk mencapai batas minimum stok!
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              sound.playTap();
              setIsDismissed(false);
              setIsExpanded(true);
            }}
            className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-bold hover:bg-slate-800"
          >
            Buka Widget
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 md:mx-4 mt-3 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50/70 border border-amber-300/80 rounded-2xl shadow-xs overflow-hidden transition-all">
      {/* Widget Header Summary */}
      <div className="p-3 md:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-3">
          {/* Subtle Ring-Pulsing Alert Beacon for high visibility */}
          <div className="relative shrink-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow-xs animate-ring-pulse">
              <AlertTriangle className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-600"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-xs md:text-sm font-bold text-slate-900">
                Peringatan Stok Menipis
              </h4>
              <span className="px-2 py-0.5 rounded-md bg-amber-200/90 text-amber-900 font-mono font-bold text-[10px] animate-subtle-pulse inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
                <span>{lowStockProducts.length} Produk Mencapai Batas</span>
              </span>
              {outOfStockProducts.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-rose-200 text-rose-900 font-mono font-bold text-[10px] animate-pulse">
                  {outOfStockProducts.length} Habis
                </span>
              )}
            </div>

            <p className="text-[11px] text-slate-600 mt-0.5">
              Stok produk telah menyentuh atau berada di bawah ambang batas minimum yang ditentukan.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onOpenThresholdSettings();
            }}
            className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-slate-800 text-xs font-bold border border-amber-200 shadow-2xs flex items-center gap-1.5 transition-colors"
            title="Ubah ambang batas minimum per produk"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-700" />
            <span>Atur Batas Stok</span>
          </button>

          {onNavigateToSuppliers && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToSuppliers();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors"
              title="Buat PO / Restock Barang ke Supplier"
            >
              <Truck className="w-3.5 h-3.5 text-sky-400" />
              <span>Restock PO</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsExpanded(!isExpanded);
            }}
            className="p-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 transition-colors"
            title={isExpanded ? 'Tutup Rincian' : 'Buka Rincian Produk'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsDismissed(true);
            }}
            className="p-1.5 rounded-xl hover:bg-amber-200/60 text-slate-400 hover:text-slate-700 transition-colors"
            title="Tutup Widget"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Quick horizontal preview tags (when collapsed) */}
      {!isExpanded && (
        <div className="px-3 pb-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">
            Daftar Cepat:
          </span>
          {lowStockProducts.map((p) => {
            const isZero = p.stockInBaseUnit <= 0;
            return (
              <div
                key={p.id}
                onClick={() => {
                  sound.playTap();
                  if (onQuickSelectProduct) onQuickSelectProduct(p);
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                  isZero
                    ? 'bg-rose-50 border-rose-300 text-rose-900 hover:bg-rose-100'
                    : 'bg-white border-amber-200 text-slate-800 hover:bg-amber-100/60'
                }`}
              >
                <span className="font-bold truncate max-w-[140px]">{p.name}</span>
                <span className="font-mono text-[10px] px-1 py-0.2 rounded bg-black/5 font-bold">
                  {p.stockInBaseUnit} / Min {p.minStockAlert} {p.baseUnit}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Expanded Detail Panel */}
      {isExpanded && (
        <div className="border-t border-amber-200/80 bg-white/70 p-3 space-y-2 max-h-56 overflow-y-auto">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1 flex items-center justify-between">
            <span>Rincian Produk di Bawah Ambang Batas:</span>
            <span className="text-[10px] text-slate-400 font-normal">
              * Klik produk untuk memicu penambahan ke kasir
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {lowStockProducts.map((p) => {
              const ratio = p.minStockAlert > 0 ? (p.stockInBaseUnit / p.minStockAlert) * 100 : 0;
              const isZero = p.stockInBaseUnit <= 0;

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    sound.playTap();
                    if (onQuickSelectProduct) onQuickSelectProduct(p);
                  }}
                  className="p-2.5 bg-white rounded-xl border border-amber-200/90 shadow-2xs hover:border-amber-400 transition-colors flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-900 truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Kategori: {p.category} · Barcode: {p.barcode}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        isZero
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}>
                        Stok: {formatNumber(p.stockInBaseUnit)} {p.baseUnit}
                      </span>
                    </div>
                  </div>

                  {/* Visual ratio bar */}
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Batas Minimum: <b>{p.minStockAlert} {p.baseUnit}</b></span>
                      <span>{Math.round(ratio)}% dari batas</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isZero ? 'bg-rose-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, ratio))}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
