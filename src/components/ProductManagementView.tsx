import React, { useState, useMemo, useRef } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  Layers, 
  Edit3, 
  Trash2, 
  X, 
  Barcode, 
  AlertTriangle,
  Check,
  Sliders,
  Palette,
  Tag,
  FolderPlus,
  Sparkles,
  RefreshCw,
  TrendingUp,
  Trophy,
  Flame,
  Award,
  Camera,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Truck,
  RotateCcw,
  BarChart3,
  SwitchCamera
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Cell 
} from 'recharts';
import { Product, ProductUnit, ProductCategory, UserRole, Transaction } from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { CATEGORY_COLOR_PRESETS, getCategoryColor, isDarkColor } from '../utils/categoryColors';

interface ProductManagementViewProps {
  products: Product[];
  categories: ProductCategory[];
  currentUserRole: UserRole;
  transactions?: Transaction[];
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onAddCategory?: (category: Omit<ProductCategory, 'id'>) => ProductCategory;
  onUpdateCategory?: (category: ProductCategory) => void;
  onDeleteCategory?: (categoryId: string) => void;
  onOpenThresholdSettings?: () => void;
  onNavigateToSuppliers?: () => void;
}

export const ProductManagementView: React.FC<ProductManagementViewProps> = ({
  products,
  categories,
  currentUserRole,
  transactions = [],
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onOpenThresholdSettings,
  onNavigateToSuppliers,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('SEMUA');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Category Manager Modal state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [categoryNameInput, setCategoryNameInput] = useState('');
  const [categoryColorInput, setCategoryColorInput] = useState(CATEGORY_COLOR_PRESETS[0].hex);
  const [categoryDescInput, setCategoryDescInput] = useState('');

  // Quick inline category create inside product form
  const [showInlineCatCreator, setShowInlineCatCreator] = useState(false);
  const [inlineCatName, setInlineCatName] = useState('');
  const [inlineCatColor, setInlineCatColor] = useState(CATEGORY_COLOR_PRESETS[2].hex);

  // Form states for Product
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('Sembako');
  const [baseUnit, setBaseUnit] = useState('PCS');
  const [stockInBaseUnit, setStockInBaseUnit] = useState('100');
  const [minStockAlert, setMinStockAlert] = useState('15');
  const [costPrice, setCostPrice] = useState('10000');
  const [imageUrl, setImageUrl] = useState('');
  const [units, setUnits] = useState<ProductUnit[]>([
    { id: 'u_1', unitName: 'PCS', conversionFactor: 1, sellingPrice: 12000, costPrice: 10000 },
  ]);

  // Top 5 Best Sellers Chart states
  const [salesTimeframe, setSalesTimeframe] = useState<'30_DAYS' | '7_DAYS' | 'ALL'>('30_DAYS');
  const [salesMetric, setSalesMetric] = useState<'QTY' | 'REVENUE'>('QTY');
  const [isChartExpanded, setIsChartExpanded] = useState<boolean>(true);

  // Camera capture states
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedPhotoPreview, setCapturedPhotoPreview] = useState<string | null>(null);
  const [quickCameraTargetProduct, setQuickCameraTargetProduct] = useState<Product | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Top 5 Best Sellers calculation based on transaction history
  const topProductsAnalytics = useMemo(() => {
    const now = Date.now();
    const timeframeMs =
      salesTimeframe === '7_DAYS'
        ? 7 * 86400000
        : salesTimeframe === '30_DAYS'
        ? 30 * 86400000
        : Infinity;

    const filteredTx = transactions.filter((tx) => now - tx.timestamp <= timeframeMs);

    const statsMap = new Map<
      string,
      {
        productId: string;
        productName: string;
        category: string;
        baseUnit: string;
        totalUnitsSold: number;
        totalRevenue: number;
        txCount: number;
      }
    >();

    filteredTx.forEach((tx) => {
      tx.items.forEach((item) => {
        const prod = products.find((p) => p.id === item.productId);
        const baseUnit = prod?.baseUnit || 'PCS';
        const category = prod?.category || 'Umum';
        const unitsSold = item.quantity * (item.conversionFactor || 1);

        const current = statsMap.get(item.productId) || {
          productId: item.productId,
          productName: item.productName || prod?.name || 'Produk',
          category,
          baseUnit,
          totalUnitsSold: 0,
          totalRevenue: 0,
          txCount: 0,
        };

        current.totalUnitsSold += unitsSold;
        current.totalRevenue += item.totalAmount;
        current.txCount += 1;
        statsMap.set(item.productId, current);
      });
    });

    const list = Array.from(statsMap.values()).map((stat) => {
      const prod = products.find((p) => p.id === stat.productId);
      const currentStock = prod ? prod.stockInBaseUnit : 0;
      const minAlert = prod ? prod.minStockAlert : 10;
      const costPrice = prod ? prod.costPrice : 0;
      const isZero = currentStock <= 0;
      const isLow = currentStock <= minAlert;

      const daysCount = salesTimeframe === '7_DAYS' ? 7 : 30;
      const dailyVelocity = stat.totalUnitsSold / daysCount;
      const daysLeft = dailyVelocity > 0 ? Math.round(currentStock / dailyVelocity) : 999;

      return {
        ...stat,
        product: prod,
        currentStock,
        minAlert,
        costPrice,
        isZero,
        isLow,
        dailyVelocity,
        daysLeft,
      };
    });

    list.sort((a, b) =>
      salesMetric === 'QTY'
        ? b.totalUnitsSold - a.totalUnitsSold
        : b.totalRevenue - a.totalRevenue
    );

    return list.slice(0, 5);
  }, [transactions, products, salesTimeframe, salesMetric]);

  // Camera Helper Functions
  const startCamera = async (facingModeOverride?: 'environment' | 'user') => {
    sound.playTap();
    setCameraError(null);
    setCapturedPhotoPreview(null);
    setIsCameraModalOpen(true);

    const targetFacing = facingModeOverride || cameraFacingMode;
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: targetFacing, width: { ideal: 640 }, height: { ideal: 640 } },
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      setCameraError('Izin kamera tidak aktif atau kamera tidak tersedia pada perangkat.');
    }
  };

  const toggleFacingMode = () => {
    sound.playTap();
    const newMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(newMode);
    startCamera(newMode);
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCapturedPhotoPreview(null);
    setQuickCameraTargetProduct(null);
    setIsCameraModalOpen(false);
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    sound.playSuccessChime();
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const minDim = Math.min(video.videoWidth || 400, video.videoHeight || 400);
      const startX = ((video.videoWidth || 400) - minDim) / 2;
      const startY = ((video.videoHeight || 400) - minDim) / 2;
      ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 400, 400);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedPhotoPreview(dataUrl);
    }
  };

  const handleConfirmPhoto = () => {
    if (!capturedPhotoPreview) return;
    sound.playSuccessChime();

    if (quickCameraTargetProduct) {
      // Quick camera capture from product row/card
      onUpdateProduct({
        ...quickCameraTargetProduct,
        imageUrl: capturedPhotoPreview,
      });
    } else {
      // From product edit/add modal
      setImageUrl(capturedPhotoPreview);
    }
    stopCamera();
  };

  const handleRetakePhoto = () => {
    sound.playTap();
    setCapturedPhotoPreview(null);
  };

  const handleQuickCamera = (prod: Product) => {
    setQuickCameraTargetProduct(prod);
    startCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    sound.playTap();
    const reader = new FileReader();
    reader.onload = (event) => {
      const res = event.target?.result as string;
      setImageUrl(res);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Bind camera stream to video element when active
  React.useEffect(() => {
    if (cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraStream, isCameraModalOpen]);

  // Cleanup camera stream on unmount
  React.useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Unique list of category names (from configured categories + any existing in products)
  const categoryNamesList = React.useMemo(() => {
    const names = new Set<string>();
    categories.forEach((c) => names.add(c.name));
    products.forEach((p) => {
      if (p.category) names.add(p.category);
    });
    return Array.from(names);
  }, [categories, products]);

  const filterTabs = ['SEMUA', ...categoryNamesList];

  const filteredProducts = products.filter((p) => {
    const matchCat = selectedCategory === 'SEMUA' || p.category === selectedCategory;
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase()) ||
      p.units.some((u) => u.unitName.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  const openAddModal = () => {
    sound.playTap();
    setName('');
    setBarcode(Math.floor(899000000000 + Math.random() * 999999999).toString());
    const defaultCat = categories[0]?.name || 'Sembako';
    setCategory(defaultCat);
    setBaseUnit('PCS');
    setStockInBaseUnit('100');
    setMinStockAlert('15');
    setCostPrice('10000');
    setImageUrl('');
    setUnits([
      { id: 'u_base', unitName: 'PCS', conversionFactor: 1, sellingPrice: 13000, costPrice: 10000 },
    ]);
    setShowInlineCatCreator(false);
    setIsAddingNew(true);
    setEditingProduct(null);
  };

  const openEditModal = (prod: Product) => {
    sound.playTap();
    setEditingProduct(prod);
    setName(prod.name);
    setBarcode(prod.barcode);
    setCategory(prod.category);
    setBaseUnit(prod.baseUnit);
    setStockInBaseUnit(prod.stockInBaseUnit.toString());
    setMinStockAlert(prod.minStockAlert.toString());
    setCostPrice(prod.costPrice.toString());
    setImageUrl(prod.imageUrl || '');
    setUnits([...prod.units]);
    setShowInlineCatCreator(false);
    setIsAddingNew(false);
  };

  // Add unit row to form
  const handleAddUnitRow = () => {
    sound.playTap();
    const newId = 'u_' + Date.now();
    setUnits([
      ...units,
      {
        id: newId,
        unitName: 'DUS',
        conversionFactor: 12,
        sellingPrice: (units[0]?.sellingPrice || 10000) * 11, // discount bulk
        costPrice: (units[0]?.costPrice || 8000) * 12,
      },
    ]);
  };

  const handleRemoveUnitRow = (index: number) => {
    sound.playTap();
    if (units.length <= 1) {
      alert('Produk harus memiliki minimal 1 satuan dasar!');
      return;
    }
    const updated = [...units];
    updated.splice(index, 1);
    setUnits(updated);
  };

  const handleUnitChange = (index: number, field: keyof ProductUnit, value: any) => {
    const updated = [...units];
    updated[index] = { ...updated[index], [field]: value };
    setUnits(updated);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !barcode.trim() || units.length === 0) return;

    sound.playSuccessChime();

    const catColor = getCategoryColor(category, categories);

    const productPayload = {
      barcode: barcode.trim(),
      name: name.trim(),
      category: category.trim(),
      categoryColor: catColor,
      baseUnit: baseUnit.trim().toUpperCase(),
      stockInBaseUnit: parseFloat(stockInBaseUnit) || 0,
      minStockAlert: parseFloat(minStockAlert) || 0,
      costPrice: parseFloat(costPrice) || 0,
      imageUrl: imageUrl.trim(),
      units: units.map((u, i) => ({
        ...u,
        unitName: u.unitName.trim().toUpperCase(),
        conversionFactor: i === 0 ? 1 : Math.max(1, parseFloat(u.conversionFactor.toString()) || 1),
        sellingPrice: Math.max(0, parseFloat(u.sellingPrice.toString()) || 0),
        costPrice: parseFloat(u.costPrice?.toString() || '0') || 0,
      })),
    };

    if (editingProduct) {
      onUpdateProduct({
        ...productPayload,
        id: editingProduct.id,
      });
      setEditingProduct(null);
    } else {
      onAddProduct(productPayload);
      setIsAddingNew(false);
    }
  };

  // =========================================================================
  // CATEGORY MANAGEMENT HANDLERS
  // =========================================================================
  const openCategoryManager = () => {
    sound.playTap();
    setEditingCategory(null);
    setCategoryNameInput('');
    setCategoryColorInput(CATEGORY_COLOR_PRESETS[0].hex);
    setCategoryDescInput('');
    setIsCategoryModalOpen(true);
  };

  const handleStartEditCategory = (cat: ProductCategory) => {
    sound.playTap();
    setEditingCategory(cat);
    setCategoryNameInput(cat.name);
    setCategoryColorInput(cat.color || '#0284c7');
    setCategoryDescInput(cat.description || '');
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryNameInput.trim()) return;

    sound.playSuccessChime();

    if (editingCategory) {
      if (onUpdateCategory) {
        onUpdateCategory({
          ...editingCategory,
          name: categoryNameInput.trim(),
          color: categoryColorInput,
          description: categoryDescInput.trim(),
        });
      }
      setEditingCategory(null);
    } else {
      if (onAddCategory) {
        onAddCategory({
          name: categoryNameInput.trim(),
          color: categoryColorInput,
          description: categoryDescInput.trim(),
        });
      }
    }

    setCategoryNameInput('');
    setCategoryColorInput(CATEGORY_COLOR_PRESETS[Math.floor(Math.random() * CATEGORY_COLOR_PRESETS.length)].hex);
    setCategoryDescInput('');
  };

  const handleDeleteCategory = (cat: ProductCategory) => {
    const productsInCat = products.filter((p) => p.category.toLowerCase() === cat.name.toLowerCase());
    if (productsInCat.length > 0) {
      const confirmDelete = confirm(
        `Kategori "${cat.name}" sedang digunakan oleh ${productsInCat.length} produk. Apakah Anda yakin ingin menghapusnya? Produk akan tetap tersimpan.`
      );
      if (!confirmDelete) return;
    } else {
      if (!confirm(`Hapus kategori "${cat.name}"?`)) return;
    }

    sound.playTap();
    if (onDeleteCategory) {
      onDeleteCategory(cat.id);
    }
    if (editingCategory?.id === cat.id) {
      setEditingCategory(null);
      setCategoryNameInput('');
    }
  };

  const handleCreateInlineCategory = () => {
    if (!inlineCatName.trim()) return;
    sound.playSuccessChime();
    let newCat: ProductCategory | null = null;
    if (onAddCategory) {
      newCat = onAddCategory({
        name: inlineCatName.trim(),
        color: inlineCatColor,
        description: 'Dibuat saat tambah produk',
      });
    }
    setCategory(newCat ? newCat.name : inlineCatName.trim());
    setInlineCatName('');
    setShowInlineCatCreator(false);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-sky-600" />
              <span>Manajemen Barang & Multi Satuan</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Atur harga jual bertingkat, kelola kategori berwarna untuk POS, dan pantau stok toko.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
            {/* Category Manager Button */}
            <button
              type="button"
              onClick={openCategoryManager}
              className="px-3.5 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 font-bold text-xs md:text-sm flex items-center gap-1.5 transition-colors shadow-2xs"
              title="Kelola warna dan daftar kategori produk"
            >
              <Palette className="w-4 h-4 text-sky-600" />
              <span>Kelola Kategori</span>
              <span className="ml-1 px-1.5 py-0.2 bg-sky-600 text-white text-[10px] rounded-full">
                {categories.length}
              </span>
            </button>

            {onOpenThresholdSettings && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onOpenThresholdSettings();
                }}
                className="px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-bold text-xs md:text-sm flex items-center gap-1.5 transition-colors shadow-2xs"
                title="Kelola Ambang Batas Minimum Stok untuk seluruh produk"
              >
                <Sliders className="w-4 h-4 text-amber-700" />
                <span>Atur Ambang Batas</span>
              </button>
            )}

            <button
              onClick={openAddModal}
              className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs md:text-sm flex items-center gap-2 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Tambah Produk Baru</span>
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* TOP 5 PRODUK TERLARIS & PRIORITAS STOK CHART                       */}
        {/* =================================================================== */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {/* Header of the Chart Section */}
          <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-gradient-to-r from-amber-50/50 via-white to-sky-50/40">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                <Trophy className="w-5 h-5 text-amber-100" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                    <span>Top 5 Produk Terlaris</span>
                    <span className="text-amber-600 flex items-center gap-0.5 text-xs font-black">
                      <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>Best Sellers</span>
                    </span>
                  </h3>
                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                    Prioritas Kontrol Stok
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Analisis perputaran produk terlaris untuk memprioritaskan pemesanan stok dan mencegah kekosongan barang.
                </p>
              </div>
            </div>

            {/* Timeframe & Metric Switchers */}
            <div className="flex items-center gap-2 flex-wrap self-end md:self-auto">
              {/* Timeframe Filter */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                {[
                  { id: '7_DAYS', label: '7 Hari' },
                  { id: '30_DAYS', label: '30 Hari' },
                  { id: 'ALL', label: 'Semua' },
                ].map((tf) => (
                  <button
                    key={tf.id}
                    onClick={() => {
                      sound.playTap();
                      setSalesTimeframe(tf.id as any);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      salesTimeframe === tf.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {/* Metric Filter */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  onClick={() => {
                    sound.playTap();
                    setSalesMetric('QTY');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    salesMetric === 'QTY'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Unit
                </button>
                <button
                  onClick={() => {
                    sound.playTap();
                    setSalesMetric('REVENUE');
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    salesMetric === 'REVENUE'
                      ? 'bg-sky-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Omzet
                </button>
              </div>

              {/* Toggle Expand / Collapse */}
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsChartExpanded(!isChartExpanded);
                }}
                className="p-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors"
                title={isChartExpanded ? 'Ciutkan Bagan' : 'Perluas Bagan'}
              >
                {isChartExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Chart & Cards Body */}
          {isChartExpanded && (
            <div className="p-4 md:p-5">
              {topProductsAnalytics.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-1">
                  <TrendingUp className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700 text-xs">Belum ada data penjualan pada periode ini</p>
                  <p className="text-[11px] text-slate-400">Lakukan transaksi di menu POS untuk melihat chart produk terlaris.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                  {/* Left: Recharts Bar Chart (7 Cols) */}
                  <div className="lg:col-span-7 bg-slate-50/70 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <BarChart3 className="w-4 h-4 text-sky-600" />
                        <span>
                          Grafik Perbandingan {salesMetric === 'QTY' ? 'Volume Unit Terjual' : 'Total Omzet Penjualan'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium">Top 5 SKU</span>
                    </div>

                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={topProductsAnalytics.map((item, idx) => ({
                            name: item.productName.length > 18 ? item.productName.slice(0, 16) + '...' : item.productName,
                            fullName: item.productName,
                            unit: item.baseUnit,
                            value: salesMetric === 'QTY' ? item.totalUnitsSold : item.totalRevenue,
                            rank: idx + 1,
                            currentStock: item.currentStock,
                            minAlert: item.minAlert,
                            isLow: item.isLow,
                          }))}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                          <XAxis 
                            type="number" 
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            tickFormatter={(v) => salesMetric === 'QTY' ? formatNumber(v) : `${Math.round(v / 1000)}k`}
                          />
                          <YAxis 
                            type="category" 
                            dataKey="name" 
                            width={110} 
                            tick={{ fontSize: 10, fill: '#1e293b', fontWeight: 600 }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-slate-900 text-white p-2.5 rounded-xl text-xs shadow-xl space-y-1 font-sans">
                                    <div className="font-bold text-amber-400 flex items-center gap-1">
                                      <span>#{data.rank}</span>
                                      <span>{data.fullName}</span>
                                    </div>
                                    <div className="text-slate-300">
                                      {salesMetric === 'QTY' ? 'Volume Terjual: ' : 'Total Omzet: '}
                                      <strong className="text-white font-mono">
                                        {salesMetric === 'QTY' ? `${formatNumber(data.value)} ${data.unit}` : formatRupiah(data.value)}
                                      </strong>
                                    </div>
                                    <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-700 flex justify-between gap-3">
                                      <span>Sisa Stok: {data.currentStock} {data.unit}</span>
                                      <span className={data.isLow ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                                        {data.isLow ? 'Perlu Restock!' : 'Stok Cukup'}
                                      </span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                            {topProductsAnalytics.map((entry, index) => {
                              const colors = [
                                '#f59e0b', // #1 Gold
                                '#0284c7', // #2 Blue
                                '#059669', // #3 Emerald
                                '#8b5cf6', // #4 Purple
                                '#ec4899', // #5 Pink
                              ];
                              return (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={colors[index % colors.length]}
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-200 mt-2">
                      <span>Rata-rata penjualan harian otomatis dihitung dari histori transaksi POS</span>
                      <span className="font-semibold text-slate-700">Sumber: Data Penjualan Toko</span>
                    </div>
                  </div>

                  {/* Right: Ranking Cards with Stock Priority Alerts (5 Cols) */}
                  <div className="lg:col-span-5 space-y-2.5">
                    <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                      <span>Status Stok & Prioritas Restock:</span>
                      <span className="text-[10px] text-slate-500">Urutan Terlaris #1 - #5</span>
                    </div>

                    <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
                      {topProductsAnalytics.map((item, idx) => {
                        const rankColors = [
                          'bg-amber-500 text-white shadow-amber-500/30 ring-2 ring-amber-300',
                          'bg-slate-400 text-white shadow-slate-400/30 ring-2 ring-slate-200',
                          'bg-amber-700 text-white shadow-amber-700/30 ring-2 ring-amber-600',
                          'bg-sky-100 text-sky-800 font-bold',
                          'bg-slate-100 text-slate-800 font-bold',
                        ];

                        return (
                          <div
                            key={item.productId}
                            className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                              item.isZero
                                ? 'bg-rose-50/80 border-rose-300 shadow-2xs'
                                : item.isLow
                                ? 'bg-amber-50/70 border-amber-300 shadow-2xs'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${rankColors[idx]}`}>
                                {idx + 1}
                              </div>

                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1.5">
                                  <span>{item.productName}</span>
                                  {item.isZero ? (
                                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                                  ) : item.isLow ? (
                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                                  ) : null}
                                </div>

                                <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 font-mono">
                                  <span>Terjual: <strong className="text-slate-800">{formatNumber(item.totalUnitsSold)} {item.baseUnit}</strong></span>
                                  <span>·</span>
                                  <span>Omzet: {formatRupiah(item.totalRevenue)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Stock Health & Restock Advice */}
                            <div className="text-right shrink-0">
                              <div className="flex items-center justify-end gap-1 font-mono">
                                <span className="text-[10px] text-slate-400">Stok:</span>
                                <span className={`text-xs font-black ${
                                  item.isZero
                                    ? 'text-rose-600'
                                    : item.isLow
                                    ? 'text-amber-700'
                                    : 'text-slate-800'
                                }`}>
                                  {formatNumber(item.currentStock)} {item.baseUnit}
                                </span>
                              </div>

                              <div className="mt-0.5">
                                {item.isZero ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[9.5px] font-black uppercase tracking-wider animate-pulse">
                                    <AlertTriangle className="w-3 h-3" />
                                    <span>STOK HABIS!</span>
                                  </span>
                                ) : item.isLow ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[9.5px] font-bold">
                                    <span>PRIORITAS RESTOCK</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 text-emerald-700 text-[10px] font-bold">
                                    <Check className="w-3 h-3" />
                                    <span>Stok Aman</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Proactive Tip for Manager */}
                    <div className="p-2.5 bg-sky-50 border border-sky-200 rounded-xl text-[11px] text-sky-900 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>
                          {topProductsAnalytics.some((p) => p.isLow)
                            ? 'Ada produk terlaris yang stoknya menipis! Segera ajukan PO.'
                            : 'Stok 5 produk terlaris saat ini dalam batas aman.'}
                        </span>
                      </div>
                      {onNavigateToSuppliers && topProductsAnalytics.some((p) => p.isLow) && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            onNavigateToSuppliers();
                          }}
                          className="px-2 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-[10px] shadow-2xs whitespace-nowrap flex items-center gap-1"
                        >
                          <Truck className="w-3 h-3" />
                          <span>Pesan PO</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filter & Search Bar with Color-coded category tags */}
        <div className="bg-white p-3 md:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row gap-3 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama produk, barcode, kategori, atau satuan..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="text-xs text-slate-500 font-semibold self-end md:self-auto shrink-0">
              Total: <span className="font-bold text-slate-800">{filteredProducts.length}</span> dari{' '}
              {products.length} produk
            </div>
          </div>

          {/* Color-coded category filter pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" />
              <span>Kategori:</span>
            </span>

            {filterTabs.map((cat) => {
              const isSelected = selectedCategory === cat;
              const catColor = cat === 'SEMUA' ? '#0284c7' : getCategoryColor(cat, categories);
              const count =
                cat === 'SEMUA'
                  ? products.length
                  : products.filter((p) => p.category.toLowerCase() === cat.toLowerCase()).length;

              return (
                <button
                  key={cat}
                  onClick={() => {
                    sound.playTap();
                    setSelectedCategory(cat);
                  }}
                  style={
                    isSelected
                      ? {
                          backgroundColor: catColor,
                          color: '#ffffff',
                          borderColor: catColor,
                        }
                      : undefined
                  }
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                    isSelected
                      ? 'shadow-xs font-bold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {cat !== 'SEMUA' && (
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: isSelected ? '#ffffff' : catColor,
                      }}
                    />
                  )}
                  <span>{cat}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Products Table */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Produk</th>
                  <th className="py-3 px-4">Kategori Berwarna</th>
                  <th className="py-3 px-4">Stok Dasar</th>
                  <th className="py-3 px-4">Multi Satuan & Harga Jual</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <Package className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-700">Tidak ada produk ditemukan</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Sesuaikan kata kunci pencarian atau ganti filter kategori di atas.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((prod) => {
                    const isLow = prod.stockInBaseUnit <= prod.minStockAlert;
                    const catColor = getCategoryColor(prod.category, categories, prod);

                    return (
                      <tr key={prod.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Product Name & Barcode */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div 
                              onClick={() => handleQuickCamera(prod)}
                              title="Klik untuk ambil/ganti foto profil dengan kamera"
                              className="relative group/thumb w-10 h-10 rounded-xl bg-slate-100 overflow-hidden shrink-0 border border-slate-200/60 cursor-pointer shadow-2xs"
                            >
                              {prod.imageUrl ? (
                                <img
                                  src={prod.imageUrl}
                                  alt={prod.name}
                                  referrerPolicy="no-referrer"
                                  className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform"
                                />
                              ) : (
                                <div
                                  className="w-full h-full flex items-center justify-center font-bold text-xs"
                                  style={{
                                    backgroundColor: `${catColor}15`,
                                    color: catColor,
                                  }}
                                >
                                  {prod.name.charAt(0)}
                                </div>
                              )}
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Camera className="w-4 h-4" />
                              </div>
                            </div>
                            <div>
                              <div className="font-bold text-slate-900">{prod.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                                <Barcode className="w-3.5 h-3.5" />
                                <span>{prod.barcode}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Color-Coded Category Badge */}
                        <td className="py-3 px-4">
                          <span
                            style={{
                              backgroundColor: `${catColor}14`,
                              color: catColor,
                              borderColor: `${catColor}35`,
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border"
                          >
                            <span
                              className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                              style={{ backgroundColor: catColor }}
                            />
                            <span>{prod.category}</span>
                          </span>
                        </td>

                        {/* Stock in Base Unit */}
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-800">
                            {formatNumber(prod.stockInBaseUnit)} {prod.baseUnit}
                          </div>
                          {isLow && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-600">
                              <AlertTriangle className="w-3 h-3" />
                              Min. {prod.minStockAlert}
                            </span>
                          )}
                        </td>

                        {/* Multi Units Breakdown */}
                        <td className="py-3 px-4">
                          <div className="space-y-1">
                            {prod.units.map((u) => (
                              <div key={u.id} className="flex items-center gap-2 text-xs">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 font-mono font-bold text-slate-700">
                                  {u.unitName}
                                </span>
                                {u.conversionFactor > 1 && (
                                  <span className="text-[11px] text-slate-400">
                                    ({u.conversionFactor} {prod.baseUnit})
                                  </span>
                                )}
                                <span className="font-mono font-bold text-sky-700">
                                  {formatRupiah(u.sellingPrice)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleQuickCamera(prod)}
                              title="Ambil / Ganti Foto Profil Produk via Kamera"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                            >
                              <Camera className="w-4 h-4 text-emerald-600" />
                            </button>
                            <button
                              onClick={() => openEditModal(prod)}
                              title="Edit Produk & Satuan"
                              className="p-1.5 rounded-lg text-slate-500 hover:text-sky-600 hover:bg-sky-50 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            {currentUserRole === 'ADMIN' && (
                              <button
                                onClick={() => {
                                  if (confirm(`Hapus produk "${prod.name}"?`)) {
                                    sound.playTap();
                                    onDeleteProduct(prod.id);
                                  }
                                }}
                                title="Hapus Produk"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: PRODUCT ADD / EDIT MODAL WITH COLOR-CODED CATEGORY PICKER        */}
      {/* ========================================================================= */}
      {(editingProduct || isAddingNew) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isAddingNew ? 'Tambah Master Produk Baru' : `Edit Produk: ${editingProduct?.name}`}
                </h3>
                <p className="text-xs text-slate-500">
                  Lengkapi data produk, kategori berwarna, dan konversi multi-satuan.
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingProduct(null);
                  setIsAddingNew(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="py-4 space-y-4">
              {/* Row 1: Name & Barcode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Nama Produk *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Contoh: Kopi Kapal Api Mix 24g"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Barcode / SKU *
                  </label>
                  <input
                    type="text"
                    required
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Contoh: 899277540044"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Photo & Image Capture Section */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-sky-600" />
                    <span>Foto Profil Produk (Identifikasi Visual POS)</span>
                  </label>
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="text-[11px] font-bold text-rose-500 hover:text-rose-700"
                    >
                      Hapus Foto
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  {/* Photo Preview Thumbnail */}
                  <div className="w-20 h-20 rounded-xl bg-white border border-slate-300 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt="Preview Produk"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-400">
                        <ImageIcon className="w-6 h-6 stroke-[1.5]" />
                        <span className="text-[9px] mt-0.5">Tanpa Foto</span>
                      </div>
                    )}
                  </div>

                  {/* Buttons for Camera, File Upload, and URL */}
                  <div className="flex-1 w-full space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Ambil Foto via Kamera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition-colors"
                      >
                        <Upload className="w-4 h-4 text-slate-600" />
                        <span>Pilih Gambar</span>
                      </button>
                    </div>

                    <input
                      type="url"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="Atau paste link URL gambar langsung..."
                      className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-white focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Row 2: Category Selector with color badge & quick create */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-sky-600" />
                    <span>Pilih Kategori Berwarna *</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setShowInlineCatCreator(!showInlineCatCreator);
                    }}
                    className="text-[11px] font-bold text-sky-600 hover:text-sky-700 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showInlineCatCreator ? 'Tutup Kategori Baru' : '+ Buat Kategori Baru'}</span>
                  </button>
                </div>

                {/* Inline Quick Category Creator */}
                {showInlineCatCreator && (
                  <div className="p-3 bg-white rounded-xl border border-sky-200 shadow-2xs space-y-3 animate-in fade-in">
                    <div className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-sky-600" />
                      <span>Buat Kategori Baru Cepat:</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={inlineCatName}
                        onChange={(e) => setInlineCatName(e.target.value)}
                        placeholder="Nama Kategori (misal: Roti & Kue)"
                        className="p-2 text-xs border border-slate-300 rounded-lg focus:border-sky-500 focus:outline-none font-medium"
                      />

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 flex-1 overflow-x-auto py-1">
                          {CATEGORY_COLOR_PRESETS.slice(0, 8).map((preset) => (
                            <button
                              key={preset.hex}
                              type="button"
                              onClick={() => setInlineCatColor(preset.hex)}
                              style={{ backgroundColor: preset.hex }}
                              className={`w-6 h-6 rounded-full shrink-0 transition-transform ${
                                inlineCatColor === preset.hex ? 'scale-125 ring-2 ring-slate-800 ring-offset-1' : ''
                              }`}
                              title={preset.label}
                            />
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={handleCreateInlineCategory}
                          disabled={!inlineCatName.trim()}
                          className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shrink-0 shadow-2xs"
                        >
                          Simpan
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Existing categories list radio/badges */}
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-1">
                  {categories.map((cat) => {
                    const isChosen = category.toLowerCase() === cat.name.toLowerCase();
                    const color = cat.color || '#0284c7';
                    return (
                      <button
                        key={cat.id || cat.name}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setCategory(cat.name);
                        }}
                        style={{
                          backgroundColor: isChosen ? color : `${color}14`,
                          color: isChosen ? '#ffffff' : color,
                          borderColor: isChosen ? color : `${color}40`,
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                          isChosen ? 'shadow-xs scale-102' : 'hover:bg-slate-100 opacity-90'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{
                            backgroundColor: isChosen ? '#ffffff' : color,
                          }}
                        />
                        <span>{cat.name}</span>
                        {isChosen && <Check className="w-3.5 h-3.5 ml-0.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Base Unit, Stock, Minimum Alert */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Satuan Dasar *</label>
                  <input
                    type="text"
                    required
                    value={baseUnit}
                    onChange={(e) => {
                      setBaseUnit(e.target.value);
                      if (units.length > 0) {
                        const copy = [...units];
                        copy[0].unitName = e.target.value;
                        setUnits(copy);
                      }
                    }}
                    placeholder="PCS / KG / BUNGKUS"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-bold font-mono focus:border-sky-500 focus:outline-none uppercase"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Stok Dasar *</label>
                  <input
                    type="number"
                    required
                    value={stockInBaseUnit}
                    onChange={(e) => setStockInBaseUnit(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Batas Peringatan
                  </label>
                  <input
                    type="number"
                    value={minStockAlert}
                    onChange={(e) => setMinStockAlert(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 4: Cost Price & Image URL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Harga Modal / Beli Satuan Dasar (Rp)
                  </label>
                  <input
                    type="number"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    URL Gambar Produk (Opsional)
                  </label>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* MULTI SATUAN CONFIGURATOR SECTION */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-sky-600" />
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Konfigurasi Multi Satuan & Harga Jual
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleAddUnitRow}
                    className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Tambah Satuan</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {units.map((unit, idx) => (
                    <div
                      key={unit.id || idx}
                      className="p-3 bg-white rounded-xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-2 items-center"
                    >
                      <div className="md:col-span-3">
                        <label className="text-[10px] text-slate-400 block">Nama Satuan</label>
                        <input
                          type="text"
                          required
                          value={unit.unitName}
                          onChange={(e) => handleUnitChange(idx, 'unitName', e.target.value)}
                          placeholder="PCS / PACK / DUS"
                          className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold font-mono focus:border-sky-500 uppercase"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <label className="text-[10px] text-slate-400 block">
                          Faktor Konversi (x {baseUnit})
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          disabled={idx === 0}
                          value={unit.conversionFactor}
                          onChange={(e) => handleUnitChange(idx, 'conversionFactor', e.target.value)}
                          className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold font-mono focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </div>

                      <div className="md:col-span-4">
                        <label className="text-[10px] text-slate-400 block">Harga Jual (Rp)</label>
                        <input
                          type="number"
                          required
                          value={unit.sellingPrice}
                          onChange={(e) => handleUnitChange(idx, 'sellingPrice', e.target.value)}
                          className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold font-mono text-sky-700 focus:border-sky-500"
                        />
                      </div>

                      <div className="md:col-span-2 text-right pt-3 md:pt-0">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveUnitRow(idx)}
                            className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                            title="Hapus Satuan Ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingProduct(null);
                    setIsAddingNew(false);
                  }}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20"
                >
                  Simpan Produk & Satuan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DEDICATED CATEGORY MANAGEMENT MODAL (COLORS, NAMES, CRUD)        */}
      {/* ========================================================================= */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                  <Palette className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Kelola Kategori Berwarna POS
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tambahkan atau edit warna kategori agar kasir mudah memfilter produk di tablet.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  sound.playTap();
                  setIsCategoryModalOpen(false);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Form: Add / Edit */}
            <form onSubmit={handleSaveCategory} className="py-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderPlus className="w-4 h-4 text-sky-600" />
                  <span>{editingCategory ? `Edit Kategori: "${editingCategory.name}"` : 'Tambah Kategori Baru'}</span>
                </span>

                {editingCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCategory(null);
                      setCategoryNameInput('');
                      setCategoryDescInput('');
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
                  >
                    Batal Edit (Mode Tambah Baru)
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Nama Kategori *
                  </label>
                  <input
                    type="text"
                    required
                    value={categoryNameInput}
                    onChange={(e) => setCategoryNameInput(e.target.value)}
                    placeholder="Contoh: Roti & Kue Basah"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Deskripsi Kategori (Opsional)
                  </label>
                  <input
                    type="text"
                    value={categoryDescInput}
                    onChange={(e) => setCategoryDescInput(e.target.value)}
                    placeholder="Contoh: Aneka roti tawar dan kue manis"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Color Picker Swatches */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-700">
                    Pilih Warna Badge (12 Preset Warna Kontras)
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-600">
                      {categoryColorInput}
                    </span>
                    <input
                      type="color"
                      value={categoryColorInput}
                      onChange={(e) => setCategoryColorInput(e.target.value)}
                      className="w-6 h-6 rounded-md cursor-pointer border-0 p-0"
                      title="Pilih Warna Kustom"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 pt-1">
                  {CATEGORY_COLOR_PRESETS.map((preset) => {
                    const isSelected = categoryColorInput.toLowerCase() === preset.hex.toLowerCase();
                    return (
                      <button
                        key={preset.hex}
                        type="button"
                        onClick={() => setCategoryColorInput(preset.hex)}
                        style={{ backgroundColor: preset.hex }}
                        className={`h-8 rounded-xl flex items-center justify-center transition-all ${
                          isSelected
                            ? 'ring-2 ring-slate-900 ring-offset-2 scale-110 shadow-sm'
                            : 'hover:scale-105 opacity-90'
                        }`}
                        title={preset.label}
                      >
                        {isSelected && <Check className="w-4 h-4 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview & Submit */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Pratinjau Badge:</span>
                  <span
                    style={{
                      backgroundColor: `${categoryColorInput}18`,
                      color: categoryColorInput,
                      borderColor: `${categoryColorInput}40`,
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: categoryColorInput }}
                    />
                    <span>{categoryNameInput.trim() || 'Nama Kategori'}</span>
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={!categoryNameInput.trim()}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingCategory ? 'Simpan Perubahan' : 'Tambah Kategori'}</span>
                </button>
              </div>
            </form>

            {/* List of Existing Categories */}
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 uppercase tracking-wider">
                  Daftar Kategori Tersedia ({categories.length})
                </span>
                <span className="text-slate-400">Klik ikon pensil untuk mengubah warna</span>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                {categories.map((cat) => {
                  const productCount = products.filter(
                    (p) => p.category.toLowerCase() === cat.name.toLowerCase()
                  ).length;
                  const color = cat.color || '#0284c7';

                  return (
                    <div
                      key={cat.id || cat.name}
                      className="p-3 bg-slate-50 rounded-2xl border border-slate-200/90 flex items-center justify-between gap-3 hover:bg-slate-100/70 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {/* Color swatch circle */}
                        <div
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-2xs font-bold text-xs"
                          style={{ backgroundColor: color }}
                        >
                          {cat.name.charAt(0)}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs md:text-sm">
                              {cat.name}
                            </span>
                            <span
                              style={{
                                backgroundColor: `${color}15`,
                                color: color,
                                borderColor: `${color}35`,
                              }}
                              className="px-2 py-0.2 rounded-md text-[10px] font-mono font-bold border"
                            >
                              {color}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {cat.description || 'Tidak ada deskripsi'} •{' '}
                            <span className="font-bold text-slate-700">{productCount} produk</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEditCategory(cat)}
                          className="p-2 rounded-xl text-slate-600 hover:text-sky-600 hover:bg-white transition-colors"
                          title="Edit Warna & Nama"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-white transition-colors"
                          title="Hapus Kategori"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsCategoryModalOpen(false);
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CAMERA CAPTURE VIEWFINDER MODAL                                  */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MODAL 3: CAMERA CAPTURE VIEWFINDER MODAL                                  */}
      {/* ========================================================================= */}
      {isCameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col">
            {/* Camera Header */}
            <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">
                    {quickCameraTargetProduct ? `Foto: ${quickCameraTargetProduct.name}` : 'Ambil Foto Produk'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {capturedPhotoPreview ? 'Periksa hasil foto sebelum disimpan' : 'Posisikan produk di tengah bingkai'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {!capturedPhotoPreview && !cameraError && (
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    title="Putar Kamera (Depan / Belakang)"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={stopCamera}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Viewfinder or Preview Window */}
            <div className="relative aspect-square bg-black flex items-center justify-center overflow-hidden">
              {capturedPhotoPreview ? (
                <div className="relative w-full h-full">
                  <img
                    src={capturedPhotoPreview}
                    alt="Preview Jepretan"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Hasil Jepretan Siap Disimpan</span>
                  </div>
                </div>
              ) : cameraError ? (
                <div className="p-6 text-center text-slate-300 space-y-3">
                  <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
                  <p className="text-xs font-semibold">{cameraError}</p>
                  <p className="text-[11px] text-slate-400">
                    Anda juga dapat memilih foto langsung dari galeri atau penyimpanan perangkat.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      fileInputRef.current?.click();
                    }}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl"
                  >
                    Pilih dari File / Galeri
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  {/* Grid Overlay Guide */}
                  <div className="absolute inset-8 border border-white/40 rounded-2xl pointer-events-none flex items-center justify-center">
                    <div className="w-8 h-8 border-t-2 border-l-2 border-emerald-400 absolute top-0 left-0 rounded-tl-xl" />
                    <div className="w-8 h-8 border-t-2 border-r-2 border-emerald-400 absolute top-0 right-0 rounded-tr-xl" />
                    <div className="w-8 h-8 border-b-2 border-l-2 border-emerald-400 absolute bottom-0 left-0 rounded-bl-xl" />
                    <div className="w-8 h-8 border-b-2 border-r-2 border-emerald-400 absolute bottom-0 right-0 rounded-br-xl" />
                    <span className="text-[11px] font-bold text-white/80 bg-black/50 px-2 py-0.5 rounded-md backdrop-blur-xs">
                      Pusat Produk
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Shutter & Controls */}
            <div className="p-4 bg-slate-950 flex items-center justify-between border-t border-slate-800">
              {capturedPhotoPreview ? (
                <>
                  <button
                    type="button"
                    onClick={handleRetakePhoto}
                    className="px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Foto Ulang</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleConfirmPhoto}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Gunakan Foto Ini</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-white text-xs font-bold cursor-pointer"
                  >
                    Batal
                  </button>

                  {!cameraError && (
                    <button
                      type="button"
                      onClick={handleCapturePhoto}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transform active:scale-95 transition-all cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Jepret Foto</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      fileInputRef.current?.click();
                    }}
                    className="px-3 py-2 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Pilih File
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input & canvas for processing photo captures */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};
