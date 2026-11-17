import React, { useState, useMemo } from 'react';
import { 
  PackagePlus, 
  Search, 
  Plus, 
  Calendar, 
  Truck, 
  Phone, 
  MessageCircle, 
  DollarSign, 
  FileText, 
  Printer, 
  Eye, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  AlertCircle, 
  X, 
  ArrowUpDown, 
  Check, 
  Layers, 
  CalendarDays,
  FileDown,
  Building2,
  Send,
  CreditCard,
  Edit3
} from 'lucide-react';
import { Supplier, Product, ProductUnit, UserRole, RestockOrder, RestockItem, StoreSettings } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime, formatWhatsAppUrl, generatePONumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { deleteDocumentFromFirestore } from '../utils/firebaseSync';

interface PurchaseManagementViewProps {
  purchases: RestockOrder[];
  suppliers: Supplier[];
  products: Product[];
  currentUserRole: UserRole;
  storeSettings?: StoreSettings;
  onSavePurchase: (purchaseOrder: RestockOrder, itemsToRestock: RestockItem[]) => void;
  onDeletePurchase?: (purchaseId: string) => void;
  onOpenSupplierManager?: () => void;
}

export const PurchaseManagementView: React.FC<PurchaseManagementViewProps> = ({
  purchases,
  suppliers,
  products,
  currentUserRole,
  storeSettings,
  onSavePurchase,
  onDeletePurchase,
  onOpenSupplierManager,
}) => {
  const [search, setSearch] = useState('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LUNAS' | 'HUTANG'>('ALL');
  const [isNewPurchaseModalOpen, setIsNewPurchaseModalOpen] = useState(false);
  const [selectedDetailPurchase, setSelectedDetailPurchase] = useState<RestockOrder | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<RestockOrder | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = useState<RestockOrder | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states for New / Edit Purchase Order
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierWhatsapp, setSupplierWhatsapp] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TRANSFER' | 'HUTANG'>('CASH');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  // Items in active purchase order
  interface ActivePurchaseItemRow {
    productId: string;
    productName: string;
    unitId: string;
    unitName: string;
    conversionFactor: number;
    quantity: number;
    costPrice: number;
    total: number;
    expiryDate: string;
  }
  const [orderItems, setOrderItems] = useState<ActivePurchaseItemRow[]>([]);

  // Item selector state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [inputQty, setInputQty] = useState('1');
  const [inputCostPrice, setInputCostPrice] = useState('0');
  const [inputExpiryDate, setInputExpiryDate] = useState('');

  // Physical products only (exclude JASA services, as services do not have physical stock or purchase orders)
  const physicalProducts = useMemo(() => {
    return products.filter((p) => (p.productType || 'BARANG') === 'BARANG');
  }, [products]);

  // Selected product object in row picker
  const activeSelectedProduct = useMemo(() => {
    return physicalProducts.find((p) => p.id === selectedProductId) || null;
  }, [physicalProducts, selectedProductId]);

  // When selected product changes, reset unit and default cost price
  const handleProductSelectionChange = (prodId: string) => {
    setSelectedProductId(prodId);
    const prod = physicalProducts.find((p) => p.id === prodId);
    if (prod && prod.units.length > 0) {
      const firstUnit = prod.units[0];
      setSelectedUnitId(firstUnit.id);
      const effectiveCost = prod.costPrice > 0 ? prod.costPrice : (firstUnit.costPrice || 0);
      setInputCostPrice(String(effectiveCost));
      setInputExpiryDate(prod.expiryDate || '');
    } else {
      setSelectedUnitId('');
      setInputCostPrice('0');
      setInputExpiryDate('');
    }
  };

  // When selected unit changes, auto-scale cost price
  const handleUnitSelectionChange = (uId: string) => {
    setSelectedUnitId(uId);
    if (!activeSelectedProduct) return;
    const unit = activeSelectedProduct.units.find((u) => u.id === uId);
    if (unit) {
      const baseCost = activeSelectedProduct.costPrice > 0 
        ? activeSelectedProduct.costPrice 
        : (activeSelectedProduct.units[0]?.costPrice || 0);
      const estimatedCost = (unit.conversionFactor === 1)
        ? baseCost
        : (unit.costPrice && unit.costPrice > 0 ? unit.costPrice : (baseCost * (unit.conversionFactor || 1)));
      setInputCostPrice(String(estimatedCost));
    }
  };

  // Open modal for new purchase
  const handleOpenNewPurchaseModal = () => {
    sound.playTap();
    setEditingPurchase(null);
    setFormError(null);
    const newPO = generatePONumber();
    setPoNumber(newPO);
    setInvoiceNumber('');
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('CASH');
    setDueDate('');
    setNotes('');
    setOrderItems([]);
    setSelectedProductId('');
    setSelectedUnitId('');
    setInputQty('1');
    setInputCostPrice('0');
    setInputExpiryDate('');

    if (suppliers.length > 0) {
      setSupplierId(suppliers[0].id);
      setSupplierName(suppliers[0].name);
      setSupplierWhatsapp(suppliers[0].whatsapp || suppliers[0].phone);
    } else {
      setSupplierId('');
      setSupplierName('');
      setSupplierWhatsapp('');
    }

    setIsNewPurchaseModalOpen(true);
  };

  // Open modal for editing existing purchase
  const handleOpenEditPurchase = (po: RestockOrder) => {
    sound.playTap();
    setEditingPurchase(po);
    setFormError(null);
    setPoNumber(po.poNumber);
    setInvoiceNumber(po.invoiceNumber || '');
    setPurchaseDate(po.date);
    setPaymentMethod(po.paymentMethod || 'CASH');
    setDueDate(po.dueDate || '');
    setNotes(po.notes || '');
    setSupplierId(po.supplierId || '');
    setSupplierName(po.supplierName || '');
    setSupplierWhatsapp(po.supplierWhatsapp || '');

    // Map existing purchase items to active draft format
    const existingDraftItems: ActivePurchaseItemRow[] = po.items.map((it) => {
      const prod = products.find((p) => p.id === it.productId);
      const matchedUnit = prod?.units.find((u) => u.unitName.toUpperCase() === it.unitName.toUpperCase());
      return {
        productId: it.productId,
        productName: it.productName,
        unitId: matchedUnit?.id || `u_${it.unitName}`,
        unitName: it.unitName,
        conversionFactor: it.conversionFactor || 1,
        quantity: it.quantity,
        costPrice: it.costPrice,
        total: it.total,
        expiryDate: it.expiryDate || '',
      };
    });
    setOrderItems(existingDraftItems);

    setSelectedProductId('');
    setSelectedUnitId('');
    setInputQty('1');
    setInputCostPrice('0');
    setInputExpiryDate('');

    setIsNewPurchaseModalOpen(true);
  };

  // Handle supplier change in modal
  const handleSupplierChange = (sId: string) => {
    setSupplierId(sId);
    const sup = suppliers.find((s) => s.id === sId);
    if (sup) {
      setSupplierName(sup.name);
      setSupplierWhatsapp(sup.whatsapp || sup.phone);
    }
  };

  // Add item row into purchase draft
  const handleAddItemToDraft = () => {
    if (!activeSelectedProduct) {
      alert('Pilih barang yang ingin dibeli terlebih dahulu!');
      return;
    }
    const unit = activeSelectedProduct.units.find((u) => u.id === selectedUnitId) || activeSelectedProduct.units[0];
    const qty = Math.max(1, parseFloat(inputQty) || 1);
    const cost = Math.max(0, parseFloat(inputCostPrice) || 0);

    sound.playTap();

    // Check if already in order items
    const existingIdx = orderItems.findIndex(
      (item) => item.productId === activeSelectedProduct.id && item.unitId === unit.id
    );

    if (existingIdx > -1) {
      const updated = [...orderItems];
      updated[existingIdx].quantity += qty;
      updated[existingIdx].costPrice = cost;
      updated[existingIdx].total = updated[existingIdx].quantity * cost;
      if (inputExpiryDate) updated[existingIdx].expiryDate = inputExpiryDate;
      setOrderItems(updated);
    } else {
      const newItem: ActivePurchaseItemRow = {
        productId: activeSelectedProduct.id,
        productName: activeSelectedProduct.name,
        unitId: unit.id,
        unitName: unit.unitName,
        conversionFactor: unit.conversionFactor || 1,
        quantity: qty,
        costPrice: cost,
        total: qty * cost,
        expiryDate: inputExpiryDate,
      };
      setOrderItems([...orderItems, newItem]);
    }

    // Reset input fields
    setSelectedProductId('');
    setSelectedUnitId('');
    setInputQty('1');
    setInputCostPrice('0');
    setInputExpiryDate('');
  };

  const handleRemoveDraftItem = (index: number) => {
    sound.playTap();
    setOrderItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const draftGrandTotal = useMemo(() => {
    return orderItems.reduce((acc, item) => acc + item.total, 0);
  }, [orderItems]);

  // Submit complete purchase order & restock products
  const handleSubmitPurchaseOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      setFormError('Harap pilih atau masukkan nama supplier!');
      sound.playWarningChime();
      return;
    }
    if (orderItems.length === 0) {
      setFormError('Tambahkan minimal 1 barang ke dalam daftar pembelian!');
      sound.playWarningChime();
      return;
    }

    setFormError(null);
    sound.playSuccessChime();

    const restockItemsPayload: RestockItem[] = orderItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      unitName: item.unitName,
      conversionFactor: item.conversionFactor,
      quantity: item.quantity,
      costPrice: item.costPrice,
      total: item.total,
      expiryDate: item.expiryDate || undefined,
    }));

    const isEdit = !!editingPurchase;
    const purchaseOrderPayload: RestockOrder = {
      id: isEdit ? editingPurchase.id : ('po_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6)),
      poNumber: poNumber.trim() || generatePONumber(),
      supplierId: supplierId || 'sup_general',
      supplierName: supplierName.trim(),
      supplierWhatsapp: supplierWhatsapp.trim(),
      date: purchaseDate,
      items: restockItemsPayload,
      totalAmount: draftGrandTotal,
      status: 'SELESAI',
      notes: notes.trim(),
      invoiceNumber: invoiceNumber.trim() || undefined,
      paymentMethod,
      dueDate: paymentMethod === 'HUTANG' ? dueDate : undefined,
      paidAmount: paymentMethod === 'HUTANG' ? 0 : draftGrandTotal,
      createdAt: isEdit ? (editingPurchase.createdAt || Date.now()) : Date.now(),
    };

    onSavePurchase(purchaseOrderPayload, restockItemsPayload);
    setIsNewPurchaseModalOpen(false);
    setEditingPurchase(null);
  };

  // WhatsApp purchase summary to supplier
  const handleSendWhatsAppToSupplier = (po: RestockOrder) => {
    sound.playTap();
    const phone = po.supplierWhatsapp || '';
    const storeName = storeSettings?.storeName || 'Toko KasirKu';
    
    let msg = `*BUKTI ORDER PEMBELIAN BARANG - ${storeName.toUpperCase()}*\n`;
    msg += `No. PO: *${po.poNumber}*\n`;
    if (po.invoiceNumber) msg += `No. Faktur: ${po.invoiceNumber}\n`;
    msg += `Tanggal: ${po.date}\n`;
    msg += `Supplier: *${po.supplierName}*\n`;
    msg += `Metode Pembayaran: *${po.paymentMethod || 'TUNAI'}*\n`;
    if (po.paymentMethod === 'HUTANG' && po.dueDate) {
      msg += `Jatuh Tempo: ${po.dueDate}\n`;
    }
    msg += `--------------------------------\n`;
    msg += `*DAFTAR BARANG YANG DIBELI:*\n`;
    po.items.forEach((item, idx) => {
      const expStr = item.expiryDate ? ` (Exp: ${item.expiryDate})` : '';
      msg += `${idx + 1}. ${item.productName}${expStr}\n`;
      msg += `   ${item.quantity} ${item.unitName} x ${formatRupiah(item.costPrice)} = ${formatRupiah(item.total)}\n`;
    });
    msg += `--------------------------------\n`;
    msg += `*TOTAL PEMBELIAN: ${formatRupiah(po.totalAmount)}*\n`;
    if (po.notes) msg += `Catatan: ${po.notes}\n`;
    msg += `\nMohon konfirmasi penerimaan pesanan ini. Terima kasih!`;

    const url = formatWhatsAppUrl(phone, msg);
    window.open(url, '_blank');
  };

  // Filtered purchases list
  const filteredPurchases = useMemo(() => {
    return purchases.filter((po) => {
      const matchSearch =
        po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        po.supplierName.toLowerCase().includes(search.toLowerCase()) ||
        (po.invoiceNumber && po.invoiceNumber.toLowerCase().includes(search.toLowerCase())) ||
        po.items.some((it) => it.productName.toLowerCase().includes(search.toLowerCase()));

      const matchSupplier = selectedSupplierFilter === 'ALL' || po.supplierId === selectedSupplierFilter;

      const isHutang = po.paymentMethod === 'HUTANG';
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'HUTANG' && isHutang) ||
        (statusFilter === 'LUNAS' && !isHutang);

      return matchSearch && matchSupplier && matchStatus;
    });
  }, [purchases, search, selectedSupplierFilter, statusFilter]);

  // Analytics
  const totalPurchaseSpend = useMemo(() => {
    return purchases.reduce((acc, po) => acc + po.totalAmount, 0);
  }, [purchases]);

  const totalHutangDagang = useMemo(() => {
    return purchases
      .filter((po) => po.paymentMethod === 'HUTANG')
      .reduce((acc, po) => acc + (po.totalAmount - (po.paidAmount || 0)), 0);
  }, [purchases]);

  const totalItemsReceived = useMemo(() => {
    return purchases.reduce(
      (acc, po) => acc + po.items.reduce((sum, it) => sum + (it.quantity * it.conversionFactor), 0),
      0
    );
  }, [purchases]);

  return (
    <div className="flex-1 bg-slate-100 flex flex-col h-full overflow-hidden">
      {/* Top Header */}
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
              <PackagePlus className="w-5 h-5" />
            </div>
            <span>Pembelian Barang &amp; Restock</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Catat pengadaan barang dari supplier, update stok gudang otomatis, dan kelola faktur pembelian.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenSupplierManager && (
            <button
              type="button"
              onClick={onOpenSupplierManager}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Truck className="w-4 h-4 text-slate-600" />
              <span>Data Supplier</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenNewPurchaseModal}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs md:text-sm flex items-center gap-2 shadow-sm transition-all cursor-pointer hover:shadow-md"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>+ Tambah Pembelian</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="p-4 md:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Nilai Pembelian</div>
          <div className="text-xl font-black text-slate-900 mt-1 font-mono tabular-nums">
            {formatRupiah(totalPurchaseSpend)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Semua riwayat pembelian toko</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Hutang Pembelian (Tempo)</span>
          </div>
          <div className="text-xl font-black text-amber-700 mt-1 font-mono tabular-nums">
            {formatRupiah(totalHutangDagang)}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Tagihan tempo supplier belum lunas</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Transaksi Masuk</div>
          <div className="text-xl font-black text-indigo-700 mt-1 font-mono tabular-nums">
            {purchases.length} Faktur / PO
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Total pesanan pengadaan tersimpan</div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Unit Diterima</div>
          <div className="text-xl font-black text-emerald-700 mt-1 font-mono tabular-nums">
            {formatNumber(totalItemsReceived)} Unit
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">Telah ditambahkan ke stok fisik</div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-4 md:px-6 pb-6 overflow-hidden flex flex-col">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs flex-1 flex flex-col overflow-hidden">
          {/* Filter Bar */}
          <div className="p-3 md:p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari No. PO, faktur, supplier, produk..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
              {/* Status Filter */}
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Semua
                </button>
                <button
                  onClick={() => setStatusFilter('LUNAS')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'LUNAS' ? 'bg-white text-emerald-700 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Lunas
                </button>
                <button
                  onClick={() => setStatusFilter('HUTANG')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === 'HUTANG' ? 'bg-white text-amber-700 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  Hutang (Tempo)
                </button>
              </div>

              {/* Supplier Filter */}
              <select
                value={selectedSupplierFilter}
                onChange={(e) => setSelectedSupplierFilter(e.target.value)}
                className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-semibold focus:outline-none"
              >
                <option value="ALL">Semua Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4">No. PO &amp; Faktur</th>
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Supplier</th>
                  <th className="py-3 px-4">Jumlah Item</th>
                  <th className="py-3 px-4">Status / Metode</th>
                  <th className="py-3 px-4">Total Pembelian</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      <PackagePlus className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-[1.5]" />
                      <p className="font-semibold text-slate-700">Belum ada riwayat pembelian barang</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Klik tombol "+ Tambah Pembelian" untuk mencatat restock barang dari supplier.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredPurchases.map((po) => {
                    const isHutang = po.paymentMethod === 'HUTANG';

                    return (
                      <tr key={po.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-900">{po.poNumber}</div>
                          {po.invoiceNumber && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              Faktur: {po.invoiceNumber}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {po.date}
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{po.supplierName}</div>
                          {po.supplierWhatsapp && (
                            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              <span>{po.supplierWhatsapp}</span>
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 text-slate-600">
                          <span className="font-semibold text-slate-800">{po.items.length} macam barang</span>
                          <div className="text-[10px] text-slate-400">
                            {po.items.reduce((acc, it) => acc + (it.quantity * it.conversionFactor), 0)} unit total
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                            isHutang
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            <span>{po.paymentMethod || 'TUNAI'}</span>
                            {isHutang && po.dueDate && (
                              <span className="text-[10px] font-normal opacity-80">· Tempo {po.dueDate}</span>
                            )}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono font-bold text-indigo-700 tabular-nums">
                          {formatRupiah(po.totalAmount)}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setSelectedDetailPurchase(po);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              title="Lihat Detail & Rincian Faktur Pembelian"
                            >
                              <Eye className="w-3.5 h-3.5 text-indigo-600" />
                              <span>Detail</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenEditPurchase(po)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              title="Edit Transaksi Pembelian Ini"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>

                            {po.supplierWhatsapp && (
                              <button
                                type="button"
                                onClick={() => handleSendWhatsAppToSupplier(po)}
                                className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer"
                                title="Kirim Rekap Pembelian via WhatsApp ke Supplier"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            )}

                            {currentUserRole === 'ADMIN' && onDeletePurchase && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sound.playTap();
                                  setPurchaseToDelete(po);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Hapus Catatan Pembelian Ini"
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

      {/* ===================================================================== */}
      {/* MODAL 1: FORM TRANSAKSI PEMBELIAN BARU                                */}
      {/* ===================================================================== */}
      {isNewPurchaseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 my-auto animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                  editingPurchase ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {editingPurchase ? <Edit3 className="w-5 h-5" /> : <PackagePlus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base md:text-lg font-bold text-slate-900">
                    {editingPurchase ? `Edit Catatan Pembelian (${editingPurchase.poNumber})` : 'Input Transaksi Pembelian Barang (Restock)'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingPurchase
                      ? 'Perbarui rincian barang, supplier, harga beli satuan, atau jatuh tempo faktur.'
                      : 'Stok barang fisik akan otomatis bertambah saat faktur pembelian disimpan.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsNewPurchaseModalOpen(false);
                  setEditingPurchase(null);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2 shrink-0">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Scrollable Form Body */}
            <form onSubmit={handleSubmitPurchaseOrder} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Row 1: Supplier, PO, Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Pilih Supplier *
                  </label>
                  {suppliers.length > 0 ? (
                    <select
                      value={supplierId}
                      onChange={(e) => handleSupplierChange(e.target.value)}
                      required
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:border-indigo-500 bg-white"
                    >
                      <option value="">-- Pilih Supplier --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.contactPerson})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="Ketik nama supplier..."
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:border-indigo-500"
                    />
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    No. PO / Bukti Pembelian *
                  </label>
                  <input
                    type="text"
                    required
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Tanggal Pembelian *
                  </label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Row 2: Invoice Supplier, Payment Method, Due Date */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    No. Faktur Supplier (Opsional)
                  </label>
                  <input
                    type="text"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="Contoh: INV-SPL-88219"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Metode Pembayaran *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-bold focus:border-indigo-500 bg-white"
                  >
                    <option value="CASH">Tunai (Cash)</option>
                    <option value="TRANSFER">Transfer Bank</option>
                    <option value="HUTANG">Hutang Dagang (Tempo)</option>
                  </select>
                </div>

                {paymentMethod === 'HUTANG' ? (
                  <div>
                    <label className="text-xs font-bold text-amber-800 block mb-1">
                      Jatuh Tempo Pembayaran *
                    </label>
                    <input
                      type="date"
                      required
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-amber-300 text-xs font-bold bg-amber-50 focus:border-amber-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      No. WhatsApp Supplier (Rekap)
                    </label>
                    <input
                      type="text"
                      value={supplierWhatsapp}
                      onChange={(e) => setSupplierWhatsapp(e.target.value)}
                      placeholder="08xxxxxxxxxx"
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-mono focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              {/* Row 3: Product Row Input Selector */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-indigo-600" />
                    <span>Pilih Barang &amp; Input Qty Pembelian</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Khusus barang fisik (jasa tidak memerlukan pengadaan stok)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  {/* Product Picker */}
                  <div className="sm:col-span-4">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Barang Fisik</label>
                    <select
                      value={selectedProductId}
                      onChange={(e) => handleProductSelectionChange(e.target.value)}
                      className="w-full p-2 rounded-xl border border-slate-300 text-xs font-bold focus:border-indigo-500 bg-white"
                    >
                      <option value="">-- Pilih Barang Fisik --</option>
                      {physicalProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Stok skrg: {p.stockInBaseUnit} {p.baseUnit})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Unit Picker */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Satuan Beli</label>
                    <select
                      value={selectedUnitId}
                      onChange={(e) => handleUnitSelectionChange(e.target.value)}
                      disabled={!activeSelectedProduct}
                      className="w-full p-2 rounded-xl border border-slate-300 text-xs font-bold focus:border-indigo-500 bg-white disabled:bg-slate-100"
                    >
                      {activeSelectedProduct?.units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unitName} (x{u.conversionFactor})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Qty */}
                  <div className="sm:col-span-1">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={inputQty}
                      onChange={(e) => setInputQty(e.target.value)}
                      disabled={!activeSelectedProduct}
                      className="w-full p-2 rounded-xl border border-slate-300 text-xs font-bold font-mono focus:border-indigo-500 bg-white"
                    />
                  </div>

                  {/* Cost Price */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Harga Beli (Rp)</label>
                    <input
                      type="number"
                      min="0"
                      value={inputCostPrice}
                      onChange={(e) => setInputCostPrice(e.target.value)}
                      disabled={!activeSelectedProduct}
                      className="w-full p-2 rounded-xl border border-slate-300 text-xs font-bold font-mono focus:border-indigo-500 bg-white"
                    />
                  </div>

                  {/* Expiry Date */}
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">Tgl Kadaluarsa</label>
                    <input
                      type="date"
                      value={inputExpiryDate}
                      onChange={(e) => setInputExpiryDate(e.target.value)}
                      disabled={!activeSelectedProduct}
                      className="w-full p-2 rounded-xl border border-slate-300 text-xs font-medium focus:border-indigo-500 bg-white"
                    />
                  </div>

                  {/* Add button */}
                  <div className="sm:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddItemToDraft}
                      disabled={!activeSelectedProduct}
                      className="w-full p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-40 transition-colors flex items-center justify-center cursor-pointer shadow-2xs"
                      title="Tambahkan Barang ke Daftar Pembelian"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Items List Table */}
              <div>
                <label className="text-xs font-bold text-slate-800 block mb-1.5">
                  Daftar Barang Masuk ({orderItems.length} item)
                </label>
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">Barang</th>
                        <th className="py-2.5 px-3">Satuan &amp; Konversi</th>
                        <th className="py-2.5 px-3">Qty Beli</th>
                        <th className="py-2.5 px-3">Harga Beli</th>
                        <th className="py-2.5 px-3">Subtotal</th>
                        <th className="py-2.5 px-3">Tgl Expired</th>
                        <th className="py-2.5 px-3 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {orderItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            Belum ada barang ditambahkan ke daftar pembelian ini.
                          </td>
                        </tr>
                      ) : (
                        orderItems.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {item.productName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 font-mono">
                              {item.unitName} {item.conversionFactor > 1 ? `(x${item.conversionFactor})` : ''}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                              {item.quantity} {item.unitName}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-700">
                              {formatRupiah(item.costPrice)}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                              {formatRupiah(item.total)}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-slate-600">
                              {item.expiryDate ? (
                                <span className="inline-flex items-center gap-1 text-[11px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200">
                                  <CalendarDays className="w-3 h-3 text-amber-600" />
                                  <span>{item.expiryDate}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveDraftItem(idx)}
                                className="p-1 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total & Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start pt-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Catatan Pembelian (Opsional)
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Contoh: Barang datang via ekspedisi, kondisi kardus mulus..."
                    className="w-full p-2 rounded-xl border border-slate-300 text-xs focus:border-indigo-500"
                  />
                </div>

                <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-xs text-indigo-950 font-bold">
                    <span>TOTAL TAGIHAN PEMBELIAN:</span>
                    <span className="text-lg font-black font-mono text-indigo-700 tabular-nums">
                      {formatRupiah(draftGrandTotal)}
                    </span>
                  </div>
                  <div className="text-[10px] text-indigo-700 mt-1">
                    {editingPurchase
                      ? `Menyimpan pembaruan faktur ${editingPurchase.poNumber} (${orderItems.length} macam barang).`
                      : `Setelah disimpan, total ${orderItems.reduce((acc, it) => acc + (it.quantity * it.conversionFactor), 0)} unit akan otomatis masuk ke saldo stok masing-masing barang.`}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewPurchaseModalOpen(false);
                    setEditingPurchase(null);
                  }}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-100 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 cursor-pointer flex items-center gap-1.5"
                >
                  {editingPurchase ? <Edit3 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{editingPurchase ? 'Perbarui & Simpan Faktur' : 'Simpan & Masukkan ke Stok Gudang'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: DETAIL FAKTUR PEMBELIAN (VIEW / PRINT / WHATSAPP)            */}
      {/* ===================================================================== */}
      {selectedDetailPurchase && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Faktur Pembelian: {selectedDetailPurchase.poNumber}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                    <span>Supplier: <strong className="text-slate-700">{selectedDetailPurchase.supplierName}</strong></span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{selectedDetailPurchase.createdAt ? formatDateTime(selectedDetailPurchase.createdAt) : selectedDetailPurchase.date}</span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailPurchase(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metadata Badges */}
            <div className="py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">Metode Bayar</span>
                <span className="font-bold text-slate-800">{selectedDetailPurchase.paymentMethod || 'TUNAI'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">No. Faktur Supplier</span>
                <span className="font-mono font-bold text-slate-800">{selectedDetailPurchase.invoiceNumber || '-'}</span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">Status Pengadaan</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>DITERIMA (FIFO SYNC)</span>
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-semibold">Total Nilai PO</span>
                <span className="font-mono font-black text-indigo-700">{formatRupiah(selectedDetailPurchase.totalAmount)}</span>
              </div>
            </div>

            {/* Items Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden my-3">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Nama Barang</th>
                    <th className="py-2.5 px-3">Qty &amp; Satuan</th>
                    <th className="py-2.5 px-3">Unit Fisik (Konversi)</th>
                    <th className="py-2.5 px-3">Harga Beli Satuan</th>
                    <th className="py-2.5 px-3">Subtotal</th>
                    <th className="py-2.5 px-3">Kadaluarsa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedDetailPurchase.items.map((it, idx) => {
                    const factor = it.conversionFactor || 1;
                    const totalBaseUnits = it.quantity * factor;

                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-bold text-slate-900">{it.productName}</td>
                        <td className="py-2 px-3 font-mono text-slate-700">
                          {it.quantity} {it.unitName}
                        </td>
                        <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                          {totalBaseUnits} unit {factor > 1 ? `(x${factor})` : ''}
                        </td>
                        <td className="py-2 px-3 font-mono text-slate-700">{formatRupiah(it.costPrice)}</td>
                        <td className="py-2 px-3 font-mono font-bold text-indigo-700">{formatRupiah(it.total)}</td>
                        <td className="py-2 px-3 text-slate-600">
                          {it.expiryDate ? (
                            <span className="text-[11px] bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded font-mono font-bold">
                              {it.expiryDate}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {selectedDetailPurchase.notes && (
              <div className="text-xs text-slate-600 italic mb-4 p-2 bg-slate-50 rounded-xl">
                Catatan: {selectedDetailPurchase.notes}
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2">
              {selectedDetailPurchase.supplierWhatsapp ? (
                <button
                  type="button"
                  onClick={() => handleSendWhatsAppToSupplier(selectedDetailPurchase)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Kirim Rekap via WhatsApp Supplier</span>
                </button>
              ) : <div />}

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const po = selectedDetailPurchase;
                    setSelectedDetailPurchase(null);
                    handleOpenEditPurchase(po);
                  }}
                  className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Pembelian</span>
                </button>

                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak</span>
                </button>

                {currentUserRole === 'ADMIN' && onDeletePurchase && (
                  <button
                    type="button"
                    onClick={() => {
                      const po = selectedDetailPurchase;
                      setSelectedDetailPurchase(null);
                      setPurchaseToDelete(po);
                    }}
                    className="p-2.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                    title="Hapus Catatan Pembelian Ini"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Hapus</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedDetailPurchase(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: IN-APP CONFIRMATION MODAL - DELETE PURCHASE ORDER           */}
      {/* ===================================================================== */}
      {purchaseToDelete && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Hapus Catatan Pembelian?</h3>
                <p className="text-xs text-slate-500">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <div className="text-xs font-bold text-slate-900">No. PO: {purchaseToDelete.poNumber}</div>
              <div className="text-[11px] text-slate-500">
                Supplier: {purchaseToDelete.supplierName} • Tanggal: {purchaseToDelete.date}
              </div>
              <div className="text-[11px] text-indigo-700 font-bold">
                Total: {formatRupiah(purchaseToDelete.totalAmount)} ({purchaseToDelete.items?.length || 0} macam barang)
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Apakah Anda yakin ingin menghapus catatan pembelian ini? Catatan akan dihapus secara permanen dari riwayat pembelian toko dan sinkronisasi database online.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPurchaseToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  sound.playSuccessChime();
                  const targetId = purchaseToDelete.id;
                  setPurchaseToDelete(null);
                  try {
                    await deleteDocumentFromFirestore('purchases', targetId);
                  } catch (err) {
                    console.warn('[Firestore] Delete purchase notice:', err);
                  }
                  if (onDeletePurchase) onDeletePurchase(targetId);
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
