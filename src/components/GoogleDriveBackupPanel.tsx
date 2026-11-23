import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  UploadCloud,
  RefreshCw,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  FolderOpen,
  LogOut,
  ShieldAlert,
  Loader2,
  X,
  FileJson,
  Lock,
} from 'lucide-react';
import { BackupPayload } from '../types/pos';
import { formatNumber } from '../utils/formatters';
import { sound } from '../utils/audio';
import {
  DriveAuthExpiredError,
  DriveInsufficientScopeError,
  DriveBackupFile,
  DriveBackupSchedule,
  GoogleDriveUserAccount,
  deleteGoogleDriveBackup,
  disconnectGoogleDrive,
  downloadGoogleDriveBackup,
  getActiveDriveToken,
  getDriveBackupSchedule,
  isDriveBackupOverdue,
  listGoogleDriveBackups,
  recordDriveBackupCompleted,
  saveDriveBackupSchedule,
  signInForGoogleDrive,
  subscribeGoogleDriveAuth,
  uploadGoogleDriveBackup,
} from '../utils/googleDriveBackup';

interface GoogleDriveBackupPanelProps {
  canManageBackup: boolean;
  currentUserName: string;
  buildBackupPayload: (prefix?: string) => {
    fileName: string;
    payload: BackupPayload;
    dateFormatted: string;
  };
  onRestoreBackup: (payload: BackupPayload) => Promise<void>;
  compact?: boolean;
  onBackupCompleted?: () => void;
}

type PendingDriveConfirm =
  | {
      type: 'RESTORE';
      file: DriveBackupFile;
      payload: BackupPayload;
    }
  | {
      type: 'DELETE';
      file: DriveBackupFile;
    }
  | null;

