# SmartLink Firestore Security Specification

## 1. Data Invariants

1. **Default Deny**: Any path not explicitly matched under `/users/{userId}`, `/smartLinks/{linkId}`, `/campaigns/{campaignId}`, or `/admins/{adminId}` is denied for all read/write operations.
2. **Verified Identity Required**: Standard client writes require an authenticated user with `request.auth.token.email_verified == true`.
3. **PII Isolation**: `/users/{userId}` contains email addresses and can only be read by the document owner (`request.auth.uid == userId`) or a verified administrator. Non-owners cannot `get` or `list` other users' profiles.
4. **No Self-Privilege Escalation**: Users creating `/users/{userId}` may only set `role == 'user'` and `status == 'active'`, and may never mutate `role` or `status` on update.
5. **Ownership & Reference Integrity**: Every document in `/smartLinks/{linkId}` and `/campaigns/{campaignId}` must set `ownerId == request.auth.uid` on create and preserve `ownerId` and `createdAt` immutably on update. If a smart link references a non-empty `campaignId`, that campaign must exist and belong to `request.auth.uid`.
6. **Temporal Integrity**: `createdAt == request.time` on create; `updatedAt == request.time` on create and update.
7. **Strict HTTPS & Size Limits**: Every string field enforces `.size()` limits, IDs match `^[a-zA-Z0-9_\-]+$`, and `originalUrl` must start with `https://`.
8. **Terminal State Locking**: Once a smart link or campaign reaches `status == 'archived'`, non-admin updates are blocked.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Class | Target Collection | Malicious Payload / Operation | Expected Result |
|---|---|---|---|---|
| 1 | Shadow Field Injection | `/smartLinks/link_1` | Valid create payload + `isVerified: true` | `PERMISSION_DENIED` |
| 2 | Identity Spoofing | `/smartLinks/link_2` | Create with `ownerId: "victim_uid"` while signed in as `attacker_uid` | `PERMISSION_DENIED` |
| 3 | Unverified Admin Email Spoof | `/admins/attacker_uid` | Signed in with `email: "amitbaskey99@gmail.com"`, `email_verified: false` | `PERMISSION_DENIED` |
| 4 | PII Blanket Read | `/users/victim_uid` | `get` request as authenticated `attacker_uid` | `PERMISSION_DENIED` |
| 5 | Self-Assigned Admin Role | `/users/attacker_uid` | Create profile with `role: "super_admin"` | `PERMISSION_DENIED` |
| 6 | Privilege Escalation on Update | `/users/attacker_uid` | Update own profile changing `role: "admin"` | `PERMISSION_DENIED` |
| 7 | Unsafe Protocol Injection | `/smartLinks/link_xss` | Create with `originalUrl: "javascript:alert(1)"` | `PERMISSION_DENIED` |
| 8 | Resource Poisoning (ID) | `/smartLinks/<200-char-id>` | Create with 200-char junk document ID | `PERMISSION_DENIED` |
| 9 | Value Poisoning (Oversized String) | `/smartLinks/link_big` | Update `linkName` to a 500-char string (`maxLength: 120`) | `PERMISSION_DENIED` |
| 10 | Immutable Field Tampering | `/smartLinks/link_1` | Update attempting to modify `createdAt` or `ownerId` | `PERMISSION_DENIED` |
| 11 | Orphaned Campaign Reference | `/smartLinks/link_orphan` | Create with `campaignId: "nonexistent_camp"` | `PERMISSION_DENIED` |
| 12 | Terminal State Bypass | `/campaigns/camp_arch` | Non-admin update on campaign where `existing().status == 'archived'` | `PERMISSION_DENIED` |
