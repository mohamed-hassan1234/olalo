'use client';
import { useState } from 'react';
import { feedbackSchema, type FeedbackAnswer, type SiteContent } from '@lattice/shared';
import { useT } from '@/lib/content';
import { API_URL } from '@/lib/env';
import { useStore } from '@/lib/store';
import { Button, cx, Hud } from './ui';

/** Three explored points drawn as a small constellation in the three world colours. */
function Constellation() {
  return (
    <svg width="132" height="104" viewBox="0 0 132 104" aria-hidden="true" className="anim-pop">
      <g stroke="#7FB8FF" strokeWidth="1.4" strokeOpacity="0.55" fill="none">
        <path d="M66 12 L18 88 L114 88 Z" strokeDasharray="200" strokeDashoffset="0" className="draw" />
      </g>
      <circle cx="66" cy="62" r="5" fill="#F2F6FF" />
      <g stroke="#F2F6FF" strokeWidth="1.2" strokeOpacity="0.7">
        <line x1="66" y1="62" x2="66" y2="12" />
        <line x1="66" y1="62" x2="18" y2="88" />
        <line x1="66" y1="62" x2="114" y2="88" />
      </g>
      <circle cx="66" cy="12" r="8" fill="#2E8BFF" />
      <circle cx="18" cy="88" r="8" fill="#19D49A" />
      <circle cx="114" cy="88" r="8" fill="#F4D58D" />
      <circle cx="66" cy="12" r="14" fill="#2E8BFF" opacity="0.25" />
      <circle cx="18" cy="88" r="14" fill="#19D49A" opacity="0.25" />
      <circle cx="114" cy="88" r="14" fill="#F4D58D" opacity="0.25" />
    </svg>
  );
}

/** Shown once, after three content points have been read: a calm reward step with one clear call to action. */
export function VoteCta({ content }: { content: SiteContent }) {
  const { t } = useT();
  const setCta = useStore((s) => s.setCta);
  const read = useStore((s) => s.readItems.length);
  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(10,18,48,0.88),rgba(5,7,13,0.96))] p-6 anim-fade" role="dialog" aria-modal="true" aria-labelledby="vote-title" data-testid="vote-cta">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <Constellation />
        <Hud className="text-primary-soft">
          {read} {t('explored')} · {content.candidate.name}
        </Hud>
        <h2 id="vote-title" className="anim-rise font-display text-[40px] leading-[44px] font-semibold tracking-tight sm:text-[52px] sm:leading-[56px]">
          {t('voteTitle')}
        </h2>
        <p className="anim-rise max-w-sm text-[17px] leading-[26px] text-ink-2">{t('voteLine')}</p>
        <div className="mt-2 flex w-full flex-col gap-2 sm:w-auto sm:min-w-72">
          <Button size="lg" onClick={() => setCta('feedback')} data-testid="vote-continue">
            {t('voteContinue')}
          </Button>
          <Button variant="quiet" onClick={() => setCta('done')} data-testid="vote-dismiss">
            {t('keepExploring')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem('lattice.fb');
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 24);
      sessionStorage.setItem('lattice.fb', id);
    }
    return id;
  } catch {
    return 'anonymous-session-' + Math.random().toString(36).slice(2, 10);
  }
}

/** The final, optional step: one clarity question, three answers, an optional note. Not a vote, not linked to anyone. */
export function FeedbackScreen({ content }: { content: SiteContent }) {
  const { t, l, lang } = useT();
  const setCta = useStore((s) => s.setCta);
  const setFeedback = useStore((s) => s.setFeedback);
  const quality = useStore((s) => s.quality);
  const [answer, setAnswer] = useState<FeedbackAnswer | null>(null);
  const [comment, setComment] = useState('');
  const [hp, setHp] = useState('');
  const [state, setState] = useState<'ask' | 'sending' | 'done' | 'error'>('ask');

  const close = () => setCta('done');
  const send = async () => {
    if (!answer) return;
    setState('sending');
    const body = { answer, lang, profile: quality, session: sessionId(), ...(comment.trim() ? { comment: comment.trim() } : {}), ...(hp ? { website: hp } : {}) };
    const parsed = feedbackSchema.safeParse(body);
    if (!parsed.success || !API_URL) {
      setState(API_URL ? 'error' : 'done');
      return;
    }
    try {
      const r = await fetch(`${API_URL}/v1/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      if (r.ok || r.status === 409) {
        setState('done');
        setFeedback('done');
      } else setState('error');
    } catch {
      setState('error');
    }
  };

  const options: [FeedbackAnswer, string][] = [
    ['haa', t('feedbackHaa')],
    ['qayb', t('feedbackQayb')],
    ['maya', t('feedbackMaya')],
  ];

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-[rgba(5,7,13,0.9)] p-4 anim-fade" role="dialog" aria-modal="true" aria-label={t('feedbackQuestion')} data-testid="feedback">
      <div className="glass anim-pop flex w-full max-w-md flex-col gap-4 rounded-2xl p-6">
        {state === 'done' ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <svg width="56" height="56" viewBox="0 0 40 40" aria-hidden="true">
              <circle cx="20" cy="20" r="18" fill="none" stroke="#19D49A" strokeWidth="2" />
              <polyline points="12,20 18,26 28,14" fill="none" stroke="#19D49A" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="font-display text-[26px] font-semibold">{t('thanks')}</h2>
            <p className="text-[14px] text-ink-2">{t('thanksBody')}</p>
            <Button className="mt-2 w-full" onClick={close}>
              {lang === 'so' ? 'Ku noqo khibradda' : 'Back to the experience'}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Hud className="text-primary-soft">{lang === 'so' ? 'TALLAABADA U DAMBEYSA · IKHTIYAARI' : 'FINAL STEP · OPTIONAL'}</Hud>
              <button type="button" className="min-h-11 px-2 text-[14px] text-ink-2" onClick={close}>
                {t('notNow')}
              </button>
            </div>
            <h2 className="font-display text-[24px] leading-[30px] font-semibold">{t('feedbackQuestion')}</h2>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('feedbackQuestion')}>
              {options.map(([a, label]) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={answer === a}
                  onClick={() => setAnswer(a)}
                  data-testid={`fb-${a}`}
                  className={cx(
                    'flex h-16 flex-col items-center justify-center rounded-xl border text-[16px] font-semibold transition',
                    answer === a ? 'border-white bg-primary-strong text-white shadow-[0_0_20px_rgba(46,139,255,0.45)]' : 'border-[rgba(127,184,255,0.4)] bg-raised hover:border-primary-soft',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
              {t('feedbackComment')}
              <textarea
                rows={2}
                maxLength={280}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="resize-none rounded-lg border border-line bg-navy p-2.5 text-[15px] text-ink"
              />
            </label>
            <label className="sr-only" aria-hidden="true">
              Website
              <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
            </label>
            <p className="text-[12px] text-ink-2">{l(content.disclosure.feedbackNotVote)}</p>
            {state === 'error' && <p className="text-[13px] text-error">{t('sendFailed')}</p>}
            <Button size="lg" disabled={!answer || state === 'sending'} onClick={send} data-testid="fb-send">
              {t('feedbackSend')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
