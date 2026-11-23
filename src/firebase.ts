import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, initializeFirestore, Firestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const typedConfig = firebaseConfig as {
  projectId?: string;
  firestoreDatabaseId?: string;
};

export const firebaseProjectId = typedConfig.projectId || '(unknown)';
export const firebaseDatabaseId =
  typedConfig.firestoreDatabaseId && typedConfig.firestoreDatabaseId !== '(default)'
    ? typedConfig.firestoreDatabaseId
    : '(default)';

// Initialize Firestore with automatic long-polling detection for Android WebViews & restricted networks
let db: Firestore;
const configuredDbId =
  typedConfig.firestoreDatabaseId && typedConfig.firestoreDatabaseId !== '(default)'
    ? typedConfig.firestoreDatabaseId
    : undefined;

try {
  db = initializeFirestore(
    app,
    { experimentalAutoDetectLongPolling: true },
    configuredDbId
  );
} catch {
  try {
    db = configuredDbId ? getFirestore(app, configuredDbId) : getFirestore(app);
  } catch (e) {
    console.warn('Fallback to default firestore instance:', e);
    db = getFirestore(app);
  }
}

const auth = getAuth(app);

export { app, db, auth };
export default app;
