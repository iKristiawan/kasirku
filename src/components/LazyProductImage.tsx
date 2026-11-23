import React, { useEffect, useRef, useState } from 'react';

type ObserverCallback = (isNearViewport: boolean, isWithinRetainBounds: boolean) => void;

interface ObservedRecord {
  el: Element;
  callback: ObserverCallback;
  near: boolean;
  retain: boolean;
}

/**
 * Shared singleton IntersectionObserver pool to avoid instantiating hundreds of
 * individual observers when tablet catalogs render large SKU lists.
 */
class SharedImageVisibilityManager {
  private loadObserver: IntersectionObserver | null = null;
  private retainObserver: IntersectionObserver | null = null;
  private records = new Map<Element, ObservedRecord>();

  private ensureObservers() {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      return;
    }

    if (!this.loadObserver) {
      this.loadObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const rec = this.records.get(entry.target);
            if (!rec) return;
            rec.near = entry.isIntersecting;
            if (entry.isIntersecting) {
              rec.retain = true;
            }
            rec.callback(rec.near, rec.retain);
          });
        },
        { root: null, rootMargin: '180px 0px', threshold: 0.01 }
      );
    }

    if (!this.retainObserver) {
      this.retainObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const rec = this.records.get(entry.target);
            if (!rec) return;
            rec.retain = entry.isIntersecting;
            rec.callback(rec.near, rec.retain);
          });
        },
        { root: null, rootMargin: '750px 0px', threshold: 0 }
      );
    }
  }

  observe(el: Element, callback: ObserverCallback): () => void {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      callback(true, true);
      return () => {};
    }

    this.ensureObservers();
    const record: ObservedRecord = {
      el,
      callback,
      near: false,
      retain: true,
    };
    this.records.set(el, record);
    this.loadObserver?.observe(el);
    this.retainObserver?.observe(el);

    return () => {
      this.loadObserver?.unobserve(el);
      this.retainObserver?.unobserve(el);
      this.records.delete(el);
    };
  }
}

const visibilityManager = new SharedImageVisibilityManager();

/**
 * Lightweight bounded in-memory set of image URLs that have finished decoding
 * during this session so scrolling back skips fade skeletons without holding
 * far-offscreen <img> DOM nodes in RAM/GPU memory.
 */
const loadedSrcCache = new Set<string>();
const MAX_CACHE_ENTRIES = 600;

function markSrcLoaded(src: string) {
  if (!src) return;
  if (loadedSrcCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = loadedSrcCache.values().next().value;
    if (firstKey) loadedSrcCache.delete(firstKey);
  }
  loadedSrcCache.add(src);
}

export interface LazyProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  containerClassName?: string;
  fallback: React.ReactNode;
  /**
   * When true, releases the offscreen <img> element once it scrolls >750px away
   * from the tablet viewport to lower decoded GPU/RAM bitmap footprint on very large catalogs.
   */
  unloadFarOffscreen?: boolean;
  /**
   * Optional small static placeholder shown while image bytes are still fetching/decoding.
   */
  placeholderContent?: React.ReactNode;
}

export const LazyProductImage: React.FC<LazyProductImageProps> = ({
  src,
  alt,
  className = 'w-full h-full object-cover',
  containerClassName = 'w-full h-full relative overflow-hidden',
  fallback,
  unloadFarOffscreen = true,
  placeholderContent,
}) => {
  const cleanSrc = (src || '').trim();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const [shouldRenderImg, setShouldRenderImg] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(() =>
    cleanSrc ? loadedSrcCache.has(cleanSrc) : false
  );
  const [hasError, setHasError] = useState<boolean>(false);

  // Reset decode/error flags when src changes; actual <img> mount remains viewport-driven
  useEffect(() => {
    setHasError(false);
    if (!cleanSrc) {
      setShouldRenderImg(false);
      setIsLoaded(false);
      return;
    }
    setIsLoaded(loadedSrcCache.has(cleanSrc));
  }, [cleanSrc]);

  // Attach shared IntersectionObserver
  useEffect(() => {
    const el = wrapperRef.current;
    if (!cleanSrc || !el || hasError) return;

    return visibilityManager.observe(el, (isNear, isWithinRetain) => {
      if (isNear) {
        setShouldRenderImg(true);
      } else if (unloadFarOffscreen && !isWithinRetain) {
        setShouldRenderImg(false);
      }
    });
  }, [cleanSrc, hasError, unloadFarOffscreen]);

  if (!cleanSrc || hasError) {
    return <div className={containerClassName}>{fallback}</div>;
  }

  return (
    <div ref={wrapperRef} className={containerClassName}>
      {(!shouldRenderImg || !isLoaded) && (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-slate-100 flex items-center justify-center"
        >
          {placeholderContent ?? fallback}
        </div>
      )}

      {shouldRenderImg && (
        <img
          src={cleanSrc}
          alt={alt}
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={() => {
            markSrcLoaded(cleanSrc);
            setIsLoaded(true);
          }}
          onError={() => {
            setHasError(true);
            setShouldRenderImg(false);
          }}
          className={`${className} transition-opacity duration-150 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
};
