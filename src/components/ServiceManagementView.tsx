import React, { useState, useMemo, useRef } from 'react';
import { 
  Wrench, 
  Plus, 
  Search, 
  Clock, 
  User, 
  DollarSign, 
  Sparkles, 
  Scissors, 
  Car, 
  Laptop, 
  Shirt, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  ShoppingCart, 
  Tag, 
  Camera, 
  Upload, 
  FileText, 
  Layers, 
  Sliders, 
  Info,
  TrendingUp,
  Percent,
  Check,
  Zap,
  Bookmark,
  Users
} from 'lucide-react';
import { Product, ProductCategory, ProductUnit, UserRole, Transaction, User as PosUser, CustomerSpecialPrice, CustomerCategoryItem } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getCategoryColor } from '../utils/categoryColors';
import { deleteDocumentFromFirestore } from '../utils/firebaseSync';
import { getCustomerCategoryBadge, DEFAULT_CUSTOMER_CATEGORIES } from '../utils/customerUtils';

interface ServiceManagementViewProps {
  products: Product[];
  categories: ProductCategory[];
  customerCategories?: CustomerCategoryItem[];
  currentUserRole: UserRole;
  transactions?: Transaction[];
  users?: PosUser[];
  onAddService: (service: Omit<Product, 'id'>) => void;
  onUpdateService: (service: Product) => void;
  onDeleteService: (serviceId: string) => void;
  onAddCategory?: (category: Omit<ProductCategory, 'id'>) => ProductCategory;
  onNavigateToPOS?: (serviceId?: string) => void;
}

// Preset Quick Industry Templates for 1-Click Fast Creation
const SERVICE_TEMPLATES = [
  {
    category: 'Otomotif & Bengkel',
    name: 'Jasa Ganti Oli Mesin + Pengecekan Ringan',
    baseUnit: 'KENDARAAN',
    sellingPrice: 35000,
    costPrice: 10000,
    durationMinutes: 20,
    technician: 'Mekanik Bengkel',
    notes: 'Termasuk cek tekanan angin ban, kampas rem, dan level air radiator.',
  },
  {
    category: 'Otomotif & Bengkel',
    name: 'Jasa Tune Up & Gurah Mesin Injeksi',
    baseUnit: 'KENDARAAN',
    sellingPrice: 150000,
    costPrice: 50000,
    durationMinutes: 60,
    technician: 'Mekanik Senior',
    notes: 'Pembersihan throttle body, busi, dan injektor mesin.',
  },
  {
    category: 'Salon & Barbershop',
    name: 'Jasa Potong Rambut Pria + Cuci & Styling',
    baseUnit: 'ORANG',
    sellingPrice: 45000,
    costPrice: 15000,
    durationMinutes: 30,
    technician: 'Kapster / Stylist',
    notes: 'Termasuk handuk hangat, pijat leher ringan, dan pomade styling.',
  },
  {
    category: 'Salon & Barbershop',
    name: 'Creambath Tradisional + Pijat Refleksi',
    baseUnit: 'SESI',
    sellingPrice: 85000,
    costPrice: 25000,
    durationMinutes: 50,
    technician: 'Terapis Salon',
    notes: 'Pilihan krim lidah buaya / alpukat + hair tonic.',
  },
  {
    category: 'Elektronik & Gadget',
    name: 'Instal Ulang OS Windows + Software Standar',
    baseUnit: 'UNIT',
    sellingPrice: 100000,
    costPrice: 20000,
    durationMinutes: 60,
    technician: 'Teknisi IT',
    notes: 'Windows 11 / 10 original driver + Office + Antivirus + Browser.',
  },
  {
    category: 'Elektronik & Gadget',
    name: 'Ganti Thermal Paste Laptop & Deep Clean Kipas',
    baseUnit: 'UNIT',
    sellingPrice: 75000,
    costPrice: 15000,
    durationMinutes: 40,
    technician: 'Teknisi IT',
    notes: 'Thermal paste Arctic MX-4 / sekelasnya + pembersihan debu heatsink.',
  },
  {
    category: 'Cuci & Laundry',
    name: 'Cuci Sepatu Deep Clean + Anti-Bacterial',
    baseUnit: 'PASANG',
    sellingPrice: 45000,
    costPrice: 10000,
    durationMinutes: 30,
    technician: 'Petugas Laundry',
    notes: 'Pembersihan upper, midsole, outsole + pewangi anti jamur.',
  },
  {
    category: 'Perbaikan Rumah & AC',
    name: 'Cuci Servis AC Split (1/2 - 1 PK)',
    baseUnit: 'UNIT',
    sellingPrice: 75000,
    costPrice: 20000,
    durationMinutes: 45,
    technician: 'Teknisi AC',
    notes: 'Pembersihan evaporator indoor & outdoor + cek freon pipa.',
  },
];

