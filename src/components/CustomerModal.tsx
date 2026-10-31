import React, { useState, useEffect } from 'react';
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
  UserCheck
} from 'lucide-react';
import { Customer } from '../types/pos';
import { formatRupiah, formatNumber, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelectCustomer: (cust: Customer) => void;
  onAddCustomer: (customerData: Omit<Customer, 'id' | 'createdAt' | 'totalPoints' | 'totalDebt'>) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  customers,
  selectedCustomer,
  onSelectCustomer,
  onAddCustomer,
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [search, setSearch] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('500000');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        sound.playTap();
        if (isAddingNew) {
          setIsAddingNew(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAddingNew, onClose]);

  if (!isOpen) return null;

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.whatsapp.includes(search)
  );

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (sameAsPhone) {
      setWhatsapp(val);
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
      address: address.trim(),
      creditLimit: parseFloat(creditLimit) || 0,
      notes: notes.trim(),
    });

    // Reset form
    setName('');
    setPhone('');
    setWhatsapp('');
    setAddress('');
    setNotes('');
    setIsAddingNew(false);
  };

  const handleOpenWhatsAppChat = (cust: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    sound.playTap();
    const msg = `Halo ${cust.name}, kami dari toko ingin mengonfirmasi terkait saldo poin Anda saat ini: ${cust.totalPoints} poin.`;
    window.open(formatWhatsAppUrl(cust.whatsapp, msg), '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 select-none">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isAddingNew ? 'Daftar Pelanggan Baru' : 'Pilih Pelanggan / Member'}
            </h3>
            <p className="text-xs text-slate-500">
              {isAddingNew
                ? 'Lengkapi data pelanggan, nomor WhatsApp & limit kredit'
                : 'Pilih pelanggan untuk akumulasi dan penukaran poin reward'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {!isAddingNew && (
              <button
                onClick={() => {
                  sound.playTap();
                  setIsAddingNew(true);
                }}
                className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Pelanggan Baru</span>
              </button>
            )}
            <button
              onClick={() => {
                sound.playTap();
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

        {/* Search Bar (if not adding new) */}
        {!isAddingNew && (
          <div className="pt-3 pb-1 shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama, nomor HP, atau nomor WhatsApp..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500 focus:bg-white"
              />
            </div>
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
                  Simpan & Pilih Pelanggan
                </button>
              </div>
            </form>
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
                  return (
                    <div
                      key={cust.id}
                      onClick={() => {
                        sound.playTap();
                        onSelectCustomer(cust);
                        onClose();
                      }}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? 'bg-sky-50/70 border-sky-500 shadow-xs'
                          : 'bg-white hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                          {cust.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">{cust.name}</h4>
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

                      <div className="text-right flex items-center gap-3">
                        <div>
                          {/* Points badge */}
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold font-mono">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                            <span>{formatNumber(cust.totalPoints)} Poin</span>
                          </div>

                          {cust.totalDebt > 0 && (
                            <div className="text-[11px] text-rose-600 font-bold font-mono mt-0.5">
                              Piutang: {formatRupiah(cust.totalDebt)}
                            </div>
                          )}
                        </div>

                        {/* WhatsApp Button */}
                        <button
                          type="button"
                          onClick={(e) => handleOpenWhatsAppChat(cust, e)}
                          title="Chat via WhatsApp"
                          className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </button>
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
