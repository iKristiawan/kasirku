import React, { useMemo, useState } from 'react';
import {
  Boxes,
  Calendar,
  Download,
  Edit3,
  History,
  Search,
  ShieldAlert,
  Tag,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { EmployeeActivityLog, EmployeeActivityType, UserRole } from '../types/pos';
import { formatDateTime, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';

interface EmployeeActivityAuditPanelProps {
  logs: EmployeeActivityLog[];
  initialScope?: 'ALL' | 'STOCK_OPNAME';
}

export const EmployeeActivityAuditPanel: React.FC<EmployeeActivityAuditPanelProps> = ({
  logs,
  initialScope = 'ALL',
}) => {
  const [logScope, setLogScope] = useState<'ALL' | 'STOCK_OPNAME'>(initialScope);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'STAFF_ONLY' | UserRole>('ALL');
  const [actionFilter, setActionFilter] = useState<'ALL' | EmployeeActivityType>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  React.useEffect(() => {
    setLogScope(initialScope);
  }, [initialScope]);

  const isStockOpnameLog = (log: EmployeeActivityLog) =>
    log.targetType === 'STOCK_OPNAME' ||
    log.actionType === 'MANUAL_STOCK_ADJUSTMENT' ||
    log.metadata?.opnameEvent === 'DELETE_OPNAME';

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

  const summary = useMemo(() => {
    const staffLogs = logs.filter(
      (l) => l.actorRole === 'KARYAWAN' || l.actorRole === 'STORE_MANAGER'
    );
    const opnameLogs = logs.filter(isStockOpnameLog);
    const opnameDeletions = opnameLogs.filter((l) => l.metadata?.opnameEvent === 'DELETE_OPNAME');
    return {
      totalAll: logs.length,
      totalStaff: staffLogs.length,
      deleteTxCount: logs.filter((l) => l.actionType === 'DELETE_TRANSACTION').length,
      manualPriceCount: logs.filter((l) => l.actionType === 'MANUAL_PRICE_EDIT').length,
      manualStockCount: logs.filter((l) => l.actionType === 'MANUAL_STOCK_ADJUSTMENT').length,
      opnameLogsCount: opnameLogs.length,
      opnameDeletionCount: opnameDeletions.length,
      editTxCount: logs.filter((l) => l.actionType === 'EDIT_TRANSACTION').length,
    };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const startTs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : null;
    const endTs = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : null;

    return logs.filter((log) => {
      if (logScope === 'STOCK_OPNAME' && !isStockOpnameLog(log)) return false;

      const respUser = getResponsibleUser(log);
      const delNote = getDeletionNote(log);

      if (roleFilter === 'STAFF_ONLY') {
        if (log.actorRole !== 'KARYAWAN' && log.actorRole !== 'STORE_MANAGER') return false;
      } else if (roleFilter !== 'ALL' && log.actorRole !== roleFilter) {
        return false;
      }

      if (actionFilter !== 'ALL' && log.actionType !== actionFilter) return false;
      if (startTs !== null && log.timestamp < startTs) return false;
      if (endTs !== null && log.timestamp > endTs) return false;

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
  }, [logs, logScope, search, roleFilter, actionFilter, startDate, endDate]);

  const getActionMeta = (log: EmployeeActivityLog) => {
    if (log.metadata?.opnameEvent === 'DELETE_OPNAME') {
      return {
        label: 'Hapus Sesi Stock Opname',
        badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
      };
    }

    switch (log.actionType) {
      case 'DELETE_TRANSACTION':
        return {
          label: 'Hapus Transaksi',
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
        };
      case 'MANUAL_PRICE_EDIT':
        if (log.metadata?.stage === 'CATALOG_PRICE_UPDATE') {
          return {
            label: 'Perubahan Harga Katalog',
            badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
            icon: <Tag className="w-3.5 h-3.5 text-sky-600 shrink-0" />,
          };
        }
        return {
          label: 'Manual Override / Edit Harga',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: <Tag className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
        };
      case 'MANUAL_STOCK_ADJUSTMENT':
        return {
          label: log.targetType === 'STOCK_OPNAME' ? 'Penyesuaian Stock Opname' : 'Penyesuaian Stok',
          badgeClass: 'bg-sky-50 text-sky-700 border-sky-200',
          icon: <Boxes className="w-3.5 h-3.5 text-sky-600 shrink-0" />,
        };
      case 'EDIT_TRANSACTION':
        return {
          label: 'Edit Invoice',
          badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: <Edit3 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />,
        };
      case 'ITEM_RETURN':
        return {
          label: 'Retur Barang & Poin',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
        };
    }
  };

  const getRoleLabel = (role: UserRole) => {
    if (role === 'STORE_MANAGER') return 'Store Manager';
    if (role === 'KARYAWAN') return 'Karyawan / Kasir';
    return 'Admin';
  };

  const getRoleBadgeClass = (role: UserRole) => {
    if (role === 'STORE_MANAGER') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (role === 'KARYAWAN') return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const handleExportAuditCsv = () => {
    sound.playTap();
    const headers = [
      'Waktu',
      'Nama Pelaku',
      'Role Pelaku',
      'User Penanggung Jawab',
      'Role Penanggung Jawab',
      'Jenis Tindakan',
      'Objek / Target',
      'Ringkasan',
      'Nilai Lama',
      'Nilai Baru',
      'Selisih',
      'Keterangan Penghapusan',
      'Alasan / Catatan',
    ];
    const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;

    const rows = filteredLogs.map((l) => {
      const resp = getResponsibleUser(l);
      const delNote = getDeletionNote(l);
      return [
        formatDateTime(l.timestamp),
        l.actorName,
        getRoleLabel(l.actorRole),
        resp.name,
        getRoleLabel(resp.role),
        getActionMeta(l).label,
        l.targetLabel,
        l.summary,
        l.oldValue || '-',
        l.newValue || '-',
        l.deltaValue || '-',
        delNote || '-',
        l.reason || '-',
      ];
    });

    const csv = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join(
      '\n'
    );
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${logScope === 'STOCK_OPNAME' ? 'stock-opname' : 'aktivitas-karyawan'}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* Header Card with Scope Switcher */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-4.5 h-4.5 text-rose-600" />
            <span>
              {logScope === 'STOCK_OPNAME'
                ? 'Log Aktivitas Stock Opname & Penyesuaian Stok'
                : 'Log Akuntabilitas & Aktivitas Karyawan'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {logScope === 'STOCK_OPNAME'
              ? 'Jejak audit transparan penyesuaian & penghapusan sesi Stock Opname beserta User Penanggung Jawab dan Keterangan Penghapusan.'
              : 'Catatan permanen seluruh tindakan sensitif — penghapusan transaksi, manual override harga, penyesuaian & penghapusan Stock Opname, serta edit invoice.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setLogScope('ALL');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                logScope === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua Log ({summary.totalAll})
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setLogScope('STOCK_OPNAME');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                logScope === 'STOCK_OPNAME'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Log Stock Opname ({summary.opnameLogsCount})
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportAuditCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Ekspor Log Audit (.CSV)</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Aksi Karyawan &amp; Manager
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 mt-1">
            {formatNumber(summary.totalStaff)} Aksi
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Total seluruh role: {formatNumber(summary.totalAll)} catatan
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-rose-200">
          <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider">
            Penghapusan Transaksi
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-rose-700 mt-1">
            {formatNumber(summary.deleteTxCount)} Nota
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
            Hapus sesi opname: {formatNumber(summary.opnameDeletionCount)} sesi
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200">
          <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
            Manual Override / Edit Harga
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-amber-700 mt-1">
            {formatNumber(summary.manualPriceCount)} Kali
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Diskon / ubah harga keranjang
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-sky-200">
          <div className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">
            Aktivitas Stock Opname &amp; Stok
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-sky-700 mt-1">
            {formatNumber(summary.opnameLogsCount)} Catatan
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Koreksi stok, opname &amp; penghapusan
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
          <div className="relative md:col-span-5">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari pelaku, penanggung jawab, produk, sesi opname, atau keterangan..."
              className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs md:text-sm text-slate-900 focus:outline-none focus:border-sky-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <select
              value={actionFilter}
              onChange={(e) => {
                sound.playTap();
                setActionFilter(e.target.value as any);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="ALL">Semua Tindakan Sensitif</option>
              <option value="ITEM_RETURN">Retur Barang &amp; Poin</option>
              <option value="MANUAL_STOCK_ADJUSTMENT">Stock Opname / Penyesuaian Stok</option>
              <option value="DELETE_TRANSACTION">Hapus Transaksi</option>
              <option value="MANUAL_PRICE_EDIT">Manual Override / Edit Harga</option>
              <option value="EDIT_TRANSACTION">Edit Invoice</option>
            </select>
          </div>

          <div className="md:col-span-4 flex items-center gap-1.5 flex-wrap">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Tanggal Mulai Audit"
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
            />
            <span className="text-xs text-slate-400">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Tanggal Akhir Audit"
              className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                title="Reset tanggal"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Role Filter Chips */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1 shrink-0">
              <UserCheck className="w-3.5 h-3.5" />
              Filter Role:
            </span>
            {[
              { id: 'ALL', label: `Semua Role (${logs.length})` },
              { id: 'STAFF_ONLY', label: `Karyawan & Manager (${summary.totalStaff})` },
              { id: 'KARYAWAN', label: 'Hanya Karyawan' },
              { id: 'STORE_MANAGER', label: 'Hanya Store Manager' },
              { id: 'ADMIN', label: 'Hanya Admin' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  sound.playTap();
                  setRoleFilter(item.id as any);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  roleFilter === item.id
                    ? item.id === 'STAFF_ONLY'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-500 tabular-nums">
            Menampilkan <strong className="text-slate-900">{filteredLogs.length}</strong> log
          </span>
        </div>
      </div>

      {/* Audit Trail Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs md:text-sm">
            <thead className="bg-slate-50 text-slate-600 uppercase text-[11px] font-bold border-b border-slate-200 tracking-wider">
              <tr>
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Pelaku &amp; Role</th>
                <th className="py-3 px-4">User Penanggung Jawab</th>
                <th className="py-3 px-4">Tindakan</th>
                <th className="py-3 px-4">Objek &amp; Rincian</th>
                <th className="py-3 px-4">Perubahan</th>
                <th className="py-3 px-4">Keterangan Penghapusan</th>
                <th className="py-3 px-4">Alasan / Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <History className="w-9 h-9 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-semibold text-slate-600 text-sm">
                      Belum ada catatan aktivitas yang sesuai filter
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Seluruh aktivitas Stock Opname (penyesuaian &amp; penghapusan sesi), edit harga manual di kasir, dan penghapusan transaksi akan tercatat otomatis di sini.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const meta = getActionMeta(log);
                  const respUser = getResponsibleUser(log);
                  const deletionNote = getDeletionNote(log);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap">
                        {formatDateTime(log.timestamp)}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{log.actorName}</div>
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${getRoleBadgeClass(
                            log.actorRole
                          )}`}
                        >
                          {getRoleLabel(log.actorRole)}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{respUser.name}</div>
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${getRoleBadgeClass(
                            respUser.role
                          )}`}
                        >
                          {getRoleLabel(respUser.role)}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold whitespace-nowrap ${meta.badgeClass}`}
                        >
                          {meta.icon}
                          <span>{meta.label}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{log.targetLabel}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{log.summary}</div>
                        {log.metadata?.stage === 'PRE_PAYMENT' && (
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                              Pra-Pembayaran
                            </span>
                            {typeof log.metadata.discountPercentFromCatalog === 'number' &&
                              log.metadata.discountPercentFromCatalog > 0 && (
                                <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-mono tabular-nums font-bold">
                                  Diskon Manual {log.metadata.discountPercentFromCatalog}%
                                </span>
                              )}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono tabular-nums text-xs">
                        {log.oldValue || log.newValue ? (
                          <div className="space-y-0.5">
                            <div className="text-slate-700">
                              <span className="line-through text-slate-400">{log.oldValue || '-'}</span>{' '}
                              <span className="text-slate-400">→</span>{' '}
                              <strong className="text-slate-900">{log.newValue || '-'}</strong>
                            </div>
                            {log.deltaValue && (
                              <div
                                className={`font-bold ${
                                  (log.numericDelta || 0) < 0 ? 'text-rose-700' : 'text-emerald-700'
                                }`}
                              >
                                Selisih: {log.deltaValue}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-xs max-w-xs">
                        {deletionNote ? (
                          <div className="text-rose-800 font-semibold bg-rose-50/70 border border-rose-200 rounded-lg px-2 py-1">
                            {deletionNote}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs">
                        {log.reason || '-'}
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
  );
};
