import React, { useState, useEffect } from 'react';
import { 
  Store, 
  ShoppingCart, 
  Package, 
  Users, 
  Truck, 
  Receipt, 
  Settings, 
  CreditCard, 
  Lock, 
  Maximize2, 
  Minimize2, 
  Clock,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  Briefcase,
  UserCheck,
  BarChart3,
  TrendingUp,
  Bell,
  AlertTriangle,
  AlertCircle,
  ChevronRight,
  X,
  CloudOff,
  CalendarRange,
  Wrench,
  PackagePlus,
  CalendarDays,
  Wallet,
  Globe,
  Wifi,
  WifiOff,
  Loader2,
  Landmark,
  Scale,
  HardDrive,
  Database,
  FileSpreadsheet,
  History
} from 'lucide-react';
import { User, UserRole, StoreSettings, Product, Transaction, Customer } from '../types/pos';
import { sound } from '../utils/audio';
import { formatRupiah } from '../utils/formatters';
import { getUpcomingDuePiutangEntries } from './PiutangDueAlertBanner';
import { getDriveBackupSchedule, isDriveBackupOverdue } from '../utils/googleDriveBackup';

interface NavbarProps {
  currentUser: User;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSwitchUser: () => void;
  onOpenShiftSummary: () => void;
  storeSettings: StoreSettings;
  cartItemCount: number;
  lowStockCount?: number;
  pendingOnlineOrdersCount?: number;
  activeShiftCount?: number;
  isCurrentUserClockedIn?: boolean;
  products?: Product[];
  transactions?: Transaction[];
  customers?: Customer[];
  cloudSyncStatus?: 'SYNCED' | 'CONNECTING' | 'OFFLINE';
  cloudSyncError?: string | null;
  pendingSyncQueueCount?: number;
  offlineQueueCount?: number;
  syncConflictCount?: number;
  onRetryCloudSync?: () => void;
  onOpenFirestoreSettings?: () => void;
  onOpenOfflineQueue?: () => void;
  onOpenGoogleDriveBackup?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  onOpenSwitchUser,
  onOpenShiftSummary,
  storeSettings,
  cartItemCount,
  lowStockCount = 0,
  pendingOnlineOrdersCount = 0,
  activeShiftCount = 0,
  isCurrentUserClockedIn = false,
  products = [],
  transactions = [],
  customers = [],
  cloudSyncStatus = 'SYNCED',
  cloudSyncError = null,
  pendingSyncQueueCount = 0,
  offlineQueueCount = 0,
  syncConflictCount = 0,
  onRetryCloudSync: _onRetryCloudSync,
  onOpenFirestoreSettings,
  onOpenOfflineQueue,
  onOpenGoogleDriveBackup,
}) => {
  const [time, setTime] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState<boolean>(false);

  // Products approaching or below minimum threshold
  const lowStockAlertItems = React.useMemo(() => {
    return products.filter((p) => p.productType !== 'JASA' && p.stockInBaseUnit <= p.minStockAlert);
  }, [products]);

  // Products expiring within 30 days or already expired (excluding JASA)
  const expiringAlertItems = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    return products.filter((p) => {
      if (p.productType === 'JASA' || !p.expiryDate) return false;
      const exp = new Date(p.expiryDate);
      return exp <= in30Days;
    });
  }, [products]);

  const piutangAlertOverview = React.useMemo(
    () =>
      getUpcomingDuePiutangEntries({
        transactions,
        customers,
        storeName: storeSettings.storeName,
        bcaAccountNumber: storeSettings.bcaAccountNumber,
        bcaAccountName: storeSettings.bcaAccountName,
      }),
    [transactions, customers, storeSettings.storeName, storeSettings.bcaAccountNumber, storeSettings.bcaAccountName]
  );

  const urgentPiutangItems = React.useMemo(
    () => [...piutangAlertOverview.upcoming3Days, ...piutangAlertOverview.overdue],
    [piutangAlertOverview]
  );

  const totalAlertCount =
    lowStockAlertItems.length + expiringAlertItems.length + urgentPiutangItems.length;

  const serviceCount = React.useMemo(() => {
    return products.filter((p) => p.productType === 'JASA').length;
  }, [products]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    sound.playTap();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const roleBadge = () => {
    switch (currentUser.role) {
      case 'ADMIN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            ADMIN
          </span>
        );
      case 'STORE_MANAGER':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700">
            <Briefcase className="w-3.5 h-3.5" />
            STORE MANAGER
          </span>
        );
      case 'KARYAWAN':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-700">
            <UserCheck className="w-3.5 h-3.5" />
            KARYAWAN
          </span>
        );
    }
  };

  // RBAC Access Control for navigation items
  const canAccessManagement = currentUser.role === 'ADMIN' || currentUser.role === 'STORE_MANAGER';
  const canAccessSettings = currentUser.role === 'ADMIN';

  const effectiveLowStockCount = products.length > 0 ? lowStockAlertItems.length : lowStockCount;
  const hasCriticalZeroStock = React.useMemo(
    () => lowStockAlertItems.some((p) => p.stockInBaseUnit <= 0),
    [lowStockAlertItems]
  );

  const navItems: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string | number | null;
    lowStockBadge?: number | null;
    iconLowStockCount?: number | null;
    allowed: boolean;
  }> = [
    {
      id: 'pos',
      label: 'Kasir',
      icon: ShoppingCart,
      badge: cartItemCount > 0 ? cartItemCount : null,
      lowStockBadge: effectiveLowStockCount > 0 ? effectiveLowStockCount : null,
      allowed: true,
    },
    {
      id: 'online-orders',
      label: 'Toko Online',
      icon: Globe,
      badge: pendingOnlineOrdersCount > 0 ? pendingOnlineOrdersCount : null,
      allowed: true,
    },
    {
      id: 'products',
      label: 'Barang',
      icon: Package,
      iconLowStockCount: effectiveLowStockCount > 0 ? effectiveLowStockCount : null,
      allowed: canAccessManagement,
    },
    {
      id: 'services',
      label: 'Jasa',
      icon: Wrench,
      badge: serviceCount > 0 ? serviceCount : null,
      allowed: canAccessManagement,
    },
    {
      id: 'purchases',
      label: 'Pembelian',
      icon: PackagePlus,
      allowed: canAccessManagement,
    },
    {
      id: 'stock-report',
      label: 'Laporan Stok',
      icon: BarChart3,
      badge: effectiveLowStockCount > 0 ? `${effectiveLowStockCount} Menipis` : null,
      allowed: canAccessManagement,
    },
    {
      id: 'customers',
      label: 'Pelanggan',
      icon: Users,
      allowed: true,
    },
    {
      id: 'suppliers',
      label: 'Supplier',
      icon: Truck,
      allowed: canAccessManagement,
    },
    {
      id: 'piutang',
      label: 'Piutang',
      icon: CreditCard,
      badge:
        urgentPiutangItems.length > 0
          ? `${urgentPiutangItems.length} Tempo`
          : null,
      allowed: canAccessManagement,
    },
    {
      id: 'transactions',
      label: 'Riwayat',
      icon: Receipt,
      allowed: true,
    },
    {
      id: 'attendance',
      label: 'Absensi',
      icon: Clock,
      badge: activeShiftCount > 0 ? `${activeShiftCount} Aktif` : null,
      allowed: true,
    },
    {
      id: 'profit-loss',
      label: 'Laba Rugi',
      icon: TrendingUp,
      allowed: canAccessManagement,
    },
    {
      id: 'finance',
      label: 'Keuangan',
      icon: Wallet,
      allowed: canAccessManagement,
    },
    {
      id: 'balance-sheet',
      label: 'Neraca',
      icon: Scale,
      allowed: canAccessManagement,
    },
    {
      id: 'tax',
      label: 'Pajak',
      icon: Landmark,
      allowed: canAccessManagement,
    },
    {
      id: 'sales-dashboard',
      label: 'Dashboard Sales',
      icon: BarChart3,
      allowed: canAccessManagement,
    },
    {
      id: 'sales-report',
      label: 'Laporan Penjualan',
      icon: FileSpreadsheet,
      allowed: canAccessManagement,
    },
    {
      id: 'monthly-sales',
      label: 'Laporan Bulanan',
      icon: CalendarRange,
      allowed: canAccessManagement,
    },
    {
      id: 'employee-activity',
      label: 'Aktivitas Karyawan',
      icon: ShieldAlert,
      allowed: canAccessSettings,
    },
    {
      id: 'sync-health',
      label: 'Kesehatan Sync',
      icon: ShieldCheck,
      badge: syncConflictCount > 0 ? `${syncConflictCount} Konflik` : null,
      allowed: canAccessManagement,
    },
    {
      id: 'sync-logs',
      label: 'Log Sinkronisasi',
      icon: History,
      allowed: canAccessSettings,
    },
    {
      id: 'settings',
      label: 'Pengaturan',
      icon: Settings,
      allowed: canAccessSettings,
    },
  ];

  return (
    <header className="bg-slate-900 text-white select-none border-b border-slate-800 shrink-0 sticky top-0 z-30 shadow-md">
      <div className="flex flex-wrap lg:flex-nowrap portrait:flex-wrap items-center justify-between px-3 md:px-5 py-2 lg:py-0 lg:h-16 portrait:py-2 portrait:h-auto gap-x-2 gap-y-1.5">
        {/* Left: Brand & Store Name */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Store className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block max-w-[145px] xl:max-w-[210px]">
            <h1 className="text-sm md:text-base font-bold text-white tracking-tight leading-tight truncate">
              {storeSettings.storeName}
            </h1>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 font-medium whitespace-nowrap">
              <span>POS Tablet</span>
              <span>·</span>
              <span className="font-mono tabular-nums text-sky-400">{time}</span>
            </p>
          </div>
        </div>

        {/* Center / Portrait Row 2: Main Navigation Tabs (always visible & scrollable in portrait mode) */}
        <nav className="order-3 w-full lg:order-none lg:w-auto lg:flex-1 lg:min-w-0 portrait:order-3 portrait:w-full flex items-center gap-1 overflow-x-auto no-scrollbar py-1 border-t border-slate-800/80 pt-1.5 lg:border-t-0 lg:pt-1 portrait:border-t portrait:pt-1.5">
          {navItems.map((item) => {
            if (!item.allowed) return null;
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sound.playTap();
                  setActiveTab(item.id);
                }}
                title={
                  item.iconLowStockCount
                    ? `${item.iconLowStockCount} produk telah mencapai atau di bawah batas stok minimum`
                    : undefined
                }
                aria-label={
                  item.iconLowStockCount
                    ? `${item.label} (${item.iconLowStockCount} produk mencapai batas stok minimum)`
                    : item.label
                }
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs md:text-sm font-semibold transition-all whitespace-nowrap shrink-0 relative ${
                  isActive
                    ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30 font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span className="relative inline-flex items-center justify-center shrink-0">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  {item.iconLowStockCount && item.iconLowStockCount > 0 && (
                    <>
                      {hasCriticalZeroStock && (
                        <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full bg-rose-400 animate-ping opacity-75 pointer-events-none" />
                      )}
                      <span
                        data-testid="navbar-products-low-stock-badge"
                        className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-black font-mono leading-none flex items-center justify-center border-[1.5px] border-slate-900 shadow-sm tabular-nums"
                      >
                        {item.iconLowStockCount > 99 ? '99+' : item.iconLowStockCount}
                      </span>
                    </>
                  )}
                </span>
                <span>{item.label}</span>
                {item.badge && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-400 text-slate-900 ml-0.5 tabular-nums">
                    {item.badge}
                  </span>
                )}
                {item.lowStockBadge && (
                  <span
                    title={`${item.lowStockBadge} produk dengan stok di bawah/pada ambang batas minimum`}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white shadow-xs ml-0.5 tabular-nums"
                  >
                    <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                    <span>{item.lowStockBadge}</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Compact Icon-Only Status & Quick Actions, Notifications, Fullscreen, User Switcher */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Compact Icon-Only Firestore Connection Status Indicator */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              if (onOpenFirestoreSettings) {
                onOpenFirestoreSettings();
              } else {
                setActiveTab('settings');
              }
            }}
            title={
              storeSettings.manualOfflineMode
                ? 'Firestore: Mode Local Only (dijeda) — Klik untuk cek koneksi & aktifkan di Pengaturan'
                : cloudSyncStatus === 'SYNCED'
                ? 'Firestore: Terhubung Real-Time — Klik untuk buka diagnostik & log koneksi di Pengaturan'
                : cloudSyncStatus === 'CONNECTING'
                ? 'Firestore: Sedang menghubungkan ke server — Klik untuk buka pengecekan koneksi di Pengaturan'
                : `Firestore: Terputus${cloudSyncError ? ` (${cloudSyncError})` : ''} — Klik untuk cek koneksi & Force Sync Now di Pengaturan`
            }
            aria-label={
              storeSettings.manualOfflineMode
                ? 'Status Firestore: Mode Local Only — klik untuk menuju Pengaturan'
                : cloudSyncStatus === 'SYNCED'
                ? 'Status Firestore: Terhubung Real-Time — klik untuk menuju Pengaturan'
                : cloudSyncStatus === 'CONNECTING'
                ? 'Status Firestore: Sedang menyinkronkan — klik untuk menuju Pengaturan'
                : 'Status Firestore: Terputus — klik untuk menuju Pengaturan'
            }
            className={`relative flex items-center justify-center w-9 h-9 rounded-lg border transition-colors cursor-pointer ${
              storeSettings.manualOfflineMode
                ? 'bg-amber-950/90 border-amber-500/70 text-amber-300 hover:bg-amber-900/80'
                : cloudSyncStatus === 'SYNCED'
                ? 'bg-emerald-950/85 border-emerald-500/60 text-emerald-400 hover:bg-emerald-900/75'
                : cloudSyncStatus === 'CONNECTING'
                ? 'bg-sky-950/85 border-sky-500/60 text-sky-400 hover:bg-sky-900/75'
                : 'bg-rose-950/95 border-rose-500/80 text-rose-400 hover:bg-rose-900/85'
            }`}
          >
            {storeSettings.manualOfflineMode ? (
              <CloudOff className="w-4 h-4 shrink-0" />
            ) : cloudSyncStatus === 'SYNCED' ? (
              <Wifi className="w-4 h-4 shrink-0" />
            ) : cloudSyncStatus === 'CONNECTING' ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <WifiOff className="w-4 h-4 shrink-0" />
            )}

            {pendingSyncQueueCount > 0 && (
              <span
                title={`${pendingSyncQueueCount} perubahan menunggu antrean sinkronisasi`}
                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-400 text-slate-950 text-[9px] font-black leading-none flex items-center justify-center border border-slate-900 tabular-nums"
              >
                {pendingSyncQueueCount > 9 ? '9+' : pendingSyncQueueCount}
              </span>
            )}
          </button>

          {/* Offline Queue Quick Inspector Button when pending offline mutations exist */}
          {offlineQueueCount > 0 && onOpenOfflineQueue && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onOpenOfflineQueue();
              }}
              title={`${offlineQueueCount} data Mode Offline menunggu sinkronisasi ke server — Klik untuk kelola`}
              className="hidden sm:inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-amber-500/70 bg-amber-950/90 hover:bg-amber-900 text-amber-200 text-[11px] font-extrabold cursor-pointer transition-colors tabular-nums"
            >
              <Database className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span>Antrean ({offlineQueueCount})</span>
            </button>
          )}

          {/* Google Drive Store Backup Quick Access (Admin & Store Manager) */}
          {canAccessManagement && onOpenGoogleDriveBackup && (() => {
            const driveOverdue = isDriveBackupOverdue(getDriveBackupSchedule());
            return (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  onOpenGoogleDriveBackup();
                }}
                title={
                  driveOverdue
                    ? 'Backup Data Toko ke Google Drive (Disarankan cadangkan sekarang)'
                    : 'Backup Data Toko ke Google Drive'
                }
                aria-label="Backup Google Drive"
                className="relative flex items-center justify-center w-9 h-9 rounded-lg border bg-slate-800 hover:bg-slate-700 text-sky-300 border-slate-700 transition-colors cursor-pointer"
              >
                <HardDrive className="w-4 h-4 shrink-0" />
                {driveOverdue && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border border-slate-900" />
                )}
              </button>
            );
          })()}

          {/* Compact Icon-Only Attendance Quick Action */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setActiveTab('attendance');
            }}
            title={
              isCurrentUserClockedIn
                ? 'Absensi: Shift aktif — Klik untuk buka terminal absensi'
                : 'Absensi Karyawan — Klik untuk buka terminal absensi'
            }
            aria-label={isCurrentUserClockedIn ? 'Absensi (Shift Aktif)' : 'Buka Absensi Karyawan'}
            className={`relative flex items-center justify-center w-9 h-9 rounded-lg border transition-colors cursor-pointer ${
              activeTab === 'attendance'
                ? 'bg-sky-600 border-sky-400 text-white'
                : isCurrentUserClockedIn
                ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-400 hover:bg-emerald-900/80'
                : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
            }`}
          >
            <UserCheck className="w-4 h-4 shrink-0" />
          </button>

          {/* Compact Icon-Only Shift Summary Action */}
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              onOpenShiftSummary();
            }}
            title="Ringkasan Kas / Shift"
            aria-label="Ringkasan Kas / Shift"
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700 transition-colors cursor-pointer"
          >
            <Clock className="w-4 h-4 shrink-0" />
          </button>

          {/* Notification Center Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setIsNotificationOpen(!isNotificationOpen);
              }}
              title="Pusat Peringatan Stok & Kadaluarsa"
              aria-label="Pusat Peringatan Stok & Kadaluarsa"
              className={`w-9 h-9 rounded-lg border transition-colors relative cursor-pointer flex items-center justify-center ${
                totalAlertCount > 0
                  ? 'bg-amber-950/70 border-amber-500/70 text-amber-300 hover:bg-amber-900/90'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Bell className="w-4 h-4" />
              {totalAlertCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center border border-slate-900 tabular-nums">
                  {totalAlertCount > 9 ? '9+' : totalAlertCount}
                </span>
              )}
            </button>

            {/* Notification Center Dropdown Popover */}
            {isNotificationOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40 bg-black/20"
                  onClick={() => setIsNotificationOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                  <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold leading-tight">Pusat Notifikasi Toko</h4>
                        <p className="text-[10px] text-slate-400">
                          {urgentPiutangItems.length} piutang tempo · {lowStockAlertItems.length} stok kritis · {expiringAlertItems.length} expired
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsNotificationOpen(false)}
                      className="p-1 rounded-md text-slate-400 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 p-1">
                    {/* Urgent Piutang due in <= 3 days / overdue */}
                    {urgentPiutangItems.length > 0 && (
                      <div className="p-2 bg-amber-50/70 rounded-xl mb-1">
                        <div className="text-[11px] font-bold text-amber-900 flex items-center justify-between gap-1.5 mb-1.5">
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                            <span>Piutang Jatuh Tempo ({urgentPiutangItems.length})</span>
                          </span>
                          {canAccessManagement && (
                            <button
                              type="button"
                              onClick={() => {
                                sound.playTap();
                                setIsNotificationOpen(false);
                                setActiveTab('sales-dashboard');
                              }}
                              className="text-[10px] font-bold text-sky-700 hover:underline cursor-pointer"
                            >
                              Buka Dashboard
                            </button>
                          )}
                        </div>
                        <div className="space-y-1">
                          {urgentPiutangItems.slice(0, 5).map((entry) => (
                            <div
                              key={`piutang-${entry.transaction.id}`}
                              className="p-2 bg-white rounded-lg border border-amber-200 flex items-center justify-between gap-2 shadow-2xs"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-900 truncate">
                                  {entry.customerName}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono">
                                  {entry.urgencyLabel} · {formatRupiah(entry.transaction.finalAmount)}
                                </p>
                              </div>
                              <a
                                href={entry.waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={() => sound.playTap()}
                                className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[9.5px] font-bold whitespace-nowrap shrink-0"
                              >
                                Kirim WA
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Expiring section if any */}
                    {expiringAlertItems.length > 0 && (
                      <div className="p-2 bg-rose-50/60 rounded-xl mb-1">
                        <div className="text-[11px] font-bold text-rose-800 flex items-center gap-1.5 mb-1.5">
                          <CalendarDays className="w-3.5 h-3.5 text-rose-600" />
                          <span>Peringatan Kadaluarsa ({expiringAlertItems.length})</span>
                        </div>
                        <div className="space-y-1">
                          {expiringAlertItems.map((prod) => {
                            const expDate = new Date(prod.expiryDate!);
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const isExpired = expDate < today;
                            const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                            return (
                              <div key={`exp-${prod.id}`} className="p-2 bg-white rounded-lg border border-rose-100 flex items-center justify-between gap-2 shadow-2xs">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-bold text-slate-900 truncate">{prod.name}</p>
                                  <p className="text-[10px] text-slate-500 font-mono">
                                    Exp: {prod.expiryDate} {isExpired ? '(LEWAT)' : `(sisa ${diffDays} hari)`}
                                  </p>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black shrink-0 ${
                                  isExpired ? 'bg-rose-600 text-white' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {isExpired ? 'KADALUARSA' : `${diffDays} HARI`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Low stock section */}
                    {lowStockAlertItems.length > 0 && (
                      <div className="p-2">
                        <div className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 mb-1.5 px-1">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Stok Menipis / Habis ({lowStockAlertItems.length})</span>
                        </div>
                        <div className="space-y-1">
                          {lowStockAlertItems.map((prod) => {
                            const isZero = prod.stockInBaseUnit <= 0;
                            return (
                              <div
                                key={prod.id}
                                className="p-2 hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-between gap-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isZero ? 'bg-rose-500 animate-ping' : 'bg-amber-500 animate-pulse'}`} />
                                    <span className="font-bold text-xs text-slate-900 truncate">
                                      {prod.name}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1.5 font-mono">
                                    <span>{prod.category}</span>
                                    <span>·</span>
                                    <span className={isZero ? 'text-rose-600 font-bold' : 'text-amber-700 font-bold'}>
                                      Sisa: {prod.stockInBaseUnit} / Min: {prod.minStockAlert} {prod.baseUnit}
                                    </span>
                                  </div>
                                </div>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black shrink-0 ${
                                  isZero ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                                }`}>
                                  {isZero ? 'HABIS' : 'MENIPIS'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {totalAlertCount === 0 && (
                      <div className="p-6 text-center text-slate-500">
                        <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-1.5" />
                        <p className="text-xs font-bold text-slate-800">Semua Stok Aman & Terkendali</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Tidak ada stok kritis atau mendekati kadaluarsa.</p>
                      </div>
                    )}
                  </div>

                  {totalAlertCount > 0 && (
                    <div className="p-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                      <button
                        onClick={() => {
                          sound.playTap();
                          setIsNotificationOpen(false);
                          setActiveTab('stock-report');
                        }}
                        className="w-full py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                      >
                        <span>Buka Laporan Stok & Kadaluarsa</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Layar Penuh Tablet"
            aria-label="Layar Penuh Tablet"
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Active User Card & Switch Button */}
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-800">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onOpenSwitchUser();
              }}
              className="flex items-center gap-2 px-2 py-1 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 transition-all text-left cursor-pointer"
              title="Klik untuk Ganti Pengguna / Lock Screen"
              aria-label={`Pengguna aktif ${currentUser.name} — Klik untuk ganti pengguna`}
            >
              <div className={`w-7 h-7 rounded-lg ${currentUser.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                {currentUser.name.charAt(0)}
              </div>
              <div className="hidden lg:block portrait:hidden text-left">
                <div className="text-xs font-semibold text-white truncate max-w-[100px]">
                  {currentUser.name.split(' ')[0]}
                </div>
                <div className="text-[10px] text-slate-400">{roleBadge()}</div>
              </div>
              <Lock className="w-3.5 h-3.5 text-slate-400 hover:text-sky-400 ml-0.5 shrink-0" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
