import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db } from './firebase';
import {
  DEFAULT_SUPPORTED_APPS,
  getAdapter,
  isReservedShortCode,
  processDestinationUrl,
  validateShortCode,
  type BrowserEnvironment,
  type DeviceCategory,
  type DevicePlatform,
  type ProcessedUrlResult,
  type RedirectOutcome,
  type ReferralSource,
  type SupportedAppRecord,
} from './redirect-engine/index';
import type { AppConfigurationJson, DestinationConfigJson } from '../db/schema';

export const BOOTSTRAPPED_SUPER_ADMIN_EMAIL = 'amitbaskey99@gmail.com';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// =============================================================================
// Shared Domain Types (matching existing UI components)
// =============================================================================

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

export interface SupportedAppRow extends SupportedAppRecord {
  id: string;
  createdAt: string;
}

export interface CampaignRow {
  id: string;
  ownerId: string;
  campaignName: string;
  description: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  startDate: string | null;
  endDate: string | null;
  status: 'active' | 'paused' | 'completed' | 'archived';
  linkCount: number;
  totalClicks: number;
  createdAt: string;
}

export interface SmartLinkRow {
  id: string;
  ownerId: string;
  linkName: string;
  shortCode: string;
  originalUrl: string;
  normalizedUrl: string;
  destinationType: string;
  destinationConfig: DestinationConfigJson;
  campaignId: string | null;
  campaignName: string | null;
  appName: string;
  ownerEmail: string | null;
  status: 'active' | 'inactive' | 'archived';
  totalClicks: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface PublicLinkRoute {
  shortCode: string;
  smartLinkId: string;
  ownerId: string;
  linkName: string;
  normalizedUrl: string;
  destinationType: string;
  destinationConfig: DestinationConfigJson;
  campaignId: string | null;
  status: 'active' | 'inactive' | 'archived';
  expiresAt: string | null;
}

export interface AnalyticsSummary {
  totals: {
    totalLinks: number;
    totalClicks: number;
    uniqueClicks: number;
    androidClicks: number;
    iosClicks: number;
    desktopClicks: number;
    instagramTraffic: number;
    whatsappTraffic: number;
    facebookTraffic: number;
    manualAppClicks: number;
    manualBrowserClicks: number;
  };
  clicksByDate: Array<{ date: string; clicks: number; unique: number }>;
  clicksByPlatform: Array<{ name: string; value: number }>;
  clicksByBrowser: Array<{ name: string; value: number }>;
  clicksByReferral: Array<{ name: string; value: number }>;
  clicksByDestination: Array<{ name: string; value: number }>;
  clicksByOutcome: Array<{ name: string; value: number }>;
  topLinks: SmartLinkRow[];
  recentLinks: SmartLinkRow[];
}

export interface AppSettingsMap {
  domain_config?: {
    customShortDomain?: string;
    enforceHttps?: boolean;
    defaultFallbackPreference?: string;
    iosTeamId?: string;
    iosAppBundleId?: string;
    androidAppPackage?: string;
    androidSha256Fingerprints?: string[];
  };
  privacy_config?: {
    storeIpAddresses?: boolean;
    privacySafeDeduplication?: boolean;
    defaultLinkExpirationDays?: number;
  };
}

// =============================================================================
// Internal Helpers
// =============================================================================

function toIsoString(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'toDate' in value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function sanitizeString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function generateRandomId(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function generateUniqueShortCode(length = 6): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export function isBootstrappedSuperAdmin(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === BOOTSTRAPPED_SUPER_ADMIN_EMAIL;
}

function parseRangeWindow(range: string, customFrom?: string, customTo?: string): { fromMs?: number; toMs?: number } {
  const now = Date.now();
  if (range === 'today') {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { fromMs: start.getTime(), toMs: now };
  }
  if (range === '7d') {
    return { fromMs: now - 7 * 24 * 60 * 60 * 1000, toMs: now };
  }
  if (range === '30d') {
    return { fromMs: now - 30 * 24 * 60 * 60 * 1000, toMs: now };
  }
  if (range === 'custom') {
    const fromMs = customFrom && !Number.isNaN(Date.parse(customFrom)) ? Date.parse(customFrom) : undefined;
    let toMs = customTo && !Number.isNaN(Date.parse(customTo)) ? Date.parse(customTo) : undefined;
    if (toMs !== undefined) {
      // Include full end day
      toMs += 24 * 60 * 60 * 1000 - 1;
    }
    return { fromMs, toMs };
  }
  return {};
}

// Privacy-safe ephemeral bucket hash (no IP address, no persistent identifier, no device fingerprint)
export async function computePrivacySafeDedupHash(
  smartLinkId: string,
  platform: string,
  browser: string
): Promise<string> {
  const hourBucket = new Date().toISOString().slice(0, 13);
  const lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').slice(0, 12);
  const input = `${smartLinkId}:${hourBucket}:${platform}:${browser}:${lang}`;
  try {
    const data = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return hex.slice(0, 24);
  } catch {
    return btoa(input).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
  }
}

// =============================================================================
// 1. User Profile & RBAC Management
// =============================================================================

const inFlightProfileSyncs = new Map<string, Promise<UserProfile>>();

async function syncUserProfileInternal(firebaseUser: User): Promise<UserProfile> {
  if (!firebaseUser.email) {
    throw new Error('Your Google account does not have an email address attached.');
  }
  if (!firebaseUser.emailVerified) {
    throw new Error('Please verify your email address before signing in.');
  }

  // Ensure the Firebase Auth ID token is ready before issuing Firestore reads/writes
  await firebaseUser.getIdToken();

  const uid = firebaseUser.uid;
  const docPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  try {
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data.status === 'inactive') {
        throw new Error('Your SmartLink account has been deactivated by an administrator.');
      }

      // If bootstrapped super admin somehow has non-super_admin role, upgrade automatically
      let role = (data.role as UserProfile['role']) || 'user';
      if (isBootstrappedSuperAdmin(firebaseUser.email) && role !== 'super_admin') {
        const upgradePayload: Record<string, unknown> = {
          role: 'super_admin',
          updatedAt: serverTimestamp(),
        };
        if (data.avatarUrl === null) {
          upgradePayload.avatarUrl = deleteField();
        }
        await updateDoc(userRef, upgradePayload);
        role = 'super_admin';
      }

      return {
        id: uid,
        firebaseUid: uid,
        fullName: String(data.fullName || firebaseUser.displayName || firebaseUser.email.split('@')[0]),
        email: String(data.email || firebaseUser.email),
        role,
        status: (data.status as UserProfile['status']) || 'active',
        avatarUrl: typeof data.avatarUrl === 'string' && data.avatarUrl ? data.avatarUrl : null,
        createdAt: toIsoString(data.createdAt),
      };
    }

    const assignedRole: UserProfile['role'] = isBootstrappedSuperAdmin(firebaseUser.email)
      ? 'super_admin'
      : 'user';

    const fullName = sanitizeString(
      firebaseUser.displayName || firebaseUser.email.split('@')[0] || 'SmartLink User',
      100
    );

    const payload: Record<string, unknown> = {
      uid,
      fullName,
      email: sanitizeString(firebaseUser.email, 254),
      role: assignedRole,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (firebaseUser.photoURL && firebaseUser.photoURL.length <= 1024) {
      payload.avatarUrl = firebaseUser.photoURL;
    }

    await setDoc(userRef, payload);

    return {
      id: uid,
      firebaseUid: uid,
      fullName,
      email: firebaseUser.email,
      role: assignedRole,
      status: 'active',
      avatarUrl: firebaseUser.photoURL || null,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('deactivated')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function syncUserProfile(firebaseUser: User): Promise<UserProfile> {
  const existingPromise = inFlightProfileSyncs.get(firebaseUser.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const syncPromise = syncUserProfileInternal(firebaseUser).finally(() => {
    inFlightProfileSyncs.delete(firebaseUser.uid);
  });

  inFlightProfileSyncs.set(firebaseUser.uid, syncPromise);
  return syncPromise;
}

export async function updateCurrentUserProfileName(uid: string, fullName: string): Promise<void> {
  const cleanName = sanitizeString(fullName, 100);
  if (cleanName.length < 2) {
    throw new Error('Full name must be at least 2 characters.');
  }
  const docPath = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      fullName: cleanName,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function listAllUsers(requester: UserProfile): Promise<UserProfile[]> {
  const colPath = 'users';
  try {
    const q = isBootstrappedSuperAdmin(requester.email)
      ? collection(db, colPath)
      : query(collection(db, colPath), where('uid', '==', requester.firebaseUid));

    const snap = await getDocs(q);
    return snap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          firebaseUid: String(data.uid || d.id),
          fullName: String(data.fullName || 'User'),
          email: String(data.email || ''),
          role: (data.role as UserProfile['role']) || 'user',
          status: (data.status as UserProfile['status']) || 'active',
          avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
          createdAt: toIsoString(data.createdAt),
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function updateUserRoleOrStatus(
  targetUid: string,
  requester: UserProfile,
  updates: { role?: UserProfile['role']; status?: UserProfile['status'] }
): Promise<void> {
  if (targetUid === requester.id && updates.status === 'inactive') {
    throw new Error('You cannot deactivate your own Super Admin account.');
  }

  const docPath = `users/${targetUid}`;
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (updates.role) payload.role = updates.role;
  if (updates.status) payload.status = updates.status;

  try {
    await updateDoc(doc(db, 'users', targetUid), payload);

    // Sync /admins/{targetUid} record when role changes
    if (updates.role) {
      const adminRef = doc(db, 'admins', targetUid);
      if (updates.role === 'admin' || updates.role === 'super_admin') {
        const existingAdmin = await getDoc(adminRef);
        if (!existingAdmin.exists()) {
          await setDoc(adminRef, {
            uid: targetUid,
            grantedAt: serverTimestamp(),
          });
        }
      } else if (isBootstrappedSuperAdmin(requester.email)) {
        try {
          await deleteDoc(adminRef);
        } catch {
          // Ignore if doc did not exist
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

// =============================================================================
// 2. Supported Applications
// =============================================================================

function mapSupportedAppDoc(id: string, data: Record<string, unknown>): SupportedAppRow {
  return {
    id,
    appName: String(data.appName || id),
    appType: String(data.appType || id),
    androidPackage: typeof data.androidPackage === 'string' ? data.androidPackage : null,
    iosBundleIdentifier: typeof data.iosBundleIdentifier === 'string' ? data.iosBundleIdentifier : null,
    androidAppLinkDomain: typeof data.androidAppLinkDomain === 'string' ? data.androidAppLinkDomain : null,
    iosUniversalLinkDomain: typeof data.iosUniversalLinkDomain === 'string' ? data.iosUniversalLinkDomain : null,
    deepLinkFormat: typeof data.deepLinkFormat === 'string' ? data.deepLinkFormat : null,
    webFallbackUrl: typeof data.webFallbackUrl === 'string' ? data.webFallbackUrl : null,
    appStoreUrl: typeof data.appStoreUrl === 'string' ? data.appStoreUrl : null,
    playStoreUrl: typeof data.playStoreUrl === 'string' ? data.playStoreUrl : null,
    configuration: (data.configuration as AppConfigurationJson) || {
      supportsAppLinks: true,
      supportsUniversalLinks: true,
      storeRedirectEnabled: false,
      documentedCapabilities: '',
      allowedHosts: [],
    },
    isActive: Boolean(data.isActive),
    createdAt: toIsoString(data.updatedAt),
  };
}

export async function listSupportedApps(): Promise<SupportedAppRow[]> {
  const colPath = 'supportedApps';
  const overrides = new Map<string, SupportedAppRow>();

  try {
    // Match Firestore QAP rule: `resource.data.isActive == true || isBootstrappedAdmin()`
    const q = isBootstrappedSuperAdmin(auth.currentUser?.email)
      ? collection(db, colPath)
      : query(collection(db, colPath), where('isActive', '==', true));
    const snap = await getDocs(q);

    for (const d of snap.docs) {
      overrides.set(d.id, mapSupportedAppDoc(d.id, d.data()));
    }
  } catch (error) {
    // Fallback to single-doc `get` reads (allowed by `allow get: if isValidTypeKey(appType)`)
    // so built-in app overrides still load even if manual console rules lag behind.
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('Missing or insufficient permissions') || msg.includes('permission-denied')) {
      const snaps = await Promise.all(
        DEFAULT_SUPPORTED_APPS.map((def) =>
          getDoc(doc(db, colPath, def.appType)).catch(() => null)
        )
      );
      for (const s of snaps) {
        if (s && s.exists()) {
          overrides.set(s.id, mapSupportedAppDoc(s.id, s.data()));
        }
      }
    } else {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
  }

  const merged: SupportedAppRow[] = DEFAULT_SUPPORTED_APPS.map((def) => {
    const override = overrides.get(def.appType);
    if (override) {
      overrides.delete(def.appType);
      return override;
    }
    return {
      ...def,
      id: def.appType,
      createdAt: new Date().toISOString(),
    };
  });

  // Append any custom apps added by Super Admin
  for (const customApp of overrides.values()) {
    merged.push(customApp);
  }

  return merged;
}

export async function getSupportedAppByType(appType: string): Promise<SupportedAppRow | null> {
  const cleanType = appType.trim().toLowerCase();
  const def = DEFAULT_SUPPORTED_APPS.find((a) => a.appType === cleanType);

  if (!/^[a-z0-9_]{2,40}$/.test(cleanType)) {
    return def ? { ...def, id: def.appType, createdAt: new Date().toISOString() } : null;
  }

  try {
    const snap = await getDoc(doc(db, 'supportedApps', cleanType));
    if (snap.exists()) {
      const data = snap.data();
      return {
        id: snap.id,
        appName: String(data.appName || snap.id),
        appType: String(data.appType || snap.id),
        androidPackage: typeof data.androidPackage === 'string' ? data.androidPackage : null,
        iosBundleIdentifier: typeof data.iosBundleIdentifier === 'string' ? data.iosBundleIdentifier : null,
        androidAppLinkDomain: typeof data.androidAppLinkDomain === 'string' ? data.androidAppLinkDomain : null,
        iosUniversalLinkDomain: typeof data.iosUniversalLinkDomain === 'string' ? data.iosUniversalLinkDomain : null,
        deepLinkFormat: typeof data.deepLinkFormat === 'string' ? data.deepLinkFormat : null,
        webFallbackUrl: typeof data.webFallbackUrl === 'string' ? data.webFallbackUrl : null,
        appStoreUrl: typeof data.appStoreUrl === 'string' ? data.appStoreUrl : null,
        playStoreUrl: typeof data.playStoreUrl === 'string' ? data.playStoreUrl : null,
        configuration: (data.configuration as AppConfigurationJson) || {
          supportsAppLinks: true,
          supportsUniversalLinks: true,
          storeRedirectEnabled: false,
          documentedCapabilities: '',
          allowedHosts: [],
        },
        isActive: Boolean(data.isActive),
        createdAt: toIsoString(data.updatedAt),
      };
    }
  } catch {
    // Fall back to built-in adapter config if Firestore doc not present
  }

  return def ? { ...def, id: def.appType, createdAt: new Date().toISOString() } : null;
}

export async function saveSupportedApp(input: {
  appName: string;
  appType: string;
  androidPackage: string | null;
  iosBundleIdentifier: string | null;
  androidAppLinkDomain: string | null;
  iosUniversalLinkDomain: string | null;
  deepLinkFormat: string | null;
  webFallbackUrl: string | null;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  isActive: boolean;
  configuration: AppConfigurationJson;
}): Promise<void> {
  const cleanType = input.appType.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,40}$/.test(cleanType)) {
    throw new Error('Application type key must be 2-40 lowercase letters, numbers, or underscores.');
  }

  const adapter = getAdapter(cleanType);
  const validation = adapter.validateAppConfiguration(input);
  if (!validation.valid) {
    throw new Error(validation.errors[0] || 'Invalid application configuration.');
  }

  const docPath = `supportedApps/${cleanType}`;
  const ref = doc(db, 'supportedApps', cleanType);

  const payload: Record<string, unknown> = {
    appName: sanitizeString(input.appName, 80),
    appType: cleanType,
    configuration: stripUndefined(input.configuration as unknown as Record<string, unknown>),
    isActive: Boolean(input.isActive),
    updatedAt: serverTimestamp(),
  };

  if (input.androidPackage) payload.androidPackage = sanitizeString(input.androidPackage, 160);
  if (input.iosBundleIdentifier) payload.iosBundleIdentifier = sanitizeString(input.iosBundleIdentifier, 160);
  if (input.androidAppLinkDomain) payload.androidAppLinkDomain = sanitizeString(input.androidAppLinkDomain, 160);
  if (input.iosUniversalLinkDomain) payload.iosUniversalLinkDomain = sanitizeString(input.iosUniversalLinkDomain, 160);
  if (input.deepLinkFormat) payload.deepLinkFormat = sanitizeString(input.deepLinkFormat, 240);
  if (input.webFallbackUrl) payload.webFallbackUrl = sanitizeString(input.webFallbackUrl, 300);
  if (input.appStoreUrl) payload.appStoreUrl = sanitizeString(input.appStoreUrl, 300);
  if (input.playStoreUrl) payload.playStoreUrl = sanitizeString(input.playStoreUrl, 300);

  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      // Remove optional fields that were cleared to empty
      const updatePayload: Record<string, unknown> = { ...payload };
      delete updatePayload.appType;
      if (!input.androidPackage && existing.data().androidPackage !== undefined) updatePayload.androidPackage = deleteField();
      if (!input.iosBundleIdentifier && existing.data().iosBundleIdentifier !== undefined) updatePayload.iosBundleIdentifier = deleteField();
      if (!input.androidAppLinkDomain && existing.data().androidAppLinkDomain !== undefined) updatePayload.androidAppLinkDomain = deleteField();
      if (!input.iosUniversalLinkDomain && existing.data().iosUniversalLinkDomain !== undefined) updatePayload.iosUniversalLinkDomain = deleteField();
      if (!input.deepLinkFormat && existing.data().deepLinkFormat !== undefined) updatePayload.deepLinkFormat = deleteField();
      if (!input.webFallbackUrl && existing.data().webFallbackUrl !== undefined) updatePayload.webFallbackUrl = deleteField();
      if (!input.appStoreUrl && existing.data().appStoreUrl !== undefined) updatePayload.appStoreUrl = deleteField();
      if (!input.playStoreUrl && existing.data().playStoreUrl !== undefined) updatePayload.playStoreUrl = deleteField();
      await updateDoc(ref, updatePayload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// =============================================================================
// 3. Campaigns CRUD
// =============================================================================

async function fetchRawLinksAndEvents(profile: UserProfile) {
  const isGlobalViewer = isBootstrappedSuperAdmin(profile.email);

  const linksQuery = isGlobalViewer
    ? collection(db, 'smartLinks')
    : query(collection(db, 'smartLinks'), where('ownerId', '==', profile.firebaseUid));

  const eventsQuery = isGlobalViewer
    ? collection(db, 'clickEvents')
    : query(collection(db, 'clickEvents'), where('ownerId', '==', profile.firebaseUid));

  let linksSnap;
  try {
    linksSnap = await getDocs(linksQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'smartLinks');
  }

  let eventsSnap;
  try {
    eventsSnap = await getDocs(eventsQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'clickEvents');
  }

  return { linksSnap, eventsSnap };
}

export async function listCampaigns(profile: UserProfile): Promise<CampaignRow[]> {
  const colPath = 'campaigns';
  const isGlobalViewer = isBootstrappedSuperAdmin(profile.email);

  try {
    const campQuery = isGlobalViewer
      ? collection(db, colPath)
      : query(collection(db, colPath), where('ownerId', '==', profile.firebaseUid));

    const [campSnap, { linksSnap, eventsSnap }] = await Promise.all([
      getDocs(campQuery),
      fetchRawLinksAndEvents(profile),
    ]);

    const linkCountByCamp = new Map<string, number>();
    for (const d of linksSnap.docs) {
      const cId = d.data().campaignId;
      if (typeof cId === 'string' && cId) {
        linkCountByCamp.set(cId, (linkCountByCamp.get(cId) || 0) + 1);
      }
    }

    const clickCountByCamp = new Map<string, number>();
    for (const d of eventsSnap.docs) {
      const data = d.data();
      const cId = data.campaignId;
      const outcome = data.redirectOutcome;
      if (
        typeof cId === 'string' &&
        cId &&
        outcome !== 'manual_app_click' &&
        outcome !== 'manual_browser_click'
      ) {
        clickCountByCamp.set(cId, (clickCountByCamp.get(cId) || 0) + 1);
      }
    }

    return campSnap.docs
      .map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ownerId: String(data.ownerId || ''),
          campaignName: String(data.campaignName || ''),
          description: typeof data.description === 'string' ? data.description : null,
          utmSource: typeof data.utmSource === 'string' ? data.utmSource : null,
          utmMedium: typeof data.utmMedium === 'string' ? data.utmMedium : null,
          utmCampaign: typeof data.utmCampaign === 'string' ? data.utmCampaign : null,
          startDate: typeof data.startDate === 'string' ? data.startDate : null,
          endDate: typeof data.endDate === 'string' ? data.endDate : null,
          status: (data.status as CampaignRow['status']) || 'active',
          linkCount: linkCountByCamp.get(d.id) || 0,
          totalClicks: clickCountByCamp.get(d.id) || 0,
          createdAt: toIsoString(data.createdAt),
        };
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function createCampaign(
  profile: UserProfile,
  input: {
    campaignName: string;
    description?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    status?: CampaignRow['status'];
  }
): Promise<string> {
  const cleanName = sanitizeString(input.campaignName, 120);
  if (!cleanName) throw new Error('Campaign name is required.');

  const id = generateRandomId(20);
  const docPath = `campaigns/${id}`;

  const payload: Record<string, unknown> = {
    ownerId: profile.firebaseUid,
    campaignName: cleanName,
    status: input.status || 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.description?.trim()) payload.description = sanitizeString(input.description, 500);
  if (input.utmSource?.trim()) payload.utmSource = sanitizeString(input.utmSource, 80);
  if (input.utmMedium?.trim()) payload.utmMedium = sanitizeString(input.utmMedium, 80);
  if (input.utmCampaign?.trim()) payload.utmCampaign = sanitizeString(input.utmCampaign, 80);
  if (input.startDate?.trim()) payload.startDate = sanitizeString(input.startDate, 40);
  if (input.endDate?.trim()) payload.endDate = sanitizeString(input.endDate, 40);

  try {
    await setDoc(doc(db, 'campaigns', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateCampaign(
  campaignId: string,
  profile: UserProfile,
  existing: CampaignRow,
  input: {
    campaignName: string;
    description?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    status: CampaignRow['status'];
  }
): Promise<void> {
  const docPath = `campaigns/${campaignId}`;
  const ref = doc(db, 'campaigns', campaignId);
  const isAdmin = profile.role === 'super_admin' || profile.role === 'admin';

  const metadataPayload: Record<string, unknown> = {
    campaignName: sanitizeString(input.campaignName, 120),
    updatedAt: serverTimestamp(),
  };

  if (input.description?.trim()) {
    metadataPayload.description = sanitizeString(input.description, 500);
  } else if (existing.description) {
    metadataPayload.description = deleteField();
  }

  if (input.utmSource?.trim()) {
    metadataPayload.utmSource = sanitizeString(input.utmSource, 80);
  } else if (existing.utmSource) {
    metadataPayload.utmSource = deleteField();
  }

  if (input.utmMedium?.trim()) {
    metadataPayload.utmMedium = sanitizeString(input.utmMedium, 80);
  } else if (existing.utmMedium) {
    metadataPayload.utmMedium = deleteField();
  }

  if (input.utmCampaign?.trim()) {
    metadataPayload.utmCampaign = sanitizeString(input.utmCampaign, 80);
  } else if (existing.utmCampaign) {
    metadataPayload.utmCampaign = deleteField();
  }

  if (input.startDate?.trim()) {
    metadataPayload.startDate = sanitizeString(input.startDate, 40);
  } else if (existing.startDate) {
    metadataPayload.startDate = deleteField();
  }

  if (input.endDate?.trim()) {
    metadataPayload.endDate = sanitizeString(input.endDate, 40);
  } else if (existing.endDate) {
    metadataPayload.endDate = deleteField();
  }

  try {
    if (isAdmin) {
      await updateDoc(ref, { ...metadataPayload, status: input.status });
    } else {
      // Non-admin rules isolate metadata updates from status updates
      await updateDoc(ref, metadataPayload);
      if (input.status !== existing.status) {
        await updateDoc(ref, { status: input.status, updatedAt: serverTimestamp() });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteCampaign(campaignId: string): Promise<void> {
  const docPath = `campaigns/${campaignId}`;
  try {
    await deleteDoc(doc(db, 'campaigns', campaignId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// =============================================================================
// 4. Smart Links CRUD (Atomic sync with /publicLinks/{shortCode})
// =============================================================================

export async function createSmartLink(
  profile: UserProfile,
  input: {
    linkName: string;
    destinationType?: string;
    destinationUrl: string;
    customShortCode?: string;
    campaignId?: string | null;
    fallbackPreference?: 'app_first' | 'web_only' | 'interstitial_always';
    expiresAt?: string | null;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    customDomain?: string;
  }
): Promise<{ link: SmartLinkRow; inspection: ProcessedUrlResult }> {
  const cleanName = sanitizeString(input.linkName, 120);
  if (!cleanName) throw new Error('Link name is required.');

  const requestedType = !input.destinationType || input.destinationType === 'auto' ? undefined : input.destinationType;
  const preConfig = requestedType ? await getSupportedAppByType(requestedType) : null;
  const fallbackPref = input.fallbackPreference || 'app_first';

  const processed = processDestinationUrl(
    input.destinationUrl,
    requestedType || 'auto',
    preConfig,
    fallbackPref
  );

  if (!processed.valid) {
    throw new Error(processed.error || 'Destination URL failed HTTPS validation.');
  }

  const resolvedApp = await getSupportedAppByType(processed.destinationType);
  if (resolvedApp && !resolvedApp.isActive) {
    throw new Error(`${resolvedApp.appName} links are currently disabled by an administrator.`);
  }

  // Validate or generate a collision-free short code using /publicLinks/{shortCode}
  let shortCode = input.customShortCode?.trim() || '';
  if (shortCode) {
    const check = validateShortCode(shortCode);
    if (!check.valid) {
      throw new Error(check.error || 'Invalid short code.');
    }
    const existingPublic = await getDoc(doc(db, 'publicLinks', shortCode));
    if (existingPublic.exists()) {
      throw new Error(`Short code "${shortCode}" is already in use. Please choose another.`);
    }
  } else {
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate = generateUniqueShortCode(6);
      if (isReservedShortCode(candidate)) continue;
      const existingPublic = await getDoc(doc(db, 'publicLinks', candidate));
      if (!existingPublic.exists()) {
        shortCode = candidate;
        break;
      }
    }
    if (!shortCode) {
      shortCode = generateUniqueShortCode(8);
    }
  }

  const cleanConfig = stripUndefined({
    ...processed.destinationConfig,
    ...(input.utmSource?.trim() ? { utmSource: sanitizeString(input.utmSource, 80) } : {}),
    ...(input.utmMedium?.trim() ? { utmMedium: sanitizeString(input.utmMedium, 80) } : {}),
    ...(input.utmCampaign?.trim() ? { utmCampaign: sanitizeString(input.utmCampaign, 80) } : {}),
    ...(input.customDomain?.trim() ? { customDomain: sanitizeString(input.customDomain, 120) } : {}),
  }) as unknown as DestinationConfigJson;

  const linkId = generateRandomId(20);
  const nowIso = new Date().toISOString();

  const smartLinkPayload: Record<string, unknown> = {
    ownerId: profile.firebaseUid,
    linkName: cleanName,
    shortCode,
    originalUrl: processed.originalUrl,
    normalizedUrl: processed.normalizedUrl,
    destinationType: processed.destinationType,
    destinationConfig: cleanConfig,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const publicLinkPayload: Record<string, unknown> = {
    shortCode,
    smartLinkId: linkId,
    ownerId: profile.firebaseUid,
    linkName: cleanName,
    normalizedUrl: processed.normalizedUrl,
    destinationType: processed.destinationType,
    destinationConfig: cleanConfig,
    status: 'active',
    updatedAt: serverTimestamp(),
  };

  if (input.campaignId?.trim()) {
    const cleanCampId = sanitizeString(input.campaignId, 128);
    smartLinkPayload.campaignId = cleanCampId;
    publicLinkPayload.campaignId = cleanCampId;
  }

  if (input.expiresAt?.trim()) {
    const cleanExp = sanitizeString(input.expiresAt, 40);
    smartLinkPayload.expiresAt = cleanExp;
    publicLinkPayload.expiresAt = cleanExp;
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'smartLinks', linkId), smartLinkPayload);
    batch.set(doc(db, 'publicLinks', shortCode), publicLinkPayload);
    await batch.commit();

    const createdLink: SmartLinkRow = {
      id: linkId,
      ownerId: profile.firebaseUid,
      linkName: cleanName,
      shortCode,
      originalUrl: processed.originalUrl,
      normalizedUrl: processed.normalizedUrl,
      destinationType: processed.destinationType,
      destinationConfig: cleanConfig,
      campaignId: input.campaignId?.trim() || null,
      campaignName: null,
      appName: resolvedApp?.appName || processed.destinationType,
      ownerEmail: profile.email,
      status: 'active',
      totalClicks: 0,
      expiresAt: input.expiresAt?.trim() || null,
      createdAt: nowIso,
    };

    return { link: createdLink, inspection: processed };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `smartLinks/${linkId}`);
  }
}

export async function listSmartLinks(
  profile: UserProfile,
  filters: {
    search?: string;
    destinationType?: string;
    status?: string;
    campaignId?: string;
    dateFrom?: string;
    sortBy?: 'createdAt' | 'totalClicks' | 'linkName';
    sortDir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  } = {}
): Promise<{ items: SmartLinkRow[]; total: number; page: number; pageSize: number }> {
  const isGlobalViewer = isBootstrappedSuperAdmin(profile.email);
  const campQuery = isGlobalViewer
    ? collection(db, 'campaigns')
    : query(collection(db, 'campaigns'), where('ownerId', '==', profile.firebaseUid));

  const [{ linksSnap, eventsSnap }, campSnap] = await Promise.all([
    fetchRawLinksAndEvents(profile),
    getDocs(campQuery).catch(() => null),
  ]);

  const campNameMap = new Map<string, string>();
  if (campSnap) {
    for (const c of campSnap.docs) {
      campNameMap.set(c.id, String(c.data().campaignName || ''));
    }
  }

  const clicksByLink = new Map<string, number>();
  for (const e of eventsSnap.docs) {
    const data = e.data();
    const outcome = data.redirectOutcome;
    if (outcome !== 'manual_app_click' && outcome !== 'manual_browser_click') {
      const lid = String(data.smartLinkId || '');
      if (lid) clicksByLink.set(lid, (clicksByLink.get(lid) || 0) + 1);
    }
  }

  const appNameMap = new Map<string, string>(
    DEFAULT_SUPPORTED_APPS.map((a) => [a.appType, a.appName])
  );

  let rows: SmartLinkRow[] = linksSnap.docs.map((d) => {
    const data = d.data();
    const campaignId = typeof data.campaignId === 'string' && data.campaignId ? data.campaignId : null;
    const destType = String(data.destinationType || 'website');
    return {
      id: d.id,
      ownerId: String(data.ownerId || ''),
      linkName: String(data.linkName || ''),
      shortCode: String(data.shortCode || ''),
      originalUrl: String(data.originalUrl || ''),
      normalizedUrl: String(data.normalizedUrl || ''),
      destinationType: destType,
      destinationConfig: (data.destinationConfig as DestinationConfigJson) || {
        webFallbackUrl: String(data.normalizedUrl || ''),
        fallbackPreference: 'app_first',
      },
      campaignId,
      campaignName: campaignId ? campNameMap.get(campaignId) || null : null,
      appName: appNameMap.get(destType) || destType,
      ownerEmail: data.ownerId === profile.firebaseUid ? profile.email : null,
      status: (data.status as SmartLinkRow['status']) || 'active',
      totalClicks: clicksByLink.get(d.id) || 0,
      expiresAt: typeof data.expiresAt === 'string' && data.expiresAt ? data.expiresAt : null,
      createdAt: toIsoString(data.createdAt),
    };
  });

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.linkName.toLowerCase().includes(q) ||
        r.shortCode.toLowerCase().includes(q) ||
        r.originalUrl.toLowerCase().includes(q)
    );
  }

  if (filters.destinationType && filters.destinationType !== 'all') {
    rows = rows.filter((r) => r.destinationType === filters.destinationType);
  }

  if (filters.status && filters.status !== 'all') {
    rows = rows.filter((r) => r.status === filters.status);
  }

  if (filters.campaignId) {
    rows = rows.filter((r) => r.campaignId === filters.campaignId);
  }

  if (filters.dateFrom && !Number.isNaN(Date.parse(filters.dateFrom))) {
    const fromMs = Date.parse(filters.dateFrom);
    rows = rows.filter((r) => Date.parse(r.createdAt) >= fromMs);
  }

  const sortBy = filters.sortBy || 'createdAt';
  const dir = filters.sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (sortBy === 'totalClicks') return (a.totalClicks - b.totalClicks) * dir;
    if (sortBy === 'linkName') return a.linkName.localeCompare(b.linkName) * dir;
    return (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir;
  });

  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(50, Math.max(5, filters.pageSize || 12));
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return { items, total, page, pageSize };
}

export async function getSmartLinkById(linkId: string): Promise<SmartLinkRow | null> {
  const docPath = `smartLinks/${linkId}`;
  try {
    const snap = await getDoc(doc(db, 'smartLinks', linkId));
    if (!snap.exists()) return null;
    const data = snap.data();
    const destType = String(data.destinationType || 'website');
    const appDef = DEFAULT_SUPPORTED_APPS.find((a) => a.appType === destType);
    return {
      id: snap.id,
      ownerId: String(data.ownerId || ''),
      linkName: String(data.linkName || ''),
      shortCode: String(data.shortCode || ''),
      originalUrl: String(data.originalUrl || ''),
      normalizedUrl: String(data.normalizedUrl || ''),
      destinationType: destType,
      destinationConfig: (data.destinationConfig as DestinationConfigJson) || {
        webFallbackUrl: String(data.normalizedUrl || ''),
        fallbackPreference: 'app_first',
      },
      campaignId: typeof data.campaignId === 'string' && data.campaignId ? data.campaignId : null,
      campaignName: null,
      appName: appDef?.appName || destType,
      ownerEmail: null,
      status: (data.status as SmartLinkRow['status']) || 'active',
      totalClicks: 0,
      expiresAt: typeof data.expiresAt === 'string' && data.expiresAt ? data.expiresAt : null,
      createdAt: toIsoString(data.createdAt),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function updateSmartLink(
  existing: SmartLinkRow,
  input: {
    linkName: string;
    destinationUrl: string;
    customShortCode: string;
    campaignId: string | null;
    fallbackPreference: 'app_first' | 'web_only' | 'interstitial_always';
  }
): Promise<void> {
  const cleanName = sanitizeString(input.linkName, 120);
  if (!cleanName) throw new Error('Link name is required.');

  const nextSlug = input.customShortCode.trim();
  const slugChanged = nextSlug !== existing.shortCode;
  if (slugChanged) {
    const check = validateShortCode(nextSlug);
    if (!check.valid) throw new Error(check.error || 'Invalid short code.');
    const slugSnap = await getDoc(doc(db, 'publicLinks', nextSlug));
    if (slugSnap.exists()) {
      throw new Error(`Short code "${nextSlug}" is already taken.`);
    }
  }

  const appRecord = await getSupportedAppByType(existing.destinationType);
  const processed = processDestinationUrl(
    input.destinationUrl,
    'auto',
    appRecord,
    input.fallbackPreference
  );
  if (!processed.valid) {
    throw new Error(processed.error || 'Destination URL failed HTTPS validation.');
  }

  const mergedConfig = stripUndefined({
    ...processed.destinationConfig,
    ...(existing.destinationConfig.utmSource ? { utmSource: existing.destinationConfig.utmSource } : {}),
    ...(existing.destinationConfig.utmMedium ? { utmMedium: existing.destinationConfig.utmMedium } : {}),
    ...(existing.destinationConfig.utmCampaign ? { utmCampaign: existing.destinationConfig.utmCampaign } : {}),
    ...(existing.destinationConfig.customDomain ? { customDomain: existing.destinationConfig.customDomain } : {}),
  }) as unknown as DestinationConfigJson;

  const smartLinkUpdates: Record<string, unknown> = {
    linkName: cleanName,
    shortCode: nextSlug,
    originalUrl: processed.originalUrl,
    normalizedUrl: processed.normalizedUrl,
    destinationType: processed.destinationType,
    destinationConfig: mergedConfig,
    updatedAt: serverTimestamp(),
  };

  if (input.campaignId?.trim()) {
    smartLinkUpdates.campaignId = sanitizeString(input.campaignId, 128);
  } else if (existing.campaignId) {
    smartLinkUpdates.campaignId = deleteField();
  }

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'smartLinks', existing.id), smartLinkUpdates);

    if (slugChanged) {
      batch.delete(doc(db, 'publicLinks', existing.shortCode));
      const newPublicDoc: Record<string, unknown> = {
        shortCode: nextSlug,
        smartLinkId: existing.id,
        ownerId: existing.ownerId,
        linkName: cleanName,
        normalizedUrl: processed.normalizedUrl,
        destinationType: processed.destinationType,
        destinationConfig: mergedConfig,
        status: existing.status,
        updatedAt: serverTimestamp(),
      };
      if (input.campaignId?.trim()) newPublicDoc.campaignId = sanitizeString(input.campaignId, 128);
      if (existing.expiresAt) newPublicDoc.expiresAt = existing.expiresAt;
      batch.set(doc(db, 'publicLinks', nextSlug), newPublicDoc);
    } else {
      const publicUpdates: Record<string, unknown> = {
        linkName: cleanName,
        normalizedUrl: processed.normalizedUrl,
        destinationType: processed.destinationType,
        destinationConfig: mergedConfig,
        updatedAt: serverTimestamp(),
      };
      if (input.campaignId?.trim()) {
        publicUpdates.campaignId = sanitizeString(input.campaignId, 128);
      } else if (existing.campaignId) {
        publicUpdates.campaignId = deleteField();
      }
      batch.update(doc(db, 'publicLinks', existing.shortCode), publicUpdates);
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `smartLinks/${existing.id}`);
  }
}

export async function toggleSmartLinkStatus(existing: SmartLinkRow): Promise<'active' | 'inactive'> {
  const nextStatus: 'active' | 'inactive' = existing.status === 'active' ? 'inactive' : 'active';
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'smartLinks', existing.id), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'publicLinks', existing.shortCode), {
      status: nextStatus,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return nextStatus;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `smartLinks/${existing.id}`);
  }
}

export async function deleteSmartLink(existing: SmartLinkRow): Promise<void> {
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'smartLinks', existing.id));
    batch.delete(doc(db, 'publicLinks', existing.shortCode));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `smartLinks/${existing.id}`);
  }
}

// =============================================================================
// 5. Public Short Link Resolution & Privacy-Safe Click Events
// =============================================================================

export async function resolvePublicShortLink(shortCode: string): Promise<{
  route: PublicLinkRoute;
  appConfig: SupportedAppRow | null;
} | null> {
  const cleanCode = shortCode.trim();
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(cleanCode)) {
    return null;
  }
  const docPath = `publicLinks/${cleanCode}`;
  try {
    const snap = await getDoc(doc(db, 'publicLinks', cleanCode));
    if (!snap.exists()) return null;
    const data = snap.data();
    const route: PublicLinkRoute = {
      shortCode: String(data.shortCode || cleanCode),
      smartLinkId: String(data.smartLinkId || ''),
      ownerId: String(data.ownerId || ''),
      linkName: String(data.linkName || 'SmartLink'),
      normalizedUrl: String(data.normalizedUrl || ''),
      destinationType: String(data.destinationType || 'website'),
      destinationConfig: (data.destinationConfig as DestinationConfigJson) || {
        webFallbackUrl: String(data.normalizedUrl || ''),
        fallbackPreference: 'app_first',
      },
      campaignId: typeof data.campaignId === 'string' && data.campaignId ? data.campaignId : null,
      status: (data.status as PublicLinkRoute['status']) || 'active',
      expiresAt: typeof data.expiresAt === 'string' && data.expiresAt ? data.expiresAt : null,
    };

    const appConfig = await getSupportedAppByType(route.destinationType);
    return { route, appConfig };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

const VALID_BROWSERS: ReadonlySet<string> = new Set([
  'instagram_inapp',
  'facebook_inapp',
  'android_chrome',
  'ios_safari',
  'mobile_browser',
  'desktop_browser',
]);

const VALID_REFERRALS: ReadonlySet<string> = new Set([
  'instagram',
  'whatsapp',
  'facebook',
  'youtube',
  'qr_code',
  'direct',
  'other',
]);

export async function recordClickEvent(params: {
  smartLinkId: string;
  shortCode: string;
  ownerId: string;
  destinationType: string;
  campaignId?: string | null;
  platform: DevicePlatform;
  deviceCategory: DeviceCategory;
  browser: BrowserEnvironment | string;
  referralSource: ReferralSource | string;
  redirectOutcome: RedirectOutcome;
}): Promise<void> {
  const eventId = generateRandomId(24);
  const dedupHash = await computePrivacySafeDedupHash(
    params.smartLinkId,
    params.platform,
    params.browser
  );

  const safeBrowser = VALID_BROWSERS.has(params.browser) ? params.browser : 'mobile_browser';
  const safeReferral = VALID_REFERRALS.has(params.referralSource) ? params.referralSource : 'direct';

  const payload: Record<string, unknown> = {
    smartLinkId: params.smartLinkId,
    shortCode: params.shortCode,
    ownerId: params.ownerId,
    destinationType: params.destinationType,
    platform: params.platform,
    deviceCategory: params.deviceCategory,
    browser: safeBrowser,
    referralSource: safeReferral,
    redirectOutcome: params.redirectOutcome,
    dedupHash,
    clickedAt: serverTimestamp(),
  };

  if (params.campaignId?.trim()) {
    payload.campaignId = sanitizeString(params.campaignId, 128);
  }

  try {
    await setDoc(doc(db, 'clickEvents', eventId), payload);
  } catch (error) {
    // Log structured Firestore error without breaking visitor redirection
    console.error('Click telemetry write skipped:', error);
  }
}

// =============================================================================
// 6. Analytics Aggregation
// =============================================================================

export async function getAnalyticsSummary(
  profile: UserProfile,
  options: {
    range?: string;
    from?: string;
    to?: string;
    smartLinkId?: string;
    campaignId?: string;
  } = {}
): Promise<AnalyticsSummary> {
  const { linksSnap, eventsSnap } = await fetchRawLinksAndEvents(profile);
  const { fromMs, toMs } = parseRangeWindow(options.range || '30d', options.from, options.to);

  const appNameMap = new Map<string, string>(
    DEFAULT_SUPPORTED_APPS.map((a) => [a.appType, a.appName])
  );

  // Build scoped links
  const allLinks: SmartLinkRow[] = linksSnap.docs
    .map((d) => {
      const data = d.data();
      const destType = String(data.destinationType || 'website');
      return {
        id: d.id,
        ownerId: String(data.ownerId || ''),
        linkName: String(data.linkName || ''),
        shortCode: String(data.shortCode || ''),
        originalUrl: String(data.originalUrl || ''),
        normalizedUrl: String(data.normalizedUrl || ''),
        destinationType: destType,
        destinationConfig: (data.destinationConfig as DestinationConfigJson) || {
          webFallbackUrl: String(data.normalizedUrl || ''),
          fallbackPreference: 'app_first',
        },
        campaignId: typeof data.campaignId === 'string' && data.campaignId ? data.campaignId : null,
        campaignName: null,
        appName: appNameMap.get(destType) || destType,
        ownerEmail: data.ownerId === profile.firebaseUid ? profile.email : null,
        status: (data.status as SmartLinkRow['status']) || 'active',
        totalClicks: 0,
        expiresAt: typeof data.expiresAt === 'string' && data.expiresAt ? data.expiresAt : null,
        createdAt: toIsoString(data.createdAt),
      };
    })
    .filter((l) => {
      if (options.smartLinkId && l.id !== options.smartLinkId) return false;
      if (options.campaignId && l.campaignId !== options.campaignId) return false;
      return true;
    });

  const allowedLinkIds = new Set(allLinks.map((l) => l.id));

  let totalClicks = 0;
  let androidClicks = 0;
  let iosClicks = 0;
  let desktopClicks = 0;
  let instagramTraffic = 0;
  let whatsappTraffic = 0;
  let facebookTraffic = 0;
  let manualAppClicks = 0;
  let manualBrowserClicks = 0;

  const uniqueHashes = new Set<string>();
  const byDate = new Map<string, { clicks: number; uniques: Set<string> }>();
  const byPlatform = new Map<string, number>();
  const byBrowser = new Map<string, number>();
  const byReferral = new Map<string, number>();
  const byDestination = new Map<string, number>();
  const byOutcome = new Map<string, number>();
  const clicksPerLink = new Map<string, number>();

  for (const d of eventsSnap.docs) {
    const data = d.data();
    const linkId = String(data.smartLinkId || '');
    if (!allowedLinkIds.has(linkId)) continue;

    const clickedIso = toIsoString(data.clickedAt);
    const clickedMs = Date.parse(clickedIso);
    if (fromMs !== undefined && clickedMs < fromMs) continue;
    if (toMs !== undefined && clickedMs > toMs) continue;

    const outcome = String(data.redirectOutcome || 'redirect_attempted');
    byOutcome.set(outcome, (byOutcome.get(outcome) || 0) + 1);

    if (outcome === 'manual_app_click') {
      manualAppClicks += 1;
      continue;
    }
    if (outcome === 'manual_browser_click') {
      manualBrowserClicks += 1;
      continue;
    }

    totalClicks += 1;
    clicksPerLink.set(linkId, (clicksPerLink.get(linkId) || 0) + 1);

    const platform = String(data.platform || 'other');
    if (platform === 'android') androidClicks += 1;
    else if (platform === 'ios') iosClicks += 1;
    else if (platform === 'desktop') desktopClicks += 1;
    byPlatform.set(platform, (byPlatform.get(platform) || 0) + 1);

    const browser = String(data.browser || 'mobile_browser');
    byBrowser.set(browser, (byBrowser.get(browser) || 0) + 1);

    const referral = String(data.referralSource || 'direct');
    if (referral === 'instagram') instagramTraffic += 1;
    else if (referral === 'whatsapp') whatsappTraffic += 1;
    else if (referral === 'facebook') facebookTraffic += 1;
    byReferral.set(referral, (byReferral.get(referral) || 0) + 1);

    const dest = String(data.destinationType || 'website');
    byDestination.set(dest, (byDestination.get(dest) || 0) + 1);

    const dedup = typeof data.dedupHash === 'string' && data.dedupHash ? data.dedupHash : d.id;
    uniqueHashes.add(dedup);

    const dateKey = clickedIso.slice(0, 10);
    const bucket = byDate.get(dateKey) || { clicks: 0, uniques: new Set<string>() };
    bucket.clicks += 1;
    bucket.uniques.add(dedup);
    byDate.set(dateKey, bucket);
  }

  for (const link of allLinks) {
    link.totalClicks = clicksPerLink.get(link.id) || 0;
  }

  const sortDesc = (map: Map<string, number>) =>
    Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

  const clicksByDate = Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      clicks: v.clicks,
      unique: v.uniques.size,
    }));

  const topLinks = [...allLinks]
    .sort((a, b) => b.totalClicks - a.totalClicks || Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6);

  const recentLinks = [...allLinks]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 6);

  return {
    totals: {
      totalLinks: allLinks.length,
      totalClicks,
      uniqueClicks: uniqueHashes.size,
      androidClicks,
      iosClicks,
      desktopClicks,
      instagramTraffic,
      whatsappTraffic,
      facebookTraffic,
      manualAppClicks,
      manualBrowserClicks,
    },
    clicksByDate,
    clicksByPlatform: sortDesc(byPlatform),
    clicksByBrowser: sortDesc(byBrowser),
    clicksByReferral: sortDesc(byReferral),
    clicksByDestination: sortDesc(byDestination),
    clicksByOutcome: sortDesc(byOutcome),
    topLinks,
    recentLinks,
  };
}

// =============================================================================
// 7. Workspace Application Settings
// =============================================================================

export async function getAppSettings(): Promise<AppSettingsMap> {
  const result: AppSettingsMap = {
    domain_config: {
      customShortDomain: '',
      enforceHttps: true,
      defaultFallbackPreference: 'app_first',
      iosTeamId: '',
      iosAppBundleId: 'com.smartlink.app',
      androidAppPackage: 'com.smartlink.app',
      androidSha256Fingerprints: [],
    },
    privacy_config: {
      storeIpAddresses: false,
      privacySafeDeduplication: true,
      defaultLinkExpirationDays: 0,
    },
  };

  try {
    const [domainSnap, privacySnap] = await Promise.all([
      getDoc(doc(db, 'appSettings', 'domain_config')),
      getDoc(doc(db, 'appSettings', 'privacy_config')),
    ]);

    if (domainSnap.exists()) {
      result.domain_config = {
        ...result.domain_config,
        ...(domainSnap.data().settingValue as AppSettingsMap['domain_config']),
      };
    }
    if (privacySnap.exists()) {
      result.privacy_config = {
        ...result.privacy_config,
        ...(privacySnap.data().settingValue as AppSettingsMap['privacy_config']),
      };
    }
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'appSettings');
  }
}

export async function saveAppSetting(
  key: 'domain_config' | 'privacy_config',
  value: Record<string, unknown>
): Promise<void> {
  const docPath = `appSettings/${key}`;
  const ref = doc(db, 'appSettings', key);
  const cleanVal = stripUndefined(value);

  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        settingValue: cleanVal,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        settingKey: key,
        settingValue: cleanVal,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}