export const ServiceManagementView: React.FC<ServiceManagementViewProps> = ({
  products,
  categories,
  customerCategories = [],
  currentUserRole,
  transactions = [],
  users = [],
  onAddService,
  onUpdateService,
  onDeleteService,
  onAddCategory,
  onNavigateToPOS,
}) => {
  // Available customer categories
  const availableCategoryNames = useMemo(() => {
    if (customerCategories && customerCategories.length > 0) {
      return customerCategories.map((c) => c.name);
    }
    return DEFAULT_CUSTOMER_CATEGORIES;
  }, [customerCategories]);

  // Filter products whose productType === 'JASA'
  const serviceItems = useMemo(() => {
    return products.filter((p) => p.productType === 'JASA');
  }, [products]);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('SEMUA');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Product | null>(null);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState<Product | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('Layanan Jasa');
  const [baseUnit, setBaseUnit] = useState('SESI');
  const [sellingPrice, setSellingPrice] = useState('50000');
  const [costPrice, setCostPrice] = useState('15000'); // Komisi teknisi / biaya bahan
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [technicianName, setTechnicianName] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  // Multi-tier package options (units in POS)
  const [units, setUnits] = useState<ProductUnit[]>([
    { id: 'u_1', unitName: 'SESI STANDAR', conversionFactor: 1, sellingPrice: 50000, costPrice: 15000 },
  ]);

  // Tarif Khusus Pelanggan
  const [customerPrices, setCustomerPrices] = useState<CustomerSpecialPrice[]>([]);

  // Camera capture states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Categories list tailored for services
  const serviceCategories = useMemo(() => {
    const fromProps = categories.map((c) => c.name);
    const defaults = [
      'Layanan Jasa',
      'Servis & Reparasi',
      'Otomotif & Bengkel',
      'Salon & Barbershop',
      'Cuci & Laundry',
      'Elektronik & Gadget',
      'Perbaikan Rumah & AC',
      'Konsultasi',
    ];
    return Array.from(new Set([...defaults, ...fromProps]));
  }, [categories]);

  // Analytics computation
  const stats = useMemo(() => {
    const totalCount = serviceItems.length;
    const avgDuration = totalCount > 0 
      ? Math.round(serviceItems.reduce((sum, s) => sum + (s.serviceDurationMinutes || 0), 0) / totalCount)
      : 0;

    // Calculate revenue from transactions containing services
    let totalServiceTx = 0;
    let totalServiceRevenue = 0;
    const serviceIds = new Set(serviceItems.map((s) => s.id));

    transactions.forEach((tx) => {
      let hasService = false;
      tx.items.forEach((item) => {
        if (serviceIds.has(item.productId)) {
          hasService = true;
          totalServiceRevenue += item.totalAmount || (item.unitPrice * item.quantity);
        }
      });
      if (hasService) totalServiceTx++;
    });

    return { totalCount, avgDuration, totalServiceTx, totalServiceRevenue };
  }, [serviceItems, transactions]);

  // Filtered services
  const filteredServices = useMemo(() => {
    return serviceItems.filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.barcode.toLowerCase().includes(search.toLowerCase()) ||
        (s.technicianName && s.technicianName.toLowerCase().includes(search.toLowerCase()));

      const matchCat = selectedCategory === 'SEMUA' || s.category.toLowerCase() === selectedCategory.toLowerCase();

      return matchSearch && matchCat;
    });
  }, [serviceItems, search, selectedCategory]);

  // Open modal for new service
  const handleOpenNewServiceModal = () => {
    sound.playTap();
    setEditingService(null);
    setName('');
    const randomCode = 'JSA-' + Math.floor(1000 + Math.random() * 9000);
    setBarcode(randomCode);
    setCategory('Layanan Jasa');
    setBaseUnit('SESI');
    setSellingPrice('50000');
    setCostPrice('15000');
    setDurationMinutes('30');
    setTechnicianName('');
    setServiceNotes('');
    setImageUrl('');
    setUnits([
      { id: 'u_1', unitName: 'SESI STANDAR', conversionFactor: 1, sellingPrice: 50000, costPrice: 15000 },
    ]);
    setCustomerPrices([]);
    setIsFormModalOpen(true);
  };

  // Open modal for editing existing service
  const handleOpenEditServiceModal = (service: Product) => {
    sound.playTap();
    setEditingService(service);
    setName(service.name);
    setBarcode(service.barcode || '');
    setCategory(service.category || 'Layanan Jasa');
    setBaseUnit(service.baseUnit || 'SESI');
    const defaultUnit = service.units?.[0];
    setSellingPrice(defaultUnit ? defaultUnit.sellingPrice.toString() : '50000');
    setCostPrice(defaultUnit?.costPrice !== undefined ? defaultUnit.costPrice.toString() : (service.costPrice || 0).toString());
    setDurationMinutes((service.serviceDurationMinutes || 30).toString());
    setTechnicianName(service.technicianName || '');
    setServiceNotes(service.serviceNotes || '');
    setImageUrl(service.imageUrl || '');
    setUnits(
      service.units && service.units.length > 0
        ? [...service.units]
        : [{ id: 'u_1', unitName: service.baseUnit || 'SESI', conversionFactor: 1, sellingPrice: service.units?.[0]?.sellingPrice || 50000, costPrice: service.costPrice || 0 }]
    );
    setCustomerPrices(service.customerPrices ? [...service.customerPrices] : []);
    setIsFormModalOpen(true);
  };

  // Apply quick starter template
  const handleApplyTemplate = (tpl: typeof SERVICE_TEMPLATES[0]) => {
    sound.playSuccessChime();
    setName(tpl.name);
    setCategory(tpl.category);
    setBaseUnit(tpl.baseUnit);
    setSellingPrice(tpl.sellingPrice.toString());
    setCostPrice(tpl.costPrice.toString());
    setDurationMinutes(tpl.durationMinutes.toString());
    setTechnicianName(tpl.technician);
    setServiceNotes(tpl.notes);
    setUnits([
      { id: 'u_1', unitName: `1 ${tpl.baseUnit} STANDAR`, conversionFactor: 1, sellingPrice: tpl.sellingPrice, costPrice: tpl.costPrice },
    ]);
    setShowTemplatePicker(false);
  };

  // Add variation tier
  const handleAddTier = () => {
    sound.playTap();
    const newIdx = units.length + 1;
    const baseSelling = parseFloat(sellingPrice) || 50000;
    const baseCost = parseFloat(costPrice) || 15000;
    setUnits([
      ...units,
      {
        id: 'u_' + Date.now(),
        unitName: `PAKET ${newIdx === 2 ? 'LENGKAP' : newIdx === 3 ? 'KILAT / EXPRESS' : 'EXTRA'}`,
        conversionFactor: 1,
        sellingPrice: Math.round(baseSelling * (newIdx === 2 ? 1.5 : 2)),
        costPrice: Math.round(baseCost * (newIdx === 2 ? 1.4 : 1.8)),
      },
    ]);
  };

  const handleRemoveTier = (idx: number) => {
    if (units.length <= 1) return;
    sound.playTap();
    setUnits(units.filter((_, i) => i !== idx));
  };

  const handleTierChange = (index: number, field: keyof ProductUnit, value: any) => {
    const updated = [...units];
    updated[index] = { ...updated[index], [field]: value };
    // Synchronize first unit with main form inputs
    if (index === 0) {
      if (field === 'sellingPrice') setSellingPrice(value.toString());
      if (field === 'costPrice') setCostPrice(value.toString());
    }
    setUnits(updated);
  };

  // Helper fungsi untuk kelola Tarif Khusus Pelanggan Jasa
  const handleAddCustomerPrice = (presetCategory: string = 'VIP') => {
    sound.playTap();
    const baseSelling = parseFloat(sellingPrice) || 50000;
    const newPrice: CustomerSpecialPrice = {
      id: 'cp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      customerCategory: presetCategory,
      price: Math.max(0, Math.round(baseSelling * 0.85)), // default diskon 15% tarif jasa
      unitName: baseUnit,
      minQuantity: 1, // default syarat minimal pesanan
      notes: '',
    };
    setCustomerPrices((prev) => [...prev, newPrice]);
  };

  const handleUpdateCustomerPrice = (index: number, field: keyof CustomerSpecialPrice, value: any) => {
    setCustomerPrices((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleRemoveCustomerPrice = (index: number) => {
    sound.playTap();
    setCustomerPrices((prev) => prev.filter((_, i) => i !== index));
  };

  // Save Service handler
  const handleSaveService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Harap masukkan nama jasa / layanan!');
      return;
    }

    sound.playSuccessChime();
    const mainSelling = parseFloat(sellingPrice) || 0;
    const mainCost = parseFloat(costPrice) || 0;
    const duration = parseInt(durationMinutes) || 30;
    const catColor = getCategoryColor(category, categories);

    // Ensure first unit reflects primary prices
    const preparedUnits: ProductUnit[] = units.map((u, i) => {
      if (i === 0) {
        return {
          ...u,
          unitName: u.unitName.trim() || baseUnit.trim().toUpperCase(),
          conversionFactor: 1,
          sellingPrice: mainSelling,
          costPrice: mainCost,
        };
      }
      return {
        ...u,
        unitName: u.unitName.trim().toUpperCase(),
        conversionFactor: 1,
        sellingPrice: Math.max(0, parseFloat(u.sellingPrice.toString()) || 0),
        costPrice: Math.max(0, parseFloat(u.costPrice?.toString() || '0') || 0),
      };
    });

    const payload: Omit<Product, 'id'> = {
      productType: 'JASA',
      name: name.trim(),
      barcode: barcode.trim() || ('JSA-' + Date.now().toString().slice(-4)),
      category: category.trim(),
      categoryColor: catColor,
      baseUnit: baseUnit.trim().toUpperCase() || 'SESI',
      stockInBaseUnit: 99999, // Treated as unlimited for non-inventory service
      minStockAlert: 0,
      costPrice: mainCost,
      imageUrl: imageUrl.trim() || undefined,
      serviceDurationMinutes: duration,
      technicianName: technicianName.trim() || undefined,
      serviceNotes: serviceNotes.trim() || undefined,
      units: preparedUnits,
      customerPrices: customerPrices.length > 0 ? customerPrices.map((cp) => ({
        id: cp.id || ('cp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
        customerCategory: cp.customerCategory.trim().toUpperCase(),
        price: Math.max(0, parseFloat(cp.price.toString()) || 0),
        unitName: cp.unitName ? cp.unitName.trim().toUpperCase() : undefined,
        minQuantity: Math.max(1, parseInt(cp.minQuantity?.toString() || '1') || 1),
        notes: cp.notes?.trim() || undefined,
      })) : undefined,
    };

    if (editingService) {
      onUpdateService({
        ...payload,
        id: editingService.id,
      });
    } else {
      onAddService(payload);
    }

    setIsFormModalOpen(false);
  };

  // Camera capture handlers
  const handleStartCamera = async () => {
    sound.playTap();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 800 }, height: { ideal: 600 } },
        audio: false,
      });
      setCameraStream(stream);
      setIsCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 200);
    } catch {
      alert('Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan di browser Anda.');
    }
  };

  const handleCapturePhoto = () => {
    sound.playSuccessChime();
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
        setImageUrl(dataUrl);
      }
    }
    handleStopCamera();
  };

  const handleStopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Calculate margin preview
  const currentSelling = parseFloat(sellingPrice) || 0;
  const currentCost = parseFloat(costPrice) || 0;
  const grossProfit = Math.max(0, currentSelling - currentCost);
  const marginPercent = currentSelling > 0 ? Math.round((grossProfit / currentSelling) * 100) : 0;

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Top Header Card */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-5 md:p-6 rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/20 border border-purple-400/40 text-purple-300 flex items-center justify-center font-bold shadow-inner">
                <Wrench className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-black tracking-tight">
                    Menu &amp; Input Jasa Layanan
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-purple-500 text-white tracking-wider shadow-xs">
                    Non-Stok
                  </span>
                </div>
                <p className="text-xs text-purple-200/80">
                  Kelola tarif pengerjaan, estimasi durasi, komisi teknisi/petugas, dan variasi paket layanan kasir.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setShowTemplatePicker(true);
              }}
              className="px-3.5 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 border border-white/20 transition-all cursor-pointer backdrop-blur-md"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Contoh Template Jasa</span>
            </button>

            <button
              type="button"
              onClick={handleOpenNewServiceModal}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-black text-xs md:text-sm flex items-center gap-2 shadow-lg shadow-purple-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ Input Jasa Baru</span>
            </button>
          </div>
        </div>

        {/* Analytics Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Total Jasa Aktif</span>
              <Layers className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-xl md:text-2xl font-black text-slate-900">
              {stats.totalCount} <span className="text-xs font-semibold text-slate-400">Layanan</span>
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Rata-rata Durasi</span>
              <Clock className="w-4 h-4 text-sky-600" />
            </div>
            <div className="text-xl md:text-2xl font-black text-slate-900">
              {stats.avgDuration} <span className="text-xs font-semibold text-slate-400">Menit / Sesi</span>
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Sesi Terjual</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl md:text-2xl font-black text-slate-900">
              {stats.totalServiceTx} <span className="text-xs font-semibold text-slate-400">Invoice</span>
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
              <span>Omset Jasa</span>
              <TrendingUp className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-lg md:text-xl font-black text-emerald-700 truncate">
              {formatRupiah(stats.totalServiceRevenue)}
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama jasa, teknisi, kode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs focus:border-purple-500 focus:outline-none"
            />
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 no-scrollbar">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setSelectedCategory('SEMUA');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                selectedCategory === 'SEMUA'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua ({serviceItems.length})
            </button>

            {serviceCategories.map((cat) => {
              const count = serviceItems.filter((s) => s.category.toLowerCase() === cat.toLowerCase()).length;
              if (count === 0 && selectedCategory !== cat) return null;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setSelectedCategory(cat);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                    selectedCategory.toLowerCase() === cat.toLowerCase()
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Service Cards Grid */}
        {filteredServices.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 space-y-4 shadow-2xs">
            <div className="w-16 h-16 mx-auto rounded-3xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Wrench className="w-8 h-8 stroke-[1.8]" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                {search ? 'Tidak ada jasa yang sesuai pencarian' : 'Belum Ada Jasa Layanan Terdaftar'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {search
                  ? 'Coba ganti kata kunci pencarian Anda atau periksa filter kategori di atas.'
                  : 'Gunakan form input jasa untuk mendaftarkan layanan bengkel, salon, servis elektronik, cuci laundry, atau perawatan.'}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowTemplatePicker(true)}
                className="px-4 py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs border border-purple-200 transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span>Pilih dari Template Siap Pakai</span>
              </button>

              <button
                type="button"
                onClick={handleOpenNewServiceModal}
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Input Jasa Manual</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredServices.map((service) => {
              const defaultUnit = service.units?.[0];
              const selling = defaultUnit ? defaultUnit.sellingPrice : 0;
              const cost = defaultUnit?.costPrice !== undefined ? defaultUnit.costPrice : (service.costPrice || 0);
              const profit = Math.max(0, selling - cost);
              const margin = selling > 0 ? Math.round((profit / selling) * 100) : 0;
              const duration = service.serviceDurationMinutes || 30;

              return (
                <div
                  key={service.id}
                  className="bg-white rounded-2xl border border-purple-100 hover:border-purple-300 shadow-2xs hover:shadow-md transition-all p-4.5 flex flex-col justify-between space-y-3 relative group"
                >
                  <div className="space-y-3">
                    {/* Header: Category Badge & Duration */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-purple-100 text-purple-800 border border-purple-200 truncate">
                        {service.category}
                      </span>

                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-800 border border-sky-100 text-[10.5px] font-bold font-mono">
                        <Clock className="w-3 h-3 text-sky-600" />
                        <span>{duration} Menit</span>
                      </div>
                    </div>

                    {/* Service Name & Code */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-purple-700 transition-colors line-clamp-2">
                        {service.name}
                      </h4>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>Kode: <b>{service.barcode}</b></span>
                        <span>•</span>
                        <span>Satuan: <b>{service.baseUnit}</b></span>
                      </div>
                    </div>

                    {/* Technician & SOP notes if available */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                      {service.technicianName && (
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <User className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                          <span className="truncate">Teknisi: <b>{service.technicianName}</b></span>
                        </div>
                      )}
                      {service.serviceNotes ? (
                        <p className="text-[11px] text-slate-500 line-clamp-2 italic">
                          "{service.serviceNotes}"
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">
                          Layanan aktif di kasir. Tidak memotong stok barang.
                        </p>
                      )}
                    </div>

                    {/* Multi-tier packages pill if > 1 */}
                    {service.units && service.units.length > 1 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          Tingkatan Paket ({service.units.length} Opsi):
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {service.units.map((u, i) => (
                            <span
                              key={u.id || i}
                              className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-purple-50 text-purple-900 border border-purple-200"
                            >
                              {u.unitName}: <b>{formatRupiah(u.sellingPrice)}</b>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tarif Khusus Kategori Pelanggan badges */}
                    {service.customerPrices && service.customerPrices.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {service.customerPrices.map((cp, cpIdx) => {
                          const catObj = customerCategories.find(
                            (c) => c.name.toUpperCase() === cp.customerCategory.toUpperCase()
                          );
                          const badge = getCustomerCategoryBadge(cp.customerCategory, catObj?.color);
                          const minQty = cp.minQuantity && cp.minQuantity > 1 ? cp.minQuantity : 1;
                          return (
                            <span
                              key={cp.id || cpIdx}
                              className={`inline-flex items-center gap-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded border ${badge.bg} ${badge.text} ${badge.border}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                              <span>
                                {cp.customerCategory}: {formatRupiah(cp.price)}
                                {minQty > 1 ? ` (≥${minQty} ${cp.unitName || service.baseUnit})` : ''}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Pricing & Actions Footer */}
                  <div className="pt-3 border-t border-slate-100 flex items-end justify-between gap-2">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase font-bold">Tarif Jasa</div>
                      <div className="text-base font-black text-purple-700">
                        {formatRupiah(selling)}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        Komisi: {formatRupiah(cost)} · <b className="text-emerald-700">+{margin}%</b>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {onNavigateToPOS && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            onNavigateToPOS(service.id);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                          title="Buka & Tambahkan ke Kasir POS"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Kasir</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenEditServiceModal(service)}
                        className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-sky-700 transition-colors cursor-pointer"
                        title="Edit Jasa"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setServiceToDelete(service);
                        }}
                        className="p-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Hapus Layanan Jasa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: INPUT / EDIT JASA LAYANAN */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-5 my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Wrench className="w-5 h-5 stroke-[2.2]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingService ? 'Edit Layanan Jasa' : 'Input Jasa Layanan Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Layanan non-stok: tidak memotong persediaan fisik barang di gudang.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveService} className="space-y-4">
              {/* Field 1: Nama Jasa & Barcode */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Nama Jasa / Layanan <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Jasa Potong Rambut, Ganti Oli Mesin, Servis Laptop"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-medium focus:border-purple-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Kode / Barcode Cepat
                  </label>
                  <input
                    type="text"
                    placeholder="JSA-001"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Field 2: Kategori & Satuan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Kategori Jasa
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:border-purple-600 focus:outline-none bg-white"
                  >
                    {serviceCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Satuan Tarif (Satuan Dasar)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {['SESI', 'JAM', 'PAKET', 'UNIT', 'ORANG'].map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setBaseUnit(u);
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-[10.5px] font-bold border transition-colors ${
                          baseUnit === u
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Field 3: Tarif Jual & Komisi Petugas (HPP) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-purple-50/50 rounded-2xl border border-purple-100">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-purple-950 block">
                    Tarif Jasa ke Pelanggan (Rp) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      Rp
                    </span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-purple-200 bg-white text-xs font-mono font-black text-purple-700 focus:border-purple-600 focus:outline-none"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Harga final yang dibayar pelanggan di struk nota kasir.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Komisi Petugas / Biaya Modal (Rp)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      Rp
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono font-bold text-slate-700 focus:border-purple-600 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                    <span>Laba Bersih Toko:</span>
                    <strong className="text-emerald-700">
                      {formatRupiah(grossProfit)} ({marginPercent}%)
                    </strong>
                  </div>
                </div>
              </div>

              {/* Field 4: Estimasi Durasi & Teknisi Penanggung Jawab */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-600" />
                    <span>Estimasi Durasi Pengerjaan (Menit)</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="5"
                      step="5"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(e.target.value)}
                      className="w-24 p-2 rounded-xl border border-slate-300 text-xs font-mono font-bold text-center focus:border-purple-600 focus:outline-none"
                    />
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                      {['15', '30', '45', '60', '90'].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setDurationMinutes(mins);
                          }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                            durationMinutes === mins
                              ? 'bg-sky-600 text-white border-sky-600'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {mins}m
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Petugas / Teknisi Standar</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Budi, Siti Stylist, Tim Mekanik A"
                    value={technicianName}
                    onChange={(e) => setTechnicianName(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-purple-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Field 5: Variasi Paket / Pilihan Tingkat Tarif (Units) */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-purple-600" />
                    <span>Variasi Tingkatan Paket Layanan (Opsional)</span>
                  </span>

                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="text-[10.5px] font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Tambah Paket</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {units.map((u, idx) => (
                    <div
                      key={u.id || idx}
                      className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center gap-2 text-xs"
                    >
                      <input
                        type="text"
                        placeholder="Nama Paket (e.g. Paket Kilat)"
                        value={u.unitName}
                        onChange={(e) => handleTierChange(idx, 'unitName', e.target.value)}
                        className="flex-1 p-1.5 rounded-lg border border-slate-200 text-xs font-semibold uppercase"
                      />

                      <div className="w-32 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">Rp</span>
                        <input
                          type="number"
                          placeholder="Tarif"
                          value={u.sellingPrice || ''}
                          onChange={(e) => handleTierChange(idx, 'sellingPrice', parseFloat(e.target.value) || 0)}
                          className="w-full pl-7 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold text-right"
                        />
                      </div>

                      {units.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTier(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Hapus opsi paket ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Field 6: SOP / Garansi & Catatan Layanan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Catatan Pengerjaan / Ketentuan Garansi (Opsional)</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Garansi servis 14 hari pengerjaan. Pelanggan wajib konfirmasi apabila terdapat keluhan sebelum 7 hari kerja."
                  value={serviceNotes}
                  onChange={(e) => setServiceNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-purple-600 focus:outline-none resize-none"
                />
              </div>

              {/* MENU PELANGGAN: TARIF KHUSUS KATEGORI PELANGGAN */}
              <div className="p-4 bg-gradient-to-r from-purple-50/50 via-indigo-50/30 to-purple-50/50 rounded-2xl border border-purple-200/80 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-purple-100">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                          Menu Pelanggan: Tarif Khusus Kategori
                        </span>
                        {customerPrices.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-600 text-white">
                            {customerPrices.length} Aturan Tarif
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Atur tarif jasa khusus otomatis saat pelanggan kategori tertentu (VIP, Member, Reseller, dll.) dipilih di kasir.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {availableCategoryNames.slice(0, 5).map((catName) => (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => handleAddCustomerPrice(catName)}
                        className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-purple-50 text-slate-700 hover:text-purple-800 border border-slate-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <Plus className="w-3 h-3 text-purple-600" />
                        <span>+ {catName}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleAddCustomerPrice('MEMBER')}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Lainnya</span>
                    </button>
                  </div>
                </div>

                {customerPrices.length === 0 ? (
                  <div className="p-3.5 bg-white/70 rounded-xl border border-dashed border-purple-200 text-center space-y-1.5">
                    <p className="text-xs font-medium text-slate-600">
                      Belum ada tarif khusus pelanggan yang diatur untuk jasa ini.
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Semua pelanggan akan mendapatkan tarif standar normal: <strong className="text-purple-700">{formatRupiah(parseFloat(sellingPrice) || 0)}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleAddCustomerPrice('VIP')}
                      className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Tarif Khusus Pelanggan Sekarang</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {customerPrices.map((cp, cpIdx) => {
                      const badge = getCustomerCategoryBadge(cp.customerCategory);
                      const baseNormalPrice = parseFloat(sellingPrice) || 0;
                      const diff = baseNormalPrice - cp.price;
                      const diffPercent = baseNormalPrice > 0 ? Math.round((diff / baseNormalPrice) * 100) : 0;
                      const currentUnitName = cp.unitName || baseUnit || 'SESI';
                      const minQty = cp.minQuantity !== undefined && cp.minQuantity > 0 ? cp.minQuantity : 1;

                      return (
                        <div
                          key={cp.id || cpIdx}
                          className="p-3.5 bg-white rounded-2xl border border-slate-200 shadow-2xs space-y-2.5"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                            {/* Kategori Pelanggan Dropdown / Datalist */}
                            <div className="sm:col-span-4 space-y-1">
                              <label className="text-[10px] font-bold text-slate-500 block">
                                Kategori Pelanggan *
                              </label>
                              <div className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${badge.dot} shrink-0`} />
                                <input
                                  type="text"
                                  required
                                  value={cp.customerCategory}
                                  onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'customerCategory', e.target.value.toUpperCase())}
                                  placeholder="VIP / MEMBER / RESELLER"
                                  className="w-full p-2 rounded-lg border border-slate-200 text-xs font-black font-mono focus:border-purple-600 uppercase bg-slate-50/50"
                                  list={`svc-cat-suggestions-${cpIdx}`}
                                />
                                <datalist id={`svc-cat-suggestions-${cpIdx}`}>
                                  {availableCategoryNames.map((c) => (
                                    <option key={c} value={c} />
                                  ))}
                                </datalist>
                              </div>
                            </div>

                            {/* Syarat Minimal Pesanan (x sesi/satuan) */}
                            <div className="sm:col-span-3 space-y-1">
                              <label className="text-[10px] font-bold text-purple-700 block truncate" title="Jumlah minimal agar tarif khusus berlaku">
                                Min. Pesan (Qty) *
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  required
                                  min="1"
                                  value={minQty}
                                  onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'minQuantity', Math.max(1, parseInt(e.target.value) || 1))}
                                  placeholder="1"
                                  className="w-full p-2 pr-7 rounded-lg border border-purple-200 text-xs font-mono font-black text-purple-700 focus:border-purple-600 bg-purple-50/30 text-center"
                                />
                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-purple-500 pointer-events-none truncate max-w-[28px]">
                                  {currentUnitName}
                                </span>
                              </div>
                            </div>

                            {/* Tarif Khusus (Rp) */}
                            <div className="sm:col-span-4 space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-slate-700 block">
                                  Tarif Khusus Jasa (Rp) *
                                </label>
                                {diff > 0 ? (
                                  <span className="text-[9.5px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded">
                                    Hemat {diffPercent}%
                                  </span>
                                ) : diff < 0 ? (
                                  <span className="text-[9.5px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded">
                                    +{formatRupiah(Math.abs(diff))}
                                  </span>
                                ) : null}
                              </div>
                              <input
                                type="number"
                                required
                                min="0"
                                step="any"
                                value={cp.price !== undefined ? cp.price : ''}
                                onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'price', Math.max(0, parseFloat(e.target.value) || 0))}
                                placeholder="0"
                                className="w-full p-2 rounded-lg border border-purple-200 text-xs font-mono font-black text-purple-700 focus:border-purple-600 bg-purple-50/30"
                              />
                            </div>

                            {/* Hapus Baris */}
                            <div className="sm:col-span-1 text-right pt-2 sm:pt-0">
                              <button
                                type="button"
                                onClick={() => handleRemoveCustomerPrice(cpIdx)}
                                className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Hapus Tarif Khusus Ini"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Pemicu Syarat Tarif Khusus (Live Explanation) */}
                          <div className="p-2 rounded-xl bg-gradient-to-r from-purple-50 via-indigo-50/40 to-slate-50 border border-purple-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px]">
                            <div className="flex items-center gap-1.5 text-slate-700 truncate">
                              <span className="font-bold text-purple-700 shrink-0">🎯 Pemicu Tarif:</span>
                              <span className="truncate">
                                Tarif <strong>{formatRupiah(cp.price)}</strong>/{currentUnitName} otomatis berlaku untuk pelanggan <strong>{cp.customerCategory || 'MEMBER'}</strong> jika memesan mulai <strong>{minQty} {currentUnitName} ke atas</strong>.
                              </span>
                            </div>
                            {minQty > 1 && (
                              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold text-[9.5px] shrink-0 border border-purple-200">
                                Mulai pemesanan {minQty} {currentUnitName} &amp; seterusnya
                              </span>
                            )}
                          </div>

                          {/* Catatan Khusus baris ini */}
                          <div className="pt-1 flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 shrink-0 font-medium">Catatan / Syarat:</span>
                            <input
                              type="text"
                              value={cp.notes || ''}
                              onChange={(e) => handleUpdateCustomerPrice(cpIdx, 'notes', e.target.value)}
                              placeholder="Misal: Minimal 3 sesi paket booking, khusus member..."
                              className="w-full p-1 text-[11px] border border-slate-200 rounded-lg focus:border-purple-600 focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="pt-2 flex items-center justify-between gap-2.5 border-t border-slate-100">
                <div>
                  {editingService && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playTap();
                        const s = editingService;
                        setIsFormModalOpen(false);
                        setEditingService(null);
                        setServiceToDelete(s);
                      }}
                      className="py-2.5 px-3.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Jasa Ini</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsFormModalOpen(false)}
                    className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-600 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    className="py-2.5 px-6 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs shadow-md shadow-purple-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>{editingService ? 'Simpan Perubahan' : 'Simpan Layanan Jasa'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TEMPLATE STARTERS PICKER */}
      {showTemplatePicker && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Template Rekomendasi Jasa Populer
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pilih salah satu template di bawah untuk mengisi formulir jasa dalam 1 detik.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowTemplatePicker(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-96 overflow-y-auto pr-1">
              {SERVICE_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    handleApplyTemplate(tpl);
                    setIsFormModalOpen(true);
                  }}
                  className="p-3 rounded-2xl border border-slate-200 hover:border-purple-400 bg-slate-50 hover:bg-purple-50/50 text-left transition-all group space-y-2 cursor-pointer shadow-2xs hover:shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded text-[9.5px] font-bold uppercase bg-purple-100 text-purple-800">
                      {tpl.category}
                    </span>
                    <span className="text-[10.5px] font-mono text-sky-700 font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {tpl.durationMinutes}m
                    </span>
                  </div>

                  <div>
                    <h5 className="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors">
                      {tpl.name}
                    </h5>
                    <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">
                      {tpl.notes}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono pt-1 border-t border-slate-200/60">
                    <span className="font-black text-purple-700">{formatRupiah(tpl.sellingPrice)}</span>
                    <span className="text-[10px] text-purple-600 font-bold group-hover:underline">Gunakan Template →</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: DELETE SERVICE */}
      {serviceToDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Hapus Layanan Jasa?</h3>
                <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-200 space-y-1">
              <div className="text-xs font-bold text-slate-900">{serviceToDelete.name}</div>
              <div className="text-[11px] text-slate-500 font-mono">
                Kode: {serviceToDelete.barcode} • Kategori: {serviceToDelete.category}
              </div>
              <div className="text-[11px] text-purple-700 font-bold">
                Tarif Dasar: {formatRupiah(serviceToDelete.units?.[0]?.sellingPrice || 0)}
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus layanan jasa ini? Layanan akan segera dihapus secara permanen dari database toko dan sinkronisasi online.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setServiceToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  sound.playSuccessChime();
                  const targetId = serviceToDelete.id;
                  setServiceToDelete(null);
                  try {
                    await deleteDocumentFromFirestore('products', targetId);
                  } catch (err) {
                    console.warn('[Firestore] Delete service notice:', err);
                  }
                  onDeleteService(targetId);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
