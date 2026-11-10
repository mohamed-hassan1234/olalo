import type { AdminSessionDoc, AdminUserDoc } from './db.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      admin?: { user: AdminUserDoc; session: AdminSessionDoc };
    }
  }
}

export {};
