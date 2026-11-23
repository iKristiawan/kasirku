import React, { useMemo, useState } from 'react';
import {
  Building2,
  Calculator,
  Calendar,
  CheckCircle2,
  Edit3,
  Plus,
  Scale,
  Trash2,
  TrendingDown,
  X,
} from 'lucide-react';
import { BalanceSheetEntry, User } from '../types/pos';
import { computeFixedAssetDepreciation } from '../utils/balanceSheetUtils';
import { formatRupiah } from '../utils/formatters';
import { sound } from '../utils/audio';

interface FixedAssetDepreciationPanelProps {
  balanceSheetEntries: BalanceSheetEntry[];
  currentUser: User;
  onSaveBalanceSheetEntry: (entry: BalanceSheetEntry, isEdit?: boolean) => Promise<void> | void;
  onDeleteBalanceSheetEntry: (entry: BalanceSheetEntry) => Promise<void> | void;
  onOpenBalanceSheet?: () => void;
}

const USEFUL_LIFE_PRESETS = [
  { label: '2 Thn (24 bln)', months: 24 },
  { label: '4 Thn (48 bln)', months: 48 },
  { label: '5 Thn (60 bln)', months: 60 },
  { label: '8 Thn (96 bln)', months: 96 },
  { label: '10 Thn (120 bln)', months: 120 },
];

