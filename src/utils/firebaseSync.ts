import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  getDocs,
  getDocFromServer,
  enableNetwork,
  disableNetwork
} from 'firebase/firestore';
import { auth, db } from '../firebase';

export type CloudSyncStatus = 'INITIALIZING' | 'SYNCED' | 'CONNECTING' | 'OFFLINE' | 'ERROR';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let cloudSyncPaused = false;

export function isCloudSyncPaused(): boolean {
  return cloudSyncPaused;
}

export function setCloudSyncPaused(paused: boolean): void {
  cloudSyncPaused = paused;
}

/**
 * Pauses Firestore network synchronization and switches Firestore client to Local Only mode
 */
export async function pauseFirestoreCloudSync(): Promise<void> {
  cloudSyncPaused = true;
  try {
    await disableNetwork(db);
  } catch (error) {
    console.warn('[FirebaseSync] Notice while disabling Firestore network:', error);
  }
}

/**
 * Resumes Firestore network synchronization for real-time multi-device updates
 */
export async function resumeFirestoreCloudSync(): Promise<void> {
  cloudSyncPaused = false;
  try {
    await enableNetwork(db);
  } catch (error) {
    console.warn('[FirebaseSync] Notice while enabling Firestore network:', error);
  }
}

/**
 * Tests direct server connectivity to Firebase Firestore
 */
export async function testFirestoreConnection(): Promise<boolean> {
  if (cloudSyncPaused) return false;
  try {
    await getDocFromServer(doc(db, 'settings', 'store_config'));
    return true;
  } catch (error) {
    console.warn('[FirebaseSync] Connection test notice:', error);
    return false;
  }
}

/**
 * Seeds a Firestore collection if it's empty so all connected devices immediately have base data
 */
export async function seedCollectionIfEmpty<T extends { id: string }>(
  collectionName: string, 
  defaultItems: T[]
): Promise<void> {
  if (cloudSyncPaused) return;
  // If the user has explicitly emptied their database to start from scratch, do not auto-seed!
  try {
    if (typeof window !== 'undefined' && localStorage.getItem('kasir_db_cleared_by_user') === 'true') {
      return;
    }
  } catch {}

  try {
    const colRef = collection(db, collectionName);
    const snap = await getDocs(colRef);
    if (snap.empty && defaultItems.length > 0) {
      const batch = writeBatch(db);
      defaultItems.forEach((item) => {
        const docRef = doc(db, collectionName, item.id);
        batch.set(docRef, item);
      });
      await batch.commit();
      console.log(`[FirebaseSync] Seeded ${defaultItems.length} records into ${collectionName}`);
    }
  } catch (err) {
    console.warn(`[FirebaseSync] Could not seed collection ${collectionName}:`, err);
  }
}

/**
 * Empties all operational collections in Firestore:
 * - products, categories, customers, suppliers, transactions, stock_opnames, attendances, cashflows, online_orders
 * And resets the 'users' collection to standard: only 1 Admin user with PIN 1234 and ADMIN privilege.
 */
export async function clearAllDatabaseExceptUsers(adminUser?: {
  id: string;
  name: string;
  pin: string;
  role: string;
  avatarColor: string;
}): Promise<void> {
  const collectionsToClear = [
    'products',
    'categories',
    'customers',
    'suppliers',
    'purchases',
    'transactions',
    'stock_opnames',
    'attendances',
    'cashflows',
    'online_orders',
    'activity_logs',
  ];

  const standardAdmin = adminUser || {
    id: 'user_admin',
    name: 'Admin',
    pin: '1234',
    role: 'ADMIN',
    avatarColor: 'bg-indigo-600',
  };

  try {
    // 1. Clear operational collections independently so an issue on one does not block others
    for (const colName of collectionsToClear) {
      try {
        const colRef = collection(db, colName);
        const snapshot = await getDocs(colRef);
        if (!snapshot.empty) {
          const docs = snapshot.docs;
          // Attempt chunked batch deletion
          for (let i = 0; i < docs.length; i += 400) {
            const chunk = docs.slice(i, i + 400);
            try {
              const batch = writeBatch(db);
              chunk.forEach((docSnap) => {
                batch.delete(docSnap.ref);
              });
              await batch.commit();
            } catch (batchErr) {
              console.warn(`[FirebaseSync] Batch delete failed for ${colName}, falling back to single deleteDoc:`, batchErr);
              // Fallback to individual deletions
              for (const docSnap of chunk) {
                try {
                  await deleteDoc(docSnap.ref);
                } catch (delErr) {
                  console.error(`[FirebaseSync] Failed to delete doc ${docSnap.id} in ${colName}:`, delErr);
                }
              }
            }
          }
          console.log(`[FirebaseSync] Successfully emptied collection: ${colName} (${docs.length} docs)`);
        }
      } catch (colErr) {
        console.warn(`[FirebaseSync] Notice while clearing collection ${colName}:`, colErr);
      }
    }

    // 2. Reset users collection: remove all other users, set single standard Admin
    try {
      const usersCol = collection(db, 'users');
      const userSnap = await getDocs(usersCol);
      if (!userSnap.empty) {
        const docs = userSnap.docs;
        for (let i = 0; i < docs.length; i += 400) {
          const chunk = docs.slice(i, i + 400);
          try {
            const batch = writeBatch(db);
            chunk.forEach((docSnap) => {
              batch.delete(docSnap.ref);
            });
            await batch.commit();
          } catch {
            for (const docSnap of chunk) {
              try { await deleteDoc(docSnap.ref); } catch {}
            }
          }
        }
      }

      // Write the single standard admin document
      const adminDocRef = doc(db, 'users', standardAdmin.id);
      await setDoc(adminDocRef, sanitizeForFirestore(standardAdmin));
    } catch (userErr) {
      console.warn('[FirebaseSync] Notice while resetting users collection:', userErr);
    }

    console.log('[FirebaseSync] All operational collections cleared. Users reset to standard Admin (PIN: 1234).');
  } catch (err) {
    console.warn('[FirebaseSync] Notice in clearAllDatabaseExceptUsers:', err);
    throw err;
  }
}

