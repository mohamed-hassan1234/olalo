'use client';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { MilestoneStatus } from '@lattice/shared';
import { useT } from '@/lib/content';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet'; size?: 'lg' | 'md' };

export function Button({ variant = 'primary', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[transform,background,box-shadow] duration-150 ease-(--ease-ui) active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40',
        size === 'lg' ? 'h-14 px-5 font-display text-[17px] font-semibold tracking-wide' : 'h-12 px-4 text-[15px]',
        variant === 'primary' && 'bg-primary-strong text-white shadow-[0_0_0_1px_#7FB8FF,0_0_22px_rgba(46,139,255,0.35)] hover:bg-[#2A7AEB]',
        variant === 'ghost' && 'border border-[rgba(127,184,255,0.4)] bg-transparent text-ink hover:border-primary-soft hover:shadow-[0_0_12px_rgba(127,184,255,0.3)]',
        variant === 'quiet' && 'bg-transparent text-ink-2 hover:text-ink',
        className,
      )}
    />
  );
}

export function IconButton({ label, children, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...p}
      className={cx(
        'inline-flex h-11 w-11 items-center justify-center rounded-full border border-[rgba(127,184,255,0.35)] bg-[rgba(15,27,58,0.75)] text-ink transition hover:border-primary-soft active:scale-95',
        className,
      )}
    >
      {children}
    </button>
  );
}

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
export const Icon = {
  soundOff: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  ),
  soundOn: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  gear: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  ),
  info: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="11" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
  menu: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  ),
  close: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  ),
  left: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  ),
  right: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  arrow: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  ),
  skip: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  ),
  list: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" />
      <circle cx="4.5" cy="12" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </svg>
  ),
  doc: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  link: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" {...S}>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  ),
};

/** Status is always shape + word + colour, never colour alone (ch. 13). */
export function StatusGlyph({ status, size = 16 }: { status: MilestoneStatus; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      {status === 'proposed' && <circle cx="8" cy="8" r="6" fill="none" stroke="#7FB8FF" strokeWidth="2" strokeDasharray="3 2.4" />}
      {status === 'requires_approval' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="#F2B544" strokeWidth="2" />
          <rect x="6" y="0.5" width="4" height="4" fill="#0F1B3A" />
          <rect x="7" y="1" width="2" height="3" fill="#F2B544" />
        </>
      )}
      {status === 'in_progress' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="#19D49A" strokeWidth="2" />
          <path d="M8 2 A 6 6 0 0 1 8 14 Z" fill="#19D49A" />
        </>
      )}
      {status === 'completed' && (
        <>
          <circle cx="8" cy="8" r="7" fill="#F2F6FF" stroke="#19D49A" strokeWidth="1.5" />
          <polyline points="5,8 7,10 11,6" fill="none" stroke="#05070D" strokeWidth="1.8" />
        </>
      )}
      {status === 'not_pursued' && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="#8A98B0" strokeWidth="2" />
          <line x1="3" y1="13" x2="13" y2="3" stroke="#8A98B0" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}

const STATUS_KEY = {
  proposed: 'statusProposed',
  requires_approval: 'statusRequiresApproval',
  in_progress: 'statusInProgress',
  completed: 'statusCompleted',
  not_pursued: 'statusNotPursued',
} as const;
const STATUS_TEXT = { proposed: 'text-primary-soft', requires_approval: 'text-amber', in_progress: 'text-midnimo-soft', completed: 'text-ink', not_pursued: 'text-ink-2' } as const;

export function StatusBadge({ status, extra }: { status: MilestoneStatus; extra?: string }) {
  const { t } = useT();
  return (
    <span className={cx('inline-flex items-center gap-2 text-[13px] font-semibold', STATUS_TEXT[status])}>
      <StatusGlyph status={status} />
      {t(STATUS_KEY[status])}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}

export function Hud({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('hud', className)}>{children}</span>;
}

export function PlaceholderNote({ children }: { children?: ReactNode }) {
  const { t } = useT();
  return (
    <div className="rounded border border-dashed border-[rgba(242,181,68,0.6)] px-2 py-1.5 font-mono text-[11px] tracking-wide text-amber">
      {children ?? t('sampleContent')}
    </div>
  );
}

/** Bottom sheet on phones, side panel from 1024 px (ch. 15). */
export function Sheet({ label, onClose, children, tall }: { label: string; onClose?: () => void; children: ReactNode; tall?: boolean }) {
  const { t } = useT();
  return (
    <section
      role="dialog"
      aria-label={label}
      className={cx(
        'glass pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col gap-3 overflow-y-auto rounded-t-2xl border-b-0 px-5 pt-2.5 pb-6 anim-rise',
        tall ? 'max-h-[78vh]' : 'max-h-[62vh]',
        'lg:inset-y-24 lg:right-8 lg:left-auto lg:bottom-8 lg:max-h-none lg:w-[420px] lg:rounded-2xl lg:border-b',
      )}
    >
      <div className="mx-auto h-1 w-10 rounded bg-[#6F7E96] lg:hidden" aria-hidden="true" />
      {onClose && (
        <IconButton label={t('close')} onClick={onClose} className="absolute top-3 right-3">
          <Icon.close />
        </IconButton>
      )}
      {children}
    </section>
  );
}
