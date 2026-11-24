import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './firebase';

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

export interface FirestoreSmartLink {
  id?: string;
  ownerId: string;
  linkName: string;
  shortCode: string;
  originalUrl: string;
  destinationType:
    | 'youtube'
    | 'whatsapp'
    | 'instagram'
    | 'google_maps'
    | 'play_store'
    | 'app_store'
    | 'website'
    | 'custom_app'
    | 'other';
  campaignId?: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface FirestoreCampaign {
  id?: string;
  ownerId: string;
  campaignName: string;
  description?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const HTTPS_PATTERN = /^https:\/\/.*/;

function assertSignedInUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('You must be signed in to perform Firestore operations.');
  }
  return uid;
}

function sanitizeString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

// =========================================================================
// Smart Links CRUD Helpers (Cloud Firestore)
// =========================================================================

export async function createSmartLinkDoc(input: {
  linkName: string;
  shortCode: string;
  originalUrl: string;
  destinationType: FirestoreSmartLink['destinationType'];
  campaignId?: string;
}): Promise<string> {
  const uid = assertSignedInUid();
  const shortCode = sanitizeString(input.shortCode, 32);
  const originalUrl = sanitizeString(input.originalUrl, 2048);

  if (!ID_PATTERN.test(shortCode) || shortCode.length < 3) {
    throw new Error('Short code must be 3-32 alphanumeric, hyphen, or underscore characters.');
  }
  if (!HTTPS_PATTERN.test(originalUrl)) {
    throw new Error('Destination URL must start with https://');
  }

  const payload: Record<string, unknown> = {
    ownerId: uid,
    linkName: sanitizeString(input.linkName, 120),
    shortCode,
    originalUrl,
    destinationType: input.destinationType,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.campaignId && ID_PATTERN.test(input.campaignId)) {
    payload.campaignId = sanitizeString(input.campaignId, 128);
  }

  const colPath = 'smartLinks';
  try {
    const ref = await addDoc(collection(db, colPath), payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, colPath);
  }
}

export async function getSmartLinkDoc(linkId: string): Promise<FirestoreSmartLink | null> {
  const docPath = `smartLinks/${linkId}`;
  try {
    const snap = await getDoc(doc(db, 'smartLinks', linkId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...(snap.data() as Omit<FirestoreSmartLink, 'id'>) };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, docPath);
  }
}

export async function listUserSmartLinkDocs(): Promise<FirestoreSmartLink[]> {
  const uid = assertSignedInUid();
  const colPath = 'smartLinks';
  try {
    const q = query(collection(db, colPath), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<FirestoreSmartLink, 'id'>),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export function subscribeUserSmartLinks(
  onData: (links: FirestoreSmartLink[]) => void
): Unsubscribe {
  const uid = assertSignedInUid();
  const colPath = 'smartLinks';
  const q = query(collection(db, colPath), where('ownerId', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FirestoreSmartLink, 'id'>),
        }))
      );
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
  );
}

export async function updateSmartLinkDoc(
  linkId: string,
  updates: Partial<
    Pick<FirestoreSmartLink, 'linkName' | 'shortCode' | 'originalUrl' | 'destinationType' | 'campaignId'>
  >
): Promise<void> {
  assertSignedInUid();
  const docPath = `smartLinks/${linkId}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };

  if (updates.linkName !== undefined) payload.linkName = sanitizeString(updates.linkName, 120);
  if (updates.shortCode !== undefined) payload.shortCode = sanitizeString(updates.shortCode, 32);
  if (updates.originalUrl !== undefined) {
    const cleanUrl = sanitizeString(updates.originalUrl, 2048);
    if (!HTTPS_PATTERN.test(cleanUrl)) {
      throw new Error('Destination URL must start with https://');
    }
    payload.originalUrl = cleanUrl;
  }
  if (updates.destinationType !== undefined) payload.destinationType = updates.destinationType;
  if (updates.campaignId !== undefined) payload.campaignId = sanitizeString(updates.campaignId, 128);

  try {
    await updateDoc(doc(db, 'smartLinks', linkId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function updateSmartLinkStatusDoc(
  linkId: string,
  status: FirestoreSmartLink['status']
): Promise<void> {
  assertSignedInUid();
  const docPath = `smartLinks/${linkId}`;
  try {
    await updateDoc(doc(db, 'smartLinks', linkId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteSmartLinkDoc(linkId: string): Promise<void> {
  assertSignedInUid();
  const docPath = `smartLinks/${linkId}`;
  try {
    await deleteDoc(doc(db, 'smartLinks', linkId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

// =========================================================================
// User Profile Sync Helper (Cloud Firestore)
// =========================================================================

export async function ensureFirestoreUserProfile(): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) return;
  const docPath = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        fullName: sanitizeString(user.displayName || user.email.split('@')[0], 100),
        email: sanitizeString(user.email, 254),
        role: 'user',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

// =========================================================================
// Campaigns CRUD Helpers (Cloud Firestore)
// =========================================================================

export async function createCampaignDoc(input: {
  campaignName: string;
  description?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}): Promise<string> {
  const uid = assertSignedInUid();
  const colPath = 'campaigns';
  const payload: Record<string, unknown> = {
    ownerId: uid,
    campaignName: sanitizeString(input.campaignName, 120),
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.description) payload.description = sanitizeString(input.description, 500);
  if (input.utmSource) payload.utmSource = sanitizeString(input.utmSource, 80);
  if (input.utmMedium) payload.utmMedium = sanitizeString(input.utmMedium, 80);
  if (input.utmCampaign) payload.utmCampaign = sanitizeString(input.utmCampaign, 80);

  try {
    const ref = await addDoc(collection(db, colPath), payload);
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, colPath);
  }
}

export async function listUserCampaignDocs(): Promise<FirestoreCampaign[]> {
  const uid = assertSignedInUid();
  const colPath = 'campaigns';
  try {
    const q = query(collection(db, colPath), where('ownerId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<FirestoreCampaign, 'id'>),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colPath);
  }
}

export async function deleteCampaignDoc(campaignId: string): Promise<void> {
  assertSignedInUid();
  const docPath = `campaigns/${campaignId}`;
  try {
    await deleteDoc(doc(db, 'campaigns', campaignId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}
