'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInAnonymously,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
  AuthError,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

// ── Types ──────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  displayName: string;
  avatar: string;
  photoURL: string | null;
  isAnonymous: boolean;
  gamesPlayed: number;
  totalScore: number;
  bestScore: number;
  teamIds: string[];
}

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  isAnonymous: boolean;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<void>;
}

// ── Helpers ────────────────────────────────────────────────────────────

function getDefaultAvatar(name: string): string {
  const avatars = ['🦸', '🧙', '🤖', '👾', '🦊', '🐉', '🦅', '🐺', '🦁', '🐯'];
  const idx = (name || 'A').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatars.length;
  return avatars[idx];
}

async function upsertUserProfile(user: User, overrides?: Partial<UserProfile>): Promise<UserProfile> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const existing = snap.data() as UserProfile;
    const updated = { ...existing, ...overrides };
    if (overrides) await setDoc(ref, updated, { merge: true });
    return updated;
  }

  const name = user.displayName || overrides?.displayName || 'Anonymous';
  const fresh: UserProfile = {
    uid: user.uid,
    displayName: name,
    avatar: getDefaultAvatar(name),
    photoURL: user.photoURL ?? null,
    isAnonymous: user.isAnonymous,
    gamesPlayed: 0,
    totalScore: 0,
    bestScore: 0,
    teamIds: [],
    ...overrides,
  };
  await setDoc(ref, { ...fresh, createdAt: serverTimestamp() });
  return fresh;
}

// ── Context ────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  isAnonymous: true,
  loading: true,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  updateDisplayName: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let settled = false;

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        try {
          const p = await upsertUserProfile(firebaseUser);
          setProfile(p);
        } catch (e) {
          console.warn('[Auth] Could not sync profile:', e);
        }
      } else {
        // Auto sign-in anonymously
        try {
          await signInAnonymously(auth);
          // onAuthStateChanged will fire again with the anonymous user
        } catch (e: any) {
          // Common causes:
          // - auth/configuration-not-found → Anonymous provider not enabled in Firebase Console
          // - auth/network-request-failed  → offline
          const code = e?.code ?? '';
          if (code === 'auth/configuration-not-found') {
            console.warn(
              '[Auth] Anonymous sign-in unavailable — enable "Anonymous" provider at ' +
              'https://console.firebase.google.com → Authentication → Sign-in method'
            );
          } else {
            console.warn('[Auth] Anonymous sign-in failed:', e);
          }
          // Allow the app to continue in an unauthenticated shell
        }
      }
      if (!settled) { settled = true; setLoading(false); }
    }, (error) => {
      // onAuthStateChanged error (e.g. network failure)
      console.warn('[Auth] Auth state listener error:', error);
      if (!settled) { settled = true; setLoading(false); }
    });
    return unsub;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      if (user?.isAnonymous) {
        // Upgrade anonymous → Google (preserves UID and Firestore data)
        const result = await linkWithPopup(user, provider);
        const p = await upsertUserProfile(result.user, {
          displayName: result.user.displayName ?? undefined,
          photoURL: result.user.photoURL ?? null,
          isAnonymous: false,
        });
        setUser(result.user);
        setProfile(p);
      } else {
        const result = await signInWithPopup(auth, provider);
        const p = await upsertUserProfile(result.user, { isAnonymous: false });
        setUser(result.user);
        setProfile(p);
      }
    } catch (err) {
      const error = err as AuthError;
      if (error.code === 'auth/credential-already-in-use') {
        // Credential belongs to a different existing account — sign in directly
        const result = await signInWithPopup(auth, provider);
        const p = await upsertUserProfile(result.user, { isAnonymous: false });
        setUser(result.user);
        setProfile(p);
      } else if (error.code === 'auth/configuration-not-found') {
        throw new Error(
          'Google sign-in is not configured yet. Enable the Google provider at ' +
          'Firebase Console → Authentication → Sign-in method → Google.'
        );
      } else {
        console.error('[Auth] Google sign-in error:', error);
        throw error;
      }
    }
  }, [user]);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setProfile(null);
  }, []);

  const updateDisplayName = useCallback(async (name: string) => {
    if (!user) return;
    const p = await upsertUserProfile(user, { displayName: name, avatar: getDefaultAvatar(name) });
    setProfile(p);
    // Also persist to localStorage for socket usage
    localStorage.setItem('promptinary_name', name);
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isAnonymous: user?.isAnonymous ?? true,
      loading,
      signInWithGoogle,
      signOut,
      updateDisplayName,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
