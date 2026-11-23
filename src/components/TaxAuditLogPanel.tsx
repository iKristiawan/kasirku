import React, { useMemo, useState } from 'react';
import {
  Download,
  History,
  Lock,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { TaxAuditCategory, TaxAuditLog } from '../types/pos';
import { formatDateTime, formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import { exportTaxAuditLogsCsv } from '../utils/taxUtils';

interface TaxAuditLogPanelProps {
  taxAuditLogs: TaxAuditLog[];
  storeName: string;
  onNotice?: (message: string) => void;
}

const AUDIT_CATEGORY_META: Record<
  TaxAuditCategory,
  { label: string; badgeClass: string }
> = {
  CONFIG_CHANGE: {
    label: 'Perubahan Konfigurasi',
    badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  RATE_OVERRIDE: {
    label: 'Override Tarif Manual',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  ADJUSTMENT: {
    label: 'Adjustment Pajak',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  RECORD_MUTATION: {
    label: 'Mutasi Setoran Pajak',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
};

export const TaxAuditLogPanel: React.FC<TaxAuditLogPanelProps> = ({
  taxAuditLogs,
  storeName,
  onNotice,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | TaxAuditCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const stats = useMemo(() => {
    let configChanges = 0;
    let rateOverrides = 0;
    let adjustments = 0;
    let recordMutations = 0;
    taxAuditLogs.forEach((l) => {
      if (l.category === 'CONFIG_CHANGE') configChanges += 1;
      else if (l.category === 'RATE_OVERRIDE') rateOverrides += 1;
      else if (l.category === 'ADJUSTMENT') adjustments += 1;
      else if (l.category === 'RECORD_MUTATION') recordMutations += 1;
    });
    return {
      total: taxAuditLogs.length,
      configChanges,
      rateOverrides,
      adjustments,
      recordMutations,
    };
  }, [taxAuditLogs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return taxAuditLogs
      .filter((log) => {
        if (categoryFilter !== 'ALL' && log.category !== categoryFilter) return false;
        if (!q) return true;
        const changesText = (log.changes || [])
          .map((c) => `${c.label} ${c.oldValue} ${c.newValue}`)
          .join(' ')
          .toLowerCase();
        return (
          log.actionLabel.toLowerCase().includes(q) ||
          log.actorName.toLowerCase().includes(q) ||
          log.summary.toLowerCase().includes(q) ||
          (log.reason || '').toLowerCase().includes(q) ||
          (log.periodMonth || '').toLowerCase().includes(q) ||
          changesText.includes(q)
        );
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [taxAuditLogs, categoryFilter, searchQuery]);

  const handleExportCsv = () => {
    sound.playTap();
    const filename = exportTaxAuditLogsCsv(filteredLogs, storeName);
    if (onNotice) {
      onNotice(`Log audit kepatuhan pajak "${filename}" (${filteredLogs.length} entri) berhasil diunduh.`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Compliance Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500">Total Jejak Audit Pajak</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatNumber(stats.total)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
            <Lock className="w-3 h-3 text-emerald-600 shrink-0" />
            <span>Catatan permanen (Append-Only)</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-amber-700">Override Tarif Manual</div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {formatNumber(stats.rateOverrides)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Perubahan tarif PPh/PPN/PB1/Badan
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-sky-700">Perubahan Profil &amp; Opsi</div>
          <div className="text-xl font-bold font-mono tabular-nums text-sky-700 mt-1">
            {formatNumber(stats.configChanges)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Status PKP, NPWP &amp; fasilitas 31E
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-indigo-700">Adjustment &amp; Mutasi Setoran</div>
          <div className="text-xl font-bold font-mono tabular-nums text-indigo-700 mt-1">
            {formatNumber(stats.adjustments + stats.recordMutations)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {formatNumber(stats.adjustments)} adjustment · {formatNumber(stats.recordMutations)} setoran
          </div>
        </div>
      </div>

      {/* Filter & Export Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 overflow-x-auto">
          {[
            { id: 'ALL' as const, label: 'Semua' },
            { id: 'RATE_OVERRIDE' as const, label: 'Override Tarif' },
            { id: 'CONFIG_CHANGE' as const, label: 'Konfigurasi' },
            { id: 'ADJUSTMENT' as const, label: 'Adjustment' },
            { id: 'RECORD_MUTATION' as const, label: 'Mutasi Setoran' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                sound.playTap();
                setCategoryFilter(item.id);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                categoryFilter === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari aktor, field, alasan..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-sky-500"
            />
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Ekspor CSV Audit</span>
          </button>
        </div>
      </div>

      {/* Audit Log Timeline Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Log Audit Kepatuhan Pajak Khusus
              </h3>
              <p className="text-xs text-slate-500">
                Merekam otomatis setiap perubahan profil pajak, override tarif manual, adjustment faktur, dan mutasi bukti setor.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500">
            Menampilkan {formatNumber(filteredLogs.length)} dari {formatNumber(taxAuditLogs.length)} entri
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredLogs.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2 text-xs text-slate-500">
              <History className="w-7 h-7 text-slate-300 mx-auto" />
              <div className="font-semibold text-slate-700">
                Belum ada riwayat audit yang cocok dengan filter saat ini
              </div>
              <p>
                Setiap perubahan pengaturan tarif pajak, manual override pada catatan setoran/simulasi, atau pembuatan adjustment akan tercatat otomatis di sini.
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const meta = AUDIT_CATEGORY_META[log.category] || AUDIT_CATEGORY_META.CONFIG_CHANGE;
              return (
                <div key={log.id} className="p-4 hover:bg-slate-50/70 space-y-2 text-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap shrink-0 ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                      <span className="font-bold text-slate-900">{log.actionLabel}</span>
                      {log.periodMonth && (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 font-mono text-[11px] font-semibold text-slate-700">
                          Masa {log.periodMonth}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono tabular-nums shrink-0">
                      <span className="font-sans font-semibold text-slate-700">
                        {log.actorName} ({log.actorRole})
                      </span>
                      <span>·</span>
                      <span>{formatDateTime(log.timestamp)}</span>
                    </div>
                  </div>

                  <p className="text-slate-700">{log.summary}</p>

                  {log.changes && log.changes.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 pt-0.5">
                      {log.changes.map((chg, idx) => (
                        <div
                          key={`${log.id}_chg_${idx}`}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span className="font-semibold text-slate-700">{chg.label}</span>
                          <span className="font-mono tabular-nums text-right">
                            <span className="text-rose-700 line-through mr-1.5">{chg.oldValue}</span>
                            <span className="text-slate-400 mr-1.5">→</span>
                            <span className="text-emerald-700 font-bold">{chg.newValue}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {log.reason && (
                    <div className="text-[11px] text-slate-600 bg-slate-50/70 px-2.5 py-1.5 rounded-lg border border-slate-200/60">
                      <span className="font-semibold text-slate-700">Alasan Audit:</span> {log.reason}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
