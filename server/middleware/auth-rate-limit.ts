/**
 * Rate limiting for authentication endpoints. These are the first thing an
 * attacker brute-forces, and until now had no throttling at all — any
 * number of login/reset attempts per second was accepted.
 */
import rateLimit from 'express-rate-limit';

const jsonRateLimitHandler = (req: any, res: any) => {
  res.status(429).json({
    message: 'Too many attempts. Please wait a few minutes and try again.',
  });
};

/** Login: generous enough for a real user mistyping a password a few times. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
  // Authenticated super admins are not the ones being brute-forced; keep
  // this limiter focused on the anonymous login attempt itself.
  skipSuccessfulRequests: true,
});

/** Password reset request/confirm: tighter, these are lower-frequency legitimate actions. */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonRateLimitHandler,
});