/**
 * Subscribes to real-time updates for a collection using onSnapshot.
 * Returns an unsubscribe function.
 */
export function subscribeToCollection<T extends { id: string }>(
  collectionName: string,
  onData: (items: T[]) => void,
  onError?: (error: Error) => void
): () => void {
  const colRef = collection(db, collectionName);
  
  const unsubscribe = onSnapshot(
    colRef,
    (snapshot) => {
      const items: T[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as T), id: docSnap.id });
      });
      onData(items);
    },
    (error) => {
      console.warn(`[FirebaseSync] onSnapshot error on ${collectionName}:`, error);
      if (onError) onError(error);
    }
  );

  return unsubscribe;
}

// Fast recursive helper to convert undefined values to null without JSON.parse/stringify main-thread blocking
function sanitizeForFirestore<T>(data: T): any {
  if (data === undefined || data === null) return null;
  if (typeof data !== 'object') {
    return typeof data === 'number' && !Number.isFinite(data) ? null : data;
  }
  if (data instanceof Date) {
    return data.toISOString();
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item));
  }
  const result: Record<string, any> = {};
  for (const key of Object.keys(data as Record<string, any>)) {
    const val = (data as Record<string, any>)[key];
    result[key] = val === undefined ? null : sanitizeForFirestore(val);
  }
  return result;
}

/**
 * Saves or updates a document in Firestore
 */
