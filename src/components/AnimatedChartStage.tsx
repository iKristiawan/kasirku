import React, { useEffect, useRef, useState } from 'react';

interface AnimatedChartStageProps {
  /** Key representing active filters / view modes / dataset inputs so changes trigger a smooth glide transition without unmounting ResponsiveContainer */
  filterKey: string;
  /** Optional accent color for the brief top hairline refresh bar */
  accent?: 'sky' | 'emerald' | 'indigo' | 'amber';
  /** Optional initial mount stagger delay in ms */
  delayMs?: number;
  className?: string;
  children: React.ReactNode;
}

const ACCENT_GRADIENT: Record<NonNullable<AnimatedChartStageProps['accent']>, string> = {
  sky: 'from-sky-400 via-cyan-500 to-indigo-500',
  emerald: 'from-emerald-400 via-teal-500 to-sky-500',
  indigo: 'from-indigo-400 via-sky-500 to-emerald-400',
  amber: 'from-amber-400 via-orange-500 to-rose-400',
};

export const AnimatedChartStage: React.FC<AnimatedChartStageProps> = ({
  filterKey,
  accent = 'sky',
  delayMs = 0,
  className = '',
  children,
}) => {
  const prevFilterKeyRef = useRef<string>(filterKey);
  const [transitionCycle, setTransitionCycle] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setTransitionCycle((c) => c + 1);
      setIsRefreshing(true);
      const timer = window.setTimeout(() => {
        setIsRefreshing(false);
      }, 360);
      return () => window.clearTimeout(timer);
    }
  }, [filterKey]);

  const animClass =
    transitionCycle === 0
      ? 'animate-dashboard-enter'
      : isRefreshing
      ? 'animate-chart-filter'
      : '';

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {isRefreshing && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 right-0 h-0.5 z-20 overflow-hidden rounded-full bg-slate-100/70"
        >
          <div
            key={`sweep-${transitionCycle}`}
            className={`h-full w-2/3 bg-gradient-to-r ${ACCENT_GRADIENT[accent]} animate-chart-sweep rounded-full`}
          />
        </div>
      )}

      <div
        className={`w-full h-full ${animClass}`}
        style={
          transitionCycle === 0 && delayMs > 0
            ? { animationDelay: `${delayMs}ms` }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
};
