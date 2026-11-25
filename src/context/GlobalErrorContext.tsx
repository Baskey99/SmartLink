import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  classifyFirestoreError,
  isLikelyFirestoreOrNetworkError,
  type ClassifiedFirestoreError,
} from '../lib/firestore-errors';

export type ErrorSource = 'query' | 'mutation' | 'auth' | 'runtime';

type ErrorListener = (error: unknown, source: ErrorSource) => void;

const listeners = new Set<ErrorListener>();

/**
 * Publishes an error from outside the React tree (e.g. TanStack QueryCache / MutationCache)
 * into the active GlobalErrorProvider so the AppShell can display actionable feedback.
 */
export function publishGlobalError(error: unknown, source: ErrorSource = 'runtime'): void {
  for (const listener of listeners) {
    listener(error, source);
  }
}

interface GlobalErrorContextValue {
  activeError: ClassifiedFirestoreError | null;
  isBrowserOffline: boolean;
  isRetrying: boolean;
  reportError: (error: unknown, source?: ErrorSource) => ClassifiedFirestoreError;
  clearError: () => void;
  retryFailedOperations: () => Promise<void>;
}

const GlobalErrorContext = createContext<GlobalErrorContextValue | null>(null);

export function GlobalErrorProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [activeError, setActiveError] = useState<ClassifiedFirestoreError | null>(null);
  const [isBrowserOffline, setIsBrowserOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine === false : false
  );
  const [isRetrying, setIsRetrying] = useState(false);

  // Deduplicate identical error toasts within a short burst window (e.g. parallel dashboard queries)
  const lastReportedRef = useRef<{ id: string; at: number } | null>(null);

  const reportError = useCallback(
    (error: unknown, source: ErrorSource = 'runtime'): ClassifiedFirestoreError => {
      const classified = classifyFirestoreError(error);
      const now = Date.now();
      const prev = lastReportedRef.current;
      const isDuplicateBurst = prev !== null && prev.id === classified.id && now - prev.at < 4000;

      lastReportedRef.current = { id: classified.id, at: now };

      // Surface banner in AppShell for Firestore/network/permission/auth/quota/config failures
      if (
        classified.category !== 'unknown' ||
        source === 'query' ||
        isLikelyFirestoreOrNetworkError(error)
      ) {
        setActiveError(classified);
      }

      // Show a crisp, non-spammy toast for network/permission/quota/config issues so users get immediate feedback
      if (!isDuplicateBurst && (classified.category === 'network' || classified.category === 'permission' || classified.category === 'quota')) {
        toast.error(classified.title, {
          id: classified.id,
          description: classified.message,
        });
      }

      return classified;
    },
    []
  );

  const clearError = useCallback(() => {
    setActiveError(null);
  }, []);

  const retryFailedOperations = useCallback(async () => {
    setIsRetrying(true);
    try {
      setActiveError(null);
      const erroredQueries = queryClient
        .getQueryCache()
        .getAll()
        .filter((q) => q.state.status === 'error');

      if (erroredQueries.length > 0) {
        await Promise.allSettled(
          erroredQueries.map((q) =>
            queryClient.refetchQueries({ queryKey: q.queryKey, exact: true })
          )
        );
      } else {
        await queryClient.refetchQueries({ type: 'active' });
      }
    } finally {
      setIsRetrying(false);
    }
  }, [queryClient]);

  // Subscribe to external error publications (QueryCache / MutationCache)
  useEffect(() => {
    const handler: ErrorListener = (err, source) => {
      reportError(err, source);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, [reportError]);

  // Listen for browser online/offline transitions
  useEffect(() => {
    const handleOffline = () => {
      setIsBrowserOffline(true);
      toast.warning('You are offline', {
        id: 'browser-offline',
        description: 'Changes cannot be saved to Cloud Firestore until your connection returns.',
      });
    };

    const handleOnline = () => {
      setIsBrowserOffline(false);
      toast.success('Connection restored', {
        id: 'browser-offline',
        description: 'Reconnecting to Cloud Firestore and refreshing data.',
      });
      setActiveError((prev) => (prev?.category === 'network' ? null : prev));
      void queryClient.refetchQueries({
        predicate: (q) => q.state.status === 'error',
      });
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [queryClient]);

  // Catch unhandled Firestore promise rejections that bypassed React Query
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (isLikelyFirestoreOrNetworkError(event.reason)) {
        reportError(event.reason, 'runtime');
      }
    };
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, [reportError]);

  return (
    <GlobalErrorContext.Provider
      value={{
        activeError,
        isBrowserOffline,
        isRetrying,
        reportError,
        clearError,
        retryFailedOperations,
      }}
    >
      {children}
    </GlobalErrorContext.Provider>
  );
}

export function useGlobalError() {
  const ctx = useContext(GlobalErrorContext);
  if (!ctx) {
    throw new Error('useGlobalError must be used inside GlobalErrorProvider');
  }
  return ctx;
}