function formatBytes(sizeStr?: string): string {
  const bytes = Number(sizeStr || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function formatDriveTimestamp(iso?: string | number): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

export const GoogleDriveBackupPanel: React.FC<GoogleDriveBackupPanelProps> = ({
  canManageBackup,
  currentUserName,
  buildBackupPayload,
  onRestoreBackup,
  compact = false,
  onBackupCompleted,
}) => {
  const [driveAccount, setDriveAccount] = useState<GoogleDriveUserAccount | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(() => Boolean(getActiveDriveToken()));
  const [isConnecting, setIsConnecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isPreparingAction, setIsPreparingAction] = useState<string | null>(null);
  const [isExecutingConfirm, setIsExecutingConfirm] = useState(false);

  const [driveFiles, setDriveFiles] = useState<DriveBackupFile[]>([]);
  const [schedule, setSchedule] = useState<DriveBackupSchedule>(() =>
    getDriveBackupSchedule()
  );
  const [notice, setNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingDriveConfirm>(null);

  const [needsDriveScopeConsent, setNeedsDriveScopeConsent] = useState(false);

  const overdue = isDriveBackupOverdue(schedule);

  const loadFiles = useCallback(async (tokenOverride?: string) => {
    const token = tokenOverride || getActiveDriveToken();
    if (!token) {
      setHasToken(false);
      return;
    }
    setIsLoadingFiles(true);
    try {
      const files = await listGoogleDriveBackups(token);
      setDriveFiles(files);
      setHasToken(true);
      setNeedsDriveScopeConsent(false);
    } catch (err) {
      if (err instanceof DriveInsufficientScopeError) {
        setHasToken(false);
        setNeedsDriveScopeConsent(true);
        setNotice({
          type: 'error',
          message: err.message,
        });
      } else if (err instanceof DriveAuthExpiredError) {
        setHasToken(false);
        setNotice({
          type: 'info',
          message: err.message,
        });
      } else {
        setNotice({
          type: 'error',
          message: err instanceof Error ? err.message : 'Gagal memuat daftar backup Google Drive.',
        });
      }
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    const unsub = subscribeGoogleDriveAuth((account, tokenReady) => {
      setDriveAccount(account);
      setHasToken(tokenReady);
      if (!tokenReady) {
        setDriveFiles([]);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const token = getActiveDriveToken();
    if (token && canManageBackup) {
      loadFiles(token);
    }
  }, [canManageBackup, loadFiles]);

  const handleGoogleSignIn = async () => {
    if (!canManageBackup) return;
    sound.playTap();
    setIsConnecting(true);
    setNotice(null);
    try {
      const { account, token } = await signInForGoogleDrive();
      setDriveAccount(account);
      setHasToken(true);
      setNeedsDriveScopeConsent(false);
      sound.playSuccessChime();
      setNotice({
        type: 'success',
        message: `Terhubung ke Google Drive (${account.email}). Folder "KasirKu Backup Toko" siap digunakan.`,
      });
      await loadFiles(token);
    } catch (err) {
      sound.playError();
      if (err instanceof DriveInsufficientScopeError) {
        setHasToken(false);
        setNeedsDriveScopeConsent(true);
      }
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal masuk dengan Google.',
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    sound.playTap();
    await disconnectGoogleDrive();
    setDriveFiles([]);
    setHasToken(false);
    setNeedsDriveScopeConsent(false);
    setNotice({
      type: 'info',
      message: 'Sesi Google Drive diputuskan. Token akses di memori telah dibersihkan.',
    });
  };

  const handleBackupNow = async () => {
    if (!canManageBackup) return;
    const token = getActiveDriveToken();
    if (!token) {
      setHasToken(false);
      setNotice({
        type: 'info',
        message: 'Silakan masuk dengan Google Drive terlebih dahulu untuk mengunggah cadangan.',
      });
      return;
    }

    sound.playTap();
    setIsUploading(true);
    setNotice(null);
    try {
      const { fileName, payload } = buildBackupPayload('KasirKu-DriveBackup');
      const uploaded = await uploadGoogleDriveBackup(token, fileName, payload);
      const nextSchedule = recordDriveBackupCompleted(uploaded.name, currentUserName);
      setSchedule(nextSchedule);
      sound.playSuccessChime();
      setNotice({
        type: 'success',
        message: `Cadangan "${uploaded.name}" berhasil disimpan ke folder "KasirKu Backup Toko" di Google Drive.`,
      });
      onBackupCompleted?.();
      await loadFiles(token);
    } catch (err) {
      sound.playError();
      if (err instanceof DriveInsufficientScopeError) {
        setHasToken(false);
        setNeedsDriveScopeConsent(true);
      } else if (err instanceof DriveAuthExpiredError) {
        setHasToken(false);
      }
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengunggah backup ke Google Drive.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handlePrepareRestore = async (file: DriveBackupFile) => {
    const token = getActiveDriveToken();
    if (!token) {
      setHasToken(false);
      return;
    }
    sound.playTap();
    setIsPreparingAction(file.id);
    setNotice(null);
    try {
      const payload = await downloadGoogleDriveBackup(token, file.id);
      setPendingConfirm({
        type: 'RESTORE',
        file,
        payload,
      });
    } catch (err) {
      sound.playError();
      if (err instanceof DriveInsufficientScopeError) {
        setHasToken(false);
        setNeedsDriveScopeConsent(true);
      } else if (err instanceof DriveAuthExpiredError) {
        setHasToken(false);
      }
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengunduh file cadangan dari Google Drive.',
      });
    } finally {
      setIsPreparingAction(null);
    }
  };

  const handleConfirmPendingAction = async () => {
    if (!pendingConfirm) return;
    sound.playTap();
    setIsExecutingConfirm(true);
    setNotice(null);

    try {
      if (pendingConfirm.type === 'RESTORE') {
        await onRestoreBackup(pendingConfirm.payload);
        sound.playSuccessChime();
        setNotice({
          type: 'success',
          message: `Data toko berhasil dipulihkan dari Google Drive ("${pendingConfirm.file.name}").`,
        });
        setPendingConfirm(null);
      } else if (pendingConfirm.type === 'DELETE') {
        const token = getActiveDriveToken();
        if (!token) {
          setHasToken(false);
          setPendingConfirm(null);
          throw new DriveAuthExpiredError();
        }
        await deleteGoogleDriveBackup(token, pendingConfirm.file.id);
        sound.playSuccessChime();
        setNotice({
          type: 'success',
          message: `File cadangan "${pendingConfirm.file.name}" telah dihapus permanen dari Google Drive.`,
        });
        setPendingConfirm(null);
        await loadFiles(token);
      }
    } catch (err) {
      sound.playError();
      if (err instanceof DriveInsufficientScopeError) {
        setHasToken(false);
        setNeedsDriveScopeConsent(true);
      } else if (err instanceof DriveAuthExpiredError) {
        setHasToken(false);
      }
      setNotice({
        type: 'error',
        message: err instanceof Error ? err.message : 'Aksi Google Drive gagal dijalankan.',
      });
    } finally {
      setIsExecutingConfirm(false);
    }
  };

  const handleChangeInterval = (intervalDays: 1 | 3 | 7) => {
    sound.playTap();
    const updated = saveDriveBackupSchedule({
      ...schedule,
      intervalDays,
    });
    setSchedule(updated);
  };

  const handleToggleSchedule = (enabled: boolean) => {
    sound.playTap();
    const updated = saveDriveBackupSchedule({
      ...schedule,
      enabled,
    });
    setSchedule(updated);
  };

  return (
    <div
      className={`rounded-2xl border border-sky-200/90 bg-gradient-to-br from-sky-50/70 via-white to-indigo-50/50 space-y-4 ${
        compact ? 'p-4' : 'p-4 sm:p-5'
      }`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-sky-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shadow-xs shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-extrabold text-slate-900">
                Backup Cloud Google Drive
              </h4>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
                Manajer &amp; Admin
              </span>
              {hasToken && driveAccount ? (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Terhubung
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  Belum Masuk
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
              Simpan cadangan berkala data toko (transaksi, produk, stok, pelanggan, keuangan) ke folder{' '}
              <strong className="text-slate-800">KasirKu Backup Toko</strong> di Google Drive pribadi atau toko Anda.
            </p>
          </div>
        </div>

        {hasToken && driveAccount && (
          <button
            type="button"
            onClick={handleDisconnect}
            className="self-start sm:self-center px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Putuskan Sesi</span>
          </button>
        )}
      </div>

      {!canManageBackup && (
        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-xs flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Hanya Store Manager atau Admin yang dapat mengakses cadangan Google Drive.</span>
        </div>
      )}

      {/* Periodic Schedule & Reminder Strip */}
      <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock
              className={`w-4 h-4 shrink-0 ${overdue ? 'text-amber-600' : 'text-sky-600'}`}
            />
            <div>
              <div className="text-xs font-bold text-slate-800">
                Jadwal Pengingat Backup Berkala
              </div>
              <div className="text-[11px] text-slate-500">
                {schedule.lastBackupAt ? (
                  <>
                    Terakhir dicadangkan:{' '}
                    <strong className="text-slate-700">
                      {formatDriveTimestamp(schedule.lastBackupAt)}
                    </strong>
                    {schedule.lastBackupBy ? ` oleh ${schedule.lastBackupBy}` : ''}
                  </>
                ) : (
                  'Belum pernah mencadangkan ke Google Drive.'
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {([1, 3, 7] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => handleChangeInterval(days)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  schedule.intervalDays === days
                    ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {days === 1 ? 'Harian' : days === 3 ? '3 Hari' : 'Mingguan'}
              </button>
            ))}
            <label className="ml-1 inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-600 cursor-pointer select-none px-2 py-1 rounded-lg bg-slate-50 border border-slate-200">
              <input
                type="checkbox"
                checked={schedule.enabled}
                onChange={(e) => handleToggleSchedule(e.target.checked)}
                className="rounded text-sky-600 focus:ring-sky-500"
              />
              <span>Pengingat</span>
            </label>
          </div>
        </div>

        {overdue && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>
              {schedule.lastBackupAt
                ? `Cadangan Google Drive sudah melewati jadwal ${schedule.intervalDays} hari. Disarankan melakukan backup hari ini.`
                : 'Belum ada cadangan luar database Firebase. Hubungkan Google Drive untuk mengamankan data toko.'}
            </span>
          </div>
        )}
      </div>

      {/* Feedback Banner */}
      {notice && (
        <div
          className={`p-3 rounded-xl border flex items-start justify-between gap-2 text-xs ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : notice.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-sky-50 border-sky-200 text-sky-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {notice.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  notice.type === 'error' ? 'text-rose-600' : 'text-sky-600'
                }`}
              />
            )}
            <span className="font-medium leading-relaxed">{notice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="p-0.5 opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Auth / Connected Actions */}
      {!hasToken || !driveAccount ? (
        <div className="p-4 sm:p-5 rounded-xl bg-white border border-dashed border-sky-300 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs font-extrabold text-slate-900">
              {needsDriveScopeConsent
                ? 'Izin Google Drive Perlu Dicentang Ulang'
                : driveAccount
                ? `Sesi Drive (${driveAccount.email}) perlu otorisasi ulang`
                : 'Masuk dengan Akun Google Anda'}
            </div>
            <p className="text-[11px] text-slate-500 max-w-md leading-relaxed">
              {needsDriveScopeConsent
                ? 'Saat pop-up Google muncul, pastikan Anda mencentang opsi izin akses file Google Drive ("drive.file") lalu klik Lanjutkan agar backup dapat berjalan.'
                : (
                  <>
                    Aplikasi hanya meminta akses file khusus folder backup aplikasi (<code className="text-[10px] bg-slate-100 px-1 rounded">drive.file</code>) dan tidak membaca file pribadi Drive Anda lainnya.
                  </>
                )}
            </p>
          </div>

          <button
            type="button"
            disabled={!canManageBackup || isConnecting}
            onClick={handleGoogleSignIn}
            className="gsi-material-button shrink-0"
          >
            <div className="gsi-material-button-state"></div>
            <div className="gsi-material-button-content-wrapper">
              <div className="gsi-material-button-icon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </div>
              <span className="gsi-material-button-contents">
                {isConnecting ? 'Menghubungkan...' : 'Sign in with Google'}
              </span>
            </div>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Connected account + primary action bar */}
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {driveAccount.photoURL ? (
                <img
                  src={driveAccount.photoURL}
                  alt={driveAccount.displayName}
                  className="w-9 h-9 rounded-full border border-slate-200 shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-sky-100 text-sky-700 font-extrabold text-sm flex items-center justify-center shrink-0">
                  {(driveAccount.displayName || 'G').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-slate-900 truncate">
                  {driveAccount.displayName}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {driveAccount.email} · Folder: <strong>KasirKu Backup Toko</strong>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                disabled={isLoadingFiles}
                onClick={() => {
                  sound.playTap();
                  loadFiles();
                }}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                <span>Muat Ulang</span>
              </button>

              <button
                type="button"
                disabled={!canManageBackup || isUploading}
                onClick={handleBackupNow}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-extrabold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5" />
                )}
                <span>{isUploading ? 'Mengunggah ke Drive...' : 'Backup ke Google Drive'}</span>
              </button>
            </div>
          </div>

          {/* List of Drive Backups */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <FolderOpen className="w-3.5 h-3.5 text-sky-600" />
                <span>Riwayat File Backup di Google Drive</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold tabular-nums">
                  {driveFiles.length}
                </span>
              </div>
              <span className="text-[10px] text-slate-500">
                Urutan terbaru
              </span>
            </div>

            {isLoadingFiles ? (
              <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-sky-600" />
                <span>Membaca folder KasirKu Backup Toko...</span>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="p-6 text-center space-y-1">
                <FileJson className="w-7 h-7 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-700">
                  Belum ada file backup di Google Drive
                </p>
                <p className="text-[11px] text-slate-400">
                  Klik &ldquo;Backup ke Google Drive&rdquo; di atas untuk menyimpan arsip JSON pertama Anda.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {driveFiles.map((file) => {
                  const txCount = file.appProperties?.transactionCount;
                  const prodCount = file.appProperties?.productCount;
                  const custCount = file.appProperties?.customerCount;
                  const isBusy = isPreparingAction === file.id;
                  return (
                    <div
                      key={file.id}
                      className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-sky-50/40 transition-colors"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <FileJson className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {file.name}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-slate-500 flex items-center gap-2 flex-wrap tabular-nums">
                          <span>{formatDriveTimestamp(file.modifiedTime || file.createdTime)}</span>
                          <span>·</span>
                          <span>{formatBytes(file.size)}</span>
                          {(txCount || prodCount) && (
                            <>
                              <span>·</span>
                              <span className="text-slate-700 font-semibold">
                                {prodCount || 0} produk · {txCount || 0} transaksi
                                {custCount ? ` · ${custCount} pelanggan` : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy || isUploading}
                          onClick={() => handlePrepareRestore(file)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          <span>Pulihkan</span>
                        </button>

                        <button
                          type="button"
                          disabled={isBusy || isUploading}
                          onClick={() => {
                            sound.playTap();
                            setPendingConfirm({ type: 'DELETE', file });
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title="Hapus file ini dari Google Drive"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Hapus</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mandatory Explicit Confirmation Modal for Restore or Delete on Google Drive */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  pendingConfirm.type === 'DELETE'
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  {pendingConfirm.type === 'RESTORE'
                    ? 'Konfirmasi Pemulihan Data dari Google Drive'
                    : 'Konfirmasi Hapus File di Google Drive'}
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {pendingConfirm.type === 'RESTORE' ? (
                    <>
                      Seluruh data toko lokal &amp; Firebase Firestore saat ini akan digantikan oleh isi cadangan{' '}
                      <strong className="text-slate-900">{pendingConfirm.file.name}</strong>. Pastikan Anda benar-benar ingin memulihkan arsip ini.
                    </>
                  ) : (
                    <>
                      File cadangan <strong className="text-slate-900">{pendingConfirm.file.name}</strong> akan dihapus permanen dari folder Google Drive Anda.
                    </>
                  )}
                </p>
              </div>
            </div>

            {pendingConfirm.type === 'RESTORE' && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-3 gap-2 text-center text-xs tabular-nums">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Produk</div>
                  <div className="font-extrabold text-slate-800">
                    {formatNumber(pendingConfirm.payload.stats?.productCount ?? pendingConfirm.payload.data?.products?.length ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Transaksi</div>
                  <div className="font-extrabold text-slate-800">
                    {formatNumber(pendingConfirm.payload.stats?.transactionCount ?? pendingConfirm.payload.data?.transactions?.length ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Pelanggan</div>
                  <div className="font-extrabold text-slate-800">
                    {formatNumber(pendingConfirm.payload.stats?.customerCount ?? pendingConfirm.payload.data?.customers?.length ?? 0)}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isExecutingConfirm}
                onClick={() => {
                  sound.playTap();
                  setPendingConfirm(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isExecutingConfirm}
                onClick={handleConfirmPendingAction}
                className={`px-4 py-2 rounded-xl text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  pendingConfirm.type === 'DELETE'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {isExecutingConfirm && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {pendingConfirm.type === 'RESTORE'
                    ? 'Ya, Pulihkan Data Toko'
                    : 'Ya, Hapus dari Drive'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
