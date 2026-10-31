import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Barcode, 
  Camera, 
  Search, 
  Zap,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Product } from '../types/pos';
import { sound } from '../utils/audio';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onBarcodeScanned: (barcode: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onBarcodeScanned,
}) => {
  const [manualInput, setManualInput] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setManualInput('');
      setCameraError(null);
      // Auto-focus input for physical USB/Bluetooth handheld barcode scanner
      setTimeout(() => {
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
      return () => window.removeEventListener('keydown', handleKeyDown);
    } else {
      stopCamera();
    }
  }, [isOpen, onClose]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch {
      setCameraError('Kamera tidak dapat diakses atau izin ditolak. Anda tetap bisa scan dengan barcode scanner fisik atau tombol simulasi di bawah.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    sound.playScanBeep();
    onBarcodeScanned(manualInput.trim());
    onClose();
  };

  const handleSimulateScan = (code: string) => {
    sound.playScanBeep();
    onBarcodeScanned(code);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none">
      <div className="bg-white rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-sky-100 text-sky-700">
              <Barcode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Scan Barcode Produk</h3>
              <p className="text-[11px] text-slate-400">
                Mendukung scanner fisik USB/Bluetooth, kamera tablet, atau simulasi
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playTap();
              stopCamera();
              onClose();
            }}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs font-semibold"
            title="Tutup (Esc)"
          >
            <kbd className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200">Esc</kbd>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Input Barcode (Handheld Gun / Keyboard) */}
        <div className="mt-4">
          <form onSubmit={handleManualSubmit} className="relative">
            <input
              ref={inputRef}
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="Arahkan scanner tembak atau ketik barcode..."
              className="w-full pl-4 pr-24 py-3 bg-slate-50 border-2 border-sky-600 rounded-2xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:bg-white"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-colors"
            >
              Cari & Masuk
            </button>
          </form>
          <p className="text-[10px] text-slate-400 mt-1 pl-1">
            * Scanner gun otomatis menekan tombol Enter setelah membaca barcode.
          </p>
        </div>

        {/* Camera Scanner View */}
        <div className="mt-4 bg-slate-900 rounded-2xl overflow-hidden relative min-h-[160px] flex items-center justify-center">
          {cameraActive ? (
            <div className="relative w-full h-[180px]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {/* Aiming Reticle */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-24 border-2 border-sky-400 rounded-lg relative">
                  <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-rose-500 animate-pulse"></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-slate-400">
              <Camera className="w-8 h-8 mx-auto mb-2 opacity-60" />
              <p className="text-xs">Kamera tablet belum aktif</p>
              <button
                type="button"
                onClick={startCamera}
                className="mt-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold border border-slate-700 transition-colors"
              >
                Aktifkan Kamera Tablet
              </button>
            </div>
          )}
        </div>

        {cameraError && (
          <div className="mt-2 p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{cameraError}</span>
          </div>
        )}

        {/* Preset Simulators for instant testing */}
        <div className="mt-4 pt-3 border-t border-slate-100">
          <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span>Simulasi Cepat Barcode Barang Toko:</span>
          </div>

          <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto no-scrollbar">
            {products.slice(0, 6).map((prod) => (
              <button
                key={prod.id}
                type="button"
                onClick={() => handleSimulateScan(prod.barcode)}
                className="p-2 rounded-xl bg-slate-50 hover:bg-sky-50 border border-slate-200 hover:border-sky-400 text-left transition-colors flex flex-col justify-between"
              >
                <span className="text-xs font-bold text-slate-800 truncate block">
                  {prod.name}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {prod.barcode}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