export async function saveDocumentToFirestore<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  if (cloudSyncPaused) return;
  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, sanitizeForFirestore(data), { merge: true });
  } catch (err) {
    console.error(`[FirebaseSync] Failed to save doc ${docId} in ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Deletes a document from Firestore
 */
export async function deleteDocumentFromFirestore(
  collectionName: string,
  docId: string
): Promise<void> {
  if (cloudSyncPaused) return;
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error(`[FirebaseSync] Failed to delete doc ${docId} from ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Batch updates multiple documents in a collection (chunked into max 400 writes per Firestore batch)
 */
export async function saveBatchToFirestore<T extends { id: string }>(
  collectionName: string,
  items: T[]
): Promise<void> {
  if (cloudSyncPaused || !items || items.length === 0) return;
  try {
    const CHUNK_SIZE = 400;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((item) => {
        const docRef = doc(db, collectionName, item.id);
        batch.set(docRef, sanitizeForFirestore(item), { merge: true });
      });
      await batch.commit();
    }
  } catch (err) {
    console.error(`[FirebaseSync] Batch update failed for ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Replaces all documents in a Firestore collection with the provided items.
 * Deletes existing documents not present in items, then writes/overwrites the restored items.
 */
export async function replaceCollectionInFirestore<T extends { id: string }>(
  collectionName: string,
  items: T[]
): Promise<void> {
  if (cloudSyncPaused) return;
  const safeItems = Array.isArray(items) ? items : [];
  const nextIds = new Set(safeItems.map((item) => item.id));

  try {
    const colRef = collection(db, collectionName);
    const existingSnap = await getDocs(colRef);
    const docsToDelete = existingSnap.docs.filter((docSnap) => !nextIds.has(docSnap.id));

    const CHUNK_SIZE = 400;
    for (let i = 0; i < docsToDelete.length; i += CHUNK_SIZE) {
      const chunk = docsToDelete.slice(i, i + CHUNK_SIZE);
      try {
        const batch = writeBatch(db);
        chunk.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      } catch (batchDelErr) {
        console.warn(`[FirebaseSync] Batch delete fallback for ${collectionName}:`, batchDelErr);
        for (const docSnap of chunk) {
          try {
            await deleteDoc(docSnap.ref);
          } catch (delErr) {
            console.warn(`[FirebaseSync] Could not delete ${docSnap.id} in ${collectionName}:`, delErr);
          }
        }
      }
    }

    for (let i = 0; i < safeItems.length; i += CHUNK_SIZE) {
      const chunk = safeItems.slice(i, i + CHUNK_SIZE);
      try {
        const batch = writeBatch(db);
        chunk.forEach((item) => {
          const docRef = doc(db, collectionName, item.id);
          batch.set(docRef, sanitizeForFirestore(item));
        });
        await batch.commit();
      } catch (batchWriteErr) {
        console.warn(`[FirebaseSync] Batch write fallback for ${collectionName}:`, batchWriteErr);
        for (const item of chunk) {
          try {
            const docRef = doc(db, collectionName, item.id);
            await setDoc(docRef, sanitizeForFirestore(item));
          } catch (writeErr) {
            console.warn(`[FirebaseSync] Could not restore doc ${item.id} in ${collectionName}:`, writeErr);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[FirebaseSync] Failed to replace collection ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Saves store settings singleton document
 */
export async function saveStoreSettingsToFirestore(
  settings: Record<string, any>,
  replace = false
): Promise<void> {
  if (cloudSyncPaused) return;
  try {
    const docRef = doc(db, 'settings', 'store_config');
    await setDoc(docRef, sanitizeForFirestore(settings), { merge: !replace });
  } catch (err) {
    console.error('[FirebaseSync] Failed to save store settings:', err);
    throw err;
  }
}

export type FirebaseMailDeliveryState = 'QUEUED' | 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';

export interface FirebaseMailDeliveryUpdate {
  mailId: string;
  state: FirebaseMailDeliveryState;
  error?: string;
}

export interface SendReceiptEmailPayload {
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  transactionId: string;
  invoiceNumber: string;
  storeName: string;
  customerName?: string;
  finalAmount: number;
}

/**
 * Triggers a transactional receipt email by writing to the Firebase Trigger Email (`mail`) collection.
 */
export async function sendReceiptEmailViaFirebase(
  payload: SendReceiptEmailPayload
): Promise<string> {
  if (cloudSyncPaused) {
    throw new Error('Mode Offline manual sedang aktif. Nonaktifkan mode offline agar pengiriman email Firebase dapat berjalan.');
  }

  const cleanEmail = payload.toEmail.trim().toLowerCase();
  const mailId = `mail_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const path = `mail/${mailId}`;

  const mailDoc = {
    id: mailId,
    to: [cleanEmail],
    message: {
      subject: payload.subject.slice(0, 200),
      text: payload.textBody.slice(0, 20000),
      html: payload.htmlBody.slice(0, 60000),
    },
    metadata: {
      transactionId: payload.transactionId,
      invoiceNumber: payload.invoiceNumber,
      storeName: payload.storeName,
      customerName: payload.customerName || 'Pelanggan Umum',
      finalAmount: payload.finalAmount,
    },
    createdAt: Date.now(),
  };

  try {
    const docRef = doc(db, 'mail', mailId);
    await setDoc(docRef, sanitizeForFirestore(mailDoc));
    return mailId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

/**
 * Listens for live Firebase Trigger Email extension `delivery.state` updates on a queued mail doc.
 */
export function subscribeMailDeliveryStatus(
  mailId: string,
  onUpdate: (status: FirebaseMailDeliveryUpdate) => void
): () => void {
  const docRef = doc(db, 'mail', mailId);
  return onSnapshot(
    docRef,
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as {
        delivery?: {
          state?: string;
          error?: string;
        };
      };
      const rawState = String(data?.delivery?.state || '').toUpperCase();
      let state: FirebaseMailDeliveryState = 'QUEUED';
      if (rawState === 'PENDING') state = 'PENDING';
      else if (rawState === 'PROCESSING') state = 'PROCESSING';
      else if (rawState === 'SUCCESS') state = 'SUCCESS';
      else if (rawState === 'ERROR') state = 'ERROR';

      onUpdate({
        mailId,
        state,
        error: data?.delivery?.error ? String(data.delivery.error) : undefined,
      });
    },
    (err) => {
      console.warn('[FirebaseSync] Mail status snapshot notice:', err);
    }
  );
}

