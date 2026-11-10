import type { Database } from '../db.js';
import { getSettings } from '../db.js';

/**
 * Retention beyond TTL indexes: daily totals past their period are deleted and
 * feedback comments are removed after their period (answers are kept as counts).
 */
export async function runRetention(d: Database, now = new Date()): Promise<{ dailyDeleted: number; commentsRemoved: number }> {
  const s = await getSettings(d);
  const cutoff = new Date(now.getTime() - s.dailyRetentionDays * 86_400_000);
  const dailyDeleted = (await d.c.daily.deleteMany({ bucketStart: { $lt: cutoff } })).deletedCount;
  const commentsRemoved = (
    await d.c.feedback.updateMany({ commentExpiresAt: { $lt: now } }, { $unset: { comment: '', commentExpiresAt: '' } })
  ).modifiedCount;
  return { dailyDeleted, commentsRemoved };
}
