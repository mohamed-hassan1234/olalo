import { z } from 'zod';
import { LANGS, QUALITY_PROFILES } from './events.js';

export const FEEDBACK_ANSWERS = ['haa', 'qayb', 'maya'] as const;
export type FeedbackAnswer = (typeof FEEDBACK_ANSWERS)[number];

export const FEEDBACK_COMMENT_MAX = 280;

export const feedbackSchema = z
  .object({
    answer: z.enum(FEEDBACK_ANSWERS),
    comment: z.string().max(FEEDBACK_COMMENT_MAX).optional(),
    lang: z.enum(LANGS),
    profile: z.enum(QUALITY_PROFILES),
    /** Random per-tab id used only to refuse a second answer in the same session. Never stored. */
    session: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    /** Honeypot: must be empty. Bots fill every field. */
    website: z.string().max(0).optional(),
  })
  .strict();
export type FeedbackInput = z.infer<typeof feedbackSchema>;

const PHONE = /(?:\+?\d[\d\s().-]{6,}\d)/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL = /\bhttps?:\/\/\S+/gi;

/**
 * Masks phone numbers, emails, links and any configured names in a free-text comment
 * before it is stored (proposal ch. 20, comment scrubbing).
 */
export function scrubComment(text: string, blockedNames: readonly string[] = []): string {
  // eslint-disable-next-line no-control-regex -- intentionally strips control characters from user input
  let out = text.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
  out = out.replace(EMAIL, '[email removed]').replace(URL, '[link removed]').replace(PHONE, '[number removed]');
  for (const name of blockedNames) {
    const n = name.trim();
    if (n.length < 2) continue;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[name removed]');
  }
  return out.slice(0, FEEDBACK_COMMENT_MAX);
}
