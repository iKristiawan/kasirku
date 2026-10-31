import React, { useEffect } from 'react';
import { AlertTriangle, Bell, X, ArrowRight, Truck, CheckCircle2, Volume2 } from 'lucide-react';
import { StockAlertNotification, ProductCategory } from '../types/pos';
import { formatNumber } from '../utils/formatters';
import { getCategoryColor } from '../utils/categoryColors';
import { sound } from '../utils/audio';

interface StockNotificationToastProps {
  alert: StockAlertNotification | null;
  categories?: ProductCategory[];
  onDismiss: () => void;
  onHighlightProduct: (productId: string) => void;
  onNavigateToSuppliers?: () => void;
}

export const StockNotificationToast: React.FC<StockNotificationToastProps> = ({
  alert,
  categories = [],
  onDismiss,
  onHighlightProduct,
  onNavigateToSuppliers,
}) => {
  useEffect(() => {
    if (!alert) return;

    // Automatically play sound chime when alert appears
    sound.playWarningChime();

    // Auto dismiss after 10 seconds unless hovered
    const timer = setTimeout(() => {
      onDismiss();
    }, 10000);

    return () => clearTimeout(timer);
  }, [alert?.id]);

  if (!alert) return null;

  const isZero = alert.currentStock <= 0;
  const catColor = getCategoryColor(alert.category, categories);
  const ratio = alert.minThreshold > 0 ? (alert.currentStock / alert.minThreshold) * 100 : 0;

  return (
    <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 max-w-lg w-[92%] sm:w-full animate-in slide-in-from-top-4 duration-200">
      <div className={`p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all select-none ${
        isZero
          ? 'bg-rose-950/95 text-white border-rose-500/80 shadow-rose-950/40 ring-2 ring-rose-500/50'
          : 'bg-slate-900/95 text-white border-amber-400/80 shadow-amber-950/40 ring-2 ring-amber-400/40'
      }`}>
        <div className="flex items-start justify-between gap-3">
          {/* Beacon Alert Icon */}
          <div className="relative shrink-0 mt-0.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
              isZero ? 'bg-rose-600 text-white' : 'bg-amber-500 text-slate-950'
            }`}>
              <Bell className="w-5 h-5 animate-bounce stroke-[2.5]" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isZero ? 'bg-rose-400' : 'bg-amber-400'
              }`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${
                isZero ? 'bg-rose-500' : 'bg-amber-500'
              }`}></span>
            </span>
          </div>

          {/* Main Alert Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                isZero ? 'bg-rose-600 text-white animate-pulse' : 'bg-amber-400 text-slate-950'
              }`}>
                {isZero ? 'STOK HABIS (0)!' : 'AMBANG BATAS MINIMUM TERCAPAI!'}
              </span>

              <span
                style={{
                  backgroundColor: `${catColor}25`,
                  color: '#ffffff',
                  borderColor: `${catColor}60`,
                }}
                className="px-2 py-0.2 rounded-md text-[10px] font-bold border truncate max-w-[120px]"
              >
                {alert.category}
              </span>
            </div>

            <h4 className="text-sm font-bold text-white mt-1 truncate">
              {alert.productName}
            </h4>

            <p className="text-xs text-slate-300 mt-0.5">
              Stok tersisa: <span className="font-mono font-bold text-amber-300">{formatNumber(alert.currentStock)} {alert.baseUnit}</span> (Batas minimum: <span className="font-mono">{alert.minThreshold} {alert.baseUnit}</span>)
            </p>

            {/* Visual ratio bar */}
            <div className="mt-2 space-y-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>Rasio Kritis Stok</span>
                <span className="font-bold text-amber-300">{Math.round(ratio)}% dari batas minimum</span>
              </div>
              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isZero ? 'bg-rose-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(8, ratio))}%` }}
                />
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onHighlightProduct(alert.productId);
                  onDismiss();
                }}
                className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <span>Fokus & Sorot Produk</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              {onNavigateToSuppliers && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onNavigateToSuppliers();
                    onDismiss();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <Truck className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restock PO Supplier</span>
                </button>
              )}
            </div>
          </div>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onDismiss();
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Tutup Notifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
