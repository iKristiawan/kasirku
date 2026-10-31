import React, { useState, useRef } from 'react';
import { 
  Settings, 
  Store, 
  Sparkles, 
  CreditCard, 
  Users, 
  ShieldCheck, 
  Briefcase, 
  UserCheck, 
  Save, 
  Plus, 
  Trash2, 
  Lock,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  Check,
  Eye,
  Download,
  Database,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  FolderArchive,
  X,
  Award,
  Clock,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { 
  StoreSettings, 
  User, 
  UserRole, 
  Product, 
  ProductCategory,
  Customer, 
  Supplier, 
  Transaction, 
  BackupPayload,
  AttendanceRecord,
  StockOpnameRecord 
} from '../types/pos';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';

const PRESET_LOGOS = [
  {
    id: 'supermarket',
    name: 'Toko Berkah (Supermarket)',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 50" width="160" height="50"><rect x="2" y="2" width="156" height="46" rx="8" fill="none" stroke="black" stroke-width="2.5"/><path d="M14 16 L24 16 L28 32 L40 32 L42 22 L22 22" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="29" cy="35" r="2" fill="black"/><circle cx="39" cy="35" r="2" fill="black"/><text x="48" y="24" font-family="sans-serif" font-weight="900" font-size="13" fill="black" letter-spacing="1">BERKAH JAYA</text><text x="48" y="36" font-family="sans-serif" font-weight="600" font-size="8.5" fill="black" letter-spacing="2">SUPERMARKET</text></svg>',
  },
  {
    id: 'mart',
    name: 'Mart Minimalis (Emblem Keranjang)',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 50" width="160" height="50"><circle cx="26" cy="25" r="18" fill="black"/><path d="M17 19 L21 19 L24 29 L32 29 L34 22 L19 22" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"/><circle cx="25" cy="31" r="1.5" fill="white"/><circle cx="31" cy="31" r="1.5" fill="white"/><text x="52" y="24" font-family="sans-serif" font-weight="900" font-size="13" fill="black" letter-spacing="1.5">TOKO KITA</text><text x="52" y="36" font-family="sans-serif" font-weight="600" font-size="8.5" fill="black" letter-spacing="2">GROSIR &amp; RETAIL</text></svg>',
  },
  {
    id: 'coffee',
    name: 'Coffee & Snack (Badge Kafe)',
    svg: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 50" width="160" height="50"><rect x="3" y="3" width="154" height="44" rx="4" fill="none" stroke="black" stroke-width="2"/><path d="M18 18 H32 V27 C32 30 29 32 25 32 C21 32 18 30 18 27 Z" fill="none" stroke="black" stroke-width="2"/><path d="M32 20 H35 C36 20 37 21 37 22 V23 C37 24 36 25 35 25 H32" fill="none" stroke="black" stroke-width="1.8"/><line x1="16" y1="35" x2="34" y2="35" stroke="black" stroke-width="2"/><text x="46" y="24" font-family="sans-serif" font-weight="900" font-size="12" fill="black" letter-spacing="1">WARUNG KOPI</text><text x="46" y="36" font-family="sans-serif" font-weight="600" font-size="8.5" fill="black" letter-spacing="1.5">&amp; SNACK CORNER</text></svg>',
  },
];

interface SettingsViewProps {
  storeSettings: StoreSettings;
  users: User[];
  products: Product[];
  categories?: ProductCategory[];
  customers: Customer[];
  suppliers: Supplier[];
  transactions: Transaction[];
  attendances?: AttendanceRecord[];
  stockOpnames?: StockOpnameRecord[];
  onUpdateStoreSettings: (settings: StoreSettings) => void;
  onUpdateUsers: (users: User[]) => void;
  onResetToDemoData: () => void;
  onRestoreBackup: (backup: BackupPayload) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  storeSettings,
  users,
  products,
  categories = [],
  customers,
  suppliers,
  transactions,
  attendances = [],
  stockOpnames = [],
  onUpdateStoreSettings,
  onUpdateUsers,
  onResetToDemoData,
  onRestoreBackup,
}) => {
  const [formSettings, setFormSettings] = useState<StoreSettings>({ ...storeSettings });
  const [userList, setUserList] = useState<User[]>([...users]);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Backup & Restore state
  const [backupNotice, setBackupNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [importCandidate, setImportCandidate] = useState<BackupPayload | null>(null);
  const [restoreUsersOption, setRestoreUsersOption] = useState<boolean>(true);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // New user form states
  const [newUserName, setNewUserName] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('KARYAWAN');

  // Logo file upload ref & handler
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file maksimal 2MB untuk performa cetak thermal yang optimal.');
      return;
    }

    sound.playTap();
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setFormSettings((prev) => ({
        ...prev,
        storeLogo: result,
        showLogoOnReceipt: true,
      }));
    };
    reader.readAsDataURL(file);
    // Reset file input so same file can be re-selected if desired
    e.target.value = '';
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playSuccessChime();
    onUpdateStoreSettings(formSettings);
    onUpdateUsers(userList);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleAddUser = () => {
    if (!newUserName.trim() || newUserPin.length !== 4) {
      alert('Harap isi nama dan PIN 4-digit!');
      return;
    }
    sound.playTap();
    const newUser: User = {
      id: 'user_' + Date.now(),
      name: newUserName.trim(),
      pin: newUserPin,
      role: newUserRole,
      avatarColor:
        newUserRole === 'ADMIN'
          ? 'bg-indigo-600'
          : newUserRole === 'STORE_MANAGER'
          ? 'bg-emerald-600'
          : 'bg-amber-600',
    };
    const updated = [...userList, newUser];
    setUserList(updated);
    onUpdateUsers(updated);
    setNewUserName('');
    setNewUserPin('');
  };

  const handleDeleteUser = (userId: string) => {
    if (userList.length <= 1) {
      alert('Minimal harus ada 1 pengguna di sistem!');
      return;
    }
    sound.playTap();
    const updated = userList.filter((u) => u.id !== userId);
    setUserList(updated);
    onUpdateUsers(updated);
  };

  const handleUpdateUserPin = (userId: string, newPin: string) => {
    const updated = userList.map((u) => (u.id === userId ? { ...u, pin: newPin } : u));
    setUserList(updated);
  };

  // =========================================================================
  // BACKUP & RESTORE HANDLERS
  // =========================================================================
  const handleExportBackup = () => {
    sound.playTap();
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `backup-kasirku-${dateStr}-${timeStr}.json`;

    const payload: BackupPayload = {
      app: 'Kasir Toko Tablet POS',
      version: '1.0',
      exportedAt: now.toISOString(),
      timestamp: now.getTime(),
      stats: {
        productCount: products.length,
        customerCount: customers.length,
        supplierCount: suppliers.length,
        transactionCount: transactions.length,
        attendanceCount: attendances.length,
        userCount: userList.length,
        categoryCount: categories.length,
        stockOpnameCount: stockOpnames.length,
      },
      data: {
        products,
        customers,
        suppliers,
        transactions,
        attendances,
        storeSettings: formSettings,
        users: userList,
        categories,
        stockOpnames,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    sound.playSuccessChime();
    setBackupNotice({
      type: 'success',
      message: `File cadangan "${fileName}" berhasil diunduh. Berisi ${products.length} produk, ${customers.length} pelanggan, ${suppliers.length} supplier, ${transactions.length} transaksi, ${attendances.length} absensi, dan ${stockOpnames.length} riwayat Stock Opname.`,
    });
    setTimeout(() => setBackupNotice(null), 6000);
  };

  // Recurring Sunday Midnight Backup Scheduler state
  const [autoSundayBackupEnabled, setAutoSundayBackupEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('kasir_auto_sunday_backup_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [lastSundayBackupTime, setLastSundayBackupTime] = useState<string>(() => {
    return localStorage.getItem('kasir_last_sunday_backup_time') || '';
  });
  const [latestSundayBackup, setLatestSundayBackup] = useState<{
    fileName: string;
    timestamp: number;
    dateFormatted: string;
    sizeKb: number;
    jsonString: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('kasir_latest_sunday_backup');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const createBackupPayloadObject = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const fileName = `kasirku-backup-mingguan-${dateStr}.json`;

    const payload: BackupPayload = {
      app: 'Kasir Toko Tablet POS',
      version: '1.0',
      exportedAt: now.toISOString(),
      timestamp: now.getTime(),
      stats: {
        productCount: products.length,
        customerCount: customers.length,
        supplierCount: suppliers.length,
        transactionCount: transactions.length,
        attendanceCount: attendances.length,
        userCount: userList.length,
        categoryCount: categories.length,
        stockOpnameCount: stockOpnames.length,
      },
      data: {
        products,
        customers,
        suppliers,
        transactions,
        attendances,
        storeSettings: formSettings,
        users: userList,
        categories,
        stockOpnames,
      },
    };
    return { fileName, payload, dateFormatted: now.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short' }) };
  };

  const handleGenerateSundayBackup = (manual = false) => {
    if (manual) sound.playTap();
    const { fileName, payload, dateFormatted } = createBackupPayloadObject();
    const jsonString = JSON.stringify(payload, null, 2);
    const sizeKb = Math.round((new Blob([jsonString]).size / 1024) * 10) / 10;

    const backupRecord = {
      fileName,
      timestamp: Date.now(),
      dateFormatted,
      sizeKb,
      jsonString,
    };

    setLatestSundayBackup(backupRecord);
    setLastSundayBackupTime(new Date().toISOString());
    try {
      localStorage.setItem('kasir_latest_sunday_backup', JSON.stringify(backupRecord));
      localStorage.setItem('kasir_last_sunday_backup_time', new Date().toISOString());
    } catch {}

    if (manual) {
      sound.playSuccessChime();
      setBackupNotice({
        type: 'success',
        message: `Cadangan mingguan (${fileName}, ${sizeKb} KB) berhasil digenerate! Tautan unduh langsung siap digunakan.`,
      });
      setTimeout(() => setBackupNotice(null), 6000);
    }
  };

  const handleDownloadSundayBackup = () => {
    sound.playTap();
    let currentBackup = latestSundayBackup;
    if (!currentBackup) {
      const { fileName, payload, dateFormatted } = createBackupPayloadObject();
      const jsonString = JSON.stringify(payload, null, 2);
      const sizeKb = Math.round((new Blob([jsonString]).size / 1024) * 10) / 10;
      currentBackup = {
        fileName,
        timestamp: Date.now(),
        dateFormatted,
        sizeKb,
        jsonString,
      };
      setLatestSundayBackup(currentBackup);
    }

    const blob = new Blob([currentBackup.jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentBackup.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    sound.playSuccessChime();
  };

  // Helper for next Sunday midnight calculation
  const getNextSundayMidnightText = () => {
    const now = new Date();
    const nextSunday = new Date(now);
    const dayOfWeek = now.getDay();
    const daysToAdd = dayOfWeek === 0 ? 7 : 7 - dayOfWeek;
    nextSunday.setDate(now.getDate() + daysToAdd);
    nextSunday.setHours(0, 0, 0, 0);
    return nextSunday.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' pukul 00:00 WIB';
  };

  // Auto initialize/check on mount if enabled
  React.useEffect(() => {
    if (autoSundayBackupEnabled && !latestSundayBackup) {
      handleGenerateSundayBackup(false);
    }
  }, [autoSundayBackupEnabled]);

  const handleImportFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    sound.playTap();
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        // Normalize format: support standard BackupPayload or direct object
        const rawData = parsed.data || parsed;
        const candidateProducts = Array.isArray(rawData.products) ? rawData.products : [];
        const candidateCustomers = Array.isArray(rawData.customers) ? rawData.customers : [];
        const candidateSuppliers = Array.isArray(rawData.suppliers) ? rawData.suppliers : [];
        const candidateTransactions = Array.isArray(rawData.transactions) ? rawData.transactions : [];
        const candidateAttendances = Array.isArray(rawData.attendances) ? rawData.attendances : [];
        const candidateStockOpnames = Array.isArray(rawData.stockOpnames) ? rawData.stockOpnames : [];
        const candidateSettings = rawData.storeSettings || formSettings;
        const candidateUsers = Array.isArray(rawData.users) ? rawData.users : undefined;
        const candidateCategories = Array.isArray(rawData.categories) ? rawData.categories : undefined;

        if (
          candidateProducts.length === 0 &&
          candidateCustomers.length === 0 &&
          candidateTransactions.length === 0
        ) {
          sound.playError();
          setBackupNotice({
            type: 'error',
            message: 'File JSON tidak valid atau tidak memiliki data produk/pelanggan/transaksi yang dikenali.',
          });
          setTimeout(() => setBackupNotice(null), 5000);
          return;
        }

        const validPayload: BackupPayload = {
          app: parsed.app || 'Kasir Toko Tablet POS',
          version: parsed.version || '1.0',
          exportedAt: parsed.exportedAt || new Date().toISOString(),
          timestamp: parsed.timestamp || Date.now(),
          stats: {
            productCount: candidateProducts.length,
            customerCount: candidateCustomers.length,
            supplierCount: candidateSuppliers.length,
            transactionCount: candidateTransactions.length,
            attendanceCount: candidateAttendances.length,
            userCount: candidateUsers ? candidateUsers.length : userList.length,
            categoryCount: candidateCategories ? candidateCategories.length : categories.length,
            stockOpnameCount: candidateStockOpnames.length,
          },
          data: {
            products: candidateProducts,
            customers: candidateCustomers,
            suppliers: candidateSuppliers,
            transactions: candidateTransactions,
            attendances: candidateAttendances,
            storeSettings: candidateSettings,
            users: candidateUsers,
            categories: candidateCategories,
            stockOpnames: candidateStockOpnames,
          },
        };

        setImportCandidate(validPayload);
      } catch (err) {
        sound.playError();
        setBackupNotice({
          type: 'error',
          message: 'Gagal membaca file JSON. Pastikan format file JSON valid dan tidak rusak.',
        });
        setTimeout(() => setBackupNotice(null), 5000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmRestore = () => {
    if (!importCandidate) return;

    sound.playSuccessChime();
    const payloadToRestore: BackupPayload = {
      ...importCandidate,
      data: {
        ...importCandidate.data,
        users: restoreUsersOption && importCandidate.data.users ? importCandidate.data.users : userList,
      },
    };

    onRestoreBackup(payloadToRestore);
    setFormSettings({ ...payloadToRestore.data.storeSettings });
    if (restoreUsersOption && payloadToRestore.data.users && payloadToRestore.data.users.length > 0) {
      setUserList([...payloadToRestore.data.users]);
    }

    const prodCount = payloadToRestore.data.products.length;
    const custCount = payloadToRestore.data.customers.length;
    const txCount = payloadToRestore.data.transactions.length;

    setImportCandidate(null);
    setBackupNotice({
      type: 'success',
      message: `Data berhasil dipulihkan! (${prodCount} produk, ${custCount} pelanggan, ${txCount} riwayat transaksi aktif).`,
    });
    setTimeout(() => setBackupNotice(null), 6000);
  };

  return (
    <div className="flex-1 p-4 md:p-6 bg-slate-100 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-sky-600" />
              <span>Pengaturan Toko, Loyalitas Poin & Pengguna</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Khusus Admin: Atur identitas toko, nomor rekening BCA, rasio poin, dan hak akses karyawan.
            </p>
          </div>

          {savedSuccess && (
            <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
              Pengaturan Tersimpan!
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6">
          {/* Card 1: Identitas Toko & Struk */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Store className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">Identitas Toko & Struk Cetak</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Toko</label>
                <input
                  type="text"
                  required
                  value={formSettings.storeName}
                  onChange={(e) => setFormSettings({ ...formSettings, storeName: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-bold focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nomor Telepon Toko</label>
                <input
                  type="text"
                  required
                  value={formSettings.storePhone}
                  onChange={(e) => setFormSettings({ ...formSettings, storePhone: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">Alamat Toko</label>
                <input
                  type="text"
                  required
                  value={formSettings.storeAddress}
                  onChange={(e) => setFormSettings({ ...formSettings, storeAddress: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-700 block mb-1">Pesan Footer Struk</label>
                <input
                  type="text"
                  value={formSettings.storeFooterReceipt}
                  onChange={(e) => setFormSettings({ ...formSettings, storeFooterReceipt: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              {/* Logo Toko untuk Struk Thermal */}
              <div className="md:col-span-2 pt-4 border-t border-slate-100 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-sky-600" />
                      <span>Logo Toko untuk Struk Thermal</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Logo akan dicetak di bagian paling atas struk thermal (58mm/80mm) secara monokrom kontras tinggi.
                    </p>
                  </div>

                  {/* Toggle display logo on receipt */}
                  <label className="relative inline-flex items-center cursor-pointer gap-2 shrink-0">
                    <span className="text-[11px] font-semibold text-slate-600">
                      Tampilkan di Struk
                    </span>
                    <input
                      type="checkbox"
                      checked={formSettings.showLogoOnReceipt ?? true}
                      onChange={(e) => setFormSettings({ ...formSettings, showLogoOnReceipt: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5.5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:right-[20px] peer-checked:after:right-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-sky-600"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  {/* Left Column: Upload Controls & Presets */}
                  <div className="md:col-span-2 space-y-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          fileInputRef.current?.click();
                        }}
                        className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Unggah Logo (PNG / JPG / SVG)</span>
                      </button>

                      {formSettings.storeLogo && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playTap();
                            setFormSettings({ ...formSettings, storeLogo: '' });
                          }}
                          className="px-3 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          <span>Hapus Logo</span>
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      💡 <strong>Saran:</strong> Gunakan gambar logo siluet, badge, atau teks bertransparan/putih. Sistem otomatis menerapkan filter monokrom (*grayscale &amp; high-contrast*) agar hasil bakar thermal head printer tajam dan jelas.
                    </p>

                    {/* Preset Logo Templates */}
                    <div className="pt-2 border-t border-slate-200/60">
                      <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                        Atau pilih template logo siap pakai:
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {PRESET_LOGOS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setFormSettings({
                                ...formSettings,
                                storeLogo: preset.svg,
                                showLogoOnReceipt: true,
                              });
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                              formSettings.storeLogo === preset.svg
                                ? 'bg-sky-50 border-sky-400 text-sky-800 font-bold shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {formSettings.storeLogo === preset.svg && (
                              <Check className="w-3 h-3 text-sky-600" />
                            )}
                            <span>{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Live Thermal Print Simulation Preview */}
                  <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Eye className="w-3 h-3 text-slate-400" />
                      <span>Simulasi Cetak Thermal</span>
                    </span>

                    {formSettings.storeLogo && (formSettings.showLogoOnReceipt ?? true) ? (
                      <div className="w-full bg-slate-50 p-2.5 rounded-lg border border-dashed border-slate-300 text-center font-mono space-y-1">
                        <img
                          src={formSettings.storeLogo}
                          alt="Thermal Preview"
                          className="max-h-12 max-w-[140px] mx-auto object-contain filter grayscale contrast-150"
                        />
                        <div className="text-[11px] font-black text-slate-900 tracking-wider">
                          {formSettings.storeName || 'NAMA TOKO'}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          {formSettings.storeAddress || 'Alamat Toko'}
                        </div>
                        <div className="border-t border-dashed border-slate-400 my-1"></div>
                        <div className="text-[8px] text-slate-400 italic">
                          (Tercetak di bagian atas struk)
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-28 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg text-slate-400 text-center p-2">
                        <ImageIcon className="w-7 h-7 text-slate-300 mb-1" />
                        <span className="text-[10px] font-medium leading-tight">
                          Belum ada logo atau opsi logo dinonaktifkan
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Mekanisme Loyalitas Poin */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">Mekanisme Poin Loyalitas Pembelian</h3>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSettings.enablePoints}
                  onChange={(e) => setFormSettings({ ...formSettings, enablePoints: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Belanja Setiap (Rp) untuk Dapatkan 1 Poin
                </label>
                <input
                  type="number"
                  min="1000"
                  step="1000"
                  value={formSettings.spendPerPoint}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      spendPerPoint: parseFloat(e.target.value) || 10000,
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Contoh: Rp 10.000 = pelanggan belanja Rp 50.000 akan mendapatkan 5 Poin.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nilai Diskon per 1 Poin (Rp) Saat Ditukar
                </label>
                <input
                  type="number"
                  min="10"
                  step="10"
                  value={formSettings.pointValueRupiah}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      pointValueRupiah: parseFloat(e.target.value) || 100,
                    })
                  }
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Contoh: 1 Poin = Potongan Rp 100. Jika tukar 50 poin = Diskon Rp 5.000.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2.5: Diskon Membership Otomatis (Tier Silver, Gold, Platinum) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Diskon Khusus Tier Membership Pelanggan</h3>
                  <p className="text-[11px] text-slate-500">
                    Otomatis terpotong saat kasir memilih pelanggan member di POS Tablet.
                  </p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formSettings.enableMembershipDiscount ?? true}
                  onChange={(e) =>
                    setFormSettings({
                      ...formSettings,
                      enableMembershipDiscount: e.target.checked,
                    })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Silver Tier */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-700 uppercase">Tier Silver</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-200 text-slate-800">
                    SILVER
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    disabled={formSettings.enableMembershipDiscount === false}
                    value={formSettings.membershipDiscounts?.silver ?? 3}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        membershipDiscounts: {
                          silver: parseFloat(e.target.value) || 0,
                          gold: formSettings.membershipDiscounts?.gold ?? 5,
                          platinum: formSettings.membershipDiscounts?.platinum ?? 10,
                        },
                      })
                    }
                    className="w-full pr-7 pl-3 py-2 rounded-lg border border-slate-300 text-sm font-mono font-bold focus:border-indigo-500 focus:outline-none disabled:bg-slate-100"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    %
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Potongan belanja untuk member level Silver</p>
              </div>

              {/* Gold Tier */}
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-amber-900 uppercase">Tier Gold</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-200 text-amber-900">
                    GOLD
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    disabled={formSettings.enableMembershipDiscount === false}
                    value={formSettings.membershipDiscounts?.gold ?? 5}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        membershipDiscounts: {
                          silver: formSettings.membershipDiscounts?.silver ?? 3,
                          gold: parseFloat(e.target.value) || 0,
                          platinum: formSettings.membershipDiscounts?.platinum ?? 10,
                        },
                      })
                    }
                    className="w-full pr-7 pl-3 py-2 rounded-lg border border-amber-300 text-sm font-mono font-bold text-amber-950 focus:border-amber-500 focus:outline-none disabled:bg-slate-100"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-600">
                    %
                  </span>
                </div>
                <p className="text-[10px] text-amber-700/80 mt-1">Potongan belanja untuk member level Gold</p>
              </div>

              {/* Platinum Tier */}
              <div className="p-3 rounded-xl bg-purple-50/60 border border-purple-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-purple-900 uppercase">Tier Platinum</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-200 text-purple-900">
                    PLATINUM
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    disabled={formSettings.enableMembershipDiscount === false}
                    value={formSettings.membershipDiscounts?.platinum ?? 10}
                    onChange={(e) =>
                      setFormSettings({
                        ...formSettings,
                        membershipDiscounts: {
                          silver: formSettings.membershipDiscounts?.silver ?? 3,
                          gold: formSettings.membershipDiscounts?.gold ?? 5,
                          platinum: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    className="w-full pr-7 pl-3 py-2 rounded-lg border border-purple-300 text-sm font-mono font-bold text-purple-950 focus:border-purple-500 focus:outline-none disabled:bg-slate-100"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-purple-600">
                    %
                  </span>
                </div>
                <p className="text-[10px] text-purple-700/80 mt-1">Potongan belanja eksklusif tier Platinum</p>
              </div>
            </div>
          </div>

          {/* Card 3: Rekening Bank BCA & QRIS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Konfigurasi Rekening BCA & QRIS</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nomor Rekening BCA</label>
                <input
                  type="text"
                  value={formSettings.bcaAccountNumber}
                  onChange={(e) => setFormSettings({ ...formSettings, bcaAccountNumber: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono font-bold focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nama Pemilik Rekening</label>
                <input
                  type="text"
                  value={formSettings.bcaAccountName}
                  onChange={(e) => setFormSettings({ ...formSettings, bcaAccountName: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">BCA Merchant ID (NMID)</label>
                <input
                  type="text"
                  value={formSettings.bcaMerchantId}
                  onChange={(e) => setFormSettings({ ...formSettings, bcaMerchantId: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-300 text-xs md:text-sm font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Card 4: Manajemen Pengguna Kasir & Role */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Users className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Manajemen Pengguna (Admin, Store Manager, Karyawan)
              </h3>
            </div>

            {/* User List */}
            <div className="space-y-2">
              {userList.map((u) => (
                <div
                  key={u.id}
                  className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl ${u.avatarColor} text-white flex items-center justify-center font-bold text-xs`}>
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-xs md:text-sm font-bold text-slate-900">{u.name}</div>
                      <div className="text-[11px] text-slate-500 font-semibold">{u.role}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-slate-400">PIN:</span>
                      <input
                        type="text"
                        maxLength={4}
                        value={u.pin}
                        onChange={(e) => handleUpdateUserPin(u.id, e.target.value)}
                        className="w-16 p-1.5 rounded-lg border border-slate-300 text-xs font-mono font-bold text-center bg-white"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add User Row */}
            <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
              <div className="md:col-span-5">
                <input
                  type="text"
                  placeholder="Nama Karyawan Baru..."
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 text-xs bg-white"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                  className="w-full p-2 rounded-lg border border-slate-300 text-xs bg-white font-medium"
                >
                  <option value="KARYAWAN">Karyawan (Kasir)</option>
                  <option value="STORE_MANAGER">Store Manager</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <input
                  type="text"
                  maxLength={4}
                  placeholder="PIN 4-digit"
                  value={newUserPin}
                  onChange={(e) => setNewUserPin(e.target.value)}
                  className="w-full p-2 rounded-lg border border-slate-300 text-xs font-mono font-bold text-center bg-white"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={handleAddUser}
                  className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                >
                  + Tambah
                </button>
              </div>
            </div>
          </div>

          {/* Card 5: Cadangkan & Pulihkan Data (Backup & Restore) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Cadangkan & Pulihkan Data (Backup & Restore)
                </h3>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                <FileJson className="w-3.5 h-3.5" />
                <span>Format JSON Standar</span>
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Ekspor seluruh data toko (produk &amp; multi satuan, pelanggan &amp; poin, supplier, riwayat transaksi, dan profil toko) ke file JSON yang dapat diunduh, atau pulihkan kembali data dari file cadangan sebelumnya untuk menjaga integritas data Anda.
            </p>

            {/* Notification alert */}
            {backupNotice && (
              <div
                className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                  backupNotice.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {backupNotice.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-medium leading-relaxed">{backupNotice.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBackupNotice(null)}
                  className="p-1 hover:opacity-75 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Live Data Summary Pills */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Produk</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800">
                  {products.length} <span className="text-[10px] font-medium text-slate-500">item</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Pelanggan</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800">
                  {customers.length} <span className="text-[10px] font-medium text-slate-500">kontak</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Total Supplier</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800">
                  {suppliers.length} <span className="text-[10px] font-medium text-slate-500">vendor</span>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                <div className="text-[10px] uppercase font-bold text-slate-400">Riwayat Transaksi</div>
                <div className="text-sm md:text-base font-extrabold text-slate-800">
                  {transactions.length} <span className="text-[10px] font-medium text-slate-500">invoice</span>
                </div>
              </div>
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* Card A: Export */}
              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                      <Download className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Ekspor Cadangan (Download JSON)</h4>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Unduh file cadangan mandiri dalam format JSON yang dapat disimpan di Flashdisk, Google Drive, atau kartu memori tablet.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleExportBackup}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh File Cadangan (.json)</span>
                </button>
              </div>

              {/* Card B: Import */}
              <div className="p-4 bg-sky-50/50 rounded-xl border border-sky-100 flex flex-col justify-between space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-sky-600 text-white flex items-center justify-center">
                      <Upload className="w-4 h-4" />
                    </div>
                    <h4 className="text-xs font-bold text-slate-900">Pulihkan Cadangan (Import JSON)</h4>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Pilih file JSON hasil ekspor sebelumnya. Anda dapat meninjau rincian item sebelum menimpa data yang sedang berjalan.
                  </p>
                </div>

                <div>
                  <input
                    type="file"
                    ref={importFileInputRef}
                    accept=".json,application/json"
                    onChange={handleImportFileSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => importFileInputRef.current?.click()}
                    className="w-full py-2.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    <FolderArchive className="w-3.5 h-3.5" />
                    <span>Pilih File Cadangan untuk Dipulihkan</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Recurring Sunday Midnight Backup Scheduler */}
            <div className="p-4 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/60 rounded-2xl border border-indigo-200/80 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs md:text-sm font-bold text-slate-900">
                        Jadwal Pencadangan Otomatis Mingguan (Sunday Backup Scheduler)
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Minggu 00:00
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Sistem menjadwalkan ekspor JSON otomatis seluruh data toko (transaksi, produk, pelanggan) setiap Minggu tengah malam.
                    </p>
                  </div>
                </div>

                {/* Toggle Auto Backup */}
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer self-start sm:self-auto shrink-0 select-none bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs">
                  <input
                    type="checkbox"
                    checked={autoSundayBackupEnabled}
                    onChange={(e) => {
                      sound.playTap();
                      setAutoSundayBackupEnabled(e.target.checked);
                      localStorage.setItem('kasir_auto_sunday_backup_enabled', String(e.target.checked));
                    }}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Jadwal Aktif</span>
                </label>
              </div>

              {/* Schedule Info & Status Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white rounded-xl border border-indigo-100/90 shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Jadwal Eksekusi Berikutnya</span>
                  </div>
                  <div className="font-bold text-slate-800 mt-1">
                    {getNextSundayMidnightText()}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Otomatis merangkum transaksi, katalog produk, dan kontak pelanggan
                  </div>
                </div>

                <div className="p-3 bg-white rounded-xl border border-indigo-100/90 shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Status Snapshot Terakhir</span>
                  </div>
                  <div className="font-bold text-slate-800 mt-1 truncate">
                    {latestSundayBackup ? latestSundayBackup.fileName : 'Belum ada cadangan dibuat'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {latestSundayBackup ? `${latestSundayBackup.sizeKb} KB · ${latestSundayBackup.dateFormatted}` : 'Klik tombol di bawah untuk membuat snapshot sekarang'}
                  </div>
                </div>
              </div>

              {/* Action Buttons for Sunday Backup */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-indigo-100">
                <button
                  type="button"
                  onClick={() => handleGenerateSundayBackup(true)}
                  className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  title="Simulasikan dan generate paket snapshot cadangan data minggu ini sekarang"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Jalankan Snapshot Minggu Ini Sekarang (Simulasi)</span>
                </button>

                {latestSundayBackup && (
                  <button
                    type="button"
                    onClick={handleDownloadSundayBackup}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                    title={`Unduh ${latestSundayBackup.fileName}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Cadangan Minggu Ini ({latestSundayBackup.sizeKb} KB)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Cloud Backend (Firebase Firestore) Info */}
            <div className="p-3.5 bg-gradient-to-r from-amber-50/70 to-orange-50/70 rounded-xl border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-black text-sm shadow-xs">
                  🔥
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">Cloud Database: Google Firebase Firestore</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span>Terhubung (Active)</span>
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5 font-mono">
                    Project: <span className="font-bold text-slate-800">gen-lang-client-0685545221</span> | Region: <span className="font-bold text-slate-800">asia-southeast1</span>
                  </div>
                </div>
              </div>
              <span className="text-[11px] font-medium text-amber-900 bg-amber-100/70 px-2.5 py-1 rounded-lg self-start sm:self-auto border border-amber-200">
                Aturan Keamanan Aktif &amp; Terverifikasi
              </span>
            </div>
          </div>

          {/* Bottom Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                if (confirm('Kembalikan semua data ke sampel bawaan awal? Data Anda saat ini akan di-reset.')) {
                  onResetToDemoData();
                }
              }}
              className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 text-slate-600 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset ke Data Demo Bawaan</span>
            </button>

            <button
              type="submit"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-extrabold text-sm shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Simpan Semua Pengaturan</span>
            </button>
          </div>
        </form>
      </div>

      {/* MODAL: Konfirmasi Pemulihan Data (Restore Preview) */}
      {importCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Konfirmasi Pemulihan Data
                  </h3>
                  <p className="text-xs text-slate-500">
                    File cadangan valid terdeteksi. Silakan periksa rincian data di bawah.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportCandidate(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Candidate Metadata Summary */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between items-center text-slate-600">
                <span>Nama Aplikasi:</span>
                <span className="font-bold text-slate-900">{importCandidate.app}</span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Waktu Cadangan Dibuat:</span>
                <span className="font-mono text-slate-800">
                  {new Date(importCandidate.exportedAt || importCandidate.timestamp).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-600">
                <span>Toko di File Cadangan:</span>
                <span className="font-bold text-sky-700">
                  {importCandidate.data.storeSettings?.storeName || 'Toko Default'}
                </span>
              </div>
            </div>

            {/* Item counts breakdown */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl">
                <span className="text-[11px] font-bold text-emerald-800 block">Katalog Produk</span>
                <span className="text-lg font-extrabold text-emerald-950">
                  {importCandidate.data.products.length} <span className="text-xs font-semibold text-emerald-700">item</span>
                </span>
              </div>

              <div className="p-3 bg-sky-50/60 border border-sky-100 rounded-xl">
                <span className="text-[11px] font-bold text-sky-800 block">Daftar Pelanggan</span>
                <span className="text-lg font-extrabold text-sky-950">
                  {importCandidate.data.customers.length} <span className="text-xs font-semibold text-sky-700">kontak</span>
                </span>
              </div>

              <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl">
                <span className="text-[11px] font-bold text-amber-800 block">Daftar Supplier</span>
                <span className="text-lg font-extrabold text-amber-950">
                  {importCandidate.data.suppliers.length} <span className="text-xs font-semibold text-amber-700">vendor</span>
                </span>
              </div>

              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                <span className="text-[11px] font-bold text-indigo-800 block">Riwayat Transaksi</span>
                <span className="text-lg font-extrabold text-indigo-950">
                  {importCandidate.data.transactions.length} <span className="text-xs font-semibold text-indigo-700">invoice</span>
                </span>
              </div>
            </div>

            {/* Option to restore users if available */}
            {importCandidate.data.users && importCandidate.data.users.length > 0 && (
              <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={restoreUsersOption}
                  onChange={(e) => setRestoreUsersOption(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800">
                  Pulihkan juga akun pengguna &amp; PIN ({importCandidate.data.users.length} akun terdaftar di file)
                </span>
              </label>
            )}

            {/* Warning banner */}
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-start gap-2.5 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong className="font-bold">Peringatan:</strong> Proses pemulihan ini akan menimpa data produk, pelanggan, supplier, dan transaksi yang sedang aktif di aplikasi kasir ini dengan isi file cadangan.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setImportCandidate(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleConfirmRestore}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Ya, Terapkan &amp; Pulihkan Data</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
