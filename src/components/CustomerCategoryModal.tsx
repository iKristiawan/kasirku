import React, { useState } from 'react';
import { 
  X, 
  Plus, 
  Edit2, 
  Trash2, 
  Check, 
  Tag, 
  AlertCircle, 
  Palette, 
  Sparkles,
  Users
} from 'lucide-react';
import { CustomerCategoryItem, Customer } from '../types/pos';
import { getCustomerCategoryBadge } from '../utils/customerUtils';
import { sound } from '../utils/audio';

interface CustomerCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: CustomerCategoryItem[];
  customers: Customer[];
  onAddCategory: (name: string, color?: string, description?: string) => void;
  onUpdateCategory: (id: string, name: string, color?: string, description?: string) => void;
  onDeleteCategory: (id: string) => void;
}

const COLOR_PRESETS = [
  { id: 'purple', label: 'Ungu (VIP)', class: 'bg-purple-500' },
  { id: 'sky', label: 'Biru Langit (Reseller)', class: 'bg-sky-500' },
  { id: 'emerald', label: 'Hijau (Grosir)', class: 'bg-emerald-500' },
  { id: 'amber', label: 'Kuning Emas (Member)', class: 'bg-amber-500' },
  { id: 'blue', label: 'Biru (Reguler)', class: 'bg-blue-500' },
  { id: 'rose', label: 'Merah (Spesial)', class: 'bg-rose-500' },
  { id: 'slate', label: 'Abu-abu (Umum)', class: 'bg-slate-500' },
];

export const CustomerCategoryModal: React.FC<CustomerCategoryModalProps> = ({
  isOpen,
  onClose,
  categories,
  customers,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('purple');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleStartEdit = (cat: CustomerCategoryItem) => {
    sound.playTap();
    setConfirmDeleteId(null);
    setEditingId(cat.id);
    setName(cat.name);
    setColor(cat.color || 'purple');
    setDescription(cat.description || '');
    setError(null);
  };

  const handleCancelEdit = () => {
    sound.playTap();
    setEditingId(null);
    setName('');
    setColor('purple');
    setDescription('');
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim().toUpperCase();
    if (!cleanName) {
      setError('Nama kategori tidak boleh kosong.');
      return;
    }

    // Check duplicate name
    const existing = categories.find(
      (c) => c.name.toUpperCase() === cleanName && c.id !== editingId
    );
    if (existing) {
      setError(`Kategori "${cleanName}" sudah ada dalam daftar.`);
      return;
    }

    if (editingId) {
      onUpdateCategory(editingId, cleanName, color, description.trim());
      sound.playSuccessChime();
    } else {
      onAddCategory(cleanName, color, description.trim());
      sound.playSuccessChime();
    }

    handleCancelEdit();
  };

  const handleConfirmDelete = (catId: string) => {
    sound.playTap();
    onDeleteCategory(catId);
    setConfirmDeleteId(null);
    if (editingId === catId) {
      handleCancelEdit();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-sky-50/50 via-white to-purple-50/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-600 text-white flex items-center justify-center shadow-xs">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Kelola Kategori Pelanggan
              </h3>
              <p className="text-xs text-slate-500">
                Atur grup & tier kategori untuk harga khusus barang/jasa ({categories.length} Kategori Aktif)
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Form Tambah / Edit Kategori */}
          <form
            onSubmit={handleSubmit}
            className="p-4 rounded-2xl border border-slate-200 bg-slate-50/80 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                {editingId ? <Edit2 className="w-3.5 h-3.5 text-amber-600" /> : <Plus className="w-3.5 h-3.5 text-sky-600" />}
                {editingId ? 'Edit Kategori Pelanggan' : 'Tambah Kategori Pelanggan Baru'}
              </span>
              {editingId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="text-xs text-slate-500 hover:text-slate-800 font-semibold underline"
                >
                  Batal Edit
                </button>
              )}
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5 space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block">
                  Nama Kategori *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Misal: AGEN, DISTRIBUTOR, VIP"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-900 focus:border-sky-500 focus:outline-none bg-white uppercase tracking-wider"
                />
              </div>

              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-600 block">
                  Warna Badge
                </label>
                <div className="flex items-center gap-1.5 flex-wrap p-1 bg-white rounded-xl border border-slate-200">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      title={p.label}
                      onClick={() => {
                        sound.playTap();
                        setColor(p.id);
                      }}
                      className={`w-6 h-6 rounded-lg ${p.class} transition-transform flex items-center justify-center ${
                        color === p.id ? 'ring-2 ring-offset-1 ring-slate-800 scale-110 shadow-xs' : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      {color === p.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-3">
                <button
                  type="submit"
                  className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs text-white transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                    editingId
                      ? 'bg-amber-600 hover:bg-amber-500'
                      : 'bg-sky-600 hover:bg-sky-500'
                  }`}
                >
                  {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span>{editingId ? 'Simpan Edit' : 'Tambah'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 block">
                Keterangan / Catatan Kategori (Opsional)
              </label>
              <input
                type="text"
                placeholder="Misal: Pembeli partai besar, minimal pesanan 5 pcs"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2 rounded-xl border border-slate-200 text-xs text-slate-700 focus:border-sky-500 bg-white"
              />
            </div>
          </form>

          {/* List Kategori Terdaftar */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider px-1">
              Daftar Kategori Pelanggan Saat Ini ({categories.length})
            </h4>

            <div className="space-y-2">
              {categories.map((cat) => {
                const badge = getCustomerCategoryBadge(cat.name, cat.color);
                const count = customers.filter(
                  (c) => (c.customerCategory || 'UMUM').toUpperCase() === cat.name.toUpperCase()
                ).length;
                const isSelected = editingId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className={`p-3 bg-white rounded-xl border transition-all flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase border shrink-0 ${badge.bg} ${badge.text} ${badge.border}`}>
                        🏷️ {cat.name}
                      </span>
                      <div className="truncate">
                        {cat.description && (
                          <p className="text-xs text-slate-600 truncate">{cat.description}</p>
                        )}
                        <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Users className="w-3 h-3 text-slate-400" />
                          <span>{count} Pelanggan terdaftar</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {confirmDeleteId === cat.id ? (
                        <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2 py-1 rounded-xl">
                          <span className="text-[10px] font-bold text-rose-700">
                            {count > 0 ? `Alihkan ${count} ke UMUM & hapus?` : 'Yakin hapus?'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(cat.id)}
                            className="px-2 py-0.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                          >
                            Ya, Hapus
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setConfirmDeleteId(null);
                            }}
                            className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-[10px] font-bold cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEdit(cat)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                            title="Edit Kategori Ini"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setConfirmDeleteId(cat.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus Kategori Ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500 italic">
            * Kategori ini langsung muncul pada menu Harga Khusus di Tambah Barang & Tambah Jasa.
          </span>
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onClose();
            }}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
