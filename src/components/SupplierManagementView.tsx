import React, { useState } from 'react';
import { 
  Truck, 
  Search, 
  Plus, 
  Phone, 
  MessageCircle, 
  MapPin, 
  Edit3, 
  Trash2, 
  X,
  ClipboardList,
  CheckCircle2,
  PackagePlus,
  Send
} from 'lucide-react';
import { Supplier, Product, ProductUnit, UserRole, RestockItem } from '../types/pos';
import { formatRupiah, formatNumber, formatWhatsAppUrl, generatePONumber } from '../utils/formatters';
import { sound } from '../utils/audio';

interface SupplierManagementViewProps {
  suppliers: Supplier[];
  products: Product[];
  currentUserRole: UserRole;
  onAddSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'>) => void;
  onUpdateSupplier: (supplier: Supplier) => void;
  onDeleteSupplier: (supplierId: string) => void;
  onCompleteRestock: (supplier: Supplier, items: RestockItem[]) => void;
}

export const SupplierManagementView: React.FC<SupplierManagementViewProps> = ({
  suppliers,
  products,
  currentUserRole,
  onAddSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
  onCompleteRestock,
}) => {
  const [search, setSearch] = useState('');
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Supplier Form
  const [name, setName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [categories, setCategories] = useState('Sembako');

  // Purchase Order / Restock Modal state
  const [activeRestockSupplier, setActiveRestockSupplier] = useState<Supplier | null>(null);
  const [restockItems, setRestockItems] = useState<RestockItem[]>([]);
  const [selectedProductToAdd, setSelectedProductToAdd] = useState<string>('');
  const [selectedUnitToAdd, setSelectedUnitToAdd] = useState<string>('');
  const [qtyToAdd, setQtyToAdd] = useState<string>('5');
  const [costPriceToAdd, setCostPriceToAdd] = useState<string>('0');

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
      s.phone.includes(search) ||
      s.whatsapp.includes(search)
  );

  const startEdit = (s: Supplier) => {
    sound.playTap();
    setEditingSupplier(s);
    setName(s.name);
    setContactPerson(s.contactPerson);
    setPhone(s.phone);
    setWhatsapp(s.whatsapp);
    setAddress(s.address);
    setCategories(s.suppliedCategories.join(', '));
    setIsAddingNew(false);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    sound.playSuccessChime();
    const payload = {
      name: name.trim(),
      contactPerson: contactPerson.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || phone.trim(),
      address: address.trim(),
      suppliedCategories: categories.split(',').map((c) => c.trim()).filter(Boolean),
    };

    if (editingSupplier) {
      onUpdateSupplier({ ...editingSupplier, ...payload });
      setEditingSupplier(null);
    } else {
      onAddSupplier(payload);
      setIsAddingNew(false);
    }
  };

  const handleOpenRestock = (s: Supplier) => {
    sound.playTap();
    setActiveRestockSupplier(s);
    setRestockItems([]);
    if (products.length > 0) {
      setSelectedProductToAdd(products[0].id);
      setSelectedUnitToAdd(products[0].units[0]?.unitName || 'PCS');
      setCostPriceToAdd(products[0].units[0]?.costPrice?.toString() || products[0].costPrice.toString());
    }
  };

  const handleAddRestockItem = () => {
    sound.playTap();
    const prod = products.find((p) => p.id === selectedProductToAdd);
    if (!prod) return;

    const unit = prod.units.find((u) => u.unitName === selectedUnitToAdd) || prod.units[0];
    const qty = parseFloat(qtyToAdd) || 1;
    const price = parseFloat(costPriceToAdd) || unit.costPrice || prod.costPrice;

    setRestockItems([
      ...restockItems,
      {
        productId: prod.id,
        productName: prod.name,
        unitName: unit.unitName,
        conversionFactor: unit.conversionFactor,
        quantity: qty,
        costPrice: price,
        total: qty * price,
      },
    ]);
  };

  const handleRemoveRestockItem = (idx: number) => {
    sound.playTap();
    const updated = [...restockItems];
    updated.splice(idx, 1);
    setRestockItems(updated);
  };

  const totalRestockAmount = restockItems.reduce((acc, item) => acc + item.total, 0);

  const handleSendPOViaWhatsApp = () => {
    if (!activeRestockSupplier || restockItems.length === 0) return;
    sound.playTap();

    const poNumber = generatePONumber();
    const lines = [
      `*PURCHASE ORDER (PO) BARANG*`,
      `Kepada: ${activeRestockSupplier.name} (Up: ${activeRestockSupplier.contactPerson})`,
      `No. PO: ${poNumber}`,
      `Tanggal: ${new Date().toLocaleDateString('id-ID')}`,
      `--------------------------------`,
      `Mohon dikirimkan pesanan barang toko berikut:`,
    ];

    restockItems.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.productName}`);
      lines.push(`   ${item.quantity} ${item.unitName} x ${formatRupiah(item.costPrice)} = ${formatRupiah(item.total)}`);
    });

    lines.push(`--------------------------------`);
    lines.push(`*Total Estimasi: ${formatRupiah(totalRestockAmount)}*`);
    lines.push(`Mohon konfirmasi ketersediaan stok & jadwal pengiriman. Terima kasih.`);

    const url = formatWhatsAppUrl(activeRestockSupplier.whatsapp, lines.join('\n'));
    window.open(url, '_blank');
  };

  const handleConfirmReceiveStock = () => {
    if (!activeRestockSupplier || restockItems.length === 0) return;
    sound.playSuccessChime();
    onCompleteRestock(activeRestockSupplier, restockItems);
    alert('Stok barang berhasil diperbarui ke inventaris toko!');
    setActiveRestockSupplier(null);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-sky-600" />
              <span>Manajemen Supplier & Stok Masuk (Restock)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Simpan data supplier, nomor WhatsApp, buat Purchase Order (PO), dan tambah stok masuk toko.
            </p>
          </div>

          <button
            onClick={() => {
              sound.playTap();
              setName('');
              setContactPerson('');
              setPhone('');
              setWhatsapp('');
              setAddress('');
              setCategories('Sembako');
              setIsAddingNew(true);
              setEditingSupplier(null);
            }}
            className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs md:text-sm flex items-center gap-2 shadow-sm transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Tambah Supplier Baru</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama supplier, kontak sales, atau nomor WhatsApp..."
            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500 shadow-2xs"
          />
        </div>

        {/* Suppliers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((sup) => (
            <div
              key={sup.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-blue-700 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                      {sup.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{sup.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">PIC: {sup.contactPerson}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(sup)}
                      title="Edit Supplier"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    {currentUserRole === 'ADMIN' && (
                      <button
                        onClick={() => {
                          if (confirm(`Hapus supplier ${sup.name}?`)) {
                            sound.playTap();
                            onDeleteSupplier(sup.id);
                          }
                        }}
                        title="Hapus Supplier"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="py-3 space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">No. HP:</span>
                    <span className="font-mono font-medium">{sup.phone}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">WhatsApp:</span>
                    <span className="font-mono font-medium text-emerald-700 flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5" />
                      {sup.whatsapp}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 shrink-0">Alamat:</span>
                    <span className="text-right text-slate-700 line-clamp-2">
                      {sup.address || '-'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-400">Kategori:</span>
                    <span className="text-slate-700 font-medium">
                      {sup.suppliedCategories.join(', ') || '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Restock & WhatsApp Buttons */}
              <div className="pt-2 space-y-1.5">
                <button
                  onClick={() => handleOpenRestock(sup)}
                  className="w-full py-2 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-sky-200/60"
                >
                  <PackagePlus className="w-3.5 h-3.5 text-sky-600" />
                  <span>Buat PO / Restock Barang</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RESTOCK / PURCHASE ORDER MODAL */}
      {activeRestockSupplier && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 my-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Restock Barang: {activeRestockSupplier.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Pilih barang yang ingin dipesan, hitung total PO, dan perbarui stok toko.
                </p>
              </div>
              <button
                onClick={() => setActiveRestockSupplier(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add item row */}
            <div className="py-4 space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-4">
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Pilih Produk
                  </label>
                  <select
                    value={selectedProductToAdd}
                    onChange={(e) => {
                      setSelectedProductToAdd(e.target.value);
                      const prod = products.find((p) => p.id === e.target.value);
                      if (prod && prod.units.length > 0) {
                        setSelectedUnitToAdd(prod.units[0].unitName);
                        setCostPriceToAdd(prod.units[0].costPrice?.toString() || prod.costPrice.toString());
                      }
                    }}
                    className="w-full p-2 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Satuan</label>
                  <select
                    value={selectedUnitToAdd}
                    onChange={(e) => {
                      setSelectedUnitToAdd(e.target.value);
                      const prod = products.find((p) => p.id === selectedProductToAdd);
                      const unit = prod?.units.find((u) => u.unitName === e.target.value);
                      if (unit && unit.costPrice) {
                        setCostPriceToAdd(unit.costPrice.toString());
                      }
                    }}
                    className="w-full p-2 rounded-xl border border-slate-300 text-xs bg-white font-mono font-bold focus:outline-none"
                  >
                    {products
                      .find((p) => p.id === selectedProductToAdd)
                      ?.units.map((u) => (
                        <option key={u.id} value={u.unitName}>
                          {u.unitName} (x{u.conversionFactor})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={qtyToAdd}
                    onChange={(e) => setQtyToAdd(e.target.value)}
                    className="w-full p-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:outline-none"
                  />
                </div>

                <div className="md:col-span-3">
                  <button
                    type="button"
                    onClick={handleAddRestockItem}
                    className="w-full py-2 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Tambah</span>
                  </button>
                </div>
              </div>

              {/* Items List */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                {restockItems.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    Belum ada barang ditambahkan ke Purchase Order ini.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2.5">Produk</th>
                        <th className="p-2.5">Jumlah</th>
                        <th className="p-2.5">Harga Beli</th>
                        <th className="p-2.5">Subtotal</th>
                        <th className="p-2.5 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {restockItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-bold text-slate-900">{item.productName}</td>
                          <td className="p-2.5 font-mono">
                            {item.quantity} {item.unitName}
                          </td>
                          <td className="p-2.5 font-mono">{formatRupiah(item.costPrice)}</td>
                          <td className="p-2.5 font-mono font-bold text-sky-700">
                            {formatRupiah(item.total)}
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => handleRemoveRestockItem(idx)}
                              className="p-1 text-slate-400 hover:text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Total & Action */}
              <div className="p-3 bg-slate-50 rounded-2xl flex justify-between items-baseline">
                <span className="text-xs font-bold text-slate-700">Total Purchase Order:</span>
                <span className="text-lg font-black text-sky-700 font-mono">
                  {formatRupiah(totalRestockAmount)}
                </span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={handleSendPOViaWhatsApp}
                disabled={restockItems.length === 0}
                className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Kirim PO ke WhatsApp Supplier</span>
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveRestockSupplier(null)}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReceiveStock}
                  disabled={restockItems.length === 0}
                  className="py-2.5 px-5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-bold shadow-md shadow-sky-600/20"
                >
                  Konfirmasi Terima & Tambah Stok
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Add / Edit Modal */}
      {(editingSupplier || isAddingNew) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {isAddingNew ? 'Tambah Supplier Baru' : `Edit Supplier: ${editingSupplier?.name}`}
              </h3>
              <button
                onClick={() => {
                  setEditingSupplier(null);
                  setIsAddingNew(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="py-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nama Perusahaan / Supplier *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: PT Sumber Pangan Makmur"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Kontak Person (PIC Sales)
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="Contoh: Pak Hendra"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">No. HP *</label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0811223344"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">No. WhatsApp *</label>
                  <input
                    type="tel"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="0811223344"
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Alamat Kantor / Gudang</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Pergudangan Daan Mogot Blok KM 12 No. 5"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Kategori Barang yang Disuplai (pisahkan dengan koma)
                </label>
                <input
                  type="text"
                  value={categories}
                  onChange={(e) => setCategories(e.target.value)}
                  placeholder="Sembako, Minyak, Beras"
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingSupplier(null);
                    setIsAddingNew(false);
                  }}
                  className="py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="py-2.5 px-6 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-md shadow-sky-600/20"
                >
                  Simpan Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
