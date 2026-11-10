import { describe, expect, it } from 'vitest';
import {
  contentSchema,
  defaultContent,
  eventBatchSchema,
  feedbackSchema,
  hasBlockingIssues,
  loadBucketIndex,
  percentileFromHistogram,
  scrubComment,
  validateContentRules,
  verifiedFacts,
  type SiteContent,
} from './index.js';

const clone = (c: SiteContent): SiteContent => structuredClone(c);

describe('event schema', () => {
  it('accepts a valid anonymous batch', () => {
    const r = eventBatchSchema.safeParse({
      v: 1,
      events: [{ type: 'page_view', t: 1, deviceClass: 'mobile', profile: 'balanced', lang: 'so', newToday: true }],
    });
    expect(r.success).toBe(true);
  });
  it('rejects unknown event types and unknown fields (no smuggled identifiers)', () => {
    expect(eventBatchSchema.safeParse({ v: 1, events: [{ type: 'vote', t: 1, deviceClass: 'mobile', profile: 'lite', lang: 'en' }] }).success).toBe(false);
    expect(
      eventBatchSchema.safeParse({ v: 1, events: [{ type: 'page_view', t: 1, deviceClass: 'mobile', profile: 'lite', lang: 'en', userId: 'abc' }] }).success,
    ).toBe(false);
  });
  it('caps batch size at 50', () => {
    const e = { type: 'page_view', t: 1, deviceClass: 'mobile', profile: 'lite', lang: 'en' };
    expect(eventBatchSchema.safeParse({ v: 1, events: Array(51).fill(e) }).success).toBe(false);
  });
});

describe('histograms', () => {
  it('buckets and computes an approximate p75', () => {
    expect(loadBucketIndex(400)).toBe(0);
    expect(loadBucketIndex(2400)).toBe(4);
    expect(loadBucketIndex(99999)).toBe(9);
    const counts = [0, 0, 1, 1, 1, 1, 0, 0, 0, 0];
    expect(percentileFromHistogram(counts, 0.75)).toBe(2500);
    expect(percentileFromHistogram([0, 0], 0.75)).toBeNull();
  });
});

describe('feedback', () => {
  it('requires an answer and an empty honeypot', () => {
    const ok = { answer: 'haa', lang: 'so', profile: 'balanced', session: 'abcdefghijklmnop' };
    expect(feedbackSchema.safeParse(ok).success).toBe(true);
    expect(feedbackSchema.safeParse({ ...ok, website: 'spam' }).success).toBe(false);
    expect(feedbackSchema.safeParse({ ...ok, answer: 'yes' }).success).toBe(false);
  });
  it('scrubs contact details and configured names from comments', () => {
    const out = scrubComment('Call me +252 61 234 5678 or a@b.so, see https://x.y — Ahmed said hi', ['Ahmed']);
    expect(out).not.toMatch(/234/);
    expect(out).not.toMatch(/a@b\.so/);
    expect(out).not.toMatch(/https/);
    expect(out).not.toMatch(/Ahmed/);
  });
});

describe('content rules', () => {
  it('default content parses and has no blocking issues, only placeholder warnings', () => {
    expect(contentSchema.safeParse(defaultContent).success).toBe(true);
    const issues = validateContentRules(defaultContent, { postElectionMode: false });
    expect(hasBlockingIssues(issues)).toBe(false);
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
  });
  it('blocks completed/in-progress statuses before post-election mode', () => {
    const c = clone(defaultContent);
    c.milestones[0]!.status = 'completed';
    c.milestones[0]!.completedAt = '2026-01-01';
    c.milestones[0]!.evidenceUrl = 'https://example.org/evidence';
    expect(hasBlockingIssues(validateContentRules(c, { postElectionMode: false }))).toBe(true);
    expect(hasBlockingIssues(validateContentRules(c, { postElectionMode: true }))).toBe(false);
  });
  it('requires evidence for completed work and an approver for approval items', () => {
    const c = clone(defaultContent);
    c.milestones[1]!.status = 'completed';
    const msgs = validateContentRules(c, { postElectionMode: true }).map((i) => i.message);
    expect(msgs.some((m) => m.includes('evidenceUrl'))).toBe(true);
    const d = clone(defaultContent);
    delete d.milestones[0]!.approvalBody;
    expect(hasBlockingIssues(validateContentRules(d, { postElectionMode: false }))).toBe(true);
  });
  it('refuses a verified fact without source and verifier, and never exposes unverified facts', () => {
    const c = clone(defaultContent);
    c.candidate.sections.biography[0]!.verified = true;
    expect(hasBlockingIssues(validateContentRules(c, { postElectionMode: false }))).toBe(true);
    expect(verifiedFacts(defaultContent.candidate.sections.biography)).toHaveLength(0);
  });
  it('cannot approve launch while placeholders remain', () => {
    const c = clone(defaultContent);
    c.launch.status = 'approved';
    expect(hasBlockingIssues(validateContentRules(c, { postElectionMode: false }))).toBe(true);
  });
});
