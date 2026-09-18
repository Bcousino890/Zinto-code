import { randomBytes, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import 'express-session';

declare module 'express-session' {
  interface SessionData {
    csrfToken?: string;
  }
}

function header(req: Request, name: string): string | undefined {
  const value = req.get(name);
  return value?.trim() || undefined;
}

function requestOrigin(req: Request): string {
  return `${req.protocol}://${header(req, 'host')}`;
}

function hasSameOrigin(request: Request): boolean {
  const expected = requestOrigin(request);
  const origin = header(request, 'origin');
  const referer = header(request, 'referer');

  if (!origin && !referer) return false;
  if (origin && origin !== expected) return false;

  if (referer) {
    try {
      if (new URL(referer).origin !== expected) return false;
    } catch {
      return false;
    }
  }

  return true;
}

function sameToken(expected: string, supplied: string | undefined): boolean {
  if (!supplied) return false;
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function issueSessionCsrfToken(req: Request): string {
  const session = req.session;
  if (!session) throw new Error('CSRF protection requires a session');

  const current = session.csrfToken;
  if (typeof current === 'string' && current.length > 0) return current;

  const token = randomBytes(32).toString('base64url');
  session.csrfToken = token;
  return token;
}

export function requireSessionCsrf(req: Request, res: Response, next: NextFunction) {
  const session = req.session;
  const token = session?.csrfToken;

  if (!token || !hasSameOrigin(req) || !sameToken(token, header(req, 'x-csrf-token'))) {
    return res.status(403).json({ message: 'CSRF validation failed' });
  }

  return next();
}
