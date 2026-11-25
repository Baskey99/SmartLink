export type FirestoreErrorCategory =
  | 'network'
  | 'permission'
  | 'auth'
  | 'quota'
  | 'config'
  | 'unknown';

export interface ParsedFirestorePayload {
  error?: string;
  operationType?: string;
  path?: string | null;
  authInfo?: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

export interface ClassifiedFirestoreError {
  id: string;
  category: FirestoreErrorCategory;
  categoryLabel: string;
  title: string;
  message: string;
  guidance: string;
  operation?: string;
  path?: string;
  rawError: string;
  timestamp: number;
  canRetry: boolean;
  requiresReauth: boolean;
}

const COLLECTION_LABELS: Record<string, string> = {
  users: 'user profile',
  smartLinks: 'smart links',
  campaigns: 'campaigns',
  publicLinks: 'public link routes',
  clickEvents: 'click analytics',
  supportedApps: 'supported apps',
  appSettings: 'workspace settings',
  admins: 'administrator access',
};

const OPERATION_LABELS: Record<string, string> = {
  get: 'reading',
  list: 'loading',
  create: 'creating',
  update: 'updating',
  delete: 'deleting',
  write: 'saving',
};

function describePath(path?: string | null): string | null {
  if (!path) return null;
  const root = path.split('/').filter(Boolean)[0];
  if (!root) return null;
  return COLLECTION_LABELS[root] || root;
}

function tryParseStructuredPayload(input: string): ParsedFirestorePayload | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(trimmed) as ParsedFirestorePayload;
    if (parsed && typeof parsed === 'object' && typeof parsed.error === 'string') {
      return parsed;
    }
  } catch {
    // Not structured JSON
  }
  return null;
}

function extractRawMessageAndCode(error: unknown): {
  rawMessage: string;
  code: string;
  payload: ParsedFirestorePayload | null;
} {
  if (!error) {
    return { rawMessage: 'An unexpected database error occurred.', code: '', payload: null };
  }

  if (typeof error === 'string') {
    const payload = tryParseStructuredPayload(error);
    return {
      rawMessage: payload?.error || error,
      code: '',
      payload,
    };
  }

  const errObj = error as { message?: unknown; code?: unknown };
  const messageStr =
    typeof errObj.message === 'string'
      ? errObj.message
      : error instanceof Error
        ? error.message
        : String(error);
  const codeStr = typeof errObj.code === 'string' ? errObj.code.toLowerCase() : '';
  const payload = tryParseStructuredPayload(messageStr);

  return {
    rawMessage: payload?.error || messageStr || 'An unexpected database error occurred.',
    code: codeStr,
    payload,
  };
}

