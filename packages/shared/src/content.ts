import { z } from 'zod';
import { WORLD_IDS } from './events.js';

/** A string in both supported languages. Somali is the primary UI language. */
export const localized = z.object({ so: z.string().max(4000), en: z.string().max(4000) }).strict();
export type Localized = z.infer<typeof localized>;

export const MILESTONE_STATUSES = ['proposed', 'requires_approval', 'in_progress', 'completed', 'not_pursued'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
/** Before the election only these may be published (proposal ch. 13). */
export const PRE_ELECTION_STATUSES: readonly MilestoneStatus[] = ['proposed', 'requires_approval'];

const id = z.string().regex(/^[a-z0-9-]{1,40}$/);
const httpsUrl = z.string().url().refine((u) => u.startsWith('https://') || u.startsWith('/'), 'must be https or site-relative');

/** A candidate-specific factual claim. Only shown as fact when verified with a source and a verifier. */
export const factSchema = z
  .object({
    text: localized,
    verified: z.boolean(),
    source: z.string().max(300).optional(),
    verifiedBy: z.string().max(120).optional(),
  })
  .strict();
export type Fact = z.infer<typeof factSchema>;

export const stationSchema = z
  .object({
    id,
    name: localized,
    subtitle: localized,
    body: localized,
    placeholder: z.boolean(),
  })
  .strict();
export type Station = z.infer<typeof stationSchema>;

export const worldSchema = z
  .object({
    id: z.enum(WORLD_IDS),
    name: z.string().max(40),
    theme: localized,
    tagline: localized,
    stations: z.array(stationSchema).min(1).max(8),
  })
  .strict();
export type World = z.infer<typeof worldSchema>;

export const milestoneSchema = z
  .object({
    id,
    order: z.number().int().min(0).max(999),
    world: z.enum(WORLD_IDS),
    station: id,
    title: localized,
    /** One short sentence shown on mission cards. */
    summary: localized.optional(),
    objective: localized,
    activity: localized,
    responsible: localized,
    dependencies: z.array(localized).max(10),
    timeline: localized,
    outcome: localized,
    status: z.enum(MILESTONE_STATUSES),
    approvalBody: localized.optional(),
    startedAt: z.string().date().optional(),
    completedAt: z.string().date().optional(),
    evidenceUrl: httpsUrl.optional(),
    reason: localized.optional(),
    placeholder: z.boolean(),
  })
  .strict();
export type Milestone = z.infer<typeof milestoneSchema>;

export const contentSchema = z
  .object({
    schemaVersion: z.literal(1),
    candidate: z
      .object({
        name: z.string().max(120),
        roleLine: localized,
        photo: z
          .object({ url: httpsUrl.optional(), approved: z.boolean(), alt: localized })
          .strict(),
        sections: z
          .object({
            biography: z.array(factSchema).max(10),
            academics: z.array(factSchema).max(20),
            experience: z.array(factSchema).max(20),
            philosophy: z.array(factSchema).max(10),
            activities: z.array(factSchema).max(30),
          })
          .strict(),
      })
      .strict(),
    worlds: z.array(worldSchema).length(3),
    milestones: z.array(milestoneSchema).max(60),
    manifesto: z.object({ available: z.boolean(), url: httpsUrl.optional(), sizeLabel: z.string().max(20).optional() }).strict(),
    faq: z.array(z.object({ q: localized, a: localized }).strict()).max(30),
    disclosure: z
      .object({
        notOfficial: localized,
        fictionalEnvironments: localized,
        feedbackNotVote: localized,
        privacy: z.array(localized).max(12),
        correctionsContact: z.string().max(200),
      })
      .strict(),
    launch: z
      .object({
        status: z.enum(['blocked', 'approved']),
        blockers: z.array(localized).max(20),
      })
      .strict(),
  })
  .strict();
export type SiteContent = z.infer<typeof contentSchema>;

export interface ContentIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Honesty and verification rules that the schema alone cannot express.
 * Errors block publishing; warnings are shown to editors.
 */
export function validateContentRules(content: SiteContent, opts: { postElectionMode: boolean }): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message, severity: 'error' });
  const warn = (path: string, message: string) => issues.push({ path, message, severity: 'warning' });

  const ids = new Set<string>();
  content.milestones.forEach((m, i) => {
    const p = `milestones[${i}]`;
    if (ids.has(m.id)) err(p, `duplicate milestone id "${m.id}"`);
    ids.add(m.id);
    if (!opts.postElectionMode && !PRE_ELECTION_STATUSES.includes(m.status)) {
      err(p, `status "${m.status}" is not allowed before post-election mode is unlocked`);
    }
    if (m.status === 'requires_approval' && !m.approvalBody) err(p, 'requires_approval needs approvalBody (who must approve)');
    if (m.status === 'in_progress' && !m.startedAt) err(p, 'in_progress needs startedAt');
    if (m.status === 'completed' && (!m.completedAt || !m.evidenceUrl)) err(p, 'completed needs completedAt and evidenceUrl');
    if (m.status === 'not_pursued' && !m.reason) err(p, 'not_pursued needs a public reason');
    const world = content.worlds.find((w) => w.id === m.world);
    if (world && !world.stations.some((s) => s.id === m.station)) err(p, `station "${m.station}" does not exist in ${m.world}`);
    if (m.placeholder) warn(p, 'placeholder milestone (not verified)');
  });

  const sections = content.candidate.sections;
  (Object.keys(sections) as (keyof typeof sections)[]).forEach((key) => {
    sections[key].forEach((f, i) => {
      const p = `candidate.sections.${key}[${i}]`;
      if (f.verified && (!f.source || !f.verifiedBy)) err(p, 'a verified fact needs both source and verifiedBy');
      if (!f.verified) warn(p, 'unverified fact: shown only as a labelled placeholder');
    });
  });

  const photo = content.candidate.photo;
  if (photo.approved && !photo.url) err('candidate.photo', 'approved photo needs a url');
  if (content.manifesto.available && !content.manifesto.url) err('manifesto', 'available manifesto needs a url');

  content.worlds.forEach((w, wi) =>
    w.stations.forEach((s, si) => {
      if (s.placeholder) warn(`worlds[${wi}].stations[${si}]`, 'placeholder station text');
    }),
  );

  if (content.launch.status === 'approved') {
    const placeholders = issues.filter((x) => x.severity === 'warning').length;
    if (placeholders > 0) err('launch', `launch cannot be approved while ${placeholders} placeholder or unverified items remain`);
    if (!photo.approved) err('launch', 'launch cannot be approved without an approved candidate photo');
  }
  return issues;
}

export function hasBlockingIssues(issues: ContentIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}

/** Facts a public page may present as fact. Unverified items are rendered only as placeholders. */
export function verifiedFacts(facts: readonly Fact[]): Fact[] {
  return facts.filter((f) => f.verified && !!f.source && !!f.verifiedBy);
}
