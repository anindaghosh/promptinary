import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isConfigured = !!firebaseConfig.apiKey;

// Lazy singleton — safe to import in SSR/build without env vars
let _app: ReturnType<typeof initializeApp> | null = null;

function getFirebaseApp() {
  if (!isConfigured) return null;
  if (_app) return _app;
  _app = getApps().length ? getApp() : initializeApp(firebaseConfig as Record<string, string>);
  return _app;
}

// Proxy-based lazy getters so module evaluation never calls Firebase APIs during SSR
export const db = new Proxy({} as ReturnType<typeof getFirestore>, {
  get: (_, k) => Reflect.get(getFirestore(getFirebaseApp()!), k),
});

export const auth = new Proxy({} as ReturnType<typeof getAuth>, {
  get: (_, k) => Reflect.get(getAuth(getFirebaseApp()!), k),
});

export default { getFirebaseApp };
