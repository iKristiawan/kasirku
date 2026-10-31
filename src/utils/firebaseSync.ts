import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  getDocs,
  enableNetwork,
  disableNetwork
} from 'firebase/firestore';
import { db } from '../firebase';

export type CloudSyncStatus = 'INITIALIZING' | 'SYNCED' | 'CONNECTING' | 'OFFLINE' | 'ERROR';

/**
 * Seeds a Firestore collection if it's empty so all connected devices immediately have base data
 */
export async function seedCollectionIfEmpty<T extends { id: string }>(
  collectionName: string, 
  defaultItems: T[]
): Promise<void> {
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

/**
 * Saves or updates a document in Firestore
 */
export async function saveDocumentToFirestore<T extends Record<string, any>>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  try {
    const docRef = doc(db, collectionName, docId);
    await setDoc(docRef, data, { merge: true });
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
  try {
    const docRef = doc(db, collectionName, docId);
    await deleteDoc(docRef);
  } catch (err) {
    console.error(`[FirebaseSync] Failed to delete doc ${docId} from ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Batch updates multiple documents in a collection (e.g. inventory deductions, bulk stock opname)
 */
export async function saveBatchToFirestore<T extends { id: string }>(
  collectionName: string,
  items: T[]
): Promise<void> {
  if (!items || items.length === 0) return;
  try {
    const batch = writeBatch(db);
    items.forEach((item) => {
      const docRef = doc(db, collectionName, item.id);
      batch.set(docRef, item, { merge: true });
    });
    await batch.commit();
  } catch (err) {
    console.error(`[FirebaseSync] Batch update failed for ${collectionName}:`, err);
    throw err;
  }
}

/**
 * Saves store settings singleton document
 */
export async function saveStoreSettingsToFirestore(settings: Record<string, any>): Promise<void> {
  try {
    const docRef = doc(db, 'settings', 'store_config');
    await setDoc(docRef, settings, { merge: true });
  } catch (err) {
    console.error('[FirebaseSync] Failed to save store settings:', err);
    throw err;
  }
}
