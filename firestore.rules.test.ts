/**
 * Firestore Security Rules Specification Tests (Dirty Dozen Adversarial Suite)
 * Run against the Firebase Emulator Suite with @firebase/rules-unit-testing.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  collection: string;
  docId: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Shadow Field Injection on smartLinks create',
    collection: 'smartLinks',
    docId: 'link_shadow_1',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: {
      ownerId: 'user_a',
      linkName: 'Promo',
      shortCode: 'promo1',
      originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      destinationType: 'youtube',
      status: 'active',
      isVerified: true, // Shadow field
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Identity Spoofing on smartLinks create',
    collection: 'smartLinks',
    docId: 'link_spoof_2',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'atk@example.com', email_verified: true },
    payload: {
      ownerId: 'victim_uid',
      linkName: 'Spoofed',
      shortCode: 'spoof2',
      originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      destinationType: 'youtube',
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Unverified Email Admin Spoof',
    collection: 'admins',
    docId: 'attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'amitbaskey99@gmail.com', email_verified: false },
    payload: { uid: 'attacker_uid' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'PII Blanket Read on another user profile',
    collection: 'users',
    docId: 'victim_uid',
    operation: 'get',
    auth: { uid: 'attacker_uid', email: 'atk@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Self-Assigned Super Admin Role on Profile Create',
    collection: 'users',
    docId: 'attacker_uid',
    operation: 'create',
    auth: { uid: 'attacker_uid', email: 'atk@example.com', email_verified: true },
    payload: {
      uid: 'attacker_uid',
      fullName: 'Attacker',
      email: 'atk@example.com',
      role: 'super_admin',
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Role Escalation on Profile Update',
    collection: 'users',
    docId: 'user_a',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { role: 'admin' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Unsafe javascript: URI Scheme Injection',
    collection: 'smartLinks',
    docId: 'link_xss_7',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: {
      ownerId: 'user_a',
      linkName: 'XSS',
      shortCode: 'xss123',
      originalUrl: 'javascript:alert(1)',
      destinationType: 'website',
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Resource Poisoning via Oversized Document ID',
    collection: 'smartLinks',
    docId: 'x'.repeat(200),
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: {
      ownerId: 'user_a',
      linkName: 'Huge ID',
      shortCode: 'hugeid',
      originalUrl: 'https://example.com',
      destinationType: 'website',
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning via Oversized linkName on Update',
    collection: 'smartLinks',
    docId: 'link_valid_1',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { linkName: 'A'.repeat(500) },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable ownerId Tampering on Update',
    collection: 'smartLinks',
    docId: 'link_valid_1',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { ownerId: 'user_b' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Orphaned campaignId Reference on smartLinks Create',
    collection: 'smartLinks',
    docId: 'link_orphan_11',
    operation: 'create',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: {
      ownerId: 'user_a',
      linkName: 'Orphan',
      shortCode: 'orph11',
      originalUrl: 'https://example.com',
      destinationType: 'website',
      campaignId: 'nonexistent_campaign',
      status: 'active',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Terminal State Modification on Archived Campaign',
    collection: 'campaigns',
    docId: 'camp_archived_12',
    operation: 'update',
    auth: { uid: 'user_a', email: 'a@example.com', email_verified: true },
    payload: { status: 'active' },
    expected: 'PERMISSION_DENIED',
  },
];
