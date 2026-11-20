import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  ExternalLink,
  EyeOff,
  MessageCircle,
  Phone,
  RotateCcw,
} from 'lucide-react';
import { Customer, Transaction } from '../types/pos';
import { formatDateOnly, formatNumber, formatRupiah, formatWhatsAppUrl } from '../utils/formatters';
import { sound } from '../utils/audio';
import { getLocalDateKey } from '../utils/adminLowStockAlert';

interface PiutangDueAlertBannerProps {
  transactions: Transaction[];
  customers?: Customer[];
  storeName?: string;
  bcaAccountNumber?: string;
  bcaAccountName?: string;
  onNavigateToPiutang?: () => void;
}

export interface UrgentPiutangEntry {
  transaction: Transaction;
  customerName: string;
  whatsappPhone: string;
  dueDateKey: string;
  dueDateDisplay: string;
  isEstimatedDueDate: boolean;
  daysUntilDue: number; // < 0 = overdue, 0 = due today, 1..3 = due within 3 days
  urgencyLabel: string;
  waMessage: string;
  waUrl: string;
}

const PIUTANG_ALERT_LOG_PREFIX = 'kasir_piutang_due_reminder_state_';

interface DailyReminderLogState {
  snoozedToday?: boolean;
  contactedIds?: string[];
}

function parseDueDateMidnightMs(
  dueDateStr: string | undefined,
  fallbackTimestamp: number
): { dueMs: number; dueKey: string; isEstimated: boolean } {
  if (dueDateStr && /^\d{4}-\d{2}-\d{2}$/.test(dueDateStr.trim())) {
    const [y, m, d] = dueDateStr.trim().split('-').map((v) => parseInt(v, 10));
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    if (!isNaN(dt.getTime())) {
      return { dueMs: dt.getTime(), dueKey: dueDateStr.trim(), isEstimated: false };
    }
  }
  const fallback = new Date(fallbackTimestamp + 14 * 86400000);
  fallback.setHours(0, 0, 0, 0);
  return {
    dueMs: fallback.getTime(),
    dueKey: getLocalDateKey(fallback),
    isEstimated: true,
  };
}

