import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/util.js';

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'not_found', 'Not found.'));

/** Central error handler: generic messages to clients, details only in server logs. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const isAdmin = req.path.startsWith('/admin/');
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'invalid_request', message: 'The request was not valid.', ...(isAdmin ? { issues: err.issues.slice(0, 20) } : {}) });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.code, message: err.message, ...(err.details && isAdmin ? { details: err.details } : {}) });
    return;
  }
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(`[${req.requestId}]`, err);
  res.status(status).json({ error: status === 500 ? 'server_error' : 'bad_request', message: status === 500 ? 'Something went wrong.' : 'Bad request.' });
};
