import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Search, 
  UserPlus, 
  Sparkles, 
  Phone, 
  MessageCircle, 
  MapPin, 
  Check, 
  CreditCard,
  UserCheck,
  QrCode,
  Camera,
  History,
  ShoppingBag,
  Users,
  AlertTriangle,
  Receipt,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { Customer, CustomerCategoryItem, Transaction } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  getCustomerCategoryBadge,
  DEFAULT_CUSTOMER_CATEGORIES,
  isCustomerMember,
  getCustomerMembershipId,
  findCustomerByScanInput,
  buildCustomerQrPayload,
} from '../utils/customerUtils';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  selectedCustomer: Customer | null;
  customerCategories?: CustomerCategoryItem[];
  transactions?: Transaction[];
  onSelectCustomer: (cust: Customer) => void;
  onAddCustomer: (customerData: Omit<Customer, 'id' | 'createdAt' | 'totalPoints' | 'totalDebt'>) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  customers,
  selectedCustomer,
  customerCategories = [],
  transactions = [],
  onSelectCustomer,
  onAddCustomer,
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [activeTab, setActiveTab] = useState<'LIST' | 'RECENT_PURCHASES'>('LIST');
  const [search, setSearch] = useState('');
  const [inspectedCustomerId, setInspectedCustomerId] = useState<string | null>(null);

  // Member QR Scan state
  const [isQrPanelOpen, setIsQrPanelOpen] = useState(false);
  const [qrScanInput, setQrScanInput] = useState('');
  const [qrScanFeedback, setQrScanFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const qrInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isOpenRef = useRef<boolean>(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const categoryOptions = useMemo(() => {
    const fromMaster = (customerCategories || []).map((c) => c.name);
    return Array.from(new Set([...fromMaster, ...DEFAULT_CUSTOMER_CATEGORIES]));
  }, [customerCategories]);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [customerCategory, setCustomerCategory] = useState<string>('REGULER');
  const [isMember, setIsMember] = useState<boolean>(false);
  const [creditLimit, setCreditLimit] = useState('500000');
  const [notes, setNotes] = useState('');

  const stopCamera = () => {
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
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!cameraActive || !cameraStream || !videoRef.current) return;
    const videoEl = videoRef.current;
    videoEl.srcObject = cameraStream;
    const playPromise = videoEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  }, [cameraActive, cameraStream]);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setIsQrPanelOpen(false);
      setQrScanInput('');
      setQrScanFeedback(null);
      return;
    }

    setInspectedCustomerId(selectedCustomer?.id || null);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        sound.playTap();
        stopCamera();
        if (isAddingNew) {
          setIsAddingNew(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAddingNew, onClose, selectedCustomer?.id]);

  // Continuous camera QR / Barcode detection loop when camera is active
  useEffect(() => {
    if (!cameraActive || !cameraStream) return;
    const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
    if (!BarcodeDetectorCtor) return;

    let stopped = false;
    let timerId: number | null = null;
    const detector = new BarcodeDetectorCtor({ formats: ['qr_code', 'code_128', 'ean_13'] });

    const scanFrame = async () => {
      if (stopped || !videoRef.current) return;
      try {
        if (videoRef.current.readyState >= 2) {
          const results = await detector.detect(videoRef.current);
          const raw = results?.[0]?.rawValue?.trim();
          if (raw) {
            const matched = findCustomerByScanInput(raw, customers);
            if (matched) {
              sound.playScanBeep();
              stopCamera();
              onSelectCustomer(matched);
              onClose();
              return;
            }
          }
        }
      } catch {
        // Ignore single-frame detection errors
      }
      if (!stopped) {
        timerId = window.setTimeout(scanFrame, 350);
      }
    };

    timerId = window.setTimeout(scanFrame, 400);
    return () => {
      stopped = true;
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [cameraActive, cameraStream, customers, onSelectCustomer, onClose]);

  // Recent purchases for the inspected or selected customer (last 5 transactions)
  const inspectedCustomer = useMemo(() => {
    if (inspectedCustomerId) {
      return customers.find((c) => c.id === inspectedCustomerId) || selectedCustomer || null;
    }
    return selectedCustomer || null;
  }, [inspectedCustomerId, customers, selectedCustomer]);

  const recentCustomerTransactions = useMemo(() => {
    if (!inspectedCustomer) return [];
    return transactions
      .filter((tx) => tx.customerId === inspectedCustomer.id)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
  }, [inspectedCustomer, transactions]);

  const customerPreferenceSummary = useMemo(() => {
    if (!inspectedCustomer) return null;
    const allCustTxs = transactions.filter((tx) => tx.customerId === inspectedCustomer.id);
    const productFreq = new Map<string, { name: string; unitName: string; totalQty: number; lastPrice: number }>();
    const methodFreq = new Map<string, number>();
    let totalSpent = 0;

    allCustTxs.forEach((tx) => {
      totalSpent += tx.finalAmount;
      methodFreq.set(tx.paymentMethod, (methodFreq.get(tx.paymentMethod) || 0) + 1);
      tx.items.forEach((item) => {
        const key = `${item.productId}_${item.unitName}`;
        const existing = productFreq.get(key);
        if (existing) {
          existing.totalQty += item.quantity;
        } else {
          productFreq.set(key, {
            name: item.productName,
            unitName: item.unitName,
            totalQty: item.quantity,
            lastPrice: item.unitPrice,
          });
        }
      });
    });

    const topItems = Array.from(productFreq.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 3);
    const favoriteMethod = Array.from(methodFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

    return {
      totalVisits: allCustTxs.length,
      totalSpent,
      topItems,
      favoriteMethod,
    };
  }, [inspectedCustomer, transactions]);

  if (!isOpen) return null;

  const filteredCustomers = customers.filter((c) => {
    const q = search.toLowerCase();
    const memberCode = getCustomerMembershipId(c).toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.whatsapp.includes(q) ||
      memberCode.includes(q)
    );
  });

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (sameAsPhone) {
      setWhatsapp(val);
    }
  };

  const handleResolveMemberScan = (rawCode: string) => {
    const trimmed = rawCode.trim();
    if (!trimmed) return;

    const matched = findCustomerByScanInput(trimmed, customers);
    if (matched) {
      sound.playScanBeep();
      setQrScanFeedback({
        type: 'success',
        message: `Member ditemukan: ${matched.name} (${getCustomerMembershipId(matched)})`,
      });
      stopCamera();
      onSelectCustomer(matched);
      onClose();
    } else {
      sound.playError();
      setQrScanFeedback({
        type: 'error',
        message: `QR / ID Member "${trimmed}" tidak ditemukan di data pelanggan.`,
      });
    }
  };

  const handleStartCamera = async () => {
    if (isStartingCamera) return;
    sound.playTap();
    setCameraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Browser atau konteks halaman saat ini tidak mendukung akses kamera. Pastikan halaman berjalan melalui HTTPS dengan izin kamera aktif.');
      setCameraActive(false);
      return;
    }

    setIsStartingCamera(true);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (constraintErr) {
        const errName = (constraintErr as { name?: string })?.name || '';
        if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
          throw constraintErr;
        }
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
      const errName = (err as { name?: string })?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError' || errName === 'SecurityError') {
        setCameraError('Izin akses kamera ditolak. Ketuk ikon gembok/kamera di address bar browser lalu izinkan akses kamera.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setCameraError('Kamera tidak ditemukan pada perangkat ini. Gunakan scanner fisik atau ketik ID Membership.');
      } else {
        setCameraError('Kamera tidak tersedia atau izin ditolak. Gunakan scanner fisik atau ketik ID Membership secara manual.');
      }
      setCameraStream(null);
      setCameraActive(false);
    } finally {
      setIsStartingCamera(false);
    }
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    sound.playSuccessChime();
    onAddCustomer({
      name: name.trim(),
      phone: phone.trim(),
      whatsapp: sameAsPhone ? phone.trim() : (whatsapp.trim() || phone.trim()),
      email: email.trim().toLowerCase() || undefined,
      address: address.trim(),
      customerCategory: customerCategory.trim() || 'REGULER',
      isMember,
      creditLimit: parseFloat(creditLimit) || 0,
      notes: notes.trim(),
    });

    // Reset form
    setName('');
    setPhone('');
    setWhatsapp('');
    setEmail('');
    setAddress('');
    setCustomerCategory('REGULER');
    setIsMember(false);
    setNotes('');
    setIsAddingNew(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0 gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isAddingNew ? 'Daftar Pelanggan Baru' : 'Pilih Pelanggan / Member'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAddingNew
                ? 'Lengkapi data pelanggan, nomor WhatsApp & limit kredit'
                : 'Pilih manual, scan QR Member, atau lihat 5 pembelian terakhir pelanggan'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isAddingNew && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    const next = !isQrPanelOpen;
                    setIsQrPanelOpen(next);
                    setActiveTab('LIST');
                    setQrScanFeedback(null);
                    if (next) {
                      setTimeout(() => qrInputRef.current?.focus(), 80);
                    } else {
                      stopCamera();
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    isQrPanelOpen
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Scan QR Member</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    stopCamera();
                    setIsAddingNew(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Baru</span>
                </button>
              </>
            )}
            <button
              type="button"
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
        </div>

        {/* Navigation Tabs & Search Bar (if not adding new) */}
        {!isAddingNew && (
          <div className="pt-3 pb-1 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setActiveTab('LIST');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'LIST'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-sky-600" />
                  <span>Daftar Pelanggan ({customers.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setActiveTab('RECENT_PURCHASES');
                    if (!inspectedCustomerId && selectedCustomer) {
                      setInspectedCustomerId(selectedCustomer.id);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'RECENT_PURCHASES'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <History className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Recent Purchases</span>
                  {inspectedCustomer && (
                    <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">
                      {recentCustomerTransactions.length}
                    </span>
                  )}
                </button>
              </div>

              {inspectedCustomer && (
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <span>Fokus:</span>
                  <span className="font-bold text-slate-800">{inspectedCustomer.name}</span>
                </div>
              )}
            </div>

            {/* Collapsible QR Member Scanner Panel */}
            {isQrPanelOpen && activeTab === 'LIST' && (
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-950">
                    <QrCode className="w-4 h-4 text-indigo-600" />
                    <span>Scan QR Code Member atau Ketik ID Membership</span>
                  </div>
                  {!cameraActive ? (
                    <button
                      type="button"
                      disabled={isStartingCamera}
                      onClick={handleStartCamera}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isStartingCamera ? 'Mengaktifkan...' : 'Aktifkan Kamera'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        stopCamera();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Matikan Kamera
                    </button>
                  )}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleResolveMemberScan(qrScanInput);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    ref={qrInputRef}
                    type="text"
                    value={qrScanInput}
                    onChange={(e) => setQrScanInput(e.target.value)}
                    placeholder="Arahkan scanner QR member atau ketik ID (contoh: MBR-...) lalu Enter"
                    className="flex-1 px-3 py-2 bg-white border-2 border-indigo-400 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Auto-Pilih
                  </button>
                </form>

                {cameraActive && (
                  <div className="relative h-44 bg-slate-900 rounded-xl overflow-hidden">
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-32 h-32 border-2 border-indigo-400 rounded-xl" />
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="p-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{cameraError}</span>
                  </div>
                )}

                {qrScanFeedback && (
                  <div
                    className={`p-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 ${
                      qrScanFeedback.type === 'success'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}
                  >
                    {qrScanFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>{qrScanFeedback.message}</span>
                  </div>
                )}

                {customers.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-indigo-800">Uji Cepat Scan QR:</span>
                    {customers.slice(0, 3).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleResolveMemberScan(buildCustomerQrPayload(c))}
                        className="px-2 py-0.5 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-[10px] font-mono font-bold text-indigo-800 cursor-pointer"
                      >
                        {c.name.split(' ')[0]} ({getCustomerMembershipId(c)})
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'LIST' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const matched = findCustomerByScanInput(search, customers);
                  if (matched) {
                    sound.playScanBeep();
                    onSelectCustomer(matched);
                    onClose();
                  }
                }}
                className="relative"
              >
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama, no HP, WhatsApp, atau ID Member (scan QR + Enter)..."
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
                />
              </form>
            )}
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-3">
          {isAddingNew ? (
            /* Add Customer Form */
            <form onSubmit={handleSaveCustomer} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nama Lengkap Pelanggan *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Ibu Hj. Marlina"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nomor Handphone (HP) *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="Contoh: 081234567890"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Nomor WhatsApp *
                    </label>
                    <label className="text-[11px] text-slate-500 flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sameAsPhone}
                        onChange={(e) => {
                          setSameAsPhone(e.target.checked);
                          if (e.target.checked) setWhatsapp(phone);
                        }}
                        className="rounded text-sky-600"
                      />
                      <span>Sama dgn HP</span>
                    </label>
                  </div>
                  <input
                    type="tel"
                    required
                    value={sameAsPhone ? phone : whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    disabled={sameAsPhone}
                    placeholder="Contoh: 081234567890"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Alamat Email Pelanggan (Opsional - untuk Struk Email)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Contoh: pelanggan@email.com"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Alamat Lengkap
                </label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Contoh: Jl. Anggrek No. 15, RT 02/04, Kel. Sukamaju"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Kategori Pelanggan */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700">Kategori Pelanggan (Untuk Harga Khusus):</label>
                  <span className="text-[10px] text-slate-400">Pilih klasifikasi</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {categoryOptions.map((cat) => {
                    const isSelected = customerCategory.toUpperCase() === cat.toUpperCase();
                    const badge = getCustomerCategoryBadge(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setCustomerCategory(cat);
                          const upper = cat.toUpperCase();
                          if (upper === 'MEMBER' || upper === 'VIP') {
                            setIsMember(true);
                          } else if (upper === 'UMUM') {
                            setIsMember(false);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                          isSelected
                            ? `${badge.bg} ${badge.text} ${badge.border} ring-2 ring-sky-500 shadow-2xs font-black`
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        <span>{cat}</span>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status Member (Poin Loyalitas) */}
              <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                isMember ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Sparkles className={`w-3.5 h-3.5 ${isMember ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                    <span>Status Member (Berhak Dapat &amp; Tukar Poin)</span>
                  </div>
                  <p className="text-[10.5px] text-slate-500 mt-0.5">
                    {isMember
                      ? 'Aktif: Pelanggan ini akan mendapatkan poin setiap berbelanja.'
                      : 'Non-Member: Pelanggan ini tidak mendapatkan poin saat checkout.'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isMember}
                    onChange={(e) => {
                      sound.playTap();
                      setIsMember(e.target.checked);
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Batas Limit Piutang (Rp)
                  </label>
                  <input
                    type="number"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="500000"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Maksimal tagihan kasbon yang dapat diambil pelanggan
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Catatan Khusus (Opsional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contoh: Tetangga depan toko"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingNew(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20"
                >
                  Simpan &amp; Pilih Pelanggan
                </button>
              </div>
            </form>
          ) : activeTab === 'RECENT_PURCHASES' ? (
            /* Recent Purchases Tab (Last 5 Transactions for Selected / Inspected Customer) */
            <div className="space-y-4">
              {/* Customer Quick Selector inside Recent Purchases Tab */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-700">Lihat 5 Transaksi Terakhir Pelanggan:</div>
                <select
                  value={inspectedCustomer?.id || ''}
                  onChange={(e) => {
                    sound.playTap();
                    setInspectedCustomerId(e.target.value || null);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Pilih Pelanggan --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({getCustomerMembershipId(c)})
                    </option>
                  ))}
                </select>
              </div>

              {!inspectedCustomer ? (
                <div className="py-12 text-center text-slate-400 space-y-2">
                  <History className="w-10 h-10 mx-auto opacity-40" />
                  <p className="text-sm font-bold text-slate-600">Belum Ada Pelanggan Dipilih</p>
                  <p className="text-xs max-w-sm mx-auto">
                    Pilih pelanggan pada dropdown di atas atau klik tombol &quot;Riwayat (5)&quot; pada daftar pelanggan untuk melihat preferensi belanjanya.
                  </p>
                </div>
              ) : (
                <>
                  {/* Customer Profile & Preference Summary */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-sky-50 border border-indigo-200 space-y-3">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-slate-900">{inspectedCustomer.name}</h4>
                          <span className="px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-mono text-[10px] font-bold">
                            {getCustomerMembershipId(inspectedCustomer)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {customerPreferenceSummary?.totalVisits || 0} Total Kunjungan • Total Belanja{' '}
                          <strong className="text-slate-800">
                            {formatRupiah(customerPreferenceSummary?.totalSpent || 0)}
                          </strong>{' '}
                          • Metode Favorit:{' '}
                          <strong className="text-indigo-700">{customerPreferenceSummary?.favoriteMethod}</strong>
                        </p>
                      </div>

                      {selectedCustomer?.id !== inspectedCustomer.id && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            onSelectCustomer(inspectedCustomer);
                            onClose();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-2xs cursor-pointer"
                        >
                          Pilih Untuk Kasir
                        </button>
                      )}
                    </div>

                    {customerPreferenceSummary && customerPreferenceSummary.topItems.length > 0 && (
                      <div className="pt-2 border-t border-indigo-100">
                        <div className="text-[10.5px] font-bold text-indigo-900 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Produk Langganan / Preferensi Utama:</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {customerPreferenceSummary.topItems.map((it, idx) => (
                            <span
                              key={idx}
                              className="px-2.5 py-1 rounded-xl bg-white border border-indigo-200 text-[11px] font-bold text-slate-800 shadow-2xs"
                            >
                              {it.name} <span className="text-indigo-600 font-mono">({formatNumber(it.totalQty)} {it.unitName})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Last 5 Transactions List */}
                  {recentCustomerTransactions.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                      <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs font-bold text-slate-600">Belum Ada Riwayat Pembelian</p>
                      <p className="text-[11px]">Pelanggan ini belum tercatat melakukan transaksi.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>5 Transaksi Terakhir ({recentCustomerTransactions.length})</span>
                        <span className="text-[10.5px] text-slate-400">Diurutkan dari yang paling baru</span>
                      </div>
                      {recentCustomerTransactions.map((tx, idx) => (
                        <div
                          key={tx.id}
                          className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 font-mono text-[10px] font-black flex items-center justify-center shrink-0">
                                #{idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-mono font-bold text-slate-900 truncate">
                                  {tx.invoiceNumber}
                                </div>
                                <div className="text-[10.5px] text-slate-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDateTime(tx.timestamp)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-xs md:text-sm font-black font-mono text-slate-900">
                                {formatRupiah(tx.finalAmount)}
                              </div>
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[9.5px] font-bold">
                                  {String(tx.paymentMethod).replace(/_/g, ' ')}
                                </span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                                    tx.paymentStatus === 'LUNAS'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : 'bg-rose-100 text-rose-700'
                                  }`}
                                >
                                  {tx.paymentStatus}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Itemized list */}
                          <div className="space-y-1">
                            {tx.items.map((item, iIdx) => (
                              <div key={iIdx} className="flex items-center justify-between gap-2 text-[11px] text-slate-700">
                                <span className="truncate">
                                  <strong className="font-mono text-slate-900">{item.quantity}x</strong> {item.productName}{' '}
                                  <span className="text-slate-400">
                                    ({item.unitName}
                                    {item.selectedVariant ? ` • ${item.selectedVariant}` : ''})
                                  </span>
                                </span>
                                <span className="font-mono font-semibold text-slate-800 shrink-0">
                                  {formatRupiah(item.totalAmount ?? item.unitPrice * item.quantity)}
                                </span>
                              </div>
                            ))}
                          </div>

                          {(tx.pointsEarned > 0 || tx.pointsUsed > 0 || tx.notes) && (
                            <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-[10px]">
                              <div className="flex items-center gap-2">
                                {tx.pointsEarned > 0 && (
                                  <span className="text-emerald-700 font-bold">+{tx.pointsEarned} Poin</span>
                                )}
                                {tx.pointsUsed > 0 && (
                                  <span className="text-amber-700 font-bold">Tukar -{tx.pointsUsed} Poin</span>
                                )}
                              </div>
                              {tx.notes && (
                                <span className="text-slate-500 italic truncate max-w-xs">Catatan: {tx.notes}</span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Customer List */
            <div className="space-y-2">
              {filteredCustomers.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <p className="text-sm font-semibold">Tidak ada pelanggan yang cocok</p>
                  <button
                    onClick={() => setIsAddingNew(true)}
                    className="mt-2 text-xs font-bold text-sky-600 hover:underline"
                  >
                    + Daftarkan &quot;{search}&quot; Sebagai Pelanggan Baru
                  </button>
                </div>
              ) : (
                filteredCustomers.map((cust) => {
                  const isSelected = selectedCustomer?.id === cust.id;
                  const custRecentCount = Math.min(
                    5,
                    transactions.filter((tx) => tx.customerId === cust.id).length
                  );
                  return (
                    <div
                      key={cust.id}
                      onClick={() => {
                        sound.playTap();
                        onSelectCustomer(cust);
                        onClose();
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-sky-50/70 border-sky-500 shadow-xs'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                          {cust.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900">{cust.name}</h4>
                            {(() => {
                              const catBadge = getCustomerCategoryBadge(cust.customerCategory);
                              return (
                                <span
                                  className={`inline-flex items-center gap-1 text-[9.5px] font-black px-1.5 py-0.2 rounded border ${catBadge.bg} ${catBadge.text} ${catBadge.border}`}
                                >
                                  <span className={`w-1 h-1 rounded-full ${catBadge.dot}`} />
                                  <span>{catBadge.label}</span>
                                </span>
                              );
                            })()}
                            {isCustomerMember(cust) ? (
                              <span className="inline-flex items-center gap-1 text-[9.5px] font-black px-1.5 py-0.2 rounded border bg-emerald-100 text-emerald-800 border-emerald-300">
                                ⭐ MEMBER
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.2 rounded border bg-slate-100 text-slate-500 border-slate-200">
                                Non-Member
                              </span>
                            )}
                            <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold bg-sky-50 text-sky-700 border border-sky-200">
                              {getCustomerMembershipId(cust)}
                            </span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-600 text-white">
                                Terpilih
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-slate-500 mt-1">
                            <span className="flex items-center gap-1 font-mono">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {cust.phone}
                            </span>
                            {cust.address && (
                              <span className="flex items-center gap-1 truncate max-w-xs">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                {cust.address}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-2 shrink-0">
                        <div>
                          {/* Points badge */}
                          {isCustomerMember(cust) ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold font-mono">
                              <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                              <span>{formatNumber(cust.totalPoints)} Poin</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-semibold">
                              <span>Tanpa Poin</span>
                            </div>
                          )}

                          {cust.totalDebt > 0 && (
                            <div className="text-[11px] text-rose-600 font-bold font-mono mt-0.5">
                              Piutang: {formatRupiah(cust.totalDebt)}
                            </div>
                          )}
                        </div>

                        {/* View Last 5 Purchases Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            sound.playTap();
                            setInspectedCustomerId(cust.id);
                            setActiveTab('RECENT_PURCHASES');
                          }}
                          title="Lihat 5 Pembelian Terakhir (Recent Purchases)"
                          className="px-2 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10.5px] font-bold flex items-center gap-1 transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>{custRecentCount > 0 ? `${custRecentCount}x` : 'Riwayat'}</span>
                        </button>

                        {/* WhatsApp Link */}
                        <a
                          href={formatWhatsAppUrl(
                            cust.whatsapp || cust.phone,
                            `Halo ${cust.name}, kami dari toko ingin mengonfirmasi terkait saldo poin Anda saat ini: ${cust.totalPoints} poin.`
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            sound.playTap();
                          }}
                          title="Chat via WhatsApp"
                          className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

