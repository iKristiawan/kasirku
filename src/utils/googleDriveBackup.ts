import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User as FirebaseUser,
} from 'firebase/auth';
import { auth } from '../firebase';
import { BackupPayload } from '../types/pos';

// Strictly memory-only OAuth access token cache — NEVER store in localStorage or sessionStorage
let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;

export interface GoogleDriveUserAccount {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
}

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  appProperties?: Record<string, string>;
}

export interface DriveBackupSchedule {
  enabled: boolean;
  intervalDays: 1 | 3 | 7;
  lastBackupAt?: number;
  lastBackupFileName?: string;
  lastBackupBy?: string;
}

export class DriveAuthExpiredError extends Error {
  constructor(message = 'Sesi Google Drive berakhir. Silakan masuk ulang dengan Google.') {
    super(message);
    this.name = 'DriveAuthExpiredError';
  }
}

export class DriveInsufficientScopeError extends Error {
  constructor(
    message = 'Izin akses Google Drive belum disetujui atau belum dicentang saat login Google. Silakan klik "Sign in with Google" lagi dan pastikan izin Google Drive dicentang.'
  ) {
    super(message);
    this.name = 'DriveInsufficientScopeError';
  }
}

export const REQUIRED_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FULL_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DRIVE_BACKUP_FOLDER_NAME = 'KasirKu Backup Toko';
const DRIVE_SCHEDULE_STORAGE_KEY = 'kasir_gdrive_backup_schedule_v1';

function createDriveAuthProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope(REQUIRED_DRIVE_SCOPE);
  provider.setCustomParameters({
    prompt: 'consent select_account',
    include_granted_scopes: 'true',
  });
  return provider;
}

export function scopeListIncludesDriveFile(scopeString?: string | null): boolean {
  if (!scopeString) return false;
  const scopes = scopeString
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return scopes.includes(REQUIRED_DRIVE_SCOPE) || scopes.includes(FULL_DRIVE_SCOPE);
}

export function isInsufficientScopeApiError(status: number, errJson: any): boolean {
  if (status !== 403) return false;
  const message = String(errJson?.error?.message || '');
  const reason = String(errJson?.error?.errors?.[0]?.reason || '');
  const detailsReason = Array.isArray(errJson?.error?.details)
    ? errJson.error.details.map((d: any) => String(d?.reason || '')).join(' ')
    : '';
  return (
    /insufficient.*scope/i.test(message) ||
    reason === 'insufficientPermissions' ||
    reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' ||
    detailsReason.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')
  );
}

async function verifyDriveTokenHasScope(token: string): Promise<boolean> {
  if (typeof fetch === 'undefined' || !token) return true;
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) {
      return true;
    }
    const info = await res.json();
    if (typeof info?.scope === 'string' && info.scope.trim().length > 0) {
      return scopeListIncludesDriveFile(info.scope);
    }
    return true;
  } catch {
    return true;
  }
}

const authListeners = new Set<(user: GoogleDriveUserAccount | null, hasToken: boolean) => void>();
let authWatcherInitialized = false;

function mapFirebaseUser(user: FirebaseUser | null): GoogleDriveUserAccount | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email || 'Pengguna Google',
    photoURL: user.photoURL,
  };
}

function notifyAuthListeners(): void {
  const account = mapFirebaseUser(auth.currentUser);
  const hasToken = Boolean(getActiveDriveToken());
  authListeners.forEach((cb) => {
    try {
      cb(account, hasToken);
    } catch {
      // ignore
    }
  });
}

export function ensureGoogleDriveAuthListener(): void {
  if (authWatcherInitialized) return;
  authWatcherInitialized = true;
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
      cachedTokenExpiresAt = 0;
    }
    notifyAuthListeners();
  });
}

export function subscribeGoogleDriveAuth(
  callback: (user: GoogleDriveUserAccount | null, hasToken: boolean) => void
): () => void {
  ensureGoogleDriveAuthListener();
  authListeners.add(callback);
  callback(mapFirebaseUser(auth.currentUser), Boolean(getActiveDriveToken()));
  return () => {
    authListeners.delete(callback);
  };
}

export function getActiveDriveToken(): string | null {
  if (!cachedAccessToken) return null;
  if (cachedTokenExpiresAt > 0 && Date.now() >= cachedTokenExpiresAt) {
    cachedAccessToken = null;
    cachedTokenExpiresAt = 0;
    return null;
  }
  return cachedAccessToken;
}

