import type { NextFunction, Request, Response } from 'express';

import { ForbiddenError, UnauthorizedError } from '../lib/errors.ts';
import { profileModel } from '../models/profile.model.ts';
import { requireAuth } from './require-auth.ts';

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // If not already authenticated by requireAuth, run requireAuth first
  if (!req.user) {
    return requireAuth(req, res, async (err) => {
      if (err) return next(err);
      return checkAdminRole(req, next);
    });
  }

  await checkAdminRole(req, next);
}

async function checkAdminRole(req: Request, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Role is read from the live database on every request
    const profile = await profileModel.findProfileById(req.user.id);

    if (!profile || profile.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }

    req.user.role = profile.role;
    next();
  } catch (error) {
    next(error);
  }
}