const getTodayLocalStr = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const FixedAssetDepreciationPanel: React.FC<FixedAssetDepreciationPanelProps> = ({
  balanceSheetEntries,
  currentUser,
  onSaveBalanceSheetEntry,
  onDeleteBalanceSheetEntry,
  onOpenBalanceSheet,
}) => {
  const todayStr = useMemo(() => getTodayLocalStr(), []);
  const [evalDate, setEvalDate] = useState<string>(todayStr);
  const [editingAsset, setEditingAsset] = useState<BalanceSheetEntry | null>(null);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [formState, setFormState] = useState<{
    accountCode: string;
    accountName: string;
    acquisitionDate: string;
    acquisitionCost: string;
    salvageValue: string;
    usefulLifeMonths: string;
    notes: string;
  }>({
    accountCode: '1210',
    accountName: '',
    acquisitionDate: todayStr,
    acquisitionCost: '',
    salvageValue: '0',
    usefulLifeMonths: '48',
    notes: '',
  });

  const showNotice = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 5000);
  };

  // All Fixed Assets registered (section === 'AKTIVA_TETAP' and not manual contra entries)
  const fixedAssetEntries = useMemo(
    () =>
      [...balanceSheetEntries]
        .filter((entry) => entry.section === 'AKTIVA_TETAP' && !entry.isContra)
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.timestamp - b.timestamp),
    [balanceSheetEntries]
  );

  const assetRows = useMemo(
    () =>
      fixedAssetEntries.map((entry) => {
        const isStraightLine =
          entry.depreciationMethod === 'STRAIGHT_LINE' && (entry.usefulLifeMonths || 0) > 0;
        const schedule = isStraightLine ? computeFixedAssetDepreciation(entry, evalDate) : null;
        return {
          entry,
          isStraightLine,
          schedule,
        };
      }),
    [fixedAssetEntries, evalDate]
  );

  const summary = useMemo(() => {
    let totalAcquisitionCost = 0;
    let totalAccumulatedDep = 0;
    let totalMonthlyDep = 0;
    let depreciatedCount = 0;

    assetRows.forEach(({ entry, schedule }) => {
      const cost = Math.max(0, Math.round(entry.amount || 0));
      totalAcquisitionCost += cost;
      if (schedule) {
        depreciatedCount += 1;
        totalAccumulatedDep += schedule.accumulatedDepreciation;
        if (evalDate >= schedule.acquisitionDate && !schedule.isFullyDepreciated) {
          totalMonthlyDep += schedule.monthlyDepreciation;
        }
      }
    });

    const totalNetBookValue = Math.max(0, totalAcquisitionCost - totalAccumulatedDep);
    return {
      totalAcquisitionCost,
      totalAccumulatedDep,
      totalNetBookValue,
      totalMonthlyDep,
      depreciatedCount,
    };
  }, [assetRows, evalDate]);

  // Live straight-line preview inside form
  const formPreview = useMemo(() => {
    const cost = Math.max(0, Math.round(parseFloat(formState.acquisitionCost) || 0));
    const salvage = Math.min(cost, Math.max(0, Math.round(parseFloat(formState.salvageValue) || 0)));
    const life = Math.max(1, Math.round(parseFloat(formState.usefulLifeMonths) || 48));
    const previewEntry: BalanceSheetEntry = {
      id: 'preview',
      accountCode: formState.accountCode || '1210',
      accountName: formState.accountName || 'Aset Tetap',
      section: 'AKTIVA_TETAP',
      amount: cost,
      isContra: false,
      asOfDate: /^\d{4}-\d{2}-\d{2}$/.test(formState.acquisitionDate)
        ? formState.acquisitionDate
        : evalDate,
      depreciationMethod: 'STRAIGHT_LINE',
      usefulLifeMonths: life,
      salvageValue: salvage,
      createdBy: currentUser.name,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    };
    return computeFixedAssetDepreciation(previewEntry, evalDate);
  }, [formState, evalDate, currentUser.name]);

  const openAddAssetForm = () => {
    sound.playTap();
    setEditingAsset(null);
    setFormError(null);
    setFormState({
      accountCode: '1210',
      accountName: '',
      acquisitionDate: evalDate,
      acquisitionCost: '',
      salvageValue: '0',
      usefulLifeMonths: '48',
      notes: '',
    });
    setIsFormOpen(true);
  };

  const openEditAssetForm = (entry: BalanceSheetEntry) => {
    sound.playTap();
    setEditingAsset(entry);
    setFormError(null);
    setFormState({
      accountCode: entry.accountCode,
      accountName: entry.accountName,
      acquisitionDate: entry.asOfDate || evalDate,
      acquisitionCost: String(entry.amount || ''),
      salvageValue: String(entry.salvageValue ?? 0),
      usefulLifeMonths: String(entry.usefulLifeMonths || 48),
      notes: entry.notes || '',
    });
    setIsFormOpen(true);
  };

  const handleSubmitAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formState.accountCode.trim()) {
      setFormError('Kode akun aset tetap wajib diisi (misal: 1210).');
      return;
    }
    if (!formState.accountName.trim()) {
      setFormError('Nama aset tetap wajib diisi (misal: Chiller Display / Komputer Kasir).');
      return;
    }
    const cost = Math.round(parseFloat(formState.acquisitionCost) || 0);
    if (cost <= 0) {
      setFormError('Harga perolehan aset harus lebih dari Rp 0.');
      return;
    }
    const salvage = Math.max(0, Math.round(parseFloat(formState.salvageValue) || 0));
    if (salvage > cost) {
      setFormError('Nilai residu (nilai sisa) tidak boleh lebih besar dari harga perolehan.');
      return;
    }
    const life = Math.round(parseFloat(formState.usefulLifeMonths) || 0);
    if (life < 1 || life > 1200) {
      setFormError('Umur ekonomis aset harus antara 1 hingga 1200 bulan.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formState.acquisitionDate)) {
      setFormError('Tanggal perolehan harus berformat YYYY-MM-DD.');
      return;
    }

    const nowIso = new Date().toISOString();
    const entry: BalanceSheetEntry = {
      id: editingAsset?.id || `bs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      accountCode: formState.accountCode.trim().slice(0, 24),
      accountName: formState.accountName.trim().slice(0, 160),
      section: 'AKTIVA_TETAP',
      amount: cost,
      isContra: false,
      asOfDate: formState.acquisitionDate,
      depreciationMethod: 'STRAIGHT_LINE',
      usefulLifeMonths: life,
      salvageValue: salvage,
      notes: formState.notes.trim().slice(0, 600),
      createdBy: editingAsset?.createdBy || currentUser.name,
      createdById: editingAsset?.createdById || currentUser.id,
      timestamp: editingAsset?.timestamp || Date.now(),
      createdAt: editingAsset?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    sound.playSuccessChime();
    await onSaveBalanceSheetEntry(entry, Boolean(editingAsset));
    setIsFormOpen(false);
    showNotice(
      `Penyusutan garis lurus aset "${entry.accountName}" disimpan. Nilai buku di Neraca otomatis diperbarui.`
    );
  };

  const handleDeleteAsset = async (entry: BalanceSheetEntry) => {
    sound.playTap();
    await onDeleteBalanceSheetEntry(entry);
    showNotice(`Aset "${entry.accountName}" dihapus dari jadwal penyusutan dan Neraca.`);
  };

  return (
    <div className="space-y-4">
      {/* Header Toolbar */}
      <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base md:text-lg font-bold text-slate-900">
              Penyusutan Aset Tetap (Metode Garis Lurus)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Hitung penyusutan bulanan otomatis dari harga perolehan, nilai residu, dan umur ekonomis untuk menyajikan nilai buku aset akurat di Neraca.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
              Evaluasi Per Tgl:
            </span>
            <input
              type="date"
              value={evalDate}
              onChange={(e) => {
                sound.playTap();
                if (e.target.value) setEvalDate(e.target.value);
              }}
              className="text-xs font-mono font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>

          {onOpenBalanceSheet && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onOpenBalanceSheet();
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5 text-sky-600" />
              <span>Lihat Nilai Buku di Neraca</span>
            </button>
          )}

          <button
            type="button"
            onClick={openAddAssetForm}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Tambah Aset &amp; Penyusutan</span>
          </button>
        </div>
      </div>

      {notice && (
        <div className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4-Column Depreciation KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500">Total Harga Perolehan</div>
          <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatRupiah(summary.totalAcquisitionCost)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            {fixedAssetEntries.length} aset tetap · {summary.depreciatedCount} disusutkan
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500">Akumulasi Penyusutan</div>
          <div className="text-xl font-bold font-mono tabular-nums text-rose-700 mt-1">
            ({formatRupiah(summary.totalAccumulatedDep)})
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Akumulasi s/d {evalDate}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500">Total Nilai Buku Netto</div>
          <div className="text-xl font-bold font-mono tabular-nums text-sky-700 mt-1">
            {formatRupiah(summary.totalNetBookValue)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Nilai buku tercatat di Neraca Aktiva Tetap
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-xs font-semibold text-slate-500">Beban Penyusutan / Bulan</div>
          <div className="text-xl font-bold font-mono tabular-nums text-amber-700 mt-1">
            {formatRupiah(summary.totalMonthlyDep)}
          </div>
          <div className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
            Estimasi {formatRupiah(summary.totalMonthlyDep * 12)} / tahun
          </div>
        </div>
      </div>

      {/* Formula Reference Banner */}
      <div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong className="text-slate-900">Rumus Garis Lurus:</strong>{' '}
            <span className="font-mono">
              Penyusutan/Bln = (Harga Perolehan − Nilai Residu) ÷ Umur Ekonomis (Bulan)
            </span>
          </span>
        </div>
        <span className="text-[11px] text-slate-500">
          Akumulasi penyusutan &amp; beban penyusutan otomatis menyeimbangkan Aktiva &amp; Ekuitas di Neraca.
        </span>
      </div>

      {/* Fixed Asset Depreciation Schedule Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Daftar Aset Tetap &amp; Nilai Buku ({fixedAssetEntries.length})
            </h3>
            <p className="text-xs text-slate-500">
              Perhitungan akumulasi penyusutan dihitung proporsional per bulan dari tanggal perolehan hingga {evalDate}.
            </p>
          </div>
        </div>

        {assetRows.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500 space-y-3">
            <Building2 className="w-8 h-8 text-slate-300 mx-auto" />
            <div>
              Belum ada aset tetap yang dicatat. Tambahkan aset seperti peralatan kasir, rak display, chiller, atau kendaraan untuk mulai menghitung penyusutan garis lurus.
            </div>
            <button
              type="button"
              onClick={openAddAssetForm}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Aset Tetap Pertama</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                  <th className="py-3 px-4">Aset Tetap</th>
                  <th className="py-3 px-3 text-right">Harga Perolehan</th>
                  <th className="py-3 px-3 text-right">Nilai Residu</th>
                  <th className="py-3 px-3 text-center">Umur / Terpakai</th>
                  <th className="py-3 px-3 text-right">Susut / Bulan</th>
                  <th className="py-3 px-3 text-right">Akum. Penyusutan</th>
                  <th className="py-3 px-3 text-right">Nilai Buku Netto</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assetRows.map(({ entry, isStraightLine, schedule }) => (
                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono font-semibold text-slate-500 tabular-nums">
                          {entry.accountCode}
                        </span>
                        <span className="font-semibold text-slate-900">{entry.accountName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>Perolehan {entry.asOfDate}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {isStraightLine
                            ? schedule?.isFullyDepreciated
                              ? 'Susut Penuh (Residu)'
                              : 'Garis Lurus Aktif'
                            : 'Belum diatur penyusutan'}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-semibold tabular-nums text-slate-900">
                      {formatRupiah(entry.amount)}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                      {schedule ? formatRupiah(schedule.salvageValue) : '-'}
                    </td>

                    <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-700">
                      {schedule ? (
                        <div>
                          <div>
                            {schedule.elapsedMonths}/{schedule.usefulLifeMonths} bln
                          </div>
                          <div className="w-20 mx-auto h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1">
                            <div
                              className="h-full bg-amber-500 rounded-full"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((schedule.elapsedMonths / schedule.usefulLifeMonths) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEditAssetForm(entry)}
                          className="text-sky-700 hover:underline font-sans font-semibold cursor-pointer"
                        >
                          Atur Garis Lurus
                        </button>
                      )}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-amber-700 font-semibold">
                      {schedule ? formatRupiah(schedule.monthlyDepreciation) : 'Rp 0'}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-rose-700 font-semibold">
                      {schedule ? `(${formatRupiah(schedule.accumulatedDepreciation)})` : 'Rp 0'}
                    </td>

                    <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-700 font-bold">
                      {schedule ? formatRupiah(schedule.netBookValue) : formatRupiah(entry.amount)}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditAssetForm(entry)}
                          title="Edit penyusutan aset"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAsset(entry)}
                          title="Hapus aset tetap"
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Add / Edit Straight-Line Depreciation Asset */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingAsset
                    ? 'Atur Penyusutan Garis Lurus Aset Tetap'
                    : 'Tambah Aset Tetap & Jadwal Penyusutan'}
                </h3>
                <p className="text-xs text-slate-500">
                  Nilai buku aset otomatis diperbarui setiap periode di Neraca Keuangan.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAsset} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kode Akun</label>
                  <input
                    type="text"
                    value={formState.accountCode}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, accountCode: e.target.value }))
                    }
                    placeholder="1210"
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Nama Aset Tetap</label>
                  <input
                    type="text"
                    value={formState.accountName}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, accountName: e.target.value }))
                    }
                    placeholder="Contoh: Chiller Display 2 Pintu / Mesin Kasir POS"
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tanggal Perolehan
                  </label>
                  <input
                    type="date"
                    value={formState.acquisitionDate}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, acquisitionDate: e.target.value }))
                    }
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Harga Perolehan (Rp)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formState.acquisitionCost}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, acquisitionCost: e.target.value }))
                    }
                    placeholder="12000000"
                    required
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nilai Residu / Sisa (Rp)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formState.salvageValue}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, salvageValue: e.target.value }))
                    }
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Umur Ekonomis (Bulan)
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="1200"
                    value={formState.usefulLifeMonths}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, usefulLifeMonths: e.target.value }))
                    }
                    required
                    className="w-full sm:w-32 px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono font-bold text-slate-900"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {USEFUL_LIFE_PRESETS.map((preset) => (
                      <button
                        key={preset.months}
                        type="button"
                        onClick={() => {
                          sound.playTap();
                          setFormState((prev) => ({
                            ...prev,
                            usefulLifeMonths: String(preset.months),
                          }));
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                          Number(formState.usefulLifeMonths) === preset.months
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Straight-Line Calculation Preview */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="font-bold text-slate-900">
                  Simulasi Penyusutan Garis Lurus (s/d {evalDate})
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div>
                    <div className="text-[11px] text-slate-500">Beban / Bulan</div>
                    <div className="font-mono font-bold tabular-nums text-amber-700">
                      {formatRupiah(formPreview.monthlyDepreciation)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Beban / Tahun</div>
                    <div className="font-mono font-bold tabular-nums text-slate-900">
                      {formatRupiah(formPreview.annualDepreciation)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">
                      Akum. ({formPreview.elapsedMonths} bln)
                    </div>
                    <div className="font-mono font-bold tabular-nums text-rose-700">
                      ({formatRupiah(formPreview.accumulatedDepreciation)})
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Nilai Buku Netto</div>
                    <div className="font-mono font-bold tabular-nums text-sky-700">
                      {formatRupiah(formPreview.netBookValue)}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Catatan Aset (Opsional)
                </label>
                <input
                  type="text"
                  value={formState.notes}
                  onChange={(e) => setFormState((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Nomor seri, lokasi unit toko, atau nomor faktur pembelian aset"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer whitespace-nowrap"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer whitespace-nowrap"
                >
                  {editingAsset ? 'Perbarui Penyusutan' : 'Simpan Aset & Penyusutan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
