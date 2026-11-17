import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  Barcode, 
  Camera, 
  Zap,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  PackageSearch,
  ShoppingCart,
  UserCheck,
  Layers,
  RefreshCw,
  VideoOff,
  Loader2
} from 'lucide-react';
import { Product, ProductUnit, Customer } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { findCustomerByScanInput, getCustomerMembershipId, buildCustomerQrPayload } from '../utils/customerUtils';

export type ScannerModalMode = 'SCAN' | 'STOCK_LOOKUP' | 'MEMBER_QR';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onBarcodeScanned: (barcode: string) => void;
  customers?: Customer[];
  onSelectCustomer?: (cust: Customer) => void;
  onAddToCartFromLookup?: (product: Product, unit: ProductUnit, qty?: number, selectedVariant?: string) => void;
  initialMode?: ScannerModalMode;
}

const findProductByCodeInput = (rawInput: string, products: Product[]): { product: Product; unit: ProductUnit; variantName?: string } | null => {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  let codeToMatch = trimmed;
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { type?: string; sku?: string; barcode?: string; productId?: string };
      if (parsed.type === 'KASIRKU_PRODUCT') {
        if (parsed.productId) {
          const byId = products.find((p) => p.id === parsed.productId);
          if (byId && byId.units?.[0]) {
            return { product: byId, unit: byId.units[0] };
          }
        }
        codeToMatch = parsed.sku || parsed.barcode || trimmed;
      }
    } catch {
      // Fall through to raw string comparison
    }
  }

  const lower = codeToMatch.toLowerCase();
  for (const product of products) {
    if (
      product.barcode.toLowerCase() === lower ||
      (product.sku && product.sku.toLowerCase() === lower)
    ) {
      return { product, unit: product.units[0] };
    }
    for (const unit of product.units) {
      if (unit.barcode && unit.barcode.toLowerCase() === lower) {
        return { product, unit };
      }
    }
    if (product.variants) {
      for (const variant of product.variants) {
        if (
          (variant.barcode && variant.barcode.toLowerCase() === lower) ||
          (variant.sku && variant.sku.toLowerCase() === lower)
        ) {
          return { product, unit: product.units[0], variantName: variant.name };
        }
      }
    }
  }
  return null;
};

