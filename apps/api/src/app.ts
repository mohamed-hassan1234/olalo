import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Config } from './config.js';
import type { Database } from './db.js';
import { loadSession, requireCsrf } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { adminRouter } from './routes/admin.js';
import { adminAuthRouter } from './routes/adminAuth.js';
import { publicRouter } from './routes/public.js';

/** Builds the Express app. Public and admin surfaces have separate CORS policies, body limits and auth. */
export function createApp(d: Database, cfg: Config): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', cfg.trustProxy);
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set('X-Request-Id', req.requestId);
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: cfg.cookieSecure ? { maxAge: 15_552_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Public surface: anonymous, write-only (plus the published content snapshot). No cookies.
  const publicCors = cors({ origin: cfg.publicOrigins, methods: ['GET', 'POST'], credentials: false, maxAge: 600 });
  app.use('/v1', publicCors, express.json({ limit: '64kb', type: ['application/json', 'text/plain'] }), publicRouter(d, cfg));

  // Admin surface: separate origin, credentialed CORS, cookie session, CSRF.
  const adminCors = cors({ origin: cfg.adminOrigin, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] });
  app.use(
    '/admin/v1',
    adminCors,
    (_req, res, next) => {
      res.set('Cache-Control', 'no-store');
      next();
    },
    cookieParser(),
    express.json({ limit: '512kb' }),
    loadSession(d),
    requireCsrf(cfg),
  );
  app.use('/admin/v1/auth', adminAuthRouter(d, cfg));
  app.use('/admin/v1', adminRouter(d, cfg));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