export function classifyFirestoreError(error: unknown): ClassifiedFirestoreError {
  const { rawMessage, code, payload } = extractRawMessageAndCode(error);
  const lower = rawMessage.toLowerCase();
  const timestamp = Date.now();
  const operation = payload?.operationType;
  const path = payload?.path || undefined;
  const opVerb = operation ? OPERATION_LABELS[operation.toLowerCase()] || operation : null;
  const resourceLabel = describePath(path);
  const actionSummary =
    opVerb && resourceLabel
      ? `${opVerb} ${resourceLabel}`
      : resourceLabel
        ? `accessing ${resourceLabel}`
        : 'completing this Firestore operation';

  const isBrowserOffline =
    typeof navigator !== 'undefined' && navigator.onLine === false;

  // 1. Network / Connectivity / Offline Errors
  if (
    isBrowserOffline ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded') ||
    code.includes('network-request-failed') ||
    lower.includes('client is offline') ||
    lower.includes('could not reach cloud firestore') ||
    lower.includes('failed to get document because the client is offline') ||
    lower.includes('network error') ||
    lower.includes('failed to fetch') ||
    lower.includes('network-request-failed') ||
    lower.includes('unavailable') ||
    lower.includes('timeout') ||
    lower.includes('deadline exceeded')
  ) {
    return {
      id: `network:${path || 'global'}`,
      category: 'network',
      categoryLabel: 'Network Issue',
      title: isBrowserOffline ? 'You are offline' : 'Unable to reach Cloud Firestore',
      message: isBrowserOffline
        ? `Your device lost its internet connection while ${actionSummary}.`
        : `A network issue prevented ${actionSummary}. Cloud Firestore could not be reached.`,
      guidance: isBrowserOffline
        ? 'Reconnect to Wi-Fi or mobile data. SmartLink will automatically retry when your connection returns.'
        : 'Check your internet connection, VPN, or firewall settings, then click Retry.',
      operation,
      path,
      rawError: rawMessage,
      timestamp,
      canRetry: true,
      requiresReauth: false,
    };
  }

  // 2. Permission Denied / Firestore Security Rules Errors
  if (
    code.includes('permission-denied') ||
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied') ||
    lower.includes('permission_denied') ||
    lower.includes('insufficient permissions')
  ) {
    return {
      id: `permission:${operation || 'op'}:${path || 'global'}`,
      category: 'permission',
      categoryLabel: 'Permission Error',
      title: 'Access denied by Firestore permissions',
      message: `Your account does not have permission for ${actionSummary}.`,
      guidance:
        'Verify you are signed in with the right account and that you own this record. If this persists, sign out and sign back in or verify your Firestore security rules.',
      operation,
      path,
      rawError: rawMessage,
      timestamp,
      canRetry: true,
      requiresReauth: true,
    };
  }

  // 3. Authentication / Session Errors
  if (
    code.includes('unauthenticated') ||
    code.includes('auth/') ||
    lower.includes('unauthenticated') ||
    lower.includes('verify your email') ||
    lower.includes('deactivated') ||
    lower.includes('session') ||
    lower.includes('token')
  ) {
    return {
      id: `auth:${path || 'global'}`,
      category: 'auth',
      categoryLabel: 'Authentication Issue',
      title: 'Authentication session needs attention',
      message: rawMessage,
      guidance: 'Sign out and sign back in with Google to refresh your verified session.',
      operation,
      path,
      rawError: rawMessage,
      timestamp,
      canRetry: false,
      requiresReauth: true,
    };
  }

  // 4. Quota / Rate-Limit Errors
  if (
    code.includes('resource-exhausted') ||
    lower.includes('quota exceeded') ||
    lower.includes('resource-exhausted') ||
    lower.includes('too many requests')
  ) {
    return {
      id: `quota:${path || 'global'}`,
      category: 'quota',
      categoryLabel: 'Quota Limit',
      title: 'Firestore quota limit reached',
      message: `Cloud Firestore rejected ${actionSummary} because the project quota was exceeded.`,
      guidance:
        'Free-tier daily Firestore quotas reset automatically the next day, or you can upgrade your Firebase billing plan.',
      operation,
      path,
      rawError: rawMessage,
      timestamp,
      canRetry: true,
      requiresReauth: false,
    };
  }

  // 5. Database / Index Configuration Errors
  if (
    code.includes('failed-precondition') ||
    lower.includes('failed-precondition') ||
    lower.includes('requires an index') ||
    lower.includes('database') && lower.includes('does not exist')
  ) {
    return {
      id: `config:${path || 'global'}`,
      category: 'config',
      categoryLabel: 'Database Setup',
      title: 'Firestore configuration issue',
      message: rawMessage,
      guidance:
        'Verify that your Cloud Firestore database exists and any required indexes are enabled in the Firebase Console.',
      operation,
      path,
      rawError: rawMessage,
      timestamp,
      canRetry: true,
      requiresReauth: false,
    };
  }

  // 6. General / Validation / Unknown Errors
  return {
    id: `unknown:${path || rawMessage.slice(0, 48)}`,
    category: 'unknown',
    categoryLabel: 'Operation Failed',
    title: resourceLabel ? `Could not finish ${actionSummary}` : 'Operation failed',
    message: rawMessage,
    guidance: 'Please try again. If the problem continues, refresh the workspace.',
    operation,
    path,
    rawError: rawMessage,
    timestamp,
    canRetry: true,
    requiresReauth: false,
  };
}

export function isLikelyFirestoreOrNetworkError(error: unknown): boolean {
  const { rawMessage, code, payload } = extractRawMessageAndCode(error);
  if (payload) return true;
  if (
    code.includes('permission-denied') ||
    code.includes('unavailable') ||
    code.includes('unauthenticated') ||
    code.includes('resource-exhausted') ||
    code.includes('deadline-exceeded') ||
    code.includes('failed-precondition')
  ) {
    return true;
  }
  const lower = rawMessage.toLowerCase();
  return (
    lower.includes('firestore') ||
    lower.includes('missing or insufficient permissions') ||
    lower.includes('client is offline') ||
    lower.includes('failed to fetch') ||
    lower.includes('quota exceeded')
  );
}

export function formatErrorForUser(error: unknown): string {
  const classified = classifyFirestoreError(error);
  return classified.message;
}

export function showClassifiedErrorToast(
  toastFn: { error: (message: string, opts?: { id?: string; description?: string }) => unknown },
  error: unknown,
  fallback?: string
): void {
  const classified = classifyFirestoreError(error);
  if (classified.category === 'unknown') {
    toastFn.error(classified.message || fallback || 'Operation failed', {
      id: classified.id,
    });
    return;
  }
  toastFn.error(classified.title, {
    id: classified.id,
    description: classified.message,
  });
}