const getCameraErrorMessage = (err: unknown): string => {
  const name = (err as { name?: string })?.name || '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Izin akses kamera ditolak. Ketuk ikon gembok/kamera di sebelah URL browser lalu pilih "Izinkan Kamera", atau gunakan scanner USB/Bluetooth.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Kamera tidak ditemukan pada perangkat ini. Gunakan scanner fisik USB/Bluetooth atau simulasi di bawah.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi kamera lain terlebih dahulu lalu coba lagi.';
  }
  return 'Kamera tidak dapat diakses. Pastikan halaman diakses melalui HTTPS dan izin kamera browser telah aktif.';
};

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onBarcodeScanned,
  customers = [],
  onSelectCustomer,
  onAddToCartFromLookup,
  initialMode = 'SCAN',
}) => {
  const [mode, setMode] = useState<ScannerModalMode>(initialMode);
  const [manualInput, setManualInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [videoAspectRatio, setVideoAspectRatio] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{
    product: Product;
    unit: ProductUnit;
    variantName?: string;
  } | null>(null);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const supportsBarcodeDetector =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector === 'function';

  const syncVideoAspectRatio = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const { videoWidth, videoHeight } = videoEl;
    if (videoWidth > 0 && videoHeight > 0) {
      setVideoAspectRatio(videoWidth / videoHeight);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      const currentSrc = videoRef.current.srcObject as MediaStream | null;
      if (currentSrc) {
        currentSrc.getTracks().forEach((t) => t.stop());
      }
      videoRef.current.srcObject = null;
    }
    setCameraStream(null);
    setCameraActive(false);
    setIsStartingCamera(false);
    setVideoAspectRatio(null);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setManualInput('');
      setCameraError(null);
      setLookupResult(null);
      setScanFeedback(null);
      const focusTimer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 150);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          sound.playTap();
          stopCamera();
          onClose();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.clearTimeout(focusTimer);
        window.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      stopCamera();
    }
  }, [isOpen, onClose, initialMode, stopCamera]);

  // Cleanup camera stream cleanly on component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Attach acquired MediaStream once the <video> element mounts into DOM
  useEffect(() => {
    if (!cameraActive || !cameraStream || !videoRef.current) return;
    const videoEl = videoRef.current;
    videoEl.srcObject = cameraStream;
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Ignore autoplay promise rejection if already playing
      });
    }
    syncVideoAspectRatio();
  }, [cameraActive, cameraStream, syncVideoAspectRatio]);

  const handleResolvedCode = useCallback((rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;

    // 1. Check customer QR / membership ID if in MEMBER_QR mode or if payload clearly matches a customer
    if (customers.length > 0 && onSelectCustomer) {
      const matchedCust = findCustomerByScanInput(trimmed, customers);
      if (matchedCust && (mode === 'MEMBER_QR' || trimmed.startsWith('{') || trimmed.toUpperCase().startsWith('MBR-'))) {
        sound.playScanBeep();
        stopCamera();
        onSelectCustomer(matchedCust);
        onClose();
        return;
      }
      if (mode === 'MEMBER_QR') {
        sound.playError();
        setScanFeedback({
          type: 'error',
          text: `ID / QR Member "${trimmed}" tidak ditemukan di database pelanggan.`,
        });
        return;
      }
    }

    // 2. If in STOCK_LOOKUP mode, inspect SKU / QR product without closing
    if (mode === 'STOCK_LOOKUP') {
      const found = findProductByCodeInput(trimmed, products);
      if (found) {
        sound.playScanBeep();
        setLookupResult(found);
        setScanFeedback({
          type: 'success',
          text: `Ditemukan: ${found.product.name} (${found.product.sku || found.product.barcode})`,
        });
      } else {
        sound.playError();
        setLookupResult(null);
        setScanFeedback({
          type: 'error',
          text: `SKU / QR / Barcode "${trimmed}" tidak ditemukan.`,
        });
      }
      return;
    }

    // 3. Default SCAN mode
    sound.playScanBeep();
    stopCamera();
    onBarcodeScanned(trimmed);
    onClose();
  }, [customers, onSelectCustomer, mode, stopCamera, onClose, products, onBarcodeScanned]);

  const handleResolvedCodeRef = useRef(handleResolvedCode);
  useEffect(() => {
    handleResolvedCodeRef.current = handleResolvedCode;
  }, [handleResolvedCode]);

  // Native BarcodeDetector frame loop when camera is active
  useEffect(() => {
    if (!cameraActive || !cameraStream) return;
    const BarcodeDetectorCtor = (window as unknown as {
      BarcodeDetector?: new (opts?: { formats?: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
      };
    }).BarcodeDetector;
    if (!BarcodeDetectorCtor) return;

    let cancelled = false;
    let timerId: number | null = null;
    const detector = new BarcodeDetectorCtor({
      formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'],
    });

    const detectLoop = async () => {
      if (cancelled) return;
      const videoEl = videoRef.current;
      try {
        if (videoEl && videoEl.readyState >= 2 && !videoEl.paused) {
          const hits = await detector.detect(videoEl);
          const raw = hits?.[0]?.rawValue?.trim();
          if (raw) {
            handleResolvedCodeRef.current(raw);
            if (mode !== 'STOCK_LOOKUP') return;
          }
        }
      } catch {
        // Ignore single-frame failures
      }
      if (!cancelled) {
        timerId = window.setTimeout(detectLoop, 380);
      }
    };

    timerId = window.setTimeout(detectLoop, 450);
    return () => {
      cancelled = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [cameraActive, cameraStream, mode]);

  const startCamera = async (facingOverride?: 'environment' | 'user') => {
    if (isStartingCamera) return;
    sound.playTap();
    setCameraError(null);
    setVideoAspectRatio(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Browser atau konteks halaman saat ini tidak mendukung akses kamera. Pastikan halaman berjalan melalui HTTPS dengan izin kamera aktif.');
      setCameraActive(false);
      return;
    }

    const targetFacing = facingOverride || facingMode;
    setIsStartingCamera(true);

    // Release any existing stream before opening a fresh camera track
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: targetFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch (constraintErr) {
        const errName = (constraintErr as { name?: string })?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
          throw constraintErr;
        }
        // Fallback for devices without facingMode or resolution metadata
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      if (!isOpenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setCameraStream(stream);
      setCameraActive(true);
    } catch (err) {
      setCameraError(getCameraErrorMessage(err));
      setCameraStream(null);
      setCameraActive(false);
    } finally {
      setIsStartingCamera(false);
    }
  };

  const handleToggleFacing = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleResolvedCode(manualInput.trim());
  };

  const showAdvancedModes = Boolean(onAddToCartFromLookup || (customers.length > 0 && onSelectCustomer));

  // Clamp measured stream aspect ratio safely so portrait (3:4 / 9:16), square (1:1),
  // and widescreen (16:9) cameras all frame naturally inside the modal without stretching or overflow.
  const clampedStreamAspect = videoAspectRatio
    ? Math.min(Math.max(videoAspectRatio, 0.72), 1.85)
    : 4 / 3;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 md:p-6 select-none">
      <div className="bg-white rounded-3xl w-full max-w-xl md:max-w-3xl lg:max-w-4xl shadow-2xl border border-slate-200 overflow-hidden max-h-[92dvh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3.5 sm:px-6 sm:py-4 border-b border-slate-100 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-xl shrink-0 ${
              mode === 'STOCK_LOOKUP'
                ? 'bg-emerald-100 text-emerald-700'
                : mode === 'MEMBER_QR'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-sky-100 text-sky-700'
            }`}>
              {mode === 'STOCK_LOOKUP' ? (
                <PackageSearch className="w-5 h-5" />
              ) : mode === 'MEMBER_QR' ? (
                <QrCode className="w-5 h-5" />
              ) : (
                <Barcode className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {mode === 'STOCK_LOOKUP'
                  ? 'Cek Stok via Scan QR SKU / Barcode'
                  : mode === 'MEMBER_QR'
                  ? 'Scan QR Member Pelanggan'
                  : 'Scan Barcode & QR Code'}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 truncate">
                Scanner USB/Bluetooth · Kamera tablet (QR &amp; Barcode) · Simulasi cepat
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              stopCamera();
              onClose();
            }}
            className="flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer shrink-0 transition-colors"
            title="Tutup (Esc)"
          >
            <kbd className="hidden sm:inline-block text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">Esc</kbd>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs (if used in POS) */}
        {showAdvancedModes && (
          <div className="px-4 pt-3 sm:px-6 shrink-0">
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMode('SCAN');
                  setScanFeedback(null);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className={`min-h-[40px] py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'SCAN'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white/70'
                }`}
              >
                <Barcode className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Scan Keranjang</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setMode('STOCK_LOOKUP');
                  setScanFeedback(null);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
                className={`min-h-[40px] py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'STOCK_LOOKUP'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-white/70'
                }`}
              >
                <PackageSearch className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Cek Stok SKU</span>
              </button>

              {customers.length > 0 && onSelectCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setMode('MEMBER_QR');
                    setScanFeedback(null);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  className={`min-h-[40px] py-2 px-2.5 rounded-xl text-[11px] sm:text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    mode === 'MEMBER_QR'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-white/70'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">QR Member</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Adaptive Modal Body: Single Column on Phone, Balanced 2-Column on Tablet+ */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-5 items-start">
            {/* Primary Left Column (Tablet+): Aspect-Aware Camera Viewfinder */}
            <div className="md:col-span-7 space-y-3">
              <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden relative w-full flex items-center justify-center">
                {cameraActive ? (
                  <div
                    className="relative w-full max-h-[44dvh] md:max-h-[400px] min-h-[220px] flex items-center justify-center bg-slate-950 overflow-hidden mx-auto"
                    style={{ aspectRatio: String(clampedStreamAspect) }}
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={syncVideoAspectRatio}
                      onResize={syncVideoAspectRatio}
                      className={`w-full h-full object-contain ${
                        facingMode === 'user' ? 'scale-x-[-1]' : ''
                      }`}
                    />

                    {/* Top Camera Controls */}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 z-10">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-950/80 text-white text-[10.5px] font-semibold backdrop-blur-xs flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                        <span className="truncate">
                          {supportsBarcodeDetector
                            ? 'Auto-Scan Aktif'
                            : 'Kamera Aktif (Manual/USB)'}
                        </span>
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleToggleFacing}
                          disabled={isStartingCamera}
                          className="px-2.5 py-1.5 min-h-[34px] rounded-lg bg-slate-950/80 hover:bg-slate-800 text-white text-[11px] font-bold backdrop-blur-xs flex items-center gap-1.5 cursor-pointer"
                          title="Ganti Kamera Depan / Belakang"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isStartingCamera ? 'animate-spin' : ''}`} />
                          <span>Putar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            stopCamera();
                          }}
                          className="px-2.5 py-1.5 min-h-[34px] rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-[11px] font-bold backdrop-blur-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <VideoOff className="w-3.5 h-3.5" />
                          <span>Matikan</span>
                        </button>
                      </div>
                    </div>

                    {/* Aspect-Proportional Targeting Reticle */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-6">
                      <div
                        className={`w-[70%] border-2 border-sky-400 rounded-2xl relative shadow-[0_0_0_9999px_rgba(2,6,23,0.38)] ${
                          mode === 'MEMBER_QR'
                            ? 'max-w-[180px] aspect-square'
                            : 'max-w-[240px] aspect-[16/10]'
                        }`}
                      >
                        <div className="absolute top-1/2 left-1.5 right-1.5 h-0.5 bg-rose-500 animate-pulse" />
                      </div>
                    </div>

                    <div className="absolute bottom-2.5 inset-x-3 text-center pointer-events-none">
                      <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-950/80 text-slate-200 text-[10.5px] font-medium">
                        Posisikan Barcode atau QR Code di dalam bingkai
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-400 w-full min-h-[200px] md:min-h-[300px] flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-3 text-slate-300">
                      <Camera className="w-6 h-6" />
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-slate-200">
                      {isStartingCamera ? 'Menghubungkan ke kamera perangkat...' : 'Kamera tablet belum aktif'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                      Aktifkan kamera untuk memindai barcode kemasan atau QR code langsung dari layar tablet.
                    </p>
                    <button
                      type="button"
                      disabled={isStartingCamera}
                      onClick={() => startCamera()}
                      className="mt-4 min-h-[44px] px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs sm:text-sm font-bold transition-colors inline-flex items-center gap-2 cursor-pointer"
                    >
                      {isStartingCamera ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Mengaktifkan Kamera...</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" />
                          <span>Aktifkan Kamera Tablet</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>

            {/* Right Column (Tablet+): Manual / Handheld Input, Stock Result & Quick Simulation */}
            <div className="md:col-span-5 space-y-3.5 min-w-0">
              {/* Input Barcode / QR (Handheld Gun / Keyboard) */}
              <div>
                <form onSubmit={handleManualSubmit} className="relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder={
                      mode === 'MEMBER_QR'
                        ? 'Scan QR Member / ID (MBR-...)...'
                        : mode === 'STOCK_LOOKUP'
                        ? 'Scan QR SKU / ketik SKU...'
                        : 'Scan tembak / ketik SKU / Barcode...'
                    }
                    className="w-full min-h-[46px] pl-3.5 pr-28 py-2.5 bg-slate-50 border-2 border-sky-600 rounded-2xl text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:bg-white"
                  />
                  <button
                    type="submit"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[34px] px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    {mode === 'STOCK_LOOKUP' ? 'Cek Stok' : mode === 'MEMBER_QR' ? 'Pilih' : 'Cari & Masuk'}
                  </button>
                </form>
                <p className="text-[11px] text-slate-400 mt-1.5 pl-0.5">
                  Scanner fisik USB/Bluetooth otomatis menekan Enter setelah scan.
                </p>
              </div>

              {scanFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    scanFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border border-rose-200 text-rose-800'
                  }`}
                >
                  {scanFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                  )}
                  <span className="min-w-0 break-words">{scanFeedback.text}</span>
                </div>
              )}

              {/* Live Stock Lookup Card (only shown in STOCK_LOOKUP mode) */}
              {mode === 'STOCK_LOOKUP' && lookupResult && (
                <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-300 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono font-semibold text-slate-500 truncate">
                        {lookupResult.product.sku || lookupResult.product.barcode} · {lookupResult.product.category}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                        {lookupResult.product.name}
                        {lookupResult.variantName ? ` (${lookupResult.variantName})` : ''}
                      </h4>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-[10px] font-semibold text-slate-500">Total Stok</div>
                      <div
                        className={`text-base font-black font-mono tabular-nums ${
                          lookupResult.product.stockInBaseUnit <= 0
                            ? 'text-rose-600'
                            : lookupResult.product.stockInBaseUnit <= lookupResult.product.minStockAlert
                            ? 'text-amber-600'
                            : 'text-emerald-700'
                        }`}
                      >
                        {formatNumber(lookupResult.product.stockInBaseUnit)} {lookupResult.product.baseUnit}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono tabular-nums">
                        Min: {formatNumber(lookupResult.product.minStockAlert)}
                      </div>
                    </div>
                  </div>

                  {/* Multi-unit conversion & price table */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-2">
                    {lookupResult.product.units.map((u, uIdx) => {
                      const stockInUnit = Math.floor(
                        lookupResult.product.stockInBaseUnit / Math.max(1, u.conversionFactor || 1)
                      );
                      return (
                        <div
                          key={uIdx}
                          className="p-2.5 rounded-xl bg-white border border-emerald-200 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 flex items-center gap-1">
                              <Layers className="w-3 h-3 text-sky-600 shrink-0" />
                              <span className="truncate">{u.unitName}</span>
                              {u.conversionFactor > 1 && (
                                <span className="text-[10px] text-slate-400">(isi {u.conversionFactor})</span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono font-bold text-sky-700 mt-0.5 tabular-nums">
                              {formatRupiah(u.sellingPrice)}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-mono font-bold text-slate-700 tabular-nums">
                              {formatNumber(stockInUnit)} {u.unitName}
                            </span>
                            {onAddToCartFromLookup && (
                              <button
                                type="button"
                                disabled={lookupResult.product.productType !== 'JASA' && stockInUnit <= 0}
                                onClick={() => {
                                  sound.playTap();
                                  onAddToCartFromLookup(lookupResult.product, u, 1, lookupResult.variantName);
                                  onClose();
                                }}
                                className="p-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white cursor-pointer"
                                title="Tambahkan ke Keranjang Kasir"
                              >
                                <ShoppingCart className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Preset Simulators for instant testing */}
              <div className="pt-3 border-t border-slate-100">
                {mode === 'MEMBER_QR' && customers.length > 0 ? (
                  <>
                    <div className="text-[11px] font-bold text-indigo-700 mb-2 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>Simulasi Cepat Scan QR Member</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-2 max-h-44 md:max-h-52 overflow-y-auto no-scrollbar">
                      {customers.slice(0, 6).map((cust) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => handleResolvedCode(buildCustomerQrPayload(cust))}
                          className="min-h-[50px] p-2.5 rounded-xl bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200 text-left transition-colors flex flex-col justify-between cursor-pointer"
                        >
                          <span className="text-xs font-bold text-slate-900 truncate block">
                            {cust.name}
                          </span>
                          <span className="text-[10px] text-indigo-700 font-mono font-bold tabular-nums">
                            {getCustomerMembershipId(cust)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[11px] font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>
                        {mode === 'STOCK_LOOKUP'
                          ? 'Simulasi Cepat Cek Stok QR SKU'
                          : 'Simulasi Cepat Barcode / QR SKU'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-1 lg:grid-cols-2 gap-2 max-h-44 md:max-h-52 overflow-y-auto no-scrollbar">
                      {products.slice(0, 6).map((prod) => (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => handleResolvedCode(prod.sku || prod.barcode)}
                          className="min-h-[50px] p-2.5 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-400 text-left transition-colors flex flex-col justify-between cursor-pointer"
                        >
                          <span className="text-xs font-bold text-slate-800 truncate block">
                            {prod.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono tabular-nums truncate">
                            {prod.sku || prod.barcode} · Stok: {formatNumber(prod.stockInBaseUnit)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
