import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiRequest, setMemoryIdToken } from '../lib/api';

export interface UserProfile {
  id: string;
  firebaseUid: string;
  fullName: string;
  email: string;
  role: 'super_admin' | 'admin' | 'user';
  status: 'active' | 'inactive';
  avatarUrl: string | null;
  createdAt: string;
}

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setMemoryIdToken(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      setAuthError(null);
      const token = await user.getIdToken();
      setMemoryIdToken(token);
      const data = await apiRequest<{ profile: UserProfile }>('/api/auth/profile');
      setProfile(data.profile);
    } catch (err) {
      console.error('Failed to sync profile:', err);
      setProfile(null);
      setAuthError((err as Error).message || 'Could not load your account profile.');
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
      await syncProfile(result.user);
    } catch (err) {
      const msg = (err as { code?: string; message?: string })?.code === 'auth/popup-closed-by-user'
        ? 'Sign-in window was closed before completing authentication.'
        : (err as Error).message || 'Sign-in failed. Please try again.';
      setAuthError(msg);
      setLoading(false);
    }
  }, [syncProfile]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setMemoryIdToken(null);
    setProfile(null);
    setFirebaseUser(null);
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