export function getUpcomingDuePiutangEntries(params: {
  transactions: Transaction[];
  customers?: Customer[];
  storeName?: string;
  bcaAccountNumber?: string;
  bcaAccountName?: string;
  now?: Date;
}): {
  upcoming3Days: UrgentPiutangEntry[];
  overdue: UrgentPiutangEntry[];
  upcomingTotalNominal: number;
  overdueTotalNominal: number;
} {
  const {
    transactions = [],
    customers = [],
    storeName = 'KasirKu POS',
    bcaAccountNumber,
    bcaAccountName,
    now = new Date(),
  } = params;

  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
  const customerMap = new Map<string, Customer>();
  customers.forEach((c) => customerMap.set(c.id, c));

  const upcoming3Days: UrgentPiutangEntry[] = [];
  const overdue: UrgentPiutangEntry[] = [];

  transactions.forEach((tx) => {
    if (tx.paymentMethod !== 'PIUTANG' || tx.paymentStatus !== 'BELUM_LUNAS') return;

    const { dueMs, dueKey, isEstimated } = parseDueDateMidnightMs(tx.dueDate, tx.timestamp);
    const daysUntilDue = Math.round((dueMs - todayMidnight) / 86400000);

    if (daysUntilDue > 3) return; // Hanya pantau <= 3 hari ke depan & lewat tempo

    const matchedCust = tx.customerId ? customerMap.get(tx.customerId) : undefined;
    const customerName = matchedCust?.name || tx.customerName || 'Pelanggan';
    const whatsappPhone = (tx.customerWhatsapp || matchedCust?.whatsapp || matchedCust?.phone || '').trim();
    const dueDateDisplay = formatDateOnly(dueMs);

    let urgencyLabel = '';
    if (daysUntilDue < 0) {
      urgencyLabel = `Lewat ${Math.abs(daysUntilDue)} hari`;
    } else if (daysUntilDue === 0) {
      urgencyLabel = 'Jatuh Tempo Hari Ini';
    } else {
      urgencyLabel = `${daysUntilDue} hari lagi (H-${daysUntilDue})`;
    }

    const bcaInfo =
      bcaAccountNumber && bcaAccountNumber.trim()
        ? `\nPembayaran dapat ditransfer ke Rekening BCA ${bcaAccountNumber}${bcaAccountName ? ` a/n ${bcaAccountName}` : ''} atau langsung di toko.`
        : '\nMohon dapat melakukan pelunasan melalui transfer atau langsung ke kasir toko.';

    const timingPhrase =
      daysUntilDue < 0
        ? `telah melewati jatuh tempo pada *${dueDateDisplay}* (${Math.abs(daysUntilDue)} hari lalu)`
        : daysUntilDue === 0
        ? `jatuh tempo *HARI INI (${dueDateDisplay})*`
        : `akan jatuh tempo dalam *${daysUntilDue} hari lagi (${dueDateDisplay})*`;

    const waMessage =
      `Halo Bapak/Ibu *${customerName}*,\n` +
      `Kami dari *${storeName}* ingin mengingatkan tagihan belanja tempo/piutang Anda yang ${timingPhrase}:\n\n` +
      `• No. Nota : *${tx.invoiceNumber}*\n` +
      `• Nominal  : *${formatRupiah(tx.finalAmount)}*\n` +
      `• Jatuh Tempo : ${dueDateDisplay}\n` +
      `${bcaInfo}\n\n` +
      `Terima kasih atas perhatian & kerja samanya.`;

    const waUrl = formatWhatsAppUrl(whatsappPhone, waMessage);

    const entry: UrgentPiutangEntry = {
      transaction: tx,
      customerName,
      whatsappPhone,
      dueDateKey: dueKey,
      dueDateDisplay,
      isEstimatedDueDate: isEstimated,
      daysUntilDue,
      urgencyLabel,
      waMessage,
      waUrl,
    };

    if (daysUntilDue < 0) {
      overdue.push(entry);
    } else {
      upcoming3Days.push(entry);
    }
  });

  upcoming3Days.sort((a, b) => a.daysUntilDue - b.daysUntilDue || b.transaction.finalAmount - a.transaction.finalAmount);
  overdue.sort((a, b) => a.daysUntilDue - b.daysUntilDue || b.transaction.finalAmount - a.transaction.finalAmount);

  return {
    upcoming3Days,
    overdue,
    upcomingTotalNominal: upcoming3Days.reduce((acc, e) => acc + e.transaction.finalAmount, 0),
    overdueTotalNominal: overdue.reduce((acc, e) => acc + e.transaction.finalAmount, 0),
  };
}