export function getCurrentGoogleDriveAccount(): GoogleDriveUserAccount | null {
  return mapFirebaseUser(auth.currentUser);
}

/**
 * Initiates Google Sign-In popup with Drive file scope and explicit consent prompt.
 * Verifies the granted token includes drive.file before caching in JS memory.
 */
export async function signInForGoogleDrive(): Promise<{
  account: GoogleDriveUserAccount;
  token: string;
}> {
  ensureGoogleDriveAuthListener();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Perangkat sedang offline. Hubungkan ke internet untuk masuk ke Google Drive.');
  }

  try {
    const provider = createDriveAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) {
      throw new Error('Token akses Google Drive tidak diterima. Silakan coba masuk kembali.');
    }

    const hasDriveScope = await verifyDriveTokenHasScope(token);
    if (!hasDriveScope) {
      cachedAccessToken = null;
      cachedTokenExpiresAt = 0;
      notifyAuthListeners();
      throw new DriveInsufficientScopeError();
    }

    cachedAccessToken = token;
    // Google OAuth access tokens typically last 3600s; refresh slightly early at 50 min
    cachedTokenExpiresAt = Date.now() + 50 * 60 * 1000;

    const account = mapFirebaseUser(result.user) || {
      uid: result.user.uid,
      email: result.user.email || '',
      displayName: result.user.displayName || 'Pengguna Google',
      photoURL: result.user.photoURL,
    };

    notifyAuthListeners();
    return { account, token };
  } catch (err: any) {
    if (err instanceof DriveInsufficientScopeError) {
      throw err;
    }
    const code = String(err?.code || '');
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new Error('Login Google Drive dibatalkan oleh pengguna.');
    }
    if (code === 'auth/popup-blocked') {
      throw new Error('Pop-up login diblokir oleh browser. Izinkan pop-up untuk situs ini lalu coba lagi.');
    }
    throw new Error(
      err instanceof Error ? err.message : 'Gagal menghubungkan akun Google Drive.'
    );
  }
}

export async function disconnectGoogleDrive(): Promise<void> {
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
  try {
    await auth.signOut();
  } catch {
    // ignore signout errors
  }
  notifyAuthListeners();
}

async function driveFetch(
  url: string,
  token: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    cachedAccessToken = null;
    cachedTokenExpiresAt = 0;
    notifyAuthListeners();
    throw new DriveAuthExpiredError();
  }

  if (!response.ok) {
    let errDetail = `HTTP ${response.status}`;
    let errJson: any = null;
    try {
      errJson = await response.json();
      if (errJson?.error?.message) {
        errDetail = errJson.error.message;
      }
    } catch {
      // ignore non-json error response
    }

    if (isInsufficientScopeApiError(response.status, errJson)) {
      cachedAccessToken = null;
      cachedTokenExpiresAt = 0;
      notifyAuthListeners();
      throw new DriveInsufficientScopeError();
    }

    throw new Error(`Google Drive error: ${errDetail}`);
  }

  return response;
}

/**
 * Finds or creates the dedicated "KasirKu Backup Toko" folder in the user's Google Drive.
 */
export async function ensureKasirKuDriveFolder(token: string): Promise<string> {
  const query = encodeURIComponent(
    `name='${DRIVE_BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    token
  );
  const data = await res.json();
  if (Array.isArray(data?.files) && data.files.length > 0 && data.files[0]?.id) {
    return data.files[0].id as string;
  }

  const createRes = await driveFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id,name',
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: DRIVE_BACKUP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        appProperties: {
          app: 'KasirKuPOS',
          type: 'backup-folder',
        },
      }),
    }
  );
  const created = await createRes.json();
  if (!created?.id) {
    throw new Error('Gagal membuat folder cadangan di Google Drive.');
  }
  return created.id as string;
}

/**
 * Lists backup JSON files created by this app inside the "KasirKu Backup Toko" folder, newest first.
 */
export async function listGoogleDriveBackups(token: string): Promise<DriveBackupFile[]> {
  const folderId = await ensureKasirKuDriveFolder(token);
  const query = encodeURIComponent(
    `'${folderId}' in parents and mimeType='application/json' and trashed=false`
  );
  const fields = encodeURIComponent(
    'files(id,name,createdTime,modifiedTime,size,appProperties)'
  );
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime%20desc&pageSize=25&fields=${fields}`,
    token
  );
  const data = await res.json();
  return Array.isArray(data?.files) ? (data.files as DriveBackupFile[]) : [];
}

