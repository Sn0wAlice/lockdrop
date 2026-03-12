import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdn.tailwindcss.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "fonts.googleapis.com", "cdn.tailwindcss.com"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
});

export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});

export const sharePasswordRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many password attempts. Please wait a minute.',
  keyGenerator: (req: Request) => {
    return req.ip + ':' + req.params.uuid;
  },
});

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again later.',
});

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const token = req.body?._csrf || req.headers['x-csrf-token'];
  const sessionToken = (req.session as any)?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    console.error('[CSRF FAIL]', {
      path: req.path,
      method: req.method,
      hasSession: !!req.session,
      sessionId: req.sessionID?.slice(0, 8),
      hasCookie: !!req.headers.cookie,
      tokenFromClient: token ? token.slice(0, 8) + '...' : 'MISSING',
      tokenFromSession: sessionToken ? sessionToken.slice(0, 8) + '...' : 'MISSING',
      proto: req.protocol,
      forwarded: req.headers['x-forwarded-proto'],
      secure: req.secure,
    });
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  next();
};

export const generateCsrfToken = (req: Request, _res: Response, next: NextFunction) => {
  if (!(req.session as any).csrfToken) {
    const { v4: uuidv4 } = require('uuid');
    (req.session as any).csrfToken = uuidv4();
    // Force session save so the token is persisted before the response
    return req.session.save((err) => {
      if (err) console.error('Session save error:', err);
      next();
    });
  }
  next();
};
