import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Building2,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  PackageCheck,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  Product,
  StockTransferRecord,
  StoreSettings,
  StoreUnit,
} from '../types/pos';
import { formatDateTime, formatNumber, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';

interface CrossBranchStockPanelProps {
  products: Product[];
  storeSettings?: StoreSettings;
  onUpdateStoreSettings?: (nextSettings: StoreSettings) => void;
  onSaveProducts?: (products: Product[]) => Promise<void> | void;
  requestedByName?: string;
}

export const CrossBranchStockPanel: React.FC<CrossBranchStockPanelProps> = ({
  products = [],
  storeSettings,
  onUpdateStoreSettings,
  onSaveProducts,
  requestedByName = 'Manajer Toko',
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'SHORTAGE' | 'ALL'>('SHORTAGE');
  const [isManageBranchesOpen, setIsManageBranchesOpen] = useState<boolean>(false);
  const [transferModalProduct, setTransferModalProduct] = useState<Product | null>(null);
  const [stockEditProduct, setStockEditProduct] = useState<Product | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Branch creation form state
  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    address: '',
    managerName: '',
    whatsapp: '',
  });

  // Transfer modal state
  const [transferForm, setTransferForm] = useState({
    sourceUnitId: '',
    targetUnitId: '',
    quantity: '10',
    notes: '',
    executeImmediately: true,
  });

  // Quick branch stock edit state
  const [branchStockDraft, setBranchStockDraft] = useState<Record<string, string>>({});

  // Effective Store Units (Primary store is always anchored from storeSettings)
  const storeUnits: StoreUnit[] = useMemo(() => {
    const saved = storeSettings?.storeUnits || [];
    if (saved.length === 0) {
      return [
        {
          id: 'unit_pusat',
          name: storeSettings?.storeName || 'Toko Utama',
          code: 'PST',
          address: storeSettings?.storeAddress || '',
          whatsapp: storeSettings?.storePhone || '',
          isPrimary: true,
        },
      ];
    }
    return saved;
  }, [storeSettings]);

  const primaryUnit = storeUnits.find((u) => u.isPrimary) || storeUnits[0];
  const hasMultipleUnits = storeUnits.length > 1;
  const transferHistory = storeSettings?.stockTransferRequests || [];

  const getStockForUnit = (prod: Product, unitId: string): number => {
    if (unitId === primaryUnit?.id) {
      return Math.max(0, prod.stockInBaseUnit ?? 0);
    }
    return Math.max(0, prod.branchStocks?.[unitId] ?? 0);
  };

  // Evaluate physical products cross-branch
  const crossBranchRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products
      .filter((p) => (p.productType || 'BARANG') === 'BARANG')
      .map((p) => {
        const minAlert = Math.max(1, p.minStockAlert ?? 10);
        const unitEntries = storeUnits.map((u) => {
          const qty = getStockForUnit(p, u.id);
          return {
            unit: u,
            qty,
            isLow: qty <= minAlert,
            isOut: qty <= 0,
            surplusAboveMin: Math.max(0, qty - minAlert),
          };
        });

        const lowUnits = unitEntries.filter((e) => e.isLow);
        const surplusUnits = unitEntries
          .filter((e) => e.surplusAboveMin > 0)
          .sort((a, b) => b.surplusAboveMin - a.surplusAboveMin);

        const canMutate = lowUnits.length > 0 && surplusUnits.length > 0;
        const primaryEntry = unitEntries[0];

        return {
          product: p,
          minAlert,
          unitEntries,
          lowUnits,
          surplusUnits,
          canMutate,
          primaryLow: Boolean(primaryEntry?.isLow),
          totalNetworkStock: unitEntries.reduce((s, e) => s + e.qty, 0),
        };
      })
      .filter((row) => {
        if (filterMode === 'SHORTAGE' && row.lowUnits.length === 0) return false;
        if (!q) return true;
        return (
          row.product.name.toLowerCase().includes(q) ||
          (row.product.barcode || '').toLowerCase().includes(q) ||
          row.product.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.canMutate !== b.canMutate) return a.canMutate ? -1 : 1;
        if (a.lowUnits.length !== b.lowUnits.length) return b.lowUnits.length - a.lowUnits.length;
        return a.product.name.localeCompare(b.product.name);
      });
  }, [products, storeUnits, primaryUnit, searchTerm, filterMode]);

  const showToast = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(null), 4500);
  };

  const handleAddBranchUnit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSettings || !onUpdateStoreSettings) return;
    if (!branchForm.name.trim()) return;
    sound.playTap();

    const baseUnits: StoreUnit[] =
      (storeSettings.storeUnits && storeSettings.storeUnits.length > 0)
        ? storeSettings.storeUnits
        : [primaryUnit];

    const newUnit: StoreUnit = {
      id: `unit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: branchForm.name.trim(),
      code:
        branchForm.code.trim().toUpperCase() ||
        `CBG-${String(baseUnits.length + 1).padStart(2, '0')}`,
      address: branchForm.address.trim(),
      managerName: branchForm.managerName.trim(),
      whatsapp: branchForm.whatsapp.trim(),
      isPrimary: false,
    };

    onUpdateStoreSettings({
      ...storeSettings,
      storeUnits: [...baseUnits, newUnit],
    });
    setBranchForm({ name: '', code: '', address: '', managerName: '', whatsapp: '' });
    showToast(`Unit cabang "${newUnit.name}" ditambahkan ke jaringan stok silang.`);
  };

  const handleRemoveBranchUnit = (unitId: string) => {
    if (!storeSettings || !onUpdateStoreSettings) return;
    if (unitId === primaryUnit?.id) return;
    sound.playTap();
    const nextUnits = storeUnits.filter((u) => u.id !== unitId);
    onUpdateStoreSettings({
      ...storeSettings,
      storeUnits: nextUnits,
    });
  };

  const openTransferModal = (row: (typeof crossBranchRows)[number]) => {
    sound.playTap();
    const defaultSource =
      row.surplusUnits[0]?.unit.id ||
      storeUnits.find((u) => u.id !== row.lowUnits[0]?.unit.id)?.id ||
      storeUnits[0]?.id ||
      '';
    const defaultTarget =
      row.lowUnits[0]?.unit.id ||
      storeUnits.find((u) => u.id !== defaultSource)?.id ||
      storeUnits[1]?.id ||
      '';

    const suggestedQty = Math.max(
      1,
      Math.min(
        row.surplusUnits[0]?.surplusAboveMin || 5,
        Math.max(5, row.minAlert - (row.lowUnits[0]?.qty || 0))
      )
    );

    setTransferForm({
      sourceUnitId: defaultSource,
      targetUnitId: defaultTarget,
      quantity: String(suggestedQty),
      notes: `Mutasi stok menipis (${row.product.name})`,
      executeImmediately: true,
    });
    setTransferModalProduct(row.product);
  };

  const openEditBranchStockModal = (prod: Product) => {
    sound.playTap();
    const draft: Record<string, string> = {};
    storeUnits.forEach((u) => {
      draft[u.id] = String(getStockForUnit(prod, u.id));
    });
    setBranchStockDraft(draft);
    setStockEditProduct(prod);
  };

  const handleSaveBranchStocks = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockEditProduct || !onSaveProducts) return;
    sound.playTap();

    const nextBranchStocks: Record<string, number> = {
      ...(stockEditProduct.branchStocks || {}),
    };
    let nextPrimaryStock = stockEditProduct.stockInBaseUnit;

    storeUnits.forEach((u) => {
      const val = Math.max(0, Math.round(parseFloat(branchStockDraft[u.id] || '0') || 0));
      nextBranchStocks[u.id] = val;
      if (u.id === primaryUnit?.id) {
        nextPrimaryStock = val;
      }
    });

    const updatedProducts = products.map((p) =>
      p.id === stockEditProduct.id
        ? {
            ...p,
            stockInBaseUnit: nextPrimaryStock,
            branchStocks: nextBranchStocks,
          }
        : p
    );
    await onSaveProducts(updatedProducts);
    showToast(`Stok lintas cabang untuk "${stockEditProduct.name}" berhasil diperbarui.`);
    setStockEditProduct(null);
  };

  const handleSubmitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferModalProduct || !storeSettings || !onUpdateStoreSettings) return;
    const qty = Math.max(1, Math.round(parseFloat(transferForm.quantity) || 0));
    if (transferForm.sourceUnitId === transferForm.targetUnitId) return;

    const sourceUnit = storeUnits.find((u) => u.id === transferForm.sourceUnitId);
    const targetUnit = storeUnits.find((u) => u.id === transferForm.targetUnitId);
    if (!sourceUnit || !targetUnit) return;

    const availableSource = getStockForUnit(transferModalProduct, sourceUnit.id);
    if (transferForm.executeImmediately && qty > availableSource) {
      showToast(
        `Stok di ${sourceUnit.name} (${availableSource} ${transferModalProduct.baseUnit}) tidak mencukupi untuk mutasi langsung.`
      );
      return;
    }

    sound.playTap();

    const now = Date.now();
    const transferRecord: StockTransferRecord = {
      id: `mut_${now}_${Math.random().toString(36).slice(2, 6)}`,
      transferCode: `MUT-${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}-${String(
        transferHistory.length + 1
      ).padStart(3, '0')}`,
      timestamp: now,
      productId: transferModalProduct.id,
      productName: transferModalProduct.name,
      baseUnit: transferModalProduct.baseUnit,
      sourceUnitId: sourceUnit.id,
      sourceUnitName: sourceUnit.name,
      targetUnitId: targetUnit.id,
      targetUnitName: targetUnit.name,
      quantity: qty,
      status: transferForm.executeImmediately ? 'COMPLETED' : 'REQUESTED',
      requestedBy: requestedByName,
      notes: transferForm.notes.trim(),
    };

    if (transferForm.executeImmediately && onSaveProducts) {
      const nextSourceQty = Math.max(0, availableSource - qty);
      const nextTargetQty = getStockForUnit(transferModalProduct, targetUnit.id) + qty;
      const nextBranchStocks: Record<string, number> = {
        ...(transferModalProduct.branchStocks || {}),
        [sourceUnit.id]: nextSourceQty,
        [targetUnit.id]: nextTargetQty,
      };
      let nextPrimaryStock = transferModalProduct.stockInBaseUnit;
      if (sourceUnit.id === primaryUnit?.id) nextPrimaryStock = nextSourceQty;
      if (targetUnit.id === primaryUnit?.id) nextPrimaryStock = nextTargetQty;

      const updatedProducts = products.map((p) =>
        p.id === transferModalProduct.id
          ? {
              ...p,
              stockInBaseUnit: nextPrimaryStock,
              branchStocks: nextBranchStocks,
            }
          : p
      );
      await onSaveProducts(updatedProducts);
    }

    onUpdateStoreSettings({
      ...storeSettings,
      stockTransferRequests: [transferRecord, ...transferHistory].slice(0, 40),
    });

    showToast(
      transferForm.executeImmediately
        ? `Mutasi ${qty} ${transferModalProduct.baseUnit} "${transferModalProduct.name}" dari ${sourceUnit.name} ke ${targetUnit.name} selesai.`
        : `Permintaan mutasi ${transferRecord.transferCode} tercatat untuk koordinasi cabang.`
    );
    setTransferModalProduct(null);
  };

  const handleCompletePendingTransfer = async (rec: StockTransferRecord) => {
    if (!storeSettings || !onUpdateStoreSettings || !onSaveProducts) return;
    const prod = products.find((p) => p.id === rec.productId);
    if (!prod) return;
    sound.playTap();

    const availableSource = getStockForUnit(prod, rec.sourceUnitId);
    if (rec.quantity > availableSource) {
      showToast(
        `Stok di ${rec.sourceUnitName} (${availableSource} ${prod.baseUnit}) belum cukup untuk menyelesaikan mutasi.`
      );
      return;
    }

    const nextSourceQty = availableSource - rec.quantity;
    const nextTargetQty = getStockForUnit(prod, rec.targetUnitId) + rec.quantity;
    const nextBranchStocks: Record<string, number> = {
      ...(prod.branchStocks || {}),
      [rec.sourceUnitId]: nextSourceQty,
      [rec.targetUnitId]: nextTargetQty,
    };
    let nextPrimaryStock = prod.stockInBaseUnit;
    if (rec.sourceUnitId === primaryUnit?.id) nextPrimaryStock = nextSourceQty;
    if (rec.targetUnitId === primaryUnit?.id) nextPrimaryStock = nextTargetQty;

    await onSaveProducts(
      products.map((p) =>
        p.id === prod.id
          ? { ...p, stockInBaseUnit: nextPrimaryStock, branchStocks: nextBranchStocks }
          : p
      )
    );

    onUpdateStoreSettings({
      ...storeSettings,
      stockTransferRequests: transferHistory.map((t) =>
        t.id === rec.id ? { ...t, status: 'COMPLETED' } : t
      ),
    });
    showToast(`Mutasi ${rec.transferCode} selesai dan saldo stok cabang diperbarui.`);
  };

  const pendingTransfers = transferHistory.filter((t) => t.status !== 'COMPLETED');
  const mutatableShortagesCount = crossBranchRows.filter((r) => r.canMutate).length;

  return (
    <section className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 space-y-4">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <h3 className="text-sm md:text-base font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-sky-600 shrink-0" />
            <span>Pengecekan Stok Silang &amp; Koordinasi Mutasi Antar Cabang</span>
          </h3>
          <p className="text-xs text-slate-500">
            {hasMultipleUnits
              ? `${formatNumber(storeUnits.length)} unit toko aktif · ${formatNumber(
                  mutatableShortagesCount
                )} produk menipis dapat langsung dimutasi dari cabang surplus.`
              : 'Aktif otomatis saat terdapat lebih dari satu unit toko/cabang untuk koordinasi stok antar outlet.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {storeSettings && onUpdateStoreSettings && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsManageBranchesOpen((v) => !v);
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-sky-400" />
              <span>
                {hasMultipleUnits
                  ? `Kelola Unit Toko (${storeUnits.length})`
                  : 'Tambah Unit Toko / Cabang'}
              </span>
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Branch Manager Drawer */}
      {isManageBranchesOpen && storeSettings && onUpdateStoreSettings && (
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900">Daftar Unit Toko / Cabang Terdaftar</h4>
            <button
              type="button"
              onClick={() => setIsManageBranchesOpen(false)}
              className="text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {storeUnits.map((unit) => (
              <div
                key={unit.id}
                className="p-3 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-2"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>{unit.name}</span>
                    {unit.code && (
                      <span className="text-[10px] font-mono text-sky-700">({unit.code})</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {unit.isPrimary ? 'Unit Utama (POS Aktif)' : 'Unit Cabang'}
                    {unit.managerName ? ` · PIC: ${unit.managerName}` : ''}
                  </div>
                  {unit.whatsapp && (
                    <div className="text-[11px] font-mono text-slate-600">WA: {unit.whatsapp}</div>
                  )}
                </div>
                {!unit.isPrimary && (
                  <button
                    type="button"
                    onClick={() => handleRemoveBranchUnit(unit.id)}
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer shrink-0"
                    title="Hapus unit cabang"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={handleAddBranchUnit}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-200"
          >
            <input
              type="text"
              required
              value={branchForm.name}
              onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nama Cabang (misal: Cabang Kemang)"
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
            />
            <input
              type="text"
              value={branchForm.code}
              onChange={(e) => setBranchForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="Kode (misal: KMG)"
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono"
            />
            <input
              type="text"
              value={branchForm.managerName}
              onChange={(e) => setBranchForm((p) => ({ ...p, managerName: e.target.value }))}
              placeholder="Nama PIC / Kepala Cabang"
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
            />
            <input
              type="text"
              value={branchForm.whatsapp}
              onChange={(e) => setBranchForm((p) => ({ ...p, whatsapp: e.target.value }))}
              placeholder="No. WA PIC (0812...)"
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold cursor-pointer"
            >
              Simpan Cabang
            </button>
          </form>
        </div>
      )}

      {/* Multi-Unit Cross-Branch Matrix (Shown when > 1 store unit exists) */}
      {!hasMultipleUnits ? (
        <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-600">
            Saat ini hanya terdaftar 1 unit toko (<strong>{primaryUnit?.name}</strong>). Tambahkan
            minimal 1 unit cabang lagi untuk memantau ketersediaan stok lintas cabang dan
            mengkoordinasikan mutasi stok otomatis saat terjadi kekurangan barang.
          </div>
          {storeSettings && onUpdateStoreSettings && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsManageBranchesOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Daftarkan Cabang Kedua
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs self-start">
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setFilterMode('SHORTAGE');
                }}
                className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                  filterMode === 'SHORTAGE'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Perlu Mutasi / Menipis
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setFilterMode('ALL');
                }}
                className={`px-3 py-1 rounded-lg font-semibold cursor-pointer ${
                  filterMode === 'ALL'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua Produk ({products.filter((p) => (p.productType || 'BARANG') === 'BARANG').length})
              </button>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari barang / SKU lintas cabang..."
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs w-full sm:w-64 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Matrix Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Produk &amp; Min. Stok</th>
                  {storeUnits.map((u) => (
                    <th key={u.id} className="py-2.5 px-3 text-right whitespace-nowrap">
                      {u.name}
                    </th>
                  ))}
                  <th className="py-2.5 px-3">Rekomendasi Mutasi</th>
                  <th className="py-2.5 px-3 text-right">Aksi Koordinasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {crossBranchRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={storeUnits.length + 3}
                      className="py-8 text-center text-slate-500"
                    >
                      {filterMode === 'SHORTAGE'
                        ? 'Tidak ada barang kekurangan stok saat ini. Ubah filter ke "Semua Produk" untuk cek seluruh stok cabang.'
                        : 'Tidak ada produk yang cocok dengan pencarian.'}
                    </td>
                  </tr>
                ) : (
                  crossBranchRows.slice(0, 15).map((row) => (
                    <tr key={row.product.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900">{row.product.name}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {row.product.category} · Min {formatNumber(row.minAlert)}{' '}
                          {row.product.baseUnit}
                        </div>
                      </td>

                      {row.unitEntries.map((ue) => (
                        <td
                          key={ue.unit.id}
                          className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap"
                        >
                          <span
                            className={`font-bold ${
                              ue.isOut
                                ? 'text-rose-700'
                                : ue.isLow
                                ? 'text-amber-700'
                                : 'text-emerald-700'
                            }`}
                          >
                            {formatNumber(ue.qty)} {row.product.baseUnit}
                          </span>
                        </td>
                      ))}

                      <td className="py-2.5 px-3 text-[11px]">
                        {row.canMutate ? (
                          <span className="font-semibold text-sky-800">
                            Ambil dari {row.surplusUnits[0].unit.name} (surplus +
                            {formatNumber(row.surplusUnits[0].surplusAboveMin)})
                          </span>
                        ) : row.lowUnits.length > 0 ? (
                          <span className="font-semibold text-rose-700">
                            Semua cabang menipis — perlu PO supplier
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-semibold">Stok Merata Aman</span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditBranchStockModal(row.product)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                          >
                            Set Stok
                          </button>
                          <button
                            type="button"
                            onClick={() => openTransferModal(row)}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowLeftRight className="w-3 h-3 text-sky-400" />
                            <span>Mutasi</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pending / Recent Inter-Branch Transfer Logs */}
          {transferHistory.length > 0 && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <h4 className="font-bold text-slate-900">
                  Riwayat Koordinasi Mutasi Stok Antar Cabang ({transferHistory.length})
                </h4>
                {pendingTransfers.length > 0 && (
                  <span className="font-mono tabular-nums font-bold text-amber-700">
                    {pendingTransfers.length} menunggu eksekusi
                  </span>
                )}
              </div>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {transferHistory.slice(0, 5).map((rec) => {
                  const sourceUnit = storeUnits.find((u) => u.id === rec.sourceUnitId);
                  const waMessage =
                    `Halo ${sourceUnit?.managerName || sourceUnit?.name || 'Tim Cabang'},\n` +
                    `Mohon koordinasi mutasi stok antar cabang (*${rec.transferCode}*):\n` +
                    `• Produk: *${rec.productName}*\n` +
                    `• Jumlah: *${rec.quantity} ${rec.baseUnit}*\n` +
                    `• Dari: ${rec.sourceUnitName} -> Ke: ${rec.targetUnitName}\n` +
                    `${rec.notes ? `• Catatan: ${rec.notes}\n` : ''}` +
                    `Terima kasih.`;
                  const waUrl = formatWhatsAppUrl(sourceUnit?.whatsapp || '', waMessage);

                  return (
                    <div
                      key={rec.id}
                      className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs bg-white"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-slate-900">
                            {rec.transferCode}
                          </span>
                          <span className="font-bold text-slate-800">{rec.productName}</span>
                          <span className="font-mono tabular-nums font-bold text-sky-700">
                            {formatNumber(rec.quantity)} {rec.baseUnit}
                          </span>
                          <span
                            className={`text-[11px] font-bold ${
                              rec.status === 'COMPLETED' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            · {rec.status === 'COMPLETED' ? 'Selesai' : 'Diminta'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {rec.sourceUnitName} → {rec.targetUnitName} · {formatDateTime(rec.timestamp)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center gap-1"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>WA Cabang</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                        {rec.status !== 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={() => handleCompletePendingTransfer(rec)}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <PackageCheck className="w-3 h-3 text-emerald-400" />
                            <span>Selesaikan</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: Transfer / Coordinate Mutasi */}
      {transferModalProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-bold">Koordinasi Mutasi Stok Antar Cabang</h4>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalProduct(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitTransfer} className="p-5 space-y-3.5 text-xs">
              <div>
                <div className="text-slate-500">Produk</div>
                <div className="font-bold text-slate-900 text-sm">
                  {transferModalProduct.name} ({transferModalProduct.baseUnit})
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Dari Cabang Asal</label>
                  <select
                    value={transferForm.sourceUnitId}
                    onChange={(e) =>
                      setTransferForm((p) => ({ ...p, sourceUnitId: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                  >
                    {storeUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({getStockForUnit(transferModalProduct, u.id)})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ke Cabang Tujuan</label>
                  <select
                    value={transferForm.targetUnitId}
                    onChange={(e) =>
                      setTransferForm((p) => ({ ...p, targetUnitId: e.target.value }))
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900"
                  >
                    {storeUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({getStockForUnit(transferModalProduct, u.id)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Jumlah Mutasi ({transferModalProduct.baseUnit})
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferForm.quantity}
                  onChange={(e) => setTransferForm((p) => ({ ...p, quantity: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan Koordinasi</label>
                <input
                  type="text"
                  value={transferForm.notes}
                  onChange={(e) => setTransferForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-900"
                />
              </div>

              <label className="flex items-start gap-2 p-3 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={transferForm.executeImmediately}
                  onChange={(e) =>
                    setTransferForm((p) => ({ ...p, executeImmediately: e.target.checked }))
                  }
                  className="w-4 h-4 mt-0.5 accent-sky-600 cursor-pointer"
                />
                <span>
                  Langsung pindahkan saldo stok antar cabang sekarang (nonaktifkan jika baru berupa{' '}
                  <strong>Permintaan Mutasi</strong>).
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransferModalProduct(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={transferForm.sourceUnitId === transferForm.targetUnitId}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-sky-400" />
                  <span>
                    {transferForm.executeImmediately ? 'Eksekusi Mutasi' : 'Kirim Permintaan'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Update Branch Stock Balances */}
      {stockEditProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <h4 className="text-sm font-bold">Perbarui Saldo Stok per Cabang</h4>
              <button
                type="button"
                onClick={() => setStockEditProduct(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveBranchStocks} className="p-5 space-y-3 text-xs">
              <div className="font-bold text-slate-900 text-sm">
                {stockEditProduct.name} ({stockEditProduct.baseUnit})
              </div>
              <div className="space-y-2">
                {storeUnits.map((u) => (
                  <div key={u.id} className="flex items-center justify-between gap-3">
                    <label className="font-semibold text-slate-700">{u.name}</label>
                    <input
                      type="number"
                      min="0"
                      value={branchStockDraft[u.id] ?? '0'}
                      onChange={(e) =>
                        setBranchStockDraft((prev) => ({ ...prev, [u.id]: e.target.value }))
                      }
                      className="w-28 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-right text-slate-900"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStockEditProduct(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 font-semibold text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  Simpan Saldo Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