/**
 * Uploads a BackupPayload JSON file into "KasirKu Backup Toko" via multipart upload.
 */
export async function uploadGoogleDriveBackup(
  token: string,
  fileName: string,
  payload: BackupPayload
): Promise<DriveBackupFile> {
  const folderId = await ensureKasirKuDriveFolder(token);
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
    description: `Cadangan data toko ${payload.data.storeSettings?.storeName || 'KasirKu'} (${payload.exportedAt})`,
    appProperties: {
      app: 'KasirKuPOS',
      storeName: String(payload.data.storeSettings?.storeName || 'KasirKu').slice(0, 60),
      productCount: String(payload.stats?.productCount ?? payload.data.products?.length ?? 0),
      transactionCount: String(payload.stats?.transactionCount ?? payload.data.transactions?.length ?? 0),
      customerCount: String(payload.stats?.customerCount ?? payload.data.customers?.length ?? 0),
      exportedAt: payload.exportedAt,
    },
  };

  const boundary = `kasirku_drive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const jsonContent = JSON.stringify(payload, null, 2);
  const multipartBody =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${jsonContent}\r\n` +
    `--${boundary}--`;

  const fields = encodeURIComponent(
    'id,name,createdTime,modifiedTime,size,appProperties'
  );
  const res = await driveFetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}`,
    token,
    {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartBody,
    }
  );

  return (await res.json()) as DriveBackupFile;
}

/**
 * Downloads and parses a JSON backup file from Google Drive.
 */
export async function downloadGoogleDriveBackup(
  token: string,
  fileId: string
): Promise<BackupPayload> {
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    token
  );
  const parsed = (await res.json()) as BackupPayload;
  if (!parsed || !parsed.data || !Array.isArray(parsed.data.products)) {
    throw new Error('Format file cadangan di Google Drive tidak valid atau rusak.');
  }
  return parsed;
}

/**
 * Deletes a backup file from Google Drive permanently.
 */
export async function deleteGoogleDriveBackup(
  token: string,
  fileId: string
): Promise<void> {
  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    token,
    {
      method: 'DELETE',
    }
  );
}

// =========================================================================
// NON-SENSITIVE SCHEDULE & REMINDER PREFERENCES (localStorage metadata only)
// =========================================================================

const DEFAULT_SCHEDULE: DriveBackupSchedule = {
  enabled: true,
  intervalDays: 3,
};

export function getDriveBackupSchedule(): DriveBackupSchedule {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_SCHEDULE };
  }
  try {
    const raw = window.localStorage.getItem(DRIVE_SCHEDULE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SCHEDULE };
    const parsed = JSON.parse(raw) as Partial<DriveBackupSchedule>;
    const interval: 1 | 3 | 7 =
      parsed.intervalDays === 1 || parsed.intervalDays === 3 || parsed.intervalDays === 7
        ? parsed.intervalDays
        : 3;
    return {
      enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : true,
      intervalDays: interval,
      lastBackupAt: typeof parsed.lastBackupAt === 'number' ? parsed.lastBackupAt : undefined,
      lastBackupFileName:
        typeof parsed.lastBackupFileName === 'string' ? parsed.lastBackupFileName : undefined,
      lastBackupBy: typeof parsed.lastBackupBy === 'string' ? parsed.lastBackupBy : undefined,
    };
  } catch {
    return { ...DEFAULT_SCHEDULE };
  }
}

export function saveDriveBackupSchedule(schedule: DriveBackupSchedule): DriveBackupSchedule {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(DRIVE_SCHEDULE_STORAGE_KEY, JSON.stringify(schedule));
    } catch {
      // ignore storage quota errors
    }
  }
  return schedule;
}

export function recordDriveBackupCompleted(
  fileName: string,
  actorName?: string
): DriveBackupSchedule {
  const current = getDriveBackupSchedule();
  return saveDriveBackupSchedule({
    ...current,
    lastBackupAt: Date.now(),
    lastBackupFileName: fileName,
    lastBackupBy: actorName || current.lastBackupBy,
  });
}

export function isDriveBackupOverdue(schedule: DriveBackupSchedule): boolean {
  if (!schedule.enabled) return false;
  if (!schedule.lastBackupAt) return true;
  const elapsedMs = Date.now() - schedule.lastBackupAt;
  return elapsedMs > schedule.intervalDays * 24 * 60 * 60 * 1000;
}
