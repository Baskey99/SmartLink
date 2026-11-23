import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { upsertProfileFromFirebase } from '../db/repository.ts';
import type { UserRole } from '../db/schema.ts';

export interface UserProfileRecord {
  id: string;
  firebaseUid: string;
  fullName: string;
  email: string;
  role: UserRole;
  status: 'active' | 'inactive';
  avatarUrl: string | null;
  createdAt: Date;
}

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  profile?: UserProfileRecord;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Authentication token is missing.' });
    return;
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUser = decoded;

    const email = decoded.email || `${decoded.uid}@users.smartlink.local`;
    const fullName = decoded.name || email.split('@')[0];

    const profile = await upsertProfileFromFirebase({
      firebaseUid: decoded.uid,
      email,
      fullName,
      avatarUrl: decoded.picture ?? null,
    });

    if (profile.status !== 'active') {
      res.status(403).json({
        error: 'Your account has been deactivated by an administrator.',
      });
      return;
    }

    req.profile = profile;
    next();
  } catch (error) {
    console.error('Authentication verification failed:', error);
    res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.profile) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!allowedRoles.includes(req.profile.role)) {
      res.status(403).json({
        error: 'Insufficient permissions for this action.',
      });
      return;
    }
    next();
  };
};
