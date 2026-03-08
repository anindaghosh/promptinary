import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Only fully initialize when we have a real API key (not during build-time prerendering)
const isConfigured = !!firebaseConfig.apiKey;

let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _db: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

function getFirebaseApp(): FirebaseApp | null {
  if (!isConfigured) return null;
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  return _app;
}

// Lazy getters — safe to import in SSR/build without a valid API key
export function getFirebaseAuth(): Auth {
  if (!_auth) {
    const app = getFirebaseApp();
    if (!app) throw new Error('Firebase not configured: set NEXT_PUBLIC_FIREBASE_* env vars');
    _auth = getAuth(app);
  }
  return _auth;
}

export function getFirebaseDb(): Firestore {
  if (!_db) {
    const app = getFirebaseApp();
    if (!app) throw new Error('Firebase not configured: set NEXT_PUBLIC_FIREBASE_* env vars');
    _db = getFirestore(app);
  }
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!_storage) {
    const app = getFirebaseApp();
    if (!app) throw new Error('Firebase not configured: set NEXT_PUBLIC_FIREBASE_* env vars');
    _storage = getStorage(app);
  }
  return _storage;
}

// Convenience aliases for code that runs only on client (inside useEffect / event handlers)
export const auth    = new Proxy({} as Auth,          { get: (_, k) => Reflect.get(getFirebaseAuth(),    k) });
export const db      = new Proxy({} as Firestore,     { get: (_, k) => Reflect.get(getFirebaseDb(),      k) });
export const storage = new Proxy({} as FirebaseStorage, { get: (_, k) => Reflect.get(getFirebaseStorage(), k) });

export default { getApp: getFirebaseApp };
