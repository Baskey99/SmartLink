import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  OperationType,
  handleFirestoreError,
  type FirestoreErrorInfo,
  syncUserProfile,
} from './firestore-service';
import { processDestinationUrl } from './redirect-engine/index';

export { OperationType, handleFirestoreError, type FirestoreErrorInfo };

export interface FirestoreSmartLink {
  id?: string;
  ownerId: string;
  linkName: string;
  shortCode: string;
  originalUrl: string;
  normalizedUrl: string;
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
  destinationConfig: Record<string, unknown>;
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

function makeDocId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

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

  const processed = processDestinationUrl(originalUrl, input.destinationType, null, 'app_first');
  const normalizedUrl = processed.valid ? processed.normalizedUrl : originalUrl;
  const destinationConfig = processed.valid
    ? processed.destinationConfig
    : { webFallbackUrl: originalUrl, fallbackPreference: 'app_first' };

  const linkId = makeDocId();
  const linkPayload: Record<string, unknown> = {
    ownerId: uid,
    linkName: sanitizeString(input.linkName, 120),
    shortCode,
    originalUrl,
    normalizedUrl,
    destinationType: input.destinationType,
    destinationConfig,
    status: 'active',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const publicPayload: Record<string, unknown> = {
    shortCode,
    smartLinkId: linkId,
    ownerId: uid,
    linkName: sanitizeString(input.linkName, 120),
    normalizedUrl,
    destinationType: input.destinationType,
    destinationConfig,
    status: 'active',
    updatedAt: serverTimestamp(),
  };

  if (input.campaignId && ID_PATTERN.test(input.campaignId)) {
    linkPayload.campaignId = sanitizeString(input.campaignId, 128);
    publicPayload.campaignId = sanitizeString(input.campaignId, 128);
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'smartLinks', linkId), linkPayload);
    batch.set(doc(db, 'publicLinks', shortCode), publicPayload);
    await batch.commit();
    return linkId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `smartLinks/${linkId}`);
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

export async function updateSmartLinkStatusDoc(
  linkId: string,
  shortCode: string,
  status: FirestoreSmartLink['status']
): Promise<void> {
  assertSignedInUid();
  const docPath = `smartLinks/${linkId}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'smartLinks', linkId), {
      status,
      updatedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'publicLinks', shortCode), {
      status,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}

export async function deleteSmartLinkDoc(linkId: string, shortCode?: string): Promise<void> {
  assertSignedInUid();
  const docPath = `smartLinks/${linkId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'smartLinks', linkId));
    if (shortCode) {
      batch.delete(doc(db, 'publicLinks', shortCode));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function ensureFirestoreUserProfile(): Promise<void> {
  if (!auth.currentUser) return;
  await syncUserProfile(auth.currentUser);
}

export async function createCampaignDoc(input: {
  campaignName: string;
  description?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}): Promise<string> {
  const uid = assertSignedInUid();
  const id = makeDocId();
  const docPath = `campaigns/${id}`;
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
    await setDoc(doc(db, 'campaigns', id), payload);
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, docPath);
  }
}

export async function updateCampaignNameDoc(campaignId: string, campaignName: string): Promise<void> {
  assertSignedInUid();
  const docPath = `campaigns/${campaignId}`;
  try {
    await updateDoc(doc(db, 'campaigns', campaignId), {
      campaignName: sanitizeString(campaignName, 120),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, docPath);
  }
}
