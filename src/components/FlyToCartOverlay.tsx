import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Package, Wrench } from 'lucide-react';

export interface FlyingCartParticle {
  id: string;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  imageUrl?: string;
  label: string;
  accentColor: string;
  isService?: boolean;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function resolveVisibleTargetElement(
  candidates: Array<HTMLElement | null | undefined>
): HTMLElement | null {
  for (const el of candidates) {
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return el;
    }
  }
  return null;
}

export function computeFlyCoords(
  sourceEl: HTMLElement | null | undefined,
  targetEl: HTMLElement | null | undefined
): { startX: number; startY: number; targetX: number; targetY: number } | null {
  if (typeof window === 'undefined' || prefersReducedMotion()) return null;
  if (!sourceEl || !targetEl) return null;

  const originEl = (sourceEl.querySelector('.fly-cart-origin') as HTMLElement | null) || sourceEl;
  const sRect = originEl.getBoundingClientRect();
  const tRect = targetEl.getBoundingClientRect();

  if (sRect.width <= 0 || sRect.height <= 0 || tRect.width <= 0 || tRect.height <= 0) {
    return null;
  }

  return {
    startX: sRect.left + sRect.width / 2,
    startY: sRect.top + sRect.height / 2,
    targetX: tRect.left + tRect.width / 2,
    targetY: tRect.top + tRect.height / 2,
  };
}

interface FlyToCartOverlayProps {
  particles: FlyingCartParticle[];
  onParticleComplete: (id: string) => void;
}

export const FlyToCartOverlay: React.FC<FlyToCartOverlayProps> = ({
  particles,
  onParticleComplete,
}) => {
  if (typeof document === 'undefined' || particles.length === 0) {
    return null;
  }

  return createPortal(
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[140] overflow-hidden"
    >
      <AnimatePresence>
        {particles.map((p) => {
          const dx = p.targetX - p.startX;
          const dy = p.targetY - p.startY;
          const midX = dx * 0.45;
          const midY = Math.min(0, dy * 0.35) - 44;

          return (
            <motion.div
              key={p.id}
              style={{
                left: p.startX - 24,
                top: p.startY - 24,
              }}
              initial={{
                x: 0,
                y: 0,
                scale: 1,
                opacity: 0.96,
              }}
              animate={{
                x: [0, midX, dx],
                y: [0, midY, dy],
                scale: [1, 1.12, 0.34],
                opacity: [0.96, 1, 0.2],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.46,
                times: [0, 0.42, 1],
                ease: [0.22, 1, 0.36, 1],
              }}
              onAnimationComplete={() => onParticleComplete(p.id)}
              className="fixed w-12 h-12 rounded-xl bg-white shadow-xl border-2 border-sky-400 flex items-center justify-center will-change-transform"
            >
              <div className="w-full h-full rounded-[10px] overflow-hidden flex items-center justify-center bg-slate-50">
                {p.imageUrl ? (
                  <img
                    src={p.imageUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center font-black text-sm"
                    style={{
                      backgroundColor: `${p.accentColor}1f`,
                      color: p.accentColor,
                    }}
                  >
                    {p.isService ? (
                      <Wrench className="w-5 h-5" />
                    ) : p.label ? (
                      p.label.charAt(0).toUpperCase()
                    ) : (
                      <Package className="w-5 h-5" />
                    )}
                  </div>
                )}
              </div>
              <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black leading-none shadow-sm border border-white tabular-nums">
                +1
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
};
