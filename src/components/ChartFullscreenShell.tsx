import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, X } from 'lucide-react';
import { sound } from '../utils/audio';

interface FullscreenToggleButtonProps {
  isFullscreen: boolean;
  onToggle: () => void;
  className?: string;
}

export const FullscreenToggleButton: React.FC<FullscreenToggleButtonProps> = ({
  isFullscreen,
  onToggle,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={() => {
        sound.playTap();
        onToggle();
      }}
      title={isFullscreen ? 'Keluar dari mode layar penuh (Esc)' : 'Tampilkan grafik layar penuh'}
      aria-label={isFullscreen ? 'Keluar Full Screen' : 'Tampilkan Full Screen'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
        isFullscreen
          ? 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900 shadow-xs'
          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
      } ${className}`}
    >
      {isFullscreen ? (
        <>
          <Minimize2 className="w-3.5 h-3.5 shrink-0" />
          <span>Keluar Full Screen</span>
        </>
      ) : (
        <>
          <Maximize2 className="w-3.5 h-3.5 shrink-0" />
          <span>Full Screen</span>
        </>
      )}
    </button>
  );
};

interface ChartFullscreenShellProps {
  isFullscreen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Renders chart cards inline normally, and portals them directly to `document.body`
 * when expanded to Full Screen so parent CSS transforms (`.animate-dashboard-enter`)
 * never clip or trap `position: fixed`.
 */
export const ChartFullscreenShell: React.FC<ChartFullscreenShellProps> = ({
  isFullscreen,
  onClose,
  title = 'Tampilan Layar Penuh',
  children,
}) => {
  // Lock body scroll & handle Escape key + notify Recharts ResponsiveContainer to resize
  useEffect(() => {
    if (!isFullscreen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sound.playTap();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const t1 = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 45);
    const t2 = window.setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 200);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      // Let inline ResponsiveContainer re-measure cleanly after exiting portal
      window.setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 45);
    };
  }, [isFullscreen, onClose]);

  if (!isFullscreen) {
    return <>{children}</>;
  }

  return (
    <>
      {/* Subtle inline placeholder so background scroll position remains stable */}
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-3xl p-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
        <div className="flex items-center gap-2.5">
          <Maximize2 className="w-4 h-4 text-sky-600 shrink-0" />
          <span>
            <strong className="text-slate-800">{title}</strong> sedang dibuka dalam mode Full Screen.
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            sound.playTap();
            onClose();
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span>Kembalikan Grafik</span>
        </button>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                sound.playTap();
                onClose();
              }
            }}
            className="fixed inset-0 z-[90] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 md:p-6 overflow-y-auto animate-fade-in"
          >
            <div className="relative w-full max-w-[1440px] max-h-[95vh] overflow-y-auto rounded-3xl shadow-2xl bg-white">
              {/* Top quick-exit floating hint bar inside modal */}
              <div className="sticky top-0 z-20 bg-slate-900 text-white px-4 py-2 flex items-center justify-between gap-3 border-b border-slate-800">
                <div className="flex items-center gap-2 min-w-0 text-xs">
                  <Maximize2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-bold truncate">{title}</span>
                  <span className="hidden sm:inline text-[10.5px] text-slate-400 font-mono">
                    · Tekan ESC untuk keluar
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Tutup</span>
                </button>
              </div>

              <div className="[&>*]:border-0 [&>*]:rounded-none [&>*]:shadow-none">
                {children}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
