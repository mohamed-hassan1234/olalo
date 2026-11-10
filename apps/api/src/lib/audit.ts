import type { Request } from 'express';
import type { Database } from '../db.js';
import { ipPrefix } from './util.js';

/** Append-only audit entry. There is no API to edit or delete audit records. */
export async function audit(d: Database, req: Request, action: string, target?: string, summary?: string): Promise<void> {
  const user = req.admin?.user;
  await d.c.audit.insertOne({
    ts: new Date(),
    ...(user?._id ? { actorId: user._id, actorEmail: user.email } : {}),
    action,
    ...(target ? { target } : {}),
    ...(summary ? { summary: summary.slice(0, 500) } : {}),
    requestId: req.requestId,
    ipPrefix: ipPrefix(req.ip),
  });
}
