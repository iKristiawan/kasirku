import React, { useMemo, useState } from 'react';
import {
  Boxes,
  Calendar,
  Download,
  Edit3,
  History,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  EmployeeActivityLog,
  EmployeeActivityType,
  User,
  UserRole,
} from '../types/pos';
import { formatDateTime, formatNumber, formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';

interface EmployeeActivityViewProps {
  activityLogs: EmployeeActivityLog[];
  users: User[];
  currentUser: User;
  storeName: string;
  onNavigateToPOS?: () => void;
}

type DatePresetKey = 'ALL' | 'TODAY' | 'LAST_7' | 'LAST_30' | 'THIS_MONTH' | 'CUSTOM';

const toLocalYmd = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getRoleLabel = (role: UserRole): string => {
  if (role === 'STORE_MANAGER') return 'Store Manager';
  if (role === 'KARYAWAN') return 'Karyawan / Kasir';
  return 'Admin';
};

const getResponsibleUser = (log: EmployeeActivityLog): { name: string; role: UserRole } => {
  const metaName =
    typeof log.metadata?.responsibleUserName === 'string' &&
    log.metadata.responsibleUserName.trim()
      ? log.metadata.responsibleUserName.trim()
      : log.actorName;
  const rawRole = log.metadata?.responsibleUserRole;
  const metaRole: UserRole =
    rawRole === 'ADMIN' || rawRole === 'STORE_MANAGER' || rawRole === 'KARYAWAN'
      ? rawRole
      : log.actorRole;
  return { name: metaName, role: metaRole };
};

const getDeletionNote = (log: EmployeeActivityLog): string => {
  if (typeof log.metadata?.deletionNote === 'string' && log.metadata.deletionNote.trim()) {
    return log.metadata.deletionNote.trim();
  }
  if (log.actionType === 'DELETE_TRANSACTION') {
    return (log.reason || 'Penghapusan transaksi kasir').trim();
  }
  if (log.metadata?.opnameEvent === 'DELETE_OPNAME') {
    return (log.reason || 'Penghapusan sesi Stock Opname').trim();
  }
  return '';
};

const getActionMeta = (log: EmployeeActivityLog) => {
  if (log.metadata?.opnameEvent === 'DELETE_OPNAME') {
    return {
      label: 'Hapus Sesi Opname',
      textClass: 'text-rose-700',
      surfaceClass: 'bg-rose-50 border-rose-200 text-rose-700',
      icon: <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
    };
  }

  switch (log.actionType) {
    case 'DELETE_TRANSACTION':
      return {
        label: 'Hapus Transaksi',
        textClass: 'text-rose-700',
        surfaceClass: 'bg-rose-50 border-rose-200 text-rose-700',
        icon: <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
      };
    case 'MANUAL_PRICE_EDIT':
      if (log.metadata?.stage === 'CATALOG_PRICE_UPDATE') {
        return {
          label: 'Ubah Harga Katalog',
          textClass: 'text-sky-700',
          surfaceClass: 'bg-sky-50 border-sky-200 text-sky-800',
          icon: <Tag className="w-3.5 h-3.5 text-sky-600 shrink-0" />,
        };
      }
      return {
        label: 'Override Harga Manual',
        textClass: 'text-amber-700',
        surfaceClass: 'bg-amber-50 border-amber-200 text-amber-800',
        icon: <Tag className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
      };
    case 'MANUAL_STOCK_ADJUSTMENT':
      return {
        label: log.targetType === 'STOCK_OPNAME' ? 'Stock Opname' : 'Penyesuaian Stok',
        textClass: 'text-sky-700',
        surfaceClass: 'bg-sky-50 border-sky-200 text-sky-800',
        icon: <Boxes className="w-3.5 h-3.5 text-sky-600 shrink-0" />,
      };
    case 'EDIT_TRANSACTION':
      return {
        label: 'Edit Invoice',
        textClass: 'text-indigo-700',
        surfaceClass: 'bg-indigo-50 border-indigo-200 text-indigo-800',
        icon: <Edit3 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />,
      };
    case 'ITEM_RETURN':
      return {
        label: 'Retur Barang & Poin',
        textClass: 'text-amber-700',
        surfaceClass: 'bg-amber-50 border-amber-200 text-amber-800',
        icon: <RotateCcw className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
      };
  }
};

export const EmployeeActivityView: React.FC<EmployeeActivityViewProps> = ({
  activityLogs,
  users,
  currentUser,
  storeName,
  onNavigateToPOS,
}) => {
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<DatePresetKey>('ALL');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<'ALL' | EmployeeActivityType>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'STAFF_ONLY' | UserRole>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Admin Access Guard
  if (currentUser.role !== 'ADMIN') {
    return (
      <div className="flex-1 p-4 md:p-8 bg-slate-100 overflow-y-auto flex items-center justify-center">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6 text-rose-600" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Akses Khusus Admin</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Halaman pengawasan <strong>Aktivitas Karyawan</strong> hanya dapat dibuka oleh akun dengan hak akses{' '}
            <strong>Admin</strong>. Akun aktif saat ini: {currentUser.name} ({getRoleLabel(currentUser.role)}).
          </p>
          {onNavigateToPOS && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToPOS();
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kembali ke Kasir
            </button>
          )}
        </div>
      </div>
    );
  }

  const applyDatePreset = (preset: DatePresetKey) => {
    sound.playTap();
    setDatePreset(preset);
    const now = new Date();

    if (preset === 'ALL') {
      setStartDate('');
      setEndDate('');
      return;
    }

    if (preset === 'TODAY') {
      const today = toLocalYmd(now);
      setStartDate(today);
      setEndDate(today);
      return;
    }

    if (preset === 'LAST_7') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      setStartDate(toLocalYmd(start));
      setEndDate(toLocalYmd(now));
      return;
    }

    if (preset === 'LAST_30') {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      setStartDate(toLocalYmd(start));
      setEndDate(toLocalYmd(now));
      return;
    }

    if (preset === 'THIS_MONTH') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(toLocalYmd(firstDay));
      setEndDate(toLocalYmd(now));
    }
  };

  const handleResetFilters = () => {
    sound.playTap();
    setSelectedEmployeeKey('ALL');
    setDatePreset('ALL');
    setStartDate('');
    setEndDate('');
    setActionFilter('ALL');
    setRoleFilter('ALL');
    setSearchQuery('');
  };

  // Unified employee selector options (registered users + historical log actors)
  const employeeOptions = useMemo(() => {
    const map = new Map<
      string,
      { key: string; name: string; role: UserRole; userIds: Set<string>; logCount: number }
    >();

    const roleOrder: Record<UserRole, number> = {
      KARYAWAN: 0,
      STORE_MANAGER: 1,
      ADMIN: 2,
    };

    users.forEach((u) => {
      const normalized = u.name.trim().toLowerCase();
      if (!normalized) return;
      const existing = map.get(normalized);
      if (existing) {
        existing.userIds.add(u.id);
      } else {
        map.set(normalized, {
          key: normalized,
          name: u.name.trim(),
          role: u.role,
          userIds: new Set([u.id]),
          logCount: 0,
        });
      }
    });

    activityLogs.forEach((log) => {
      const normalizedActor = log.actorName.trim().toLowerCase();
      if (normalizedActor) {
        const existing = map.get(normalizedActor);
        if (existing) {
          existing.logCount += 1;
          if (log.actorId) existing.userIds.add(log.actorId);
        } else {
          map.set(normalizedActor, {
            key: normalizedActor,
            name: log.actorName.trim(),
            role: log.actorRole,
            userIds: new Set(log.actorId ? [log.actorId] : []),
            logCount: 1,
          });
        }
      }

      const resp = getResponsibleUser(log);
      const normalizedResp = resp.name.trim().toLowerCase();
      if (normalizedResp && normalizedResp !== normalizedActor) {
        const existingResp = map.get(normalizedResp);
        if (existingResp) {
          existingResp.logCount += 1;
        } else {
          map.set(normalizedResp, {
            key: normalizedResp,
            name: resp.name.trim(),
            role: resp.role,
            userIds: new Set(),
            logCount: 1,
          });
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const roleDiff = (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9);
      if (roleDiff !== 0) return roleDiff;
      return a.name.localeCompare(b.name, 'id-ID');
    });
  }, [users, activityLogs]);

  // Date-scoped logs (used for both per-employee leaderboard and detailed table filtering)
  const dateAndRoleScopedLogs = useMemo(() => {
    const startTs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const endTs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;

    return activityLogs
      .filter((log) => {
        if (startTs !== null && log.timestamp < startTs) return false;
        if (endTs !== null && log.timestamp > endTs) return false;

        if (roleFilter === 'STAFF_ONLY') {
          if (log.actorRole !== 'KARYAWAN' && log.actorRole !== 'STORE_MANAGER') return false;
        } else if (roleFilter !== 'ALL' && log.actorRole !== roleFilter) {
          return false;
        }

        if (actionFilter !== 'ALL' && log.actionType !== actionFilter) return false;
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [activityLogs, startDate, endDate, roleFilter, actionFilter]);

  // Per-employee summary breakdown across the active date/action/role window
  const perEmployeeBreakdown = useMemo(() => {
    const statsMap = new Map<
      string,
      {
        key: string;
        name: string;
        role: UserRole;
        total: number;
        deleteTx: number;
        priceEdit: number;
        editOrReturnOrStock: number;
        latestTimestamp: number;
      }
    >();

    dateAndRoleScopedLogs.forEach((log) => {
      const key = log.actorName.trim().toLowerCase() || log.actorId;
      const existing = statsMap.get(key) || {
        key,
        name: log.actorName,
        role: log.actorRole,
        total: 0,
        deleteTx: 0,
        priceEdit: 0,
        editOrReturnOrStock: 0,
        latestTimestamp: log.timestamp,
      };

      existing.total += 1;
      if (log.actionType === 'DELETE_TRANSACTION') {
        existing.deleteTx += 1;
      } else if (log.actionType === 'MANUAL_PRICE_EDIT') {
        existing.priceEdit += 1;
      } else {
        existing.editOrReturnOrStock += 1;
      }
      if (log.timestamp > existing.latestTimestamp) {
        existing.latestTimestamp = log.timestamp;
      }

      statsMap.set(key, existing);
    });

    return Array.from(statsMap.values()).sort((a, b) => b.total - a.total || b.latestTimestamp - a.latestTimestamp);
  }, [dateAndRoleScopedLogs]);

  // Final filtered logs (employee + search applied on top of date/role/action filters)
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const selectedOpt =
      selectedEmployeeKey !== 'ALL'
        ? employeeOptions.find((e) => e.key === selectedEmployeeKey) || null
        : null;

    return dateAndRoleScopedLogs.filter((log) => {
      const respUser = getResponsibleUser(log);
      const delNote = getDeletionNote(log);

      if (selectedEmployeeKey !== 'ALL') {
        const actorNorm = log.actorName.trim().toLowerCase();
        const respNorm = respUser.name.trim().toLowerCase();
        const matchesId = selectedOpt ? selectedOpt.userIds.has(log.actorId) : false;
        const matchesName =
          actorNorm === selectedEmployeeKey || respNorm === selectedEmployeeKey;
        if (!matchesId && !matchesName) return false;
      }

      if (!q) return true;
      return (
        log.actorName.toLowerCase().includes(q) ||
        respUser.name.toLowerCase().includes(q) ||
        log.targetLabel.toLowerCase().includes(q) ||
        log.summary.toLowerCase().includes(q) ||
        (log.reason || '').toLowerCase().includes(q) ||
        delNote.toLowerCase().includes(q) ||
        (log.invoiceNumber || '').toLowerCase().includes(q)
      );
    });
  }, [dateAndRoleScopedLogs, selectedEmployeeKey, employeeOptions, searchQuery]);

  // Dynamic KPI summary computed from active filteredLogs
  const kpiSummary = useMemo(() => {
    let staffActions = 0;
    let adminActions = 0;
    let deleteTxCount = 0;
    let deletedTxAmount = 0;
    let priceEditCount = 0;
    let prePaymentPriceOverrideCount = 0;
    let otherSensitiveCount = 0;

    filteredLogs.forEach((log) => {
      if (log.actorRole === 'ADMIN') {
        adminActions += 1;
      } else {
        staffActions += 1;
      }

      if (log.actionType === 'DELETE_TRANSACTION') {
        deleteTxCount += 1;
        if (typeof log.numericDelta === 'number') {
          deletedTxAmount += Math.abs(log.numericDelta);
        }
      } else if (log.actionType === 'MANUAL_PRICE_EDIT') {
        priceEditCount += 1;
        if (log.metadata?.stage === 'PRE_PAYMENT') {
          prePaymentPriceOverrideCount += 1;
        }
      } else {
        otherSensitiveCount += 1;
      }
    });

    return {
      total: filteredLogs.length,
      staffActions,
      adminActions,
      deleteTxCount,
      deletedTxAmount,
      priceEditCount,
      prePaymentPriceOverrideCount,
      otherSensitiveCount,
    };
  }, [filteredLogs]);

  const hasActiveFilter =
    selectedEmployeeKey !== 'ALL' ||
    startDate !== '' ||
    endDate !== '' ||
    actionFilter !== 'ALL' ||
    roleFilter !== 'ALL' ||
    searchQuery.trim() !== '';

  const selectedEmployeeDisplayName = useMemo(() => {
    if (selectedEmployeeKey === 'ALL') return 'Semua Karyawan';
    return (
      employeeOptions.find((opt) => opt.key === selectedEmployeeKey)?.name ||
      selectedEmployeeKey
    );
  }, [selectedEmployeeKey, employeeOptions]);

  const handleExportCsv = () => {
    sound.playTap();
    const headers = [
      'Waktu',
      'Nama Karyawan / Pelaku',
      'Role Pelaku',
      'User Penanggung Jawab',
      'Kategori Tindakan',
      'Target / Objek',
      'Ringkasan',
      'Nilai Sebelumnya',
      'Nilai Baru',
      'Selisih',
      'Alasan / Keterangan',
    ];
    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;

    const rows = filteredLogs.map((log) => {
      const resp = getResponsibleUser(log);
      const delNote = getDeletionNote(log);
      const reasonCombined = delNote && log.reason && delNote !== log.reason
        ? `${delNote} | ${log.reason}`
        : delNote || log.reason || '-';
      return [
        formatDateTime(log.timestamp),
        log.actorName,
        getRoleLabel(log.actorRole),
        resp.name,
        getActionMeta(log).label,
        log.targetLabel,
        log.summary,
        log.oldValue || '-',
        log.newValue || '-',
        log.deltaValue || '-',
        reasonCombined,
      ];
    });

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => r.map(escapeCsv).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const empSlug =
      selectedEmployeeKey === 'ALL'
        ? 'semua-karyawan'
        : selectedEmployeeDisplayName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    a.download = `aktivitas-karyawan-${empSlug}-${toLocalYmd(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 p-3 md:p-6 bg-slate-100 overflow-y-auto select-none font-sans">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top Page Header */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span>{storeName}</span>
              <span aria-hidden="true">·</span>
              <span>Pengawasan Admin</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{formatNumber(activityLogs.length)} total log tersimpan</span>
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 mt-1 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              <span>Aktivitas Karyawan</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
              Audit trail tindakan sensitif kasir &amp; staf—termasuk penghapusan transaksi, ubah harga manual, edit invoice, retur barang, serta penyesuaian stok.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {hasActiveFilter && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset Filter</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredLogs.length === 0}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Ekspor CSV ({formatNumber(filteredLogs.length)})</span>
            </button>
          </div>
        </div>

        {/* Filter Controls Card: Employee Name + Date Range + Action Type + Search */}
        <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 space-y-4">
          {/* Row 1: Primary Filters (Nama Karyawan + Rentang Tanggal) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            {/* Employee Name Selector */}
            <div className="md:col-span-4">
              <label
                htmlFor="filter-employee-name"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Nama Karyawan
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  id="filter-employee-name"
                  value={selectedEmployeeKey}
                  onChange={(e) => {
                    sound.playTap();
                    setSelectedEmployeeKey(e.target.value);
                  }}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="ALL">Semua Karyawan ({employeeOptions.length} akun)</option>
                  {employeeOptions.map((emp) => (
                    <option key={emp.key} value={emp.key}>
                      {emp.name} — {getRoleLabel(emp.role)}
                      {emp.logCount > 0 ? ` (${emp.logCount} log)` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Start Date */}
            <div className="md:col-span-2">
              <label
                htmlFor="filter-start-date"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Dari Tanggal
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="filter-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="w-full pl-8 pr-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500 tabular-nums"
                />
              </div>
            </div>

            {/* End Date */}
            <div className="md:col-span-2">
              <label
                htmlFor="filter-end-date"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Sampai Tanggal
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="filter-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset('CUSTOM');
                  }}
                  className="w-full pl-8 pr-2.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-sky-500 tabular-nums"
                />
              </div>
            </div>

            {/* Action Type Filter */}
            <div className="md:col-span-4">
              <label
                htmlFor="filter-action-type"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Jenis Tindakan Sensitif
              </label>
              <select
                id="filter-action-type"
                value={actionFilter}
                onChange={(e) => {
                  sound.playTap();
                  setActionFilter(e.target.value as 'ALL' | EmployeeActivityType);
                }}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:outline-none focus:border-sky-500 cursor-pointer"
              >
                <option value="ALL">Semua Tindakan Sensitif</option>
                <option value="DELETE_TRANSACTION">Hapus Transaksi</option>
                <option value="MANUAL_PRICE_EDIT">Ubah Harga / Override Manual</option>
                <option value="EDIT_TRANSACTION">Edit Invoice / Transaksi</option>
                <option value="ITEM_RETURN">Retur Barang &amp; Poin</option>
                <option value="MANUAL_STOCK_ADJUSTMENT">Stock Opname / Koreksi Stok</option>
              </select>
            </div>
          </div>

          {/* Row 2: Quick Date Presets, Role Segmented Control, Search */}
          <div className="pt-3 border-t border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 mr-1">Periode:</span>
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
                {(
                  [
                    { key: 'ALL', label: 'Semua Waktu' },
                    { key: 'TODAY', label: 'Hari Ini' },
                    { key: 'LAST_7', label: '7 Hari Terakhir' },
                    { key: 'LAST_30', label: '30 Hari Terakhir' },
                    { key: 'THIS_MONTH', label: 'Bulan Ini' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyDatePreset(preset.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      datePreset === preset.key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1 lg:max-w-xl justify-end">
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto shrink-0">
                {(
                  [
                    { id: 'ALL', label: 'Semua Role' },
                    { id: 'STAFF_ONLY', label: 'Kasir & Manager' },
                    { id: 'KARYAWAN', label: 'Karyawan' },
                    { id: 'ADMIN', label: 'Admin' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      sound.playTap();
                      setRoleFilter(item.id);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      roleFilter === item.id
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nomor nota, produk, atau alasan..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Hapus pencarian"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Summary KPI Strip (Single-level border cards, tabular-nums) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-slate-500">Total Tindakan Terfilter</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
              {formatNumber(kpiSummary.total)}
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {formatNumber(kpiSummary.staffActions)} staf · {formatNumber(kpiSummary.adminActions)} admin
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-rose-700">Hapus Transaksi</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-rose-700 mt-1">
              {formatNumber(kpiSummary.deleteTxCount)} Nota
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              Nilai dihapus: {formatRupiah(kpiSummary.deletedTxAmount)}
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-amber-700">Ubah Harga / Override</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">
              {formatNumber(kpiSummary.priceEditCount)} Kali
            </div>
            <div className="text-xs text-slate-500 mt-1 tabular-nums">
              {formatNumber(kpiSummary.prePaymentPriceOverrideCount)} override kasir pra-bayar
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200">
            <div className="text-xs font-semibold text-sky-700">Edit Nota, Retur &amp; Stok</div>
            <div className="text-2xl font-bold font-mono tabular-nums text-sky-700 mt-1">
              {formatNumber(kpiSummary.otherSensitiveCount)} Aksi
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Subjek: {selectedEmployeeDisplayName}
            </div>
          </div>
        </div>

        {/* Per-Employee Summary Table (within active date/role/action window) */}
        {perEmployeeBreakdown.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Ringkasan Aktivitas per Karyawan
                </h3>
                <p className="text-xs text-slate-500">
                  Klik nama karyawan untuk memfilter log di bawah secara langsung.
                </p>
              </div>
              {selectedEmployeeKey !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playTap();
                    setSelectedEmployeeKey('ALL');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Tampilkan Semua Karyawan
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-4">Karyawan</th>
                    <th className="py-2.5 px-4">Jabatan</th>
                    <th className="py-2.5 px-4 text-right">Hapus Transaksi</th>
                    <th className="py-2.5 px-4 text-right">Ubah Harga</th>
                    <th className="py-2.5 px-4 text-right">Edit / Retur / Stok</th>
                    <th className="py-2.5 px-4 text-right">Total Tindakan</th>
                    <th className="py-2.5 px-4 text-right">Aktivitas Terakhir</th>
                    <th className="py-2.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {perEmployeeBreakdown.map((emp) => {
                    const isSelected = selectedEmployeeKey === emp.key;
                    return (
                      <tr
                        key={emp.key}
                        className={`transition-colors ${
                          isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-bold text-slate-900 whitespace-nowrap">
                          {emp.name}
                        </td>
                        <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                          {getRoleLabel(emp.role)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-rose-700">
                          {formatNumber(emp.deleteTx)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-amber-700">
                          {formatNumber(emp.priceEdit)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-sky-700">
                          {formatNumber(emp.editOrReturnOrStock)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                          {formatNumber(emp.total)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-500 whitespace-nowrap">
                          {formatDateTime(emp.latestTimestamp)}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              sound.playTap();
                              setSelectedEmployeeKey(isSelected ? 'ALL' : emp.key);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isSelected ? 'Dipilih' : 'Filter Log'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Chronological Sensitive Audit Log Table */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Daftar Log Tindakan Sensitif
              </h3>
              <p className="text-xs text-slate-500 tabular-nums">
                Menampilkan {formatNumber(filteredLogs.length)} dari {formatNumber(activityLogs.length)} catatan aktivitas
                {startDate || endDate
                  ? ` · Periode ${startDate || 'awal'} s/d ${endDate || 'sekarang'}`
                  : ''}
                {selectedEmployeeKey !== 'ALL' ? ` · Karyawan: ${selectedEmployeeDisplayName}` : ''}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Karyawan / Pelaku</th>
                  <th className="py-3 px-4">Kategori Tindakan</th>
                  <th className="py-3 px-4">Objek &amp; Rincian</th>
                  <th className="py-3 px-4">Perubahan &amp; Selisih</th>
                  <th className="py-3 px-4">Alasan / Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 px-4 text-center text-slate-500">
                      {activityLogs.length === 0 ? (
                        <div className="max-w-md mx-auto space-y-2">
                          <ShieldCheck className="w-9 h-9 mx-auto text-slate-300 stroke-1" />
                          <p className="font-semibold text-slate-700 text-sm">
                            Belum Ada Log Tindakan Sensitif
                          </p>
                          <p className="text-xs text-slate-500">
                            Penghapusan transaksi, perubahan harga manual di kasir maupun katalog, edit invoice, retur barang, dan koreksi stok akan terekam otomatis di halaman ini.
                          </p>
                        </div>
                      ) : (
                        <div className="max-w-md mx-auto space-y-2.5">
                          <History className="w-9 h-9 mx-auto text-slate-300 stroke-1" />
                          <p className="font-semibold text-slate-700 text-sm">
                            Tidak Ada Log yang Cocok dengan Filter
                          </p>
                          <p className="text-xs text-slate-500">
                            Coba ubah rentang tanggal, pilih karyawan lain, atau reset filter untuk melihat seluruh riwayat.
                          </p>
                          <button
                            type="button"
                            onClick={handleResetFilters}
                            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            Reset Semua Filter
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const meta = getActionMeta(log);
                    const respUser = getResponsibleUser(log);
                    const deletionNote = getDeletionNote(log);
                    const hasDifferentResponsibleUser =
                      respUser.name.trim().toLowerCase() !== log.actorName.trim().toLowerCase();

                    return (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors align-top">
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600 whitespace-nowrap">
                          {formatDateTime(log.timestamp)}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-900">{log.actorName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {getRoleLabel(log.actorRole)}
                            {hasDifferentResponsibleUser && (
                              <>
                                {' '}
                                <span aria-hidden="true">·</span> PJ: {respUser.name}
                              </>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${meta.surfaceClass}`}
                          >
                            {meta.icon}
                            <span>{meta.label}</span>
                          </span>
                        </td>

                        <td className="py-3 px-4 max-w-md">
                          <div className="font-semibold text-slate-900">{log.targetLabel}</div>
                          <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                            {log.summary}
                          </div>
                          {log.metadata?.stage === 'PRE_PAYMENT' && (
                            <div className="text-xs text-amber-700 font-medium mt-1 tabular-nums">
                              Tahap: Kasir Pra-Pembayaran
                              {typeof log.metadata.discountPercentFromCatalog === 'number' &&
                                log.metadata.discountPercentFromCatalog > 0 && (
                                  <>
                                    {' '}
                                    <span aria-hidden="true">·</span> Diskon Manual{' '}
                                    {log.metadata.discountPercentFromCatalog}%
                                  </>
                                )}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono tabular-nums text-xs whitespace-nowrap">
                          {log.oldValue || log.newValue ? (
                            <div className="space-y-0.5">
                              <div className="text-slate-700">
                                <span className="line-through text-slate-400">
                                  {log.oldValue || '-'}
                                </span>{' '}
                                <span className="text-slate-400">→</span>{' '}
                                <strong className="text-slate-900">{log.newValue || '-'}</strong>
                              </div>
                              {log.deltaValue && (
                                <div
                                  className={`font-semibold ${
                                    (log.numericDelta || 0) < 0
                                      ? 'text-rose-700'
                                      : 'text-emerald-700'
                                  }`}
                                >
                                  Selisih: {log.deltaValue}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-xs max-w-xs">
                          {deletionNote ? (
                            <div className="text-rose-800 font-medium leading-relaxed">
                              {deletionNote}
                              {log.reason && log.reason !== deletionNote ? ` (${log.reason})` : ''}
                            </div>
                          ) : log.reason ? (
                            <span className="text-slate-600 leading-relaxed">{log.reason}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
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
    </div>
  );
};
