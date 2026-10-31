import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Search, 
  UserPlus, 
  Phone, 
  MessageCircle, 
  Sparkles, 
  Edit3, 
  Trash2, 
  X,
  History, 
  TrendingUp, 
  ShoppingBag, 
  Receipt, 
  ArrowUpRight, 
  CheckCircle2, 
  Clock, 
  Coins, 
  Award, 
  ChevronRight,
  Filter,
  CreditCard,
  Calendar,
  Layers,
  ArrowDownRight,
  Megaphone,
  Send,
  Check,
  ExternalLink,
  Copy,
  RotateCcw,
  AlertCircle,
  MessageSquare
} from 'lucide-react';
import { Customer, UserRole, Transaction, StoreSettings, MembershipTier } from '../types/pos';
import { formatRupiah, formatNumber, formatDateTime, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';

interface CustomerManagementViewProps {
  customers: Customer[];
  transactions: Transaction[];
  currentUserRole: UserRole;
  storeSettings?: StoreSettings;
  onAddCustomer: (customerData: Omit<Customer, 'id' | 'createdAt' | 'totalPoints' | 'totalDebt'>) => void;
  onUpdateCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customerId: string) => void;
}

export const CustomerManagementView: React.FC<CustomerManagementViewProps> = ({
  customers,
  transactions,
  currentUserRole,
  storeSettings,
  onAddCustomer,
  onUpdateCustomer,
  onDeleteCustomer,
}) => {
  // Navigation tabs: 'directory' vs 'activity_log'
  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'activity_log'>('directory');

  // Directory search & modal state
  const [search, setSearch] = useState('');
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);

  // Activity Log filters
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('ALL');
  const [timeRangeFilter, setTimeRangeFilter] = useState<'ALL' | 'TODAY' | '7DAYS' | '30DAYS'>('ALL');
  const [activitySearchQuery, setActivitySearchQuery] = useState('');

  // Form states for add / edit
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('500000');
  const [totalPoints, setTotalPoints] = useState('0');
  const [membershipTier, setMembershipTier] = useState<MembershipTier>('REGULER');
  const [notes, setNotes] = useState('');

  // =========================================================================
  // WHATSAPP BLAST STATE & PRESETS
  // =========================================================================
  const BLAST_PRESETS = useMemo(() => [
    {
      key: 'PROMO_MEMBER',
      title: 'Diskon Spesial Tier Member',
      description: 'Potongan harga khusus tier membership',
      template: 'Halo Kak {nama}! Dapatkan diskon belanja spesial untuk member tier {tier} di {toko}! Kunjungi toko kami hari ini dan tunjukkan pesan ini di kasir untuk menikmati potongan harga langsung saat checkout. Selamat berbelanja!'
    },
    {
      key: 'POINTS_REWARD',
      title: 'Tukar Poin Hadiah Loyalitas',
      description: 'Ingatkan pelanggan gunakan saldo poin mereka',
      template: 'Halo Kak {nama}! Saldo poin loyalitas KasirKu Anda saat ini terkumpul sebanyak *{poin}*. Segera tukarkan poin belanja Anda di kasir {toko} untuk memotong total tagihan belanja Anda sebelum periode berakhir. Sampai jumpa di toko!'
    },
    {
      key: 'NEW_ARRIVALS',
      title: 'Stok Produk Baru & Flash Sale',
      description: 'Informasi stok dan penawaran terbatas',
      template: 'Halo Kak {nama}! Stok produk favorit dan varian baru telah mendarat di {toko}! Dapatkan harga promo terbaik khusus pelanggan terdaftar minggu ini. Kunjungi kami di {alamat_toko}.'
    },
    {
      key: 'DEBT_REMINDER',
      title: 'Pengingat Tagihan Tempo Piutang',
      description: 'Pemberitahuan ramah pembayaran tempo kasir',
      template: 'Halo Kak {nama}, salam hangat dari {toko}. Mengingatkan catatan transaksi tempo Anda tercatat sebesar *{piutang}*. Mohon konfirmasi atau lakukan pelunasan di kasir kami saat berkunjung. Terima kasih banyak atas kerja sama baiknya!'
    },
    {
      key: 'CUSTOM',
      title: 'Pesan Kustom Bebas',
      description: 'Ketik pesan promosi sesuai kebutuhan toko Anda',
      template: 'Halo Kak {nama}, ada kabar gembira dari {toko}: '
    }
  ], [storeSettings]);

  const [isBlastModalOpen, setIsBlastModalOpen] = useState(false);
  const [blastAudience, setBlastAudience] = useState<'ALL' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'WITH_POINTS' | 'WITH_DEBT'>('ALL');
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [blastPresetKey, setBlastPresetKey] = useState<string>('PROMO_MEMBER');
  const [blastMessage, setBlastMessage] = useState<string>(BLAST_PRESETS[0].template);
  const [blastSentMap, setBlastSentMap] = useState<Record<string, boolean>>({});
  const [copiedPreview, setCopiedPreview] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');

  // Filtered recipients based on selected audience criteria
  const eligibleBlastCustomers = useMemo(() => {
    return customers.filter((cust) => {
      if (blastAudience === 'PLATINUM') return cust.membershipTier === 'PLATINUM';
      if (blastAudience === 'GOLD') return cust.membershipTier === 'GOLD';
      if (blastAudience === 'SILVER') return cust.membershipTier === 'SILVER';
      if (blastAudience === 'WITH_POINTS') return (cust.totalPoints || 0) > 0;
      if (blastAudience === 'WITH_DEBT') return (cust.totalDebt || 0) > 0;
      return true;
    });
  }, [customers, blastAudience]);

  // Search filter inside blast modal
  const displayedRecipients = useMemo(() => {
    if (!recipientSearch.trim()) return eligibleBlastCustomers;
    const q = recipientSearch.toLowerCase();
    return eligibleBlastCustomers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.whatsapp.includes(q) ||
        c.phone.includes(q) ||
        (c.membershipTier && c.membershipTier.toLowerCase().includes(q))
    );
  }, [eligibleBlastCustomers, recipientSearch]);

  // Dynamic template placeholder replacer
  const renderPersonalizedMessage = (templateText: string, cust: Customer): string => {
    return templateText
      .replace(/{nama}/gi, cust.name)
      .replace(/{tier}/gi, cust.membershipTier || 'REGULER')
      .replace(/{poin}/gi, `${formatNumber(cust.totalPoints || 0)} Poin`)
      .replace(/{piutang}/gi, formatRupiah(cust.totalDebt || 0))
      .replace(/{toko}/gi, storeSettings?.storeName || 'KasirKu Store')
      .replace(/{alamat_toko}/gi, storeSettings?.storeAddress || 'toko kami')
      .replace(/{toko_wa}/gi, storeSettings?.storePhone || '')
      .replace(/{alamat}/gi, cust.address || '-');
  };

  const handleOpenBlastModal = (targetCustomerId?: string) => {
    sound.playTap();
    if (targetCustomerId) {
      setBlastAudience('ALL');
      setSelectedRecipientIds([targetCustomerId]);
    } else {
      setSelectedRecipientIds(customers.map((c) => c.id));
    }
    setIsBlastModalOpen(true);
  };

  const handleChangeAudience = (audience: 'ALL' | 'PLATINUM' | 'GOLD' | 'SILVER' | 'WITH_POINTS' | 'WITH_DEBT') => {
    sound.playTap();
    setBlastAudience(audience);
    const newEligible = customers.filter((cust) => {
      if (audience === 'PLATINUM') return cust.membershipTier === 'PLATINUM';
      if (audience === 'GOLD') return cust.membershipTier === 'GOLD';
      if (audience === 'SILVER') return cust.membershipTier === 'SILVER';
      if (audience === 'WITH_POINTS') return (cust.totalPoints || 0) > 0;
      if (audience === 'WITH_DEBT') return (cust.totalDebt || 0) > 0;
      return true;
    });
    setSelectedRecipientIds(newEligible.map((c) => c.id));
  };

  const handleSelectPreset = (presetKey: string) => {
    sound.playTap();
    setBlastPresetKey(presetKey);
    const found = BLAST_PRESETS.find((p) => p.key === presetKey);
    if (found) {
      setBlastMessage(found.template);
    }
  };

  const handleInsertPlaceholder = (placeholder: string) => {
    sound.playTap();
    setBlastMessage((prev) => prev + ' ' + placeholder);
  };

  const handleToggleRecipient = (customerId: string) => {
    setSelectedRecipientIds((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  };

  const handleSelectAllRecipients = () => {
    sound.playTap();
    setSelectedRecipientIds(eligibleBlastCustomers.map((c) => c.id));
  };

  const handleDeselectAllRecipients = () => {
    sound.playTap();
    setSelectedRecipientIds([]);
  };

  const handleSendIndividualBlast = (cust: Customer) => {
    sound.playTap();
    const personalized = renderPersonalizedMessage(blastMessage, cust);
    const targetPhone = cust.whatsapp || cust.phone;
    const url = formatWhatsAppUrl(targetPhone, personalized);
    window.open(url, '_blank');
    setBlastSentMap((prev) => ({ ...prev, [cust.id]: true }));
  };

  const handleSendNextBlast = () => {
    // Pick the first selected customer who hasn't been sent yet
    const nextRecipient = eligibleBlastCustomers
      .filter((c) => selectedRecipientIds.includes(c.id))
      .find((c) => !blastSentMap[c.id]);

    if (!nextRecipient) {
      sound.playSuccessChime();
      return;
    }

    handleSendIndividualBlast(nextRecipient);
  };

  const handleResetBlastSent = () => {
    sound.playTap();
    setBlastSentMap({});
  };

  // Filter customers for directory
  const filteredCustomers = useMemo(() => {
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        c.whatsapp.includes(search) ||
        c.address.toLowerCase().includes(search.toLowerCase())
    );
  }, [customers, search]);

  // Map transactions by customerId for fast lookups
  const customerTransactionsMap = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    transactions.forEach((tx) => {
      if (tx.customerId) {
        const list = map.get(tx.customerId) || [];
        list.push(tx);
        map.set(tx.customerId, list);
      }
    });
    return map;
  }, [transactions]);

  // Aggregate stats per customer (Total spend, total points earned, total points used, visits count)
  const customerAnalytics = useMemo(() => {
    return customers.map((cust) => {
      const custTxs = customerTransactionsMap.get(cust.id) || [];
      const totalPaymentsMade = custTxs.reduce((sum, tx) => sum + tx.finalAmount, 0);
      const totalPointsEarned = custTxs.reduce((sum, tx) => sum + (tx.pointsEarned || 0), 0);
      const totalPointsUsed = custTxs.reduce((sum, tx) => sum + (tx.pointsUsed || 0), 0);
      const totalVisits = custTxs.length;
      const averageBasket = totalVisits > 0 ? totalPaymentsMade / totalVisits : 0;
      const lastTx = custTxs.length > 0 ? [...custTxs].sort((a, b) => b.timestamp - a.timestamp)[0] : null;

      // Product frequency analysis
      const itemCounts: Record<string, { name: string; qty: number; unit: string }> = {};
      custTxs.forEach((tx) => {
        tx.items.forEach((item) => {
          if (!itemCounts[item.productId]) {
            itemCounts[item.productId] = { name: item.productName, qty: 0, unit: item.unitName };
          }
          itemCounts[item.productId].qty += item.quantity;
        });
      });
      const topProducts = Object.values(itemCounts)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3);

      // Payment method preference
      const paymentMethodCounts: Record<string, number> = {};
      custTxs.forEach((tx) => {
        paymentMethodCounts[tx.paymentMethod] = (paymentMethodCounts[tx.paymentMethod] || 0) + 1;
      });
      const favoritePaymentMethod = Object.entries(paymentMethodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

      return {
        customer: cust,
        totalPaymentsMade,
        totalPointsEarned,
        totalPointsUsed,
        totalVisits,
        averageBasket,
        lastTransaction: lastTx,
        topProducts,
        favoritePaymentMethod,
      };
    });
  }, [customers, customerTransactionsMap]);

  // Global KPIs for member activity
  const globalMemberKPIs = useMemo(() => {
    let totalSpend = 0;
    let totalPointsEarned = 0;
    let totalPointsRedeemed = 0;
    let memberTxCount = 0;

    transactions.forEach((tx) => {
      if (tx.customerId) {
        totalSpend += tx.finalAmount;
        totalPointsEarned += tx.pointsEarned || 0;
        totalPointsRedeemed += tx.pointsUsed || 0;
        memberTxCount++;
      }
    });

    const averageBasket = memberTxCount > 0 ? totalSpend / memberTxCount : 0;

    return {
      totalSpend,
      totalPointsEarned,
      totalPointsRedeemed,
      memberTxCount,
      averageBasket,
    };
  }, [transactions]);

  // Filtered transactions for Activity Log feed
  const filteredActivityTransactions = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    return transactions
      .filter((tx) => {
        // Must belong to a customer
        if (!tx.customerId) return false;

        // Customer selection filter
        if (selectedCustomerId !== 'ALL' && tx.customerId !== selectedCustomerId) {
          return false;
        }

        // Time range filter
        if (timeRangeFilter === 'TODAY') {
          const txDate = new Date(tx.timestamp).toDateString();
          const todayDate = new Date().toDateString();
          if (txDate !== todayDate) return false;
        } else if (timeRangeFilter === '7DAYS') {
          if (now - tx.timestamp > 7 * oneDayMs) return false;
        } else if (timeRangeFilter === '30DAYS') {
          if (now - tx.timestamp > 30 * oneDayMs) return false;
        }

        // Search query filter (customer name, invoice, items, cashier)
        if (activitySearchQuery.trim()) {
          const q = activitySearchQuery.toLowerCase();
          const matchInvoice = tx.invoiceNumber.toLowerCase().includes(q);
          const matchCustomer = (tx.customerName || '').toLowerCase().includes(q);
          const matchCashier = tx.cashierName.toLowerCase().includes(q);
          const matchItems = tx.items.some((it) => it.productName.toLowerCase().includes(q));
          if (!matchInvoice && !matchCustomer && !matchCashier && !matchItems) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [transactions, selectedCustomerId, timeRangeFilter, activitySearchQuery]);

  // Currently focused customer analytics (if not ALL)
  const selectedCustomerDetail = useMemo(() => {
    if (selectedCustomerId === 'ALL') return null;
    return customerAnalytics.find((item) => item.customer.id === selectedCustomerId) || null;
  }, [selectedCustomerId, customerAnalytics]);

  const startEdit = (cust: Customer) => {
    sound.playTap();
    setEditingCustomer(cust);
    setName(cust.name);
    setPhone(cust.phone);
    setWhatsapp(cust.whatsapp);
    setAddress(cust.address);
    setCreditLimit(cust.creditLimit.toString());
    setTotalPoints(cust.totalPoints.toString());
    setMembershipTier(cust.membershipTier || 'REGULER');
    setNotes(cust.notes || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer || !name.trim()) return;

    sound.playSuccessChime();
    onUpdateCustomer({
      ...editingCustomer,
      name: name.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || phone.trim(),
      address: address.trim(),
      creditLimit: parseFloat(creditLimit) || 0,
      totalPoints: parseInt(totalPoints) || 0,
      membershipTier,
      notes: notes.trim(),
    });

    setEditingCustomer(null);
  };

  const handleAddNewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

    sound.playSuccessChime();
    onAddCustomer({
      name: name.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || phone.trim(),
      address: address.trim(),
      creditLimit: parseFloat(creditLimit) || 0,
      membershipTier,
      notes: notes.trim(),
    });

    setIsAddingNew(false);
  };

  const handleSendWA = (cust: Customer) => {
    sound.playTap();
    const msg = `Halo Kak ${cust.name}, terima kasih telah berbelanja di toko kami! Saldo Poin Loyalitas Anda saat ini adalah ${formatNumber(cust.totalPoints)} poin. Kumpulkan terus poin belanja Anda dan dapatkan potongan harga menarik di kunjungan berikutnya!`;
    window.open(formatWhatsAppUrl(cust.whatsapp, msg), '_blank');
  };

  const handleSendInvoiceWA = (tx: Transaction) => {
    sound.playTap();
    if (!tx.customerWhatsapp) return;
    const itemsList = tx.items.map((it) => `- ${it.productName} (${it.quantity} ${it.unitName}): ${formatRupiah(it.totalAmount)}`).join('\n');
    const msg = `*STRUK DIGITAL KASIRKU*\nNo: ${tx.invoiceNumber}\nTanggal: ${formatDateTime(tx.timestamp)}\nKasir: ${tx.cashierName}\n\n*Item Belanja:*\n${itemsList}\n\n*Total Bayar:* ${formatRupiah(tx.finalAmount)}\n*Metode:* ${tx.paymentMethod}\n*Poin Didapat:* +${tx.pointsEarned || 0} Poin\n*Saldo Poin Anda:* ${selectedCustomerDetail ? formatNumber(selectedCustomerDetail.customer.totalPoints) : '-'} Poin\n\nTerima kasih atas kunjungan Anda!`;
    window.open(formatWhatsAppUrl(tx.customerWhatsapp, msg), '_blank');
  };

  const jumpToCustomerLog = (cust: Customer) => {
    sound.playTap();
    setSelectedCustomerId(cust.id);
    setActiveSubTab('activity_log');
  };

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-5">
        
        {/* Navigation Bar & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-sky-50 text-sky-600 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold text-slate-900">
                  Manajemen & Log Aktivitas Pelanggan
                </h2>
                <p className="text-xs text-slate-500">
                  Pantau riwayat transaksi, total pembayaran, loyalitas poin, dan analisis perilaku belanja pelanggan.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Sub-tabs Switcher */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200/80">
              <button
                onClick={() => {
                  sound.playTap();
                  setActiveSubTab('directory');
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSubTab === 'directory'
                    ? 'bg-white text-sky-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Daftar Pelanggan ({customers.length})</span>
              </button>
              <button
                onClick={() => {
                  sound.playTap();
                  setActiveSubTab('activity_log');
                }}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSubTab === 'activity_log'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Log Aktivitas & Perilaku</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </button>
            </div>

            {/* WhatsApp Blast Button */}
            <button
              onClick={() => handleOpenBlastModal()}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              title="Kirim pesan promosi massal ke pelanggan via WhatsApp"
            >
              <Megaphone className="w-4 h-4" />
              <span>WhatsApp Blast</span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-700 font-mono font-bold">
                {customers.length}
              </span>
            </button>

            {/* Quick Add Button */}
            {activeSubTab === 'directory' && (
              <button
                onClick={() => {
                  sound.playTap();
                  setName('');
                  setPhone('');
                  setWhatsapp('');
                  setAddress('');
                  setCreditLimit('500000');
                  setNotes('');
                  setIsAddingNew(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                <span>Tambah Pelanggan</span>
              </button>
            )}
          </div>
        </div>

        {/* =========================================================================
            TAB 1: DIRECTORY VIEW (DAFTAR & KONTAK PELANGGAN)
           ========================================================================= */}
        {activeSubTab === 'directory' && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari pelanggan berdasarkan nama, no telepon, WhatsApp, atau alamat..."
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500 shadow-2xs"
              />
            </div>

            {/* Customer Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map((cust) => {
                const analytics = customerAnalytics.find((a) => a.customer.id === cust.id);
                return (
                  <div
                    key={cust.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                            {cust.name.charAt(0)}
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{cust.name}</h3>
                            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md mt-0.5">
                              <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" />
                              <span>{formatNumber(cust.totalPoints)} Poin Reward</span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEdit(cust)}
                            title="Edit Pelanggan"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {currentUserRole === 'ADMIN' && (
                            <button
                              onClick={() => {
                                if (confirm(`Hapus pelanggan ${cust.name}?`)) {
                                  sound.playTap();
                                  onDeleteCustomer(cust.id);
                                }
                              }}
                              title="Hapus Pelanggan"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Details & Quick Analytics */}
                      <div className="py-3 space-y-2 text-xs text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">No. HP:</span>
                          <span className="font-mono font-medium">{cust.phone}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">WhatsApp:</span>
                          <span className="font-mono font-medium text-emerald-700 flex items-center gap-1">
                            <MessageCircle className="w-3.5 h-3.5" />
                            {cust.whatsapp}
                          </span>
                        </div>

                        {/* Mini Activity Indicators */}
                        <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between mt-2">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Total Belanja</span>
                            <span className="text-xs font-bold text-slate-900 font-mono">
                              {formatRupiah(analytics?.totalPaymentsMade || 0)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Transaksi</span>
                            <span className="text-xs font-bold text-sky-700 font-mono">
                              {analytics?.totalVisits || 0}x Order
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-slate-400">Status Piutang:</span>
                          <span className={`font-mono font-bold ${cust.totalDebt > 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                            {cust.totalDebt > 0 ? formatRupiah(cust.totalDebt) : 'Lunas (Rp 0)'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="pt-2 space-y-1.5">
                      <button
                        onClick={() => jumpToCustomerLog(cust)}
                        className="w-full py-2 px-3 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-sky-200/60"
                      >
                        <History className="w-3.5 h-3.5 text-sky-600" />
                        <span>Lihat Log Aktivitas & Riwayat</span>
                      </button>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          onClick={() => handleSendWA(cust)}
                          className="py-2 px-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1 transition-colors border border-emerald-200/60"
                          title="Kirim Saldo Poin ke WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Kirim Poin</span>
                        </button>

                        <button
                          onClick={() => handleOpenBlastModal(cust.id)}
                          className="py-2 px-2 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center gap-1 transition-colors border border-teal-200/60"
                          title="Pilih Template & Kirim Promo Blast WhatsApp"
                        >
                          <Megaphone className="w-3.5 h-3.5 text-teal-600" />
                          <span>Kirim Promo</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 2: CUSTOMER ACTIVITY LOG & BEHAVIOR (LOG AKTIVITAS & PERILAKU)
           ========================================================================= */}
        {activeSubTab === 'activity_log' && (
          <div className="space-y-4 md:space-y-5">
            {/* Top KPI Cards (Summary) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-semibold">Total Omset Member</span>
                  <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-lg md:text-xl font-black text-slate-900 font-mono">
                  {formatRupiah(globalMemberKPIs.totalSpend)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                  <span>Dari total {globalMemberKPIs.memberTxCount} transaksi member</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-semibold">Total Poin Diberikan</span>
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                    <Sparkles className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-lg md:text-xl font-black text-amber-600 font-mono">
                  +{formatNumber(globalMemberKPIs.totalPointsEarned)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Akumulasi reward belanja
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-semibold">Total Poin Ditukarkan</span>
                  <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                    <Coins className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-lg md:text-xl font-black text-purple-700 font-mono">
                  -{formatNumber(globalMemberKPIs.totalPointsRedeemed)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Poin diklaim sebagai potongan
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-semibold">Rata-rata Keranjang (AOV)</span>
                  <div className="p-1.5 bg-sky-50 text-sky-600 rounded-lg">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-lg md:text-xl font-black text-sky-700 font-mono">
                  {formatRupiah(globalMemberKPIs.averageBasket)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Nilai rata-rata belanja per transaksi
                </div>
              </div>
            </div>

            {/* Filter & Control Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                {/* Customer Selector Dropdown */}
                <div className="flex-1 max-w-md">
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Pilih Pelanggan / Semua:
                  </label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => {
                      sound.playTap();
                      setSelectedCustomerId(e.target.value);
                    }}
                    className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500"
                  >
                    <option value="ALL">👥 Semua Pelanggan ({customers.length} Member Terdaftar)</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        👤 {c.name} ({c.phone}) - {formatNumber(c.totalPoints)} Poin
                      </option>
                    ))}
                  </select>
                </div>

                {/* Period Range Filter */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 block mb-1">
                    Rentang Waktu:
                  </label>
                  <div className="inline-flex p-0.5 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setTimeRangeFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        timeRangeFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setTimeRangeFilter('TODAY')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        timeRangeFilter === 'TODAY' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      Hari Ini
                    </button>
                    <button
                      onClick={() => setTimeRangeFilter('7DAYS')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        timeRangeFilter === '7DAYS' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      7 Hari
                    </button>
                    <button
                      onClick={() => setTimeRangeFilter('30DAYS')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        timeRangeFilter === '30DAYS' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'
                      }`}
                    >
                      30 Hari
                    </button>
                  </div>
                </div>
              </div>

              {/* Free Text Search */}
              <div className="relative min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={activitySearchQuery}
                  onChange={(e) => setActivitySearchQuery(e.target.value)}
                  placeholder="Cari invoice, item, kasir..."
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Individual Customer Deep Dive Card (When a specific customer is selected) */}
            {selectedCustomerDetail && (
              <div className="bg-gradient-to-r from-sky-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-5 md:p-6 shadow-xl border border-sky-800/40 relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/10 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-400 to-indigo-500 text-white flex items-center justify-center font-black text-xl shadow-lg shadow-sky-500/20">
                      {selectedCustomerDetail.customer.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg md:text-xl font-black text-white">
                          {selectedCustomerDetail.customer.name}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 flex items-center gap-1">
                          <Award className="w-3 h-3 text-amber-300" />
                          <span>Member Loyalitas</span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 mt-1">
                        <span className="font-mono">📱 {selectedCustomerDetail.customer.phone}</span>
                        <span>•</span>
                        <span>📍 {selectedCustomerDetail.customer.address || 'Alamat belum diatur'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSendWA(selectedCustomerDetail.customer)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Hubungi WhatsApp</span>
                    </button>
                    <button
                      onClick={() => setSelectedCustomerId('ALL')}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                    >
                      Tampilkan Semua
                    </button>
                  </div>
                </div>

                {/* Behavioral Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-5 relative z-10">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                    <span className="text-[11px] text-slate-400 block mb-0.5">Total Belanja (Spend)</span>
                    <span className="text-sm md:text-base font-black text-emerald-400 font-mono">
                      {formatRupiah(selectedCustomerDetail.totalPaymentsMade)}
                    </span>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                    <span className="text-[11px] text-slate-400 block mb-0.5">Total Poin Diperoleh</span>
                    <span className="text-sm md:text-base font-black text-amber-300 font-mono">
                      +{formatNumber(selectedCustomerDetail.totalPointsEarned)}
                    </span>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                    <span className="text-[11px] text-slate-400 block mb-0.5">Saldo Poin Saat Ini</span>
                    <span className="text-sm md:text-base font-black text-amber-400 font-mono">
                      {formatNumber(selectedCustomerDetail.customer.totalPoints)} Poin
                    </span>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                    <span className="text-[11px] text-slate-400 block mb-0.5">Frekuensi Transaksi</span>
                    <span className="text-sm md:text-base font-black text-sky-300 font-mono">
                      {selectedCustomerDetail.totalVisits}x Belanja
                    </span>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                    <span className="text-[11px] text-slate-400 block mb-0.5">Rata-rata Keranjang</span>
                    <span className="text-sm md:text-base font-black text-slate-200 font-mono">
                      {formatRupiah(selectedCustomerDetail.averageBasket)}
                    </span>
                  </div>

                  <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
                    <span className="text-[11px] text-slate-400 block mb-0.5">Metode Favorit</span>
                    <span className="text-xs md:text-sm font-bold text-sky-200 uppercase">
                      {selectedCustomerDetail.favoritePaymentMethod.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Top Purchased Products Tag Row */}
                {selectedCustomerDetail.topProducts.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs relative z-10">
                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                      <ShoppingBag className="w-3.5 h-3.5 text-sky-400" />
                      <span>Produk Paling Sering Dibeli:</span>
                    </span>
                    {selectedCustomerDetail.topProducts.map((p, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg bg-white/10 text-slate-200 text-xs font-mono font-medium"
                      >
                        {p.name} ({p.qty} {p.unit})
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* When ALL Customers is Selected: Show Customer Behavior Leaderboard Table */}
            {selectedCustomerId === 'ALL' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Peringkat Perilaku & Total Belanja Member (Customer Leaderboard)
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500">
                    Diurutkan berdasarkan total nominal pembayaran
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-4">Peringkat</th>
                        <th className="py-3 px-4">Pelanggan</th>
                        <th className="py-3 px-4 text-right">Total Pembayaran</th>
                        <th className="py-3 px-4 text-center">Frekuensi Belanja</th>
                        <th className="py-3 px-4 text-right">Rata-rata Order</th>
                        <th className="py-3 px-4 text-center">Poin Diperoleh</th>
                        <th className="py-3 px-4 text-center">Status Piutang</th>
                        <th className="py-3 px-4 text-right">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {[...customerAnalytics]
                        .sort((a, b) => b.totalPaymentsMade - a.totalPaymentsMade)
                        .map((item, idx) => (
                          <tr key={item.customer.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-slate-500">
                              #{idx + 1}
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{item.customer.name}</div>
                              <div className="text-[11px] text-slate-400 font-mono">{item.customer.phone}</div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                              {formatRupiah(item.totalPaymentsMade)}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-semibold text-slate-700">
                              {item.totalVisits}x Transaksi
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600">
                              {formatRupiah(item.averageBasket)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center gap-1 font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                +{formatNumber(item.totalPointsEarned)}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              {item.customer.totalDebt > 0 ? (
                                <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md font-mono">
                                  {formatRupiah(item.customer.totalDebt)}
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                  Lunas
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => {
                                  sound.playTap();
                                  setSelectedCustomerId(item.customer.id);
                                }}
                                className="px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold text-xs inline-flex items-center gap-1 transition-colors"
                              >
                                <span>Detail Log</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Detailed Transaction History Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Riwayat Transaksi & Audit Log Poin
                  </h3>
                  <span className="text-xs bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full">
                    {filteredActivityTransactions.length} Transaksi Ditemukan
                  </span>
                </div>
                {selectedCustomerId !== 'ALL' && (
                  <button
                    onClick={() => setSelectedCustomerId('ALL')}
                    className="text-xs text-sky-600 hover:text-sky-700 font-bold"
                  >
                    Reset ke Semua Pelanggan
                  </button>
                )}
              </div>

              {filteredActivityTransactions.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Receipt className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-sm font-bold text-slate-600">Tidak ada riwayat transaksi</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Belum ada transaksi yang tercatat untuk filter pelanggan dan rentang waktu yang dipilih.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                        <th className="py-3 px-4">Waktu & No. Invoice</th>
                        <th className="py-3 px-4">Pelanggan & Kasir</th>
                        <th className="py-3 px-4">Item Belanja (Satuan)</th>
                        <th className="py-3 px-4 text-center">Loyalitas Poin</th>
                        <th className="py-3 px-4 text-center">Metode & Status</th>
                        <th className="py-3 px-4 text-right">Total Pembayaran</th>
                        <th className="py-3 px-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {filteredActivityTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Time & Invoice */}
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-slate-900">{tx.invoiceNumber}</div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3" />
                              <span>{formatDateTime(tx.timestamp)}</span>
                            </div>
                          </td>

                          {/* Customer & Cashier */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-800">{tx.customerName || 'Member'}</div>
                            <div className="text-[11px] text-slate-400">
                              Kasir: <span className="font-medium text-slate-600">{tx.cashierName}</span>
                            </div>
                          </td>

                          {/* Items Breakdown */}
                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="space-y-0.5">
                              {tx.items.slice(0, 3).map((it, i) => (
                                <div key={i} className="text-[11px] text-slate-700 flex items-center gap-1">
                                  <span className="font-bold font-mono text-sky-700">{it.quantity} {it.unitName}</span>
                                  <span className="truncate">{it.productName}</span>
                                </div>
                              ))}
                              {tx.items.length > 3 && (
                                <span className="text-[10px] text-slate-400 italic">
                                  +{tx.items.length - 3} item lainnya...
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Points Earned / Redeemed */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              {tx.pointsEarned > 0 && (
                                <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <ArrowUpRight className="w-3 h-3" />
                                  +{tx.pointsEarned} Poin
                                </span>
                              )}
                              {tx.pointsUsed > 0 && (
                                <span className="text-[11px] font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <ArrowDownRight className="w-3 h-3" />
                                  -{tx.pointsUsed} Poin (-{formatRupiah(tx.pointsDiscountAmount)})
                                </span>
                              )}
                              {!tx.pointsEarned && !tx.pointsUsed && (
                                <span className="text-[11px] text-slate-400">-</span>
                              )}
                            </div>
                          </td>

                          {/* Payment Method & Status */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 font-mono uppercase mb-0.5">
                              {tx.paymentMethod.replace('_', ' ')}
                            </span>
                            <div>
                              {tx.paymentStatus === 'LUNAS' ? (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                                  LUNAS
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md">
                                  TEMPO PIUTANG
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Total Amount Paid */}
                          <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900 text-sm">
                            {formatRupiah(tx.finalAmount)}
                          </td>

                          {/* WhatsApp Invoice Share */}
                          <td className="py-3.5 px-4 text-center">
                            {tx.customerWhatsapp ? (
                              <button
                                onClick={() => handleSendInvoiceWA(tx)}
                                title="Kirim Salinan Struk via WhatsApp"
                                className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors inline-flex items-center gap-1"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-[11px] font-bold hidden sm:inline">Kirim WA</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          ADD / EDIT CUSTOMER MODAL
         ========================================================================= */}
      {(editingCustomer || isAddingNew) && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 select-none">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {isAddingNew ? 'Tambah Pelanggan Baru' : `Edit Pelanggan: ${editingCustomer?.name}`}
              </h3>
              <button
                onClick={() => {
                  setEditingCustomer(null);
                  setIsAddingNew(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={isAddingNew ? handleAddNewSubmit : handleSaveEdit} className="py-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Pelanggan *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Alamat Lengkap</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Kategori Tier Membership</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { tier: 'REGULER' as const, label: 'Reguler', color: 'border-slate-300 text-slate-700 bg-white' },
                    { tier: 'SILVER' as const, label: 'Silver', color: 'border-slate-400 text-slate-800 bg-slate-100' },
                    { tier: 'GOLD' as const, label: 'Gold', color: 'border-amber-400 text-amber-900 bg-amber-50' },
                    { tier: 'PLATINUM' as const, label: 'Platinum', color: 'border-purple-400 text-purple-900 bg-purple-50' },
                  ].map((t) => (
                    <button
                      key={t.tier}
                      type="button"
                      onClick={() => setMembershipTier(t.tier)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center flex flex-col items-center justify-center ${
                        membershipTier === t.tier
                          ? 'ring-2 ring-indigo-500 border-indigo-600 bg-indigo-50/80 text-indigo-900 shadow-2xs'
                          : `${t.color} hover:opacity-90`
                      }`}
                    >
                      <span className="uppercase text-[10px] tracking-wider">{t.tier}</span>
                      <span className="text-[9px] font-normal opacity-70">
                        {t.tier === 'SILVER'
                          ? `Diskon ${storeSettings?.membershipDiscounts?.silver ?? 3}%`
                          : t.tier === 'GOLD'
                          ? `Diskon ${storeSettings?.membershipDiscounts?.gold ?? 5}%`
                          : t.tier === 'PLATINUM'
                          ? `Diskon ${storeSettings?.membershipDiscounts?.platinum ?? 10}%`
                          : 'Non-diskon'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Limit Piutang (Rp)</label>
                  <input
                    type="number"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {!isAddingNew && currentUserRole === 'ADMIN' && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Saldo Poin Loyalitas</label>
                    <input
                      type="number"
                      value={totalPoints}
                      onChange={(e) => setTotalPoints(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none text-amber-700 font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingCustomer(null);
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
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          WHATSAPP BLAST MODAL
         ========================================================================= */}
      {isBlastModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 md:p-5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600 text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/20 backdrop-blur-xs rounded-2xl">
                  <Megaphone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base md:text-lg font-bold">WhatsApp Blast Promo & Notifikasi Massal</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/20 uppercase tracking-wider">
                      Official Web API
                    </span>
                  </div>
                  <p className="text-xs text-emerald-100">
                    Kirim pesan promo diskon, pengingat saldo poin reward, info produk, atau tempo piutang langsung ke WhatsApp pelanggan.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  sound.playTap();
                  setIsBlastModalOpen(false);
                }}
                className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Audience Quick Selector Tabs */}
            <div className="bg-slate-50 border-b border-slate-200 p-3 md:px-5 flex items-center gap-2 overflow-x-auto">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Target Audiens:
              </span>
              {[
                { id: 'ALL' as const, label: 'Semua Pelanggan', count: customers.length },
                { id: 'PLATINUM' as const, label: 'Platinum', count: customers.filter(c => c.membershipTier === 'PLATINUM').length },
                { id: 'GOLD' as const, label: 'Gold', count: customers.filter(c => c.membershipTier === 'GOLD').length },
                { id: 'SILVER' as const, label: 'Silver', count: customers.filter(c => c.membershipTier === 'SILVER').length },
                { id: 'WITH_POINTS' as const, label: 'Punya Poin (>0)', count: customers.filter(c => (c.totalPoints || 0) > 0).length },
                { id: 'WITH_DEBT' as const, label: 'Ada Piutang (>0)', count: customers.filter(c => (c.totalDebt || 0) > 0).length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleChangeAudience(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    blastAudience === tab.id
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    blastAudience === tab.id ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Modal Content Grid */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
              {/* Left Column: Template & Message Composer */}
              <div className="lg:col-span-7 p-4 md:p-5 space-y-4 overflow-y-auto">
                {/* Preset Templates */}
                <div>
                  <label className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                      Pilih Template Pesan Siap Pakai:
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {BLAST_PRESETS.map((preset) => (
                      <button
                        key={preset.key}
                        onClick={() => handleSelectPreset(preset.key)}
                        type="button"
                        className={`text-left p-2.5 rounded-xl border transition-all text-xs ${
                          blastPresetKey === preset.key
                            ? 'border-emerald-500 bg-emerald-50/70 text-emerald-950 font-bold shadow-2xs'
                            : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-bold">{preset.title}</span>
                          {blastPresetKey === preset.key && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-1 font-normal">
                          {preset.description}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Variable Placeholder Chips */}
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                    Variabel Dinamis Otomatis (Klik untuk menyisipkan):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { tag: '{nama}', desc: 'Nama Pelanggan' },
                      { tag: '{tier}', desc: 'Tier Member' },
                      { tag: '{poin}', desc: 'Saldo Poin' },
                      { tag: '{piutang}', desc: 'Nominal Piutang' },
                      { tag: '{toko}', desc: 'Nama Toko' },
                      { tag: '{alamat_toko}', desc: 'Alamat Toko' },
                      { tag: '{alamat}', desc: 'Alamat Customer' },
                    ].map((item) => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => handleInsertPlaceholder(item.tag)}
                        className="px-2 py-1 rounded-lg bg-white border border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 text-[11px] font-mono text-emerald-700 font-bold transition-colors flex items-center gap-1 shadow-2xs"
                        title={item.desc}
                      >
                        <span>{item.tag}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message Textarea */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">Isi Pesan Promosi WhatsApp</label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {blastMessage.length} karakter
                    </span>
                  </div>
                  <textarea
                    rows={5}
                    value={blastMessage}
                    onChange={(e) => setBlastMessage(e.target.value)}
                    placeholder="Ketik isi pesan WhatsApp blast di sini..."
                    className="w-full p-3 rounded-2xl border border-slate-300 text-xs md:text-sm text-slate-900 focus:outline-none focus:border-emerald-500 font-sans shadow-2xs"
                  />
                </div>

                {/* Live Message Preview (WhatsApp Styled Bubble) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                      Live Preview WhatsApp (Simulasi Penerima Pertama)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const sampleCust = eligibleBlastCustomers[0] || customers[0] || {
                          id: 'demo',
                          name: 'Budi Santoso',
                          phone: '081234567890',
                          whatsapp: '081234567890',
                          address: 'Jl. Merdeka No. 12',
                          totalPoints: 120,
                          creditLimit: 500000,
                          totalDebt: 75000,
                          membershipTier: 'GOLD',
                          createdAt: '2026-01-01'
                        };
                        const previewText = renderPersonalizedMessage(blastMessage, sampleCust);
                        navigator.clipboard.writeText(previewText);
                        setCopiedPreview(true);
                        setTimeout(() => setCopiedPreview(false), 2000);
                      }}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                    >
                      {copiedPreview ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Tersalin!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin Teks</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-[#e5ddd5] p-3.5 rounded-2xl border border-slate-300 shadow-inner">
                    <div className="bg-white rounded-2xl rounded-tl-xs p-3 shadow-sm max-w-[90%] space-y-1 relative border border-slate-200">
                      <div className="text-[11px] font-bold text-emerald-800">
                        Kepada: {eligibleBlastCustomers[0]?.name || 'Pelanggan'} ({eligibleBlastCustomers[0]?.whatsapp || '0812xxxx'})
                      </div>
                      <p className="text-xs text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {renderPersonalizedMessage(
                          blastMessage,
                          eligibleBlastCustomers[0] || customers[0] || {
                            id: 'demo',
                            name: 'Budi Santoso',
                            phone: '081234567890',
                            whatsapp: '081234567890',
                            address: 'Jl. Merdeka No. 12',
                            totalPoints: 120,
                            creditLimit: 500000,
                            totalDebt: 75000,
                            membershipTier: 'GOLD',
                            createdAt: '2026-01-01'
                          }
                        )}
                      </p>
                      <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 pt-1">
                        <span>Sekarang</span>
                        <CheckCircle2 className="w-3 h-3 text-sky-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Recipient Selection & Blast Launcher */}
              <div className="lg:col-span-5 p-4 md:p-5 flex flex-col bg-slate-50/70 space-y-3 overflow-y-auto">
                {/* Blast Execution Card */}
                <div className="bg-white p-3.5 rounded-2xl border border-emerald-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Progres Pengiriman Blast</span>
                      <span className="text-[11px] text-slate-500">
                        {Object.keys(blastSentMap).length} dari {selectedRecipientIds.length} penerima terkirim
                      </span>
                    </div>
                    {Object.keys(blastSentMap).length > 0 && (
                      <button
                        type="button"
                        onClick={handleResetBlastSent}
                        className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 font-bold"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2.5 rounded-full transition-all duration-300"
                      style={{
                        width: `${
                          selectedRecipientIds.length > 0
                            ? Math.min(100, (Object.keys(blastSentMap).length / selectedRecipientIds.length) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  {/* 1-Click Sequential Sender Button */}
                  <button
                    type="button"
                    onClick={handleSendNextBlast}
                    disabled={selectedRecipientIds.length === 0}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all ${
                      selectedRecipientIds.length === 0
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : eligibleBlastCustomers.filter(c => selectedRecipientIds.includes(c.id) && !blastSentMap[c.id]).length === 0
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-[0.98]'
                    }`}
                  >
                    {eligibleBlastCustomers.filter(c => selectedRecipientIds.includes(c.id) && !blastSentMap[c.id]).length === 0 ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Semua Penerima Terpilih Selesai Dikirim!</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>
                          Kirim WhatsApp Berikutnya (1-Klik):{' '}
                          {eligibleBlastCustomers.find(c => selectedRecipientIds.includes(c.id) && !blastSentMap[c.id])?.name}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                      </>
                    )}
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">
                    Tautan membuka obrolan WhatsApp Web / Aplikasi secara resmi dengan pesan yang sudah terisi otomatis.
                  </p>
                </div>

                {/* Recipients Header & Selection Controls */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700">Daftar Penerima</span>
                    <span className="text-[11px] font-mono text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded-full">
                      {selectedRecipientIds.length} Terpilih
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={handleSelectAllRecipients}
                      className="text-sky-600 hover:underline text-[11px] font-bold"
                    >
                      Pilih Semua
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={handleDeselectAllRecipients}
                      className="text-slate-500 hover:underline text-[11px]"
                    >
                      Batal Semua
                    </button>
                  </div>
                </div>

                {/* Recipient Search Filter */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={recipientSearch}
                    onChange={(e) => setRecipientSearch(e.target.value)}
                    placeholder="Cari penerima nama / no. WhatsApp..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Recipient Item Cards */}
                <div className="space-y-1.5 flex-1 overflow-y-auto max-h-80 pr-1">
                  {displayedRecipients.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-xs">
                      Tidak ada pelanggan sesuai filter audiens ini.
                    </div>
                  ) : (
                    displayedRecipients.map((cust) => {
                      const isSelected = selectedRecipientIds.includes(cust.id);
                      const isSent = !!blastSentMap[cust.id];
                      return (
                        <div
                          key={cust.id}
                          className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2 ${
                            isSelected
                              ? isSent
                                ? 'bg-emerald-50/50 border-emerald-300'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                              : 'bg-slate-100/70 border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleRecipient(cust.id)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900 truncate">
                                  {cust.name}
                                </span>
                                {cust.membershipTier && cust.membershipTier !== 'REGULER' && (
                                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                    cust.membershipTier === 'PLATINUM'
                                      ? 'bg-purple-100 text-purple-700'
                                      : cust.membershipTier === 'GOLD'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {cust.membershipTier}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono truncate flex items-center gap-2">
                                <span>{cust.whatsapp || cust.phone}</span>
                                {cust.totalPoints > 0 && (
                                  <span className="text-amber-600 font-bold">
                                    • {formatNumber(cust.totalPoints)} Poin
                                  </span>
                                )}
                                {cust.totalDebt > 0 && (
                                  <span className="text-rose-600 font-bold">
                                    • Hutang: {formatRupiah(cust.totalDebt)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {isSent ? (
                              <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Terkirim
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSendIndividualBlast(cust)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-colors"
                                title="Buka WhatsApp untuk pelanggan ini"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>Kirim</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 md:px-5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Pesan akan dikirim langsung via protokol resmi WhatsApp Web (aman tanpa batasan akun).
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setIsBlastModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors"
              >
                Tutup Jendela
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
