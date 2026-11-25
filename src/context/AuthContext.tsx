import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { syncUserProfile, type UserProfile } from '../lib/firestore-service';
import { classifyFirestoreError } from '../lib/firestore-errors';

export type { UserProfile };

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function formatAuthError(err: unknown): string {
  if (!err) return 'Could not load your account profile.';
  const classified = classifyFirestoreError(err);
  if (classified.category === 'network') {
    return `${classified.title}: ${classified.message} ${classified.guidance}`;
  }
  if (classified.category === 'permission') {
    return `${classified.title}: ${classified.message} ${classified.guidance}`;
  }
  return classified.message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setAuthError(null);
      const synced = await syncUserProfile(user);
      setProfile(synced);
    } catch (err) {
      console.error('Failed to sync profile:', err);
      setProfile(null);
      setAuthError(formatAuthError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      void syncProfile(user);
    });
    return () => unsubscribe();
  }, [syncProfile]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleAuthProvider);
      // Force fresh ID token readiness, then await the single-flight profile sync
      await result.user.getIdToken();
      await syncProfile(result.user);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const msg =
        code === 'auth/popup-closed-by-user'
          ? 'Sign-in window was closed before completing authentication.'
          : code === 'auth/popup-blocked'
            ? 'Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.'
            : formatAuthError(err);
      setAuthError(msg);
      setLoading(false);
    }
  }, [syncProfile]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setProfile(null);
    setFirebaseUser(null);
    setAuthError(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) {
      await syncProfile(auth.currentUser);
    }
  }, [syncProfile]);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        authError,
        signInWithGoogle,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
