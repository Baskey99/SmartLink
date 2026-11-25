import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  KeyRound,
  LogOut,
  RefreshCw,
  ShieldAlert,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGlobalError } from '../../context/GlobalErrorContext';
import type { ClassifiedFirestoreError, FirestoreErrorCategory } from '../../lib/firestore-errors';
import { cn } from '../../lib/utils';
import { Button } from '../ui/primitives';

const CATEGORY_STYLES: Record<
  FirestoreErrorCategory,
  {
    container: string;
    iconBox: string;
    badge: string;
    title: string;
    body: string;
    guidance: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  network: {
    container:
      'border-amber-200 dark:border-amber-900/70 bg-amber-50/80 dark:bg-amber-950/30',
    iconBox: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
    badge: 'text-amber-800 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-900/50',
    title: 'text-amber-950 dark:text-amber-100',
    body: 'text-amber-900/90 dark:text-amber-200/90',
    guidance: 'text-amber-800/80 dark:text-amber-300/80',
    Icon: WifiOff,
  },
  permission: {
    container: 'border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30',
    iconBox: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    badge: 'text-red-800 dark:text-red-300 bg-red-100/90 dark:bg-red-900/50',
    title: 'text-red-950 dark:text-red-100',
    body: 'text-red-900/90 dark:text-red-200/90',
    guidance: 'text-red-800/80 dark:text-red-300/80',
    Icon: ShieldAlert,
  },
  auth: {
    container: 'border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30',
    iconBox: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    badge: 'text-red-800 dark:text-red-300 bg-red-100/90 dark:bg-red-900/50',
    title: 'text-red-950 dark:text-red-100',
    body: 'text-red-900/90 dark:text-red-200/90',
    guidance: 'text-red-800/80 dark:text-red-300/80',
    Icon: KeyRound,
  },
  quota: {
    container:
      'border-amber-200 dark:border-amber-900/70 bg-amber-50/80 dark:bg-amber-950/30',
    iconBox: 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
    badge: 'text-amber-800 dark:text-amber-300 bg-amber-100/90 dark:bg-amber-900/50',
    title: 'text-amber-950 dark:text-amber-100',
    body: 'text-amber-900/90 dark:text-amber-200/90',
    guidance: 'text-amber-800/80 dark:text-amber-300/80',
    Icon: Database,
  },
  config: {
    container: 'border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30',
    iconBox: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    badge: 'text-red-800 dark:text-red-300 bg-red-100/90 dark:bg-red-900/50',
    title: 'text-red-950 dark:text-red-100',
    body: 'text-red-900/90 dark:text-red-200/90',
    guidance: 'text-red-800/80 dark:text-red-300/80',
    Icon: Database,
  },
  unknown: {
    container: 'border-red-200 dark:border-red-900/70 bg-red-50/80 dark:bg-red-950/30',
    iconBox: 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300',
    badge: 'text-red-800 dark:text-red-300 bg-red-100/90 dark:bg-red-900/50',
    title: 'text-red-950 dark:text-red-100',
    body: 'text-red-900/90 dark:text-red-200/90',
    guidance: 'text-red-800/80 dark:text-red-300/80',
    Icon: AlertTriangle,
  },
};

const OFFLINE_FALLBACK: ClassifiedFirestoreError = {
  id: 'browser-offline',
  category: 'network',
  categoryLabel: 'Network Issue',
  title: 'You are currently offline',
  message: 'SmartLink cannot reach Cloud Firestore while your device has no internet connection.',
  guidance: 'Reconnect to Wi-Fi or cellular data to sync links, campaigns, and analytics.',
  rawError: 'Browser reported navigator.onLine === false',
  timestamp: 0,
  canRetry: true,
  requiresReauth: false,
};

export function GlobalErrorBanner() {
  const { activeError, isBrowserOffline, isRetrying, clearError, retryFailedOperations } =
    useGlobalError();
  const { logout } = useAuth();
  const location = useLocation();
  const [showDetails, setShowDetails] = useState(false);

  // Clear route-specific errors when the user navigates to another workspace section
  useEffect(() => {
    setShowDetails(false);
    clearError();
  }, [location.pathname, clearError]);

  const displayedError = isBrowserOffline ? OFFLINE_FALLBACK : activeError;
  if (!displayedError) return null;

  const style = CATEGORY_STYLES[displayedError.category];
  const Icon = style.Icon;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'mb-5 rounded-xl border p-4 sm:px-5 sm:py-4 transition-colors',
        style.container
      )}
    >
      <div className="flex items-start gap-3 sm:gap-3.5">
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg mt-0.5',
            style.iconBox
          )}
        >
          <Icon className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                style.badge
              )}
            >
              {displayedError.categoryLabel}
            </span>
            <h3 className={cn('text-sm font-semibold', style.title)}>
              {displayedError.title}
            </h3>
          </div>

          <p className={cn('text-sm leading-relaxed break-words', style.body)}>
            {displayedError.message}
          </p>
          <p className={cn('text-xs leading-relaxed', style.guidance)}>
            {displayedError.guidance}
          </p>

          <div className="pt-1.5 flex flex-wrap items-center gap-2">
            {displayedError.canRetry && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void retryFailedOperations()}
                disabled={isRetrying}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isRetrying && 'animate-spin')} />
                <span>{isRetrying ? 'Retrying...' : 'Retry'}</span>
              </Button>
            )}

            {displayedError.requiresReauth && (
              <Button variant="secondary" size="sm" onClick={() => void logout()}>
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign out &amp; sign in again</span>
              </Button>
            )}

            {(displayedError.path || displayedError.operation || displayedError.rawError) &&
              !isBrowserOffline && (
                <button
                  type="button"
                  onClick={() => setShowDetails((prev) => !prev)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium underline-offset-2 hover:underline cursor-pointer',
                    style.guidance
                  )}
                >
                  <span>{showDetails ? 'Hide details' : 'View details'}</span>
                  {showDetails ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
          </div>

          {showDetails && !isBrowserOffline && (
            <div className="mt-2 rounded-lg border border-black/10 dark:border-white/10 bg-white/70 dark:bg-slate-950/60 p-3 text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1 break-all">
              {displayedError.operation && (
                <div>
                  <span className="font-semibold">Operation:</span> {displayedError.operation}
                </div>
              )}
              {displayedError.path && (
                <div>
                  <span className="font-semibold">Path:</span> {displayedError.path}
                </div>
              )}
              <div>
                <span className="font-semibold">Error:</span> {displayedError.rawError}
              </div>
            </div>
          )}
        </div>

        {!isBrowserOffline && (
          <button
            type="button"
            onClick={clearError}
            aria-label="Dismiss error notification"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