export const PiutangDueAlertBanner: React.FC<PiutangDueAlertBannerProps> = ({
  transactions,
  customers = [],
  storeName = 'KasirKu POS',
  bcaAccountNumber,
  bcaAccountName,
  onNavigateToPiutang,
}) => {
  const todayKey = getLocalDateKey();
  const storageKey = `${PIUTANG_ALERT_LOG_PREFIX}${todayKey}`;

  const [reminderLog, setReminderLog] = useState<DailyReminderLogState>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as DailyReminderLogState) : {};
    } catch {
      return {};
    }
  });
  const [activeScope, setActiveScope] = useState<'UPCOMING_3D' | 'OVERDUE' | 'ALL'>('UPCOMING_3D');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [copiedTxId, setCopiedTxId] = useState<string | null>(null);

  const persistLog = (next: DailyReminderLogState) => {
    setReminderLog(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage write errors
    }
  };

  const { upcoming3Days, overdue, upcomingTotalNominal, overdueTotalNominal } = useMemo(
    () =>
      getUpcomingDuePiutangEntries({
        transactions,
        customers,
        storeName,
        bcaAccountNumber,
        bcaAccountName,
      }),
    [transactions, customers, storeName, bcaAccountNumber, bcaAccountName]
  );

  // Default to OVERDUE only if there are 0 upcoming within 3 days but overdue items exist
  const effectiveScope: 'UPCOMING_3D' | 'OVERDUE' | 'ALL' =
    activeScope === 'UPCOMING_3D' && upcoming3Days.length === 0 && overdue.length > 0
      ? 'OVERDUE'
      : activeScope;

  const visibleEntries = useMemo(() => {
    if (effectiveScope === 'UPCOMING_3D') return upcoming3Days;
    if (effectiveScope === 'OVERDUE') return overdue;
    return [...upcoming3Days, ...overdue];
  }, [effectiveScope, upcoming3Days, overdue]);

  const totalUrgentCount = upcoming3Days.length + overdue.length;
  if (totalUrgentCount === 0) return null;

  const contactedSet = new Set(reminderLog.contactedIds || []);
  const pendingContactUpcoming = upcoming3Days.filter((e) => !contactedSet.has(e.transaction.id)).length;

  const handleToggleContacted = (txId: string) => {
    sound.playTap();
    const current = reminderLog.contactedIds || [];
    const nextIds = contactedSet.has(txId)
      ? current.filter((id) => id !== txId)
      : [...current, txId];
    persistLog({ ...reminderLog, contactedIds: nextIds });
  };

  const handleCopyMessage = (entry: UrgentPiutangEntry) => {
    sound.playTap();
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(entry.waMessage).catch(() => {});
    }
    setCopiedTxId(entry.transaction.id);
    window.setTimeout(() => setCopiedTxId((prev) => (prev === entry.transaction.id ? null : prev)), 2000);
  };

  if (reminderLog.snoozedToday) {
    return (
      <div className="bg-white px-4 py-2.5 rounded-2xl border border-amber-300 shadow-2xs flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-slate-700 min-w-0">
          <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="font-bold text-slate-900">
            Pengingat Piutang Jatuh Tempo:
          </span>
          <span className="font-mono font-bold text-amber-700 tabular-nums">
            {formatNumber(upcoming3Days.length)} jatuh tempo ≤ 3 hari ({formatRupiah(upcomingTotalNominal)})
          </span>
          {overdue.length > 0 && (
            <span className="font-mono font-semibold text-rose-700 tabular-nums">
              · {formatNumber(overdue.length)} lewat tempo
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              sound.playTap();
              persistLog({ ...reminderLog, snoozedToday: false });
            }}
            className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Tampilkan Daftar Tagihan</span>
          </button>
          {onNavigateToPiutang && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToPiutang();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CreditCard className="w-3 h-3" />
              <span>Kelola Piutang</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <section
      aria-label="Pengingat Otomatis Piutang Jatuh Tempo"
      className="bg-white rounded-2xl border border-amber-300 shadow-2xs overflow-hidden"
    >
      {/* Header Strip */}
      <div className="px-4 py-3 bg-gradient-to-r from-amber-50 via-white to-rose-50/50 border-b border-amber-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
                Pengingat Otomatis Piutang Jatuh Tempo (3 Hari Ke Depan)
              </h3>
              {upcoming3Days.length > 0 && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-200 whitespace-nowrap tabular-nums">
                  {formatNumber(upcoming3Days.length)} Tagihan H-0 s/d H-3 · {formatRupiah(upcomingTotalNominal)}
                </span>
              )}
              {overdue.length > 0 && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap tabular-nums">
                  {formatNumber(overdue.length)} Lewat Tempo · {formatRupiah(overdueTotalNominal)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600">
              {upcoming3Days.length > 0
                ? `${formatNumber(pendingContactUpcoming)} dari ${formatNumber(upcoming3Days.length)} pelanggan yang jatuh tempo dalam 3 hari ke depan belum ditandai sudah dihubungi hari ini.`
                : 'Terdapat piutang pelanggan yang telah melewati tanggal jatuh tempo dan perlu segera ditindaklanjuti.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {/* Scope Switch */}
          <div className="inline-flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                setActiveScope('UPCOMING_3D');
                setIsExpanded(true);
              }}
              className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                effectiveScope === 'UPCOMING_3D'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              ≤ 3 Hari ({upcoming3Days.length})
            </button>
            {overdue.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setActiveScope('OVERDUE');
                  setIsExpanded(true);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  effectiveScope === 'OVERDUE'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lewat Tempo ({overdue.length})
              </button>
            )}
            {upcoming3Days.length > 0 && overdue.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  sound.playTap();
                  setActiveScope('ALL');
                  setIsExpanded(true);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  effectiveScope === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Semua ({totalUrgentCount})
              </button>
            )}
          </div>

          {onNavigateToPiutang && (
            <button
              type="button"
              onClick={() => {
                sound.playTap();
                onNavigateToPiutang();
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5 text-amber-400" />
              <span>Kelola Piutang</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              setIsExpanded((v) => !v);
            }}
            className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 cursor-pointer shrink-0"
            title={isExpanded ? 'Perkecil daftar' : 'Tampilkan daftar'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={() => {
              sound.playTap();
              persistLog({ ...reminderLog, snoozedToday: true });
            }}
            className="p-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 cursor-pointer shrink-0"
            title="Sembunyikan pengingat hari ini"
          >
            <EyeOff className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Urgent Receivables List */}
      {isExpanded && (
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {visibleEntries.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500">
              Tidak ada piutang yang jatuh tempo dalam 3 hari ke depan. Gunakan tab{' '}
              <strong>Lewat Tempo</strong> untuk melihat tagihan yang sudah melewati batas waktu.
            </div>
          ) : (
            visibleEntries.map((entry) => {
              const isContacted = contactedSet.has(entry.transaction.id);
              const isOverdue = entry.daysUntilDue < 0;
              const isToday = entry.daysUntilDue === 0;
              const hasPhone = entry.whatsappPhone.replace(/\D/g, '').length >= 8;

              return (
                <div
                  key={entry.transaction.id}
                  className={`px-4 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2.5 transition-colors ${
                    isContacted
                      ? 'bg-emerald-50/40'
                      : isOverdue
                      ? 'bg-rose-50/35'
                      : isToday
                      ? 'bg-amber-50/50'
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`px-2 py-1 rounded-lg text-[10px] font-black font-mono whitespace-nowrap shrink-0 border ${
                        isOverdue
                          ? 'bg-rose-100 text-rose-800 border-rose-200'
                          : isToday
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-amber-100 text-amber-900 border-amber-200'
                      }`}
                    >
                      {isOverdue
                        ? `H+${Math.abs(entry.daysUntilDue)}`
                        : entry.daysUntilDue === 0
                        ? 'H-0'
                        : `H-${entry.daysUntilDue}`}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-slate-900 truncate">
                          {entry.customerName}
                        </span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {entry.transaction.invoiceNumber}
                        </span>
                        {isContacted && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            <Check className="w-3 h-3" />
                            <span>Sudah Ditagih Hari Ini</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 text-[11px] text-slate-500 flex-wrap mt-0.5">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <CalendarClock className="w-3 h-3 text-slate-400" />
                          <span>
                            Tempo: <strong className="text-slate-700">{entry.dueDateDisplay}</strong> ({entry.urgencyLabel})
                            {entry.isEstimatedDueDate ? ' · Est. 14h' : ''}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{hasPhone ? entry.whatsappPhone : 'Belum ada no. WA'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-2 shrink-0 flex-wrap">
                    <div className="text-right mr-1">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">Tagihan</div>
                      <div className="text-xs sm:text-sm font-black font-mono text-slate-900 tabular-nums">
                        {formatRupiah(entry.transaction.finalAmount)}
                      </div>
                    </div>

                    <a
                      href={entry.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        sound.playSuccessChime();
                        if (!isContacted) handleToggleContacted(entry.transaction.id);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-2xs whitespace-nowrap shrink-0 transition-colors"
                      title={
                        hasPhone
                          ? `Kirim pengingat WhatsApp ke ${entry.whatsappPhone}`
                          : 'Buka WhatsApp untuk memilih kontak pelanggan secara manual'
                      }
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Hubungi via WA</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <button
                      type="button"
                      onClick={() => handleCopyMessage(entry)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      title="Salin teks pengingat piutang"
                    >
                      {copiedTxId === entry.transaction.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Tersalin</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Salin</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleContacted(entry.transaction.id)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        isContacted
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                      title="Tandai apakah pelanggan sudah dihubungi hari ini"
                    >
                      {isContacted ? 'Sudah Ditagih' : 'Tandai Ditagih'}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
};
